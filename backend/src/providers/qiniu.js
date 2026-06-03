const http = require('http');
const https = require('https');

const SUBMIT_TIMEOUT_MS = 60 * 60 * 1000;

const QINIU_DOC_PRESETS_BY_RES = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '2K': {
    '1:1': '2048x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '4K': {
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
};

const QINIU_RES_TO_TARGET_PIXELS = { '1K': 1048576, '2K': 4194304, '4K': 8294400 };

function alignTo16(n) {
  const v = Math.round(n / 16) * 16;
  return Math.max(64, v);
}

function computeQiniuSize(w, h, targetPixels) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'auto';
  const target = Math.min(targetPixels, 8294400);
  const scale = Math.sqrt(target / (w * h));
  let pw = alignTo16(w * scale);
  let ph = alignTo16(h * scale);
  const longest = Math.max(pw, ph);
  if (longest > 3840) {
    const s = 3840 / longest;
    pw = alignTo16(pw * s);
    ph = alignTo16(ph * s);
  }
  if (pw * ph > 8294400) {
    const s = Math.sqrt(8294400 / (pw * ph));
    pw = alignTo16(pw * s);
    ph = alignTo16(ph * s);
  }
  return `${pw}x${ph}`;
}

function ratioToQiniuSize(ratio, resolution = '1K') {
  if (!ratio) return 'auto';
  const s = String(ratio).trim();
  if (!s || s.toLowerCase() === 'auto') return 'auto';
  if (/^\d+x\d+$/i.test(s)) return s.toLowerCase();
  const res = ['1K', '2K', '4K'].includes(resolution) ? resolution : '1K';
  const presets = QINIU_DOC_PRESETS_BY_RES[res];
  if (presets[s]) return presets[s];
  const m = /^(\d+):(\d+)$/.exec(s);
  if (!m) return 'auto';
  return computeQiniuSize(parseInt(m[1], 10), parseInt(m[2], 10), QINIU_RES_TO_TARGET_PIXELS[res]);
}

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function fetchWithLongTimeout(url, options) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'http:' ? http : https;
    const body = options.body || '';
    const req = client.request(
      target,
      {
        method: options.method || 'POST',
        headers: { ...options.headers, 'Content-Length': Buffer.byteLength(body) },
        timeout: SUBMIT_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('七牛云提交超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function resolveImageRef(ref, options = {}) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref.startsWith('data:')) return ref;
  if (ref.startsWith('http://') || ref.startsWith('https://')) return ref;
  if (ref.startsWith('/files/') && options.baseUrl) {
    const r = await fetch(`${options.baseUrl}${ref}`);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${ct};base64,${buf.toString('base64')}`;
  }
  return null;
}

async function pollTask(taskId, apiKey, baseUrl, maxRetries = 1800, interval = 2000) {
  const url = `${baseUrl}/v1/images/tasks/${encodeURIComponent(taskId)}`;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) continue;
      const data = await r.json().catch(() => null);
      if (!data) continue;
      const status = String(data.status || '').toLowerCase();
      if (['succeed', 'success', 'completed', 'done'].includes(status)) {
        const arr = Array.isArray(data.data) ? data.data : [];
        const urls = [];
        for (const it of arr) {
          if (it?.url) urls.push(it.url);
          else if (it?.b64_json) urls.push(`data:image/png;base64,${it.b64_json}`);
        }
        return urls.length ? urls : null;
      }
      if (['failed', 'failure', 'error'].includes(status)) return null;
    } catch { /* retry */ }
  }
  return null;
}

async function testProvider(provider) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://openai.qiniu.com');
  const apiKey = String(provider?.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, code: 'missing_api_key', providerId: provider?.id, protocol: 'qiniu', error: '请先填写七牛云 API Key。' };
  }
  try {
    const r = await fetch(`${baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    return { ok: r.ok, code: r.ok ? 'ok' : 'auth_failed', providerId: provider?.id, protocol: 'qiniu', error: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, code: 'connection_failed', providerId: provider?.id, protocol: 'qiniu', error: e.message };
  }
}

async function generateImage(provider, input = {}, options = {}) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://openai.qiniu.com');
  const apiKey = String(provider?.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, kind: 'image', code: 'missing_api_key', providerId: provider?.id, protocol: 'qiniu', error: '未配置七牛云 API Key' };
  }

  const model = String(input.providerModel || input.model || 'openai/gpt-image-2').trim();
  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    return { ok: false, kind: 'image', code: 'missing_prompt', providerId: provider?.id, protocol: 'qiniu', error: 'prompt 必填' };
  }

  const params = input.providerParams || {};
  const refs = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  const hasRefs = refs.length > 0;
  const endpoint = `${baseUrl}/v1/images/${hasRefs ? 'edits' : 'generations'}`;
  const isGemini = model === 'gemini-3.1-flash-image-preview';

  const body = { model, prompt };
  if (isGemini) {
    const cfg = {};
    if (params.aspectRatio && params.aspectRatio !== 'auto') cfg.aspect_ratio = params.aspectRatio;
    if (params.resolution) cfg.image_size = params.resolution;
    if (Object.keys(cfg).length) body.image_config = cfg;
  } else {
    // openai/gpt-image-2 子模型：上游需要像素串，前端传比例字符串 + 清晰度档由后端转换
    body.quality = params.quality || 'auto';
    const sizeInput = params.aspectRatio || input.size || 'auto';
    body.size = ratioToQiniuSize(sizeInput, params.resolution || '1K');
  }

  if (hasRefs) {
    const images = [];
    for (const ref of refs) {
      const conv = await resolveImageRef(ref, options);
      if (conv) images.push(conv);
    }
    if (!images.length) {
      return { ok: false, kind: 'image', code: 'ref_convert_failed', providerId: provider?.id, protocol: 'qiniu', error: '参考图全部转换失败' };
    }
    body.image = images;
  }

  try {
    const resp = await fetchWithLongTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    let data;
    try { data = JSON.parse(resp.text); } catch {
      return { ok: false, kind: 'image', code: 'invalid_response', providerId: provider?.id, protocol: 'qiniu', error: '上游响应非 JSON' };
    }
    if (!resp.ok) {
      return { ok: false, kind: 'image', code: 'upstream_error', providerId: provider?.id, protocol: 'qiniu', error: data?.error?.message || `HTTP ${resp.status}` };
    }

    // 同步结果
    const items = Array.isArray(data?.data) ? data.data : [];
    if (items.length && (items[0]?.url || items[0]?.b64_json)) {
      const urls = items.map((it) => it.url || `data:image/png;base64,${it.b64_json}`).filter(Boolean);
      console.log(`[qiniu] 同步返回 ${urls.length} 张图 model=${model} size=${body.size || body.image_config?.image_size || '-'}`);
      return { ok: true, kind: 'image', code: 'ok', providerId: provider?.id, protocol: 'qiniu', imageUrls: urls };
    }

    // 异步任务
    const taskId = data?.task_id || data?.id || (typeof data?.data === 'string' ? data.data : null);
    if (taskId) {
      console.log(`[qiniu] 任务提交成功 id=${taskId} model=${model} 开始轮询...`);
      if (typeof options.onTaskSubmit === 'function') {
        try { options.onTaskSubmit(taskId); } catch { /* noop */ }
      }
      const urls = await pollTask(taskId, apiKey, baseUrl);
      if (!urls) {
        return { ok: false, kind: 'image', code: 'poll_timeout', providerId: provider?.id, protocol: 'qiniu', taskId, error: '任务轮询超时/失败' };
      }
      console.log(`[qiniu] 任务完成 id=${taskId} urls=${urls.length}`);
      return { ok: true, kind: 'image', code: 'ok', providerId: provider?.id, protocol: 'qiniu', imageUrls: urls, taskId };
    }

    return { ok: false, kind: 'image', code: 'no_result', providerId: provider?.id, protocol: 'qiniu', error: '上游未返回图片也未返 task_id' };
  } catch (e) {
    return { ok: false, kind: 'image', code: 'request_failed', providerId: provider?.id, protocol: 'qiniu', error: e.message };
  }
}

module.exports = { testProvider, generateImage };

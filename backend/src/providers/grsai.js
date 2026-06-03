const DOC_PRESETS_BY_RES = {
  '1K': {
    '1:1': '1024x1024', '16:9': '1280x720', '9:16': '720x1280',
    '4:3': '1152x864', '3:4': '864x1152', '3:2': '1536x1024',
    '2:3': '1024x1536', '5:4': '1120x896', '4:5': '896x1120',
    '21:9': '1456x624', '1:3': '688x2048', '3:1': '2048x688',
    '2:1': '1536x768', '1:2': '768x1536',
  },
  '2K': {
    '1:1': '2048x2048', '16:9': '2048x1152', '9:16': '1152x2048',
    '4:3': '2304x1728', '3:4': '1728x2304', '3:2': '2048x1360',
    '2:3': '1360x2048', '5:4': '2240x1792', '4:5': '1792x2240',
    '21:9': '2912x1248', '2:1': '3072x1536', '1:2': '1536x3072',
  },
  '4K': {
    '1:1': '2880x2880', '16:9': '3840x2160', '9:16': '2160x3840',
    '4:3': '3264x2448', '3:4': '2448x3264', '3:2': '3504x2336',
    '2:3': '2336x3504', '5:4': '3200x2560', '4:5': '2560x3200',
    '21:9': '3840x1648', '1:3': '1280x3840', '3:1': '3840x1280',
    '2:1': '3840x1920', '1:2': '1920x3840',
  },
};

function computeVipSize(ratio, targetPixels = 4000000) {
  const [wStr, hStr] = ratio.split(':');
  const w = parseInt(wStr, 10);
  const h = parseInt(hStr, 10);
  if (!w || !h) return null;
  const scale = Math.sqrt(targetPixels / (w * h));
  let pw = Math.round(w * scale);
  let ph = Math.round(h * scale);
  pw = Math.round(pw / 16) * 16;
  ph = Math.round(ph / 16) * 16;
  if (pw > 3840) { pw = 3840; ph = Math.round((pw * h) / w / 16) * 16; }
  if (ph > 3840) { ph = 3840; pw = Math.round((ph * w) / h / 16) * 16; }
  return `${pw}x${ph}`;
}

function isGptImage2VipModel(model) {
  return /^gpt-image-2.*vip$/i.test(String(model || ''));
}

function resolveAspectRatio(ratio, model, resolution) {
  if (!ratio || ratio === 'auto') return undefined;
  // 仅 gpt-image-2-vip 走像素串转换；nano-banana 系列直接透传比例 + 走 imageSize 字段
  if (!isGptImage2VipModel(model)) return ratio;
  // 已经是像素串的旧画布数据，原样返回
  if (/^\d+x\d+$/i.test(ratio)) return ratio.toLowerCase();
  const res = resolution || '1K';
  const preset = DOC_PRESETS_BY_RES[res];
  if (preset && preset[ratio]) return preset[ratio];
  const m = /^(\d+):(\d+)$/.exec(ratio);
  if (!m) return '1024x1024';
  const targets = { '1K': 1048576, '2K': 4194304, '4K': 8294400 };
  return computeVipSize(ratio, targets[res] || 1048576);
}

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
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
  const url = `${baseUrl}/v1/api/result?id=${encodeURIComponent(taskId)}`;
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) continue;
      const data = await r.json().catch(() => null);
      if (!data) continue;
      const status = String(data.status || '').toLowerCase();
      if (['succeeded', 'success', 'completed', 'done'].includes(status)) {
        const arr = Array.isArray(data.results) ? data.results : [];
        const urls = [];
        for (const it of arr) {
          if (it?.url) urls.push(it.url);
          else if (it?.b64_json) urls.push(`data:image/png;base64,${it.b64_json}`);
        }
        return urls.length ? urls : null;
      }
      if (['failed', 'failure', 'error', 'violation'].includes(status)) return null;
    } catch { /* retry */ }
  }
  return null;
}

async function testProvider(provider) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://grsai.dakka.com.cn');
  const apiKey = String(provider?.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, code: 'missing_api_key', providerId: provider?.id, protocol: 'grsai', error: '请先填写 Grsai API Key。' };
  }
  try {
    const r = await fetch(`${baseUrl}/v1/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-image-2', prompt: 'test', replyType: 'json' }),
    });
    const ok = r.status !== 401 && r.status !== 403;
    return { ok, code: ok ? 'ok' : 'auth_failed', providerId: provider?.id, protocol: 'grsai', error: ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, code: 'connection_failed', providerId: provider?.id, protocol: 'grsai', error: e.message };
  }
}

async function generateImage(provider, input = {}, options = {}) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://grsai.dakka.com.cn');
  const apiKey = String(provider?.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, kind: 'image', code: 'missing_api_key', providerId: provider?.id, protocol: 'grsai', error: '未配置 Grsai API Key' };
  }

  const model = String(input.providerModel || input.model || 'gpt-image-2').trim();
  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    return { ok: false, kind: 'image', code: 'missing_prompt', providerId: provider?.id, protocol: 'grsai', error: 'prompt 必填' };
  }

  const params = input.providerParams || {};
  const aspectRatio = resolveAspectRatio(params.aspectRatio, model, params.resolution);
  const isNanoBanana = model.startsWith('nano-banana');

  const body = { model, prompt, replyType: 'async' };
  if (aspectRatio) body.aspectRatio = aspectRatio;
  if (isNanoBanana && params.resolution) body.imageSize = params.resolution;

  const refs = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  if (refs.length > 0) {
    const images = [];
    for (const ref of refs) {
      const conv = await resolveImageRef(ref, options);
      if (conv) images.push(conv);
    }
    if (images.length) body.images = images;
  }

  const endpoint = `${baseUrl}/v1/api/generate`;
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return { ok: false, kind: 'image', code: 'invalid_response', providerId: provider?.id, protocol: 'grsai', error: '上游响应非 JSON' };
    }
    if (!r.ok) {
      return { ok: false, kind: 'image', code: 'upstream_error', providerId: provider?.id, protocol: 'grsai', error: data?.error || `HTTP ${r.status}` };
    }

    const status = String(data?.status || '').toLowerCase();
    const arr = Array.isArray(data?.results) ? data.results : [];
    if (['succeeded', 'success', 'completed', 'done'].includes(status) && arr.length) {
      const urls = arr.map((it) => it.url || (it.b64_json ? `data:image/png;base64,${it.b64_json}` : null)).filter(Boolean);
      return { ok: true, kind: 'image', code: 'ok', providerId: provider?.id, protocol: 'grsai', imageUrls: urls };
    }
    if (['failed', 'failure', 'error', 'violation'].includes(status)) {
      return { ok: false, kind: 'image', code: 'upstream_error', providerId: provider?.id, protocol: 'grsai', error: data?.error || `任务${status}` };
    }

    const taskId = data?.id;
    if (taskId) {
      console.log(`[grsai] 任务提交成功 id=${taskId} model=${model} 开始轮询...`);
      if (typeof options.onTaskSubmit === 'function') {
        try { options.onTaskSubmit(taskId); } catch { /* noop */ }
      }
      const urls = await pollTask(taskId, apiKey, baseUrl);
      if (!urls) {
        return { ok: false, kind: 'image', code: 'poll_timeout', providerId: provider?.id, protocol: 'grsai', taskId, error: '任务轮询超时/失败' };
      }
      console.log(`[grsai] 任务完成 id=${taskId} urls=${urls.length}`);
      return { ok: true, kind: 'image', code: 'ok', providerId: provider?.id, protocol: 'grsai', imageUrls: urls, taskId };
    }

    return { ok: false, kind: 'image', code: 'no_result', providerId: provider?.id, protocol: 'grsai', error: '上游未返回图片也未返 task_id' };
  } catch (e) {
    return { ok: false, kind: 'image', code: 'request_failed', providerId: provider?.id, protocol: 'grsai', error: e.message };
  }
}

module.exports = { testProvider, generateImage };

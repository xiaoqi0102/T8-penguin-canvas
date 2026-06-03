const DOC_PRESETS_BY_RES = {
  '1K': {
    '1:1': '1024x1024', '4:3': '1152x896', '3:4': '896x1152',
    '16:9': '1344x768', '9:16': '768x1344', '3:2': '1216x832',
    '2:3': '832x1216', '21:9': '1536x640', '9:21': '640x1536',
    '4:7': '768x1344', '7:4': '1344x768',
  },
  '2K': {
    '1:1': '2048x2048', '4:3': '2304x1792', '3:4': '1792x2304',
    '16:9': '2688x1536', '9:16': '1536x2688', '3:2': '2432x1664',
    '2:3': '1664x2432', '21:9': '3072x1280', '9:21': '1280x3072',
    '4:7': '1280x2240', '7:4': '2240x1280',
  },
  '4K': {
    '1:1': '3840x3840', '4:3': '3840x2880', '3:4': '2880x3840',
    '16:9': '3840x2160', '9:16': '2160x3840', '3:2': '3840x2560',
    '2:3': '2560x3840', '21:9': '3840x1646', '9:21': '1646x3840',
    '4:7': '2194x3840', '7:4': '3840x2194',
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

function resolveAspectRatio(ratio, model, resolution) {
  if (!ratio || ratio === 'auto') return undefined;
  const isVip = model && (model.includes('vip') || model.includes('4k'));
  if (!isVip) return ratio;
  const res = resolution || '1K';
  const preset = DOC_PRESETS_BY_RES[res];
  if (preset && preset[ratio]) return preset[ratio];
  if (res === '2K') return computeVipSize(ratio, 4000000);
  if (res === '4K') return computeVipSize(ratio, 14745600);
  return computeVipSize(ratio, 1048576);
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
      const urls = await pollTask(taskId, apiKey, baseUrl);
      if (!urls) {
        return { ok: false, kind: 'image', code: 'poll_timeout', providerId: provider?.id, protocol: 'grsai', taskId, error: '任务轮询超时/失败' };
      }
      return { ok: true, kind: 'image', code: 'ok', providerId: provider?.id, protocol: 'grsai', imageUrls: urls, taskId };
    }

    return { ok: false, kind: 'image', code: 'no_result', providerId: provider?.id, protocol: 'grsai', error: '上游未返回图片也未返 task_id' };
  } catch (e) {
    return { ok: false, kind: 'image', code: 'request_failed', providerId: provider?.id, protocol: 'grsai', error: e.message };
  }
}

module.exports = { testProvider, generateImage };

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

// 图像生成上游调用超时：60 分钟（与七牛对齐，应对 gemini-3-pro 高分辨率 4K 长耗时）
const IMAGE_TIMEOUT_MS = 60 * 60 * 1000;
const http = require('http');
const https = require('https');

function fetchWithLongTimeout(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'http:' ? http : https;
    const body = options.body || '';
    const req = client.request(
      target,
      {
        method: options.method || 'POST',
        headers: { ...options.headers, 'Content-Length': Buffer.byteLength(body) },
        timeout: IMAGE_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => text });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Geeknow 图像生成超时（60 分钟）')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 模型显示名 → API 模型名映射（兼容前端选择项）
const GEEKNOW_MODEL_NAME_MAP = {
  '豆包即梦4.5': 'doubao-seedream-4-5-251128',
  '豆包即梦5.0': 'doubao-seedream-5-0-260128',
  'Grok 4.2 Image': 'grok-4-2-image',
};

// OpenAI 系列模型（走 /v1/images/generations）
const OPENAI_PREFIXES = ['doubao-', 'grok-', 'gpt-image-'];

// 比例 → 像素串映射（OpenAI 系列共用）
const SIZE_MAP_BY_RATIO = {
  '1:1': '2048x2048',
  '4:3': '2304x1728',
  '3:4': '1728x2304',
  '16:9': '2560x1440',
  '9:16': '1440x2560',
  '3:2': '2496x1664',
  '2:3': '1664x2496',
  '21:9': '3024x1296',
};

function resolveGeeknowModel(model) {
  return GEEKNOW_MODEL_NAME_MAP[model] || model;
}

function isOpenAIStyleModel(apiModel) {
  return OPENAI_PREFIXES.some((p) => apiModel.startsWith(p));
}

function ratioToPixelSize(ratio, fallback = '2048x2048') {
  if (!ratio || ratio === 'auto') return fallback;
  if (/^\d+x\d+$/i.test(ratio)) return ratio.toLowerCase();
  return SIZE_MAP_BY_RATIO[ratio] || fallback;
}

async function resolveImageRefAsBase64(ref, options = {}) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref.startsWith('data:')) {
    const m = ref.match(/^data:[^;]+;base64,(.+)$/);
    return m ? m[1] : null;
  }
  if (ref.startsWith('http://') || ref.startsWith('https://')) {
    try {
      const r = await fetch(ref);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.toString('base64');
    } catch { return null; }
  }
  if (ref.startsWith('/files/') && options.baseUrl) {
    try {
      const r = await fetch(`${options.baseUrl}${ref}`);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.toString('base64');
    } catch { return null; }
  }
  return null;
}

async function normalizeLlmMessages(messages, options = {}) {
  if (!Array.isArray(messages)) return messages;
  const result = [];
  for (const msg of messages) {
    if (!msg?.content || !Array.isArray(msg.content)) {
      result.push(msg);
      continue;
    }
    const parts = [];
    for (const part of msg.content) {
      if (part?.type === 'image_url' && part.image_url?.url?.startsWith('/files/') && options.baseUrl) {
        try {
          const r = await fetch(`${options.baseUrl}${part.image_url.url}`);
          if (r.ok) {
            const ct = r.headers.get('content-type') || 'image/png';
            const buf = Buffer.from(await r.arrayBuffer());
            parts.push({ type: 'image_url', image_url: { url: `data:${ct};base64,${buf.toString('base64')}` } });
            continue;
          }
        } catch { /* fallthrough */ }
      }
      parts.push(part);
    }
    result.push({ ...msg, content: parts });
  }
  return result;
}

async function testProvider(provider) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://www.geeknow.top');
  const apiKey = String(provider?.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, code: 'missing_api_key', providerId: provider?.id, protocol: 'geeknow', error: '请先填写 Geeknow API Key。' };
  }
  try {
    const r = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { ok: r.ok, code: r.ok ? 'ok' : 'auth_failed', providerId: provider?.id, protocol: 'geeknow', error: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, code: 'connection_failed', providerId: provider?.id, protocol: 'geeknow', error: e.message };
  }
}

async function generateChat(provider, input = {}, options = {}) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://www.geeknow.top');
  const apiKey = String(provider?.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, kind: 'llm', code: 'missing_api_key', providerId: provider?.id, protocol: 'geeknow', error: '未配置 Geeknow API Key' };
  }

  const model = String(input.providerModel || input.model || 'gemini-3.1-pro-preview').trim();
  const messages = input.messages;
  if (!messages || !Array.isArray(messages)) {
    return { ok: false, kind: 'llm', code: 'missing_messages', providerId: provider?.id, protocol: 'geeknow', error: 'messages 必填' };
  }

  const normalizedMessages = await normalizeLlmMessages(messages, options);
  const endpoint = `${baseUrl}/v1/chat/completions`;
  const payload = {
    model,
    messages: normalizedMessages,
    temperature: input.temperature ?? 0.7,
    max_tokens: input.max_tokens ?? 4096,
    stream: false,
  };
  if (typeof input.top_p === 'number') payload.top_p = input.top_p;
  if (input.response_format) payload.response_format = input.response_format;
  if (Array.isArray(input.tools) && input.tools.length) payload.tools = input.tools;
  if (input.tool_choice !== undefined) payload.tool_choice = input.tool_choice;

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return { ok: false, kind: 'llm', code: 'invalid_response', providerId: provider?.id, protocol: 'geeknow', error: '上游响应非 JSON' };
    }
    if (!r.ok) {
      return { ok: false, kind: 'llm', code: 'upstream_error', providerId: provider?.id, protocol: 'geeknow', error: data?.error?.message || data?.error || `HTTP ${r.status}` };
    }

    const choice = data?.choices?.[0];
    let content = choice?.message?.content || '';
    const imageUrls = [];
    if (Array.isArray(content)) {
      let textParts = '';
      content.forEach((part) => {
        if (part?.type === 'text') textParts += part.text || '';
        else if (part?.type === 'image_url' && part.image_url?.url) imageUrls.push(part.image_url.url);
      });
      content = textParts;
    }

    return { ok: true, kind: 'llm', code: 'ok', providerId: provider?.id, protocol: 'geeknow', text: content, imageUrls: imageUrls.length ? imageUrls : undefined };
  } catch (e) {
    return { ok: false, kind: 'llm', code: 'request_failed', providerId: provider?.id, protocol: 'geeknow', error: e.message };
  }
}

// 调用 OpenAI 兼容图像端点（doubao / grok / gpt-image-2 系列）
async function callOpenAIStyleImage({ apiKey, baseUrl, apiModel, prompt, refs, size, options }) {
  const endpoint = `${baseUrl}/v1/images/generations`;
  const body = {
    model: apiModel,
    prompt,
    n: 1,
    size: size || '2048x2048',
  };
  if (apiModel.startsWith('gpt-image-')) {
    body.quality = 'high';
    body.response_format = 'url';
  }
  if (refs && refs.length) {
    const images = [];
    for (const ref of refs) {
      const b64 = await resolveImageRefAsBase64(ref, options);
      if (b64) images.push(b64);
    }
    if (images.length) body.image = images;
  }
  const r = await fetchWithLongTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('上游响应非 JSON'); }
  if (!r.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${r.status}`);
  const items = Array.isArray(data?.data) ? data.data : [];
  const urls = [];
  for (const it of items) {
    if (it?.url) urls.push(it.url);
    else if (it?.b64_json) urls.push(`data:image/png;base64,${it.b64_json}`);
  }
  if (!urls.length) throw new Error('上游未返回图片');
  return urls;
}

// 调用 Gemini 原生 generateContent 端点
async function callGeminiImage({ apiKey, baseUrl, apiModel, prompt, refs, aspectRatio, imageSize, options }) {
  const endpoint = `${baseUrl}/v1beta/models/${apiModel}:generateContent`;
  const parts = [{ text: prompt }];
  if (refs && refs.length) {
    for (const ref of refs) {
      const b64 = await resolveImageRefAsBase64(ref, options);
      if (b64) parts.push({ inlineData: { mimeType: 'image/png', data: b64 } });
    }
  }
  const actualImageSize = apiModel === 'gemini-3-pro-image-preview' ? (imageSize || '2K') : '1K';
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature: 1.0,
      topP: 0.95,
      maxOutputTokens: 8192,
      imageConfig: {
        aspectRatio: aspectRatio || '16:9',
        imageSize: actualImageSize,
      },
    },
  };
  const r = await fetchWithLongTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Gemini 响应非 JSON: ${text.slice(0, 300)}`); }
  if (!r.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${r.status}`);
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts) {
    console.log('[geeknow-image] Gemini 响应缺少 candidates[0].content.parts:', JSON.stringify(data).slice(0, 500));
    throw new Error('Gemini 响应格式错误');
  }
  const urls = [];
  for (const part of candidate.content.parts) {
    // 标准 Gemini 协议：inlineData.data
    if (part?.inlineData?.data) {
      const v = part.inlineData.data;
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) urls.push(v);
      else urls.push(`data:image/png;base64,${v}`);
      continue;
    }
    // 兼容驼峰变种：inline_data
    if (part?.inline_data?.data) {
      const v = part.inline_data.data;
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) urls.push(v);
      else urls.push(`data:image/png;base64,${v}`);
      continue;
    }
    // 文本部分中嵌入 markdown 图片或 data URI
    if (part?.text) {
      const dataUriMatch = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/.exec(part.text);
      if (dataUriMatch) { urls.push(`data:${dataUriMatch[1]};base64,${dataUriMatch[2]}`); continue; }
      const urlMatches = part.text.match(/https?:\/\/[^\s)\]]+\.(?:jpg|jpeg|jpe|png|webp|gif)/gi);
      if (urlMatches) urls.push(...urlMatches);
    }
  }
  if (!urls.length) {
    console.log('[geeknow-image] Gemini 响应未提取到图片，candidate:', JSON.stringify(candidate).slice(0, 800));
    throw new Error('Gemini 响应中未找到图片');
  }
  return urls;
}

async function generateImage(provider, input = {}, options = {}) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://api.geeknow.ai');
  const apiKey = String(provider?.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, kind: 'image', code: 'missing_api_key', providerId: provider?.id, protocol: 'geeknow', error: '未配置 Geeknow API Key' };
  }
  const modelDisplay = String(input.providerModel || input.model || 'gemini-3-pro-image-preview').trim();
  const apiModel = resolveGeeknowModel(modelDisplay);
  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    return { ok: false, kind: 'image', code: 'missing_prompt', providerId: provider?.id, protocol: 'geeknow', error: 'prompt 必填' };
  }
  const params = input.providerParams || {};
  const refs = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  const aspectRatio = params.aspectRatio || '16:9';
  const imageSize = params.resolution || '2K';

  try {
    let urls;
    if (isOpenAIStyleModel(apiModel)) {
      const size = ratioToPixelSize(aspectRatio);
      console.log(`[geeknow-image] OpenAI 系列 model=${apiModel} size=${size}`);
      urls = await callOpenAIStyleImage({ apiKey, baseUrl, apiModel, prompt, refs, size, options });
    } else {
      console.log(`[geeknow-image] Gemini 系列 model=${apiModel} aspectRatio=${aspectRatio} imageSize=${imageSize}`);
      urls = await callGeminiImage({ apiKey, baseUrl, apiModel, prompt, refs, aspectRatio, imageSize, options });
    }
    return { ok: true, kind: 'image', code: 'ok', providerId: provider?.id, protocol: 'geeknow', imageUrls: urls };
  } catch (e) {
    return { ok: false, kind: 'image', code: 'upstream_error', providerId: provider?.id, protocol: 'geeknow', error: e.message };
  }
}

async function generateChatStream(provider, input = {}, callbacks = {}) {
  const baseUrl = cleanBaseUrl(provider?.baseUrl || 'https://www.geeknow.top');
  const apiKey = String(provider?.apiKey || '').trim();
  const { onDelta, onDone, onError } = callbacks;

  if (!apiKey) {
    onError?.(new Error('未配置 Geeknow API Key'));
    return;
  }

  const model = String(input.providerModel || input.model || 'gemini-3.1-pro-preview').trim();
  const messages = input.messages;
  if (!messages || !Array.isArray(messages)) {
    onError?.(new Error('messages 必填'));
    return;
  }

  const options = { baseUrl: `http://127.0.0.1:${require('../config').PORT}` };
  const normalizedMessages = await normalizeLlmMessages(messages, options);
  const endpoint = `${baseUrl}/v1/chat/completions`;
  const payload = {
    model,
    messages: normalizedMessages,
    temperature: input.temperature ?? 0.7,
    max_tokens: input.max_tokens ?? 4096,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (typeof input.top_p === 'number') payload.top_p = input.top_p;

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errText = await r.text();
      onError?.(new Error(`Geeknow 上游 HTTP ${r.status}: ${errText.slice(0, 200)}`));
      return;
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          onDone?.();
          return;
        }
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) onDelta?.(delta);
        } catch { /* skip malformed */ }
      }
    }
    onDone?.();
  } catch (e) {
    onError?.(e);
  }
}

module.exports = { testProvider, generateChat, generateChatStream, generateImage };

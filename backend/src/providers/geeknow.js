function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
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

module.exports = { testProvider, generateChat, generateChatStream };

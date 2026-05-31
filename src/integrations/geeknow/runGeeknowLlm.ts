/**
 * Geeknow 中转站 LLM 推理（v1.7.4 fork-only） — 与 src/services/generation.ts 的 generateLlm 解耦
 *
 * 与主 LLM 服务 (`/api/proxy/llm`) 的区别：
 *   - 端点：`/api/proxy/llm-geeknow`
 *   - 上游：Geeknow OpenAI Chat Completions 兼容协议
 *   - Key：独立 `geeknowApiKey`，不 fallback 到 `llmApiKey`
 *
 * 复用主服务的 LlmMessage / LlmContentPart 类型定义，避免重复声明。
 */
import type { LlmMessage } from '../../services/generation';

export interface GeeknowLlmRequest {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  /** 透传给 OpenAI 兼容上游：response_format / tools / tool_choice 等扩展字段（按需） */
  response_format?: any;
  tools?: any[];
  tool_choice?: any;
}

export interface GeeknowLlmResult {
  content: string;
  imageUrls?: string[];
  raw: any;
  model: string;
}

/** 非流式推理 */
export async function generateGeeknowLlm(req: GeeknowLlmRequest): Promise<GeeknowLlmResult> {
  const r = await fetch('/api/proxy/llm-geeknow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, stream: false }),
  });
  const data = await r.json();
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data.data;
}

/**
 * 流式推理（SSE 透传，OpenAI Chat Completions 兼容格式）
 * 后端 `/api/proxy/llm-geeknow` 把上游 `data: {chunk}` 字节按行透传到这里。
 */
export async function generateGeeknowLlmStream(
  req: GeeknowLlmRequest,
  opts: { onDelta?: (chunk: string) => void; signal?: AbortSignal } = {},
): Promise<{ content: string }> {
  const r = await fetch('/api/proxy/llm-geeknow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, stream: true }),
    signal: opts.signal,
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = j?.error || msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  if (!r.body) throw new Error('Geeknow 上游未返回可读流');

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let assembled = '';
  let buffer = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return { content: assembled };
      try {
        const j = JSON.parse(payload);
        const delta = j?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length) {
          assembled += delta;
          opts.onDelta?.(delta);
        }
      } catch {
        /* 心跳或不完整 JSON 忽略 */
      }
    }
  }
  return { content: assembled };
}

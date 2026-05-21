/**
 * 生成服务 - 封装代理调用
 * 所有请求走 /api/proxy/* (后端会注入对应 Key 并转存结果)
 */

export interface GenerateImageRequest {
  model: string;          // 节点 id (gpt-image-2 / nano-banana-2 / nano-banana-pro)
  apiModel?: string;       // 上游真实模型名(优先使用)
  paramKind?: 'gpt-size' | 'banana-ratio';
  prompt: string;
  n?: number;
  // 主参数(双协议通用):
  aspect_ratio?: string;   // 1:1 / 16:9 / Auto …
  image_size?: string;     // 1K / 2K / 4K (banana) 或像素串(GPT 也可透传)
  // 多张参考图(base64 dataURL 或 http(s):// URL)
  images?: string[];
  quality?: string;
  // 兼容旧参数:若传了 size(像素串)则优先用、image 单张也会并入 images
  size?: string;
  image?: string;
}

export interface GenerateImageResult {
  urls: string[]; // 本地相对 URL,如 /files/output/xxx.png
  raw: any;
}

export async function generateImage(req: GenerateImageRequest): Promise<GenerateImageResult> {
  const r = await fetch('/api/proxy/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data.data;
}

// LLM
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateLlmRequest {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface GenerateLlmResult {
  content: string;
  raw: any;
  model: string;
}

export async function generateLlm(req: GenerateLlmRequest): Promise<GenerateLlmResult> {
  const r = await fetch('/api/proxy/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data.data;
}

// 文件上传
export async function uploadFile(file: File): Promise<{ url: string; filename: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/files/upload', { method: 'POST', body: fd });
  const data = await r.json();
  if (!r.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data.data;
}

// ========================================================================
// 视频生成(异步)
// ========================================================================
export interface VideoSubmitRequest {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  enhance_prompt?: boolean;
  seed?: number;
  enable_upsample?: boolean;
  images?: string[]; // base64 首帧参考图(最多 3 张)
}

export async function submitVideo(req: VideoSubmitRequest): Promise<{ taskId: string }> {
  const r = await fetch('/api/proxy/video/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface VideoQueryResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILURE' | 'RUNNING' | string;
  progress?: string;
  videoUrl?: string | null;
  failReason?: string | null;
}

export async function queryVideo(taskId: string): Promise<VideoQueryResult> {
  const r = await fetch(`/api/proxy/video/query?taskId=${encodeURIComponent(taskId)}`);
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

// ========================================================================
// 音频 Suno(异步)
// ========================================================================
export type AudioMode = 'generate' | 'cover' | 'extend';
export interface AudioSubmitRequest {
  mode: AudioMode;
  prompt?: string;
  title?: string;
  tags?: string;
  version?: string; // suno-v5.5 等
  seed?: number;
  continue_clip_id?: string;
  continue_at?: number;
  cover_clip_id?: string;
}

export async function submitAudio(
  req: AudioSubmitRequest,
): Promise<{ taskId: string; clipIds: string[] }> {
  const r = await fetch('/api/proxy/audio/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface AudioTrack {
  id: string;
  audioUrl: string;
  imageUrl?: string;
  title?: string;
  tags?: string;
  duration?: number;
}
export interface AudioQueryResult {
  status: 'PENDING' | 'SUCCESS' | string;
  tracks: AudioTrack[];
  total: number;
  completed: number;
}

export async function queryAudio(clipIds: string[]): Promise<AudioQueryResult> {
  const ids = clipIds.join(',');
  const r = await fetch(`/api/proxy/audio/query?clipIds=${encodeURIComponent(ids)}`);
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

// ========================================================================
// RunningHub 工作流(异步)
// ========================================================================
export interface RhSubmitRequest {
  webappId: string;
  nodeInfoList?: Array<{ nodeId: string; fieldName: string; fieldValue: any }>;
  instanceType?: string;
}

export async function submitRh(req: RhSubmitRequest): Promise<{ taskId: string }> {
  const r = await fetch('/api/proxy/runninghub/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface RhQueryResult {
  status: 'PENDING' | 'SUCCESS' | 'RUNNING' | 'QUEUED' | 'FAILED' | string;
  urls: string[];
  failReason?: string | null;
  code?: number;
}

export async function queryRh(taskId: string): Promise<RhQueryResult> {
  const r = await fetch(`/api/proxy/runninghub/query?taskId=${encodeURIComponent(taskId)}`);
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export async function fetchRhAppInfo(webappId: string): Promise<any> {
  const r = await fetch(`/api/proxy/runninghub/app-info?webappId=${encodeURIComponent(webappId)}`);
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

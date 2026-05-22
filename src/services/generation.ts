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

// ========================================================================
// 图像异步任务(对齐 gpt-image-2-web 的 submit + poll 模式)
// submitImageAsync 返 { sync, taskId?, urls?, status, progress }
//   - sync=true: 同步完成,urls 已存在
//   - sync=false: 需轮询 queryImageStatus(taskId)
// ========================================================================
export interface ImageSubmitResult {
  sync: boolean;
  taskId?: string;
  urls?: string[];
  status: string;       // pending / running / completed / failed
  progress: string;     // '0%' / '50%' / '100%'
  raw?: any;
}

export async function submitImageAsync(req: GenerateImageRequest): Promise<ImageSubmitResult> {
  const r = await fetch('/api/proxy/image/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface ImageQueryResult {
  status: string;       // pending / running / completed / failed
  progress: string;
  urls?: string[];
  error?: string;
}

export async function queryImageStatus(taskId: string): Promise<ImageQueryResult> {
  const r = await fetch(`/api/proxy/image/status/${encodeURIComponent(taskId)}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  // 失败状态下 success=false 但返回 body 中仍包含 status:'failed'
  return data.data || { status: data.success ? 'pending' : 'failed', progress: '0%', error: data?.error };
}

// ========================================================================
// FAL 渠道(独立提交 + 轮询,对齐 gpt-image-2-web runGPTFal / runNanoFal)
//   submitImageFal 返 { sync, urls? } 或 { sync:false, requestId, responseUrl, endpoint }
//   queryImageFal  返 { status: 'pending'|'completed'|'failed', urls?, error? }
// ========================================================================
export interface FalSubmitRequest {
  /** 'gpt-image-2-fal' | 'nano-banana-pro-fal' */
  apiModel: string;
  prompt: string;
  /** 参考图 URL(本地 /files/* 或 base64 dataURI),后端会上传到 /v1/files 取 URL */
  images?: string[];
  /** 生成张数 1-4 */
  n?: number;
  /** 输出格式 png / jpeg / webp */
  format?: 'png' | 'jpeg' | 'webp';
  /** 同步模式(true 会在提交请求中附加 sync_mode:true,贞贞上游如果接受会同步返 images) */
  sync?: boolean;

  // === gpt-fal 专属 ===
  /** 'edit' | 'gen';不填时有参考图走 edit,无参考图走 gen */
  mode?: 'edit' | 'gen';
  /** 'auto' / 'square_hd' / 'square' / 'portrait_4_3' / 'portrait_16_9' / 'landscape_4_3' / 'landscape_16_9' / 'custom' */
  size?: string;
  /** size === 'custom' 时有效,后端会 snap 到 16 倍数 */
  customW?: number;
  customH?: number;
  /** 'low' | 'medium' | 'high' | 'auto' 主项目默认 medium */
  quality?: 'low' | 'medium' | 'high' | 'auto';

  // === nbpro-fal 专属 ===
  /** 'auto' / '21:9' / '16:9' / '3:2' / '4:3' / '5:4' / '1:1' / '4:5' / '3:4' / '2:3' / '9:16' */
  aspect_ratio?: string;
  /** '1K' / '2K' / '4K' */
  resolution?: string;
  /** '1'(严)..'6'(松) 默认 '4' */
  safety_tolerance?: string;
  /** 0 = 不传 */
  seed?: number;
  system_prompt?: string;
  enable_web_search?: boolean;
  /** 'image_url'(上传贞贞取 URL) | 'base64' 默认 'image_url' */
  image_mode?: 'image_url' | 'base64';
}

export interface FalSubmitResult {
  sync: boolean;
  urls?: string[];
  requestId?: string;
  responseUrl?: string;
  endpoint?: string;
}

export async function submitImageFal(req: FalSubmitRequest): Promise<FalSubmitResult> {
  const r = await fetch('/api/proxy/image/fal/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await r.json();
  if (!r.ok || !data.success) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data;
}

export interface FalQueryResult {
  status: 'pending' | 'completed' | 'failed' | string;
  urls?: string[];
  error?: string;
  falStatus?: string;
}

export async function queryImageFal(params: { responseUrl?: string; endpoint?: string; requestId?: string }): Promise<FalQueryResult> {
  const r = await fetch('/api/proxy/image/fal/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await r.json();
  // 后端在 FAILED 时会 success=false 但 data.status='failed',这里返回结果供上层判断
  if (!r.ok && !data.data) throw new Error(data?.error || `HTTP ${r.status}`);
  return data.data || { status: 'failed', error: data?.error || 'unknown' };
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
// 视频生成(异步) — 完全对齐 gpt-image-2-web
//   - veo3.1   字段:  aspect_ratio + enhance_prompt + enable_upsample + seed + images(base64,≤3)
//   - grok     字段:  ratio + duration(秒,数字) + resolution + seed + images(本地 URL/base64,≤7,后端转上游 URL)
//   - seedance 字段:  沿用 veo 字段(零破坏)
// 后端通过 model 字段名自动选择协议,前端无需显式传 kind。
// ========================================================================
export interface VideoSubmitRequest {
  model: string;
  prompt: string;
  // Veo3.1
  aspect_ratio?: string;
  enhance_prompt?: boolean;
  enable_upsample?: boolean;
  // Grok Video
  ratio?: string;
  duration?: number;
  resolution?: string;
  // 通用
  seed?: number;
  /**
   * 参考图。
   *  - veo3.1:   base64 dataURL,最多 3 张
   *  - grok:     可传 base64 dataURL 或 /files/* 本地 URL,最多 7 张(后端会上传到上游 /v1/files 取 URL)
   *  - seedance: base64 dataURL,最多 3 张(同 veo)
   */
  images?: string[];
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

const BASE = '/api/topaz';

export interface TopazStatus {
  gigapixel: {
    installed: boolean;
    executablePath?: string;
    defaultExecutablePath?: string;
    source?: string;
    setupHints?: string[];
  };
  video: {
    installed: boolean;
    ffmpegPath?: string;
    topazVideoDir?: string;
    defaultTopazVideoDir?: string;
    source?: string;
    modelEnvReady?: boolean;
    modelDataDir?: string;
    modelDir?: string;
    setupHints?: string[];
  };
  models: {
    gigapixel: string[];
    gigapixelCodes: string[];
    videoUpscale: string[];
    videoInterpolation: string[];
  };
}

export interface TopazRunResult {
  kind: 'image' | 'video';
  outputUrl: string;
  outputUrls?: string[];
  fileName?: string;
  size?: number;
  mime?: string;
  settings?: Record<string, any>;
  filterChain?: string;
  commandPreview?: string;
  logs?: Array<{ step: string; ok: boolean; stdout?: string; stderr?: string }>;
  input?: {
    kind?: string;
    mime?: string;
    source?: string;
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    const isHtml = /^\s*</.test(text || '');
    throw new Error(isHtml ? 'Topaz 后端接口未就绪，请重启后端服务后重试' : `接口返回异常: ${text.slice(0, 160)}`);
  }
  if (!res.ok || json?.success === false) {
    const hint = json?.hint ? `\n${json.hint}` : '';
    throw new Error(`${json?.error || `HTTP ${res.status}`}${hint}`);
  }
  return json.data as T;
}

export function getTopazStatus(params?: {
  gigapixelPath?: string;
  topazVideoPath?: string;
}): Promise<TopazStatus> {
  const search = new URLSearchParams();
  if (params?.gigapixelPath) search.set('gigapixelPath', params.gigapixelPath);
  if (params?.topazVideoPath) search.set('topazVideoPath', params.topazVideoPath);
  const qs = search.toString();
  return requestJson<TopazStatus>(`${BASE}/status${qs ? `?${qs}` : ''}`);
}

export function runTopazGigapixel(payload: {
  imageUrl: string;
  executablePath?: string;
  model?: string;
  scale?: number;
  enableSettings?: boolean;
  denoise?: number;
  sharpen?: number;
  compression?: number;
  fineDetail?: number;
  preDownscaling?: number;
}): Promise<TopazRunResult> {
  return requestJson<TopazRunResult>(`${BASE}/gigapixel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runTopazVideo(payload: {
  videoUrl: string;
  topazVideoPath?: string;
  enableUpscale?: boolean;
  upscaleFactor?: number;
  upscaleModel?: string;
  compression?: number;
  blend?: number;
  enableInterpolation?: boolean;
  inputFps?: number;
  interpolationMultiplier?: number;
  interpolationModel?: string;
  useGpu?: boolean;
  preserveAudio?: boolean;
}): Promise<TopazRunResult> {
  return requestJson<TopazRunResult>(`${BASE}/video`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

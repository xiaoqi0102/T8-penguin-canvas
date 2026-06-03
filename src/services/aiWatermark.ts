import type { MediaKind } from '../utils/mediaCollection';

const BASE = '/api/ai-watermark';

export type AiWatermarkMode =
  | 'smart'
  | 'visible'
  | 'erase'
  | 'invisible'
  | 'metadata-check'
  | 'metadata-remove'
  | 'identify';

export interface AiWatermarkRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AiWatermarkOptions {
  mark?: string;
  detect?: boolean;
  inpaint?: boolean;
  inpaintMethod?: 'ns' | 'telea' | 'gaussian';
  inpaintStrength?: number;
  stripMetadata?: boolean;
  runInvisible?: boolean;
  regions?: AiWatermarkRegion[];
  backend?: 'cv2' | 'lama';
  eraseMethod?: 'telea' | 'ns';
  dilate?: number;
  pipeline?: 'default' | 'ctrlregen';
  device?: 'auto' | 'cpu' | 'mps' | 'cuda' | 'xpu';
  strength?: number;
  steps?: number;
  seed?: number | '';
  humanize?: number;
  maxResolution?: number;
  protectText?: boolean;
  protectFaces?: boolean;
  keepStandardMetadata?: boolean;
  noVisible?: boolean;
}

export interface AiWatermarkStatus {
  installed: boolean;
  version?: string;
  resolver?: string;
  markKeys: string[];
  optionalFeatures: {
    invisible: boolean;
    lama: boolean;
    detect: boolean;
    trustmark: boolean;
  };
  setupHints: string[];
  errors?: string[];
}

export interface AiWatermarkProcessResult {
  mode: AiWatermarkMode;
  outputKind: MediaKind | 'text' | 'metadata';
  outputUrl?: string;
  outputText?: string;
  report?: any;
  logs?: Array<{ step: string; ok: boolean; stdout?: string; stderr?: string }>;
  input?: {
    kind?: MediaKind;
    mime?: string;
    source?: string;
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.data as T;
}

export function getAiWatermarkStatus(): Promise<AiWatermarkStatus> {
  return requestJson<AiWatermarkStatus>(`${BASE}/status`);
}

export function processAiWatermark(payload: {
  source: string;
  kind?: MediaKind;
  mode: AiWatermarkMode;
  options?: AiWatermarkOptions;
}): Promise<AiWatermarkProcessResult> {
  return requestJson<AiWatermarkProcessResult>(`${BASE}/process`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

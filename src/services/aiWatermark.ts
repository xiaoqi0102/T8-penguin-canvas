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
  pipeline?: 'default' | 'controlnet' | 'ctrlregen';
  device?: 'auto' | 'cpu' | 'mps' | 'cuda' | 'xpu';
  strength?: number;
  steps?: number;
  seed?: number | '';
  humanize?: number;
  unsharp?: number;
  maxResolution?: number;
  minResolution?: number;
  controlnetScale?: number;
  auto?: boolean;
  autoTune?: boolean;
  adaptivePolish?: boolean;
  restoreFaces?: boolean;
  restoreFacesWeight?: number;
  /** Legacy 0.8.7 fields. Kept for old canvas data; 0.8.9 uses controlnet / restoreFaces instead. */
  protectText?: boolean;
  /** Legacy 0.8.7 fields. Kept for old canvas data; 0.8.9 uses controlnet / restoreFaces instead. */
  protectFaces?: boolean;
  keepStandardMetadata?: boolean;
  noVisible?: boolean;
}

export interface AiWatermarkStatus {
  installed: boolean;
  version?: string;
  resolver?: string;
  runtimeArchivePending?: boolean;
  runtimeArchive?: {
    archiveExists?: boolean;
    ready?: boolean;
    archiveFile?: string;
    archiveSize?: number;
  };
  markKeys: string[];
  optionalFeatures: {
    invisible: boolean;
    lama: boolean;
    detect: boolean;
    trustmark: boolean;
    restore?: boolean;
    auto?: boolean;
    controlnet?: boolean;
    adaptivePolish?: boolean;
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

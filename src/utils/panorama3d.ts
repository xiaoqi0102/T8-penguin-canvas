export type PanoramaRatioId =
  | 'square'
  | 'portrait'
  | 'landscape'
  | 'portrait43'
  | 'landscape43'
  | 'story'
  | 'wide'
  | 'ultrawide'
  | 'ultratall'
  | 'custom';

export interface PanoramaRatio {
  w: number;
  h: number;
}

export const PANORAMA_RATIO_PRESETS: Record<Exclude<PanoramaRatioId, 'custom'>, PanoramaRatio> = {
  square: { w: 1, h: 1 },
  portrait: { w: 2, h: 3 },
  landscape: { w: 3, h: 2 },
  portrait43: { w: 3, h: 4 },
  landscape43: { w: 4, h: 3 },
  story: { w: 9, h: 16 },
  wide: { w: 16, h: 9 },
  ultrawide: { w: 21, h: 9 },
  ultratall: { w: 9, h: 21 },
};

export const PANORAMA_RATIO_OPTIONS: Array<{ id: PanoramaRatioId; label: string }> = [
  { id: 'square', label: '1:1' },
  { id: 'portrait', label: '2:3' },
  { id: 'landscape', label: '3:2' },
  { id: 'portrait43', label: '3:4' },
  { id: 'landscape43', label: '4:3' },
  { id: 'story', label: '9:16' },
  { id: 'wide', label: '16:9' },
  { id: 'ultrawide', label: '21:9' },
  { id: 'ultratall', label: '9:21' },
  { id: 'custom', label: '自定义' },
];

export type PanoramaGenerationMode = 'text' | 'image';
export type PanoramaPanelMode = 'preview' | PanoramaGenerationMode;
export type PanoramaSizeLevel = '1K' | '2K';

export interface PanoramaGenerationHistoryItem {
  url: string;
  mode: PanoramaGenerationMode;
  sizeLevel: PanoramaSizeLevel;
  prompt: string;
  promptFinal: string;
  referenceUrl?: string;
  createdAt: string;
}

export type PanoramaQualityLevel = 'excellent' | 'good' | 'warning' | 'unknown';

export interface PanoramaImageQuality {
  level: PanoramaQualityLevel;
  seamScore: number | null;
  seamLabel: string;
  aspectLabel: string;
  width: number;
  height: number;
  hint: string;
}

export const PANORAMA_FIXED_PROMPT =
  '将参考图生成一个720度的全景VR图，左右边缘100%像素级无缝衔接，可无限循环拼接；上下极点（南北极）自然过渡，无明显断层或拉伸，场景一致性，以及场景的逻辑性，封闭场景需要有门。';

export const PANORAMA_SIZE_LEVELS: PanoramaSizeLevel[] = ['1K', '2K'];
export const PANORAMA_PROMPT_TEMPLATES = ['室内展厅', '科幻基地', '古风庭院', '自然峡谷', '游戏关卡', '产品展台'];

export function safePanoramaPanelMode(value: unknown): PanoramaPanelMode {
  return value === 'preview' || value === 'image' ? value : 'text';
}

export function safePanoramaGenerationMode(value: unknown): PanoramaGenerationMode {
  return value === 'image' ? 'image' : 'text';
}

export function safePanoramaSizeLevel(value: unknown): PanoramaSizeLevel {
  return value === '2K' ? '2K' : '1K';
}

export function buildPanoramaPromptFinal(userPrompt: unknown) {
  const extra = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  return extra ? `${PANORAMA_FIXED_PROMPT}\n${extra}` : PANORAMA_FIXED_PROMPT;
}

export function validatePanoramaGeneration(params: {
  mode: PanoramaGenerationMode;
  prompt?: unknown;
  referenceUrl?: unknown;
}) {
  const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  const referenceUrl = typeof params.referenceUrl === 'string' ? params.referenceUrl.trim() : '';
  if (params.mode === 'text' && !prompt) {
    return { ok: false as const, error: '文生全景需要填写场景提示词' };
  }
  if (params.mode === 'image' && !referenceUrl) {
    return { ok: false as const, error: '图生全景需要上游图片或节点内参考图' };
  }
  return { ok: true as const };
}

export function buildPanoramaImageRequest(params: {
  mode: PanoramaGenerationMode;
  prompt?: unknown;
  sizeLevel?: unknown;
  referenceUrl?: unknown;
}) {
  const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  const referenceUrl = typeof params.referenceUrl === 'string' ? params.referenceUrl.trim() : '';
  const sizeLevel = safePanoramaSizeLevel(params.sizeLevel);
  return {
    model: 'gpt-image-2',
    apiModel: 'gpt-image-2',
    paramKind: 'gpt-size' as const,
    prompt: buildPanoramaPromptFinal(prompt),
    aspectRatio: '21:9',
    aspect_ratio: '21:9',
    sizeLevel,
    image_size: sizeLevel,
    images: params.mode === 'image' && referenceUrl ? [referenceUrl] : [],
    n: 1,
  };
}

export function prependPanoramaHistory(
  current: unknown,
  item: PanoramaGenerationHistoryItem,
  maxItems = 3,
): PanoramaGenerationHistoryItem[] {
  const list = Array.isArray(current) ? current : [];
  return [
    item,
    ...list
      .filter((entry): entry is PanoramaGenerationHistoryItem => {
        return !!entry && typeof entry === 'object' && typeof (entry as any).url === 'string';
      })
      .filter((entry) => entry.url !== item.url),
  ].slice(0, Math.max(1, maxItems));
}

export function clampPanoramaNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function resolvePanoramaRatio(id: unknown, customW: unknown, customH: unknown): PanoramaRatio {
  const key = typeof id === 'string' ? id : 'wide';
  if (key !== 'custom' && Object.prototype.hasOwnProperty.call(PANORAMA_RATIO_PRESETS, key)) {
    return PANORAMA_RATIO_PRESETS[key as Exclude<PanoramaRatioId, 'custom'>];
  }
  return {
    w: clampPanoramaNumber(customW, 1, 999, 16),
    h: clampPanoramaNumber(customH, 1, 999, 9),
  };
}

export function panoramaRenderSize(ratio: PanoramaRatio, longSide = 1536) {
  const safeW = Math.max(1, Number(ratio.w) || 16);
  const safeH = Math.max(1, Number(ratio.h) || 9);
  const aspect = safeW / safeH;
  if (aspect >= 1) {
    return { width: longSide, height: Math.max(1, Math.round(longSide / aspect)) };
  }
  return { width: Math.max(1, Math.round(longSide * aspect)), height: longSide };
}

export function classifyPanoramaSeamScore(score: number | null): Pick<PanoramaImageQuality, 'level' | 'seamLabel' | 'hint'> {
  if (score == null || !Number.isFinite(score)) {
    return { level: 'unknown', seamLabel: '无法检测', hint: '当前图片无法读取像素，可能是跨域图片或浏览器安全限制。' };
  }
  if (score >= 90) return { level: 'excellent', seamLabel: '接缝优秀', hint: '左右边缘像素差异很小，适合继续预览或入库。' };
  if (score >= 76) return { level: 'good', seamLabel: '接缝可用', hint: '左右边缘有轻微差异，建议旋转检查主体边缘。' };
  return { level: 'warning', seamLabel: '可能有缝', hint: '左右边缘差异较明显，建议重新生成或补充“边缘无缝衔接”。' };
}

function panoramaAspectLabel(width: number, height: number) {
  const aspect = width / Math.max(1, height);
  if (aspect >= 2.25 && aspect <= 2.45) return '21:9';
  if (aspect >= 1.9 && aspect <= 2.1) return '2:1';
  return `非标准 ${aspect.toFixed(2)}:1`;
}

export function estimatePanoramaImageQuality(image: HTMLImageElement): PanoramaImageQuality {
  const width = Math.max(0, image.naturalWidth || image.width || 0);
  const height = Math.max(0, image.naturalHeight || image.height || 0);
  const unknown = classifyPanoramaSeamScore(null);
  if (!width || !height || typeof document === 'undefined') {
    return {
      ...unknown,
      seamScore: null,
      aspectLabel: width && height ? panoramaAspectLabel(width, height) : '未知比例',
      width,
      height,
    };
  }
  try {
    const sampleW = Math.max(64, Math.min(384, Math.round(width)));
    const sampleH = Math.max(32, Math.min(192, Math.round(height)));
    const strip = Math.max(4, Math.min(12, Math.round(sampleW * 0.025)));
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.drawImage(image, 0, 0, sampleW, sampleH);
    const left = ctx.getImageData(0, 0, strip, sampleH).data;
    const right = ctx.getImageData(sampleW - strip, 0, strip, sampleH).data;
    let diff = 0;
    let count = 0;
    for (let i = 0; i < left.length; i += 4) {
      diff += Math.abs(left[i] - right[i]) + Math.abs(left[i + 1] - right[i + 1]) + Math.abs(left[i + 2] - right[i + 2]);
      count += 3;
    }
    const normalized = count > 0 ? diff / (count * 255) : 1;
    const score = Math.max(0, Math.min(100, Math.round((1 - normalized) * 100)));
    const classified = classifyPanoramaSeamScore(score);
    const aspectLabel = panoramaAspectLabel(width, height);
    return {
      ...classified,
      seamScore: score,
      aspectLabel,
      width,
      height,
      hint: aspectLabel.startsWith('非标准')
        ? `${classified.hint} 当前不是常见 2:1 或 21:9 全景比例，预览可能出现拉伸。`
        : classified.hint,
    };
  } catch {
    return {
      ...unknown,
      seamScore: null,
      aspectLabel: panoramaAspectLabel(width, height),
      width,
      height,
    };
  }
}

export function isLikelyPanoramaImage(meta: {
  url?: string;
  label?: string;
  title?: string;
  prompt?: string;
  width?: number;
  height?: number;
}) {
  const text = [meta.url, meta.label, meta.title, meta.prompt].filter(Boolean).join(' ');
  if (/(?:360|720|全景|环景|panorama|equirect|spherical|vr\b)/i.test(text)) return true;
  const w = Number(meta.width || 0);
  const h = Number(meta.height || 0);
  if (!(w > 0 && h > 0)) return false;
  const aspect = w / h;
  return aspect >= 1.9 && aspect <= 2.1;
}

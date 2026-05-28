/**
 * Grsai size 映射 —— UI 显示比例 (+ vip 显示清晰度档)，调用 API 前转为像素串
 *
 * 设计目标：
 *   1. UI 侧：
 *      - nano-banana / pro / gpt-image-2 ：仅显示比例下拉，比例字符串直接上送
 *      - gpt-image-2-vip ：比例 + 清晰度档(1K/2K/4K) 双控件，按文档表查像素串
 *   2. 各 apiModel 比例集合：
 *      - nano-banana / nano-banana-pro / gpt-image-2 ：通用 11 个比例（≤3:1，含 auto）
 *      - nano-banana-2 系列 ：通用 11 + 极端 4 个（1:4 / 4:1 / 1:8 / 8:1）
 *      - gpt-image-2-vip ：14 个比例（去 auto，加 1:3 / 3:1 / 2:1 / 1:2）
 *   3. vip 像素映射：DOC_PRESETS_BY_RES 命中文档值优先，未命中按当前档目标像素算 + 16 对齐
 *   4. vip 自定义像素值约束（文档原文）：长边 ≤ 3840、两边均为 16 倍数、长短比 ≤ 3:1、
 *      总像素 [655,360, 8,294,400]
 *
 * 兼容性：
 *   - 旧画布 grsaiAspectRatio 若是像素串 → resolveGrsaiAspectRatio 原样返回
 *   - 旧画布 vip 无 grsaiImageSize 字段 → runner 默认补 '1K'，与 v1.5.8 行为完全一致
 *   - 旧画布 vip 若残留 'auto'（v1.5.8 之前 UI 允许）→ 退到 1024x1024
 *   - 旧画布 vip 若残留 11 比例集之外的值，GrsaiImageTab 渲染时回退到默认；运行期由 computeVipSize 兜底
 */

const ALIGN = 16;
const MAX_EDGE = 3840;
const MIN_EDGE = 64;
const MAX_PIXELS = 8_294_400; // 文档总像素上限（3840×2160）

export type GrsaiResolution = '1K' | '2K' | '4K';

export const DEFAULT_GRSAI_RATIO = 'auto';
export const DEFAULT_GRSAI_RESOLUTION: GrsaiResolution = '1K';
export const GRSAI_RESOLUTIONS: GrsaiResolution[] = ['1K', '2K', '4K'];

// 三档目标像素数（未命中 DOC_PRESETS_BY_RES 时由 computeVipSize 使用）
const RES_TO_TARGET_PIXELS: Record<GrsaiResolution, number> = {
  '1K': 1_048_576, // ≈1 MP（≈1024²）
  '2K': 4_194_304, // ≈4 MP（≈2048²）
  '4K': 8_294_400, // 文档上限 8.29 MP（3840×2160）
};

// 通用 11 个比例（auto + 10 个 ≤3:1）—— nano-banana / pro / gpt-image-2 共用
const COMMON_RATIOS = [
  'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9',
];

// nano-banana-2 系列额外支持的 4 个极端比例（>3:1）
const NANO_BANANA_2_EXTRA = ['1:4', '4:1', '1:8', '8:1'];
const NANO_BANANA_2_RATIOS = [...COMMON_RATIOS, ...NANO_BANANA_2_EXTRA];

// gpt-image-2-vip 专属：14 比例（去 auto，加 1:3 / 3:1 / 2:1 / 1:2 这 4 个 vip 独有比例）
const GPT_IMAGE_2_VIP_RATIOS = [
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9',
  '1:3', '3:1', '2:1', '1:2',
];

const RATIOS_BY_API_MODEL: Record<string, string[]> = {
  'nano-banana': COMMON_RATIOS,
  'nano-banana-fast': COMMON_RATIOS,
  'nano-banana-2': NANO_BANANA_2_RATIOS,
  'nano-banana-2-cl': NANO_BANANA_2_RATIOS,
  'nano-banana-2-4k-cl': NANO_BANANA_2_RATIOS,
  'nano-banana-pro': COMMON_RATIOS,
  'nano-banana-pro-cl': COMMON_RATIOS,
  'nano-banana-pro-vip': COMMON_RATIOS,
  'nano-banana-pro-4k-vip': COMMON_RATIOS,
  'gpt-image-2': COMMON_RATIOS,
  'gpt-image-2-vip': GPT_IMAGE_2_VIP_RATIOS,
};

/** 取得指定 apiModel 支持的比例集合；未知 apiModel 退回通用 11 个 */
export function getGrsaiRatiosForApiModel(apiModel: string | undefined | null): string[] {
  return RATIOS_BY_API_MODEL[String(apiModel || '')] || COMMON_RATIOS;
}

/** 判断 model 是否为 gpt-image-2-vip 系列（决定是否走双控件 + 像素串转换） */
export function isGptImage2VipModel(model: string | undefined | null): boolean {
  return /^gpt-image-2.*vip$/i.test(String(model || ''));
}

// ============================================================================
// gpt-image-2-vip 专用：ratio + resolution → 像素串 转换
// ============================================================================

// vip 文档「比例 × 清晰度」三档完整预设表（按 gpt-image-2 接口文档原文铺）
// 1:3 / 3:1 在 2K 档文档缺位 → 不入表，由 computeVipSize(4MP) 兜底（用户已确认）
const DOC_PRESETS_BY_RES: Record<GrsaiResolution, Record<string, string>> = {
  '1K': {
    '1:1':  '1024x1024',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '4:3':  '1152x864',
    '3:4':  '864x1152',
    '3:2':  '1536x1024',
    '2:3':  '1024x1536',
    '5:4':  '1120x896',
    '4:5':  '896x1120',
    '21:9': '1456x624',
    '1:3':  '688x2048',
    '3:1':  '2048x688',
    '2:1':  '1536x768',
    '1:2':  '768x1536',
  },
  '2K': {
    '1:1':  '2048x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '4:3':  '2304x1728',
    '3:4':  '1728x2304',
    '3:2':  '2048x1360',
    '2:3':  '1360x2048',
    '5:4':  '2240x1792',
    '4:5':  '1792x2240',
    '21:9': '2912x1248',
    '2:1':  '3072x1536',
    '1:2':  '1536x3072',
    // 1:3 / 3:1 文档未给 → computeVipSize 兜底
  },
  '4K': {
    '1:1':  '2880x2880',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '4:3':  '3264x2448',
    '3:4':  '2448x3264',
    '3:2':  '3504x2336',
    '2:3':  '2336x3504',
    '5:4':  '3200x2560',
    '4:5':  '2560x3200',
    '21:9': '3840x1648',
    '1:3':  '1280x3840',
    '3:1':  '3840x1280',
    '2:1':  '3840x1920',
    '1:2':  '1920x3840',
  },
};

function alignTo16(n: number): number {
  const v = Math.round(n / ALIGN) * ALIGN;
  return Math.max(MIN_EDGE, v);
}

/** 按 w:h 比例 + 目标像素数计算满足 vip 约束的像素 size（16 对齐 + 长边 ≤3840 + 总像素 ≤8.29MP） */
function computeVipSize(w: number, h: number, targetPixels: number): string {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '1024x1024';
  const target = Math.min(targetPixels, MAX_PIXELS);
  const scale = Math.sqrt(target / (w * h));
  let pw = alignTo16(w * scale);
  let ph = alignTo16(h * scale);
  const longest = Math.max(pw, ph);
  if (longest > MAX_EDGE) {
    const s = MAX_EDGE / longest;
    pw = alignTo16(pw * s);
    ph = alignTo16(ph * s);
  }
  if (pw * ph > MAX_PIXELS) {
    const s = Math.sqrt(MAX_PIXELS / (pw * ph));
    pw = alignTo16(pw * s);
    ph = alignTo16(ph * s);
  }
  return `${pw}x${ph}`;
}

/**
 * 决定发往 Grsai 上游的 aspectRatio 字段值：
 *   - gpt-image-2-vip ：上游强制像素串
 *       · 已是像素串 → 原样返回
 *       · 'auto'（旧画布残留）→ 退到 1024x1024
 *       · 比例 + 清晰度档：命中 DOC_PRESETS_BY_RES 直接用，否则按当前档 computeVipSize
 *   - 其他模型 ：透传比例字符串 / 'auto'（resolution 参数忽略，已是像素串的旧画布数据也透传）
 */
export function resolveGrsaiAspectRatio(
  ratio: string | undefined | null,
  apiModel: string,
  resolution: GrsaiResolution = DEFAULT_GRSAI_RESOLUTION,
): string {
  const s = String(ratio || '').trim() || 'auto';
  if (!isGptImage2VipModel(apiModel)) return s;
  if (/^\d+x\d+$/i.test(s)) return s.toLowerCase();
  if (s === 'auto') return '1024x1024';
  const res = GRSAI_RESOLUTIONS.includes(resolution) ? resolution : DEFAULT_GRSAI_RESOLUTION;
  const preset = DOC_PRESETS_BY_RES[res]?.[s];
  if (preset) return preset;
  const m = /^(\d+):(\d+)$/.exec(s);
  if (!m) return '1024x1024';
  return computeVipSize(parseInt(m[1], 10), parseInt(m[2], 10), RES_TO_TARGET_PIXELS[res]);
}

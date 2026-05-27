/**
 * Grsai size 映射 —— UI 只显示比例，部分模型在调用 API 前转为像素串
 *
 * 设计目标：
 *   1. UI 侧统一展示比例（auto / 1:1 / 16:9 / …），不再向用户暴露像素串
 *   2. 不同 apiModel 支持的比例集合不同：
 *      - nano-banana / nano-banana-pro 系列 ：通用 11 个比例（≤3:1）
 *      - nano-banana-2 系列 ：通用 11 + 极端 4 个（1:4 / 4:1 / 1:8 / 8:1）
 *      - gpt-image-2 系列（含 vip）：通用 11 个比例（与 Qiniu openai/gpt-image-2 一致）
 *   3. gpt-image-2-vip 上游强制像素串，在 runner 提交前完成 ratio → 像素串转换；
 *      其余模型透传比例字符串
 *
 * 兼容性：
 *   - 旧画布若保存的是像素串（v1.5.6 早期 UI 允许像素串），resolveGrsaiAspectRatio
 *     会原样返回，不影响生成
 *   - GrsaiImageTab 渲染时若发现旧的像素串值不在新列表内，会回退到 default 显示
 */

export const DEFAULT_GRSAI_RATIO = 'auto';

// 通用 11 个比例（auto + 10 个 ≤3:1）
const COMMON_RATIOS = [
  'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9',
];

// nano-banana-2 系列额外支持的 4 个极端比例（>3:1）
const NANO_BANANA_2_EXTRA = ['1:4', '4:1', '1:8', '8:1'];
const NANO_BANANA_2_RATIOS = [...COMMON_RATIOS, ...NANO_BANANA_2_EXTRA];

// 11 个 Grsai apiModel 与各自支持的比例集合
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
  'gpt-image-2-vip': COMMON_RATIOS,
};

/** 取得指定 apiModel 支持的比例集合；未知 apiModel 退回通用 11 个 */
export function getGrsaiRatiosForApiModel(apiModel: string | undefined | null): string[] {
  return RATIOS_BY_API_MODEL[String(apiModel || '')] || COMMON_RATIOS;
}

// ============================================================================
// gpt-image-2-vip 专用：ratio → 像素串 转换
// ============================================================================

function isGptImage2Vip(model: string): boolean {
  return /^gpt-image-2.*vip$/i.test(String(model || ''));
}

const ALIGN = 16;
const TARGET_PIXELS = 1_048_576;
const MAX_EDGE = 3840;
const MIN_EDGE = 64;

// 文档「常用 size」一栏直接映射（命中后无需计算）
const COMMON_RATIO_TO_VIP_SIZE: Record<string, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
};

function alignTo16(n: number): number {
  const v = Math.round(n / ALIGN) * ALIGN;
  return Math.max(MIN_EDGE, v);
}

function computePixelSize(w: number, h: number): string {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '1024x1024';
  const scale = Math.sqrt(TARGET_PIXELS / (w * h));
  let pw = alignTo16(w * scale);
  let ph = alignTo16(h * scale);
  const longest = Math.max(pw, ph);
  if (longest > MAX_EDGE) {
    const s = MAX_EDGE / longest;
    pw = alignTo16(pw * s);
    ph = alignTo16(ph * s);
  }
  return `${pw}x${ph}`;
}

/**
 * 决定发往 Grsai 上游的 aspectRatio 字段值：
 *   - gpt-image-2-vip ：上游强制像素串
 *       · 'auto' → 退到默认 1024x1024（vip 不接受 'auto'）
 *       · 已是像素串 → 原样返回
 *       · 比例 → 命中常用表则直接用文档值，否则按 1MP + 16 对齐计算
 *   - 其他模型 ：透传比例字符串 / 'auto'（已是像素串的旧画布数据也透传）
 */
export function resolveGrsaiAspectRatio(
  ratio: string | undefined | null,
  apiModel: string,
): string {
  const s = String(ratio || '').trim() || 'auto';
  if (!isGptImage2Vip(apiModel)) return s;
  if (s === 'auto') return '1024x1024';
  if (/^\d+x\d+$/i.test(s)) return s.toLowerCase();
  if (COMMON_RATIO_TO_VIP_SIZE[s]) return COMMON_RATIO_TO_VIP_SIZE[s];
  const m = /^(\d+):(\d+)$/.exec(s);
  if (!m) return '1024x1024';
  return computePixelSize(parseInt(m[1], 10), parseInt(m[2], 10));
}

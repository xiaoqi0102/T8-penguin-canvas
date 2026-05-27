/**
 * 七牛云 size 映射 —— UI 只显示比例，调用 API 时转换为像素串
 *
 * 设计目标：
 *   1. UI 侧统一展示比例（1:1 / 16:9 / 9:16 / …），与项目内其他图像模型保持一致
 *   2. 不同 apiModel 支持的比例集合不同：
 *      - gemini-3.1-flash-image-preview ：全 14 个比例（含 1:4/4:1/1:8/8:1 超 3:1 比例）
 *      - openai/gpt-image-2 ：仅 10 个 ≤3:1 比例（文档明确「长边/短边 ≤ 3:1」）
 *   3. 上游 API（/v1/images/generations）要求像素串或 'auto'，因此在 runner
 *      提交前做一次比例 → 像素串转换
 *
 * 像素来源（按优先级）：
 *   - 命中文档「常用 size」一栏：直接使用文档给定的像素值（1:1 → 1024x1024 等）
 *   - 未命中：以约 1MP 为目标按比例计算，并对齐到 16px 倍数；长边超过 3840px 时缩放
 *
 * 注意：
 *   - 旧画布中如保存的是像素串（v1.5.6 旧数据），传入 ratioToQiniuSize 会直接原样返回
 *   - /v1/images/edits 不接受 size 参数，因此图生图分支无视 qiniuSize（见 backend proxy）
 */

const ALIGN = 16;
const TARGET_PIXELS = 1_048_576; // 约 1MP，处于 [655_360, 8_294_400] 区间内
const MAX_EDGE = 3840;
const MIN_EDGE = 64;

export const DEFAULT_QINIU_RATIO = 'auto';

// gemini-3.1-flash-image-preview 支持的全部比例（与项目内 GPT_RATIOS 同款 14 个 + auto）
const GEMINI_FLASH_RATIOS = [
  'auto',
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9',
  '1:4', '4:1', '1:8', '8:1',
];

// openai/gpt-image-2 仅支持 ≤3:1 的比例（文档约束「长边/短边 ≤ 3:1」）
// 排除：1:4 / 4:1 / 1:8 / 8:1（超出 3:1 约束）
const GPT_IMAGE_2_RATIOS = [
  'auto',
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9',
];

const RATIOS_BY_API_MODEL: Record<string, string[]> = {
  'gemini-3.1-flash-image-preview': GEMINI_FLASH_RATIOS,
  'openai/gpt-image-2': GPT_IMAGE_2_RATIOS,
};

/** 取得指定 apiModel 支持的比例集合；未知 apiModel 退回 gemini 的全集 */
export function getQiniuRatiosForApiModel(apiModel: string | undefined | null): string[] {
  return RATIOS_BY_API_MODEL[String(apiModel || '')] || GEMINI_FLASH_RATIOS;
}

// 文档「常用 size」一栏直接映射（命中后无需计算，避免与官方推荐尺寸不一致）
// 文档原文（openai/gpt-image-2）：
//   1024x1024 (square)        → 1:1
//   1536x1024 (landscape)     → 3:2
//   1024x1536 (portrait)      → 2:3
//   2048x1152 (2K landscape)  → 16:9
//   2160x3840 (4K portrait)   → 9:16
// 其余（2048x2048 / 3840x2160）走计算路径或与上面同比例
const COMMON_RATIO_TO_SIZE: Record<string, string> = {
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

/** 按 w:h 比例计算一组满足 API 约束的像素 size */
function computeSize(w: number, h: number): string {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'auto';
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
 * 将比例字符串（如 '1:1' / '16:9'）转换为七牛云接口可接受的像素串。
 * - 'auto' / 空：透传 'auto'
 * - 已是像素串（旧画布数据）：原样返回
 * - 标准比例：优先命中常用 size 表，否则计算
 */
export function ratioToQiniuSize(ratio: string | undefined | null): string {
  if (!ratio) return 'auto';
  const s = String(ratio).trim();
  if (!s || s.toLowerCase() === 'auto') return 'auto';
  if (/^\d+x\d+$/i.test(s)) return s.toLowerCase();
  if (COMMON_RATIO_TO_SIZE[s]) return COMMON_RATIO_TO_SIZE[s];
  const m = /^(\d+):(\d+)$/.exec(s);
  if (!m) return 'auto';
  return computeSize(parseInt(m[1], 10), parseInt(m[2], 10));
}

/**
 * 七牛云 size 映射 —— UI 只显示比例 + 清晰度档，调用 API 时转换为像素串
 *
 * 设计目标：
 *   1. UI 侧统一展示比例（1:1 / 16:9 / 9:16 / …），与项目内其他图像模型保持一致
 *   2. 不同 apiModel 支持的比例集合不同：
 *      - gemini-3.1-flash-image-preview ：全 14 个比例（含 1:4/4:1/1:8/8:1 超 3:1 比例）
 *      - openai/gpt-image-2 ：仅 10 个 ≤3:1 比例（文档明确「长边/短边 ≤ 3:1」）
 *   3. openai/gpt-image-2 支持 1K / 2K / 4K 三档清晰度，由 ratioToQiniuSize 的
 *      resolution 参数控制；
 *      gemini-3.1-flash-image-preview 同样支持 1K/2K/4K 但走自己的 image_config 协议
 *      ——v1.6.2 起 runner 直接送原始比例字符串到 body.aspectRatio / 后端 image_config.aspect_ratio，
 *      不经过本 sizeMap 的像素串转换函数（ratioToQiniuSize 仅服务 openai/gpt-image-2 子模型）
 *   4. 上游 API 同时接受 /v1/images/generations 与 /v1/images/edits 的 size 字段，
 *      runner 提交前做一次比例 → 像素串转换（'auto' 透传；仅 openai 子模型走该转换）
 *
 * 像素来源（按优先级）：
 *   - 命中各档位 DOC_PRESETS_BY_RES 文档预设：直接使用文档给定的像素值
 *   - 未命中：以当前档位的 TARGET_PIXELS 为目标按比例计算，并对齐到 16px 倍数；
 *     长边超过 3840px 时缩放，总像素受文档上限 8,294,400 约束
 *
 * 兼容性：
 *   - 旧画布中如保存的是像素串（v1.5.6 早期 UI 允许像素串），传入 ratioToQiniuSize 会直接原样返回
 *   - 旧画布无 qiniuResolution 字段时，runner 默认补 '1K'，与 v1.5.6 行为完全一致
 *   - gemini 节点的像素串残留：runner 检测 /^\d+x\d+$/ 不送 aspectRatio，让上游默认（v1.6.2）
 */

const ALIGN = 16;
const MAX_EDGE = 3840;
const MIN_EDGE = 64;
const MAX_PIXELS = 8_294_400; // 文档总像素上限（3840×2160）

export type QiniuResolution = '1K' | '2K' | '4K';

export const DEFAULT_QINIU_RATIO = 'auto';
export const DEFAULT_QINIU_RESOLUTION: QiniuResolution = '1K';
export const QINIU_RESOLUTIONS: QiniuResolution[] = ['1K', '2K', '4K'];

// 三档目标像素数（未命中预设时由 computeSize 使用）
const RES_TO_TARGET_PIXELS: Record<QiniuResolution, number> = {
  '1K': 1_048_576, // ≈1 MP（≈1024²）
  '2K': 4_194_304, // ≈4 MP（≈2048²）
  '4K': 8_294_400, // 文档上限 8.29 MP（3840×2160）
};

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

// 文档「常用 size」预设表，按清晰度档拆分（命中后直接用文档值，避免与官方推荐尺寸不一致）
// 文档原文（openai/gpt-image-2）：
//   1K  : 1024x1024 (1:1) · 1536x1024 (3:2) · 1024x1536 (2:3)
//   2K  : 2048x2048 (1:1) · 2048x1152 (16:9)
//   4K  : 3840x2160 (16:9) · 2160x3840 (9:16)
// 1K 档保留 v1.5.6 的 16:9 / 9:16 映射，确保旧画布默认行为不变
const DOC_PRESETS_BY_RES: Record<QiniuResolution, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '2048x1152', // v1.5.6 兼容
    '9:16': '1152x2048', // v1.5.6 兼容
  },
  '2K': {
    '1:1': '2048x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '4K': {
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
};

function alignTo16(n: number): number {
  const v = Math.round(n / ALIGN) * ALIGN;
  return Math.max(MIN_EDGE, v);
}

/** 按 w:h 比例计算一组满足 API 约束的像素 size（按目标像素数缩放 + 16 对齐 + 长边 ≤ 3840 + 总像素 ≤ 8.29MP） */
function computeSize(w: number, h: number, targetPixels: number): string {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'auto';
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
  // 兜底：若计算后总像素超上限（极端比例可能），按比例缩放
  if (pw * ph > MAX_PIXELS) {
    const s = Math.sqrt(MAX_PIXELS / (pw * ph));
    pw = alignTo16(pw * s);
    ph = alignTo16(ph * s);
  }
  return `${pw}x${ph}`;
}

/**
 * 将比例字符串（如 '1:1' / '16:9'）转换为七牛云接口可接受的像素串。
 * - 'auto' / 空：透传 'auto'
 * - 已是像素串（旧画布数据）：原样返回
 * - 标准比例：优先命中当前档位 DOC_PRESETS_BY_RES，否则按当前档位目标像素计算
 */
export function ratioToQiniuSize(
  ratio: string | undefined | null,
  resolution: QiniuResolution = DEFAULT_QINIU_RESOLUTION,
): string {
  if (!ratio) return 'auto';
  const s = String(ratio).trim();
  if (!s || s.toLowerCase() === 'auto') return 'auto';
  if (/^\d+x\d+$/i.test(s)) return s.toLowerCase();
  const res = QINIU_RESOLUTIONS.includes(resolution) ? resolution : DEFAULT_QINIU_RESOLUTION;
  const presets = DOC_PRESETS_BY_RES[res];
  if (presets[s]) return presets[s];
  const m = /^(\d+):(\d+)$/.exec(s);
  if (!m) return 'auto';
  return computeSize(parseInt(m[1], 10), parseInt(m[2], 10), RES_TO_TARGET_PIXELS[res]);
}

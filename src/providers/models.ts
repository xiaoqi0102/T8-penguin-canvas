/**
 * 模型注册表 - 集中定义可扩展模型清单
 * 后续要新增模型只需在对应数组里追加即可
 */

export type ProviderType = 'zhenzhen' | 'llm-direct' | 'runninghub';

// ========== 图像 ==========
// paramKind:决定调用上游时使用哪种参数协议
//  - 'gpt-size'    : OpenAI 兼容,size 字段为像素串(1024x1024 等),编辑端点 multipart
//  - 'banana-ratio': nano-banana 协议,使用 aspect_ratio + image_size(1K/2K/4K) + image[]
export type ImageParamKind = 'gpt-size' | 'banana-ratio';

export interface ImageModelDef {
  id: string;             // 节点内部 id(如 'gpt-image-2')
  apiModel: string;       // 默认上游真实模型名(透传给 API)
  label: string;          // 长名(用于描述行)
  tabLabel: string;       // TAB 短名
  provider: ProviderType;
  paramKind: ImageParamKind;
  capabilities: ('t2i' | 'i2i' | 'edit' | 'text-render')[];
  // 子模型变体(对齐主项目 gpt-image-2-web 的 g_model / n_model 下拉)
  apiModelOptions: Array<{ value: string; label: string }>;
  // 比例选项(双协议通用,Auto/1:1/16:9 …)
  aspectRatios: string[];
  defaultAspectRatio: string;
  // 尺寸选项:gpt-size 用像素串(1024x1024…), banana-ratio 用等级(1K/2K/4K)
  sizes: string[];
  defaultSize: string;
  // 是否支持参考图(图生图)
  supportsReference: boolean;
  // 参考图最大数量
  maxReferenceImages: number;
  description?: string;
}

// 主项目 gpt-image-2-web 的 aspectRatio 全集(14 种 + Auto)
const GPT_RATIOS = ['Auto', '1:1', '16:9', '4:3', '4:5', '3:2', '2:3', '3:4', '5:4', '9:16', '21:9', '1:4', '4:1', '1:8', '8:1'];
// nano-banana-2(Flash)支持全部 14 个比例,Pro 支持精简集
const BANANA_FLASH_RATIOS = GPT_RATIOS;
const BANANA_PRO_RATIOS = ['Auto', '1:1', '16:9', '4:3', '4:5', '3:2', '2:3', '3:4', '5:4', '9:16', '21:9'];

export const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: 'gpt-image-2',
    apiModel: 'gpt-image-2-all', // 主项目 Tab 0 默认选中
    label: 'GPT Image 2',
    tabLabel: 'GPT2',
    provider: 'zhenzhen',
    paramKind: 'gpt-size',
    capabilities: ['t2i', 'i2i', 'edit', 'text-render'],
    apiModelOptions: [
      { value: 'gpt-image-2-all', label: 'gpt-image-2-all' },
      { value: 'gpt-image-2', label: 'gpt-image-2' },
      { value: 'gpt-image-2-fal', label: 'gpt-image-2-fal' },
    ],
    aspectRatios: GPT_RATIOS,
    defaultAspectRatio: '1:1',
    sizes: ['1K', '2K', '4K'],
    defaultSize: '2K', // 主项目默认为 2K
    supportsReference: true,
    maxReferenceImages: 5,
    description: '支持文生图/图生图/编辑/文字渲染',
  },
  {
    id: 'nano-banana-2',
    apiModel: 'nano-banana-2',
    label: 'Nano Banana 2',
    tabLabel: '香蕉2',
    provider: 'zhenzhen',
    paramKind: 'banana-ratio',
    capabilities: ['t2i', 'i2i'],
    apiModelOptions: [
      { value: 'nano-banana-2', label: 'nano-banana-2 (Flash)' },
    ],
    aspectRatios: BANANA_FLASH_RATIOS,
    defaultAspectRatio: '1:1',
    sizes: ['1K', '2K', '4K'],
    defaultSize: '2K',
    supportsReference: true,
    maxReferenceImages: 5,
    description: '高速生成,适合迭代',
  },
  {
    id: 'nano-banana-pro',
    apiModel: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    tabLabel: '香蕉Pro',
    provider: 'zhenzhen',
    paramKind: 'banana-ratio',
    capabilities: ['t2i', 'i2i', 'edit'],
    apiModelOptions: [
      { value: 'nano-banana-pro', label: 'nano-banana-pro' },
      { value: 'nano-banana-pro-2k', label: 'nano-banana-pro-2k' },
      { value: 'nano-banana-pro-4k', label: 'nano-banana-pro-4k' },
      { value: 'nano-banana-pro-fal', label: 'nano-banana-pro-fal' },
    ],
    aspectRatios: BANANA_PRO_RATIOS,
    defaultAspectRatio: '1:1',
    sizes: ['1K', '2K', '4K'],
    defaultSize: '2K',
    supportsReference: true,
    maxReferenceImages: 5,
    description: '高品质 Pro 版本',
  },
];

// ========================================================================
// FAL 渠道注册表(完全对齐 gpt-image-2-web SKILL.md §FAL模型渠道接入规范)
//   - URL: {baseUrl}/fal/{endpoint}   (替换官方 queue.fal.run)
//   - 同步: response.images[]; 异步: request_id + response_url + 轮询
//   - response_url 域名修复: queue.fal.run → {baseUrl}/fal
//   - 轮询 HTTP 非 200 时,body 中 status==='IN_QUEUE'/'IN_PROGRESS' 时重试,否则抛错
// ========================================================================
// FAL 参数协议种类
//   - 'gpt-fal'      : openai/gpt-image-2(/edit) — quality/num_images/output_format/image_size/sync_mode
//   - 'nbpro-fal'    : fal-ai/nano-banana-pro/edit — num_images/aspect_ratio/resolution/output_format/safety_tolerance/system_prompt/enable_web_search
export type FalParamKind = 'gpt-fal' | 'nbpro-fal';

export interface FalEndpointDef {
  /** 文生图(无参考图)endpoint */
  endpoint: string;
  /** 图生图(有参考图,image_urls)endpoint;不填则与 endpoint 相同 */
  editEndpoint?: string;
  paramKind: FalParamKind;
  /** 最大参考图数(主项目: gpt=5, nbpro=8) */
  maxRefs: number;
}

/** 按 apiModel(如 'gpt-image-2-fal' / 'nano-banana-pro-fal')索引 */
export const FAL_REGISTRY: Record<string, FalEndpointDef> = {
  'gpt-image-2-fal': {
    endpoint: 'openai/gpt-image-2',
    editEndpoint: 'openai/gpt-image-2/edit',
    paramKind: 'gpt-fal',
    maxRefs: 5,
  },
  'nano-banana-pro-fal': {
    // nano-banana-pro FAL 只对外提供 edit 端点(主项目 line 3623)
    endpoint: 'fal-ai/nano-banana-pro/edit',
    editEndpoint: 'fal-ai/nano-banana-pro/edit',
    paramKind: 'nbpro-fal',
    maxRefs: 8,
  },
};

/** 判断一个 apiModel 是否走 FAL 协议 */
export function isFalModel(apiModel: string | undefined | null): boolean {
  if (!apiModel) return false;
  return !!FAL_REGISTRY[String(apiModel)] || /-fal$/.test(String(apiModel));
}

/** GPT FAL 预设尺寸枚举(主项目 g_model 切到 fal 时的 gf_size 下拉) */
export const GPT_FAL_SIZES = [
  { value: 'auto', label: 'Auto' },
  { value: 'square_hd', label: 'Square HD' },
  { value: 'square', label: 'Square' },
  { value: 'portrait_4_3', label: 'Portrait 4:3' },
  { value: 'portrait_16_9', label: 'Portrait 16:9' },
  { value: 'landscape_4_3', label: 'Landscape 4:3' },
  { value: 'landscape_16_9', label: 'Landscape 16:9' },
  { value: 'custom', label: 'Custom (16 倍数)' },
];

/** Nano Banana Pro FAL 比例枚举(主项目 nf_ratio) */
export const NBPRO_FAL_RATIOS = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'];
/** Nano Banana Pro FAL 分辨率枚举(主项目 nf_resolution) */
export const NBPRO_FAL_RESOLUTIONS = ['1K', '2K', '4K'];

// ========== 视频 ==========
// kind 决定上游 payload 协议(后端会根据 model 名自动识别,前端主要用于控制参数 UI 列表)
export type VideoKind = 'veo' | 'grok' | 'seedance';

export interface VideoModelDef {
  id: string;                // 节点默认 model 字段(也是上游真实 model)
  label: string;             // 主选项显示名
  kind: VideoKind;
  provider: ProviderType;
  description?: string;
  // 子模型下拉(参考项目 类似 gpt-image-2-web 的 g_model / veo_model / gk_model)
  apiModelOptions: Array<{ value: string; label: string }>;
  // 比例/尺寸 — 字段名上游各不同,这里只是 UI 选项
  ratios: string[];
  defaultRatio: string;
  // Grok 专用:duration(s)、resolution 下拉
  durations?: number[];
  defaultDuration?: number;
  resolutions?: string[];
  defaultResolution?: string;
  // 参考图
  supportImages: boolean;
  maxRefImages: number;
}

// veo3.1 完整 13 个子模型(主项目 index.html line 1350)
const VEO_MODELS = [
  { value: 'veo3', label: 'veo3' },
  { value: 'veo3-fast', label: 'veo3-fast' },
  { value: 'veo3-pro', label: 'veo3-pro' },
  { value: 'veo3-fast-frames', label: 'veo3-fast-frames' },
  { value: 'veo3-pro-frames', label: 'veo3-pro-frames' },
  { value: 'veo3.1', label: 'veo3.1 默认' },
  { value: 'veo3.1-fast', label: 'veo3.1-fast' },
  { value: 'veo3.1-pro', label: 'veo3.1-pro' },
  { value: 'veo3.1-components', label: 'veo3.1-components' },
  { value: 'veo3.1-4k', label: 'veo3.1-4k' },
  { value: 'veo3.1-pro-4k', label: 'veo3.1-pro-4k' },
  { value: 'veo3.1-components-4k', label: 'veo3.1-components-4k' },
  { value: 'veo3.1-lite', label: 'veo3.1-lite' },
];

export const VIDEO_MODELS: VideoModelDef[] = [
  {
    id: 'veo3.1',
    label: 'Veo 3.1',
    kind: 'veo',
    provider: 'zhenzhen',
    description: 'Google Veo 3.1 系列 (最多 3 张参考图)',
    apiModelOptions: VEO_MODELS,
    // 主项目 veo_ratio 只有 16:9 / 9:16(line 1352)
    ratios: ['16:9', '9:16'],
    defaultRatio: '16:9',
    supportImages: true,
    maxRefImages: 3,
  },
  {
    id: 'grok-video-3',
    label: 'Grok Video',
    kind: 'grok',
    provider: 'zhenzhen',
    description: 'xAI Grok Video (最多 7 张参考图)',
    apiModelOptions: [{ value: 'grok-video-3', label: 'grok-video-3' }],
    // 主项目 gk_ratio(line 1410): 2:3 / 3:2 / 16:9 / 9:16 / 1:1
    ratios: ['2:3', '3:2', '16:9', '9:16', '1:1'],
    defaultRatio: '16:9',
    // gk_duration(line 1412): 6 / 10 / 15 / 30
    durations: [6, 10, 15, 30],
    defaultDuration: 15,
    // gk_resolution(line 1414): 480P / 720P
    resolutions: ['480P', '720P'],
    defaultResolution: '720P',
    supportImages: true,
    maxRefImages: 7,
  },
  {
    id: 'seedance-2.0',
    label: 'Seedance 2.0',
    kind: 'seedance',
    provider: 'zhenzhen',
    description: '字节 Seedance 分镜 (兼容 veo 字段)',
    apiModelOptions: [{ value: 'seedance-2.0', label: 'seedance-2.0' }],
    ratios: ['16:9', '9:16', '1:1'],
    defaultRatio: '16:9',
    durations: [5, 10, 15],
    defaultDuration: 5,
    supportImages: true,
    maxRefImages: 3,
  },
];

// ========== 音频(Suno) ==========
export interface AudioModelDef {
  id: string;
  label: string;
  provider: ProviderType;
  mode: 'generate' | 'cover' | 'extend';
  description?: string;
}

export const AUDIO_MODELS: AudioModelDef[] = [
  { id: 'suno-v5.5-generate', label: 'Suno V5.5 生成', provider: 'zhenzhen', mode: 'generate' },
  { id: 'suno-v5.5-cover', label: 'Suno V5.5 翻唱', provider: 'zhenzhen', mode: 'cover' },
  { id: 'suno-v5.5-extend', label: 'Suno V5.5 续写', provider: 'zhenzhen', mode: 'extend' },
];

// ========== LLM/Vision ==========
export interface LlmModelDef {
  id: string;
  label: string;
  provider: ProviderType;
  vision?: boolean;
  contextLength?: number;
  description?: string;
}

export const LLM_MODELS: LlmModelDef[] = [
  { id: 'gpt-5', label: 'GPT-5', provider: 'llm-direct', vision: true, contextLength: 200_000 },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', provider: 'llm-direct', vision: true, contextLength: 200_000 },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'llm-direct', vision: true, contextLength: 1_000_000 },
];

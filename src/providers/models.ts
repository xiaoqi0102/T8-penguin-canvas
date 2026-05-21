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
  apiModel: string;       // 上游真实模型名(透传给 API)
  label: string;          // 长名(用于描述行)
  tabLabel: string;       // TAB 短名
  provider: ProviderType;
  paramKind: ImageParamKind;
  capabilities: ('t2i' | 'i2i' | 'edit' | 'text-render')[];
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
    apiModel: 'gpt-image-2-all', // 主项目 GPT2 默认走逆向分组(便宜)
    label: 'GPT Image 2',
    tabLabel: 'GPT2',
    provider: 'zhenzhen',
    paramKind: 'gpt-size',
    capabilities: ['t2i', 'i2i', 'edit', 'text-render'],
    aspectRatios: GPT_RATIOS,
    defaultAspectRatio: '1:1',
    // gpt-image-2 支持像素串自由组合,UI 用 1K/2K/4K 等级,后端再映射成像素串
    sizes: ['1K', '2K', '4K'],
    defaultSize: '1K',
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
    aspectRatios: BANANA_PRO_RATIOS,
    defaultAspectRatio: '1:1',
    sizes: ['1K', '2K', '4K'],
    defaultSize: '2K',
    supportsReference: true,
    maxReferenceImages: 5,
    description: '高品质 Pro 版本',
  },
];

// ========== 视频 ==========
export interface VideoModelDef {
  id: string;
  label: string;
  provider: ProviderType;
  description?: string;
  durations?: number[]; // 秒
  aspectRatios?: string[];
  defaultAspectRatio?: string;
  supportImages?: boolean; // 是否支持首帧参考图
}

export const VIDEO_MODELS: VideoModelDef[] = [
  {
    id: 'veo-3.1',
    label: 'Veo 3.1',
    provider: 'zhenzhen',
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16', '1:1'],
    defaultAspectRatio: '16:9',
    supportImages: true,
    description: 'Google Veo 高品质视频',
  },
  {
    id: 'grok-video',
    label: 'Grok Video',
    provider: 'zhenzhen',
    durations: [5, 10],
    aspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    supportImages: true,
    description: 'xAI 视频模型',
  },
  {
    id: 'seedance-2.0',
    label: 'Seedance 2.0',
    provider: 'zhenzhen',
    durations: [5, 10, 15],
    aspectRatios: ['16:9', '9:16', '1:1'],
    defaultAspectRatio: '16:9',
    supportImages: true,
    description: '字节 Seedance 分镜',
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

import type { RhToolboxManifest } from '../utils/rhToolbox';

/**
 * RH工具箱运行 manifest。
 *
 * 维护规则：
 * - 用户包只读取这里的运行配置，不提供客户端编辑入口。
 * - 新增工具优先只新增 manifest，不给节点组件写专属分支。
 * - 没有真实 webappId 前保持 enabled:false；启用时必须填写 webappId 和完整 inputSchema。
 */
export const RH_TOOLBOX_MANIFEST: RhToolboxManifest = {
  schema: 't8-rh-toolbox-manifest',
  version: 1,
  updatedAt: '2026-06-02',
  categories: [
    {
      id: 'image-tools',
      name: '图像工具',
      description: '抠图、编辑、扩图、放大、修复等图像辅助能力',
      icon: 'Image',
      order: 10,
    },
    {
      id: 'video-tools',
      name: '视频工具',
      description: '视频放大、插帧、背景处理、剪辑增强等能力',
      icon: 'Clapperboard',
      order: 20,
    },
    {
      id: 'text-tools',
      name: '文本工具',
      description: '扩写、改写、翻译、提示词增强等文本能力',
      icon: 'Text',
      order: 30,
    },
    {
      id: 'audio-tools',
      name: '音频工具',
      description: '音频克隆、TTS、分离、增强、降噪等能力',
      icon: 'AudioLines',
      order: 40,
    },
  ],
  tools: [
    {
      id: 'image-cutout-template',
      title: '智能抠图（模板）',
      description: '维护者填写 RunningHub WebApp ID 后启用；用于图像主体抠图并返回透明 PNG。',
      categoryId: 'image-tools',
      webappId: '',
      enabled: false,
      order: 10,
      capabilities: ['image.cutout', 'image.edit'],
      inputSchema: [
        {
          key: 'source-image',
          label: '原图',
          kind: 'image',
          rhNodeId: '7',
          fieldName: 'image',
          required: true,
          uploadAsset: true,
        },
      ],
      outputSchema: [
        {
          key: 'transparent-image',
          label: '透明图',
          kind: 'image',
          role: 'replace-source',
        },
      ],
      runtime: { instanceType: 'default', pollIntervalMs: 5000, maxPolls: 480 },
      ui: {
        icon: 'Scissors',
        accent: '#22c55e',
        quickActionLabel: '抠图',
        showInNode: true,
        showInImageEditor: true,
      },
    },
    {
      id: 'video-upscale-template',
      title: '视频放大（模板）',
      description: '维护者填写 RunningHub WebApp ID 后启用；用于视频超分/高清修复。',
      categoryId: 'video-tools',
      webappId: '',
      enabled: false,
      order: 20,
      capabilities: ['video.upscale', 'video.edit'],
      inputSchema: [
        {
          key: 'source-video',
          label: '原视频',
          kind: 'video',
          rhNodeId: '8',
          fieldName: 'video',
          required: true,
          uploadAsset: true,
        },
      ],
      outputSchema: [
        {
          key: 'upscaled-video',
          label: '放大视频',
          kind: 'video',
          role: 'append-output',
        },
      ],
      runtime: { instanceType: 'default', pollIntervalMs: 5000, maxPolls: 480 },
      ui: {
        icon: 'ZoomIn',
        accent: '#f97316',
        quickActionLabel: '视频放大',
        showInNode: true,
        showInVideoEditor: true,
      },
    },
    {
      id: 'text-expand-template',
      title: '文本扩写（模板）',
      description: '维护者填写 RunningHub WebApp ID 后启用；用于把短提示扩成完整创作描述。',
      categoryId: 'text-tools',
      webappId: '',
      enabled: false,
      order: 30,
      capabilities: ['text.expand', 'text.prompt-enhance'],
      inputSchema: [
        {
          key: 'source-text',
          label: '原文本',
          kind: 'text',
          rhNodeId: '30',
          fieldName: 'prompt',
          required: true,
          uploadAsset: false,
        },
      ],
      outputSchema: [
        {
          key: 'expanded-text',
          label: '扩写文本',
          kind: 'text',
          role: 'text-only',
        },
      ],
      runtime: { instanceType: 'default', pollIntervalMs: 5000, maxPolls: 480 },
      ui: {
        icon: 'Sparkles',
        accent: '#38bdf8',
        quickActionLabel: '扩写',
        showInNode: true,
        showInTextEditor: true,
      },
    },
    {
      id: 'audio-clone-template',
      title: '音频克隆（模板）',
      description: '维护者填写 RunningHub WebApp ID 后启用；用于声音克隆或声音风格迁移。',
      categoryId: 'audio-tools',
      webappId: '',
      enabled: false,
      order: 40,
      capabilities: ['audio.clone', 'audio.tts'],
      inputSchema: [
        {
          key: 'source-audio',
          label: '参考音频',
          kind: 'audio',
          rhNodeId: '12',
          fieldName: 'audio',
          required: true,
          uploadAsset: true,
        },
        {
          key: 'source-text',
          label: '朗读文本',
          kind: 'text',
          rhNodeId: '30',
          fieldName: 'text',
          required: false,
          uploadAsset: false,
        },
      ],
      outputSchema: [
        {
          key: 'cloned-audio',
          label: '克隆音频',
          kind: 'audio',
          role: 'append-output',
        },
      ],
      runtime: { instanceType: 'default', pollIntervalMs: 5000, maxPolls: 480 },
      ui: {
        icon: 'Mic2',
        accent: '#a78bfa',
        quickActionLabel: '克隆',
        showInNode: true,
        showInAudioEditor: true,
      },
    },
  ],
};

export default RH_TOOLBOX_MANIFEST;

import type { ComfyAppManifest } from '../utils/comfyuiApps';
import {
  BASIC_COMFY_TEXT_TO_IMAGE_SAMPLE_ID,
  createBasicComfyTextToImageWorkflow,
} from '../utils/comfyuiWorkflow';

/**
 * ComfyUI 超市内置应用清单。
 *
 * 维护规则：
 * - 真实 workflow 应用优先通过「ComfyUI应用制作工具」生成后再粘到这里。
 * - 新增应用优先只改 manifest，不给节点组件写专属分支。
 * - 用户自己制作/导入的应用保存在浏览器本地库，不写入这个文件。
 */
export const COMFYUI_APP_MANIFEST: ComfyAppManifest = {
  schema: 't8-comfyui-app-manifest',
  version: 1,
  updatedAt: '2026-06-04',
  categories: [
    {
      id: 'general',
      name: '我的工作流',
      description: '用户从本地 ComfyUI API Workflow 制作的应用',
      icon: 'Workflow',
      order: 10,
    },
    {
      id: 'image',
      name: '图像生成',
      description: '文生图、图生图、风格化和角色图生成',
      icon: 'Image',
      order: 20,
    },
    {
      id: 'edit',
      name: '图像编辑',
      description: '重绘、局部修改、放大、修复和抠图',
      icon: 'Wand2',
      order: 30,
    },
    {
      id: 'video',
      name: '视频工作流',
      description: '视频合成、插帧、放大和风格迁移',
      icon: 'Clapperboard',
      order: 40,
    },
  ],
  apps: [
    {
      id: BASIC_COMFY_TEXT_TO_IMAGE_SAMPLE_ID,
      title: '基础文生图样例',
      categoryId: 'image',
      description: '用于学习字段映射和首次连通测试；运行前把 Checkpoint 改成本机已安装的模型文件名。',
      workflowJson: createBasicComfyTextToImageWorkflow(),
      fields: [
        { nodeId: '1', fieldName: 'ckpt_name', source: 'ckpt_name' },
        { nodeId: '2', fieldName: 'text', source: 'prompt' },
        { nodeId: '3', fieldName: 'text', source: 'negative' },
        { nodeId: '4', fieldName: 'width', source: 'width' },
        { nodeId: '4', fieldName: 'height', source: 'height' },
        { nodeId: '4', fieldName: 'batch_size', source: 'batch_size' },
        { nodeId: '5', fieldName: 'seed', source: 'seed' },
        { nodeId: '5', fieldName: 'steps', source: 'steps' },
        { nodeId: '5', fieldName: 'cfg', source: 'cfg' },
        { nodeId: '5', fieldName: 'sampler_name', source: 'sampler_name' },
        { nodeId: '5', fieldName: 'scheduler', source: 'scheduler' },
      ],
      userParams: [
        {
          key: 'ckpt-name',
          label: 'Checkpoint',
          kind: 'text',
          source: 'ckpt_name',
          defaultValue: '请改成你的模型.safetensors',
          placeholder: '例如 sd_xl_base_1.0.safetensors',
          required: true,
        },
        {
          key: 'prompt',
          label: '正向 Prompt',
          kind: 'textarea',
          source: 'prompt',
          defaultValue: 'a cozy studio, soft light, highly detailed',
          required: true,
          rows: 5,
        },
        {
          key: 'negative',
          label: '负向 Prompt',
          kind: 'textarea',
          source: 'negative',
          defaultValue: 'low quality, blurry, bad anatomy',
          rows: 4,
        },
        { key: 'width', label: '宽度', kind: 'number', source: 'width', defaultValue: 1024, min: 64, max: 8192, step: 8 },
        { key: 'height', label: '高度', kind: 'number', source: 'height', defaultValue: 1024, min: 64, max: 8192, step: 8 },
        { key: 'batch-size', label: '批量数', kind: 'number', source: 'batch_size', defaultValue: 1, min: 1, max: 16, step: 1 },
        { key: 'seed', label: 'Seed', kind: 'number', source: 'seed', defaultValue: 123456, step: 1 },
        { key: 'steps', label: 'Steps', kind: 'number', source: 'steps', defaultValue: 20, min: 1, max: 150, step: 1 },
        { key: 'cfg', label: 'CFG', kind: 'number', source: 'cfg', defaultValue: 7, min: 0, max: 30, step: 0.1 },
        { key: 'sampler-name', label: 'Sampler', kind: 'text', source: 'sampler_name', defaultValue: 'euler' },
        { key: 'scheduler', label: 'Scheduler', kind: 'text', source: 'scheduler', defaultValue: 'normal' },
      ],
      outputs: [{ key: 'image', label: '输出图', kind: 'image' }],
      capabilities: ['image.generate', 'sample.workflow'],
      runtime: { pollIntervalMs: 1000, maxPolls: 3600 },
      ui: { icon: 'Workflow', accent: '#67e8f9' },
      version: 1,
      updatedAt: '2026-06-04',
    },
  ],
};

export default COMFYUI_APP_MANIFEST;

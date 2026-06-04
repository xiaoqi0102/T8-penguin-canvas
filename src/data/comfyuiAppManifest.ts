import type { ComfyAppManifest } from '../utils/comfyuiApps';

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
  updatedAt: '2026-06-03',
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
  apps: [],
};

export default COMFYUI_APP_MANIFEST;

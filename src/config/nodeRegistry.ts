import type { NodeMeta } from '../types/canvas';

/**
 * 节点元数据注册表
 * 严格对齐 features.json 中的 24 个保留节点
 * 图标使用 lucide-react 名称(运行时由 Sidebar 动态查找)
 */
export const NODE_REGISTRY: NodeMeta[] = [
  // ========== Input 输入素材(1) ==========
  { type: 'upload', label: '上传素材', category: 'input', description: '图像 / 视频 / 音频 三合一上传(自适应输出端口)', icon: 'Upload', color: 'emerald' },

  // ========== Core 核心节点(6) ==========
  { type: 'text', label: '文本', category: 'core', description: '提示词文本节点', icon: 'Type', color: 'sky' },
  { type: 'image', label: '图像', category: 'core', description: 'GPT Image 2 / Nano Banana Pro / Nano Banana 2 (多 TAB 模型切换)', icon: 'Image', color: 'amber' },
  { type: 'video', label: '视频', category: 'core', description: 'Veo 3.1 / Grok Video', icon: 'Video', color: 'rose' },
  { type: 'seedance', label: 'SD2.0', category: 'core', description: 'Seedance 2.0 视频分镜', icon: 'Film', color: 'fuchsia' },
  { type: 'audio', label: '音频', category: 'core', description: 'Suno V5.5 全模式(生成/翻唱/续写)', icon: 'Music', color: 'violet' },
  { type: 'llm', label: 'LLM', category: 'core', description: 'GPT-5 / Claude 4.5 / Gemini 2.5(独立 Key)', icon: 'Brain', color: 'emerald' },

  // ========== RH RunningHub 节点(2) ==========
  { type: 'runninghub', label: 'RunningHub', category: 'rh', description: 'RH 工作流主节点', icon: 'Workflow', color: 'cyan' },
  { type: 'rh-config', label: 'RH 配置', category: 'rh', description: 'RH 工作流参数注入', icon: 'Settings2', color: 'cyan' },

  // ========== Special 特殊节点(5) ==========
  { type: 'multi-angle-3d', label: '多角度 3D', category: 'special', description: '3D 多视角生成', icon: 'Box', color: 'indigo' },
  { type: 'panorama-720', label: '720 全景', category: 'special', description: '720° 全景图', icon: 'Globe', color: 'indigo' },
  { type: 'penguin-portrait', label: '企鹅肖像', category: 'special', description: '肖像专用流程', icon: 'UserSquare2', color: 'indigo' },
  { type: 'portrait-metadata', label: '肖像元数据', category: 'special', description: '肖像参数管理', icon: 'FileText', color: 'indigo' },
  { type: 'storyboard-grid', label: '分镜网格', category: 'special', description: '分镜九宫格布局', icon: 'LayoutGrid', color: 'indigo' },

  // ========== Utility 工具节点(9) ==========
  { type: 'drawing-board', label: '画板', category: 'utility', description: '手绘 / 涂抹', icon: 'Pencil', color: 'orange' },
  { type: 'browser', label: '浏览器', category: 'utility', description: '网页内嵌', icon: 'Globe2', color: 'orange' },
  { type: 'image-compare', label: '图片对比', category: 'utility', description: '前后对比', icon: 'GitCompare', color: 'orange' },
  { type: 'frame-extractor', label: '抽帧', category: 'utility', description: '视频抽帧', icon: 'Scissors', color: 'orange' },
  { type: 'resize', label: '尺寸调整', category: 'utility', description: '图像尺寸调整', icon: 'Maximize2', color: 'orange' },
  { type: 'combine', label: '合并', category: 'utility', description: '图像合并', icon: 'Combine', color: 'orange' },
  { type: 'remove-bg', label: '抠图', category: 'utility', description: '去除背景', icon: 'Eraser', color: 'orange' },
  { type: 'upscale', label: '放大', category: 'utility', description: '图像放大', icon: 'ZoomIn', color: 'orange' },
  { type: 'grid-crop', label: '九宫格', category: 'utility', description: '网格切图', icon: 'Grid3x3', color: 'orange' },

  // ========== Auxiliary 辅助节点(5) ==========
  { type: 'edit', label: '编辑', category: 'auxiliary', description: '图像编辑/局部', icon: 'Edit3', color: 'slate' },
  { type: 'idea', label: '灵感', category: 'auxiliary', description: '灵感记录', icon: 'Lightbulb', color: 'slate' },
  { type: 'bp', label: 'BP 蓝图', category: 'auxiliary', description: 'Blueprint 蓝图', icon: 'Map', color: 'slate' },
  { type: 'relay', label: '中继', category: 'auxiliary', description: '数据中转', icon: 'ArrowRightLeft', color: 'slate' },
  { type: 'video-output', label: '视频输出', category: 'auxiliary', description: '视频结果展示', icon: 'MonitorPlay', color: 'slate' },

  // ========== Toolbox 工具箱(2) ==========
  { type: 'cinematic', label: '电影感', category: 'toolbox', description: '影视化效果', icon: 'Clapperboard', color: 'pink' },
  { type: 'video-motion', label: '视频运镜', category: 'toolbox', description: '运镜参数', icon: 'Camera', color: 'pink' },
];

// 按分类分组,便于 Sidebar 渲染
export const NODE_GROUPS: Record<string, { label: string; nodes: NodeMeta[] }> = {
  input: { label: '输入素材', nodes: NODE_REGISTRY.filter((n) => n.category === 'input') },
  core: { label: '核心节点', nodes: NODE_REGISTRY.filter((n) => n.category === 'core') },
  rh: { label: 'RH', nodes: NODE_REGISTRY.filter((n) => n.category === 'rh') },
  special: { label: '特殊节点', nodes: NODE_REGISTRY.filter((n) => n.category === 'special') },
  utility: { label: '工具节点', nodes: NODE_REGISTRY.filter((n) => n.category === 'utility') },
  auxiliary: { label: '辅助节点', nodes: NODE_REGISTRY.filter((n) => n.category === 'auxiliary') },
  toolbox: { label: '工具箱', nodes: NODE_REGISTRY.filter((n) => n.category === 'toolbox') },
};

// 通过 type 反查 meta
export function getNodeMeta(type: string): NodeMeta | undefined {
  return NODE_REGISTRY.find((n) => n.type === type);
}

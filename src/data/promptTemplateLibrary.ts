export type PromptTemplateKind = 'image' | 'video';
export type PromptTemplateLanguage = 'zh' | 'en';
export type PromptTemplateSource = 'curated' | 'infinite-canvas' | 'custom';
export type PromptTemplateAttachmentKind = 'image' | 'video' | 'audio';

export interface PromptTemplateAttachment {
  id: string;
  kind: PromptTemplateAttachmentKind;
  url: string;
  previewUrl?: string;
  title?: string;
  mime?: string;
  sourceNodeId?: string;
  createdAt?: string;
}

export interface PromptTemplateCategory {
  id: string;
  kind: PromptTemplateKind;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  order: number;
  builtIn?: boolean;
}

export interface PromptTemplateItem {
  id: string;
  kind: PromptTemplateKind;
  categoryId: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  promptZh: string;
  promptEn: string;
  negativeZh?: string;
  negativeEn?: string;
  tags: string[];
  attachments?: PromptTemplateAttachment[];
  source: PromptTemplateSource;
  builtIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const PROMPT_TEMPLATE_LIBRARY_VERSION = '2026-06-05-t8-media-prompts-quality-v3-seedance';
export const PROMPT_TEMPLATE_MIN_BUILTIN_PER_CATEGORY = 100;
const CURATED_TEMPLATE_MATRIX_SIZE = 10;

const IMAGE_NEGATIVE_ZH =
  '避免：文字、字幕、水印、logo、乱码、低清、过曝、畸形手指、脸部崩坏、构图裁切、主体漂浮、边缘白边、风格不一致。';
const IMAGE_NEGATIVE_EN =
  'Avoid text, captions, watermark, logos, gibberish, low resolution, overexposure, malformed hands, broken faces, cropped composition, floating subject, white halo edges, inconsistent style.';
const VIDEO_NEGATIVE_ZH =
  '避免：跳帧、闪烁、主体变形、脸部漂移、手指畸变、无意义镜头晃动、字幕水印、突然换景、动作不连续。';
const VIDEO_NEGATIVE_EN =
  'Avoid jump cuts, flicker, subject deformation, drifting faces, malformed fingers, meaningless camera shake, captions, watermark, sudden scene changes, broken motion continuity.';

export const PROMPT_TEMPLATE_CATEGORIES: PromptTemplateCategory[] = [
  {
    id: 'image-portrait-character',
    kind: 'image',
    labelZh: '人像 / 角色',
    labelEn: 'Portrait / Character',
    descriptionZh: '角色设定、头像、全身、表情、一致性参考。',
    descriptionEn: 'Character sheets, portraits, full body, expressions, and consistency references.',
    order: 10,
    builtIn: true,
  },
  {
    id: 'image-product-commercial',
    kind: 'image',
    labelZh: '产品 / 电商',
    labelEn: 'Product / Commerce',
    descriptionZh: '产品三视图、详情页、广告主图、材质展示。',
    descriptionEn: 'Product views, ecommerce detail shots, hero ads, and material studies.',
    order: 20,
    builtIn: true,
  },
  {
    id: 'image-storyboard-grid',
    kind: 'image',
    labelZh: '分镜 / 宫格',
    labelEn: 'Storyboard / Grid',
    descriptionZh: '多机位、四宫格、九宫格、连续分镜和视觉推演。',
    descriptionEn: 'Multi-angle grids, storyboard panels, and visual progression sheets.',
    order: 30,
    builtIn: true,
  },
  {
    id: 'image-scene-world',
    kind: 'image',
    labelZh: '场景 / 世界观',
    labelEn: 'Scene / World',
    descriptionZh: '室内外场景、概念环境、世界观氛围和空间逻辑。',
    descriptionEn: 'Interior, exterior, concept environments, world mood, and spatial logic.',
    order: 40,
    builtIn: true,
  },
  {
    id: 'image-style-lighting',
    kind: 'image',
    labelZh: '风格 / 光影',
    labelEn: 'Style / Lighting',
    descriptionZh: '摄影风格、镜头语言、灯光方案、色彩情绪。',
    descriptionEn: 'Photo styles, lens language, lighting setups, and color mood.',
    order: 50,
    builtIn: true,
  },
  {
    id: 'image-poster-brand',
    kind: 'image',
    labelZh: '海报 / 品牌',
    labelEn: 'Poster / Brand',
    descriptionZh: '主视觉、活动海报、社媒封面、品牌调性。',
    descriptionEn: 'Key visuals, campaign posters, social covers, and brand direction.',
    order: 60,
    builtIn: true,
  },
  {
    id: 'image-panorama-vr',
    kind: 'image',
    labelZh: '全景 / VR',
    labelEn: 'Panorama / VR',
    descriptionZh: '720 度全景、左右无缝、室内外漫游贴图。',
    descriptionEn: '720 panorama, seamless horizontal tiling, indoor/outdoor VR textures.',
    order: 70,
    builtIn: true,
  },
  {
    id: 'image-reference-edit',
    kind: 'image',
    labelZh: '参考 / 重绘',
    labelEn: 'Reference / Edit',
    descriptionZh: '图生图、局部重绘、风格迁移、参考图融合。',
    descriptionEn: 'Image-to-image, inpainting, style transfer, and reference blending.',
    order: 80,
    builtIn: true,
  },
  {
    id: 'video-cinematic-shot',
    kind: 'video',
    labelZh: '电影镜头',
    labelEn: 'Cinematic Shots',
    descriptionZh: '单镜头电影感、景别、质感、光影与情绪。',
    descriptionEn: 'Single-shot cinematic prompts with framing, texture, lighting, and mood.',
    order: 10,
    builtIn: true,
  },
  {
    id: 'video-camera-motion',
    kind: 'video',
    labelZh: '运镜 / 镜头运动',
    labelEn: 'Camera Motion',
    descriptionZh: '推拉摇移、跟拍、环绕、手持、锁定镜头。',
    descriptionEn: 'Dolly, pan, tracking, orbit, handheld, and locked-camera motion.',
    order: 20,
    builtIn: true,
  },
  {
    id: 'video-character-action',
    kind: 'video',
    labelZh: '角色动作',
    labelEn: 'Character Action',
    descriptionZh: '人物动作、表演、情绪变化、口播和互动。',
    descriptionEn: 'Character movement, acting, emotional changes, dialogue, and interaction.',
    order: 30,
    builtIn: true,
  },
  {
    id: 'video-product-demo',
    kind: 'video',
    labelZh: '产品短片',
    labelEn: 'Product Video',
    descriptionZh: '产品展示、开箱、质感微距、功能演示。',
    descriptionEn: 'Product reveals, unboxing, macro texture, and feature demos.',
    order: 40,
    builtIn: true,
  },
  {
    id: 'video-social-ad',
    kind: 'video',
    labelZh: '社媒 / 广告',
    labelEn: 'Social / Ads',
    descriptionZh: '短视频广告、口播、开场钩子、节奏化卖点。',
    descriptionEn: 'Short ads, talking-head hooks, social openings, and rhythmic benefits.',
    order: 50,
    builtIn: true,
  },
  {
    id: 'video-transition-vfx',
    kind: 'video',
    labelZh: '转场 / 特效',
    labelEn: 'Transition / VFX',
    descriptionZh: '变形、粒子、环境变化、镜头转场和视觉魔法。',
    descriptionEn: 'Morphs, particles, environment changes, camera transitions, and visual magic.',
    order: 60,
    builtIn: true,
  },
  {
    id: 'video-music-audio',
    kind: 'video',
    labelZh: '音乐 / 声音',
    labelEn: 'Music / Sound',
    descriptionZh: '音乐视频、节拍剪辑、声音驱动、歌词氛围。',
    descriptionEn: 'Music videos, beat edits, sound-driven motion, and lyric atmospheres.',
    order: 70,
    builtIn: true,
  },
  {
    id: 'video-image-to-video',
    kind: 'video',
    labelZh: '图生视频 / 首尾帧',
    labelEn: 'Image-to-Video / Keyframes',
    descriptionZh: '首帧图生视频、首尾帧、智能多帧、全能参考。',
    descriptionEn: 'First-frame video, start/end frames, smart multiframe, and universal references.',
    order: 80,
    builtIn: true,
  },
];

interface Blueprint {
  subjectsZh: string[];
  subjectsEn: string[];
  stylesZh: string[];
  stylesEn: string[];
  motionsZh: string[];
  motionsEn: string[];
  settingsZh: string[];
  settingsEn: string[];
  extraZh: string;
  extraEn: string;
}

const BLUEPRINTS: Record<string, Blueprint> = {
  'image-portrait-character': {
    subjectsZh: ['原创角色', '真实人像', '二次元角色', '游戏 NPC', 'IP 风格人物'],
    subjectsEn: ['original character', 'realistic portrait', 'anime character', 'game NPC', 'IP-style persona'],
    stylesZh: ['角色设定表', '商业写真', '电影剧照', '清透棚拍', '精细概念设计'],
    stylesEn: ['character design sheet', 'commercial portrait', 'cinematic still', 'clean studio portrait', 'detailed concept design'],
    motionsZh: ['正面半身', '全身站姿', '三视图', '六表情', '动态姿势'],
    motionsEn: ['front bust view', 'full-body standing pose', 'three-view sheet', 'six-expression grid', 'dynamic pose'],
    settingsZh: ['浅暖灰背景', '柔和窗光', '45 度棚灯', '低调戏剧光', '自然环境光'],
    settingsEn: ['warm light-gray backdrop', 'soft window light', '45-degree studio light', 'low-key dramatic light', 'natural ambient light'],
    extraZh: '锁定五官、发型、服装、配饰和身形比例，画面干净，适合后续图生视频或角色一致性参考。',
    extraEn: 'Lock facial features, hairstyle, outfit, accessories, and body proportion; keep the frame clean for image-to-video or consistency reference.',
  },
  'image-product-commercial': {
    subjectsZh: ['智能硬件', '美妆产品', '潮流鞋服', '食品饮料', '家居单品'],
    subjectsEn: ['smart device', 'beauty product', 'fashion item', 'food and beverage', 'home object'],
    stylesZh: ['电商主图', '高端广告', '材质微距', '三视图设定', '场景化陈列'],
    stylesEn: ['ecommerce hero image', 'premium advertisement', 'macro material study', 'three-view product sheet', 'lifestyle display'],
    motionsZh: ['正面展示', '45 度角展示', '爆炸结构', '使用场景', '包装组合'],
    motionsEn: ['front presentation', '45-degree hero angle', 'exploded view', 'usage scene', 'packaging set'],
    settingsZh: ['柔和阴影', '高光边缘', '干净台面', '品牌色背景', '浅景深'],
    settingsEn: ['soft shadow', 'rim highlight', 'clean tabletop', 'brand-color backdrop', 'shallow depth of field'],
    extraZh: '强调材质、比例、边缘、反光和可购买感，不出现乱码文案。',
    extraEn: 'Emphasize material, proportion, edges, reflections, and purchase-ready clarity without random text.',
  },
  'image-storyboard-grid': {
    subjectsZh: ['同一角色', '同一产品', '同一空间', '动作过程', '剧情事件'],
    subjectsEn: ['same character', 'same product', 'same space', 'action process', 'story event'],
    stylesZh: ['四宫格分镜', '九宫格多机位', '25 帧故事板', '镜头气氛表', '动作关键帧'],
    stylesEn: ['four-panel storyboard', 'nine-angle camera grid', '25-frame storyboard', 'shot mood sheet', 'action keyframes'],
    motionsZh: ['情绪递进', '角度对比', '从远到近', '动作拆解', '时间推进'],
    motionsEn: ['emotional progression', 'angle comparison', 'wide-to-close progression', 'action breakdown', 'time progression'],
    settingsZh: ['统一光线', '统一背景', '薄白分隔线', '电影颗粒', '角色一致'],
    settingsEn: ['uniform lighting', 'consistent background', 'thin white dividers', 'film grain', 'character consistency'],
    extraZh: '每格主体一致，镜头变化清晰，禁止数字角标、格子编号和可读文字。',
    extraEn: 'Keep subjects consistent across panels, make shot changes readable, and avoid numbers, labels, or readable text.',
  },
  'image-scene-world': {
    subjectsZh: ['室内空间', '室外街区', '奇幻遗迹', '科幻基地', '自然地貌'],
    subjectsEn: ['interior space', 'outdoor street', 'fantasy ruin', 'sci-fi base', 'natural landscape'],
    stylesZh: ['概念设定', '电影美术', '游戏场景', '建筑可视化', '沉浸式环境'],
    stylesEn: ['concept art', 'cinematic production design', 'game environment', 'architectural visualization', 'immersive environment'],
    motionsZh: ['建立镜头', '空间剖面', '中心透视', '鸟瞰布局', '低角度仰视'],
    motionsEn: ['establishing view', 'spatial cutaway', 'central perspective', 'bird-eye layout', 'low-angle view'],
    settingsZh: ['清晰动线', '真实尺度', '天气氛围', '层次景深', '可进入出口'],
    settingsEn: ['clear circulation', 'realistic scale', 'weather atmosphere', 'layered depth', 'logical entrances and exits'],
    extraZh: '场景逻辑自洽，前中后景层次明确，适合生成、扩图、视频建立镜头。',
    extraEn: 'Keep spatial logic coherent with clear foreground, midground, and background for generation, outpainting, or establishing video shots.',
  },
  'image-style-lighting': {
    subjectsZh: ['人物肖像', '产品主体', '室内场景', '街头瞬间', '幻想场面'],
    subjectsEn: ['portrait subject', 'product hero', 'interior scene', 'street moment', 'fantasy scene'],
    stylesZh: ['胶片摄影', '高端时尚', '赛博霓虹', '黑色电影', '清新日系'],
    stylesEn: ['film photography', 'high-fashion editorial', 'cyber neon', 'film noir', 'fresh Japanese style'],
    motionsZh: ['伦勃朗光', '金色时刻', '柔光漫射', '硬光投影', '轮廓逆光'],
    motionsEn: ['Rembrandt lighting', 'golden hour', 'soft diffused light', 'hard shadow light', 'rim backlight'],
    settingsZh: ['低饱和', '高对比', '柔和肤色', '冷暖对比', '真实胶片颗粒'],
    settingsEn: ['muted saturation', 'high contrast', 'soft skin tone', 'warm-cool contrast', 'authentic film grain'],
    extraZh: '只改变风格和光线，不改变主体身份、构图锚点和核心物体。',
    extraEn: 'Change only style and lighting while preserving subject identity, composition anchors, and core objects.',
  },
  'image-poster-brand': {
    subjectsZh: ['活动主视觉', '品牌海报', '课程封面', '新品发布', '社媒封面'],
    subjectsEn: ['campaign key visual', 'brand poster', 'course cover', 'product launch', 'social media cover'],
    stylesZh: ['高端极简', '热血动感', '潮流拼贴', '电影宣发', '科技发布会'],
    stylesEn: ['premium minimal', 'energetic action', 'trend collage', 'cinematic campaign', 'tech launch'],
    motionsZh: ['中心主体', '大留白', '斜向动势', '对称构图', '层叠空间'],
    motionsEn: ['centered subject', 'large negative space', 'diagonal energy', 'symmetrical composition', 'layered space'],
    settingsZh: ['可放标题区', '品牌色控制', '清晰焦点', '强识别轮廓', '可延展版式'],
    settingsEn: ['reserved title area', 'brand color control', 'clear focal point', 'recognizable silhouette', 'extendable layout'],
    extraZh: '预留文字区但不要生成任何真实文字，适合后续人工排版。',
    extraEn: 'Reserve space for typography without generating actual text, suitable for manual layout afterward.',
  },
  'image-panorama-vr': {
    subjectsZh: ['室内展厅', '古风庭院', '科幻基地', '自然峡谷', '游戏关卡'],
    subjectsEn: ['interior showroom', 'classical courtyard', 'sci-fi base', 'natural canyon', 'game level'],
    stylesZh: ['720 度全景', 'VR 环境贴图', '无缝空间', '沉浸漫游', '球面投影'],
    stylesEn: ['720-degree panorama', 'VR environment texture', 'seamless space', 'immersive walkthrough', 'spherical projection'],
    motionsZh: ['左右无缝', '地平线稳定', '上下极点自然', '封闭空间有门', '中心视线清晰'],
    motionsEn: ['seamless left-right edges', 'stable horizon', 'natural poles', 'closed room with a door', 'clear center view'],
    settingsZh: ['2:1 宽幅', '柔和全局光', '空间逻辑一致', '可循环拼接', '无断层'],
    settingsEn: ['2:1 wide aspect', 'soft global illumination', 'consistent spatial logic', 'loopable tiling', 'no visible seam'],
    extraZh: '左右边缘像素级衔接，上下极点自然过渡，封闭空间必须有合理出入口。',
    extraEn: 'Make left and right edges pixel-seamless, poles transition naturally, and closed spaces include plausible exits.',
  },
  'image-reference-edit': {
    subjectsZh: ['参考图主体', '已有角色', '产品照片', '场景草图', '多图参考'],
    subjectsEn: ['reference subject', 'existing character', 'product photo', 'scene sketch', 'multi-image reference'],
    stylesZh: ['保持结构重绘', '换风格', '换光线', '局部修复', '融合参考'],
    stylesEn: ['structure-preserving redraw', 'style transfer', 'relighting', 'local repair', 'reference fusion'],
    motionsZh: ['保留轮廓', '保留姿势', '保留材质', '增强细节', '统一画风'],
    motionsEn: ['preserve silhouette', 'preserve pose', 'preserve material', 'enhance details', 'unify art direction'],
    settingsZh: ['自然边缘', '无贴图感', '颜色统一', '真实阴影', '背景协调'],
    settingsEn: ['natural edges', 'no pasted look', 'unified color', 'realistic shadow', 'harmonized background'],
    extraZh: '明确哪些必须保留，哪些可以重绘，适合图生图和局部编辑。',
    extraEn: 'State what must be preserved and what can be redrawn, suitable for image-to-image and local edits.',
  },
  'video-cinematic-shot': {
    subjectsZh: ['孤独角色', '城市街角', '雨夜车辆', '古代旅人', '未来机器人'],
    subjectsEn: ['lonely character', 'city corner', 'rainy night vehicle', 'ancient traveler', 'future robot'],
    stylesZh: ['电影长镜头', '纪录片质感', '35mm 胶片', '高对比黑色电影', '暖色剧情片'],
    stylesEn: ['cinematic long take', 'documentary realism', '35mm film', 'high-contrast noir', 'warm drama film'],
    motionsZh: ['缓慢呼吸般移动', '微弱手持', '静止锁定', '轻微推近', '从广角到中景'],
    motionsEn: ['slow breathing motion', 'subtle handheld', 'locked camera', 'gentle push-in', 'wide-to-medium framing'],
    settingsZh: ['自然表演', '真实光线', '细节运动', '单镜头连续', '无突兀转场'],
    settingsEn: ['natural acting', 'realistic light', 'detail motion', 'continuous single shot', 'no abrupt transition'],
    extraZh: '描述一个清晰的单镜头，不堆叠多场景，强调景别、动作、光线和情绪。',
    extraEn: 'Describe one clear shot rather than multiple scenes, focusing on framing, action, lighting, and emotion.',
  },
  'video-camera-motion': {
    subjectsZh: ['人物穿行', '产品旋转', '车辆驶过', '空间漫游', '风景推进'],
    subjectsEn: ['person walking through', 'rotating product', 'vehicle passing by', 'space walkthrough', 'landscape reveal'],
    stylesZh: ['推镜', '拉镜', '平移', '环绕', '跟拍'],
    stylesEn: ['dolly in', 'pull back', 'pan', 'orbit', 'tracking shot'],
    motionsZh: ['低角度', '俯视', '肩后视角', '微距开始', '稳定器运动'],
    motionsEn: ['low angle', 'overhead', 'over-the-shoulder', 'macro opening', 'gimbal movement'],
    settingsZh: ['速度平滑', '焦点稳定', '主体不变形', '背景自然视差', '运动结束有停顿'],
    settingsEn: ['smooth speed', 'stable focus', 'no subject warping', 'natural parallax', 'settled ending'],
    extraZh: '用肯定语句描述镜头怎么动，避免只写“不要晃动”这类否定约束。',
    extraEn: 'Describe what the camera should do in positive wording instead of only saying what not to do.',
  },
  'video-character-action': {
    subjectsZh: ['年轻女性', '武术角色', '主播人物', '儿童角色', '老人角色'],
    subjectsEn: ['young woman', 'martial artist', 'presenter', 'child character', 'elderly character'],
    stylesZh: ['自然表演', '动作戏', '温柔口播', '情绪爆发', '生活化互动'],
    stylesEn: ['natural acting', 'action performance', 'gentle talking-head', 'emotional outburst', 'slice-of-life interaction'],
    motionsZh: ['转身看镜头', '伸手拿物', '快步奔跑', '微笑说话', '惊讶后退'],
    motionsEn: ['turns to camera', 'reaches for object', 'runs forward', 'smiles and speaks', 'steps back surprised'],
    settingsZh: ['面部稳定', '手部自然', '服装一致', '眼神明确', '动作起承转合'],
    settingsEn: ['stable face', 'natural hands', 'consistent outfit', 'clear eye direction', 'complete action arc'],
    extraZh: '只写一个主动作，补充情绪和动作节奏，适合首帧图生视频。',
    extraEn: 'Use one main action with emotion and timing details, suitable for first-frame image-to-video.',
  },
  'video-product-demo': {
    subjectsZh: ['耳机', '香水', '手机', '运动鞋', '饮料罐'],
    subjectsEn: ['headphones', 'perfume bottle', 'phone', 'sneaker', 'drink can'],
    stylesZh: ['高端广告', '微距质感', '开箱展示', '功能演示', '液体美学'],
    stylesEn: ['premium ad', 'macro texture', 'unboxing reveal', 'feature demo', 'liquid beauty shot'],
    motionsZh: ['缓慢旋转', '光线扫过', '部件展开', '水滴滑落', '包装打开'],
    motionsEn: ['slow rotation', 'light sweep', 'parts unfold', 'droplets slide', 'package opens'],
    settingsZh: ['主体锐利', '反光可控', '背景干净', '卖点清晰', '无随机文字'],
    settingsEn: ['sharp subject', 'controlled reflections', 'clean background', 'clear selling point', 'no random text'],
    extraZh: '产品形状和品牌元素保持稳定，镜头只围绕产品服务。',
    extraEn: 'Keep product shape and brand elements stable; every motion serves the product.',
  },
  'video-social-ad': {
    subjectsZh: ['课程讲师', '美妆达人', '健身教练', '探店博主', '产品主理人'],
    subjectsEn: ['course instructor', 'beauty creator', 'fitness coach', 'food reviewer', 'product founder'],
    stylesZh: ['开场钩子', '口播种草', '前后对比', '三秒吸睛', '竖屏广告'],
    stylesEn: ['opening hook', 'talking-head recommendation', 'before-after contrast', 'three-second attention grab', 'vertical ad'],
    motionsZh: ['快速指向产品', '镜头轻推', '表情切换', '手势强调', '节奏剪辑'],
    motionsEn: ['points to product', 'gentle push-in', 'expression change', 'gesture emphasis', 'rhythmic editing'],
    settingsZh: ['信息清楚', '动作利落', '主体居中', '可放字幕区', '明亮亲和'],
    settingsEn: ['clear message', 'crisp action', 'centered subject', 'subtitle-safe space', 'bright friendly light'],
    extraZh: '保留字幕安全区但不生成字幕，适合后期剪辑和文案叠加。',
    extraEn: 'Keep subtitle-safe space without generating captions, suitable for editing and copy overlay.',
  },
  'video-transition-vfx': {
    subjectsZh: ['人物服装', '产品外观', '室内空间', '季节天气', '画面材质'],
    subjectsEn: ['character outfit', 'product appearance', 'interior space', 'season and weather', 'visual material'],
    stylesZh: ['粒子变形', '液态转场', '光线擦除', '镜头穿越', '折纸展开'],
    stylesEn: ['particle morph', 'liquid transition', 'light wipe', 'camera pass-through', 'paper-fold unfold'],
    motionsZh: ['由 A 变 B', '中心扩散', '边缘卷入', '顺着运动方向', '一镜完成'],
    motionsEn: ['A transforms into B', 'center-out diffusion', 'edges fold inward', 'follows motion direction', 'completed in one shot'],
    settingsZh: ['主体可识别', '转场前后连贯', '无突然跳切', '光影连续', '结束定格清楚'],
    settingsEn: ['recognizable subject', 'coherent before and after', 'no abrupt cut', 'continuous lighting', 'clear final hold'],
    extraZh: '明确转场机制和最终状态，避免多个特效互相抢戏。',
    extraEn: 'Specify the transition mechanism and final state; avoid stacking competing effects.',
  },
  'video-music-audio': {
    subjectsZh: ['歌手特写', '舞者剪影', '城市夜景', '乐队现场', '歌词氛围画面'],
    subjectsEn: ['singer close-up', 'dancer silhouette', 'city nightscape', 'live band', 'lyric mood visual'],
    stylesZh: ['音乐 MV', '节拍剪辑', '慢动作情绪', '舞台灯光', '声音驱动'],
    stylesEn: ['music video', 'beat edit', 'slow emotional motion', 'stage lighting', 'sound-driven motion'],
    motionsZh: ['跟随节拍点头', '灯光随鼓点闪动', '镜头环绕表演者', '画面随低频震动', '歌词情绪推进'],
    motionsEn: ['nods to the beat', 'lights pulse with drums', 'camera orbits performer', 'frame vibrates with bass', 'lyric emotion progresses'],
    settingsZh: ['节奏明确', '嘴型自然', '灯光同步', '画面不闪烁', '情绪统一'],
    settingsEn: ['clear rhythm', 'natural mouth motion', 'synced lighting', 'no flicker', 'unified emotion'],
    extraZh: '可加入音频氛围描述，但画面仍保持一个清晰主体和一个主要动作。',
    extraEn: 'Audio mood can be described, but keep one clear subject and one main action.',
  },
  'video-image-to-video': {
    subjectsZh: ['首帧参考图', '首尾帧故事', '多参考人物', '产品参考', '场景参考'],
    subjectsEn: ['first-frame reference', 'start/end frame story', 'multi-reference character', 'product reference', 'scene reference'],
    stylesZh: ['首帧动起来', '首尾帧过渡', '智能多帧', '全能参考', '轻量循环'],
    stylesEn: ['animate first frame', 'start-end transition', 'smart multiframe', 'universal reference', 'subtle loop'],
    motionsZh: ['保持构图', '保持身份', '局部动效', '镜头轻推', '自然呼吸'],
    motionsEn: ['preserve composition', 'preserve identity', 'local motion', 'gentle push-in', 'natural breathing'],
    settingsZh: ['参考优先', '动作克制', '末帧对齐', '无重绘漂移', '适合短片'],
    settingsEn: ['reference-first', 'restrained motion', 'end-frame alignment', 'no redraw drift', 'short-video friendly'],
    extraZh: '如果有参考图，只描述想让参考图如何运动；如果有首尾帧，明确中间过渡路径。',
    extraEn: 'With references, describe how the image should move; with start/end frames, specify the transition path.',
  },
};

function makeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96);
}

interface CuratedTopic {
  titleZh: string;
  titleEn: string;
  goalZh: string;
  goalEn: string;
  contextZh: string;
  contextEn: string;
  tags: string[];
}

interface CuratedTechnique {
  titleZh: string;
  titleEn: string;
  instructionZh: string;
  instructionEn: string;
  tags: string[];
}

interface CuratedRecipe {
  topics: CuratedTopic[];
  techniques: CuratedTechnique[];
  ruleZh: string;
  ruleEn: string;
}

const CATEGORY_RULES_ZH: Record<string, string> = {
  'image-portrait-character': '锁定身份锚点：五官、发型、服装、配饰、身形比例和核心气质必须一致；画面不要生成文字、编号或水印。',
  'image-product-commercial': '产品轮廓、材质、比例、反光和卖点必须清楚；不得生成随机品牌字、乱码标签或不可购买的畸形结构。',
  'image-storyboard-grid': '同一主体、场景和光线在所有格子中保持一致；格子变化必须服务镜头、动作或情绪，不要数字角标。',
  'image-scene-world': '空间要有真实尺度、可进入动线和前中后景层次；封闭空间需要合理门窗或出口，避免不可能结构。',
  'image-style-lighting': '只改变风格、镜头或光线语言，不改变主体身份、构图锚点和关键物体；保留可控色彩与真实材质。',
  'image-poster-brand': '预留人工排版区域但不直接生成文字；主视觉要有明确焦点、品牌调性和可延展构图。',
  'image-panorama-vr': '按全景贴图思路组织空间：左右边缘无缝、地平线稳定、上下极点自然，封闭空间要有出口。',
  'image-reference-edit': '先说明必须保留的结构、身份和材质，再说明允许重绘的风格、背景或光线，避免参考错位。',
  'video-cinematic-shot': '写清谁在 4-6 秒内做什么，镜头从哪里开始、如何移动、停在哪里；不要堆多个地点或剧情段落。',
  'video-camera-motion': '镜头运动必须有起点、路径、速度和落点；主体焦点稳定，前景/背景视差自然，不写抽象运镜词。',
  'video-character-action': '动作要包含准备、执行、反应和停顿；手部、脸部、服装、眼神方向和身体重心连续。',
  'video-product-demo': '动作直接服务一个卖点：形状稳定、材质可信、反光可控，最后停在能截图的产品主图帧。',
  'video-social-ad': '前三秒出现可见动作或结果，中段展示利益点，结尾留封面/字幕安全空间但不生成字幕、水印或平台 UI。',
  'video-transition-vfx': '转场必须有触发物、变化路径和结束画面；特效遵守物理方向，避免突然换景和主体塌陷。',
  'video-music-audio': '把节奏、鼓点、歌词停顿或音色翻译成可见动作；主体、口型、乐器接触和镜头路径保持稳定。',
  'video-image-to-video': '参考素材要分工明确：首帧保身份和构图，尾帧保终点，多图保角色/产品，视频保运镜，音频保节奏。',
};

const CATEGORY_RULES_EN: Record<string, string> = {
  'image-portrait-character': 'Lock identity anchors: face, hair, outfit, accessories, body proportion, and core personality must remain consistent; do not generate text, numbers, or watermark.',
  'image-product-commercial': 'Make product silhouette, material, proportion, reflection, and selling point clear; avoid random brand text, gibberish labels, or impossible product structure.',
  'image-storyboard-grid': 'Keep the same subject, scene, and lighting across panels; every panel change must serve shot, action, or emotion, with no numbers or corner labels.',
  'image-scene-world': 'Give the space believable scale, walkable circulation, and foreground/midground/background depth; closed spaces need plausible doors, windows, or exits.',
  'image-style-lighting': 'Change only style, lens, or lighting language while preserving identity, composition anchors, and key objects; keep color and material controlled.',
  'image-poster-brand': 'Reserve room for manual typography without generating text; the key visual needs a clear focal point, brand mood, and extendable layout.',
  'image-panorama-vr': 'Think like an environment texture: seamless horizontal edges, stable horizon, natural poles, and clear exits for enclosed spaces.',
  'image-reference-edit': 'State what structure, identity, and material must be preserved before describing allowed redraws, style shifts, background, or lighting changes.',
  'video-cinematic-shot': 'State who does what within 4-6 seconds, where the camera starts, how it moves, and where it lands; do not stack multiple places or story beats.',
  'video-camera-motion': 'Camera motion must have origin, path, speed, and landing point; keep subject focus stable with natural foreground/background parallax.',
  'video-character-action': 'Action needs preparation, execution, reaction, and hold; hands, face, outfit, gaze, and body weight remain continuous.',
  'video-product-demo': 'The motion serves one product benefit: stable shape, believable material, controlled reflection, final frame usable as a product thumbnail.',
  'video-social-ad': 'The first three seconds show visible action or result, middle shows benefit, ending leaves cover/subtitle-safe space without captions, watermark, or platform UI.',
  'video-transition-vfx': 'Transition needs trigger object, transformation path, and final frame; effects follow physical direction without sudden scene replacement or subject collapse.',
  'video-music-audio': 'Translate rhythm, beat, lyric pause, or timbre into visible motion; keep subject, lip motion, instrument contact, and camera path stable.',
  'video-image-to-video': 'Assign reference roles clearly: first frame preserves identity/composition, end frame preserves destination, images preserve character/product, videos preserve camera motion, audio preserves rhythm.',
};

const TOPIC_LINES: Record<string, string[]> = {
  'image-portrait-character': [
    '身份锁定棚拍|identity lock studio portrait|生成可反复使用的角色身份基准图|create a reusable identity anchor for a character|浅暖灰棚拍背景，脸部、发型、服装和配饰清楚|warm gray studio backdrop with clear face, hair, outfit, and accessories|角色,身份',
    '三视图角色设定|three-view character sheet|同时确认正面、侧面和背面的服装结构|lock front, side, and back costume structure|干净设定表布局，适合后续图生视频和 Actor ID|clean design-sheet layout for image-to-video and actor identity|三视图,设定',
    '六表情胸像|six-expression bust sheet|为同一角色建立基础表情库|build a basic expression library for the same character|2x3 胸像表情表，只改变表情不改变造型|2x3 bust expression sheet with expression changes only|表情,一致性',
    '游戏 NPC 立绘|game NPC key art|生成有职业、道具和故事感的游戏角色|create a game character with role, props, and story cues|半身到全身皆可，服装材质和剪影有辨识度|bust or full-body view with readable outfit material and silhouette|游戏,NPC',
    '二次元 VTuber 设定|anime VTuber design|生成直播头像和立绘都能用的可爱角色|create a cute character usable for avatar and full-body art|发型、瞳色、服装主题和小道具保持统一|consistent hair, eye color, outfit theme, and small props|二次元,VTuber',
    '写实职业人像|realistic professional portrait|生成可信的职业形象照片|create a believable professional portrait|自然皮肤质感、清晰眼神、背景简洁|natural skin texture, clear eyes, and uncluttered background|写实,职业',
    '古风侠客角色|wuxia hero character|生成古风剧情或短片的主角参考|create a protagonist reference for period drama or short video|衣料层次、武器、发冠、姿态要符合时代感|period-aware fabric layers, weapon, hair ornament, and pose|古风,侠客',
    '科幻机甲驾驶员|sci-fi mech pilot|生成未来世界观里的核心人物|create a core character for a futuristic world|轻量装甲、舱内反光、身份徽记无文字化|light armor, cockpit reflections, and non-text identity marks|科幻,机甲',
    '童书主角|storybook lead character|生成亲和、可爱的儿童故事人物|create a friendly lead for a children story|柔和造型、夸张但稳定的比例、干净色块|soft design, exaggerated but stable proportion, clean color blocks|童书,可爱',
    '反派海报头像|villain poster portrait|生成有压迫感但不脏乱的反派头像|create a menacing but clean villain portrait|低调光影、强轮廓、表情克制、背景留白|low-key lighting, strong silhouette, restrained expression, negative space|反派,海报',
  ],
  'image-product-commercial': [
    '护肤精华瓶|skincare serum bottle|生成可用于详情页首屏的产品主图|create a product hero image for an ecommerce detail page|半透明瓶身、液体质感、柔和高光和干净台面|translucent bottle, liquid material, soft highlights, clean tabletop|护肤,电商',
    '运动鞋卖点图|sneaker selling-point image|突出鞋型、鞋底和材质细节|emphasize silhouette, outsole, and material details|45 度角展示，鞋面纹理、鞋带和阴影可信|45-degree angle with believable upper texture, laces, and shadow|鞋服,产品',
    '智能硬件海报|smart device hero poster|让硬件看起来高级且结构可信|make a device look premium and structurally believable|金属、玻璃、边缘倒角和屏幕反光清楚|clear metal, glass, bevels, and screen reflection|硬件,科技',
    '咖啡饮品广告|coffee beverage ad|生成有食欲和温度感的饮品画面|create appetizing beverage imagery with warmth|杯壁水汽、奶泡、桌面道具和早晨光线|condensation, foam, tabletop props, and morning light|饮品,广告',
    '香水奢侈品图|perfume luxury shot|强化瓶身切面、液体颜色和高级感|show bottle facets, liquid color, and luxury mood|黑金或浅色背景均可，反光不要乱|dark-gold or light backdrop with controlled reflections|香水,奢侈品',
    '家具场景图|furniture lifestyle image|展示尺寸、材质和居家氛围|show scale, material, and home atmosphere|真实室内空间，人体尺度或周边物作参照|real interior with human-scale or surrounding-object reference|家具,家居',
    '珠宝微距|jewelry macro product|突出切工、镶嵌和反射火彩|emphasize cut, setting, and sparkle|微距景深，边缘锐利，金属与宝石分层|macro depth of field, sharp edges, layered metal and gems|珠宝,微距',
    '食品包装组合|food packaging set|展示包装、口味和可购买感|show packaging, flavor cues, and purchase readiness|包装正面可见但不生成乱码文案，旁边有原料暗示|front package visible without gibberish text, ingredient cues nearby|食品,包装',
    '美妆套装平铺|cosmetic flat lay|生成适合小红书或详情页的套装平铺|create a set flat lay for social or ecommerce pages|多个产品按系列摆放，颜色统一，阴影轻|multiple products arranged as one line, unified color, light shadow|美妆,平铺',
    '厨房小家电|kitchen appliance demo still|让功能、按键和使用场景直观可懂|make function, controls, and usage scene easy to understand|厨房台面、食材、蒸汽或灯光提示功能|kitchen counter, ingredients, steam, or lights suggesting function|家电,功能',
  ],
  'image-storyboard-grid': [
    '追逐戏动作拆解|chase action breakdown|把一段追逐拆成清晰分镜|break a chase into readable storyboard beats|同一街区和人物，远景到近景逐步推进|same street and characters, moving from wide to close shots|追逐,动作',
    '产品使用教程|product tutorial board|把产品使用过程拆成可拍摄步骤|turn product usage into shootable steps|手部、产品和桌面位置连续，适合短视频脚本|continuous hands, product, and tabletop positions for short video|教程,产品',
    '角色变身过程|character transformation board|展示服装或形态变化的关键帧|show keyframes of costume or form transformation|每格保留身份锚点，变化有顺序|identity anchors remain while change has order|变身,关键帧',
    '双人对话场景|two-person dialogue scene|规划对话的景别和视线关系|plan framing and eyeline for dialogue|正反打、双人中景、反应镜头都清楚|clear shot-reverse-shot, two-shot, and reaction shots|对话,分镜',
    '旅行日记九宫格|travel diary grid|把一天旅程整理成连贯视觉故事|turn a travel day into a coherent visual story|同一色调和人物服装，地点递进|same palette and outfit, locations progress logically|旅行,九宫格',
    '魔法技能连招|magic skill combo sheet|展示技能起手、蓄力、释放和收束|show wind-up, charge, release, and settle of a skill|动作轨迹清楚，光效不遮挡主体|clear motion path with effects not covering subject|技能,游戏',
    '房间改造前后|room makeover sequence|呈现空间从杂乱到完成的阶段|show room changing from messy to finished|视角固定，家具位置和空间比例可信|fixed viewpoint with believable furniture placement and scale|空间,改造',
    '美食制作过程|cooking process storyboard|把菜品从原料到成品拆成镜头|break cooking from ingredients to finished dish|俯拍、手部动作、火候变化、成品特写|top view, hand actions, heat changes, final close-up|美食,教程',
    '广告三秒钩子|three-second ad hook board|为短广告设计前三秒吸睛分镜|design the first three seconds of a short ad|问题、动作、产品出现、表情反馈节奏明确|problem, action, product reveal, and reaction are clear|广告,钩子',
    '电影情绪递进|cinematic emotion progression|用多格呈现人物情绪从压抑到释放|show emotion moving from restraint to release|构图逐渐从远到近，光线随情绪变化|framing moves from wide to close, lighting follows emotion|电影,情绪',
  ],
  'image-scene-world': [
    '赛博雨巷|cyberpunk rainy alley|生成可作为短片开场的都市空间|create an urban opening shot for a short film|霓虹、湿地反光、店铺入口和深处动线|neon, wet reflections, storefront entrances, and deep circulation|赛博,街景',
    '古风庭院|classical courtyard|生成有门、廊、树和院落层次的东方庭院|create an eastern courtyard with door, corridor, trees, and depth|青砖、木门、影壁、天井光线都合理|believable bricks, wooden doors, screen wall, and skylight|古风,庭院',
    '科幻研究基地|sci-fi research base|建立一个可拍摄、可漫游的未来实验空间|build a shootable, walkable future lab|舱门、设备、走廊、工作台和安全灯明确|clear bulkhead doors, equipment, corridors, benches, safety lights|科幻,基地',
    '奇幻森林入口|fantasy forest gate|生成通往故事世界的入口场景|create an entrance into a fantasy world|巨树、雾气、路径、发光植物和远处地标|giant trees, mist, path, glowing plants, distant landmark|奇幻,森林',
    '海边民宿室内|seaside guesthouse interior|生成温暖、真实、有生活感的室内空间|create a warm realistic living interior|窗外海光、木质家具、布料、行李和门的位置清楚|sea light, wood furniture, fabric, luggage, and door placement|室内,民宿',
    '废土补给站|wasteland supply outpost|生成后末日但可用的功能性场景|create a post-apocalyptic but functional outpost|遮阳棚、水箱、修理台、车辙和守卫点|shade canopy, water tanks, repair bench, tire tracks, guard spot|废土,补给站',
    '博物馆展厅|museum exhibition hall|生成可放置展品的高端公共空间|create a premium public space for exhibits|展柜、动线、天窗光、墙面留白和观众尺度|display cases, circulation, skylight, wall space, visitor scale|博物馆,展厅',
    '地下游戏关卡|underground game level|生成能被玩家理解的关卡空间|create a readable game level environment|入口、主路、岔路、危险区和奖励点都有视觉提示|entrance, main path, branch path, danger zone, reward spot|游戏,关卡',
    '雪山观景屋|mountain observatory lodge|生成寒冷但舒适的高山建筑场景|create a cold but cozy alpine observation lodge|落地窗、壁炉、雪地脚印和远山层次|floor windows, fireplace, snow footprints, layered mountains|雪山,建筑',
    '未来课堂|future classroom|生成适合教育科技宣传的学习空间|create a learning space for education technology|学生座位、互动屏、自然光和老师动线合理|student seats, interactive screens, natural light, teacher path|教育,空间',
  ],
  'image-style-lighting': [
    '胶片街拍人像|film street portrait|给普通人物增加真实胶片质感|add authentic film texture to a portrait|街头背景、自然肤色、颗粒和轻微高光溢出|street background, natural skin, grain, slight highlight bloom|胶片,人像',
    '黑色电影办公室|noir office scene|制造悬疑、权力和压迫感|create suspense, power, and pressure|百叶窗阴影、低调光、烟雾层次、桌面反光|venetian blind shadows, low-key light, haze depth, desk reflection|黑色电影,办公室',
    '日系清透室内|fresh Japanese interior|生成柔和、干净、生活化的光线|create soft clean everyday light|白墙、木家具、窗光、低饱和色和空气感|white walls, wood furniture, window light, muted color, airy feel|日系,清透',
    '霓虹夜景产品|neon product still|让产品获得赛博和潮流感|give a product cyber and trendy mood|彩色边缘光、湿润反射、暗背景和主体锐度|colored rim light, wet reflections, dark background, sharp subject|霓虹,产品',
    '伦勃朗肖像|Rembrandt portrait|生成经典三角光人像|create a classic triangle-light portrait|45 度侧光、暗部细节、眼神光和背景渐变|45-degree side light, shadow detail, catchlight, background falloff|伦勃朗,肖像',
    '金色时刻旅行|golden hour travel scene|增强温暖、回忆和空气透视|enhance warmth, nostalgia, and atmospheric perspective|逆光、长阴影、微尘、远景雾化|backlight, long shadows, dust motes, hazy distance|金色时刻,旅行',
    '商业棚拍柔光|commercial softbox light|让主体干净、可控、适合广告|make the subject clean, controlled, and ad-ready|大柔光箱、柔和阴影、准确肤色或材质|large softbox, soft shadow, accurate skin or material|棚拍,柔光',
    '恐怖冷月光|cold moonlight horror|制造低温、未知和危险感|create cold unknown danger|蓝灰月光、局部黑影、雾气、远处轮廓|blue-gray moonlight, local darkness, mist, distant silhouette|恐怖,月光',
    '杂志硬光时尚|hard-light fashion editorial|生成强烈、现代、杂志感画面|create bold modern editorial imagery|硬边阴影、彩色背景、姿态有张力|hard-edged shadows, colored backdrop, tense pose|时尚,硬光',
    '暖色实用灯|warm practical lights|让夜景更真实、有生活温度|make a night scene realistic and warm|台灯、壁灯、屏幕光等可见光源参与照明|visible lamps, sconces, screen light as practical sources|实用灯,夜景',
  ],
  'image-poster-brand': [
    'AI 课程封面|AI course cover|生成适合课程售卖的主视觉|create a key visual for selling a course|科技元素、人物或工具界面暗示，预留标题区|tech elements, person or tool UI hints, reserved title area|课程,封面',
    '音乐节主海报|music festival key visual|生成有节奏和现场感的活动视觉|create rhythmic event visual with live energy|舞台灯、观众剪影、主形象强烈但无文字|stage lights, crowd silhouettes, strong hero shape, no text|音乐节,活动',
    '新品发布海报|product launch poster|让新产品像正式发布会主视觉|make a product feel like a launch keynote key visual|中心产品、光线放射、品牌色块和大留白|center product, radiant light, brand color blocks, large negative space|新品,发布',
    '电影先导海报|movie teaser poster|只用一个视觉悬念传达故事|communicate story with one visual mystery|人物背影、远处事件、强剪影、可放片名区域|back view, distant event, strong silhouette, title-safe area|电影,先导',
    '咖啡品牌视觉|coffee brand visual|生成温暖、有记忆点的品牌图|create a warm memorable brand image|杯子、豆子、晨光、木桌和可延展构图|cup, beans, morning light, wood table, extendable layout|咖啡,品牌',
    '健身招募海报|fitness campaign poster|生成力量、汗水和行动号召感|create strength, sweat, and call-to-action energy|运动人物、器械、斜向动势、底部留白|athlete, equipment, diagonal energy, lower whitespace|健身,招募',
    '潮牌上新封面|streetwear drop cover|生成适合社媒预热的潮流视觉|create a social teaser for a streetwear drop|服装局部、街头背景、闪光灯和拼贴层次|garment details, street backdrop, flash, collage layers|潮牌,社媒',
    '公益主题视觉|public-good campaign visual|用温和但有力量的画面表达议题|express a public-good theme with gentle strength|人物手势、自然光、象征物和真实情绪|human gesture, natural light, symbolic object, real emotion|公益,主题',
    '游戏活动 KV|game event key visual|生成有战斗感和奖励感的活动主视觉|create a battle-and-reward event key visual|角色剪影、能量路径、道具和层级背景|character silhouette, energy path, props, layered background|游戏,KV',
    '展览宣传图|exhibition promo visual|生成高级、安静、适合展览传播的视觉|create a refined quiet visual for exhibition promotion|空间、作品局部、观众背影、墙面留白|space, artwork detail, visitor back view, wall negative space|展览,宣传',
  ],
  'image-panorama-vr': [
    '室内展厅全景|indoor showroom panorama|生成可进入的产品或艺术展厅 VR 图|create a walkable VR panorama for product or art showroom|展柜、入口、灯带、地面反射和中心视线清楚|display cases, entrance, light strips, floor reflection, clear center view|展厅,全景',
    '古风庭院全景|classical courtyard panorama|生成可左右循环的东方院落全景|create a loopable eastern courtyard panorama|门廊、院墙、树影、石路和天空过渡自然|corridors, walls, tree shadows, stone path, natural sky transition|庭院,全景',
    '森林营地全景|forest campsite panorama|生成沉浸式户外露营空间|create an immersive outdoor campsite|帐篷、篝火、林线、星空和地面衔接可信|tent, campfire, tree line, stars, believable ground seam|森林,露营',
    '科幻驾驶舱全景|sci-fi cockpit panorama|生成封闭但有出口逻辑的舱内环境|create an enclosed cockpit with logical exits|座椅、控制台、舱门、窗外星空和环形灯|seat, console, hatch, stars outside, ring lights|科幻,驾驶舱',
    '博物馆大厅全景|museum hall panorama|生成公共建筑大厅 VR 贴图|create a VR texture for a public museum hall|高天窗、展墙、走廊入口、地面导视但无文字|skylight, exhibit walls, corridor entrances, floor guidance without text|博物馆,大厅',
    '温泉 SPA 全景|spa room panorama|生成安静、温暖、有包裹感的室内全景|create a quiet warm immersive spa interior|木材、石材、水汽、浴池和门的位置清楚|wood, stone, steam, bath pool, and clear door placement|SPA,室内',
    '游戏地下城全景|game dungeon panorama|生成可用于关卡预览的封闭空间|create an enclosed space for level preview|入口、火把、岔路、宝箱或机关有逻辑|entrance, torches, branch path, chest or mechanism with logic|游戏,地下城',
    '山顶观景台全景|mountain observatory panorama|生成开阔自然景观的全景图|create an open natural panorama|栏杆、平台、云海、远山和天空极点自然|railing, platform, cloud sea, distant mountains, natural sky poles|山景,观景台',
    '咖啡馆室内全景|cafe interior panorama|生成可用于线上看店的咖啡馆全景|create a cafe panorama for virtual viewing|吧台、座位、门窗、灯光和顾客动线合理|counter, seating, doors, windows, lights, visitor circulation|咖啡馆,看店',
    '海边小屋全景|beach hut panorama|生成明亮、度假感的 720 全景|create a bright vacation-like 720 panorama|室内外连接、门、窗、沙滩和海平线稳定|indoor-outdoor connection, door, windows, beach, stable horizon|海边,小屋',
  ],
  'image-reference-edit': [
    '参考人像重绘|portrait reference redraw|保留人物身份并提升画面质量|preserve identity while improving image quality|保留脸型、发型、姿势，允许换背景和光线|preserve face shape, hair, pose; allow background and lighting change|人像,重绘',
    '产品照片升级|product photo upgrade|把普通产品照变成电商级主图|turn a casual product photo into ecommerce hero image|保留外形、颜色、结构和包装比例|preserve shape, color, structure, and packaging proportion|产品,升级',
    '房间草图渲染|room sketch render|把室内草图转成可信效果图|turn an interior sketch into a believable render|保留布局、墙体、门窗和家具位置|preserve layout, walls, doors, windows, and furniture placement|草图,室内',
    '服装参考融合|outfit reference fusion|融合多张服装参考成一套角色造型|merge outfit references into one character design|保留指定单品，不混乱袖口、领口和材质|keep specified pieces without confusing cuffs, collar, and fabric|服装,融合',
    '局部修复换背景|local repair and background replace|修复主体局部并替换更合适背景|repair local subject area and replace background|边缘自然，阴影和透视与新环境匹配|natural edges, shadow and perspective match new environment|修复,背景',
    '宠物写真风格化|pet portrait stylization|保留宠物特征并升级成写真风格|preserve pet traits and upgrade to portrait style|眼睛、毛色、斑纹和体型不能漂移|eyes, fur color, markings, and body shape must not drift|宠物,写真',
    '食物照片提质|food photo enhancement|让食物更有食欲但不失真|make food more appetizing without distortion|保留菜品结构、酱汁、餐具和真实份量|preserve dish structure, sauce, tableware, and realistic serving size|美食,提质',
    '车辆照片换场景|vehicle scene swap|保留车辆外观并换成广告场景|preserve vehicle look and move it into ad scene|轮廓、车灯、轮毂和车身反光保持准确|accurate silhouette, lights, wheels, body reflections|车辆,场景',
    '线稿上色细化|lineart color render|把线稿变成完成度更高的彩色图|turn lineart into polished color artwork|保留线稿姿态和设计，不改变角色结构|preserve pose and design without changing structure|线稿,上色',
    '多图 moodboard 统一|multi-reference moodboard unify|把多张参考统一为一个可执行画面|unify multiple references into one executable image|明确主参考、风格参考和材质参考的优先级|define priority of main, style, and material references|多图,统一',
  ],
  'video-cinematic-shot': [
    '红伞行人穿过积水路口|red umbrella commuter crossing puddled street|一个撑红伞的上班族踩过积水路口，停下回头看远处车灯，雨滴从伞沿滑落|a commuter with a red umbrella steps through a puddled crossing, stops, looks back at distant headlights, rain sliding off the umbrella edge|夜晚城市街角，湿地反光、路灯、行人剪影、远处车灯，孤独但真实|night city corner with wet reflections, streetlamp, silhouettes, distant headlights, lonely but realistic|城市,雨夜,红伞',
    '老渔民推船入海|old fisherman pushing boat into surf|老渔民双手推着木船进入清晨海浪，船头撞开白色泡沫，他最后扶住船舷喘气|an old fisherman pushes a wooden boat into morning surf, bow cutting white foam, then steadies himself on the gunwale|低太阳、海风、湿沙脚印、远处海鸟，纪实电影质感|low sun, sea breeze, wet-sand footprints, distant gulls, documentary film feel|海边,渔民,清晨',
    '机器人手指点亮舱壁|robot fingertip waking control bay|静止机器人抬起手指触碰舱壁开关，蓝色状态灯沿手臂和舱壁依次亮起|a dormant robot raises one finger to touch a wall switch, blue status lights running along its arm and the bay wall|封闭维修舱、暗光、冷雾、金属反光，机械细节清楚|closed maintenance bay, dim light, cool mist, metal reflections, clear mechanical detail|科幻,机器人,苏醒',
    '客栈少年推门回头|inn courier opening door and looking back|古装少年推开木门走进客栈，听到身后脚步声后半转身回头，手仍按在门框上|a period courier pushes open a wooden inn door, hears footsteps behind, half turns back with one hand still on the frame|雨夜客栈门口、灯笼、木门水痕、室内暖光与门外冷雨对比|rainy inn entrance, lanterns, wet wood door, warm interior light against cold rain|古风,客栈,回头',
    '沙漠旅人擦净护目镜|desert traveler wiping goggles|旅人停在沙丘脊线上，用手套擦去护目镜沙尘，抬头看向远处若隐若现的塔影|a traveler stops on a dune ridge, wipes sand from goggles with a gloved hand, then looks toward a faint distant tower|风沙、低太阳、脚印被风覆盖、辽阔地平线，孤独远景|blowing dust, low sun, footprints covered by wind, vast horizon, lonely wide view|沙漠,旅人,护目镜',
    '侦探把照片滑进抽屉|detective sliding photo into drawer|侦探把一张旧照片推到桌沿，停顿一秒后滑进抽屉并合上，眼神避开镜头|a detective pushes an old photo to the desk edge, pauses, slides it into a drawer, then closes it while avoiding the camera|百叶窗阴影、烟雾、桌面文件、低调侧光，黑色电影紧张感|venetian-blind shadows, smoke, desk files, low-key side light, noir tension|侦探,办公室,照片',
    '女孩捡起漂流瓶|girl picking up message bottle|海边女孩蹲下捡起半埋在沙里的玻璃漂流瓶，擦掉瓶身沙粒，望向海面|a girl on the beach crouches to pick up a half-buried glass bottle, wipes sand off it, and looks toward the sea|清晨逆光、海风吹动发丝和衣摆，温柔开场画面|sunrise backlight, sea breeze moving hair and hem, gentle opening shot|海边,清晨,漂流瓶',
    '快递员雨中递出包裹|courier handing package in rain|快递员从雨衣下护住纸箱跑到门口，双手递出包裹，接收者的手从门内伸出|a courier shields a cardboard box under raincoat, runs to a doorway, hands it over as another hand reaches from inside|门廊暖灯、雨水、湿台阶、城市生活感，动作真实克制|warm porch light, rainwater, wet steps, urban everyday realism, restrained motion|生活,雨中,快递',
    '宇航员摘下温室头盔|astronaut removing helmet in greenhouse|宇航员在太空温室里慢慢摘下头盔，呼出一口雾气，伸手触碰漂浮的小水珠|an astronaut in a space greenhouse slowly removes the helmet, exhales mist, and touches a floating water droplet|玻璃穹顶、绿色植物、远处星光、柔和舱内灯，安静科幻|glass dome, green plants, distant stars, soft cabin light, quiet sci-fi|科幻,宇航员,温室',
    '拳手缠紧赛前绷带|boxer wrapping hands before match|拳手坐在更衣室长凳上缠紧手绷带，最后握拳，抬眼看向赛场入口|a boxer sits on a locker-room bench wrapping hand bandages, tightens the last loop, clenches fist, and looks toward the arena entrance|汗水、荧光灯、旧海报、远处观众声想象，赛前压迫感|sweat, fluorescent light, old posters, implied crowd noise, pre-fight pressure|拳击,赛前,手部',
  ],
  'video-camera-motion': [
    '骑手穿过霓虹桥|cyclist crossing neon bridge|骑手从画面前方进入桥面，沿湿润车道向霓虹尽头骑去，尾灯留下短暂光痕|a cyclist enters the bridge foreground and rides along the wet lane toward neon lights, taillight leaving a brief streak|夜晚城市桥、蓝紫霓虹、湿路反光、栏杆形成透视线|night city bridge, blue-magenta neon, wet reflections, railings forming perspective lines|骑行,霓虹,跟拍',
    '厨师完成最后撒盐|chef finishing salt sprinkle|厨师把镊子放下，捏起海盐轻撒在摆盘上，最后擦净盘沿|a chef sets down tweezers, pinches sea salt over a plated dish, then wipes the plate rim clean|开放厨房、暖色工作灯、蒸汽、白瓷盘和手部动作清楚|open kitchen, warm task light, steam, white plate, readable hand motion|美食,厨师,摆盘',
    '孩子追泡泡穿过草地|child chasing bubbles across lawn|孩子伸手追一个最大的泡泡，从树影跑到阳光里，泡泡在指尖前破裂|a child reaches for the largest bubble, runs from tree shade into sunlight, and the bubble pops just before the fingers|公园草地、午后阳光、轻风、背景家庭野餐虚化|park lawn, afternoon sun, light breeze, blurred family picnic background|公园,孩子,泡泡',
    '舞者绕过练功房镜面|dancer moving past studio mirrors|舞者从镜面前滑步经过，转身时镜中倒影延迟半拍对齐|a dancer glides past studio mirrors, turning as the reflection aligns half a beat later|练功房、木地板、镜面反射、柔和顶灯，空间视差明显|dance studio, wood floor, mirror reflections, soft overhead light, strong parallax|舞蹈,镜面,横移',
    '机械臂抓取透明零件|robot arm picking clear component|机械臂从传送带上夹起透明零件，旋转到检测灯下，零件边缘亮起|a robot arm picks a transparent component from a conveyor, rotates it under inspection light, edges glowing|洁净工厂、冷白灯、传送带、玻璃和金属反光连续|clean factory, cool white light, conveyor, continuous glass and metal reflections|工厂,机械臂,产品',
    '游客推开民宿房门|traveler opening guesthouse door|游客把行李箱停在门边，推开房门，窗外海景随门缝扩大露出|a traveler stops a suitcase by the door, pushes it open, and the seaside view expands through the doorway|木门框、室内暖光、白色窗帘、海面反光，度假感|wood doorframe, warm interior light, white curtains, sea reflection, vacation mood|旅行,民宿,入室',
    '潜水员穿过珊瑚拱门|diver swimming through coral arch|潜水员缓慢踢蹼穿过珊瑚拱门，手电光扫过鱼群，气泡向上漂|a diver slowly kicks through a coral arch, flashlight sweeps fish, bubbles drift upward|蓝绿色海水、悬浮颗粒、珊瑚层次、远处阳光束|blue-green water, suspended particles, coral depth, distant sun rays|水下,潜水,珊瑚',
    '无人机掠过梯田村落|drone gliding over terraced village|无人机低空掠过梯田水面，越过屋顶后露出整片山谷村落|a drone glides low over flooded terraces, clears rooftops, and reveals the valley village|清晨薄雾、梯田反光、村屋炊烟、山谷层次|morning mist, terrace reflections, village smoke, layered valley|航拍,梯田,村落',
    '滑板少年越过水坑|skater hopping over puddle|滑板少年压低身体冲向水坑，轻跳越过，落地后水花在身后散开|a skater crouches toward a puddle, pops over it, lands as splash spreads behind|低机位街道、路面纹理、墙面涂鸦但无可读文字|low street angle, ground texture, graffiti-like wall without readable text|滑板,水坑,低机位',
    '图书管理员合上古书|librarian closing ancient book|图书管理员戴手套合上厚重古书，灰尘在光束中升起，钥匙轻晃|a librarian wearing gloves closes a heavy old book, dust rises in a light beam, a key swings slightly|木质书库、高窗光、书脊层次、安静悬疑感|wood library, high window light, layered book spines, quiet suspense|图书馆,古书,静止观察',
  ],
  'video-character-action': [
    '少女投篮后握拳庆祝|girl celebrating after basketball shot|少女运球两步起跳投篮，球离手后她落地握拳，眼神跟随篮筐方向|a girl dribbles two steps, jumps for a shot, lands and clenches her fist while gaze follows the hoop|室外球场傍晚光、运动服飘动、球和手的接触关系清楚|outdoor court evening light, sportswear motion, clear ball-hand contact|篮球,庆祝,运动',
    '老人给孙女系红围巾|grandfather tying red scarf|老人弯腰把红围巾绕到孙女脖子上，打结后拍拍她肩膀，两人相视微笑|an elderly man bends to wrap a red scarf around his granddaughter, ties it, pats her shoulder, they smile at each other|冬日街口、呼气白雾、暖色店灯，亲情自然不夸张|winter street corner, visible breath, warm shop light, natural family warmth|亲情,围巾,生活',
    '机甲驾驶员按下启动键|mecha pilot pressing ignition key|驾驶员扣紧手套，按下红色启动键，头盔 HUD 亮起，肩膀微微后压|a pilot tightens gloves, presses a red ignition key, helmet HUD lights up, shoulders press back slightly|驾驶舱冷光、震动感、仪表不生成可读文字|cockpit cool light, subtle vibration, instruments without readable text|科幻,驾驶员,启动',
    '舞者旋转后单膝落地|dancer spinning into kneel|舞者连续旋转后单膝落地，一只手撑地，另一只手停在空中形成剪影|a dancer spins continuously then lands on one knee, one hand on floor, the other held in the air as silhouette|练功房侧逆光、地板反光、衣料延迟运动明显|studio side backlight, floor reflection, clear delayed cloth motion|舞蹈,旋转,定格',
    '厨师掀锅闻香微笑|chef lifting lid and smiling|厨师掀开铸铁锅盖，蒸汽涌出后他靠近闻香，露出短暂满意微笑|a chef lifts a cast-iron lid, steam rises, he leans in to smell it and gives a brief satisfied smile|厨房暖光、锅具反光、蒸汽不遮脸，生活化表演|warm kitchen light, cookware reflection, steam not covering face, natural acting|厨师,蒸汽,表情',
    '魔法师双手聚光推开|mage gathering light and pushing forward|魔法师双手从胸前聚起蓝色光球，后撤半步，再向前推出一道光波|a mage gathers a blue light orb between both hands, steps back half a pace, then pushes a wave forward|夜色废墟、斗篷摆动、光效照亮脸但不遮挡五官|night ruins, cloak motion, light illuminating face without blocking features|魔法,施法,动作',
    '上班族读消息怔住|office worker freezing after message|上班族低头看手机，拇指停止滑动，笑容消失，缓慢抬头望向窗外|an office worker looks at phone, thumb stops scrolling, smile fades, slowly looks toward the window|地铁车厢或办公室窗边，环境微动，情绪从轻松到震惊|subway car or office window, subtle environment motion, emotion shifts from relaxed to shocked|表情,手机,情绪',
    '运动员起跑前深呼吸|sprinter breathing before start|短跑运动员蹲在起跑器上，闭眼深呼吸，睁眼后手指压紧跑道|a sprinter crouches at the starting block, closes eyes for one deep breath, opens eyes and presses fingers into track|赛道晨光、号码布不可读、肌肉和衣料轻微紧张|track morning light, unreadable bib, subtle muscle and fabric tension|运动员,起跑,紧张',
    '男孩把玩具递给机器人|boy handing toy to robot|小男孩犹豫地伸出玩具车，机器人低头伸出机械手，轻轻接住|a boy hesitantly offers a toy car, a robot lowers its head and gently receives it with a mechanical hand|儿童房暖光、机器人金属反光柔和，接触关系可信|warm child room, soft robot metal reflections, believable hand-object contact|机器人,儿童,互动',
    '歌手听到掌声抬头落泪|singer lifting head at applause|歌手低头握着麦克风，听到掌声后慢慢抬头，一滴泪从眼角滑下|a singer holds microphone with head lowered, then slowly lifts head as applause begins, one tear sliding down|舞台暗背景、侧光、麦克风位置稳定，表情克制|dark stage background, side light, stable microphone position, restrained expression|歌手,掌声,眼泪',
  ],
  'video-product-demo': [
    '手机翻面亮屏解锁|phone flip wake and unlock|一只手把手机从背面翻到正面，屏幕亮起并滑动解锁，金属边框扫过高光|a hand flips the phone from back to front, screen wakes and unlocks with a swipe, metal bevel catches highlight|桌面干净、屏幕内容用抽象块表达不生成乱码，设备形状稳定|clean desk, screen content as abstract blocks without gibberish, stable device shape|手机,亮屏,解锁',
    '精华滴落到手背|serum dropping onto hand back|一根手指按下护肤泵头，透明精华落在手背并缓慢铺开，最后产品瓶身入焦|one finger presses the skincare pump, clear serum lands on hand back and spreads slowly, then bottle comes into focus|浴室台面、柔光、皮肤质感真实，剂量和质地清楚|bathroom counter, soft light, realistic skin texture, clear dosage and texture|护肤,质地,泵头',
    '运动鞋落地溅起水花|sneaker landing with controlled splash|运动鞋踩入浅水坑后向前蹬地，鞋底花纹短暂可见，水花克制向后散开|a sneaker steps into a shallow puddle and pushes forward, outsole pattern briefly visible, restrained splash spreading behind|街道路面、低机位、鞋型稳定，防泼水和抓地感明确|street surface, low angle, stable shoe silhouette, clear water resistance and grip|鞋,水花,性能',
    '咖啡机一键出液|coffee machine one-button pour|手指按下咖啡机按钮，咖啡流稳定注入杯中，奶泡和蒸汽同时出现|a finger presses the coffee machine button, coffee pours steadily into a cup, foam and steam appearing together|厨房晨光、金属反光、按钮灯稳定，香气感强|morning kitchen light, metal reflection, stable button light, strong aroma cue|咖啡机,功能,出液',
    '椅子转出材质细节|chair swivel material reveal|单人椅缓慢旋转半圈，布料纹理、木脚和缝线依次经过高光|an armchair slowly swivels half a turn, fabric texture, wooden legs, and seams passing through highlights|干净家居空间、地毯和墙面层次，家具比例可信|clean home space, rug and wall depth, believable furniture scale|家具,旋转,材质',
    '手表指针与反光扫过|watch hands and reflection sweep|机械表秒针跳动两下，柔光从表壳边缘扫过，表冠和表带细节逐渐清楚|a mechanical watch second hand ticks twice, soft light sweeps across the case edge, crown and strap detail becoming clear|微距黑色台面、浅景深、刻度不生成乱码|macro black tabletop, shallow depth of field, markers without gibberish text|手表,微距,高级',
    '人物戴上降噪耳机|person putting on headphones|人物双手拿起耳机戴上，耳罩自然压住发丝，背景噪声感通过表情放松体现|a person lifts headphones with both hands and puts them on, pads naturally pressing hair, relaxation showing noise reduction|书桌或通勤座位、自然光、产品比例清楚|desk or commute seat, natural light, clear product scale|耳机,佩戴,降噪',
    '背包拉链打开装入相机|backpack zip open camera packing|手拉开背包主仓拉链，把相机和水杯依次放入，隔层结构清楚不混乱|a hand opens the backpack zipper, places a camera and bottle inside in order, compartments readable|旅行桌面、布料纹理、拉链和扣具细节稳定|travel tabletop, fabric texture, stable zipper and buckle detail|背包,收纳,旅行',
    '扫地机器人绕开椅脚|robot vacuum avoiding chair leg|扫地机器人沿椅脚边缘减速转弯，绕开电线后继续直行，路径清楚|a robot vacuum slows around a chair leg, avoids a cable, then continues straight with a clear route|真实客厅地面、木纹反光、家具比例稳定|real living-room floor, wood reflection, stable furniture scale|机器人,家居,路线',
    '珠宝盒打开露出戒指|jewelry box opening to ring|丝绒珠宝盒缓慢打开，戒指反光先出现，盒盖完全打开后镜头停在戒指上|a velvet jewelry box opens slowly, ring sparkle appears first, then camera holds on the ring after lid fully opens|暖色礼物灯光、黑色或深绿丝绒、闪光克制|warm gift lighting, black or dark green velvet, restrained sparkle|珠宝,开箱,戒指',
  ],
  'video-social-ad': [
    '护肤博主挤出精华展示|skincare creator dispensing serum|护肤博主把产品举到镜头前，按压泵头挤出一滴精华到手背，微笑点头|a skincare creator holds product to camera, pumps one drop of serum onto hand back, then smiles and nods|干净梳妆台、自然窗光、竖屏构图，脸和产品都清楚|clean vanity, natural window light, vertical framing, both face and product clear|护肤,种草,真人',
    '外卖炸鸡盒打开冒热气|fried chicken delivery box opening|手快速打开外卖盒，热气和酥皮细节出现，拿起一块炸鸡靠近镜头|hands open a delivery box, steam and crispy texture appear, one piece lifted toward camera|桌面干净、食物有食欲、动作利落，前三秒有钩子|clean tabletop, appetizing food, crisp action, hook in first seconds|外卖,美食,开箱',
    '老师拿马克笔指向课程板|teacher pointing marker at course board|老师面向镜头说话，拿马克笔指向旁边空白课程板，手势从问题指到解决方案|a teacher speaks to camera, points a marker at a blank course board, gesture moving from problem to solution|明亮教室或书房、字幕安全区、不生成文字|bright classroom or study, subtitle-safe space, no generated text|课程,口播,教育',
    '手机 App 三步完成任务|phone app completing task in three taps|手握手机连续点击三次，从混乱列表切到完成状态，最后拇指停住|a hand holding phone taps three times, moving from messy list to completed state, thumb holding at the end|手机屏幕不生成可读乱码，用图形块表达 UI，桌面自然光|phone screen avoids readable gibberish, UI shown as clean blocks, natural desk light|App,演示,效率',
    '健身女孩系鞋带后起跑|fitness creator tying shoes then running|健身女孩蹲下系紧鞋带，抬头看镜头，下一秒冲出画面|a fitness creator crouches to tighten shoelaces, looks at camera, then runs out of frame|健身房或户外跑道、汗水、运动能量，竖屏安全|gym or outdoor track, sweat, athletic energy, vertical safe frame|健身,运动,短视频',
    '民宿房门打开露出海景|guesthouse door reveal sea view|旅行博主推开民宿房门，窗外海景和床铺同时露出，行李箱停在门边|a travel creator opens the guesthouse door, revealing sea view and bed together, suitcase by the door|度假自然光、窗帘轻动、空间卖点清楚|vacation natural light, curtains moving lightly, clear room benefits|旅行,民宿,探店',
    '宠物闻到玩具立刻摇尾巴|pet sniffing toy and wagging tail|宠物靠近新玩具嗅闻，尾巴快速摇动，然后用爪子轻拍玩具|a pet approaches a new toy, sniffs it, wags tail quickly, then taps the toy with a paw|客厅地毯、主人手部入画、产品不漂浮|living-room rug, owner hand in frame, product not floating|宠物,用品,反应',
    '数码小工具一按收好线缆|gadget tidying cable with one press|手拿起桌面理线小工具，按下一次后凌乱线缆被整齐收拢|a hand picks up a cable organizer gadget, presses once, messy cable becomes neatly gathered|办公桌、键盘、杯子作尺度参照，不生成文字 UI|office desk, keyboard and mug for scale, no generated text UI|数码,工具,收纳',
    '咖啡店门头到出杯探店|cafe storefront to coffee serve|探店者从门头推门进入，镜头接到吧台咖啡出杯，最后端起杯子|a cafe visitor enters from storefront, shot continues to counter coffee serving, then lifts cup|门头、吧台、咖啡机蒸汽、环境氛围连续|storefront, counter, espresso steam, continuous ambience|探店,咖啡,生活',
    '穿搭博主转身完成换装|outfit creator turning into new look|穿搭博主在镜头前转身，衣摆遮挡一瞬，转回来时变成完整新造型并站定|a fashion creator turns in front of camera, hem briefly occludes, returns in a complete new outfit and holds pose|竖屏全身、安全边距、背景简洁、服装结构稳定|vertical full body, safe margins, simple background, stable outfit structure|穿搭,变装,社媒',
  ],
  'video-transition-vfx': [
    '转身衣摆遮挡换装|spin outfit change with fabric wipe|人物转身时衣摆扫过镜头形成自然遮挡，转回正面后新造型稳定完整|a person spins, clothing hem sweeps across camera as natural occlusion, returns facing front in stable new outfit|同一背景、同一人物身份、服装轮廓清楚，不突然换脸|same background, same identity, clear outfit silhouette, no sudden face change|换装,转场,遮挡',
    '窗外四季滑过房间|seasons sliding across room window|同一房间里窗外从春花变成夏雨、秋叶、冬雪，室内家具位置不变|in one room, outside the window changes from spring blossom to summer rain, autumn leaves, winter snow while furniture stays fixed|窗帘、植物、光线逐步变化，构图稳定|curtains, plants, light change gradually, stable composition|季节,空间,时间',
    '香水瓶颜色顺滑变体|perfume bottle color morph|同一香水瓶保持轮廓，玻璃液体颜色从琥珀渐变成冰蓝，标签不生成文字|one perfume bottle keeps silhouette while glass liquid shifts amber to ice blue, no text label generated|高端棚拍、反光连续、产品位置固定|premium studio shot, continuous reflections, fixed product position|产品,变体,玻璃',
    '手撕海报露出新场景|poster tear scene reveal|一只手从画面边缘撕开纸质海报，裂口后方逐渐露出真实街景|a hand tears a paper poster from frame edge, the rip gradually revealing a real street scene behind|纸张纤维、撕裂边缘、后景光线方向一致|paper fibers, torn edge, consistent background lighting direction|纸张,揭示,转场',
    '水墨从袖口扩散成山水|ink spreading from sleeve to landscape|人物抬袖后黑色水墨从袖口扩散，墨迹流动形成山水远景|a person raises sleeve, black ink spreads from cuff, flowing into a distant landscape|东方水墨质感、扩散方向清楚、人物轮廓不塌陷|eastern ink texture, clear spread direction, subject silhouette not collapsing|水墨,扩散,古风',
    '镜头穿过杯中倒影|camera passing through cup reflection|镜头靠近咖啡杯表面倒影，穿过液面后进入倒影中的雨夜街道|camera approaches reflection on coffee surface, passes through liquid into the rainy street reflected inside|液面涟漪、反射和新空间光线衔接自然|liquid ripple, reflection and new-space lighting connect naturally|穿越,倒影,咖啡',
    '火花重组为产品轮廓|sparks rebuilding product silhouette|旧金属碎片化成火花沿同一方向飞散，再重组为一个完整产品轮廓|old metal fragments become sparks flying one direction, then rebuild into a complete product silhouette|暗背景、火花路径清晰、结束形状稳定|dark background, readable spark path, stable final shape|粒子,产品,重组',
    '圆形月亮匹配剪辑成灯泡|moon match cut to lightbulb|夜空圆月慢慢占满画面，形状对齐后匹配切换为桌上亮起的圆形灯泡|a round moon fills the frame, aligns in shape, then match-cuts into a round desk bulb turning on|月光到室内暖光过渡，圆形轮廓准确|moonlight to warm indoor light transition, accurate circular silhouette|匹配剪辑,灯光,形状',
    '手机故障扫描切到赛博街|phone glitch scan to cyber street|手机屏幕出现轻微扫描线和 RGB 错位，画面沿扫描线切换为赛博街景|a phone screen shows subtle scanlines and RGB split, scene switches along the scanline into cyber street|数字故障克制、主体可辨识、不要闪烁过度|restrained digital glitch, readable subject, no excessive flicker|故障,赛博,扫描',
    '能量环呼吸回到开头|energy ring breathing seamless loop|角色身后的能量环缓慢变亮、扩张、再收回到开头大小，首尾状态接近|an energy ring behind the character brightens, expands, then returns to starting size, beginning and ending nearly match|暗背景、粒子轻动、适合循环短片|dark background, subtle particles, loopable short clip|循环,能量环,轻动效',
  ],
  'video-music-audio': [
    '歌手贴近麦克风唱到副歌|singer leaning into mic for chorus|歌手靠近麦克风唱到副歌，眉眼用力，最后一句后轻轻离开麦克风|a singer leans into the microphone for the chorus, eyes intense, then gently pulls back after the last phrase|舞台近景、口型自然、麦克风位置稳定、侧逆光|stage close-up, natural lip motion, stable microphone, side backlight|歌手,口型,副歌',
    '鼓手敲下重拍灯光爆开|drummer hitting downbeat light burst|鼓手右手敲下重拍，镲片震动，舞台背光在同一瞬间增强|a drummer hits the downbeat with right hand, cymbal vibrates, stage backlight lifts at the same moment|现场舞台、观众剪影、灯光跟节奏但不过度频闪|live stage, crowd silhouettes, lights follow beat without harsh flicker|鼓手,重拍,现场',
    '舞者剪影踩准低频节拍|dancer silhouette hitting bass beat|逆光舞者在每个低频点完成肩膀和手臂定点动作，轮廓清楚|a backlit dancer hits shoulder and arm accents on each bass beat, silhouette readable|简洁背景、侧光、地面反光，动作不要糊成残影|simple background, side light, floor reflection, no smeared motion|舞者,低频,剪影',
    '雨夜车窗 MV 慢慢推近|rainy car-window music video push-in|人物坐在车窗边，雨滴滑过玻璃，副歌进入时镜头慢慢推近侧脸|a character sits by a car window, raindrops sliding on glass, camera slowly pushes toward side face as chorus begins|城市夜景、霓虹散景、慢速情绪镜头|city night, neon bokeh, slow emotional shot|MV,雨窗,城市',
    '手握旧磁带随歌词停顿|hand holding cassette on lyric pause|一只手握着旧磁带，歌词停顿时拇指轻轻摩挲标签边缘|a hand holds an old cassette tape, thumb rubbing label edge during a lyric pause|暖色台灯、木桌、灰尘颗粒，怀旧但不生成文字|warm desk lamp, wood table, dust particles, nostalgic without readable text|歌词,怀旧,手部',
    '贝斯手拨弦特写跟随律动|bassist plucking strings in groove|贝斯手手指连续拨弦，琴弦震动与低频节奏同步，汗水从手背滑过|a bassist plucks strings in sequence, string vibration syncing to bass rhythm, sweat sliding on hand back|舞台微距、浅景深、木纹和金属弦清楚|stage macro, shallow depth, clear wood grain and metal strings|贝斯,微距,律动',
    'DJ 推起推子人群举手|DJ raising fader crowd lift|DJ 推起混音台推子，烟雾中灯束扫过，观众手臂随掉点同时举起|a DJ raises the mixer fader, beams sweep through haze, crowd arms lift with the drop|电子音乐现场、控制台灯光、能量强但主体稳定|electronic live stage, deck lights, high energy with stable subject|DJ,电音,掉点',
    '吉他手拨弦后抬头微笑|guitarist plucking then smiling up|吉他手低头拨动一根琴弦，琴弦震动后抬头轻笑，手仍停在琴颈上|a guitarist looks down plucking one string, string vibrates, then looks up with a small smile, hand still on neck|温暖室内、木吉他纹理、近距离音乐质感|warm interior, acoustic guitar wood texture, intimate music feel|吉他,质感,微笑',
    '雨窗前慢歌侧脸呼吸|ballad side face breathing by rainy window|人物侧坐在雨窗前，听到慢歌时轻轻闭眼呼吸，窗上水滴向下滑|a person sits side-on by a rainy window, softly closes eyes and breathes as a ballad plays, droplets sliding down glass|室内暖灯、窗外冷蓝、情绪安静|warm interior lamp, cold blue outside, quiet emotion|慢歌,雨窗,呼吸',
    '合唱团吸气后同时开口|choir inhaling before first note|合唱团成员在大厅中同时吸气，指挥手落下后大家张口唱第一句|choir members inhale together in a hall, conductor hand drops, everyone opens mouth for the first line|教堂或音乐厅空间、队列层次、混响感通过空间表现|church or concert hall, layered rows, reverb implied by space|合唱,空间,开口',
  ],
  'video-image-to-video': [
    '首帧人像眨眼微笑|first-frame portrait blink and smile|基于首帧人像，只让人物自然眨眼、轻微呼吸、嘴角慢慢上扬|from the first-frame portrait, only add natural blinking, slight breathing, and a slow smile|严格保持脸型、发型、服装和背景构图，不新增人物|strictly keep face shape, hairstyle, outfit, and background composition, no new people|首帧,人像,轻动',
    '首尾帧人物走到门口|start-end character walks to door|从首帧站在房间中央开始，人物沿直线路径走向门口，最后姿态对齐尾帧|start from standing in room center, character walks a straight path to the door, final pose aligns with end frame|保持房间结构、门的位置和人物身份连续|keep room layout, door position, and identity continuous|首尾帧,走路,对齐',
    '智能多帧追逐段落|smart multiframe chase sequence|按多张关键帧顺序生成追逐动作，人物从巷口跑到拐角再回头|connect multiple keyframes into a chase, character runs from alley entrance to corner then looks back|每帧同一人物、同一街区，动作遵守时间顺序|same character and street across frames, motion follows temporal order|智能多帧,追逐,剧情',
    '全能参考品牌广告镜头|universal references brand ad shot|用多图固定人物和产品外观，用视频参考镜头节奏，用音频参考情绪节拍生成广告镜头|use images to lock character and product look, video references for camera rhythm, audio reference for emotional beat|多参考各司其职，不把多图误当作智能多帧时间线|each reference has a role, do not treat images as a smart multiframe timeline|全能参考,广告,多参',
    '产品照片灯光扫过|product photo light sweep animation|基于产品照片，产品本体不变形，只让柔光从左到右扫过表面并轻微推近|from a product photo, keep product unwarped while a soft light sweeps left to right and camera gently pushes in|保持瓶身、包装、标签布局和背景关系稳定|keep bottle, package, label layout, and background relation stable|图生视频,产品,光扫',
    '场景图前景视差漫游|scene image parallax walkthrough|基于场景图，镜头轻轻向前推进，前景植物和远处建筑产生自然视差|from a scene image, camera gently moves forward, foreground plants and distant architecture creating natural parallax|保持空间布局、门窗位置和透视不漂移|keep spatial layout, door/window positions, and perspective stable|场景,漫游,视差',
    '视频参考运镜迁移到新主体|video-reference camera transfer|借用视频参考的推拉节奏和手持幅度，把同样运镜应用到新主体上|borrow push-pull rhythm and handheld intensity from a video reference and apply it to the new subject|不复制参考视频内容，只继承运动方式、节奏和镜头质感|do not copy reference content, inherit only motion style, rhythm, and lens feel|视频参考,运镜,迁移',
    '音频鼓点驱动灯光和动作|audio beat driving lights and motion|根据参考音频鼓点，让灯光亮度和主体动作强弱同步变化|use reference audio beat to sync light intensity and subject motion strength|不生成歌词字幕，主体身份和构图保持稳定|no lyric captions, keep identity and composition stable|音频参考,节奏,灯光',
    '多图角色参考保持身份|multi-image character identity lock|用多张角色参考固定脸、发型、服装和配饰，只根据文本生成一个新动作|use multiple character references to lock face, hair, outfit, accessories, while text defines one new action|身份优先，动作可以变化但五官和服装不漂移|identity first, action may change but face and outfit do not drift|多图参考,角色,一致性',
    '静态表情包首尾循环|still reaction loop from image|基于静态表情图，表情从中性变夸张再回到中性，首尾姿态接近可循环|from a still reaction image, expression moves neutral to exaggerated and back to neutral, first and last pose nearly match|保持背景和头部位置稳定，只让脸部和肩膀轻动|keep background and head position stable, only face and shoulders move subtly|循环,表情包,轻动',
  ],
};

const TECHNIQUE_LINES: Record<string, string[]> = {
  'image-portrait-character': [
    'Actor ID 基准|Actor ID baseline|正面半身，眼神看镜头，脸部细节清楚，背景简单，方便后续一致性锁定。|front bust, eyes to camera, clear facial detail, simple background for identity locking|actor-id,baseline',
    '全身站姿|full-body standing pose|完整展示头身比例、鞋子、手部和服装下摆，四周留出安全边距。|show full body proportion, shoes, hands, hemline, with safe margins|full-body,pose',
    '三视图布局|three-view layout|正面、侧面、背面同屏展示，统一光线和尺度，不生成文字标注。|front, side, back in one sheet with unified light and scale, no labels|turnaround,sheet',
    '六表情布局|six-expression layout|2x3 表情表，只改变面部表情，发型、妆容和服装不漂移。|2x3 expression sheet, only facial expression changes, no hair, makeup, or outfit drift|expression,grid',
    '电影剧照|cinematic still|使用真实镜头感、浅景深和环境光，让角色像来自一部电影。|use realistic lens feel, shallow depth, and environmental light like a film still|cinematic,lens',
    '商业头像|commercial avatar|头像清晰、轮廓干净、背景可替换，适合社媒、头像和介绍页。|clear headshot, clean silhouette, replaceable background for avatar and profile use|avatar,commercial',
    '服装材质表|costume material sheet|强调布料、皮革、金属、刺绣或道具材质，便于后续建模和重绘。|emphasize fabric, leather, metal, embroidery, or prop material for modeling and redraw|costume,material',
    '动态姿势|dynamic pose|加入清楚动作线和重心变化，但脸和服装身份保持稳定。|add readable action line and weight shift while keeping face and outfit identity stable|dynamic,gesture',
    '低调情绪光|low-key emotional light|用侧光、暗部和少量眼神光建立角色情绪，不牺牲脸部可读性。|use side light, shadows, and catchlight for mood without losing face readability|low-key,mood',
    '参考图重绘|reference redraw|如果有参考图，保留身份和姿态，只升级细节、光线和画面完整度。|with a reference image, preserve identity and pose while improving detail, light, and finish|reference,redraw',
  ],
  'image-product-commercial': [
    '电商白底主图|clean ecommerce hero|主体居中，阴影轻，背景干净，产品边缘和形状不被装饰遮挡。|centered subject, light shadow, clean background, no decoration blocking edges or shape|ecommerce,hero',
    '45 度高级广告|premium 45-degree ad|45 度视角，边缘高光和材质反射清楚，画面有高级留白。|45-degree view with clean rim highlight, material reflection, premium negative space|premium,angle',
    '微距材质特写|macro material close-up|靠近拍摄关键材质或功能部位，保留可识别的产品整体线索。|macro on key material or feature while keeping enough product context|macro,material',
    '爆炸结构图|exploded structure|部件分层展开但位置有逻辑，展示结构关系，不生成说明文字。|parts separate logically to show structure, without explanatory text|exploded,structure',
    '真实使用场景|lifestyle usage|把产品放到真实使用环境中，使用者动作自然，产品仍是视觉焦点。|place product in real usage context with natural action while product remains focal|lifestyle,usage',
    '包装组合图|packaging set|产品、包装盒、配件和原料暗示同屏，层次清楚，避免随机文字。|product, box, accessories, and ingredient cues together, clear layers, no random text|packaging,set',
    '反光控制棚拍|controlled reflection|使用柔光箱、黑白卡和可控反光表现玻璃、金属或亮面材质。|use softbox and controlled reflection cards for glass, metal, or glossy material|reflection,studio',
    '尺寸比例参照|scale reference|加入手、桌面或常见物作为比例参照，产品尺寸一眼可懂。|add hand, table, or common object as scale reference so size is obvious|scale,reference',
    '社媒种草图|social seeding image|画面更生活、更亲近，保留可截图传播的主体和空白区域。|more lifestyle and friendly, with screenshot-ready subject and whitespace|social,lifestyle',
    '高端详情页横幅|premium detail banner|横幅构图，左或右侧预留文案区，不生成文字，产品和卖点在另一侧。|banner composition with copy-safe space on one side, product benefit on the other, no text|banner,landing',
  ],
  'image-storyboard-grid': [
    '四格关键节拍|four-panel key beats|四格呈现开始、推进、转折、结果，适合快速看故事是否成立。|four panels for start, development, twist, result to test story clarity|four-panel,beats',
    '九格多机位|nine-panel multi-camera|九格展示不同景别和机位，同一主体不漂移，适合拍摄参考。|nine panels of shot sizes and angles with stable subject for shooting reference|nine-panel,camera',
    '连贯分镜长表|long sequential storyboard|二十五格连续动作，帧间变化小而连贯，适合复杂动作预演。|twenty-five panels of continuous action with small coherent frame changes|sequential,storyboard',
    '景别阶梯|shot-size ladder|从远景、中景、近景到特写逐步推进，帮助确定剪辑节奏。|progress from wide to medium to close-up to detail for editing rhythm|shot-size,editing',
    '动作拆解|action breakdown|把一个动作拆成起手、过程、接触、反应和收束。|break one action into wind-up, process, contact, reaction, settle|action,breakdown',
    '情绪递进|emotion progression|每格只推进一点表情和肢体变化，让情绪弧线可信。|advance expression and body language slightly per panel for believable emotion arc|emotion,arc',
    '俯视调度|top-down blocking|用俯视或等距视角确认人物、道具和空间位置关系。|use top-down or isometric view to confirm people, props, and space positions|blocking,top-view',
    '前后对比|before-after comparison|用同构图展示变化前、变化中、变化后，重点突出结果差异。|same composition shows before, during, after, emphasizing result difference|before-after,comparison',
    '广告节奏板|ad rhythm board|按钩子、痛点、展示、证明、记忆点组织短广告画面。|organize short ad visuals by hook, pain point, demo, proof, memory point|ad,rhythm',
    '无文字安全网格|no-text safe grid|所有格子保持纯画面表达，禁止数字、箭头、标签和对话框。|pure visual storytelling only, no numbers, arrows, labels, or speech bubbles|no-text,safe',
  ],
  'image-scene-world': [
    '建立镜头|establishing shot|用广角建立场景整体、入口、主体位置和远处地标。|use a wide view to establish space, entrance, subject position, and landmark|wide,establishing',
    '中心透视|central perspective|一条明确视觉轴线通向空间深处，适合建筑、走廊和展厅。|one strong visual axis leads into depth, ideal for architecture, corridors, halls|perspective,depth',
    '等距俯视|isometric overview|用等距或鸟瞰方式展示布局，让空间逻辑一眼可读。|use isometric or bird-eye view to make layout readable|isometric,layout',
    '日夜双氛围|day-night mood|保持空间不变，只改变时间、光线和情绪，适合方案对比。|preserve space while changing time, light, and mood for comparison|day-night,mood',
    '天气版本|weather variant|加入雨、雪、雾、风或尘土，但保持结构和动线清晰。|add rain, snow, mist, wind, or dust while keeping structure and circulation clear|weather,variant',
    '可行走动线|walkable circulation|明确门、路、转角、台阶和开放区域，让场景能被真实进入。|clear doors, paths, corners, stairs, and open zones so space feels walkable|circulation,walkable',
    '人物尺度参照|human scale reference|加入小人物或常见物体，帮助判断建筑和道具尺度。|add small people or common objects to show scale of architecture and props|scale,human',
    '道具叙事|prop storytelling|用道具痕迹说明这里发生过什么，而不是靠文字解释。|use prop traces to imply story instead of text explanation|props,story',
    '概念美术质感|production design|按影视美术设定图处理材质、层次和色彩，不追求杂乱细节。|treat material, layers, and color like production design, not clutter|concept,art',
    '可扩图边缘|outpaint-safe edges|四周边缘留出可延展信息，方便后续扩图或全景化。|keep extendable information around edges for outpainting or panorama expansion|outpaint,edges',
  ],
  'image-style-lighting': [
    '金色时刻|golden hour|暖逆光、长阴影和空气颗粒，适合怀旧、旅行和温柔剧情。|warm backlight, long shadows, airborne particles for nostalgia and gentle drama|golden-hour,warm',
    '伦勃朗侧光|Rembrandt side light|45 度侧光和三角眼下光，让人物更经典、庄重、神秘。|45-degree side light and triangle cheek light for classic serious mystery|rembrandt,portrait',
    '阴天柔光|overcast soft light|降低对比，保留细节，适合真实、日常、纪录感画面。|low contrast with preserved detail for realistic everyday documentary mood|overcast,soft',
    '霓虹冷暖对比|neon warm-cool contrast|蓝紫和暖色边缘光对冲，适合都市夜景和潮流产品。|blue-purple and warm rim lights contrast for urban night and trendy products|neon,contrast',
    '低调明暗|low-key chiaroscuro|大面积暗部、少量高光，制造权力、危险或悬疑气氛。|large shadow areas with few highlights for power, danger, or suspense|low-key,noir',
    '实用灯照明|practical lights|让台灯、屏幕、车灯等可见光源参与照明，增强真实感。|visible lamps, screens, headlights contribute to lighting for realism|practical,realism',
    '硬光图形阴影|hard graphic shadow|硬边阴影形成设计感图形，适合时尚、海报和潮牌视觉。|hard-edge shadows create graphic design for fashion, poster, streetwear|hard-light,graphic',
    '高调清透|high-key airy light|亮背景、轻阴影、低饱和，适合美妆、日系和生活方式。|bright backdrop, light shadow, muted saturation for beauty and lifestyle|high-key,airy',
    '月光冷色|cold moonlight|蓝灰冷光、雾气和轮廓高光，适合夜戏、奇幻和悬疑。|blue-gray cool light, mist, rim highlight for night, fantasy, suspense|moonlight,cool',
    '胶片颗粒|film grain finish|加入自然颗粒、轻微色偏和镜头缺陷，但不降低清晰度。|add organic grain, slight color bias, lens imperfections without lowering clarity|film,grain',
  ],
  'image-poster-brand': [
    '标题安全留白|title-safe negative space|画面保留大块干净区域给后期标题和卖点文字，不直接生成文字。|reserve clean area for later title and copy, without generating text|title-safe,layout',
    '中心英雄主体|center hero subject|用一个强主体控制视线，背景只做情绪和层次。|use one strong subject to control attention while background supports mood|hero,focus',
    '斜向动势|diagonal energy|通过斜线、动作轨迹或光带制造速度和热血感。|use diagonals, motion path, or light streaks for speed and energy|diagonal,energy',
    '高级极简|premium minimal|减少元素，只保留主体、材质、光和品牌色，显得贵。|reduce elements to subject, material, light, and brand color for premium feel|minimal,premium',
    '潮流拼贴|editorial collage|多层图片、纸张、纹理和剪影拼贴，但主体关系清楚。|layer images, paper, texture, and silhouettes while keeping hierarchy clear|collage,editorial',
    '电影一页海报|one-sheet poster|人物、地点和事件形成一个悬念画面，适合电影或短片宣传。|character, place, and incident form one mystery image for film promotion|movie,poster',
    '社媒方图|social square cover|1:1 构图，主体居中偏上，下方留标题区，适合平台封面。|1:1 layout, subject slightly above center, lower title-safe area|social,square',
    '竖屏故事封面|vertical story cover|9:16 竖图，人物或产品占中线，顶部和底部留 UI 安全区。|9:16 vertical, subject/product on centerline, top and bottom UI safe|vertical,story',
    '品牌色控制|brand color control|限定 2 到 3 个主色，让画面统一且可延展成系列。|limit to two or three main colors for a coherent campaign system|brand,color',
    '材质记忆点|texture mnemonic|使用纸张、金属、玻璃、烟雾或布料形成可记住的触感。|use paper, metal, glass, haze, or fabric as memorable tactile cue|texture,memory',
  ],
  'image-panorama-vr': [
    '左右无缝|left-right seamless|重点检查左右边缘内容、光线和地面纹理能够像素级衔接。|prioritize pixel-level match of content, light, and ground texture on left-right edges|seamless,edge',
    '地平线锁定|horizon lock|地平线保持水平，建筑垂直线不明显倾斜，减少眩晕。|keep horizon level and verticals stable to reduce discomfort|horizon,stable',
    '上下极点安全|pole-safe ceiling floor|天顶和地面极点自然过渡，避免旋涡、拉伸和黑洞。|make zenith and nadir transition naturally without swirl, stretch, or holes|poles,safe',
    '封闭空间有门|closed room with exit|如果是室内或封闭空间，必须出现门、窗或通道。|for indoor or enclosed scenes, include door, window, or corridor|door,logic',
    '中心视线锚点|center-view anchor|正中保留用户打开时第一眼能看的主景，不把关键物放在接缝。|keep a strong first-view subject in center, not on the seam|center,anchor',
    '全局柔光|global illumination|使用柔和统一光线，避免两侧曝光差导致接缝明显。|use soft unified light to avoid exposure mismatch at seams|lighting,global',
    '空间动线清楚|walkthrough path|给用户能走向的路径或视线动线，适合 VR 漫游。|provide a path or visual route for VR walkthrough|path,vr',
    '天空盒贴图|skybox texture|适合游戏或 3D 背景，远景连续、近景不要压到边缘。|for games or 3D backgrounds, continuous distance and uncluttered edges|skybox,game',
    '无重复镜像|no mirrored repetition|避免左右边缘出现明显复制粘贴或镜像重复。|avoid obvious copy-paste or mirrored repetition near edges|no-repeat,quality',
    '宽屏预览友好|wide preview friendly|让全景在宽屏节点预览中也有好看的中心构图。|make panorama look good in the wide node preview with strong center composition|preview,wide',
  ],
  'image-reference-edit': [
    '保留轮廓|preserve silhouette|主体外轮廓、姿势和比例优先不变，再提升细节。|keep silhouette, pose, and proportion first, then improve details|silhouette,preserve',
    '保留身份|preserve identity|脸型、五官、发型和核心气质不漂移，适合人物参考。|keep face shape, features, hairstyle, and personality stable for people refs|identity,preserve',
    '保留材质|preserve material|产品、服装或道具材质不被错误换成其他材料。|avoid turning product, clothing, or prop material into the wrong substance|material,preserve',
    '换光线|relighting|只改变光线方向、色温和阴影，不改变主体结构。|change light direction, temperature, and shadows only, not subject structure|relight,lighting',
    '换背景|background replace|主体边缘自然融入新环境，阴影和透视匹配。|blend subject edges into new environment with matching shadow and perspective|background,replace',
    '局部修复|local inpaint repair|只修复指定区域，其余区域保持原图信息。|repair only the specified area while preserving the rest of the image|inpaint,repair',
    '风格迁移|style transfer|把参考图转为指定风格，但身份、构图和重要物体不变。|apply target style while preserving identity, composition, and key objects|style,transfer',
    '扩图补边|outpainting|向四周扩展画面，延续原有光线、透视和材质。|extend canvas while continuing original light, perspective, and material|outpaint,extend',
    '多参考融合|multi-reference fusion|明确主图、风格图、材质图的优先级，避免平均混合。|define priority of main, style, and material references to avoid mushy blending|multi-ref,fusion',
    '清理瑕疵|cleanup defects|去掉杂物、污点、破损或多余元素，保持真实阴影和纹理。|remove clutter, stains, damage, or extra elements while keeping real shadow and texture|cleanup,defect',
  ],
  'video-cinematic-shot': [
    '35mm 单镜头|35mm single shot|35mm 胶片质感，单镜头连续运动，画面像真实摄影机拍摄。|35mm film feel, continuous single shot, camera behaves like a real camera|35mm,single-shot',
    '缓慢推近|slow push-in|镜头缓慢靠近主体，情绪逐渐集中，结尾有轻微停顿。|camera slowly pushes toward subject, emotion focuses, slight hold at end|push-in,emotion',
    '锁定广角|locked wide shot|镜头固定，让人物和环境内在动作推动叙事。|camera locked off; story comes from action inside the frame|locked,wide',
    '微弱手持|subtle handheld|轻微手持呼吸感，不剧烈晃动，适合纪录片真实感。|subtle handheld breathing, no heavy shake, documentary realism|handheld,doc',
    '低角度仰拍|low-angle shot|低机位增强力量感或压迫感，主体轮廓稳定。|low camera adds power or pressure with stable silhouette|low-angle,power',
    '浅景深特写|shallow close-up|背景轻柔虚化，眼神、手部或产品细节成为焦点。|soft background blur makes eyes, hands, or detail the focus|close-up,dof',
    '背光剪影|backlit silhouette|逆光形成清楚剪影和边缘光，情绪强但主体可读。|backlight creates silhouette and rim light, emotional but readable|backlight,silhouette',
    '拉焦转移|rack focus shift|焦点从前景物体转移到主体或反过来，节奏克制。|focus shifts from foreground to subject or reverse with restraint|rack-focus,lens',
    '从细节到环境|detail-to-wide|从局部细节开始，慢慢露出完整环境和人物关系。|start on detail and reveal environment and subject relation|reveal,wide',
    '长镜头收束|long take settle|运动结束后停留半秒，让画面有完成感。|after movement, hold for a short moment so shot feels complete|long-take,hold',
  ],
  'video-camera-motion': [
    '推镜|dolly in|镜头沿光轴平滑推近，主体大小变化自然，不使用数字变焦感。|camera physically dollies in with natural size change, not digital zoom feel|dolly-in,push',
    '拉镜|pull back|从主体拉开，逐渐露出环境、关系或反转信息。|camera pulls away to reveal environment, relationship, or twist|pull-back,reveal',
    '环绕|orbit|镜头绕主体 90 到 180 度，焦点锁定，背景视差自然。|camera orbits 90 to 180 degrees with locked focus and natural parallax|orbit,parallax',
    '横移|truck sideways|镜头平行横移，前景经过形成空间层次。|camera trucks sideways with foreground passing to create depth|truck,sideways',
    '摇镜|pan|镜头从一个信息点平滑摇到另一个信息点，速度均匀。|camera pans smoothly from one information point to another|pan,guide',
    '俯仰|tilt|镜头上仰或下俯揭示高度、建筑或人物状态。|camera tilts up or down to reveal height, architecture, or state|tilt,height',
    '升降|crane rise|镜头垂直升起或下降，过渡空间尺度。|camera rises or descends vertically to transition scale|crane,scale',
    '肩后跟拍|over-shoulder track|从肩后跟随人物进入空间，增强代入感。|follow over shoulder into a space for immersion|ots,tracking',
    '第一人称|first-person move|模拟人眼路径，轻微步伐起伏但不晕。|simulate human-eye path with subtle step motion, not dizzy|fpv,walk',
    '静止观察|observational lock-off|完全不移动镜头，只让主体和环境微动，适合高级感。|no camera movement, only subject and environment move subtly|lock-off,observe',
  ],
  'video-character-action': [
    '单动作弧线|single action arc|动作包含准备、执行、反应、停顿四步，避免无意义循环。|action has preparation, execution, reaction, and hold, not random loop|action,arc',
    '表情变化|expression change|表情从一个明确状态过渡到另一个状态，幅度自然。|expression moves from one clear state to another naturally|expression,change',
    '手部可读|readable hands|手指数量和接触关系清楚，动作慢一点，避免糊成一团。|hands and contact are clear, slower motion to avoid blur|hands,readable',
    '眼神方向|eye direction|明确看向镜头、远处、物体或另一个人，眼神不漂移。|define gaze toward camera, distance, object, or another person, no drifting|gaze,acting',
    '衣料二级运动|cloth secondary motion|动作带动头发和衣料轻微延迟，增强真实感。|motion causes slight delayed hair and cloth movement for realism|cloth,secondary',
    '生活化表演|naturalistic acting|动作克制、表情真实，像真实生活而不是夸张舞台剧。|restrained action and real expression, like life rather than stage acting|natural,acting',
    '舞台式夸张|stylized performance|适度夸张肢体和节奏，但保持脸和身体结构稳定。|slightly exaggerated gesture and rhythm while keeping structure stable|stylized,performance',
    '互动反应|interaction reaction|与物体、宠物、另一个人或环境发生明确互动。|clear interaction with object, pet, another person, or environment|interaction,reaction',
    '慢动作强调|slow-motion emphasis|关键瞬间变慢，强调情绪、力量或材质，不要突然跳切。|slow the key moment to emphasize emotion, force, or material, no jump cut|slow-motion,emphasis',
    '循环闭合|loop closure|结尾姿态接近开头，可作为循环短片或表情包。|ending pose returns near starting pose for loops or reaction clips|loop,closure',
  ],
  'video-product-demo': [
    '开箱揭示|unboxing reveal|包装打开后产品自然出现，镜头停留在产品完整形态上。|package opens and product appears naturally, final hold on full product|unboxing,reveal',
    '360 环绕|360 orbit|镜头绕产品一圈或半圈，形状保持稳定，反光连续。|camera orbits product, stable shape, continuous reflections|orbit,product',
    '光扫材质|light sweep material|一条柔和光带扫过产品表面，突出材质和边缘。|a soft light sweep travels over product surface to show material and edge|light-sweep,material',
    '功能触发|feature trigger|用手部或按钮触发一个功能，让卖点通过动作被看懂。|hand or button triggers one feature so benefit is understood through action|feature,demo',
    '微距细节|macro detail|从关键细节开始，再回到产品整体，避免只看不懂局部。|start at key detail then return to whole product for context|macro,detail',
    '使用场景|usage context|产品在真实环境中被使用，动作自然，画面不杂乱。|product used in real context with natural action and uncluttered frame|usage,context',
    '前后结果|before-after result|用同一构图展示使用前和使用后，但不生成对比文字。|same composition shows before and after without text labels|before-after,result',
    '液体/粉末动态|liquid powder motion|液体、水花、粉末或蒸汽动效克制，服务产品质感。|restrained liquid, splash, powder, or steam motion serving material|liquid,motion',
    '组装展开|assembly unfold|部件按逻辑组合或展开，适合结构类产品。|parts assemble or unfold logically for structure products|assembly,unfold',
    '高级定格|premium packshot hold|最后 0.5 秒定格在产品主图角度，方便截图做封面。|last half second holds on hero packshot angle for thumbnail capture|packshot,hold',
  ],
  'video-social-ad': [
    '前三秒钩子|three-second hook|开头立即出现动作或结果，让观众知道为什么继续看。|open with action or result so viewer knows why to continue|hook,opening',
    '痛点到解决|problem solution|先表现一个可见问题，再让产品或服务自然解决。|show a visible problem, then product or service solves it naturally|problem,solution',
    '真人口播|talking-head pitch|人物面对镜头表达体验，留出字幕安全区但不生成字幕。|person speaks to camera, subtitle-safe area, no captions generated|talking-head,subtitle-safe',
    'UGC 手持感|UGC handheld|轻微手持、真实环境、亲近距离，像用户真实分享。|slight handheld, real environment, close distance, like user sharing|ugc,handheld',
    '节奏剪辑|rhythmic edit|用动作节拍和镜头变化制造短视频节奏，不能闪烁乱跳。|use action beats and shot changes for short-video rhythm without chaotic flicker|rhythm,edit',
    '产品上手|product in hand|产品始终有手部或人物互动，避免漂浮展示。|product always interacts with hands or person, no floating display|in-hand,product',
    '场景小故事|mini story|用一个生活小情节说明价值，比纯展示更有记忆点。|use a tiny life story to show value rather than pure display|story,value',
    '结尾封面帧|thumbnail ending|结尾停在适合做封面的画面，主体和产品都清楚。|end on thumbnail-friendly frame with clear subject and product|thumbnail,end',
    '竖屏安全构图|vertical safe frame|9:16 中主体居中，顶部底部留平台 UI 安全区。|9:16 centered subject with top and bottom UI safe margins|vertical,safe',
    '无平台 UI|no platform UI|不要生成点赞、评论、字幕、贴纸、水印或假按钮。|do not generate likes, comments, captions, stickers, watermark, fake buttons|no-ui,safe',
  ],
  'video-transition-vfx': [
    '匹配剪辑|match cut|用形状、颜色或动作方向相似性完成转场。|transition through similarity of shape, color, or motion direction|match-cut,shape',
    '遮挡擦除|occlusion wipe|用人物、物体或布料经过镜头形成自然遮挡转场。|use person, object, or fabric passing camera as natural wipe|occlusion,wipe',
    '粒子重组|particle rebuild|主体分解成粒子再重组，路径清楚，结束形态稳定。|subject becomes particles then rebuilds with clear path and stable ending|particle,rebuild',
    '液态变形|liquid morph|边缘像液体一样流动变形，但主体不塌陷。|edges flow like liquid while subject does not collapse|liquid,morph',
    '光线扫过|light wipe|一束光扫过画面，扫过区域完成变化。|a light beam passes and changes the revealed area|light,wipe',
    '镜面穿越|reflection portal|通过镜面、屏幕或水面进入新空间。|enter new space through mirror, screen, or water reflection|portal,reflection',
    '时间流逝|time lapse shift|天气、光影或季节顺滑变化，构图不乱。|weather, light, or season changes smoothly while composition stays stable|timelapse,change',
    '折纸展开|paper fold unfold|画面像纸张折叠展开，最终铺成新场景。|frame folds and unfolds like paper into a new scene|paper,fold',
    '速度坡度|speed ramp|动作在关键点加速或减速，形成爽感但不跳帧。|action speeds up or slows down at key point without frame jumps|speed-ramp,action',
    '循环回到起点|loop back|特效结束时回到开头构图，适合循环视频。|effect returns to starting composition for loopable video|loop,seamless',
  ],
  'video-music-audio': [
    '节拍灯光|beat-synced lights|灯光亮度和方向跟随鼓点变化，但不过度频闪。|light intensity and direction follow drums without excessive flicker|beat,lights',
    '低频脉冲|bass pulse|画面或背景元素随低频轻微脉动，主体保持稳定。|frame or background pulses subtly with bass while subject stays stable|bass,pulse',
    '口型自然|natural lip motion|演唱或说唱时嘴型自然，脸部身份不漂移。|mouth motion is natural during singing or rap, identity stable|lip-sync,natural',
    '舞台扫光|stage light sweep|舞台灯束从背景扫过主体，形成现场感。|stage beams sweep behind or over subject for live feeling|stage,lights',
    '慢动作情绪|slow emotional motion|用慢动作、轻微风和表情停顿增强歌词情绪。|slow motion, light wind, expression hold amplify lyric emotion|slow,emotion',
    '镜头跟随旋律|melody camera move|镜头运动速度跟随旋律起伏，而不是随机移动。|camera speed follows melody contour, not random movement|melody,camera',
    '环境声想象|implied ambience|画面暗示雨声、掌声、脚步或空间混响。|visuals imply rain, applause, footsteps, or reverb space|ambience,sound',
    '剪影舞动|silhouette dance|逆光或侧光下的剪影动作卡节拍，轮廓清楚。|backlit or side-lit silhouette dances on beat with clear outline|silhouette,dance',
    '乐器微距|instrument macro|聚焦手指、琴弦、鼓面或按键的真实运动。|focus on realistic motion of fingers, strings, drumhead, or keys|instrument,macro',
    '副歌爆发|chorus lift|副歌进入时光线、构图和动作同时打开，但主体不丢失。|on chorus, light, framing, and action open up while subject remains clear|chorus,lift',
  ],
  'video-image-to-video': [
    '首帧动起来|animate first frame|只让参考图中合理元素动起来，身份、构图和材质优先保持。|animate only plausible elements in the reference while preserving identity, composition, material|first-frame,preserve',
    '首尾帧过渡|start-end bridge|严格从首帧过渡到尾帧，中间运动路径清楚。|strictly bridge from start frame to end frame with clear motion path|start-end,bridge',
    '智能多帧|smart multiframe|把多个关键帧按顺序连接，人物和空间连续。|connect multiple keyframes in order with continuous character and space|multiframe,sequence',
    '全能参考|universal reference|多图、多视频、多音频分别负责身份、风格、动作和节奏，不走智能多帧逻辑。|use images, videos, and audio for identity, style, motion, and rhythm, not as smart multiframe|universal,refs',
    '身份优先|identity first|即使动作变化，脸、服装、产品外观或场景结构也不漂移。|even when motion changes, face, outfit, product look, or scene structure does not drift|identity,preserve',
    '轻微呼吸|subtle breathing|为静态参考加入呼吸、眨眼、发丝和衣料轻动，适合高质量短循环。|add breathing, blink, hair, and cloth motion for polished short loop|subtle,loop',
    '视差推进|parallax push|镜头轻推产生前后景视差，避免把图片直接缩放。|gentle push creates foreground/background parallax, not simple zoom|parallax,push',
    '局部动效|local motion|只让水、火、云、灯、头发或衣料等局部元素运动。|animate only local elements such as water, fire, cloud, lights, hair, cloth|local,motion',
    '末帧对齐|end-frame alignment|如果有尾帧，最后姿态、构图和物体位置必须贴近尾帧。|with an end frame, final pose, composition, and object positions align closely|end-frame,align',
    '可循环收尾|loopable ending|结尾回到接近首帧状态，适合循环展示或表情包。|ending returns close to first frame for loop display or reaction clips|loop,closure',
  ],
};

function parseTopic(line: string): CuratedTopic {
  const [titleZh, titleEn, goalZh, goalEn, contextZh, contextEn, tags = ''] = line.split('|');
  return {
    titleZh,
    titleEn,
    goalZh,
    goalEn,
    contextZh,
    contextEn,
    tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
  };
}

function parseTechnique(line: string): CuratedTechnique {
  const [titleZh, titleEn, instructionZh, instructionEn, tags = ''] = line.split('|');
  return {
    titleZh,
    titleEn,
    instructionZh,
    instructionEn,
    tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
  };
}

const CURATED_RECIPES: Record<string, CuratedRecipe> = Object.fromEntries(
  Object.keys(TOPIC_LINES).map((categoryId) => [
    categoryId,
    {
      topics: TOPIC_LINES[categoryId].map(parseTopic),
      techniques: (TECHNIQUE_LINES[categoryId] || []).map(parseTechnique),
      ruleZh: CATEGORY_RULES_ZH[categoryId] || '',
      ruleEn: CATEGORY_RULES_EN[categoryId] || '',
    },
  ]),
);

function buildCuratedPromptZh(category: PromptTemplateCategory, topic: CuratedTopic, technique: CuratedTechnique, ruleZh: string) {
  if (category.kind === 'video') {
    return [
      `Seedance 2.0 视频提示词，单镜头 4-6 秒：${topic.titleZh}。`,
      `主体与动作：${topic.goalZh}`,
      `场景与氛围：${topic.contextZh}`,
      `镜头执行：${technique.titleZh}；${technique.instructionZh}`,
      `时间节奏：开头 0.5 秒建立主体，中段完成动作，结尾停留 0.5 秒形成可截图画面。`,
      `稳定约束：${ruleZh} 主体身份、服装、道具和空间关系连续；不突然换景，不生成字幕、水印、logo 或平台 UI。`,
    ].join('\n');
  }
  return [
    `生成一张${category.labelZh}提示图。`,
    `主题：${topic.titleZh}。`,
    `创作目标：${topic.goalZh}。`,
    `场景/语境：${topic.contextZh}。`,
    `画面方法：${technique.instructionZh}`,
    `执行规则：${ruleZh}`,
    '质量标准：主体清楚、构图高级、空间层次明确、材质和光线可信，适合直接用于节点生成或作为参考图。',
  ].join('');
}

function buildCuratedPromptEn(category: PromptTemplateCategory, topic: CuratedTopic, technique: CuratedTechnique, ruleEn: string) {
  if (category.kind === 'video') {
    return [
      `Seedance 2.0 video prompt, single shot, 4-6 seconds: ${topic.titleEn}.`,
      `Subject and action: ${topic.goalEn}`,
      `Scene and mood: ${topic.contextEn}`,
      `Camera execution: ${technique.titleEn}; ${technique.instructionEn}.`,
      'Timing: first 0.5 seconds establishes the subject, middle completes the action, final 0.5 seconds holds a thumbnail-ready frame.',
      `Stability constraints: ${ruleEn} Keep identity, outfit, props, and spatial relation continuous; no sudden scene change, captions, watermark, logo, or platform UI.`,
    ].join('\n');
  }
  return [
    `Create a ${category.labelEn} image prompt. `,
    `Theme: ${topic.titleEn}. `,
    `Creative goal: ${topic.goalEn}. `,
    `Scene/context: ${topic.contextEn}. `,
    `Visual method: ${technique.instructionEn}. `,
    `Execution rule: ${ruleEn}. `,
    'Quality bar: clear subject, polished composition, readable spatial depth, believable material and lighting, usable directly for generation or as a reference image.',
  ].join('');
}

function generatedCuratedTemplate(category: PromptTemplateCategory, recipe: CuratedRecipe, index: number): PromptTemplateItem {
  const topicIndex = index % recipe.topics.length;
  const blockIndex = Math.floor(index / CURATED_TEMPLATE_MATRIX_SIZE);
  const techniqueIndex = (topicIndex * 7 + blockIndex) % recipe.techniques.length;
  const topic = recipe.topics[topicIndex];
  const technique = recipe.techniques[techniqueIndex];
  const serial = String(index + 1).padStart(3, '0');
  return {
    id: makeId(`${category.id}-${serial}-${topic.titleEn}-${technique.titleEn}`),
    kind: category.kind,
    categoryId: category.id,
    titleZh: `${technique.titleZh} · ${topic.titleZh}`,
    titleEn: `${technique.titleEn} · ${topic.titleEn}`,
    descriptionZh: `${topic.goalZh}；${technique.instructionZh}`,
    descriptionEn: `${topic.goalEn}; ${technique.instructionEn}`,
    promptZh: buildCuratedPromptZh(category, topic, technique, recipe.ruleZh),
    promptEn: buildCuratedPromptEn(category, topic, technique, recipe.ruleEn),
    negativeZh: category.kind === 'image' ? IMAGE_NEGATIVE_ZH : VIDEO_NEGATIVE_ZH,
    negativeEn: category.kind === 'image' ? IMAGE_NEGATIVE_EN : VIDEO_NEGATIVE_EN,
    tags: [category.kind, category.labelZh, topic.titleZh, technique.titleZh, ...topic.tags, ...technique.tags],
    source: 'curated',
    builtIn: true,
  };
}

function generatedTemplate(category: PromptTemplateCategory, bp: Blueprint, index: number): PromptTemplateItem {
  const recipe = CURATED_RECIPES[category.id];
  if (recipe && recipe.topics.length >= CURATED_TEMPLATE_MATRIX_SIZE && recipe.techniques.length >= CURATED_TEMPLATE_MATRIX_SIZE) {
    return generatedCuratedTemplate(category, recipe, index);
  }
  const subjectIndex = Math.floor(index / 20) % bp.subjectsZh.length;
  const styleIndex = Math.floor(index / 4) % bp.stylesZh.length;
  const motionIndex = index % bp.motionsZh.length;
  const settingIndex = (subjectIndex + styleIndex + motionIndex) % bp.settingsZh.length;
  const subjectZh = bp.subjectsZh[subjectIndex];
  const subjectEn = bp.subjectsEn[subjectIndex];
  const styleZh = bp.stylesZh[styleIndex];
  const styleEn = bp.stylesEn[styleIndex];
  const motionZh = bp.motionsZh[motionIndex];
  const motionEn = bp.motionsEn[motionIndex];
  const settingZh = bp.settingsZh[settingIndex];
  const settingEn = bp.settingsEn[settingIndex];
  const serial = String(index + 1).padStart(3, '0');
  const isImage = category.kind === 'image';
  return {
    id: makeId(`${category.id}-${serial}-${subjectEn}-${styleEn}-${motionEn}`),
    kind: category.kind,
    categoryId: category.id,
    titleZh: `${category.labelZh} · ${subjectZh} · ${styleZh} · ${motionZh} · ${settingZh}`,
    titleEn: `${category.labelEn} · ${subjectEn} · ${styleEn} · ${motionEn} · ${settingEn}`,
    descriptionZh: `${motionZh}，${settingZh}。${bp.extraZh}`,
    descriptionEn: `${motionEn}, ${settingEn}. ${bp.extraEn}`,
    promptZh: isImage
      ? `生成${styleZh}：主体为${subjectZh}，画面采用${motionZh}，环境/光线为${settingZh}。请写实地控制构图、材质、比例、空间层次和视觉焦点。${bp.extraZh} 画面高级、干净、可用于商业创作。`
      : `生成一个单镜头视频：主体是${subjectZh}，风格为${styleZh}，主要动作/镜头为${motionZh}，场景与光线为${settingZh}。${bp.extraZh} 保持连续运动、稳定主体、一镜到底的真实节奏。`,
    promptEn: isImage
      ? `Create a ${styleEn}: the subject is ${subjectEn}, composed as ${motionEn}, with ${settingEn}. Control composition, material, proportion, spatial depth, and visual focus with realistic clarity. ${bp.extraEn} Make it polished, clean, and usable for commercial creation.`
      : `Create a single-shot video: the subject is ${subjectEn}, the style is ${styleEn}, the main action/camera direction is ${motionEn}, with ${settingEn}. ${bp.extraEn} Keep continuous motion, stable subject identity, and a natural one-shot rhythm.`,
    negativeZh: isImage ? IMAGE_NEGATIVE_ZH : VIDEO_NEGATIVE_ZH,
    negativeEn: isImage ? IMAGE_NEGATIVE_EN : VIDEO_NEGATIVE_EN,
    tags: [category.kind, category.labelZh, subjectZh, styleZh, motionZh, settingZh],
    source: 'curated',
    builtIn: true,
  };
}

const INFINITE_CANVAS_SEEDS: PromptTemplateItem[] = [
  {
    id: 'infinite-canvas-multi-camera-3x3',
    kind: 'image',
    categoryId: 'image-storyboard-grid',
    titleZh: '多机位九宫格',
    titleEn: 'Multi-camera Grid',
    descriptionZh: '同一主体 9 个不同机位，用于角色、产品、空间参考。',
    descriptionEn: 'Same subject from 9 camera angles for character, product, or space reference.',
    promptZh: '3x3 多机位参考表，同一主体从正面、四分之三、侧面、低角度、平视、高角度、背面、四分之三背面、俯视 9 个角度呈现。统一浅暖灰背景 F0EDE8，统一光线，主体边缘自然过渡，无硬边、白边、光晕，保持角色/产品一致性，禁止文字、数字、角标和标注。',
    promptEn: 'A 3x3 multi-camera reference sheet showing the same subject from front, 3/4 front, side, low angle, eye-level, high angle, back, 3/4 back, and overhead views. Uniform warm light-gray F0EDE8 background, consistent lighting, natural edge transition, no hard edges or halos, strong subject consistency, no text, numbers, corner marks, or annotations.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['九宫格', '多机位', '一致性'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-storyboard-2x2',
    kind: 'image',
    categoryId: 'image-storyboard-grid',
    titleZh: '剧情推演四宫格',
    titleEn: 'Story Progression Grid',
    descriptionZh: '同一事件 4 个阶段，适合情绪弧线和叙事节奏测试。',
    descriptionEn: 'Four stages of one event for emotional arcs and story rhythm.',
    promptZh: '2x2 四宫格剧情分镜，展示同一事件从阶段一到阶段四的情绪递进。角色、服装、环境、光线和色彩保持一致，画面电影构图、干净分隔线、浅暖灰背景 F0EDE8，无数字、文字、标签和水印。',
    promptEn: 'A 2x2 storyboard sequence showing one event progressing through four stages. Keep characters, outfits, environment, lighting, and palette consistent. Cinematic composition, clean dividers, warm light-gray F0EDE8 background, no numbers, text, labels, or watermark.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['四宫格', '分镜', '剧情'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-character-face-three-view',
    kind: 'image',
    categoryId: 'image-portrait-character',
    titleZh: '角色脸部三视图',
    titleEn: 'Character Face Three-view',
    descriptionZh: '正面、四分之三、侧面脸部参考，用于 Actor ID 和表情一致性。',
    descriptionEn: 'Front, 3/4, and side profile face reference for identity consistency.',
    promptZh: '角色脸部三视图，单行三格：正面、四分之三、侧面。保持五官、发型、妆容、肤质和光线一致，45 度柔和顶侧光，浅暖灰背景 F0EDE8，专业角色设定表，无可读文字、编号、角标或标签。',
    promptEn: 'Character face reference sheet in one row: front view, 3/4 angle, and side profile. Keep facial features, hairstyle, makeup, skin texture, and lighting identical. Soft 45-degree top-side light, warm F0EDE8 background, professional design sheet, no readable text, numbers, corner marks, or labels.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['脸部', '三视图', '角色一致性'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-product-three-view',
    kind: 'image',
    categoryId: 'image-product-commercial',
    titleZh: '产品三视图',
    titleEn: 'Product Three-view',
    descriptionZh: '产品正面、侧面、顶面，适合工业设计和电商详情。',
    descriptionEn: 'Product front, side, and top views for design and commerce.',
    promptZh: '产品设计三视图，正面、侧面、顶面单行排列。浅暖灰背景 F0EDE8，柔和棚拍阴影，比例精准，材质细节清晰，无透视畸变，无随机文字、logo、标签和水印。',
    promptEn: 'Product design reference sheet with front, side, and top views in one row. Warm F0EDE8 background, soft studio shadows, precise proportions, clear material details, no perspective distortion, no random text, logo, labels, or watermark.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['产品', '三视图', '电商'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-25-frame-storyboard',
    kind: 'image',
    categoryId: 'image-storyboard-grid',
    titleZh: '连贯分镜网格',
    titleEn: 'Sequential Storyboard Grid',
    descriptionZh: '二十五格连续叙事，用于电影分镜和动作连贯性测试。',
    descriptionEn: 'Twenty-five-panel narrative grid for film storyboards and action continuity.',
    promptZh: '5x5 电影分镜网格，25 帧连续展示同一主体、场景或动作，从起始、发展、升级、转折、高潮到收尾。相邻帧动作连贯，角色和环境一致，统一光线和色彩，薄白分隔线，禁止所有数字、文字、标签、角标和水印。',
    promptEn: 'A 5x5 cinematic storyboard grid with 25 sequential frames showing one subject, scene, or action from beginning, development, escalation, twist, climax, to resolution. Smooth continuity between adjacent frames, consistent character and environment, uniform lighting and palette, thin white dividers, no numbers, text, labels, corner marks, or watermark.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['25宫格', '连续分镜'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-cinematic-lighting-six-panel',
    kind: 'image',
    categoryId: 'image-style-lighting',
    titleZh: '电影级光影校正',
    titleEn: 'Cinematic Lighting Comparison',
    descriptionZh: '同一主体 6 种光效，用于灯光方案测试。',
    descriptionEn: 'Six lighting conditions for the same subject to test cinematography.',
    promptZh: '六宫格电影光影对比，同一主体分别呈现金色时刻暖逆光、阴天柔光、霓虹夜景、正午硬光、伦勃朗侧光、低调明暗对比。主体和构图一致，只改变光线，浅暖灰背景 F0EDE8，无文字、编号、标签。',
    promptEn: 'Six-panel cinematic lighting comparison of the same subject: golden-hour warm backlight, overcast soft light, neon night, harsh midday sun, Rembrandt side light, and low-key chiaroscuro. Same subject and composition, lighting changes only, warm F0EDE8 background, no text, numbers, or labels.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['光影', '六宫格'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-character-reference-sheet',
    kind: 'image',
    categoryId: 'image-portrait-character',
    titleZh: '角色设定参考表',
    titleEn: 'Character Reference Sheet',
    descriptionZh: '左侧脸部特写，右侧全身正侧背三视图。',
    descriptionEn: 'Face close-up on the left, front/side/back full-body views on the right.',
    promptZh: '角色设定参考表，左侧三分之一为胸像正面高清脸部特写，右侧三分之二为全身正面、侧面、背面三视图。五官、服装、发型、配饰一致，柔和光线，浅暖灰背景 F0EDE8，无文字和角标。',
    promptEn: 'Character reference sheet: left third is a high-detail chest-up front portrait, right two-thirds show full-body front, side, and back views. Keep face, outfit, hairstyle, and accessories identical, soft lighting, warm F0EDE8 background, no text or corner marks.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['角色设定', 'Actor ID'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-six-expression-bust',
    kind: 'image',
    categoryId: 'image-portrait-character',
    titleZh: '六种基础表情胸像',
    titleEn: 'Six-expression Bust Sheet',
    descriptionZh: '同一角色六种基础表情胸像。',
    descriptionEn: 'Same character across six basic bust expressions.',
    promptZh: '2x3 角色表情参考表，同一角色展示平静、微笑、大笑、悲伤含泪、愤怒、惊讶六种胸像表情。只改变表情，妆容、发型、服装、光线、背景保持一致，无表情文字标签、编号或水印。',
    promptEn: 'A 2x3 character expression reference sheet showing the same character with calm, gentle smile, joyful laugh, sad tearful, angry stern, and surprised expressions. Only expression changes; makeup, hairstyle, outfit, lighting, and background stay consistent. No expression text labels, numbers, or watermark.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['表情', '六宫格'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-720-panorama',
    kind: 'image',
    categoryId: 'image-panorama-vr',
    titleZh: '全景 VR 图',
    titleEn: 'Panorama VR Image',
    descriptionZh: '左右像素级无缝、上下极点自然过渡、封闭空间有门。',
    descriptionEn: 'Pixel-seamless horizontal edges, natural poles, and doors for closed rooms.',
    promptZh: '生成一个 720 度全景 VR 图，左右边缘 100% 像素级无缝衔接，可无限循环拼接；上下极点自然过渡，无明显断层或拉伸，场景一致性和逻辑性合理，封闭场景需要有门。',
    promptEn: 'Generate a 720-degree panoramic VR image with 100% pixel-level seamless left and right edges for infinite looping; natural north/south pole transitions with no visible break or stretching, coherent scene logic, and doors for closed indoor spaces.',
    negativeZh: '接缝、断层、左右不连续、极点拉伸、地平线扭曲、空间逻辑错误、封闭空间无门、文字、水印、低清。',
    negativeEn: 'visible seam, broken panorama, mismatched left/right edges, stretched poles, warped horizon, impossible space, no door in a closed room, text, watermark, low quality.',
    tags: ['全景', 'VR', '无缝'],
    source: 'infinite-canvas',
    builtIn: true,
  },
  {
    id: 'infinite-canvas-multi-camera-3x3-4k',
    kind: 'image',
    categoryId: 'image-storyboard-grid',
    titleZh: '高清多机位九宫格',
    titleEn: 'High-resolution Multi-camera Grid',
    descriptionZh: '高分辨率九宫格版本，适合精细材质和大屏展示。',
    descriptionEn: 'High-resolution multi-camera grid for fine material and large-screen display.',
    promptZh: '超高分辨率 4K 多机位 3x3 参考表，同一主体 9 个角度同时呈现。统一电影光线、浅暖灰背景 F0EDE8、自然边缘过渡、细腻胶片颗粒、无数字文字标签、无锐化塑料感。',
    promptEn: 'Ultra high-resolution 4K 3x3 multi-camera reference sheet showing the same subject from nine angles. Uniform cinematic lighting, warm F0EDE8 background, natural edge transitions, fine film grain, no numbers, text, labels, oversharpening, or plastic look.',
    negativeZh: IMAGE_NEGATIVE_ZH,
    negativeEn: IMAGE_NEGATIVE_EN,
    tags: ['4K', '九宫格'],
    source: 'infinite-canvas',
    builtIn: true,
  },
];

let builtInCache: PromptTemplateItem[] | null = null;

export function getBuiltInPromptTemplates(): PromptTemplateItem[] {
  if (builtInCache) return builtInCache;
  const generated: PromptTemplateItem[] = [];
  for (const category of PROMPT_TEMPLATE_CATEGORIES) {
    const bp = BLUEPRINTS[category.id];
    if (!bp) continue;
    for (let i = 0; i < PROMPT_TEMPLATE_MIN_BUILTIN_PER_CATEGORY; i += 1) {
      generated.push(generatedTemplate(category, bp, i));
    }
  }
  const seen = new Set<string>();
  builtInCache = [...INFINITE_CANVAS_SEEDS, ...generated].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return builtInCache;
}

export function getPromptTemplateCategories(kind: PromptTemplateKind, customCategories: PromptTemplateCategory[] = []) {
  return [...PROMPT_TEMPLATE_CATEGORIES, ...customCategories]
    .filter((category) => category.kind === kind)
    .sort((a, b) => a.order - b.order || a.labelZh.localeCompare(b.labelZh));
}

export function getPromptTemplateText(item: PromptTemplateItem, language: PromptTemplateLanguage, includeNegative = false) {
  const prompt = language === 'en' ? item.promptEn || item.promptZh : item.promptZh || item.promptEn;
  const negative = language === 'en' ? item.negativeEn || item.negativeZh : item.negativeZh || item.negativeEn;
  if (!includeNegative || !negative) return prompt || '';
  return language === 'en'
    ? `${prompt}\n\nNegative prompt:\n${negative}`
    : `${prompt}\n\n负向提示词：\n${negative}`;
}

export function getPromptTemplateTitle(item: PromptTemplateItem, language: PromptTemplateLanguage) {
  return language === 'en' ? item.titleEn || item.titleZh : item.titleZh || item.titleEn;
}

export function getPromptTemplateDescription(item: PromptTemplateItem, language: PromptTemplateLanguage) {
  return language === 'en' ? item.descriptionEn || item.descriptionZh : item.descriptionZh || item.descriptionEn;
}

export function getPromptTemplateCategoryLabel(category: PromptTemplateCategory, language: PromptTemplateLanguage) {
  return language === 'en' ? category.labelEn || category.labelZh : category.labelZh || category.labelEn;
}

export function countBuiltInPromptTemplatesByCategory() {
  const counts: Record<string, number> = {};
  for (const item of getBuiltInPromptTemplates()) {
    counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
  }
  return counts;
}

import {
  PORTRAIT_GROUPS,
  PORTRAIT_OPTION_BY_ID,
  type PortraitCategory,
  type PortraitGroup,
  type PortraitLanguage,
  type PortraitLocks,
  type PortraitOption,
  type PortraitSelection,
  type PortraitTerm,
  type PortraitWeights,
} from './portraitMasterOptions.ts';

type AdvancedTerm = PortraitTerm;

interface GroupBlueprint {
  id: string;
  label: string;
  labelEn: string;
  terms: AdvancedTerm[];
}

interface CategoryBlueprint {
  id: string;
  label: string;
  labelEn: string;
  description: string;
  groups: GroupBlueprint[];
}

const ADVANCED_OPTIONS_PER_GROUP = 100;

const t = (zh: string, en: string, prompt = en): AdvancedTerm => ({ zh, en, prompt });

const ADVANCED_VARIANTS = [
  { zhSuffix: ' · 精致', enPrefix: 'refined', promptPrefix: 'refined' },
  { zhSuffix: ' · 高定', enPrefix: 'couture', promptPrefix: 'couture' },
  { zhSuffix: ' · 暗夜', enPrefix: 'noir', promptPrefix: 'noir' },
  { zhSuffix: ' · 写实', enPrefix: 'realistic', promptPrefix: 'realistic' },
  { zhSuffix: ' · 电影感', enPrefix: 'cinematic', promptPrefix: 'cinematic' },
  { zhSuffix: ' · 丝绒', enPrefix: 'velvet-textured', promptPrefix: 'velvet-textured' },
  { zhSuffix: ' · 缎面', enPrefix: 'satin-finished', promptPrefix: 'satin-finished' },
  { zhSuffix: ' · 蕾丝', enPrefix: 'lace-detailed', promptPrefix: 'lace-detailed' },
  { zhSuffix: ' · 哥特', enPrefix: 'gothic', promptPrefix: 'gothic' },
  { zhSuffix: ' · 霓虹', enPrefix: 'neon-accented', promptPrefix: 'neon-accented' },
] as const;

function expandAdvancedTerms(terms: AdvancedTerm[]): AdvancedTerm[] {
  if (terms.length >= ADVANCED_OPTIONS_PER_GROUP) return terms.slice(0, ADVANCED_OPTIONS_PER_GROUP);
  const out = [...terms];
  let variantIndex = 0;
  while (out.length < ADVANCED_OPTIONS_PER_GROUP && terms.length > 0) {
    const variant = ADVANCED_VARIANTS[variantIndex % ADVANCED_VARIANTS.length];
    for (const term of terms) {
      if (out.length >= ADVANCED_OPTIONS_PER_GROUP) break;
      const prompt = term.prompt || term.en;
      out.push({
        zh: `${term.zh}${variant.zhSuffix}`,
        en: `${variant.enPrefix} ${term.en}`,
        prompt: `${variant.promptPrefix} ${prompt}`,
      });
    }
    variantIndex += 1;
  }
  return out;
}

function applyWeight(prompt: string, weight: number): string {
  if (!Number.isFinite(weight) || Math.abs(weight - 1) < 0.01) return prompt;
  return `(${prompt}:${weight.toFixed(1)})`;
}

const blueprints: CategoryBlueprint[] = [
  {
    id: 'hidden-lingerie',
    label: '隐藏内衣',
    labelEn: 'Hidden Lingerie',
    description: '仅在幽游白书隐藏模式中启用。用于成年角色的内衣、胸罩、内裤与套装细节。',
    groups: [
      {
        id: 'hiddenBra',
        label: '胸罩',
        labelEn: 'Bra',
        terms: [
          t('蕾丝胸罩', 'lace bra'), t('缎面胸罩', 'satin bra'), t('无钢圈胸罩', 'soft cup bra'),
          t('半罩杯胸罩', 'demi bra'), t('法式三角胸罩', 'triangle bra'), t('长款胸罩', 'longline bra'),
          t('露肩胸罩', 'strapless bra'), t('挂脖胸罩', 'halter bra'), t('交叉肩带胸罩', 'cross-strap bra'),
          t('薄纱胸罩', 'mesh bra'), t('刺绣胸罩', 'embroidered bra'), t('珍珠肩带胸罩', 'pearl strap bra'),
          t('皮革感胸罩', 'leather-look bra'), t('天鹅绒胸罩', 'velvet bra'), t('运动风胸罩', 'sporty bralette'),
          t('极简胸罩', 'minimal bralette'), t('复古胸罩', 'retro bra'), t('束身胸罩', 'corset bra'),
          t('镂空胸罩', 'cutout bra'), t('金属扣胸罩', 'metal clasp bra'),
        ],
      },
      {
        id: 'hiddenPanties',
        label: '内裤',
        labelEn: 'Panties',
        terms: [
          t('蕾丝内裤', 'lace panties'), t('高腰内裤', 'high-waist panties'), t('低腰内裤', 'low-rise panties'),
          t('缎面内裤', 'satin panties'), t('薄纱内裤', 'mesh panties'), t('比基尼内裤', 'bikini panties'),
          t('平角内裤', 'boyshort panties'), t('丁字内裤', 'thong panties'), t('细带内裤', 'strappy panties'),
          t('复古内裤', 'retro panties'), t('蝴蝶结内裤', 'bow-trim panties'), t('刺绣内裤', 'embroidered panties'),
          t('珍珠装饰内裤', 'pearl detail panties'), t('皮革感内裤', 'leather-look panties'), t('天鹅绒内裤', 'velvet panties'),
          t('透明感内裤', 'sheer-panel panties'), t('哥特内裤', 'gothic panties'), t('花边内裤', 'ruffled panties'),
          t('极简内裤', 'minimal panties'), t('吊带内裤', 'garter panties'),
        ],
      },
      {
        id: 'hiddenLingerieSet',
        label: '内衣套装',
        labelEn: 'Lingerie set',
        terms: [
          t('黑色蕾丝内衣套装', 'black lace lingerie set'), t('白色缎面内衣套装', 'white satin lingerie set'),
          t('红色高定内衣套装', 'red couture lingerie set'), t('哥特内衣套装', 'gothic lingerie set'),
          t('法式内衣套装', 'French lingerie set'), t('复古内衣套装', 'retro lingerie set'),
          t('珍珠链内衣套装', 'pearl-chain lingerie set'), t('婚纱风内衣套装', 'bridal lingerie set'),
          t('赛博内衣套装', 'cyber lingerie set'), t('天鹅绒内衣套装', 'velvet lingerie set'),
          t('薄纱内衣套装', 'sheer mesh lingerie set'), t('绑带内衣套装', 'strappy lingerie set'),
          t('花边内衣套装', 'ruffled lingerie set'), t('金属装饰内衣套装', 'metal-accent lingerie set'),
          t('高级灰内衣套装', 'charcoal luxury lingerie set'), t('深紫内衣套装', 'deep violet lingerie set'),
          t('午夜蓝内衣套装', 'midnight blue lingerie set'), t('玫瑰粉内衣套装', 'rose pink lingerie set'),
          t('象牙白内衣套装', 'ivory lingerie set'), t('皮革感内衣套装', 'leather-look lingerie set'),
        ],
      },
      {
        id: 'hiddenBodysuit',
        label: '连体/束身',
        labelEn: 'Bodysuit',
        terms: [
          t('蕾丝连体衣', 'lace bodysuit'), t('缎面连体衣', 'satin bodysuit'), t('薄纱连体衣', 'mesh bodysuit'),
          t('束身衣', 'corset bodice'), t('巴斯克束身衣', 'basque corset'), t('吊带连体衣', 'strappy bodysuit'),
          t('高领连体衣', 'high-neck bodysuit'), t('露背连体衣', 'open-back bodysuit'), t('长袖薄纱连体衣', 'long-sleeve mesh bodysuit'),
          t('皮革感连体衣', 'leather-look bodysuit'), t('天鹅绒连体衣', 'velvet bodysuit'), t('刺绣束身衣', 'embroidered corset'),
          t('金属扣束身衣', 'metal-clasp corset'), t('珍珠链连体衣', 'pearl-chain bodysuit'), t('复古束腰', 'retro waist cincher'),
          t('舞台连体衣', 'stage bodysuit'), t('哥特束身衣', 'gothic corset'), t('赛博束身衣', 'cyber corset'),
          t('法式睡衣裙', 'French chemise'), t('吊带睡裙', 'silk slip dress'),
        ],
      },
    ],
  },
  {
    id: 'hidden-boudoir',
    label: '隐藏闺房造型',
    labelEn: 'Hidden Boudoir',
    description: '用于成年角色的私密造型、袜带、披袍、材质与氛围，默认不进入公开随机。',
    groups: [
      {
        id: 'hiddenHosiery',
        label: '袜带/丝袜',
        labelEn: 'Hosiery',
        terms: [
          t('大腿袜', 'thigh-high stockings'), t('吊带袜', 'garter stockings'), t('蕾丝袜', 'lace stockings'),
          t('渔网袜', 'fishnet stockings'), t('黑色丝袜', 'black sheer stockings'), t('白色长袜', 'white thigh-high socks'),
          t('背缝丝袜', 'back-seam stockings'), t('缎带袜带', 'ribbon garter belt'), t('皮革袜带', 'leather garter belt'),
          t('珍珠袜带', 'pearl garter belt'), t('复古吊袜带', 'retro suspender belt'), t('花边长袜', 'ruffled stockings'),
          t('银丝丝袜', 'silver-thread stockings'), t('金线丝袜', 'gold-thread stockings'), t('红色丝袜', 'red sheer stockings'),
          t('深紫丝袜', 'deep violet stockings'), t('半透明裤袜', 'translucent tights'), t('星纹丝袜', 'star-pattern stockings'),
          t('哥特袜带', 'gothic garter belt'), t('赛博腿环', 'cyber thigh straps'),
        ],
      },
      {
        id: 'hiddenRobe',
        label: '睡袍/披纱',
        labelEn: 'Robe',
        terms: [
          t('丝绸睡袍', 'silk robe'), t('薄纱披袍', 'sheer robe'), t('羽毛边睡袍', 'feather-trim robe'),
          t('缎面睡袍', 'satin robe'), t('蕾丝晨袍', 'lace peignoir'), t('短款睡袍', 'short boudoir robe'),
          t('长款睡袍', 'long boudoir robe'), t('和风薄袍', 'kimono-style robe'), t('天鹅绒披袍', 'velvet robe'),
          t('黑色披纱', 'black sheer shawl'), t('白色披纱', 'white sheer shawl'), t('玫瑰披肩', 'rose-tinted shawl'),
          t('透明薄纱罩衫', 'transparent chiffon cover-up'), t('金线睡袍', 'gold-thread robe'), t('珍珠扣睡袍', 'pearl-button robe'),
          t('复古睡袍', 'retro dressing gown'), t('哥特披袍', 'gothic robe'), t('霓虹边披袍', 'neon-trim robe'),
          t('羽翼感披肩', 'wing-like shawl'), t('午夜蓝睡袍', 'midnight blue robe'),
        ],
      },
      {
        id: 'hiddenMaterial',
        label: '私密材质',
        labelEn: 'Texture',
        terms: [
          t('精致蕾丝边', 'delicate lace trim'), t('高级缎面光泽', 'luxury satin sheen'), t('薄纱透叠层', 'layered sheer mesh'),
          t('珍珠扣细节', 'pearl clasp detail'), t('金属扣环', 'metal ring hardware'), t('丝绒触感', 'velvet texture'),
          t('皮革感纹理', 'leather-look texture'), t('刺绣花纹', 'embroidered pattern'), t('微闪织物', 'subtle glitter fabric'),
          t('羽毛装饰', 'feather accent'), t('缎带绑结', 'ribbon lacing'), t('荷叶花边', 'ruffled lace edge'),
          t('细带交错', 'interlaced straps'), t('镂空结构', 'cutout structure'), t('珠链垂饰', 'dangling bead chain'),
          t('水晶坠饰', 'crystal charm detail'), t('网格织物', 'mesh grid fabric'), t('闪粉薄纱', 'sparkling tulle'),
          t('金线绣边', 'gold-thread embroidery'), t('银线绣边', 'silver-thread embroidery'),
        ],
      },
      {
        id: 'hiddenBoudoirMood',
        label: '闺房氛围',
        labelEn: 'Boudoir mood',
        terms: [
          t('优雅闺房感', 'elegant boudoir mood'), t('暗夜私房感', 'noir boudoir mood'), t('柔光卧室氛围', 'soft bedroom lighting mood'),
          t('红丝绒房间', 'red velvet room atmosphere'), t('复古梳妆间', 'retro dressing room atmosphere'), t('蜡烛光氛围', 'candlelit boudoir atmosphere'),
          t('月光窗边', 'moonlit window boudoir mood'), t('高级酒店套房感', 'luxury suite boudoir mood'), t('哥特古堡卧室', 'gothic castle bedroom mood'),
          t('赛博霓虹闺房', 'cyber neon boudoir mood'), t('玫瑰花瓣床面', 'rose petal bed setting'), t('丝绸床单光泽', 'silk sheet glow'),
          t('低饱和私房摄影', 'muted boudoir photography mood'), t('黑金闺房调性', 'black and gold boudoir mood'),
          t('粉色柔雾氛围', 'pink haze boudoir mood'), t('香水广告感', 'perfume campaign boudoir mood'),
          t('电影级私密肖像', 'cinematic intimate portrait mood'), t('高定内衣广告感', 'couture lingerie editorial mood'),
          t('轻奢卧室氛围', 'quiet luxury bedroom mood'), t('神秘夜色氛围', 'mysterious night boudoir mood'),
        ],
      },
    ],
  },
  {
    id: 'hidden-adult-props',
    label: '隐藏情趣道具',
    labelEn: 'Hidden Adult Props',
    description: '成年角色专用的情趣用品、束缚感配饰和成人向摄影道具；检测到未成年/学生设定时不会输出。',
    groups: [
      {
        id: 'hiddenAdultProp',
        label: '情趣用品',
        labelEn: 'Adult novelty prop',
        terms: [
          t('丝绸眼罩', 'silk blindfold'), t('蕾丝眼罩', 'lace blindfold'), t('缎带束缚道具', 'ribbon restraint prop'),
          t('装饰手铐', 'decorative handcuffs'), t('皮革手铐', 'leather cuffs'), t('丝绒手铐', 'velvet cuffs'),
          t('羽毛逗趣棒', 'feather teaser prop'), t('玫瑰鞭装饰', 'rose whip accessory'), t('骑乘鞭道具', 'riding crop prop'),
          t('项圈牵引链', 'collar and leash accessory'), t('皮革项圈', 'leather collar'), t('金属铃铛项圈', 'bell collar'),
          t('身体链条', 'body chain harness'), t('束缚肩带', 'restraint-style shoulder straps'), t('腰链束带', 'waist chain harness'),
          t('腿环束带', 'thigh strap harness'), t('口枷造型道具', 'bit gag styling prop'), t('蝴蝶结口饰', 'bow mouth accessory'),
          t('情趣面具', 'masquerade adult mask'), t('成人玩具盒道具', 'adult novelty box prop'),
        ],
      },
      {
        id: 'hiddenHarness',
        label: '束缚感配饰',
        labelEn: 'Harness',
        terms: [
          t('皮革胸部束带', 'leather chest harness'), t('腰部束带', 'waist harness'), t('肩部束带', 'shoulder harness'),
          t('腿部束带', 'leg harness'), t('交叉绑带', 'cross-body straps'), t('金属扣束带', 'metal-buckle harness'),
          t('哥特束带', 'gothic harness'), t('赛博束带', 'cyber harness'), t('丝绒束带', 'velvet harness'),
          t('蕾丝束带', 'lace harness'), t('珍珠链束带', 'pearl-chain harness'), t('细链胸饰', 'thin chain chest accessory'),
          t('束腰绑带', 'waist lacing harness'), t('颈肩束带', 'neck-and-shoulder harness'), t('背部束带', 'back harness'),
          t('高级时装束带', 'couture fashion harness'), t('装饰绑绳', 'decorative rope styling'), t('丝带绑缚感', 'ribbon bondage-inspired styling'),
          t('金属环绑带', 'ring-strap harness'), t('极简束缚配饰', 'minimal restraint accessory'),
        ],
      },
      {
        id: 'hiddenAdultPose',
        label: '成人姿态',
        labelEn: 'Adult pose',
        terms: [
          t('优雅撩发姿态', 'elegant hair-touch pose'), t('倚靠床沿姿态', 'leaning on bed edge pose'), t('坐在梳妆台前', 'seated at vanity pose'),
          t('单手扶肩姿态', 'hand on shoulder pose'), t('回眸私房姿态', 'over-the-shoulder boudoir pose'), t('蜷坐姿态', 'curled seated pose'),
          t('跪坐床面姿态', 'kneeling on bed pose'), t('侧卧姿态', 'side-lying pose'), t('交叠双腿坐姿', 'crossed-leg seated pose'),
          t('拉肩带动作', 'adjusting shoulder strap pose'), t('整理项圈动作', 'adjusting collar pose'), t('轻拉手套动作', 'pulling glove pose'),
          t('抬手遮光姿态', 'hand shielding light pose'), t('靠墙站姿', 'leaning against wall pose'), t('窗边回头姿态', 'window-side glance pose'),
          t('柔软伸展姿态', 'soft stretching pose'), t('高定广告姿态', 'couture editorial pose'), t('暗夜凝视姿态', 'noir gaze pose'),
          t('自信挑眉姿态', 'confident raised-brow pose'), t('安静诱惑姿态', 'quiet seductive pose'),
        ],
      },
      {
        id: 'hiddenAdultStyling',
        label: '成人造型',
        labelEn: 'Adult styling',
        terms: [
          t('高定成人写真风', 'couture adult portrait styling'), t('闺房写真风', 'boudoir portrait styling'), t('暗黑情趣风', 'dark intimate styling'),
          t('优雅情趣风', 'elegant intimate styling'), t('香水广告成人感', 'perfume-adult editorial styling'), t('轻奢私密风', 'quiet luxury intimate styling'),
          t('哥特成人造型', 'gothic adult styling'), t('赛博成人造型', 'cyber adult styling'), t('红黑成人造型', 'red and black adult styling'),
          t('黑金成人造型', 'black and gold adult styling'), t('复古成人写真', 'retro adult portrait styling'), t('法式成人造型', 'French adult styling'),
          t('绅士俱乐部氛围', 'gentleman club atmosphere styling'), t('舞台成人造型', 'stage adult styling'), t('夜店成人造型', 'nightclub adult styling'),
          t('暗房摄影造型', 'darkroom editorial styling'), t('丝绸卧室造型', 'silk bedroom styling'), t('隐秘恋人感', 'secret lover mood styling'),
          t('高级内衣广告', 'luxury lingerie campaign styling'), t('成人漫画封面感', 'adult comic cover styling'),
        ],
      },
    ],
  },
];

export const PORTRAIT_ADVANCED_CATEGORIES: PortraitCategory[] = blueprints.map((category) => ({
  id: category.id,
  label: category.label,
  labelEn: category.labelEn,
  description: category.description,
  groups: category.groups.map((group) => {
    const expanded = expandAdvancedTerms(group.terms);
    return {
      id: group.id,
      categoryId: category.id,
      label: group.label,
      labelEn: group.labelEn,
      options: expanded.map((term, index) => ({
        id: `${group.id}-${index + 1}`,
        categoryId: category.id,
        groupId: group.id,
        label: term.zh,
        labelEn: term.en,
        prompt: term.prompt || term.en,
        previewTag: term.zh,
      })),
    };
  }),
}));

export const PORTRAIT_ADVANCED_GROUPS: PortraitGroup[] = PORTRAIT_ADVANCED_CATEGORIES.flatMap((category) => category.groups);
export const PORTRAIT_ADVANCED_OPTIONS: PortraitOption[] = PORTRAIT_ADVANCED_GROUPS.flatMap((group) => group.options);
export const PORTRAIT_ADVANCED_OPTION_BY_ID = new Map(PORTRAIT_ADVANCED_OPTIONS.map((option) => [option.id, option]));

export function categoryAdvancedOptionCount(categoryId: string): number {
  const category = PORTRAIT_ADVANCED_CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return 0;
  return category.groups.reduce((sum, group) => sum + group.options.length, 0);
}

export function normalizePortraitAdvancedSelection(value: unknown): PortraitSelection {
  if (!value || typeof value !== 'object') return {};
  const out: PortraitSelection = {};
  for (const group of PORTRAIT_ADVANCED_GROUPS) {
    const selected = String((value as Record<string, unknown>)[group.id] || '');
    if (selected && PORTRAIT_ADVANCED_OPTION_BY_ID.has(selected)) out[group.id] = selected;
  }
  return out;
}

export function normalizePortraitAdvancedLocks(value: unknown): PortraitLocks {
  if (!value || typeof value !== 'object') return {};
  const out: PortraitLocks = {};
  for (const group of PORTRAIT_ADVANCED_GROUPS) {
    out[group.id] = Boolean((value as Record<string, unknown>)[group.id]);
  }
  return out;
}

export function normalizePortraitAdvancedWeights(value: unknown): PortraitWeights {
  if (!value || typeof value !== 'object') return {};
  const out: PortraitWeights = {};
  for (const group of PORTRAIT_ADVANCED_GROUPS) {
    const n = Number((value as Record<string, unknown>)[group.id]);
    if (Number.isFinite(n) && n > 0) out[group.id] = Math.max(0.5, Math.min(1.8, n));
  }
  return out;
}

export function buildPortraitAdvancedPrompt(params: {
  selection: PortraitSelection;
  weights?: PortraitWeights;
  language?: PortraitLanguage;
}): string {
  const language = params.language || 'en';
  const parts: string[] = [];
  for (const group of PORTRAIT_ADVANCED_GROUPS) {
    const selected = params.selection[group.id];
    const option = selected ? PORTRAIT_ADVANCED_OPTION_BY_ID.get(selected) : null;
    if (!option) continue;
    const text = language === 'zh' ? option.label : option.prompt;
    parts.push(applyWeight(text, params.weights?.[group.id] ?? 1));
  }
  return parts.join(language === 'zh' ? '，' : ', ');
}

export function summarizePortraitAdvancedSelection(selection: PortraitSelection, language: PortraitLanguage = 'zh'): string {
  const labels: string[] = [];
  for (const group of PORTRAIT_ADVANCED_GROUPS) {
    const option = selection[group.id] ? PORTRAIT_ADVANCED_OPTION_BY_ID.get(selection[group.id]) : null;
    if (option) labels.push(language === 'zh' ? option.label : option.labelEn);
  }
  if (labels.length === 0) return '未选择隐藏词条';
  return labels.slice(0, 8).join(' / ') + (labels.length > 8 ? ` / +${labels.length - 8}` : '');
}

export function portraitAdvancedStats(selection: PortraitSelection): { selected: number; totalGroups: number } {
  let selected = 0;
  for (const group of PORTRAIT_ADVANCED_GROUPS) {
    if (selection[group.id] && PORTRAIT_ADVANCED_OPTION_BY_ID.has(selection[group.id])) selected += 1;
  }
  return { selected, totalGroups: PORTRAIT_ADVANCED_GROUPS.length };
}

export function clearAdvancedCategorySelection(selection: PortraitSelection, categoryId: string): PortraitSelection {
  const out: PortraitSelection = { ...selection };
  const category = PORTRAIT_ADVANCED_CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return out;
  for (const group of category.groups) delete out[group.id];
  return out;
}

export function randomizePortraitHiddenAdvanced(params: {
  current?: PortraitSelection;
  locks?: PortraitLocks;
  categoryId?: string;
  seed?: number;
} = {}): PortraitSelection {
  const out: PortraitSelection = { ...(params.current || {}) };
  let seed = params.seed ?? Date.now();
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const categoryGroupIds = params.categoryId
    ? new Set(PORTRAIT_ADVANCED_CATEGORIES.find((item) => item.id === params.categoryId)?.groups.map((group) => group.id) || [])
    : null;
  for (const group of PORTRAIT_ADVANCED_GROUPS) {
    if (categoryGroupIds && !categoryGroupIds.has(group.id)) continue;
    if (params.locks?.[group.id]) continue;
    if (nextRand() < 0.1) {
      delete out[group.id];
      continue;
    }
    const option = group.options[Math.floor(nextRand() * group.options.length)];
    if (option) out[group.id] = option.id;
  }
  return out;
}

const UNDERAGE_PATTERNS = [
  /少女/,
  /少年/,
  /童话/,
  /学院/,
  /校园/,
  /学生/,
  /人偶少女/,
  /\bteen(?:age)?\b/i,
  /\byoung girl\b/i,
  /\byoung boy\b/i,
  /\bschool(?:girl|boy| student)?\b/i,
  /\bacademy girl\b/i,
  /\bstorybook young girl\b/i,
  /\byouthful\b/i,
  /\bdoll girl\b/i,
  /\bporcelain doll girl\b/i,
];

export function portraitSelectionLooksUnderage(selection: PortraitSelection): boolean {
  for (const group of PORTRAIT_GROUPS) {
    const option = selection[group.id] ? PORTRAIT_OPTION_BY_ID.get(selection[group.id]) : null;
    if (!option) continue;
    const haystack = `${option.label} ${option.labelEn} ${option.prompt}`;
    if (UNDERAGE_PATTERNS.some((pattern) => pattern.test(haystack))) return true;
  }
  return false;
}

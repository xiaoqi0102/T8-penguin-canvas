export type PortraitLanguage = 'en' | 'zh';

export interface PortraitTerm {
  zh: string;
  en: string;
  prompt?: string;
}

export interface PortraitOption {
  id: string;
  categoryId: string;
  groupId: string;
  label: string;
  labelEn: string;
  prompt: string;
  previewTag?: string;
  preview?: PortraitPreviewPatch;
}

export interface PortraitGroup {
  id: string;
  categoryId: string;
  label: string;
  labelEn: string;
  options: PortraitOption[];
}

export interface PortraitCategory {
  id: string;
  label: string;
  labelEn: string;
  description: string;
  groups: PortraitGroup[];
}

export type PortraitSelection = Record<string, string>;
export type PortraitLocks = Record<string, boolean>;
export type PortraitWeights = Record<string, number>;

export type PortraitHairShape = 'natural' | 'short' | 'bob' | 'long' | 'tails' | 'bun' | 'braid' | 'updo';
export type PortraitBangs = 'none' | 'soft' | 'straight' | 'side' | 'curtain' | 'messy' | 'covered';
export type PortraitEyeShape = 'round' | 'almond' | 'slender' | 'cat' | 'droopy' | 'sharp';
export type PortraitMouthShape = 'neutral' | 'smile' | 'soft-smile' | 'open' | 'smirk' | 'sad';
export type PortraitBrowShape = 'soft' | 'straight' | 'arched' | 'sharp' | 'thick';
export type PortraitAccessoryShape = 'none' | 'ribbon' | 'flower' | 'crown' | 'hat' | 'veil' | 'headband' | 'forehead';
export type PortraitAvatarMood = 'neutral' | 'soft' | 'cool' | 'sweet' | 'dark' | 'cyber' | 'royal' | 'battle' | 'dream';

export interface PortraitPreviewState {
  skin: string;
  hair: string;
  eye: string;
  blush: string;
  outfit: string;
  accent: string;
  background: string;
  headScaleX: number;
  headScaleY: number;
  bodyScale: number;
  hairShape: PortraitHairShape;
  bangs: PortraitBangs;
  eyeShape: PortraitEyeShape;
  mouth: PortraitMouthShape;
  brow: PortraitBrowShape;
  accessory: PortraitAccessoryShape;
  animalEars: boolean;
  glasses: boolean;
  mark: 'none' | 'scar' | 'tattoo' | 'magic' | 'freckles';
  mood: PortraitAvatarMood;
}

export type PortraitPreviewPatch = Partial<PortraitPreviewState>;

interface GroupBlueprint {
  id: string;
  label: string;
  labelEn: string;
  terms: PortraitTerm[];
}

interface CategoryBlueprint {
  id: string;
  label: string;
  labelEn: string;
  description: string;
  groups: GroupBlueprint[];
}

const t = (zh: string, en: string, prompt = en): PortraitTerm => ({ zh, en, prompt });
const PORTRAIT_OPTIONS_PER_GROUP = 100;

const TERM_VARIANTS = [
  { zhSuffix: ' · 精致', enPrefix: 'refined', promptPrefix: 'refined' },
  { zhSuffix: ' · 写实', enPrefix: 'realistic', promptPrefix: 'realistic' },
  { zhSuffix: ' · 电影感', enPrefix: 'cinematic', promptPrefix: 'cinematic' },
  { zhSuffix: ' · 动漫感', enPrefix: 'anime-styled', promptPrefix: 'anime-styled' },
  { zhSuffix: ' · 高级感', enPrefix: 'high-fashion', promptPrefix: 'high-fashion' },
  { zhSuffix: ' · 柔和', enPrefix: 'soft', promptPrefix: 'soft' },
  { zhSuffix: ' · 冷感', enPrefix: 'cool refined', promptPrefix: 'cool refined' },
  { zhSuffix: ' · 华丽', enPrefix: 'ornate', promptPrefix: 'ornate' },
  { zhSuffix: ' · 清透', enPrefix: 'clean translucent', promptPrefix: 'clean translucent' },
  { zhSuffix: ' · 戏剧化', enPrefix: 'dramatic', promptPrefix: 'dramatic' },
  { zhSuffix: ' · 复古', enPrefix: 'retro', promptPrefix: 'retro' },
  { zhSuffix: ' · 未来感', enPrefix: 'futuristic', promptPrefix: 'futuristic' },
] as const;

function expandTermsToTarget(terms: PortraitTerm[]): PortraitTerm[] {
  if (terms.length >= PORTRAIT_OPTIONS_PER_GROUP) return terms.slice(0, PORTRAIT_OPTIONS_PER_GROUP);
  const out = [...terms];
  let variantIndex = 0;
  while (out.length < PORTRAIT_OPTIONS_PER_GROUP && terms.length > 0) {
    const variant = TERM_VARIANTS[variantIndex % TERM_VARIANTS.length];
    for (const term of terms) {
      if (out.length >= PORTRAIT_OPTIONS_PER_GROUP) break;
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

const blueprints: CategoryBlueprint[] = [
  {
    id: 'base',
    label: '基础人物',
    labelEn: 'Base',
    description: '年龄、身份、体型、肤色和整体轮廓。',
    groups: [
      {
        id: 'age',
        label: '年龄感',
        labelEn: 'Age',
        terms: [
          t('少女', 'teenage girl'), t('青年女性', 'young adult woman'), t('成熟女性', 'mature woman'),
          t('少年', 'teenage boy'), t('青年男性', 'young adult man'), t('成熟女性领袖', 'mature female leader'),
          t('童话少女', 'storybook young girl'), t('学院少女', 'academy girl'), t('都市青年', 'urban young adult'),
          t('古典美人', 'classical beauty'), t('未来新人类', 'futuristic human'), t('精灵少女', 'elf-like young woman'),
          t('吸血鬼贵族', 'vampire noble'), t('赛博少女', 'cyberpunk girl'), t('战斗少女', 'battle heroine'),
          t('温柔姐姐', 'gentle older sister'), t('冷艳御姐', 'cool elegant woman'), t('神秘旅人', 'mysterious traveler'),
          t('王族继承人', 'royal heir'), t('人偶少女', 'porcelain doll girl'),
        ],
      },
      {
        id: 'identity',
        label: '身份',
        labelEn: 'Identity',
        terms: [
          t('偶像歌手', 'idol singer'), t('魔法师', 'mage'), t('剑士', 'swordsman'), t('忍者', 'ninja'),
          t('女仆', 'maid'), t('骑士', 'knight'), t('医生', 'doctor'), t('侦探', 'detective'),
          t('画家', 'painter'), t('舞者', 'dancer'), t('贵族', 'aristocrat'), t('机械师', 'mechanic'),
          t('赛博特工', 'cyber agent'), t('宇航员', 'astronaut'), t('海盗船长', 'pirate captain'),
          t('校园学生', 'school student'), t('图书管理员', 'librarian'), t('巫女', 'shrine maiden'),
          t('旅行摄影师', 'travel photographer'), t('战地指挥官', 'battle commander'),
        ],
      },
      {
        id: 'bodyShape',
        label: '体型',
        labelEn: 'Body',
        terms: [
          t('纤细', 'slender body'), t('匀称', 'balanced proportions'), t('高挑', 'tall figure'),
          t('娇小', 'petite figure'), t('运动型', 'athletic body'), t('柔美曲线', 'soft feminine curves'),
          t('模特身材', 'fashion model proportions'), t('强健', 'strong physique'), t('清瘦', 'lean silhouette'),
          t('圆润可爱', 'soft cute build'), t('优雅修长', 'elegantly elongated figure'), t('紧致肌肉', 'toned muscles'),
          t('轻盈舞者体态', 'light dancer posture'), t('古典雕塑比例', 'classical statue proportions'),
          t('少年感', 'youthful slim build'), t('英气肩线', 'confident shoulder line'), t('腰线明显', 'defined waistline'),
          t('长腿比例', 'long-legged proportions'), t('小骨架', 'delicate frame'), t('平衡自然', 'natural body proportions'),
        ],
      },
      {
        id: 'skinTone',
        label: '肤色',
        labelEn: 'Skin',
        terms: [
          t('瓷白肌', 'porcelain skin'), t('白皙肌', 'fair skin'), t('暖象牙色肌肤', 'warm ivory skin'),
          t('自然肤色', 'natural skin tone'), t('小麦肌', 'wheat-toned skin'), t('健康晒痕', 'sun-kissed skin'),
          t('冷白皮', 'cool fair skin'), t('蜜糖肤色', 'honey skin tone'), t('古铜肤色', 'bronze skin'),
          t('半透明肌理', 'translucent skin texture'), t('柔光肌肤', 'soft glowing skin'), t('微雀斑肌肤', 'subtle freckled skin'),
          t('月光苍白', 'moonlit pale skin'), t('玫瑰肤色', 'rosy skin tone'), t('雾面肌肤', 'matte skin texture'),
          t('珍珠光泽肌肤', 'pearl-like skin glow'), t('赛博冷光肤色', 'cyber cool skin glow'), t('梦幻粉肤', 'dreamy pink skin tone'),
          t('自然瑕疵肌理', 'natural skin texture with tiny imperfections'), t('高清真实肌理', 'high-detail realistic skin texture'),
        ],
      },
      {
        id: 'silhouette',
        label: '轮廓',
        labelEn: 'Silhouette',
        terms: [
          t('柔和轮廓', 'soft silhouette'), t('利落轮廓', 'clean sharp silhouette'), t('贵气轮廓', 'regal silhouette'),
          t('少女轮廓', 'youthful silhouette'), t('英雄轮廓', 'heroic silhouette'), t('纤长轮廓', 'elongated silhouette'),
          t('哥特轮廓', 'gothic silhouette'), t('未来装甲轮廓', 'futuristic armored silhouette'), t('复古轮廓', 'retro silhouette'),
          t('学院风轮廓', 'academy silhouette'), t('舞台轮廓', 'stage-ready silhouette'), t('轻小说主角轮廓', 'light novel protagonist silhouette'),
          t('王女轮廓', 'princess silhouette'), t('战术轮廓', 'tactical silhouette'), t('都市轮廓', 'urban silhouette'),
          t('幻想轮廓', 'fantasy silhouette'), t('暗黑轮廓', 'dark dramatic silhouette'), t('清新轮廓', 'fresh clean silhouette'),
          t('神圣轮廓', 'sacred silhouette'), t('梦境轮廓', 'dreamlike silhouette'),
        ],
      },
    ],
  },
  {
    id: 'face',
    label: '五官',
    labelEn: 'Facial Features',
    description: '脸型、眼睛、眉毛、鼻子、嘴唇和耳朵分组控制。',
    groups: [
      {
        id: 'faceShape',
        label: '脸型',
        labelEn: 'Face shape',
        terms: [
          t('鹅蛋脸', 'oval face'), t('瓜子脸', 'heart-shaped face'), t('圆脸', 'round face'), t('小巧脸', 'small delicate face'),
          t('高级感脸型', 'high-fashion facial structure'), t('柔和脸型', 'soft facial structure'), t('清冷脸型', 'cool refined face'),
          t('娃娃脸', 'doll-like face'), t('英气脸型', 'handsome androgynous face'), t('骨相清晰', 'defined bone structure'),
          t('面部线条流畅', 'smooth facial contours'), t('轻熟脸', 'soft mature face'), t('古典脸', 'classical face'),
          t('精灵脸', 'elfin face'), t('猫系脸', 'cat-like face'), t('狐系脸', 'fox-like face'),
          t('甜妹脸', 'sweet charming face'), t('冷艳脸', 'icy glamorous face'), t('电影脸', 'cinematic face'), t('真实自然脸', 'natural realistic face'),
        ],
      },
      {
        id: 'eyes',
        label: '眼睛',
        labelEn: 'Eyes',
        terms: [
          t('杏眼', 'almond eyes'), t('桃花眼', 'peach blossom eyes'), t('丹凤眼', 'phoenix eyes'), t('圆润大眼', 'large round eyes'),
          t('细长眼', 'slender eyes'), t('下垂眼', 'droopy gentle eyes'), t('猫眼', 'cat eyes'), t('狐狸眼', 'fox eyes'),
          t('泪光眼', 'watery shining eyes'), t('异色瞳', 'heterochromia eyes'), t('金色眼眸', 'golden eyes'), t('冰蓝眼眸', 'icy blue eyes'),
          t('翡翠绿眼眸', 'emerald green eyes'), t('紫罗兰眼眸', 'violet eyes'), t('深棕眼眸', 'deep brown eyes'),
          t('红宝石眼眸', 'ruby red eyes'), t('机械义眼', 'cybernetic eye'), t('星空眼', 'starry eyes'),
          t('锐利眼神', 'sharp gaze'), t('温柔眼神', 'gentle gaze'),
        ],
      },
      {
        id: 'brows',
        label: '眉毛',
        labelEn: 'Eyebrows',
        terms: [
          t('柳叶眉', 'willow eyebrows'), t('英气剑眉', 'sharp heroic eyebrows'), t('自然野生眉', 'natural feathered brows'),
          t('平直眉', 'straight eyebrows'), t('弯月眉', 'crescent eyebrows'), t('细眉', 'thin elegant eyebrows'),
          t('浓眉', 'thick expressive eyebrows'), t('柔和眉峰', 'soft arched brows'), t('高挑眉', 'high arched brows'),
          t('短眉', 'short neat brows'), t('凌厉眉眼', 'fierce brow expression'), t('温顺眉形', 'gentle brow shape'),
          t('复古细弯眉', 'retro thin curved brows'), t('少年感眉形', 'youthful brows'), t('冷淡眉形', 'cool understated brows'),
          t('舞台妆眉', 'stage makeup brows'), t('动漫粗眉', 'anime thick brows'), t('精致修眉', 'well-groomed eyebrows'),
          t('自然浅眉', 'soft light eyebrows'), t('个性断眉', 'stylized slit eyebrow'),
        ],
      },
      {
        id: 'nose',
        label: '鼻子',
        labelEn: 'Nose',
        terms: [
          t('小巧鼻尖', 'small delicate nose tip'), t('高鼻梁', 'high nose bridge'), t('直鼻', 'straight nose'),
          t('微翘鼻', 'slightly upturned nose'), t('圆润鼻头', 'rounded nose tip'), t('精致鼻翼', 'delicate nostrils'),
          t('自然鼻型', 'natural nose shape'), t('希腊鼻', 'Greek nose'), t('柔和鼻梁', 'soft nose bridge'),
          t('挺拔鼻梁', 'prominent nose bridge'), t('可爱短鼻', 'cute short nose'), t('古典鼻型', 'classical nose shape'),
          t('电影感鼻影', 'cinematic nose shading'), t('清冷鼻型', 'cool refined nose'), t('娃娃鼻', 'doll-like nose'),
          t('侧颜立体鼻梁', 'sculpted profile nose bridge'), t('细窄鼻梁', 'narrow nose bridge'), t('自然鼻影', 'subtle natural nose shadow'),
          t('精灵鼻', 'elfin nose'), t('真实鼻部细节', 'realistic nose details'),
        ],
      },
      {
        id: 'mouth',
        label: '嘴唇',
        labelEn: 'Mouth',
        terms: [
          t('樱桃小嘴', 'small cherry lips'), t('饱满嘴唇', 'full lips'), t('薄唇', 'thin elegant lips'), t('微笑唇', 'subtle smiling lips'),
          t('自然唇形', 'natural lip shape'), t('心形唇', 'heart-shaped lips'), t('咬唇表情', 'bitten-lip expression'),
          t('柔润唇光', 'soft glossy lips'), t('雾面唇妆', 'matte lips'), t('红唇', 'red lips'), t('裸色唇', 'nude lips'),
          t('玫瑰色唇', 'rose-tinted lips'), t('微张嘴唇', 'slightly parted lips'), t('坚定唇线', 'firm lip line'),
          t('甜美笑容', 'sweet smile'), t('冷淡嘴角', 'cool neutral mouth'), t('俏皮嘴角', 'playful smirk'),
          t('自然牙齿微露', 'slightly visible teeth'), t('电影特写唇部', 'cinematic close-up lips'), t('真实唇纹细节', 'realistic lip texture'),
        ],
      },
      {
        id: 'ears',
        label: '耳朵',
        labelEn: 'Ears',
        terms: [
          t('小巧耳朵', 'small ears'), t('精灵尖耳', 'pointed elf ears'), t('圆润耳垂', 'rounded earlobes'),
          t('露出耳朵', 'visible ears'), t('单侧露耳', 'one ear visible'), t('耳骨清晰', 'defined ear cartilage'),
          t('佩戴耳钉', 'tiny stud earrings'), t('长坠耳环', 'long dangling earrings'), t('金属耳夹', 'metal ear cuffs'),
          t('珍珠耳环', 'pearl earrings'), t('月牙耳饰', 'crescent moon earrings'), t('机械耳饰', 'cyber ear accessory'),
          t('耳后发丝', 'hair tucked behind ear'), t('动物耳饰', 'animal-ear accessory'), t('狐耳', 'fox ears'),
          t('猫耳', 'cat ears'), t('兔耳头饰', 'rabbit ear headpiece'), t('耳机覆盖', 'wearing headphones'),
          t('羽毛耳饰', 'feather earrings'), t('自然耳部细节', 'realistic ear details'),
        ],
      },
    ],
  },
  {
    id: 'hair',
    label: '头发',
    labelEn: 'Hair',
    description: '发型、刘海、长度、发色和发质。',
    groups: [
      {
        id: 'hairStyle',
        label: '发型',
        labelEn: 'Hair style',
        terms: [
          t('高马尾', 'high ponytail'), t('低马尾', 'low ponytail'), t('双马尾', 'twin tails'), t('丸子头', 'bun hairstyle'),
          t('长直发', 'long straight hair'), t('大波浪卷发', 'large wavy curls'), t('短发', 'short hair'), t('鲍勃头', 'bob cut'),
          t('姬发式', 'hime cut'), t('侧编发', 'side braid'), t('麻花辫', 'braided hair'), t('半扎发', 'half-up hairstyle'),
          t('湿发感', 'wet-look hair'), t('凌乱碎发', 'messy layered hair'), t('蓬松卷发', 'fluffy curls'),
          t('空气感短发', 'airy short hair'), t('公主卷', 'princess curls'), t('狼尾发', 'wolf cut'), t('盘发', 'elegant updo'), t('自然披发', 'loose natural hair'),
        ],
      },
      {
        id: 'bangs',
        label: '刘海',
        labelEn: 'Bangs',
        terms: [
          t('空气刘海', 'airy bangs'), t('齐刘海', 'straight blunt bangs'), t('斜刘海', 'side-swept bangs'),
          t('中分刘海', 'center-parted bangs'), t('八字刘海', 'curtain bangs'), t('眉上刘海', 'micro bangs'),
          t('无刘海', 'no bangs'), t('碎刘海', 'wispy bangs'), t('厚刘海', 'thick bangs'), t('卷曲刘海', 'curled bangs'),
          t('法式刘海', 'French bangs'), t('动漫刘海', 'anime bangs'), t('遮眼刘海', 'one-eye covered bangs'),
          t('挑染刘海', 'highlighted bangs'), t('湿润刘海', 'wet bangs'), t('凌乱刘海', 'messy bangs'),
          t('长刘海', 'long bangs'), t('短刘海', 'short bangs'), t('分层刘海', 'layered bangs'), t('自然发际线', 'natural hairline'),
        ],
      },
      {
        id: 'hairLength',
        label: '长度',
        labelEn: 'Length',
        terms: [
          t('及腰长发', 'waist-length hair'), t('及肩中长发', 'shoulder-length hair'), t('锁骨发', 'collarbone-length hair'),
          t('超长发', 'very long hair'), t('耳下短发', 'ear-length short hair'), t('齐胸长发', 'chest-length hair'),
          t('后颈短发', 'nape-length hair'), t('不对称长度', 'asymmetrical hair length'), t('层次中发', 'medium layered hair'),
          t('过肩长发', 'over-shoulder hair'), t('飘逸长发', 'flowing long hair'), t('短碎发', 'short choppy hair'),
          t('披肩发', 'hair draped over shoulders'), t('超短发', 'pixie short hair'), t('侧长发束', 'long side strands'),
          t('垂地长发', 'floor-length fantasy hair'), t('蓬松中短发', 'fluffy medium-short hair'), t('轻薄发尾', 'light feathered hair ends'),
          t('厚重发量', 'thick voluminous hair'), t('自然发量', 'natural hair volume'),
        ],
      },
      {
        id: 'hairColor',
        label: '发色',
        labelEn: 'Color',
        terms: [
          t('黑发', 'black hair'), t('深棕发', 'dark brown hair'), t('银白发', 'silver white hair'), t('金发', 'blonde hair'),
          t('粉发', 'pink hair'), t('红发', 'red hair'), t('蓝发', 'blue hair'), t('紫发', 'purple hair'),
          t('青绿色发', 'teal hair'), t('灰发', 'ash gray hair'), t('奶茶棕发', 'milk tea brown hair'),
          t('玫瑰金发', 'rose gold hair'), t('渐变发色', 'gradient hair color'), t('挑染发色', 'colored highlights'),
          t('双色发', 'two-tone hair'), t('白金发', 'platinum blonde hair'), t('栗色发', 'chestnut hair'),
          t('樱花粉发', 'sakura pink hair'), t('夜空蓝发', 'midnight blue hair'), t('火焰橙发', 'flame orange hair'),
        ],
      },
      {
        id: 'hairTexture',
        label: '发质',
        labelEn: 'Texture',
        terms: [
          t('柔顺发丝', 'smooth silky hair'), t('蓬松发丝', 'fluffy hair texture'), t('光泽发丝', 'glossy hair'),
          t('细软发丝', 'fine soft hair'), t('厚重发丝', 'thick hair strands'), t('风吹发丝', 'wind-swept hair'),
          t('湿润发丝', 'damp hair strands'), t('凌乱自然', 'naturally messy hair'), t('柔焦发丝', 'soft-focus hair strands'),
          t('高细节发丝', 'high-detail individual hair strands'), t('卷曲发丝', 'curly hair texture'), t('轻盈发尾', 'light airy hair ends'),
          t('毛绒感发丝', 'soft plush hair texture'), t('丝缎发质', 'satin hair texture'), t('油画发丝', 'painterly hair strands'),
          t('动漫高光发丝', 'anime hair highlights'), t('真实发丝阴影', 'realistic hair shadows'), t('顺滑直发质感', 'sleek straight hair texture'),
          t('空气感发丝', 'airy hair strands'), t('微乱碎发', 'slightly messy flyaway hairs'),
        ],
      },
    ],
  },
  {
    id: 'makeup',
    label: '妆容',
    labelEn: 'Makeup',
    description: '睫毛、眼妆、唇妆、腮红和整体妆面。',
    groups: [
      {
        id: 'eyelashes',
        label: '睫毛',
        labelEn: 'Eyelashes',
        terms: [
          t('自然睫毛', 'natural eyelashes'), t('纤长睫毛', 'long eyelashes'), t('浓密睫毛', 'thick eyelashes'),
          t('卷翘睫毛', 'curled eyelashes'), t('下睫毛明显', 'defined lower lashes'), t('娃娃睫毛', 'doll-like lashes'),
          t('舞台睫毛', 'dramatic stage lashes'), t('束状睫毛', 'clustered eyelashes'), t('猫眼睫毛', 'cat-eye lashes'),
          t('湿润睫毛', 'wet glossy lashes'), t('轻薄睫毛', 'light delicate lashes'), t('纤维感睫毛', 'fiber-like eyelashes'),
          t('漫画睫毛', 'manga-style eyelashes'), t('浓黑睫毛', 'dark black eyelashes'), t('棕色睫毛', 'brown eyelashes'),
          t('银色睫毛', 'silver eyelashes'), t('闪粉睫毛', 'glitter lashes'), t('自然根根分明', 'naturally separated lashes'),
          t('眼尾加长睫毛', 'extended outer-corner lashes'), t('真实睫毛细节', 'realistic eyelash details'),
        ],
      },
      {
        id: 'eyeMakeup',
        label: '眼妆',
        labelEn: 'Eye makeup',
        terms: [
          t('清透眼妆', 'transparent eye makeup'), t('烟熏眼妆', 'smoky eye makeup'), t('粉色眼影', 'pink eyeshadow'),
          t('金棕眼影', 'gold brown eyeshadow'), t('冷灰眼影', 'cool gray eyeshadow'), t('红色眼线', 'red eyeliner'),
          t('黑色眼线', 'black eyeliner'), t('猫眼眼线', 'cat eyeliner'), t('珠光眼影', 'pearl shimmer eyeshadow'),
          t('亮片眼妆', 'glitter eye makeup'), t('泪痣点缀', 'tear mole accent'), t('卧蚕明显', 'defined aegyo-sal'),
          t('舞台眼妆', 'stage eye makeup'), t('哥特眼妆', 'gothic eye makeup'), t('赛博眼妆', 'cyber eye makeup'),
          t('复古眼妆', 'retro eye makeup'), t('自然裸妆眼影', 'natural nude eyeshadow'), t('梦幻紫眼影', 'dreamy purple eyeshadow'),
          t('清冷蓝眼影', 'cool blue eyeshadow'), t('电影感眼部阴影', 'cinematic eye shadow'),
        ],
      },
      {
        id: 'blush',
        label: '腮红',
        labelEn: 'Blush',
        terms: [
          t('淡粉腮红', 'soft pink blush'), t('桃色腮红', 'peach blush'), t('日晒腮红', 'sun-kissed blush'),
          t('鼻尖腮红', 'blush on nose tip'), t('眼下腮红', 'under-eye blush'), t('酒醉腮红', 'tipsy blush'),
          t('冷粉腮红', 'cool pink blush'), t('橘调腮红', 'orange-toned blush'), t('玫瑰腮红', 'rose blush'),
          t('无腮红', 'no visible blush'), t('水彩腮红', 'watercolor blush'), t('舞台腮红', 'stage blush'),
          t('动漫腮红', 'anime blush marks'), t('自然红润', 'natural rosy cheeks'), t('高原红', 'highland red cheeks'),
          t('雀斑腮红', 'freckled blush'), t('奶油腮红', 'creamy blush'), t('雾面腮红', 'matte blush'),
          t('脸颊高光', 'cheek highlight'), t('微醺脸颊', 'slightly flushed cheeks'),
        ],
      },
      {
        id: 'lipMakeup',
        label: '唇妆',
        labelEn: 'Lip makeup',
        terms: [
          t('裸色唇妆', 'nude lip makeup'), t('红唇妆', 'red lipstick'), t('玫瑰豆沙唇', 'rose mauve lips'),
          t('玻璃唇', 'glass glossy lips'), t('雾面唇', 'matte lipstick'), t('咬唇妆', 'gradient bitten lips'),
          t('樱桃唇', 'cherry lips'), t('浆果色唇', 'berry lips'), t('橘色唇', 'orange lipstick'),
          t('冷粉唇', 'cool pink lips'), t('金属唇妆', 'metallic lip makeup'), t('暗黑唇色', 'dark gothic lipstick'),
          t('奶茶唇', 'milk tea lips'), t('水润唇', 'moist dewy lips'), t('薄涂唇妆', 'lightly applied lipstick'),
          t('厚涂唇妆', 'bold lipstick'), t('自然唇色', 'natural lip color'), t('珠光唇', 'pearl shimmer lips'),
          t('舞台红唇', 'stage red lips'), t('真实唇妆纹理', 'realistic lip makeup texture'),
        ],
      },
      {
        id: 'makeupStyle',
        label: '整体妆面',
        labelEn: 'Makeup style',
        terms: [
          t('裸妆', 'natural no-makeup makeup'), t('甜美妆', 'sweet makeup look'), t('清冷妆', 'cool elegant makeup'),
          t('哥特妆', 'gothic makeup'), t('复古妆', 'retro makeup'), t('舞台妆', 'stage makeup'),
          t('日系妆', 'Japanese-style makeup'), t('韩系妆', 'Korean-style makeup'), t('欧美妆', 'western glam makeup'),
          t('赛博妆', 'cyberpunk makeup'), t('精灵妆', 'elf fantasy makeup'), t('泪痕妆', 'tear-streak makeup'),
          t('战损妆', 'battle-damaged makeup'), t('梦幻妆', 'dreamy makeup'), t('电影妆', 'cinematic makeup'),
          t('摄影棚妆', 'studio portrait makeup'), t('高定妆容', 'haute couture makeup'), t('素颜感', 'bare-face natural look'),
          t('珠光妆面', 'pearl glow makeup'), t('雾面高级妆', 'matte editorial makeup'),
        ],
      },
    ],
  },
  {
    id: 'marks',
    label: '身体标记',
    labelEn: 'Body Marks',
    description: '纹身、伤痕、雀斑、皮肤细节和特殊标记。',
    groups: [
      {
        id: 'tattoo',
        label: '纹身',
        labelEn: 'Tattoo',
        terms: [
          t('无纹身', 'no tattoo'), t('花朵纹身', 'floral tattoo'), t('龙纹身', 'dragon tattoo'), t('蝴蝶纹身', 'butterfly tattoo'),
          t('蛇纹身', 'snake tattoo'), t('星月纹身', 'moon and stars tattoo'), t('符文纹身', 'rune tattoo'),
          t('几何纹身', 'geometric tattoo'), t('水墨纹身', 'ink wash tattoo'), t('机械纹身', 'mechanical tattoo'),
          t('肩部纹身', 'shoulder tattoo'), t('手臂纹身', 'arm tattoo'), t('锁骨纹身', 'collarbone tattoo'),
          t('背部纹身', 'back tattoo'), t('腰部纹身', 'waist tattoo'), t('腿部纹身', 'leg tattoo'),
          t('细线纹身', 'fine-line tattoo'), t('彩色纹身', 'color tattoo'), t('荧光纹身', 'glowing tattoo'),
          t('古风纹身', 'traditional oriental tattoo'),
        ],
      },
      {
        id: 'scars',
        label: '伤痕',
        labelEn: 'Scars',
        terms: [
          t('无伤痕', 'no scars'), t('脸颊细小伤痕', 'small cheek scar'), t('眉骨伤痕', 'eyebrow scar'),
          t('唇角伤痕', 'scar near lip corner'), t('肩部伤痕', 'shoulder scar'), t('手臂伤痕', 'arm scar'),
          t('战损擦伤', 'battle scratches'), t('新鲜擦伤', 'fresh abrasions'), t('旧伤痕', 'old healed scars'),
          t('魔法裂纹', 'magical crack marks'), t('机械接口痕迹', 'cybernetic interface marks'), t('烧伤痕迹', 'subtle burn marks'),
          t('绷带覆盖', 'bandage-covered marks'), t('刀疤', 'blade scar'), t('爪痕', 'claw marks'),
          t('泪痕', 'tear streak marks'), t('血迹点缀', 'subtle blood marks'), t('训练痕迹', 'training bruises'),
          t('玻璃划伤', 'glass cut marks'), t('电影战损细节', 'cinematic battle damage details'),
        ],
      },
      {
        id: 'skinDetails',
        label: '皮肤细节',
        labelEn: 'Skin detail',
        terms: [
          t('雀斑', 'freckles'), t('泪痣', 'tear mole'), t('美人痣', 'beauty mark'), t('肩颈痣', 'small mole on neck or shoulder'),
          t('自然毛孔', 'natural pores'), t('细腻皮肤纹理', 'fine skin texture'), t('微红指节', 'slightly red knuckles'),
          t('手部细节', 'detailed hands'), t('锁骨高光', 'collarbone highlights'), t('颈部阴影', 'soft neck shadows'),
          t('膝盖泛红', 'soft red knees'), t('手臂细节', 'detailed arms'), t('真实肤色变化', 'realistic skin color variation'),
          t('皮肤水光', 'dewy skin glow'), t('皮肤雾面质感', 'matte skin texture'), t('轻微黑眼圈', 'subtle under-eye circles'),
          t('指甲细节', 'detailed fingernails'), t('肩部高光', 'shoulder highlights'), t('背部线条', 'back contour details'),
          t('自然身体细节', 'natural body details'),
        ],
      },
      {
        id: 'fantasyMarks',
        label: '特殊标记',
        labelEn: 'Fantasy mark',
        terms: [
          t('魔法印记', 'magical sigil mark'), t('额头印记', 'forehead mark'), t('眼下符号', 'symbol under eye'),
          t('发光纹路', 'glowing body lines'), t('神圣光纹', 'sacred light markings'), t('恶魔印记', 'demonic mark'),
          t('精灵花纹', 'elf-like markings'), t('机械刻印', 'mechanical engraving marks'), t('星座纹路', 'constellation markings'),
          t('龙鳞纹路', 'dragon scale markings'), t('透明鳞片', 'subtle translucent scales'), t('翅膀烙印', 'wing-shaped brand mark'),
          t('水元素纹路', 'water element markings'), t('火元素纹路', 'fire element markings'), t('雷电纹路', 'lightning markings'),
          t('咒术纹路', 'curse markings'), t('治愈符文', 'healing rune marks'), t('赛博霓虹线', 'cyber neon body lines'),
          t('天使光环印记', 'angelic halo mark'), t('异界裂纹', 'otherworldly crack markings'),
        ],
      },
      {
        id: 'hands',
        label: '手部',
        labelEn: 'Hands',
        terms: [
          t('修长手指', 'long slender fingers'), t('精致手部', 'delicate hands'), t('战斗手部伤痕', 'battle-worn hands'),
          t('涂黑指甲', 'black painted nails'), t('裸色指甲', 'nude nails'), t('红色指甲', 'red nails'),
          t('短指甲', 'short nails'), t('长甲', 'long manicured nails'), t('银色甲片', 'silver nail tips'),
          t('戴戒指的手', 'hands with rings'), t('握剑手势', 'hand gripping a sword'), t('托腮手势', 'hand supporting chin'),
          t('比心手势', 'finger heart gesture'), t('伸手邀请', 'reaching hand gesture'), t('抚发手势', 'hand touching hair'),
          t('手套边缘细节', 'glove edge hand detail'), t('手部光影', 'detailed hand lighting'), t('手腕线条', 'wrist contour details'),
          t('自然手势', 'natural hand gesture'), t('电影特写手部', 'cinematic close-up hands'),
        ],
      },
    ],
  },
  {
    id: 'clothing',
    label: '服装',
    labelEn: 'Clothing',
    description: '上衣、下装、套装、手套、袜子、内衣等穿搭。',
    groups: [
      {
        id: 'top',
        label: '上衣',
        labelEn: 'Top',
        terms: [
          t('白衬衫', 'white shirt'), t('黑色高领', 'black turtleneck'), t('水手服上衣', 'sailor uniform top'), t('针织开衫', 'knit cardigan'),
          t('皮夹克', 'leather jacket'), t('短款外套', 'cropped jacket'), t('蕾丝上衣', 'lace blouse'), t('露肩上衣', 'off-shoulder top'),
          t('吊带上衣', 'camisole top'), t('运动背心', 'sports tank top'), t('战术背心', 'tactical vest'), t('和服上衣', 'kimono top'),
          t('西装外套', 'tailored blazer'), t('斗篷', 'cape'), t('机能风外套', 'techwear jacket'), t('毛衣', 'sweater'),
          t('短袖T恤', 'short-sleeve T-shirt'), t('旗袍上衣', 'qipao-style top'), t('洛丽塔上衣', 'lolita blouse'), t('盔甲胸甲', 'armored breastplate'),
        ],
      },
      {
        id: 'bottom',
        label: '下装',
        labelEn: 'Bottom',
        terms: [
          t('百褶裙', 'pleated skirt'), t('短裙', 'mini skirt'), t('长裙', 'long skirt'), t('高腰裤', 'high-waisted pants'),
          t('牛仔裤', 'jeans'), t('皮裤', 'leather pants'), t('短裤', 'shorts'), t('战术裤', 'tactical pants'),
          t('和服裙摆', 'kimono skirt'), t('鱼尾裙', 'mermaid skirt'), t('蛋糕裙', 'tiered skirt'), t('铅笔裙', 'pencil skirt'),
          t('运动短裤', 'sport shorts'), t('骑士裙甲', 'armored skirt'), t('宽腿裤', 'wide-leg pants'), t('工装裤', 'cargo pants'),
          t('校服裙', 'school uniform skirt'), t('连体裤', 'jumpsuit bottom'), t('纱裙', 'tulle skirt'), t('旗袍开衩裙摆', 'qipao slit skirt'),
        ],
      },
      {
        id: 'outfit',
        label: '套装',
        labelEn: 'Outfit',
        terms: [
          t('校服套装', 'school uniform outfit'), t('女仆套装', 'maid outfit'), t('骑士盔甲', 'knight armor outfit'),
          t('魔法少女套装', 'magical girl outfit'), t('哥特洛丽塔', 'gothic lolita outfit'), t('赛博朋克套装', 'cyberpunk outfit'),
          t('忍者套装', 'ninja outfit'), t('偶像舞台服', 'idol stage costume'), t('商务西装', 'business suit'),
          t('和服', 'kimono outfit'), t('旗袍', 'qipao dress'), t('晚礼服', 'evening gown'), t('婚纱', 'wedding dress'),
          t('运动套装', 'sports outfit'), t('军装', 'military uniform'), t('护士服', 'nurse uniform'),
          t('宇航服', 'astronaut suit'), t('机甲驾驶服', 'mecha pilot suit'), t('宫廷礼服', 'royal court dress'), t('旅行者斗篷套装', 'traveler cloak outfit'),
        ],
      },
      {
        id: 'glovesSocks',
        label: '手套袜子',
        labelEn: 'Gloves and socks',
        terms: [
          t('白手套', 'white gloves'), t('黑皮手套', 'black leather gloves'), t('蕾丝手套', 'lace gloves'), t('半指手套', 'fingerless gloves'),
          t('战术手套', 'tactical gloves'), t('长手套', 'opera gloves'), t('机械手套', 'mechanical gloves'), t('透明薄手套', 'sheer gloves'),
          t('白色短袜', 'white ankle socks'), t('黑色短袜', 'black ankle socks'), t('过膝袜', 'thigh-high socks'), t('长筒袜', 'knee-high socks'),
          t('吊带袜', 'garter stockings'), t('渔网袜', 'fishnet stockings'), t('蕾丝袜', 'lace stockings'), t('运动袜', 'sport socks'),
          t('不穿袜', 'bare legs without socks'), t('条纹袜', 'striped socks'), t('丝绒手套', 'velvet gloves'), t('护腕', 'wrist guards'),
        ],
      },
      {
        id: 'innerwear',
        label: '内搭',
        labelEn: 'Innerwear',
        terms: [
          t('基础内搭', 'simple inner layer'), t('蕾丝胸衣', 'lace corset top'), t('运动内衣', 'sports bra as inner layer'),
          t('黑色胸衣', 'black corset bodice'), t('白色吊带内搭', 'white camisole inner layer'), t('高领内搭', 'turtleneck inner layer'),
          t('紧身衣', 'bodysuit'), t('泳装内搭', 'swimsuit-style inner layer'), t('抹胸内搭', 'tube top inner layer'),
          t('绑带胸衣', 'strappy corset bodice'), t('薄纱内搭', 'sheer mesh inner layer'), t('皮革胸衣', 'leather corset bodice'),
          t('绷带式内搭', 'bandage-style inner layer'), t('机能内搭', 'techwear inner layer'), t('舞台内搭', 'stage costume inner layer'),
          t('复古胸衣', 'vintage corset'), t('柔软棉质内搭', 'soft cotton inner layer'), t('丝绸内搭', 'silk inner layer'),
          t('无明显内搭', 'no visible inner layer'), t('完整服装遮挡', 'fully covered outfit layers'),
        ],
      },
    ],
  },
  {
    id: 'accessory',
    label: '配饰',
    labelEn: 'Accessories',
    description: '发饰、眼镜、包包、项链、手饰、皮带和其他点缀。',
    groups: [
      {
        id: 'hairAccessory',
        label: '发饰',
        labelEn: 'Hair accessory',
        terms: [
          t('蝴蝶结发饰', 'bow hair accessory'), t('发箍', 'headband'), t('发夹', 'hair clip'), t('珍珠发卡', 'pearl hairpin'),
          t('花朵发饰', 'floral hair accessory'), t('金属发饰', 'metal hair ornament'), t('羽毛发饰', 'feather hair accessory'),
          t('皇冠', 'crown'), t('小礼帽', 'mini top hat'), t('发簪', 'hair stick'), t('铃铛发饰', 'bell hair accessory'),
          t('机械发卡', 'mechanical hair clip'), t('水晶发饰', 'crystal hair accessory'), t('丝带', 'hair ribbon'),
          t('猫耳发箍', 'cat-ear headband'), t('兔耳发箍', 'rabbit-ear headband'), t('面纱', 'veil hair accessory'),
          t('忍者护额', 'ninja forehead protector'), t('海盗头巾', 'pirate bandana'), t('无发饰', 'no hair accessory'),
        ],
      },
      {
        id: 'faceAccessory',
        label: '眼镜/面饰',
        labelEn: 'Face accessory',
        terms: [
          t('无眼镜', 'no glasses'), t('圆框眼镜', 'round glasses'), t('细框眼镜', 'thin frame glasses'),
          t('黑框眼镜', 'black frame glasses'), t('金丝眼镜', 'gold rim glasses'), t('透明框眼镜', 'clear frame glasses'),
          t('半框眼镜', 'semi-rimless glasses'), t('复古眼镜', 'vintage glasses'), t('墨镜', 'sunglasses'),
          t('红色护目镜', 'red goggles'), t('赛博护目镜', 'cyber goggles'), t('单片眼镜', 'monocle'),
          t('眼罩', 'eyepatch'), t('蕾丝面纱', 'lace face veil'), t('口罩', 'face mask'),
          t('战术面罩', 'tactical face mask'), t('机械面罩', 'mechanical face mask'), t('猫眼眼镜', 'cat-eye glasses'),
          t('飞行员墨镜', 'aviator sunglasses'), t('星形眼镜', 'star-shaped glasses'),
        ],
      },
      {
        id: 'bag',
        label: '包包',
        labelEn: 'Bag',
        terms: [
          t('小挎包', 'small shoulder bag'), t('手提包', 'handbag'), t('背包', 'backpack'), t('皮革公文包', 'leather briefcase'),
          t('魔法书包', 'magic book bag'), t('腰包', 'waist bag'), t('链条包', 'chain bag'), t('帆布包', 'canvas tote bag'),
          t('旅行包', 'travel bag'), t('医药箱', 'medical bag'), t('相机包', 'camera bag'), t('工具包', 'tool pouch'),
          t('复古手包', 'vintage clutch'), t('透明包', 'transparent bag'), t('毛绒包', 'plush bag'), t('战术挂包', 'tactical pouch'),
          t('箭袋', 'quiver bag'), t('乐器包', 'instrument case'), t('无包', 'no bag'), t('精致包饰细节', 'detailed bag accessories'),
        ],
      },
      {
        id: 'necklace',
        label: '项链',
        labelEn: 'Necklace',
        terms: [
          t('珍珠项链', 'pearl necklace'), t('黑色颈圈', 'black choker'), t('金色项链', 'gold necklace'), t('银色项链', 'silver necklace'),
          t('十字项链', 'cross necklace'), t('宝石吊坠', 'gem pendant'), t('月亮吊坠', 'moon pendant'), t('锁骨链', 'collarbone chain'),
          t('丝带颈饰', 'ribbon neck accessory'), t('铃铛项圈', 'bell collar'), t('机械项圈', 'mechanical collar'), t('魔法护符', 'magic amulet'),
          t('多层项链', 'layered necklaces'), t('花朵项链', 'floral necklace'), t('皮革颈带', 'leather neck strap'),
          t('水晶项链', 'crystal necklace'), t('古董项链', 'antique necklace'), t('无项链', 'no necklace'), t('简约项链', 'minimal necklace'),
          t('王冠坠饰', 'royal crest pendant'),
        ],
      },
      {
        id: 'handAccessory',
        label: '手饰',
        labelEn: 'Hand accessory',
        terms: [
          t('戒指', 'rings'), t('多枚戒指', 'multiple rings'), t('手链', 'bracelet'), t('珍珠手链', 'pearl bracelet'),
          t('金属手镯', 'metal bangle'), t('红绳手链', 'red string bracelet'), t('机械腕表', 'mechanical watch'), t('皮革护腕', 'leather wrist cuff'),
          t('蕾丝腕饰', 'lace wrist accessory'), t('水晶手链', 'crystal bracelet'), t('符文戒指', 'rune ring'), t('宝石戒指', 'gemstone ring'),
          t('手背链', 'hand chain'), t('长袖遮挡手饰', 'hand accessories hidden by long sleeves'), t('无手饰', 'no hand accessories'),
          t('战术腕带', 'tactical wrist band'), t('魔法手环', 'magical bracelet'), t('银色指环', 'silver finger rings'),
          t('黑色指环', 'black finger rings'), t('精致手饰细节', 'detailed hand jewelry'),
        ],
      },
      {
        id: 'belt',
        label: '皮带',
        labelEn: 'Belt',
        terms: [
          t('黑色皮带', 'black leather belt'), t('金属扣皮带', 'belt with metal buckle'), t('宽腰封', 'wide waist cincher'),
          t('细腰带', 'thin waist belt'), t('链条腰带', 'chain belt'), t('战术腰带', 'tactical belt'), t('复古腰带', 'vintage belt'),
          t('蝴蝶结腰带', 'bow waist belt'), t('宝石腰链', 'gem waist chain'), t('布艺腰封', 'fabric sash belt'),
          t('和服腰带', 'obi belt'), t('骑士腰带', 'knight belt'), t('工具腰带', 'tool belt'), t('双层腰带', 'double belt'),
          t('红色腰带', 'red belt'), t('白色腰带', 'white belt'), t('机械腰带', 'mechanical belt'), t('无腰带', 'no belt'),
          t('腰间挂饰', 'waist hanging accessories'), t('腰部细节丰富', 'detailed waist accessories'),
        ],
      },
    ],
  },
  {
    id: 'mood',
    label: '气质神情',
    labelEn: 'Mood',
    description: '气质、表情、视线、姿态和人物氛围。',
    groups: [
      {
        id: 'temperament',
        label: '气质',
        labelEn: 'Temperament',
        terms: [
          t('温柔', 'gentle temperament'), t('清冷', 'cool aloof temperament'), t('高贵', 'noble temperament'), t('甜美', 'sweet temperament'),
          t('英气', 'heroic temperament'), t('病娇感', 'yandere aura'), t('神秘', 'mysterious aura'), t('元气', 'energetic personality'),
          t('慵懒', 'lazy relaxed aura'), t('禁欲感', 'restrained elegant aura'), t('危险感', 'dangerous aura'), t('治愈系', 'healing presence'),
          t('孤独感', 'lonely aura'), t('成熟稳重', 'mature calm temperament'), t('少年感', 'youthful freshness'),
          t('贵族疏离', 'aristocratic distance'), t('灵动', 'lively and nimble aura'), t('压迫感', 'intimidating presence'),
          t('梦幻感', 'dreamlike aura'), t('电影主角感', 'cinematic protagonist aura'),
        ],
      },
      {
        id: 'expression',
        label: '神情',
        labelEn: 'Expression',
        terms: [
          t('微笑', 'soft smile'), t('浅笑', 'faint smile'), t('冷淡表情', 'cool neutral expression'), t('认真表情', 'serious expression'),
          t('惊讶', 'surprised expression'), t('害羞', 'shy expression'), t('忧郁', 'melancholic expression'), t('坚定', 'determined expression'),
          t('俏皮眨眼', 'playful wink'), t('含泪', 'tearful eyes'), t('愤怒克制', 'restrained anger'), t('温柔凝视', 'gentle gaze'),
          t('疲惫', 'tired expression'), t('挑衅微笑', 'provocative smirk'), t('空灵表情', 'ethereal expression'),
          t('自信微笑', 'confident smile'), t('无表情', 'expressionless face'), t('专注', 'focused expression'),
          t('回头一笑', 'smiling while looking back'), t('电影情绪特写', 'cinematic emotional close-up expression'),
        ],
      },
      {
        id: 'gaze',
        label: '视线',
        labelEn: 'Gaze',
        terms: [
          t('直视镜头', 'looking directly at camera'), t('侧目看向远方', 'side glance into the distance'), t('低头垂眸', 'looking down with lowered eyes'),
          t('回头凝视', 'looking back over shoulder'), t('仰望', 'looking upward'), t('闭眼', 'closed eyes'),
          t('半闭眼', 'half-closed eyes'), t('斜视镜头', 'glancing sideways at camera'), t('注视手中物', 'looking at object in hand'),
          t('看向光源', 'looking toward the light'), t('逃避视线', 'averted gaze'), t('凝视观众', 'intense gaze at viewer'),
          t('眼神游离', 'distant unfocused gaze'), t('宠溺视线', 'affectionate gaze'), t('战斗视线', 'combat-ready gaze'),
          t('镜中视线', 'gaze reflected in mirror'), t('低角度俯视观众', 'looking down at viewer'), t('仰视观众', 'looking up at viewer'),
          t('看向画外', 'looking off-frame'), t('电影眼神光', 'cinematic catchlight in eyes'),
        ],
      },
      {
        id: 'pose',
        label: '姿态',
        labelEn: 'Pose',
        terms: [
          t('站姿', 'standing pose'), t('坐姿', 'sitting pose'), t('半身肖像', 'half-body portrait'), t('全身肖像', 'full-body portrait'),
          t('手扶脸颊', 'hand resting on cheek'), t('整理头发', 'adjusting hair'), t('双手背后', 'hands behind back'),
          t('抱臂', 'arms crossed'), t('伸手向前', 'reaching forward'), t('拿着道具', 'holding a prop'),
          t('战斗姿态', 'battle stance'), t('舞台动作', 'stage pose'), t('优雅回身', 'elegant turning pose'),
          t('坐在窗边', 'sitting by window'), t('跪坐', 'kneeling pose'), t('奔跑姿态', 'running pose'),
          t('漂浮姿态', 'floating pose'), t('依靠墙面', 'leaning against wall'), t('背影回头', 'back view looking over shoulder'),
          t('电影定格动作', 'cinematic frozen-action pose'),
        ],
      },
      {
        id: 'aura',
        label: '氛围',
        labelEn: 'Aura',
        terms: [
          t('柔光氛围', 'soft light atmosphere'), t('黑暗压抑', 'dark oppressive atmosphere'), t('神圣感', 'sacred atmosphere'),
          t('梦幻粉雾', 'dreamy pink mist'), t('赛博霓虹', 'cyber neon atmosphere'), t('雨夜氛围', 'rainy night atmosphere'),
          t('花海氛围', 'flower field atmosphere'), t('废墟感', 'ruined world atmosphere'), t('宫廷感', 'royal court atmosphere'),
          t('学院感', 'academy atmosphere'), t('舞台聚光', 'stage spotlight atmosphere'), t('战争硝烟', 'war smoke atmosphere'),
          t('海风感', 'sea breeze atmosphere'), t('雪景寂静', 'silent snowy atmosphere'), t('黄昏暖光', 'golden hour warm light'),
          t('月光冷调', 'cool moonlight atmosphere'), t('魔法粒子', 'magical particles'), t('胶片质感氛围', 'filmic atmosphere'),
          t('高定时装片氛围', 'haute couture editorial atmosphere'), t('孤独城市夜景', 'lonely city night atmosphere'),
        ],
      },
    ],
  },
  {
    id: 'visual',
    label: '画面控制',
    labelEn: 'Visual Control',
    description: '构图、镜头、背景、光影和画风。',
    groups: [
      {
        id: 'composition',
        label: '构图',
        labelEn: 'Composition',
        terms: [
          t('半身构图', 'half-body composition'), t('全身构图', 'full-body composition'), t('头像特写', 'headshot close-up'),
          t('胸像构图', 'bust portrait composition'), t('三分法构图', 'rule of thirds composition'), t('中心构图', 'centered composition'),
          t('对称构图', 'symmetrical composition'), t('低角度构图', 'low-angle composition'), t('高角度构图', 'high-angle composition'),
          t('电影宽画幅', 'cinematic widescreen composition'), t('纵向海报构图', 'vertical poster composition'), t('近景构图', 'close shot composition'),
          t('中景构图', 'medium shot composition'), t('远景构图', 'wide shot composition'), t('斜线构图', 'diagonal composition'),
          t('前景遮挡', 'foreground framing'), t('景深构图', 'depth-of-field composition'), t('留白构图', 'negative space composition'),
          t('动态构图', 'dynamic composition'), t('角色设定图构图', 'character sheet composition'),
        ],
      },
      {
        id: 'camera',
        label: '镜头',
        labelEn: 'Camera',
        terms: [
          t('85mm 人像镜头', '85mm portrait lens'), t('50mm 标准镜头', '50mm standard lens'), t('35mm 电影镜头', '35mm cinematic lens'),
          t('长焦压缩', 'telephoto compression'), t('广角近距离', 'wide-angle close perspective'), t('微距细节', 'macro detail shot'),
          t('浅景深', 'shallow depth of field'), t('深景深', 'deep focus'), t('柔焦镜头', 'soft focus lens'),
          t('胶片镜头', 'film camera lens'), t('动漫截图镜头', 'anime screenshot camera'), t('时尚摄影镜头', 'fashion photography lens'),
          t('手持镜头', 'handheld camera feel'), t('稳定棚拍镜头', 'stable studio camera'), t('低机位', 'low camera angle'),
          t('高机位', 'high camera angle'), t('侧脸镜头', 'profile shot'), t('回眸镜头', 'over-shoulder glance shot'),
          t('英雄仰拍', 'heroic upward shot'), t('电影主角镜头', 'cinematic protagonist shot'),
        ],
      },
      {
        id: 'background',
        label: '背景',
        labelEn: 'Background',
        terms: [
          t('纯色背景', 'plain solid background'), t('透明感白底', 'clean white background'), t('摄影棚背景', 'studio backdrop'),
          t('城市夜景', 'city night background'), t('森林背景', 'forest background'), t('海边背景', 'seaside background'),
          t('校园背景', 'school campus background'), t('图书馆背景', 'library background'), t('宫殿背景', 'palace background'),
          t('废墟背景', 'ruins background'), t('赛博街道', 'cyberpunk street background'), t('花园背景', 'garden background'),
          t('雪地背景', 'snowfield background'), t('卧室背景', 'bedroom background'), t('教堂背景', 'cathedral background'),
          t('宇宙背景', 'outer space background'), t('魔法阵背景', 'magic circle background'), t('雨中街景', 'rainy street background'),
          t('古风庭院', 'traditional courtyard background'), t('角色设定白底', 'character design sheet background'),
        ],
      },
      {
        id: 'lighting',
        label: '光影',
        labelEn: 'Lighting',
        terms: [
          t('柔和窗光', 'soft window light'), t('逆光', 'backlighting'), t('轮廓光', 'rim lighting'), t('电影暖光', 'cinematic warm light'),
          t('冷色月光', 'cool moonlight'), t('霓虹光', 'neon lighting'), t('顶光', 'top lighting'), t('侧光', 'side lighting'),
          t('伦勃朗光', 'Rembrandt lighting'), t('蝴蝶光', 'butterfly lighting'), t('散射光', 'diffused light'),
          t('强对比光影', 'high contrast lighting'), t('低调光', 'low-key lighting'), t('高调光', 'high-key lighting'),
          t('舞台追光', 'stage spotlight'), t('日落金光', 'golden sunset light'), t('晨雾光', 'misty morning light'),
          t('魔法发光', 'magical glow lighting'), t('胶片颗粒光影', 'filmic grain lighting'), t('真实环境光', 'realistic ambient light'),
        ],
      },
      {
        id: 'style',
        label: '画风',
        labelEn: 'Style',
        terms: [
          t('写实人像', 'realistic portrait'), t('动漫插画', 'anime illustration'), t('厚涂插画', 'painterly illustration'),
          t('水彩风', 'watercolor style'), t('油画风', 'oil painting style'), t('赛博朋克风', 'cyberpunk style'),
          t('哥特风', 'gothic style'), t('日系轻小说风', 'Japanese light novel style'), t('复古胶片风', 'retro film style'),
          t('高定时装大片', 'haute couture fashion editorial'), t('电影剧照风', 'cinematic still style'), t('像素风', 'pixel art style'),
          t('低饱和高级感', 'muted elegant color palette'), t('梦幻柔焦', 'dreamy soft-focus style'), t('黑白电影风', 'black and white film style'),
          t('国风插画', 'Chinese fantasy illustration style'), t('美式漫画风', 'American comic style'), t('3D 渲染风', '3D render style'),
          t('角色设定图', 'character concept art sheet'), t('超精细商业插画', 'ultra-detailed commercial illustration'),
        ],
      },
    ],
  },
];

const DEFAULT_PREVIEW: PortraitPreviewState = {
  skin: '#f2c9a8',
  hair: '#2c1f1a',
  eye: '#3f2d20',
  blush: '#ef9aa4',
  outfit: '#39465f',
  accent: '#f5c44b',
  background: '#6ad8df',
  headScaleX: 1,
  headScaleY: 1,
  bodyScale: 1,
  hairShape: 'natural',
  bangs: 'soft',
  eyeShape: 'almond',
  mouth: 'neutral',
  brow: 'soft',
  accessory: 'none',
  animalEars: false,
  glasses: false,
  mark: 'none',
  mood: 'neutral',
};

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function deriveSkin(text: string): PortraitPreviewPatch {
  if (hasAny(text, ['瓷白', 'porcelain', '冷白', 'moonlit', 'pale'])) return { skin: '#f8dcc8', blush: '#eaa2b3' };
  if (hasAny(text, ['白皙', 'fair', 'ivory'])) return { skin: '#f0c9aa', blush: '#e8989c' };
  if (hasAny(text, ['小麦', 'wheat', 'sun-kissed', 'honey'])) return { skin: '#c98c58', blush: '#d97973' };
  if (hasAny(text, ['古铜', 'bronze'])) return { skin: '#9b5c37', blush: '#bb655f' };
  if (hasAny(text, ['玫瑰', 'rosy', '粉肤', 'pink'])) return { skin: '#efb8a8', blush: '#ff8799' };
  if (hasAny(text, ['赛博', 'cyber'])) return { skin: '#d9eef0', blush: '#69f7de', mood: 'cyber', background: '#17243a' };
  return {};
}

function deriveHairColor(text: string): PortraitPreviewPatch {
  if (hasAny(text, ['银白', 'silver', 'platinum', 'white'])) return { hair: '#dfe6ef' };
  if (hasAny(text, ['金发', 'blonde'])) return { hair: '#eec65a' };
  if (hasAny(text, ['粉发', 'pink', '樱花'])) return { hair: '#f2a3bd' };
  if (hasAny(text, ['红发', 'red hair'])) return { hair: '#b43a2c' };
  if (hasAny(text, ['蓝发', 'blue', '夜空'])) return { hair: '#315c9d' };
  if (hasAny(text, ['紫发', 'purple'])) return { hair: '#7f4cac' };
  if (hasAny(text, ['青绿', 'teal'])) return { hair: '#2fa89a' };
  if (hasAny(text, ['灰发', 'gray', 'ash'])) return { hair: '#8a8f97' };
  if (hasAny(text, ['奶茶', '栗色', '棕', 'brown', 'chestnut'])) return { hair: '#7b4a2b' };
  if (hasAny(text, ['火焰', 'orange'])) return { hair: '#e56a29' };
  if (hasAny(text, ['黑发', 'black'])) return { hair: '#171717' };
  return {};
}

function deriveEye(text: string): PortraitPreviewPatch {
  const patch: PortraitPreviewPatch = {};
  if (hasAny(text, ['金色', 'golden'])) patch.eye = '#d99b16';
  if (hasAny(text, ['冰蓝', 'blue'])) patch.eye = '#5aa7e8';
  if (hasAny(text, ['翡翠', 'green', 'emerald'])) patch.eye = '#24a16c';
  if (hasAny(text, ['紫罗兰', 'violet'])) patch.eye = '#8f68d8';
  if (hasAny(text, ['红宝石', 'ruby', 'red'])) patch.eye = '#c02f3f';
  if (hasAny(text, ['机械', 'cyber'])) Object.assign(patch, { eye: '#69f7de', mood: 'cyber' });
  if (hasAny(text, ['圆润', 'large round', 'starry'])) patch.eyeShape = 'round';
  if (hasAny(text, ['猫眼', 'cat'])) patch.eyeShape = 'cat';
  if (hasAny(text, ['狐狸', 'fox', '丹凤', 'phoenix', '锐利', 'sharp'])) patch.eyeShape = 'sharp';
  if (hasAny(text, ['细长', 'slender'])) patch.eyeShape = 'slender';
  if (hasAny(text, ['下垂', 'droopy', '温柔', 'gentle'])) patch.eyeShape = 'droopy';
  return patch;
}

function deriveOptionPreview(groupId: string, term: PortraitTerm): PortraitPreviewPatch {
  const text = `${term.zh} ${term.en} ${term.prompt || ''}`.toLowerCase();
  switch (groupId) {
    case 'age':
      if (hasAny(text, ['少女', 'teenage', 'young girl', 'girl'])) return { bodyScale: 0.94, mouth: 'soft-smile', mood: 'sweet', background: '#f1d9c6' };
      if (hasAny(text, ['少年', 'boy', 'male'])) return { bodyScale: 0.96, brow: 'straight', mouth: 'neutral', outfit: '#2f5f9a' };
      if (hasAny(text, ['成熟', 'mature', 'leader'])) return { bodyScale: 1.04, brow: 'arched', mouth: 'neutral', mood: 'cool' };
      if (hasAny(text, ['王族', 'royal', '贵族'])) return { mood: 'royal', outfit: '#d7a74a', accent: '#f5c44b' };
      if (hasAny(text, ['吸血鬼', 'vampire'])) return { mood: 'dark', outfit: '#22202a', accent: '#9b1f35', background: '#2c1b2e' };
      if (hasAny(text, ['赛博', 'cyber', 'future'])) return { mood: 'cyber', outfit: '#263849', accent: '#69f7de', background: '#17243a' };
      if (hasAny(text, ['战斗', 'battle'])) return { mood: 'battle', outfit: '#b7352c', accent: '#f06b3f' };
      if (hasAny(text, ['人偶', 'doll'])) return { headScaleX: 1.05, headScaleY: 0.96, eyeShape: 'round', mouth: 'soft-smile' };
      return {};
    case 'identity':
      if (hasAny(text, ['偶像', 'idol', '舞者', 'dancer'])) return { mood: 'sweet', outfit: '#e88bb1', accent: '#f5c44b' };
      if (hasAny(text, ['魔法', 'mage', '巫女', 'shrine'])) return { mood: 'dream', outfit: '#5b4c87', accent: '#9f8cff', background: '#edd4ef' };
      if (hasAny(text, ['剑士', 'knight', '骑士', 'commander', '忍者', 'ninja'])) return { mood: 'battle', outfit: '#263849', brow: 'sharp', accent: '#f06b3f' };
      if (hasAny(text, ['女仆', 'maid'])) return { outfit: '#22202a', accent: '#f5efe2', mouth: 'soft-smile' };
      if (hasAny(text, ['医生', 'doctor', '图书', 'librarian'])) return { outfit: '#f5efe2', mood: 'soft' };
      if (hasAny(text, ['侦探', 'detective', '机械师', 'mechanic'])) return { outfit: '#4c3a32', mood: 'cool' };
      if (hasAny(text, ['赛博', 'cyber', '宇航员', 'astronaut'])) return { mood: 'cyber', outfit: '#263849', accent: '#69f7de', background: '#17243a' };
      if (hasAny(text, ['海盗', 'pirate'])) return { mood: 'dark', outfit: '#2c1f1a', accessory: 'hat' };
      if (hasAny(text, ['学生', 'school', 'academy'])) return { outfit: '#2f5f9a', mood: 'soft' };
      if (hasAny(text, ['贵族', 'aristocrat'])) return { outfit: '#d7a74a', mood: 'royal', accessory: 'crown' };
      return {};
    case 'skinTone':
      return deriveSkin(text);
    case 'hairColor':
      return deriveHairColor(text);
    case 'eyes':
      return deriveEye(text);
    case 'faceShape':
      if (hasAny(text, ['圆脸', 'round', '娃娃', '甜妹', 'doll'])) return { headScaleX: 1.08, headScaleY: 0.96 };
      if (hasAny(text, ['瓜子', 'heart', 'fox', '狐'])) return { headScaleX: 0.92, headScaleY: 1.08 };
      if (hasAny(text, ['小巧', 'small', '精灵', 'elf'])) return { headScaleX: 0.9, headScaleY: 1.02 };
      if (hasAny(text, ['骨相', 'defined', '高级', 'fashion'])) return { headScaleX: 0.96, headScaleY: 1.12 };
      return {};
    case 'bodyShape':
    case 'silhouette':
      if (hasAny(text, ['高挑', 'tall', '长腿', 'elongated', 'model'])) return { bodyScale: 1.08 };
      if (hasAny(text, ['娇小', 'petite', '小骨架', 'delicate'])) return { bodyScale: 0.92 };
      if (hasAny(text, ['战斗', 'strong', 'athletic', 'heroic'])) return { bodyScale: 1.04, mood: 'battle' };
      if (hasAny(text, ['王女', 'royal', 'princess'])) return { mood: 'royal' };
      return {};
    case 'hairStyle':
      if (hasAny(text, ['双马尾', 'twin'])) return { hairShape: 'tails' };
      if (hasAny(text, ['丸子', 'bun'])) return { hairShape: 'bun' };
      if (hasAny(text, ['辫', 'braid'])) return { hairShape: 'braid' };
      if (hasAny(text, ['盘发', 'updo'])) return { hairShape: 'updo' };
      if (hasAny(text, ['短发', 'short', 'bob', '鲍勃'])) return { hairShape: hasAny(text, ['bob', '鲍勃']) ? 'bob' : 'short' };
      if (hasAny(text, ['长直', 'long', '波浪', 'princess', '自然披发'])) return { hairShape: 'long' };
      return {};
    case 'hairLength':
      if (hasAny(text, ['超短', 'pixie', '短发', 'short'])) return { hairShape: 'short' };
      if (hasAny(text, ['及腰', '超长', 'floor', 'very long', 'waist'])) return { hairShape: 'long' };
      if (hasAny(text, ['中长', 'shoulder', 'collarbone', 'medium'])) return { hairShape: 'bob' };
      return {};
    case 'hairTexture':
      if (hasAny(text, ['风吹', 'wind', '飘逸', 'airy'])) return { hairShape: 'long', mood: 'dream' };
      if (hasAny(text, ['凌乱', 'messy', 'wet', '湿润'])) return { bangs: 'messy' };
      if (hasAny(text, ['卷曲', 'curly', '蓬松', 'fluffy'])) return { hairShape: 'long', bangs: 'curtain' };
      if (hasAny(text, ['高光', 'glossy', '光泽'])) return { accent: '#f5c44b' };
      return {};
    case 'bangs':
      if (hasAny(text, ['无刘海', 'no bangs'])) return { bangs: 'none' };
      if (hasAny(text, ['齐刘海', 'straight', 'blunt'])) return { bangs: 'straight' };
      if (hasAny(text, ['斜', 'side'])) return { bangs: 'side' };
      if (hasAny(text, ['中分', '八字', 'curtain'])) return { bangs: 'curtain' };
      if (hasAny(text, ['遮眼', 'covered'])) return { bangs: 'covered' };
      if (hasAny(text, ['碎', 'messy', 'wispy'])) return { bangs: 'messy' };
      return { bangs: 'soft' };
    case 'brows':
      if (hasAny(text, ['剑眉', 'sharp', '凌厉'])) return { brow: 'sharp' };
      if (hasAny(text, ['平直', 'straight'])) return { brow: 'straight' };
      if (hasAny(text, ['浓眉', 'thick'])) return { brow: 'thick' };
      if (hasAny(text, ['高挑', 'arched', '弯月', 'crescent'])) return { brow: 'arched' };
      return { brow: 'soft' };
    case 'mouth':
    case 'lipMakeup':
    case 'expression':
      if (hasAny(text, ['微笑', '笑', 'smile', 'sweet'])) return { mouth: 'smile', mood: 'soft' };
      if (hasAny(text, ['浅笑', 'soft smile', 'gentle'])) return { mouth: 'soft-smile', mood: 'soft' };
      if (hasAny(text, ['微张', 'open', 'surprised'])) return { mouth: 'open' };
      if (hasAny(text, ['挑衅', 'smirk', '俏皮'])) return { mouth: 'smirk' };
      if (hasAny(text, ['忧郁', 'melancholic', 'tearful', '疲惫'])) return { mouth: 'sad', mood: 'dark' };
      if (hasAny(text, ['冷淡', '无表情', 'neutral', 'expressionless'])) return { mouth: 'neutral', mood: 'cool' };
      return {};
    case 'blush':
      if (hasAny(text, ['无腮红', 'no visible'])) return { blush: 'transparent' };
      if (hasAny(text, ['桃', '橘', 'peach', 'orange'])) return { blush: '#f49b65' };
      if (hasAny(text, ['玫瑰', 'rose'])) return { blush: '#d96b86' };
      return { blush: '#ef9aa4' };
    case 'eyeMakeup':
    case 'eyelashes':
    case 'makeupStyle':
      if (hasAny(text, ['烟熏', 'gothic', 'smoky'])) return { accent: '#34233d', mood: 'dark' };
      if (hasAny(text, ['赛博', 'cyber'])) return { accent: '#69f7de', mood: 'cyber' };
      if (hasAny(text, ['金', 'gold'])) return { accent: '#d99b16' };
      if (hasAny(text, ['红', 'red'])) return { accent: '#d0443f' };
      if (hasAny(text, ['甜美', 'sweet', '日系', 'korean', 'pink'])) return { mood: 'sweet', blush: '#ef9aa4' };
      if (hasAny(text, ['裸妆', 'natural'])) return { mood: 'soft', blush: '#ef9aa4' };
      return {};
    case 'top':
    case 'bottom':
    case 'outfit':
    case 'glovesSocks':
    case 'innerwear':
      if (hasAny(text, ['白', 'white', '婚纱'])) return { outfit: '#f5efe2' };
      if (hasAny(text, ['黑', 'black', '哥特', 'gothic'])) return { outfit: '#22202a', mood: 'dark' };
      if (hasAny(text, ['红', 'red', '战斗'])) return { outfit: '#b7352c', mood: 'battle' };
      if (hasAny(text, ['蓝', 'blue', '学院', 'school'])) return { outfit: '#2f5f9a' };
      if (hasAny(text, ['粉', 'pink', '偶像'])) return { outfit: '#e88bb1', mood: 'sweet' };
      if (hasAny(text, ['金', 'royal', '贵族', '王'])) return { outfit: '#d7a74a', mood: 'royal' };
      if (hasAny(text, ['机械', 'cyber', '战术'])) return { outfit: '#263849', mood: 'cyber' };
      return {};
    case 'hairAccessory':
      if (hasAny(text, ['无发饰', 'no hair'])) return { accessory: 'none', animalEars: false };
      if (hasAny(text, ['蝴蝶结', 'ribbon'])) return { accessory: 'ribbon' };
      if (hasAny(text, ['花', 'flower'])) return { accessory: 'flower' };
      if (hasAny(text, ['王冠', 'crown'])) return { accessory: 'crown', mood: 'royal' };
      if (hasAny(text, ['帽', 'hat', 'beret', '头巾', 'bandana'])) return { accessory: 'hat' };
      if (hasAny(text, ['面纱', 'veil'])) return { accessory: 'veil' };
      if (hasAny(text, ['发箍', 'headband'])) return { accessory: 'headband' };
      if (hasAny(text, ['护额', 'forehead'])) return { accessory: 'forehead' };
      if (hasAny(text, ['猫耳', '兔耳', 'animal', 'cat-ear', 'rabbit'])) return { animalEars: true, accessory: 'headband' };
      return {};
    case 'faceAccessory':
      if (hasAny(text, ['无眼镜', 'no glasses'])) return { glasses: false };
      if (hasAny(text, ['眼镜', 'glasses', 'monocle', 'goggles', '墨镜', 'sunglasses'])) return { glasses: true };
      if (hasAny(text, ['眼罩', 'eyepatch', '面罩', 'mask', '口罩'])) return { mark: 'magic', accent: '#d0443f' };
      if (hasAny(text, ['面纱', 'veil'])) return { accessory: 'veil' };
      return {};
    case 'ears':
      if (hasAny(text, ['猫耳', '狐耳', '兔耳', 'fox ears', 'cat ears', 'rabbit'])) return { animalEars: true };
      if (hasAny(text, ['耳机', 'headphones'])) return { accessory: 'headband' };
      return {};
    case 'tattoo':
      return hasAny(text, ['无纹身', 'no tattoo']) ? {} : { mark: 'tattoo' };
    case 'scars':
      return hasAny(text, ['无疤', 'no scar']) ? {} : { mark: 'scar' };
    case 'fantasyMarks':
      return hasAny(text, ['无', 'no visible']) ? {} : { mark: 'magic', mood: 'dream' };
    case 'skinDetails':
      if (hasAny(text, ['雀斑', 'freckle'])) return { mark: 'freckles' };
      return {};
    case 'bag':
    case 'necklace':
    case 'handAccessory':
    case 'belt':
      if (hasAny(text, ['金', 'gold', '珍珠', 'pearl', '水晶', 'crystal'])) return { accent: '#d7a74a', mood: 'royal' };
      if (hasAny(text, ['机械', 'metal', 'cyber'])) return { accent: '#69f7de', mood: 'cyber' };
      if (hasAny(text, ['黑', 'leather', '皮革', 'gothic'])) return { accent: '#2c1f1a', mood: 'dark' };
      if (hasAny(text, ['红', 'red'])) return { accent: '#d0443f', mood: 'battle' };
      return {};
    case 'temperament':
    case 'aura':
    case 'background':
    case 'lighting':
    case 'style':
    case 'gaze':
    case 'pose':
    case 'hands':
    case 'composition':
    case 'camera':
      if (hasAny(text, ['赛博', 'cyber', 'neon'])) return { mood: 'cyber', background: '#17243a', accent: '#69f7de' };
      if (hasAny(text, ['黑暗', 'dark', 'gothic', 'rainy night'])) return { mood: 'dark', background: '#2c1b2e' };
      if (hasAny(text, ['梦', 'dream', '柔焦', 'pink'])) return { mood: 'dream', background: '#edd4ef' };
      if (hasAny(text, ['高贵', 'royal', 'palace'])) return { mood: 'royal', background: '#3a2845', accent: '#d7a74a' };
      if (hasAny(text, ['战斗', 'war', 'battle', 'dangerous'])) return { mood: 'battle', background: '#3a1f18', accent: '#f06b3f' };
      if (hasAny(text, ['温柔', 'soft', 'healing'])) return { mood: 'soft', background: '#f1d9c6' };
      if (hasAny(text, ['冷', 'cool', 'distant', 'sharp'])) return { mood: 'cool', brow: 'sharp', mouth: 'neutral' };
      if (hasAny(text, ['笑', 'smile', 'happy'])) return { mood: 'sweet', mouth: 'smile' };
      return {};
    default:
      return {};
  }
}

function makePreviewTag(groupId: string, term: PortraitTerm): string {
  const raw = term.prompt || term.en || term.zh;
  return `${groupId}:${raw.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`;
}

function makeOption(categoryId: string, groupId: string, index: number, term: PortraitTerm): PortraitOption {
  return {
    id: `${categoryId}.${groupId}.${String(index + 1).padStart(2, '0')}`,
    categoryId,
    groupId,
    label: term.zh,
    labelEn: term.en,
    prompt: term.prompt || term.en,
    previewTag: makePreviewTag(groupId, term),
    preview: deriveOptionPreview(groupId, term),
  };
}

export const PORTRAIT_CATEGORIES: PortraitCategory[] = blueprints.map((category) => ({
  id: category.id,
  label: category.label,
  labelEn: category.labelEn,
  description: category.description,
  groups: category.groups.map((group) => ({
    id: group.id,
    categoryId: category.id,
    label: group.label,
    labelEn: group.labelEn,
    options: expandTermsToTarget(group.terms).map((term, index) => makeOption(category.id, group.id, index, term)),
  })),
}));

export const PORTRAIT_OPTIONS: PortraitOption[] = PORTRAIT_CATEGORIES.flatMap((category) =>
  category.groups.flatMap((group) => group.options)
);

export const PORTRAIT_OPTION_BY_ID = new Map(PORTRAIT_OPTIONS.map((option) => [option.id, option]));

export const PORTRAIT_GROUPS = PORTRAIT_CATEGORIES.flatMap((category) => category.groups);

export function resolvePortraitPreview(selection: PortraitSelection): PortraitPreviewState {
  const out: PortraitPreviewState = { ...DEFAULT_PREVIEW };
  for (const group of PORTRAIT_GROUPS) {
    const option = selection[group.id] ? PORTRAIT_OPTION_BY_ID.get(selection[group.id]) : null;
    if (!option?.preview) continue;
    Object.assign(out, option.preview);
  }
  return out;
}

export function categoryOptionCount(categoryId: string): number {
  const category = PORTRAIT_CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return 0;
  return category.groups.reduce((sum, group) => sum + group.options.length, 0);
}

export function normalizePortraitSelection(value: unknown): PortraitSelection {
  if (!value || typeof value !== 'object') return {};
  const out: PortraitSelection = {};
  for (const group of PORTRAIT_GROUPS) {
    const selected = String((value as Record<string, unknown>)[group.id] || '');
    if (selected && PORTRAIT_OPTION_BY_ID.has(selected)) out[group.id] = selected;
  }
  return out;
}

export function normalizePortraitLocks(value: unknown): PortraitLocks {
  if (!value || typeof value !== 'object') return {};
  const out: PortraitLocks = {};
  for (const group of PORTRAIT_GROUPS) {
    out[group.id] = Boolean((value as Record<string, unknown>)[group.id]);
  }
  return out;
}

export function normalizePortraitWeights(value: unknown): PortraitWeights {
  if (!value || typeof value !== 'object') return {};
  const out: PortraitWeights = {};
  for (const group of PORTRAIT_GROUPS) {
    const n = Number((value as Record<string, unknown>)[group.id]);
    if (Number.isFinite(n) && n > 0) out[group.id] = Math.max(0.5, Math.min(1.8, n));
  }
  return out;
}

function applyWeight(prompt: string, weight: number): string {
  if (!Number.isFinite(weight) || Math.abs(weight - 1) < 0.01) return prompt;
  return `(${prompt}:${weight.toFixed(1)})`;
}

export function buildPortraitPrompt(params: {
  selection: PortraitSelection;
  weights?: PortraitWeights;
  customText?: string;
  language?: PortraitLanguage;
}): string {
  const language = params.language || 'en';
  const parts: string[] = [];
  for (const category of PORTRAIT_CATEGORIES) {
    for (const group of category.groups) {
      const selected = params.selection[group.id];
      const option = selected ? PORTRAIT_OPTION_BY_ID.get(selected) : null;
      if (!option) continue;
      const text = language === 'zh' ? option.label : option.prompt;
      parts.push(applyWeight(text, params.weights?.[group.id] ?? 1));
    }
  }
  const custom = (params.customText || '').trim();
  if (custom) parts.push(custom);
  return parts.join(language === 'zh' ? '，' : ', ');
}

export function summarizePortraitSelection(selection: PortraitSelection, language: PortraitLanguage = 'zh'): string {
  const labels: string[] = [];
  for (const group of PORTRAIT_GROUPS) {
    const option = selection[group.id] ? PORTRAIT_OPTION_BY_ID.get(selection[group.id]) : null;
    if (option) labels.push(language === 'zh' ? option.label : option.labelEn);
  }
  if (labels.length === 0) return '未选择特征';
  return labels.slice(0, 8).join(' / ') + (labels.length > 8 ? ` / +${labels.length - 8}` : '');
}

export function portraitSelectionStats(selection: PortraitSelection): { selected: number; totalGroups: number } {
  let selected = 0;
  for (const group of PORTRAIT_GROUPS) {
    if (selection[group.id] && PORTRAIT_OPTION_BY_ID.has(selection[group.id])) selected += 1;
  }
  return { selected, totalGroups: PORTRAIT_GROUPS.length };
}

export function randomizePortraitSelection(params: {
  current?: PortraitSelection;
  locks?: PortraitLocks;
  seed?: number;
} = {}): PortraitSelection {
  const out: PortraitSelection = { ...(params.current || {}) };
  let seed = params.seed ?? Date.now();
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (const group of PORTRAIT_GROUPS) {
    if (params.locks?.[group.id]) continue;
    const skip = nextRand() < 0.08;
    if (skip) {
      delete out[group.id];
      continue;
    }
    const option = group.options[Math.floor(nextRand() * group.options.length)];
    if (option) out[group.id] = option.id;
  }
  return out;
}

export function clearCategorySelection(selection: PortraitSelection, categoryId: string): PortraitSelection {
  const out: PortraitSelection = { ...selection };
  const category = PORTRAIT_CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return out;
  for (const group of category.groups) delete out[group.id];
  return out;
}

export type RhToolboxMediaKind = 'text' | 'image' | 'video' | 'audio';

export type RhToolboxUserParamKind = 'text' | 'number' | 'select' | 'boolean';

export type RhToolboxOutputRole =
  | 'append-output'
  | 'replace-source'
  | 'text-only'
  | 'multi-output';

export interface RhToolboxCategory {
  id: string;
  name: string;
  description?: string;
  order?: number;
  icon?: string;
}

export interface RhToolboxInputMapping {
  key: string;
  label?: string;
  kind: RhToolboxMediaKind;
  rhNodeId: string;
  fieldName: string;
  required?: boolean;
  multiple?: boolean;
  maxItems?: number;
  defaultValue?: string;
  uploadAsset?: boolean;
  order?: number;
}

export interface RhToolboxFixedParam {
  rhNodeId: string;
  fieldName: string;
  value: string | number | boolean;
  valueType?: RhToolboxUserParamKind | RhToolboxMediaKind;
}

export interface RhToolboxUserParam {
  key: string;
  label: string;
  kind: RhToolboxUserParamKind;
  rhNodeId: string;
  fieldName: string;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  options?: Array<string | number>;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}

export interface RhToolboxOutputMapping {
  key: string;
  label?: string;
  kind: RhToolboxMediaKind;
  role?: RhToolboxOutputRole;
}

export interface RhToolboxTool {
  id: string;
  title: string;
  description?: string;
  categoryId: string;
  webappId: string;
  enabled?: boolean;
  order?: number;
  capabilities: string[];
  inputSchema: RhToolboxInputMapping[];
  outputSchema: RhToolboxOutputMapping[];
  fixedParams?: RhToolboxFixedParam[];
  userParams?: RhToolboxUserParam[];
  runtime?: {
    instanceType?: string;
    pollIntervalMs?: number;
    maxPolls?: number;
    fetchAppInfo?: boolean;
  };
  ui?: {
    icon?: string;
    accent?: string;
    showInNode?: boolean;
    showInImageEditor?: boolean;
    showInVideoEditor?: boolean;
    showInTextEditor?: boolean;
    showInAudioEditor?: boolean;
    quickActionLabel?: string;
  };
  version?: number;
}

export interface RhToolboxManifest {
  schema: 't8-rh-toolbox-manifest';
  version: number;
  updatedAt?: string;
  categories: RhToolboxCategory[];
  tools: RhToolboxTool[];
}

export interface RhToolboxInputPools {
  texts?: string[];
  images?: string[];
  videos?: string[];
  audios?: string[];
}

export interface RhToolboxPickedInputs {
  values: Record<string, string | string[]>;
  missing: string[];
}

export interface RhToolboxNodeInfoItem {
  nodeId: string;
  fieldName: string;
  fieldValue: string | number | boolean;
  valueType?: string;
}

export interface RhToolboxOutputClassification {
  urls: string[];
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
  textOutputs: string[];
}

const DEFAULT_CATEGORY_ID = 'general';

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)(\?|$)/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i;
const TEXT_RE = /\.(txt|md|json|csv)(\?|$)/i;

export const RH_TOOLBOX_ALL_CATEGORY_ID = 'all';

export const RH_TOOLBOX_CAPABILITY_LABELS: Record<string, string> = {
  'image.cutout': '图像抠图',
  'image.edit': '图像编辑',
  'image.upscale': '图像放大',
  'image.expand': '图像扩图',
  'image.restore': '图像修复',
  'image.background': '背景处理',
  'image.color': '色彩调整',
  'video.edit': '视频编辑',
  'video.upscale': '视频放大',
  'video.frame-interpolate': '视频插帧',
  'video.remove-bg': '视频去背景',
  'video.retime': '视频变速',
  'video.to-image': '视频取图',
  'text.expand': '文本扩写',
  'text.rewrite': '文本改写',
  'text.translate': '文本翻译',
  'text.prompt-enhance': '提示词增强',
  'text.summarize': '文本总结',
  'text.classify': '文本分类',
  'audio.clone': '音频克隆',
  'audio.tts': '文本转语音',
  'audio.separate': '音频分离',
  'audio.enhance': '音频增强',
  'audio.denoise': '音频降噪',
  'audio.music': '音乐生成',
};

function cleanId(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function cleanText(value: unknown, fallback = ''): string {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.length > 160 ? raw.slice(0, 160) : raw;
}

function cleanCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const capability = String(item ?? '').trim();
    if (!capability || seen.has(capability)) continue;
    seen.add(capability);
    out.push(capability);
  }
  return out;
}

function normalizeKind(value: unknown): RhToolboxMediaKind {
  return value === 'image' || value === 'video' || value === 'audio' ? value : 'text';
}

function normalizeUserParamKind(value: unknown): RhToolboxUserParamKind {
  if (value === 'number' || value === 'select' || value === 'boolean') return value;
  return 'text';
}

function cleanRhNodeId(value: unknown): string {
  return String(value ?? '').trim().replace(/^#/, '');
}

function sortByOrderThenTitle<T extends { order?: number; title?: string; name?: string; id: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const ao = Number.isFinite(a.order) ? Number(a.order) : 9999;
    const bo = Number.isFinite(b.order) ? Number(b.order) : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.title || a.name || a.id).localeCompare(String(b.title || b.name || b.id), 'zh-Hans-CN');
  });
}

export function normalizeRhToolboxManifest(manifest: Partial<RhToolboxManifest> | null | undefined): RhToolboxManifest {
  const rawCategories = Array.isArray(manifest?.categories) ? manifest!.categories : [];
  const categories: RhToolboxCategory[] = [];
  const categoryIds = new Set<string>();

  for (const [index, item] of rawCategories.entries()) {
    const id = cleanId((item as any)?.id, `${DEFAULT_CATEGORY_ID}-${index + 1}`);
    if (categoryIds.has(id)) continue;
    categoryIds.add(id);
    categories.push({
      id,
      name: cleanText((item as any)?.name, id),
      description: cleanText((item as any)?.description),
      order: Number.isFinite((item as any)?.order) ? Number((item as any).order) : index,
      icon: cleanText((item as any)?.icon),
    });
  }

  if (categories.length === 0) {
    categoryIds.add(DEFAULT_CATEGORY_ID);
    categories.push({ id: DEFAULT_CATEGORY_ID, name: '通用工具', order: 0, icon: 'Wrench' });
  }

  const rawTools = Array.isArray(manifest?.tools) ? manifest!.tools : [];
  const toolIds = new Set<string>();
  const tools: RhToolboxTool[] = [];

  for (const [index, item] of rawTools.entries()) {
    const raw = item as any;
    const id = cleanId(raw?.id, `tool-${index + 1}`);
    if (toolIds.has(id)) continue;
    toolIds.add(id);
    const categoryId = categoryIds.has(cleanId(raw?.categoryId, ''))
      ? cleanId(raw?.categoryId, '')
      : categories[0].id;
    const inputSchema = Array.isArray(raw?.inputSchema)
      ? raw.inputSchema
          .map((entry: any, entryIndex: number): RhToolboxInputMapping | null => {
            const rhNodeId = cleanRhNodeId(entry?.rhNodeId);
            const fieldName = cleanText(entry?.fieldName);
            if (!rhNodeId || !fieldName) return null;
            return {
              key: cleanId(entry?.key, `${normalizeKind(entry?.kind)}-${entryIndex + 1}`),
              label: cleanText(entry?.label),
              kind: normalizeKind(entry?.kind),
              rhNodeId,
              fieldName,
              required: entry?.required !== false,
              multiple: entry?.multiple === true,
              maxItems: Number.isFinite(entry?.maxItems) ? Math.max(1, Math.floor(Number(entry.maxItems))) : undefined,
              defaultValue: entry?.defaultValue == null ? undefined : String(entry.defaultValue),
              uploadAsset: entry?.uploadAsset !== false,
              order: Number.isFinite(entry?.order) ? Number(entry.order) : entryIndex,
            };
          })
          .filter(Boolean) as RhToolboxInputMapping[]
      : [];
    const outputSchema = Array.isArray(raw?.outputSchema)
      ? raw.outputSchema
          .map((entry: any, entryIndex: number): RhToolboxOutputMapping => ({
            key: cleanId(entry?.key, `output-${entryIndex + 1}`),
            label: cleanText(entry?.label),
            kind: normalizeKind(entry?.kind),
            role: ['append-output', 'replace-source', 'text-only', 'multi-output'].includes(entry?.role)
              ? entry.role
              : 'append-output',
          }))
      : [];
    const fixedParams = Array.isArray(raw?.fixedParams)
      ? raw.fixedParams
          .map((entry: any): RhToolboxFixedParam | null => {
            const rhNodeId = cleanRhNodeId(entry?.rhNodeId);
            const fieldName = cleanText(entry?.fieldName);
            if (!rhNodeId || !fieldName) return null;
            return {
              rhNodeId,
              fieldName,
              value: entry?.value ?? '',
              valueType: entry?.valueType,
            };
          })
          .filter(Boolean) as RhToolboxFixedParam[]
      : [];
    const userParams = Array.isArray(raw?.userParams)
      ? raw.userParams
          .map((entry: any, entryIndex: number): RhToolboxUserParam | null => {
            const rhNodeId = cleanRhNodeId(entry?.rhNodeId);
            const fieldName = cleanText(entry?.fieldName);
            const label = cleanText(entry?.label);
            if (!rhNodeId || !fieldName || !label) return null;
            const kind = normalizeUserParamKind(entry?.kind);
            return {
              key: cleanId(entry?.key, `param-${entryIndex + 1}`),
              label,
              kind,
              rhNodeId,
              fieldName,
              defaultValue: entry?.defaultValue,
              placeholder: cleanText(entry?.placeholder),
              options: Array.isArray(entry?.options)
                ? entry.options.filter((v: any) => typeof v === 'string' || typeof v === 'number').slice(0, 80)
                : undefined,
              min: Number.isFinite(entry?.min) ? Number(entry.min) : undefined,
              max: Number.isFinite(entry?.max) ? Number(entry.max) : undefined,
              step: Number.isFinite(entry?.step) ? Number(entry.step) : undefined,
              required: entry?.required === true,
            };
          })
          .filter(Boolean) as RhToolboxUserParam[]
      : [];
    const webappId = cleanText(raw?.webappId);
    tools.push({
      id,
      title: cleanText(raw?.title, id),
      description: cleanText(raw?.description),
      categoryId,
      webappId,
      enabled: raw?.enabled === true && !!webappId,
      order: Number.isFinite(raw?.order) ? Number(raw.order) : index,
      capabilities: cleanCapabilities(raw?.capabilities),
      inputSchema: inputSchema.slice().sort((a, b) => {
        const ao = Number.isFinite(a.order) ? Number(a.order) : 9999;
        const bo = Number.isFinite(b.order) ? Number(b.order) : 9999;
        if (ao !== bo) return ao - bo;
        return a.key.localeCompare(b.key);
      }),
      outputSchema,
      fixedParams,
      userParams,
      runtime: {
        instanceType: cleanText(raw?.runtime?.instanceType),
        pollIntervalMs: Number.isFinite(raw?.runtime?.pollIntervalMs)
          ? Math.max(1000, Number(raw.runtime.pollIntervalMs))
          : undefined,
        maxPolls: Number.isFinite(raw?.runtime?.maxPolls)
          ? Math.max(1, Math.floor(Number(raw.runtime.maxPolls)))
          : undefined,
        fetchAppInfo: raw?.runtime?.fetchAppInfo !== false,
      },
      ui: raw?.ui && typeof raw.ui === 'object'
        ? {
            icon: cleanText(raw.ui.icon),
            accent: cleanText(raw.ui.accent),
            showInNode: raw.ui.showInNode !== false,
            showInImageEditor: raw.ui.showInImageEditor === true,
            showInVideoEditor: raw.ui.showInVideoEditor === true,
            showInTextEditor: raw.ui.showInTextEditor === true,
            showInAudioEditor: raw.ui.showInAudioEditor === true,
            quickActionLabel: cleanText(raw.ui.quickActionLabel),
          }
        : { showInNode: true },
      version: Number.isFinite(raw?.version) ? Number(raw.version) : 1,
    });
  }

  return {
    schema: 't8-rh-toolbox-manifest',
    version: Number.isFinite(manifest?.version) ? Number(manifest!.version) : 1,
    updatedAt: cleanText(manifest?.updatedAt),
    categories: sortByOrderThenTitle(categories as any) as RhToolboxCategory[],
    tools: sortByOrderThenTitle(tools),
  };
}

export function listRhToolboxTools(
  manifest: Partial<RhToolboxManifest> | null | undefined,
  options: { includeDisabled?: boolean } = {},
): RhToolboxTool[] {
  const normalized = normalizeRhToolboxManifest(manifest);
  return normalized.tools.filter((tool) => options.includeDisabled || tool.enabled !== false);
}

export function findRhToolboxToolById(
  manifest: Partial<RhToolboxManifest> | null | undefined,
  toolId: string,
  options: { includeDisabled?: boolean } = {},
): RhToolboxTool | undefined {
  return listRhToolboxTools(manifest, options).find((tool) => tool.id === toolId);
}

export function filterRhToolboxTools(
  manifest: Partial<RhToolboxManifest> | null | undefined,
  filters: {
    query?: string;
    categoryId?: string;
    capability?: string;
    kind?: RhToolboxMediaKind;
    includeDisabled?: boolean;
  } = {},
): RhToolboxTool[] {
  const q = String(filters.query || '').trim().toLowerCase();
  return listRhToolboxTools(manifest, { includeDisabled: filters.includeDisabled }).filter((tool) => {
    if (filters.categoryId && filters.categoryId !== RH_TOOLBOX_ALL_CATEGORY_ID && tool.categoryId !== filters.categoryId) {
      return false;
    }
    if (filters.capability && !tool.capabilities.includes(filters.capability)) return false;
    if (filters.kind && !tool.inputSchema.some((input) => input.kind === filters.kind)) return false;
    if (!q) return true;
    const haystack = [
      tool.title,
      tool.description,
      tool.id,
      tool.capabilities.join(' '),
      tool.capabilities.map((cap) => RH_TOOLBOX_CAPABILITY_LABELS[cap] || '').join(' '),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export function pickRhToolboxInputs(tool: RhToolboxTool, pools: RhToolboxInputPools): RhToolboxPickedInputs {
  const values: Record<string, string | string[]> = {};
  const missing: string[] = [];
  const kindPools: Record<RhToolboxMediaKind, string[]> = {
    text: (pools.texts || []).filter(Boolean),
    image: (pools.images || []).filter(Boolean),
    video: (pools.videos || []).filter(Boolean),
    audio: (pools.audios || []).filter(Boolean),
  };
  const cursors: Record<RhToolboxMediaKind, number> = { text: 0, image: 0, video: 0, audio: 0 };

  for (const input of tool.inputSchema) {
    const pool = kindPools[input.kind] || [];
    const start = cursors[input.kind] || 0;
    const maxItems = Math.max(1, input.maxItems || 1);
    const selected = input.multiple ? pool.slice(start, start + maxItems) : pool.slice(start, start + 1);
    cursors[input.kind] = start + Math.max(1, selected.length);
    if (selected.length > 0) {
      values[input.key] = input.multiple ? selected : selected[0];
      continue;
    }
    if (input.defaultValue != null && input.defaultValue !== '') {
      values[input.key] = input.defaultValue;
      continue;
    }
    if (input.required) {
      missing.push(input.label || input.key);
    }
  }

  return { values, missing };
}

export function rhToolboxFieldKey(nodeId: string, fieldName: string): string {
  return `${nodeId}::${fieldName}`;
}

function pushNodeInfo(
  out: RhToolboxNodeInfoItem[],
  item: RhToolboxNodeInfoItem,
  seen: Map<string, number>,
) {
  const key = rhToolboxFieldKey(item.nodeId, item.fieldName);
  const existingIndex = seen.get(key);
  if (existingIndex != null) {
    out[existingIndex] = item;
    return;
  }
  seen.set(key, out.length);
  out.push(item);
}

function coerceFieldValue(value: any, valueType?: string): string | number | boolean {
  if (valueType === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value ?? '');
  }
  if (valueType === 'boolean') return value === true || value === 'true' || value === 1 || value === '1';
  if (Array.isArray(value)) return String(value[0] ?? '');
  return value as any;
}

export function buildRhToolboxNodeInfoList(
  tool: RhToolboxTool,
  options: {
    inputValues?: Record<string, string | string[]>;
    userParamValues?: Record<string, string | number | boolean>;
  } = {},
): RhToolboxNodeInfoItem[] {
  const out: RhToolboxNodeInfoItem[] = [];
  const seen = new Map<string, number>();
  const inputValues = options.inputValues || {};
  const userParamValues = options.userParamValues || {};

  for (const input of tool.inputSchema) {
    const raw = inputValues[input.key] ?? input.defaultValue ?? '';
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value == null || value === '') continue;
    pushNodeInfo(out, {
      nodeId: input.rhNodeId,
      fieldName: input.fieldName,
      fieldValue: String(value),
      valueType: input.kind,
    }, seen);
  }

  for (const param of tool.userParams || []) {
    const raw = userParamValues[param.key] ?? param.defaultValue;
    if (raw == null || raw === '') {
      if (!param.required) continue;
    }
    pushNodeInfo(out, {
      nodeId: param.rhNodeId,
      fieldName: param.fieldName,
      fieldValue: coerceFieldValue(raw ?? '', param.kind),
      valueType: param.kind,
    }, seen);
  }

  for (const fixed of tool.fixedParams || []) {
    pushNodeInfo(out, {
      nodeId: fixed.rhNodeId,
      fieldName: fixed.fieldName,
      fieldValue: coerceFieldValue(fixed.value, fixed.valueType),
      valueType: fixed.valueType,
    }, seen);
  }

  return out;
}

export function classifyRhToolboxOutputs(urls: string[]): RhToolboxOutputClassification {
  const cleanUrls = (Array.isArray(urls) ? urls : []).map((url) => String(url || '').trim()).filter(Boolean);
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];
  const textOutputs: string[] = [];

  for (const url of cleanUrls) {
    if (IMAGE_RE.test(url)) imageUrls.push(url);
    else if (VIDEO_RE.test(url)) videoUrls.push(url);
    else if (AUDIO_RE.test(url)) audioUrls.push(url);
    else if (TEXT_RE.test(url) || !/^https?:\/\//i.test(url)) textOutputs.push(url);
    else imageUrls.push(url);
  }

  return { urls: cleanUrls, imageUrls, videoUrls, audioUrls, textOutputs };
}

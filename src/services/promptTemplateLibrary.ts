import {
  PROMPT_TEMPLATE_LIBRARY_VERSION,
  type PromptTemplateAttachment,
  type PromptTemplateAttachmentKind,
  type PromptTemplateCategory,
  type PromptTemplateItem,
  type PromptTemplateKind,
  type PromptTemplateLanguage,
} from '../data/promptTemplateLibrary';

export const PROMPT_TEMPLATE_STORAGE_KEY = 't8-prompt-template-library-v1';
export const PROMPT_TEMPLATE_BACKUP_SCHEMA = 't8-prompt-template-library';

export interface PromptTemplateUserState {
  schema: typeof PROMPT_TEMPLATE_BACKUP_SCHEMA;
  version: 1;
  catalogVersion: string;
  language: PromptTemplateLanguage;
  customItems: PromptTemplateItem[];
  customCategories: PromptTemplateCategory[];
  hiddenBuiltInIds: string[];
  updatedAt: string;
}

export interface PromptTemplateBackup {
  schema: typeof PROMPT_TEMPLATE_BACKUP_SCHEMA;
  version: 1;
  catalogVersion: string;
  exportedAt: string;
  language: PromptTemplateLanguage;
  customItems: PromptTemplateItem[];
  customCategories: PromptTemplateCategory[];
  hiddenBuiltInIds: string[];
}

function nowIso() {
  return new Date().toISOString();
}

export function defaultPromptTemplateUserState(): PromptTemplateUserState {
  return {
    schema: PROMPT_TEMPLATE_BACKUP_SCHEMA,
    version: 1,
    catalogVersion: PROMPT_TEMPLATE_LIBRARY_VERSION,
    language: 'zh',
    customItems: [],
    customCategories: [],
    hiddenBuiltInIds: [],
    updatedAt: nowIso(),
  };
}

function cleanId(value: unknown, fallback = '') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function cleanText(value: unknown, fallback = '', limit = 20000) {
  return String(value ?? fallback).trim().slice(0, limit);
}

function normalizeKind(value: unknown): PromptTemplateKind | '' {
  const kind = String(value || '').trim();
  return kind === 'image' || kind === 'video' ? kind : '';
}

function normalizeAttachmentKind(value: unknown): PromptTemplateAttachmentKind | '' {
  const kind = String(value || '').trim();
  return kind === 'image' || kind === 'video' || kind === 'audio' ? kind : '';
}

export function promptTemplateKindFromAttachmentKind(kind: PromptTemplateAttachmentKind): PromptTemplateKind {
  return kind === 'image' ? 'image' : 'video';
}

export function defaultPromptTemplateCategoryForAttachmentKind(kind: PromptTemplateAttachmentKind): string {
  if (kind === 'image') return 'image-reference-edit';
  if (kind === 'audio') return 'video-music-audio';
  return 'video-image-to-video';
}

function normalizeLanguage(value: unknown): PromptTemplateLanguage {
  return value === 'en' ? 'en' : 'zh';
}

function normalizeCustomCategory(raw: any, index: number): PromptTemplateCategory | null {
  const kind = normalizeKind(raw?.kind);
  const labelZh = cleanText(raw?.labelZh || raw?.name || raw?.label, '', 80);
  if (!kind || !labelZh) return null;
  const id = cleanId(raw?.id, `custom-${kind}-${index + 1}`) || `custom-${kind}-${index + 1}`;
  return {
    id,
    kind,
    labelZh,
    labelEn: cleanText(raw?.labelEn, labelZh, 80),
    descriptionZh: cleanText(raw?.descriptionZh, '我的分类', 240),
    descriptionEn: cleanText(raw?.descriptionEn, 'My category', 240),
    order: Number.isFinite(Number(raw?.order)) ? Number(raw.order) : 1000 + index,
    builtIn: false,
  };
}

export function normalizePromptTemplateAttachments(raw: unknown): PromptTemplateAttachment[] {
  const attachments: PromptTemplateAttachment[] = [];
  for (const [index, item] of (Array.isArray(raw) ? raw : []).entries()) {
    const record = item && typeof item === 'object' ? (item as any) : null;
    const kind = normalizeAttachmentKind(record?.kind);
    const url = cleanText(record?.url || record?.fileUrl || record?.src, '', 4000);
    if (!kind || !url) continue;
    const id = cleanId(record?.id, `att-${kind}-${index + 1}`) || `att-${kind}-${index + 1}`;
    attachments.push({
      id,
      kind,
      url,
      previewUrl: cleanText(record?.previewUrl || record?.thumbUrl || record?.poster || '', '', 4000) || undefined,
      title: cleanText(record?.title || record?.name || '', '', 160) || undefined,
      mime: cleanText(record?.mime || record?.mimeType || '', '', 120) || undefined,
      sourceNodeId: cleanText(record?.sourceNodeId || '', '', 120) || undefined,
      createdAt: cleanText(record?.createdAt, '', 40) || undefined,
    });
    if (attachments.length >= 12) break;
  }
  return attachments;
}

export function createCustomPromptTemplate(input: {
  kind: PromptTemplateKind;
  categoryId: string;
  titleZh: string;
  titleEn?: string;
  descriptionZh?: string;
  descriptionEn?: string;
  promptZh: string;
  promptEn?: string;
  negativeZh?: string;
  negativeEn?: string;
  tags?: string[];
  attachments?: PromptTemplateAttachment[];
  id?: string;
}): PromptTemplateItem {
  const titleZh = cleanText(input.titleZh, '我的提示词模板', 120) || '我的提示词模板';
  const promptZh = cleanText(input.promptZh, '', 30000);
  const id = cleanId(input.id, `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) || `tpl-${Date.now()}`;
  const stamp = nowIso();
  return {
    id,
    kind: input.kind,
    categoryId: cleanText(input.categoryId, `${input.kind}-custom`, 96),
    titleZh,
    titleEn: cleanText(input.titleEn, titleZh, 120),
    descriptionZh: cleanText(input.descriptionZh, '', 500),
    descriptionEn: cleanText(input.descriptionEn, input.descriptionZh || '', 500),
    promptZh,
    promptEn: cleanText(input.promptEn, promptZh, 30000),
    negativeZh: cleanText(input.negativeZh, '', 10000),
    negativeEn: cleanText(input.negativeEn, input.negativeZh || '', 10000),
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => cleanText(tag, '', 40)).filter(Boolean).slice(0, 20) : [],
    attachments: normalizePromptTemplateAttachments(input.attachments),
    source: 'custom',
    builtIn: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function normalizeCustomItem(raw: any, index: number): PromptTemplateItem | null {
  const kind = normalizeKind(raw?.kind);
  const titleZh = cleanText(raw?.titleZh || raw?.name || raw?.title, '', 120);
  const promptZh = cleanText(raw?.promptZh || raw?.positive || raw?.prompt || raw?.text, '', 30000);
  if (!kind || !titleZh || !promptZh) return null;
  const item = createCustomPromptTemplate({
    id: cleanId(raw?.id, `tpl-import-${index + 1}`),
    kind,
    categoryId: cleanText(raw?.categoryId || raw?.category, `${kind}-custom`, 96),
    titleZh,
    titleEn: cleanText(raw?.titleEn, titleZh, 120),
    descriptionZh: cleanText(raw?.descriptionZh || raw?.scene || raw?.description, '', 500),
    descriptionEn: cleanText(raw?.descriptionEn, raw?.descriptionZh || raw?.scene || '', 500),
    promptZh,
    promptEn: cleanText(raw?.promptEn, promptZh, 30000),
    negativeZh: cleanText(raw?.negativeZh || raw?.negative, '', 10000),
    negativeEn: cleanText(raw?.negativeEn, raw?.negativeZh || raw?.negative || '', 10000),
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    attachments: normalizePromptTemplateAttachments(raw?.attachments || raw?.media || raw?.materials),
  });
  item.createdAt = cleanText(raw?.createdAt, item.createdAt, 40);
  item.updatedAt = cleanText(raw?.updatedAt, item.updatedAt, 40);
  return item;
}

export function createPromptTemplateFromMaterial(input: {
  mediaKind: PromptTemplateAttachmentKind;
  url: string;
  previewUrl?: string;
  prompt?: string;
  negative?: string;
  title?: string;
  templateKind?: PromptTemplateKind;
  categoryId?: string;
  sourceNodeId?: string;
  mime?: string;
}): PromptTemplateItem {
  const mediaKind = normalizeAttachmentKind(input.mediaKind) || 'image';
  const templateKind = normalizeKind(input.templateKind) || promptTemplateKindFromAttachmentKind(mediaKind);
  const title = cleanText(input.title, '', 120) || (mediaKind === 'image' ? '图像提示词模板' : mediaKind === 'video' ? '视频提示词模板' : '音频提示词模板');
  const prompt = cleanText(input.prompt, '', 30000) || title;
  const categoryId = cleanText(input.categoryId, '', 96) || defaultPromptTemplateCategoryForAttachmentKind(mediaKind);
  return createCustomPromptTemplate({
    kind: templateKind,
    categoryId,
    titleZh: title,
    titleEn: title,
    descriptionZh: `从${mediaKind === 'image' ? '图像' : mediaKind === 'video' ? '视频' : '音频'}素材右键保存，包含原始提示词与配套素材。`,
    descriptionEn: `Saved from a ${mediaKind} asset with prompt and media attachment.`,
    promptZh: prompt,
    promptEn: prompt,
    negativeZh: cleanText(input.negative, '', 10000),
    negativeEn: cleanText(input.negative, '', 10000),
    tags: ['我的模板', mediaKind === 'image' ? '图像参考' : mediaKind === 'video' ? '视频参考' : '音频参考'],
    attachments: [
      {
        id: `att-${mediaKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: mediaKind,
        url: cleanText(input.url, '', 4000),
        previewUrl: cleanText(input.previewUrl, '', 4000) || undefined,
        title,
        mime: cleanText(input.mime, '', 120) || undefined,
        sourceNodeId: cleanText(input.sourceNodeId, '', 120) || undefined,
        createdAt: nowIso(),
      },
    ],
  });
}

export function normalizePromptTemplateState(raw: any): PromptTemplateUserState {
  const base = defaultPromptTemplateUserState();
  if (!raw || typeof raw !== 'object') return base;
  const customCategories = Array.isArray(raw.customCategories)
    ? raw.customCategories.map(normalizeCustomCategory).filter((item: PromptTemplateCategory | null): item is PromptTemplateCategory => !!item)
    : [];
  const customItems = Array.isArray(raw.customItems)
    ? raw.customItems.map(normalizeCustomItem).filter((item: PromptTemplateItem | null): item is PromptTemplateItem => !!item)
    : [];
  return {
    ...base,
    language: normalizeLanguage(raw.language),
    customCategories,
    customItems,
    hiddenBuiltInIds: Array.isArray(raw.hiddenBuiltInIds)
      ? raw.hiddenBuiltInIds.map((id: unknown) => cleanId(id)).filter(Boolean).slice(0, 2000)
      : [],
    updatedAt: cleanText(raw.updatedAt, nowIso(), 40),
  };
}

export function loadPromptTemplateUserState(): PromptTemplateUserState {
  if (typeof window === 'undefined') return defaultPromptTemplateUserState();
  try {
    const raw = window.localStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY);
    return normalizePromptTemplateState(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultPromptTemplateUserState();
  }
}

export function savePromptTemplateUserState(state: PromptTemplateUserState) {
  const next = normalizePromptTemplateState({ ...state, updatedAt: nowIso() });
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function exportPromptTemplateBackup(state: PromptTemplateUserState): PromptTemplateBackup {
  const clean = normalizePromptTemplateState(state);
  return {
    schema: PROMPT_TEMPLATE_BACKUP_SCHEMA,
    version: 1,
    catalogVersion: PROMPT_TEMPLATE_LIBRARY_VERSION,
    exportedAt: nowIso(),
    language: clean.language,
    customItems: clean.customItems,
    customCategories: clean.customCategories,
    hiddenBuiltInIds: clean.hiddenBuiltInIds,
  };
}

export function importPromptTemplateBackup(
  payload: any,
  current: PromptTemplateUserState,
  mode: 'merge' | 'replace' = 'merge',
): PromptTemplateUserState {
  const incoming = normalizePromptTemplateState(payload);
  if (mode === 'replace') {
    return savePromptTemplateUserState({
      ...incoming,
      language: incoming.language || current.language,
      updatedAt: nowIso(),
    });
  }
  const byCategory = new Map<string, PromptTemplateCategory>();
  for (const category of [...current.customCategories, ...incoming.customCategories]) {
    byCategory.set(category.id, category);
  }
  const byItem = new Map<string, PromptTemplateItem>();
  for (const item of [...current.customItems, ...incoming.customItems]) {
    byItem.set(item.id, item);
  }
  return savePromptTemplateUserState({
    ...current,
    customCategories: Array.from(byCategory.values()),
    customItems: Array.from(byItem.values()),
    hiddenBuiltInIds: Array.from(new Set([...current.hiddenBuiltInIds, ...incoming.hiddenBuiltInIds])),
    updatedAt: nowIso(),
  });
}

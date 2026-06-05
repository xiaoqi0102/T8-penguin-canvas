import {
  PROMPT_TEMPLATE_LIBRARY_VERSION,
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
  });
  item.createdAt = cleanText(raw?.createdAt, item.createdAt, 40);
  item.updatedAt = cleanText(raw?.updatedAt, item.updatedAt, 40);
  return item;
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

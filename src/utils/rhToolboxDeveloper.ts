import {
  normalizeRhToolboxManifest,
  type RhToolboxCategory,
  type RhToolboxManifest,
  type RhToolboxTool,
} from './rhToolbox';

export const RH_TOOLBOX_DEVELOPER_EVENT = 'penguin:rh-toolbox-manifest-updated';
export const RH_TOOLBOX_DEVELOPER_STORAGE_KEY = ['t8', 'rh', 'toolbox', 'maker', 'drafts'].join('-');

function isRhToolboxDeveloperRuntime(): boolean {
  return Boolean((import.meta as any)?.env?.DEV);
}

function sortByOrderThenTitle<T extends { order?: number; title?: string; name?: string; id: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const ao = Number.isFinite(a.order) ? Number(a.order) : 9999;
    const bo = Number.isFinite(b.order) ? Number(b.order) : 9999;
    if (ao !== bo) return ao - bo;
    return String(a.title || a.name || a.id).localeCompare(String(b.title || b.name || b.id), 'zh-Hans-CN');
  });
}

function readDeveloperManifestFromStorage(): Partial<RhToolboxManifest> | null {
  if (!isRhToolboxDeveloperRuntime()) return null;
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(RH_TOOLBOX_DEVELOPER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDeveloperManifestToStorage(manifest: RhToolboxManifest): boolean {
  if (!isRhToolboxDeveloperRuntime()) return false;
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(RH_TOOLBOX_DEVELOPER_STORAGE_KEY, JSON.stringify(manifest));
    window.dispatchEvent(new CustomEvent(RH_TOOLBOX_DEVELOPER_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function mergeRhToolboxManifestWithDeveloperDrafts(
  manifest: Partial<RhToolboxManifest> | null | undefined,
): RhToolboxManifest {
  const base = normalizeRhToolboxManifest(manifest);
  const dev = readDeveloperManifestFromStorage();
  if (!dev) return base;
  const normalizedDev = normalizeRhToolboxManifest({
    schema: 't8-rh-toolbox-manifest',
    version: dev.version || base.version,
    updatedAt: dev.updatedAt || base.updatedAt,
    categories: [...base.categories, ...(Array.isArray(dev.categories) ? dev.categories : [])],
    tools: [...base.tools, ...(Array.isArray(dev.tools) ? dev.tools : [])],
  });
  const categoryMap = new Map<string, RhToolboxCategory>();
  for (const category of normalizedDev.categories) categoryMap.set(category.id, category);
  const toolMap = new Map<string, RhToolboxTool>();
  for (const tool of normalizedDev.tools) toolMap.set(tool.id, tool);
  return {
    ...normalizedDev,
    categories: sortByOrderThenTitle(Array.from(categoryMap.values()) as any) as RhToolboxCategory[],
    tools: sortByOrderThenTitle(Array.from(toolMap.values())),
  };
}

export function saveRhToolboxDeveloperTool(
  tool: Partial<RhToolboxTool>,
  categories: RhToolboxCategory[],
): { ok: boolean; manifest: RhToolboxManifest; error?: string } {
  if (!isRhToolboxDeveloperRuntime()) {
    const empty = normalizeRhToolboxManifest({ schema: 't8-rh-toolbox-manifest', version: 1, categories, tools: [] });
    return { ok: false, manifest: empty, error: 'RH工具箱制作器仅开发环境可保存草稿' };
  }
  const current = normalizeRhToolboxManifest(readDeveloperManifestFromStorage() || {
    schema: 't8-rh-toolbox-manifest',
    version: 1,
    updatedAt: '',
    categories,
    tools: [],
  });
  const incoming = normalizeRhToolboxManifest({
    schema: 't8-rh-toolbox-manifest',
    version: current.version || 1,
    updatedAt: new Date().toISOString(),
    categories: [...current.categories, ...categories],
    tools: [tool as RhToolboxTool],
  });
  const normalizedTool = incoming.tools[0];
  if (!normalizedTool) {
    return { ok: false, manifest: current, error: '模板字段不完整，无法保存' };
  }
  const categoryMap = new Map<string, RhToolboxCategory>();
  for (const category of current.categories) categoryMap.set(category.id, category);
  for (const category of categories) categoryMap.set(category.id, category);
  const tools = current.tools.filter((item) => item.id !== normalizedTool.id);
  tools.push(normalizedTool);
  const next = normalizeRhToolboxManifest({
    schema: 't8-rh-toolbox-manifest',
    version: Math.max(1, current.version || 1),
    updatedAt: new Date().toISOString(),
    categories: Array.from(categoryMap.values()),
    tools,
  });
  const ok = writeDeveloperManifestToStorage(next);
  return { ok, manifest: next, error: ok ? undefined : '保存到浏览器开发草稿失败' };
}

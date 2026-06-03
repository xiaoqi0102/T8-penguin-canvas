export interface MaterialLike {
  id: string;
}

export function normalizeExcludedMaterialIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function excludeMaterialId(excludedIds: readonly string[] | undefined, materialId: string): string[] {
  const current = normalizeExcludedMaterialIds(excludedIds);
  const id = String(materialId || '').trim();
  if (!id || current.includes(id)) return current;
  return [...current, id];
}

export function filterExcludedMaterials<T extends MaterialLike>(
  materials: readonly T[] | undefined,
  excludedIds: readonly string[] | undefined,
): T[] {
  const arr = Array.isArray(materials) ? materials : [];
  const excluded = new Set(normalizeExcludedMaterialIds(excludedIds));
  if (excluded.size === 0) return arr.slice();
  return arr.filter((material) => !excluded.has(material.id));
}

export function pruneExcludedMaterialIds<T extends MaterialLike>(
  excludedIds: readonly string[] | undefined,
  materials: readonly T[] | undefined,
): string[] {
  const valid = new Set((Array.isArray(materials) ? materials : []).map((material) => material.id));
  return normalizeExcludedMaterialIds(excludedIds).filter((id) => valid.has(id));
}

export function countExcludedMaterials<T extends MaterialLike>(
  excludedIds: readonly string[] | undefined,
  materials: readonly T[] | undefined,
): number {
  return pruneExcludedMaterialIds(excludedIds, materials).length;
}

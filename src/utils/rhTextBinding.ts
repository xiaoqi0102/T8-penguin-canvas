import type { Material } from '../components/nodes/useUpstreamMaterials';

export interface RhTextFieldLike {
  nodeId?: string | number;
  node?: string | number;
  fieldName?: string;
  input?: string;
  name?: string;
  fieldType?: string;
}

export interface RhParamValue {
  value: string;
  sourceFromUpstream?: boolean;
  sourceMaterialId?: string;
  sourceRhNodeId?: string;
}

export interface RhTextMaterial extends Material {
  kind: 'text';
  rhNodeId?: string;
}

export type RhTextMatchStatus =
  | 'matched'
  | 'no-rh-node-id'
  | 'no-match'
  | 'conflict'
  | 'not-text-field';

export interface RhTextMatchResult {
  status: RhTextMatchStatus;
  material?: RhTextMaterial;
  matches?: RhTextMaterial[];
}

const NON_TEXT_FIELD_TYPES = new Set([
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'NUMBER',
  'FLOAT',
  'INTEGER',
  'INT',
  'BOOLEAN',
  'BOOL',
  'LIST',
  'SELECT',
  'DROPDOWN',
  'COMBO',
  'ENUM',
]);

export function normalizeRhNodeId(value: unknown): string {
  const raw = String(value ?? '').trim();
  return /^\d+$/.test(raw) ? raw : '';
}

export function rhParamKey(nodeId: unknown, fieldName: unknown): string {
  return `${String(nodeId ?? '')}::${String(fieldName ?? '')}`;
}

export function isRhTextField(field: RhTextFieldLike): boolean {
  const type = String(field?.fieldType || '').trim().toUpperCase();
  return !NON_TEXT_FIELD_TYPES.has(type);
}

function fieldNodeId(field: RhTextFieldLike): string {
  return normalizeRhNodeId(field?.nodeId ?? field?.node);
}

function isTextMaterial(material: Material): material is RhTextMaterial {
  return material.kind === 'text';
}

export function findRhTextMaterialForField(field: RhTextFieldLike, materials: Material[]): RhTextMatchResult {
  if (!isRhTextField(field)) return { status: 'not-text-field' };
  const nodeId = fieldNodeId(field);
  if (!nodeId) return { status: 'no-rh-node-id' };

  const matches = materials
    .filter(isTextMaterial)
    .filter((material) => normalizeRhNodeId(material.rhNodeId) === nodeId);
  if (matches.length === 0) return { status: 'no-match' };
  if (matches.length > 1) return { status: 'conflict', matches };
  return { status: 'matched', material: matches[0], matches };
}

export function findMaterialById(materials: Material[], materialId: unknown): RhTextMaterial | null {
  const id = String(materialId || '');
  if (!id) return null;
  const material = materials.find((candidate) => candidate.id === id);
  return material && isTextMaterial(material) ? material : null;
}

export function applyRhTextBindings(
  fields: RhTextFieldLike[] | undefined,
  materials: Material[],
  values: Record<string, RhParamValue>,
): Record<string, RhParamValue> {
  const next: Record<string, RhParamValue> = { ...values };
  if (!Array.isArray(fields)) return next;

  for (const field of fields) {
    const nodeId = field?.nodeId ?? field?.node;
    const fieldName = field?.fieldName ?? field?.input ?? field?.name;
    if (nodeId == null || fieldName == null) continue;
    const key = rhParamKey(nodeId, fieldName);
    const current = next[key];
    if (current?.sourceFromUpstream === false) continue;

    const selectedMaterial = findMaterialById(materials, current?.sourceMaterialId);
    const match = selectedMaterial
      ? { status: 'matched' as const, material: selectedMaterial }
      : findRhTextMaterialForField(field, materials);

    if (match.status !== 'matched' || !match.material) continue;
    if (current?.value === match.material.url && current.sourceMaterialId === match.material.id) continue;

    next[key] = {
      ...current,
      value: match.material.url,
      sourceFromUpstream: true,
      sourceMaterialId: match.material.id,
      sourceRhNodeId: normalizeRhNodeId(match.material.rhNodeId),
    };
  }

  return next;
}

export function areRhParamValuesEqual(
  a: Record<string, RhParamValue>,
  b: Record<string, RhParamValue>,
): boolean {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    const left = a?.[key];
    const right = b?.[key];
    if (!left && !right) continue;
    if (!left || !right) return false;
    if (left.value !== right.value) return false;
    if (left.sourceFromUpstream !== right.sourceFromUpstream) return false;
    if ((left.sourceMaterialId || '') !== (right.sourceMaterialId || '')) return false;
    if ((left.sourceRhNodeId || '') !== (right.sourceRhNodeId || '')) return false;
  }
  return true;
}

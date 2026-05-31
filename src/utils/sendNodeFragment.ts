import type { Edge, Node } from '@xyflow/react';

export interface SendNodeFragment {
  nodes: Node[];
  edges: Edge[];
  sourceCanvasId?: string;
}

export interface InstantiateSendNodeFragmentOptions {
  stamp?: number;
  selectNewNodes?: boolean;
  idFactory?: (node: Node, index: number) => string;
  edgeIdFactory?: (edge: Edge, index: number, sourceId: string, targetId: string) => string;
}

export interface InstantiatedSendNodeFragment {
  nodes: Node[];
  edges: Edge[];
  idMap: Map<string, string>;
}

const BULK_PHANTOM_ID = '__bulk_phantom__';

function clonePlain<T>(value: T): T {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    if (Array.isArray(value)) return [...value] as T;
    if (typeof value === 'object') return { ...(value as Record<string, unknown>) } as T;
    return value;
  }
}

function sanitizeIdPart(value: unknown, fallback: string): string {
  const text = String(value || fallback).trim().toLowerCase();
  return text.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function uniqueId(candidate: string, used: Set<string>): string {
  const base = candidate.trim() || 'node';
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let i = 2; i < 10000; i += 1) {
    const next = `${base}-${i}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  const fallback = `${base}-${Date.now().toString(36)}`;
  used.add(fallback);
  return fallback;
}

function defaultNodeId(node: Node, index: number, stamp: number): string {
  const type = sanitizeIdPart(node.type, 'node');
  return `${type}-fragment-${stamp}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultEdgeId(index: number, stamp: number, sourceId: string, targetId: string): string {
  return `edge-fragment-${stamp}-${index}-${sanitizeIdPart(sourceId, 'source')}-${sanitizeIdPart(targetId, 'target')}`;
}

export function buildSendNodeFragment(
  selectedNodes: Node[],
  allEdges: Edge[],
  sourceCanvasId?: string | null,
): SendNodeFragment {
  const nodes = selectedNodes
    .filter((node) => node && typeof node.id === 'string' && node.id !== BULK_PHANTOM_ID)
    .map((node) => clonePlain(node));
  const selectedIds = new Set(nodes.map((node) => node.id));
  const edges = allEdges
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .map((edge) => clonePlain(edge));
  return {
    nodes,
    edges,
    sourceCanvasId: sourceCanvasId || undefined,
  };
}

export function sendNodeFragmentSignature(fragment?: SendNodeFragment | null): string {
  if (!fragment || fragment.nodes.length === 0) return '';
  const nodeKeys = fragment.nodes
    .map((node) => `${node.id}:${String(node.type || 'node')}`)
    .sort();
  const edgeKeys = fragment.edges
    .map((edge) => `${edge.source}:${edge.sourceHandle || ''}->${edge.target}:${edge.targetHandle || ''}`)
    .sort();
  return `nodes(${nodeKeys.join(',')})|edges(${edgeKeys.join(',')})`;
}

export function summarizeSendNodeFragment(fragment?: SendNodeFragment | null): string {
  const nodeCount = fragment?.nodes.length || 0;
  const edgeCount = fragment?.edges.length || 0;
  if (nodeCount === 0) return '暂无节点';
  return edgeCount > 0 ? `${nodeCount} 节点 · ${edgeCount} 连线` : `${nodeCount} 节点`;
}

export function instantiateSendNodeFragment(
  fragment: SendNodeFragment,
  existingNodes: Node[],
  basePosition: { x: number; y: number },
  options: InstantiateSendNodeFragmentOptions = {},
): InstantiatedSendNodeFragment {
  const sourceNodes = fragment.nodes.filter((node) => node && typeof node.id === 'string' && node.id !== BULK_PHANTOM_ID);
  if (sourceNodes.length === 0) return { nodes: [], edges: [], idMap: new Map() };

  const stamp = options.stamp ?? Date.now();
  const usedNodeIds = new Set(existingNodes.map((node) => node.id));
  const idMap = new Map<string, string>();

  sourceNodes.forEach((node, index) => {
    const candidate = options.idFactory?.(node, index) || defaultNodeId(node, index, stamp);
    idMap.set(node.id, uniqueId(candidate, usedNodeIds));
  });

  const minX = Math.min(...sourceNodes.map((node) => node.position?.x ?? 0));
  const minY = Math.min(...sourceNodes.map((node) => node.position?.y ?? 0));
  const selectNewNodes = options.selectNewNodes ?? true;

  const nodes = sourceNodes.map((node) => {
    const cloned = clonePlain(node) as Node & Record<string, any>;
    const sourcePosition = node.position || { x: 0, y: 0 };
    const parentId = (node as any).parentId || (node as any).parentNode;
    cloned.id = idMap.get(node.id) || node.id;
    cloned.position = {
      x: basePosition.x + (sourcePosition.x - minX),
      y: basePosition.y + (sourcePosition.y - minY),
    };
    cloned.selected = selectNewNodes;
    cloned.dragging = false;
    delete cloned.resizing;
    delete cloned.positionAbsolute;
    delete cloned.measured;
    if (parentId && idMap.has(parentId)) {
      cloned.parentId = idMap.get(parentId);
      cloned.parentNode = idMap.get(parentId);
    } else {
      delete cloned.parentId;
      delete cloned.parentNode;
      if (cloned.extent === 'parent') delete cloned.extent;
      delete cloned.expandParent;
    }
    return cloned as Node;
  });

  const usedEdgeIds = new Set<string>();
  const edges = fragment.edges
    .map((edge, index) => {
      const sourceId = idMap.get(edge.source);
      const targetId = idMap.get(edge.target);
      if (!sourceId || !targetId) return null;
      const cloned = clonePlain(edge) as Edge & Record<string, any>;
      const candidate =
        options.edgeIdFactory?.(edge, index, sourceId, targetId) ||
        defaultEdgeId(index, stamp, sourceId, targetId);
      cloned.id = uniqueId(candidate, usedEdgeIds);
      cloned.source = sourceId;
      cloned.target = targetId;
      cloned.selected = false;
      return cloned as Edge;
    })
    .filter((edge): edge is Edge => !!edge);

  return { nodes, edges, idMap };
}

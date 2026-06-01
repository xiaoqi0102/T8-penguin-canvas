import type { Edge, Node } from '@xyflow/react';
import type { ResourceItem } from '../services/api';
import type { SendNodeFragment } from './sendNodeFragment';

export const WORKFLOW_RESOURCE_SCHEMA = 't8-workflow-fragment';

export interface WorkflowResourceManifest extends SendNodeFragment {
  schema: typeof WORKFLOW_RESOURCE_SCHEMA;
  version: 1;
  title: string;
  nodeCount: number;
  edgeCount: number;
  nodeTypes: string[];
  topologyPreview: WorkflowTopologyPreview;
  savedAt: string;
}

export interface WorkflowTopologyPreview {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    x: number;
    y: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
  }>;
}

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

function safeTitle(value: unknown, fallback = '未命名工作流'): string {
  const text = String(value || fallback).trim().replace(/\s+/g, ' ');
  return text.slice(0, 80) || fallback;
}

function cleanNodes(nodes: unknown): Node[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((node): node is Node => !!node && typeof node === 'object' && typeof (node as Node).id === 'string')
    .map((node) => {
      const cloned = clonePlain(node) as Node & Record<string, any>;
      cloned.selected = false;
      cloned.dragging = false;
      delete cloned.resizing;
      delete cloned.positionAbsolute;
      delete cloned.measured;
      return cloned as Node;
    });
}

function cleanEdges(edges: unknown, nodeIds: Set<string>): Edge[] {
  if (!Array.isArray(edges)) return [];
  return edges
    .filter((edge): edge is Edge => {
      if (!edge || typeof edge !== 'object') return false;
      const e = edge as Edge;
      return typeof e.id === 'string' && nodeIds.has(e.source) && nodeIds.has(e.target);
    })
    .map((edge) => {
      const cloned = clonePlain(edge) as Edge & Record<string, any>;
      cloned.selected = false;
      return cloned as Edge;
    });
}

function workflowNodeLabel(node: Node): string {
  const data = (node.data || {}) as Record<string, any>;
  const label = data.label || data.title || data.name || data.displayName || node.type || 'node';
  return safeTitle(label, String(node.type || 'node')).slice(0, 18);
}

function normalizeCoordinate(value: number, min: number, max: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return (low + high) / 2;
  if (max <= min) return (low + high) / 2;
  return low + ((value - min) / (max - min)) * (high - low);
}

export function createWorkflowTopologyPreview(fragment: SendNodeFragment): WorkflowTopologyPreview {
  const nodes = cleanNodes(fragment?.nodes).slice(0, 16);
  if (nodes.length === 0) return { nodes: [], edges: [] };
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = cleanEdges(fragment?.edges, nodeIds).slice(0, 24);
  const xs = nodes.map((node) => Number(node.position?.x) || 0);
  const ys = nodes.map((node) => Number(node.position?.y) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: String(node.type || 'node'),
      label: workflowNodeLabel(node),
      x: Math.round(normalizeCoordinate(Number(node.position?.x) || 0, minX, maxX, 8, 92) * 10) / 10,
      y: Math.round(normalizeCoordinate(Number(node.position?.y) || 0, minY, maxY, 12, 88) * 10) / 10,
    })),
    edges: edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
  };
}

export function createWorkflowResourceManifest(
  fragment: SendNodeFragment,
  options: { title?: string; savedAt?: string } = {},
): WorkflowResourceManifest {
  const nodes = cleanNodes(fragment?.nodes);
  if (nodes.length === 0) {
    throw new Error('至少选择 1 个节点才能保存工作流');
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = cleanEdges(fragment?.edges, nodeIds);
  const nodeTypes = Array.from(new Set(nodes.map((node) => String(node.type || 'node')).filter(Boolean))).slice(0, 24);
  return {
    schema: WORKFLOW_RESOURCE_SCHEMA,
    version: 1,
    title: safeTitle(options.title),
    sourceCanvasId: fragment?.sourceCanvasId || undefined,
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes,
    topologyPreview: createWorkflowTopologyPreview({ nodes, edges, sourceCanvasId: fragment?.sourceCanvasId }),
    savedAt: options.savedAt || new Date().toISOString(),
  };
}

export function workflowManifestToFragment(value: unknown): SendNodeFragment | null {
  const raw = value && typeof value === 'object' ? (value as Record<string, any>) : null;
  const manifest = raw?.schema === WORKFLOW_RESOURCE_SCHEMA ? raw : raw?.workflowFragment;
  if (!manifest || typeof manifest !== 'object' || manifest.schema !== WORKFLOW_RESOURCE_SCHEMA) return null;
  const nodes = cleanNodes(manifest.nodes);
  if (nodes.length === 0) return null;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = cleanEdges(manifest.edges, nodeIds);
  return {
    nodes,
    edges,
    sourceCanvasId: typeof manifest.sourceCanvasId === 'string' ? manifest.sourceCanvasId : undefined,
  };
}

export function resourceItemToWorkflowFragment(item: ResourceItem): SendNodeFragment | null {
  if (item.kind !== 'workflow') return null;
  return workflowManifestToFragment((item as any).workflowFragment);
}

export function summarizeWorkflowResource(item: Pick<ResourceItem, 'workflowNodeCount' | 'workflowEdgeCount'>): string {
  const nodeCount = Number(item.workflowNodeCount || 0);
  const edgeCount = Number(item.workflowEdgeCount || 0);
  if (nodeCount <= 0) return '工作流';
  return edgeCount > 0 ? `${nodeCount} 节点 · ${edgeCount} 连线` : `${nodeCount} 节点`;
}

import type { Node } from '@xyflow/react';

export const NODE_SERIAL_DATA_KEY = 'nodeSerialId';
export const FIRST_NODE_SERIAL_ID = 1;

export interface NodeSerialAssignmentResult {
  nodes: Node[];
  nextNodeSerialId: number;
  changed: boolean;
}

function cloneNodeWithSerial(node: Node, serialId: number): Node {
  const currentData = (node.data || {}) as Record<string, unknown>;
  if (currentData[NODE_SERIAL_DATA_KEY] === serialId) return node;
  return {
    ...node,
    data: {
      ...currentData,
      [NODE_SERIAL_DATA_KEY]: serialId,
    },
  } as Node;
}

function normalizeCounter(value: unknown): number | null {
  const parsed = parseNodeSerialInput(value);
  return parsed && parsed >= FIRST_NODE_SERIAL_ID ? parsed : null;
}

export function parseNodeSerialInput(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < FIRST_NODE_SERIAL_ID) return null;
    return value;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.startsWith('#') ? raw.slice(1).trim() : raw;
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < FIRST_NODE_SERIAL_ID) return null;
  return parsed;
}

export function getNodeSerialId(node: Node | null | undefined): number | null {
  if (!node) return null;
  return parseNodeSerialInput((node.data as any)?.[NODE_SERIAL_DATA_KEY]);
}

function nextUnusedSerial(cursor: number, used: Set<number>): number {
  let next = Math.max(FIRST_NODE_SERIAL_ID, cursor);
  while (used.has(next)) next += 1;
  return next;
}

export function normalizeCanvasNodeSerials(
  nodes: Node[],
  savedNextNodeSerialId?: unknown,
): NodeSerialAssignmentResult {
  const validSerials = nodes.map((node) => getNodeSerialId(node));
  const reserved = new Set<number>();
  let maxReserved = 0;

  for (const serialId of validSerials) {
    if (!serialId || reserved.has(serialId)) continue;
    reserved.add(serialId);
    maxReserved = Math.max(maxReserved, serialId);
  }

  const savedNext = normalizeCounter(savedNextNodeSerialId);
  let cursor = savedNext ?? FIRST_NODE_SERIAL_ID;
  if (reserved.size > 0) cursor = Math.max(cursor, maxReserved + 1);

  const used = new Set<number>();
  let changed = false;
  const normalizedNodes = nodes.map((node, index) => {
    const serialId = validSerials[index];
    if (serialId && !used.has(serialId)) {
      used.add(serialId);
      return node;
    }

    const next = nextUnusedSerial(cursor, used);
    used.add(next);
    cursor = next + 1;
    changed = true;
    return cloneNodeWithSerial(node, next);
  });

  return {
    nodes: normalizedNodes,
    nextNodeSerialId: Math.max(cursor, maxReserved + 1, FIRST_NODE_SERIAL_ID),
    changed,
  };
}

export function assignFreshNodeSerials(
  incomingNodes: Node[],
  existingNodes: Node[],
  nextNodeSerialId?: unknown,
): NodeSerialAssignmentResult {
  const used = new Set<number>();
  let maxUsed = 0;
  for (const node of existingNodes) {
    const serialId = getNodeSerialId(node);
    if (!serialId) continue;
    used.add(serialId);
    maxUsed = Math.max(maxUsed, serialId);
  }

  const savedNext = normalizeCounter(nextNodeSerialId);
  let cursor = Math.max(savedNext ?? FIRST_NODE_SERIAL_ID, maxUsed + 1, FIRST_NODE_SERIAL_ID);
  let changed = false;
  const nodes = incomingNodes.map((node) => {
    const next = nextUnusedSerial(cursor, used);
    used.add(next);
    cursor = next + 1;
    if (getNodeSerialId(node) !== next) changed = true;
    return cloneNodeWithSerial(node, next);
  });

  return {
    nodes,
    nextNodeSerialId: cursor,
    changed,
  };
}

export function findNodeBySerialId(nodes: Node[], serialId: number): Node | null {
  return nodes.find((node) => getNodeSerialId(node) === serialId) || null;
}

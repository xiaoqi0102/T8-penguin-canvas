const TOMBSTONE_TTL_MS = 60 * 60 * 1000;

const deletedByCanvas = new Map<string, Map<string, number>>();

function pruneCanvas(canvasId: string, now = Date.now()) {
  const bucket = deletedByCanvas.get(canvasId);
  if (!bucket) return;
  for (const [nodeId, ts] of bucket) {
    if (now - ts > TOMBSTONE_TTL_MS) bucket.delete(nodeId);
  }
  if (bucket.size === 0) deletedByCanvas.delete(canvasId);
}

export function markCanvasNodesDeleted(canvasId: string | null | undefined, nodeIds: Iterable<string>) {
  if (!canvasId) return;
  const now = Date.now();
  pruneCanvas(canvasId, now);
  const bucket = deletedByCanvas.get(canvasId) || new Map<string, number>();
  for (const nodeId of nodeIds) {
    if (typeof nodeId === 'string' && nodeId.trim()) {
      bucket.set(nodeId, now);
    }
  }
  if (bucket.size > 0) deletedByCanvas.set(canvasId, bucket);
}

export function isCanvasNodeDeleted(canvasId: string | null | undefined, nodeId: string | null | undefined) {
  if (!canvasId || !nodeId) return false;
  pruneCanvas(canvasId);
  return deletedByCanvas.get(canvasId)?.has(nodeId) || false;
}

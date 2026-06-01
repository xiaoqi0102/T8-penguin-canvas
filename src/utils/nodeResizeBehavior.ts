export interface CornerResizeBehavior {
  keepAspectRatio: boolean;
}

const FREE_CORNER_RESIZE_NODE_TYPES = new Set(['text']);

export function getCornerResizeBehavior(nodeType: string | null | undefined): CornerResizeBehavior {
  return {
    keepAspectRatio: !FREE_CORNER_RESIZE_NODE_TYPES.has(String(nodeType || '')),
  };
}

export function rightCenterHandleAnchor(size: { width: number; height: number }): { x: number; y: number } {
  return {
    x: size.width,
    y: size.height / 2,
  };
}

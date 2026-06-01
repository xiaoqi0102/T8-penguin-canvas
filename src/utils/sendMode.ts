import type { SendTargetMode } from './sendMaterials';

interface SendModeContext {
  nodeCount: number;
  edgeCount: number;
  materialCount?: number;
}

interface DefaultSendModeContext extends SendModeContext {
  selectedNodeTypes: string[];
}

interface ResolveSendModeContext extends SendModeContext {
  requestedMode: SendTargetMode;
  defaultMode?: SendTargetMode;
}

interface HistorySendModeContext extends SendModeContext {
  historyMode: SendTargetMode;
}

function hasConnectedNodeFragment(ctx: SendModeContext): boolean {
  return ctx.nodeCount > 1 && ctx.edgeCount > 0;
}

function singleNodeMaterialMode(type: string): SendTargetMode | null {
  if (type === 'portrait-master') return 'portrait-master';
  if (type === 'material-set') return 'material-set';
  if (type === 'upload') return 'upload';
  if (type === 'output') return 'output';
  return null;
}

export function chooseDefaultSendMode(ctx: DefaultSendModeContext): SendTargetMode {
  if (hasConnectedNodeFragment(ctx)) return 'node-fragment';
  if (ctx.nodeCount > 0 && (ctx.materialCount || 0) === 0) return 'node-fragment';
  if (ctx.selectedNodeTypes.length === 1) {
    const materialMode = singleNodeMaterialMode(String(ctx.selectedNodeTypes[0] || ''));
    if (materialMode) return materialMode;
  }
  return 'material-set';
}

export function resolveEffectiveSendMode(ctx: ResolveSendModeContext): SendTargetMode {
  if (ctx.requestedMode !== 'auto') return ctx.requestedMode;
  if (hasConnectedNodeFragment(ctx)) return 'node-fragment';
  if (ctx.defaultMode && ctx.defaultMode !== 'auto') return ctx.defaultMode;
  if (ctx.nodeCount > 0 && (ctx.materialCount || 0) === 0) return 'node-fragment';
  return 'material-set';
}

export function coerceHistorySendMode(ctx: HistorySendModeContext): SendTargetMode | null {
  if (hasConnectedNodeFragment(ctx) && ctx.historyMode !== 'node-fragment' && ctx.historyMode !== 'auto') {
    return null;
  }
  return ctx.historyMode;
}

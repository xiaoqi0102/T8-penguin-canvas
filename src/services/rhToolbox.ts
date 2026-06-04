import { fetchRhAppInfo, queryRh, submitRh, uploadRhAsset } from './generation';
import { RH_TOOLBOX_MANIFEST } from '../data/rhToolboxManifest';
import {
  buildRhToolboxNodeInfoList,
  classifyRhToolboxOutputs,
  findRhToolboxToolById,
  normalizeRhToolboxManifest,
  pickRhToolboxInputs,
  type RhToolboxInputPools,
  type RhToolboxManifest,
  type RhToolboxNodeInfoItem,
  type RhToolboxOutputClassification,
  type RhToolboxTool,
} from '../utils/rhToolbox';

export type RhToolboxProgressStage =
  | 'prepare'
  | 'app-info'
  | 'upload'
  | 'submit'
  | 'poll'
  | 'success'
  | 'error';

export interface RunRhToolboxProgress {
  stage: RhToolboxProgressStage;
  message: string;
  taskId?: string;
  pollCount?: number;
}

export interface RunRhToolboxToolOptions {
  toolId: string;
  manifest?: RhToolboxManifest;
  inputs?: RhToolboxInputPools;
  userParams?: Record<string, string | number | boolean>;
  instanceType?: string;
  appInfo?: any;
  signal?: AbortSignal;
  onProgress?: (progress: RunRhToolboxProgress) => void;
}

export interface RunRhToolboxToolResult extends RhToolboxOutputClassification {
  tool: RhToolboxTool;
  taskId: string;
  nodeInfoList: RhToolboxNodeInfoItem[];
  appInfo?: any;
  raw?: any;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('已取消'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('已取消'));
    };
    signal?.addEventListener('abort', onAbort);
  });
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('已取消');
}

function isMediaInputKind(kind: string): boolean {
  return kind === 'image' || kind === 'video' || kind === 'audio';
}

async function resolveRhToolboxInputValues(
  tool: RhToolboxTool,
  rawValues: Record<string, string | string[]>,
  onProgress?: (progress: RunRhToolboxProgress) => void,
  signal?: AbortSignal,
): Promise<Record<string, string | string[]>> {
  const resolved: Record<string, string | string[]> = {};
  for (const input of tool.inputSchema) {
    assertNotAborted(signal);
    const raw = rawValues[input.key];
    if (raw == null || raw === '') continue;
    const values = Array.isArray(raw) ? raw : [raw];
    const next: string[] = [];
    for (const value of values) {
      const v = String(value || '').trim();
      if (!v) continue;
      if (isMediaInputKind(input.kind) && input.uploadAsset !== false) {
        onProgress?.({ stage: 'upload', message: `上传 ${input.label || input.key}` });
        const uploaded = await uploadRhAsset(v);
        next.push(uploaded.fileName || v);
      } else {
        next.push(v);
      }
    }
    if (next.length > 0) {
      resolved[input.key] = input.multiple ? next : next[0];
    }
  }
  return resolved;
}

function normalizeFailedReason(reason: any, fallback = 'RH 工具箱任务失败'): string {
  if (reason == null || reason === '') return fallback;
  if (typeof reason === 'string') return reason;
  try {
    return reason.exception_message || reason.message || JSON.stringify(reason);
  } catch {
    return fallback;
  }
}

export function getRhToolboxManifest(): RhToolboxManifest {
  return normalizeRhToolboxManifest(RH_TOOLBOX_MANIFEST);
}

export async function runRhToolboxTool(options: RunRhToolboxToolOptions): Promise<RunRhToolboxToolResult> {
  const manifest = normalizeRhToolboxManifest(options.manifest || RH_TOOLBOX_MANIFEST);
  const tool = findRhToolboxToolById(manifest, options.toolId);
  if (!tool) throw new Error('RH工具箱未找到可用工具');
  if (!tool.enabled || !tool.webappId) throw new Error('该 RH工具箱工具尚未启用');

  const progress = options.onProgress;
  progress?.({ stage: 'prepare', message: `准备运行 ${tool.title}` });

  const picked = pickRhToolboxInputs(tool, options.inputs || {});
  if (picked.missing.length > 0) {
    throw new Error(`缺少上游输入：${picked.missing.join('、')}`);
  }

  assertNotAborted(options.signal);
  const appInfo = options.appInfo || (tool.runtime?.fetchAppInfo === false
    ? undefined
    : await (async () => {
        progress?.({ stage: 'app-info', message: '读取 RH 应用字段' });
        return fetchRhAppInfo(tool.webappId);
      })());

  const inputValues = await resolveRhToolboxInputValues(tool, picked.values, progress, options.signal);
  const nodeInfoList = buildRhToolboxNodeInfoList(tool, {
    inputValues,
    userParamValues: options.userParams,
  });

  progress?.({ stage: 'submit', message: '提交 RH 任务' });
  const submitResult = await submitRh({
    webappId: tool.webappId,
    nodeInfoList,
    instanceType: options.instanceType || tool.runtime?.instanceType || undefined,
  });
  const taskId = submitResult.taskId;
  if (!taskId) throw new Error('RH 未返回 taskId');

  const pollIntervalMs = Math.max(1000, tool.runtime?.pollIntervalMs || 5000);
  const maxPolls = Math.max(1, tool.runtime?.maxPolls || 480);
  let lastRaw: any;
  let lastError = '';

  for (let pollCount = 1; pollCount <= maxPolls; pollCount += 1) {
    assertNotAborted(options.signal);
    progress?.({ stage: 'poll', message: `轮询中 ${pollCount}/${maxPolls}`, taskId, pollCount });
    await delay(pollIntervalMs, options.signal);
    try {
      const query = await queryRh(taskId);
      lastRaw = query;
      if (query.status === 'SUCCESS') {
        const classified = classifyRhToolboxOutputs(query.urls || []);
        progress?.({ stage: 'success', message: `完成 · ${classified.urls.length} 个输出`, taskId, pollCount });
        return {
          ...classified,
          tool,
          taskId,
          nodeInfoList,
          appInfo,
          raw: query,
        };
      }
      if (query.status === 'FAILED') {
        throw new Error(normalizeFailedReason(query.failReason));
      }
    } catch (error: any) {
      lastError = error?.message || String(error);
      if (lastRaw?.status === 'FAILED') break;
    }
  }

  progress?.({ stage: 'error', message: lastError || 'RH 工具箱轮询超时', taskId });
  throw new Error(lastError || 'RH 工具箱轮询超时');
}

import { create } from 'zustand';
import { taskCompletionSound } from './taskCompletionSound';

/**
 * 批量运行总线
 * - currentRunId：单点模式指示 (后兼容 v1.2.7 之前)
 * - runningIds：并发运行中的节点集合 (v1.2.8 新增，为循环器节点并联模式使用)
 * - lastDone：最后一次完成的节点信息 (递增 ts 仅作于订阅触发)
 * - triggerRun(id)：单点调度 (外部应保证一次一个，等 lastDone)
 * - triggerRunMany(ids)：并发调度 (循环器专用) - 同时点亮多个节点让其同时进入 runFn
 * - markDone(id, ok)：节点完成时回调 (同时从 runningIds 移除，currentRunId 若是本节点则清空)
 * - cancelAll()：取消全部 (清空 runningIds + currentRunId)
 *
 * 向后兼容保证：现有 16 个节点仅依赖 currentRunId 逻辑不变；useRunTrigger 后续会同时检查 runningIds 是否包含自身 id。
 */

export interface LastDoneInfo {
  id: string;
  ok: boolean;
  ts: number;
  error?: string;
}

interface RunBusState {
  currentRunId: string | null;
  runningIds: string[];
  lastDone: LastDoneInfo | null;
  // 0=空闲, 1=单节点运行中, 2=批量运行中
  mode: 'idle' | 'single' | 'batch';
  batchTotal: number;
  batchDoneCount: number;
  triggerRun: (id: string, mode?: 'single' | 'batch') => void;
  triggerRunMany: (ids: string[], mode?: 'single' | 'batch') => void;
  markDone: (id: string, ok: boolean, error?: string) => void;
  cancelAll: () => void;
  setBatchProgress: (total: number, done: number) => void;
}

export const useRunBusStore = create<RunBusState>((set) => ({
  currentRunId: null,
  runningIds: [],
  lastDone: null,
  mode: 'idle',
  batchTotal: 0,
  batchDoneCount: 0,
  triggerRun: (id, mode = 'single') => {
    taskCompletionSound.primeAudio();
    set((s) => ({
      currentRunId: id,
      runningIds: s.runningIds.includes(id) ? s.runningIds : [...s.runningIds, id],
      mode: s.mode === 'batch' ? 'batch' : mode,
    }));
  },
  triggerRunMany: (ids, mode = 'batch') => {
    taskCompletionSound.primeAudio();
    set((s) => {
      // 并发模式：runningIds 合并去重，currentRunId 取首个 (仅为向后兼容订阅者)
      const merged = Array.from(new Set([...s.runningIds, ...ids]));
      return {
        runningIds: merged,
        currentRunId: ids.length > 0 ? ids[0] : s.currentRunId,
        mode: s.mode === 'batch' ? 'batch' : mode,
      };
    });
  },
  markDone: (id, ok, error) => {
    const ts = Date.now();
    if (ok) taskCompletionSound.notifyComplete(id, undefined, ts);
    set((s) => {
      const nextRunningIds = s.runningIds.filter((x) => x !== id);
      return {
        lastDone: { id, ok, ts, error },
        currentRunId: s.currentRunId === id ? null : s.currentRunId,
        runningIds: nextRunningIds,
        // 单节点模式且无其他运行中节点时回到 idle;批量模式由 Canvas 控制
        mode:
          s.mode === 'batch'
            ? 'batch'
            : nextRunningIds.length > 0
              ? s.mode
              : 'idle',
      };
    });
  },
  cancelAll: () =>
    set({ currentRunId: null, runningIds: [], mode: 'idle', batchTotal: 0, batchDoneCount: 0 }),
  setBatchProgress: (total, done) =>
    set({ batchTotal: total, batchDoneCount: done, mode: total > 0 ? 'batch' : 'idle' }),
}));

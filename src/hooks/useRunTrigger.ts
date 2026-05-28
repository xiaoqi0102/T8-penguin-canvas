import { useEffect, useRef } from 'react';
import { useRunBusStore } from '../stores/runBus';

const activeRunNodeIds = new Set<string>();

/**
 * 节点运行总线监听器
 * 节点在内部调用:`useRunTrigger(id, async () => { await handleGenerate(); })`
 * 命中两种触发之一即运行:
 *   1) 外部将 currentRunId 设为本节点 id (现有单点调度路径)
 *   2) 本节点 id 出现在 runningIds 中 (v1.2.8 新增并发调度路径，供循环器并联模式使用)
 * 完成后(成功 / 失败)回报 markDone(id, ok)。
 *
 * 设计要点:
 * - runFn 通过 ref 保存,避免依赖项导致 effect 反复执行
 * - 用 startedRef 防重入,避免 React StrictMode 二次挂载触发两次
 * - 同一节点不会同时被两个路径重复发起 (currentRunId === id 且 runningIds.includes(id))
 */
export function useRunTrigger(nodeId: string, runFn: () => Promise<void> | void) {
  const currentRunId = useRunBusStore((s) => s.currentRunId);
  const inMulti = useRunBusStore((s) => s.runningIds.includes(nodeId));
  const markDone = useRunBusStore((s) => s.markDone);
  const isMyTurn = currentRunId === nodeId || inMulti;
  const runFnRef = useRef(runFn);
  runFnRef.current = runFn;
  const startedRef = useRef(false);
  const runSeqRef = useRef(0);

  useEffect(() => {
    if (!isMyTurn) {
      startedRef.current = false;
      runSeqRef.current += 1;
      activeRunNodeIds.delete(nodeId);
      return;
    }
    if (startedRef.current) return;
    if (activeRunNodeIds.has(nodeId)) return;
    activeRunNodeIds.add(nodeId);
    startedRef.current = true;
    const seq = ++runSeqRef.current;
    const isStillRequested = () => {
      const state = useRunBusStore.getState();
      return state.currentRunId === nodeId || state.runningIds.includes(nodeId);
    };
    (async () => {
      try {
        await runFnRef.current();
        if (seq === runSeqRef.current && isStillRequested()) markDone(nodeId, true);
      } catch (e: any) {
        if (seq === runSeqRef.current && isStillRequested()) markDone(nodeId, false, e?.message);
      } finally {
        if (seq === runSeqRef.current) activeRunNodeIds.delete(nodeId);
      }
    })();
  }, [isMyTurn, nodeId, markDone]);
}

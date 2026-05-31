import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  isCompletionSoundEligibleNodeType,
  playTaskCompletionTone,
  primeTaskCompletionToneAudio,
  resolveCompletionSoundNodeType,
  shouldNotifyCompletionSoundForNodeType,
} from '../utils/taskCompletionSound';

const completionSoundNodeTypes = new Map<string, string>();

interface TaskCompletionSoundState {
  enabled: boolean;
  lastPlayedAt: number;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  primeAudio: () => void;
  notifyComplete: (nodeId: string, fallbackNodeType?: string, now?: number) => void;
}

export function registerTaskCompletionSoundNode(nodeId: string, nodeType?: string | null): () => void {
  if (nodeId && isCompletionSoundEligibleNodeType(nodeType)) {
    completionSoundNodeTypes.set(nodeId, String(nodeType));
  } else {
    completionSoundNodeTypes.delete(nodeId);
  }
  return () => {
    completionSoundNodeTypes.delete(nodeId);
  };
}

export const useTaskCompletionSoundStore = create<TaskCompletionSoundState>()(
  persist(
    (set, get) => ({
      enabled: true,
      lastPlayedAt: 0,
      setEnabled: (enabled) => set({ enabled }),
      toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),
      primeAudio: () => {
        if (!get().enabled) return;
        void primeTaskCompletionToneAudio().catch((error) => {
          console.warn('[task-completion-sound] unable to prime audio', error);
        });
      },
      notifyComplete: (nodeId, fallbackNodeType, now = Date.now()) => {
        const state = get();
        const nodeType = resolveCompletionSoundNodeType(completionSoundNodeTypes.get(nodeId), fallbackNodeType);
        if (!shouldNotifyCompletionSoundForNodeType(state, nodeType, now)) return;
        set({ lastPlayedAt: now });
        void playTaskCompletionTone().catch((error) => {
          console.warn('[task-completion-sound] unable to play completion tone', error);
        });
      },
    }),
    {
      name: 't8-task-completion-sound',
      partialize: (state) => ({ enabled: state.enabled }),
      merge: (persisted, current) => ({
        ...current,
        ...((persisted || {}) as Partial<TaskCompletionSoundState>),
        lastPlayedAt: 0,
      }),
    },
  ),
);

export const taskCompletionSound = {
  primeAudio: () => useTaskCompletionSoundStore.getState().primeAudio(),
  notifyComplete: (nodeId: string, fallbackNodeType?: string, now?: number) =>
    useTaskCompletionSoundStore.getState().notifyComplete(nodeId, fallbackNodeType, now),
};

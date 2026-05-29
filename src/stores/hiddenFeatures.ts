import { create } from 'zustand';

interface HiddenFeatureState {
  rhDuckUploadIds: string[];
  yyhPortraitIds: string[];
  toggleRhDuckUpload: (id: string) => boolean;
  clearRhDuckUpload: (id: string) => void;
  toggleYyhPortrait: (id: string) => boolean;
  clearYyhPortrait: (id: string) => void;
}

export const useHiddenFeatureStore = create<HiddenFeatureState>()((set) => ({
  rhDuckUploadIds: [],
  yyhPortraitIds: [],
  toggleRhDuckUpload: (id) => {
    let enabled = false;
    set((state) => {
      const exists = state.rhDuckUploadIds.includes(id);
      enabled = !exists;
      return {
        rhDuckUploadIds: exists
          ? state.rhDuckUploadIds.filter((item) => item !== id)
          : [...state.rhDuckUploadIds, id],
      };
    });
    return enabled;
  },
  clearRhDuckUpload: (id) =>
    set((state) => ({ rhDuckUploadIds: state.rhDuckUploadIds.filter((item) => item !== id) })),
  toggleYyhPortrait: (id) => {
    let enabled = false;
    set((state) => {
      const exists = state.yyhPortraitIds.includes(id);
      enabled = !exists;
      return {
        yyhPortraitIds: exists
          ? state.yyhPortraitIds.filter((item) => item !== id)
          : [...state.yyhPortraitIds, id],
      };
    });
    return enabled;
  },
  clearYyhPortrait: (id) =>
    set((state) => ({ yyhPortraitIds: state.yyhPortraitIds.filter((item) => item !== id) })),
}));

export function isRhDuckUploadEnabled(ids: string[], id?: string | null): boolean {
  return !!id && ids.includes(id);
}

export function isYyhPortraitEnabled(ids: string[], id?: string | null): boolean {
  return !!id && ids.includes(id);
}

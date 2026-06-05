import { create } from 'zustand';
import * as api from '../services/api';
import { resolveThemeTemplate } from '../theme/defaultTemplates';
import { normalizeAchievementTheme, type AchievementThemeStyle } from '../data/achievementManifest';
import { useThemeStore } from './theme';

export type AchievementDrawerTab = 'overview' | 'themes' | 'medals' | 'films';

export interface AchievementNotification {
  id: string;
  title: string;
  theme: string;
  rarity: string;
  createdAt: number;
  filmTitle?: string;
}

interface AchievementState {
  profile: api.AchievementProfile | null;
  manifest: Record<string, any> | null;
  definitions: api.AchievementDefinitionData[];
  summary: api.AchievementSummary | null;
  loading: boolean;
  error: string | null;
  drawerOpen: boolean;
  activeTab: AchievementDrawerTab;
  notifications: AchievementNotification[];
  loadProfile: () => Promise<void>;
  recordEvent: (payload: api.AchievementEventPayload) => Promise<void>;
  openDrawer: (tab?: AchievementDrawerTab) => void;
  closeDrawer: () => void;
  dismissNotification: (id: string) => void;
  setPreferences: (patch: Partial<api.AchievementProfile['preferences']>) => Promise<void>;
  reset: () => Promise<void>;
  exportData: () => Promise<api.AchievementProfile | null>;
  importData: (data: api.AchievementProfile | Record<string, any>) => Promise<void>;
}

function currentAchievementTheme(): AchievementThemeStyle {
  const state = useThemeStore.getState();
  const tpl = resolveThemeTemplate(state.templateId, state.customTemplates);
  return normalizeAchievementTheme(tpl.visuals?.style || state.style);
}

function applyProfileResponse(set: (patch: Partial<AchievementState>) => void, data: api.AchievementProfileData) {
  set({
    profile: data.profile,
    manifest: data.manifest,
    definitions: data.definitions || [],
    summary: data.summary,
    error: null,
  });
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
  profile: null,
  manifest: null,
  definitions: [],
  summary: null,
  loading: false,
  error: null,
  drawerOpen: false,
  activeTab: 'overview',
  notifications: [],

  async loadProfile() {
    if (get().loading) return;
    set({ loading: true, error: null });
    const res = await api.getAchievementProfile();
    if (!res.success) {
      set({ loading: false, error: res.error || '加载成就失败' });
      return;
    }
    applyProfileResponse(set, res.data);
    set({ loading: false });
  },

  async recordEvent(payload) {
    const theme = normalizeAchievementTheme(payload.theme || currentAchievementTheme());
    const res = await api.recordAchievementEvent({ ...payload, theme });
    if (!res.success) {
      set({ error: res.error || '成就事件记录失败' });
      return;
    }
    applyProfileResponse(set, res.data);
    const profile = res.data.profile;
    const recentUnlocks = res.data.summary?.recentUnlocks || [];
    if (res.data.ignored || profile?.preferences?.showToast === false || recentUnlocks.length === 0) return;
    const recentFilms = res.data.summary?.recentFilms || [];
    const filmByAchievement = new Map(recentFilms.map((film) => [film.sourceAchievementId, film.title]));
    const createdAt = Date.now();
    const nextNotifications = recentUnlocks.map((achievement) => ({
      id: `${achievement.id}-${createdAt}`,
      title: achievement.title,
      theme: achievement.themeLabel || achievement.theme,
      rarity: achievement.rarity,
      createdAt,
      filmTitle: filmByAchievement.get(achievement.id),
    }));
    set((state) => ({
      notifications: [...nextNotifications, ...state.notifications].slice(0, 4),
    }));
  },

  openDrawer(tab = 'overview') {
    set({ drawerOpen: true, activeTab: tab });
    void get().loadProfile();
  },

  closeDrawer() {
    set({ drawerOpen: false });
  },

  dismissNotification(id) {
    set((state) => ({ notifications: state.notifications.filter((item) => item.id !== id) }));
  },

  async setPreferences(patch) {
    const res = await api.updateAchievementPreferences(patch);
    if (!res.success) {
      set({ error: res.error || '保存成就设置失败' });
      return;
    }
    applyProfileResponse(set, res.data);
  },

  async reset() {
    const res = await api.resetAchievements();
    if (!res.success) {
      set({ error: res.error || '重置成就失败' });
      return;
    }
    applyProfileResponse(set, res.data);
    set({ notifications: [] });
  },

  async exportData() {
    const res = await api.exportAchievements();
    if (!res.success) {
      set({ error: res.error || '导出成就失败' });
      return null;
    }
    return res.data;
  },

  async importData(data) {
    const res = await api.importAchievements(data);
    if (!res.success) {
      set({ error: res.error || '导入成就失败' });
      return;
    }
    applyProfileResponse(set, res.data);
  },
}));

export function trackAchievementEvent(payload: api.AchievementEventPayload) {
  void useAchievementStore.getState().recordEvent(payload);
}

export function getCurrentAchievementTheme() {
  return currentAchievementTheme();
}

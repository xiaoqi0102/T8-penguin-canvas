import { create } from 'zustand';
import type { ApiSettings } from '../types/canvas';
import * as api from '../services/api';

// 三套 Key 的固定 base URL
export const FIXED_ZHENZHEN_BASE = 'https://ai.t8star.org';
export const RH_BASE = 'https://www.runninghub.cn';
// v1.5.6: 七牛云默认 base URL（不强制锁定，用户可改）
export const DEFAULT_QINIU_BASE = 'https://openai.qiniu.com';
// >>> CUSTOM-PROVIDER-INTEGRATIONS-START
// v1.5.6: Grsai 中转站默认 base URL（国内端点，用户可切到 https://grsaiapi.com 全球）
export const DEFAULT_GRSAI_BASE = 'https://grsai.dakka.com.cn';
// <<< CUSTOM-PROVIDER-INTEGRATIONS-END

interface ApiKeysState {
  settings: ApiSettings;
  loading: boolean;
  error: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  save: (patch: Partial<ApiSettings>) => Promise<void>;
}

const DEFAULT: ApiSettings = {
  zhenzhenApiKey: '',
  zhenzhenBaseUrl: FIXED_ZHENZHEN_BASE,
  rhApiKey: '',
  rhBaseUrl: RH_BASE,
  llmApiKey: '',
  llmBaseUrl: FIXED_ZHENZHEN_BASE,
  // v1.5.6: 七牛云独立 provider（图像生成）
  qiniuApiKey: '',
  qiniuBaseUrl: DEFAULT_QINIU_BASE,
  // >>> CUSTOM-PROVIDER-INTEGRATIONS-START
  // v1.5.6: Grsai 中转站独立 provider（自有协议，图像生成）
  grsaiApiKey: '',
  grsaiBaseUrl: DEFAULT_GRSAI_BASE,
  // <<< CUSTOM-PROVIDER-INTEGRATIONS-END
  // 分类独立 Key（留空时 fallback 到 zhenzhenApiKey）
  gptImageApiKey: '',
  nanoBananaApiKey: '',
  mjApiKey: '',
  veoApiKey: '',
  grokApiKey: '',
  seedanceApiKey: '',
  sunoApiKey: '',
  // 路径默认值由后端按平台计算并通过 /api/settings 返回，前端不硬编码 D 盘。
  fileSavePath: '',
  canvasAutoSavePath: '',
  resourceLibraryPath: '',
  themeTemplatePath: '',
  preferences: { theme: 'dark', language: 'zh-CN' },
};

export const useApiKeysStore = create<ApiKeysState>((set) => ({
  settings: DEFAULT,
  loading: false,
  error: null,
  loaded: false,

  async load() {
    set({ loading: true, error: null });
    try {
      const data = await api.getSettings();
      set({
        settings: { ...DEFAULT, ...data, zhenzhenBaseUrl: FIXED_ZHENZHEN_BASE, llmBaseUrl: FIXED_ZHENZHEN_BASE },
        loading: false,
        loaded: true,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '加载设置失败' });
    }
  },

  async save(patch) {
    set({ loading: true, error: null });
    try {
      await api.updateSettings(patch);
      // 重新拉取(后端会返回脱敏后的 Key)
      const data = await api.getSettings();
      set({
        settings: { ...DEFAULT, ...data, zhenzhenBaseUrl: FIXED_ZHENZHEN_BASE, llmBaseUrl: FIXED_ZHENZHEN_BASE },
        loading: false,
      });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '保存失败' });
    }
  },
}));

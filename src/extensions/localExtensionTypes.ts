export interface LocalTopbarSlotProps {
  isPixel: boolean;
  isDark: boolean;
}

export type LocalNodeAddonType = 'image' | 'video' | 'seedance' | 'audio' | string;

export interface LocalNodeAddonSlotProps {
  nodeId: string;
  nodeType: LocalNodeAddonType;
  data: Record<string, any>;
  update: (patch: Record<string, any>) => void;
  context?: {
    providerSource?: string;
    providerId?: string;
    providerModel?: string;
    model?: string;
    apiModel?: string;
    mainId?: string;
    providerKind?: string;
  };
}

export interface LocalSettingsAddonSlotProps {
  open: boolean;
  isPixel: boolean;
  isDark: boolean;
  settings: Record<string, any>;
  onSaved?: () => void | Promise<void>;
}

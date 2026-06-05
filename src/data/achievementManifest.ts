import manifestJson from '../../shared/achievementManifest.json';

export type AchievementThemeStyle =
  | 'tech'
  | 'pixel'
  | 'op'
  | 'rh'
  | 'naruto'
  | 'eva'
  | 'yyh'
  | 'slamdunk'
  | 'soccer-hero'
  | 'dragon-ball';

export type AchievementRarity = 'bronze' | 'silver' | 'gold' | 'master' | 'hidden';

export interface AchievementCondition {
  type: 'time' | 'nodeCreated' | 'nodeRun' | 'counter' | 'hidden';
  seconds?: number;
  count?: number;
  metric?: string;
  kind?: string;
  mode?: 'enabled' | 'used';
  nodeTypes?: string[];
}

export interface AchievementThemeManifest {
  style: AchievementThemeStyle;
  label: string;
  shortLabel: string;
  accent: string;
  featured: Array<{
    idSuffix: string;
    title: string;
    description: string;
    rarity: AchievementRarity;
    condition: AchievementCondition;
  }>;
}

export interface AchievementManifest {
  schema: 't8-achievement-manifest';
  version: number;
  timeMilestones: Array<{
    key: string;
    seconds: number;
    rarity: AchievementRarity;
    titleTemplate: string;
    descriptionTemplate: string;
  }>;
  themes: AchievementThemeManifest[];
  films: AchievementFilmReward[];
}

export interface AchievementDefinition {
  id: string;
  theme: AchievementThemeStyle;
  themeLabel: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  condition: AchievementCondition;
  medal: boolean;
  hidden: boolean;
}

export interface AchievementFilmReward {
  id: string;
  theme: AchievementThemeStyle;
  title: string;
  unlockAchievementId: string;
  lockedText: string;
  unavailableText: string;
}

export const achievementManifest = manifestJson as AchievementManifest;

export const ACHIEVEMENT_THEME_STYLES = achievementManifest.themes.map(
  (theme) => theme.style,
) as AchievementThemeStyle[];

const achievementThemeSet = new Set<string>(ACHIEVEMENT_THEME_STYLES);

export function normalizeAchievementTheme(style?: string | null): AchievementThemeStyle {
  const raw = String(style || '').trim();
  return achievementThemeSet.has(raw) ? (raw as AchievementThemeStyle) : 'tech';
}

export function getAchievementTheme(style?: string | null): AchievementThemeManifest {
  const normalized = normalizeAchievementTheme(style);
  return achievementManifest.themes.find((theme) => theme.style === normalized) || achievementManifest.themes[0];
}

export function buildAchievementDefinitions(
  manifest: AchievementManifest = achievementManifest,
): AchievementDefinition[] {
  return manifest.themes.flatMap((theme) => {
    const timeDefs = manifest.timeMilestones.map((milestone) => ({
      id: `${theme.style}-time-${milestone.key}`,
      theme: theme.style,
      themeLabel: theme.label,
      title: milestone.titleTemplate.replace('{theme}', theme.label),
      description: milestone.descriptionTemplate.replace('{theme}', theme.label),
      rarity: milestone.rarity,
      condition: {
        type: 'time' as const,
        seconds: milestone.seconds,
        count: milestone.seconds,
        metric: 'activeSeconds',
      },
      medal: milestone.rarity === 'master',
      hidden: false,
    }));
    const featuredDefs = theme.featured.map((item) => ({
      id: `${theme.style}-${item.idSuffix}`,
      theme: theme.style,
      themeLabel: theme.label,
      title: item.title,
      description: item.description,
      rarity: item.rarity,
      condition: item.condition,
      medal: item.rarity === 'master' || item.rarity === 'gold' || item.rarity === 'hidden',
      hidden: item.rarity === 'hidden',
    }));
    return [...timeDefs, ...featuredDefs];
  });
}

export function getDefinitionsByTheme() {
  const grouped = new Map<AchievementThemeStyle, AchievementDefinition[]>();
  for (const definition of buildAchievementDefinitions()) {
    const list = grouped.get(definition.theme) || [];
    list.push(definition);
    grouped.set(definition.theme, list);
  }
  return grouped;
}

export function formatAchievementSeconds(seconds?: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 1) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

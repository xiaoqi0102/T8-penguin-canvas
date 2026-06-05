import { useMemo, useRef, type ChangeEvent } from 'react';
import { Download, FileUp, Film, Lock, Medal, RotateCcw, Trophy, X } from 'lucide-react';
import {
  achievementManifest,
  buildAchievementDefinitions,
  formatAchievementSeconds,
  getAchievementTheme,
  type AchievementDefinition,
} from '../data/achievementManifest';
import { type AchievementDrawerTab, useAchievementStore } from '../stores/achievements';
import type { AchievementDefinitionData } from '../services/api';

const RARITY_LABEL: Record<string, string> = {
  bronze: '铜',
  silver: '银',
  gold: '金',
  master: '大师',
  hidden: '隐藏',
};

const TAB_ITEMS: Array<{ id: AchievementDrawerTab; label: string }> = [
  { id: 'overview', label: '总览' },
  { id: 'themes', label: '主题' },
  { id: 'medals', label: '勋章' },
  { id: 'films', label: '影片馆' },
];

function normalizeDefinition(def: AchievementDefinitionData | AchievementDefinition): AchievementDefinition {
  return def as AchievementDefinition;
}

function progressFor(stats: any, definition: AchievementDefinition) {
  const condition = definition.condition || {};
  const target = Math.max(1, Number(condition.seconds || condition.count) || 1);
  let current = 0;
  if (condition.type === 'time') current = Number(stats?.activeSeconds) || 0;
  else if (condition.type === 'counter' && condition.metric) current = Number(stats?.[condition.metric]) || 0;
  else if (condition.type === 'nodeCreated') {
    current = (condition.nodeTypes || []).reduce((sum, type) => sum + (Number(stats?.nodeTypeCounts?.[type]) || 0), 0);
  } else if (condition.type === 'nodeRun') {
    current = (condition.nodeTypes || []).reduce((sum, type) => sum + (Number(stats?.nodeRunCounts?.[type]) || 0), 0);
  } else if (condition.type === 'hidden') {
    const mode = condition.mode === 'used' ? 'used' : 'enabled';
    current = Number(stats?.hiddenModes?.[condition.kind || '']?.[mode]) || 0;
  }
  return { current, target, ratio: Math.max(0, Math.min(1, current / target)) };
}

function nextDefinition(themeDefinitions: AchievementDefinition[], stats: any, unlocked: Record<string, any>) {
  return themeDefinitions.find((definition) => !unlocked[definition.id] && progressFor(stats, definition).ratio < 1) || null;
}

export default function AchievementDrawer() {
  const drawerOpen = useAchievementStore((state) => state.drawerOpen);
  const activeTab = useAchievementStore((state) => state.activeTab);
  const closeDrawer = useAchievementStore((state) => state.closeDrawer);
  const openDrawer = useAchievementStore((state) => state.openDrawer);
  const profile = useAchievementStore((state) => state.profile);
  const definitionsFromStore = useAchievementStore((state) => state.definitions);
  const summary = useAchievementStore((state) => state.summary);
  const loading = useAchievementStore((state) => state.loading);
  const error = useAchievementStore((state) => state.error);
  const setPreferences = useAchievementStore((state) => state.setPreferences);
  const reset = useAchievementStore((state) => state.reset);
  const exportData = useAchievementStore((state) => state.exportData);
  const importData = useAchievementStore((state) => state.importData);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const definitions = useMemo(
    () => (definitionsFromStore.length > 0 ? definitionsFromStore : buildAchievementDefinitions()).map(normalizeDefinition),
    [definitionsFromStore],
  );
  const definitionsByTheme = useMemo(() => {
    const map = new Map<string, AchievementDefinition[]>();
    definitions.forEach((definition) => {
      const list = map.get(definition.theme) || [];
      list.push(definition);
      map.set(definition.theme, list);
    });
    return map;
  }, [definitions]);
  const definitionsById = useMemo(() => new Map(definitions.map((definition) => [definition.id, definition])), [definitions]);
  const unlocked = profile?.unlockedAchievements || {};
  const films = achievementManifest.films;
  const preferences = profile?.preferences || { enabled: true, showToast: true, showTopBadge: true };
  const dailySuggestions = useMemo(() => {
    return achievementManifest.themes
      .map((theme) => {
        const stats = profile?.themeStats?.[theme.style] || {};
        const themeDefinitions = definitionsByTheme.get(theme.style) || [];
        const next = nextDefinition(themeDefinitions, stats, unlocked);
        return {
          theme,
          todaySeconds: Number(stats.dailySeconds?.[summary?.today || '']) || 0,
          next,
        };
      })
      .filter((item) => item.next)
      .sort((a, b) => a.todaySeconds - b.todaySeconds)
      .slice(0, 3);
  }, [definitionsByTheme, profile?.themeStats, summary?.today, unlocked]);

  if (!drawerOpen) return null;

  const handleExport = async () => {
    const data = await exportData();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `t8-achievements-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!window.confirm('导入会覆盖当前本机成就与时长数据，确定继续吗？')) return;
      await importData(raw);
    } catch {
      window.alert('导入失败：请选择有效的成就 JSON 备份。');
    }
  };

  return (
    <div className="t8-achievement-drawer" data-canvas-floating-ui="achievement-drawer">
      <div className="t8-achievement-drawer__backdrop" onClick={closeDrawer} />
      <aside className="t8-achievement-drawer__panel" role="dialog" aria-label="主题成就">
        <header className="t8-achievement-drawer__header">
          <div>
            <div className="t8-achievement-drawer__title">
              <Trophy size={18} />
              主题成就
            </div>
            <div className="t8-achievement-drawer__subtitle">
              仅统计本机有效创作时长；后台、无焦点、长时间无操作不累计。
            </div>
          </div>
          <button type="button" className="t8-mini-icon-button" onClick={closeDrawer} title="关闭">
            <X size={16} />
          </button>
        </header>

        <nav className="t8-achievement-tabs">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'is-active' : ''}
              onClick={() => openDrawer(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="t8-achievement-drawer__body">
          {error && <div className="t8-achievement-alert">{error}</div>}
          {loading && !profile && <div className="t8-achievement-empty">正在加载成就数据...</div>}

          {activeTab === 'overview' && (
            <div className="t8-achievement-section">
              <div className="t8-achievement-kpis">
                <div>
                  <span>今日有效时长</span>
                  <strong>{formatAchievementSeconds(summary?.todaySeconds || 0)}</strong>
                </div>
                <div>
                  <span>累计时长</span>
                  <strong>{formatAchievementSeconds(summary?.totalActiveSeconds || 0)}</strong>
                </div>
                <div>
                  <span>已获成就</span>
                  <strong>{summary?.unlockedCount || 0}/{summary?.achievementCount || definitions.length}</strong>
                </div>
              </div>

              <div className="t8-achievement-card">
                <div className="t8-achievement-card__title">本地统计</div>
                <label className="t8-achievement-toggle">
                  <span>允许本地成就统计</span>
                  <input
                    type="checkbox"
                    checked={preferences.enabled}
                    onChange={(event) => void setPreferences({ enabled: event.target.checked })}
                  />
                </label>
                <label className="t8-achievement-toggle">
                  <span>显示解锁提示</span>
                  <input
                    type="checkbox"
                    checked={preferences.showToast}
                    onChange={(event) => void setPreferences({ showToast: event.target.checked })}
                  />
                </label>
                <label className="t8-achievement-toggle">
                  <span>顶部显示主题徽章数</span>
                  <input
                    type="checkbox"
                    checked={preferences.showTopBadge}
                    onChange={(event) => void setPreferences({ showTopBadge: event.target.checked })}
                  />
                </label>
              </div>

              <div className="t8-achievement-card">
                <div className="t8-achievement-card__title">今日主题建议</div>
                {dailySuggestions.length === 0 ? (
                  <div className="t8-achievement-empty">今天已经没有新的轻任务建议，继续创作就好。</div>
                ) : (
                  <div className="t8-achievement-task-list">
                    {dailySuggestions.map(({ theme, next, todaySeconds }) => (
                      <button
                        key={theme.style}
                        type="button"
                        className="t8-achievement-task"
                        onClick={() => openDrawer('themes')}
                        style={{ '--achievement-accent': theme.accent } as any}
                        title={next?.description}
                      >
                        <strong>{theme.label}</strong>
                        <span>{next?.title || '继续创作'} · 今日 {formatAchievementSeconds(todaySeconds)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="t8-achievement-actions">
                <button type="button" className="t8-btn" onClick={handleExport}>
                  <Download size={14} /> 导出
                </button>
                <button type="button" className="t8-btn" onClick={() => fileRef.current?.click()}>
                  <FileUp size={14} /> 导入
                </button>
                <button
                  type="button"
                  className="t8-btn"
                  onClick={() => {
                    if (window.confirm('确定重置本机成就与时长吗？')) void reset();
                  }}
                >
                  <RotateCcw size={14} /> 重置
                </button>
              </div>
            </div>
          )}

          {activeTab === 'themes' && (
            <div className="t8-achievement-theme-grid">
              {achievementManifest.themes.map((theme) => {
                const stats = profile?.themeStats?.[theme.style] || {};
                const themeDefinitions = definitionsByTheme.get(theme.style) || [];
                const unlockedCount = themeDefinitions.filter((definition) => unlocked[definition.id]).length;
                const next = nextDefinition(themeDefinitions, stats, unlocked);
                const progress = next ? progressFor(stats, next) : null;
                return (
                  <section key={theme.style} className="t8-achievement-theme-card" style={{ '--achievement-accent': theme.accent } as any}>
                    <div className="t8-achievement-theme-card__top">
                      <strong>{theme.label}</strong>
                      <span>{unlockedCount}/{themeDefinitions.length}</span>
                    </div>
                    <div className="t8-achievement-theme-card__time">{formatAchievementSeconds(stats.activeSeconds || 0)}</div>
                    <div className="t8-achievement-progress">
                      <span style={{ width: `${Math.round((progress?.ratio || 1) * 100)}%` }} />
                    </div>
                    <div className="t8-achievement-theme-card__next">
                      {next ? `下一枚：${next.title}` : '本阶段主题成就已全部点亮'}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {activeTab === 'medals' && (
            <div className="t8-achievement-medal-list">
              {definitions.map((definition) => {
                const isUnlocked = Boolean(unlocked[definition.id]);
                const theme = getAchievementTheme(definition.theme);
                const stats = profile?.themeStats?.[definition.theme] || {};
                const progress = progressFor(stats, definition);
                return (
                  <article key={definition.id} className={`t8-achievement-medal ${isUnlocked ? 'is-unlocked' : ''}`}>
                    <div className="t8-achievement-medal__icon">
                      {isUnlocked ? <Medal size={18} /> : <Lock size={16} />}
                    </div>
                    <div className="t8-achievement-medal__body">
                      <div className="t8-achievement-medal__title">
                        <strong>{definition.title}</strong>
                        <span>{theme.shortLabel} · {RARITY_LABEL[definition.rarity] || definition.rarity}</span>
                      </div>
                      <p>{definition.description}</p>
                      <div className="t8-achievement-progress">
                        <span style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === 'films' && (
            <div className="t8-achievement-film-list">
              {films.map((film) => {
                const unlockedFilm = profile?.unlockedFilms?.[film.id];
                const source = definitionsById.get(film.unlockAchievementId);
                const unlockedSource = Boolean(unlocked[film.unlockAchievementId]);
                return (
                  <article key={film.id} className={`t8-achievement-film ${unlockedFilm ? 'is-unlocked' : ''}`}>
                    <div className="t8-achievement-film__poster">
                      {unlockedFilm ? <Film size={28} /> : <Lock size={24} />}
                    </div>
                    <div className="t8-achievement-film__body">
                      <div className="t8-achievement-film__title">{film.title}</div>
                      <div className="t8-achievement-film__status">
                        {unlockedFilm
                          ? `已解锁 · ${unlockedFilm.unavailableText || '影片素材待提供'}`
                          : film.lockedText || '待解锁'}
                      </div>
                      <div className="t8-achievement-film__condition">
                        解锁条件：{source?.title || film.unlockAchievementId}
                        {unlockedSource && !unlockedFilm ? ' · 等待刷新' : ''}
                      </div>
                    </div>
                    <button type="button" className="t8-btn" disabled>
                      <Film size={14} /> 待提供
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </main>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImportFile} />
      </aside>
    </div>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useThemeStore } from '../stores/theme';
import { resolveThemeTemplate } from '../theme/defaultTemplates';
import { getCurrentAchievementTheme, trackAchievementEvent, useAchievementStore } from '../stores/achievements';
import { normalizeAchievementTheme } from '../data/achievementManifest';

const HEARTBEAT_MS = 15_000;
const IDLE_LIMIT_MS = 90_000;

export default function AchievementTracker() {
  const { templateId, customTemplates, style } = useThemeStore();
  const loadProfile = useAchievementStore((state) => state.loadProfile);
  const currentTheme = useMemo(() => {
    const tpl = resolveThemeTemplate(templateId, customTemplates);
    return normalizeAchievementTheme(tpl.visuals?.style || style);
  }, [customTemplates, style, templateId]);
  const lastInteractionRef = useRef(Date.now());
  const lastTickRef = useRef(Date.now());
  const previousThemeRef = useRef(currentTheme);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const markActive = () => {
      lastInteractionRef.current = Date.now();
    };
    window.addEventListener('pointerdown', markActive, { passive: true });
    window.addEventListener('keydown', markActive);
    window.addEventListener('wheel', markActive, { passive: true });
    window.addEventListener('dragstart', markActive);
    return () => {
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('wheel', markActive);
      window.removeEventListener('dragstart', markActive);
    };
  }, []);

  useEffect(() => {
    if (previousThemeRef.current === currentTheme) return;
    trackAchievementEvent({ type: 'theme.switched', theme: currentTheme });
    previousThemeRef.current = currentTheme;
    lastTickRef.current = Date.now();
  }, [currentTheme]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      const focused = typeof document === 'undefined' || document.hasFocus();
      const recentlyActive = now - lastInteractionRef.current <= IDLE_LIMIT_MS;
      if (!visible || !focused || !recentlyActive) {
        lastTickRef.current = now;
        return;
      }
      const amountSeconds = Math.max(1, Math.min(30, Math.round((now - lastTickRef.current) / 1000)));
      lastTickRef.current = now;
      trackAchievementEvent({
        type: 'theme.active_tick',
        theme: getCurrentAchievementTheme(),
        amountSeconds,
      });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}

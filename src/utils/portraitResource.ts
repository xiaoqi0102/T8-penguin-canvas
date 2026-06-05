import type { ResourceItem } from '../services/api';
import {
  buildPortraitPrompt,
  normalizePortraitLocks,
  normalizePortraitSelection,
  normalizePortraitWeights,
  portraitSelectionStats,
  resolvePortraitPreview,
  summarizePortraitSelection,
  type PortraitLanguage,
} from '../data/portraitMasterOptions.ts';
import {
  buildPortraitAdvancedPrompt,
  normalizePortraitAdvancedLocks,
  normalizePortraitAdvancedSelection,
  normalizePortraitAdvancedWeights,
  portraitAdvancedStats,
  portraitSelectionLooksUnderage,
  summarizePortraitAdvancedSelection,
} from '../data/portraitMasterAdvancedOptions.ts';

function safePortraitLanguage(value: unknown): PortraitLanguage {
  return value === 'zh' ? 'zh' : 'en';
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPortraitResourceJson(item: Pick<ResourceItem, 'kind' | 'materialSetKind' | 'materialSetItems'>): Record<string, any> | null {
  if (item.kind !== 'set' || item.materialSetKind !== 'text' || !Array.isArray(item.materialSetItems)) return null;
  const rawText = item.materialSetItems
    .map((entry) => String(entry.text || '').trim())
    .find((text) => text.includes('"t8-portrait-master"'));
  if (!rawText) return null;
  try {
    const parsed = JSON.parse(rawText);
    return isRecord(parsed) && parsed.schema === 't8-portrait-master' ? parsed : null;
  } catch {
    return null;
  }
}

export function isPortraitResourceItem(item: Pick<ResourceItem, 'kind' | 'materialSetKind' | 'materialSetItems'>): boolean {
  return !!readPortraitResourceJson(item);
}

export function portraitResourceToNodeData(item: ResourceItem): Record<string, any> | null {
  const parsed = readPortraitResourceJson(item);
  if (!parsed) return null;

  const selection = normalizePortraitSelection(parsed.selection);
  const locks = normalizePortraitLocks(parsed.locks);
  const weights = normalizePortraitWeights(parsed.weights);
  const advancedSelection = normalizePortraitAdvancedSelection(parsed.advancedSelection);
  const advancedLocks = normalizePortraitAdvancedLocks(parsed.advancedLocks);
  const advancedWeights = normalizePortraitAdvancedWeights(parsed.advancedWeights);
  const customText = typeof parsed.customText === 'string' ? parsed.customText : '';
  const language = safePortraitLanguage(parsed.language);
  const advancedHasSelection = Object.keys(advancedSelection).length > 0;
  const advancedEnabled = Boolean(parsed.advancedEnabled ?? parsed.portraitAdvancedEnabled ?? advancedHasSelection);
  const advancedBlocked = advancedEnabled && portraitSelectionLooksUnderage(selection);

  const basePrompt = buildPortraitPrompt({ selection, weights, customText: '', language });
  const advancedPrompt = advancedEnabled && !advancedBlocked
    ? buildPortraitAdvancedPrompt({ selection: advancedSelection, weights: advancedWeights, language })
    : '';
  const custom = customText.trim();
  const separator = language === 'zh' ? '，' : ', ';
  const prompt = [basePrompt, advancedPrompt, custom].filter(Boolean).join(separator);

  return {
    portraitLanguage: language,
    portraitSelection: selection,
    portraitLocks: locks,
    portraitWeights: weights,
    portraitAdvancedSelection: advancedSelection,
    portraitAdvancedLocks: advancedLocks,
    portraitAdvancedWeights: advancedWeights,
    portraitAdvancedEnabled: advancedEnabled,
    portraitCustomText: customText,
    prompt,
    text: prompt,
    outputText: prompt,
    portraitMetadata: {
      schema: 't8-portrait-master',
      version: Number(parsed.version) || 1,
      selection,
      locks,
      weights,
      advancedSelection,
      advancedLocks,
      advancedWeights,
      advancedEnabled,
      advancedBlocked,
      customText,
      language,
      prompt,
      preview: resolvePortraitPreview(selection),
      sourceResourceTitle: item.title || parsed.title || '',
    },
    portraitSummary: summarizePortraitSelection(selection, 'zh'),
    portraitStats: portraitSelectionStats(selection),
    portraitAdvancedSummary: summarizePortraitAdvancedSelection(advancedSelection, 'zh'),
    portraitAdvancedStats: portraitAdvancedStats(advancedSelection),
    yyhPortraitHidden: advancedEnabled,
    portraitSchemaVersion: Number(parsed.version) || 1,
  };
}

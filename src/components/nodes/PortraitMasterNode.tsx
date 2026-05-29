import { memo, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Handle,
  Position,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  Copy,
  Lock,
  Play,
  RotateCcw,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Unlock,
  UserRoundCog,
  X,
} from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import {
  PORTRAIT_CATEGORIES,
  PORTRAIT_GROUPS,
  PORTRAIT_OPTION_BY_ID,
  buildPortraitPrompt,
  categoryOptionCount,
  clearCategorySelection,
  normalizePortraitLocks,
  normalizePortraitSelection,
  normalizePortraitWeights,
  portraitSelectionStats,
  randomizePortraitSelection,
  resolvePortraitPreview,
  summarizePortraitSelection,
  type PortraitLanguage,
  type PortraitLocks,
  type PortraitPreviewState,
  type PortraitSelection,
  type PortraitWeights,
} from '../../data/portraitMasterOptions';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { placeSingleNode } from '../../utils/nodePlacement';
import { useUpdateNodeData } from './useUpdateNodeData';

const SCHEMA_VERSION = 1;

function safeLanguage(value: unknown): PortraitLanguage {
  return value === 'zh' ? 'zh' : 'en';
}

function promptFromState(
  selection: PortraitSelection,
  weights: PortraitWeights,
  customText: string,
  language: PortraitLanguage,
): string {
  return buildPortraitPrompt({ selection, weights, customText, language });
}

function clampWeight(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.5, Math.min(1.8, n));
}

function shadeColor(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const n = Number.parseInt(value, 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

const PreviewEye = ({ x, preview }: { x: number; preview: PortraitPreviewState }) => {
  const stroke = '#191714';
  if (preview.eyeShape === 'cat' || preview.eyeShape === 'sharp') {
    return (
      <g transform={`translate(${x} 86)`}>
        <path d="M-12 0 Q0 -8 13 0 Q1 7 -12 0Z" fill="#fff8ec" stroke={stroke} strokeWidth="2" />
        <circle cx="1" cy="0" r="4.6" fill={preview.eye} />
        <circle cx="2" cy="-2" r="1.4" fill="#fff" opacity="0.9" />
      </g>
    );
  }
  if (preview.eyeShape === 'slender') {
    return (
      <g transform={`translate(${x} 86)`}>
        <path d="M-12 0 Q0 -5 12 0 Q0 5 -12 0Z" fill="#fff8ec" stroke={stroke} strokeWidth="2" />
        <circle cx="0" cy="0" r="3.7" fill={preview.eye} />
      </g>
    );
  }
  if (preview.eyeShape === 'droopy') {
    return (
      <g transform={`translate(${x} 87)`}>
        <path d="M-11 -2 Q0 -7 11 -1 Q1 7 -11 -2Z" fill="#fff8ec" stroke={stroke} strokeWidth="2" />
        <circle cx="0" cy="0" r="4.8" fill={preview.eye} />
        <circle cx="1.5" cy="-1.8" r="1.4" fill="#fff" opacity="0.9" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} 86)`}>
      <ellipse cx="0" cy="0" rx={preview.eyeShape === 'round' ? 8.4 : 7} ry={preview.eyeShape === 'round' ? 9 : 6.8} fill="#fff8ec" stroke={stroke} strokeWidth="2" />
      <circle cx="0" cy="0" r="4.8" fill={preview.eye} />
      <circle cx="1.6" cy="-2" r="1.4" fill="#fff" opacity="0.9" />
    </g>
  );
};

const PreviewMouth = ({ preview }: { preview: PortraitPreviewState }) => {
  const stroke = '#7b3630';
  if (preview.mouth === 'smile') return <path d="M91 121 Q110 136 129 121" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />;
  if (preview.mouth === 'soft-smile') return <path d="M97 123 Q110 130 123 123" fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />;
  if (preview.mouth === 'open') return <ellipse cx="110" cy="124" rx="8" ry="5" fill={stroke} opacity="0.86" />;
  if (preview.mouth === 'smirk') return <path d="M94 123 Q111 131 128 119" fill="none" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" />;
  if (preview.mouth === 'sad') return <path d="M96 128 Q110 119 124 128" fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" />;
  return <path d="M99 124 L122 124" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />;
};

const PreviewBrow = ({ x, flip, preview }: { x: number; flip?: boolean; preview: PortraitPreviewState }) => {
  const stroke = preview.brow === 'thick' ? shadeColor(preview.hair, -35) : '#2a211c';
  const width = preview.brow === 'thick' ? 4 : 3;
  let d = 'M-11 0 Q0 -5 11 0';
  if (preview.brow === 'straight') d = 'M-11 0 L11 0';
  if (preview.brow === 'sharp') d = flip ? 'M-12 4 L12 -4' : 'M-12 -4 L12 4';
  if (preview.brow === 'arched') d = 'M-12 2 Q0 -8 12 2';
  return <path d={d} transform={`translate(${x} 69)`} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" />;
};

const PreviewAccessory = ({ preview }: { preview: PortraitPreviewState }) => {
  const stroke = '#191714';
  if (preview.animalEars) {
    return (
      <g fill={preview.hair} stroke={stroke} strokeWidth="2">
        <path d="M72 44 L84 15 L94 52Z" />
        <path d="M126 52 L136 15 L148 44Z" />
      </g>
    );
  }
  if (preview.accessory === 'ribbon') {
    return (
      <g transform="translate(145 54)" fill={preview.accent} stroke={stroke} strokeWidth="2">
        <path d="M0 0 L20 -10 L18 12Z" />
        <path d="M0 0 L-19 -10 L-17 12Z" />
        <circle r="5" />
      </g>
    );
  }
  if (preview.accessory === 'flower') {
    return (
      <g transform="translate(147 58)" fill={preview.accent} stroke={stroke} strokeWidth="1.6">
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <ellipse key={angle} rx="5" ry="9" transform={`rotate(${angle}) translate(0 -7)`} />
        ))}
        <circle r="4" fill="#fff4c4" />
      </g>
    );
  }
  if (preview.accessory === 'crown') {
    return (
      <path d="M80 42 L91 24 L104 42 L119 22 L132 42 L132 51 L80 51Z" fill={preview.accent} stroke={stroke} strokeWidth="2" />
    );
  }
  if (preview.accessory === 'hat') {
    return (
      <g fill={shadeColor(preview.outfit, 18)} stroke={stroke} strokeWidth="2">
        <ellipse cx="110" cy="48" rx="54" ry="11" />
        <path d="M77 48 Q84 19 110 20 Q136 19 143 48Z" />
      </g>
    );
  }
  if (preview.accessory === 'veil') {
    return <path d="M65 45 Q110 15 155 45 L164 148 Q110 184 56 148Z" fill="#fff" opacity="0.25" stroke="#fff" strokeWidth="2" />;
  }
  if (preview.accessory === 'headband' || preview.accessory === 'forehead') {
    return (
      <g>
        <path d="M67 60 Q110 46 153 60" fill="none" stroke={preview.accent} strokeWidth="7" strokeLinecap="round" />
        {preview.accessory === 'forehead' && <rect x="94" y="49" width="32" height="16" rx="5" fill="#c8ccd4" stroke={stroke} strokeWidth="2" />}
      </g>
    );
  }
  return null;
};

const PreviewHair = ({ preview, layer }: { preview: PortraitPreviewState; layer: 'back' | 'front' }) => {
  const hair = preview.hair;
  const stroke = shadeColor(hair, -48);
  if (layer === 'back') {
    if (preview.hairShape === 'tails') {
      return (
        <g fill={hair} stroke={stroke} strokeWidth="2">
          <path d="M67 69 C30 82 25 142 49 172 C68 150 73 111 75 73Z" />
          <path d="M145 73 C151 111 155 150 174 172 C198 142 191 82 153 69Z" />
          <circle cx="67" cy="68" r="9" fill={preview.accent} />
          <circle cx="153" cy="68" r="9" fill={preview.accent} />
        </g>
      );
    }
    if (preview.hairShape === 'bun') {
      return (
        <g fill={hair} stroke={stroke} strokeWidth="2">
          <circle cx="110" cy="38" r="24" />
          <path d="M57 61 Q110 20 163 61 Q164 132 145 164 Q110 178 75 164 Q55 132 57 61Z" />
        </g>
      );
    }
    if (preview.hairShape === 'braid') {
      return (
        <g fill={hair} stroke={stroke} strokeWidth="2">
          <path d="M58 61 Q110 22 162 61 Q164 126 145 156 Q111 170 75 156 Q56 126 58 61Z" />
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={i} cx="153" cy={110 + i * 20} rx="10" ry="13" transform={`rotate(${i % 2 ? 18 : -18} 153 ${110 + i * 20})`} />
          ))}
        </g>
      );
    }
    if (preview.hairShape === 'short' || preview.hairShape === 'bob') {
      return <path d="M61 58 Q110 20 159 58 Q171 105 152 140 Q110 162 68 140 Q49 105 61 58Z" fill={hair} stroke={stroke} strokeWidth="2" />;
    }
    if (preview.hairShape === 'updo') {
      return (
        <g fill={hair} stroke={stroke} strokeWidth="2">
          <ellipse cx="110" cy="44" rx="33" ry="22" />
          <path d="M61 63 Q110 25 159 63 Q162 112 144 139 Q110 151 76 139 Q58 112 61 63Z" />
        </g>
      );
    }
    return <path d="M57 60 Q110 18 163 60 C183 112 169 180 145 198 C132 181 123 159 110 145 C97 159 88 181 75 198 C51 180 37 112 57 60Z" fill={hair} stroke={stroke} strokeWidth="2" />;
  }

  const cap = (
    <path
      d="M62 61 Q110 21 158 61 C145 53 127 49 110 50 C93 49 75 53 62 61Z"
      fill={hair}
      stroke={stroke}
      strokeWidth="1.6"
    />
  );
  if (preview.bangs === 'none') {
    return (
      <g>
        {cap}
        <path d="M72 62 Q110 48 148 62" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
      </g>
    );
  }
  if (preview.bangs === 'straight') {
    return (
      <g>
        {cap}
        <path d="M70 57 Q110 39 150 57 L146 79 Q110 72 74 79Z" fill={hair} stroke={stroke} strokeWidth="1.6" />
      </g>
    );
  }
  if (preview.bangs === 'side') {
    return (
      <g>
        {cap}
        <path d="M67 58 Q110 31 154 58 C132 67 113 79 82 105 Q75 83 67 58Z" fill={hair} stroke={stroke} strokeWidth="1.6" />
      </g>
    );
  }
  if (preview.bangs === 'curtain') {
    return (
      <g fill={hair} stroke={stroke} strokeWidth="1.6">
        {cap}
        <path d="M70 58 Q92 37 109 47 C98 65 89 84 78 104 Q72 82 70 58Z" />
        <path d="M150 58 Q128 37 111 47 C122 65 131 84 142 104 Q148 82 150 58Z" />
      </g>
    );
  }
  if (preview.bangs === 'covered') {
    return (
      <g>
        {cap}
        <path d="M64 57 Q111 27 154 58 C128 66 112 91 89 133 Q72 103 64 57Z" fill={hair} stroke={stroke} strokeWidth="1.6" />
      </g>
    );
  }
  if (preview.bangs === 'messy') {
    return (
      <g fill={hair} stroke={stroke} strokeWidth="1.5">
        {cap}
        <path d="M69 58 L82 89 L93 54 L102 95 L113 52 L124 92 L136 56 L150 82 L151 58 Q110 37 69 58Z" />
      </g>
    );
  }
  return (
    <g>
      {cap}
      <path d="M68 58 Q110 35 152 58 C137 66 126 72 111 82 C96 72 83 66 68 58Z" fill={hair} stroke={stroke} strokeWidth="1.6" />
    </g>
  );
};

const PreviewHairlineCover = ({ preview }: { preview: PortraitPreviewState }) => {
  const stroke = shadeColor(preview.hair, -48);
  return (
    <g>
      <path
        d="M64 87 C64 54 84 34 110 34 C136 34 156 54 156 87 C142 74 127 67 110 68 C93 67 78 74 64 87Z"
        fill={preview.hair}
        stroke={stroke}
        strokeWidth="1.7"
      />
      <path
        d="M70 77 C84 64 98 58 112 59 C126 58 140 64 150 77"
        fill="none"
        stroke={shadeColor(preview.hair, -22)}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
      />
    </g>
  );
};

const PortraitAvatarPreview = ({ selection }: { selection: PortraitSelection }) => {
  const preview = resolvePortraitPreview(selection);
  const hair = selection.hairColor ? PORTRAIT_OPTION_BY_ID.get(selection.hairColor)?.label : '';
  const eyes = selection.eyes ? PORTRAIT_OPTION_BY_ID.get(selection.eyes)?.label : '';
  const outfitOptionId = selection.outfit || selection.top || '';
  const moodOptionId = selection.expression || selection.temperament || '';
  const outfit = outfitOptionId ? PORTRAIT_OPTION_BY_ID.get(outfitOptionId)?.label : '';
  const mood = moodOptionId ? PORTRAIT_OPTION_BY_ID.get(moodOptionId)?.label : '';
  const bgMix =
    preview.mood === 'cyber'
      ? `radial-gradient(circle at 50% 28%, ${preview.accent}55, transparent 36%), linear-gradient(135deg, ${preview.background}, #0d1320)`
      : preview.mood === 'dark'
        ? `radial-gradient(circle at 50% 24%, ${preview.accent}33, transparent 34%), linear-gradient(135deg, ${preview.background}, #15100f)`
        : `radial-gradient(circle at 50% 24%, color-mix(in srgb, var(--t8-accent) 22%, transparent), transparent 34%), linear-gradient(135deg, ${preview.background}44, var(--t8-bg-panel-muted))`;
  return (
    <div
      className="relative flex h-60 w-full items-center justify-center overflow-hidden rounded-xl border"
      style={{
        borderColor: 'var(--t8-border)',
        background: bgMix,
      }}
    >
      <div className="absolute left-3 top-3 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--t8-text-dim)' }}>
        Avatar
      </div>
      <svg className="absolute inset-x-0 top-5 mx-auto h-[158px] w-[214px] overflow-visible" viewBox="0 0 220 180" role="img" aria-label="肖像预览">
        <g transform="translate(-30 0)">
          <ellipse cx="110" cy="166" rx="62" ry="10" fill="#000" opacity="0.12" />
        </g>
        <g transform="translate(-14 0)">
          <path
            d="M61 174 C64 133 83 120 110 120 C137 120 156 133 159 174Z"
            fill={preview.outfit}
            stroke="#191714"
            strokeWidth="2.4"
            transform={`scale(${preview.bodyScale} 1) translate(${110 - 110 / preview.bodyScale} 0)`}
          />
        </g>
        <g transform="translate(-30 0)">
          <path d="M93 125 L127 125 L133 153 Q110 164 87 153Z" fill={shadeColor(preview.skin, -8)} stroke="#191714" strokeWidth="2" />
          <PreviewHair preview={preview} layer="back" />
          <g transform={`translate(110 88) scale(${preview.headScaleX} ${preview.headScaleY}) translate(-110 -88)`}>
            <ellipse cx="110" cy="88" rx="43" ry="53" fill={preview.skin} stroke="#191714" strokeWidth="2.6" />
            <PreviewHairlineCover preview={preview} />
            {preview.blush !== 'transparent' && (
              <g fill={preview.blush} opacity="0.36">
                <ellipse cx="78" cy="107" rx="9" ry="5" />
                <ellipse cx="142" cy="107" rx="9" ry="5" />
              </g>
            )}
            <PreviewBrow x={86} preview={preview} />
            <PreviewBrow x={134} preview={preview} flip />
            <PreviewEye x={86} preview={preview} />
            <PreviewEye x={134} preview={preview} />
            <path d="M110 91 Q105 106 111 111" fill="none" stroke="#9f6a58" strokeWidth="2" strokeLinecap="round" />
            <PreviewMouth preview={preview} />
            {preview.mark === 'scar' && <path d="M139 79 L151 91 M143 78 L149 84" stroke="#8d2e2e" strokeWidth="2" strokeLinecap="round" />}
            {preview.mark === 'tattoo' && <path d="M73 95 q9 -15 18 0 q-9 11 -18 0Z" fill="none" stroke={preview.accent} strokeWidth="2" />}
            {preview.mark === 'magic' && <path d="M146 99 l5 8 l8 1 l-7 5 l1 8 l-7 -4 l-7 4 l1 -8 l-7 -5 l8 -1Z" fill={preview.accent} opacity="0.8" />}
            {preview.mark === 'freckles' && (
              <g fill="#9a6b52" opacity="0.65">
                <circle cx="76" cy="104" r="1.4" /><circle cx="84" cy="111" r="1.2" /><circle cx="136" cy="111" r="1.2" /><circle cx="144" cy="104" r="1.4" />
              </g>
            )}
          </g>
          <PreviewHair preview={preview} layer="front" />
          <PreviewAccessory preview={preview} />
          {preview.glasses && (
            <g fill="none" stroke="#191714" strokeWidth="2">
              <circle cx="86" cy="86" r="13" />
              <circle cx="134" cy="86" r="13" />
              <path d="M99 86 H121" />
            </g>
          )}
          <g opacity="0.34" stroke="var(--t8-text-main)" strokeWidth="1">
            <path d="M48 156 C70 141 84 137 110 140 C136 137 150 141 172 156" fill="none" />
          </g>
        </g>
      </svg>
      <div className="absolute bottom-4 left-5 right-5 grid grid-cols-2 gap-1.5 text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>
        {[hair, eyes, outfit, mood].filter(Boolean).slice(0, 4).map((item) => (
          <span key={item} className="truncate rounded px-1.5 py-0.5" style={{ background: 'var(--t8-bg-panel-elevated)' }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

const PortraitMasterNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const d = (data as any) || {};

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(PORTRAIT_CATEGORIES[0]?.id || 'base');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const openEditor = useCallback(() => {
    rf.setNodes((nodes) =>
      nodes.map((node) => (node.id === id && node.selected ? { ...node, selected: false } : node)),
    );
    setIsEditorOpen(true);
  }, [id, rf]);

  const closeEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  const selection = useMemo(() => normalizePortraitSelection(d.portraitSelection), [d.portraitSelection]);
  const locks = useMemo(() => normalizePortraitLocks(d.portraitLocks), [d.portraitLocks]);
  const weights = useMemo(() => normalizePortraitWeights(d.portraitWeights), [d.portraitWeights]);
  const customText = typeof d.portraitCustomText === 'string' ? d.portraitCustomText : '';
  const language = safeLanguage(d.portraitLanguage);
  const prompt = useMemo(
    () => promptFromState(selection, weights, customText, language),
    [selection, weights, customText, language],
  );
  const stats = portraitSelectionStats(selection);
  const summary = summarizePortraitSelection(selection, 'zh');
  const activeCategory = PORTRAIT_CATEGORIES.find((item) => item.id === activeCategoryId) || PORTRAIT_CATEGORIES[0];

  const commit = useCallback(
    (patch: Record<string, any>) => {
      const nextSelection = normalizePortraitSelection(patch.portraitSelection ?? selection);
      const nextWeights = normalizePortraitWeights(patch.portraitWeights ?? weights);
      const nextCustomText = typeof patch.portraitCustomText === 'string' ? patch.portraitCustomText : customText;
      const nextLanguage = safeLanguage(patch.portraitLanguage ?? language);
      const nextPrompt = promptFromState(nextSelection, nextWeights, nextCustomText, nextLanguage);
      const portraitMetadata = {
        schema: 't8-portrait-master',
        version: SCHEMA_VERSION,
        selection: nextSelection,
        weights: nextWeights,
        customText: nextCustomText,
        language: nextLanguage,
        prompt: nextPrompt,
        preview: resolvePortraitPreview(nextSelection),
      };
      update({
        ...patch,
        prompt: nextPrompt,
        text: nextPrompt,
        outputText: nextPrompt,
        portraitMetadata,
        portraitSummary: summarizePortraitSelection(nextSelection, 'zh'),
        portraitStats: portraitSelectionStats(nextSelection),
        portraitSchemaVersion: SCHEMA_VERSION,
      });
    },
    [customText, language, selection, update, weights],
  );

  const selectOption = (groupId: string, optionId: string) => {
    const next = { ...selection };
    if (optionId) next[groupId] = optionId;
    else delete next[groupId];
    commit({ portraitSelection: next });
  };

  const toggleLock = (groupId: string) => {
    const next: PortraitLocks = { ...locks, [groupId]: !locks[groupId] };
    commit({ portraitLocks: next });
  };

  const changeWeight = (groupId: string, value: string) => {
    const next: PortraitWeights = { ...weights, [groupId]: clampWeight(value) };
    commit({ portraitWeights: next });
  };

  const clearCategory = (categoryId: string) => {
    commit({ portraitSelection: clearCategorySelection(selection, categoryId) });
  };

  const handleRandom = () => {
    const next = randomizePortraitSelection({ current: selection, locks });
    commit({ portraitSelection: next });
  };

  const handleCopy = () => {
    if (!prompt.trim() || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => undefined);
  };

  const handleRun = async () => {
    const finalPrompt = prompt.trim();
    if (!finalPrompt) {
      const msg = '请先选择肖像特征或填写补充描述';
      setError(msg);
      throw new Error(msg);
    }
    setError('');
    update({
      prompt: finalPrompt,
      text: finalPrompt,
      outputText: finalPrompt,
      portraitMetadata: {
        schema: 't8-portrait-master',
        version: SCHEMA_VERSION,
        selection,
        weights,
        customText,
        language,
        prompt: finalPrompt,
        preview: resolvePortraitPreview(selection),
      },
      status: 'success',
    });

    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const downstreamOutputIds = new Set(
      edges
        .filter((edge) => edge.source === id)
        .map((edge) => nodes.find((node) => node.id === edge.target))
        .filter((node): node is Node => !!node && node.type === 'output')
        .map((node) => node.id),
    );

    if (downstreamOutputIds.size > 0) {
      rf.setNodes((nds) =>
        nds.map((node) => {
          if (!downstreamOutputIds.has(node.id)) return node;
          const nd = (node.data as any) || {};
          if (nd.directOutputText === finalPrompt) return node;
          return { ...node, data: { ...nd, directOutputText: finalPrompt } };
        }),
      );
      return;
    }

    const me = rf.getNode(id);
    const myW = (me as any)?.measured?.width || (me as any)?.width || 560;
    const baseX = (me?.position?.x ?? 0) + myW + 80;
    const baseY = me?.position?.y ?? 0;
    const pos = placeSingleNode(baseX, baseY, 'output', nodes, { source: `placement:portrait-master-output:${id}` });
    const ts = Date.now();
    const newId = `output-auto-portrait-master-${id}-${ts}-${Math.random().toString(36).slice(2, 6)}`;
    const newNode: Node = {
      id: newId,
      type: 'output',
      position: pos,
      data: { directOutputText: finalPrompt },
      selected: false,
    } as Node;
    const newEdge: Edge = {
      id: `e-auto-portrait-master-${newId}`,
      source: id,
      target: newId,
      type: 'deletable',
    } as Edge;
    rf.addNodes(newNode);
    rf.setEdges((eds) => [...eds, newEdge]);
  };

  useRunTrigger(id, handleRun);

  const filteredOptionIds = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return null;
    return new Set(
      activeCategory.groups.flatMap((group) =>
        group.options
          .filter((option) =>
            `${option.label} ${option.labelEn} ${option.prompt}`.toLowerCase().includes(keyword),
          )
          .map((option) => option.id),
      ),
    );
  }, [activeCategory, search]);

  return (
    <div
      className={`t8-node relative w-[560px] overflow-visible transition-all ${selected ? 'ring-2 ring-pink-300' : ''}`}
      data-node-kind="portrait-master"
    >
      <Handle type="target" position={Position.Left} style={{ background: PORT_COLOR.text, border: 0 }} />
      <Handle type="source" position={Position.Right} style={{ background: PORT_COLOR.text, border: 0 }} />

      <div className="t8-node-header flex items-center gap-2 rounded-t-[inherit] px-3 py-2">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--t8-accent) 20%, transparent)', color: 'var(--t8-accent)' }}
        >
          <UserRoundCog size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black">肖像大师</div>
          <div className="truncate text-[10px]" style={{ color: 'var(--t8-text-muted)' }}>
            {stats.selected}/{stats.totalGroups} 项 · prompt 捏人系统
          </div>
        </div>
        <button
          type="button"
          className="t8-mini-icon-button nodrag nopan"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            openEditor();
          }}
          title="编辑肖像"
        >
          <SlidersHorizontal size={15} />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-[170px_1fr] gap-3">
          <PortraitAvatarPreview selection={selection} />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="t8-card p-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-bold">
                <span>角色摘要</span>
                <span style={{ color: 'var(--t8-text-dim)' }}>默认 EN prompt</span>
              </div>
              <div className="line-clamp-3 min-h-[44px] text-[11px] leading-relaxed" style={{ color: 'var(--t8-text-muted)' }}>
                {summary}
              </div>
            </div>
            <div className="t8-card flex min-h-0 flex-1 flex-col p-2">
              <div className="mb-1 text-[11px] font-bold">输出到下游 prompt</div>
              <div className="min-h-[86px] overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed" style={{ color: 'var(--t8-text-main)' }}>
                {prompt || <span style={{ color: 'var(--t8-text-dim)' }}>点击编辑或随机生成一个人物提示词...</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            className="t8-btn min-h-8 px-2 text-[11px]"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openEditor();
            }}
          >
            <SlidersHorizontal size={13} /> 编辑
          </button>
          <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" onClick={handleRandom}>
            <Shuffle size={13} /> 随机
          </button>
          <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" onClick={handleCopy} disabled={!prompt.trim()}>
            <Copy size={13} /> {copied ? '已复制' : '复制'}
          </button>
          <button type="button" className="t8-btn t8-btn-primary min-h-8 px-2 text-[11px]" onClick={handleRun}>
            <Play size={13} fill="currentColor" /> 运行
          </button>
        </div>
        {error && <div className="text-[10px]" style={{ color: 'var(--t8-danger, #ef4444)' }}>{error}</div>}
      </div>

      {isEditorOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/45 p-5"
          data-canvas-floating-ui="portrait-master-editor"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div
            className="t8-panel nodrag nopan flex max-h-[86vh] w-[1040px] max-w-[96vw] flex-col overflow-hidden"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="t8-node-header flex items-center gap-3 px-4 py-3">
              <UserRoundCog size={18} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black">肖像大师编辑器</div>
                <div className="text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>
                  每个参数 100 个可选词条；Avatar 只做方向预览，不消耗 API。
                </div>
              </div>
              <button type="button" className="t8-mini-icon-button" onClick={closeEditor} title="关闭">
                <X size={16} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[190px_1fr_300px] gap-3 overflow-hidden p-3">
              <aside className="t8-card min-h-0 overflow-y-auto p-2">
                <div className="space-y-1">
                  {PORTRAIT_CATEGORIES.map((category) => {
                    const active = category.id === activeCategory.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        className={`t8-btn w-full justify-between px-2 py-2 text-left text-[11px] ${active ? 't8-btn-primary' : ''}`}
                        onClick={() => setActiveCategoryId(category.id)}
                      >
                        <span className="truncate">{category.label}</span>
                        <span className="shrink-0 text-[10px]">{categoryOptionCount(category.id)}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <main className="flex min-h-0 flex-col gap-2 overflow-hidden">
                <div className="t8-card p-2">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black">{activeCategory.label}</div>
                      <div className="text-[11px]" style={{ color: 'var(--t8-text-muted)' }}>{activeCategory.description}</div>
                    </div>
                    <button type="button" className="t8-btn h-8 px-2 text-[11px]" onClick={() => clearCategory(activeCategory.id)}>
                      <RotateCcw size={13} /> 清空本类
                    </button>
                  </div>
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--t8-text-dim)' }} />
                    <input
                      className="t8-input h-8 w-full pl-8 pr-2 text-[11px]"
                      value={search}
                      placeholder="搜索当前大类选项..."
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-2">
                    {activeCategory.groups.map((group) => {
                      const selectedOptionId = selection[group.id] || '';
                      const selectedOption = selectedOptionId ? PORTRAIT_OPTION_BY_ID.get(selectedOptionId) : null;
                      const visibleOptions = filteredOptionIds
                        ? group.options.filter((option) => filteredOptionIds.has(option.id))
                        : group.options;
                      const options = selectedOption && !visibleOptions.some((option) => option.id === selectedOption.id)
                        ? [selectedOption, ...visibleOptions]
                        : visibleOptions;
                      const weight = weights[group.id] ?? 1;
                      return (
                        <section key={group.id} className="t8-card space-y-2 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[12px] font-black">{group.label}</div>
                              <div className="truncate text-[10px]" style={{ color: 'var(--t8-text-dim)' }}>
                                {group.labelEn} · {group.options.length} 项
                              </div>
                            </div>
                            <button
                              type="button"
                              className="t8-mini-icon-button shrink-0"
                              onClick={() => toggleLock(group.id)}
                              title={locks[group.id] ? '取消锁定' : '锁定随机'}
                            >
                              {locks[group.id] ? <Lock size={13} /> : <Unlock size={13} />}
                            </button>
                          </div>
                          <select
                            className="t8-select h-8 w-full px-2 text-[11px]"
                            value={selectedOptionId}
                            onChange={(event) => selectOption(group.id, event.target.value)}
                          >
                            <option value="">不选</option>
                            {options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label} / {option.labelEn}
                              </option>
                            ))}
                          </select>
                          <div className="grid grid-cols-[1fr_44px] items-center gap-2">
                            <input
                              className="nodrag nowheel"
                              type="range"
                              min={0.5}
                              max={1.8}
                              step={0.1}
                              value={weight}
                              onChange={(event) => changeWeight(group.id, event.target.value)}
                              disabled={!selectedOptionId}
                            />
                            <input
                              className="t8-input h-7 px-1 text-center text-[10px]"
                              value={weight.toFixed(1)}
                              onChange={(event) => changeWeight(group.id, event.target.value)}
                              disabled={!selectedOptionId}
                            />
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </main>

              <aside className="flex min-h-0 flex-col gap-2">
                <PortraitAvatarPreview selection={selection} />
                <div className="t8-card space-y-2 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-black">语言</span>
                    <select
                      className="t8-select h-8 px-2 text-[11px]"
                      value={language}
                      onChange={(event) => commit({ portraitLanguage: safeLanguage(event.target.value) })}
                    >
                      <option value="en">英文 prompt</option>
                      <option value="zh">中文 prompt</option>
                    </select>
                  </div>
                  <textarea
                    className="t8-input h-20 w-full resize-none px-2 py-1.5 text-[11px] leading-relaxed"
                    value={customText}
                    placeholder="自定义补充，会追加到最终 prompt..."
                    onChange={(event) => commit({ portraitCustomText: event.target.value })}
                  />
                </div>
                <div className="t8-card flex min-h-0 flex-1 flex-col p-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[12px] font-black">
                    <span>Prompt 预览</span>
                    <button type="button" className="t8-mini-icon-button" onClick={handleCopy} title="复制 prompt" disabled={!prompt.trim()}>
                      <Copy size={13} />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                    {prompt || <span style={{ color: 'var(--t8-text-dim)' }}>暂未选择任何词条。</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" onClick={handleRandom}>
                    <Sparkles size={13} /> 随机
                  </button>
                  <button type="button" className="t8-btn t8-btn-primary min-h-8 px-2 text-[11px]" onClick={handleRun}>
                    <Play size={13} fill="currentColor" /> 输出
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default memo(PortraitMasterNode);

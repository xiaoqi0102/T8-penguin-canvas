import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Handle,
  Position,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Link2,
  ListOrdered,
  Scissors,
  SplitSquareVertical,
  Star,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { defaultSizeOf, placeBatchNodes, type Rect as PlacementRect } from '../../utils/nodePlacement';
import {
  sanitizeTextSplitRegexFlags,
  splitText,
  TEXT_SPLIT_MODE_LABEL,
  type TextSplitMode,
  type TextSplitRegexStrategy,
} from '../../utils/textSplit';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';

const MODE_OPTIONS = Object.entries(TEXT_SPLIT_MODE_LABEL) as Array<[TextSplitMode, string]>;
const TEXT_SPLIT_PRESET_SCHEMA = 't8-text-split-presets';
const TEXT_SPLIT_ALGO_VERSION = 5;

const MODE_HELP: Record<TextSplitMode, string> = {
  line: '每一行切成一段，适合提示词列表、批量人设、逐行分镜。',
  paragraph: '按至少一个空行切成段落；普通换行会保留在同一段里，适合多行提示词块。',
  custom: '按你输入的分隔符切开，例如 ---、###、END。',
  storyboard: '自动识别 Markdown 标题、镜头/分镜/场景、Scene/Shot、内外景/日夜等分镜标题，适合整套分镜脚本。',
  regex: '用正则做高级分割或提取，适合格式固定的模板；正则错误只会在节点内提示。',
  'markdown-heading': '遇到 #、##、### 等 Markdown 标题时开始新段，标题内容会保留在段落里。',
  numbered: '只在 1.、一、镜头1、分镜二、场景3 等序号/镜头标题处开始新段，正文普通换行不拆。',
  'char-chunk': '按每段字数切长文本，优先在标点处断开；填 2 就约每 2 字一段。',
};

interface TextSplitFavorite {
  id: string;
  name: string;
  createdAt: number;
  config: Record<string, any>;
  sourceText?: string;
  segments?: string[];
}

function safeFavorites(value: unknown): TextSplitFavorite[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      id: String(item?.id || `text-split-fav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      name: String(item?.name || '未命名分段'),
      createdAt: Number(item?.createdAt || Date.now()),
      config: item?.config && typeof item.config === 'object' ? item.config : {},
      sourceText: typeof item?.sourceText === 'string' ? item.sourceText : undefined,
      segments: Array.isArray(item?.segments) ? item.segments.filter((v: any) => typeof v === 'string') : undefined,
    }))
    .slice(0, 24);
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isEdgeBetween(edge: Edge, source: string, target: string): boolean {
  return edge.source === source && edge.target === target;
}

function edgeEndpointKey(edge: Edge, nextTarget: string): string {
  const sourceHandle = (edge as any).sourceHandle ?? '';
  return `${edge.source}::${sourceHandle}::${nextTarget}`;
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function segmentLabel(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 42 ? `${oneLine.slice(0, 40)}...` : oneLine || '空段落';
}

function segmentIconButtonStyle(disabled = false): CSSProperties {
  return {
    width: 22,
    height: 22,
    minWidth: 22,
    minHeight: 22,
    maxWidth: 22,
    maxHeight: 22,
    flex: '0 0 22px',
    padding: 0,
    borderRadius: 999,
    border: '1.5px solid var(--t8-border-strong, currentColor)',
    background: disabled
      ? 'var(--t8-bg-panel-muted, rgba(148, 163, 184, 0.16))'
      : 'var(--t8-bg-panel-elevated, rgba(255, 255, 255, 0.08))',
    color: 'var(--t8-text-main, currentColor)',
    boxShadow: 'none',
    transform: 'none',
    lineHeight: 1,
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const TextSplitNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const rf = useReactFlow();
  const upstream = useUpstreamMaterials(id);
  const d = (data as any) || {};

  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [segmentDrafts, setSegmentDrafts] = useState<Record<number, string>>({});
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const autoScatterSigRef = useRef('');
  const loopStatusRef = useRef<Record<string, string>>({});
  const composingSegmentRef = useRef<number | null>(null);

  const sourceText = typeof d.sourceText === 'string' ? d.sourceText : '';
  const preferUpstream = asBool(d.preferUpstream, true);
  const upstreamText = useMemo(() => upstream.texts.map((m) => m.url).join('\n\n'), [upstream.texts]);
  const effectiveSource = preferUpstream && upstreamText.trim() ? upstreamText : sourceText;

  const mode: TextSplitMode = MODE_OPTIONS.some(([value]) => value === d.splitMode)
    ? d.splitMode
    : 'line';
  const delimiter = typeof d.delimiter === 'string' ? d.delimiter : '---';
  const chunkSize = Number.isFinite(Number(d.chunkSize)) ? Number(d.chunkSize) : 600;
  const regexPattern = typeof d.regexPattern === 'string' ? d.regexPattern : '';
  const regexFlags = typeof d.regexFlags === 'string' ? d.regexFlags : 'gm';
  const regexStrategy: TextSplitRegexStrategy = d.regexStrategy === 'match' ? 'match' : 'split';
  const removeEmpty = asBool(d.removeEmpty, true);
  const trim = asBool(d.trim, true);
  const normalizeSpaces = asBool(d.normalizeSpaces, false);
  const stripNumbering = asBool(d.stripNumbering, false);
  const prefix = typeof d.prefix === 'string' ? d.prefix : '';
  const suffix = typeof d.suffix === 'string' ? d.suffix : '';
  const favorites = useMemo(() => safeFavorites(d.textSplitFavorites), [d.textSplitFavorites]);
  const rawOverrides: string[] | null = Array.isArray(d.segmentsOverride)
    ? d.segmentsOverride.filter((v: any) => typeof v === 'string')
    : null;
  const splitInputSignature = useMemo(
    () =>
      JSON.stringify({
        splitterVersion: TEXT_SPLIT_ALGO_VERSION,
        effectiveSource,
        mode,
        delimiter,
        chunkSize,
        regexPattern,
        regexFlags: sanitizeTextSplitRegexFlags(regexFlags),
        regexStrategy,
        removeEmpty,
        trim,
        normalizeSpaces,
        stripNumbering,
        prefix,
        suffix,
      }),
    [
      effectiveSource,
      mode,
      delimiter,
      chunkSize,
      regexPattern,
      regexFlags,
      regexStrategy,
      removeEmpty,
      trim,
      normalizeSpaces,
      stripNumbering,
      prefix,
      suffix,
    ]
  );
  const overrideSignature = typeof d.segmentsOverrideSig === 'string' ? d.segmentsOverrideSig : '';

  const regexError = useMemo(() => {
    if (mode !== 'regex' || !regexPattern.trim()) return '';
    try {
      const flags = sanitizeTextSplitRegexFlags(regexFlags);
      // eslint-disable-next-line no-new
      new RegExp(regexPattern, flags);
      return '';
    } catch (err: any) {
      return err?.message ? `正则错误：${err.message}` : '正则表达式不可用';
    }
  }, [mode, regexPattern, regexFlags]);

  const computedSegments = useMemo(
    () =>
      splitText(effectiveSource, {
        mode,
        delimiter,
        chunkSize,
        regexPattern,
        regexFlags,
        regexStrategy,
        removeEmpty,
        trim,
        normalizeSpaces,
        stripNumbering,
        prefix,
        suffix,
      }),
    [
      effectiveSource,
      mode,
      delimiter,
      chunkSize,
      regexPattern,
      regexFlags,
      regexStrategy,
      removeEmpty,
      trim,
      normalizeSpaces,
      stripNumbering,
      prefix,
      suffix,
    ]
  );

  const overrides: string[] | null =
    rawOverrides && (!overrideSignature || overrideSignature === splitInputSignature) ? rawOverrides : null;
  const segments: string[] = overrides || computedSegments;
  const joinedText = segments.join('\n\n');
  const totalChars = segments.reduce((sum, s) => sum + s.length, 0);

  useEffect(() => {
    if (!rawOverrides) return;
    if (overrideSignature === splitInputSignature) return;
    if (!overrideSignature && sameArray(rawOverrides, computedSegments)) {
      update({ segmentsOverrideSig: splitInputSignature });
      return;
    }
    if (!overrideSignature && !upstreamText.trim()) return;
    update({ segmentsOverride: undefined, segmentsOverrideSig: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawOverrides, overrideSignature, splitInputSignature, computedSegments, upstreamText]);

  useEffect(() => {
    setSegmentDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const index = Number(key);
        if (!Number.isFinite(index) || segments[index] === next[index]) {
          delete next[index];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [segments]);

  useEffect(() => {
    const curSegments = Array.isArray(d.textSegments) ? d.textSegments : [];
    const next: any = {
      textSegments: segments,
      segments,
      prompt: joinedText,
      text: joinedText,
      outputText: joinedText,
      status: segments.length > 0 ? 'success' : 'idle',
      error: '',
    };
    const changed =
      !sameArray(curSegments, segments) ||
      (d.prompt || '') !== joinedText ||
      (d.text || '') !== joinedText ||
      (d.outputText || '') !== joinedText ||
      d.status !== next.status ||
      (d.error || '') !== '';
    if (changed) update(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, joinedText]);

  useEffect(() => {
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const legacyOutputIds = new Set<string>();
    for (const edge of edges) {
      if (edge.source !== id) continue;
      const target = nodes.find((node) => node.id === edge.target);
      const td = (target?.data as any) || {};
      if (target?.type === 'output' && (target.id === `output-auto-text-split-${id}` || td.autoCreatedBy === 'text-split-output')) {
        legacyOutputIds.add(target.id);
      }
    }
    if (legacyOutputIds.size === 0) return;
    rf.setNodes((nds) => nds.filter((node) => !legacyOutputIds.has(node.id)));
    rf.setEdges((eds) => eds.filter((edge) => !legacyOutputIds.has(edge.source) && !legacyOutputIds.has(edge.target)));
  }, [id, rf]);

  useEffect(() => {
    if (segments.length === 0) {
      autoScatterSigRef.current = '';
      return;
    }

    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const current = nodes.find((node) => node.id === id);
    if (!current) return;
    const loopEdge = edges.find((edge) => {
      if (edge.target !== id) return false;
      const source = nodes.find((node) => node.id === edge.source);
      return source?.type === 'loop';
    });
    if (!loopEdge) return;

    const loopNode = nodes.find((node) => node.id === loopEdge.source);
    const loopData: any = loopNode?.data || {};
    const loopStatus = String(loopData.status || 'idle');
    const prevStatus = loopStatusRef.current[loopEdge.source] || '';
    loopStatusRef.current[loopEdge.source] = loopStatus;
    if (loopStatus === 'running') {
      autoScatterSigRef.current = '';
      return;
    }
    const progress = loopData.progress || {};
    const done = Number(progress.done || 0);
    const total = Number(progress.total || 0);
    if (loopStatus !== 'success' || prevStatus !== 'running' || total <= 0 || done < total) return;

    const sig = `${loopEdge.source}:${done}/${total}:${joinedText}`;
    if (autoScatterSigRef.current === sig) return;
    autoScatterSigRef.current = sig;

    const existingAutoIds = new Set(
      nodes
        .filter((node) => {
          const nd = (node.data as any) || {};
          return nd.autoCreatedBy === 'text-split-loop-scatter' && nd.sourceTextSplitId === id;
        })
        .map((node) => node.id)
    );
    const placementNodes = nodes.filter((node) => !existingAutoIds.has(node.id));
    const size = defaultSizeOf('text');
    const baseX = current.position.x + (current.measured?.width || 500) + 80;
    const baseY = current.position.y;
    const rects: PlacementRect[] = segments.map((_, i) => ({
      x: baseX + (i % 2) * (size.w + 36),
      y: baseY + Math.floor(i / 2) * (size.h + 36),
      w: size.w,
      h: size.h,
    }));
    const offset = placeBatchNodes(rects, placementNodes, {
      excludeIds: new Set([id]),
      source: `placement:text-split-loop-scatter:${id}`,
    });
    const textNodes: Node[] = segments.map((segment, i) => ({
      id: `text-split-auto-${id}-${i}`,
      type: 'text',
      position: { x: rects[i].x + offset.dx, y: rects[i].y + offset.dy },
      data: {
        prompt: segment,
        autoCreatedBy: 'text-split-loop-scatter',
        sourceTextSplitId: id,
        textSplitIndex: i,
      },
      selected: false,
    }));
    rf.setNodes((nds) => [...nds.filter((node) => !existingAutoIds.has(node.id)), ...textNodes]);
    rf.setEdges((eds) => eds.filter((edge) => !existingAutoIds.has(edge.source) && !existingAutoIds.has(edge.target)));
    setMessage('循环完成，已自动打散文本节点');
    window.setTimeout(() => setMessage(''), 1800);
  }, [id, rf, segments, joinedText, upstream.texts]);

  const resetOverrides = (patch: Record<string, any>) => update({ ...patch, segmentsOverride: undefined, segmentsOverrideSig: undefined });

  const editSegment = (index: number, value: string) => {
    const next = [...segments];
    next[index] = value;
    update({ segmentsOverride: next, segmentsOverrideSig: splitInputSignature });
  };

  const setSegmentDraft = (index: number, value: string) => {
    setSegmentDrafts((prev) => (prev[index] === value ? prev : { ...prev, [index]: value }));
  };

  const handleSegmentInput = (index: number, value: string, isComposing = false) => {
    if (isComposing || composingSegmentRef.current === index) {
      setSegmentDraft(index, value);
      return;
    }
    editSegment(index, value);
  };

  const beginSegmentComposition = (index: number, value: string) => {
    composingSegmentRef.current = index;
    setSegmentDraft(index, value);
  };

  const endSegmentComposition = (index: number, value: string) => {
    composingSegmentRef.current = null;
    setSegmentDraft(index, value);
    editSegment(index, value);
  };

  const moveSegment = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= segments.length) return;
    const next = [...segments];
    const tmp = next[index];
    next[index] = next[to];
    next[to] = tmp;
    composingSegmentRef.current = null;
    setSegmentDrafts({});
    update({ segmentsOverride: next, segmentsOverrideSig: splitInputSignature });
  };

  const removeSegment = (index: number) => {
    composingSegmentRef.current = null;
    setSegmentDrafts({});
    update({ segmentsOverride: segments.filter((_, i) => i !== index), segmentsOverrideSig: splitInputSignature });
  };

  const copyAll = async () => {
    if (!joinedText) return;
    try {
      await navigator.clipboard?.writeText(joinedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const scatterTextNodes = () => {
    if (segments.length === 0) return;
    const current = rf.getNode(id);
    const baseX = (current?.position.x || 0) + (current?.measured?.width || 500) + 80;
    const baseY = current?.position.y || 0;
    const size = defaultSizeOf('text');
    const rects: PlacementRect[] = segments.map((_, i) => ({
      x: baseX + (i % 2) * (size.w + 36),
      y: baseY + Math.floor(i / 2) * (size.h + 36),
      w: size.w,
      h: size.h,
    }));
    const offset = placeBatchNodes(rects, rf.getNodes(), {
      excludeIds: new Set([id]),
      source: `placement:text-split:${id}`,
    });
    const ts = Date.now();
    const nodes: Node[] = segments.map((segment, i) => ({
      id: `text-split-${id}-${ts}-${i}`,
      type: 'text',
      position: { x: rects[i].x + offset.dx, y: rects[i].y + offset.dy },
      data: { prompt: segment },
      selected: false,
    }));
    rf.addNodes(nodes);
  };

  const currentConfig = () => ({
    splitMode: mode,
    delimiter,
    chunkSize,
    regexPattern,
    regexFlags: sanitizeTextSplitRegexFlags(regexFlags),
    regexStrategy,
    removeEmpty,
    trim,
    normalizeSpaces,
    stripNumbering,
    preferUpstream,
    prefix,
    suffix,
  });

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 1800);
  };

  const saveFavorite = () => {
    const fallbackName = segmentLabel(segments[0] || TEXT_SPLIT_MODE_LABEL[mode]);
    const name = window.prompt('收藏名称', fallbackName);
    if (!name) return;
    const fav: TextSplitFavorite = {
      id: `text-split-fav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim().slice(0, 60) || fallbackName,
      createdAt: Date.now(),
      config: currentConfig(),
      sourceText,
      segments: overrides ? [...segments] : undefined,
    };
    update({ textSplitFavorites: [fav, ...favorites].slice(0, 24) });
    showMessage('已收藏分段方案');
  };

  const applyFavorite = (fav: TextSplitFavorite) => {
    const patch: Record<string, any> = {
      ...fav.config,
      sourceText: typeof fav.sourceText === 'string' ? fav.sourceText : sourceText,
      segmentsOverride: Array.isArray(fav.segments) ? fav.segments : undefined,
      segmentsOverrideSig: undefined,
    };
    update(patch);
    showMessage('已应用收藏');
  };

  const deleteFavorite = (favId: string) => {
    update({ textSplitFavorites: favorites.filter((fav) => fav.id !== favId) });
  };

  const exportJson = () => {
    const payload = {
      schema: TEXT_SPLIT_PRESET_SCHEMA,
      version: 1,
      exportedAt: new Date().toISOString(),
      current: {
        sourceText,
        config: currentConfig(),
        segments: overrides ? segments : undefined,
      },
      favorites,
    };
    downloadJson(`t8-text-split-presets-${Date.now()}.json`, payload);
    showMessage('已导出 JSON');
  };

  const importJson = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload?.schema !== TEXT_SPLIT_PRESET_SCHEMA) throw new Error('不是文本分割预设 JSON');
      const incomingFavorites = safeFavorites(payload.favorites);
      const current = payload.current && typeof payload.current === 'object' ? payload.current : null;
      const merged = [...incomingFavorites, ...favorites].filter((fav, idx, arr) => arr.findIndex((x) => x.id === fav.id) === idx);
      const patch: Record<string, any> = { textSplitFavorites: merged.slice(0, 24) };
      if (current?.config && typeof current.config === 'object') Object.assign(patch, current.config);
      if (typeof current?.sourceText === 'string') patch.sourceText = current.sourceText;
      if (Array.isArray(current?.segments)) {
        patch.segmentsOverride = current.segments.filter((v: any) => typeof v === 'string');
        patch.segmentsOverrideSig = undefined;
      }
      update(patch);
      showMessage('已导入 JSON');
    } catch (err: any) {
      showMessage(err?.message || '导入失败');
    } finally {
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const createLoopChain = () => {
    const current = rf.getNode(id);
    if (!current) return;
    const nodes = rf.getNodes();
    const edges = rf.getEdges();
    const size = defaultSizeOf('loop');
    const x = current.position.x - size.w - 96;
    const y = current.position.y + 40;
    const desired: PlacementRect = { x, y, w: size.w, h: size.h };
    const upstreamLoopEdge = edges.find((edge) => {
      if (edge.target !== id) return false;
      const source = nodes.find((node) => node.id === edge.source);
      return source?.type === 'loop';
    });
    const legacyDownstreamLoopEdge = edges.find((edge) => {
      if (edge.source !== id) return false;
      const target = nodes.find((node) => node.id === edge.target);
      return target?.type === 'loop';
    });
    const existingLoopId = upstreamLoopEdge?.source || legacyDownstreamLoopEdge?.target || '';
    const isNewLoop = !existingLoopId;
    const offset = isNewLoop
      ? placeBatchNodes([desired], nodes, {
        excludeIds: new Set([id]),
        source: `placement:text-split-loop:${id}`,
      })
      : { dx: 0, dy: 0 };
    const loopId = existingLoopId || `loop-before-text-split-${id}-${Date.now()}`;
    const loopPosition = { x: desired.x + offset.dx, y: desired.y + offset.dy };
    const incomingToTextSplit = edges.filter((edge) => edge.target === id && edge.source !== loopId);
    const existingSourceLoopKeys = new Set(
      edges
        .filter((edge) => edge.target === loopId)
        .map((edge) => edgeEndpointKey(edge, loopId))
    );
    const reroutedIncomingEdges: Edge[] = incomingToTextSplit
      .filter((edge) => edge.source !== loopId && !existingSourceLoopKeys.has(edgeEndpointKey(edge, loopId)))
      .map((edge, idx) => ({
        ...edge,
        id: `edge-text-split-source-loop-${id}-${loopId}-${Date.now()}-${idx}`,
        target: loopId,
        targetHandle: undefined,
        data: { ...((edge.data as any) || {}), autoCreatedBy: 'text-split-loop-reroute' },
      } as Edge));

    const loopToTextSplitEdge: Edge = {
      id: `edge-loop-text-split-${loopId}-${id}`,
      source: loopId,
      target: id,
      type: 'deletable',
      animated: false,
      data: { autoCreatedBy: 'text-split-loop' },
    };

    const loopNode: Node = {
      id: loopId,
      type: 'loop',
      position: loopPosition,
      data: {
        kind: 'text',
        mode: 'serial',
        status: 'idle',
        progress: { done: 0, total: 0, ok: 0, fail: 0 },
        textSegments: [],
        segments: [],
      },
      selected: false,
    };

    if (isNewLoop) rf.addNodes([loopNode]);
    rf.setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== loopId) return node;
        return {
          ...node,
          position: legacyDownstreamLoopEdge ? loopPosition : node.position,
          data: { ...(node.data || {}), kind: 'text', mode: (node.data as any)?.mode || 'serial' },
        };
      })
    );
    rf.setEdges((eds) => {
      const removeIds = new Set<string>([
        ...incomingToTextSplit.map((edge) => edge.id),
        ...(legacyDownstreamLoopEdge ? [legacyDownstreamLoopEdge.id] : []),
      ]);
      const next = eds.filter((edge) => !removeIds.has(edge.id));
      const hasLoopToTextSplit = next.some((edge) => isEdgeBetween(edge, loopId, id));
      if (!hasLoopToTextSplit) next.push(loopToTextSplitEdge);
      next.push(...reroutedIncomingEdges);
      return next;
    });
    showMessage(isNewLoop ? '已创建前置循环器链路' : '已校准前置循环器链路');
  };

  return (
    <div
      className={`t8-node relative w-[760px] transition-all ${selected ? 'ring-2 ring-orange-300' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!border-0"
        style={{ background: PORT_COLOR.text }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!border-0"
        style={{ background: PORT_COLOR.text }}
      />

      <div className="t8-node-header flex items-center gap-2 px-3 py-2 rounded-t-[inherit]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-current/10">
          <SplitSquareVertical size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black leading-tight">文本分割</div>
          <div className="text-[10px] opacity-70 leading-tight">
            {segments.length} 段 · {totalChars} 字
          </div>
        </div>
        <ListOrdered size={15} className="opacity-70" />
      </div>

      <div className="p-3 text-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3">
          <div className="space-y-3">
        <section className="t8-card p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-bold opacity-70">分割方式</span>
              <select
                className="t8-select nodrag nowheel h-8 w-full px-2 text-[11px]"
                value={mode}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => resetOverrides({ splitMode: e.target.value })}
              >
                {MODE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold opacity-70">
                {mode === 'custom'
                  ? '分隔符'
                  : mode === 'char-chunk'
                    ? '每段字数'
                    : mode === 'regex'
                      ? '正则用途'
                      : '上游文本'}
              </span>
              {mode === 'custom' ? (
                <input
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  value={delimiter}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => resetOverrides({ delimiter: e.target.value })}
                />
              ) : mode === 'char-chunk' ? (
                <input
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  type="number"
                  min={1}
                  max={5000}
                  value={chunkSize}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => resetOverrides({ chunkSize: Number(e.target.value) || 600 })}
                />
              ) : mode === 'regex' ? (
                <select
                  className="t8-select nodrag nowheel h-8 w-full px-2 text-[11px]"
                  value={regexStrategy}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => resetOverrides({ regexStrategy: e.target.value })}
                >
                  <option value="split">按正则分隔</option>
                  <option value="match">提取匹配内容</option>
                </select>
              ) : (
                <button
                  type="button"
                  className={`t8-btn h-8 w-full px-2 text-[11px] ${preferUpstream ? 't8-btn-primary' : ''}`}
                  onClick={() => resetOverrides({ preferUpstream: !preferUpstream })}
                >
                  {preferUpstream ? '优先上游' : '仅手动'}
                </button>
              )}
            </label>
          </div>
          <div className="rounded-md border border-current/15 bg-current/[0.04] px-2 py-1 text-[10px] leading-relaxed opacity-75">
            {MODE_HELP[mode]}
          </div>

          {mode === 'regex' && (
            <div className="grid grid-cols-[1fr_92px] gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-bold opacity-70">正则表达式</span>
                <input
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  value={regexPattern}
                  placeholder={regexStrategy === 'match' ? '如 ^#{1,6}\\s+(.+)$' : '如 \\n-{3,}\\n'}
                  spellCheck={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => resetOverrides({ regexPattern: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold opacity-70">flags</span>
                <input
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  value={regexFlags}
                  placeholder="gm"
                  spellCheck={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => resetOverrides({ regexFlags: e.target.value })}
                />
              </label>
              {regexError && (
                <div className="col-span-2 rounded-md border border-red-400/50 bg-red-500/10 px-2 py-1 text-[10px] text-red-500">
                  {regexError}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            {[
              ['removeEmpty', removeEmpty, '去空行'],
              ['trim', trim, '修剪'],
              ['normalizeSpaces', normalizeSpaces, '压空白'],
              ['stripNumbering', stripNumbering, '去序号'],
            ].map(([key, active, label]) => (
              <button
                key={String(key)}
                type="button"
                className={`t8-btn min-h-7 px-1 text-[10px] ${active ? 't8-btn-primary' : ''}`}
                onClick={() => resetOverrides({ [String(key)]: !active })}
              >
                {String(label)}
              </button>
            ))}
          </div>
        </section>

        <section className="t8-card p-2 space-y-2">
          <div className="flex items-center gap-1.5 font-black">
            <Type size={13} />
            <span>原始文本</span>
          </div>
          <textarea
            className="t8-input nodrag nowheel h-28 w-full resize-none px-2 py-1.5 text-[11px] leading-relaxed"
            value={sourceText}
            placeholder={upstreamText ? '当前优先使用上游文本，也可在这里覆盖/备用...' : '粘贴整套提示词、分镜文本或模板...'}
            spellCheck={false}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => resetOverrides({ sourceText: e.target.value })}
          />
          {upstreamText && preferUpstream && (
            <div className="rounded-md border border-current/20 px-2 py-1 text-[10px] opacity-75">
              已读取上游文本 {upstreamText.length} 字，手动文本会作为备用保留。
            </div>
          )}
        </section>

        <section className="t8-card p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="t8-input nodrag nowheel h-8 px-2 text-[11px]"
              value={prefix}
              placeholder="每段前缀，可用 {{index}}"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => resetOverrides({ prefix: e.target.value })}
            />
            <input
              className="t8-input nodrag nowheel h-8 px-2 text-[11px]"
              value={suffix}
              placeholder="每段后缀，可用 {{total}}"
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => resetOverrides({ suffix: e.target.value })}
            />
          </div>
        </section>
          </div>

          <div className="flex h-[420px] min-h-0 flex-col gap-3">
        <section className="t8-card flex min-h-0 flex-1 flex-col overflow-hidden p-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 font-black">
              <Scissors size={13} />
              <span>分段预览</span>
            </div>
            <span className="ml-auto text-[10px] opacity-70">{segments.length} 段</span>
          </div>
          <div className="nodrag nowheel min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {segments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-current/30 px-3 py-6 text-center text-[11px] opacity-60">
                输入文本后会在这里预览分段
              </div>
            ) : (
              segments.map((segment, index) => (
                <div key={`segment-${index}`} className="rounded-lg border border-current/20 p-1.5">
                  <div className="mb-1 flex items-center gap-1 text-[10px]">
                    <span className="rounded border border-current/30 px-1 font-black">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate opacity-70">{segmentLabel(segment)}</span>
                    <span className="opacity-60">{segment.length}字</span>
                    <button
                      type="button"
                      className="nodrag nowheel inline-flex shrink-0 items-center justify-center"
                      style={segmentIconButtonStyle(index === 0)}
                      onClick={() => moveSegment(index, -1)}
                      disabled={index === 0}
                      title="上移"
                    >
                      <ArrowUp size={11} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      className="nodrag nowheel inline-flex shrink-0 items-center justify-center"
                      style={segmentIconButtonStyle(index === segments.length - 1)}
                      onClick={() => moveSegment(index, 1)}
                      disabled={index === segments.length - 1}
                      title="下移"
                    >
                      <ArrowDown size={11} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      className="nodrag nowheel inline-flex shrink-0 items-center justify-center"
                      style={segmentIconButtonStyle(false)}
                      onClick={() => removeSegment(index)}
                      title="删除"
                    >
                      <Trash2 size={11} strokeWidth={2.4} />
                    </button>
                  </div>
                  <textarea
                    className="t8-input nodrag nowheel h-14 w-full resize-none px-2 py-1 text-[11px] leading-relaxed"
                    value={segmentDrafts[index] ?? segment}
                    spellCheck={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onCompositionStart={(e) => beginSegmentComposition(index, e.currentTarget.value)}
                    onCompositionEnd={(e) => endSegmentComposition(index, e.currentTarget.value)}
                    onChange={(e) => handleSegmentInput(index, e.target.value, (e.nativeEvent as any).isComposing)}
                  />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="t8-card mt-auto p-2 space-y-2">
          <input
            ref={jsonInputRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={(e) => importJson(e.target.files?.[0])}
          />
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5 font-black">
              <Star size={13} />
              <span>分段收藏</span>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="t8-btn h-7 px-2 text-[10px]"
                onClick={saveFavorite}
              >
                <Star size={12} />
                收藏
              </button>
              <button
                type="button"
                className="t8-btn h-7 px-2 text-[10px]"
                onClick={() => jsonInputRef.current?.click()}
              >
                <Upload size={12} />
                导入
              </button>
              <button
                type="button"
                className="t8-btn h-7 px-2 text-[10px]"
                onClick={exportJson}
              >
                <Download size={12} />
                导出
              </button>
            </div>
          </div>
          {favorites.length === 0 ? (
            <div className="rounded-md border border-dashed border-current/25 px-2 py-2 text-[10px] opacity-60">
              可收藏常用分割规则、正则、前后缀和手动调整后的分段。
            </div>
          ) : (
            <div
              className="nodrag nowheel max-h-28 space-y-1 overflow-y-auto pr-1"
              onWheelCapture={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              {favorites.map((fav) => (
                <div key={fav.id} className="flex items-center gap-1 rounded-lg border border-current/20 px-1.5 py-1">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-[10px] font-bold hover:bg-current/10"
                    title={fav.name}
                    onClick={() => applyFavorite(fav)}
                  >
                    {fav.name}
                  </button>
                  <button
                    type="button"
                    className="nodrag nowheel inline-flex shrink-0 items-center justify-center"
                    style={segmentIconButtonStyle(false)}
                    onClick={() => deleteFavorite(fav.id)}
                    title="删除收藏"
                  >
                    <Trash2 size={11} strokeWidth={2.4} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {message && (
            <div className="rounded-md border border-current/20 px-2 py-1 text-[10px] opacity-75">
              {message}
            </div>
          )}
        </section>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="t8-btn min-h-9 px-2 text-[11px]"
            disabled={segments.length === 0}
            onClick={copyAll}
          >
            <Copy size={14} />
            {copied ? '已复制' : '复制全部'}
          </button>
          <button
            type="button"
            className="t8-btn min-h-9 px-2 text-[11px]"
            disabled={segments.length === 0}
            onClick={scatterTextNodes}
          >
            <Scissors size={14} />
            打散文本节点
          </button>
          <button
            type="button"
            className="t8-btn t8-btn-primary min-h-9 px-2 text-[11px]"
            disabled={segments.length === 0}
            onClick={createLoopChain}
          >
            <Link2 size={14} />
            循环器链路
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(TextSplitNode);

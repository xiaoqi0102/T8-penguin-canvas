import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  Library,
  MonitorUp,
  PackagePlus,
  Send as SendIcon,
  UploadCloud,
  UserRoundCog,
  Workflow,
  X,
} from 'lucide-react';
import type { CanvasListItem } from '../types/canvas';
import { useThemeStore } from '../stores/theme';
import type { SendTargetMode, SendableMaterial } from '../utils/sendMaterials';
import { bucketSendableMaterials, sendableMaterialSignature, summarizeSendableMaterials } from '../utils/sendMaterials';
import type { SendNodeFragment } from '../utils/sendNodeFragment';
import { sendNodeFragmentSignature, summarizeSendNodeFragment } from '../utils/sendNodeFragment';
import { coerceHistorySendMode } from '../utils/sendMode';

interface SendMaterialsModalProps {
  open: boolean;
  materials: SendableMaterial[];
  nodeFragment?: SendNodeFragment;
  sourceLabel: string;
  defaultMode?: SendTargetMode;
  canvases: CanvasListItem[];
  activeCanvasId: string | null;
  onClose: () => void;
  onSendToCanvas: (targetCanvasId: string, mode: SendTargetMode, switchAfter: boolean) => Promise<void> | void;
  onSaveToResource: (mode: SendTargetMode) => Promise<void> | void;
  onSendToEagle: () => Promise<void> | void;
  onSendToFigma: () => Promise<string | void> | string | void;
}

const MODE_OPTIONS: Array<{ value: SendTargetMode; label: string; desc: string; icon: typeof PackagePlus }> = [
  { value: 'auto', label: '智能保持', desc: '尽量按来源类型还原到目标画布', icon: MonitorUp },
  { value: 'node-fragment', label: '节点片段', desc: '复制选中节点和内部连线，保留工作流关系', icon: Workflow },
  { value: 'portrait-master', label: '肖像大师', desc: '发送可继续编辑的肖像配置节点', icon: UserRoundCog },
  { value: 'material-set', label: '合并素材集', desc: '同类型素材打包成素材集，方便继续传给生成节点', icon: PackagePlus },
  { value: 'upload', label: '上传素材', desc: '图像/视频/音频以合集上传节点出现，文本生成文本节点', icon: UploadCloud },
  { value: 'split-upload', label: '拆成多个上传', desc: '每个媒体单独一个上传节点，适合逐个调整', icon: Box },
  { value: 'output', label: '输出素材', desc: '以输出素材节点展示，适合跨画布归档结果', icon: MonitorUp },
];

function chunkModeLabel(label: string) {
  const chars = Array.from(label);
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += 2) {
    chunks.push(chars.slice(i, i + 2).join(''));
  }
  return chunks;
}

const SEND_HISTORY_KEY = 't8.sendMaterials.history.v1';
const MAX_SEND_HISTORY = 12;
const FIGMA_PLUGIN_IMPORT_HINT =
  '首次发送到 Figma：打开 Figma 桌面软件，菜单 Plugins / 插件 -> Development -> Import plugin from manifest...，选择 tools\\figma-bridge\\plugin\\manifest.json；打包版位置是应用目录 resources\\tools\\figma-bridge\\plugin\\manifest.json。导入后运行 T8 Penguin Canvas Bridge 并保持插件窗口打开。';

interface SendHistoryEntry {
  id: string;
  targetCanvasId: string;
  targetCanvasName: string;
  mode: SendTargetMode;
  modeLabel: string;
  summary: string;
  signature: string;
  materialCount: number;
  createdAt: number;
}

function isHistoryEntry(value: unknown): value is SendHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SendHistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.targetCanvasId === 'string' &&
    typeof entry.targetCanvasName === 'string' &&
    typeof entry.mode === 'string' &&
    typeof entry.modeLabel === 'string' &&
    typeof entry.summary === 'string' &&
    typeof entry.signature === 'string' &&
    typeof entry.materialCount === 'number' &&
    typeof entry.createdAt === 'number'
  );
}

function loadSendHistory(): SendHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEND_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry).slice(0, MAX_SEND_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveSendHistory(entries: SendHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEND_HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_SEND_HISTORY)));
  } catch {
    // localStorage may be disabled; the send action itself should not fail because of history.
  }
}

function formatHistoryTime(ts: number) {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

export default function SendMaterialsModal({
  open,
  materials,
  nodeFragment,
  sourceLabel,
  defaultMode = 'auto',
  canvases,
  activeCanvasId,
  onClose,
  onSendToCanvas,
  onSaveToResource,
  onSendToEagle,
  onSendToFigma,
}: SendMaterialsModalProps) {
  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const [mode, setMode] = useState<SendTargetMode>(defaultMode);
  const [targetId, setTargetId] = useState('');
  const [q, setQ] = useState('');
  const [switchAfter, setSwitchAfter] = useState(false);
  const [busy, setBusy] = useState('');
  const [actionNotice, setActionNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [sendHistory, setSendHistory] = useState<SendHistoryEntry[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSendHistory(loadSendHistory());
    setMode(defaultMode);
    setTargetId((prev) => (prev && canvases.some((canvas) => canvas.id === prev) ? prev : activeCanvasId || canvases[0]?.id || ''));
    setQ('');
    setSwitchAfter(false);
    setBusy('');
    setActionNotice(null);
    busyRef.current = false;
  }, [open, defaultMode, activeCanvasId, canvases]);

  const buckets = useMemo(() => bucketSendableMaterials(materials), [materials]);
  const summary = useMemo(() => summarizeSendableMaterials(materials), [materials]);
  const hasNodeFragment = !!nodeFragment?.nodes.length;
  const nodeSummary = useMemo(() => summarizeSendNodeFragment(nodeFragment), [nodeFragment]);
  const contentSummary = useMemo(
    () => [hasNodeFragment ? nodeSummary : '', materials.length > 0 ? summary : ''].filter(Boolean).join(' · ') || '暂无可发送内容',
    [hasNodeFragment, materials.length, nodeSummary, summary],
  );
  const signature = useMemo(
    () => (mode === 'node-fragment' ? sendNodeFragmentSignature(nodeFragment) : sendableMaterialSignature(materials)),
    [materials, mode, nodeFragment],
  );
  const hasPortraitMasterConfig = useMemo(
    () => materials.some((item) => item.sourceType === 'portrait-master' && item.sourceNodeData),
    [materials],
  );
  const modeOptions = useMemo(
    () =>
      MODE_OPTIONS.filter((opt) => {
        if (opt.value === 'node-fragment') return hasNodeFragment;
        if (opt.value === 'portrait-master') return materials.length > 0 && hasPortraitMasterConfig;
        if (!['auto', 'node-fragment'].includes(opt.value) && materials.length === 0) return false;
        return true;
      }),
    [hasNodeFragment, hasPortraitMasterConfig, materials.length],
  );
  const filteredCanvases = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return canvases;
    return canvases.filter((canvas) => canvas.name.toLowerCase().includes(keyword));
  }, [canvases, q]);
  const selectedCanvas = useMemo(
    () => canvases.find((canvas) => canvas.id === targetId) || null,
    [canvases, targetId],
  );
  const selectedMode = useMemo(
    () => modeOptions.find((opt) => opt.value === mode) || modeOptions[0] || MODE_OPTIONS[0],
    [mode, modeOptions],
  );
  const recentTargets = useMemo(() => {
    const seen = new Set<string>();
    const out: CanvasListItem[] = [];
    for (const entry of sendHistory) {
      if (seen.has(entry.targetCanvasId)) continue;
      const target = canvases.find((canvas) => canvas.id === entry.targetCanvasId);
      if (!target) continue;
      seen.add(entry.targetCanvasId);
      out.push(target);
      if (out.length >= 4) break;
    }
    return out;
  }, [canvases, sendHistory]);
  const duplicateHistory = useMemo(() => {
    if (mode === 'node-fragment') return null;
    if (!targetId || !signature) return null;
    return sendHistory.find((entry) => entry.targetCanvasId === targetId && entry.signature === signature) || null;
  }, [mode, sendHistory, signature, targetId]);

  useEffect(() => {
    if (!open) return;
    if (modeOptions.some((opt) => opt.value === mode)) return;
    setMode(modeOptions[0]?.value || 'auto');
  }, [mode, modeOptions, open]);

  if (!open) return null;

  const panelCls = isPixel
    ? 'border-2 border-[var(--px-ink)] bg-[var(--px-surface)] text-[var(--px-ink)] shadow-[4px_4px_0_var(--px-ink)]'
    : isDark
      ? 'border border-white/12 bg-zinc-950 text-zinc-100 shadow-2xl shadow-black/50'
      : 'border border-black/10 bg-white text-zinc-900 shadow-2xl shadow-black/20';
  const inputCls = isPixel
    ? 'px-input'
    : `rounded-md border px-3 py-2 text-sm outline-none ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-white/35' : 'border-black/10 bg-black/5 text-zinc-900 placeholder:text-zinc-400'}`;
  const ghostBtn = isPixel
    ? 'px-btn px-btn--sm px-btn--ghost'
    : `rounded-md border px-3 py-2 text-sm ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`;
  const primaryBtn = isPixel
    ? 'px-btn px-btn--sm px-btn--mint'
    : 'rounded-md border border-[var(--t8-primary)] bg-[var(--t8-primary)] px-3 py-2 text-sm font-semibold text-[var(--t8-on-primary)] hover:brightness-105';
  const canSendToCanvas =
    !!targetId &&
    (mode === 'node-fragment'
      ? hasNodeFragment
      : mode === 'auto'
        ? materials.length > 0 || hasNodeFragment
        : materials.length > 0);

  const runAction = async (label: string, action: () => Promise<string | void> | string | void) => {
    if (busyRef.current) return;
    try {
      busyRef.current = true;
      setBusy(label);
      setActionNotice(null);
      const message = await action();
      const defaultMessage =
        label === 'figma'
          ? '已发送到 Figma'
          : label === 'eagle'
            ? '已发送到 Eagle'
            : label === 'resource'
              ? '已保存到资源库'
              : '发送完成';
      setActionNotice({ kind: 'success', text: message || defaultMessage });
    } catch (e: any) {
      setActionNotice({ kind: 'error', text: e?.message || '操作失败' });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };
  const handleHistoryPick = (entry: SendHistoryEntry) => {
    if (!canvases.some((canvas) => canvas.id === entry.targetCanvasId)) return;
    setTargetId(entry.targetCanvasId);
    const historyMode = coerceHistorySendMode({
      historyMode: entry.mode,
      nodeCount: nodeFragment?.nodes.length || 0,
      edgeCount: nodeFragment?.edges.length || 0,
    });
    if (historyMode && modeOptions.some((opt) => opt.value === historyMode)) setMode(historyMode);
  };
  const handleSendToCanvas = async () => {
    if (!canSendToCanvas) return;
    const target = selectedCanvas || canvases.find((canvas) => canvas.id === targetId);
    const historySummary = mode === 'node-fragment' ? nodeSummary : summary;
    const entry: SendHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      targetCanvasId: targetId,
      targetCanvasName: target?.name || '未命名画布',
      mode,
      modeLabel: selectedMode.label,
      summary: historySummary,
      signature,
      materialCount: mode === 'node-fragment' ? nodeFragment?.nodes.length || 0 : materials.length,
      createdAt: Date.now(),
    };
    await onSendToCanvas(targetId, mode, switchAfter);
    const previous = loadSendHistory();
    const next = [
      entry,
      ...previous.filter(
        (old) => !(old.targetCanvasId === entry.targetCanvasId && old.signature === entry.signature && old.mode === entry.mode),
      ),
    ].slice(0, MAX_SEND_HISTORY);
    saveSendHistory(next);
  };

  return (
    <div data-canvas-floating-ui="send-materials-modal" className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={busy ? undefined : onClose} />
      <section className={`relative w-[760px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl ${panelCls}`}>
        <header className={`flex items-center justify-between gap-3 px-4 py-3 ${isPixel ? 'border-b-2 border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold">
              <SendIcon size={18} />
              <span>发送内容</span>
            </div>
            <div className="mt-1 truncate text-xs opacity-65">{sourceLabel} · {contentSummary}</div>
          </div>
          <button type="button" className="t8-mini-icon-button" title="关闭" onClick={onClose} disabled={!!busy}>
            <X size={16} />
          </button>
        </header>

        <div className="grid gap-3 p-4 md:grid-cols-[280px_1fr]">
          <aside className={`rounded-lg p-3 ${isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border border-white/10 bg-white/[0.04]' : 'border border-black/10 bg-black/[0.025]'}`}>
            <div className="text-xs font-semibold opacity-70">内容概览</div>
            {hasNodeFragment && (
              <div className={`mt-3 flex items-start gap-2 rounded-md px-2 py-2 text-xs ${isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-surface)]' : isDark ? 'border border-white/10 bg-black/25' : 'border border-black/10 bg-white'}`}>
                <Workflow size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold">节点片段</div>
                  <div className="mt-0.5 opacity-65">{nodeSummary}</div>
                </div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {(['image', 'video', 'audio', 'text'] as const).map((kind) => (
                <div key={kind} className={`rounded-md px-2 py-2 ${isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-surface)]' : isDark ? 'bg-black/25' : 'bg-white'}`}>
                  <div className="opacity-55">{kind === 'image' ? '图像' : kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '文本'}</div>
                  <div className="mt-1 text-lg font-bold">{buckets[kind].length}</div>
                </div>
              ))}
            </div>
            {materials.length > 0 ? (
              <div className="mt-3 max-h-40 space-y-1 overflow-y-auto pr-1 text-[11px] opacity-75">
                {materials.slice(0, 12).map((item, index) => (
                  <div key={`${item.id}-${index}`} className="truncate">
                    {index + 1}. {item.name || item.text || item.url || item.kind}
                  </div>
                ))}
                {materials.length > 12 && <div>还有 {materials.length - 12} 项...</div>}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-current/20 px-2 py-3 text-center text-[11px] opacity-55">
                没有独立素材，可发送节点片段到画布
              </div>
            )}

            <div className={`mt-3 rounded-lg p-2 ${isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-surface)]' : isDark ? 'border border-white/10 bg-black/20' : 'border border-black/10 bg-white'}`}>
              <div className="flex items-center gap-1.5 text-xs font-semibold opacity-75">
                <History size={13} />
                <span>发送历史</span>
              </div>
              {sendHistory.length === 0 ? (
                <div className="mt-2 rounded-md border border-dashed border-current/20 px-2 py-3 text-center text-[11px] opacity-55">
                  发送后会记录最近目标和方式
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {sendHistory.slice(0, 4).map((entry) => {
                    const disabled = !canvases.some((canvas) => canvas.id === entry.targetCanvasId);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={disabled}
                        title={disabled ? '该画布已不存在' : '恢复这个发送目标和方式'}
                        onClick={() => handleHistoryPick(entry)}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-[11px] transition ${disabled ? 'cursor-not-allowed opacity-45' : isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-muted)] hover:bg-[var(--px-yellow)]' : isDark ? 'bg-white/[0.05] hover:bg-white/10' : 'bg-black/[0.035] hover:bg-black/[0.06]'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold">{entry.targetCanvasName}</span>
                          <span className="shrink-0 opacity-55">{formatHistoryTime(entry.createdAt)}</span>
                        </div>
                        <div className="mt-0.5 truncate opacity-65">{entry.modeLabel} · {entry.summary}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <main className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">发送方式</label>
              <div className="grid grid-cols-2 gap-2">
                {modeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const active = mode === opt.value;
                  const labelChunks = chunkModeLabel(opt.label);
                  const activeCls = isPixel
                    ? 'bg-[var(--px-mint)] text-[var(--px-ink)] shadow-[3px_3px_0_var(--px-ink)] ring-2 ring-[var(--px-ink)]'
                    : 'border-[var(--t8-primary)] bg-[var(--t8-primary)] text-[var(--t8-on-primary)] shadow-lg shadow-[var(--t8-primary)]/25 ring-2 ring-[var(--t8-primary)]/35';
                  const inactiveCls = isPixel
                    ? 'bg-[var(--px-surface)] text-[var(--px-ink)] hover:bg-[var(--px-yellow)]'
                    : isDark
                      ? 'border-white/10 bg-white/5 hover:bg-white/10'
                      : 'border-black/10 bg-black/[0.03] hover:bg-black/[0.06]';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMode(opt.value)}
                      aria-pressed={active}
                      className={`relative text-left transition ${isPixel ? 'px-btn px-btn--sm' : 'rounded-md border px-3 py-2'} ${active ? activeCls : inactiveCls}`}
                    >
                      <span className="flex min-w-0 items-start gap-2 pr-12">
                        <Icon size={14} className="mt-0.5 shrink-0" />
                        <span className="grid w-10 shrink-0 gap-0.5 text-center text-sm font-semibold leading-4">
                          {labelChunks.map((chunk, index) => (
                            <span key={`${opt.value}-${index}`} className="whitespace-nowrap">
                              {chunk}
                            </span>
                          ))}
                        </span>
                        <span className="min-w-0 flex-1 pt-0.5 text-[11px] font-normal leading-4 opacity-70">{opt.desc}</span>
                      </span>
                      {active && (
                        <span className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${isPixel ? 'bg-[var(--px-ink)] text-[var(--px-surface)]' : 'bg-black/20 text-current'}`}>
                          <CheckCircle2 size={11} />
                          已选
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold opacity-70">目标画布</label>
              {recentTargets.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold opacity-60">
                    <Clock3 size={12} />
                    <span>最近发送画布</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentTargets.map((canvas) => {
                      const active = canvas.id === targetId;
                      return (
                        <button
                          key={canvas.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setTargetId(canvas.id)}
                          className={`max-w-[9rem] truncate rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? 'border-[var(--t8-primary)] bg-[var(--t8-primary)] text-[var(--t8-on-primary)]' : isPixel ? 'border-[var(--px-ink)] bg-[var(--px-surface)] hover:bg-[var(--px-yellow)]' : isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/10 bg-black/[0.04] hover:bg-black/[0.07]'}`}
                        >
                          {canvas.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="搜索画布..."
                className={`mb-2 h-9 w-full ${inputCls}`}
              />
              <div className={`max-h-36 overflow-y-auto rounded-lg ${isPixel ? 'border-2 border-[var(--px-ink)]' : isDark ? 'border border-white/10' : 'border border-black/10'}`}>
                {filteredCanvases.map((canvas) => {
                  const active = targetId === canvas.id;
                  return (
                    <button
                      key={canvas.id}
                      type="button"
                      aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${active ? 'bg-[var(--t8-primary)] font-semibold text-[var(--t8-on-primary)]' : isDark ? 'hover:bg-white/8' : 'hover:bg-black/5'}`}
                      onClick={() => setTargetId(canvas.id)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {active && <CheckCircle2 size={14} className="shrink-0" />}
                        <span className="truncate">{canvas.name}</span>
                      </span>
                      <span className="shrink-0 text-[11px] opacity-70">
                        {active ? '已选' : canvas.id === activeCanvasId ? '当前' : `${canvas.nodeCount || 0} 节点`}
                      </span>
                    </button>
                  );
                })}
                {filteredCanvases.length === 0 && <div className="px-3 py-5 text-center text-xs opacity-55">没有匹配的画布</div>}
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs opacity-75">
                <input type="checkbox" checked={switchAfter} onChange={(event) => setSwitchAfter(event.target.checked)} />
                发送后切换到目标画布
              </label>
              {duplicateHistory && (
                <div className={`mt-2 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px] ${isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-yellow)] text-[var(--px-ink)]' : isDark ? 'border border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border border-amber-300 bg-amber-50 text-amber-900'}`}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">这批素材最近已发送过</div>
                    <div className="mt-0.5 opacity-80">
                      上次：{formatHistoryTime(duplicateHistory.createdAt)} · {duplicateHistory.modeLabel}。再次发送会优先替换旧批次，避免重复堆叠。
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>

        <footer className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${isPixel ? 'border-t-2 border-[var(--px-ink)]' : isDark ? 'border-t border-white/10' : 'border-t border-black/10'}`}>
          <div className="basis-full text-xs opacity-70">
            当前选择：{selectedMode.label} → {selectedCanvas?.name || '未选择画布'}{switchAfter ? '，发送后会自动切换并定位到新内容' : ''}
          </div>
          {actionNotice && (
            <div
              className={`basis-full flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                actionNotice.kind === 'success'
                  ? isPixel
                    ? 'border-2 border-[var(--px-ink)] bg-[var(--px-mint)] text-[var(--px-ink)]'
                    : 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : isPixel
                    ? 'border-2 border-[var(--px-ink)] bg-[var(--px-yellow)] text-[var(--px-ink)]'
                    : 'border border-amber-400/35 bg-amber-500/10 text-amber-200'
              }`}
            >
              {actionNotice.kind === 'success' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
              <span className="break-all">{actionNotice.text}</span>
            </div>
          )}
          {materials.length > 0 && (
            <div
              className={`basis-full flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                isPixel
                  ? 'border-2 border-[var(--px-ink)] bg-[var(--px-yellow)] text-[var(--px-ink)]'
                  : isDark
                    ? 'border border-sky-400/30 bg-sky-500/10 text-sky-100'
                    : 'border border-sky-300 bg-sky-50 text-sky-900'
              }`}
            >
              <ExternalLink size={14} className="mt-0.5 shrink-0" />
              <span>{FIGMA_PLUGIN_IMPORT_HINT}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ghostBtn}
              disabled={!!busy || (materials.length === 0 && !hasNodeFragment)}
              title={
                mode === 'node-fragment'
                  ? '把节点片段保存为资源库工作流'
                  : materials.length > 0
                    ? '把素材保存到资源库'
                    : '请选择节点片段模式保存工作流'
              }
              onClick={() => runAction('resource', () => onSaveToResource(mode))}
            >
              <Library size={14} className="inline-block mr-1" />
              {busy === 'resource' ? '保存中...' : mode === 'node-fragment' ? '保存工作流' : '保存到资源库'}
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={!!busy || materials.length === 0}
              onClick={() => runAction('eagle', onSendToEagle)}
              title={materials.length > 0 ? '发送到本机 Eagle，需先启动 Eagle' : 'Eagle 只接收图像、视频、音频或文本素材'}
            >
              <ExternalLink size={14} className="inline-block mr-1" />
              {busy === 'eagle' ? '发送中...' : '发送到 Eagle'}
            </button>
            <button
              type="button"
              className={ghostBtn}
              disabled={!!busy || materials.length === 0}
              onClick={() => runAction('figma', onSendToFigma)}
              title={materials.length > 0 ? `发送到本机 Figma Bridge 队列：画布会自动启动本机桥接。${FIGMA_PLUGIN_IMPORT_HINT}` : 'Figma 只接收图像、视频、音频或文本素材'}
            >
              <ExternalLink size={14} className="inline-block mr-1" />
              {busy === 'figma' ? '发送中...' : '发送到 Figma'}
            </button>
          </div>
          <button
            type="button"
            className={primaryBtn}
            disabled={!!busy || !canSendToCanvas}
            onClick={() => runAction('canvas', handleSendToCanvas)}
          >
            <SendIcon size={14} className="inline-block mr-1" />
            {busy === 'canvas' ? '发送中...' : '发送到画布'}
          </button>
        </footer>
      </section>
    </div>
  );
}

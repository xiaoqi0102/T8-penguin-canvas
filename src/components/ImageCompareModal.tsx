import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Download, ImagePlus, Loader2, GitCompare, X } from 'lucide-react';
import ImageCompareStage from './ImageCompareStage';
import {
  ALIGN_OPTIONS,
  MODE_OPTIONS,
  getImageCompareStats,
  renderCompareDataUrl,
  type AlignMode,
  type CompareMode,
  type CompareStats,
  type ImageCompareCandidate,
} from '../utils/imageCompare';

interface Props {
  resultUrl: string;
  inputCandidates: ImageCompareCandidate[];
  onClose: () => void;
}

const filenameOf = (url: string) => (url.split('/').pop() || url).slice(0, 42);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export default function ImageCompareModal({ resultUrl, inputCandidates, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [manualCandidate, setManualCandidate] = useState<ImageCompareCandidate | null>(null);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [mode, setMode] = useState<CompareMode>('slider');
  const [align, setAlign] = useState<AlignMode>('contain');
  const [split, setSplit] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const [threshold, setThreshold] = useState(24);
  const [stats, setStats] = useState<CompareStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const list: ImageCompareCandidate[] = [];
    const push = (c: ImageCompareCandidate | null) => {
      if (!c?.url || seen.has(c.url) || c.url === resultUrl) return;
      seen.add(c.url);
      list.push(c);
    };
    push(manualCandidate);
    inputCandidates.forEach(push);
    return list;
  }, [inputCandidates, manualCandidate, resultUrl]);

  const selected = candidates.find((c) => c.url === selectedUrl) || candidates[0] || null;
  const hasPair = !!selected?.url && !!resultUrl;

  useEffect(() => {
    if (!selectedUrl && candidates[0]) {
      setSelectedUrl(candidates[0].url);
      return;
    }
    if (selectedUrl && candidates.length > 0 && !candidates.some((c) => c.url === selectedUrl)) {
      setSelectedUrl(candidates[0].url);
    }
  }, [candidates, selectedUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!candidates.length) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = Math.max(0, candidates.findIndex((c) => c.url === selected?.url));
        const next = e.key === 'ArrowLeft'
          ? (idx - 1 + candidates.length) % candidates.length
          : (idx + 1) % candidates.length;
        setSelectedUrl(candidates[next]?.url || '');
      }
      const n = Number(e.key);
      if (n >= 1 && n <= MODE_OPTIONS.length) setMode(MODE_OPTIONS[n - 1].value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [candidates, onClose, selected?.url]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!hasPair || !selected?.url) {
      setStats(null);
      return;
    }
    getImageCompareStats(selected.url, resultUrl, align, threshold)
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch((e: any) => {
        if (!cancelled) {
          setStats(null);
          setError(e?.message || '图像信息读取失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [align, hasPair, resultUrl, selected?.url, threshold]);

  const pickLocalImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图像文件');
      return;
    }
    try {
      const url = await readFileAsDataUrl(file);
      const next = { url, label: file.name || '手动选择' };
      setManualCandidate(next);
      setSelectedUrl(url);
      setError(null);
    } catch (e: any) {
      setError(e?.message || '图片读取失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadCompare = async () => {
    if (!selected?.url) return;
    setDownloading(true);
    setError(null);
    try {
      const dataUrl = await renderCompareDataUrl({
        before: selected.url,
        after: resultUrl,
        mode,
        align,
        split,
        opacity,
        threshold,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `t8-compare-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      setError(e?.message || '生成对比图失败');
    } finally {
      setDownloading(false);
    }
  };

  const activeValue = mode === 'overlay' ? opacity : (mode === 'heatmap' || mode === 'focus') ? threshold : split;
  const activeMax = (mode === 'heatmap' || mode === 'focus') ? 120 : 100;
  const activeLabel = mode === 'overlay' ? `透明度 ${opacity}%` : (mode === 'heatmap' || mode === 'focus') ? `阈值 ${threshold}` : `分割 ${split}%`;

  const ui = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-modal-mask p-3"
      data-canvas-floating-ui="image-compare-modal"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="t8-panel nodrag nowheel flex h-[min(88vh,780px)] w-[min(1040px,96vw)] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--t8-border)] px-4 py-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'color-mix(in srgb, var(--t8-accent) 18%, transparent)', color: 'var(--t8-accent)' }}
          >
            <GitCompare size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-[var(--t8-text-main)]">图像对比</div>
            <div className="truncate text-[11px] text-[var(--t8-text-muted)]">
              输入图 {candidates.length || 0} 张 · 结果图 {filenameOf(resultUrl)}
            </div>
          </div>
          <button className="t8-btn t8-mini-icon-button h-9 w-9 p-0" onClick={onClose} title="关闭" aria-label="关闭图像对比">
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-[170px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-hidden border-b border-[var(--t8-border)] pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-[var(--t8-text-muted)]">输入图</div>
              <button
                className="t8-btn px-2 py-1 text-[10px]"
                onClick={() => fileInputRef.current?.click()}
                title="手动选择输入图"
              >
                <ImagePlus size={12} /> 选择
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickLocalImage(e.target.files)}
              />
            </div>
            {candidates.length > 0 ? (
              <div className="flex max-h-[120px] gap-2 overflow-x-auto md:max-h-full md:flex-col md:overflow-y-auto md:overflow-x-hidden">
                {candidates.map((c, i) => {
                  const active = c.url === selected?.url;
                  return (
                    <button
                      key={`${c.url}-${i}`}
                      type="button"
                      onClick={() => setSelectedUrl(c.url)}
                      className={`min-w-[96px] overflow-hidden rounded-lg border bg-[var(--t8-bg-panel-muted)] text-left transition md:min-w-0 ${
                        active ? 'border-[var(--t8-accent)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--t8-accent)_35%,transparent)]' : 'border-[var(--t8-border)]'
                      }`}
                      title={c.label}
                    >
                      <div className="aspect-video bg-black/20">
                        <img src={c.url} alt={c.label} className="h-full w-full object-cover" draggable={false} />
                      </div>
                      <div className="truncate px-2 py-1 text-[10px] font-bold text-[var(--t8-text-main)]">
                        {c.label || `输入图 ${i + 1}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] px-3 py-4 text-[11px] text-[var(--t8-text-muted)]">
                未自动找到输入图，可以手动选择一张图进行对比。
              </div>
            )}
          </aside>

          <main className="flex min-h-0 flex-col gap-3">
            {hasPair && selected ? (
              <ImageCompareStage
                before={selected.url}
                after={resultUrl}
                mode={mode}
                align={align}
                split={split}
                opacity={opacity}
                threshold={threshold}
                className="h-[min(54vh,520px)] min-h-[260px]"
              />
            ) : (
              <div className="flex h-[min(54vh,520px)] min-h-[260px] items-center justify-center rounded-lg border border-dashed border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] text-sm text-[var(--t8-text-muted)]">
                选择一张输入图后开始对比
              </div>
            )}

            <div className="grid gap-2 lg:grid-cols-[1fr_260px]">
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {MODE_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setMode(item.value)}
                    title={item.label}
                    className={`t8-btn px-2 py-1.5 text-[11px] ${mode === item.value ? 't8-btn-primary' : ''}`}
                  >
                    {item.short}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={align}
                  onChange={(e) => setAlign(e.target.value as AlignMode)}
                  className="t8-select w-full px-2 py-1.5 text-xs"
                  title="对齐方式"
                >
                  {ALIGN_OPTIONS.map((x) => (
                    <option key={x.value} value={x.value}>{x.label}</option>
                  ))}
                </select>
                <button
                  className="t8-btn t8-btn-primary px-2 py-1.5 text-xs disabled:opacity-60"
                  onClick={downloadCompare}
                  disabled={!hasPair || downloading}
                  title="下载当前对比结果图"
                >
                  {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  下载
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold text-[var(--t8-text-muted)]">{activeLabel}</span>
                <input
                  type="range"
                  min={0}
                  max={activeMax}
                  value={activeValue}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (mode === 'overlay') setOpacity(v);
                    else if (mode === 'heatmap' || mode === 'focus') setThreshold(v);
                    else setSplit(v);
                  }}
                  className="w-full accent-orange-400"
                />
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-[10px] text-[var(--t8-text-muted)]">
                <div className="rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] px-2 py-1">
                  输入 {stats ? `${stats.imageA.width}×${stats.imageA.height}` : '-'}
                </div>
                <div className="rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] px-2 py-1">
                  结果 {stats ? `${stats.imageB.width}×${stats.imageB.height}` : '-'}
                </div>
                <div className="rounded-md border border-[var(--t8-border)] bg-[var(--t8-bg-panel-muted)] px-2 py-1">
                  变化 {stats?.changedRatio != null ? `${Math.round(stats.changedRatio * 100)}%` : '-'}
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-xs text-[var(--t8-text-main)]">
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(ui, document.body) : ui;
}

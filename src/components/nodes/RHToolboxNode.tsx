import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  AlertCircle,
  ArrowLeft,
  Layers,
  Loader2,
  Play,
  Search,
  Sparkles,
  Square,
  Wrench,
} from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { runRhToolboxTool, getRhToolboxManifest, type RunRhToolboxProgress } from '../../services/rhToolbox';
import { useThemeStore } from '../../stores/theme';
import { logBus } from '../../stores/logs';
import {
  RH_TOOLBOX_ALL_CATEGORY_ID,
  RH_TOOLBOX_CAPABILITY_LABELS,
  filterRhToolboxTools,
  listRhToolboxTools,
  normalizeRhToolboxManifest,
  type RhToolboxTool,
  type RhToolboxUserParam,
} from '../../utils/rhToolbox';
import {
  countExcludedMaterials,
  excludeMaterialId,
  filterExcludedMaterials,
  normalizeExcludedMaterialIds,
} from '../../utils/materialExclusion';
import { useHasAutoOutput } from './useHasAutoOutput';
import { useOrderedMaterials } from './useOrderedMaterials';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import MaterialPreviewSection from './MaterialPreviewSection';
import LoopingVideo from '../LoopingVideo';
import ResizableCorners from './ResizableCorners';

const handleStyle: CSSProperties = {
  width: 12,
  height: 12,
  border: 'none',
  zIndex: 20,
};

const STATUS_LABEL: Record<string, string> = {
  idle: '待命',
  submitting: '提交中',
  polling: '运行中',
  success: '已完成',
  error: '失败',
};

function capabilityLabel(capability: string): string {
  return RH_TOOLBOX_CAPABILITY_LABELS[capability] || capability;
}

function toolMatchesNodeSurface(tool: RhToolboxTool): boolean {
  return tool.ui?.showInNode !== false;
}

const RHToolboxNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const updateNodeInternals = useUpdateNodeInternals();
  const { theme, style: themeStyle } = useThemeStore();
  const isDark = theme === 'dark';
  const isLight = theme === 'light';
  const isPixel = themeStyle === 'pixel';
  const hasAutoOutput = useHasAutoOutput(id);
  const d = (data || {}) as any;

  const [manifest, setManifest] = useState(() => normalizeRhToolboxManifest(getRhToolboxManifest()));
  const enabledTools = useMemo(
    () => listRhToolboxTools(manifest).filter(toolMatchesNodeSurface),
    [manifest],
  );
  const draftTools = useMemo(
    () => listRhToolboxTools(manifest, { includeDisabled: true }).filter((tool) => !tool.enabled),
    [manifest],
  );
  const categoryId = d.rhToolboxCategoryId || RH_TOOLBOX_ALL_CATEGORY_ID;
  const query = d.rhToolboxSearchQuery || '';
  const activeToolId = d.rhToolboxActiveToolId || '';
  const activeTool = enabledTools.find((tool) => tool.id === activeToolId);
  const status = d.status || 'idle';
  const isBusy = status === 'submitting' || status === 'polling';
  const urls: string[] = Array.isArray(d.urls) ? d.urls : [];
  const imageUrls: string[] = Array.isArray(d.imageUrls) ? d.imageUrls : (d.imageUrl ? [d.imageUrl] : []);
  const videoUrls: string[] = Array.isArray(d.videoUrls) ? d.videoUrls : (d.videoUrl ? [d.videoUrl] : []);
  const audioUrls: string[] = Array.isArray(d.audioUrls) ? d.audioUrls : (d.audioUrl ? [d.audioUrl] : []);
  const outputText = String(d.outputText || '');
  const userParamValues: Record<string, string | number | boolean> = d.rhToolboxUserParams || {};
  const instanceType = d.instanceType || '';
  const [progressMessage, setProgressMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const initialSize = (d?.size && typeof d.size.w === 'number') ? d.size : { w: 360, h: 460 };
  const [size, setSize] = useState<{ w: number; h: number }>(initialSize);

  useEffect(() => {
    let disposed = false;
    const refreshManifest = () => {
      const base = getRhToolboxManifest();
      if (!import.meta.env.DEV) {
        setManifest(normalizeRhToolboxManifest(base));
        return;
      }
      import('../../utils/rhToolboxDeveloper')
        .then(({ mergeRhToolboxManifestWithDeveloperDrafts }) => {
          if (!disposed) setManifest(mergeRhToolboxManifestWithDeveloperDrafts(base));
        })
        .catch(() => {
          if (!disposed) setManifest(normalizeRhToolboxManifest(base));
        });
    };
    refreshManifest();
    window.addEventListener('penguin:rh-toolbox-manifest-updated', refreshManifest);
    return () => {
      disposed = true;
      window.removeEventListener('penguin:rh-toolbox-manifest-updated', refreshManifest);
    };
  }, []);

  const upstream = useUpstreamMaterials(id);
  const excludedMaterialIds = useMemo(
    () => normalizeExcludedMaterialIds(d?.excludedMaterialIds),
    [d?.excludedMaterialIds],
  );
  const visibleUpstreamTexts = useMemo(
    () => filterExcludedMaterials(upstream.texts, excludedMaterialIds),
    [upstream.texts, excludedMaterialIds],
  );
  const visibleUpstreamImages = useMemo(
    () => filterExcludedMaterials(upstream.images, excludedMaterialIds),
    [upstream.images, excludedMaterialIds],
  );
  const visibleUpstreamVideos = useMemo(
    () => filterExcludedMaterials(upstream.videos, excludedMaterialIds),
    [upstream.videos, excludedMaterialIds],
  );
  const visibleUpstreamAudios = useMemo(
    () => filterExcludedMaterials(upstream.audios, excludedMaterialIds),
    [upstream.audios, excludedMaterialIds],
  );
  const excludedUpstreamCount = useMemo(
    () => countExcludedMaterials(excludedMaterialIds, [...upstream.texts, ...upstream.images, ...upstream.videos, ...upstream.audios]),
    [excludedMaterialIds, upstream.texts, upstream.images, upstream.videos, upstream.audios],
  );
  const materialOrder: string[] = Array.isArray(d.materialOrder) ? d.materialOrder : [];
  const orderedTexts = useOrderedMaterials(visibleUpstreamTexts, materialOrder);
  const orderedImages = useOrderedMaterials(visibleUpstreamImages, materialOrder);
  const orderedVideos = useOrderedMaterials(visibleUpstreamVideos, materialOrder);
  const orderedAudios = useOrderedMaterials(visibleUpstreamAudios, materialOrder);

  const filteredTools = useMemo(
    () => filterRhToolboxTools(manifest, {
      categoryId,
      query,
    }).filter(toolMatchesNodeSurface),
    [manifest, categoryId, query],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tool of enabledTools) counts.set(tool.categoryId, (counts.get(tool.categoryId) || 0) + 1);
    return counts;
  }, [enabledTools]);

  const accent = activeTool?.ui?.accent || (isPixel ? 'var(--px-ink)' : isLight ? '#0891b2' : '#67e8f9');
  const bg = isPixel ? 'var(--px-surface)' : isLight ? '#ffffff' : 'rgba(18, 24, 27, 0.96)';
  const surface = isPixel ? 'var(--px-muted)' : isLight ? 'rgba(8,145,178,0.08)' : 'rgba(255,255,255,0.06)';
  const surfaceStrong = isPixel ? 'var(--px-yellow)' : isLight ? 'rgba(8,145,178,0.16)' : 'rgba(103,232,249,0.14)';
  const text = isPixel ? 'var(--px-ink)' : isLight ? '#0f172a' : '#e5f7fb';
  const subText = isPixel ? 'var(--px-ink-soft)' : isLight ? '#64748b' : 'rgba(229,247,251,0.62)';
  const border = isPixel ? 'var(--px-ink)' : isLight ? 'rgba(8,145,178,0.24)' : 'rgba(103,232,249,0.22)';
  const errorText = isPixel ? '#dc2626' : '#fca5a5';

  const rootStyle: CSSProperties = {
    background: bg,
    color: text,
    width: size.w,
    height: size.h,
    minWidth: 300,
    minHeight: 340,
    border: `2px solid ${selected ? accent : border}`,
    boxShadow: isPixel ? (selected ? '5px 5px 0 var(--px-ink)' : '3px 3px 0 var(--px-ink)') : 'var(--t8-node-shadow, 0 12px 30px rgba(0,0,0,0.28))',
    borderRadius: isPixel ? 8 : 14,
    overflow: 'visible',
  };

  const setMaterialOrder = (newOrder: string[]) => update({ materialOrder: newOrder });
  const handleExcludeUpstreamMaterial = (m: Material) => {
    if (m.origin !== 'upstream') return;
    update({
      excludedMaterialIds: excludeMaterialId(excludedMaterialIds, m.id),
      materialOrder: materialOrder.filter((itemId) => itemId !== m.id),
    });
  };
  const handleRestoreExcludedMaterials = () => update({ excludedMaterialIds: [] });

  const setActiveTool = (tool: RhToolboxTool) => {
    setProgressMessage('');
    update({
      rhToolboxActiveToolId: tool.id,
      rhToolboxUserParams: {},
      instanceType: tool.runtime?.instanceType || '',
      status: 'idle',
      taskId: '',
      urls: [],
      imageUrl: '',
      imageUrls: [],
      videoUrl: '',
      videoUrls: [],
      audioUrl: '',
      audioUrls: [],
      outputText: '',
      error: '',
    });
  };

  const setUserParam = (param: RhToolboxUserParam, value: string | number | boolean) => {
    update({
      rhToolboxUserParams: {
        ...userParamValues,
        [param.key]: value,
      },
    });
  };

  const handleRun = async () => {
    if (!activeTool) {
      update({ status: 'error', error: '请先选择 RH工具箱工具' });
      throw new Error('请先选择 RH工具箱工具');
    }
    abortRef.current?.abort();
    const aborter = new AbortController();
    abortRef.current = aborter;
    setProgressMessage('准备运行...');
    update({
      status: 'submitting',
      error: '',
      taskId: '',
      urls: [],
      imageUrl: '',
      imageUrls: [],
      videoUrl: '',
      videoUrls: [],
      audioUrl: '',
      audioUrls: [],
      outputText: '',
    });
    const source = `rh-toolbox:${id}`;
    try {
      const onProgress = (progress: RunRhToolboxProgress) => {
        setProgressMessage(progress.message);
        if (progress.taskId) update({ status: progress.stage === 'poll' ? 'polling' : 'submitting', taskId: progress.taskId });
      };
      const result = await runRhToolboxTool({
        toolId: activeTool.id,
        manifest,
        inputs: {
          texts: orderedTexts.map((m) => m.url),
          images: orderedImages.map((m) => m.url),
          videos: orderedVideos.map((m) => m.url),
          audios: orderedAudios.map((m) => m.url),
        },
        userParams: userParamValues,
        instanceType,
        signal: aborter.signal,
        onProgress,
      });
      const textOutputs = result.textOutputs.filter(Boolean);
      const textValue = textOutputs.join('\n\n');
      update({
        status: 'success',
        taskId: result.taskId,
        urls: result.urls,
        imageUrls: result.imageUrls,
        imageUrl: result.imageUrls[0] || '',
        videoUrls: result.videoUrls,
        videoUrl: result.videoUrls[0] || '',
        audioUrls: result.audioUrls,
        audioUrl: result.audioUrls[0] || '',
        outputText: textValue,
        text: textValue,
        prompt: textValue,
        texts: textOutputs,
        textSegments: textOutputs,
        raw: result.raw,
        error: '',
      });
      setProgressMessage(`完成 · ${result.urls.length} 个输出`);
      logBus.success(`${activeTool.title} 完成 · ${result.urls.length} 个输出`, source);
    } catch (error: any) {
      const message = error?.message || 'RH工具箱运行失败';
      update({ status: 'error', error: message });
      setProgressMessage('');
      logBus.error(message, source);
      throw error;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    update({ status: 'idle', error: '', taskId: '' });
    setProgressMessage('已停止');
  };

  useRunTrigger(id, async () => {
    if (isBusy) return;
    await handleRun();
  });

  const onResize = (_event: any, params: { width: number; height: number }) => {
    const next = { w: Math.round(params.width), h: Math.round(params.height) };
    setSize(next);
    update({ size: next });
    updateNodeInternals(id);
  };

  const renderHeader = () => (
    <div
      className="flex items-center gap-2 px-3 py-2 shrink-0"
      style={{
        borderBottom: `1px solid ${border}`,
        background: isPixel ? 'var(--px-surface)' : activeTool ? `${accent}1c` : surface,
        borderRadius: isPixel ? '6px 6px 0 0' : '12px 12px 0 0',
      }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 28,
          height: 28,
          borderRadius: isPixel ? 6 : 8,
          background: surfaceStrong,
          color: accent,
          border: isPixel ? `2px solid ${border}` : `1px solid ${border}`,
        }}
      >
        <Wrench size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold leading-tight truncate" style={{ fontSize: 15 }}>RH工具箱</div>
        <div className="text-[10px] truncate" style={{ color: subText }}>
          {activeTool ? `${activeTool.title} · ${activeTool.capabilities.map(capabilityLabel).join(' / ')}` : '维护者精选 RunningHub 工具'}
        </div>
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: accent, background: surface, border: `1px solid ${border}` }}>
        {STATUS_LABEL[status] || status}
      </span>
    </div>
  );

  const renderLauncher = () => (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 shrink-0 space-y-2" style={{ borderBottom: `1px solid ${border}` }}>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded nodrag" style={{ background: surface, border: `1px solid ${border}` }} onMouseDown={(e) => e.stopPropagation()}>
          <Search size={13} style={{ color: subText }} />
          <input
            value={query}
            onChange={(e) => update({ rhToolboxSearchQuery: e.target.value })}
            placeholder="搜索工具 / 能力..."
            className="nodrag nowheel flex-1 bg-transparent outline-none text-xs"
            style={{ color: text }}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto nodrag nowheel" onMouseDown={(e) => e.stopPropagation()}>
          {[{ id: RH_TOOLBOX_ALL_CATEGORY_ID, name: '全部' }, ...manifest.categories].map((category) => {
            const active = categoryId === category.id;
            const count = category.id === RH_TOOLBOX_ALL_CATEGORY_ID ? enabledTools.length : categoryCounts.get(category.id) || 0;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => update({ rhToolboxCategoryId: category.id })}
                className="nodrag shrink-0 rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: active ? accent : surface,
                  color: active ? (isPixel ? 'var(--px-surface)' : '#001018') : text,
                  border: `1px solid ${active ? accent : border}`,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {category.name} {count}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 nodrag nowheel" onMouseDown={(e) => e.stopPropagation()}>
        {enabledTools.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-4" style={{ color: subText }}>
            <Sparkles size={22} />
            <div className="text-xs font-semibold" style={{ color: text }}>暂未发布工具</div>
            <div className="text-[11px] leading-relaxed">
              当前 manifest 有 {draftTools.length} 个维护模板。填写真实 WebApp ID 并启用后，会自动出现在这里。
            </div>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px]" style={{ color: subText }}>无匹配工具</div>
        ) : (
          <div className="space-y-2">
            {filteredTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool)}
                className="nodrag w-full text-left rounded-lg p-2 transition"
                style={{ background: surface, color: text, border: `1px solid ${border}` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = surfaceStrong;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = surface;
                }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={13} style={{ color: tool.ui?.accent || accent }} />
                  <span className="flex-1 min-w-0 text-xs font-bold truncate">{tool.title}</span>
                  <span className="text-[9px]" style={{ color: subText }}>#{tool.webappId}</span>
                </div>
                <div className="text-[10px] mt-1 line-clamp-2" style={{ color: subText }}>{tool.description}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {tool.capabilities.slice(0, 4).map((capability) => (
                    <span key={capability} className="rounded px-1 py-0.5 text-[9px]" style={{ background: bg, color: subText, border: `1px solid ${border}` }}>
                      {capabilityLabel(capability)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderUserParam = (param: RhToolboxUserParam) => {
    const value = userParamValues[param.key] ?? param.defaultValue ?? (param.kind === 'boolean' ? false : '');
    const commonStyle: CSSProperties = {
      width: '100%',
      background: surface,
      color: text,
      border: `1px solid ${border}`,
      borderRadius: 6,
      padding: '5px 7px',
      fontSize: 11,
      outline: 'none',
    };
    if (param.kind === 'boolean') {
      return (
        <label key={param.key} className="flex items-center gap-2 text-[11px] nodrag" style={{ color: text }}>
          <input
            type="checkbox"
            checked={value === true || value === 'true'}
            onChange={(e) => setUserParam(param, e.target.checked)}
            style={{ accentColor: String(accent) }}
          />
          {param.label}
        </label>
      );
    }
    if (param.kind === 'select') {
      return (
        <label key={param.key} className="block text-[10px] space-y-1" style={{ color: subText }}>
          <span>{param.label}</span>
          <select
            value={String(value)}
            onChange={(e) => setUserParam(param, e.target.value)}
            className="nodrag nowheel"
            style={commonStyle}
          >
            {(param.options || []).map((option) => (
              <option key={String(option)} value={String(option)}>{String(option)}</option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label key={param.key} className="block text-[10px] space-y-1" style={{ color: subText }}>
        <span>{param.label}</span>
        <input
          type={param.kind === 'number' ? 'number' : 'text'}
          value={String(value)}
          min={param.min}
          max={param.max}
          step={param.step}
          placeholder={param.placeholder}
          onChange={(e) => setUserParam(param, param.kind === 'number' ? Number(e.target.value) : e.target.value)}
          className="nodrag nowheel"
          style={commonStyle}
        />
      </label>
    );
  };

  const renderRunner = () => {
    if (!activeTool) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-5" style={{ color: subText }}>
          <AlertCircle size={22} />
          <div className="text-xs">当前工具不可用或已被禁用</div>
          <button type="button" onClick={() => update({ rhToolboxActiveToolId: '' })} className="nodrag text-xs px-3 py-1 rounded" style={{ background: surface, color: text, border: `1px solid ${border}` }}>
            返回工具列表
          </button>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 shrink-0 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
          <button
            type="button"
            onClick={() => update({ rhToolboxActiveToolId: '' })}
            className="nodrag flex items-center gap-1 rounded px-2 py-1 text-[11px]"
            style={{ background: surface, color: text, border: `1px solid ${border}` }}
          >
            <ArrowLeft size={12} /> 列表
          </button>
          <div className="flex-1 min-w-0 text-[10px] truncate" style={{ color: subText }}>
            {activeTool.inputSchema.map((input) => `${input.label || input.key}:${input.kind}`).join(' · ')}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 nodrag nowheel" onMouseDown={(e) => e.stopPropagation()}>
          <MaterialPreviewSection
            texts={orderedTexts}
            images={orderedImages}
            videos={orderedVideos}
            audios={orderedAudios}
            order={materialOrder}
            onReorder={setMaterialOrder}
            onExcludeUpstream={handleExcludeUpstreamMaterial}
            excludedCount={excludedUpstreamCount}
            onRestoreExcluded={handleRestoreExcludedMaterials}
            isDark={isDark}
            isPixel={isPixel}
            title="上游素材 · 工具输入"
          />
          {(activeTool.userParams || []).length > 0 && (
            <div className="space-y-2 rounded-lg p-2" style={{ background: surface, border: `1px solid ${border}` }}>
              <div className="flex items-center gap-1 text-[11px] font-bold" style={{ color: text }}>
                <Layers size={12} /> 参数
              </div>
              {(activeTool.userParams || []).map(renderUserParam)}
            </div>
          )}
          <label className="block text-[10px] space-y-1" style={{ color: subText }}>
            <span>实例类型</span>
            <select
              value={instanceType}
              onChange={(e) => update({ instanceType: e.target.value })}
              className="nodrag nowheel"
              style={{ width: '100%', background: surface, color: text, border: `1px solid ${border}`, borderRadius: 6, padding: '5px 7px', fontSize: 11 }}
            >
              <option value="">默认</option>
              <option value="plus">plus</option>
              <option value="pro">pro</option>
            </select>
          </label>

          {isBusy ? (
            <button type="button" onClick={handleStop} className="nodrag w-full flex items-center justify-center gap-1.5 rounded py-2 text-xs font-bold" style={{ background: surface, color: text, border: `1px solid ${border}` }}>
              <Square size={12} /> 停止
            </button>
          ) : (
            <button type="button" onClick={() => { void handleRun().catch(() => undefined); }} className="nodrag w-full flex items-center justify-center gap-1.5 rounded py-2 text-xs font-bold" style={{ background: accent, color: isPixel ? 'var(--px-surface)' : '#001018', border: `1px solid ${accent}` }}>
              <Play size={12} fill="currentColor" /> 运行工具
            </button>
          )}

          {progressMessage && (
            <div className="flex items-center gap-1 text-[10px]" style={{ color: accent }}>
              {isBusy && <Loader2 size={11} className="animate-spin" />}
              <span className="flex-1">{progressMessage}</span>
              {d.taskId && <span style={{ color: subText }}>{String(d.taskId).slice(0, 10)}…</span>}
            </div>
          )}

          {d.error && (
            <div className="flex items-start gap-1 rounded px-2 py-1 text-[10px]" style={{ color: errorText, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
              <AlertCircle size={11} className="mt-0.5 shrink-0" />
              <span className="break-all">{d.error}</span>
            </div>
          )}

          {!hasAutoOutput && (imageUrls.length > 0 || videoUrls.length > 0 || audioUrls.length > 0 || outputText) && (
            <div className="space-y-2 pt-2" style={{ borderTop: `1px solid ${border}` }}>
              {imageUrls.map((url, index) => <img key={`${url}-${index}`} src={url} alt="RH工具箱输出" className="w-full rounded object-contain" />)}
              {videoUrls.map((url, index) => <LoopingVideo key={`${url}-${index}`} src={url} controls className="w-full rounded" />)}
              {audioUrls.map((url, index) => <audio key={`${url}-${index}`} src={url} controls className="w-full h-8" />)}
              {outputText && <div className="rounded p-2 text-[11px] whitespace-pre-wrap" style={{ background: surface, border: `1px solid ${border}`, color: text }}>{outputText}</div>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col" style={rootStyle}>
      <Handle type="target" position={Position.Left} className="!border-0" style={{ ...handleStyle, background: PORT_COLOR.any, left: -6 }} />
      <Handle type="source" position={Position.Right} className="!border-0" style={{ ...handleStyle, background: PORT_COLOR.any, right: -6 }} />
      <ResizableCorners
        selected={selected}
        minWidth={300}
        minHeight={340}
        accent={String(accent)}
        onResize={onResize}
        onResizeEnd={onResize}
      />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ borderRadius: isPixel ? 6 : 12 }}>
        {renderHeader()}
        {activeToolId ? renderRunner() : renderLauncher()}
      </div>
    </div>
  );
};

export default memo(RHToolboxNode);

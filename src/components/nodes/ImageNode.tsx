import { memo, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { AlertCircle, Image as ImageIcon, Loader2, Plus, Sparkles, X } from 'lucide-react';
import {
  IMAGE_MODELS,
  FAL_REGISTRY,
  GPT_FAL_SIZES,
  NBPRO_FAL_RATIOS,
  NBPRO_FAL_RESOLUTIONS,
  isFalModel,
} from '../../providers/models';
import {
  submitImageAsync,
  queryImageStatus,
  submitImageFal,
  queryImageFal,
  uploadFile,
} from '../../services/generation';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useThemeStore } from '../../stores/theme';
import { logBus } from '../../stores/logs';

/**
 * ImageNode - 图像生成(ZhenzhenMagic)
 * 多 TAB 切换:GPT2 / 香蕉2 / 香蕉Pro,参数与主项目 gpt-image-2-web 对齐
 * 参数:模型 TAB / 比例 / 尺寸 / 多张参考图 / 本地 prompt
 * 上游 text 节点 → prompt(优先);上游 image 节点 → 参考图(并入 references)
 */
const ImageNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const { getEdges, getNodes } = useReactFlow();
  const { style } = useThemeStore();
  const isPixel = style === 'pixel';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const d = data as any;
  const model = d?.model || IMAGE_MODELS[0].id;
  const modelDef = useMemo(() => IMAGE_MODELS.find((m) => m.id === model) || IMAGE_MODELS[0], [model]);

  const aspectRatio = d?.aspectRatio || modelDef.defaultAspectRatio;
  const sizeLevel = d?.sizeLevel || modelDef.defaultSize;
  // 子模型变体(对齐 gpt-image-2-web 的 g_model/n_model)
  const apiModel = d?.apiModel || modelDef.apiModel;

  // ========== FAL 渠道识别及参数(不影响其他模型) ==========
  const isFal = isFalModel(apiModel);
  const falDef = isFal ? FAL_REGISTRY[apiModel] : undefined;
  const falKind = falDef?.paramKind; // 'gpt-fal' | 'nbpro-fal'
  // FAL 参数(默认对齐主项目初始值)
  // gpt-fal: mode/size/quality/n/format/sync/customW/customH
  const falMode: 'edit' | 'gen' = d?.falMode || 'edit';
  const falSize: string = d?.falSize || 'auto';
  const falCustomW: number = d?.falCustomW ?? 1280;
  const falCustomH: number = d?.falCustomH ?? 1280;
  const falQuality: 'low' | 'medium' | 'high' | 'auto' = d?.falQuality || 'medium';
  const falN: number = d?.falN ?? 1;
  const falFormat: 'png' | 'jpeg' | 'webp' = d?.falFormat || 'png';
  const falSync: boolean = d?.falSync === true;
  // nbpro-fal: aspect_ratio/resolution/safety/imgMode/webSearch/sysPrompt/seed
  const nbAspect: string = d?.nbAspect || 'auto';
  const nbResolution: string = d?.nbResolution || '2K';
  const nbSafety: string = d?.nbSafety || '4';
  const nbImgMode: 'image_url' | 'base64' = d?.nbImgMode || 'image_url';
  const nbWebSearch: boolean = d?.nbWebSearch === true;
  const nbSysPrompt: string = d?.nbSysPrompt || '';
  const nbSeed: number = d?.nbSeed ?? 0;

  // 参考图上限(FAL 使用 FAL_REGISTRY.maxRefs,其他走原设计)
  const maxRefs = falDef?.maxRefs ?? modelDef.maxReferenceImages;
  const status: 'idle' | 'generating' | 'success' | 'error' = d?.status || 'idle';
  const imageUrl = d?.imageUrl as string | undefined;
  const localPrompt = d?.prompt || '';
  // 节点内本地上传的参考图(除了上游接入的,这里是手动上传)
  const refImages: string[] = Array.isArray(d?.referenceImages) ? d.referenceImages : [];

  // 切换模型时,如果当前比例/尺寸不在新模型选项里则重置
  const switchModel = (mId: string) => {
    const newDef = IMAGE_MODELS.find((m) => m.id === mId) || IMAGE_MODELS[0];
    const patch: any = { model: mId, apiModel: newDef.apiModel };
    if (!newDef.aspectRatios.includes(aspectRatio)) patch.aspectRatio = newDef.defaultAspectRatio;
    if (!newDef.sizes.includes(sizeLevel)) patch.sizeLevel = newDef.defaultSize;
    update(patch);
  };

  // 从上游节点收集 prompt + 参考图(多张)
  const collectUpstream = (): { prompt: string; images: string[] } => {
    const edges = getEdges();
    const nodes = getNodes();
    const upstreamIds = edges.filter((e) => e.target === id).map((e) => e.source);
    const prompts: string[] = [];
    const images: string[] = [];
    for (const uid of upstreamIds) {
      const n = nodes.find((x) => x.id === uid);
      const p = (n?.data as any)?.prompt;
      if (p && typeof p === 'string') prompts.push(p.trim());
      const u = (n?.data as any)?.imageUrl;
      if (u && typeof u === 'string' && images.length < modelDef.maxReferenceImages) images.push(u);
      const us = (n?.data as any)?.imageUrls;
      if (Array.isArray(us)) {
        for (const it of us) if (typeof it === 'string' && images.length < modelDef.maxReferenceImages) images.push(it);
      }
    }
    return { prompt: prompts.join('\n').trim(), images };
  };

  // 手动上传参考图
  const handlePickFile = () => fileInputRef.current?.click();
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError(null);
    try {
      const remain = maxRefs - refImages.length;
      const accepted = files.slice(0, Math.max(0, remain));
      const uploaded: string[] = [];
      for (const f of accepted) {
        const r = await uploadFile(f);
        uploaded.push(r.url);
      }
      update({ referenceImages: [...refImages, ...uploaded] });
    } catch (err: any) {
      setError(err?.message || '上传失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const removeRef = (idx: number) => {
    update({ referenceImages: refImages.filter((_, i) => i !== idx) });
  };

  const handleGenerate = async () => {
    setError(null);
    const { prompt: upstreamPrompt, images: upstreamImages } = collectUpstream();
    const finalPrompt = (upstreamPrompt || localPrompt || '').trim();
    const src = `image:${id.slice(0, 6)}`;
    if (!finalPrompt) {
      setError('未连接 text 节点也未填写 prompt');
      logBus.error('生成中止: 缺少 prompt', src);
      return;
    }
    update({ status: 'generating', progress: '0%', error: null });
    try {
      const allRefs = [...refImages, ...upstreamImages].slice(0, maxRefs);

      // ============ FAL 路径(对齐 gpt-image-2-web runGPTFal / runNanoFal) ============
      if (isFal && falDef) {
        const sizeDesc = falKind === 'gpt-fal'
          ? (falSize === 'custom' ? `${falCustomW}×${falCustomH}` : falSize)
          : `${nbAspect}/${nbResolution}`;
        logBus.info(
          `FAL提交: model=${apiModel} kind=${falKind} size=${sizeDesc} 参考图=${allRefs.length} prompt="${finalPrompt.slice(0, 60)}${finalPrompt.length > 60 ? '…' : ''}"`,
          src,
        );
        const submit = await submitImageFal({
          apiModel,
          prompt: finalPrompt,
          images: allRefs,
          n: falKind === 'gpt-fal' ? falN : (d?.falN ?? 1),
          format: falFormat,
          sync: falSync,
          // gpt-fal
          mode: falKind === 'gpt-fal' ? falMode : undefined,
          size: falKind === 'gpt-fal' ? falSize : undefined,
          customW: falKind === 'gpt-fal' && falSize === 'custom' ? falCustomW : undefined,
          customH: falKind === 'gpt-fal' && falSize === 'custom' ? falCustomH : undefined,
          quality: falKind === 'gpt-fal' ? falQuality : undefined,
          // nbpro-fal
          aspect_ratio: falKind === 'nbpro-fal' ? nbAspect : undefined,
          resolution: falKind === 'nbpro-fal' ? nbResolution : undefined,
          safety_tolerance: falKind === 'nbpro-fal' ? nbSafety : undefined,
          seed: falKind === 'nbpro-fal' && nbSeed > 0 ? nbSeed : undefined,
          system_prompt: falKind === 'nbpro-fal' ? nbSysPrompt : undefined,
          enable_web_search: falKind === 'nbpro-fal' ? nbWebSearch : undefined,
          image_mode: falKind === 'nbpro-fal' ? nbImgMode : undefined,
        });

        // 同步完成
        if (submit.sync && submit.urls && submit.urls.length) {
          logBus.success(`FAL同步返回 → ${submit.urls[0]}`, src);
          update({
            status: 'success',
            progress: '100%',
            imageUrl: submit.urls[0],
            lastPrompt: finalPrompt,
            usedI2I: allRefs.length > 0,
          });
          return;
        }

        // 异步轮询(主项目默认 maxPoll=1200, pollInt=3s; 这里按 2h 上限会太长,采用 600×3s=30min)
        const { requestId, responseUrl, endpoint } = submit;
        if (!requestId || !responseUrl) throw new Error('FAL 提交后未获得 request_id/response_url');
        logBus.info(`FAL异步任务已提交 requestId=${requestId}`, src);
        update({
          progress: '5%',
          taskId: requestId,
          falResponseUrl: responseUrl,
          falEndpoint: endpoint,
        });
        const maxPoll = 600;
        const interval = 3000;
        for (let i = 0; i < maxPoll; i++) {
          await new Promise((r) => setTimeout(r, interval));
          const q = await queryImageFal({ responseUrl, endpoint, requestId });
          const st = String(q.status || '').toLowerCase();
          if (st === 'completed') {
            const url = q.urls?.[0];
            if (!url) throw new Error('FAL 任务完成但未返回图片');
            logBus.success(`FAL 任务完成 → ${url}`, src);
            update({
              status: 'success',
              progress: '100%',
              imageUrl: url,
              lastPrompt: finalPrompt,
              usedI2I: allRefs.length > 0,
            });
            return;
          }
          if (st === 'failed') {
            throw new Error(q.error || 'FAL 任务失败');
          }
          // 进度估算(15% 起步,到 95% 上限)
          const pct = Math.min(95, 15 + Math.floor((i / maxPoll) * 80));
          if (i % 5 === 4) {
            update({ progress: `${pct}%` });
            logBus.debug(`[${i + 1}/${maxPoll}] FAL 轮询 status=${q.falStatus || 'IN_QUEUE'}`, src);
          }
        }
        throw new Error(`FAL 超时: ${(maxPoll * interval) / 1000}s 未完成`);
      }

      // ============ 原有标准路径(GPT2 standard / nano-banana / nano-banana-pro 未动) ============
      logBus.info(
        `提交任务: model=${apiModel} 比例=${aspectRatio} 尺寸=${sizeLevel} 参考图=${allRefs.length} prompt="${finalPrompt.slice(0, 60)}${finalPrompt.length > 60 ? '…' : ''}"`,
        src,
      );
      const submit = await submitImageAsync({
        model: modelDef.id,
        apiModel: apiModel,
        paramKind: modelDef.paramKind,
        prompt: finalPrompt,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: allRefs,
        n: 1,
      });

      // 分支一:同步完成
      if (submit.sync && submit.urls && submit.urls.length) {
        logBus.success(`同步返回 → ${submit.urls[0]}`, src);
        update({
          status: 'success',
          progress: '100%',
          imageUrl: submit.urls[0],
          lastPrompt: finalPrompt,
          usedI2I: allRefs.length > 0,
        });
        return;
      }

      // 分支二:异步任务 → 轮询状态(对齐主项目 gpt-image-2-web pollTask)
      const taskId = submit.taskId;
      if (!taskId) throw new Error('未获取到 taskId 且无同步结果');
      logBus.info(`异步任务已提交 taskId=${taskId} 进入轮询…`, src);
      update({ progress: submit.progress || '5%', taskId });
      const maxPoll = 60;       // 最多 60 次
      const interval = 2000;    // 每 2 秒一次
      let lastProg = '5%';
      for (let i = 0; i < maxPoll; i++) {
        await new Promise((r) => setTimeout(r, interval));
        const q = await queryImageStatus(taskId);
        if (q.progress && q.progress !== lastProg) {
          lastProg = q.progress;
          update({ progress: q.progress });
          logBus.debug(`[${i + 1}/${maxPoll}] status=${q.status} progress=${q.progress}`, src);
        }
        const st = String(q.status || '').toLowerCase();
        if (st === 'completed' || st === 'success' || st === 'done') {
          const url = q.urls?.[0];
          if (!url) throw new Error('任务完成但未返回图片');
          logBus.success(`任务完成 → ${url}`, src);
          update({
            status: 'success',
            progress: '100%',
            imageUrl: url,
            lastPrompt: finalPrompt,
            usedI2I: allRefs.length > 0,
          });
          return;
        }
        if (st === 'failed' || st === 'failure' || st === 'error') {
          throw new Error(q.error || '任务失败');
        }
      }
      throw new Error(`超时:${maxPoll * interval / 1000}s 未完成`);
    } catch (e: any) {
      const msg = e?.message || '生成失败';
      setError(msg);
      logBus.error(`生成失败: ${msg}`, src);
      update({ status: 'error', error: msg });
    }
  };

  // 接入运行总线,供批量运行调起
  useRunTrigger(id, handleGenerate);

  return (
    <div
      className={`relative rounded-xl border-2 transition-all w-[320px] ${
        selected ? 'border-amber-400 shadow-2xl shadow-amber-500/20' : 'border-white/15 hover:border-white/30'
      }`}
      style={{ background: 'rgba(20,20,22,.92)', backdropFilter: 'blur(8px)' }}
    >
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !border-0" />
      <Handle type="source" position={Position.Right} className="!bg-amber-400 !border-0" />

      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: 'rgba(245,158,11,.2)', color: '#fcd34d', boxShadow: 'inset 0 0 0 1px rgba(245,158,11,.45)' }}
        >
          <ImageIcon size={13} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">图像</div>
          <div className="text-[10px] text-white/40">{modelDef.label} · {modelDef.description}</div>
        </div>
      </div>

      {/* 配置区 */}
      <div className="p-2.5 space-y-2" onMouseDown={(e) => e.stopPropagation()}>
        {/* 模型 TAB 切换(对应主项目 gpt-image-2-web Tab 0/1/2) */}
        <div>
          <label className="text-[10px] text-white/50 block mb-1">模型</label>
          <div
            className={`flex gap-0.5 p-0.5 rounded ${isPixel ? '' : 'bg-white/5'}`}
            style={isPixel ? { background: 'var(--px-muted)', border: '1.5px solid var(--px-ink)' } : undefined}
          >
            {IMAGE_MODELS.map((m) => {
              const isActive = m.id === model;
              return (
                <button
                  key={m.id}
                  onClick={() => switchModel(m.id)}
                  title={m.description}
                  className={`flex-1 py-1 text-[10px] font-semibold rounded transition-all ${
                    isActive ? 'bg-amber-500/30 text-amber-200' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  style={
                    isPixel && isActive
                      ? { background: 'var(--px-yellow)', color: 'var(--px-ink)', border: '1.5px solid var(--px-ink)', boxShadow: '1px 1px 0 var(--px-ink)' }
                      : isPixel ? { color: 'var(--px-ink-soft)' } : undefined
                  }
                >
                  {m.tabLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* 子模型选择(对齐主项目 Tab 内的 model 下拉) */}
        <div>
          <label className="text-[10px] text-white/50 block mb-1">具体模型</label>
          <select
            value={apiModel}
            onChange={(e) => update({ apiModel: e.target.value })}
            style={{ background: '#18181b', color: '#ffffff' }}
            className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
          >
            {modelDef.apiModelOptions.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: '#18181b', color: '#ffffff' }}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* 比例 + 尺寸 并排(非 FAL 模型) */}
        {!isFal && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-white/50 block mb-1">比例</label>
              <select
                value={aspectRatio}
                onChange={(e) => update({ aspectRatio: e.target.value })}
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              >
                {modelDef.aspectRatios.map((r) => (
                  <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">尺寸</label>
              <select
                value={sizeLevel}
                onChange={(e) => update({ sizeLevel: e.target.value })}
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              >
                {modelDef.sizes.map((s) => (
                  <option key={s} value={s} style={{ background: '#18181b', color: '#ffffff' }}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ========== FAL 专属参数面板(完全对齐 gpt-image-2-web gf_panel / nano_fal_panel) ========== */}
        {isFal && falKind === 'gpt-fal' && (
          <div className="space-y-2 rounded border border-blue-400/30 bg-blue-500/5 p-2">
            <div className="text-[10px] text-blue-300 font-semibold tracking-wide">
              💡 FAL Queue API · openai/gpt-image-2
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Mode</label>
                <select
                  value={falMode}
                  onChange={(e) => update({ falMode: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="edit" style={{ background: '#18181b', color: '#ffffff' }}>Edit</option>
                  <option value="gen" style={{ background: '#18181b', color: '#ffffff' }}>Generate</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Size</label>
                <select
                  value={falSize}
                  onChange={(e) => update({ falSize: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {GPT_FAL_SIZES.map((s) => (
                    <option key={s.value} value={s.value} style={{ background: '#18181b', color: '#ffffff' }}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {falSize === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Width (≈1 6倍)</label>
                  <input
                    type="number" min={256} max={3840} step={16}
                    value={falCustomW}
                    onChange={(e) => update({ falCustomW: parseInt(e.target.value) || 0 })}
                    style={{ background: '#18181b', color: '#ffffff' }}
                    className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Height (≈1 6倍)</label>
                  <input
                    type="number" min={256} max={3840} step={16}
                    value={falCustomH}
                    onChange={(e) => update({ falCustomH: parseInt(e.target.value) || 0 })}
                    style={{ background: '#18181b', color: '#ffffff' }}
                    className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Quality</label>
                <select
                  value={falQuality}
                  onChange={(e) => update({ falQuality: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="low" style={{ background: '#18181b', color: '#ffffff' }}>Low</option>
                  <option value="medium" style={{ background: '#18181b', color: '#ffffff' }}>Medium</option>
                  <option value="high" style={{ background: '#18181b', color: '#ffffff' }}>High</option>
                  <option value="auto" style={{ background: '#18181b', color: '#ffffff' }}>Auto</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">N</label>
                <input
                  type="number" min={1} max={4}
                  value={falN}
                  onChange={(e) => update({ falN: Math.max(1, Math.min(4, parseInt(e.target.value) || 1)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Format</label>
                <select
                  value={falFormat}
                  onChange={(e) => update({ falFormat: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="png" style={{ background: '#18181b', color: '#ffffff' }}>PNG</option>
                  <option value="jpeg" style={{ background: '#18181b', color: '#ffffff' }}>JPEG</option>
                  <option value="webp" style={{ background: '#18181b', color: '#ffffff' }}>WebP</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-white/60">
              <input
                type="checkbox"
                checked={falSync}
                onChange={(e) => update({ falSync: e.target.checked })}
              />
              <span>同步模式 (sync_mode: 适合快速返回场景)</span>
            </label>
          </div>
        )}

        {isFal && falKind === 'nbpro-fal' && (
          <div className="space-y-2 rounded border border-blue-400/30 bg-blue-500/5 p-2">
            <div className="text-[10px] text-blue-300 font-semibold tracking-wide">
              💡 FAL Queue API · fal-ai/nano-banana-pro/edit (需参考图)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">N</label>
                <input
                  type="number" min={1} max={4}
                  value={falN}
                  onChange={(e) => update({ falN: Math.max(1, Math.min(4, parseInt(e.target.value) || 1)) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Aspect</label>
                <select
                  value={nbAspect}
                  onChange={(e) => update({ nbAspect: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {NBPRO_FAL_RATIOS.map((r) => (
                    <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Resolution</label>
                <select
                  value={nbResolution}
                  onChange={(e) => update({ nbResolution: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  {NBPRO_FAL_RESOLUTIONS.map((r) => (
                    <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Format</label>
                <select
                  value={falFormat}
                  onChange={(e) => update({ falFormat: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="png" style={{ background: '#18181b', color: '#ffffff' }}>PNG</option>
                  <option value="jpeg" style={{ background: '#18181b', color: '#ffffff' }}>JPEG</option>
                  <option value="webp" style={{ background: '#18181b', color: '#ffffff' }}>WebP</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Safety</label>
                <select
                  value={nbSafety}
                  onChange={(e) => update({ nbSafety: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="1" style={{ background: '#18181b', color: '#ffffff' }}>1 (严)</option>
                  <option value="2" style={{ background: '#18181b', color: '#ffffff' }}>2</option>
                  <option value="3" style={{ background: '#18181b', color: '#ffffff' }}>3</option>
                  <option value="4" style={{ background: '#18181b', color: '#ffffff' }}>4</option>
                  <option value="5" style={{ background: '#18181b', color: '#ffffff' }}>5</option>
                  <option value="6" style={{ background: '#18181b', color: '#ffffff' }}>6 (松)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">ImgMode</label>
                <select
                  value={nbImgMode}
                  onChange={(e) => update({ nbImgMode: e.target.value })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                >
                  <option value="image_url" style={{ background: '#18181b', color: '#ffffff' }}>URL</option>
                  <option value="base64" style={{ background: '#18181b', color: '#ffffff' }}>Base64</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Seed (0=不传)</label>
                <input
                  type="number" min={0}
                  value={nbSeed}
                  onChange={(e) => update({ nbSeed: Math.max(0, parseInt(e.target.value) || 0) })}
                  style={{ background: '#18181b', color: '#ffffff' }}
                  className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
                />
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-white/60 mt-4">
                <input
                  type="checkbox"
                  checked={nbWebSearch}
                  onChange={(e) => update({ nbWebSearch: e.target.checked })}
                />
                <span>Web Search</span>
              </label>
            </div>
            <div>
              <label className="text-[10px] text-white/50 block mb-1">System Prompt (可选)</label>
              <input
                type="text"
                value={nbSysPrompt}
                onChange={(e) => update({ nbSysPrompt: e.target.value })}
                placeholder="可选系统指令"
                style={{ background: '#18181b', color: '#ffffff' }}
                className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
              />
            </div>
          </div>
        )}

        {/* 参考图(多张) */}
        {modelDef.supportsReference && (
          <div>
            <label className="text-[10px] text-white/50 block mb-1">
              参考图 · {refImages.length}/{maxRefs}
              <span className="text-white/30 ml-1">(上游节点会自动并入)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {refImages.map((url, i) => (
                <div key={i} className="relative w-12 h-12 rounded overflow-hidden border border-white/15">
                  <img src={url} alt={`ref-${i}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeRef(i)}
                    className="absolute top-0 right-0 w-4 h-4 bg-red-500/80 hover:bg-red-500 flex items-center justify-center rounded-bl"
                    title="移除"
                  >
                    <X size={9} className="text-white" />
                  </button>
                </div>
              ))}
              {refImages.length < maxRefs && (
                <button
                  onClick={handlePickFile}
                  className="w-12 h-12 rounded border-2 border-dashed border-white/20 hover:border-amber-400/60 flex items-center justify-center text-white/40 hover:text-amber-300 transition-colors"
                  title="上传参考图(可多选)"
                >
                  <Plus size={14} />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFiles}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* 本地 prompt(优先取上游) */}
        <div>
          <label className="text-[10px] text-white/50 block mb-1">本地 Prompt(可选,优先取上游 text)</label>
          <textarea
            value={localPrompt}
            onChange={(e) => update({ prompt: e.target.value })}
            placeholder="备用:无上游连接时使用此提示词"
            className="w-full h-14 resize-none rounded bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-white/30 placeholder:text-white/30"
          />
        </div>

        {/* 生成按钮(包含异步进度) */}
        <button
          onClick={handleGenerate}
          disabled={status === 'generating'}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {status === 'generating' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> 生成中 {d?.progress || ''}
            </>
          ) : (
            <>
              <Sparkles size={12} /> 生成
            </>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-1 text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
            <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}
      </div>

      {/* 结果展示 */}
      {imageUrl && (
        <div className="border-t border-white/10 p-2">
          <img src={imageUrl} alt="生成结果" className="w-full rounded object-cover" />
        </div>
      )}
    </div>
  );
};

export default memo(ImageNode);

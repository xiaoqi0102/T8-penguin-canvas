import { memo, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { AlertCircle, Image as ImageIcon, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { IMAGE_MODELS } from '../../providers/models';
import { generateImage } from '../../services/generation';
import { uploadFile } from '../../services/generation';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useThemeStore } from '../../stores/theme';

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
  const status: 'idle' | 'generating' | 'success' | 'error' = d?.status || 'idle';
  const imageUrl = d?.imageUrl as string | undefined;
  const localPrompt = d?.prompt || '';
  // 节点内本地上传的参考图(除了上游接入的,这里是手动上传)
  const refImages: string[] = Array.isArray(d?.referenceImages) ? d.referenceImages : [];

  // 切换模型时,如果当前比例/尺寸不在新模型选项里则重置
  const switchModel = (mId: string) => {
    const newDef = IMAGE_MODELS.find((m) => m.id === mId) || IMAGE_MODELS[0];
    const patch: any = { model: mId };
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
      const remain = modelDef.maxReferenceImages - refImages.length;
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
    if (!finalPrompt) {
      setError('未连接 text 节点也未填写 prompt');
      return;
    }
    update({ status: 'generating', error: null });
    try {
      const allRefs = [...refImages, ...upstreamImages].slice(0, modelDef.maxReferenceImages);
      const res = await generateImage({
        model: modelDef.id,
        apiModel: modelDef.apiModel,
        paramKind: modelDef.paramKind,
        prompt: finalPrompt,
        aspect_ratio: aspectRatio,
        image_size: sizeLevel,
        images: allRefs,
        n: 1,
      });
      const url = res.urls?.[0];
      if (!url) throw new Error('上游未返回有效图像');
      update({
        status: 'success',
        imageUrl: url,
        lastPrompt: finalPrompt,
        usedI2I: allRefs.length > 0,
      });
    } catch (e: any) {
      setError(e?.message || '生成失败');
      update({ status: 'error', error: e?.message });
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
          <div className="text-sm font-semibold text-white">图像生成</div>
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

        {/* 比例 + 尺寸 并排 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-white/50 block mb-1">比例</label>
            <select
              value={aspectRatio}
              onChange={(e) => update({ aspectRatio: e.target.value })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {modelDef.aspectRatios.map((r) => (
                <option key={r} value={r} className="bg-zinc-900">{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-white/50 block mb-1">尺寸</label>
            <select
              value={sizeLevel}
              onChange={(e) => update({ sizeLevel: e.target.value })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {modelDef.sizes.map((s) => (
                <option key={s} value={s} className="bg-zinc-900">{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 参考图(多张) */}
        {modelDef.supportsReference && (
          <div>
            <label className="text-[10px] text-white/50 block mb-1">
              参考图 · {refImages.length}/{modelDef.maxReferenceImages}
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
              {refImages.length < modelDef.maxReferenceImages && (
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

        {/* 生成按钮 */}
        <button
          onClick={handleGenerate}
          disabled={status === 'generating'}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {status === 'generating' ? (
            <>
              <Loader2 size={12} className="animate-spin" /> 生成中...
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

/**
 * Geeknow LLM 节点（v1.7.4 fork-only · 与上游 LLMNode 隔离）
 *
 * 协议：上游 https://www.geeknow.top（用户可改）/v1/chat/completions
 *   - 标准 OpenAI Chat Completions 兼容
 *   - SSE 流式 + 多模态 image_url + 系统提示词 + 温度/maxTokens
 *
 * 与上游 `LLMNode` 的关系：
 *   - 这是一个完全独立的节点 type=`t8f-geeknow-llm`，不复用 `llm` type
 *   - 上游若改动 `LLMNode.tsx` 或 `/api/proxy/llm`，本节点不受影响
 *   - 本节点直接调 `/api/proxy/llm-geeknow`，独立 Key（geeknowApiKey）
 *
 * 节点端口：与 `llm` 一致：inputs:['text','image']  outputs:['text']
 * 输出契约：data.prompt = 最后一条助手回复（与 LLMNode 一致，下游 useUpstreamMaterials 自然消费）
 */
import { memo, useCallback, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  Brain,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Square,
  X,
} from 'lucide-react';
import { GEEKNOW_LLM_MODELS, DEFAULT_GEEKNOW_LLM_MODEL, type LlmModelDef } from '../../providers/models';
import { fileToDataUrl, type LlmContentPart, type LlmMessage } from '../../services/generation';
import {
  generateGeeknowLlm,
  generateGeeknowLlmStream,
  fetchGeeknowModels,
} from '../../integrations/geeknow/runGeeknowLlm';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { logBus } from '../../stores/logs';
import { PORT_COLOR } from '../../config/portTypes';
import { useDragMaterialStore, type MaterialPayload } from '../../stores/dragMaterial';
import { useMaterialDropTarget } from '../../hooks/useMaterialDropTarget';
import { useUpstreamMaterials, type Material } from './useUpstreamMaterials';
import { useOrderedMaterials } from './useOrderedMaterials';
import MaterialPreviewSection from './MaterialPreviewSection';
import { useThemeStore } from '../../stores/theme';
import MentionPromptInput from './MentionPromptInput';
import { resolveMediaMentions, type MediaMention } from './mediaMentions';

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  images?: string[];
}

const PRESET_KEY = 't8f-geeknow-sys-presets';
const DYNAMIC_MODELS_KEY = 't8f-geeknow-dynamic-models';

function loadPresets(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}');
  } catch {
    return {};
  }
}
function savePresets(map: Record<string, string>) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

function loadDynamicModels(): LlmModelDef[] | null {
  try {
    const raw = localStorage.getItem(DYNAMIC_MODELS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.filter((m) => m && typeof m.id === 'string').map((m) => ({
      id: m.id,
      label: m.label || m.id,
      provider: 'geeknow' as const,
      vision: !!m.vision,
    }));
  } catch {
    return null;
  }
}
function saveDynamicModels(list: LlmModelDef[]) {
  try {
    localStorage.setItem(DYNAMIC_MODELS_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}

/** 阻止节点内滚轮触发画布缩放 */
function attachWheelBlock(el: HTMLElement | null) {
  if (!el) return;
  if ((el as any).__t8WheelBound) return;
  (el as any).__t8WheelBound = true;
  el.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.stopPropagation();
    },
    { passive: false },
  );
}

const GeeknowLlmNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const { getEdges, getNodes } = useReactFlow();
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [presetMap, setPresetMap] = useState<Record<string, string>>(() => loadPresets());
  const [pickedFiles, setPickedFiles] = useState<{ name: string; dataUrl: string }[]>([]);
  const [dynamicModels, setDynamicModels] = useState<LlmModelDef[] | null>(() => loadDynamicModels());
  const [refreshingModels, setRefreshingModels] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sysRef = useCallback((el: HTMLElement | null) => attachWheelBlock(el), []);
  const userRef = useCallback((el: HTMLElement | null) => attachWheelBlock(el), []);
  const chatRef = useCallback((el: HTMLDivElement | null) => attachWheelBlock(el), []);

  const d = data as any;
  const allModels: LlmModelDef[] = dynamicModels && dynamicModels.length > 0 ? dynamicModels : GEEKNOW_LLM_MODELS;
  const model: string = d?.model || DEFAULT_GEEKNOW_LLM_MODEL;
  const status: 'idle' | 'generating' | 'success' | 'error' = d?.status || 'idle';
  const localPrompt: string = d?.userPrompt ?? (d?.reply == null && typeof d?.prompt === 'string' ? d.prompt : '');
  const userPromptMentions: MediaMention[] = Array.isArray(d?.userPromptMentions) ? d.userPromptMentions : [];
  const systemPrompt: string = d?.system ?? '你是一个提示词专家，将用户的提示词优化';
  const temperature: number = typeof d?.temperature === 'number' ? d.temperature : 0.7;
  const maxTokens: number = typeof d?.maxTokens === 'number' ? d.maxTokens : 4096;
  const useStream: boolean = d?.stream !== false;
  const history: ChatTurn[] = Array.isArray(d?.history) ? d.history : [];

  const src = `Geeknow·${model}·#${id.slice(-4)}`;

  const upstreamMats = useUpstreamMaterials(id);

  const { theme, style } = useThemeStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  void isDark;
  void isPixel;

  const localImageMaterials: Material[] = useMemo(
    () =>
      pickedFiles.map((f, i) => ({
        id: `local::image:${i}:${f.name}`,
        kind: 'image' as const,
        url: f.dataUrl,
        sourceNodeId: id,
        origin: 'local' as const,
        label: f.name || `本地${i + 1}`,
      })),
    [pickedFiles, id],
  );
  const allImagesUnordered = useMemo(
    () => [...localImageMaterials, ...upstreamMats.images],
    [localImageMaterials, upstreamMats.images],
  );
  const materialOrder: string[] = Array.isArray(d?.materialOrder) ? d.materialOrder : [];
  const orderedImages = useOrderedMaterials(allImagesUnordered, materialOrder);
  const orderedTexts = useOrderedMaterials(upstreamMats.texts, materialOrder);
  const setMaterialOrder = (newOrder: string[]) => update({ materialOrder: newOrder });
  const handleRemoveLocalMaterial = (m: Material) => {
    if (m.origin !== 'local') return;
    setPickedFiles((s) => s.filter((f) => f.dataUrl !== m.url));
  };

  const collectUpstream = (): { text: string; images: string[] } => {
    const texts = orderedTexts.map((t) => t.url).filter((s) => !!s);
    const images = orderedImages.map((m) => m.url).filter((s) => !!s);
    void getEdges;
    void getNodes;
    return { text: texts.join('\n').trim(), images };
  };

  const handlePickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: { name: string; dataUrl: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith('image/')) continue;
      try {
        const url = await fileToDataUrl(f);
        next.push({ name: f.name, dataUrl: url });
      } catch (e: any) {
        logBus.warn(`图片读取失败: ${e?.message || '未知错误'}`, src);
      }
    }
    if (next.length) setPickedFiles((s) => [...s, ...next]);
  };

  const buildMessages = (userText: string, userImages: string[]): LlmMessage[] => {
    const msgs: LlmMessage[] = [];
    if (systemPrompt.trim()) {
      msgs.push({ role: 'system', content: systemPrompt.trim() });
    }
    history.forEach((t) => {
      if (t.role === 'user' && t.images && t.images.length) {
        const parts: LlmContentPart[] = [];
        if (t.text) parts.push({ type: 'text', text: t.text });
        t.images.forEach((u) => parts.push({ type: 'image_url', image_url: { url: u } }));
        msgs.push({ role: 'user', content: parts });
      } else {
        msgs.push({ role: t.role, content: t.text });
      }
    });
    if (userImages.length) {
      const parts: LlmContentPart[] = [];
      if (userText) parts.push({ type: 'text', text: userText });
      userImages.forEach((u) => parts.push({ type: 'image_url', image_url: { url: u } }));
      msgs.push({ role: 'user', content: parts });
    } else {
      msgs.push({ role: 'user', content: userText });
    }
    return msgs;
  };

  const handleSend = async () => {
    setError(null);
    setStreamingText('');
    const upstream = collectUpstream();
    const resolvedLocalPrompt = resolveMediaMentions(localPrompt, userPromptMentions, orderedImages);
    const userText = (upstream.text || resolvedLocalPrompt || '').trim();
    const userImages = upstream.images;
    if (!userText && userImages.length === 0) {
      setError('未提供用户输入(无上游 prompt / 本地输入 / 图片)');
      logBus.error('缺少用户输入', src);
      return;
    }

    update({ status: 'generating', error: null });
    logBus.info(`发送到 Geeknow ${model} · ${useStream ? 'SSE' : '非流式'} · imgs=${userImages.length}`, src);

    const messages = buildMessages(userText, userImages);
    const userTurn: ChatTurn = { role: 'user', text: userText, images: userImages };
    const nextHistory: ChatTurn[] = [...history, userTurn];

    try {
      if (useStream) {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const { content } = await generateGeeknowLlmStream(
          { model, messages, temperature, max_tokens: maxTokens },
          {
            onDelta: (chunk) => setStreamingText((s) => s + chunk),
            signal: ctrl.signal,
          },
        );
        abortRef.current = null;
        const assistantTurn: ChatTurn = { role: 'assistant', text: content };
        update({
          status: 'success',
          history: [...nextHistory, assistantTurn],
          reply: content,
          prompt: content,
        });
        setStreamingText('');
        logBus.success(`Geeknow 完成 · ${content.length} 字`, src);
      } else {
        const result = await generateGeeknowLlm({ model, messages, temperature, max_tokens: maxTokens });
        const assistantTurn: ChatTurn = {
          role: 'assistant',
          text: result.content,
          images: result.imageUrls && result.imageUrls.length > 0 ? result.imageUrls : undefined,
        };
        update({
          status: 'success',
          history: [...nextHistory, assistantTurn],
          reply: result.content,
          prompt: result.content,
        });
        logBus.success(`Geeknow 完成 · ${result.content.length} 字`, src);
      }
    } catch (e: any) {
      const msg = e?.message || '调用失败';
      setError(msg);
      update({ status: 'error', error: msg });
      logBus.error(msg, src);
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      logBus.warn('用户中止流式请求', src);
    }
  };

  const handleClear = () => {
    update({ history: [], reply: '', generatedImages: [], imageUrls: [] });
    setStreamingText('');
    setPickedFiles([]);
  };

  const handleRefreshModels = async () => {
    setRefreshingModels(true);
    try {
      const list = await fetchGeeknowModels();
      if (!list.length) {
        logBus.warn('Geeknow /v1/models 返回空清单，保留内置默认', src);
        return;
      }
      const next: LlmModelDef[] = list.map((m) => ({
        id: m.id,
        label: m.owned_by ? `${m.id} · ${m.owned_by}` : m.id,
        provider: 'geeknow' as const,
      }));
      saveDynamicModels(next);
      setDynamicModels(next);
      logBus.success(`已刷新 Geeknow 模型清单 · ${next.length} 个`, src);
    } catch (e: any) {
      const msg = e?.message || '刷新失败';
      logBus.error(`刷新模型失败: ${msg}`, src);
      window.alert(`刷新模型失败: ${msg}`);
    } finally {
      setRefreshingModels(false);
    }
  };

  const handleResetModels = () => {
    try {
      localStorage.removeItem(DYNAMIC_MODELS_KEY);
    } catch {
      /* noop */
    }
    setDynamicModels(null);
    logBus.info('已恢复 Geeknow 内置模型清单', src);
  };

  const handleSavePreset = () => {
    const name = window.prompt('为当前系统提示词命名:', '');
    if (!name) return;
    if (!systemPrompt.trim()) {
      window.alert('系统提示词为空,无法保存');
      return;
    }
    const map = { ...presetMap, [name]: systemPrompt };
    savePresets(map);
    setPresetMap(map);
  };

  useRunTrigger(id, handleSend);

  const startDrag = useDragMaterialStore((s) => s.start);
  const beginMaterialDrag = (e: React.MouseEvent, payload: MaterialPayload) => {
    if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(payload, e.clientX, e.clientY);
  };

  const handleDrop = (payload: MaterialPayload) => {
    if (payload.kind === 'image' && payload.url) {
      const url = payload.url;
      setPickedFiles((s) => (s.some((f) => f.dataUrl === url) ? s : [...s, { name: url.split('/').pop() || 'dropped', dataUrl: url }]));
      logBus.info(`已接受拖入图像 · ${url.slice(-40)}`, src);
    } else if (payload.kind === 'text' && typeof payload.text === 'string') {
      update({ userPrompt: payload.text });
    }
  };
  const { dropProps, isAccepting } = useMaterialDropTarget({
    id,
    accepts: ['image', 'text'],
    onDrop: handleDrop,
  });

  const handleColor = PORT_COLOR.text;
  void handleColor;

  const mainRef = useRef<HTMLDivElement>(null);
  const hasChat = history.length > 0 || !!streamingText;
  const [mainH, setMainH] = useState<number>(0);
  useLayoutEffect(() => {
    if (mainRef.current) {
      setMainH(mainRef.current.offsetHeight);
    }
  });

  return (
    <div className="relative flex items-start gap-0" {...dropProps}>
      <Handle type="target" position={Position.Left} className="!bg-amber-300 !border-0 !z-10" />
      <Handle type="source" position={Position.Right} className="!bg-amber-300 !border-0 !z-10" />

      <div
        ref={mainRef}
        className={`relative rounded-xl border-2 transition-all w-[320px] ${
          selected ? 'border-amber-400 shadow-2xl shadow-amber-500/20' : isAccepting ? 'border-amber-400' : 'border-white/15 hover:border-white/30'
        }`}
        style={{
          background: 'rgba(20,20,22,.92)',
          boxShadow: isAccepting ? '0 0 0 2px rgba(251,191,36,.45), 0 12px 30px rgba(251,191,36,.18)' : undefined,
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'rgba(251,191,36,.2)', color: '#fcd34d', boxShadow: 'inset 0 0 0 1px rgba(251,191,36,.45)' }}
          >
            <Brain size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">Geeknow LLM 推理</div>
            <div className="text-[10px] text-white/40 truncate">独立中转站 · OpenAI 兼容 · {allModels.length} 个模型</div>
          </div>
          {history.length > 0 && (
            <button
              onClick={handleClear}
              title="清空会话 / 新建"
              className="text-[10px] text-white/50 hover:text-rose-300 flex items-center gap-1"
            >
              <Plus size={11} /> 新会话
            </button>
          )}
        </div>

        <div className="p-2.5 space-y-2" onMouseDown={(e) => e.stopPropagation()}>
          {/* 模型 + 刷新按钮 */}
          <div>
            <label className="text-[10px] text-white/50 block mb-1 flex items-center gap-1">
              模型
              <button
                onClick={handleRefreshModels}
                disabled={refreshingModels}
                title="从 Geeknow /v1/models 刷新可用清单"
                className="ml-auto text-[10px] text-white/50 hover:text-amber-300 flex items-center gap-0.5 disabled:opacity-50"
              >
                <RefreshCw size={10} className={refreshingModels ? 'animate-spin' : ''} />
                {refreshingModels ? '刷新中…' : dynamicModels ? `已拉取(${dynamicModels.length})` : '刷新'}
              </button>
              {dynamicModels && (
                <button
                  onClick={handleResetModels}
                  title="恢复内置默认模型清单"
                  className="text-[10px] text-white/40 hover:text-white/70"
                >
                  <X size={10} />
                </button>
              )}
            </label>
            <select
              value={model}
              onChange={(e) => update({ model: e.target.value })}
              className="w-full rounded bg-white/5 border border-white/10 px-2 py-1 text-xs text-white outline-none focus:border-white/30"
            >
              {allModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-zinc-900">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label className="text-[9px] text-white/40 block mb-0.5">temp</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => update({ temperature: Number(e.target.value) })}
                className="w-full rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[11px] text-white outline-none nodrag"
              />
            </div>
            <div>
              <label className="text-[9px] text-white/40 block mb-0.5">max_tokens</label>
              <input
                type="number"
                min={100}
                max={128000}
                step={100}
                value={maxTokens}
                onChange={(e) => update({ maxTokens: Number(e.target.value) })}
                className="w-full rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[11px] text-white outline-none nodrag"
              />
            </div>
            <div>
              <label className="text-[9px] text-white/40 block mb-0.5">stream</label>
              <button
                onClick={() => update({ stream: !useStream })}
                className={`w-full rounded border px-1.5 py-0.5 text-[11px] ${
                  useStream
                    ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                    : 'bg-white/5 border-white/10 text-white/40'
                }`}
              >
                {useStream ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* 系统提示词 */}
          <div>
            <label className="text-[10px] text-white/50 block mb-1 flex items-center gap-1">
              系统提示词
              <button
                onClick={handleSavePreset}
                title="保存为预设"
                className="ml-auto text-[10px] text-white/40 hover:text-amber-300"
              >
                保存预设
              </button>
              {Object.keys(presetMap).length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const name = e.target.value;
                    if (!name) return;
                    if (presetMap[name]) update({ system: presetMap[name] });
                  }}
                  className="text-[10px] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/70 outline-none nodrag"
                >
                  <option value="">载入…</option>
                  {Object.keys(presetMap).map((n) => (
                    <option key={n} value={n} className="bg-zinc-900">
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <textarea
              ref={sysRef as any}
              value={systemPrompt}
              onChange={(e) => update({ system: e.target.value })}
              className="w-full h-16 resize-none rounded bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none nodrag nowheel"
              placeholder="可选:为模型设定角色、风格、约束…"
            />
          </div>

          {/* 用户输入 */}
          <div>
            <label className="text-[10px] text-white/50 block mb-1">用户输入(优先取上游)</label>
            <MentionPromptInput
              editorRef={userRef}
              value={localPrompt}
              mentions={userPromptMentions}
              materials={orderedImages}
              onChange={(value, mentions) => update({ userPrompt: value, userPromptMentions: mentions })}
              placeholder="备用:无上游连接时使用"
              isDark={isDark}
              isPixel={isPixel}
              className="w-full h-32 resize-none rounded bg-white/5 border border-white/10 px-2 py-1 text-[11px] text-white outline-none focus:border-white/30 placeholder:text-white/30 overflow-y-auto"
            />
          </div>

          {/* 上游素材聚合预览 */}
          <MaterialPreviewSection
            texts={orderedTexts}
            images={orderedImages}
            order={materialOrder}
            onReorder={setMaterialOrder}
            onRemoveLocal={handleRemoveLocalMaterial}
            selected={!!selected}
            isDark={isDark}
            isPixel={isPixel}
            groups={['text', 'image']}
            title="上游素材 + 本地图片"
            imageUploadAction={{
              onClick: () => fileInputRef.current?.click(),
              title: '上传本地图片(多模态)',
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              handlePickImages(e.target.files);
              e.currentTarget.value = '';
            }}
          />

          {/* 操作 */}
          <div className="flex items-center gap-2 pt-1">
            {status === 'generating' ? (
              <button
                onClick={handleStop}
                className="flex-1 px-2.5 py-1.5 rounded bg-rose-500/15 border border-rose-400/40 text-rose-300 text-xs flex items-center justify-center gap-1 hover:bg-rose-500/25"
              >
                <Square size={12} /> 停止
              </button>
            ) : (
              <button
                onClick={handleSend}
                className="flex-1 px-2.5 py-1.5 rounded bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs flex items-center justify-center gap-1 hover:bg-amber-500/25"
              >
                <Send size={12} /> 发送
              </button>
            )}
          </div>

          {error && (
            <div className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
              {error}
            </div>
          )}

          {status === 'generating' && (
            <div className="text-[10px] text-amber-300 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Geeknow 推理中…
            </div>
          )}
        </div>
      </div>

      {/* 右侧聊天历史面板 */}
      {hasChat && (
        <div
          ref={chatRef}
          className="ml-2 w-[260px] rounded-xl border border-white/10 bg-black/40 p-2 space-y-2 overflow-y-auto nowheel"
          style={{ maxHeight: mainH > 0 ? mainH : 600 }}
        >
          {history.map((t, i) => (
            <div key={i} className="text-[11px]">
              <div className={`text-[9px] mb-0.5 ${t.role === 'user' ? 'text-sky-300/60' : 'text-amber-300/60'}`}>
                {t.role === 'user' ? '👤 用户' : '🤖 助手'}
              </div>
              <div
                className={`whitespace-pre-wrap text-white/80 rounded p-1.5 border ${
                  t.role === 'user' ? 'bg-white/5 border-white/10' : 'bg-amber-500/[0.08] border-amber-500/20'
                }`}
              >
                {t.text}
              </div>
              {t.images && t.images.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {t.images.map((u, j) => (
                    <img
                      key={j}
                      src={u}
                      alt=""
                      data-drag-source
                      data-drag-kind="image"
                      data-drag-url={u}
                      data-drag-preview={u}
                      data-drag-node-id={id}
                      onMouseDown={(e) => beginMaterialDrag(e, { kind: 'image', url: u, sourceNodeId: id, previewUrl: u })}
                      className="w-12 h-12 object-cover rounded border border-white/10 cursor-grab"
                      title="按住 Ctrl 拖拽到其他节点"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {streamingText && (
            <div className="text-[11px]">
              <div className="text-[9px] mb-0.5 text-amber-300/60">🤖 助手 (流式中…)</div>
              <div className="whitespace-pre-wrap text-white/80 bg-amber-500/[0.08] rounded p-1.5 border border-amber-500/20">
                {streamingText}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(GeeknowLlmNode);

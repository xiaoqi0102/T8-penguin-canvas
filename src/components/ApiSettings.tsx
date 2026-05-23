import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Lock, Save, X, ExternalLink } from 'lucide-react';
import { useApiKeysStore, FIXED_ZHENZHEN_BASE, RH_BASE } from '../stores/apiKeys';
import { useThemeStore } from '../stores/theme';
import type { ApiSettings } from '../types/canvas';
import { getRawSettings } from '../services/api';

interface ApiSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// 主 Key 字段名类型
type KeyField =
  | 'zhenzhenApiKey'
  | 'rhApiKey'
  | 'llmApiKey'
  | 'gptImageApiKey'
  | 'nanoBananaApiKey'
  | 'mjApiKey'
  | 'veoApiKey'
  | 'grokApiKey'
  | 'seedanceApiKey'
  | 'sunoApiKey';

interface KeySpec {
  field: KeyField;
  label: string;
  desc: string;
  bullet: string; // tailwind bg color class
}

const COMMON_KEYS: KeySpec[] = [
  { field: 'zhenzhenApiKey', label: '贞贞工坊 API Key', desc: '· 通用后备 · 用于图像/视频/音频生成', bullet: 'bg-amber-400' },
  { field: 'rhApiKey', label: 'RunningHub API Key', desc: '· 用于 RH 工作流', bullet: 'bg-cyan-400' },
  { field: 'llmApiKey', label: 'LLM 独立 API Key', desc: '· 额度隔离 · 用于 LLM/Vision', bullet: 'bg-emerald-400' },
];

const CLASSIFIED_KEYS: KeySpec[] = [
  { field: 'gptImageApiKey', label: 'gpt-image 系列', desc: 'GPT2 / gpt-image-1 等图像任务专用', bullet: 'bg-pink-400' },
  { field: 'nanoBananaApiKey', label: 'nano-banana 系列', desc: 'nano-banana / nano-banana-pro 专用', bullet: 'bg-yellow-400' },
  { field: 'mjApiKey', label: 'mj 系列', desc: 'Midjourney (turbo/fast/relax) 专用', bullet: 'bg-purple-400' },
  { field: 'veoApiKey', label: 'veo 系列', desc: 'Veo / Veo3.1 视频专用', bullet: 'bg-blue-400' },
  { field: 'grokApiKey', label: 'grok 系列', desc: 'Grok Imagine Video 专用', bullet: 'bg-orange-400' },
  { field: 'seedanceApiKey', label: 'seedance 系列', desc: 'Seedance 视频专用', bullet: 'bg-teal-400' },
  { field: 'sunoApiKey', label: 'suno 系列', desc: 'Suno 音乐专用', bullet: 'bg-rose-400' },
];

const ALL_FIELDS: KeyField[] = [
  ...COMMON_KEYS.map((k) => k.field),
  ...CLASSIFIED_KEYS.map((k) => k.field),
];

const emptyMap = (): Record<KeyField, string> => ({
  zhenzhenApiKey: '', rhApiKey: '', llmApiKey: '',
  gptImageApiKey: '', nanoBananaApiKey: '', mjApiKey: '', veoApiKey: '',
  grokApiKey: '', seedanceApiKey: '', sunoApiKey: '',
});
const emptyShow = (): Record<KeyField, boolean> => ({
  zhenzhenApiKey: false, rhApiKey: false, llmApiKey: false,
  gptImageApiKey: false, nanoBananaApiKey: false, mjApiKey: false, veoApiKey: false,
  grokApiKey: false, seedanceApiKey: false, sunoApiKey: false,
});

export default function ApiSettingsModal({ open, onClose }: ApiSettingsModalProps) {
  const { theme, style } = useThemeStore();
  const { settings, loading, error, load, save, loaded } = useApiKeysStore();
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';

  const [inputs, setInputs] = useState<Record<KeyField, string>>(emptyMap());
  const [shows, setShows] = useState<Record<KeyField, boolean>>(emptyShow());
  const [saved, setSaved] = useState(false);
  // 眼睛预览拉取的明文（仅缓存，不提交）
  const revealedRef = useRef<Partial<Record<KeyField, string>>>({});

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  // 重置表单(脱敏 Key 不直接填充,留空则保持后端原值)
  useEffect(() => {
    if (open) {
      setInputs(emptyMap());
      setShows(emptyShow());
      revealedRef.current = {};
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  const setInputAt = (f: KeyField, v: string) => {
    setInputs((prev) => ({ ...prev, [f]: v }));
  };

  // 眼睛点击: 如果要切为“显示”且当前 input 为空但后端已存在 key,
  // 调 /api/settings/raw 拿明文填充。
  const handleToggleShow = async (f: KeyField) => {
    const newShow = !shows[f];
    if (newShow && !inputs[f].trim() && (settings as any)[f]) {
      try {
        if (!revealedRef.current || Object.keys(revealedRef.current).length === 0) {
          const raw = await getRawSettings();
          revealedRef.current = raw as any;
        }
      } catch {
        // 忽略拉取失败
      }
      const plain = (revealedRef.current as any)?.[f];
      if (plain) setInputAt(f, String(plain));
    }
    setShows((prev) => ({ ...prev, [f]: newShow }));
  };

  const handleSave = async () => {
    const patch: Partial<ApiSettings> = {};
    for (const f of ALL_FIELDS) {
      const v = inputs[f].trim();
      if (!v) continue;
      // 眼睛拉出明文未修改 → 跳过，不走一道上行请求
      const revealed = (revealedRef.current as any)?.[f];
      if (revealed && v === String(revealed)) continue;
      (patch as any)[f] = v;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    await save(patch);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const inputCls = isPixel
    ? 'flex-1 px-3 py-2 rounded-[10px] text-sm outline-none px-input'
    : `flex-1 px-3 py-2 rounded-md text-sm outline-none border ${
        isDark
          ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30'
          : 'bg-black/5 border-black/10 text-zinc-900 placeholder:text-zinc-400 focus:border-black/30'
      }`;

  const labelCls = isPixel ? 'text-[var(--px-ink)]' : isDark ? 'text-white/70' : 'text-zinc-700';
  const hintCls = isPixel ? 'text-[var(--px-ink-soft)]' : isDark ? 'text-white/40' : 'text-zinc-500';
  const eyeBtnCls = isPixel
    ? 'px-btn px-btn--icon px-btn--ghost'
    : `p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`;

  // 防御性脱敏：始终只显示尾4位（与之前 `****9zVR` 一致），
  // 即使后端意外返回明文也不会暴露完整 Key
  const toMaskedDisplay = (v?: string): string => {
    if (!v) return '';
    const s = String(v);
    // 后端已脱敏（****xxxx 形式）直接原样
    if (/^\*{2,}/.test(s)) return s;
    if (s.length <= 4) return '****';
    return '****' + s.slice(-4);
  };

  // 渲染单个 Key 表项
  const renderKey = (
    spec: KeySpec,
    opts: { fallbackHint?: boolean; baseUrlNote?: string; extras?: React.ReactNode },
  ) => {
    const f = spec.field;
    const rawVal = (settings as any)[f] as string | undefined;
    const hasSaved = !!rawVal;
    const maskedDisplay = toMaskedDisplay(rawVal);
    return (
      <div key={f} className="space-y-2">
        <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
          <span className={`w-2 h-2 rounded-full ${spec.bullet}`} />
          {spec.label}
          <span className={`text-[11px] font-normal ${hintCls}`}>{spec.desc}</span>
          {hasSaved && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ✓ 已保存 {maskedDisplay}
            </span>
          )}
          {opts.fallbackHint && !hasSaved && (
            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/10">
              未设置 · 使用通用 Key
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <input
            type={shows[f] ? 'text' : 'password'}
            value={inputs[f]}
            onChange={(e) => setInputAt(f, e.target.value)}
            placeholder={hasSaved ? '留空保持不变 / 输入新值覆盖' : (opts.fallbackHint ? '留空则使用通用 Key / 输入独立 Key' : '请输入 sk-...')}
            className={inputCls}
            autoComplete="off"
          />
          <button
            onClick={() => handleToggleShow(f)}
            className={eyeBtnCls}
            title={shows[f] ? '隐藏' : '显示明文'}
          >
            {shows[f] ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {(opts.baseUrlNote || opts.extras) && (
          <div className={`flex items-center justify-between gap-2 flex-wrap text-[11px] ${hintCls}`}>
            {opts.baseUrlNote ? (
              <span className="flex items-center gap-1.5">
                <Lock size={11} /> {opts.baseUrlNote}
              </span>
            ) : (
              <span />
            )}
            {opts.extras && <div className="flex items-center gap-2">{opts.extras}</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm ${
        isPixel ? 'px-modal-mask' : 'bg-black/60'
      }`}
    >
      <div
        className={
          isPixel
            ? 'w-full max-w-2xl mx-4 px-card overflow-hidden flex flex-col max-h-[90vh]'
            : `w-full max-w-2xl mx-4 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
                isDark ? 'bg-zinc-900 border border-white/10' : 'bg-white border border-black/10'
              }`
        }
      >
        {/* 头部 */}
        <div
          className={`flex items-center gap-3 px-5 py-4 border-b shrink-0 ${
            isPixel
              ? 'border-[var(--px-ink)] bg-[var(--px-yellow)]'
              : isDark
                ? 'border-white/10'
                : 'border-black/10'
          }`}
        >
          <KeyRound size={18} className={isPixel ? 'text-[var(--px-ink)]' : isDark ? 'text-white/80' : 'text-zinc-700'} />
          <div className="flex-1">
            <h2
              className={`text-base font-semibold ${
                isPixel ? 'px-title text-[var(--px-ink)]' : isDark ? 'text-white' : 'text-zinc-900'
              }`}
            >
              API Key 设置 (通用 + 分类独立)
            </h2>
            <p className={`text-xs mt-0.5 ${hintCls}`}>
              留空表示保持后端已存的 Key 不变 · 输入新值即覆盖 · 点眼睛可预览明文。
            </p>
          </div>
          <button
            onClick={onClose}
            className={
              isPixel
                ? 'px-btn px-btn--icon px-btn--ghost'
                : `p-1.5 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`
            }
          >
            <X size={18} />
          </button>
        </div>

        {/* 表单 */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* 三套通用 Key */}
          {renderKey(COMMON_KEYS[0], { baseUrlNote: `Base URL 锁定: ${FIXED_ZHENZHEN_BASE}` })}
          {renderKey(COMMON_KEYS[1], {
            baseUrlNote: `Base URL: ${RH_BASE}`,
            extras: (
              <>
                <a
                  href="https://www.runninghub.cn/user-center/1819214514410942465/webapp?inviteCode=rh-v1121"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    isPixel
                      ? 'px-btn px-btn--sm px-btn--peach inline-flex items-center gap-1'
                      : `inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${
                          isDark
                            ? 'bg-orange-500/10 border-orange-500/40 text-orange-300 hover:bg-orange-500/20 hover:border-orange-400/60'
                            : 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100'
                        }`
                  }
                  title="跳转 RunningHub 国内站获取 ApiKey（邀请码 rh-v1121）"
                >
                  <span>获取 RH APIKEY（国内）</span>
                  <ExternalLink size={11} className="opacity-70" />
                </a>
                <a
                  href="https://www.runninghub.ai/user-center/1907375370302308353/webapp?inviteCode=rh-v1121"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={
                    isPixel
                      ? 'px-btn px-btn--sm px-btn--yellow inline-flex items-center gap-1'
                      : `inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${
                          isDark
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/60'
                            : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                        }`
                  }
                  title="跳转 RunningHub 海外站获取 ApiKey（邀请码 rh-v1121）"
                >
                  <span>获取 RH APIKEY（海外）</span>
                  <ExternalLink size={11} className="opacity-70" />
                </a>
              </>
            ),
          })}
          {renderKey(COMMON_KEYS[2], { baseUrlNote: `Base URL 锁定: ${FIXED_ZHENZHEN_BASE} (与贞贞同地址, Key 独立)` })}

          {/* 分类独立 Key */}
          <div className={`pt-3 border-t ${isPixel ? 'border-[var(--px-ink)]/30' : isDark ? 'border-white/10' : 'border-black/10'}`}>
            <div className={`text-xs font-bold mb-1 ${labelCls}`}>
              分类独立 API Key【可选】
            </div>
            <div className={`text-[11px] ${hintCls} mb-3`}>
              为不同模型系列单独配置 Key；<b>未填则自动 fallback 到贞贞工坊通用 Key</b>。后端会根据调用的模型名/路由自动选择。
            </div>
            <div className="space-y-4">
              {CLASSIFIED_KEYS.map((spec) => renderKey(spec, { fallbackHint: true }))}
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              ❌ {error}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          className={`flex items-center justify-end gap-2 px-5 py-3 border-t shrink-0 ${
            isPixel
              ? 'border-[var(--px-ink)] bg-[var(--px-muted)]'
              : isDark
                ? 'border-white/10 bg-white/[0.02]'
                : 'border-black/10 bg-black/[0.02]'
          }`}
        >
          <button
            onClick={onClose}
            className={
              isPixel
                ? 'px-btn'
                : `px-4 py-2 text-sm rounded-md ${
                    isDark ? 'hover:bg-white/10 text-white/80' : 'hover:bg-black/5 text-zinc-700'
                  }`
            }
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className={
              isPixel
                ? 'px-btn px-btn--mint disabled:opacity-50 flex items-center gap-2'
                : 'px-4 py-2 text-sm rounded-md bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-2 disabled:opacity-50'
            }
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saved ? (
              <span>✓ 已保存</span>
            ) : (
              <Save size={14} />
            )}
            {!loading && !saved && '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

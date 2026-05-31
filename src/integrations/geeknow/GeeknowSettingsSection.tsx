/**
 * Geeknow API 设置面板片段（嵌入 ApiSettings 弹窗）
 *
 * 与 QiniuSettingsSection / GrsaiSettingsSection 完全同构。
 * 关键差异：
 *  - 圆点配色：bg-amber-400（与 GeeknowLlmNode 头部 amber 主题一致）
 *  - 用途：LLM 推理（OpenAI Chat Completions 兼容协议）
 *  - 外链：geeknow.top 控制台
 */
import { ExternalLink, Eye, EyeOff, Globe, Lock } from 'lucide-react';
import { DEFAULT_GEEKNOW_BASE } from '../../stores/apiKeys';

interface Props {
  rawSettings: any;

  geeknowApiKeyInput: string;
  showApiKey: boolean;
  onApiKeyChange: (v: string) => void;
  onToggleShow: () => void;

  geeknowBaseUrlInput: string;
  onBaseUrlChange: (v: string) => void;

  isPixel: boolean;
  isDark: boolean;
  inputCls: string;
  labelCls: string;
  hintCls: string;
  eyeBtnCls: string;
  linkBtnCls: string;
}

function toMaskedDisplay(v?: string): string {
  if (!v) return '';
  const s = String(v);
  if (/^\*{2,}/.test(s)) return s;
  if (s.length <= 4) return '****';
  return '****' + s.slice(-4);
}

export default function GeeknowSettingsSection({
  rawSettings,
  geeknowApiKeyInput,
  showApiKey,
  onApiKeyChange,
  onToggleShow,
  geeknowBaseUrlInput,
  onBaseUrlChange,
  isPixel,
  isDark,
  inputCls,
  labelCls,
  hintCls,
  eyeBtnCls,
  linkBtnCls,
}: Props) {
  const rawVal = rawSettings?.geeknowApiKey as string | undefined;
  const hasSaved = !!rawVal;
  const maskedDisplay = toMaskedDisplay(rawVal);

  const openExternal = (url: string) => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* noop */
    }
  };

  const switchBtnCls = isPixel
    ? 'px-btn text-[11px] px-2 py-1'
    : `text-[11px] px-2 py-1 rounded-md border ${
        isDark ? 'border-white/15 hover:bg-white/10 text-white/70' : 'border-black/15 hover:bg-black/5 text-zinc-700'
      }`;

  return (
    <>
      <div className="space-y-2">
        <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Geeknow API Key
          <span className={`text-[11px] font-normal ${hintCls}`}>
            · 独立 provider · 用于「Geeknow LLM」节点（OpenAI Chat Completions 兼容，GPT/Claude/Gemini/DeepSeek/Qwen）
          </span>
          {hasSaved && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ✓ 已保存 {maskedDisplay}
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={geeknowApiKeyInput}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={hasSaved ? '留空保持不变 / 输入新值覆盖' : '请输入 sk-...'}
            className={inputCls}
            autoComplete="off"
          />
          <button
            onClick={onToggleShow}
            className={eyeBtnCls}
            title={showApiKey ? '隐藏' : '显示明文'}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div className={`flex items-center gap-2 flex-wrap text-[11px] ${hintCls}`}>
          <span className="flex items-center gap-1.5">
            <Lock size={11} /> Base URL 可在下方切换 (默认: {DEFAULT_GEEKNOW_BASE})
          </span>
          <button
            type="button"
            onClick={() => openExternal('https://docs.geeknow.top')}
            className={linkBtnCls}
            title="前往 Geeknow 文档查看 API 说明"
          >
            <ExternalLink size={11} /> 接口文档
          </button>
        </div>
      </div>

      <div className="ml-4 -mt-1">
        <label className={`text-[11px] font-medium flex items-center gap-1.5 mb-1 ${labelCls}`}>
          <Globe size={11} /> Geeknow Base URL
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={geeknowBaseUrlInput}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={`默认 ${DEFAULT_GEEKNOW_BASE}（也可填自建中转域名）`}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => onBaseUrlChange(DEFAULT_GEEKNOW_BASE)}
            className={switchBtnCls}
            title="恢复默认 Geeknow 主站"
          >
            默认
          </button>
        </div>
      </div>
    </>
  );
}

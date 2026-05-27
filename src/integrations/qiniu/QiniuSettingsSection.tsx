/**
 * 七牛云 API 设置面板片段（嵌入 ApiSettings 弹窗）
 *
 * 设计原则：完全自包含 — ApiSettings 内只放一行 `<QiniuSettingsSection ... />`，
 * 所有渲染、外链、海外/国内端点切换都在本组件内。
 * 状态（input/show/baseUrl）仍由 ApiSettings 统一持有并通过 props 注入，
 * 这样能复用 ApiSettings 的「一次保存」体验。
 */
import { ExternalLink, Eye, EyeOff, Globe, Lock } from 'lucide-react';
import { DEFAULT_QINIU_BASE } from '../../stores/apiKeys';

interface Props {
  /** 后端脱敏后的 rawSettings（用于显示「✓ 已保存 ****xxxx」） */
  rawSettings: any;

  /** 受控输入：七牛 API Key */
  qiniuApiKeyInput: string;
  showApiKey: boolean;
  onApiKeyChange: (v: string) => void;
  onToggleShow: () => void;

  /** 受控输入：七牛 Base URL（默认国内，可切海外） */
  qiniuBaseUrlInput: string;
  onBaseUrlChange: (v: string) => void;

  /** 主题样式 token（直接复用父组件计算好的 className 串，避免重复计算） */
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

export default function QiniuSettingsSection({
  rawSettings,
  qiniuApiKeyInput,
  showApiKey,
  onApiKeyChange,
  onToggleShow,
  qiniuBaseUrlInput,
  onBaseUrlChange,
  isPixel,
  isDark,
  inputCls,
  labelCls,
  hintCls,
  eyeBtnCls,
  linkBtnCls,
}: Props) {
  const rawVal = rawSettings?.qiniuApiKey as string | undefined;
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
      {/* Key 输入行 */}
      <div className="space-y-2">
        <label className={`text-sm font-medium flex items-center gap-2 flex-wrap ${labelCls}`}>
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          七牛云 API Key
          <span className={`text-[11px] font-normal ${hintCls}`}>
            · 独立 provider · 用于「七牛」Tab 图像生成（gemini-3.1-flash-image-preview / openai/gpt-image-2）
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
            value={qiniuApiKeyInput}
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
            <Lock size={11} /> Base URL 可在下方切换 (默认国内: {DEFAULT_QINIU_BASE})
          </span>
          <button
            type="button"
            onClick={() => openExternal('https://portal.qiniu.com/ai-inference/api-key')}
            className={linkBtnCls}
            title="前往七牛云控制台获取 API Key"
          >
            <ExternalLink size={11} /> 获取 APIKey
          </button>
        </div>
      </div>

      {/* baseUrl 输入行（缩进对齐到 Key 之下） */}
      <div className="ml-4 -mt-1">
        <label className={`text-[11px] font-medium flex items-center gap-1.5 mb-1 ${labelCls}`}>
          <Globe size={11} /> 七牛云 Base URL
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={qiniuBaseUrlInput}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={`默认 ${DEFAULT_QINIU_BASE}（海外用 https://openai.sufy.com）`}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => onBaseUrlChange(DEFAULT_QINIU_BASE)}
            className={switchBtnCls}
            title="切回国内端点"
          >
            国内
          </button>
          <button
            type="button"
            onClick={() => onBaseUrlChange('https://openai.sufy.com')}
            className={switchBtnCls}
            title="切到海外端点"
          >
            海外
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Grsai API 设置面板片段（嵌入 ApiSettings 弹窗）
 *
 * 与 QiniuSettingsSection 完全同构：自包含渲染，ApiSettings 内只放一行调用。
 * 关键差异：
 *  - 圆点配色：bg-violet-400（七牛是 sky）
 *  - 端点切换：国内 grsai.dakka.com.cn / 全球 grsaiapi.com
 *  - 外链：grsai.ai dashboard
 */
import { ExternalLink, Eye, EyeOff, Globe, Lock } from 'lucide-react';
import { DEFAULT_GRSAI_BASE } from '../../stores/apiKeys';

const GRSAI_GLOBAL_BASE = 'https://grsaiapi.com';

interface Props {
  rawSettings: any;

  grsaiApiKeyInput: string;
  showApiKey: boolean;
  onApiKeyChange: (v: string) => void;
  onToggleShow: () => void;

  grsaiBaseUrlInput: string;
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

export default function GrsaiSettingsSection({
  rawSettings,
  grsaiApiKeyInput,
  showApiKey,
  onApiKeyChange,
  onToggleShow,
  grsaiBaseUrlInput,
  onBaseUrlChange,
  isPixel,
  isDark,
  inputCls,
  labelCls,
  hintCls,
  eyeBtnCls,
  linkBtnCls,
}: Props) {
  const rawVal = rawSettings?.grsaiApiKey as string | undefined;
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
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          Grsai API Key
          <span className={`text-[11px] font-normal ${hintCls}`}>
            · 独立 provider · 用于「Grsai」Tab 图像生成（nano-banana / gpt-image-2 自有协议）
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
            value={grsaiApiKeyInput}
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
            <Lock size={11} /> Base URL 可在下方切换 (默认国内: {DEFAULT_GRSAI_BASE})
          </span>
          <button
            type="button"
            onClick={() => openExternal('https://grsai.ai/zh/dashboard/api-keys')}
            className={linkBtnCls}
            title="前往 grsai.ai 控制台获取 API Key"
          >
            <ExternalLink size={11} /> 获取 APIKey
          </button>
        </div>
      </div>

      {/* baseUrl 输入行 */}
      <div className="ml-4 -mt-1">
        <label className={`text-[11px] font-medium flex items-center gap-1.5 mb-1 ${labelCls}`}>
          <Globe size={11} /> Grsai Base URL
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={grsaiBaseUrlInput}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={`默认 ${DEFAULT_GRSAI_BASE}（全球用 ${GRSAI_GLOBAL_BASE}）`}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => onBaseUrlChange(DEFAULT_GRSAI_BASE)}
            className={switchBtnCls}
            title="切回国内端点"
          >
            国内
          </button>
          <button
            type="button"
            onClick={() => onBaseUrlChange(GRSAI_GLOBAL_BASE)}
            className={switchBtnCls}
            title="切到全球端点"
          >
            全球
          </button>
        </div>
      </div>
    </>
  );
}

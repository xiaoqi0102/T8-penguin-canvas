/**
 * Grsai 图像参数面板（ImageNode 内嵌）
 *
 * 三组控件：
 *  - aspectRatio：候选根据当前 model 动态调整
 *      * 通用比例：'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'
 *      * nano-banana-2 系列额外：'1:4', '4:1', '1:8', '8:1'
 *      * gpt-image-2-vip：必须像素串，提供常用预设；不显示比例字符串
 *      * gpt-image-2（非 vip）：通用比例 + 常用像素串预设
 *  - imageSize（1K/2K/4K）：仅 nano-banana 系列显示
 *  - 状态写回 node data 的 grsaiAspectRatio / grsaiImageSize
 */
import { useMemo, type ChangeEvent } from 'react';

interface Props {
  d: any;
  update: (patch: any) => void;
  /** 当前 apiModel（用于决定比例候选与是否显示 imageSize） */
  apiModel: string;
}

const COMMON_RATIOS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
const NANO_BANANA_2_EXTRA = ['1:4', '4:1', '1:8', '8:1'];
// gpt-image-2 系列额外可用的像素串（vip 必须用、非 vip 可选）
const GPT_IMAGE_2_PIXELS = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '2048x2048',
  '2048x1152',
  '2880x2880',
  '3840x2160',
  '2160x3840',
];

function isNanoBananaSeries(model: string): boolean {
  return /^nano-banana/i.test(String(model || ''));
}
function isNanoBanana2Series(model: string): boolean {
  return /^nano-banana-2/i.test(String(model || ''));
}
function isGptImage2Vip(model: string): boolean {
  return /^gpt-image-2.*vip$/i.test(String(model || ''));
}
function isGptImage2(model: string): boolean {
  return /^gpt-image-2/i.test(String(model || ''));
}

export default function GrsaiImageTab({ d, update, apiModel }: Props) {
  const ratioOptions = useMemo(() => {
    if (isGptImage2Vip(apiModel)) {
      // vip 强制像素串
      return GPT_IMAGE_2_PIXELS;
    }
    const out = [...COMMON_RATIOS];
    if (isNanoBanana2Series(apiModel)) out.push(...NANO_BANANA_2_EXTRA);
    if (isGptImage2(apiModel)) out.push(...GPT_IMAGE_2_PIXELS);
    return out;
  }, [apiModel]);

  const showImageSize = isNanoBananaSeries(apiModel);
  const grsaiAspectRatio = d?.grsaiAspectRatio || ratioOptions[0];
  const grsaiImageSize = d?.grsaiImageSize || '1K';

  const onRatio = (e: ChangeEvent<HTMLSelectElement>) => update({ grsaiAspectRatio: e.target.value });
  const onSize = (e: ChangeEvent<HTMLSelectElement>) => update({ grsaiImageSize: e.target.value });

  return (
    <div className="space-y-2 rounded border border-violet-400/30 bg-violet-500/5 p-2">
      <div className="text-[10px] text-violet-300 font-semibold tracking-wide">
        ✦ Grsai · 自有协议 · /v1/api/generate → /v1/api/result
        {isGptImage2Vip(apiModel) && <span className="ml-1 text-violet-200/80">· vip 模型仅接受像素串</span>}
      </div>
      <div className={`grid ${showImageSize ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
        <div>
          <label className="text-[10px] text-white/50 block mb-1">
            {isGptImage2Vip(apiModel) ? 'Size (像素)' : 'AspectRatio'}
          </label>
          <select
            value={grsaiAspectRatio}
            onChange={onRatio}
            style={{ background: '#18181b', color: '#ffffff' }}
            className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
          >
            {ratioOptions.map((r) => (
              <option key={r} value={r} style={{ background: '#18181b', color: '#ffffff' }}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {showImageSize && (
          <div>
            <label className="text-[10px] text-white/50 block mb-1">ImageSize</label>
            <select
              value={grsaiImageSize}
              onChange={onSize}
              style={{ background: '#18181b', color: '#ffffff' }}
              className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
            >
              {['1K', '2K', '4K'].map((s) => (
                <option key={s} value={s} style={{ background: '#18181b', color: '#ffffff' }}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

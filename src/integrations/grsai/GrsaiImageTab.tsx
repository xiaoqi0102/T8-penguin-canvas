/**
 * Grsai 图像参数面板（ImageNode 内嵌）
 *
 * 两组控件：
 *  - aspectRatio：候选根据当前 apiModel 动态调整（来自 sizeMap.getGrsaiRatiosForApiModel）
 *      * nano-banana / nano-banana-pro 系列 ：通用 11 个比例（≤3:1）
 *      * nano-banana-2 系列 ：通用 11 + 极端 4 个（1:4 / 4:1 / 1:8 / 8:1）
 *      * gpt-image-2 / gpt-image-2-vip ：通用 11 个比例（vip 在 runner 中转像素串）
 *  - imageSize（1K/2K/4K）：仅 nano-banana 系列显示
 *  - 状态写回 node data 的 grsaiAspectRatio / grsaiImageSize
 */
import type { ChangeEvent } from 'react';
import { getGrsaiRatiosForApiModel, DEFAULT_GRSAI_RATIO } from './sizeMap';

interface Props {
  d: any;
  update: (patch: any) => void;
  /** 当前 apiModel（用于决定比例候选与是否显示 imageSize） */
  apiModel: string;
}

function isNanoBananaSeries(model: string): boolean {
  return /^nano-banana/i.test(String(model || ''));
}

export default function GrsaiImageTab({ d, update, apiModel }: Props) {
  const ratioOptions = getGrsaiRatiosForApiModel(apiModel);
  const showImageSize = isNanoBananaSeries(apiModel);
  // 兼容旧画布（早期允许的像素串）+ 跨子模型迁移：不在当前 apiModel 支持列表中的值，
  // 在渲染时回退到默认；真实数据迁移由 ImageNode 的 apiModel onChange 负责
  const rawRatio = d?.grsaiAspectRatio;
  const grsaiAspectRatio = rawRatio && ratioOptions.includes(rawRatio) ? rawRatio : DEFAULT_GRSAI_RATIO;
  const grsaiImageSize = d?.grsaiImageSize || '1K';

  const onRatio = (e: ChangeEvent<HTMLSelectElement>) => update({ grsaiAspectRatio: e.target.value });
  const onSize = (e: ChangeEvent<HTMLSelectElement>) => update({ grsaiImageSize: e.target.value });

  return (
    <div className="space-y-2 rounded border border-violet-400/30 bg-violet-500/5 p-2">
      <div className="text-[10px] text-violet-300 font-semibold tracking-wide">
        ✦ Grsai · 自有协议 · /v1/api/generate → /v1/api/result
      </div>
      <div className={`grid ${showImageSize ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
        <div>
          <label className="text-[10px] text-white/50 block mb-1">AspectRatio</label>
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

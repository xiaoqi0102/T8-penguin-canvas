/**
 * Grsai 图像参数面板（ImageNode 内嵌）
 *
 * 两组控件：
 *  - aspectRatio：候选根据当前 apiModel 动态调整（来自 sizeMap.getGrsaiRatiosForApiModel）
 *      * nano-banana / nano-banana-pro 系列 ：通用 11 个比例（≤3:1）
 *      * nano-banana-2 系列 ：通用 11 + 极端 4 个（1:4 / 4:1 / 1:8 / 8:1）
 *      * gpt-image-2 ：通用 11 个比例（直接上送比例字符串）
 *      * gpt-image-2-vip ：14 比例（去 auto，加 1:3 / 3:1 / 2:1 / 1:2），由 runner 按清晰度档转像素串
 *  - imageSize（1K/2K/4K）：nano-banana 系列 + gpt-image-2-vip 都显示
 *      * nano-banana 系列：直接上送 imageSize 字段
 *      * gpt-image-2-vip：本地查表（DOC_PRESETS_BY_RES），不上送 imageSize
 *  - 状态写回 node data 的 grsaiAspectRatio / grsaiImageSize
 */
import type { ChangeEvent } from 'react';
import { getGrsaiRatiosForApiModel, isGptImage2VipModel, DEFAULT_GRSAI_RATIO } from './sizeMap';

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
  const showImageSize = isNanoBananaSeries(apiModel) || isGptImage2VipModel(apiModel);
  // 兼容旧画布（早期允许的像素串）+ 跨子模型迁移：不在当前 apiModel 支持列表中的值，
  // 在渲染时回退到默认；真实数据迁移由 ImageNode 的 apiModel onChange 负责
  const rawRatio = d?.grsaiAspectRatio;
  const grsaiAspectRatio = rawRatio && ratioOptions.includes(rawRatio) ? rawRatio : DEFAULT_GRSAI_RATIO;
  const grsaiImageSize = d?.grsaiImageSize || '1K';

  const onRatio = (e: ChangeEvent<HTMLSelectElement>) => update({ grsaiAspectRatio: e.target.value });
  const onSize = (e: ChangeEvent<HTMLSelectElement>) => update({ grsaiImageSize: e.target.value });

  return (
    <div className={`grid ${showImageSize ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
      <div>
        <label className="text-[10px] text-white/50 block mb-1">比例</label>
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
          <label className="text-[10px] text-white/50 block mb-1">尺寸</label>
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
  );
}

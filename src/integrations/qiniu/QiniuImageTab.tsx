/**
 * 七牛云图像参数面板（ImageNode 内嵌）
 * 只渲染 quality + size 两个 select。size 显示的是比例（1:1 / 16:9 …），
 * 不同 apiModel 显示的比例集合不同：
 *   - gemini-3.1-flash-image-preview ：全 14 个比例 + auto
 *   - openai/gpt-image-2 ：仅 10 个 ≤3:1 比例 + auto（文档约束）
 * 状态读写直接走父节点 data，不持有本地 state。
 */
import type { ChangeEvent } from 'react';
import { getQiniuRatiosForApiModel, DEFAULT_QINIU_RATIO } from './sizeMap';

interface Props {
  d: any;
  update: (patch: any) => void;
  /** 当前 apiModel —— 决定 size 下拉支持的比例集合 */
  apiModel: string;
}

const QUALITIES: Array<{ value: 'auto' | 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function QiniuImageTab({ d, update, apiModel }: Props) {
  const qiniuQuality = d?.qiniuQuality || 'auto';
  const sizes = getQiniuRatiosForApiModel(apiModel);
  // 兼容旧画布（早期像素串）+ 跨子模型迁移（gemini 选 '1:4' 后切到 gpt-image-2）：
  // 不在当前 apiModel 支持列表中的值，在渲染时回退到默认；实际数据迁移由
  // ImageNode 的 apiModel onChange 负责，避免 useEffect 副作用。
  const rawSize = d?.qiniuSize;
  const qiniuSize = rawSize && sizes.includes(rawSize) ? rawSize : DEFAULT_QINIU_RATIO;

  const onQuality = (e: ChangeEvent<HTMLSelectElement>) => update({ qiniuQuality: e.target.value });
  const onSize = (e: ChangeEvent<HTMLSelectElement>) => update({ qiniuSize: e.target.value });

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[10px] text-white/50 block mb-1">质量</label>
        <select
          value={qiniuQuality}
          onChange={onQuality}
          style={{ background: '#18181b', color: '#ffffff' }}
          className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
        >
          {QUALITIES.map((q) => (
            <option key={q.value} value={q.value} style={{ background: '#18181b', color: '#ffffff' }}>
              {q.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-white/50 block mb-1">比例</label>
        <select
          value={qiniuSize}
          onChange={onSize}
          style={{ background: '#18181b', color: '#ffffff' }}
          className="w-full rounded border border-white/10 px-2 py-1 text-xs outline-none focus:border-white/30"
        >
          {sizes.map((s) => (
            <option key={s} value={s} style={{ background: '#18181b', color: '#ffffff' }}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

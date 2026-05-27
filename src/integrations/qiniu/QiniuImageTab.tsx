/**
 * 七牛云图像参数面板（ImageNode 内嵌）
 * 只渲染 quality + size 两个 select，状态读写直接走父节点 data，不持有本地 state。
 */
import type { ChangeEvent } from 'react';

interface Props {
  d: any;
  update: (patch: any) => void;
  /** 来自 modelDef.sizes 的 size 候选枚举 */
  sizes: string[];
}

const QUALITIES: Array<{ value: 'auto' | 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function QiniuImageTab({ d, update, sizes }: Props) {
  const qiniuQuality = d?.qiniuQuality || 'auto';
  const qiniuSize = d?.qiniuSize || (sizes[0] ?? 'auto');

  const onQuality = (e: ChangeEvent<HTMLSelectElement>) => update({ qiniuQuality: e.target.value });
  const onSize = (e: ChangeEvent<HTMLSelectElement>) => update({ qiniuSize: e.target.value });

  return (
    <div className="space-y-2 rounded border border-sky-400/30 bg-sky-500/5 p-2">
      <div className="text-[10px] text-sky-300 font-semibold tracking-wide">
        ☁ 七牛云 · OpenAI 兼容 · 有参考图走 /edits，无参考图走 /generations
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-white/50 block mb-1">Quality</label>
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
          <label className="text-[10px] text-white/50 block mb-1">Size</label>
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
    </div>
  );
}

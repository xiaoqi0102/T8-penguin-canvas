import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps, type ResizeParams } from '@xyflow/react';
import { Type } from 'lucide-react';
import { useUpdateNodeData } from './useUpdateNodeData';
import ResizableCorners from './ResizableCorners';
import { getCornerResizeBehavior } from '../../utils/nodeResizeBehavior';

/**
 * 文本节点 - 提示词输入
 * 输出 data.prompt 给下游(图像/LLM 节点通过连接读取)
 *
 * v1.x: 固定宽 260 + textarea h-24
 * v2.x: 选中后可拖 4 角缩放 (ResizableCorners + xyflow NodeResizeControl);
 *       内部布局改为响应式 (width/height 100%), textarea 占所有剩余高度
 * v2.1: root 用本地 state 持有具体 px 尺寸 — 解决 width:'100%' + wrapper auto 形成百分比循环
 *       测量异常 (measured.width=0 → NodeResizeControl 算出 aspectRatio=0 → 只能纵向拉大) 的问题。
 *       同时 root 始终有具体 px → wrapper measured 准确 → handleBounds 准确, 连线稳定。
 */
const TextNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const syncRafRef = useRef<{ first?: number; second?: number }>({});
  const text = ((data as any)?.prompt as string) || '';
  const resizeBehavior = getCornerResizeBehavior('text');
  // 节点本地尺寸 state: 默认 (260, 由内容撑高) → 拖角后由 ResizableCorners onResize 同步具体 px
  const [size, setSize] = useState<{ w: number; h?: number }>({ w: 260 });

  const syncNodeInternals = useCallback(() => {
    if (syncRafRef.current.first) window.cancelAnimationFrame(syncRafRef.current.first);
    if (syncRafRef.current.second) window.cancelAnimationFrame(syncRafRef.current.second);

    syncRafRef.current.first = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
      syncRafRef.current.second = window.requestAnimationFrame(() => updateNodeInternals(id));
    });

    return () => {
      if (syncRafRef.current.first) window.cancelAnimationFrame(syncRafRef.current.first);
      if (syncRafRef.current.second) window.cancelAnimationFrame(syncRafRef.current.second);
      syncRafRef.current = {};
    };
  }, [id, updateNodeInternals]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return syncNodeInternals();

    const cleanup = syncNodeInternals();
    const observer = new ResizeObserver(() => {
      syncNodeInternals();
    });
    observer.observe(el);

    return () => {
      cleanup();
      observer.disconnect();
    };
  }, [syncNodeInternals]);

  useLayoutEffect(() => syncNodeInternals(), [selected, size.w, size.h, syncNodeInternals]);

  const handleResize = useCallback(
    (_e: unknown, params: ResizeParams) => {
      setSize({ w: params.width, h: params.height });
      syncNodeInternals();
    },
    [syncNodeInternals],
  );

  return (
    <div
      ref={rootRef}
      className={`relative rounded-xl border-2 transition-all flex flex-col ${
        selected ? 'border-sky-400 shadow-2xl shadow-sky-500/20' : 'border-white/15 hover:border-white/30'
      }`}
      style={{
        background: 'rgba(20,20,22,.92)',
        backdropFilter: 'blur(8px)',
        width: size.w,
        height: size.h, // undefined → auto, 跟随内容自然高; 拖角后变成具体 px
        minWidth: 220,
      }}
    >
      {/* 四角自由缩放 (仅选中时出现) — 主题色用 sky-400 */}
      <ResizableCorners
        selected={selected}
        minWidth={220}
        minHeight={140}
        accent="#38bdf8"
        keepAspectRatio={resizeBehavior.keepAspectRatio}
        onResize={handleResize}
        onResizeEnd={() => syncNodeInternals()}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-sky-400 !border-0"
        style={{
          top: '50%',
          right: -5,
          width: 10,
          height: 10,
          minWidth: 10,
          minHeight: 10,
          transform: 'translateY(-50%)',
          zIndex: 12,
          pointerEvents: 'all',
        }}
      />

      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: 'rgba(14,165,233,.18)', color: '#7dd3fc', boxShadow: 'inset 0 0 0 1px rgba(14,165,233,.4)' }}
        >
          <Type size={13} />
        </div>
        <div className="flex-1 text-sm font-semibold text-white">文本</div>
        <span className="text-[10px] text-white/30">prompt</span>
      </div>

      <div className={`p-2.5 flex flex-col ${size.h ? 'flex-1 min-h-0' : ''}`}>
        <textarea
          value={text}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="输入提示词..."
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className={`w-full resize-none rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white outline-none focus:border-white/30 placeholder:text-white/30 nodrag nowheel ${
            size.h ? 'flex-1 min-h-[72px]' : 'h-24'
          }`}
          // 阻止 reactflow 拖拽冒泡
          onMouseDown={(e) => e.stopPropagation()}
        />
        <div className="text-[10px] text-white/30 mt-1 flex justify-between shrink-0">
          <span>{text.length} 字符</span>
          <span>→ 输出到下游节点</span>
        </div>
      </div>
    </div>
  );
};

export default memo(TextNode);

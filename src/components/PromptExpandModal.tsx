import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, Copy, ListFilter, Wand2, X } from 'lucide-react';

export type PromptExpandEditorKind = 'text' | 'json' | 'lines';

interface PromptExpandModalProps {
  open: boolean;
  title: string;
  value: string;
  onValueChange: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
  placeholder?: string;
  isDark: boolean;
  isPixel: boolean;
  readOnly?: boolean;
  mono?: boolean;
  editorKind?: PromptExpandEditorKind;
  children?: ReactNode;
}

function promptStats(value: string) {
  const text = String(value || '');
  const lines = text.length === 0 ? 1 : text.split(/\r\n|\r|\n/).length;
  return { chars: text.length, lines };
}

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof window !== 'undefined') window.prompt('复制文本:', value);
}

function formatJson(value: string) {
  const parsed = JSON.parse(value || '{}');
  return JSON.stringify(parsed, null, 2);
}

function validateJson(value: string) {
  JSON.parse(value || '{}');
}

function normalizeLines(value: string) {
  const seen = new Set<string>();
  const lines = String(value || '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return lines.join('\n');
}

export default function PromptExpandModal({
  open,
  title,
  value,
  onValueChange,
  onApply,
  onCancel,
  placeholder,
  isDark,
  isPixel,
  readOnly = false,
  mono = false,
  editorKind = 'text',
  children,
}: PromptExpandModalProps) {
  const stats = useMemo(() => promptStats(value), [value]);
  const [toolMessage, setToolMessage] = useState('');

  useEffect(() => {
    if (open) setToolMessage('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (!readOnly) onApply();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onApply, onCancel, open, readOnly]);

  if (!open || typeof document === 'undefined') return null;

  const shellClass = isPixel
    ? 'px-card text-[var(--px-ink)]'
    : `rounded-lg border shadow-2xl ${
        isDark ? 'border-white/10 bg-zinc-950 text-zinc-100' : 'border-black/10 bg-white text-zinc-900'
      }`;
  const btnBase = isPixel
    ? 'px-btn px-btn--sm'
    : `inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors ${
        isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'
      }`;
  const primaryBtn = isPixel
    ? 'px-btn px-btn--sm px-btn--yellow'
    : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-cyan-400 px-3 text-xs font-bold text-slate-950 hover:bg-cyan-300';
  const textareaCls = isPixel
    ? 'px-input h-full w-full resize-none text-sm leading-relaxed'
    : `h-full w-full resize-none rounded-md border px-3 py-2 text-sm leading-relaxed outline-none ${
        isDark
          ? 'border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-cyan-300/60'
          : 'border-black/10 bg-black/[0.03] text-zinc-900 placeholder:text-zinc-400 focus:border-cyan-500/70'
      } ${mono ? 'font-mono' : ''}`;
  const toolBtn = isPixel
    ? 'px-btn px-btn--sm'
    : `inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors ${
        isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/10' : 'border-black/10 bg-black/[0.02] hover:bg-black/5'
      }`;

  const handleFormatJson = () => {
    try {
      const formatted = formatJson(value);
      onValueChange(formatted);
      setToolMessage('JSON 已格式化');
    } catch (error: any) {
      setToolMessage(`JSON 格式错误：${error?.message || '无法解析'}`);
    }
  };

  const handleValidateJson = () => {
    try {
      validateJson(value);
      setToolMessage('JSON 格式正确');
    } catch (error: any) {
      setToolMessage(`JSON 格式错误：${error?.message || '无法解析'}`);
    }
  };

  const handleNormalizeLines = () => {
    onValueChange(normalizeLines(value));
    setToolMessage('已整理为空行去重列表');
  };

  return createPortal(
    <div
      data-canvas-floating-ui="prompt-expand-editor"
      className="fixed inset-0 z-[10080] flex items-center justify-center bg-black/45 p-3"
      onMouseDown={onCancel}
    >
      <section
        className={`${shellClass} flex h-[min(82vh,860px)] w-[min(1080px,calc(100vw-24px))] flex-col overflow-hidden`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || '放大编辑提示词'}
      >
        <header
          className={`flex items-center justify-between gap-3 px-4 py-3 ${
            isPixel ? 'border-b-2 border-[var(--px-ink)]' : isDark ? 'border-b border-white/10' : 'border-b border-black/10'
          }`}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{title || '放大编辑提示词'}</div>
            <div className={`mt-0.5 text-[11px] ${isPixel ? 'text-[var(--px-ink)] opacity-70' : isDark ? 'text-white/45' : 'text-zinc-500'}`}>
              {stats.chars} 字 · {stats.lines} 行 · Alt+Enter 打开 · Ctrl+Enter 完成 · Esc 取消
            </div>
          </div>
          <button type="button" className={btnBase} onClick={onCancel} title="关闭">
            <X size={14} />
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col p-4">
          {editorKind !== 'text' && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {editorKind === 'json' && (
                <>
                  <button type="button" className={toolBtn} onClick={handleFormatJson} disabled={readOnly}>
                    <Wand2 size={13} /> 格式化 JSON
                  </button>
                  <button type="button" className={toolBtn} onClick={handleValidateJson}>
                    <CheckCircle2 size={13} /> 校验 JSON
                  </button>
                </>
              )}
              {editorKind === 'lines' && (
                <button type="button" className={toolBtn} onClick={handleNormalizeLines} disabled={readOnly}>
                  <ListFilter size={13} /> 整理列表
                </button>
              )}
              {toolMessage && (
                <span className={`text-[11px] ${toolMessage.includes('错误') ? 'text-red-400' : isDark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                  {toolMessage}
                </span>
              )}
            </div>
          )}
          {children || (
            <textarea
              autoFocus
              readOnly={readOnly}
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder={placeholder}
              className={textareaCls}
              spellCheck={false}
            />
          )}
        </main>

        <footer
          className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${
            isPixel ? 'border-t-2 border-[var(--px-ink)]' : isDark ? 'border-t border-white/10' : 'border-t border-black/10'
          }`}
        >
          <div className={`text-[11px] ${isPixel ? 'text-[var(--px-ink)] opacity-70' : isDark ? 'text-white/45' : 'text-zinc-500'}`}>
            {readOnly ? '当前字段为只读，可查看或复制。' : '完成后会写回原节点字段。'}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btnBase} onClick={() => copyText(value)} title="复制当前文本">
              <Copy size={13} /> 复制
            </button>
            <button type="button" className={btnBase} onClick={onCancel}>
              取消
            </button>
            <button type="button" className={`${primaryBtn} ${readOnly ? 'opacity-45' : ''}`} disabled={readOnly} onClick={onApply}>
              <Check size={13} /> 完成
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

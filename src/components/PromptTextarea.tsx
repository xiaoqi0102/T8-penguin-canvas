import {
  forwardRef,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { Library, Maximize2 } from 'lucide-react';
import { useThemeStore } from '../stores/theme';
import { useShortcutStore } from '../stores/shortcuts';
import { formatShortcutList, matchesAnyShortcut } from '../utils/keyboardShortcuts';
import type { PromptTemplateKind } from '../data/promptTemplateLibrary';
import PromptExpandModal, { type PromptExpandEditorKind } from './PromptExpandModal';
import PromptTemplateLibraryModal from './PromptTemplateLibraryModal';

interface PromptTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  title: string;
  containerClassName?: string;
  isDark?: boolean;
  isPixel?: boolean;
  mono?: boolean;
  editorKind?: PromptExpandEditorKind;
  promptTemplateKind?: PromptTemplateKind | false;
}

const PromptTextarea = forwardRef<HTMLTextAreaElement, PromptTextareaProps>(function PromptTextarea({
  value,
  onValueChange,
  title,
  containerClassName = 'relative',
  isDark: propIsDark,
  isPixel: propIsPixel,
  mono = false,
  editorKind = 'text',
  promptTemplateKind = false,
  className,
  style: textareaStyle,
  onKeyDown,
  placeholder,
  readOnly,
  ...rest
}: PromptTextareaProps, forwardedRef) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { theme, style: themeStyle } = useThemeStore();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const expandCombos = shortcuts['editor.expand-prompt'];
  const isDark = propIsDark ?? theme === 'dark';
  const isPixel = propIsPixel ?? themeStyle === 'pixel';
  const [expanded, setExpanded] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const shortcutText = formatShortcutList(expandCombos);
  const templateEnabled = promptTemplateKind !== false;
  const effectiveTemplateKind = promptTemplateKind || 'image';

  const openExpanded = () => {
    setDraft(value || '');
    setExpanded(true);
  };

  const closeExpanded = () => {
    setExpanded(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const applyExpanded = () => {
    if (!readOnly) onValueChange(draft);
    closeExpanded();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (matchesAnyShortcut(expandCombos, event.nativeEvent)) {
      event.preventDefault();
      event.stopPropagation();
      openExpanded();
      return;
    }
    onKeyDown?.(event);
  };

  const expandButtonCls = isPixel
    ? 'px-btn px-btn--icon px-btn--ghost'
    : `rounded border p-1 shadow-sm ${
        isDark ? 'border-white/10 bg-zinc-950/80 text-white/70 hover:text-white' : 'border-black/10 bg-white/90 text-zinc-600 hover:text-zinc-900'
      }`;

  const setTextareaRef = (el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    if (typeof forwardedRef === 'function') {
      forwardedRef(el);
    } else if (forwardedRef) {
      (forwardedRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }
  };

  return (
    <div className={containerClassName}>
      <textarea
        {...rest}
        ref={setTextareaRef}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        style={templateEnabled ? { ...textareaStyle, paddingRight: textareaStyle?.paddingRight ?? 64 } : textareaStyle}
        spellCheck={false}
      />
      {templateEnabled && (
        <button
          type="button"
          data-prompt-template-trigger
          className={`nodrag nopan absolute top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center ${expandButtonCls}`}
          style={{ right: 34 }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setTemplateOpen(true);
          }}
          title="提示词模板库"
          aria-label="提示词模板库"
        >
          <Library size={12} />
        </button>
      )}
      <button
        type="button"
        data-prompt-expand-trigger
        className={`nodrag nopan absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center ${expandButtonCls}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openExpanded();
        }}
        title={`放大编辑 (${shortcutText})`}
        aria-label="放大编辑"
      >
        <Maximize2 size={12} />
      </button>
      <PromptExpandModal
        open={expanded}
        title={title}
        value={draft}
        onValueChange={setDraft}
        onApply={applyExpanded}
        onCancel={closeExpanded}
        placeholder={typeof placeholder === 'string' ? placeholder : undefined}
        isDark={isDark}
        isPixel={isPixel}
        readOnly={!!readOnly}
        mono={mono || editorKind === 'json'}
        editorKind={editorKind}
      />
      <PromptTemplateLibraryModal
        open={templateOpen}
        initialKind={effectiveTemplateKind}
        value={value || ''}
        onApply={(nextValue) => {
          if (!readOnly) onValueChange(nextValue);
        }}
        onClose={() => {
          setTemplateOpen(false);
          window.setTimeout(() => textareaRef.current?.focus(), 0);
        }}
        isDark={isDark}
        isPixel={isPixel}
      />
    </div>
  );
});

export default PromptTextarea;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookmarkPlus,
  Check,
  Copy,
  Download,
  FileDown,
  FileUp,
  Image as ImageIcon,
  Languages,
  Library,
  Music,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  countBuiltInPromptTemplatesByCategory,
  getBuiltInPromptTemplates,
  getPromptTemplateCategories,
  getPromptTemplateCategoryLabel,
  getPromptTemplateDescription,
  getPromptTemplateText,
  getPromptTemplateTitle,
  type PromptTemplateCategory,
  type PromptTemplateAttachment,
  type PromptTemplateItem,
  type PromptTemplateKind,
  type PromptTemplateLanguage,
} from '../data/promptTemplateLibrary';
import {
  createCustomPromptTemplate,
  exportPromptTemplateBackup,
  importPromptTemplateBackup,
  loadPromptTemplateUserState,
  savePromptTemplateUserState,
  type PromptTemplateUserState,
} from '../services/promptTemplateLibrary';
import * as api from '../services/api';
import ImageHoverPreview from './ImageHoverPreview';
import SmartImage from './SmartImage';

interface PromptTemplateLibraryModalProps {
  open: boolean;
  initialKind: PromptTemplateKind;
  value: string;
  onApply: (value: string) => void;
  onClose: () => void;
  isDark: boolean;
  isPixel: boolean;
}

type SourceFilter = 'all' | 'builtin' | 'mine';

interface EditDraft {
  id?: string;
  kind: PromptTemplateKind;
  categoryId: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  promptZh: string;
  promptEn: string;
  negativeZh: string;
  negativeEn: string;
  tags: string;
  attachments: PromptTemplateAttachment[];
}

function textForSearch(item: PromptTemplateItem) {
  return [
    item.titleZh,
    item.titleEn,
    item.descriptionZh,
    item.descriptionEn,
    item.promptZh,
    item.promptEn,
    item.negativeZh,
    item.negativeEn,
    item.tags.join(' '),
    (item.attachments || []).map((attachment) => attachment.title || attachment.url).join(' '),
    item.source,
  ].join(' ').toLowerCase();
}

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof window !== 'undefined') window.prompt('复制文本:', value);
}

function downloadJson(filename: string, data: unknown) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function kindLabel(kind: PromptTemplateKind, language: PromptTemplateLanguage) {
  if (kind === 'image') return language === 'en' ? 'Image' : '图像';
  return language === 'en' ? 'Video' : '视频';
}

function sourceLabel(item: PromptTemplateItem, language: PromptTemplateLanguage) {
  if (item.source === 'custom') return language === 'en' ? 'Mine' : '我的';
  return language === 'en' ? 'Built-in' : '内置';
}

function categoryFallback(kind: PromptTemplateKind) {
  return kind === 'image' ? 'image-portrait-character' : 'video-cinematic-shot';
}

function makeEditDraft(item: PromptTemplateItem | null, kind: PromptTemplateKind, categoryId: string): EditDraft {
  return {
    id: item?.source === 'custom' ? item.id : undefined,
    kind: item?.kind || kind,
    categoryId: item?.categoryId || categoryId || categoryFallback(kind),
    titleZh: item?.source === 'custom' ? item.titleZh : (item ? `${item.titleZh} 副本` : '我的提示词模板'),
    titleEn: item?.source === 'custom' ? item.titleEn : (item ? `${item.titleEn || item.titleZh} Copy` : 'My Prompt Template'),
    descriptionZh: item?.descriptionZh || '',
    descriptionEn: item?.descriptionEn || '',
    promptZh: item?.promptZh || '',
    promptEn: item?.promptEn || item?.promptZh || '',
    negativeZh: item?.negativeZh || '',
    negativeEn: item?.negativeEn || item?.negativeZh || '',
    tags: item?.tags?.join(', ') || '',
    attachments: item?.attachments || [],
  };
}

function attachmentKindLabel(kind: PromptTemplateAttachment['kind']) {
  if (kind === 'image') return '图像';
  if (kind === 'video') return '视频';
  return '音频';
}

function attachmentIcon(kind: PromptTemplateAttachment['kind']) {
  if (kind === 'image') return <ImageIcon size={12} />;
  if (kind === 'video') return <Video size={12} />;
  return <Music size={12} />;
}

export default function PromptTemplateLibraryModal({
  open,
  initialKind,
  value,
  onApply,
  onClose,
  isDark,
  isPixel,
}: PromptTemplateLibraryModalProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<PromptTemplateUserState>(() => loadPromptTemplateUserState());
  const [activeKind, setActiveKind] = useState<PromptTemplateKind>(initialKind);
  const [categoryId, setCategoryId] = useState('all');
  const [language, setLanguage] = useState<PromptTemplateLanguage>(state.language || 'zh');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (open) {
      const next = loadPromptTemplateUserState();
      setState(next);
      setLanguage(next.language || 'zh');
      setActiveKind(initialKind);
      setMessage('');
      setEditDraft(null);
    }
  }, [initialKind, open]);

  useEffect(() => {
    if (!open) return;
    const onPromptTemplatesChanged = () => {
      const next = loadPromptTemplateUserState();
      setState(next);
    };
    window.addEventListener('penguin:prompt-templates-changed', onPromptTemplatesChanged);
    return () => window.removeEventListener('penguin:prompt-templates-changed', onPromptTemplatesChanged);
  }, [open]);

  const persist = useCallback((updater: (prev: PromptTemplateUserState) => PromptTemplateUserState) => {
    setState((prev) => savePromptTemplateUserState(updater(prev)));
  }, []);

  const categories = useMemo(
    () => getPromptTemplateCategories(activeKind, state.customCategories),
    [activeKind, state.customCategories],
  );

  useEffect(() => {
    if (categoryId !== 'all' && !categories.some((cat) => cat.id === categoryId)) {
      setCategoryId('all');
    }
  }, [categories, categoryId]);

  const hidden = useMemo(() => new Set(state.hiddenBuiltInIds), [state.hiddenBuiltInIds]);
  const builtIn = useMemo(() => getBuiltInPromptTemplates().filter((item) => !hidden.has(item.id)), [hidden]);
  const allItems = useMemo(() => [...builtIn, ...state.customItems], [builtIn, state.customItems]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allItems
      .filter((item) => item.kind === activeKind)
      .forEach((item) => {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      });
    return counts;
  }, [activeKind, allItems]);
  const builtInCounts = useMemo(() => countBuiltInPromptTemplatesByCategory(), []);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems
      .filter((item) => item.kind === activeKind)
      .filter((item) => categoryId === 'all' || item.categoryId === categoryId)
      .filter((item) => sourceFilter === 'all' || (sourceFilter === 'mine' ? item.source === 'custom' : item.source !== 'custom'))
      .filter((item) => !q || textForSearch(item).includes(q))
      .sort((a, b) => {
        const sourceWeight = (item: PromptTemplateItem) => (item.source === 'infinite-canvas' ? 0 : item.source === 'custom' ? 1 : 2);
        return sourceWeight(a) - sourceWeight(b) || getPromptTemplateTitle(a, language).localeCompare(getPromptTemplateTitle(b, language));
      })
      .slice(0, 320);
  }, [activeKind, allItems, categoryId, language, search, sourceFilter]);

  const selected = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) || visibleItems[0] || null,
    [selectedId, visibleItems],
  );

  useEffect(() => {
    if (visibleItems.length && !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0].id);
    }
    if (!visibleItems.length && selectedId) setSelectedId('');
  }, [selectedId, visibleItems]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const shellClass = isPixel
    ? 'px-card text-[var(--px-ink)]'
    : `rounded-xl border shadow-2xl ${
        isDark ? 'border-white/10 bg-zinc-950 text-zinc-100' : 'border-black/10 bg-white text-zinc-900'
      }`;
  const buttonClass = isPixel
    ? 'px-btn px-btn--sm'
    : `inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors ${
        isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'
      }`;
  const primaryClass = isPixel
    ? 'px-btn px-btn--sm px-btn--yellow'
    : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-cyan-400 px-3 text-xs font-bold text-slate-950 hover:bg-cyan-300';
  const inputClass = isPixel
    ? 'px-input'
    : `rounded-md border px-3 py-2 text-sm outline-none ${
        isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-white/35' : 'border-black/10 bg-black/[0.03] text-zinc-900 placeholder:text-zinc-400'
      }`;
  const subtle = isPixel ? 'opacity-70' : isDark ? 'text-white/55' : 'text-zinc-500';

  const setLang = (next: PromptTemplateLanguage) => {
    setLanguage(next);
    persist((prev) => ({ ...prev, language: next }));
  };

  const applyTemplate = (mode: 'replace' | 'append' | 'full') => {
    if (!selected) return;
    const text = getPromptTemplateText(selected, language, mode === 'full');
    if (mode === 'append') {
      const base = value.trim();
      onApply(base ? `${base}\n${text}` : text);
    } else {
      onApply(text);
    }
    onClose();
  };

  const saveDraft = () => {
    if (!editDraft?.promptZh.trim() || !editDraft.titleZh.trim()) {
      setMessage('模板名称和提示词不能为空');
      return;
    }
    const nextItem = createCustomPromptTemplate({
      id: editDraft.id,
      kind: editDraft.kind,
      categoryId: editDraft.categoryId || categoryFallback(editDraft.kind),
      titleZh: editDraft.titleZh,
      titleEn: editDraft.titleEn,
      descriptionZh: editDraft.descriptionZh,
      descriptionEn: editDraft.descriptionEn,
      promptZh: editDraft.promptZh,
      promptEn: editDraft.promptEn,
      negativeZh: editDraft.negativeZh,
      negativeEn: editDraft.negativeEn,
      tags: editDraft.tags.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean),
      attachments: editDraft.attachments,
    });
    persist((prev) => {
      const exists = prev.customItems.some((item) => item.id === nextItem.id);
      return {
        ...prev,
        customItems: exists ? prev.customItems.map((item) => (item.id === nextItem.id ? { ...nextItem, createdAt: item.createdAt } : item)) : [nextItem, ...prev.customItems],
      };
    });
    setSelectedId(nextItem.id);
    setActiveKind(nextItem.kind);
    setCategoryId(nextItem.categoryId);
    setEditDraft(null);
    setMessage('模板已保存到我的模板');
  };

  const saveCurrentAsTemplate = () => {
    if (!value.trim()) {
      setMessage('当前输入框为空，无法保存为模板');
      return;
    }
    const category = categoryId === 'all' ? categoryFallback(activeKind) : categoryId;
    setEditDraft(makeEditDraft({
      id: '',
      kind: activeKind,
      categoryId: category,
      titleZh: '来自当前输入框',
      titleEn: 'From Current Prompt',
      descriptionZh: '从当前节点提示词保存',
      descriptionEn: 'Saved from the current node prompt',
      promptZh: value,
      promptEn: value,
      negativeZh: '',
      negativeEn: '',
      tags: ['我的模板'],
      source: 'custom',
    }, activeKind, category));
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (selected.source === 'custom') {
      if (!window.confirm(`删除模板「${getPromptTemplateTitle(selected, language)}」？`)) return;
      persist((prev) => ({ ...prev, customItems: prev.customItems.filter((item) => item.id !== selected.id) }));
      setMessage('模板已删除');
      return;
    }
    if (!window.confirm(`隐藏内置模板「${getPromptTemplateTitle(selected, language)}」？可通过“恢复内置”找回。`)) return;
    persist((prev) => ({ ...prev, hiddenBuiltInIds: Array.from(new Set([...prev.hiddenBuiltInIds, selected.id])) }));
    setMessage('内置模板已隐藏');
  };

  const addCategory = () => {
    const name = window.prompt(activeKind === 'image' ? '新建图像模板分类' : '新建视频模板分类');
    if (!name?.trim()) return;
    const id = `custom-${activeKind}-${Date.now().toString(36)}`;
    const category: PromptTemplateCategory = {
      id,
      kind: activeKind,
      labelZh: name.trim(),
      labelEn: name.trim(),
      descriptionZh: '我的提示词分类',
      descriptionEn: 'My prompt category',
      order: 1000 + state.customCategories.length,
      builtIn: false,
    };
    persist((prev) => ({ ...prev, customCategories: [...prev.customCategories, category] }));
    setCategoryId(id);
  };

  const renameCategory = (category: PromptTemplateCategory) => {
    if (category.builtIn) return;
    const name = window.prompt('重命名分类', language === 'en' ? category.labelEn : category.labelZh);
    if (!name?.trim()) return;
    persist((prev) => ({
      ...prev,
      customCategories: prev.customCategories.map((cat) => (
        cat.id === category.id ? { ...cat, labelZh: name.trim(), labelEn: name.trim() } : cat
      )),
    }));
  };

  const deleteCategory = (category: PromptTemplateCategory) => {
    if (category.builtIn) return;
    if (!window.confirm(`删除分类「${getPromptTemplateCategoryLabel(category, language)}」？其中我的模板会移动到默认分类。`)) return;
    const fallback = categoryFallback(category.kind);
    persist((prev) => ({
      ...prev,
      customCategories: prev.customCategories.filter((cat) => cat.id !== category.id),
      customItems: prev.customItems.map((item) => (item.categoryId === category.id ? { ...item, categoryId: fallback } : item)),
    }));
    setCategoryId('all');
  };

  const handleExport = () => {
    downloadJson('t8-prompt-template-library.json', exportPromptTemplateBackup(state));
    setMessage('已导出我的模板库 JSON');
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const next = importPromptTemplateBackup(payload, state, 'merge');
      setState(next);
      setMessage(`已导入模板：${next.customItems.length} 个我的模板`);
    } catch (error: any) {
      setMessage(error?.message || '导入失败');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveSelectedToResource = async () => {
    if (!selected) return;
    setBusy('resource');
    try {
      let categoryIdForResource = '';
      const cats = await api.getResourceCategories('set');
      if (cats.success) {
        categoryIdForResource = cats.data.find((cat) => /提示词|prompt/i.test(cat.name))?.id || '';
      }
      if (!categoryIdForResource) {
        const created = await api.addResourceCategory('set', '提示词模板');
        if (created.success) categoryIdForResource = created.data.id;
      }
      const title = getPromptTemplateTitle(selected, language);
      const prompt = language === 'en' ? selected.promptEn || selected.promptZh : selected.promptZh || selected.promptEn;
      const negative = language === 'en' ? selected.negativeEn || selected.negativeZh || '' : selected.negativeZh || selected.negativeEn || '';
      const saved = await api.addResourceSet({
        materialSetKind: 'text',
        categoryId: categoryIdForResource || undefined,
        title: `提示词模板 · ${title}`,
        tags: ['提示词模板', kindLabel(selected.kind, 'zh'), selected.categoryId, ...selected.tags].slice(0, 20),
        materialSetItems: [
          { kind: 'text', name: '正向提示词', text: prompt },
          ...(negative ? [{ kind: 'text' as const, name: '负向提示词', text: negative }] : []),
          ...((selected.attachments || []).map((attachment) => ({
            kind: attachment.kind,
            name: attachment.title || attachmentKindLabel(attachment.kind),
            url: attachment.url,
            mime: attachment.mime,
          }))),
          {
            kind: 'text',
            name: '模板信息',
            text: JSON.stringify({
              id: selected.id,
              kind: selected.kind,
              categoryId: selected.categoryId,
              titleZh: selected.titleZh,
              titleEn: selected.titleEn,
              source: selected.source,
              tags: selected.tags,
            }, null, 2),
          },
        ],
      });
      if (!saved.success) throw new Error(saved.error || '保存资源库失败');
      window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
      setMessage((saved as any).duplicate ? '资源库已有相同模板，已更新分类' : '已保存到资源库');
    } catch (error: any) {
      setMessage(error?.message || '保存到资源库失败');
    } finally {
      setBusy('');
    }
  };

  const activeCategory = categories.find((cat) => cat.id === categoryId) || null;
  const selectedText = selected ? getPromptTemplateText(selected, language, false) : '';
  const selectedFullText = selected ? getPromptTemplateText(selected, language, true) : '';

  return createPortal(
    <div
      data-canvas-floating-ui="prompt-template-library"
      className="fixed inset-0 z-[10140] flex items-center justify-center bg-black/50 p-3"
      onMouseDown={onClose}
    >
      <section
        className={`${shellClass} flex h-[min(88vh,900px)] w-[min(1180px,calc(100vw-24px))] flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-label="提示词模板库"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={`flex items-center justify-between gap-3 px-4 py-3 ${isPixel ? 'border-b-2 border-[var(--px-ink)]' : isDark ? 'border-b border-white/10' : 'border-b border-black/10'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Library size={16} />
              <span>提示词模板库</span>
            </div>
            <div className={`mt-0.5 text-[11px] ${subtle}`}>
              图像 / 视频双库 · 我的模板可带图像 / 视频 / 音频附件 · 支持导入导出、资源库保存
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={buttonClass} onClick={() => setLang(language === 'zh' ? 'en' : 'zh')} title="中英文切换">
              <Languages size={13} /> {language === 'zh' ? '中文' : 'EN'}
            </button>
            <button type="button" className={buttonClass} onClick={onClose} title="关闭">
              <X size={14} />
            </button>
          </div>
        </header>

        <div className={`grid grid-cols-[190px_minmax(260px,330px)_minmax(0,1fr)] gap-0 min-h-0 flex-1 ${isPixel ? '' : ''}`}>
          <aside className={`min-h-0 overflow-y-auto p-3 ${isPixel ? 'border-r-2 border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border-r border-white/10 bg-white/[0.02]' : 'border-r border-black/10 bg-black/[0.02]'}`}>
            <div className="grid grid-cols-2 gap-2">
              {(['image', 'video'] as PromptTemplateKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={isPixel ? `px-btn px-btn--sm ${activeKind === kind ? 'px-btn--yellow' : ''}` : `h-9 rounded-md border text-xs font-bold ${activeKind === kind ? 'border-cyan-300 bg-cyan-400 text-slate-950' : isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`}
                  onClick={() => {
                    setActiveKind(kind);
                    setCategoryId('all');
                    setSelectedId('');
                  }}
                >
                  {kindLabel(kind, language)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`mt-3 w-full text-left ${isPixel ? 'px-btn px-btn--sm' : `rounded-md px-2 py-2 text-xs font-bold ${categoryId === 'all' ? 'bg-cyan-400 text-slate-950' : isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}`}
              onClick={() => setCategoryId('all')}
            >
              全部 <span className="opacity-60">({allItems.filter((item) => item.kind === activeKind).length})</span>
            </button>

            <div className="mt-2 space-y-1">
              {categories.map((category) => {
                const active = category.id === categoryId;
                return (
                  <div key={category.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-xs ${active ? (isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-yellow)]' : 'bg-cyan-500/15 text-cyan-300') : isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                      onClick={() => setCategoryId(category.id)}
                      title={getPromptTemplateCategoryLabel(category, language)}
                    >
                      <span className="block truncate font-bold">{getPromptTemplateCategoryLabel(category, language)}</span>
                      <span className={`block text-[10px] ${subtle}`}>
                        {categoryCounts[category.id] || 0} · 内置 {builtInCounts[category.id] || 0}
                      </span>
                    </button>
                    {!category.builtIn && (
                      <div className="hidden shrink-0 group-hover:flex">
                        <button type="button" className="p-1 opacity-70 hover:opacity-100" onClick={() => renameCategory(category)} title="重命名"><Pencil size={11} /></button>
                        <button type="button" className="p-1 text-red-400 opacity-70 hover:opacity-100" onClick={() => deleteCategory(category)} title="删除"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button type="button" className={`mt-3 w-full ${buttonClass}`} onClick={addCategory}>
              <Plus size={13} /> 分类
            </button>
            {state.hiddenBuiltInIds.length > 0 && (
              <button
                type="button"
                className={`mt-2 w-full ${buttonClass}`}
                onClick={() => {
                  persist((prev) => ({ ...prev, hiddenBuiltInIds: [] }));
                  setMessage('已恢复隐藏的内置模板');
                }}
              >
                <RotateCcw size={13} /> 恢复内置
              </button>
            )}
          </aside>

          <section className={`min-h-0 overflow-hidden p-3 ${isPixel ? 'border-r-2 border-[var(--px-ink)]' : isDark ? 'border-r border-white/10' : 'border-r border-black/10'}`}>
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${subtle}`} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索模板 / 标签 / Prompt"
                  className={`${inputClass} h-9 w-full pl-8`}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['all', 'builtin', 'mine'] as SourceFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={isPixel ? `px-btn px-btn--sm ${sourceFilter === filter ? 'px-btn--yellow' : ''}` : `h-8 rounded-md border text-[11px] font-bold ${sourceFilter === filter ? 'border-cyan-300 bg-cyan-400 text-slate-950' : isDark ? 'border-white/10 hover:bg-white/10' : 'border-black/10 hover:bg-black/5'}`}
                    onClick={() => setSourceFilter(filter)}
                  >
                    {filter === 'all' ? '全部' : filter === 'builtin' ? '内置' : '我的'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={buttonClass} onClick={saveCurrentAsTemplate}>
                  <BookmarkPlus size={13} /> 存当前
                </button>
                <button type="button" className={buttonClass} onClick={() => setEditDraft(makeEditDraft(null, activeKind, categoryId === 'all' ? categoryFallback(activeKind) : categoryId))}>
                  <Plus size={13} /> 新模板
                </button>
              </div>
            </div>

            <div className="mt-3 min-h-0 overflow-y-auto pr-1" style={{ height: 'calc(100% - 126px)' }}>
              {visibleItems.length === 0 ? (
                <div className={`flex h-52 items-center justify-center rounded border border-dashed text-xs ${subtle}`}>
                  没有匹配模板
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleItems.map((item) => {
                    const active = selected?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`w-full rounded-lg border p-2 text-left transition ${active ? (isPixel ? 'border-[var(--px-ink)] bg-[var(--px-yellow)]' : 'border-cyan-300 bg-cyan-400/10') : isDark ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]' : 'border-black/10 bg-black/[0.025] hover:bg-black/[0.05]'}`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-bold">{getPromptTemplateTitle(item, language)}</span>
                          <span className={`flex shrink-0 items-center gap-1 text-[10px] ${subtle}`}>
                            {(item.attachments?.length || 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <Paperclip size={10} /> {item.attachments?.length}
                              </span>
                            )}
                            {sourceLabel(item, language)}
                          </span>
                        </div>
                        <div className={`mt-1 line-clamp-2 text-[10px] leading-relaxed ${subtle}`}>
                          {getPromptTemplateDescription(item, language) || getPromptTemplateText(item, language).slice(0, 120)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <main className="flex min-h-0 flex-col p-3">
            {message && (
              <div className={`mb-2 rounded px-2 py-1 text-[11px] ${isPixel ? 'border-2 border-[var(--px-ink)] bg-[var(--px-yellow)]' : isDark ? 'bg-white/10 text-white/75' : 'bg-black/5 text-zinc-600'}`}>
                {message}
              </div>
            )}

            {editDraft ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold">{editDraft.id ? '编辑我的模板' : '新建我的模板'}</div>
                  <button type="button" className={buttonClass} onClick={() => setEditDraft(null)}>
                    <X size={13} /> 取消
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputClass} value={editDraft.titleZh} onChange={(event) => setEditDraft({ ...editDraft, titleZh: event.target.value })} placeholder="中文名称" />
                  <input className={inputClass} value={editDraft.titleEn} onChange={(event) => setEditDraft({ ...editDraft, titleEn: event.target.value })} placeholder="English title" />
                  <select className={inputClass} value={editDraft.kind} onChange={(event) => {
                    const kind = event.target.value as PromptTemplateKind;
                    setEditDraft({ ...editDraft, kind, categoryId: categoryFallback(kind) });
                  }}>
                    <option value="image">图像模板</option>
                    <option value="video">视频模板</option>
                  </select>
                  <select className={inputClass} value={editDraft.categoryId} onChange={(event) => setEditDraft({ ...editDraft, categoryId: event.target.value })}>
                    {getPromptTemplateCategories(editDraft.kind, state.customCategories).map((cat) => (
                      <option key={cat.id} value={cat.id}>{getPromptTemplateCategoryLabel(cat, language)}</option>
                    ))}
                  </select>
                </div>
                <textarea className={`${inputClass} min-h-[58px] resize-none`} value={editDraft.descriptionZh} onChange={(event) => setEditDraft({ ...editDraft, descriptionZh: event.target.value })} placeholder="中文说明" />
                <textarea className={`${inputClass} min-h-[58px] resize-none`} value={editDraft.descriptionEn} onChange={(event) => setEditDraft({ ...editDraft, descriptionEn: event.target.value })} placeholder="English description" />
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
                  <textarea className={`${inputClass} min-h-[220px] resize-none`} value={editDraft.promptZh} onChange={(event) => setEditDraft({ ...editDraft, promptZh: event.target.value })} placeholder="中文正向提示词" />
                  <textarea className={`${inputClass} min-h-[220px] resize-none`} value={editDraft.promptEn} onChange={(event) => setEditDraft({ ...editDraft, promptEn: event.target.value })} placeholder="English positive prompt" />
                  <textarea className={`${inputClass} min-h-[110px] resize-none`} value={editDraft.negativeZh} onChange={(event) => setEditDraft({ ...editDraft, negativeZh: event.target.value })} placeholder="中文负向提示词（可选）" />
                  <textarea className={`${inputClass} min-h-[110px] resize-none`} value={editDraft.negativeEn} onChange={(event) => setEditDraft({ ...editDraft, negativeEn: event.target.value })} placeholder="English negative prompt (optional)" />
                </div>
                <input className={inputClass} value={editDraft.tags} onChange={(event) => setEditDraft({ ...editDraft, tags: event.target.value })} placeholder="标签，用逗号分隔" />
                {editDraft.attachments.length > 0 && (
                  <div className={`rounded border px-2 py-1.5 text-[11px] ${isPixel ? 'border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border-white/10 bg-white/[0.03] text-white/60' : 'border-black/10 bg-black/[0.025] text-zinc-500'}`}>
                    已关联 {editDraft.attachments.length} 个配套素材，保存文字修改时会一并保留。
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" className={buttonClass} onClick={() => setEditDraft(null)}>取消</button>
                  <button type="button" className={primaryClass} onClick={saveDraft}>
                    <Save size={13} /> 保存模板
                  </button>
                </div>
              </div>
            ) : selected ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold">{getPromptTemplateTitle(selected, language)}</div>
                    <div className={`mt-1 text-[11px] ${subtle}`}>
                      {kindLabel(selected.kind, language)} · {activeCategory ? getPromptTemplateCategoryLabel(activeCategory, language) : selected.categoryId} · {sourceLabel(selected, language)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" className={buttonClass} onClick={() => setEditDraft(makeEditDraft(selected, activeKind, selected.categoryId))} title={selected.source === 'custom' ? '编辑' : '复制后编辑'}>
                      <Pencil size={13} /> {selected.source === 'custom' ? '编辑' : '复制'}
                    </button>
                    <button type="button" className={buttonClass} onClick={deleteSelected} title={selected.source === 'custom' ? '删除' : '隐藏'}>
                      <Trash2 size={13} /> {selected.source === 'custom' ? '删除' : '隐藏'}
                    </button>
                  </div>
                </div>

                <div className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${isPixel ? 'border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-black/[0.025]'}`}>
                  {getPromptTemplateDescription(selected, language)}
                </div>

                {(selected.attachments?.length || 0) > 0 && (
                  <div
                    data-prompt-template-media-preview
                    className={`mt-3 rounded-lg border p-3 ${
                      isPixel ? 'border-[var(--px-ink)] bg-[var(--px-muted)]' : isDark ? 'border-white/10 bg-white/[0.03]' : 'border-black/10 bg-black/[0.025]'
                    }`}
                  >
                    <div className={`mb-2 flex items-center justify-between gap-2 text-[10px] font-bold ${subtle}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <Paperclip size={12} /> 配套素材
                      </span>
                      <span>{selected.attachments?.length || 0} 项 · 仅加载当前模板</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                      {(selected.attachments || []).map((attachment) => (
                        <div
                          key={attachment.id}
                          className={`overflow-hidden rounded-md border ${
                            isPixel ? 'border-[var(--px-ink)] bg-[var(--px-surface)]' : isDark ? 'border-white/10 bg-black/20' : 'border-black/10 bg-white/70'
                          }`}
                        >
                          <div className="group/prompt-media relative h-28 overflow-hidden bg-black/80">
                            {attachment.kind === 'image' ? (
                              <>
                                <SmartImage
                                  src={attachment.previewUrl || attachment.url}
                                  alt={attachment.title || '配套图像'}
                                  className="h-full w-full object-contain"
                                  thumbSize={360}
                                  draggable={false}
                                />
                                <ImageHoverPreview
                                  src={attachment.url}
                                  alt={attachment.title || '配套图像'}
                                  buttonClassName="absolute right-1.5 top-1.5 z-10 h-7 w-7 p-0 opacity-0 shadow-md transition group-hover/prompt-media:opacity-100 focus:opacity-100"
                                />
                              </>
                            ) : attachment.kind === 'video' ? (
                              <video
                                src={attachment.url}
                                poster={attachment.previewUrl}
                                controls
                                preload="metadata"
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-white">
                                <Music size={28} />
                                <audio src={attachment.url} controls preload="none" className="w-full" />
                              </div>
                            )}
                          </div>
                          <div className={`flex items-center gap-1.5 px-2 py-1.5 text-[10px] ${subtle}`}>
                            {attachmentIcon(attachment.kind)}
                            <span className="min-w-0 flex-1 truncate" title={attachment.title || attachment.url}>
                              {attachment.title || attachment.url.split('/').pop() || attachmentKindLabel(attachment.kind)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden">
                  <div className="min-h-0 overflow-y-auto rounded-lg border p-3 text-xs leading-relaxed whitespace-pre-wrap select-text" style={{
                    borderColor: isPixel ? 'var(--px-ink, #1a1410)' : isDark ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)',
                    background: isPixel ? 'var(--px-surface, #fff7df)' : isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.025)',
                  }}>
                    <div className={`mb-2 text-[10px] font-bold ${subtle}`}>正向提示词</div>
                    {selectedText}
                    {(language === 'en' ? selected.negativeEn || selected.negativeZh : selected.negativeZh || selected.negativeEn) && (
                      <>
                        <div className={`mb-2 mt-4 text-[10px] font-bold ${subtle}`}>负向提示词</div>
                        {language === 'en' ? selected.negativeEn || selected.negativeZh : selected.negativeZh || selected.negativeEn}
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={buttonClass} onClick={() => copyText(selectedText)}>
                      <Copy size={13} /> 复制正向
                    </button>
                    <button type="button" className={buttonClass} onClick={() => copyText(selectedFullText)}>
                      <FileDown size={13} /> 复制正负
                    </button>
                    <button type="button" className={buttonClass} onClick={saveSelectedToResource} disabled={busy === 'resource'}>
                      <Download size={13} /> {busy === 'resource' ? '保存中' : '资源库'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={buttonClass} onClick={() => applyTemplate('append')}>
                      <Plus size={13} /> 追加
                    </button>
                    <button type="button" className={buttonClass} onClick={() => applyTemplate('full')}>
                      <Check size={13} /> 正负向
                    </button>
                    <button type="button" className={primaryClass} onClick={() => applyTemplate('replace')}>
                      <Check size={13} /> 替换
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={`flex flex-1 items-center justify-center text-sm ${subtle}`}>请选择或新建一个模板</div>
            )}
          </main>
        </div>

        <footer className={`flex items-center justify-between gap-2 px-4 py-3 ${isPixel ? 'border-t-2 border-[var(--px-ink)]' : isDark ? 'border-t border-white/10' : 'border-t border-black/10'}`}>
          <div className={`text-[11px] ${subtle}`}>
            内置模板来自 T8 生成库、Infinite-Canvas 种子模板与公开提示词写法规律；我的模板保存在本机，可导入导出迁移。
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void handleImport(event.target.files?.[0] || null)}
            />
            <button type="button" className={buttonClass} onClick={() => fileRef.current?.click()}>
              <FileUp size={13} /> 导入
            </button>
            <button type="button" className={buttonClass} onClick={handleExport}>
              <FileDown size={13} /> 导出
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

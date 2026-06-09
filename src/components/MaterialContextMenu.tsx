import { useCallback, useEffect, useState } from 'react';
import { BookmarkPlus, CloudUpload, FolderPlus, Library, Plus, X } from 'lucide-react';
import { useThemeStore } from '../stores/theme';
import { useCanvasStore } from '../stores/canvas';
import { trackAchievementEvent } from '../stores/achievements';
import * as api from '../services/api';
import type { CloudUploadTargetConfig } from '../types/canvas';
import type { ResourceCategory, ResourceKind, ResourceMaterialSetKind, ResourceMediaKind } from '../services/api';
import type { PromptTemplateKind } from '../data/promptTemplateLibrary';
import {
  getPromptTemplateCategories,
  getPromptTemplateCategoryLabel,
  type PromptTemplateCategory,
} from '../data/promptTemplateLibrary';
import {
  createPromptTemplateFromMaterial,
  loadPromptTemplateUserState,
  savePromptTemplateUserState,
} from '../services/promptTemplateLibrary';
import SmartImage from './SmartImage';

interface MenuState {
  x: number;
  y: number;
  kind: ResourceKind;
  url?: string;
  previewUrl?: string;
  sourceNodeId?: string;
  title?: string;
  materialSetKind?: ResourceMaterialSetKind;
  materialSetItems?: NonNullable<Parameters<typeof api.addResourceSet>[0]['materialSetItems']>;
  promptTemplateKind?: PromptTemplateKind;
  promptTemplateCategoryId?: string;
  promptTemplatePrompt?: string;
  promptTemplateNegative?: string;
}

function isResourceKind(value: string | null): value is ResourceMediaKind {
  return value === 'image' || value === 'video' || value === 'audio';
}

function baseName(url: string) {
  try {
    const u = url.startsWith('http') ? new URL(url) : new URL(url, 'http://local');
    const b = decodeURIComponent(u.pathname.split('/').pop() || '');
    return b || '资源';
  } catch {
    return url.split('/').pop() || '资源';
  }
}

function normalizePromptTemplateKind(value: string | null, fallback: PromptTemplateKind): PromptTemplateKind {
  return value === 'image' || value === 'video' ? value : fallback;
}

function formatCloudError(error: string, data?: any) {
  const parts = [
    error,
    data?.hint,
    data?.providerCode ? `Code: ${data.providerCode}` : '',
    data?.requestId ? `RequestId: ${data.requestId}` : '',
  ].filter(Boolean);
  return parts.join('；');
}

export default function MaterialContextMenu() {
  const { theme, style } = useThemeStore();
  const activeCanvasId = useCanvasStore((s) => s.activeId);
  const isDark = theme === 'dark';
  const isPixel = style === 'pixel';
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [cloudTargets, setCloudTargets] = useState<CloudUploadTargetConfig[]>([]);
  const [cloudUploadingId, setCloudUploadingId] = useState('');
  const [promptCategoryId, setPromptCategoryId] = useState('');
  const [message, setMessage] = useState('');
  const [cloudResult, setCloudResult] = useState<api.CloudUploadAssetResult | null>(null);

  const close = useCallback(() => {
    setMenu(null);
    setMessage('');
    setCloudUploadingId('');
    setCloudResult(null);
    setPromptCategoryId('');
  }, []);

  const loadCategories = useCallback(async (kind: ResourceKind) => {
    const r = await api.getResourceCategories(kind);
    if (r.success) setCategories(r.data);
  }, []);

  const loadCloudTargets = useCallback(async () => {
    const r = await api.getCloudUploadStatus();
    if (r.success) {
      setCloudTargets((r.data.targets || []).filter((target) => target.enabled));
    }
  }, []);

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const source = target?.closest('[data-drag-source]') as HTMLElement | null;
      if (!source) return;
      const kind = source.getAttribute('data-drag-kind');
      const url = source.getAttribute('data-drag-url') || '';
      if (!isResourceKind(kind) || !url) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const next: MenuState = {
        x: e.clientX,
        y: e.clientY,
        kind,
        url,
        previewUrl: source.getAttribute('data-drag-preview') || url,
        sourceNodeId: source.getAttribute('data-drag-node-id') || '',
        title: source.getAttribute('data-resource-title') || source.getAttribute('alt') || baseName(url),
        promptTemplateKind: normalizePromptTemplateKind(
          source.getAttribute('data-prompt-template-kind'),
          kind === 'image' ? 'image' : 'video',
        ),
        promptTemplateCategoryId: source.getAttribute('data-prompt-template-category') || '',
        promptTemplatePrompt: source.getAttribute('data-prompt-template-prompt') || '',
        promptTemplateNegative: source.getAttribute('data-prompt-template-negative') || '',
      };
      setMenu(next);
      setPromptCategoryId(next.promptTemplateCategoryId || '');
      setMessage('');
      setCloudResult(null);
      loadCategories(kind);
      loadCloudTargets();
    };
    const onMaterialSetMenu = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const materialSetKind = detail.materialSetKind as ResourceMaterialSetKind | undefined;
      const materialSetItems = Array.isArray(detail.materialSetItems) ? detail.materialSetItems : [];
      if (!materialSetKind || materialSetItems.length === 0) return;
      setMenu({
        x: Number(detail.x) || window.innerWidth / 2,
        y: Number(detail.y) || window.innerHeight / 2,
        kind: 'set',
        sourceNodeId: String(detail.sourceNodeId || ''),
        title: String(detail.title || '素材集'),
        materialSetKind,
        materialSetItems,
      });
      setMessage('');
      setPromptCategoryId('');
      setCloudResult(null);
      loadCategories('set');
    };
    document.addEventListener('contextmenu', onContext, true);
    window.addEventListener('penguin:open-material-set-resource-menu', onMaterialSetMenu as EventListener);
    return () => {
      document.removeEventListener('contextmenu', onContext, true);
      window.removeEventListener('penguin:open-material-set-resource-menu', onMaterialSetMenu as EventListener);
    };
  }, [loadCategories, loadCloudTargets]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-resource-context-menu]')) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [menu, close]);

  const addToCategory = async (categoryId: string) => {
    if (!menu) return;
    const r = menu.kind === 'set'
      ? await api.addResourceSet({
          materialSetKind: menu.materialSetKind!,
          materialSetItems: menu.materialSetItems || [],
          categoryId,
          title: menu.title,
          sourceNodeId: menu.sourceNodeId,
          sourceCanvasId: activeCanvasId || '',
        })
      : await api.addResourceItem({
          url: menu.url || '',
          kind: menu.kind as ResourceMediaKind,
          categoryId,
          title: menu.title,
          sourceNodeId: menu.sourceNodeId,
          sourceCanvasId: activeCanvasId || '',
        });
    if (r.success) {
      const duplicate = (r as any).duplicate;
      if (!duplicate) {
        trackAchievementEvent({
          type: 'resource.saved',
          kind: menu.kind === 'set' ? `${menu.materialSetKind || 'material'}-set` : menu.kind,
          category: categoryId,
        });
      }
      setMessage(duplicate ? '已存在，已定位到该分类' : '已加入资源库');
      window.dispatchEvent(new CustomEvent('penguin:resources-changed'));
      window.setTimeout(close, 650);
    } else {
      setMessage(r.error || '加入失败');
    }
  };

  const promptTemplateState = menu && menu.kind !== 'set' ? loadPromptTemplateUserState() : null;
  const promptTemplateKind = menu && menu.kind !== 'set'
    ? normalizePromptTemplateKind(String(menu.promptTemplateKind || ''), menu.kind === 'image' ? 'image' : 'video')
    : 'image';
  const promptTemplateCategories: PromptTemplateCategory[] = promptTemplateState
    ? getPromptTemplateCategories(promptTemplateKind, promptTemplateState.customCategories)
    : [];
  const selectedPromptCategoryId =
    promptCategoryId ||
    menu?.promptTemplateCategoryId ||
    promptTemplateCategories[0]?.id ||
    '';

  const saveToPromptTemplate = () => {
    if (!menu || menu.kind === 'set' || !menu.url) return;
    let prompt = (menu.promptTemplatePrompt || '').trim();
    if (!prompt) {
      prompt = window.prompt('没有检测到这个素材的提示词，请补充后保存到模板库：', '')?.trim() || '';
    }
    if (!prompt) {
      setMessage('未保存：缺少提示词');
      return;
    }
    const titleBase = (menu.title || baseName(menu.url)).replace(/\.[a-z0-9]{2,8}$/i, '').trim();
    const item = createPromptTemplateFromMaterial({
      mediaKind: menu.kind as ResourceMediaKind,
      url: menu.url,
      previewUrl: menu.previewUrl,
      prompt,
      negative: menu.promptTemplateNegative,
      title: titleBase || prompt.slice(0, 32),
      templateKind: menu.promptTemplateKind,
      categoryId: selectedPromptCategoryId,
      sourceNodeId: menu.sourceNodeId,
    });
    const current = loadPromptTemplateUserState();
    savePromptTemplateUserState({
      ...current,
      customItems: [item, ...current.customItems],
    });
    window.dispatchEvent(new CustomEvent('penguin:prompt-templates-changed', { detail: { id: item.id } }));
    setMessage(`已保存到提示词模板库：${item.titleZh}`);
  };

  const createPromptTemplateCategory = () => {
    if (!menu || menu.kind === 'set') return;
    const name = window.prompt(promptTemplateKind === 'image' ? '新建图像模板分类' : '新建视频模板分类');
    if (!name?.trim()) return;
    const current = loadPromptTemplateUserState();
    const id = `custom-${promptTemplateKind}-${Date.now().toString(36)}`;
    const category: PromptTemplateCategory = {
      id,
      kind: promptTemplateKind,
      labelZh: name.trim(),
      labelEn: name.trim(),
      descriptionZh: '从素材右键保存时创建的分类',
      descriptionEn: 'Created while saving material to prompt templates',
      order: 1000 + current.customCategories.length,
      builtIn: false,
    };
    savePromptTemplateUserState({
      ...current,
      customCategories: [...current.customCategories, category],
    });
    setPromptCategoryId(id);
    window.dispatchEvent(new CustomEvent('penguin:prompt-templates-changed', { detail: { categoryId: id } }));
    setMessage(`已创建模板分类：${category.labelZh}`);
  };

  const createCategory = async () => {
    if (!menu) return;
    const name = window.prompt('新建分类');
    if (!name?.trim()) return;
    const r = await api.addResourceCategory(menu.kind, name.trim());
    if (r.success) {
      setCategories((prev) => [...prev, r.data]);
      await addToCategory(r.data.id);
    } else {
      setMessage(r.error || '分类创建失败');
    }
  };

  const uploadToCloud = async (target: CloudUploadTargetConfig) => {
    if (!menu || menu.kind === 'set' || !menu.url) return;
    setCloudUploadingId(target.id);
    setCloudResult(null);
    setMessage(`正在上传到 ${target.label || '云端'}...`);
    const r = await api.uploadCloudAsset({
      targetId: target.id,
      url: menu.url,
      kind: menu.kind,
      filename: menu.title,
      title: menu.title,
      sourceNodeId: menu.sourceNodeId,
      sourceCanvasId: activeCanvasId || '',
    });
    setCloudUploadingId('');
    if (r.success) {
      setCloudResult(r.data);
      const copyValue = r.data.url || r.data.path || '';
      if (copyValue) {
        try {
          await navigator.clipboard?.writeText(copyValue);
          setMessage(`已上传到 ${target.label || '云端'}，链接已复制`);
        } catch {
          setMessage(`已上传到 ${target.label || '云端'}`);
        }
      } else {
        setMessage(`已上传到 ${target.label || '云端'}`);
      }
    } else {
      setMessage(formatCloudError(r.error || '云端上传失败', r.data));
    }
  };

  if (!menu) return null;

  const itemCls = isPixel
    ? 'w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 hover:bg-[var(--px-yellow)]'
    : `w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 ${
        isDark ? 'text-zinc-100 hover:bg-white/10' : 'text-zinc-800 hover:bg-black/5'
      }`;

  return (
    <div
      data-resource-context-menu
      className="fixed z-[80] overflow-hidden"
      style={{
        left: Math.min(menu.x, window.innerWidth - 240),
        top: Math.min(menu.y, window.innerHeight - 360),
        width: 220,
        background: isPixel ? '#FFFFFF' : isDark ? 'rgba(20,20,22,.98)' : 'rgba(255,255,255,.98)',
        color: isPixel ? '#1A1410' : isDark ? '#fff' : '#18181b',
        border: isPixel ? '2px solid #1A1410' : `1px solid ${isDark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)'}`,
        borderRadius: isPixel ? 12 : 8,
        boxShadow: isPixel ? '4px 4px 0 #1A1410' : '0 18px 50px rgba(0,0,0,.35)',
      }}
    >
      <div
        className="px-3 py-2 text-[11px] font-semibold flex items-center gap-2"
        style={{
          borderBottom: isPixel ? '2px solid #1A1410' : `1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}`,
          background: isPixel ? '#A8E6C9' : 'transparent',
        }}
      >
        <Library size={13} />
        <span className="flex-1 truncate">{menu.kind === 'set' ? '保存素材集' : '加入资源库'}</span>
        <button onClick={close} title="关闭">
          <X size={12} />
        </button>
      </div>
      {menu.kind === 'image' && menu.previewUrl && (
        <div className="h-24 bg-black overflow-hidden">
          <SmartImage src={menu.previewUrl} className="w-full h-full object-cover" draggable={false} thumbSize={320} />
        </div>
      )}
      {menu.kind === 'set' && (
        <div className={`px-3 py-2 text-[11px] ${isPixel ? 'bg-[var(--px-muted)]' : isDark ? 'bg-white/5 text-white/65' : 'bg-black/5 text-zinc-600'}`}>
          {menu.title || '素材集'} · {menu.materialSetItems?.length || 0} 项
        </div>
      )}
      {menu.kind !== 'set' && (
        <div
          className="space-y-1 py-1 px-2"
          style={{
            borderBottom: isPixel ? '2px solid #1A1410' : `1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}`,
          }}
        >
          <div className="flex items-center gap-1.5">
            <select
              value={selectedPromptCategoryId}
              onChange={(event) => setPromptCategoryId(event.target.value)}
              className="min-w-0 flex-1 rounded border px-2 py-1.5 text-[11px] outline-none"
              style={{
                borderColor: isPixel ? '#1A1410' : isDark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.14)',
                background: isPixel ? '#FFF7C2' : isDark ? 'rgba(255,255,255,.08)' : '#fff',
                color: isPixel ? '#1A1410' : isDark ? '#fff' : '#18181b',
              }}
              title="选择保存到哪个提示词模板分类"
            >
              {promptTemplateCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {getPromptTemplateCategoryLabel(cat, 'zh')}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={isPixel ? 'px-btn px-btn--sm px-btn--ghost !px-2 !py-1' : 'rounded border px-2 py-1.5 text-[11px] hover:bg-black/5'}
              onClick={createPromptTemplateCategory}
              title="新建模板分类"
            >
              <FolderPlus size={12} />
            </button>
          </div>
          <button className={`${itemCls} !px-1`} onClick={saveToPromptTemplate}>
            <BookmarkPlus size={12} />
            <span className="truncate">保存到提示词模板库</span>
          </button>
          {!menu.promptTemplatePrompt && (
            <div className={`px-3 pb-1 text-[10px] ${isPixel ? 'opacity-75' : isDark ? 'text-white/45' : 'text-zinc-500'}`}>
              未检测到来源提示词时会询问补充。
            </div>
          )}
        </div>
      )}
      <div className="max-h-56 overflow-y-auto py-1">
        {categories.map((cat) => (
          <button key={cat.id} className={itemCls} onClick={() => addToCategory(cat.id)}>
            <Plus size={12} />
            <span className="truncate">{cat.name}</span>
          </button>
        ))}
        <button className={itemCls} onClick={createCategory}>
          <FolderPlus size={12} />
          <span>新建分类...</span>
        </button>
      </div>
      {menu.kind !== 'set' && (
        <div
          className="py-1"
          style={{
            borderTop: isPixel ? '2px solid #1A1410' : `1px solid ${isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'}`,
          }}
        >
          <div className={`px-3 py-1.5 text-[10px] font-bold flex items-center gap-1.5 ${isDark && !isPixel ? 'text-white/65' : ''}`}>
            <CloudUpload size={12} />
            <span>上传到云端</span>
          </div>
          {cloudTargets.length === 0 ? (
            <div className={`px-3 pb-2 text-[11px] ${isPixel ? '' : isDark ? 'text-white/55' : 'text-zinc-500'}`}>
              未启用云端目标，请先到 API 设置中配置。
            </div>
          ) : (
            <div className="max-h-36 overflow-y-auto">
              {cloudTargets.map((target) => (
                <button
                  key={target.id}
                  className={itemCls}
                  onClick={() => uploadToCloud(target)}
                  disabled={!!cloudUploadingId}
                  title={target.label}
                >
                  <CloudUpload size={12} />
                  <span className="truncate">{target.label || target.id}</span>
                  {cloudUploadingId === target.id && <span className="ml-auto text-[10px]">上传中</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {message && (
        <div className={`px-3 py-2 text-[11px] ${isPixel ? 'border-t-2 border-[var(--px-ink)] bg-[var(--px-yellow)]' : isDark ? 'border-t border-white/10 text-white/70' : 'border-t border-black/10 text-zinc-600'}`}>
          {message}
          {cloudResult?.url && (
            <div className="mt-1 truncate" title={cloudResult.url}>
              {cloudResult.url}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

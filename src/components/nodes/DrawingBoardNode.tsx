import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  ArrowDown,
  ArrowUp,
  Circle,
  ChevronDown,
  ChevronRight,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FolderPlus,
  ImagePlus,
  Layers,
  Loader2,
  Lock,
  MousePointer2,
  PenLine,
  Pencil,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Type,
  Unlock,
  Upload,
} from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { uploadDataUrl, uploadFileBlob } from '../../services/imageOps';
import { useRunTrigger } from '../../hooks/useRunTrigger';
import { useUpdateNodeData } from './useUpdateNodeData';
import { useUpstreamMaterials } from './useUpstreamMaterials';

type BoardTool = 'select' | 'pen' | 'eraser' | 'text' | 'rect' | 'circle' | 'arrow';
type BoardRatio = 'free' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

interface Point {
  x: number;
  y: number;
}

interface ImageElement {
  id: string;
  kind: 'image';
  url: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
}

interface PathElement {
  id: string;
  kind: 'path';
  points: Point[];
  color: string;
  size: number;
}

interface TextElement {
  id: string;
  kind: 'text';
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
}

interface ShapeElement {
  id: string;
  kind: 'rect' | 'circle' | 'arrow';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  size: number;
  rotation?: number;
}

type BoardElement = ImageElement | PathElement | TextElement | ShapeElement;
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';
type BoxElement = ImageElement | ShapeElement;

interface BoardLayer {
  id: string;
  kind: 'layer' | 'group';
  name: string;
  hidden?: boolean;
  locked?: boolean;
  collapsed?: boolean;
  groupId?: string | null;
  elements: BoardElement[];
}

type BoardAction =
  | { type: 'draw'; layerId: string; id: string }
  | { type: 'shape'; layerId: string; id: string }
  | { type: 'move'; layerId: string; id: string; start: Point; originals: BoardElement[] }
  | { type: 'resize'; layerId: string; id: string; corner: ResizeCorner; keepAspect: boolean; original: BoardElement }
  | { type: 'rotate'; layerId: string; id: string; center: Point; startAngle: number; originalRotation: number };

const NODE_W = 1120;
const NODE_H = 760;
const CONTROL_W = 330;
const DEFAULT_BOARD_W = 960;
const DEFAULT_BOARD_H = 540;

const RATIO_SIZE: Record<Exclude<BoardRatio, 'free'>, { w: number; h: number }> = {
  '1:1': { w: 900, h: 900 },
  '16:9': { w: 960, h: 540 },
  '9:16': { w: 540, h: 960 },
  '4:3': { w: 960, h: 720 },
  '3:4': { w: 720, h: 960 },
};

const TOOL_LABEL: Record<BoardTool, string> = {
  select: '选择',
  pen: '画笔',
  eraser: '擦除',
  text: '文字',
  rect: '矩形',
  circle: '圆形',
  arrow: '箭头',
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function createBlankLayer(index = 1, groupId: string | null = null): BoardLayer {
  return {
    id: uid('layer'),
    kind: 'layer',
    name: `图层 ${index}`,
    groupId,
    elements: [],
  };
}

function createGroup(index = 1): BoardLayer {
  return {
    id: uid('group'),
    kind: 'group',
    name: `组 ${index}`,
    elements: [],
  };
}

function normalizeElements(value: unknown): BoardElement[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any): BoardElement | null => {
      if (!item || typeof item !== 'object') return null;
      const id = typeof item.id === 'string' ? item.id : uid('el');
      if (item.kind === 'image' && typeof item.url === 'string') {
        return {
          id,
          kind: 'image',
          url: item.url,
          name: typeof item.name === 'string' ? item.name : undefined,
          x: Number(item.x) || 0,
          y: Number(item.y) || 0,
          w: Math.max(20, Number(item.w) || 320),
          h: Math.max(20, Number(item.h) || 180),
          rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0,
          opacity: Number.isFinite(Number(item.opacity)) ? clamp(Number(item.opacity), 0.05, 1) : 1,
        };
      }
      if (item.kind === 'path' && Array.isArray(item.points)) {
        const points = item.points
          .map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }))
          .filter((p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (points.length < 1) return null;
        return {
          id,
          kind: 'path',
          points,
          color: typeof item.color === 'string' ? item.color : '#111827',
          size: Math.max(1, Number(item.size) || 4),
        };
      }
      if (item.kind === 'text' && typeof item.text === 'string') {
        return {
          id,
          kind: 'text',
          text: item.text,
          x: Number(item.x) || 0,
          y: Number(item.y) || 0,
          color: typeof item.color === 'string' ? item.color : '#111827',
          size: Math.max(10, Number(item.size) || 32),
        };
      }
      if (['rect', 'circle', 'arrow'].includes(item.kind)) {
        return {
          id,
          kind: item.kind,
          x: Number(item.x) || 0,
          y: Number(item.y) || 0,
          w: Number(item.w) || 120,
          h: Number(item.h) || 80,
          color: typeof item.color === 'string' ? item.color : '#fb923c',
          size: Math.max(1, Number(item.size) || 5),
          rotation: Number.isFinite(Number(item.rotation)) ? Number(item.rotation) : 0,
        } as ShapeElement;
      }
      return null;
    })
    .filter(Boolean) as BoardElement[];
}

function normalizeLayers(value: unknown, legacyElements: unknown): BoardLayer[] {
  if (Array.isArray(value)) {
    const layers = value
      .map((item: any): BoardLayer | null => {
        if (!item || typeof item !== 'object') return null;
        const kind = item.kind === 'group' ? 'group' : 'layer';
        const id = typeof item.id === 'string' ? item.id : uid(kind);
        return {
          id,
          kind,
          name: typeof item.name === 'string' && item.name.trim() ? item.name : kind === 'group' ? '组' : '图层',
          hidden: !!item.hidden,
          locked: !!item.locked,
          collapsed: !!item.collapsed,
          groupId: typeof item.groupId === 'string' ? item.groupId : null,
          elements: kind === 'layer' ? normalizeElements(item.elements) : [],
        };
      })
      .filter(Boolean) as BoardLayer[];
    if (layers.some((l) => l.kind === 'layer')) return layers;
  }
  const migrated = normalizeElements(legacyElements);
  if (migrated.length > 0) {
    return [{ ...createBlankLayer(1), name: '迁移图层', elements: migrated }];
  }
  return [createBlankLayer(1)];
}

function flattenElements(layers: BoardLayer[]): BoardElement[] {
  return layers.flatMap((layer) => (layer.kind === 'layer' ? layer.elements : []));
}

function firstEditableLayerId(layers: BoardLayer[]) {
  return layers.find((layer) => layer.kind === 'layer')?.id || '';
}

function elementCount(layers: BoardLayer[]) {
  return flattenElements(layers).length;
}

function isGroupHidden(layers: BoardLayer[], groupId?: string | null): boolean {
  if (!groupId) return false;
  const group = layers.find((layer) => layer.id === groupId && layer.kind === 'group');
  return !!group?.hidden;
}

function isGroupLocked(layers: BoardLayer[], groupId?: string | null): boolean {
  if (!groupId) return false;
  const group = layers.find((layer) => layer.id === groupId && layer.kind === 'group');
  return !!group?.locked;
}

function isLayerVisible(layers: BoardLayer[], layer: BoardLayer) {
  return layer.kind === 'layer' && !layer.hidden && !isGroupHidden(layers, layer.groupId);
}

function isLayerEditable(layers: BoardLayer[], layer: BoardLayer | undefined) {
  return !!layer && layer.kind === 'layer' && !layer.hidden && !isGroupHidden(layers, layer.groupId) && !layer.locked && !isGroupLocked(layers, layer.groupId);
}

function isLayerFoldedInList(layers: BoardLayer[], layer: BoardLayer) {
  if (layer.kind !== 'layer' || !layer.groupId) return false;
  const group = layers.find((item) => item.id === layer.groupId && item.kind === 'group');
  return !!group?.collapsed;
}

function boundsOf(el: BoardElement) {
  if (el.kind === 'path') {
    const xs = el.points.map((p) => p.x);
    const ys = el.points.map((p) => p.y);
    const pad = Math.max(8, el.size);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return {
      x: minX,
      y: minY,
      w: Math.max(12, Math.max(...xs) - Math.min(...xs) + pad * 2),
      h: Math.max(12, Math.max(...ys) - Math.min(...ys) + pad * 2),
    };
  }
  if (el.kind === 'text') {
    const lines = el.text.split(/\r?\n/);
    const maxLine = Math.max(...lines.map((line) => line.length), 1);
    return { x: el.x, y: el.y - el.size, w: Math.max(80, maxLine * el.size * 0.62), h: el.size * 1.35 * lines.length };
  }
  return {
    x: Math.min(el.x, el.x + el.w),
    y: Math.min(el.y, el.y + el.h),
    w: Math.abs(el.w),
    h: Math.abs(el.h),
  };
}

function pointInBounds(p: Point, b: { x: number; y: number; w: number; h: number }, pad = 0) {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

function isBoxElement(el: BoardElement): el is BoxElement {
  return el.kind === 'image' || el.kind === 'rect' || el.kind === 'circle' || el.kind === 'arrow';
}

function rotationOf(el: BoardElement) {
  return isBoxElement(el) && Number.isFinite(Number(el.rotation)) ? Number(el.rotation) : 0;
}

function centerOfBounds(b: { x: number; y: number; w: number; h: number }): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function rotatePoint(p: Point, center: Point, degrees: number): Point {
  if (!degrees) return p;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function localPointForElement(p: Point, el: BoardElement): Point {
  const rotation = rotationOf(el);
  if (!rotation) return p;
  return rotatePoint(p, centerOfBounds(boundsOf(el)), -rotation);
}

function pointInElement(p: Point, el: BoardElement, pad = 0) {
  return pointInBounds(localPointForElement(p, el), boundsOf(el), pad);
}

const RESIZE_POINTS: Record<ResizeCorner, (b: { x: number; y: number; w: number; h: number }) => Point> = {
  nw: (b) => ({ x: b.x, y: b.y }),
  ne: (b) => ({ x: b.x + b.w, y: b.y }),
  sw: (b) => ({ x: b.x, y: b.y + b.h }),
  se: (b) => ({ x: b.x + b.w, y: b.y + b.h }),
};

function resizeCornerAt(p: Point, el: BoardElement): ResizeCorner | null {
  if (!isBoxElement(el)) return null;
  const b = boundsOf(el);
  const local = localPointForElement(p, el);
  const hit = Math.max(14, Math.min(24, Math.min(b.w, b.h) * 0.12));
  const corners: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
  return corners.find((corner) => {
    const handle = RESIZE_POINTS[corner](b);
    return Math.abs(local.x - handle.x) <= hit && Math.abs(local.y - handle.y) <= hit;
  }) || null;
}

function isRotateHandleHit(p: Point, el: BoardElement) {
  if (!isBoxElement(el)) return false;
  const b = boundsOf(el);
  const local = localPointForElement(p, el);
  const handle = { x: b.x + b.w / 2, y: b.y - 34 };
  return Math.hypot(local.x - handle.x, local.y - handle.y) <= 18;
}

function resizeBoxElement(original: BoardElement, pointer: Point, corner: ResizeCorner, keepAspect: boolean): BoardElement {
  if (!isBoxElement(original)) return original;
  const b = boundsOf(original);
  const local = localPointForElement(pointer, original);
  let left = b.x;
  let right = b.x + b.w;
  let top = b.y;
  let bottom = b.y + b.h;
  const min = 20;

  if (corner.includes('w')) left = Math.min(local.x, right - min);
  if (corner.includes('e')) right = Math.max(local.x, left + min);
  if (corner.includes('n')) top = Math.min(local.y, bottom - min);
  if (corner.includes('s')) bottom = Math.max(local.y, top + min);

  if (keepAspect && b.w > 0 && b.h > 0) {
    const ratio = b.w / b.h;
    let width = Math.max(min, right - left);
    let height = Math.max(min, bottom - top);
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;

    if (corner === 'se') {
      right = left + width;
      bottom = top + height;
    } else if (corner === 'sw') {
      left = right - width;
      bottom = top + height;
    } else if (corner === 'ne') {
      right = left + width;
      top = bottom - height;
    } else {
      left = right - width;
      top = bottom - height;
    }
  }

  return {
    ...original,
    x: left,
    y: top,
    w: Math.max(min, right - left),
    h: Math.max(min, bottom - top),
  } as BoardElement;
}

function normalizeShape(el: BoardElement): BoardElement {
  if (!['image', 'rect', 'circle'].includes(el.kind)) return el;
  const shape = el as ImageElement | ShapeElement;
  if (shape.w >= 0 && shape.h >= 0) return el;
  return {
    ...shape,
    x: Math.min(shape.x, shape.x + shape.w),
    y: Math.min(shape.y, shape.y + shape.h),
    w: Math.abs(shape.w),
    h: Math.abs(shape.h),
  } as BoardElement;
}

function drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const len = Math.max(12, size * 4);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(angle - Math.PI / 6), to.y - len * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(angle + Math.PI / 6), to.y - len * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function labelForElement(el: BoardElement) {
  if (el.kind === 'image') return el.name || '图片元素';
  if (el.kind === 'path') return '笔迹元素';
  if (el.kind === 'text') return el.text.slice(0, 18) || '文字元素';
  if (el.kind === 'rect') return '矩形元素';
  if (el.kind === 'circle') return '圆形元素';
  return '箭头元素';
}

function fitImageToBoard(naturalW: number, naturalH: number, boardW: number, boardH: number, index: number) {
  const srcW = Math.max(1, naturalW || boardW);
  const srcH = Math.max(1, naturalH || boardH);
  const maxW = Math.max(80, boardW * 0.78);
  const maxH = Math.max(80, boardH * 0.78);
  const scale = Math.min(maxW / srcW, maxH / srcH);
  const w = Math.max(24, srcW * scale);
  const h = Math.max(24, srcH * scale);
  const offset = Math.min(54, index * 18);
  return {
    x: clamp((boardW - w) / 2 + offset, 0, Math.max(0, boardW - w)),
    y: clamp((boardH - h) / 2 + offset, 0, Math.max(0, boardH - h)),
    w,
    h,
  };
}

function isEditableEventTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function isBoardRatio(value: unknown): value is BoardRatio {
  return value === 'free' || value === '1:1' || value === '16:9' || value === '9:16' || value === '4:3' || value === '3:4';
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

const DrawingBoardNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const upstream = useUpstreamMaterials(id);
  const d = (data as any) || {};
  const initialLayersRef = useRef<BoardLayer[] | null>(null);
  if (!initialLayersRef.current) initialLayersRef.current = normalizeLayers(d.boardLayers, d.boardElements);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const boardJsonInputRef = useRef<HTMLInputElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const autoImportSigRef = useRef('');
  const actionRef = useRef<BoardAction | null>(null);

  const [layers, setLayers] = useState<BoardLayer[]>(() => initialLayersRef.current || [createBlankLayer(1)]);
  const [activeLayerId, setActiveLayerId] = useState<string>(() => {
    const initial = initialLayersRef.current || [];
    const saved = typeof d.activeBoardLayerId === 'string' ? d.activeBoardLayerId : '';
    return initial.some((layer) => layer.id === saved && layer.kind === 'layer') ? saved : firstEditableLayerId(initial);
  });
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [tool, setTool] = useState<BoardTool>('select');
  const [ratio, setRatio] = useState<BoardRatio>((d.boardRatio as BoardRatio) || '16:9');
  const [boardW, setBoardW] = useState(Math.max(240, Number(d.boardWidth) || DEFAULT_BOARD_W));
  const [boardH, setBoardH] = useState(Math.max(240, Number(d.boardHeight) || DEFAULT_BOARD_H));
  const [strokeColor, setStrokeColor] = useState(typeof d.boardColor === 'string' ? d.boardColor : '#111827');
  const [strokeSize, setStrokeSize] = useState(Math.max(1, Number(d.boardStrokeSize) || 5));
  const [textDraft, setTextDraft] = useState(typeof d.boardTextDraft === 'string' ? d.boardTextDraft : '文字');
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>((d.status as any) || 'idle');
  const [error, setError] = useState<string | null>(typeof d.error === 'string' ? d.error : null);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [, forceRender] = useState(0);

  const activeLayer = useMemo(() => layers.find((layer) => layer.id === activeLayerId && layer.kind === 'layer'), [activeLayerId, layers]);
  const activeLayerWritable = useMemo(() => isLayerEditable(layers, activeLayer), [activeLayer, layers]);
  const renderableLayers = useMemo(() => layers.filter((layer) => isLayerVisible(layers, layer)), [layers]);
  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null;
    for (const layer of layers) {
      if (layer.kind !== 'layer') continue;
      const found = layer.elements.find((el) => el.id === selectedElementId);
      if (found) return { layer, element: found };
    }
    return null;
  }, [layers, selectedElementId]);
  const boardHasKeyboardFocus = useCallback(() => {
    const root = rootRef.current;
    const active = document.activeElement;
    return !!root && active instanceof globalThis.Node && root.contains(active);
  }, []);
  const hasUpstreamImages = upstream.images.length > 0;
  const previewSize = useMemo(() => {
    const maxW = NODE_W - CONTROL_W - 72;
    const maxH = NODE_H - 210;
    const scale = Math.min(maxW / boardW, maxH / boardH);
    return {
      w: Math.max(1, Math.round(boardW * scale)),
      h: Math.max(1, Math.round(boardH * scale)),
    };
  }, [boardH, boardW]);

  const persistLayers = useCallback(
    (next: BoardLayer[]) => {
      const safeNext = next.some((layer) => layer.kind === 'layer') ? next : [createBlankLayer(1)];
      update({ boardLayers: safeNext, boardElements: flattenElements(safeNext) });
      return safeNext;
    },
    [update],
  );

  const patchLayers = useCallback(
    (updater: BoardLayer[] | ((prev: BoardLayer[]) => BoardLayer[])) => {
      setLayers((prev) => {
        const proposed = typeof updater === 'function' ? (updater as (p: BoardLayer[]) => BoardLayer[])(prev) : updater;
        return persistLayers(proposed);
      });
    },
    [persistLayers],
  );

  useEffect(() => {
    if (layers.some((layer) => layer.id === activeLayerId && layer.kind === 'layer')) return;
    const nextActive = firstEditableLayerId(layers);
    if (nextActive) setActiveLayerId(nextActive);
  }, [activeLayerId, layers]);

  useEffect(() => {
    if (activeLayerId) update({ activeBoardLayerId: activeLayerId });
  }, [activeLayerId, update]);

  useEffect(() => {
    const onPointerDownOutside = (event: globalThis.PointerEvent) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || !(target instanceof globalThis.Node) || root.contains(target)) return;
      actionRef.current = null;
      setSelectedElementId(null);
      const active = document.activeElement;
      if (active instanceof globalThis.HTMLElement && root.contains(active)) active.blur();
    };
    document.addEventListener('pointerdown', onPointerDownOutside, true);
    return () => document.removeEventListener('pointerdown', onPointerDownOutside, true);
  }, []);

  const imageForUrl = useCallback((url: string) => {
    let img = imageCacheRef.current.get(url);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => forceRender((v) => v + 1);
      img.onerror = () => forceRender((v) => v + 1);
      img.src = url;
      imageCacheRef.current.set(url, img);
    }
    return img;
  }, []);

  const loadImage = useCallback(async (url: string) => {
    const cached = imageCacheRef.current.get(url);
    if (cached?.complete && cached.naturalWidth > 0) return cached;
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = cached || new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageCacheRef.current.set(url, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`图片加载失败: ${url.split('/').pop() || url}`));
      if (!cached) {
        img.src = url;
        imageCacheRef.current.set(url, img);
      } else if (!img.src) {
        img.src = url;
      }
    });
  }, []);

  const drawElement = useCallback(
    (ctx: CanvasRenderingContext2D, el: BoardElement, includeSelection: boolean) => {
      ctx.save();
      if (el.kind === 'image') {
        const img = imageForUrl(el.url);
        const b = boundsOf(el);
        const center = centerOfBounds(b);
        const rotation = rotationOf(el);
        ctx.globalAlpha = el.opacity ?? 1;
        ctx.translate(center.x, center.y);
        ctx.rotate((rotation * Math.PI) / 180);
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, -b.w / 2, -b.h / 2, b.w, b.h);
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, .18)';
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.fillStyle = 'rgba(15, 23, 42, .5)';
          ctx.font = '24px sans-serif';
          ctx.fillText('加载图片...', -b.w / 2 + 18, -b.h / 2 + 40);
        }
      } else if (el.kind === 'path') {
        if (el.points.length > 0) {
          ctx.strokeStyle = el.color;
          ctx.lineWidth = el.size;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          el.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.stroke();
        }
      } else if (el.kind === 'text') {
        ctx.fillStyle = el.color;
        ctx.font = `600 ${el.size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
        el.text.split(/\r?\n/).forEach((line, i) => ctx.fillText(line, el.x, el.y + i * el.size * 1.28));
      } else {
        const x = el.x;
        const y = el.y;
        const w = el.w;
        const h = el.h;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (el.kind === 'rect') {
          ctx.strokeRect(x, y, w, h);
        } else if (el.kind === 'circle') {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y + h);
          ctx.stroke();
          drawArrowHead(ctx, { x, y }, { x: x + w, y: y + h }, el.size);
        }
      }
      ctx.restore();

      if (includeSelection && selectedElementId === el.id) {
        const b = boundsOf(el);
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        if (isBoxElement(el)) {
          const center = centerOfBounds(b);
          const rotation = rotationOf(el);
          ctx.translate(center.x, center.y);
          ctx.rotate((rotation * Math.PI) / 180);
          const x = -b.w / 2;
          const y = -b.h / 2;
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(x, y, b.w, b.h);
          ctx.setLineDash([]);
          ctx.strokeStyle = 'rgba(34, 211, 238, .75)';
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(0, y - 34);
          ctx.stroke();
          const handles = [
            { x, y },
            { x: x + b.w, y },
            { x, y: y + b.h },
            { x: x + b.w, y: y + b.h },
          ];
          ctx.fillStyle = '#22d3ee';
          handles.forEach((handle) => ctx.fillRect(handle.x - 8, handle.y - 8, 16, 16));
          ctx.beginPath();
          ctx.arc(0, y - 34, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(2, 6, 23, .75)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.setLineDash([8, 6]);
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
    },
    [imageForUrl, selectedElementId],
  );

  const renderCanvas = useCallback(
    (ctx: CanvasRenderingContext2D, includeSelection = true) => {
      ctx.clearRect(0, 0, boardW, boardH);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, boardW, boardH);
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, .18)';
      ctx.lineWidth = 1;
      const grid = 60;
      for (let x = grid; x < boardW; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, boardH);
        ctx.stroke();
      }
      for (let y = grid; y < boardH; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(boardW, y);
        ctx.stroke();
      }
      ctx.restore();
      renderableLayers.forEach((layer) => layer.elements.forEach((el) => drawElement(ctx, el, includeSelection)));
    },
    [boardH, boardW, drawElement, renderableLayers],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = boardW;
    canvas.height = boardH;
    renderCanvas(ctx, true);
  }, [boardH, boardW, renderCanvas]);

  const clientToBoard = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * boardW, 0, boardW),
      y: clamp(((event.clientY - rect.top) / rect.height) * boardH, 0, boardH),
    };
  };

  const hitElement = (pnt: Point) => {
    for (let li = layers.length - 1; li >= 0; li -= 1) {
      const layer = layers[li];
      if (!isLayerVisible(layers, layer) || !isLayerEditable(layers, layer)) continue;
      for (let ei = layer.elements.length - 1; ei >= 0; ei -= 1) {
        const el = layer.elements[ei];
        if (pointInElement(pnt, el, el.kind === 'path' ? 10 : 0)) return { layerId: layer.id, element: el };
      }
    }
    return null;
  };

  const appendToActiveLayer = (el: BoardElement) => {
    if (!activeLayer || !activeLayerWritable) {
      setError('当前图层不可编辑，请新建或解锁图层');
      return false;
    }
    setError(null);
    setSelectedElementId(el.id);
    patchLayers((prev) =>
      prev.map((layer) =>
        layer.id === activeLayer.id && layer.kind === 'layer'
          ? { ...layer, elements: [...layer.elements, el] }
          : layer,
      ),
    );
    return true;
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    rootRef.current?.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pos = clientToBoard(event);

    if (tool === 'select') {
      if (selectedElement && isLayerEditable(layers, selectedElement.layer) && isBoxElement(selectedElement.element)) {
        if (isRotateHandleHit(pos, selectedElement.element)) {
          const b = boundsOf(selectedElement.element);
          const center = centerOfBounds(b);
          actionRef.current = {
            type: 'rotate',
            layerId: selectedElement.layer.id,
            id: selectedElement.element.id,
            center,
            startAngle: Math.atan2(pos.y - center.y, pos.x - center.x),
            originalRotation: rotationOf(selectedElement.element),
          };
          setActiveLayerId(selectedElement.layer.id);
          return;
        }
        const selectedCorner = resizeCornerAt(pos, selectedElement.element);
        if (selectedCorner) {
          actionRef.current = {
            type: 'resize',
            layerId: selectedElement.layer.id,
            id: selectedElement.element.id,
            corner: selectedCorner,
            keepAspect: !event.shiftKey,
            original: selectedElement.element,
          };
          setActiveLayerId(selectedElement.layer.id);
          return;
        }
      }
      const hit = hitElement(pos);
      setSelectedElementId(hit?.element.id || null);
      if (!hit) {
        actionRef.current = null;
        return;
      }
      setActiveLayerId(hit.layerId);
      const hitLayer = layers.find((layer) => layer.id === hit.layerId);
      const originals = hitLayer?.kind === 'layer' ? hitLayer.elements : [];
      const hitCorner = resizeCornerAt(pos, hit.element);
      if (hitCorner) {
        actionRef.current = { type: 'resize', layerId: hit.layerId, id: hit.element.id, corner: hitCorner, keepAspect: !event.shiftKey, original: hit.element };
      } else {
        actionRef.current = { type: 'move', layerId: hit.layerId, id: hit.element.id, start: pos, originals };
      }
      return;
    }

    if (tool === 'text') {
      const text = textDraft.trim() || window.prompt('输入画板文字', '文字') || '';
      if (!text.trim()) return;
      appendToActiveLayer({
        id: uid('text'),
        kind: 'text',
        text,
        x: pos.x,
        y: pos.y,
        color: strokeColor,
        size: Math.max(16, strokeSize * 7),
      });
      return;
    }

    if (tool === 'pen' || tool === 'eraser') {
      if (!activeLayer || !activeLayerWritable) {
        setError('当前图层不可编辑，请新建或解锁图层');
        return;
      }
      const el: PathElement = {
        id: uid(tool),
        kind: 'path',
        points: [pos],
        color: tool === 'eraser' ? '#ffffff' : strokeColor,
        size: tool === 'eraser' ? strokeSize * 4 : strokeSize,
      };
      actionRef.current = { type: 'draw', layerId: activeLayer.id, id: el.id };
      appendToActiveLayer(el);
      return;
    }

    if (!activeLayer || !activeLayerWritable) {
      setError('当前图层不可编辑，请新建或解锁图层');
      return;
    }
    const el: ShapeElement = {
      id: uid(tool),
      kind: tool,
      x: pos.x,
      y: pos.y,
      w: 1,
      h: 1,
      color: strokeColor,
      size: strokeSize,
    };
    actionRef.current = { type: 'shape', layerId: activeLayer.id, id: el.id };
    appendToActiveLayer(el);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const action = actionRef.current;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const pos = clientToBoard(event);
    patchLayers((prev) =>
      prev.map((layer) => {
        if (layer.id !== action.layerId || layer.kind !== 'layer') return layer;
        return {
          ...layer,
          elements: layer.elements.map((el) => {
            if (el.id !== action.id) return el;
            if (action.type === 'draw' && el.kind === 'path') {
              const last = el.points[el.points.length - 1];
              if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2) return el;
              return { ...el, points: [...el.points, pos] };
            }
            if (action.type === 'shape' && (el.kind === 'rect' || el.kind === 'circle' || el.kind === 'arrow')) {
              return { ...el, w: pos.x - el.x, h: pos.y - el.y } as ShapeElement;
            }
            if (action.type === 'move') {
              const original = action.originals.find((x) => x.id === el.id);
              if (!original) return el;
              const dx = pos.x - action.start.x;
              const dy = pos.y - action.start.y;
              if (original.kind === 'path' && el.kind === 'path') {
                return { ...el, points: original.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
              }
              if (original.kind === 'path' || el.kind === 'path') return el;
              return { ...el, x: (original as any).x + dx, y: (original as any).y + dy } as BoardElement;
            }
            if (action.type === 'resize') {
              return resizeBoxElement(action.original, pos, action.corner, action.keepAspect);
            }
            if (action.type === 'rotate' && isBoxElement(el)) {
              const nextAngle = Math.atan2(pos.y - action.center.y, pos.x - action.center.x);
              return {
                ...el,
                rotation: action.originalRotation + ((nextAngle - action.startAngle) * 180) / Math.PI,
              } as BoardElement;
            }
            return el;
          }),
        };
      }),
    );
  };

  const endPointerAction = (event?: PointerEvent<HTMLCanvasElement>) => {
    event?.stopPropagation();
    const action = actionRef.current;
    actionRef.current = null;
    if (!action) return;
    patchLayers((prev) =>
      prev.map((layer) =>
        layer.id === action.layerId && layer.kind === 'layer'
          ? { ...layer, elements: layer.elements.map(normalizeShape) }
          : layer,
      ),
    );
  };

  const addBlankLayer = () => {
    const next = createBlankLayer(layers.filter((layer) => layer.kind === 'layer').length + 1, activeLayer?.groupId || null);
    setActiveLayerId(next.id);
    setSelectedElementId(null);
    patchLayers((prev) => [...prev, next]);
  };

  const addLayerGroup = () => {
    const group = createGroup(layers.filter((layer) => layer.kind === 'group').length + 1);
    patchLayers((prev) => [...prev, group].map((layer) => (layer.id === activeLayerId ? { ...layer, groupId: group.id } : layer)));
  };

  const addImageLayers = useCallback(
    async (urls: Array<{ url: string; name?: string }>) => {
      if (urls.length === 0) return;
      const existingNow = new Set(flattenElements(layers).filter((el): el is ImageElement => el.kind === 'image').map((el) => el.url));
      const unique = urls.filter((item) => item.url && !existingNow.has(item.url));
      if (unique.length === 0) return;

      const baseIndex = layers.filter((layer) => layer.kind === 'layer').length;
      const newLayers = await Promise.all(unique.map(async (item, index) => {
        let rect = fitImageToBoard(boardW, boardH, boardW, boardH, index);
        try {
          const img = await loadImage(item.url);
          rect = fitImageToBoard(img.naturalWidth, img.naturalHeight, boardW, boardH, index);
        } catch {
          // Fallback keeps the layer usable even if the preview image is still loading.
        }
        const layer = createBlankLayer(baseIndex + index + 1);
        layer.name = item.name || `图片 ${index + 1}`;
        layer.elements = [{
          id: uid('image'),
          kind: 'image',
          url: item.url,
          name: item.name,
          ...rect,
          rotation: 0,
          opacity: 1,
        }];
        return layer;
      }));

      patchLayers((prev) => {
        const existing = new Set(flattenElements(prev).filter((el): el is ImageElement => el.kind === 'image').map((el) => el.url));
        const safeNewLayers = newLayers.filter((layer) => {
          const img = layer.elements[0];
          return img?.kind === 'image' && !existing.has(img.url);
        });
        return safeNewLayers.length ? [...prev, ...safeNewLayers] : prev;
      });
      const lastNewLayerId = newLayers[newLayers.length - 1]?.id;
      if (lastNewLayerId) {
        setActiveLayerId(lastNewLayerId);
        setSelectedElementId(null);
      }
    },
    [boardH, boardW, layers, loadImage, patchLayers],
  );

  const upstreamSig = useMemo(() => upstream.images.map((m) => m.url).join('|'), [upstream.images]);

  useEffect(() => {
    if (!upstreamSig || elementCount(layers) > 0 || autoImportSigRef.current === upstreamSig) return;
    autoImportSigRef.current = upstreamSig;
    void addImageLayers(upstream.images.map((m) => ({ url: m.url, name: m.label })));
  }, [addImageLayers, layers, upstream.images, upstreamSig]);

  const changeRatio = (nextRatio: BoardRatio) => {
    setRatio(nextRatio);
    const patch: Record<string, any> = { boardRatio: nextRatio };
    if (nextRatio !== 'free') {
      const s = RATIO_SIZE[nextRatio];
      setBoardW(s.w);
      setBoardH(s.h);
      patch.boardWidth = s.w;
      patch.boardHeight = s.h;
    }
    update(patch);
  };

  const clearBoard = () => {
    if (elementCount(layers) > 0 && !window.confirm('清空当前画板？这会保留一个空白图层。')) return;
    const fresh = createBlankLayer(1);
    setActiveLayerId(fresh.id);
    setSelectedElementId(null);
    setLayers([fresh]);
    update({
      boardLayers: [fresh],
      boardElements: [],
      activeBoardLayerId: fresh.id,
      imageUrl: '',
      imageUrls: [],
      urls: [],
      outputImageUrl: '',
      status: 'idle',
      error: null,
    });
    setStatus('idle');
    setError(null);
  };

  const reorderLayer = (layerId: string, direction: -1 | 1) => {
    patchLayers((prev) => {
      const idx = prev.findIndex((layer) => layer.id === layerId);
      const nextIdx = idx + direction;
      if (idx < 0 || nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return next;
    });
  };

  const toggleLayerFlag = (layerId: string, key: 'hidden' | 'locked') => {
    patchLayers((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, [key]: !layer[key] } : layer)));
  };

  const toggleGroupCollapsed = (groupId: string) => {
    patchLayers((prev) => prev.map((layer) => (layer.id === groupId && layer.kind === 'group' ? { ...layer, collapsed: !layer.collapsed } : layer)));
  };

  const deleteLayer = (layerId: string) => {
    patchLayers((prev) => {
      const target = prev.find((layer) => layer.id === layerId);
      if (!target) return prev;
      if (target.kind === 'group') {
        return prev.filter((layer) => layer.id !== layerId).map((layer) => (layer.groupId === layerId ? { ...layer, groupId: null } : layer));
      }
      const next = prev.filter((layer) => layer.id !== layerId);
      if (!next.some((layer) => layer.kind === 'layer')) return [createBlankLayer(1)];
      return next;
    });
    if (activeLayerId === layerId) {
      setSelectedElementId(null);
      setActiveLayerId('');
    }
  };

  const startLayerDrag = (event: ReactDragEvent<HTMLDivElement>, layer: BoardLayer) => {
    if (layer.kind !== 'layer') {
      event.preventDefault();
      return;
    }
    setDragLayerId(layer.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-t8-board-layer', layer.id);
    event.dataTransfer.setData('text/plain', layer.id);
  };

  const layerIdFromDrag = (event: ReactDragEvent<HTMLElement>) =>
    event.dataTransfer.getData('application/x-t8-board-layer') || event.dataTransfer.getData('text/plain') || dragLayerId || '';

  const moveLayerToGroup = (layerId: string, groupId: string | null) => {
    if (!layerId) return;
    patchLayers((prev) =>
      prev.map((layer) =>
        layer.id === layerId && layer.kind === 'layer' ? { ...layer, groupId } : layer,
      ),
    );
    setActiveLayerId(layerId);
  };

  const deleteSelectedElement = useCallback(() => {
    if (!selectedElementId) return false;
    const exists = layers.some((layer) => layer.kind === 'layer' && layer.elements.some((el) => el.id === selectedElementId));
    if (!exists) return false;
    patchLayers((prev) =>
      prev.map((layer) =>
        layer.kind === 'layer'
          ? { ...layer, elements: layer.elements.filter((el) => el.id !== selectedElementId) }
          : layer,
      ),
    );
    setSelectedElementId(null);
    return true;
  }, [layers, patchLayers, selectedElementId]);

  const handleRootKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if ((event.key !== 'Delete' && event.key !== 'Backspace') || isEditableEventTarget(event.target)) return;
      if (!selectedElementId) return;
      if (!deleteSelectedElement()) return;
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
    },
    [deleteSelectedElement, selectedElementId],
  );

  useEffect(() => {
    if (!selected || !selectedElementId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== 'Delete' && event.key !== 'Backspace') || isEditableEventTarget(event.target)) return;
      if (!boardHasKeyboardFocus()) return;
      if (!deleteSelectedElement()) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [boardHasKeyboardFocus, deleteSelectedElement, selected, selectedElementId]);

  const handleLocalImageChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
      event.target.value = '';
      if (files.length === 0) return;
      setError(null);
      try {
        const uploaded = await Promise.all(files.map(async (file) => ({
          url: await uploadFileBlob(file, file.name),
          name: file.name,
        })));
        await addImageLayers(uploaded);
      } catch (e: any) {
        setError(e?.message || '载入图片失败');
      }
    },
    [addImageLayers],
  );

  const exportBoardJson = useCallback(() => {
    downloadJsonFile(`t8-drawing-board-${Date.now()}.json`, {
      schema: 't8-drawing-board',
      version: 1,
      exportedAt: new Date().toISOString(),
      boardRatio: ratio,
      boardWidth: boardW,
      boardHeight: boardH,
      boardLayers: layers,
      activeBoardLayerId: activeLayerId,
    });
  }, [activeLayerId, boardH, boardW, layers, ratio]);

  const handleBoardJsonChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        const nextLayers = normalizeLayers(json?.boardLayers || json?.layers, json?.boardElements || json?.elements);
        const nextRatio = isBoardRatio(json?.boardRatio) ? json.boardRatio : 'free';
        const nextW = clamp(Number(json?.boardWidth) || DEFAULT_BOARD_W, 240, 4096);
        const nextH = clamp(Number(json?.boardHeight) || DEFAULT_BOARD_H, 240, 4096);
        const nextActive = nextLayers.some((layer) => layer.id === json?.activeBoardLayerId && layer.kind === 'layer')
          ? json.activeBoardLayerId
          : firstEditableLayerId(nextLayers);
        setRatio(nextRatio);
        setBoardW(nextW);
        setBoardH(nextH);
        setLayers(nextLayers);
        setActiveLayerId(nextActive);
        setSelectedElementId(null);
        setError(null);
        update({
          boardRatio: nextRatio,
          boardWidth: nextW,
          boardHeight: nextH,
          boardLayers: nextLayers,
          boardElements: flattenElements(nextLayers),
          activeBoardLayerId: nextActive,
        });
      } catch (e: any) {
        setError(e?.message || '导入画板 JSON 失败');
      }
    },
    [update],
  );

  const exportBoard = useCallback(async () => {
    setError(null);
    setStatus('running');
    update({ status: 'running', error: null });
    try {
      const imageEls = renderableLayers.flatMap((layer) => layer.elements).filter((el): el is ImageElement => el.kind === 'image');
      await Promise.all(imageEls.map((el) => loadImage(el.url)));
      const out = document.createElement('canvas');
      out.width = boardW;
      out.height = boardH;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('无法创建画板画布');
      renderCanvas(ctx, false);
      const url = await uploadDataUrl(out.toDataURL('image/png'), 'drawing-board');
      update({
        status: 'success',
        error: null,
        boardLayers: layers,
        boardElements: flattenElements(layers),
        activeBoardLayerId: activeLayerId,
        boardWidth: boardW,
        boardHeight: boardH,
        boardRatio: ratio,
        imageUrl: url,
        imageUrls: [url],
        urls: [url],
        outputImageUrl: url,
      });
      setStatus('success');
    } catch (e: any) {
      const msg = e?.message || '导出画板失败';
      setError(msg);
      setStatus('error');
      update({ status: 'error', error: msg });
      throw e;
    }
  }, [activeLayerId, boardH, boardW, layers, ratio, renderCanvas, renderableLayers, update]);

  useRunTrigger(id, exportBoard);

  const toolButton = (value: BoardTool, icon: ReactNode) => (
    <button
      type="button"
      className={`t8-btn min-h-8 min-w-0 px-1.5 text-[10px] ${tool === value ? 't8-btn-primary' : ''}`}
      onClick={() => setTool(value)}
      title={TOOL_LABEL[value]}
    >
      {icon}
      <span className="hidden sm:inline">{TOOL_LABEL[value]}</span>
    </button>
  );

  const activeLayerIndex = layers.findIndex((layer) => layer.id === activeLayerId);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDownCapture={handleRootKeyDownCapture}
      className={`t8-node relative transition-all ${selected ? 'ring-2 ring-orange-300' : ''}`}
      style={{ width: NODE_W, height: NODE_H, overflow: 'visible' }}
    >
      <Handle type="target" position={Position.Left} style={{ background: PORT_COLOR.image, border: 0, zIndex: 40 }} />
      <Handle type="source" position={Position.Right} style={{ background: PORT_COLOR.image, border: 0, zIndex: 40 }} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleLocalImageChange} />
      <input ref={boardJsonInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleBoardJsonChange} />

      <div className="t8-node-header flex items-center gap-2 rounded-t-[inherit] px-3 py-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--t8-accent, #fb923c) 18%, transparent)', color: 'var(--t8-accent, #fb923c)' }}
        >
          <Pencil size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold">画板</div>
          <div className="truncate text-[11px] opacity-70">
            {boardW}×{boardH} · {layers.filter((layer) => layer.kind === 'layer').length} 图层 · {elementCount(layers)} 元素
          </div>
        </div>
        <button type="button" className="t8-mini-icon-button nodrag nopan" onClick={clearBoard} title="清空画板">
          <RotateCcw size={14} />
        </button>
      </div>

      <div
        className="nodrag nowheel grid min-h-0 grid-cols-[330px_1fr] gap-3 overflow-hidden p-3"
        style={{ height: NODE_H - 58 }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onWheelCapture={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
          <section className="t8-card flex-none space-y-2 p-2">
            <div className="grid grid-cols-7 gap-1.5">
              {toolButton('select', <MousePointer2 size={13} />)}
              {toolButton('pen', <PenLine size={13} />)}
              {toolButton('eraser', <Eraser size={13} />)}
              {toolButton('text', <Type size={13} />)}
              {toolButton('rect', <RectangleHorizontal size={13} />)}
              {toolButton('circle', <Circle size={13} />)}
              {toolButton('arrow', <Send size={13} />)}
            </div>
            <div className="grid grid-cols-[1fr_82px_82px] gap-2">
              <select className="t8-select nodrag nowheel h-8 px-2 text-[11px]" value={ratio} onChange={(e) => changeRatio(e.target.value as BoardRatio)}>
                <option value="free">自由尺寸</option>
                <option value="1:1">1:1 方图</option>
                <option value="16:9">16:9 横图</option>
                <option value="9:16">9:16 竖图</option>
                <option value="4:3">4:3 横图</option>
                <option value="3:4">3:4 竖图</option>
              </select>
              <input
                className="t8-input nodrag nowheel h-8 px-2 text-[11px]"
                type="number"
                min={240}
                max={4096}
                value={boardW}
                onChange={(e) => {
                  const v = clamp(Number(e.target.value) || DEFAULT_BOARD_W, 240, 4096);
                  setRatio('free');
                  setBoardW(v);
                  update({ boardRatio: 'free', boardWidth: v });
                }}
                title="画布宽度"
              />
              <input
                className="t8-input nodrag nowheel h-8 px-2 text-[11px]"
                type="number"
                min={240}
                max={4096}
                value={boardH}
                onChange={(e) => {
                  const v = clamp(Number(e.target.value) || DEFAULT_BOARD_H, 240, 4096);
                  setRatio('free');
                  setBoardH(v);
                  update({ boardRatio: 'free', boardHeight: v });
                }}
                title="画布高度"
              />
            </div>
            <div className="grid grid-cols-[38px_1fr_46px] items-center gap-2">
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => {
                  setStrokeColor(e.target.value);
                  update({ boardColor: e.target.value });
                }}
                className="nodrag h-8 w-full rounded border bg-transparent"
                title="颜色"
              />
              <input
                type="range"
                min={1}
                max={28}
                value={strokeSize}
                onChange={(e) => {
                  const v = Number(e.target.value) || 5;
                  setStrokeSize(v);
                  update({ boardStrokeSize: v });
                }}
                className="nodrag nowheel w-full accent-orange-400"
              />
              <div className="text-right text-[11px] opacity-70">{strokeSize}px</div>
            </div>
            {tool === 'text' && (
              <input
                className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                value={textDraft}
                onChange={(e) => {
                  setTextDraft(e.target.value);
                  update({ boardTextDraft: e.target.value });
                }}
                placeholder="点击右侧画布放置文字"
              />
            )}
          </section>

          <section className="t8-card flex min-h-0 flex-1 flex-col space-y-2 p-2">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold">
              <Layers size={14} /> 图层
              <span className="ml-auto text-[10px] font-normal opacity-60">{activeLayer?.name || '未选择'}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" className="t8-btn min-h-7 px-2 text-[10px]" onClick={addBlankLayer}>
                <Plus size={12} /> 新图层
              </button>
              <button type="button" className="t8-btn min-h-7 px-2 text-[10px]" onClick={addLayerGroup}>
                <FolderPlus size={12} /> 新建组
              </button>
            </div>
            <div
              className="nowheel min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
              onDragOver={(e) => {
                if (!dragLayerId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                const layerId = layerIdFromDrag(e);
                if (!layerId) return;
                e.preventDefault();
                moveLayerToGroup(layerId, null);
                setDragLayerId(null);
              }}
            >
              {layers
                .map((layer, index) => ({ layer, index }))
                .filter(({ layer }) => !isLayerFoldedInList(layers, layer))
                .slice()
                .reverse()
                .map(({ layer }) => {
                  const isActive = layer.id === activeLayerId;
                  const isGroup = layer.kind === 'group';
                  return (
                    <div
                      key={layer.id}
                      draggable={layer.kind === 'layer'}
                      onDragStart={(e) => startLayerDrag(e, layer)}
                      onDragEnd={() => setDragLayerId(null)}
                      onDragOver={(e) => {
                        if (!dragLayerId || layer.kind !== 'group') return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        if (layer.kind !== 'group') return;
                        const layerId = layerIdFromDrag(e);
                        if (!layerId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        moveLayerToGroup(layerId, layer.id);
                        setDragLayerId(null);
                      }}
                      className={`flex w-full items-center gap-1 rounded border px-1 py-1 text-left text-[10px] ${
                        isActive ? 't8-btn-primary' : ''
                      }`}
                      style={{
                        borderColor: 'var(--t8-border, rgba(148,163,184,.25))',
                        paddingLeft: layer.groupId ? 14 : undefined,
                        opacity: layer.hidden ? 0.55 : 1,
                      }}
                    >
                      <button
                        type="button"
                        className="t8-mini-icon-button h-5 w-5 shrink-0"
                        title={layer.hidden ? '显示图层' : '隐藏图层'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerFlag(layer.id, 'hidden');
                        }}
                      >
                        {layer.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <button
                        type="button"
                        className="t8-mini-icon-button h-5 w-5 shrink-0"
                        title={layer.locked ? '解锁图层' : '锁定图层'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerFlag(layer.id, 'locked');
                        }}
                      >
                        {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
                      </button>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1 bg-transparent text-left"
                        title={isGroup ? (layer.collapsed ? '展开组内图层' : '折叠组内图层') : '选中图层'}
                        onClick={() => {
                          if (layer.kind === 'layer') {
                            setActiveLayerId(layer.id);
                            setTool('select');
                          } else {
                            toggleGroupCollapsed(layer.id);
                          }
                        }}
                      >
                        {isGroup ? (layer.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />) : <Layers size={12} />}
                        <span className="min-w-0 flex-1 truncate">{layer.name}</span>
                        <span className="opacity-50">{isGroup ? '组' : layer.elements.length}</span>
                      </button>
                    </div>
                  );
                })}
            </div>
          </section>

          <section className="t8-card flex-none space-y-2 p-2">
            <div className="text-[12px] font-semibold">当前图层</div>
            {activeLayer ? (
              <>
                <input
                  className="t8-input nodrag nowheel h-8 w-full px-2 text-[11px]"
                  value={activeLayer.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    patchLayers((prev) => prev.map((layer) => (layer.id === activeLayer.id ? { ...layer, name: value } : layer)));
                  }}
                />
                <div className="grid grid-cols-5 gap-1">
                  <button className="t8-mini-icon-button" type="button" title="下移" onClick={() => reorderLayer(activeLayer.id, -1)} disabled={activeLayerIndex <= 0}>
                    <ArrowDown size={13} />
                  </button>
                  <button className="t8-mini-icon-button" type="button" title="上移" onClick={() => reorderLayer(activeLayer.id, 1)} disabled={activeLayerIndex >= layers.length - 1}>
                    <ArrowUp size={13} />
                  </button>
                  <button className="t8-mini-icon-button" type="button" title="删除图层" onClick={() => deleteLayer(activeLayer.id)}>
                    <Trash2 size={13} />
                  </button>
                  <button className="t8-mini-icon-button" type="button" title="输出 PNG" onClick={exportBoard} disabled={status === 'running'}>
                    {status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  </button>
                  <button className="t8-mini-icon-button" type="button" title="删除选中元素" onClick={() => deleteSelectedElement()} disabled={!selectedElement}>
                    <Eraser size={13} />
                  </button>
                </div>
                <div className="text-[10px] leading-relaxed opacity-60">
                  {activeLayerWritable ? '画笔和图形会写入当前图层。' : '当前图层隐藏或锁定，不能编辑。'}
                  {selectedElement && <span> 选中：{labelForElement(selectedElement.element)}</span>}
                </div>
              </>
            ) : (
              <div className="rounded border border-dashed p-4 text-center text-[11px] opacity-50">没有可编辑图层</div>
            )}
          </section>

        </div>

        <section className="t8-card flex min-h-0 flex-col p-2">
          <div className="mb-2 flex flex-none items-center justify-between gap-2 text-[11px] opacity-80">
            <span>创作画布</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="t8-btn min-h-7 px-2 text-[10px]"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={12} /> 载入图片
              </button>
              {hasUpstreamImages && (
                <button
                  type="button"
                  className="t8-btn min-h-7 px-2 text-[10px]"
                  onClick={() => void addImageLayers(upstream.images.map((m) => ({ url: m.url, name: m.label })))}
                >
                  <ImagePlus size={12} /> 导入上游 {upstream.images.length}
                </button>
              )}
            </div>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border p-2"
            style={{
              borderColor: 'var(--t8-border, rgba(148,163,184,.25))',
              background: 'repeating-conic-gradient(rgba(148,163,184,.18) 0% 25%, transparent 0% 50%) 50% / 22px 22px',
            }}
          >
            <canvas
              ref={canvasRef}
              className="block touch-none cursor-crosshair"
              style={{ width: previewSize.w, height: previewSize.h }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endPointerAction}
              onPointerCancel={endPointerAction}
              onPointerLeave={endPointerAction}
            />
          </div>
          {error && (
            <div
              className="mt-2 flex-none rounded border px-2 py-1 text-[11px]"
              style={{
                borderColor: 'color-mix(in srgb, var(--t8-danger, #ef4444) 45%, transparent)',
                background: 'color-mix(in srgb, var(--t8-danger, #ef4444) 12%, transparent)',
                color: 'var(--t8-danger, #ef4444)',
              }}
            >
              {error}
            </div>
          )}
          <div className="mt-2 grid flex-none grid-cols-[1fr_1fr_1.35fr] gap-2">
            <button
              type="button"
              className="t8-btn min-h-8 px-2 text-[11px]"
              onClick={() => boardJsonInputRef.current?.click()}
            >
              <Upload size={13} /> 导入画板
            </button>
            <button type="button" className="t8-btn min-h-8 px-2 text-[11px]" onClick={exportBoardJson}>
              <Download size={13} /> 导出画板
            </button>
            <button
              type="button"
              className="t8-btn t8-btn-primary min-h-8 px-2 text-[11px]"
              onClick={exportBoard}
              disabled={status === 'running'}
            >
              {status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {status === 'running' ? '导出中...' : '运行输出画板图像'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default memo(DrawingBoardNode);

import { memo, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import {
  Clipboard,
  Download,
  FileJson,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import { PORT_COLOR } from '../../config/portTypes';
import { RH_TOOLBOX_MANIFEST } from '../../data/rhToolboxManifest';
import { fetchRhAppInfo } from '../../services/generation';
import { useThemeStore } from '../../stores/theme';
import {
  RH_TOOLBOX_CAPABILITY_LABELS,
  normalizeRhToolboxManifest,
  type RhToolboxCategory,
  type RhToolboxFixedParam,
  type RhToolboxInputMapping,
  type RhToolboxMediaKind,
  type RhToolboxOutputMapping,
  type RhToolboxOutputRole,
  type RhToolboxTool,
  type RhToolboxUserParam,
  type RhToolboxUserParamKind,
} from '../../utils/rhToolbox';
import { saveRhToolboxDeveloperTool } from '../../utils/rhToolboxDeveloper';
import { useUpdateNodeData } from './useUpdateNodeData';
import ResizableCorners from './ResizableCorners';

type MakerInput = RhToolboxInputMapping & { rowId: string };
type MakerParam = RhToolboxUserParam & { rowId: string; optionsText?: string };
type MakerFixed = RhToolboxFixedParam & { rowId: string };
type MakerOutput = RhToolboxOutputMapping & { rowId: string };

const MEDIA_KINDS: RhToolboxMediaKind[] = ['image', 'video', 'audio', 'text'];
const PARAM_KINDS: RhToolboxUserParamKind[] = ['text', 'number', 'select', 'boolean'];
const OUTPUT_ROLES: RhToolboxOutputRole[] = ['append-output', 'replace-source', 'text-only', 'multi-output'];

const DEFAULT_INPUT: MakerInput = {
  rowId: 'input-1',
  key: 'source-image',
  label: '原图',
  kind: 'image',
  rhNodeId: '7',
  fieldName: 'image',
  required: true,
  uploadAsset: true,
};

const DEFAULT_OUTPUT: MakerOutput = {
  rowId: 'output-1',
  key: 'output-image',
  label: '输出图',
  kind: 'image',
  role: 'append-output',
};

const handleStyle: CSSProperties = {
  width: 12,
  height: 12,
  border: 'none',
  zIndex: 20,
};

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function cleanId(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function cleanText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function parseList(value: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  String(value ?? '')
    .split(/[\n,，;；]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      out.push(item);
    });
  return out;
}

function inferMediaKind(field: any): RhToolboxMediaKind {
  const haystack = `${field?.fieldType || ''} ${field?.valueType || ''} ${field?.fieldName || ''}`.toLowerCase();
  if (haystack.includes('video')) return 'video';
  if (haystack.includes('audio') || haystack.includes('music')) return 'audio';
  if (haystack.includes('image') || haystack.includes('img') || haystack.includes('photo')) return 'image';
  return 'text';
}

function inferParamKind(field: any): RhToolboxUserParamKind {
  const t = String(field?.fieldType || field?.valueType || '').toUpperCase();
  if (t.includes('NUMBER') || t.includes('FLOAT') || t.includes('INTEGER')) return 'number';
  if (t.includes('BOOLEAN')) return 'boolean';
  if (t.includes('LIST') || t.includes('SELECT')) return 'select';
  return 'text';
}

function fieldNodeId(field: any): string {
  return cleanText(field?.nodeId ?? field?.node_id ?? field?.id);
}

function fieldName(field: any): string {
  return cleanText(field?.fieldName ?? field?.field_name ?? field?.name ?? field?.key);
}

function fieldDefault(field: any): string {
  const value = field?.fieldValue ?? field?.defaultValue ?? field?.value ?? '';
  if (Array.isArray(value)) return String(value[0] ?? '');
  if (value && typeof value === 'object') return '';
  return String(value ?? '');
}

function normalizeInputRows(value: unknown): MakerInput[] {
  const rows = Array.isArray(value) ? value : [DEFAULT_INPUT];
  return rows.map((row: any, index) => ({
    rowId: row?.rowId || uid('input'),
    key: cleanId(row?.key, `input-${index + 1}`),
    label: cleanText(row?.label, `输入${index + 1}`),
    kind: MEDIA_KINDS.includes(row?.kind) ? row.kind : 'image',
    rhNodeId: cleanText(row?.rhNodeId),
    fieldName: cleanText(row?.fieldName),
    required: row?.required !== false,
    multiple: row?.multiple === true,
    maxItems: Number.isFinite(row?.maxItems) ? Number(row.maxItems) : undefined,
    defaultValue: row?.defaultValue == null ? undefined : String(row.defaultValue),
    uploadAsset: row?.uploadAsset !== false,
    order: Number.isFinite(row?.order) ? Number(row.order) : index,
  }));
}

function normalizeParamRows(value: unknown): MakerParam[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row: any, index) => ({
    rowId: row?.rowId || uid('param'),
    key: cleanId(row?.key, `param-${index + 1}`),
    label: cleanText(row?.label, `参数${index + 1}`),
    kind: PARAM_KINDS.includes(row?.kind) ? row.kind : 'text',
    rhNodeId: cleanText(row?.rhNodeId),
    fieldName: cleanText(row?.fieldName),
    defaultValue: row?.defaultValue,
    placeholder: cleanText(row?.placeholder),
    options: Array.isArray(row?.options) ? row.options : parseList(row?.optionsText),
    optionsText: cleanText(row?.optionsText || (Array.isArray(row?.options) ? row.options.join('\n') : '')),
    min: Number.isFinite(row?.min) ? Number(row.min) : undefined,
    max: Number.isFinite(row?.max) ? Number(row.max) : undefined,
    step: Number.isFinite(row?.step) ? Number(row.step) : undefined,
    required: row?.required === true,
  }));
}

function normalizeFixedRows(value: unknown): MakerFixed[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row: any) => ({
    rowId: row?.rowId || uid('fixed'),
    rhNodeId: cleanText(row?.rhNodeId),
    fieldName: cleanText(row?.fieldName),
    value: row?.value ?? '',
    valueType: row?.valueType || 'text',
  }));
}

function normalizeOutputRows(value: unknown): MakerOutput[] {
  const rows = Array.isArray(value) ? value : [DEFAULT_OUTPUT];
  return rows.map((row: any, index) => ({
    rowId: row?.rowId || uid('output'),
    key: cleanId(row?.key, `output-${index + 1}`),
    label: cleanText(row?.label, `输出${index + 1}`),
    kind: MEDIA_KINDS.includes(row?.kind) ? row.kind : 'image',
    role: OUTPUT_ROLES.includes(row?.role) ? row.role : 'append-output',
  }));
}

function stripRowIds<T extends { rowId?: string }>(rows: T[]): Array<Omit<T, 'rowId'>> {
  return rows.map(({ rowId: _rowId, ...row }) => row);
}

function buildToolFromData(data: any, categories: RhToolboxCategory[]): RhToolboxTool {
  const title = cleanText(data.rhToolboxMakerTitle, '未命名工具');
  const id = cleanId(data.rhToolboxMakerId, cleanId(title, 'rh-toolbox-tool'));
  const categoryId = categories.some((category) => category.id === data.rhToolboxMakerCategoryId)
    ? data.rhToolboxMakerCategoryId
    : categories[0]?.id || 'image-tools';
  const inputRows = normalizeInputRows(data.rhToolboxMakerInputs).filter((row) => row.rhNodeId && row.fieldName);
  const paramRows = normalizeParamRows(data.rhToolboxMakerUserParams).filter((row) => row.rhNodeId && row.fieldName && row.label);
  const fixedRows = normalizeFixedRows(data.rhToolboxMakerFixedParams).filter((row) => row.rhNodeId && row.fieldName);
  const outputRows = normalizeOutputRows(data.rhToolboxMakerOutputs);
  const capabilities = parseList(data.rhToolboxMakerCapabilities || 'image.cutout\nimage.edit');
  const tool = normalizeRhToolboxManifest({
    schema: 't8-rh-toolbox-manifest',
    version: 1,
    categories,
    tools: [{
      id,
      title,
      description: cleanText(data.rhToolboxMakerDescription, '维护者预置 RH 工具'),
      categoryId,
      webappId: cleanText(data.rhToolboxMakerWebappId),
      enabled: data.rhToolboxMakerEnabled !== false,
      order: Number.isFinite(data.rhToolboxMakerOrder) ? Number(data.rhToolboxMakerOrder) : 100,
      capabilities,
      inputSchema: stripRowIds(inputRows),
      outputSchema: stripRowIds(outputRows),
      fixedParams: stripRowIds(fixedRows),
      userParams: stripRowIds(paramRows).map((row: any) => ({
        ...row,
        options: row.kind === 'select' ? parseList(row.optionsText || row.options) : undefined,
      })),
      runtime: {
        instanceType: cleanText(data.rhToolboxMakerInstanceType),
        pollIntervalMs: Number(data.rhToolboxMakerPollIntervalMs) || 5000,
        maxPolls: Number(data.rhToolboxMakerMaxPolls) || 480,
        fetchAppInfo: data.rhToolboxMakerFetchAppInfo !== false,
      },
      ui: {
        icon: cleanText(data.rhToolboxMakerIcon, 'Wrench'),
        accent: cleanText(data.rhToolboxMakerAccent, '#22c55e'),
        quickActionLabel: cleanText(data.rhToolboxMakerQuickActionLabel, title.slice(0, 8)),
        showInNode: data.rhToolboxMakerShowInNode !== false,
        showInImageEditor: data.rhToolboxMakerShowInImageEditor === true,
        showInVideoEditor: data.rhToolboxMakerShowInVideoEditor === true,
        showInTextEditor: data.rhToolboxMakerShowInTextEditor === true,
        showInAudioEditor: data.rhToolboxMakerShowInAudioEditor === true,
      },
      version: Number(data.rhToolboxMakerVersion) || 1,
    }],
  }).tools[0];
  return tool;
}

const RHToolboxMakerNode = ({ id, data, selected }: NodeProps) => {
  const update = useUpdateNodeData(id);
  const updateNodeInternals = useUpdateNodeInternals();
  const { theme, style: themeStyle } = useThemeStore();
  const isLight = theme === 'light';
  const isPixel = themeStyle === 'pixel';
  const d = (data || {}) as any;
  const categories = useMemo(() => normalizeRhToolboxManifest(RH_TOOLBOX_MANIFEST).categories, []);
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState('');
  const appInfo = d.rhToolboxMakerAppInfo;
  const appFields: any[] = Array.isArray(appInfo?.nodeInfoList) ? appInfo.nodeInfoList : [];
  const inputs = normalizeInputRows(d.rhToolboxMakerInputs);
  const params = normalizeParamRows(d.rhToolboxMakerUserParams);
  const fixedParams = normalizeFixedRows(d.rhToolboxMakerFixedParams);
  const outputs = normalizeOutputRows(d.rhToolboxMakerOutputs);
  const tool = useMemo(() => buildToolFromData(d, categories), [d, categories]);
  const toolJson = useMemo(() => JSON.stringify(tool, null, 2), [tool]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const initialSize = (d?.size && typeof d.size.w === 'number') ? d.size : { w: 760, h: 620 };
  const [size, setSize] = useState<{ w: number; h: number }>(initialSize);

  const accent = cleanText(d.rhToolboxMakerAccent, isPixel ? 'var(--px-ink)' : '#22c55e');
  const bg = isPixel ? 'var(--px-surface)' : isLight ? '#fff7ed' : 'rgba(13, 24, 18, 0.96)';
  const surface = isPixel ? 'var(--px-muted)' : isLight ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.06)';
  const text = isPixel ? 'var(--px-ink)' : isLight ? '#111827' : '#ecfdf5';
  const subText = isPixel ? 'var(--px-ink-soft)' : isLight ? '#6b7280' : 'rgba(236,253,245,0.64)';
  const border = isPixel ? 'var(--px-ink)' : isLight ? 'rgba(22,101,52,0.30)' : 'rgba(134,239,172,0.24)';

  const rootStyle: CSSProperties = {
    background: bg,
    color: text,
    width: size.w,
    height: size.h,
    minWidth: 640,
    minHeight: 520,
    border: `2px solid ${selected ? accent : border}`,
    borderRadius: isPixel ? 8 : 14,
    boxShadow: isPixel ? '4px 4px 0 var(--px-ink)' : 'var(--t8-node-shadow, 0 12px 30px rgba(0,0,0,.28))',
    overflow: 'visible',
  };

  const fieldStyle: CSSProperties = {
    width: '100%',
    background: surface,
    color: text,
    border: `1px solid ${border}`,
    borderRadius: 7,
    padding: '6px 8px',
    fontSize: 11,
    outline: 'none',
  };

  const updateData = (patch: Record<string, any>) => update(patch);

  const onResize = (_event: any, params: { width: number; height: number }) => {
    const next = { w: Math.round(params.width), h: Math.round(params.height) };
    setSize(next);
    update({ size: next });
    updateNodeInternals(id);
  };

  const setRows = (key: string, rows: any[]) => updateData({ [key]: rows });
  const patchRow = (key: string, rows: any[], rowId: string, patch: Record<string, any>) => {
    setRows(key, rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };
  const removeRow = (key: string, rows: any[], rowId: string) => setRows(key, rows.filter((row) => row.rowId !== rowId));

  const addFieldAsInput = (field: any, kind = inferMediaKind(field)) => {
    const nodeId = fieldNodeId(field);
    const name = fieldName(field);
    if (!nodeId || !name) return;
    setRows('rhToolboxMakerInputs', [...inputs, {
      rowId: uid('input'),
      key: cleanId(name, `${kind}-${inputs.length + 1}`),
      label: name,
      kind,
      rhNodeId: nodeId,
      fieldName: name,
      required: true,
      uploadAsset: kind !== 'text',
    }]);
  };

  const addFieldAsParam = (field: any) => {
    const nodeId = fieldNodeId(field);
    const name = fieldName(field);
    if (!nodeId || !name) return;
    const kind = inferParamKind(field);
    setRows('rhToolboxMakerUserParams', [...params, {
      rowId: uid('param'),
      key: cleanId(name, `param-${params.length + 1}`),
      label: name,
      kind,
      rhNodeId: nodeId,
      fieldName: name,
      defaultValue: fieldDefault(field),
      optionsText: Array.isArray(field?.fieldValue) ? field.fieldValue.join('\n') : '',
      required: false,
    }]);
  };

  const addFieldAsFixed = (field: any) => {
    const nodeId = fieldNodeId(field);
    const name = fieldName(field);
    if (!nodeId || !name) return;
    setRows('rhToolboxMakerFixedParams', [...fixedParams, {
      rowId: uid('fixed'),
      rhNodeId: nodeId,
      fieldName: name,
      value: fieldDefault(field),
      valueType: inferParamKind(field),
    }]);
  };

  const fetchInfo = async () => {
    const webappId = cleanText(d.rhToolboxMakerWebappId);
    if (!webappId) {
      setStatus('请先填写 WebApp ID');
      return;
    }
    setFetching(true);
    setStatus('读取 RH 应用字段...');
    try {
      const info = await fetchRhAppInfo(webappId);
      updateData({
        rhToolboxMakerAppInfo: info,
        rhToolboxMakerTitle: d.rhToolboxMakerTitle || info?.appName || info?.name || d.rhToolboxMakerTitle,
      });
      setStatus(`已读取 ${Array.isArray(info?.nodeInfoList) ? info.nodeInfoList.length : 0} 个字段`);
    } catch (error: any) {
      setStatus(error?.message || '读取 RH 应用失败');
    } finally {
      setFetching(false);
    }
  };

  const copyJson = async () => {
    await navigator.clipboard?.writeText(toolJson);
    updateData({ text: toolJson, outputText: toolJson, prompt: toolJson, rhToolboxMakerGeneratedJson: toolJson });
    setStatus('已复制模板 JSON，并写入节点文本输出');
  };

  const downloadJson = () => {
    const blob = new Blob([toolJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tool.id || 'rh-toolbox-tool'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('已下载模板 JSON');
  };

  const saveDraft = () => {
    const result = saveRhToolboxDeveloperTool(tool, categories);
    updateData({ text: toolJson, outputText: toolJson, prompt: toolJson, rhToolboxMakerGeneratedJson: toolJson });
    setStatus(result.ok ? '已保存到开发草稿，RH工具箱节点会自动刷新' : (result.error || '保存失败'));
  };

  const renderInput = (label: string, value: any, onChange: (value: string) => void, placeholder = '') => (
    <label className="block text-[10px] space-y-1" style={{ color: subText }}>
      <span>{label}</span>
      <input
        value={String(value ?? '')}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="nodrag nowheel"
        style={fieldStyle}
      />
    </label>
  );

  const renderSelect = (label: string, value: any, options: string[], onChange: (value: string) => void) => (
    <label className="block text-[10px] space-y-1" style={{ color: subText }}>
      <span>{label}</span>
      <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} className="nodrag nowheel" style={fieldStyle}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );

  const sectionStyle: CSSProperties = {
    background: surface,
    border: `1px solid ${border}`,
    borderRadius: 10,
    padding: 10,
  };

  return (
    <div ref={rootRef} className="relative flex flex-col" style={rootStyle}>
      <Handle type="source" position={Position.Right} className="!border-0" style={{ ...handleStyle, background: PORT_COLOR.text, right: -6 }} />
      <ResizableCorners selected={selected} minWidth={640} minHeight={520} accent={String(accent)} onResize={onResize} onResizeEnd={onResize} />
      <div className="px-3 py-2 shrink-0 flex items-center gap-2" style={{ borderBottom: `1px solid ${border}` }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: accent, color: isPixel ? 'var(--px-surface)' : '#001018' }}>
          <Wand2 size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold leading-tight">RH工具箱制作器</div>
          <div className="text-[10px] truncate" style={{ color: subText }}>维护者专用 · 开发环境可见 · 用户包不打入</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded" style={{ border: `1px solid ${border}`, color: accent }}>DEV</span>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[1.05fr_0.95fr] gap-3 p-3 nodrag nowheel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
          <div style={sectionStyle}>
            <div className="flex items-center gap-1 text-xs font-bold mb-2"><FileJson size={13} />基础信息</div>
            <div className="grid grid-cols-2 gap-2">
              {renderInput('工具标题', d.rhToolboxMakerTitle || '', (value) => updateData({ rhToolboxMakerTitle: value }), '例如 智能抠图')}
              {renderInput('稳定 ID', d.rhToolboxMakerId || '', (value) => updateData({ rhToolboxMakerId: value }), '例如 image-cutout-v1')}
              {renderInput('WebApp ID', d.rhToolboxMakerWebappId || '', (value) => updateData({ rhToolboxMakerWebappId: value }))}
              {renderSelect('分类', d.rhToolboxMakerCategoryId || categories[0]?.id, categories.map((category) => category.id), (value) => updateData({ rhToolboxMakerCategoryId: value }))}
            </div>
            <label className="block text-[10px] space-y-1 mt-2" style={{ color: subText }}>
              <span>说明</span>
              <textarea
                value={d.rhToolboxMakerDescription || ''}
                onChange={(event) => updateData({ rhToolboxMakerDescription: event.target.value })}
                rows={2}
                className="nodrag nowheel"
                style={fieldStyle}
              />
            </label>
            <label className="block text-[10px] space-y-1 mt-2" style={{ color: subText }}>
              <span>能力标签（换行或逗号分隔）</span>
              <textarea
                value={d.rhToolboxMakerCapabilities || 'image.cutout\nimage.edit'}
                onChange={(event) => updateData({ rhToolboxMakerCapabilities: event.target.value })}
                rows={3}
                className="nodrag nowheel"
                style={fieldStyle}
              />
            </label>
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.keys(RH_TOOLBOX_CAPABILITY_LABELS).slice(0, 14).map((capability) => (
                <button
                  key={capability}
                  type="button"
                  className="nodrag rounded px-1.5 py-0.5 text-[9px]"
                  style={{ border: `1px solid ${border}`, color: subText }}
                  onClick={() => updateData({ rhToolboxMakerCapabilities: `${d.rhToolboxMakerCapabilities || ''}\n${capability}`.trim() })}
                >
                  {RH_TOOLBOX_CAPABILITY_LABELS[capability]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={fetchInfo}
              className="nodrag mt-2 w-full rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1"
              style={{ background: accent, color: isPixel ? 'var(--px-surface)' : '#001018' }}
            >
              {fetching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              读取 RH 应用字段
            </button>
          </div>

          <div style={sectionStyle}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">上游输入映射</div>
              <button type="button" className="nodrag text-[10px]" onClick={() => setRows('rhToolboxMakerInputs', [...inputs, { ...DEFAULT_INPUT, rowId: uid('input'), key: `input-${inputs.length + 1}` }])}>+ 输入</button>
            </div>
            <div className="space-y-2">
              {inputs.map((row) => (
                <div key={row.rowId} className="grid grid-cols-[1fr_70px_58px_80px_24px] gap-1 items-end">
                  {renderInput('key', row.key, (value) => patchRow('rhToolboxMakerInputs', inputs, row.rowId, { key: value }))}
                  {renderSelect('kind', row.kind, MEDIA_KINDS, (value) => patchRow('rhToolboxMakerInputs', inputs, row.rowId, { kind: value, uploadAsset: value !== 'text' }))}
                  {renderInput('RH#', row.rhNodeId, (value) => patchRow('rhToolboxMakerInputs', inputs, row.rowId, { rhNodeId: value }))}
                  {renderInput('字段', row.fieldName, (value) => patchRow('rhToolboxMakerInputs', inputs, row.rowId, { fieldName: value }))}
                  <button type="button" className="nodrag mb-1" onClick={() => removeRow('rhToolboxMakerInputs', inputs, row.rowId)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div style={sectionStyle}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">用户可调参数</div>
              <button type="button" className="nodrag text-[10px]" onClick={() => setRows('rhToolboxMakerUserParams', [...params, { rowId: uid('param'), key: `param-${params.length + 1}`, label: '参数', kind: 'text', rhNodeId: '', fieldName: '' }])}>+ 参数</button>
            </div>
            <div className="space-y-2">
              {params.map((row) => (
                <div key={row.rowId} className="grid grid-cols-[1fr_70px_58px_80px_24px] gap-1 items-end">
                  {renderInput('标签', row.label, (value) => patchRow('rhToolboxMakerUserParams', params, row.rowId, { label: value, key: cleanId(value, row.key) }))}
                  {renderSelect('类型', row.kind, PARAM_KINDS, (value) => patchRow('rhToolboxMakerUserParams', params, row.rowId, { kind: value }))}
                  {renderInput('RH#', row.rhNodeId, (value) => patchRow('rhToolboxMakerUserParams', params, row.rowId, { rhNodeId: value }))}
                  {renderInput('字段', row.fieldName, (value) => patchRow('rhToolboxMakerUserParams', params, row.rowId, { fieldName: value }))}
                  <button type="button" className="nodrag mb-1" onClick={() => removeRow('rhToolboxMakerUserParams', params, row.rowId)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div style={sectionStyle}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">固定参数</div>
              <button type="button" className="nodrag text-[10px]" onClick={() => setRows('rhToolboxMakerFixedParams', [...fixedParams, { rowId: uid('fixed'), rhNodeId: '', fieldName: '', value: '', valueType: 'text' }])}>+ 固定</button>
            </div>
            <div className="space-y-2">
              {fixedParams.map((row) => (
                <div key={row.rowId} className="grid grid-cols-[58px_90px_1fr_24px] gap-1 items-end">
                  {renderInput('RH#', row.rhNodeId, (value) => patchRow('rhToolboxMakerFixedParams', fixedParams, row.rowId, { rhNodeId: value }))}
                  {renderInput('字段', row.fieldName, (value) => patchRow('rhToolboxMakerFixedParams', fixedParams, row.rowId, { fieldName: value }))}
                  {renderInput('固定值', row.value, (value) => patchRow('rhToolboxMakerFixedParams', fixedParams, row.rowId, { value }))}
                  <button type="button" className="nodrag mb-1" onClick={() => removeRow('rhToolboxMakerFixedParams', fixedParams, row.rowId)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex flex-col gap-3">
          <div style={sectionStyle} className="shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">输出声明</div>
              <button type="button" className="nodrag text-[10px]" onClick={() => setRows('rhToolboxMakerOutputs', [...outputs, { ...DEFAULT_OUTPUT, rowId: uid('output'), key: `output-${outputs.length + 1}` }])}>+ 输出</button>
            </div>
            <div className="space-y-2">
              {outputs.map((row) => (
                <div key={row.rowId} className="grid grid-cols-[1fr_70px_112px_24px] gap-1 items-end">
                  {renderInput('key', row.key, (value) => patchRow('rhToolboxMakerOutputs', outputs, row.rowId, { key: value }))}
                  {renderSelect('kind', row.kind, MEDIA_KINDS, (value) => patchRow('rhToolboxMakerOutputs', outputs, row.rowId, { kind: value }))}
                  {renderSelect('role', row.role || 'append-output', OUTPUT_ROLES, (value) => patchRow('rhToolboxMakerOutputs', outputs, row.rowId, { role: value }))}
                  <button type="button" className="nodrag mb-1" onClick={() => removeRow('rhToolboxMakerOutputs', outputs, row.rowId)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div style={sectionStyle} className="shrink-0">
            <div className="text-xs font-bold mb-2">运行与显示</div>
            <div className="grid grid-cols-2 gap-2">
              {renderInput('按钮名', d.rhToolboxMakerQuickActionLabel || '', (value) => updateData({ rhToolboxMakerQuickActionLabel: value }))}
              {renderInput('强调色', d.rhToolboxMakerAccent || '#22c55e', (value) => updateData({ rhToolboxMakerAccent: value }))}
              {renderInput('轮询 ms', d.rhToolboxMakerPollIntervalMs || 5000, (value) => updateData({ rhToolboxMakerPollIntervalMs: Number(value) || 5000 }))}
              {renderInput('最大轮询', d.rhToolboxMakerMaxPolls || 480, (value) => updateData({ rhToolboxMakerMaxPolls: Number(value) || 480 }))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]" style={{ color: subText }}>
              {[
                ['节点显示', 'rhToolboxMakerShowInNode'],
                ['图像快捷', 'rhToolboxMakerShowInImageEditor'],
                ['视频快捷', 'rhToolboxMakerShowInVideoEditor'],
                ['文本快捷', 'rhToolboxMakerShowInTextEditor'],
                ['音频快捷', 'rhToolboxMakerShowInAudioEditor'],
                ['启用工具', 'rhToolboxMakerEnabled'],
              ].map(([label, key]) => (
                <label key={key} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={key === 'rhToolboxMakerEnabled' ? d[key] !== false : d[key] === true}
                    onChange={(event) => updateData({ [key]: event.target.checked })}
                    style={{ accentColor: String(accent) }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div style={sectionStyle} className="min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">RH 字段助手</div>
              <span className="text-[10px]" style={{ color: subText }}>{appFields.length} 字段</span>
            </div>
            <div className="min-h-[96px] max-h-40 overflow-y-auto space-y-1">
              {appFields.length === 0 ? (
                <div className="h-24 flex items-center justify-center text-[11px]" style={{ color: subText }}>填写 WebApp ID 后读取字段</div>
              ) : appFields.map((field, index) => {
                const nodeId = fieldNodeId(field);
                const name = fieldName(field);
                return (
                  <div key={`${nodeId}-${name}-${index}`} className="rounded p-1.5" style={{ border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="font-bold">#{nodeId}</span>
                      <span className="flex-1 truncate">{name}</span>
                      <span style={{ color: subText }}>{field?.fieldType || inferMediaKind(field)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {MEDIA_KINDS.map((kind) => (
                        <button key={kind} type="button" className="nodrag rounded px-1 py-0.5 text-[9px]" style={{ border: `1px solid ${border}` }} onClick={() => addFieldAsInput(field, kind)}>输入{kind}</button>
                      ))}
                      <button type="button" className="nodrag rounded px-1 py-0.5 text-[9px]" style={{ border: `1px solid ${border}` }} onClick={() => addFieldAsParam(field)}>用户参数</button>
                      <button type="button" className="nodrag rounded px-1 py-0.5 text-[9px]" style={{ border: `1px solid ${border}` }} onClick={() => addFieldAsFixed(field)}>固定</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={sectionStyle} className="min-h-0 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-2">
              <button type="button" onClick={saveDraft} className="nodrag flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold" style={{ background: accent, color: isPixel ? 'var(--px-surface)' : '#001018' }}><Save size={12} />保存草稿</button>
              <button type="button" onClick={copyJson} className="nodrag flex items-center gap-1 rounded px-2 py-1 text-[11px]" style={{ border: `1px solid ${border}` }}><Clipboard size={12} />复制</button>
              <button type="button" onClick={downloadJson} className="nodrag flex items-center gap-1 rounded px-2 py-1 text-[11px]" style={{ border: `1px solid ${border}` }}><Download size={12} />下载</button>
              <button type="button" className="nodrag ml-auto flex items-center gap-1 rounded px-2 py-1 text-[11px]" style={{ border: `1px solid ${border}` }} onClick={() => setRows('rhToolboxMakerInputs', [...inputs, { ...DEFAULT_INPUT, rowId: uid('input') }])}><Plus size={12} />补输入</button>
            </div>
            {status && <div className="text-[10px] mb-1" style={{ color: accent }}>{status}</div>}
            <textarea
              value={toolJson}
              readOnly
              className="nodrag nowheel flex-1 min-h-0 font-mono"
              style={{ ...fieldStyle, fontSize: 10, resize: 'none' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(RHToolboxMakerNode);

import { useMemo } from 'react';
import { useNodeConnections, useNodesData } from '@xyflow/react';
import { collectMaterialSetBucketsFromData, valueOfMaterialSetItem } from '../../utils/materialSet';
import { normalizeRhNodeId } from '../../utils/rhTextBinding';

/**
 * useUpstreamMaterials - 通用「上游素材聚合」hook
 *
 * 职责: 订阅当前节点 target 侧所有上游连接的 data 变化, 派生出
 *       { texts, images, videos, audios } 四类素材列表, 每项带:
 *         - id           : 唯一 key (供 dnd-kit / React key 使用)
 *         - kind         : 'text' | 'image' | 'video' | 'audio'
 *         - url          : 资源 URL (text 类型时是文本内容)
 *         - sourceNodeId : 来源节点 id (用于跳到来源 / 显示标签)
 *         - origin       : 'upstream' (本 hook 永远是 upstream, local 由调用方追加)
 *         - label        : 显示用的简短标签 (文件名 / 文本前缀)
 *
 * 渲染联动:
 *   - useNodeConnections({ handleType: 'target' }) 订阅连入连接, 任何连/断连触发重渲染
 *   - useNodesData(upstreamIds) 订阅上游节点 data, 任何上游 data 变化触发重渲染
 *   - useMemo deps 仅依赖 upstreamNodes (xyflow 内部已稳定化), 不会循环
 *
 * 兜底:
 *   - 若 imageUrl 字段实为视频/音频扩展名, 按扩展名纠正到对应 kind
 *   - 跨上游同 url 去重 (避免同一图被两个节点都暴露时重复显示)
 */

export type MaterialKind = 'text' | 'image' | 'video' | 'audio';

export interface Material {
  id: string;
  kind: MaterialKind;
  url: string;
  sourceNodeId: string;
  origin: 'upstream' | 'local';
  label?: string;
  rhNodeId?: string;
  sourceNodeSerialId?: number;
}

export interface UpstreamMaterials {
  texts: Material[];
  images: Material[];
  videos: Material[];
  audios: Material[];
}

const VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i;

export function useUpstreamMaterials(nodeId: string): UpstreamMaterials {
  const conns = useNodeConnections({ id: nodeId, handleType: 'target' });
  const upstreamIds = useMemo(
    () => Array.from(new Set(conns.map((c) => c.source))),
    [conns]
  );
  const upstreamNodes = useNodesData(upstreamIds);

  // v1.2.8.3: 收集每个上游 source 上被连接的 sourceHandle 集合, 供 FramePair 等多端口节点按 handle 区分输出
  // - sourceHandle === 'first' / 'last' (FramePair) → 只取对应帧
  // - sourceHandle === null/undefined / 默认 → 兼容全部 (保持原行为)
  const handleMap = useMemo(() => {
    const m = new Map<string, Set<string | null>>();
    for (const c of conns) {
      let set = m.get(c.source);
      if (!set) { set = new Set<string | null>(); m.set(c.source, set); }
      set.add((c as any).sourceHandle ?? null);
    }
    return m;
  }, [conns]);

  return useMemo<UpstreamMaterials>(() => {
    const texts: Material[] = [];
    const images: Material[] = [];
    const videos: Material[] = [];
    const audios: Material[] = [];
    const seen = new Set<string>();

    const list = Array.isArray(upstreamNodes) ? upstreamNodes : [];

    const textMetaFromData = (ud: any) => {
      const rhNodeId = normalizeRhNodeId(ud?.rhNodeId ?? ud?.rhTextNodeId ?? ud?.runningHubNodeId);
      const serial = Number(ud?.nodeSerialId);
      return {
        rhNodeId: rhNodeId || undefined,
        sourceNodeSerialId: Number.isFinite(serial) && serial > 0 ? serial : undefined,
      };
    };

    const pushText = (sourceId: string, v: any, keyOverride?: string, labelOverride?: string, meta?: Pick<Material, 'rhNodeId' | 'sourceNodeSerialId'>) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      const dedupeKey = keyOverride || `text:${s}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      texts.push({
        id: `${sourceId}::${dedupeKey}`,
        kind: 'text',
        url: s,
        sourceNodeId: sourceId,
        origin: 'upstream',
        label: labelOverride || (s.length > 24 ? s.slice(0, 22) + '…' : s),
        rhNodeId: meta?.rhNodeId,
        sourceNodeSerialId: meta?.sourceNodeSerialId,
      });
    };

    const pushUrl = (
      sourceId: string,
      kind: MaterialKind,
      v: any,
      arr: Material[],
      keyOverride?: string,
      labelOverride?: string,
    ) => {
      if (typeof v !== 'string') return;
      const s = v.trim();
      if (!s) return;
      const dedupeKey = keyOverride || `${kind}:${s}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      arr.push({
        id: `${sourceId}::${dedupeKey}`,
        kind,
        url: s,
        sourceNodeId: sourceId,
        origin: 'upstream',
        label: labelOverride || (s.split('/').pop() || s).slice(0, 28),
      });
    };

    for (const n of list) {
      if (!n) continue;
      const sid = n.id;
      const ud: any = n.data || {};
      const handles = handleMap.get(sid) || new Set<string | null>([null]);
      const textMeta = textMetaFromData(ud);

      // 显式素材集: 保留素材集内部顺序，并用序号 key 避免相同 URL 被全局去重误删。
      // 同时跳过下面的旧字段读取，避免 imageUrls/textSegments 双写后重复出现。
      if (n.type === 'material-set' && Array.isArray(ud.materialSetItems)) {
        const buckets = collectMaterialSetBucketsFromData(ud);
        buckets.text.forEach((item, index) => {
          pushText(sid, valueOfMaterialSetItem(item), `material-set:${sid}:text:${index}`, item.name, textMeta);
        });
        buckets.image.forEach((item, index) => {
          pushUrl(sid, 'image', item.url, images, `material-set:${sid}:image:${index}`, item.name);
        });
        buckets.video.forEach((item, index) => {
          pushUrl(sid, 'video', item.url, videos, `material-set:${sid}:video:${index}`, item.name);
        });
        buckets.audio.forEach((item, index) => {
          pushUrl(sid, 'audio', item.url, audios, `material-set:${sid}:audio:${index}`, item.name);
        });
        continue;
      }

      // 文本: textSegments/texts 数组优先, 避免文本分割节点再把 joined prompt 当成第 N+1 项
      const textArrayFields = ['textSegments', 'segments', 'texts'];
      const textArrayField = textArrayFields.find((f) => Array.isArray(ud[f]) && ud[f].length > 0);
      if (textArrayField) {
        ud[textArrayField].forEach((item: any, index: number) => {
          pushText(sid, item, `text-array:${sid}:${textArrayField}:${index}`, undefined, textMeta);
        });
      } else {
        // 文本: outputText (用户编辑覆盖) > reply > prompt > text
        pushText(sid, ud.outputText, `text-field:${sid}:outputText`, undefined, textMeta);
        pushText(sid, ud.reply, `text-field:${sid}:reply`, undefined, textMeta);
        pushText(sid, ud.prompt, `text-field:${sid}:prompt`, undefined, textMeta);
        pushText(sid, ud.text, `text-field:${sid}:text`, undefined, textMeta);
      }

      // === v1.2.8.3: FramePair 双端口语义 ===
      // 节点同时具备 firstFrameUrl + lastFrameUrl 字段时按 sourceHandle 过滤,
      //   - 'first' 端口 → 只输出首帧
      //   - 'last'  端口 → 只输出尾帧
      //   - null/默认  → 同时输出两帧 (autoOutput / 手动接默认 handle 的兼容)
      // 跳过通用 imageUrl/imageUrls 分支, 避免双图被通用聚合再次合并。
      const isFramePair = (typeof ud.firstFrameUrl === 'string' || typeof ud.lastFrameUrl === 'string')
        && (ud.firstFrameUrl !== undefined || ud.lastFrameUrl !== undefined)
        && Object.prototype.hasOwnProperty.call(ud, 'firstFrameUrl')
        && Object.prototype.hasOwnProperty.call(ud, 'lastFrameUrl');
      if (isFramePair) {
        const wantFirst = handles.has('first') || (handles.has(null) && !handles.has('last'));
        const wantLast = handles.has('last') || (handles.has(null) && !handles.has('first'));
        if (wantFirst) pushUrl(sid, 'image', ud.firstFrameUrl, images);
        if (wantLast) pushUrl(sid, 'image', ud.lastFrameUrl, images);
        continue;
      }

      // 图像: 单 + 多
      pushUrl(sid, 'image', ud.imageUrl, images);
      const arrFields = ['imageUrls', 'urls', 'generatedImages'];
      for (const f of arrFields) {
        const v = ud[f];
        if (Array.isArray(v)) {
          for (const u of v) pushUrl(sid, 'image', u, images);
        }
      }

      // 视频: 单 + 多 (v1.2.8.2: videoUrls 数组 — LoopNode 聚合多视频产物)
      pushUrl(sid, 'video', ud.videoUrl, videos);
      if (Array.isArray(ud.videoUrls)) {
        for (const u of ud.videoUrls) pushUrl(sid, 'video', u, videos);
      }

      // === v1.2.9.14: Suno 双端口语义 (与 FramePair 同模式) ===
      // AudioNode (Suno) 同时具备 audioUrl(主轨, sourceHandle='audio-0') + audioUrl_1(副轨, sourceHandle='audio-1') 字段时按 handle 过滤,
      //   - 'audio-0' 端口 → 只输出主轨
      //   - 'audio-1' 端口 → 只输出副轨
      //   - null/默认  → 同时输出两轨 (autoOutput 旧版 / 手动接默认 handle 的兼容)
      const isSuno =
        Object.prototype.hasOwnProperty.call(ud, 'audioUrl') &&
        Object.prototype.hasOwnProperty.call(ud, 'audioUrl_1');
      if (isSuno) {
        const wantA0 = handles.has('audio-0') || (handles.has(null) && !handles.has('audio-1'));
        const wantA1 = handles.has('audio-1') || (handles.has(null) && !handles.has('audio-0'));
        if (wantA0) pushUrl(sid, 'audio', ud.audioUrl, audios);
        if (wantA1) pushUrl(sid, 'audio', ud.audioUrl_1, audios);
        if (Array.isArray(ud.audioUrls)) {
          for (const u of ud.audioUrls) pushUrl(sid, 'audio', u, audios);
        }
        continue;
      }

      // 音频 (audioUrl 主轨, audioUrl_1 副轨——AudioNode 双输出口, audioUrls 数组 — LoopNode 聚合)
      pushUrl(sid, 'audio', ud.audioUrl, audios);
      pushUrl(sid, 'audio', ud.audioUrl_1, audios);
      if (Array.isArray(ud.audioUrls)) {
        for (const u of ud.audioUrls) pushUrl(sid, 'audio', u, audios);
      }
    }

    // 兜底: 一些节点把视频/音频塞在 imageUrl, 通过扩展名识别再纠正
    const fixedImages: Material[] = [];
    for (const m of images) {
      if (VIDEO_RE.test(m.url)) {
        videos.push({ ...m, kind: 'video' });
        continue;
      }
      if (AUDIO_RE.test(m.url)) {
        audios.push({ ...m, kind: 'audio' });
        continue;
      }
      fixedImages.push(m);
    }

    return { texts, images: fixedImages, videos, audios };
  }, [upstreamNodes, handleMap]);
}

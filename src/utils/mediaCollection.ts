export type MediaKind = 'image' | 'video' | 'audio';

export interface MediaItem {
  kind: MediaKind;
  url: string;
  name?: string;
  size?: number;
  mime?: string;
}

export const MEDIA_KIND_META: Record<MediaKind, {
  label: string;
  singleField: 'imageUrl' | 'videoUrl' | 'audioUrl';
  arrayField: 'imageUrls' | 'videoUrls' | 'audioUrls';
  directSingleField: 'directImageUrl' | 'directVideoUrl' | 'directAudioUrl';
  directArrayField: 'directImageUrls' | 'directVideoUrls' | 'directAudioUrls';
}> = {
  image: {
    label: '图像',
    singleField: 'imageUrl',
    arrayField: 'imageUrls',
    directSingleField: 'directImageUrl',
    directArrayField: 'directImageUrls',
  },
  video: {
    label: '视频',
    singleField: 'videoUrl',
    arrayField: 'videoUrls',
    directSingleField: 'directVideoUrl',
    directArrayField: 'directVideoUrls',
  },
  audio: {
    label: '音频',
    singleField: 'audioUrl',
    arrayField: 'audioUrls',
    directSingleField: 'directAudioUrl',
    directArrayField: 'directAudioUrls',
  },
};

export function fileNameFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    return decodeURIComponent(clean.split('/').pop() || url);
  } catch {
    return url.split('/').pop() || url;
  }
}

export function formatMediaSize(size?: number): string {
  if (!Number.isFinite(size || 0) || !size) return '';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function pushItem(
  out: MediaItem[],
  seen: Set<string>,
  kind: MediaKind,
  url: any,
  name?: any,
  size?: any,
  mime?: any,
) {
  if (typeof url !== 'string') return;
  const s = url.trim();
  if (!s || seen.has(s)) return;
  seen.add(s);
  out.push({
    kind,
    url: s,
    name: typeof name === 'string' && name ? name : fileNameFromUrl(s),
    size: typeof size === 'number' ? size : undefined,
    mime: typeof mime === 'string' ? mime : undefined,
  });
}

export function getMediaItemsFromData(data: any, kind: MediaKind): MediaItem[] {
  const out: MediaItem[] = [];
  const seen = new Set<string>();
  if (!data) return out;
  const meta = MEDIA_KIND_META[kind];
  const names = Array.isArray(data.fileNames) ? data.fileNames : [];
  const sizes = Array.isArray(data.fileSizes) ? data.fileSizes : [];
  const mimes = Array.isArray(data.mimes) ? data.mimes : [];

  const arr = data[meta.arrayField];
  if (Array.isArray(arr)) {
    arr.forEach((url: any, i: number) => pushItem(out, seen, kind, url, names[i], sizes[i], mimes[i]));
  }

  const directArr = data[meta.directArrayField];
  if (Array.isArray(directArr)) {
    directArr.forEach((url: any, i: number) => pushItem(out, seen, kind, url, names[i], sizes[i], mimes[i]));
  }

  pushItem(out, seen, kind, data[meta.singleField], data.fileName, data.fileSize, data.mime);
  pushItem(out, seen, kind, data[meta.directSingleField], data.fileName, data.fileSize, data.mime);
  return out;
}

export function createUploadDataFromItems(kind: MediaKind, items: MediaItem[]): Record<string, any> {
  const meta = MEDIA_KIND_META[kind];
  const clean = items.filter((item) => item.kind === kind && item.url);
  const first = clean[0];
  if (!first) return { uploadType: kind };
  return {
    uploadType: kind,
    [meta.singleField]: first.url,
    [meta.arrayField]: clean.map((item) => item.url),
    fileName: first.name || fileNameFromUrl(first.url),
    fileNames: clean.map((item) => item.name || fileNameFromUrl(item.url)),
    fileSize: first.size || 0,
    fileSizes: clean.map((item) => item.size || 0),
    mime: first.mime || '',
    mimes: clean.map((item) => item.mime || ''),
  };
}

export function createUploadDataFromItem(item: MediaItem): Record<string, any> {
  return createUploadDataFromItems(item.kind, [item]);
}

export function createEmptyUploadMediaData(): Record<string, any> {
  const data: Record<string, any> = {
    uploadType: null,
    fileName: '',
    fileNames: [],
    fileSize: 0,
    fileSizes: [],
    mime: '',
    mimes: [],
  };
  for (const meta of Object.values(MEDIA_KIND_META)) {
    data[meta.singleField] = undefined;
    data[meta.arrayField] = [];
    data[meta.directSingleField] = undefined;
    data[meta.directArrayField] = [];
  }
  return data;
}

export function createUploadReplacementData(kind: MediaKind, items: MediaItem[]): Record<string, any> {
  return {
    ...createEmptyUploadMediaData(),
    ...createUploadDataFromItems(kind, items),
  };
}

export function createOutputDataFromItems(kind: MediaKind, items: MediaItem[]): Record<string, any> {
  const meta = MEDIA_KIND_META[kind];
  const clean = items.filter((item) => item.kind === kind && item.url);
  const first = clean[0];
  if (!first) return {};
  const urls = clean.map((item) => item.url);
  return {
    [meta.singleField]: first.url,
    [meta.arrayField]: urls,
    [meta.directSingleField]: first.url,
    [meta.directArrayField]: urls,
    fileName: first.name || fileNameFromUrl(first.url),
    fileNames: clean.map((item) => item.name || fileNameFromUrl(item.url)),
    fileSize: first.size || 0,
    fileSizes: clean.map((item) => item.size || 0),
    mime: first.mime || '',
    mimes: clean.map((item) => item.mime || ''),
  };
}

export function createOutputDataFromItem(item: MediaItem): Record<string, any> {
  return createOutputDataFromItems(item.kind, [item]);
}

export function sameMediaUrls(a: MediaItem[], b: MediaItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item.kind === b[index]?.kind && item.url === b[index]?.url);
}

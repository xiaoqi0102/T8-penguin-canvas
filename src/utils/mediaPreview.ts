const LOCAL_IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?)(?:[?#].*)?$/i;
const LOCAL_FILE_PREFIX_RE = /^\/(?:files\/(?:input|output)|input|output)\//;

export function canUseLocalImageThumbnail(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const clean = url.trim();
  if (!clean || !LOCAL_FILE_PREFIX_RE.test(clean)) return false;
  return LOCAL_IMAGE_RE.test(clean.split('?')[0].split('#')[0]);
}

export function previewImageUrl(url: string, size = 360): string {
  if (!canUseLocalImageThumbnail(url)) return url;
  const safeSize = Math.max(96, Math.min(1024, Math.round(size || 360)));
  return `/api/files/thumbnail?size=${safeSize}&url=${encodeURIComponent(url)}`;
}

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const RESOURCE_DB_FILE = 'resource_library.json';
const REMOTE_FETCH_TIMEOUT_MS = 30_000;
const REMOTE_MAX_BYTES = 1024 * 1024 * 1024;

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
};

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/flac': '.flac',
  'audio/aac': '.aac',
};

function assertInside(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return '';
  return resolved;
}

function decodeTail(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/^[/\\]+/, ''));
  } catch {
    return String(value || '').replace(/^[/\\]+/, '');
  }
}

function randomSuffix() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mimeFromPath(filePath, fallback = 'application/octet-stream') {
  return MIME_BY_EXT[path.extname(String(filePath || '')).toLowerCase()] || fallback;
}

function extFromMime(mime, fallback = '.bin') {
  return EXT_BY_MIME[String(mime || '').toLowerCase()] || fallback;
}

function kindFromExt(ext) {
  const clean = String(ext || '').toLowerCase().replace(/^\./, '');
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(clean)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(clean)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(clean)) return 'audio';
  return 'file';
}

function filePathFromFileUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'file:') return '';
    let p = decodeURIComponent(parsed.pathname || '');
    if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
    return p;
  } catch {
    return '';
  }
}

function toLocalPathnameIfSameApp(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
      return decodeURIComponent(parsed.pathname || '');
    }
  } catch {
    // Relative URL, keep normal path.
  }
  return url;
}

function getResourceLibraryRoot() {
  try {
    if (!fs.existsSync(config.SETTINGS_FILE)) return config.DEFAULT_RESOURCE_LIBRARY_DIR || '';
    const settings = JSON.parse(fs.readFileSync(config.SETTINGS_FILE, 'utf-8'));
    return String(settings.resourceLibraryPath || config.DEFAULT_RESOURCE_LIBRARY_DIR || '').trim();
  } catch {
    return config.DEFAULT_RESOURCE_LIBRARY_DIR || '';
  }
}

function readResourceDb(root) {
  try {
    const file = path.join(root, RESOURCE_DB_FILE);
    if (!fs.existsSync(file)) return null;
    const db = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(db?.items) ? db : null;
  } catch {
    return null;
  }
}

function resolveResourceLocalPath(cleanPath) {
  const root = getResourceLibraryRoot();
  if (!root) return '';
  const db = readResourceDb(root);
  const items = Array.isArray(db?.items) ? db.items : [];

  const fileMatch = /^\/api\/resources\/file\/([^/?#]+)/.exec(cleanPath);
  if (fileMatch) {
    const id = decodeTail(fileMatch[1]);
    const item = items.find((x) => x?.id === id);
    if (item?.fileRel) return assertInside(root, path.join(root, item.fileRel));
  }

  const setMatch = /^\/api\/resources\/set-file\/([^/?#]+)\/(\d+)/.exec(cleanPath);
  if (setMatch) {
    const id = decodeTail(setMatch[1]);
    const index = Number(setMatch[2]);
    const item = items.find((x) => x?.id === id);
    const child = item?.kind === 'set' && Array.isArray(item.materialSetItems)
      ? item.materialSetItems[index]
      : null;
    if (child?.fileRel) return assertInside(root, path.join(root, child.fileRel));
  }

  return '';
}

function resolveT8LocalPath(value) {
  const clean = toLocalPathnameIfSameApp(value).split(/[?#]/)[0];
  const rules = [
    ['/files/output/', config.OUTPUT_DIR],
    ['/output/', config.OUTPUT_DIR],
    ['/files/input/', config.INPUT_DIR],
    ['/input/', config.INPUT_DIR],
  ];
  for (const [prefix, root] of rules) {
    if (clean.startsWith(prefix)) {
      return assertInside(root, path.join(root, decodeTail(clean.slice(prefix.length))));
    }
  }
  if (clean.startsWith('/api/resources/')) return resolveResourceLocalPath(clean);
  return '';
}

function resolveDirectLocalPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('file://')) return filePathFromFileUrl(text);
  if (path.isAbsolute(text)) return text;
  return '';
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

function isPrivateRemoteHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const m = /^172\.(\d+)\./.exec(host);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (host.startsWith('fc') || host.startsWith('fd')) return true;
  return false;
}

async function writeDataUrlToInput(value) {
  const parsed = parseDataUrl(value);
  if (!parsed) throw new Error('dataURL 格式无效');
  const ext = extFromMime(parsed.mime, '.bin');
  const filename = `cloud_upload_input_${randomSuffix()}${ext}`;
  const filePath = path.join(config.INPUT_DIR, filename);
  fs.mkdirSync(config.INPUT_DIR, { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(parsed.base64, 'base64'));
  return filePath;
}

async function downloadRemoteToInput(url) {
  const parsed = new URL(url);
  if (isPrivateRemoteHost(parsed.hostname)) {
    throw new Error('安全限制：云端上传不拉取本机或内网远程 URL');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`远端素材下载失败: HTTP ${res.status}`);
    const length = Number(res.headers.get('content-length') || 0);
    if (length > REMOTE_MAX_BYTES) throw new Error('远端素材超过 1GB 限制');
    const mime = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const urlExt = path.extname(parsed.pathname || '');
    const ext = urlExt || extFromMime(mime, '.bin');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > REMOTE_MAX_BYTES) throw new Error('远端素材超过 1GB 限制');
    const filename = `cloud_upload_remote_${randomSuffix()}${ext}`;
    const filePath = path.join(config.INPUT_DIR, filename);
    fs.mkdirSync(config.INPUT_DIR, { recursive: true });
    fs.writeFileSync(filePath, buf);
    return filePath;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveUploadSource(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('缺少上传素材 URL');

  if (/^data:[^;,]+;base64,/i.test(text)) return writeDataUrlToInput(text);
  if (/^https?:\/\//i.test(text)) return downloadRemoteToInput(text);

  const t8Path = resolveT8LocalPath(text);
  const localPath = t8Path || resolveDirectLocalPath(text);
  if (localPath && fs.existsSync(localPath)) return localPath;

  throw new Error(`无法解析上传素材：${text.slice(0, 160)}`);
}

function sanitizeFileName(value, fallback = 'asset') {
  const raw = String(value || '').trim();
  const base = raw ? path.basename(raw) : fallback;
  const clean = base.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 180);
  return clean || fallback;
}

function inferFileName(filePath, requestedName) {
  const ext = path.extname(filePath) || '.bin';
  const requested = sanitizeFileName(requestedName || '');
  if (requested && path.extname(requested)) return requested;
  const sourceName = sanitizeFileName(path.basename(filePath), `asset${ext}`);
  return sourceName || `asset_${Date.now()}${ext}`;
}

function encodeObjectKeyPath(value) {
  return String(value || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function buildObjectKey(target, filePath, payload = {}) {
  const kind = String(payload.kind || kindFromExt(path.extname(filePath)) || 'file').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefixTemplate = String(target.prefix || 't8-canvas/{kind}/{yyyy-mm}').trim();
  const prefix = prefixTemplate
    .replace(/\{kind\}/g, kind)
    .replace(/\{yyyy-mm\}/g, `${yyyy}-${mm}`)
    .replace(/\{date\}/g, `${yyyy}-${mm}-${dd}`)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
  const fileName = inferFileName(filePath, payload.filename || payload.title);
  const uniqueName = fileName.includes('.')
    ? fileName.replace(/(\.[^.]+)$/, `_${Date.now()}$1`)
    : `${fileName}_${Date.now()}`;
  return [prefix, uniqueName]
    .filter(Boolean)
    .join('/')
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/\/+/g, '/')
    .slice(0, 900);
}

function sha1Hex(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function hmacSha1Hex(key, value) {
  return crypto.createHmac('sha1', key).update(value).digest('hex');
}

function hmacSha1Base64(key, value) {
  return crypto.createHmac('sha1', key).update(value).digest('base64');
}

function contentLength(filePath) {
  return fs.statSync(filePath).size;
}

async function putStream(url, filePath, headers = {}) {
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Length': String(contentLength(filePath)),
    },
    body: fs.createReadStream(filePath),
    duplex: 'half',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`上传失败 HTTP ${res.status}${text ? `：${text.slice(0, 300)}` : ''}`);
  }
}

function publicUrlForHost(target, host, objectKey) {
  if (target.publicBaseUrl) return `${String(target.publicBaseUrl).replace(/\/+$/, '')}/${encodeObjectKeyPath(objectKey)}`;
  return `https://${host}/${encodeObjectKeyPath(objectKey)}`;
}

function validateTargetConfig(target) {
  if (!target || !target.provider) throw new Error('云端目标不存在');
  if (target.provider === 'tencent-cos') {
    const cfg = target.tencentCos || {};
    if (!cfg.bucket) throw new Error('腾讯云 COS 缺少 Bucket');
    if (!cfg.region) throw new Error('腾讯云 COS 缺少 Region');
    if (!cfg.secretId || !cfg.secretKey) throw new Error('腾讯云 COS 缺少 SecretId / SecretKey');
    return { ok: true, supported: true, message: '腾讯云 COS 配置已填写，可用于上传' };
  }
  if (target.provider === 'aliyun-oss') {
    const cfg = target.aliyunOss || {};
    if (!cfg.bucket) throw new Error('阿里云 OSS 缺少 Bucket');
    if (!cfg.endpoint) throw new Error('阿里云 OSS 缺少 Endpoint');
    if (!cfg.accessKeyId || !cfg.accessKeySecret) throw new Error('阿里云 OSS 缺少 AccessKeyId / AccessKeySecret');
    return { ok: true, supported: true, message: '阿里云 OSS 配置已填写，可用于上传' };
  }
  if (target.provider === 'baidu-netdisk') {
    throw new Error('百度网盘真实上传等待 OAuth/PCS 授权方案接入，当前仅保留配置位');
  }
  if (target.provider === 'quark-netdisk') {
    throw new Error('夸克网盘真实上传等待稳定 CLI/授权方案接入，当前仅保留配置位');
  }
  throw new Error(`暂不支持的云端目标：${target.provider}`);
}

async function uploadToTencentCos(target, filePath, payload) {
  const cfg = target.tencentCos || {};
  const objectKey = buildObjectKey(target, filePath, payload);
  const host = `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + 900}`;
  const uriPath = `/${encodeObjectKeyPath(objectKey)}`;
  const httpString = `put\n${uriPath}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signKey = hmacSha1Hex(cfg.secretKey, keyTime);
  const signature = hmacSha1Hex(signKey, stringToSign);
  const authorization = [
    'q-sign-algorithm=sha1',
    `q-ak=${encodeURIComponent(cfg.secretId)}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
  const url = `https://${host}${uriPath}`;
  await putStream(url, filePath, { Authorization: authorization });
  return {
    provider: target.provider,
    targetId: target.id,
    label: target.label,
    objectKey,
    path: `cos://${cfg.bucket}/${objectKey}`,
    url: publicUrlForHost(target, host, objectKey),
  };
}

async function uploadToAliyunOss(target, filePath, payload) {
  const cfg = target.aliyunOss || {};
  const objectKey = buildObjectKey(target, filePath, payload);
  const endpoint = String(cfg.endpoint || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const host = `${cfg.bucket}.${endpoint}`;
  const expires = Math.floor(Date.now() / 1000) + 900;
  const canonicalResource = `/${cfg.bucket}/${objectKey}`;
  const stringToSign = `PUT\n\n\n${expires}\n${canonicalResource}`;
  const signature = hmacSha1Base64(cfg.accessKeySecret, stringToSign);
  const url = `https://${host}/${encodeObjectKeyPath(objectKey)}?OSSAccessKeyId=${encodeURIComponent(cfg.accessKeyId)}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`;
  await putStream(url, filePath);
  return {
    provider: target.provider,
    targetId: target.id,
    label: target.label,
    objectKey,
    path: `oss://${cfg.bucket}/${objectKey}`,
    url: publicUrlForHost(target, host, objectKey),
  };
}

async function uploadCloudAsset(target, payload = {}) {
  validateTargetConfig(target);
  const filePath = await resolveUploadSource(payload.url || payload.sourceUrl);
  const stat = fs.statSync(filePath);
  const kind = payload.kind || kindFromExt(path.extname(filePath));
  const base = {
    filename: path.basename(filePath),
    size: stat.size,
    mime: mimeFromPath(filePath),
    kind,
  };
  let uploaded;
  if (target.provider === 'tencent-cos') {
    uploaded = await uploadToTencentCos(target, filePath, { ...payload, kind });
  } else if (target.provider === 'aliyun-oss') {
    uploaded = await uploadToAliyunOss(target, filePath, { ...payload, kind });
  } else {
    validateTargetConfig(target);
  }
  return { ...base, ...uploaded };
}

module.exports = {
  buildObjectKey,
  kindFromExt,
  mimeFromPath,
  resolveUploadSource,
  uploadCloudAsset,
  validateTargetConfig,
};

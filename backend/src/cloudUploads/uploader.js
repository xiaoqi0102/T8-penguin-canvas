'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const RESOURCE_DB_FILE = 'resource_library.json';
const REMOTE_FETCH_TIMEOUT_MS = 30_000;
const CLOUD_CONNECTIVITY_TIMEOUT_MS = 12_000;
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
    .map((part) => strictEncode(part))
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

function strictEncode(value) {
  return encodeURIComponent(String(value || ''))
    .replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(params = {}) {
  return Object.entries(params)
    .filter(([key, value]) => key && value !== undefined && value !== null)
    .map(([key, value]) => [String(key).toLowerCase(), String(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${strictEncode(key)}=${strictEncode(value)}`)
    .join('&');
}

function queryKeyList(params = {}) {
  return Object.keys(params)
    .filter((key) => key)
    .map((key) => String(key).toLowerCase())
    .sort()
    .map((key) => strictEncode(key))
    .join(';');
}

function xmlUnescape(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractXmlTag(value, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(String(value || ''));
  return match ? xmlUnescape(match[1]).trim() : '';
}

function headersToObject(headers) {
  const out = {};
  try {
    for (const [key, value] of headers.entries()) out[key.toLowerCase()] = value;
  } catch {
    // Headers may be missing in mocked tests.
  }
  return out;
}

function responseRequestId(headers = {}, provider = '') {
  return headers['x-cos-request-id']
    || headers['x-oss-request-id']
    || headers['x-request-id']
    || (provider === 'tencent-cos' ? headers['x-cos-trace-id'] : '')
    || '';
}

function tencentCosHost(cfg) {
  return `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
}

function aliyunOssHost(cfg) {
  const endpoint = normalizeAliyunOssEndpoint(cfg.endpoint);
  return `${cfg.bucket}.${endpoint}`;
}

function normalizeAliyunOssEndpoint(value) {
  const endpoint = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (/^oss-[a-z0-9-]+$/i.test(endpoint)) return `${endpoint}.aliyuncs.com`;
  if (/^(cn|ap|us|eu|me)-[a-z0-9-]+$/i.test(endpoint)) return `oss-${endpoint}.aliyuncs.com`;
  return endpoint;
}

function buildUrlQuery(params = {}) {
  const query = canonicalQuery(params);
  return query ? `?${query}` : '';
}

function signTencentCosRequest({ method, host, uriPath = '/', query = {}, secretId, secretKey, expiresSeconds = 900 }) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + expiresSeconds}`;
  const normalizedMethod = String(method || 'GET').toLowerCase();
  const normalizedPath = uriPath.startsWith('/') ? uriPath : `/${uriPath}`;
  const urlParamString = canonicalQuery(query);
  const urlParamList = queryKeyList(query);
  const headerString = `host=${String(host || '').toLowerCase()}\n`;
  const httpString = `${normalizedMethod}\n${normalizedPath}\n${urlParamString}\n${headerString}`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signKey = hmacSha1Hex(secretKey, keyTime);
  const signature = hmacSha1Hex(signKey, stringToSign);
  return [
    'q-sign-algorithm=sha1',
    `q-ak=${strictEncode(secretId)}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    `q-url-param-list=${urlParamList}`,
    `q-signature=${signature}`,
  ].join('&');
}

function aliyunOssSubresourceString(query = {}) {
  const subresources = Object.keys(query)
    .filter((key) => key)
    .map((key) => String(key).toLowerCase())
    .sort()
    .map((key) => {
      const value = query[key];
      return value === '' || value === undefined || value === null ? key : `${key}=${value}`;
    })
    .join('&');
  return subresources;
}

function signAliyunOssAuthorization({
  method,
  bucket,
  objectKey = '',
  query = {},
  accessKeyId,
  accessKeySecret,
  date,
  contentMd5 = '',
  contentType = '',
}) {
  const subresources = aliyunOssSubresourceString(query);
  const canonicalResource = `/${bucket}/${objectKey}${subresources ? `?${subresources}` : ''}`;
  const stringToSign = `${String(method || 'GET').toUpperCase()}\n${contentMd5}\n${contentType}\n${date}\n${canonicalResource}`;
  const signature = hmacSha1Base64(accessKeySecret, stringToSign);
  return `OSS ${accessKeyId}:${signature}`;
}

async function responseToUploadError(res, fallbackMessage, provider = '') {
  const text = await res.text().catch(() => '');
  const headers = headersToObject(res.headers);
  const code = extractXmlTag(text, 'Code') || extractXmlTag(text, 'ErrorCode') || '';
  const remoteMessage = extractXmlTag(text, 'Message') || extractXmlTag(text, 'ErrorMessage') || '';
  const requestId = extractXmlTag(text, 'RequestId') || responseRequestId(headers, provider);
  const parts = [
    fallbackMessage || `上传失败 HTTP ${res.status}`,
    code ? `Code=${code}` : '',
    remoteMessage ? `Message=${remoteMessage}` : '',
    requestId ? `RequestId=${requestId}` : '',
    text && !code ? text.slice(0, 300) : '',
  ].filter(Boolean);
  const error = new Error(parts.join('；'));
  error.statusCode = res.status;
  error.responseText = text;
  error.responseHeaders = headers;
  error.providerCode = code;
  error.providerMessage = remoteMessage;
  error.requestId = requestId;
  return error;
}

function contentLength(filePath) {
  return fs.statSync(filePath).size;
}

async function putStream(url, filePath, headers = {}) {
  const { __provider: provider = '', ...requestHeaders } = headers;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...requestHeaders,
      'Content-Length': String(contentLength(filePath)),
    },
    body: fs.createReadStream(filePath),
    duplex: 'half',
  });
  if (!res.ok) {
    throw await responseToUploadError(res, `上传失败 HTTP ${res.status}`, provider);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = CLOUD_CONNECTIVITY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function getUploadErrorText(error) {
  return [
    error?.message,
    error?.responseText,
    error?.code,
    error?.name,
    error?.cause?.message,
  ]
    .filter(Boolean)
    .map((item) => String(item))
    .join('\n');
}

function classifyCloudUploadError(target, error) {
  const provider = String(target?.provider || '').trim();
  const statusCode = Number(error?.statusCode || error?.status || 0) || undefined;
  const text = getUploadErrorText(error);
  const lower = text.toLowerCase();
  const providerCode = String(error?.providerCode || extractXmlTag(error?.responseText || '', 'Code') || '').trim();
  const providerMessage = String(error?.providerMessage || extractXmlTag(error?.responseText || '', 'Message') || '').trim();
  const base = {
    provider,
    statusCode,
    providerCode,
    providerMessage,
    requestId: String(error?.requestId || ''),
    rawMessage: String(error?.message || error || ''),
  };

  const isNetwork =
    /enotfound|eai_again|econnreset|etimedout|network|fetch failed|failed to fetch|socket|timeout|aborted/.test(lower);
  if (isNetwork) {
    return {
      ...base,
      code: 'network',
      message: '云端上传连接失败：请检查网络、代理、Endpoint/Region 是否正确，稍后重试。',
      hint: '如果浏览器可访问但节点失败，优先检查 API 设置里的 Endpoint/Region、代理环境和本机防火墙。',
    };
  }

  if (/无法解析上传素材|缺少上传素材|远端素材下载失败|安全限制|dataurl 格式无效/.test(text)) {
    return {
      ...base,
      code: 'source',
      message: String(error?.message || '上传素材无法读取，请确认素材仍存在且不是内网地址。'),
      hint: '建议先把素材保存到本地输出目录或资源库，再执行云端上传。',
    };
  }

  const codeLower = providerCode.toLowerCase();
  const signatureMismatch = codeLower === 'signaturedoesnotmatch' || /signaturedoesnotmatch|signature.*not match|q-signature|签名/.test(lower);
  const accessKeyInvalid = ['invalidaccesskeyid', 'invalidsecretid'].includes(codeLower)
    || /invalidaccesskeyid|invalidsecretid|accesskeyid|secretid.*not exist|access key.*not exist/.test(lower);
  const accessDenied = /accessdenied|forbidden|permission|not authorized|unauthorized|拒绝|无权限/.test(lower);
  const noSuchBucket = ['nosuchbucket', 'bucketnotexist'].includes(codeLower)
    || /nosuchbucket|bucket.*not exist|bucketnotexist|no such bucket|bucket不存在/.test(lower);
  const timeSkew = codeLower === 'requesttimeskewed' || /requesttimeskewed|expire|expired|time skew|clock/.test(lower);
  const wrongRegion = ['permanentredirect', 'incorrectendpoint'].includes(codeLower)
    || /permanentredirect|incorrectendpoint|wrong region|region.*not/.test(lower);

  if (wrongRegion) {
    const name = provider === 'aliyun-oss' ? '阿里云 OSS' : provider === 'tencent-cos' ? '腾讯云 COS' : '云端目标';
    return {
      ...base,
      code: 'region',
      message: `${name} 区域/Endpoint 不匹配：请确认 Bucket 所在地域。`,
      hint: provider === 'tencent-cos'
        ? '腾讯云 COS 的 Region 形如 ap-nanjing / ap-guangzhou，必须和 Bucket 详情页一致。'
        : '阿里云 OSS 的 Endpoint 必须和 Bucket 地域一致，例如 oss-cn-hangzhou.aliyuncs.com。',
    };
  }

  if (signatureMismatch || accessKeyInvalid || timeSkew) {
    const name = provider === 'aliyun-oss' ? '阿里云 OSS' : provider === 'tencent-cos' ? '腾讯云 COS' : '云端目标';
    return {
      ...base,
      code: signatureMismatch ? 'signature' : timeSkew ? 'clock' : 'credential',
      message: `${name} 上传签名校验失败：请确认密钥、Bucket、区域/Endpoint 与本机时间。`,
      hint: '重新复制 AccessKey/Secret，确认没有多余空格；Windows 时间同步后再试。COS 还要确认 Region，OSS 还要确认 Endpoint。',
    };
  }

  if (noSuchBucket || statusCode === 404) {
    const name = provider === 'aliyun-oss' ? '阿里云 OSS' : provider === 'tencent-cos' ? '腾讯云 COS' : '云端目标';
    return {
      ...base,
      code: 'bucket',
      message: `${name} Bucket 无法访问：请确认 Bucket 名称和区域/Endpoint 是同一个存储桶。`,
      hint: '常见原因是把 Bucket 写错、COS Region 写错，或 OSS Endpoint 与 Bucket 所在地域不一致。',
    };
  }

  if (accessDenied || statusCode === 401 || statusCode === 403) {
    const name = provider === 'aliyun-oss' ? '阿里云 OSS' : provider === 'tencent-cos' ? '腾讯云 COS' : '云端目标';
    return {
      ...base,
      code: 'permission',
      message: `${name} 权限不足：当前密钥没有上传对象权限。`,
      hint: '请给密钥授予 PutObject/上传对象权限；若需要公开直链，还要配置 Bucket 读权限或 publicBaseUrl。',
    };
  }

  return {
    ...base,
    code: 'unknown',
    message: String(error?.message || '云端上传失败，请检查目标配置后重试。'),
    hint: '请先点“检查配置”，再确认 Bucket、区域/Endpoint、密钥和路径前缀。',
  };
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

async function testTencentCosTarget(target) {
  const cfg = target.tencentCos || {};
  validateTargetConfig(target);
  const host = tencentCosHost(cfg);
  const query = { location: '' };
  const uriPath = '/';
  const authorization = signTencentCosRequest({
    method: 'GET',
    host,
    uriPath,
    query,
    secretId: cfg.secretId,
    secretKey: cfg.secretKey,
    expiresSeconds: 120,
  });
  const url = `https://${host}${uriPath}${buildUrlQuery(query)}`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Authorization: authorization },
  });
  if (!res.ok) {
    throw await responseToUploadError(res, `腾讯云 COS 配置检查失败 HTTP ${res.status}`, 'tencent-cos');
  }
  return {
    ok: true,
    supported: true,
    message: '腾讯云 COS 连接可用：Bucket、Region、SecretId / SecretKey 已通过签名检查',
    provider: target.provider,
  };
}

async function testAliyunOssTarget(target) {
  const cfg = target.aliyunOss || {};
  validateTargetConfig(target);
  const host = aliyunOssHost(cfg);
  const date = new Date().toUTCString();
  const query = { location: '' };
  const authorization = signAliyunOssAuthorization({
    method: 'GET',
    bucket: cfg.bucket,
    query,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    date,
  });
  const url = `https://${host}/${buildUrlQuery(query)}`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Date: date,
      Authorization: authorization,
    },
  });
  if (!res.ok) {
    throw await responseToUploadError(res, `阿里云 OSS 配置检查失败 HTTP ${res.status}`, 'aliyun-oss');
  }
  return {
    ok: true,
    supported: true,
    message: '阿里云 OSS 连接可用：Bucket、Endpoint、AccessKey 已通过签名检查',
    provider: target.provider,
  };
}

async function testCloudTargetConnectivity(target) {
  if (target?.provider === 'tencent-cos') return testTencentCosTarget(target);
  if (target?.provider === 'aliyun-oss') return testAliyunOssTarget(target);
  return validateTargetConfig(target);
}

async function uploadToTencentCos(target, filePath, payload) {
  const cfg = target.tencentCos || {};
  const objectKey = buildObjectKey(target, filePath, payload);
  const host = tencentCosHost(cfg);
  const uriPath = `/${encodeObjectKeyPath(objectKey)}`;
  const authorization = signTencentCosRequest({
    method: 'PUT',
    host,
    uriPath,
    secretId: cfg.secretId,
    secretKey: cfg.secretKey,
  });
  const url = `https://${host}${uriPath}`;
  await putStream(url, filePath, { Authorization: authorization, __provider: 'tencent-cos' });
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
  const host = aliyunOssHost(cfg);
  const date = new Date().toUTCString();
  const authorization = signAliyunOssAuthorization({
    method: 'PUT',
    bucket: cfg.bucket,
    objectKey,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    date,
  });
  const url = `https://${host}/${encodeObjectKeyPath(objectKey)}`;
  await putStream(url, filePath, { Date: date, Authorization: authorization, __provider: 'aliyun-oss' });
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
  classifyCloudUploadError,
  kindFromExt,
  mimeFromPath,
  resolveUploadSource,
  testCloudTargetConnectivity,
  uploadCloudAsset,
  validateTargetConfig,
};

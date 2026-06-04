'use strict';

const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const TARGET_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

const CLOUD_UPLOAD_PROVIDERS = new Set([
  'tencent-cos',
  'aliyun-oss',
  'baidu-netdisk',
  'quark-netdisk',
]);

const DEFAULT_CLOUD_UPLOAD_TARGETS = [
  {
    id: 'tencent-cos',
    provider: 'tencent-cos',
    label: '腾讯云 COS',
    enabled: false,
    isDefault: false,
    prefix: 't8-canvas/{kind}/{yyyy-mm}',
    publicBaseUrl: '',
    tencentCos: {
      bucket: '',
      region: 'ap-guangzhou',
      secretId: '',
      secretKey: '',
    },
  },
  {
    id: 'aliyun-oss',
    provider: 'aliyun-oss',
    label: '阿里云 OSS',
    enabled: false,
    isDefault: false,
    prefix: 't8-canvas/{kind}/{yyyy-mm}',
    publicBaseUrl: '',
    aliyunOss: {
      bucket: '',
      endpoint: 'oss-cn-hangzhou.aliyuncs.com',
      accessKeyId: '',
      accessKeySecret: '',
    },
  },
  {
    id: 'baidu-netdisk',
    provider: 'baidu-netdisk',
    label: '百度网盘',
    enabled: false,
    isDefault: false,
    prefix: 'T8PenguinCanvas/{kind}/{yyyy-mm}',
    baiduNetdisk: {
      folder: '/apps/T8PenguinCanvas',
      accessToken: '',
      refreshToken: '',
      appKey: '',
      appSecret: '',
    },
  },
  {
    id: 'quark-netdisk',
    provider: 'quark-netdisk',
    label: '夸克网盘',
    enabled: false,
    isDefault: false,
    prefix: 'T8PenguinCanvas/{kind}/{yyyy-mm}',
    quarkNetdisk: {
      folder: '/T8PenguinCanvas',
      mode: 'external-command',
      commandPath: '',
      cookie: '',
    },
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanText(value, maxLen = 160) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function cleanMultilineText(value, maxLen = 4096) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, maxLen);
}

function cleanId(value, fallback = '') {
  const id = String(value || '').trim().toLowerCase();
  if (TARGET_ID_RE.test(id)) return id;
  return fallback;
}

function cleanProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return CLOUD_UPLOAD_PROVIDERS.has(provider) ? provider : '';
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
  }
  return fallback;
}

function isMaskedSecret(value) {
  return typeof value === 'string' && /^\*{2,}/.test(value.trim());
}

function cleanSecret(value, previous = '') {
  if (typeof value !== 'string') return previous || '';
  const trimmed = value.trim();
  if (!trimmed || isMaskedSecret(trimmed)) return previous || '';
  if (CONTROL_CHAR_RE.test(trimmed)) return previous || '';
  return trimmed.slice(0, 8192);
}

function maskSecret(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `****${text.slice(-4)}`;
}

function cleanBucket(value) {
  return cleanText(value, 120).replace(/[^a-zA-Z0-9._-]/g, '');
}

function cleanRegion(value, fallback = '') {
  return cleanText(value, 80).replace(/[^a-zA-Z0-9._-]/g, '') || fallback;
}

function cleanEndpoint(value) {
  const text = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return text.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 180);
}

function cleanPrefix(value, fallback = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const cleaned = raw
    .split('/')
    .map((part) => part.trim().replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 120))
    .filter(Boolean)
    .join('/');
  return (cleaned || fallback || '').slice(0, 500);
}

function cleanFolder(value, fallback = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const cleaned = withSlash
    .split('/')
    .map((part, index) => (index === 0 ? '' : part.trim().replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 120)))
    .join('/')
    .replace(/\/+/g, '/');
  return cleaned === '/' ? (fallback || '/') : (cleaned || fallback || '/');
}

function cleanPublicBaseUrl(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

function normalizeTencentConfig(raw, previous = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    bucket: cleanBucket(value.bucket || value.bucketName || previous.bucket),
    region: cleanRegion(value.region || previous.region, 'ap-guangzhou'),
    secretId: cleanSecret(value.secretId || value.secretID || value.sid, previous.secretId),
    secretKey: cleanSecret(value.secretKey || value.sk, previous.secretKey),
  };
}

function normalizeAliyunConfig(raw, previous = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    bucket: cleanBucket(value.bucket || value.bucketName || previous.bucket),
    endpoint: cleanEndpoint(value.endpoint || previous.endpoint) || 'oss-cn-hangzhou.aliyuncs.com',
    accessKeyId: cleanSecret(value.accessKeyId || value.accessKeyID || value.ak, previous.accessKeyId),
    accessKeySecret: cleanSecret(value.accessKeySecret || value.secretKey || value.sk, previous.accessKeySecret),
  };
}

function normalizeBaiduConfig(raw, previous = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    folder: cleanFolder(value.folder || previous.folder, '/apps/T8PenguinCanvas'),
    accessToken: cleanSecret(value.accessToken || value.access_token, previous.accessToken),
    refreshToken: cleanSecret(value.refreshToken || value.refresh_token, previous.refreshToken),
    appKey: cleanSecret(value.appKey || value.app_key, previous.appKey),
    appSecret: cleanSecret(value.appSecret || value.app_secret, previous.appSecret),
  };
}

function normalizeQuarkConfig(raw, previous = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const mode = ['external-command', 'cookie'].includes(String(value.mode || '').trim())
    ? String(value.mode).trim()
    : (previous.mode || 'external-command');
  return {
    folder: cleanFolder(value.folder || previous.folder, '/T8PenguinCanvas'),
    mode,
    commandPath: cleanText(value.commandPath || value.command || previous.commandPath, 260),
    cookie: cleanSecret(value.cookie || previous.cookie),
  };
}

function normalizeTarget(raw, previous = null, template = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const provider = cleanProvider(raw.provider || template?.provider);
  if (!provider) return null;
  const id = cleanId(raw.id, template?.id || provider);
  if (!id) return null;
  const prev = previous || {};
  const target = {
    id,
    provider,
    label: cleanText(raw.label || raw.name || prev.label || template?.label || id, 80) || id,
    enabled: normalizeBoolean(raw.enabled, false),
    isDefault: normalizeBoolean(raw.isDefault ?? raw.default, false),
    prefix: cleanPrefix(raw.prefix || prev.prefix || template?.prefix, template?.prefix || 't8-canvas/{kind}/{yyyy-mm}'),
    publicBaseUrl: cleanPublicBaseUrl(raw.publicBaseUrl || raw.public_base_url || prev.publicBaseUrl || template?.publicBaseUrl),
  };

  if (provider === 'tencent-cos') {
    target.tencentCos = normalizeTencentConfig(raw.tencentCos || raw.tencent_cos || raw, prev.tencentCos || template?.tencentCos);
  }
  if (provider === 'aliyun-oss') {
    target.aliyunOss = normalizeAliyunConfig(raw.aliyunOss || raw.aliyun_oss || raw, prev.aliyunOss || template?.aliyunOss);
  }
  if (provider === 'baidu-netdisk') {
    target.baiduNetdisk = normalizeBaiduConfig(raw.baiduNetdisk || raw.baidu_netdisk || raw, prev.baiduNetdisk || template?.baiduNetdisk);
  }
  if (provider === 'quark-netdisk') {
    target.quarkNetdisk = normalizeQuarkConfig(raw.quarkNetdisk || raw.quark_netdisk || raw, prev.quarkNetdisk || template?.quarkNetdisk);
  }
  if (provider !== 'tencent-cos' && provider !== 'aliyun-oss') {
    delete target.publicBaseUrl;
  }
  return target;
}

function normalizeCloudUploadTargets(rawTargets, currentTargets = []) {
  const previousById = new Map(
    (Array.isArray(currentTargets) ? currentTargets : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => [cleanId(item.id), item])
      .filter(([id]) => !!id),
  );
  const byId = new Map();

  for (const template of DEFAULT_CLOUD_UPLOAD_TARGETS) {
    const previous = previousById.get(template.id);
    const target = normalizeTarget({ ...clone(template), ...(previous || {}) }, previous, template);
    if (target) byId.set(target.id, target);
  }

  for (const raw of Array.isArray(rawTargets) ? rawTargets : []) {
    const id = cleanId(raw?.id);
    const template = DEFAULT_CLOUD_UPLOAD_TARGETS.find((item) => item.id === id || item.provider === raw?.provider) || null;
    const previous = previousById.get(id) || byId.get(id) || null;
    const target = normalizeTarget(raw, previous, template);
    if (target) byId.set(target.id, target);
  }

  const targets = [...byId.values()];
  let defaultUsed = false;
  for (const target of targets) {
    if (target.isDefault && !defaultUsed) {
      defaultUsed = true;
      continue;
    }
    if (target.isDefault && defaultUsed) target.isDefault = false;
  }
  return targets;
}

function maskCloudUploadTargets(targets) {
  return normalizeCloudUploadTargets(targets).map((target) => {
    const masked = { ...target };
    if (target.tencentCos) {
      masked.tencentCos = {
        ...target.tencentCos,
        hasSecretId: !!target.tencentCos.secretId,
        hasSecretKey: !!target.tencentCos.secretKey,
        secretId: maskSecret(target.tencentCos.secretId),
        secretKey: maskSecret(target.tencentCos.secretKey),
      };
    }
    if (target.aliyunOss) {
      masked.aliyunOss = {
        ...target.aliyunOss,
        hasAccessKeyId: !!target.aliyunOss.accessKeyId,
        hasAccessKeySecret: !!target.aliyunOss.accessKeySecret,
        accessKeyId: maskSecret(target.aliyunOss.accessKeyId),
        accessKeySecret: maskSecret(target.aliyunOss.accessKeySecret),
      };
    }
    if (target.baiduNetdisk) {
      masked.baiduNetdisk = {
        ...target.baiduNetdisk,
        hasAccessToken: !!target.baiduNetdisk.accessToken,
        hasRefreshToken: !!target.baiduNetdisk.refreshToken,
        hasAppKey: !!target.baiduNetdisk.appKey,
        hasAppSecret: !!target.baiduNetdisk.appSecret,
        accessToken: maskSecret(target.baiduNetdisk.accessToken),
        refreshToken: maskSecret(target.baiduNetdisk.refreshToken),
        appKey: maskSecret(target.baiduNetdisk.appKey),
        appSecret: maskSecret(target.baiduNetdisk.appSecret),
      };
    }
    if (target.quarkNetdisk) {
      masked.quarkNetdisk = {
        ...target.quarkNetdisk,
        hasCookie: !!target.quarkNetdisk.cookie,
        cookie: maskSecret(target.quarkNetdisk.cookie),
      };
    }
    return masked;
  });
}

function targetHasCredentials(target) {
  if (target.provider === 'tencent-cos') {
    return !!(target.tencentCos?.bucket && target.tencentCos?.region && target.tencentCos?.secretId && target.tencentCos?.secretKey);
  }
  if (target.provider === 'aliyun-oss') {
    return !!(target.aliyunOss?.bucket && target.aliyunOss?.endpoint && target.aliyunOss?.accessKeyId && target.aliyunOss?.accessKeySecret);
  }
  if (target.provider === 'baidu-netdisk') {
    return !!(target.baiduNetdisk?.accessToken || target.baiduNetdisk?.refreshToken);
  }
  if (target.provider === 'quark-netdisk') {
    return !!(target.quarkNetdisk?.commandPath || target.quarkNetdisk?.cookie);
  }
  return false;
}

function summarizeCloudUploadTargets(targets) {
  const normalized = normalizeCloudUploadTargets(targets);
  const defaultTarget = normalized.find((target) => target.isDefault) || normalized.find((target) => target.enabled) || null;
  return {
    totalCount: normalized.length,
    enabledCount: normalized.filter((target) => target.enabled).length,
    configuredCount: normalized.filter(targetHasCredentials).length,
    supportedUploadCount: normalized.filter((target) => ['tencent-cos', 'aliyun-oss'].includes(target.provider)).length,
    defaultTargetId: defaultTarget?.id || '',
    defaultLabel: defaultTarget?.label || '',
  };
}

module.exports = {
  CLOUD_UPLOAD_PROVIDERS,
  DEFAULT_CLOUD_UPLOAD_TARGETS,
  cleanMultilineText,
  maskCloudUploadTargets,
  normalizeCloudUploadTargets,
  summarizeCloudUploadTargets,
  targetHasCredentials,
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function envFlag(name) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function normalizedHostname(parsed) {
  return String(parsed?.hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function isLocalComfyuiUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && LOCAL_HOSTS.has(normalizedHostname(parsed));
  } catch {
    return false;
  }
}

function isRemoteComfyuiAccessEnabled() {
  return envFlag('T8_COMFYUI_ALLOW_REMOTE') || envFlag('T8_COMFYUI_ALLOW_PRIVATE');
}

function isAllowedComfyuiUrl(value, options = {}) {
  if (!value) return true;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (LOCAL_HOSTS.has(normalizedHostname(parsed))) return true;
  return !!options.allowRemote || isRemoteComfyuiAccessEnabled();
}

module.exports = {
  isAllowedComfyuiUrl,
  isLocalComfyuiUrl,
  isRemoteComfyuiAccessEnabled,
};

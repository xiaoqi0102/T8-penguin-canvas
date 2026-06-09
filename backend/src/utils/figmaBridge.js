'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const config = require('../config');

const BRIDGE_VERSION = 2;
const DEFAULT_PORT = 3845;
const DEFAULT_BASE = `http://localhost:${DEFAULT_PORT}`;
const HEALTH_TIMEOUT_MS = 1200;
const START_WAIT_MS = 3500;

let childProcess = null;
let startPromise = null;
let exitHooksInstalled = false;

function log(logger, message) {
  if (logger && typeof logger.log === 'function') logger.log(message);
}

function warn(logger, message) {
  if (logger && typeof logger.warn === 'function') logger.warn(message);
  else log(logger, message);
}

function normalizeBase(raw) {
  const value = String(raw || process.env.FIGMA_BRIDGE_BASE || DEFAULT_BASE).trim();
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_) {
    return DEFAULT_BASE;
  }
}

function portFromBase(base) {
  try {
    const parsed = new URL(base);
    return Number(parsed.port || DEFAULT_PORT) || DEFAULT_PORT;
  } catch (_) {
    return DEFAULT_PORT;
  }
}

function isBridgeHealthy(data, base) {
  return !!(
    data &&
    data.service === 't8-figma-bridge' &&
    Number(data.version || 0) >= BRIDGE_VERSION &&
    data.assetBase === normalizeBase(base)
  );
}

async function fetchJson(url, timeoutMs = HEALTH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) return null;
    return data;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getFigmaBridgeHealth(base = DEFAULT_BASE) {
  return fetchJson(`${normalizeBase(base)}/health`);
}

function findBridgeScript() {
  const candidates = [
    process.env.T8_FIGMA_BRIDGE_SCRIPT,
    process.env.T8PC_RES ? path.join(process.env.T8PC_RES, 'tools', 'figma-bridge', 'server.cjs') : '',
    path.resolve(__dirname, '..', '..', '..', 'tools', 'figma-bridge', 'server.cjs'),
    path.join(config.BASE_DIR || '', 'tools', 'figma-bridge', 'server.cjs'),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function electronRunAsNodeEnv() {
  return process.versions && process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {};
}

function installExitHooks() {
  if (exitHooksInstalled) return;
  exitHooksInstalled = true;
  const stop = () => {
    if (!childProcess || childProcess.exitCode !== null) return;
    try {
      childProcess.kill();
    } catch (_) {}
  };
  process.once('exit', stop);
  process.once('SIGINT', () => {
    stop();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    stop();
    process.exit(143);
  });
}

async function waitForHealthyBridge(base, timeoutMs = START_WAIT_MS) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await getFigmaBridgeHealth(base);
    if (isBridgeHealthy(last, base)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last;
}

async function ensureFigmaBridgeRunning(options = {}) {
  const logger = options.logger || console;
  const base = normalizeBase(options.base || DEFAULT_BASE);
  if (process.env.T8_FIGMA_BRIDGE_AUTOSTART === '0') {
    return { ok: false, disabled: true, base, message: 'Figma bridge autostart disabled' };
  }

  const current = await getFigmaBridgeHealth(base);
  if (isBridgeHealthy(current, base)) {
    return { ok: true, alreadyRunning: true, base, health: current };
  }

  if (startPromise) return startPromise;

  startPromise = (async () => {
    const script = findBridgeScript();
    if (!script) {
      return { ok: false, base, message: 'Figma bridge server.cjs not found' };
    }

    const port = portFromBase(base);
    const env = {
      ...process.env,
      ...electronRunAsNodeEnv(),
      T8_FIGMA_BRIDGE_PORT: String(port),
      T8_FIGMA_BRIDGE_KEEP_ALIVE_ON_EXISTING: '0',
      T8_FIGMA_BRIDGE_AUTOSTARTED_BY: 't8-penguin-canvas',
    };

    log(logger, `[figma-bridge] auto-start ${script} on ${base}`);
    const child = spawn(process.execPath, [script], {
      env,
      cwd: path.dirname(script),
      windowsHide: true,
      stdio: 'ignore',
    });
    childProcess = child;
    installExitHooks();
    child.once('exit', (code, signal) => {
      if (childProcess === child) childProcess = null;
      if (code && code !== 0) warn(logger, `[figma-bridge] exited code=${code} signal=${signal || ''}`);
    });

    const health = await waitForHealthyBridge(base);
    if (isBridgeHealthy(health, base)) return { ok: true, started: true, base, health };
    return { ok: false, base, message: 'Figma bridge did not become healthy after autostart', health };
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

function startFigmaBridgeOnAppStart(logger = console) {
  ensureFigmaBridgeRunning({ logger }).then((result) => {
    if (result.ok) {
      log(logger, `[figma-bridge] ready at ${result.base}${result.started ? ' (auto-started)' : ''}`);
    } else if (!result.disabled) {
      warn(logger, `[figma-bridge] not ready: ${result.message || 'unknown error'}`);
    }
  }).catch((error) => {
    warn(logger, `[figma-bridge] auto-start failed: ${error && error.message ? error.message : error}`);
  });
}

module.exports = {
  ensureFigmaBridgeRunning,
  getFigmaBridgeHealth,
  startFigmaBridgeOnAppStart,
};

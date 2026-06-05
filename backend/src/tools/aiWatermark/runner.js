'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../../config');
const {
  ensureRuntimeArchiveExtracted,
  getRuntimeArchiveInfo,
  getRuntimeCachePath,
} = require('../../utils/runtimeArchive');
const {
  createAiWatermarkOutputPath,
  kindFromPath,
  outputUrlFromPath,
} = require('./media');

const STATUS_TIMEOUT_MS = 45_000;
const PROCESS_TIMEOUT_MS = 15 * 60_000;
const INVISIBLE_TIMEOUT_MS = 2 * 60 * 60_000;
const RESOLUTION_CACHE_TTL_MS = 5 * 60_000;
const NEGATIVE_RESOLUTION_CACHE_TTL_MS = 10_000;
const CAPABILITY_CACHE_TTL_MS = 60_000;
const FALLBACK_MARKS = ['gemini', 'doubao', 'jimeng'];
const PYTHON_MODULE = 'remove_ai_watermarks.cli';

let commandResolutionCache = null;
let capabilityCache = null;

function shortRunId() {
  return Math.random().toString(36).slice(2, 8);
}

function redactCommandArgs(args = []) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const value = String(args[i]);
    out.push(value);
    if (value === '--hf-token' && i + 1 < args.length) {
      out.push('***');
      i += 1;
    }
  }
  return out;
}

function aiWatermarkLog(runId, message) {
  const tag = runId ? `[ai-watermark ${runId}]` : '[ai-watermark]';
  console.log(`${tag} ${message}`);
}

function createStreamLogger(runId, label, streamName) {
  let pending = '';
  const prefix = runId
    ? `[ai-watermark ${runId}][${label}][${streamName}]`
    : `[ai-watermark][${label}][${streamName}]`;

  const emitLine = (line) => {
    const text = String(line || '').trimEnd();
    if (!text.trim()) return;
    console.log(`${prefix} ${text}`);
  };

  const emit = (chunk) => {
    const text = String(chunk || '').replace(/\r/g, '\n');
    const lines = `${pending}${text}`.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) emitLine(line);
  };

  emit.flush = () => {
    if (pending) {
      emitLine(pending);
      pending = '';
    }
  };

  return emit;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return !!value;
}

function finiteNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function integer(value, fallback, min, max) {
  return Math.trunc(finiteNumber(value, fallback, min, max));
}

function choice(value, allowed, fallback) {
  const v = String(value || '').trim();
  return allowed.includes(v) ? v : fallback;
}

function versionTuple(version) {
  const match = String(version || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [
    Number(match[1]) || 0,
    Number(match[2]) || 0,
    Number(match[3]) || 0,
  ];
}

function versionAtLeast(version, minimum) {
  const current = versionTuple(version);
  const target = versionTuple(minimum);
  if (!current || !target) return false;
  for (let i = 0; i < 3; i += 1) {
    if (current[i] > target[i]) return true;
    if (current[i] < target[i]) return false;
  }
  return true;
}

function supportsInvisible089(options = {}) {
  const version = String(options.upstreamVersion || options.runtimeVersion || '').trim();
  return !version || versionAtLeast(version, '0.8.9');
}

function normalizeInvisiblePipeline(value, upstreamVersion = '') {
  const raw = String(value || 'default').trim();
  const modern = !String(upstreamVersion || '').trim() || versionAtLeast(upstreamVersion, '0.8.9');
  if (raw === 'controlnet') return modern ? 'controlnet' : 'ctrlregen';
  if (raw === 'ctrlregen') return modern ? 'controlnet' : 'ctrlregen';
  return 'default';
}

function normalizeRegion(region) {
  if (!region || typeof region !== 'object') return null;
  const x = Math.max(0, Math.trunc(Number(region.x) || 0));
  const y = Math.max(0, Math.trunc(Number(region.y) || 0));
  const w = Math.trunc(Number(region.w ?? region.width) || 0);
  const h = Math.trunc(Number(region.h ?? region.height) || 0);
  if (w <= 0 || h <= 0) return null;
  return `${x},${y},${w},${h}`;
}

function normalizeRegions(value) {
  if (Array.isArray(value)) return value.map(normalizeRegion).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[;；]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function appendPythonPath(env, pythonPath) {
  if (!pythonPath) return { ...env };
  const key = process.platform === 'win32' ? 'PYTHONPATH' : 'PYTHONPATH';
  const current = env[key] || '';
  return {
    ...env,
    [key]: current ? `${pythonPath}${path.delimiter}${current}` : pythonPath,
  };
}

function sourcePythonPath(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const src = path.join(root, 'src');
  if (fs.existsSync(path.join(src, 'remove_ai_watermarks'))) return src;
  if (fs.existsSync(path.join(root, 'remove_ai_watermarks'))) return root;
  return '';
}

function pushCliCandidate(candidates, command, label, env = process.env) {
  if (!command || !fs.existsSync(command)) return;
  candidates.push({
    id: `runtime-cli-${label}`,
    command,
    baseArgs: [],
    label,
    kind: 'cli-bin',
    env: { ...env },
  });
}

function pushPythonModuleCandidate(candidates, pythonCommand, label, env = process.env, extra = {}) {
  if (!pythonCommand || !fs.existsSync(pythonCommand)) return;
  candidates.push({
    id: `runtime-python-${label}`,
    command: pythonCommand,
    baseArgs: ['-m', PYTHON_MODULE],
    label,
    kind: 'python-module',
    env: extra.pythonPath ? appendPythonPath(env, extra.pythonPath) : { ...env },
    pythonCommand,
    pythonPrefix: [],
    pythonPath: extra.pythonPath || '',
  });
}

function pushRuntimeRootCandidates(candidates, runtimeRoot, label, env = process.env) {
  if (!runtimeRoot) return;
  const root = path.resolve(runtimeRoot);
  if (!fs.existsSync(root)) return;

  const pythonPath = sourcePythonPath(root);
  for (const py of [
    path.join(root, 'python.exe'),
    path.join(root, 'python', 'python.exe'),
    path.join(root, '.venv', 'Scripts', 'python.exe'),
    path.join(root, 'Scripts', 'python.exe'),
    path.join(root, 'bin', 'python'),
  ]) {
    pushPythonModuleCandidate(candidates, py, `${label} python`, env, { pythonPath });
  }

  for (const cli of [
    path.join(root, 'remove-ai-watermarks.exe'),
    path.join(root, 'remove-ai-watermarks.cmd'),
    path.join(root, 'remove-ai-watermarks'),
    path.join(root, 'Scripts', 'remove-ai-watermarks.exe'),
    path.join(root, 'bin', 'remove-ai-watermarks'),
  ]) {
    pushCliCandidate(candidates, cli, `${label} CLI`, env);
  }
}

function commandCandidates() {
  const candidates = [];
  const env = process.env;
  const bin = String(env.T8_REMOVE_AI_WATERMARKS_BIN || '').trim();
  if (bin) {
    candidates.push({
      id: 'env-bin',
      command: bin,
      baseArgs: [],
      label: 'T8_REMOVE_AI_WATERMARKS_BIN',
      kind: 'cli-bin',
      env: { ...env },
    });
  }

  const runtimeRoot = String(env.T8_REMOVE_AI_WATERMARKS_RUNTIME || '').trim();
  if (runtimeRoot) {
    pushRuntimeRootCandidates(candidates, runtimeRoot, 'T8_REMOVE_AI_WATERMARKS_RUNTIME', env);
  }
  if (!config.IS_PACKAGED) {
    pushRuntimeRootCandidates(
      candidates,
      path.resolve(config.BASE_DIR, 'tools', 'remove-ai-watermarks-runtime'),
      'local remove-ai-watermarks runtime slot',
      env,
    );
  }
  const resourcesRoot = String(env.T8PC_RES || '').trim();
  if (resourcesRoot) {
    pushRuntimeRootCandidates(
      candidates,
      path.join(resourcesRoot, 'tools', 'remove-ai-watermarks'),
      'packaged remove-ai-watermarks runtime',
      env,
    );
  }
  pushRuntimeRootCandidates(
    candidates,
    getRuntimeCachePath('remove-ai-watermarks'),
    'cached remove-ai-watermarks runtime',
    env,
  );

  const sourceRoots = [];
  const envSource = String(env.T8_REMOVE_AI_WATERMARKS_SRC || '').trim();
  if (envSource) sourceRoots.push({ root: envSource, label: 'T8_REMOVE_AI_WATERMARKS_SRC' });
  const devSource = path.resolve(config.BASE_DIR, '..', '_external', 'remove-ai-watermarks');
  if (!config.IS_PACKAGED && fs.existsSync(devSource)) {
    sourceRoots.push({ root: devSource, label: 'local external clone' });
  }
  for (const item of sourceRoots) {
    const pythonPath = sourcePythonPath(item.root);
    if (!pythonPath) continue;
    candidates.push({
      id: `source-python-${item.label}`,
      command: 'python',
      baseArgs: ['-m', PYTHON_MODULE],
      label: item.label,
      kind: 'python-module',
      env: appendPythonPath(env, pythonPath),
      pythonCommand: 'python',
      pythonPrefix: [],
      pythonPath,
    });
    candidates.push({
      id: `source-py-${item.label}`,
      command: 'py',
      baseArgs: ['-3', '-m', PYTHON_MODULE],
      label: `${item.label} (py -3)`,
      kind: 'python-module',
      env: appendPythonPath(env, pythonPath),
      pythonCommand: 'py',
      pythonPrefix: ['-3'],
      pythonPath,
    });
  }

  candidates.push({
    id: 'python-module',
    command: 'python',
    baseArgs: ['-m', PYTHON_MODULE],
    label: 'python -m remove_ai_watermarks.cli',
    kind: 'python-module',
    env: { ...env },
    pythonCommand: 'python',
    pythonPrefix: [],
  });
  candidates.push({
    id: 'py-module',
    command: 'py',
    baseArgs: ['-3', '-m', PYTHON_MODULE],
    label: 'py -3 -m remove_ai_watermarks.cli',
    kind: 'python-module',
    env: { ...env },
    pythonCommand: 'py',
    pythonPrefix: ['-3'],
  });

  if (process.platform === 'win32') {
    candidates.push({
      id: 'path-cli-exe',
      command: 'remove-ai-watermarks.exe',
      baseArgs: [],
      label: 'PATH remove-ai-watermarks.exe',
      kind: 'cli-bin',
      env: { ...env },
    });
    candidates.push({
      id: 'path-cli-cmd',
      command: 'remove-ai-watermarks.cmd',
      baseArgs: [],
      label: 'PATH remove-ai-watermarks.cmd',
      kind: 'cli-bin',
      env: { ...env },
    });
    candidates.push({
      id: 'path-cli-noext',
      command: 'remove-ai-watermarks',
      baseArgs: [],
      label: 'PATH remove-ai-watermarks',
      kind: 'cli-bin',
      env: { ...env },
    });
  } else {
    candidates.push({
      id: 'path-cli',
      command: 'remove-ai-watermarks',
      baseArgs: [],
      label: 'PATH remove-ai-watermarks',
      kind: 'cli-bin',
      env: { ...env },
    });
  }

  return candidates;
}

function runCommand(candidate, args, options = {}) {
  const timeoutMs = options.timeoutMs || PROCESS_TIMEOUT_MS;
  const mergedArgs = [...(candidate.baseArgs || []), ...args.map((arg) => String(arg))];
  const stdoutLogger = options.streamLogs
    ? createStreamLogger(options.runId || '', options.streamLabel || candidate.label, 'stdout')
    : null;
  const stderrLogger = options.streamLogs
    ? createStreamLogger(options.runId || '', options.streamLabel || candidate.label, 'stderr')
    : null;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(candidate.command, mergedArgs, {
        env: candidate.env || process.env,
        cwd: options.cwd || config.BASE_DIR,
        windowsHide: true,
        shell: false,
      });
    } catch (error) {
      resolve({
        ok: false,
        code: -1,
        stdout: '',
        stderr: error?.message || String(error),
        command: candidate.label,
        args: mergedArgs,
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      stdoutLogger?.flush();
      stderrLogger?.flush();
      resolve({
        ok: false,
        code: -1,
        signal: 'timeout',
        stdout,
        stderr: stderr || `命令超时 (${Math.round(timeoutMs / 1000)}s)`,
        command: candidate.label,
        args: mergedArgs,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (stdout.length > 40_000) stdout = stdout.slice(-40_000);
      stdoutLogger?.(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000);
      stderrLogger?.(text);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdoutLogger?.flush();
      stderrLogger?.flush();
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: error?.message || String(error),
        command: candidate.label,
        args: mergedArgs,
      });
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdoutLogger?.flush();
      stderrLogger?.flush();
      resolve({
        ok: code === 0,
        code,
        signal,
        stdout,
        stderr,
        command: candidate.label,
        args: mergedArgs,
      });
    });
  });
}

function aiWatermarkEnvFingerprint() {
  const archive = getRuntimeArchiveInfo('remove-ai-watermarks');
  return [
    process.env.T8_REMOVE_AI_WATERMARKS_BIN || '',
    process.env.T8_REMOVE_AI_WATERMARKS_RUNTIME || '',
    process.env.T8_REMOVE_AI_WATERMARKS_SRC || '',
    process.env.T8PC_RES || '',
    archive.archivePath || '',
    archive.archiveSize || '',
    archive.archiveMtimeMs || '',
    archive.ready ? 'ready' : 'pending',
    process.env.PATH || '',
  ].join('\u0000');
}

function commandCandidatesFingerprint(candidates) {
  return JSON.stringify(candidates.map((candidate) => ({
    id: candidate.id,
    command: candidate.command,
    baseArgs: candidate.baseArgs || [],
    label: candidate.label,
    kind: candidate.kind,
    pythonCommand: candidate.pythonCommand || '',
    pythonPrefix: candidate.pythonPrefix || [],
    pythonPath: candidate.pythonPath || '',
  }))) + aiWatermarkEnvFingerprint();
}

function getCachedResolution(fingerprint) {
  if (!commandResolutionCache) return null;
  if (commandResolutionCache.fingerprint !== fingerprint) return null;
  if (Date.now() > commandResolutionCache.expiresAt) return null;
  return commandResolutionCache.value;
}

function setCachedResolution(fingerprint, value) {
  const ttl = value?.installed ? RESOLUTION_CACHE_TTL_MS : NEGATIVE_RESOLUTION_CACHE_TTL_MS;
  commandResolutionCache = {
    fingerprint,
    value,
    expiresAt: Date.now() + ttl,
  };
}

function parseJsonProbeOutput(text) {
  const lines = String(text || '').trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // keep looking
    }
  }
  return null;
}

async function probePythonModuleCandidate(candidate) {
  const code = `
import importlib.metadata, importlib.util, json, sys
data = {"ok": False, "version": "", "message": ""}
try:
    spec = importlib.util.find_spec("${PYTHON_MODULE}")
    if spec is None:
        data["message"] = "module not found"
        print(json.dumps(data, ensure_ascii=False))
        sys.exit(3)
    data["ok"] = True
    try:
        import remove_ai_watermarks
        data["version"] = getattr(remove_ai_watermarks, "__version__", "")
    except Exception:
        try:
            data["version"] = importlib.metadata.version("remove-ai-watermarks")
        except Exception:
            data["version"] = ""
    print(json.dumps(data, ensure_ascii=False))
except Exception as exc:
    data["message"] = str(exc)
    print(json.dumps(data, ensure_ascii=False))
    sys.exit(2)
`.trim();
  const result = await runPythonProbe({
    command: candidate.pythonCommand || candidate.command,
    argsPrefix: candidate.pythonPrefix || [],
    env: candidate.env || process.env,
    label: `${candidate.label} import probe`,
  }, code);
  if (!result.ok) return result;
  const data = parseJsonProbeOutput(result.stdout);
  if (!data?.ok) {
    return {
      ...result,
      ok: false,
      stderr: data?.message || result.stderr || 'module not available',
    };
  }
  return {
    ...result,
    version: String(data.version || ''),
    stdout: data.version ? `remove-ai-watermarks ${data.version}` : result.stdout,
  };
}

async function resolveAiWatermarkCommand(options = {}) {
  if (options.prepareEmbeddedRuntime) {
    const info = getRuntimeArchiveInfo('remove-ai-watermarks');
    if (info.archiveExists && !info.ready) {
      console.log('[ai-watermark] preparing embedded remove-ai-watermarks runtime archive...');
      ensureRuntimeArchiveExtracted('remove-ai-watermarks');
    }
  }
  const candidates = commandCandidates();
  const fingerprint = commandCandidatesFingerprint(candidates);
  const cached = getCachedResolution(fingerprint);
  if (cached) return cached;

  const errors = [];
  for (const candidate of candidates) {
    const result = candidate.kind === 'python-module'
      ? await probePythonModuleCandidate(candidate)
      : await runCommand(candidate, ['--version'], { timeoutMs: STATUS_TIMEOUT_MS });
    if (result.ok) {
      const version = result.version || parseVersion(result.stdout || result.stderr);
      const resolved = {
        installed: true,
        candidate,
        version,
        resolver: candidate.label,
        versionOutput: (result.stdout || result.stderr || '').trim(),
      };
      setCachedResolution(fingerprint, resolved);
      return resolved;
    }
    errors.push(`${candidate.label}: ${result.stderr || result.stdout || 'not available'}`.slice(0, 240));
  }
  const resolved = {
    installed: false,
    candidate: null,
    version: '',
    resolver: '',
    errors,
  };
  setCachedResolution(fingerprint, resolved);
  return resolved;
}

function parseVersion(text) {
  const match = String(text || '').match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
  return match ? match[1] : '';
}

function pythonProbeCandidates(resolved) {
  const out = [];
  const env = process.env;
  const candidate = resolved?.candidate;
  if (candidate?.pythonCommand) {
    out.push({
      command: candidate.pythonCommand,
      argsPrefix: candidate.pythonPrefix || [],
      env: candidate.env || env,
      label: `${candidate.label} python probe`,
    });
  }
  out.push({ command: 'python', argsPrefix: [], env: { ...env }, label: 'python import probe' });
  out.push({ command: 'py', argsPrefix: ['-3'], env: { ...env }, label: 'py -3 import probe' });
  return out;
}

function runPythonProbe(probe, code) {
  const candidate = {
    command: probe.command,
    baseArgs: [...(probe.argsPrefix || []), '-c'],
    env: probe.env,
    label: probe.label,
  };
  return runCommand(candidate, [code], { timeoutMs: STATUS_TIMEOUT_MS });
}

async function detectDynamicCapabilities(resolved) {
  const code = `
import importlib.util, json
data = {"markKeys": [], "optionalFeatures": {"invisible": False, "lama": False, "detect": False, "trustmark": False, "restore": False, "auto": False, "controlnet": False, "adaptivePolish": False}, "version": ""}
try:
    import remove_ai_watermarks
    data["version"] = getattr(remove_ai_watermarks, "__version__", "")
except Exception:
    pass
try:
    from remove_ai_watermarks import watermark_registry
    data["markKeys"] = list(watermark_registry.mark_keys())
except Exception:
    pass
try:
    from remove_ai_watermarks.invisible_engine import is_available
    data["optionalFeatures"]["invisible"] = bool(is_available())
except Exception:
    data["optionalFeatures"]["invisible"] = False
try:
    from remove_ai_watermarks.region_eraser import lama_available
    data["optionalFeatures"]["lama"] = bool(lama_available())
except Exception:
    data["optionalFeatures"]["lama"] = False
data["optionalFeatures"]["detect"] = importlib.util.find_spec("imwatermark") is not None
data["optionalFeatures"]["trustmark"] = importlib.util.find_spec("trustmark") is not None
data["optionalFeatures"]["auto"] = importlib.util.find_spec("remove_ai_watermarks.auto_config") is not None
data["optionalFeatures"]["adaptivePolish"] = importlib.util.find_spec("remove_ai_watermarks.humanizer") is not None
try:
    from remove_ai_watermarks import face_restore
    data["optionalFeatures"]["restore"] = bool(face_restore.is_available())
except Exception:
    data["optionalFeatures"]["restore"] = False
print(json.dumps(data, ensure_ascii=False))
`.trim();
  for (const probe of pythonProbeCandidates(resolved)) {
    const result = await runPythonProbe(probe, code);
    if (!result.ok) continue;
    const parsed = parseJsonProbeOutput(result.stdout);
    if (parsed) return parsed;
  }
  return null;
}

function capabilitiesFingerprint(resolved) {
  return [
    resolved?.candidate?.id || '',
    resolved?.candidate?.command || '',
    resolved?.candidate?.pythonPath || '',
    resolved?.version || '',
    resolved?.resolver || '',
    aiWatermarkEnvFingerprint(),
  ].join('\u0000');
}

function getCachedCapabilities(fingerprint) {
  if (!capabilityCache) return null;
  if (capabilityCache.fingerprint !== fingerprint) return null;
  if (Date.now() > capabilityCache.expiresAt) return null;
  return capabilityCache.value;
}

function setCachedCapabilities(fingerprint, value) {
  capabilityCache = {
    fingerprint,
    value,
    expiresAt: Date.now() + CAPABILITY_CACHE_TTL_MS,
  };
}

async function detectCapabilities() {
  const resolved = await resolveAiWatermarkCommand();
  if (!resolved.installed) {
    const archive = getRuntimeArchiveInfo('remove-ai-watermarks');
    if (archive.archiveExists) {
      const capabilities = archive.manifest?.capabilities || {};
      const version = archive.manifest?.source?.version || archive.manifest?.version || '';
      return {
        installed: true,
        version,
        resolver: archive.ready ? 'cached remove-ai-watermarks runtime' : 'embedded remove-ai-watermarks runtime archive',
        runtimeArchivePending: !archive.ready,
        runtimeArchive: {
          archiveExists: true,
          ready: archive.ready,
          archiveFile: archive.archiveFile,
          archiveSize: archive.archiveSize,
        },
        markKeys: Array.isArray(capabilities.visibleMarks) && capabilities.visibleMarks.length > 0
          ? capabilities.visibleMarks
          : FALLBACK_MARKS,
        optionalFeatures: {
          invisible: !!capabilities.invisible,
          lama: !!capabilities.lama,
          detect: !!capabilities.detect,
          trustmark: !!capabilities.trustmark,
          restore: !!capabilities.restore,
          auto: !!capabilities.auto,
          controlnet: !!capabilities.controlnet,
          adaptivePolish: !!capabilities.adaptivePolish,
        },
        setupHints: setupHints(),
        errors: archive.ready ? [] : ['内置运行时归档将在首次执行时解压到用户数据目录。'],
      };
    }
    return {
      installed: false,
      version: '',
      resolver: '',
      markKeys: FALLBACK_MARKS,
      optionalFeatures: {
        invisible: false,
        lama: false,
        detect: false,
        trustmark: false,
        restore: false,
        auto: false,
        controlnet: false,
        adaptivePolish: false,
      },
      setupHints: setupHints(),
      errors: resolved.errors || [],
    };
  }
  const fingerprint = capabilitiesFingerprint(resolved);
  const cached = getCachedCapabilities(fingerprint);
  if (cached) return cached;

  const dynamic = await detectDynamicCapabilities(resolved);
  const modernInvisible = versionAtLeast(dynamic?.version || resolved.version || '', '0.8.9');
  const data = {
    installed: true,
    version: dynamic?.version || resolved.version || '',
    resolver: resolved.resolver,
    markKeys: Array.isArray(dynamic?.markKeys) && dynamic.markKeys.length > 0
      ? dynamic.markKeys
      : FALLBACK_MARKS,
    optionalFeatures: {
      invisible: !!dynamic?.optionalFeatures?.invisible,
      lama: !!dynamic?.optionalFeatures?.lama,
      detect: !!dynamic?.optionalFeatures?.detect,
      trustmark: !!dynamic?.optionalFeatures?.trustmark,
      restore: !!dynamic?.optionalFeatures?.restore,
      auto: !!dynamic?.optionalFeatures?.auto || modernInvisible,
      controlnet: !!dynamic?.optionalFeatures?.controlnet || modernInvisible,
      adaptivePolish: !!dynamic?.optionalFeatures?.adaptivePolish || modernInvisible,
    },
    setupHints: setupHints(),
    errors: [],
  };
  setCachedCapabilities(fingerprint, data);
  return data;
}

function setupHints() {
  return [
    '推荐: pipx install remove-ai-watermarks',
    '也可以: uv tool install remove-ai-watermarks',
    'Electron 离线包: 将准备好的 runtime 放入 tools/remove-ai-watermarks-runtime, 打包前执行 npm run prepack:runtimes 生成归档',
    '已有 runtime 根目录时设置 T8_REMOVE_AI_WATERMARKS_RUNTIME',
    '已有本地源码时设置 T8_REMOVE_AI_WATERMARKS_SRC 指向 clone 根目录',
    '已有可执行文件时设置 T8_REMOVE_AI_WATERMARKS_BIN 指向 remove-ai-watermarks(.cmd)',
    '隐形水印和 LaMA 擦除需要上游可选依赖, 默认不会随 T8 打包',
  ];
}

function assertModeSupportsKind(mode, kind) {
  const normalized = normalizeMode(mode);
  if (kind === 'image') return;
  if (normalized === 'metadata-check' || normalized === 'metadata-remove') return;
  throw new Error('视频 / 音频当前仅支持元数据检查和元数据清理；画面水印处理请先转成图像帧。');
}

function normalizeMode(mode) {
  const raw = String(mode || 'smart').trim();
  if (raw === 'metadata') return 'metadata-remove';
  if (raw === 'metadata-check' || raw === 'metadata-remove') return raw;
  if (['smart', 'visible', 'erase', 'invisible', 'identify'].includes(raw)) return raw;
  return 'smart';
}

function visibleArgs(sourcePath, outputPath, options = {}) {
  const mark = String(options.mark || 'auto').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'auto';
  const inpaintMethod = choice(options.inpaintMethod, ['ns', 'telea', 'gaussian'], 'ns');
  const inpaintStrength = finiteNumber(options.inpaintStrength, 0.85, 0, 1);
  const args = ['visible', sourcePath, '-o', outputPath, '--mark', mark, '--inpaint-method', inpaintMethod, '--inpaint-strength', inpaintStrength];
  args.push(bool(options.inpaint, true) ? '--inpaint' : '--no-inpaint');
  args.push(bool(options.detect, true) ? '--detect' : '--no-detect');
  args.push(bool(options.stripMetadata, true) ? '--strip-metadata' : '--keep-metadata');
  return args;
}

function eraseArgs(sourcePath, outputPath, options = {}) {
  const regions = normalizeRegions(options.regions);
  if (regions.length === 0) throw new Error('框选擦除至少需要 1 个区域');
  const backend = choice(options.backend, ['cv2', 'lama'], 'cv2');
  const inpaintMethod = choice(options.eraseMethod || options.inpaintMethod, ['telea', 'ns'], 'telea');
  const dilate = integer(options.dilate, 3, 0, 80);
  const args = ['erase', sourcePath, '-o', outputPath, '--backend', backend, '--inpaint-method', inpaintMethod, '--dilate', dilate];
  for (const region of regions) args.push('--region', region);
  args.push(bool(options.stripMetadata, true) ? '--strip-metadata' : '--keep-metadata');
  return args;
}

function invisibleArgs(sourcePath, outputPath, options = {}) {
  const modernInvisible = supportsInvisible089(options);
  const pipeline = normalizeInvisiblePipeline(options.pipeline, options.upstreamVersion || options.runtimeVersion || '');
  const autoTune = options.auto === true || options.autoTune === true;
  const device = choice(options.device, ['auto', 'cpu', 'mps', 'cuda', 'xpu'], 'auto');
  const steps = integer(options.steps, 50, 4, 200);
  const humanize = finiteNumber(options.humanize, 0, 0, 20);
  const rawMaxResolution = integer(options.maxResolution, 0, 0, 8192);
  const maxResolution = rawMaxResolution > 0 ? Math.max(256, rawMaxResolution) : 0;
  const args = ['invisible', sourcePath, '-o', outputPath, '--steps', steps, '--device', device, '--humanize', humanize, '--max-resolution', maxResolution];
  if (!autoTune || pipeline !== 'default') {
    args.push('--pipeline', pipeline);
  }
  if (options.strength !== undefined && options.strength !== null && options.strength !== '') {
    args.push('--strength', Math.max(1 / steps, finiteNumber(options.strength, 0.3, 0, 1)));
  }
  if (options.seed !== undefined && options.seed !== null && options.seed !== '') {
    args.push('--seed', integer(options.seed, 0, -2147483648, 2147483647));
  }
  if (options.hfToken) args.push('--hf-token', String(options.hfToken));
  if (modernInvisible) {
    if (options.minResolution !== undefined && options.minResolution !== null && options.minResolution !== '') {
      args.push('--min-resolution', integer(options.minResolution, 1024, 0, 8192));
    }
    const controlnetScale = finiteNumber(options.controlnetScale, 1, 0, 3);
    if (controlnetScale !== 1 || pipeline === 'controlnet') args.push('--controlnet-scale', controlnetScale);
    const unsharp = finiteNumber(options.unsharp, 0, 0, 3);
    if (unsharp > 0) args.push('--unsharp', unsharp);
    if (autoTune) args.push('--auto');
    if (options.adaptivePolish === true) args.push('--adaptive-polish');
    const restoreFacesWeight = finiteNumber(options.restoreFacesWeight, 0.5, 0, 1);
    if (options.restoreFaces === true) {
      args.push('--restore-faces');
      args.push('--restore-faces-weight', restoreFacesWeight);
    } else if (restoreFacesWeight !== 0.5) {
      args.push('--restore-faces-weight', restoreFacesWeight);
    }
  } else {
    if (options.protectText === true) args.push('--protect-text');
    if (options.protectFaces === true) args.push('--protect-faces');
  }
  return args;
}

function metadataArgs(sourcePath, outputPath, mode, options = {}) {
  if (mode === 'metadata-check') return ['metadata', sourcePath, '--check'];
  const args = ['metadata', sourcePath, '--remove', '-o', outputPath];
  args.push(bool(options.keepStandardMetadata, true) ? '--keep-standard' : '--remove-all');
  return args;
}

function identifyArgs(sourcePath, options = {}) {
  const args = ['identify', sourcePath, '--json'];
  if (options.noVisible) args.push('--no-visible');
  return args;
}

function buildAiWatermarkPlan({ mode, sourcePath, outputPath, mediaKind = 'image', options = {} }) {
  const normalizedMode = normalizeMode(mode);
  assertModeSupportsKind(normalizedMode, mediaKind);
  const output = outputPath || createAiWatermarkOutputPath(sourcePath, normalizedMode);

  if (normalizedMode === 'smart') {
    const visibleOutput = createAiWatermarkOutputPath(sourcePath, 'smart_visible');
    const metadataInput = bool(options.runInvisible, false)
      ? createAiWatermarkOutputPath(sourcePath, 'smart_invisible')
      : visibleOutput;
    const steps = [
      {
        label: 'visible-auto',
        args: visibleArgs(sourcePath, visibleOutput, { ...options, mark: options.mark || 'auto' }),
        outputPath: visibleOutput,
        inputPath: sourcePath,
        allowNoOutput: true,
      },
    ];
    if (bool(options.runInvisible, false)) {
      steps.push({
        label: 'invisible',
        args: invisibleArgs(visibleOutput, metadataInput, options),
        outputPath: metadataInput,
        inputPath: visibleOutput,
        inputFallbackPath: sourcePath,
      });
    }
    steps.push({
      label: 'metadata-remove',
      args: metadataArgs(metadataInput, output, 'metadata-remove', options),
      outputPath: output,
      inputPath: metadataInput,
      inputFallbackPath: sourcePath,
    });
    return { mode: normalizedMode, outputPath: output, reportOnly: false, steps };
  }

  if (normalizedMode === 'visible') {
    return { mode: normalizedMode, outputPath: output, reportOnly: false, steps: [{ label: 'visible', args: visibleArgs(sourcePath, output, options), outputPath: output, inputPath: sourcePath }] };
  }
  if (normalizedMode === 'erase') {
    return { mode: normalizedMode, outputPath: output, reportOnly: false, steps: [{ label: 'erase', args: eraseArgs(sourcePath, output, options), outputPath: output, inputPath: sourcePath }] };
  }
  if (normalizedMode === 'invisible') {
    return { mode: normalizedMode, outputPath: output, reportOnly: false, steps: [{ label: 'invisible', args: invisibleArgs(sourcePath, output, options), outputPath: output, inputPath: sourcePath }] };
  }
  if (normalizedMode === 'metadata-check') {
    return { mode: normalizedMode, outputPath: '', reportOnly: true, steps: [{ label: 'metadata-check', args: metadataArgs(sourcePath, '', 'metadata-check', options), inputPath: sourcePath }] };
  }
  if (normalizedMode === 'metadata-remove') {
    return { mode: normalizedMode, outputPath: output, reportOnly: false, steps: [{ label: 'metadata-remove', args: metadataArgs(sourcePath, output, 'metadata-remove', options), outputPath: output, inputPath: sourcePath }] };
  }
  if (normalizedMode === 'identify') {
    return { mode: normalizedMode, outputPath: '', reportOnly: true, steps: [{ label: 'identify', args: identifyArgs(sourcePath, options), inputPath: sourcePath }] };
  }

  throw new Error(`不支持的模式：${normalizedMode}`);
}

function stepTimeout(step) {
  return step.label === 'invisible' ? INVISIBLE_TIMEOUT_MS : PROCESS_TIMEOUT_MS;
}

function ensureStepInput(step) {
  if (!step.inputPath || fs.existsSync(step.inputPath)) return;
  if (step.inputFallbackPath && fs.existsSync(step.inputFallbackPath)) {
    const from = step.inputFallbackPath;
    const to = step.inputPath;
    fs.copyFileSync(from, to);
    return;
  }
  throw new Error(`步骤 ${step.label} 的输入文件不存在`);
}

async function executePlan(candidate, plan, context = {}) {
  const logs = [];
  let report = null;
  const runId = context.runId || '';
  aiWatermarkLog(runId, `plan start mode=${plan.mode} steps=${plan.steps.length} runner="${candidate.label}"`);
  for (const [index, step] of plan.steps.entries()) {
    const stepNo = `${index + 1}/${plan.steps.length}`;
    const logLabel = `${plan.mode}:${step.label}`;
    ensureStepInput(step);
    if (step.outputPath && fs.existsSync(step.outputPath)) {
      try { fs.unlinkSync(step.outputPath); } catch (_) {}
    }
    const startedAt = Date.now();
    aiWatermarkLog(
      runId,
      `step ${stepNo} "${step.label}" start command="${candidate.label}" args=${JSON.stringify(redactCommandArgs(step.args))}`,
    );
    const result = await runCommand(candidate, step.args, {
      timeoutMs: stepTimeout(step),
      streamLogs: true,
      streamLabel: logLabel,
      runId,
    });
    const elapsedMs = Date.now() - startedAt;
    logs.push({
      step: step.label,
      ok: result.ok,
      code: result.code,
      stdout: result.stdout.trim().slice(-6000),
      stderr: result.stderr.trim().slice(-6000),
    });
    aiWatermarkLog(runId, `step ${stepNo} "${step.label}" done ok=${result.ok} code=${result.code} elapsedMs=${elapsedMs}`);
    if (!result.ok) {
      aiWatermarkLog(runId, `step ${stepNo} "${step.label}" failed`);
      throw new Error(result.stderr.trim() || result.stdout.trim() || `${step.label} 执行失败`);
    }
    if (step.label === 'identify') {
      try {
        report = JSON.parse(result.stdout.trim());
      } catch {
        report = { text: result.stdout.trim() };
      }
    } else if (step.label === 'metadata-check') {
      report = { text: result.stdout.trim() || result.stderr.trim() };
    }
    if (step.outputPath && !fs.existsSync(step.outputPath)) {
      if (step.allowNoOutput && fs.existsSync(step.inputPath)) {
        aiWatermarkLog(runId, `step ${stepNo} "${step.label}" produced no file; copied input as fallback`);
        fs.copyFileSync(step.inputPath, step.outputPath);
      } else {
        throw new Error(`${step.label} 未生成输出文件`);
      }
    }
  }
  aiWatermarkLog(runId, `plan complete mode=${plan.mode}`);
  return { logs, report };
}

async function runAiWatermarkProcess({ sourcePath, mediaKind, mode, options = {} }) {
  const normalizedMode = normalizeMode(mode);
  const runId = shortRunId();
  aiWatermarkLog(runId, `request start mode=${normalizedMode} source="${path.basename(String(sourcePath || ''))}" mediaKind=${mediaKind || kindFromPath(sourcePath) || 'unknown'}`);
  const resolved = await resolveAiWatermarkCommand({ prepareEmbeddedRuntime: true });
  if (!resolved.installed) {
    aiWatermarkLog(runId, `runtime missing errors=${JSON.stringify((resolved.errors || []).slice(0, 3))}`);
    throw new Error(`未安装 remove-ai-watermarks。${setupHints().slice(0, 2).join('；')}`);
  }
  aiWatermarkLog(runId, `runtime resolved resolver="${resolved.resolver}" version="${resolved.version || '?'}"`);
  const plan = buildAiWatermarkPlan({
    mode: normalizedMode,
    sourcePath,
    mediaKind: mediaKind || kindFromPath(sourcePath),
    options: { ...options, upstreamVersion: resolved.version || '' },
  });
  const executed = await executePlan(resolved.candidate, plan, { runId });
  if (plan.reportOnly) {
    const text = executed.report?.text || JSON.stringify(executed.report || {}, null, 2);
    aiWatermarkLog(runId, `request complete outputKind=text`);
    return {
      mode: plan.mode,
      outputKind: 'text',
      outputText: text,
      report: executed.report,
      logs: executed.logs,
    };
  }
  aiWatermarkLog(runId, `request complete outputKind=${kindFromPath(plan.outputPath) || mediaKind || 'image'} output="${path.basename(plan.outputPath)}"`);
  return {
    mode: plan.mode,
    outputKind: kindFromPath(plan.outputPath) || mediaKind || 'image',
    outputPath: plan.outputPath,
    outputUrl: outputUrlFromPath(plan.outputPath),
    logs: executed.logs,
  };
}

module.exports = {
  FALLBACK_MARKS,
  assertModeSupportsKind,
  buildAiWatermarkPlan,
  commandCandidates,
  detectCapabilities,
  normalizeMode,
  normalizeRegions,
  normalizeInvisiblePipeline,
  redactCommandArgs,
  resolveAiWatermarkCommand,
  runAiWatermarkProcess,
  setupHints,
  invisibleArgs,
  versionAtLeast,
  visibleArgs,
};

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../config');

const RUNTIME_ARCHIVES = {
  'remove-ai-watermarks': {
    archiveFile: 'remove-ai-watermarks-runtime.zip',
    targetDir: 'remove-ai-watermarks',
    checks: [
      ['python', 'python.exe'],
      ['python.exe'],
      ['Scripts', 'remove-ai-watermarks.exe'],
      ['remove-ai-watermarks.exe'],
    ],
  },
  'parsehub-pythonlibs': {
    archiveFile: 'parsehub-pythonlibs.zip',
    targetDir: 'parsehub-pythonlibs',
    checks: [
      ['parsehub'],
      ['parsehub', '__init__.py'],
    ],
  },
};

function resourcesRoot() {
  const envRoot = String(process.env.T8PC_RES || '').trim();
  if (envRoot) return path.resolve(envRoot);
  return path.resolve(__dirname, '..', '..', '..');
}

function archiveRoot() {
  const envRoot = String(process.env.T8_RUNTIME_ARCHIVES_DIR || '').trim();
  if (envRoot) return path.resolve(envRoot);
  return path.join(resourcesRoot(), 'tools', 'runtime-archives');
}

function runtimeCacheRoot() {
  const envRoot = String(process.env.T8_RUNTIME_CACHE_DIR || '').trim();
  if (envRoot) return path.resolve(envRoot);
  return path.join(config.BASE_DIR, 'runtime-cache');
}

function assertRuntimeId(id) {
  const spec = RUNTIME_ARCHIVES[id];
  if (!spec) throw new Error(`Unknown runtime archive: ${id}`);
  return spec;
}

function archivePathFor(id) {
  const spec = assertRuntimeId(id);
  return path.join(archiveRoot(), spec.archiveFile);
}

function targetPathFor(id) {
  const spec = assertRuntimeId(id);
  return path.join(runtimeCacheRoot(), spec.targetDir);
}

function markerPathFor(id) {
  return path.join(targetPathFor(id), '.t8-runtime-ready.json');
}

function isInside(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  return target === root || target.startsWith(root + path.sep);
}

function statFile(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (_) {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function archiveManifest() {
  return readJson(path.join(archiveRoot(), 'runtime-archives-manifest.json')) || {};
}

function runtimeManifestEntry(id) {
  const manifest = archiveManifest();
  return manifest && manifest.runtimes && manifest.runtimes[id]
    ? manifest.runtimes[id]
    : null;
}

function hasRequiredFile(id, targetPath = targetPathFor(id)) {
  const spec = assertRuntimeId(id);
  return spec.checks.some((parts) => fs.existsSync(path.join(targetPath, ...parts)));
}

function markerMatches(id, archiveStat) {
  const marker = readJson(markerPathFor(id));
  if (!marker || marker.runtime !== id) return false;
  if (!archiveStat) return hasRequiredFile(id);
  return (
    Number(marker.archiveSize || 0) === Number(archiveStat.size || 0) &&
    Number(marker.archiveMtimeMs || 0) === Number(archiveStat.mtimeMs || 0)
  );
}

function isRuntimeReady(id) {
  const archiveStat = statFile(archivePathFor(id));
  return fs.existsSync(targetPathFor(id)) && hasRequiredFile(id) && markerMatches(id, archiveStat);
}

function getRuntimeArchiveInfo(id) {
  const spec = assertRuntimeId(id);
  const archivePath = archivePathFor(id);
  const targetPath = targetPathFor(id);
  const archiveStat = statFile(archivePath);
  const ready = isRuntimeReady(id);
  return {
    id,
    archiveFile: spec.archiveFile,
    archivePath,
    targetPath,
    archiveExists: !!archiveStat,
    archiveSize: archiveStat ? archiveStat.size : 0,
    archiveMtimeMs: archiveStat ? archiveStat.mtimeMs : 0,
    ready,
    manifest: runtimeManifestEntry(id),
  };
}

function extractWithTar(archivePath, destination) {
  return spawnSync('tar', ['-xf', archivePath, '-C', destination], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function extractWithPowerShell(archivePath, destination) {
  return spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
    archivePath,
    destination,
  ], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function extractZip(archivePath, destination) {
  const tar = extractWithTar(archivePath, destination);
  if (!tar.error && tar.status === 0) return;
  const ps = extractWithPowerShell(archivePath, destination);
  if (!ps.error && ps.status === 0) return;
  const details = [
    tar.error ? `tar: ${tar.error.message}` : `tar exit ${tar.status}: ${tar.stderr || tar.stdout || ''}`,
    ps.error ? `powershell: ${ps.error.message}` : `powershell exit ${ps.status}: ${ps.stderr || ps.stdout || ''}`,
  ].join('\n');
  throw new Error(`运行时归档解压失败: ${details.slice(0, 1200)}`);
}

function writeReadyMarker(id, archiveStat) {
  const marker = {
    runtime: id,
    archiveFile: path.basename(archivePathFor(id)),
    archiveSize: archiveStat ? archiveStat.size : 0,
    archiveMtimeMs: archiveStat ? archiveStat.mtimeMs : 0,
    extractedAt: new Date().toISOString(),
  };
  fs.writeFileSync(markerPathFor(id), JSON.stringify(marker, null, 2), 'utf8');
}

function ensureRuntimeArchiveExtracted(id) {
  const spec = assertRuntimeId(id);
  const info = getRuntimeArchiveInfo(id);
  if (info.ready) return { ...info, extracted: false };
  if (!info.archiveExists) {
    return { ...info, extracted: false, available: false };
  }

  const cacheRoot = runtimeCacheRoot();
  const targetPath = targetPathFor(id);
  const tmpPath = path.join(cacheRoot, `.${spec.targetDir}.extracting-${process.pid}-${Date.now()}`);
  if (!isInside(cacheRoot, targetPath) || !isInside(cacheRoot, tmpPath)) {
    throw new Error('运行时缓存目录异常，已中止解压');
  }

  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.rmSync(tmpPath, { recursive: true, force: true });
  fs.mkdirSync(tmpPath, { recursive: true });
  try {
    extractZip(info.archivePath, tmpPath);
    if (!hasRequiredFile(id, tmpPath)) {
      throw new Error(`运行时归档内容不完整: ${info.archiveFile}`);
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
    fs.renameSync(tmpPath, targetPath);
    writeReadyMarker(id, statFile(info.archivePath));
  } catch (error) {
    fs.rmSync(tmpPath, { recursive: true, force: true });
    throw error;
  }

  return { ...getRuntimeArchiveInfo(id), extracted: true, available: true };
}

function getRuntimeCachePath(id) {
  return targetPathFor(id);
}

module.exports = {
  RUNTIME_ARCHIVES,
  ensureRuntimeArchiveExtracted,
  getRuntimeArchiveInfo,
  getRuntimeCachePath,
  hasRequiredFile,
  isRuntimeReady,
};

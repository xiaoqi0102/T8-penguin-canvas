#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tools', 'runtime-archives');
const FORCE = process.env.T8_REBUILD_RUNTIME_ARCHIVES === '1';
const STRICT = process.env.T8_REQUIRE_RUNTIME_ARCHIVES === '1';

const RUNTIMES = [
  {
    id: 'remove-ai-watermarks',
    sourceDir: path.join(ROOT, 'tools', 'remove-ai-watermarks-runtime'),
    archiveFile: 'remove-ai-watermarks-runtime.zip',
    manifestFile: 'runtime-manifest.json',
  },
  {
    id: 'parsehub-pythonlibs',
    sourceDir: path.join(ROOT, 'tools', 'parsehub-pythonlibs'),
    archiveFile: 'parsehub-pythonlibs.zip',
  },
];

function require7za() {
  try {
    const mod = require('7zip-bin');
    if (mod && mod.path7za && fs.existsSync(mod.path7za)) return mod.path7za;
  } catch (_) {}
  return '';
}

function walkStats(root) {
  const stack = [root];
  let files = 0;
  let bytes = 0;
  let maxMtimeMs = 0;
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const st = fs.statSync(full);
      files += 1;
      bytes += st.size;
      maxMtimeMs = Math.max(maxMtimeMs, st.mtimeMs);
    }
  }
  return { files, bytes, maxMtimeMs };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function loadExistingManifest() {
  return readJson(path.join(OUT_DIR, 'runtime-archives-manifest.json')) || { runtimes: {} };
}

function shouldRebuild(runtime, sourceStats, existingManifest) {
  if (FORCE) return true;
  const archivePath = path.join(OUT_DIR, runtime.archiveFile);
  const entry = existingManifest?.runtimes?.[runtime.id];
  return !(
    fs.existsSync(archivePath) &&
    entry &&
    Number(entry.sourceFiles || 0) === sourceStats.files &&
    Number(entry.sourceBytes || 0) === sourceStats.bytes &&
    Number(entry.sourceMtimeMs || 0) === sourceStats.maxMtimeMs
  );
}

function run7zip(runtime, archivePath, path7za) {
  fs.rmSync(archivePath, { force: true });
  const result = spawnSync(path7za, [
    'a',
    '-tzip',
    '-mx=1',
    '-mmt=on',
    archivePath,
    '.',
  ], {
    cwd: runtime.sourceDir,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`7za exited with ${result.status}`);
}

function buildEntry(runtime, sourceStats, archivePath) {
  const archiveStat = fs.statSync(archivePath);
  const sourceManifest = runtime.manifestFile
    ? readJson(path.join(runtime.sourceDir, runtime.manifestFile))
    : null;
  return {
    ...(sourceManifest || {}),
    id: runtime.id,
    archiveFile: runtime.archiveFile,
    archiveBytes: archiveStat.size,
    sourceFiles: sourceStats.files,
    sourceBytes: sourceStats.bytes,
    sourceMtimeMs: sourceStats.maxMtimeMs,
    createdAt: new Date().toISOString(),
  };
}

function main() {
  const path7za = require7za();
  if (!path7za) {
    console.error('[runtime-archives] 7zip-bin is missing. Run npm install first.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {
    format: 'zip',
    compression: '7za -tzip -mx=1 -mmt=on',
    generatedAt: new Date().toISOString(),
    runtimes: {},
  };
  const existing = loadExistingManifest();

  for (const runtime of RUNTIMES) {
    if (!fs.existsSync(runtime.sourceDir)) {
      const message = `[runtime-archives] source missing: ${path.relative(ROOT, runtime.sourceDir)}`;
      if (STRICT) {
        console.error(message);
        process.exit(1);
      }
      console.warn(message);
      continue;
    }
    const sourceStats = walkStats(runtime.sourceDir);
    const archivePath = path.join(OUT_DIR, runtime.archiveFile);
    if (shouldRebuild(runtime, sourceStats, existing)) {
      console.log(`[runtime-archives] creating ${runtime.archiveFile} from ${path.relative(ROOT, runtime.sourceDir)} (${sourceStats.files} files)`);
      run7zip(runtime, archivePath, path7za);
    } else {
      console.log(`[runtime-archives] reusing ${runtime.archiveFile}`);
    }
    manifest.runtimes[runtime.id] = buildEntry(runtime, sourceStats, archivePath);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'runtime-archives-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  console.log(`[runtime-archives] manifest written: ${path.relative(ROOT, path.join(OUT_DIR, 'runtime-archives-manifest.json'))}`);
}

main();

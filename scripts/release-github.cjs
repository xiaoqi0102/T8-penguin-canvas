#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const version = pkg.version;
const tag = process.env.T8_RELEASE_TAG || `v${version}`;
const repo = process.env.T8_RELEASE_REPO || process.env.GITHUB_REPOSITORY || 'T8mars/T8-penguin-canvas';
const productName = pkg.build && pkg.build.productName ? pkg.build.productName : 'T8-PenguinCanvas';
const distDir = path.join(ROOT, 'dist_electron');
const installerName = `${productName}-Setup-${version}.exe`;
const installer = path.join(distDir, installerName);
const blockmap = path.join(distDir, `${installerName}.blockmap`);
const latest = path.join(distDir, 'latest.yml');
const notesFile = path.join(ROOT, 'release-notes', `${tag}.md`);
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const draft = args.has('--draft');
const prerelease = args.has('--prerelease');

function fail(message) {
  console.error(`[release] ${message}`);
  process.exit(1);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function assertFile(file) {
  if (!fs.existsSync(file)) fail(`missing artifact: ${path.relative(ROOT, file)}`);
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size <= 0) fail(`empty artifact: ${path.relative(ROOT, file)}`);
  console.log(`[release] artifact ok: ${path.relative(ROOT, file)} (${formatBytes(stat.size)})`);
}

function assertLatestYaml() {
  assertFile(latest);
  const text = fs.readFileSync(latest, 'utf-8');
  if (!new RegExp(`version:\\s*${version.replace(/\./g, '\\.')}`).test(text)) {
    fail(`latest.yml version mismatch, expected ${version}`);
  }
  if (!text.includes(installerName)) {
    fail(`latest.yml does not reference ${installerName}`);
  }
}

function run(command, commandArgs, options = {}) {
  if (dryRun && command === 'gh') {
    console.log(`[release] dry-run: gh ${commandArgs.join(' ')}`);
    return { status: 0, stdout: '', stderr: '' };
  }
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : '';
    fail(`${command} ${commandArgs.join(' ')} exited with ${result.status}${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function capture(command, commandArgs, options = {}) {
  const result = run(command, commandArgs, { ...options, capture: true });
  return result.status === 0 ? String(result.stdout || '') : '';
}

function releaseExists() {
  if (dryRun) return false;
  const result = run('gh', ['release', 'view', tag, '--repo', repo], {
    capture: true,
    allowFailure: true,
  });
  return result.status === 0;
}

function getGitTarget() {
  const explicit = process.env.T8_RELEASE_TARGET;
  if (explicit) return explicit;
  const sha = capture('git', ['rev-parse', 'HEAD'], { allowFailure: true }).trim();
  return sha || 'HEAD';
}

function warnDirtyTree() {
  const status = capture('git', ['status', '--short'], { allowFailure: true }).trim();
  if (!status) return;
  console.log('[release] working tree has local changes; binary assets will be uploaded from the current workspace.');
  console.log('[release] GitHub tag target remains the current HEAD commit.');
}

function writeFallbackNotes() {
  if (fs.existsSync(notesFile)) return notesFile;
  const tmp = path.join(os.tmpdir(), `t8pc-${tag}-release-notes.md`);
  fs.writeFileSync(
    tmp,
    [
      `# 贞贞的无限画布 ${tag}`,
      '',
      '- Electron 桌面端接入 GitHub Release 自动更新。',
      '- 顶栏新增检查、下载、重启安装状态入口。',
      '- Release 资产包含 NSIS 安装包、blockmap 与 latest.yml。',
      '',
    ].join('\n'),
    'utf-8',
  );
  return tmp;
}

function editLatestFlag() {
  if (draft || prerelease || dryRun) return;
  run('gh', ['release', 'edit', tag, '--repo', repo, '--latest']);
}

function main() {
  console.log(`[release] repo=${repo} tag=${tag}`);
  warnDirtyTree();

  assertFile(installer);
  assertFile(blockmap);
  assertLatestYaml();

  const releaseNotes = writeFallbackNotes();
  const assets = [installer, blockmap, latest];
  const title = `贞贞的无限画布${tag}`;
  const exists = releaseExists();

  if (exists) {
    console.log(`[release] updating existing release ${tag}`);
    run('gh', ['release', 'upload', tag, ...assets, '--repo', repo, '--clobber']);
    run('gh', ['release', 'edit', tag, '--repo', repo, '--title', title, '--notes-file', releaseNotes]);
  } else {
    console.log(`[release] creating release ${tag}`);
    const createArgs = [
      'release',
      'create',
      tag,
      ...assets,
      '--repo',
      repo,
      '--target',
      getGitTarget(),
      '--title',
      title,
      '--notes-file',
      releaseNotes,
    ];
    if (draft) createArgs.push('--draft');
    if (prerelease) createArgs.push('--prerelease');
    run('gh', createArgs);
  }

  editLatestFlag();
  if (!dryRun) {
    run(process.execPath, [path.join(ROOT, 'scripts', 'verify-github-release.cjs'), tag]);
  }
  console.log('[release] done');
}

main();

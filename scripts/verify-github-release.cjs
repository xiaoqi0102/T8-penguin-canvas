#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const version = pkg.version;
const tag = process.argv[2] || process.env.T8_RELEASE_TAG || `v${version}`;
const repo = process.env.T8_RELEASE_REPO || process.env.GITHUB_REPOSITORY || 'T8mars/T8-penguin-canvas';
const productName = pkg.build && pkg.build.productName ? pkg.build.productName : 'T8-PenguinCanvas';
const installerName = `${productName}-Setup-${version}.exe`;
const blockmapName = `${installerName}.blockmap`;

function fail(message) {
  console.error(`[verify-release] ${message}`);
  process.exit(1);
}

function runGh(args, options = {}) {
  const result = spawnSync('gh', args, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  if (result.error) fail(`gh failed: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : '';
    fail(`gh ${args.join(' ')} exited with ${result.status}${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function releaseIsMarkedLatest() {
  const result = runGh(['release', 'list', '--repo', repo, '--limit', '20'], { capture: true });
  return String(result.stdout || '')
    .split(/\r?\n/)
    .some((line) => line.includes(tag) && /\bLatest\b/.test(line));
}

function main() {
  console.log(`[verify-release] repo=${repo} tag=${tag}`);
  const result = runGh(['release', 'view', tag, '--repo', repo, '--json', 'tagName,url,assets,isDraft,isPrerelease,publishedAt'], {
    capture: true,
  });
  const data = JSON.parse(result.stdout);
  const names = new Set((data.assets || []).map((asset) => asset.name));
  for (const required of [installerName, blockmapName, 'latest.yml']) {
    if (!names.has(required)) {
      fail(`missing release asset: ${required}`);
    }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't8pc-release-'));
  runGh(['release', 'download', tag, '--repo', repo, '--pattern', 'latest.yml', '--dir', tmp, '--clobber']);
  const latestPath = path.join(tmp, 'latest.yml');
  if (!fs.existsSync(latestPath)) fail('downloaded latest.yml is missing');
  const latest = fs.readFileSync(latestPath, 'utf-8');
  if (!new RegExp(`version:\\s*${version.replace(/\./g, '\\.')}`).test(latest)) {
    fail(`downloaded latest.yml version mismatch, expected ${version}`);
  }
  if (!latest.includes(installerName)) {
    fail(`downloaded latest.yml does not reference ${installerName}`);
  }

  const isLatest = releaseIsMarkedLatest();
  if (!isLatest && !data.isDraft && !data.isPrerelease) {
    fail(`${tag} is not marked as GitHub Latest`);
  }

  console.log(`[verify-release] assets ok: ${installerName}, ${blockmapName}, latest.yml`);
  console.log(`[verify-release] url: ${data.url}`);
  console.log(`[verify-release] latest: ${isLatest ? 'yes' : 'no'}`);
}

main();

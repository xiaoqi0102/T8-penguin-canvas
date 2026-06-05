#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  T8_REQUIRE_AI_WATERMARK_RUNTIME: process.env.T8_REQUIRE_AI_WATERMARK_RUNTIME || '1',
  T8_REQUIRE_PARSEHUB_RUNTIME: process.env.T8_REQUIRE_PARSEHUB_RUNTIME || '1',
  T8_REQUIRE_RUNTIME_ARCHIVES: process.env.T8_REQUIRE_RUNTIME_ARCHIVES || '1',
  T8_REQUIRE_UPDATE_ARTIFACTS: process.env.T8_REQUIRE_UPDATE_ARTIFACTS || '1',
};

function command(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(label, executable, args) {
  console.log(`[dist-release] ${label}`);
  const shell = process.platform === 'win32' && /\.cmd$/i.test(executable);
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    shell,
    windowsHide: true,
  });
  if (result.error) {
    console.error(`[dist-release] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[dist-release] ${label} exited with ${result.status}`);
    process.exit(result.status || 1);
  }
}

function main() {
  const electronBuilder = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
  );

  run('build + encrypt', command('npm'), ['run', 'prepack:enc']);
  run('prepare runtime archives', command('npm'), ['run', 'prepack:runtimes']);
  run('electron-builder nsis', electronBuilder, ['--win', '--x64']);
  run('post-build checks', process.execPath, [path.join(ROOT, 'electron', '_post_build.cjs')]);
  run('github release upload + verify', process.execPath, [path.join(ROOT, 'scripts', 'release-github.cjs')]);
}

main();

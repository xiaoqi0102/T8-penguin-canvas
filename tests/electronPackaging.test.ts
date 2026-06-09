import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('encrypted Electron loader only falls back to app require for bare packages', () => {
  const loader = read('../electron/loader.cjs');
  assert.match(loader, /function canFallbackToLoaderRequire/);
  assert.match(loader, /!text\.startsWith\('\.'\)/);
  assert.match(loader, /!path\.isAbsolute\(text\)/);
  assert.match(loader, /if \(!canFallbackToLoaderRequire\(id\)\) throw e;/);
  assert.match(loader, /if \(!canFallbackToLoaderRequire\(request\)\) throw e;/);
  assert.match(loader, /return require\(id\)/);
  assert.match(loader, /return require\.resolve\(request, options\)/);
});

test('clean installs include Three.js typings for Panorama3D type-check', () => {
  const packageJson = JSON.parse(read('../package.json'));
  const lock = read('../package-lock.json');
  const panorama = read('../src/components/nodes/Panorama3DNode.tsx');

  assert.equal(packageJson.devDependencies['@types/three'], '^0.184.1');
  assert.match(lock, /"node_modules\/@types\/three"/);
  assert.doesNotMatch(lock, /registry\.npmmirror\.com/);
  assert.match(panorama, /type ThreeModule = typeof import\('three'\)/);
});

test('dir packaging verification ignores stale release metadata unless update artifacts are required', () => {
  const postBuild = read('../electron/_post_build.cjs');
  assert.match(postBuild, /const strict = process\.env\.T8_REQUIRE_UPDATE_ARTIFACTS === '1'/);
  assert.match(postBuild, /const hasInstaller = fs\.existsSync\(installer\)/);
  assert.match(postBuild, /const hasBlockmap = fs\.existsSync\(blockmap\)/);
  assert.match(postBuild, /!strict && !hasInstaller && !hasBlockmap/);
  assert.match(postBuild, /skipping installer\/latest\.yml checks for dir build/);
});

test('Electron packaging verifies encrypted local extension hook points', () => {
  const postBuild = read('../electron/_post_build.cjs');

  assert.match(postBuild, /extensions['"], ['"]runtimeHooks\.t8c/);
  assert.match(postBuild, /routes['"], ['"]figma\.t8c/);
  assert.match(postBuild, /utils['"], ['"]figmaBridge\.t8c/);
  assert.match(postBuild, /checkFigmaBridgeRuntime/);
  assert.match(postBuild, /tools['"], ['"]figma-bridge/);
  const packageJson = JSON.parse(read('../package.json'));
  const resources = packageJson.build.extraResources.map((item: any) => `${item.from}->${item.to}`);
  assert.ok(resources.includes('tools/figma-bridge->tools/figma-bridge'));
  const localHook = new URL('../local-private/extensions/build/post-build.cjs', import.meta.url);
  if (existsSync(localHook)) {
    const localPostBuild = read('../local-private/extensions/build/post-build.cjs');
    assert.match(localPostBuild, /zhenzhenGroups\.t8c/);
    assert.match(localPostBuild, /private New API group source must be encrypted/);
    assert.match(localPostBuild, /backend-enc['"], ['"]local-private/);
  }
});

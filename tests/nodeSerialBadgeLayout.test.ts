import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

test('NodeID badge anchors to the visible node card instead of the ReactFlow wrapper', () => {
  const canvasSource = readProjectFile('src/components/Canvas.tsx');
  const baseCss = readProjectFile('src/styles/index.css');
  const slamDunkCss = readProjectFile('src/styles/theme-slamdunk.css');

  assert.match(canvasSource, /useNodeSerialBadgeAnchor/);
  assert.match(canvasSource, /--t8-node-serial-anchor-left/);
  assert.match(canvasSource, /--t8-node-serial-anchor-top/);

  assert.match(baseCss, /left:\s*var\(--t8-node-serial-anchor-left,\s*100%\)/);
  assert.match(baseCss, /top:\s*var\(--t8-node-serial-anchor-top,\s*0px\)/);
  assert.match(baseCss, /right:\s*auto/);
  assert.match(baseCss, /--t8-node-serial-offset-x:\s*9px/);
  assert.match(baseCss, /--t8-node-serial-offset-y:\s*-10px/);

  assert.match(slamDunkCss, /--t8-node-serial-offset-x:\s*12px/);
  assert.match(slamDunkCss, /--t8-node-serial-offset-y:\s*-12px/);
});

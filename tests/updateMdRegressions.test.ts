import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('RunningHub local upload conversion accepts both input and output file URLs', () => {
  const proxy = read('../backend/src/routes/proxy.js');
  const runninghub = read('../src/components/nodes/RunningHubNode.tsx');

  assert.match(proxy, /url\.startsWith\('\/files\/output\/'\)/);
  assert.match(proxy, /url\.startsWith\('\/files\/input\/'\)/);
  assert.match(proxy, /path\.join\(config\.OUTPUT_DIR/);
  assert.match(proxy, /path\.join\(config\.INPUT_DIR/);
  assert.match(runninghub, /v\.startsWith\('\/files\/output\/'\)/);
  assert.match(runninghub, /v\.startsWith\('\/files\/input\/'\)/);
});

test('material context menu lets saved prompt templates choose or create categories', () => {
  const menu = read('../src/components/MaterialContextMenu.tsx');

  assert.match(menu, /getPromptTemplateCategories/);
  assert.match(menu, /getPromptTemplateCategoryLabel/);
  assert.match(menu, /promptCategoryId/);
  assert.match(menu, /createPromptTemplateCategory/);
  assert.match(menu, /新建模板分类/);
  assert.match(menu, /categoryId:\s*selectedPromptCategoryId/);
});

test('canvas exposes Figma send, placement shelf, and external file drag protocols', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const modal = read('../src/components/SendMaterialsModal.tsx');
  const api = read('../src/services/api.ts');
  const server = read('../backend/src/server.js');
  const figma = read('../backend/src/routes/figma.js');

  assert.match(server, /const figmaRouter = require\('\.\/routes\/figma'\)/);
  assert.match(server, /app\.use\('\/api\/figma', figmaRouter\)/);
  assert.match(api, /sendToFigma/);
  assert.match(modal, /onSendToFigma/);
  assert.match(modal, /发送到 Figma/);
  assert.match(canvas, /handleSendMaterialsToFigma/);
  assert.match(canvas, /<PlacementShelf/);
  assert.match(canvas, /DownloadURL/);
  assert.match(canvas, /registerPlacementShelfNodes/);
  assert.match(canvas, /movePlacementShelfNode/);
  assert.match(figma, /DEFAULT_FIGMA_BRIDGE_BASE/);
  assert.match(figma, /127\.0\.0\.1/);
});

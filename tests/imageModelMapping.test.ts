import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { IMAGE_MODELS } from '../src/providers/models.ts';

const imageNodeSource = fs.readFileSync(new URL('../src/components/nodes/ImageNode.tsx', import.meta.url), 'utf8');
const proxySource = fs.readFileSync(new URL('../backend/src/routes/proxy.js', import.meta.url), 'utf8');

test('Nano Banana 2 maps to the Gemini Flash image preview upstream model', () => {
  const banana2 = IMAGE_MODELS.find((model) => model.id === 'nano-banana-2');

  assert.equal(banana2?.apiModel, 'gemini-3.1-flash-image-preview');
  assert.equal(banana2?.apiModelOptions[0]?.value, 'gemini-3.1-flash-image-preview');
  assert.equal(banana2?.apiModelOptions[0]?.label, 'nano-banana-2 (Flash)');
  assert.equal(banana2?.paramKind, 'banana-ratio');
});

test('old saved nano-banana-2 apiModel values are not submitted as upstream model ids', () => {
  assert.match(imageNodeSource, /modelDef\.apiModelOptions\.some\(\(opt\) => opt\.value === savedApiModel\)/);
  assert.match(proxySource, /function normalizeImageApiModel\(model\)/);
  assert.match(proxySource, /raw === 'nano-banana-2'\) return 'gemini-3\.1-flash-image-preview'/);
});

test('Gemini Flash image preview still uses nano-banana key and image_size protocol', () => {
  assert.match(proxySource, /m\.includes\('flash-image-preview'\)\) return settings\.nanoBananaApiKey \|\| fb/);
  assert.match(proxySource, /function isBananaImageModel\(model\)/);
  assert.match(proxySource, /m\.includes\('flash-image-preview'\)/);
  assert.match(proxySource, /form\.append\('image_size', lvlUpper\)/);
  assert.match(proxySource, /body\.image_size = lvlUpper/);
});

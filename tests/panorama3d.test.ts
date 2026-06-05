import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PANORAMA_FIXED_PROMPT,
  buildPanoramaImageRequest,
  buildPanoramaPromptFinal,
  classifyPanoramaSeamScore,
  isLikelyPanoramaImage,
  panoramaRenderSize,
  prependPanoramaHistory,
  resolvePanoramaRatio,
  validatePanoramaGeneration,
} from '../src/utils/panorama3d.ts';

test('panorama 3d node is registered under the 3D category', () => {
  const registry = readFileSync(new URL('../src/config/nodeRegistry.ts', import.meta.url), 'utf8');
  const ports = readFileSync(new URL('../src/config/portTypes.ts', import.meta.url), 'utf8');
  const types = readFileSync(new URL('../src/types/canvas.ts', import.meta.url), 'utf8');
  const placement = readFileSync(new URL('../src/utils/nodePlacement.ts', import.meta.url), 'utf8');

  assert.match(registry, /type:\s*'panorama-3d'[\s\S]*label:\s*'3D全景'[\s\S]*category:\s*'3d'/);
  assert.match(registry, /'3d':\s*\{\s*label:\s*'3D'/);
  assert.match(ports, /'panorama-3d':\s*\{\s*inputs:\s*\['image'\],\s*outputs:\s*\['image'\]\s*\}/);
  assert.match(types, /\|\s*'panorama-3d'/);
  assert.match(types, /\|\s*'3d'/);
  assert.match(placement, /'panorama-3d':\s*\{\s*w:\s*760,\s*h:\s*900\s*\}/);
});

test('panorama 3d node uses bundled three dependency instead of importing public assets', () => {
  const source = readFileSync(new URL('../src/components/nodes/Panorama3DNode.tsx', import.meta.url), 'utf8');

  assert.match(source, /import\('three'\)/);
  assert.doesNotMatch(source, /\/vendor\/js\/three/);
  assert.doesNotMatch(source, /@vite-ignore/);
  assert.match(source, /if \(!autoRotate \|\| textureStatus !== 'ready'\)/);
});

test('panorama 3d node exposes built-in generation and resource actions', () => {
  const source = readFileSync(new URL('../src/components/nodes/Panorama3DNode.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../src/components/Canvas.tsx', import.meta.url), 'utf8');

  assert.match(source, /submitImageAsync/);
  assert.match(source, /queryImageStatus\(taskId,\s*'gpt-image-2'\)/);
  assert.match(source, /PANORAMA_FIXED_PROMPT/);
  assert.match(source, /连接预览/);
  assert.match(source, /文生全景/);
  assert.match(source, /图生全景/);
  assert.match(source, /panoramaSourceUrl:\s*url/);
  assert.match(source, /panoramaGeneratedUrl:\s*url/);
  assert.match(source, /imageUrls:\s*\[url\]/);
  assert.match(source, /addResourceItem/);
  assert.match(source, /getResourceCategories\('panorama'\)/);
  assert.match(source, /kind:\s*'panorama'/);
  assert.match(source, /estimatePanoramaImageQuality/);
  assert.match(source, /quality\.seamLabel/);
  assert.match(source, /quality\.seamScore/);
  assert.match(source, /'3D全景'/);
  assert.match(source, /generatedSourceUrl \|\| connectedSourceUrl \? 'preview' : 'text'/);
  assert.match(canvas, /'panorama-3d':\s*\{[\s\S]*panoramaRatio:\s*'ultrawide'/);
  assert.match(canvas, /'panorama-3d':\s*\{[\s\S]*panoramaGenerationMode:\s*'text'/);
  assert.match(canvas, /'panorama-3d':\s*\{[\s\S]*panoramaSizeLevel:\s*'1K'/);
});

test('panorama seam score classification gives actionable labels', () => {
  assert.deepEqual(classifyPanoramaSeamScore(96), {
    level: 'excellent',
    seamLabel: '接缝优秀',
    hint: '左右边缘像素差异很小，适合继续预览或入库。',
  });
  assert.equal(classifyPanoramaSeamScore(80).level, 'good');
  assert.equal(classifyPanoramaSeamScore(40).level, 'warning');
  assert.equal(classifyPanoramaSeamScore(null).level, 'unknown');
});

test('resolvePanoramaRatio returns presets and sanitized custom ratios', () => {
  assert.deepEqual(resolvePanoramaRatio('wide', 1, 1), { w: 16, h: 9 });
  assert.deepEqual(resolvePanoramaRatio('custom', 21, 9), { w: 21, h: 9 });
  assert.deepEqual(resolvePanoramaRatio('custom', -10, 'bad'), { w: 1, h: 9 });
});

test('panoramaRenderSize keeps the selected viewport aspect', () => {
  assert.deepEqual(panoramaRenderSize({ w: 16, h: 9 }), { width: 1536, height: 864 });
  assert.deepEqual(panoramaRenderSize({ w: 9, h: 16 }), { width: 864, height: 1536 });
  assert.deepEqual(panoramaRenderSize({ w: 1, h: 1 }, 1024), { width: 1024, height: 1024 });
});

test('isLikelyPanoramaImage detects names and 2:1 dimensions', () => {
  assert.equal(isLikelyPanoramaImage({ label: '展厅 360 全景图.png' }), true);
  assert.equal(isLikelyPanoramaImage({ url: '/output/panorama-room.png' }), true);
  assert.equal(isLikelyPanoramaImage({ width: 4096, height: 2048 }), true);
  assert.equal(isLikelyPanoramaImage({ width: 1024, height: 1024 }), false);
});

test('panorama generation prompt keeps the fixed 720 VR instruction', () => {
  const final = buildPanoramaPromptFinal('赛博朋克雨夜街巷');

  assert.equal(buildPanoramaPromptFinal(''), PANORAMA_FIXED_PROMPT);
  assert.match(final, new RegExp(PANORAMA_FIXED_PROMPT));
  assert.match(final, /赛博朋克雨夜街巷/);
});

test('panorama generation validation matches text and image modes', () => {
  assert.deepEqual(validatePanoramaGeneration({ mode: 'text', prompt: '' }), {
    ok: false,
    error: '文生全景需要填写场景提示词',
  });
  assert.deepEqual(validatePanoramaGeneration({ mode: 'image', prompt: '', referenceUrl: '' }), {
    ok: false,
    error: '图生全景需要上游图片或节点内参考图',
  });
  assert.deepEqual(validatePanoramaGeneration({ mode: 'image', referenceUrl: '/files/input/a.png' }), { ok: true });
});

test('panorama image request uses gpt-image-2 21:9 and size levels', () => {
  assert.deepEqual(buildPanoramaImageRequest({
    mode: 'text',
    prompt: '未来展厅',
    sizeLevel: '1K',
  }), {
    model: 'gpt-image-2',
    apiModel: 'gpt-image-2',
    paramKind: 'gpt-size',
    prompt: `${PANORAMA_FIXED_PROMPT}\n未来展厅`,
    aspectRatio: '21:9',
    aspect_ratio: '21:9',
    sizeLevel: '1K',
    image_size: '1K',
    images: [],
    n: 1,
  });
  assert.deepEqual(buildPanoramaImageRequest({
    mode: 'image',
    prompt: '',
    sizeLevel: '2K',
    referenceUrl: '/files/input/ref.png',
  }), {
    model: 'gpt-image-2',
    apiModel: 'gpt-image-2',
    paramKind: 'gpt-size',
    prompt: PANORAMA_FIXED_PROMPT,
    aspectRatio: '21:9',
    aspect_ratio: '21:9',
    sizeLevel: '2K',
    image_size: '2K',
    images: ['/files/input/ref.png'],
    n: 1,
  });
});

test('panorama generation history is newest-first and capped', () => {
  const base = [
    { url: '/old-1.png', mode: 'text', sizeLevel: '1K', prompt: 'a', promptFinal: 'a', createdAt: '1' },
    { url: '/old-2.png', mode: 'image', sizeLevel: '2K', prompt: 'b', promptFinal: 'b', createdAt: '2' },
    { url: '/old-3.png', mode: 'text', sizeLevel: '1K', prompt: 'c', promptFinal: 'c', createdAt: '3' },
  ];
  const next = prependPanoramaHistory(base, {
    url: '/new.png',
    mode: 'text',
    sizeLevel: '1K',
    prompt: 'n',
    promptFinal: 'n',
    createdAt: '4',
  });

  assert.deepEqual(next.map((item) => item.url), ['/new.png', '/old-1.png', '/old-2.png']);
});

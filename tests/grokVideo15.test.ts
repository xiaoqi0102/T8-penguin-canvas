import test from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_FAL_REGISTRY, VIDEO_MODELS } from '../src/providers/models.ts';

test('video model type order defaults to Grok Video then Veo 3.1 then Sora2', () => {
  const visibleVideoModels = VIDEO_MODELS.filter((model) => model.kind !== 'seedance');

  assert.deepEqual(
    visibleVideoModels.map((model) => model.label),
    ['Grok Video', 'Veo 3.1', 'Sora2'],
  );
  assert.equal(VIDEO_MODELS[0].kind, 'grok');
});

test('grok video tab defaults to Grok Video 1.5 FAL model', () => {
  const grok = VIDEO_MODELS.find((model) => model.kind === 'grok');

  assert.ok(grok);
  assert.equal(grok.apiModelOptions[0].value, 'grok-imagine-video-1.5');
});

test('Grok Video 1.5 uses the v1.5 image-to-video FAL endpoint with base64 images', () => {
  const fal = VIDEO_FAL_REGISTRY['grok-imagine-video-1.5'];

  assert.ok(fal);
  assert.equal(fal.paramKind, 'grok-fal');
  assert.equal(fal.endpoint, 'xai/grok-imagine-video/v1.5/image-to-video');
  assert.equal(fal.maxRefImages, 1);
  assert.equal(fal.defaultImageMode, 'base64');
});

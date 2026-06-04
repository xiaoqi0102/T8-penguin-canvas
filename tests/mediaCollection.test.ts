import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUploadDataFromItems,
  createUploadReplacementData,
} from '../src/utils/mediaCollection.ts';

test('createUploadReplacementData clears stale upload media fields when replacing kind', () => {
  const original = createUploadDataFromItems('image', [
    { kind: 'image', url: '/files/input/a.png', name: 'a.png', size: 100, mime: 'image/png' },
  ]);
  const replacement = createUploadReplacementData('video', [
    { kind: 'video', url: '/files/input/b.mp4', name: 'b.mp4', size: 200, mime: 'video/mp4' },
  ]);
  const merged = { ...original, ...replacement };

  assert.equal(merged.uploadType, 'video');
  assert.equal(merged.videoUrl, '/files/input/b.mp4');
  assert.deepEqual(merged.videoUrls, ['/files/input/b.mp4']);
  assert.equal(merged.imageUrl, undefined);
  assert.deepEqual(merged.imageUrls, []);
  assert.equal(merged.audioUrl, undefined);
  assert.deepEqual(merged.audioUrls, []);
  assert.equal(merged.fileName, 'b.mp4');
  assert.deepEqual(merged.fileNames, ['b.mp4']);
});

test('createUploadReplacementData preserves same-kind pasted collections', () => {
  const replacement = createUploadReplacementData('image', [
    { kind: 'image', url: '/files/input/a.png', name: 'a.png' },
    { kind: 'image', url: '/files/input/b.png', name: 'b.png' },
  ]);

  assert.equal(replacement.uploadType, 'image');
  assert.equal(replacement.imageUrl, '/files/input/a.png');
  assert.deepEqual(replacement.imageUrls, ['/files/input/a.png', '/files/input/b.png']);
  assert.deepEqual(replacement.fileNames, ['a.png', 'b.png']);
});

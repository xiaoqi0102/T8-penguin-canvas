import test from 'node:test';
import assert from 'node:assert/strict';
import { getCornerResizeBehavior, rightCenterHandleAnchor } from '../src/utils/nodeResizeBehavior.ts';

test('text nodes use free corner resizing while media nodes keep proportional resizing', () => {
  assert.equal(getCornerResizeBehavior('text').keepAspectRatio, false);
  assert.equal(getCornerResizeBehavior('upload').keepAspectRatio, true);
  assert.equal(getCornerResizeBehavior('output').keepAspectRatio, true);
  assert.equal(getCornerResizeBehavior('image').keepAspectRatio, true);
});

test('right-side output handle anchor follows independently changed text node dimensions', () => {
  assert.deepEqual(rightCenterHandleAnchor({ width: 420, height: 180 }), { x: 420, y: 90 });
  assert.deepEqual(rightCenterHandleAnchor({ width: 300, height: 260 }), { x: 300, y: 130 });
});

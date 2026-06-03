import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boardPointToImageFraction,
  closeCutoutPath,
  imageFractionToBoardPoint,
  isValidCutoutPath,
  simplifyCutoutPath,
} from '../src/utils/drawingBoardCutout.ts';

test('closeCutoutPath closes only valid polygons and keeps short drafts open', () => {
  assert.deepEqual(closeCutoutPath([{ x: 1, y: 2 }, { x: 3, y: 4 }]), [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);

  assert.deepEqual(closeCutoutPath([{ x: 1, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 8 }]), [
    { x: 1, y: 2 },
    { x: 5, y: 2 },
    { x: 5, y: 8 },
    { x: 1, y: 2 },
  ]);
});

test('simplifyCutoutPath removes near-collinear lasso noise without losing endpoints', () => {
  const simplified = simplifyCutoutPath(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0.05 },
      { x: 2, y: 0 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 0 },
    ],
    0.2,
  );

  assert.deepEqual(simplified, [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
    { x: 0, y: 0 },
  ]);
});

test('image fraction mapping respects rotated image elements', () => {
  const image = { x: 100, y: 100, w: 200, h: 100, rotation: 90 };
  const boardPoint = imageFractionToBoardPoint({ x: 0.5, y: 0 }, image);
  assert.ok(Math.abs(boardPoint.x - 250) < 1e-6);
  assert.ok(Math.abs(boardPoint.y - 150) < 1e-6);

  const fraction = boardPointToImageFraction(boardPoint, image);
  assert.ok(Math.abs(fraction.x - 0.5) < 1e-6);
  assert.ok(Math.abs(fraction.y - 0) < 1e-6);
});

test('isValidCutoutPath rejects tiny or degenerate selections', () => {
  assert.equal(isValidCutoutPath([{ x: 0, y: 0 }, { x: 1, y: 1 }]), false);
  assert.equal(isValidCutoutPath([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]), false);
  assert.equal(isValidCutoutPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), true);
});

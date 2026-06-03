import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boardPointFromClientPoint,
  clampBoardZoom,
  fitBoardViewport,
  scaledBoardSize,
  zoomBoardViewport,
} from '../src/utils/drawingBoardViewport.ts';

test('fitBoardViewport preserves board ratio inside a bounded editor area', () => {
  assert.deepEqual(fitBoardViewport({ boardW: 1600, boardH: 900, maxW: 800, maxH: 600 }), {
    w: 800,
    h: 450,
    scale: 0.5,
  });

  assert.deepEqual(fitBoardViewport({ boardW: 600, boardH: 1200, maxW: 1000, maxH: 700 }), {
    w: 350,
    h: 700,
    scale: 7 / 12,
  });
});

test('zoomBoardViewport and scaledBoardSize clamp extreme zoom values', () => {
  assert.equal(clampBoardZoom(0.01), 0.15);
  assert.equal(clampBoardZoom(8), 4);
  assert.deepEqual(zoomBoardViewport({ boardW: 1000, boardH: 500, zoom: 0.5 }), { w: 500, h: 250, scale: 0.5 });
  assert.deepEqual(scaledBoardSize(1000, 500, 2), { w: 2000, h: 1000 });
});

test('boardPointFromClientPoint maps zoomed canvas coordinates back to board space', () => {
  const point = boardPointFromClientPoint({
    clientX: 500,
    clientY: 350,
    rectLeft: 100,
    rectTop: 50,
    rectWidth: 800,
    rectHeight: 600,
    boardW: 1600,
    boardH: 1200,
  });
  assert.deepEqual(point, { x: 800, y: 600 });

  const clamped = boardPointFromClientPoint({
    clientX: -20,
    clientY: 9999,
    rectLeft: 100,
    rectTop: 50,
    rectWidth: 800,
    rectHeight: 600,
    boardW: 1600,
    boardH: 1200,
  });
  assert.deepEqual(clamped, { x: 0, y: 1200 });
});

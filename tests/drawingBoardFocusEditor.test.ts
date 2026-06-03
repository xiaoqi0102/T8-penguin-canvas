import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/nodes/DrawingBoardNode.tsx', 'utf8');

test('drawing board focus editor repaints its portal canvas when opened', () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{[\s\S]*paintCanvas\(canvasRef\.current, previewSize\)[\s\S]*if \(focusEditorOpen\)[\s\S]*paintCanvas\(focusCanvasRef\.current, focusStageSize\)[\s\S]*\}, \[focusEditorOpen, focusStageSize, paintCanvas, previewSize\]\)/,
  );
});

test('drawing board focus editor paints immediately when the portal canvas ref mounts', () => {
  assert.match(
    source,
    /const handleFocusCanvasRef = useCallback\(\(canvas: HTMLCanvasElement \| null\) => \{[\s\S]*focusCanvasRef\.current = canvas[\s\S]*if \(canvas\) paintCanvas\(canvas, focusStageSize\)[\s\S]*\}, \[focusStageSize, paintCanvas\]\);/,
  );
  assert.match(source, /ref=\{handleFocusCanvasRef\}/);
});

test('drawing board focus editor uses the full layer manager controls', () => {
  assert.match(
    source,
    /const renderLayerPanel = \(variant: 'inline' \| 'focus'\) => \([\s\S]*addLayerGroup[\s\S]*startLayerDrag\(e, layer\)[\s\S]*moveLayerToGroup\(layerId, layer\.id\)[\s\S]*toggleLayerFlag\(layer\.id, 'hidden'\)[\s\S]*toggleLayerFlag\(layer\.id, 'locked'\)[\s\S]*toggleGroupCollapsed\(layer\.id\)[\s\S]*\);/,
  );
  assert.match(source, /renderLayerPanel\('focus'\)/);
  assert.match(source, /renderLayerPanel\('inline'\)/);
});

test('drawing board focus editor paints with a zoom-aware backing canvas', () => {
  assert.match(source, /paintCanvas\(canvasRef\.current, previewSize\)/);
  assert.match(source, /paintCanvas\(focusCanvasRef\.current, focusStageSize\)/);
  assert.match(source, /canvas\.width = Math\.max\(1, Math\.round\(displaySize\.w \* pixelRatio\)\)/);
  assert.match(source, /ctx\.setTransform\(canvas\.width \/ boardW, 0, 0, canvas\.height \/ boardH, 0, 0\)/);
  assert.match(source, /ctx\.imageSmoothingQuality = 'high'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNodeAlignment } from '../src/utils/nodeAlign.ts';

function node(id: string, x: number, y: number, w = 100, h = 80, type = 'text'): any {
  return {
    id,
    type,
    position: { x, y },
    measured: { width: w, height: h },
    data: { label: id },
  };
}

test('applyNodeAlignment aligns selected nodes without touching data or ids', () => {
  const nodes = [
    node('a', 20, 30, 100, 80),
    node('b', 240, 90, 160, 100),
    node('c', 500, 500, 120, 90),
  ];
  const result = applyNodeAlignment(nodes, ['a', 'b'], 'align-right');

  assert.equal(result.changed, true);
  assert.deepEqual(result.movedIds.sort(), ['a']);
  assert.equal(result.nodes[0].id, 'a');
  assert.deepEqual(result.nodes[0].data, { label: 'a' });
  assert.deepEqual(result.nodes[0].position, { x: 300, y: 30 });
  assert.deepEqual(result.nodes[1].position, { x: 240, y: 90 });
  assert.strictEqual(result.nodes[2], nodes[2]);
});

test('applyNodeAlignment distributes horizontal spacing while preserving edge nodes', () => {
  const nodes = [
    node('a', 0, 0, 100, 80),
    node('b', 240, 40, 100, 80),
    node('c', 500, 70, 100, 80),
  ];
  const result = applyNodeAlignment(nodes, ['a', 'b', 'c'], 'distribute-x');

  assert.deepEqual(result.nodes.map((n: any) => n.position.x), [0, 250, 500]);
  assert.deepEqual(result.nodes.map((n: any) => n.position.y), [0, 40, 70]);
});

test('applyNodeAlignment expands crowded distribution instead of overlapping centers', () => {
  const nodes = [
    node('a', 0, 0, 180, 80),
    node('b', 80, 40, 180, 80),
    node('c', 160, 70, 180, 80),
  ];
  const result = applyNodeAlignment(nodes, ['a', 'b', 'c'], 'distribute-x', { alignGap: 32 });

  assert.deepEqual(result.nodes.map((n: any) => n.position.x), [0, 212, 424]);
  assert.deepEqual(result.nodes.map((n: any) => n.position.y), [0, 40, 70]);
});

test('applyNodeAlignment snaps selected nodes to the configured grid', () => {
  const nodes = [
    node('a', 13, 17, 100, 80),
    node('b', 247, 93, 100, 80),
  ];
  const result = applyNodeAlignment(nodes, ['a', 'b'], 'snap-grid', { grid: [20, 20] });

  assert.deepEqual(result.nodes[0].position, { x: 20, y: 20 });
  assert.deepEqual(result.nodes[1].position, { x: 240, y: 100 });
});

test('applyNodeAlignment avoids stacking same-row nodes on vertical alignment actions', () => {
  const nodes = [
    node('a', 0, 100, 120, 90),
    node('b', 240, 100, 120, 90),
    node('c', 480, 100, 120, 90),
  ];
  for (const action of ['align-left', 'align-center-x', 'align-right'] as const) {
    const result = applyNodeAlignment(nodes, ['a', 'b', 'c'], action, { alignGap: 32 });
    const positions = result.nodes.map((n: any) => n.position);
    assert.deepEqual(positions.map((p: any) => p.y), [100, 222, 344]);
    assert.equal(new Set(positions.map((p: any) => Math.round(p.x))).size, 1);
  }
});

test('applyNodeAlignment avoids stacking same-column nodes on horizontal alignment actions', () => {
  const nodes = [
    node('a', 100, 0, 120, 90),
    node('b', 100, 180, 120, 90),
    node('c', 100, 360, 120, 90),
  ];
  for (const action of ['align-top', 'align-center-y', 'align-bottom'] as const) {
    const result = applyNodeAlignment(nodes, ['a', 'b', 'c'], action, { alignGap: 32 });
    const positions = result.nodes.map((n: any) => n.position);
    assert.deepEqual(positions.map((p: any) => p.x), [100, 252, 404]);
    assert.equal(new Set(positions.map((p: any) => Math.round(p.y))).size, 1);
  }
});

test('applyNodeAlignment ignores group boxes when regular nodes are aligned together', () => {
  const nodes = [
    {
      ...node('group', -40, -60, 700, 500, 'groupBox'),
      data: { memberIds: ['a', 'b'], width: 700, height: 500 },
    },
    node('a', 0, 100, 120, 90),
    node('b', 240, 100, 120, 90),
  ];
  const result = applyNodeAlignment(nodes, ['group', 'a', 'b'], 'align-left', { alignGap: 32 });

  assert.deepEqual(result.nodes.find((n: any) => n.id === 'group')?.position, { x: -40, y: -60 });
  assert.deepEqual(result.nodes.find((n: any) => n.id === 'a')?.position, { x: 0, y: 100 });
  assert.deepEqual(result.nodes.find((n: any) => n.id === 'b')?.position, { x: 0, y: 222 });
});

test('applyNodeAlignment arranges selected nodes into a compact visual grid', () => {
  const nodes = [
    node('a', 300, 20, 100, 80),
    node('b', 20, 30, 100, 80),
    node('c', 160, 220, 100, 80),
    node('d', 520, 260, 100, 80),
  ];
  const result = applyNodeAlignment(nodes, ['a', 'b', 'c', 'd'], 'arrange-grid', { gridGap: 40 });

  assert.deepEqual(result.nodes.find((n: any) => n.id === 'b')?.position, { x: 20, y: 20 });
  assert.deepEqual(result.nodes.find((n: any) => n.id === 'a')?.position, { x: 160, y: 20 });
  assert.deepEqual(result.nodes.find((n: any) => n.id === 'c')?.position, { x: 20, y: 140 });
  assert.deepEqual(result.nodes.find((n: any) => n.id === 'd')?.position, { x: 160, y: 140 });
});

test('applyNodeAlignment moves group members when only the group box is aligned', () => {
  const nodes = [
    {
      ...node('group', 13, 17, 400, 300, 'groupBox'),
      data: { memberIds: ['a'], width: 400, height: 300 },
    },
    node('a', 80, 90, 100, 80),
    node('b', 300, 90, 100, 80),
  ];
  const result = applyNodeAlignment(nodes, ['group'], 'snap-grid', { grid: [20, 20] });

  assert.deepEqual(result.nodes.find((n: any) => n.id === 'group')?.position, { x: 20, y: 20 });
  assert.deepEqual(result.nodes.find((n: any) => n.id === 'a')?.position, { x: 87, y: 93 });
  assert.deepEqual(result.nodes.find((n: any) => n.id === 'b')?.position, { x: 300, y: 90 });
});

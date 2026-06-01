import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge, Node } from '@xyflow/react';
import {
  assignFreshNodeSerials,
  getNodeSerialId,
  normalizeCanvasNodeSerials,
  parseNodeSerialInput,
} from '../src/utils/nodeSerialIds.ts';
import { resolveConnectionByNodeSerialId } from '../src/utils/connectByNodeSerialId.ts';

function serials(nodes: Node[]): Array<number | null> {
  return nodes.map((node) => getNodeSerialId(node));
}

test('normalizeCanvasNodeSerials assigns legacy nodes from one and advances the counter', () => {
  const result = normalizeCanvasNodeSerials([
    { id: 'a', type: 'text', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', type: 'image', position: { x: 120, y: 0 }, data: {} },
    { id: 'c', type: 'output', position: { x: 240, y: 0 }, data: {} },
  ] as Node[]);

  assert.deepEqual(serials(result.nodes), [1, 2, 3]);
  assert.equal(result.nextNodeSerialId, 4);
  assert.equal(result.changed, true);
});

test('normalizeCanvasNodeSerials preserves valid ids and fixes duplicates without reusing older numbers', () => {
  const result = normalizeCanvasNodeSerials([
    { id: 'a', type: 'text', position: { x: 0, y: 0 }, data: { nodeSerialId: 2 } },
    { id: 'b', type: 'image', position: { x: 120, y: 0 }, data: { nodeSerialId: 2 } },
    { id: 'c', type: 'output', position: { x: 240, y: 0 }, data: {} },
  ] as Node[], 5);

  assert.deepEqual(serials(result.nodes), [2, 5, 6]);
  assert.equal(result.nextNodeSerialId, 7);
  assert.equal(result.changed, true);
});

test('assignFreshNodeSerials gives copied or sent nodes target-canvas ids', () => {
  const existing = [
    { id: 'existing-a', type: 'text', position: { x: 0, y: 0 }, data: { nodeSerialId: 1 } },
    { id: 'existing-b', type: 'image', position: { x: 120, y: 0 }, data: { nodeSerialId: 3 } },
  ] as Node[];
  const incoming = [
    { id: 'copy-a', type: 'text', position: { x: 0, y: 0 }, data: { nodeSerialId: 1 } },
    { id: 'copy-b', type: 'image', position: { x: 120, y: 0 }, data: { nodeSerialId: 99 } },
  ] as Node[];

  const result = assignFreshNodeSerials(incoming, existing, 6);

  assert.deepEqual(serials(result.nodes), [6, 7]);
  assert.equal(result.nextNodeSerialId, 8);
});

test('parseNodeSerialInput accepts compact numeric ids', () => {
  assert.equal(parseNodeSerialInput('12'), 12);
  assert.equal(parseNodeSerialInput('#12'), 12);
  assert.equal(parseNodeSerialInput('  #0012  '), 12);
  assert.equal(parseNodeSerialInput('abc'), null);
  assert.equal(parseNodeSerialInput('0'), null);
});

test('resolveConnectionByNodeSerialId connects from a dragged input or output side', () => {
  const nodes = [
    { id: 'text-a', type: 'text', position: { x: 0, y: 0 }, data: { nodeSerialId: 1 } },
    { id: 'image-b', type: 'image', position: { x: 120, y: 0 }, data: { nodeSerialId: 2 } },
  ] as Node[];

  assert.deepEqual(
    resolveConnectionByNodeSerialId({
      nodes,
      edges: [],
      fromNodeId: 'text-a',
      fromHandleType: 'source',
      nodeSerialInput: '2',
    }),
    {
      ok: true,
      connection: { source: 'text-a', sourceHandle: null, target: 'image-b', targetHandle: null },
    },
  );

  assert.deepEqual(
    resolveConnectionByNodeSerialId({
      nodes,
      edges: [],
      fromNodeId: 'image-b',
      fromHandleType: 'target',
      nodeSerialInput: '#1',
    }),
    {
      ok: true,
      connection: { source: 'text-a', sourceHandle: null, target: 'image-b', targetHandle: null },
    },
  );
});

test('resolveConnectionByNodeSerialId reports bad id, missing node, duplicate, and incompatible ports', () => {
  const nodes = [
    { id: 'text-a', type: 'text', position: { x: 0, y: 0 }, data: { nodeSerialId: 1 } },
    { id: 'image-b', type: 'image', position: { x: 120, y: 0 }, data: { nodeSerialId: 2 } },
    { id: 'upload-c', type: 'upload', position: { x: 240, y: 0 }, data: { nodeSerialId: 3 } },
  ] as Node[];
  const edges = [{ id: 'existing', source: 'text-a', target: 'image-b' }] as Edge[];

  assert.equal(resolveConnectionByNodeSerialId({
    nodes,
    edges: [],
    fromNodeId: 'text-a',
    fromHandleType: 'source',
    nodeSerialInput: 'abc',
  }).reason, 'invalid-id');
  assert.equal(resolveConnectionByNodeSerialId({
    nodes,
    edges: [],
    fromNodeId: 'text-a',
    fromHandleType: 'source',
    nodeSerialInput: '99',
  }).reason, 'not-found');
  assert.equal(resolveConnectionByNodeSerialId({
    nodes,
    edges,
    fromNodeId: 'text-a',
    fromHandleType: 'source',
    nodeSerialInput: '2',
  }).reason, 'duplicate');
  assert.equal(resolveConnectionByNodeSerialId({
    nodes,
    edges: [],
    fromNodeId: 'text-a',
    fromHandleType: 'source',
    nodeSerialInput: '3',
  }).reason, 'incompatible');
});

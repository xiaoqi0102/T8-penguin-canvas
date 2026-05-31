import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge, Node } from '@xyflow/react';
import {
  buildSendNodeFragment,
  instantiateSendNodeFragment,
  summarizeSendNodeFragment,
} from '../src/utils/sendNodeFragment.ts';

test('buildSendNodeFragment keeps selected nodes and only their internal edges', () => {
  const selectedNodes = [
    { id: 'a', type: 'text', position: { x: 100, y: 200 }, data: { text: 'A' } },
    { id: 'b', type: 'image', position: { x: 420, y: 200 }, data: { prompt: 'B' } },
    { id: 'c', type: 'output', position: { x: 760, y: 260 }, data: { imageUrl: '/files/output/c.png' } },
  ] as Node[];
  const allEdges = [
    { id: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'bc', source: 'b', target: 'c' },
    { id: 'outside', source: 'c', target: 'not-selected' },
  ] as Edge[];

  const fragment = buildSendNodeFragment(selectedNodes, allEdges, 'canvas-a');

  assert.equal(fragment.sourceCanvasId, 'canvas-a');
  assert.deepEqual(fragment.nodes.map((node) => node.id), ['a', 'b', 'c']);
  assert.deepEqual(fragment.edges.map((edge) => edge.id), ['ab', 'bc']);
  assert.equal(summarizeSendNodeFragment(fragment), '3 节点 · 2 连线');
});

test('instantiateSendNodeFragment remaps edge endpoints and preserves relative layout', () => {
  const fragment = buildSendNodeFragment(
    [
      { id: 'a', type: 'text', position: { x: 100, y: 200 }, selected: true, data: { text: 'A' } },
      { id: 'b', type: 'image', position: { x: 420, y: 260 }, selected: true, data: { prompt: 'B' } },
    ] as Node[],
    [{ id: 'ab', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in', selected: true }] as Edge[],
    'canvas-a',
  );

  const cloned = instantiateSendNodeFragment(fragment, [], { x: 1000, y: 500 }, {
    idFactory: (node) => `copy-${node.id}`,
    edgeIdFactory: (edge) => `copy-${edge.id}`,
  });

  assert.deepEqual(cloned.nodes.map((node) => node.id), ['copy-a', 'copy-b']);
  assert.deepEqual(
    cloned.nodes.map((node) => node.position),
    [
      { x: 1000, y: 500 },
      { x: 1320, y: 560 },
    ],
  );
  assert.equal(cloned.nodes.every((node) => node.selected === true), true);
  assert.deepEqual(cloned.edges, [
    {
      id: 'copy-ab',
      source: 'copy-a',
      target: 'copy-b',
      sourceHandle: 'out',
      targetHandle: 'in',
      selected: false,
    },
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Edge, Node } from '@xyflow/react';
import { buildSendNodeFragment } from '../src/utils/sendNodeFragment.ts';
import {
  createWorkflowResourceManifest,
  createWorkflowTopologyPreview,
  resourceItemToWorkflowFragment,
  summarizeWorkflowResource,
} from '../src/utils/workflowResource.ts';

test('createWorkflowResourceManifest preserves selected nodes and internal edges', () => {
  const fragment = buildSendNodeFragment(
    [
      { id: 'text-a', type: 'text', position: { x: 100, y: 120 }, data: { text: 'A' } },
      { id: 'image-b', type: 'image', position: { x: 460, y: 140 }, data: { prompt: 'B' } },
    ] as Node[],
    [{ id: 'ab', source: 'text-a', target: 'image-b', sourceHandle: 'out', targetHandle: 'in' }] as Edge[],
    'canvas-a',
  );

  const manifest = createWorkflowResourceManifest(fragment, { title: '图生图流程' });

  assert.equal(manifest.schema, 't8-workflow-fragment');
  assert.equal(manifest.title, '图生图流程');
  assert.equal(manifest.nodeCount, 2);
  assert.equal(manifest.edgeCount, 1);
  assert.deepEqual(manifest.nodes.map((node) => node.id), ['text-a', 'image-b']);
  assert.deepEqual(manifest.edges.map((edge) => edge.id), ['ab']);
});

test('createWorkflowResourceManifest rejects empty workflow fragments', () => {
  assert.throws(
    () => createWorkflowResourceManifest({ nodes: [], edges: [] }, { title: '空流程' }),
    /至少选择 1 个节点/,
  );
});

test('resourceItemToWorkflowFragment restores manifest embedded on resource item', () => {
  const fragment = buildSendNodeFragment(
    [{ id: 'llm-a', type: 'llm', position: { x: 0, y: 0 }, data: { prompt: 'hello' } }] as Node[],
    [] as Edge[],
    'canvas-a',
  );
  const manifest = createWorkflowResourceManifest(fragment, { title: 'LLM 小流程' });

  const restored = resourceItemToWorkflowFragment({
    id: 'reswf_1',
    kind: 'workflow',
    title: 'LLM 小流程',
    workflowFragment: manifest,
  } as any);

  assert.equal(restored?.nodes.length, 1);
  assert.equal(restored?.nodes[0].id, 'llm-a');
  assert.equal(summarizeWorkflowResource({ workflowNodeCount: 1, workflowEdgeCount: 0 } as any), '1 节点');
});

test('createWorkflowTopologyPreview normalizes node positions and preserves edge direction', () => {
  const fragment = buildSendNodeFragment(
    [
      { id: 'out-a', type: 'output', position: { x: 120, y: 100 }, data: { label: '姿势输出' } },
      { id: 'image-b', type: 'image', position: { x: 440, y: 140 }, data: { label: '生成图像' } },
      { id: 'out-c', type: 'output', position: { x: 780, y: 160 }, data: { label: '成品输出' } },
    ] as Node[],
    [
      { id: 'ab', source: 'out-a', target: 'image-b', sourceHandle: 'out', targetHandle: 'in' },
      { id: 'bc', source: 'image-b', target: 'out-c', sourceHandle: 'out', targetHandle: 'in' },
    ] as Edge[],
    'canvas-a',
  );

  const preview = createWorkflowTopologyPreview(fragment);

  assert.equal(preview.nodes.length, 3);
  assert.equal(preview.edges.length, 2);
  assert.deepEqual(preview.edges.map((edge) => [edge.source, edge.target]), [['out-a', 'image-b'], ['image-b', 'out-c']]);
  assert.ok(preview.nodes.every((node) => node.x >= 8 && node.x <= 92 && node.y >= 12 && node.y <= 88));
  assert.deepEqual(preview.nodes.map((node) => node.type), ['output', 'image', 'output']);
});

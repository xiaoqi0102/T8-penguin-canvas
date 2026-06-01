import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseDefaultSendMode,
  coerceHistorySendMode,
  resolveEffectiveSendMode,
} from '../src/utils/sendMode.ts';

test('connected multi-node selections default to node fragment even when materials exist', () => {
  const mode = chooseDefaultSendMode({
    selectedNodeTypes: ['output', 'image', 'output'],
    nodeCount: 3,
    edgeCount: 2,
    materialCount: 3,
  });

  assert.equal(mode, 'node-fragment');
});

test('auto mode preserves a connected workflow before falling back to material output', () => {
  const mode = resolveEffectiveSendMode({
    requestedMode: 'auto',
    defaultMode: 'output',
    nodeCount: 3,
    edgeCount: 2,
    materialCount: 3,
  });

  assert.equal(mode, 'node-fragment');
});

test('manual non-fragment mode remains available for deliberate material extraction', () => {
  const mode = resolveEffectiveSendMode({
    requestedMode: 'output',
    defaultMode: 'node-fragment',
    nodeCount: 3,
    edgeCount: 2,
    materialCount: 3,
  });

  assert.equal(mode, 'output');
});

test('send history does not override connected workflow selections with material modes', () => {
  const mode = coerceHistorySendMode({
    historyMode: 'output',
    nodeCount: 3,
    edgeCount: 2,
  });

  assert.equal(mode, null);
});

test('single output node still defaults to output material mode', () => {
  const mode = chooseDefaultSendMode({
    selectedNodeTypes: ['output'],
    nodeCount: 1,
    edgeCount: 0,
    materialCount: 2,
  });

  assert.equal(mode, 'output');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  areRhParamValuesEqual,
  applyRhTextBindings,
  findRhTextMaterialForField,
  normalizeRhNodeId,
  rhParamKey,
} from '../src/utils/rhTextBinding.ts';

const textMaterial = (id: string, text: string, rhNodeId?: string) => ({
  id,
  kind: 'text' as const,
  url: text,
  sourceNodeId: id,
  origin: 'upstream' as const,
  label: text,
  rhNodeId,
});

test('normalizeRhNodeId accepts compact numeric RH node ids only', () => {
  assert.equal(normalizeRhNodeId(' 30 '), '30');
  assert.equal(normalizeRhNodeId(7), '7');
  assert.equal(normalizeRhNodeId('abc'), '');
  assert.equal(normalizeRhNodeId('-1'), '');
});

test('findRhTextMaterialForField binds a unique upstream text by RH node id', () => {
  const field = { nodeId: '30', fieldName: 'prompt', fieldType: 'TEXT' };
  const match = findRhTextMaterialForField(field, [
    textMaterial('text-a', 'first', '12'),
    textMaterial('text-b', 'bound prompt', '30'),
  ]);

  assert.equal(match.status, 'matched');
  assert.equal(match.material?.url, 'bound prompt');
});

test('findRhTextMaterialForField refuses duplicate RH node id bindings and non-text RH fields', () => {
  const duplicate = findRhTextMaterialForField(
    { nodeId: '30', fieldName: 'prompt', fieldType: 'TEXT' },
    [textMaterial('a', 'one', '30'), textMaterial('b', 'two', '30')],
  );
  assert.equal(duplicate.status, 'conflict');

  const wrongType = findRhTextMaterialForField(
    { nodeId: '30', fieldName: 'image', fieldType: 'IMAGE' },
    [textMaterial('a', 'one', '30')],
  );
  assert.equal(wrongType.status, 'not-text-field');
});

test('applyRhTextBindings fills matching text fields without overriding user-disabled fields', () => {
  const fields = [
    { nodeId: '30', fieldName: 'prompt', fieldType: 'TEXT' },
    { nodeId: '31', fieldName: 'note', fieldType: 'STRING' },
    { nodeId: '32', fieldName: 'image', fieldType: 'IMAGE' },
  ];
  const values = {
    [rhParamKey('31', 'note')]: { value: 'manual', sourceFromUpstream: false },
  };

  const next = applyRhTextBindings(fields, [textMaterial('txt-30', 'hello RH', '30'), textMaterial('txt-31', 'blocked', '31')], values);

  assert.deepEqual(next[rhParamKey('30', 'prompt')], {
    value: 'hello RH',
    sourceFromUpstream: true,
    sourceMaterialId: 'txt-30',
    sourceRhNodeId: '30',
  });
  assert.deepEqual(next[rhParamKey('31', 'note')], {
    value: 'manual',
    sourceFromUpstream: false,
  });
  assert.equal(next[rhParamKey('32', 'image')], undefined);
});

test('areRhParamValuesEqual compares RH binding metadata as well as values', () => {
  assert.equal(
    areRhParamValuesEqual(
      { a: { value: 'x', sourceFromUpstream: true, sourceMaterialId: 'm1', sourceRhNodeId: '30' } },
      { a: { value: 'x', sourceFromUpstream: true, sourceMaterialId: 'm1', sourceRhNodeId: '30' } },
    ),
    true,
  );
  assert.equal(
    areRhParamValuesEqual(
      { a: { value: 'x', sourceFromUpstream: true, sourceMaterialId: 'm1', sourceRhNodeId: '30' } },
      { a: { value: 'x', sourceFromUpstream: true, sourceMaterialId: 'm2', sourceRhNodeId: '30' } },
    ),
    false,
  );
});

test('RH text binding UI is wired into text and RH nodes', () => {
  const textNode = readFileSync(new URL('../src/components/nodes/TextNode.tsx', import.meta.url), 'utf8');
  const runningHubNode = readFileSync(new URL('../src/components/nodes/RunningHubNode.tsx', import.meta.url), 'utf8');
  const rhToolsNode = readFileSync(new URL('../src/components/nodes/RHToolsNode.tsx', import.meta.url), 'utf8');

  assert.match(textNode, /rhNodeId/);
  assert.match(runningHubNode, /applyRhTextBindings/);
  assert.match(runningHubNode, /texts=\{orderedTexts\}/);
  assert.match(rhToolsNode, /applyRhTextBindings/);
  assert.match(rhToolsNode, /texts=\{orderedTexts\}/);
});

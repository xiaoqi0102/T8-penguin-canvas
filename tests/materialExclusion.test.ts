import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countExcludedMaterials,
  excludeMaterialId,
  filterExcludedMaterials,
  pruneExcludedMaterialIds,
} from '../src/utils/materialExclusion.ts';

const materials = [
  { id: 'node-a::image:1', url: '/files/input/a.png' },
  { id: 'node-a::image:2', url: '/files/input/b.png' },
  { id: 'node-b::text:1', url: 'prompt text' },
];

test('filterExcludedMaterials removes only the ids excluded for the current node', () => {
  assert.deepEqual(
    filterExcludedMaterials(materials, ['node-a::image:2']).map((m) => m.id),
    ['node-a::image:1', 'node-b::text:1'],
  );
});

test('excludeMaterialId keeps ids unique and prune removes stale ids', () => {
  const excluded = excludeMaterialId(['node-a::image:2'], 'node-a::image:2');
  assert.deepEqual(excluded, ['node-a::image:2']);

  const nextExcluded = excludeMaterialId(excluded, 'node-b::text:1');
  assert.deepEqual(nextExcluded, ['node-a::image:2', 'node-b::text:1']);
  assert.deepEqual(pruneExcludedMaterialIds(nextExcluded, materials.slice(0, 2)), ['node-a::image:2']);
});

test('countExcludedMaterials ignores unknown saved ids', () => {
  assert.equal(countExcludedMaterials(['node-a::image:1', 'missing'], materials), 1);
});

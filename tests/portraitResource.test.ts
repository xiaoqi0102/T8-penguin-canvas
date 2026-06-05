import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResourceItem } from '../src/services/api.ts';
import { PORTRAIT_GROUPS } from '../src/data/portraitMasterOptions.ts';
import { PORTRAIT_ADVANCED_GROUPS } from '../src/data/portraitMasterAdvancedOptions.ts';
import { isPortraitResourceItem, portraitResourceToNodeData } from '../src/utils/portraitResource.ts';

function firstSelection(groups: typeof PORTRAIT_GROUPS) {
  const group = groups.find((item) => item.options.length > 0)!;
  return { [group.id]: group.options[0].id };
}

test('portrait resource items are detected inside text material sets', () => {
  const backup = {
    schema: 't8-portrait-master',
    version: 2,
    title: '角色 A',
    selection: firstSelection(PORTRAIT_GROUPS),
    locks: {},
    weights: {},
    customText: 'soft studio lighting',
    language: 'en',
    prompt: 'placeholder',
    exportedAt: new Date().toISOString(),
  };

  const item = {
    kind: 'set',
    materialSetKind: 'text',
    materialSetItems: [{ kind: 'text', text: JSON.stringify(backup), name: '角色 A.portrait.json' }],
  } as ResourceItem;

  assert.equal(isPortraitResourceItem(item), true);
  assert.equal(isPortraitResourceItem({ ...item, materialSetItems: [{ kind: 'text', text: 'plain text' }] } as any), false);
});

test('portrait resources restore advanced fields to node data', () => {
  const selection = firstSelection(PORTRAIT_GROUPS);
  const advancedSelection = firstSelection(PORTRAIT_ADVANCED_GROUPS as any);
  const backup = {
    schema: 't8-portrait-master',
    version: 2,
    title: '隐藏角色',
    selection,
    locks: { [Object.keys(selection)[0]]: true },
    weights: { [Object.keys(selection)[0]]: 1.4 },
    advancedSelection,
    advancedLocks: { [Object.keys(advancedSelection)[0]]: true },
    advancedWeights: { [Object.keys(advancedSelection)[0]]: 1.2 },
    customText: 'cinematic portrait',
    language: 'en',
    prompt: 'placeholder',
    exportedAt: new Date().toISOString(),
  };
  const item = {
    id: 'resset_portrait',
    kind: 'set',
    title: '隐藏角色 · 肖像配置',
    materialSetKind: 'text',
    materialSetItems: [{ kind: 'text', text: JSON.stringify(backup), name: '隐藏角色.portrait.json' }],
  } as ResourceItem;

  const data = portraitResourceToNodeData(item);

  assert.ok(data);
  assert.deepEqual(data?.portraitSelection, selection);
  assert.deepEqual(data?.portraitAdvancedSelection, advancedSelection);
  assert.equal(data?.portraitAdvancedLocks[Object.keys(advancedSelection)[0]], true);
  assert.equal(data?.portraitAdvancedEnabled, true);
  assert.equal(data?.yyhPortraitHidden, true);
  assert.match(data?.prompt, /cinematic portrait/);
  assert.equal(data?.portraitMetadata.sourceResourceTitle, '隐藏角色 · 肖像配置');
});

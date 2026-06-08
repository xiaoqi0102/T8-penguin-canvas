import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const hooks = require('../backend/src/extensions/runtimeHooks.js');

test('local extension runtime hooks merge payloads in registration order', async () => {
  hooks.clearLocalHooksForTests();
  hooks.registerLocalHook('example.resolve', (payload: any) => ({
    count: Number(payload.count || 0) + 1,
    label: 'first',
  }));
  hooks.registerLocalHook('example.resolve', (payload: any) => ({
    count: Number(payload.count || 0) + 1,
    label: `${payload.label}:second`,
  }));

  const result = await hooks.runLocalHooks('example.resolve', { count: 1, keep: true });

  assert.deepEqual(result, {
    count: 3,
    keep: true,
    label: 'first:second',
  });
});

test('local extension runtime hooks can unregister and clear handlers', async () => {
  hooks.clearLocalHooksForTests();
  const unregister = hooks.registerLocalHook('example.remove', () => ({ active: true }));

  assert.equal((await hooks.runLocalHooks('example.remove', {})).active, true);
  unregister();
  assert.deepEqual(await hooks.runLocalHooks('example.remove', { active: false }), { active: false });

  hooks.registerLocalHook('example.clear', () => ({ cleared: false }));
  hooks.clearLocalHooksForTests();
  assert.deepEqual(await hooks.runLocalHooks('example.clear', { cleared: true }), { cleared: true });
});

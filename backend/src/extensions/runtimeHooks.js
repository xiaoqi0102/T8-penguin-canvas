'use strict';

const hooks = new Map();

function registerLocalHook(name, fn) {
  if (!name || typeof fn !== 'function') return () => {};
  const key = String(name);
  const list = hooks.get(key) || [];
  list.push(fn);
  hooks.set(key, list);
  return () => {
    const current = hooks.get(key) || [];
    hooks.set(key, current.filter((item) => item !== fn));
  };
}

async function runLocalHooks(name, payload = {}) {
  const list = hooks.get(String(name)) || [];
  let current = { ...payload };
  for (const fn of list) {
    const result = await fn(current);
    if (result && typeof result === 'object') {
      current = { ...current, ...result };
    }
  }
  return current;
}

function clearLocalHooksForTests() {
  hooks.clear();
}

module.exports = {
  registerLocalHook,
  runLocalHooks,
  clearLocalHooksForTests,
};

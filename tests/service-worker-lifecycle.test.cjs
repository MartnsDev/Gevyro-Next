const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../FrontEnd/lib/service-worker-lifecycle.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup(controlled = true) {
  const own = { scriptURL: 'http://localhost:3000/sw.js' };
  let reloads = 0, removed = 0, unrelatedRemoved = 0;
  const storage = new Map();
  const exports = {};
  const navigator = { serviceWorker: {
    controller: controlled ? own : null,
    getRegistrations: async () => [
      { active: own, waiting: null, installing: null, unregister: async () => { removed++; return true; } },
      { active: {scriptURL: 'http://localhost:3000/other-sw.js'}, waiting: null, installing: null, unregister: async () => { unrelatedRemoved++; return true; } },
    ],
  }};
  vm.runInNewContext(compiled, { exports, URL, navigator,
    window: { location: { origin: 'http://localhost:3000', reload() { reloads++; } } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  });
  return { cleanup: exports.removeDevelopmentWorker, navigator, stats: () => ({reloads, removed, unrelatedRemoved}) };
}

test('aba controlada pelo worker antigo navega uma vez e não remove workers de outras aplicações', async () => {
  const context = setup();
  await context.cleanup();
  assert.deepEqual(context.stats(), {reloads: 1, removed: 1, unrelatedRemoved: 0});
  await context.cleanup();
  assert.equal(context.stats().reloads, 1);
});

test('página sem controller remove registro antigo sem recarregar', async () => {
  const context = setup(false);
  await context.cleanup();
  assert.deepEqual(context.stats(), {reloads: 0, removed: 1, unrelatedRemoved: 0});
});

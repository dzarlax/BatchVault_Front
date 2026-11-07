const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const utilityPath = path.join(__dirname, '../src/utils/cooking.ts');
const source = fs.readFileSync(utilityPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const stubFetcher = async () => ({});
const loadedModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  name => name === './fetcher' ? { __esModule: true, default: stubFetcher }
    : name === './runtimeConfig' ? { getApiUrl: () => 'https://api.test' }
      : require(name),
  loadedModule,
  loadedModule.exports,
);
const cooking = loadedModule.exports;

test('decimal input accepts localized comma but rejects incomplete and negative values', () => {
  assert.equal(cooking.parseDecimalInput(' 12,5 '), '12.5');
  assert.equal(cooking.parseDecimalInput(''), '');
  assert.equal(cooking.parseDecimalInput('-2'), '');
  assert.equal(cooking.parseSignedDecimalInput('-2,25'), '-2.25');
});

test('recipe calculator normalizes kilogram base quantities to gram request weights', () => {
  assert.equal(cooking.isSupportedMassUnit('kg'), true);
  assert.equal(cooking.isSupportedMassUnit('kilograms'), true);
  assert.equal(cooking.normalizeMassQuantityToGrams('1', 'kg'), '1000');
  assert.equal(cooking.normalizeMassQuantityToGrams('1.001', 'kg'), '1001');
  assert.equal(cooking.normalizeMassQuantityToGrams('0.0005', 'kg'), '0.5');
  assert.equal(cooking.normalizeMassQuantityToGrams('1,25', 'kilograms'), '1250');
  assert.equal(cooking.normalizeMassQuantityToGrams('350', 'grams'), '350');
  assert.equal(cooking.normalizeMassQuantityToGrams('1', 'lb'), null);
  assert.equal(cooking.normalizeMassQuantityToGrams('not-a-number', 'kg'), null);
});

test('create run sends the flat plan and the workspace captured by its client', async () => {
  const requests = [];
  const api = cooking.cookingApiFor('workspace-7', async (url, options) => {
    requests.push({ url, options });
    return { id: 41 };
  });
  const body = {
    order_ids: [104, 105, 106], extras: [], title: 'Demo batch', date: '2026-11-07T10:00:00.000Z',
    source_signature: 'signature', stock_version: 8, operation_id: 'same-operation',
  };
  await api.createRun(body);
  await api.createRun(body);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, '/api/cooking-runs');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers['X-Workspace-ID'], 'workspace-7');
  assert.deepEqual(JSON.parse(requests[0].options.body), body);
  assert.deepEqual(JSON.parse(requests[1].options.body), body);
});

test('operation lookup keeps the exact operation identifier in the route', async () => {
  let request;
  const api = cooking.cookingApiFor('w1', async (url, options) => { request = { url, options }; return { status: 'committed' }; });
  await api.operation('01234567-89ab-cdef-0123-456789abcdef');
  assert.equal(request.url, '/api/cooking/operations/01234567-89ab-cdef-0123-456789abcdef');
  assert.equal(request.options.headers['X-Workspace-ID'], 'w1');
});

test('older run pages carry the opaque server cursor unchanged', async () => {
  let request;
  const api = cooking.cookingApiFor('w1', async (url, options) => { request = { url, options }; return { items: [], next_cursor: null }; });
  await api.runs('opaque-page-token');
  assert.equal(request.url, '/api/cooking-runs?cursor=opaque-page-token');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers['X-Workspace-ID'], 'w1');
});

test('replan preserves the original extras while sending a flat run update', async () => {
  let request;
  const api = cooking.cookingApiFor('w1', async (url, options) => { request = { url, options }; return { id: 41 }; });
  const body = { run_id: 41, order_ids: [104, 105], extras: [{ recipe_id: 3, finished_g: '300' }], title: 'Batch', date: '2026-11-07', source_signature: 'fresh', stock_version: 9, version: 2, operation_id: 'op-1' };
  await api.replan(41, body);
  assert.equal(request.url, '/api/cooking-runs/41/plan');
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.options.headers['X-Workspace-ID'], 'w1');
  assert.deepEqual(JSON.parse(request.options.body), body);
});

test('results keep server-reported actual yield and optional initial packing together', async () => {
  let request;
  const api = cooking.cookingApiFor('w2', async (url, options) => { request = { url, options }; return { id: 41 }; });
  const body = { version: 3, stock_version: 12, operation_id: 'op-2', actual_usable_g: [{ recipe_id: 1, quantity_g: '730' }, { recipe_id: 2, quantity_g: '0' }], packing: { lines: [{ product_id: 20, quantity: 6 }] } };
  await api.results(41, body);
  assert.equal(request.url, '/api/cooking-runs/41/results');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), body);
});

test('pending operation id and exact body survive a new browser session and stay workspace scoped', () => {
  const persistent = new Map();
  let session = new Map();
  global.window = {};
  global.sessionStorage = {
    getItem: key => session.get(key) || null,
    setItem: (key, value) => session.set(key, value),
    removeItem: key => session.delete(key),
  };
  global.localStorage = {
    getItem: key => key === 'user' ? JSON.stringify({ id: 'account-a' }) : persistent.get(key) || null,
    setItem: (key, value) => persistent.set(key, value),
    removeItem: key => persistent.delete(key),
  };
  const body = cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id, actual_usable_g: [{ recipe_id: 1, quantity_g: '730' }] }), 'workspace-a');
  const repeatedBody = cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id, actual_usable_g: [{ recipe_id: 1, quantity_g: '999' }] }), 'workspace-a');
  assert.deepEqual(repeatedBody, body);
  assert.match(repeatedBody.operation_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(repeatedBody.operation_id, cooking.cookingOperationId(41, 'results', 'workspace-a'));
  session = new Map();
  global.sessionStorage = {
    getItem: key => session.get(key) || null,
    setItem: (key, value) => session.set(key, value),
    removeItem: key => session.delete(key),
  };
  assert.deepEqual(cooking.cookingRequestBody(41, 'results', () => ({ operation_id: 'wrong', actual_usable_g: [] }), 'workspace-a'), body);
  assert.deepEqual(cooking.getCookingPendingBody(41, 'results', 'workspace-a'), body);
  const otherWorkspace = cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id, actual_usable_g: [{ recipe_id: 1, quantity_g: '1' }] }), 'workspace-b');
  assert.notEqual(otherWorkspace.operation_id, body.operation_id);
  global.localStorage = { getItem: key => key === 'user' ? JSON.stringify({ id: 'account-b' }) : persistent.get(key) || null, setItem: (key, value) => persistent.set(key, value), removeItem: key => persistent.delete(key) };
  const otherAccount = cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id, actual_usable_g: [{ recipe_id: 1, quantity_g: '1' }] }), 'workspace-a');
  assert.notEqual(otherAccount.operation_id, body.operation_id);
  global.localStorage = { getItem: key => key === 'user' ? JSON.stringify({ id: 'account-a' }) : persistent.get(key) || null, setItem: (key, value) => persistent.set(key, value), removeItem: key => persistent.delete(key) };
  cooking.clearCookingOperationId(41, 'results', 'workspace-a');
  const freshBody = cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id, actual_usable_g: [{ recipe_id: 1, quantity_g: '999' }] }), 'workspace-a');
  assert.notEqual(freshBody.operation_id, body.operation_id);
  delete global.localStorage;
  delete global.window;
  delete global.sessionStorage;
});

test('legacy session pending body migrates only for matching scope and 5xx is ambiguous', () => {
  const local = new Map();
  const session = new Map();
  global.window = {};
  global.localStorage = {
    getItem: key => key === 'user' ? JSON.stringify({ id: 'account-a' }) : local.get(key) || null,
    setItem: (key, value) => local.set(key, value),
    removeItem: key => local.delete(key),
  };
  global.sessionStorage = {
    getItem: key => session.get(key) || null,
    setItem: (key, value) => session.set(key, value),
    removeItem: key => session.delete(key),
  };
  const scope = cooking.cookingOperationScope('workspace-a');
  const key = `cooking:operation:${encodeURIComponent(scope)}:41:results:body`;
  const legacyBody = { operation_id: 'legacy-id', actual_usable_g: [{ recipe_id: 1, quantity_g: '730' }] };
  session.set(key, JSON.stringify({ scope, body: legacyBody }));
  assert.deepEqual(cooking.getCookingPendingBody(41, 'results', 'workspace-a'), legacyBody);
  assert.equal(session.has(key), false);
  assert.equal(JSON.parse(local.get(key)).body.operation_id, 'legacy-id');
  assert.equal(cooking.operationErrorMessage({ status: 503 }), 'ambiguous');
  assert.equal(cooking.operationErrorMessage({ status: 400 }), 'failed');
  delete global.localStorage;
  delete global.sessionStorage;
  delete global.window;
});

test('pending body storage failure prevents construction of a mutation payload', () => {
  global.window = {};
  global.localStorage = { getItem: key => key === 'user' ? JSON.stringify({ id: 'account-a' }) : null, setItem: () => { throw new Error('quota'); } };
  global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  assert.throws(() => cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id }), 'workspace-a'), /quota/);
  delete global.localStorage;
  delete global.sessionStorage;
  delete global.window;
});

test('late completion clears only the captured account scope', () => {
  const store = new Map();
  let accountId = 'account-a';
  global.window = {};
  global.localStorage = {
    getItem: key => key === 'user' ? JSON.stringify({ id: accountId }) : store.get(key) || null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  };
  global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const oldScope = cooking.cookingOperationScope('workspace-a');
  const oldBody = cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id, value: 'account-a' }), 'workspace-a');
  accountId = 'account-b';
  const newBody = cooking.cookingRequestBody(41, 'results', operation_id => ({ operation_id, value: 'account-b' }), 'workspace-a');
  cooking.clearCookingOperationId(41, 'results', 'workspace-a', oldScope);
  assert.deepEqual(cooking.getCookingPendingBody(41, 'results', 'workspace-a'), newBody);
  assert.notEqual(oldBody.operation_id, newBody.operation_id);
  delete global.localStorage;
  delete global.sessionStorage;
  delete global.window;
});

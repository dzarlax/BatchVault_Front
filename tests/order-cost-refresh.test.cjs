const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Use the project's TypeScript compiler; the application does not load this test-only hook.
require.extensions['.ts'] = (module, filename) => {
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  module._compile(js, filename);
};
const { refreshOrderItemEstimate } = require('../src/utils/orderHelpers.ts');
const original = { id: 7, product_id: 12, quantity: 5, price: 600, cost_price: 310, cost_source: 'recipe' };
const product = { id: 12, price: 650, cost: 999, cost_mode: 'recipe', cost_estimate: { source: 'recipe', status: 'complete', total_cost: 320, issues: [] } };

test('an explicit refresh fetches a new quote and preserves quantity, sale price and saved item identity', async () => {
  let reads = 0;
  const patch = await refreshOrderItemEstimate(original, async id => { reads++; assert.equal(id, 12); return product; });
  assert.equal(reads, 1);
  assert.deepEqual(Object.keys(patch).sort(), ['cost_price', 'cost_snapshot', 'cost_source']);
  assert.deepEqual({ ...original, ...patch }, { ...original, cost_price: 320, cost_snapshot: undefined });
  assert.equal(original.cost_price, 310);
});
test('zero is a real refreshed cost; an incomplete quote never uses the manual fallback', async () => {
  assert.equal((await refreshOrderItemEstimate(original, async () => ({ ...product, cost_estimate: { ...product.cost_estimate, total_cost: 0 } }))).cost_price, 0);
  await assert.rejects(refreshOrderItemEstimate(original, async () => ({ ...product, cost_estimate: { ...product.cost_estimate, status: 'incomplete', total_cost: null, issues: [{ message: 'Missing yield' }] } })), /Missing yield/);
  assert.equal(original.cost_price, 310);
});
test('failed reads and mismatched product IDs leave the draft intact', async () => {
  await assert.rejects(refreshOrderItemEstimate(original, async () => { throw new Error('Offline'); }), /Offline/);
  await assert.rejects(refreshOrderItemEstimate(original, async () => ({ ...product, id: 99 })), /does not match/);
  assert.equal(original.quantity, 5);
  assert.equal(original.price, 600);
});
test('persisted snapshots cannot be repriced by a quote refresh', async () => {
  let reads = 0;
  await assert.rejects(refreshOrderItemEstimate({ ...original, cost_snapshot: { version: 1, source: 'recipe', amount: 310 } }, async () => { reads++; return product; }), /cannot be refreshed/);
  assert.equal(reads, 0);
});

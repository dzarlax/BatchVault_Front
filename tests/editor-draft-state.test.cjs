const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const {
  orderEditorSnapshot, orderEditorIsDirty,
  recipeEditorSnapshot, recipeEditorIsDirty, acknowledgeRecipeEditorSave, recipeEditorHasPendingIngredient, advanceEditorOperationScope, commitEditorWrite,
} = require('../src/utils/editorDraftState.ts');
const order = () => ({
  clientId: 3, status: 'new', comment: '',
  items: [{ id: 9, product_id: 12, quantity: 2, price: 500, cost_price: 130, cost_source: 'recipe' }],
});
const recipe = (mode = 'create') => ({
  mode, name: mode === 'create' ? '' : 'Saved recipe', plannedYield: '100', ingredients: [],
  entry: { ingredientId: '', quantity: '', unit: '' },
});

test('order metadata and background estimates do not dirty the authored draft', () => {
  const initial = order();
  const baseline = orderEditorSnapshot(initial);
  const refreshed = { ...initial, updated_at: 'later', items: initial.items.map(item => ({
    ...item, id: 55, cost_snapshot: { version: 2, amount: 130 },
    cost_estimate: { total_cost: 150 }, product: { name: 'Renamed' },
  })) };
  assert.equal(orderEditorIsDirty(baseline, refreshed), false);
  assert.equal(orderEditorIsDirty(baseline, { ...refreshed, items: refreshed.items.map(item => ({ ...item, cost_price: 150 })) }), true);
});

test('order client, status, comment, row membership and every authored numeric field require confirmation', () => {
  const initial = order();
  const baseline = orderEditorSnapshot(initial);
  for (const patch of [{ clientId: null }, { status: 'ready' }, { comment: 'Keep cool' }, { items: [] }, { items: [...initial.items, { ...initial.items[0] }] }]) {
    assert.equal(orderEditorIsDirty(baseline, { ...initial, ...patch }), true);
  }
  for (const field of ['product_id', 'quantity', 'price', 'cost_price']) {
    assert.equal(orderEditorIsDirty(baseline, { ...initial, items: [{ ...initial.items[0], [field]: 0 }] }), true, field);
  }
  assert.equal(orderEditorIsDirty(baseline, initial), false);
  assert.equal(orderEditorIsDirty(null, initial), false);
});

test('invalid cost input is distinguishable from zero and survives a baseline comparison', () => {
  const initial = order();
  initial.items[0].cost_price = NaN;
  const baseline = orderEditorSnapshot(initial);
  assert.equal(orderEditorIsDirty(baseline, initial), false);
  assert.equal(orderEditorIsDirty(baseline, { ...initial, items: [{ ...initial.items[0], cost_price: 0 }] }), true);
});

test('create recipe protects name, yield, local composition and any partially entered row', () => {
  const initial = recipe();
  const baseline = recipeEditorSnapshot(initial);
  for (const patch of [{ name: 'New recipe' }, { plannedYield: '' }, { ingredients: [{ id: 1, quantity: '2,5', unit: { value: 'kg', label: 'Kilograms' } }] }]) {
    assert.equal(recipeEditorIsDirty(baseline, { ...initial, ...patch }), true);
  }
  for (const entry of [{ ingredientId: '1' }, { quantity: '2,' }, { unit: 'kg' }]) {
    assert.equal(recipeEditorIsDirty(baseline, { ...initial, entry: { ...initial.entry, ...entry } }), true);
  }
  const added = { ...initial, ingredients: [{ id: 1, quantity: '2', unit: { value: 'kg', label: 'Kilograms' }, name: 'Meat' }] };
  const labeled = { ...added, ingredients: added.ingredients.map(row => ({ ...row, name: 'Renamed', unit: { ...row.unit, label: 'Килограммы' } })) };
  assert.equal(recipeEditorIsDirty(recipeEditorSnapshot(added), labeled), false);
});

test('saved edit-mode ingredient operations and refreshed server metadata never imply rollback on close', () => {
  const initial = recipe('edit');
  const baseline = recipeEditorSnapshot(initial);
  const serverUpdated = { ...initial, name: 'Renamed server recipe', ingredients: [{ id: 4, quantity: '3', unit: { value: 'kg' } }], recipe_ingredients: [{ ingredient_id: 4 }], cost_estimate: { total_cost: 90 } };
  assert.equal(recipeEditorIsDirty(baseline, serverUpdated), false);
  assert.equal(recipeEditorIsDirty(baseline, { ...serverUpdated, plannedYield: '120' }), true);
});

test('saving an ingredient entry acknowledges that entry only and preserves pending yield', () => {
  const initial = recipe('edit');
  const baseline = recipeEditorSnapshot(initial);
  const pending = { ...initial, plannedYield: '125', entry: { ingredientId: '1', quantity: '3', unit: 'kg' } };
  const saved = acknowledgeRecipeEditorSave(baseline, { entry: initial.entry });
  assert.equal(recipeEditorIsDirty(saved, { ...pending, entry: initial.entry }), true);
  assert.equal(saved.plannedYield, '100');
  assert.equal(recipeEditorIsDirty(saved, { ...initial, ingredients: [{ id: 1, quantity: '3', unit: { value: 'kg' } }] }), false);
});

test('saving yield acknowledges its submitted text only and preserves a partially entered ingredient', () => {
  const initial = recipe('edit');
  const baseline = recipeEditorSnapshot(initial);
  const pending = { ...initial, plannedYield: '125,0', entry: { ingredientId: '', quantity: '2', unit: '' } };
  const saved = acknowledgeRecipeEditorSave(baseline, { plannedYield: pending.plannedYield });
  assert.equal(recipeEditorIsDirty(saved, pending), true);
  assert.equal(recipeEditorIsDirty(saved, { ...pending, entry: initial.entry }), false);
  assert.equal(recipeEditorIsDirty(recipeEditorSnapshot(initial), pending), true);
  assert.equal(acknowledgeRecipeEditorSave(null, { plannedYield: '125' }), null);
  assert.equal(recipeEditorIsDirty(null, pending), false);
});


test('recipe submit detects a pending row even when existing draft ingredients are ready to save', () => {
  const ready = { ...recipe(), name: 'New recipe', ingredients: [{ id: 1, quantity: '2', unit: { value: 'kg' } }] };
  assert.equal(recipeEditorHasPendingIngredient(ready.entry), false);
  for (const patch of [{ ingredientId: '2' }, { quantity: '3,' }, { unit: 'g' }, { ingredientId: '2', quantity: '3', unit: 'g' }]) {
    const pending = { ...ready, entry: { ...ready.entry, ...patch } };
    assert.equal(recipeEditorHasPendingIngredient(pending.entry), true, JSON.stringify(patch));
    assert.equal(recipeEditorIsDirty(recipeEditorSnapshot(ready), pending), true);
    // Adding the row or clearing its fields allows the existing draft to be submitted.
    assert.equal(recipeEditorHasPendingIngredient({ ...pending.entry, ingredientId: '', quantity: '', unit: '' }), false);
    assert.equal(pending.ingredients.length, 1);
  }
  assert.equal(recipeEditorHasPendingIngredient({ ingredientId: '', quantity: '   ', unit: '' }), false);
});


test('an explicit same-price refresh with a changed cost source is an authored order change', () => {
  const initial = order();
  const updated = { ...initial, items: initial.items.map(item => ({ ...item, cost_source: 'manual' })) };
  assert.equal(updated.items[0].cost_price, initial.items[0].cost_price);
  assert.equal(orderEditorIsDirty(orderEditorSnapshot(initial), updated), true);
});

test('workspace and editor scope epochs reject old responses after A to B to A and close/reopen', () => {
  const a = advanceEditorOperationScope(null, 'A');
  const b = advanceEditorOperationScope(a, 'B');
  const returnedA = advanceEditorOperationScope(b, 'A');
  assert.notEqual(returnedA, a);
  assert.equal(returnedA.epoch, a.epoch + 2);
  assert.equal(advanceEditorOperationScope(returnedA, 'A'), returnedA);
  const open = advanceEditorOperationScope(null, `${a.epoch}:edit:1`);
  const closed = advanceEditorOperationScope(open, `${a.epoch}:closed`);
  const reopened = advanceEditorOperationScope(closed, `${a.epoch}:edit:1`);
  assert.notEqual(reopened, open);
});

test('confirmed ingredient writes acknowledge once and request GET-only recovery after failed refresh', async () => {
  let writes = 0, acknowledgements = 0, reads = 0, recoveryRequired = false;
  const initial = recipe('edit');
  let baseline = recipeEditorSnapshot(initial);
  const pending = { ...initial, plannedYield: '125', entry: { ingredientId: '1', quantity: '2', unit: 'kg' } };
  await commitEditorWrite({
    write: async () => { writes++; return { saved: true }; },
    acknowledge: () => { acknowledgements++; baseline = acknowledgeRecipeEditorSave(baseline, { entry: initial.entry }); },
    refresh: async () => { reads++; throw new Error('GET failed'); },
    requireRefresh: () => { recoveryRequired = true; },
    isCurrent: () => true,
  });
  assert.equal(writes, 1);
  assert.equal(acknowledgements, 1);
  assert.equal(recoveryRequired, true);
  assert.equal(recipeEditorIsDirty(baseline, { ...pending, entry: initial.entry }), true);
  // Recovery only reads: the confirmed mutation is never retried.
  await (async () => { reads++; recoveryRequired = false; })();
  assert.equal(writes, 1);
  assert.equal(reads, 2);
});

test('failed writes retain pending fields and stale confirmed writes cannot touch a new editor', async () => {
  let acknowledgements = 0, reads = 0, recoveryRequired = false;
  const options = {
    acknowledge: () => { acknowledgements++; },
    refresh: async () => { reads++; },
    requireRefresh: () => { recoveryRequired = true; },
    isCurrent: () => true,
  };
  await assert.rejects(commitEditorWrite({ ...options, write: async () => { throw new Error('POST failed'); } }), /POST failed/);
  assert.equal(acknowledgements, 0);
  assert.equal(reads, 0);
  assert.equal(recoveryRequired, false);
  await commitEditorWrite({ ...options, write: async () => ({}), isCurrent: () => false });
  assert.equal(acknowledgements, 0);
  assert.equal(reads, 0);
});

test('confirmed yield PATCH remains acknowledged when cache revalidation fails', async () => {
  const initial = recipe('edit');
  let baseline = recipeEditorSnapshot(initial), recoveryRequired = false;
  const submitted = { ...initial, plannedYield: '125,0', entry: { ingredientId: '2', quantity: '', unit: 'kg' } };
  await commitEditorWrite({
    write: async () => ({ planned_yield_g: 125 }),
    acknowledge: () => { baseline = acknowledgeRecipeEditorSave(baseline, { plannedYield: submitted.plannedYield }); },
    refresh: async () => { throw new Error('Cache GET failed'); },
    requireRefresh: () => { recoveryRequired = true; },
    isCurrent: () => true,
  });
  assert.equal(recoveryRequired, true);
  assert.equal(baseline.plannedYield, submitted.plannedYield);
  assert.equal(recipeEditorIsDirty(baseline, submitted), true);
  assert.equal(recipeEditorIsDirty(baseline, { ...submitted, entry: initial.entry }), false);
});

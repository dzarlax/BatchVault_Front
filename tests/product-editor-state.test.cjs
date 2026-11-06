const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { productEditorSnapshot, productEditorIsDirty, productEditorErrors } = require('../src/utils/productEditorState.ts');
const { validProductDraft } = require('../src/utils/productTypes.ts');
const values = () => ({ name: 'Mix', description: 'Two products', price: '5,50', cost: '0', image: '', packageId: 1, recipeIds: [10], draft: { product_type: 'assortment', cost_mode: 'manual', composition_basis: 'products', cost_recipe_id: null, reviewed: true, components: [], assortment_components: [{ component_product_id: 1, quantity_g: '100', position: 0 }, { component_product_id: 2, quantity_g: '150', position: 1 }] } });

test('asynchronous quotes, configuration versions and invalidated approval do not dirty authored values', () => {
  const initial = values();
  const baseline = productEditorSnapshot(initial);
  const quoted = { ...initial, draft: { ...initial.draft, configuration_version: 9, conversionAccepted: false, conversionAcceptedContext: 'changed', conversionAcceptedEstimate: 'latest', conversionPreview: { context: 'latest', estimate: 'new', complete: true } } };
  assert.equal(productEditorIsDirty(baseline, quoted), false);
  assert.equal(productEditorIsDirty(baseline, { ...quoted, conversionChoice: true }), true);
});

test('all authored fields, ordered product composition and legacy recipe links require discard confirmation', () => {
  const initial = values();
  const baseline = productEditorSnapshot(initial);
  for (const field of ['name', 'description', 'price', 'cost', 'image', 'packageId', 'recipeIds']) {
    assert.equal(productEditorIsDirty(baseline, { ...initial, [field]: field === 'packageId' ? 2 : field === 'recipeIds' ? [11] : 'changed' }), true, field);
  }
  for (const patch of [{ product_type: 'standard' }, { cost_mode: 'assortment' }, { cost_recipe_id: 99 }, { composition_basis: 'legacy_recipes' }, { reviewed: false }, { converting: true }, { components: [{ recipe_id: 8, quantity_g: '250' }] }, { assortment_components: [...initial.draft.assortment_components].reverse() }, { assortment_components: initial.draft.assortment_components.map((row, i) => i ? row : { ...row, quantity_g: '101' }) }]) {
    assert.equal(productEditorIsDirty(baseline, { ...initial, draft: { ...initial.draft, ...patch } }), true, JSON.stringify(patch));
  }
});

test('a fresh open or accepted reload establishes its own baseline without retaining a prior draft', () => {
  const initial = values();
  const changed = { ...initial, name: 'Edited' };
  assert.equal(productEditorIsDirty(productEditorSnapshot(initial), changed), true);
  assert.equal(productEditorIsDirty(productEditorSnapshot(changed), changed), false);
  assert.equal(productEditorIsDirty(null, changed), false);
  assert.equal(productEditorIsDirty(productEditorSnapshot(initial), { ...initial }), false);
});

test('manual assortment reports exact underweight and overweight separately, preserving zero cost and unknown weight rules', () => {
  const input = values();
  assert.deepEqual(productEditorErrors(input, true, validProductDraft(input.draft, 250), 250), {});
  const under = { ...input, draft: { ...input.draft, assortment_components: input.draft.assortment_components.map((row, i) => i ? { ...row, quantity_g: '149' } : row) } };
  assert.deepEqual(productEditorErrors(under, true, false, 250)['assortment-composition'], { key: 'productWeightMissing', values: { weight: 1 } });
  const over = { ...under, draft: { ...under.draft, assortment_components: under.draft.assortment_components.map((row, i) => i ? { ...row, quantity_g: '150,001' } : row) } };
  assert.deepEqual(productEditorErrors(over, true, false, 250)['assortment-composition'], { key: 'productWeightExcess', values: { weight: 0.001 } });
  assert.deepEqual(productEditorErrors(under, true, validProductDraft(under.draft, null), null), {});
});

test('decimal price rules, precise gram errors, optional image validation and incomplete costing remain distinct', () => {
  const input = values();
  assert.equal(productEditorErrors({ ...input, price: '5abc' }, true, true, 250).price.key, 'validPriceRequired');
  assert.equal(productEditorErrors({ ...input, image: 'broken' }, true, true, 250).image.key, 'invalidImageUrl');
  const invalid = { ...input, draft: { ...input.draft, assortment_components: [{ component_product_id: 0, quantity_g: '0.0001', position: 0 }] } };
  const errors = productEditorErrors(invalid, true, false, 250);
  assert.equal(errors['component-product-0'].key, 'productComponentRequired');
  assert.equal(errors['component-grams-0'].key, 'productComponentWeightRequired');
  const automatic = { ...input, cost: '', draft: { ...input.draft, cost_mode: 'assortment' } };
  assert.deepEqual(productEditorErrors(automatic, true, validProductDraft(automatic.draft, 250), 250), {});
});


test('read-only legacy recipe composition reports invalid grams at its focusable configuration section', () => {
  const input = values();
  input.draft.composition_basis = 'legacy_recipes';
  input.draft.components = [{ recipe_id: 1, quantity_g: '0' }, { recipe_id: 2, quantity_g: '250' }];
  const errors = productEditorErrors(input, true, false, 250);
  assert.equal(errors['assortment-composition'].key, 'productComponentWeightRequired');
  assert.equal(Object.keys(errors).some(key => key.startsWith('component-')), false);
});

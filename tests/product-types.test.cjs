const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { currentProductType, emptyProductDraft, productDraft, gramsInMilligrams, validProductDraft, productConfigurationPayload, changeProductType } = require('../src/utils/productTypes.ts');
const { effectiveProductCost, supportedCostSnapshot } = require('../src/utils/costing.ts');
const fixtures = require('./fixtures/product-types-v1.json');

test('shared wire fixtures preserve authoritative 270/290 amounts and distinguish zero, unknown and incomplete', () => {
  assert.equal(effectiveProductCost(fixtures.complete), 270);
  assert.equal(effectiveProductCost(fixtures.manual), 290);
  assert.equal(effectiveProductCost(fixtures.legacy_manual), 0);
  assert.equal(effectiveProductCost(fixtures.incomplete), null);
  assert.equal(effectiveProductCost(fixtures.unknown_type), null);
  assert.equal(currentProductType(fixtures.legacy_manual), 'standard');
  assert.equal(currentProductType({ cost_mode: 'assortment' }), 'assortment');
  assert.equal(currentProductType({ product_type: 'future_type', cost_mode: 'manual' }), null);
  assert.equal(currentProductType({ cost_mode: 'future_mode' }), null);
});
test('manual mode retains assortment product IDs and grams; payload never adds retail packages or implicit recipes', () => {
  const draft = productDraft(fixtures.complete);
  const manual = { ...draft, cost_mode: 'manual' };
  assert.equal(validProductDraft(manual, 250), true);
  const payload = productConfigurationPayload(manual);
  assert.equal(payload.product_type, 'assortment');
  assert.equal(payload.cost_mode, 'manual');
  assert.equal(payload.configuration_version, 1);
  assert.deepEqual(payload.assortment_components, fixtures.complete.assortment_components);
  assert.deepEqual(payload.components, []);
  assert.equal(payload.recipe_id, null);
  assert.equal('recipe_ids' in payload, false);
});
test('manual ordinary product retains its explicit primary recipe on every round trip', () => {
  const draft = { ...emptyProductDraft(), cost_recipe_id: 123, cost_mode: 'manual' };
  assert.equal(validProductDraft(draft), true);
  const wire = productConfigurationPayload(draft);
  assert.equal(wire.recipe_id, 123); assert.equal(wire.cost_recipe_id, 123);
  const typed = changeProductType(draft, 'assortment');
  assert.equal(typed.cost_mode, 'manual'); assert.equal(typed.cost_recipe_id, null);
  assert.deepEqual(typed.assortment_components, []);
  assert.equal(validProductDraft(typed, 250), false);
});
test('assortment requires distinct products and exact positive milligrams even in manual mode', () => {
  const draft = productDraft(fixtures.manual);
  assert.equal(validProductDraft(draft, 250), true);
  assert.equal(validProductDraft(draft, 249.999), false);
  const rows = draft.assortment_components;
  assert.equal(validProductDraft({ ...draft, assortment_components: [] }, 250), false);
  assert.equal(validProductDraft({ ...draft, assortment_components: [rows[0], rows[0]] }, 100), false);
  assert.equal(validProductDraft({ ...draft, assortment_components: [{ ...rows[0], quantity_g: '50.0001' }, ...rows.slice(1)] }, 250), false);
  assert.equal(validProductDraft({ ...draft, assortment_components: [{ ...rows[0], quantity_g: '0' }, ...rows.slice(1)] }), false);
  assert.equal(validProductDraft(draft, null), true);
  assert.equal(gramsInMilligrams('0,001'), 1);
  assert.equal(gramsInMilligrams('-1'), null);
  assert.equal(gramsInMilligrams('99999999999.999'), 99999999999999);
  assert.equal(gramsInMilligrams('100000000000'), null);
});
test('legacy conversion needs explicit product choices and acceptance; old recipe-only composition stays separate', () => {
  const legacy = { ...emptyProductDraft(), product_type: 'assortment', composition_basis: 'legacy_recipes', cost_mode: 'manual', components: [{ recipe_id: 1, quantity_g: '50' }, { recipe_id: 2, quantity_g: '50' }] };
  assert.equal(validProductDraft(legacy, 100), true);
  assert.deepEqual(productConfigurationPayload(legacy).components, [{ recipe_id: 1, quantity_g: 50 }, { recipe_id: 2, quantity_g: 50 }]);
  const converting = { ...productDraft(fixtures.complete), converting: true };
  assert.equal(validProductDraft(converting, 250), false);
  assert.equal(validProductDraft({ ...converting, conversionAccepted: true, conversionAcceptedContext: 'quote-a', conversionAcceptedEstimate: 'estimate-a', conversionPreview: { context: 'quote-a', estimate: 'estimate-a', complete: true } }, 250, 'quote-a'), true);
});
test('historical fixture has captured composition; old history remains unknown without a current-catalog substitution', () => {
  assert.equal(fixtures.snapshot.provenance.components.length, 5);
  assert.equal(fixtures.snapshot.amount, 290);
  assert.equal(fixtures.legacy_snapshot.provenance, undefined);
});

test('future snapshot versions and sources remain read only', () => {
  assert.equal(supportedCostSnapshot(fixtures.snapshot), true);
  assert.equal(supportedCostSnapshot({ ...fixtures.snapshot, version: 2 }), false);
  assert.equal(supportedCostSnapshot({ ...fixtures.snapshot, source: 'future_source' }), false);
});

test('conversion approval cannot authorize another package or pending, incomplete or replaced preview', () => {
  const approved = { ...productDraft(fixtures.complete), converting: true, conversionAccepted: true,
    conversionAcceptedContext: 'package-20', conversionAcceptedEstimate: 'complete-270',
    conversionPreview: { context: 'package-20', estimate: 'complete-270', complete: true } };
  assert.equal(validProductDraft(approved, 250, 'package-20'), true);
  assert.equal(validProductDraft(approved, 250, 'package-40'), false);
  assert.equal(validProductDraft({ ...approved, conversionPreview: undefined }, 250, 'package-20'), false);
  assert.equal(validProductDraft({ ...approved, conversionPreview: { ...approved.conversionPreview, complete: false } }, 250, 'package-20'), false);
  assert.equal(validProductDraft({ ...approved, conversionPreview: { ...approved.conversionPreview, estimate: 'complete-290' } }, 250, 'package-20'), false);
});

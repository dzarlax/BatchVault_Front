const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const web = process.env.COSTING_QA_WEB_URL;
const corpus = require('./fixtures/product-types-v1.json');
const messages = require('../locales/en/common.json');
const api = 'http://127.0.0.1:18088';

async function setup({ locale = 'en', mobile = false, capability = true, refreshRequired = false, saveConflict = false, dark = false } = {}) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(web).hostname));
  const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_MODULE || 'playwright', 'test'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 900 } : { width: 1440, height: 1100 } });
  const pkg = { id: 43, name: 'Ordinary pack 100 g', net_weight_g: 100, unit_cost: 15 };
  const recipes = corpus.complete.cost_estimate.composition_details.map(row => ({ id: row.recipe_id, name: row.product_name, planned_yield_g: 500, servings: 1 }));
  const sources = recipes.map((recipe, i) => ({ ...corpus.legacy_manual, id: 101 + i, name: recipe.name, description: 'Synthetic QA content', price: 300, cost: 999,
    package_id: 43, package: pkg, product_type: 'standard', recipe_id: recipe.id, cost_recipe_id: recipe.id, configuration_version: 1, composition_basis: null,
    cost_mode: 'recipe', cost_estimate: { ...corpus.complete.cost_estimate, source: 'recipe', total_cost: 135, content_cost: 120, packaging_cost: 15, net_weight_g: 100, composition_details: [] } }));
  let products = [...sources, structuredClone(corpus.complete), { ...structuredClone(corpus.manual), id: 301, name: 'Manual assortment' },
    { ...structuredClone(corpus.complete), id: 302, name: 'Legacy recipe assortment', composition_basis: 'legacy_recipes', assortment_components: [], components: corpus.complete.cost_estimate.components.map(row => ({ recipe_id: row.recipe_id, quantity_g: row.quantity_g })) }];
  const workspace = { id: 1, name: 'Isolated fixture', slug: 'fixture', role: 'owner', currency: 'RSD', ...(capability ? { capabilities: { product_types_v1: true } } : {}) };
  const writes = [];
  let detailReads = 0;
  let conflictPending = saveConflict;
  await context.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}}` }));
  await context.route(`${api}/**`, async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    const method = request.method();
    let result;
    if (endpoint === '/api/workspaces') result = [workspace];
    else if (endpoint === '/api/workspaces/current') result = workspace;
    else if (endpoint === '/api/recipes') result = recipes;
    else if (endpoint === '/api/packages') result = [pkg, corpus.complete.package, { id: 44, name: 'Common pack cost forty', net_weight_g: 250, unit_cost: 40 }, { id: 45, name: 'Common pack unknown cost', net_weight_g: 250, unit_cost: null }];
    else if (endpoint === '/api/products/cost-preview') { const input = request.postDataJSON(); result = { ...corpus.complete.cost_estimate, ...(input.package_id === 44 ? { total_cost: 290, packaging_cost: 40 } : {}) }; }
    else if (endpoint === '/api/products' && method === 'GET') result = products;
    else if (/^\/api\/products\/\d+$/.test(endpoint) && method === 'GET') { detailReads++; result = products.find(product => product.id === Number(endpoint.split('/').pop())); }
    else if (endpoint.startsWith('/api/products') && ['POST', 'PUT'].includes(method)) {
      const data = request.postDataJSON(); writes.push(data);
      if (conflictPending) { conflictPending = false; await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Configuration changed', code: 'configuration_changed' }) }); return; }
      const id = method === 'POST' ? 500 : Number(endpoint.split('/').pop());
      const previous = products.find(product => product.id === id) || {};
      result = { ...previous, ...data, id, configuration_version: (previous.configuration_version || 0) + 1, refresh_required: refreshRequired };
      products = [...products.filter(product => product.id !== id), result];
    } else result = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ userID: 1, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
  await context.addInitScript(({ token, dark }) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify({ id: 1, username: 'isolated-fixture' })); localStorage.setItem('theme', dark ? 'dark' : 'light'); }, { token, dark });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Extra attributes from the server')) errors.push(message.text()); });
  await page.goto(`${web}${locale === 'en' ? '' : `/${locale}`}/products`, { waitUntil: 'networkidle' });
  const open = async name => { await page.locator('.product-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).locator('button.product-card-edit').click(); return page.getByRole('dialog').filter({ has: page.locator('#name') }); };
  return { browser, context, page, expect, writes, open, errors, get detailReads() { return detailReads; } };
}

test('assortment is a type; manual mode preserves five product rows and sends one full unit cost', { skip: !web }, async () => {
  const qa = await setup();
  try {
    const dialog = await qa.open('Five flavours');
    await qa.expect(dialog.locator('#product-type-assortment')).toBeChecked();
    assert.equal(await dialog.locator('[id^="component-product-"]').count(), 5);
    await qa.expect(dialog).toContainText('270.00 RSD');
    await dialog.locator('#cost-method-manual').check();
    assert.equal(await dialog.locator('[id^="component-product-"]').count(), 5);
    await dialog.locator('#cost').fill('290');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible();
    assert.equal(qa.writes.length, 1);
    assert.equal(qa.writes[0].product_type, 'assortment');
    assert.equal(qa.writes[0].cost_mode, 'manual');
    assert.equal(qa.writes[0].cost, 290);
    assert.deepEqual(qa.writes[0].assortment_components, corpus.complete.assortment_components);
    assert.equal('recipe_ids' in qa.writes[0], false);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('ordinary automatic to manual keeps its primary recipe and hides legacy optional links', { skip: !web }, async () => {
  const qa = await setup();
  try {
    const dialog = await qa.open('Beef teriyaki');
    assert.equal(await dialog.locator('#costRecipe').count(), 1);
    await qa.expect(dialog).not.toContainText(messages.costingOptionalLinks);
    await dialog.locator('#cost-method-manual').check();
    await dialog.locator('#cost').fill('0');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible();
    assert.equal(qa.writes[0].recipe_id, 201); assert.equal(qa.writes[0].cost_recipe_id, 201);
    assert.equal(qa.writes[0].cost, 0);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('confirmed product save with failed refresh offers only GET retry, no duplicate write', { skip: !web }, async () => {
  const qa = await setup({ refreshRequired: true });
  try {
    const dialog = await qa.open('Manual assortment');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).toContainText(messages.productSavedRefreshRequired);
    await qa.expect(dialog.locator('#name')).toBeDisabled();
    await dialog.getByRole('button', { name: messages.productRetryRead, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible();
    assert.equal(qa.writes.length, 1); assert.equal(qa.detailReads, 1);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

for (const locale of ['ru', 'rs']) test(`localized modern form fits narrow view in ${locale}`, { skip: !web }, async () => {
  const qa = await setup({ locale, mobile: true });
  try {
    const dialog = await qa.open('Five flavours');
    await qa.expect(dialog).toHaveCSS('opacity', '1');
    const strings = require(`../locales/${locale}/common.json`);
    await qa.expect(dialog).toContainText(strings.productTypeAssortment);
    await qa.expect(dialog).toContainText(strings.productCommonPackage);
    assert.equal(await dialog.locator('select').count(), 0);
    assert.equal(await qa.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.COSTING_QA_SCREENSHOTS) { fs.mkdirSync(process.env.COSTING_QA_SCREENSHOTS, { recursive: true }); await qa.page.screenshot({ path: path.join(process.env.COSTING_QA_SCREENSHOTS, `product-types-${locale}.png`), animations: 'disabled' }); fs.writeFileSync(path.join(process.env.COSTING_QA_SCREENSHOTS, `computed-${locale}.json`), JSON.stringify(await qa.page.locator('.modal-content').evaluate(element => ({background:getComputedStyle(element).backgroundColor,opacity:getComputedStyle(element).opacity,rect:element.getBoundingClientRect().toJSON()})))); }
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('older backend keeps the legacy editor instead of sending unrecognized product fields', { skip: !web }, async () => {
  const qa = await setup({ capability: false });
  try {
    const dialog = await qa.open('Beef teriyaki');
    assert.equal(await dialog.locator('#product-type-standard').count(), 0);
    assert.equal(await dialog.locator('#costMode').count(), 1);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});


test('legacy composition conversion requires product choices and an explicit accepted estimate', { skip: !web }, async () => {
  const qa = await setup();
  try {
    const dialog = await qa.open('Legacy recipe assortment');
    await dialog.getByRole('button', { name: messages.productConvertComposition, exact: true }).click();
    const names = corpus.complete.cost_estimate.composition_details.map(row => row.product_name);
    for (let index = 0; index < names.length; index++) {
      await dialog.locator(`#component-product-${index}`).fill(names[index]);
      await qa.page.getByRole('option', { name: names[index], exact: true }).click();
      await qa.expect(dialog.locator(`#component-grams-${index}`)).toHaveValue('50');
    }
    await qa.expect(dialog.locator('#accept-conversion')).toBeEnabled();
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    assert.equal(qa.writes.length, 0);
    await dialog.locator('#accept-conversion').check();
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible();
    assert.equal(qa.writes.length, 1);
    assert.equal(qa.writes[0].composition_basis, 'products');
    assert.deepEqual(qa.writes[0].components, []);
    assert.equal(qa.writes[0].assortment_components.length, 5);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('manual assortment cannot save mismatched grams', { skip: !web }, async () => {
  const qa = await setup();
  try {
    const dialog = await qa.open('Manual assortment');
    await dialog.locator('#component-grams-4').fill('49');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).toContainText(messages.productConfigurationInvalid);
    assert.equal(qa.writes.length, 0);
    await dialog.locator('#component-grams-4').fill('50');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible(); assert.equal(qa.writes.length, 1);
  } finally { await qa.browser.close(); }
});

test('configuration conflict keeps the draft until explicit reload and never repeats PUT', { skip: !web }, async () => {
  const qa = await setup({ saveConflict: true });
  try {
    const dialog = await qa.open('Manual assortment');
    await dialog.locator('#name').fill('Local draft retained');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).toContainText(messages.productConfigurationConflict);
    await qa.expect(dialog.locator('#name')).toHaveValue('Local draft retained');
    assert.equal(qa.writes.length, 1);
    qa.page.once('dialog', dialog => dialog.accept());
    await dialog.getByRole('button', { name: messages.productReloadConfiguration, exact: true }).click();
    await qa.expect(dialog.locator('#name')).toHaveValue('Manual assortment');
    assert.equal(qa.detailReads, 1); assert.equal(qa.writes.length, 1);
  } finally { await qa.browser.close(); }
});

test('desktop dark composition remains readable with one common package', { skip: !web }, async () => {
  const qa = await setup({ dark: true });
  try {
    const dialog = await qa.open('Five flavours');
    await qa.expect(qa.page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await qa.expect(dialog).toHaveCSS('opacity', '1');
    await dialog.locator('#component-product-0').scrollIntoViewIfNeeded();
    await qa.expect(dialog).toContainText(messages.productCommonPackageHelp);
    assert.equal(await dialog.locator('[id^="component-product-"]').count(), 5);
    if (process.env.COSTING_QA_SCREENSHOTS) { fs.mkdirSync(process.env.COSTING_QA_SCREENSHOTS, { recursive: true }); await qa.page.screenshot({ path: path.join(process.env.COSTING_QA_SCREENSHOTS, 'product-types-dark.png'), animations: 'disabled' }); }
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

async function acceptLegacyConversion(qa) {
  const dialog = await qa.open('Legacy recipe assortment');
  await dialog.getByRole('button', { name: messages.productConvertComposition, exact: true }).click();
  const names = corpus.complete.cost_estimate.composition_details.map(row => row.product_name);
  for (let index = 0; index < names.length; index++) {
    await dialog.locator(`#component-product-${index}`).fill(names[index]);
    await qa.page.getByRole('option', { name: names[index], exact: true }).click();
  }
  await qa.expect(dialog.locator('#accept-conversion')).toBeEnabled();
  await dialog.locator('#accept-conversion').check();
  return dialog;
}

test('changing to another same-weight package requires accepting the new complete conversion quote', { skip: !web }, async () => {
  const qa = await setup();
  try {
    const dialog = await acceptLegacyConversion(qa);
    await dialog.locator('#packageId').fill('Common pack cost forty');
    await qa.page.getByRole('option', { name: /Common pack cost forty/ }).click();
    await qa.expect(dialog.locator('#accept-conversion')).not.toBeChecked();
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    assert.equal(qa.writes.length, 0);
    await qa.expect(dialog.getByRole('region', { name: messages.costingTitle })).toContainText('290.00 RSD');
    await qa.expect(dialog.locator('#accept-conversion')).not.toBeChecked();
    await dialog.locator('#accept-conversion').check();
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible(); assert.equal(qa.writes.length, 1); assert.equal(qa.writes[0].package_id, 44);
  } finally { await qa.browser.close(); }
});

test('conversion cannot reuse approval while the replacement preview is pending or incomplete', { skip: !web }, async () => {
  const qa = await setup();
  let release;
  try {
    const dialog = await acceptLegacyConversion(qa);
    const gate = new Promise(resolve => { release = resolve; });
    let started;
    const pending = new Promise(resolve => { started = resolve; });
    await qa.context.route(`${api}/api/products/cost-preview`, async route => {
      started(); await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...corpus.complete.cost_estimate, status: 'incomplete', total_cost: null, packaging_cost: null, issues: [{ code: 'missing_package_cost', message: 'Set package cost' }] }) });
    });
    await dialog.locator('#packageId').fill('Common pack unknown cost');
    await qa.page.getByRole('option', { name: /Common pack unknown cost/ }).click();
    await pending;
    await qa.expect(dialog.locator('#accept-conversion')).not.toBeChecked();
    await dialog.getByRole('button', { name: messages.save, exact: true }).click(); assert.equal(qa.writes.length, 0);
    release();
    await qa.expect(dialog.getByRole('region', { name: messages.costingTitle })).toContainText(messages.costingIssue_missing_package_cost);
    await qa.expect(dialog.locator('#accept-conversion')).toBeDisabled();
    await dialog.getByRole('button', { name: messages.save, exact: true }).click(); assert.equal(qa.writes.length, 0);
  } finally { release?.(); await qa.browser.close(); }
});

test('legacy product editor displays failed-save feedback without discarding the draft', { skip: !web }, async () => {
  const qa = await setup({ capability: false, saveConflict: true });
  try {
    const dialog = await qa.open('Beef teriyaki');
    await dialog.locator('#name').fill('Unsaved legacy name');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog.getByRole('alert')).toContainText(messages.productConfigurationConflict);
    await qa.expect(dialog.locator('#name')).toHaveValue('Unsaved legacy name');
    assert.equal(qa.writes.length, 1);
    assert.equal('product_type' in qa.writes[0], false);
  } finally { await qa.browser.close(); }
});

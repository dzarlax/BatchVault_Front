const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const web = process.env.COSTING_QA_WEB_URL;
const api = process.env.COSTING_QA_API_URL;
const cachedTokens = new Map();

async function setup(locale = 'en', mobile = false, account = locale) {
  const username = process.env.COSTING_QA_EDITOR_USER_PREFIX ? `${process.env.COSTING_QA_EDITOR_USER_PREFIX}${account}` : 'costing-qa';
  for (const address of [web, api]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(address).hostname));
  const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_MODULE || 'playwright', 'test'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
  try {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 900 } : { width: 1440, height: 1100 } });
  await context.route(`${web}/config.js`, route => route.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}}` }));
  if (!cachedTokens.has(username)) {
    const login = await context.request.post(`${api}/api/auth/login`, { data: { username, password: 'local-costing-qa' } });
    assert.equal(login.status(), 200);
    cachedTokens.set(username, (await login.json()).token);
  }
  const cachedToken = cachedTokens.get(username);
  await context.addInitScript(token => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify({ username: 'costing-qa' })); }, cachedToken);
  const request = async (method, route, data) => {
    const response = await context.request.fetch(`${api}/api${route}`, { method, headers: { Authorization: `Bearer ${cachedToken}` }, ...(data ? { data } : {}) });
    assert.ok(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  const currency = (await request('GET', '/workspaces/current')).currency;
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const expectedValidation = (message.location().url === `${api}/api/products/cost-preview` && message.text().includes('400')) || (message.text().startsWith('Fetch Error:') && message.text().includes('status: 400'));
    if (!expectedValidation) errors.push(message.text());
  });
  const messages = require(`../locales/${locale}/common.json`);
  const openProduct = async () => {
    const route = locale === 'en' ? '/products' : `/${locale}/products`;
    await page.goto(`${web}${route}`, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).pathname, route);
    await page.locator('.product-card').filter({ hasText: 'QA Ordinary 100 g' }).getByRole('button').click();
    return page.getByRole('region', { name: messages.costingTitle });
  };
  return { browser, context, page, expect, request, messages, openProduct, errors, currency };
  } catch (error) { await browser.close(); throw error; }
}

for (const scenario of ['cost change', 'weight initialization']) {
  test(`preview refreshes after nested packaging ${scenario}`, { skip: !web || !api }, async () => {
    const qa = await setup('en', false, scenario === 'cost change' ? 'cost' : 'weight');
    const { browser, page, expect, request, messages, openProduct, errors, currency } = qa;
    let original;
    try {
      original = (await request('GET', '/products')).find(product => product.name === 'QA Ordinary 100 g');
      assert.ok(original);
      const pkg = await request('POST', '/packages', { name: `QA nested preview ${scenario} ${Date.now()}`, net_weight_g: scenario === 'cost change' ? 100 : null, unit_cost: 10 });
      await request('PUT', `/products/${original.id}`, { name: original.name, price: original.price, package_id: pkg.id });
      const panel = await openProduct();
      if (scenario === 'cost change') await expect(panel.getByText(`Estimated cost: 310.00 ${currency}`, { exact: true })).toBeVisible();
      else await expect(panel).toContainText(messages.costingIssue_missing_package_weight);
      await page.getByRole('dialog').getByRole('button', { name: messages.addPackage, exact: true }).click();
      const packageDialog = page.getByRole('dialog').filter({ hasText: messages.costingPackagingFormats });
      await packageDialog.locator('#packagingFormatToEdit').fill(pkg.name);
      await page.getByRole('option', { name: new RegExp(pkg.name) }).click();
      assert.equal(await packageDialog.locator('select').count(), 0, 'The format selector must use the shared dropdown');
      if (scenario === 'cost change') await packageDialog.locator('#packageUnitCost').fill('20');
      else {
        await packageDialog.locator('#packageNetWeight').fill('100');
        await packageDialog.locator('#reviewPackageInitialization').check();
      }
      page.once('dialog', dialog => dialog.accept());
      const refreshed = page.waitForResponse(response => response.url() === `${api}/api/products/cost-preview` && response.request().method() === 'POST');
      await packageDialog.getByRole('button', { name: messages.costingSaveFormat, exact: true }).click();
      assert.equal((await refreshed).status(), 200);
      await expect(packageDialog).not.toBeVisible();
      await expect(panel.getByText(`Estimated cost: ${scenario === 'cost change' ? '320' : '310'}.00 ${currency}`, { exact: true })).toBeVisible();
      assert.deepEqual(errors, []);
    } finally {
      if (original) await request('PUT', `/products/${original.id}`, { name: original.name, price: original.price, package_id: original.package_id });
      await browser.close();
    }
  });
}

for (const locale of ['ru', 'rs']) {
  test(`costing editor, recipe and packaging controls are localized in ${locale}`, { skip: !web || !api }, async () => {
    const { browser, page, expect, messages, openProduct, errors } = await setup(locale, locale === 'rs');
    try {
      const panel = await openProduct();
      await expect(panel).toContainText(messages.costingReviewRecipes);
      await expect(panel).toContainText(messages.costingExclusions);
      await expect(panel.getByRole('combobox', { name: messages.costingSource, exact: true })).toBeVisible();
      assert.equal(await panel.locator('select').count(), 0);
      await panel.locator('.react-select__control:has(#costMode)').click();
      await page.getByRole('option', { name: messages.costingModeAssortment, exact: true }).click();
      await panel.getByRole('button', { name: messages.costingAddFlavour, exact: true }).click();
      await panel.locator('#component-recipe-0').fill('QA flavour 1');
      await page.getByRole('option', { name: 'QA flavour 1', exact: true }).click();
      await panel.locator('#component-grams-0').fill('50');
      await expect(panel.getByRole('alert')).toHaveText(messages.costingPreviewFailed);
      await page.getByRole('dialog').getByRole('button', { name: messages.addPackage, exact: true }).click();
      const packageDialog = page.getByRole('dialog').filter({ hasText: messages.costingPackagingFormats });
      await expect(packageDialog).toContainText(messages.costingNetWeightHelp);
      await packageDialog.getByRole('button', { name: messages.costingSaveFormat, exact: true }).click();
      await expect(packageDialog.getByRole('alert')).toHaveText(messages.costingPackageValidation);
      await expect(packageDialog).not.toContainText('Packaging cost per unit');
      assert.equal(await packageDialog.locator('select').count(), 0);
      if (process.env.COSTING_QA_SCREENSHOTS) {
        fs.mkdirSync(process.env.COSTING_QA_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.COSTING_QA_SCREENSHOTS, `costing-editor-${locale}.png`) });
      }
      await packageDialog.getByRole('button', { name: messages.cancel, exact: true }).click();
      await page.goto(`${web}/${locale}/recipes`, { waitUntil: 'networkidle' });
      await page.locator('.recipe-list-button').filter({ hasText: 'QA flavour 1' }).click();
      await expect(page.locator('.recipe-detail-panel').filter({ visible: true }).first()).toContainText(messages.costingPlannedYield);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

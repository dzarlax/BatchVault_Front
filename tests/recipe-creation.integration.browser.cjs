const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const web = process.env.COSTING_QA_WEB_URL;
const api = process.env.COSTING_QA_API_URL;

test('real backend: recipe creation and cloning persist the complete submitted composition', { skip: !web || !api }, async () => {
  for (const address of [web, api]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(address).hostname));
  const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_MODULE || 'playwright', 'test'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route(`${web}/config.js`, handler => handler.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}}` }));
    const login = await context.request.post(`${api}/api/auth/login`, { data: { username: 'costing-qa', password: 'local-costing-qa' } });
    assert.equal(login.status(), 200);
    const { token } = await login.json();
    const request = async endpoint => {
      const response = await context.request.get(`${api}/api${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status(), 200, endpoint);
      return response.json();
    };
    await context.addInitScript(token => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ username: 'costing-qa' }));
    }, token);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const strings = require('../locales/en/common.json');
    const name = `QA Complete Recipe ${Date.now()}`;
    await page.goto(`${web}/recipes`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: strings.addRecipe, exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel(strings.recipeName, { exact: true }).fill(name);
    await dialog.getByLabel(strings.costingYieldLabel).fill('300');
    for (const index of [1, 2]) {
      await dialog.getByRole('combobox', { name: strings.ingredient, exact: true }).fill(`QA flavour ${index} ingredient`);
      await page.getByRole('option', { name: new RegExp(`QA flavour ${index} ingredient`) }).click();
      await dialog.getByLabel(strings.quantity, { exact: true }).fill(String(index * 100));
      await dialog.getByRole('button', { name: strings.add, exact: true }).click();
    }
    await dialog.getByRole('button', { name: strings.save, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const created = (await request('/recipes')).find(recipe => recipe.name === name);
    assert.ok(created);
    const original = await request(`/recipes/${created.id}`);
    assert.equal(original.recipe_ingredients.length, 2);
    assert.equal(Number(original.planned_yield_g), 300);
    await page.locator('.recipe-list-button').filter({ hasText: name }).click();
    await page.locator('.recipe-detail-panel-desktop').getByRole('button', { name: strings.edit, exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: strings.cloneRecipe, exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const clone = (await request('/recipes')).find(recipe => recipe.name === `${name} (Copy)`);
    assert.ok(clone);
    const cloned = await request(`/recipes/${clone.id}`);
    const composition = recipe => recipe.recipe_ingredients.map(item => [item.ingredient_id, Number(item.quantity), item.unit]).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(composition(cloned), composition(original));
    assert.equal(Number(cloned.planned_yield_g), 300);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

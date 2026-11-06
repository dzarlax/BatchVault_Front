const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const web = process.env.COSTING_QA_WEB_URL;
const api = process.env.COSTING_QA_API_URL;

test('real backend: create fixed assortment, record order, then change costing without changing history', { skip: !web || !api }, async () => {
  for (const address of [web, api]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(address).hostname));
  const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_MODULE || 'playwright', 'test'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route(`${web}/config.js`, route => route.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}}` }));
    const response = await context.request.post(`${api}/api/auth/login`, { data: { username: 'costing-qa', password: 'local-costing-qa' } });
    assert.equal(response.status(), 200);
    const { token } = await response.json();
    const request = async (method, endpoint, data) => {
      const result = await context.request.fetch(`${api}/api${endpoint}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data ? { data } : {}) });
      assert.ok(result.ok(), `${method} ${endpoint}: ${result.status()} ${await result.text()}`);
      return result.json();
    };
    await context.addInitScript(token => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify({ username: 'costing-qa' })); }, token);
    const name = `QA New Assortment ${Date.now()}`;
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${web}/products`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add Product', exact: true }).click();
    let dialog = page.getByRole('dialog').filter({ has: page.locator('#name') });
    await dialog.locator('#product-type-assortment').check();
    await dialog.locator('#name').fill(name);
    await dialog.locator('#description').fill('Synthetic fixed content with one common package');
    await dialog.locator('#price').fill('1200');
    await dialog.locator('#packageId').fill('QA common 250 g pouch');
    await page.getByRole('option', { name: /QA common 250 g pouch/ }).click();
    const strings = require('../locales/en/common.json');
    for (let i = 0; i < 5; i++) {
      await dialog.getByRole('button', { name: strings.productAddComponent, exact: true }).click();
      await dialog.locator(`#component-product-${i}`).fill(`QA Source ${i + 1}`);
      await page.getByRole('option', { name: `QA Source ${i + 1}`, exact: true }).click();
      await dialog.locator(`#component-grams-${i}`).fill('50');
    }
    await expect(dialog.getByRole('region', { name: strings.costingTitle })).toContainText('660.00 RSD');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const created = (await request('GET', '/products')).find(product => product.name === name);
    assert.ok(created); assert.equal(created.product_type, 'assortment'); assert.equal(created.cost_estimate.total_cost, 660);
    assert.equal(created.assortment_components.length, 5);
    assert.deepEqual(created.cost_estimate.composition_details.map(row => row.quantity_g), [50, 50, 50, 50, 50]);
    const client = (await request('GET', '/clients')).find(client => client.name === 'Synthetic');
    const order = await request('POST', '/orders', { client_id: client.id, items: [{ product_id: created.id, quantity: 1, price: 1200, cost_price: 660 }] });
    assert.equal(order.items[0].cost_snapshot.provenance.components.length, 5);
    assert.equal(order.items[0].cost_snapshot.provenance.package.net_weight_g, 250);
    await page.locator('.product-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).locator('.product-card-edit').click();
    dialog = page.getByRole('dialog').filter({ has: page.locator('#name') });
    await dialog.locator('#cost-method-manual').check();
    await dialog.locator('#cost').fill('290');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const updated = await request('GET', `/products/${created.id}`);
    assert.equal(updated.cost_estimate.total_cost, 290); assert.equal(updated.assortment_components.length, 5);
    const historical = await request('GET', `/orders/${order.id}`);
    assert.equal(historical.items[0].cost_price, 660);
    assert.deepEqual(historical.items[0].cost_snapshot, order.items[0].cost_snapshot);
    await page.goto(`${web}/orders`, { waitUntil: 'networkidle' });
    await page.getByRole('row').filter({ hasText: `#${order.id}` }).getByTitle('Edit', { exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(strings.productAtOrderTime);
    await expect(page.getByRole('dialog').locator('input[type=number]').nth(2)).toHaveValue('660');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

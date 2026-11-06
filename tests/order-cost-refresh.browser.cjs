const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const web = process.env.COSTING_QA_WEB_URL;
const api = process.env.COSTING_QA_API_URL;

for (const surface of ['/', '/orders']) {
  test(`quote refresh preserves quantity and selling price on ${surface}`, { skip: !web || !api }, async () => {
    for (const address of [web, api]) {
      assert.ok(['127.0.0.1', 'localhost'].includes(new URL(address).hostname), 'Browser costing tests require isolated localhost services');
    }
    const playwright = process.env.PLAYWRIGHT_MODULE || 'playwright';
    const { chromium, expect } = require(path.join(playwright, 'test'));
    const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      await context.route(`${web}/config.js`, route => route.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}}` }));
      const login = await context.request.post(`${api}/api/auth/login`, { data: { username: 'costing-qa', password: 'local-costing-qa' } });
      assert.equal(login.status(), 200);
      const { token } = await login.json();
      const headers = { Authorization: `Bearer ${token}` };
      await context.addInitScript(({ token }) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify({ username: 'costing-qa' })); }, { token });
      const request = async (method, route, data) => {
        const response = await context.request.fetch(`${api}/api${route}`, { method, headers, ...(data ? { data } : {}) });
        assert.ok(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`);
        return response.json();
      };
      const products = await request('GET', '/products');
      const ordinary = products.find(product => product.name === 'QA Ordinary 100 g');
      assert.ok(ordinary, 'Synthetic costing fixture is required');
      await request('PATCH', `/packages/${ordinary.package_id}`, { unit_cost: 10 });
      await request('PUT', `/products/${ordinary.id}`, { name: ordinary.name, price: 600, package_id: ordinary.package_id });
      const clients = await request('GET', '/clients');
      const client = clients.find(item => item.name === 'Synthetic' && item.surname === 'Costing QA');
      assert.ok(client, 'Synthetic client is required');
      const saved = await request('POST', '/orders', { client_id: client.id, items: [{ product_id: ordinary.id, quantity: 1, price: 600, cost_price: 310 }] });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${web}${surface}`, { waitUntil: 'networkidle' });
      await page.getByRole('row').filter({ hasText: `#${saved.id}` }).getByTitle('Edit', { exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: '+ Add Product', exact: true }).click();
      await dialog.getByRole('combobox').last().fill('QA Ordinary');
      await page.getByRole('option', { name: ordinary.name, exact: true }).click();
      const item = dialog.locator('.order-item-card').last();
      await item.locator('input[type=number]').nth(0).fill('5');
      await expect(item.locator('input[type=number]').nth(1)).toHaveValue('600');
      await request('PATCH', `/packages/${ordinary.package_id}`, { unit_cost: 20 });
      await request('PUT', `/products/${ordinary.id}`, { name: ordinary.name, price: 650, package_id: ordinary.package_id });
      const conflict = page.waitForResponse(response => response.url() === `${api}/api/orders/${saved.id}` && response.request().method() === 'PUT');
      await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
      assert.equal((await conflict).status(), 409);
      await item.getByRole('button', { name: 'Refresh estimated cost', exact: true }).click();
      await expect(item.locator('input[type=number]').nth(2)).toHaveValue('320');
      await expect(item.locator('input[type=number]').nth(0)).toHaveValue('5');
      await expect(item.locator('input[type=number]').nth(1)).toHaveValue('600');
      let releaseRead;
      const readGate = new Promise(resolve => { releaseRead = resolve; });
      let readStarted;
      const started = new Promise(resolve => { readStarted = resolve; });
      let writes = 0;
      await context.route(`${api}/api/orders/${saved.id}`, async route => {
        if (route.request().method() === 'GET') {
          readStarted();
          await readGate;
        } else if (route.request().method() === 'PUT') writes++;
        await route.continue();
      });
      const put = page.waitForResponse(response => response.url() === `${api}/api/orders/${saved.id}` && response.request().method() === 'PUT');
      const saveButton = dialog.getByRole('button', { name: 'Save Changes', exact: true });
      await saveButton.click();
      assert.equal((await put).status(), 200);
      await started;
      try {
        await expect(saveButton).toBeDisabled();
        await expect(item.locator('input[type=number]').nth(0)).toBeDisabled();
        await expect(dialog.getByRole('button', { name: '+ Add Product', exact: true })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
        await saveButton.evaluate(button => button.click());
        assert.equal(writes, 1, 'A pending post-save read must never permit a second PUT');
      } finally { releaseRead(); }
      await expect(dialog).not.toBeVisible();
      const result = await request('GET', `/orders/${saved.id}`);
      assert.equal(result.items.length, 2);
      assert.equal(result.items.find(row => row.id === saved.items[0].id).cost_price, 310);
      const added = result.items.find(row => row.id !== saved.items[0].id);
      assert.equal(added.quantity, 5);
      assert.equal(added.price, 600);
      assert.equal(added.cost_price, 320);
      assert.equal(added.cost_snapshot.source, 'recipe');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

// Set the expected currency only when using a matching disposable fixture.
test('recipe rates, product totals, and previews use the workspace currency', {
  skip: !web || !api || !process.env.COSTING_QA_CURRENCY,
}, async () => {
  for (const address of [web, api]) {
    assert.ok(['127.0.0.1', 'localhost'].includes(new URL(address).hostname));
  }
  const currency = process.env.COSTING_QA_CURRENCY;
  const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_MODULE || 'playwright', 'test'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.route(`${web}/config.js`, route => route.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}}` }));
    const login = await context.request.post(`${api}/api/auth/login`, { data: { username: 'costing-qa', password: 'local-costing-qa' } });
    assert.equal(login.status(), 200);
    const { token } = await login.json();
    await context.addInitScript(token => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ username: 'costing-qa' }));
    }, token);
    const page = await context.newPage();
    await page.goto(`${web}/recipes`, { waitUntil: 'networkidle' });
    await page.locator('.recipe-list-button').filter({ hasText: 'QA flavour 1' }).click();
    await expect(page.locator('.recipe-detail-panel-desktop').getByText(`Finished content: 3000.00 ${currency} / kg`, { exact: true })).toBeVisible();
    await page.goto(`${web}/products`, { waitUntil: 'networkidle' });
    const card = page.locator('.product-card').filter({ hasText: 'QA Ordinary 100 g' });
    await card.locator('.product-card-details > summary').click();
    await expect(card.locator('.product-card-financial-detail')).toContainText(`320.00 ${currency}`);
    await card.getByRole('button', { name: 'Edit QA Ordinary 100 g' }).click();
    const panel = page.getByRole('region', { name: 'Cost calculation' });
    await expect(panel).toContainText(currency);
    if (currency !== 'RSD') await expect(panel).not.toContainText('RSD');
  } finally { await browser.close(); }
});

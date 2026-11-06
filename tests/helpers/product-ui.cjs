const assert = require('node:assert/strict');
const path = require('node:path');
const corpus = require('../fixtures/product-types-v1.json');
const web = process.env.COSTING_QA_WEB_URL;
const api = 'http://127.0.0.1:18088';

async function setup({ locale = 'en', mobile = false, capability = true, refreshRequired = false, saveConflict = false, dark = false, viewport, currency = 'RSD', extraProducts = [], previewFailure = false } = {}) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(web).hostname));
  const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_MODULE || 'playwright', 'test'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
  const context = await browser.newContext({ viewport: viewport || (mobile ? { width: 390, height: 900 } : { width: 1440, height: 1100 }) });
  const pkg = { id: 43, name: 'Ordinary pack 100 g', net_weight_g: 100, unit_cost: 15 };
  const recipes = corpus.complete.cost_estimate.composition_details.map(row => ({ id: row.recipe_id, name: row.product_name, planned_yield_g: 500, servings: 1 }));
  const sources = recipes.map((recipe, i) => ({ ...corpus.legacy_manual, id: 101 + i, name: recipe.name, description: 'Synthetic QA content', price: 300, cost: 999,
    package_id: 43, package: pkg, product_type: 'standard', recipe_id: recipe.id, cost_recipe_id: recipe.id, configuration_version: 1, composition_basis: null,
    cost_mode: 'recipe', cost_estimate: { ...corpus.complete.cost_estimate, source: 'recipe', total_cost: 135, content_cost: 120, packaging_cost: 15, net_weight_g: 100, composition_details: [] } }));
  let products = [...sources, structuredClone(corpus.complete), { ...structuredClone(corpus.manual), id: 301, name: 'Manual assortment' },
    { ...structuredClone(corpus.complete), id: 302, name: 'Legacy recipe assortment', composition_basis: 'legacy_recipes', assortment_components: [], components: corpus.complete.cost_estimate.components.map(row => ({ recipe_id: row.recipe_id, quantity_g: row.quantity_g })) }];
  products.push(...extraProducts);
  const workspace = { id: 1, name: 'Isolated fixture', slug: 'fixture', role: 'owner', currency, ...(capability ? { capabilities: { product_types_v1: true } } : {}) };
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
    else if (endpoint === '/api/products/cost-preview') { if (previewFailure) { await route.fulfill({status:503, contentType:'application/json',body:JSON.stringify({error:'Synthetic preview failure'})}); return; } const input = request.postDataJSON(); result = { ...corpus.complete.cost_estimate, ...(input.package_id === 44 ? { total_cost: 290, packaging_cost: 40 } : {}) }; }
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
  return { browser, context, page, expect, writes, open, errors, get detailReads() { return detailReads; }, products };
}

module.exports = { setup };

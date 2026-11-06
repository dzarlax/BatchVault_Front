const assert = require('node:assert/strict');
const path = require('node:path');
const corpus = require('../fixtures/product-types-v1.json');

async function setup({ route = '/orders', locale = 'en', viewport = { width: 1280, height: 720 }, dark = false, empty = false, failures = [] } = {}) {
  const web = process.env.COSTING_QA_WEB_URL;
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(web).hostname));
  const { chromium, expect } = require(path.join(process.env.PLAYWRIGHT_MODULE || 'playwright', 'test'));
  const browser = await chromium.launch({ headless: true, ...(process.env.COSTING_QA_CHROME ? { executablePath: process.env.COSTING_QA_CHROME } : {}) });
  const context = await browser.newContext({ viewport });
  const api = 'http://127.0.0.1:18088';
  const workspace = { id: 1, name: 'Synthetic workspace', slug: 'fixture', role: 'owner', currency: 'RSD', capabilities: { product_types_v1: true } };
  const ingredients = [
    { id: 1, name: 'Synthetic beef', type: 'meat', unit: 'g', quantity: 1000, cost_per_unit: 1 },
    { id: 2, name: 'Synthetic pepper', type: 'spice', unit: 'g', quantity: 100, cost_per_unit: 2 },
  ];
  const workspaceIngredients = ingredients.map((ingredient, i) => ({ id: i + 11, ingredient_id: ingredient.id, ingredient, allowed_units: ['g', 'kg'], latest_price: { id: i + 21, ingredient_id: ingredient.id, price: 100 + i, quantity: 100, unit: 'g', date: '2026-11-01T12:00:00Z', ingredient } }));
  const recipes = [
    { id: 1, name: 'Synthetic classic', planned_yield_g: 500, recipe_ingredients: [{ ingredient_id: 1, ingredient: ingredients[0], quantity: 600, unit: 'g', cost: 600 }], total_cost: 600, cost_per_serving: 120, servings: 5 },
    { id: 2, name: 'Synthetic spicy', planned_yield_g: 400, recipe_ingredients: [{ ingredient_id: 2, ingredient: ingredients[1], quantity: 10, unit: 'g', cost: 20 }], total_cost: 20, cost_per_serving: 5, servings: 4 },
  ];
  const packages = [{ id: 43, name: 'Synthetic 100 g pack', net_weight_g: 100, unit_cost: 15 }];
  const products = recipes.map((recipe, i) => ({ ...structuredClone(corpus.legacy_manual), id: i + 101, name: `Synthetic product ${i + 1}`, description: 'Synthetic fixture only', image: '', package_id: 43, package: packages[0], product_type: 'standard', cost_mode: 'manual', recipe_id: recipe.id, cost_recipe_id: recipe.id, price: 300, cost: 120, options: [{ recipe_id: recipe.id }], cost_estimate: { ...structuredClone(corpus.complete.cost_estimate), source: 'manual', total_cost: 120, composition_details: [] } }));
  const clients = [{ id: 1, name: 'Synthetic', surname: 'Client', source: 'other', phone: '+000000', telegram: '', instagram: '', address: '' }];
  const orders = [1, 2].map(id => ({ id, client_id: 1, client: clients[0], status: id === 1 ? 'new' : 'finished', comment: 'Synthetic note', created_at: '2026-11-01T12:00:00Z', items: [{ id, product_id: 101, quantity: id + 1, price: 300, cost_price: 120 }] }));
  const data = { '/api/orders': orders, '/api/clients': clients, '/api/products': products, '/api/recipes': recipes, '/api/workspace-ingredients': workspaceIngredients, '/api/prices': workspaceIngredients.map(item => item.latest_price), '/api/packages': packages };
  if (empty) Object.keys(data).forEach(key => { data[key] = []; });
  const failed = new Set(failures);
  const requests = [];
  const writes = [];
  await context.route('**/config.js', handler => handler.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}}` }));
  await context.route(`${api}/**`, async handler => {
    const request = handler.request();
    const url = new URL(request.url());
    const endpoint = url.pathname;
    const method = request.method();
    requests.push({ endpoint, method });
    if (failed.has(endpoint) || failed.has(`${method} ${endpoint}`)) return handler.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic unavailable response' }) });
    let result;
    if (endpoint === '/api/workspaces') result = [workspace];
    else if (endpoint === '/api/workspaces/current') result = workspace;
    else if (endpoint === '/api/dashboard') result = { recent_orders: data['/api/orders'], total_products: products.length, total_orders: orders.length, order_type_distribution: [], ingredient_type_distribution: [] };
    else if (endpoint === '/api/dashboard/profit') result = { total_revenue: 1500, total_costs: 600, total_profit: 900, order_count: 2 };
    else if (endpoint === '/api/products/cost-preview') result = corpus.complete.cost_estimate;
    else if (method === 'GET') {
      if (endpoint === '/api/recipes' && url.searchParams.has('ingredient_id')) result = (data[endpoint] || []).filter(recipe => recipe.recipe_ingredients.some(item => String(item.ingredient_id) === url.searchParams.get('ingredient_id')));
      else if (data[endpoint]) result = data[endpoint];
      else { const match = endpoint.match(/^(\/api\/(?:orders|products|recipes))\/(\d+)$/); result = match ? data[match[1]].find(item => item.id === Number(match[2])) : []; }
    } else {
      const body = request.postData() ? request.postDataJSON() : {};
      writes.push({ endpoint, method, body });
      const ingredientWrite = endpoint.match(/^\/api\/recipes\/(\d+)\/ingredients(?:\/(\d+))?$/);
      const match = endpoint.match(/^(\/api\/(?:orders|products|recipes))\/(\d+)$/);
      if (ingredientWrite) {
        const recipe = data['/api/recipes'].find(item => item.id === Number(ingredientWrite[1]));
        if (method === 'DELETE') recipe.recipe_ingredients = recipe.recipe_ingredients.filter(item => item.ingredient_id !== Number(ingredientWrite[2]));
        else recipe.recipe_ingredients.push({ ...body, ingredient: ingredients.find(item => item.id === body.ingredient_id) });
        result = recipe;
      } else if (match) {
        const item = data[match[1]].find(item => item.id === Number(match[2]));
        if (method === 'DELETE') data[match[1]] = data[match[1]].filter(candidate => candidate !== item);
        else Object.assign(item, body);
        result = item || {};
      } else if (data[endpoint] && method === 'POST') { result = { ...body, id: 500, recipe_ingredients: [] }; data[endpoint].push(result); }
      else result = { ...body, id: 501 };
    }
    return handler.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result ?? {}) });
  });
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ userID: 1, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'fixture'].join('.');
  await context.addInitScript(({ token, dark }) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify({ id: 1, username: 'synthetic-ui' })); localStorage.setItem('theme', dark ? 'dark' : 'light'); }, { token, dark });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const goto = target => page.goto(`${web}${locale === 'en' ? '' : `/${locale}`}${target}`, { waitUntil: 'networkidle' });
  await goto(route);
  return { page, context, browser, expect, requests, writes, errors, data, failed, goto };
}

module.exports = { setup };

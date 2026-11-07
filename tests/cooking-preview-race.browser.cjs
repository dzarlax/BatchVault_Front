const assert = require('node:assert/strict');

const web = process.env.COOKING_PREVIEW_QA_WEB_URL || 'http://127.0.0.1:3015';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(web).hostname)) throw new Error('Cooking preview browser QA is restricted to localhost.');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = playwright;
const api = 'http://127.0.0.1:18089';
const workspace = { id: 7, name: 'Preview regression fixture', slug: 'preview-fixture', role: 'owner', currency: 'RSD', capabilities: { cooking_v1: true } };
const recipe = {
  id: 31, name: 'QA test recipe', planned_yield_g: 500, servings: 1, total_cost: 0,
  recipe_ingredients: [
    { id: 311, recipe_id: 31, ingredient_id: 41, quantity: '1', unit: 'kg', ingredient: { id: 41, name: 'QA base meat', type: 'base', unit: 'kg' } },
    { id: 312, recipe_id: 31, ingredient_id: 42, quantity: '100', unit: 'g', ingredient: { id: 42, name: 'QA spice', type: 'spice', unit: 'g' } },
  ],
};
let recipeFixture = recipe;
let recipeFetches = 0;
const product = { id: 51, name: 'QA 100 g pack', product_type: 'standard', package_id: 61, net_weight_g: '100', package: { id: 61, name: '100 g', net_weight_g: '100' }, recipe_id: 31, price: 100, cost: 50 };
const order = { id: 104, client_id: 1, client: { id: 1, name: 'QA Client' }, status: 'new', items: [{ id: 1, product_id: 51, quantity: 1, price: 100, cost_price: 50 }] };
const makeFlavor = name => ({ recipe_id: 31, name, target_finished_g: '100', suggested_meat_g: '200', base_recipe_ingredient_id: 311, recipe_snapshot: { ingredients: [{ recipe_ingredient_id: 311, name: 'QA base meat', type: 'base', quantity: '1', unit: 'kg' }] }, issues: [] });
const zeroIdIngredients = [
  { ingredient_id: 42, recipe_ingredient_id: 0, name: 'Same ingredient grams', quantity: '12', unit: 'g', type: 'spice' },
  { ingredient_id: 42, recipe_ingredient_id: 0, name: 'Same ingredient millilitres', quantity: '8', unit: 'ml', type: 'spice' },
  { ingredient_id: 42, recipe_ingredient_id: 0, name: 'Same ingredient base grams', quantity: '3', unit: 'g', type: 'base' },
];
const planPreview = name => ({ plan: { flavors: [makeFlavor(name)], products: [{ id: product.id, name: product.name, net_weight_g: '100' }], issues: [] }, source_signature: name, stock_version: 1, active_runs: [], stock: { version: 1, lots: [] } });
const cookingRun = (id, state) => ({
  id, title: `QA ${state} run`, date: '2026-11-07T10:00:00Z', state, version: 1, source_signature: 'qa', stock_version: 1,
  plan_input: { order_ids: [104], extras: [] },
  plan: { flavors: [makeFlavor('QA test recipe')], products: [{ id: product.id, name: product.name, net_weight_g: '100' }], issues: [] },
  preparation: state === 'prepared' || state === 'cooked' ? { prepared_meat_g: '200', allocated_meat_g: '200', unallocated_meat_g: '0', flavors: [{ ...makeFlavor('QA test recipe'), actual_meat_g: '200', ingredients: zeroIdIngredients }], ingredients_total: zeroIdIngredients } : null,
  actual_output: state === 'cooked' ? [{ recipe_id: 31, quantity_g: '500', name: 'QA test recipe' }] : [], lots: [], events: [], order_changes: [],
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.COOKING_QA_CHROME ? { executablePath: process.env.COOKING_QA_CHROME } : {}), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/config.js' && url.origin === new URL(web).origin) {
      return route.fulfill({ contentType: 'application/javascript', body: `window.__RUNTIME_CONFIG__={API_URL:${JSON.stringify(api)}};` });
    }
    if (url.pathname.startsWith('/api/') && url.origin !== api) {
      throw new Error('Cooking preview QA blocked a non-fixture API origin.');
    }
    return route.continue();
  });
  const firstPlan = deferred();
  const firstPrep = deferred();
  const firstPacking = deferred();
  let planCalls = 0;
  let prepCalls = 0;
  const calculatorPreviewBodies = [];
  let packingCalls = 0;
  let resolvePlanStarted;
  let resolvePrepStarted;
  let resolvePackingStarted;
  const planStarted = new Promise(resolve => { resolvePlanStarted = resolve; });
  const prepStarted = new Promise(resolve => { resolvePrepStarted = resolve; });
  const packingStarted = new Promise(resolve => { resolvePackingStarted = resolve; });
  const errors = [];
  const duplicateKeyWarnings = [];
  await context.route(`${api}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathName = url.pathname;
    let result = {};
    if (pathName === '/api/workspaces') result = [workspace];
    else if (pathName === '/api/workspaces/current') result = workspace;
    else if (pathName === '/api/orders') result = [order];
    else if (pathName === '/api/products') result = [product];
    else if (pathName === '/api/recipes') { recipeFetches++; result = [recipeFixture]; }
    else if (pathName === '/api/workspace-ingredients') result = [];
    else if (pathName === '/api/cooking-runs') result = { items: [], next_cursor: null };
    else if (pathName === '/api/cooking-stock') result = { version: 1, lots: [], events: [] };
    else if (pathName === '/api/cooking-runs/777') result = cookingRun(777, 'draft');
    else if (pathName === '/api/cooking-runs/778') result = cookingRun(778, 'cooked');
    else if (pathName === '/api/cooking-runs/779') result = cookingRun(779, 'prepared');
    else if (pathName === '/api/cooking/plan-preview' && method === 'POST') {
      planCalls++;
      if (planCalls === 1) { resolvePlanStarted(); await firstPlan.promise; result = planPreview('Obsolete preview'); }
      else result = planPreview('Fresh preview');
    } else if (pathName === '/api/cooking/preparation-preview' && method === 'POST') {
      prepCalls++;
      const previewBody = request.postDataJSON();
      calculatorPreviewBodies.push(previewBody);
      if (prepCalls === 1) { resolvePrepStarted(); await firstPrep.promise; result = { ...cookingRun(777, 'prepared').preparation, flavors: [{ ...makeFlavor('QA test recipe'), actual_meat_g: '200', ingredients: [{ ingredient_id: 42, recipe_ingredient_id: 312, name: 'Old marinade', quantity: '9', unit: 'g' }] }] }; }
      else result = { ...cookingRun(777, 'prepared').preparation, flavors: [{ ...makeFlavor('QA test recipe'), actual_meat_g: '300', ingredients: previewBody.flavors?.[0]?.base_recipe_ingredient_id === 313 ? zeroIdIngredients : [{ ingredient_id: 42, recipe_ingredient_id: 312, name: 'Fresh marinade', quantity: '12', unit: 'g', type: 'spice' }] }] };
    } else if (pathName === '/api/cooking-runs/778/packing-preview' && method === 'POST') {
      packingCalls++;
      if (packingCalls === 1) { resolvePackingStarted(); await firstPacking.promise; result = { total_packs: 1, consumption: [], remaining: [] }; }
      else result = { total_packs: 2, consumption: [], remaining: [] };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  const page = await context.newPage();
  const mutationRequests = [];
  page.on('request', request => {
    if (request.method() === 'POST' && (/\/api\/cooking-runs(?:\/779\/results|\/778\/packings)$/.test(new URL(request.url()).pathname) || new URL(request.url()).pathname === '/api/cooking-runs' || new URL(request.url()).pathname === '/api/cooking-stock/adjustments')) mutationRequests.push(new URL(request.url()).pathname);
  });
  page.on('pageerror', error => errors.push(error.name));
  page.on('console', message => { if (message.type() === 'error' && /same key|unique "key"/i.test(message.text())) duplicateKeyWarnings.push(message.text()); });
  await page.addInitScript(() => {
    const token = ['eyJhbGciOiJIUzI1NiJ9', btoa(JSON.stringify({ userID: 7, exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=/g, ''), 'fixture'].join('.');
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ id: 7, userID: 7, username: 'cooking-preview-test' }));
    localStorage.setItem('workspace:selected:7', '7');
    sessionStorage.setItem('workspace:validated-user-id', '7');
  });

  try {
    await page.goto(`${web}/cooking`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Plan a batch' }).waitFor();
    await page.getByRole('checkbox', { name: /#104/ }).check();
    await page.getByRole('button', { name: 'Preview plan' }).click();
    await planStarted;
    await page.getByRole('combobox', { name: 'Choose Recipe' }).click();
    await page.getByRole('option', { name: 'QA test recipe', exact: true }).click();
    await page.getByLabel('Finished grams').fill('100');
    firstPlan.resolve();
    await page.waitForTimeout(300);
    assert.equal(await page.getByRole('button', { name: 'Start cooking run' }).count(), 0, 'An obsolete request must not restore an old plan or enable creation');
    assert.equal(await page.getByText('Obsolete preview').count(), 0);
    await page.getByRole('button', { name: 'Preview plan' }).click();
    await page.getByText('Fresh preview').waitFor();
    await page.getByRole('button', { name: 'Start cooking run' }).waitFor();

    const blockJournalWrites = () => page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__restoreJournalStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (key, value) {
        if (String(key).startsWith('cooking:operation:')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    const restoreJournalWrites = () => page.evaluate(() => window.__restoreJournalStorage?.());
    await blockJournalWrites();
    await page.getByRole('button', { name: 'Start cooking run' }).click();
    await page.getByText('Your browser could not save this action. No request was sent. Free browser storage and try again.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Start cooking run' }).isEnabled(), true, 'Journal failure must release the create button');
    assert.equal(await page.getByText('A create request has an unresolved outcome. Retry the exact saved request before changing this plan.').count(), 0, 'Journal failure must not create a pending operation without a saved body');
    assert.deepEqual(mutationRequests, [], 'Create must not be sent if its retry body cannot be journaled');
    await restoreJournalWrites();

    const adjustment = page.locator('.cooking-stock-adjustment');
    await adjustment.getByRole('combobox', { name: 'Recipe', exact: true }).click();
    await page.getByRole('option', { name: 'QA test recipe', exact: true }).click();
    await adjustment.locator('input[inputmode="decimal"]').fill('1000');
    await adjustment.locator('.cooking-stock-form input').last().fill('QA initial stock');
    await blockJournalWrites();
    await adjustment.getByRole('button', { name: 'Save adjustment' }).click();
    await page.getByText('Your browser could not save this action. No request was sent. Free browser storage and try again.').waitFor();
    assert.equal(await adjustment.getByRole('button', { name: 'Save adjustment' }).isEnabled(), true, 'Journal failure must release the stock adjustment button');
    assert.equal(await page.getByText('A stock change has an unresolved outcome. Retry the exact saved request before editing stock.').count(), 0, 'Journal failure must not create a pending stock action without a saved body');
    assert.deepEqual(mutationRequests, [], 'Stock adjustment must not be sent if its retry body cannot be journaled');
    await restoreJournalWrites();

    await page.goto(`${web}/cooking/777`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Main ingredient and marinade' }).waitFor();
    await page.locator('.cooking-total-input input').fill('200');
    await page.locator('.cooking-actual-grid input[inputmode="decimal"]').first().fill('200');
    await page.getByRole('button', { name: 'Calculate marinade' }).click();
    await prepStarted;
    await page.locator('.cooking-total-input input').fill('300');
    firstPrep.resolve();
    await page.waitForTimeout(300);
    assert.equal(await page.getByText('Old marinade').count(), 0, 'An obsolete preparation response must not restore its summary');
    assert.equal(await page.getByRole('button', { name: 'Save preparation' }).count(), 0, 'An obsolete preparation preview must not be saveable');

    await page.goto(`${web}/cooking/778`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Usable yield and packing' }).waitFor();
    await page.locator('.cooking-pack-list input').first().fill('1');
    await page.getByRole('button', { name: 'Preview packing' }).click();
    await packingStarted;
    await page.locator('.cooking-pack-list input').first().fill('2');
    firstPacking.resolve();
    await page.waitForTimeout(300);
    assert.equal(await page.getByText(/Total packs: 1/).count(), 0, 'An obsolete later-packing response must not restore its summary');
    assert.equal(await page.getByRole('button', { name: 'Save this packing' }).isDisabled(), true, 'Changed packing counts require a fresh preview');
    await page.getByRole('button', { name: 'Preview packing' }).click();
    await page.getByText(/Total packs: 2/).waitFor();

    const laterCount = page.locator('.cooking-pack-list input').first();
    await laterCount.fill('-1');
    await page.getByText('Enter a whole pack count of zero or more for each product.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Preview packing' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Save this packing' }).isDisabled(), true);
    assert.equal(await page.getByText(/Total packs: 2/).count(), 0, 'An old packing summary must disappear for a negative count');
    await laterCount.fill('1.5');
    await page.getByText('Enter a whole pack count of zero or more for each product.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Preview packing' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Save this packing' }).isDisabled(), true);

    await page.goto(`${web}/cooking/779`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Usable yield and packing' }).waitFor();
    assert.equal(await page.locator('.cooking-marinade .cooking-stock-row').count(), 3, 'Combined ingredient rows with zero recipe-row IDs must render distinctly');
    assert.deepEqual(duplicateKeyWarnings, [], 'Cooking detail ingredient lists must not produce duplicate React key warnings');
    await page.locator('.cooking-actual-grid input[inputmode="decimal"]').first().fill('500');
    const initialCount = page.locator('.cooking-pack-list input').first();
    await initialCount.fill('-1');
    await page.getByText('Enter a whole pack count of zero or more for each product.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Preview packing' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Save output' }).isDisabled(), true, 'Invalid initial packaging must block saving the usable yield');
    await initialCount.fill('1.5');
    await page.getByText('Enter a whole pack count of zero or more for each product.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save output' }).isDisabled(), true);
    assert.deepEqual(mutationRequests, [], 'Invalid counts must never submit a result or packing mutation');

    await page.goto(`${web}/recipes`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    const serverWeight = page.getByLabel(/Recipe base weight/);
    await serverWeight.fill('2000');
    await page.getByRole('button', { name: 'Calculate marinade' }).click();
    await page.getByText('Fresh marinade').waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    await page.locator('.modal.show').waitFor({ state: 'visible' });
    assert.equal(await page.getByLabel(/Recipe base weight/).inputValue(), '2000');
    assert.equal(await page.locator('.modal.show .list-group-item').count(), 0, 'Server mode must clear stale rows on reopen until a fresh preview');

    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    recipeFixture = {
      ...recipeFixture,
      recipe_ingredients: [
        { id: 313, recipe_id: 31, ingredient_id: 43, quantity: '2', unit: 'kg', ingredient: { id: 43, name: 'QA replacement meat', type: 'base', unit: 'kg' } },
        recipeFixture.recipe_ingredients[1],
      ],
    };
    await page.waitForTimeout(5500);
    const recipeRefresh = page.waitForResponse(response => new URL(response.url()).pathname === '/api/recipes');
    await page.bringToFront();
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
    await recipeRefresh;
    await page.waitForFunction(() => document.body.innerText.includes('QA replacement meat'));
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    const replacementWeight = page.getByLabel(/Recipe base weight/);
    await replacementWeight.waitFor();
    assert.equal(await replacementWeight.inputValue(), '2000', 'A unique replacement base should be selected and normalized to grams');
    assert.equal(await page.locator('.modal.show .list-group-item').count(), 0, 'Recipe-content refresh must clear the old server preview');
    await page.getByRole('button', { name: 'Calculate marinade' }).click();
    await page.getByText('Same ingredient grams').waitFor();
    assert.equal(await page.locator('.modal.show .list-group-item').count(), 3, 'Zero recipe-row IDs must not collapse server calculation rows with distinct ingredient grouping dimensions');
    assert.equal(calculatorPreviewBodies.at(-1).flavors[0].base_recipe_ingredient_id, 313, 'A preview after same-ID recipe refresh must use the replacement base row');
    assert.deepEqual(duplicateKeyWarnings, [], 'Server calculation rows must not produce duplicate React key warnings');

    workspace.capabilities.cooking_v1 = false;
    await page.goto(`${web}/recipes`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    const weight = page.getByLabel(/Recipe base weight/);
    await weight.fill('4000');
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.getByRole('button', { name: 'Calculate', exact: true }).click();
    await page.locator('.modal.show').waitFor({ state: 'visible' });
    assert.equal(await page.getByLabel(/Recipe base weight/).inputValue(), '4000');
    const calculatorRows = await page.locator('.modal.show .list-group').innerText();
    assert.match(calculatorRows, /200(?:\.00)?\s*g/, `Expected reopened calculator to rescale from edited weight; got: ${calculatorRows}`);
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify({ result: 'passed', checks: ['late-plan-response-discarded-after-extras-edit', 'create-and-stock-journal-quota-failures-release-busy-without-writing', 'late-preparation-response-discarded-after-weight-edit', 'later-pack-preview-invalidated-after-count-edit', 'negative-and-fractional-pack-counts-block-preview-and-save', 'server-calculator-clears-stale-rows-on-reopen', 'same-id-recipe-content-refresh-reconciles-replacement-base', 'zero-recipe-row-id-ingredient-keys', 'legacy-calculator-recomputes-on-reopen'], calls: { planCalls, prepCalls, packingCalls, recipeFetches }, blockedMutations: mutationRequests.length, pageErrors: errors.length, duplicateKeyWarnings: duplicateKeyWarnings.length }) + '\n');
  } finally {
    firstPlan.resolve(); firstPrep.resolve(); firstPacking.resolve();
    await context.close();
    await browser.close();
  }
}

main().catch(error => {
  process.stderr.write(`Cooking preview browser regression failed: ${error.name}: ${error.message}\n`);
  process.exitCode = 1;
});

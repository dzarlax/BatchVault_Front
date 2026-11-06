const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/workflow-ui.cjs');

const enabled = Boolean(process.env.COSTING_QA_WEB_URL);
const sizes = [[390, 844], [768, 1024], [991, 768], [992, 768], [1280, 720], [1360, 768], [1440, 900]];
const pages = [
  { route: '/products', endpoint: '/api/products', content: '.product-card', visible: 'Synthetic product 1' },
  { route: '/orders', endpoint: '/api/orders', content: '.orders-desktop-table', visible: 'Synthetic' },
  { route: '/recipes', endpoint: '/api/recipes', content: '.recipe-list-button', visible: 'Synthetic classic' },
  { route: '/clients', endpoint: '/api/clients', content: '.client-card', visible: 'Synthetic' },
  { route: '/ingredients', endpoint: '/api/workspace-ingredients', content: '.workspace-ingredients-table', visible: 'Synthetic beef' },
  { route: '/prices', endpoint: '/api/prices', content: '.prices-table', visible: 'Synthetic beef' },
];

async function assertNoOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
}

async function waitForText(qa, selector, text) {
  await qa.expect(qa.page.locator(selector).filter({ hasText: text }).first()).toBeVisible();
}

async function loadFilteredEmpty(qa, route, strings) {
  const filters = qa.page.locator('.filter-disclosure-toggle');
  await filters.click();
  if (route === '/products') {
    await qa.page.locator('#product-type-filter').click();
    await qa.page.getByRole('option', { name: strings.productTypeAssortment, exact: true }).click();
  } else if (route === '/orders') {
    await qa.page.getByRole('combobox', { name: strings.status }).click();
    await qa.page.getByRole('option', { name: strings.canceled, exact: true }).click();
  } else if (route === '/recipes') {
    await qa.page.getByLabel(strings.searchRecipes).fill('no matching synthetic recipe');
  } else if (route === '/clients') {
    await qa.page.getByLabel(strings.search).fill('no matching synthetic client');
  } else if (route === '/ingredients') {
    await qa.page.getByLabel(strings.search).fill('no matching synthetic ingredient');
  } else {
    await qa.page.locator('input[type="date"]').fill('2030-01-01');
  }
  await qa.expect(qa.page.locator('.empty-state')).toBeVisible();
  await qa.expect(qa.page.locator('.empty-state').getByRole('button', { name: strings.clear, exact: true })).toBeVisible();
}

for (const scenario of pages) {
  test(`${scenario.route} recovers from its initial 503 without leaving a skeleton`, { skip: !enabled }, async () => {
    const qa = await setup({ route: scenario.route, failures: [scenario.endpoint] });
    try {
      const strings = require(`../locales/en/common.json`);
      await qa.expect(qa.page.locator('.error-state[role="alert"]')).toBeVisible();
      await qa.expect(qa.page.locator('.skeleton, .table-skeleton, .product-skeleton, .recipe-card-skeleton')).toHaveCount(0);
      qa.failed.delete(scenario.endpoint);
      await qa.page.getByRole('button', { name: strings.tryAgain, exact: true }).click();
      await waitForText(qa, scenario.content, scenario.visible);
      await qa.expect(qa.page.locator('.error-state[role="alert"]')).toHaveCount(0);
      await qa.expect(qa.page.locator('.products-grid .skeleton, .recipe-workbench-loading')).toHaveCount(0);
      assert.deepEqual(qa.errors, []);
    } finally { await qa.browser.close(); }
  });
}

test('orders and products unblock creation after missing reference data recovers', { skip: !enabled }, async () => {
  for (const scenario of [
    { route: '/orders', failures: ['/api/clients'], button: 'createOrder' },
    { route: '/products', failures: ['/api/recipes'], button: 'addProduct' },
    { route: '/products', failures: ['/api/packages'], button: 'addProduct' },
  ]) {
    const qa = await setup({ route: scenario.route, failures: scenario.failures });
    try {
      const strings = require('../locales/en/common.json');
      const create = qa.page.getByRole('button', { name: strings[scenario.button], exact: true }).first();
      await qa.expect(create).toBeDisabled();
      for (const endpoint of scenario.failures) qa.failed.delete(endpoint);
      await qa.page.getByRole('button', { name: strings.tryAgain, exact: true }).click();
      await qa.expect(create).toBeEnabled();
      assert.deepEqual(qa.errors, []);
    } finally { await qa.browser.close(); }
  }
});

test('empty datasets and filtered-empty results stay distinct on all six list pages', { skip: !enabled }, async () => {
  for (const scenario of pages) {
    const empty = await setup({ route: scenario.route, empty: true });
    try {
      await empty.expect(empty.page.locator('.empty-state')).toBeVisible();
      await empty.expect(empty.page.locator('.empty-state').getByRole('button')).toBeVisible();
    } finally { await empty.browser.close(); }

    const filtered = await setup({ route: scenario.route, viewport: { width: 390, height: 844 } });
    try {
      await loadFilteredEmpty(filtered, scenario.route, require('../locales/en/common.json'));
      await assertNoOverflow(filtered.page);
    } finally { await filtered.browser.close(); }
  }
});

test('order cards disclose matching totals, hide the table on mobile, and fit every breakpoint', { skip: !enabled }, async () => {
  const qa = await setup({ route: '/orders', viewport: { width: 390, height: 844 } });
  try {
    const card = qa.page.locator('.order-mobile-card').first();
    const details = card.locator('details.order-mobile-card-details');
    await qa.expect(card).toBeVisible();
    await qa.expect(qa.page.locator('.orders-desktop-table')).toBeHidden();
    await qa.expect(card.locator('.order-mobile-card-total')).toContainText('600');
    await qa.expect(details.locator('details[open]')).toHaveCount(0);
    await details.locator('summary').click();
    await qa.expect(details.locator('ul')).toContainText('Synthetic product 1');
    await qa.expect(details.locator('dl')).toContainText('240');
    await qa.expect(details.locator('dl')).toContainText('360');
    await assertNoOverflow(qa.page);

    for (const [width, height] of sizes) {
      await qa.page.setViewportSize({ width, height });
      if (width < 992) {
        await qa.expect(qa.page.locator('.orders-mobile-list')).toBeVisible();
        await qa.expect(qa.page.locator('.orders-desktop-table')).toBeHidden();
      } else {
        await qa.expect(qa.page.locator('.orders-mobile-list')).toBeHidden();
        await qa.expect(qa.page.locator('.orders-desktop-table')).toBeVisible();
      }
      await assertNoOverflow(qa.page);
    }
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('long collapsed filter summaries and compact reference warnings do not overflow a phone viewport', { skip: !enabled }, async () => {
  const filters = await setup({ route: '/clients', viewport: { width: 390, height: 844 } });
  try {
    const strings = require('../locales/en/common.json');
    await filters.page.locator('.filter-disclosure-toggle').click();
    await filters.page.getByLabel(strings.search).fill('A very long synthetic client filter summary '.repeat(4));
    await filters.page.locator('.filter-disclosure-toggle').click();
    await filters.expect(filters.page.locator('.filter-disclosure-toggle')).toHaveAttribute('aria-expanded', 'false');
    await assertNoOverflow(filters.page);
  } finally { await filters.browser.close(); }

  const warning = await setup({ route: '/orders', failures: ['/api/clients'], viewport: { width: 390, height: 844 } });
  try {
    await warning.expect(warning.page.locator('.order-mobile-card').first()).toBeVisible();
    await warning.expect(warning.page.locator('.error-state-compact[role="alert"]')).toBeVisible();
    await assertNoOverflow(warning.page);
    assert.deepEqual(warning.errors, []);
  } finally { await warning.browser.close(); }
});

const filterSelections = {
  '/orders': async (qa, strings) => {
    await qa.page.getByRole('combobox', { name: strings.status }).click();
    await qa.page.getByRole('option', { name: strings.canceled, exact: true }).click();
  },
  '/products': async (qa, strings) => {
    await qa.page.locator('#product-type-filter').click();
    await qa.page.getByRole('option', { name: strings.productTypeAssortment, exact: true }).click();
  },
  '/recipes': async (qa, strings) => qa.page.getByLabel(strings.searchRecipes).fill('synthetic'),
  '/clients': async (qa, strings) => qa.page.getByLabel(strings.search).fill('synthetic'),
  '/ingredients': async (qa, strings) => qa.page.getByLabel(strings.search).fill('synthetic'),
  '/prices': async (qa, strings) => qa.page.locator('input[type="date"]').fill('2026-11-01'),
};

for (const scenario of pages) test(`${scenario.route} filter disclosure preserves selection across collapse and resize`, { skip: !enabled }, async () => {
  const qa = await setup({ route: scenario.route, viewport: { width: 390, height: 844 } });
  try {
    const strings = require('../locales/en/common.json');
    const toggle = qa.page.locator('.filter-disclosure-toggle');
    const controlledId = await toggle.getAttribute('aria-controls');
    const panel = qa.page.locator(`[id="${controlledId}"]`);
    await qa.expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await qa.expect(panel).toBeHidden();
    await qa.expect(panel.locator('input,button,[role=combobox]').first()).toBeHidden();
    await toggle.click();
    await qa.expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await filterSelections[scenario.route](qa, strings);
    await toggle.click();
    await qa.expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await qa.expect(toggle).toContainText('1');
    await qa.page.setViewportSize({ width: 1280, height: 720 });
    await qa.page.setViewportSize({ width: 390, height: 844 });
    await qa.expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await qa.expect(toggle).toContainText('1');
    await toggle.click();
    await qa.page.locator('.filter-disclosure-clear').click();
    await qa.expect(toggle).not.toContainText('1');
    await assertNoOverflow(qa.page);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

for (const locale of ['en', 'ru', 'rs']) test(`localized page title and order dialog name/close control in ${locale}`, { skip: !enabled }, async () => {
  const qa = await setup({ route: '/orders', locale });
  try {
    const strings = require(`../locales/${locale}/common.json`);
    await qa.expect(qa.page).toHaveTitle(`${strings.orders} · BatchVault`);
    await qa.page.getByRole('button', { name: strings.createOrder, exact: true }).first().click();
    const dialog = qa.page.getByRole('dialog');
    await qa.expect(dialog).toHaveAccessibleName(strings.orderDetails);
    await qa.expect(dialog.getByRole('button', { name: strings.close, exact: true })).toBeVisible();
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('order close paths protect edits, clean close is quiet, save errors keep the draft, and successful save closes without confirmation', { skip: !enabled }, async () => {
  const qa = await setup({ route: '/orders' });
  try {
    const strings = require('../locales/en/common.json');
    const open = async () => {
      await qa.page.getByRole('button', { name: strings.createOrder, exact: true }).first().click();
      const dialog = qa.page.getByRole('dialog');
      await qa.expect(dialog).toHaveClass(/\bshow\b/);
      await qa.expect(dialog).toHaveCSS('opacity', '1');
      return dialog;
    };
    const dialog = await open();
    await dialog.getByRole('button', { name: strings.cancel, exact: true }).click();
    await qa.expect(dialog).toBeHidden();

    for (const action of ['escape', 'x', 'cancel', 'backdrop']) {
      const current = await open();
      await current.locator('#commentTextarea').fill(`unsaved-${action}`);
      const trigger = async () => {
        if (action === 'escape') await qa.page.keyboard.press('Escape');
        else if (action === 'x') await current.getByRole('button', { name: strings.close, exact: true }).click();
        else if (action === 'cancel') await current.getByRole('button', { name: strings.cancel, exact: true }).click();
        else await qa.page.locator('.modal.show').click({ position: { x: 4, y: 4 } });
      };
      let prompted = false;
      qa.page.once('dialog', async popup => { prompted = true; await popup.dismiss(); });
      await trigger();
      await qa.expect(current).toBeVisible();
      await qa.expect(current.locator('#commentTextarea')).toHaveValue(`unsaved-${action}`);
      assert.equal(prompted, true, `${action} should ask before discarding`);
      qa.page.once('dialog', popup => popup.accept());
      await trigger();
      await qa.expect(current).toBeHidden();
    }

    const saved = await open();
    await saved.getByLabel(strings.client).click();
    await qa.page.getByRole('option', { name: /Synthetic Client/ }).click();
    await saved.locator('.order-item-card').first().getByRole('combobox').click();
    await qa.page.getByRole('option', { name: /Synthetic product 1/ }).click();
    await qa.expect(saved.getByRole('button', { name: strings.saveChanges, exact: true })).toBeEnabled();

    await saved.locator('#commentTextarea').fill('write-error-keeps-draft');
    qa.failed.add('/api/orders');
    const failedWrite = qa.page.waitForResponse(response => new URL(response.url()).pathname === '/api/orders' && response.request().method() === 'POST');
    await saved.getByRole('button', { name: strings.saveChanges, exact: true }).click();
    assert.equal((await failedWrite).status(), 503);
    await qa.expect(saved.getByRole('button', { name: strings.saveChanges, exact: true })).toBeEnabled();
    await qa.expect(saved.locator('#commentTextarea')).toHaveValue('write-error-keeps-draft');
    await qa.expect(saved).toBeVisible();
    assert.equal(qa.writes.length, 0, 'failed synthetic writes are not recorded by the fixture');
    qa.failed.delete('/api/orders');
    await saved.getByRole('button', { name: strings.saveChanges, exact: true }).click();
    await qa.expect(saved).toBeHidden();
    assert.equal(qa.writes.filter(write => write.endpoint === '/api/orders' && write.method === 'POST').length, 1);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('recipe yield save advances only the yield baseline while keeping an unfinished ingredient entry', { skip: !enabled }, async () => {
  const qa = await setup({ route: '/recipes' });
  try {
    const strings = require('../locales/en/common.json');
    await qa.page.getByRole('heading', { name: strings.recipes, exact: true }).waitFor({ state: 'visible' });
    await qa.page.locator('.recipe-list-button').filter({ hasText: 'Synthetic classic' }).click();
    await qa.page.locator('.recipe-detail-panel-desktop').getByRole('button', { name: strings.edit, exact: true }).click();
    const dialog = qa.page.getByRole('dialog');
    const plannedYield = dialog.getByLabel(strings.costingYieldLabel);
    await plannedYield.fill('725');
    await dialog.getByRole('combobox', { name: strings.ingredient, exact: true }).click();
    await qa.page.getByRole('option', { name: /Synthetic pepper/ }).click();
    await dialog.getByLabel(strings.quantity).fill('25');
    await dialog.getByRole('button', { name: strings.costingSaveYield, exact: true }).click();
    await qa.expect(dialog.getByRole('button', { name: strings.done, exact: true })).toBeEnabled();
    assert.equal(qa.writes.filter(write => write.endpoint === '/api/recipes/1' && write.method === 'PATCH').length, 1);
    let prompted = false;
    qa.page.once('dialog', async popup => { prompted = true; await popup.dismiss(); });
    await qa.page.keyboard.press('Escape');
    await qa.expect(dialog).toBeVisible();
    assert.equal(prompted, true, 'pending ingredient entry remains dirty after the yield-only save');
    assert.equal(qa.writes.filter(write => write.endpoint === '/api/recipes' && write.method === 'POST').length, 0);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('recipe ingredient POST and DELETE survive failed reads and retry only GET while preserving pending yield', { skip: !enabled }, async () => {
  const qa = await setup({ route: '/recipes' });
  try {
    const strings = require('../locales/en/common.json');
    await qa.page.locator('.recipe-list-button').filter({ hasText: 'Synthetic classic' }).click();
    await qa.page.locator('.recipe-detail-panel-desktop').getByRole('button', { name: strings.edit, exact: true }).click();
    const dialog = qa.page.getByRole('dialog');
    await dialog.getByLabel(strings.costingYieldLabel).fill('725');
    await dialog.getByRole('combobox', { name: strings.ingredient, exact: true }).click();
    await qa.page.getByRole('option', { name: /Synthetic pepper/ }).click();
    await dialog.getByLabel(strings.quantity).fill('25');
    const getRecipe = 'GET /api/recipes/1';
    qa.failed.add(getRecipe);
    await dialog.getByRole('button', { name: strings.add, exact: true }).click();
    await qa.expect(dialog.locator('[role="alert"]')).toContainText(strings.uiRecipeSavedReadFailed);
    await qa.expect(dialog.getByLabel(strings.costingYieldLabel)).toHaveValue('725');
    await qa.expect(dialog.getByLabel(strings.quantity)).toHaveValue('');
    await qa.expect(dialog.getByRole('button', { name: strings.costingSaveYield, exact: true })).toBeDisabled();
    await qa.expect(dialog.getByRole('button', { name: strings.removeIngredientFromRecipe }).first()).toBeDisabled();
    const postCountBeforeRetry = qa.writes.filter(write => write.endpoint === '/api/recipes/1/ingredients' && write.method === 'POST').length;
    assert.equal(postCountBeforeRetry, 1);

    const getsBeforeRetry = qa.requests.filter(request => request.endpoint === '/api/recipes/1' && request.method === 'GET').length;
    qa.failed.delete(getRecipe);
    await dialog.getByRole('button', { name: strings.tryAgain, exact: true }).click();
    await qa.expect(dialog.locator('[role="alert"]')).toHaveCount(0);
    await qa.expect(dialog.getByLabel(strings.costingYieldLabel)).toHaveValue('725');
    await qa.expect(dialog.locator('.recipe-builder-list')).toContainText('Synthetic pepper');
    assert.equal(qa.requests.filter(request => request.endpoint === '/api/recipes/1' && request.method === 'GET').length, getsBeforeRetry + 1);
    assert.equal(qa.writes.filter(write => write.endpoint === '/api/recipes/1/ingredients' && write.method === 'POST').length, postCountBeforeRetry);
    qa.failed.add(getRecipe);
    await dialog.locator('.recipe-builder-list-item').filter({ hasText: 'Synthetic pepper' }).getByRole('button').click();
    await qa.expect(dialog.locator('[role=alert]')).toContainText(strings.uiRecipeSavedReadFailed);
    assert.equal(qa.writes.filter(write => write.endpoint === '/api/recipes/1/ingredients/2' && write.method === 'DELETE').length, 1);
    qa.failed.delete(getRecipe);
    await dialog.getByRole('button', { name: strings.tryAgain, exact: true }).click();
    await qa.expect(dialog.locator('[role=alert]')).toHaveCount(0);
    await qa.expect(dialog.locator('.recipe-builder-list')).not.toContainText('Synthetic pepper');
    assert.equal(qa.writes.filter(write => write.endpoint === '/api/recipes/1/ingredients/2' && write.method === 'DELETE').length, 1);
    let prompted = false;
    qa.page.once('dialog', async popup => { prompted = true; await popup.dismiss(); });
    await qa.page.keyboard.press('Escape');
    await qa.expect(dialog.getByLabel(strings.costingYieldLabel)).toHaveValue('725');
    assert.equal(prompted, true, 'the pending yield survives both read recoveries');
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('creating a recipe with an unfinished ingredient entry cannot submit', { skip: !enabled }, async () => {
  const qa = await setup({ route: '/recipes' });
  try {
    const strings = require('../locales/en/common.json');
    await qa.page.getByRole('button', { name: strings.addRecipe, exact: true }).click();
    const dialog = qa.page.getByRole('dialog');
    await dialog.getByLabel(strings.recipeName).fill('Synthetic pending recipe');
    await dialog.getByRole('combobox', { name: strings.ingredient, exact: true }).click();
    await qa.page.getByRole('option', { name: /Synthetic beef/ }).click();
    await dialog.getByLabel(strings.quantity).fill('50');
    await dialog.getByRole('button', { name: strings.add, exact: true }).click();
    await dialog.getByRole('combobox', { name: strings.ingredient, exact: true }).click();
    await qa.page.getByRole('option', { name: /Synthetic pepper/ }).click();
    await dialog.getByLabel(strings.quantity).fill('10');
    await dialog.getByRole('button', { name: strings.save, exact: true }).click();
    await qa.expect(dialog).toContainText(strings.uiRecipePendingIngredient);
    assert.equal(qa.writes.length, 0);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('client editor accepts a plain address when the optional geocoder token is absent', { skip: !enabled }, async () => {
  const qa = await setup({ route: '/clients', viewport: { width: 390, height: 844 } });
  try {
    const strings = require('../locales/en/common.json');
    const consoleErrors = [];
    qa.page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const trigger = qa.page.getByRole('button', { name: strings.addClient, exact: true });
    await trigger.click();
    const dialog = qa.page.getByRole('dialog', { name: strings.addClient, exact: true });
    await qa.expect(dialog).toHaveCSS('opacity', '1');
    await dialog.getByLabel(strings.address, { exact: true }).fill('Synthetic address 12');
    await qa.expect(dialog.getByLabel(strings.address, { exact: true })).toHaveValue('Synthetic address 12');
    await dialog.getByRole('button', { name: strings.close, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible();
    await qa.expect(trigger).toBeFocused();
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(qa.errors, []);
    assert.equal(qa.writes.length, 0);
  } finally { await qa.browser.close(); }
});

test('recipe actions stay inside narrow dialogs with the primary action fully visible', { skip: !enabled }, async () => {
  const qa = await setup({ route: '/recipes', locale: 'ru', viewport: { width: 390, height: 844 } });
  try {
    const strings = require('../locales/ru/common.json');
    await qa.page.getByRole('button', { name: strings.edit, exact: true }).click();
    const dialog = qa.page.getByRole('dialog');
    await qa.expect(dialog).toHaveCSS('opacity', '1');
    for (const width of [390, 768]) {
      await qa.page.setViewportSize({ width, height: 844 });
      await qa.expect(dialog.getByRole('button', { name: strings.done, exact: true })).toBeInViewport();
      const fits = await dialog.locator('.modal-footer button').evaluateAll(buttons => buttons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      }));
      assert.equal(fits, true);
    }
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

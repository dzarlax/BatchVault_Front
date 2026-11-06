const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup } = require('./helpers/product-ui.cjs');
const corpus = require('./fixtures/product-types-v1.json');
const messages = require('../locales/en/common.json');
const enabled = Boolean(process.env.COSTING_QA_WEB_URL);
const screenshotDir = process.env.COSTING_QA_SCREENSHOTS;

async function capture(page, name) {
  if (!screenshotDir) return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), animations: 'disabled' });
}

async function assertNoOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
}

// The API is intercepted by the shared localhost fixture. These are UI regressions,
// not a replacement for the existing real-backend integration suite.
test('navigation remains one scrollable column on short windows and every link is reachable', { skip: !enabled }, async () => {
  const qa = await setup();
  try {
    for (const [width, height] of [[768, 1024], [991, 768], [992, 768], [1280, 720], [1360, 768], [1440, 720], [1440, 900], [1813, 1183]]) {
      await qa.page.setViewportSize({ width, height });
      if (width < 992) await qa.page.locator('.mobile-menu-toggle').click();
      const nav = qa.page.locator(width < 992 ? '.mobile-nav.open .sidebar-nav' : '.sidebar .sidebar-nav');
      await qa.expect(nav).toBeVisible();
      await qa.expect(nav).toHaveCSS('flex-wrap', 'nowrap');
      const boxes = await nav.locator('.sidebar-link').evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, height: el.getBoundingClientRect().height })));
      assert.equal(boxes.length, 8);
      assert.ok(boxes.every(box => Math.abs(box.x - boxes[0].x) < 1));
      assert.ok(boxes.every(box => box.height >= 36));
      await nav.locator('.sidebar-link').last().scrollIntoViewIfNeeded();
      await qa.expect(nav.locator('.sidebar-link').last()).toBeInViewport();
      await assertNoOverflow(qa.page);
      if (width === 1280) { await nav.locator('.sidebar-link').first().scrollIntoViewIfNeeded(); await capture(qa.page, 'sidebar-1280x720'); }
      if (width < 992) await qa.page.locator('.mobile-nav .sidebar-close-btn').click();
    }
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('Escape protects an edited draft, decline preserves it, confirm discards it, and preview is not dirty', { skip: !enabled }, async () => {
  const qa = await setup();
  try {
    let dialog = await qa.open('Five flavours');
    await qa.expect(dialog).toContainText('270.00 RSD');
    let prompts = 0;
    const reject = async popup => { prompts++; await popup.dismiss(); };
    qa.page.on('dialog', reject);
    await dialog.locator('#name').fill('Edited assortment');
    await qa.page.keyboard.press('Escape');
    await qa.expect(dialog).toBeVisible();
    await qa.expect(dialog.locator('#name')).toHaveValue('Edited assortment');
    assert.equal(prompts, 1);
    qa.page.off('dialog', reject);
    qa.page.once('dialog', popup => popup.accept());
    await dialog.getByRole('button', { name: messages.cancel, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible();
    dialog = await qa.open('Five flavours');
    await qa.expect(dialog).toContainText('270.00 RSD');
    qa.page.on('dialog', reject);
    await qa.page.keyboard.press('Escape');
    await qa.expect(dialog).not.toBeVisible();
    assert.equal(prompts, 1, 'unchanged editor and preview must not prompt');
    assert.equal(qa.writes.length, 0);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('invalid assortment announces the concrete error, focuses visible invalid content, and never writes', { skip: !enabled }, async () => {
  const qa = await setup({ viewport: { width: 1280, height: 720 } });
  try {
    const dialog = await qa.open('Manual assortment');
    await dialog.locator('#component-grams-4').fill('49');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    assert.equal(qa.writes.length, 0);
    await qa.expect(dialog.locator('[aria-invalid="true"]').first()).toBeFocused();
    const focused = await qa.page.evaluate(() => {
      const el = document.activeElement;
      const rect = el.getBoundingClientRect();
      return { tag: el.tagName, invalid: el.getAttribute('aria-invalid'), top: rect.top, bottom: rect.bottom, height: innerHeight };
    });
    assert.notEqual(focused.tag, 'BODY');
    assert.equal(focused.invalid, 'true');
    assert.ok(focused.top < focused.height && focused.bottom > 0, JSON.stringify(focused));
    await qa.expect(dialog.locator('[role=alert]').filter({ visible: true }).first()).toContainText('1');
    await capture(qa.page, 'validation-1280x720');
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

for (const locale of ['en', 'ru', 'rs']) test(`editor has a localized name, named weights, visible summary and workspace currency in ${locale}`, { skip: !enabled }, async () => {
  const qa = await setup({ locale, currency: 'EUR', viewport: { width: 390, height: 844 } });
  try {
    const strings = require(`../locales/${locale}/common.json`);
    const dialog = await qa.open('Five flavours');
    await qa.expect(dialog).toHaveAccessibleName(strings.editProduct);
    await qa.expect(dialog.getByRole('button', { name: strings.close, exact: true })).toBeVisible();
    await qa.expect(dialog.locator('#price').locator('..')).toContainText('EUR');
    const labels = [];
    for (let index = 0; index < 5; index++) {
      const input = dialog.locator(`#component-grams-${index}`);
      const label = await input.getAttribute('aria-label') || await dialog.locator(`label[for="component-grams-${index}"]`).innerText();
      labels.push(label);
    }
    assert.equal(new Set(labels).size, 5);
    await dialog.locator('#component-product-0').focus();
    await qa.page.keyboard.press('ArrowDown');
    await qa.page.keyboard.press('Enter');
    await qa.page.keyboard.press('Tab');
    await qa.expect(dialog.locator('#component-grams-0')).toBeFocused();
    await qa.page.keyboard.press('Shift+Tab');
    await qa.expect(dialog.locator('#component-product-0')).toBeFocused();
    const summary = dialog.locator('.product-cost-summary');
    await qa.expect(summary).toContainText('270.00 EUR');
    assert.equal(await summary.locator('details[open]').count(), 0);
    await dialog.getByRole('button', { name: strings.save, exact: true }).scrollIntoViewIfNeeded();
    await qa.expect(dialog.getByRole('button', { name: strings.save, exact: true })).toBeInViewport();
    await assertNoOverflow(qa.page);
    if (locale === 'ru') await capture(qa.page, 'editor-mobile-ru');
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

test('mobile filters preserve selection, show active count while collapsed and reset completely', { skip: !enabled }, async () => {
  const qa = await setup({ viewport: { width: 390, height: 844 } });
  try {
    const toggle = qa.page.locator('button[aria-controls="product-filters"]');
    await qa.expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await qa.expect(qa.page.locator('#product-type-filter')).not.toBeVisible();
    const grid = await qa.page.locator('.products-grid').boundingBox();
    assert.ok(grid.y < 440, `grid starts at ${grid.y}`);
    await toggle.click();
    await qa.page.locator('#product-type-filter').click();
    await qa.page.getByRole('option', { name: messages.productTypeAssortment, exact: true }).click();
    await toggle.click();
    await qa.expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await qa.expect(toggle).toContainText('1');
    await qa.expect(qa.page.locator('.product-card')).toHaveCount(3);
    await qa.page.getByRole('button', { name: messages.clear, exact: true }).click();
    await qa.expect(qa.page.locator('.product-card')).toHaveCount(8);
    await assertNoOverflow(qa.page);
    await capture(qa.page, 'catalog-mobile');
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

for (const dark of [false, true]) test(`compact cards keep incomplete status visible, fit long text and do not stretch neighbours (${dark ? 'dark' : 'light'})`, { skip: !enabled }, async () => {
  const incomplete = { ...structuredClone(corpus.incomplete), id: 900, name: 'A very long incomplete assortment title for a narrow product card' };
  const qa = await setup({ dark, viewport: { width: 1440, height: 900 }, extraProducts: [incomplete] });
  try {
    const card = qa.page.locator('.product-card').filter({ has: qa.page.getByRole('heading', { name: incomplete.name, exact: true }) });
    await qa.expect(card).toContainText(messages.costingIncomplete);
    await qa.expect(card.getByText(messages.costingIncomplete, { exact: true })).toBeVisible();
    const neighbour = qa.page.locator('.product-card').nth(qa.products.length - 2);
    const before = await neighbour.boundingBox();
    await card.locator('.product-card-details > summary').click();
    await card.locator('.product-cost-summary details > summary').click();
    const after = await neighbour.boundingBox();
    assert.equal(Math.round(after.height), Math.round(before.height));
    assert.equal(await card.locator('table').count(), 0);
    assert.equal(await card.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await assertNoOverflow(qa.page);
    await card.scrollIntoViewIfNeeded();
    await capture(qa.page, `incomplete-${dark ? 'dark' : 'light'}-desktop`);
    if (dark) {
      const colors = await qa.page.locator('.product-package-chip').first().evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
      assert.notEqual(colors.color, 'rgb(139, 38, 53)');
    }
    const contrast = await qa.page.locator('.product-package-chip').first().evaluate(el => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const rgba = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].map((v,i) => i === 3 ? v/255 : v); };
        const blend = (fg,bg) => fg.slice(0,3).map((v,i) => v*fg[3]+bg[i]*(1-fg[3]));
        const ancestors = []; for (let item=el; item; item=item.parentElement) ancestors.unshift(item);
        let bg=[255,255,255]; for (const item of ancestors) bg=blend(rgba(getComputedStyle(item).backgroundColor),bg);
        const fg=blend(rgba(getComputedStyle(el).color),bg);
        const lum = rgb => rgb.map(v => { v/=255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }).reduce((a,v,i) => a+v*[.2126,.7152,.0722][i],0);
        const values=[lum(fg),lum(bg)].sort((a,b)=>b-a);
        return (values[0]+.05)/(values[1]+.05);
      });
    assert.ok(contrast >= 4.5, `package chip contrast ${contrast}`);
    console.log(`${dark ? 'Dark' : 'Light'} package chip contrast: ${contrast.toFixed(2)}:1`);
    await qa.page.setViewportSize({ width: 1813, height: 1183 });
    await qa.expect(qa.page.locator('.products-grid')).toHaveCSS('grid-template-columns', /.+/);
    const columns = await qa.page.locator('.products-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns, 4);
    await qa.page.locator('.page-title').scrollIntoViewIfNeeded();
    await capture(qa.page, `catalog-${dark ? 'dark' : 'light'}-desktop`);
    assert.deepEqual(qa.errors, []);
  } finally { await qa.browser.close(); }
});

for (const action of ['close button', 'backdrop']) test(`all manual close paths protect the draft: ${action}`, { skip: !enabled }, async () => {
  const qa = await setup();
  try {
    const dialog = await qa.open('Five flavours');
    await dialog.locator('#description').fill('Unsaved synthetic description');
    let prompted = false;
    qa.page.once('dialog', async popup => { prompted = true; await popup.dismiss(); });
    if (action === 'close button') await dialog.getByRole('button', { name: messages.close, exact: true }).click();
    else await qa.page.locator('.modal.show').click({ position: { x: 5, y: 5 } });
    await qa.expect(dialog).toBeVisible();
    await qa.expect(dialog.locator('#description')).toHaveValue('Unsaved synthetic description');
    assert.equal(prompted, true);
    assert.equal(qa.writes.length, 0);
  } finally { await qa.browser.close(); }
});

test('new form validates visibly and preview failures keep the authored draft without writes', { skip: !enabled }, async () => {
  const qa = await setup({ previewFailure: true });
  try {
    await qa.page.getByRole('button', { name: messages.addProduct, exact: true }).click();
    const dialog = qa.page.getByRole('dialog').filter({ has: qa.page.locator('#name') });
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog.locator('#name')).toBeFocused();
    await qa.expect(dialog.locator('#name')).toHaveAttribute('aria-invalid', 'true');
    assert.equal(qa.writes.length, 0);
    await dialog.getByRole('button', { name: messages.cancel, exact: true }).click();
    await qa.expect(dialog).not.toBeVisible();
    const editor = await qa.open('Five flavours');
    await qa.expect(editor).toContainText(messages.costingPreviewFailed);
    await qa.expect(editor.locator('#name')).toHaveValue('Five flavours');
    assert.equal(qa.writes.length, 0);
  } finally { await qa.browser.close(); }
});

test('compatibility editor retains the same dirty-close guard and accessible dialog', { skip: !enabled }, async () => {
  const qa = await setup({ capability: false });
  try {
    const dialog = await qa.open('Beef teriyaki');
    await qa.expect(dialog).toHaveAccessibleName(messages.editProduct);
    await dialog.locator('#name').fill('Unsaved compatibility product');
    qa.page.once('dialog', popup => popup.dismiss());
    await qa.page.keyboard.press('Escape');
    await qa.expect(dialog).toBeVisible();
    await qa.expect(dialog.locator('#name')).toHaveValue('Unsaved compatibility product');
    assert.equal(qa.writes.length, 0);
  } finally { await qa.browser.close(); }
});

test('clearing a compatibility package focuses its invalid shared dropdown without writing', { skip: !enabled }, async () => {
  const qa = await setup({ capability: false });
  try {
    const dialog = await qa.open('Beef teriyaki');
    await dialog.locator('#packageId').focus();
    await qa.page.keyboard.press('Backspace');
    await dialog.getByRole('button', { name: messages.save, exact: true }).click();
    await qa.expect(dialog.locator('#packageId')).toHaveAttribute('aria-invalid', 'true');
    await qa.expect(dialog.locator('#packageId')).toBeFocused();
    await qa.expect(dialog.locator('#packageId-error')).toContainText(messages.packageRequired);
    assert.equal(qa.writes.length, 0);
  } finally { await qa.browser.close(); }
});

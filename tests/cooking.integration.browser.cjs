const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.env.COOKING_QA !== '1' || !process.env.COOKING_QA_FIXTURE_FILE || !process.env.COOKING_QA_API_ORIGIN) {
  process.stderr.write('Set COOKING_QA=1, COOKING_QA_FIXTURE_FILE, and COOKING_QA_API_ORIGIN for an isolated localhost fixture.\n');
  process.exit(2);
}

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixturePath = path.resolve(process.env.COOKING_QA_FIXTURE_FILE);
const evidenceDir = path.resolve(process.env.COOKING_QA_EVIDENCE_DIR || path.join(os.tmpdir(), 'batchvault-cooking-qa-evidence'));
const frontendUrl = process.env.COOKING_QA_FRONTEND || 'http://127.0.0.1:3005';
const apiOrigin = new URL(process.env.COOKING_QA_API_ORIGIN).origin;
const isLoopback = hostname => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
if (!isLoopback(new URL(frontendUrl).hostname) || !isLoopback(new URL(apiOrigin).hostname)) throw new Error('Cooking browser QA is restricted to localhost frontend and API origins.');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
fs.mkdirSync(evidenceDir, { recursive: true });

const run = async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.COOKING_QA_CHROME ? { executablePath: process.env.COOKING_QA_CHROME } : {}), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.startsWith('/api/') && requestUrl.origin !== apiOrigin) throw new Error('Cooking browser QA blocked a non-fixture API origin.');
    return route.continue();
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const reactKeyWarnings = [];
  const httpFailures = [];
  const pageErrors = [];
  page.on('response', response => { if (response.status() >= 400) httpFailures.push({ status: response.status(), path: new URL(response.url()).pathname }); });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push('console-error'); if (message.type() === 'warning' && message.text().includes('two children with the same key')) reactKeyWarnings.push('duplicate-key'); });
  page.on('pageerror', error => pageErrors.push(error.name || 'page-error'));
  await page.addInitScript(({ token, userId, workspaceId }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ id: userId, userID: userId }));
    localStorage.setItem(`workspace:selected:${userId}`, String(workspaceId));
    sessionStorage.setItem('workspace:validated-user-id', String(userId));
  }, { token: fixture.token, userId: fixture.user_id, workspaceId: fixture.workspace_id });

  try {
    await page.goto(`${frontendUrl}/cooking`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Plan a batch' }).waitFor({ timeout: 30000 });
    await page.getByRole('checkbox', { name: /#104/ }).check();
    await page.getByRole('checkbox', { name: /#105/ }).check();
    await page.getByRole('checkbox', { name: /#106/ }).check();
    await page.getByRole('button', { name: 'Preview plan' }).click();
    await page.getByText('700 g', { exact: true }).first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(evidenceDir, '01-plan.png'), fullPage: true });
    await page.getByRole('button', { name: 'Start cooking run' }).click();
    await page.getByRole('heading', { name: 'Main ingredient and marinade' }).waitFor({ timeout: 20000 });

    const meatInputs = page.locator('.cooking-actual-grid input[inputmode="decimal"]');
    await meatInputs.nth(0).fill('1500');
    await meatInputs.nth(1).fill('700');
    await meatInputs.nth(2).fill('700');
    await page.locator('.cooking-total-input input').fill('2900');
    await page.getByRole('button', { name: 'Calculate marinade' }).click();
    await page.getByText('Combined ingredients, including the main ingredient').waitFor({ timeout: 20000 });
    const preparationText = await page.locator('.cooking-page').innerText();
    assert.match(preparationText, /14\.000\s*g/);
    assert.match(preparationText, /35\.000\s*ml/);
    assert.match(preparationText, /7\.000\s*g/);
    await page.screenshot({ path: path.join(evidenceDir, '02-main-ingredient.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save preparation' }).click();
    await page.getByRole('heading', { name: 'Usable yield and packing' }).waitFor({ timeout: 20000 });

    const yieldInputs = page.locator('.cooking-actual-grid input[inputmode="decimal"]');
    await yieldInputs.nth(0).fill('730');
    await yieldInputs.nth(1).fill('330');
    await yieldInputs.nth(2).fill('340');
    const packLabels = await page.locator('.cooking-pack-list label').allInnerTexts();
    const findLabel = fragment => {
      const index = packLabels.findIndex(label => label.toLowerCase().includes(fragment));
      assert.notEqual(index, -1, `Expected product option containing ${fragment}`);
      return index;
    };
    const packInputs = page.locator('.cooking-pack-list input');
    await packInputs.nth(findLabel('classic')).fill('4');
    await page.getByRole('button', { name: 'Preview packing' }).click();
    await page.getByText('Total packs: 4').waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(evidenceDir, '03-first-packing.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save output' }).click();
    await page.getByText('You can pack remaining stock in multiple partial sessions.').waitFor({ timeout: 20000 });

    const laterLabels = await page.locator('.cooking-pack-list label').allInnerTexts();
    const laterInputs = page.locator('.cooking-pack-list input');
    const choose = fragment => {
      const index = laterLabels.findIndex(label => label.toLowerCase().includes(fragment));
      assert.notEqual(index, -1, `Expected product option containing ${fragment}`);
      return index;
    };
    await laterInputs.nth(choose('classic')).fill('2');
    await laterInputs.nth(choose('spicy')).fill('2');
    await laterInputs.nth(choose('teriyaki')).fill('2');
    await laterInputs.nth(choose('assort')).fill('2');
    await page.getByRole('button', { name: 'Preview packing' }).click();
    await page.getByText(/Left over.*30 g/).first().waitFor({ timeout: 20000 });
    const finalPreview = await page.locator('.cooking-pack-preview').innerText();
    assert.match(finalPreview, /30 g/);
    assert.match(finalPreview, /40 g/);
    await page.getByRole('button', { name: 'Save this packing' }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('You can pack remaining stock in multiple partial sessions.').waitFor({ timeout: 25000 });
    const persisted = await page.locator('.cooking-stock-row').allInnerTexts();
    assert.ok(persisted.length > 0, 'Expected saved stock lots after reload');
    assert.match(persisted.join('\n'), /30\s+g/);
    assert.match(persisted.join('\n'), /40\s+g/);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(evidenceDir, '04-final-packing.png') });

    await page.getByRole('button', { name: 'Dark Mode' }).click();
    const themeState = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), background: getComputedStyle(document.body).backgroundColor }));
    assert.equal(themeState.theme, 'dark');
    assert.notEqual(themeState.background, 'rgb(255, 255, 255)');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.screenshot({ path: path.join(evidenceDir, '05-mobile-dark.png') });
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(horizontalOverflow, false, 'Cooking detail should not overflow horizontally at 390px');
    assert.equal(reactKeyWarnings.length, 0, 'Cooking UI should not emit duplicate React keys');
    assert.equal(pageErrors.length, 0, 'Page should not emit uncaught browser exceptions');
    process.stdout.write(JSON.stringify({ result: 'passed', checks: ['plan', 'actual-main-ingredient-marinade', 'usable-yield', 'partial-packing', 'reload-persistence-30-30-40', 'mobile-dark-no-overflow'], themeState, consoleErrors: consoleErrors.length, reactKeyWarnings: reactKeyWarnings.length, httpFailures, pageErrors: pageErrors.length, evidenceDir }) + '\n');
  } finally {
    await context.close();
    await browser.close();
  }
};

run().catch(error => {
  process.stderr.write(`Cooking UI integration failed: ${error.name}: ${error.message}\n`);
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.env.COOKING_QA !== '1' || !process.env.COOKING_QA_RUN_ID || !process.env.COOKING_QA_FIXTURE_FILE || !process.env.COOKING_QA_API_ORIGIN) {
  process.stderr.write('Set COOKING_QA=1, COOKING_QA_RUN_ID, COOKING_QA_FIXTURE_FILE, and COOKING_QA_API_ORIGIN for an isolated localhost fixture.\n');
  process.exit(2);
}

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixturePath = path.resolve(process.env.COOKING_QA_FIXTURE_FILE);
const evidenceDir = path.resolve(process.env.COOKING_QA_EVIDENCE_DIR || path.join(os.tmpdir(), 'batchvault-cooking-qa-evidence'));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const runId = process.env.COOKING_QA_RUN_ID;
const frontendUrl = process.env.COOKING_QA_FRONTEND || 'http://127.0.0.1:3005';
const apiOrigin = new URL(process.env.COOKING_QA_API_ORIGIN).origin;
const isLoopback = hostname => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
if (!isLoopback(new URL(frontendUrl).hostname) || !isLoopback(new URL(apiOrigin).hostname)) throw new Error('Cooking recovery QA is restricted to localhost frontend and API origins.');
fs.mkdirSync(evidenceDir, { recursive: true });

const run = async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.COOKING_QA_CHROME ? { executablePath: process.env.COOKING_QA_CHROME } : {}), args: ['--no-sandbox', ...(process.env.COOKING_QA_DISABLE_GPU === '1' ? ['--disable-gpu'] : [])] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  await context.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.startsWith('/api/') && requestUrl.origin !== apiOrigin) throw new Error('Cooking recovery QA blocked a non-fixture API origin.');
    return route.continue();
  });
  const initAuth = async page => page.addInitScript(({ token, userId, workspaceId }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ id: userId, userID: userId }));
    localStorage.setItem(`workspace:selected:${userId}`, String(workspaceId));
    sessionStorage.setItem('workspace:validated-user-id', String(userId));
  }, { token: fixture.token, userId: fixture.user_id, workspaceId: fixture.workspace_id });
  let page = await context.newPage();
  let routeCount = 0;
  let definitiveBody;
  let ambiguousBody;
  const consoleIssues = [];
  page.on('console', message => { if (message.type() === 'warning' && message.text().includes('two children with the same key')) consoleIssues.push('duplicate-key'); });
  await initAuth(page);

  try {
    await page.goto(`${frontendUrl}/cooking/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Output recorded').waitFor({ timeout: 25000 });
    const lotRows = await page.locator('.cooking-stock-row').allInnerTexts();
    assert.match(lotRows.join('\n'), /30\s+g/);
    assert.match(lotRows.join('\n'), /40\s+g/);
    await page.screenshot({ path: path.join(evidenceDir, '04-final-packing.png') });

    const visualContext = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'en-US' });
    const mobilePage = await visualContext.newPage();
    await mobilePage.addInitScript(({ token, userId, workspaceId }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ id: userId, userID: userId }));
      localStorage.setItem(`workspace:selected:${userId}`, String(workspaceId));
      localStorage.setItem('theme', 'dark');
      sessionStorage.setItem('workspace:validated-user-id', String(userId));
    }, { token: fixture.token, userId: fixture.user_id, workspaceId: fixture.workspace_id });
    await mobilePage.goto(`${frontendUrl}/cooking/${runId}`, { waitUntil: 'domcontentloaded' });
    await mobilePage.getByText('Output recorded').waitFor({ timeout: 25000 });
    const mobileLayout = await mobilePage.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      background: getComputedStyle(document.body).backgroundColor,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      cookingPages: document.querySelectorAll('.cooking-page').length,
      pageHeaders: document.querySelectorAll('.cooking-page header.page-header').length,
      h1Count: document.querySelectorAll('.cooking-page h1').length,
      headerPosition: getComputedStyle(document.querySelector('.cooking-page header.page-header')).position,
      backlineTextLeft: (() => { const link = document.querySelector('.cooking-backline .btn-link'); const icon = link.querySelector('svg'); return link.getBoundingClientRect().left + parseFloat(getComputedStyle(link).paddingLeft) + icon.getBoundingClientRect().width + 8; })(),
      menuRight: document.querySelector('.mobile-menu-toggle').getBoundingClientRect().right,
    }));
    assert.equal(mobileLayout.theme, 'dark');
    assert.notEqual(mobileLayout.background, 'rgb(255, 255, 255)');
    assert.equal(mobileLayout.documentWidth, mobileLayout.viewportWidth);
    assert.equal(mobileLayout.cookingPages, 1);
    assert.equal(mobileLayout.pageHeaders, 1);
    assert.equal(mobileLayout.h1Count, 1);
    assert.ok(mobileLayout.backlineTextLeft >= mobileLayout.menuRight, 'Cooking back link should clear the fixed mobile menu button');
    await mobilePage.screenshot({ path: path.join(evidenceDir, '05-mobile-dark.png') });
    await mobilePage.locator('.cooking-lots').scrollIntoViewIfNeeded();
    await mobilePage.screenshot({ path: path.join(evidenceDir, '06-mobile-leftovers.png') });
    await visualContext.close();

    await page.goto(`${frontendUrl}/products`, { waitUntil: 'domcontentloaded' });
    const classicCard = page.locator('.product-card').filter({ hasText: 'Classic 100' }).first();
    await classicCard.getByText('Recorded packs: 6').waitFor({ timeout: 20000 });
    await classicCard.getByText('For orders: 6').waitFor();
    await classicCard.getByText('Available: 0').waitFor();
    await page.goto(`${frontendUrl}/cooking/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Output recorded').waitFor({ timeout: 20000 });

    // Reproduce a committed result whose response was lost before the user continued packing.
    const savedRunResponse = await context.request.get(`${apiOrigin}/api/cooking-runs/${runId}`, { headers: { Authorization: `Bearer ${fixture.token}`, 'X-Workspace-ID': String(fixture.workspace_id) } });
    assert.equal(savedRunResponse.status(), 200);
    const savedRun = await savedRunResponse.json();
    const resultEvent = savedRun.events.find(event => event.kind === 'result');
    assert.ok(resultEvent?.payload?.Input?.operation_id, 'Fixture needs an already committed usable-output result');
    const pendingResultBody = resultEvent.payload.Input;
    const scope = `${apiOrigin}|${fixture.user_id}|${fixture.workspace_id}`;
    const pendingKey = `cooking:operation:${encodeURIComponent(scope)}:${runId}:results`;
    await page.evaluate(({ scope, key, body }) => {
      localStorage.setItem(key, JSON.stringify({ scope, id: body.operation_id }));
      localStorage.setItem(`${key}:body`, JSON.stringify({ scope, body }));
    }, { scope, key: pendingKey, body: pendingResultBody });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Retry this exact request with its original operation ID.').waitFor({ timeout: 20000 });
    assert.equal(await page.getByRole('button', { name: 'Save this packing' }).isDisabled(), true, 'A pending result must block a fresh packing action');
    assert.equal(await page.getByRole('button', { name: 'Archive run' }).isDisabled(), true, 'A pending result must block every other fresh mutation');
    let blockedWrites = 0;
    const countFreshWrite = request => { if (request.method() === 'POST' && /\/(packings|archive)$/.test(new URL(request.url()).pathname)) blockedWrites++; };
    page.on('request', countFreshWrite);
    // Clicking a disabled sibling action must preserve the unresolved physical operation.
    await page.getByRole('button', { name: 'Archive run' }).click({ force: true });
    assert.equal(blockedWrites, 0);
    const pendingActions = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('cooking:operation:') && key.endsWith(':body')).map(key => key.split(':').slice(-2).join(':')));
    assert.deepEqual(pendingActions, ['results:body'], 'Blocked actions must not create another pending operation');
    page.off('request', countFreshWrite);
    await page.getByRole('button', { name: 'Retry exact request', exact: true }).click();
    await page.getByText('Retry this exact request with its original operation ID.').waitFor({ state: 'hidden', timeout: 20000 });
    await page.getByRole('button', { name: 'Archive run' }).waitFor({ timeout: 10000 });

    await page.route(`**/api/cooking-runs/${runId}/archive`, async route => {
      routeCount += 1;
      const body = route.request().postData();
      if (routeCount === 1) {
        definitiveBody = body;
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'validation rejected' }) });
        return;
      }
      if (routeCount === 2) {
        ambiguousBody = body;
        assert.notEqual(JSON.parse(body).operation_id, JSON.parse(definitiveBody).operation_id, 'A definite 400 must release its operation ID for a new attempt');
        const committed = await route.fetch();
        assert.equal(committed.status(), 200, 'The simulated ambiguous response should follow a committed server mutation');
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'response unavailable' }) });
        return;
      }
      const response = await route.fetch();
      await route.fulfill({ response });
    });

    await Promise.all([
      page.waitForResponse(response => response.url().includes(`/api/cooking-runs/${runId}/archive`) && response.status() === 400),
      page.getByRole('button', { name: 'Archive run' }).click(),
    ]);
    await page.getByText('Could not save this cooking step. Refresh').waitFor();
    assert.equal(await page.getByText('Retry this exact request with its original operation ID.').count(), 0, 'A definite 400 must not offer ambiguous retry');
    const rejectedOperationId = JSON.parse(definitiveBody || '{}').operation_id;
    assert.equal(typeof rejectedOperationId, 'string', 'Archive request should contain a UUID operation ID');
    const rejectedPendingRecords = await page.evaluate(operationId => Object.keys(localStorage).flatMap(key => {
      try { const record = JSON.parse(localStorage.getItem(key) || 'null'); return record?.id === operationId || record?.body?.operation_id === operationId ? [key.split(':').slice(-3).join(':')] : []; }
      catch { return []; }
    }), rejectedOperationId);
    assert.equal(rejectedPendingRecords.length, 0, `A definite 400 must clear the rejected operation ID and body (remaining: ${rejectedPendingRecords.join(',')})`);

    await page.getByRole('button', { name: 'Archive run' }).click();
    await page.getByText('Retry this exact request with its original operation ID.').waitFor({ timeout: 10000 });
    await page.close();

    page = await context.newPage();
    await initAuth(page);
    const retryBodies = [];
    page.on('request', request => { if (request.url().includes(`/api/cooking-runs/${runId}/archive`) && request.method() === 'POST') retryBodies.push(request.postData()); });
    await page.goto(`${frontendUrl}/cooking/${runId}`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Retry this exact request with its original operation ID.').waitFor({ timeout: 25000 });
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.getByText('Archived', { exact: true }).waitFor({ timeout: 25000 });
    assert.equal(retryBodies.length, 1);
    assert.equal(retryBodies[0], ambiguousBody, 'Reload recovery must reuse the exact request body and operation ID');
    assert.equal(consoleIssues.length, 0, 'Cooking UI should not emit duplicate React keys');
    process.stdout.write(JSON.stringify({ result: 'passed', checks: ['persisted-leftovers', 'products-classic-6-6-0', 'fresh-390px-dark-layout', 'fresh-page-not-duplicated', 'mobile-menu-clears-back-link', 'mobile-no-overflow', 'pending-result-blocks-all-fresh-actions', '400-clears-pending', '500-persists-exact-request', 'new-tab-retry-confirms-commit'], mobileLayout, consoleIssues, evidenceDir }) + '\n');
  } finally {
    await context.close();
    await browser.close();
  }
};

run().catch(error => {
  process.stderr.write(`Cooking recovery integration failed: ${error.name}: ${error.message}\n`);
  process.exitCode = 1;
});

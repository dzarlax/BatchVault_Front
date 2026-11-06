const { spawn } = require('node:child_process');
const { setTimeout } = require('node:timers/promises');

// The API's global limiter runs before JWT authentication and counts localhost requests together.
// Keep the suites in separate request windows without weakening that application setting.
async function main() {
  const files = ['tests/costing-editor.browser.cjs', 'tests/order-cost-refresh.browser.cjs', 'tests/product-types.browser.cjs', 'tests/product-types.integration.browser.cjs'];
  const hasFixture = Boolean(process.env.COSTING_QA_WEB_URL && process.env.COSTING_QA_API_URL);
  for (const [index, file] of files.entries()) {
    if (index > 0 && hasFixture) {
      console.log('Waiting for the isolated API request window before the next browser suite…');
      await setTimeout(61000);
    }
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--test', file], { stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
    });
    if (code !== 0) { process.exitCode = code; return; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

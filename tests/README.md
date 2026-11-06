# Costing regression checks

Run the unit tests with `npm run test:costing`. They use Node's test runner and the project's TypeScript compiler, with no browser dependency.

The optional browser tests use a real isolated local API and a local web server. Run `npm run test:costing:browser` with:

- `COSTING_QA_WEB_URL`: localhost web origin, without a trailing slash.
- `COSTING_QA_API_URL`: localhost API origin, without `/api` or a trailing slash.
- `PLAYWRIGHT_MODULE`: path to an installed Playwright package containing its `test` entry point, unless `playwright/test` is available normally.
- `COSTING_QA_CHROME`: optional browser executable path.
- `COSTING_QA_CURRENCY`: optional expected workspace currency, such as `EUR`, enabling the currency-display scenario.

Both URLs are required to enable the tests; otherwise they skip. Public hostnames are rejected. The API must use a disposable synthetic database with notifications unconfigured. The tests update these fixture records and create orders; do not point them at personal or production data.

Fixture contract:

- Account `costing-qa`, password `local-costing-qa`, with its default personal workspace.
- Product `QA Ordinary 100 g`: recipe costing, 100 g package, ingredient batch cost 900 and finished recipe yield 300 g.
- Client with name `Synthetic`, surname `Costing QA`.
- Ingredient prices remain fixed during these scenarios. The test resets package cost to 10 and selling price to 600 before each case, then changes them to 20 and 650 while the order form is open.

On both `/` and `/orders`, the test adds a five-unit row, submits the stale quote and expects 409, explicitly refreshes the estimate, and saves. The new cost must become 320 while quantity stays 5 and selling price stays 600; the original saved row must retain cost 310 and its identity. Product runtime configuration is overridden only inside the browser context.

With `COSTING_QA_CURRENCY=EUR`, the default synthetic workspace must use EUR and include recipe `QA flavour 1`. A third browser case verifies that its finished-content rate, the product cost, and the cost preview all display EUR. Numerical amounts are unchanged.

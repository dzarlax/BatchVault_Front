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

Both order scenarios also hold the GET after a successful PUT. While that read is pending, Save, quantity changes, Add Product and Cancel must be disabled, and only one PUT may be sent. Releasing the GET then closes the saved editor without changing its draft fields.

The browser runner executes the editor and order suites in separate API request windows (61 seconds apart). This preserves the backend's global per-IP limit, which runs before JWT authentication. Do not remove application rate limiting for these checks.

The editor suite covers nested packaging cost changes and initial net weight assignment without changing the selected package ID, plus Russian desktop and Serbian mobile costing controls, shared dropdown interactions, translated issue/validation messages and recipe yield labels. `COSTING_QA_SCREENSHOTS` optionally selects an output directory for synthetic-data screenshots.

For independently owned fixture records, set `COSTING_QA_EDITOR_USER_PREFIX` and seed four accounts ending in `cost`, `weight`, `ru`, and `rs`. Each needs the same synthetic product/recipe/package fixture contract and password as above. Without the prefix, the editor cases use `costing-qa` and restore the original product package after each packaging scenario. Fixture credentials are for disposable localhost data only.

## UI review regressions

`npm run test:ui` exercises the product catalog and editor against intercepted synthetic API responses. Set `COSTING_QA_WEB_URL` to the running localhost frontend, plus the same optional `PLAYWRIGHT_MODULE` and `COSTING_QA_CHROME` used above. No live backend is used by this suite. `COSTING_QA_SCREENSHOTS` selects a directory outside the repository for viewport evidence.

The suite covers short-window navigation, dirty-close confirmation, visible validation and focus, dialog and component names, workspace currency, collapsed mobile filters, incomplete status, and independently expanding cards. The shared fixture is in `tests/helpers/product-ui.cjs`; existing product-type browser cases use the same fixture. These UI checks do not establish backend persistence or replace the real-backend integration cases.

## Orders and recipes UI regressions

`npm run test:ui` also runs `tests/orders-recipes-ui.browser.cjs` against the local frontend with every API request intercepted by `tests/helpers/workflow-ui.cjs`. It covers recovery from synthetic 503 responses, blocked creation while reference data is unavailable, empty versus filtered-empty states, filter disclosure behavior, mobile order cards and responsive overflow, localized order dialogs, order draft close/save behavior, and recipe draft handling. Set `COSTING_QA_WEB_URL` to a localhost origin and use the same optional `PLAYWRIGHT_MODULE` and `COSTING_QA_CHROME` values as the UI review suite. No live backend is used.

The real assortment-history scenario also requires five standard recipe-costed products named `QA Source 1` through `QA Source 5`, linked to `QA flavour 1` through `QA flavour 5`. Their batch ingredient costs are 900, 840, 600, 720, and 780 with a finished yield of 300 g each. The common package is 250 g with unit cost 20: five 50 g components yield an authoritative total of 660. The currency assertion uses the selected workspace currency. Run this real-API scenario in its own rate-limit window after other real-backend suites.

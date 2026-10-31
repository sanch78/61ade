// Configure this together with BLADE_PLAYWRIGHT_BIN so test()/runner share one runtime.
const installation = process.env.BLADE_PLAYWRIGHT_MODULE;
if (!installation) throw new Error('Set BLADE_PLAYWRIGHT_MODULE to the system @playwright/test installation managed by Infra.');
const playwright = require(installation);
// A view guide (docs/workspaces.md#view-guide) opens by itself until it is closed once; every page closes it whenever
// it is in the way of an action. A spec that tests the guide removes the handler: `page.removeLocatorHandler(guide)`.
const guide = page => page.locator('.blade-guide-window');
const test = playwright.test.extend({
    page: async ({ page }, use) => {
        await page.addLocatorHandler(guide(page), async window => { await window.getByRole('button', { name: /close|Bezárás/i }).first().click(); }, { noWaitAfter: true });
        await use(page);
    },
});
module.exports = { ...playwright, test, guide };

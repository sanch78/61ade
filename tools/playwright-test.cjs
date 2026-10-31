// Configure this together with BLADE_PLAYWRIGHT_BIN so test()/runner share one runtime.
const installation = process.env.BLADE_PLAYWRIGHT_MODULE;
if (!installation) throw new Error('Set BLADE_PLAYWRIGHT_MODULE to the system @playwright/test installation managed by Infra.');
const playwright = require(installation);
// A view guide (docs/workspaces.md#view-guide) opens by itself once per sign-in session; every page closes it whenever
// it is in the way of an action. A spec that tests the guide removes the handler: `page.removeLocatorHandler(guide)`.
const guide = page => page.locator('.blade-guide-window');
// The managed demo gives every visitor a sandbox (docs/demos.md#visitor-sandboxes); tests use the shared instance through
// its developer key, in the fixture context and in every browser.newContext(). A sandbox spec clears the cookie.
const developerCookies = () => {
    const path = require('node:path');
    const file = path.join(process.env.BLADE_TMP_DIR || path.resolve(__dirname, '../tmp'), process.env.BLADE_DEMO_INSTANCE || 'web', 'developer.key');
    let value;
    try { value = require('node:fs').readFileSync(file, 'utf8').trim(); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return value && process.env.BLADE_DEMO_URL ? [{ name: 'blade_demo_developer', value, url: process.env.BLADE_DEMO_URL, httpOnly: true, secure: true, sameSite: 'Lax' }] : [];
};
const test = playwright.test.extend({
    browser: [async ({ browser }, use) => {
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async options => { const context = await newContext(options); await context.addCookies(developerCookies()); return context; };
        await use(browser);
    }, { scope: 'worker' }],
    context: async ({ context }, use) => {
        await context.addCookies(developerCookies());
        await use(context);
    },
    page: async ({ page }, use) => {
        await page.addLocatorHandler(guide(page), async window => { await window.getByRole('button', { name: /close|Bezárás/i }).first().click(); }, { noWaitAfter: true });
        await use(page);
    },
});
module.exports = { ...playwright, test, guide };

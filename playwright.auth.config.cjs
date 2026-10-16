const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests/shell', testMatch: 'authentication.spec.cjs', workers: 1,
    outputDir: 'codex/tmp/playwright-auth-results', reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:8090', trace: 'retain-on-failure' },
    webServer: { command: 'node tests/fixtures/authentication/server.mjs', url: 'http://127.0.0.1:8090', reuseExistingServer: false },
});

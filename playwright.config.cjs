const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests/shell', testMatch: '*.spec.cjs', testIgnore: ['authentication.spec.cjs', 'related-fields.spec.cjs', 'grid-edit.spec.cjs'], workers: 1,
    outputDir: 'codex/tmp/playwright-results', reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:8086', trace: 'retain-on-failure' },
    webServer: { command: 'tools/serve-demo.sh', url: 'http://127.0.0.1:8086', reuseExistingServer: !process.env.CI },
});

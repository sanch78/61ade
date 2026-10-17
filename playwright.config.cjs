const { defineConfig } = require('./tools/playwright-test.cjs');
module.exports = defineConfig({
    testDir: './tests/shell', testMatch: '*.spec.cjs', testIgnore: ['i18n.spec.cjs','list-integration.spec.cjs','authentication.spec.cjs', 'related-fields.spec.cjs', 'grid-edit.spec.cjs', 'grid-sort.spec.cjs'], workers: 1,
    outputDir: require('node:path').join(process.env.VAPA_TMP_DIR || 'codex/tmp','playwright-results'), reporter: 'list',
    use: { baseURL: 'http://127.0.0.1:8086', trace: 'retain-on-failure' },
    webServer: { command: 'tools/serve-demo.sh', url: 'http://127.0.0.1:8086', reuseExistingServer: !process.env.CI },
});

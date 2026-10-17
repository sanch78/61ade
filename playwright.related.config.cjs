const {defineConfig}=require('./tools/playwright-test.cjs');
module.exports=defineConfig({
 testDir:'./tests/shell',testMatch:'related-fields.spec.cjs',workers:1,
 outputDir: require('node:path').join(process.env.VAPA_TMP_DIR || 'codex/tmp','playwright-related-results'),reporter:'list',
 use:{baseURL:'http://127.0.0.1:8092',trace:'retain-on-failure'},
 webServer:{command:'${VAPA_PHP:-php8.4} -S 127.0.0.1:8092 tests/fixtures/related-fields/router.php',url:'http://127.0.0.1:8092',reuseExistingServer:!process.env.CI},
});

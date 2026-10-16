const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests/shell',testMatch:'grid-edit.spec.cjs',workers:1,
 outputDir:'codex/tmp/playwright-grid-edit-results',reporter:'list',
 use:{baseURL:'http://127.0.0.1:8094',trace:'retain-on-failure'},
 webServer:{command:'${VAPA_PHP:-php8.4} -S 127.0.0.1:8094 tests/fixtures/grid-edit/router.php',url:'http://127.0.0.1:8094',reuseExistingServer:!process.env.CI},
});

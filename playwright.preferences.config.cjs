const {defineConfig}=require('./tools/playwright-test.cjs');
module.exports=defineConfig({
 testDir:'./tests/shell',testMatch:'preferences.test.cjs',workers:1,
 outputDir:require('node:path').join(process.env.VAPA_TMP_DIR,'preferences-results'),reporter:'list',
 use:{baseURL:'http://127.0.0.1:8096',trace:'retain-on-failure'},
 webServer:{command:'${VAPA_PHP:-php8.4} -S 127.0.0.1:8096 tests/fixtures/grid-sort/router.php',url:'http://127.0.0.1:8096',reuseExistingServer:!process.env.CI},
});

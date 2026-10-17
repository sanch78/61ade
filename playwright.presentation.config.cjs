const {defineConfig}=require('./tools/playwright-test.cjs');
module.exports=defineConfig({
 testDir:'./tests/shell',testMatch:'list-integration.spec.cjs',workers:1,timeout:45000,
 outputDir:require('node:path').join(process.env.VAPA_TMP_DIR,'playwright-presentation-results'),reporter:'list',
 use:{baseURL:'http://127.0.0.1:8098',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'${VAPA_PHP:-php8.4} -S 127.0.0.1:8098 -t examples/demo-app/public tests/fixtures/list-presentation/router.php',url:'http://127.0.0.1:8098',reuseExistingServer:false},
});

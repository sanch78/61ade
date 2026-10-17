const {defineConfig}=require('./tools/playwright-test.cjs');
module.exports=defineConfig({testDir:'./tests/shell',testMatch:'i18n.spec.cjs',workers:1,timeout:60000,
 outputDir:require('node:path').join(process.env.VAPA_TMP_DIR,'i18n-results'),reporter:'list',
 use:{baseURL:'http://127.0.0.1:8099',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'${VAPA_PHP:-php8.4} -S 127.0.0.1:8099 -t examples/demo-app/public tests/fixtures/i18n/router.php',url:'http://127.0.0.1:8099',reuseExistingServer:false}});

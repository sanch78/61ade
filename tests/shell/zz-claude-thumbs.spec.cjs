const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
test('signage thumbs probe',async({page})=>{
 await page.setViewportSize({width:1600,height:1000});
 await signIn(page,'demo@example.test','/#view=signage_assets');
 await expect(page.locator('[data-cell-id="grid"]').locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();
 await page.waitForTimeout(4000);
 await page.reload();await page.waitForTimeout(4000);
 await page.screenshot({path:'tmp/claude-1000/thumbs.png'});
});

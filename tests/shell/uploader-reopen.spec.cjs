const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,command}=require('./feature-demo.cjs');
// The uploader window is modal and keeps its content when it is reopened again and again while switching routes.
test('uploader reopened across routes stays modal and keeps its content',async({page})=>{
 await page.setViewportSize({width:1920,height:1000});await signIn(page,'demo@example.test','/#view=signage_assets');
 for(const [index,hash] of ['signage_assets','files','signage_assets','files','files','signage_assets'].entries()){
  if(index)await page.evaluate(h=>{location.hash='#view='+h;},hash);
  await command(page,'Feltöltés');
  await expect(page.locator('.dhx_window__overlay')).toHaveCount(1);
  await expect(page.locator('.blade-uploader__zone')).toBeVisible();
  await expect(page.locator('.blade-uploader__commands')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.blade-uploader-window')).toHaveCount(0);
 }
});

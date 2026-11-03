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
  if(!index){
   // The footer is the shared window action row: native Form buttons, flush with the window's lower edge, no rule below.
   const footer=await page.locator('.blade-uploader-window').evaluate(win=>{
    const content=win.querySelector('.dhx_window-content').getBoundingClientRect(),cell=win.querySelector('.blade-uploader__commands'),box=cell.getBoundingClientRect();
    return {toolbars:win.querySelectorAll('.dhx_window-content .dhx_toolbar').length,actions:!!cell.querySelector('.blade-form-actions'),gap:Math.round(content.bottom-box.bottom),
     inset:Math.round(box.left-content.left),below:getComputedStyle(cell).borderBottomWidth,above:getComputedStyle(cell).borderTopWidth,
     primary:cell.querySelector('.dhx_button--color_primary')?.textContent.trim()};
   });
   expect(footer).toEqual({toolbars:0,actions:true,gap:0,inset:0,below:'0px',above:'1px',primary:'Bezárás'});
   // The resize handles straddle the window edge; the window does not clip their outer half (the overlay would take the press).
   const outside=await page.locator('.blade-uploader-window').evaluate(win=>{const box=win.getBoundingClientRect(),at=(x,y)=>document.elementFromPoint(x,y)?.className??'';
    return [at(box.left+box.width/2,box.bottom+3),at(box.right+3,box.top+box.height/2)];});
   expect(outside).toEqual([expect.stringContaining('dhx_window-resizer--bottom'),expect.stringContaining('dhx_window-resizer--right')]);
   await page.screenshot({path:`${process.env.BLADE_TMP_DIR||'tmp'}/uploader/footer.png`});
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.blade-uploader-window')).toHaveCount(0);
 }
});

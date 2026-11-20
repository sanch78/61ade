const {test}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu}=require('./feature-demo.cjs');
test('toggle look',async({page})=>{
 await signIn(page,'single@example.test','/tenants/');
 await openMenu(page,'Projektek','Tenant demó');
 const row=page.locator('.dhx_grid-row').filter({hasText:'Alpha research'}).first();
 const cell=row.locator('[data-dhx-col-id="_subrow"], .dhx_grid-cell').first();
 const info=async()=>row.locator('.blade-subrow-toggle').evaluate(b=>{const i=b.querySelector('.dhx_button__icon');const s=getComputedStyle(i),bs=getComputedStyle(b),r=b.getBoundingClientRect(),ir=i.getBoundingClientRect(),c=b.closest('.dhx_grid-cell').getBoundingClientRect();
   return {cls:i.className,font:s.fontSize,color:s.color,weight:s.fontWeight,transform:s.transform,btn:[r.x,r.y,r.width,r.height],icon:[ir.x,ir.y,ir.width,ir.height],cell:[c.x,c.y,c.width,c.height],btnBg:bs.backgroundColor,outline:bs.outline,boxShadow:bs.boxShadow};});
 const shot=async name=>{const b=await row.boundingBox();await page.screenshot({path:`tmp/toggle/${name}.png`,clip:{x:b.x,y:b.y-2,width:260,height:b.height+4}});};
 await page.evaluate(()=>document.body.style.zoom='');
 console.log('closed',JSON.stringify(await info()));await shot('closed');
 await row.locator('.blade-subrow-toggle').click();await page.waitForTimeout(800);
 console.log('open',JSON.stringify(await info()));await shot('open');
 await page.mouse.click(5,5);await page.waitForTimeout(300);await shot('open-blur');
 console.log('open-blur',JSON.stringify(await info()));
});

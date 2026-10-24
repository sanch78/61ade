const {test,expect}=require('../../tools/playwright-test.cjs');
test('native cards preserve selection, editing and live data across responsive changes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('61de-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await page.getByRole('menuitem',{name:'Jegyzetek',exact:true}).click();
 await expect(page.locator('.dhx_grid')).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const cards=page.locator('.blade-grid-card');await expect(cards.first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Műveletek',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Műveletek',exact:true}).click();
 await expect(page.getByText('Nézet: Kártyák',{exact:true})).toBeVisible();
 expect((await page.locator('.blade-grid-cards').boundingBox()).width).toBeGreaterThan(340);
 await page.getByText('Szűrés',{exact:true}).click();
 await expect(page.getByRole('dialog').getByLabel('Cím',{exact:true})).toBeVisible();
 expect((await page.locator('.dhx_window-header').boundingBox()).height).toBe(40);
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:false}).click();

 await cards.first().click();await page.getByRole('button',{name:'Műveletek',exact:true}).click();
 await page.getByText('Módosítás',{exact:true}).click();await expect(page.getByRole('dialog').getByLabel('Cím',{exact:true})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:false}).click();
 await page.setViewportSize({width:1280,height:900});await expect(page.locator('.dhx_grid')).toBeVisible();
 await expect(page.getByRole('button',{name:'Módosítás',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();await expect(cards.first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.setViewportSize({width:1280,height:900});
 await expect(cards.first()).toBeVisible();
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Táblázat',{exact:true}).click();await expect(page.locator('.dhx_grid')).toBeVisible();
 expect(errors).toEqual([]);
});

test('synthetic cards escape content, retain fields, selection and scroll during updates and load on scroll',async({page})=>{
 const path=require('node:path');const {buildSync}=require('esbuild');
 const root=path.resolve(__dirname,'../..');
 const bundle=buildSync({stdin:{contents:'export {ResponsiveGrid} from "./packages/frontend/src/ResponsiveGrid";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});await page.setContent('<div id="blade-application"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  window.rows=Array.from({length:100},(_,i)=>({id:String(i+1),title:i===0?'<img src=x onerror=alert(1)>':i===1?'Unbroken'.repeat(100):'Synthetic record '+i,active:i%2===0,status:'open',hidden:'secret'}));
  window.more=[];window.selected=null;
  window.adapter=new fixture.ResponsiveGrid(document.getElementById('blade-application'),[{id:'title',header:'Megnevezés'},{id:'active',header:'Aktív',type:'checkbox'},{id:'status',header:'Állapot',options:{open:'Nyitott'}}],()=>window.rows,id=>window.selected=id,()=>{},direction=>window.more.push(direction),()=>{});
  adapter.setRows(rows);
 });
 const cards=page.locator('.blade-grid-card');await expect(cards.first()).toBeVisible();
 await expect(cards.first()).toContainText('<img src=x onerror=alert(1)>');await expect(cards.first().locator('img')).toHaveCount(0);
 await expect(cards.first()).toContainText('Nyitott');await expect(cards.first()).not.toContainText('secret');
 await expect(cards.first().getByRole('checkbox',{name:'Aktív'})).toHaveCount(0);await expect(cards.first()).toContainText('Igen');
 await expect.poll(async()=>{const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();return Math.abs(first.width-second.width);}).toBeLessThan(1);
 expect(await page.locator('.blade-grid-cards').evaluate(root=>root.scrollWidth-root.clientWidth)).toBe(0);
 await page.evaluate(()=>adapter.setMode('cards'));
 for(const width of [1280,460,390]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect.poll(async()=>Math.abs((await cards.nth(0).boundingBox()).width-(await cards.nth(1).boundingBox()).width)).toBeLessThan(1);
  expect(await page.locator('.blade-grid-cards').evaluate(root=>root.scrollWidth-root.clientWidth)).toBe(0);
 }

 await cards.nth(4).click();expect(await page.evaluate(()=>selected)).toBe('5');
 await page.locator('.blade-grid-cards').evaluate(e=>{e.scrollTop=1000;});
 await expect.poll(()=>page.evaluate(()=>adapter.capture().id)).not.toBe('1');
 const position=await page.evaluate(()=>adapter.capture());
 await page.evaluate(async()=>{const p=adapter.capture();rows=rows.map(r=>r.id==='1'?{...r,title:'Updated title '.repeat(100)}:r);adapter.setRows(rows);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));adapter.restore(p,true,selected);});
 expect(await page.evaluate(()=>adapter.capture().id)).toBe(position.id);
 expect(await page.evaluate(()=>selected)).toBe('5');
 await page.locator('.blade-grid-cards').evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect.poll(()=>page.evaluate(()=>more.includes('next'))).toBe(true);
 await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR || path.join(root,'tmp'),'mobile-grid.png')});
 await page.evaluate(()=>adapter.destroy());expect(errors).toEqual([]);
});

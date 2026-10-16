const {test,expect}=require('@playwright/test');
test('native cards preserve selection, editing and live data across responsive changes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('Felhasználónév',{exact:true}).fill('demo');await page.getByLabel('Jelszó',{exact:true}).fill('vapa-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await page.getByRole('menuitem',{name:'Jegyzetek',exact:true}).click();
 await expect(page.locator('.dhx_grid')).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const cards=page.locator('.vapa-grid-card');await expect(cards.first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Táblázat',exact:true})).toBeDisabled();
 expect((await page.locator('.vapa-grid-cards').boundingBox()).width).toBeGreaterThan(340);
 await page.getByRole('button',{name:'Szűrés',exact:true}).click();
 await expect(page.getByRole('dialog').getByLabel('Cím',{exact:true})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:false}).click();

 await cards.first().click();await expect(page.getByRole('button',{name:'Módosítás',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();await expect(page.getByRole('dialog').getByLabel('Cím',{exact:true})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:false}).click();
 await page.setViewportSize({width:1280,height:900});await expect(page.locator('.dhx_grid')).toBeVisible();
 await expect(page.getByRole('button',{name:'Módosítás',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Kártyák',exact:true}).click();await expect(cards.first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.setViewportSize({width:1280,height:900});
 await expect(cards.first()).toBeVisible();
 await page.getByRole('button',{name:'Táblázat',exact:true}).click();await expect(page.locator('.dhx_grid')).toBeVisible();
 expect(errors).toEqual([]);
});

test('synthetic cards escape content, retain fields, selection and scroll during updates and load on scroll',async({page})=>{
 const path=require('node:path');const {buildSync}=require('esbuild');
 const root=path.resolve(__dirname,'../..');
 const bundle=buildSync({stdin:{contents:'export {ResponsiveGrid} from "./packages/frontend/src/ResponsiveGrid";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});await page.setContent('<div id="vapa-application"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  window.rows=Array.from({length:100},(_,i)=>({id:String(i+1),title:i===0?'<img src=x onerror=alert(1)>':'Synthetic record '+i,active:i%2===0,status:'open',hidden:'secret'}));
  window.more=[];window.selected=null;
  window.adapter=new fixture.ResponsiveGrid(document.getElementById('vapa-application'),[{id:'title',header:'Megnevezés'},{id:'active',header:'Aktív',type:'checkbox'},{id:'status',header:'Állapot',options:{open:'Nyitott'}}],()=>window.rows,id=>window.selected=id,()=>{},direction=>window.more.push(direction),()=>{});
  adapter.setRows(rows);
 });
 const cards=page.locator('.vapa-grid-card');await expect(cards.first()).toBeVisible();
 await expect(cards.first()).toContainText('<img src=x onerror=alert(1)>');await expect(cards.first().locator('img')).toHaveCount(0);
 await expect(cards.first()).toContainText('Nyitott');await expect(cards.first()).not.toContainText('secret');
 await expect(cards.first().getByRole('checkbox',{name:'Aktív'})).toHaveAttribute('aria-checked','true');
 await cards.nth(4).click();expect(await page.evaluate(()=>selected)).toBe('5');
 await page.locator('.vapa-grid-cards').evaluate(e=>{e.scrollTop=1000;});
 await expect.poll(()=>page.evaluate(()=>adapter.capture().id)).not.toBe('1');
 const position=await page.evaluate(()=>adapter.capture());
 await page.evaluate(async()=>{const p=adapter.capture();rows=rows.map(r=>r.id==='1'?{...r,title:'Updated title '.repeat(100)}:r);adapter.setRows(rows);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));adapter.restore(p,true,selected);});
 expect(await page.evaluate(()=>adapter.capture().id)).toBe(position.id);
 expect(await page.evaluate(()=>selected)).toBe('5');
 await page.locator('.vapa-grid-cards').evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect.poll(()=>page.evaluate(()=>more.includes('next'))).toBe(true);
 await page.screenshot({path:path.join(root,'codex/tmp/mobile-grid.png')});
 await page.evaluate(()=>adapter.destroy());expect(errors).toEqual([]);
});

const {test,expect}=require('../../tools/playwright-test.cjs');
const {openMenu}=require('./feature-demo.cjs');
test('native cards preserve selection, editing and live data across responsive changes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('61de-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 // Since FB-0062 the desktop main menu is collapsed: open the notes view through the shared step.
 await openMenu(page,'Jegyzetek','Feature demó');
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

// Independent synthetic consumer of the media-aware presentation (no server media fields needed):
// rows carry `_media` descriptors; the one "ready" thumbnail is answered 404 and must fall back.
test('synthetic media tiles: reflow, row-height restore, keys, marks, reserved keys and re-created host DOM',async({page})=>{
 test.setTimeout(90000);
 const path=require('node:path');const {buildSync}=require('esbuild');
 const root=path.resolve(__dirname,'../..');
 const bundle=buildSync({stdin:{contents:'export {ResponsiveGrid} from "./packages/frontend/src/ResponsiveGrid"; export {Layout,setTheme} from "@dhtmlx/suite";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const thumbnails=[];await page.route(/thumbnail_get/,route=>{thumbnails.push(route.request().url());return route.fulfill({status:404,contentType:'application/json',body:'{"ok":false,"error":"missing"}'});});
 await page.route('**/media-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><div id="blade-application"></div>'}));
 await page.setViewportSize({width:1280,height:800});await page.goto('/media-fixture');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const kinds=[{mime_type:'video/webm',ext:'webm',duration_ms:6000},{mime_type:'image/jpeg',ext:'jpg',duration_ms:null},{mime_type:'application/pdf',ext:'pdf',duration_ms:null}];
  window.rows=Array.from({length:120},(_,i)=>{const kind=kinds[i%3];return {id:String(i+1),thumb:'f'+i,title:i===2?'Hosszúnévtöréspróba'.repeat(20):'Média '+i,height:1000,kind:'a',
   _media:{thumb:{id:i===4?'missing':'f'+i,name:(kind.ext==='webm'?'minta':kind.ext==='jpg'?'foto':'leiras')+i+'.'+kind.ext,mime_type:kind.mime_type,revision:'r'+i,duration_ms:kind.duration_ms,width:640,height:360,thumbnail:i===4?'ready':i%2?'failed':'none'}}};});
  window.more=[];window.selected=null;window.opened=0;window.modes=[];
  fixture.setTheme('skyblue',document.documentElement);
  // The host Layout re-creates the attached grid DOM on a views switch (FB-0058).
  window.host=new fixture.Layout(document.getElementById('blade-application'),{type:'none',views:[{id:'list'},{id:'other'}],activeView:'list'});
  host.getCell('other').attachHTML('<p>Other view</p>');
  window.adapter=new fixture.ResponsiveGrid(document.createElement('div'),[{id:'thumb',header:'Előnézet',type:'select',media:'files'},{id:'title',header:'Megnevezés'},{id:'height',header:'Magasság'},{id:'kind',header:'Típus',options:{a:'Alfa'}}],()=>window.rows,id=>window.selected=id,()=>window.opened++,direction=>window.more.push(direction),(cards,mobile,mode)=>window.modes.push(mode),{rowSelection:true,rowHeight:64,idColumn:false,rowNumbers:false,marked:ids=>window.marks=ids});
  host.getCell('list').attach(adapter.layout);adapter.setRows(rows);
 });
 const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const mode=async m=>{await page.evaluate(m=>adapter.setMode(m),m);await expect.poll(()=>page.evaluate(()=>adapter.mode)).toBe(m);await frame();await frame();};
 // Table: the `height` data key is displayed but never becomes the Suite row height; thumbnail cell scales with rowHeight.
 const rowsInTable=page.locator('.dhx_grid-row');await expect(rowsInTable.first()).toBeVisible();
 expect(await rowsInTable.evaluateAll(rows=>rows.slice(0,5).map(row=>Math.round(row.getBoundingClientRect().height)))).toEqual([64,64,64,64,64]);
 await expect(page.locator('.dhx_grid-cell[data-dhx-col-id="height"]').first()).toHaveText('1000');
 expect(await page.locator('.blade-media--cell').first().evaluate(e=>[e.offsetWidth,e.offsetHeight])).toEqual([56,56]);
 // The accessible name conveys the type in text.
 await expect(page.getByRole('img',{name:'Videó: minta0.webm, 0:06',exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:'Kép: foto1.jpg',exact:true})).toBeVisible();
 await expect(page.getByRole('img',{name:'Fájl: leiras2.pdf',exact:true})).toBeVisible();
 await expect(page.locator('.blade-media--video .blade-media__duration').first()).toHaveText('0:06');
 // The single "ready" thumbnail answers 404: one request, then the type icon without a broken image.
 const failed=page.getByRole('img',{name:'Kép: foto4.jpg',exact:true}).first();
 await expect(failed).toHaveClass(/blade-media--failed/);await expect(failed.locator('img')).toHaveCount(0);await expect(failed.locator('.blade-media__icon')).toBeVisible();
 expect(thumbnails.length).toBe(1);expect(thumbnails[0]).toContain('resource=files');expect(thumbnails[0]).toContain('id=missing');
 // Scroll/paging capture and restore at rowHeight 64.
 await page.evaluate(()=>adapter.table.scroll(0,64*20+10));
 await expect.poll(()=>page.evaluate(()=>adapter.capture().id)).toBe('21');expect((await page.evaluate(()=>adapter.capture())).offset).toBe(10);
 await page.evaluate(async()=>{const p=adapter.capture();rows=rows.map(r=>r.id==='3'?{...r,title:'Frissítve'}:r);adapter.setRows(rows);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));adapter.restore(p,true,selected);});
 await expect.poll(()=>page.evaluate(()=>adapter.capture().id)).toBe('21');expect(await page.evaluate(()=>adapter.table.getScrollState().y)).toBe(64*20+10);
 await page.evaluate(()=>adapter.table.scroll(0,64*120));await expect.poll(()=>page.evaluate(()=>more.includes('next'))).toBe(true);
 await page.evaluate(()=>adapter.table.scroll(0,64*20));await frame();
 // table → tiles → table → cards → table keeps the visible record.
 const tiles=page.locator('.blade-grid-tile');
 await mode('tiles');await expect(page.locator('article[data-blade-row="21"]')).toBeInViewport();
 const tileTop=await page.evaluate(()=>adapter.capture().id);
 await mode('table');expect(await page.evaluate(()=>adapter.capture().id)).toBe(tileTop);
 await mode('cards');await expect(page.locator(`article[data-blade-row="${tileTop}"]`)).toBeInViewport();
 await expect(page.locator('.blade-grid-card__media .blade-media--card').first()).toBeVisible();
 const cardTop=await page.evaluate(()=>adapter.capture().id);
 await mode('table');expect(await page.evaluate(()=>adapter.capture().id)).toBe(cardTop);
 expect(await page.evaluate(()=>modes.includes('tiles')&&modes.includes('cards'))).toBe(true);
 // Tiles reflow: equal widths per row, ≥2 per row at 390 px, never a horizontal overflow.
 await page.evaluate(()=>adapter.table.scroll(0,0));await mode('tiles');
 for(const [width,perRow] of [[1280,6],[390,2]]){
  await page.setViewportSize({width,height:800});await frame();
  await expect.poll(()=>tiles.evaluateAll((elements,n)=>elements.slice(0,n).every(e=>Math.abs(e.getBoundingClientRect().top-elements[0].getBoundingClientRect().top)<1)&&elements[n].getBoundingClientRect().top>elements[0].getBoundingClientRect().top+1,perRow)).toBe(true);
  expect(await tiles.evaluateAll(elements=>Math.max(...elements.slice(0,6).map(e=>e.getBoundingClientRect().width))-Math.min(...elements.slice(0,6).map(e=>e.getBoundingClientRect().width)))).toBeLessThan(1);
  expect(await page.locator('.blade-grid-tiles').evaluate(e=>e.scrollWidth-e.clientWidth)).toBe(0);
  expect(await page.locator('article[data-blade-row="3"] .blade-grid-tile__title').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>adapter.mode)).toBe('tiles');
 }
 await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR||path.join(root,'tmp'),'media-tiles-390.png')});
 await page.setViewportSize({width:1280,height:800});await frame();
 // Live update in tiles keeps the visible record.
 await page.locator('.blade-grid-tiles').evaluate(e=>{e.scrollTop=700;});await frame();
 const live=await page.evaluate(()=>adapter.capture().id);
 await page.evaluate(async()=>{const p=adapter.capture();rows=rows.map(r=>r.id==='1'?{...r,title:'Live '.repeat(40)}:r);adapter.setRows(rows);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));adapter.restore(p,true,selected);});
 expect(await page.evaluate(()=>adapter.capture().id)).toBe(live);
 await page.locator('.blade-grid-tiles').evaluate(e=>{e.scrollTop=0;});await frame();
 // Keyboard: arrows/Home/End/PageDown move the cursor, Space toggles the mark, Enter opens; the ring stays visible.
 await page.locator('article[data-blade-row="1"] .blade-grid-tile__title').click();
 expect(await page.evaluate(()=>[selected,marks])).toEqual(['1',['1']]);
 await page.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>selected)).toBe('2');
 await page.keyboard.press('ArrowDown');await expect.poll(()=>page.evaluate(()=>selected)).toBe('8');
 await page.keyboard.press('End');await expect.poll(()=>page.evaluate(()=>selected)).toBe('120');
 await page.keyboard.press('Home');await expect.poll(()=>page.evaluate(()=>selected)).toBe('1');
 await page.keyboard.press('PageDown');await expect.poll(()=>page.evaluate(()=>Number(selected))).toBeGreaterThan(6);
 await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
 await page.keyboard.press(' ');await expect.poll(()=>page.evaluate(()=>marks)).toEqual(['1','2']);
 await page.keyboard.press(' ');await expect.poll(()=>page.evaluate(()=>marks)).toEqual(['1']);
 await page.keyboard.press('Enter');expect(await page.evaluate(()=>opened)).toBe(1);
 await expect(page.locator('.blade-grid-tiles .dhx_dataview-item--focus')).toHaveCount(1);
 for(const theme of ['skyblue','light','dark']){
  await page.evaluate(theme=>fixture.setTheme(theme,document.documentElement),theme);await frame();
  const ring=await page.locator('.blade-grid-tiles .dhx_dataview-item--focus').evaluate(e=>{const s=getComputedStyle(e);return {style:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor};});
  expect(ring.style).toBe('solid');expect(ring.width).toBe('2px');expect(ring.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('.blade-grid-tiles').evaluate(e=>e.scrollWidth-e.clientWidth)).toBe(0);
  await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR||path.join(root,'tmp'),`media-tiles-${theme}.png`)});
 }
 await page.evaluate(()=>fixture.setTheme('skyblue',document.documentElement));
 // Table keys: cursor row moves, Space marks; marks survive the mode switch.
 await mode('table');
 await page.locator('.dhx_grid-cell[data-dhx-col-id="title"]').first().click();expect(await page.evaluate(()=>selected)).toBe('1');
 await page.keyboard.press('ArrowDown');await expect.poll(()=>page.evaluate(()=>selected)).toBe('2');
 await page.keyboard.press(' ');await expect.poll(()=>page.evaluate(()=>marks)).toEqual(['1','2']);
 await page.keyboard.press('End');await expect.poll(()=>page.evaluate(()=>selected)).toBe('120');
 await page.keyboard.press('Home');await expect.poll(()=>page.evaluate(()=>selected)).toBe('1');
 await page.keyboard.press('PageDown');await expect.poll(()=>page.evaluate(()=>Number(selected))).toBeGreaterThan(2);
 await page.keyboard.press('Enter');expect(await page.evaluate(()=>opened)).toBe(2);
 await page.keyboard.press('Home');await expect(page.locator('.dhx_grid-row.blade-grid-row-marked')).toHaveCount(2);
 // FB-0058: the host re-creates the grid DOM; marking, card scroll paging and reflow keep working.
 await mode('tiles');
 const before=await page.evaluate(()=>{window.oldRoot=adapter.layout.getRootNode();return true;});expect(before).toBe(true);
 await page.evaluate(async()=>{host.getCell('other').show();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));host.getCell('list').show();});
 await frame();await frame();
 expect(await page.evaluate(()=>adapter.layout.getRootNode()!==oldRoot&&adapter.layout.getRootNode().isConnected&&!oldRoot.isConnected)).toBe(true);
 await expect(tiles.first()).toBeVisible();
 await page.locator('article[data-blade-row="4"] .blade-grid-tile__title').click();
 await page.locator('article[data-blade-row="6"] .blade-grid-tile__title').click({modifiers:['Control']});
 expect(await page.evaluate(()=>marks)).toEqual(['4','6']);
 await page.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>selected)).toBe('7');
 await page.setViewportSize({width:700,height:800});
 await expect.poll(()=>tiles.evaluateAll(elements=>elements.filter(e=>Math.abs(e.getBoundingClientRect().top-elements[0].getBoundingClientRect().top)<1).length)).toBe(3);
 await page.evaluate(()=>{more.length=0;});
 await page.locator('.blade-grid-tiles').evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect.poll(()=>page.evaluate(()=>more.includes('next'))).toBe(true);
 await mode('cards');await page.evaluate(()=>{more.length=0;});
 await page.locator('.blade-grid-cards').evaluate(e=>{e.scrollTop=e.scrollHeight;});await expect.poll(()=>page.evaluate(()=>more.includes('next'))).toBe(true);
 await page.evaluate(()=>adapter.destroy());expect(errors).toEqual([]);
});

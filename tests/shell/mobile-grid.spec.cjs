const {test,expect}=require('../../tools/playwright-test.cjs');
const {openMenu}=require('./feature-demo.cjs');
test('native cards preserve selection, editing and live data across responsive changes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('61ade-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
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
 await expect(page.locator('.dhx_grid-cell[data-dhx-col-id="__blade_height"]').first()).toHaveText('1000');
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

// A record field named like a Suite row key (`height`) that is editable: the native editor reads and writes
// its alias, so neither an edit nor a rejected save ever changes the row height (independent synthetic consumer).
test('an editable reserved-key column edits its alias and keeps the row height',async({page})=>{
 const path=require('node:path');const {buildSync}=require('esbuild');
 const root=path.resolve(__dirname,'../..');
 const bundle=buildSync({stdin:{contents:'export {ResponsiveGrid} from "./packages/frontend/src/ResponsiveGrid"; export {GridEditing} from "./packages/frontend/src/GridEditing";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/edit-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><div id="blade-application"></div>'}));
 await page.setViewportSize({width:1280,height:800});await page.goto('/edit-fixture');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  window.rows=Array.from({length:20},(_,i)=>({id:String(i+1),title:'Sor '+i,height:String(1000+i),revision:'r'+i,_editable:['height']}));
  window.saved=[];window.failNext=false;window.reported=[];
  window.adapter=new fixture.ResponsiveGrid(document.getElementById('blade-application'),[{id:'title',header:'Megnevezés'},{id:'height',header:'Magasság',editable:true}],()=>window.rows,()=>{},()=>{},()=>{},()=>{},{rowHeight:48,idColumn:false,rowNumbers:false});
  adapter.setRows(rows);
  window.editing=new fixture.GridEditing(adapter.table,[{name:'height',label:'Magasság',type:'text',required:true,max:10,options:{}}],()=>window.rows,async(row,field,value)=>{
   saved.push([row.id,field,value]);
   if(window.failNext){window.failNext=false;throw new Error('Mentés elutasítva');}
   rows=rows.map(r=>r.id===row.id?{...r,[field]:value,revision:r.revision+'+'}:r);adapter.setRows(rows);
  },async error=>{reported.push(error.message);},()=>{});
 });
 const heights=()=>page.locator('.dhx_grid-row').evaluateAll(rows=>rows.slice(0,3).map(row=>Math.round(row.getBoundingClientRect().height)));
 const cell=()=>page.locator('.dhx_grid-row').first().locator('.dhx_grid-cell[data-dhx-col-id="__blade_height"]');
 await expect(cell()).toHaveText('1000');expect(await heights()).toEqual([48,48,48]);
 await cell().dblclick();
 const editor=page.locator('.dhx_cell-editor__input');await expect(editor).toBeVisible();await expect(editor).toHaveValue('1000');
 expect(await heights()).toEqual([48,48,48]);
 await editor.fill('1200');await editor.press('Enter');
 await expect.poll(()=>page.evaluate(()=>saved)).toEqual([['1','height','1200']]);
 await expect(cell()).toHaveText('1200');expect(await heights()).toEqual([48,48,48]);
 // Suite's own row key is never written: the item holds the value only under its alias.
 expect(await page.evaluate(()=>{const item=adapter.table.data.getItem('1');return [Object.hasOwn(item,'height'),item.__blade_height];})).toEqual([false,'1200']);
 // A rejected save restores the stored value through the alias as well.
 await page.evaluate(()=>{window.failNext=true;});
 await cell().dblclick();await expect(editor).toBeVisible();await editor.fill('77');await editor.press('Enter');
 await expect.poll(()=>page.evaluate(()=>reported)).toEqual(['Mentés elutasítva']);
 await expect(cell()).toHaveText('1200');expect(await heights()).toEqual([48,48,48]);
 expect(await page.evaluate(()=>Object.hasOwn(adapter.table.data.getItem('1'),'height'))).toBe(false);
 await page.evaluate(()=>{editing.destroy();adapter.destroy();});expect(errors).toEqual([]);
});

// Details and cards: every media field renders as media (a detail field without `media` takes it from its
// column), and an icon value without option labels is named in text, never by its glyph alone.
test('details and cards render every media field and name an icon without options',async({page})=>{
 const path=require('node:path');const {buildSync}=require('esbuild');
 const root=path.resolve(__dirname,'../..');
 const bundle=buildSync({stdin:{contents:'export {Workspace} from "./packages/frontend/src/Workspace"; export {setTheme} from "@dhtmlx/suite";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/details-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><div id="blade-application"></div>'}));
 await page.setViewportSize({width:1280,height:800});await page.goto('/details-fixture');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const media=(id,name,mime_type,duration_ms)=>({id,name,mime_type,revision:'r',duration_ms,width:640,height:360,thumbnail:'none'});
  const rows=[{id:'1',title:'Első',cover:'f1',clip:'f2',glyph:'dxi dxi-image-outline',revision:'r1',_actions:['get'],_media:{cover:media('f1','borito.jpg','image/jpeg',null),clip:media('f2','elozetes.webm','video/webm',6000)}}];
  window.fetch=async(_url,config)=>{
   const request=JSON.parse(config.body);let data;
   if(request.action==='list'||request.action==='__watch')data={items:rows,previous:null,next:null,version:'v1'};
   if(request.action==='get')data=rows[0];
   return {ok:true,json:async()=>({ok:true,data})};
  };
  fixture.setTheme('skyblue',document.documentElement);
  window.workspace=new fixture.Workspace(document.getElementById('blade-application'),{resource:'items',title:'Elemek',
   columns:[{id:'title',header:'Cím'},{id:'cover',header:'Borító',media:'files'},{id:'glyph',header:'Jel',presentation:'icon'}],
   detailFields:[{id:'title',header:'Cím',type:'text'},{id:'cover',header:'Borító',type:'text'},{id:'clip',header:'Előzetes',type:'text',media:'files'},{id:'glyph',header:'Jel',type:'text',presentation:'icon'}],
   actions:[{name:'get',label:'Adatok',fields:[]}],singleton:false,filters:[],sortable:[],layout:{formMode:'overlay',tree:{cols:[{id:'grid',header:'Találatok'}]}}},'csrf',{transport:'poll',endpoint:'live',interval:60000});
 });
 await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
 const glyph=page.locator('.dhx_grid-cell[data-dhx-col-id="glyph"] .blade-record-icon').first();
 await expect(glyph.locator('.blade-record-icon__label')).toHaveText('image outline');
 expect(await glyph.locator('.blade-record-icon__label').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const details=page.getByRole('dialog',{name:'Rekordadatok',exact:true});
 await expect(details.getByRole('img',{name:'Kép: borito.jpg',exact:true})).toBeVisible();
 await expect(details.getByRole('img',{name:'Videó: elozetes.webm, 0:06',exact:true})).toBeVisible();
 await expect(details).not.toContainText('f2');
 await expect(details.locator('.blade-record-icon')).toHaveAttribute('aria-hidden','true');
 await expect(details).toContainText('image outline');await expect(details).not.toContainText('dxi dxi-');
 await details.getByRole('button',{name:'Close',exact:false}).click();
 // Cards: the first media field fills the slot on top, every further one is rendered in its own field.
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
 const card=page.locator('.blade-grid-card').first();await expect(card).toBeVisible();
 await expect(card.locator('.blade-grid-card__media').getByRole('img',{name:'Kép: borito.jpg',exact:true})).toBeVisible();
 await expect(card.locator('dd').getByRole('img',{name:'Videó: elozetes.webm, 0:06',exact:true})).toBeVisible();
 await expect(card).toContainText('image outline');await expect(card).not.toContainText('f2');
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});
// Independent synthetic consumer of phase U5 (no server): derived media columns (`media_of`/`part`) in
// table, cards, tiles and details; the `file` field with its tiles picker and clearing; the usage-aware
// delete confirmation (single `preview`, bulk `__bulk` preview) and the toast of cleared references.
test('synthetic file field, derived media columns and usage-aware delete',async({page})=>{
 const path=require('node:path');const {buildSync}=require('esbuild');
 const root=path.resolve(__dirname,'../..');
 const bundle=buildSync({stdin:{contents:'export {Workspace} from "./packages/frontend/src/Workspace"; export {setTheme} from "@dhtmlx/suite";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/file-field-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><div id="blade-application"></div>'}));
 await page.setViewportSize({width:1280,height:800});await page.goto('/file-field-fixture');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const media=(id,name,mime_type,duration_ms,width,height)=>({id,name,mime_type,revision:'r'+id,duration_ms,width,height,thumbnail:'none'});
  const file={resource:'files',mount:'signage',folder_id:'20',accept:['image','video'],can_upload:false,can_choose:true};
  const fields=[{name:'title',label:'Cím',type:'text',required:true,max:120,options:{}},{name:'file_id',label:'Médiafájl',type:'file',required:false,max:20,options:{},file}];
  window.rows=[
   {id:'1',title:'Videós',file_id:'31',revision:'a',_actions:['get','update','delete'],_media:{file_id:media('31','clip.webm','video/webm',6000,640,360)}},
   {id:'2',title:'Képes',file_id:'32',revision:'b',_actions:['get','update','delete'],_media:{file_id:media('32','kep.png','image/png',null,1920,1080)}},
   {id:'3',title:'Üres',file_id:'',revision:'c',_actions:['get','update','delete'],_media:{file_id:null}},
  ];
  const listing={directory:{id:'20',mount:'signage',depth:0,path:[{id:'20',name:'Signage'}]},next:null,total:5,matched:5,items:[
   {id:'40',name:'Mappa',kind:'directory',mime_type:'',revision:'1',size:0},
   {id:'31',name:'clip.webm',kind:'file',mime_type:'video/webm',revision:'r31',duration_ms:6000,width:640,height:360,thumbnail:'none'},
   {id:'32',name:'kep.png',kind:'file',mime_type:'image/png',revision:'r32',width:1920,height:1080,thumbnail:'none'},
   {id:'33',name:'masik.jpg',kind:'file',mime_type:'image/jpeg',revision:'r33',width:800,height:600,thumbnail:'none'},
   {id:'34',name:'jegyzet.txt',kind:'file',mime_type:'text/plain',revision:'r34'},
  ]};
  window.requests=[];
  window.fetch=async(_url,config)=>{
   const request=JSON.parse(config.body);requests.push(request);let data;
   if(request.resource==='files'&&request.action==='list'){
    const search=request.values.search??'',type=request.values.type??'';
    data={...listing,items:listing.items.filter(item=>item.name.includes(search)&&(!type||item.mime_type.startsWith(type+'/')))};
   }
   else if(request.action==='list'||request.action==='__watch')data={items:rows,previous:null,next:null,version:'v1'};
   else if(request.action==='get')data=rows.find(row=>row.id===request.id);
   else if(request.action==='__form')data={fields:[...fields,{name:'revision',label:'Verzió',type:'text',required:true,max:64,options:{}}],values:{...rows.find(row=>row.id===request.id)}};
   else if(request.action==='update')data={};
   else if(request.action==='delete')data=request.values.preview==='1'?{count:1,usages:[{label:'Műsorterv-események',count:2},{label:'Alapértelmezett tartalmak',count:1}]}:{cleared:{'Műsorterv-események':2,'Alapértelmezett tartalmak':1}};
   else if(request.action==='__bulk')data=request.values.items.map(item=>({id:item.id,ok:true,data:item.values.preview==='1'?{count:1,usages:[{label:'Műsorterv-események',count:1}]}:{cleared:{'Műsorterv-események':1}}}));
   return {ok:true,json:async()=>({ok:true,data})};
  };
  fixture.setTheme('skyblue',document.documentElement);
  window.workspace=new fixture.Workspace(document.getElementById('blade-application'),{resource:'assets',title:'Médiatár',selection:true,
   columns:[{id:'file_id',header:'Médiafájl',type:'file',media:'files'},{id:'title',header:'Cím'},{id:'media_type',header:'Típus',media_of:'file_id',part:'type'},{id:'resolution',header:'Felbontás',media_of:'file_id',part:'resolution'},{id:'length',header:'Hossz',media_of:'file_id',part:'duration'}],
   detailFields:[{id:'title',header:'Cím',type:'text'},{id:'file_id',header:'Médiafájl',type:'file',media:'files'}],
   actions:[{name:'get',label:'Adatok',fields:[]},{name:'update',label:'Módosítás',submitLabel:'Mentés',write:true,fields},{name:'delete',label:'Törlés',submitLabel:'Törlés',write:true,bulk:true,usages:true,fields:[{name:'revision',label:'Verzió',type:'text',required:true,max:64,options:{}}]}],
   singleton:false,filters:[],sortable:[],layout:{formMode:'overlay',tree:{cols:[{id:'grid',header:'Találatok'}]}}},'csrf',{transport:'poll',endpoint:'live',interval:60000});
 });
 const gridRow=title=>page.locator('.dhx_grid-row').filter({has:page.getByRole('gridcell',{name:title,exact:true})});
 const at=(title,column)=>gridRow(title).locator(`.dhx_grid-cell[data-dhx-col-id="${column}"]`);
 await expect(gridRow('Videós')).toBeVisible();
 await expect(at('Videós','media_type')).toHaveText('Videó');await expect(at('Videós','resolution')).toHaveText('640 × 360');await expect(at('Videós','length')).toHaveText('0:06');
 await expect(at('Képes','media_type')).toHaveText('Kép');await expect(at('Képes','resolution')).toHaveText('1920 × 1080');await expect(at('Képes','length')).toHaveText('');
 await expect(at('Üres','media_type')).toHaveText('');
 // Details and cards list the derived parts after the media field, although `detailFields` has fields only.
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const details=page.getByRole('dialog',{name:'Rekordadatok',exact:true});
 await expect(details).toContainText('Felbontás');await expect(details).toContainText('640 × 360');
 await details.getByRole('button',{name:'Close',exact:false}).click();
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
 await expect(page.locator('.blade-grid-card').first()).toContainText('Hossz');await expect(page.locator('.blade-grid-card').first()).toContainText('0:06');
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Csempék',{exact:true}).click();
 await expect(page.locator('.blade-grid-tile').filter({hasText:'Képes'}).locator('.blade-grid-tile__meta')).toHaveText('Kép');
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Táblázat',{exact:true}).click();
 // The file field: thumbnail and name, the tiles picker over the folder (accepted classes only), clearing.
 await at('Videós','title').click();await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Médiatár — Módosítás'});await expect(form).toBeVisible();
 const name=form.locator('.blade-file-field__body input').first();
 await expect(name).toHaveValue('clip.webm');await expect(form.locator('.blade-file-field__media .dhx_avatar__preview-icon.dxi-menu-right')).toBeVisible();
 await expect(form.getByRole('button',{name:'Fájl feltöltése…',exact:true})).toHaveCount(0);
 await form.getByRole('button',{name:'Kiválasztás…',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Fájl kiválasztása: Médiafájl'});await expect(picker).toBeVisible();
 await expect(picker.locator('.blade-grid-tile')).toHaveCount(3);await expect(picker).not.toContainText('jegyzet.txt');await expect(picker).not.toContainText('Mappa');
 await expect(picker.locator('.blade-grid-tile').filter({hasText:'clip.webm'}).locator('.blade-grid-tile__meta')).toHaveText('Videó · 640 × 360 · 0:06');
 await picker.locator('[data-dhx-id="type"]').click();await page.getByRole('menuitem',{name:'Videók',exact:true}).click();
 await expect(picker.locator('.blade-grid-tile')).toHaveCount(1);
 expect(await page.evaluate(()=>requests.filter(r=>r.resource==='files'&&r.action==='list').at(-1).values.type)).toBe('video');
 await picker.locator('[data-dhx-id="type"]').click();await page.getByRole('menuitem',{name:'Minden típus',exact:true}).click();
 const find=picker.getByRole('textbox',{name:'Keresés',exact:true});await find.fill('masik');await find.press('Enter');
 await expect(picker.locator('.blade-grid-tile')).toHaveCount(1);
 await picker.locator('.blade-grid-tile').first().dblclick();await expect(picker).toHaveCount(0);
 await expect(name).toHaveValue('masik.jpg');await expect(form.locator('.blade-file-field__media .dhx_avatar__preview-icon.dxi-image-outline')).toBeVisible();
 await form.getByRole('button',{name:'Törlés',exact:true}).click();await expect(name).toHaveValue('');
 await expect(form.getByRole('button',{name:'Törlés',exact:true})).toBeDisabled();
 await form.getByRole('button',{name:'Kiválasztás…',exact:true}).click();await expect(picker).toBeVisible();
 await picker.locator('.blade-grid-tile').filter({hasText:'kep.png'}).click();await picker.getByRole('button',{name:'Kiválasztás',exact:true}).click();
 await expect(name).toHaveValue('kep.png');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();await expect(form).toHaveCount(0);
 const update=await page.evaluate(()=>requests.find(r=>r.action==='update'));
 expect(update.values.file_id).toBe('32');expect(Object.keys(update.values)).not.toContain('file_id__display');
 // Usage-aware delete: one preview, one danger confirmation listing the counts, then the cleared toast.
 await at('Videós','title').click();
 await page.getByRole('button',{name:'Törlés',exact:true}).click();
 const warning=page.getByRole('alertdialog');await expect(warning).toBeVisible();
 await expect(warning).toContainText('Műsorterv-események: 2');await expect(warning).toContainText('Alapértelmezett tartalmak: 1');await expect(warning).toContainText('Törléskor a hivatkozások törlődnek.');
 await expect(warning.getByRole('button',{name:'Mégse',exact:true})).toBeFocused();
 await warning.getByRole('button',{name:'Törlés',exact:true}).click();
 await expect(page.locator('.blade-toast').filter({hasText:'Törölt hivatkozások: Műsorterv-események: 2, Alapértelmezett tartalmak: 1'})).toBeVisible();
 const deletes=await page.evaluate(()=>requests.filter(r=>r.action==='delete').map(r=>r.values.preview??null));
 expect(deletes).toEqual(['1',null]);
 // Bulk: the marks are previewed through `__bulk` and their usages summed.
 await page.getByLabel('Sor jelölése: 1',{exact:true}).filter({visible:true}).check();await page.getByLabel('Sor jelölése: 2',{exact:true}).filter({visible:true}).check();
 await page.getByRole('button',{name:'Törlés',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toContainText('Műsorterv-események: 2');
 await page.getByRole('alertdialog').getByRole('button',{name:'Törlés',exact:true}).click();
 await expect(page.locator('.blade-toast').filter({hasText:'Sikeres: 2, sikertelen: 0.'})).toBeVisible();
 const bulk=await page.evaluate(()=>requests.filter(r=>r.action==='__bulk').map(r=>r.values.items.map(item=>item.values.preview??null)));
 expect(bulk).toEqual([['1','1'],[null,null]]);
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});

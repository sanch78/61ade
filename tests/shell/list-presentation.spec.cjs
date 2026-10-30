const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {signIn,openView}=require('./feature-demo.cjs');
const {root,lazyBundle}=require('./fixture.cjs');
const bundle=lazyBundle('export {Workspace} from "./packages/frontend/src/Workspace"; export {LiveChannel} from "./packages/frontend/src/Realtime"; export {setTheme} from "@dhtmlx/suite";');
async function mount(page,options={},table=true){
 await page.route('**/list-fixture',route=>route.fulfill({contentType:'text/html',body:'<div id="blade-application"></div>'}));
 await page.goto('/list-fixture');await page.setContent('<div id="blade-application"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle()});
 await page.evaluate(options=>{
  const fields=[{id:'title',header:'Cím'},{id:'description',header:'Leírás',type:'textarea'},{id:'active',header:'Aktív',type:'checkbox',options:{0:'Nem',1:'Igen'}}];
  const rows=options.rows??Array.from({length:30},(_,i)=>({id:String(i+1),title:'Synthetic '+i,description:'Long description '+i,active:'1',revision:'r'+i,_actions:['get','archive','note']}));
  window.requests=[];
  window.fetch=async(url,config)=>{
   const request=JSON.parse(config.body);requests.push(request);
   let data;
   if(request.action==='list')data={items:rows,previous:null,next:null,version:'v1'};
   if(request.action==='__watch')data={results:request.values.subscriptions.map(s=>({id:s.id,ok:true,data:{items:rows,previous:null,next:null,version:'v1'}}))};
   if(request.action==='get')data={...rows.find(row=>row.id===request.id),description:'Details <img src=x onerror=alert(1)>'};
   if(request.action==='__form')data={fields:[],values:rows.find(row=>row.id===request.id)};
   if(request.action==='__bulk')data=request.values.items.map(item=>({id:item.id,ok:true}));
   return {ok:true,json:async()=>({ok:true,data})};
  };
  fixture.setTheme('skyblue',document.documentElement);
  window.workspace=new fixture.Workspace(document.getElementById('blade-application'),{id:'items',resource:'items',title:'Elemek',columns:[fields[0]],detailFields:fields,actions:[{name:'get',label:'Adatok',fields:[]},{name:'archive',label:'Archiválás',submitLabel:'Végrehajtás',write:true,bulk:true,fields:[]},{name:'note',label:'Megjegyzés',submitLabel:'Mentés',write:true,fields:[]}],singleton:false,filters:[],sortable:[],layout:{formMode:'overlay',tree:{cols:[{id:'grid',header:'Találatok'}]}},selection:true,...options},new fixture.LiveChannel({transport:'poll',endpoint:'live',interval:60000}));
 },options);
 if(!table)return;
 await expect(page.locator('.dhx_grid')).toBeVisible();
 expect(await page.locator('.dhx_grid-content').evaluate(element=>getComputedStyle(element).borderLeftWidth)).toBe('0px');
}
test('cards use multiple columns; details include fields outside the grid; marks survive mode changes and support bulk',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1400,height:900});await mount(page);
 await expect(page.locator('[data-dhx-col-id="_number"]').first()).toBeVisible();
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Details <img');await expect(dialog.locator('img')).toHaveCount(0);
 await expect(dialog).toContainText('Aktív');await dialog.getByRole('button',{name:'Close',exact:false}).click();
 await page.getByLabel('Sor jelölése: 1',{exact:true}).filter({visible:true}).check();await page.getByLabel('Sor jelölése: 2',{exact:true}).filter({visible:true}).check();
 await expect(page.getByRole('button',{name:'Archiválás',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Archiválás — jelöltek',exact:true})).toHaveCount(0);
 // Several marks leave only bulk-capable commands; one mark restores the single-record ones.
 const note=page.getByRole('button',{name:'Megjegyzés',exact:true}),details=page.getByRole('button',{name:'Adatok',exact:true});
 await expect(note).toBeDisabled();await expect(details).toBeDisabled();
 await page.getByLabel('Sor jelölése: 2',{exact:true}).filter({visible:true}).uncheck();
 await expect(note).toBeEnabled();await expect(details).toBeEnabled();
 await page.getByLabel('Sor jelölése: 2',{exact:true}).filter({visible:true}).check();await expect(note).toBeDisabled();
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
 const cards=page.locator('.blade-grid-card');await expect(cards.first()).toContainText('Long description');
 await expect.poll(async()=>Math.abs((await cards.nth(0).boundingBox()).y-(await cards.nth(1).boundingBox()).y)).toBeLessThan(2);
 const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();
 expect(Math.abs(first.y-second.y)).toBeLessThan(2);expect(second.x).toBeGreaterThan(first.x+300);
 await expect(page.getByLabel('Sor jelölése: 1',{exact:true}).filter({visible:true})).toBeChecked();
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>cards.evaluateAll(elements=>elements.length>1?elements[1].getBoundingClientRect().y-elements[0].getBoundingClientRect().y:0)).toBeGreaterThan(0);
 await page.setViewportSize({width:1400,height:900});
 const requestCount=await page.evaluate(()=>requests.length);
 await page.getByRole('button',{name:'Archiválás',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText('Sikeres: 2, sikertelen: 0.',{exact:true})).toBeVisible();
 expect(await page.evaluate(count=>requests.slice(count).map(request=>request.action),requestCount)).not.toContain('__form');
 expect(await page.evaluate(()=>requests.find(request=>request.action==='__bulk').values.items.map(item=>item.id))).toEqual(['1','2']);
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});
test('toolbar stays inside its cell and above scrolling grid/cards in all themes; numbering can be disabled',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await mount(page,{rowNumbers:false});
 await expect(page.locator('[data-dhx-col-id="_number"]')).toHaveCount(0);
 for(const theme of ['skyblue','light','dark']){
  await page.evaluate(theme=>fixture.setTheme(theme,document.documentElement),theme);
  const bounds=await page.locator('.blade-command-row').evaluate(cell=>{
   const outer=cell.getBoundingClientRect(),toolbar=cell.querySelector('.dhx_toolbar').getBoundingClientRect();
   return {outer:{top:outer.top,bottom:outer.bottom},toolbar:{top:toolbar.top,bottom:toolbar.bottom},buttons:[...cell.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {top:r.top,bottom:r.bottom};})};
  });
  expect(bounds.toolbar.bottom).toBeLessThanOrEqual(bounds.outer.bottom);for(const button of bounds.buttons){expect(button.top).toBeGreaterThanOrEqual(bounds.outer.top);expect(button.bottom).toBeLessThanOrEqual(bounds.outer.bottom);}
  expect(await page.locator('.blade-command-row').evaluate(element=>getComputedStyle(element).boxShadow)).toBe('none');
  expect(await page.locator('.blade-command-row').evaluate(element=>getComputedStyle(element).borderBottomWidth)).toBe('1px');
  expect(await page.locator('.dhx_grid-header').first().evaluate(element=>getComputedStyle(element).boxShadow)).not.toBe('none');
  await page.locator('.dhx_grid').hover();await page.mouse.wheel(0,500);
  await expect.poll(()=>page.evaluate(()=>workspace.grid.table.getScrollState().y)).toBeGreaterThan(0);
  const button=page.getByRole('button',{name:'Adatok',exact:true});await expect(button).toBeVisible();
  await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR,'table-header-shadow-'+theme+'.png')});
  await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
  await expect(page.locator('.blade-grid-cards')).toBeVisible();
  expect(await page.locator('.blade-command-row').evaluate(element=>getComputedStyle(element).boxShadow)).not.toBe('none');
  await page.locator('.blade-grid-cards').evaluate(element=>element.scrollTop=500);
  await expect.poll(()=>page.locator('.blade-grid-cards').evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  const hit=await button.evaluate(element=>{const box=element.getBoundingClientRect();return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));});expect(hit).toBe(true);
  await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Táblázat',{exact:true}).click();
 }
 await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR,'list-presentation.png')});await page.evaluate(()=>workspace.destroy());
});

test('view dropdown is last; editable headings reserve space for the hover sort icon',async({page})=>{
 await mount(page,{columns:[{id:'title',header:'Szerkeszthető mező',editable:true,width:260}],sortable:['title']});
 const toolbar=page.locator('.blade-command-row');
 await expect(toolbar.getByRole('button',{name:'Oszlopok',exact:true})).toHaveCount(0);
 await expect(toolbar.getByRole('button').last()).toHaveText('Nézet: Táblázat');
 await expect(page.getByText('Kártyák',{exact:true})).toHaveCount(0);
 const header=page.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Szerkeszthető mező'}).first();
 await header.hover();
 const spacing=await header.locator('.dhx_grid-header-cell-text').evaluate(element=>({padding:parseFloat(getComputedStyle(element).paddingRight),labelWidth:getComputedStyle(element.querySelector('.dhx_grid-header-cell-text_content')).width,width:element.clientWidth}));
 expect(spacing.padding).toBe(24);expect(parseFloat(spacing.labelWidth)).toBeLessThan(spacing.width-24);
 await header.screenshot({path:path.join(process.env.BLADE_TMP_DIR,'header-editable-hover.png')});
 await header.click();await expect(header).toHaveAttribute('aria-sort','ascending');
 await expect(header.locator('.dhx_grid-sort-icon')).toBeHidden();
 await header.screenshot({path:path.join(process.env.BLADE_TMP_DIR,'header-editable-sorted.png')});
 await toolbar.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
 await expect(toolbar.getByRole('button').last()).toHaveText('Nézet: Kártyák');
 await page.evaluate(()=>workspace.destroy());
});

test('columns dropdown appears only when a secondary column is configured',async({page})=>{
 await mount(page,{columns:[{id:'title',header:'Cím',secondary:true}]});
 const columns=page.getByRole('button',{name:'Oszlopok',exact:true});
 await expect(columns).toBeVisible();
 await columns.click();
 await expect(page.getByRole('menuitemcheckbox',{name:'Cím',exact:true})).toBeVisible();
 await page.evaluate(()=>workspace.destroy());
});


test('view switching keeps the natural top inset and does not transfer row pixels to cards',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1400,height:900});await mount(page);
 const switchTo=async(cards)=>{await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText(cards?'Kártyák':'Táblázat',{exact:true}).click();await expect(page.locator(cards?'.blade-grid-cards':'.dhx_grid')).toBeVisible();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 for(let i=0;i<2;i++){
  await switchTo(true);
  await expect.poll(()=>page.locator('.blade-grid-cards').evaluate(element=>element.scrollTop)).toBe(0);
  expect(await page.locator('.blade-grid-cards').evaluate(root=>root.querySelector('.blade-grid-card').getBoundingClientRect().top-root.getBoundingClientRect().top)).toBeGreaterThan(0);
  await switchTo(false);
  await expect.poll(()=>page.evaluate(()=>workspace.grid.table.getScrollState().y)).toBe(0);
 }
 await page.evaluate(()=>workspace.grid.table.scroll(0,85));
 await expect.poll(()=>page.evaluate(()=>workspace.grid.capture().id)).toBe('3');
 await switchTo(true);
 await expect.poll(()=>page.evaluate(()=>workspace.grid.capture().id)).toBe('1');
 // The first card row contains records 1–3, so record 3 remains fully visible.
 const card=page.locator('[data-blade-row="3"]');await expect(card).toBeInViewport();
 expect(await card.evaluate(element=>element.getBoundingClientRect().top-element.closest('.blade-grid-cards').getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});

for(const theme of ['skyblue','light','dark'])test(`compact commands retain ACL state, nested sorting and desktop restoration (${theme})`,async({page})=>{
 test.setTimeout(60000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1400,height:900});await mount(page,{sortable:['id','title']});
 await page.evaluate(theme=>fixture.setTheme(theme,document.documentElement),theme);
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.blade-grid-card').first()).toBeVisible();
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});await expect(menu).toBeVisible();
 const box=await menu.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
 await menu.click();await expect(page.getByRole('menuitem',{name:'Adatok',exact:true})).toHaveAttribute('aria-disabled','true');
 await menu.click();await expect(page.getByRole('menuitem',{name:'Adatok',exact:true})).toHaveCount(0);await page.locator('.blade-grid-card').first().click();
 {
  await menu.click();await expect(page.getByRole('menuitem',{name:'Adatok',exact:true})).not.toHaveAttribute('aria-disabled','true');await page.getByRole('menuitem',{name:'Adatok',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await expect.poll(()=>dialog.locator('.dhx_window-header').evaluate(element=>element.getBoundingClientRect().height)).toBe(40);
  const close=dialog.getByRole('button',{name:/close/i});
  expect(await close.evaluate(button=>{const outer=button.closest('.dhx_window-header').getBoundingClientRect(),box=button.getBoundingClientRect();return box.top>=outer.top&&box.bottom<=outer.bottom;})).toBe(true);
  await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR,`mobile-compact-popup-${theme}.png`),animations:'disabled'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await close.click();await expect(dialog).toHaveCount(0);
 }
 await menu.click();await page.getByRole('menuitem',{name:/^Rendezés:/}).click();await page.getByRole('menuitem',{name:'Cím ↑',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>requests.some(request=>request.action==='list'&&request.values.sort?.field==='title'&&request.values.sort.direction==='asc')),{timeout:15000}).toBe(true);
 await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR,'mobile-compact-toolbar.png')});
 await page.setViewportSize({width:1400,height:900});await expect(menu).toHaveCount(0);await expect(page.getByRole('button',{name:'Archiválás',exact:true})).toBeEnabled();await expect(page.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Cím'}).first()).toHaveClass(/blade-grid-sort-asc/);await page.getByRole('button',{name:'Nézet: Táblázat',exact:true}).click();await page.getByText('Kártyák',{exact:true}).click();await expect(page.getByRole('button',{name:'Rendezés: Cím ↑',exact:true})).toBeVisible();
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});

test('media views offer tiles, persist the mode, keep mobile forcing and search the server window',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route(/thumbnail_get/,route=>route.fulfill({status:404,contentType:'application/json',body:'{"ok":false}'}));
 await page.setViewportSize({width:1280,height:900});
 const options={columns:[{id:'thumb',header:'Előnézet',type:'select',media:'files'},{id:'title',header:'Cím'}],search:{fields:['title']},rowHeight:56,tileMinWidth:160};
 await mount(page,options);
 const toolbar=page.locator('.blade-command-row');
 await expect(toolbar.getByRole('button').last()).toHaveText('Nézet: Táblázat');
 await toolbar.getByRole('button',{name:/^Nézet:/}).click();
 await expect(page.getByText('Csempék',{exact:true})).toBeVisible();await page.getByText('Csempék',{exact:true}).click();
 await expect(page.locator('.blade-grid-tile').first()).toBeVisible();await expect(toolbar.getByRole('button').last()).toHaveText('Nézet: Csempék');
 expect(await page.evaluate(()=>workspace.grid.mode)).toBe('tiles');
 // Stored per user/resource/path: a new workspace restores tiles.
 await page.evaluate(()=>workspace.destroy());
 await mount(page,options,false);
 await expect(page.locator('.blade-grid-tile').first()).toBeVisible();
 // Mobile keeps tiles; the selector stays usable, the table item is disabled.
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.blade-grid-tile').first()).toBeVisible();
 expect(await page.evaluate(()=>workspace.grid.mode)).toBe('tiles');
 await page.getByRole('button',{name:'Műveletek',exact:true}).click();await page.getByRole('menuitem',{name:/^Nézet:/}).click();
 await expect(page.getByRole('menuitem',{name:'Táblázat',exact:true})).toHaveAttribute('aria-disabled','true');
 await page.getByRole('menuitem',{name:'Kártyák',exact:true}).click();
 await expect(page.locator('.blade-grid-card').first()).toBeVisible();await expect(page.locator('.blade-grid-card__media')).toHaveCount(0);
 await page.setViewportSize({width:1280,height:900});await expect(page.locator('.blade-grid-card').first()).toBeVisible();
 await toolbar.getByRole('button',{name:/^Nézet:/}).click();await page.getByRole('menuitem',{name:'Táblázat',exact:true}).click();
 await expect(page.locator('.dhx_grid')).toBeVisible();
 expect(await page.locator('.dhx_grid-row').first().evaluate(row=>Math.round(row.getBoundingClientRect().height))).toBe(56);
 // Search: debounced typing, Enter immediately, Escape clears and removes the parameter.
 const search=page.getByRole('textbox',{name:'Keresés',exact:true});await expect(search).toBeVisible();
 const lists=()=>page.evaluate(()=>requests.filter(request=>request.action==='list').map(request=>request.values.search??null));
 const before=(await lists()).length;
 await search.pressSequentially('min',{delay:30});
 await expect.poll(async()=>(await lists()).slice(before)).toEqual(['min']);
 await search.fill('minta');await search.press('Enter');
 await expect.poll(async()=>(await lists()).slice(before)).toEqual(['min','minta']);
 await page.waitForTimeout(450);expect((await lists()).slice(before)).toEqual(['min','minta']);
 // The live subscription observes the same searched window.
 expect(await page.evaluate(()=>workspace.live.query.search)).toBe('minta');
 await search.press('Escape');
 await expect.poll(async()=>(await lists()).slice(before)).toEqual(['min','minta',null]);await expect(search).toHaveValue('');
 expect(await page.evaluate(()=>Object.hasOwn(workspace.live.query,'search'))).toBe(false);
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});

// Static image column (presentation image): a file name of the application below `image_base`.
const imageRows=['ok.svg','missing.png','../secret.png','https://example.test/a.png','photo.exe','dir/ok.svg'].map((image,i)=>({id:String(i+1),image,title:'Kép '+(i+1),description:'Leírás',revision:'r'+i,_actions:['get']}));
const imageColumns=[{id:'image',header:'Kép',type:'text',presentation:'image',image_base:'/static-img/',alt_of:'title'},{id:'title',header:'Cím'},{id:'description',header:'Leírás'}];
async function imageRoutes(page){
 const loaded=[];
 await page.route('**/static-img/**',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();loaded.push(name);
  return name==='ok.svg'?route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80"><rect width="160" height="80" fill="#3b82c4"/></svg>'}):route.fulfill({status:404,body:''});});
 return loaded;
}
for(const theme of ['skyblue','light','dark'])test(`static image column shows images in table, cards, tiles and details; bad values show none (${theme})`,async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const loaded=await imageRoutes(page);
 await page.setViewportSize({width:1280,height:900});
 await mount(page,{columns:imageColumns,rows:imageRows,rowHeight:56,tileMinWidth:160,detailFields:imageColumns});
 await page.evaluate(theme=>fixture.setTheme(theme,document.documentElement),theme);
 const toolbar=page.locator('.blade-command-row');
 // Table cell: only the two plain file names are requested; the missing file falls back to the placeholder.
 await expect(page.locator('.dhx_grid .blade-media--image.blade-media--failed')).toHaveCount(1);
 await expect(page.locator('.dhx_grid img[data-blade-static-image]')).toHaveCount(1);
 expect(await page.locator('.dhx_grid img[data-blade-static-image]').first().getAttribute('alt')).toBe('');
 await expect(page.locator('.dhx_grid .blade-media--image[role="img"]').first()).toHaveAttribute('aria-label','Kép 1');
 expect(loaded.every(name=>['ok.svg','missing.png'].includes(name))).toBe(true);
 const before=loaded.filter(name=>name==='missing.png').length;
 // Tiles are offered by default; images keep their ratio inside a square slot.
 await toolbar.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Csempék',{exact:true}).click();
 const tile=page.locator('.blade-grid-tile').first();await expect(tile).toBeVisible();
 await expect(tile.locator('img[data-blade-static-image]')).toBeVisible();
 expect(await tile.locator('img').evaluate(image=>getComputedStyle(image).objectFit)).toBe('contain');
 const box=await tile.locator('.blade-media').boundingBox();expect(Math.abs(box.width-box.height)).toBeLessThan(2);
 expect(await page.locator('.blade-grid-tile img[data-blade-static-image]').count()).toBeLessThanOrEqual(2);
 await expect(page.locator('.blade-grid-tile__title').first()).toHaveText('Kép 1');
 await toolbar.getByRole('button',{name:/^Nézet:/}).click();await page.getByRole('menuitem',{name:'Kártyák',exact:true}).click();
 await expect(page.locator('.blade-grid-card .blade-grid-card__media img[data-blade-static-image]').first()).toBeVisible();
 await expect(page.locator('.blade-grid-card').nth(2).locator('img')).toHaveCount(0);
 await toolbar.getByRole('button',{name:/^Nézet:/}).click();await page.getByRole('menuitem',{name:'Táblázat',exact:true}).click();
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const dialog=page.getByRole('dialog');await expect(dialog.locator('img[data-blade-static-image]')).toHaveCount(1);
 expect(loaded.filter(name=>name==='missing.png').length).toBe(before);
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});
test('static image tiles per row match media tiles on a mobile width; no image option leaves lists unchanged',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await imageRoutes(page);
 await page.route(/thumbnail_get/,route=>route.fulfill({status:404,contentType:'application/json',body:'{"ok":false}'}));
 await page.setViewportSize({width:390,height:844});
 const perRow=()=>page.locator('.blade-grid-tile').evaluateAll(tiles=>tiles.filter(tile=>Math.abs(tile.getBoundingClientRect().top-tiles[0].getBoundingClientRect().top)<2).length);
 const mediaRows=imageRows.map(row=>({...row,thumb:'1'}));
 await mount(page,{columns:[{id:'thumb',header:'Kép',type:'select',media:'files'},{id:'title',header:'Cím'}],rows:mediaRows,tileMinWidth:160},false);
 await page.getByRole('button',{name:'Műveletek',exact:true}).click();await page.getByRole('menuitem',{name:/^Nézet:/}).click();await page.getByText('Csempék',{exact:true}).click();
 await expect(page.locator('.blade-grid-tile').first()).toBeVisible();const media=await perRow();
 await page.evaluate(()=>workspace.destroy());
 await mount(page,{columns:imageColumns,rows:imageRows,tileMinWidth:160},false);
 await expect(page.locator('.blade-grid-tile').first()).toBeVisible();expect(await perRow()).toBe(media);
 await page.evaluate(()=>workspace.destroy());
 await mount(page,{columns:[{id:'title',header:'Cím'}],rows:imageRows},false);
 await expect(page.locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();await expect(page.locator('img[data-blade-static-image]')).toHaveCount(0);
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});

test('feature demo catalog: static images in table, tiles and details; missing file placeholder; invalid values show no image',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1400,height:900});await signIn(page);await openView(page,'Katalógus');
 const images=page.locator('.dhx_grid img[data-blade-static-image]');
 await expect(images).toHaveCount(4);
 const sources=await images.evaluateAll(list=>list.map(image=>image.getAttribute('src')).sort());
 expect(sources).toEqual(expect.arrayContaining(['../demo-images/circle.svg','../demo-images/square.svg','../demo-images/triangle.svg','../demo-images/wide.svg']));
 expect(sources.every(src=>/^\.\.\/demo-images\/[A-Za-z0-9_.-]+\.(svg|png)$/.test(src))).toBe(true);
 await expect.poll(()=>page.locator('.dhx_grid .blade-media--failed').count()).toBe(1);
 expect(await images.first().evaluate(image=>image.naturalWidth>0)).toBe(true);
 await page.locator('.blade-command-row').getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Csempék',{exact:true}).click();
 await expect(page.locator('.blade-grid-tile').first()).toBeVisible();
 await expect(page.locator('.blade-grid-tile img[data-blade-static-image]').first()).toBeVisible();
 await page.locator('.blade-command-row').getByRole('button',{name:/^Nézet:/}).click();await page.getByRole('menuitem',{name:'Táblázat',exact:true}).click();
 const detail=page.getByRole('dialog',{name:'Rekordadatok',exact:true});
 // The first row (newest) holds an invalid extension: no image. A plain file name shows its image.
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 await expect(detail).toContainText('Kiterjesztés');await expect(detail.locator('img')).toHaveCount(0);
 await detail.getByRole('button',{name:/close/i}).click();
 await page.locator('.dhx_grid-row').filter({hasText:'Háromszög'}).locator('[data-dhx-col-id="_number"]').dblclick();
 await expect(detail.locator('img[data-blade-static-image]')).toHaveCount(1);
 expect(errors).toEqual([]);
});

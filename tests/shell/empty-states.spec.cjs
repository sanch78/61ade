const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu}=require('./feature-demo.cjs');
// Loading and empty states (docs/toolkit.md#loading-and-empty-states, FB-0185): a region, tab or section of a
// PageLayout without content shows its placeholder (the default text, its own text or, while busy, the loading
// indicator) until content is mounted, and again after the content is destroyed; a ListView shows the indicator with
// `aria-busy` while it loads and says when it has no records or no record matches, in table and cards, with
// `panel: false` and in a window; nothing there is a blank surface with a centred picture above the text; RecordDetails
// and RecordForm show the indicator until their data has arrived. A fixture module hands `app` to the page; the key browser (D8) shows the states on a
// demo page.
const MODULE='/empty-states-fixture.mjs';
async function start(page){
 await page.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',body:'export default app=>{window.__bladeApp=app;};'}));
 await page.route(url=>url.pathname==='/'&&!url.searchParams.has('blade'),async route=>{
  const request=route.request();
  if(request.method()!=='GET'||request.resourceType()!=='document')return route.fallback();
  const response=await route.fetch();
  const body=(await response.text()).replace(/(<script type="application\/json" id="blade-config">)([\s\S]*?)(<\/script>)/,(all,open,json,close)=>{
   const config=JSON.parse(json);if(!config.authenticated)return all;
   config.modules=[...(config.modules??[]),MODULE];
   return open+JSON.stringify(config).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')+close;
  });
  await route.fulfill({response,body});
 });
 await page.setViewportSize({width:1366,height:900});await signIn(page);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}
/** Holds the $action requests of $resource while `hold.on` (released by `hold.release()`), or answers them with 500. */
async function gate(page,resource,action='list'){
 const state={on:false,fail:false,waiting:[]};
 await page.route(url=>url.searchParams.has('blade'),async route=>{
  let body;try{body=route.request().postDataJSON();}catch{}
  if(body?.resource!==resource||body?.action!==action)return route.fallback();
  if(state.fail){state.fail=false;return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Szintetikus hiba.'})});}
  if(state.on)await new Promise(resolve=>state.waiting.push(resolve));
  return route.fallback();
 });
 return {...state,hold(){state.on=true;},release(){state.on=false;for(const resolve of state.waiting.splice(0))resolve();},failNext(){state.fail=true;}};
}
const shown=scope=>scope.locator('.blade-status:not(.blade-status--idle)');
const busy=scope=>scope.locator('.blade-status--busy');

test('a region, tab or section without content shows its placeholder; content replaces it, destroying it brings it back',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await start(page);
 await page.evaluate(()=>{
  const app=window.__bladeApp,box=document.createElement('div');
  box.id='states-fixture';Object.assign(box.style,{position:'fixed',left:'16px',top:'110px',width:'1200px',height:'600px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
  document.body.append(box);
  window.__page=new app.components.PageLayout({id:'states.fixture',tree:{cols:[{id:'side',header:'Oldal',width:280,collapsable:true},{tabs:[{id:'values',header:'Értékek'},{id:'other',header:'Más'}]},{width:300,accordion:[{id:'one',header:'Egy'},{id:'two',header:'Kettő'}]}]}});
  window.__page.mount(box);
 });
 const fixture=page.locator('#states-fixture'),side=fixture.locator('[data-cell-id="side"]'),values=fixture.getByRole('tabpanel',{name:'Értékek',exact:true});
 const section=fixture.locator('[data-cell-id$="-one"]');
 // The default text in every empty region, tab and open section, as a polite status (no error).
 for(const region of [side,values,section]){await expect(shown(region)).toHaveText('Nincs megjeleníthető tartalom.');await expect(shown(region)).toHaveAttribute('role','status');}
 // A blank surface over the whole region with the empty picture centred above the text.
 await expect(shown(values)).toHaveClass(/blade-status--empty/);
 await expect(shown(values).locator('.blade-status__icon .bi-inbox')).toBeVisible();
 const [area,picture,words]=[await values.boundingBox(),await shown(values).locator('.blade-status__icon').boundingBox(),await shown(values).locator('.blade-status__text').boundingBox()];
 expect(Math.abs(picture.x+picture.width/2-(area.x+area.width/2))).toBeLessThanOrEqual(2);
 expect(Math.abs(picture.y+picture.height/2-(area.y+area.height/2))).toBeLessThanOrEqual(60);
 expect(words.y).toBeGreaterThan(picture.y+picture.height-1);
 expect(await shown(values).evaluate(node=>getComputedStyle(node).backgroundColor)).not.toBe(await values.evaluate(node=>getComputedStyle(node).backgroundColor));
 // The region's own text; wrong options are refused before anything changes.
 await page.evaluate(()=>window.__page.placeholder('side',{text:'Válassz egy elemet a bal oldalon.'}));
 await expect(shown(side)).toHaveText('Válassz egy elemet a bal oldalon.');
 expect(await page.evaluate(()=>[()=>window.__page.placeholder('side',{text:''}),()=>window.__page.placeholder('side',{busy:'yes'}),()=>window.__page.placeholder('side',{label:'x'}),()=>window.__page.placeholder('nope',{})]
  .map(call=>{try{call();return 'none';}catch(error){return error.constructor.name;}}))).toEqual(['TypeError','TypeError','TypeError','Error']);
 // Busy: the text waits at once, the indicator only after the short delay, then content ends it.
 const early=await page.evaluate(()=>{window.__page.placeholder('values',{busy:true});const status=window.__page.cell('values').getCellView().el.querySelector('.blade-status');return status.className;});
 expect(early).toBe('blade-status blade-status--idle');
 await expect(busy(values)).toBeVisible();
 await expect(busy(values)).toHaveAttribute('role','status');
 await page.evaluate(()=>{
  const app=window.__bladeApp;
  window.__details=new app.components.RecordDetails({view:'demo_registry_nodes',record:{id:1,name:'Részlet',parent_id:''}});window.__details.mount(window.__page.cell('values'));
  window.__side=new app.components.RecordDetails({view:'demo_registry_nodes',record:{id:2,name:'Oldalsó',parent_id:''}});window.__side.mount(window.__page.cell('side'));
  const element=document.createElement('p');element.textContent='Saját elem';window.__page.attach('one',element);
 });
 await expect(values).toContainText('Részlet');await expect(side).toContainText('Oldalsó');await expect(section).toContainText('Saját elem');
 for(const region of [side,values,section])await expect(shown(region)).toHaveCount(0);
 await expect(fixture.locator('[aria-busy="true"]')).toHaveCount(0);
 // Busy on a region that holds content is ignored.
 await page.evaluate(()=>window.__page.placeholder('values',{busy:true}));
 await page.waitForTimeout(500);
 await expect(busy(values)).toHaveCount(0);
 // A RecordDetails loading a record id and a RecordForm loading its fields show the indicator until their data arrives.
 await page.evaluate(()=>{window.__details.destroy();window.__side.destroy();});
 const get=await gate(page,'demo_registry_keys','get'),form=await gate(page,'demo_tasks','__form');
 const id=await page.evaluate(async()=>String((await window.__bladeApp.server.call('demo_registry_keys','list',{values:{mode:'dynamic',limit:1}})).items[0].id));
 get.hold();form.hold();
 await page.evaluate(id=>{const C=window.__bladeApp.components;window.__details=new C.RecordDetails({view:'demo_registry_nodes',record:id});window.__details.mount(window.__page.cell('values'));
  window.__side=new C.RecordForm({resource:'demo_tasks',action:'create'});window.__side.mount(window.__page.cell('side'));},id);
 await expect(busy(values)).toBeVisible();await expect(busy(side)).toBeVisible();
 get.release();form.release();
 await expect(busy(values)).toHaveCount(0);await expect(busy(side)).toHaveCount(0);
 await expect(side.locator('.dhx_form').first()).toBeVisible();
 await expect(shown(values)).toHaveCount(0);
 // Destroying the content brings the placeholder back: the region keeps its own text, busy ended with the content.
 await page.evaluate(()=>{window.__details.destroy();window.__side.destroy();});
 await expect(shown(values)).toHaveText('Nincs megjeleníthető tartalom.');
 await expect(shown(side)).toHaveText('Válassz egy elemet a bal oldalon.');
 await page.evaluate(()=>window.__page.placeholder('side',{text:null}));
 await expect(shown(side)).toHaveText('Nincs megjeleníthető tartalom.');
 // A collapsed region shows only its header; expanding it (Suite draws its content anew) shows the placeholder again.
 await page.evaluate(()=>window.__page.collapse('side'));
 await expect(shown(side)).toHaveCount(0);
 await page.evaluate(()=>window.__page.expand('side'));
 await expect(shown(side)).toHaveText('Nincs megjeleníthető tartalom.');
 await page.evaluate(()=>{window.__page.destroy();document.getElementById('states-fixture').remove();});
 expect(failures).toEqual([]);
});

test('busy(id, on) marks a filled region until it is cleared; content replaced meanwhile keeps the mark',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await start(page);
 await page.evaluate(()=>{
  const app=window.__bladeApp,box=document.createElement('div');
  box.id='held-fixture';Object.assign(box.style,{position:'fixed',left:'16px',top:'110px',width:'1200px',height:'600px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
  document.body.append(box);
  window.__page=new app.components.PageLayout({id:'states.held',tree:{cols:[{id:'side',header:'Oldal',width:320},{id:'split',inner:{rows:[{id:'top',header:'Felső'},{id:'bottom'}]}},{tabs:[{id:'values',header:'Értékek'},{id:'other',header:'Más'}]}]}});
  window.__page.mount(box);
  // A scrolled area with a focused button in the side region; a details view in the inner and the tab region.
  const scroller=document.createElement('div');Object.assign(scroller.style,{height:'100%',overflow:'auto'});
  scroller.innerHTML='<button type="button" id="held-button">Gomb</button><div style="height:2000px">Hosszú tartalom</div>';
  window.__page.attach('side',scroller);window.__scroller=scroller;
  window.__top=new app.components.RecordDetails({view:'demo_registry_nodes',record:{id:1,name:'Felső részlet',parent_id:''}});window.__top.mount(window.__page.cell('top'));
  window.__tab=new app.components.RecordDetails({view:'demo_registry_nodes',record:{id:2,name:'Fül részlet',parent_id:''}});window.__tab.mount(window.__page.cell('values'));
  const element=document.createElement('p');element.textContent='Jelöletlen';window.__page.attach('bottom',element);
 });
 // The region's own status (not a component's inside it) and the state of its content.
 const state=id=>page.evaluate(id=>{
  const root=window.__page.cell(id).getCellView().el,status=root.querySelector(':scope > .dhx_layout-cell-content > .blade-status, :scope > .blade-status');
  const content=Array.from(status.parentElement.children).find(child=>child!==status);
  return {busy:status.classList.contains('blade-status--busy'),idle:status.classList.contains('blade-status--idle'),text:status.textContent,role:status.getAttribute('role'),ariaBusy:content?.getAttribute('aria-busy')??null};
 },id);
 const fixture=page.locator('#held-fixture'),side=fixture.locator('[data-cell-id="side"]');
 await expect(side).toContainText('Hosszú tartalom');await expect(fixture).toContainText('Felső részlet');await expect(fixture).toContainText('Fül részlet');
 for(const id of ['side','top','values','bottom'])expect(await state(id)).toMatchObject({busy:false,idle:true,ariaBusy:null});
 // Wrong calls are refused: an undeclared id, a region holding an inner layout, a value other than a boolean.
 expect(await page.evaluate(()=>[()=>window.__page.busy('nope',true),()=>window.__page.busy('split',true),()=>window.__page.busy('side','yes'),()=>window.__page.busy('side'),()=>window.__page.tabsOf('values').busy('values',1)]
  .map(call=>{try{call();return 'none';}catch(error){return error.constructor.name;}}))).toEqual(['Error','Error','TypeError','TypeError','TypeError']);
 // A mark cleared within the delay never shows the indicator.
 await page.evaluate(()=>window.__page.busy('side',true));
 expect(await state('side')).toMatchObject({idle:true,busy:false,ariaBusy:'true'});
 await page.waitForTimeout(100);
 await page.evaluate(()=>window.__page.busy('side',false));
 await page.waitForTimeout(400);
 expect(await state('side')).toMatchObject({idle:true,busy:false,ariaBusy:null});
 // Marked: aria-busy at once, the indicator after the delay, its text once; the content stays mounted and scrolled.
 await page.evaluate(()=>{document.getElementById('held-button').focus({preventScroll:true});window.__scroller.scrollTop=150;if(window.__scroller.scrollTop!==150)throw new Error('not scrollable');for(const id of ['side','top','values'])window.__page.busy(id,true);});
 expect(await state('side')).toMatchObject({idle:true,busy:false,ariaBusy:'true'});
 await expect.poll(()=>state('side')).toMatchObject({busy:true,text:'A tartalom frissül…',role:'status',ariaBusy:'true'});
 for(const id of ['top','values'])await expect.poll(()=>state(id)).toMatchObject({busy:true,text:'A tartalom frissül…',ariaBusy:'true'});
 expect(await state('bottom')).toMatchObject({busy:false,idle:true,ariaBusy:null});
 await expect(side).toContainText('Hosszú tartalom');
 expect(await page.evaluate(()=>[window.__scroller.scrollTop,document.activeElement?.id])).toEqual([150,'held-button']);
 // The covered content takes no clicks or wheel scrolling; the region's header and the inner region's header stay uncovered.
 const hit=(selector)=>page.evaluate(selector=>{const box=document.querySelector(selector).getBoundingClientRect(),node=document.elementFromPoint(box.x+box.width/2,box.y+Math.min(box.height/2,40));return node?.closest('.blade-status')?'status':node?.closest('.blade-inner-header, .dhx_layout-cell-header')?'header':'content';},selector);
 expect(await hit('#held-fixture [data-cell-id="side"] > .dhx_layout-cell-content')).toBe('status');
 expect(await hit('#held-fixture [data-cell-id="side"] > .dhx_layout-cell-header')).toBe('header');
 expect(await hit('#held-fixture .blade-inner-header')).toBe('header');
 await expect(fixture.locator('.blade-inner-header')).toContainText('Felső');
 const content=await side.locator('.dhx_layout-cell-content').boundingBox();
 await page.mouse.move(content.x+content.width/2,content.y+content.height/2);await page.mouse.wheel(0,400);await page.waitForTimeout(200);
 expect(await page.evaluate(()=>window.__scroller.scrollTop)).toBe(150);
 // Replacing the content keeps the mark, also while the new component shows its own loading and after it has loaded.
 const get=await gate(page,'demo_registry_keys','get');
 const id=await page.evaluate(async()=>String((await window.__bladeApp.server.call('demo_registry_keys','list',{values:{mode:'dynamic',limit:1}})).items[0].id));
 get.hold();
 await page.evaluate(id=>{window.__top.destroy();window.__top=new window.__bladeApp.components.RecordDetails({view:'demo_registry_nodes',record:id});window.__top.mount(window.__page.cell('top'));
  window.__tab.destroy();window.__tab=new window.__bladeApp.components.ListView({view:'demo_registry_browser_values',scope:{field:'key_id',id},panel:false,mode:'table'});window.__tab.mount(window.__page.cell('values'));},id);
 const grid=fixture.getByRole('tabpanel',{name:'Értékek',exact:true}).locator('.dhx_grid-header');
 await expect(grid).toBeVisible();
 await page.waitForTimeout(400);
 // The region's indicator lies over the list as well, its header included.
 expect(await hit('#held-fixture [role="tabpanel"] .dhx_grid-header')).toBe('status');
 for(const id of ['top','values'])expect(await state(id)).toMatchObject({busy:true,text:'A tartalom frissül…',ariaBusy:'true'});
 get.release();
 await page.waitForTimeout(400);
 for(const id of ['top','values'])expect(await state(id)).toMatchObject({busy:true,ariaBusy:'true'});
 // Clearing ends it: no indicator, no aria-busy, the content takes clicks again.
 await page.evaluate(()=>{for(const id of ['side','top','values'])window.__page.busy(id,false);});
 for(const id of ['side','top','values'])expect(await state(id)).toMatchObject({busy:false,idle:true,ariaBusy:null});
 expect(await hit('#held-fixture [data-cell-id="side"] > .dhx_layout-cell-content')).toBe('content');
 // Destroying the layout ends a mark as well.
 await page.evaluate(()=>window.__page.busy('values',true));
 await page.evaluate(()=>{window.__page.destroy();});
 await expect(fixture.locator('[aria-busy="true"], .blade-status')).toHaveCount(0);
 await page.evaluate(()=>document.getElementById('held-fixture').remove());
 expect(failures).toEqual([]);
});

test('a list shows the indicator while it loads and says when it has no records or no record matches',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await start(page);
 const values=await gate(page,'demo_registry_values');
 await page.evaluate(()=>{
  const app=window.__bladeApp,box=document.createElement('div');
  box.id='states-fixture';Object.assign(box.style,{position:'fixed',left:'16px',top:'110px',width:'1000px',height:'600px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
  document.body.append(box);
  window.__page=new app.components.PageLayout({id:'states.lists',tree:{cols:[{id:'list',header:'Lista'}]}});
  window.__page.mount(box);
 });
 const fixture=page.locator('#states-fixture'),region=fixture.locator('[data-cell-id="list"]');
 // First load (held): aria-busy on the rows' content at once (not on the status), the indicator after the delay.
 values.hold();
 await page.evaluate(()=>{window.__list=new window.__bladeApp.components.ListView({view:'demo_registry_browser_values',scope:{field:'key_id',id:'0'},panel:false,mode:'table',emptyText:'Ehhez a kulcshoz nincs érték.'});window.__list.mount(window.__page.cell('list'));});
 await expect(region.locator('.blade-grid-views[aria-busy="true"]')).toHaveCount(1);
 await expect(region.locator('[aria-busy="true"] .blade-status')).toHaveCount(0);
 await expect(busy(region)).toBeVisible();
 const bar=region.locator('.blade-command-row').first(),loading=await bar.boundingBox();
 values.release();
 // Loaded without records: the list's own text below the table's header, no indicator and no aria-busy left.
 await expect(shown(region)).toHaveText('Ehhez a kulcshoz nincs érték.');
 await expect(shown(region).locator('.blade-status__icon .bi-inbox')).toBeVisible();
 await expect(busy(region)).toHaveCount(0);
 await expect(region.locator('[aria-busy="true"]')).toHaveCount(0);
 const [header,text]=[await region.locator('.dhx_header-wrapper').boundingBox(),await shown(region).boundingBox()];
 expect(text.y).toBeGreaterThanOrEqual(header.y+header.height-1);
 expect(await bar.boundingBox()).toEqual(loading);
 // The same in cards; a header filter's no-match text in the table.
 await region.getByRole('button',{name:/^Nézet:/}).click();await page.getByRole('menuitem',{name:'Kártyák',exact:true}).click();
 await expect(region.locator('.blade-grid-cards')).toBeVisible();
 await expect(shown(region)).toHaveText('Ehhez a kulcshoz nincs érték.');
 const filter=await page.evaluate(()=>window.__bladeApp.viewDefinition('demo_registry_browser_values').options.filters.find(filter=>filter.name==='name')?.name);
 expect(filter).toBe('name');
 await page.evaluate(()=>window.__list.setFilters({name:'zz-nincs-ilyen'}));
 await expect(shown(region)).toHaveText('Nincs a szűrésnek vagy a keresésnek megfelelő elem.');
 await expect(shown(region).locator('.bi-search')).toBeVisible();
 // A list with rows (unscoped, in a window, the list's own panel): no text; a filter without matches says so.
 await page.evaluate(()=>{window.__win=window.__bladeApp.ui.window({title:'Lista ablakban',width:700,height:460,modal:false});window.__all=new window.__bladeApp.components.ListView({view:'demo_registry_browser_values',mode:'table'});window.__all.mount(window.__win);});
 const win=page.getByRole('dialog',{name:'Lista ablakban',exact:true});
 await expect(win.locator('.dhx_grid-row').first()).toBeVisible();
 await expect(shown(win)).toHaveCount(0);
 await page.evaluate(()=>window.__all.setFilters({name:'zz-nincs-ilyen'}));
 await expect(shown(win)).toHaveText('Nincs a szűrésnek vagy a keresésnek megfelelő elem.');
 await expect(win.locator('.dhx_grid-row')).toHaveCount(0);
 // A reload of a list with rows keeps them under the indicator.
 await page.evaluate(()=>window.__all.setFilters({}));
 await expect(win.locator('.dhx_grid-row').first()).toBeVisible();
 values.hold();
 await page.evaluate(()=>window.__all.refresh());
 await expect(busy(win)).toBeVisible();
 await expect(win.locator('.dhx_grid-row').first()).toBeVisible();
 values.release();
 await expect(busy(win)).toHaveCount(0);
 await expect(win.locator('[aria-busy="true"]')).toHaveCount(0);
 // A failed first load keeps the error dialog; the list then says that its items are not available.
 values.failNext();
 await page.evaluate(()=>{window.__all.destroy();window.__all=new window.__bladeApp.components.ListView({view:'demo_registry_browser_values',mode:'table'});window.__all.mount(window.__win);});
 const dialog=page.getByRole('alertdialog').filter({hasText:'Szintetikus hiba.'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button').first().click();
 await expect(shown(win)).toHaveText('Az elemek nem érhetők el.');
 await expect(shown(win).locator('.bi-exclamation-circle')).toBeVisible();
 await expect(win.locator('[aria-busy="true"]')).toHaveCount(0);
 await page.evaluate(()=>{window.__all.destroy();window.__win.close();window.__list.destroy();window.__page.destroy();document.getElementById('states-fixture').remove();});
 expect(failures).toEqual([]);
});

test('key browser: region hints while the tree starts and without a value, the values list empty text',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 const nodes=await gate(page,'demo_registry_keys');
 nodes.hold();
 await openMenu(page,'Kulcsböngésző','Feature demó');
 const tree=page.getByRole('tree',{name:'Kulcsok',exact:true}),item=name=>tree.getByRole('treeitem',{name,exact:true});
 const values=page.getByRole('tabpanel',{name:'Értékek',exact:true}),details=page.locator('[data-cell-id="value"]');
 // The tree's roots are held: the tabs and the value panel show their hints until the tree selects.
 await expect(shown(values)).toHaveText('Válassz egy kulcsot a fában.');
 await expect(shown(details)).toHaveText('Válassz egy értéket a listában.');
 nodes.release();
 await expect(item('HKEY_CURRENT_USER')).toBeVisible();
 await tree.focus();await page.keyboard.press('ArrowRight');
 await item('Control Panel').click();
 // The toggle's kept state decides the scope; the text names it.
 const toggle=values.getByRole('button',{name:'Alkulcsok értékei',exact:true});
 if(await toggle.getAttribute('aria-pressed')==='true')await toggle.click();
 await expect(shown(values)).toHaveText('A kulcsnak nincs saját értéke.');
 await values.getByRole('button',{name:'Alkulcsok értékei',exact:true}).click();
 await expect(values).toContainText('Wallpaper');
 await expect(shown(values)).toHaveCount(0);
 // A value's details replace the hint; a list of the other scope destroys them and the hint is back.
 await values.getByText('Wallpaper',{exact:true}).click();
 await expect(details).toContainText('Wallpaper');
 await expect(shown(details)).toHaveCount(0);
 await values.getByRole('button',{name:'Alkulcsok értékei',exact:true}).click();
 await expect(shown(values)).toHaveText('A kulcsnak nincs saját értéke.');
 await expect(shown(details)).toHaveText('Válassz egy értéket a listában.');
 expect(failures).toEqual([]);
});

const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {view}=require('./feature-demo.cjs');
const {root,lazyBundle}=require('./fixture.cjs');
// Public list components (toolkit P3 C-1) of a real `Application` (createApplication, no shell): ListView, RecordForm,
// RecordDetails and CommandBar mounted in a project Layout, a framework window and destroyed again. Synthetic resource,
// answered by a fetch stub; the CSS is the tracked dist/admin.css. The bundle carries the built-in kinds, so it needs an
// outdir for their imported CSS (not written; only the script is used).
const bundle=lazyBundle('export {createApplication} from "./packages/frontend/src/app/Application"; export {LiveChannel} from "./packages/frontend/src/Realtime"; export {Layout,setTheme} from "@dhtmlx/suite";',{outdir:path.join(root,'tmp','toolkit-fixture'),
 loader:{'.woff':'dataurl','.woff2':'dataurl','.png':'dataurl','.svg':'dataurl','.gif':'dataurl','.ttf':'dataurl','.eot':'dataurl'}});

// Assets: audio opens the record view `demo.player` (offered), video names `demo.missing` (not offered to this actor),
// everything else the details (`*`). Record 4 is audio but does not offer `get`: its activation falls back to the details.
async function mount(page){
 await page.route('**/toolkit-list-fixture',route=>route.fulfill({contentType:'text/html',body:'<div id="blade-application"></div>'}));
 await page.goto('/toolkit-list-fixture');await page.setContent('<div id="blade-application" style="height:760px"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle()});
 await page.evaluate(()=>{
  const row=(id,title,kind,actions=['get','update'])=>({id,title,kind,revision:'r'+id,_actions:actions});
  window.rows=[row('1','Hang 1','audio'),row('2','Videó 2','video'),row('3','Kép 3','image'),row('4','Hang 4','audio',['update'])];
  window.requests=[];window.navigations=[];window.events=[];
  const title={name:'title',label:'Cím',type:'text',required:true,max:80,options:{}},revision={name:'revision',label:'Revízió',type:'text',required:false,max:64,options:{}};
  window.fetch=async(_url,config)=>{
   const request=JSON.parse(config.body);requests.push(request);
   const snapshot={items:rows,previous:null,next:null,version:'v1',total:rows.length,matched:rows.length};
   let data;
   if(request.action==='list')data=snapshot;
   if(request.action==='__watch')data={results:request.values.subscriptions.map(s=>({id:s.id,ok:true,data:snapshot}))};
   if(request.action==='get')data=rows.find(item=>item.id===request.id);
   if(request.action==='__form'){const item=rows.find(entry=>entry.id===request.id);data={fields:[title,revision],values:{title:item.title,revision:item.revision}};}
   if(request.action==='update'){const index=rows.findIndex(item=>item.id===request.id);rows[index]={...rows[index],title:request.values.title,revision:rows[index].revision+'b'};data=rows[index];}
   return {ok:true,json:async()=>({ok:true,data})};
  };
  fixture.setTheme('skyblue',document.documentElement);
  const kinds={audio:'Hang',video:'Videó',image:'Kép'};
  const assets={id:'assets',kind:'list',title:'Médiatár',resource:'assets',
   actions:[{name:'get',label:'Adatok',write:false,fields:[]},{name:'update',label:'Módosítás',submitLabel:'Mentés',write:true,fields:[title]}],
   options:{singleton:false,columns:[{id:'title',header:'Cím',type:'text'},{id:'kind',header:'Típus',type:'select',options:kinds}],filters:[],sortable:[],tiles:true,
    layout:{formMode:'overlay',tree:{rows:[{id:'grid'}]}},activate:{field:'kind',map:{audio:'view:demo.player',video:'view:demo.missing','*':'details'}}}};
  const player={id:'demo.player',kind:'demo.player',title:'Lejátszó',resource:'assets',record:'assets',actions:[],options:{},open:'window'};
  window.channel=new fixture.LiveChannel({transport:'poll',endpoint:'live',interval:60000});
  window.app=fixture.createApplication({channel:()=>channel,userId:'toolkit-list',displayName:'Teszt',tenant:null,views:[assets,player],
   navigate:target=>{navigations.push(target);return true;}}).app;
  window.layout=new fixture.Layout(document.getElementById('blade-application'),{type:'space',rows:[{id:'bar',height:48},{cols:[{id:'list'},{id:'side',width:380}]}]});
  window.list=new app.components.ListView({view:'assets'});
  for(const name of ['select','activate','saved','changed'])list.on(name,payload=>events.push({name,row:payload.row?.id,target:payload.target,action:payload.action,count:payload.rows?.length}));
  list.mount(layout.getCell('list'));
 });
 await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
}
const row=(page,title)=>page.locator('.dhx_grid-row').filter({hasText:title}).first().locator('[data-dhx-col-id="title"]');
const activations=page=>page.evaluate(()=>events.filter(event=>event.name==='activate').map(event=>[event.row,event.target]));
const details=page=>page.getByRole('dialog',{name:'Rekordadatok'});
// The window's content takes the focus once it has settled; Escape then closes it (Suite closes the focused window).
const closeDetails=async page=>{await expect(details(page).locator('.blade-record-details')).toBeFocused();await page.keyboard.press('Escape');await expect(details(page)).toHaveCount(0);};

test('app.components offers the list components; ListView reports select, activate per row and changed',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:820});await mount(page);
 expect(await page.evaluate(()=>[Object.isFrozen(app.components),...['ListView','RecordForm','RecordDetails','CommandBar'].map(name=>typeof app.components[name])])).toEqual([true,'function','function','function','function']);
 expect(await page.evaluate(()=>{try{new app.components.ListView({view:'demo.player'});return 'created';}catch(error){return error instanceof TypeError;}})).toBe(true);
 await expect.poll(()=>page.evaluate(()=>events.find(event=>event.name==='changed')?.count)).toBe(4);
 await row(page,'Kép 3').click();
 await expect.poll(()=>page.evaluate(()=>events.filter(event=>event.name==='select').map(event=>event.row).at(-1))).toBe('3');
 expect(await page.evaluate(()=>list.selected()?.title)).toBe('Kép 3');
 // Table: double-click and Enter choose per row; view:<id> goes through the application's navigation.
 await row(page,'Hang 1').dblclick();
 await expect.poll(()=>page.evaluate(()=>navigations)).toEqual([{view:'demo.player',record:'1'}]);
 await expect(details(page)).toHaveCount(0);
 await row(page,'Videó 2').dblclick();await expect(details(page)).toBeVisible();await expect(details(page)).toContainText('Videó 2');await closeDetails(page);
 await row(page,'Kép 3').dblclick();await expect(details(page)).toBeVisible();await closeDetails(page);
 await row(page,'Hang 4').dblclick();await expect(details(page)).toBeVisible();await closeDetails(page);
 await row(page,'Hang 1').click();await page.keyboard.press('Enter');
 await expect.poll(()=>page.evaluate(()=>navigations.length)).toBe(2);
 expect(await activations(page)).toEqual([['1','view:demo.player'],['2','details'],['3','details'],['4','details'],['1','view:demo.player']]);
 // Cards and tiles: the same per-row choice, named by aria-description.
 for(const [mode,selector] of [['Kártyák','.blade-grid-card'],['Csempék','.blade-grid-tile']]){
  await view(page,mode);
  const item=title=>page.locator(selector).filter({hasText:title}).first();
  await expect(item('Hang 1')).toHaveAttribute('aria-description','Megnyitás: Lejátszó');
  await expect(item('Videó 2')).toHaveAttribute('aria-description','Megnyitás: Adatok');
  await expect(item('Hang 4')).toHaveAttribute('aria-description','Megnyitás: Adatok');
  const before=await page.evaluate(()=>navigations.length);
  await item('Hang 1').dblclick();await expect.poll(()=>page.evaluate(()=>navigations.length)).toBe(before+1);
  await item('Videó 2').click();await page.keyboard.press('Enter');await expect(details(page)).toBeVisible();await closeDetails(page);
  expect(await page.evaluate(()=>navigations.length)).toBe(before+1);
 }
 await view(page,'Táblázat');
 expect(await page.evaluate(()=>navigations.every(target=>target.view==='demo.player'&&target.record==='1'))).toBe(true);
 await page.evaluate(()=>list.destroy());
 expect(errors).toEqual([]);
});

test('RecordForm and the list forms report saved; RecordForm validates like the server and reports changed',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:820});await mount(page);
 // The list's own update form: `saved` with the action and the server's row.
 await row(page,'Kép 3').click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Médiatár — Módosítás'});await expect(editor).toBeVisible();
 await editor.getByLabel('Cím',{exact:true}).fill('Kép 3 új');await editor.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(editor).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>events.filter(event=>event.name==='saved').map(event=>[event.action,event.row]))).toEqual([['update','3']]);
 expect(await page.evaluate(()=>requests.find(request=>request.action==='update'))).toMatchObject({resource:'assets',id:'3',values:{title:'Kép 3 új',revision:'r3'}});
 // A RecordForm in the side cell of the same Layout.
 await page.evaluate(()=>{
  window.form=new app.components.RecordForm({resource:'assets',action:'update',id:'1'});
  window.formEvents=[];for(const name of ['saved','cancelled','changed'])form.on(name,payload=>formEvents.push([name,payload.field??payload.result?.id??null]));
  form.mount(layout.getCell('side'));
 });
 const side=page.locator('[data-cell-id="side"]');
 const input=side.getByLabel('Cím',{exact:true});await expect(input).toHaveValue('Hang 1');
 expect(await page.evaluate(()=>form.dirty())).toBe(false);
 await input.fill('');
 const rejected=await page.evaluate(()=>form.submit().then(()=>null,error=>({status:error.status,fields:Object.keys(error.fieldErrors)})));
 expect(rejected).toEqual({status:400,fields:['title']});
 expect(await page.evaluate(()=>requests.filter(request=>request.action==='update'&&request.id==='1').length)).toBe(0);
 // Suite commits a typed value on the input's change (leaving the field); submit() commits a focused field itself.
 await input.fill('Hang 1 új');await input.press('Tab');
 await expect.poll(()=>page.evaluate(()=>form.dirty())).toBe(true);
 expect(await page.evaluate(()=>formEvents.some(([name,field])=>name==='changed'&&field==='title'))).toBe(true);
 await side.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>formEvents.filter(([name])=>name==='saved'))).toEqual([['saved','1']]);
 expect(await page.evaluate(()=>requests.find(request=>request.action==='update'&&request.id==='1').values)).toEqual({title:'Hang 1 új',revision:'r1'});
 await expect(page.locator('.blade-toast').filter({hasText:'A művelet sikerült.'}).first()).toBeVisible();
 expect(await page.evaluate(()=>form.dirty())).toBe(false);
 await side.getByRole('button',{name:'Mégse',exact:true}).click();
 expect(await page.evaluate(()=>formEvents.some(([name])=>name==='cancelled'))).toBe(true);
 await page.evaluate(()=>{form.destroy();form.destroy();list.destroy();});
 await expect(side.locator('input')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('destroy releases the DOM, the cell and the live subscription; RecordDetails, CommandBar and a window mount; themes switch',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:820});await mount(page);
 // The list is watched on the tab's channel (one batched __watch carries it).
 await expect.poll(()=>page.evaluate(()=>requests.some(request=>request.action==='__watch'&&request.values.subscriptions.some(s=>s.resource==='assets')))).toBe(true);
 expect(await page.evaluate(()=>channel.handles.size)).toBe(1);
 // CommandBar: the responsive framework toolbar with click events and update().
 await page.evaluate(()=>{
  window.bar=new app.components.CommandBar({items:[{id:'play',label:'Lejátszás',icon:'dxi dxi-check'},{type:'spacer'},{id:'stop',label:'Leállítás',disabled:true}]});
  window.clicks=[];bar.on('click',({id})=>clicks.push(id));bar.mount(layout.getCell('bar'));
 });
 const barCell=page.locator('[data-cell-id="bar"]');
 await barCell.getByRole('button',{name:'Lejátszás',exact:true}).click();
 await expect(barCell.getByRole('button',{name:'Leállítás',exact:true})).toBeDisabled();
 await page.evaluate(()=>bar.update('stop',{label:'Állj',disabled:false}));
 await barCell.getByRole('button',{name:'Állj',exact:true}).click();
 expect(await page.evaluate(()=>clicks)).toEqual(['play','stop']);
 // RecordDetails: an id is loaded through the view's get; a row is shown as given.
 await page.evaluate(()=>{window.details=new app.components.RecordDetails({view:'assets',record:'2'});details.mount(layout.getCell('side'));});
 const side=page.locator('[data-cell-id="side"]');
 await expect(side.locator('.blade-record-details')).toContainText('Videó 2');await expect(side.locator('.blade-record-details')).toContainText('Típus');
 expect(await page.evaluate(()=>requests.filter(request=>request.action==='get').map(request=>request.id))).toEqual(['2']);
 const gets=await page.evaluate(async()=>{await details.show(rows[2]);return requests.filter(request=>request.action==='get').length;});
 expect(gets).toBe(1);await expect(side.locator('.blade-record-details')).toContainText('Kép 3');
 // A component mounted in an app.ui.window is destroyed when the window closes.
 await page.evaluate(()=>{window.win=app.ui.window({title:'Részletek',width:600,height:400});window.windowed=new app.components.RecordDetails({view:'assets',record:rows[0]});windowed.mount(win);});
 const dialog=page.getByRole('dialog',{name:'Részletek'});await expect(dialog.locator('.blade-record-details')).toContainText('Hang 1');
 await page.evaluate(()=>win.close());await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>windowed.destroyed)).toBe(true);
 // Theme switch: the components take the theme from the page, nothing of their own.
 const cell=page.locator('.dhx_grid-row .dhx_grid-cell').first();
 const light=await cell.evaluate(element=>getComputedStyle(element).color);
 await page.evaluate(()=>fixture.setTheme('dark',document.documentElement));
 await expect.poll(()=>cell.evaluate(element=>getComputedStyle(element).color)).not.toBe(light);
 await expect(page.locator('.dhx_grid-row')).toHaveCount(4);
 await page.evaluate(()=>fixture.setTheme('skyblue',document.documentElement));
 // destroy(): DOM, cell, subscription and handlers released; idempotent; no events afterwards.
 await page.evaluate(()=>{list.destroy();list.destroy();details.destroy();bar.destroy();});
 await expect(page.locator('.dhx_grid-row')).toHaveCount(0);
 await expect(page.locator('.blade-record-details')).toHaveCount(0);
 await expect(barCell.getByRole('button')).toHaveCount(0);
 expect(await page.evaluate(()=>[!layout.getCell('list').getWidget(),channel.handles.size,list.selected()===undefined,list.editing()])).toEqual([true,0,true,false]);
 const count=await page.evaluate(()=>events.length);
 await page.evaluate(()=>{list.refresh();list.setFilters({});});
 expect(await page.evaluate(()=>events.length)).toBe(count);
 expect(errors).toEqual([]);
});

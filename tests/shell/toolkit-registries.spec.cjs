const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {view}=require('./feature-demo.cjs');
const {root,lazyBundle}=require('./fixture.cjs');
// Presentation, field-type and command registries (toolkit P3 C-5, docs/toolkit.md#registries) of a real `Application`
// (createApplication, no shell): a project presentation, a project field type in form, grid and card, project view
// and record commands in the toolbar (no record menu), the built-in `details` command and `image` presentation, and the fallback of unknown names.
// Synthetic resource answered by a fetch stub; the CSS is the tracked dist/admin.css (bundling as toolkit-list.spec.cjs).
// A 1×1 PNG: the static images load (a failing one would be replaced by the placeholder icon).
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const bundle=lazyBundle('export {createApplication} from "./packages/frontend/src/app/Application"; export {LiveChannel} from "./packages/frontend/src/Realtime"; export {Layout,setTheme} from "@dhtmlx/suite";',{outdir:path.join(root,'tmp','toolkit-fixture'),
 loader:{'.woff':'dataurl','.woff2':'dataurl','.png':'dataurl','.svg':'dataurl','.gif':'dataurl','.ttf':'dataurl','.eot':'dataurl'}});

async function mount(page){
 page.warnings=[];page.on('console',message=>{if(message.type()==='warning')page.warnings.push(message.text());});
 await page.route('**/toolkit-registries-fixture',route=>route.fulfill({contentType:'text/html',body:'<div id="blade-application"></div>'}));
 await page.route('**/img/**',route=>route.fulfill({contentType:'image/png',body:pixel}));
 await page.goto('/toolkit-registries-fixture');await page.setContent('<div id="blade-application" style="height:760px"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle()});
 await page.evaluate(()=>{
  const row=(id,title,score,priority)=>({id,title,score,priority,kind:'a',image:'p'+id+'.png',revision:'r'+id,_actions:['get','update'],_editable:['priority']});
  window.rows=[row('1','Első','<b>5</b>','3'),row('2','Második','7','1'),row('3','Harmadik','2','5')];
  window.requests=[];window.runs=[];window.bound=[];window.released=[];
  const field=(name,label,type='text',extra={})=>({name,label,type,required:false,max:80,options:{},...extra});
  const priority=field('priority','Prioritás','number',{editor:'demo.rating'}),revision=field('revision','Revízió');
  window.fetch=async(_url,config)=>{
   const request=JSON.parse(config.body);requests.push(request);
   const snapshot={items:rows,previous:null,next:null,version:'v1',total:rows.length,matched:rows.length};
   let data;
   if(request.action==='list')data=snapshot;
   if(request.action==='__watch')data={results:request.values.subscriptions.map(s=>({id:s.id,ok:true,data:snapshot}))};
   if(request.action==='get')data=rows.find(item=>item.id===request.id);
   if(request.action==='__form'){const item=rows.find(entry=>entry.id===request.id);data={fields:[field('title','Cím'),priority,revision],values:{title:item.title,priority:item.priority,revision:item.revision}};}
   if(request.action==='__edit'){const index=rows.findIndex(item=>item.id===request.id);rows[index]={...rows[index],[request.values.field]:String(request.values.value),revision:rows[index].revision+'e'};data={values:{[request.values.field]:String(request.values.value)},revision:rows[index].revision};}
   if(request.action==='update'){const index=rows.findIndex(item=>item.id===request.id);rows[index]={...rows[index],...request.values,revision:rows[index].revision+'u'};data=rows[index];}
   return {ok:true,json:async()=>({ok:true,data})};
  };
  fixture.setTheme('skyblue',document.documentElement);
  const tasks={id:'tasks',kind:'list',title:'Feladatok',resource:'tasks',
   actions:[{name:'get',label:'Adatok',write:false,fields:[]},{name:'update',label:'Módosítás',submitLabel:'Mentés',write:true,fields:[field('title','Cím'),priority]}],
   options:{singleton:false,selection:true,filters:[],sortable:[],tiles:true,layout:{formMode:'overlay',tree:{rows:[{id:'grid'}]}},
    columns:[{id:'title',header:'Cím',type:'text'},{id:'score',header:'Pont',type:'text',presentation:'demo.bar'},{id:'priority',header:'Prioritás',type:'number',editor:'demo.rating',editable:true},
     {id:'kind',header:'Fajta',type:'text',presentation:'demo.unknown'},{id:'image',header:'Kép',type:'text',presentation:'image',imageBase:'img/'}],
    commands:['demo.copy','demo.count','demo.open','demo.fail','demo.missing']}};
  window.channel=new fixture.LiveChannel({transport:'poll',endpoint:'live',interval:60000});
  window.app=fixture.createApplication({channel:()=>channel,userId:'toolkit-registries',displayName:'Teszt',tenant:null,views:[tasks],navigate:()=>true}).app;
  // What a project module registers (docs/toolkit.md#registries).
  app.presentations.register('demo.bar',{render:(value,_row,_column,size,escape)=>`<span class="demo-bar" data-size="${size}">${escape(value)}</span>`,text:value=>'Pont: '+value});
  app.fieldTypes.register('demo.rating',{
   input:(field,value,readOnly)=>({type:'input',name:field.name,label:field.label,labelPosition:'top',css:'demo-rating',value:String(value??''),readOnly}),
   bind:({field,signal})=>{bound.push(field.name);signal.addEventListener('abort',()=>released.push(field.name));},
   display:(value,_row,_field,size,escape)=>`<span class="demo-stars" data-size="${size}">${'★'.repeat(Number(value)||0)}${escape('')}</span>`});
  const record=name=>context=>runs.push({name,row:context.row?.id,rows:context.rows.length,view:context.view.id,signal:context.signal instanceof AbortSignal});
  app.commands.register('demo.copy',{label:'Másolás',icon:'dxi dxi-content-copy',placement:'both',enabled:({row})=>!!row,run:record('demo.copy')});
  app.commands.register('demo.count',{label:'Számlálás',placement:'toolbar',run:record('demo.count')});
  app.commands.register('demo.open',{label:'Megnyitás',placement:'record',run:async context=>{await context.app.server.call('tasks','get',{id:context.row.id});record('demo.open')(context);}});
  app.commands.register('demo.fail',{label:'Hibás',placement:'toolbar',run:async()=>{throw new Error('A parancs nem sikerült.');}});
  window.layout=new fixture.Layout(document.getElementById('blade-application'),{type:'space',rows:[{id:'list'}]});
  window.list=new app.components.ListView({view:'tasks'});list.mount(layout.getCell('list'));
 });
 await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
}
const gridRow=(page,title)=>page.locator('.dhx_grid-row').filter({hasText:title}).first();
const cellOf=(page,title,column)=>gridRow(page,title).locator(`[data-dhx-col-id="${column}"]`);

test('presentations: a project renderer, the built-in image and the fallback of an unknown name in table, cards, tiles and details',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:820});await mount(page);
 expect(await page.evaluate(()=>[app.presentations.names(),app.commands.names().slice(0,1)])).toEqual([['image','demo.bar'],['details']]);
 // Table: the renderer's HTML with every value escaped by the given escape.
 const score=cellOf(page,'Első','score').locator('.demo-bar');
 await expect(score).toHaveAttribute('data-size','cell');await expect(score).toHaveText('<b>5</b>');
 await expect(cellOf(page,'Első','score').locator('b')).toHaveCount(0);
 // Unknown presentation: the plain value and one console warning, the list works.
 await expect(cellOf(page,'Első','kind')).toHaveText('a');
 await expect.poll(()=>page.warnings.filter(text=>text.includes('"demo.unknown"')).length).toBe(1);
 await expect.poll(()=>page.warnings.some(text=>text.includes('"demo.missing"'))).toBe(true);
 // Built-in image (through the registry): the static image slot, unchanged.
 await expect(cellOf(page,'Első','image').locator('img[data-blade-static-image]')).toHaveAttribute('src','img/p1.png');
 // Cards: the card size, the image in the top slot.
 await view(page,'Kártyák');
 const card=page.locator('.blade-grid-card').filter({hasText:'Első'}).first();
 await expect(card.locator('.demo-bar')).toHaveAttribute('data-size','card');
 await expect(card.locator('.blade-grid-card__media img[data-blade-static-image]')).toHaveAttribute('src','img/p1.png');
 // Tiles: the title stays text, the secondary line uses the tile size.
 await view(page,'Csempék');
 const tile=page.locator('.blade-grid-tile').filter({hasText:'Második'}).first();
 await expect(tile.locator('.blade-grid-tile__meta .demo-bar')).toHaveAttribute('data-size','tile');
 await expect(tile.locator('.blade-grid-tile__media img[data-blade-static-image]')).toHaveAttribute('src','img/p2.png');
 await view(page,'Táblázat');
 // Details (the built-in `details` command on the registry): the card size, freshly loaded through get.
 await cellOf(page,'Második','title').click();
 await page.getByRole('button',{name:'Adatok',exact:true}).click();
 const details=page.getByRole('dialog',{name:'Rekordadatok'});
 await expect(details.locator('.demo-bar')).toHaveAttribute('data-size','card');
 await expect(details).toContainText('Második');
 expect(await page.evaluate(()=>requests.filter(request=>request.action==='get').map(request=>request.id))).toEqual(['2']);
 await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
 await page.evaluate(()=>list.destroy());
 expect(errors).toEqual([]);
});

test('field types: the project editor in the update form, the grid cell and the card editor, saved through the framework',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:820});await mount(page);
 // Grid: the field type's display; an editable cell is an edit button, never the native cell editor.
 const cell=cellOf(page,'Első','priority');
 await expect(cell.locator('.demo-stars')).toHaveText('★★★');
 const edit=cell.getByRole('button',{name:'Prioritás — szerkesztés'});
 await edit.click();
 const editor=page.getByRole('dialog').filter({has:page.locator('.demo-rating')});
 await expect(editor.locator('.demo-rating input')).toHaveValue('3');
 await expect(cell.locator('input')).toHaveCount(0);
 expect(await page.evaluate(()=>bound)).toEqual(['priority']);
 await editor.locator('.demo-rating input').fill('4');
 await editor.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(editor).toHaveCount(0);
 expect(await page.evaluate(()=>requests.find(request=>request.action==='__edit'))).toMatchObject({resource:'tasks',id:'1',values:{field:'priority',value:'4',revision:'r1'}});
 await expect(cell.locator('.demo-stars')).toHaveText('★★★★');
 expect(await page.evaluate(()=>released)).toEqual(['priority']);
 // Update form: the field type's item beside the built-in ones; its binding ends with the form.
 await cellOf(page,'Második','title').click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Feladatok — Módosítás'});
 await expect(form.locator('.demo-rating input')).toHaveValue('1');
 await expect(form.getByLabel('Cím',{exact:true})).toHaveValue('Második');
 await form.locator('.demo-rating input').fill('2');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();await expect(form).toHaveCount(0);
 expect(await page.evaluate(()=>requests.find(request=>request.action==='update').values)).toMatchObject({title:'Második',priority:'2'});
 expect(await page.evaluate(()=>[bound.length,released.length])).toEqual([2,2]);
 // Cards: the display at card size and the same edit window.
 await view(page,'Kártyák');
 const card=page.locator('.blade-grid-card').filter({hasText:'Harmadik'}).first();
 await expect(card.locator('.demo-stars')).toHaveAttribute('data-size','card');
 await card.locator('.blade-card-edit').filter({has:page.locator('.demo-stars')}).click();
 const cardEditor=page.getByRole('dialog').filter({has:page.locator('.demo-rating')});
 await expect(cardEditor.locator('.demo-rating input')).toHaveValue('5');
 await cardEditor.getByRole('button',{name:'Mégse',exact:true}).click();await expect(cardEditor).toHaveCount(0);
 expect(await page.evaluate(()=>[bound.length,released.length])).toEqual([3,3]);
 await page.evaluate(()=>list.destroy());
 expect(errors).toEqual([]);
});

test('client commands: every placement in the toolbar after the actions, record commands on the cursor record, marks, no context menu, errors',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:820});await mount(page);
 const button=name=>page.getByRole('button',{name,exact:true});
 // A right click (the context menu key and Shift+F10 fire the same event) keeps the browser's own menu: no record menu.
 const noRecordMenu=async target=>{
  await page.evaluate(()=>{window.prevented=undefined;document.addEventListener('contextmenu',event=>{window.prevented=event.defaultPrevented;event.preventDefault();},{once:true});});
  await target.click({button:'right'});
  await expect.poll(()=>page.evaluate(()=>window.prevented)).toBe(false);
  await expect(page.getByRole('menuitem',{name:/^(Adatok|Másolás|Számlálás|Megnyitás|Hibás)$/})).toHaveCount(0);
 };
 // Toolbar: the built-in Adatok first, the declared commands after the view's actions in declaration order
 // (`both`, `toolbar`, `record`, `toolbar`), an unknown one skipped.
 const labels=await page.locator('.blade-command-row .dhx_toolbar').first().getByRole('button').allInnerTexts();
 expect(labels.map(label=>label.trim()).filter(label=>['Adatok','Módosítás','Másolás','Számlálás','Megnyitás','Hibás'].includes(label)))
  .toEqual(['Adatok','Módosítás','Másolás','Számlálás','Megnyitás','Hibás']);
 // Without a cursor record the record commands are disabled like the built-in record actions; view commands run.
 for(const name of ['Adatok','Módosítás','Másolás','Megnyitás'])await expect(button(name)).toBeDisabled();
 await expect(button('Számlálás')).toBeEnabled();
 await button('Számlálás').click();
 // With one they run on it; a server effect is an ordinary action call.
 await cellOf(page,'Második','title').click();
 for(const name of ['Adatok','Másolás','Megnyitás'])await expect(button(name)).toBeEnabled();
 await button('Másolás').click();
 await button('Megnyitás').click();
 await expect.poll(()=>page.evaluate(()=>runs)).toEqual([
  {name:'demo.count',rows:0,view:'tasks',signal:true},{name:'demo.copy',row:'2',rows:0,view:'tasks',signal:true},{name:'demo.open',row:'2',rows:0,view:'tasks',signal:true}]);
 expect(await page.evaluate(()=>requests.filter(request=>request.action==='get').map(request=>request.id))).toEqual(['2']);
 // Marks: several disable the default record rule (Adatok, Megnyitás) like Módosítás; a command whose own rule
 // accepts them (Másolás) and view commands receive the marked rows.
 for(const title of ['Első','Második'])await gridRow(page,title).locator('[data-dhx-col-id="_mark"]').click();
 await expect(gridRow(page,'Második').locator('[data-dhx-col-id="_mark"] input')).toBeChecked();
 for(const name of ['Adatok','Módosítás','Megnyitás'])await expect(button(name)).toBeDisabled();
 await expect(button('Másolás')).toBeEnabled();
 await button('Másolás').click();
 await expect.poll(()=>page.evaluate(()=>runs.at(-1))).toMatchObject({name:'demo.copy',row:'2',rows:2});
 await button('Számlálás').click();
 await expect.poll(()=>page.evaluate(()=>runs.at(-1))).toMatchObject({name:'demo.count',rows:2});
 for(const title of ['Első','Második'])await gridRow(page,title).locator('[data-dhx-col-id="_mark"]').click();
 await expect(button('Megnyitás')).toBeEnabled();
 // No record menu on a row.
 await noRecordMenu(cellOf(page,'Harmadik','title'));
 // Cards and tiles: the toolbar commands act on the card's cursor record; no record menu there either.
 await view(page,'Kártyák');
 const card=page.locator('.blade-grid-card').filter({hasText:'Első'}).first();
 await card.getByText('Első',{exact:true}).click();
 await button('Megnyitás').click();
 await expect.poll(()=>page.evaluate(()=>runs.at(-1))).toMatchObject({name:'demo.open',row:'1'});
 await noRecordMenu(card.getByText('Első',{exact:true}));
 await view(page,'Csempék');
 await noRecordMenu(page.locator('.blade-grid-tile').filter({hasText:'Harmadik'}).first());
 await view(page,'Táblázat');
 // A failing command shows the shared error dialog; the list keeps working.
 await button('Hibás').click();
 const failure=page.getByRole('alertdialog').filter({hasText:'A parancs nem sikerült.'});
 await expect(failure).toBeVisible();
 await page.keyboard.press('Escape');await expect(failure).toHaveCount(0);
 // Narrow: the record commands move into the Műveletek menu with the other toolbar items and run on the cursor record.
 await page.setViewportSize({width:390,height:844});
 const menu=button('Műveletek');await expect(menu).toBeVisible();
 await page.locator('.blade-grid-card').filter({hasText:'Második'}).first().getByText('Második',{exact:true}).click();
 await menu.click();await page.getByRole('menuitem',{name:'Megnyitás',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>runs.at(-1))).toMatchObject({name:'demo.open',row:'2'});
 // The context signal ends with the list.
 expect(await page.evaluate(()=>{list.destroy();return document.querySelectorAll('.dhx_grid-row').length;})).toBe(0);
 expect(errors).toEqual([]);
});

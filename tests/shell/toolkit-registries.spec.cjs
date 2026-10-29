const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {view}=require('./feature-demo.cjs');
const root=path.resolve(__dirname,'../..');
// Presentation, field-type and command registries (toolkit P3 C-5, docs/toolkit.md#registries) of a real `Application`
// (createApplication, no shell): a project presentation, a project field type in form, grid and card, project toolbar
// and record-menu commands, the built-in `details` command and `image` presentation, and the fallback of unknown names.
// Synthetic resource answered by a fetch stub; the CSS is the tracked dist/admin.css (bundling as toolkit-list.spec.cjs).
// A 1×1 PNG: the static images load (a failing one would be replaced by the placeholder icon).
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const bundle=require('esbuild').buildSync({stdin:{contents:'export {createApplication} from "./packages/frontend/src/app/Application"; export {LiveChannel} from "./packages/frontend/src/Realtime"; export {Layout,setTheme} from "@dhtmlx/suite";',resolveDir:root},
 bundle:true,format:'iife',globalName:'fixture',write:false,outdir:path.join(root,'tmp','toolkit-registries-fixture'),
 loader:{'.woff':'dataurl','.woff2':'dataurl','.png':'dataurl','.svg':'dataurl','.gif':'dataurl','.ttf':'dataurl','.eot':'dataurl'}}).outputFiles.find(file=>file.path.endsWith('.js')).text;

async function mount(page){
 page.warnings=[];page.on('console',message=>{if(message.type()==='warning')page.warnings.push(message.text());});
 await page.route('**/toolkit-registries-fixture',route=>route.fulfill({contentType:'text/html',body:'<div id="blade-application"></div>'}));
 await page.route('**/img/**',route=>route.fulfill({contentType:'image/png',body:pixel}));
 await page.goto('/toolkit-registries-fixture');await page.setContent('<div id="blade-application" style="height:760px"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
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

test('client commands: toolbar and record menu by placement, enabled rules, marks, server calls and errors',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:820});await mount(page);
 const button=name=>page.getByRole('button',{name,exact:true});
 // Toolbar: `toolbar` and `both` commands after the actions, `record` ones only in the record menu, an unknown one skipped.
 await expect(button('Másolás')).toBeVisible();await expect(button('Számlálás')).toBeVisible();
 await expect(button('Megnyitás')).toHaveCount(0);await expect(button('Adatok')).toBeDisabled();
 await expect(button('Másolás')).toBeDisabled();
 await button('Számlálás').click();
 await cellOf(page,'Második','title').click();
 await expect(button('Másolás')).toBeEnabled();await expect(button('Adatok')).toBeEnabled();
 await button('Másolás').click();
 await expect.poll(()=>page.evaluate(()=>runs)).toEqual([
  {name:'demo.count',rows:0,view:'tasks',signal:true},{name:'demo.copy',row:'2',rows:0,view:'tasks',signal:true}]);
 // Marks: several marks disable the built-in details; the context carries the marked rows.
 for(const title of ['Első','Második'])await gridRow(page,title).locator('[data-dhx-col-id="_mark"]').click();
 await expect(gridRow(page,'Második').locator('[data-dhx-col-id="_mark"] input')).toBeChecked();
 await expect(button('Adatok')).toBeDisabled();
 await button('Számlálás').click();
 await expect.poll(()=>page.evaluate(()=>runs.at(-1).rows)).toBe(2);
 // Record menu: the native context menu of the record (it becomes the cursor), `record` and `both` commands.
 await cellOf(page,'Harmadik','title').click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'Megnyitás'})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Másolás'})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Számlálás'})).toHaveCount(0);
 await page.getByRole('menuitem',{name:'Megnyitás'}).click();
 await expect.poll(()=>page.evaluate(()=>runs.at(-1))).toMatchObject({name:'demo.open',row:'3'});
 expect(await page.evaluate(()=>[requests.filter(request=>request.action==='get').map(request=>request.id),list.selected()?.id])).toEqual([['3'],'3']);
 // Cards: the same record menu.
 await view(page,'Kártyák');
 await page.locator('.blade-grid-card').filter({hasText:'Első'}).first().getByText('Első',{exact:true}).click({button:'right'});
 await page.getByRole('menuitem',{name:'Másolás'}).click();
 await expect.poll(()=>page.evaluate(()=>runs.at(-1))).toMatchObject({name:'demo.copy',row:'1'});
 await view(page,'Táblázat');
 // A failing command shows the shared error dialog; the list keeps working.
 await button('Hibás').click();
 const failure=page.getByRole('alertdialog').filter({hasText:'A parancs nem sikerült.'});
 await expect(failure).toBeVisible();
 await page.keyboard.press('Escape');await expect(failure).toHaveCount(0);
 // The context signal ends with the list.
 expect(await page.evaluate(()=>{list.destroy();return document.querySelectorAll('.dhx_grid-row').length;})).toBe(0);
 expect(errors).toEqual([]);
});

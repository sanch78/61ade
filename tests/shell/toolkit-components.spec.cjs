const {test,expect}=require('../../tools/playwright-test.cjs');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,api}=require('./feature-demo.cjs');
// Toolkit P3 C-2 (docs/toolkit.md#components, #uploads): the public Calendar, DiagramEditor, FileManager and
// FilePicker components and app.uploads, driven from a project module on the managed feature demo. The module is a test fixture: the spec
// adds it to the signed-in bootstrap `modules` and serves it itself; it only hands `app` to the page.
// Diagrams and files created here carry the run prefix and are removed afterwards.
const prefix='pk'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const MODULE='/toolkit-components-fixture.mjs';
test.describe.configure({mode:'serial'});
test.afterAll(()=>{
 php(`$q=$db->prepare("DELETE FROM blade_files WHERE space='demo' AND (name LIKE ? OR (parent_id<>0 AND parent_id NOT IN (SELECT id FROM blade_files)))");do{$q->execute(['${prefix}%']);}while($q->rowCount()>0);`);
 const transfers=path.resolve(runtime,instance,'files','.transfers');
 try{for(const id of fs.readdirSync(transfers)){try{if(fs.readFileSync(path.join(transfers,id,'meta.json'),'utf8').includes(prefix))fs.rmSync(path.join(transfers,id),{recursive:true,force:true});}catch{}}}catch{}
});

/** Serves the fixture module and declares it in the signed-in bootstrap (the sign-in page loads no modules). */
async function fixture(page){
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
}
/** The fixture module ran; a redirected sign-in or language POST may skip the route, so the page is reloaded once. */
async function loaded(page){
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}
async function start(page,email='demo@example.test'){
 await fixture(page);await page.setViewportSize({width:1400,height:900});await signIn(page,email);
 await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toHaveCount(0);
 await loaded(page);
}
const errors=page=>{const list=[];page.on('pageerror',error=>list.push(error.message));return list;};
/** A project Layout over the workspace: by default cells `calendar` and `diagram`. */
const layout=(page,cells=['calendar','diagram'])=>page.evaluate(cells=>{
 const app=window.__bladeApp,box=document.createElement('div');
 box.id='toolkit-fixture';Object.assign(box.style,{position:'fixed',left:'16px',right:'16px',top:'110px',bottom:'40px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
 document.body.append(box);
 window.__fixtureLayout=new app.dhx.Layout(box,{type:'line',cols:cells.map(id=>({id}))});
},cells);
const inFixture=(page,selector)=>page.locator('#toolkit-fixture '+selector);
// The fixture box is hidden (still mounted) while the shell's theme selector is used.
const toggleTheme=async(page,name)=>{
 await page.evaluate(()=>{const box=document.getElementById('toolkit-fixture');if(box)box.style.visibility='hidden';});
 await page.getByRole('button',{name:/^(Skyblue|Világos|Éjjeli)$/}).click();await page.getByRole('menuitem',{name,exact:true}).click();
 await page.evaluate(()=>{const box=document.getElementById('toolkit-fixture');if(box)box.style.visibility='';});
};

test('Calendar and DiagramEditor mount in a project Layout cell, follow the theme and release everything on destroy',async({page})=>{
 // Two framework views, two theme switches and a menu navigation in one test.
 test.setTimeout(90000);
 const failures=errors(page);await start(page);
 // Wide enough that the half-width diagram cell keeps a usable canvas beside its side lists.
 await page.setViewportSize({width:1800,height:1000});
 const created=(await api(page,'topology','create',null,{name:prefix+' komponens'})).body.data.id;
 try{
  await layout(page);
  await page.evaluate(()=>{
   const C=window.__bladeApp.components,cells=window.__fixtureLayout;
   window.__calendar=new C.Calendar({view:'signage_schedule'});window.__calendar.mount(cells.getCell('calendar'));
   window.__editor=new C.DiagramEditor({view:'topology'});window.__editor.mount(cells.getCell('diagram'));
   window.__saved=0;window.__editor.on('saved',()=>window.__saved++);
  });
  await expect(inFixture(page,'.blade-calendar .dhx_cal_data')).toBeVisible();
  await expect(inFixture(page,'.dhx_cal_event').filter({hasText:'Reggeli lista'}).first()).toBeVisible();
  await expect(inFixture(page,'.blade-diagram-surface')).toBeVisible();
  // No event form is open: the calendar holds no input (its editing() is what the built-in kind reports).
  expect(await page.evaluate(()=>window.__calendar.editing())).toBe(false);
  // One Scheduler per page (Standard edition): a second Calendar is refused while the first exists.
  expect(await page.evaluate(()=>{try{new window.__bladeApp.components.Calendar({view:'signage_schedule'});return 'created';}catch(error){return error.message;}})).toMatch(/only one Calendar/);
  expect(await page.evaluate(()=>{try{new window.__bladeApp.components.DiagramEditor({view:'missing_view'});return 'created';}catch(error){return error.message;}})).toMatch(/not offered/);
  // The editor works like the built-in view: add an element (palette double-click, as diagram.spec.cjs), Ctrl+S
  // saves, `saved` fires and editing() follows.
  await inFixture(page,'.blade-diagram-list').getByText(prefix+' komponens',{exact:true}).click();
  await expect(inFixture(page,'.blade-diagram-summary__name')).toHaveText(prefix+' komponens');
  await expect(inFixture(page,'.blade-diagram-node')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__editor.editing())).toBe(false);
  await inFixture(page,'.blade-diagram-palette__item').first().dblclick();
  await expect(inFixture(page,'.blade-diagram-node')).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>window.__editor.editing())).toBe(true);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.blade-toast',{hasText:'A diagram elmentve.'})).toBeVisible();
  expect(await page.evaluate(()=>[window.__saved,window.__editor.editing()])).toEqual([1,false]);
  // Theme: the Scheduler skin follows the shell theme while mounted.
  await toggleTheme(page,'Éjjeli');await expect(page.locator('html')).toHaveAttribute('data-scheduler-theme','dark');
  await toggleTheme(page,'Skyblue');await expect(page.locator('html')).not.toHaveAttribute('data-scheduler-theme','dark');
  // Destroy: widgets leave the cells, the cells hold nothing, events and shortcuts stop.
  await page.evaluate(()=>{window.__calendar.destroy();window.__editor.destroy();window.__calendar.destroy();});
  await expect(inFixture(page,'.blade-calendar')).toHaveCount(0);await expect(inFixture(page,'.blade-diagram-surface')).toHaveCount(0);
  expect(await page.evaluate(()=>[window.__fixtureLayout.getCell('calendar').getWidget()??null,window.__fixtureLayout.getCell('diagram').getWidget()??null])).toEqual([null,null]);
  let saves=0;page.on('request',r=>{try{if(r.postDataJSON()?.action==='save')saves++;}catch{}});
  await page.keyboard.press('Control+s');await page.waitForTimeout(300);expect(saves).toBe(0);
  expect(await page.evaluate(()=>{try{window.__editor.mount(document.body);return 'mounted';}catch(error){return error.message;}})).toMatch(/destroyed/);
  await page.evaluate(()=>{window.__fixtureLayout.destructor();document.getElementById('toolkit-fixture').remove();});
  // The Scheduler was released: the built-in calendar kind (the same component) opens with its events.
  await openMenu(page,'Műsorterv','Digitális kijelző');
  await expect(page.locator('.blade-calendar .dhx_cal_data')).toBeVisible();
  await expect(page.locator('.dhx_cal_event').filter({hasText:'Reggeli lista'}).first()).toBeVisible();
  expect(failures).toEqual([]);
 }finally{await api(page,'topology','delete',created).catch(()=>{});}
});

test('Calendar and DiagramEditor mount in app.ui windows; closing or destroying releases them',async({page})=>{
 const failures=errors(page);await start(page);
 await page.evaluate(()=>{
  const app=window.__bladeApp;
  window.__win=app.ui.window({title:'Naptár komponens',width:1100,height:720,fit:false});
  window.__calendar=new app.components.Calendar({view:'signage_schedule',signal:window.__win.signal});window.__calendar.mount(window.__win);
 });
 const win=page.locator('.blade-content-window').filter({hasText:'Naptár komponens'});
 await expect(win.locator('.blade-calendar .dhx_cal_data')).toBeVisible();
 await expect(win.locator('.dhx_cal_event').filter({hasText:'Reggeli lista'}).first()).toBeVisible();
 // Closing the window destroys the calendar with it: a new Calendar may be created afterwards.
 await page.evaluate(()=>window.__win.close());await expect(win).toHaveCount(0);await expect(page.locator('.blade-calendar')).toHaveCount(0);
 expect(await page.evaluate(()=>{const c=new window.__bladeApp.components.Calendar({view:'signage_schedule'});c.destroy();return true;})).toBe(true);
 await page.evaluate(()=>{
  const app=window.__bladeApp;
  window.__win=app.ui.window({title:'Diagram komponens',width:1100,height:720,fit:false});
  window.__editor=new app.components.DiagramEditor({view:'topology'});window.__editor.mount(window.__win);
 });
 const editorWin=page.locator('.blade-content-window').filter({hasText:'Diagram komponens'});
 await expect(editorWin.locator('.blade-diagram-surface')).toBeVisible();
 await expect(editorWin.locator('.blade-diagram-list').getByText('Irodai hálózat',{exact:true})).toBeVisible();
 // Destroying the component empties the window; the window itself belongs to its creator.
 await page.evaluate(()=>window.__editor.destroy());
 await expect(editorWin).toBeVisible();await expect(editorWin.locator('.blade-diagram-surface')).toHaveCount(0);
 await page.evaluate(()=>window.__win.close());await expect(editorWin).toHaveCount(0);
 expect(failures).toEqual([]);
});

test('components follow a language switch (the page reloads in the new language)',async({page})=>{
 await start(page);
 try{
  await page.getByRole('button',{name:'Magyar',exact:true}).click();await page.getByText('English',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await loaded(page);
  await page.evaluate(()=>{
   const app=window.__bladeApp;
   window.__win=app.ui.window({title:'Calendar component',width:1100,height:720,fit:false});
   new app.components.Calendar({view:'signage_schedule',signal:window.__win.signal}).mount(window.__win);
  });
  const win=page.locator('.blade-content-window').filter({hasText:'Calendar component'});
  await expect(win.getByRole('button',{name:'New event',exact:true})).toBeVisible();
  await page.evaluate(()=>window.__win.close());await expect(win).toHaveCount(0);
  await page.evaluate(()=>{
   const app=window.__bladeApp;
   window.__win=app.ui.window({title:'Diagram component',width:1100,height:720,fit:false});
   new app.components.DiagramEditor({view:'topology',signal:window.__win.signal}).mount(window.__win);
  });
  const editorWin=page.locator('.blade-content-window').filter({hasText:'Diagram component'});
  await expect(editorWin.getByRole('button',{name:'New diagram',exact:true})).toBeVisible();
  await expect(editorWin).toContainText('Diagrams');
  await page.evaluate(()=>window.__win.close());
 }finally{
  // Back to Hungarian: the account keeps the choice and other specs expect the default.
  // The shell's own language command, independent of any window left open by a failure.
  await page.evaluate(async()=>{
   const csrf=document.querySelector('#blade-command input[name="csrf"]').value;
   await fetch('./',{method:'POST',body:new URLSearchParams({action:'language',csrf,locale:'hu'})});
  });
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','hu');
 }
});

test('app.uploads opens the shared uploader for the demo files target and reports upload:* events',async({page})=>{
 const failures=errors(page);await start(page);
 const root=(await api(page,'files','tree','a')).body.data.root;
 const folder=await api(page,'files','create_directory',root,{name:prefix+' feltöltés'});expect(folder.status).toBe(200);
 const target=String(folder.body.data.id);
 // A malformed call is a TypeError and opens nothing.
 expect(await page.evaluate(()=>{try{window.__bladeApp.uploads.open({resource:'files',action:'upload',target:null,targetLabel:'x'});return 'opened';}catch(error){return error.name;}})).toBe('TypeError');
 const uploader=page.getByRole('dialog').filter({has:page.locator('.blade-uploader')});
 await expect(uploader).toBeHidden();
 await page.evaluate(([target,label])=>{
  const app=window.__bladeApp,policy=app.viewDefinition('files').options.upload.policy;
  window.__events=[];window.__uploaded=[];
  for(const name of ['upload:queued','upload:started','upload:progress','upload:file-done','upload:file-failed','upload:complete','upload:cancelled'])
   app.events.on(name,payload=>window.__events.push([name,payload.file?.name??null,payload.file?.target??null]));
  app.uploads.open({resource:'files',action:'upload',target,targetLabel:label,policy});
 },[target,'Drive A:/'+prefix+' feltöltés']);
 await expect(uploader).toBeVisible();await expect(uploader).toContainText(prefix+' feltöltés');
 // Files given to open() queue at once for that target.
 const name=prefix+'-komponens.txt';
 await page.evaluate(([target,name])=>{
  const app=window.__bladeApp,policy=app.viewDefinition('files').options.upload.policy;
  app.uploads.open({resource:'files',action:'upload',target,targetLabel:'Drive A:/fixture',policy,
   files:[new File(['61ade toolkit components'],name,{type:'text/plain'})],onUploaded:result=>window.__uploaded.push(result)});
 },[target,name]);
 await expect.poll(()=>page.evaluate(()=>window.__events.map(([event])=>event))).toContain('upload:complete');
 const events=await page.evaluate(()=>window.__events);
 for(const event of ['upload:queued','upload:started','upload:file-done'])expect(events).toContainEqual([event,name,target]);
 expect(events.some(([event])=>event==='upload:file-failed'||event==='upload:cancelled')).toBe(false);
 await expect.poll(()=>page.evaluate(()=>window.__uploaded.length)).toBe(1);
 expect(await page.evaluate(()=>window.__uploaded[0].succeeded.map(file=>file.name))).toEqual([name]);
 const listed=(await api(page,'files','list',target)).body.data.items;expect(listed.map(item=>item.name)).toContain(name);
 // reopen() shows the same queue again after the window was closed.
 await uploader.getByRole('button',{name:'Bezárás',exact:true}).click();await expect(uploader).toBeHidden();
 await page.evaluate(()=>window.__bladeApp.uploads.reopen());await expect(uploader).toBeVisible();
 await expect(uploader.locator('.blade-uploader__file',{hasText:name})).toBeVisible();
 await uploader.getByRole('button',{name:'Bezárás',exact:true}).click();
 expect(failures).toEqual([]);
});

/** The seeded demo image in the Signage mount root (signage demo); nothing is created for the file components. */
const IMAGE='Kézműves kávé, lassú reggelek.png',IMAGE_SEARCH='Kézműves kávé';
async function demoImage(page){
 const root=(await api(page,'files','tree','signage')).body.data.root;
 return String((await api(page,'files','list',root,{search:IMAGE_SEARCH})).body.data.items.find(item=>item.name===IMAGE).id);
}
const fileRow=(scope,name)=>scope.locator('.dhx_grid-row').filter({has:scope.page().getByRole('gridcell',{name,exact:true})});
const viewer=page=>page.getByRole('dialog').filter({has:page.locator('.blade-document__bar')}).last();

test('FileManager mounts in a project Layout cell, reports opened, follows the theme and releases its windows on destroy',async({page})=>{
 test.setTimeout(90000);
 const failures=errors(page);await start(page);
 const image=await demoImage(page);
 await layout(page,['files']);
 await page.evaluate(()=>{
  const C=window.__bladeApp.components;
  window.__files=new C.FileManager({view:'files'});window.__opened=[];
  window.__files.on('opened',file=>window.__opened.push(file));
  window.__files.mount(window.__fixtureLayout.getCell('files'));
 });
 const left=inFixture(page,'[data-cell-id="panel-0"]');
 await expect(left.locator('.dhx_grid-row').first()).toBeVisible();
 await expect(inFixture(page,'[data-cell-id="panel-1"] .dhx_grid-row').first()).toBeVisible();
 // A view that is not offered is an Error, a view of another kind a TypeError.
 expect(await page.evaluate(()=>{try{new window.__bladeApp.components.FileManager({view:'missing_view'});return 'created';}catch(error){return error.message;}})).toMatch(/not offered/);
 expect(await page.evaluate(()=>{try{new window.__bladeApp.components.FileManager({view:'signage_schedule'});return 'created';}catch(error){return error.name;}})).toBe('TypeError');
 // The panels work like the built-in view: another mount, the viewer on double-click, `opened` with id and type.
 await left.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Signage',exact:true}).click();
 await expect(left.locator('.dhx_layout-cell-header__title').first()).toHaveText('Signage:/');
 // The Signage root holds all demo media: the panel search keeps the image among the rendered rows.
 await left.getByRole('textbox',{name:'Keresés',exact:true}).fill(IMAGE_SEARCH);
 await fileRow(left,IMAGE).dblclick();
 await expect(viewer(page).getByRole('img',{name:IMAGE})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.__opened)).toEqual([{id:image,mimeType:'image/png'}]);
 await viewer(page).getByRole('button',{name:/close/i}).click();await expect(viewer(page)).toHaveCount(0);
 // editing(): the viewer holds no input; an open rename form (F2) does until it closes.
 expect(await page.evaluate(()=>window.__files.editing())).toBe(false);
 await fileRow(left,IMAGE).click();await page.keyboard.press('F2');
 const rename=page.getByRole('dialog',{name:'Átnevezés'});await expect(rename).toBeVisible();
 expect(await page.evaluate(()=>window.__files.editing())).toBe(true);
 await rename.getByRole('button',{name:'Mégse',exact:true}).click();await expect(rename).toHaveCount(0);
 expect(await page.evaluate(()=>window.__files.editing())).toBe(false);
 // Theme: the panels repaint with the Suite theme variables while mounted.
 const color=()=>left.locator('.dhx_grid-cell').first().evaluate(element=>getComputedStyle(element).color);
 const light=await color();
 await toggleTheme(page,'Éjjeli');await expect.poll(color).not.toBe(light);
 await toggleTheme(page,'Skyblue');await expect.poll(color).toBe(light);
 // Destroy with the viewer open: the window goes with the component, the cell holds nothing, events stop.
 await fileRow(left,IMAGE).dblclick();await expect(viewer(page)).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.__opened.length)).toBe(2);
 await page.evaluate(()=>{window.__files.destroy();window.__files.destroy();});
 await expect(viewer(page)).toHaveCount(0);await expect(inFixture(page,'.blade-file-panels')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__fixtureLayout.getCell('files').getWidget()??null)).toBeNull();
 expect(await page.evaluate(()=>{try{window.__files.mount(document.body);return 'mounted';}catch(error){return error.message;}})).toMatch(/destroyed/);
 expect(await page.evaluate(()=>window.__opened.length)).toBe(2);
 await page.evaluate(()=>{window.__fixtureLayout.destructor();document.getElementById('toolkit-fixture').remove();});
 // In an app.ui window: closing the window destroys the component (its signal).
 await page.evaluate(()=>{
  const app=window.__bladeApp;
  window.__win=app.ui.window({title:'Fájlkezelő komponens',width:1200,height:760,fit:false});
  window.__files=new app.components.FileManager({view:'files',signal:window.__win.signal});window.__files.mount(window.__win);
 });
 const win=page.locator('.blade-content-window').filter({hasText:'Fájlkezelő komponens'});
 await expect(win.locator('[data-cell-id="panel-0"] .dhx_grid-row').first()).toBeVisible();
 await page.evaluate(()=>window.__win.close());await expect(win).toHaveCount(0);
 expect(await page.evaluate(()=>{try{window.__files.mount(document.body);return 'mounted';}catch(error){return error.message;}})).toMatch(/destroyed/);
 expect(failures).toEqual([]);
});

test('FilePicker.pick resolves the chosen demo image as a MediaDescriptor, and null on Cancel, Escape and abort',async({page})=>{
 const failures=errors(page);await start(page);
 const image=await demoImage(page);
 // The file field of the signage asset form (Signage mount, images and videos).
 await page.evaluate(async()=>{
  const app=window.__bladeApp,{fields}=await app.server.form('signage_assets','create');
  window.__field=fields.find(field=>field.type==='file');
  window.__pick=options=>{window.__result='pending';app.components.FilePicker.pick({field:window.__field.file,title:window.__field.label,...options}).then(media=>{window.__result=media;});};
  window.__pick({});
 });
 const result=()=>page.evaluate(()=>window.__result);
 const box=page.getByRole('dialog',{name:/^Fájl kiválasztása: /});
 await expect(box.locator('.blade-grid-tile').first()).toBeVisible();
 const find=box.getByRole('textbox',{name:'Keresés',exact:true});await expect(find).toBeFocused();
 await find.fill(IMAGE_SEARCH);await find.press('Enter');
 await expect(box.locator('.blade-grid-tile')).toHaveCount(1);
 await box.locator('.blade-grid-tile').filter({hasText:IMAGE}).dblclick();
 await expect(box).toHaveCount(0);
 await expect.poll(result).not.toBe('pending');
 const media=await result();
 expect(Object.keys(media).sort()).toEqual(['duration_ms','height','id','mime_type','name','revision','thumbnail','width']);
 expect(media).toMatchObject({id:image,name:IMAGE,mime_type:'image/png',width:1672,height:941,duration_ms:null});
 expect(media.revision).toMatch(/^\d+$/);expect(['ready','pending','failed','none']).toContain(media.thumbnail);
 // `current` preselects the file; Cancel resolves null.
 await page.evaluate(id=>window.__pick({current:id}),image);
 await expect(box.locator('.blade-grid-tile').first()).toBeVisible();
 await expect(box.getByRole('button',{name:'Kiválasztás',exact:true})).toBeEnabled();
 await box.getByRole('button',{name:'Mégse',exact:true}).click();await expect(box).toHaveCount(0);
 await expect.poll(result).toBeNull();
 // Escape resolves null.
 await page.evaluate(()=>window.__pick({}));await expect(box.locator('.blade-grid-tile').first()).toBeVisible();
 await expect(box.getByRole('textbox',{name:'Keresés',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(box).toHaveCount(0);await expect.poll(result).toBeNull();
 // Aborting the signal closes the picker and resolves null; an aborted signal opens nothing.
 await page.evaluate(()=>{window.__abort=new AbortController();window.__pick({signal:window.__abort.signal});});
 await expect(box).toBeVisible();await page.evaluate(()=>window.__abort.abort());
 await expect(box).toHaveCount(0);await expect.poll(result).toBeNull();
 await page.evaluate(()=>window.__pick({signal:AbortSignal.abort()}));await expect.poll(result).toBeNull();await expect(box).toHaveCount(0);
 // A malformed field configuration throws a TypeError before anything opens.
 expect(await page.evaluate(()=>{try{window.__bladeApp.components.FilePicker.pick({field:{resource:'files'},title:'x'});return 'opened';}catch(error){return error.name;}})).toBe('TypeError');
 await expect(box).toHaveCount(0);
 expect(failures).toEqual([]);
});

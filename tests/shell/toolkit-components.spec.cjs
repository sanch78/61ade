const {test,expect}=require('../../tools/playwright-test.cjs');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,api}=require('./feature-demo.cjs');
// Toolkit P3 C-2 (docs/toolkit.md#components, #uploads): the public Calendar and DiagramEditor components and
// app.uploads, driven from a project module on the managed feature demo. The module is a test fixture: the spec
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
/** A project Layout over the workspace: cells `calendar` and `diagram`. */
const layout=page=>page.evaluate(()=>{
 const app=window.__bladeApp,box=document.createElement('div');
 box.id='toolkit-fixture';Object.assign(box.style,{position:'fixed',left:'16px',right:'16px',top:'110px',bottom:'40px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
 document.body.append(box);
 window.__fixtureLayout=new app.dhx.Layout(box,{type:'line',cols:[{id:'calendar'},{id:'diagram'}]});
});
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
  await expect(inFixture(page,'.dhx_cal_event').filter({hasText:'Reggeli promó'}).first()).toBeVisible();
  await expect(inFixture(page,'.blade-diagram-surface')).toBeVisible();
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
  await expect(page.locator('.dhx_cal_event').filter({hasText:'Reggeli promó'}).first()).toBeVisible();
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
 await expect(win.locator('.dhx_cal_event').filter({hasText:'Reggeli promó'}).first()).toBeVisible();
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

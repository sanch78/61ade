const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openView}=require('./feature-demo.cjs');
// Location bar (docs/shell.md#location-bar, FB-0217) on the feature demo: the menu path, a record page's path and
// record title, the task page's own levels (setLocation), collapse and the phone form, in every factory theme and a skin;
// a record page with a declared parent (the note page under its task, FB-0224).
// The run seeds its own tasks and notes (one of them for a task that does not exist) and removes them.
const prefix='lb'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'web';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const title=`${prefix} feladat`,long=`${prefix} `+'nagyon hosszú feladatcím, amely a helysávban nem fér ki egészen '.repeat(2);
const noteText=`${prefix} jegyzet a helysávhoz`,orphanText=`${prefix} jegyzet egy nem létező feladathoz`;
test.describe.configure({mode:'serial'});
let task='',longTask='',note='',orphan='';
const cleanup=()=>php(`
 $db->exec("DELETE FROM demo_task_notes WHERE task_id IN (SELECT CAST(id AS TEXT) FROM demo_tasks WHERE title LIKE '${prefix}%') OR body LIKE '${prefix}%'");
 $db->exec("DELETE FROM demo_tasks WHERE title LIKE '${prefix}%'");`);
test.beforeAll(()=>{
 cleanup();
 [task,longTask,note,orphan]=php(`
  $ids=[];$notes=[];foreach(['${title}',${JSON.stringify(long)}] as $title){$db->prepare("INSERT INTO demo_tasks(owner_id,title) VALUES ('1',?)")->execute([$title]);$ids[]=$t=$db->lastInsertId();
  $db->prepare("INSERT INTO demo_task_notes(owner_id,task_id,body) VALUES ('1',?,?)")->execute([(string)$t,'${noteText}']);$notes[]=$db->lastInsertId();}
  $db->prepare("INSERT INTO demo_task_notes(owner_id,task_id,body) VALUES ('1','0',?)")->execute(['${orphanText}']);
  echo implode(',',[...$ids,$notes[0],$db->lastInsertId()]);`).trim().split(',');
});
test.afterAll(cleanup);

const bar=page=>page.getByRole('navigation',{name:'Hely',exact:true});
const levels=page=>bar(page).locator('li');
const texts=async page=>(await levels(page).allInnerTexts()).map(text=>text.trim());
const errorsOf=page=>{const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;};
async function joined(page){
 const row=await page.locator('.blade-navigation-row').boundingBox(),location=await page.locator('.blade-location-row').boundingBox();
 expect(Math.abs(row.y+row.height-location.y)).toBeLessThanOrEqual(0.5);
 expect(location.width).toBeCloseTo(row.width,0);
}
async function noScroll(page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await bar(page).locator('ol').evaluate(list=>list.scrollWidth<=list.clientWidth+1)).toBe(true);
}

test('list view: menu path, no bar on the empty workspace, every factory theme',async({page})=>{
 const errors=errorsOf(page);
 await page.setViewportSize({width:1366,height:900});
 for(const theme of ['blade','blade-night','light','dark']){
  await page.goto('/');
  await page.evaluate(theme=>localStorage.setItem('blade-theme',theme),theme);
  await signIn(page);
  await expect(page.locator('html')).toHaveAttribute('data-blade-theme',theme);
  await expect(bar(page)).toBeHidden();
  await openView(page,'Feladatok');
  await expect(bar(page)).toBeVisible();
  expect(await texts(page)).toEqual(['Feature demó','Feladatok']);
  await expect(bar(page).locator('[aria-current="page"]')).toHaveText('Feladatok');
  await expect(bar(page).locator('a, button')).toHaveCount(0);
  await joined(page);
  expect(await page.title()).toMatch(/^Feladatok · /);
  await page.context().clearCookies();
 }
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
 expect(errors).toEqual([]);
});

test('application skin keeps the bar joined',async({page})=>{
 // The skin account is offered no view: its stylesheet and marker over the demo account's light base.
 await page.setViewportSize({width:1366,height:900});
 await page.goto('/');
 await page.evaluate(()=>localStorage.setItem('blade-theme','light'));
 await signIn(page,'demo@example.test','/#view=demo_tasks');
 await page.addStyleTag({url:'/skins/demo-slate.css'});
 await page.evaluate(()=>{document.documentElement.dataset.bladeSkin='demo-slate';localStorage.removeItem('blade-theme');});
 await expect(bar(page)).toBeVisible();
 await joined(page);
 const [row,location]=await Promise.all(['.blade-navigation-row','.blade-location-row'].map(selector=>page.locator(selector).evaluate(e=>getComputedStyle(e).backgroundColor)));
 expect(row).toBe('rgb(228, 231, 235)');
 expect(location).toBe(row);
});

test('record page: source path, record title, in-page levels, links, reload and Back',async({page})=>{
 const errors=errorsOf(page);
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${task}`);
 await expect(bar(page)).toBeVisible();
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Feladatok',title,'Munka']);
 await expect(bar(page).getByRole('link',{name:'Feladatok',exact:true})).toHaveAttribute('href','#view=demo_tasks');
 await expect(bar(page).locator('[aria-current="page"]')).toHaveText('Munka');
 // A note selected inside the page: only the bar changes; the tab and the selection stay.
 const work=page.getByRole('tabpanel',{name:'Munka',exact:true});
 await work.locator('.dhx_grid-row').first().click();
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Feladatok',title,'Munka',`${prefix} jegyzet a helysávhoz`]);
 await expect(work.locator('.dhx_grid-row.dhx_grid-selected-row, .dhx_grid-row[aria-selected="true"]')).toHaveCount(1);
 // Another tab, then the task's button returns to the first one (onSelect).
 await page.getByRole('tab',{name:'Vázlat',exact:true}).click();
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Feladatok',title,'Vázlat']);
 await bar(page).getByRole('button',{name:title,exact:true}).click();
 await expect(page.getByRole('tab',{name:'Munka',exact:true})).toHaveAttribute('aria-selected','true');
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Feladatok',title,'Munka',`${prefix} jegyzet a helysávhoz`]);
 // Reload keeps the default path; the link opens the source list; Back returns.
 await page.reload();
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Feladatok',title,'Munka']);
 await bar(page).getByRole('link',{name:'Feladatok',exact:true}).click();
 await expect(page).toHaveURL(/#view=demo_tasks$/);
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Feladatok']);
 await page.goBack();
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Feladatok',title,'Munka']);
 // A long-lived window over the page leaves the bar unchanged.
 await page.getByRole('menuitem',{name:/^Munkaasztal/}).click();
 await expect(page.locator('.dhx_window').last()).toBeVisible();
 expect(await texts(page)).toEqual(['Feature demó','Feladatok',title,'Munka']);
 expect(errors).toEqual([]);
});

test('record page of the asset viewer: record_title without project location',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 const asset=await page.evaluate(async()=>{
  const csrf=JSON.parse(document.getElementById('blade-config').textContent).csrf;
  const response=await fetch('?blade=1',{method:'POST',headers:{'Content-Type':'application/json','X-BLADE-CSRF':csrf},body:JSON.stringify({resource:'signage_assets',action:'list',values:{limit:1}})});
  const row=(await response.json()).data.items[0];return {id:String(row.id),title:String(row.title)};
 });
 await page.goto(`/#view=demo.asset-viewer&record=${asset.id}`);
 await expect.poll(()=>texts(page)).toEqual(['Digitális kijelző','Médiatár',asset.title]);
 await expect(bar(page).locator('li').first().locator('.blade-location__icon')).toHaveCount(1);
});

// A record view with a parent (FB-0224): the note page declares `parent: {field: task_id, view: demo.task-page}`. Once
// the task (resolved from the note's row) has arrived, the bar starts at the task page's menu path and shows the task as
// a link before the note; the menu marker follows it. Before that, and without a resolved parent, the note's own path.
const marker=page=>page.locator('.blade-navigation-row .dhx_menu-nav > li.blade-menu-current');
const callOf=request=>{try{return JSON.parse(request.postData()??'')??{};}catch{return {};}};
const parentGet=request=>{const call=callOf(request);return call.resource==='demo_tasks'&&call.action==='get';};
const notePath=['Feature demó','Feladatok',title,noteText];
for(const [width,height] of [[1366,900],[390,844]])test(`record page with a parent at ${width} px: direct link, reload, the parent link, Back and Forward`,async({page})=>{
 const errors=errorsOf(page),phone=width<768;
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.task-note&record=${note}`);
 const shown=phone?['…',title,noteText]:notePath;
 await expect.poll(()=>texts(page)).toEqual(shown);
 await page.reload();
 await expect.poll(()=>texts(page)).toEqual(shown);
 expect(await page.title()).toMatch(new RegExp(`^${noteText} · `));
 const parent=bar(page).getByRole('link',{name:title,exact:true});
 await expect(parent).toHaveAttribute('href',`#view=demo.task-page&record=${task}`);
 if(phone){
  // The task is the back link; the … menu holds the root's menu path.
  await expect(parent).toHaveClass(/blade-location__back/);
  await noScroll(page);
  await bar(page).getByRole('button',{name:'További szintek',exact:true}).click();
  expect((await page.getByRole('menu',{name:'További szintek'}).getByRole('menuitem').allInnerTexts()).map(text=>text.trim())).toEqual(['Feature demó','Feladatok']);
  await page.keyboard.press('Escape');
 }else await expect(bar(page).getByRole('link',{name:'Feladatok',exact:true})).toHaveAttribute('href','#view=demo_tasks');
 await parent.click();
 await expect(page).toHaveURL(new RegExp(`#view=demo\\.task-page&record=${task}$`));
 await expect.poll(()=>texts(page)).toEqual(phone?['…',title,'Munka']:['Feature demó','Feladatok',title,'Munka']);
 // The task page's guide opens on its first opening; the fixture's handler closes it before the history steps.
 await expect(page.locator('.blade-guide-window')).toHaveCount(0);
 await page.goBack();
 await expect(page).toHaveURL(new RegExp(`#view=demo\\.task-note&record=${note}$`));
 await expect.poll(()=>texts(page)).toEqual(shown);
 await page.goForward();
 await expect.poll(()=>texts(page)).toEqual(phone?['…',title,'Munka']:['Feature demó','Feladatok',title,'Munka']);
 expect(errors).toEqual([]);
});

test('record page with a parent: opened from the task page, the menu marker of the resolved parent',async({page})=>{
 const errors=errorsOf(page);
 await page.setViewportSize({width:1920,height:900});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${task}`);
 await expect(marker(page)).toHaveText([/^Feature demó/]);
 // The task's `get` is held: until it arrives the note page shows its own path (the note with its view's icon; the note
 // view has no menu source) and no marker.
 let release,holds=0;const held=new Promise(resolve=>{release=resolve;});
 await page.route(url=>url.search==='?blade=1',async route=>{if(parentGet(route.request())){holds++;await held;}await route.fallback();});
 try{
  // The notes list activates the note page (`activate: view:demo.task-note`).
  await page.getByRole('tabpanel',{name:'Munka',exact:true}).locator('.dhx_grid-row').first().dblclick();
  await expect(page).toHaveURL(new RegExp(`#view=demo\\.task-note&record=${note}$`));
  await expect.poll(()=>holds).toBe(1);
  await expect.poll(()=>texts(page)).toEqual([noteText]);
  await expect(bar(page).locator('.blade-location__icon.bi-sticky')).toHaveCount(1);
  await expect(marker(page)).toHaveCount(0);
 }finally{release();}
 await expect.poll(()=>texts(page)).toEqual(notePath);
 await expect(marker(page)).toHaveText([/^Feature demó/]);
 await expect(page.locator('.blade-record-details')).toContainText(noteText);
 expect(errors).toEqual([]);
});

test('record page with a parent the actor cannot read: the chain stops there, without a dialog',async({page})=>{
 const errors=errorsOf(page);
 await page.setViewportSize({width:1920,height:900});
 // The parent record does not exist (its `get` fails): no parent is resolved, so the task and its menu path are left
 // out: the note's own path, with its view's icon, and no marker.
 const failed=page.waitForResponse(response=>parentGet(response.request()));
 await signIn(page,'demo@example.test',`/#view=demo.task-note&record=${orphan}`);
 expect((await (await failed).json()).ok).toBe(false);
 await expect.poll(()=>texts(page)).toEqual([orphanText]);
 await expect(bar(page).locator('.blade-location__icon.bi-sticky')).toHaveCount(1);
 await expect(marker(page)).toHaveCount(0);
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 // The parent's record view is not offered (fixture: the bootstrap without it, as for an actor without its `get`): the
 // note's own path only, with its view's icon, and no marker.
 await page.goto(`/#view=demo.task-note&record=${note}`);
 await expect.poll(()=>texts(page)).toEqual(notePath);
 await page.route(url=>url.pathname==='/',async route=>{
  if(route.request().method()!=='GET'||route.request().resourceType()!=='document')return route.fallback();
  const response=await route.fetch(),html=await response.text();
  await route.fulfill({response,body:html.replace(/(<script[^>]*id="blade-config"[^>]*>)([\s\S]*?)(<\/script>)/,(_,open,json,close)=>{
   const config=JSON.parse(json);config.views=config.views.filter(view=>view.id!=='demo.task-page');
   return open+JSON.stringify(config).replace(/</g,'\\u003c')+close;
  })});
 });
 await page.reload();
 await expect(bar(page)).toBeVisible();
 await expect.poll(()=>texts(page)).toEqual([noteText]);
 await expect(bar(page).locator('.blade-location__icon.bi-sticky')).toHaveCount(1);
 await expect(marker(page)).toHaveCount(0);
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 expect(errors).toEqual([]);
});

for(const [width,height] of [[1366,900],[390,844]])test(`overflow at ${width} px`,async({page})=>{
 const errors=errorsOf(page);
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${longTask}`);
 await expect(bar(page)).toBeVisible();
 if(width<768){
  // Phone: the parent as a back link and the current level, the rest in the … menu.
  await expect.poll(()=>texts(page)).toEqual(['…',long.trim(),'Munka']);
  await expect(bar(page).locator('.blade-location__back')).toHaveCount(1);
 }else{
  await page.getByRole('tabpanel',{name:'Munka',exact:true}).locator('.dhx_grid-row').first().click();
  await expect.poll(async()=>(await texts(page)).length).toBeLessThan(5);
  const shown=await texts(page);
  expect(shown[0]).toBe('Feature demó');
  expect(shown).toContain('…');
  expect(shown[shown.length-1]).toBe(`${prefix} jegyzet a helysávhoz`);
 }
 await noScroll(page);
 const more=bar(page).getByRole('button',{name:'További szintek',exact:true});
 await more.click();
 const menu=page.getByRole('menu',{name:'További szintek'});
 await expect(menu).toBeVisible();
 const entries=(await menu.getByRole('menuitem').allInnerTexts()).map(text=>text.trim());
 expect(entries[0]).toBe(width<768?'Feature demó':'Feladatok');
 await menu.getByRole('menuitem',{name:'Feladatok'}).click();
 await expect(page).toHaveURL(/#view=demo_tasks$/);
 expect(errors).toEqual([]);
});

test('a page path of its own (setLocation from root): the whole bar, a link to a filtered list, back to the menu path',async({page})=>{
 const errors=errorsOf(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 await openView(page,'Médiaböngésző');
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Médiaböngésző']);
 await page.locator('.dhx_grid-row').filter({hasText:'Éjszakai komp a ködben'}).first().locator('[data-dhx-col-id="title"]').click();
 // The page's segments replace the menu path: the list, the channel as a filtered link, the sheet.
 await expect.poll(()=>texts(page)).toEqual(['Médialapok','Kijelző','Éjszakai komp a ködben']);
 await expect(levels(page).first().locator('.dhx_navbar-item__icon, [class*="bi-"]').first()).toBeAttached();
 await expect(page).toHaveTitle(/^Éjszakai komp a ködben · /);
 const channel=bar(page).getByRole('link',{name:'Kijelző',exact:true});
 await expect(channel).toHaveAttribute('href',/view=demo_media_sheets&filter\.channel=display/);
 await channel.click();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
 await expect.poll(()=>texts(page)).toEqual(['Feature demó','Médialapok']);
 // Only the sheets of that channel are listed.
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:'Kézműves kávé, lassú reggelek'})).toHaveCount(0);
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:'Éjszakai komp a ködben'}).first()).toBeVisible();
 expect(errors).toEqual([]);
});

test('English names',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${longTask}`);
 await expect(bar(page)).toBeVisible();
 const language=locale=>page.evaluate(async locale=>{
  const csrf=document.querySelector('#blade-command input[name="csrf"]').value;
  await fetch('./',{method:'POST',body:new URLSearchParams({action:'language',csrf,locale})});
 },locale);
 await language('en');
 await page.reload();
 try{
  await expect(page.getByRole('navigation',{name:'Location',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'More levels',exact:true})).toBeVisible();
 }finally{await language('hu');}
});

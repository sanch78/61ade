const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openView}=require('./feature-demo.cjs');
// Location bar (docs/shell.md#location-bar, FB-0217) on the feature demo: the menu path, a record page's path and
// record title, the task page's own levels (setLocation), collapse and the phone form, in every factory theme and a skin.
// The run seeds its own tasks and notes and removes them.
const prefix='lb'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'web';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const title=`${prefix} feladat`,long=`${prefix} `+'nagyon hosszú feladatcím, amely a helysávban nem fér ki egészen '.repeat(2);
test.describe.configure({mode:'serial'});
let task='',longTask='';
const cleanup=()=>php(`
 $db->exec("DELETE FROM demo_task_notes WHERE task_id IN (SELECT CAST(id AS TEXT) FROM demo_tasks WHERE title LIKE '${prefix}%')");
 $db->exec("DELETE FROM demo_tasks WHERE title LIKE '${prefix}%'");`);
test.beforeAll(()=>{
 cleanup();
 [task,longTask]=php(`
  $ids=[];foreach(['${title}',${JSON.stringify(long)}] as $title){$db->prepare("INSERT INTO demo_tasks(owner_id,title) VALUES ('1',?)")->execute([$title]);$ids[]=$t=$db->lastInsertId();
  $db->prepare("INSERT INTO demo_task_notes(owner_id,task_id,body) VALUES ('1',?,?)")->execute([(string)$t,'${prefix} jegyzet a helysávhoz']);}
  echo implode(',',$ids);`).trim().split(',');
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

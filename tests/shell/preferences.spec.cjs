const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView,view}=require('./feature-demo.cjs');
const path=require('node:path'),{execFileSync}=require('node:child_process');
// UI preferences (browser storage) and view URLs on the feature demo's Feladatok view.
test('view URL restores through login/reload and browser history; #feature= opens no view',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // The view address survives the sign-in; the removed #feature= form leaves the empty workspace.
 await signIn(page,'demo@example.test','/#feature=demo_tasks');
 await expect(page.locator('.blade-navigation-row')).toBeVisible();await expect(page.getByRole('grid')).toHaveCount(0);
 await expect(page).toHaveURL(/#feature=demo_tasks$/);
 await page.goto('/#view=demo_tasks');
 await expect(page.getByRole('grid')).toBeVisible();await expect(page).toHaveURL(/#view=demo_tasks$/);
 await page.reload();await expect(page.getByRole('grid')).toBeVisible();
 await page.goto('/');await expect(page.getByRole('grid')).toHaveCount(0);
 await openView(page,'Feladatok');
 await expect(page).toHaveURL(/#view=demo_tasks$/);
 await expect(page.getByRole('grid')).toBeVisible();
 await page.goBack();await expect(page.getByRole('grid')).toHaveCount(0);
 await page.goForward();await expect(page.getByRole('grid')).toBeVisible();
 await page.goto('/#view=unavailable');await expect(page.getByRole('grid')).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('grid size, sorting, view and panel width survive reload',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 await signIn(page,'demo@example.test','/#view=demo_tasks');
 const header=page.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Megnevezés'}).first();
 await expect(header).toBeVisible();await header.click();
 await expect(header).toHaveAttribute('aria-sort','ascending');
 const before=await header.boundingBox();
 await page.mouse.move(before.x+before.width-2,before.y+before.height/2);
 await page.mouse.down();await page.mouse.move(before.x+before.width+80,before.y+before.height/2,{steps:8});await page.mouse.up();
 const width=(await header.boundingBox()).width;
 expect(width).toBeGreaterThan(before.width+40);
 const filter=page.locator('[data-cell-id="filter"]');
 const panel=await filter.boundingBox();
 await page.mouse.move(panel.x+panel.width+6,panel.y+panel.height/2);await page.mouse.down();
 await page.mouse.move(panel.x+panel.width+66,panel.y+panel.height/2,{steps:8});await page.mouse.up();
 const panelWidth=(await filter.boundingBox()).width;
 expect(panelWidth).toBeGreaterThan(panel.width+30);
 await page.reload();await expect(header).toHaveAttribute('aria-sort','ascending');
 await expect.poll(async()=>Math.round((await header.boundingBox()).width)).toBe(Math.round(width));
 await expect.poll(async()=>Math.round((await filter.boundingBox()).width)).toBe(Math.round(panelWidth));
 await filter.getByRole('button',{name:/ összecsukása$/}).click();
 await page.reload();
 await filter.getByRole('button',{name:/ kinyitása$/}).click();
 await expect.poll(async()=>Math.round((await filter.boundingBox()).width)).toBe(Math.round(panelWidth));
 const cards=page.locator('.blade-grid-card');
 await view(page,'Kártyák');
 await page.reload();await expect(cards.first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.reload();
 await page.setViewportSize({width:1280,height:720});
 await expect(cards.first()).toBeVisible();
 await view(page,'Táblázat');
 await page.setViewportSize({width:390,height:844});await page.reload();
 await page.setViewportSize({width:1280,height:720});
 await expect(page.getByRole('grid')).toBeVisible();await expect(cards).toHaveCount(0);
});
test('invalid or unavailable storage cannot break navigation',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage disabled');};Storage.prototype.setItem=()=>{throw new Error('Storage disabled');};});
 await signIn(page,'demo@example.test','/#view=demo_tasks');await expect(page.getByRole('grid')).toBeVisible();
 await page.reload();await expect(page.getByRole('grid')).toBeVisible();
});
test('filter values survive reload per user and view; a stale saved value is dropped',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await signIn(page,'demo@example.test','/#view=demo_shelves');
 const rows=page.locator('.dhx_grid-row'),panel=page.locator('.dhx_form').filter({has:page.getByRole('button',{name:'Alaphelyzet',exact:true})});
 await expect(rows.filter({hasText:'Empty shelf'})).toHaveCount(1);
 await panel.getByLabel('Megnevezés',{exact:true}).fill('Top');await panel.getByRole('button',{name:'Szűrés',exact:true}).click();
 await expect(rows.filter({hasText:'Empty shelf'})).toHaveCount(0);
 await page.reload();
 await expect(rows.filter({hasText:'Top shelf'})).toHaveCount(1);await expect(rows.filter({hasText:'Empty shelf'})).toHaveCount(0);
 await expect(panel.getByLabel('Megnevezés',{exact:true})).toHaveValue('Top');
 // Another view keeps its own (empty) filters.
 await openView(page,'Raktárzónák');await expect(rows).toHaveCount(3);
 // A saved select value the definitions no longer offer is ignored: the list loads unfiltered, without an error.
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('"demo_shelves"')){const state=JSON.parse(localStorage.getItem(key));state.filters={zone_id:'999'};localStorage.setItem(key,JSON.stringify(state));}});
 await page.goto('/#view=demo_shelves');await expect(rows.filter({hasText:'Empty shelf'})).toHaveCount(1);
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 expect(errors).toEqual([]);
});
// Server-side user preferences (docs/user-preferences-plan.md), on an account no other spec's settings depend on.
test.describe('account preferences',()=>{
 const email='reader@example.test',size={width:1366,height:800};
 const config=page=>page.evaluate(()=>JSON.parse(document.querySelector('#blade-config').textContent));
 const entries=async page=>(await config(page)).preferences.entries;
 const isSave=response=>response.url().includes('blade=1')&&(response.request().postData()??'').includes('"action":"__preferences"');
 const post=(page,values)=>page.evaluate(async values=>{const {csrf,preferences}=JSON.parse(document.querySelector('#blade-config').textContent);
  const body=values.reset?values:{generation:preferences.generation,...values};
  const response=await fetch('./?blade=1',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-BLADE-CSRF':csrf},body:JSON.stringify({resource:'',action:'__preferences',id:null,values:body})});return response.status;},values);
 // A project module that exposes `app`, for the `app.preferences` checks.
 const exposeApp=async context=>{const MODULE='/preferences-fixture.js';
  await context.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',body:'export default app=>{window.__bladeApp=app;};'}));
  await context.route(url=>url.pathname==='/'&&!url.searchParams.has('blade'),async route=>{const request=route.request();if(request.method()!=='GET'||request.resourceType()!=='document')return route.fallback();
   const response=await route.fetch();const body=(await response.text()).replace(/(<script type="application\/json" id="blade-config">)([\s\S]*?)(<\/script>)/,(all,start,json,end)=>{const value=JSON.parse(json);if(!value.authenticated)return all;value.modules=[...(value.modules??[]),MODULE];return start+JSON.stringify(value).replace(/</g,'\\u003c')+end;});
   await route.fulfill({response,body});});};
 const scope=(page,run,...args)=>page.evaluate(([source,args])=>new Function('store','args','return ('+source+')(store,...args)')(window.__bladeApp.preferences.scope('demo.account-check'),args),[run.toString(),args]);
 const ready=page=>page.waitForFunction(()=>!!window.__bladeApp);
 const open=async(browser,viewport=size,init,account=email,setup)=>{const context=await browser.newContext({accountPreferences:true,viewport});if(init)await context.addInitScript(init);if(setup)await setup(context);const page=await context.newPage();
  await signIn(page,account,'/#view=demo_tasks');await expect(page.locator('.blade-navigation-row')).toBeVisible();if(setup)await page.reload();return {context,page};};
 const theme=async(page,from,to)=>{await page.locator('.blade-navigation-control').getByRole('button',{name:from,exact:true}).click();await page.getByRole('menuitem',{name:to,exact:true}).click();};
 // The test account starts without a row (generation 0) and leaves none behind.
 const clear=()=>{const root=path.resolve(__dirname,'../..'),file=path.join(process.env.BLADE_TMP_DIR||path.join(root,'tmp'),process.env.BLADE_DEMO_INSTANCE||'web','features.sqlite');
  execFileSync(process.env.BLADE_PHP||'php8.4',['-r','$d=new PDO("sqlite:".$argv[1]);$d->exec("PRAGMA busy_timeout=5000");$d->prepare("DELETE FROM blade_user_preferences WHERE actor_id IN (SELECT CAST(id AS TEXT) FROM accounts WHERE email=?)")->execute([$argv[2]]);',file,email]);};
 const account=async page=>{const fresh=await page.context().newPage();await fresh.goto('/');const value=await entries(fresh);await fresh.close();return value;};
 const savedBy=(page,status=200)=>page.waitForResponse(response=>isSave(response)&&response.status()===status);
 test.beforeEach(clear);test.afterEach(clear);

 test('a value and the theme follow the account into a fresh browser, without a theme flash',async({browser})=>{
  const first=await open(browser);const header=first.page.locator('[role="columnheader"][data-dhx-id="title"]').first();await expect(header).toBeVisible();
  const sorted=first.page.waitForResponse(isSave);await header.click();await expect(header).toHaveAttribute('aria-sort','ascending');await sorted;
  const saved=first.page.waitForResponse(isSave);await theme(first.page,'Blade','Éjjeli');await saved;await first.context.close();
  // The theme is on the root when the application's first element appears.
  const second=await open(browser,size,()=>{window.themes=[];new MutationObserver(()=>{const value=document.documentElement.dataset.bladeTheme;if(document.querySelector('#blade-application > *')&&window.themes.at(-1)!==value)window.themes.push(value);}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['data-blade-theme']});});
  await expect(second.page.locator('[role="columnheader"][data-dhx-id="title"]').first()).toHaveAttribute('aria-sort','ascending');
  await second.page.reload();await expect(second.page.locator('html')).toHaveAttribute('data-blade-theme','dark');
  expect(await second.page.evaluate(()=>window.themes)).toEqual(['dark']);expect(await second.page.evaluate(()=>localStorage.getItem('blade-theme'))).toBe('dark');
  await second.context.close();
 });
 test('column widths are kept separately at 1366 and 390 px',async({browser})=>{
  const wide=await open(browser);const header=wide.page.locator('[role="columnheader"][data-dhx-id="title"]').first();await expect(header).toBeVisible();const before=await header.boundingBox();
  const saved=wide.page.waitForResponse(isSave);await wide.page.mouse.move(before.x+before.width-2,before.y+before.height/2);await wide.page.mouse.down();await wide.page.mouse.move(before.x+before.width+80,before.y+before.height/2,{steps:8});await wide.page.mouse.up();await saved;
  const width=Math.round((await header.boundingBox()).width);await wide.context.close();
  const phone=await open(browser,{width:390,height:844});let stored=await entries(phone.page);
  expect(stored['demo_tasks|wide'].columns.find(column=>column.id==='title')).toBeTruthy();expect(stored['demo_tasks|narrow']).toBeUndefined();
  expect(await post(phone.page,{set:{'demo_tasks|narrow':{columns:[{id:'title',width:123}]}}})).toBe(200);await phone.page.reload();stored=await entries(phone.page);
  expect(stored['demo_tasks|narrow'].columns[0].width).toBe(123);await phone.context.close();
  const again=await open(browser);await expect.poll(async()=>Math.round((await again.page.locator('[role="columnheader"][data-dhx-id="title"]').first().boundingBox()).width)).toBe(width);await again.context.close();
 });
 test('browser values go up once and fill only',async({browser})=>{
  const server=await open(browser);const {userId}=await config(server.page);expect(await post(server.page,{set:{'@theme':'light'}})).toBe(200);await server.context.close();
  const key='blade-ui:1:'+JSON.stringify(['/',userId,'demo_tasks']);
  const context=await browser.newContext({accountPreferences:true,viewport:size});
  await context.addInitScript(([key])=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem(key,JSON.stringify({mode:'cards'}));localStorage.setItem('blade-theme','dark');}},[key]);
  const page=await context.newPage();const filled=page.waitForResponse(response=>isSave(response)&&response.request().postData().includes('"fill":true'));
  await signIn(page,email,'/#view=demo_tasks');await filled;
  await expect.poll(()=>page.evaluate(user=>localStorage.getItem('blade-prefs-migrated:1:'+JSON.stringify(['/',user])),userId)).toBe('1');
  let repeated=false;page.on('request',request=>{if((request.postData()??'').includes('"fill":true'))repeated=true;});
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-blade-theme','light');
  const stored=await entries(page);expect(stored['@theme']).toBe('light');expect(stored.demo_tasks.mode).toBe('cards');expect(repeated).toBe(false);await context.close();
 });
 test('reset is offered at 390 px and without a theme selector',async({browser})=>{
  const phone=await open(browser,{width:390,height:844});await phone.page.locator('.blade-navigation-control').getByRole('button',{name:'Beállítások',exact:true}).click();
  await phone.page.getByRole('menuitem',{name:'Blade',exact:true}).click();await expect(phone.page.getByRole('menuitem',{name:'Beállításaim visszaállítása',exact:true})).toBeVisible();
  expect(await phone.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await phone.context.close();
  const single=await open(browser,size,undefined,'skin@example.test');await single.page.locator('.blade-navigation-control').getByRole('button',{name:'Beállítások',exact:true}).click();
  await expect(single.page.getByRole('menuitem',{name:'Beállításaim visszaállítása',exact:true})).toBeVisible();await single.context.close();
 });
 test('a change made just before leaving the page reaches the account',async({browser})=>{
  const first=await open(browser,size,undefined,email,exposeApp);await ready(first.page);const delivered=first.page.waitForRequest(request=>(request.postData()??'').includes('"action":"__preferences"')&&request.postData().includes('leaving'));
  await scope(first.page,store=>store.set('leaving',1));await first.page.goto('about:blank');await delivered;await first.context.close();
  await expect.poll(async()=>{const next=await open(browser);const value=(await entries(next.page))['scope:demo.account-check'];await next.context.close();return value;},{timeout:15000}).toEqual({leaving:1});
 });
 test('two tabs see each other\'s store and both changes are saved',async({browser})=>{
  const {context,page}=await open(browser,size,undefined,email,exposeApp);await ready(page);const other=await context.newPage();await other.goto('/#view=demo_tasks');await ready(other);
  expect(await scope(page,store=>{const loop={};loop.self=loop;store.set('loop',loop);store.set('big',1n);return 'kept';})).toBe('kept');
  await scope(page,store=>store.set('a',1));await expect.poll(()=>scope(other,store=>store.get('a'))).toBe(1);
  await scope(other,store=>store.set('b',2));await expect.poll(()=>scope(page,store=>store.get('b'))).toBe(2);expect(await scope(page,store=>store.get('a'))).toBe(1);
  await expect.poll(async()=>{const fresh=await context.newPage();await fresh.goto('/');const value=(await entries(fresh))['scope:demo.account-check'];await fresh.close();return value;},{timeout:15000}).toEqual({a:1,b:2});await context.close();
 });
 test('for one entry the latest edit wins, also after another device changed it',async({browser})=>{
  const laptop=await open(browser,size,undefined,email,exposeApp),phone=await open(browser,{width:390,height:844},undefined,email,exposeApp);await ready(laptop.page);await ready(phone.page);
  for(const [page,value] of [[laptop.page,'laptop'],[phone.page,'phone'],[laptop.page,'laptop again']]){const saved=savedBy(page);await scope(page,(store,value)=>store.set('x',value),value);await saved;}
  expect((await account(phone.page))['scope:demo.account-check']).toEqual({x:'laptop again'});await laptop.context.close();await phone.context.close();
 });
 test('a reset stops old tabs, a queued page-hide save and an unmigrated device',async({browser})=>{
  test.setTimeout(90000);
  const old=await open(browser,size,undefined,email,exposeApp);await ready(old.page);const queued=await old.context.newPage();await queued.goto('/#view=demo_tasks');await ready(queued);
  const {userId}=await config(old.page);
  // The reset is the row's first write, so it also proves a reset with no prior row.
  const other=await open(browser);expect((await config(other.page)).preferences.generation).toBe(0);expect(await post(other.page,{reset:true})).toBe(200);await other.page.reload();expect((await config(other.page)).preferences.generation).toBe(1);
  const refused=savedBy(old.page,409);await scope(old.page,store=>store.set('late',1));await refused;let again=0;old.page.on('request',request=>{if((request.postData()??'').includes('later'))again++;});await scope(old.page,store=>store.set('later',1));await old.page.waitForTimeout(1500);expect(again).toBe(0);
  const hidden=queued.waitForRequest(request=>(request.postData()??'').includes('hidden'));await scope(queued,store=>store.set('hidden',1));await queued.goto('about:blank');await hidden;await old.page.waitForTimeout(500);
  await other.page.reload();expect((await entries(other.page))['scope:demo.account-check']).toBeUndefined();
  // The browser test budget holds few processes: the earlier contexts close before the next one opens.
  await other.context.close();await old.context.close();
  const key='blade-ui:1:'+JSON.stringify(['/',userId,'scope:demo.account-check']);
  const device=await browser.newContext({accountPreferences:true,viewport:size});await device.addInitScript(key=>localStorage.setItem(key,'{"stale":1}'),key);const page=await device.newPage();let filled=0;page.on('request',request=>{if((request.postData()??'').includes('"fill":true'))filled++;});
  await signIn(page,email,'/#view=demo_tasks');await expect(page.locator('.blade-navigation-row')).toBeVisible();await page.waitForTimeout(1000);expect(filled).toBe(0);expect((await entries(page))['scope:demo.account-check']).toBeUndefined();
  await device.close();
 });
 test('a change that never reached the server is gone on the next page',async({browser})=>{
  const {context,page}=await open(browser,size,undefined,email,exposeApp);await ready(page);
  // In the page, so the keepalive save of the closing page cannot get past it either.
  await page.evaluate(()=>{const send=window.fetch;window.refused=0;window.fetch=(url,init)=>typeof init?.body==='string'&&init.body.includes('"action":"__preferences"')?(window.refused++,Promise.reject(new TypeError('offline'))):send.call(window,url,init);});
  await scope(page,store=>store.set('unsaved',1));await expect.poll(()=>page.evaluate(()=>window.refused),{timeout:5000}).toBeGreaterThan(0);await page.close();
  const next=await context.newPage();await next.goto('/#view=demo_tasks');await ready(next);expect(await scope(next,store=>store.get('unsaved'))).toBeUndefined();expect((await entries(next))['scope:demo.account-check']).toBeUndefined();await context.close();
 });
 test('a failed save is retried without an error, and reset clears the account',async({browser})=>{
  const {context,page}=await open(browser);let refused=0;
  const route=async intercepted=>{if((intercepted.request().postData()??'').includes('"action":"__preferences"')){refused++;await intercepted.abort();}else await intercepted.fallback();};
  await page.route('**/?blade=1',route);await theme(page,'Blade','Világos');await expect.poll(()=>refused,{timeout:8000}).toBeGreaterThan(1);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);await page.unroute('**/?blade=1',route);
  await expect.poll(async()=>{const fresh=await page.context().newPage();await fresh.goto('/');const value=(await entries(fresh))['@theme'];await fresh.close();return value;},{timeout:20000}).toBe('light');
  await page.reload();await theme(page,'Világos','Beállításaim visszaállítása');
  const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();const reloaded=page.waitForEvent('load');await dialog.getByRole('button',{name:'Visszaállítás',exact:true}).click();await reloaded;
  await expect(page.locator('html')).toHaveAttribute('data-blade-theme','blade');expect(await entries(page)).toEqual({});await context.close();
 });
});

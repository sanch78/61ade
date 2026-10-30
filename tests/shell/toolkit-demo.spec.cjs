const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView}=require('./feature-demo.cjs');
// Toolkit D0/D6 (docs/demos.md#toolkit-consumer): the feature demo (/) is a toolkit consumer and loads its built
// project module app/demo.js once, versioned, without a module error; the starter admin (/admin/) and the tenant demo
// (/tenants/) stay declarative and request no project module.
const MODULE_ERROR='Egy alkalmazásmodul nem indult el';
function watch(page){
 const seen={scripts:[],failures:[],errors:[]};
 page.on('request',request=>{if(request.resourceType()==='script')seen.scripts.push(new URL(request.url()));});
 page.on('console',message=>{if(message.type()==='error'&&message.text().includes('61ade: application module'))seen.failures.push(message.text());});
 page.on('pageerror',error=>seen.errors.push(error.message));
 return seen;
}
const bootstrap=page=>page.evaluate(()=>JSON.parse(document.getElementById('blade-config').textContent));

test('the feature demo imports its project module once with the version suffix and starts without a module error',async({page})=>{
 const seen=watch(page);
 const loaded=page.waitForResponse(response=>new URL(response.url()).pathname==='/app/demo.js');
 await signIn(page);
 expect((await loaded).status()).toBe(200);
 const config=await bootstrap(page);
 expect(config.version).not.toBe('');
 expect(config.modules).toEqual([`app/demo.js?v=${encodeURIComponent(config.version)}`]);
 // The first route waits for the module loader, so a working menu and list mean the loader has settled.
 await openView(page,'Feladatok');
 const module=seen.scripts.filter(url=>url.pathname==='/app/demo.js');
 expect(module.map(url=>url.search)).toEqual([`?v=${encodeURIComponent(config.version)}`]);
 await expect(page.locator('.blade-toast',{hasText:MODULE_ERROR})).toHaveCount(0);
 expect(seen.failures).toEqual([]);expect(seen.errors).toEqual([]);
});

for(const [path,email,title] of [['/admin/','demo@example.test','61ade alapadmin'],['/tenants/','single@example.test','61ade tenant demó']]){
 test(`${path} stays declarative and requests no project module`,async({page})=>{
  const seen=watch(page);
  await signIn(page,email,path);
  await expect(page.locator('.blade-session-bar')).toContainText(title);
  await expect(page.locator('.blade-navigation-row .dhx_menu-nav > li').first()).toBeVisible();
  const config=await bootstrap(page);
  expect(config.authenticated).toBe(true);expect(config).not.toHaveProperty('modules');
  // Only the framework bundle under assets/ is a script; nothing below app/ or any other project path.
  expect(seen.scripts.filter(url=>!url.pathname.startsWith('/assets/')).map(url=>url.pathname)).toEqual([]);
  await expect(page.locator('.blade-toast',{hasText:MODULE_ERROR})).toHaveCount(0);
  expect(seen.failures).toEqual([]);expect(seen.errors).toEqual([]);
 });
}

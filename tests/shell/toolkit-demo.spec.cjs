const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView}=require('./feature-demo.cjs');
const fs=require('node:fs');const path=require('node:path');
// Toolkit D0/D6 (docs/demos.md#toolkit-consumer): the feature demo (/) is a toolkit consumer and loads its built
// project module app/demo.js once, keyed by the file, without a module error; the starter admin (/admin/) and the
// tenant demo (/tenants/) stay declarative and request no project module. Cache keys (docs/toolkit.md#cache-keys) are
// `?v=<base36 mtime>-<base36 size>` of the served file, also for admin.js; the hand-bumped `?v=32` is gone.
const MODULE_ERROR='Egy alkalmazásmodul nem indult el';
const PUBLIC=path.join(__dirname,'../../examples/demo-app/public');
const fileKey=file=>{const stat=fs.statSync(path.join(PUBLIC,file));return Math.floor(stat.mtimeMs/1000).toString(36)+'-'+stat.size.toString(36);};
const KEY=/^\?v=[0-9a-z]+-[0-9a-z]+$/;
function watch(page){
 const seen={scripts:[],failures:[],errors:[]};
 page.on('request',request=>{if(request.resourceType()==='script')seen.scripts.push(new URL(request.url()));});
 page.on('console',message=>{if(message.type()==='error'&&message.text().includes('61ade: application module'))seen.failures.push(message.text());});
 page.on('pageerror',error=>seen.errors.push(error.message));
 return seen;
}
const bootstrap=page=>page.evaluate(()=>JSON.parse(document.getElementById('blade-config').textContent));

test('the feature demo imports its project module once with its file key and starts without a module error',async({page})=>{
 const seen=watch(page);
 const loaded=page.waitForResponse(response=>new URL(response.url()).pathname==='/app/demo.js');
 await signIn(page);
 expect((await loaded).status()).toBe(200);
 const config=await bootstrap(page);
 expect(config.version).not.toBe('');
 expect(config.modules).toEqual([`app/demo.js?v=${fileKey('app/demo.js')}`]);
 // The first route waits for the module loader, so a working menu and list mean the loader has settled.
 await openView(page,'Feladatok');
 const module=seen.scripts.filter(url=>url.pathname==='/app/demo.js');
 expect(module.map(url=>url.search)).toEqual([`?v=${fileKey('app/demo.js')}`]);
 // The framework bundle is keyed by its served file too, never by the old hand-bumped ?v=32.
 const bundle=seen.scripts.filter(url=>url.pathname==='/assets/admin.js').map(url=>url.search);
 expect(bundle.length).toBeGreaterThan(0);expect(new Set(bundle)).toEqual(new Set([`?v=${fileKey('assets/admin.js')}`]));
 expect(bundle[0]).toMatch(KEY);
 // The module's built stylesheet (`stylesheets`): linked once, keyed by its file, after admin.css.
 const links=await page.locator('link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
 expect(links.filter(href=>href.startsWith('app/demo.css'))).toEqual([`app/demo.css?v=${fileKey('app/demo.css')}`]);
 expect(links.findIndex(href=>href.startsWith('app/demo.css'))).toBeGreaterThan(links.findIndex(href=>href.includes('admin.css')));
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
  await expect(page.locator('link[rel="stylesheet"][href*="app/demo.css"]')).toHaveCount(0);
  await expect(page.locator('.blade-toast',{hasText:MODULE_ERROR})).toHaveCount(0);
  expect(seen.failures).toEqual([]);expect(seen.errors).toEqual([]);
 });
}

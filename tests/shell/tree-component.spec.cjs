const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu}=require('./feature-demo.cjs');
// The public Tree component (docs/toolkit.md#tree): the feature demo's key browser (D8, `demo.registry-browser`)
// composes it with tabs of a scoped ListView and RecordDetails, driven only by the tree's `select`; a fixture module
// hands `app` to the page for the component's methods, options and the fallback without the node view. The run adds a
// prefixed key for `refresh` and a reader deny rule for the fallback, and removes both.
const prefix='tc'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const MODULE='/tree-component-fixture.mjs';
const cleanup=()=>php(`$db->exec("DELETE FROM demo_registry_keys WHERE name LIKE '${prefix}%'");
 $db->exec("DELETE FROM blade_rules WHERE resource='demo_registry_keys' AND effect='deny' AND subject_id=(SELECT id FROM accounts WHERE email='reader@example.test')");`);
test.describe.configure({mode:'serial'});
test.beforeAll(cleanup);
test.afterAll(cleanup);

const errors=page=>{const list=[];page.on('pageerror',error=>list.push(error.message));return list;};
const tree=page=>page.getByRole('tree',{name:'Kulcsok',exact:true});
const item=(page,name)=>tree(page).getByRole('treeitem',{name,exact:true});
const values=page=>page.getByRole('tabpanel',{name:'Értékek',exact:true});

async function openBrowser(page){
 await openMenu(page,'Kulcsböngésző','Feature demó');
 await expect(item(page,'HKEY_CURRENT_USER')).toBeVisible();
}

for(const [width,height] of [[1366,900],[390,844]])test(`key browser at ${width} px: tree roles, keys, select drives the list and details, restore`,async({page})=>{
 const failures=errors(page);
 await page.setViewportSize({width,height});
 await signIn(page);
 await openBrowser(page);
 // Tree semantics: one tab stop, levels, the first root selected at first.
 const root=item(page,'HKEY_CURRENT_USER');
 await expect(root).toHaveAttribute('aria-level','1');
 await expect(root).toHaveAttribute('aria-selected','true');
 await expect(root).toHaveAttribute('aria-expanded','false');
 await expect(item(page,'HKEY_LOCAL_MACHINE')).toHaveAttribute('aria-selected','false');
 // Keys: ArrowRight expands (children load), ArrowDown moves the focus, Space selects; Home/End.
 await tree(page).focus();
 await expect(tree(page)).toHaveAttribute('aria-activedescendant',await root.getAttribute('id'));
 await page.keyboard.press('ArrowRight');
 await expect(root).toHaveAttribute('aria-expanded','true');
 await expect(item(page,'Environment')).toHaveAttribute('aria-level','2');
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
 const environment=item(page,'Environment');
 await expect(tree(page)).toHaveAttribute('aria-activedescendant',await environment.getAttribute('id'));
 await expect(environment).toHaveAttribute('aria-selected','false');
 await page.keyboard.press(' ');
 await expect(environment).toHaveAttribute('aria-selected','true');
 await expect(values(page)).toContainText('TEMP');
 await expect(values(page)).not.toContainText('Wallpaper');
 await page.keyboard.press('End');
 await expect(tree(page)).toHaveAttribute('aria-activedescendant',await item(page,'HKEY_LOCAL_MACHINE').getAttribute('id'));
 await page.keyboard.press('Home');
 await expect(tree(page)).toHaveAttribute('aria-activedescendant',await root.getAttribute('id'));
 // A click selects too: Desktop below Control Panel.
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');
 await item(page,'Desktop').click();
 await expect(item(page,'Desktop')).toHaveAttribute('aria-selected','true');
 await expect(item(page,'Desktop')).toHaveAttribute('aria-level','3');
 await expect(values(page)).toContainText('Wallpaper');
 // The list's selection drives the value details.
 const value=page.locator('[data-cell-id="value"]');
 // On a phone the value panel starts collapsed below the tabs: its header opens it.
 if(width<768)await value.locator('.dhx_layout-cell-header').first().click();
 await values(page).getByText('Wallpaper',{exact:true}).click();
 await expect(value).toContainText('C:\\Users\\Demo\\Pictures\\aurora.jpg');
 // Enter activates: the key's data tab opens.
 await tree(page).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('tab',{name:'Kulcs adatai',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tabpanel',{name:'Kulcs adatai',exact:true})).toContainText('Desktop');
 await page.getByRole('tab',{name:'Értékek',exact:true}).click();
 // ArrowLeft goes to the parent, then collapses it.
 await tree(page).focus();await page.keyboard.press('ArrowLeft');
 await expect(tree(page)).toHaveAttribute('aria-activedescendant',await item(page,'Control Panel').getAttribute('id'));
 await page.keyboard.press('ArrowRight');
 // Restored on the next mount: the expanded keys and the selection.
 await page.reload();
 await expect(item(page,'Desktop')).toHaveAttribute('aria-selected','true');
 await expect(item(page,'Control Panel')).toHaveAttribute('aria-expanded','true');
 await expect(values(page)).toContainText('Wallpaper');
 expect(failures).toEqual([]);
});

/** Serves the fixture module and declares it in the signed-in bootstrap. */
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
async function start(page,email='demo@example.test'){
 await fixture(page);await page.setViewportSize({width:1366,height:900});await signIn(page,email);
 await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toHaveCount(0);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}
/** A Tree in a fixture box over the workspace; its events are recorded in `window.__treeEvents`. */
const mount=(page,options)=>page.evaluate(options=>{
 const app=window.__bladeApp,box=document.createElement('div');
 box.id='tree-fixture';Object.assign(box.style,{position:'fixed',left:'16px',top:'110px',width:'320px',bottom:'40px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
 document.body.append(box);
 const tree=window.__tree=new app.components.Tree({view:'demo_registry_nodes',label:'name',...options});
 window.__treeEvents=[];
 tree.on('select',({row})=>window.__treeEvents.push(['select',row?.name??null]));
 tree.on('activate',({row})=>window.__treeEvents.push(['activate',row.name]));
 tree.mount(box);
},options);
const events=page=>page.evaluate(()=>window.__treeEvents.splice(0));

test('methods, options and events of the component; the fallback without the node view',async({page})=>{
 const failures=errors(page);
 await start(page);
 // Option checks: a view without a hierarchy, a missing label, a bad initial or key, a view that is not offered.
 const thrown=await page.evaluate(()=>{
  const C=window.__bladeApp.components,attempt=options=>{try{new C.Tree(options);return 'created';}catch(error){return error.constructor.name;}};
  return [attempt({view:'demo_tasks',label:'title'}),attempt({view:'demo_registry_nodes',label:'nope'}),attempt({view:'demo_registry_nodes',label:'parent_id'}),
   attempt({view:'demo_registry_nodes',label:'name',initial:'last'}),attempt({view:'demo_registry_nodes',label:'name',id:'Bad key'}),attempt({view:'not_offered',label:'name'})];
 });
 expect(thrown).toEqual(['TypeError','TypeError','TypeError','TypeError','TypeError','Error']);
 // initial "none": nothing selected, nothing reported.
 await mount(page,{initial:'none'});
 const box=page.locator('#tree-fixture'),node=name=>box.getByRole('treeitem',{name,exact:true});
 await expect(node('HKEY_LOCAL_MACHINE')).toBeVisible();
 expect(await page.evaluate(()=>window.__tree.selected()??null)).toBeNull();
 expect(await events(page)).toEqual([]);
 // select(id): a loaded node selects and reports; an unloaded one returns false and changes nothing.
 const ids=JSON.parse(php(`echo json_encode($db->query("SELECT name,id FROM demo_registry_keys WHERE name IN ('HKEY_LOCAL_MACHINE','SOFTWARE','SYSTEM','Services')")->fetchAll(PDO::FETCH_KEY_PAIR));`),(key,value)=>typeof value==="number"?String(value):value);
 expect(await page.evaluate(id=>window.__tree.select(id),ids.Services)).toBe(false);
 expect(await page.evaluate(id=>window.__tree.select(id),ids.HKEY_LOCAL_MACHINE)).toBe(true);
 expect(await events(page)).toEqual([['select','HKEY_LOCAL_MACHINE']]);
 expect(await page.evaluate(()=>window.__tree.selected().name)).toBe('HKEY_LOCAL_MACHINE');
 // Double-click activates (after selecting).
 await node('HKEY_LOCAL_MACHINE').locator('.dhx_tree-list-item__text, .dhx_tree-template__wrapper').first().dblclick();
 expect((await events(page)).filter(([type])=>type==='activate')).toEqual([['activate','HKEY_LOCAL_MACHINE']]);
 // refresh(id) reloads one level: a key added elsewhere appears; the selection, expansion and focus stay.
 await page.evaluate(id=>window.__tree.select(id),ids.HKEY_LOCAL_MACHINE);
 await box.getByRole('tree').focus();await page.keyboard.press('ArrowRight');
 await expect(node('SOFTWARE')).toBeVisible();
 php(`$db->prepare('INSERT INTO demo_registry_keys(name,parent_id) VALUES (?,?)')->execute(['${prefix} új',(string)${ids.HKEY_LOCAL_MACHINE}]);`);
 await page.evaluate(id=>window.__tree.refresh(id),ids.HKEY_LOCAL_MACHINE);
 await expect(node(`${prefix} új`)).toBeVisible();
 await expect(node('HKEY_LOCAL_MACHINE')).toHaveAttribute('aria-selected','true');
 await expect(box.getByRole('tree')).toBeFocused();
 await expect(box.getByRole('tree')).toHaveAttribute('aria-activedescendant',await node('HKEY_LOCAL_MACHINE').getAttribute('id'));
 // refresh(): the selected node removed elsewhere is reported as no selection.
 const added=php(`echo $db->query("SELECT id FROM demo_registry_keys WHERE name LIKE '${prefix}%'")->fetchColumn();`);
 await events(page);
 expect(await page.evaluate(id=>window.__tree.select(id),added)).toBe(true);
 php(`$db->exec("DELETE FROM demo_registry_keys WHERE name LIKE '${prefix}%'");`);
 await page.evaluate(()=>window.__tree.refresh());
 await expect(node(`${prefix} új`)).toHaveCount(0);
 await expect(node('SOFTWARE')).toBeVisible();
 expect(await events(page)).toEqual([['select',`${prefix} új`],['select',null]]);
 // initial {id}: that node; destroy releases it.
 await page.evaluate(()=>{window.__tree.destroy();document.getElementById('tree-fixture').remove();});
 await mount(page,{initial:{id:ids.HKEY_LOCAL_MACHINE}});
 await expect(node('HKEY_LOCAL_MACHINE')).toHaveAttribute('aria-selected','true');
 expect(await events(page)).toEqual([['select','HKEY_LOCAL_MACHINE']]);
 await page.evaluate(()=>window.__tree.destroy());
 await expect(box.getByRole('tree')).toHaveCount(0);
 expect(failures).toEqual([]);
});

test('an actor without the node view: no view to build the tree from, and no key browser',async({page})=>{
 php(`$reader=$db->query("SELECT id FROM accounts WHERE email='reader@example.test'")->fetchColumn();
  $deny=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'demo_registry_keys',?,'ui','deny','all','','')");
  foreach(['list','get'] as $action)$deny->execute([$reader,$action]);`);
 await start(page,'reader@example.test');
 const result=await page.evaluate(()=>{const app=window.__bladeApp;try{new app.components.Tree({view:'demo_registry_nodes',label:'name'});return 'created';}catch(error){return [error.constructor.name,!!app.viewDefinition('demo_registry_nodes')];}});
 expect(result).toEqual(['Error',false]);
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'Feladatok',exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Kulcsböngésző',exact:true})).toHaveCount(0);
});

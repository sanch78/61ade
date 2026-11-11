const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu}=require('./feature-demo.cjs');
// The public Tree component (docs/toolkit.md#tree): the feature demo's key browser (D8, `demo.registry-browser`)
// composes it with tabs of a scoped ListView and RecordDetails, driven only by the tree's `select`; a fixture module
// hands `app` to the page for the component's methods, options and the fallback without the node view. The run adds
// prefixed keys (for `refresh`, a deep chain and a wide tree for the expansion caps) and reader deny rules (one key, the
// node view), and removes them.
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
/** A command of the tree's control: a button, or an entry of the collapsed `Műveletek` menu. */
async function control(page,scope,name){
 const menu=scope.getByRole('button',{name:/^(Műveletek|Actions)$/});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name,exact:true}).click();}
 else await scope.getByRole('button',{name,exact:true}).click();
}

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
 // The built-in control (expandControl): every level opens (DemoService is level 5), then every node closes; the
 // selection stays (the values list keeps Desktop's values).
 const panel=page.locator('[data-cell-id="tree"]');
 // Two pinned icon buttons (FB-0177): named by their labels, never collapsed into a menu, also on a phone.
 await expect(panel.getByRole('button',{name:/^(Műveletek|Actions)$/})).toHaveCount(0);
 for(const name of ['Mindet kinyit','Mindet bezár'])expect((await panel.getByRole('button',{name,exact:true}).boundingBox()).width).toBeLessThan(48);
 await control(page,panel,'Mindet kinyit');
 await expect(item(page,'DemoService')).toHaveAttribute('aria-level','5');
 await expect(item(page,'Services')).toHaveAttribute('aria-expanded','true');
 await expect(item(page,'Settings')).toHaveAttribute('aria-level','5');
 await control(page,panel,'Mindet bezár');
 await expect(item(page,'HKEY_CURRENT_USER')).toHaveAttribute('aria-expanded','false');
 await expect(item(page,'HKEY_LOCAL_MACHINE')).toHaveAttribute('aria-expanded','false');
 await expect(item(page,'DemoService')).toHaveCount(0);
 await expect(values(page)).toContainText('Wallpaper');
 // Kept like a manual change: everything stays collapsed; the selection below it is not loaded, so `initial` applies.
 await page.reload();
 await expect(item(page,'HKEY_CURRENT_USER')).toHaveAttribute('aria-selected','true');
 await expect(item(page,'HKEY_CURRENT_USER')).toHaveAttribute('aria-expanded','false');
 await expect(item(page,'HKEY_LOCAL_MACHINE')).toHaveAttribute('aria-expanded','false');
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
const mount=(page,options,width=320)=>page.evaluate(([options,width])=>{
 const app=window.__bladeApp,box=document.createElement('div');
 box.id='tree-fixture';Object.assign(box.style,{position:'fixed',left:'16px',top:'110px',width:width+'px',bottom:'40px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
 document.body.append(box);
 const tree=window.__tree=new app.components.Tree({view:'demo_registry_nodes',label:'name',...options});
 window.__treeEvents=[];
 tree.on('select',({row})=>window.__treeEvents.push(['select',row?.name??null]));
 tree.on('activate',({row})=>window.__treeEvents.push(['activate',row.name]));
 tree.mount(box);
},[options,width]);
const unmount=page=>page.evaluate(()=>{window.__tree.destroy();document.getElementById('tree-fixture').remove();});
const events=page=>page.evaluate(()=>window.__treeEvents.splice(0));
/** The account's language (the shell's own form post); a run ends on Hungarian. */
const language=(page,locale)=>page.evaluate(async locale=>{
 const csrf=document.querySelector('#blade-command input[name="csrf"]').value;
 return (await fetch('./',{method:'POST',body:new URLSearchParams({action:'language',csrf,locale})})).status;
},locale);

test('methods, options and events of the component; the fallback without the node view',async({page})=>{
 const failures=errors(page);
 await start(page);
 // Option checks: a view without a hierarchy, a missing label, a bad initial or key, a view that is not offered.
 const thrown=await page.evaluate(()=>{
  const C=window.__bladeApp.components,attempt=options=>{try{new C.Tree(options);return 'created';}catch(error){return error.constructor.name;}};
  return [attempt({view:'demo_tasks',label:'title'}),attempt({view:'demo_registry_nodes',label:'nope'}),attempt({view:'demo_registry_nodes',label:'parent_id'}),
   attempt({view:'demo_registry_nodes',label:'name',initial:'last'}),attempt({view:'demo_registry_nodes',label:'name',id:'Bad key'}),attempt({view:'not_offered',label:'name'}),
   attempt({view:'demo_registry_nodes',label:'name',expand:11}),attempt({view:'demo_registry_nodes',label:'name',expand:1.5}),attempt({view:'demo_registry_nodes',label:'name',expandControl:'yes'})];
 });
 expect(thrown).toEqual(['TypeError','TypeError','TypeError','TypeError','TypeError','Error','TypeError','TypeError','TypeError']);
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

/** The parent of every `list` call of the node resource, in order. */
const lists=page=>{const parents=[];page.on('request',request=>{try{const body=request.postDataJSON();if(body?.resource==='demo_registry_keys'&&body.action==='list')parents.push(body.values.scope.value);}catch{}});return parents;};
const level=(box,name,level)=>box.locator(`[role="treeitem"][aria-level="${level}"][aria-label="${name}"]`);
const keyIds=()=>JSON.parse(php(`echo json_encode($db->query("SELECT name,CAST(id AS TEXT) FROM demo_registry_keys WHERE parent_id='' OR name IN ('Control Panel','Software','SOFTWARE','SYSTEM')")->fetchAll(PDO::FETCH_KEY_PAIR));`));

test('initial expansion depth, the remembered expansion, expandAll, collapseAll and *',async({page})=>{
 const failures=errors(page),parents=lists(page),ids=keyIds();
 await start(page);
 const box=page.locator('#tree-fixture'),options={id:'tc.depth',expand:2};
 // expand: 2 with nothing stored: the roots and their children open; their children load lazily, one list per node
 // with children (roots, HKCU, HKLM, Control Panel, Software, SOFTWARE, SYSTEM: 7 requests; Environment is a leaf).
 await mount(page,options);
 for(const name of ['HKEY_CURRENT_USER','HKEY_LOCAL_MACHINE'])await expect(level(box,name,1)).toHaveAttribute('aria-expanded','true');
 for(const name of ['Control Panel','Software','SOFTWARE','SYSTEM'])await expect(level(box,name,2)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,'Desktop',3)).toBeVisible();
 await expect(level(box,'CurrentControlSet',3)).toHaveAttribute('aria-expanded','false');
 await expect(level(box,'Synthetic Labs',3).first()).toBeVisible();
 await expect(box.getByRole('treeitem',{name:'Services',exact:true})).toHaveCount(0);
 await expect.poll(()=>parents.length).toBe(7);
 expect(new Set(parents)).toEqual(new Set(['',ids.HKEY_CURRENT_USER,ids.HKEY_LOCAL_MACHINE,ids['Control Panel'],ids.Software,ids.SOFTWARE,ids.SYSTEM]));
 expect(await events(page)).toEqual([['select','HKEY_CURRENT_USER']]);
 // The user collapses HKLM: on the next mount the stored expansion wins over the depth, and HKLM stays collapsed.
 await page.evaluate(id=>window.__tree.select(id),ids.HKEY_LOCAL_MACHINE);
 await box.getByRole('tree').focus();await page.keyboard.press('ArrowLeft');
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 await unmount(page);parents.length=0;
 await mount(page,options);
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-selected','true');
 await expect(box.getByRole('treeitem',{name:'SYSTEM',exact:true})).toHaveCount(0);
 // collapseAll: every node closes, the selection and the focus stay; stored, so the next mount opens nothing.
 await box.getByRole('tree').focus();
 await page.evaluate(()=>window.__tree.collapseAll());
 for(const name of ['HKEY_CURRENT_USER','HKEY_LOCAL_MACHINE'])await expect(level(box,name,1)).toHaveAttribute('aria-expanded','false');
 await expect(box.getByRole('treeitem',{name:'Control Panel',exact:true})).toHaveCount(0);
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-selected','true');
 await expect(box.getByRole('tree')).toBeFocused();
 await events(page);
 await unmount(page);await mount(page,options);
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-selected','true');
 for(const name of ['HKEY_CURRENT_USER','HKEY_LOCAL_MACHINE'])await expect(level(box,name,1)).toHaveAttribute('aria-expanded','false');
 // A preference reset (the stored state removed): the depth applies again.
 await unmount(page);await page.evaluate(()=>localStorage.clear());await mount(page,options);
 await expect(level(box,'SYSTEM',2)).toHaveAttribute('aria-expanded','true');
 await events(page);
 // expandAll: every level loads and opens; complete, the selection unchanged (no event), kept for the next mount.
 const total=Number(php(`echo $db->query("SELECT COUNT(*) FROM demo_registry_keys")->fetchColumn();`));
 const result=await page.evaluate(()=>window.__tree.expandAll());
 expect(result).toEqual({complete:true,nodes:total});
 await expect(level(box,'DemoService',5)).toBeVisible();
 await expect(level(box,'Services',4)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,'Settings',5)).toBeVisible();
 expect(await events(page)).toEqual([]);
 expect(await page.evaluate(()=>window.__tree.selected().name)).toBe('HKEY_CURRENT_USER');
 await unmount(page);await mount(page,options);
 await expect(level(box,'DemoService',5)).toBeVisible();
 // * expands the focused node's siblings (one level).
 await page.evaluate(()=>window.__tree.collapseAll());
 await box.getByRole('tree').focus();await page.keyboard.press('Home');await page.keyboard.press('*');
 for(const name of ['HKEY_CURRENT_USER','HKEY_LOCAL_MACHINE'])await expect(level(box,name,1)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-expanded','false');
 await unmount(page);
 expect(failures).toEqual([]);
});

test('the user wins over bulk work: collapseAll before the depth loads, a collapse while it loads; failed loads',async({page})=>{
 const failures=errors(page);
 await start(page);
 // List answers are held back; `fail` makes the root list ("roots") or every child list ("children") fail.
 let delay=0,fail='';
 await page.route(url=>url.searchParams.get('blade')==='1',async route=>{
  let body;try{body=route.request().postDataJSON();}catch{}
  const parent=body?.resource==='demo_registry_keys'&&body.action==='list'?body.values?.scope?.value:undefined;
  if(parent!==undefined&&((fail==='roots'&&parent==='')||(fail==='children'&&parent!=='')))
   return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,error:'Synthetic failure'})});
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  await route.fallback();
 });
 const box=page.locator('#tree-fixture'),tree=box.getByRole('tree'),alert=page.getByRole('alertdialog');
 // collapseAll before the roots arrive cancels the initial expansion: nothing opens.
 delay=600;
 await mount(page,{expand:3,initial:'none'});
 await page.evaluate(()=>window.__tree.collapseAll());
 for(const name of ['HKEY_CURRENT_USER','HKEY_LOCAL_MACHINE'])await expect(level(box,name,1)).toHaveAttribute('aria-expanded','false');
 await expect(tree).not.toHaveAttribute('aria-busy','true');
 await expect(box.getByRole('treeitem',{name:'Control Panel',exact:true})).toHaveCount(0);
 await unmount(page);
 // The user collapses HKLM while the second level still loads: it stays collapsed and is stored; the next mount
 // keeps it collapsed although `expand` is 2.
 delay=1500;
 await mount(page,{id:'tc.yield',expand:2});
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','true',{timeout:10000});
 await expect(tree).toHaveAttribute('aria-busy','true');
 await level(box,'HKEY_LOCAL_MACHINE',1).locator('.dhx_tree-toggle-button').first().click();
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 await expect(tree).not.toHaveAttribute('aria-busy','true',{timeout:15000});
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-expanded','true');
 await unmount(page);delay=0;
 await mount(page,{id:'tc.yield',expand:2});
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 // A stored expanded node below a collapsed one (SYSTEM below HKLM) opens again when HKLM is expanded.
 await level(box,'HKEY_LOCAL_MACHINE',1).locator('.dhx_tree-toggle-button').first().click();
 await expect(level(box,'SYSTEM',2)).toHaveAttribute('aria-expanded','true');
 await level(box,'HKEY_LOCAL_MACHINE',1).locator('.dhx_tree-toggle-button').first().click();
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 await unmount(page);
 // The roots fail: one error dialog; expandAll reports the error; the stored expansion is kept and comes back with
 // the next successful refresh and mount.
 fail='roots';
 await mount(page,{id:'tc.yield',expand:2});
 await expect(alert).toHaveCount(1);
 await alert.getByRole('button',{name:'Rendben',exact:true}).click();
 expect(await page.evaluate(()=>window.__tree.expandAll())).toEqual({complete:false,nodes:0,reason:'error'});
 fail='';
 await page.evaluate(()=>window.__tree.refresh());
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 await unmount(page);await mount(page,{id:'tc.yield',expand:2});
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-expanded','false');
 await unmount(page);
 // Parallel child loads that all fail give one dialog, and expandAll settles with "error" after it.
 await mount(page,{initial:'none'});
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toBeVisible();
 fail='children';
 await page.evaluate(()=>{window.__expansion=undefined;void window.__tree.expandAll().then(result=>{window.__expansion=result;});});
 await expect(alert).toHaveCount(1);
 await page.waitForTimeout(500);
 await expect(alert).toHaveCount(1);
 await alert.getByRole('button',{name:'Rendben',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__expansion?.reason)).toBe('error');
 await expect(alert).toHaveCount(0);
 fail='';
 await unmount(page);
 expect(failures).toEqual([]);
});

test('a selection made while the start loads stays: the depth and a stored expansion',async({page})=>{
 const failures=errors(page);
 await start(page);
 let delay=0;
 await page.route(url=>url.searchParams.get('blade')==='1',async route=>{if(delay)await new Promise(resolve=>setTimeout(resolve,delay));await route.fallback();});
 const box=page.locator('#tree-fixture'),tree=box.getByRole('tree');
 const click=locator=>locator.locator('.dhx_tree-list-item__text, .dhx_tree-template__wrapper').first().click();
 // expand: 2 (initial "first"): the user selects a second-level node while the third level loads; the first root is
 // not selected afterwards, exactly one `select` is reported, and the selection is stored.
 delay=1500;
 await mount(page,{id:'tc.race',expand:2});
 await expect(level(box,'SOFTWARE',2)).toBeVisible({timeout:10000});
 await expect(tree).toHaveAttribute('aria-busy','true');
 await click(level(box,'SOFTWARE',2));
 await expect(tree).not.toHaveAttribute('aria-busy','true',{timeout:15000});
 await page.waitForTimeout(300);
 await expect(level(box,'SOFTWARE',2)).toHaveAttribute('aria-selected','true');
 await expect(level(box,'HKEY_CURRENT_USER',1)).toHaveAttribute('aria-selected','false');
 expect(await events(page)).toEqual([['select','SOFTWARE']]);
 await unmount(page);delay=0;
 await mount(page,{id:'tc.race',expand:2});
 await expect(level(box,'SOFTWARE',2)).toHaveAttribute('aria-selected','true');
 expect(await events(page)).toEqual([['select','SOFTWARE']]);
 await unmount(page);
 // A stored expansion (HKCU, HKLM, SOFTWARE) and selection (HKLM): the user selects Control Panel while SOFTWARE's
 // children still load; the restore opens SOFTWARE without moving the selection back to HKLM.
 await mount(page,{id:'tc.reopen',initial:'none'});
 for(const name of ['HKEY_CURRENT_USER','HKEY_LOCAL_MACHINE'])await level(box,name,1).locator('.dhx_tree-toggle-button').first().click();
 await level(box,'SOFTWARE',2).locator('.dhx_tree-toggle-button').first().click();
 await expect(level(box,'SOFTWARE',2)).toHaveAttribute('aria-expanded','true');
 await click(level(box,'HKEY_LOCAL_MACHINE',1));
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-selected','true');
 await unmount(page);delay=1500;
 await mount(page,{id:'tc.reopen',initial:'none'});
 await expect(level(box,'Control Panel',2)).toBeVisible({timeout:10000});
 await expect(level(box,'SOFTWARE',2)).not.toHaveAttribute('aria-expanded','true');
 await click(level(box,'Control Panel',2));
 await expect(level(box,'SOFTWARE',2)).toHaveAttribute('aria-expanded','true',{timeout:15000});
 await page.waitForTimeout(300);
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-selected','true');
 await expect(level(box,'HKEY_LOCAL_MACHINE',1)).toHaveAttribute('aria-selected','false');
 expect(await events(page)).toEqual([['select','Control Panel']]);
 await unmount(page);delay=0;
 await mount(page,{id:'tc.reopen',initial:'none'});
 await expect(level(box,'Control Panel',2)).toHaveAttribute('aria-selected','true');
 await expect(level(box,'SOFTWARE',2)).toHaveAttribute('aria-expanded','true');
 await unmount(page);
 expect(failures).toEqual([]);
});

test('expansion caps: depth and loaded nodes, reported by the result and the control (English); busy state',async({page})=>{
 const failures=errors(page);
 // A chain of 12 keys below one root (deeper than the 10 opened levels).
 php(`$add=$db->prepare('INSERT INTO demo_registry_keys(name,parent_id) VALUES (?,?)');$parent='';
  for($i=0;$i<12;$i++){$add->execute(['${prefix} d'.$i,$parent]);$parent=(string)$db->lastInsertId();}`);
 await start(page);
 // Each list answer is held back a little, so a running expansion and the busy state can be seen.
 await page.route(url=>url.searchParams.get('blade')==='1',async route=>{await new Promise(resolve=>setTimeout(resolve,150));await route.fallback();});
 const box=page.locator('#tree-fixture');
 await mount(page,{initial:'none'});
 await expect(level(box,`${prefix} d0`,1)).toBeVisible();
 // refresh() and destroy() cancel a running expandAll: it settles as cancelled.
 const later=action=>page.evaluate(async action=>{const running=window.__tree.expandAll();await new Promise(resolve=>setTimeout(resolve,250));
  const refreshed=action==='refresh'?window.__tree.refresh():window.__tree.destroy();const result=await running;await refreshed;return result;},action);
 expect(await later('refresh')).toMatchObject({complete:false,reason:'cancelled'});
 expect(await page.evaluate(()=>window.__tree.expandAll())).toMatchObject({complete:false,reason:'depth'});
 await expect(level(box,`${prefix} d9`,10)).toHaveAttribute('aria-expanded','true');
 await expect(level(box,`${prefix} d10`,11)).toHaveAttribute('aria-expanded','false');
 await unmount(page);
 await mount(page,{initial:'none'});
 await expect(level(box,`${prefix} d0`,1)).toBeVisible();
 expect(await later('destroy')).toMatchObject({complete:false,reason:'cancelled'});
 await page.evaluate(()=>document.getElementById('tree-fixture').remove());
 // A wide root: 3 children with 1000 children each. Loading the second would pass 2000 loaded nodes.
 php(`$db->beginTransaction();$add=$db->prepare('INSERT INTO demo_registry_keys(name,parent_id) VALUES (?,?)');
  $add->execute(['${prefix} w','']);$root=(string)$db->lastInsertId();
  foreach(['a','b','c'] as $part){$add->execute(['${prefix} w'.$part,$root]);$child=(string)$db->lastInsertId();
   for($i=0;$i<1000;$i++)$add->execute(['${prefix} w'.$part.sprintf('%04d',$i),$child]);}
  $db->commit();`);
 try{
  await language(page,'en');
  await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);
  await mount(page,{initial:'none',expandControl:true},420);
  const expand=box.getByRole('button',{name:'Expand all',exact:true});
  await expect(expand).toBeVisible();
  await expect(box.getByRole('button',{name:'Collapse all',exact:true})).toBeVisible();
  // Keyboard: the control is a native toolbar button; Enter starts it, the button keeps the focus.
  await expand.focus();await page.keyboard.press('Enter');
  await expect(box.getByRole('tree')).toHaveAttribute('aria-busy','true');
  await expect(box.getByRole('button',{name:'Loading…',exact:true})).toBeVisible();
  await expect(page.locator('.blade-toast').filter({hasText:'Not everything was expanded: at most 2000 items, 10 levels and 1000 children per item are loaded.'})).toBeVisible({timeout:30000});
  await expect(box.getByRole('tree')).not.toHaveAttribute('aria-busy','true');
  await expect(expand).toBeFocused();
  // Stopped before the load that would pass the cap: wa is open, wb and wc stay collapsed with their children unloaded.
  await expect(level(box,`${prefix} wa`,2)).toHaveAttribute('aria-expanded','true');
  for(const part of ['b','c'])await expect(level(box,`${prefix} w${part}`,2)).toHaveAttribute('aria-expanded','false');
  const result=await page.evaluate(()=>window.__tree.expandAll());
  expect(result).toMatchObject({complete:false,reason:'nodes'});
  expect(result.nodes).toBeLessThanOrEqual(2000);
  expect(result.nodes).toBeGreaterThan(1000);
  await box.getByRole('button',{name:'Collapse all',exact:true}).click();
  await expect(level(box,`${prefix} w`,1)).toHaveAttribute('aria-expanded','false');
  await unmount(page);
 }finally{
  await language(page,'hu');
  php(`$db->exec("DELETE FROM demo_registry_keys WHERE name LIKE '${prefix}%'");`);
 }
 expect(failures).toEqual([]);
});

test('ACL: expandAll and the depth load only readable keys',async({page})=>{
 const ids=keyIds(),parents=lists(page);
 php(`$reader=$db->query("SELECT id FROM accounts WHERE email='reader@example.test'")->fetchColumn();
  $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'demo_registry_keys','list','ui','deny','id',?,'')")->execute([$reader,'${ids.SYSTEM}']);`);
 await start(page,'reader@example.test');
 const box=page.locator('#tree-fixture');
 await mount(page,{expand:10});
 await expect(level(box,'Settings',5)).toBeVisible();
 await expect(level(box,'Synthetic Labs',3).first()).toBeVisible();
 expect(await page.evaluate(()=>window.__tree.expandAll())).toMatchObject({complete:true});
 for(const name of ['SYSTEM','CurrentControlSet','Services','DemoService'])await expect(box.getByRole('treeitem',{name,exact:true})).toHaveCount(0);
 await expect(level(box,'SOFTWARE',2)).toBeVisible();
 expect(parents).not.toContain(ids.SYSTEM);
 php(`$db->exec("DELETE FROM blade_rules WHERE resource='demo_registry_keys' AND effect='deny' AND scope='id'");`);
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

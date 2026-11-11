const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu}=require('./feature-demo.cjs');
// A two-state client command of a list's toolbar (docs/toolkit.md#registries, `type: "toggle"`): the key browser's
// values list (D8) carries `demo.subkey-values`; its page switches the list between two scopes (`key_id`, the key's
// own values, and `parent_key_id`, the values of its subkeys). The state is kept per view whatever the scope, the page
// reads it before the first load, and the collapsed `Műveletek` shows an unpinned toggle as a checked entry (a fixture
// module registers the demo's pinned toggle again without `pinned`; the pinned one is in scoped-list.spec.cjs). The same
// fixture checks the options of FB-0162–FB-0164.
const MODULE='/list-toggle-fixture.mjs';
/** Serves the fixture module (unpins the toggle, hands `app` to the page) and declares it in the signed-in bootstrap. */
async function fixture(page){
 await page.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',
  body:"export default app=>{const entry=app.commands.get('demo.subkey-values');if(entry)app.commands.register('demo.subkey-values',{...entry,pinned:false},{replace:true});window.__bladeApp=app;};"}));
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
const tree=page=>page.getByRole('tree',{name:'Kulcsok',exact:true});
const item=(page,name)=>tree(page).getByRole('treeitem',{name,exact:true});
const values=page=>page.getByRole('tabpanel',{name:'Értékek',exact:true});

/** Opens the key browser and selects Control Panel (no values of its own; its subkey Desktop has three). */
async function controlPanel(page){
 await openMenu(page,'Kulcsböngésző','Feature demó');
 await expect(item(page,'HKEY_CURRENT_USER')).toBeVisible();
 await tree(page).focus();await page.keyboard.press('ArrowRight');
 await item(page,'Control Panel').click();
 await expect(item(page,'Control Panel')).toHaveAttribute('aria-selected','true');
}
/** The values list requests of the page (the scope travels in the list call's filters). */
function listCalls(page){
 const calls=[];
 page.on('request',request=>{const body=request.postData()??'';if(request.method()==='POST'&&body.includes('demo_registry_values'))calls.push(body);});
 return calls;
}

test('toggle in the bar: aria-pressed, the host switches the scope, the state survives the scope change and a reload',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 await controlPanel(page);
 const toggle=values(page).getByRole('button',{name:'Alkulcsok értékei',exact:true});
 await expect(toggle).toHaveAttribute('aria-pressed','false');
 await expect(values(page)).not.toContainText('Wallpaper');
 await toggle.click();
 // The list of the other scope: Desktop's values; its own toggle shows the kept state from the first render.
 await expect(values(page)).toContainText('Wallpaper');
 await expect(values(page).getByRole('button',{name:'Alkulcsok értékei',exact:true})).toHaveAttribute('aria-pressed','true');
 // Push commands are unchanged beside it.
 await values(page).getByText('Wallpaper',{exact:true}).click();
 await expect(values(page).getByRole('button',{name:'Adatok',exact:true})).toBeEnabled();
 // A reload: the first values load already uses the kept mode (no request scoped to the key's own values).
 const calls=listCalls(page);
 await page.reload();
 await expect(values(page)).toContainText('Wallpaper');
 await expect(values(page).getByRole('button',{name:'Alkulcsok értékei',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(calls.length).toBeGreaterThan(0);
 expect(calls.filter(body=>body.includes('"key_id"'))).toEqual([]);
 expect(calls.some(body=>body.includes('"parent_key_id"'))).toBe(true);
 // Off again: the key's own values (none for Control Panel; Desktop has its own).
 await values(page).getByRole('button',{name:'Alkulcsok értékei',exact:true}).click();
 await expect(values(page)).not.toContainText('Wallpaper');
 await tree(page).focus();await page.keyboard.press('ArrowRight');
 await item(page,'Desktop').click();
 await expect(values(page)).toContainText('Wallpaper');
 await expect(values(page).getByRole('button',{name:'Alkulcsok értékei',exact:true})).toHaveAttribute('aria-pressed','false');
 expect(failures).toEqual([]);
});

test('an unpinned toggle in the collapsed Műveletek at 390 px: a checked entry that keeps its state; option checks',async({page})=>{
 await fixture(page);
 await page.setViewportSize({width:390,height:844});
 await signIn(page);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
 // ListView `createDefaults` maps names to strings, `preferencesKey` is a key; a non-boolean `pinned` skips the command.
 const thrown=await page.evaluate(()=>{
  const C=window.__bladeApp.components,attempt=options=>{try{new C.ListView({view:'demo_registry_browser_values',...options}).destroy();return 'created';}catch(error){return error.constructor.name;}};
  return [attempt({createDefaults:{key_id:1}}),attempt({createDefaults:['x']}),attempt({createDefaults:{'Bad name':'1'}}),attempt({preferencesKey:'Bad key'}),attempt({preferencesKey:'x'.repeat(81)}),
   attempt({createDefaults:{key_id:'1'},preferencesKey:'demo.shared'})];
 });
 expect(thrown).toEqual(['TypeError','TypeError','TypeError','TypeError','TypeError','created']);
 await controlPanel(page);
 const entry=()=>page.getByRole('menuitemcheckbox',{name:'Alkulcsok értékei',exact:true});
 const menu=()=>values(page).getByRole('button',{name:'Műveletek',exact:true});
 await menu().click();
 await expect(entry()).toHaveAttribute('aria-checked','false');
 await entry().click();
 await expect(values(page)).toContainText('Wallpaper');
 await menu().click();
 await expect(entry()).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Escape');
 await page.reload();
 await expect(values(page)).toContainText('Wallpaper');
 await menu().click();
 await expect(entry()).toHaveAttribute('aria-checked','true');
 // Back to the key's own values, kept for the next visit.
 await entry().click();
 await expect(values(page)).not.toContainText('Wallpaper');
 await menu().click();
 await expect(entry()).toHaveAttribute('aria-checked','false');
 await page.keyboard.press('Escape');
});

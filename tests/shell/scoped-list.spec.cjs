const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu}=require('./feature-demo.cjs');
// A list scoped on a computed field (FB-0162–FB-0165), on the key browser's values list (D8): the built-in create
// presets the key the scope implies (`createDefaults`) and the server still validates it; both scopes share one set of
// view choices (`preferencesKey`); the toggle is pinned in the toolbar (`pinned`); the computed parent is hidden from
// the value details (`column.details: false`) and still scopes the list. The run's values are prefixed and removed.
const prefix='sl'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const cleanup=()=>php(`$db->exec("DELETE FROM demo_registry_values WHERE name LIKE '${prefix}%'");`);
test.describe.configure({mode:'serial'});
test.beforeAll(cleanup);
test.afterAll(cleanup);

const tree=page=>page.getByRole('tree',{name:'Kulcsok',exact:true});
const item=(page,name)=>tree(page).getByRole('treeitem',{name,exact:true});
const values=page=>page.getByRole('tabpanel',{name:'Értékek',exact:true});
const toggle=page=>values(page).getByRole('button',{name:'Alkulcsok értékei',exact:true});

/** Opens the key browser and selects Control Panel (no values of its own; its subkey Desktop has three). */
async function controlPanel(page){
 await openMenu(page,'Kulcsböngésző','Feature demó');
 await expect(item(page,'HKEY_CURRENT_USER')).toBeVisible();
 await tree(page).focus();await page.keyboard.press('ArrowRight');
 await item(page,'Control Panel').click();
 await expect(item(page,'Control Panel')).toHaveAttribute('aria-selected','true');
}

test('a computed scope: create presets the key, the server validates it, both scopes share the view choices, the helper is hidden',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 await controlPanel(page);
 const panel=php(`echo $db->query("SELECT id FROM demo_registry_keys WHERE name='Control Panel'")->fetchColumn();`).trim();
 // The subkeys' values (scope parent_key_id, a computed field); sorted by name there.
 await toggle(page).click();
 await expect(values(page)).toContainText('Wallpaper');
 const name=values(page).locator('[role="columnheader"][data-dhx-id="name"]').first();
 await name.click();await expect(name).toHaveAttribute('aria-sort','ascending');
 // The value details leave out the computed parent but show the key.
 await values(page).getByText('Wallpaper',{exact:true}).click();
 const value=page.locator('[data-cell-id="value"]');
 await expect(value).toContainText('C:\\Users\\Demo\\Pictures\\aurora.jpg');
 await expect(value).toContainText('Kulcs');
 await expect(value).not.toContainText('Szülőkulcs');
 // Create on the computed scope: the key the scope implies is preset, the user's input is saved with it.
 await values(page).getByRole('button',{name:'Hozzáadás',exact:true}).click();
 let form=page.getByRole('dialog',{name:/Értékek — Hozzáadás/});
 await expect(form.getByLabel('Kulcs',{exact:true})).toHaveValue(panel);
 await expect(form.getByLabel('Szülőkulcs',{exact:true})).toHaveCount(0);
 await form.getByLabel('Név',{exact:true}).fill(`${prefix} új`);
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toHaveCount(0);
 expect(php(`echo $db->query("SELECT key_id FROM demo_registry_values WHERE name='${prefix} új'")->fetchColumn();`).trim()).toBe(panel);
 // The server still validates the preset: the same name under the same key is refused in place.
 await values(page).getByRole('button',{name:'Hozzáadás',exact:true}).click();
 form=page.getByRole('dialog',{name:/Értékek — Hozzáadás/});
 await expect(form.getByLabel('Kulcs',{exact:true})).toHaveValue(panel);
 await form.getByLabel('Név',{exact:true}).fill(`${prefix} új`);
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toBeVisible();
 await expect(form).toContainText('Ilyen bejegyzés már létezik.');
 expect(php(`echo $db->query("SELECT COUNT(*) FROM demo_registry_values WHERE name='${prefix} új'")->fetchColumn();`).trim()).toBe('1');
 await form.getByRole('button',{name:'Mégse',exact:true}).click();
 // The key's own values (scope key_id): the same sort, one preference set for both scopes.
 await toggle(page).click();
 await tree(page).focus();await page.keyboard.press('ArrowRight');
 await item(page,'Desktop').click();
 await expect(values(page)).toContainText('Wallpaper');
 await expect(values(page).locator('[role="columnheader"][data-dhx-id="name"]').first()).toHaveAttribute('aria-sort','ascending');
 const keys=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.includes('demo.registry-browser.values')||key.includes('demo_registry_browser_values@')));
 expect(keys.some(key=>key.includes('"demo.registry-browser.values"'))).toBe(true);
 expect(keys.filter(key=>key.includes('demo_registry_browser_values@'))).toEqual([]);
 expect(failures).toEqual([]);
});

test('the pinned toggle stays in the bar of the narrow values panel while the other commands collapse',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await signIn(page);
 await controlPanel(page);
 await expect(values(page).getByRole('button',{name:'Műveletek',exact:true})).toBeVisible();
 await expect(values(page).getByRole('button',{name:'Hozzáadás',exact:true})).toHaveCount(0);
 await expect(toggle(page)).toBeVisible();
 await expect(toggle(page)).toHaveAttribute('aria-pressed','false');
 await toggle(page).click();
 await expect(values(page)).toContainText('Wallpaper');
 await expect(toggle(page)).toHaveAttribute('aria-pressed','true');
 await toggle(page).click();
 await expect(values(page)).not.toContainText('Wallpaper');
});

const {test,expect,guide:guideWindow}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu}=require('./feature-demo.cjs');
// Feature demo "Regisztrációs adatbázis" (modules/registry.json): the view guide window, tree navigation
// (Registry::tree) and conditional fields (visible_when). Keys and values created here carry the run prefix and are
// removed after the run.
const prefix='rg'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
test.describe.configure({mode:'serial'});
test.afterAll(()=>{
 php(`$db->exec("DELETE FROM demo_registry_values WHERE name LIKE '${prefix}%' OR key_id IN (SELECT id FROM demo_registry_keys WHERE name LIKE '${prefix}%')");$db->exec("DELETE FROM demo_registry_keys WHERE name LIKE '${prefix}%'");`);
});
const tree=page=>page.locator('[data-cell-id="tree"]');
const values=page=>page.locator('[data-cell-id="list"]');
// One tree row: the toggle button and the content (icon, text) are siblings in `.dhx_tree-folder`.
const node=(page,name)=>tree(page).locator('.dhx_tree-folder').filter({has:page.locator('.dhx_tree-template__wrapper',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
const expand=async(page,name)=>{await node(page,name).locator('> .dhx_tree-toggle-button').click();};
const guide=page=>page.getByRole('dialog',{name:/^Útmutató: Regisztrációs adatbázis/});

test('the guide opens until it is closed and the lower bar shows it again',async({page})=>{
 // The wrapper closes guides in the way of an action; this test drives the guide itself.
 await page.removeLocatorHandler(guideWindow(page));
 await signIn(page);
 await openMenu(page,'Regisztrációs adatbázis','Feature demó');
 await expect(guide(page)).toBeVisible();
 await expect(guide(page)).toContainText('fa-navigáció');
 // Non-modal: the tree stays usable while it is open.
 await expect(node(page,'HKEY_CURRENT_USER')).toBeVisible();
 await guide(page).getByRole('button',{name:/close|Bezárás/i}).first().click();
 await expect(guide(page)).toHaveCount(0);
 await page.reload();
 await expect(node(page,'HKEY_CURRENT_USER')).toBeVisible();
 await page.waitForTimeout(500);
 await expect(guide(page)).toHaveCount(0);
 await page.locator('.blade-session-bar').getByRole('button',{name:'Útmutató'}).click();
 await expect(guide(page)).toBeVisible();
 // A view without a guide hides the button and closes nothing it does not own.
 await openMenu(page,'Feladatok','Feature demó');
 await expect(guide(page)).toHaveCount(0);
});

test('keys load on expansion and scope the value list',async({page})=>{
 await signIn(page);
 await openMenu(page,'Regisztrációs adatbázis','Feature demó');
 await expect(node(page,'HKEY_LOCAL_MACHINE')).toBeVisible();
 // The first root is selected: its (empty) value list carries its name.
 await expect(values(page).locator('.dhx_layout-cell-header').first()).toContainText('HKEY_CURRENT_USER');
 await expect(node(page,'Software')).toHaveCount(0);
 await expand(page,'HKEY_CURRENT_USER');
 await expect(node(page,'Software')).toBeVisible();
 await expand(page,'Software');await expand(page,'Synthetic Labs');
 await node(page,'Viewer').click();
 await expect(values(page).locator('.dhx_layout-cell-header').first()).toContainText('Viewer');
 const rows=values(page).locator('.dhx_grid-row');
 await expect(rows.filter({hasText:'WindowWidth'})).toContainText('0x00000500');
 await expect(rows.filter({hasText:'RecentFiles'})).toContainText('report.txt | notes.md | plan.csv');
 await expect(rows.filter({hasText:'Layout'})).toContainText('01 00 00 00 2c 01 00 00 f4 01');
 await expect(rows.filter({hasText:'Theme'})).toHaveCount(0);
});

test('a new key goes under the selected one; deleting it removes its values',async({page})=>{
 await signIn(page);
 await openMenu(page,'Regisztrációs adatbázis','Feature demó');
 await expand(page,'HKEY_CURRENT_USER');await node(page,'Software').click();
 await tree(page).getByRole('button',{name:'Hozzáadás'}).click();
 const form=page.getByRole('dialog',{name:/Kulcsok — Hozzáadás/});
 await expect(form.getByLabel('Szülőkulcs')).toHaveValue(/.+/);
 await form.getByLabel('Kulcs neve').fill(prefix+'key');
 await form.getByRole('button',{name:'Mentés'}).click();
 await expect(form).toHaveCount(0);
 await expect(tree(page).locator('.dhx_tree-folder--selected')).toContainText(prefix+'key');
 await expect(values(page).locator('.dhx_layout-cell-header').first()).toContainText(prefix+'key');

 // Conditional fields: the type decides the editor; only the shown one is checked and stored.
 await values(page).getByRole('button',{name:'Hozzáadás'}).click();
 const value=page.getByRole('dialog',{name:/Regisztrációs adatbázis — Hozzáadás/});
 await value.getByLabel('Név',{exact:true}).fill(prefix+'dword');
 await expect(value.getByLabel('Érték (szöveg)')).toBeVisible();
 await expect(value.getByLabel('Érték (hexadecimális, 32 bit)')).toBeHidden();
 await value.getByLabel('Típus').selectOption('REG_DWORD');
 await expect(value.getByLabel('Érték (szöveg)')).toBeHidden();
 const dword=value.getByLabel('Érték (hexadecimális, 32 bit)');
 await expect(dword).toBeVisible();
 await dword.fill('xyz');
 await value.getByRole('button',{name:'Mentés'}).click();
 await expect(value).toContainText('Csak hexadecimális számjegyek');
 await dword.fill('2a');
 await value.getByRole('button',{name:'Mentés'}).click();
 await expect(value).toHaveCount(0);
 await expect(values(page).locator('.dhx_grid-row').filter({hasText:prefix+'dword'})).toContainText('0x0000002a');

 await node(page,prefix+'key').click();
 await tree(page).getByRole('button',{name:'Törlés'}).click();
 const confirm=page.getByRole('alertdialog');
 if(await confirm.isVisible().catch(()=>false))await confirm.getByRole('button',{name:/Törlés|Megerősítés/}).click();
 await expect(node(page,prefix+'key')).toHaveCount(0);
 expect(php(`echo $db->query("SELECT COUNT(*) FROM demo_registry_values WHERE name LIKE '${prefix}%'")->fetchColumn();`)).toBe('0');
});

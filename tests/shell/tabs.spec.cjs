const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,command}=require('./feature-demo.cjs');
// Tabs (docs/toolkit.md#tabs, docs/workspaces.md#detail-tabs): the list's tabbed details window on Médiatár
// (`detail_tabs`: Adatok | Szerkesztés with the update RecordForm) and a declared `tabs` branch of PageLayout in the
// playlist editor (Összesítés | Lista beállításai). Covered: the WAI-ARIA roles, Suite's arrow keys, the unsaved-change
// guard (cancel keeps the edit, discard drops it), a save returning to the details, the reader without `update`, a phone
// width and the remembered tab of a page. The run seeds its own asset and playlist with the run prefix and removes them.
const prefix='tb'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
test.describe.configure({mode:'serial'});
let ids={};
const cleanup=()=>php(`
 $db->exec("DELETE FROM signage_playlist_items WHERE playlist_id IN (SELECT CAST(id AS TEXT) FROM signage_playlists WHERE title LIKE '${prefix}%')");
 $db->exec("DELETE FROM signage_playlists WHERE title LIKE '${prefix}%'");
 $db->exec("DELETE FROM signage_assets WHERE title LIKE '${prefix}%'");`);
test.beforeAll(()=>{
 cleanup();
 ids=JSON.parse(php(`
  $file=(string)$db->query("SELECT id FROM blade_files WHERE space='demo' AND mount_id='signage' AND kind='file' AND archived_at IS NULL AND mime_type LIKE 'image/%' ORDER BY id LIMIT 1")->fetchColumn();
  if($file==='')throw new RuntimeException('Signage image missing: run setup-workspace.php.');
  $db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)')->execute(['${prefix} elem',$file,'4']);$asset=(string)$db->lastInsertId();
  $db->prepare('INSERT INTO signage_playlists(title) VALUES (?)')->execute(['${prefix} lista']);
  echo json_encode(['asset'=>$asset,'playlist'=>(string)$db->lastInsertId()]);`));
});
test.afterAll(cleanup);

const titleOf=table=>php(`echo $db->query("SELECT title FROM ${table} WHERE id=${table==='signage_assets'?ids.asset:ids.playlist}")->fetchColumn();`);
const tab=(scope,name)=>scope.getByRole('tab',{name,exact:true});
const panel=scope=>scope.getByRole('tabpanel');
/** The framework's confirmation (`alertdialog`) showing $text. */
const ask=(page,text)=>page.getByRole('alertdialog').filter({hasText:text});
function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
/** Médiatár narrowed to the run's asset, then its `Adatok` window; returns the window. */
async function details(page,email='demo@example.test',size={width:1400,height:900}){
 await page.setViewportSize(size);
 await signIn(page,email,'/#view=signage_assets');
 const box=page.locator('[data-cell-id="grid"]').getByRole('textbox',{name:'Keresés',exact:true});
 await box.fill(prefix);await box.press('Enter');
 const row=page.locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').filter({hasText:`${prefix} elem`}).first();
 await expect(row).toBeVisible();await row.click();
 await command(page,'Adatok');
 // By its title: Suite renders only the active tab, so the details are not always in the window.
 const win=page.locator('.dhx_window').filter({hasText:'Médiatár — Adatok · '+ids.asset}).last();
 await expect(win).toBeVisible();
 return win;
}

test('Médiatár details: Adatok and Szerkesztés tabs with tab roles and Suite arrow keys',async({page})=>{
 const errors=pageErrors(page);
 const win=await details(page);
 await expect(win.getByRole('tablist')).toHaveCount(1);
 await expect(win.getByRole('tab')).toHaveText(['Adatok','Szerkesztés']);
 await expect(tab(win,'Adatok')).toHaveAttribute('aria-selected','true');
 await expect(tab(win,'Szerkesztés')).toHaveAttribute('tabindex','-1');
 await expect(panel(win)).toContainText(`${prefix} elem`);
 await expect(panel(win)).toHaveAttribute('aria-labelledby',await tab(win,'Adatok').getAttribute('id'));
 // ArrowRight opens the edit tab (Suite's keys), with the update form's current values.
 await tab(win,'Adatok').focus();await page.keyboard.press('ArrowRight');
 await expect(tab(win,'Szerkesztés')).toHaveAttribute('aria-selected','true');
 await expect(tab(win,'Szerkesztés')).toBeFocused();
 await expect(win.getByLabel('Megnevezés',{exact:true})).toHaveValue(`${prefix} elem`);
 // An untouched form is left without a question.
 await page.keyboard.press('ArrowLeft');
 await expect(tab(win,'Adatok')).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('Médiatár details: leaving unsaved changes asks; cancel keeps them, discard drops them, a save returns to Adatok',async({page})=>{
 const errors=pageErrors(page);
 const win=await details(page);
 await tab(win,'Szerkesztés').click();
 const field=win.getByLabel('Megnevezés',{exact:true});
 await field.fill(`${prefix} elem új`);await field.press('Tab');
 await tab(win,'Adatok').click();
 const unsaved='A rekord nem mentett módosításai elvesznek.';
 await expect(ask(page,unsaved)).toBeVisible();
 await ask(page,unsaved).getByRole('button',{name:'Mégse',exact:true}).click();
 await expect(tab(win,'Szerkesztés')).toHaveAttribute('aria-selected','true');
 await expect(field).toHaveValue(`${prefix} elem új`);
 await tab(win,'Adatok').click();
 await ask(page,unsaved).getByRole('button',{name:'Elvetés',exact:true}).click();
 await expect(tab(win,'Adatok')).toHaveAttribute('aria-selected','true');
 await expect(panel(win)).toContainText(`${prefix} elem`);
 await tab(win,'Szerkesztés').click();
 await expect(win.getByLabel('Megnevezés',{exact:true})).toHaveValue(`${prefix} elem`);
 expect(titleOf('signage_assets').trim()).toBe(`${prefix} elem`);
 // A save goes through the update action, reloads the details and the list, and returns to Adatok.
 await win.getByLabel('Megnevezés',{exact:true}).fill(`${prefix} elem mentett`);
 const saved=page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==='update';}catch{return false;}});
 await win.locator('.dhx_form-group button, button').filter({hasText:/^Mentés$/}).first().click();
 expect((await saved).status()).toBe(200);
 await expect(tab(win,'Adatok')).toHaveAttribute('aria-selected','true');
 await expect(panel(win)).toContainText(`${prefix} elem mentett`);
 await expect.poll(()=>titleOf('signage_assets').trim()).toBe(`${prefix} elem mentett`);
 await page.keyboard.press('Escape');
 await expect(page.locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').filter({hasText:`${prefix} elem mentett`}).first()).toBeVisible();
 php(`$db->prepare('UPDATE signage_assets SET title=? WHERE id=?')->execute(['${prefix} elem','${ids.asset}']);`);
 expect(errors).toEqual([]);
});

test('Médiatár details for the reader (no update): the plain details window, no tabs',async({page})=>{
 const win=await details(page,'reader@example.test');
 await expect(win.locator('.blade-record-details')).toContainText(`${prefix} elem`);
 await expect(win.getByRole('tab')).toHaveCount(0);
});

test('Médiatár details at phone width: both tabs reachable, the form in the edit tab',async({page})=>{
 const win=await details(page,'demo@example.test',{width:390,height:800});
 const [a,b]=[await tab(win,'Adatok').boundingBox(),await tab(win,'Szerkesztés').boundingBox()];
 expect(a.x+a.width).toBeLessThanOrEqual(b.x+1);expect(b.x+b.width).toBeLessThanOrEqual(390);
 await tab(win,'Szerkesztés').click();
 await expect(win.getByLabel('Megnevezés',{exact:true})).toBeVisible();
});

test('playlist editor: the declared tabs branch, its guard and the remembered tab',async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width:1700,height:1000});
 await signIn(page,'demo@example.test',`/#view=demo.playlist-editor&record=${ids.playlist}`);
 const layout=page.locator('.blade-page-layout').first();
 await expect(layout.getByRole('tab')).toHaveText(['Összesítés','Lista beállításai']);
 await tab(layout,'Összesítés').click();
 await expect(panel(layout)).toContainText(`${prefix} lista`);
 await tab(layout,'Lista beállításai').click();
 const name=panel(layout).getByLabel('Megnevezés',{exact:true});
 await expect(name).toHaveValue(`${prefix} lista`);
 // Unsaved settings: the project's guard asks; discarding replaces the form with the stored values.
 await name.fill(`${prefix} lista új`);await name.press('Tab');
 await tab(layout,'Összesítés').click();
 const unsaved='A lista beállításainak nem mentett módosításai elvesznek.';
 await expect(ask(page,unsaved)).toBeVisible();
 await ask(page,unsaved).getByRole('button',{name:'Elvetés',exact:true}).click();
 await expect(tab(layout,'Összesítés')).toHaveAttribute('aria-selected','true');
 await tab(layout,'Lista beállításai').click();
 await expect(panel(layout).getByLabel('Megnevezés',{exact:true})).toHaveValue(`${prefix} lista`);
 expect(titleOf('signage_playlists').trim()).toBe(`${prefix} lista`);
 // The page keeps its last tab per user: a reload opens Lista beállításai again.
 await page.reload();
 await expect(tab(page.locator('.blade-page-layout').first(),'Lista beállításai')).toHaveAttribute('aria-selected','true');
 await tab(page.locator('.blade-page-layout').first(),'Összesítés').click();
 expect(errors).toEqual([]);
});

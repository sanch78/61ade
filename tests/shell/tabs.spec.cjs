const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn}=require('./feature-demo.cjs');
// Tabs (docs/toolkit.md#tabs): a declared `tabs` branch of PageLayout in the playlist editor (Összesítés | Lista
// beállításai). Covered: the WAI-ARIA roles, Suite's arrow keys and the roving tab order, the folder-tab geometry (the
// open tab joins its panel, the first tab is flush with the panel's edge), the unsaved-change guard (discarding gives a
// fresh form), the remembered tab of a page. The run seeds its own playlist with the run prefix and removes it.
const prefix='tb'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
test.describe.configure({mode:'serial'});
let ids={};
const cleanup=()=>php(`
 $db->exec("DELETE FROM signage_playlist_items WHERE playlist_id IN (SELECT CAST(id AS TEXT) FROM signage_playlists WHERE title LIKE '${prefix}%')");
 $db->exec("DELETE FROM signage_playlists WHERE title LIKE '${prefix}%'");`);
test.beforeAll(()=>{
 cleanup();
 ids=JSON.parse(php(`
  $db->prepare('INSERT INTO signage_playlists(title) VALUES (?)')->execute(['${prefix} lista']);
  echo json_encode(['playlist'=>(string)$db->lastInsertId()]);`));
});
test.afterAll(cleanup);

const titleOf=()=>php(`echo $db->query("SELECT title FROM signage_playlists WHERE id=${ids.playlist}")->fetchColumn();`);
const tab=(scope,name)=>scope.getByRole('tab',{name,exact:true});
const panel=scope=>scope.getByRole('tabpanel');
/** The framework's confirmation (`alertdialog`) showing $text. */
const ask=(page,text)=>page.getByRole('alertdialog').filter({hasText:text});
function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
test('playlist editor: the declared tabs branch, its guard and the remembered tab',async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width:1700,height:1000});
 await signIn(page,'demo@example.test',`/#view=demo.playlist-editor&record=${ids.playlist}`);
 const layout=page.locator('.blade-page-layout').first();
 await expect(layout.getByRole('tablist')).toHaveCount(1);
 await expect(layout.getByRole('tab')).toHaveText(['Összesítés','Lista beállításai']);
 await tab(layout,'Összesítés').click();
 await expect(tab(layout,'Összesítés')).toHaveAttribute('aria-selected','true');
 await expect(tab(layout,'Lista beállításai')).toHaveAttribute('tabindex','-1');
 await expect(panel(layout)).toContainText(`${prefix} lista`);
 await expect(panel(layout)).toHaveAttribute('aria-labelledby',await tab(layout,'Összesítés').getAttribute('id'));
 // Folder tabs: the first tab starts at the panel's left edge and the open one has no line between it and its panel.
 const [first,content]=[await tab(layout,'Összesítés').boundingBox(),await panel(layout).boundingBox()];
 expect(Math.abs(first.x-content.x)).toBeLessThanOrEqual(1);
 expect(Math.abs(first.y+first.height-content.y)).toBeLessThanOrEqual(1);
 // Suite's arrow keys open the next tab and move the focus; an untouched form is left without a question.
 await tab(layout,'Összesítés').focus();await page.keyboard.press('ArrowRight');
 await expect(tab(layout,'Lista beállításai')).toHaveAttribute('aria-selected','true');
 await expect(tab(layout,'Lista beállításai')).toBeFocused();
 await page.keyboard.press('ArrowLeft');
 await expect(tab(layout,'Összesítés')).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
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
 expect(titleOf().trim()).toBe(`${prefix} lista`);
 // The page keeps its last tab per user: a reload opens Lista beállításai again.
 await page.reload();
 await expect(tab(page.locator('.blade-page-layout').first(),'Lista beállításai')).toHaveAttribute('aria-selected','true');
 await tab(page.locator('.blade-page-layout').first(),'Összesítés').click();
 expect(errors).toEqual([]);
});

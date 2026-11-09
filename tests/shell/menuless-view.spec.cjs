const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn}=require('./feature-demo.cjs');
// A list view without a menu entry (docs/toolkit.md#views, `menu: false`): the demo's `signage_asset_items` (signage.php)
// is offered but in no menu, its address is refused like an unknown view, and the asset viewer mounts it as a scoped
// card list in its accordion (desktop and 390 px), whose toolbar record command acts on the card selected last. The run
// seeds its own asset, two playlists and their items and removes them.
const prefix='ml'+Date.now().toString(36);
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
  $file=$db->query("SELECT file_id FROM signage_assets WHERE kind='image' AND file_id<>'' ORDER BY id LIMIT 1")->fetchColumn();
  $db->prepare("INSERT INTO signage_assets(title,kind,file_id) VALUES (?, 'image', ?)")->execute(['${prefix} elem',$file]);$asset=$db->lastInsertId();
  $db->prepare('INSERT INTO signage_playlists(title) VALUES (?)')->execute(['${prefix} lista']);$playlist=$db->lastInsertId();
  $db->prepare('INSERT INTO signage_playlist_items(playlist_id,asset_id,position) VALUES (?,?,1)')->execute([$playlist,$asset]);
  $db->prepare('INSERT INTO signage_playlists(title) VALUES (?)')->execute(['${prefix} második']);$second=$db->lastInsertId();
  $db->prepare('INSERT INTO signage_playlist_items(playlist_id,asset_id,position) VALUES (?,?,1)')->execute([$second,$asset]);
  echo json_encode(['asset'=>(string)$asset,'playlist'=>(string)$playlist]);`));
});
test.afterAll(cleanup);

function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
const header=(scope,name)=>scope.getByRole('button',{name,exact:true});

test('offered without a menu entry; its address opens nothing',async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test','/');
 await page.getByRole('menuitem',{name:'Digitális kijelző',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'Lejátszási listák',exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Lejátszási listákban',exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');
 // The address is refused like an unknown view: the empty workspace, no list.
 await page.goto(`/#view=signage_asset_items`);
 await page.waitForTimeout(1500);
 await expect(page.locator('.blade-grid-views')).toHaveCount(0);
 await expect(page.getByRole('menuitem',{name:'Lejátszási listákban',exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
});

for(const [width,height] of [[1366,900],[390,844]])test(`asset viewer at ${width} px: the menu-less list scoped to the asset in its accordion section`,async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.asset-viewer&record=${ids.asset}`);
 const layout=page.locator('.blade-page-layout').first();
 await expect(header(layout,'Lejátszási listákban')).toBeVisible();
 if(await header(layout,'Lejátszási listákban').getAttribute('aria-expanded')!=='true')await header(layout,'Lejátszási listákban').click();
 const section=layout.getByRole('region',{name:'Lejátszási listákban'});
 // Cards of this asset's items only, labelled by their playlist.
 const cards=section.locator('.blade-grid-card');
 await expect(cards).toHaveCount(2);
 // The scoped list is the section's content (no panel of its own) and has no menu entry of its own.
 await expect(page.getByRole('menuitem',{name:'Lejátszási listákban',exact:true})).toHaveCount(0);
 // The toolbar's record command acts on the cursor record: the card clicked last.
 const target=cards.filter({hasText:`${prefix} második`});
 await target.click();
 await section.getByRole('button',{name:'Műveletek'}).click();
 await page.getByRole('menuitem',{name:'Adatok',exact:true}).click();
 const details=page.locator('.blade-record-details').last();
 await expect(details).toContainText(`${prefix} második`);
 await expect(details).not.toContainText(`${prefix} lista`);
 await page.keyboard.press('Escape');
 // One section is open at a time: opening Adatok closes this one.
 await header(layout,'Adatok').click();
 await expect(section).toHaveCount(0);
 expect(errors).toEqual([]);
});

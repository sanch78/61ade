const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,api,command}=require('./feature-demo.cjs');
// D5 (docs/demos.md#d5-playlist-editor): Digitális kijelző → Lejátszási listák, the record view kind
// `demo.playlist-editor` (frontend/src/playlist-editor.ts), built from 61ade components only: the declared panels
// (PageLayout), the asset library and the playlist's items as ListViews, the playlist's details and settings
// (RecordDetails, RecordForm) and the demo's own preview. Covered: opening by double-click and by `Lista szerkesztése`;
// library assets dragged into the items (one or every marked one, landing where dropped: the list's `drop`); the manual
// order by dragging, Alt+↑/↓ and Feljebb/Lejjebb (`move`); inline and bulk editing with the declared validation; the
// settings; the preview's controls and transition layers; the reader's read-only editor; a scheduled playlist in its
// own calendar tone and in the day programme. Every change is checked in the database. The run seeds its own assets,
// playlist and a far-future event with the run prefix and removes them afterwards; seeded demo data is never changed.
const prefix='pe'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const DAY='2099-12-28';
test.describe.configure({mode:'serial'});
let ids={},playlist='';
const cleanup=()=>php(`
 $db->exec("DELETE FROM signage_playlist_items WHERE playlist_id IN (SELECT CAST(id AS TEXT) FROM signage_playlists WHERE title LIKE '${prefix}%') OR asset_id IN (SELECT CAST(id AS TEXT) FROM signage_assets WHERE title LIKE '${prefix}%')");
 $db->exec("DELETE FROM signage_playlists WHERE title LIKE '${prefix}%'");
 $db->exec("DELETE FROM blade_calendar_events WHERE space='signage' AND text LIKE '${prefix}%'");
 $db->exec("DELETE FROM signage_assets WHERE title LIKE '${prefix}%'");`);
// Two assets (image 4 s, audio 3 s) and a playlist holding the image.
test.beforeAll(()=>{
 cleanup();
 ids=JSON.parse(php(`
  $file=function(string $where)use($db):string{return (string)$db->query("SELECT id FROM blade_files WHERE space='demo' AND mount_id='signage' AND kind='file' AND archived_at IS NULL AND $where ORDER BY id LIMIT 1")->fetchColumn();};
  $asset=$db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)');$ids=[];
  foreach(['kép'=>[$file("mime_type LIKE 'image/%'"),'4'],'hang'=>[$file("mime_type LIKE 'audio/%'"),'3']] as $name=>[$id,$seconds]){
   if($id==='')throw new RuntimeException('Signage image or audio file missing: run setup-workspace.php.');
   $asset->execute(['${prefix} '.$name,$id,$seconds]);$ids[$name]=(string)$db->lastInsertId();
  }
  $db->prepare('INSERT INTO signage_playlists(title) VALUES (?)')->execute(['${prefix} lista']);$ids['lista']=(string)$db->lastInsertId();
  $db->prepare('INSERT INTO signage_playlist_items(playlist_id,asset_id,position) VALUES (?,?,1)')->execute([$ids['lista'],$ids['kép']]);
  echo json_encode($ids);`));
 playlist=ids.lista;
});
test.afterAll(cleanup);

const stored=()=>JSON.parse(php(`$q=$db->prepare('SELECT asset_id FROM signage_playlist_items WHERE playlist_id=? ORDER BY CAST(position AS INTEGER),id');$q->execute(['${playlist}']);echo json_encode($q->fetchAll(PDO::FETCH_COLUMN));`));
const rows=()=>JSON.parse(php(`$q=$db->prepare('SELECT asset_id,duration,transition,enabled,valid_from,valid_to FROM signage_playlist_items WHERE playlist_id=? ORDER BY CAST(position AS INTEGER),id');$q->execute(['${playlist}']);echo json_encode($q->fetchAll(PDO::FETCH_ASSOC));`));
const reset=assets=>php(`$db->prepare('DELETE FROM signage_playlist_items WHERE playlist_id=?')->execute(['${playlist}']);$i=$db->prepare('INSERT INTO signage_playlist_items(playlist_id,asset_id,position) VALUES (?,?,?)');foreach(${JSON.stringify(assets)} as $p=>$a)$i->execute(['${playlist}',$a,$p+1]);`);
// A declared panel of the page (the lists inside have cells of their own, such as `commands`: the outer one comes first).
const region=(page,id)=>page.locator(`.blade-page-layout [data-cell-id="${id}"]`).first();
const items=page=>region(page,'items').locator('.dhx_grid-row');
const library=(page,name)=>region(page,'library').locator('.dhx_grid-row').filter({hasText:`${prefix} ${name}`});
// The visible title cell of a row (a Grid row is as wide as all its columns, wider than its panel).
const title=row=>row.locator('[data-dhx-col-id="title"], [data-dhx-col-id="asset_id"]').first();
const button=(page,name)=>page.getByRole('button',{name,exact:true});
// The shared player (frontend/src/player.ts): its strip items and the caption title of the stage.
const blocks=page=>page.locator('[data-demo-part="strip"] [data-demo-item]');
const caption=page=>page.locator('[data-demo-part="caption"] .demo-playlist-caption__title');
const answered=(page,action)=>page.waitForResponse(response=>{try{return response.request().postDataJSON()?.action===action;}catch{return false;}});
/** A command of the items list's toolbar (the shared `command` helper sees two lists here), also from its `Műveletek` menu. */
async function act(page,name){
 const bar=region(page,'items'),menu=bar.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name,exact:true}).click();}
 else await bar.getByRole('button',{name,exact:true}).click();
}
/** Picks a presentation in a list region's `Nézet` menu, also from its `Műveletek` menu. */
async function mode(page,id,name){
 const bar=region(page,id),menu=bar.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name:/^Nézet:/}).click();}else await bar.getByRole('button',{name:/^Nézet:/}).click();
 await page.getByRole('menuitem',{name,exact:true}).click();
}
function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
async function open(page,email='demo@example.test'){
 await page.setViewportSize({width:1700,height:1000});
 await signIn(page,email,`/#view=demo.playlist-editor&record=${playlist}`);
 await expect(items(page)).toHaveCount(stored().length);
 // The library opens in tiles (`ListViewOptions.mode`) until the user picks another presentation; the drags need rows.
 await expect(region(page,'library').locator('.blade-grid-tile').first()).toBeVisible();
 await mode(page,'library','Táblázat');
 // The library has no toolbar search: its title column's header filter narrows it to the run's assets.
 const filter=region(page,'library').getByRole('textbox',{name:'Szűrés: Megnevezés',exact:true});
 await filter.fill(prefix);await filter.press('Enter');
 await expect(region(page,'library').locator('.dhx_grid-row')).toHaveCount(2);
}
/**
 * Mouse drag in steps, as Suite's drag manager needs (a press, moves past its threshold, a release), between the
 * title cells of two rows; $where: top or bottom half of the target row.
 */
async function drag(page,from,to,where='bottom'){
 const a=await title(from).boundingBox(),b=await title(to).boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 await page.mouse.move(a.x+a.width/2+20,a.y+a.height/2+5,{steps:5});
 await page.mouse.move(b.x+b.width/2,where==='top'?b.y+6:b.y+b.height-6,{steps:15});await page.mouse.up();
}

test('Lejátszási listák opens the editor by double-click and by its toolbar command; every panel is a 61ade component',async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width:1700,height:1000});
 await signIn(page,'demo@example.test','/#view=signage_playlists');
 const row=page.locator('.dhx_grid-row').filter({hasText:`${prefix} lista`}).first();
 await expect(row).toBeVisible();
 // The title cell edits inline on double-click; the other cells activate the row.
 await row.locator('[data-dhx-col-id="items"]').dblclick();
 await expect(page).toHaveURL(new RegExp(`view=demo\\.playlist-editor&record=${playlist}`));
 await expect(items(page)).toHaveCount(1);
 for(const id of ['commands','library','preview','items','details','settings'])await expect(region(page,id)).toBeVisible();
 await expect(items(page).first()).toContainText(`${prefix} kép`);
 await expect(blocks(page)).toHaveCount(1);
 await expect(caption(page)).toHaveText(`1 / 1 · ${prefix} kép`);
 await expect(region(page,'details')).toContainText(`${prefix} lista`);
 await expect(region(page,'settings').getByLabel('Megnevezés')).toHaveValue(`${prefix} lista`);
 await button(page,'Vissza a listához').click();
 await row.click();await command(page,'Lista szerkesztése');
 await expect(items(page)).toHaveCount(1);
 expect(errors).toEqual([]);
});

test('the library filters in tiles too: its header filters move into the Szűrés dialog of the toolbar',async({page})=>{
 await open(page);
 const library=region(page,'library');
 await expect(library.getByRole('textbox',{name:'Keresés…'})).toHaveCount(0);
 const menu=library.getByRole('button',{name:'Műveletek',exact:true});
 const pick=async name=>{if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name,exact:true}).click();}else await library.getByRole('button',{name,exact:true}).click();};
 await mode(page,'library','Csempék');
 await expect(library.locator('.blade-grid-tile')).toHaveCount(2);
 await pick('Szűrés');
 const dialog=page.locator('.dhx_window').filter({hasText:'Szűrés'}).last();
 await expect(dialog.getByLabel('Megnevezés',{exact:true})).toHaveValue(prefix);
 await dialog.getByLabel('Megnevezés',{exact:true}).fill(`${prefix} hang`);
 await dialog.getByRole('button',{name:'Szűrés',exact:true}).click();
 await expect(library.locator('.blade-grid-tile')).toHaveCount(1);
 await mode(page,'library','Táblázat');
 await expect(library.getByRole('textbox',{name:'Szűrés: Megnevezés',exact:true})).toHaveValue(`${prefix} hang`);
});

test('library assets dragged into the items become items where they are dropped, one or every marked one',async({page})=>{
 const errors=pageErrors(page);
 reset([ids['kép']]);
 await open(page);
 const created=answered(page,'create');
 await drag(page,library(page,'hang'),items(page).last());
 expect((await created).status()).toBe(200);
 await expect.poll(stored).toEqual([ids['kép'],ids['hang']]);
 await expect(items(page)).toHaveCount(2);
 await expect(blocks(page)).toHaveCount(2);
 // Two marked assets dropped on the top half of the first item: both in front of it, in the order they were marked.
 await title(library(page,'hang')).click();await title(library(page,'kép')).click({modifiers:['Control']});
 await drag(page,library(page,'kép'),items(page).first(),'top');
 await expect.poll(stored).toEqual([ids['hang'],ids['kép'],ids['kép'],ids['hang']]);
 await expect(items(page)).toHaveCount(4);
 expect(errors).toEqual([]);
});

test('the manual order: dragging, Alt+↑/↓ and Feljebb/Lejjebb move items (move)',async({page})=>{
 reset([ids['kép'],ids['hang']]);
 await open(page);
 let moved=answered(page,'move');
 await drag(page,items(page).last(),items(page).first(),'top');
 expect((await moved).status()).toBe(200);
 await expect.poll(stored).toEqual([ids['hang'],ids['kép']]);
 await title(items(page).last()).click();
 moved=answered(page,'move');await page.keyboard.press('Alt+ArrowUp');await moved;
 await expect.poll(stored).toEqual([ids['kép'],ids['hang']]);
 await act(page,'Lejjebb');
 await expect.poll(stored).toEqual([ids['hang'],ids['kép']]);
 await act(page,'Feljebb');
 await expect.poll(stored).toEqual([ids['kép'],ids['hang']]);
 await expect(items(page).first()).toContainText(`${prefix} kép`);
 // The first item cannot go up: the command is disabled.
 await title(items(page).first()).click();
 const menu=region(page,'items').getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await expect(page.getByRole('menuitem',{name:'Feljebb',exact:true})).toHaveAttribute('aria-disabled','true');await page.keyboard.press('Escape');}
 else await expect(region(page,'items').getByRole('button',{name:'Feljebb',exact:true})).toBeDisabled();
});

test('items are edited in place and in bulk with the declared validation; the preview follows today\'s status',async({page})=>{
 reset([ids['kép'],ids['hang']]);
 await open(page);
 await expect(blocks(page)).toHaveCount(2);
 // The on/off switch in the cell: off, today's icon changes, the preview leaves the item out.
 const edited=answered(page,'__edit');
 const toggle=items(page).last().getByRole('checkbox',{name:'Bekapcsolva',exact:true});await toggle.focus();await toggle.press('Space');
 expect((await edited).status()).toBe(200);
 await expect.poll(async()=>(await rows())[1].enabled).toBe('0');
 await expect(items(page).last().getByRole('img',{name:'Kikapcsolva'})).toBeVisible();
 await expect(blocks(page)).toHaveCount(1);
 // One item's form: a play time out of range is refused in place; a valid override is saved.
 // Double-click opens the update form (a click marks the row, and with marks Módosítás is the bulk form).
 await title(items(page).first()).dblclick();
 const form=page.locator('.dhx_window').filter({has:page.getByLabel('Saját lejátszási idő (mp)')});
 await form.getByLabel('Saját lejátszási idő (mp)').fill('0');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toContainText('1 és 3600 mp közötti egész szám');
 await form.getByLabel('Saját lejátszási idő (mp)').fill('15');
 const updated=answered(page,'update');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 expect((await updated).status()).toBe(200);
 await expect.poll(async()=>(await rows())[0].duration).toBe('15');
 await expect(items(page).first().locator('[data-dhx-col-id="length"]')).toHaveText('15');
 // Both items marked: one bulk form sets every offered field of each (play time, transition, switch, validity).
 await title(items(page).first()).click();await title(items(page).last()).click({modifiers:['Control']});
 await act(page,'Módosítás');
 const bulk=page.locator('.dhx_window').filter({hasText:'Módosítás — 2 sor'});
 await bulk.getByLabel('Saját lejátszási idő (mp)').fill('20');
 await bulk.getByLabel('Saját áttűnés').selectOption({label:'Nagyítás'});
 await bulk.getByRole('checkbox',{name:'Bekapcsolva',exact:true}).check();
 const saved=answered(page,'__bulk');
 await bulk.getByRole('button',{name:'Végrehajtás (2 sor)',exact:true}).click();
 expect((await saved).status()).toBe(200);
 await expect.poll(async()=>(await rows()).map(row=>[row.duration,row.transition,row.enabled])).toEqual([['20','zoom','1'],['20','zoom','1']]);
 await expect(blocks(page)).toHaveCount(2);
});

test('list settings through the RecordForm, and the preview plays with controls and transition layers',async({page})=>{
 reset([ids['kép'],ids['hang']]);
 php(`$db->prepare("UPDATE signage_playlist_items SET duration='2', transition='zoom' WHERE playlist_id=? AND position=2")->execute(['${playlist}']);`);
 await open(page);
 const settings=region(page,'settings');
 await settings.getByLabel('Áttűnés hossza (ms)').fill('900');
 const updated=answered(page,'update');
 await settings.getByRole('button',{name:'Mentés',exact:true}).click();
 expect((await updated).status()).toBe(200);
 await expect.poll(()=>php(`echo $db->query("SELECT transition_ms FROM signage_playlists WHERE id=${playlist}")->fetchColumn();`)).toBe('900');
 await expect(region(page,'details')).toContainText('900');
 // Preview: first item on the stage, play, the next item enters with its own transition (zoom), wrap-around.
 await expect(caption(page)).toHaveText(`1 / 2 · ${prefix} kép`);
 await button(page,'Lejátszás').click();
 await expect(button(page,'Szünet')).toBeEnabled();
 await button(page,'Következő elem').click();
 await expect(caption(page)).toHaveText(`2 / 2 · ${prefix} hang`);
 await expect(page.locator('[data-demo-part="screen"] .demo-player__layer--zoom').last()).toBeAttached();
 await expect(caption(page)).toHaveText(`1 / 2 · ${prefix} kép`,{timeout:6000});
 await button(page,'Szünet').click();
 await expect(button(page,'Lejátszás')).toBeEnabled();
 // The timeline strip shows the clicked item.
 await blocks(page).last().click();
 await expect(caption(page)).toHaveText(`2 / 2 · ${prefix} hang`);
});

test('the reader sees the playlist read-only: no drops, no moves, no settings',async({page})=>{
 reset([ids['kép']]);
 await open(page,'reader@example.test');
 await expect(region(page,'items').getByRole('button',{name:'Hozzáadás',exact:true})).toHaveCount(0);
 await expect(region(page,'items').getByRole('button',{name:'Feljebb',exact:true})).toHaveCount(0);
 await expect(region(page,'settings').getByRole('button',{name:'Mentés',exact:true})).toHaveCount(0);
 await drag(page,library(page,'hang'),items(page).last());
 await page.waitForTimeout(500);
 expect(stored()).toEqual([ids['kép']]);
 expect((await api(page,'signage_playlist_items','create',null,{playlist_id:playlist,asset_id:ids['hang']})).status).toBe(403);
});

test('a scheduled playlist has its own calendar tone and plays item by item in the day programme',async({page})=>{
 reset([ids['kép'],ids['hang']]);
 php(`$db->prepare("UPDATE signage_playlist_items SET duration='6' WHERE playlist_id=? AND position=1")->execute(['${playlist}']);
  $db->prepare("INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,data) VALUES ('signage',?,?,?,'',0,?)")
   ->execute(['${prefix} műsor','${DAY} 08:00:00','${DAY} 10:00:00',json_encode(['content'=>'playlist:${playlist}'])]);`);
 await page.setViewportSize({width:1600,height:1000});
 await signIn(page,'demo@example.test','/#view=signage_schedule');
 const answer=await api(page,'signage_playlist','day',null,{date:DAY});
 const slot=answer.body.data.timeline.find(entry=>entry.title===`${prefix} műsor`);
 expect(slot.asset).toBeNull();
 expect(slot.playlist.items.map(asset=>[asset.id,asset.duration])).toEqual([[ids['kép'],6],[ids['hang'],3]]);
 expect(slot.playlist.duration).toBe(9);
 // The day preview plays one round of the list: one strip item per playlist asset, marked with the list.
 // The day comes from the address of a fresh opening (the shell applies `filter.date` once and drops it).
 // A fresh page: a goto that only changes the hash would not reload the signed-out application.
 await page.context().clearCookies({name:'blade_demo'});const fresh=await page.context().newPage();await fresh.setViewportSize({width:1600,height:1000});
 await signIn(fresh,'demo@example.test',`/#view=demo.playlist-preview&filter.date=${DAY}`);
 const listed=fresh.locator(`[data-demo-part="strip"] [data-demo-list="${prefix} lista"]`);
 await expect(listed).toHaveCount(2);
 await expect(listed.first()).toHaveAttribute('data-demo-seconds','6');
 await expect(listed.last()).toHaveAttribute('data-demo-seconds','3');
});

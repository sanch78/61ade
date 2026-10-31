const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,api}=require('./feature-demo.cjs');
// Toolkit D2 (docs/demos.md#toolkit-d2-playlist): Digitális kijelző → Napi műsor, the project view kind
// `demo.playlist-preview` (frontend/src/playlist.ts on the shared player, player.ts): the day's `signage_playlist.day`
// timeline in order with play times, the playhead driving the MediaPlayer (image, audio) and a SandboxFrame scene (code
// from `signage_playlist.scene`), seeking within a strip item through the frame protocol (asserted through the state
// the frame reports, not pixels), day steps and `Naptár…` (the day action's RecordForm in a window), a failing scene,
// destruction on navigation, the phone layout and the dark theme. The run seeds its own assets, events and date default on a far-future Saturday with the run prefix (over the
// seeded Signage files, the scene fixture included) and removes them afterwards; seeded demo data is never changed.
const prefix='pp'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
// A Saturday and the Sunday after it; the demo programme's occurrences on the Saturday are cancelled for the run.
const DAY='2099-12-26',NEXT='2099-12-27';
test.describe.configure({mode:'serial'});
const cleanup=()=>php(`
 $db->exec("DELETE FROM signage_defaults WHERE date='${DAY}' OR asset_id IN (SELECT id FROM signage_assets WHERE title LIKE '${prefix}%')");
 $db->exec("DELETE FROM blade_calendar_events WHERE space='signage' AND text LIKE '${prefix}%'");
 $db->exec("DELETE FROM signage_assets WHERE title LIKE '${prefix}%'");`);
// The run's day: its image as the date default (4 s), its scene 08:00–09:00 (8 s) and its audio 09:00–10:00 (3 s).
test.beforeAll(()=>{
 cleanup();
 php(`
  $file=function(string $where)use($db):string{return (string)$db->query("SELECT id FROM blade_files WHERE space='demo' AND mount_id='signage' AND kind='file' AND archived_at IS NULL AND $where ORDER BY id LIMIT 1")->fetchColumn();};
  $files=['kép'=>[$file("mime_type LIKE 'image/%'"),'4'],'jelenet'=>[$file("mime_type='text/javascript' AND name='blade-brand.js'"),'8'],'hang'=>[$file("mime_type LIKE 'audio/%'"),'3']];
  foreach($files as [$id])if($id==='')throw new RuntimeException('Signage image, audio or scene file missing: run setup-workspace.php (D2 data step).');
  $asset=$db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)');$ids=[];
  foreach($files as $name=>[$id,$seconds]){$asset->execute(['${prefix} '.$name,$id,$seconds]);$ids[$name]=(string)$db->lastInsertId();}
  $db->prepare("INSERT INTO signage_defaults(weekday,date,asset_id) VALUES ('',?,?)")->execute(['${DAY}',$ids['kép']]);
  $event=$db->prepare("INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,data) VALUES ('signage',?,?,?,'',0,?)");
  $event->execute(['${prefix} jelenet','${DAY} 08:00:00','${DAY} 09:00:00',json_encode(['content'=>'asset:'.$ids['jelenet']])]);
  $event->execute(['${prefix} hang','${DAY} 09:00:00','${DAY} 10:00:00',json_encode(['content'=>'asset:'.$ids['hang']])]);
  // Series of the demo programme (the weekend playlists) would fill the day: each occurrence on it gets a deleted
  // exception with the run prefix (the Scheduler's own model), removed with the run's events afterwards.
  require 'examples/demo-app/vendor/autoload.php';
  $day=new DateTimeImmutable('${DAY}');$cancel=$db->prepare("INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,recurring_event_id,original_start,deleted,data) VALUES ('signage',?,?,?,'',0,?,?,1,'{}')");
  foreach((new Blade\\Calendar\\CalendarDefinition('signage_schedule','x','signage'))->occurrences($db,$day,$day->modify('+1 day')) as $item)
   if($item['recurring'])$cancel->execute(['${prefix} törölt',$item['start'].':00',$item['end'].':00',$item['series_id'],$item['start'].':00']);`);
});
test.afterAll(cleanup);

const strip=page=>page.locator('[data-demo-part="strip"]');
const items=page=>strip(page).locator('[data-demo-item]');
const item=(page,title)=>items(page).filter({has:page.locator('.demo-playlist-item__title',{hasText:new RegExp('^'+title+'$')})});
const caption=page=>page.locator('[data-demo-part="caption"]');
const sceneState=page=>caption(page).locator('[data-demo-scene-state]');
const sceneTime=async page=>Number(await sceneState(page).getAttribute('data-demo-scene-time'));
const frames=page=>page.locator('iframe.blade-sandbox__frame');
const screen=page=>page.locator('[data-demo-part="screen"]');
const button=(page,name)=>page.getByRole('button',{name,exact:true});
// A panel of the page (the player's own commands have cells too: the page's panel comes first).
const region=(page,id)=>page.locator(`.blade-page-layout [data-cell-id="${id}"]`).first();
// The shown day: the day commands' label (`YYYY-MM-DD · weekday`).
const shownDay=page=>region(page,'commands').getByRole('button',{name:/^\d{4}-\d\d-\d\d/});
/** A command of the day bar (`commands`) or of the player (`player`), also from its `Műveletek` menu. */
async function act(page,name,where='player'){
 const bar=where==='player'?page.locator('[data-demo-part="commands"]'):region(page,'commands');
 const menu=bar.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name,exact:true}).click();}
 else await bar.getByRole('button',{name,exact:true}).click();
}
const position=page=>page.getByRole('button',{name:/^Pozíció: \d+:\d\d \/ \d+:\d\d$/});
const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds)%60).padStart(2,'0')}`;
const seconds=slot=>slot.asset?Math.min(3600,Math.max(1,Math.round(Number(slot.asset.duration)||0))):3;
// The preview's run: a scheduled playlist plays one round of its assets, each for its own play time.
const run=timeline=>timeline.flatMap(slot=>slot.playlist?.items?.length?slot.playlist.items.map(asset=>({...slot,asset,playlist:null})):[slot]);
function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
async function open(page,width=1600,height=1000){
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.playlist-preview&filter.date=${DAY}`);
 await expect(items(page).first().locator('.demo-playlist-item__title')).toHaveText(prefix+' kép');
}
// The day's timeline as the API answers it, the preview's run (playlists expanded) and its length.
async function day(page,date=DAY){
 const answer=await api(page,'signage_playlist','day',null,{date});expect(answer.status,JSON.stringify(answer.body)).toBe(200);
 const timeline=run(answer.body.data.timeline);
 return {timeline,total:timeline.reduce((sum,slot)=>sum+seconds(slot),0)};
}

test('timeline lists the day\'s entries in order with their play times; the stage shows the first one',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 const {timeline,total}=await day(page);
 await expect(items(page)).toHaveCount(timeline.length);
 const shown=await items(page).evaluateAll(buttons=>buttons.map(node=>({time:node.querySelector('.demo-playlist-item__time').textContent,
  title:node.querySelector('.demo-playlist-item__title').textContent,seconds:node.dataset.demoSeconds,kind:node.dataset.demoKind})));
 expect(shown.map(({time,seconds})=>({time,seconds}))).toEqual(timeline.map(slot=>({time:`${slot.start}–${slot.end}`,seconds:String(seconds(slot))})));
 // The run's own entries open the day: the date default image, the scene at 08:00 and the audio at 09:00.
 expect(shown.slice(0,3)).toEqual([
  {time:'00:00–08:00',title:prefix+' kép',seconds:'4',kind:'image'},
  {time:'08:00–09:00',title:prefix+' jelenet',seconds:'8',kind:'scene'},
  {time:'09:00–10:00',title:prefix+' hang',seconds:'3',kind:'audio'}]);
 await expect(item(page,prefix+' jelenet')).toHaveAttribute('aria-label',`08:00–09:00: ${prefix} jelenet, Jelenet, 8 mp`);
 await expect(items(page).first()).toHaveAttribute('aria-current','true');
 await expect(position(page)).toHaveText(`Pozíció: 0:00 / ${clock(total)}`);
 await expect(shownDay(page)).toHaveText(`${DAY} · Szombat`);
 // The stage shows the first entry, the image, in the MediaPlayer.
 await expect(caption(page)).toHaveAttribute('data-demo-stage','image');
 await expect(caption(page)).toContainText(`00:00–08:00 · ${prefix} kép · Kép`);
 await expect(screen(page).locator('img')).toBeVisible();
 await expect(screen(page).locator('.blade-player')).toHaveCount(1);
 await expect(frames(page)).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('the playhead advances and the stage switches from the image to the scene and on to the audio',async({page})=>{
 test.setTimeout(60000);
 const errors=pageErrors(page);
 await open(page);
 await act(page,'Lejátszás');
 await expect(button(page,'Szünet')).toBeEnabled();await expect(button(page,'Lejátszás')).toBeDisabled();
 await expect.poll(async()=>Number(await strip(page).getAttribute('data-demo-position'))).toBeGreaterThan(0.5);
 // The image takes 0–4 s of the run; then the scene runs in the SandboxFrame with code from signage_playlist.scene.
 await expect(caption(page)).toHaveAttribute('data-demo-stage','scene',{timeout:10000});
 await expect(frames(page)).toHaveCount(1);
 await expect(frames(page)).toHaveAttribute('sandbox','allow-scripts');
 await expect(frames(page)).toHaveAttribute('title','Jelenet: '+prefix+' jelenet');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-state','ready',{timeout:10000});
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','true');
 const first=await sceneTime(page);
 await expect.poll(()=>sceneTime(page)).toBeGreaterThan(first);
 await expect(item(page,prefix+' jelenet')).toHaveAttribute('aria-current','true');
 await expect(position(page)).not.toHaveText(/^Pozíció: 0:00 \//);
 // At 12 s the audio entry follows in the MediaPlayer, and the frame is gone.
 await expect(caption(page)).toHaveAttribute('data-demo-stage','audio',{timeout:15000});
 await expect(frames(page)).toHaveCount(0);
 await expect(screen(page).locator('audio')).toHaveCount(1);
 // One stage at a time: the scene's layer and frame were released when the audio's layer replaced it.
 await expect(screen(page).locator('.blade-player')).toHaveCount(1);
 await expect(item(page,prefix+' hang')).toHaveAttribute('aria-current','true');
 await act(page,'Szünet');
 await expect(button(page,'Lejátszás')).toBeEnabled();
 const paused=await strip(page).getAttribute('data-demo-position');
 await page.waitForTimeout(800);
 await expect(strip(page)).toHaveAttribute('data-demo-position',paused);
 expect(errors).toEqual([]);
});

test('seeking within a strip item moves the scene through the frame protocol',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 await item(page,prefix+' jelenet').focus();await page.keyboard.press('Enter');
 await expect(caption(page)).toHaveAttribute('data-demo-stage','scene');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-state','ready',{timeout:10000});
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-time','0.0');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','false');
 const frame=await frames(page).elementHandle();
 // A click 5/8 into the scene's strip item (the scene is 8 s long and starts at 4 s of the run): 5 s into the scene.
 const box=await item(page,prefix+' jelenet').boundingBox();
 await page.mouse.click(box.x+box.width*(5/8),box.y+box.height/2);
 await expect.poll(()=>sceneTime(page)).toBeGreaterThan(4.2);
 expect(await sceneTime(page)).toBeLessThan(5.8);
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','false');
 await expect(strip(page)).toHaveAttribute('data-demo-position',/^(8\.[2-9]|9\.\d)$/);
 // Still the same frame document: a seek is a message, not a reload.
 const before=await sceneTime(page);
 expect(await frame.evaluate(node=>node.isConnected)).toBe(true);
 await expect(frames(page)).toHaveCount(1);
 // Playing from there continues the scene's clock from the sought time.
 await act(page,'Lejátszás');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','true');
 await expect.poll(()=>sceneTime(page)).toBeGreaterThan(before+0.6);
 await act(page,'Szünet');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','false');
 expect(errors).toEqual([]);
});

test('a day change fetches that day and rebuilds the timeline and the stage; Naptár… picks a day in the day action\'s form',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 await item(page,prefix+' jelenet').click();
 await expect(frames(page)).toHaveCount(1);
 const requests=[];
 page.on('request',request=>{try{const body=request.postDataJSON();if(body?.resource==='signage_playlist')requests.push(`${body.action}:${body.values?.date??body.values?.asset}`);}catch{}});
 await act(page,'Következő nap','commands');
 await expect(shownDay(page)).toHaveText(new RegExp(`^${NEXT}`));
 const {timeline}=await day(page,NEXT);
 await expect(items(page)).toHaveCount(timeline.length);
 await expect(items(page).filter({hasText:prefix})).toHaveCount(0);
 await expect(items(page).first()).toHaveAttribute('aria-current','true');
 await expect(position(page)).toHaveText(/^Pozíció: 0:00 \//);
 await expect(caption(page)).toHaveAttribute('data-demo-index','0');
 // The previous day's scene frame is gone (a new one exists only if the new day starts with a scene).
 if(await caption(page).getAttribute('data-demo-stage')!=='scene')await expect(frames(page)).toHaveCount(0);
 expect(requests).toContain('day:'+NEXT);
 await act(page,'Előző nap','commands');
 await expect(shownDay(page)).toHaveText(new RegExp(`^${DAY}`));
 await expect(item(page,prefix+' jelenet')).toHaveCount(1);
 await expect(caption(page)).toHaveAttribute('data-demo-stage','image');
 await expect(frames(page)).toHaveCount(0);
 // Naptár…: the `day` action's form in a window; its answer is the day shown.
 await act(page,'Naptár…','commands');
 const picker=page.locator('.dhx_window').filter({hasText:'Nap választása'});
 await expect(picker.getByLabel('Dátum')).toHaveValue(DAY);
 await picker.getByLabel('Dátum').fill(NEXT);await picker.getByLabel('Dátum').press('Tab');
 await picker.getByRole('button',{name:'Napi műsor',exact:true}).click();
 await expect(picker).toHaveCount(0);
 await expect(shownDay(page)).toHaveText(new RegExp(`^${NEXT}`));
 await expect(items(page).filter({hasText:prefix})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('a failing scene is reported through sandbox:error and the page keeps working',async({page})=>{
 const errors=pageErrors(page),warnings=[];
 page.on('console',message=>{if(message.type()==='warning'&&message.text().startsWith('61ade: sandbox '))warnings.push(message.text());});
 await open(page);
 // The scene action answers with code that throws; the stored fixture stays untouched.
 const actions=url=>url.searchParams.get('blade')==='1';
 await page.route(actions,async route=>{
  let body;try{body=route.request().postDataJSON();}catch{}
  if(body?.resource!=='signage_playlist'||body.action!=='scene')return route.fallback();
  await route.fulfill({json:{ok:true,data:{asset:String(body.values.asset),title:'x',name:'x.js',bytes:32,code:`throw new Error("${prefix} hiba");`}}});
 });
 // A day change empties the module's scene cache, so the scene is fetched again (through the route).
 await act(page,'Következő nap','commands');await expect(shownDay(page)).toHaveText(new RegExp(`^${NEXT}`));
 await act(page,'Előző nap','commands');await expect(item(page,prefix+' jelenet')).toHaveCount(1);
 await item(page,prefix+' jelenet').click();
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-state','error',{timeout:10000});
 await expect(sceneState(page)).toHaveText(`A jelenet hibát jelzett: ${prefix} hiba`);
 // SandboxFrame reports every error on the page's `sandbox:error` event and the console in one step.
 expect(warnings).toContain(`61ade: sandbox error: ${prefix} hiba`);
 // The page goes on: another entry plays, and the timeline still works.
 await item(page,prefix+' hang').click();
 await expect(caption(page)).toHaveAttribute('data-demo-stage','audio');
 await expect(frames(page)).toHaveCount(0);
 await act(page,'Lejátszás');await expect(button(page,'Szünet')).toBeEnabled();
 await act(page,'Szünet');await expect(button(page,'Lejátszás')).toBeEnabled();
 await page.unroute(actions);
 expect(errors).toEqual([]);
});

test('navigation destroys the frame, the player and the clock; Back opens a fresh preview',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 await item(page,prefix+' jelenet').click();
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-state','ready',{timeout:10000});
 await act(page,'Lejátszás');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','true');
 await openMenu(page,'Médiatár','Digitális kijelző');
 await expect(page).toHaveURL(/#view=signage_assets$/);
 await expect(frames(page)).toHaveCount(0);
 await expect(page.locator('[data-demo-part]')).toHaveCount(0);
 await expect(page.locator('iframe')).toHaveCount(0);
 // Nothing of the closed preview runs on: no playlist or scene request follows.
 const late=[];
 page.on('request',request=>{try{if(request.postDataJSON()?.resource==='signage_playlist')late.push(request.postDataJSON().action);}catch{}});
 await page.waitForTimeout(1500);
 expect(late).toEqual([]);
 await page.goBack();
 await expect(page).toHaveURL(/#view=demo\.playlist-preview/);
 await expect(items(page).first()).toBeVisible();
 expect(await frames(page).count()).toBeLessThanOrEqual(1);
 expect(errors).toEqual([]);
});

test('phone width: stacked panels, commands in Műveletek, no page overflow; widening keeps the state',async({page})=>{
 test.setTimeout(60000);
 const errors=pageErrors(page);
 await open(page,390,844);
 await expect(page.locator('[data-demo-part="commands"]').getByRole('button',{name:'Műveletek',exact:true})).toBeVisible();
 await expect(button(page,'Lejátszás')).toHaveCount(0);
 await act(page,'Lejátszás');
 await expect(caption(page)).toHaveAttribute('data-demo-stage','scene',{timeout:10000});
 await expect(frames(page)).toHaveCount(1);
 await expect(frames(page)).toBeVisible();
 await act(page,'Szünet');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // The strip is wider than the phone and scrolls inside its own cell.
 expect(await strip(page).evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
 // Crossing 768 px keeps the day, the position and the stage (the same panels; the commands unfold).
 const at=await strip(page).getAttribute('data-demo-position');
 await page.setViewportSize({width:1366,height:900});
 await expect(shownDay(page)).toHaveText(new RegExp(`^${DAY}`));
 await expect(strip(page)).toHaveAttribute('data-demo-position',at);
 await expect(caption(page)).toHaveAttribute('data-demo-stage','scene');
 await expect(frames(page)).toHaveCount(1);
 expect(errors).toEqual([]);
});

test('dark theme: strip and caption take the theme colours',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 const colours=()=>page.evaluate(()=>['[data-demo-item]','[data-demo-part="caption"]'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor).join(' '));
 const light=await colours();
 await page.getByRole('button',{name:/Skyblue|Világos|Éjjeli/}).click();await page.getByRole('menuitem',{name:'Éjjeli',exact:true}).click();
 await expect.poll(colours).not.toBe(light);
 await expect(items(page).first()).toBeVisible();
 await page.getByRole('button',{name:'Éjjeli'}).click();await page.getByRole('menuitem',{name:'Skyblue',exact:true}).click();
 await expect.poll(colours).toBe(light);
 expect(errors).toEqual([]);
});

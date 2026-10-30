const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,command,api}=require('./feature-demo.cjs');
// Toolkit D2 (docs/demos.md#toolkit-d2-playlist): Digitális kijelző → Napi műsor, the project view kind
// `demo.playlist-preview` (frontend/src/playlist.ts): the day's `signage_playlist.day` timeline in order with play times,
// the playhead driving the MediaPlayer (image, audio) and a SandboxFrame scene (code from `signage_playlist.scene`),
// scrubbing through the frame protocol (asserted through the state the frame reports, not pixels), the API panel, a day
// change, a failing scene reported through `sandbox:error`, destruction on navigation, the phone layout and the dark
// theme. The run seeds its own assets, events and date default on a far-future Saturday with the run prefix (over the
// seeded Signage files, the scene fixture included) and removes them afterwards; seeded demo data is never changed.
const prefix='pp'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
// A Saturday (no weekday programme) and the Sunday after it.
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
  $files=['kép'=>[$file("mime_type LIKE 'image/%'"),'4'],'jelenet'=>[$file("mime_type='text/javascript' AND name='minta-jelenet.js'"),'8'],'hang'=>[$file("mime_type LIKE 'audio/%'"),'3']];
  foreach($files as [$id])if($id==='')throw new RuntimeException('Signage image, audio or scene file missing: run setup-workspace.php (D2 data step).');
  $asset=$db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)');$ids=[];
  foreach($files as $name=>[$id,$seconds]){$asset->execute(['${prefix} '.$name,$id,$seconds]);$ids[$name]=(string)$db->lastInsertId();}
  $db->prepare("INSERT INTO signage_defaults(weekday,date,asset_id) VALUES ('',?,?)")->execute(['${DAY}',$ids['kép']]);
  $event=$db->prepare("INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,data) VALUES ('signage',?,?,?,'',0,?)");
  $event->execute(['${prefix} jelenet','${DAY} 08:00:00','${DAY} 09:00:00',json_encode(['asset_id'=>$ids['jelenet']])]);
  $event->execute(['${prefix} hang','${DAY} 09:00:00','${DAY} 10:00:00',json_encode(['asset_id'=>$ids['hang']])]);`);
});
test.afterAll(cleanup);

const strip=page=>page.locator('[data-demo-part="strip"]');
const items=page=>strip(page).locator('[data-demo-item]');
const item=(page,title)=>items(page).filter({has:page.locator('.demo-playlist-item__title',{hasText:new RegExp('^'+title+'$')})});
const caption=page=>page.locator('[data-demo-part="caption"]');
const sceneState=page=>caption(page).locator('[data-demo-scene-state]');
const sceneTime=async page=>Number(await sceneState(page).getAttribute('data-demo-scene-time'));
const frames=page=>page.locator('iframe.blade-sandbox__frame');
const panel=page=>page.locator('[data-demo-part="api"]');
const dayInput=page=>page.locator('[data-cell-id="day"] input');
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const position=page=>page.getByRole('button',{name:/^Pozíció: \d+:\d\d \/ \d+:\d\d$/});
const clock=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds)%60).padStart(2,'0')}`;
const seconds=slot=>slot.asset?Math.min(3600,Math.max(1,Math.round(Number(slot.asset.duration)||0))):3;
function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
async function open(page,width=1600,height=1000){
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.playlist-preview&filter.date=${DAY}`);
 await expect(items(page).first()).toBeVisible();
 await expect(dayInput(page)).toHaveValue(DAY);
}
// The day's timeline as the API answers it, and the preview's run length.
async function day(page,date=DAY){
 const answer=await api(page,'signage_playlist','day',null,{date});expect(answer.status,JSON.stringify(answer.body)).toBe(200);
 const timeline=answer.body.data.timeline;
 return {timeline,total:timeline.reduce((sum,slot)=>sum+seconds(slot),0)};
}

test('timeline lists the day\'s entries in order with their play times; the API panel shows the request and answer',async({page})=>{
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
 // The view still documents the API: the request an API client sends, and the answer.
 for(const text of ['POST ./?blade=1','Authorization: Bearer','"resource": "signage_playlist"','"action": "day"',`"date": "${DAY}"`,'"timeline"',`"title": "${prefix} jelenet"`])
  await expect(panel(page)).toContainText(text);
 // The stage shows the first entry, the image, in the MediaPlayer.
 await expect(caption(page)).toHaveAttribute('data-demo-stage','image');
 await expect(caption(page)).toContainText(`00:00–08:00 · ${prefix} kép · Kép`);
 await expect(page.locator('[data-cell-id="screen"] img')).toBeVisible();
 await expect(frames(page)).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('the playhead advances and the stage switches from the image to the scene and on to the audio',async({page})=>{
 test.setTimeout(60000);
 const errors=pageErrors(page);
 await open(page);
 await command(page,'Lejátszás');
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
 await expect(page.locator('[data-cell-id="screen"] audio')).toHaveCount(1);
 await expect(item(page,prefix+' hang')).toHaveAttribute('aria-current','true');
 await command(page,'Szünet');
 await expect(button(page,'Lejátszás')).toBeEnabled();
 const paused=await strip(page).getAttribute('data-demo-position');
 await page.waitForTimeout(800);
 await expect(strip(page)).toHaveAttribute('data-demo-position',paused);
 expect(errors).toEqual([]);
});

test('scrubbing seeks the scene through the frame protocol',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 const {total}=await day(page);
 await item(page,prefix+' jelenet').click();
 await expect(caption(page)).toHaveAttribute('data-demo-stage','scene');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-state','ready',{timeout:10000});
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-time','0.0');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','false');
 const frame=await frames(page).elementHandle();
 // A click on the Suite Slider's track at 9 s of the run: 5 s into the scene entry (it starts at 4 s).
 const box=await page.locator('[data-cell-id="scrub"] .dhx_slider__track').boundingBox();
 await page.mouse.click(box.x+box.width*(9/total),box.y+box.height/2);
 await expect.poll(()=>sceneTime(page)).toBeGreaterThan(4.2);
 expect(await sceneTime(page)).toBeLessThan(5.8);
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','false');
 await expect(strip(page)).toHaveAttribute('data-demo-position',/^(8\.[2-9]|9\.\d)$/);
 // The thumb's arrow keys step 0.1 s; still the same frame document (a seek is a message, not a reload).
 const before=await sceneTime(page);
 await page.locator('[data-cell-id="scrub"] .dhx_slider__thumb').focus();
 for(let index=0;index<5;index++)await page.keyboard.press('ArrowRight');
 await expect.poll(()=>sceneTime(page)).toBeGreaterThan(before+0.25);
 expect(await sceneTime(page)).toBeLessThan(before+0.75);
 expect(await frame.evaluate(node=>node.isConnected)).toBe(true);
 await expect(frames(page)).toHaveCount(1);
 // Playing from there continues the scene's clock from the scrubbed time.
 await command(page,'Lejátszás');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','true');
 await expect.poll(()=>sceneTime(page)).toBeGreaterThan(before+0.6);
 await command(page,'Szünet');
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-playing','false');
 expect(errors).toEqual([]);
});

test('a day change fetches that day and rebuilds the timeline and the stage',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 await item(page,prefix+' jelenet').click();
 await expect(frames(page)).toHaveCount(1);
 const requests=[];
 page.on('request',request=>{try{const body=request.postDataJSON();if(body?.resource==='signage_playlist')requests.push(`${body.action}:${body.values?.date??body.values?.asset}`);}catch{}});
 await command(page,'Következő nap');
 await expect(dayInput(page)).toHaveValue(NEXT);
 await expect(panel(page)).toContainText(`"date": "${NEXT}"`);
 const {timeline}=await day(page,NEXT);
 await expect(items(page)).toHaveCount(timeline.length);
 await expect(items(page).filter({hasText:prefix})).toHaveCount(0);
 await expect(items(page).first()).toHaveAttribute('aria-current','true');
 await expect(position(page)).toHaveText(/^Pozíció: 0:00 \//);
 await expect(caption(page)).toHaveAttribute('data-demo-index','0');
 // The previous day's scene frame is gone (a new one exists only if the new day starts with a scene).
 if(await caption(page).getAttribute('data-demo-stage')!=='scene')await expect(frames(page)).toHaveCount(0);
 expect(requests).toContain('day:'+NEXT);
 await command(page,'Előző nap');
 await expect(dayInput(page)).toHaveValue(DAY);
 await expect(item(page,prefix+' jelenet')).toHaveCount(1);
 await expect(caption(page)).toHaveAttribute('data-demo-stage','image');
 await expect(frames(page)).toHaveCount(0);
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
 await command(page,'Következő nap');await expect(panel(page)).toContainText(`"date": "${NEXT}"`);
 await command(page,'Előző nap');await expect(item(page,prefix+' jelenet')).toHaveCount(1);
 await item(page,prefix+' jelenet').click();
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-state','error',{timeout:10000});
 await expect(sceneState(page)).toHaveText(`A jelenet hibát jelzett: ${prefix} hiba`);
 // SandboxFrame reports every error on the page's `sandbox:error` event and the console in one step.
 expect(warnings).toContain(`61ade: sandbox error: ${prefix} hiba`);
 // The page goes on: another entry plays, and the timeline still works.
 await item(page,prefix+' hang').click();
 await expect(caption(page)).toHaveAttribute('data-demo-stage','audio');
 await expect(frames(page)).toHaveCount(0);
 await command(page,'Lejátszás');await expect(button(page,'Szünet')).toBeEnabled();
 await command(page,'Szünet');await expect(button(page,'Lejátszás')).toBeEnabled();
 await page.unroute(actions);
 expect(errors).toEqual([]);
});

test('navigation destroys the frame, the player and the clock; Back opens a fresh preview',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 await item(page,prefix+' jelenet').click();
 await expect(sceneState(page)).toHaveAttribute('data-demo-scene-state','ready',{timeout:10000});
 await command(page,'Lejátszás');
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

test('phone width: stacked layout, commands in Műveletek, collapsed API panel, no page overflow; the breakpoint keeps the state',async({page})=>{
 test.setTimeout(60000);
 const errors=pageErrors(page);
 await open(page,390,844);
 await expect(button(page,'Műveletek')).toBeVisible();
 await expect(button(page,'Lejátszás')).toHaveCount(0);
 await command(page,'Lejátszás');
 await expect(caption(page)).toHaveAttribute('data-demo-stage','scene',{timeout:10000});
 await expect(frames(page)).toHaveCount(1);
 await expect(frames(page)).toBeVisible();
 await command(page,'Szünet');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // The strip is wider than the phone and scrolls inside its own cell.
 expect(await strip(page).evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
 // The API panel starts collapsed (not rendered) and opens from its header.
 await expect(panel(page)).toHaveCount(0);
 await page.locator('[data-cell-id="api"] .dhx_layout-cell-header').click();
 await expect(panel(page)).toContainText('Authorization: Bearer');
 // Crossing 768 px rebuilds the page with the same day, position and stage.
 const at=await strip(page).getAttribute('data-demo-position');
 await page.setViewportSize({width:1366,height:900});
 await expect(dayInput(page)).toHaveValue(DAY);
 await expect(strip(page)).toHaveAttribute('data-demo-position',at);
 await expect(caption(page)).toHaveAttribute('data-demo-stage','scene');
 await expect(frames(page)).toHaveCount(1);
 expect(errors).toEqual([]);
});

test('dark theme: strip, caption and API panel take the theme colours',async({page})=>{
 const errors=pageErrors(page);
 await open(page);
 const colours=()=>page.evaluate(()=>['[data-demo-item]','[data-demo-part="api"] pre'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor).join(' '));
 const light=await colours();
 await page.getByRole('button',{name:/Skyblue|Világos|Éjjeli/}).click();await page.getByRole('menuitem',{name:'Éjjeli',exact:true}).click();
 await expect.poll(colours).not.toBe(light);
 await expect(items(page).first()).toBeVisible();
 await page.getByRole('button',{name:'Éjjeli'}).click();await page.getByRole('menuitem',{name:'Skyblue',exact:true}).click();
 await expect.poll(colours).toBe(light);
 expect(errors).toEqual([]);
});

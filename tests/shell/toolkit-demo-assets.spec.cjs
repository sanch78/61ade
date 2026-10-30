const {test,expect}=require('../../tools/playwright-test.cjs');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {signIn,command,api}=require('./feature-demo.cjs');
// Toolkit D1 (docs/demos.md#toolkit-consumer): Digitális kijelző → Médiatár with the synthetic audio assets and the
// project record view `demo.asset-viewer` (frontend/src/assets.ts): activation by the file's media class (audio and
// video open the viewer, an image its details) in table, cards and tiles; the viewer's CommandBar (play, pause,
// position, loop), RecordDetails and MediaPlayer; back navigation, reload of the address, a record change, the phone
// layout, themes and clean destruction. Assets and files created here start with the run prefix and are removed
// afterwards; the seeded demo data (FB-0082) is never changed.
const prefix='pd'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const fixture=name=>fs.readFileSync(path.resolve(__dirname,'../../examples/demo-app/resources/files',name));
const WAV='Szinuszhang 440 Hz (WAV)',MP3='Szinuszhang 660 Hz (MP3)',M4A='Szinuszhang 880 Hz (M4A)',VIDEO='Promóciós videó',IMAGE='Logó állókép';
test.describe.configure({mode:'serial'});
test.afterAll(()=>php(`
 $db->exec("DELETE FROM signage_assets WHERE title LIKE '${prefix}%'");
 $db->exec("DELETE FROM blade_files WHERE space='demo' AND name LIKE '${prefix}%'");`));

const grid=page=>page.locator('[data-cell-id="grid"]');
const row=(page,title)=>grid(page).locator('.dhx_grid-row').filter({has:page.getByRole('gridcell',{name:title,exact:true})});
const card=(page,title)=>grid(page).locator('.blade-grid-card').filter({hasText:title}).first();
const tile=(page,title)=>grid(page).locator('.blade-grid-tile').filter({hasText:title}).first();
const details=page=>page.getByRole('dialog',{name:'Rekordadatok'});
const audio=page=>page.locator('.blade-audio-stage audio');
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const position=page=>page.getByRole('button',{name:/^Pozíció: \d+:\d\d \/ \d+:\d\d$/});
const viewerUrl=id=>new RegExp(`#view=demo\\.asset-viewer&record=${id}$`);
// An address change inside the signed-in page (the shell routes on hashchange, like a bookmark or a link).
const go=(page,id)=>page.evaluate(id=>{location.hash='#view=demo.asset-viewer&record='+id;},id);
// Grid column id of a header (derived columns have consumer-chosen ids).
async function cell(page,title,header){
 const head=grid(page).locator('[role="columnheader"]').filter({hasText:header}).first();await expect(head).toBeVisible();
 return row(page,title).locator(`.dhx_grid-cell[data-dhx-col-id="${await head.getAttribute('data-dhx-id')}"]`);
}
// The view selector, also when the command bar has moved into the responsive "Műveletek" menu.
async function mode(page,label){
 const menu=grid(page).getByRole('button',{name:/^(Műveletek|Actions)$/});
 if(await menu.isVisible()){
  await menu.click();const item=page.getByRole('menuitem',{name:/^(Nézet|View):/});
  if((await item.textContent()).includes(label)){await page.keyboard.press('Escape');return;}
  await item.click();await page.getByRole('menuitem',{name:label,exact:true}).click();return;
 }
 const selector=page.getByRole('button',{name:/^Nézet:/});
 if((await selector.textContent()).includes(label))return;
 await selector.click();await page.getByRole('menuitem',{name:label,exact:true}).click();await expect(selector).toHaveText('Nézet: '+label);
}
async function search(page,text){
 const box=grid(page).getByRole('textbox',{name:'Keresés',exact:true});
 const listed=page.waitForResponse(r=>{try{const body=r.request().postDataJSON();return body?.action==='list'&&(body.values?.search??'')===text;}catch{return false;}});
 await box.fill(text);await box.press('Enter');await listed;
}
async function openLibrary(page,width=1600){
 await page.setViewportSize({width,height:1000});await signIn(page,'demo@example.test','/#view=signage_assets');
 await expect(grid(page).locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();
 await mode(page,'Táblázat');
}
async function assetId(page,title){
 const listed=await api(page,'signage_assets','list',null,{mode:'dynamic',limit:100,sort:{field:'id',direction:'desc'},filters:{},search:title});
 expect(listed.status,JSON.stringify(listed.body)).toBe(200);
 const item=listed.body.data.items.find(item=>item.title===title);expect(item,`asset "${title}" (run the D1 data step, docs/demos.md)`).toBeTruthy();
 return String(item.id);
}
// The viewer is open for $title: the address, the audio or video element named by the asset, the command bar and details.
async function viewerOpen(page,id,title,element='audio'){
 await expect(page).toHaveURL(viewerUrl(id));
 await expect(page.locator(`.blade-player ${element}`)).toHaveCount(1);
 await expect(page.locator(`.blade-player ${element}`)).toHaveAttribute('aria-label',title);
 await expect(page.locator('.blade-record-details')).toContainText(title);
}

test('Médiatár lists the audio assets with type and length; an audio file uploaded in the file field becomes an audio asset',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page,1920);
 for(const [title,length] of [[WAV,'0:03'],[MP3,'0:04'],[M4A,'0:05']]){
  await search(page,title);
  await expect(await cell(page,title,'Típus')).toHaveText('Hang');
  await expect(await cell(page,title,'Hossz')).toHaveText(length);
  await expect(await cell(page,title,'Felbontás')).toHaveText('');
  await expect(row(page,title).getByRole('img',{name:new RegExp(`^Hang: minta-hang\\.\\w+, ${length}$`)})).toBeVisible();
 }
 await search(page,'');
 // Upload through the asset's file field: the shared uploader stores the WAV in the Signage folder and chooses it.
 await command(page,'Hozzáadás');
 const form=page.getByRole('dialog',{name:/ — Hozzáadás$/});await expect(form).toBeVisible();
 await form.getByLabel('Megnevezés',{exact:true}).fill(prefix+' hang');
 await form.getByRole('button',{name:'Fájl feltöltése…',exact:true}).click();
 const uploader=page.getByRole('dialog').filter({has:page.locator('.blade-uploader')});
 await expect(uploader).toBeVisible();await expect(uploader).toContainText('Signage:/');
 await page.locator('input[data-blade-upload-input="files"]').setInputFiles([{name:prefix+'-hang.wav',mimeType:'audio/wav',buffer:fixture('minta-hang.wav')}]);
 await expect(form.locator('.blade-file-field__body input').first()).toHaveValue(prefix+'-hang.wav',{timeout:20000});
 await uploader.getByRole('button',{name:'Bezárás',exact:true}).click();
 const saved=page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==='create';}catch{return false;}});
 await form.getByRole('button',{name:'Mentés',exact:true}).click();expect((await saved).status()).toBe(200);
 await expect(form).toHaveCount(0);
 await search(page,prefix+' hang');
 await expect(await cell(page,prefix+' hang','Típus')).toHaveText('Hang');
 await expect(await cell(page,prefix+' hang','Hossz')).toHaveText('0:03');
 const id=await assetId(page,prefix+' hang');
 const media=(await api(page,'signage_assets','get',id)).body.data._media.file_id;
 expect(media).toMatchObject({name:prefix+'-hang.wav',mime_type:'audio/wav',thumbnail:'none'});expect(Math.abs(media.duration_ms-3000)).toBeLessThanOrEqual(150);
 // The uploaded asset opens in the viewer like the seeded ones.
 await row(page,prefix+' hang').locator('[data-dhx-col-id="title"]').dblclick();
 await viewerOpen(page,id,prefix+' hang');
 expect(errors).toEqual([]);
});

test('activation by media class: audio and video open the viewer, an image its details, in table, cards and tiles',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);
 const wav=await assetId(page,WAV),video=await assetId(page,VIDEO),image=await assetId(page,IMAGE);
 // Table: double-click and Enter; the browser's Back returns to the list.
 await row(page,WAV).locator('[data-dhx-col-id="title"]').dblclick();
 await viewerOpen(page,wav,WAV);
 await page.goBack();await expect(page).toHaveURL(/#view=signage_assets$/);await expect(audio(page)).toHaveCount(0);
 await row(page,VIDEO).locator('[data-dhx-col-id="title"]').click();await page.keyboard.press('Enter');
 await viewerOpen(page,video,VIDEO,'video');
 await button(page,'Vissza a listához').click();await expect(page).toHaveURL(/#view=signage_assets$/);await expect(page.locator('.blade-player')).toHaveCount(0);
 await row(page,IMAGE).locator('[data-dhx-col-id="title"]').dblclick();
 await expect(details(page)).toBeVisible();await expect(details(page)).toContainText(IMAGE);await expect(page).toHaveURL(/#view=signage_assets$/);
 await page.keyboard.press('Escape');await expect(details(page)).toHaveCount(0);
 // Cards and tiles name the per-row target and open the same views.
 for(const [label,item] of [['Kártyák',card],['Csempék',tile]]){
  await mode(page,label);
  await expect(item(page,WAV)).toHaveAttribute('aria-description','Megnyitás: Médianéző');
  await expect(item(page,VIDEO)).toHaveAttribute('aria-description','Megnyitás: Médianéző');
  await expect(item(page,IMAGE)).toHaveAttribute('aria-description','Megnyitás: Adatok');
  await item(page,WAV).dblclick();await viewerOpen(page,wav,WAV);
  await page.goBack();await expect(page).toHaveURL(/#view=signage_assets$/);
  await item(page,VIDEO).click();await page.keyboard.press('Enter');await viewerOpen(page,video,VIDEO,'video');
  await page.goBack();await expect(page).toHaveURL(/#view=signage_assets$/);
  await item(page,IMAGE).dblclick();await expect(details(page)).toBeVisible();await expect(page).toHaveURL(/#view=signage_assets$/);
  await page.keyboard.press('Escape');await expect(details(page)).toHaveCount(0);
 }
 await mode(page,'Táblázat');
 // Opened by its address, an image record shows the image stage with the player's zoom toolbar and no media commands.
 await go(page,image);
 await expect(page.locator('.blade-player .blade-image-stage')).toBeVisible();
 await expect(page.locator('.blade-player [data-dhx-id="zoom"]')).toBeVisible();
 await expect(button(page,'Lejátszás')).toHaveCount(0);await expect(position(page)).toHaveCount(0);
 await expect(page.locator('.blade-record-details')).toContainText(IMAGE);
 expect(errors).toEqual([]);
});

test('viewer on an audio asset: play, pause, position, loop, details, reload, record change and destroy',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);
 const wav=await assetId(page,WAV),mp3=await assetId(page,MP3);
 await go(page,wav);
 await viewerOpen(page,wav,WAV);
 const element=audio(page);
 await element.evaluate(node=>{node.muted=true;});
 // The command bar: every media command is enabled once the metadata is known; the position shows the length.
 for(const name of ['Vissza a listához','Lejátszás','Szünet','Elejére','Vissza 5 mp','Előre 5 mp'])await expect(button(page,name)).toBeEnabled();
 const loop=page.getByRole('button',{name:/^Ismétlés: (ki|be)$/});await expect(loop).toBeEnabled();
 if((await loop.textContent()).includes('be'))await loop.click();
 await expect(button(page,'Ismétlés: ki')).toBeVisible();
 await expect(position(page)).toHaveText('Pozíció: 0:00 / 0:03');
 // Details of the asset: the media slot, derived type and length, the play time.
 const record=page.locator('.blade-record-details');
 await expect(record.getByRole('img',{name:'Hang: minta-hang.wav, 0:03',exact:true})).toBeVisible();
 for(const text of ['Megnevezés',WAV,'Típus','Hang','Hossz','0:03','Lejátszási idő (mp)'])await expect(record).toContainText(text);
 // Play and pause.
 await button(page,'Lejátszás').click();await expect.poll(()=>element.evaluate(node=>node.paused)).toBe(false);
 await expect(position(page)).toHaveText(/^Pozíció: 0:0[1-3] \/ 0:03$/,{timeout:5000});
 await button(page,'Szünet').click();await expect.poll(()=>element.evaluate(node=>node.paused)).toBe(true);
 // Position: to the start, forward clamps to the length, back to 0.
 await button(page,'Elejére').click();await expect.poll(()=>element.evaluate(node=>node.currentTime)).toBe(0);
 await expect(position(page)).toHaveText('Pozíció: 0:00 / 0:03');
 await button(page,'Előre 5 mp').click();await expect.poll(()=>element.evaluate(node=>Math.round(node.currentTime))).toBe(3);
 await expect(position(page)).toHaveText('Pozíció: 0:03 / 0:03');
 await button(page,'Vissza 5 mp').click();await expect.poll(()=>element.evaluate(node=>node.currentTime)).toBe(0);
 // Loop: without it the tone ends and stays paused; with it playback starts again from the start.
 await element.evaluate(node=>{node.currentTime=2.6;});await button(page,'Lejátszás').click();
 await expect.poll(()=>element.evaluate(node=>node.ended&&node.paused),{timeout:5000}).toBe(true);
 await button(page,'Ismétlés: ki').click();await expect(button(page,'Ismétlés: be')).toBeVisible();
 await element.evaluate(node=>{node.currentTime=2.6;});await button(page,'Lejátszás').click();
 await expect.poll(()=>element.evaluate(node=>!node.paused&&node.currentTime<1.5),{timeout:6000}).toBe(true);
 await button(page,'Szünet').click();
 // The loop choice is a browser preference of the viewer: kept across a reload of the address.
 await page.reload();
 await viewerOpen(page,wav,WAV);await expect(button(page,'Ismétlés: be')).toBeVisible();
 await button(page,'Ismétlés: be').click();await expect(button(page,'Ismétlés: ki')).toBeVisible();
 // Another record of the same view replaces the content: one player, one command bar, the new asset's details.
 await go(page,mp3);
 await viewerOpen(page,mp3,MP3);
 await expect(page.locator('.blade-player')).toHaveCount(1);await expect(button(page,'Lejátszás')).toHaveCount(1);
 await expect(page.locator('.blade-record-details')).toHaveCount(1);await expect(page.locator('.blade-record-details')).not.toContainText(WAV);
 await expect(position(page)).toHaveText('Pozíció: 0:00 / 0:04');
 // Themes: the stage follows the Suite theme variables.
 const stage=page.locator('.blade-audio-stage');
 const background=async theme=>{await page.evaluate(theme=>document.documentElement.setAttribute('data-dhx-theme',theme),theme);return stage.evaluate(node=>getComputedStyle(node).backgroundColor);};
 expect(await background('light')).not.toBe(await background('dark'));await background('skyblue');
 // Back to the list destroys the viewer: no player, media element, command bar or details remain.
 await button(page,'Vissza a listához').click();
 await expect(page).toHaveURL(/#view=signage_assets$/);await expect(grid(page).locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();
 await expect(page.locator('.blade-player')).toHaveCount(0);await expect(page.locator('audio, video')).toHaveCount(0);
 await expect(page.locator('.blade-record-details')).toHaveCount(0);await expect(button(page,'Lejátszás')).toHaveCount(0);
 // An unknown record shows the error dialog and opens nothing; the list stays.
 await go(page,'999999999');
 const failure=page.getByRole('alertdialog');await expect(failure).toBeVisible();await failure.getByRole('button',{name:'Rendben',exact:true}).click();
 await expect(page.locator('.blade-player')).toHaveCount(0);await expect(grid(page).locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();
 expect(errors).toEqual([]);
});

test('phone width: the commands collapse into Műveletek, the stage sits above the details; widening rebuilds the layout',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});await signIn(page,'demo@example.test','/#view=signage_assets');
 await expect(grid(page).locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();
 const wav=await assetId(page,WAV);
 await go(page,wav);
 await viewerOpen(page,wav,WAV);
 const menu=button(page,'Műveletek');await expect(menu).toBeVisible();await expect(button(page,'Lejátszás')).toHaveCount(0);
 const stage=await page.locator('.blade-audio-stage').boundingBox(),info=await page.locator('.blade-record-details').boundingBox();
 expect(stage.y+stage.height).toBeLessThanOrEqual(info.y+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect((await audio(page).boundingBox()).width).toBeLessThanOrEqual(390);
 await audio(page).evaluate(node=>{node.muted=true;});
 await menu.click();await page.getByRole('menuitem',{name:'Lejátszás',exact:true}).click();
 await expect.poll(()=>audio(page).evaluate(node=>node.paused)).toBe(false);
 await menu.click();await page.getByRole('menuitem',{name:'Szünet',exact:true}).click();
 await expect.poll(()=>audio(page).evaluate(node=>node.paused)).toBe(true);
 const at=await audio(page).evaluate(node=>node.currentTime);
 // Wider than 768 px: the details move beside the stage; the old player is gone and the position is kept.
 await page.setViewportSize({width:1400,height:900});
 await expect(button(page,'Lejátszás')).toBeVisible();await expect(audio(page)).toHaveCount(1);
 const wide=await page.locator('.blade-audio-stage').boundingBox(),side=await page.locator('.blade-record-details').boundingBox();
 expect(side.x).toBeGreaterThanOrEqual(wide.x+wide.width-1);
 await expect.poll(()=>audio(page).evaluate(node=>node.currentTime)).toBeCloseTo(at,0);
 expect(errors).toEqual([]);
});

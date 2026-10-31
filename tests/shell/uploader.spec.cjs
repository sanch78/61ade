const {test,expect}=require('../../tools/playwright-test.cjs');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,command,api}=require('./feature-demo.cjs');
// Framework uploader (Uploader.ts) over the `__upload` transfer protocol, driven through the feature
// demo's file manager (Feature demó → Fájlkezelő), see docs/files.md and docs/files-media-plan.md U2.
// Every entry created here starts with the run prefix; entries, transfers and scratch files are removed.
const prefix='pu'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const scratch=path.resolve(runtime,'uploader-'+prefix);
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
test.describe.configure({mode:'serial'});
test.beforeAll(()=>fs.mkdirSync(scratch,{recursive:true}));
test.afterAll(()=>{
 php(`$q=$db->prepare("DELETE FROM blade_files WHERE space='demo' AND (name LIKE ? OR (parent_id<>0 AND parent_id NOT IN (SELECT id FROM blade_files)))");do{$q->execute(['${prefix}%']);}while($q->rowCount()>0);`);
 // Transfers of this run that a failing test may have left behind (the server also expires them).
 const transfers=path.resolve(runtime,instance,'files','.transfers');
 try{for(const id of fs.readdirSync(transfers)){try{if(fs.readFileSync(path.join(transfers,id,'meta.json'),'utf8').includes(prefix))fs.rmSync(path.join(transfers,id),{recursive:true,force:true});}catch{}}}catch{}
 fs.rmSync(scratch,{recursive:true,force:true});
});

const panel=(page,index)=>page.locator(`[data-cell-id="panel-${index}"]`);
const heading=p=>p.locator('.dhx_layout-cell-header__title').first();
const row=(p,name)=>p.locator('.dhx_grid-row').filter({has:p.page().getByRole('gridcell',{name,exact:true})});
const dialog=page=>page.getByRole('alertdialog');
const uploader=page=>page.getByRole('dialog').filter({has:page.locator('.blade-uploader')});
const queueRow=(page,name)=>uploader(page).locator('.dhx_grid-row').filter({has:page.locator('.blade-uploader__file',{hasText:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})});
const state=(page,name)=>queueRow(page,name).locator('.blade-uploader__state');
const summary=page=>uploader(page).locator('.blade-uploader__summary');
const filesInput=page=>page.locator('input[data-blade-upload-input="files"]');
const toast=(page,text)=>page.locator('.blade-toast').filter({hasText:text});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const jpg=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=','base64');
const text=(name,content)=>({name,mimeType:'text/plain',buffer:Buffer.from(content)});

async function start(page,email='demo@example.test'){
 await page.setViewportSize({width:1400,height:900});await signIn(page,email);
 await openMenu(page,'Fájlkezelő','Feature demó');
 await expect(panel(page,0).locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}
const policy=page=>page.evaluate(()=>JSON.parse(document.getElementById('blade-config').textContent).views.find(view=>view.id==='files').options.upload.policy);
const userId=page=>page.evaluate(()=>JSON.parse(document.getElementById('blade-config').textContent).userId);
async function rootOf(page,mount){return (await api(page,'files','tree',mount)).body.data.root;}
async function list(page,directory){return (await api(page,'files','list',directory)).body.data.items;}
/** A fresh folder at the Drive A root, opened in the left panel. */
async function folder(page,name){
 const created=await api(page,'files','create_directory',await rootOf(page,'a'),{name});expect(created.status).toBe(200);
 const left=panel(page,0);
 await panel(page,0).locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Drive B',exact:true}).click();
 await panel(page,0).locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Drive A',exact:true}).click();
 await row(left,name).dblclick();await expect(heading(left)).toHaveText('Drive A:/'+name);
 return String(created.body.data.id);
}
async function openUploader(page){
 await command(page,'Feltöltés');
 await expect(uploader(page)).toBeVisible();
}
// Every `__upload` envelope the page sends (JSON, or the `request` part of a multipart chunk), recorded
// in the page: Chromium does not expose multipart bodies with file parts to the test runner.
async function record(page){
 await page.evaluate(()=>{
  if(!window.__uploadOps){
   window.__uploadOps=[];const native=window.fetch;
   window.fetch=function(input,init){
    try{const body=init?.body,text=body instanceof FormData?body.get('request'):typeof body==='string'?body:null,json=text&&JSON.parse(text);
     if(json?.action==='__upload')window.__uploadOps.push({target:json.id,resource:json.resource,...json.values});}catch{}
    return native.apply(this,arguments);
   };
  }
  window.__uploadOps.length=0;
 });
 return ()=>page.evaluate(()=>window.__uploadOps.slice());
}
// Chunks are the only multipart `?blade=1` requests the uploader sends.
const isChunk=request=>request.method()==='POST'&&request.url().includes('blade=1')&&(request.headers()['content-type']||'').includes('multipart/form-data');
/** Holds chunk requests after the first `skip` ones until the returned release() (or forever). */
async function holdChunks(page,skip=1){
 let release,seen=0;const held=new Promise(resolve=>{release=resolve;});
 await page.route(url=>url.searchParams.get('blade')==='1',async route=>{
  if(isChunk(route.request())&&seen++>=skip){await held;try{await route.continue();}catch{}return;}
  try{await route.continue();}catch{}
 });
 return ()=>release();
}
const firstChunk=page=>page.waitForResponse(response=>isChunk(response.request()));
/** Records every text the polite live region announces. */
async function announcements(page){
 await page.evaluate(()=>{
  const live=document.querySelector('.blade-uploader-live');window.__announced=[];
  new MutationObserver(()=>{if(live.textContent)window.__announced.push(live.textContent);}).observe(live,{childList:true,characterData:true,subtree:true});
 });
 return ()=>page.evaluate(()=>window.__announced.join('\n'));
}

test('20 mixed files give per-file results without re-sends',async({page})=>{
 test.setTimeout(90000); // 20 files incl. a 5 MB one through preflight, chunks and finish
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 const rules=await policy(page),chunk=rules.chunkBytes;
 expect(rules).toMatchObject({maxFiles:20,folders:true});
 const target=await folder(page,prefix+'-batch');
 const ops=await record(page);
 await openUploader(page);
 await expect(uploader(page)).toContainText('Célmappa: Drive A:/'+prefix+'-batch');
 await expect(uploader(page)).toContainText('Engedélyezett típusok:');
 await expect(uploader(page)).toContainText('Egyszerre legfeljebb 20 fájl tölthető fel.');
 // Rejected files first, so their rows stay in the visible part of the virtual grid.
 const bigSize=Math.min(rules.maxSizeBytes,chunk+4096);
 const files=[
  {name:prefix+'-x.exe',mimeType:'application/octet-stream',buffer:Buffer.from('MZ')},
  {name:prefix+'-large.txt',mimeType:'text/plain',buffer:Buffer.alloc(rules.maxSizeBytes+1,97)},
  {name:prefix+'-fake.png',mimeType:'image/png',buffer:Buffer.from('ez nem kép, hanem szöveg\n')},
  {name:prefix+'-k1.png',mimeType:'image/png',buffer:png},
  {name:prefix+'-big.txt',mimeType:'text/plain',buffer:Buffer.alloc(bigSize,98)},
  {name:prefix+'-k2.png',mimeType:'image/png',buffer:png},
  {name:prefix+'-photo.jpg',mimeType:'image/jpeg',buffer:jpg},
  ...Array.from({length:13},(_,index)=>text(`${prefix}-t${String(index+1).padStart(2,'0')}.txt`,`sor ${index+1}\n`)),
 ];
 expect(files).toHaveLength(20);
 // The batch goes through files on disk (Playwright cannot mix paths and buffers): in-memory buffers
 // of several MB can stall the transfer to the browser under the guarded test memory limit.
 const onDisk=files.map(file=>{const target=path.join(scratch,file.name);fs.writeFileSync(target,file.buffer);return target;});
 await filesInput(page).setInputFiles(onDisk);
 await expect(summary(page)).toHaveText('Sikeres: 17, kihagyva: 0, sikertelen: 3.',{timeout:60000});
 await expect(state(page,prefix+'-x.exe')).toContainText('Sikertelen');await expect(state(page,prefix+'-x.exe')).toContainText('Nem engedélyezett');
 await expect(state(page,prefix+'-large.txt')).toContainText('túl nagy');
 await expect(state(page,prefix+'-fake.png')).toContainText('Sikertelen');await expect(state(page,prefix+'-fake.png')).not.toContainText('Egyik fájl sem');
 await expect(state(page,prefix+'-k1.png')).toHaveText('Kész');
 await expect(queueRow(page,prefix+'-k1.png').getByRole('progressbar',{name:prefix+'-k1.png feltöltése'})).toHaveAttribute('aria-valuenow','100');
 // An image row shows its own thumbnail (object URL), a text row its type icon with an accessible name.
 await expect(queueRow(page,prefix+'-k1.png').locator('img.blade-uploader__thumb')).toHaveAttribute('src',/^blob:/);
 await expect(queueRow(page,prefix+'-x.exe').getByRole('img',{name:'Fájl',exact:true})).toBeVisible();
 // Content that does not decode as an image falls back to the type icon; the progress bar spans its cell.
 await expect(queueRow(page,prefix+'-fake.png').locator('img.blade-uploader__thumb')).toHaveCount(0);
 await expect(queueRow(page,prefix+'-fake.png').getByRole('img',{name:'Kép',exact:true})).toBeVisible();
 const bar=await queueRow(page,prefix+'-k1.png').evaluate(row=>[row.querySelector('.blade-uploader__progress').getBoundingClientRect().width,row.querySelector('.blade-uploader__status').parentElement.getBoundingClientRect().width]);
 expect(bar[0]).toBeGreaterThan(bar[1]*0.7);
 await expect(toast(page,'Feltöltés kész. Sikeres: 17, kihagyva: 0, sikertelen: 3.')).toBeVisible();
 await page.screenshot({path:`${runtime}/uploader/queue.png`});
 // One preflight; no transfer for the files it rejected; every byte sent once, in policy-sized chunks.
 expect((await ops()).filter(op=>op.operation==='upload_preflight')).toHaveLength(1);
 const begun=(await ops()).filter(op=>op.operation==='upload_begin');
 expect(begun.map(op=>op.file.name).sort()).toEqual(files.slice(2).map(file=>file.name).sort());
 const chunks=(await ops()).filter(op=>op.operation==='upload_chunk');
 const expected=files.slice(2).reduce((sum,file)=>sum+Math.ceil(file.buffer.length/chunk),0);
 expect(chunks).toHaveLength(expected);
 expect(new Set(chunks.map(op=>op.transfer+':'+op.offset)).size).toBe(chunks.length);
 expect(chunks.filter(op=>op.offset>0).map(op=>op.offset)).toEqual([chunk]);
 expect((await ops()).filter(op=>op.operation==='upload_finish')).toHaveLength(18);
 expect((await ops()).every(op=>op.action==='upload'&&op.resource==='files'&&String(op.target)===target)).toBe(true);
 // The listing is refreshed by the batch callback; the server stored exactly the accepted files.
 await expect(row(panel(page,0),prefix+'-big.txt')).toBeVisible();
 const stored=await list(page,target);
 expect(stored.map(entry=>entry.name).sort()).toEqual(files.slice(3).map(file=>file.name).sort());
 expect(stored.find(entry=>entry.name===prefix+'-big.txt').size).toBe(bigSize);
 // Clear finished empties the queue; the window closes with its command.
 await uploader(page).getByRole('button',{name:'Befejezettek törlése',exact:true}).click();
 await expect(summary(page)).toHaveText('Nincs fájl a feltöltési sorban.');
 await uploader(page).getByRole('button',{name:'Bezárás',exact:true}).click();await expect(uploader(page)).toBeHidden();
 expect(errors).toEqual([]);
});

test('a conflict asks once with "apply to all"',async({page})=>{
 await start(page);
 const target=await folder(page,prefix+'-conflict');
 const names=['c1.txt','c2.txt','c3.txt'].map(name=>prefix+'-'+name);
 await openUploader(page);
 await filesInput(page).setInputFiles(names.map(name=>text(name,'első\n')));
 await expect(summary(page)).toHaveText('Sikeres: 3, kihagyva: 0, sikertelen: 0.');
 const ops=await record(page);
 await filesInput(page).setInputFiles(names.map(name=>text(name,'második\n')));
 await expect(dialog(page).getByRole('heading',{name:'Névütközés'})).toBeVisible();
 for(const name of ['Felülírás','Átnevezés','Kihagyás','Mégse'])await expect(dialog(page).getByRole('button',{name,exact:true})).toBeVisible();
 await dialog(page).getByRole('checkbox',{name:'Alkalmazás az összes ütközésre'}).check();
 await dialog(page).getByRole('button',{name:'Átnevezés',exact:true}).click();
 await expect(summary(page)).toHaveText('Sikeres: 6, kihagyva: 0, sikertelen: 0.',{timeout:30000});
 // The checked box answered the two later conflicts: no second dialog was needed to finish.
 await expect(dialog(page)).toHaveCount(0);
 const finishes=(await ops()).filter(op=>op.operation==='upload_finish');
 // Each conflicting file: one finish without and at most one with the decision; no chunk is sent again.
 expect(finishes.filter(op=>op.decision==='rename')).toHaveLength(3);
 expect((await ops()).filter(op=>op.operation==='upload_chunk')).toHaveLength(3);
 const stored=(await list(page,target)).map(entry=>entry.name);
 for(const name of names)expect(stored).toContain(name.replace(/\.txt$/,' (2).txt'));
});

test('cancel and retry a transfer',async({page})=>{
 await start(page);
 const rules=await policy(page);
 await folder(page,prefix+'-cancel');
 const name=prefix+'-cancel.txt',ops=await record(page);
 const release=await holdChunks(page,0);
 await openUploader(page);
 const begun=page.waitForResponse(response=>{try{return response.request().postDataJSON()?.values?.operation==='upload_begin';}catch{return false;}});
 await filesInput(page).setInputFiles([{name,mimeType:'text/plain',buffer:Buffer.alloc(rules.chunkBytes+100,99)}]);
 await begun;
 await expect(state(page,name)).toHaveText('Feltöltés…');
 const cancel=queueRow(page,name).getByRole('button',{name:'Megszakítás: '+name,exact:true});
 await cancel.click();
 await expect(state(page,name)).toHaveText('Megszakítva');
 await expect.poll(async()=>(await ops()).filter(op=>op.operation==='upload_abort').length).toBe(1);
 release();await page.unrouteAll({behavior:'ignoreErrors'});
 await queueRow(page,name).getByRole('button',{name:'Újrapróbálás: '+name,exact:true}).click();
 await expect(state(page,name)).toHaveText('Kész',{timeout:30000});
 // The retry is a new transfer: a second begin, and the transfer that was aborted is not continued.
 const begins=(await ops()).filter(op=>op.operation==='upload_begin');expect(begins).toHaveLength(2);
 const aborted=(await ops()).find(op=>op.operation==='upload_abort').transfer;
 expect((await ops()).filter(op=>op.operation==='upload_chunk'&&op.transfer===aborted).length).toBeLessThanOrEqual(1);
 await expect(row(panel(page,0),name)).toBeVisible();
});

test('folder upload keeps relative paths',async({page})=>{
 await start(page);
 const target=await folder(page,prefix+'-folders');
 const top=path.join(scratch,prefix+'-mappa');
 fs.mkdirSync(path.join(top,'al'),{recursive:true});
 fs.writeFileSync(path.join(top,'al','a.txt'),'a\n');fs.writeFileSync(path.join(top,'al','b.txt'),'b\n');fs.writeFileSync(path.join(top,'c.png'),png);
 const ops=await record(page);
 await openUploader(page);
 await expect(uploader(page).getByRole('button',{name:'Mappa kiválasztása',exact:true})).toBeVisible();
 await page.locator('input[data-blade-upload-input="folder"]').setInputFiles(top);
 await expect(summary(page)).toHaveText('Sikeres: 3, kihagyva: 0, sikertelen: 0.');
 await expect(queueRow(page,'a.txt').locator('.blade-uploader__meta')).toContainText(prefix+'-mappa/al');
 const preflight=(await ops()).find(op=>op.operation==='upload_preflight');
 expect(preflight.files.map(file=>file.relative_path).sort()).toEqual([prefix+'-mappa',prefix+'-mappa/al',prefix+'-mappa/al']);
 const created=(await list(page,target)).find(entry=>entry.name===prefix+'-mappa');
 expect(created?.kind).toBe('directory');
 const inner=await list(page,created.id);
 expect(inner.map(entry=>entry.name).sort()).toEqual(['al','c.png']);
 expect((await list(page,inner.find(entry=>entry.name==='al').id)).map(entry=>entry.name).sort()).toEqual(['a.txt','b.txt']);
});

test('clipboard paste queues pasted files',async({page})=>{
 await start(page);
 const target=await folder(page,prefix+'-paste');
 await openUploader(page);
 const zone=uploader(page).locator('.blade-uploader__zone');
 await expect(zone).toBeFocused();
 await zone.evaluate((element,name)=>{
  const data=new DataTransfer();data.items.add(new File(['beillesztett\n'],name,{type:'text/plain'}));
  element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
 },prefix+'-paste.txt');
 await expect(state(page,prefix+'-paste.txt')).toHaveText('Kész');
 expect((await list(page,target)).map(entry=>entry.name)).toEqual([prefix+'-paste.txt']);
});

test('closing the window keeps uploading: shell indicator, then a toast',async({page})=>{
 await start(page);
 const rules=await policy(page);
 await folder(page,prefix+'-background');
 const name=prefix+'-background.txt';
 const release=await holdChunks(page,1);
 await openUploader(page);
 const first=firstChunk(page);
 await filesInput(page).setInputFiles([{name,mimeType:'text/plain',buffer:Buffer.alloc(rules.chunkBytes+100,100)}]);
 await first;
 await uploader(page).getByRole('button',{name:'Bezárás',exact:true}).click();
 await expect(uploader(page)).toBeHidden();
 const indicator=page.locator('.blade-session-bar [data-dhx-id="upload-status"]');
 await expect(indicator).toBeVisible();await expect(indicator).toHaveText(/^\s*Feltöltés: 0\/1 · \d+\s?%\s*$/);
 // The user's name stays left of the application version with the indicator between them.
 const bar=page.locator('.blade-session-bar');
 expect((await bar.getByText('Demo User',{exact:true}).boundingBox()).x).toBeLessThan((await indicator.boundingBox()).x);
 // A click reopens the window with its queue; closing it again keeps the transfer running.
 await indicator.click();await expect(uploader(page)).toBeVisible();await expect(state(page,name)).toHaveText('Feltöltés…');
 await expect(indicator).toBeHidden();
 await uploader(page).getByRole('button',{name:'Bezárás',exact:true}).click();await expect(indicator).toBeVisible();
 release();
 await expect(toast(page,'Feltöltés kész: 1 fájl.')).toBeVisible({timeout:30000});
 await expect(indicator).toBeHidden();
 await page.unrouteAll({behavior:'ignoreErrors'});
 await expect(row(panel(page,0),name)).toBeVisible();
});

test('an interrupted upload resumes after reload from the server offset',async({page})=>{
 await start(page);
 const rules=await policy(page),chunk=rules.chunkBytes;
 const target=await folder(page,prefix+'-resume');
 const name=prefix+'-resume.txt',file=path.join(scratch,name),size=Math.min(rules.maxSizeBytes,chunk+8192);
 fs.writeFileSync(file,Buffer.alloc(size,101));
 await holdChunks(page,1);
 await openUploader(page);
 const first=firstChunk(page);
 await filesInput(page).setInputFiles(file);
 await first;
 const key='blade-uploads:'+await userId(page);
 expect(JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key))).toHaveLength(1);
 // Reload while the second chunk is still held (removing the route first would release it).
 await page.reload();
 await page.unrouteAll({behavior:'ignoreErrors'});
 await expect(panel(page,0).locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
 await row(panel(page,0),prefix+'-resume').dblclick();await expect(heading(panel(page,0))).toHaveText('Drive A:/'+prefix+'-resume');
 const ops=await record(page);
 await openUploader(page);
 await expect(state(page,name)).toContainText('Megszakadt');
 await expect(queueRow(page,name).getByRole('progressbar')).toHaveAttribute('aria-valuenow',String(Math.floor(chunk/size*100)));
 await expect(queueRow(page,name).getByRole('button',{name:'Eltávolítás: '+name,exact:true})).toBeVisible();
 const begin=page.waitForResponse(response=>{try{return response.request().postDataJSON()?.values?.operation==='upload_begin';}catch{return false;}});
 await filesInput(page).setInputFiles(file);
 expect((await (await begin).json()).data.received).toBe(chunk);
 await expect(state(page,name)).toHaveText('Kész',{timeout:30000});
 // Only the missing bytes were sent; the resumed row was reused, not queued twice.
 expect((await ops()).filter(op=>op.operation==='upload_chunk').map(op=>op.offset)).toEqual([chunk]);
 expect((await ops()).some(op=>op.operation==='upload_preflight')).toBe(false);
 await expect(uploader(page).locator('.blade-uploader__file',{hasText:name})).toHaveCount(1);
 expect((await list(page,target)).find(entry=>entry.name===name)?.size).toBe(size);
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBeNull();
});

test('an interrupted file added for another target is queued afresh',async({page})=>{
 await start(page);
 const rules=await policy(page),chunk=rules.chunkBytes;
 const other=await api(page,'files','create_directory',await rootOf(page,'a'),{name:prefix+'-elsewhere'});expect(other.status).toBe(200);
 const elsewhere=String(other.body.data.id),origin=await folder(page,prefix+'-origin');
 const name=prefix+'-moved.txt',file=path.join(scratch,name),size=Math.min(rules.maxSizeBytes,chunk+8192);
 fs.writeFileSync(file,Buffer.alloc(size,102));
 await holdChunks(page,1);
 await openUploader(page);
 const first=firstChunk(page);
 await filesInput(page).setInputFiles(file);
 await first;
 await page.reload();
 await page.unrouteAll({behavior:'ignoreErrors'});
 await expect(panel(page,0).locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
 await row(panel(page,0),prefix+'-elsewhere').dblclick();await expect(heading(panel(page,0))).toHaveText('Drive A:/'+prefix+'-elsewhere');
 const ops=await record(page);
 await openUploader(page);
 await expect(state(page,name)).toContainText('Megszakadt');
 await filesInput(page).setInputFiles(file);
 // The interrupted row keeps waiting for its own folder; a new row sends the whole file to this one.
 await expect(queueRow(page,name)).toHaveCount(2);
 await expect(queueRow(page,name).filter({hasText:'Kész'})).toHaveCount(1,{timeout:30000});
 await expect(queueRow(page,name).filter({hasText:'Megszakadt'})).toHaveCount(1);
 const sent=await ops();
 expect(sent.filter(op=>op.operation==='upload_preflight')).toHaveLength(1);
 expect(sent.filter(op=>op.operation==='upload_begin').map(op=>String(op.target))).toEqual([elsewhere]);
 expect(sent.filter(op=>op.operation==='upload_chunk').map(op=>op.offset)).toEqual([0,chunk]);
 expect((await list(page,elsewhere)).find(entry=>entry.name===name)?.size).toBe(size);
 expect((await list(page,origin)).some(entry=>entry.name===name)).toBe(false);
 // Removing the interrupted row releases its transfer and forgets it.
 await queueRow(page,name).filter({hasText:'Megszakadt'}).getByRole('button',{name:'Eltávolítás: '+name,exact:true}).click();
 await expect.poll(async()=>(await ops()).filter(op=>op.operation==='upload_abort').length).toBe(1);
 expect(await page.evaluate(key=>localStorage.getItem(key),'blade-uploads:'+await userId(page))).toBeNull();
});

test('a retry while the cancelled begin is pending keeps its own controller and transfer',async({page})=>{
 await start(page);
 const rules=await policy(page);
 await folder(page,prefix+'-race');
 const name=prefix+'-race.txt',ops=await record(page);
 // Aborted chunk fetches, counted in the page: a lost controller would leave the newer run's chunk running.
 await page.evaluate(()=>{
  window.__abortedChunks=0;const native=window.fetch;
  window.fetch=function(input,init){if(init?.body instanceof FormData&&init.signal)init.signal.addEventListener('abort',()=>window.__abortedChunks++);return native.apply(this,arguments);};
 });
 let begins=0,releaseBegins,releaseChunks;
 const beginsHeld=new Promise(resolve=>{releaseBegins=resolve;}),chunksHeld=new Promise(resolve=>{releaseChunks=resolve;});
 await page.route(url=>url.searchParams.get('blade')==='1',async route=>{
  let operation='';try{operation=route.request().postDataJSON()?.values?.operation;}catch{}
  if(operation==='upload_begin'){begins++;await beginsHeld;}
  else if(isChunk(route.request()))await chunksHeld;
  try{await route.continue();}catch{}
 });
 await openUploader(page);
 await filesInput(page).setInputFiles([{name,mimeType:'text/plain',buffer:Buffer.alloc(rules.chunkBytes+100,103)}]);
 await expect.poll(()=>begins).toBe(1);
 await expect(state(page,name)).toHaveText('Feltöltés…');
 await queueRow(page,name).getByRole('button',{name:'Megszakítás: '+name,exact:true}).click();
 await expect(state(page,name)).toHaveText('Megszakítva');
 await queueRow(page,name).getByRole('button',{name:'Újrapróbálás: '+name,exact:true}).click();
 await expect(state(page,name)).toHaveText('Feltöltés…');
 await expect.poll(()=>begins).toBe(2);
 // Both begins answer now: the cancelled run neither releases the transfer the retry resumes nor clears its controller.
 const chunk=page.waitForRequest(isChunk);
 releaseBegins();
 await chunk;
 expect((await ops()).filter(op=>op.operation==='upload_abort')).toHaveLength(0);
 await queueRow(page,name).getByRole('button',{name:'Megszakítás: '+name,exact:true}).click();
 await expect(state(page,name)).toHaveText('Megszakítva');
 await expect.poll(()=>page.evaluate(()=>window.__abortedChunks)).toBe(1);
 await expect.poll(async()=>(await ops()).filter(op=>op.operation==='upload_abort').length).toBe(1);
 releaseChunks();await page.unrouteAll({behavior:'ignoreErrors'});
 await queueRow(page,name).getByRole('button',{name:'Újrapróbálás: '+name,exact:true}).click();
 await expect(state(page,name)).toHaveText('Kész',{timeout:30000});
 await expect(row(panel(page,0),name)).toBeVisible();
});

test('a 503 from finish is retried with the kept transfer',async({page})=>{
 await start(page);
 const target=await folder(page,prefix+'-finish503');
 const name=prefix+'-finish503.txt',ops=await record(page);
 let failures=0;
 await page.route(url=>url.searchParams.get('blade')==='1',async route=>{
  let operation='';try{operation=route.request().postDataJSON()?.values?.operation;}catch{}
  if(operation==='upload_finish'&&!failures++)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Átmenetileg nem elérhető.'})});
  try{await route.continue();}catch{}
 });
 await openUploader(page);
 await filesInput(page).setInputFiles([text(name,'újra\n')]);
 await expect(state(page,name)).toHaveText('Kész',{timeout:30000});
 await page.unrouteAll({behavior:'ignoreErrors'});
 const finishes=(await ops()).filter(op=>op.operation==='upload_finish');
 expect(finishes).toHaveLength(2);expect(finishes[1].transfer).toBe(finishes[0].transfer);
 expect((await list(page,target)).map(entry=>entry.name)).toEqual([name]);
});

test('a generic consumer result is one success; a result with only failures is a failure',async({page})=>{
 await start(page);
 await folder(page,prefix+'-generic');
 const ops=await record(page);
 // Answers of other target actions: a plain `{ok: true}` and the per-file shape with one refusal.
 const answers=[{ok:true},{failed:[{name:prefix+'-refused.txt',code:'type',error:'Nem fogadható el.'}]}];
 await page.route(url=>url.searchParams.get('blade')==='1',async route=>{
  let operation='';try{operation=route.request().postDataJSON()?.values?.operation;}catch{}
  if(operation==='upload_finish')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:answers.shift()})});
  try{await route.continue();}catch{}
 });
 await openUploader(page);
 await filesInput(page).setInputFiles([text(prefix+'-generic.txt','általános\n')]);
 await expect(state(page,prefix+'-generic.txt')).toHaveText('Kész');
 await expect(summary(page)).toHaveText('Sikeres: 1, kihagyva: 0, sikertelen: 0.');
 await filesInput(page).setInputFiles([text(prefix+'-refused.txt','elutasított\n')]);
 await expect(state(page,prefix+'-refused.txt')).toHaveText('Sikertelen: Nem fogadható el.');
 await expect(summary(page)).toHaveText('Sikeres: 1, kihagyva: 0, sikertelen: 1.');
 await page.unrouteAll({behavior:'ignoreErrors'});
 // The fulfilled finishes never ran the action: release the transfers the server still keeps.
 for(const op of (await ops()).filter(op=>op.operation==='upload_finish'))
  expect((await api(page,'files','__upload',String(op.target),{operation:'upload_abort',action:'upload',transfer:op.transfer})).status).toBe(200);
});

test('keyboard path, accessible names and polite announcements',async({page})=>{
 await start(page);
 await folder(page,prefix+'-keys');
 await openUploader(page);
 const read=await announcements(page);
 await expect(page.locator('.blade-uploader-live')).toHaveAttribute('aria-live','polite');
 const zone=uploader(page).locator('.blade-uploader__zone');
 await expect(zone).toBeFocused();await expect(zone).toHaveAccessibleName('Feltöltési terület');
 await page.keyboard.press('Tab');
 const pick=uploader(page).getByRole('button',{name:'Fájlok kiválasztása',exact:true});
 await expect(pick).toBeFocused();
 const chooser=page.waitForEvent('filechooser');
 await page.keyboard.press('Enter');
 const name=prefix+'-key.txt';
 await (await chooser).setFiles([text(name,'billentyűzet\n')]);
 await expect(state(page,name)).toHaveText('Kész');
 await expect.poll(read).toContain('Feltöltés elindult: 1 fájl.');
 await expect.poll(read).toContain('Feltöltve: '+name);
 await expect.poll(read).toContain('Feltöltés kész: 1 fájl.');
 // Tab reaches the row's Remove button; Space activates it and focus returns to the drop zone.
 const remove=queueRow(page,name).getByRole('button',{name:'Eltávolítás: '+name,exact:true});
 for(let step=0;step<12&&!(await remove.evaluate(element=>element===document.activeElement));step++)await page.keyboard.press('Tab');
 await expect(remove).toBeFocused();
 await page.keyboard.press('Space');
 await expect(queueRow(page,name)).toHaveCount(0);
 await expect(zone).toBeFocused();
 // A rejected file is announced with its reason.
 await filesInput(page).setInputFiles([text(prefix+'-bad.exe','MZ')]);
 await expect.poll(read).toContain('Sikertelen feltöltés: '+prefix+'-bad.exe.');
});

test('themes and English',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 await openUploader(page);
 for(const [label,theme] of [['Éjjeli','dark'],['Világos','light'],['Skyblue','skyblue']]){
  // The window is modal: the theme menu behind it is not operable, so the theme changes with the window closed.
  await page.keyboard.press('Escape');await expect(uploader(page)).toHaveCount(0);
  await page.locator('.blade-navigation-row').getByRole('button',{name:/^(Skyblue|Világos|Éjjeli)$/}).click();await page.getByText(label,{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-dhx-theme',theme);
  await openUploader(page);
  const zone=uploader(page).locator('.blade-uploader__zone');
  const colors=await zone.evaluate(element=>{const style=getComputedStyle(element);return [style.borderTopColor,style.backgroundColor,style.color];});
  expect(colors[0]).not.toBe('rgba(0, 0, 0, 0)');expect(colors[1]).not.toBe(colors[2]);
  await page.screenshot({path:`${runtime}/uploader/${theme}.png`});
 }
 await uploader(page).getByRole('button',{name:'Bezárás',exact:true}).click();
 const language=page.locator('.blade-navigation-row').getByRole('button',{name:'Magyar',exact:true});
 await language.click();await page.getByText('English',{exact:true}).click();
 try{
  await openMenu(page,'File manager','Feature demo');
  await expect(panel(page,0).locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
  await command(page,'Upload');
  await expect(uploader(page)).toBeVisible();
  await expect(uploader(page)).toContainText('Target folder: Drive A:/');
  await expect(uploader(page)).toContainText('Allowed types:');
  await expect(uploader(page)).toContainText('At most 20 files can be uploaded at once.');
  await expect(uploader(page).getByRole('button',{name:'Choose files',exact:true})).toBeVisible();
  await expect(uploader(page).getByRole('columnheader',{name:'Name'})).toBeVisible();
 }finally{
  await page.keyboard.press('Escape');await expect(uploader(page)).toHaveCount(0);
  await page.locator('.blade-navigation-row').getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','hu');
 }
 expect(errors).toEqual([]);
});

test('authorization: a reader gets no upload command and every transfer operation is denied',async({page,browser})=>{
 await start(page);
 const root=await rootOf(page,'a');
 // The demo user's own transfer: an unknown or aborted transfer id is 404 without details.
 const begun=await api(page,'files','__upload',root,{operation:'upload_begin',action:'upload',file:{name:prefix+'-acl.txt',size:3,type:'text/plain'},fingerprint:prefix+'-acl'});
 expect(begun.status).toBe(200);const transfer=begun.body.data.transfer;expect(transfer).toMatch(/^[0-9a-f]{32}$/);
 const context=await browser.newContext();
 try{
  const other=await context.newPage();
  await start(other,'reader@example.test');
  await expect(other.getByRole('button',{name:'Feltöltés',exact:true})).toHaveCount(0);
  for(const values of [
   {operation:'upload_preflight',action:'upload',files:[{name:prefix+'-r.txt',size:1,type:'text/plain'}]},
   {operation:'upload_begin',action:'upload',file:{name:prefix+'-r.txt',size:1,type:'text/plain'},fingerprint:prefix+'-r'},
   {operation:'upload_status',action:'upload',transfer},
   {operation:'upload_abort',action:'upload',transfer},
  ])expect((await api(other,'files','__upload',root,values)).status,'reader '+values.operation).toBe(403);
 }finally{await context.close();}
 expect((await api(page,'files','__upload',root,{operation:'upload_status',action:'upload',transfer})).body.data.received).toBe(0);
 expect((await api(page,'files','__upload',root,{operation:'upload_abort',action:'upload',transfer})).status).toBe(200);
 const gone=await api(page,'files','__upload',root,{operation:'upload_status',action:'upload',transfer});
 expect(gone.status).toBe(404);expect(gone.body.error).toBe('Nem található feltöltés.');
 expect((await api(page,'files','__upload',root,{operation:'upload_status',action:'upload',transfer:'0'.repeat(32)})).status).toBe(404);
 expect((await list(page,root)).some(entry=>entry.name.startsWith(prefix+'-acl'))).toBe(false);
});

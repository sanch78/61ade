const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,command,api}=require('./feature-demo.cjs');
// Two-panel virtual file manager on the feature demo (Feature demó → Fájlkezelő), see docs/files.md.
// Every entry created here starts with the run prefix and is removed afterwards with its subtree.
const prefix='pw'+Date.now().toString(36);
const started=new Date(Date.now()-5000).toISOString().replace(/\.\d+Z$/,'Z');
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${process.env.BLADE_TMP_DIR||'tmp'}/${process.env.BLADE_DEMO_INSTANCE||'demo'}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
test.describe.configure({mode:'serial'});
test.afterAll(()=>{php(`$q=$db->prepare("DELETE FROM blade_files WHERE space='demo' AND (name LIKE ? OR (parent_id<>0 AND parent_id NOT IN (SELECT id FROM blade_files)))");do{$q->execute(['${prefix}%']);}while($q->rowCount()>0);`);});

const panel=(page,index)=>page.locator(`[data-cell-id="panel-${index}"]`);
// The panel header shows the current path (collapsed in the middle when it does not fit).
const path=p=>p.locator('.dhx_layout-cell-header__title').first();
const exact=text=>new RegExp('^'+text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
const row=(p,name)=>p.locator('.dhx_grid-row').filter({has:p.page().getByRole('gridcell',{name,exact:true})});
const treeItem=(p,name)=>p.locator('.dhx_tree-list-item__content').filter({hasText:exact(name)});
const selectedTree=p=>p.locator('.dhx_tree-folder--selected .dhx_tree-template__wrapper').first();
const selectedFile=p=>p.locator('.dhx_tree-list-item--selected');
const dialog=page=>page.getByRole('alertdialog');
const windowDialog=page=>page.getByRole('dialog').filter({has:page.locator('.dhx_window-header')}).last();
async function openFiles(page,group='Feature demó',title='Fájlkezelő'){
 await openMenu(page,title,group);
 await expect(panel(page,0).locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}
async function start(page,email='demo@example.test'){
 await page.setViewportSize({width:1400,height:900});await signIn(page,email);await openFiles(page);
}
async function mount(page,p,label){
 await p.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:label,exact:true}).click();
 await expect(path(p)).toHaveText(label+':/');
}
// Panel view mode, as in mc: the file listing or the folder tree.
async function view(page,p,label){
 await p.locator('[data-dhx-id="mode"]').click();await page.getByRole('menuitem',{name:label,exact:true}).click();
 await expect(p.locator('[data-dhx-id="mode"]')).toHaveText('Nézet: '+label);
}
// Seeded demo media in the Signage mount root (examples/demo-app/signage.php).
const IMAGE='Craft coffee, slow mornings.png',VIDEO='3d-logo-intro.mp4';
// The Signage root holds all demo media: the panel search keeps `name` among the rendered rows or tiles.
async function find(p,name){await p.getByRole('textbox',{name:'Keresés',exact:true}).fill(name);await expect(p.locator('.dhx_grid-row, .blade-grid-tile').filter({hasText:name}).first()).toBeVisible();}
async function enter(p,name){await row(p,name).dblclick();await expect(path(p)).toContainText('/'+name);}
// Row marking as in the workspaces: a click marks one row, Ctrl/Cmd-click adds more.
async function pick(p,name,modifiers=[]){await row(p,name).locator('.dhx_grid-cell').nth(1).click({modifiers});}
// Multipart call through the same endpoint, session and CSRF header as the component.
function multipart(page,action,id,values,parts){
 return page.evaluate(async([action,id,values,parts])=>{
  const csrf=JSON.parse(document.getElementById('blade-config').textContent).csrf,form=new FormData();
  form.append('request',JSON.stringify({resource:'files',action,id,values}));
  for(const [field,name,text] of parts)form.append(field,new Blob([text],{type:'text/plain'}),name);
  const response=await fetch('?blade=1',{method:'POST',headers:{'X-BLADE-CSRF':csrf},body:form});
  return {status:response.status,body:await response.json()};
 },[action,id,values,parts]);
}
// `content_get` answers with raw bytes, not JSON: status, safety headers and the first bytes.
function content(page,id){
 return page.evaluate(async id=>{
  const csrf=JSON.parse(document.getElementById('blade-config').textContent).csrf;
  const response=await fetch('?blade=1',{method:'POST',headers:{'X-BLADE-CSRF':csrf,'Content-Type':'application/json'},body:JSON.stringify({resource:'files',action:'content_get',id,values:{}})});
  const bytes=new Uint8Array(await response.arrayBuffer());
  return {status:response.status,type:response.headers.get('content-type'),nosniff:response.headers.get('x-content-type-options'),disposition:response.headers.get('content-disposition'),head:[...bytes.slice(0,3)]};
 },id);
}
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// Synthetic entries through the direct multipart upload, 20 files per request (the demo policy's maxFiles).
// Each file is [name, text] or [name, base64, true].
async function seed(page,directory,files){
 for(let i=0;i<files.length;i+=20){
  const result=await page.evaluate(async([directory,files])=>{
   const csrf=JSON.parse(document.getElementById('blade-config').textContent).csrf,form=new FormData();
   form.append('request',JSON.stringify({resource:'files',action:'upload',id:directory,values:{}}));
   for(const [name,data,binary] of files)form.append('files[]',new Blob([binary?Uint8Array.from(atob(data),c=>c.charCodeAt(0)):data],{type:'application/octet-stream'}),name);
   const response=await fetch('?blade=1',{method:'POST',headers:{'X-BLADE-CSRF':csrf},body:form});
   return {status:response.status,body:await response.json()};
  },[directory,files.slice(i,i+20)]);
  expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.data.failed).toEqual([]);
 }
}
// Central directory of a downloaded ZIP: name → {flags, stored bytes} (store method, so the bytes are the content).
function unzip(buffer){
 let end=buffer.length-22;while(end>=0&&buffer.readUInt32LE(end)!==0x06054b50)end--;
 expect(end).toBeGreaterThanOrEqual(0);
 const count=buffer.readUInt16LE(end+10),entries={};let offset=buffer.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  expect(buffer.readUInt32LE(offset)).toBe(0x02014b50);
  const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),size=buffer.readUInt32LE(offset+20),length=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32),local=buffer.readUInt32LE(offset+42);
  const name=buffer.toString('utf8',offset+46,offset+46+length),start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
  entries[name]={flags,method,data:buffer.subarray(start,start+size)};
  offset+=46+length+extra+comment;
 }
 return entries;
}
const order=async(p,names)=>{const tops=[];for(const name of names)tops.push((await row(p,name).boundingBox()).y);return tops;};
async function entryId(page,mount,parentName,name){
 const tree=await api(page,'files','tree',mount);
 if(parentName===null)return (await api(page,'files','list',tree.body.data.root)).body.data.items.find(item=>item.name===name).id;
 const parent=tree.body.data.items.find(item=>item.name===parentName);
 return (await api(page,'files','list',parent.id)).body.data.items.find(item=>item.name===name).id;
}

test('independent mounts, Tree/Grid synchronization and the directory depth limit',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 const left=panel(page,0),right=panel(page,1);
 await expect(path(left)).toHaveText('Drive A:/');await expect(path(right)).toHaveText('Drive B:/');
 await expect(left).toHaveClass(/blade-file-panel--active/);
 await mount(page,right,'Drive C');
 await expect(row(right,'Közös')).toBeVisible();await expect(row(left,'Dokumentumok')).toBeVisible();
 await expect(right).toHaveClass(/blade-file-panel--active/);await expect(left).not.toHaveClass(/blade-file-panel--active/);
 // Tree mode shows only the tree; selecting a folder makes it the panel's folder for the listing.
 await view(page,left,'Mappafa');
 await expect(left.locator('.dhx_grid-row').first()).toBeHidden();await expect(left.locator('.dhx_tree')).toBeVisible();await expect(right.locator('.dhx_grid-row').first()).toBeVisible();
 await left.locator('.dhx_tree-toggle-button').first().click();await treeItem(left,'Dokumentumok').click();
 await expect(path(left)).toHaveText('Drive A:/Dokumentumok');
 await expect(page.getByRole('button',{name:'Szerkesztés',exact:true})).toBeDisabled();
 // Files are tree leaves with their MIME icon; a chosen file keeps its folder and is the operand.
 await expect(treeItem(left,'jegyzet.txt').locator('.dxi-format-align-left')).toHaveCount(1);
 await treeItem(left,'jegyzet.txt').click();await expect(selectedFile(left)).toContainText('jegyzet.txt');
 await expect(path(left)).toHaveText('Drive A:/Dokumentumok');await expect(page.getByRole('button',{name:'Szerkesztés',exact:true})).toBeEnabled();
 await view(page,left,'Fájllista');await expect(row(left,'jegyzet.txt')).toBeVisible();
 // No checkbox column; the first column is the MIME icon with its accessible name.
 await expect(left.locator('.dhx_grid input[type=checkbox]')).toHaveCount(0);
 await expect(row(left,'jegyzet.txt').getByRole('img',{name:'Szöveg',exact:true})).toBeVisible();
 await expect(row(left,'Projektek').getByRole('img',{name:'Mappa',exact:true})).toBeVisible();
 await pick(left,'jegyzet.txt');await expect(left.locator('.blade-grid-row-marked')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Szerkesztés',exact:true})).toBeEnabled();
 await pick(left,'Projektek',['ControlOrMeta']);await expect(left.locator('.blade-grid-row-marked')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'Szerkesztés',exact:true})).toBeDisabled();
 // Listing → tree: entering a folder selects it in the tree; choosing its parent there returns.
 await enter(left,'Projektek');await view(page,left,'Mappafa');await expect(selectedTree(left)).toHaveText('Projektek');
 await treeItem(left,'Dokumentumok').click();await expect(path(left)).toHaveText('Drive A:/Dokumentumok');await expect(selectedTree(left)).toHaveText('Dokumentumok');
 await view(page,left,'Fájllista');
 // No Up button: the ".." row opens the parent with the cursor on the folder left; it is never marked.
 await expect(left.getByRole('button',{name:'Fel',exact:true})).toHaveCount(0);
 await enter(left,'Projektek');await expect(row(left,'..').getByRole('img',{name:'Szülőmappa',exact:true})).toBeVisible();
 await expect(left.locator('.dhx_grid-row').first()).toContainText('..');
 await pick(left,'..');await expect(left.locator('.blade-grid-row-marked')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Másolás',exact:true})).toBeDisabled();
 await row(left,'..').dblclick();await expect(path(left)).toHaveText('Drive A:/Dokumentumok');
 // Suite draws the row cursor as an overlay: it lies on the Projektek row.
 const cursor=await left.locator('.dhx_grid-selected-row').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect()).filter(box=>box.height).map(box=>box.top));
 const projects=(await row(left,'Projektek').boundingBox()).y;expect(cursor.some(top=>Math.abs(top-projects)<2)).toBe(true);
 await expect(path(right)).toHaveText('Drive C:/');await expect(right.locator('[data-dhx-id="mode"]')).toHaveText('Nézet: Fájllista');
 // Depth: Mély mappa/1/2/3 is depth 4, a new folder there is depth 5; inside it creation stops.
 await mount(page,right,'Drive B');
 for(const name of ['Mély mappa','1','2','3'])await enter(right,name);
 await command(page,'Új mappa');
 await expect(windowDialog(page).getByRole('button',{name:'Mégse',exact:true})).toBeVisible();
 const form=windowDialog(page);await form.getByLabel('Mappa neve').fill(prefix+'-d5');await form.getByRole('button',{name:'Létrehozás',exact:true}).click();
 await expect(row(right,prefix+'-d5')).toBeVisible();
 await enter(right,prefix+'-d5');
 await expect(page.getByRole('button',{name:'Új mappa',exact:true})).toBeDisabled();
 const d5=await entryId(page,'b','3',prefix+'-d5');
 const deep=await api(page,'files','create_directory',d5,{name:prefix+'-d6'});
 expect(deep.status).toBe(400);expect(deep.body.fieldErrors.name).toContain('5');
 const four=await entryId(page,'b','2','3');
 expect((await api(page,'files','create_directory',four,{name:prefix+'-d5'})).status).toBe(409);
 for(const bad of ['a/b','..','x\u0000y'])expect((await api(page,'files','create_directory',four,{name:bad})).status).toBe(400);
 expect(errors).toEqual([]);
});

test('upload validation, conflict dialog and the TXT editor',async({page})=>{
 await start(page);
 const left=panel(page,0);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
 // The framework uploader (Uploader.ts): a non-modal window with a per-file queue; rejected files fail in place.
 await command(page,'Feltöltés');
 const upload=page.getByRole('dialog').filter({has:page.locator('.blade-uploader')}),input=page.locator('input[data-blade-upload-input="files"]');
 await input.setInputFiles([
  {name:prefix+'-a.txt',mimeType:'text/plain',buffer:Buffer.from('első sor\n')},
  {name:prefix+'-b.png',mimeType:'image/png',buffer:png},
  {name:prefix+'-c.exe',mimeType:'text/plain',buffer:Buffer.from('MZ')},
  {name:prefix+'-big.txt',mimeType:'text/plain',buffer:Buffer.alloc(5242881,97)},
 ]);
 await expect(upload.locator('.blade-uploader__summary')).toHaveText('Sikeres: 2, kihagyva: 0, sikertelen: 2.');
 await expect(upload).toContainText('Nem engedélyezett fájltípus');await expect(upload).toContainText('túl nagy');
 await expect(page.locator('.blade-toast').filter({hasText:'Sikeres: 2, kihagyva: 0, sikertelen: 2.'})).toBeVisible();
 await expect(row(left,prefix+'-a.txt')).toBeVisible();await expect(row(left,prefix+'-b.png')).toBeVisible();
 // Same name again: the shared dialog offers overwrite, rename, skip and cancel, and "apply to all".
 await input.setInputFiles([{name:prefix+'-a.txt',mimeType:'text/plain',buffer:Buffer.from('második\n')}]);
 await expect(dialog(page).getByRole('heading',{name:'Névütközés'})).toBeVisible();
 for(const name of ['Felülírás','Átnevezés','Kihagyás','Mégse'])await expect(dialog(page).getByRole('button',{name,exact:true})).toBeVisible();
 await expect(dialog(page).getByRole('checkbox',{name:'Alkalmazás az összes ütközésre'})).toBeVisible();
 await dialog(page).getByRole('button',{name:'Átnevezés',exact:true}).click();
 await expect(row(left,prefix+'-a (2).txt')).toBeVisible();
 await upload.getByRole('button',{name:'Bezárás',exact:true}).click();await expect(upload).toBeHidden();
 // Server-side editor rules: TXT only (case-insensitive), revision conflicts are structured.
 const txt=await entryId(page,'a',null,prefix+'-a.txt'),image=await entryId(page,'a',null,prefix+'-b.png'),upper=await entryId(page,'a',null,'OLVASS-EL.TXT');
 expect((await api(page,'files','text_get',image)).status).toBe(415);
 expect((await multipart(page,'text_save',image,{revision:'1'},[['content','x.png','x']])).status).toBe(415);
 expect((await api(page,'files','text_get',upper)).status).toBe(200);
 const large=await entryId(page,'b','Feltöltési minták','nagy-naplo.txt');
 expect((await api(page,'files','text_get',large)).status).toBe(413);
 // Editor window: one full-window Layout, its toolbar (Save, line wrap, cursor position, save state) above a monospace textarea.
 await pick(left,prefix+'-a.txt');await command(page,'Szerkesztés');
 const editor=windowDialog(page),area=editor.locator('textarea'),bar=editor.locator('.blade-document__bar'),save=bar.getByRole('button',{name:'Mentés',exact:true});
 await expect(area).toHaveValue('első sor\n');await expect(area).toBeFocused();
 expect(await area.evaluate(element=>getComputedStyle(element).fontFamily)).toMatch(/mono/i);
 await expect(save).toBeDisabled();await expect(bar).toContainText('Mentve');await expect(bar).toContainText('Sor 1, oszlop 1');
 // The textarea fills the window below the toolbar, also after the user enlarges it: no empty band.
 const gap=()=>editor.evaluate(root=>root.getBoundingClientRect().bottom-root.querySelector('textarea').getBoundingClientRect().bottom);
 expect(await gap()).toBeLessThan(4);
 const before=(await area.boundingBox()).height,handle=await editor.locator('.dhx_window-resizer--bottom').boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2+120,{steps:6});await page.mouse.up();
 await expect.poll(async()=>(await area.boundingBox()).height).toBeGreaterThan(before+80);expect(await gap()).toBeLessThan(4);
 await bar.getByRole('button',{name:'Sortörés',exact:true}).click();await expect(area).toHaveAttribute('wrap','off');
 await area.fill('szerkesztett szöveg\n');
 await expect(save).toBeEnabled();await expect(bar).toContainText('Módosítva');await expect(bar).toContainText('Sor 2, oszlop 1');
 await editor.getByRole('button',{name:/close/i}).click();
 await expect(dialog(page).getByRole('heading',{name:'Mentetlen módosítások'})).toBeVisible();
 await dialog(page).getByRole('button',{name:'Mégse',exact:true}).click();
 await expect(area).toHaveValue('szerkesztett szöveg\n');
 // Ctrl+S saves from the textarea.
 await area.press('Control+s');
 await expect(page.locator('.blade-toast').filter({hasText:'A fájl mentve.'})).toBeVisible();
 await expect(save).toBeDisabled();await expect(bar).toContainText('Mentve');
 const saved=await api(page,'files','text_get',txt);expect(saved.body.data.content).toBe('szerkesztett szöveg\n');
 // A concurrent writer makes the open editor stale: the save conflicts, the current version can be loaded.
 expect((await multipart(page,'text_save',txt,{revision:saved.body.data.revision},[['content','x.txt','külső módosítás\n']])).status).toBe(200);
 await area.fill('elavult szerkesztés\n');await save.click();
 await expect(dialog(page).getByRole('heading',{name:'Ütközés'})).toBeVisible();
 await dialog(page).getByRole('button',{name:'Aktuális változat betöltése',exact:true}).click();
 await expect(area).toHaveValue('külső módosítás\n');await expect(bar).toContainText('Mentve');
 await editor.getByRole('button',{name:/close/i}).click();await expect(editor).toHaveCount(0);
 const stale=await multipart(page,'text_save',txt,{revision:saved.body.data.revision},[['content','x.txt','régi\n']]);
 expect(stale.status).toBe(409);expect(stale.body.details.conflict.revision).not.toBe(saved.body.data.revision);
});

test('image viewer and video player over the content_stream GET transport',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 const left=panel(page,0),view=page.getByRole('button',{name:'Megtekintés',exact:true});
 // Server: only stored image/video types are served, as raw bytes that cannot run as a document.
 // The seeded images and videos live in the Signage mount (signage demo, files-media-plan U5).
 const image=await entryId(page,'signage',null,IMAGE),text=await entryId(page,'a','Dokumentumok','jegyzet.txt'),folder=await entryId(page,'a',null,'Média');
 expect(await content(page,image)).toEqual({status:200,type:'image/png',nosniff:'nosniff',disposition:'attachment',head:[137,80,78]});
 expect((await api(page,'files','content_get',text)).status).toBe(415);expect((await api(page,'files','content_get',folder)).status).toBe(400);
 await mount(page,left,'Signage');await find(left,IMAGE);
 await pick(left,IMAGE);await expect(view).toBeEnabled();
 await expect(page.getByRole('button',{name:'Szerkesztés',exact:true})).toBeDisabled();
 // Image viewer: fitted (never enlarged) by default, zoom steps and rotation in the toolbar, size and dimensions beside them.
 await row(left,IMAGE).dblclick();
 const viewer=windowDialog(page),bar=viewer.locator('.blade-document__bar'),picture=viewer.getByRole('img',{name:IMAGE});
 await expect(bar).toContainText('1672 × 941 px');await expect(bar.locator('[data-dhx-id="zoom"]')).toHaveText(/^Illesztés \(\d+\s?%\)$/);
 const stage=await viewer.locator('.blade-image-stage').boundingBox(),fitted=await picture.boundingBox();
 expect(fitted.width).toBeLessThanOrEqual(stage.width);expect(fitted.height).toBeLessThanOrEqual(stage.height);
 await bar.getByRole('button',{name:'Nagyítás',exact:true}).click();
 await expect(bar.locator('[data-dhx-id="zoom"]')).toHaveText(/^\d+\s?%$/);
 await expect.poll(async()=>(await picture.boundingBox()).width).toBeGreaterThan(fitted.width);
 await bar.locator('[data-dhx-id="zoom"]').click();await page.getByRole('menuitem',{name:'100%',exact:true}).click();
 await expect.poll(()=>picture.evaluate(element=>element.getBoundingClientRect().width)).toBeCloseTo(1672,0);
 await bar.getByRole('button',{name:'Forgatás jobbra',exact:true}).click();
 await expect.poll(()=>viewer.locator('.blade-image-frame').evaluate(element=>[element.offsetWidth,element.offsetHeight].join())).toBe('941,1672');
 // The viewer loads the GET stream URL directly (no blob copy); the revision only keys the cache.
 const source=await picture.getAttribute('src');expect(source).toMatch(/\?blade=1&resource=files&action=content_stream&id=\d+&v=\d+$/);
 await viewer.getByRole('button',{name:/close/i}).click();await expect(viewer).toHaveCount(0);
 // Range, conditional and HEAD requests; the thumbnail derivative is WebP; other sites are refused.
 const whole=await page.request.get(source);expect(whole.status()).toBe(200);
 const etag=whole.headers()['etag'],size=(await whole.body()).length;
 expect(whole.headers()).toMatchObject({'content-type':'image/png','accept-ranges':'bytes','x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin','cache-control':'private, no-cache'});
 const part=await page.request.get(source,{headers:{Range:'bytes=0-99'}});
 expect(part.status()).toBe(206);expect(part.headers()['content-range']).toBe(`bytes 0-99/${size}`);expect((await part.body()).length).toBe(100);
 expect((await page.request.get(source,{headers:{Range:`bytes=${size}-`}})).status()).toBe(416);
 expect((await page.request.get(source,{headers:{'If-None-Match':etag}})).status()).toBe(304);
 const head=await page.request.head(source);expect(head.status()).toBe(200);expect((await head.body()).length).toBe(0);
 expect((await page.request.get(source,{headers:{'Sec-Fetch-Site':'cross-site'}})).status()).toBe(403);
 const thumbnail=await page.request.get(source.replace('content_stream','thumbnail_get'));
 expect(thumbnail.status()).toBe(200);expect(thumbnail.headers()['content-type']).toBe('image/webp');
 expect((await page.request.get(source.replace('content_stream','content_get'))).status(),'POST-only action over GET').toBe(405);
 // Video player: native controls; loop and speed in the toolbar, dimensions and length beside them.
 // The media element reads the stream with HTTP Range requests (206), which is what seeking uses.
 const streamed=[];page.on('response',response=>{if(response.url().includes('action=content_stream'))streamed.push(response.status());});
 await find(left,VIDEO);await row(left,VIDEO).dblclick();
 const player=windowDialog(page),controls=player.locator('.blade-document__bar'),video=player.locator('video');
 await expect(controls).toContainText('1920 × 1080 px · 0:13');await expect(video).toHaveAttribute('controls','');
 expect(await video.getAttribute('src')).toContain('action=content_stream');
 await video.evaluate(element=>{element.currentTime=5;});
 await expect.poll(()=>streamed.includes(206)).toBe(true);
 await controls.getByRole('button',{name:'Ismétlés',exact:true}).click();expect(await video.evaluate(element=>element.loop)).toBe(true);
 await controls.locator('[data-dhx-id="speed"]').click();await page.getByRole('menuitem',{name:'2×',exact:true}).click();
 expect(await video.evaluate(element=>element.playbackRate)).toBe(2);await expect(controls).toContainText('Sebesség: 2×');
 await video.evaluate(element=>{element.muted=true;return element.play();});
 await expect.poll(()=>video.evaluate(element=>element.currentTime)).toBeGreaterThan(0.2);
 // Full size is the native Window state and fills the viewport.
 await controls.getByRole('button',{name:'Teljes méret',exact:true}).click();
 await expect.poll(async()=>(await player.boundingBox()).width).toBeGreaterThan(1300);
 await controls.getByRole('button',{name:'Eredeti méret',exact:true}).click();
 await player.getByRole('button',{name:/close/i}).click();await expect(player).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('recursive copy and move to the opposite panel, conflicts and cycles',async({page})=>{
 await start(page);
 const left=panel(page,0),right=panel(page,1);
 const root=(await api(page,'files','tree','a')).body.data.root;
 const tree=(await api(page,'files','create_directory',root,{name:prefix+'-tree'})).body.data.id;
 const sub=(await api(page,'files','create_directory',tree,{name:prefix+'-sub'})).body.data.id;
 const file=await entryId(page,'a',null,prefix+'-a.txt');
 expect((await api(page,'files','copy',sub,{sources:file})).status).toBe(200);
 await mount(page,left,'Drive A');await mount(page,right,'Drive C');
 await pick(left,prefix+'-tree');
 await command(page,'Másolás');
 await expect(row(right,prefix+'-tree')).toBeVisible();await expect(row(left,prefix+'-tree')).toBeVisible();
 await enter(right,prefix+'-tree');await enter(right,prefix+'-sub');await expect(row(right,prefix+'-a.txt')).toBeVisible();
 await row(right,'..').dblclick();await expect(path(right)).toHaveText('Drive C:/'+prefix+'-tree');
 await row(right,'..').dblclick();await expect(path(right)).toHaveText('Drive C:/');await expect(row(right,'..')).toHaveCount(0);
 // In tree mode the selected folder is the source; copying again conflicts and skipping is summarized.
 await view(page,left,'Mappafa');await left.locator('.dhx_tree-toggle-button').first().click();await treeItem(left,prefix+'-tree').click();
 await expect(path(left)).toHaveText('Drive A:/'+prefix+'-tree');
 await command(page,'Másolás');
 await dialog(page).getByRole('button',{name:'Kihagyás',exact:true}).click();
 await expect(dialog(page)).toContainText('Sikeres: 0, kihagyva: 1, sikertelen: 0.');
 await dialog(page).getByRole('button',{name:'Rendben',exact:true}).click();
 await treeItem(left,'Drive A').click();await expect(path(left)).toHaveText('Drive A:/');
 // Move a file chosen in the tree: it leaves the source panel and appears in the target.
 await treeItem(left,prefix+'-a (2).txt').click();await expect(selectedFile(left)).toContainText(prefix+'-a (2).txt');
 await command(page,'Áthelyezés');
 await expect(row(right,prefix+'-a (2).txt')).toBeVisible();await expect(treeItem(left,prefix+'-a (2).txt')).toHaveCount(0);
 await view(page,left,'Fájllista');await expect(row(left,prefix+'-a (2).txt')).toHaveCount(0);
 const copiedTree=await entryId(page,'c',null,prefix+'-tree');
 // Cross-mount move back to Drive A: the name conflict is reported before any change, then renamed.
 expect((await api(page,'files','move',root,{sources:copiedTree})).status).toBe(409);
 const moved=await api(page,'files','move',root,{sources:copiedTree,decision:'rename'});
 expect(moved.status).toBe(200);expect(moved.body.data.succeeded[0]).toMatchObject({id:copiedTree,name:prefix+'-tree (2)'});
 // Cycles and depth are rejected before any change.
 const cycle=await api(page,'files','move',sub,{sources:tree});
 expect(cycle.status).toBe(400);expect(cycle.body.error).toContain('önmagába');
 const d5=await entryId(page,'b','3',prefix+'-d5');
 expect((await api(page,'files','copy',d5,{sources:tree})).status).toBe(400);
 expect((await api(page,'files','move',d5,{sources:tree})).status).toBe(400);
});

test('paged server-sorted listing: search, type filter, sort and scrolling past 250 entries',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 const right=panel(page,1),root=(await api(page,'files','tree','b')).body.data.root;
 const many=(await api(page,'files','create_directory',root,{name:prefix+'-many'})).body.data.id;
 for(let i=1;i<=5;i++)expect((await api(page,'files','create_directory',many,{name:`${prefix}-dir${i}`})).status).toBe(200);
 const names=Array.from({length:258},(_,i)=>`${prefix}-f${String(i+1).padStart(3,'0')}.txt`);
 await seed(page,many,[...names.map((name,i)=>[name,'x'.repeat(i+1)]),[prefix+'-p1.png',PNG,true],[prefix+'-p2.png',PNG,true]]);
 // Server: keyset windows in the requested order, directories first, no duplicates; bad cursors and limits are refused.
 const seen=[];let cursor='';
 do{
  const window=await api(page,'files','list',many,{limit:100,sort:'size',direction:'desc',...(cursor?{cursor}:{})});
  expect(window.status).toBe(200);expect(window.body.data.total).toBe(265);seen.push(...window.body.data.items.map(item=>item.name));cursor=window.body.data.next;
 }while(cursor);
 expect(seen.length).toBe(265);expect(new Set(seen).size).toBe(265);
 expect(seen.slice(0,5).every(name=>name.includes('-dir'))).toBe(true);expect(seen[5]).toBe(names[257]);
 const stale=await api(page,'files','list',many,{cursor:'bogus'});expect(stale.status).toBe(400);
 expect((await api(page,'files','list',many,{limit:201})).status).toBe(400);
 // Panel: the first window, then the next ones while the cursor moves down (End), up to the last entry.
 const listed=[];page.on('request',request=>{try{const body=request.postDataJSON();if(body?.action==='list')listed.push(body);}catch{}});
 await mount(page,right,'Drive B');await enter(right,prefix+'-many');
 const count=right.locator('[data-dhx-id="count"]');await expect(count).toHaveText('265 elem');
 expect(listed.at(-1).values).toMatchObject({limit:200,sort:'name',direction:'asc'});
 await pick(right,prefix+'-dir1');
 await expect.poll(async()=>{await page.keyboard.press('End');return row(right,prefix+'-p2.png').isVisible();},{timeout:15000}).toBe(true);
 expect(listed.some(body=>body.values.cursor)).toBe(true);
 // Sort control: directories stay first, then the largest file.
 const sort=right.locator('[data-dhx-id="sort"]');await expect(sort).toHaveText('Rendezés: Név ↑');
 await sort.click();await page.getByRole('menuitem',{name:'Méret ↓',exact:true}).click();
 await expect(sort).toHaveText('Rendezés: Méret ↓');await expect(row(right,names[257])).toBeVisible();
 const [dir,largest,next]=await order(right,[prefix+'-dir5',names[257],names[256]]);expect(dir).toBeLessThan(largest);expect(largest).toBeLessThan(next);
 expect(listed.at(-1).values).toMatchObject({sort:'size',direction:'desc'});expect(listed.at(-1).values.cursor).toBeUndefined();
 // Search: server-side, the ".." row stays first; Escape clears.
 const search=right.getByRole('textbox',{name:'Keresés',exact:true});
 await search.fill(prefix+'-f12');await expect(count).toHaveText('10 / 265 elem');
 await expect(row(right,names[119])).toBeVisible();await expect(row(right,names[0])).toHaveCount(0);
 await expect(right.locator('.dhx_grid-row').first()).toContainText('..');
 expect(listed.at(-1).values.search).toBe(prefix+'-f12');
 await search.press('Escape');await expect(count).toHaveText('265 elem');
 // Type filter.
 const type=right.locator('[data-dhx-id="type"]');await expect(type).toHaveText('Minden típus');
 await type.click();await page.getByRole('menuitem',{name:'Képek',exact:true}).click();
 await expect(count).toHaveText('2 / 265 elem');await expect(row(right,prefix+'-p1.png')).toBeVisible();await expect(row(right,names[0])).toHaveCount(0);
 await type.click();await page.getByRole('menuitem',{name:'Mappák',exact:true}).click();
 await expect(count).toHaveText('5 / 265 elem');await expect(row(right,prefix+'-dir3')).toBeVisible();
 // Another folder opens unfiltered by the search; the type and sort stay.
 await search.fill('dir1');await expect(count).toHaveText('1 / 265 elem');
 await enter(right,prefix+'-dir1');await expect(search).toHaveValue('');
 await type.click();await page.getByRole('menuitem',{name:'Minden típus',exact:true}).click();
 await row(right,'..').dblclick();await expect(count).toHaveText('265 elem');
 expect(errors).toEqual([]);
});

test('tiles with thumbnails, folder and parent tiles',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 const left=panel(page,0),tiles=left.locator('.blade-grid-tile');
 await mount(page,left,'Signage');await view(page,left,'Csempék');
 await expect(tiles.first()).toBeVisible();await expect(left.locator('.dhx_grid-row').first()).toBeHidden();
 // Media slot from the listing's metadata: a ready thumbnail is the GET thumbnail_get image; type in text.
 await find(left,IMAGE);const picture=left.getByRole('img',{name:'Kép: '+IMAGE,exact:true});await expect(picture).toBeVisible();
 expect(await picture.locator('img').getAttribute('src')).toMatch(/action=thumbnail_get&id=\d+&v=\d+$/);
 await expect.poll(()=>picture.locator('img').evaluate(image=>image.complete&&image.naturalWidth)).toBeGreaterThan(0);
 await tiles.filter({hasText:IMAGE}).click();await expect(left.locator('.blade-grid-tile--marked')).toHaveCount(1);
 await find(left,VIDEO);await expect(left.getByRole('img',{name:'Videó: '+VIDEO+', 0:13',exact:true})).toBeVisible();
 // The ".." tile names its type; marking and double-click behave as in the listing.
 await mount(page,left,'Drive A');await tiles.filter({hasText:'Dokumentumok'}).dblclick();await expect(path(left)).toHaveText('Drive A:/Dokumentumok');
 const parent=tiles.filter({hasText:'Szülőmappa'});await expect(parent).toHaveCount(1);await expect(parent.locator('.blade-grid-tile__title')).toHaveText('..');
 await tiles.filter({hasText:'jegyzet.txt'}).click();await expect(left.locator('.blade-grid-tile--marked')).toHaveCount(1);
 await parent.click();await expect(left.locator('.blade-grid-tile--marked')).toHaveCount(0);
 await parent.dblclick();await expect(path(left)).toHaveText('Drive A:/');
 // A folder tile shows the folder glyph in its media slot and "Mappa" as its type line.
 const folder=tiles.filter({hasText:'Dokumentumok'});await expect(folder.locator('.blade-grid-tile__meta')).toHaveText('Mappa');
 // Rows without a media descriptor fall back to the icon column with its accessible name.
 await expect(folder.locator('.blade-grid-tile__media .blade-record-icon[role="img"]')).toHaveAttribute('aria-label','Mappa');
 // Tiles reflow with the panel: several per row.
 const boxes=await tiles.evaluateAll(nodes=>nodes.slice(0,3).map(node=>Math.round(node.getBoundingClientRect().top)));expect(new Set(boxes).size).toBe(1);
 await view(page,left,'Fájllista');await expect(row(left,'Dokumentumok')).toBeVisible();
 // Videos carry the video icon ("Videó") in the listing and in the tree, as the media fallback does.
 await mount(page,left,'Signage');await find(left,VIDEO);await expect(row(left,VIDEO).getByRole('img',{name:'Videó',exact:true})).toBeVisible();
 await expect(row(left,VIDEO).locator('.dxi-menu-right')).toHaveCount(1);
 await view(page,left,'Mappafa');
 // The current folder is selected but collapsed; its toggle (a Suite menu-right glyph outside the item content) opens it.
 if(!await treeItem(left,VIDEO).isVisible())await left.locator('.dhx_tree-toggle-button').first().click();
 await expect(treeItem(left,VIDEO).locator('.dxi-menu-right')).toHaveCount(1);
 await view(page,left,'Fájllista');
 expect(errors).toEqual([]);
});

test('rename (F2), delete (Del) with the declared confirmation, single and ZIP download',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 const left=panel(page,0),right=panel(page,1),rootC=(await api(page,'files','tree','c')).body.data.root;
 const work=(await api(page,'files','create_directory',rootC,{name:prefix+'-work'})).body.data.id;
 const inner=(await api(page,'files','create_directory',work,{name:prefix+'-inner'})).body.data.id;
 const zipdir=(await api(page,'files','create_directory',work,{name:prefix+'-zipdir'})).body.data.id;
 expect((await api(page,'files','create_directory',inner,{name:prefix+'-empty'})).status).toBe(200);
 expect((await api(page,'files','create_directory',zipdir,{name:prefix+'-hollow'})).status).toBe(200);
 await seed(page,work,[[prefix+'-r.txt','átnevezendő\n'],[prefix+'-taken.txt','foglalt\n'],[prefix+'-z.txt','zip tartalom\n']]);
 await seed(page,inner,[[prefix+'-deep.txt','mély\n']]);await seed(page,zipdir,[[prefix+'-zipped.txt','tömörítve ő\n']]);
 await mount(page,left,'Drive C');await enter(left,prefix+'-work');
 // Rename: F2 opens the shared form window with the base name selected; conflicts and type changes stay in the form.
 await pick(left,prefix+'-r.txt');await page.keyboard.press('F2');
 const form=windowDialog(page),input=form.getByLabel('Új név');
 await expect(input).toHaveValue(prefix+'-r.txt');await expect(form.getByRole('button',{name:'Mégse',exact:true})).toBeVisible();
 await expect.poll(()=>input.evaluate(element=>[element.selectionStart,element.selectionEnd].join())).toBe('0,'+(prefix+'-r').length);
 await input.fill(prefix+'-taken.txt');await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toContainText('Ilyen nevű elem már létezik ebben a mappában.');
 await input.fill(prefix+'-r.png');await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toContainText('kiterjesztés');
 await input.fill(prefix+'-renamed.txt');await input.press('Enter');
 await expect(page.locator('.blade-toast').filter({hasText:'Átnevezve: '+prefix+'-renamed.txt'})).toBeVisible();
 await expect(row(left,prefix+'-renamed.txt')).toBeVisible();await expect(row(left,prefix+'-r.txt')).toHaveCount(0);
 expect((await api(page,'files','rename',rootC,{name:prefix+'-root'})).status).toBe(400);
 // Delete: the right panel shows a folder that goes away and returns to its surviving parent.
 await mount(page,right,'Drive C');await enter(right,prefix+'-work');await enter(right,prefix+'-inner');
 await pick(left,prefix+'-inner');await pick(left,prefix+'-taken.txt',['ControlOrMeta']);
 await page.keyboard.press('Delete');
 await expect(dialog(page).getByRole('heading',{name:'Törlés'})).toBeVisible();
 await expect(dialog(page)).toContainText('2 kijelölt elem véglegesen törlődik. A mappák tartalma is törlődik.');
 await dialog(page).getByRole('button',{name:'Mégse',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
 await expect(row(left,prefix+'-inner')).toBeVisible();
 await command(page,'Törlés');await dialog(page).getByRole('button',{name:'Törlés',exact:true}).click();
 await expect(page.locator('.blade-toast').filter({hasText:'Törölve: 2 elem.'})).toBeVisible();
 await expect(row(left,prefix+'-inner')).toHaveCount(0);await expect(row(left,prefix+'-taken.txt')).toHaveCount(0);
 await expect(path(right)).toHaveText('Drive C:/'+prefix+'-work');await expect(row(right,prefix+'-inner')).toHaveCount(0);
 expect((await api(page,'files','list',work)).body.data.items.map(item=>item.name).sort()).toEqual([prefix+'-renamed.txt',prefix+'-z.txt',prefix+'-zipdir'].sort());
 expect((await api(page,'files','list',inner)).status).not.toBe(200);
 expect((await api(page,'files','delete',rootC,{sources:rootC})).status).toBe(400);
 // Download: one file is the GET download URL; a folder with a file is one streamed ZIP.
 await pick(left,prefix+'-z.txt');
 const [single]=await Promise.all([page.waitForEvent('download'),command(page,'Letöltés')]);
 expect(single.suggestedFilename()).toBe(prefix+'-z.txt');expect(single.url()).toMatch(/action=download&id=\d+/);
 expect(require('node:fs').readFileSync(await single.path(),'utf8')).toBe('zip tartalom\n');
 await pick(left,prefix+'-zipdir');await pick(left,prefix+'-z.txt',['ControlOrMeta']);
 const [zip]=await Promise.all([page.waitForEvent('download'),command(page,'Letöltés')]);
 expect(zip.suggestedFilename()).toBe(prefix+'-work.zip');
 const entries=unzip(require('node:fs').readFileSync(await zip.path()));
 expect(Object.keys(entries).filter(name=>!name.endsWith('/')).sort()).toEqual([prefix+'-z.txt',`${prefix}-zipdir/${prefix}-zipped.txt`].sort());
 expect(Object.keys(entries)).toContain(`${prefix}-zipdir/${prefix}-hollow/`);
 expect(entries[`${prefix}-zipdir/${prefix}-zipped.txt`].data.toString('utf8')).toBe('tömörítve ő\n');
 expect(entries[prefix+'-z.txt'].method).toBe(0);expect(entries[prefix+'-z.txt'].flags&0x800).toBe(0x800);
 // The ZIP token is single-use.
 expect((await page.request.get(zip.url())).status()).toBe(404);
 // Folder only: also a ZIP, named after the folder.
 await pick(left,prefix+'-zipdir');
 const [folderZip]=await Promise.all([page.waitForEvent('download'),command(page,'Letöltés')]);
 expect(folderZip.suggestedFilename()).toBe(prefix+'-zipdir.zip');
 expect(errors).toEqual([]);
});

test('drop and paste onto a panel: in-flight rows, in-place insertion without reloading the other panel',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 const right=panel(page,1),rootB=(await api(page,'files','tree','b')).body.data.root;
 const target=(await api(page,'files','create_directory',rootB,{name:prefix+'-drop'})).body.data.id;
 await mount(page,right,'Drive B');await enter(right,prefix+'-drop');
 // The finish of the transfer is held, so the in-flight row can be observed.
 let release;const held=new Promise(resolve=>{release=resolve;});
 const hold=async route=>{if((route.request().postData()??'').includes('"upload_finish"'))await held;await route.continue();};
 await page.route(url=>url.search.includes('blade=1'),hold);
 const lists=[];page.on('request',request=>{try{if(request.postDataJSON()?.action==='list')lists.push(request.postDataJSON().id);}catch{}});
 await right.locator('.dhx_grid').evaluate((element,name)=>{
  const data=new DataTransfer();data.items.add(new File(['ejtett\n'],name,{type:'text/plain'}));
  for(const type of ['dragenter','dragover','drop'])element.dispatchEvent(new DragEvent(type,{dataTransfer:data,bubbles:true,cancelable:true}));
 },prefix+'-dropped.txt');
 const upload=page.getByRole('dialog').filter({has:page.locator('.blade-uploader')});
 await expect(upload).toBeVisible();await expect(upload).toContainText(prefix+'-drop');
 const flying=row(right,prefix+'-dropped.txt');
 await expect(flying.getByRole('img',{name:'Feltöltés alatt',exact:true})).toBeVisible();
 // An in-flight row is never marked.
 await flying.locator('.dhx_grid-cell').nth(1).dispatchEvent('click');await expect(right.locator('.blade-grid-row-marked')).toHaveCount(0);
 release();
 await expect(flying.getByRole('img',{name:'Szöveg',exact:true})).toBeVisible();
 await upload.getByRole('button',{name:'Bezárás',exact:true}).click();await expect(upload).toBeHidden();
 // Ctrl+V in the focused panel uploads clipboard files to its folder.
 await pick(right,prefix+'-dropped.txt');
 await right.locator('.dhx_grid').evaluate((element,name)=>{
  const data=new DataTransfer();data.items.add(new File(['beillesztve\n'],name,{type:'text/plain'}));
  element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
 },prefix+'-pasted.txt');
 await expect(row(right,prefix+'-pasted.txt').getByRole('img',{name:'Szöveg',exact:true})).toBeVisible();
 await expect(right.locator('[data-dhx-id="count"]')).toHaveText('2 elem');
 // Results were inserted in place: no listing (of either panel) was reloaded.
 await page.waitForTimeout(1500);expect(lists).toEqual([]);
 expect((await api(page,'files','list',target)).body.data.items.map(item=>item.name).sort()).toEqual([prefix+'-dropped.txt',prefix+'-pasted.txt']);
 await page.unroute(url=>url.search.includes('blade=1'),hold);
 await upload.getByRole('button',{name:'Bezárás',exact:true}).click().catch(()=>{});
 expect(errors).toEqual([]);
});

test('viewer previous and next across the images, videos and audio of the listing',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 // The seeded images, videos and audio (D1) live in the Signage mount root (signage demo, files-media-plan U5).
 const left=panel(page,0),media=(await api(page,'files','list',(await api(page,'files','tree','signage')).body.data.root,{limit:200})).body.data.items.filter(item=>['image/png','image/jpeg','video/mp4','video/webm','audio/mpeg','audio/wav','audio/mp4'].includes(item.mime_type));
 // The first media file of the server-sorted listing, so its row is rendered without a search (which would narrow the sequence).
 const count=media.length,at=1,first=media[0]?.name,next=media[at]?.name;
 expect(next).toBeTruthy();
 // The shown file: an image by its accessible name, a video or audio element by its label.
 const shown=name=>windowDialog(page).getByRole('img',{name,exact:true}).or(windowDialog(page).locator(`video[aria-label="${name}"], audio[aria-label="${name}"]`));
 await mount(page,left,'Signage');await row(left,first).dblclick();
 const windows=page.locator('.blade-document-window');
 let bar=windowDialog(page).locator('.blade-document__bar');
 await expect(bar.locator('[data-dhx-id="index"]')).toHaveText(at+' / '+count);
 if(at===1)await expect(bar.getByRole('button',{name:'Előző',exact:true})).toBeDisabled();
 await bar.getByRole('button',{name:'Következő',exact:true}).click();
 await expect(windows).toHaveCount(1);await expect(shown(next)).toBeVisible();
 bar=windowDialog(page).locator('.blade-document__bar');await expect(bar.locator('[data-dhx-id="index"]')).toHaveText((at+1)+' / '+count);
 // PageUp/PageDown inside the viewer walk the same sequence.
 await page.keyboard.press('PageUp');
 await expect(windows).toHaveCount(1);await expect(shown(first)).toBeVisible();
 await page.keyboard.press('PageDown');await expect(shown(next)).toBeVisible();await expect(windows).toHaveCount(1);
 // The panel cursor followed: the command reopens the shown file.
 await windowDialog(page).getByRole('button',{name:/close/i}).click();await expect(windows).toHaveCount(0);
 await command(page,'Megtekintés');await expect(shown(next)).toBeVisible();
 await windowDialog(page).getByRole('button',{name:/close/i}).click();
 expect(errors).toEqual([]);
});

test('server authorization on direct requests and audit records',async({page,browser})=>{
 await start(page);
 const file=await entryId(page,'a',null,prefix+'-a.txt'),root=(await api(page,'files','tree','a')).body.data.root,rootC=(await api(page,'files','tree','c')).body.data.root;
 const post=(target,headers)=>target.evaluate(async headers=>{const r=await fetch('?blade=1',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({resource:'files',action:'tree',id:'a',values:{}})});return r.status;},headers);
 expect(await post(page,{})).toBe(403);
 const anonymous=await browser.newContext();const guest=await anonymous.newPage();await guest.goto('/');
 expect(await post(guest,{'X-BLADE-CSRF':'x'})).toBe(401);await anonymous.close();
 // Read-only reader, plus a temporary per-mount deny on Drive C (removed in finally).
 const reader=php(`echo $db->query("SELECT id FROM accounts WHERE email='reader@example.test'")->fetchColumn();`).trim();
 const rule=`subject_type='user' AND subject_id='${reader}' AND resource='files' AND channel='ui' AND effect='deny' AND scope='id' AND object_id='c'`;
 php(`foreach(['tree','list'] as $a)$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','${reader}','files',?,'ui','deny','id','c','')")->execute([$a]);`);
 const context=await browser.newContext();
 try{
  const other=await context.newPage();
  await signIn(other,'reader@example.test');await openFiles(other);
  const picture=await entryId(page,'signage',null,IMAGE);
  for(const [action,id,values,status] of [['tree','a',{},200],['text_get',file,{},200],['tree','c',{},403],['list',rootC,{},403],['create_directory',root,{name:prefix+'-x'},403],['copy',root,{sources:file},403],['move',root,{sources:file},403]])
   expect((await api(other,'files',action,id,values)).status,'reader '+action).toBe(status);
  expect((await content(other,picture)).status,'reader content_get').toBe(200);
  // GET reads run the same ACL: allowed for the reader, then denied per mount; anonymous requests need a session.
  const stream=`?blade=1&resource=files&action=content_stream&id=${picture}`,thumb=`?blade=1&resource=files&action=thumbnail_get&id=${picture}`;
  expect((await other.request.get(stream)).status(),'reader content_stream').toBe(200);
  expect((await other.request.get(thumb)).status(),'reader thumbnail_get').toBe(200);
  php(`foreach(['content_stream','thumbnail_get'] as $a)$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','${reader}','files',?,'ui','deny','id','signage','')")->execute([$a]);`);
  expect((await other.request.get(stream)).status(),'denied content_stream').toBe(403);
  expect((await other.request.get(thumb)).status(),'denied thumbnail_get').toBe(403);
  const stranger=await browser.newContext();
  try{expect((await stranger.request.get(new URL(stream,other.url()).href)).status(),'anonymous content_stream').toBe(401);}finally{await stranger.close();}
  expect((await multipart(other,'upload',root,{},[['files[]',prefix+'-y.txt','x']])).status,'reader upload').toBe(403);
  expect((await multipart(other,'text_save',file,{revision:'1'},[['content','x.txt','x']])).status,'reader save').toBe(403);
  await expect(other.getByRole('button',{name:'Új mappa',exact:true})).toHaveCount(0);
  await expect(other.getByRole('button',{name:'Feltöltés',exact:true})).toHaveCount(0);
  // The reader may download (file and ZIP) but neither rename nor delete.
  for(const name of ['Átnevezés','Törlés'])await expect(other.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(other.getByRole('button',{name:'Letöltés',exact:true})).toBeVisible();
  expect((await api(other,'files','rename',file,{name:prefix+'-reader.txt'})).status,'reader rename').toBe(403);
  expect((await api(other,'files','delete',root,{sources:file})).status,'reader delete').toBe(403);
  expect((await other.request.get(new URL(`?blade=1&resource=files&action=download&id=${file}`,other.url()).href)).status(),'reader download').toBe(200);
  const prepared=await api(other,'files','zip_prepare',root,{sources:file});expect(prepared.status,'reader zip_prepare').toBe(200);
  expect((await page.request.get(new URL(`?blade=1&resource=files&action=zip_get&id=${prepared.body.data.token}`,page.url()).href)).status(),'foreign zip token').toBe(404);
  await panel(other,0).locator('[data-dhx-id="mount"]').click();
  await expect(other.getByRole('menuitem',{name:'Drive B',exact:true})).toBeVisible();await expect(other.getByRole('menuitem',{name:'Drive C',exact:true})).toHaveCount(0);
 }finally{await context.close();php(`$db->exec("DELETE FROM blade_rules WHERE ${rule}");$db->exec("DELETE FROM blade_rules WHERE subject_type='user' AND subject_id='${reader}' AND resource='files' AND action IN ('content_stream','thumbnail_get') AND effect='deny' AND object_id='signage'");`);}
 const audit=JSON.parse(php(`$q=$db->prepare("SELECT actor_id,action,outcome,object_id,detail FROM blade_audit WHERE resource='files' AND occurred_at>=? ORDER BY id");$q->execute(['${started}']);echo json_encode($q->fetchAll(PDO::FETCH_ASSOC));`));
 for(const action of ['create_directory','upload','copy','move','text_save','content_get','content_stream','thumbnail_get','rename','delete','download','zip_prepare','zip_get'])expect(audit.some(r=>r.action===action&&r.outcome==='success'),action).toBe(true);
 expect(audit.some(r=>r.outcome==='rejected'&&r.actor_id===reader)).toBe(true);
 const copy=audit.find(r=>r.action==='copy'&&r.outcome==='success');expect(JSON.parse(copy.detail).sources.length).toBeGreaterThan(0);
 expect(JSON.stringify(audit)).not.toContain(prefix);expect(JSON.stringify(audit)).not.toContain('szerkesztett');
});

test('localization, themes, the panel divider and the desktop-only notice',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 for(const [label,theme] of [['Éjjeli','dark'],['Világos','light'],['Skyblue','skyblue']]){
  await page.locator('.blade-navigation-row').getByRole('button',{name:/^(Skyblue|Világos|Éjjeli)$/}).click();await page.getByText(label,{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-dhx-theme',theme);
  const border=await panel(page,0).locator('.blade-file-panel__body').evaluate(element=>getComputedStyle(element).borderTopColor);
  expect(border).not.toBe('rgba(0, 0, 0, 0)');
  await expect(panel(page,1)).toBeVisible();
  await expect(panel(page,0).getByRole('textbox',{name:'Keresés',exact:true})).toBeVisible();
  await expect(panel(page,0).locator('[data-dhx-id="sort"]')).toBeVisible();
 }
 const language=page.locator('.blade-navigation-row').getByRole('button',{name:'Magyar',exact:true});
 await language.click();await page.getByText('English',{exact:true}).click();
 await openFiles(page,'Feature demo','File manager');
 await expect(path(panel(page,0))).toHaveText('Drive A:/');await expect(page.getByRole('button',{name:'New folder',exact:true})).toBeVisible();
 for(const name of ['Rename','Delete','Download'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
 await expect(panel(page,0).locator('[data-dhx-id="sort"]')).toHaveText('Sort: Name ↑');
 await expect(panel(page,0).locator('.dhx_grid-header-cell').filter({hasText:'Modified'})).toBeVisible();
 const denied=await api(page,'files','text_get',await entryId(page,'signage',null,IMAGE));expect(denied.body.error).toBe('Only .txt files can be edited.');
 await page.locator('.blade-navigation-row').getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).click();
 // Native Layout divider: drag fully left, then right; the right panel keeps filling the row.
 await openFiles(page);
 const edges=index=>panel(page,index).evaluate(element=>{const box=element.getBoundingClientRect();return [box.left,box.right];});
 const grip=page.locator('.blade-file-panels > .dhx_layout-resizer .dhx_layout-resizer__icon');
 const [,end]=await edges(1),[origin,half]=await edges(0);expect(Math.abs((half-origin)-(end-(await edges(1))[0]))).toBeLessThan(2);
 // The native dot grip sits in the middle of the gap, not on a panel border.
 expect(Math.abs((await grip.boundingBox()).x-(half+(await edges(1))[0])/2)).toBeLessThan(1);
 await view(page,panel(page,1),'Mappafa');expect((await edges(0))[1]).toBeCloseTo(half,0);
 const drag=async x=>{const box=await grip.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(x,box.y+box.height/2,{steps:8});await page.mouse.up();};
 await drag(origin+40);expect((await edges(0))[1]).toBeLessThan(origin+60);
 await drag(origin+900);expect(Math.abs((await edges(0))[1]-(origin+900))).toBeLessThan(4);expect((await edges(1))[1]).toBeCloseTo(end,0);
 await view(page,panel(page,1),'Fájllista');
 // A long header path keeps the mount and the current folder; the full path is shown on hover.
 const long=prefix+'-'+'hosszú mappanév '.repeat(8).trim();
 const outer=(await api(page,'files','create_directory',(await api(page,'files','tree','c')).body.data.root,{name:long})).body.data.id;
 expect((await api(page,'files','create_directory',outer,{name:prefix+'-belső'})).status).toBe(200);
 await mount(page,panel(page,1),'Drive B');await mount(page,panel(page,1),'Drive C');
 await enter(panel(page,1),long);await row(panel(page,1),prefix+'-belső').dblclick();
 await expect(path(panel(page,1))).toHaveText('Drive C:/…/'+prefix+'-belső');
 await path(panel(page,1)).hover();await expect(page.locator('.dhx_tooltip__text')).toHaveText('Drive C:/'+long+'/'+prefix+'-belső');
 await page.mouse.move(0,0);
 // desktopOnly view option: below 768 px a centred notice replaces the view, which keeps its state.
 await mount(page,panel(page,1),'Drive C');await enter(panel(page,1),'Közös');
 await page.setViewportSize({width:390,height:844});
 const notice=page.getByRole('status').filter({hasText:'Csak desktop környezetben elérhető funkció.'});
 await expect(notice).toBeVisible();await expect(notice).toContainText('Fájlkezelő');
 await expect(panel(page,0)).toBeHidden();await expect(panel(page,1)).toBeHidden();
 const centre=await notice.boundingBox();expect(Math.abs(centre.x+centre.width/2-195)).toBeLessThan(2);expect(centre.x).toBeGreaterThanOrEqual(16);
 const area=await page.locator('[data-cell-id="workspace"]').boundingBox();expect(Math.abs(centre.y+centre.height/2-(area.y+area.height/2))).toBeLessThan(2);
 await page.setViewportSize({width:1400,height:900});
 await expect(notice).toBeHidden();await expect(panel(page,1)).toBeVisible();await expect(path(panel(page,1))).toHaveText('Drive C:/Közös');
 expect(errors).toEqual([]);
});

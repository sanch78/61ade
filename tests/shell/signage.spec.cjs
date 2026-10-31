const {test,expect}=require('../../tools/playwright-test.cjs');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,command,api}=require('./feature-demo.cjs');
// Signage media library on shared files (Digitális kijelző → Médiatár), phase U5 of docs/files-media-plan.md:
// `file` field with the tiles picker and upload, derived media columns, usage count, upload as asset, and the
// usage warning of deleting a referenced asset (schedule events, defaults) or file (file manager, Signage mount).
// Every asset, file, event and default created here starts with the run prefix (or uses the run's far-future
// date) and is removed afterwards; seeded demo data is never changed.
const prefix='ps'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const DAY='2099-12-30';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const jpg=fs.readFileSync(path.resolve(__dirname,'../../examples/demo-app/resources/files/minta-fraktal.jpg'));
const cleanup=()=>php(`
 $assets="SELECT id FROM signage_assets WHERE title LIKE '${prefix}%'";
 $db->exec("DELETE FROM signage_defaults WHERE date LIKE '2099-12-%' OR asset_id IN ($assets)");
 $db->exec("DELETE FROM blade_calendar_events WHERE space='signage' AND text LIKE '${prefix}%'");
 $db->exec("DELETE FROM signage_assets WHERE title LIKE '${prefix}%'");
 $q=$db->prepare("DELETE FROM blade_files WHERE space='demo' AND (name LIKE ? OR (parent_id<>0 AND parent_id NOT IN (SELECT id FROM blade_files)))");do{$q->execute(['${prefix}%']);}while($q->rowCount()>0);`);
test.describe.configure({mode:'serial'});
test.beforeAll(()=>{php(`$db->exec("DELETE FROM signage_defaults WHERE date LIKE '2099-12-%'");`);});
test.afterAll(cleanup);

const FILE_CONSEQUENCE='A hivatkozó elemek megmaradnak, a fájlhivatkozásuk törlődik.',RECORD_CONSEQUENCE='Törléskor a hivatkozások törlődnek.';
const exact=text=>new RegExp('^'+text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');
const toast=(page,text)=>page.locator('.blade-toast').filter({hasText:text});
const dialog=page=>page.getByRole('alertdialog');
const row=(page,title)=>page.locator('[data-cell-id="grid"] .dhx_grid-row').filter({has:page.getByRole('gridcell',{name:title,exact:true})});
const editor=(page,label)=>page.getByRole('dialog',{name:new RegExp(' — '+label+'$')});
const picker=page=>page.getByRole('dialog',{name:/^(Fájl kiválasztása|Choose a file): /});
const uploader=page=>page.getByRole('dialog').filter({has:page.locator('.blade-uploader')});
const filesInput=page=>page.locator('input[data-blade-upload-input="files"]');
const fileName=form=>form.locator('.blade-file-field__body input').first();
const tile=(scope,name)=>scope.locator('.blade-grid-tile').filter({hasText:name});
// Grid column id of a header (derived columns have consumer-chosen ids).
async function column(page,header){
 const cell=page.locator('[data-cell-id="grid"] [role="columnheader"]').filter({hasText:header}).first();
 await expect(cell).toBeVisible();return cell.getAttribute('data-dhx-id');
}
async function cell(page,title,header){return row(page,title).locator(`.dhx_grid-cell[data-dhx-col-id="${await column(page,header)}"]`);}
// Wide enough that every column (also Használat) is rendered by the virtualized Grid.
async function openLibrary(page,email='demo@example.test'){
 await page.setViewportSize({width:1920,height:1000});await signIn(page,email,'/#view=signage_assets');
 await expect(page.locator('[data-cell-id="grid"]').locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();
 await mode(page,'Táblázat');
}
// The view selector, also when the command bar has moved into the responsive "Műveletek" menu.
async function mode(page,label){
 const menu=page.locator('[data-cell-id="grid"]').getByRole('button',{name:/^(Műveletek|Actions)$/});
 if(await menu.isVisible()){
  await menu.click();const item=page.getByRole('menuitem',{name:/^(Nézet|View):/});
  if((await item.textContent()).includes(label)){await page.keyboard.press('Escape');await page.mouse.click(5,990);return;}
  await item.click();await page.getByRole('menuitem',{name:label,exact:true}).click();return;
 }
 const button=page.getByRole('button',{name:/^Nézet:/});
 if((await button.textContent()).includes(label))return;
 await button.click();await page.getByRole('menuitem',{name:label,exact:true}).click();await expect(button).toHaveText('Nézet: '+label);
}
async function search(page,text){
 const box=page.locator('[data-cell-id="grid"]').getByRole('textbox',{name:'Keresés',exact:true});
 const listed=page.waitForResponse(r=>{try{const body=r.request().postDataJSON();return body?.action==='list'&&(body.values?.search??'')===text;}catch{return false;}});
 await box.fill(text);await box.press('Enter');await listed;
}
// Files in a mount root (Signage by default) through the file manager's direct multipart upload; returns name → id.
async function seedFiles(page,files,mount='signage'){
 const root=(await api(page,'files','tree',mount)).body.data.root;
 const result=await page.evaluate(async([root,files])=>{
  const csrf=JSON.parse(document.getElementById('blade-config').textContent).csrf,form=new FormData();
  form.append('request',JSON.stringify({resource:'files',action:'upload',id:root,values:{}}));
  for(const [name,data] of files)form.append('files[]',new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'application/octet-stream'}),name);
  const response=await fetch('?blade=1',{method:'POST',headers:{'X-BLADE-CSRF':csrf},body:form});
  return {status:response.status,body:await response.json()};
 },[root,files.map(([name,buffer])=>[name,buffer.toString('base64')])]);
 expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.data.failed).toEqual([]);
 return Object.fromEntries(result.body.data.succeeded.map(item=>[item.name,String(item.id)]));
}
async function findAsset(page,title){
 const listed=await api(page,'signage_assets','list',null,{mode:'dynamic',limit:100,sort:{field:'id',direction:'desc'},filters:{},search:title});
 expect(listed.status,JSON.stringify(listed.body)).toBe(200);
 return listed.body.data.items.find(item=>item.title===title);
}
async function createAsset(page,title,fileId){
 const created=await api(page,'signage_assets','create',null,{title,file_id:fileId,duration:'10'});
 expect(created.status,JSON.stringify(created.body)).toBe(200);
 return String((await findAsset(page,title)).id);
}
// Lazily seeded once per worker: three files in the Signage mount and two referencing assets.
let seeded;
async function seed(page){
 if(seeded)return seeded;
 const files=await seedFiles(page,[[prefix+'-a.png',png],[prefix+'-b.jpg',jpg],[prefix+'-del.png',png]]);
 const used=await createAsset(page,prefix+' használt',files[prefix+'-a.png']);
 const fileUsed=await createAsset(page,prefix+' fájlhivatkozás',files[prefix+'-del.png']);
 php(`$db->prepare("INSERT INTO signage_defaults(weekday,date,asset_id) VALUES ('',?,?)")->execute(['${DAY}','${used}']);
  $db->prepare("INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,data) VALUES ('signage',?,?,?,'',0,?)")->execute(['${prefix} esemény','${DAY} 08:00:00','${DAY} 09:00:00',json_encode(['content'=>'asset:${used}'])]);`);
 return seeded={files,used,fileUsed};
}

test('list: thumbnail, derived type/resolution/length, play time and usage columns; tiles, search and type filter',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);await seed(page);await page.reload();
 await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
 for(const header of ['Megnevezés','Típus','Felbontás','Hossz','Lejátszási idő (mp)','Használat'])await expect(page.locator('[data-cell-id="grid"] [role="columnheader"]').filter({hasText:header}).first()).toBeVisible();
 // Seeded video: type and length from the media metadata, never from a stored kind (searched: the oldest row may lie below the rendered rows).
 await search(page,'Promóciós videó');
 await expect(await cell(page,'Promóciós videó','Típus')).toHaveText('Videó');
 await expect(await cell(page,'Promóciós videó','Hossz')).toHaveText(/^\d+:\d\d$/);
 await expect(await cell(page,'Promóciós videó','Felbontás')).toHaveText(/^\d+ × \d+$/);
 await expect(row(page,'Promóciós videó').getByRole('img',{name:/^Videó: minta-video\.webm/})).toBeVisible();
 // Usage: the run's asset is referenced by one schedule event and one default.
 await search(page,prefix);
 await expect(await cell(page,prefix+' használt','Használat')).toHaveText('2');
 // The run's own PNG asset: type from the media metadata, no length for a still image (independent of the seeded demo rows).
 await expect(await cell(page,prefix+' használt','Típus')).toHaveText('Kép');await expect(await cell(page,prefix+' használt','Hossz')).toHaveText('');
 await expect(await cell(page,prefix+' fájlhivatkozás','Használat')).toHaveText('0');
 await expect(await cell(page,prefix+' használt','Felbontás')).toHaveText('1 × 1');
 // Derived columns are neither sortable nor filterable.
 const sortable=await page.evaluate(()=>[...document.querySelectorAll('[data-cell-id="grid"] [role="columnheader"]')].filter(h=>h.hasAttribute('aria-sort')).map(h=>h.textContent.trim()));
 for(const header of ['Típus','Felbontás','Hossz'])expect(sortable.some(text=>text.startsWith(header))).toBe(false);
 // Tiles: thumbnail slot, title and the type line; the search still applies.
 await mode(page,'Csempék');
 await expect(page.locator('[data-cell-id="grid"] .blade-grid-tile')).toHaveCount(2);
 await expect(tile(page.locator('[data-cell-id="grid"]'),prefix+' használt').getByRole('img',{name:'Kép: '+prefix+'-a.png'})).toBeVisible();
 await search(page,'');
 // Type filter on the media column (image/video MIME class).
 await mode(page,'Táblázat');
 const typeFilter=page.locator('[data-cell-id="filter"]').getByLabel('Médiafájl',{exact:true}).or(page.locator('[data-cell-id="filter"] select').first());
 if(await typeFilter.count()){
  await typeFilter.first().selectOption({label:'Videó'});await page.locator('[data-cell-id="filter"]').getByRole('button',{name:'Szűrés',exact:true}).click();
  await expect(row(page,'Promóciós videó')).toBeVisible();await expect(row(page,prefix+' használt')).toHaveCount(0);
  await page.locator('[data-cell-id="filter"]').getByRole('button',{name:'Alaphelyzet',exact:true}).click();
  await expect(row(page,prefix+' használt')).toBeVisible();
 }
 expect(errors).toEqual([]);
});

test('create and edit: the file field picker (tiles, search, type filter, keyboard) and upload into the Signage folder',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);const {files}=await seed(page);
 await command(page,'Hozzáadás');
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await expect(form.getByRole('button',{name:'Kiválasztás…',exact:true})).toBeVisible();
 await expect(form.getByRole('button',{name:'Fájl feltöltése…',exact:true})).toBeVisible();
 await form.getByLabel('Megnevezés',{exact:true}).fill(prefix+' új');
 // A required file field reports its error on the visible file name, like other fields.
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form.locator('.blade-file-field')).toContainText('Kötelező mező.');
 await form.getByRole('button',{name:'Kiválasztás…',exact:true}).click();
 const box=picker(page);await expect(box).toBeVisible();
 await expect(box.locator('.blade-grid-tile').first()).toBeVisible();
 // Only accepted media; search narrows the folder; the type filter offers the accepted classes.
 const find=box.getByRole('textbox',{name:'Keresés',exact:true});await expect(find).toBeFocused();
 await find.fill(prefix);await find.press('Enter');
 await expect(box.locator('.blade-grid-tile')).toHaveCount(3);
 await box.locator('[data-dhx-id="type"]').click();
 await expect(page.getByRole('menuitem',{name:'Szöveg',exact:true})).toHaveCount(0);
 await page.getByRole('menuitem',{name:'Videók',exact:true}).click();
 await expect(box.locator('.blade-grid-tile')).toHaveCount(0);
 await box.locator('[data-dhx-id="type"]').click();await page.getByRole('menuitem',{name:'Képek',exact:true}).click();
 await expect(box.locator('.blade-grid-tile')).toHaveCount(3);
 await expect(box.getByRole('button',{name:'Kiválasztás',exact:true})).toBeDisabled();
 // Double-click chooses.
 await tile(box,prefix+'-b.jpg').dblclick();
 await expect(box).toHaveCount(0);
 await expect(fileName(form)).toHaveValue(prefix+'-b.jpg');
 // The thumbnail item shows the image once its thumbnail is ready, otherwise the image type glyph.
 await expect(form.locator('.blade-file-field__media img[alt="Kép: '+prefix+'-b.jpg"], .blade-file-field__media .dxi-image-outline').first()).toBeVisible();
 await expect(form.locator('.blade-file-field')).not.toContainText('Kötelező mező.');
 // Escape closes the picker without a change; Enter on a selected tile chooses.
 await form.getByRole('button',{name:'Kiválasztás…',exact:true}).click();await expect(picker(page)).toBeVisible();
 await page.keyboard.press('Escape');await expect(picker(page)).toHaveCount(0);await expect(fileName(form)).toHaveValue(prefix+'-b.jpg');
 // Focus returns to the field's command when the picker closes.
 await expect(form.getByRole('button',{name:'Kiválasztás…',exact:true})).toBeFocused();
 await fileName(form).focus();await page.keyboard.press('Enter');await expect(picker(page)).toBeVisible();
 await picker(page).getByRole('textbox',{name:'Keresés',exact:true}).fill(prefix+'-a');await picker(page).getByRole('textbox',{name:'Keresés',exact:true}).press('Enter');
 await expect(picker(page).locator('.blade-grid-tile')).toHaveCount(1);
 await tile(picker(page),prefix+'-a.png').click();await expect(picker(page).getByRole('button',{name:'Kiválasztás',exact:true})).toBeEnabled();
 await page.keyboard.press('Enter');await expect(picker(page)).toHaveCount(0);
 await expect(fileName(form)).toHaveValue(prefix+'-a.png');
 const saved=page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==='create';}catch{return false;}});
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 const created=await saved;expect(created.status()).toBe(200);
 expect(JSON.parse(created.request().postData()).values.file_id).toBe(files[prefix+'-a.png']);
 await expect(form).toHaveCount(0);
 await search(page,prefix+' új');
 await expect(await cell(page,prefix+' új','Típus')).toHaveText('Kép');
 // Edit: "Fájl feltöltése…" uploads into the Signage folder and chooses the first stored file.
 await row(page,prefix+' új').locator('.dhx_grid-cell').nth(1).click();
 await command(page,'Módosítás');
 const edit=editor(page,'Módosítás');await expect(edit).toBeVisible();
 await expect(fileName(edit)).toHaveValue(prefix+'-a.png');
 await edit.getByRole('button',{name:'Fájl feltöltése…',exact:true}).click();
 await expect(uploader(page)).toBeVisible();
 await expect(uploader(page)).toContainText('Signage:/');
 await filesInput(page).setInputFiles([{name:prefix+'-c.png',mimeType:'image/png',buffer:png}]);
 await expect(fileName(edit)).toHaveValue(prefix+'-c.png',{timeout:20000});
 await uploader(page).getByRole('button',{name:'Bezárás',exact:true}).click();
 await edit.getByRole('button',{name:'Mentés',exact:true}).click();await expect(edit).toHaveCount(0);
 await expect(row(page,prefix+' új').getByRole('img',{name:'Kép: '+prefix+'-c.png',exact:true})).toBeVisible();
 // The uploaded file is a file of the Signage mount root.
 const root=(await api(page,'files','tree','signage')).body.data.root;
 const listed=await api(page,'files','list',root,{search:prefix+'-c'});
 expect(listed.body.data.items.map(item=>item.name)).toEqual([prefix+'-c.png']);
 // The server rejects a file outside the field's mount or class.
 const asset=await findAsset(page,prefix+' új');
 const text=(await api(page,'files','list',(await api(page,'files','tree','a')).body.data.root,{type:'text'})).body.data.items[0];
 const schema=await api(page,'signage_assets','__form',String(asset.id),{operation:'update'});
 if(text){
  const rejected=await api(page,'signage_assets','update',String(asset.id),{title:asset.title,file_id:text.id,duration:'10',revision:schema.body.data.values.revision});
  expect(rejected.status).toBe(400);expect(rejected.body.fieldErrors?.file_id).toBeTruthy();
  // An unchanged stored reference (here a file outside the mount and class) does not block saving other fields.
  php(`$db->prepare('UPDATE signage_assets SET file_id=? WHERE id=?')->execute(['${text.id}','${asset.id}']);`);
  const legacy=await api(page,'signage_assets','__form',String(asset.id),{operation:'update'});
  const kept=await api(page,'signage_assets','update',String(asset.id),{title:asset.title+' régi',file_id:text.id,duration:'10',revision:legacy.body.data.values.revision});
  expect(kept.status,JSON.stringify(kept.body)).toBe(200);
  php(`$db->prepare("UPDATE signage_assets SET title=?, file_id=? WHERE id=?")->execute(['${asset.title}','${asset.file_id}','${asset.id}']);`);
 }
 expect(errors).toEqual([]);
});

test('default content: the date field is a native date picker in the form and in the grid cell',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);const {used}=await seed(page);
 await page.goto('/#view=signage_defaults');await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
 const stored=()=>JSON.parse(php(`echo json_encode($db->query("SELECT date FROM signage_defaults WHERE date LIKE '2099-12-%' ORDER BY date")->fetchAll(PDO::FETCH_COLUMN));`));
 // Grid cell: double-click opens the Suite calendar on the stored month; a picked day is saved as YYYY-MM-DD.
 const day=row(page,DAY).locator(`.dhx_grid-cell[data-dhx-col-id="${await column(page,'Dátum')}"]`);
 await day.dblclick();const popup=page.locator('.dhx_popup .dhx_calendar').last();await expect(popup).toBeVisible();
 await expect(popup).toContainText(/2099/);
 const saved=page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==='__edit';}catch{return false;}});
 await popup.locator('.dhx_calendar-day:not(.dhx_calendar-day--outside)').filter({hasText:/^31$/}).click();
 expect((await saved).status()).toBe(200);await expect.poll(stored).toEqual(['2099-12-31']);
 await expect(row(page,'2099-12-31')).toBeVisible();
 // Form: a datepicker item whose popup fills the field with YYYY-MM-DD; a typed date is accepted too.
 await command(page,'Hozzáadás');const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 const input=form.getByLabel('Dátum',{exact:true});await input.click();
 const formPopup=page.locator('.dhx_popup .dhx_calendar').last();await expect(formPopup).toBeVisible();
 await formPopup.locator('.dhx_calendar-day:not(.dhx_calendar-day--outside)').filter({hasText:/^15$/}).click();
 await expect(input).toHaveValue(/^\d{4}-\d{2}-15$/);
 await input.fill('2099-12-29');await form.getByText('Alapértelmezett tartalom').first().click();await expect(formPopup).toBeHidden();await expect(input).toHaveValue('2099-12-29');
 await form.getByLabel('Alapértelmezett tartalom',{exact:true}).selectOption(used);
 await form.getByRole('button',{name:'Mentés',exact:true}).click();await expect(form).toHaveCount(0);
 await expect.poll(stored).toEqual(['2099-12-29','2099-12-31']);
 expect(errors).toEqual([]);
});
test('"Feltöltés" uploads files as new assets in one step',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);await seed(page);
 await command(page,'Feltöltés');
 await expect(uploader(page)).toBeVisible();
 await filesInput(page).setInputFiles([{name:prefix+'-feltoltes.png',mimeType:'image/png',buffer:png},{name:prefix+'-feltoltes2.jpg',mimeType:'image/jpeg',buffer:jpg}]);
 await expect(uploader(page).locator('.blade-uploader__state').filter({hasText:'Kész'})).toHaveCount(2,{timeout:30000});
 await uploader(page).getByRole('button',{name:'Bezárás',exact:true}).click();
 await search(page,prefix+'-feltoltes');
 await expect(row(page,prefix+'-feltoltes')).toBeVisible();await expect(row(page,prefix+'-feltoltes2')).toBeVisible();
 await expect(await cell(page,prefix+'-feltoltes','Lejátszási idő (mp)')).toHaveText('10');
 await expect(await cell(page,prefix+'-feltoltes2','Típus')).toHaveText('Kép');
 // The file is stored in the Signage mount, visible to the file manager.
 const root=(await api(page,'files','tree','signage')).body.data.root;
 expect((await api(page,'files','list',root,{search:prefix+'-feltoltes'})).body.data.items.length).toBe(2);
 expect(errors).toEqual([]);
});

test('deleting a used asset warns with the usage counts, then clears the defaults and blanks the events',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);const {used}=await seed(page);
 await search(page,prefix+' használt');
 await row(page,prefix+' használt').locator('.dhx_grid-cell').nth(1).click();
 const previews=[];page.on('request',request=>{try{const body=request.postDataJSON();if(body?.action==='__bulk'&&body.values?.operation==='delete')previews.push(body);}catch{}});
 await command(page,'Törlés');
 const warning=dialog(page);await expect(warning).toBeVisible();
 await expect(warning).toContainText('Műsorterv-események: 1');await expect(warning).toContainText('Alapértelmezett tartalmak: 1');
 await expect(warning).toContainText(RECORD_CONSEQUENCE);await expect(warning).not.toContainText(FILE_CONSEQUENCE);
 // A mark (row-marking mode) deletes through the bulk path: one preview request, nothing deleted yet.
 expect(previews.length).toBe(1);expect(previews[0].values.items.every(item=>item.values.preview==='1')).toBe(true);
 // Cancel keeps everything.
 await expect(warning.getByRole('button',{name:'Mégse',exact:true})).toBeFocused();
 await warning.getByRole('button',{name:'Mégse',exact:true}).click();await expect(warning).toHaveCount(0);
 expect(JSON.parse(php(`echo json_encode($db->query("SELECT COUNT(*) FROM signage_defaults WHERE asset_id='${used}'")->fetchColumn());`))).toBe(1);
 await command(page,'Törlés');await dialog(page).getByRole('button',{name:'Törlés',exact:true}).click();
 await expect(toast(page,'Törölt hivatkozások:')).toBeVisible();
 await expect(toast(page,'Műsorterv-események: 1')).toBeVisible();
 await expect(row(page,prefix+' használt')).toHaveCount(0);
 const state=JSON.parse(php(`echo json_encode(['defaults'=>(int)$db->query("SELECT COUNT(*) FROM signage_defaults WHERE asset_id='${used}'")->fetchColumn(),
  'event'=>$db->query("SELECT data FROM blade_calendar_events WHERE space='signage' AND text='${prefix} esemény'")->fetchColumn()]);`));
 expect(state.defaults).toBe(0);
 expect(state.event).not.toBe(false);expect(String(JSON.parse(state.event).content??'')).not.toBe(used);
 // The playlist ignores the event without an asset.
 const day=await api(page,'signage_playlist','day',null,{date:DAY});expect(day.status).toBe(200);
 expect(day.body.data.scheduled.filter(item=>item.asset).map(item=>item.title)).not.toContain(prefix+' esemény');
 // An unused asset is deleted without a usage warning.
 const free=await createAsset(page,prefix+' szabad',seeded.files[prefix+'-b.jpg']);
 await search(page,prefix+' szabad');await row(page,prefix+' szabad').locator('.dhx_grid-cell').nth(1).click();
 // Without references only the declared confirmation (if any) is shown, never the usage list.
 const deleted=page.waitForResponse(r=>{try{const body=r.request().postDataJSON();return body?.action==='__bulk'&&body.values?.operation==='delete'&&body.values.items.every(item=>item.values.preview!=='1');}catch{return false;}});
 await command(page,'Törlés');
 await expect.poll(async()=>await dialog(page).count()||await row(page,prefix+' szabad').count()===0).toBeTruthy();
 if(await dialog(page).count()){await expect(dialog(page)).not.toContainText('Hivatkozások:');await dialog(page).getByRole('button',{name:'Törlés',exact:true}).click();}
 expect((await deleted).status()).toBe(200);await expect(row(page,prefix+' szabad')).toHaveCount(0);
 expect((await api(page,'signage_assets','get',free)).status).toBe(404);
 expect(errors).toEqual([]);
});

test('deleting a used file in the file manager (Signage mount) warns, and the asset keeps an empty file',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);const {fileUsed}=await seed(page);
 await openMenu(page,'Fájlkezelő','Feature demó');
 const left=page.locator('[data-cell-id="panel-0"]');
 await expect(left.locator('.dhx_grid-row').first()).toBeVisible();
 // A copy onto the used file's name: the conflict dialog names the references of the existing file; skipping changes nothing.
 const twin=(await seedFiles(page,[[prefix+'-del.png',png]],'b'))[prefix+'-del.png'];
 const right=page.locator('[data-cell-id="panel-1"]');
 await left.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Drive B',exact:true}).click();
 await expect(left.locator('.dhx_layout-cell-header__title').first()).toHaveText('Drive B:/');
 await right.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Signage',exact:true}).click();
 await expect(right.locator('.dhx_layout-cell-header__title').first()).toHaveText('Signage:/');
 await left.locator('.dhx_grid-row').filter({has:page.getByRole('gridcell',{name:prefix+'-del.png',exact:true})}).locator('.dhx_grid-cell').nth(1).click();
 await command(page,'Másolás');
 await expect(dialog(page)).toContainText('Névütközés');await expect(dialog(page)).toContainText('Hivatkozások: Médiatár-elemek: 1');
 await dialog(page).getByRole('button',{name:'Kihagyás',exact:true}).click();
 await expect(dialog(page)).toContainText('kihagyva: 1');await dialog(page).getByRole('button',{name:'Rendben',exact:true}).click();
 expect((await api(page,'signage_assets','get',fileUsed)).body.data.file_id).toBe(seeded.files[prefix+'-del.png']);
 expect((await api(page,'files','delete',(await api(page,'files','tree','b')).body.data.root,{sources:twin})).status).toBe(200);
 await left.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Signage',exact:true}).click();
 await expect(left.locator('.dhx_layout-cell-header__title').first()).toHaveText('Signage:/');
 const entry=left.locator('.dhx_grid-row').filter({has:page.getByRole('gridcell',{name:prefix+'-del.png',exact:true})});
 await entry.locator('.dhx_grid-cell').nth(1).click();
 await page.getByRole('button',{name:'Törlés',exact:true}).click();
 const warning=dialog(page);await expect(warning).toBeVisible();
 await expect(warning).toContainText('Médiatár-elemek: 1');await expect(warning).toContainText(FILE_CONSEQUENCE);await expect(warning).not.toContainText(RECORD_CONSEQUENCE);
 await warning.getByRole('button',{name:'Törlés',exact:true}).click();
 await expect(toast(page,'Médiatár-elemek: 1')).toBeVisible();await expect(entry).toHaveCount(0);
 const asset=await api(page,'signage_assets','get',fileUsed);expect(asset.status).toBe(200);expect(asset.body.data.file_id).toBe('');
 // The library shows the asset without media.
 await openMenu(page,'Médiatár','Digitális kijelző');
 await search(page,prefix+' fájlhivatkozás');
 await expect(await cell(page,prefix+' fájlhivatkozás','Típus')).toHaveText('');
 await expect(row(page,prefix+' fájlhivatkozás').locator('.blade-media')).toHaveCount(0);
 // A file without references is deleted with the declared confirmation only.
 await openMenu(page,'Fájlkezelő','Feature demó');
 await left.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Signage',exact:true}).click();
 const plain=left.locator('.dhx_grid-row').filter({has:page.getByRole('gridcell',{name:prefix+'-b.jpg',exact:true})});
 await plain.locator('.dhx_grid-cell').nth(1).click();await page.getByRole('button',{name:'Törlés',exact:true}).click();
 await expect(dialog(page)).toBeVisible();await expect(dialog(page)).not.toContainText(FILE_CONSEQUENCE);
 await dialog(page).getByRole('button',{name:'Mégse',exact:true}).click();
 expect(errors).toEqual([]);
});

test('reader: read-only library and Signage mount',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1400,height:900});await signIn(page,'reader@example.test','/#view=signage_assets');
 await expect(page.locator('.blade-navigation-row')).toBeVisible();
 const listed=await api(page,'signage_assets','list',null,{mode:'dynamic',limit:10,sort:{field:'id',direction:'desc'},filters:{}});
 if(listed.status===200){
  await expect(page.locator('[data-cell-id="grid"]').locator('.dhx_grid-row, .blade-grid-card, .blade-grid-tile').first()).toBeVisible();
  for(const name of ['Hozzáadás','Módosítás','Törlés','Feltöltés'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 }else expect(listed.status).toBe(403);
 expect((await api(page,'signage_assets','create',null,{title:prefix+' olvasó',file_id:'',duration:'10'})).status).toBe(403);
 await openMenu(page,'Fájlkezelő','Feature demó');
 const left=page.locator('[data-cell-id="panel-0"]');await expect(left.locator('.dhx_grid-row').first()).toBeVisible();
 await left.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Signage',exact:true}).click();
 await expect(left.locator('.dhx_layout-cell-header__title').first()).toHaveText('Signage:/');
 await expect(left.locator('.dhx_grid-row').first()).toBeVisible();
 for(const name of ['Törlés','Feltöltés','Átnevezés'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('three themes and English: file field, picker and derived columns',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openLibrary(page);await seed(page);
 for(const [label,theme] of [['Éjjeli','dark'],['Világos','light'],['Skyblue','skyblue']]){
  await page.locator('.blade-navigation-row').getByRole('button',{name:/^(Skyblue|Világos|Éjjeli)$/}).click();await page.getByText(label,{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-dhx-theme',theme);
  await command(page,'Hozzáadás');const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
  const preview=form.locator('.blade-file-field__media .dhx_avatar');await expect(preview).toBeVisible();
  expect(await preview.evaluate(element=>getComputedStyle(element).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
  await form.getByRole('button',{name:'Kiválasztás…',exact:true}).click();await expect(picker(page).locator('.blade-grid-tile').first()).toBeVisible();
  const colors=await picker(page).locator('.blade-grid-tile__title').first().evaluate(element=>{const style=getComputedStyle(element),tile=getComputedStyle(element.closest('.dhx_dataview-item'));return [style.color,tile.backgroundColor];});
  expect(colors[0]).not.toBe(colors[1]);
  await page.screenshot({path:path.join(runtime,`signage-picker-${theme}.png`)});
  await picker(page).getByRole('button',{name:'Mégse',exact:true}).click();await expect(picker(page)).toHaveCount(0);
  await form.getByRole('button',{name:'Mégse',exact:true}).click();await expect(form).toHaveCount(0);
 }
 await page.locator('.blade-navigation-row').getByRole('button',{name:'Magyar',exact:true}).click();await page.getByText('English',{exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await openMenu(page,'Media library','Digital signage');
 await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
 await expect(await cell(page,'Promóciós videó','Type')).toHaveText('Video');
 const actions=page.getByRole('button',{name:'Actions',exact:true});
 if(await actions.isVisible()){await actions.click();await page.getByRole('menuitem',{name:'Add',exact:true}).click();}
 else await page.getByRole('button',{name:'Add',exact:true}).click();
 const form=page.getByRole('dialog',{name:/ — Add$/});await expect(form).toBeVisible();
 await expect(form.getByRole('button',{name:'Choose…',exact:true})).toBeVisible();await expect(form.getByRole('button',{name:'Upload file…',exact:true})).toBeVisible();
 await form.getByRole('button',{name:'Choose…',exact:true}).click();
 await expect(picker(page)).toBeVisible();await expect(picker(page).getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
 await expect(picker(page).getByRole('textbox',{name:'Search',exact:true})).toBeVisible();
 await picker(page).getByRole('button',{name:'Cancel',exact:true}).click();await form.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('.blade-navigation-row').getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).last().click();
 await expect(page.locator('html')).toHaveAttribute('lang','hu');
 expect(errors).toEqual([]);
});

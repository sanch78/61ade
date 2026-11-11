const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,api}=require('./feature-demo.cjs');
// A file field backed by the project's own storage (FB-0167, docs/workspaces.md#stored-file-field) on the feature demo's
// `Mellékletek`: the image is uploaded in the background (paste, drop, native dialog) to the project's upload action
// and saved with the record's other fields in one save; Cancel leaves no record; the edit form shows the stored file
// through the project's GET action and replaces it; a wrong type, an oversize file and a foreign token are field errors.
// Records and files of the run start with the run prefix and are removed afterwards.
const prefix='sf'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const query=sql=>JSON.parse(php(`echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`));
const cleanup=()=>php(`$db->exec("DELETE FROM demo_attachments WHERE title LIKE '${prefix}%'");$db->exec("DELETE FROM demo_attachment_files WHERE name LIKE '${prefix}%'");`);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const png2=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9QzwAEjDAGNzYAAB/SAv8M2pkzAAAAAElFTkSuQmCC','base64');
test.describe.configure({mode:'serial'});
test.beforeAll(cleanup);
test.afterAll(cleanup);

const editor=(page,label)=>page.getByRole('dialog',{name:new RegExp(' — '+label+'$')});
const field=form=>form.locator('.blade-file-field');
const fileName=form=>form.locator('.blade-file-field__body input').first();
const uploader=page=>page.getByRole('dialog').filter({has:page.locator('.blade-uploader')});
const row=(page,title)=>page.locator('[data-cell-id="grid"] .dhx_grid-row').filter({has:page.getByRole('gridcell',{name:title,exact:true})});
/** A clipboard paste or a drop of one file onto the field's file name; `bytes` is a Buffer or a size of zero bytes. */
async function give(form,how,name,bytes,type='image/png'){
 await fileName(form).evaluate((element,[how,name,bytes,type])=>{
  const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],name,{type}));
  if(how==='paste'){element.focus();element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));}
  else for(const event of ['dragenter','dragover','drop'])element.dispatchEvent(new DragEvent(event,{dataTransfer:data,bubbles:true,cancelable:true}));
 },[how,name,typeof bytes==='number'?bytes:[...bytes],type]);
}
async function open(page){
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test','/#view=demo_attachments');
 await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
}
async function fill(form,title){
 await form.getByLabel('Megnevezés',{exact:true}).fill(title);
 await form.getByLabel('Szerep',{exact:true}).selectOption({label:'Bizonyíték'});
 await form.getByLabel('Indoklás',{exact:true}).fill(prefix+' indok');
}

test('create: the file uploads in the background and is saved with the other fields in one save; Cancel leaves no record',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 // Cancel after an upload: no record; the project's pending upload stays unclaimed (it expires by the project's rule).
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 let form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await fill(form,prefix+' elvetett');
 const chosen=page.waitForEvent('filechooser');
 await form.getByRole('button',{name:'Fájl megadása…',exact:true}).click();
 const chooser=await chosen;expect(chooser.isMultiple()).toBe(false);
 await chooser.setFiles([{name:prefix+'-elvetett.png',mimeType:'image/png',buffer:png}]);
 await expect(fileName(form)).toHaveValue(prefix+'-elvetett.png',{timeout:20000});
 await form.getByRole('button',{name:'Mégse',exact:true}).click();await expect(form).toHaveCount(0);
 expect(query(`SELECT id FROM demo_attachments WHERE title LIKE '${prefix}%'`)).toEqual([]);
 expect(query(`SELECT state FROM demo_attachment_files WHERE name='${prefix}-elvetett.png'`)).toEqual([{state:'pending'}]);
 // Create: paste while the transfer is held; saving waits for it; the token reaches the create with the other fields.
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await fill(form,prefix+' új');
 let release;const held=new Promise(resolve=>{release=resolve;});
 await page.route(url=>url.search.includes('blade=1'),async route=>{if((route.request().postData()??'').includes('"upload_finish"'))await held;await route.continue();});
 await give(form,'paste',prefix+'-kep.png',png);
 await expect(field(form)).toContainText('Feltöltés…');
 const image=form.locator('.blade-file-field__media img');await expect(image).toBeVisible();
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(field(form)).toContainText('Várd meg a fájl feltöltését.');
 expect(query(`SELECT id FROM demo_attachments WHERE title LIKE '${prefix}%'`)).toEqual([]);
 release();
 await expect(fileName(form)).toHaveValue(prefix+'-kep.png',{timeout:20000});
 await expect(uploader(page)).toBeHidden();
 await page.unroute(url=>url.search.includes('blade=1'));
 const saved=page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==='create';}catch{return false;}});
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 const created=await saved;expect(created.status()).toBe(200);
 const sent=JSON.parse(created.request().postData()).values;
 expect(sent).toMatchObject({title:prefix+' új',role:'evidence',reason:prefix+' indok'});
 expect(sent.file).toMatch(/^[0-9a-f]{32}$/);
 await expect(form).toHaveCount(0);
 expect(query(`SELECT title,role,reason,file FROM demo_attachments WHERE title LIKE '${prefix}%'`)).toEqual([{title:prefix+' új',role:'evidence',reason:prefix+' indok',file:sent.file}]);
 expect(query(`SELECT state FROM demo_attachment_files WHERE id='${sent.file}'`)).toEqual([{state:'committed'}]);
 // The list shows the project's file name column, never the token.
 await expect(row(page,prefix+' új')).toContainText(prefix+'-kep.png');
 await expect(row(page,prefix+' új')).not.toContainText(sent.file);
 // The token is claimed once: a second record with it is a field error.
 const again=await api(page,'demo_attachments','create',null,{title:prefix+' másolat',role:'reference',file:sent.file});
 expect(again.status).toBe(400);expect(again.body.fieldErrors?.file).toBe('A kiválasztott fájl nem érhető el.');
 expect(errors).toEqual([]);
});

test('update: the stored file is shown through the GET action and replaced by a drop; a new revision is recorded',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 const [record]=query(`SELECT id,file FROM demo_attachments WHERE title='${prefix} új'`);
 const before=(await api(page,'demo_attachments','__form',String(record.id),{operation:'update'})).body.data.values.revision;
 await row(page,prefix+' új').locator('.dhx_grid-cell').nth(1).click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const form=editor(page,'Módosítás');await expect(form).toBeVisible();
 // Name and preview of the saved file come from the project's GET action (HEAD, then the image itself).
 await expect(fileName(form)).toHaveValue(prefix+'-kep.png');
 const image=form.locator('.blade-file-field__media img');await expect(image).toBeVisible();
 await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 expect(await image.getAttribute('src')).toContain('action=file');
 await expect(form.getByRole('button',{name:'Fájl cseréje…',exact:true})).toBeVisible();
 await expect(form.getByRole('button',{name:'Törlés',exact:true})).toBeEnabled();
 // Refused files keep the current one: a wrong type (by its bytes) and an oversize file.
 await give(form,'drop',prefix+'-szoveg.png',Buffer.from('nem kép\n'),'image/png');
 await expect(field(form)).toContainText('A fájl típusa ehhez a mezőhöz nem engedélyezett.',{timeout:20000});
 await expect(fileName(form)).toHaveValue(prefix+'-kep.png');
 await give(form,'drop',prefix+'-nagy.png',2097153,'image/png');
 await expect(field(form)).toContainText('A fájl túl nagy',{timeout:20000});
 await expect(fileName(form)).toHaveValue(prefix+'-kep.png');
 // A drop replaces it; the save records the new file and a new revision.
 await give(form,'drop',prefix+'-csere.png',png2);
 await expect(fileName(form)).toHaveValue(prefix+'-csere.png',{timeout:20000});
 await expect(uploader(page)).toBeHidden();
 await form.getByRole('button',{name:'Mentés',exact:true}).click();await expect(form).toHaveCount(0);
 const [after]=query(`SELECT file FROM demo_attachments WHERE id=${record.id}`);
 expect(after.file).not.toBe(record.file);
 expect(query(`SELECT name,state FROM demo_attachment_files WHERE id='${after.file}'`)).toEqual([{name:prefix+'-csere.png',state:'committed'}]);
 expect((await api(page,'demo_attachments','__form',String(record.id),{operation:'update'})).body.data.values.revision).not.toBe(before);
 await expect(row(page,prefix+' új')).toContainText(prefix+'-csere.png');
 // Reopened, the form shows the new file.
 await row(page,prefix+' új').locator('.dhx_grid-cell').nth(1).click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const reopened=editor(page,'Módosítás');await expect(fileName(reopened)).toHaveValue(prefix+'-csere.png');
 await reopened.getByRole('button',{name:'Mégse',exact:true}).click();
 // A made-up or other record's committed id is no upload of this actor: a field error, the record unchanged.
 const revision=(await api(page,'demo_attachments','__form',String(record.id),{operation:'update'})).body.data.values.revision;
 for(const value of ['0'.repeat(32),record.file]){
  const refused=await api(page,'demo_attachments','update',String(record.id),{title:prefix+' új',role:'evidence',file:value,revision});
  expect(refused.status).toBe(400);expect(refused.body.fieldErrors?.file).toBe('A kiválasztott fájl nem érhető el.');
 }
 expect(query(`SELECT file FROM demo_attachments WHERE id=${record.id}`)).toEqual([{file:after.file}]);
 expect(errors).toEqual([]);
});

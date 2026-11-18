const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,api}=require('./feature-demo.cjs');
// Record action forms on the feature demo's `Mellékletek` (examples/demo-app/attachments.php): read-only fields
// (FB-0171: the role is create-only, so the update form shows it read-only; a RecordForm's `readOnly` preset) and a
// collapsible field section (FB-0172: the two images form `Képek`), a fixed section, the sticky action row of a tall
// window and the section groups of cards and details (FB-0177), the reason's `group` placement and the application's
// default window height (`windowMaxHeight` in a fixture bootstrap, FB-0225). A fixture module hands `app` to the page
// for the RecordForm cases. Records and files of the run start with the run prefix and are removed afterwards.
const prefix='rf'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const query=sql=>JSON.parse(php(`echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`));
const cleanup=()=>php(`$db->exec("DELETE FROM demo_attachments WHERE title LIKE '${prefix}%'");$db->exec("DELETE FROM demo_attachment_files WHERE name LIKE '${prefix}%'");`);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const MODULE='/record-forms-fixture.mjs';
test.describe.configure({mode:'serial'});
test.beforeAll(cleanup);
test.afterAll(cleanup);

const editor=(page,label)=>page.getByRole('dialog',{name:new RegExp(' — '+label+'$')});
const row=(page,title)=>page.locator('[data-cell-id="grid"] .dhx_grid-row').filter({has:page.getByRole('gridcell',{name:title,exact:true})});
/** The values of the next request of $action. */
const sent=(page,action)=>page.waitForRequest(request=>{try{return request.postDataJSON()?.action===action;}catch{return false;}}).then(request=>request.postDataJSON().values);
/** The account's language (the shell's own form post); a run ends on Hungarian. */
const language=(page,locale)=>page.evaluate(async locale=>{
 const csrf=document.querySelector('#blade-command input[name="csrf"]').value;
 return (await fetch('./',{method:'POST',body:new URLSearchParams({action:'language',csrf,locale})})).status;
},locale);
/** $extra: further bootstrap keys of the signed-in page (`windowMaxHeight`, an application's declaration). */
async function fixture(page,extra={}){
 await page.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',body:'export default app=>{window.__bladeApp=app;};'}));
 await page.route(url=>url.pathname==='/'&&!url.searchParams.has('blade'),async route=>{
  const request=route.request();
  if(request.method()!=='GET'||request.resourceType()!=='document')return route.fallback();
  const response=await route.fetch();
  const body=(await response.text()).replace(/(<script type="application\/json" id="blade-config">)([\s\S]*?)(<\/script>)/,(all,open,json,close)=>{
   const config=JSON.parse(json);if(!config.authenticated)return all;
   config.modules=[...(config.modules??[]),MODULE];Object.assign(config,extra);
   return open+JSON.stringify(config).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')+close;
  });
  await route.fulfill({response,body});
 });
}
async function open(page,width=1366,extra={}){
 await fixture(page,extra);
 await page.setViewportSize({width,height:width<768?844:900});
 await signIn(page,'demo@example.test','/#view=demo_attachments');
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
 // A phone shows the list as cards.
 if(width>=768)await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
}
/** A RecordForm in an `app.ui.window` (it fits the window); `window.__form` is the component. */
const mountForm=(page,options)=>page.evaluate(options=>{
 const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width:560,height:640});
 window.__form=new app.components.RecordForm(options);window.__form.mount(host);
},options);
const fixtureWindow=page=>page.getByRole('dialog',{name:'Fixture',exact:true});
/** The save button sits at the lower edge of the window (the sticky action row, FB-0177). */
async function saveAtBottom(win){
 await expect.poll(async()=>{
  const frame=await win.boundingBox(),button=await win.getByRole('button',{name:'Mentés',exact:true}).boundingBox();
  const gap=frame.y+frame.height-(button.y+button.height);return gap>=0&&gap<40;
 }).toBe(true);
}
/** A paste of one image onto the first file field's name input. */
const paste=(form,name)=>form.locator('.blade-file-field__body input').first().evaluate((element,[name,bytes])=>{
 const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],name,{type:'image/png'}));
 element.focus();element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
},[name,[...png]]);

test('read-only fields: a preset select of a RecordForm; the create-only role in the update form',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 expect(await page.evaluate(()=>{try{new window.__bladeApp.components.RecordForm({resource:'demo_attachments',action:'create',readOnly:'role'});return 'created';}catch(error){return error.constructor.name;}})).toBe('TypeError');
 // The host presets the role and fixes it: its option label shows in a readonly input, named by its label, reachable by
 // Tab, without a required mark; typing and a click change nothing, and the save sends the preset value.
 await mountForm(page,{resource:'demo_attachments',action:'create',values:{role:'evidence'},readOnly:['role']});
 const win=fixtureWindow(page),role=win.getByLabel('Szerep',{exact:true});
 await expect(role).toHaveValue('Bizonyíték');
 await expect(role).toHaveAttribute('readonly','');
 expect(await role.evaluate(element=>element.required||element.getAttribute('aria-required')==='true')).toBe(false);
 await expect(win.locator('select')).toHaveCount(0);
 await win.getByLabel('Megnevezés',{exact:true}).fill(prefix+' preset');
 await page.keyboard.press('Tab');
 await expect(role).toBeFocused();
 await page.keyboard.type('xyz');await page.keyboard.press('Backspace');
 await role.click();
 await expect(role).toHaveValue('Bizonyíték');
 const created=sent(page,'create');
 await win.getByRole('button',{name:'Mentés',exact:true}).click();
 expect(await created).toMatchObject({title:prefix+' preset',role:'evidence'});
 await expect.poll(()=>query(`SELECT role FROM demo_attachments WHERE title='${prefix} preset'`)).toEqual([{role:'evidence'}]);
 await page.evaluate(()=>window.__window.close());
 // The update form of the list: the create-only role first, read-only with its label; the save does not send it, and
 // a request that sends it is refused.
 await page.reload();
 await row(page,prefix+' preset').locator('.dhx_grid-cell').nth(1).click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const form=editor(page,'Módosítás');await expect(form).toBeVisible();
 const shown=form.getByLabel('Szerep',{exact:true});
 await expect(shown).toHaveValue('Bizonyíték');await expect(shown).toHaveAttribute('readonly','');
 await expect(form.locator('input:not([type="hidden"]):visible, textarea:visible').first()).toHaveAttribute('aria-label','Szerep');
 await form.getByLabel('Megnevezés',{exact:true}).fill(prefix+' preset 2');
 const updated=sent(page,'update');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 const values=await updated;
 expect(values.title).toBe(prefix+' preset 2');expect(Object.hasOwn(values,'role')).toBe(false);
 await expect(form).toHaveCount(0);
 const [record]=query(`SELECT id,role FROM demo_attachments WHERE title='${prefix} preset 2'`);
 expect(record.role).toBe('evidence');
 const revision=(await api(page,'demo_attachments','__form',String(record.id),{operation:'update'})).body.data.values.revision;
 const refused=await api(page,'demo_attachments','update',String(record.id),{title:prefix+' preset 2',role:'reference',revision});
 expect(refused.status).toBe(400);
 expect(query(`SELECT role FROM demo_attachments WHERE id=${record.id}`)).toEqual([{role:'evidence'}]);
 expect(errors).toEqual([]);
});

test('a collapsible section: closed on create, open with a stored file, opened by an error; closed values are saved',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 // Create: the section is closed; the keyboard opens (Enter) and closes (Space) it; the window refits.
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 let form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 const toggle=form.getByRole('button',{name:'Képek',exact:true});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 // The fieldset by role while shown (a hidden one has no computed name), by its place while closed.
 const group=form.getByRole('group',{name:'Képek',exact:true}),body=form.locator('.blade-form-section:not(.blade-form-section--fixed) fieldset');
 // The fixed section (FB-0177): a group named by its legend, always open, with no disclosure button.
 const basics=form.getByRole('group',{name:'Alapadatok',exact:true});
 await expect(basics).toBeVisible();
 await expect(basics.getByRole('textbox',{name:'Megnevezés'})).toBeVisible();
 await expect(form.getByRole('button',{name:'Alapadatok'})).toHaveCount(0);
 await expect(body).toBeHidden();
 // The frame clips the square header bar to its rounded inner edge (no page colour in the corners).
 expect(await form.locator('.blade-form-section:not(.blade-form-section--fixed)').evaluate(element=>getComputedStyle(element).overflow)).toBe('hidden');
 expect(await toggle.evaluate(element=>getComputedStyle(element).borderTopLeftRadius)).toBe('0px');
 await expect(toggle).toHaveAttribute('aria-controls',await body.evaluate(element=>element.id));
 const closedHeight=(await form.boundingBox()).height;
 await form.getByLabel('Indoklás',{exact:true}).focus();await page.keyboard.press('Tab');
 await expect(toggle).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(group).toBeVisible();
 await expect(group.getByRole('textbox',{name:'Kép',exact:true})).toBeVisible();
 await expect.poll(async()=>(await form.boundingBox()).height).toBeGreaterThan(closedHeight+100);
 // A tall form (FB-0177): the window stops at 800 px; the fields scroll between its header and the action row, which
 // stays at the window's lower edge.
 await expect.poll(async()=>(await form.boundingBox()).height).toBeLessThanOrEqual(800);
 expect(await form.locator('.dhx_form').evaluate(element=>element.scrollHeight>element.clientHeight+100)).toBe(true);
 await saveAtBottom(form);
 await page.keyboard.press('Space');
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(body).toBeHidden();
 // A value given before closing stays and is saved.
 await form.getByLabel('Megnevezés',{exact:true}).fill(prefix+' képes');
 await form.getByLabel('Szerep',{exact:true}).selectOption({label:'Melléklet'});
 await toggle.click();
 await paste(form,prefix+'-kep.png');
 await expect(form.locator('.blade-file-field__body input').first()).toHaveValue(prefix+'-kep.png',{timeout:20000});
 await toggle.click();await expect(body).toBeHidden();
 const created=sent(page,'create');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 const values=await created;expect(values.file).toMatch(/^[0-9a-f]{32}$/);
 await expect(form).toHaveCount(0);
 const [record]=query(`SELECT id,file FROM demo_attachments WHERE title='${prefix} képes'`);
 expect(record.file).toBe(values.file);
 // Update with a stored image: open. Closed again, the save still sends the stored value and keeps it.
 await row(page,prefix+' képes').locator('.dhx_grid-cell').nth(1).click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 form=editor(page,'Módosítás');await expect(form).toBeVisible();
 await expect(form.getByRole('button',{name:'Képek',exact:true})).toHaveAttribute('aria-expanded','true');
 await expect(form.locator('.blade-file-field__body input').first()).toHaveValue(prefix+'-kep.png');
 await form.getByRole('button',{name:'Képek',exact:true}).click();
 await form.getByLabel('Indoklás',{exact:true}).fill(prefix+' zárva mentve');
 const updated=sent(page,'update');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 expect((await updated).file).toBe(record.file);
 await expect(form).toHaveCount(0);
 expect(query(`SELECT file,reason FROM demo_attachments WHERE id=${record.id}`)).toEqual([{file:record.file,reason:prefix+' zárva mentve'}]);
 // A server field error in the closed section of a RecordForm (an update without an image) opens it and focuses the field.
 const [plain]=query(`SELECT id FROM demo_attachments WHERE title='${prefix} preset 2'`);
 await mountForm(page,{resource:'demo_attachments',action:'update',id:String(plain.id)});
 const win=fixtureWindow(page),section=win.getByRole('button',{name:'Képek',exact:true});
 await expect(section).toHaveAttribute('aria-expanded','false');
 await page.evaluate(()=>window.__form.setValues({file:'0'.repeat(32)}));
 const failure=await page.evaluate(()=>window.__form.submit().then(()=>null,error=>error.status));
 expect(failure).toBe(400);
 await expect(section).toHaveAttribute('aria-expanded','true');
 await expect(win.locator('.blade-file-field').first()).toContainText('A kiválasztott fájl nem érhető el.');
 await expect(win.locator('.blade-file-field__body input').first()).toBeFocused();
 await page.evaluate(()=>window.__window.close());
 expect(errors).toEqual([]);
});

test('a fitted window stops at its maxHeight with the action row at its lower edge; an invalid maxHeight throws',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 // The demo declares no `windowMaxHeight`: its bootstrap carries none, so fitted windows stop at 800 px.
 expect(await page.evaluate(()=>Object.hasOwn(JSON.parse(document.getElementById('blade-config').textContent),'windowMaxHeight'))).toBe(false);
 const invalid=await page.evaluate(()=>[100,Number.NaN,'800'].map(maxHeight=>{try{window.__bladeApp.ui.window({title:'Invalid',maxHeight}).close();return 'accepted';}catch(error){return error instanceof TypeError;}}));
 expect(invalid).toEqual([true,true,true]);
 await expect(page.getByRole('dialog',{name:'Invalid'})).toHaveCount(0);
 await page.evaluate(()=>{
  const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width:560,height:640,maxHeight:420});
  window.__form=new app.components.RecordForm({resource:'demo_attachments',action:'create'});window.__form.mount(host);
 });
 const win=fixtureWindow(page);
 await expect(win.getByRole('group',{name:'Alapadatok',exact:true})).toBeVisible();
 await expect.poll(async()=>Math.round((await win.boundingBox()).height)).toBe(420);
 await saveAtBottom(win);
 // Scrolled to the end and back, the action row stays where it is; the last field scrolls into view above it.
 const scroller=win.locator('.dhx_form');
 await scroller.evaluate(element=>{element.scrollTop=element.scrollHeight;});
 await saveAtBottom(win);
 await expect(win.getByRole('button',{name:'Képek',exact:true})).toBeInViewport();
 await scroller.evaluate(element=>{element.scrollTop=0;});
 await saveAtBottom(win);
 await page.evaluate(()=>window.__window.close());
 // `fit: false` keeps the requested size, also when the RecordForm asks its window to fit once its fields show.
 await page.evaluate(()=>{
  const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width:560,height:640,fit:false});
  window.__form=new app.components.RecordForm({resource:'demo_attachments',action:'create'});window.__form.mount(host);
 });
 await expect(win.getByRole('group',{name:'Alapadatok',exact:true})).toBeVisible();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 expect(Math.round((await win.boundingBox()).height)).toBe(640);
 await page.evaluate(()=>window.__window.close());
 expect(errors).toEqual([]);
});

test('the application\'s windowMaxHeight is the default height of fitted windows; a window maxHeight still wins',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 // A fixture bootstrap as an application declaring `windowMaxHeight: 400` sends it (FB-0225, docs/workspaces.md#window-sizing).
 await open(page,1366,{windowMaxHeight:400});
 const mount=maxHeight=>page.evaluate(maxHeight=>{
  const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width:560,height:640,...(maxHeight?{maxHeight}:{})});
  window.__form=new app.components.RecordForm({resource:'demo_attachments',action:'create'});window.__form.mount(host);
 },maxHeight);
 const win=fixtureWindow(page);
 // Without its own maxHeight a RecordForm's window stops at 400 px (the form is taller), its action row at the edge.
 await mount();
 await expect(win.getByRole('group',{name:'Alapadatok',exact:true})).toBeVisible();
 await expect.poll(async()=>Math.round((await win.boundingBox()).height)).toBe(400);
 await saveAtBottom(win);
 await page.evaluate(()=>window.__window.close());await expect(win).toHaveCount(0);
 // A window's own maxHeight wins over the application's: the same form fits higher.
 await mount(600);
 await expect(win.getByRole('group',{name:'Alapadatok',exact:true})).toBeVisible();
 await expect.poll(async()=>Math.round((await win.boundingBox()).height)).toBeGreaterThan(400);
 expect(Math.round((await win.boundingBox()).height)).toBeLessThanOrEqual(600);
 await page.evaluate(()=>window.__window.close());await expect(win).toHaveCount(0);
 // The list's own form window follows the application's default too: with `Képek` open it stays at 400 px.
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await form.getByRole('button',{name:'Képek',exact:true}).click();
 await expect(form.getByRole('group',{name:'Képek',exact:true})).toBeVisible();
 await expect.poll(async()=>Math.round((await form.boundingBox()).height)).toBe(400);
 await saveAtBottom(form);
 await form.getByRole('button',{name:'Mégse',exact:true}).click();await expect(form).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('cards and details group the fields by section, the reason a group of its own between them',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
 try{
  const card=page.locator('article.blade-grid-card').filter({hasText:'Mintakép helye'}),groups=card.locator('.blade-record-group');
  await expect(groups).toHaveCount(3);
  await expect(groups.locator('.blade-record-group__title')).toHaveText(['Alapadatok','Indoklás','Képek']);
  await expect(groups.nth(0)).toContainText('Megnevezés');await expect(groups.nth(0)).toContainText('Szerep');
  await expect(groups.nth(2)).toContainText('Fájlnév');
  // The reason (outside every section, `placement: "group"`, FB-0225) is a group of its own at its declaration place,
  // titled by its label without a label row, six lines of it; nothing below the groups.
  const reason=groups.nth(1);
  await expect(reason).toHaveClass(/blade-record-group--text/);
  await expect(reason.locator('dt')).toHaveCount(0);
  await expect(reason).toContainText('Ide kerül a referenciakép.');
  expect(await reason.locator('.blade-grid-card__value').evaluate(element=>getComputedStyle(element).webkitLineClamp)).toBe('6');
  await expect(card.locator('.blade-record-wide')).toHaveCount(0);
  // The demo's 1:2 columns: Alapadatok and the reason side by side with equal heights, Képek in the next row.
  const [one,two,three]=[await groups.nth(0).boundingBox(),await reason.boundingBox(),await groups.nth(2).boundingBox()];
  expect(Math.abs(one.y-two.y)).toBeLessThan(2);expect(two.x).toBeGreaterThan(one.x+one.width);expect(Math.abs(one.height-two.height)).toBeLessThan(2);
  expect(three.y).toBeGreaterThan(Math.max(one.y+one.height,two.y+two.height));expect(Math.abs(three.x-one.x)).toBeLessThan(2);
  // The details window shows the same groups.
  await card.dblclick();
  const details=page.getByRole('dialog',{name:'Rekordadatok'});
  await expect(details.locator('.blade-record-group__title')).toHaveText(['Alapadatok','Indoklás','Képek']);
  await expect(details.locator('.blade-record-group--text')).toContainText('Ide kerül a referenciakép.');
  await expect(details.locator('.blade-record-wide')).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
  // A phone stacks the groups, the reason between the two sections.
  await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>(await groups.nth(1).boundingBox()).y-(await groups.nth(0).boundingBox()).y).toBeGreaterThan(40);
  await expect.poll(async()=>(await groups.nth(2).boundingBox()).y-(await groups.nth(1).boundingBox()).y).toBeGreaterThan(40);
 }finally{
  await page.setViewportSize({width:1366,height:900});
  await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Táblázat',{exact:true}).click();
  await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
 }
 expect(errors).toEqual([]);
});

test('the section and a read-only preset in English at 390 px',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page,390);
 expect(await language(page,'en')).toBeLessThan(400);
 try{
  await page.reload();
  await page.waitForFunction(()=>!!window.__bladeApp);
  await mountForm(page,{resource:'demo_attachments',action:'create',values:{role:'evidence'},readOnly:['role']});
  const win=fixtureWindow(page),toggle=win.getByRole('button',{name:'Images',exact:true});
  // Below 768 px the window is full screen and stays so when the RecordForm asks it to fit.
  await expect(win.getByLabel('Role',{exact:true})).toBeVisible();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(Math.round((await win.boundingBox()).height)).toBe(844);
  // The read-only preset shows its English option label.
  await expect(win.getByLabel('Role',{exact:true})).toHaveValue('Evidence');
  await expect(win.getByLabel('Role',{exact:true})).toHaveAttribute('readonly','');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  const box=await toggle.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await toggle.focus();await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  const group=win.getByRole('group',{name:'Images',exact:true});
  await expect(group.getByRole('textbox',{name:'Image',exact:true})).toBeVisible();
  await expect(group.getByRole('textbox',{name:'Detail image',exact:true})).toBeAttached();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await page.evaluate(()=>window.__window.close());
 }finally{await language(page,'hu');}
 expect(errors).toEqual([]);
});

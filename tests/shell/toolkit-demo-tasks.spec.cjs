const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openView,command,view,api,isAction,createTask,deleteTasks}=require('./feature-demo.cjs');
// Toolkit D4 (docs/demos.md#toolkit-consumer): the feature demo module registers the field type `demo.rating`
// (Feladatok → Prioritás: number input + Suite toggle-group star strip, star display) and the record command `demo.copy-text`
// ("Másolás szövegként"). Tasks created here carry the run prefix; they are deleted after each test and, as a
// fallback, by prefix after the run.
const prefix='pt'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const created=[];
test.describe.configure({mode:'serial'});
test.afterEach(async({page})=>deleteTasks(page,created));
test.afterAll(()=>{try{php(`$ids="SELECT id FROM demo_tasks WHERE title LIKE '${prefix}%'";$db->exec("DELETE FROM demo_task_settings WHERE task_id IN ($ids)");$db->exec("DELETE FROM demo_tasks WHERE title LIKE '${prefix}%'");`);}catch{}});

const RANGE='0 és 5 közötti egész szám adható meg.';
const COPY='Másolás szövegként';
// Page errors and the registries' fallback reports (unknown or failing field type or command) must stay empty.
function watch(page){
 const seen={errors:[],reports:[]};
 page.on('pageerror',error=>seen.errors.push(error.message));
 page.on('console',message=>{const text=message.text();if(/61ade: (unknown (field type|command)|field type)|demo\.(rating|copy-text)/.test(text))seen.reports.push(text);});
 return seen;
}
// Filter by title so the rows are found regardless of the live list window.
async function only(page,title){
 const filter=page.locator('[data-cell-id="filter"]');
 await filter.getByLabel('Megnevezés',{exact:true}).fill(title);await filter.getByRole('button',{name:'Szűrés',exact:true}).click();
}
// The star strip: a Suite togglegroup named "Prioritás — csillagok" of five toggle buttons (★ pressed, ☆ released).
const STRIP='Prioritás — csillagok';
const starsOf=scope=>scope.getByRole('group',{name:STRIP,exact:true}).getByRole('button');
const stars=scope=>starsOf(scope).allInnerTexts().then(texts=>texts.map(text=>text.trim()).join(''));
// The command's control: a toolbar button, or the Műveletek menu item (the menu is then open).
async function control(page,name){
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();return page.getByRole('menuitem',{name,exact:true});}
 return page.getByRole('button',{name,exact:true});
}
const toast=(page,text)=>page.locator('.blade-toast').filter({hasText:text});

test('demo.rating edits in the grid cell, the update and create forms and the card editor, saves through the framework and re-renders',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1920,height:1000});await signIn(page);await openView(page,'Feladatok');
 const title=`${prefix} rács`;created.push(await createTask(page,{title,status:'new',priority:2}));
 await only(page,prefix);
 const row=page.locator('.dhx_grid-row').filter({hasText:title});await expect(row).toBeVisible({timeout:10000});
 const cell=row.locator('[data-dhx-col-id="priority"]'),rating=cell.locator('.demo-rating');
 // Display: stars with one accessible name; the editable cell is the framework's edit button, not a cell editor.
 await expect(rating).toHaveAttribute('role','img');await expect(rating).toHaveAttribute('aria-label','2 / 5 csillag');await expect(rating).toHaveText('★★☆☆☆');
 const anchor=cell.getByRole('button',{name:'Prioritás — szerkesztés',exact:true});
 await anchor.click();
 const editor=page.getByRole('dialog').filter({has:page.getByRole('spinbutton',{name:'Prioritás',exact:true})});
 const spin=editor.getByRole('spinbutton',{name:'Prioritás',exact:true});
 await expect(spin).toHaveValue('2');await expect(cell.locator('input')).toHaveCount(0);
 // The star strip: five Suite toggle buttons beside the input, pressed up to the rating; the input stays the labelled control.
 const strip=starsOf(editor);
 await expect(strip).toHaveCount(5);
 await expect.poll(()=>stars(editor)).toBe('★★☆☆☆');
 // Suite's togglegroup marks the pressed state with a class and no aria-pressed; the number input is the accessible control.
 await expect(strip.nth(1)).toHaveClass(/dhx_toggle--selected/);await expect(strip.nth(2)).not.toHaveClass(/dhx_toggle--selected/);
 await strip.nth(3).click();await expect(spin).toHaveValue('4');await expect.poll(()=>stars(editor)).toBe('★★★★☆');
 let edited=page.waitForResponse(isAction('__edit'));
 await editor.getByRole('button',{name:'Mentés',exact:true}).click();
 let request=(await edited).request().postDataJSON();
 expect(request).toMatchObject({resource:'demo_tasks',id:created[0],values:{field:'priority'}});expect(String(request.values.value)).toBe('4');
 await expect(editor).toHaveCount(0);await expect(rating).toHaveAttribute('aria-label','4 / 5 csillag');await expect(rating).toHaveText('★★★★☆');

 // Keyboard: Enter on the edit button opens the editor, the arrow keys step the input within 0–5, Enter on Mentés saves.
 await anchor.focus();await anchor.press('Enter');
 await expect(spin).toHaveValue('4');
 await spin.focus();await spin.press('ArrowDown');await expect(spin).toHaveValue('3');await expect.poll(()=>stars(editor)).toBe('★★★☆☆');
 for(let i=0;i<3;i++)await spin.press('ArrowUp');
 await expect(spin).toHaveValue('5');await expect.poll(()=>stars(editor)).toBe('★★★★★');
 // A star toggle is keyboard operable too: Space on the second star sets 2, Space on it again clears to 0, then 5 again.
 await strip.nth(1).focus();await strip.nth(1).press('Space');await expect(spin).toHaveValue('2');await expect.poll(()=>stars(editor)).toBe('★★☆☆☆');
 await strip.nth(1).press('Space');await expect(spin).toHaveValue('0');await expect.poll(()=>stars(editor)).toBe('☆☆☆☆☆');
 await strip.nth(4).focus();await strip.nth(4).press('Space');await expect(spin).toHaveValue('5');
 edited=page.waitForResponse(isAction('__edit'));
 await editor.getByRole('button',{name:'Mentés',exact:true}).press('Enter');
 expect(String((await edited).request().postDataJSON().values.value)).toBe('5');
 await expect(editor).toHaveCount(0);await expect(rating).toHaveAttribute('aria-label','5 / 5 csillag');

 // The server stays authoritative: a value the editor cannot produce (rewritten in transit) is refused with the
 // field error shown in the editor by the framework, and the stored value stays.
 await page.route('**/?blade=1',async route=>{
  let data;try{data=route.request().postDataJSON();}catch{}
  if(data?.action==='__edit'&&data.values?.field==='priority'){data.values.value='9';await route.continue({postData:JSON.stringify(data)});}
  else await route.continue();
 });
 await anchor.click();await strip.nth(0).click();await expect(spin).toHaveValue('1');
 const rejected=page.waitForResponse(isAction('__edit'));
 await editor.getByRole('button',{name:'Mentés',exact:true}).click();
 expect((await rejected).status()).toBe(400);
 await expect(editor).toContainText(RANGE);
 await editor.getByRole('button',{name:'Mégse',exact:true}).click();await expect(editor).toHaveCount(0);
 await page.unroute('**/?blade=1');
 await expect(rating).toHaveAttribute('aria-label','5 / 5 csillag');
 const schema=await api(page,'demo_tasks','__form',created[0],{operation:'update'});
 expect(String(schema.body.data.values.priority)).toBe('5');
 const refused=await api(page,'demo_tasks','__edit',created[0],{field:'priority',value:'7',revision:schema.body.data.values.revision});
 expect(refused.status).toBe(400);expect(refused.body.fieldErrors.priority).toBe(RANGE);

 // Update form (panel): the same editor; clicking the current star again clears to 0.
 await row.locator('[data-dhx-col-id="title"]').click();await command(page,'Módosítás');
 const form=page.locator('[data-cell-id="form"]'),formSpin=form.getByRole('spinbutton',{name:'Prioritás',exact:true});
 await expect(formSpin).toHaveValue('5');await expect.poll(()=>stars(form)).toBe('★★★★★');
 const formStar=starsOf(form).nth(1);
 await formStar.click();await expect(formSpin).toHaveValue('2');
 await formStar.click();await expect(formSpin).toHaveValue('0');await expect.poll(()=>stars(form)).toBe('☆☆☆☆☆');
 await formStar.click();await expect(formSpin).toHaveValue('2');
 const updated=page.waitForResponse(isAction('update'));
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 expect(String((await updated).request().postDataJSON().values.priority)).toBe('2');
 await expect(page.getByText('A művelet sikerült.',{exact:true}).first()).toBeVisible();
 await expect(rating).toHaveAttribute('aria-label','2 / 5 csillag',{timeout:10000});

 // Create form: the field default 0, set with the keyboard.
 await command(page,'Hozzáadás');
 await expect(formSpin).toHaveValue('0');
 const fresh=`${prefix} új`;await form.getByLabel('Megnevezés',{exact:true}).fill(fresh);
 await formSpin.focus();for(let i=0;i<3;i++)await formSpin.press('ArrowUp');
 await expect(formSpin).toHaveValue('3');await expect.poll(()=>stars(form)).toBe('★★★☆☆');
 const saved=page.waitForResponse(isAction('create'));
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 const answer=await saved;created.push(String((await answer.json()).data.id));
 expect(String(answer.request().postDataJSON().values.priority)).toBe('3');
 await only(page,prefix);
 await expect(page.locator('.dhx_grid-row').filter({hasText:fresh}).locator('[data-dhx-col-id="priority"] .demo-rating')).toHaveAttribute('aria-label','3 / 5 csillag',{timeout:10000});

 // Cards: the display at card size and the same edit window, opened with the keyboard.
 await view(page,'Kártyák');
 const card=page.locator('.blade-grid-card').filter({hasText:title}).first(),field=card.locator('[data-blade-field="priority"]');
 await expect(field).toHaveAttribute('aria-label','Prioritás — szerkesztés');
 await expect(field.locator('.demo-rating')).toHaveAttribute('aria-label','2 / 5 csillag');await expect(field.locator('.demo-rating')).toHaveClass(/demo-rating--card/);
 await field.focus();await field.press('Enter');
 await expect(spin).toHaveValue('2');
 await strip.nth(4).click();await expect(spin).toHaveValue('5');
 edited=page.waitForResponse(isAction('__edit'));
 await editor.getByRole('button',{name:'Mentés',exact:true}).click();
 expect(String((await edited).request().postDataJSON().values.value)).toBe('5');
 await expect(editor).toHaveCount(0);await expect(field.locator('.demo-rating')).toHaveAttribute('aria-label','5 / 5 csillag');
 // Record details (Adatok): the display at card size.
 await card.locator('.blade-grid-card__id').click();await command(page,'Adatok');
 const details=page.getByRole('dialog',{name:'Rekordadatok'});
 await expect(details.locator('.demo-rating')).toHaveAttribute('aria-label','5 / 5 csillag');
 await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
 await view(page,'Táblázat');
 expect(seen.errors).toEqual([]);expect(seen.reports).toEqual([]);
});

test('demo.copy-text copies the cursor record or the marked tasks as text, is disabled without a record, reports clipboard failures and works from Műveletek on mobile',async({page})=>{
 const seen=watch(page);
 // A clipboard stub: records the text, or rejects while __clipboardFails > 0.
 await page.addInitScript(()=>{
  window.__copied=[];window.__clipboardFails=0;
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
   if(window.__clipboardFails>0){window.__clipboardFails--;throw new DOMException('Denied','NotAllowedError');}
   window.__copied.push(String(text));
  }}});
 });
 await page.setViewportSize({width:1920,height:1000});await signIn(page);await openView(page,'Feladatok');
 const first=`${prefix} másolás 1`,second=`${prefix} másolás 2`;
 created.push(await createTask(page,{title:first,status:'progress',priority:3,contact:'+36201234567',labels:'urgent,customer',description:'Szintetikus D4 leírás'}));
 created.push(await createTask(page,{title:second,status:'new',priority:0}));
 const firstText=[`Megnevezés: ${first}`,'Állapot: Folyamatban','Prioritás: 3 / 5','Kapcsolattartó telefon: +36201234567','Címkék: Sürgős, Ügyfél','Archivált: Aktív','Értesítés: Be','Részletes leírás: Szintetikus D4 leírás'].join('\n');
 const secondText=[`Megnevezés: ${second}`,'Állapot: Új','Prioritás: 0 / 5','Kapcsolattartó telefon: —','Címkék: —','Archivált: Aktív','Értesítés: Be','Részletes leírás: —'].join('\n');
 const copied=()=>page.evaluate(()=>window.__copied.at(-1));
 await only(page,prefix);
 const row=title=>page.locator('.dhx_grid-row').filter({hasText:title});
 await expect(row(first)).toBeVisible({timeout:10000});await expect(row(second)).toBeVisible();
 // Without a cursor record (and no marks) the record command is disabled like the built-in record actions.
 let copy=await control(page,COPY);
 await expect(copy).toBeDisabled();
 if(await page.getByRole('menuitem',{name:COPY,exact:true}).isVisible())await page.keyboard.press('Escape');
 // The cursor record: a fresh `get`, its fields as "label: text" lines, a toast.
 await row(first).locator('[data-dhx-col-id="title"]').click();
 const read=page.waitForResponse(response=>{try{const data=response.request().postDataJSON();return data?.action==='get'&&data.id===created[0];}catch{return false;}});
 copy=await control(page,COPY);await expect(copy).toBeEnabled();await copy.click();
 expect((await read).status()).toBe(200);
 await expect.poll(copied).toBe(firstText);
 await expect(toast(page,'Vágólapra másolva: 1 feladat.')).toBeVisible();
 // Marks: the command's own rule accepts them and copies every marked task.
 for(const id of created)await page.getByLabel('Sor jelölése: '+id,{exact:true}).filter({visible:true}).check();
 copy=await control(page,COPY);await expect(copy).toBeEnabled();await copy.click();
 await expect.poll(async()=>((await copied())??'').split('\n\n').sort()).toEqual([firstText,secondText].sort());
 await expect(toast(page,'Vágólapra másolva: 2 feladat.')).toBeVisible();
 for(const id of created)await page.getByLabel('Sor jelölése: '+id,{exact:true}).filter({visible:true}).uncheck();
 // A refused clipboard write goes to the framework error dialog, which keeps the text for copying by hand.
 // Marking moved the cursor; put it back on the first task.
 await row(first).locator('[data-dhx-col-id="title"]').click();
 await page.evaluate(()=>{window.__clipboardFails=1;});
 copy=await control(page,COPY);await copy.click();
 const failure=page.getByRole('alertdialog').filter({hasText:'A vágólapra írás nem sikerült. Másold ki kézzel:'});
 await expect(failure).toBeVisible();await expect(failure).toContainText(`Megnevezés: ${first}`);
 await page.locator('[data-blade-dialog-action=ok]').click();await expect(failure).toHaveCount(0);

 // Mobile: the command sits in the Műveletek menu and acts on the selected card.
 await page.setViewportSize({width:390,height:844});await page.reload();
 await expect(page.locator('.blade-grid-card').first()).toBeVisible();
 await command(page,'Szűrés');
 const filter=page.getByRole('dialog',{name:'Szűrés',exact:true});
 await filter.getByLabel('Megnevezés',{exact:true}).fill(prefix);await filter.getByRole('button',{name:'Szűrés',exact:true}).click();await expect(filter).toHaveCount(0);
 const card=page.locator('.blade-grid-card').filter({hasText:second}).first();await expect(card).toBeVisible();
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});await expect(menu).toBeVisible();
 await menu.click();await expect(page.getByRole('menuitem',{name:COPY,exact:true})).toBeDisabled();
 // The menu button toggles the popup closed (Escape closes it too, mobile-grid.spec.cjs).
 await menu.click();await expect(page.getByRole('menuitem',{name:COPY,exact:true})).toBeHidden();
 await card.locator('.blade-grid-card__id').click();
 await menu.click();await page.getByRole('menuitem',{name:COPY,exact:true}).click();
 await expect.poll(copied).toBe(secondText);
 await expect(toast(page,'Vágólapra másolva: 1 feladat.')).toBeVisible();
 expect(seen.errors).toEqual([]);expect(seen.reports).toEqual([]);
});

test('the rating follows the Skyblue, light and dark themes',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1600,height:900});await signIn(page);await openView(page,'Feladatok');
 const title=`${prefix} téma`;created.push(await createTask(page,{title,status:'new',priority:4}));
 // No colours of its own: the stars take the theme's text colour, which differs from the background behind them.
 const paint=locator=>locator.evaluate(el=>{
  let back=el,background='rgba(0, 0, 0, 0)';
  while(back&&(background=getComputedStyle(back).backgroundColor)==='rgba(0, 0, 0, 0)')back=back.parentElement;
  return {color:getComputedStyle(el).color,background,inherited:getComputedStyle(el).color===getComputedStyle(el.closest('.dhx_grid-cell')??el.parentElement).color};
 });
 const colours={};
 for(const theme of ['light','dark','skyblue']){
  await page.evaluate(theme=>localStorage.setItem('blade-theme',theme),theme);await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-dhx-theme',theme);
  await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
  await only(page,title);
  const cell=page.locator('.dhx_grid-row').filter({hasText:title}).locator('[data-dhx-col-id="priority"]');
  const shown=await paint(cell.locator('.demo-rating'));
  expect(shown.inherited).toBe(true);expect(shown.color).not.toBe(shown.background);colours[theme]=shown.color;
  await cell.getByRole('button',{name:'Prioritás — szerkesztés',exact:true}).click();
  const editor=page.getByRole('dialog').filter({has:page.getByRole('spinbutton',{name:'Prioritás',exact:true})});
  const button=starsOf(editor).first();await expect(button).toBeVisible();
  const star=await paint(button);expect(star.color).not.toBe(star.background);
  await editor.getByRole('button',{name:'Mégse',exact:true}).click();await expect(editor).toHaveCount(0);
 }
 expect(colours.dark).not.toBe(colours.light);
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
 expect(seen.errors).toEqual([]);expect(seen.reports).toEqual([]);
});

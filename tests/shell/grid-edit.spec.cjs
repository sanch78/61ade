const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command,view,api,createTask,deleteTasks}=require('./feature-demo.cjs');
// Feature demo → Feladatok: editable title/status/contact columns and related "notify" checkbox.
const created=[];
test.afterEach(async({page})=>deleteTasks(page,created));
async function task(page,width){
 await page.setViewportSize({width,height:1000});await signIn(page);await openView(page,'Feladatok');
 const title='E2E rács '+Date.now();created.push(await createTask(page,{title,status:'new'}));
 await only(page,title);return title;
}
// Filter by title so the row is found regardless of the live list window.
async function only(page,title){
 const filter=page.locator('[data-cell-id="filter"]');
 await filter.getByLabel('Megnevezés',{exact:true}).fill(title);await filter.getByRole('button',{name:'Szűrés',exact:true}).click();
}
const RULE='Értesítés: Folyamatban lévő feladatnál nem kapcsolható ki.';
test('native text/select/checkbox grid editors save without opening an object form',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const title=await task(page,1920),id=created[0];
 const grid=page.getByRole('grid'),header=grid.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Megnevezés'}).first();
 await expect(header).toHaveClass(/blade-grid-editable/);await expect(header).toHaveAttribute('aria-description','Szerkeszthető mező');
 expect(await header.locator('.dhx_grid-header-cell-text').evaluate(e=>getComputedStyle(e,'::after').content)).toContain('✎');
 await expect(grid.locator('[role=columnheader][data-dhx-id=labels]').filter({hasText:'Címkék'}).first()).not.toHaveClass(/blade-grid-editable/);
 await expect(grid.locator('[role=columnheader][data-dhx-id=notify]').filter({hasText:'Értesítés'}).first()).not.toHaveClass(/blade-grid-editable/);
 const row=page.locator('.dhx_grid-row').filter({hasText:title});await expect(row).toBeVisible({timeout:10000});
 const cell=(field)=>row.locator(`[data-dhx-col-id="${field}"]`);
 await cell('contact').dblclick();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const editor=page.locator('input.dhx_cell-editor');await editor.fill('+36201234567');await editor.press('Enter');
 await expect(row.getByText('+36201234567',{exact:true})).toBeVisible();
 await cell('status').dblclick();await grid.locator('select.dhx_cell-editor').selectOption({label:'Kész'});await cell('title').click();await expect(row.getByText('Kész',{exact:true})).toBeVisible();
 const checkbox=row.getByRole('checkbox',{name:'Értesítés',exact:true});await expect(checkbox).toBeChecked();await checkbox.focus();await checkbox.press('Space');await expect(checkbox).not.toBeChecked();
 await expect.poll(async()=>String((await api(page,'demo_tasks','__form',id,{operation:'update'})).body.data.values.notify)).toBe('0');
 await view(page,'Kártyák');await expect(page.locator('.blade-grid-card').filter({hasText:title})).toBeVisible();
 await view(page,'Táblázat');await expect(row).toBeVisible();
 await cell('contact').dblclick();await editor.fill('invalid');await editor.press('Enter');await expect(page.getByText('Kapcsolattartó telefon: Formátum: +36 és 8–9 számjegy.',{exact:true})).toBeVisible();await page.locator('[data-blade-dialog-action=ok]').click();await editor.press('Escape');
 await expect(row.getByText('+36201234567',{exact:true})).toBeVisible();
 // Demo business rule (after_save hook) rejects the single-field edit and keeps the stored value.
 await cell('status').dblclick();await grid.locator('select.dhx_cell-editor').selectOption({label:'Folyamatban'});await cell('title').click();
 await expect(page.getByText(RULE,{exact:true})).toBeVisible();await page.locator('[data-blade-dialog-action=ok]').click();await expect(row.getByText('Kész',{exact:true})).toBeVisible();
 await page.reload();await only(page,title);await expect(row.getByText('Kész',{exact:true})).toBeVisible();await expect(checkbox).not.toBeChecked();expect(errors).toEqual([]);
 // Rows without the notify right: list and batched __watch answers, and the live channel's update frames.
 const strip=items=>{for(const item of items??[])item._editable=(item._editable??[]).filter(field=>field!=='notify');};
 await page.route('**/?blade=1',async route=>{const response=await route.fetch();const json=await response.json();strip(json.data?.items);for(const answer of json.data?.results??[])strip(answer.data?.items);await route.fulfill({response,json});});
 await page.routeWebSocket(url=>new URL(url).pathname.startsWith('/live'),ws=>{const server=ws.connectToServer();ws.onMessage(message=>server.send(message));server.onMessage(message=>{const m=JSON.parse(message);if(m.type==='update')strip(m.upserts);ws.send(JSON.stringify(m));});});
 await page.reload();await only(page,title);await expect(row).toBeVisible();await expect(checkbox).toHaveCount(0);
 await view(page,'Kártyák');const readonly=page.locator('.blade-grid-card').filter({hasText:title});await expect(readonly).toBeVisible();await expect(readonly.getByRole('checkbox',{name:'Értesítés',exact:true})).toHaveCount(0);await expect(readonly).toContainText('Ki');
 await page.unroute('**/?blade=1');
});

test('cards edit and sort, fitted windows and resize reset survive mode changes',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const title=await task(page,1440),dialog=page.getByRole('dialog');
 async function gap(selector){return dialog.evaluate((el,selector)=>{const last=el.querySelector(selector);return el.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom;},selector);}
 const row=page.locator('.dhx_grid-row').filter({hasText:title});await expect(row).toBeVisible({timeout:10000});
 const number=row.locator('[data-dhx-col-id="_number"]');await number.dblclick();await expect(dialog).toBeVisible();expect(await page.evaluate(()=>getSelection().toString())).toBe('');expect(await gap('.blade-record-details')).toBeLessThan(40);await dialog.getByRole('button',{name:'Close',exact:false}).click();
 const checkbox=row.getByRole('checkbox',{name:'Értesítés',exact:true});
 const checkboxSize=await checkbox.locator('xpath=..').locator('.dhx_checkbox__visual-input').evaluate(el=>({width:getComputedStyle(el).width,height:getComputedStyle(el).height}));
 let delayed=false;
 await page.route('**/?blade=1',async route=>{
  if(!delayed&&route.request().postDataJSON()?.action==='__edit'){delayed=true;const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,600));await route.fulfill({response});}else await route.continue();
 });
 const saved=page.waitForResponse(response=>response.request().postData()?.includes('"action":"__edit"')&&response.status()===200);
 await checkbox.locator('xpath=..').locator('.dhx_checkbox__visual-input').click();
 // Switch during the save, as well as after it: neither widget may lose its root.
 await view(page,'Kártyák');await saved;
 const card=page.locator('.blade-grid-card').filter({hasText:title});await expect(card).toBeVisible();
 const toggle=card.locator('[data-blade-field="notify"]');await expect(toggle.getByRole('checkbox')).toHaveAttribute('aria-checked','false');
 await toggle.getByRole('checkbox').focus();await toggle.getByRole('checkbox').press('Enter');await expect(toggle.getByRole('checkbox')).toHaveAttribute('aria-checked','true');
 expect(await toggle.evaluate(el=>getComputedStyle(el,'::after').content)).toBe('none');
 expect(await toggle.locator('.dhx_checkbox__visual-input').evaluate(el=>({width:getComputedStyle(el).width,height:getComputedStyle(el).height}))).toEqual(checkboxSize);
 const contact=card.locator('[data-blade-field="contact"]');
 expect(await contact.evaluate(el=>({position:getComputedStyle(el,'::after').position,right:getComputedStyle(el,'::after').right}))).toEqual({position:'absolute',right:'0px'});
 await contact.click({position:{x:(await contact.boundingBox()).width-5,y:8}});const popup=page.getByRole('dialog');await expect(popup).toBeVisible();await popup.getByRole('textbox',{name:'Kapcsolattartó telefon',exact:true}).fill('invalid');await popup.getByRole('button',{name:'Mentés',exact:true}).click();await expect(popup).toContainText('Formátum: +36 és 8–9 számjegy.');
 await popup.getByRole('textbox',{name:'Kapcsolattartó telefon',exact:true}).fill('+36301112222');await popup.getByRole('button',{name:'Mentés',exact:true}).click();await expect(popup).not.toBeVisible();await expect(card).toContainText('+36301112222');
 await card.locator('[data-blade-field="status"]').click();await popup.getByRole('combobox',{name:/^Állapot/}).selectOption('done');await popup.getByRole('button',{name:'Mentés',exact:true}).click();await expect(popup).not.toBeVisible();await expect(card).toContainText('Kész');
 const sorted=page.waitForResponse(response=>{try{const data=response.request().postDataJSON();return data?.action==='list'&&data.values.sort.field==='title'&&data.values.sort.direction==='asc';}catch{return false;}});
 const commands=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await commands.isVisible()){await commands.click();await page.getByRole('menuitem',{name:/^Rendezés/}).click();}else await page.getByRole('button',{name:/^Rendezés/}).click();
 await page.getByText('Megnevezés ↑',{exact:true}).click();await sorted;await expect(card).toBeVisible();
 for(let i=0;i<3;i++){
  await view(page,'Táblázat');await expect(row).toBeVisible();
  await view(page,'Kártyák');await expect(card).toBeVisible();
 }
 const filter=page.locator('[data-cell-id="filter"]').first(),grip=page.locator('.dhx_layout-resizer--x .dhx_layout-resizer__icon').first();
 const initial=(await filter.boundingBox()).width,box=await grip.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+80,box.y+box.height/2,{steps:5});await page.mouse.up();await expect.poll(async()=>(await filter.boundingBox()).width).toBeGreaterThan(initial+40);const resetBox=await grip.boundingBox();await page.mouse.dblclick(resetBox.x,resetBox.y+resetBox.height/2);await expect.poll(async()=>(await filter.boundingBox()).width).toBe(initial);
 await page.reload();await only(page,title);await expect(card).toBeVisible();await expect(card).toContainText('+36301112222');
 await page.setViewportSize({width:390,height:420});
 await card.locator('.blade-grid-card__id').click();
 if(await commands.isVisible()){await commands.click();await page.getByRole('menuitem',{name:'Adatok',exact:true}).click();}
 else await page.getByRole('button',{name:'Adatok',exact:true}).click();
 await expect(dialog).toBeVisible();
 // The window is fitted and then repositioned; wait for both before measuring the margins.
 await expect.poll(async()=>(await dialog.boundingBox()).height).toBeLessThanOrEqual(396);
 await expect.poll(async()=>{const bounds=await dialog.boundingBox();return bounds.y+bounds.height;}).toBeLessThanOrEqual(408);
 expect((await dialog.boundingBox()).y).toBeGreaterThanOrEqual(12);
 await dialog.getByRole('button',{name:/close/i}).click();
 await page.unroute('**/?blade=1');
 expect(errors).toEqual([]);
});

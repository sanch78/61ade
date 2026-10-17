const {test,expect}=require('../../tools/playwright-test.cjs');
test('native text/select/checkbox grid editors save without opening an object form',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message)); await page.goto('/');await page.getByLabel('Felhasználónév',{exact:true}).fill('synthetic');await page.getByLabel('Jelszó',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await page.getByRole('menuitem',{name:'Items',exact:true}).click();await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const title='Grid '+Date.now();const dialog=page.getByRole('dialog');await dialog.getByLabel('Title',{exact:true}).fill(title);await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await page.getByRole('button',{name:/^(confirm|Megerősítés)$/,exact:true}).click();
 await expect(page.locator('[role=columnheader][data-dhx-id=notify]')).not.toHaveClass(/vapa-grid-editable/);
 const grid=page.getByRole('grid');const row=page.getByRole('row').filter({hasText:title});await expect(row).toBeVisible({timeout:10000});
 await expect(row.getByRole('checkbox',{name:'Archived',exact:true})).toHaveCount(0);
 const cell=(field)=>row.locator(`[data-dhx-col-id="${field}"]`);
 await cell('contact').dblclick();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const editor=page.locator('input.dhx_cell-editor');await editor.fill('+36201234567');await editor.press('Enter');
 await expect(row.getByText('+36201234567',{exact:true})).toBeVisible();
 await cell('status').dblclick();const select=grid.locator('select.dhx_cell-editor');await select.selectOption({label:'Done'});await cell('title').click();await expect(row.getByText('Done',{exact:true})).toBeVisible();
 const checkbox=row.getByRole('checkbox',{name:'Notifications',exact:true});await expect(checkbox).toBeChecked();await checkbox.focus();await checkbox.press('Space');await expect(checkbox).not.toBeChecked();
 await expect.poll(async()=>page.evaluate(async()=>{const csrf=JSON.parse(document.querySelector('#vapa-config').textContent).csrf;const r=await fetch('?vapa=1',{method:'POST',headers:{'Content-Type':'application/json','X-VAPA-CSRF':csrf},body:JSON.stringify({resource:'items',action:'list',values:{mode:'dynamic'}})});return (await r.json()).data.items[0].notify;})).toMatch(/0/);
 await page.getByRole('button',{name:'Nézet: Táblázat',exact:true}).click();await page.getByText('Kártyák',{exact:true}).click();await expect(page.locator('.vapa-grid-card').filter({hasText:title})).toBeVisible();
 await page.getByRole('button',{name:'Nézet: Kártyák',exact:true}).click();await page.getByText('Táblázat',{exact:true}).click();await expect(row).toBeVisible();
 await cell('contact').dblclick();await editor.fill('invalid');await editor.press('Enter');await expect(page.getByText('Contact: Invalid phone.',{exact:true})).toBeVisible();await page.getByRole('button',{name:/^(confirm|Megerősítés)$/,exact:true}).click();await editor.press('Escape');
 await expect(row.getByText('+36201234567',{exact:true})).toBeVisible();
 await cell('title').dblclick();await editor.fill('Reject flags');await editor.press('Enter');
 await expect(page.getByText('Notifications: Choose a different setting.',{exact:true})).toBeVisible();await page.getByRole('button',{name:/^(confirm|Megerősítés)$/,exact:true}).click();await expect(row.getByText(title,{exact:true})).toBeVisible();
 await page.reload();await page.getByRole('menuitem',{name:'Items',exact:true}).click();await expect(row.getByText('Done',{exact:true})).toBeVisible();await expect(checkbox).not.toBeChecked();expect(errors).toEqual([]);
 await page.route('**/?vapa=1',async route=>{const response=await route.fetch();const json=await response.json();if(Array.isArray(json.data?.items)){for(const item of json.data.items)item._editable=(item._editable??[]).filter(field=>field!=='notify');}await route.fulfill({response,json});});
 await page.reload();await page.getByRole('menuitem',{name:'Items',exact:true}).click();await expect(row).toBeVisible();await expect(row.getByRole('checkbox')).toHaveCount(0);
 await page.getByRole('button',{name:'Nézet: Táblázat',exact:true}).click();await page.getByText('Kártyák',{exact:true}).click();const readonly=page.locator('.vapa-grid-card').filter({hasText:title});await expect(readonly).toBeVisible();await expect(readonly.getByRole('checkbox')).toHaveCount(0);await expect(readonly).toContainText('Off');
});

test('cards edit and sort, fitted windows and resize reset survive mode changes',async({page})=>{
 const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.message);});
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');
 await page.getByLabel('Felhasználónév',{exact:true}).fill('synthetic');await page.getByLabel('Jelszó',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await page.getByRole('menuitem',{name:'Items',exact:true}).click();
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const title='Cards '+Date.now(),dialog=page.getByRole('dialog');
 await dialog.getByLabel('Title',{exact:true}).fill(title);
 async function gap(selector){return dialog.evaluate((el,selector)=>{const last=el.querySelector(selector);return el.getBoundingClientRect().bottom-last.getBoundingClientRect().bottom;},selector);}
 expect(await gap('button[name="submit"], .dhx_form button')).toBeLessThan(40);
 await dialog.getByRole('button',{name:'Mentés',exact:true}).click();await page.getByRole('button',{name:/^(confirm|Megerősítés)$/,exact:true}).click();
 const row=page.getByRole('row').filter({hasText:title});await expect(row).toBeVisible();
 const number=row.locator('[data-dhx-col-id="_number"]');await number.dblclick();await expect(dialog).toBeVisible();expect(await page.evaluate(()=>getSelection().toString())).toBe('');expect(await gap('.vapa-record-details')).toBeLessThan(40);await dialog.getByRole('button',{name:'Close',exact:false}).click();
 const checkbox=row.getByRole('checkbox',{name:'Notifications',exact:true});
 const checkboxSize=await checkbox.locator('xpath=..').locator('.dhx_checkbox__visual-input').evaluate(el=>({width:getComputedStyle(el).width,height:getComputedStyle(el).height}));
 let delayed=false;
 await page.route('**/?vapa=1',async route=>{
  if(!delayed&&route.request().postDataJSON()?.action==='__edit'){delayed=true;const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,600));await route.fulfill({response});}else await route.continue();
 });
 const saved=page.waitForResponse(response=>response.request().postData()?.includes('"action":"__edit"')&&response.status()===200);
 await checkbox.locator('xpath=..').locator('.dhx_checkbox__visual-input').click();
 // Switch during the save, as well as after it: neither widget may lose its root.
 await page.getByRole('button',{name:'Nézet: Táblázat',exact:true}).click();await page.getByText('Kártyák',{exact:true}).click();await saved;
 const card=page.locator('.vapa-grid-card').filter({hasText:title});await expect(card).toBeVisible();
 await expect(card.getByRole('checkbox',{name:'Archived',exact:true})).toHaveCount(0);
 const toggle=card.locator('[data-vapa-field="notify"]');await expect(toggle.getByRole('checkbox')).toHaveAttribute('aria-checked','false');
 await toggle.getByRole('checkbox').focus();await toggle.getByRole('checkbox').press('Enter');await expect(toggle.getByRole('checkbox')).toHaveAttribute('aria-checked','true');
 expect(await toggle.evaluate(el=>getComputedStyle(el,'::after').content)).toBe('none');
 expect(await toggle.locator('.dhx_checkbox__visual-input').evaluate(el=>({width:getComputedStyle(el).width,height:getComputedStyle(el).height}))).toEqual(checkboxSize);
 await card.screenshot({path:require('node:path').join(process.env.VAPA_TMP_DIR,'card-checkbox.png')});
 const contact=card.locator('[data-vapa-field="contact"]');
 expect(await contact.evaluate(el=>({position:getComputedStyle(el,'::after').position,right:getComputedStyle(el,'::after').right}))).toEqual({position:'absolute',right:'0px'});
 await contact.click({position:{x:(await contact.boundingBox()).width-5,y:8}});const popup=page.getByRole('dialog');await expect(popup).toBeVisible();await popup.getByRole('textbox',{name:'Contact',exact:true}).fill('invalid');await popup.getByRole('button',{name:'Mentés',exact:true}).click();await expect(popup).toContainText('Invalid phone.');
 await popup.getByRole('textbox',{name:'Contact',exact:true}).fill('+36301112222');await popup.getByRole('button',{name:'Mentés',exact:true}).click();await expect(popup).not.toBeVisible();await expect(card).toContainText('+36301112222');
 await card.locator('[data-vapa-field="status"]').click();await popup.getByRole('combobox',{name:'Status',exact:true}).selectOption('done');await popup.getByRole('button',{name:'Mentés',exact:true}).click();await expect(popup).not.toBeVisible();await expect(card).toContainText('Done');
 const sort=page.getByRole('button',{name:/^Rendezés/});await sort.click();const sorted=page.waitForResponse(response=>{try{const data=response.request().postDataJSON();return data?.action==='list'&&data.values.sort.field==='title'&&data.values.sort.direction==='asc';}catch{return false;}});await page.getByText('Title ↑',{exact:true}).click();await sorted;await expect(card).toBeVisible();
 for(let i=0;i<3;i++){
  await page.getByRole('button',{name:'Nézet: Kártyák',exact:true}).click();await page.getByText('Táblázat',{exact:true}).click();await expect(row).toBeVisible();
  await page.getByRole('button',{name:'Nézet: Táblázat',exact:true}).click();await page.getByText('Kártyák',{exact:true}).click();await expect(card).toBeVisible();
 }
 const filter=page.locator('[data-cell-id="filter"]').first(),grip=page.locator('.dhx_layout-resizer--x .dhx_layout-resizer__icon').first();
 const initial=(await filter.boundingBox()).width,box=await grip.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+80,box.y+box.height/2,{steps:5});await page.mouse.up();await expect.poll(async()=>(await filter.boundingBox()).width).toBeGreaterThan(initial+40);const resetBox=await grip.boundingBox();await page.mouse.dblclick(resetBox.x,resetBox.y+resetBox.height/2);await expect.poll(async()=>(await filter.boundingBox()).width).toBe(initial);
 await page.reload();await expect(card).toBeVisible();await expect(card).toContainText('+36301112222');
 await page.setViewportSize({width:390,height:420});
 await card.locator('.vapa-grid-card__id').click();
 const commands=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await commands.isVisible()){await commands.click();await page.getByRole('menuitem',{name:'Adatok',exact:true}).click();}
 else{await expect(page.getByRole('button',{name:/^Rendezés/})).toBeVisible();await page.getByRole('button',{name:'Adatok',exact:true}).click();}
 await expect(dialog).toBeVisible();
 await expect.poll(async()=>(await dialog.boundingBox()).height).toBeLessThanOrEqual(396);
 const bounds=await dialog.boundingBox();expect(bounds.y).toBeGreaterThanOrEqual(12);expect(bounds.y+bounds.height).toBeLessThanOrEqual(408);
 await dialog.getByRole('button',{name:/close/i}).click();
 expect(errors).toEqual([]);
});

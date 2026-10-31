const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu}=require('./feature-demo.cjs');
// Sub-view demos: a child list that keeps its own menu entry (tenant projects → tasks), a hierarchy whose toolbar
// acts on a selected child (tasks → subtasks), and a JSON-declared sub-view (feature demo media → default contents).
const preview=page=>page.locator('.blade-subview-host .blade-subview');
const expand=(page,text)=>page.locator('.dhx_grid-row').filter({hasText:text}).first().locator('.blade-subrow-toggle').click();

test('a project expands to its top-level tasks with the done switch; the task list keeps its menu entry',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page,'single@example.test','/tenants/');
 await openMenu(page,'Projektek','Tenant demó');
 await expand(page,'Alpha research');
 const rows=preview(page).locator('.dhx_grid-row');
 // The project's tasks without their subtasks (those belong to the task hierarchy).
 await expect(rows.filter({hasText:'Alpha measurement'})).toHaveCount(1);await expect(rows.filter({hasText:'Alpha report'})).toHaveCount(1);
 await expect(rows.filter({hasText:'Prepare the measuring site'})).toHaveCount(0);
 const report=rows.filter({hasText:'Alpha report'}),done=report.getByRole('checkbox',{name:'Kész'});
 await expect(done).not.toBeChecked();
 await report.locator('.blade-checkbox-edit').click();await expect(done).toBeChecked();
 await report.locator('.blade-checkbox-edit').click();await expect(done).not.toBeChecked();
 // A selected preview task takes the toolbar over: Módosítás edits that task; its project is known and kept.
 await report.locator('[data-dhx-col-id="title"]').click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Feladatok — Módosítás'});
 await expect(form.getByLabel('Feladat',{exact:true})).toHaveValue('Alpha report');
 await expect(form.getByLabel('Projekt',{exact:true})).toHaveCount(0);
 const saved=page.waitForResponse(response=>response.url().includes('blade=1')&&response.request().postDataJSON()?.action==='update');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 const result=await saved;expect(result.status()).toBe(200);
 expect(result.request().postDataJSON()).toMatchObject({resource:'tenant_tasks',values:{project_id:expect.any(String)}});
 await expect(form).toHaveCount(0);
 // Selecting the project row gives the toolbar back to the project.
 await page.locator('.dhx_grid-row').filter({hasText:'Alpha research'}).first().locator('[data-dhx-col-id="title"]').click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Projektek — Módosítás'})).toBeVisible();
 await page.getByRole('dialog',{name:'Projektek — Módosítás'}).getByRole('button',{name:'Mégse',exact:true}).click();
 await expand(page,'Alpha research');
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 await openMenu(page,'Feladatok','Tenant demó');
 await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
 expect(errors).toEqual([]);
});

test('a task expands to its subtasks; selecting one hands the toolbar over to it',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page,'single@example.test','/tenants/');
 await openMenu(page,'Feladatok','Tenant demó');
 // The hierarchy lists the tasks without a parent; subtasks appear under their task only.
 await expect(page.locator('.dhx_grid-row').filter({hasText:'Alpha measurement'})).toHaveCount(1);
 await expect(page.locator('.dhx_grid-row').filter({hasText:'Data entry'})).toHaveCount(0);
 await expand(page,'Alpha measurement');
 const rows=preview(page).locator('.dhx_grid-row');
 await expect(rows).toHaveCount(2);
 await rows.filter({hasText:'Data entry'}).click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Feladatok — Módosítás'});
 await expect(form.getByLabel('Feladat',{exact:true})).toHaveValue('Data entry');
 await form.getByRole('button',{name:'Mégse',exact:true}).click();
 // Selecting a top-level task gives the toolbar back to it.
 await page.locator('.dhx_grid-row').filter({hasText:'Alpha report'}).first().locator('[data-dhx-col-id="title"]').click();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 await expect(form.getByLabel('Feladat',{exact:true})).toHaveValue('Alpha report');
 await form.getByRole('button',{name:'Mégse',exact:true}).click();
 // The full hierarchy below a task opens in a window from the toolbar ("Alelemek").
 await page.locator('.dhx_grid-row').filter({hasText:'Alpha measurement'}).first().locator('[data-dhx-col-id="title"]').click();
 await page.getByRole('button',{name:'Alelemek',exact:true}).click();
 const full=page.getByRole('dialog',{name:'Feladatok — Alpha measurement'});
 await expect(full.locator('.dhx_grid-row')).toHaveCount(2);
 await expect(full.getByRole('button',{name:'Hozzáadás',exact:true})).toBeVisible();
 await full.getByRole('button',{name:'close',exact:true}).click();
 expect(errors).toEqual([]);
});

test('a JSON-declared sub-view: a media item expands to the default contents that use it',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page);
 await openMenu(page,'Médiatár','Digitális kijelző');
 // The library holds the demo media; the header filter keeps the brand scene (every weekday's default) in the rendered rows.
 await page.getByRole('textbox',{name:'Szűrés: Megnevezés',exact:true}).fill('Blade brand animation');
 await expect(page.locator('.dhx_grid-row').filter({hasText:'Blade brand animation'})).toHaveCount(1);
 await expand(page,'Blade brand animation');
 await expect(preview(page).locator('.dhx_grid-row')).toHaveCount(7);
 for(const day of ['Hétfő','Kedd','Szerda','Csütörtök','Péntek','Szombat','Vasárnap'])await expect(preview(page).locator('.dhx_grid-row').filter({hasText:day})).toHaveCount(1);
 await expand(page,'Blade brand animation');
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('in cards a project opens its tasks window from the card button, on a phone full screen',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});
 await signIn(page,'single@example.test','/tenants/');
 await openMenu(page,'Projektek','Tenant demó');
 const card=page.locator('.blade-grid-card').filter({hasText:'Alpha research'}).first();
 const button=card.getByRole('button',{name:/^Feladatok( \(\d+\))?$/});
 await expect(button).toBeVisible();
 expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(40);
 await button.click();
 const full=page.getByRole('dialog',{name:'Feladatok — Alpha research'});
 // The window lists as many top-level tasks as the button counts (owner data may add tasks beside the seeded ones).
 const count=Number((await button.innerText()).match(/\((\d+)\)/)[1]);
 await expect(full.locator('.dhx_grid-row, .blade-grid-card')).toHaveCount(count);
 await expect(full.getByText('Alpha report',{exact:true})).toBeVisible();
 const area=await full.boundingBox();expect(area.width).toBeGreaterThanOrEqual(388);
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 await full.getByRole('button',{name:'close',exact:true}).click();
 expect(errors).toEqual([]);
});

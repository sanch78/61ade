const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command,isAction,deleteTasks}=require('./feature-demo.cjs');
// Feature demo → Feladatok: "notify" lives in the related demo_task_settings table.
const created=[];
test.afterEach(async({page})=>deleteTasks(page,created));
test('panel form saves main and related values; filters and a business rule use the related field',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1920,height:1000});await signIn(page);await openView(page,'Feladatok');
 const form=page.locator('[data-cell-id="form"]'),filter=page.locator('[data-cell-id="filter"]');
 const archived=form.getByRole('checkbox',{name:'Archivált',exact:true}),notify=form.getByRole('checkbox',{name:'Értesítés',exact:true});
 await command(page,'Hozzáadás');
 await expect(archived).not.toBeChecked();await expect(notify).toBeChecked();
 const title='E2E kapcsolt '+Date.now();await form.getByLabel('Megnevezés',{exact:true}).fill(title);
 const saved=page.waitForResponse(isAction('create'));await form.getByRole('button',{name:'Mentés',exact:true}).click();
 created.push(String((await(await saved).json()).data.id));
 await expect(page.getByText('A művelet sikerült.',{exact:true}).first()).toBeVisible();
 // Filter by title so the row is found regardless of the live list window.
 await filter.getByLabel('Megnevezés',{exact:true}).fill(title);await filter.getByRole('button',{name:'Szűrés',exact:true}).click();
 const row=page.locator('.dhx_grid-row').filter({hasText:title});await expect(row).toBeVisible({timeout:10000});
 await expect(row.getByRole('checkbox',{name:'Archivált',exact:true})).not.toBeChecked();await expect(row.getByRole('checkbox',{name:'Értesítés',exact:true})).toBeChecked();
 await row.click();await command(page,'Módosítás');
 await archived.locator('xpath=ancestor::label').click();await notify.locator('xpath=ancestor::label').click();
 await form.getByRole('button',{name:'Mentés',exact:true}).click();await expect(page.getByText('A művelet sikerült.',{exact:true}).first()).toBeVisible();
 await expect(row.getByRole('checkbox',{name:'Archivált',exact:true})).toBeChecked({timeout:10000});await expect(row.getByRole('checkbox',{name:'Értesítés',exact:true})).not.toBeChecked();
 await filter.getByRole('combobox',{name:'Értesítés',exact:true}).selectOption({label:'Be'});
 await filter.getByRole('button',{name:'Szűrés',exact:true}).click();await expect(row).toHaveCount(0);
 await filter.getByRole('combobox',{name:'Értesítés',exact:true}).selectOption({label:'Ki'});
 await filter.getByRole('button',{name:'Szűrés',exact:true}).click();await expect(row).toBeVisible();
 await row.click();await command(page,'Módosítás');
 await expect(archived).toBeChecked();await expect(notify).not.toBeChecked();
 // Demo business rule (after_save hook): an in-progress task keeps its notifications.
 await form.getByRole('combobox',{name:'Állapot *',exact:true}).selectOption({label:'Folyamatban'});
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(page.getByText('Értesítés: Folyamatban lévő feladatnál nem kapcsolható ki.',{exact:true})).toBeVisible();
 await page.locator('[data-blade-dialog-action=ok]').click();
 await expect(notify).not.toBeChecked();await expect(form.getByRole('combobox',{name:'Állapot *',exact:true})).toHaveValue('progress');
 await expect(row.getByText('Új',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

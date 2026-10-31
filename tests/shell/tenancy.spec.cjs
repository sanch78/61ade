const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu,api}=require('./feature-demo.cjs');
// Tenant demo (/tenants/): demo@ belongs to Alpha and Beta, single@ to Alpha only, none@ to no tenant.
const rows=page=>page.locator('.dhx_grid-row, .blade-grid-card');
async function projects(page){
 await openMenu(page,'Projektek','Tenant demó');
 await expect(rows(page).first()).toBeVisible();
}

test('one membership: no selector, the tenant is chosen automatically and only its data is listed',async({page})=>{
 await signIn(page,'single@example.test','/tenants/');
 await expect(page.locator('.blade-session-bar').getByText('Alpha',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Alpha',exact:true})).toHaveCount(0);
 await projects(page);
 await expect(page.getByText('Alpha research',{exact:true})).toBeVisible();
 await expect(page.getByText('Beta rollout',{exact:true})).toHaveCount(0);
});

test('no membership: a clear notice, no tenant-scoped views, global views and the API fail closed',async({page})=>{
 await signIn(page,'none@example.test','/tenants/');
 await expect(page.locator('.blade-session-bar').getByText('Nincs hozzárendelt tenant',{exact:true})).toBeVisible();
 await openMenu(page,'Közös hirdetőtábla','Tenant demó');
 await expect(page.getByText('Shared maintenance window on Friday evening',{exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Projektek',exact:true})).toHaveCount(0);
 const refused=await api(page,'tenant_projects','list','',{limit:10});
 expect(refused.status).toBe(403);
});

test('several memberships: switching reloads the shell, the previous tenant disappears and its token stops working',async({page})=>{
 await signIn(page,'demo@example.test','/tenants/');
 const selector=page.locator('.blade-navigation-row').getByRole('button',{name:/^(Alpha|Beta)$/});
 await expect(selector).toBeVisible();
 if(await selector.innerText()!=='Alpha'){await selector.click();await page.getByRole('menuitem',{name:'Alpha',exact:true}).click();await expect(selector).toHaveText('Alpha');}
 await projects(page);
 await expect(page.getByText('Alpha research',{exact:true})).toBeVisible();
 const alfa=(await api(page,'tenant_projects','list','',{limit:10})).body.data.items.find(item=>item.title==='Alpha research');
 const oldCsrf=await page.evaluate(()=>JSON.parse(document.getElementById('blade-config').textContent).csrf);
 await selector.click();await page.getByRole('menuitem',{name:'Beta',exact:true}).click();
 await expect(selector).toHaveText('Beta');
 await expect(page.locator('.blade-session-bar').getByText('Beta',{exact:true})).toBeVisible();
 await expect(page.getByText('Beta rollout',{exact:true})).toBeVisible();
 await expect(page.getByText('Alpha research',{exact:true})).toHaveCount(0);
 // Another tenant's object by ID is not found; the page token of the previous tenant is refused.
 expect((await api(page,'tenant_projects','get',alfa.id)).status).toBe(404);
 const stale=await page.evaluate(async csrf=>(await fetch('?blade=1',{method:'POST',headers:{'Content-Type':'application/json','X-BLADE-CSRF':csrf},body:JSON.stringify({resource:'tenant_projects',action:'list',id:'',values:{limit:10}})})).status,oldCsrf);
 expect(stale).toBe(403);
 await selector.click();await page.getByRole('menuitem',{name:'Alpha',exact:true}).click();
 await expect(selector).toHaveText('Alpha');
});

test('a tenant expands to its access list: every user, not selectable, one access switch that persists',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page,'demo@example.test','/tenants/');
 await openMenu(page,'Tenantok','Adminisztráció');
 await expect(page.getByRole('menuitem',{name:'Hozzáférések',exact:true})).toHaveCount(0);
 const users=(await api(page,'blade_users','list','',{limit:200})).body.data.items.map(item=>item.email);
 expect(users).toEqual(expect.arrayContaining(['demo@example.test','single@example.test','none@example.test']));
 const row=page.locator('.dhx_grid-row').filter({hasText:'Beta'}).first();
 const toggle=row.locator('.blade-subrow-toggle');
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();
 const preview=page.locator('.blade-subview-host .blade-subview');
 await expect(preview).toBeVisible();
 await expect(row.locator('.blade-subrow-toggle')).toHaveAttribute('aria-expanded','true');
 // Every account is listed once, with its access flag (Beta: demo@ only).
 const members=preview.locator('.dhx_grid-row');
 await expect(members).toHaveCount(users.length);
 for(const email of users)await expect(members.filter({hasText:email})).toHaveCount(1);
 const flag=email=>members.filter({hasText:email}).getByRole('checkbox',{name:'Hozzáférés'});
 await expect(flag('demo@example.test')).toBeChecked();
 await expect(flag('single@example.test')).not.toBeChecked();
 await expect(flag('none@example.test')).not.toBeChecked();
 // Compact: sortable headers only; no toolbar, filters, scope column or separate "Engedélyezve" switch.
 await expect(preview.locator('.dhx_toolbar')).toHaveCount(0);
 await expect(preview.locator('.dhx_grid-header-cell input, .dhx_grid-header-cell .dhx_combobox')).toHaveCount(0);
 await expect(preview.getByRole('button',{name:/Rendezés: Hozzáférés/})).toBeVisible();
 await expect(preview.getByText('Engedélyezve',{exact:true})).toHaveCount(0);
 await expect(preview.getByText('Tenant',{exact:true})).toHaveCount(0);
 // Not selectable: a click or double-click on a user row neither highlights it, takes the toolbar over nor opens a form.
 await row.locator('[data-dhx-col-id="name"]').click();
 const open=page.getByRole('button',{name:'Hozzáférések',exact:true});
 await expect(open).toBeEnabled();
 const single=members.filter({hasText:'single@example.test'});
 await single.locator('.dhx_grid-cell').filter({hasText:'single@example.test'}).click();
 await single.locator('.dhx_grid-cell').filter({hasText:'single@example.test'}).dblclick();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(preview.locator('.dhx_grid-selected-row, .dhx_grid-selected-cell')).toHaveCount(0);
 await expect(open).toBeEnabled();
 // The toolbar still edits the tenant itself (no delegation to the user row).
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const tenantForm=page.getByRole('dialog').filter({has:page.getByLabel('Név',{exact:true})});
 await expect(tenantForm.getByLabel('Név',{exact:true})).toHaveValue('Beta');
 await tenantForm.getByRole('button',{name:'close',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 // The switch grants access (an audited single-field edit) and persists after a reload; the count follows.
 await single.locator('.blade-checkbox-edit').click();
 await expect(flag('single@example.test')).toBeChecked();
 await page.screenshot({path:require('path').join(process.env.BLADE_TMP_DIR,'tenant-subview.png')});
 await page.reload();
 await openMenu(page,'Tenantok','Adminisztráció');
 await page.locator('.dhx_grid-row').filter({hasText:'Beta'}).first().locator('.blade-subrow-toggle').click();
 await expect(flag('single@example.test')).toBeChecked();
 // The full list opens in a window from the toolbar: the same list with the switch only (no add, edit or delete).
 await page.locator('.dhx_grid-row').filter({hasText:'Beta'}).first().locator('[data-dhx-col-id="name"]').click();
 await open.click();
 const full=page.getByRole('dialog',{name:'Hozzáférések — Beta'});
 await expect(full).toBeVisible();
 await expect(full.locator('.dhx_grid-row')).toHaveCount(users.length);
 for(const name of ['Hozzáadás','Módosítás','Törlés','Adatok'])await expect(full.getByRole('button',{name,exact:true})).toHaveCount(0);
 const [frame,list]=await Promise.all([full.locator('.dhx_window-content').boundingBox(),full.locator('.dhx_grid').boundingBox()]);
 expect(Math.abs(list.x-frame.x)).toBeLessThan(2);expect(Math.abs(list.x+list.width-frame.x-frame.width)).toBeLessThan(2);
 await page.screenshot({path:require('path').join(process.env.BLADE_TMP_DIR,'tenant-subview-window.png')});
 const inWindow=full.locator('.dhx_grid-row').filter({hasText:'single@example.test'});
 await inWindow.locator('.blade-checkbox-edit').click();
 await expect(inWindow.getByRole('checkbox',{name:'Hozzáférés'})).not.toBeChecked();
 await full.getByRole('button',{name:'close',exact:true}).click();
 await expect(full).toHaveCount(0);
 await expect(flag('single@example.test')).not.toBeChecked();
 const audit=await api(page,'blade_tenant_members','list','',{limit:200,filters:{tenant_id:(await api(page,'blade_tenants','list','',{limit:50})).body.data.items.find(item=>item.name==='Beta').id,access:'1'}});
 expect(audit.body.data.items.map(item=>item.blade_email)).not.toContain('single@example.test');
 await page.locator('.dhx_grid-row').filter({hasText:'Beta'}).first().locator('.blade-subrow-toggle').click();
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('on a phone a tenant card opens its access list full screen from the card button',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});
 await signIn(page,'demo@example.test','/tenants/');
 // The navigation row keeps room for the menu: the tenant choice is a submenu there.
 await expect(page.locator('.blade-navigation-row [data-cell-id="tenant"]')).toHaveCount(0);
 await page.getByRole('menuitem',{name:/^(Menü|Menu)$/}).click();
 await expect(page.getByRole('menuitem',{name:'Tenant: Alpha',exact:true})).toBeVisible();
 await page.getByRole('menuitem',{name:'Adminisztráció',exact:true}).click();
 await page.getByRole('menuitem',{name:'Tenantok',exact:true}).click();
 const card=page.locator('.blade-grid-card').filter({hasText:'Alpha'});
 // Cards embed no preview: the card button (child list title and access count) opens the full view.
 await expect(card.locator('.blade-subrow-toggle')).toHaveCount(0);
 const tenants=(await api(page,'blade_tenants','list','',{limit:50})).body.data.items;
 const button=card.getByRole('button',{name:`Hozzáférések (${tenants.find(item=>item.name==='Alpha')._subview})`,exact:true});
 await expect(button).toBeVisible();
 expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(40);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:require('path').join(process.env.BLADE_TMP_DIR,'tenant-subview-phone.png')});
 await button.click();
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 const full=page.getByRole('dialog',{name:'Hozzáférések — Alpha'});
 const items=full.locator('.dhx_grid-row, .blade-grid-card');
 await expect(items.first()).toBeVisible();
 await expect(items.filter({hasText:'none@example.test'})).toHaveCount(1);
 await expect(full.locator('.dhx_dataview-item--selected, .dhx_grid-selected-row')).toHaveCount(0);
 const area=await full.boundingBox();expect(area.width).toBeGreaterThanOrEqual(388);
 await full.getByRole('button',{name:'close',exact:true}).click();
 // The toolbar command still opens it (the responsive actions menu on a phone).
 await card.locator('.blade-grid-card__id').click();
 await page.getByRole('button',{name:'Műveletek',exact:true}).click();
 await page.getByRole('menuitem',{name:'Hozzáférések',exact:true}).click();
 await expect(full).toBeVisible();
 await full.getByRole('button',{name:'close',exact:true}).click();
 expect(errors).toEqual([]);
});

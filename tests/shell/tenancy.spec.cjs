const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu,api}=require('./feature-demo.cjs');
// Tenant demo (/tenants/): demo@ belongs to Alfa and Béta, single@ to Alfa only, none@ to no tenant.
const rows=page=>page.locator('.dhx_grid-row, .blade-grid-card');
async function projects(page){
 await openMenu(page,'Projektek','Tenant demó');
 await expect(rows(page).first()).toBeVisible();
}

test('one membership: no selector, the tenant is chosen automatically and only its data is listed',async({page})=>{
 await signIn(page,'single@example.test','/tenants/');
 await expect(page.locator('.blade-session-bar').getByText('Alfa',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Alfa',exact:true})).toHaveCount(0);
 await projects(page);
 await expect(page.getByText('Alfa kutatás',{exact:true})).toBeVisible();
 await expect(page.getByText('Béta bevezetés',{exact:true})).toHaveCount(0);
});

test('no membership: a clear notice, no tenant-scoped views, global views and the API fail closed',async({page})=>{
 await signIn(page,'none@example.test','/tenants/');
 await expect(page.locator('.blade-session-bar').getByText('Nincs hozzárendelt tenant',{exact:true})).toBeVisible();
 await openMenu(page,'Közös hirdetőtábla','Tenant demó');
 await expect(page.getByText('Közös karbantartási ablak péntek este',{exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Projektek',exact:true})).toHaveCount(0);
 const refused=await api(page,'tenant_projects','list','',{limit:10});
 expect(refused.status).toBe(403);
});

test('several memberships: switching reloads the shell, the previous tenant disappears and its token stops working',async({page})=>{
 await signIn(page,'demo@example.test','/tenants/');
 const selector=page.locator('.blade-navigation-row').getByRole('button',{name:/^(Alfa|Béta)$/});
 await expect(selector).toBeVisible();
 if(await selector.innerText()!=='Alfa'){await selector.click();await page.getByRole('menuitem',{name:'Alfa',exact:true}).click();await expect(selector).toHaveText('Alfa');}
 await projects(page);
 await expect(page.getByText('Alfa kutatás',{exact:true})).toBeVisible();
 const alfa=(await api(page,'tenant_projects','list','',{limit:10})).body.data.items.find(item=>item.title==='Alfa kutatás');
 const oldCsrf=await page.evaluate(()=>JSON.parse(document.getElementById('blade-config').textContent).csrf);
 await selector.click();await page.getByRole('menuitem',{name:'Béta',exact:true}).click();
 await expect(selector).toHaveText('Béta');
 await expect(page.locator('.blade-session-bar').getByText('Béta',{exact:true})).toBeVisible();
 await expect(page.getByText('Béta bevezetés',{exact:true})).toBeVisible();
 await expect(page.getByText('Alfa kutatás',{exact:true})).toHaveCount(0);
 // Another tenant's object by ID is not found; the page token of the previous tenant is refused.
 expect((await api(page,'tenant_projects','get',alfa.id)).status).toBe(404);
 const stale=await page.evaluate(async csrf=>(await fetch('?blade=1',{method:'POST',headers:{'Content-Type':'application/json','X-BLADE-CSRF':csrf},body:JSON.stringify({resource:'tenant_projects',action:'list',id:'',values:{limit:10}})})).status,oldCsrf);
 expect(stale).toBe(403);
 await selector.click();await page.getByRole('menuitem',{name:'Alfa',exact:true}).click();
 await expect(selector).toHaveText('Alfa');
});

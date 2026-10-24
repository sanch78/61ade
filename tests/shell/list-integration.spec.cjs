const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command,view,createTask,deleteTasks}=require('./feature-demo.cjs');
// Feature demo → Feladatok: the description is readable but not a grid column; reader@example.test
// may list/get tasks with the description field denied.
const created=[];
test.afterEach(async({page})=>deleteTasks(page,created));
const count=page=>page.locator('.blade-list-count').evaluate(e=>getComputedStyle(e,'::before').content);
async function only(page,title){
 const filter=page.locator('[data-cell-id="filter"]');
 await filter.getByLabel('Megnevezés',{exact:true}).fill(title);await filter.getByRole('button',{name:'Szűrés',exact:true}).click();
}
test('details, cards and marked rows run the bulk business action through one endpoint',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:900});await signIn(page);await openView(page,'Feladatok');
 await expect(page.getByRole('heading',{name:'Feladatok',exact:true})).toBeVisible();
 await expect.poll(()=>count(page)).toMatch(/^"Összes: \d+"$/);
 const stamp='E2E lista '+Date.now();
 for(const n of [1,2])created.push(await createTask(page,{title:`${stamp} ${n}`,status:'new',description:`E2E részletes leírás ${n}`}));
 await only(page,stamp);await expect.poll(()=>count(page)).toMatch(/ \/ Találat: 2"$/);
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const detail=page.getByRole('dialog',{name:'Rekordadatok',exact:true});await expect(detail).toContainText('E2E részletes leírás 2');
 await detail.getByRole('button',{name:/close/i}).click();
 await view(page,'Kártyák');const cards=page.locator('.blade-grid-card');await expect(cards.first()).toContainText('Részletes leírás');
 expect((await cards.nth(1).boundingBox()).y).toBe((await cards.first().boundingBox()).y);
 const apply=await page.getByRole('button',{name:'Szűrés',exact:true}).boundingBox(),clear=await page.getByRole('button',{name:'Alaphelyzet',exact:true}).boundingBox();
 expect(clear.y).toBe(apply.y);expect(clear.x-apply.x-apply.width).toBeGreaterThanOrEqual(8);
 for(const id of [...created].reverse())await page.getByLabel('Sor jelölése: '+id,{exact:true}).filter({visible:true}).check();
 await view(page,'Táblázat');await expect(page.getByLabel('Sor jelölése: '+created[1],{exact:true}).filter({visible:true})).toBeChecked();
 await expect(page.getByRole('button',{name:'Lezárás — jelöltek',exact:true})).toHaveCount(0);
 const response=page.waitForResponse(response=>response.request().postData()?.includes('"action":"__bulk"'));
 await command(page,'Lezárás');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect((await(await response).json()).data).toEqual([{id:created[1],ok:true},{id:created[0],ok:true}]);
 await expect(page.getByText('Sikeres: 2, sikertelen: 0.',{exact:true})).toBeVisible();
 for(const id of created)await expect(page.locator('.dhx_grid-row').filter({has:page.locator('[data-dhx-col-id="id"]',{hasText:new RegExp(`^${id}$`)})})).toContainText('Kész');
 expect(errors).toEqual([]);
});
test('read-only account never receives denied detail values or bulk actions',async({page})=>{
 const responses=[];page.on('response',async response=>{if(response.request().method()==='POST'&&response.url().includes('blade=1'))responses.push(await response.text());});
 await signIn(page,'reader@example.test');await openView(page,'Feladatok');
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const detail=page.getByRole('dialog',{name:'Rekordadatok',exact:true});await expect(detail).toContainText('Szintetikus feladat');await expect(detail).not.toContainText('Részletes leírás');await detail.getByRole('button',{name:/close/i}).click();
 await expect(page.getByRole('button',{name:'Lezárás',exact:true})).toHaveCount(0);await expect(page.getByRole('menuitem',{name:'Lezárás',exact:true})).toHaveCount(0);
 await view(page,'Kártyák');await expect(page.locator('.blade-grid-card').first()).not.toContainText('Részletes leírás');
 await page.setViewportSize({width:390,height:844});await command(page,'Szűrés');
 const filter=page.getByRole('dialog',{name:'Szűrés',exact:true});await filter.getByLabel('Megnevezés',{exact:true}).fill('Szintetikus feladat 01');await filter.getByRole('button',{name:'Szűrés',exact:true}).click();
 await expect(filter).toHaveCount(0);await expect(page.locator('.blade-grid-card')).toHaveCount(1);
 await expect.poll(()=>count(page)).toMatch(/^"Összes: \d+ \/ Találat: 1"$/);
 await page.setViewportSize({width:1280,height:900});await expect(page.getByLabel('Megnevezés',{exact:true})).toHaveValue('Szintetikus feladat 01');
 await page.getByRole('button',{name:'Alaphelyzet',exact:true}).click();await expect(page.getByLabel('Megnevezés',{exact:true})).toHaveValue('');
 await expect.poll(()=>page.locator('.blade-grid-card').count()).toBeGreaterThan(1);
 expect(responses.join('')).not.toContain('Szintetikus leírás');
});

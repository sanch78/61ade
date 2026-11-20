const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,command}=require('./feature-demo.cjs');
// Provider lists (docs/workspaces.md#provider-lists): Feature demó → Szolgáltatásjelentés, 36 rows computed in PHP
// (service-report.php), is the standard ListView: header filters, search, sort and its indicator, counts, the no-match
// state, the provider's notice, Adatok with sections, a record action on a provider row and a record view.
const countText=page=>page.locator('.blade-list-count').first().evaluate(node=>getComputedStyle(node,'::before').content);
// The menu entry's name carries the attention count of the down services, which changes every minute: open by address.
async function open(page){
 await signIn(page);await expect(page.locator('.blade-navigation-row .dhx_menu-nav > li').first()).toBeVisible();
 await page.goto('/#view=demo_service_report');await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}
function listRequests(page){
 const requests=[];page.on('request',request=>{try{const data=request.postDataJSON();if(data?.resource==='demo_service_report'&&data.action==='list')requests.push(data.values);}catch{}});
 return requests;
}

test('a provider list filters, searches, sorts, counts and opens records like an SQL list',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const requests=listRequests(page);
 await page.setViewportSize({width:1366,height:900});
 await open(page);
 const grid=page.getByRole('grid'),rows=grid.getByRole('rowgroup').last().getByRole('row');
 // The provider's notice in its row above the rows, and the server's count.
 await expect(page.locator('.blade-list-notice')).toHaveText(/^Szimulált jelentés · készült: \d\d:\d\d UTC/);
 await expect.poll(()=>countText(page)).toBe('"Összes: 36"');
 // The declared first sort (state ascending) with its indicator; a header click sorts by latency.
 await expect(grid.locator('[role="columnheader"][data-dhx-id="state"]').filter({hasText:'Állapot'}).first()).toHaveAttribute('aria-sort','ascending');
 const latency=grid.locator('[role="columnheader"][data-dhx-id="latency"]').filter({hasText:'Válaszidő (ms)'}).first();
 await latency.click();await expect(latency).toHaveAttribute('aria-sort','ascending');
 await expect.poll(()=>requests.at(-1)?.sort).toEqual({field:'latency',direction:'asc'});
 // A select header filter and the declared name search narrow the rows; the count says how many match.
 const region=grid.locator('[data-dhx-id="region"]').filter({has:page.locator('input')}).first();
 await region.locator('input').click();await page.locator('.dhx_popup-content').getByText('eu-west',{exact:true}).click();
 await expect.poll(()=>requests.at(-1)?.filters?.region).toBe('eu-west');
 await expect.poll(()=>countText(page)).toBe('"Összes: 36 / Találat: 9"');
 const search=page.getByRole('textbox',{name:'Keresés',exact:true});await search.fill('Fizetés');
 await expect.poll(()=>countText(page)).toBe('"Összes: 36 / Találat: 1"');
 await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('eu-west');
 // No match: the standard text.
 await search.fill('nincs ilyen szolgáltatás');
 await expect(page.locator('.blade-status__text')).toHaveText('Nincs a szűrésnek vagy a keresésnek megfelelő elem.');
 await search.fill('Fizetés');await expect(rows).toHaveCount(1);
 // Adatok: the record through the provider's get, with the field sections and its ID.
 await rows.first().locator('[data-dhx-col-id="name"]').click();
 await command(page,'Adatok');
 const details=page.getByRole('dialog',{name:'Rekordadatok',exact:true});
 await expect(details).toContainText('Szolgáltatásjelentés — Adatok · eu-west.2');
 await expect(details).toContainText('Részletek');await expect(details).toContainText('Felelős csapat');
 await details.getByRole('button',{name:'Ablak bezárása',exact:true}).click();
 // A consumer action on the provider row (its target comes from the provider).
 await command(page,'Újraellenőrzés');
 // Its `reveal` answer is the non-blocking acknowledgement.
 await expect(page.getByRole('alert').filter({hasText:'Szimulált ellenőrzés.'})).toContainText('Fizetés (eu-west)');
 // The record view: double-click opens the page of the provider row.
 await rows.first().locator('[data-dhx-col-id="name"]').dblclick();
 await expect(page).toHaveURL(/view=demo\.service-page/);
 await expect(page.locator('.blade-record-details').first()).toContainText('Válaszidő (ms)');
 await expect(page.locator('.blade-location-bar, [aria-label="Hely"]').first()).toContainText('Fizetés · eu-west');
 expect(errors).toEqual([]);
});

test('a provider list on a phone: cards, the notice and the Szűrés dialog',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const requests=listRequests(page);
 await page.setViewportSize({width:390,height:844});
 await open(page);
 await expect(page.locator('.blade-grid-card').first()).toBeVisible();
 await expect(page.locator('.blade-list-notice')).toBeVisible();
 const box=await page.locator('.blade-list-notice').boundingBox();expect(box.width).toBeLessThanOrEqual(390);
 await command(page,'Szűrés');
 const dialog=page.getByRole('dialog').filter({has:page.getByText('Régió',{exact:true})});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('combobox',{name:'Állapot',exact:true}).selectOption({label:'Működik'});
 await dialog.getByRole('button',{name:'Szűrés',exact:true}).click();
 await expect.poll(()=>requests.at(-1)?.filters?.state).toBe('ok');
 expect(errors).toEqual([]);
});

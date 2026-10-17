const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
async function login(page,user='synthetic'){
 await page.goto('/');await page.getByLabel('Felhasználónév',{exact:true}).fill(user);await page.getByLabel('Jelszó',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await page.getByRole('menuitem',{name:'Elemek',exact:true}).click();await expect(page.getByRole('grid')).toBeVisible();
}
async function view(page,mode){await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText(mode,{exact:true}).click();}
test('real consumer shows all readable data and commits marked rows through the bulk endpoint',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1440,height:900});await login(page);
 await expect(page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first()).toHaveText('1');
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const detail=page.getByRole('dialog',{name:'Rekordadatok',exact:true});await expect(detail).toContainText('A gridből kihagyott, olvasható részletes adat 24');await expect(detail).not.toContainText('NEVER_EXPOSE');
 await detail.getByRole('button',{name:/close/i}).click();
 await view(page,'Kártyák');const cards=page.locator('.vapa-grid-card');await expect(cards.first()).toContainText('Részletes leírás');await expect(cards.first()).not.toContainText('NEVER_EXPOSE');
 expect((await cards.nth(1).boundingBox()).y).toBe((await cards.first().boundingBox()).y);
 await page.getByLabel('Sor jelölése: 24',{exact:true}).filter({visible:true}).check();await page.getByLabel('Sor jelölése: 23',{exact:true}).filter({visible:true}).check();
 await view(page,'Táblázat');await expect(page.getByLabel('Sor jelölése: 24',{exact:true}).filter({visible:true})).toBeChecked();
 await page.getByRole('button',{name:'Archiválás — jelöltek',exact:true}).click();
 const response=page.waitForResponse(response=>response.request().postData()?.includes('"action":"__bulk"'));
 await page.getByRole('dialog').getByRole('button',{name:'Végrehajtás (2 sor)',exact:true}).click();
 expect((await(await response).json()).data).toEqual([{id:'24',ok:true},{id:'23',ok:true}]);
 await expect(page.getByText('Sikeres: 2, sikertelen: 0.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'confirm',exact:true}).click();
 await expect(page.locator('.dhx_grid-row').filter({has:page.locator('[data-dhx-col-id="id"]',{hasText:'24'})}).getByRole('checkbox',{name:'Aktív',exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'Nézet: Táblázat',exact:true}).click();await page.getByText('Kártyák',{exact:true}).click();
 await page.screenshot({path:path.join(process.env.VAPA_TMP_DIR,'presentation-real-cards.png')});expect(errors).toEqual([]);
});
test('read-only consumer never receives denied detail values or bulk permissions',async({page})=>{
 const responses=[];page.on('response',async response=>{if(response.request().method()==='POST'&&response.url().includes('vapa=1'))responses.push(await response.text());});
 await login(page,'reader');await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const detail=page.getByRole('dialog',{name:'Rekordadatok',exact:true});await expect(detail).toContainText('Elem 24');await expect(detail).not.toContainText('Részletes leírás');await detail.getByRole('button',{name:/close/i}).click();
 await expect(page.getByRole('button',{name:'Archiválás — jelöltek',exact:true})).toHaveCount(0);
 await view(page,'Kártyák');await expect(page.locator('.vapa-grid-card').first()).not.toContainText('Részletes leírás');expect(responses.join('')).not.toContain('NEVER_EXPOSE');expect(responses.join('')).not.toContain('A gridből kihagyott');
});

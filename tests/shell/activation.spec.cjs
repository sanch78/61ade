const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command,view}=require('./feature-demo.cjs');
// Declared activation (view.activate) on the feature demo: `Polcok` opens a shelf's item list on double-click and
// Enter (table, cards, tiles; an empty shelf too); `Polc tételei` runs its registered `Készlet` action instead.
const window=page=>page.locator('.blade-feature-window');
const close=async page=>{await page.keyboard.press('Escape');await expect(window(page)).toHaveCount(0);};
const opened=async(page,shelf,items)=>{
 await expect(window(page)).toBeVisible();
 await expect(page.getByRole('dialog',{name:'Polc tételei — '+shelf})).toBeVisible();
 await expect(window(page).locator('.dhx_grid-row')).toHaveCount(items);
};

test('double-click and Enter on a shelf open its item list in table, cards and tiles; an empty shelf too',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page);await openView(page,'Polcok');
 const row=name=>page.locator('.dhx_grid-row').filter({hasText:name}).first().locator('[data-dhx-col-id="title"]');
 await row('Felső polc').dblclick();await opened(page,'Felső polc',2);
 // The child window's own activation is its registered action: double-click reports the stock.
 await window(page).locator('.dhx_grid-row').filter({hasText:'Doboz'}).locator('[data-dhx-col-id="title"]').dblclick();
 await expect(page.locator('.blade-toast').filter({hasText:'Készlet: Doboz: 4 db'})).toBeVisible();
 await expect(page.getByRole('dialog',{name:/Polc tételei — Módosítás/})).toHaveCount(0);
 await close(page);
 await row('Üres polc').dblclick();await opened(page,'Üres polc',0);await close(page);
 await row('Középső polc').click();await page.keyboard.press('Enter');await opened(page,'Középső polc',1);await close(page);
 // The details stay on the toolbar.
 await row('Középső polc').click();await command(page,'Adatok');
 const details=page.getByRole('dialog',{name:'Rekordadatok'});await expect(details).toBeVisible();await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
 for(const [mode,selector] of [['Kártyák','.blade-grid-card'],['Csempék','.blade-grid-tile']]){
  await view(page,mode);
  const item=name=>page.locator(selector).filter({hasText:name}).first();
  await expect(item('Felső polc')).toHaveAttribute('aria-description','Megnyitás: Polc tételei');
  await item('Felső polc').dblclick();await opened(page,'Felső polc',2);await close(page);
  await item('Üres polc').click();await page.keyboard.press('Enter');await opened(page,'Üres polc',0);await close(page);
 }
 await view(page,'Táblázat');
 expect(errors).toEqual([]);
});

test('without the item list offered, a shelf double-click opens its details',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page,'reader@example.test');await openView(page,'Polcok');
 await page.locator('.dhx_grid-row').filter({hasText:'Felső polc'}).first().locator('[data-dhx-col-id="title"]').dblclick();
 const details=page.getByRole('dialog',{name:'Rekordadatok'});await expect(details).toBeVisible();
 await expect(window(page)).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
 await view(page,'Kártyák');
 await expect(page.locator('.blade-grid-card').filter({hasText:'Felső polc'}).first()).toHaveAttribute('aria-description','Megnyitás: Adatok');
 await view(page,'Táblázat');
 expect(errors).toEqual([]);
});

test('a zone opens the shelves page filtered to it; the filter is an ordinary, removable one',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page);await openView(page,'Raktárzónák');
 const shelves=page.locator('.dhx_grid-row');
 await page.locator('.dhx_grid-row').filter({hasText:'A zóna'}).first().locator('[data-dhx-col-id="title"]').dblclick();
 // The page, not a window; the filter leaves the address once applied.
 await expect(page).toHaveURL(/#feature=demo_shelves$/);
 await expect(page.getByRole('heading',{name:'Polcok'})).toBeVisible();
 await expect(window(page)).toHaveCount(0);
 await expect(shelves.filter({hasText:'Felső polc'})).toHaveCount(1);await expect(shelves.filter({hasText:'Középső polc'})).toHaveCount(1);
 await expect(shelves.filter({hasText:'Üres polc'})).toHaveCount(0);
 // The shelves page keeps its own activation (the item window).
 await shelves.filter({hasText:'Felső polc'}).first().locator('[data-dhx-col-id="title"]').dblclick();await opened(page,'Felső polc',2);await close(page);
 // The page keeps the filter across a reload, like any filter set there.
 await page.reload();await expect(page).toHaveURL(/#feature=demo_shelves$/);
 await expect(shelves.filter({hasText:'Felső polc'})).toHaveCount(1);await expect(shelves.filter({hasText:'Üres polc'})).toHaveCount(0);
 await page.getByRole('button',{name:'Alaphelyzet',exact:true}).click();
 await expect(shelves.filter({hasText:'Üres polc'})).toHaveCount(1);
 await page.reload();await expect(shelves.filter({hasText:'Üres polc'})).toHaveCount(1);
 await page.goBack();await expect(page).toHaveURL(/#feature=demo_shelf_zones$/);
 await view(page,'Csempék');
 const tile=name=>page.locator('.blade-grid-tile').filter({hasText:name}).first();
 await expect(tile('B zóna')).toHaveAttribute('aria-description','Megnyitás: Polcok');
 await tile('B zóna').click();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/#feature=demo_shelves$/);
 await expect(shelves.filter({hasText:'Üres polc'})).toHaveCount(1);await expect(shelves.filter({hasText:'Felső polc'})).toHaveCount(0);
 // An empty zone: the shelves list is requested with the zone filter and is empty.
 await page.goBack();
 const listed=page.waitForResponse(response=>response.url().includes('blade=1')&&response.request().postDataJSON()?.resource==='demo_shelves'&&response.request().postDataJSON()?.action==='list');
 await tile('C zóna').dblclick();const response=await listed;
 expect(response.request().postDataJSON().values.filters).toMatchObject({zone_id:expect.any(String)});
 expect((await response.json()).data.items).toEqual([]);
 await expect(page).toHaveURL(/#feature=demo_shelves$/);await expect(shelves).toHaveCount(0);
 await page.goBack();await view(page,'Táblázat');
 expect(errors).toEqual([]);
});

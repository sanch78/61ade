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
 await row('Top shelf').dblclick();await opened(page,'Top shelf',2);
 // The child window's own activation is its registered action: double-click reports the stock.
 await window(page).locator('.dhx_grid-row').filter({hasText:'Box'}).locator('[data-dhx-col-id="title"]').dblclick();
 await expect(page.locator('.blade-toast').filter({hasText:'Készlet: Box: 4 db'})).toBeVisible();
 await expect(page.getByRole('dialog',{name:/Polc tételei — Módosítás/})).toHaveCount(0);
 await close(page);
 await row('Empty shelf').dblclick();await opened(page,'Empty shelf',0);await close(page);
 await row('Middle shelf').click();await page.keyboard.press('Enter');await opened(page,'Middle shelf',1);await close(page);
 // The details stay on the toolbar.
 await row('Middle shelf').click();await command(page,'Adatok');
 const details=page.getByRole('dialog',{name:'Rekordadatok'});await expect(details).toBeVisible();await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
 for(const [mode,selector] of [['Kártyák','.blade-grid-card'],['Csempék','.blade-grid-tile']]){
  await view(page,mode);
  const item=name=>page.locator(selector).filter({hasText:name}).first();
  await expect(item('Top shelf')).toHaveAttribute('aria-description','Megnyitás: Polc tételei');
  await item('Top shelf').dblclick();await opened(page,'Top shelf',2);await close(page);
  await item('Empty shelf').click();await page.keyboard.press('Enter');await opened(page,'Empty shelf',0);await close(page);
 }
 await view(page,'Táblázat');
 expect(errors).toEqual([]);
});

test('without the item list offered, a shelf double-click opens its details',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page,'reader@example.test');await openView(page,'Polcok');
 await page.locator('.dhx_grid-row').filter({hasText:'Top shelf'}).first().locator('[data-dhx-col-id="title"]').dblclick();
 const details=page.getByRole('dialog',{name:'Rekordadatok'});await expect(details).toBeVisible();
 await expect(window(page)).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
 await view(page,'Kártyák');
 await expect(page.locator('.blade-grid-card').filter({hasText:'Top shelf'}).first()).toHaveAttribute('aria-description','Megnyitás: Adatok');
 await view(page,'Táblázat');
 expect(errors).toEqual([]);
});

test('a zone opens the shelves page filtered to it; the filter is an ordinary, removable one',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await signIn(page);await openView(page,'Raktárzónák');
 const shelves=page.locator('.dhx_grid-row');
 await page.locator('.dhx_grid-row').filter({hasText:'Zone A'}).first().locator('[data-dhx-col-id="title"]').dblclick();
 // The page, not a window; the filter leaves the address once applied.
 await expect(page).toHaveURL(/#view=demo_shelves$/);
 await expect(page.getByRole('heading',{name:'Polcok'})).toBeVisible();
 await expect(window(page)).toHaveCount(0);
 await expect(shelves.filter({hasText:'Top shelf'})).toHaveCount(1);await expect(shelves.filter({hasText:'Middle shelf'})).toHaveCount(1);
 await expect(shelves.filter({hasText:'Empty shelf'})).toHaveCount(0);
 // The shelves page keeps its own activation (the item window).
 await shelves.filter({hasText:'Top shelf'}).first().locator('[data-dhx-col-id="title"]').dblclick();await opened(page,'Top shelf',2);await close(page);
 // The page keeps the filter across a reload, like any filter set there.
 await page.reload();await expect(page).toHaveURL(/#view=demo_shelves$/);
 await expect(shelves.filter({hasText:'Top shelf'})).toHaveCount(1);await expect(shelves.filter({hasText:'Empty shelf'})).toHaveCount(0);
 await page.getByRole('button',{name:'Alaphelyzet',exact:true}).click();
 await expect(shelves.filter({hasText:'Empty shelf'})).toHaveCount(1);
 await page.reload();await expect(shelves.filter({hasText:'Empty shelf'})).toHaveCount(1);
 await page.goBack();await expect(page).toHaveURL(/#view=demo_shelf_zones$/);
 await view(page,'Csempék');
 const tile=name=>page.locator('.blade-grid-tile').filter({hasText:name}).first();
 await expect(tile('Zone B')).toHaveAttribute('aria-description','Megnyitás: Polcok');
 await tile('Zone B').click();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/#view=demo_shelves$/);
 await expect(shelves.filter({hasText:'Empty shelf'})).toHaveCount(1);await expect(shelves.filter({hasText:'Top shelf'})).toHaveCount(0);
 // An empty zone: the shelves list is requested with the zone filter and is empty.
 await page.goBack();
 const listed=page.waitForResponse(response=>response.url().includes('blade=1')&&response.request().postDataJSON()?.resource==='demo_shelves'&&response.request().postDataJSON()?.action==='list');
 await tile('Zone C').dblclick();const response=await listed;
 expect(response.request().postDataJSON().values.filters).toMatchObject({zone_id:expect.any(String)});
 expect((await response.json()).data.items).toEqual([]);
 await expect(page).toHaveURL(/#view=demo_shelves$/);await expect(shelves).toHaveCount(0);
 await page.goBack();await view(page,'Táblázat');
 expect(errors).toEqual([]);
});

// FB-0219: with `activate: 'page'` the card and tile sub-view button opens the child page like the activation
// (history entry; Back keeps the scroll position); without it (Polcok) the button keeps opening the window.
// A phone forces cards: the forced choice is informational (disabled), so it is left as it is.
const choose=async(page,mode)=>{
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name:/^Nézet:/}).click();}
 else await page.getByRole('button',{name:/^Nézet:/}).click();
 const item=page.getByRole('menuitem',{name:mode,exact:true});
 if(await item.isDisabled())await page.keyboard.press('Escape');else await item.click();
};
const scroller=(page,selector)=>page.locator(`${selector}`).first().locator('xpath=ancestor::*[contains(concat(" ",@class," ")," dhx_dataview ")][1]');
for(const size of [{width:1366,height:420},{width:390,height:560}])test(`the card and tile button of a zone opens the shelves page at ${size.width} px; Back keeps the scroll position`,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize(size);
 await signIn(page);await openView(page,'Raktárzónák');
 const shelves=page.locator('.dhx_grid-row, .blade-grid-card');
 for(const [mode,selector] of [['Kártyák','.blade-grid-card'],['Csempék','.blade-grid-tile']]){
  await choose(page,mode);
  const button=name=>page.locator(selector).filter({hasText:name}).first().locator('.blade-card-subview');
  await expect(button('Zone A')).toHaveAccessibleName('Polcok (2)');
  await expect(button('Zone A')).toHaveAttribute('aria-description','Megnyitás: Polcok');
  await expect(button('Zone A')).not.toHaveAttribute('aria-haspopup',/./);
  await expect(page.locator(selector).filter({hasText:'Zone C'}).locator('.blade-card-subview')).toHaveCount(0);
  // Scrolled to the end with Zone A (the last record) as the cursor (selecting scrolls it into view), its button opens
  // its shelves page (not a window); Back returns to the same scroll offset with the same cursor record.
  const list=scroller(page,selector);
  await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});
  await page.locator(selector).filter({hasText:'Zone A'}).first().click({position:{x:8,y:8}});await page.waitForTimeout(300);
  const top=await list.evaluate(element=>element.scrollTop);
  // At 1366 px the tiles fit without scrolling; everywhere else the list is scrolled.
  if(await list.evaluate(element=>element.scrollHeight>element.clientHeight))expect(top).toBeGreaterThan(0);
  await button('Zone A').click();
  await expect(page).toHaveURL(/#view=demo_shelves$/);await expect(window(page)).toHaveCount(0);
  await expect(shelves.filter({hasText:'Middle shelf'}).first()).toBeVisible();await expect(shelves.filter({hasText:'Empty shelf'})).toHaveCount(0);
  await page.goBack();await expect(page).toHaveURL(/#view=demo_shelf_zones$/);
  await expect(button('Zone A')).toBeVisible();
  await expect(page.locator('.dhx_dataview-item--selected').filter({hasText:'Zone A'})).toHaveCount(1);
  await expect.poll(()=>scroller(page,selector).evaluate(element=>element.scrollTop)).toBe(top);
  // Keyboard: Enter on the focused button.
  await button('Zone B').focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#view=demo_shelves$/);await expect(shelves.filter({hasText:'Empty shelf'}).first()).toBeVisible();await expect(shelves.filter({hasText:'Top shelf'})).toHaveCount(0);
  await page.goBack();await expect(page).toHaveURL(/#view=demo_shelf_zones$/);
 }
 // Double-click keeps the scroll position on Back as well.
 const list=scroller(page,'.blade-grid-tile');
 await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});
 await page.locator('.blade-grid-tile').filter({hasText:'Zone A'}).first().click({position:{x:8,y:8}});await page.waitForTimeout(300);
 const top=await list.evaluate(element=>element.scrollTop);
 await page.locator('.blade-grid-tile').filter({hasText:'Zone A'}).first().dblclick();await expect(page).toHaveURL(/#view=demo_shelves$/);
 await page.goBack();await expect(page.locator('.blade-grid-tile').filter({hasText:'Zone A'}).first()).toBeVisible();
 await expect.poll(()=>scroller(page,'.blade-grid-tile').evaluate(element=>element.scrollTop)).toBe(top);
 // Without a page activation the shelves' button opens the item window as before (Zone A's shelves page).
 await page.locator('.blade-grid-tile').filter({hasText:'Zone A'}).first().dblclick();await expect(page).toHaveURL(/#view=demo_shelves$/);await choose(page,'Kártyák');
 const shelf=page.locator('.blade-grid-card').filter({hasText:'Top shelf'}).first().locator('.blade-card-subview');
 await expect(shelf).toHaveAttribute('aria-haspopup','dialog');await expect(shelf).not.toHaveAttribute('aria-description',/./);
 // The window shows the items as a table, or as cards on a phone.
 await shelf.click();await expect(page.getByRole('dialog',{name:'Polc tételei — Top shelf'})).toBeVisible();
 await expect(window(page).locator('.dhx_grid-row, .blade-grid-card')).toHaveCount(2);await close(page);await expect(page).toHaveURL(/#view=demo_shelves$/);
 await choose(page,'Táblázat');
 expect(errors).toEqual([]);
});

test('English names of the page button',async({page})=>{
 await signIn(page);
 const language=locale=>page.evaluate(async locale=>{
  const csrf=document.querySelector('#blade-command input[name="csrf"]').value;
  await fetch('./',{method:'POST',body:new URLSearchParams({action:'language',csrf,locale})});
 },locale);
 await language('en');
 try{
  // A hash change alone does not reload the page in the new language.
  await page.goto('/#view=demo_shelf_zones');await page.reload();await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
  await page.getByRole('button',{name:/^View:/}).click();await page.getByRole('menuitem',{name:'Cards',exact:true}).click();
  const button=page.locator('.blade-grid-card').filter({hasText:'Zone A'}).first().locator('.blade-card-subview');
  await expect(button).toHaveAccessibleName('Polcok (2)');await expect(button).toHaveAttribute('aria-description','Opens: Polcok');
  await page.getByRole('button',{name:/^View:/}).click();await page.getByRole('menuitem',{name:'Table',exact:true}).click();
 }finally{await language('hu');}
});

const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView,view}=require('./feature-demo.cjs');
// UI preferences (browser storage) and view URLs on the feature demo's Feladatok view.
test('view URL restores through login/reload and browser history; #feature= is a rewritten alias',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // A delivered e-mail's legacy address survives the sign-in and becomes the canonical one in place.
 await signIn(page,'demo@example.test','/#feature=demo_tasks');
 await expect(page.getByRole('grid')).toBeVisible();await expect(page).toHaveURL(/#view=demo_tasks$/);
 await page.reload();await expect(page.getByRole('grid')).toBeVisible();
 await page.goto('/');await expect(page.getByRole('grid')).toHaveCount(0);
 await openView(page,'Feladatok');
 await expect(page).toHaveURL(/#view=demo_tasks$/);
 await expect(page.getByRole('grid')).toBeVisible();
 await page.goBack();await expect(page.getByRole('grid')).toHaveCount(0);
 await page.goForward();await expect(page.getByRole('grid')).toBeVisible();
 await page.goto('/#view=unavailable');await expect(page.getByRole('grid')).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('grid size, sorting, view and panel width survive reload',async({page})=>{
 await page.setViewportSize({width:1280,height:720});
 await signIn(page,'demo@example.test','/#view=demo_tasks');
 const header=page.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Megnevezés'}).first();
 await expect(header).toBeVisible();await header.click();
 await expect(header).toHaveAttribute('aria-sort','ascending');
 const before=await header.boundingBox();
 await page.mouse.move(before.x+before.width-2,before.y+before.height/2);
 await page.mouse.down();await page.mouse.move(before.x+before.width+80,before.y+before.height/2,{steps:8});await page.mouse.up();
 const width=(await header.boundingBox()).width;
 expect(width).toBeGreaterThan(before.width+40);
 const filter=page.locator('[data-cell-id="filter"]');
 const panel=await filter.boundingBox();
 await page.mouse.move(panel.x+panel.width+6,panel.y+panel.height/2);await page.mouse.down();
 await page.mouse.move(panel.x+panel.width+66,panel.y+panel.height/2,{steps:8});await page.mouse.up();
 const panelWidth=(await filter.boundingBox()).width;
 expect(panelWidth).toBeGreaterThan(panel.width+30);
 await page.reload();await expect(header).toHaveAttribute('aria-sort','ascending');
 await expect.poll(async()=>Math.round((await header.boundingBox()).width)).toBe(Math.round(width));
 await expect.poll(async()=>Math.round((await filter.boundingBox()).width)).toBe(Math.round(panelWidth));
 await filter.getByRole('button',{name:'click to collapse',exact:true}).click();
 await page.reload();
 await filter.getByRole('button',{name:'click to expand',exact:true}).click();
 await expect.poll(async()=>Math.round((await filter.boundingBox()).width)).toBe(Math.round(panelWidth));
 const cards=page.locator('.blade-grid-card');
 await view(page,'Kártyák');
 await page.reload();await expect(cards.first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.reload();
 await page.setViewportSize({width:1280,height:720});
 await expect(cards.first()).toBeVisible();
 await view(page,'Táblázat');
 await page.setViewportSize({width:390,height:844});await page.reload();
 await page.setViewportSize({width:1280,height:720});
 await expect(page.getByRole('grid')).toBeVisible();await expect(cards).toHaveCount(0);
});
test('invalid or unavailable storage cannot break navigation',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage disabled');};Storage.prototype.setItem=()=>{throw new Error('Storage disabled');};});
 await signIn(page,'demo@example.test','/#view=demo_tasks');await expect(page.getByRole('grid')).toBeVisible();
 await page.reload();await expect(page.getByRole('grid')).toBeVisible();
});
test('filter values survive reload per user and view; a stale saved value is dropped',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await signIn(page,'demo@example.test','/#view=demo_shelves');
 const rows=page.locator('.dhx_grid-row'),panel=page.locator('.dhx_form').filter({has:page.getByRole('button',{name:'Alaphelyzet',exact:true})});
 await expect(rows.filter({hasText:'Üres polc'})).toHaveCount(1);
 await panel.getByLabel('Megnevezés',{exact:true}).fill('Felső');await panel.getByRole('button',{name:'Szűrés',exact:true}).click();
 await expect(rows.filter({hasText:'Üres polc'})).toHaveCount(0);
 await page.reload();
 await expect(rows.filter({hasText:'Felső polc'})).toHaveCount(1);await expect(rows.filter({hasText:'Üres polc'})).toHaveCount(0);
 await expect(panel.getByLabel('Megnevezés',{exact:true})).toHaveValue('Felső');
 // Another view keeps its own (empty) filters.
 await openView(page,'Raktárzónák');await expect(rows).toHaveCount(3);
 // A saved select value the definitions no longer offer is ignored: the list loads unfiltered, without an error.
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('"demo_shelves"')){const state=JSON.parse(localStorage.getItem(key));state.filters={zone_id:'999'};localStorage.setItem(key,JSON.stringify(state));}});
 await page.goto('/#view=demo_shelves');await expect(rows.filter({hasText:'Üres polc'})).toHaveCount(1);
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 expect(errors).toEqual([]);
});

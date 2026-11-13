const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// Popup menu at a project's button (`app.ui.menu`, docs/toolkit.md#popup-menu, FB-0201): group headings, checked
// radio entries with a right-hand detail, scrolling beyond about 12 entries and the APG menu-button keys, on the feature
// demo's `Munkaasztal` (frontend/src/workbench.ts: `Előzmények` grouped by date, the model picker) at 1366 and 390 px,
// in every factory theme, and in a fixture module's modal window above a non-modal one (Escape closes only the menu).
const work=page=>page.getByRole('dialog',{name:'Munkaasztal'});
const NAME=/^Munkaasztal(, \d+ függőben)?$/;
const openWork=page=>expect(async()=>{await page.getByRole('menuitem',{name:NAME}).click();await expect(work(page)).toBeVisible({timeout:1000});}).toPass({timeout:10000});
const menu=(page,name)=>page.getByRole('menu',{name,exact:true});
const focusedText=page=>page.evaluate(()=>document.activeElement?.textContent?.trim()??'');
const inMenu=page=>page.evaluate(()=>!!document.activeElement?.closest('[role="menu"]'));

/** WCAG contrast ratio of two `rgb(…)` colours. */
function contrast(a,b){
 const lum=rgb=>{const [r,g,bl]=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*bl;};
 const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);
}

/** Opens `Munkaasztal` (a fresh, not maximized window) and waits until both menus are bound. */
async function workbench(page,width){
 await page.setViewportSize({width,height:width<768?844:768});
 await signIn(page);
 await openWork(page);
 const history=work(page).getByRole('button',{name:'Előzmények'});
 await expect(history).toHaveAttribute('aria-haspopup','menu');
 await expect(work(page).getByRole('button',{name:/^Modell:/})).toHaveAttribute('aria-expanded','false');
 return {history,model:work(page).getByRole('button',{name:/^Modell:/})};
}

test('desktop: Előzmények groups the drafts by date, checks the current one, scrolls and keeps the APG keys; Escape leaves the window open',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 const {history}=await workbench(page,1366);
 await history.click();
 const list=menu(page,'Előzmények');
 await expect(list).toBeVisible();
 await expect(history).toHaveAttribute('aria-expanded','true');
 // Headings are rows of the menu, not entries; the first entry of each group carries its name for screen readers.
 await expect(list.locator('.blade-popup-menu__heading')).toHaveText(['Ma','Az elmúlt 7 nap','Régebbi']);
 const entries=list.getByRole('menuitemradio');
 await expect(entries).toHaveCount(18);
 await expect(entries.first()).toHaveAttribute('aria-checked','true');
 await expect(entries.nth(1)).toHaveAttribute('aria-checked','false');
 await expect(entries.first()).toBeFocused();
 await expect(entries.first()).toHaveAccessibleName(/^Ma: Vázlat 1 \d\d:\d\d$/);
 await expect(entries.nth(1)).toHaveAccessibleName(/^Vázlat 2 \d\d:\d\d$/);
 await expect(entries.nth(3)).toHaveAccessibleName(/^Az elmúlt 7 nap: Vázlat 4 /);
 // About twelve entries are visible, the rest scroll; End and Home reach both ends.
 const box=await list.evaluate(node=>({scroll:node.scrollHeight,client:node.clientHeight}));
 expect(box.scroll).toBeGreaterThan(box.client);
 expect(box.client).toBeLessThanOrEqual(440);
 await page.keyboard.press('End');
 await expect(entries.last()).toBeFocused();
 await expect(entries.last()).toBeInViewport();
 await page.keyboard.press('Home');
 await expect(entries.first()).toBeFocused();
 await page.keyboard.press('ArrowDown');
 await expect(entries.nth(1)).toBeFocused();
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
 await expect(entries.last()).toBeFocused();
 // A pick closes the menu, returns the focus and is reported.
 await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(list).toHaveCount(0);
 await expect(history).toBeFocused();
 await expect(history).toHaveAttribute('aria-expanded','false');
 await expect(work(page).locator('.dhx_window-content .dhx_navbar-title')).toHaveText('Vázlat 2');
 // ArrowDown on the button opens it on the checked entry; Escape closes only the menu.
 await page.keyboard.press('ArrowDown');
 await expect(list.getByRole('menuitemradio',{name:/Vázlat 2 /})).toBeFocused();
 await expect(list.getByRole('menuitemradio',{name:/Vázlat 2 /})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Escape');
 await expect(list).toHaveCount(0);
 await expect(work(page)).toBeVisible();
 await expect(history).toBeFocused();
 // Enter and Space open it; ArrowUp on the last entry; Tab closes it and moves on from the button.
 await page.keyboard.press('Enter');
 await expect(list).toBeVisible();
 await page.keyboard.press('Escape');
 await page.keyboard.press('Space');
 await expect(list).toBeVisible();
 expect(await inMenu(page)).toBe(true);
 await page.keyboard.press('Escape');
 await page.keyboard.press('ArrowUp');
 await expect(entries.last()).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(list).toHaveCount(0);
 await expect(history).toHaveAttribute('aria-expanded','false');
 expect(await page.evaluate(()=>document.activeElement!==document.body&&!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
 await expect(history).not.toBeFocused();
 // A second click on the button and a click outside close it.
 await history.click();await expect(list).toBeVisible();
 await history.click();await expect(list).toHaveCount(0);
 await history.click();await expect(list).toBeVisible();
 await work(page).getByLabel('Jegyzet').click();
 await expect(list).toHaveCount(0);
 await expect(history).toHaveAttribute('aria-expanded','false');
 // The window still closes on Escape once no menu is open.
 await history.focus();await page.keyboard.press('Escape');
 await expect(work(page)).toHaveCount(0);
 expect(failures).toEqual([]);
});

test('desktop: the model picker opens above the composer with Automatikus, the models and the chosen model\'s efforts',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 const {model}=await workbench(page,1366);
 await model.click();
 const list=menu(page,'Modell');
 await expect(list).toBeVisible();
 // The pointer leaving it, a click on a heading and a letter key (a detail is no shortcut) keep it open, nothing picked.
 await list.locator('.dhx_menu-button').first().hover();await page.mouse.move(5,5);
 await expect(list).toBeVisible();
 await list.locator('.blade-popup-menu__heading').click();
 await expect(list).toBeVisible();
 await list.getByRole('menuitemradio').first().focus();
 await page.keyboard.press('n');await page.keyboard.press('3');
 await expect(list).toBeVisible();
 await expect(model).toHaveText('Modell: Automatikus');
 const [at,box]=[await model.boundingBox(),await list.boundingBox()];
 expect(box.y+box.height).toBeLessThanOrEqual(at.y+1);
 await expect(list.locator('.blade-popup-menu__heading')).toHaveText(['Modell']);
 const entries=list.getByRole('menuitemradio');
 await expect(entries).toHaveCount(4);
 await expect(entries.first()).toHaveAccessibleName('Modell: Automatikus a feladat alapján');
 await expect(entries.first()).toHaveAttribute('aria-checked','true');
 await expect(entries.nth(2)).toHaveAccessibleName('Kiegyensúlyozott alapértelmezett');
 await entries.nth(2).click();
 await expect(list).toHaveCount(0);
 await expect(model).toHaveText('Modell: Kiegyensúlyozott · Közepes');
 await model.click();
 await expect(list.locator('.blade-popup-menu__heading')).toHaveText(['Modell','Erősség']);
 await expect(list.getByRole('menuitemradio')).toHaveCount(7);
 await expect(list.getByRole('menuitemradio',{name:'Kiegyensúlyozott alapértelmezett'})).toBeFocused();
 await expect(list.getByRole('menuitemradio',{name:'Erősség: Alacsony',exact:true})).toHaveAttribute('aria-checked','false');
 await expect(list.getByRole('menuitemradio',{name:'Közepes',exact:true})).toHaveAttribute('aria-checked','true');
 // Each group is its own radio set: one checked entry per group.
 await expect(list.locator('[aria-checked="true"]')).toHaveCount(2);
 await list.getByRole('menuitemradio',{name:'Magas',exact:true}).click();
 await expect(model).toHaveText('Modell: Kiegyensúlyozott · Magas');
 // A pick right after the opening (before Suite's own 100 ms bookkeeping) works and raises nothing.
 // (The focus enters the menu on the next frame; the keys follow at once.)
 await model.focus();await page.keyboard.press('ArrowDown');
 await expect(list.getByRole('menuitemradio',{name:'Kiegyensúlyozott alapértelmezett'})).toBeFocused({timeout:1000});
 await page.keyboard.press('End');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
 await expect(model).toHaveText('Modell: Kiegyensúlyozott · Közepes');
 expect(failures).toEqual([]);
 // The menu follows every factory theme: entry, detail and heading text readable on its background.
 for(const [label,theme] of [['Blade Night','blade-night'],['Világos','light'],['Éjjeli','dark'],['Blade','blade']]){
  await page.getByRole('button',{name:/^(Blade|Blade Night|Világos|Éjjeli)$/}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-blade-theme',theme);
  await model.click();await expect(list).toBeVisible();
  const colours=await list.evaluate(node=>{
   const colour=selector=>getComputedStyle(node.querySelector(selector)).color;
   return {background:getComputedStyle(node).backgroundColor,text:colour('.blade-popup-menu__label'),detail:colour('.blade-popup-menu__detail'),heading:colour('.blade-popup-menu__heading')};
  });
  for(const part of ['text','detail','heading'])expect(contrast(colours[part],colours.background),`${label} ${part}: ${colours[part]} on ${colours.background}`).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press('Escape');await expect(list).toHaveCount(0);
 }
});

test('phone: both menus stay anchored within the viewport, scroll and pick by touch',async({page})=>{
 const {history,model}=await workbench(page,390);
 await history.click();
 const list=menu(page,'Előzmények');
 await expect(list).toBeVisible();
 const box=await list.boundingBox();
 expect(box.x).toBeGreaterThanOrEqual(0);
 expect(box.x+box.width).toBeLessThanOrEqual(390);
 expect(box.y+box.height).toBeLessThanOrEqual(844);
 expect(await list.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await list.getByRole('menuitemradio',{name:/Vázlat 17 /}).scrollIntoViewIfNeeded();
 await list.getByRole('menuitemradio',{name:/Vázlat 17 /}).click();
 await expect(list).toHaveCount(0);
 await expect(work(page).locator('.dhx_window-content .dhx_navbar-title')).toHaveText('Vázlat 17');
 await model.click();
 const picker=menu(page,'Modell');
 await expect(picker).toBeVisible();
 const pick=await picker.boundingBox();
 expect(pick.x).toBeGreaterThanOrEqual(0);
 expect(pick.x+pick.width).toBeLessThanOrEqual(390);
 await picker.getByRole('menuitemradio',{name:'Alapos'}).click();
 await expect(model).toHaveText('Modell: Alapos · Közepes');
});

// The fixture module hands `app` to the page (docs/toolkit.md#module-loading), as in toolkit-components.spec.cjs.
const MODULE='/toolkit-menu-fixture.mjs';
async function fixture(page){
 await page.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',body:'export default app=>{window.__bladeApp=app;};'}));
 await page.route(url=>url.pathname==='/'&&!url.searchParams.has('blade'),async route=>{
  const request=route.request();
  if(request.method()!=='GET'||request.resourceType()!=='document')return route.fallback();
  const response=await route.fetch();
  const body=(await response.text()).replace(/(<script type="application\/json" id="blade-config">)([\s\S]*?)(<\/script>)/,(all,open,json,close)=>{
   const config=JSON.parse(json);if(!config.authenticated)return all;
   config.modules=[...(config.modules??[]),MODULE];
   return open+JSON.stringify(config).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')+close;
  });
  await route.fulfill({response,body});
 });
 await page.setViewportSize({width:1366,height:768});
 await signIn(page);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}

test('a modal window above a non-modal one: Escape in the menu closes only the menu; validation, empty note and destroy',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await fixture(page);
 await page.evaluate(()=>{
  const app=window.__bladeApp;
  window.__back=app.ui.window({title:'Háttérablak',modal:false,width:400,height:300});
  const win=window.__modal=app.ui.window({title:'Modális ablak',modal:true,width:480,height:320});
  const box=document.createElement('div');box.style.padding='16px';
  const sort=document.createElement('button');sort.type='button';sort.textContent='Rendezés';
  const role=document.createElement('div');role.tabIndex=0;role.setAttribute('role','button');role.textContent='Szerepes gomb';
  const after=document.createElement('button');after.type='button';after.textContent='Utána';
  box.append(sort,role,after);win.attach(box);
  window.__picked=[];
  const items=[{id:'name',label:'Név',icon:'dxi dxi-sort-alphabetical-ascending'},{id:'date',label:'Dátum',detail:'Ctrl+D'},{type:'separator'},{id:'off',label:'Nem elérhető',disabled:true},
   {type:'group',label:'Irány',items:[{id:'asc',label:'Növekvő',checked:true},{id:'desc',label:'Csökkenő',checked:false}]},{type:'group',label:'Üres csoport',items:[]}];
  window.__sort=app.ui.menu(sort,{label:'Rendezés',items,signal:win.signal});
  window.__sort.on('select',({id})=>window.__picked.push(id));
  window.__role=app.ui.menu(role,{label:'Szerepes',items:()=>[]});
 });
 const modal=page.getByRole('dialog',{name:'Modális ablak'}),sort=modal.getByRole('button',{name:'Rendezés'});
 await expect(modal).toBeVisible();
 await sort.focus();
 await page.keyboard.press('Enter');
 const list=menu(page,'Rendezés');
 await expect(list).toBeVisible();
 // The checked entry takes the focus; the disabled one and the headings are skipped; the empty group is left out.
 await expect(list.getByRole('menuitemradio',{name:'Irány: Növekvő'})).toBeFocused();
 await expect(list.locator('.blade-popup-menu__heading')).toHaveText(['Irány']);
 await expect(list.getByRole('menuitem',{name:'Nem elérhető'})).toHaveAttribute('aria-disabled','true');
 await expect(list.getByRole('separator')).toHaveCount(1);
 await page.keyboard.press('Home');
 await expect(list.getByRole('menuitem',{name:'Név'})).toBeFocused();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
 await expect(list.getByRole('menuitemradio',{name:'Irány: Növekvő'})).toBeFocused();
 // The menu is above the modal window and takes the first Escape; the second closes the window.
 const z=await page.evaluate(()=>({menu:Number(getComputedStyle(document.querySelector('.blade-popup-menu .dhx_menu')).zIndex),windows:[...document.querySelectorAll('.dhx_popup--window, .dhx_popup--window_modal, .dhx_window__overlay')].map(node=>Number(getComputedStyle(node).zIndex)||0)}));
 expect(z.menu).toBeGreaterThan(Math.max(...z.windows));
 await page.keyboard.press('Escape');
 await expect(list).toHaveCount(0);
 await expect(modal).toBeVisible();
 await expect(sort).toBeFocused();
 await page.keyboard.press('ArrowDown');
 await list.getByRole('menuitem',{name:'Dátum Ctrl+D'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__picked)).toEqual(['date']);
 await expect(sort).toBeFocused();
 // An anchor that is not a native button gets Enter and Space; an empty menu shows its note.
 const role=modal.getByRole('button',{name:'Szerepes gomb'});
 await role.focus();await page.keyboard.press('Space');
 await expect(menu(page,'Szerepes')).toBeVisible();
 await expect(menu(page,'Szerepes')).toContainText('Nincs választható elem.');
 await page.keyboard.press('Escape');
 await expect(menu(page,'Szerepes')).toHaveCount(0);
 await expect(role).toBeFocused();
 await expect(modal).toBeVisible();
 // Malformed input throws TypeError; destroy restores the anchor.
 const errors=await page.evaluate(()=>{
  const app=window.__bladeApp,b=document.createElement('button'),out=[];
  const attempt=fn=>{try{fn();out.push('ok');}catch(error){out.push(error instanceof TypeError?'TypeError':String(error));}};
  attempt(()=>app.ui.menu(null,{label:'x',items:[]}));
  attempt(()=>app.ui.menu(b,{items:[]}));
  attempt(()=>app.ui.menu(b,{label:'x',items:[{id:'a b',label:'x'}]}));
  attempt(()=>app.ui.menu(b,{label:'x',items:[{id:'a',label:'x'},{id:'a',label:'y'}]}));
  attempt(()=>app.ui.menu(b,{label:'x',items:[{id:'a',label:'x',checked:true,icon:'dxi dxi-check'}]}));
  attempt(()=>app.ui.menu(b,{label:'x',items:Array.from({length:201},(_,i)=>({id:'e'+i,label:String(i)}))}));
  attempt(()=>app.ui.menu(b,{label:'x',items:[{type:'group',items:[{type:'separator'}]}]}));
  document.body.append(b);
  const late=app.ui.menu(b,{label:'x',items:()=>[{id:''}]});attempt(()=>late.open());late.destroy();
  const ok=app.ui.menu(b,{label:'x',items:Array.from({length:200},(_,i)=>({id:'e'+i,label:String(i)}))});
  out.push(b.getAttribute('aria-haspopup'));ok.destroy();ok.destroy();out.push(String(b.getAttribute('aria-haspopup')),String(b.getAttribute('aria-expanded')));b.remove();
  return out;
 });
 expect(errors).toEqual([...Array(8).fill('TypeError'),'menu','null','null']);
 // Closing the window (its signal) destroys the menu bound to it.
 await page.keyboard.press('Escape');
 await expect(modal).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'Háttérablak'})).toBeVisible();
 await page.evaluate(()=>{window.__sort.open();window.__back.close();window.__role.destroy();});
 await expect(menu(page,'Rendezés')).toHaveCount(0);
 expect(failures).toEqual([]);
});

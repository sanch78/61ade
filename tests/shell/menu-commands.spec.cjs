const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu,openView}=require('./feature-demo.cjs');
// Menu-row commands and long-lived windows (docs/shell.md#menu-commands, docs/toolkit.md#long-lived-windows, FB-0199):
// the feature demo's `Munkaasztal` (application.php `menuCommands`, frontend/src/workbench.ts) sits in the menu row of
// every view in the emphasized tone, opens a non-modal, maximizable, remembered work window that keeps its draft across
// navigation, and shows the pending approvals' count.
const command=page=>page.locator('.blade-navigation-row .dhx_menu-nav > li.blade-menu-command');
const button=page=>command(page).locator('button');
const work=page=>page.getByRole('dialog',{name:'Munkaasztal'});
const NAME=/^Munkaasztal(, \d+ függőben)?$/;
// The row is redrawn once the modules register and the first view opens: a click that lands on a replaced entry retries.
const openWork=page=>expect(async()=>{await page.getByRole('menuitem',{name:NAME}).click();await expect(work(page)).toBeVisible({timeout:1000});}).toPass({timeout:10000});

/** WCAG contrast ratio of two `rgb(…)` colours. */
function contrast(a,b){
 const lum=rgb=>{const [r,g,bl]=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*bl;};
 const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);
}
/** The command's text colour and its pill's background. */
const colours=page=>button(page).evaluate(element=>({text:getComputedStyle(element).color,pill:getComputedStyle(element,'::before').backgroundColor,weight:getComputedStyle(element).fontWeight}));

test('desktop: the emphasized command follows the navigation on every view, in every factory theme, and opens the work window',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:768});
 await signIn(page);
 await expect(command(page)).toHaveCount(1);
 await expect(command(page)).toHaveClass(/blade-menu-command--primary/);
 await expect(page.getByRole('menuitem',{name:NAME})).toBeVisible();
 // Directly after the navigation: `Menü` when collapsed, else the last menu entry (logout follows the spacer).
 const order=await page.locator('.blade-navigation-row .dhx_menu-nav > li').evaluateAll(items=>items.map(item=>item.querySelector('button')?.dataset.dhxId??item.className));
 const at=order.indexOf('command:demo.workbench');
 expect(order[at-1]).toMatch(/^(blade-main-menu|view:|group:|library)/);
 expect(order.slice(at+1).some(id=>/^(view:|group:|library)/.test(String(id)))).toBe(false);
 expect((await button(page).boundingBox()).height).toBe((await page.getByRole('menuitem',{name:/^Menü/}).boundingBox()).height);
 await expect(command(page).locator('.blade-menu-command__body')).toHaveAttribute('title','Munkaablak: nézetváltáskor is nyitva marad');
 for(const [label,theme] of [['Blade Night','blade-night'],['Világos','light'],['Éjjeli','dark'],['Blade','blade']]){
  await page.getByRole('button',{name:/^(Blade|Blade Night|Világos|Éjjeli)$/}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-blade-theme',theme);
  await page.mouse.move(5,700);
  const {text,pill,weight}=await colours(page);
  expect(contrast(text,pill),`${label}: ${text} on ${pill}`).toBeGreaterThanOrEqual(4.5);
  expect(Number(weight)).toBeGreaterThanOrEqual(600);
 }
 // Keyboard: the next entry after the navigation in the row's arrow-key order, named by its label (the Blade theme's
 // widths may have changed the row since).
 const now=await page.locator('.blade-navigation-row .dhx_menu-nav > li > button').evaluateAll(buttons=>buttons.map(button=>button.dataset.dhxId));
 await page.locator(`.blade-navigation-row .dhx_menu-nav button[data-dhx-id="${now[now.indexOf('command:demo.workbench')-1]}"]`).focus();await page.keyboard.press('ArrowRight');
 await expect(button(page)).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(work(page)).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(work(page)).toHaveCount(0);
 // Every view keeps it; a run changes neither the address nor the view.
 await openMenu(page,'Feladatok','Feature demó');
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
 const address=page.url();
 await expect(command(page)).toHaveCount(1);
 await openWork(page);
 await expect(work(page)).toBeVisible();
 expect(page.url()).toBe(address);
 await expect(work(page).getByLabel('Aktuális nézet')).toHaveValue('Feladatok');
 // A second click brings the open window forward instead of opening another.
 await openWork(page);
 await expect(page.getByRole('dialog',{name:'Munkaasztal'})).toHaveCount(1);
 expect(failures).toEqual([]);
});

test('the work window survives record windows, navigation and Back/Forward, keeps its draft, stacks a confirmation and closes on Escape',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:768});
 await signIn(page);
 await openView(page,'Polcok');
 // A remembered box (the user's, written as the window writes it) keeps the window in the lower right corner.
 await page.evaluate(()=>{const user=JSON.parse(document.getElementById('blade-config').textContent).userId;
  localStorage.setItem('blade-ui:1:'+JSON.stringify([location.pathname,user,'window:demo.workbench']),JSON.stringify({window:{left:800,top:420,width:540,height:330,maximized:false}}));});
 await openWork(page);
 const note=work(page).getByLabel('Jegyzet');
 await note.fill('Félkész vázlat');
 // Non-modal: the workspace beside it stays usable; a shelf opens its record window above it.
 await page.locator('.dhx_grid-row').filter({hasText:'Top shelf'}).first().locator('[data-dhx-col-id="title"]').dblclick({position:{x:8,y:8}});
 const record=page.getByRole('dialog',{name:'Polc tételei — Top shelf'});
 await expect(record).toBeVisible();
 await expect(work(page)).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(record).toHaveCount(0);
 await expect(note).toHaveValue('Félkész vázlat');
 await expect(work(page).getByLabel('Aktuális nézet')).toHaveValue('Polcok');
 // The menu behind it stays usable.
 const tasks=page.url();
 await openMenu(page,'Kapcsolatok','Feature demó');
 await expect.poll(()=>page.url()).not.toBe(tasks);
 const contacts=page.url();
 await expect(work(page)).toBeVisible();
 await expect(note).toHaveValue('Félkész vázlat');
 await expect(work(page).getByLabel('Aktuális nézet')).toHaveValue('Kapcsolatok');
 await page.goBack();
 await expect.poll(()=>page.url()).toBe(tasks);
 await expect(work(page).getByLabel('Aktuális nézet')).toHaveValue('Polcok');
 await page.goForward();
 await expect.poll(()=>page.url()).toBe(contacts);
 await expect(note).toHaveValue('Félkész vázlat');
 // A confirmation opened inside stacks above the window and returns the focus to it.
 await work(page).getByRole('button',{name:'Jegyzet törlése'}).click();
 await expect(page.getByText('Törlöd a jegyzetet?')).toBeVisible();
 // The message is what the pointer reaches where it overlaps the window (it is drawn above it).
 const message=await page.getByText('Törlöd a jegyzetet?').boundingBox();
 expect(await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.textContent?.includes('Törlöd a jegyzetet?')??false,[message.x+message.width/2,message.y+message.height/2])).toBe(true);
 await page.keyboard.press('Escape');
 await expect(page.getByText('Törlöd a jegyzetet?')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"][aria-label="Munkaasztal"]'))).toBe(true);
 await expect(note).toHaveValue('Félkész vázlat');
 // Escape inside it closes it; reopening starts a new window (the draft was the window's).
 await note.focus();await page.keyboard.press('Escape');
 await expect(work(page)).toHaveCount(0);
 await openWork(page);
 await expect(work(page).getByLabel('Jegyzet')).toHaveValue('');
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('window:demo.workbench'))localStorage.removeItem(key);});
 expect(failures).toEqual([]);
});

test('maximize and restore fill the workspace, and the size, position and maximized state are remembered after a reload',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:768});
 await signIn(page);
 await openWork(page);
 const box=()=>work(page).boundingBox();
 // Move it by its header: the user's position is remembered.
 const header=work(page).locator('.dhx_window-header');
 const start=await box();
 await header.hover({position:{x:200,y:20}});await page.mouse.down();await page.mouse.move(start.x+200-80,start.y+20-60,{steps:5});await page.mouse.up();
 const moved=await box();
 expect(Math.round(moved.x)).toBe(Math.round(start.x-80));
 const maximize=work(page).getByRole('button',{name:'Ablak maximalizálása'});
 await expect(maximize).toBeVisible();
 await maximize.focus();await page.keyboard.press('Enter');
 const area=await page.locator('.blade-workspace').first().boundingBox();
 await expect.poll(async()=>{const b=await box();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];})
  .toEqual([Math.round(area.x),Math.round(area.y),Math.round(area.width),Math.round(area.height)]);
 const restore=work(page).getByRole('button',{name:'Ablak visszaállítása'});
 await expect(restore).toBeVisible();
 // The menu row stays reachable over a maximized window.
 await expect(page.getByRole('menuitem',{name:NAME})).toBeVisible();
 await restore.click();
 await expect.poll(async()=>Math.round((await box()).x)).toBe(Math.round(moved.x));
 expect(Math.round((await box()).width)).toBe(Math.round(moved.width));
 // Reload: the remembered box; maximized again, it reopens maximized and restores to that box.
 await page.reload();
 await openWork(page);
 await expect.poll(async()=>{const b=await box();return [Math.round(b.x),Math.round(b.y)];}).toEqual([Math.round(moved.x),Math.round(moved.y)]);
 await work(page).getByRole('button',{name:'Ablak maximalizálása'}).click();
 await page.reload();
 await openWork(page);
 await expect(work(page).getByRole('button',{name:'Ablak visszaállítása'})).toBeVisible();
 await expect.poll(async()=>Math.round((await box()).width)).toBe(Math.round(area.width));
 await work(page).getByRole('button',{name:'Ablak visszaállítása'}).click();
 await expect.poll(async()=>Math.round((await box()).x)).toBe(Math.round(moved.x));
 // A smaller viewport clamps the remembered box.
 await page.setViewportSize({width:900,height:600});
 await page.reload();
 await openWork(page);
 await expect.poll(async()=>{const b=await box();return Math.round(b.x+b.width)<=888&&Math.round(b.y+b.height)<=588&&b.x>=12&&b.y>=12;}).toBe(true);
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('window:demo.workbench'))localStorage.removeItem(key);});
 expect(failures).toEqual([]);
});

test('phone: the command stays in the row with a 44 px target and the full-screen window has no maximize button',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:390,height:844});
 await signIn(page);
 for(const label of ['Világos','Éjjeli']){
  await page.getByRole('button',{name:'Beállítások',exact:true}).click();
  await page.getByRole('menuitem',{name:/^Téma|^(Blade|Blade Night|Világos|Éjjeli)$/}).first().click();
  await page.getByRole('menuitem',{name:label,exact:true}).click();
  await expect(page.getByRole('menuitem',{name:NAME})).toBeVisible();
  const target=await button(page).boundingBox();
  expect(target.width).toBeGreaterThanOrEqual(44);expect(target.height).toBe((await page.getByRole('menuitem',{name:/^Menü/}).boundingBox()).height);
  expect(target.x+target.width).toBeLessThanOrEqual(390);
  const {text,pill}=await colours(page);
  expect(contrast(text,pill),`${label}: ${text} on ${pill}`).toBeGreaterThanOrEqual(4.5);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await openWork(page);
 const box=await work(page).boundingBox();
 expect([Math.round(box.width),Math.round(box.height)]).toEqual([390,844]);
 await expect(work(page).getByRole('button',{name:'Ablak maximalizálása'})).toHaveCount(0);
 expect(failures).toEqual([]);
});

test('application skins keep the emphasized contrast; a reader without the attention view gets the plain command',async({page})=>{
 await page.setViewportSize({width:1366,height:768});
 await signIn(page,'skins@example.test');
 for(const [label,skin] of [['Tinta','demo-ink'],['Pala','demo-slate']]){
  await page.getByRole('button',{name:/^(Pala|Tinta)$/}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-blade-skin',skin);
  await page.mouse.move(5,700);
  const {text,pill}=await colours(page);
  expect(contrast(text,pill),`${label}: ${text} on ${pill}`).toBeGreaterThanOrEqual(4.5);
 }
 await page.context().clearCookies();
 const reader=await page.context().browser().newContext();const other=await reader.newPage();
 await other.setViewportSize({width:1366,height:768});
 await signIn(other,'reader@example.test');
 await expect(other.getByRole('menuitem',{name:'Munkaasztal',exact:true})).toBeVisible();
 await expect(command(other).locator('.blade-menu-count')).toHaveCount(0);
 await reader.close();
});

test('320 px: the row keeps the command as an icon without sideways scrolling',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await signIn(page);
 // Too narrow for the label: the icon (and the count) only, still named by the label.
 await expect(command(page)).toHaveClass(/blade-menu-command--icon/);
 await expect(page.getByRole('menuitem',{name:NAME})).toBeVisible();
 await expect(command(page).locator('.blade-menu-command__label')).toBeHidden();
 await expect(command(page).locator('.blade-menu-command__body')).toHaveAttribute('title','Munkaablak: nézetváltáskor is nyitva marad');
 await expect.poll(async()=>{const target=await button(page).boundingBox();return target.width>=44&&target.x+target.width<=320;}).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

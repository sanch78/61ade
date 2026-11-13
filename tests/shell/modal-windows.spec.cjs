const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,command}=require('./feature-demo.cjs');
// Modal windows (FB-0201, docs/toolkit.md#modal-windows) on the feature demo's `Kapcsolatok`: a record form window
// with form rows closed with `Mégse` and a viewport resize before its deferred destructor raise no page error (also
// the reported 1366 × 800 → 883 × 844 order); a modal `app.ui.window` makes the page inert, keeps Tab and Shift+Tab
// inside, hands over to a framework dialog and a stacked window and returns the focus; a non-modal one is unchanged;
// a project menu or native popover inside a modal window takes the first Escape, with or without a non-modal window.
// A fixture module hands `app` to the page; nothing is saved.
const editor=(page,label)=>page.getByRole('dialog',{name:new RegExp(' — '+label+'$')});

test('redraw: closing a form window, resizing and opening the next one raise no page error',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
 await page.setViewportSize({width:1366,height:800});
 await signIn(page,'demo@example.test','/#view=demo_contacts');
 await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
 const form=editor(page,'Hozzáadás');
 for(let round=0;round<3;round++){
  await page.setViewportSize({width:1366,height:800});
  await command(page,'Hozzáadás');await expect(form).toBeVisible();
  await form.getByRole('button',{name:'Mégse',exact:true}).click();await expect(form).toHaveCount(0);
  await page.setViewportSize({width:883,height:844});
  await command(page,'Hozzáadás');await expect(form).toBeVisible();
  await form.getByRole('button',{name:'Mégse',exact:true}).click();await expect(form).toHaveCount(0);
 }
 expect(errors).toEqual([]);
});

// A resize in the frames between the window's hide and its destructor (the race behind the intermittent error).
test('redraw race: a resize between hide and destructor raises no page error',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));
 await page.setViewportSize({width:1366,height:800});
 await signIn(page,'demo@example.test','/#view=demo_contacts');
 await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
 for(const delay of [0,1,2,3]){
  await command(page,'Hozzáadás');
  const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
  await form.getByRole('button',{name:'Mégse',exact:true}).evaluate(async (button,delay)=>{
   button.click();
   for(let i=0;i<delay;i++)await new Promise(r=>requestAnimationFrame(r));
   for(let i=0;i<4;i++){window.dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(r));}
  },delay);
  await expect(form).toHaveCount(0);
 }
 expect(errors).toEqual([]);
});

const MODULE='/modal-windows-fixture.mjs';
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
 await page.setViewportSize({width:1366,height:800});
 await signIn(page,'demo@example.test','/#view=demo_contacts');
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
 await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
}
/** Opens app.ui.window $name with two fields, a project menu button and a popover; returns nothing. */
const openWindow=(page,name,modal=true)=>page.evaluate(([name,modal])=>{
 const box=document.createElement('div');box.className='fixture-box';
 box.innerHTML=`<input aria-label="${name} A"><button type="button" class="menu-button" aria-haspopup="menu" aria-expanded="false">${name} menü</button>
  <ul role="menu" hidden class="menu"><li role="menuitem" tabindex="-1">Egy</li><li role="menuitem" tabindex="-1">Kettő</li></ul>
  <button type="button" class="pop-button">${name} popover</button><div popover class="pop"><button type="button">Benne</button></div>
  <input aria-label="${name} B">`;
 const button=box.querySelector('.menu-button'),menu=box.querySelector('.menu');
 const shut=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');button.focus();};
 button.addEventListener('click',()=>{menu.hidden=false;button.setAttribute('aria-expanded','true');menu.firstElementChild.focus();});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();shut();}});
 const pop=box.querySelector('.pop');
 box.querySelector('.pop-button').addEventListener('click',()=>pop.showPopover());
 const win=window.__bladeApp.ui.window({title:name,modal,width:420,height:320,fit:false});win.attach(box);
 (window.__wins??=[]).push(win);
},[name,modal]);
const dialog=(page,name)=>page.getByRole('dialog',{name,exact:true});
const focusIn=(page,name)=>page.evaluate(name=>!!document.activeElement?.closest(`[role="dialog"][aria-label="${name}"]`),name);

test('modal: Tab cycles inside, the page is inert, focus returns; stacked dialog and window; non-modal unchanged',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await fixture(page);
 const opener=page.locator('[data-cell-id="grid"]').getByRole('button',{name:'Hozzáadás',exact:true});
 await opener.focus();
 await openWindow(page,'Modális');
 await expect(dialog(page,'Modális')).toBeVisible();
 await expect(page.locator('#blade-application')).toHaveAttribute('inert','');
 for(let i=0;i<14;i++){await page.keyboard.press('Tab');expect(await focusIn(page,'Modális'),'Tab '+i).toBe(true);}
 for(let i=0;i<14;i++){await page.keyboard.press('Shift+Tab');expect(await focusIn(page,'Modális'),'Shift+Tab '+i).toBe(true);}
 // A framework dialog above it: contained, and the focus back in the window afterwards.
 await dialog(page,'Modális').getByLabel('Modális A').focus();
 const answer=page.evaluate(()=>window.__bladeApp.ui.dialog({message:'Biztos?',mode:'confirm'}));
 const alert=page.getByRole('alertdialog');await expect(alert).toBeVisible();
 for(let i=0;i<5;i++){await page.keyboard.press('Tab');expect(await alert.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
 await page.keyboard.press('Escape');expect(await answer).toBe(false);
 await expect(dialog(page,'Modális').getByLabel('Modális A')).toBeFocused();
 // A modal window above it: the same, and the focus back where it was in the lower one.
 await openWindow(page,'Felső');
 await expect(dialog(page,'Modális')).toHaveAttribute('inert','');
 for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await focusIn(page,'Felső')).toBe(true);}
 await page.keyboard.press('Escape');await expect(dialog(page,'Felső')).toHaveCount(0);
 await expect(dialog(page,'Modális').getByLabel('Modális A')).toBeFocused();
 await expect(dialog(page,'Modális')).not.toHaveAttribute('inert','');
 await page.keyboard.press('Escape');await expect(dialog(page,'Modális')).toHaveCount(0);
 await expect(opener).toBeFocused();
 await expect(page.locator('#blade-application')).not.toHaveAttribute('inert','');
 // Non-modal: nothing inert, Tab leaves it.
 await openWindow(page,'Nem modális',false);
 await expect(dialog(page,'Nem modális')).toBeVisible();
 await expect(page.locator('[inert]')).toHaveCount(0);
 let left=false;for(let i=0;i<12&&!left;i++){await page.keyboard.press('Tab');left=!(await focusIn(page,'Nem modális'));}
 expect(left).toBe(true);
 await page.evaluate(()=>window.__wins.at(-1).close());
 // The record form window: Tab stays inside.
 await opener.click();
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 for(let i=0;i<30;i++){await page.keyboard.press('Tab');expect(await form.evaluate(node=>node.contains(document.activeElement)),'form Tab '+i).toBe(true);}
 await page.keyboard.press('Escape');await expect(form).toHaveCount(0);
 await expect(opener).toBeFocused();
 expect(errors).toEqual([]);
});

for(const withGuide of [true,false])test(`escape: a project popup inside a modal window takes the first Escape (${withGuide?'with':'without'} a non-modal window)`,async({page})=>{
 await fixture(page);
 if(withGuide)await openWindow(page,'Háttér',false);
 await openWindow(page,'Műhely');
 const win=dialog(page,'Műhely');
 // A role="menu" that stops the key itself.
 await win.getByRole('button',{name:'Műhely menü'}).click();
 await expect(win.getByRole('menuitem',{name:'Egy'})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(win.getByRole('menu')).toBeHidden();await expect(win).toBeVisible();
 await expect(win.getByRole('button',{name:'Műhely menü'})).toBeFocused();
 // A native popover (auto): the browser closes it on Escape.
 await win.getByRole('button',{name:'Műhely popover'}).click();
 await expect(win.locator('.pop')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(win.locator('.pop')).toBeHidden();await expect(win).toBeVisible();
 await page.keyboard.press('Escape');await expect(win).toHaveCount(0);
 if(withGuide)await expect(dialog(page,'Háttér')).toBeVisible();
});

test('layers close in any order; a live region stays announced; a handled Escape keeps the window',async({page})=>{
 await fixture(page);
 const app=page.locator('#blade-application');
 await page.evaluate(()=>{const live=document.createElement('div');live.id='fixture-live';live.setAttribute('aria-live','polite');document.body.append(live);});
 // The window closes by code under an open dialog: the page stays inert until the dialog closes.
 await openWindow(page,'Alsó');
 await expect(page.locator('#fixture-live')).not.toHaveAttribute('inert','');
 const answer=page.evaluate(()=>window.__bladeApp.ui.dialog({message:'Biztos?',mode:'confirm'}));
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.evaluate(()=>window.__wins.at(-1).close());await expect(dialog(page,'Alsó')).toHaveCount(0);
 await expect(app).toHaveAttribute('inert','');
 await page.keyboard.press('Escape');expect(await answer).toBe(false);
 await expect(app).not.toHaveAttribute('inert','');
 // A window shown while a dialog is open comes above it: the dialog is inert until the window closes, then usable.
 const second=page.evaluate(()=>window.__bladeApp.ui.dialog({message:'Még?'}));
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await openWindow(page,'Fölötte');
 await expect(page.locator('.blade-dialog-overlay')).toHaveAttribute('inert','');
 await page.keyboard.press('Escape');await expect(dialog(page,'Fölötte')).toHaveCount(0);
 await expect(page.locator('.blade-dialog-overlay')).not.toHaveAttribute('inert','');
 await expect(app).toHaveAttribute('inert','');
 await page.getByRole('alertdialog').getByRole('button').first().click();await second;
 await expect(app).not.toHaveAttribute('inert','');
 await openWindow(page,'Közben');
 // An Escape a field already handled (preventDefault) leaves the window open; the next one closes it.
 await dialog(page,'Közben').getByLabel('Közben A').evaluate(input=>input.addEventListener('keydown',event=>{if(event.key==='Escape'&&input.value){event.preventDefault();input.value='';}}));
 await dialog(page,'Közben').getByLabel('Közben A').fill('keresés');
 await page.keyboard.press('Escape');
 await expect(dialog(page,'Közben')).toBeVisible();await expect(dialog(page,'Közben').getByLabel('Közben A')).toHaveValue('');
 await page.keyboard.press('Escape');await expect(dialog(page,'Közben')).toHaveCount(0);
 await expect(app).not.toHaveAttribute('inert','');
 await expect(page.locator('[inert]')).toHaveCount(0);
});

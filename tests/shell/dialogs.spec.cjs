const {test,expect}=require('../../tools/playwright-test.cjs');
// Shared confirmation dialog (MessageDialog.ts) in 3 severities, driven by the feature demo's field-free dialog_* actions.
// They confirm straight from their control and report success as a toast, not an acknowledgement dialog (FB-0056).
const VARIANTS=[['neutral','Párbeszéd: Információ (semleges)','Megerősítés','Információ'],['warning','Párbeszéd: Figyelmeztetés','Figyelmeztetés','Figyelmeztetés'],['danger','Párbeszéd: Hiba / veszély','Veszélyes művelet','Hiba']];
async function signIn(page){
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('61de-demo');
 await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 const burger=page.getByRole('menuitem',{name:'Menü',exact:true});if(await burger.isVisible())await burger.click();
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();await page.getByRole('menuitem',{name:'Feladatok',exact:true}).click();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}
async function runAction(page,label){
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name:label,exact:true}).click();}
 else await page.getByRole('button',{name:label,exact:true}).first().click();
}
async function startAction(page,label){
 await page.locator('.dhx_grid-row, .blade-grid-card__id').first().click();
 await runAction(page,label);
}
const dialog=page=>page.getByRole('alertdialog');
const toast=(page,title)=>page.getByRole('alert').filter({hasText:title+': '});
async function geometry(page){
 return dialog(page).evaluate(el=>{const r=el.getBoundingClientRect(),b=el.querySelector('.blade-dialog__footer button:last-child').getBoundingClientRect(),body=el.querySelector('.blade-dialog__body');
  return {l:r.left,t:r.top,r:innerWidth-r.right,b:innerHeight-r.bottom,btn:b.bottom<=innerHeight&&b.top>=0,scrolls:body.scrollHeight>body.clientHeight};});
}
for(const [severity,label,confirmTitle,ackTitle] of VARIANTS){
 test(`${severity}: confirm on desktop, keyboard rules, result toast`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await signIn(page);
  // Confirm: Escape cancels, nothing runs.
  await startAction(page,label);
  await expect(dialog(page)).toHaveClass(new RegExp(`blade-dialog--${severity}`));
  await expect(dialog(page).getByRole('heading',{name:confirmTitle})).toBeVisible();
  await expect(dialog(page).getByRole('img')).toHaveAttribute('aria-label',ackTitle);
  await expect(dialog(page).getByRole('button')).toHaveCount(2);
  const initial=await page.evaluate(()=>document.activeElement.dataset.bladeDialogAction);
  expect(initial).toBe(severity==='danger'?'cancel':'confirm');
  await page.screenshot({path:`tmp/dialogs/${severity}-confirm-desktop.png`});
  await page.keyboard.press('Tab');await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>!!document.activeElement.closest('.blade-dialog'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('.blade-dialog')).toHaveCount(0);
  // Focus is restored to the control that opened the dialog.
  expect(await page.evaluate(()=>document.activeElement.textContent)).toMatch(/Párbeszéd|Műveletek/);
  await expect(toast(page,ackTitle)).toHaveCount(0);
  // Danger: Enter on the initial focus is Cancel, so it must not run the action.
  if(severity==='danger'){
   await runAction(page,label);
   await expect(dialog(page)).toBeVisible();await page.keyboard.press('Enter');await expect(dialog(page)).toHaveCount(0);
   await expect(toast(page,ackTitle)).toHaveCount(0);
  }
  // Confirm runs the action; its result is a non-blocking toast, no further dialog.
  await runAction(page,label);
  expect((await dialog(page).boundingBox()).width).toBeLessThanOrEqual(480);
  await dialog(page).locator('[data-blade-dialog-action=confirm]').click();
  await expect(toast(page,ackTitle)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
 });
 test(`${severity}: narrow mobile keeps margins, scrolls and keeps actions reachable`,async({page})=>{
  await page.setViewportSize({width:320,height:480});
  await signIn(page);
  await startAction(page,label);
  let g=await geometry(page);
  for(const side of ['l','t','r','b'])expect(g[side]).toBeGreaterThanOrEqual(15.5);
  expect(g.btn).toBe(true);
  if(severity==='danger')expect(g.scrolls).toBe(true);
  await page.screenshot({path:`tmp/dialogs/${severity}-confirm-mobile.png`});
  await dialog(page).locator('[data-blade-dialog-action=confirm]').click();
  await expect(toast(page,ackTitle)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
test('existing caller: failed sign-in uses the shared danger dialog',async({page})=>{
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('wrong-password');
 await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await expect(dialog(page)).toHaveClass(/blade-dialog--danger/);
 await expect(dialog(page).getByRole('heading',{name:'Hiba',exact:true})).toBeVisible();
 await page.keyboard.press('Enter');await expect(dialog(page)).toHaveCount(0);
 await expect(page.getByLabel('Jelszó',{exact:true})).toBeFocused();
});
test('choice with "apply to all": checkbox in the focus trap, Escape cancels',async({page})=>{
 // requestChoiceAll() through the uploader's name conflict: Drive C already holds jegyzet.txt.
 await page.setViewportSize({width:1400,height:900});
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('61de-demo');
 await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 const burger=page.getByRole('menuitem',{name:'Menü',exact:true});if(await burger.isVisible())await burger.click();
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();await page.getByRole('menuitem',{name:'Fájlkezelő',exact:true}).click();
 const left=page.locator('[data-cell-id="panel-0"]');
 await left.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Drive C',exact:true}).click();
 await expect(left.getByRole('gridcell',{name:'jegyzet.txt',exact:true})).toBeVisible();
 const read=()=>page.evaluate(async()=>{
  const csrf=JSON.parse(document.getElementById('blade-config').textContent).csrf,call=async(action,id)=>(await (await fetch('?blade=1',{method:'POST',headers:{'Content-Type':'application/json','X-BLADE-CSRF':csrf},body:JSON.stringify({resource:'files',action,id,values:{}})})).json()).data;
  const root=(await call('tree','c')).root,file=(await call('list',root)).items.find(item=>item.name==='jegyzet.txt');
  return (await call('text_get',file.id)).content;
 });
 const before=await read();
 await page.getByRole('button',{name:'Feltöltés',exact:true}).click();
 const upload=page.getByRole('dialog').filter({has:page.locator('.blade-uploader')});
 await page.locator('input[data-blade-upload-input="files"]').setInputFiles([{name:'jegyzet.txt',mimeType:'text/plain',buffer:Buffer.from('nem kerül be\n')}]);
 await expect(dialog(page).getByRole('heading',{name:'Névütközés'})).toBeVisible();
 const all=dialog(page).getByRole('checkbox',{name:'Alkalmazás az összes ütközésre'});
 await expect(all).not.toBeChecked();
 // Opens on Cancel; the checkbox sits between the message and the footer and joins the Tab cycle.
 expect(await page.evaluate(()=>document.activeElement.dataset.bladeDialogAction)).toBe('cancel');
 const order=await dialog(page).evaluate(box=>[...box.children].map(node=>node.className.split(' ')[0]));
 expect(order).toEqual(['blade-dialog__header','blade-dialog__body','blade-dialog__all','blade-dialog__footer']);
 await page.keyboard.press('Shift+Tab');await expect(all).toBeFocused();
 await page.keyboard.press('Space');await expect(all).toBeChecked();
 await page.keyboard.press('Enter');await expect(dialog(page)).toBeVisible();
 await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement.dataset.bladeDialogAction)).toBe('cancel');
 for(let i=0;i<4;i++)await page.keyboard.press('Tab');
 await expect(all).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(dialog(page)).toHaveCount(0);
 await expect(upload.locator('.blade-uploader__state')).toHaveText('Kihagyva (a felhasználó döntése)');
 expect(await read()).toBe(before);
 await upload.getByRole('button',{name:'Bezárás',exact:true}).click();await expect(upload).toBeHidden();
});

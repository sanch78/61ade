const {test,expect}=require('../../tools/playwright-test.cjs');
// Shared alert/confirm dialog (MessageDialog.ts): 3 severities x acknowledge/confirm, driven by the feature demo's dialog_* actions.
const VARIANTS=[['neutral','Párbeszéd: Információ (semleges)','Megerősítés','Információ'],['warning','Párbeszéd: Figyelmeztetés','Figyelmeztetés','Figyelmeztetés'],['danger','Párbeszéd: Hiba / veszély','Veszélyes művelet','Hiba']];
async function signIn(page){
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('61de-demo');
 await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 const burger=page.getByRole('menuitem',{name:'Menü',exact:true});if(await burger.isVisible())await burger.click();
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();await page.getByRole('menuitem',{name:'Feladatok',exact:true}).click();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}
async function startAction(page,label){
 await page.locator('.dhx_grid-row, .blade-grid-card__id').first().click();
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name:label,exact:true}).click();}
 else await page.getByRole('button',{name:label,exact:true}).first().click();
 await page.locator('.dhx_form').getByRole('button',{name:label,exact:true}).last().click();
}
const dialog=page=>page.getByRole('alertdialog');
async function geometry(page){
 return dialog(page).evaluate(el=>{const r=el.getBoundingClientRect(),b=el.querySelector('.blade-dialog__footer button:last-child').getBoundingClientRect(),body=el.querySelector('.blade-dialog__body');
  return {l:r.left,t:r.top,r:innerWidth-r.right,b:innerHeight-r.bottom,btn:b.bottom<=innerHeight&&b.top>=0,scrolls:body.scrollHeight>body.clientHeight};});
}
for(const [severity,label,confirmTitle,ackTitle] of VARIANTS){
 test(`${severity}: confirm and acknowledge on desktop, keyboard rules`,async({page})=>{
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
  // Focus is restored to the control that opened the dialog (the form's submit button).
  expect(await page.evaluate(()=>document.activeElement.textContent)).toContain('Párbeszéd');
  // Danger: Enter on the initial focus is Cancel, so it must not run the action.
  if(severity==='danger'){
   await page.locator('.dhx_form').getByRole('button',{name:label,exact:true}).last().click();
   await expect(dialog(page)).toBeVisible();await page.keyboard.press('Enter');await expect(dialog(page)).toHaveCount(0);
  }
  // Confirm -> acknowledgement dialog with one OK button; Escape/Enter closes and restores focus.
  await page.locator('.dhx_form').getByRole('button',{name:label,exact:true}).last().click();
  await dialog(page).locator('[data-blade-dialog-action=confirm]').click();
  await expect(dialog(page).getByRole('heading',{name:ackTitle,exact:true})).toBeVisible();
  await expect(dialog(page)).toHaveClass(new RegExp(`blade-dialog--${severity}`));
  await expect(dialog(page)).toHaveClass(/blade-dialog--acknowledge/);
  await expect(dialog(page).getByRole('button')).toHaveCount(1);
  expect(await page.evaluate(()=>document.activeElement.dataset.bladeDialogAction)).toBe('ok');
  await page.screenshot({path:`tmp/dialogs/${severity}-ack-desktop.png`});
  expect((await dialog(page).boundingBox()).width).toBeLessThanOrEqual(480);
  await page.keyboard.press('Enter');
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
  g=await geometry(page);
  for(const side of ['l','t','r','b'])expect(g[side]).toBeGreaterThanOrEqual(15.5);
  expect(g.btn).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`tmp/dialogs/${severity}-ack-mobile.png`});
  await page.keyboard.press('Escape');await expect(dialog(page)).toHaveCount(0);
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

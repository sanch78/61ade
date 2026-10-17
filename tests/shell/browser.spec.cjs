const { test, expect } = require('../../tools/playwright-test.cjs');
async function login(page, name = 'demo', enter = false) {
    await page.goto('/');
    await page.getByLabel(/Felhasználónév/).fill(name);
    await page.getByLabel(/Jelszó/).fill('vapa-demo');
    if (enter) await page.getByLabel(/Jelszó/).press('Enter');
    else await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Kijelentkezés', exact: true })).toBeVisible();
}
test('framework creates DHTMLX login and menu, with an empty workspace', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Bejelentkezés' })).toBeVisible();
    expect(await page.locator('#vapa-config').evaluate(e => JSON.parse(e.textContent).menu)).toBeUndefined();
    await login(page, 'demo', true);
    await expect(page.locator('.vapa-workspace')).toHaveText('');
    const footer = page.locator('.vapa-session-bar');
    await expect(footer).toHaveCount(1);
    await expect(footer).toContainText('Demo User');
    await expect(footer).toContainText('VAPA keretdemó 0.1.0');
    const menuBox = await page.getByRole('menuitem', { name: 'Kijelentkezés', exact: true }).boundingBox();
    expect(menuBox.y).toBeLessThan(40);
    const userBox = await footer.getByText('Demo User', { exact: true }).boundingBox();
    const applicationBox = await footer.getByText('VAPA keretdemó 0.1.0', { exact: true }).boundingBox();
    expect(userBox.x).toBeLessThan(applicationBox.x);
    const footerBox = await footer.boundingBox();
    expect(footerBox.y + footerBox.height).toBe(page.viewportSize().height);
    for (const box of [userBox, applicationBox]) {
        expect(box.y).toBeGreaterThanOrEqual(footerBox.y);
        expect(box.y + box.height).toBeLessThanOrEqual(footerBox.y + footerBox.height);
    }
    await page.getByRole('menuitem', { name: /^Nyilvántartás/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Dokumentumok', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('menuitem', { name: 'Kijelentkezés', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Bejelentkezés' })).toBeVisible();
    expect(errors).toEqual([]);
});
test('definitions control authorization; hashes cannot open a module', async ({ page }) => {
    await login(page, 'viewer');
    await expect(page.getByRole('menuitem', { name: 'Beállítások', exact: true })).toHaveCount(0);
    await page.goto('/#members');
    await expect(page.locator('.vapa-workspace')).toHaveText('');
    const config = await page.locator('#vapa-config').textContent();
    expect(config).not.toMatch(/password_hash|can_manage|members/);
});
test('login remains a usable DHTMLX window at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const box = await page.getByRole('dialog', { name: 'Bejelentkezés' }).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await login(page);
    await page.getByRole('menuitem', { name: 'Menü', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /^Nyilvántartás/ })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole('menuitem', { name: 'Menü', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /^Nyilvántartás/ })).toBeVisible();
    await expect(page.locator('.vapa-workspace')).toHaveText('');
});
test('invalid login returns to the DHTMLX form with safe feedback', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Felhasználónév/).fill('demo');
    await page.getByLabel(/Jelszó/).fill('incorrect');
    await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Bejelentkezés' })).toBeVisible();
    await expect(page.getByText('Hibás felhasználónév vagy jelszó, illetve nem elérhető fiók.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'confirm', exact: true }).click();
    await expect(page.getByLabel(/Jelszó/)).toHaveValue('');
});

test('Skyblue is the default and explicit theme choices survive reload', async ({ page }) => {
    await login(page);
    await expect(page.locator('html')).toHaveAttribute('data-dhx-theme', 'skyblue');
    await expect(page.getByRole('button', { name: 'Skyblue', exact: true })).toBeVisible();
    const color = await page.locator('.vapa-session-bar .dhx_toolbar').evaluate(e => getComputedStyle(e).backgroundColor);
    expect(color).toBe('rgb(227, 239, 249)');
    await page.getByRole('button', { name: 'Skyblue', exact: true }).click();
    await page.getByText('Éjjeli', { exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-dhx-theme', 'dark');
    await page.getByRole('button', { name: 'Éjjeli', exact: true }).click();
    await page.getByText('Skyblue', { exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-dhx-theme', 'skyblue');
    await page.screenshot({path: require('node:path').join(process.env.VAPA_TMP_DIR || 'codex/tmp','skyblue-shell.png')});
});

test('theme button fits its menu row on hover in all skins without a white gap below',async({page})=>{
 await login(page);
 for(const [theme,label] of [['skyblue','Skyblue'],['light','Default'],['dark','Éjjeli']]){
  await page.getByRole('button',{name:/^(Skyblue|Default|Éjjeli)$/}).click();await page.getByText(label,{exact:true}).last().click();
  const button=page.getByRole('button',{name:label,exact:true});await button.hover();
  const surface=await page.getByRole('menuitem',{name:/^Nyilvántartás/}).evaluate(e=>{
   const style=getComputedStyle(e),box=e.getBoundingClientRect(),row=e.closest('.vapa-navigation-row').getBoundingClientRect();
   return {border:style.borderTopWidth,background:style.backgroundColor,image:style.backgroundImage,shadow:style.boxShadow,top:box.top,bottom:box.bottom,rowTop:row.top,rowBottom:row.bottom};
  });
  expect(surface.border).toBe('1px');expect(surface.background).not.toBe('rgba(0, 0, 0, 0)');expect(surface.shadow).not.toBe('none');
  expect(surface.top).toBeGreaterThanOrEqual(surface.rowTop);expect(surface.bottom).toBeLessThanOrEqual(surface.rowBottom);
  if(theme==='skyblue')expect(surface.image).toContain('linear-gradient');
  const separator=page.locator('.vapa-navigation-row [role="separator"]');
  const separatorBox=await separator.boundingBox();expect(separatorBox.width).toBe(1);expect(separatorBox.height).toBeGreaterThan(12);
  expect(await separator.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  const bounds=await button.evaluate(element=>{
   const row=element.closest('.vapa-navigation-row'),outer=row.getBoundingClientRect(),button=element.getBoundingClientRect(),menu=row.querySelector('.dhx_menu-nav').getBoundingClientRect();
   return {top:outer.top,bottom:outer.bottom,buttonTop:button.top,buttonBottom:button.bottom,menuBottom:menu.bottom,border:parseFloat(getComputedStyle(row).borderBottomWidth)};
  });
  expect(bounds.buttonTop).toBeGreaterThanOrEqual(bounds.top);expect(bounds.buttonBottom).toBeLessThanOrEqual(bounds.bottom);expect(bounds.menuBottom).toBe(bounds.bottom-bounds.border);
  await page.screenshot({path:require('node:path').join(process.env.VAPA_TMP_DIR,'shell-hover-'+theme+'.png')});
 }
});

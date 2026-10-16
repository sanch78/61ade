const { test, expect } = require('@playwright/test');
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

const {test, expect} = require('../../tools/playwright-test.cjs');
const path = require('node:path');
const {signIn, command, api} = require('./feature-demo.cjs');
// Feature demo: twofactor@example.test signs in with password + e-mailed code (English account
// language); the code is read from the demo mailbox (/mailbox/), the remember cookie is <session>_remember.
const ACCOUNT = 'twofactor@example.test', COOKIE = 'blade_demo_remember';
async function code(context) {
  const mailbox = await context.newPage(); await mailbox.goto('/mailbox/');
  const text = await mailbox.frameLocator('iframe').locator('body').innerText(); await mailbox.close();
  return text.match(/\b\d{6}\b/)[0];
}
async function password(page, remember = false) {
  // A context that already signed in this English-default account shows an English login form.
  await page.goto('/');
  await page.getByLabel(/^(E-mail|Email)$/).fill(ACCOUNT);
  await page.getByLabel(/^(Jelszó|Password)$/).fill('61de-demo');
  if (remember) {
    await page.getByText('Bejelentkezve maradok (90 nap)', {exact: true}).click();
    await expect(page.getByRole('checkbox', {name: /Bejelentkezve maradok \(90 nap\)/})).toBeChecked();
    await page.getByLabel('Jelszó', {exact: true}).press('Enter');
  } else await page.getByRole('button', {name: /^(Bejelentkezés|Sign in)$/}).click();
}
async function confirm(page) {
  await expect(page.getByRole('dialog', {name: 'E-mailes megerősítés', exact: true})).toBeVisible();
  await page.getByLabel('Megerősítő kód', {exact: true}).fill(await code(page.context()));
  await page.getByLabel('Megerősítő kód', {exact: true}).press('Enter');
  await expect(page.getByRole('menuitem', {name: 'Sign out', exact: true})).toBeVisible();
}
const signedOut = page => expect(page.locator('input[type="password"]')).toBeVisible();

test.describe.configure({mode: 'serial'});
test('e-mail confirmation gates login; a remembered login lasts 90 days and survives a new browser session', async ({page, browser}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await password(page, true);
  await expect(page.getByLabel('Megerősítő kód', {exact: true})).toBeVisible();
  await expect(page.getByRole('menuitem', {name: 'Sign out', exact: true})).toHaveCount(0);
  expect((await page.request.post('/?blade=1', {data: {resource: 'notes', action: 'list'}})).status()).toBe(401);
  expect((await page.request.post('/', {form: {action: 'confirm_login', csrf: 'invalid', code: '000000'}})).status()).toBe(403);
  await page.getByLabel('Megerősítő kód', {exact: true}).fill('000000');
  await page.getByRole('button', {name: 'Belépés megerősítése', exact: true}).click();
  await expect(page.getByText('Hibás vagy lejárt megerősítő kód.', {exact: true})).toBeVisible();
  await page.locator('[data-blade-dialog-action=ok]').click();
  await confirm(page);
  const credential = (await page.context().cookies()).find(cookie => cookie.name === COOKIE);
  expect(credential).toBeTruthy(); expect(credential.httpOnly).toBe(true); expect(credential.sameSite).toBe('Lax');
  expect(Math.abs(credential.expires - Date.now() / 1000 - 90 * 86400)).toBeLessThan(10);

  const restored = await browser.newContext({baseURL: test.info().project.use.baseURL});
  await restored.addCookies([credential]);
  // A restored session starts in the site default language (account default applies to explicit logins only).
  const next = await restored.newPage(); await next.goto('/');
  await expect(next.getByRole('menuitem', {name: 'Kijelentkezés', exact: true})).toBeVisible();
  const rotated = (await restored.cookies()).find(cookie => cookie.name === COOKIE);
  expect(rotated.value).not.toBe(credential.value);
  expect(Math.abs(rotated.expires - credential.expires)).toBeLessThan(2);
  await next.getByRole('menuitem', {name: 'Kijelentkezés', exact: true}).click();
  await signedOut(next);
  expect((await restored.cookies()).some(cookie => cookie.name === COOKIE)).toBe(false);
  // Signing out revokes the stored credential: replaying it opens the login form.
  await restored.addCookies([rotated]); await next.goto('/');
  await signedOut(next);
  await restored.close(); expect(errors).toEqual([]);
});

// Each code request counts toward the per-account limit (5 per 10 minutes), so one sign-in
// covers both the confirmation window layout and the login without a stored credential.
test('without remember: the confirmation actions stay inside the login window in all themes and no credential is stored', async ({page}) => {
  await password(page);
  const dialog = page.getByRole('dialog', {name: 'E-mailes megerősítés', exact: true}); await expect(dialog).toBeVisible();
  for (const theme of ['skyblue', 'light', 'dark']) {
    await page.evaluate(theme => {document.documentElement.setAttribute('data-dhx-theme', theme); dispatchEvent(new Event('resize'));}, theme);
    await expect.poll(async () => {const outer = await dialog.boundingBox(), button = await dialog.getByRole('button', {name: 'Vissza a belépéshez', exact: true}).boundingBox(); return Math.abs(outer.y + outer.height - button.y - button.height - 24);}).toBeLessThanOrEqual(2);
    const outer = await dialog.boundingBox(); let previousBottom = 0;
    for (const name of ['Belépés megerősítése', 'Új kód küldése', 'Vissza a belépéshez']) {
      const button = dialog.getByRole('button', {name, exact: true}); await expect(button).toHaveClass(/dhx_button--view_flat/); await button.hover(); const bounds = await button.boundingBox();
      expect(await button.evaluate(e => {const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.bottom - 2));})).toBe(true);
      if (previousBottom) expect(bounds.y - previousBottom).toBeGreaterThanOrEqual(8); previousBottom = bounds.y + bounds.height;
      expect(bounds.x).toBeGreaterThanOrEqual(outer.x); expect(bounds.x + bounds.width).toBeLessThanOrEqual(outer.x + outer.width); expect(bounds.y + bounds.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
    await page.screenshot({path: path.join(process.env.BLADE_TMP_DIR, 'confirmation-' + theme + '.png')});
  }
  await confirm(page);
  expect((await page.context().cookies()).some(cookie => cookie.name === COOKIE)).toBe(false);
});

test('per-user e-mail confirmation is an account switch that affects only the selected account', async ({page, browser}) => {
  await signIn(page);
  await page.getByRole('menuitem', {name: 'Adminisztráció', exact: true}).click();
  await page.getByRole('menuitem', {name: 'Felhasználók', exact: true}).click();
  const filters = page.locator('[data-cell-id="filter"]');
  await filters.getByLabel('E-mail', {exact: true}).fill(ACCOUNT);
  await filters.getByRole('button', {name: 'Szűrés', exact: true}).click();
  await page.locator('.dhx_grid-cell', {hasText: ACCOUNT}).click();
  const dialog = page.getByRole('dialog'), setting = dialog.getByRole('checkbox', {name: 'E-mailes megerősítés', exact: true});
  async function switchTo(on) {
    await command(page, 'Módosítás');
    await expect(setting).toBeChecked({checked: !on});
    await setting.locator('xpath=..').locator('.dhx_checkbox__visual-input').click();
    await expect(setting).toBeChecked({checked: on});
    await dialog.getByRole('button', {name: 'Mentés', exact: true}).click();
    await expect(page.getByText('A művelet sikerült.', {exact: true}).first()).toBeVisible();
  }
  const other = await browser.newContext({baseURL: test.info().project.use.baseURL}); const otherPage = await other.newPage();
  restoreConfirmation = true;
  await switchTo(false);
  await password(otherPage);
  await expect(otherPage.getByRole('menuitem', {name: 'Sign out', exact: true})).toBeVisible();
  await switchTo(true);
  await otherPage.reload(); await signedOut(otherPage);
  await password(otherPage);
  await expect(otherPage.getByLabel(/^(Megerősítő kód|Verification code)$/)).toBeVisible();
  await otherPage.getByRole('button', {name: /^(Vissza a belépéshez|Back to sign-in)$/}).click();
  await signedOut(otherPage);
  await other.close();
});
// The demo account must keep its e-mail confirmation even if the test above failed midway.
let restoreConfirmation = false;
test.afterEach(async ({page}) => {
  if (!restoreConfirmation) return;
  restoreConfirmation = false;
  const id = '4', form = await api(page, 'blade_users', '__form', id, {operation: 'update'});
  if (String(form.body.data?.values?.blade_email_confirmation) !== '1')
    await api(page, 'blade_users', '__edit', id, {field: 'blade_email_confirmation', value: '1', revision: form.body.data.values.revision});
});

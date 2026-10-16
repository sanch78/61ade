const {test, expect} = require('@playwright/test');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const messageFile = path.resolve(__dirname, '../../codex/tmp/auth-fixture/last-email.eml');
function code() {
  const message = readFileSync(messageFile, 'utf8').replace(/=\r?\n/g, '');
  const match = message.match(/>([0-9]{6})<\/p>/);
  if (!match) throw new Error('Synthetic SMTP message has no code');
  return match[1];
}
async function password(page, user = 'demo', remember = false) {
  await page.goto('/');
  await page.getByLabel('Felhasználónév', {exact: true}).fill(user);
  await page.getByLabel('Jelszó', {exact: true}).fill('demo-password-123');
  if (remember) {
    await page.getByText('Bejelentkezve maradok (90 nap)', {exact: true}).click();
    await expect(page.getByRole('checkbox', {name: /Bejelentkezve maradok \(90 nap\)/})).toBeChecked();
  }
  if (remember) await page.getByLabel('Jelszó', {exact: true}).press('Enter');
  else await page.getByRole('button', {name: 'Bejelentkezés', exact: true}).click();
}
async function confirm(page) {
  await expect(page.getByRole('dialog', {name: 'E-mailes megerősítés', exact: true})).toBeVisible();
  await page.getByLabel('Megerősítő kód', {exact: true}).fill(code());
  await page.getByLabel('Megerősítő kód', {exact: true}).press('Enter');
  await expect(page.getByRole('menuitem', {name: 'Notes', exact: true})).toBeVisible();
}

test.describe.configure({mode: 'serial'});
test('SMTP email confirmation gates login; a remembered login lasts 90 days and survives a new browser session', async ({page, browser}) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await password(page, 'demo', true);
  await expect(page.getByLabel('Megerősítő kód', {exact: true})).toBeVisible();
  await expect(page.getByRole('menuitem', {name: 'Notes', exact: true})).toHaveCount(0);
  const raw = await page.request.post('/?vapa=1', {data: {resource: 'notes', action: 'list'}});
  expect(raw.status()).toBe(401);
  const csrfDenied = await page.request.post('/', {form: {action: 'confirm_login', csrf: 'invalid', code: code()}});
  expect(csrfDenied.status()).toBe(403);
  await page.getByLabel('Megerősítő kód', {exact: true}).fill('000000');
  await page.getByRole('button', {name: 'Belépés megerősítése', exact: true}).click();
  await expect(page.getByText('Hibás vagy lejárt megerősítő kód.', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'confirm', exact: true}).click();
  await confirm(page);
  const credential = (await page.context().cookies()).find(cookie => cookie.name === 'vapa_auth_test_remember');
  expect(credential).toBeTruthy(); expect(credential.httpOnly).toBe(true); expect(credential.sameSite).toBe('Lax');
  expect(Math.abs(credential.expires - Date.now() / 1000 - 90 * 86400)).toBeLessThan(10);
  const mail = readFileSync(messageFile, 'utf8');
  expect(mail).toContain('Subject: Synthetic sign-in');
  expect(mail).toContain('Synthetic custom heading');
  expect(mail).toContain('multipart/alternative');

  const restored = await browser.newContext();
  await restored.addCookies([credential]);
  const next = await restored.newPage(); await next.goto('http://127.0.0.1:8090/');
  await expect(next.getByRole('menuitem', {name: 'Notes', exact: true})).toBeVisible();
  const rotated = (await restored.cookies()).find(cookie => cookie.name === credential.name);
  expect(rotated.value).not.toBe(credential.value);
  expect(Math.abs(rotated.expires - credential.expires)).toBeLessThan(2);
  expect(readFileSync(messageFile, 'utf8')).toBe(mail);
  await next.getByRole('menuitem', {name: 'Kijelentkezés', exact: true}).click();
  await expect(next.getByLabel('Jelszó', {exact: true})).toBeVisible();
  expect((await restored.cookies()).some(cookie => cookie.name === credential.name)).toBe(false);
  await restored.addCookies([rotated]); await next.goto('http://127.0.0.1:8090/');
  await expect(next.getByLabel('Jelszó', {exact: true})).toBeVisible();
  await restored.close(); expect(errors).toEqual([]);
});

test('without remember the confirmed login has no persistent credential', async ({page}) => {
  await password(page); await confirm(page);
  expect((await page.context().cookies()).some(cookie => cookie.name === 'vapa_auth_test_remember')).toBe(false);
});

test('per-user security form defaults on and toggles only the selected account', async ({page, browser}) => {
  await password(page); await confirm(page);
  await page.getByRole('menuitem', {name: 'Members', exact: true}).click();
  await page.getByText('Synthetic Other', {exact: true}).click();
  await page.getByRole('button', {name: 'Login security', exact: true}).click();
  const dialog = page.getByRole('dialog');
  const setting = dialog.getByRole('combobox', {name: 'Email confirmation', exact: false});
  await expect(setting).toHaveValue('1');
  await setting.selectOption('0');
  await dialog.getByRole('button', {name: 'Login security', exact: true}).click();
  await expect(page.getByText('A művelet sikerült.', {exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'confirm', exact: true}).click();
  const other = await browser.newContext(); const otherPage = await other.newPage();
  await password(otherPage, 'other');
  await expect(otherPage.getByRole('menuitem', {name: 'Notes', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Login security', exact: true}).click();
  await expect(setting).toHaveValue('0'); await setting.selectOption('1');
  await dialog.getByRole('button', {name: 'Login security', exact: true}).click();
  await expect(page.getByText('A művelet sikerült.', {exact: true})).toBeVisible();
  await otherPage.reload(); await expect(otherPage.getByLabel('Jelszó', {exact: true})).toBeVisible();
  await password(otherPage, 'other');
  await expect(otherPage.getByLabel('Megerősítő kód', {exact: true})).toBeVisible();
  await otherPage.getByRole('button', {name: 'Vissza a belépéshez', exact: true}).click();
  await expect(otherPage.getByLabel('Jelszó', {exact: true})).toBeVisible();
  await other.close();
});

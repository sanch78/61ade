const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// Sign-in branding (FB-0087, FB-0088, docs/shell.md#sign-in-branding): the 61ade product logo (docs/brand.md) inlined
// by the shell in all three demos; the feature demo keeps it with placement "both" and adds its sign-in stylesheet,
// notice and mailbox link, and its sign-in module in the footer slot; the starter admin and the tenant demo declare
// nothing. Logo::none() and a declared logo are covered by tests/shell/toolkit.php.
const WIDE={width:1280,height:900};
const logo=scope=>scope.getByRole('img',{name:'blade',exact:true});
const topLogo=page=>page.locator('.blade-navigation-row .blade-logo');
// Variants (light/dark) of the logo images the theme shows (the other one is display: none).
const shown=scope=>scope.locator('.blade-logo__image').evaluateAll(images=>images.filter(image=>getComputedStyle(image).display!=='none').map(image=>image.classList.contains('blade-logo__image--dark')?'dark':'light'));
// Every inlined copy has its own gradient ids.
const uniqueIds=page=>page.evaluate(()=>{const ids=[...document.querySelectorAll('.blade-logo [id]')].map(element=>element.id);return ids.length>0&&new Set(ids).size===ids.length;});
const hue=page=>page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--dhx-h-primary').trim());
const html=page=>page.locator('html');
const footer=dialog=>dialog.locator('[data-blade-slot="footer"] .demo-sign-in-footer');
const NOTICE='Szintetikus demó: a fiókok és az adatok kitaláltak.';
const selector=page=>page.locator('.blade-navigation-row').getByRole('button',{name:/^(Skyblue|Világos|Éjjeli|Pala|Tinta)$/});
async function theme(page,label){await selector(page).click();await page.getByRole('menuitem',{name:label,exact:true}).click();}
async function signedIn(page,email){
 await signIn(page,email);
 await expect(page.getByRole('dialog',{name:'Bejelentkezés'})).toHaveCount(0);
 await expect(html(page)).toHaveAttribute('data-blade-page','shell');
}

test('the sign-in window shows the logo once with the sign-in stylesheet, per theme',async({page})=>{
 await page.setViewportSize(WIDE);
 await page.goto('/');
 await expect(html(page)).toHaveAttribute('data-blade-page','sign-in');
 const dialog=page.getByRole('dialog',{name:'Bejelentkezés'});
 await expect(logo(dialog)).toBeVisible();
 // Placement "both": the window's copy is the named one, the top row's is hidden from assistive technology.
 await expect(logo(page)).toHaveCount(1);
 await expect(topLogo(page)).toBeVisible();
 await expect(topLogo(page)).toHaveAttribute('aria-hidden','true');
 expect(await shown(dialog)).toEqual(['light']);
 // Inline SVG with every part addressable (docs/brand.md), no image request, ids unique across both copies.
 for(const part of ['.blade-logo__mark','.blade-logo__tile--1','.blade-logo__tile--2','.blade-logo__tile--3','.blade-logo__word','.blade-logo__glyph--b','.blade-logo__glyph--e'])
  await expect(dialog.locator('svg.blade-logo__image--light '+part)).toHaveCount(1);
 await expect(page.locator('.blade-logo img')).toHaveCount(0);
 expect(await uniqueIds(page)).toBe(true);
 // The sign-in stylesheet: linked once with its file key after admin.css, applied through the documented hooks only.
 await expect(page.locator('link[href*="branding/sign-in.css?v="]')).toHaveCount(1);
 expect(await page.evaluate(()=>{const links=[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href'));return links.findIndex(href=>href.includes('branding/sign-in.css'))>links.findIndex(href=>href.includes('admin.css'));})).toBe(true);
 expect(await hue(page)).toBe('160');
 const size=await dialog.locator('.blade-logo__image--light').evaluate(image=>{const box=image.getBoundingClientRect();return [box.height,Math.round(box.width)];});
 expect(size).toEqual([40,Math.round(40*1405/370)]);
 await expect(page.locator('link[href*="app/demo.css"]')).toHaveCount(0);
 // The form stays whole below the logo: the button fits inside the window.
 const windowBox=await dialog.boundingBox(),button=await dialog.getByRole('button',{name:'Bejelentkezés',exact:true}).boundingBox();
 expect(button.y+button.height).toBeLessThanOrEqual(windowBox.y+windowBox.height);
 // Notice and link below the form, inside the window; the sign-in module's line in the footer slot.
 await expect(dialog.getByText(NOTICE,{exact:true})).toBeVisible();
 const link=dialog.getByRole('navigation',{name:'Hivatkozások'}).getByRole('link',{name:'Demó postafiók',exact:true});
 await expect(link).toHaveAttribute('href','mailbox/');
 await expect(footer(dialog)).toHaveText('Demó bejelentkezési modul · téma: skyblue');
 for(const element of [dialog.getByText(NOTICE,{exact:true}),link,footer(dialog)]){
  const box=await element.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(button.y+button.height);
  expect(box.y+box.height).toBeLessThanOrEqual(windowBox.y+windowBox.height);
 }
 // The restricted API: no transport, CSRF token or identity reaches the module (it only sees what it is given).
 await expect(page.locator('script[src*="branding/sign-in.js"]')).toHaveCount(0);
 expect(await page.locator('#blade-config').evaluate(element=>{const config=JSON.parse(element.textContent);return [config.signInModules?.length,config.modules,config.csrf];})).toEqual([1,undefined,undefined]);
 // The link is keyboard reachable and opens the demo mailbox.
 await link.focus();
 await expect(link).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/\/mailbox\/$/);
 await page.goBack();
 await expect(logo(dialog)).toBeVisible();
 // The dark theme shows the dark image; the module reads the theme.
 await page.evaluate(()=>localStorage.setItem('blade-theme','dark'));
 await page.reload();
 await expect(html(page)).toHaveAttribute('data-dhx-theme','dark');
 await expect(logo(dialog)).toBeVisible();
 expect(await shown(dialog)).toEqual(['dark']);
 expect(await shown(topLogo(page))).toEqual(['dark']);
 expect(await hue(page)).toBe('160');
 await expect(footer(dialog)).toHaveText('Demó bejelentkezési modul · téma: dark');
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
});

test('a failing sign-in module never blocks the sign-in',async({page})=>{
 await page.setViewportSize(WIDE);
 const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('**/branding/sign-in.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:'export default () => { throw new Error("synthetic"); };'}));
 await page.goto('/');
 const dialog=page.getByRole('dialog',{name:'Bejelentkezés'});
 await expect(logo(dialog)).toBeVisible();
 await expect.poll(()=>errors.some(text=>text.includes('sign-in module'))).toBe(true);
 await expect(footer(dialog)).toHaveCount(0);
 await signedIn(page,'demo@example.test');
});

test('after sign-in the logo closes the top row and follows the theme; no sign-in stylesheet',async({page})=>{
 await page.setViewportSize(WIDE);
 await signedIn(page,'demo@example.test');
 await expect(page.locator('link[href*="branding/sign-in.css"]')).toHaveCount(0);
 expect(await hue(page)).not.toBe('160');
 await expect(page.getByText(NOTICE,{exact:true})).toHaveCount(0);
 await expect(page.locator('[data-blade-slot]')).toHaveCount(0);
 expect(await page.locator('#blade-config').evaluate(element=>{const config=JSON.parse(element.textContent);return [config.signIn,config.signInModules];})).toEqual([undefined,undefined]);
 await expect(topLogo(page)).toBeVisible();
 await expect(topLogo(page)).toHaveAttribute('role','img');
 await expect(logo(page)).toHaveCount(1);
 const box=await topLogo(page).boundingBox();
 expect(box.x+box.width).toBeGreaterThanOrEqual(WIDE.width-2);
 expect(await shown(topLogo(page))).toEqual(['light']);
 await theme(page,'Éjjeli');
 await expect(html(page)).toHaveAttribute('data-dhx-theme','dark');
 expect(await shown(topLogo(page))).toEqual(['dark']);
 await theme(page,'Világos');
 expect(await shown(topLogo(page))).toEqual(['light']);
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
});

test('a dark-based skin shows the dark image',async({page})=>{
 await page.setViewportSize(WIDE);
 await signedIn(page,'skins@example.test');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-slate');
 expect(await shown(topLogo(page))).toEqual(['light']);
 await theme(page,'Tinta');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-ink');
 expect(await shown(topLogo(page))).toEqual(['dark']);
 await page.evaluate(()=>localStorage.removeItem('blade-skin'));
});

test('phone width: the sign-in logo fits; the top row gives the room to Menü and the selectors',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const dialog=page.getByRole('dialog',{name:'Bejelentkezés'});
 await expect(logo(dialog)).toBeVisible();
 const windowBox=await dialog.boundingBox(),logoBox=await logo(dialog).boundingBox();
 expect(logoBox.x).toBeGreaterThanOrEqual(windowBox.x);
 expect(logoBox.x+logoBox.width).toBeLessThanOrEqual(windowBox.x+windowBox.width);
 // The window fits the phone with the notice, link and footer line; the top row has no room for its copy.
 await expect(footer(dialog)).toBeVisible();
 expect(windowBox.y+windowBox.height).toBeLessThanOrEqual(844);
 await expect(topLogo(page)).toBeHidden();
 await signedIn(page,'demo@example.test');
 // The feature demo's row holds Menü, the language and the theme selector: no room for the logo at 390 px.
 await expect(page.getByRole('menuitem',{name:'Menü',exact:true})).toBeVisible();
 await expect(topLogo(page)).toBeHidden();
 await page.setViewportSize(WIDE);
 await expect(topLogo(page)).toBeVisible();
});

test('the starter admin and the tenant demo show the product logo without declaring it',async({page})=>{
 await page.setViewportSize(WIDE);
 for(const path of ['/admin/','/tenants/']){
  await page.goto(path);
  await expect(html(page)).toHaveAttribute('data-blade-page','sign-in');
  // Default placement "window": the window's copy only, named "blade", following the theme.
  const dialog=page.getByRole('dialog',{name:'Bejelentkezés'});
  await expect(logo(dialog)).toBeVisible();
  await expect(topLogo(page)).toHaveCount(0);
  expect(await shown(dialog)).toEqual(['light']);
  await expect(page.locator('link[href*="branding/"]')).toHaveCount(0);
  await expect(page.locator('.blade-sign-in-info, [data-blade-slot]')).toHaveCount(0);
  expect(await page.locator('#blade-config').evaluate(element=>{const config=JSON.parse(element.textContent);return [config.logo,config.signIn,config.signInModules];})).toEqual([{label:'blade',placement:'window'},undefined,undefined]);
  await signIn(page,'demo@example.test',path);
  await expect(dialog).toHaveCount(0);
  await expect(html(page)).toHaveAttribute('data-blade-page','shell');
  // The short menus leave room at the end of the row (separate sessions per path, so no sign-out is needed).
  await expect(topLogo(page)).toBeVisible();
  await expect(topLogo(page)).toHaveAttribute('role','img');
  await expect(logo(page)).toHaveCount(1);
 }
});

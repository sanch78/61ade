const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// Sign-in branding (FB-0087, docs/shell.md#sign-in-branding): the feature demo's synthetic logo (light and dark image,
// placement "both"), its sign-in stylesheet, notice and mailbox link, and its sign-in module in the footer slot; the
// starter admin declares none of them.
const WIDE={width:1280,height:900};
const logo=scope=>scope.getByRole('img',{name:'61ade feature demó',exact:true});
const topLogo=page=>page.locator('.blade-navigation-row .blade-logo');
// Paths of the logo images the theme shows (the other one is display: none).
const shown=scope=>scope.locator('img.blade-logo__image').evaluateAll(images=>images.filter(image=>getComputedStyle(image).display!=='none').map(image=>new URL(image.src).pathname));
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
 expect(await shown(dialog)).toEqual(['/branding/logo.svg']);
 expect(await dialog.locator('img.blade-logo__image--light').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 // The sign-in stylesheet: linked once with its file key after admin.css, applied through the documented hooks only.
 await expect(page.locator('link[href*="branding/sign-in.css?v="]')).toHaveCount(1);
 expect(await page.evaluate(()=>{const links=[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href'));return links.findIndex(href=>href.includes('branding/sign-in.css'))>links.findIndex(href=>href.includes('admin.css'));})).toBe(true);
 expect(await hue(page)).toBe('160');
 expect(await dialog.locator('img.blade-logo__image--light').evaluate(image=>image.getBoundingClientRect().height)).toBe(40);
 await expect(page.locator('link[href*="app/demo.css"]')).toHaveCount(0);
 // The form stays whole below the logo: the button fits inside the window.
 const windowBox=await dialog.boundingBox(),button=await dialog.getByRole('button',{name:'Bejelentkezés',exact:true}).boundingBox();
 expect(button.y+button.height).toBeLessThanOrEqual(windowBox.y+windowBox.height);
 const last=await dialog.getByRole('button',{name:'Belépés külső fiókkal',exact:true}).boundingBox();
 expect(Math.abs(windowBox.y+windowBox.height-last.y-last.height-24)).toBeLessThanOrEqual(2);
 // Notice, link and the sign-in module's footer line sit below the fields and above the actions, which stay at the
 // window bottom (24 px below the last action, as authentication.spec.cjs checks for the confirmation window).
 await expect(dialog.getByText(NOTICE,{exact:true})).toBeVisible();
 const link=dialog.getByRole('navigation',{name:'Hivatkozások'}).getByRole('link',{name:'Demó postafiók',exact:true});
 await expect(link).toHaveAttribute('href','mailbox/');
 await expect(footer(dialog)).toHaveText('Demó bejelentkezési modul · téma: skyblue');
 for(const element of [dialog.getByText(NOTICE,{exact:true}),link,footer(dialog)]){
  const box=await element.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(windowBox.y);
  expect(box.y+box.height).toBeLessThanOrEqual(button.y);
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
 expect(await shown(dialog)).toEqual(['/branding/logo-dark.svg']);
 expect(await shown(topLogo(page))).toEqual(['/branding/logo-dark.svg']);
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
 expect(await shown(topLogo(page))).toEqual(['/branding/logo.svg']);
 await theme(page,'Éjjeli');
 await expect(html(page)).toHaveAttribute('data-dhx-theme','dark');
 expect(await shown(topLogo(page))).toEqual(['/branding/logo-dark.svg']);
 await theme(page,'Világos');
 expect(await shown(topLogo(page))).toEqual(['/branding/logo.svg']);
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
});

test('a dark-based skin shows the dark image',async({page})=>{
 await page.setViewportSize(WIDE);
 await signedIn(page,'skins@example.test');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-slate');
 expect(await shown(topLogo(page))).toEqual(['/branding/logo.svg']);
 await theme(page,'Tinta');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-ink');
 expect(await shown(topLogo(page))).toEqual(['/branding/logo-dark.svg']);
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

test('the starter admin has no logo and no sign-in stylesheet',async({page})=>{
 await page.setViewportSize(WIDE);
 await page.goto('/admin/');
 await expect(html(page)).toHaveAttribute('data-blade-page','sign-in');
 await expect(page.locator('.blade-logo')).toHaveCount(0);
 await expect(page.locator('link[href*="branding/"]')).toHaveCount(0);
 await expect(page.locator('.blade-sign-in-info, [data-blade-slot]')).toHaveCount(0);
 expect(await page.locator('#blade-config').evaluate(element=>{const config=JSON.parse(element.textContent);return [config.logo,config.signIn,config.signInModules];})).toEqual([undefined,undefined,undefined]);
 await signIn(page,'demo@example.test','/admin/');
 await expect(page.getByRole('dialog',{name:'Bejelentkezés'})).toHaveCount(0);
 await expect(html(page)).toHaveAttribute('data-blade-page','shell');
 await expect(page.locator('.blade-logo')).toHaveCount(0);
});

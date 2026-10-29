const {test,expect}=require('../../tools/playwright-test.cjs');
// Optional application skins (FB-0072): skin@ has one (light base), skins@ two (light and dark base), demo@ none.
const WIDE={width:1600,height:900};
async function login(page,email){
 await page.setViewportSize(WIDE);
 await page.goto('/');
 await page.getByLabel('E-mail',{exact:true}).fill(email);
 await page.getByLabel(/Jelszó/).fill('61ade-demo');
 await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toHaveCount(0);
}
const LABELS=/^(Skyblue|Világos|Éjjeli|Pala|Tinta)$/;
const stored=(page,key)=>page.evaluate(key=>localStorage.getItem(key),key);
const toolbar=page=>page.locator('.blade-session-bar .dhx_toolbar').evaluate(e=>getComputedStyle(e).backgroundColor);
const selector=page=>page.locator('.blade-navigation-row').getByRole('button',{name:LABELS});
const html=page=>page.locator('html');

test('one skin applies over its base without a selector and leaves the factory choice alone',async({page})=>{
 await page.goto('/');
 await expect(page.locator('link[href*="skins/"]')).toHaveCount(0);
 await page.evaluate(()=>{localStorage.setItem('blade-theme','dark');localStorage.removeItem('blade-skin');});
 await login(page,'skin@example.test');
 await expect(html(page)).toHaveAttribute('data-dhx-theme','light');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-slate');
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--dhx-s-toolbar-background').trim())).toBe('#e4e7eb');
 expect(await toolbar(page)).toBe('rgb(228, 231, 235)');
 await expect(selector(page)).toHaveCount(0);
 expect(await stored(page,'blade-theme')).toBe('dark');
 expect(await stored(page,'blade-skin')).toBeNull();
 // Signing out returns to the factory appearance and the stored factory theme.
 await page.getByRole('menuitem',{name:'Kijelentkezés',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Bejelentkezés'})).toBeVisible();
 await expect(html(page)).toHaveAttribute('data-dhx-theme','dark');
 await expect(html(page)).not.toHaveAttribute('data-blade-skin',/./);
 await expect(page.locator('link[href*="skins/"]')).toHaveCount(0);
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
});

test('several skins: the selector lists only them, a dark-based skin brings the dark rules, the choice survives reload',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{localStorage.setItem('blade-theme','light');localStorage.setItem('blade-skin','unknown');});
 await login(page,'skins@example.test');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-slate');
 await expect(selector(page)).toHaveText('Pala');
 await selector(page).click();
 await expect(page.getByRole('menuitem').filter({hasText:LABELS})).toHaveText(['Pala','Tinta']);
 await page.getByRole('menuitem',{name:'Tinta',exact:true}).click();
 await expect(html(page)).toHaveAttribute('data-dhx-theme','dark');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-ink');
 await page.reload();
 await expect(html(page)).toHaveAttribute('data-dhx-theme','dark');
 await expect(html(page)).toHaveAttribute('data-blade-skin','demo-ink');
 await expect(selector(page)).toHaveText('Tinta');
 // The skin's own variable wins; an unset one comes from the Suite dark theme, not the light default.
 expect(await toolbar(page)).toBe('rgb(37, 43, 50)');
 const dark=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--dhx-font-color-primary').trim());
 await page.evaluate(()=>document.documentElement.setAttribute('data-dhx-theme','light'));
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--dhx-font-color-primary').trim())).not.toBe(dark);
 expect(await stored(page,'blade-skin')).toBe('demo-ink');
 expect(await stored(page,'blade-theme')).toBe('light');
 await page.evaluate(()=>{localStorage.removeItem('blade-theme');localStorage.removeItem('blade-skin');});
});

test('an unskinned user keeps the factory themes and switching',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{localStorage.removeItem('blade-theme');localStorage.setItem('blade-skin','demo-ink');});
 await login(page,'demo@example.test');
 await expect(html(page)).toHaveAttribute('data-dhx-theme','skyblue');
 await expect(html(page)).not.toHaveAttribute('data-blade-skin',/./);
 await expect(page.locator('link[href*="skins/"]')).toHaveCount(0);
 expect(await page.locator('#blade-config').evaluate(e=>JSON.parse(e.textContent).skins)).toBeUndefined();
 await selector(page).click();
 await expect(page.getByRole('menuitem').filter({hasText:LABELS})).toHaveText(['Skyblue','Világos','Éjjeli']);
 await page.getByRole('menuitem',{name:'Világos',exact:true}).click();
 await expect(html(page)).toHaveAttribute('data-dhx-theme','light');
 expect(await stored(page,'blade-theme')).toBe('light');
 expect(await stored(page,'blade-skin')).toBe('demo-ink');
 await page.evaluate(()=>{localStorage.removeItem('blade-theme');localStorage.removeItem('blade-skin');});
});

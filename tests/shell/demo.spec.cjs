const {test,expect}=require('../../tools/playwright-test.cjs');
const {openMenu,openView}=require('./feature-demo.cjs');
// Feature demo (/) and base admin demo (/admin/) on the managed demo URL (BLADE_DEMO_URL).
async function signIn(page,email,password='61ade-demo',path='/'){
 await page.goto(path);await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Jelszó',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
}
async function command(page,name){
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name,exact:true}).click();}
 else await page.getByRole('button',{name,exact:true}).click();
}
async function openAdmin(page,title){
 await openMenu(page,title,'Adminisztráció');
 await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
}
async function openApiKeys(page){
 await openMenu(page,'API-kulcsok');
 await expect(page.getByRole('heading',{name:'API-kulcsok',exact:true})).toBeVisible();
}
const OAUTH='Belépés külső fiókkal';
test('the feature demo login offers password, OAuth, remember me and the language selector',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 const login=page.getByRole('dialog',{name:'Bejelentkezés',exact:true});
 await expect(login.getByLabel('E-mail',{exact:true})).toBeVisible();
 await expect(login.getByRole('button',{name:OAUTH,exact:true})).toBeVisible();
 await expect(login.getByText('Bejelentkezve maradok (90 nap)',{exact:true})).toBeVisible();
 // The language is an ordinary field of the sign-in form.
 await login.locator('.blade-language-field input').click();await page.locator('.dhx_combobox-options').getByText('English',{exact:true}).click();
 const english=page.getByRole('dialog',{name:'Sign in',exact:true});
 await expect(english.getByRole('button',{name:'Sign in with an external account',exact:true})).toBeVisible();
 // Next to the theme selector after sign-in as well.
 await english.getByLabel('Email',{exact:true}).fill('demo@example.test');await english.getByLabel('Password',{exact:true}).fill('61ade-demo');
 await english.getByRole('button',{name:'Sign in',exact:true}).click();
 const language=page.locator('.blade-navigation-row').getByRole('button',{name:'English',exact:true});
 const theme=page.locator('.blade-navigation-row').getByRole('button',{name:'Skyblue',exact:true});
 await expect(language).toBeVisible();
 expect((await language.boundingBox()).x).toBeLessThan((await theme.boundingBox()).x);
 await language.click();await page.getByText('Magyar',{exact:true}).click();
 // The Hungarian sign-out entry; the collapsed desktop menu keeps it under "Menü".
 const burger=page.getByRole('menuitem',{name:'Menü',exact:true});if(await burger.isVisible())await burger.click();
 await expect(page.getByRole('menuitem',{name:'Kijelentkezés',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

test('OAuth opens the AuthHandler overlay with the native Google and Facebook buttons; a click runs the provider flow',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByRole('button',{name:OAUTH,exact:true}).click();
 const overlay=page.locator('.authhandler-login-modal');
 await expect(overlay).toBeVisible();
 for(const provider of ['google','facebook']){
  await expect(overlay.locator(`.authhandler-provider-${provider}`)).toBeVisible();
  const icon=await overlay.locator(`.authhandler-provider-icon-${provider}`).evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(icon).toContain(`images/${provider}.png`);
 }
 await overlay.locator('.authhandler-provider-google').click();
 // Without keys: setup feedback. With keys in examples/demo-app/.env the browser leaves for Google's sign-in
 // page; page.route cannot stub it, because routes do not see the target of a redirect.
 const unconfigured=page.getByText('A(z) Google belépés még nincs beállítva (hiányzó kulcs).',{exact:true});
 await expect.poll(async()=>/^https:\/\/accounts\.google\.com\//.test(page.url())||await unconfigured.isVisible(),{timeout:10000}).toBe(true);
 if(await unconfigured.isVisible()){
  await page.locator('[data-blade-dialog-action=ok]').click();
  await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toBeVisible();
 }
 expect(errors).toEqual([]);
});

test('e-mail second factor: the formatted code mail lands in the demo mailbox in the account language',async({page,context})=>{
 await signIn(page,'twofactor@example.test');
 const confirmation=page.getByRole('dialog',{name:'E-mailes megerősítés',exact:true});
 await expect(confirmation).toBeVisible();
 const mailbox=await context.newPage();await mailbox.goto('/mailbox/');
 await expect(mailbox.getByText('61ade feature demo – sign-in code').first()).toBeVisible();
 const body=mailbox.frameLocator('iframe').locator('body');
 await expect(body).toContainText('Confirm sign-in');
 await expect(body).toContainText('Automatic mail of the 61ade feature demo');
 const code=(await body.innerText()).match(/\b\d{6}\b/)[0];
 await confirmation.getByLabel('Megerősítő kód',{exact:true}).fill(code);
 await confirmation.getByRole('button',{name:'Belépés megerősítése',exact:true}).click();
 // The account's default language (English) applies at sign-in.
 await expect(page.getByRole('menuitem',{name:'Sign out',exact:true})).toBeVisible();
 await expect(page.locator('.blade-session-bar')).toContainText('Two-factor Demo');
});

test('users carry OAuth, e-mail confirmation and default language switches; an API key is shown once and revoked by checkbox',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await signIn(page,'demo@example.test');
 await openAdmin(page,'Felhasználók');
 // Wide grids render columns lazily; the view metadata lists every switch column.
 const views=JSON.parse(await page.locator('#blade-config').textContent()).views;
 expect(views.find(view=>view.resource==='blade_users').columns.map(column=>column.header)).toEqual(['Teljes név','E-mail','Tiltva','Jelszócsere szükséges','OAuth-belépés','Alapnyelv','E-mailes megerősítés']);
 await expect(page.getByRole('button',{name:'Rendezés: Tiltva',exact:true})).toBeVisible();
 await openApiKeys(page);
 await command(page,'Hozzáadás');
 const dialog=page.getByRole('dialog');
 const label='Integráció '+Date.now();
 await dialog.getByLabel('Megnevezés',{exact:true}).fill(label);
 await dialog.getByLabel('Tulajdonos',{exact:true}).selectOption({label:'viewer@example.test'});
 const scopes=dialog.locator('.dhx_form-group').filter({hasText:'Engedélyezett műveletek'});
 await scopes.locator('.dhx_combobox-input').click();
 await page.locator('.dhx_combobox-options').getByText('Feladatok · Lista (demo_tasks.list)',{exact:true}).click();
 await page.locator('.dhx_combobox-options').getByText('Feladatok · Megnyitás (demo_tasks.get)',{exact:true}).click();
 await dialog.getByLabel('Megnevezés',{exact:true}).click();
 await dialog.getByRole('button',{name:'Mentés',exact:true}).click();
 // One-time reveals are a non-blocking toast (docs/dialogs.md).
 const notice=page.getByRole('alert').filter({hasText:'API-kulcs (egyszer jelenik meg)'});
 await expect(notice).toBeVisible();
 const secret=(await notice.innerText()).match(/[a-f0-9]{64}/)[0];
 const call=key=>page.evaluate(async key=>(await fetch('./?blade=1',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({resource:'demo_tasks',action:'get',id:'1',values:{}})})).status,key);
 // Authenticated API call: the owner has no API rule, so the object stays hidden (404, not 401/403).
 expect(await call(secret)).toBe(404);
 expect(await call('0'.repeat(64))).toBe(401);
 // Filter by the unique label so the row is found regardless of the live list window.
 await page.getByRole('textbox',{name:'Szűrés: Megnevezés',exact:true}).fill(label);
 const row=page.locator('.dhx_grid-row').filter({hasText:label});
 await expect(row).toContainText('Feladatok · Lista (demo_tasks.list), Feladatok · Megnyitás (demo_tasks.get)');
 const revoked=row.getByRole('checkbox',{name:'Visszavonva',exact:true});
 await revoked.locator('xpath=..').locator('.dhx_checkbox__visual-input').click();
 await expect(revoked).toBeChecked();
 expect(await call(secret)).toBe(401);
 expect(errors).toEqual([]);
});

test('the base admin demo shows only the mandatory administration',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/admin/');
 const login=page.getByRole('dialog',{name:'Bejelentkezés',exact:true});
 await expect(login.locator('.blade-language-field input')).toHaveValue('Magyar');
 await expect(login.getByRole('button',{name:OAUTH})).toHaveCount(0);
 await signIn(page,'demo@example.test','61ade-demo','/admin/');
 await expect(page.locator('.blade-session-bar')).toContainText('61ade alapadmin');
 await page.getByRole('menuitem',{name:'Adminisztráció',exact:true}).click();
 const items=await page.getByRole('menu',{name:'Adminisztráció'}).getByRole('menuitem').allInnerTexts();
 expect(items.map(item=>item.trim())).toEqual(['Felhasználók','Szerepkörök','Szerepkör-tagságok','Szerepkör-jogosultságok','Egyedi jogosultságok']);
 await expect(page.getByRole('menuitem',{name:'API-kulcsok',exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Jegyzetek',exact:true})).toHaveCount(0);
 await expect(page.getByRole('menuitem',{name:'Feature demó',exact:true})).toHaveCount(0);
 await page.getByRole('menuitem',{name:'Felhasználók',exact:true}).click();
 await expect(page.getByRole('button',{name:'Rendezés: Alapnyelv',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Rendezés: OAuth-belépés',exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('the feature demo task module shows multiple choices, inline editors and a bulk business action',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await signIn(page,'demo@example.test');
 await openView(page,'Feladatok');
 await expect(page.getByRole('heading',{name:'Feladatok',exact:true})).toBeVisible();
 await expect(page.locator('.dhx_grid-row').filter({hasText:'Szintetikus feladat 39'})).toContainText('Ügyfél, Sürgős');
 // The panel layout narrows the list, so commands may sit in the responsive "Műveletek" menu.
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){
  await menu.click();await expect(page.getByRole('menuitem',{name:'Lezárás',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'Lezárás — jelöltek',exact:true})).toHaveCount(0);
  await page.getByRole('menuitem',{name:'Hozzáadás',exact:true}).click();
 }else{
  await expect(page.getByRole('button',{name:'Lezárás',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Lezárás — jelöltek',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 }
 const form=page.locator('[data-cell-id="form"]');
 await expect(form.getByText('Címkék',{exact:true})).toBeVisible();
 await expect(form.getByLabel('Kapcsolattartó telefon',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
async function choose(page,from,to){
 await page.getByRole('button',{name:from,exact:true}).click();
 await page.getByText(to,{exact:true}).last().click();
 await expect(page.locator('html')).toHaveAttribute('lang',to==='English'?'en':to==='Deutsch'?'de':'hu');
}
test('framework language works before login, persists through login, translates metadata, validation and native components',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1400,height:900});await page.goto('/');
 await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'Magyar',exact:true}).click();await page.getByRole('menuitem',{name:'English',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Sign in',exact:true})).toBeVisible();
 await page.getByLabel('Username',{exact:true}).fill('synthetic');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('menuitem',{name:'Items',exact:true}).click();
 await expect(page.getByRole('button',{name:'View: Table',exact:true})).toBeVisible();
 await expect(page.locator('[role="columnheader"][data-dhx-id="title"]')).toContainText('Name');
 await expect(page.locator('.dhx_grid-cell[data-dhx-col-id="title"]').first()).toContainText('Elem ');
 await expect(page.locator('.vapa-navigation-row .vapa-language-flag--gb')).toBeVisible();
 const png=await page.locator('.vapa-navigation-row .vapa-language-flag--gb').evaluate(async icon=>{const source=getComputedStyle(icon).backgroundImage;const img=new Image();img.src=source.slice(5,-2);await img.decode();return {source,width:img.naturalWidth,height:img.naturalHeight};});expect(png.source).toContain('data:image/png');expect([png.width,png.height]).toEqual([16,11]);
 await page.getByRole('button',{name:'English',exact:true}).click();
 for(const [name,country]of [['Magyar','hu'],['English','gb'],['Deutsch','de']])await expect(page.getByRole('menuitem',{name,exact:true}).locator('.vapa-language-flag--'+country)).toBeVisible();
 await page.screenshot({path:path.join(process.env.VAPA_TMP_DIR,'i18n-png-selector.png'),animations:'disabled'});await page.getByRole('button',{name:'English',exact:true}).click();
 const languageBox=await page.getByRole('button',{name:'English',exact:true}).boundingBox(),themeBox=await page.getByRole('button',{name:'Skyblue',exact:true}).boundingBox();expect(languageBox.x+languageBox.width).toBeLessThanOrEqual(themeBox.x);
 const serverValidation=await page.evaluate(async()=>{
  const config=JSON.parse(document.getElementById('vapa-config').textContent);
  const call=async(action,values)=>{const response=await fetch('?vapa=1',{method:'POST',headers:{'Content-Type':'application/json','X-VAPA-CSRF':config.csrf},body:JSON.stringify({resource:'items',action,id:'1',values})});return {status:response.status,body:await response.json()};};
  const schema=await call('__form',{operation:'update'});return call('__edit',{field:'title',value:'',revision:schema.body.data.values.revision});
 });expect(serverValidation.status).toBe(400);expect(serverValidation.body.fieldErrors.title).toBe('This field is required.');
 await page.getByRole('button',{name:'Edit',exact:true}).isVisible();
 await page.locator('.dhx_grid-cell[data-dhx-col-id="title"]').first().click();await page.getByRole('button',{name:'Edit',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Save',exact:true})).toBeVisible();await dialog.getByLabel('Name',{exact:true}).fill('');await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toContainText('This field is required.');await dialog.getByRole('button',{name:/close/i}).click();
 await choose(page,'English','Deutsch');
 await expect(page).toHaveURL(/feature=items/);await expect(page.getByRole('button',{name:'Ansicht: Tabelle',exact:true})).toBeVisible();
 await expect(page.locator('[role="columnheader"][data-dhx-id="title"]')).toContainText('Bezeichnung');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','de');
 await page.getByRole('button',{name:'Skyblue',exact:true}).click();await expect(page.getByText('Hell',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Skyblue',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Aktionen',exact:true})).toBeInViewport();
 await expect(page.getByRole('button',{name:'Deutsch',exact:true})).toBeInViewport();
 await page.getByRole('menuitem',{name:'Menü',exact:true}).click();await page.getByRole('menuitem',{name:'Abmelden',exact:true}).click();await expect(page.getByRole('dialog',{name:'Anmelden',exact:true})).toBeVisible();
 await expect(page.locator('.vapa-session-bar')).toContainText('Nicht angemeldet');await page.screenshot({path:path.join(process.env.VAPA_TMP_DIR,'i18n-de-mobile-login.png'),animations:'disabled'});expect(errors).toEqual([]);
});
test('single-language consumer is fully localized with no selector',async({page})=>{
 await page.goto('/single/');await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('.vapa-session-bar')).toContainText('Not signed in');
 await expect(page.getByRole('dialog',{name:'Sign in',exact:true})).toBeVisible();
 await expect(page.getByLabel('Language',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'English',exact:true})).toHaveCount(0);
 await page.getByLabel('Username',{exact:true}).fill('synthetic');await page.getByLabel('Password',{exact:true}).fill('wrong');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByText('Incorrect username or password, or the account is unavailable.',{exact:true})).toBeVisible();
});
test('unsupported locale and CSRF cannot change language; data and field errors use the selected locale',async({page})=>{
 await page.goto('/');const rejected=await page.evaluate(async()=>{
  const config=JSON.parse(document.getElementById('vapa-config').textContent);const csrf=document.querySelector('#vapa-command input[name="csrf"]').value;
  const send=(values)=>fetch('./',{method:'POST',body:new URLSearchParams(values)}).then(async r=>({status:r.status,body:await r.text()}));
  return [await send({action:'language',csrf:'wrong',locale:'en'}),await send({action:'language',csrf,locale:'xx'})];
 });expect(rejected[0].status).toBe(403);expect(rejected[1].status).toBe(400);await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','hu');
 const api=await page.request.post('/?vapa=1',{headers:{Authorization:'Bearer invalid','X-VAPA-Locale':'de'},data:{resource:'items',action:'list',values:{}}});expect(api.status()).toBe(401);expect(api.headers()['content-language']).toBe('de');expect((await api.json()).error).toBe('Anmeldung erforderlich.');
});

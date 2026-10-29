const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {openView,api,createTask,deleteTasks}=require('./feature-demo.cjs');
// Feature demo: Hungarian default with an English selector and the demo's business catalogue.
const created=[];
test.afterEach(async({page})=>deleteTasks(page,created));
test('framework language works before login, persists through login, translates metadata, validation and native components',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1400,height:900});await page.goto('/');
 await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toBeVisible();
 const language=page.getByRole('dialog').locator('.dhx_layout-cell.blade-language-field');await expect(language).toHaveClass(/blade-language-field--hu/);await language.locator('input').click();
 await expect(page.locator('.dhx_combobox-options .blade-language-flag--gb')).toBeVisible();await page.locator('.dhx_combobox-options').getByText('English',{exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Sign in',exact:true})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill('demo@example.test');await page.getByLabel('Password',{exact:true}).fill('61ade-demo');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await openView(page,'Tasks','Feature demo');
 await expect(page.getByRole('button',{name:'Actions',exact:true})).toBeVisible();
 await expect(page.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Name'}).first()).toContainText('Name');
 await expect(page.locator('.dhx_grid-cell[data-dhx-col-id="title"]').first()).toContainText('Szintetikus feladat');
 await expect(page.locator('.blade-navigation-row .blade-language-flag--gb')).toBeVisible();
 const png=await page.locator('.blade-navigation-row .blade-language-flag--gb').evaluate(async icon=>{const source=getComputedStyle(icon).backgroundImage;const img=new Image();img.src=source.slice(5,-2);await img.decode();return {source,width:img.naturalWidth,height:img.naturalHeight};});expect(png.source).toContain('data:image/png');expect([png.width,png.height]).toEqual([16,11]);
 await page.getByRole('button',{name:'English',exact:true}).click();
 for(const [name,country]of [['Magyar','hu'],['English','gb']])await expect(page.getByRole('menuitem',{name,exact:true}).locator('.blade-language-flag--'+country)).toBeVisible();
 await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR,'i18n-png-selector.png'),animations:'disabled'});await page.getByRole('button',{name:'English',exact:true}).click();
 const languageBox=await page.getByRole('button',{name:'English',exact:true}).boundingBox(),themeBox=await page.getByRole('button',{name:'Skyblue',exact:true}).boundingBox();expect(languageBox.x+languageBox.width).toBeLessThanOrEqual(themeBox.x);
 const title='E2E nyelv '+Date.now();created.push(await createTask(page,{title,status:'new'}));
 const schema=await api(page,'demo_tasks','__form',created[0],{operation:'update'});
 const serverValidation=await api(page,'demo_tasks','__edit',created[0],{field:'title',value:'',revision:schema.body.data.values.revision});
 expect(serverValidation.status).toBe(400);expect(serverValidation.body.fieldErrors.title).toBe('This field is required.');
 const filter=page.locator('[data-cell-id="filter"]');await filter.getByLabel('Name',{exact:true}).fill(title);await filter.getByRole('button',{name:'Filter',exact:true}).click();
 await page.locator('.dhx_grid-row').filter({hasText:title}).click();
 await page.getByRole('button',{name:'Actions',exact:true}).click();await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
 const form=page.locator('[data-cell-id="form"]');await expect(form.getByRole('button',{name:'Save',exact:true})).toBeVisible();await form.getByLabel('Name',{exact:true}).fill('');await form.getByRole('button',{name:'Save',exact:true}).click();await expect(form).toContainText('This field is required.');
 await deleteTasks(page,created);
 // Back to Hungarian: the selection is kept by the account and other specs expect the default.
 await page.getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).last().click();await expect(page.locator('html')).toHaveAttribute('lang','hu');
 await expect(page).toHaveURL(/feature=demo_tasks/);
 await expect(page.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Megnevezés'}).first()).toContainText('Megnevezés');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','hu');
 await page.getByRole('button',{name:'Skyblue',exact:true}).click();await expect(page.getByText('Világos',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Skyblue',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Műveletek',exact:true})).toBeInViewport();
 await expect(page.getByRole('button',{name:'Magyar',exact:true})).toBeInViewport();
 await page.getByRole('menuitem',{name:'Menü',exact:true}).click();await page.getByRole('menuitem',{name:'Kijelentkezés',exact:true}).click();await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toBeVisible();
 await expect(page.locator('.blade-session-bar')).toContainText('Nincs bejelentkezve');expect(errors).toEqual([]);
});
test('unsupported locale and CSRF cannot change language; API errors use the requested locale',async({page})=>{
 await page.goto('/');const rejected=await page.evaluate(async()=>{
  const csrf=document.querySelector('#blade-command input[name="csrf"]').value;
  const send=(values)=>fetch('./',{method:'POST',body:new URLSearchParams(values)}).then(async r=>({status:r.status,body:await r.text()}));
  return [await send({action:'language',csrf:'wrong',locale:'en'}),await send({action:'language',csrf,locale:'xx'})];
 });expect(rejected[0].status).toBe(403);expect(rejected[1].status).toBe(400);await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','hu');
 const response=await page.request.post('/?blade=1',{headers:{Authorization:'Bearer invalid','X-BLADE-Locale':'en'},data:{resource:'demo_tasks',action:'list',values:{}}});expect(response.status()).toBe(401);expect(response.headers()['content-language']).toBe('en');expect((await response.json()).error).toBe('Sign-in required.');
});

const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu,command}=require('./feature-demo.cjs');
// The first route after the project modules loaded (docs/shell.md#application-modules, FB-0275): a view the user opened
// from the menu meanwhile stays mounted with its dialog; it is not mounted a second time.
const isList=resource=>request=>{try{const body=request.postDataJSON();return body?.resource===resource&&body?.action==='list';}catch{return false;}};

test('a view and its toolbar dialog opened before the modules finish loading survive the first route',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 // Hold the feature demo's module until the dialog is open (well within the 5 s import limit).
 let release;const held=new Promise(resolve=>{release=resolve;});
 await page.route(/\/app\/demo\.js(\?|$)/,async route=>{await held;await route.continue();});
 const lists=[];page.on('request',request=>{if(isList('blade_users')(request))lists.push(request.url());});
 await signIn(page);
 await openMenu(page,'Felhasználók','Adminisztráció');
 await expect(page.getByRole('heading',{name:'Felhasználók',exact:true})).toBeVisible();
 // Not yet started: the module's menu command is missing.
 await expect(page.getByRole('menuitem',{name:/^Munkaasztal/})).toHaveCount(0);
 await command(page,'Hozzáadás');
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByLabel('E-mail',{exact:true})).toBeVisible();
 release();
 await expect(page.getByRole('menuitem',{name:/^Munkaasztal/})).toBeVisible();
 await page.waitForLoadState('networkidle');
 await expect(dialog.getByLabel('E-mail',{exact:true})).toBeVisible();
 expect(lists).toHaveLength(1);
 expect(page.url()).toContain('#view=blade_users');
 expect(failures).toEqual([]);
});

test('a page loaded on an address still opens it after the modules loaded',async({page})=>{
 await signIn(page,'demo@example.test','/#view=blade_users');
 await expect(page.getByRole('heading',{name:'Felhasználók',exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:/^Munkaasztal/})).toBeVisible();
});

const {test,expect}=require('../../tools/playwright-test.cjs');
async function signIn(page,email,password){
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Jelszó',{exact:true}).fill(password);await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
}
async function signOut(page){
 await page.getByRole('menuitem',{name:'Kijelentkezés',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toBeVisible();
}
async function openUsers(page){
 await page.getByRole('menuitem',{name:'Adminisztráció',exact:true}).click();
 await page.getByRole('menuitem',{name:'Felhasználók',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Felhasználók',exact:true})).toBeVisible();
}
// A narrow panel moves the toolbar into the responsive "Műveletek" menu.
async function command(page,name){
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name,exact:true}).click();}
 else await page.getByRole('button',{name,exact:true}).click();
}
// Filter by e-mail so the row is found regardless of the live list window.
async function selectUser(page,email){
 const filters=page.locator('[data-cell-id="filter"]');
 await filters.getByLabel('E-mail',{exact:true}).fill(email);
 await filters.getByRole('button',{name:'Szűrés',exact:true}).click();
 await page.locator('.dhx_grid-cell',{hasText:email}).click();
}
async function createUser(page,email){
 await command(page,'Hozzáadás');
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Teljes név',{exact:true}).fill('Synthetic Person');
 await dialog.getByLabel('E-mail',{exact:true}).fill(email.toUpperCase());
 await dialog.getByRole('button',{name:'Mentés',exact:true}).click();
 const notice=page.locator('.dhx_alert');
 await expect(notice).toContainText('Ideiglenes jelszó (egyszer jelenik meg)');
 await expect(notice).toContainText('Érvényes 72 óráig');
 const temporary=(await notice.locator('.dhx_alert__content').innerText()).match(/[A-Za-z0-9]{20}/)[0];
 await page.getByRole('button',{name:/^(confirm|Megerősítés)$/}).click();
 return temporary;
}
test('admin creates a user; the temporary password forces a change before any session',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const email=`person.${Date.now()}@example.test`;
 await signIn(page,'demo@example.test','vapa-demo');
 await openUsers(page);
 const temporary=await createUser(page,email);
 await selectUser(page,email);
 await signOut(page);

 await signIn(page,email,temporary);
 const change=page.getByRole('dialog',{name:'Jelszócsere',exact:true});
 await expect(change).toBeVisible();
 const pending=JSON.parse(await page.locator('#vapa-config').textContent());
 expect(pending.authenticated).toBe(false);expect(pending.menu).toBeUndefined();expect(pending.views).toBeUndefined();
 await change.getByLabel('Új jelszó',{exact:true}).fill(temporary);
 await change.getByLabel('Új jelszó ismét',{exact:true}).fill(temporary);
 await change.getByRole('button',{name:'Jelszó mentése és belépés',exact:true}).click();
 await expect(page.getByText('Az új jelszó nem egyezhet az ideiglenes jelszóval.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^(confirm|Megerősítés)$/}).click();
 await change.getByLabel('Új jelszó',{exact:true}).fill('chosen-password-1');
 await change.getByLabel('Új jelszó ismét',{exact:true}).fill('chosen-password-1');
 await change.getByRole('button',{name:'Jelszó mentése és belépés',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'Kijelentkezés',exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Adminisztráció',exact:true})).toHaveCount(0);
 await signOut(page);

 await signIn(page,email,temporary);
 await expect(page.getByText('Hibás felhasználónév vagy jelszó, illetve nem elérhető fiók.',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('a disabled account cannot sign in and shows its state in the list',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const email=`disabled.${Date.now()}@example.test`;
 await signIn(page,'demo@example.test','vapa-demo');
 await openUsers(page);
 const temporary=await createUser(page,email);
 await selectUser(page,email);
 await command(page,'Tiltás');
 await page.getByRole('dialog').getByRole('button',{name:'Tiltás',exact:true}).click();
 await expect(page.getByText('A művelet sikerült.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^(confirm|Megerősítés)$/}).click();
 await signOut(page);
 await signIn(page,email,temporary);
 await expect(page.getByText('Hibás felhasználónév vagy jelszó, illetve nem elérhető fiók.',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
async function openAdmin(page,title){
 await page.getByRole('menuitem',{name:'Adminisztráció',exact:true}).click();
 await page.getByRole('menuitem',{name:title,exact:true}).click();
 await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
}
async function save(page,values){
 await command(page,'Hozzáadás');
 const dialog=page.getByRole('dialog');
 for(const [label,value] of Object.entries(values)){
  const field=dialog.getByLabel(label,{exact:true});
  if(typeof value==='string')await field.fill(value);else await field.selectOption({label:value.option});
 }
 await dialog.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(page.getByText('A művelet sikerült.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^(confirm|Megerősítés)$/}).click();
}
test('a role with a catalogue rule grants a module to its new member',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const stamp=Date.now(),email=`member.${stamp}@example.test`;
 await signIn(page,'demo@example.test','vapa-demo');
 await openUsers(page);
 const temporary=await createUser(page,email);
 await openAdmin(page,'Szerepkörök');
 await save(page,{'Név':`Olvasók ${stamp}`,'Kulcs':`readers_${stamp}`});
 await openAdmin(page,'Szerepkör-tagságok');
 await save(page,{'Felhasználó':{option:email},'Szerepkör':{option:`Olvasók ${stamp}`}});
 await openAdmin(page,'Szerepkör-jogosultságok');
 for(const action of ['Lista (list)','Megnyitás (get)'])await save(page,{'Szerepkör':{option:`Olvasók ${stamp}`},'Erőforrás':{option:'Jegyzetek (notes)'},'Művelet':{option:action}});
 await signOut(page);
 await signIn(page,email,temporary);
 const change=page.getByRole('dialog',{name:'Jelszócsere',exact:true});
 await change.getByLabel('Új jelszó',{exact:true}).fill('member-password-1');
 await change.getByLabel('Új jelszó ismét',{exact:true}).fill('member-password-1');
 await change.getByRole('button',{name:'Jelszó mentése és belépés',exact:true}).click();
 await page.getByRole('menuitem',{name:'Jegyzetek',exact:true}).click();
 await expect(page.locator('.vapa-workspace').getByRole('row').nth(1)).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Adminisztráció',exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
});

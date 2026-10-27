const {test,expect}=require('../../tools/playwright-test.cjs');
const {openMenu}=require('./feature-demo.cjs');
async function signIn(page,email,password){
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Jelszó',{exact:true}).fill(password);await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
}
async function signOut(page){
 await openMenu(page,'Kijelentkezés');
 await expect(page.getByRole('dialog',{name:'Bejelentkezés',exact:true})).toBeVisible();
}
// Signed in without administration: checked in the shell metadata, which does not depend on the menu being collapsed.
async function signedInWithoutAdmin(page){
 const shell=JSON.parse(await page.locator('#blade-config').textContent());
 expect(shell.authenticated).toBe(true);
 expect(JSON.stringify([shell.menu,shell.views])).not.toContain('Adminisztráció');
}
async function openUsers(page){
 await openMenu(page,'Felhasználók','Adminisztráció');
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
 const notice=page.locator('.blade-toast').last();
 await expect(notice).toContainText('Ideiglenes jelszó (egyszer jelenik meg)');
 await expect(notice).toContainText('Érvényes 72 óráig');
 const temporary=(await notice.innerText()).match(/[A-Za-z0-9]{20}/)[0];
 return temporary;
}
test('admin creates a user; the temporary password forces a change before any session',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const email=`person.${Date.now()}@example.test`;
 await signIn(page,'demo@example.test','61de-demo');
 await openUsers(page);
 const temporary=await createUser(page,email);
 await selectUser(page,email);
 await signOut(page);

 await signIn(page,email,temporary);
 const change=page.getByRole('dialog',{name:'Jelszócsere',exact:true});
 await expect(change).toBeVisible();
 const pending=JSON.parse(await page.locator('#blade-config').textContent());
 expect(pending.authenticated).toBe(false);expect(pending.menu).toBeUndefined();expect(pending.views).toBeUndefined();
 await change.getByLabel('Új jelszó',{exact:true}).fill('chosen-password-1');
 await change.getByLabel('Új jelszó ismét',{exact:true}).fill('chosen-password-1');
 await change.getByRole('button',{name:'Jelszó mentése és belépés',exact:true}).click();
 await expect(page.locator('.blade-session-bar')).toBeVisible();
 await signedInWithoutAdmin(page);
 await signOut(page);

 await signIn(page,email,temporary);
 await expect(page.getByText('Hibás felhasználónév vagy jelszó, illetve nem elérhető fiók.',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('disabling is a grid and form checkbox; a disabled account cannot sign in',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const email=`disabled.${Date.now()}@example.test`;
 await signIn(page,'demo@example.test','61de-demo');
 await openUsers(page);
 const temporary=await createUser(page,email);
 await selectUser(page,email);
 // No single-purpose toggle commands: the state is an editable checkbox.
 await expect(page.getByRole('button',{name:'Tiltás',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Visszaengedés',exact:true})).toHaveCount(0);
 await command(page,'Módosítás');
 const form=page.getByRole('dialog');
 await expect(form.getByRole('checkbox',{name:/^(checkbox )?Tiltva$/})).not.toBeChecked();
 await form.getByRole('button',{name:/close|Bezárás/i}).first().click();
 const row=page.locator('.dhx_grid-row').filter({hasText:email});
 const disabled=row.getByRole('checkbox',{name:'Tiltva',exact:true});
 await expect(disabled).not.toBeChecked();
 await disabled.locator('xpath=..').locator('.dhx_checkbox__visual-input').click();
 await expect(disabled).toBeChecked();
 await page.reload();await selectUser(page,email);
 await expect(page.locator('.dhx_grid-row').filter({hasText:email}).getByRole('checkbox',{name:'Tiltva',exact:true})).toBeChecked();
 await signOut(page);
 await signIn(page,email,temporary);
 await expect(page.getByText('Hibás felhasználónév vagy jelszó, illetve nem elérhető fiók.',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
async function openAdmin(page,title){
 await openMenu(page,title,'Adminisztráció');
 await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
}
async function fillDialog(page,values){
 await command(page,'Hozzáadás');
 const dialog=page.getByRole('dialog');
 for(const [label,value] of Object.entries(values)){
  const field=dialog.getByLabel(label,{exact:true});
  if(typeof value==='string')await field.fill(value);else await field.selectOption({label:value.option});
 }
 await dialog.getByRole('button',{name:'Mentés',exact:true}).click();
 return dialog;
}
async function save(page,values){
 await fillDialog(page,values);
 // Success is a non-blocking toast: no confirmation window follows the form.
 await expect(page.getByText('A művelet sikerült.',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('a role with a catalogue rule grants a module to its new member',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const stamp=Date.now(),email=`member.${stamp}@example.test`;
 await signIn(page,'demo@example.test','61de-demo');
 await openUsers(page);
 const temporary=await createUser(page,email);
 await openAdmin(page,'Szerepkörök');
 await save(page,{'Név':`Olvasók ${stamp}`,'Kulcs':`readers_${stamp}`});
 await openAdmin(page,'Szerepkör-tagságok');
 await save(page,{'Felhasználó':{option:email},'Szerepkör':{option:`Olvasók ${stamp}`}});
 await openAdmin(page,'Szerepkör-jogosultságok');
 const rule=action=>({'Szerepkör':{option:`Olvasók ${stamp}`},'Erőforrás':{option:'Jegyzetek (notes)'},'Művelet':{option:action},'Csatorna':{option:'Felület (ui)'},'Hatás':{option:'Engedély'},'Hatókör':{option:'Minden objektum'}});
 // Selects start on the explicit empty choice; required ones must be chosen.
 let dialog=await fillDialog(page,{'Szerepkör':{option:`Olvasók ${stamp}`}});
 await expect(dialog.getByLabel('Erőforrás',{exact:true})).toHaveValue('');
 await expect(dialog.getByText('Kötelező mező.').first()).toBeVisible();
 await dialog.getByRole('button',{name:/close|Bezárás/i}).first().click();
 for(const action of ['Lista (list)','Megnyitás (get)'])await save(page,rule(action));
 // A second identical rule is rejected on the form, not stored.
 dialog=await fillDialog(page,rule('Lista (list)'));
 await expect(dialog.getByText('Ilyen bejegyzés már létezik.').first()).toBeVisible();
 await dialog.getByRole('button',{name:/close|Bezárás/i}).first().click();
 await signOut(page);
 await signIn(page,email,temporary);
 const change=page.getByRole('dialog',{name:'Jelszócsere',exact:true});
 await change.getByLabel('Új jelszó',{exact:true}).fill('member-password-1');
 await change.getByLabel('Új jelszó ismét',{exact:true}).fill('member-password-1');
 await change.getByRole('button',{name:'Jelszó mentése és belépés',exact:true}).click();
 await openMenu(page,'Jegyzetek');
 await expect(page.locator('.blade-workspace').getByRole('row').nth(1)).toBeVisible();
 await signedInWithoutAdmin(page);
 expect(errors).toEqual([]);
});

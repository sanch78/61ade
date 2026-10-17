const {test,expect}=require('@playwright/test');
test('standalone registry creates a DHTMLX grid and reusable form',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('Felhasználónév',{exact:true}).fill('demo');await page.getByLabel('Jelszó',{exact:true}).fill('vapa-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await page.getByRole('menuitem',{name:'Jegyzetek',exact:true}).click();
 const workspace=page.locator('.vapa-workspace');
 await expect(workspace.locator('.dhx_layout-space')).toHaveCount(1);
 await expect(workspace.locator('[data-cell-id="filter"]')).toBeVisible();
 await expect(workspace.locator('[data-cell-id="grid"]')).toBeVisible();
 const insets=await workspace.evaluate(host=>{
   const outer=host.getBoundingClientRect();
   const first=host.querySelector('[data-cell-id="filter"]').getBoundingClientRect();
   return {left:first.left-outer.left,top:first.top-outer.top};
 });
 expect(insets).toEqual({left:12,top:12});
 await expect(page.locator('.vapa-session-bar')).toHaveCount(1);
 await expect(page.locator('.vapa-workspace .dhx_toolbar')).toHaveCount(1);
 await expect(page.getByText('Élő kapcsolat',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Cím',{exact:true}).fill('Standalone '+Date.now());
 await page.getByRole('dialog').getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(page.getByText('A művelet sikerült.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'confirm',exact:true}).click();
 for(let i=0;i<3;i++){
   await page.getByRole('menuitem',{name:'Jegyzetek',exact:true}).click();
   await expect(page.getByRole('button',{name:'Hozzáadás',exact:true})).toBeVisible();
 }
 expect(errors).toEqual([]);
});
test('polling observes external writes without a refresh control',async({page})=>{
 const {execFileSync}=require('node:child_process');
 await page.goto('/');await page.getByLabel('Felhasználónév',{exact:true}).fill('demo');await page.getByLabel('Jelszó',{exact:true}).fill('vapa-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await page.getByRole('menuitem',{name:'Jegyzetek',exact:true}).click();
 await expect(page.getByRole('button',{name:'Frissítés',exact:true})).toHaveCount(0);
 const value='Polling '+Date.now();
 execFileSync(process.env.VAPA_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${process.env.VAPA_TMP_DIR || 'codex/tmp'}/demo-workspace.sqlite');$q=$db->prepare('UPDATE notes SET title=? WHERE id=1');$q->execute([$argv[1]]);`,value]);
 await expect(page.getByText(value,{exact:true})).toBeVisible({timeout:10000});
});

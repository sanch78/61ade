const {test,expect}=require('@playwright/test');
test('standalone registry creates a DHTMLX grid and reusable form',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('Felhasználónév',{exact:true}).fill('demo');await page.getByLabel('Jelszó',{exact:true}).fill('vapa-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await page.getByRole('menuitem',{name:'Jegyzetek',exact:true}).click();
 await page.getByRole('button',{name:'Új',exact:true}).click();
 await page.getByLabel('Cím',{exact:true}).fill('Standalone '+Date.now());
 await page.getByRole('dialog').getByRole('button',{name:'Új',exact:true}).click();
 await expect(page.getByText('A művelet sikerült.',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

const {expect}=require('../../tools/playwright-test.cjs');
// Shared steps for specs that run on the managed feature demo (/), see docs/demos.md.
async function signIn(page,email='demo@example.test',path='/'){
 await page.goto(path);await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Jelszó',{exact:true}).fill('61de-demo');
 await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
}
// A compact desktop menu shows the open view's siblings beside "Menü"; use that button when present.
// Without a group the item is top-level and sits directly under "Menü".
async function openMenu(page,title,group){
 const top=page.locator('.blade-navigation-row .dhx_menu-nav > li');await expect(top.first()).toBeVisible();
 const sibling=top.getByRole('menuitem',{name:title,exact:true});
 if(await sibling.isVisible())return sibling.click();
 const burger=page.getByRole('menuitem',{name:/^(Menü|Menu)$/});if(await burger.isVisible()){await burger.click();await page.waitForTimeout(750);}
 if(group)await page.getByRole('menuitem',{name:group,exact:true}).click();
 await page.getByRole('menuitem',{name:title,exact:true}).click();
}
async function openView(page,title,group='Feature demó'){
 await openMenu(page,title,group);
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}
// The toolbar moves into the responsive "Műveletek" menu when it does not fit.
async function command(page,name){
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name,exact:true}).click();}
 else await page.getByRole('button',{name,exact:true}).click();
}
async function view(page,mode){
 const menu=page.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name:/^Nézet:/}).click();}
 else await page.getByRole('button',{name:/^Nézet:/}).click();
 await page.getByRole('menuitem',{name:mode,exact:true}).click();
}
// Same JSON channel as the UI, with the page session and CSRF token.
function api(page,resource,action,id=null,values={}){
 return page.evaluate(async([resource,action,id,values])=>{
  const csrf=JSON.parse(document.getElementById('blade-config').textContent).csrf;
  const response=await fetch('?blade=1',{method:'POST',headers:{'Content-Type':'application/json','X-BLADE-CSRF':csrf},body:JSON.stringify({resource,action,id,values})});
  return {status:response.status,body:await response.json()};
 },[resource,action,id,values]);
}
const isAction=action=>response=>{try{return response.request().postDataJSON()?.action===action;}catch{return false;}};
// Tasks created by a test are deleted afterwards, so the shared demo data stays stable.
async function createTask(page,values){
 const created=await api(page,'demo_tasks','create',null,values);expect(created.status).toBe(200);return String(created.body.data.id);
}
async function deleteTasks(page,ids){
 for(const id of ids.splice(0)){
  try{const form=await api(page,'demo_tasks','__form',id,{operation:'update'});if(form.status===200)await api(page,'demo_tasks','delete',id,{revision:form.body.data.values.revision});}catch{}
 }
}
module.exports={signIn,openMenu,openView,command,view,api,isAction,createTask,deleteTasks};

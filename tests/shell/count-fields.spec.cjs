const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu,api}=require('./feature-demo.cjs');
// Count fields (FB-0173) on the tenant demo (/tenants/): the global `Kategóriák` count the tenant-scoped `Tételek` each
// account could list in the active tenant (all items of a category and its subcategories; the notes attached directly).
// Seed (Alpha): Documentation 5 / 2, Manuals 2 / 1; (Beta): Documentation 2 / 1, Manuals 1 / 1, both with the shared items
// (FB-0175: a note in Documentation and a file in Quotes, read by every tenant). Items of the run start
// with the run prefix and are removed afterwards.
const prefix='cf'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/tenants.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const cleanup=()=>php(`$db->exec("DELETE FROM tenant_items WHERE title LIKE '${prefix}%'");`);
test.describe.configure({mode:'serial'});
test.beforeAll(cleanup);
test.afterAll(cleanup);

const row=(page,name)=>page.locator('[data-cell-id="grid"] .dhx_grid-row').filter({has:page.getByRole('gridcell',{name,exact:true})});
const counts=async(page,name)=>{const cells=row(page,name).getByRole('gridcell');return [await cells.nth(-2).innerText(),await cells.nth(-1).innerText()].map(text=>text.trim());};
async function tenant(page,name){
 const selector=page.locator('.blade-navigation-row').getByRole('button',{name:/^(Alpha|Beta)$/});
 await expect(selector).toBeVisible();
 if(await selector.innerText()!==name){await selector.click();await page.getByRole('menuitem',{name,exact:true}).click();await expect(selector).toHaveText(name);}
}
async function categories(page){
 await openMenu(page,'Kategóriák','Tenant demó');
 await expect(row(page,'Documentation')).toBeVisible();
}
/** The categories by name with both counts, through the list action. */
const listed=async page=>Object.fromEntries((await api(page,'tenant_categories','list','',{limit:50})).body.data.items.map(item=>[item.name,[item.item_count,item.note_count]]));

test('a global category counts the tenant-scoped items of the active tenant; switching changes the counts',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test','/tenants/');
 try{
  await tenant(page,'Alpha');
  await categories(page);
  expect(await counts(page,'Documentation')).toEqual(['5','2']);
  expect(await counts(page,'Purchasing')).toEqual(['2','0']);
  // The details show both counts; get and the list give the same values.
  await row(page,'Documentation').getByRole('gridcell',{name:'Documentation',exact:true}).click();
  await page.getByRole('button',{name:'Adatok',exact:true}).click();
  const details=page.getByRole('dialog',{name:'Rekordadatok',exact:true});
  await expect(details).toContainText('Tételek (alkategóriákkal)');
  await expect(details).toContainText('Jegyzetek (közvetlenül)');
  await page.keyboard.press('Escape');await expect(details).toHaveCount(0);
  const alpha=await listed(page);
  expect(alpha).toMatchObject({Documentation:[5,2],Manuals:[2,1],Minutes:[1,1],Purchasing:[2,0],Quotes:[2,0]});
  const documentation=(await api(page,'tenant_categories','list','',{limit:50})).body.data.items.find(item=>item.name==='Documentation');
  const got=(await api(page,'tenant_categories','get',String(documentation.id))).body.data;
  expect([got.item_count,got.note_count]).toEqual([5,2]);
  // A new note below a subcategory counts for the subcategory and, recursively, its parent; archived, it no longer counts.
  const minutes=(await api(page,'tenant_categories','list','',{limit:50})).body.data.items.find(item=>item.name==='Minutes');
  const created=await api(page,'tenant_items','create',null,{title:prefix+' note',category_id:String(minutes.id),kind:'note'});
  expect(created.status).toBe(200);
  expect(await listed(page)).toMatchObject({Documentation:[6,2],Minutes:[2,2]});
  const form=await api(page,'tenant_items','__form',String(created.body.data.id),{operation:'delete'});
  expect((await api(page,'tenant_items','delete',String(created.body.data.id),{revision:form.body.data.values.revision})).status).toBe(200);
  expect(await listed(page)).toMatchObject({Documentation:[5,2],Minutes:[1,1]});
  // Beta: the same categories, Beta's counts.
  await tenant(page,'Beta');
  await categories(page);
  expect(await counts(page,'Documentation')).toEqual(['2','1']);
  expect(await listed(page)).toMatchObject({Documentation:[2,1],Manuals:[1,1],Purchasing:[2,0],Quotes:[2,1]});
  // Counts are no filter or sort field.
  expect((await api(page,'tenant_categories','list','',{limit:10,filters:{item_count:'1'}})).status).toBe(403);
  expect((await api(page,'tenant_categories','list','',{limit:10,sort:{field:'item_count',direction:'asc'}})).status).toBe(403);
 }finally{await tenant(page,'Alpha');}
 expect(errors).toEqual([]);
});

test('an account with one tenant sees that tenant\'s counts; the items list beside the category tree',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'single@example.test','/tenants/');
 await categories(page);
 expect(await counts(page,'Documentation')).toEqual(['5','2']);
 await openMenu(page,'Tételek','Tenant demó');
 const tree=page.getByRole('tree',{name:'Kategóriák',exact:true});
 await tree.getByRole('treeitem',{name:'Documentation',exact:true}).locator('.dhx_tree-list-item__text, .dhx_tree-template__wrapper').first().click();
 await expect(page.getByRole('gridcell',{name:'Style guide',exact:true})).toBeVisible();
 await expect(page.getByRole('gridcell',{name:'Beta manual',exact:true})).toHaveCount(0);
});

test('without an active tenant the global categories carry no tenant-scoped counts (no misleading 0)',async({page})=>{
 await signIn(page,'none@example.test','/tenants/');
 await expect(page.locator('.blade-session-bar').getByText('Nincs hozzárendelt tenant',{exact:true})).toBeVisible();
 const listedRows=await api(page,'tenant_categories','list','',{limit:10});
 expect(listedRows.status).toBe(200);
 expect(listedRows.body.data.items.length).toBeGreaterThan(0);
 for(const item of listedRows.body.data.items){expect(Object.hasOwn(item,'item_count')).toBe(false);expect(Object.hasOwn(item,'note_count')).toBe(false);}
});

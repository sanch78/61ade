const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu,command}=require('./feature-demo.cjs');
const current=page=>page.locator('.blade-navigation-row .dhx_menu-nav > li.blade-menu-current');

for(const width of [1720,1200])test(`record menu context from a direct link at ${width}px`,async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});
 await signIn(page,'demo@example.test','/#view=demo.playlist-editor&record=3');
 await expect(page.locator('.blade-page-layout').first()).toBeVisible();
 await expect(current(page)).toHaveText([width===1720?'Digitális kijelző':'Lejátszási listák']);
 await page.reload();
 await expect(page.locator('.blade-page-layout').first()).toBeVisible();
 await expect(current(page)).toHaveText([width===1720?'Digitális kijelző':'Lejátszási listák']);
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('.blade-navigation-row .dhx_menu-nav > li > button')).toHaveText(['Menü']);
 await page.setViewportSize({width,height:1000});
 await expect(current(page)).toHaveText([width===1720?'Digitális kijelző':'Lejátszási listák']);
 expect(errors).toEqual([]);
});

test('record menu context follows commands, history and unrelated pages',async({page})=>{
 await page.setViewportSize({width:1720,height:1000});
 await signIn(page,'demo@example.test','/#view=signage_playlists');
 await expect(current(page)).toHaveText(['Digitális kijelző']);
 await page.locator('.dhx_grid-row').first().locator('[data-dhx-col-id="title"]').click();
 await command(page,'Lista szerkesztése');
 await expect(page).toHaveURL(/#view=demo.playlist-editor&record=/);
 await expect(page.locator('.blade-page-layout').first()).toBeVisible();
 await expect(current(page)).toHaveText(['Digitális kijelző']);
 await page.goBack();
 await expect(page).toHaveURL(/#view=signage_playlists$/);
 await expect(current(page)).toHaveText(['Digitális kijelző']);
 await page.goForward();
 await expect(page).toHaveURL(/#view=demo.playlist-editor&record=/);
 await expect(page.locator('.blade-page-layout').first()).toBeVisible();
 await expect(current(page)).toHaveText(['Digitális kijelző']);
 await openMenu(page,'Feladatok','Feature demó');
 await expect(page).toHaveURL(/#view=demo_tasks$/);
 await expect(current(page)).toHaveText(['Feature demó']);
});

test('independent consumer: resource inheritance, explicit groups, ordering and absent sources',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1720,height:1000});
 await signIn(page);
 const base=(id,resource,group)=>({id,kind:'test.page',title:id,resource,group,actions:[],options:{}});
 let views=[];
 await page.route('**/menu-record-fixture.js*',route=>route.fulfill({contentType:'text/javascript',body:`export default app=>{
  window.menuFixtureApp=app;
  app.kinds.register('test.page',{create(host,view){const node=document.createElement('p');node.textContent=view.id;host.attach(node);return {destroy(){node.remove();}};}});
 };`}));
 await page.route('**/?blade=1',route=>route.fulfill({json:{ok:true,data:{id:'42'}}}));
 await page.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.fallback();
  const response=await route.fetch();
  const body=(await response.text()).replace(/(<script type="application\/json" id="blade-config">)([\s\S]*?)(<\/script>)/,(_all,start,json,end)=>{
   const config=JSON.parse(json);config.views=views;config.modules=['/menu-record-fixture.js'];delete config.menu;delete config.menuSeparators;
   return start+JSON.stringify(config)+end;
  });
  await route.fulfill({response,body});
 });
 const pages=[base('test.first','records','First'),base('test.second','records','Second'),base('test.third','other','Third'),
  ...Array.from({length:5},(_,index)=>base('test.extra'+index,'extra'+index,'Other section '+index+' here'))];
 let iteration=0;
 for(const [group,resource,expected] of [[undefined,'records','First'],['Second','records','Second'],['Third','records','Third'],[undefined,'missing',null]]){
  await page.setViewportSize({width:1720,height:1000});
  views=[...pages,{...base('test.detail',resource,group),record:resource}];
  await page.goto('/?menu-record='+iteration+++'#view=test.detail&record=42');
  await expect(page.locator('.blade-workspace')).toHaveText('test.detail');
  await expect(current(page)).toHaveText(expected?[expected]:[]);
  await expect(page.getByRole('menuitem',{name:'test.detail',exact:true})).toHaveCount(0);
  await page.setViewportSize({width:1000,height:1000});
  await expect(page.getByRole('menuitem',{name:'Menü',exact:true})).toBeVisible();
  await expect(current(page)).toHaveText(expected==='First'?['test.first']:expected==='Second'?['test.second']:[]);
  if(expected==='Third')await expect(page.locator('.blade-navigation-row .dhx_menu-nav > li > button')).toHaveText(['Menü','test.third']);
 }
 await page.setViewportSize({width:1720,height:1000});
 views=[base('test.top','records'),{...base('test.detail','records'),record:'records'}];
 await page.reload();
 await expect(page.locator('.blade-workspace')).toHaveText('test.detail');
 await expect(current(page)).toHaveText(['test.top']);
 // A document window leaves the page's menu context and address in place.
 views=[...pages,{...base('test.detail','records'),record:'records'}];
 await page.goto('/#view=test.third');
 await expect(current(page)).toHaveText(['Third']);
 await page.evaluate(()=>menuFixtureApp.navigate({view:'test.detail',record:'42',open:'window'}));
 await expect(page.locator('.blade-feature-window')).toBeVisible();
 await expect(page).toHaveURL(/#view=test.third$/);
 await expect(current(page)).toHaveText(['Third']);
 expect(errors).toEqual([]);
});

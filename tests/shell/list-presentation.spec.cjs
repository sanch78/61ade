const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const bundle=require('esbuild').buildSync({stdin:{contents:'export {Workspace} from "./packages/frontend/src/Workspace"; export {setTheme} from "@dhtmlx/suite";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
async function mount(page,options={}){
 await page.route('**/list-fixture',route=>route.fulfill({contentType:'text/html',body:'<div id="vapa-application"></div>'}));
 await page.goto('/list-fixture');await page.setContent('<div id="vapa-application"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(options=>{
  const fields=[{id:'title',header:'Cím'},{id:'description',header:'Leírás',type:'textarea'},{id:'active',header:'Aktív',type:'checkbox',options:{0:'Nem',1:'Igen'}}];
  const rows=Array.from({length:30},(_,i)=>({id:String(i+1),title:'Synthetic '+i,description:'Long description '+i,active:'1',revision:'r'+i,_actions:['get','archive']}));
  window.requests=[];
  window.fetch=async(url,config)=>{
   const request=JSON.parse(config.body);requests.push(request);
   let data;
   if(request.action==='list'||request.action==='__watch')data={items:rows,previous:null,next:null,version:'v1'};
   if(request.action==='get')data={...rows.find(row=>row.id===request.id),description:'Details <img src=x onerror=alert(1)>'};
   if(request.action==='__form')data={fields:[],values:rows.find(row=>row.id===request.id)};
   if(request.action==='__bulk')data=request.values.items.map(item=>({id:item.id,ok:true}));
   return {ok:true,json:async()=>({ok:true,data})};
  };
  fixture.setTheme('skyblue',document.documentElement);
  window.workspace=new fixture.Workspace(document.getElementById('vapa-application'),{resource:'items',title:'Elemek',columns:[fields[0]],detailFields:fields,actions:[{name:'get',label:'Adatok',fields:[]},{name:'archive',label:'Archiválás',submitLabel:'Végrehajtás',write:true,bulk:true,fields:[]}],singleton:false,filters:[],sortable:[],layout:{formMode:'overlay',tree:{cols:[{id:'grid',header:'Találatok'}]}},selection:true,...options},'csrf',{transport:'poll',endpoint:'live',interval:60000});
 },options);
 await expect(page.locator('.dhx_grid')).toBeVisible();
 expect(await page.locator('.dhx_grid-content').evaluate(element=>getComputedStyle(element).borderLeftWidth)).toBe('0px');
}
test('cards use multiple columns; details include fields outside the grid; marks survive mode changes and support bulk',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1400,height:900});await mount(page);
 await expect(page.locator('[data-dhx-col-id="_number"]').first()).toBeVisible();
 await page.locator('.dhx_grid-cell[data-dhx-col-id="_number"]').first().dblclick();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Details <img');await expect(dialog.locator('img')).toHaveCount(0);
 await expect(dialog).toContainText('Aktív');await dialog.getByRole('button',{name:'Close',exact:false}).click();
 await page.getByLabel('Sor jelölése: 1',{exact:true}).filter({visible:true}).check();await page.getByLabel('Sor jelölése: 2',{exact:true}).filter({visible:true}).check();
 await expect(page.getByRole('button',{name:'Archiválás — jelöltek',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
 const cards=page.locator('.vapa-grid-card');await expect(cards.first()).toContainText('Long description');
 const first=await cards.nth(0).boundingBox(),second=await cards.nth(1).boundingBox();
 expect(Math.abs(first.y-second.y)).toBeLessThan(2);expect(second.x).toBeGreaterThan(first.x+300);
 await expect(page.getByLabel('Sor jelölése: 1',{exact:true}).filter({visible:true})).toBeChecked();
 await page.setViewportSize({width:390,height:844});
 const mobileFirst=await cards.nth(0).boundingBox(),mobileSecond=await cards.nth(1).boundingBox();expect(mobileSecond.y).toBeGreaterThan(mobileFirst.y);
 await page.setViewportSize({width:1400,height:900});
 await page.getByRole('button',{name:'Archiválás — jelöltek',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Végrehajtás (2 sor)',exact:true}).click();
 await expect(page.getByText('Sikeres: 2, sikertelen: 0.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>requests.find(request=>request.action==='__bulk').values.items.map(item=>item.id))).toEqual(['1','2']);
 await page.getByRole('button',{name:'confirm',exact:true}).click();
 await page.evaluate(()=>workspace.destroy());expect(errors).toEqual([]);
});
test('toolbar stays inside its cell and above scrolling grid/cards in all themes; numbering can be disabled',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await mount(page,{rowNumbers:false});
 await expect(page.locator('[data-dhx-col-id="_number"]')).toHaveCount(0);
 for(const theme of ['skyblue','light','dark']){
  await page.evaluate(theme=>fixture.setTheme(theme,document.documentElement),theme);
  const bounds=await page.locator('.vapa-command-row').evaluate(cell=>{
   const outer=cell.getBoundingClientRect(),toolbar=cell.querySelector('.dhx_toolbar').getBoundingClientRect();
   return {outer:{top:outer.top,bottom:outer.bottom},toolbar:{top:toolbar.top,bottom:toolbar.bottom},buttons:[...cell.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {top:r.top,bottom:r.bottom};})};
  });
  expect(bounds.toolbar.bottom).toBeLessThanOrEqual(bounds.outer.bottom);for(const button of bounds.buttons){expect(button.top).toBeGreaterThanOrEqual(bounds.outer.top);expect(button.bottom).toBeLessThanOrEqual(bounds.outer.bottom);}
  await page.locator('.dhx_grid').hover();await page.mouse.wheel(0,500);
  await expect.poll(()=>page.evaluate(()=>workspace.grid.table.getScrollState().y)).toBeGreaterThan(0);
  const button=page.getByRole('button',{name:'Adatok',exact:true});await expect(button).toBeVisible();
  await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
  await page.locator('.vapa-grid-cards').evaluate(element=>element.scrollTop=500);
  await expect.poll(()=>page.locator('.vapa-grid-cards').evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  const hit=await button.evaluate(element=>{const box=element.getBoundingClientRect();return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));});expect(hit).toBe(true);
  await page.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Táblázat',{exact:true}).click();
 }
 await page.screenshot({path:path.join(process.env.VAPA_TMP_DIR,'list-presentation.png')});await page.evaluate(()=>workspace.destroy());
});

test('view dropdown is last; editable headings reserve space for the hover sort icon',async({page})=>{
 await mount(page,{columns:[{id:'title',header:'Szerkeszthető mező',editable:true,width:260}],sortable:['title']});
 const toolbar=page.locator('.vapa-command-row');
 await expect(toolbar.getByRole('button').last()).toHaveText('Nézet: Táblázat');
 await expect(page.getByText('Kártyák',{exact:true})).toHaveCount(0);
 const header=page.locator('[role="columnheader"][data-dhx-id="title"]');
 await header.hover();
 const spacing=await header.locator('.dhx_grid-header-cell-text').evaluate(element=>({padding:parseFloat(getComputedStyle(element).paddingRight),labelWidth:getComputedStyle(element.querySelector('.dhx_grid-header-cell-text_content')).width,width:element.clientWidth}));
 expect(spacing.padding).toBe(24);expect(parseFloat(spacing.labelWidth)).toBeLessThan(spacing.width-24);
 await header.screenshot({path:path.join(process.env.VAPA_TMP_DIR,'header-editable-hover.png')});
 await header.click();await expect(header).toHaveAttribute('aria-sort','ascending');
 await expect(header.locator('.dhx_grid-sort-icon')).toBeHidden();
 await header.screenshot({path:path.join(process.env.VAPA_TMP_DIR,'header-editable-sorted.png')});
 await toolbar.getByRole('button',{name:/^Nézet:/}).click();await page.getByText('Kártyák',{exact:true}).click();
 await expect(toolbar.getByRole('button').last()).toHaveText('Nézet: Kártyák');
 await page.evaluate(()=>workspace.destroy());
});

const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const bundle=require('esbuild').buildSync({stdin:{contents:'export {Workspace} from "./packages/frontend/src/Workspace"; export {setTheme} from "@dhtmlx/suite";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false}).outputFiles[0].text;
// Synthetic hierarchy of one resource: records 1–3 at the top, 11 and 12 under 1. The sub-view is the same
// resource (`shared`), so it has no toolbar of its own and the parent's toolbar acts on its cursor record.
async function mount(page){
 await page.route('**/subview-fixture',route=>route.fulfill({contentType:'text/html',body:'<div id="blade-application"></div>'}));
 await page.goto('/subview-fixture');await page.setContent('<div id="blade-application" style="height:700px"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const record=(id,parent)=>({id,title:'Elem '+id,parent_id:parent,revision:'r'+id,_actions:['get','archive']});
  const rows=[record('1',''),record('2',''),record('3',''),record('11','1'),record('12','1'),...Array.from({length:12},(_,i)=>record(String(21+i),'2'))];
  // `_subview` is the server's child count; 3 and the children have none, 11 leaves it unknown (expandable).
  for(const row of rows)row._subview=rows.filter(child=>child.parent_id===row.id).length;delete rows[3]._subview;
  window.requests=[];
  window.fetch=async(url,config)=>{
   const request=JSON.parse(config.body);requests.push(request);
   const parent=(request.values?.filters??request.values?.query?.filters)?.parent_id??'';
   let data;
   if(request.action==='list'||request.action==='__watch'){const items=rows.filter(row=>row.parent_id===parent);data={items,previous:null,next:null,version:'v1',total:rows.length,matched:items.length};}
   if(request.action==='archive')data={};
   return {ok:true,json:async()=>({ok:true,data})};
  };
  fixture.setTheme('skyblue',document.documentElement);
  window.workspace=new fixture.Workspace(document.getElementById('blade-application'),{resource:'items',title:'Elemek',
   columns:[{id:'title',header:'Cím'},{id:'parent_id',header:'Szülő'}],
   actions:[{name:'get',label:'Adatok',fields:[]},{name:'archive',label:'Archiválás',submitLabel:'Végrehajtás',write:true,fields:[]}],
   singleton:false,filters:[],sortable:[],layout:{formMode:'overlay',tree:{rows:[{id:'grid'}]}},
   subview:{resource:'items',field:'parent_id',height:200,shared:true}},'',{transport:'poll',endpoint:'live',interval:60000});
 });
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}

test('a preview fits its records and scrolls only above 5–10 rows (by the viewport height)',async({page})=>{
 await page.setViewportSize({width:1200,height:800});await mount(page);
 const body=page.locator('.blade-subview-host .dhx_grid-body');
 await page.locator('.dhx_grid-row').filter({hasText:'Elem 1'}).first().locator('.blade-subrow-toggle').click();
 await expect(page.locator('.blade-subview-host .dhx_grid-row')).toHaveCount(2);
 await expect.poll(()=>body.evaluate(element=>element.scrollHeight-element.clientHeight)).toBeLessThanOrEqual(0);
 await page.locator('.dhx_grid-row').filter({hasText:'Elem 1'}).first().locator('.blade-subrow-toggle').click();
 await page.locator('.dhx_grid-row').filter({hasText:'Elem 2'}).first().locator('.blade-subrow-toggle').click();
 // 40 % of 800 px is 8 rows of 40 px: the twelve children scroll after eight.
 await expect.poll(()=>body.evaluate(element=>Math.round((element.clientHeight-element.querySelector('.dhx_header-wrapper').offsetHeight)/40))).toBe(8);
 expect(await body.evaluate(element=>element.scrollHeight>element.clientHeight)).toBe(true);
 await page.evaluate(()=>workspace.destroy());
});

test('a same-resource sub-view shares the parent toolbar: its cursor record takes the actions over',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1200,height:800});await mount(page);
 const archive=page.getByRole('button',{name:'Archiválás',exact:true});
 await expect(archive).toBeDisabled();
 await page.locator('.dhx_grid-row').filter({hasText:'Elem 1'}).first().locator('.blade-subrow-toggle').click();
 const nested=page.locator('.blade-subview-host .blade-subview');
 await expect(nested.locator('.dhx_grid-row')).toHaveCount(2);
 // The nested list is scoped to its parent and has no toolbar or scope column of its own.
 expect(await page.evaluate(()=>requests.some(request=>request.action==='list'&&request.values.filters?.parent_id==='1'))).toBe(true);
 await expect(nested.getByRole('button',{name:'Archiválás',exact:true})).toHaveCount(0);
 await expect(nested.getByText('Szülő',{exact:true})).toHaveCount(0);
 await nested.locator('.dhx_grid-row').filter({hasText:'Elem 12'}).click();
 await expect(archive).toBeEnabled();
 await archive.click();
 await expect.poll(()=>page.evaluate(()=>requests.filter(request=>request.action==='archive').map(request=>request.id))).toEqual(['12']);
 // Selecting a parent record gives the toolbar back to the parent list.
 await page.locator('.dhx_grid-row').filter({hasText:'Elem 3'}).first().click();
 await archive.click();
 await expect.poll(()=>page.evaluate(()=>requests.filter(request=>request.action==='archive').map(request=>request.id))).toEqual(['12','3']);
 // Collapsing removes the nested view and its live subscription.
 await page.locator('.dhx_grid-row').filter({hasText:'Elem 1'}).first().locator('.blade-subrow-toggle').click();
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 await page.evaluate(()=>workspace.destroy());
 await expect(page.locator('.blade-subview-layer')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('a record without sub-items has no toggle and does not expand; a count dropping to 0 collapses it',async({page})=>{
 await page.setViewportSize({width:1200,height:800});await mount(page);
 const row=name=>page.locator('.dhx_grid-row').filter({hasText:name}).first();
 await expect(row('Elem 1').locator('.blade-subrow-toggle')).toHaveCount(1);
 await expect(row('Elem 3').locator('.blade-subrow-toggle')).toHaveCount(0);
 await row('Elem 3').locator('.dhx_grid-cell').first().click();
 await page.keyboard.press('Enter');
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 await expect(page.locator('.blade-dialog-overlay')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Alelemek',exact:true})).toBeDisabled();
 await row('Elem 1').locator('.dhx_grid-cell').filter({hasText:'Elem 1'}).click();
 await expect(page.getByRole('button',{name:'Alelemek',exact:true})).toBeEnabled();
 await row('Elem 1').locator('.blade-subrow-toggle').click();
 await expect(page.locator('.blade-subview-host .dhx_grid-row')).toHaveCount(2);
 // The preview frame is one border: the host has none and the spanned sub-row draws no bottom line of its own.
 // One bottom edge: the preview frame; its last row draws no line just above it.
 const edge=await page.locator('.blade-subview-host .blade-subview').evaluate(e=>{const rows=e.querySelectorAll('.dhx_grid_data .dhx_grid-row'),last=rows[rows.length-1];return {frame:getComputedStyle(e).borderBottomWidth,row:getComputedStyle(last).borderBottomColor,cell:getComputedStyle(last.firstElementChild).borderBottomColor};});
 expect(edge).toEqual({frame:'1px',row:'rgba(0, 0, 0, 0)',cell:'rgba(0, 0, 0, 0)'});
 await page.evaluate(()=>{const rows=workspace.rows.map(row=>row.id==='1'?{...row,_subview:0}:row);workspace.grid.setRows(rows);});
 await expect(page.locator('.blade-subview-host')).toHaveCount(0);
 await expect(row('Elem 1').locator('.blade-subrow-toggle')).toHaveCount(0);
 await page.evaluate(()=>workspace.destroy());
});

test('a card opens the full child view with its sub-view button; no button without sub-items',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});await mount(page);
 const card=name=>page.locator('.blade-grid-card').filter({hasText:name}).first();
 await expect(card('Elem 1')).toBeVisible();
 await expect(card('Elem 3').locator('.blade-card-subview')).toHaveCount(0);
 await expect(page.locator('.blade-grid-card .blade-subrow-toggle')).toHaveCount(0);
 const button=card('Elem 1').getByRole('button',{name:'Alelemek (2)'});
 await expect(button).toBeVisible();
 expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(40);
 await button.focus();await page.keyboard.press('Enter');
 const dialog=page.locator('.blade-feature-window');
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('.dhx_grid-row, .blade-grid-card')).toHaveCount(2);
 const box=await dialog.boundingBox();expect(box.width).toBeGreaterThanOrEqual(389);
 expect(await page.locator('.blade-subview-host').count()).toBe(0);
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await page.evaluate(()=>workspace.destroy());
 expect(errors).toEqual([]);
});

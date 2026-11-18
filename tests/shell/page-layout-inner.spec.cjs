const {test,expect,guide}=require('../../tools/playwright-test.cjs');
const {signIn,openView}=require('./feature-demo.cjs');
// A PageLayout region's inner layout (`inner`, FB-0222, docs/toolkit.md#pagelayout-inner) through the feature demo's D12
// `Médiaböngésző` (docs/demos.md#d12-media-browser): the framed `Médialapok` panel beside the framed `Kiválasztott
// médialap` panel, whose inner layout holds the data (320 px, resizable) beside the image (no size) over the brief
// (200 px, the last region, resizable), each with its own component or element. The tree checks run on a fixture page.
// Read-only: the sizes live in the browser's UiPreferences, which every test context starts without.

const MODULE='/page-layout-inner-fixture.mjs';
const page$=page=>page.locator('.blade-page-layout').first();
// The outer panels, and the inner regions inside the holder (a list inside a panel has cells of its own).
const inner=page=>page$(page).locator('[data-cell-id="selected"]').first();
const region=(page,id)=>(id==='sheets'||id==='selected'?page$(page):inner(page)).locator(`[data-cell-id="${id}"]`).first();
const box=locator=>locator.evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
const grip=(page,axis)=>inner(page).locator(`.dhx_layout-resizer--${axis} .dhx_layout-resizer__icon`);
function watch(page){
 const seen=[];
 page.on('pageerror',error=>seen.push(error.message));
 page.on('console',message=>{if(message.type()==='error')seen.push(message.text());});
 return seen;
}
async function closeGuide(page){
 const window=guide(page);
 // The spec's locator handler may close it first; the mouse drags below need it gone.
 if(await window.isVisible())await window.getByRole('button',{name:/close|Bezárás/i}).first().click({timeout:3000}).catch(()=>{});
 await expect(window).toHaveCount(0);
}
async function browser(page,title='Médiaböngésző',group){
 await openView(page,title,group);
 await expect(region(page,'brief')).toBeVisible();
 await closeGuide(page);
}
async function select(page,title='Éjszakai komp a ködben'){
 const row=page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:title}).first();
 const cell=row.locator('[data-dhx-col-id="title"]');
 if(await cell.count())await cell.click();else await row.click();
 await expect(region(page,'brief').getByRole('region',{name:/^(Leírás|Description)$/})).toBeVisible();
}
// Drags a line's handle by $by pixels across it, from a point off its centre (the dots), to use the hit area.
async function drag(page,axis,by){
 const handle=await box(grip(page,axis));
 const x=handle.x+handle.width/2+(axis==='y'?120:1.5),y=handle.y+handle.height/2+(axis==='x'?120:1.5);
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(x+(axis==='x'?by:0),y+(axis==='y'?by:0),{steps:8});await page.mouse.up();
}
async function dblclick(page,axis){const handle=await box(grip(page,axis));await page.mouse.dblclick(handle.x+handle.width/2,handle.y+handle.height/2);}
const sizes=async page=>({data:(await box(region(page,'data'))).width,image:(await box(region(page,'image'))).height,brief:(await box(region(page,'brief'))).height,
 panel:(await box(inner(page).locator('.dhx_layout-cell-content').first())).height});

test('1366 px: framed panels, the inner regions without frames or headers, each holding its own component',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 await browser(page);
 // The framed panels keep their headers; the inner layout is a line layout with no header of its own regions.
 await expect(page$(page)).toHaveClass(/dhx_layout-space/);
 await expect(page$(page).locator('.dhx_layout-cell-header')).toHaveText(['Médialapok','Kiválasztott médialap']);
 await expect(inner(page).locator('.dhx_layout-line').first()).toBeVisible();
 await expect(inner(page).locator('.dhx_layout-resizer')).toHaveCount(2);
 for(const axis of ['x','y']){
  await expect(grip(page,axis)).toBeVisible();
  const handle=await box(grip(page,axis));
  expect(axis==='x'?handle.width:handle.height).toBeGreaterThanOrEqual(8);
 }
 // Before a selection every inner region shows its placeholder.
 for(const id of ['data','image','brief'])await expect(region(page,id)).toContainText('Válassz egy médialapot a listában.');
 await select(page);
 await expect(region(page,'data').locator('.blade-record-details')).toContainText('Folyami Révhajózás');
 const picture=region(page,'image').getByRole('img').first();
 await expect(picture).toBeVisible();
 await expect(region(page,'brief')).toContainText('éjszakai járatokat');
 // The declared sizes; the image has no size of its own and fills the rest of the panel.
 const now=await sizes(page);
 expect(now.data).toBeCloseTo(320,0);expect(now.brief).toBeCloseTo(200,0);
 expect(now.image+now.brief).toBeGreaterThan(now.panel-4);
 const image=await box(picture),cell=await box(region(page,'image'));
 expect(image.width).toBeLessThanOrEqual(cell.width+1);expect(image.height).toBeLessThanOrEqual(cell.height+1);
 expect(seen).toEqual([]);
});

test('1366 px: the inner lines move both neighbours, the sizes come back after a reload and a double-click restores them',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 await browser(page);await select(page);
 const picture=region(page,'image').getByRole('img').first(),before=await box(picture);
 await drag(page,'x',80);
 await drag(page,'y',-100);
 let now=await sizes(page);
 expect(now.data).toBeGreaterThan(380);expect(now.brief).toBeGreaterThan(280);
 expect(now.image+now.brief).toBeGreaterThan(now.panel-4);
 await expect.poll(async()=>(await box(picture)).height).toBeLessThan(before.height);
 const dragged=now;
 await page.reload();
 await expect(region(page,'brief')).toBeVisible();await closeGuide(page);
 now=await sizes(page);
 expect(now.data).toBeCloseTo(dragged.data,0);expect(now.brief).toBeCloseTo(dragged.brief,0);
 expect(now.image+now.brief).toBeGreaterThan(now.panel-4);
 await dblclick(page,'x');await dblclick(page,'y');
 await expect.poll(async()=>(await sizes(page)).data).toBeCloseTo(320,0);
 await expect.poll(async()=>(await sizes(page)).brief).toBeCloseTo(200,0);
 // The framed panel holding the inner layout still collapses and opens with its header.
 await region(page,'sheets').locator('.dhx_layout-cell-header').click();
 await expect.poll(async()=>(await box(region(page,'data'))).width).toBeCloseTo(320,0);
 await expect.poll(async()=>(await box(inner(page))).width).toBeGreaterThan(1100);
 await region(page,'sheets').locator('.dhx_layout-cell-header').click();
 await expect.poll(async()=>(await box(inner(page))).width).toBeLessThan(1000);
 expect(seen).toEqual([]);
});

test('390 px: the panels and the inner regions stacked, without horizontal scrolling',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:390,height:800});await signIn(page);
 await browser(page);await select(page);
 const data=await box(region(page,'data')),image=await box(region(page,'image')),brief=await box(region(page,'brief'));
 expect(image.y).toBeGreaterThanOrEqual(data.y+data.height);expect(brief.y).toBeGreaterThanOrEqual(image.y+image.height);
 expect(Math.abs(data.width-image.width)).toBeLessThan(2);
 await expect(inner(page).locator('.dhx_layout-resizer--y')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
 expect(seen).toEqual([]);
});

test('English names the panel and the brief; the inner lines show in every factory theme',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 try{
  await page.getByRole('button',{name:'Magyar',exact:true}).click();await page.getByText('English',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await browser(page,'Media browser','Feature demo');
  await expect(region(page,'selected').locator('.dhx_layout-cell-header').first()).toHaveText('Selected media sheet');
  await expect(region(page,'data')).toContainText('Select a media sheet in the list.');
  await select(page);
  await expect(region(page,'brief').getByRole('region',{name:'Description',exact:true})).toBeVisible();
  // The data region's `fields` are the translated `Adatok` section's (FB-0223).
  await expect(region(page,'data').locator('.blade-record-details dt')).toHaveText(['Name','Client','Channel','Year']);
 }finally{
  await page.getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','hu');
 }
 for(const theme of ['blade','blade-night','light','dark']){
  await page.evaluate(theme=>localStorage.setItem('blade-theme',theme),theme);await page.reload();
  await expect(region(page,'brief')).toBeVisible();
  const lines=await inner(page).evaluate(panel=>{
   const style=element=>getComputedStyle(element),data=panel.querySelector('[data-cell-id="data"]'),image=panel.querySelector('[data-cell-id="image"]');
   const upper=image.parentElement;
   return {right:style(data).borderRightWidth,color:style(data).borderRightColor,bottom:style(upper).borderBottomWidth,top:style(data).borderTopWidth,radius:style(data).borderTopLeftRadius};
  });
  expect(lines.right,theme).toBe('1px');expect(lines.bottom,theme).toBe('1px');
  expect(lines.color,theme).not.toBe('rgba(0, 0, 0, 0)');
  expect(lines.top,theme).toBe('0px');expect(lines.radius,theme).toBe('0px');
 }
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
 expect(seen).toEqual([]);
});

// The tree rules on a fixture page: a project module exposes `app`; each tree is built into a detached element.
async function fixture(page){
 await page.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',body:'export default app=>{window.__bladeApp=app;};'}));
 await page.route(url=>url.pathname==='/'&&!url.searchParams.has('blade'),async route=>{
  const request=route.request();
  if(request.method()!=='GET'||request.resourceType()!=='document')return route.fallback();
  const response=await route.fetch();
  const body=(await response.text()).replace(/(<script type="application\/json" id="blade-config">)([\s\S]*?)(<\/script>)/,(all,open,json,close)=>{
   const config=JSON.parse(json);if(!config.authenticated)return all;
   config.modules=[...(config.modules??[]),MODULE];
   return open+JSON.stringify(config).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')+close;
  });
  await route.fulfill({response,body});
 });
}
test('the tree rules: inner regions are page regions, the holder is not; a tree of only inner is frameless',async({page})=>{
 const seen=watch(page);
 await fixture(page);await signIn(page);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
 const result=await page.evaluate(async()=>{
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const app=window.__bladeApp,out={};
  const build=(tree,id='fixture.inner')=>{const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:900px;height:600px';document.body.append(host);const layout=new app.components.PageLayout({id,tree});layout.mount(host);return {layout,host};};
  const error=fn=>{try{fn();return '';}catch(e){return `${e.name}: ${e.message}`;}};
  const {layout,host}=build({cols:[{id:'side',header:'Side',width:200},{id:'holder',header:'Holder',collapsable:true,inner:{cols:[{id:'a',width:200,resizable:true},{rows:[{id:'b'},{id:'c',height:120,resizable:true}]}]}}]});
  out.cells=['side','a','b','c'].map(id=>!!layout.cell(id));
  out.holder=error(()=>layout.cell('holder'));
  out.collapse=layout.collapse('holder');out.expand=layout.expand('holder');
  const element=document.createElement('p');element.textContent='attached';layout.attach('b',element);await frame();out.attached=host.querySelector('[data-cell-id="b"]').textContent.includes('attached');
  // `resizable` on the last region draws the line before it.
  out.lines=host.querySelectorAll('[data-cell-id="holder"] .dhx_layout-resizer').length;
  layout.destroy();host.remove();
  const frameless=build({inner:{rows:[{id:'top',height:200,resizable:true},{id:'bottom'}]}},'fixture.frameless');
  out.frameless=[frameless.host.querySelector('.blade-page-layout').classList.contains('dhx_layout-line'),frameless.host.querySelectorAll('.dhx_layout-cell-header').length];
  frameless.layout.destroy();frameless.host.remove();
  out.rejected=[
   {cols:[{id:'x',inner:{rows:[{id:'y',header:'No'}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'y',collapsable:true}]}}]},
   {cols:[{id:'x',inner:{rows:[{tabs:[{id:'t',header:'T'}]}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'y',inner:{rows:[{id:'z'}]}}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'y'}]},rows:[{id:'z'}]}]},
   {cols:[{id:'x',inner:{rows:[{id:'y'}],height:40}}]},
   {cols:[{collapsable:true,inner:{rows:[{id:'y'}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'x'}]}}]},
   {tabs:[{id:'t',header:'T',inner:{rows:[{id:'y'}]}}]},
  ].map(tree=>error(()=>new app.components.PageLayout({id:'fixture.bad',tree})));
  return out;
 });
 expect(result.cells).toEqual([true,true,true,true]);
 expect(result.holder).toContain('holds an inner layout');
 expect([result.collapse,result.expand]).toEqual([true,false]);
 expect(result.attached).toBe(true);
 expect(result.lines).toBe(2);
 expect(result.frameless).toEqual([true,0]);
 for(const message of result.rejected)expect(message).toMatch(/^TypeError: 61ade: PageLayout: /);
 expect(seen).toEqual([]);
});

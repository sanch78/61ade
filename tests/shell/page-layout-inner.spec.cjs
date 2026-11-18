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
   {cols:[{id:'x',inner:{rows:[{header:'No',cols:[{id:'y'}]}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'y',header:' '}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'y',count:2}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'y',header:'Y',count:-1}]}}]},
   {cols:[{id:'x',inner:{rows:[{id:'y',header:'Y',count:1.5}]}}]},
   {cols:[{id:'x',header:'X',count:2}]},
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

// Headed inner regions (FB-0227, docs/toolkit.md#pagelayout-inner-header) on the fixture page: the title row with its
// badge over the content, the placeholder and mounted content below it, live changes, the landmark's name, a region
// without a header unchanged.
test('an inner region header: title and count over its own scrolling content, changed live, named for assistive technology',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});
 await fixture(page);await signIn(page);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
 await page.evaluate(()=>{
  const app=window.__bladeApp,host=document.createElement('div');
  host.id='fixture-headed';host.style.cssText='position:fixed;left:0;top:0;width:900px;height:600px;z-index:10000;background:var(--dhx-background-primary)';document.body.append(host);
  const layout=new app.components.PageLayout({id:'fixture.headed',tree:{inner:{cols:[
   {id:'list',header:'Elemek',count:1234,width:300,resizable:true},
   {rows:[{id:'included',header:'Kiválasztott'},{id:'excluded',header:'Kizárt',count:0,height:200,minHeight:120,resizable:true}]},
   {id:'plain',width:160}]}}});
  layout.mount(host);window.__headed=layout;
  const long=document.createElement('div');long.className='fixture-long';long.style.height='2000px';long.textContent='long content';layout.attach('list',long);
  layout.placeholder('excluded',{text:'Nincs kizárt elem.'});
 });
 const host=page.locator('#fixture-headed');
 const head=id=>host.locator(`[data-cell-id="${id}"] .blade-inner-header`);
 await expect(head('list')).toBeVisible();
 // The title and the badge in the locale's format (the visual digit is hidden; the spoken count is in the name).
 await expect(head('list').locator('.blade-inner-header__title')).toHaveText('Elemek');
 await expect(head('list').locator('.blade-inner-header__count')).toHaveText(/^1\s?234$/);
 await expect(head('list').locator('.blade-inner-header__count')).toHaveAttribute('aria-hidden','true');
 await expect(head('excluded').locator('.blade-inner-header__count')).toHaveText('0');
 await expect(head('included').locator('.blade-inner-header__count')).toBeHidden();
 await expect(host.getByRole('region',{name:/^Elemek 1\s?234 elem$/})).toBeVisible();
 await expect(host.getByRole('region',{name:'Kizárt 0 elem',exact:true})).toBeVisible();
 await expect(host.getByRole('region',{name:'Kiválasztott',exact:true})).toBeVisible();
 // The look: one row with padding and a line below it, a pill badge, no frame or collapse button.
 const look=await head('list').evaluate(element=>{const style=getComputedStyle(element),badge=getComputedStyle(element.querySelector('.blade-inner-header__count'));
  return {bottom:style.borderBottomWidth,top:style.borderTopWidth,padding:[style.paddingTop,style.paddingLeft,style.paddingBottom],minWidth:badge.minWidth,radius:parseFloat(badge.borderTopLeftRadius),badgeBackground:badge.backgroundColor};});
 expect(look.bottom).toBe('1px');expect(look.top).toBe('0px');
 expect(look.padding).toEqual(['10px','20px','8px']);expect(look.minWidth).toBe('20px');expect(look.radius).toBeGreaterThanOrEqual(10);
 expect(look.badgeBackground).not.toBe('rgba(0, 0, 0, 0)');
 await expect(host.locator('.dhx_layout-cell-header')).toHaveCount(0);
 // The content is below the header and scrolls on its own; the header stays.
 const headBox=await box(head('list')),content=await box(host.locator('.fixture-long'));
 expect(content.y).toBeGreaterThanOrEqual(headBox.y+headBox.height-1);
 const scrolled=await host.locator('.fixture-long').evaluate(element=>{let node=element.parentElement;while(node&&node.scrollHeight<=node.clientHeight)node=node.parentElement;node.scrollTop=500;return node.scrollTop;});
 expect(scrolled).toBeGreaterThan(0);
 expect(await box(head('list'))).toEqual(headBox);
 // The placeholder of an empty headed region is below its header; the declared height is the whole region's.
 await expect(host.locator('[data-cell-id="excluded"]')).toContainText('Nincs kizárt elem.');
 const excluded=await box(host.locator('[data-cell-id="excluded"]')),status=await box(host.locator('[data-cell-id="excluded"] .blade-status'));
 expect(excluded.height).toBeCloseTo(200,0);
 expect(status.y).toBeGreaterThanOrEqual((await box(head('excluded'))).y+(await box(head('excluded'))).height-1);
 // A region without header is unchanged: its own cell, no header row and no landmark.
 await expect(host.locator('[data-cell-id="plain"] .blade-inner-header')).toHaveCount(0);
 await expect(host.locator('[data-cell-id="plain"]')).not.toHaveAttribute('role','region');
 const cells=await page.evaluate(()=>{const layout=window.__headed;return {plain:layout.cell('plain').id,excluded:layout.cell('excluded').id};});
 expect(cells.plain).toBe('plain');expect(cells.excluded).not.toBe('excluded');
 // Live changes: the count, the title, hiding the badge; errors for other ids and values.
 const errors=await page.evaluate(()=>{
  const layout=window.__headed,error=fn=>{try{fn();return '';}catch(e){return `${e.name}: ${e.message}`;}};
  layout.header('excluded',{count:3});layout.header('included',{label:'Kijelölt',count:7});layout.header('list',{count:null});
  return [error(()=>layout.header('plain',{count:1})),error(()=>layout.header('nope',{count:1})),error(()=>layout.header('excluded',{count:-1})),
   error(()=>layout.header('excluded',{label:''})),error(()=>layout.header('excluded',{title:'X'}))];
 });
 expect(errors[0]).toMatch(/^Error: .*has no header/);expect(errors[1]).toMatch(/^Error: .*has no region/);
 for(const message of errors.slice(2))expect(message).toMatch(/^TypeError: 61ade: PageLayout\.header: /);
 await expect(head('excluded').locator('.blade-inner-header__count')).toHaveText('3');
 await expect(host.getByRole('region',{name:'Kizárt 3 elem',exact:true})).toBeVisible();
 await expect(host.getByRole('region',{name:'Kijelölt 7 elem',exact:true})).toBeVisible();
 await expect(head('list').locator('.blade-inner-header__count')).toBeHidden();
 await expect(host.getByRole('region',{name:'Elemek',exact:true})).toBeVisible();
 // Mounted content after the changes is still below the header.
 await page.evaluate(()=>{const element=document.createElement('p');element.className='fixture-mounted';element.textContent='mounted';window.__headed.attach('excluded',element);});
 await expect(host.locator('[data-cell-id="excluded"] .fixture-mounted')).toBeVisible();
 // The placeholder ends with the content (the status element stays, idle and visually hidden).
 await expect(host.locator('[data-cell-id="excluded"] .blade-status')).toHaveClass(/blade-status--idle/);
 await page.evaluate(()=>{window.__headed.destroy();document.getElementById('fixture-headed').remove();});
 expect(seen).toEqual([]);
});

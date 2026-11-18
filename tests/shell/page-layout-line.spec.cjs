const {test,expect,guide}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command}=require('./feature-demo.cjs');
// A frameless PageLayout (`frame: "line"`) and a long text read as a page (RecordDetails `longText: "reading"`),
// FB-0221, docs/toolkit.md#pagelayout and #recorddetails, through the feature demo's D11 preview `demo.media-proof`
// (docs/demos.md#d11-media-sheets): under the command bar and the tab bar the data (340 px, resizable) beside the image
// (only a minimum) over the brief (240 px, the last region, resizable). Read-only: the sizes live in the browser's
// UiPreferences, which every test context starts without.

const split=page=>page.locator('.blade-page-layout--line');
const region=(page,id)=>split(page).locator(`[data-cell-id="${id}"]`);
const box=locator=>locator.evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
const grip=(page,axis)=>split(page).locator(`.dhx_layout-resizer--${axis} .dhx_layout-resizer__icon`);
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
// The sheet's preview: its record page, then `Előnézet`.
async function preview(page,title='Éjszakai komp a ködben'){
 await openView(page,'Médialapok');
 await page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:title}).first().dblclick();
 // The sheet's record page first (its card), then the command (in `Műveletek` when the bar collapses at 390 px).
 await expect(page.locator('.blade-record-text')).toBeVisible();
 await command(page,'Előnézet');
 await expect(region(page,'text').getByRole('region',{name:'Leírás'})).toBeVisible();
 await closeGuide(page);
}
// Drags a line's handle by $by pixels across it, from a point off its centre (the dots), to use the hit area.
async function drag(page,axis,by){
 const handle=await box(grip(page,axis));
 const x=handle.x+handle.width/2+(axis==='y'?120:1.5),y=handle.y+handle.height/2+(axis==='x'?120:1.5);
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(x+(axis==='x'?by:0),y+(axis==='y'?by:0),{steps:8});await page.mouse.up();
}
async function dblclick(page,axis){const handle=await box(grip(page,axis));await page.mouse.dblclick(handle.x+handle.width/2,handle.y+handle.height/2);}
const sizes=async page=>({data:(await box(region(page,'data'))).width,image:(await box(region(page,'image'))).height,text:(await box(region(page,'text'))).height,
 column:(await box(region(page,'image').locator('xpath=..'))).height});
const reading=page=>region(page,'text').evaluate(cell=>{
 const article=cell.querySelector('.blade-record-details'),body=article.querySelector('.blade-record-text__body'),slot=article.parentElement;
 return {fill:article.classList.contains('blade-record-details--fill'),font:parseFloat(getComputedStyle(body).fontSize),
  text:body.scrollHeight-body.clientHeight,whole:slot.scrollHeight-slot.clientHeight,tab:body.getAttribute('tabindex')};
});

test('1366 px: a frameless split under the tab bar, dragged, kept after a reload and restored by a double-click',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 await preview(page);
 await expect(page.getByRole('tab',{name:'Előnézet'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tab',{name:'Adatlap'})).toBeVisible();
 // Frameless: a line Layout, no headers, two lines between the three regions.
 await expect(split(page)).toHaveClass(/dhx_layout-line/);
 await expect(split(page).locator('.dhx_layout-cell-header')).toHaveCount(0);
 await expect(split(page).locator('.dhx_layout-resizer')).toHaveCount(2);
 // Each line's handle is visible with a hit area across it (Suite's own is 0 px).
 for(const axis of ['x','y']){
  await expect(grip(page,axis)).toBeVisible();
  const handle=await box(grip(page,axis));
  expect(axis==='x'?handle.width:handle.height).toBeGreaterThanOrEqual(8);
 }
 // The declared sizes; the image has only a minimum and fills the rest of its column.
 let now=await sizes(page);
 expect(now.data).toBeCloseTo(340,0);expect(now.text).toBeCloseTo(240,0);
 expect(now.image+now.text).toBeGreaterThan(now.column-4);
 const picture=region(page,'image').getByRole('img').first();
 await expect(picture).toBeVisible();
 const fitted=async()=>{const image=await box(picture),cell=await box(region(page,'image'));return image.width<=cell.width+1&&image.height<=cell.height+1;};
 expect(await fitted()).toBe(true);
 const before=await box(picture);
 // Both lines move both neighbours; the image refits.
 await drag(page,'x',80);
 await drag(page,'y',-100);
 now=await sizes(page);
 expect(now.data).toBeGreaterThan(400);expect(now.text).toBeGreaterThan(320);
 expect(now.image+now.text).toBeGreaterThan(now.column-4);
 await expect.poll(fitted).toBe(true);
 expect((await box(picture)).height).toBeLessThan(before.height);
 const dragged=now;
 // The sizes come back after a reload.
 await page.reload();
 await expect(region(page,'text').getByRole('region',{name:'Leírás'})).toBeVisible();
 await closeGuide(page);
 now=await sizes(page);
 expect(now.data).toBeCloseTo(dragged.data,0);expect(now.text).toBeCloseTo(dragged.text,0);
 expect(now.image+now.text).toBeGreaterThan(now.column-4);
 // A double-click restores the declared sizes, and the image fills again.
 await dblclick(page,'x');await dblclick(page,'y');
 await expect.poll(async()=>(await sizes(page)).data).toBeCloseTo(340,0);
 await expect.poll(async()=>(await sizes(page)).text).toBeCloseTo(240,0);
 now=await sizes(page);expect(now.image+now.text).toBeGreaterThan(now.column-4);
 expect(seen).toEqual([]);
});

test('1366 px: the brief read as a page, named for assistive technology, its type growing with its region',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 await preview(page);
 const cell=region(page,'text');
 // The text alone: no frame, no visible label, a region named by the label.
 await expect(cell.locator('.blade-record-group')).toHaveCount(0);
 await expect(cell.locator('.blade-record-group__title')).toHaveCount(0);
 await expect(cell.locator('dt')).toHaveCount(0);
 await expect(cell.getByText('Leírás',{exact:true})).toHaveCount(0);
 const text=cell.locator('.blade-record-text--reading');
 expect(await text.evaluate(element=>{const s=getComputedStyle(element);return s.borderTopWidth+' '+s.borderLeftWidth;})).toBe('0px 0px');
 // It fills and scrolls on its own; the details around it do not scroll.
 let now=await reading(page);
 expect(now.fill).toBe(true);expect(now.whole).toBe(0);
 const small=now.font;
 expect(small).toBeGreaterThanOrEqual(16);
 // A larger region: larger type, within the maximum.
 await drag(page,'y',-260);
 await expect.poll(async()=>(await reading(page)).font).toBeGreaterThan(small);
 expect((await reading(page)).font).toBeLessThanOrEqual(34);
 // A 120 px region (the page sets --blade-record-text-min-height: 0px) still fills with its text and scrolls it.
 await dblclick(page,'y');
 await drag(page,'y',120);
 await expect.poll(async()=>Math.round((await box(cell)).height)).toBeLessThanOrEqual(122);
 now=await reading(page);
 expect(now.fill).toBe(true);expect(now.whole).toBe(0);expect(now.text).toBeGreaterThan(0);expect(now.tab).toBe('0');
 // The card tab keeps its framed card.
 await page.getByRole('tab',{name:'Adatlap'}).click();
 await expect(page.locator('.blade-record-text:not(.blade-record-text--reading) .blade-record-group__title').filter({hasText:'Leírás'})).toBeVisible();
 expect(seen).toEqual([]);
});

test('390 px: the data, the image and the brief stacked, the brief still filling its region',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:390,height:800});await signIn(page);
 await preview(page);
 const data=await box(region(page,'data')),image=await box(region(page,'image')),text=await box(region(page,'text'));
 expect(data.width).toBeCloseTo(390,0);expect(image.width).toBeCloseTo(390,0);expect(text.width).toBeCloseTo(390,0);
 expect(image.y).toBeGreaterThanOrEqual(data.y+data.height);expect(text.y).toBeGreaterThanOrEqual(image.y+image.height);
 expect(text.height).toBeCloseTo(220,0);
 await expect(split(page).locator('.dhx_layout-resizer--y')).toHaveCount(2);
 const now=await reading(page);
 expect(now.fill).toBe(true);expect(now.whole).toBe(0);expect(now.text).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
 expect(seen).toEqual([]);
});

test('English names the reading region by its translated label; the lines show in every factory theme',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 try{
  await page.getByRole('button',{name:'Magyar',exact:true}).click();await page.getByText('English',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await openView(page,'Media sheets','Feature demo');
  await page.locator('.dhx_grid-row').filter({hasText:'Éjszakai komp a ködben'}).first().dblclick();
  await page.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(region(page,'text').getByRole('region',{name:'Description',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Data sheet'})).toBeVisible();
 }finally{
  await page.getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','hu');
 }
 // Each factory theme (stored per browser): the regions are divided by a visible line and carry no frame of their own.
 for(const theme of ['blade','blade-night','light','dark']){
  await page.evaluate(theme=>localStorage.setItem('blade-theme',theme),theme);await page.reload();
  await expect(region(page,'text').getByRole('region',{name:'Leírás'})).toBeVisible();
  const lines=await split(page).evaluate(root=>{
   const style=element=>getComputedStyle(element),data=root.querySelector('[data-cell-id="data"]'),image=root.querySelector('[data-cell-id="image"]');
   return {right:style(data).borderRightWidth,rightColor:style(data).borderRightColor,bottom:style(image).borderBottomWidth,
    radius:style(data).borderTopLeftRadius,top:style(data).borderTopWidth};
  });
  expect(lines.right,theme).toBe('1px');expect(lines.bottom,theme).toBe('1px');
  expect(lines.rightColor,theme).not.toBe('rgba(0, 0, 0, 0)');
  expect(lines.top,theme).toBe('0px');expect(lines.radius,theme).toBe('0px');
 }
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
 expect(seen).toEqual([]);
});

const {test,expect,guide}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command}=require('./feature-demo.cjs');
// Record details layout (FB-0218, FB-0223, docs/toolkit.md#recorddetails, docs/workspaces.md#details-media-width)
// through the feature demo's D11 `Médialapok` (docs/demos.md#d11-media-sheets): a media field with `details_width: 480`
// alone in its section, the project's `minmax(0, 1fr) auto` columns for the view (`data-blade-view`), and the record
// page's plain RecordDetails with the brief inline below the groups. A fixture page checks `RecordDetails` `fields`, a
// media field alone in its section without a details width, and a long text's `placement` (FB-0225) on copies of
// `Mellékletek`. The seed images are 1672 × 941. Read-only: the spec writes
// no records; the English part switches the demo account's language and switches it back.
test.describe.configure({mode:'serial'});

const MODULE='/record-details-layout-fixture.mjs';
const WIDTH=480,HEIGHT=WIDTH*941/1672,NIGHT='Éjszakai komp a ködben';
const details=page=>page.locator('.blade-record-details[data-blade-view="demo_media_sheets"]');
const box=locator=>locator.evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
const pageOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
function watch(page){
 const seen=[];
 page.on('pageerror',error=>seen.push(error.message));
 page.on('console',message=>{if(message.type()==='error')seen.push(message.text());});
 return seen;
}
async function closeGuide(page){
 const window=guide(page);
 if(await window.isVisible())await window.getByRole('button',{name:/close|Bezárás/i}).first().click({timeout:3000}).catch(()=>{});
 await expect(window).toHaveCount(0);
}
// The record page of a sheet (double-click or Enter on its row or card), its guide closed.
async function sheet(page,title){
 await page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:title}).first().dblclick();
 await expect(details(page).locator('.blade-record-groups')).toBeVisible();
 await closeGuide(page);
}
// The brief below the groups: its distance and width against the groups, whether its text is cut, the details' scroll.
const brief=locator=>locator.evaluate(article=>{
 const groups=article.querySelector(':scope > .blade-record-groups').getBoundingClientRect(),wide=article.querySelector(':scope > .blade-record-wide');
 const text=wide.querySelector('dd'),place=wide.getBoundingClientRect(),slot=article.parentElement;
 return {below:place.top-groups.bottom,width:place.width-groups.width,cut:text.scrollHeight-text.clientHeight,whole:slot.scrollHeight-slot.clientHeight};
});
async function back(page){
 const button=page.getByRole('button',{name:'Vissza a listához',exact:true});
 if(await button.isVisible())await button.click();else await page.goBack();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}

test('1366 px: the sized image beside the data, the brief inline below them, and the Adatok window at the image width',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);await openView(page,'Médialapok');
 await sheet(page,NIGHT);
 const article=details(page),media=article.locator('.blade-record-group--media');
 // The image group: the section heading, the image at 480 px by the file's ratio, no field label.
 await expect(media.locator('.blade-record-group__title')).toHaveText('Kép');
 await expect(media.locator('dt')).toHaveCount(0);
 const image=media.getByRole('img',{name:/^Kép: Night ferry in the fog\.png$/});
 const picture=await box(image);
 expect(picture.width).toBeCloseTo(WIDTH,0);expect(picture.height).toBeCloseTo(HEIGHT,0);
 // `minmax(0, 1fr) auto`: the image group is the image plus its padding and frame; the data group takes the rest.
 const groups=await box(article.locator('.blade-record-groups')),group=await box(media),data=await box(article.locator('.blade-record-groups > .blade-record-group').first());
 expect(group.width-picture.width).toBeCloseTo(26,0);
 expect(data.width+12+group.width).toBeCloseTo(groups.width,0);
 expect(data.y).toBeCloseTo(group.y,0);
  // The brief: a labelled long text below the groups across their width with all of its text.
 await expect(article.locator(':scope > .blade-record-wide dt')).toHaveText('Leírás');
 const now=await brief(article);
 expect(now.below).toBeCloseTo(12,0);expect(now.width).toBeCloseTo(0,0);expect(now.cut).toBeLessThanOrEqual(1);
 // The details scroll as a whole: the groups move with the brief.
 expect(now.whole).toBeGreaterThan(0);
 const moved=await article.evaluate(article=>{article.parentElement.scrollTop=100;return article.parentElement.scrollTop;});
 expect(moved).toBeGreaterThan(0);expect((await box(media)).y).toBeCloseTo(group.y-moved,0);
 await article.evaluate(article=>{article.parentElement.scrollTop=0;});
 // A sheet without an image keeps the image's box (the 16:9 placeholder) and says so in text.
 await back(page);await sheet(page,'Tavaszi programajánló');
 const empty=await box(details(page).locator('.blade-media--sized.blade-media--empty'));
 expect(empty.width).toBeCloseTo(WIDTH,0);expect(empty.height).toBeCloseTo(WIDTH*9/16,0);
 await expect(details(page).locator('.blade-record-group__media')).toContainText('—');
 // The list's Adatok window: the same sized image and image group, the brief inline below the groups.
 await back(page);
 await page.locator('.dhx_grid-row').filter({hasText:NIGHT}).click();await command(page,'Adatok');
 const dialog=page.getByRole('dialog');
 const windowed=dialog.locator('.blade-record-details[data-blade-view="demo_media_sheets"]');
 await expect(windowed.locator('.blade-record-group--media dt')).toHaveCount(0);
 const shown=await box(windowed.locator('.blade-media--sized'));
 expect(shown.width).toBeCloseTo(WIDTH,0);expect(shown.height).toBeCloseTo(HEIGHT,0);
 await expect(windowed.locator('.blade-record-wide')).toContainText('Leírás');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 // A details view without a media field alone in a section is unchanged: Mellékletek keeps its labelled fields, and its
 // long text is the group of its own that it declares (`placement: "group"`, FB-0225).
 await openView(page,'Mellékletek');
 await page.locator('.dhx_grid-row, .blade-grid-card').first().click();await command(page,'Adatok');
 const plain=page.getByRole('dialog').locator('.blade-record-details');
 await expect(plain.locator('.blade-record-group').first()).toBeVisible();
 await expect(plain.locator('.blade-record-group--media, .blade-media--sized')).toHaveCount(0);
 await expect(plain.locator('.blade-record-group--text')).toHaveCount(1);
 await expect(plain.locator('.blade-record-wide')).toHaveCount(0);
 expect(await plain.locator('.blade-record-groups').getAttribute('style')).toBeNull();
 expect(seen).toEqual([]);
});

test('390 px: the image at most the group width by its ratio, the groups stacked and the brief below them in one scrolling sheet',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:390,height:844});await signIn(page);await openView(page,'Médialapok');
 await sheet(page,NIGHT);
 const article=details(page),media=article.locator('.blade-record-group--media');
 const group=await box(media),data=await box(article.locator('.blade-record-groups > .blade-record-group').first()),picture=await box(media.locator('.blade-media--sized'));
 expect(group.width).toBeCloseTo(data.width,0);expect(group.y).toBeGreaterThan(data.y);
 expect(picture.width).toBeLessThanOrEqual(group.width-24);expect(picture.width).toBeLessThan(WIDTH);
 expect(picture.height).toBeCloseTo(picture.width*941/1672,0);
 const now=await brief(article);
 expect(now.below).toBeCloseTo(12,0);expect(now.width).toBeCloseTo(0,0);expect(now.cut).toBeLessThanOrEqual(1);expect(now.whole).toBeGreaterThan(0);
 expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
 // The Adatok window (full screen on a phone): the image within its group.
 await back(page);
 await page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:NIGHT}).first().click();await command(page,'Adatok');
 const windowed=page.getByRole('dialog').locator('.blade-record-details');
 const shown=await box(windowed.locator('.blade-media--sized')),frame=await box(windowed.locator('.blade-record-group--media'));
 expect(shown.width).toBeLessThanOrEqual(frame.width-24);expect(shown.height).toBeCloseTo(shown.width*941/1672,0);
 expect(seen).toEqual([]);
});

// A fixture page: a project module exposes `app`; the RecordDetails below are mounted into fixed hosts over the page.
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
async function ready(page){
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}
// Mounts the fixture's RecordDetails (each in its own host, one under the other) and returns the rejected `fields`.
// `subset`: the view's fields named out of order; `lacking`: a row without one of the named fields; `plain`: a copy of the
// view without `detailsWidth` and with `year` in the image's section, shown with and without its year.
async function mountFixture(page){
 return page.evaluate(async title=>{
  const app=window.__bladeApp,C=app.components,base=app.viewDefinition('demo_media_sheets');
  const list=await app.server.call('demo_media_sheets','list',{values:{mode:'dynamic',limit:50}});
  const id=String(list.items.find(row=>row.title===title).id),row=await app.server.call('demo_media_sheets','get',{id});
  const width=Math.min(900,innerWidth),host=(name,top)=>{const element=document.createElement('div');element.id=`fixture-${name}`;element.style.cssText=`position:fixed;left:0;top:${top}px;z-index:100000;width:${width}px;height:420px;background:var(--dhx-background-primary)`;document.body.append(element);return element;};
  window.__fixture=[];
  const mount=(name,top,options)=>{const details=new C.RecordDetails({showId:false,...options});details.mount(host(name,top));window.__fixture.push(details);return details;};
  mount('subset',0,{view:'demo_media_sheets',record:id,fields:['year','file_id','title']});
  mount('lacking',420,{view:'demo_media_sheets',record:{id:'x',title:'Csak cím'},fields:['title','year']});
  const section=base.options.detailFields.find(field=>field.id==='file_id').section;
  const strip=fields=>fields.map(({detailsWidth,...field})=>field.id==='year'?{...field,section}:field);
  const plain={...base,id:'fixture_media_plain',options:{...base.options,columns:strip(base.options.columns),detailFields:strip(base.options.detailFields)}};
  window.__plain=mount('plain',840,{view:plain,record:row,fields:['title','year','file_id']});
  const {year,...yearless}=row;window.__yearless=yearless;
  const error=fields=>{try{new C.RecordDetails({view:'demo_media_sheets',record:{id:'x'},fields});return '';}catch(e){return `${e.name}: ${e.message}`;}};
  return [[],[1],['title',null],['nope'],['title','_media'],'title',{}].map(error);
 },NIGHT);
}
async function unmountFixture(page){
 await page.evaluate(()=>{for(const details of window.__fixture.splice(0))details.destroy();for(const element of document.querySelectorAll('[id^="fixture-"]'))element.remove();});
}
// The fixture's checks; $labels are the expected visible names in the account's language.
async function fixtureChecks(page,labels){
 const rejected=await mountFixture(page);
 for(const message of rejected)expect(message).toMatch(/^TypeError: 61ade: RecordDetails: fields/);
 // `fields`: only the named detail fields, in the view's order; the image's section keeps its lone-media group.
 const subset=page.locator('#fixture-subset .blade-record-details');
 await expect(subset.locator('.blade-record-group__title')).toHaveText([labels.data,labels.image]);
 await expect(subset.locator('dt')).toHaveText([labels.title,labels.year]);
 await expect(subset.locator('.blade-record-wide')).toHaveCount(0);
 await expect(subset.locator('.blade-record-group--media dt')).toHaveCount(0);
 const sized=await box(subset.locator('.blade-media--sized')),frame=await box(subset.locator('.blade-record-group--media'));
 expect(sized.width).toBeCloseTo(Math.min(WIDTH,frame.width-26),0);
 // A named field the row lacks is not shown.
 const lacking=page.locator('#fixture-lacking .blade-record-details');
 await expect(lacking.locator('dt')).toHaveText([labels.title]);await expect(lacking.locator('dd')).toHaveText(['Csak cím']);
 // Without `detailsWidth`: with the year beside it the image is a labelled row of its section ...
 const plain=page.locator('#fixture-plain .blade-record-details'),image=plain.getByRole('img',{name:new RegExp(`^${labels.image}: Night ferry in the fog\\.png$`)});
 await expect(image).toBeVisible();
 await expect(plain.locator('.blade-record-group--media')).toHaveCount(0);
 await expect(plain.locator('.blade-record-group').nth(1).locator('dt')).toHaveText([labels.year,labels.image]);
 // ... and alone among the shown fields its section shows the heading and the image at the details' own size (at most
 // 320 px, an image square), without a label row or a details width.
 await page.evaluate(()=>window.__plain.show(window.__yearless));
 const media=plain.locator('.blade-record-group--media');
 await expect(media.locator('.blade-record-group__title')).toHaveText(labels.image);
 await expect(media.locator('dt')).toHaveCount(0);
 await expect(plain.locator('.blade-media--sized')).toHaveCount(0);
 expect(await plain.locator('.blade-record-groups').getAttribute('style')).toBeNull();
 const group=await box(media),picture=await box(image);
 expect(picture.width).toBeCloseTo(Math.min(320,group.width-26),0);expect(picture.height).toBeCloseTo(picture.width,0);
 expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
 await unmountFixture(page);
}
const HUNGARIAN={data:'Adatok',image:'Kép',title:'Megnevezés',year:'Év'};
for(const width of [1366,390]){
 test(`${width} px: RecordDetails fields and a media field alone in its section without a details width (fixture)`,async({page})=>{
  const seen=watch(page);
  await page.setViewportSize({width,height:width<768?844:800});await fixture(page);await signIn(page);await ready(page);
  await fixtureChecks(page,HUNGARIAN);
  expect(seen).toEqual([]);
 });
}

// The place of a long text outside the sections (`column.placement`, FB-0225, docs/workspaces.md#card-groups) on copies
// of the feature demo's `Mellékletek` view with the reason's placement changed: `end`, `row` and `group` in a card (a
// cards-only ListView, one card per row) and in a RecordDetails, the demo's 1:2 section columns (record-groups.css).
const REASON='Ide kerül a referenciakép.';
async function mountPlacement(page,placement){
 await page.evaluate(async placement=>{
  const app=window.__bladeApp,C=app.components,base=app.viewDefinition('demo_attachments');
  const place=fields=>fields.map(field=>field.id==='reason'?{...field,placement}:field);
  const view={...base,id:`fixture_attachments_${placement}`,options:{...base.options,columns:place(base.options.columns),detailFields:place(base.options.detailFields)}};
  const list=await app.server.call('demo_attachments','list',{values:{mode:'dynamic',limit:50}});
  const row=list.items.find(item=>item.title==='Mintakép helye');
  const width=Math.min(1000,innerWidth),host=(name,top,height)=>{const element=document.createElement('div');element.id=`fixture-${name}`;element.style.cssText=`position:fixed;left:0;top:${top}px;z-index:100000;width:${width}px;height:${height}px;background:var(--dhx-background-primary)`;document.body.append(element);return element;};
  const cards=new C.ListView({view,modes:['cards'],cardColumns:1,panel:false,showId:false});cards.mount(host('cards',0,innerHeight/2));
  const details=new C.RecordDetails({view,record:row,showId:false});details.mount(host('details',innerHeight/2,innerHeight/2));
  window.__fixture=[cards,details];
 },placement);
}
const unmountPlacement=page=>page.evaluate(()=>{for(const part of window.__fixture.splice(0))part.destroy();for(const element of document.querySelectorAll('[id^="fixture-"]'))element.remove();});
// The record's groups and rows in their order, with their boxes, kinds and titles, and the reason's text element.
const placed=root=>root.evaluate(record=>{
 const box=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
 const grid=record.querySelector('.blade-record-groups'),after=grid.nextElementSibling;
 const parts=[...grid.children].map(element=>({kind:element.matches('.blade-record-wide--row')?'row':element.matches('.blade-record-group--text')?'text':'group',
  title:element.querySelector(':scope > .blade-record-group__title')?.textContent??element.querySelector('dt')?.textContent,box:box(element),labels:element.querySelectorAll('dt').length}));
 const text=[...record.querySelectorAll('.blade-grid-card__field--long')].map(field=>field.querySelector('dd, .blade-grid-card__value'))[0];
 return {grid:box(grid),parts,end:after?.matches('.blade-record-wide')?{box:box(after),label:after.querySelector('dt')?.textContent}:null,
  text:text.textContent,clamp:getComputedStyle(text).webkitLineClamp};
});
async function placementChecks(page,width){
 const wide=width>=768;
 for(const placement of ['end','row','group']){
  await mountPlacement(page,placement);
  const card=page.locator('#fixture-cards article.blade-grid-card').filter({hasText:'Mintakép helye'}),details=page.locator('#fixture-details .blade-record-details');
  await expect(card.locator('.blade-record-groups')).toBeVisible();await expect(details.locator('.blade-record-groups')).toBeVisible();
  for(const [where,root] of [['card',card],['details',details]]){
   const shown=await placed(root),[basics,...rest]=shown.parts,images=rest[rest.length-1],at=`${placement} in the ${where} at ${width} px`;
   expect(shown.text,at).toBe(REASON);
   // A card clamps the reason to its six card lines, the details show all of it.
   expect(shown.clamp,at).toBe(where==='card'?'6':'none');
   expect([basics.title,images.title],at).toEqual(['Alapadatok','Képek']);
   if(placement==='end'){
    // Below every group across their width, labelled.
    expect(shown.parts.map(part=>part.kind),at).toEqual(['group','group']);
    expect(shown.end?.label,at).toBe('Indoklás');
    expect(shown.end.box.y,at).toBeGreaterThanOrEqual(Math.max(basics.box.bottom,images.box.bottom)+11);expect(shown.end.box.width,at).toBeCloseTo(shown.grid.width,0);
    continue;
   }
   expect(shown.end,at).toBeNull();
   const [reason]=rest;
   expect(shown.parts.map(part=>part.kind),at).toEqual(['group',placement==='row'?'row':'text','group']);
   expect(reason.title,at).toBe('Indoklás');
   if(placement==='row'){
    // At its place between the sections across the whole width, labelled; the next section starts below it.
    expect(reason.labels,at).toBe(1);expect(reason.box.width,at).toBeCloseTo(shown.grid.width,0);
    expect(reason.box.y,at).toBeGreaterThanOrEqual(basics.box.bottom+11);expect(images.box.y,at).toBeGreaterThanOrEqual(reason.box.bottom+11);
    continue;
   }
   // A group of its own titled by its label, without a label row: one track beside Alapadatok with the same height
   // (the 2fr column), Képek in the next row; stacked on a phone.
   expect(reason.labels,at).toBe(0);
   if(wide){
    expect(reason.box.y,at).toBeCloseTo(basics.box.y,0);expect(reason.box.x,at).toBeGreaterThan(basics.box.right);expect(reason.box.height,at).toBeCloseTo(basics.box.height,0);
    expect(Math.abs(reason.box.right-shown.grid.right),at).toBeLessThan(1);expect(Math.abs(reason.box.width-2*basics.box.width),at).toBeLessThan(2);
    expect(images.box.y,at).toBeGreaterThanOrEqual(reason.box.bottom+11);expect(images.box.x,at).toBeCloseTo(basics.box.x,0);
   }else{
    expect(reason.box.width,at).toBeCloseTo(shown.grid.width,0);expect(reason.box.y,at).toBeGreaterThanOrEqual(basics.box.bottom+11);expect(images.box.y,at).toBeGreaterThanOrEqual(reason.box.bottom+11);
   }
  }
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  await unmountPlacement(page);
 }
}
for(const width of [1366,390]){
 test(`${width} px: a long text outside the sections placed at the end, as a row or as a group, in cards and details (fixture)`,async({page})=>{
  const seen=watch(page);
  await page.setViewportSize({width,height:width<768?844:800});await fixture(page);await signIn(page);await ready(page);
  await placementChecks(page,width);
  expect(seen).toEqual([]);
 });
}

test('English: the translated headings and labels on the record page and the fixture; the image group in every factory theme',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await fixture(page);await signIn(page);await ready(page);
 try{
  await page.getByRole('button',{name:'Magyar',exact:true}).click();await page.getByText('English',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await ready(page);
  await fixtureChecks(page,{data:'Details',image:'Image',title:'Name',year:'Year'});
  await openView(page,'Media sheets','Feature demo');
  await page.locator('.dhx_grid-row').filter({hasText:NIGHT}).first().dblclick();
  await expect(details(page).locator('.blade-record-groups')).toBeVisible();await closeGuide(page);
  await expect(details(page).locator('.blade-record-group--media .blade-record-group__title')).toHaveText('Image');
  await expect(details(page).locator('.blade-record-group--media dt')).toHaveCount(0);
  await expect(details(page).locator(':scope > .blade-record-wide dt')).toHaveText('Description');
 }finally{
  await page.getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','hu');
 }
 // Each factory theme (stored per browser): the image group's frame and heading are the data group's own.
 for(const theme of ['blade','blade-night','light','dark']){
  await page.evaluate(theme=>localStorage.setItem('blade-theme',theme),theme);await page.reload();
  await expect(details(page).locator('.blade-record-group--media')).toBeVisible();
  const look=await details(page).evaluate(article=>{
   const style=element=>{const s=getComputedStyle(element);return [s.borderTopColor,s.borderTopWidth,s.borderRadius].join(' ');};
   const title=element=>getComputedStyle(element.querySelector('.blade-record-group__title')).backgroundColor;
   const media=article.querySelector('.blade-record-group--media'),group=article.querySelector('.blade-record-group:not(.blade-record-group--media)');
   return {media:style(media),group:style(group),mediaTitle:title(media),groupTitle:title(group)};
  });
  expect(look.media,theme).toBe(look.group);expect(look.mediaTitle,theme).toBe(look.groupTitle);
 }
 await page.evaluate(()=>localStorage.removeItem('blade-theme'));
 expect(seen).toEqual([]);
});

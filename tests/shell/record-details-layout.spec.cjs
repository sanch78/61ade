const {test,expect,guide}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command}=require('./feature-demo.cjs');
// Record details layout (FB-0218, docs/toolkit.md#recorddetails, docs/workspaces.md#details-media-width) through the
// feature demo's D11 `Médialapok` (docs/demos.md#d11-media-sheets): a media field with `details_width: 480` alone in its
// section, the project's `minmax(0, 1fr) auto` columns for the view (`data-blade-view`), and the record page's
// RecordDetails with `longText: "card"`. The seed images are 1672 × 941. Read-only: the spec writes no records; the
// English part switches the demo account's language and switches it back.
test.describe.configure({mode:'serial'});

const WIDTH=480,HEIGHT=WIDTH*941/1672;
const details=page=>page.locator('.blade-record-details[data-blade-view="demo_media_sheets"]');
const box=locator=>locator.evaluate(element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
const pageOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
function watch(page){
 const seen=[];
 page.on('pageerror',error=>seen.push(error.message));
 page.on('console',message=>{if(message.type()==='error')seen.push(message.text());});
 return seen;
}
// The record page of a sheet (double-click or Enter on its row or card), its guide closed.
async function sheet(page,title){
 await page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:title}).first().dblclick();
 await expect(details(page).locator('.blade-record-text')).toBeVisible();
 const window=guide(page);
 if(await window.isVisible())await window.getByRole('button',{name:/close|Bezárás/i}).first().click();
 await expect(window).toHaveCount(0);
}
// Scroll state of the card's text and of the details as a whole (their slot), and whether the card fills.
const state=page=>details(page).evaluate(article=>{
 const body=article.querySelector('.blade-record-text__body'),slot=article.parentElement;
 return {fill:article.classList.contains('blade-record-details--fill'),tab:body.getAttribute('tabindex'),
  text:body.scrollHeight-body.clientHeight,whole:slot.scrollHeight-slot.clientHeight,card:body.closest('.blade-record-text').getBoundingClientRect().height};
});
async function back(page){
 const button=page.getByRole('button',{name:'Vissza a listához',exact:true});
 if(await button.isVisible())await button.click();else await page.goBack();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}

test('1366 px: the sized image beside the data, the brief scrolling in its card, and the Adatok window at the image width',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);await openView(page,'Médialapok');
 await sheet(page,'Éjszakai komp a ködben');
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
 // The brief: a framed card below the groups headed by its label, filling the rest and scrolling on its own.
 const card=article.locator('.blade-record-text');
 await expect(card.locator('.blade-record-group__title')).toHaveText('Leírás');
 expect((await box(card)).y).toBeGreaterThan(groups.y+groups.height);
 let now=await state(page);
 expect(now).toMatchObject({fill:true,tab:'0',whole:0});expect(now.text).toBeGreaterThan(50);expect(now.card).toBeGreaterThanOrEqual(160);
 // Keyboard: the scrolling text is a tab stop named by the label; the arrow keys scroll it, the groups stay put.
 const region=page.getByRole('region',{name:'Leírás',exact:true});
 await page.getByRole('button',{name:'Vissza a listához',exact:true}).focus();
 for(let step=0;step<10&&!await region.evaluate(element=>element===document.activeElement);step++)await page.keyboard.press('Tab');
 await expect(region).toBeFocused();
 const before=await box(media);
 await page.keyboard.press('PageDown');
 await expect.poll(()=>region.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
 expect((await box(media)).y).toBeCloseTo(before.y,0);
 // Too low for the groups and 160 px of card: the details scroll as a whole and the card shows all of its text.
 await page.setViewportSize({width:1366,height:560});
 await expect.poll(()=>state(page).then(value=>value.fill)).toBe(false);
 now=await state(page);
 expect(now.tab).toBeNull();expect(now.text).toBeLessThanOrEqual(1);expect(now.whole).toBeGreaterThan(0);
 await page.setViewportSize({width:1366,height:800});
 await expect.poll(()=>state(page).then(value=>value.fill)).toBe(true);
 // A sheet without an image keeps the image's box (the 16:9 placeholder) and says so in text.
 await back(page);await sheet(page,'Tavaszi programajánló');
 const empty=await box(details(page).locator('.blade-media--sized.blade-media--empty'));
 expect(empty.width).toBeCloseTo(WIDTH,0);expect(empty.height).toBeCloseTo(WIDTH*9/16,0);
 await expect(details(page).locator('.blade-record-group__media')).toContainText('—');
 // A short brief fills the card without a tab stop.
 expect(await state(page)).toMatchObject({fill:true,tab:null});
 // The list's Adatok window: the same sized image and image group, the brief inline below the groups as before.
 await back(page);
 await page.locator('.dhx_grid-row').filter({hasText:'Éjszakai komp a ködben'}).click();await command(page,'Adatok');
 const dialog=page.getByRole('dialog');
 const windowed=dialog.locator('.blade-record-details[data-blade-view="demo_media_sheets"]');
 await expect(windowed.locator('.blade-record-group--media dt')).toHaveCount(0);
 const shown=await box(windowed.locator('.blade-media--sized'));
 expect(shown.width).toBeCloseTo(WIDTH,0);expect(shown.height).toBeCloseTo(HEIGHT,0);
 await expect(windowed.locator('.blade-record-texts')).toHaveCount(0);await expect(windowed.locator('.blade-record-wide')).toContainText('Leírás');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 // Without the new options a details view is unchanged: Mellékletek keeps its labelled fields and its inline long text.
 await openView(page,'Mellékletek');
 await page.locator('.dhx_grid-row, .blade-grid-card').first().click();await command(page,'Adatok');
 const plain=page.getByRole('dialog').locator('.blade-record-details');
 await expect(plain.locator('.blade-record-group').first()).toBeVisible();
 await expect(plain.locator('.blade-record-group--media, .blade-media--sized, .blade-record-texts')).toHaveCount(0);
 await expect(plain.locator('.blade-record-wide')).toHaveCount(1);
 expect(await plain.locator('.blade-record-groups').getAttribute('style')).toBeNull();
 expect(seen).toEqual([]);
});

test('390 px: the image at most the group width by its ratio, the groups stacked and the whole sheet scrolling',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:390,height:844});await signIn(page);await openView(page,'Médialapok');
 await sheet(page,'Éjszakai komp a ködben');
 const article=details(page),media=article.locator('.blade-record-group--media');
 const group=await box(media),data=await box(article.locator('.blade-record-groups > .blade-record-group').first()),picture=await box(media.locator('.blade-media--sized'));
 expect(group.width).toBeCloseTo(data.width,0);expect(group.y).toBeGreaterThan(data.y);
 expect(picture.width).toBeLessThanOrEqual(group.width-24);expect(picture.width).toBeLessThan(WIDTH);
 expect(picture.height).toBeCloseTo(picture.width*941/1672,0);
 // A phone never lets the card scroll on its own: the full text, no tab stop, one scrolling page.
 const now=await state(page);
 expect(now).toMatchObject({fill:false,tab:null});expect(now.text).toBeLessThanOrEqual(1);expect(now.whole).toBeGreaterThan(0);
 expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
 // The Adatok window (full screen on a phone): the image within its group.
 await back(page);
 await page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:'Éjszakai komp a ködben'}).first().click();await command(page,'Adatok');
 const windowed=page.getByRole('dialog').locator('.blade-record-details');
 const shown=await box(windowed.locator('.blade-media--sized')),frame=await box(windowed.locator('.blade-record-group--media'));
 expect(shown.width).toBeLessThanOrEqual(frame.width-24);expect(shown.height).toBeCloseTo(shown.width*941/1672,0);
 expect(seen).toEqual([]);
});

test('English names the scrolling card by its translated label; the card follows the groups in every factory theme',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:800});await signIn(page);
 try{
  await page.getByRole('button',{name:'Magyar',exact:true}).click();await page.getByText('English',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await openView(page,'Media sheets','Feature demo');
  await page.locator('.dhx_grid-row').filter({hasText:'Éjszakai komp a ködben'}).first().dblclick();
  const window=guide(page);
  await expect(details(page).locator('.blade-record-text')).toBeVisible();
  if(await window.isVisible())await window.getByRole('button',{name:/close|Bezárás/i}).first().click();
  const name=await details(page).locator('.blade-record-text .blade-record-group__title').textContent();
  expect(name).not.toBe('Leírás');
  await expect(page.getByRole('region',{name,exact:true})).toHaveAttribute('tabindex','0');
  await expect(details(page).locator('.blade-record-group--media .blade-record-group__title')).toHaveText('Image');
 }finally{
  await page.getByRole('button',{name:'English',exact:true}).click();await page.getByText('Magyar',{exact:true}).last().click();
  await expect(page.locator('html')).toHaveAttribute('lang','hu');
 }
 // Each factory theme (stored per browser): the card's frame and heading are the groups' own.
 for(const theme of ['blade','blade-night','light','dark']){
  await page.evaluate(theme=>localStorage.setItem('blade-theme',theme),theme);await page.reload();
  await expect(details(page).locator('.blade-record-text')).toBeVisible();
  const look=await details(page).evaluate(article=>{
   const style=element=>{const s=getComputedStyle(element);return [s.borderTopColor,s.borderTopWidth,s.borderRadius].join(' ');};
   const title=element=>getComputedStyle(element.querySelector('.blade-record-group__title')).backgroundColor;
   const card=article.querySelector('.blade-record-text'),group=article.querySelector('.blade-record-group:not(.blade-record-text)');
   return {card:style(card),group:style(group),cardTitle:title(card),groupTitle:title(group),text:getComputedStyle(card.querySelector('.blade-record-text__body')).color};
  });
  expect(look.card,theme).toBe(look.group);expect(look.cardTitle,theme).toBe(look.groupTitle);expect(look.text,theme).not.toBe('rgba(0, 0, 0, 0)');
 }
 expect(seen).toEqual([]);
});

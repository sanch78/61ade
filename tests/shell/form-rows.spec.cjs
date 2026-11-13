const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// Form rows (FB-0196) on the feature demo's `Kapcsolatok` (examples/demo-app/contacts.php): `Név` and `Szervezet`
// share a row above the accordion sections, `Beosztás`, `E-mail` (a double share) and `Telefon` one in `Elérhetőség`,
// three short fields one in `Cím`. A wide and a medium window show them side by side, a phone stacks them; the window
// opens wide enough for its widest row, nothing scrolls sideways, Tab follows the reading order and an error stays with
// its field. A RecordForm in a fixed-width window: the breakpoint follows the form's width, a wider window fits a lower
// height. A form without rows (`Jegyzetek`) keeps its 560 px window and full-width fields.
// A fixture module hands `app` to the page; nothing is saved.
const MODULE='/form-rows-fixture.mjs';
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
async function open(page,width,view='demo_contacts',height=width<768?844:900){
 await fixture(page);
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test','/#view='+view);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
 await expect(page.locator('[data-cell-id="grid"]')).toBeVisible();
}
/** `Hozzáadás`, also from the responsive `Műveletek` menu of a phone. */
async function add(page){
 const menu=page.locator('[data-cell-id="grid"]').getByRole('button',{name:'Műveletek',exact:true}),button=page.getByRole('button',{name:'Hozzáadás',exact:true});
 await expect(menu.or(button).first()).toBeVisible();
 if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name:'Hozzáadás',exact:true}).click();}
 else await button.click();
}
/** Waits until $locator stays in place over two frames (a fitted window is resized and centred after it shows). */
async function settled(page,locator){
 for(let attempt=0;attempt<30;attempt++){
  const before=JSON.stringify(await locator.boundingBox());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(JSON.stringify(await locator.boundingBox())===before)return;
 }
 throw new Error('the window did not settle');
}
/** The boxes of the named fields' cells (Suite `data-cell-id`) in $form. */
const cells=(form,names)=>form.evaluate((form,names)=>Object.fromEntries(names.map(name=>{
 const box=form.querySelector(`[data-cell-id="${name}"]`).getBoundingClientRect();
 return [name,{x:Math.round(box.x),y:Math.round(box.y),width:Math.round(box.width),bottom:Math.round(box.bottom)}];
})),names);
/** Whether the fields' cells start on one line, left to right. */
const sideBySide=boxes=>boxes.every((box,index)=>box.y===boxes[0].y&&(index===0||box.x>boxes[index-1].x));
/** Whether the fields' cells are stacked, each below the previous one at the same left edge and width. */
const stacked=boxes=>boxes.every((box,index)=>index===0||(box.y>=boxes[index-1].bottom&&box.x===boxes[0].x&&box.width===boxes[0].width));
/** Nothing scrolls sideways: the page, the window's form and its open section. */
const sideways=form=>form.evaluate(form=>[document.documentElement,form.querySelector('.dhx_form'),...form.querySelectorAll('.blade-form-section__body:not(.blade-form-section__body--closed)')]
 .filter(element=>element&&element.scrollWidth>element.clientWidth+1).map(element=>element.className||element.tagName));
/** The accessible name of the focused control: its label, or a button's text. */
const focused=page=>page.evaluate(()=>{const element=document.activeElement;return (element.labels?.[0]?.textContent??element.textContent??'').replace('*','').trim();});

for(const [width,wide] of [[1366,true],[880,true],[390,false]])test(`contacts at ${width} px: rows ${wide?'side by side':'stacked'}, no sideways scrolling, reading-order Tab, an error with its field`,async({page})=>{
 await open(page,width);
 await add(page);
 const form=page.getByRole('dialog',{name:'Kapcsolatok — Hozzáadás',exact:true});
 await expect(form.getByRole('textbox',{name:'Név'})).toBeVisible();
 await settled(page,form);
 // The window is as wide as its widest row needs (Elérhetőség: four shares of 180 px, three gaps, the insets and a
 // scrollbar's room: 872 px), at most the viewport − 24 px.
 const frame=await form.boundingBox();
 expect(Math.round(frame.width)).toBe(Math.min(872,width-24));
 expect(Math.round(frame.width)).toBeLessThanOrEqual(width-24);
 const identity=await cells(form,['name','organization']),reach=await cells(form,['role','email','phone','website']);
 if(wide){
  expect(sideBySide([identity.name,identity.organization])).toBe(true);
  expect(sideBySide([reach.role,reach.email,reach.phone])).toBe(true);
  // `E-mail` takes a double share; the fields without a row (`Weboldal`) span the row.
  expect(Math.abs(reach.email.width-2*reach.role.width)).toBeLessThanOrEqual(20);
  expect(Math.abs(reach.phone.width-reach.role.width)).toBeLessThanOrEqual(1);
  expect(reach.website.x).toBe(reach.role.x);expect(reach.website.width).toBe(reach.phone.x+reach.phone.width-reach.role.x);
 }else{
  expect(stacked([identity.name,identity.organization])).toBe(true);
  expect(stacked([reach.role,reach.email,reach.phone,reach.website])).toBe(true);
 }
 expect(await sideways(form)).toEqual([]);
 // Three short fields in `Cím`.
 await form.getByRole('button',{name:'Cím',exact:true}).click();
 await expect(form.getByRole('textbox',{name:'Irányítószám'})).toBeVisible();await settled(page,form);
 const place=await cells(form,['postal_code','city','country']);
 expect((wide?sideBySide:stacked)([place.postal_code,place.city,place.country])).toBe(true);
 expect(await sideways(form)).toEqual([]);
 // A checkbox beside a select is centred on its input while the row is side by side, and has no gap above it stacked.
 await form.getByRole('button',{name:'Beállítások',exact:true}).click();
 await expect(form.getByRole('checkbox',{name:'Hírlevelet kér'})).toBeVisible();await settled(page,form);
 const check=await form.evaluate(form=>{const centre=element=>{const box=element.getBoundingClientRect();return Math.round(box.top+box.height/2);};
  const cell=form.querySelector('[data-cell-id="newsletter"]').parentElement,box=form.querySelector('[data-cell-id="newsletter"] .dhx_checkbox__visual-input');
  return {select:centre(form.querySelector('[data-cell-id="channel"] select')),box:centre(box),gap:Math.round(box.getBoundingClientRect().top-cell.getBoundingClientRect().top)};});
 if(wide)expect(Math.abs(check.box-check.select)).toBeLessThanOrEqual(1);
 else expect(check.gap).toBeLessThanOrEqual(2);
 // Tab follows the reading order: row by row, left to right.
 await form.getByRole('button',{name:'Elérhetőség',exact:true}).click();
 await expect(form.getByRole('textbox',{name:'Beosztás'})).toBeVisible();
 await form.getByRole('textbox',{name:'Név'}).focus();
 const order=[await focused(page)];
 for(let step=0;step<6;step++){await page.keyboard.press('Tab');order.push(await focused(page));}
 expect(order).toEqual(['Név','Szervezet','Elérhetőség','Beosztás','E-mail','Telefon','Weboldal']);
 // An error shows with its field and moves none of the row's other fields.
 const before=await cells(form,['role','email','phone']);
 await form.getByRole('textbox',{name:'Beosztás'}).fill('Beszerző');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 const email=form.locator('[data-cell-id="email"]');
 await expect(email.locator('.dhx_form-group--state_error')).toBeVisible();
 const message=await email.locator('.dhx_input__caption').boundingBox(),cell=await email.boundingBox();
 expect(message.x).toBeGreaterThanOrEqual(cell.x-1);expect(message.x+message.width).toBeLessThanOrEqual(cell.x+cell.width+1);
 // The form refits and the row may move with it: side by side its fields keep their line, widths and input tops;
 // stacked, the message sits between `E-mail` and the field below it.
 const after=await cells(form,['role','email','phone']);
 if(wide){
  expect(sideBySide([after.role,after.email,after.phone])).toBe(true);
  for(const name of ['role','email','phone'])expect(after[name].width).toBe(before[name].width);
  const inputs=await form.evaluate(form=>['role','email','phone'].map(name=>Math.round(form.querySelector(`[data-cell-id="${name}"] input`).getBoundingClientRect().top)));
  expect(new Set(inputs).size).toBe(1);
 }else expect(message.y+message.height).toBeLessThanOrEqual(after.phone.y+1);
 expect(await form.locator('[data-cell-id="role"] .dhx_form-group--state_error').count()).toBe(0);
 await form.getByRole('button',{name:'Mégse',exact:true}).click();
 await expect(form).toBeHidden();
});

test('a RecordForm in a fixed-width window: the rows follow the form\'s width, not the viewport; a wider window fits a lower height',async({page})=>{
 await open(page,1366,'demo_contacts',1200);
 const fitted=async width=>{
  await page.evaluate(width=>{
   const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width,height:300,maxHeight:Infinity});
   window.__form=new app.components.RecordForm({resource:'demo_contacts',action:'create'});window.__form.mount(host);
  },width);
  const form=page.getByRole('dialog',{name:'Fixture',exact:true});
  await expect(form.getByRole('textbox',{name:'E-mail'})).toBeVisible();
  await expect.poll(async()=>Math.round((await form.boundingBox()).height)).toBeGreaterThan(300);
  await settled(page,form);
  const result={height:Math.round((await form.boundingBox()).height),reach:await cells(form,['role','email','phone']),sideways:await sideways(form)};
  await page.evaluate(()=>{window.__form.destroy();window.__window.close();});
  await expect(form).toBeHidden();
  return result;
 };
 const wide=await fitted(900),narrow=await fitted(480);
 expect(sideBySide([wide.reach.role,wide.reach.email,wide.reach.phone])).toBe(true);
 expect(stacked([narrow.reach.role,narrow.reach.email,narrow.reach.phone])).toBe(true);
 expect(wide.sideways).toEqual([]);expect(narrow.sideways).toEqual([]);
 expect(wide.height).toBeLessThan(narrow.height);
});

const LONG='Position within the organisation (job title)',LONG_REQUIRED='Electronic mail address for business correspondence, invoices and reminders from the accounting department';
test('a hidden conditional field leaves no hole in its row; a lone field takes its whole row; a long label stays on one line with its required mark',async({page})=>{
 await open(page,1366);
 // A rewritten form description (the browser part only): `Telefon` conditional on `Kapcsolattartás módja`, `Szervezet`
 // left out (as the field ACL may), `Beosztás` and the required `E-mail` with long English labels.
 await page.route(url=>url.pathname==='/',async route=>{
  const request=route.request();let body;
  try{body=request.postDataJSON();}catch{}
  if(request.method()!=='POST'||body?.action!=='__form')return route.fallback();
  const response=await route.fetch(),json=await response.json();
  json.data.fields=json.data.fields.filter(field=>field.name!=='organization');
  for(const field of json.data.fields){if(field.name==='phone')field.visibleWhen={field:'channel',in:['phone']};if(field.name==='role')field.label=LONG;if(field.name==='email')field.label=LONG_REQUIRED;}
  await route.fulfill({response,json});
 });
 await add(page);
 const form=page.getByRole('dialog',{name:'Kapcsolatok — Hozzáadás',exact:true});
 await expect(form.getByRole('textbox',{name:LONG_REQUIRED})).toBeVisible();
 await expect(form.getByRole('textbox',{name:'Telefon'})).toBeHidden();
 // `Név`, the one field left of its row, takes the whole row.
 expect(await form.evaluate(form=>{const cell=form.querySelector('[data-cell-id="name"]').getBoundingClientRect(),row=form.querySelector('[data-cell-id="name"]').closest('.blade-form-row').getBoundingClientRect();return Math.round(row.width-cell.width);})).toBe(0);await settled(page,form);
 const hidden=await cells(form,['role','email','website']);
 // Role and e-mail share the whole row by their shares (1 : 2).
 expect(sideBySide([hidden.role,hidden.email])).toBe(true);
 expect(hidden.email.x+hidden.email.width).toBe(hidden.website.x+hidden.website.width);
 expect(Math.abs(hidden.email.width-2*hidden.role.width)).toBeLessThanOrEqual(20);
 await form.getByRole('button',{name:'Beállítások',exact:true}).click();
 await form.getByLabel('Kapcsolattartás módja').selectOption('phone');
 await form.getByRole('button',{name:'Elérhetőség',exact:true}).click();
 await expect(form.getByRole('textbox',{name:'Telefon'})).toBeVisible();await settled(page,form);
 const shown=await cells(form,['role','email','phone','website']);
 expect(sideBySide([shown.role,shown.email,shown.phone])).toBe(true);
 expect(shown.phone.x+shown.phone.width).toBe(shown.website.x+shown.website.width);
 // The long label is cut on one line, the inputs keep one top, and the whole label stays the input's name.
 await expect(form.getByRole('textbox',{name:LONG,exact:true})).toBeVisible();
 const label=name=>form.locator(`[data-cell-id="${name}"] .dhx_label`).evaluate(label=>{const mark=getComputedStyle(label,'::after');
  return {cut:label.scrollWidth>label.clientWidth,lines:Math.round(label.getBoundingClientRect().height/parseFloat(getComputedStyle(label).lineHeight)),title:label.title,
   mark:mark.content!=='none'&&mark.position==='absolute'&&parseFloat(getComputedStyle(label).paddingRight)>=parseFloat(mark.width)};});
 expect(await label('role')).toMatchObject({cut:true,lines:1,title:LONG,mark:false});
 // The required mark stays visible at the end of a cut label: absolutely in the label's reserved right padding.
 expect(await label('email')).toMatchObject({cut:true,lines:1,title:LONG_REQUIRED,mark:true});
 const inputs=await form.evaluate(form=>['role','email','phone'].map(name=>Math.round(form.querySelector(`[data-cell-id="${name}"] input`).getBoundingClientRect().top)));
 expect(new Set(inputs).size).toBe(1);
});

test('a share set on the window\'s form widens the window; a row whose fields arrive apart stays whole',async({page})=>{
 await open(page,1366);
 // A project value on a narrower scope than `:root`; the field list delivered with `Szervezet` last (as a view's
 // column order may give the singleton's details form).
 await page.addStyleTag({content:'.blade-content-window { --blade-form-column-min: 220px; }'});
 await page.route(url=>url.pathname==='/',async route=>{
  const request=route.request();let body;
  try{body=request.postDataJSON();}catch{}
  if(request.method()!=='POST'||body?.action!=='__form')return route.fallback();
  const response=await route.fetch(),json=await response.json(),fields=json.data.fields;
  json.data.fields=[...fields.filter(field=>field.name!=='organization'),...fields.filter(field=>field.name==='organization')];
  await route.fulfill({response,json});
 });
 await add(page);
 const form=page.getByRole('dialog',{name:'Kapcsolatok — Hozzáadás',exact:true});
 await expect(form.getByRole('textbox',{name:'E-mail'})).toBeVisible();
 await settled(page,form);
 // Four shares of 220 px, three gaps, the insets and a scrollbar's room.
 expect(Math.round((await form.boundingBox()).width)).toBe(4*(220+16)-16+104);
 const reach=await cells(form,['role','email','phone']),identity=await cells(form,['name','organization']);
 expect(sideBySide([reach.role,reach.email,reach.phone])).toBe(true);
 expect(reach.role.width).toBeGreaterThanOrEqual(220);
 expect(sideBySide([identity.name,identity.organization])).toBe(true);
 // The reading order follows the gathered row.
 await form.getByRole('textbox',{name:'Név'}).focus();await page.keyboard.press('Tab');
 expect(await focused(page)).toBe('Szervezet');
});

test('a form without rows keeps its 560 px window and full-width fields',async({page})=>{
 await open(page,1366,'notes');
 await add(page);
 const form=page.getByRole('dialog',{name:/^Jegyzetek — /});
 await expect(form.locator('.dhx_form')).toBeVisible();
 await settled(page,form);
 expect(Math.round((await form.boundingBox()).width)).toBe(560);
 expect(await form.locator('.blade-form-row').count()).toBe(0);
 // Every field's cell spans the form's content width.
 const widths=await form.locator('.dhx_form').evaluate(form=>{const style=getComputedStyle(form),inner=form.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  return [...form.querySelectorAll('.dhx_form-element[data-cell-id]')].filter(cell=>!cell.closest('.blade-form-actions')&&cell.getClientRects().length).map(cell=>Math.round(cell.getBoundingClientRect().width)-Math.round(inner));});
 expect(widths.length).toBeGreaterThan(0);
 for(const difference of widths)expect(Math.abs(difference)).toBeLessThanOrEqual(1);
});

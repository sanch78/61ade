const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {runtime,fixture,start,contrast,errors,build,teardown,log,panel}=require('./view-controls.cjs');
// SettingsForm (docs/toolkit.md#settingsform) in a record page's control panel beside a viewer with its CommandBars;
// the page in every theme and skin and in English at 1366 and 390 px.
test.describe.configure({mode:'serial'});

test('SettingsForm: native controls, immediate and throttled changes, conditions, persistence and reset',async({page})=>{
 const failures=errors(page);
 await start(page);await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('vc-'))localStorage.removeItem(key);});
 await build(page);
 const form=panel(page);
 expect(await page.evaluate(()=>window.__vc.form.values())).toEqual({fit:'contain',zoom:100,grid:false,gridColor:'#336699',tags:[],side:'left',speed:'1',caption:'',auto:false});
 // No submit row unless asked.
 await expect(form.getByRole('button')).toHaveCount(0);
 // Segmented: radios (one checked), a click reports at once.
 await expect(form.getByRole('radio',{name:'Teljes'})).toBeChecked();
 await form.getByText('Kitöltés',{exact:true}).click();
 expect(await log(page)).toEqual([['form','fit','cover']]);
 // Switch: role switch; the conditional colour appears with it.
 const grid=form.getByRole('switch',{name:'Rács'});
 await expect(grid).not.toBeChecked();
 await expect(form.getByText('Rács színe',{exact:true})).toBeHidden();
 await grid.click({force:true});
 expect(await log(page)).toEqual([['form','grid',true]]);
 await expect(form.getByText('Rács színe',{exact:true})).toBeVisible();
 // Range: the number input names its unit; a typed value is fitted to the step and bounds, the slider follows.
 const zoom=form.getByRole('spinbutton',{name:'Nagyítás (%)'});
 await zoom.fill('133');await zoom.press('Tab');
 expect(await log(page)).toEqual([['form','zoom',135]]);
 await expect(zoom).toHaveValue('135');
 await zoom.fill('9999');await zoom.press('Tab');
 expect(await log(page)).toEqual([['form','zoom',400]]);
 // Dragging the slider: throttled reports while moving, the final value last.
 const track=form.locator('.blade-range__slider .dhx_slider__track');const box=await track.boundingBox();
 await page.mouse.move(box.x+box.width-1,box.y+box.height/2);await page.mouse.down();
 for(let step=0;step<=20;step++){await page.mouse.move(box.x+box.width*(1-step/20),box.y+box.height/2);await page.waitForTimeout(15);}
 await page.mouse.up();await page.waitForTimeout(250);
 const drag=(await log(page)).filter(entry=>entry[1]==='zoom');
 expect(drag.length).toBeGreaterThan(1);expect(drag.length).toBeLessThan(15);
 expect(drag.at(-1)[2]).toBe(25);await expect(zoom).toHaveValue('25');
 // Chips: several, with an image; a single chip choice is a radio.
 await expect(form.getByRole('group',{name:'Címkék'})).toHaveCount(1);
 await expect(form.locator('.blade-chip__image')).toHaveCount(1);
 await form.getByText('Hideg',{exact:true}).click();await form.getByText('Meleg',{exact:true}).click();
 expect(await log(page)).toEqual([['form','tags',['cold']],['form','tags',['warm','cold']]]);
 await form.getByText('Jobb',{exact:true}).click();
 expect(await log(page)).toEqual([['form','side','right']]);
 // Text on leaving the field; an exclusive field resets it (and reports it).
 await form.getByLabel('Felirat',{exact:true}).fill('Cím');await form.getByLabel('Felirat',{exact:true}).press('Tab');
 expect(await log(page)).toEqual([['form','caption','Cím']]);
 await form.getByRole('checkbox',{name:'Automatikus'}).click({force:true});
 expect(await log(page)).toEqual([['form','auto',true],['form','caption','']]);
 // set() reports, setValues() does not; invalid values are refused or ignored.
 await page.evaluate(()=>{window.__vc.form.set('zoom',200);window.__vc.form.setValues({fit:'fill',zoom:7,unknown:1});});
 expect(await log(page)).toEqual([['form','zoom',200]]);
 await expect(form.getByRole('radio',{name:'Nyújtás'})).toBeChecked();
 expect(await page.evaluate(()=>{try{window.__vc.form.set('fit','nope');return 'no error';}catch(error){return error.constructor.name;}})).toBe('TypeError');
 // Disabled through update.
 await page.evaluate(()=>window.__vc.form.update('speed',{disabled:true}));
 await expect(form.getByRole('combobox',{name:'Sebesség'})).toBeDisabled();
 // Kept per page and user: a rebuilt form shows the values, reset forgets them.
 const kept=await page.evaluate(()=>window.__vc.form.values());
 await page.evaluate(()=>{const vc=window.__vc;vc.form.destroy();vc.top.destroy();vc.bottom.destroy();vc.layout.destroy();document.getElementById('vc').remove();});
 await build(page);
 expect(await page.evaluate(()=>window.__vc.form.values())).toEqual(kept);
 await page.evaluate(()=>window.__vc.form.reset());
 expect((await page.evaluate(()=>window.__vc.form.values())).fit).toBe('contain');
 expect(await log(page)).toEqual([]);
 await page.evaluate(()=>{window.__vc.form.destroy();window.__vc.form=undefined;});
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.includes('settings:vc-settings')).map(key=>JSON.parse(localStorage.getItem(key)).settings??null))).toEqual([null]);
 await page.evaluate(()=>{const vc=window.__vc;vc.top.destroy();vc.bottom.destroy();vc.layout.destroy();document.getElementById('vc').remove();window.__vc=undefined;});
 expect(failures).toEqual([]);
});

test('SettingsForm: a submit row validates before reporting; it mounts in a window',async({page})=>{
 const failures=errors(page);
 await start(page);
 await build(page,{submit:true,key:'vc-submit'});
 const form=panel(page);
 await form.getByRole('button',{name:'Alkalmaz'}).click();
 await expect(form.getByText('Kötelező mező.')).toBeVisible();
 expect((await log(page)).filter(entry=>entry[0]==='submit')).toEqual([]);
 await form.getByLabel('Felirat',{exact:true}).fill('Rendben');await form.getByRole('button',{name:'Alkalmaz'}).click();
 const submitted=(await log(page)).filter(entry=>entry[0]==='submit');
 expect(submitted).toHaveLength(1);expect(submitted[0][1].caption).toBe('Rendben');
 await teardown(page);
 // A window: the form fills it and closes with it.
 await page.evaluate(()=>{const app=window.__bladeApp;const win=window.__win=app.ui.window({title:'Nézet',width:360});
  window.__winForm=new app.components.SettingsForm({fields:[{name:'mode',label:'Mód',type:'segmented',options:{a:'A',b:'B'}},{name:'level',label:'Szint',type:'range',min:0,max:10}]});window.__winForm.mount(win);});
 const dialog=page.getByRole('dialog',{name:'Nézet'});
 await expect(dialog.getByRole('radio',{name:'A'})).toBeChecked();
 await expect(dialog.getByRole('spinbutton',{name:'Szint'})).toHaveValue('0');
 await page.evaluate(()=>window.__win.close());
 await expect(dialog).toHaveCount(0);
 expect(failures).toEqual([]);
});

test('SettingsForm in a subdivided Accordion section: closed sections keep the form, both accordions remember their sections',async({page})=>{
 const failures=errors(page);
 await start(page);
 const mount=()=>page.evaluate(()=>{
  const app=window.__bladeApp,box=document.createElement('div');box.id='vc';
  Object.assign(box.style,{position:'fixed',left:'16px',top:'60px',width:'360px',bottom:'40px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
  document.body.append(box);
  const panel=new app.components.Accordion({id:'vc-panel',multiple:true,sections:[{id:'view',label:'Megjelenés'},{id:'filter',label:'Szűrés'}]});
  panel.mount(box);
  const appearance=new app.components.Accordion({id:'vc-panel.view',multiple:true,sections:[{id:'grid',label:'Rács'},{id:'background',label:'Háttér'}]});
  appearance.mount(panel.cell('view'));
  const form=new app.components.SettingsForm({key:'vc-nested',fields:[{name:'grid',label:'Rács mutatása',type:'switch'},{name:'size',label:'Rácsméret',type:'range',min:4,max:64,unit:'px',defaultValue:16}]});
  form.mount(appearance.cell('grid'));
  window.__nested={panel,appearance,form};
 });
 const unmount=()=>page.evaluate(()=>{const n=window.__nested;n.form.destroy();n.appearance.destroy();n.panel.destroy();document.getElementById('vc').remove();});
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('vc-'))localStorage.removeItem(key);});
 await mount();
 const box=page.locator('#vc');
 const size=box.getByRole('spinbutton',{name:'Rácsméret (px)'});
 await expect(size).toBeVisible();
 await size.fill('32');await size.press('Tab');
 // Closing the inner section keeps the form and its value; the outer section closes the whole subdivision.
 await box.getByRole('button',{name:'Rács',exact:true}).click();
 await expect(size).toBeHidden();
 await box.getByRole('button',{name:'Rács',exact:true}).click();
 await expect(size).toHaveValue('32');
 await box.getByRole('button',{name:'Háttér',exact:true}).click();
 await box.getByRole('button',{name:'Megjelenés',exact:true}).click();
 await expect(box.getByRole('button',{name:'Rács',exact:true})).toBeHidden();
 await box.getByRole('button',{name:'Megjelenés',exact:true}).click();
 expect(await page.evaluate(()=>[window.__nested.panel.openSections(),window.__nested.appearance.openSections()])).toEqual([['view'],['grid','background']]);
 // Rebuilt: each accordion's open sections and the form's value come back.
 await page.evaluate(()=>{window.__nested.panel.close('filter');window.__nested.appearance.close('background');});
 await unmount();await mount();
 expect(await page.evaluate(()=>[window.__nested.panel.openSections(),window.__nested.appearance.openSections(),window.__nested.form.values().size])).toEqual([['view'],['grid'],32]);
 await unmount();
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.includes('vc-'))localStorage.removeItem(key);});
 expect(failures).toEqual([]);
});

// Screenshots for review: both widths, every factory theme and the demo skins, Hungarian and English.
for(const [label,options] of [['blade',{theme:'blade'}],['blade-night',{theme:'blade-night'}],['light',{theme:'light'}],['dark',{theme:'dark'}],
 ['slate',{email:'skins@example.test',skin:'demo-slate'}],['ink',{email:'skins@example.test',skin:'demo-ink'}]]){
 test(`view controls render in ${label}`,async({page})=>{
  const failures=errors(page);
  for(const width of [1366,390]){
   await start(page,{...options,width,height:width>500?900:844});await build(page,{key:'vc-shot'});
   await page.evaluate(()=>{window.__vc.form.set('grid',true);window.__vc.form.set('tags',['warm']);});
   await page.screenshot({path:path.join(runtime,`view-controls-${label}-${width}.png`),animations:'disabled'});
   const measured=await contrast(page,{segment:'#vc .blade-segmented .dhx_radiobutton:has(:checked) .dhx_text',chip:'#vc .blade-chips .dhx_checkbox:has(:checked) .dhx_text',
    plainSegment:'#vc .blade-segmented .dhx_layout-cell:last-child .dhx_text',...(width>500?{pressed:'#vc [data-cell-id="top"] .dhx_toolbar-button[aria-pressed="true"] .dhx_toolbar-button__text',value:'#vc .blade-command-range__value'}:{})});
   console.log('CONTRAST',label,width,JSON.stringify(measured));
   for(const [name,value] of Object.entries(measured))expect(value,`${name} contrast in ${label}`).toBeGreaterThanOrEqual(4.5);
   // The pressed toggle differs from a plain button.
   if(width>500){
    const top=page.locator('#vc [data-cell-id="top"]');
    const [on,off]=await Promise.all([top.getByRole('button',{name:'Ismétlés'}),top.getByRole('button',{name:'Vissza'})].map(button=>button.evaluate(e=>getComputedStyle(e).backgroundColor+getComputedStyle(e).boxShadow)));
    expect(on).not.toBe(off);
   }
   // The control panel stays usable at phone width: no horizontal overflow.
   if(width<500)expect(await panel(page).evaluate(e=>[...e.querySelectorAll('*')].filter(child=>child.getBoundingClientRect().right>e.getBoundingClientRect().right+1&&child.getClientRects().length).length)).toBe(0);
   await teardown(page);
   await page.context().clearCookies();
  }
  expect(failures).toEqual([]);
 });
}

test('view controls in English',async({page})=>{
 const failures=errors(page);
 await fixture(page);await page.setViewportSize({width:1366,height:900});await page.goto('/');
 const language=page.getByRole('dialog').locator('.dhx_layout-cell.blade-language-field');await language.locator('input').click();
 await page.locator('.dhx_combobox-options').getByText('English',{exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Sign in',exact:true})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill('demo@example.test');await page.getByLabel('Password',{exact:true}).fill('61ade-demo');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Sign in',exact:true})).toHaveCount(0);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
 for(const width of [1366,390]){
  await page.setViewportSize({width,height:width>500?900:844});
  await build(page,{key:'vc-en'});
  if(width<500)await expect(page.locator('#vc [data-cell-id="top"]').getByRole('button',{name:'Actions'})).toBeVisible();
  else await expect(page.locator('#vc [data-cell-id="top"]').getByRole('button',{name:'Back'})).toBeVisible();
  await page.screenshot({path:path.join(runtime,`view-controls-en-${width}.png`),animations:'disabled'});
  await teardown(page);
 }
 // Back to the default language for the other specs.
 await page.setViewportSize({width:1366,height:900});
 await page.getByRole('button',{name:'English',exact:true}).click();await page.getByRole('menuitem',{name:'Magyar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Magyar',exact:true})).toBeVisible();
 expect(failures).toEqual([]);
});

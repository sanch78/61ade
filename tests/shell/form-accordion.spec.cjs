const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn}=require('./feature-demo.cjs');
// Accordion form sections (FB-0178) on the feature demo's `Kapcsolatok` (examples/demo-app/contacts.php, `formSections:
// 'accordion'`): the Accordion component's header, one section open at a time, a window whose size never changes when
// a section opens, the keys, an error opening its section, values of closed sections saved; `accordion-multiple` by a
// rewritten form description; a phone; a section-filling note and photo (FB-0181). A fixture module hands `app` to the page (an Accordion to compare with).
// Records of the run start with the run prefix and are removed afterwards.
const prefix='fa'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const query=sql=>JSON.parse(php(`echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`));
const cleanup=()=>php(`$db->exec("DELETE FROM demo_contacts WHERE name LIKE '${prefix}%'");$db->exec("DELETE FROM demo_attachment_files WHERE name LIKE '${prefix}%'");`);
/** A grey PNG of $width × $height pixels (a tall image must not grow the drop area). */
function png(width,height){
 const zlib=require('node:zlib'),crc=buffer=>{let c=~0;for(const byte of buffer){c^=byte;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return ~c>>>0;};
 const chunk=(type,data)=>{const head=Buffer.alloc(8);head.writeUInt32BE(data.length);head.write(type,4);const tail=Buffer.alloc(4);tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4),data])));return Buffer.concat([head,data,tail]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;
 const rows=Buffer.alloc((width+1)*height,0x80);for(let y=0;y<height;y++)rows[y*(width+1)]=0;
 return Buffer.concat([Buffer.from([0x89,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const MODULE='/form-accordion-fixture.mjs';
test.describe.configure({mode:'serial'});
test.beforeAll(cleanup);
test.afterAll(cleanup);

const editor=(page,label)=>page.getByRole('dialog',{name:new RegExp('^Kapcsolatok — '+label+'$')});
const header=(form,name)=>form.getByRole('button',{name,exact:true});
const height=async form=>Math.round((await form.boundingBox()).height);
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
async function open(page,width=1366){
 await fixture(page);
 await page.setViewportSize({width,height:width<768?844:900});
 await signIn(page,'demo@example.test','/#view=demo_contacts');
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
/** Rewrites the form descriptions of this page (`__form`) with $change. */
const rewrite=(page,change)=>page.route(url=>url.pathname==='/',async route=>{
 const request=route.request();let body;
 try{body=request.postDataJSON();}catch{}
 if(request.method()!=='POST'||body?.action!=='__form')return route.fallback();
 const response=await route.fetch(),json=await response.json();
 change(json.data);
 await route.fulfill({response,json});
});
/** The sections' open state in order. */
const expanded=form=>form.locator('.blade-form-section__heading button').evaluateAll(buttons=>buttons.map(button=>button.textContent.trim()+':'+button.getAttribute('aria-expanded')));
/** Computed styles of a header box, its title and its chevron, once the transitions (Suite's title colour) have ended. */
const look=(element,title,chevron,pseudo)=>element.evaluate(async(element,[title,chevron,pseudo])=>{
 await Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{})));
 const pick=(node,names,which)=>{const style=getComputedStyle(node,which);return Object.fromEntries(names.map(name=>[name,style.getPropertyValue(name)]));};
 return {box:pick(element,['height','background-image','background-color','border-bottom-width','border-bottom-color','box-shadow']),
  title:pick(element.querySelector(title),['font-size','font-weight','line-height','color','text-shadow']),
  chevron:pick(element.querySelector(chevron),['width','height','border-right','border-bottom','transform','color'],pseudo)};
},[title,chevron,pseudo]);

test('an accordion form: the Accordion header, one section open, a window that keeps its size; the keys; an error opens its section; closed values are saved',async({page})=>{
 await open(page);
 await add(page);
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 // The name and the organization are plain rows above the sections, with no header of their own; the first
 // collapsible section is open and stays open.
 await expect(form.getByRole('textbox',{name:'Név'})).toBeVisible();
 expect((await form.getByRole('textbox',{name:'Szervezet'}).boundingBox()).y).toBeLessThan((await form.locator('.blade-form-section').first().boundingBox()).y);
 await expect(form.locator('.blade-form-section')).toHaveCount(5);
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:true','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await expect(header(form,'Elérhetőség')).toHaveAttribute('aria-disabled','true');
 await expect(header(form,'Cím')).not.toHaveAttribute('aria-disabled','true');
 const controls=await header(form,'Cím').getAttribute('aria-controls');
 expect(await form.locator(`fieldset[id="${controls}"]`).count()).toBe(1);
 await expect(form.getByRole('group',{name:'Elérhetőség',exact:true}).getByRole('textbox',{name:'Telefon'})).toBeVisible();
 // The header is the Accordion component's: the same box, title and chevron as an Accordion's cell header.
 await page.evaluate(()=>{
  const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width:360,height:240});
  window.__accordion=new app.components.Accordion({sections:[{id:'a',label:'Első'},{id:'b',label:'Második'}]});window.__accordion.mount(host);
 });
 const fixtureWindow=page.getByRole('dialog',{name:'Fixture',exact:true});
 const openHeader=fixtureWindow.getByRole('button',{name:'Első'}),closedHeader=fixtureWindow.getByRole('button',{name:'Második'});
 await expect(closedHeader).toBeVisible();
 const chevron='.dhx_layout-cell-header__collapse-icon';
 const reference={open:await look(openHeader,'.dhx_layout-cell-header__title',chevron,'::before'),closed:await look(closedHeader,'.dhx_layout-cell-header__title',chevron,'::before')};
 await page.evaluate(()=>{window.__accordion.destroy();window.__window.close();});
 const heading=name=>form.locator('.blade-form-section__heading').filter({has:page.getByRole('button',{name,exact:true})});
 const mine={open:await look(heading('Elérhetőség'),'.dhx_button__text','.dhx_button','::after'),closed:await look(heading('Cím'),'.dhx_button__text','.dhx_button','::after')};
 for(const state of ['open','closed']){
  const {box,title,chevron:mark}=mine[state],{box:refBox,title:refTitle,chevron:refMark}=reference[state];
  // A closed section's header leaves the lower rule (1 px of its height) to the stack's frame.
  if(state==='closed')for(const name of ['height','border-bottom-width','border-bottom-color']){delete box[name];delete refBox[name];}
  expect({box,title,mark},state).toEqual({box:refBox,title:refTitle,mark:refMark});
 }
 // Opening another section closes the open one; the window keeps its size.
 const size=await height(form);
 await header(form,'Cím').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:true','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await expect(form.getByRole('group',{name:'Cím',exact:true}).getByRole('textbox',{name:'Település'})).toBeVisible();
 await expect(form.getByRole('textbox',{name:'Telefon'})).toBeHidden();
 expect(await height(form)).toBe(size);
 await header(form,'Beállítások').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:false','Beállítások:true','Megjegyzés:false','Fénykép:false']);
 expect(await height(form)).toBe(size);
 // Clicking the open section keeps it open (one stays open; its header says so with aria-disabled).
 await header(form,'Beállítások').click({force:true});
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:false','Beállítások:true','Megjegyzés:false','Fénykép:false']);
 // The keys: the arrows, Home and End move between the headers; Enter opens one.
 await header(form,'Fénykép').focus();
 await page.keyboard.press('ArrowDown');await expect(header(form,'Elérhetőség')).toBeFocused();
 await page.keyboard.press('End');await expect(header(form,'Fénykép')).toBeFocused();
 await page.keyboard.press('ArrowUp');await expect(header(form,'Megjegyzés')).toBeFocused();
 await page.keyboard.press('Home');await expect(header(form,'Elérhetőség')).toBeFocused();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:true','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 expect(await height(form)).toBe(size);
 // A missing e-mail in the closed `Elérhetőség` opens it (closing `Cím`) and takes the focus.
 await form.getByRole('textbox',{name:'Név'}).fill(prefix+' Kapcsolat');
 await form.getByRole('textbox',{name:'Település'}).fill('Szeged');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:true','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await expect(form.getByRole('textbox',{name:'E-mail'})).toBeFocused();
 // The values of the closed sections are saved with the open one's.
 await form.getByRole('textbox',{name:'E-mail'}).fill(prefix+'@example.test');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toBeHidden();
 await expect.poll(()=>query(`SELECT email, city, channel FROM demo_contacts WHERE name = '${prefix} Kapcsolat'`)).toEqual([{email:prefix+'@example.test',city:'Szeged',channel:'email'}]);
});

test('accordion-multiple: several sections open, an open one closes, the window keeps its size',async({page})=>{
 await open(page);
 // The form description of this run asks for several open sections.
 await rewrite(page,data=>{data.formSections='accordion-multiple';});
 await add(page);
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:true','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await expect(header(form,'Elérhetőség')).not.toHaveAttribute('aria-disabled','true');
 const size=await height(form);
 await header(form,'Cím').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:true','Cím:true','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await expect(form.getByRole('textbox',{name:'Telefon'})).toBeAttached();
 expect(await height(form)).toBe(size);
 await header(form,'Elérhetőség').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:true','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await header(form,'Cím').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 expect(await height(form)).toBe(size);
 // The action row stays at the window's lower edge with every section closed.
 const frame=await form.boundingBox(),save=await form.getByRole('button',{name:'Mentés',exact:true}).boundingBox();
 expect(frame.y+frame.height-(save.y+save.height)).toBeLessThan(40);
});

test('an accordion form on a phone: the window fits the screen, an open section scrolls its own fields',async({page})=>{
 await open(page,390);
 await add(page);
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 const box=await form.boundingBox();
 expect(box.height).toBeLessThanOrEqual(844-24);
 const size=await height(form);
 await header(form,'Fénykép').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:true']);
 expect(await height(form)).toBe(size);
 const note=form.getByRole('button',{name:'Fájl megadása…',exact:true});
 await note.scrollIntoViewIfNeeded();await expect(note).toBeInViewport();
 await expect(form.getByRole('button',{name:'Mentés',exact:true})).toBeInViewport();
});

test('a RecordForm in a region (an Accordion section, like the media viewer edit form): the sections share its height; in a fitted window it keeps the fitted size',async({page})=>{
 await open(page);
 // A region of a fixed height: the open section fills what the fixed section and the headers leave.
 await page.evaluate(()=>{
  const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width:560,height:560,fit:false});
  const side=window.__side=new app.components.Accordion({sections:[{id:'edit',label:'Szerkesztés'}]});side.mount(host);
  window.__form=new app.components.RecordForm({resource:'demo_contacts',action:'create'});side.attach('edit',window.__form);
 });
 const region=page.getByRole('dialog',{name:'Fixture',exact:true});
 await expect.poll(()=>expanded(region)).toEqual(['Elérhetőség:true','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 const bottom=async()=>{const frame=await region.boundingBox(),save=await region.getByRole('button',{name:'Mentés',exact:true}).boundingBox();return Math.round(frame.y+frame.height-(save.y+save.height));};
 const gap=await bottom();expect(gap).toBeLessThan(40);
 expect(await height(region)).toBe(560);
 await header(region,'Cím').click();
 await expect.poll(()=>expanded(region)).toEqual(['Elérhetőség:false','Cím:true','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 expect(await height(region)).toBe(560);expect(await bottom()).toBe(gap);
 // The open section scrolls its own fields within its share.
 const body=region.locator('.blade-form-section--accordion:not(.blade-form-section--still) > .blade-form-section__body:not(.blade-form-section__body--closed)');
 expect(await body.evaluate(element=>element.scrollHeight>element.clientHeight)).toBe(true);
 await page.evaluate(()=>{window.__side.destroy();window.__window.close();});
 // A fitted window: the RecordForm fits it once, and opening another section keeps that size.
 await page.evaluate(()=>{
  const app=window.__bladeApp,host=window.__window=app.ui.window({title:'Fixture',width:560,height:300});
  window.__form=new app.components.RecordForm({resource:'demo_contacts',action:'create'});window.__form.mount(host);
 });
 const fitted=page.getByRole('dialog',{name:'Fixture',exact:true});
 await expect.poll(()=>expanded(fitted)).toEqual(['Elérhetőség:true','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await expect.poll(()=>height(fitted)).toBeGreaterThan(300);
 const size=await height(fitted);
 await header(fitted,'Cím').click();
 await expect.poll(()=>expanded(fitted)).toEqual(['Elérhetőség:false','Cím:true','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 expect(await height(fitted)).toBe(size);
 await page.evaluate(()=>{window.__form.destroy();window.__window.close();});
});

/** Waits until $form stays in place over two frames (a fitted window is resized and centred after it shows). */
async function settled(page,form){
 for(let attempt=0;attempt<30;attempt++){
  const before=JSON.stringify(await form.boundingBox());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(JSON.stringify(await form.boundingBox())===before)return;
 }
 throw new Error('the window did not settle');
}

test('flush sections fill the form edge to edge; framed ones keep an even 20 px margin',async({page})=>{
 await open(page);
 const box=locator=>locator.boundingBox();
 // `Kapcsolatok` declares flushSections: the headers span the window under its header, the fields keep a 20 px inset.
 await add(page);
 let form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:true','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await settled(page,form);
 const frame=await box(form),content=await box(form.locator('.dhx_form'));
 const heading=await box(form.locator('.blade-form-section__heading').first()),name=await box(form.getByRole('textbox',{name:'Név'}));
 expect(Math.round(heading.x-frame.x)).toBeLessThanOrEqual(1);expect(Math.round(frame.x+frame.width-(heading.x+heading.width))).toBeLessThanOrEqual(1);
 expect(Math.round(name.x-content.x)).toBe(20);expect(Math.round(content.x+content.width-(name.x+name.width))).toBe(20);
 expect(await form.locator('.blade-form-section').first().evaluate(element=>getComputedStyle(element).borderLeftWidth)).toBe('0px');
 // The plain rows above the sections: 20 px below the window's header, no header of their own.
 const title=await box(form.locator('.dhx_window-header')),label=await box(form.getByText('Név',{exact:true}));
 expect(Math.round(label.y-(title.y+title.height))).toBeGreaterThanOrEqual(16);expect(Math.round(label.y-(title.y+title.height))).toBeLessThanOrEqual(24);
 await form.getByRole('button',{name:'Mégse',exact:true}).click();await expect(form).toBeHidden();
 // Without flushSections, and with the name and the organization in a fixed section: the stack is framed, 20 px
 // from the form's edges and from the action row's rule; the fixed section is a group named by its header, no button.
 await rewrite(page,data=>{
  delete data.flushSections;
  for(const field of data.fields)if(field.name==='name'||field.name==='organization')Object.assign(field,{section:'Alapadatok',sectionCollapsible:false});
 });
 await add(page);
 form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:true','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:false']);
 await settled(page,form);
 const inner=await box(form.locator('.dhx_form')),sections=form.locator('.blade-form-section');
 const top=await box(sections.first()),bottom=await box(sections.last()),actions=await box(form.locator('.blade-form-actions'));
 expect(Math.round(top.y-inner.y)).toBe(20);
 expect(Math.round(top.x-inner.x)).toBe(20);expect(Math.round(inner.x+inner.width-(top.x+top.width))).toBe(20);
 expect(Math.round(actions.y-(bottom.y+bottom.height))).toBe(20);
 expect(await sections.first().evaluate(element=>getComputedStyle(element).borderLeftWidth)).toBe('1px');
 await expect(form.getByRole('group',{name:'Alapadatok',exact:true}).getByRole('textbox',{name:'Név'})).toBeVisible();
 await expect(header(form,'Alapadatok')).toHaveCount(0);
 await expect(sections).toHaveCount(6);
});

test('a section-filling field: the note is the open section\'s body, the photo\'s drop area fills its section; the header names them; both are saved',async({page})=>{
 await open(page);
 await add(page);
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 const section=name=>form.locator('.blade-form-section').filter({has:page.getByRole('button',{name,exact:true})});
 const size=await height(form);
 // The note: no visible label of its own (still its accessible name), the textarea takes the open section's body.
 await header(form,'Megjegyzés').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:false','Beállítások:false','Megjegyzés:true','Fénykép:false']);
 const note=form.getByRole('textbox',{name:'Megjegyzés',exact:true});await expect(note).toBeVisible();
 await expect(section('Megjegyzés').locator('label')).not.toBeVisible();
 const body=await section('Megjegyzés').locator('.blade-form-section__body').boundingBox(),area=await note.boundingBox();
 for(const edge of ['x','y','width','height'])expect(Math.abs(Math.round(area[edge]-body[edge])),edge).toBeLessThanOrEqual(1);
 expect(area.height).toBeGreaterThan(150);
 expect(await height(form)).toBe(size);
 await note.fill(prefix+' első sor\nmásodik sor');
 // The photo: the file name without a label, the drop area takes what the name and the buttons leave.
 await header(form,'Fénykép').click();
 await expect.poll(()=>expanded(form)).toEqual(['Elérhetőség:false','Cím:false','Beállítások:false','Megjegyzés:false','Fénykép:true']);
 expect(await height(form)).toBe(size);
 const photo=section('Fénykép'),drop=await photo.locator('.dhx_avatar').boundingBox(),frame=await photo.boundingBox();
 await expect(photo.getByRole('textbox',{name:'Fénykép',exact:true})).toBeVisible();
 await expect(photo.locator('label')).not.toBeVisible();
 expect(drop.height).toBeGreaterThan(150);
 const buttons=await photo.getByRole('button',{name:'Fájl megadása…',exact:true}).boundingBox();
 expect(frame.y+frame.height-(buttons.y+buttons.height)).toBeLessThan(40);
 const chosen=page.waitForEvent('filechooser');
 await photo.locator('.dhx_avatar').click();
 await (await chosen).setFiles([{name:prefix+'-foto.png',mimeType:'image/png',buffer:png(40,1600)}]);
 await expect(photo.getByRole('textbox',{name:'Fénykép',exact:true})).toHaveValue(prefix+'-foto.png',{timeout:20000});
 // A tall image changes nothing: the drop area keeps its box, the image is fitted inside it, whole.
 const image=photo.locator('.dhx_avatar img');await expect(image).toBeVisible();
 expect(await photo.locator('.dhx_avatar').boundingBox()).toEqual(drop);
 expect(await height(form)).toBe(size);
 const fitted=await image.evaluate(element=>({natural:element.naturalHeight,box:element.getBoundingClientRect().height,fit:getComputedStyle(element).objectFit}));
 expect(fitted.natural).toBe(1600);expect(fitted.fit).toBe('contain');expect(fitted.box).toBeLessThanOrEqual(drop.height+1);
 // A required section-filling field: its header carries the required mark.
 await form.getByRole('textbox',{name:'Név'}).fill(prefix+' Kitöltő');
 await header(form,'Elérhetőség').click();
 await form.getByRole('textbox',{name:'E-mail'}).fill(prefix+'@example.test');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toBeHidden();
 await expect.poll(()=>query(`SELECT c.note, f.state FROM demo_contacts c JOIN demo_attachment_files f ON f.id = c.photo WHERE c.name = '${prefix} Kitöltő'`)).toEqual([{note:prefix+' első sor\nmásodik sor',state:'committed'}]);
 // A required one (a rewritten description): the header carries the mark that its hidden label no longer shows.
 await rewrite(page,data=>{for(const field of data.fields)if(field.name==='note')field.required=true;});
 await add(page);
 const again=editor(page,'Hozzáadás');await expect(again).toBeVisible();
 const mark=name=>again.locator('.blade-form-section__heading').filter({has:page.getByRole('button',{name,exact:true})}).locator('.dhx_button__text').evaluate(element=>getComputedStyle(element,'::after').content);
 expect(await mark('Megjegyzés')).toContain('"*"');
 // The mark is visual only: the header keeps the section's name, the textarea itself is required.
 await expect(header(again,'Megjegyzés')).toHaveCount(1);
 expect(await again.locator('textarea[name="note"]').evaluate(element=>element.required||element.getAttribute('aria-required')==='true')).toBe(true);
 expect(await mark('Fénykép')).toBe('none');
});

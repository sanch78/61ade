const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,api}=require('./feature-demo.cjs');
// Conditional form sections (FB-0240) on the feature demo's `Értesítési szabályok` (modules/notifications.json,
// `section_visible_when`, accordion form sections): the `Értesítés bekapcsolva` checkbox shows the two section-filling
// message sections, `Kézbesítés` one section per choice. A hidden section is gone as a whole (header, frame, fields),
// is never the open accordion section, is not validated, and its stored values stay. The panels by a rewritten form
// description. Records of the run start with the run prefix and are removed afterwards.
const prefix='fc'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const query=sql=>JSON.parse(php(`echo json_encode($db->query(${JSON.stringify(sql)})->fetchAll(PDO::FETCH_ASSOC));`));
const cleanup=()=>php(`$db->exec("DELETE FROM demo_notifications WHERE title LIKE '${prefix}%'");`);
test.describe.configure({mode:'serial'});
test.beforeAll(cleanup);
test.afterAll(cleanup);

const editor=(page,label)=>page.getByRole('dialog',{name:new RegExp('^Értesítési szabályok — '+label+'$')});
const header=(form,name)=>form.getByRole('button',{name,exact:true});
const height=async form=>Math.round((await form.boundingBox()).height);
/** The sections in the form (a hidden one is not rendered): their header text, and for an accordion its open state. */
const sections=form=>form.locator('.blade-form-section').evaluateAll(nodes=>nodes.map(node=>{
 const button=node.querySelector('.blade-form-section__heading button, .blade-form-section__toggle button');
 return (button?.textContent??node.querySelector('legend')?.textContent??'').trim()+(button?.hasAttribute('aria-expanded')?':'+button.getAttribute('aria-expanded'):'');
}));
async function toggle(form,on){
 const box=form.getByRole('checkbox',{name:/^(checkbox )?Értesítés bekapcsolva$/});
 await expect(box).toBeChecked({checked:!on});
 await box.locator('xpath=..').locator('.dhx_checkbox__visual-input').click();
 await expect(box).toBeChecked({checked:on});
}
const delivery=(form,label)=>form.getByLabel('Kézbesítés',{exact:true}).selectOption({label});
async function open(page){
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error'&&message.text().includes('61ade'))errors.push(message.text());});
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test','/#view=demo_notifications');
 await expect(page.locator('[data-cell-id="grid"] .dhx_grid-row').first()).toBeVisible();
 return errors;
}
const row=(page,title)=>page.locator('[data-cell-id="grid"] .dhx_grid-row').filter({hasText:title}).first();
/** Rewrites the form descriptions of this page (`__form`) with $change. */
const rewrite=(page,change)=>page.route(url=>url.pathname==='/',async route=>{
 const request=route.request();let body;
 try{body=request.postDataJSON();}catch{}
 if(request.method()!=='POST'||body?.action!=='__form')return route.fallback();
 const response=await route.fetch(),json=await response.json();
 change(json.data);
 await route.fulfill({response,json});
});

test('accordion: the checkbox hides and shows the message sections as a whole; the open one moves; the window refits; a hidden required text is not validated',async({page})=>{
 const errors=await open(page);
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 // On by default with immediate delivery: the two message sections and the immediate one; the first is open.
 await expect.poll(()=>sections(form)).toEqual(['E-mail szövege:true','SMS szövege:false','Azonnali kézbesítés:false']);
 const text=form.getByRole('textbox',{name:'E-mail szövege',exact:true});
 await text.fill(prefix+' typed');
 const tall=await height(form);
 // Off: both message sections are gone (header and frame), the next shown one opens, the window fits the rest.
 await toggle(form,false);
 await expect.poll(()=>sections(form)).toEqual(['Azonnali kézbesítés:true']);
 await expect(header(form,'E-mail szövege')).toHaveCount(0);
 await expect(form.getByText('SMS szövege',{exact:true})).toHaveCount(0);
 await expect.poll(()=>height(form)).toBeLessThan(tall);
 // On again: they return with the typed text; the open section stays the one that was open.
 await toggle(form,true);
 await expect.poll(()=>sections(form)).toEqual(['E-mail szövege:false','SMS szövege:false','Azonnali kézbesítés:true']);
 await expect.poll(()=>height(form)).toBe(tall);
 await header(form,'E-mail szövege').click();
 await expect(text).toHaveValue(prefix+' typed');
 // The keys move between the shown headers only.
 await header(form,'Azonnali kézbesítés').focus();
 await page.keyboard.press('ArrowDown');await expect(header(form,'E-mail szövege')).toBeFocused();
 // Required while shown: an empty e-mail text is refused in the browser.
 await form.getByRole('textbox',{name:'Megnevezés',exact:true}).fill(prefix+' Ki');
 await text.fill('');
 const sent=[];page.on('request',request=>{try{if(request.postDataJSON()?.action==='create')sent.push(request);}catch{}});
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toBeVisible();
 expect(sent).toHaveLength(0);
 // Hidden: the same empty required text is not validated in the browser or on the server; the record saves.
 await toggle(form,false);
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toBeHidden();
 await expect.poll(()=>query(`SELECT enabled, delivery, email_text FROM demo_notifications WHERE title = '${prefix} Ki'`)).toEqual([{enabled:0,delivery:'immediate',email_text:''}]);
 expect(errors).toEqual([]);
});

test('panels: switched off and saved, the hidden sections keep their stored texts; switched on, they are back',async({page})=>{
 const errors=await open(page);
 await rewrite(page,data=>{delete data.formSections;});
 const created=await api(page,'demo_notifications','create',null,{title:prefix+' Panelek',enabled:'1',delivery:'schedule',email_text:'E-mail '+prefix,sms_text:'SMS '+prefix,schedule_rule:'Hétfőnként'});
 expect(created.status).toBe(200);
 await page.reload();
 await row(page,prefix+' Panelek').dblclick();
 let form=editor(page,'Módosítás');await expect(form).toBeVisible();
 // Framed panels: the message sections open (they hold values), the schedule's section too; no other delivery section.
 await expect.poll(()=>sections(form)).toEqual(['E-mail szövege:true','SMS szövege:true','Ütemezés:true']);
 const tall=await height(form);
 await toggle(form,false);
 await expect.poll(()=>sections(form)).toEqual(['Ütemezés:true']);
 await expect.poll(()=>height(form)).toBeLessThan(tall);
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toBeHidden();
 await expect.poll(()=>query(`SELECT enabled, email_text, sms_text FROM demo_notifications WHERE title = '${prefix} Panelek'`)).toEqual([{enabled:0,email_text:'E-mail '+prefix,sms_text:'SMS '+prefix}]);
 // Opened again while off: the sections stay hidden; switched on, they show the kept texts.
 await row(page,prefix+' Panelek').dblclick();
 form=editor(page,'Módosítás');await expect(form).toBeVisible();
 await expect.poll(()=>sections(form)).toEqual(['Ütemezés:true']);
 await toggle(form,true);
 await expect.poll(()=>sections(form)).toEqual(['E-mail szövege:true','SMS szövege:true','Ütemezés:true']);
 await expect(form.getByRole('textbox',{name:'E-mail szövege',exact:true})).toHaveValue('E-mail '+prefix);
 await expect(form.getByRole('textbox',{name:'SMS szövege',exact:true})).toHaveValue('SMS '+prefix);
 await form.getByRole('button',{name:'Mégse',exact:true}).click();
 expect(errors).toEqual([]);
});

test('a select controller: one section per choice; a hidden open section hands over; only the shown section is validated',async({page})=>{
 const errors=await open(page);
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const form=editor(page,'Hozzáadás');await expect(form).toBeVisible();
 await form.getByRole('textbox',{name:'Megnevezés',exact:true}).fill(prefix+' Ütemezett');
 await toggle(form,false);
 await expect.poll(()=>sections(form)).toEqual(['Azonnali kézbesítés:true']);
 // Each choice shows its own section, open as the only one shown.
 await delivery(form,'Napi összesítő');
 await expect.poll(()=>sections(form)).toEqual(['Napi összesítő:true']);
 await delivery(form,'Ütemezve');
 await expect.poll(()=>sections(form)).toEqual(['Ütemezés:true']);
 await delivery(form,'Napi összesítő');
 await expect.poll(()=>sections(form)).toEqual(['Napi összesítő:true']);
 // An invalid time is refused while its section is shown ...
 const time=form.getByRole('textbox',{name:'Küldés időpontja',exact:true});
 await time.fill('99');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form.getByText('Az időpontot ÓÓ:PP formában add meg.')).toBeVisible();
 await expect(form).toBeVisible();
 // ... and ignored once another choice hides it; the shown required schedule is checked instead.
 await delivery(form,'Ütemezve');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form.getByText('Az időpontot ÓÓ:PP formában add meg.')).toHaveCount(0);
 await expect(form).toBeVisible();
 await form.getByRole('textbox',{name:'Ütemezés',exact:true}).fill('Minden pénteken');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(form).toBeHidden();
 await expect.poll(()=>query(`SELECT delivery, digest_time, schedule_rule FROM demo_notifications WHERE title = '${prefix} Ütemezett'`)).toEqual([{delivery:'schedule',digest_time:'',schedule_rule:'Minden pénteken'}]);
 expect(errors).toEqual([]);
});

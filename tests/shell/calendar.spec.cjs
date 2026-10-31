const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,api}=require('./feature-demo.cjs');
// Event calendar (DHTMLX Scheduler) as the feature demo's signage scheduler, see docs/calendar.md.
// Events created here start with the run prefix and are deleted afterwards.
const prefix='pw'+Date.now().toString(36);
test.describe.configure({mode:'serial'});

async function openCalendar(page,email='demo@example.test'){
 await page.setViewportSize({width:1400,height:900});await signIn(page,email);
 const burger=page.getByRole('menuitem',{name:/^(Menü|Menu)$/}),group=page.getByRole('menuitem',{name:'Digitális kijelző',exact:true});
 await expect(burger.or(group).first()).toBeVisible();if(await burger.isVisible())await burger.click();
 await page.getByRole('menuitem',{name:'Digitális kijelző',exact:true}).click();await page.getByRole('menuitem',{name:'Műsorterv',exact:true}).click();
 await expect(page.locator('.blade-calendar .dhx_cal_data')).toBeVisible();
}
async function cleanup(page){
 const listed=await api(page,'signage_schedule','events',null,{from:'2026-01-01',to:'2026-03-01'});
 const now=Date.now(),d=days=>new Date(now+days*86400000).toISOString().slice(0,10);
 const past=await api(page,'signage_schedule','events',null,{from:d(-60),to:d(0)}),next=await api(page,'signage_schedule','events',null,{from:d(0),to:d(40)});
 const events=new Map([...(listed.body.data?.events??[]),...(past.body.data?.events??[]),...(next.body.data?.events??[])].map(event=>[event.id,event]));
 for(const event of events.values())if(event.text.startsWith(prefix))await api(page,'signage_schedule','delete',event.id,{revision:event.revision});
}

const editor=page=>page.locator('.blade-calendar-editor');
// Runs after failures too, so no test event outlives its run.
test.afterEach(async({page})=>{await cleanup(page);});
// Dates are picked in the Suite datepicker popup: day `day` of the previous month, keeping the time.
async function pickPreviousMonth(page,box,label,day){
 const field=box.getByRole('textbox',{name:label,exact:true}),before=await field.inputValue();
 await field.click();const popup=page.locator('.dhx_popup[aria-live]:visible');
 await popup.locator('.dhx_calendar-action__prev').click();
 await popup.locator('.dhx_calendar-day:not(.dhx_calendar-day--outside)').getByText(String(day),{exact:true}).first().click();
 await expect(field).not.toHaveValue(before);await expect(popup).toHaveCount(0);
}
const created=page=>page.waitForResponse(r=>{try{return r.request().postDataJSON()?.action==='create';}catch{return false;}});

test('week view shows the recurring programme and the shared event form creates an event',async({page})=>{
 await openCalendar(page);
 await expect(page.locator('.dhx_cal_event').filter({hasText:'Reggeli lista'}).first()).toBeVisible();
 await expect(page.locator('.dhx_cal_event').filter({hasText:'Arculati animáció'}).first()).toBeVisible();
 await page.getByRole('button',{name:'Új esemény',exact:true}).click();
 const box=editor(page);await expect(box).toBeVisible();
 await expect(page.locator('.dhx_cal_light')).toHaveCount(0);
 await expect(box.getByRole('button',{name:'Mégse'})).toBeVisible();
 await box.getByLabel('Megnevezés').fill(prefix+' teszt');
 await box.getByLabel('Tartalom').selectOption({label:'Az idő elegáns pillanata'});
 const saved=created(page);
 await box.getByRole('button',{name:'Mentés',exact:true}).click();
 expect((await saved).status()).toBe(200);await expect(box).toHaveCount(0);
 await expect(page.locator('.dhx_cal_event').filter({hasText:prefix}).first()).toBeVisible();
 await page.locator('.dhx_cal_tab[data-tab="month"], .dhx_cal_tab[name="month_tab"]').first().click();
 await expect(page.locator('.dhx_cal_event_clear, .dhx_cal_event_line').filter({hasText:'Reggeli lista'}).first()).toBeVisible();
});

test('editing one occurrence of a series stores an exception and keeps the series',async({page})=>{
 await openCalendar(page);
 await page.locator('.dhx_cal_event').filter({hasText:'Reggeli lista'}).first().dblclick();
 await page.locator('.blade-dialog').getByRole('button',{name:'Csak ez az esemény',exact:true}).click();
 const box=editor(page);await expect(box).toBeVisible();
 // An occurrence edited alone keeps the series rule: no recurrence controls.
 await expect(box.getByLabel('Ismétlődés',{exact:true})).toHaveCount(0);
 await box.getByLabel('Megnevezés').fill(prefix+' kivétel');
 const saved=created(page);
 await box.getByRole('button',{name:'Mentés',exact:true}).click();
 const response=await saved;expect(response.status()).toBe(200);
 const values=response.request().postDataJSON().values;
 expect(values.recurring_event_id).not.toBe('');expect(values.content).not.toBe('');
 await expect(page.locator('.dhx_cal_event').filter({hasText:prefix+' kivétel'})).toHaveCount(1);
 expect(await page.locator('.dhx_cal_event').filter({hasText:'Reggeli lista'}).count()).toBeGreaterThan(0);
});

test('the event form validates the period and writes a weekly series rule',async({page})=>{
 await openCalendar(page);
 await page.getByRole('button',{name:'Új esemény',exact:true}).click();
 const box=editor(page);await expect(box).toBeVisible();
 await box.getByLabel('Megnevezés').fill(prefix+' sorozat');
 await box.getByLabel('Tartalom').selectOption({label:'Az idő elegáns pillanata'});
 await pickPreviousMonth(page,box,'Vége',15);
 let writes=0;page.on('request',r=>{try{if(r.postDataJSON()?.action==='create')writes++;}catch{}});
 await box.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(box).toContainText('A vége a kezdés utáni legyen.');expect(writes).toBe(0);
 await pickPreviousMonth(page,box,'Kezdete',14);
 await box.getByLabel('Ismétlődés',{exact:true}).selectOption({label:'Hetente'});
 const days=box.locator('.blade-calendar-days');await expect(days).toBeVisible();
 // Suite draws its own box over the native input: the caption is clicked.
 for(const name of ['H','Sze']){const box=days.getByRole('checkbox',{name,exact:true});if(!await box.isChecked())await days.getByText(name,{exact:true}).click();await expect(box).toBeChecked();}
 await box.getByLabel('Ismétlődés vége').selectOption({label:'Adott számú alkalom után'});
 await box.getByLabel('Alkalmak száma').fill('3');
 const saved=created(page);
 await box.getByRole('button',{name:'Mentés',exact:true}).click();
 const response=await saved;expect(response.status()).toBe(200);
 const values=response.request().postDataJSON().values;
 expect(values.rrule).toMatch(/^FREQ=WEEKLY;BYDAY=[A-Z,]+;COUNT=3$/);
 expect(values.rrule).toContain('MO');expect(values.rrule).toContain('WE');expect(Number(values.duration)).toBeGreaterThan(0);
});

test('day action shows the playlist answer and the API request',async({page})=>{
 await openCalendar(page);
 await page.getByRole('button',{name:'Napi műsor (API)',exact:true}).click();
 const win=page.locator('.blade-calendar-day');await expect(win).toBeVisible();
 await expect(win).toContainText('"timeline"');await expect(win).toContainText('Authorization: Bearer');
 await expect(win).toContainText('"resource": "signage_playlist"');
});

test('playlist API: Friday timeline falls back to the weekday default outside the programme blocks',async({page})=>{
 await openCalendar(page);
 const friday=new Date();friday.setDate(friday.getDate()+((5-friday.getDay()+7)%7));
 const date=`${friday.getFullYear()}-${String(friday.getMonth()+1).padStart(2,'0')}-${String(friday.getDate()).padStart(2,'0')}`;
 const result=await api(page,'signage_playlist','day',null,{date});
 expect(result.status).toBe(200);
 const slots=result.body.data.timeline.map(s=>`${s.start}-${s.end} ${s.source} ${s.title}`);
 // The weekday blocks of the seed (signage.php blade_demo_signage_seed()); before 06:00 and after 22:00 the brand scene default.
 expect(slots).toEqual(['00:00-06:00 default Blade brand animáció','06:00-10:00 schedule Reggeli lista','10:00-12:00 schedule Arculati animáció',
  '12:00-17:00 schedule Napközbeni lista','17:00-18:00 schedule Narancsos pezsgés','18:00-22:00 schedule Esti lista','22:00-24:00 default Blade brand animáció']);
 expect(result.body.data.default.source).toBe('weekday');
 expect((await api(page,'signage_schedule','events',null,{from:'2026-01-01',to:'2026-12-31'})).status).toBe(400);
});

test('reader sees the calendar read-only and dark theme switches the skin',async({page})=>{
 await openCalendar(page,'reader@example.test');
 await expect(page.getByRole('button',{name:'Új esemény',exact:true})).toHaveCount(0);
 expect((await api(page,'signage_schedule','create',null,{text:'x',start_date:'2026-10-23 08:00',end_date:'2026-10-23 09:00',content:'asset:1'})).status).toBe(403);
 await page.getByRole('button',{name:/Skyblue|Világos|Éjjeli/}).click();await page.getByRole('menuitem',{name:'Éjjeli',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-scheduler-theme','dark');
 await page.getByRole('button',{name:'Éjjeli'}).click();await page.getByRole('menuitem',{name:'Skyblue',exact:true}).click();
});

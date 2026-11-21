const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,command}=require('./feature-demo.cjs');
// Long-running jobs (docs/toolkit.md#jobs): Feature demó → Szolgáltatásjelentés → Régióellenőrzés runs on 61ade's
// JobQueue after the response, one step per service of the row's region (about 1.5 s each). The job window shows its
// stage, progress, steps, log and result; `Megszakítás` stops it; a lost start answer is recovered by its token; a reload
// reopens the running job; the page asks before it is left while the job runs; modules get job:* events.
const MODULE='/jobs-fixture.mjs';
async function start(page){
 await page.route(url=>url.pathname===MODULE,route=>route.fulfill({contentType:'text/javascript',body:'export default app=>{window.__jobEvents=[];for(const name of ["job:started","job:progress","job:done"])app.events.on(name,payload=>window.__jobEvents.push([name,payload.job?.id??payload.status?.id,payload.status?.state]));};'}));
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
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 try{await page.waitForFunction(()=>!!window.__jobEvents,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__jobEvents);}
 await page.goto('/#view=demo_service_report');await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
 // A region with its nine services: search one service name, select the row.
 await page.getByRole('textbox',{name:'Keresés',exact:true}).fill('Naptár');
 const rows=page.getByRole('grid').getByRole('rowgroup').last().getByRole('row');await expect(rows).toHaveCount(4);
 const row=rows.filter({hasText:'eu-central'});
 await row.locator('[data-dhx-col-id="name"]').click();
}
const jobWindow=page=>page.locator('.dhx_window').filter({has:page.locator('.blade-job')});

test('a job reports its stage, steps, log and result, and modules get its events',async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await start(page);
 await command(page,'Régióellenőrzés');
 const win=jobWindow(page);await expect(win).toBeVisible();
 await expect(win.locator('.blade-job__stage')).toHaveText(/^Ellenőrzés: /,{timeout:15000});
 await expect(win.locator('.blade-job__meta')).toContainText(/Lépés: \d \/ 9/);
 await expect(win.locator('.blade-job__meta')).toContainText(/Eltelt idő: \d+:\d\d/);
 await expect(win.getByRole('log',{name:'Napló'}).locator('li').first()).toContainText('A(z) eu-central régió ellenőrzése: 9 szolgáltatás.');
 await expect(win.locator('.blade-job__outcome')).toContainText('Régióellenőrzés: eu-central',{timeout:30000});
 await expect(win.locator('.blade-job__bar')).toHaveJSProperty('value',100);
 expect(await win.getByRole('log').locator('li').count()).toBe(10);
 await expect(win.getByRole('button',{name:'Megszakítás'})).toBeHidden();
 const events=await page.evaluate(()=>window.__jobEvents);
 expect(events[0][0]).toBe('job:started');
 expect(events.some(([name])=>name==='job:progress')).toBe(true);
 expect(events.at(-1)).toEqual(['job:done',events[0][1],'done']);
 // No toast for a started job: the window reports it.
 await expect(page.locator('.blade-toast').filter({hasText:'A művelet sikerült.'})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('Megszakítás stops a running job',async({page})=>{
 test.setTimeout(60000);
 await start(page);
 await command(page,'Régióellenőrzés');
 const win=jobWindow(page);
 await expect(win.locator('.blade-job__meta')).toContainText('Lépés: 1 / 9',{timeout:15000});
 await win.getByRole('button',{name:'Megszakítás'}).click();
 await expect(win.locator('.blade-job__outcome')).toHaveText('A feladat megszakítva.',{timeout:15000});
 await expect(win.getByRole('log').locator('li').last()).toContainText('Az ellenőrzés megszakítva.');
});

test('a lost start answer is recovered by its token, and a reload reopens the running job behind a leave guard',async({page})=>{
 test.setTimeout(90000);
 await start(page);
 // The server starts the job, but its answer never reaches the page.
 let lost=0;
 await page.route(url=>url.searchParams.has('blade'),async route=>{
  let body;try{body=route.request().postDataJSON();}catch{}
  if(body?.action!=='audit'||lost)return route.fallback();
  lost++;await route.fetch();return route.abort('failed');
 });
 await command(page,'Régióellenőrzés');
 const win=jobWindow(page);
 await expect(win.locator('.blade-job__meta')).toContainText(/Lépés: \d \/ 9/,{timeout:20000});
 expect(lost).toBe(1);
 const id=(await page.evaluate(()=>window.__jobEvents.find(([name])=>name==='job:started')))[1];
 // Leaving asks first while the job runs; after the reload the running job's window is back.
 const dialogs=[];page.on('dialog',dialog=>{dialogs.push(dialog.type());void dialog.accept();});
 await page.reload();
 expect(dialogs).toContain('beforeunload');
 const again=jobWindow(page);
 await expect(again.locator('.blade-job__meta')).toContainText(/Lépés: \d \/ 9/,{timeout:20000});
 await again.getByRole('button',{name:'Megszakítás'}).click();
 await expect(again.locator('.blade-job__outcome')).toHaveText('A feladat megszakítva.',{timeout:15000});
 expect(id).toMatch(/^[0-9a-f]{32}$/);
});

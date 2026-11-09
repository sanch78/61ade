const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// FB-0155 (docs/toolkit.md#ui-services, #pagelayout): Suite's English-only names in the page's language — the header of
// a `collapsable` region names the region and follows its state, a window's close button is `Ablak bezárása` — and Escape
// closes an `app.ui.window`, also a non-modal one, right after it opens and after a click inside it.
const MODULE='/suite-labels-fixture.mjs';
function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
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
async function loaded(page){
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}
const open=(page,modal)=>page.evaluate(modal=>{
 const content=document.createElement('div');content.className='suite-labels-content';
 content.innerHTML='<p>Szöveg</p><button type="button">Egy</button>';
 window.__window=window.__bladeApp.ui.window({title:'Próbaablak',modal});window.__window.attach(content);
},modal);
const closed=page=>page.evaluate(()=>window.__window.signal.aborted);

for(const [width,height] of [[1366,900],[390,844]])test(`Suite names and Escape at ${width} px`,async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width,height});
 await fixture(page);
 await signIn(page,'demo@example.test','/');
 await loaded(page);

 // A collapsable region's header names the region and follows its state, also a change from code.
 await page.evaluate(()=>{
  const host=document.createElement('div');host.id='suite-labels-fixture';host.style.cssText='position:fixed;inset:0;z-index:10000;background:#fff';document.body.append(host);
  window.__layout=new window.__bladeApp.components.PageLayout({id:'suite-labels.fixture',tree:{cols:[{id:'main'},{id:'side',header:'Oldalpanel',width:160,collapsable:true}]}});
  window.__layout.mount(host);
 });
 const header=page.locator('#suite-labels-fixture .dhx_layout-cell[data-cell-id="side"] .dhx_layout-cell-header').first();
 await expect(header).toHaveAttribute('aria-label','Oldalpanel összecsukása');
 await expect(page.getByRole('button',{name:'Oldalpanel összecsukása',exact:true})).toHaveCount(1);
 await page.evaluate(()=>window.__layout.collapse('side'));
 await expect(header).toHaveAttribute('aria-label','Oldalpanel kinyitása');
 await header.dispatchEvent('click');
 await expect(header).toHaveAttribute('aria-label','Oldalpanel összecsukása');
 expect(await page.locator('[aria-label^="click to "]').count()).toBe(0);
 await page.evaluate(()=>{window.__layout.destroy();document.getElementById('suite-labels-fixture').remove();
  for(const key of Object.keys(localStorage))if(key.includes('suite-labels.fixture'))localStorage.removeItem(key);});

 for(const modal of [true,false]){
  // The close button is named in the page's language.
  await open(page,modal);
  const dialog=page.getByRole('dialog',{name:'Próbaablak'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Ablak bezárása',exact:true})).toHaveCount(1);
  await expect(dialog.locator('[aria-label="close"]')).toHaveCount(0);
  // Escape right after it opens.
  await page.keyboard.press('Escape');
  await expect.poll(()=>closed(page),{message:`modal ${modal}: Escape after opening`}).toBe(true);
  // Escape after a click on its text and on its button.
  for(const target of ['p','button']){
   await open(page,modal);
   await page.locator(`.suite-labels-content ${target}`).last().click();
   await page.keyboard.press('Escape');
   await expect.poll(()=>closed(page),{message:`modal ${modal}: Escape after a click on ${target}`}).toBe(true);
  }
 }
 // A non-modal window does not take an Escape pressed elsewhere on the page.
 await open(page,false);
 await page.locator('body').evaluate(()=>{document.activeElement?.blur();});
 await page.keyboard.press('Escape');
 expect(await closed(page)).toBe(false);
 await page.evaluate(()=>window.__window.close());
 expect(errors).toEqual([]);
});

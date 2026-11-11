const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// Destroy + mount into the same place in one task (docs/toolkit.md#components, FB-0161): a ListView in a tab cell of a
// PageLayout and a RecordDetails in a plain region, a component in a cell of the recipe's own Suite Layout, in an
// AppWindow and in a cell that showed markup just before, each replaced in the same handler, show their content every
// time. A fixture module hands `app` to the page.
const MODULE='/component-remount-fixture.mjs';
async function start(page){
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
 await page.setViewportSize({width:1366,height:900});await signIn(page);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}

test('a component replaced in the same cell, region, Layout cell or window shows its content every time',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await start(page);
 await page.evaluate(()=>{
  const app=window.__bladeApp,C=app.components,box=document.createElement('div');
  box.id='remount-fixture';Object.assign(box.style,{position:'fixed',left:'16px',top:'110px',width:'1200px',height:'600px',zIndex:'5',background:'var(--dhx-background-primary, #fff)'});
  document.body.append(box);
  const layout=new app.dhx.Layout(box,{type:'line',cols:[{id:'pagecell'},{id:'plain',width:260},{id:'markup',width:260}]});
  const page=new C.PageLayout({id:'remount.fixture',tree:{cols:[{tabs:[{id:'values',header:'Értékek'},{id:'other',header:'Más'}]},{id:'side',header:'Részletek',width:320}]}});
  page.mount(layout.getCell('pagecell'));
  const win=window.__win=app.ui.window({title:'Újracsatolás',width:400,height:300,modal:false});
  let round=0,parts=[];
  window.__replace=async()=>{
   for(const part of parts)part.destroy();
   round++;
   const details=(name)=>new C.RecordDetails({view:'demo_registry_nodes',record:{id:round,name,parent_id:''}});
   const list=new C.ListView({view:'demo_registry_browser_values',panel:false});
   list.mount(page.cell('values'));
   const side=details('Régió '+round),plain=details('Cella '+round),inWindow=details('Ablak '+round);
   side.mount(page.cell('side'));plain.mount(layout.getCell('plain'));inWindow.mount(win);
   // Drawn markup before a component in one cell: a project element (odd rounds) or Suite's own attachHTML (even
   // rounds), then the component mounted there or given to `app.ui.attach`.
   const markup=layout.getCell('markup'),notice=new AbortController();
   if(round%2){const element=document.createElement('p');element.textContent='Jegyzet';app.ui.attach(markup,element,{signal:notice.signal});}
   else markup.attachHTML('<p>Jegyzet</p>');
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const afterMarkup=details('Jelölés '+round);
   if(round%2){notice.abort();afterMarkup.mount(markup);}else app.ui.attach(markup,afterMarkup,{signal:notice.signal});
   parts=[list,side,plain,inWindow,afterMarkup];
   return round;
  };
  window.__release=()=>{for(const part of parts)part.destroy();page.destroy();layout.destructor();win.close();box.remove();};
 });
 const fixture=page.locator('#remount-fixture'),win=page.getByRole('dialog',{name:'Újracsatolás',exact:true});
 for(let i=0;i<4;i++){
  const round=await page.evaluate(()=>window.__replace());
  await expect(fixture.getByRole('tabpanel',{name:'Értékek',exact:true}).locator('.dhx_grid-row').first()).toBeVisible();
  await expect(fixture.locator('[data-cell-id="side"]')).toContainText(`Régió ${round}`);
  await expect(fixture.locator('[data-cell-id="plain"]')).toContainText(`Cella ${round}`);
  await expect(fixture.locator('[data-cell-id="markup"]')).toContainText(`Jelölés ${round}`);
  await expect(win).toContainText(`Ablak ${round}`);
 }
 await page.evaluate(()=>window.__release());
 await expect(win).toHaveCount(0);
 expect(failures).toEqual([]);
});

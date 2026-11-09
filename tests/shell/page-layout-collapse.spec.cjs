const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// PageLayout collapse from code (docs/toolkit.md#pagelayout, FB-0153): `collapse`, `expand`, `isCollapsed` and the
// `collapse` event on a fixture page: a collapsible leaf in `cols`, one beside a `tabs` and an `accordion` branch, and
// one in a nested PageLayout attached into a tab; the page's own calls are reported but not kept, the misuse throws.
const MODULE='/page-layout-fixture.mjs';
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

for(const [width,height] of [[1366,900],[390,844]])test(`collapse, expand, isCollapsed and the collapse event at ${width} px`,async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width,height});
 await fixture(page);
 await signIn(page,'demo@example.test','/');
 await loaded(page);
 const result=await page.evaluate(()=>{
  const {PageLayout}=window.__bladeApp.components,message=run=>{try{run();return 'ok';}catch(error){return `${error.name}: ${error.message}`;}};
  const host=document.createElement('div');host.id='page-layout-fixture';host.style.cssText='position:fixed;inset:0;z-index:10000;background:#fff';document.body.append(host);
  const id='page-layout.fixture.'+Date.now();
  const outer=window.__outer=new PageLayout({id,tree:{cols:[
   {id:'left',header:'Bal',width:200,collapsable:true},
   {rows:[{id:'top',header:'Fent',height:120,collapsable:true},{tabs:[{id:'one',header:'Egy'},{id:'two',header:'Kettő'}]}]},
   {width:220,accordion:[{id:'a',header:'A'},{id:'b',header:'B'}]},
   {id:'plain',width:120}]}});
  outer.mount(host);
  const events=[];outer.on('collapse',event=>events.push(event));
  // A nested PageLayout attached into a tab: mounted by `attach`, so its own events arrive.
  const inner=new PageLayout({id:id+'.inner',tree:{cols:[{id:'main'},{id:'side',header:'Oldal',width:160,collapsable:true}]}});
  outer.attach('one',inner);
  const nested=[];inner.on('collapse',event=>nested.push(event));
  const states=[outer.isCollapsed('left'),outer.collapse('left'),outer.isCollapsed('left'),outer.collapse('left'),outer.expand('left'),outer.collapse('top'),
   inner.collapse('side'),inner.isCollapsed('side'),inner.expand('side')];
  const kept=localStorage.getItem(Object.keys(localStorage).find(key=>key.includes(id)&&!key.includes('.inner'))??'')??'';
  return {states,events,nested,kept,
   misuse:[message(()=>outer.collapse('plain')),message(()=>outer.collapse('one')),message(()=>outer.isCollapsed('a')),message(()=>outer.expand('missing'))]};
 });
 expect(result.states).toEqual([false,true,true,true,false,true,true,true,false]);
 // Every change is reported, also from code; a call that changes nothing reports nothing.
 expect(result.events).toEqual([{id:'left',collapsed:true},{id:'left',collapsed:false},{id:'top',collapsed:true}]);
 expect(result.nested).toEqual([{id:'side',collapsed:true},{id:'side',collapsed:false}]);
 // The page's own calls are not kept in UiPreferences.
 expect(result.kept).not.toContain('collapsed');
 expect(result.misuse).toEqual(['Error: 61ade: PageLayout region "plain" is not collapsable.','Error: 61ade: PageLayout region "one" is not collapsable.',
  'Error: 61ade: PageLayout region "a" is not collapsable.','Error: 61ade: PageLayout has no region "missing".']);
 // The user's header click is reported and kept.
 // The header is the Suite control (at 390 px the fixture is wider than the screen, so the event is sent to it).
 await page.locator('#page-layout-fixture .dhx_layout-cell[data-cell-id="top"] .dhx_layout-cell-header').first().dispatchEvent('click');
 expect(await page.evaluate(()=>window.__outer.isCollapsed('top'))).toBe(false);
 const kept=await page.evaluate(()=>{const key=Object.keys(localStorage).find(key=>key.includes('page-layout.fixture')&&!key.includes('.inner'));return localStorage.getItem(key);});
 expect(JSON.parse(kept).regions.top.collapsed).toBe(false);
 await page.evaluate(()=>{window.__outer.destroy();document.getElementById('page-layout-fixture').remove();for(const key of Object.keys(localStorage))if(key.includes('page-layout.fixture'))localStorage.removeItem(key);});
 expect(errors).toEqual([]);
});

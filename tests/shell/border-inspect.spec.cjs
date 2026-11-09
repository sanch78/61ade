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


test('framed toolbar edges',async({page})=>{
 await page.setViewportSize({width:1366,height:900});await fixture(page);await signIn(page);await loaded(page);
 await page.evaluate(()=>{
 const app=window.__bladeApp,host=document.createElement('div');host.id='border-fixture';host.className='blade-workspace';host.style.cssText='position:fixed;inset:80px 0 40px;z-index:10000';document.body.append(host);
 const layout=window.__layout=new app.components.PageLayout({id:'border.fixture',tree:{rows:[{id:'top',height:48},{id:'raw',height:48},{id:'bottom',height:48},{id:'body'}]}});layout.mount(host);
 for(const id of ['top','bottom'])new app.components.CommandBar({placement:id,items:[{id:'a',label:id}]}).mount(layout.cell(id));
 layout.attach('raw',new app.dhx.Toolbar(null,{data:[{id:'a',value:'Native'}]}));
 document.documentElement.setAttribute('data-dhx-theme','light');document.documentElement.setAttribute('data-blade-theme','light');
 });
 await expect(page.locator('#border-fixture .dhx_toolbar')).toHaveCount(3);
 console.log(await page.locator('#border-fixture').evaluate(root=>[...root.querySelectorAll('.dhx_toolbar')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);let a=e;const ancestors=[];while(a&&a!==root){const q=a.getBoundingClientRect(),c=getComputedStyle(a);ancestors.push({classes:a.className,bottom:q.bottom,top:q.top,border:c.borderBottom,upper:c.borderTop,shadow:c.boxShadow});a=a.parentElement;}return ancestors;})));
 await page.screenshot({path:'tmp/border-fixture.png'});
});

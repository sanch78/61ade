const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn}=require('./feature-demo.cjs');
// Accordion (docs/toolkit.md#accordion): the public component from a fixture module (roles, keys, one or several open
// sections, the closed section's kept content, the geometry, option checks) and the declared `accordion` branch of
// PageLayout in the asset viewer (`Adatok` above `Szerkesztés`, the asset's form, the remembered open sections). The
// run seeds its own asset with the run prefix and removes it.
const prefix='ac'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const MODULE='/accordion-fixture.mjs';
test.describe.configure({mode:'serial'});
let asset;
const cleanup=()=>php(`$db->exec("DELETE FROM signage_assets WHERE title LIKE '${prefix}%'");`);
test.beforeAll(()=>{
 cleanup();
 // The asset's file is required by its form: the seeded asset shares the file of a demo image asset.
 asset=php(`$file=$db->query("SELECT file_id FROM signage_assets WHERE kind='image' AND file_id<>'' ORDER BY id LIMIT 1")->fetchColumn();
  $db->prepare("INSERT INTO signage_assets(title,kind,file_id) VALUES (?, 'image', ?)")->execute(['${prefix} elem',$file]);echo $db->lastInsertId();`).trim();
});
test.afterAll(cleanup);

function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
/** Serves the fixture module (it only hands `app` to the page) and declares it in the signed-in bootstrap. */
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
const header=(scope,name)=>scope.getByRole('button',{name,exact:true});
const height=async locator=>(await locator.boundingBox()).height;

test('component: roles, keys, one or several open sections, kept content and option checks',async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width:1280,height:900});
 await fixture(page);
 await signIn(page,'demo@example.test','/');
 await loaded(page);
 await page.evaluate(()=>{
  const box=document.createElement('div');
  box.id='accordion-fixture';box.style.cssText='position:fixed;left:20px;top:20px;width:400px;height:600px;z-index:100000;background:#fff';
  document.body.append(box);
  const {Accordion}=window.__bladeApp.components;
  const one=window.__one=new Accordion({sections:[{id:'first',label:'Első <b>'},{id:'second',label:'Második'},{id:'third',label:'Harmadik',disabled:true}]});
  window.__toggles=[];one.on('toggle',event=>window.__toggles.push(event));
  const input=document.createElement('input');input.setAttribute('aria-label','Mező');one.attach('first',input);
  const target=document.createElement('div');target.style.cssText='height:100%';box.append(target);one.mount(target);
 });
 const box=page.locator('#accordion-fixture');
 // Headers are buttons named by the plain-text label (escaped), over labelled regions; the first section is open.
 await expect(header(box,'Első <b>')).toHaveAttribute('aria-expanded','true');
 await expect(header(box,'Második')).toHaveAttribute('aria-expanded','false');
 await expect(header(box,'Harmadik')).toHaveAttribute('tabindex','-1');
 await expect(box.getByRole('region',{name:'Első <b>'})).toBeVisible();
 await expect(box.getByRole('region')).toHaveCount(1);
 // Without `multiple` the open section stays open from its header (and says so).
 await expect(header(box,'Első <b>')).toHaveAttribute('aria-disabled','true');
 await header(box,'Első <b>').click({force:true});
 await expect(header(box,'Első <b>')).toHaveAttribute('aria-expanded','true');
 // Geometry: closed sections keep their header only; the open one fills the rest.
 const closed=await height(page.locator('#accordion-fixture .blade-accordion__section--closed').first());
 expect(closed).toBeGreaterThan(30);expect(closed).toBeLessThan(45);
 expect(await height(page.locator('#accordion-fixture .blade-accordion__section--open'))).toBeGreaterThan(600-3*closed-3);
 await box.getByLabel('Mező').fill('megtartva');
 // A click opens another section and closes the open one; closings are reported first.
 await header(box,'Második').click();
 await expect(header(box,'Második')).toHaveAttribute('aria-expanded','true');
 await expect(header(box,'Első <b>')).toHaveAttribute('aria-expanded','false');
 await expect(box.getByLabel('Mező')).toBeHidden();
 expect(await page.evaluate(()=>window.__toggles)).toEqual([{id:'first',open:false},{id:'second',open:true}]);
 // The keys: arrows move between the usable headers, Enter and Space toggle; the disabled section stays closed.
 await header(box,'Második').focus();
 await page.keyboard.press('ArrowUp');await expect(header(box,'Első <b>')).toBeFocused();
 await page.keyboard.press('End');await expect(header(box,'Második')).toBeFocused();
 await page.keyboard.press('Home');await page.keyboard.press(' ');
 await expect(header(box,'Első <b>')).toHaveAttribute('aria-expanded','true');
 await header(box,'Harmadik').click({force:true});
 await expect(header(box,'Harmadik')).toHaveAttribute('aria-expanded','false');
 // The closed section's content was kept (rendered, hidden), with its input.
 await expect(box.getByLabel('Mező')).toHaveValue('megtartva');
 expect(await page.evaluate(()=>{const one=window.__one;return [one.open('third'),one.close('first'),one.openSections(),one.toggle('second'),one.openSections()];}))
  .toEqual([false,false,['first'],true,['second']]);
 // update: a label, enabling; disabling the open section throws.
 await page.evaluate(()=>{window.__one.update('third',{label:'Harmadik rész',disabled:false});});
 await header(box,'Harmadik rész').click();
 await expect(header(box,'Harmadik rész')).toHaveAttribute('aria-expanded','true');
 expect(await page.evaluate(()=>{try{window.__one.update('third',{disabled:true});return 'updated';}catch(error){return error.message;}})).toMatch(/cannot be disabled/);

 // `multiple`: any combination, all closed too; the open sections share the height.
 await page.evaluate(()=>{
  window.__one.destroy();
  const target=document.createElement('div');target.style.cssText='height:100%';document.getElementById('accordion-fixture').replaceChildren(target);
  window.__many=new window.__bladeApp.components.Accordion({multiple:true,open:['a','b'],sections:[{id:'a',label:'A rész'},{id:'b',label:'B rész'},{id:'c',label:'C rész'}]});
  window.__many.mount(target);
 });
 await expect(header(box,'A rész')).toHaveAttribute('aria-expanded','true');
 await expect(header(box,'B rész')).toHaveAttribute('aria-expanded','true');
 await expect(header(box,'A rész')).not.toHaveAttribute('aria-disabled','true');
 const open=page.locator('#accordion-fixture .blade-accordion__section--open');
 await expect(open).toHaveCount(2);
 expect(Math.abs(await height(open.nth(0))-await height(open.nth(1)))).toBeLessThanOrEqual(2);
 await header(box,'A rész').click();await header(box,'B rész').click();
 await expect(box.getByRole('region')).toHaveCount(0);
 await header(box,'C rész').click();
 expect(await page.evaluate(()=>window.__many.openSections())).toEqual(['c']);

 // Option checks (TypeError) for the component and the PageLayout branch; accordionOf.
 expect(await page.evaluate(()=>{
  const {Accordion,PageLayout}=window.__bladeApp.components,message=create=>{try{create();return 'created';}catch(error){return `${error.name}: ${error.message}`;}};
  const page=new PageLayout({id:'accordion.fixture',tree:{cols:[{id:'main'},{width:300,multiple:true,accordion:[{id:'one',header:'Egy',open:true},{id:'two',header:'Kettő',open:true}]}]}});
  const found=[page.accordionOf('two')?.openSections(),page.accordionOf('main')];
  page.destroy();
  return [...found,
   message(()=>new Accordion({sections:[{id:'x',label:'X'},{id:'x',label:'Y'}]})),
   message(()=>new Accordion({sections:[{id:'x',label:'X'},{id:'y',label:'Y'}],open:['x','y']})),
   message(()=>new Accordion({sections:[{id:'x',label:'X',disabled:true}]})),
   message(()=>new PageLayout({id:'accordion.bad',tree:{accordion:[{id:'x',header:'X',open:true},{id:'y',header:'Y',open:true}]}})),
   message(()=>new PageLayout({id:'accordion.bad',tree:{rows:[{id:'x',open:true}]}})),
   message(()=>new PageLayout({id:'accordion.bad',tree:{multiple:true,rows:[{id:'x'}]}})),
   message(()=>new PageLayout({id:'accordion.bad',tree:{accordion:[{id:'x',header:'X',width:200}]}}))];
 })).toEqual([['one','two'],undefined,
  'TypeError: 61ade: Accordion: section id "x" is missing, invalid or repeated.',
  'TypeError: 61ade: Accordion: without multiple, open names exactly one section.',
  'TypeError: 61ade: Accordion: at least one section is enabled.',
  'TypeError: 61ade: PageLayout: an accordion branch without multiple opens at most one section.',
  'TypeError: 61ade: PageLayout: "open" belongs to a section of an accordion branch.',
  'TypeError: 61ade: PageLayout: "multiple" belongs to an accordion branch.',
  'TypeError: 61ade: PageLayout: a section is a leaf with an id, a header (its label, at most 80 characters) and optionally open only.']);
 await page.evaluate(()=>{window.__many.destroy();document.getElementById('accordion-fixture').remove();});
 expect(errors).toEqual([]);
});

test('asset viewer: the declared accordion branch, the asset form and the remembered sections',async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width:1500,height:1000});
 await signIn(page,'demo@example.test',`/#view=demo.asset-viewer&record=${asset}`);
 const layout=page.locator('.blade-page-layout').first();
 await expect(header(layout,'Adatok')).toHaveAttribute('aria-expanded','true');
 await expect(header(layout,'Szerkesztés')).toHaveAttribute('aria-expanded','false');
 await expect(layout.getByRole('region',{name:'Adatok'})).toContainText(`${prefix} elem`);
 // Both may be open: they share the tall side column.
 await header(layout,'Szerkesztés').click();
 const form=layout.getByRole('region',{name:'Szerkesztés'});
 const name=form.getByLabel('Megnevezés',{exact:true});
 await expect(name).toHaveValue(`${prefix} elem`);
 const [details,edit]=[await layout.getByRole('region',{name:'Adatok'}).boundingBox(),await form.boundingBox()];
 expect(Math.abs(details.height-edit.height)).toBeLessThanOrEqual(2);
 expect(edit.y).toBeGreaterThan(details.y+details.height-1);
 await name.fill(`${prefix} elem új`);await name.press('Tab');
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(layout.getByRole('region',{name:'Adatok'})).toContainText(`${prefix} elem új`);
 expect(php(`echo $db->query("SELECT title FROM signage_assets WHERE id=${asset}")->fetchColumn();`).trim()).toBe(`${prefix} elem új`);
 // Closing the details keeps only its header; the open sections are remembered per page and user.
 await header(layout,'Adatok').click();
 await expect(layout.getByRole('region',{name:'Adatok'})).toHaveCount(0);
 await page.reload();
 const again=page.locator('.blade-page-layout').first();
 await expect(header(again,'Szerkesztés')).toHaveAttribute('aria-expanded','true');
 await expect(header(again,'Adatok')).toHaveAttribute('aria-expanded','false');
 await expect(again.getByRole('region',{name:'Szerkesztés'}).getByLabel('Megnevezés',{exact:true})).toHaveValue(`${prefix} elem új`);
 await header(again,'Adatok').click();
 expect(errors).toEqual([]);
});

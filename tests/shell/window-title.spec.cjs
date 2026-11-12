const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// app.ui.window `titleOverflow: "start"` and `titlePrefix` (docs/toolkit.md#app-window, FB-0194): a long title stays on
// one line, cut at its start so its end shows, never over the close button; the accessible name is the full title and
// a cut header shows it as its tooltip. A fixture module hands `app` to the page.
const MODULE='/window-title-fixture.mjs';
const PREFIX='Elem szerkesztése:',PATH='Történetvilág / Karakterek / Mellékszereplők / Gonosz figurák / Karakter / Alapprompt';
async function start(page,width){
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
 await page.setViewportSize({width,height:860});await signIn(page);
 try{await page.waitForFunction(()=>!!window.__bladeApp,null,{timeout:5000});}
 catch{await page.reload();await page.waitForFunction(()=>!!window.__bladeApp);}
}
/** Geometry of a window's header title: the cut part, its text, the prefix and the close button. */
const header=dialog=>dialog.evaluate(root=>{
 const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,height:r.height};};
 const title=root.querySelector('.blade-window-title'),rest=root.querySelector('.blade-window-title__text'),prefix=root.querySelector('.blade-window-title__prefix');
 if(!title||!rest)return null;const style=getComputedStyle(rest);
 return {rest:box(rest),text:box(rest.firstElementChild),prefix:prefix&&box(prefix),prefixText:prefix?.textContent,close:box(root.querySelector('[data-dhx-id="close"]')),
  cut:rest.scrollWidth>rest.clientWidth,lines:new Set([...rest.firstElementChild.getClientRects()].map(r=>Math.round(r.top))).size,tooltip:title.getAttribute('title'),
  direction:style.direction,overflow:style.textOverflow,whiteSpace:style.whiteSpace};
});

for(const width of [1366,390])test(`a long window title is cut at its start at ${width} px, its end and the close button stay visible`,async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await start(page,width);
 await page.evaluate(([prefix,path])=>{window.__win=window.__bladeApp.ui.window({title:path,titlePrefix:prefix,titleOverflow:'start',width:420});},[PREFIX,PATH]);
 const dialog=page.getByRole('dialog',{name:`${PREFIX} ${PATH}`,exact:true});
 await expect(dialog).toBeVisible();
 await expect.poll(async()=>(await header(dialog))?.tooltip).toBe(`${PREFIX} ${PATH}`);
 const h=await header(dialog);
 // One line, the leading ellipsis, the end flush with the visible box, the start cut off, the prefix whole.
 expect(h).toMatchObject({cut:true,lines:1,direction:'rtl',overflow:'ellipsis',whiteSpace:'nowrap',prefixText:PREFIX});
 expect(Math.abs(h.text.right-h.rest.right)).toBeLessThan(1);
 expect(h.text.left).toBeLessThan(h.rest.left-20);
 expect(h.prefix.right).toBeLessThanOrEqual(h.rest.left);
 expect(h.rest.right).toBeLessThanOrEqual(h.close.left);
 expect(h.rest.height).toBeLessThan(30);
 await expect(dialog.getByRole('button',{name:'Ablak bezárása'})).toBeVisible();

 // setTitle shortens a changed title the same way and renames the window; a title that fits has no tooltip.
 await page.evaluate(path=>window.__win.setTitle(path+' / Változat'),PATH);
 const renamed=page.getByRole('dialog',{name:`${PREFIX} ${PATH} / Változat`,exact:true});
 await expect(renamed).toBeVisible();
 await expect.poll(async()=>(await header(renamed))?.tooltip).toBe(`${PREFIX} ${PATH} / Változat`);
 const r=await header(renamed);
 expect(Math.abs(r.text.right-r.rest.right)).toBeLessThan(1);expect(r.lines).toBe(1);
 await page.evaluate(()=>window.__win.setTitle('Alapprompt'));
 const short=page.getByRole('dialog',{name:`${PREFIX} Alapprompt`,exact:true});
 await expect.poll(async()=>(await header(short))?.tooltip).toBeNull();
 expect((await header(short))?.cut).toBe(false);

 if(width>=768){
  // The cut follows a window resize: wider, the title fits and loses its tooltip; narrower, it is cut again.
  await page.evaluate(path=>{window.__win.setTitle(path);window.__win.window.setSize(1300,400);},PATH);
  const wide=page.getByRole('dialog',{name:`${PREFIX} ${PATH}`,exact:true});
  await expect.poll(async()=>(await header(wide))?.tooltip).toBeNull();
  await page.evaluate(()=>window.__win.window.setSize(420,400));
  await expect.poll(async()=>(await header(wide))?.tooltip).toBe(`${PREFIX} ${PATH}`);
 }
 await page.evaluate(()=>window.__win.close());

 // Without a prefix the whole title is cut at its start; right-to-left text stays on one line beside the close button.
 await page.evaluate(path=>{window.__win=window.__bladeApp.ui.window({title:path,titleOverflow:'start',width:360});},'שלום עולם / '+PATH);
 const plain=page.getByRole('dialog',{name:'שלום עולם / '+PATH,exact:true});
 await expect.poll(async()=>(await header(plain))?.cut).toBe(true);
 const p=await header(plain);
 expect(p.prefix).toBeNull();expect(p.lines).toBe(1);expect(p.rest.right).toBeLessThanOrEqual(p.close.left);
 await page.evaluate(()=>window.__win.close());

 // The default keeps Suite's one-line title with a trailing ellipsis; the accessible name follows setTitle there too.
 await page.evaluate(path=>{window.__win=window.__bladeApp.ui.window({title:path,width:420});window.__win.setTitle(path+' / Alapértelmezés');},PATH);
 const plainDefault=page.getByRole('dialog',{name:`${PATH} / Alapértelmezés`,exact:true});
 await expect(plainDefault).toBeVisible();
 await expect(plainDefault.locator('.blade-window-title')).toHaveCount(0);
 await page.evaluate(()=>window.__win.close());

 expect(await page.evaluate(()=>['middle',1].map(titleOverflow=>{try{window.__bladeApp.ui.window({title:'x',titleOverflow});return 'opened';}catch(error){return error.constructor.name;}})
  .concat((()=>{try{window.__bladeApp.ui.window({title:'x',titlePrefix:5});return 'opened';}catch(error){return error.constructor.name;}})()))).toEqual(['TypeError','TypeError','TypeError']);
 expect(failures).toEqual([]);
});

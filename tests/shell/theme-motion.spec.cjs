const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openMenu}=require('./feature-demo.cjs');
// Theme motion (docs/shell.md#theme-motion): in Blade the asset viewer's accordion branch, the key browser's
// collapsable `Kulcsok` column (also toggled again mid-motion) and tree folder, and the contacts' accordion form sections pass through
// in-between sizes and end without an inline pin; the light theme and reduced motion change at once. Sizes are sampled
// each frame after the motion's own frame (two microtasks after the click), so they are what gets painted.
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const asset=()=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite');echo $db->query("SELECT id FROM signage_assets ORDER BY id LIMIT 1")->fetchColumn();`],{encoding:'utf8'}).trim();
/** Clicks the element $click (a selector) and samples $axis of the elements $measure each frame for $ms (a second click after $again ms). */
const sample=(page,click,measure,axis,{ms=500,again}={})=>page.evaluate(([click,measure,axis,ms,again])=>new Promise(resolve=>{
 const nodes=[...document.querySelectorAll(measure)],target=document.querySelector(click),samples=[],start=performance.now();
 const step=()=>{
  samples.push(nodes.map(node=>Math.round(node.getBoundingClientRect()[axis])));
  if(performance.now()-start<ms)requestAnimationFrame(step);
  else resolve({samples,pinned:[...nodes,...document.querySelectorAll('[style*="important"]')].filter(node=>/important/.test(node.getAttribute('style')??'')).length});
 };
 target.click();if(again!==undefined)setTimeout(()=>target.click(),again);
 queueMicrotask(()=>queueMicrotask(()=>requestAnimationFrame(step)));
}),[click,measure,axis,ms,again]);
const column=(samples,index=0)=>samples.map(sizes=>sizes[index]);
/** Sizes strictly between $from and $to (the motion's in-between frames). */
const between=(values,from,to)=>values.filter(value=>value>Math.min(from,to)+1&&value<Math.max(from,to)-1);
const jumps=values=>Math.max(...values.slice(1).map((value,index)=>Math.abs(value-values[index])));
const header='[data-cell-id="tree"] > .dhx_layout-cell-header';
async function keyBrowser(page){
 await page.setViewportSize({width:1500,height:1000});
 await signIn(page);
 await openMenu(page,'Kulcsböngésző','Feature demó');
 await expect(page.getByRole('tree',{name:'Kulcsok',exact:true})).toBeVisible();
}

test('accordion sections ease in Blade and change at once in light',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1500,height:1000});
 await signIn(page,'demo@example.test',`/#view=demo.asset-viewer&record=${asset()}`);
 const layout=page.locator('.blade-page-layout').first();
 const edit=layout.getByRole('button',{name:'Szerkesztés',exact:true}),details=layout.getByRole('button',{name:'Adatok',exact:true});
 await expect(details).toHaveAttribute('aria-expanded','true');
 expect(await page.evaluate(()=>document.documentElement.dataset.bladeTheme)).toBe('blade');
 const ids=await layout.locator('.blade-accordion > .dhx_layout-cell').evaluateAll(cells=>cells.map(cell=>cell.dataset.cellId));
 const sections=ids.map(id=>`[data-cell-id="${id}"]`).join(','),headerOf=id=>`[data-cell-id="${id}"] > .dhx_layout-cell-header`;
 const open=await sample(page,headerOf(ids[1]),sections,'height');
 const first=column(open.samples),last=open.samples.at(-1);
 // The details shrink to their header through in-between heights while the form grows; nothing stays pinned.
 expect(between(first,first[0],last[0]).length).toBeGreaterThan(0);
 expect(last[0]).toBeLessThan(60);expect(open.pinned).toBe(0);
 // State and ARIA change at once (they were checked right after the motion's first frames).
 await expect(edit).toHaveAttribute('aria-expanded','true');
 await expect(details).toHaveAttribute('aria-expanded','false');
 const back=await sample(page,headerOf(ids[0]),sections,'height');
 expect(between(column(back.samples),back.samples[0][0],back.samples.at(-1)[0]).length).toBeGreaterThan(0);
 expect(back.pinned).toBe(0);
 // The light theme has no motion: one jump.
 await page.evaluate(()=>{document.documentElement.dataset.bladeTheme='light';});
 const light=await sample(page,headerOf(ids[1]),sections,'height');
 expect(between(column(light.samples),light.samples[0][0],light.samples.at(-1)[0])).toEqual([]);
 await page.evaluate(()=>{document.documentElement.dataset.bladeTheme='blade';});
 await details.click();
 await expect(details).toHaveAttribute('aria-expanded','true');
 expect(errors).toEqual([]);
});

test('a collapsable column eases both ways, also toggled again mid-motion',async({page})=>{
 await keyBrowser(page);
 const close=await sample(page,header,'[data-cell-id="tree"]','width');
 const closed=column(close.samples);
 expect(closed[0]).toBe(280);expect(closed.at(-1)).toBeLessThan(60);
 expect(between(closed,280,closed.at(-1)).length).toBeGreaterThan(0);expect(close.pinned).toBe(0);
 const open=await sample(page,header,'[data-cell-id="tree"]','width');
 const opened=column(open.samples);
 expect(opened.at(-1)).toBe(280);expect(between(opened,opened[0],280).length).toBeGreaterThan(0);expect(open.pinned).toBe(0);
 await expect(page.getByRole('tree',{name:'Kulcsok',exact:true})).toBeVisible();
 // A second click during the motion turns back from where it is, without showing either end first.
 const twice=await sample(page,header,'[data-cell-id="tree"]','width',{ms:650,again:60});
 const both=column(twice.samples);
 expect(both.at(-1)).toBe(280);expect(twice.pinned).toBe(0);
 const turn=both.indexOf(Math.min(...both));
 expect(Math.min(...both)).toBeGreaterThan(60);
 expect(both.slice(turn).every((value,index,rest)=>index===0||value>=rest[index-1])).toBe(true);
 expect(jumps(both)).toBeLessThan(240);
});

test('reduced motion changes at once',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await keyBrowser(page);
 const close=await sample(page,header,'[data-cell-id="tree"]','width');
 expect(between(column(close.samples),280,46)).toEqual([]);expect(close.pinned).toBe(0);
 await page.locator(header).click();
 await expect(page.getByRole('tree',{name:'Kulcsok',exact:true})).toBeVisible();
});

test('accordion form sections ease to their new heights',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test','/#view=demo_contacts');
 await expect(page.locator('[data-cell-id="grid"]')).toBeVisible();
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const dialog=page.getByRole('dialog'),address=dialog.getByRole('button',{name:'Cím',exact:true});
 await expect(address).toHaveAttribute('aria-expanded','false');
 await page.waitForTimeout(300);
 await address.evaluate(button=>button.setAttribute('data-motion-probe',''));
 const open=await sample(page,'[data-motion-probe]','.blade-form-section--accordion','height');
 const contact=column(open.samples);
 expect(between(contact,contact[0],contact.at(-1)).length).toBeGreaterThan(0);
 expect(contact.at(-1)).toBeLessThan(60);expect(open.pinned).toBe(0);
 await expect(address).toHaveAttribute('aria-expanded','true');
 await dialog.getByRole('button',{name:'Mégse',exact:true}).click();
 await expect(dialog).toHaveCount(0);
});

test('a tree folder eases open and closed, its children loaded on the way',async({page})=>{
 await keyBrowser(page);
 const id=await page.locator('.blade-record-tree li[aria-label="HKEY_CURRENT_USER"]').getAttribute('data-dhx-id');
 const item=`.blade-record-tree li[data-dhx-id="${id}"]`,toggle=`${item} > .dhx_tree-folder > .dhx_tree-toggle-button`;
 const run=async()=>{const {samples,pinned}=await sample(page,toggle,item,'height',{ms:700});return {heights:column(samples),pinned};};
 // Opening (the children arrive from the server first), closing, then both again with the children loaded.
 for(const round of [1,2]){
  const open=await run();
  expect(open.heights.at(-1),`open ${round}`).toBeGreaterThan(open.heights[0]+20);
  expect(between(open.heights,open.heights[0],open.heights.at(-1)).length,`open ${round}`).toBeGreaterThan(0);
  expect(open.pinned).toBe(0);
  await expect(page.getByRole('treeitem',{name:'Control Panel',exact:true})).toBeVisible();
  const close=await run();
  expect(close.heights.at(-1),`close ${round}`).toBeLessThan(close.heights[0]-20);
  expect(between(close.heights,close.heights[0],close.heights.at(-1)).length,`close ${round}`).toBeGreaterThan(0);
  expect(close.pinned).toBe(0);
  await expect(page.getByRole('treeitem',{name:'Control Panel',exact:true})).toHaveCount(0);
 }
});

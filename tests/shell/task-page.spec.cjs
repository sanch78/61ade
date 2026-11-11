const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openView,command}=require('./feature-demo.cjs');
// D7 task page (docs/demos.md#d7-task-page): the record view `demo.task-page` with the task's notes, a list without a
// menu entry (`demo_task_notes`) declared oldest first (`view.sort`), as cards whose long text (a `textarea`) shows a
// 4-line preview while `Adatok` shows all of it (docs/workspaces.md#list-sort, #long-text-in-cards). The run seeds its
// own task and notes and removes them.
const prefix='tp'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'web';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const long=Array.from({length:8},(_,n)=>`${prefix} bekezdés ${n+1}. `+'Hosszú jegyzet, amelynek a kártyán csak az első sorai látszanak. '.repeat(8)).join('\n\n');
test.describe.configure({mode:'serial'});
let task='';
const cleanup=()=>php(`
 $db->exec("DELETE FROM demo_task_notes WHERE task_id IN (SELECT CAST(id AS TEXT) FROM demo_tasks WHERE title LIKE '${prefix}%')");
 $db->exec("DELETE FROM demo_tasks WHERE title LIKE '${prefix}%'");`);
test.beforeAll(()=>{
 cleanup();
 task=php(`
  $db->prepare("INSERT INTO demo_tasks(owner_id,title) VALUES ('1',?)")->execute(['${prefix} feladat']);$task=$db->lastInsertId();
  $note=$db->prepare("INSERT INTO demo_task_notes(owner_id,task_id,body) VALUES ('1',?,?)");
  foreach(['${prefix} első',${JSON.stringify(long)},'${prefix} harmadik'] as $body)$note->execute([(string)$task,$body]);
  echo $task;`).trim();
});
test.afterAll(cleanup);

function pageErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}

test('Feladatlap opens the cursor task; the notes list has no menu entry',async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test','/');
 await openView(page,'Feladatok');
 const row=page.locator('.dhx_grid-row',{hasText:`${prefix} feladat`});
 await expect(row).toHaveCount(1);
 await row.click();
 await command(page,'Feladatlap');
 await expect(page).toHaveURL(new RegExp(`view=demo\\.task-page&record=${task}`));
 await expect(page.getByRole('tab',{name:'Jegyzetek',exact:true})).toBeVisible();
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:'Feladatok',exact:true})).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'Feladatjegyzetek',exact:true})).toHaveCount(0);
 await page.keyboard.press('Escape');
 expect(errors).toEqual([]);
});

for(const [width,height] of [[1366,900],[390,844]])test(`notes at ${width} px: oldest first, long text clamped in the card, whole in Adatok`,async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${task}`);
 await page.getByRole('tab',{name:'Jegyzetek',exact:true}).click();
 const notesTab=page.getByRole('tabpanel',{name:'Jegyzetek',exact:true});
 const cards=notesTab.locator('.blade-grid-card');
 await expect(cards).toHaveCount(3);
 // The declared sort: oldest first (id ascending), without any kept sort of the user.
 await expect(cards.nth(0)).toContainText(`${prefix} első`);
 await expect(cards.nth(1)).toContainText(`${prefix} bekezdés 1.`);
 await expect(cards.nth(2)).toContainText(`${prefix} harmadik`);
 // The long note: at most 4 lines visible, the rest clipped; the short ones are not clipped.
 const clamp=async card=>card.locator('.blade-grid-card__field--long dd').evaluate(dd=>{const line=parseFloat(getComputedStyle(dd).lineHeight);return {lines:dd.clientHeight/line,clipped:dd.scrollHeight>dd.clientHeight+1};});
 const preview=await clamp(cards.nth(1));
 expect(preview.lines).toBeLessThanOrEqual(4.05);
 expect(preview.clipped).toBe(true);
 expect((await clamp(cards.nth(0))).clipped).toBe(false);
 // Adatok of the long note shows the whole text.
 await cards.nth(1).click();
 const tab=notesTab;
 await (await tab.getByRole('button',{name:'Műveletek'}).isVisible()?tab.getByRole('button',{name:'Műveletek'}).click().then(()=>page.getByRole('menuitem',{name:'Adatok',exact:true}).click()):tab.getByRole('button',{name:'Adatok',exact:true}).click());
 const details=page.locator('.blade-record-details').last();
 await expect(details).toContainText(`${prefix} bekezdés 8.`);
 const full=await details.locator('dd').filter({hasText:`${prefix} bekezdés 1.`}).evaluate(dd=>({clipped:dd.scrollHeight>dd.clientHeight+1,length:dd.textContent.length}));
 expect(full.clipped).toBe(false);
 expect(full.length).toBe(long.length);
 await page.keyboard.press('Escape');
 expect(errors).toEqual([]);
});

// Part of FB-0153 (docs/toolkit.md#pagelayout, collapse from code): the `Munka` tab's side panel follows the bar's
// toggle and its own header; the user's header collapse is kept, the page's own call is not.
const collapsed=cell=>cell.evaluate(e=>e.classList.contains('dhx_layout-cell--collapsed'));
const region=(page,id)=>page.locator(`.dhx_layout-cell[data-cell-id="${id}"]`).first();
for(const [width,height] of [[1366,900],[390,844]])test(`Munka at ${width} px: the side panel follows the toggle and its header; only the user's collapse is kept`,async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${task}`);
 await page.getByRole('tab',{name:'Munka',exact:true}).click();
 // The bar's toggle: a pressed button, or a checked entry of its `Műveletek` menu when the bar is narrow.
 const work=page.getByRole('tabpanel',{name:'Munka',exact:true});
 const button=work.getByRole('button',{name:'Oldalpanel',exact:true});
 const narrow=async()=>!(await button.isVisible());
 const toggle={click:async()=>{if(await narrow()){await work.getByRole('button',{name:'Műveletek'}).first().click();await page.getByRole('menuitemcheckbox',{name:'Oldalpanel'}).click();}else await button.click();}};
 const pressed=async()=>{if(!(await narrow()))return button.getAttribute('aria-pressed');await work.getByRole('button',{name:'Műveletek'}).first().click();const value=await page.getByRole('menuitemcheckbox',{name:'Oldalpanel'}).getAttribute('aria-checked');await page.keyboard.press('Escape');return value;};
 const side=region(page,'side');
 await expect.poll(pressed).toBe('true');
 expect(await collapsed(side)).toBe(false);
 // A selected note shows in the panel.
 await page.getByRole('tabpanel',{name:'Munka',exact:true}).locator('.dhx_grid-row, .blade-grid-card').filter({hasText:`${prefix} harmadik`}).first().click();
 await expect(side.locator('.blade-record-details')).toContainText(`${prefix} harmadik`);
 // The toggle collapses it from code: not kept, a new opening shows the panel again.
 await toggle.click();
 await expect.poll(pressed).toBe('false');
 await expect.poll(()=>collapsed(side)).toBe(true);
 await page.reload();
 await page.getByRole('tab',{name:'Munka',exact:true}).click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(false);
 await expect.poll(pressed).toBe('true');
 // The user's header collapse: the toggle follows, and it is kept.
 await region(page,'side').locator('.dhx_layout-cell-header').first().click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(true);
 await expect.poll(pressed).toBe('false');
 await page.reload();
 await page.getByRole('tab',{name:'Munka',exact:true}).click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(true);
 await expect.poll(pressed).toBe('false');
 // The toggle opens it again (from code; the kept choice stays collapsed until the user's header opens it).
 await toggle.click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(false);
 await region(page,'side').locator('.dhx_layout-cell-header').first().click();
 await region(page,'side').locator('.dhx_layout-cell-header').first().click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(false);
 if(width<768){
  // On a phone the control region collapses while Munka is shown and comes back on another tab; never kept.
  const control=region(page,'control');
  await expect.poll(()=>collapsed(control)).toBe(true);
  await page.getByRole('tab',{name:'Jegyzetek',exact:true}).click();
  await expect.poll(()=>collapsed(control)).toBe(false);
  await page.getByRole('tab',{name:'Munka',exact:true}).click();
  await expect.poll(()=>collapsed(control)).toBe(true);
  await page.getByRole('tab',{name:'Jegyzetek',exact:true}).click();
  await page.reload();
  await expect(page.getByRole('tab',{name:'Jegyzetek',exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>collapsed(region(page,'control'))).toBe(false);
 }else{
  // On a desktop the control region stays as the user left it.
  expect(await collapsed(region(page,'control'))).toBe(false);
 }
 expect(errors).toEqual([]);
});

// Part of FB-0154 (docs/toolkit.md#commandbar-menu): `További műveletek` holds the selected note's commands.
for(const [width,height] of [[1366,900],[390,844]])test(`Munka at ${width} px: the more actions menu acts on the selected note`,async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width,height});
 await page.addInitScript(()=>{window.__copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied.push(text);}},configurable:true});});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${task}`);
 await page.getByRole('tab',{name:'Munka',exact:true}).click();
 const work=page.getByRole('tabpanel',{name:'Munka',exact:true});
 const openMenu=async()=>{
  const more=work.getByRole('button',{name:'További műveletek'});
  if(await more.isVisible())await more.click();
  else{await work.getByRole('button',{name:'Műveletek'}).first().click();await page.getByRole('menuitem',{name:'További műveletek'}).click();}
 };
 // Without a selected note the entries are disabled.
 await openMenu();
 await expect(page.getByRole('menuitem',{name:'Szöveg másolása'})).toBeDisabled();
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 // The panel collapsed by the user; the menu's entry opens it with the selected note.
 await region(page,'side').locator('.dhx_layout-cell-header').first().click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(true);
 await work.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:`${prefix} első`}).first().click();
 await openMenu();
 await page.getByRole('menuitem',{name:'Megjelenítés az oldalpanelen'}).click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(false);
 await expect(region(page,'side').locator('.blade-record-details')).toContainText(`${prefix} első`);
 await openMenu();
 await page.getByRole('menuitem',{name:'Szöveg másolása'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__copied)).toEqual([`${prefix} első`]);
 await expect(page.getByText('A jegyzet szövege a vágólapra került.')).toBeVisible();
 // The header choice of the user stays (the menu's expand is the page's own).
 await page.reload();
 await page.getByRole('tab',{name:'Munka',exact:true}).click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(true);
 await region(page,'side').locator('.dhx_layout-cell-header').first().click();
 await expect.poll(()=>collapsed(region(page,'side'))).toBe(false);
 expect(errors).toEqual([]);
});

// FB-0169 (docs/workspaces.md#cards-only-and-full-width-cards): the notes view declares cards only, one per row
// (`view.modes`, `view.card_columns`), so the scoped notes list has no `Nézet` menu, a kept table choice of the user
// neither switches it to a table nor is overwritten, and on a phone it stays one column; in Hungarian and English.
// `Munka` passes its own `modes` (table and cards), which win over the view's.
const language=(page,locale)=>page.evaluate(async locale=>{
 const csrf=document.querySelector('#blade-command input[name="csrf"]').value;
 await fetch('./',{method:'POST',body:new URLSearchParams({action:'language',csrf,locale})});
},locale);
for(const [width,height] of [[1366,900],[390,844]])test(`notes at ${width} px: cards only, one per row, the kept table choice ignored, in Hungarian and English`,async({page})=>{
 const errors=pageErrors(page);
 await page.setViewportSize({width,height});
 await signIn(page,'demo@example.test',`/#view=demo.task-page&record=${task}`);
 const key=await page.evaluate(()=>{
  const user=JSON.parse(document.getElementById('blade-config').textContent).userId;if(!user)throw new Error('No user id in the page configuration.');
  const key='blade-ui:1:'+JSON.stringify([location.pathname,user,'demo_task_notes@task_id']);
  localStorage.setItem(key,JSON.stringify({mode:'table'}));return key;
 });
 try{
  for(const [locale,notes,selector,actions] of [['hu','Jegyzetek',/^Nézet:/,'Műveletek'],['en','Notes',/^View:/,'Actions']]){
   await language(page,locale);await page.reload();
   await expect(page.locator('html')).toHaveAttribute('lang',locale);
   await page.getByRole('tab',{name:notes,exact:true}).click();
   const tab=page.getByRole('tabpanel',{name:notes,exact:true});
   await expect(tab.locator('.blade-grid-card')).toHaveCount(3);
   await expect(tab.locator('.dhx_grid-row')).toHaveCount(0);
   // No view menu: neither in the bar nor in its `Műveletek` menu.
   await expect(tab.getByRole('button',{name:selector})).toHaveCount(0);
   const menu=tab.getByRole('button',{name:actions,exact:true});
   if(await menu.isVisible()){await menu.click();await expect(page.getByRole('menuitem').first()).toBeVisible();await expect(page.getByRole('menuitem',{name:selector})).toHaveCount(0);await page.keyboard.press('Escape');}
   // One card per row across the panel.
   const boxes=await tab.locator('.dhx_dataview-item').evaluateAll(items=>items.map(item=>{const box=item.getBoundingClientRect();return {x:Math.round(box.x),width:box.width,list:item.closest('.blade-grid-cards').clientWidth};}));
   expect(boxes).toHaveLength(3);
   expect(new Set(boxes.map(box=>box.x)).size).toBe(1);
   for(const box of boxes)expect(box.width).toBeGreaterThan(box.list-32);
   expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).mode,key)).toBe('table');
  }
  if(width>=768){
   // Munka: the list's own modes (table and cards) instead of the view's cards only.
   await page.getByRole('tab',{name:'Work',exact:true}).click();
   const work=page.getByRole('tabpanel',{name:'Work',exact:true});
   await expect(work.locator('.dhx_grid-row').first()).toBeVisible();
   const menu=work.getByRole('button',{name:'Actions',exact:true});
   if(await menu.isVisible()){await menu.click();await page.getByRole('menuitem',{name:/^View:/}).click();}
   else await work.getByRole('button',{name:/^View:/}).click();
   expect((await page.getByRole('menuitem',{name:/^(Table|Cards|Tiles)$/}).allTextContents()).map(text=>text.trim())).toEqual(['Table','Cards']);
   await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  }
 }finally{
  // Back to Hungarian: the account keeps the choice and other specs expect the default.
  await language(page,'hu');
  await page.evaluate(key=>localStorage.removeItem(key),key);
 }
 expect(errors).toEqual([]);
});

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
 const cards=page.locator('.blade-grid-card');
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
 const tab=page.getByRole('tabpanel').filter({has:cards.first()});
 await (await tab.getByRole('button',{name:'Műveletek'}).isVisible()?tab.getByRole('button',{name:'Műveletek'}).click().then(()=>page.getByRole('menuitem',{name:'Adatok',exact:true}).click()):tab.getByRole('button',{name:'Adatok',exact:true}).click());
 const details=page.locator('.blade-record-details').last();
 await expect(details).toContainText(`${prefix} bekezdés 8.`);
 const full=await details.locator('dd').filter({hasText:`${prefix} bekezdés 1.`}).evaluate(dd=>({clipped:dd.scrollHeight>dd.clientHeight+1,length:dd.textContent.length}));
 expect(full.clipped).toBe(false);
 expect(full.length).toBe(long.length);
 await page.keyboard.press('Escape');
 expect(errors).toEqual([]);
});

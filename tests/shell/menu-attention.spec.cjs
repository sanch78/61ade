const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn}=require('./feature-demo.cjs');
// Menu attention (docs/shell.md#menu-attention, `view.attention`): the feature demo's `Jóváhagyások` (approvals.json)
// counts its pending records on its menu entry, its branch and the collapsed `Menü`, kept current by the live channel;
// zero shows the plain entry; the reader, who is not offered the view, gets neither. The run adds prefixed pending
// rows, sets the seeded pending ones aside for the zero case, and restores both.
const prefix='ma'+Date.now().toString(36);
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
test.describe.configure({mode:'serial'});
let seeded=[];
const pending=()=>Number(php(`echo $db->query("SELECT COUNT(*) FROM demo_approvals WHERE status='pending'")->fetchColumn();`));
test.beforeAll(()=>{
 php(`$db->exec("DELETE FROM demo_approvals WHERE title LIKE '${prefix}%'");`);
 seeded=JSON.parse(php(`echo json_encode($db->query("SELECT CAST(id AS TEXT) FROM demo_approvals WHERE status='pending'")->fetchAll(PDO::FETCH_COLUMN));`));
 php(`$q=$db->prepare("INSERT INTO demo_approvals(title,status) VALUES (?,'pending')");foreach(['${prefix} első','${prefix} második'] as $t)$q->execute([$t]);`);
});
test.afterAll(()=>{
 php(`$db->exec("DELETE FROM demo_approvals WHERE title LIKE '${prefix}%'");$q=$db->prepare("UPDATE demo_approvals SET status='pending' WHERE id=?");foreach(${JSON.stringify(seeded)} as $id)$q->execute([$id]);`);
});

const nav=page=>page.locator('.blade-navigation-row .dhx_menu-nav');
/** The badge of a top-level menu entry (aria-hidden: the name of a branch and of `Menü` stays). */
const badge=(page,id)=>nav(page).locator(`[data-dhx-id="${id}"] .blade-menu-count`);
const entry=(page,count)=>page.getByRole('menuitem',{name:count?`Jóváhagyások, ${count} függőben`:'Jóváhagyások',exact:true});

test('count, tone and accessible name on the entry and its branch; live changes; zero restores the plain entry',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 const count=pending();
 expect(count).toBe(seeded.length+2);
 // The branch shows the count in the tone, hidden from screen readers; its name is unchanged.
 await expect(badge(page,'group:Feature demó')).toHaveText(String(count));
 await expect(badge(page,'group:Feature demó')).toHaveClass(/blade-menu-count--warning/);
 await expect(badge(page,'group:Feature demó')).toHaveAttribute('aria-hidden','true');
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();
 // The entry: badge and the count in its accessible name; other entries stay plain.
 await expect(entry(page,count)).toBeVisible();
 await expect(entry(page,count).locator('.blade-menu-count')).toHaveText(String(count));
 await expect(page.getByRole('menuitem',{name:'Feladatok',exact:true})).toBeVisible();
 // A change on the server reaches the open menu through the live channel, without closing it.
 php(`$db->exec("UPDATE demo_approvals SET status='approved' WHERE title='${prefix} első'");`);
 await expect(entry(page,count-1)).toBeVisible({timeout:15000});
 await expect(badge(page,'group:Feature demó')).toHaveText(String(count-1));
 // Zero: the plain entry and branch.
 php(`$db->exec("UPDATE demo_approvals SET status='approved' WHERE status='pending'");`);
 await expect(entry(page,0)).toBeVisible({timeout:15000});
 await expect(nav(page).locator('.blade-menu-count')).toHaveCount(0);
 await expect(page.locator('.dhx_menu .blade-menu-count')).toHaveCount(0);
 // Back above zero: the view's own list shows the same records the entry counts.
 php(`$db->exec("UPDATE demo_approvals SET status='pending' WHERE title LIKE '${prefix}%'");`);
 await expect(entry(page,2)).toBeVisible({timeout:15000});
 await entry(page,2).click();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:prefix})).toHaveCount(2);
 expect(failures).toEqual([]);
});

test('the collapsed Menü at 390 px shows the attention; the reader gets neither entry nor count',async({browser})=>{
 const phone=await browser.newPage();
 await phone.setViewportSize({width:390,height:844});
 await signIn(phone);
 const count=pending();
 await expect(badge(phone,'blade-main-menu')).toHaveText(String(count));
 await phone.getByRole('menuitem',{name:'Menü',exact:true}).click();
 const group=phone.locator('.dhx_menu [data-dhx-id="group:Feature demó"]');
 await expect(group.locator('.blade-menu-count')).toHaveText(String(count));
 await phone.getByRole('menuitem',{name:'Feature demó',exact:true}).click();
 await expect(entry(phone,count)).toBeVisible();
 await phone.close();

 const reader=await browser.newPage();
 await reader.setViewportSize({width:1366,height:900});
 await signIn(reader,'reader@example.test');
 await reader.getByRole('menuitem',{name:'Feature demó',exact:true}).click();
 await expect(reader.getByRole('menuitem',{name:'Feladatok',exact:true})).toBeVisible();
 await expect(reader.getByRole('menuitem',{name:/^Jóváhagyások/})).toHaveCount(0);
 await expect(reader.locator('.blade-menu-count')).toHaveCount(0);
 await reader.close();
});

const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn,openView,api}=require('./feature-demo.cjs');
// Delegated access (FB-0180) on the feature demo's `Gyűjtemények` (modules/collections.json): delegate@example.test
// reaches the synthetic collections through demo_collection_readers (A, B) and demo_collection_writers (A); the demo
// account keeps ordinary `all` grants. The run restores the description of A and any link it revokes.
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'web';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
const ids=JSON.parse(php("echo json_encode($db->query(\"SELECT title, id FROM demo_collections WHERE title IN ('A','B','C')\")->fetchAll(PDO::FETCH_KEY_PAIR));"));
for(const key of Object.keys(ids))ids[key]=String(ids[key]);
const delegate=php("echo $db->query(\"SELECT id FROM accounts WHERE email='delegate@example.test'\")->fetchColumn();").trim();
const original=php(`echo $db->query("SELECT description FROM demo_collections WHERE id=${Number(ids.A)}")->fetchColumn();`);
const restore=()=>php(`$q=$db->prepare('UPDATE demo_collections SET description=? WHERE id=?');$q->execute([${JSON.stringify(original)},${Number(ids.A)}]);$db->exec('INSERT OR IGNORE INTO demo_collection_readers(collection_id,actor_id) VALUES (${Number(ids.B)},${Number(delegate)})');`);
test.describe.configure({mode:'serial'});
test.afterAll(restore);

const row=(page,title)=>page.locator('[data-cell-id="grid"] .dhx_grid-row').filter({has:page.getByRole('gridcell',{name:title,exact:true})});
const listed=async page=>(await api(page,'demo_collections','list',null,{limit:50})).body.data.items.map(item=>item.title).sort();

test('the delegated account lists A and B, edits only A and cannot reach C',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'delegate@example.test');
 await openView(page,'Gyűjtemények');
 await expect(row(page,'A')).toBeVisible();
 await expect(row(page,'B')).toBeVisible();
 await expect(row(page,'C')).toHaveCount(0);
 expect(await listed(page)).toEqual(['A','B']);
 // B is read-only: its update command is not offered.
 await row(page,'B').getByRole('gridcell',{name:'B',exact:true}).click();
 await expect(page.getByRole('button',{name:'Módosítás',exact:true})).toBeDisabled();
 // A is writable through the form.
 await row(page,'A').getByRole('gridcell',{name:'A',exact:true}).click();
 await expect(page.getByRole('button',{name:'Módosítás',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Módosítás',exact:true}).click();
 const form=page.getByRole('dialog').last();
 const text=`Delegált szerkesztés ${Date.now().toString(36)}`;
 await form.getByLabel('Leírás',{exact:true}).fill(text);
 await form.getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(row(page,'A')).toContainText(text);
 // Forbidden requests: an update of B, a get of C by its id, and create without a grant.
 const b=(await api(page,'demo_collections','get',ids.B)).body.data;
 expect((await api(page,'demo_collections','update',ids.B,{title:'B',description:'x',revision:b.revision})).status).toBe(403);
 expect((await api(page,'demo_collections','get',ids.C)).status).toBe(403);
 expect((await api(page,'demo_collections','create',null,{title:'D',description:''})).status).toBe(403);
 // Revocation: without the reader link B disappears on the next request.
 php(`$db->exec('DELETE FROM demo_collection_readers WHERE collection_id=${Number(ids.B)} AND actor_id=${Number(delegate)}');`);
 expect(await listed(page)).toEqual(['A']);
 expect((await api(page,'demo_collections','get',ids.B)).status).toBe(403);
 restore();
 expect(await listed(page)).toEqual(['A','B']);
 expect(errors).toEqual([]);
});

test('the demo account keeps its ordinary grants on all three collections',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page,'demo@example.test');
 await openView(page,'Gyűjtemények');
 for(const title of ['A','B','C'])await expect(row(page,title)).toBeVisible();
 const items=(await api(page,'demo_collections','list',null,{limit:50})).body.data.items;
 expect(items.map(item=>item.title).sort()).toEqual(['A','B','C']);
 for(const item of items)expect(item._actions).toEqual(expect.arrayContaining(['get','update']));
 await row(page,'C').getByRole('gridcell',{name:'C',exact:true}).click();
 await expect(page.getByRole('button',{name:'Módosítás',exact:true})).toBeEnabled();
 expect(errors).toEqual([]);
});

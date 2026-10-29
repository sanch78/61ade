const {test,expect}=require('../../tools/playwright-test.cjs');
const {openMenu,signIn}=require('./feature-demo.cjs');
test('standalone registry creates a DHTMLX grid and reusable form',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill('demo@example.test');await page.getByLabel('Jelszó',{exact:true}).fill('61ade-demo');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await openMenu(page,'Jegyzetek');
 const workspace=page.locator('.blade-workspace');
 await expect(workspace.locator('.dhx_layout-space')).toHaveCount(1);
 await expect(workspace.locator('[data-cell-id="filter"]')).toBeVisible();
 await expect(workspace.locator('[data-cell-id="grid"]')).toBeVisible();
 const insets=await workspace.evaluate(host=>{
   const outer=host.getBoundingClientRect();
   const first=host.querySelector('[data-cell-id="filter"]').getBoundingClientRect();
   return {left:first.left-outer.left,top:first.top-outer.top};
 });
 expect(insets).toEqual({left:12,top:12});
 await expect(page.locator('.blade-session-bar')).toHaveCount(1);
 await expect(page.locator('.blade-workspace .dhx_toolbar')).toHaveCount(1);
 await expect(page.getByText('Élő kapcsolat',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Cím',{exact:true}).fill('Standalone '+Date.now());
 await page.getByRole('dialog').getByRole('button',{name:'Mentés',exact:true}).click();
 await expect(page.getByText('A művelet sikerült.',{exact:true})).toBeVisible();
 for(let i=0;i<3;i++){
   await openMenu(page,'Jegyzetek');
   await expect(page.getByRole('button',{name:'Hozzáadás',exact:true})).toBeVisible();
 }
 expect(errors).toEqual([]);
});
// External write to the newest note, outside the application (CLI SQLite). The grid sorts by id
// descending and renders only visible rows, so the newest note is the one on screen.
function writeNote(value){
 require('node:child_process').execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${process.env.BLADE_TMP_DIR || 'tmp'}/${process.env.BLADE_DEMO_INSTANCE || 'demo'}/features.sqlite');$q=$db->prepare('UPDATE notes SET title=? WHERE id=(SELECT MAX(id) FROM notes)');$q->execute([$argv[1]]);`,value]);
}
// LiveConfig transport of the signed-in demo: examples/demo-app/.env selects WebSocket (docs/demos.md).
const transport=page=>page.evaluate(()=>JSON.parse(document.getElementById('blade-config').textContent).live?.transport);
test('polling observes external writes without a refresh control',async({page})=>{
 await signIn(page);
 test.skip(await transport(page)==='websocket','The demo selects WebSocket live data');
 await openMenu(page,'Jegyzetek');
 await expect(page.getByRole('button',{name:'Frissítés',exact:true})).toHaveCount(0);
 const value='Polling '+Date.now();writeNote(value);
 await expect(page.getByText(value,{exact:true})).toBeVisible({timeout:10000});
});
// Pending until Infra runs the demo live unit and the /live proxy and .env sets BLADE_DEMO_LIVE_ENDPOINT.
test('WebSocket delivers external writes as update frames',async({page})=>{
 await signIn(page);
 test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
 const opened=page.waitForEvent('websocket',socket=>new URL(socket.url()).pathname==='/live');
 await openMenu(page,'Jegyzetek');
 const socket=await opened;
 await socket.waitForEvent('framereceived',{predicate:frame=>JSON.parse(frame.payload).type==='update',timeout:10000});
 const value='WebSocket '+Date.now();
 const update=socket.waitForEvent('framereceived',{predicate:frame=>{const m=JSON.parse(frame.payload);return m.type==='update'&&m.upserts.some(row=>row.title===value);},timeout:10000});
 writeNote(value);
 await update;
 await expect(page.getByText(value,{exact:true})).toBeVisible();
});

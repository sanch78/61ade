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
// The shell opens its one live channel after sign-in (protocol 2: hello, ready, subscribe per list).
test('WebSocket delivers external writes as update frames',async({page})=>{
 const opened=page.waitForEvent('websocket',socket=>new URL(socket.url()).pathname==='/live');
 await signIn(page);
 test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
 const socket=await opened;
 const first=socket.waitForEvent('framereceived',{predicate:frame=>JSON.parse(frame.payload).type==='update',timeout:10000});
 await openMenu(page,'Jegyzetek');
 const id=JSON.parse((await first).payload).id;
 const value='WebSocket '+Date.now();
 const update=socket.waitForEvent('framereceived',{predicate:frame=>{const m=JSON.parse(frame.payload);return m.type==='update'&&m.id===id&&m.upserts.some(row=>row.title===value);},timeout:10000});
 writeNote(value);
 await update;
 await expect(page.getByText(value,{exact:true})).toBeVisible();
});
// One channel per tab: switching views, expanding sub-view rows and opening a full sub-view window reuse it.
test('one live WebSocket carries every list and sub-view of the tab',async({page})=>{
 const sockets=[],subscribed=new Set(),updated=new Set(),closed=[];
 page.on('websocket',socket=>{
  if(!new URL(socket.url()).pathname.startsWith('/live'))return;
  sockets.push(socket.url());socket.on('close',()=>closed.push(socket.url()));
  socket.on('framesent',frame=>{const m=JSON.parse(frame.payload);if(m.type==='subscribe')subscribed.add(m.id);});
  socket.on('framereceived',frame=>{const m=JSON.parse(frame.payload);if(m.type==='update')updated.add(m.id);});
 });
 await signIn(page,'single@example.test','/tenants/');
 test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
 const expand=text=>page.locator('.dhx_grid-row').filter({hasText:text}).first().locator('.blade-subrow-toggle').click();
 const preview=page.locator('.blade-subview-host .blade-subview .dhx_grid-row');
 await openMenu(page,'Projektek','Tenant demó');
 await expand('Alpha research');await expect(preview.first()).toBeVisible();
 await openMenu(page,'Közös hirdetőtábla','Tenant demó');
 await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
 await openMenu(page,'Feladatok','Tenant demó');
 await expand('Alpha measurement');await expect(preview).toHaveCount(2);
 await page.locator('.dhx_grid-row').filter({hasText:'Alpha measurement'}).first().locator('[data-dhx-col-id="title"]').click();
 await page.getByRole('button',{name:'Alelemek',exact:true}).click();
 const full=page.getByRole('dialog',{name:'Feladatok — Alpha measurement'});
 await expect(full.locator('.dhx_grid-row')).toHaveCount(2);
 // Three views, two previews and the window: six subscriptions, each with its own id and update frames.
 await expect.poll(()=>updated.size,{timeout:10000}).toBeGreaterThanOrEqual(6);
 await full.getByRole('button',{name:'close',exact:true}).click();
 expect(sockets).toEqual([sockets[0]]);
 expect(new URL(sockets[0]).pathname).toBe('/live/tenants');
 expect(closed).toEqual([]);
 expect(subscribed.size).toBeGreaterThanOrEqual(6);
});
// A stale page (another protocol) gets 4409: it reloads once, and a second 4409 within a minute does not loop.
test('a 4409 protocol mismatch reloads the page once, never in a loop',async({page})=>{
 await signIn(page);
 test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
 let hellos=0,loads=0;
 await page.routeWebSocket(url=>new URL(url).pathname==='/live',ws=>{ws.onMessage(message=>{if(JSON.parse(message).type==='hello'){hellos++;ws.close({code:4409,reason:'Protocol 2 required'});}});});
 page.on('load',()=>loads++);
 await page.reload();
 await expect.poll(()=>loads,{timeout:10000}).toBe(2);
 await expect.poll(()=>hellos,{timeout:10000}).toBe(2);
 await page.waitForTimeout(3000);
 expect(loads).toBe(2);expect(hellos).toBe(2);
 // The stale page keeps working without live data: lists load, nothing is revoked, the lower bar says why.
 await expect(page.locator('.blade-session-bar').getByText('Az élő követéshez töltse újra az oldalt.',{exact:true})).toBeVisible();
 await openMenu(page,'Jegyzetek');
 await expect(page.locator('.dhx_grid-row').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Hozzáadás',exact:true})).toBeEnabled();
 expect(hellos).toBe(2);
});
test('a 4409 never reloads over an open form',async({page})=>{
 await signIn(page);
 test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
 let route,loads=0;
 await page.routeWebSocket(url=>new URL(url).pathname==='/live',ws=>{route=ws;ws.connectToServer();});
 await page.reload();page.on('load',()=>loads++);
 await openMenu(page,'Jegyzetek');
 await expect.poll(()=>!!route,{timeout:10000}).toBe(true);
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const form=page.getByRole('dialog');await form.getByLabel('Cím',{exact:true}).fill('Unsaved draft');
 await route.close({code:4409,reason:'Protocol 2 required'});
 await expect(page.locator('.blade-session-bar').getByText('Az élő követéshez töltse újra az oldalt.',{exact:true})).toBeVisible();
 await page.waitForTimeout(1500);
 expect(loads).toBe(0);
 await expect(form.getByLabel('Cím',{exact:true})).toHaveValue('Unsaved draft');
});
// A refused ticket (4401 before ready) ends live data without a reconnect loop. The shell reloads once for the
// sign-in page; this session is still alive, so the page comes back signed in and the second 4401 asks instead.
test('a 4401 before ready ends live data and does not reconnect',async({page})=>{
 await signIn(page);
 test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
 let hellos=0;
 await page.routeWebSocket(url=>new URL(url).pathname==='/live',ws=>{ws.onMessage(message=>{if(JSON.parse(message).type==='hello'){hellos++;ws.close({code:4401,reason:'Authentication failed'});}});});
 await page.reload();
 await expect.poll(()=>hellos,{timeout:10000}).toBe(2);
 await expect(page.getByRole('alertdialog',{name:'A munkamenet lejárt'})).toBeVisible();
 await page.waitForTimeout(4000);
 expect(hellos).toBe(2);
});
// An ended session (here: the cookie is gone) signs the page out on the next request: a menu click shows the
// sign-in page with the address kept, and signing in opens the view.
test('a menu click after the session ended shows the sign-in page',async({page,context})=>{
 await signIn(page);
 await openMenu(page,'Jegyzetek');
 await expect(page.getByRole('button',{name:'Hozzáadás',exact:true})).toBeVisible();
 await context.clearCookies({name:'blade_demo'});
 // Polling's own 401 may already reload the page during the click.
 await openMenu(page,'Jegyzetek').catch(()=>{});
 await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible({timeout:10000});
 expect(new URL(page.url()).hash).toContain('view=');
});
// Over unsaved input the shell asks first; Cancel keeps the form, the next 401 asks again, sign-in reloads.
test('an ended session over an open form asks before the sign-in page',async({page,context})=>{
 await signIn(page);
 await openMenu(page,'Jegyzetek');
 await page.getByRole('button',{name:'Hozzáadás',exact:true}).click();
 const form=page.getByRole('dialog');await form.getByLabel('Cím',{exact:true}).fill('Unsaved draft');
 await context.clearCookies({name:'blade_demo'});
 const ended=page.getByRole('alertdialog',{name:'A munkamenet lejárt'});
 const save=async()=>{
  await form.getByRole('button',{name:'Mentés',exact:true}).click();
  // The failed save reports its own error above the session dialog.
  const error=page.getByRole('alertdialog',{name:'Hiba'});
  await error.getByRole('button',{name:'Rendben',exact:true}).click();
  await expect(ended).toBeVisible();
 };
 // Polling's own 401 may ask first; otherwise the save does.
 if(!await ended.waitFor({timeout:3000}).then(()=>true,()=>false))await save();
 await ended.getByRole('button',{name:'Mégse',exact:true}).click();
 await expect(ended).toHaveCount(0);
 await expect(form.getByLabel('Cím',{exact:true})).toHaveValue('Unsaved draft');
 await save();
 await ended.getByRole('button',{name:'Bejelentkezés',exact:true}).click();
 await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible({timeout:10000});
});
// A hidden tab unsubscribes its lists on the open socket; showing it subscribes them again.
test('a hidden tab pauses its subscriptions without closing the channel',async({page})=>{
 const frames=[];let sockets=0,closed=0;
 page.on('websocket',socket=>{if(new URL(socket.url()).pathname!=='/live')return;sockets++;socket.on('close',()=>closed++);socket.on('framesent',frame=>frames.push(JSON.parse(frame.payload)));});
 await signIn(page);
 test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
 await openMenu(page,'Jegyzetek');
 await expect.poll(()=>frames.filter(m=>m.type==='subscribe').length,{timeout:10000}).toBeGreaterThan(0);
 const visibility=hidden=>page.evaluate(hidden=>{Object.defineProperty(document,'hidden',{value:hidden,configurable:true});document.dispatchEvent(new Event('visibilitychange'));},hidden);
 const before=frames.filter(m=>m.type==='subscribe').at(-1).id;
 await visibility(true);
 await expect.poll(()=>frames.some(m=>m.type==='unsubscribe'&&m.id===before),{timeout:5000}).toBe(true);
 await visibility(false);
 await expect.poll(()=>frames.filter(m=>m.type==='subscribe').at(-1).id,{timeout:5000}).not.toBe(before);
 expect(sockets).toBe(1);expect(closed).toBe(0);
});
// The demo unit serves the starter admin and the tenant demo at <endpoint>/admin and <endpoint>/tenants (LiveConfig applications).
for(const [path,menu,group,email] of [['/admin/','Felhasználók','Adminisztráció','demo@example.test'],['/tenants/','Projektek','Tenant demó','demo@example.test']]){
 test(`WebSocket serves ${path} on its own live path with its own tickets`,async({page})=>{
  const live='/live/'+path.replaceAll('/','');
  let greeted,updated;
  const sent=new Promise(resolve=>greeted=resolve),received=new Promise(resolve=>updated=resolve);
  page.on('websocket',socket=>{
   if(new URL(socket.url()).pathname!==live)return;
   socket.on('framesent',frame=>{const m=JSON.parse(frame.payload);if(m.type==='hello')greeted(m);});
   socket.on('framereceived',frame=>{if(JSON.parse(frame.payload).type==='update')updated();});
  });
  await signIn(page,email,path);
  test.skip(await transport(page)!=='websocket','The demo polls; set BLADE_DEMO_LIVE_ENDPOINT to test WebSocket');
  await openMenu(page,menu,group);
  await expect.poll(()=>Promise.race([received.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),250))]),{timeout:10000}).toBe(true);
  // The ticket belongs to this application's runtime: the feature demo path refuses it.
  const {ticket,protocol}=await sent;
  const code=await page.evaluate(({ticket,protocol})=>new Promise(resolve=>{const endpoint=JSON.parse(document.getElementById('blade-config').textContent).live.endpoint.replace(/\/[a-z]+$/,'');const ws=new WebSocket(endpoint);ws.onopen=()=>ws.send(JSON.stringify({type:'hello',protocol,ticket}));ws.onclose=event=>resolve(event.code);}),{ticket,protocol});
  expect(code).toBe(4401);
 });
}

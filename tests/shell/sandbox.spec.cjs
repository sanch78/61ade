const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,api,createTask,deleteTasks}=require('./feature-demo.cjs');
// Visitor sandboxes (docs/demos.md#visitor-sandboxes): without the developer key every browser gets its own copy of
// the seed. Changes stay in that copy; the shared instance and other visitors never see them. The copies are purged
// after an idle hour, so the visitor tasks are not deleted here.
const visitor=async browser=>{const context=await browser.newContext({baseURL:test.info().project.use.baseURL});await context.clearCookies({name:'blade_demo_developer'});return context;};
const title=async(page,id)=>{const form=await api(page,'demo_tasks','__form',id,{operation:'update'});return form.status===200?form.body.data.values.title:null;};

test('every visitor works on an own copy of the seed',async({browser,page})=>{
 const name=`Sandbox ${Date.now()}`,a=await visitor(browser),b=await visitor(browser),shared=[];
 try{
  const first=await a.newPage();await signIn(first);await expect(first.locator('#blade-config')).toBeAttached();
  expect(JSON.stringify(JSON.parse(await first.locator('#blade-config').textContent()))).not.toContain('wss://');
  const id=await createTask(first,{title:name,status:'new'});
  expect(await title(first,id)).toBe(name);
  await first.reload();expect(await title(first,id)).toBe(name);
  const second=await b.newPage();await signIn(second);await expect(second.locator('#blade-config')).toBeAttached();
  expect(await title(second,id)).not.toBe(name);
  await signIn(page);await expect(page.locator('#blade-config')).toBeAttached();
  expect(await title(page,id)).not.toBe(name);
  // The shared instance (developer key) keeps its own data too.
  shared.push(await createTask(page,{title:name+' shared',status:'new'}));
  expect(await title(first,shared[0])).not.toBe(name+' shared');
 }finally{await deleteTasks(page,shared);await a.close();await b.close();}
});

test('only a client that keeps the cookie gets a copy',async({playwright})=>{
 const baseURL=test.info().project.use.baseURL,client=await playwright.request.newContext({baseURL}),anonymous=await playwright.request.newContext({baseURL});
 try{
  // A page request comes back to the same address with a signed copy id; nothing is shown in between.
  const first=await client.get('/?x=1',{maxRedirects:0});
  expect(first.status()).toBe(302);expect(first.headers()['location']).toBe('/?x=1');
  expect(first.headers()['set-cookie']).toMatch(/blade_demo_sandbox=[a-f0-9]{32}\.[a-f0-9]{32}/);
  // Any other request without the cookie answers like an ended session.
  expect((await anonymous.post('/?blade=1',{data:{resource:'demo_tasks',action:'list'}})).status()).toBe(401);
  // The returned cookie opens the copy: the sign-in page of the feature demo.
  const second=await client.get('/',{maxRedirects:0});expect(second.status()).toBe(200);expect(await second.text()).toContain('blade-config');
 }finally{await client.dispose();await anonymous.dispose();}
});

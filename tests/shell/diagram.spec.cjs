const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,api}=require('./feature-demo.cjs');
// Diagram editor as the network topology builder (Feature demó → Hálózati topológia), see docs/diagrams.md.
// Diagrams and element types created here carry the run prefix and are deleted afterwards.
const prefix='pw'+Date.now().toString(36);
test.describe.configure({mode:'serial'});

async function openTopology(page){
 await page.setViewportSize({width:1400,height:900});
 // Same responsive main menu handling as the shared openView step.
 await expect(page.getByRole('menuitem',{name:/^(Menü|Feature demó)$/}).first()).toBeVisible();
 const burger=page.getByRole('menuitem',{name:'Menü',exact:true});if(await burger.isVisible()){await burger.click();await page.waitForTimeout(750);}
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();
 await page.getByRole('menuitem',{name:'Hálózati topológia',exact:true}).click();
 await expect(page.locator('.blade-diagram-surface')).toBeVisible();
}
const nodes=page=>page.locator('.blade-diagram-node');
const node=(page,label)=>nodes(page).filter({has:page.locator('.blade-diagram-node__label',{hasText:new RegExp('^'+label+'$')})});
const paletteItem=(page,label)=>page.locator('.blade-diagram-palette__item').filter({hasText:new RegExp('^'+label+'$')});
async function cleanup(page){
 const listed=await api(page,'topology','list');
 for(const diagram of listed.body.data?.diagrams??[])if(diagram.name.startsWith(prefix))await api(page,'topology','delete',diagram.id);
 for(const type of listed.body.data?.types??[])if(type.label.startsWith(prefix))await api(page,'topology','type_delete',type.id);
}
async function drag(page,from,to){
 const a=await from.boundingBox(),b=typeof to.boundingBox==='function'?await to.boundingBox():to;
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 await page.mouse.move(a.x+a.width/2+12,a.y+a.height/2+12,{steps:3});
 await page.mouse.move(b.x+(b.width??0)/2,b.y+(b.height??0)/2,{steps:8});await page.mouse.up();
}

test('seeded topology opens with palette, elements and connections',async({page})=>{
 await signIn(page);await openTopology(page);
 await expect(page.locator('.blade-diagram-list').getByText('Office network',{exact:true})).toBeVisible();
 await expect(paletteItem(page,'Router')).toBeVisible();
 await page.locator('.blade-diagram-list').getByText('Office network',{exact:true}).click();
 await expect(nodes(page)).toHaveCount(12);
 await expect(page.locator('.blade-diagram-link')).toHaveCount(11);
 // Selecting an element fills the Suite property form.
 await node(page,'Core switch').locator('.blade-diagram-node__shape').click();
 await expect(page.locator('.blade-diagram-properties input[name="label"]')).toHaveValue('Core switch');
 await page.screenshot({path:require('node:path').join(process.env.BLADE_TMP_DIR||'tmp','diagram-topology.png')});
});

test('build a topology: drop, connect, edit, save and reload',async({page})=>{
 await signIn(page);await openTopology(page);
 try{
  await page.getByRole('button',{name:'Új diagram',exact:true}).click();
  await page.getByLabel('Diagram neve').fill(prefix+' hálózat');
  await page.getByRole('button',{name:'Új diagram',exact:true}).last().click();
  await expect(page.locator('.blade-diagram-list').getByText(prefix+' hálózat')).toBeVisible();
  await expect(page.locator('.blade-diagram-empty')).toBeVisible();
  const canvas=await page.locator('.blade-diagram-surface').boundingBox();
  // Drag from the palette onto the canvas, and the double-click alternative.
  await drag(page,paletteItem(page,'Router'),{x:canvas.x+canvas.width*0.35,y:canvas.y+canvas.height*0.5});
  await expect(nodes(page)).toHaveCount(1);
  await paletteItem(page,'Switch').dblclick();
  await expect(nodes(page)).toHaveCount(2);
  // Move the switch to the right, then connect router → switch by its handle.
  await drag(page,node(page,'Switch 1').locator('.blade-diagram-node__shape'),{x:canvas.x+canvas.width*0.7,y:canvas.y+canvas.height*0.5});
  await node(page,'Router 1').hover();
  await drag(page,node(page,'Router 1').locator('.blade-diagram-node__handle'),node(page,'Switch 1').locator('.blade-diagram-node__shape'));
  await expect(page.locator('.blade-diagram-link')).toHaveCount(1);
  await page.locator('.blade-diagram-properties select').selectOption({label:'Optika (10 Gbit/s)'});
  await node(page,'Router 1').locator('.blade-diagram-node__shape').click();
  const label=page.locator('.blade-diagram-properties input[name="label"]');
  await label.fill('Határrouter');await label.press('Tab');
  await expect(node(page,'Határrouter')).toHaveCount(1);
  await page.getByRole('button',{name:'Mentés',exact:true}).click();
  await expect(page.locator('.blade-toast',{hasText:'A diagram elmentve.'})).toBeVisible();
  const listed=await api(page,'topology','list');
  const id=listed.body.data.diagrams.find(d=>d.name===prefix+' hálózat').id;
  const saved=(await api(page,'topology','get',id)).body.data;
  expect(saved.revision).toBe('2');
  expect(saved.content.nodes.map(n=>n.label).sort()).toEqual(['Határrouter','Switch 1']);
  expect(saved.content.links[0].type).toBe('fiber');
  await page.reload();await expect(page.locator('.blade-diagram-surface')).toBeVisible();
  await page.locator('.blade-diagram-list').getByText(prefix+' hálózat').click();
  await expect(node(page,'Határrouter')).toHaveCount(1);
 }finally{await cleanup(page);}
});

test('define a new element type and use it',async({page})=>{
 await signIn(page);await openTopology(page);
 try{
  await page.getByRole('button',{name:'Új elemtípus',exact:true}).click();
  await page.getByLabel('Megnevezés').fill(prefix+' szenzor');
  await page.getByLabel('Ikon').selectOption({label:'Kamera'});
  await page.getByRole('button',{name:'Új elemtípus',exact:true}).last().click();
  await expect(paletteItem(page,prefix+' szenzor')).toBeVisible();
  const created=await api(page,'topology','create',null,{name:prefix+' típusteszt'});
  await page.reload();await expect(page.locator('.blade-diagram-surface')).toBeVisible();
  await page.locator('.blade-diagram-list').getByText(prefix+' típusteszt').click();
  await paletteItem(page,prefix+' szenzor').dblclick();
  await expect(node(page,prefix+' szenzor 1')).toHaveCount(1);
  // Keyboard alternative: Enter on the focused palette entry adds another element.
  await page.keyboard.press('Enter');
  await expect(node(page,prefix+' szenzor 2')).toHaveCount(1);
  await page.getByRole('button',{name:'Mentés',exact:true}).click();
  await expect(page.locator('.blade-toast',{hasText:'A diagram elmentve.'})).toBeVisible();
  // In use: the server refuses deleting the type.
  const type=(await api(page,'topology','list')).body.data.types.find(t=>t.label===prefix+' szenzor');
  expect((await api(page,'topology','type_delete',type.id)).status).toBe(409);
  await api(page,'topology','delete',created.body.data.id);
 }finally{await cleanup(page);}
});

test('read-only reader views without editing controls',async({page})=>{
 await signIn(page,'reader@example.test');await openTopology(page);
 await page.locator('.blade-diagram-list').getByText('Office network',{exact:true}).click();
 await expect(nodes(page)).toHaveCount(12);
 await expect(page.getByRole('button',{name:'Mentés',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Új elemtípus',exact:true})).toHaveCount(0);
 await expect(page.locator('.blade-diagram-node__handle')).toHaveCount(0);
 expect((await api(page,'topology','create',null,{name:prefix+' tiltott'})).status).toBe(403);
});

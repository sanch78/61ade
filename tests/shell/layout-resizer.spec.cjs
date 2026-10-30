const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {root,lazyBundle}=require('./fixture.cjs');
const preferencesBundle=lazyBundle('export {UiPreferences} from "./packages/frontend/src/UiPreferences";',{globalName:'preferencesFixture'});

for(const type of ['space','wide'])for(const axis of ['x','y']){
 test(`${type} layout ${axis} grip is centered and remains draggable`,async({page})=>{
  await page.setContent('<div id="blade-application"></div>');
  await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});
  await page.addScriptTag({path:path.join(root,'node_modules/@dhtmlx/suite/codebase/suite.min.js')});
  await page.addScriptTag({content:preferencesBundle()});
  await page.evaluate(([type,axis])=>{
   const tree={
    type,
    [axis==='x'?'cols':'rows']:[{id:'first',resizable:true,[axis==='x'?'width':'height']:260},{id:'second'}],
   };
   window.syntheticLayout=new dhx.Layout('blade-application',tree);
   new preferencesFixture.UiPreferences('synthetic',axis).bindLayout(syntheticLayout,tree);
  },[type,axis]);
  const grip=page.locator('.dhx_layout-resizer__icon');
  async function geometry(){
   return page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {first:box(document.querySelector('[data-cell-id="first"]')),second:box(document.querySelector('[data-cell-id="second"]')),grip:box(document.querySelector('.dhx_layout-resizer__icon'))};
   });
  }
  for(const theme of ['light','skyblue','dark']){
   await page.evaluate(theme=>dhx.setTheme(theme),theme);
   const boxes=await geometry();
   const coordinate=axis==='x'?'x':'y',size=axis==='x'?'width':'height';
   const edge=boxes.first[coordinate]+boxes.first[size];
   expect(boxes.second[coordinate]-edge).toBe(12);
   expect(boxes.grip[coordinate]+boxes.grip[size]/2).toBe((edge+boxes.second[coordinate])/2);
  }
  const before=await geometry();
  const x=before.grip.x+before.grip.width/2;
  const y=before.grip.y+before.grip.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+(axis==='x'?60:0),y+(axis==='y'?60:0),{steps:6});await page.mouse.up();
  await expect.poll(async()=>{const after=await geometry();return axis==='x'?after.first.width:after.first.height;}).toBeGreaterThan(300);
  await expect(grip).toHaveCount(1);
  const reset=await geometry();await page.mouse.dblclick(reset.grip.x+reset.grip.width/2,reset.grip.y+reset.grip.height/2);
  await expect.poll(async()=>{const after=await geometry();return axis==='x'?after.first.width:after.first.height;}).toBe(260);
 });
}

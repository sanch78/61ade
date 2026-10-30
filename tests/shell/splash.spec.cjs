const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {signIn}=require('./feature-demo.cjs');
// The trademark loading screen (FB-0089, docs/brand.md#splash): server-rendered on every shell page and played once per
// window or tab (session storage); black, the dark product logo with its parts, the fixed credit; Splash.ts fades it
// out only after its own animation has played (glint and spark end 2.75 s after the start) and removes it. Reduced
// motion keeps the screen without movement. Each case opens a new tab per screen it needs.
const splash=page=>page.locator('#blade-splash');
// Milliseconds from navigation start until the splash leaves the DOM.
const removedAt=page=>page.evaluate(()=>new Promise(resolve=>{
 const check=()=>{if(!document.querySelector('#blade-splash')){resolve(performance.now());return true;}return false;};
 if(!check())new MutationObserver((_,observer)=>{if(check())observer.disconnect();}).observe(document.body,{childList:true});
}));

async function shown(page){
 await expect(splash(page)).toBeVisible();
 await expect(splash(page)).toHaveAttribute('aria-hidden','true');
 expect(await splash(page).evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(0, 0, 0)');
 for(const [part,count] of [['.blade-logo__tile',3],['.blade-logo__glyph',5],['.blade-logo__word',1]])
  await expect(splash(page).locator('svg.blade-splash__image '+part)).toHaveCount(count);
 await expect(splash(page).locator('.blade-splash__credit')).toHaveText('made with 61ade framework');
 // Its own gradient ids, distinct from every inlined shell logo.
 expect(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id^="blade-"]')].map(element=>element.id);return ids.filter(id=>id.startsWith('blade-splash-')).length===10&&new Set(ids).size===ids.length;})).toBe(true);
}

test('the screen plays once per tab: not after signing in or reloading, again in a new tab',async({page,context})=>{
 await page.setViewportSize({width:1280,height:800});
 await page.goto('/');
 await shown(page);
 expect(await removedAt(page)).toBeGreaterThan(2900);
 await expect(page.getByRole('dialog',{name:'Bejelentkezés'})).toBeVisible();
 await signIn(page,'demo@example.test');
 await expect(page.locator('html')).toHaveAttribute('data-blade-page','shell');
 await expect(page.locator('html')).toHaveAttribute('data-blade-splash','seen');
 await expect(splash(page)).toHaveCount(0);
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-blade-splash','seen');
 expect(await removedAt(page)).toBeLessThan(2000);
 // A new tab (or window) of the same signed-in browser plays it once more.
 const other=await context.newPage();
 await other.goto('/');
 await expect(other.locator('html')).toHaveAttribute('data-blade-page','shell');
 await shown(other);
 expect(await removedAt(other)).toBeGreaterThan(2900);
 await other.close();
});

test('reduced motion keeps the screen still and still releases it',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await shown(page);
 expect(await splash(page).locator('.blade-logo__tile, .blade-logo__glyph').evaluateAll(parts=>parts.flatMap(part=>part.getAnimations()).length)).toBe(0);
 await expect(splash(page)).toHaveCount(0,{timeout:5000});
});

test('the screen fits a phone without horizontal scroll, credit on one line',async({context})=>{
 for(const size of [{width:360,height:740},{width:740,height:360}]){
  const page=await context.newPage();
  await page.setViewportSize(size);
  await page.goto('/');
  await shown(page);
  const box=await splash(page).locator('.blade-splash__logo').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x+box.width).toBeLessThanOrEqual(size.width-16);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await splash(page).locator('.blade-splash__credit').evaluate(credit=>credit.getClientRects().length===1&&credit.offsetHeight<parseFloat(getComputedStyle(credit).fontSize)*2)).toBe(true);
  await page.close();
 }
});

// Evidence frames of the timeline (paused animations), desktop and phone, in BLADE_TMP_DIR.
test('timeline frames',async({context})=>{
 for(const [name,size] of [['desktop',{width:1280,height:800}],['phone',{width:390,height:844}]]){
  const page=await context.newPage();
  await page.setViewportSize(size);
  await page.goto('/');
  await shown(page);
  for(const time of [300,550,800,1000,1200,1500,2050,2300,2550]){
   await page.evaluate(time=>document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=time;}),time);
   await page.screenshot({path:path.join(process.env.BLADE_TMP_DIR,`splash-${name}-${time}.png`)});
  }
  await page.close();
 }
});

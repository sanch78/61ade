const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openMenu,openView,view,api}=require('./feature-demo.cjs');
// Toolkit D3 (docs/demos.md#toolkit-consumer): the feature demo module's `demo.readings-dashboard` view (Feature demó →
// Mérési irányítópult: ListView of the readings, Suite Chart from app.dhx, own summary, linked by filter and cursor
// record) and its `demo.reading-bar` presentation on the plain Mérések list (table, cards, details). Read-only: the
// readings resource offers no writes, so nothing is created or cleaned up.
const DASHBOARD='Mérési irányítópult',GROUP='Feature demó';
function watch(page){
 const seen={errors:[],console:[],watches:[]};
 page.on('pageerror',error=>seen.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')seen.console.push(message.text());});
 page.on('request',request=>{try{const data=request.postDataJSON();if(data?.action==='__watch')seen.watches.push(data.values?.subscriptions??[]);}catch{}});
 return seen;
}
const summary=page=>page.locator('[data-demo-readings="summary"]');
const stat=(page,id)=>summary(page).locator(`[data-demo-stat="${id}"] dd`);
const distribution=page=>summary(page).locator('[data-demo-distribution]');
const chart=page=>page.locator('.dhx_chart');
const rows=page=>page.getByRole('grid').getByRole('rowgroup').last().getByRole('row');
// Numbers as the page formats them (Hungarian locale).
const format=(page,value,digits=1)=>page.evaluate(([value,digits])=>new Intl.NumberFormat('hu',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value),[value,digits]);
// A theme variable as the browser resolves it, and whether a chart mark is painted with that colour.
const resolve=(page,variable)=>page.evaluate(variable=>{const probe=document.createElement('span');probe.style.color=`var(${variable})`;document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;},variable);
const painted=(page,color)=>page.evaluate(color=>[...document.querySelectorAll('.dhx_chart svg *')].some(node=>getComputedStyle(node).fill===color),color);
async function openDashboard(page){
 await openMenu(page,DASHBOARD,GROUP);
 await expect(page).toHaveURL(/#view=demo\.readings-dashboard/);
 await expect(summary(page)).toBeVisible();await expect(chart(page).locator('svg').first()).toBeVisible();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}
// The expected summary of a filtered result, from the same list action the ListView uses.
async function expected(page,filters){
 const answer=await api(page,'demo_readings','list',null,{mode:'dynamic',limit:200,filters});
 expect(answer.status).toBe(200);
 const items=answer.body.data.items,values=items.map(item=>Number(item.reading)),bins=new Array(10).fill(0);
 for(const value of values)bins[Math.min(9,Math.max(0,Math.floor(value/10)))]++;
 return {items,matched:answer.body.data.matched,min:Math.min(...values),max:Math.max(...values),average:values.reduce((a,b)=>a+b,0)/values.length,bins};
}
async function theme(page,label){
 await page.getByRole('button',{name:/^(Skyblue|Világos|Éjjeli)$/}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();
}

test('the dashboard opens from the menu and its chart and summary follow the list filter and selection',async({page})=>{
 test.setTimeout(60000);const seen=watch(page);
 await page.setViewportSize({width:1280,height:900});
 await signIn(page);await openDashboard(page);
 // Unfiltered: the bounded loaded window of the full result (1801 synthetic readings).
 const total=await format(page,1801,0);
 await expect(stat(page,'count')).toHaveText(new RegExp(`^\\S+ / ${total.replace(/\s/g,'\\s')}$`));
 await expect(stat(page,'selected')).toHaveText('Nincs kiválasztott sor');
 await expect(distribution(page)).toContainText('Értékeloszlás: 0–10:');
 await expect(distribution(page)).toHaveAttribute('data-demo-selected-bin','-1');
 expect(await painted(page,await resolve(page,'--dhx-color-primary'))).toBe(true);
 // The list's own header filter narrows the list, the summary and the chart's data together.
 const filter=page.getByRole('grid').locator('[data-dhx-id="title"] input');
 await filter.fill('Mérés 000');
 const narrow=await expected(page,{title:'Mérés 000'});
 expect(narrow.items.length).toBe(narrow.matched);expect(narrow.matched).toBeGreaterThan(0);
 await expect(stat(page,'count')).toHaveText(`${narrow.matched} / ${narrow.matched}`);
 await expect(stat(page,'min')).toHaveText(await format(page,narrow.min));
 await expect(stat(page,'max')).toHaveText(await format(page,narrow.max));
 await expect(stat(page,'average')).toHaveText(await format(page,narrow.average));
 for(const [index,count] of narrow.bins.entries())await expect(distribution(page)).toContainText(`${index*10}–${index*10+10}: ${count} sor`);
 // Selecting a row (cursor record) names it in the summary and draws its bin as the chart's second segment.
 const first=rows(page).first(),title=(await first.locator('[data-dhx-col-id="title"]').innerText()).trim();
 const row=narrow.items.find(item=>item.title===title);expect(row).toBeTruthy();
 await first.locator('[data-dhx-col-id="title"]').click();
 await expect(stat(page,'selected')).toContainText(`${title}: ${await format(page,Number(row.reading))}`);
 await expect(stat(page,'selected')).toContainText('átlagtól');
 const bin=Math.min(9,Math.floor(Number(row.reading)/10));
 await expect(distribution(page)).toHaveAttribute('data-demo-selected-bin',String(bin));
 await expect(distribution(page)).toContainText(`Kiválasztott sor: ${bin*10}–${bin*10+10}`);
 await expect.poll(async()=>painted(page,await resolve(page,'--dhx-color-success'))).toBe(true);
 // Clearing the filter brings the full result back; the presentation also renders inside the dashboard's list.
 await filter.fill('');
 await expect(stat(page,'count')).toHaveText(new RegExp(` / ${total.replace(/\s/g,'\\s')}$`));
 await expect(page.locator('.dhx_grid-row [data-dhx-col-id="reading"] .demo-reading-bar').first()).toBeVisible();
 // Only the dashboard's own list is subscribed (polling transport; WebSocket sends no __watch requests).
 for(const subscriptions of seen.watches)expect(subscriptions.filter(item=>item.resource==='demo_readings').length).toBeLessThanOrEqual(1);
 expect(seen.errors).toEqual([]);expect(seen.console.filter(text=>text.includes('61ade'))).toEqual([]);
});

test('the reading-bar presentation renders in the table, the cards and the details of the plain Mérések list',async({page})=>{
 test.setTimeout(60000);const seen=watch(page);
 await page.setViewportSize({width:1280,height:900});
 await signIn(page);await openView(page,'Mérések');
 await expect(page).toHaveURL(/#view=demo_readings/);
 // Table: an inline bar whose width is the value on the 0–100 scale, the escaped number beside it, a text tooltip.
 const cell=rows(page).first().locator('[data-dhx-col-id="reading"]'),bar=cell.locator('.demo-reading-bar--cell');
 await expect(bar).toBeVisible();
 const value=(await bar.locator('.demo-reading-bar__value').innerText()).trim(),number=Number(value.replace(',','.'));
 expect(Number.isFinite(number)).toBe(true);
 expect(await bar.locator('.demo-reading-bar__fill').evaluate(node=>parseFloat(node.style.width))).toBeCloseTo(Math.min(100,number),1);
 await expect(bar).toHaveAttribute('title',`${value} a 100-ból`);
 await expect(bar.locator('.demo-reading-bar__track')).toHaveAttribute('aria-hidden','true');
 expect(await bar.locator('.demo-reading-bar__value').evaluate(node=>node.children.length)).toBe(0);
 // The large list itself is unchanged: server-side sort on the title still works.
 const header=page.getByRole('grid').locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Megnevezés'}).first();
 await header.click();await expect(header).toHaveAttribute('aria-sort','ascending');await expect(rows(page).first()).toContainText('Mérés 0001');
 // Details (double-click): the card size of the same presentation.
 await rows(page).first().locator('[data-dhx-col-id="title"]').dblclick();
 const detail=page.getByRole('dialog',{name:'Rekordadatok',exact:true});
 await expect(detail).toContainText('Mérés 0001');await expect(detail.locator('.demo-reading-bar--card')).toBeVisible();
 await detail.getByRole('button',{name:/close/i}).click();
 // Cards: every card shows the bar.
 await view(page,'Kártyák');
 const card=page.locator('.blade-grid-card').first();
 await expect(card.locator('.demo-reading-bar--card')).toBeVisible();
 await view(page,'Táblázat');
 await expect(page.locator('.dhx_grid-row .demo-reading-bar--cell').first()).toBeVisible();
 expect(seen.errors).toEqual([]);
});

test('the chart and summary follow the theme',async({page})=>{
 test.setTimeout(60000);const seen=watch(page);
 await page.setViewportSize({width:1280,height:900});
 await signIn(page);await openDashboard(page);
 for(const [label,name] of [['Éjjeli','dark'],['Világos','light'],['Skyblue','skyblue']]){
  await theme(page,label);
  await expect(page.locator('html')).toHaveAttribute('data-dhx-theme',name);
  const primary=await resolve(page,'--dhx-color-primary');
  await expect.poll(()=>painted(page,primary)).toBe(true);
  expect(await summary(page).evaluate(node=>getComputedStyle(node).color)).toBe(await resolve(page,'--dhx-font-color-primary'));
  expect(await page.locator('.demo-reading-bar__fill').first().evaluate(node=>getComputedStyle(node).backgroundColor)).toBe(primary);
 }
 expect(seen.errors).toEqual([]);
});

test('on a phone the dashboard stacks summary, chart and cards, and rebuilds at the desktop breakpoint',async({page})=>{
 test.setTimeout(60000);const seen=watch(page);
 await page.setViewportSize({width:390,height:844});
 await signIn(page);await openDashboard(page);
 await expect(summary(page)).toHaveClass(/demo-readings-summary--narrow/);
 await expect(page.locator('.blade-grid-card').first()).toBeVisible();
 await expect(page.locator('.blade-grid-card .demo-reading-bar--card').first()).toBeVisible();
 const boxes=await Promise.all([summary(page),chart(page),page.locator('.blade-grid-card').first()].map(locator=>locator.boundingBox()));
 expect(boxes[0].y).toBeLessThan(boxes[1].y);expect(boxes[1].y).toBeLessThan(boxes[2].y);
 for(const box of boxes)expect(box.x+box.width).toBeLessThanOrEqual(390+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 // Crossing the breakpoint rebuilds the page once: summary beside the chart, one chart and one list.
 await page.setViewportSize({width:1280,height:900});
 await expect(summary(page)).not.toHaveClass(/demo-readings-summary--narrow/);
 await expect(chart(page)).toHaveCount(1);await expect(summary(page)).toHaveCount(1);
 const [left,right]=await Promise.all([summary(page).boundingBox(),chart(page).boundingBox()]);
 expect(left.x+left.width).toBeLessThanOrEqual(right.x+1);
 expect(seen.errors).toEqual([]);
});

test('navigating away destroys the dashboard: no chart, summary, listener or extra subscription is left',async({page})=>{
 test.setTimeout(60000);const seen=watch(page);
 await page.setViewportSize({width:1280,height:900});
 await signIn(page);await openDashboard(page);
 await openView(page,'Mérések');
 await expect(page).toHaveURL(/#view=demo_readings/);
 await expect(chart(page)).toHaveCount(0);await expect(summary(page)).toHaveCount(0);
 await expect(page.getByRole('grid')).toHaveCount(1);
 // A theme switch and a breakpoint crossing reach no listener of the closed dashboard (it would rebuild or throw).
 const after=seen.watches.length;
 await theme(page,'Éjjeli');await expect(page.locator('html')).toHaveAttribute('data-dhx-theme','dark');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
 await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(500);
 await expect(chart(page)).toHaveCount(0);await expect(summary(page)).toHaveCount(0);
 for(const subscriptions of seen.watches.slice(after))expect(subscriptions.filter(item=>item.resource==='demo_readings').length).toBeLessThanOrEqual(1);
 await theme(page,'Skyblue');
 expect(seen.errors).toEqual([]);expect(seen.console.filter(text=>text.includes('61ade'))).toEqual([]);
});

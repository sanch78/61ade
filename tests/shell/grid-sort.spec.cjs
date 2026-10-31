const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView}=require('./feature-demo.cjs');
// Feature demo → Mérések: 1801 read-only rows whose insertion order differs from the title order.
test('SQL sorting and virtual scrolling share the full result set',async({page})=>{
 test.setTimeout(60000);const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{try{const d=r.postDataJSON();if(d?.action==='list'&&d.values?.mode==='dynamic')requests.push(d.values);}catch{}});
 await signIn(page);await openView(page,'Mérések');
 const grid=page.getByRole('grid'),header=grid.locator('[role="columnheader"][data-dhx-id="title"]').filter({hasText:'Megnevezés'}).first(),rows=grid.getByRole('rowgroup').last().getByRole('row');
 expect(requests.at(-1).filters).toEqual({});
 await expect(header).not.toHaveClass(/blade-grid-editable/);
 await header.click();await expect(header).toHaveAttribute('aria-sort','ascending');
 await expect(rows.first()).toContainText('Reading 0001');await expect(rows.nth(1)).toContainText('Reading 0002');
 await header.click();await expect(header).toHaveAttribute('aria-sort','descending');
 await expect(rows.first()).toContainText('Reading 1801');
 expect(requests.at(-1).sort).toEqual({field:'title',direction:'desc'});
 await rows.first().locator('[data-dhx-col-id="title"]').dblclick();
 const detail=page.getByRole('dialog',{name:'Rekordadatok',exact:true});await expect(detail).toContainText('Reading 1801');
 await detail.getByRole('button',{name:/close/i}).click();
 const sorted=requests.length;
 for(let i=0;i<8;i++){
  const before=requests.length;await grid.hover();await page.mouse.wheel(0,30000);await expect.poll(()=>requests.length).toBeGreaterThan(before);await page.waitForTimeout(150);
 }
 // The client keeps a bounded window of the result, never the whole list.
 // DHTMLX counts the two grid header rows (filter + title) in aria-rowcount.
 expect(Number(await grid.getAttribute('aria-rowcount'))-2).toBeLessThanOrEqual(600);
 expect(Number(await grid.getAttribute('aria-rowcount'))-2).toBeGreaterThan(100);
 expect(await rows.count()).toBeLessThan(100);
 const before=requests.length;await page.mouse.wheel(0,-30000);await expect.poll(()=>requests.length).toBeGreaterThan(before);
 expect(requests.slice(sorted).every(r=>r.sort.field==='title'&&r.sort.direction==='desc'&&typeof r.cursor==='string')).toBe(true);
 const filter=grid.locator('[data-dhx-id="title"] input');await expect(filter).toHaveValue('');await filter.fill('Reading 000');
 await expect.poll(()=>requests.at(-1)?.filters?.title).toBe('Reading 000');
 await expect(rows.first()).toContainText('Reading 0009');
 expect(errors).toEqual([]);
});

test('select header filters send canonical option keys',async({page})=>{
 const requests=[];page.on('request',request=>{try{const data=request.postDataJSON();if(data?.action==='list'&&data.values?.mode==='dynamic')requests.push(data.values);}catch{}});
 await signIn(page);await openView(page,'Feladatok');
 const grid=page.getByRole('grid'),status=grid.locator('[data-dhx-id="status"]').filter({has:page.locator('input')}).first();
 await status.locator('input').click();await page.locator('.dhx_popup-content').getByText('Kész',{exact:true}).click();
 await expect.poll(()=>requests.at(-1)?.filters?.status).toBe('done');
 await expect(status.locator('input')).toHaveValue('Kész');
 await status.locator('input').click();await expect(page.locator('.dhx_popup-content').getByText('Folyamatban',{exact:true})).toBeVisible();
 await page.locator('.dhx_popup-content').getByText('Folyamatban',{exact:true}).click();
 await expect.poll(()=>requests.at(-1)?.filters?.status).toBe('progress');
 await expect(status.locator('input')).toHaveValue('Folyamatban');
 // The leading "Mind" item clears the option filter.
 await status.locator('input').click();await page.locator('.dhx_popup-content').getByText('Mind',{exact:true}).click();
 await expect.poll(()=>requests.at(-1)?.filters?.status).toBeUndefined();
 await expect(status.locator('input')).toHaveValue('');
});

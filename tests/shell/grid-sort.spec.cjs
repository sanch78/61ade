const {test,expect}=require('../../tools/playwright-test.cjs');
test('editable headers, SQL sorting and virtual scrolling share the full result set',async({page})=>{
 test.setTimeout(60000);const errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{try{const d=r.postDataJSON();if(d?.action==='list'&&d.values?.mode==='dynamic')requests.push(d.values);}catch{}});
 await page.goto('/');await page.getByLabel('Felhasználónév',{exact:true}).fill('synthetic');await page.getByLabel('Jelszó',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Bejelentkezés',exact:true}).click();await page.getByRole('menuitem',{name:'Items',exact:true}).click();
 const grid=page.getByRole('grid'),header=grid.locator('[role="columnheader"][data-dhx-id="title"]');
 await expect(header).toHaveClass(/vapa-grid-editable/);await expect(header).toHaveAttribute('aria-description','Szerkeszthető mező');
 expect(await header.locator('.dhx_grid-header-cell-text').evaluate(e=>getComputedStyle(e,'::after').content)).toContain('✎');
 await expect(grid.locator('[role="columnheader"][data-dhx-id="archived"]')).not.toHaveClass(/vapa-grid-editable/);
 await page.screenshot({path:require('node:path').join(process.env.VAPA_TMP_DIR || 'codex/tmp','grid-header-sort.png')});
 await header.click();await expect(header).toHaveAttribute('aria-sort','ascending');
 await expect(grid.getByRole('rowgroup').last().getByRole('row').first()).toContainText('Item 0001');
 await expect(grid.getByRole('rowgroup').last().getByRole('row').nth(1)).toContainText('Item 0002');
 await header.click();await expect(header).toHaveAttribute('aria-sort','descending');
 await expect(grid.getByRole('rowgroup').last().getByRole('row').first()).toContainText('Item 1801');
 expect(requests.at(-1).sort).toEqual({field:'title',direction:'desc'});
 for(let i=0;i<8;i++){
  const before=requests.length;await grid.hover();await page.mouse.wheel(0,30000);await expect.poll(()=>requests.length).toBeGreaterThan(before);await page.waitForTimeout(150);
 }
 expect(Number(await grid.getAttribute('aria-rowcount'))-1).toBeLessThanOrEqual(600);
 expect(Number(await grid.getAttribute('aria-rowcount'))-1).toBeGreaterThan(100);
 expect(await grid.getByRole('rowgroup').last().getByRole('row').count()).toBeLessThan(100);
 const before=requests.length;await page.mouse.wheel(0,-30000);await expect.poll(()=>requests.length).toBeGreaterThan(before);
 expect(requests.slice(3).every(r=>r.sort.field==='title'&&r.sort.direction==='desc'&&typeof r.cursor==='string')).toBe(true);
 const filter=page.getByLabel('Title',{exact:true});await filter.fill('Item 000');await page.getByRole('button',{name:'Szűrés',exact:true}).click();await expect(grid.getByRole('rowgroup').last().getByRole('row').first()).toContainText('Item 0009');
 expect(errors).toEqual([]);
});

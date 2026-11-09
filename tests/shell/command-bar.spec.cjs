const {test,expect}=require('../../tools/playwright-test.cjs');
const {runtime,fixture,start,contrast,errors,build,teardown,log,panel}=require('./view-controls.cjs');
// CommandBar view controls (docs/toolkit.md#commandbar-view-controls): two bars with the same ids above and below a
// viewer, wide and collapsed.
test.describe.configure({mode:'serial'});

test('CommandBar: toggles, selects, segmented choices, groups and ranges in two bars with the same ids',async({page})=>{
 const failures=errors(page);
 await start(page);await build(page);
 const top=page.locator('#vc [data-cell-id="top"]'),bottom=page.locator('#vc [data-cell-id="bottom"]');
 await expect(top.locator('[role="toolbar"], .dhx_toolbar').first()).toBeVisible();
 expect(await page.evaluate(()=>[...document.querySelectorAll('#vc [aria-label="Nézet eszközei"], #vc [aria-label="Lejátszás"]')].map(e=>e.getAttribute('aria-label')))).toContain('Nézet eszközei');
 // Toggle: aria-pressed, `toggle` with the new state, no `click`.
 const loop=top.getByRole('button',{name:'Ismétlés'});
 await expect(loop).toHaveAttribute('aria-pressed','true');
 await loop.click();
 await expect(loop).toHaveAttribute('aria-pressed','false');
 expect(await log(page)).toEqual([['top','toggle','loop',false]]);
 await page.mouse.move(5,5);await loop.blur();
 const pressed=await top.getByRole('button',{name:'Ismétlés'}).evaluate(e=>getComputedStyle(e).boxShadow);
 await page.evaluate(()=>window.__vc.top.update('loop',{pressed:true}));
 await expect(loop).toHaveAttribute('aria-pressed','true');
 expect(await loop.evaluate(e=>getComputedStyle(e).boxShadow)).not.toBe(pressed);
 const measured=await contrast(page,{pressed:'#vc [data-cell-id="top"] .dhx_toolbar-button[aria-pressed="true"] .dhx_toolbar-button__text',value:'#vc .blade-command-range__value'});
 for(const [name,value] of Object.entries(measured))expect(value,`${name} contrast`).toBeGreaterThanOrEqual(4.5);
 expect(await log(page)).toEqual([]);
 // The other bar's `loop` is its own.
 const play=bottom.getByRole('button',{name:'Lejátszás'});
 await expect(play).toHaveAttribute('aria-pressed','false');
 await play.click();expect(await log(page)).toEqual([['bottom','toggle','loop',true]]);
 await expect(loop).toHaveAttribute('aria-pressed','true');
 // Group: plain buttons reporting `click`.
 await top.getByRole('button',{name:'Nagyít'}).click();
 expect(await log(page)).toEqual([['top','click','zoomIn',undefined]]);
 // Select: a menu of checked entries; the caption follows.
 await top.getByRole('button',{name:'Sebesség: 1×'}).click();
 await expect(page.getByRole('menuitemradio',{name:'1×'})).toHaveAttribute('aria-checked','true');
 await page.getByRole('menuitemradio',{name:'4×'}).click();
 expect(await log(page)).toEqual([['top','change','speed','4']]);
 await expect(top.getByRole('button',{name:'Sebesség: 4×'})).toBeVisible();
 expect(await page.evaluate(()=>[window.__vc.top.value('speed'),window.__vc.bottom.value('speed')])).toEqual(['4','1']);
 // New options from code: the value stays while offered, else the first; the menu lists the new ones.
 await page.evaluate(()=>window.__vc.top.update('speed',{options:[{value:'4',label:'4×'},{value:'8',label:'8×'}]}));
 await top.getByRole('button',{name:'Sebesség: 4×'}).click();
 await expect(page.getByRole('menuitemradio')).toHaveText(['4×','8×']);
 await page.keyboard.press('Escape');
 await page.evaluate(()=>window.__vc.top.update('speed',{options:[{value:'1',label:'1×'},{value:'2',label:'2×'}]}));
 await expect(top.getByRole('button',{name:'Sebesség: 1×'})).toBeVisible();
 expect(await log(page)).toEqual([]);
 // Segmented: pressed buttons; a click on the chosen one reports nothing.
 await expect(top.getByRole('button',{name:'Kettő'})).toHaveAttribute('aria-pressed','true');
 await top.getByRole('button',{name:'Egy'}).click();
 await expect(top.getByRole('button',{name:'Egy'})).toHaveAttribute('aria-pressed','true');
 await expect(top.getByRole('button',{name:'Kettő'})).toHaveAttribute('aria-pressed','false');
 await top.getByRole('button',{name:'Egy'}).click();
 await expect(top.getByRole('button',{name:'Egy'})).toHaveAttribute('aria-pressed','true');
 expect(await log(page)).toEqual([['top','change','view','one']]);
 await page.evaluate(()=>window.__vc.top.update('view',{disabled:true}));
 await expect(top.getByRole('button',{name:'Egy'})).toHaveAttribute('aria-disabled','true');
 await page.evaluate(()=>window.__vc.top.update('view',{disabled:false,hidden:true}));
 await expect(top.getByRole('button',{name:'Egy'})).toHaveCount(0);
 await page.evaluate(()=>window.__vc.top.update('view',{hidden:false}));
 await expect(top.getByRole('button',{name:'Egy'})).toHaveAttribute('aria-pressed','true');
 // Range: a native slider with its value text; keys step it and stay in the input.
 const position=bottom.getByRole('slider',{name:'Pozíció'});
 await expect(position).toHaveAttribute('aria-valuetext','0:30');
 await position.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
 await expect(position).toBeFocused();
 await expect(position).toHaveAttribute('aria-valuetext','0:32');
 await expect(bottom.locator('.blade-command-range__value')).toHaveText('0:32');
 const keyed=await log(page);expect(keyed.at(-1)).toEqual(['bottom','change','position',32]);
 // update from code: value and bounds, no event; a redraw keeps the value.
 await page.evaluate(()=>{window.__vc.bottom.update('position',{value:90,max:300});window.__vc.bottom.update('loop',{label:'Szünet'});});
 await expect(position).toHaveValue('90');await expect(position).toHaveAttribute('max','300');
 await expect(bottom.getByRole('button',{name:'Szünet'})).toBeVisible();
 await expect(position).toHaveValue('90');
 expect(await log(page)).toEqual([]);
 expect(await page.evaluate(()=>{try{new window.__bladeApp.components.CommandBar({items:[{type:'select',id:'x',label:'X',options:[{value:'a',label:'A'}]}]});return 'no error';}catch(error){return error.constructor.name;}})).toBe('TypeError');
 // Escape closes an open menu of either bar.
 await bottom.getByRole('button',{name:'Sebesség: 1×'}).click();
 await expect(page.getByRole('menuitemradio',{name:'2×'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('menuitemradio',{name:'2×'})).toHaveCount(0);
 await teardown(page);
 expect(failures).toEqual([]);
});

test('CommandBar collapsed at 390 px: toggles are checked entries, choices submenus, the range stays in the bar',async({page})=>{
 const failures=errors(page);
 await start(page,{width:390,height:844});await build(page);
 const top=page.locator('#vc [data-cell-id="top"]'),bottom=page.locator('#vc [data-cell-id="bottom"]');
 await expect(top.getByRole('button',{name:'Műveletek'})).toBeVisible();
 await expect(bottom.getByRole('button',{name:'Műveletek'})).toBeVisible();
 // The range keeps its place beside the bar's menu and its width.
 const position=bottom.getByRole('slider',{name:'Pozíció'});
 await expect(position).toBeVisible();
 expect((await position.boundingBox()).width).toBeGreaterThanOrEqual(100);
 await top.getByRole('button',{name:'Műveletek'}).click();
 const loop=page.getByRole('menuitemcheckbox',{name:'Ismétlés'});
 await expect(loop).toHaveAttribute('aria-checked','true');
 await loop.click();
 expect(await log(page)).toEqual([['top','toggle','loop',false]]);
 await top.getByRole('button',{name:'Műveletek'}).click();
 await expect(page.getByRole('menuitemcheckbox',{name:'Ismétlés'})).toHaveAttribute('aria-checked','false');
 await page.getByRole('menuitem',{name:'Sebesség: 1×'}).click();
 await page.getByRole('menuitemradio',{name:'2×'}).click();
 expect(await log(page)).toEqual([['top','change','speed','2']]);
 await top.getByRole('button',{name:'Műveletek'}).click();
 await page.getByRole('menuitem',{name:'Nézet: Kettő'}).click();
 await expect(page.getByRole('menuitemradio',{name:'Kettő'})).toHaveAttribute('aria-checked','true');
 await page.getByRole('menuitemradio',{name:'Egy'}).click();
 expect(await log(page)).toEqual([['top','change','view','one']]);
 // Grouped buttons stay usable entries; the menus of the two bars are separate.
 await top.getByRole('button',{name:'Műveletek'}).click();
 await page.getByRole('menuitem',{name:'Kicsinyít'}).click();
 expect(await log(page)).toEqual([['top','click','zoomOut',undefined]]);
 await bottom.getByRole('button',{name:'Műveletek'}).click();
 await expect(page.getByRole('menuitemcheckbox',{name:'Lejátszás'})).toBeVisible();
 await expect(page.getByRole('menuitemcheckbox',{name:'Ismétlés'})).toHaveCount(0);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('menuitemcheckbox',{name:'Lejátszás'})).toHaveCount(0);
 await expect(bottom.getByRole('button',{name:'Műveletek'})).toBeFocused();
 // Back on a wide screen the state is the one chosen in the menus.
 await page.setViewportSize({width:1366,height:900});
 await expect(top.getByRole('button',{name:'Ismétlés'})).toHaveAttribute('aria-pressed','false');
 await expect(top.getByRole('button',{name:'Egy'})).toHaveAttribute('aria-pressed','true');
 await expect(top.getByRole('button',{name:'Sebesség: 2×'})).toBeVisible();
 await teardown(page);
 expect(failures).toEqual([]);
});

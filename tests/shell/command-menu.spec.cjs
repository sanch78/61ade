const {test,expect}=require('../../tools/playwright-test.cjs');
const {start,errors}=require('./view-controls.cjs');
// CommandBar menu item (docs/toolkit.md#commandbar-menu, FB-0154): one *more actions* button holding the commands of
// the selected item; in the bar a menu button, in the collapsed `Műveletek` menu a submenu; `click {id}` per entry,
// `update` of the entries also while collapsed, Escape closing and returning the focus, the definition checks.
test.describe.configure({mode:'serial'});
const build=page=>page.evaluate(()=>{
 const app=window.__bladeApp,host=document.createElement('div');host.id='cm';host.style.cssText='position:fixed;left:0;right:0;top:0;height:120px;z-index:10000;background:var(--dhx-background-primary)';document.body.append(host);
 const log=[];
 const bar=new app.components.CommandBar({label:'Munka eszközei',items:[
  {id:'back',label:'Vissza',icon:'dxi dxi-arrow-left'},{type:'spacer'},
  {type:'menu',id:'more',label:'További műveletek',icon:'dxi dxi-dots-vertical',iconOnly:true,items:[
   {id:'sent',label:'Elküldött tartalom',icon:'dxi dxi-eye'},{id:'withdraw',label:'Visszavonás',icon:'dxi dxi-undo',disabled:true},{type:'separator'},{id:'continue',label:'Folytatás innen'}]}]});
 for(const event of ['click','toggle','change'])bar.on(event,e=>log.push([event,e.id]));
 bar.mount(host);
 const message=items=>{try{new app.components.CommandBar({items}).destroy();return 'ok';}catch(error){return `${error.name}: ${error.message}`;}};
 const menu=items=>[{type:'menu',id:'m',label:'M',items}];
 window.__cm={bar,log,checks:[message(menu([])),message(menu([{type:'separator'}])),message(menu([{type:'toggle',id:'t',label:'T'}])),
  message(menu(Array.from({length:13},(_,i)=>({id:'b'+i,label:'B'+i})))),message([{id:'x',label:'X'},...menu([{id:'x',label:'Y'}])]),message([{type:'menu',id:'m',items:[{id:'a',label:'A'}]}])]};
});
const log=page=>page.evaluate(()=>window.__cm.log.splice(0));
const teardown=page=>page.evaluate(()=>{window.__cm.bar.destroy();document.getElementById('cm').remove();window.__cm=undefined;});

test('wide: a menu button whose entries report click, update and Escape; the definition checks',async({page})=>{
 const failures=errors(page);
 await start(page);await build(page);
 expect(await page.evaluate(()=>window.__cm.checks)).toEqual([
  'TypeError: 61ade: a command menu holds 1–12 buttons and separators, at least one button.',
  'TypeError: 61ade: a command menu holds 1–12 buttons and separators, at least one button.',
  'TypeError: 61ade: a command menu holds 1–12 buttons and separators, at least one button.',
  'TypeError: 61ade: a command menu holds 1–12 buttons and separators, at least one button.',
  'TypeError: 61ade: invalid or duplicate command id "x".',
  'TypeError: 61ade: command "m" needs a label.']);
 const bar=page.locator('#cm');
 const more=bar.getByRole('button',{name:'További műveletek'});
 await expect(more).toBeVisible();
 await expect(bar.getByRole('button',{name:'Elküldött tartalom'})).toHaveCount(0);
 await more.click();
 await expect(page.getByRole('menu',{name:'További műveletek'}).getByRole('menuitem')).toHaveText(['Elküldött tartalom','Visszavonás','Folytatás innen']);
 await expect(page.getByRole('menuitem',{name:'Visszavonás'})).toBeDisabled();
 await page.getByRole('menuitem',{name:'Elküldött tartalom'}).click();
 expect(await log(page)).toEqual([['click','sent']]);
 // Escape closes the open menu and returns the focus to its button.
 await more.click();
 await expect(page.getByRole('menuitem',{name:'Folytatás innen'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('menuitem',{name:'Folytatás innen'})).toHaveCount(0);
 await expect(more).toBeFocused();
 // Entries change from code: enabled with a new label, one hidden; the menu button's own label.
 await page.evaluate(()=>{const b=window.__cm.bar;b.update('withdraw',{disabled:false,label:'Visszavonás most'});b.update('continue',{hidden:true});b.update('more',{label:'Több művelet'});});
 const renamed=bar.getByRole('button',{name:'Több művelet'});
 await renamed.click();
 await expect(page.getByRole('menuitem',{name:'Folytatás innen'})).toHaveCount(0);
 await page.getByRole('menuitem',{name:'Visszavonás most'}).click();
 expect(await log(page)).toEqual([['click','withdraw']]);
 // The keyboard: Enter opens it, the arrows move, Enter runs the entry.
 await renamed.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('menuitem',{name:'Elküldött tartalom'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(renamed).toBeFocused();
 await teardown(page);
 expect(failures).toEqual([]);
});

test('collapsed at 390 px: a submenu of Műveletek; update while collapsed; Escape returns to Műveletek',async({page})=>{
 const failures=errors(page);
 await start(page,{width:390,height:844});await build(page);
 const bar=page.locator('#cm'),actions=bar.getByRole('button',{name:'Műveletek'});
 await expect(actions).toBeVisible();
 await page.evaluate(()=>window.__cm.bar.update('withdraw',{disabled:false}));
 await actions.click();
 await page.getByRole('menuitem',{name:'További műveletek'}).click();
 await expect(page.getByRole('menuitem',{name:'Visszavonás'})).not.toHaveAttribute('aria-disabled','true');
 await page.getByRole('menuitem',{name:'Visszavonás'}).click();
 expect(await log(page)).toEqual([['click','withdraw']]);
 await page.evaluate(()=>window.__cm.bar.update('sent',{hidden:true}));
 await actions.click();
 await page.getByRole('menuitem',{name:'További műveletek'}).click();
 await expect(page.getByRole('menuitem',{name:'Elküldött tartalom'})).toHaveCount(0);
 await expect(page.getByRole('menuitem',{name:'Folytatás innen'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('menuitem',{name:'Folytatás innen'})).toHaveCount(0);
 await expect(actions).toBeFocused();
 await teardown(page);
 expect(failures).toEqual([]);
});

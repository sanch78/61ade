const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn}=require('./feature-demo.cjs');
// Temporary: calendar screenshots per theme (not committed).
for(const theme of ['blade','blade-night','light','dark'])test('shot '+theme,async({page})=>{
 await page.addInitScript(t=>{try{localStorage.setItem('blade-theme',t);}catch{}},theme);
 await page.setViewportSize({width:1400,height:900});await signIn(page,'demo@example.test');
 const burger=page.getByRole('menuitem',{name:/^(Menü|Menu)$/}),group=page.getByRole('menuitem',{name:'Digitális kijelző',exact:true});
 await expect(burger.or(group).first()).toBeVisible();if(await burger.isVisible())await burger.click();
 await group.click();await page.getByRole('menuitem',{name:'Műsorterv',exact:true}).click();
 await expect(page.locator('.blade-calendar .dhx_cal_data')).toBeVisible();await page.waitForTimeout(800);
 await page.screenshot({path:`tmp/shots/${theme}-week.png`});
 await page.locator('.dhx_cal_tab[data-tab="month"]').click();await page.waitForTimeout(500);
 await page.screenshot({path:`tmp/shots/${theme}-month.png`});
 await page.locator('.dhx_cal_tab[data-tab="day"]').click();await page.waitForTimeout(500);
 await page.screenshot({path:`tmp/shots/${theme}-day.png`});
});

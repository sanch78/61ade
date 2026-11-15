const {test,expect}=require('../../tools/playwright-test.cjs');
const {signIn,openView,command,api}=require('./feature-demo.cjs');
// TextDiff (docs/toolkit.md#textdiff) through the feature demo's D10 `Szövegváltozatok` (docs/demos.md#d10-text-revisions):
// the project command `demo.text-diff` compares a revision of the ~60 000-character handbook with the one before it.
// Read-only: the spec creates no records.
test.describe.configure({mode:'serial'});

const diff=page=>page.getByRole('dialog').locator('.blade-diff');
// Page errors, console errors (a ResizeObserver loop too) and the registries' fallback reports must stay empty.
function watch(page){
 const seen=[];
 page.on('pageerror',error=>seen.push(error.message));
 page.on('console',message=>{if(message.type()==='error'||/61ade: unknown command|demo\.text-diff/.test(message.text()))seen.push(message.text());});
 return seen;
}
// A revision by its change description (unique in the seed), in the table or as a card.
async function open(page,note){
 await page.locator('.dhx_grid-row, .blade-grid-card').filter({hasText:note}).first().click();
 const started=Date.now();
 await command(page,'Különbség');
 await expect(diff(page).locator('.blade-diff__change').first()).toBeVisible();
 return Date.now()-started;
}
const overflow=locator=>locator.evaluate(element=>element.scrollWidth-element.clientWidth);
const pageOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);

test('1366 px: a small change in a long text is folded, marked by sign and words, navigable and side by side',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:900});await signIn(page);await openView(page,'Szövegváltozatok');
 const elapsed=await open(page,'Automatikus javítás: három szó');
 // Three reads (previous, two gets) and the comparison of two ~60 000-character texts.
 expect(elapsed).toBeLessThan(3000);
 const dialog=page.getByRole('dialog'),body=diff(page);
 await expect(dialog).toContainText('Különbség:');await expect(dialog).toContainText('1. változat → 2. változat (+3 −3)');
 // Summary as text and as a sentence; three changes; the unchanged stretches folded (lead, two between, tail).
 await expect(body.locator('.blade-diff__summary')).toContainText('+3 −3');
 await expect(body.locator('.blade-diff__summary .blade-visually-hidden')).toHaveText('Hozzáadott sorok: 3, törölt sorok: 3');
 await expect(body.locator('.blade-diff__change')).toHaveCount(3);
 const folds=body.locator('.blade-diff__fold');await expect(folds).toHaveCount(4);
 const shown=await body.locator('.blade-diff__line').count();expect(shown).toBeLessThan(40);
 // Not colour alone: the sign and a hidden prefix per changed line; word highlights inside the paired lines.
 const removed=body.locator('.blade-diff__line[data-kind="removed"]').first();
 await expect(removed.locator('.blade-diff__sign')).toHaveText('−');await expect(removed.locator('.blade-visually-hidden')).toHaveText('Törölve: ');
 await expect(body.locator('.blade-diff__line[data-kind="added"]').first().locator('.blade-diff__sign')).toHaveText('+');
 await expect(body.locator('del.blade-diff__word')).toHaveCount(3);await expect(body.locator('ins.blade-diff__word')).toHaveCount(3);
 await expect(body.locator('ins.blade-diff__word').first()).toHaveText('pontosított');
 // Keyboard: the region has the focus; n / F7 next, p / Shift+F7 previous; the focused change names itself.
 await expect(body).toBeFocused();
 const current=()=>page.evaluate(()=>document.activeElement?.getAttribute('aria-label'));
 await page.keyboard.press('n');expect(await current()).toBe('Változás 1 / 3 (Hozzáadott sorok: 1, törölt sorok: 1)');
 await page.keyboard.press('F7');await page.keyboard.press('n');expect(await current()).toMatch(/^Változás 3 \/ 3/);
 const previous=dialog.getByRole('button',{name:'Előző változás',exact:true}),next=dialog.getByRole('button',{name:'Következő változás',exact:true});
 await expect(next).toBeDisabled();
 await page.keyboard.press('Shift+F7');expect(await current()).toMatch(/^Változás 2 \/ 3/);
 await page.keyboard.press('p');await expect(previous).toBeDisabled();
 await next.click();expect(await current()).toMatch(/^Változás 2 \/ 3/);
 // A fold opens in place: its lines appear and take the focus; the others stay folded.
 const label=await folds.nth(1).textContent();const hidden=Number(label.match(/\d+/)[0]);
 await folds.nth(1).click();
 await expect(folds).toHaveCount(3);
 await expect(body.locator('.blade-diff__line')).toHaveCount(shown+hidden);
 const revealed=body.locator('[data-revealed]');
 await expect(revealed).toBeFocused();await expect(revealed).toHaveAttribute('role','group');
 await expect(revealed).toHaveAttribute('aria-label',`${hidden+6} változatlan sor`);
 expect(await revealed.evaluate(element=>getComputedStyle(element).outlineStyle)).toBe('solid');
 // Side by side in the wide window: the two revisions as column headings, removed beside added.
 const split=dialog.getByRole('button',{name:'Egymás mellett',exact:true});
 await expect(split).toBeVisible();await expect(split).toHaveAttribute('aria-pressed','false');
 await split.click();
 await expect(body).toHaveClass(/blade-diff--split/);
 await expect(body.locator('.blade-diff__heads')).toHaveText('1. változat2. változat');
 const row=body.locator('.blade-diff__change').first().locator('.blade-diff__row').first();
 await expect(row.locator('[data-kind="removed"]')).toHaveCount(1);await expect(row.locator('[data-kind="added"]')).toHaveCount(1);
 await expect(folds).toHaveCount(3);
 expect(await overflow(body)).toBeLessThanOrEqual(0);
 // The region narrowed below 720 px returns to the unified view; the focus stays on the current change.
 await body.locator('.blade-diff__change').nth(1).focus();
 await body.evaluate(element=>{element.style.width='600px';});
 await expect(body).not.toHaveClass(/blade-diff--split/);await expect(split).toBeHidden();
 expect(await current()).toMatch(/^Változás 2 \/ 3/);
 await body.evaluate(element=>{element.style.width='';});await expect(body).toHaveClass(/blade-diff--split/);
 expect(await current()).toMatch(/^Változás 2 \/ 3/);
 // Expand all: no fold is left and the command is spent.
 await dialog.getByRole('button',{name:'Összes sor kibontása',exact:true}).click();
 await expect(folds).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Összes sor kibontása',exact:true})).toBeDisabled();
 expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
 expect(seen).toEqual([]);
});

test('390 px: the unified view needs no horizontal scroll, the change buttons stay in the bar, no side by side',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:390,height:844});await signIn(page);await openView(page,'Szövegváltozatok');
 await open(page,'Fejezetcím átnevezése, záró megjegyzés');
 const dialog=page.getByRole('dialog'),body=diff(page);
 await expect(body.locator('.blade-diff__summary')).toContainText('+2 −1');
 await expect(body.locator('.blade-diff__change')).toHaveCount(2);
 await expect(body).not.toHaveClass(/blade-diff--split/);
 // Pinned next/previous beside the collapsed menu; side by side is not offered at this width.
 const next=dialog.getByRole('button',{name:'Következő változás',exact:true});await expect(next).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Egymás mellett',exact:true})).toBeHidden();
 const menu=dialog.getByRole('button',{name:'Műveletek',exact:true});
 if(await menu.isVisible()){await menu.click();await expect(page.getByRole('menuitem',{name:'Egymás mellett',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');}
 await next.click();
 await expect(body.locator('.blade-diff__change').first()).toBeFocused();
 // Long lines wrap: neither the region nor the page scrolls sideways, also with every line shown.
 expect(await overflow(body)).toBeLessThanOrEqual(0);expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
 await body.locator('.blade-diff__fold').first().click();
 expect(await overflow(body)).toBeLessThanOrEqual(0);expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
 expect(seen).toEqual([]);
});

test('the first revision has nothing to compare; the project action names the previous revision only',async({page})=>{
 await page.setViewportSize({width:1366,height:900});await signIn(page);await openView(page,'Szövegváltozatok');
 await page.locator('.dhx_grid-row').filter({hasText:'Felhasználói kézikönyv'}).filter({hasText:'Első változat'}).click();
 await command(page,'Különbség');
 await expect(page.locator('.blade-toast').filter({hasText:'Ez a dokumentum első változata: nincs mivel összevetni.'})).toBeVisible();
 await expect(page.getByRole('dialog').locator('.blade-diff')).toHaveCount(0);
 const ids=await page.evaluate(()=>[...document.querySelectorAll('.dhx_grid-row')].map(row=>row.getAttribute('data-dhx-id'))).then(ids=>ids.sort((a,b)=>a-b));
 const answers=await Promise.all(ids.map(id=>api(page,'demo_text_revisions','previous',id)));
 // Oldest first (the seed: four handbook, then three letter revisions): each document's first revision has none, every
 // later one names the revision before it in the same document.
 expect(answers.map(answer=>answer.body.data.previous)).toEqual([null,ids[0],ids[1],ids[2],null,ids[4],ids[5]]);
});

test('the read-only account compares too',async({page})=>{
 const seen=watch(page);
 await page.setViewportSize({width:1366,height:900});await signIn(page,'reader@example.test');await openView(page,'Szövegváltozatok');
 await expect(page.getByRole('button',{name:'Hozzáadás',exact:true})).toHaveCount(0);
 await open(page,'Pontosított mondatok');
 await expect(diff(page).locator('.blade-diff__summary')).toContainText('+2 −2');
 await expect(diff(page).locator('ins.blade-diff__word').first()).toBeVisible();
 expect(seen).toEqual([]);
});

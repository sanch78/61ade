const {test,expect}=require('../../tools/playwright-test.cjs');
const {execFileSync}=require('node:child_process');
const {signIn}=require('./feature-demo.cjs');
// Value tones, emphasized records and an attention label (FB-0212) on the feature demo's `Változások`
// (changes.json): a toned stored select (`level`) and a toned computed select (`approval`, the linked approval's
// status), unseen rows bold with a hidden `Új` marker, and the menu entry named "Változások, 3 új". The run restores
// every change's `seen`.
const runtime=process.env.BLADE_TMP_DIR||'tmp',instance=process.env.BLADE_DEMO_INSTANCE||'demo';
const php=code=>execFileSync(process.env.BLADE_PHP||'php8.4',['-r',`$db=new PDO('sqlite:${runtime}/${instance}/features.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$db->exec('PRAGMA busy_timeout=10000');${code}`],{encoding:'utf8'});
test.describe.configure({mode:'serial'});
let saved={};
const unseen=()=>Number(php(`echo $db->query("SELECT COUNT(*) FROM demo_changes WHERE seen=0")->fetchColumn();`));
const approval=title=>php(`$q=$db->prepare("SELECT COALESCE(a.status,'') FROM demo_changes c LEFT JOIN demo_approvals a ON a.id=c.approval_id WHERE c.title=?");$q->execute([${JSON.stringify(title)}]);echo $q->fetchColumn();`);
const APPROVAL={'':['Nem kell',null],pending:['Jóváhagyásra vár','primary'],approved:['Jóváhagyva','success'],rejected:['Elutasítva','danger']};
test.beforeAll(()=>{
 saved=JSON.parse(php(`echo json_encode($db->query("SELECT CAST(id AS TEXT),seen FROM demo_changes")->fetchAll(PDO::FETCH_KEY_PAIR));`));
 php(`$db->exec("UPDATE demo_changes SET seen=0 WHERE title IN ('Nyitvatartás átvezetve','Árlista újraszámolva','Hiányzó kép pótolva')");$db->exec("UPDATE demo_changes SET seen=1 WHERE title NOT IN ('Nyitvatartás átvezetve','Árlista újraszámolva','Hiányzó kép pótolva')");`);
});
test.afterAll(()=>{php(`$q=$db->prepare("UPDATE demo_changes SET seen=? WHERE id=?");foreach(json_decode('${JSON.stringify(saved)}',true) as $id=>$seen)$q->execute([$seen,$id]);`);});

const entry=(page,count)=>page.getByRole('menuitem',{name:`Változások, ${count} új`,exact:true});
/** Opens the `Feature demó` branch, through `Menü` when the menu is collapsed (it settles after the first paint). */
async function branch(page){
 const top=page.locator('.blade-navigation-row').getByRole('menuitem',{name:/^(Menü|Feature demó)$/});
 await expect(top.first()).toBeVisible();await page.waitForTimeout(500);
 const burger=page.getByRole('menuitem',{name:'Menü',exact:true});
 if(await burger.isVisible()){await burger.click();await page.waitForTimeout(500);}
 await page.getByRole('menuitem',{name:'Feature demó',exact:true}).click();
}
async function open(page,count){
 await branch(page);
 await expect(entry(page,count)).toBeVisible();
 await entry(page,count).click();
 await expect(page.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
}

test('table at 1366 px: toned values, bold unseen rows with a hidden marker, details, the live count',async({page})=>{
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 expect(unseen()).toBe(3);
 await open(page,3);
 const row=title=>page.locator('.dhx_grid-row').filter({hasText:title});
 // Three unseen rows are emphasized, the seen ones are not; the marker sits in the first column, hidden but named.
 await expect(page.locator('.dhx_grid-row.blade-grid-row--emphasis')).toHaveCount(3);
 await expect(row('Téli dekoráció ütemezve')).not.toHaveClass(/blade-grid-row--emphasis/);
 const marker=row('Nyitvatartás átvezetve').locator('.blade-visually-hidden');
 await expect(marker).toHaveText('Új: ');
 await expect(row('Téli dekoráció ütemezve').locator('.blade-visually-hidden')).toHaveCount(0);
 expect(await row('Nyitvatartás átvezetve').locator('.dhx_grid-cell').first().evaluate(e=>getComputedStyle(e).fontWeight)).toBe('600');
 expect(await row('Téli dekoráció ütemezve').locator('.dhx_grid-cell').first().evaluate(e=>getComputedStyle(e).fontWeight)).toBe('400');
 // A stored select's tone: the value's text stays visible inside the label; an untoned value is plain text.
 await expect(row('Nyitvatartás átvezetve').locator('.blade-tone--warning')).toHaveText('Minden bérlő');
 await expect(row('Árlista újraszámolva').getByText('Egy bérlő',{exact:true})).toBeVisible();
 await expect(row('Árlista újraszámolva').locator('.blade-tone',{hasText:'Egy bérlő'})).toHaveCount(0);
 // The computed select (another table's state) is labelled and toned by its options like a stored one.
 for(const title of ['Nyitvatartás átvezetve','Hiányzó kép pótolva','Bemondás szövege visszavonva']){
  const [label,tone]=APPROVAL[approval(title)];
  if(tone)await expect(row(title).locator(`.blade-tone--${tone}`)).toHaveText(label);
  else{await expect(row(title).getByText(label,{exact:true})).toBeVisible();await expect(row(title).locator('.blade-tone',{hasText:label})).toHaveCount(0);}
 }
 // Details (a double-click, the default activation) show the same toned value.
 await row('Nyitvatartás átvezetve').locator('.dhx_grid-cell').first().dblclick();
 const details=page.getByRole('dialog').filter({hasText:'Nyitvatartás átvezetve'});
 await expect(details.locator('.blade-tone--warning')).toHaveText('Minden bérlő');
 await page.keyboard.press('Escape');
 await expect(details).toHaveCount(0);
 // Marking a change seen (the editable checkbox) removes its emphasis; the menu entry follows live.
 await expect(row('Nyitvatartás átvezetve').getByRole('checkbox',{name:'Látott'})).not.toBeChecked();
 await row('Nyitvatartás átvezetve').locator('.blade-checkbox-edit').click();
 await expect(row('Nyitvatartás átvezetve')).not.toHaveClass(/blade-grid-row--emphasis/,{timeout:15000});
 await expect(row('Nyitvatartás átvezetve').locator('.blade-visually-hidden')).toHaveCount(0);
 await expect.poll(unseen).toBe(2);
 await branch(page);
 await expect(entry(page,2)).toBeVisible({timeout:15000});
 await page.keyboard.press('Escape');
 expect(failures).toEqual([]);
});

test('cards at 390 px: emphasis, marker and tones; the reader gets no entry',async({browser})=>{
 php(`$db->exec("UPDATE demo_changes SET seen=0 WHERE title='Nyitvatartás átvezetve'");`);
 const page=await browser.newPage();
 await page.setViewportSize({width:390,height:844});
 await signIn(page);
 await open(page,3);
 const card=title=>page.locator('.blade-grid-card').filter({hasText:title});
 await expect(page.locator('.blade-grid-card.blade-grid-card--emphasis')).toHaveCount(3);
 await expect(card('Téli dekoráció ütemezve')).not.toHaveClass(/blade-grid-card--emphasis/);
 await expect(card('Nyitvatartás átvezetve').locator('.blade-visually-hidden').first()).toHaveText('Új: ');
 await expect(card('Nyitvatartás átvezetve').locator('.blade-tone--warning')).toHaveText('Minden bérlő');
 expect(await card('Nyitvatartás átvezetve').locator('dd').first().evaluate(e=>getComputedStyle(e).fontWeight)).toBe('600');
 expect(await card('Téli dekoráció ütemezve').locator('dd').first().evaluate(e=>getComputedStyle(e).fontWeight)).toBe('400');
 // The label wraps inside the narrow card instead of overflowing it.
 const [label,box]=await Promise.all([card('Nyitvatartás átvezetve').locator('.blade-tone--warning').boundingBox(),card('Nyitvatartás átvezetve').boundingBox()]);
 expect(label.x+label.width).toBeLessThanOrEqual(box.x+box.width);
 await page.close();

 const reader=await browser.newPage();
 await reader.setViewportSize({width:1366,height:900});
 await signIn(reader,'reader@example.test');
 await branch(reader);
 await expect(reader.getByRole('menuitem',{name:/^Változások/})).toHaveCount(0);
 await reader.close();
});

/** The contrast of every tone label's text with its background in the page's theme (canvas-normalized colours). */
const contrasts=page=>page.evaluate(()=>{
 const canvas=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
 const rgb=color=>{canvas.clearRect(0,0,1,1);canvas.fillStyle='#000';canvas.fillStyle=color;canvas.fillRect(0,0,1,1);return [...canvas.getImageData(0,0,1,1).data].slice(0,3);};
 const lum=c=>{const [r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
 const host=document.createElement('div');host.className='blade-grid-card';document.body.append(host);
 const out={};
 for(const tone of ['primary','secondary','success','warning','danger']){
  const span=document.createElement('span');span.className='blade-tone blade-tone--'+tone;span.textContent=tone;host.append(span);
  const style=getComputedStyle(span),a=lum(rgb(style.color)),b=lum(rgb(style.backgroundColor));
  out[tone]=Math.round((Math.max(a,b)+.05)/(Math.min(a,b)+.05)*100)/100;
 }
 host.remove();return out;
});

test('tone labels keep 4.5:1 text contrast in the factory themes and the consumer skins',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await signIn(page);
 await expect(page.locator('.blade-navigation-row').getByRole('menuitem',{name:/^(Menü|Feature demó)$/}).first()).toBeVisible();
 const stored=await page.evaluate(()=>localStorage.getItem('blade-theme'));
 for(const theme of ['blade','blade-night','light','dark']){
  await page.evaluate(theme=>localStorage.setItem('blade-theme',theme),theme);await page.reload();
  await expect(page.locator('.blade-navigation-row').getByRole('menuitem',{name:/^(Menü|Feature demó)$/}).first()).toBeVisible();
  for(const [tone,ratio] of Object.entries(await contrasts(page)))expect(ratio,`${theme} ${tone}`).toBeGreaterThanOrEqual(4.5);
 }
 await page.evaluate(theme=>theme===null?localStorage.removeItem('blade-theme'):localStorage.setItem('blade-theme',theme),stored);
 const skins=await page.context().browser().newPage();
 await skins.setViewportSize({width:1366,height:900});
 await signIn(skins,'skins@example.test');
 await expect(skins.locator('html')).toHaveAttribute('data-blade-skin',/./);
 const skin=await skins.evaluate(()=>localStorage.getItem('blade-skin'));
 for(const id of ['demo-slate','demo-ink']){
  await skins.evaluate(id=>localStorage.setItem('blade-skin',id),id);await skins.reload();
  await expect(skins.locator('html')).toHaveAttribute('data-blade-skin',id);
  for(const [tone,ratio] of Object.entries(await contrasts(skins)))expect(ratio,`${id} ${tone}`).toBeGreaterThanOrEqual(4.5);
 }
 await skins.evaluate(id=>id===null?localStorage.removeItem('blade-skin'):localStorage.setItem('blade-skin',id),skin);
 await skins.close();
});

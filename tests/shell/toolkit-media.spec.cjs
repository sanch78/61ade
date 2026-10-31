const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');
const {signIn,openMenu,api}=require('./feature-demo.cjs');
// Toolkit MediaPlayer (P3 C-3, docs/toolkit.md#components, docs/files.md): a synthetic fixture over the component
// source, then the feature demo's file manager viewer on top of it. Nothing on the server is changed.
const root=path.resolve(__dirname,'../..');
const windowDialog=page=>page.getByRole('dialog').filter({has:page.locator('.dhx_window-header')}).last();
// A mono 16-bit PCM WAV of `seconds` at 8 kHz (a 440 Hz tone); the same function runs in Node and in the fixture page.
function wavBuffer(seconds){
 const rate=8000,n=rate*seconds,buffer=new ArrayBuffer(44+n*2),view=new DataView(buffer),text=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
 text(0,'RIFF');view.setUint32(4,36+n*2,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)view.setInt16(44+i*2,Math.round(6000*Math.sin(2*Math.PI*440*i/rate)),true);
 return buffer;
}
const wav=seconds=>Buffer.from(wavBuffer(seconds));

async function fixture(page){
 const {buildSync}=require('esbuild');
 const built=buildSync({stdin:{contents:'export {MediaPlayer} from "./packages/frontend/src/components/media/MediaPlayer";',resolveDir:root},bundle:true,format:'iife',globalName:'fixture',write:false,outfile:path.join(root,'tmp/toolkit-media-fixture.js')}).outputFiles;
 await page.setViewportSize({width:1000,height:700});
 await page.setContent('<div id="host" style="position:fixed;inset:0"></div>');
 await page.addStyleTag({path:path.join(root,'packages/frontend/dist/admin.css')});
 await page.addStyleTag({content:built.find(file=>file.path.endsWith('.css'))?.text??''});
 await page.addScriptTag({content:built.find(file=>file.path.endsWith('.js')).text});
 await page.addScriptTag({content:'window.wav='+wavBuffer.toString()+';'});
}

test('MediaPlayer plays audio: length and format, events, seek, keyboard, toolbar, themes, mobile and destroy',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await fixture(page);
 await page.evaluate(()=>{
  window.events=[];window.controller=new AbortController();
  window.player=new fixture.MediaPlayer({source:{blob:new Blob([wav(12)],{type:'audio/wav'})},mime:'audio/wav',name:'Teszt hang',info:'188 KB',signal:controller.signal});
  for(const name of ['loaded','position','ended','error'])player.on(name,payload=>events.push([name,payload]));
  player.mount(document.getElementById('host'));
 });
 const stage=page.locator('.blade-player .blade-audio-stage'),audio=stage.locator('audio'),bar=page.locator('.blade-player .blade-document__bar');
 await expect(audio).toBeVisible();await expect(audio).toHaveAttribute('controls','');await expect(audio).toHaveAttribute('aria-label','Teszt hang');
 await expect(stage).toContainText('Teszt hang');
 // Length and format beside the caller's info; `loaded` carries the duration.
 await expect(bar).toContainText('0:12 · WAV · 188 KB');
 await expect.poll(()=>page.evaluate(()=>events.find(([name])=>name==='loaded')?.[1].duration)).toBeCloseTo(12,1);
 expect(await page.evaluate(()=>player.duration())).toBeCloseTo(12,1);
 expect(await audio.getAttribute('src')).toMatch(/^blob:/);
 // seek() clamps and reports the position once the seek completes.
 await page.evaluate(()=>{events.length=0;player.seek(4.5);});
 await expect.poll(()=>page.evaluate(()=>events.filter(([name])=>name==='position').map(([,p])=>Math.round(p.seconds*10)/10))).toContain(4.5);
 expect(await page.evaluate(()=>player.position())).toBeCloseTo(4.5,1);
 await page.evaluate(()=>player.seek(99));await expect.poll(()=>page.evaluate(()=>player.position())).toBeCloseTo(12,0);
 await page.evaluate(()=>player.seek(-3));await expect.poll(()=>page.evaluate(()=>player.position())).toBe(0);
 // Keyboard on the focused element: Space plays and pauses, an arrow seeks, Home and End jump.
 await page.evaluate(()=>{player.focus();document.querySelector('audio').muted=true;});
 await expect(audio).toBeFocused();
 await page.keyboard.press('Space');await expect.poll(()=>audio.evaluate(element=>element.paused)).toBe(false);
 await expect.poll(()=>page.evaluate(()=>events.filter(([name])=>name==='position').length)).toBeGreaterThan(2);
 await page.keyboard.press('Space');await expect.poll(()=>audio.evaluate(element=>element.paused)).toBe(true);
 await page.keyboard.press('Home');await expect.poll(()=>page.evaluate(()=>player.position())).toBe(0);
 await page.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>player.position())).toBeGreaterThan(0);
 await page.keyboard.press('End');await expect.poll(()=>page.evaluate(()=>player.position())).toBeCloseTo(12,0);
 // Loop and speed in the toolbar.
 await bar.getByRole('button',{name:'Ismétlés',exact:true}).click();expect(await audio.evaluate(element=>element.loop)).toBe(true);
 await bar.locator('[data-dhx-id="speed"]').click();await page.getByRole('menuitem',{name:'1,5×',exact:true}).click();
 expect(await audio.evaluate(element=>element.playbackRate)).toBe(1.5);await expect(bar).toContainText('Sebesség: 1,5×');
 // Themes: the stage follows the Suite theme variables.
 const background=async theme=>{await page.evaluate(theme=>document.documentElement.setAttribute('data-dhx-theme',theme),theme);return stage.evaluate(element=>getComputedStyle(element).backgroundColor);};
 const light=await background('light'),dark=await background('dark');await background('skyblue');
 expect(light).not.toBe(dark);
 // Mobile: the controls stay inside the viewport, the info text gives way. The info is one toolbar item; Suite puts
 // its `css` class on the item wrapper and on the text node, so every node with the class must be hidden.
 const info=bar.locator('[data-dhx-id="info"]'),infoNodes=bar.locator('.blade-player__info');
 await expect(info).toHaveCount(1);await expect(info).toBeVisible();
 await page.setViewportSize({width:390,height:700});
 await expect(info).toBeHidden();
 await expect.poll(()=>infoNodes.evaluateAll(nodes=>nodes.length>0&&nodes.every(node=>!node.checkVisibility()))).toBe(true);
 expect((await audio.boundingBox()).width).toBeLessThanOrEqual(390);
 await expect(bar.getByRole('button',{name:'Ismétlés',exact:true})).toBeVisible();
 // The owner's signal destroys the player: widgets, element and object URL are released, later calls are no-ops.
 const source=await audio.getAttribute('src');
 await page.evaluate(()=>{controller.abort();events.length=0;player.seek(3);player.pause();player.destroy();});
 await expect(page.locator('.blade-player')).toHaveCount(0);await expect(page.locator('audio')).toHaveCount(0);
 expect(await page.evaluate(()=>events.length)).toBe(0);
 expect(await page.evaluate(url=>fetch(url).then(()=>'loaded',()=>'revoked'),source)).toBe('revoked');
 expect(await page.evaluate(()=>{try{player.mount(document.body);return 'mounted';}catch(error){return error.message;}})).toContain('destroyed');
 expect(errors).toEqual([]);
});

test('MediaPlayer image stage, unplayable media and refused types',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await fixture(page);
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=200;canvas.getContext('2d').fillRect(0,0,200,200);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  window.events=[];window.player=new fixture.MediaPlayer({source:{blob},mime:'image/png',name:'Minta kép'});
  player.on('loaded',payload=>events.push(payload));player.mount(document.getElementById('host'));
 });
 const bar=page.locator('.blade-player .blade-document__bar'),stage=page.locator('.blade-image-stage');
 await expect(page.getByRole('img',{name:'Minta kép'})).toBeVisible();
 await expect(bar).toContainText('400 × 200 px · PNG');await expect(bar.locator('[data-dhx-id="zoom"]')).toHaveText(/^Illesztés \(\d+\s?%\)$/);
 expect(await page.evaluate(()=>events)).toEqual([{duration:0,width:400,height:200}]);
 expect(await page.evaluate(()=>[player.duration(),player.position()])).toEqual([0,0]);
 await page.evaluate(()=>player.focus());await expect(stage).toBeFocused();
 await page.keyboard.press('+');await expect(bar.locator('[data-dhx-id="zoom"]')).toHaveText(/^\d+\s?%$/);
 await page.keyboard.press('0');await expect(bar.locator('[data-dhx-id="zoom"]')).toHaveText(/^Illesztés/);
 await page.evaluate(()=>player.destroy());await expect(page.locator('.blade-player')).toHaveCount(0);
 // Bytes that do not decode: `error` with the localized message, also in the toolbar; no toolbar with `toolbar: false`.
 await page.evaluate(()=>{
  window.failures=[];window.broken=new fixture.MediaPlayer({source:{blob:new Blob(['not audio'],{type:'audio/wav'})},mime:'audio/wav',toolbar:false,controls:false});
  broken.on('error',payload=>failures.push(payload.message));broken.mount(document.getElementById('host'));
 });
 await expect.poll(()=>page.evaluate(()=>failures)).toEqual(['A hangfájl nem játszható le ebben a böngészőben.']);
 await expect(page.locator('.blade-player .blade-document__bar')).toHaveCount(0);
 await expect(page.locator('audio')).toHaveAttribute('aria-label','Médiatartalom');expect(await page.locator('audio').getAttribute('controls')).toBeNull();
 await page.evaluate(()=>broken.destroy());
 expect(await page.evaluate(()=>{try{new fixture.MediaPlayer({source:{url:'x.txt'},mime:'text/plain'});return 'created';}catch(error){return error.name;}})).toBe('TypeError');
 expect(errors).toEqual([]);
});

test('file manager viewer runs on MediaPlayer: image and video unchanged, audio opens',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1400,height:900});await signIn(page);await openMenu(page,'Fájlkezelő','Feature demó');
 const left=page.locator('[data-cell-id="panel-0"]'),row=name=>left.locator('.dhx_grid-row').filter({has:page.getByRole('gridcell',{name,exact:true})});
 await expect(left.locator('.dhx_grid-row, .blade-grid-card').first()).toBeVisible();
 await left.locator('[data-dhx-id="mount"]').click();await page.getByRole('menuitem',{name:'Signage',exact:true}).click();
 // The Signage root holds the demo media (examples/demo-app/resources/media): the panel search brings each file into view.
 const open=async name=>{await left.getByRole('textbox',{name:'Keresés',exact:true}).fill(name);await row(name).dblclick();};
 // Image viewer: the same toolbar and fitting, now with the format.
 await open('Kézműves kávé, lassú reggelek.png');
 let viewer=windowDialog(page),bar=viewer.locator('.blade-document__bar');
 await expect(viewer.locator('.blade-player.blade-document--image')).toHaveCount(1);
 await expect(bar).toContainText('1672 × 941 px · PNG');await expect(bar.locator('[data-dhx-id="zoom"]')).toHaveText(/^Illesztés \(\d+\s?%\)$/);
 await expect(viewer.locator('.blade-image-stage')).toBeFocused();
 await page.keyboard.press('+');await expect(bar.locator('[data-dhx-id="zoom"]')).toHaveText(/^\d+\s?%$/);
 await expect(bar.getByRole('button',{name:'Teljes méret',exact:true})).toBeVisible();
 await viewer.getByRole('button',{name:/close/i}).click();await expect(viewer).toHaveCount(0);
 // Video player: native controls, dimensions and length as before, then the format.
 await open('3d-logointro.mp4');
 viewer=windowDialog(page);bar=viewer.locator('.blade-document__bar');const video=viewer.locator('video');
 await expect(bar).toContainText('1920 × 1080 px · 0:13 · MP4');await expect(video).toHaveAttribute('controls','');await expect(video).toBeFocused();
 await bar.getByRole('button',{name:'Ismétlés',exact:true}).click();expect(await video.evaluate(element=>element.loop)).toBe(true);
 await viewer.getByRole('button',{name:/close/i}).click();await expect(viewer).toHaveCount(0);
 // Audio (the seeded 3:02 MP3, streamed with Range support) opens in the same window shape with the audio stage; closing releases the element.
 const music=(await api(page,'files','list',(await api(page,'files','tree','signage')).body.data.root,{search:'nyugodt-zene'})).body.data.items.find(item=>item.name==='nyugodt-zene.mp3');
 await open('nyugodt-zene.mp3');
 viewer=windowDialog(page);bar=viewer.locator('.blade-document__bar');const audio=viewer.locator('.blade-audio-stage audio');
 await expect(audio).toHaveAttribute('aria-label','nyugodt-zene.mp3');await expect(audio).toBeFocused();
 await expect(bar).toContainText('3:02 · MP3');
 expect(await audio.getAttribute('src')).toMatch(new RegExp(`action=content_stream&id=${music.id}&v=\\d+$`));
 await page.keyboard.press('End');await expect.poll(()=>audio.evaluate(element=>Math.round(element.currentTime))).toBe(182);
 await viewer.getByRole('button',{name:/close/i}).click();await expect(viewer).toHaveCount(0);await expect(page.locator('audio')).toHaveCount(0);
 expect(errors).toEqual([]);
});

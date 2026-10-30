// SandboxFrame in Chromium (toolkit C-4): the real dist/sandbox.html and sandbox.js from the managed URL (run
// `npm run build` and `npm run demo:assets` first) inside a fixture page that carries the shell's own CSP header.
const {test,expect}=require('../../tools/playwright-test.cjs');
const path=require('node:path');const {buildSync}=require('esbuild');
const root=path.resolve(__dirname,'../..');
// Shell/Application.php::headers without a live source: the parent policy is the one the admin pages send.
const SHELL_CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const PIXEL='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function fixture(page,baseURL){
 const bundle=buildSync({stdin:{contents:'export {sandboxFrameClass} from "./packages/frontend/src/components/sandbox/SandboxFrame";',resolveDir:root},
  bundle:true,format:'iife',globalName:'fixture',write:false,loader:{'.css':'empty'},define:{'import.meta.url':JSON.stringify(baseURL+'/assets/admin.js?v=sandbox-spec')}}).outputFiles[0].text;
 const start=bundle+'\nwindow.reports=[];window.SandboxFrame=fixture.sandboxFrameClass(payload=>reports.push(payload));document.cookie="blade-sandbox-probe=parent; path=/";'
  // Errors of the fixture document itself; a frame's uncaught errors also surface as Playwright page errors.
  +'window.parentErrors=[];addEventListener("error",e=>parentErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>parentErrors.push(String(e.reason)));';
 await page.route('**/sandbox-fixture.js',route=>route.fulfill({contentType:'text/javascript',body:start}));
 await page.route('**/sandbox-fixture',route=>route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':SHELL_CSP},
  body:'<!doctype html><html><head><title>Sandbox fixture</title><script type="application/json" id="blade-config">{"csrf":"parent-only"}</script><script src="/sandbox-fixture.js"></script></head><body><div id="stage" style="width:480px;height:320px"></div></body></html>'}));
 // Forgers: a plain and a sandboxed iframe that post a valid envelope to the fixture page.
 await page.route('**/sandbox-forger',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script src="/sandbox-forger.js"></script>'}));
 await page.route('**/sandbox-forger.js',route=>route.fulfill({contentType:'text/javascript',body:'parent.postMessage({blade:1,id:"x",type:"demo.pong",payload:"forged"},"*");'}));
 // `probes` are Playwright's request events. Chromium also reports a request that Blink blocked by CSP before it
 // was sent (DevTools "(blocked:csp)": image, XHR, EventSource and script loads go through the resource fetcher,
 // fetch/beacon/WebSocket/frames are checked earlier and never show up), so a request event is not egress.
 // `routed` lists what reached the network layer: with route() active every request that leaves the renderer is
 // paused here, and nothing reaches the server.
 const probes=[],routed=[],documents=[];
 page.on('request',request=>{if(request.url().includes('sandbox-probe'))probes.push(request);});
 page.on('response',response=>{if(response.url().includes('/assets/sandbox.html'))documents.push(response);});
 await page.route('**/sandbox-probe**',route=>{routed.push(new URL(route.request().url()).search);return route.fulfill({contentType:'text/javascript',body:'/* probe */'});});
 await page.goto('/sandbox-fixture');
 return {probes,routed,documents};
}

test('sandbox frame: opaque origin, no cookies, storage or parent access, CSP blocks network',async({page,baseURL})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const {probes,routed}=await fixture(page,baseURL);
 const result=await page.evaluate(async base=>{
  const frame=new SandboxFrame({});frame.mount(document.getElementById('stage'));
  const answer=new Promise(resolve=>frame.on('message',({type,payload})=>{if(type==='probe.result')resolve(payload);}));
  await frame.load(`
   const result={origin:self.origin,violations:[]};
   document.addEventListener('securitypolicyviolation',event=>result.violations.push({directive:event.effectiveDirective,uri:event.blockedURI}));
   const attempt=(name,run)=>{try{result[name]=String(run());}catch(error){result[name]='blocked:'+error.name;}};
   attempt('cookie',()=>document.cookie);attempt('parent',()=>parent.document.getElementById('blade-config').textContent);
   attempt('storage',()=>localStorage.length);attempt('session',()=>sessionStorage.length);
   try{await fetch(${JSON.stringify(base)}+'/sandbox-probe?fetch');result.fetch='allowed';}catch(error){result.fetch='blocked';}
   await new Promise(done=>{const image=new Image();image.onload=image.onerror=done;image.src=${JSON.stringify(base)}+'/sandbox-probe?img';});
   try{const xhr=new XMLHttpRequest();xhr.open('GET',${JSON.stringify(base)}+'/sandbox-probe?xhr');xhr.send();}catch(error){}
   try{navigator.sendBeacon(${JSON.stringify(base)}+'/sandbox-probe?beacon','x');}catch(error){}
   try{new WebSocket(${JSON.stringify(base.replace(/^http/,'ws'))}+'/sandbox-probe?ws');}catch(error){}
   try{new EventSource(${JSON.stringify(base)}+'/sandbox-probe?sse');}catch(error){}
   try{const frame=document.createElement('iframe');frame.src=${JSON.stringify(base)}+'/sandbox-probe?frame';document.body.append(frame);}catch(error){}
   try{const form=document.createElement('form');form.action=${JSON.stringify(base)}+'/sandbox-probe?form';document.body.append(form);form.submit();}catch(error){}
   result.popup=String(window.open(${JSON.stringify(base)}+'/sandbox-probe?popup'));
   // 'self' (the URL origin) admits scripts of the admin origin, but the opaque origin sends no cookies with them.
   await new Promise(done=>{const script=document.createElement('script');script.onload=script.onerror=done;script.src=${JSON.stringify(base)}+'/sandbox-probe?script';document.head.append(script);});
   await new Promise(done=>setTimeout(done,500));
   blade.post('probe.result',result);
  `);
  return {...await answer,parentCookie:document.cookie};
 },new URL(baseURL).origin);
 expect(result.origin).toBe('null');
 expect(result.parentCookie).toContain('blade-sandbox-probe=parent');
 expect(result.cookie==='' || result.cookie.startsWith('blocked:')).toBe(true);
 expect(result.parent).toMatch(/^blocked:/);expect(result.storage).toMatch(/^blocked:/);expect(result.session).toMatch(/^blocked:/);
 expect(result.fetch).toBe('blocked');expect(result.popup).toBe('null');
 const directives=result.violations.map(violation=>violation.directive);
 expect(directives).toEqual(expect.arrayContaining(['connect-src','img-src','frame-src']));
 expect(directives.filter(directive=>directive==='connect-src').length).toBeGreaterThanOrEqual(3);   // fetch, XHR, EventSource at least
 // Evidence for the P7 review: every probe Playwright saw, whether it got a response and how it failed.
 const evidence=await Promise.all(probes.map(async request=>({probe:new URL(request.url()).search,response:!!(await request.response()),failure:request.failure()?.errorText??null})));
 test.info().annotations.push({type:'sandbox-probes',description:JSON.stringify({routed,evidence,violations:result.violations})});
 // Only the 'self' script left the renderer; every other probe was blocked by the meta CSP or the sandbox flags.
 expect(routed).toEqual(['?script']);
 for(const item of evidence.filter(item=>item.probe!=='?script'))expect(item.response,JSON.stringify(item)).toBe(false);
 const script=probes.find(request=>new URL(request.url()).search==='?script');
 expect((await script.allHeaders()).cookie ?? '').not.toContain('blade-sandbox-probe');
 expect(errors).toEqual([]);
});

test('sandbox frame: sandbox.html headers, load/ready, files and project message round trip, foreign messages ignored',async({page,baseURL})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const {documents}=await fixture(page,baseURL);
 const result=await page.evaluate(async pixel=>{
  const frame=new SandboxFrame({title:'Jelenet'});frame.mount(document.getElementById('stage'));window.frame=frame;
  const messages=[];frame.on('message',message=>messages.push(message));
  const ready=[];frame.on('ready',payload=>ready.push(payload));
  const png=new Blob([Uint8Array.from(atob(pixel),c=>c.charCodeAt(0))],{type:'image/png'});
  await frame.load(`
   const width=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth);image.onerror=reject;image.src=blade.files['pixel.png'];document.body.append(image);});
   blade.on('demo.ping',payload=>blade.post('demo.pong',{payload,width,text:blade.files['note.txt'],url:blade.files['pixel.png'].slice(0,10)}));
  `,{'note.txt':'Szia','pixel.png':png});
  frame.post('demo.ping',{n:1});
  await new Promise(done=>setTimeout(done,300));
  // A valid envelope from the page itself, a plain iframe and another opaque-origin iframe is ignored.
  window.postMessage({blade:1,id:'x',type:'demo.pong',payload:'forged'},'*');
  const forgers=[false,true].map(sandboxed=>{const forger=document.createElement('iframe');if(sandboxed)forger.setAttribute('sandbox','allow-scripts');forger.src='/sandbox-forger';document.body.append(forger);return new Promise(done=>forger.onload=done);});
  await Promise.all(forgers);await new Promise(done=>setTimeout(done,500));
  const iframe=document.querySelector('#stage iframe');
  return {messages,ready,sandbox:iframe.getAttribute('sandbox'),title:iframe.title,src:iframe.src,reports};
 },PIXEL);
 const response=documents[0];
 expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('text/html');
 expect(result.sandbox).toBe('allow-scripts');expect(result.title).toBe('Jelenet');expect(result.src).toBe(baseURL+'/assets/sandbox.html?v=sandbox-spec');
 expect(result.ready).toEqual([{}]);
 expect(result.messages).toEqual([{type:'demo.pong',payload:{payload:{n:1},width:1,text:'Szia',url:'blob:null/'}}]);
 expect(result.reports).toEqual([]);
 expect(errors).toEqual([]);
});

test('sandbox frame: error, syntax error, size, timeout, navigation and destroy are reported',async({page,baseURL})=>{
 test.setTimeout(60000);
 await fixture(page,baseURL);
 const result=await page.evaluate(async()=>{
  const stage=document.getElementById('stage'),outcome=async promise=>{try{await promise;return 'ready';}catch(error){return error.name==='AbortError'?'abort':error.code+':'+error.message;}};
  const frames=()=>stage.querySelectorAll('iframe').length;
  const frame=new SandboxFrame({readyTimeout:2000});frame.mount(stage);
  const events=[];frame.on('error',payload=>events.push(payload.code));
  const thrown=await outcome(frame.load('throw new Error("boom");'));
  const syntax=await outcome(frame.load('}{'));
  const late=await outcome(frame.load('setTimeout(()=>{throw new Error("later");},0);'));
  await new Promise(done=>setTimeout(done,300));
  const size=await outcome(new SandboxFrame({maxCodeBytes:8}).load('0123456789'));
  const timeout=await outcome(frame.load('await new Promise(()=>{});'));
  const afterTimeout=frames();
  const navigated=await outcome(frame.load('setTimeout(()=>{location.href=location.href;},50);'));
  await new Promise(done=>setTimeout(done,1500));
  const afterNavigation=frames();
  const replaced=frame.load('');const second=frame.load('');
  const [first,last]=[await outcome(replaced),await outcome(second)];
  const pending=frame.load('await new Promise(()=>{});');frame.destroy();frame.destroy();
  const destroyed=await outcome(pending);
  frame.post('demo.ping',1);
  return {thrown,syntax,late,size,timeout,afterTimeout,navigated,afterNavigation,first,last,destroyed,afterDestroy:frames(),events,reports:reports.map(r=>r.code)};
 });
 expect(result.thrown).toBe('error:boom');
 expect(result.syntax).toMatch(/^error:/);
 expect(result.late).toBe('ready');
 expect(result.size).toMatch(/^size:/);
 expect(result.timeout).toMatch(/^timeout:/);expect(result.afterTimeout).toBe(0);
 expect(result.navigated).toBe('ready');expect(result.afterNavigation).toBe(0);
 expect(result.first).toBe('abort');expect(result.last).toBe('ready');
 expect(result.destroyed).toBe('abort');expect(result.afterDestroy).toBe(0);
 expect(result.events).toEqual(['error','error','error','timeout','protocol']);
 expect(result.reports).toEqual(['error','error','error','size','timeout','protocol']);
 // Uncaught errors inside the frame (syntax error, "later") are expected and reach `pageerror` too; the parent
 // document itself must stay clean.
 expect(await page.evaluate(()=>parentErrors)).toEqual([]);
});

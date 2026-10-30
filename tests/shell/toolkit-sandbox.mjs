// SandboxFrame protocol without a browser: node tests/shell/toolkit-sandbox.mjs (envelope, limits, both protocol sides
// with fake windows). The CSP, the opaque origin and real frames are covered by toolkit-sandbox.spec.cjs in Chromium.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const src=new URL('../../packages/frontend/src/',import.meta.url).pathname;
const stubs={
 '@dhtmlx/suite':'export class Layout{constructor(root,config){this.root=root;this.config=config;this.destroyed=false;}getCell(){return {};}destructor(){this.destroyed=true;}}',
 services:'export function attachContent(cell,content,signal){globalThis.attached={content,signal};}',
 I18n:'export const t=key=>key;',
};
const load=async(file,define={})=>{
 const result=await build({entryPoints:[src+file],bundle:true,format:'esm',write:false,define,logLevel:'silent',plugins:[{name:'stubs',setup(b){
  b.onResolve({filter:/^@dhtmlx\/suite$|\/api\/services$|\/I18n$|\.css$/},args=>({path:args.path,namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path.endsWith('.css')?'':args.path==='@dhtmlx/suite'?stubs['@dhtmlx/suite']:stubs[args.path.split('/').pop()],loader:'js'}));
 }}]});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {envelope,projectType,describe,byteLength,RESERVED}=await load('sandbox/protocol.ts');
const {startSandbox,START}=await load('sandbox/runtime.ts');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

// Envelope and names.
assert.deepEqual(RESERVED,['load','ready','error']);
assert.deepEqual(envelope({blade:1,id:'p1',type:'load',payload:{code:''}}),{blade:1,id:'p1',type:'load',payload:{code:''}});
assert.deepEqual(envelope({blade:1,id:'f1',type:'scene.seek'}),{blade:1,id:'f1',type:'scene.seek',payload:undefined});
for(const bad of [null,'x',[],{},{blade:2,id:'a',type:'load'},{blade:'1',id:'a',type:'load'},{blade:1,id:'',type:'load'},{blade:1,id:'x'.repeat(65),type:'load'},{blade:1,id:1,type:'load'},
 {blade:1,id:'a',type:'seek'},{blade:1,id:'a',type:'Scene.seek'},{blade:1,id:'a',type:'scene seek'},{blade:1,id:'a',type:'a.'+'b'.repeat(127)},{blade:1,id:'a'}])
 assert.equal(envelope(bad),null,JSON.stringify(bad));
assert.equal(projectType('scene.seek'),true);assert.equal(projectType('ready'),false);assert.equal(projectType('scene:seek'),false);assert.equal(projectType(7),false);
assert.equal(describe(new Error('boom')),'boom');assert.equal(describe('x'.repeat(2000)).length,1001);assert.equal(describe({toString(){throw new Error('no');}}),'Unknown error');
assert.equal(byteLength('aé€'),6);

// A fake frame document: its window, its parent and the delivered code's global object.
function frameSide(parent,origin='null'){
 const global={},handlers={message:[],error:[],unhandledrejection:[]},urls=[];
 const fire=(type,event)=>{for(const handler of handlers[type])handler(event);};
 startSandbox({self:{},origin,parent,global,on:(type,handler)=>handlers[type].push(handler),objectUrl:blob=>{urls.push(blob);return 'blob:null/'+urls.length;},
  execute(source,failed){if(global.failExecute)return failed();try{new Function('globalThis',source)(global);}catch(error){fire('error',{error});}}});
 return {global,fire,urls,receive:data=>fire('message',{source:parent,data})};
}

// Frame side alone.
{
 const sent=[],parent={postMessage:(message,origin)=>{assert.equal(origin,'*');sent.push(message);}};
 const notFramed={};startSandbox({self:notFramed,origin:'null',parent:notFramed,global:notFramed,on(){throw new Error('must not listen');}});
 assert.equal('blade' in notFramed,false,'a top-level sandbox.html stays inert');
 // Framed without `sandbox`, or with `allow-same-origin`: a real origin, so no code may ever run there.
 for(const origin of ['https://admin.test','',undefined]){
  const global={};startSandbox({self:{},origin,parent:{postMessage(){throw new Error('must not post');}},global,on(){throw new Error('must not listen');},execute(){throw new Error('must not run');}});
  assert.equal('blade' in global,false,`a frame of origin ${String(origin)} stays inert`);
 }
 const frame=frameSide(parent);
 assert.equal(Object.isFrozen(frame.global.blade),true);
 frame.fire('message',{source:{},data:{blade:1,id:'p1',type:'load',payload:{code:'',files:{}}}});assert.equal(sent.length,0,'other sources are ignored');
 frame.receive({blade:1,id:'p1',type:'ready',payload:{}});frame.receive('junk');
 assert.deepEqual(sent.map(m=>[m.type,m.payload.message]),[['error','Protocol: "ready" is sent by the frame only.'],['error','Protocol: invalid message.']]);
 assert.ok(sent.every(m=>m.blade===1&&/^f\d+$/.test(m.id)));assert.equal(new Set(sent.map(m=>m.id)).size,sent.length);
 sent.length=0;frame.receive({blade:1,id:'p2',type:'load',payload:{code:7,files:{}}});assert.equal(sent[0].payload.message,'Protocol: invalid load payload.');
 sent.length=0;frame.receive({blade:1,id:'p3',type:'load',payload:{code:'',files:{}}});assert.equal(sent[0].payload.message,'Protocol: the frame accepts one load.');
 const bad=frameSide(parent);sent.length=0;bad.receive({blade:1,id:'p1',type:'load',payload:{code:'',files:{x:5}}});assert.equal(sent[0].payload.message,'Protocol: file "x" is neither a Blob nor a string.');
 const blocked=frameSide(parent);blocked.global.failExecute=true;sent.length=0;blocked.receive({blade:1,id:'p1',type:'load',payload:{code:'',files:{}}});assert.equal(sent[0].payload.message,'The code could not be started.');
 const run=frameSide(parent);sent.length=0;
 run.receive({blade:1,id:'p1',type:'load',payload:{code:'blade.on("demo.echo",p=>{if(p==="throw")throw new Error("handler");blade.post("demo.back",p);});await 0;return 1;',files:{a:'text',b:new Blob(['xyz'])}}});
 await tick();
 assert.deepEqual(sent.map(m=>m.type),['ready']);assert.equal(START in run.global,false,'the start hook is one-shot');
 assert.deepEqual({...run.global.blade.files},{a:'text',b:'blob:null/1'});assert.equal(run.urls[0].size,3);assert.equal(Object.isFrozen(run.global.blade.files),true);
 run.receive({blade:1,id:'p2',type:'demo.echo',payload:{n:1}});run.receive({blade:1,id:'p3',type:'demo.echo',payload:'throw'});
 assert.deepEqual(sent.slice(1).map(m=>[m.type,m.payload]),[['demo.back',{n:1}],['error',{message:'handler'}]]);
 assert.throws(()=>run.global.blade.post('ready',{}),TypeError);assert.throws(()=>run.global.blade.on('nodot',()=>{}),TypeError);
 sent.length=0;run.fire('unhandledrejection',{reason:new Error('late')});run.fire('error',{message:'Script error.'});
 assert.deepEqual(sent.map(m=>m.payload.message),['late','Script error.']);
}

// Parent side (SandboxFrame) paired with the frame side through fake windows and iframes.
class FakeElement{
 constructor(tag){this.tag=tag;this.attributes={};this.children=[];this.removed=false;this.events={};}
 setAttribute(name,value){this.attributes[name]=value;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 remove(){this.removed=true;}
 addEventListener(type,handler,options){(this.events[type]??=[]).push(handler);options?.signal?.addEventListener('abort',()=>{this.events[type]=this.events[type].filter(h=>h!==handler);});}
}
const windowListeners=new Set(),frames=[];
globalThis.HTMLElement=FakeElement;
globalThis.window={addEventListener(type,handler,options){assert.equal(type,'message');windowListeners.add(handler);options?.signal?.addEventListener('abort',()=>windowListeners.delete(handler));}};
const toParent=event=>{for(const handler of [...windowListeners])handler(event);};
globalThis.document={createElement(tag){
 const element=new FakeElement(tag);
 if(tag==='iframe'){
  frames.push(element);let side;
  element.contentWindow={postMessage:(data,origin)=>{assert.equal(origin,'*');setTimeout(()=>side?.receive(data),0);}};
  // Firing `load` starts a fresh frame document, as a navigation or reload would.
  element.fire=()=>{side=frameSide({postMessage:data=>setTimeout(()=>toParent({source:element.contentWindow,origin:'null',data}),0)});for(const handler of element.events.load??[])handler();};
  element.frameSide=()=>side;
 }
 return element;
}};
const warn=console.warn;console.warn=()=>{};
try{
 // Without a usable import.meta.url (a non-ESM bundle; here a data: URL) creating the class and a frame still works
 // and load() rejects clearly, so createApplication never throws because of the sandbox.
 for(const define of [{},{'import.meta.url':'undefined'}]){
  const {sandboxFrameClass:unresolved}=await load('components/sandbox/SandboxFrame.ts',define);
  const created=frames.length,orphan=new (unresolved(()=>{}))();
  await assert.rejects(orphan.load(''),/cannot resolve sandbox\.html/);assert.equal(frames.length,created);orphan.destroy();
 }
 const {sandboxFrameClass,SANDBOX_LIMITS}=await load('components/sandbox/SandboxFrame.ts',{'import.meta.url':'"https://admin.test/assets/admin.js?v=7"'});
 assert.deepEqual({...SANDBOX_LIMITS},{code:1048576,files:33554432,ready:10000});
 const reports=[],SandboxFrame=sandboxFrameClass(payload=>reports.push(payload));
 assert.throws(()=>new SandboxFrame({readyTimeout:-1}),TypeError);assert.throws(()=>new SandboxFrame({maxCodeBytes:Infinity}),TypeError);
 const sandbox=new SandboxFrame({readyTimeout:1000}),events=[];
 for(const name of ['ready','error','message'])sandbox.on(name,payload=>events.push([name,payload]));
 const target=new FakeElement('div');sandbox.mount(target);assert.equal(target.children[0],sandbox.layout.root);
 assert.equal(globalThis.attached.content.className,'blade-sandbox__host');
 const ready=sandbox.load('blade.on("demo.ping",p=>blade.post("demo.pong",{p,files:blade.files}));',{'a.txt':'hi','b.bin':new Blob(['xyz'])});
 const frame=frames.at(-1);
 assert.deepEqual(frame.attributes,{sandbox:'allow-scripts',credentialless:''});
 assert.equal(frame.src,'https://admin.test/assets/sandbox.html?v=7');assert.equal(frame.referrerPolicy,'no-referrer');assert.equal(frame.title,'Tartalom');
 assert.throws(()=>sandbox.post('demo.ping',1),/not ready/);
 frame.fire();await ready;
 assert.deepEqual(events,[['ready',{}]]);
 sandbox.post('demo.ping',5);await tick();await tick();
 assert.deepEqual(events[1],['message',{type:'demo.pong',payload:{p:5,files:{'a.txt':'hi','b.bin':'blob:null/1'}}}]);
 assert.throws(()=>sandbox.post('ready',{}),TypeError);assert.throws(()=>sandbox.post('ping',{}),TypeError);
 // Only the own frame's window from the opaque origin is heard.
 const count=events.length,valid={blade:1,id:'x',type:'demo.pong',payload:1};
 toParent({source:{},origin:'null',data:valid});toParent({source:frame.contentWindow,origin:'https://admin.test',data:valid});toParent({source:null,origin:'null',data:valid});
 assert.equal(events.length,count);
 // A frame document reports the first failure its messages cause; later ones (any number) are dropped, and its
 // project messages keep arriving.
 const warnings=[];console.warn=line=>warnings.push(line);
 toParent({source:frame.contentWindow,origin:'null',data:{blade:1,id:'x',type:'load',payload:{}}});
 for(let i=0;i<50;i++){
  toParent({source:frame.contentWindow,origin:'null',data:{blade:1,id:'x',type:'nodot',payload:{}}});
  toParent({source:frame.contentWindow,origin:'null',data:{blade:1,id:'x',type:'error',payload:{message:'x'.repeat(5000)}}});
 }
 toParent({source:frame.contentWindow,origin:'null',data:valid});
 assert.deepEqual(events.slice(count).map(([name,payload])=>[name,payload.code??payload.type]),[['error','protocol'],['message','demo.pong']]);
 assert.deepEqual(reports.map(r=>r.code),['protocol']);assert.equal(warnings.length,1,'one console line');console.warn=()=>{};
 // A second document load (navigation or reload) is a protocol error and removes the frame.
 frame.fire();assert.equal(frame.removed,true);assert.deepEqual(events.at(-1),['error',{message:'The sandbox document was navigated or reloaded.',code:'protocol'}]);
 assert.throws(()=>sandbox.post('demo.ping',1),/not ready/);

 // Load failures reject with the event's code; the frame-side error text is reported (at most 1000 characters + …).
 const failing=sandbox.load('throw new Error("boom");');frames.at(-1).fire();
 await assert.rejects(failing,error=>error.code==='error'&&error.message==='boom');
 const long=sandbox.load('throw new Error("x".repeat(5000));');frames.at(-1).fire();
 await assert.rejects(long,error=>error.code==='error'&&error.message.length===1001);
 // Project messages are delivered before `ready` too (code may report during its evaluation).
 const early=sandbox.load('blade.post("demo.early",1);await new Promise(resolve=>setTimeout(resolve,20));');frames.at(-1).fire();await tick();await tick();
 assert.deepEqual(events.at(-1),['message',{type:'demo.early',payload:1}]);await early;
 const syntax=sandbox.load('}{');frames.at(-1).fire();await assert.rejects(syntax,{code:'error'});
 // A newer load replaces a pending one.
 const first=sandbox.load('');const second=sandbox.load('');assert.equal(frames.at(-2).removed,true);
 await assert.rejects(first,{name:'AbortError'});frames.at(-1).fire();await second;

 // Limits: code and files in bytes; the current frame stays.
 const small=new SandboxFrame({maxCodeBytes:4,maxFileBytes:5}),before=frames.length,current=frames.at(-1);
 await assert.rejects(small.load('12345'),{code:'size'});await assert.rejects(small.load('',{a:'ééé'}),{code:'size'});
 await assert.rejects(small.load('',{a:new Blob(['123456'])}),{code:'size'});await assert.rejects(small.load('',{a:5}),TypeError);
 assert.equal(frames.length,before);assert.equal(current.removed,false);
 await assert.rejects(sandbox.load('x'.repeat(SANDBOX_LIMITS.code+1)),{code:'size'});assert.equal(current.removed,false);
 // A refused oversized load leaves a pending earlier load alone: it still becomes ready.
 const kept=sandbox.load('');await assert.rejects(sandbox.load('x'.repeat(SANDBOX_LIMITS.code+1)),{code:'size'});frames.at(-1).fire();await kept;
 small.destroy();

 // Timeout: no ready in time removes the frame.
 const slow=new SandboxFrame({readyTimeout:30}),slowEvents=[];slow.on('error',payload=>slowEvents.push(payload));slow.mount(new FakeElement('div'));
 const stuck=slow.load('await new Promise(()=>{});');frames.at(-1).fire();
 await assert.rejects(stuck,{code:'timeout'});assert.equal(frames.at(-1).removed,true);assert.equal(slowEvents[0].code,'timeout');assert.equal(reports.at(-1).code,'timeout');

 // destroy(): kill switch, idempotent; pending load aborts, listeners and layout released.
 const listeners=windowListeners.size,pending=slow.load('');slow.destroy();slow.destroy();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(frames.at(-1).removed,true);assert.equal(windowListeners.size,listeners-1);
 assert.equal(slow.layout.destroyed,true);assert.equal(slow.layout.root.removed,true);
 slow.post('demo.ping',1);await assert.rejects(slow.load(''),{name:'AbortError'});
 const controller=new AbortController(),bound=new SandboxFrame({signal:controller.signal});controller.abort();assert.equal(bound.layout.destroyed,true);
 const done=new AbortController();done.abort();assert.equal(new SandboxFrame({signal:done.signal}).layout.destroyed,true);
 sandbox.destroy();assert.equal(windowListeners.size,0);

 // Lifecycle (docs/toolkit.md#components): events only while mounted, one mount, a closing host or cell owner.
 const quiet=new SandboxFrame({maxCodeBytes:1}),quietEvents=[],before2=reports.length;quiet.on('error',payload=>quietEvents.push(payload));
 await assert.rejects(quiet.load('12'),{code:'size'});assert.equal(quietEvents.length,0,'no component event before mount');assert.equal(reports.length,before2+1,'sandbox:error still reports');
 assert.throws(()=>quiet.on('error','nope'),TypeError);assert.throws(()=>new SandboxFrame({signal:{}}),TypeError);
 const cell={widget:null,attach(widget){this.widget=widget;},getWidget(){return this.widget;},detach(){this.widget=null;}};
 quiet.mount(cell);assert.equal(cell.widget,quiet.layout);assert.throws(()=>quiet.mount(new FakeElement('div')),/already mounted/);
 await assert.rejects(quiet.load('12'),{code:'size'});assert.equal(quietEvents.length,1,'mounted: the event arrives');
 quiet.destroy();assert.equal(cell.widget,null,'destroy detaches the cell');assert.throws(()=>quiet.mount(cell),/destroyed/);
 const host=new AbortController(),hosted=new SandboxFrame(),attached=[];hosted.mount({signal:host.signal,attach:content=>attached.push(content)});
 assert.equal(attached[0],hosted.layout);host.abort();assert.equal(hosted.layout.destroyed,true,'a closing host destroys the frame');
 const closed=new AbortController();closed.abort();const late=new SandboxFrame();late.mount({signal:closed.signal,attach(){throw new Error('closed host must not be attached');}});
 assert.equal(late.layout.destroyed,true,'an already closed host destroys the frame');
 assert.equal(windowListeners.size,0);
}finally{console.warn=warn;}
console.log('Toolkit sandbox: envelope, limits, frame bootstrap, SandboxFrame source/origin checks, ready/error/timeout, one error report per document, navigation kill, lifecycle, destroy PASS');

// Toolkit component lifecycle without a browser: node tests/shell/toolkit-components.mjs. Loads the facade base of the
// public components (packages/frontend/src/components/calendar/Facade.ts) over a minimal DOM stub and checks mount
// targets, events only while mounted, idempotent destroy, signals and view references (docs/toolkit.md#components).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
class HTMLElement{
 constructor(){this.children=[];this.parent=null;this.style={};}
 append(child){child.parent?.children.splice(child.parent.children.indexOf(child),1);this.children.push(child);child.parent=this;}
 remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
}
globalThis.HTMLElement=HTMLElement;globalThis.document={createElement:()=>new HTMLElement()};
const source=await readFile(new URL('../../packages/frontend/src/components/calendar/Facade.ts',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'ts',format:'esm'});
const {Facade,resolveView}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

let destroyed=0,emitter;
class Probe extends Facade{
 constructor(options){super(options,(container,emit)=>{emitter=emit;return {layout:{id:'root'},destroy(){destroyed++;}};});this.send=emitter;}
 fire(payload){this.send('x',payload);}
}

// Element target: the container is placed and removed; events only while mounted; destroy once; no remount.
const element=new HTMLElement(),probe=new Probe({}),seen=[];
probe.on('x',payload=>seen.push(payload));probe.fire(1);probe.mount(element);probe.fire(2);
assert.equal(element.children.length,1);assert.throws(()=>probe.mount(element),/already mounted/);
probe.destroy();probe.destroy();assert.equal(destroyed,1);assert.equal(element.children.length,0);
probe.fire(3);assert.deepEqual(seen,[2]);assert.throws(()=>probe.mount(element),/destroyed/);

// Options signal: aborting destroys; an already aborted signal destroys at once.
const controller=new AbortController();new Probe({signal:controller.signal});controller.abort();assert.equal(destroyed,2);
const aborted=new AbortController();aborted.abort();new Probe({signal:aborted.signal});assert.equal(destroyed,3);
assert.throws(()=>new Probe({signal:{}}),TypeError);

// Layout cell: the root Layout is attached and detached again on destroy.
const cell={widget:null,attach(widget){this.widget=widget;},attachHTML(){},getWidget(){return this.widget;},detach(){this.widget=null;}};
const inCell=new Probe();inCell.mount(cell);assert.equal(cell.widget.id,'root');inCell.destroy();assert.equal(cell.widget,null);

// AppWindow/ViewHost: attached through `attach`; its signal destroys; an explicit destroy empties it.
const hostController=new AbortController(),host={signal:hostController.signal,attached:[],attach(content){this.attached.push(content);}};
new Probe().mount(host);assert.equal(host.attached[0].id,'root');hostController.abort();assert.equal(destroyed,5);assert.equal(host.attached.length,1);
const open={signal:new AbortController().signal,attached:[],attach(content){this.attached.push(content);}};
const inWindow=new Probe();inWindow.mount(open);inWindow.destroy();assert.ok(open.attached[1] instanceof HTMLElement);
const closedController=new AbortController();closedController.abort();
new Probe().mount({signal:closedController.signal,attach(){throw new Error('closed host must not be attached');}});assert.equal(destroyed,7);
assert.throws(()=>new Probe().mount({}),TypeError);

// View references: an offered id through the application, or a held definition of the right shape.
const app={viewDefinition:id=>id==='events'?{id,kind:'calendar',resource:'events',actions:[],options:{ok:true}}:undefined};
assert.equal(resolveView(app,'events','Calendar',options=>!!options?.ok).resource,'events');
assert.equal(resolveView(app,{id:'demo.cal',kind:'demo.cal',resource:'r',actions:[],options:{ok:true}},'Calendar',options=>!!options?.ok).id,'demo.cal');
assert.throws(()=>resolveView(app,'missing','Calendar',()=>true),error=>!(error instanceof TypeError)&&/not offered/.test(error.message));
assert.throws(()=>resolveView(app,{id:'x',actions:[],options:{}},'Calendar',()=>true),TypeError);
assert.throws(()=>resolveView(app,'events','Calendar',()=>false),TypeError);
console.log('Toolkit components: facade mount targets, events, destroy, signals and view references PASS');

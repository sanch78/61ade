// Toolkit component lifecycle without a browser: node tests/shell/toolkit-components.mjs. Loads the facade base of the
// public components (packages/frontend/src/components/Facade.ts) over a minimal DOM stub and checks mount
// targets, events only while mounted, idempotent destroy, signals and view references (docs/toolkit.md#components).
import assert from 'node:assert/strict';
import {build} from 'esbuild';
class HTMLElement{
 constructor(){this.children=[];this.parent=null;this.style={};}
 append(child){child.parent?.children.splice(child.parent.children.indexOf(child),1);this.children.push(child);child.parent=this;}
 remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}}
}
globalThis.HTMLElement=HTMLElement;globalThis.document={createElement:()=>new HTMLElement()};
// The facade, the list components' base and the shared Lifecycle they (and MediaPlayer, SandboxFrame) use.
// The list definition's renderers (RecordPresentation, registries) are not needed for view references: stubbed.
const stubs={name:'stubs',setup(b){
 b.onResolve({filter:/\/RecordPresentation$|\/app\/registries$/},args=>({path:args.path,namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const escape=String,optionText=()=>"",resolveColumn=column=>column;',loader:'js'}));
}};
const load=async file=>{
 const result=await build({entryPoints:[new URL('../../packages/frontend/src/'+file,import.meta.url).pathname],bundle:true,format:'esm',write:false,logLevel:'silent',plugins:[stubs]});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {Facade,resolveView}=await load('components/Facade.ts');
const {Component:ListBase}=await load('components/list/component.ts');
const {resolveListView}=await load('components/list/definition.ts');

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

// `on(event, handler, {signal})`: the handler leaves when the signal aborts; an aborted one subscribes nothing.
{
 const signalled=new Probe({}),got=[],stop=new AbortController(),gone=new AbortController();gone.abort();
 signalled.on('x',payload=>got.push(['a',payload]),{signal:stop.signal});signalled.on('x',payload=>got.push(['b',payload]),{signal:gone.signal});
 signalled.mount(new HTMLElement());signalled.fire(1);stop.abort();signalled.fire(2);
 assert.deepEqual(got,[['a',1]]);
 for(const bad of [stop.signal,'x',{signal:{}}])assert.throws(()=>signalled.on('x',()=>{},bad),TypeError,'the options take {signal} only');
 // Left mounted: the destroy counter below counts the other probes.
}

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

// The list components' base follows the same rule (ListView, RecordForm, RecordDetails, CommandBar).
let disposed=0;
class ListProbe extends ListBase{
 constructor(options){super(options);this.layout={id:'list',painted:0,paint(){this.painted++;}};this.bind(options?.signal);}
 fire(payload){this.emit('x',payload);}
 dispose(){disposed++;}
}
assert.throws(()=>new ListProbe({signal:'x'}),TypeError);
assert.throws(()=>new ListProbe().on('x','nope'),TypeError,'a handler must be a function');
const listSeen=[],inList=new ListProbe(),listCell={widget:null,attach(widget){this.widget=widget;},getWidget(){return this.widget;},detach(){this.widget=null;}};
inList.on('x',payload=>listSeen.push(payload));inList.fire(1);inList.mount(listCell);inList.fire(2);
assert.throws(()=>inList.mount(listCell),/already mounted/);
inList.destroy();inList.destroy();assert.equal(disposed,1);assert.equal(listCell.widget,null,'the cell is detached');inList.fire(3);assert.deepEqual(listSeen,[2]);
assert.throws(()=>inList.mount(new HTMLElement()),/destroyed/);
const listElement=new HTMLElement(),painted=new ListProbe();painted.mount(listElement);assert.equal(listElement.children.length,1);assert.equal(painted.layout.painted,1);painted.destroy();assert.equal(listElement.children.length,0);
const listHost=new AbortController(),hostedList=new ListProbe();hostedList.mount({signal:listHost.signal,attach(){}});listHost.abort();assert.equal(disposed,3,'a closing host destroys');
const closedHost=new AbortController();closedHost.abort();new ListProbe().mount({signal:closedHost.signal,attach(){throw new Error('closed host must not be attached');}});assert.equal(disposed,4,'an already closed host destroys');
const listSignal=new AbortController();new ListProbe({signal:listSignal.signal});listSignal.abort();assert.equal(disposed,5);

// List view references: not offered is an Error, another kind or shape a TypeError.
const lists={viewDefinition:id=>id==='tasks'?{id,kind:'list',resource:'tasks',actions:[],options:{columns:[]}}:id==='events'?{id,kind:'calendar',resource:'events',actions:[],options:{}}:undefined};
assert.equal(resolveListView(lists,'tasks').resource,'tasks');
assert.throws(()=>resolveListView(lists,'missing'),error=>!(error instanceof TypeError)&&/not offered/.test(error.message));
assert.throws(()=>resolveListView(lists,'events'),TypeError);
assert.throws(()=>resolveListView(lists,{id:'x'}),TypeError);

// TextDiff's line and word edit (components/diff/diff.ts): a minimal script (the LCS length) that rebuilds the new text,
// a bounded fallback for unrelated texts (none for words), line breaks, and two 60 000-character texts with a few
// changed lines well within 250 ms.
const {editScript,lineDiff,words,lines}=await load('components/diff/diff.ts');
let seed=7;const random=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
for(let round=0;round<500;round++){
 const word=()=>Array.from({length:Math.floor(random()*10)},()=>'abc'[Math.floor(random()*3)]),a=word(),b=word(),ops=editScript(a,b,100);
 let i=0,j=0;const built=[];
 for(const op of ops){if(op===0){assert.equal(a[i++],b[j]);built.push(b[j++]);}else if(op===1)i++;else built.push(b[j++]);}
 const lcs=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let x=a.length-1;x>=0;x--)for(let y=b.length-1;y>=0;y--)lcs[x][y]=a[x]===b[y]?lcs[x+1][y+1]+1:Math.max(lcs[x+1][y],lcs[x][y+1]);
 assert.deepEqual([i,j,built.join('')],[a.length,b.length,b.join('')]);
 assert.equal(ops.filter(op=>op===0).length,lcs[0][0]);
}
assert.deepEqual(editScript([1,2,3],[4,5,6],1),[1,1,1,2,2,2]);
assert.deepEqual(editScript([0,1,2,3,9],[0,4,5,6,9],1),[0,1,1,1,2,2,2,0]);
assert.equal(editScript([1,2,3],[4,5,6],1,true),null);
assert.deepEqual([lines(''),lines('a\n'),lines('a\r\nb'),lines('\n')],[[],['a'],['a','b'],['']]);
assert.deepEqual(lineDiff('','x\ny').map(line=>[line.kind,line.new]),[[2,1],[2,2]]);
assert.deepEqual(lineDiff('a\nb\n','a\r\nb').filter(line=>line.kind),[]);
assert.equal(lineDiff('x\nx\ny','x\ny\ny').filter(line=>line.kind===0).length,2);
const long=Array.from({length:1100},(_,index)=>`Bekezdés ${index}: `+'lorem ipsum dolor sit amet '.repeat(2)).join('\n').slice(0,60000),changed=long.split('\n');
changed[100]=changed[100].replace('dolor','DOLOR');changed.splice(500,1);changed.splice(800,0,'Új sor');
const started=performance.now(),result=lineDiff(long,changed.join('\n'));
assert.ok(performance.now()-started<250,'60 000 characters compare within 250 ms');
assert.deepEqual(result.filter(line=>line.kind).map(line=>[line.kind,line.old??line.new]),[[1,101],[2,101],[1,501],[2,801]]);
assert.deepEqual(words('A gyors barna róka.','A lassú barna róka!').after,[{text:'A ',changed:false},{text:'lassú',changed:true},{text:' barna róka',changed:false},{text:'!',changed:true}]);
assert.equal(words('abc','xyz'),null);
// Two thirds of each line kept: highlighted, although the shared characters are less than a third of both lines together.
assert.ok(words('A gyors barna róka.','A lassúbb barna róka.'));
// A word edit beyond the limit gives no highlights instead of the whole middle.
assert.equal(words(Array.from({length:500},(_,i)=>'a'+i).join(' ')+' end',Array.from({length:500},(_,i)=>'b'+i).join(' ')+' end'),null);
console.log('Toolkit components: facade and list lifecycle (mount targets, events, destroy, signals), view references and the TextDiff edit PASS');

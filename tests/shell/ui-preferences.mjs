import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../../packages/frontend/src/',import.meta.url));
const {outputFiles:[output]}=await build({stdin:{contents:'export {UiPreferences} from "./UiPreferences";export {account} from "./AccountPreferences";',resolveDir:source,loader:'ts'},bundle:true,write:false,format:'esm',logLevel:'silent'});
const {UiPreferences,account}=await import('data:text/javascript;base64,'+Buffer.from(output.text).toString('base64'));
globalThis.location={pathname:'/synthetic/'};
globalThis.innerWidth=1280;globalThis.innerHeight=720;
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
const first=new UiPreferences('user-a','items');
first.setMode('cards');first.setSort({field:'title',direction:'asc'});
assert.equal(new UiPreferences('user-a','items').mode(),'cards');
assert.equal(new UiPreferences('user-b','items').mode(),'table');
assert.equal(new UiPreferences('user-a','other').mode(),'table');
first.setMode('tiles');assert.equal(new UiPreferences('user-a','items').mode(),'tiles');assert.equal(new UiPreferences('user-b','items').mode(),'table');first.setMode('cards');
location.pathname='/other/';assert.equal(new UiPreferences('user-a','items').mode(),'table');location.pathname='/synthetic/';
assert.deepEqual(first.sort(['title']),{field:'title',direction:'asc'});assert.equal(first.sort(['id']),undefined);
const key=[...storage.keys()][0];
storage.set(key,JSON.stringify({columns:[null,{id:'gone',width:500},{id:'title',width:2000}],regions:{filter:{width:9000,collapsed:true},form:{collapsed:false}},sort:{field:'title',direction:'invalid'}}));
const stale=new UiPreferences('user-a','items');
const column={id:'title',minWidth:160,maxWidth:320,width:200};
const events={};stale.bindGrid({getColumn:id=>id==='title'?column:undefined,setColumns(){},events:{on:(name,handler)=>events[name]=handler},config:{columns:[column]}});
assert.equal(column.width,320);assert.equal(column.autoWidth,false);
assert.equal(stale.sort(['title']),undefined);
const tree={cols:[{id:'filter',width:300,minWidth:220,collapsable:true},{id:'form',width:380,collapsable:true,collapsed:true}]};
const restored=stale.layoutTree(tree);
assert.equal(restored.cols[0].width,1120);assert.equal(restored.cols[0].collapsed,true);assert.equal(restored.cols[1].collapsed,true);
assert.equal(tree.cols[0].width,300);
const layoutEvents={},cell={width:'365.5px',height:'240px',collapsed:false};
stale.bindLayout({getCell:()=>({config:cell}),getRootNode:()=>({addEventListener(){}}),events:{on:(name,handler)=>layoutEvents[name]=handler}},{rows:[{id:'filter',width:300,height:200,collapsable:true}]});
layoutEvents.resize('filter');
assert.deepEqual(JSON.parse(storage.get(key)).regions.filter,{width:365.5,height:240,collapsed:true});
layoutEvents.afterExpand('filter');assert.equal(JSON.parse(storage.get(key)).regions.filter.collapsed,false);
column.width=280;events.afterResizeEnd();assert.equal(JSON.parse(storage.get(key)).columns[0].width,280);
// Filter values: kept per user/resource; restoring applies the server's value rules to the current definitions.
const definitions=[{name:'zone',type:'select',options:{'1':'A','2':'B'}},{name:'done',type:'checkbox',options:{}},{name:'qty',type:'number',options:{}},{name:'title',type:'text',options:{}}];
const filtering=new UiPreferences('user-a','filtered');filtering.setFilters({zone:'2',title:'pol'});
assert.deepEqual(new UiPreferences('user-a','filtered').filters(definitions),{zone:'2',title:'pol'});
assert.deepEqual(new UiPreferences('user-b','filtered').filters(definitions),{});
filtering.setFilters({});assert.deepEqual(new UiPreferences('user-a','filtered').filters(definitions),{});
const filterKey=[...storage.keys()].find(stored=>stored.includes('filtered'));
storage.set(filterKey,JSON.stringify({filters:{zone:'9',done:'yes',qty:'1.5',title:'x'.repeat(256),gone:'1',secret:7}}));
assert.deepEqual(new UiPreferences('user-a','filtered').filters(definitions),{});
storage.set(filterKey,JSON.stringify({filters:{zone:'1',done:'0',qty:'12',title:'a'}}));
assert.deepEqual(new UiPreferences('user-a','filtered').filters(definitions),{zone:'1',done:'0',qty:'12',title:'a'});
for(const malformed of [null,[],'x']){storage.set(filterKey,JSON.stringify({filters:malformed}));assert.deepEqual(new UiPreferences('user-a','filtered').filters(definitions),{});}
// A Tree's stored expansion (FB-0168): absent until stored, an empty list is "everything collapsed", at most 200 ids.
const treePreferences=new UiPreferences('user-a','tree.key');assert.deepEqual(treePreferences.tree(),{});
treePreferences.setTree({selected:'1'});assert.deepEqual(new UiPreferences('user-a','tree.key').tree(),{selected:'1'});
treePreferences.setTree({expanded:[],selected:'1'});assert.deepEqual(new UiPreferences('user-a','tree.key').tree(),{expanded:[],selected:'1'});
treePreferences.setTree({expanded:Array.from({length:250},(_,index)=>String(index+1))});assert.equal(new UiPreferences('user-a','tree.key').tree().expanded.length,200);
for(const unknown of ['grid','TILES',7,null]){storage.set(key,JSON.stringify({mode:unknown}));assert.equal(new UiPreferences('user-a','items').mode(),'table');}
for(const invalid of ['invalid','null','[]']){storage.set(key,invalid);assert.equal(new UiPreferences('user-a','items').mode(),'table');}
globalThis.localStorage={getItem(){throw Error('Denied');},setItem(){throw Error('Quota');}};
const denied=new UiPreferences('user-a','items');denied.setMode('cards');assert.equal(denied.mode(),'cards');denied.setMode('tiles');assert.equal(denied.mode(),'tiles');
// The account store (docs/user-preferences-plan.md), with timers that fire at once.
const memory=new Map();
globalThis.localStorage={get length(){return memory.size;},key:index=>[...memory.keys()][index]??null,getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)};
globalThis.innerWidth=1366;location.pathname='/account/';
const realTimeout=globalThis.setTimeout;globalThis.setTimeout=handler=>realTimeout(handler,1);
const tick=async(rounds=30)=>{for(let i=0;i<rounds;i++)await new Promise(resolve=>realTimeout(resolve,1));};
const uiKey=(resource,user='7')=>'blade-ui:1:'+JSON.stringify(['/account/',user,resource]),doneKey='blade-prefs-migrated:1:'+JSON.stringify(['/account/','7']);
const sent=[];let status=200;
const send=async(values,keepalive)=>{sent.push({values:JSON.parse(values),keepalive});if(status===0)throw new TypeError('offline');return status;};
const fresh=(entries={},extra={})=>{memory.clear();memory.set(doneKey,'1');sent.length=0;status=200;return {entries,generation:0,user:'7',tenant:null,send,...extra};};
// Fill-only migration of what the server lacks; window geometry and existing entries stay out; the marker stops a repeat.
let options=fresh({'@skin':'kept','list':{sort:{field:'a',direction:'asc'}}},{tenant:'3'});memory.delete(doneKey);
memory.set(uiKey('list'),JSON.stringify({mode:'cards',columns:[{id:'a',width:300}],filters:{q:'old'}}));memory.set(uiKey('window:w'),JSON.stringify({window:{left:1,top:1,width:400,height:300}}));
memory.set('blade-guide:2:'+JSON.stringify(['/account/','7','guided']),'1');memory.set('blade-theme','dark');memory.set('blade-theme-owner:blade-theme','7');
account.configure(options);await tick();
assert.equal(sent.length,1);assert.equal(sent[0].values.fill,true);assert.equal(sent[0].values.generation,0);
assert.deepEqual(Object.keys(sent[0].values.set).sort(),['@theme','guide:guided','list|wide']);assert.equal(memory.get(doneKey),'1');
const composed=new UiPreferences('7','list');assert.equal(composed.mode(),'table');assert.deepEqual(composed.sort(['a']),{field:'a',direction:'asc'});
assert.deepEqual(composed.filters([{name:'q',type:'text',options:{}}]),{});assert.equal(account.value('guide:guided',()=>undefined),1);assert.equal(new UiPreferences('8','list').mode(),'table');
// A write reaches memory at once and one save carries its part's entry and the page's generation.
sent.length=0;composed.setMode('tiles');composed.setMode('cards');assert.equal(new UiPreferences('7','list').mode(),'cards');assert.equal(sent.length,0);await tick();
assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0].values.set),['list']);assert.equal(sent[0].values.generation,0);
sent.length=0;composed.setFilters({q:'new'});await tick();assert.deepEqual(Object.keys(sent[0].values.set),['list|t:3']);
// Sizes follow the device class, and a change in one class leaves the other alone.
sent.length=0;globalThis.innerWidth=390;const phone=new UiPreferences('7','list');const phoneColumn={id:'a',width:120},phoneEvents={};
phone.bindGrid({getColumn:()=>phoneColumn,setColumns(){},events:{on:(name,handler)=>phoneEvents[name]=handler},config:{columns:[phoneColumn]}});phoneEvents.afterResizeEnd();await tick();
assert.deepEqual(Object.keys(sent[0].values.set),['list|narrow']);globalThis.innerWidth=1366;assert.equal(account.value('list|wide',()=>undefined).columns[0].width,300);
// With tenancy but no active tenant, old browser filters and tree ids are neither read nor migrated.
options=fresh({},{tenant:null,tenancy:true});memory.delete(doneKey);memory.set(uiKey('tenanted'),JSON.stringify({mode:'cards',filters:{q:'other tenant'},tree:{selected:'9'}}));account.configure(options);
{const view=new UiPreferences('7','tenanted');assert.equal(view.mode(),'cards');assert.deepEqual(view.filters([{name:'q',type:'text',options:{}}]),{});assert.deepEqual(view.tree(),{});await tick();assert.deepEqual(sent[0].values.set,{tenanted:{mode:'cards'}});}
options=fresh({},{tenant:null,tenancy:false});memory.delete(doneKey);memory.set(uiKey('plain'),JSON.stringify({filters:{q:'kept'}}));account.configure(options);await tick();assert.deepEqual(sent[0].values.set,{plain:{filters:{q:'kept'}}});
// One save at a time; a change during it goes in the next save, and only the sent text is marked clean.
{const replies=[];const held=(values,keepalive)=>{replies.push({values:JSON.parse(values),keepalive});return new Promise(resolve=>replies.at(-1).resolve=resolve);};
account.configure({...fresh(),send:held});account.write('k',1);await tick();account.write('k',2);account.write('m',1);await tick();assert.equal(replies.length,1);
replies[0].resolve(200);await tick();assert.equal(replies.length,2);assert.deepEqual(replies[1].values.set,{k:2,m:1});replies[1].resolve(200);await tick();assert.equal(replies.length,2);
// The page-hide save carries the in-flight and the queued entries with their newest values.
account.write('k',3);await tick();assert.equal(replies.length,3);account.write('k',4);account.write('q',1);account.leave();await tick();
assert.equal(replies.length,4);assert.equal(replies[3].keepalive,true);assert.deepEqual(replies[3].values.set,{k:4,q:1});replies[3].resolve(200);replies[2].resolve(200);await tick();}
// A refused patch is split, only the entry refused alone is dropped, and the migration marker waits for every entry.
{const saved=[],warned=console.warn;console.warn=()=>{};const strict=async values=>{if(values.includes('poison'))return 400;saved.push(...Object.keys(JSON.parse(values).set??{}));return 200;};
account.configure({...fresh(),send:strict});for(const key of ['one','poison','two','three'])account.write(key,key);await tick(60);assert.deepEqual(saved.sort(),['one','three','two']);
const migrate=fresh();memory.delete(doneKey);for(const name of ['good','poison','fine'])memory.set(uiKey('scope:demo.'+name),JSON.stringify({value:name}));saved.length=0;account.configure({...migrate,send:strict});await tick(60);
assert.deepEqual(saved.sort(),['scope:demo.fine','scope:demo.good']);assert.equal(memory.get(doneKey),'1');
const offline=fresh();memory.delete(doneKey);memory.set(uiKey('scope:demo.x'),'{"a":1}');account.configure({...offline,send:async()=>503});await tick();assert.equal(memory.has(doneKey),false);console.warn=warned;}
// An oversized value stays in this page with a warning; a patch is split below the request limit; text is ASCII.
{const warn=console.warn;let warned=0;console.warn=()=>warned++;account.configure(fresh());account.write('huge',{text:'x'.repeat(33000)});account.write('wide',{text:' '.repeat(6000)});account.write('small',{ok:'😀'});await tick();console.warn=warn;
assert.equal(warned,2);assert.deepEqual(Object.keys(sent[0].values.set),['small']);assert.equal(sent[0].values.set.small.ok,'😀');assert.equal(account.value('huge',()=>undefined).text.length,33000);
sent.length=0;for(let index=0;index<4;index++)account.write('part'+index,{text:'y'.repeat(30000)});await tick(60);assert.ok(sent.length>=2);for(const item of sent)assert.ok(JSON.stringify(item.values).length<61440);}
// A theme is owned: another account's or a guest's never migrates or applies; an unowned old one still shows here.
{let options=fresh();memory.delete(doneKey);memory.set('blade-theme','dark');memory.set('blade-theme-owner:blade-theme','8');account.configure(options);await tick();assert.equal(sent.some(item=>item.values.set?.['@theme']),false);assert.equal(account.theme('@theme','blade-theme'),undefined);
options=fresh();memory.delete(doneKey);memory.set('blade-theme','dark');account.configure(options);await tick();assert.equal(sent.some(item=>item.values.set?.['@theme']),false);assert.equal(account.theme('@theme','blade-theme'),'dark');
options=fresh({'@theme':'light'});account.configure(options);assert.equal(account.theme('@theme','blade-theme'),'light');assert.equal(memory.get('blade-theme-owner:blade-theme'),'7');}
// A new page takes the server document as the truth: a local value that never reached the server is gone.
{let options=fresh({kept:{a:1}});status=503;account.configure(options);account.write('kept',{a:2});await tick(3);status=200;options={...options,entries:{kept:{a:1}}};sent.length=0;account.configure(options);await tick();assert.deepEqual(account.value('kept',()=>0),{a:1});assert.equal(sent.length,0);}
// Reset generation: a mismatch stops this page and drops its changes; a device behind a reset does not migrate.
{let calls=0;account.configure({...fresh(),send:async()=>{calls++;return 409;}});account.write('late',1);await tick();assert.equal(calls,1);account.write('later',2);account.leave();await tick();assert.equal(calls,1);
const behind=fresh({},{generation:2});memory.delete(doneKey);memory.set(uiKey('scope:demo.old'),'{"a":1}');account.configure(behind);await tick();assert.equal(sent.length,0);assert.equal(account.value('scope:demo.old',()=>({a:1})),undefined);
account.write('next',1);await tick();assert.equal(sent[0].values.generation,2);}
// Reset waits for the save in flight, stops a running migration and clears this user's browser copies only.
{const order=[];let release;const slow=values=>{const body=JSON.parse(values);order.push(body.reset?'reset':'save');return body.reset?Promise.resolve(200):new Promise(resolve=>{release=()=>{order.push('saved');resolve(200);};});};
const reset=fresh();memory.delete(doneKey);for(let i=0;i<3;i++)memory.set(uiKey('scope:demo.big'+i),JSON.stringify({text:'z'.repeat(30000)}));memory.set('blade-uploads:7','[]');memory.set(uiKey('list','8'),'{}');account.configure({...reset,send:slow});await tick();
const done=account.reset();await tick();assert.deepEqual(order,['save']);release();await done;assert.deepEqual(order,['save','saved','reset']);await tick();assert.equal(order.length,3);
assert.equal(memory.has(uiKey('scope:demo.big0')),false);assert.equal(memory.has('blade-uploads:7'),true);assert.equal(memory.has(uiKey('list','8')),true);}
// A view open across 768 px continues from the sizes of the class it is in.
{account.configure(fresh({'v|wide':{regions:{a:{width:500}}},'v|narrow':{regions:{b:{width:90}}}}));globalThis.innerWidth=1366;const view=new UiPreferences('7','v');const cell={width:'300px'},handlers={};
view.bindLayout({getCell:()=>({config:cell}),getRootNode:()=>({addEventListener(){}}),events:{on:(name,handler)=>handlers[name]=handler}},{cols:[{id:'c',width:200}]});globalThis.innerWidth=390;handlers.resize('c');
assert.deepEqual(account.value('v|narrow',()=>0).regions,{b:{width:90},c:{width:300}});assert.deepEqual(account.value('v|wide',()=>0).regions,{a:{width:500}});globalThis.innerWidth=1366;await tick();}
// Retries pause while hidden and stop at the page's cap; a stored __proto__ never becomes the state's prototype.
{let calls=0;globalThis.document={visibilityState:'hidden'};account.configure({...fresh(),send:async()=>{calls++;return 503;}});account.write('r',1);await tick();assert.equal(calls,1);
document.visibilityState='visible';account.resume();await tick(120);assert.equal(calls,8);account.resume();await tick();assert.equal(calls,8);delete globalThis.document;
account.configure(fresh(JSON.parse('{"p":{"__proto__":{"polluted":1},"mode":"cards"}}')));const safe=new UiPreferences('7','p');assert.equal(safe.mode(),'cards');assert.equal(safe.state.polluted,undefined);assert.equal(Object.getPrototypeOf(safe.state),Object.prototype);}
{
 let sent=0;account.configure({...fresh({kept:{mode:'cards'}}),unreadable:true,send:async()=>{sent++;return 200;}});
 assert.equal(account.active,false);assert.equal(account.resettable,true);account.write('k',1);await tick();assert.equal(sent,0,'an unreadable document is not written');
 await account.reset();assert.equal(sent,1,'the user can still reset it');
}
globalThis.setTimeout=realTimeout;
console.log('UI preferences: isolation, tiles mode, filters, stale schema, bounds, malformed/denied storage, account store PASS');

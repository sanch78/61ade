// Toolkit kernel units without a browser: node tests/shell/toolkit-kernel.mjs (routes, registries, event bus).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const load=async file=>{
 const source=await readFile(new URL('../../packages/frontend/src/'+file,import.meta.url),'utf8');
 const {code}=await transform(source,{loader:'ts',format:'esm'});
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
};
const {parseRoute,routeHash}=await load('app/routes.ts');
const {NamedRegistry}=await load('app/registries.ts');
const {createEventBus}=await load('api/Events.ts');

// Routes: canonical #view=, record, filter presets; #feature= is the rewritten legacy alias.
assert.deepEqual(parseRoute('#view=demo_tasks'),{view:'demo_tasks',record:undefined,filters:{},legacy:false,canonical:'view=demo_tasks'});
assert.deepEqual(parseRoute('#view=demo.asset-viewer&record=42'),{view:'demo.asset-viewer',record:'42',filters:{},legacy:false,canonical:'view=demo.asset-viewer&record=42'});
const legacy=parseRoute('#feature=demo_shelf_zones&filter.shelf=7');
assert.equal(legacy.view,'demo_shelf_zones');assert.equal(legacy.legacy,true);assert.deepEqual(legacy.filters,{shelf:'7'});
assert.equal(legacy.canonical,'view=demo_shelf_zones&filter.shelf=7');
assert.equal(parseRoute('#view=a&feature=b').view,'a');assert.equal(parseRoute('#view=a&feature=b').legacy,false);assert.equal(parseRoute('#view=a&feature=b').canonical,'view=a');
for(const empty of ['','#','#view=','#feature=','#record=1','#filter.x=1'])assert.equal(parseRoute(empty).view,undefined,empty);
assert.deepEqual(parseRoute('#view=x&filter.=1&filter.a=%20b').filters,{a:' b'});
assert.equal(parseRoute('#view=%C3%A1rak').view,'árak');
assert.equal(routeHash({view:'demo_shelves'}),'view=demo_shelves');
assert.equal(routeHash({view:'demo.viewer',record:'4 2'}),'view=demo.viewer&record=4+2');
assert.equal(routeHash({view:'zones',filters:{shelf:'7'}}),'view=zones&filter.shelf=7');
assert.deepEqual(parseRoute('#'+routeHash({view:'v',record:'r&1',filters:{f:'a=b'}})),{view:'v',record:'r&1',filters:{f:'a=b'},legacy:false,canonical:'view=v&record=r%261&filter.f=a%3Db'});

// Registries: names, built-ins without a dot, project names with one, duplicates only with replace.
const kinds=new NamedRegistry('view kind'),entry={create(){}};
kinds.builtin('list',entry);
assert.throws(()=>kinds.builtin('list',entry),/already registered/);
assert.throws(()=>kinds.register('player',entry),TypeError);
for(const invalid of ['','Demo.player','1demo.x','demo player','demo:x',null])assert.throws(()=>kinds.register(invalid,entry),TypeError,String(invalid));
kinds.register('demo.player',entry);
assert.throws(()=>kinds.register('demo.player',{create(){}}),error=>!(error instanceof TypeError)&&/already registered/.test(error.message));
const replacement={create(){}};kinds.register('demo.player',replacement,{replace:true});assert.equal(kinds.get('demo.player'),replacement);
const list={create(){}};kinds.register('list',list,{replace:true});assert.equal(kinds.get('list'),list);
assert.throws(()=>kinds.register('calendar',entry,{replace:true}),TypeError,'replace needs an existing built-in');
assert.throws(()=>kinds.register('demo.empty',null),TypeError);
assert.deepEqual(kinds.names(),['list','demo.player']);assert.equal(kinds.has('demo.player'),true);assert.equal(kinds.get('missing'),undefined);

// Event bus: order, isolation of a throwing handler, unsubscribe, signal, framework names reserved.
const bus=createEventBus(),seen=[],error=console.error;let logged=0;console.error=()=>{logged++;};
try{
 bus.on('demo.loaded',payload=>seen.push(['a',payload]));
 bus.on('demo.loaded',()=>{throw new Error('handler');});
 const off=bus.on('demo.loaded',payload=>seen.push(['c',payload]));
 bus.emit('demo.loaded',1);off();bus.emit('demo.loaded',2);
 assert.deepEqual(seen,[['a',1],['c',1],['a',2]]);assert.equal(logged,2);
 const controller=new AbortController();bus.on('demo.signal',()=>seen.push('signal'),controller.signal);controller.abort();bus.emit('demo.signal',null);
 const aborted=new AbortController();aborted.abort();bus.on('demo.signal',()=>seen.push('late'),aborted.signal);bus.emit('demo.signal',null);
 assert.equal(seen.includes('signal')||seen.includes('late'),false);
 assert.throws(()=>bus.emit('upload:complete',{}),/framework event/);assert.throws(()=>bus.emit('loaded',{}),TypeError);
 const framework=[];bus.on('module:error',payload=>framework.push(payload));bus.dispatch('module:error',{module:'app/main.js',reason:'init'});
 assert.deepEqual(framework,[{module:'app/main.js',reason:'init'}]);
 const handler=()=>seen.push('off');bus.on('demo.off',handler);bus.off('demo.off',handler);bus.emit('demo.off',null);assert.equal(seen.includes('off'),false);
}finally{console.error=error;}
console.log('Toolkit kernel: routes and #feature alias, registry names/duplicates/replace, event bus PASS');

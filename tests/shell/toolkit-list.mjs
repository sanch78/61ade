// List activation map without a browser: node tests/shell/toolkit-list.mjs (toolkit O5, docs/toolkit.md#activation-map).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const source=await readFile(new URL('../../packages/frontend/src/components/list/activation.ts',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'ts',format:'esm'});
const {declaredTarget,resolveActivation}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

// Declared target: a plain string, or the row's entry of a {field, map} by the string value of the field; "*" is the default.
const map={field:'kind',map:{audio:'view:demo.player',video:'view:demo.player','1':'archive','*':'details'}};
assert.equal(declaredTarget(undefined,{id:'1'}),undefined);
assert.equal(declaredTarget('subview',{id:'1'}),'subview');
assert.equal(declaredTarget(map,{id:'1',kind:'audio'}),'view:demo.player');
assert.equal(declaredTarget(map,{id:'1',kind:'image'}),'details');
assert.equal(declaredTarget(map,{id:'1',kind:1}),'archive','numbers match by their string value');
assert.equal(declaredTarget(map,{id:'1',kind:true}),'archive','a checkbox true is "1"');
assert.equal(declaredTarget(map,{id:'1'}),'details','an unreadable (absent) field takes the default entry');
assert.equal(declaredTarget({field:'kind',map:{audio:'details'}},{id:'1',kind:'video'}),undefined,'no entry and no "*": the default behaviour');
assert.equal(declaredTarget({field:'kind',map:{audio:'details'}},{id:'1',kind:null}),undefined);
// A media field is keyed by its file's MIME class, not by the file id; no (visible) file is the empty value.
const media={field:'file_id',map:{audio:'view:demo.player',video:'view:demo.player','*':'details'}};
assert.equal(declaredTarget(media,{id:'1',file_id:'12',_media:{file_id:{id:'12',mime_type:'audio/mpeg'}}}),'view:demo.player');
assert.equal(declaredTarget(media,{id:'1',file_id:'13',_media:{file_id:{id:'13',mime_type:'image/png'}}}),'details');
assert.equal(declaredTarget(media,{id:'1',file_id:'14',_media:{file_id:null}}),'details','a hidden or missing file takes the default entry');
assert.equal(declaredTarget({field:'file_id',map:{'14':'details'}},{id:'1',file_id:'14',_media:{file_id:null}}),undefined,'the file id is not the key of a media field');
assert.equal(declaredTarget({field:'file_id',map:{'12':'details'}},{id:'1',file_id:'12',_media:{other:{id:'1',mime_type:'audio/wav'}}}),'details','a field without a media slot keeps its value');
for(const invalid of [null,1,{},{field:'kind'},{map:{}}])assert.equal(declaredTarget(invalid,{id:'1',kind:'audio'}),undefined);

const player={id:'demo.player',title:'Lejátszó',record:'assets'};
const context=(extra={})=>({resource:'assets',actions:[{name:'update',label:'Módosítás'},{name:'archive',label:'Archiválás'}],scoped:false,compact:false,
 viewDefinition:id=>id==='demo.player'?player:id==='other'?{id:'other',title:'Más',record:'files'}:undefined,labels:{details:'Adatok',children:'Alelemek'},...extra});
const row={id:'7',kind:'audio',_actions:['get','update','archive']};
// view:<id>: the offered record view of this resource, for a row that offers get.
assert.deepEqual(resolveActivation('view:demo.player',row,context()),{kind:'view',target:'view:demo.player',label:'Lejátszó',view:'demo.player'});
for(const [name,why,ctx,r] of [
 ['view:missing','not offered',context(),row],
 ['view:other','a record view of another resource',context(),row],
 ['view:demo.player','the row does not offer get',context(),{...row,_actions:['update']}],
 ['view:demo.player','no application (fixture list)',context({viewDefinition:undefined}),row],
 ['view:demo.player','a compact preview',context({compact:true,scoped:true}),row],
 ['archive','the row does not offer the action',context(),{...row,_actions:['get']}],
 ['subview','no resolved sub-view',context(),row],
 ['page','no resolved sub-view',context(),row],
 ['details','declared',context(),row],
])assert.deepEqual(resolveActivation(name,r,ctx),{kind:'details',target:'details',label:'Adatok'},name+': '+why);
assert.equal(resolveActivation('view:demo.player',{id:'7'},context()).kind,'view','rows without _actions are not refused');
// Record actions and the default (update form when offered).
assert.deepEqual(resolveActivation('archive',row,context()),{kind:'action',target:'archive',label:'Archiválás',action:'archive'});
assert.equal(resolveActivation(undefined,row,context()).target,'update');
assert.equal(resolveActivation(undefined,{...row,_actions:['get']},context()).target,'details');
// Sub-views: the window (also from `page` in a scoped view), the page only from a menu page with the field filter.
const child={id:'items',title:'Tételek',filters:[{name:'shelf_id'}]};
const sub={subview:{field:'shelf_id',view:child,page:true}};
assert.deepEqual(resolveActivation('page',row,context(sub)),{kind:'page',target:'page',label:'Tételek',view:'items',field:'shelf_id'});
assert.deepEqual(resolveActivation('page',row,context({...sub,scoped:true})),{kind:'subview',target:'subview',label:'Tételek'});
assert.deepEqual(resolveActivation('page',row,context({subview:{field:'shelf_id',view:{...child,filters:[]},page:true}})),{kind:'subview',target:'subview',label:'Tételek'});
assert.deepEqual(resolveActivation('subview',row,context({subview:{field:'parent_id',shared:true}})),{kind:'subview',target:'subview',label:'Alelemek'});
assert.equal(resolveActivation('subview',row,context({...sub,compact:true,scoped:true})).kind,'details');
// The map and the resolution together: per row in one list.
const targets=[{id:'1',kind:'audio'},{id:'2',kind:'image'},{id:'3',kind:'video',_actions:['update']}].map(r=>resolveActivation(declaredTarget(map,r),{...r,_actions:r._actions??['get']},context()).target);
assert.deepEqual(targets,['view:demo.player','details','details']);
console.log('Toolkit list: activation map per row, view:<id> targets and their details fallback PASS');

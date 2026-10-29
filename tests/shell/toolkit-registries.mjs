// Presentation, field-type and command registries without a browser: node tests/shell/toolkit-registries.mjs
// (toolkit P3 C-5, docs/toolkit.md#registries): column resolution, fallbacks with one warning, command lists and rules.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const load=async file=>{
 const source=await readFile(new URL('../../packages/frontend/src/'+file,import.meta.url),'utf8');
 const {code}=await transform(source,{loader:'ts',format:'esm'});
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
};
const {NamedRegistry,resolveColumn,fieldTypeOf,resolveCommands,commandEnabled,placed,commandId,extensions}=await load('app/registries.ts');
const {builtinCommands,LIST}=await load('components/list/commands.ts');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=(column,row)=>column.options?.[String(row[column.id])]??String(row[column.id]??'');
const helpers={escape,plain};
const warnings=[],errors=[],{warn,error}=console;
console.warn=message=>warnings.push(String(message));console.error=(message)=>errors.push(String(message));
try{
 assert.equal(Object.keys(extensions).length,0,'nothing is bound before createApplication');
 const presentations=new NamedRegistry('presentation'),fieldTypes=new NamedRegistry('field type');
 const calls=[];
 presentations.register('demo.bar',{render:(value,row,column,size,esc)=>{calls.push([size,column.id,row.id]);return `<b data-size="${size}">${esc(value)}</b>`;},text:value=>'Érték: '+value});
 presentations.register('demo.broken',{render:()=>{throw new Error('render');}});
 presentations.builtin('image',{render:(value,row,column,size)=>`<img data-size="${size}" alt="">`});
 fieldTypes.register('demo.rating',{input:field=>({type:'slider',name:field.name}),display:(value,row,field,size,esc)=>`★${esc(value)}/${field.label}/${size}`});
 fieldTypes.register('demo.plain',{input:field=>({type:'input',name:field.name})});
 const registries={presentations,fieldTypes};
 const row={id:'7',score:'<3>',kind:'a',priority:'4'};

 // A registered presentation renders per size with the given escape; text() for titles; the server column is passed.
 const bar=resolveColumn({id:'score',header:'Pont',presentation:'demo.bar'},undefined,helpers,registries);
 assert.equal(bar.render(row,'cell'),'<b data-size="cell">&lt;3&gt;</b>');
 assert.equal(bar.render(row,'card'),'<b data-size="card">&lt;3&gt;</b>');
 assert.equal(bar.text(row),'Érték: <3>');
 assert.equal(bar.fieldType,undefined);
 assert.deepEqual(calls,[['cell','score','7'],['card','score','7']]);
 // A throwing renderer gives the escaped plain text and is logged once per column.
 const broken=resolveColumn({id:'kind',header:'Fajta',presentation:'demo.broken',options:{a:'<A>'}},undefined,helpers,registries);
 assert.equal(broken.render(row,'cell'),'&lt;A&gt;');assert.equal(broken.render(row,'tile'),'&lt;A&gt;');
 assert.equal(errors.filter(line=>line.includes('"demo.broken"')).length,1,'one log per column');
 // Unknown names: no renderer (plain rendering) and one warning per name; icon stays internal; image resolves.
 const unknown=resolveColumn({id:'kind',header:'Fajta',presentation:'demo.missing'},undefined,helpers,registries);
 resolveColumn({id:'other',header:'Más',presentation:'demo.missing'},undefined,helpers,registries);
 assert.equal(unknown.render,undefined);
 assert.equal(warnings.filter(line=>line.includes('presentation "demo.missing"')).length,1,'one warning per unknown name');
 const icon=resolveColumn({id:'kind',header:'Ikon',presentation:'icon',options:{'dxi dxi-file':'Fájl'}},undefined,helpers,registries);
 assert.equal(icon.render,undefined);assert.equal(warnings.some(line=>line.includes('"icon"')),false);
 const image=resolveColumn({id:'file',header:'Kép',presentation:'image',imageBase:'img/'},undefined,helpers,registries);
 assert.equal(image.render(row,'tile'),'<img data-size="tile" alt="">');
 assert.equal(resolveColumn({id:'file',header:'Kép',presentation:'image'},undefined,helpers,{}).render,undefined,'no registry: the built-in image renderer');
 assert.equal(warnings.some(line=>line.includes('"image"')),false);
 // Field types: display with the field metadata (or one derived from the column), the fieldType flag; presentation wins.
 const field={name:'priority',label:'Prioritás',type:'number',required:false,max:5,options:{},editor:'demo.rating'};
 const rating=resolveColumn({id:'priority',header:'Prio'},field,helpers,registries);
 assert.equal(rating.fieldType,true);assert.equal(rating.render(row,'card'),'★4/Prioritás/card');
 const derived=resolveColumn({id:'priority',header:'Prio',editor:'demo.rating'},undefined,helpers,registries);
 assert.equal(derived.render(row,'cell'),'★4/Prio/cell','field metadata derived from the column');
 const both=resolveColumn({id:'priority',header:'Prio',presentation:'demo.bar',editor:'demo.rating'},undefined,helpers,registries);
 assert.equal(both.render(row,'cell'),'<b data-size="cell">4</b>');assert.equal(both.fieldType,true);
 const noDisplay=resolveColumn({id:'priority',header:'Prio',editor:'demo.plain'},undefined,helpers,registries);
 assert.equal(noDisplay.render,undefined);assert.equal(noDisplay.fieldType,true);
 const missing=resolveColumn({id:'priority',header:'Prio',editor:'demo.gone'},undefined,helpers,registries);
 assert.equal(missing.fieldType,undefined);assert.equal(missing.render,undefined);
 assert.equal(fieldTypeOf({editor:'demo.gone'},fieldTypes),undefined);
 assert.equal(warnings.filter(line=>line.includes('field type "demo.gone"')).length,1);
 assert.equal(fieldTypeOf({editor:'demo.rating'},fieldTypes),fieldTypes.get('demo.rating'));
 assert.equal(fieldTypeOf({},fieldTypes),undefined);assert.equal(fieldTypeOf({editor:''},fieldTypes),undefined);
 const untouched={id:'title',header:'Cím',type:'text'};
 assert.deepEqual(resolveColumn(untouched,undefined,helpers,registries),untouched,'an ordinary column is unchanged');

 // Commands: built-in first, then the declared order; duplicates once; unknown or run-less entries skipped with a warning.
 const commands=new NamedRegistry('command');
 for(const [name,command] of Object.entries(builtinCommands))commands.builtin(name,command);
 const copy={label:'Másolás',placement:'both',run(){}},share={label:'Megosztás',placement:'toolbar',run(){}},open={label:'Megnyitás',placement:'record',run(){}};
 commands.register('demo.copy',copy);commands.register('demo.share',share);commands.register('demo.open',open);commands.register('demo.norun',{label:'X',placement:'toolbar'});
 const list=resolveCommands(['details'],['demo.share','demo.copy','demo.missing','demo.copy','demo.norun','demo.open',7],commands);
 assert.deepEqual(list.map(command=>command.name),['details','demo.share','demo.copy','demo.open']);
 assert.deepEqual(list.map(command=>command.id),['blade-command:details','blade-command:demo.share','blade-command:demo.copy','blade-command:demo.open']);
 assert.equal(commandId('demo.copy'),'blade-command:demo.copy');
 assert.ok(warnings.some(line=>line.includes('command "demo.missing"'))&&warnings.some(line=>line.includes('command "demo.norun"')));
 assert.deepEqual(resolveCommands(['details'],undefined,undefined,builtinCommands).map(command=>command.entry),[builtinCommands.details],'no registry: the built-in entry');
 assert.deepEqual(resolveCommands([],['demo.copy'],undefined,builtinCommands),[],'no registry: no project command');
 const replaced={label:'Saját adatok',placement:'toolbar',run(){}};commands.register('details',replaced,{replace:true});
 assert.equal(resolveCommands(['details'],[],commands)[0].entry,replaced,'a replaced built-in is used');
 assert.deepEqual(list.filter(command=>placed(command.entry,'toolbar')).map(command=>command.name),['details','demo.share','demo.copy']);
 assert.deepEqual(list.filter(command=>placed(command.entry,'record')).map(command=>command.name),['demo.copy','demo.open']);
 // Enabled rules: toolbar default on, record default with a row, own rule, a throw disables (logged).
 const context=(extra={})=>({app:{},view:{id:'v'},rows:[],signal:new AbortController().signal,...extra});
 assert.equal(commandEnabled(share,context(),'toolbar'),true);
 assert.equal(commandEnabled(open,context(),'record'),false);assert.equal(commandEnabled(open,context({row:{id:'1'}}),'record'),true);
 assert.equal(commandEnabled({...share,enabled:({row})=>row?.id==='2'},context({row:{id:'2'}}),'toolbar'),true);
 const logged=errors.length;
 assert.equal(commandEnabled({...share,enabled:()=>{throw new Error('x');}},context(),'toolbar'),false);assert.equal(errors.length,logged+1);
 // The built-in details: one record, not several marks; it reaches the list's own details through the internal hook.
 const details=builtinCommands.details,shown=[];
 assert.equal(details.label,'Adatok');assert.equal(details.placement,'toolbar');
 assert.equal(commandEnabled(details,context(),'toolbar'),false);
 assert.equal(commandEnabled(details,context({row:{id:'1'},rows:[{id:'1'}]}),'toolbar'),true);
 assert.equal(commandEnabled(details,context({row:{id:'1'},rows:[{id:'1'},{id:'2'}]}),'toolbar'),false);
 details.run(context({row:{id:'5'},[LIST]:{details:row=>shown.push(row.id)}}));details.run(context({[LIST]:{details:row=>shown.push(row.id)}}));
 assert.deepEqual(shown,['5']);
}finally{console.warn=warn;console.error=error;}
console.log('Toolkit registries: presentations, field types, fallbacks with one warning, client command lists and rules PASS');

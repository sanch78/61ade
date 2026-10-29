<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Diagram\DiagramDefinition;
use Blade\Feature\{Registry,Workspace,Context,Failure};
use Blade\Shell\Identity;
// Diagram editor contract: definition checks, metadata, ACL, canonical save, revisions, runtime element types.
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message):Failure{try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.': '.$e->getMessage().')');return $e;}throw new RuntimeException($message.' (accepted)');}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$nodes=['router'=>['label'=>'Router','glyph'=>'router','color'=>'#ef6c00','shape'=>'circle'],'switch'=>['label'=>'Switch','glyph'=>'switch','color'=>'#0288d1']];
$links=['ethernet'=>['label'=>'Ethernet','color'=>'#607d8b'],'wifi'=>['label'=>'Wi-Fi','color'=>'#0288d1','style'=>'dashed']];
$definition=new DiagramDefinition('net','Network','test',$nodes,$links,maxNodes:3,maxLinks:2,maxCustomTypes:2);
$definition->install($db);$definition->install($db);
foreach([
    fn()=>new DiagramDefinition('net','Network','test',[],$links),
    fn()=>new DiagramDefinition('net','Network','test',['custom-1'=>$nodes['router']],$links),
    fn()=>new DiagramDefinition('net','Network','test',['x'=>['label'=>'X','glyph'=>'unknown','color'=>'#000000']],$links),
    fn()=>new DiagramDefinition('net','Network','test',['x'=>['label'=>'X','glyph'=>'box','color'=>'red']],$links),
    fn()=>new DiagramDefinition('net','Network','test',$nodes,['x'=>['label'=>'X','color'=>'#000000','style'=>'wavy']]),
    fn()=>new DiagramDefinition('net','Network','Bad space',$nodes,$links),
] as $invalid){try{$invalid()->storage($db);throw new RuntimeException('invalid definition accepted');}catch(InvalidArgumentException){}}

$registry=new Registry();$workspace=new Workspace($registry,$db);$definition->register($workspace);
$rule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'net',?,'ui','allow','all','','')");
foreach(['list','get','create','save','delete','type_create','type_delete'] as $a)$rule->execute(['1',$a]);
foreach(['list','get'] as $a)$rule->execute(['2',$a]);
$ctx=fn(string $actor='1')=>new Context(new Identity($actor,'Actor '.$actor),'ui',$workspace->acl,$db);
$call=fn(string $action,?string $id,array $values=[],string $actor='1')=>$workspace->executor->execute($ctx($actor),'net',$action,$id,$values);

// Metadata: palette and link types only; read-only actors get only read actions; no rule, no view.
$view=fn($actor)=>array_values(array_filter($workspace->views(new Identity($actor,'x')),fn($v)=>$v['resource']==='net'));
check($view('1')[0]['kind']==='diagram'&&array_column($view('1')[0]['options']['nodeTypes'],'id')===['router','switch'],'Palette metadata');
check(!str_contains(json_encode($view('1')),'"test"'),'Space key stays server-side');
check(array_column($view('2')[0]['actions'],'name')===['list','get'],'Read-only actions');
check($view('3')===[],'No view without rules');

// Create, list, unique names, read-only actor cannot write.
$created=$call('create',null,['name'=>'Office']);check($created['revision']==='1','Created');
$error=fails(fn()=>$call('create',null,['name'=>'office']),409,'Case-insensitive unique name');check(isset($error->fieldErrors['name']),'Name field error');
fails(fn()=>$call('create',null,['name'=>'Other'],'2'),403,'Reader cannot create');
fails(fn()=>$call('list','test'),404,'Space id is not addressable');
check(array_column($call('list',null,[],'2')['diagrams'],'name')===['Office'],'Reader lists diagrams');
$id=$created['id'];

// Canonical save: unknown keys, types, dangling or duplicate links and limits are rejected.
$doc=fn(array $nodes,array $links=[])=>json_encode(['nodes'=>$nodes,'links'=>$links]);
$n=fn($id,$type='router',$x=0,$y=0)=>['id'=>$id,'type'=>$type,'label'=>'Node '.$id,'detail'=>'10.0.0.1','x'=>$x,'y'=>$y];
$l=fn($id,$s,$t,$type='ethernet')=>['id'=>$id,'source'=>$s,'target'=>$t,'type'=>$type,'label'=>''];
$saved=$call('save',$id,['content'=>$doc([$n('a'),$n('b','switch',100.4,-20)],[$l('x','a','b')]),'revision'=>'1']);
check($saved['revision']==='2','Revision increments');
$got=$call('get',$id,[],'2');check($got['content']['nodes'][1]['x']===100&&$got['content']['links'][0]['source']==='a','Canonical coordinates and links');
fails(fn()=>$call('save',$id,['content'=>$doc([$n('a')]),'revision'=>'1']),409,'Stale revision');
fails(fn()=>$call('save',$id,['content'=>$doc([$n('a')]),'revision'=>'2'],'2'),403,'Reader cannot save');
foreach([
    'unknown type'=>$doc([$n('a','printer')]),
    'duplicate node'=>$doc([$n('a'),$n('a')]),
    'dangling link'=>$doc([$n('a')],[$l('x','a','z')]),
    'self link'=>$doc([$n('a')],[$l('x','a','a')]),
    'duplicate pair'=>$doc([$n('a'),$n('b')],[$l('x','a','b'),$l('y','b','a','wifi')]),
    'unknown link type'=>$doc([$n('a'),$n('b')],[$l('x','a','b','fiber')]),
    'extra key'=>json_encode(['nodes'=>[[...$n('a'),'script'=>'x']],'links'=>[]]),
    'control character'=>$doc([[...$n('a'),'label'=>"a\u{202E}b"]]),
    'far coordinate'=>$doc([$n('a','router',50000)]),
    'not json'=>'{nodes',
] as $case=>$content)fails(fn()=>$call('save',$id,['content'=>$content,'revision'=>'2']),400,'Rejected: '.$case);
fails(fn()=>$call('save',$id,['content'=>$doc([$n('a'),$n('b'),$n('c'),$n('d')]),'revision'=>'2']),413,'Node limit');

// Runtime element types: created, usable, uniquely named, bounded, deletable only when unused.
$type=$call('type_create',null,['label'=>'Kamera','glyph'=>'camera','shape'=>'round','color'=>'#F9A825']);
check($type['id']==='custom-1'&&$type['type']['color']==='#f9a825','Custom type created');
fails(fn()=>$call('type_create',null,['label'=>'router','glyph'=>'box','shape'=>'rect','color'=>'#000000']),409,'Type label unique against palette');
fails(fn()=>$call('type_create',null,['label'=>'Bad','glyph'=>'rocket','shape'=>'rect','color'=>'#000000']),400,'Unknown glyph');
fails(fn()=>$call('type_create',null,['label'=>'Bad','glyph'=>'box','shape'=>'rect','color'=>'red']),400,'Colour pattern');
$call('save',$id,['content'=>$doc([$n('a'),$n('c','custom-1')]),'revision'=>'2']);
check(array_column($call('list',null)['types'],'id')===['custom-1'],'Custom type listed');
fails(fn()=>$call('type_delete','custom-1'),409,'Type in use cannot be deleted');
fails(fn()=>$call('type_delete','router'),404,'Palette types are not deletable');
$call('save',$id,['content'=>$doc([$n('a')]),'revision'=>'3']);
$call('type_delete','custom-1');check($call('list',null)['types']===[],'Unused type deleted');
fails(fn()=>$call('save',$id,['content'=>$doc([$n('c','custom-1')]),'revision'=>'4']),400,'Deleted type no longer valid');
$call('type_create',null,['label'=>'T1','glyph'=>'box','shape'=>'rect','color'=>'#000000']);$call('type_create',null,['label'=>'T2','glyph'=>'box','shape'=>'rect','color'=>'#000000']);
fails(fn()=>$call('type_create',null,['label'=>'T3','glyph'=>'box','shape'=>'rect','color'=>'#000000']),413,'Custom type limit');

// Delete and audit.
$call('delete',$id);fails(fn()=>$call('get',$id),404,'Deleted diagram');
check((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE resource='net' AND action='save' AND outcome='success'")->fetchColumn()===3,'Saves audited');
echo "PASS diagram: definition, metadata, ACL, canonical save, revisions, element types, audit\n";

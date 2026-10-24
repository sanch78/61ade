<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Feature\{Action,Context,Failure,Field,Registry,SqlResource,Workspace};
use Blade\Shell\Identity;
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
Blade\Access\Schema::install($db);
$db->exec("CREATE TABLE items(id INTEGER PRIMARY KEY,title TEXT,description TEXT,secret TEXT,archived INTEGER); INSERT INTO items VALUES(1,'One','Full description','hidden',0),(2,'Two','Other description','hidden',0)");
$registry=new Registry();
(new SqlResource('items','items','id',[new Field('title','Title'),new Field('description','Description',type:'textarea'),new Field('secret','Secret',secret:true)]))->register($registry,'Items');
$registry->add(new Action('items','archive','Archive',[],function($ctx,$target){$ctx->db->prepare('UPDATE items SET archived=1 WHERE id=?')->execute([$target['id']]);return [];},resolve:static fn($ctx,$id)=>['id'=>$id],write:true,bulk:true,icon:'dxi dxi-check'));
$registry->view('items','Items',[['id'=>'title','header'=>'Title']],['get','archive'],rowNumbers:false,selection:true);
$workspace=new Workspace($registry,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items','get','ui','allow','all','',''),('user','1','items','get','ui','deny','all','','description'),('user','1','items','archive','ui','allow','id','1','')");
$actor=new Identity('1','Synthetic user',[]);$ctx=new Context($actor,'ui',$workspace->acl,$db);
function check(bool $value,string $message):void{if(!$value)throw new RuntimeException($message);}
$view=$workspace->views($actor)[0];
check(!$view['rowNumbers']&&$view['selection']&&$view['desktopOnly']===false,'View options; desktopOnly defaults to false');
check(array_column($view['detailFields'],'id')===['title','description'],'Details exclude secrets and include non-grid fields');
check($view['actions'][1]['bulk']&&$view['actions'][1]['icon']==='dxi dxi-check','Action metadata');
$row=$workspace->executor->execute($ctx,'items','get','1',[]);
check(!isset($row['description'])&&!isset($row['secret'])&&$row['title']==='One','Get preserves field ACL');
$result=$workspace->executor->bulk($ctx,'items','archive',[['id'=>'1','values'=>[]],['id'=>'2','values'=>[]]]);
check($result[0]['ok']&&!$result[1]['ok'],'Partial success reported');
check($db->query('SELECT archived FROM items WHERE id=1')->fetchColumn()===1&&$db->query('SELECT archived FROM items WHERE id=2')->fetchColumn()===0,'Per-object ACL enforced');
check((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE action='archive'")->fetchColumn()===2,'Success and denial audited');
foreach([
 fn()=>$workspace->executor->bulk($ctx,'items','get',[['id'=>'1','values'=>[]]]),
 fn()=>$workspace->executor->bulk($ctx,'items','archive',[['id'=>'1','values'=>[]],['id'=>'1','values'=>[]]]),
 fn()=>$workspace->executor->bulk(new Context($actor,'api',$workspace->acl,$db,['items.archive']),'items','archive',[['id'=>'1','values'=>[]]]),
 fn()=>$workspace->executor->bulk($ctx,'items','archive',array_fill(0,101,['id'=>'1','values'=>[]])),
] as $reject){try{$reject();throw new RuntimeException('Expected denial');}catch(Failure){}}
try{new Action('items','unsafe','Unsafe',[new Field('password','Password',type:'password')],static fn()=>[],bulk:true);throw new RuntimeException('Secret batch accepted');}catch(InvalidArgumentException){}
// A stale row in a batch cannot overwrite a newer record; other rows still report success.
$revisionRegistry=new Registry();
(new SqlResource('items','items','id',[new Field('title','Title',required:true)]))->register($revisionRegistry,'Items');
$update=$revisionRegistry->get('items','update');
$revisionRegistry->add(new Action('items','rename','Rename',$update->fields,$update->handler,$update->resolve,write:true,bulk:true));
$revisionWorkspace=new Workspace($revisionRegistry,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items','rename','ui','allow','all','','')");
$revisionContext=new Context($actor,'ui',$revisionWorkspace->acl,$db);
$first=$revisionWorkspace->executor->execute($revisionContext,'items','get','1',[]);
$second=$revisionWorkspace->executor->execute($revisionContext,'items','get','2',[]);
$db->exec("UPDATE items SET title='External' WHERE id=1");
$result=$revisionWorkspace->executor->bulk($revisionContext,'items','rename',[
 ['id'=>'1','values'=>['title'=>'Stale','revision'=>$first['revision']]],
 ['id'=>'2','values'=>['title'=>'Renamed','revision'=>$second['revision']]],
]);
check(!$result[0]['ok']&&$result[1]['ok'],'Bulk revision conflict reported independently');
check($db->query('SELECT title FROM items WHERE id=1')->fetchColumn()==='External','Conflict preserves external write');
check($db->query('SELECT title FROM items WHERE id=2')->fetchColumn()==='Renamed','Other row commits');
echo "List presentation and bulk ACL contracts passed.\n";

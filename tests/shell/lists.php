<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Feature\{Registry,SqlResource,Field,Workspace,Context,ViewLayout,Failure};
use Blade\Shell\Identity;
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Blade\Access\Schema::install($db);
$db->exec('CREATE TABLE records (record_id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT,title TEXT,category TEXT)');$db->beginTransaction();$insert=$db->prepare('INSERT INTO records(owner_id,title,category) VALUES (?,?,?)');
for($i=1;$i<=5000;$i++)$insert->execute([$i%2?'1':'2','Record '.$i,$i%3?'A':'B']);$db->commit();
$registry=new Registry();(new SqlResource('records','records','record_id',[new Field('title','Title'),new Field('category','Category','select',options:['A'=>'A','B'=>'B'])],'owner_id'))->register($registry,'Records',layout:new ViewLayout('panel'));
$w=new Workspace($registry,$db);$ctx=new Context(new Identity('1','One'),'ui',$w->acl,$db);
$q=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','records',?,'ui','allow','own','','')");foreach(['list','get','update'] as $action)$q->execute([$action]);
$read=fn($values)=>$w->executor->execute($ctx,'records','list',null,$values);
function verify(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
$first=$read(['mode'=>'dynamic','limit'=>100]);verify(count($first['items'])===100&&$first['previous']===null&&$first['next']!==null,'Bounded first load');
$second=$read(['mode'=>'dynamic','limit'=>100,'cursor'=>$first['next']]);verify((int)$second['items'][0]['id']<(int)$first['items'][99]['id'],'Forward keyset order');
$back=$read(['mode'=>'dynamic','limit'=>100,'cursor'=>$second['previous']]);verify(array_column($back['items'],'id')===array_column($first['items'],'id'),'Bidirectional cursor');
$seen=[];$page=$first;do{foreach($page['items'] as $row){verify(!isset($seen[$row['id']]),'No duplicate records');$seen[$row['id']]=true;}if(!$page['next'])break;$page=$read(['mode'=>'dynamic','limit'=>200,'cursor'=>$page['next']]);}while(true);verify(count($seen)===2500,'Every authorized row reachable');
$filtered=$read(['mode'=>'dynamic','filters'=>['title'=>'Record 4999']]);verify(count($filtered['items'])===1&&$filtered['items'][0]['id']==='4999','Server filter and scope');
verify($read(['mode'=>'dynamic','filters'=>['title'=>"' OR 1=1 --"]])['items']===[],'Bound filter');
try{$read(['mode'=>'dynamic','filters'=>['owner_id'=>'2']]);throw new RuntimeException('Undeclared filter accepted');}catch(Failure $e){verify($e->status===403,'Unknown filter rejected');}
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','records','list','ui','deny','id','4999','title')");
try{$read(['mode'=>'dynamic','filters'=>['title'=>'Record']]);throw new RuntimeException('Field denied filter accepted');}catch(Failure $e){verify($e->status===403,'Field filter prevents inference');}
$live=$w->observe($ctx,'records',['limit'=>100,'front'=>true]);$version=$live['version'];$count=$db->query('SELECT COUNT(*) FROM blade_audit')->fetchColumn();
$again=$w->observe($ctx,'records',['limit'=>100,'front'=>true],$version);verify($again['version']===$version&&$count===$db->query('SELECT COUNT(*) FROM blade_audit')->fetchColumn(),'Unchanged observations do not grow audit');
$db->exec("UPDATE records SET category='B' WHERE record_id=4999");$changed=$w->observe($ctx,'records',['limit'=>100,'front'=>true],$version);verify($changed['version']!==$version,'External writes observed');
$db->exec('DELETE FROM records WHERE record_id=4999');$deleted=$w->observe($ctx,'records',['limit'=>100,'front'=>true],$changed['version']);verify(!in_array('4999',array_column($deleted['items'],'id'),true),'Deletion observed');
try{new ViewLayout('panel',['cols'=>[['id'=>'grid']]]);throw new RuntimeException('Missing form accepted');}catch(InvalidArgumentException){}
$views=$w->views($ctx->actor);verify($views[0]['layout']['formMode']==='panel','Layout reaches consumer');
echo "61de dynamic list, scope, filters, external changes and layout tests passed.\n";

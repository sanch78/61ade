<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\{Schema,Acl,Tokens};
use Blade\Feature\{Registry,SqlResource,Field,Workspace,Context,Failure};
use Blade\Shell\Identity;
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$db->exec('CREATE TABLE records (record_id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, title TEXT)');
$db->exec("INSERT INTO records(owner_id,title) VALUES ('1','Own'),('2','Other')");
$registry=new Registry();(new SqlResource('records','records','record_id',[new Field('title','Title',required:true)],'owner_id',['owner_id'=>'1']))->register($registry,'Records');
$workspace=new Workspace($registry,$db);$ctx=new Context(new Identity('1','One'),'ui',$workspace->acl,$db);
$call=fn($a,$id=null,$v=[])=>$workspace->executor->execute($ctx,'records',$a,$id,$v);
check($call('list')===[],'Default deny list');
try{$call('get','1');throw new RuntimeException('Default deny failed');}catch(Failure $e){check($e->status===403,'Denied get');}
$rule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','records',?,'ui',?,?,?,?)");
foreach(['list','get','update'] as $a)$rule->execute([$a,'allow','own','','']);
check(count($call('list'))===1,'Scoped SQL list');
$row=$call('get','1');$call('update','1',['title'=>'Updated','revision'=>$row['revision']]);
try{$call('update','1',['title'=>'Stale','revision'=>$row['revision']]);throw new RuntimeException('Stale accepted');}catch(Failure $e){check($e->status===409,'Concurrency conflict');}
try{$call('update','2',['title'=>'Attack','revision'=>'x']);throw new RuntimeException('IDOR');}catch(Failure $e){check($e->status===403,'IDOR prevented');}
$row=$call('get','1');
try{$call('update','1',['title'=>'Bad','owner_id'=>'2','revision'=>$row['revision']]);throw new RuntimeException('Mass assignment');}catch(Failure){}
$rule->execute(['list','deny','id','1','']);check($call('list')===[],'Explicit object deny SQL');
$rule->execute(['get','deny','all','','title']);check(!isset($call('get','1')['title']),'Field redaction');
$api=new Context($ctx->actor,'api',$workspace->acl,$db,['records.get']);
try{$workspace->executor->execute($api,'records','get','1',[]);throw new RuntimeException('UI grant reached API');}catch(Failure $e){check($e->status===404,'API channel isolation without object disclosure');}
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','records','get','api','allow','own','','')");
check($workspace->executor->execute($api,'records','get','1',[])['title']==='Updated','Scoped API action');
try{$workspace->executor->execute(new Context($ctx->actor,'api',$workspace->acl,$db,[]),'records','get','1',[]);throw new RuntimeException('Token scope bypass');}catch(Failure){}
$tokens=new Tokens($db);$issued=$tokens->issue('1','test',['records.get']);check($tokens->authenticate($issued['secret'])['actor_id']==='1','Token authenticates');$tokens->revoke($issued['id'],'1');check($tokens->authenticate($issued['secret'])===null,'Token revoked');
check((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE outcome='rejected'")->fetchColumn()>=5,'Rejected operations audited');
check(!str_contains(json_encode($db->query('SELECT * FROM blade_audit')->fetchAll()),'Updated'),'No field values in audit');
$lookup=new \Blade\Feature\Lookup('records','records','record_id','title','owner_id');
check($lookup->options($ctx)===[],'Relation choices obey object deny');
try{(new Field('reference','Reference','select',options:$lookup->options(...)))->validate('1',$ctx);throw new RuntimeException('Forbidden relation accepted');}catch(Failure){}
$rule->execute(['create','allow','own','','']);
$created=$call('create',null,['title'=>'New owned']);
check($db->query('SELECT owner_id FROM records WHERE record_id='.(int)$created['id'])->fetchColumn()==='1','Creation owner is assigned by the trusted adapter');
$db->exec("CREATE TRIGGER fail_audit BEFORE INSERT ON blade_audit BEGIN SELECT RAISE(FAIL,'audit offline'); END");
try{$call('update','1',['title'=>'Not committed','revision'=>$row['revision']]);}catch(Throwable){}
check($db->query('SELECT title FROM records WHERE record_id=1')->fetchColumn()==='Updated','Audit failure rolls back write');
echo "61de ACL, API scope, fields, concurrency and atomic audit tests passed.\n";

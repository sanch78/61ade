<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Context,Failure};
use Blade\Shell\Identity;
function verify(bool $v,string $m):void{if(!$v)throw new RuntimeException($m);}
function rejects(Closure $f,int $status):void{try{$f();}catch(Failure $e){verify($e->status===$status,$e->getMessage());return;}throw new RuntimeException('Expected rejection');}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$db->exec("CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,archived INTEGER DEFAULT 0,contact TEXT DEFAULT '',status TEXT DEFAULT 'new')");
$db->exec('CREATE TABLE item_preferences(item_id INTEGER PRIMARY KEY,notifications INTEGER)');
$w=WorkspaceConfiguration::build($db,[dirname(__DIR__).'/fixtures/grid-edit/items.json'],static fn()=>['items.after_save'=>static fn()=>[]]);
$q=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items',?,?,'allow','all','','')");
foreach(['ui','api']as$channel)foreach(['list','get','create','update']as$action)$q->execute([$action,$channel]);
$c=new Context(new Identity('1','Editor'),'ui',$w->acl,$db);
$call=fn($a,$id=null,$v=[])=>$w->executor->execute($c,'items',$a,$id,$v);
$id=$call('create',v:['title'=>'Initial'])['id'];$row=$call('get',$id);
verify(in_array('notify',$row['_editable'],true)&&!in_array('archived',$row['_editable'],true),'Per-row editable allowlist');
$r=$w->executor->edit($c,'items',$id,'contact','+36201234567',$row['revision']);
verify($call('get',$id)['title']==='Initial'&&$r['values']['contact']==='+36201234567','Only selected field changes');
rejects(fn()=>$w->executor->edit($c,'items',$id,'contact','bad',$r['revision']),400);
rejects(fn()=>$w->executor->edit($c,'items',$id,'title','stale',$row['revision']),409);
$row=$call('get',$id);$w->executor->edit($c,'items',$id,'status','done',$row['revision']);
$row=$call('get',$id);rejects(fn()=>$w->executor->edit($c,'items',$id,'status','other',$row['revision']),400);
$w->executor->edit($c,'items',$id,'notify',false,$row['revision']);verify((int)$call('get',$id)['notify']===0,'Related checkbox edited in same transaction');
$row=$call('get',$id);rejects(fn()=>$w->executor->edit($c,'items',$id,'archived',true,$row['revision']),403);
$db->exec("UPDATE items SET title='' WHERE id=$id");$row=$call('get',$id);
$api=new Context($c->actor,'api',$w->acl,$db,['items.update']);
$w->executor->edit($api,'items',$id,'contact','+36301234567',$row['revision']);verify($call('get',$id)['title']==='','Untouched legacy field is preserved');
$row=$call('get',$id);rejects(fn()=>$call('update',$id,['contact'=>'+36201234567','revision'=>$row['revision']]),400);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items','update','ui','deny','all','','contact')");
rejects(fn()=>$w->executor->edit($c,'items',$id,'contact','+36201234567',$row['revision']),403);
$row=$call('get',$id);verify(!in_array('contact',$row['_editable'],true),'Revoked field capability removed');
rejects(fn()=>$w->executor->edit(new Context(new Identity('2','Viewer'),'ui',$w->acl,$db),'items',$id,'notify',true,$row['revision']),403);
rejects(fn()=>$w->executor->edit(new Context($c->actor,'api',$w->acl,$db,[]),'items',$id,'notify',true,$row['revision']),403);
verify((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE resource='items' AND action='update' AND outcome='success'")->fetchColumn()===4,'Inline updates use normal update audit');
echo "61ade single-field grid editing, validation, ACL, API and revision contracts passed.\n";

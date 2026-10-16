<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Vapa\Feature\{Registry,SqlResource,Field,Workspace,Context,Failure};
use Vapa\Shell\Identity;
function verify(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function rejected(Closure $call,int $status):void{try{$call();}catch(Failure $e){verify($e->status===$status,$e->getMessage());return;}throw new RuntimeException('Expected rejection');}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Vapa\Access\Schema::install($db);
$db->exec('CREATE TABLE records(record_id INTEGER PRIMARY KEY,owner_id TEXT,title TEXT,amount INTEGER,secret TEXT)');
$insert=$db->prepare('INSERT INTO records VALUES(?,?,?,?,?)');$expected=[];
for($i=1;$i<=1501;$i++){$row=['id'=>(string)$i,'title'=>$i%13===0?null:($i%7===0?'Árvíz':'Group '.($i%11)),'amount'=>$i%17===0?null:$i%23];$owner=$i%3===0?'2':'1';$insert->execute([$i,$owner,$row['title'],$row['amount'],'hidden']);if($owner==='1')$expected[]=$row;}
$registry=new Registry();(new SqlResource('records','records','record_id',[new Field('title','Title'),new Field('amount','Amount','number'),new Field('secret','Secret',secret:true)],'owner_id'))->register($registry,'Records');
$w=new Workspace($registry,$db);$context=new Context(new Identity('1','Tester'),'ui',$w->acl,$db);
$db->exec("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','records','list','ui','allow','own','','')");
$db->exec("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','records','get','ui','allow','own','','')");
$read=fn($values)=>$w->executor->execute($context,'records','list',null,$values);
foreach(['title','amount','id']as$field)foreach(['asc','desc']as$direction){
 $sort=['field'=>$field,'direction'=>$direction];$ordered=$expected;
 usort($ordered,static function($a,$b)use($field,$direction){$x=$a[$field];$y=$b[$field];if($x===null||$y===null){if($x!==$y)return $x===null?1:-1;$c=0;}else $c=$field==='title'?strcmp($x,$y):((int)$x<=>(int)$y);if(!$c)$c=(int)$a['id']<=>(int)$b['id'];return $direction==='asc'?$c:-$c;});
 $page=$read(['mode'=>'dynamic','limit'=>37,'sort'=>$sort]);$first=$page;$seen=[];$pages=[];
 do{$pages[]=$page;$seen=[...$seen,...array_column($page['items'],'id')];if(!$page['next'])break;$page=$read(['mode'=>'dynamic','limit'=>37,'sort'=>$sort,'cursor'=>$page['next']]);}while(true);
 verify($seen===array_column($ordered,'id'),"Complete $field $direction order, nulls and duplicate ties");
 for($i=count($pages)-1;$i>0;$i--){$back=$read(['mode'=>'dynamic','limit'=>37,'sort'=>$sort,'cursor'=>$pages[$i]['previous']]);verify(array_column($back['items'],'id')===array_column($pages[$i-1]['items'],'id'),'Reverse traversal');}
 $anchor=$pages[3]['items'][0];$token=rtrim(strtr(base64_encode(json_encode([...$anchor['_position'],'direction'=>'next'],JSON_THROW_ON_ERROR)),'+/','-_'),'=');
 $live=$w->observe($context,'records',['sort'=>$sort,'limit'=>37,'front'=>false,'first'=>$anchor['id'],'anchor'=>$token]);verify(array_column($live['items'],'id')===array_column($pages[3]['items'],'id'),'Sorted watch preserves the bounded window');
 $wrong=['field'=>$field,'direction'=>$direction==='asc'?'desc':'asc'];rejected(fn()=>$read(['mode'=>'dynamic','sort'=>$wrong,'cursor'=>$first['next']]),400);
}
rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'secret','direction'=>'asc']]),403);
rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'title; DROP TABLE records','direction'=>'asc']]),403);
rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'id','direction'=>'ASC;--']]),400);
$db->exec("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','records','list','ui','deny','id','1','title')");rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'title','direction'=>'asc']]),403);
verify(!in_array('title',$w->views($context->actor)[0]['sortable'],true),'Denied field cannot be used to infer order');
echo "VAPA full-result SQL sorting, reverse cursors, nulls, live windows and ACL contracts passed.\n";

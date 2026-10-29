<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Feature\{Registry,SqlResource,Field,Workspace,Context,Failure};
use Blade\Shell\Identity;
function verify(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function rejected(Closure $call,int $status):void{try{$call();}catch(Failure $e){verify($e->status===$status,$e->getMessage());return;}throw new RuntimeException('Expected rejection');}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Blade\Access\Schema::install($db);
$db->exec('CREATE TABLE records(record_id INTEGER PRIMARY KEY,owner_id TEXT,title TEXT,amount INTEGER,secret TEXT)');
$insert=$db->prepare('INSERT INTO records VALUES(?,?,?,?,?)');$expected=[];
for($i=1;$i<=1501;$i++){$row=['id'=>(string)$i,'title'=>$i%13===0?null:($i%7===0?'Árvíz':'Group '.($i%11)),'amount'=>$i%17===0?null:$i%23];$owner=$i%3===0?'2':'1';$insert->execute([$i,$owner,$row['title'],$row['amount'],'hidden']);if($owner==='1')$expected[]=$row;}
$registry=new Registry();(new SqlResource('records','records','record_id',[new Field('title','Title'),new Field('amount','Amount','number'),new Field('secret','Secret',secret:true)],'owner_id'))->register($registry,'Records');
$w=new Workspace($registry,$db);$context=new Context(new Identity('1','Tester'),'ui',$w->acl,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','records','list','ui','allow','own','','')");
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','records','get','ui','allow','own','','')");
$read=fn($values)=>$w->executor->execute($context,'records','list',null,$values);
foreach(['title','amount','id']as$field)foreach(['asc','desc']as$direction){
 $sort=['field'=>$field,'direction'=>$direction];$ordered=$expected;
 usort($ordered,static function($a,$b)use($field,$direction){$x=$a[$field];$y=$b[$field];if($x===null||$y===null){if($x!==$y)return $x===null?1:-1;$c=0;}else $c=$field==='title'?strcmp($x,$y):((int)$x<=>(int)$y);if(!$c)$c=(int)$a['id']<=>(int)$b['id'];return $direction==='asc'?$c:-$c;});
 $page=$read(['mode'=>'dynamic','limit'=>37,'sort'=>$sort]);$first=$page;$seen=[];$pages=[];
 do{verify(array_column($page['items'],'_number')===range(count($seen)+1,count($seen)+count($page['items'])),'Continuous rank across sorted pages');$pages[]=$page;$seen=[...$seen,...array_column($page['items'],'id')];if(!$page['next'])break;$page=$read(['mode'=>'dynamic','limit'=>37,'sort'=>$sort,'cursor'=>$page['next']]);}while(true);
 verify($page['total']===count($expected)&&$page['matched']===count($expected),'Counts cover the ACL-scoped result beyond the cursor');
 verify($seen===array_column($ordered,'id'),"Complete $field $direction order, nulls and duplicate ties");
 for($i=count($pages)-1;$i>0;$i--){$back=$read(['mode'=>'dynamic','limit'=>37,'sort'=>$sort,'cursor'=>$pages[$i]['previous']]);verify(array_column($back['items'],'id')===array_column($pages[$i-1]['items'],'id'),'Reverse traversal');verify(array_column($back['items'],'_number')===array_column($pages[$i-1]['items'],'_number'),'Reverse rank');}
 $anchor=$pages[3]['items'][0];$token=rtrim(strtr(base64_encode(json_encode([...$anchor['_position'],'direction'=>'next'],JSON_THROW_ON_ERROR)),'+/','-_'),'=');
 $live=$w->observe($context,'records',['sort'=>$sort,'limit'=>37,'front'=>false,'first'=>$anchor['id'],'anchor'=>$token]);verify(array_column($live['items'],'id')===array_column($pages[3]['items'],'id'),'Sorted watch preserves the bounded window');verify(array_column($live['items'],'_number')===array_column($pages[3]['items'],'_number'),'Live window rank');
 $wrong=['field'=>$field,'direction'=>$direction==='asc'?'desc':'asc'];rejected(fn()=>$read(['mode'=>'dynamic','sort'=>$wrong,'cursor'=>$first['next']]),400);
}
rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'secret','direction'=>'asc']]),403);
rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'title; DROP TABLE records','direction'=>'asc']]),403);
rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'id','direction'=>'ASC;--']]),400);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','records','list','ui','deny','id','1','title')");rejected(fn()=>$read(['mode'=>'dynamic','sort'=>['field'=>'title','direction'=>'asc']]),403);
verify(!in_array('title',$w->views($context->actor)[0]['sortable'],true),'Denied field cannot be used to infer order');
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','records','list','api','allow','own','','')");
$api=new Context($context->actor,'api',$w->acl,$db,['records.list']);
$apiRows=$w->executor->execute($api,'records','list',null,['mode'=>'dynamic','sort'=>['field'=>'amount','direction'=>'asc']]);
verify(count($apiRows['items'])===100&&$apiRows['items'][0]['amount']===0,'API shares numeric ordering and own scope');
rejected(fn()=>$w->executor->execute(new Context($context->actor,'api',$w->acl,$db,[]),'records','list',null,['mode'=>'dynamic','sort'=>['field'=>'amount','direction'=>'asc']]),403);
$db->exec('CREATE TABLE items(id INTEGER PRIMARY KEY,title TEXT,archived INTEGER DEFAULT 0)');
$db->exec('CREATE TABLE item_preferences(item_id INTEGER PRIMARY KEY,notifications INTEGER)');
$db->exec("INSERT INTO items(id,title) VALUES(1,'Default'),(2,'On'),(3,'Off')");$db->exec('INSERT INTO item_preferences VALUES(2,1),(3,0)');
$related=Blade\Configuration\WorkspaceConfiguration::build($db,[dirname(__DIR__).'/fixtures/related-fields/items.json'],static fn()=>['items.after_save'=>static fn()=>[]]);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','items','list','ui','allow','all','','')");
$relatedContext=new Context($context->actor,'ui',$related->acl,$db);
foreach(['asc'=>['3','1','2'],'desc'=>['2','1','3']]as$direction=>$expectedIds){
 $token=null;$seen=[];do{$page=$related->executor->execute($relatedContext,'items','list',null,['mode'=>'dynamic','limit'=>1,'sort'=>['field'=>'notify','direction'=>$direction],'cursor'=>$token]);$seen=[...$seen,...array_column($page['items'],'id')];$token=$page['next'];}while($token);
 verify($seen===$expectedIds,'Related checkbox numeric ordering includes a missing default row');
}
$db->exec('ALTER TABLE item_preferences ADD amount INTEGER');$db->exec('UPDATE item_preferences SET amount=CASE item_id WHEN 2 THEN 10 ELSE 2 END');
$numericRegistry=new Registry();(new SqlResource('metrics','items','id',[new Field('title','Title'),new Field('score','Score','number')],related:[new Blade\Feature\RelatedStorage('item_preferences','item_id',['score'=>'amount'],['score'=>9])]))->register($numericRegistry,'Metrics');
$numeric=new Workspace($numericRegistry,$db);$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user','1','metrics','list','ui','allow','all','','')");
$numericContext=new Context($context->actor,'ui',$numeric->acl,$db);$token=null;$seen=[];
do{$page=$numeric->executor->execute($numericContext,'metrics','list',null,['mode'=>'dynamic','limit'=>1,'sort'=>['field'=>'score','direction'=>'asc'],'cursor'=>$token]);$seen=[...$seen,...array_column($page['items'],'id')];$token=$page['next'];}while($token);
verify($seen===['3','1','2'],'Related number fields sort numerically (2, 9, 10), including cursors');
verify(!array_key_exists('_number',$read(['mode'=>'dynamic','numbered'=>false])['items'][0]),'Numbering can be disabled');
$filtered=$read(['mode'=>'dynamic','limit'=>10,'filters'=>['amount'=>'7']]);
verify($filtered['total']===count($expected)&&$filtered['matched']===count(array_filter($expected,static fn($row)=>$row['amount']===7)),'Filtered match count is independent of limit and excludes unauthorized rows');
verify(array_column($filtered['items'],'_number')===range(1,count($filtered['items'])),'Filtered ranking starts at one');
$sample=$read(['mode'=>'dynamic','limit'=>10]);
$middle=$read(['mode'=>'dynamic','limit'=>10,'cursor'=>$sample['next']]);
$anchor=$middle['items'][0];$token=rtrim(strtr(base64_encode(json_encode([...$anchor['_position'],'direction'=>'next'],JSON_THROW_ON_ERROR)),'+/','-_'),'=');
$db->exec("INSERT INTO records(record_id,owner_id,title,amount,secret) VALUES(9999,'1','External',7,'hidden')");
$live=$w->observe($context,'records',['limit'=>10,'front'=>false,'first'=>$anchor['id'],'anchor'=>$token]);
verify($live['total']===count($expected)+1&&$live['matched']===count($expected)+1,'Live counts include changes outside the visible window');
verify($live['items'][0]['_number']===$middle['items'][0]['_number']+1,'External insertion before a live window shifts its global rank');
$db->exec('DELETE FROM records WHERE record_id=9999');
echo "61ade full-result SQL sorting, reverse cursors, nulls, live windows and ACL contracts passed.\n";

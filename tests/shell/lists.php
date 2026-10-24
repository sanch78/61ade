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

// Media columns, MIME-class filter and declared search: an independent synthetic consumer over a real file space.
$tmp=(getenv('BLADE_TMP_DIR')?:dirname(__DIR__,2).'/tmp').'/lists-media-'.bin2hex(random_bytes(4));mkdir($tmp,0700,true);
$remove=function(string $path) use (&$remove):void{if(is_dir($path)&&!is_link($path)){foreach(scandir($path) as $name)if($name!=='.'&&$name!=='..')$remove($path.'/'.$name);rmdir($path);}elseif(file_exists($path)||is_link($path))unlink($path);};
try{
$mdb=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Blade\Access\Schema::install($mdb);
$files=new Blade\Files\FileManagerDefinition('library','Library','media',['a'=>'Drive A','b'=>'Drive B'],allowedExtensions:['png','webm','txt'],contentRoot:$tmp.'/store');$files->install($mdb);
// FileManagerDefinition::register() registers its space as the media source of its resource.
$auto=new Registry();$files->register(new Workspace($auto,$mdb));verify($auto->mediaSource('library') instanceof Blade\Files\FileMedia,'File manager registers its media source');
// Here the actions are registered directly, so the test can count describe() calls through a wrapper.
$mreg=new Registry();$mw=new Workspace($mreg,$mdb);$storage=$files->storage($mdb,$mw->tasks);(new Blade\Files\FileActions($files,$storage))->register($mreg);
$describes=0;$inner=new Blade\Files\FileMedia($files,$storage);
$mreg->media('library',new class($inner,$describes) implements Blade\Feature\MediaSource{public function __construct(private Blade\Feature\MediaSource $inner,private int &$calls){}public function describe(Context $ctx,array $ids):array{$this->calls++;return $this->inner->describe($ctx,$ids);}public function classes():array{return $this->inner->classes();}public function classPredicate(Context $ctx,string $column,string $class):array{return $this->inner->classPredicate($ctx,$column,$class);}});
try{$mreg->media('library',$inner);throw new RuntimeException('Duplicate media source accepted');}catch(InvalidArgumentException){}
$gd=imagecreatetruecolor(120,80);imagefilledrectangle($gd,0,0,59,79,imagecolorallocate($gd,200,40,40));imagepng($gd,$tmp.'/pic.png');
Blade\Files\MediaProbe::process(['/usr/bin/ffmpeg','-nostdin','-v','error','-y','-f','lavfi','-i','testsrc=size=160x90:rate=25:duration=1','-c:v','libvpx','-b:v','200k',$tmp.'/clip.webm'],60);
verify(is_file($tmp.'/clip.webm')&&filesize($tmp.'/clip.webm')>0,'ffmpeg test video generated');file_put_contents($tmp.'/note.txt',"text\n");
$rootA=$storage->entry((int)$storage->root('a')['id']);$rootB=$storage->entry((int)$storage->root('b')['id']);
$png=(string)$storage->createFile($rootA,'pic.png','image/png',$tmp.'/pic.png');$webm=(string)$storage->createFile($rootA,'clip.webm','video/webm',$tmp.'/clip.webm');
$hidden=(string)$storage->createFile($rootB,'hidden-b.png','image/png',$tmp.'/pic.png');$text=(string)$storage->createFile($rootA,'note.txt','text/plain',$tmp.'/note.txt');
$mdb->exec('CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT,title TEXT,note TEXT,file_id TEXT)');
$values=[$png,$webm,$hidden,$text,'','abc','999999',$png,$webm];$insert=$mdb->prepare('INSERT INTO assets(owner_id,title,note,file_id) VALUES (?,?,?,?)');
for($i=1;$i<=45;$i++)$insert->execute(['1',($i%5===0?'Banner 50%':'Asset ').$i,$i===7?'needle in a note':'plain',$values[$i%count($values)]]);
foreach([fn()=>new SqlResource('bad','assets','id',[new Field('title','Title',secret:true)],search:['title']),fn()=>new SqlResource('bad','assets','id',[new Field('title','Title')],search:['missing']),fn()=>new SqlResource('bad','assets','id',[new Field('title','Title','select',options:['a'=>'A'])],search:['title']),fn()=>new SqlResource('bad','assets','id',[new Field('title','Title',column:['media'=>'library'])],search:['title']),fn()=>new SqlResource('bad','assets','id',[new Field('title','Title')],search:['title','title'])] as $invalid){try{$invalid()->register(new Registry(),'Bad');throw new RuntimeException('Invalid search declaration accepted');}catch(InvalidArgumentException){}}
(new SqlResource('assets','assets','id',[new Field('title','Title'),new Field('note','Note'),new Field('file_id','File',column:['media'=>'library'])],'owner_id',search:['title','note']))->register($mreg,'Assets',tiles:true,rowHeight:56);
$rule=$mdb->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,?,?,?,?,?)");
foreach(['1','2','3','4'] as $actor)foreach(['list','get'] as $action)$rule->execute([$actor,'assets',$action,'ui','allow','all','','']);
$rule->execute(['1','library','thumbnail_get','ui','allow','all','','']);$rule->execute(['2','library','thumbnail_get','ui','allow','id','a','']);$rule->execute(['3','library','thumbnail_get','ui','allow','all','','']);
$rule->execute(['3','assets','list','ui','deny','all','','note']);$rule->execute(['3','assets','list','ui','deny','all','','file_id']);
$rule->execute(['1','assets','list','api','allow','all','','']);$rule->execute(['1','library','thumbnail_get','api','allow','all','','']);
$as=fn(string $actor,string $channel='ui',array $scopes=[])=>new Context(new Identity($actor,'Actor '.$actor),$channel,$mw->acl,$mdb,$scopes);
$mread=fn(array $values,string $actor='1',?Context $c=null)=>$mw->executor->execute($c??$as($actor),'assets','list',null,$values);
$byFile=static function(array $page):array{$out=[];foreach($page['items'] as $item)$out[$item['file_id']??'-']=array_key_exists('file_id',$item['_media']??[])?$item['_media']['file_id']:'absent';return $out;};
$describes=0;$page=$mread(['limit'=>45]);$media=$byFile($page);
verify($describes===1,'One describe() call per window');
verify($media[$png]===['id'=>$png,'name'=>'pic.png','mime_type'=>'image/png','revision'=>'1','duration_ms'=>null,'width'=>120,'height'=>80,'thumbnail'=>'pending'],'Image descriptor before the thumbnail task');
verify($media[$webm]['mime_type']==='video/webm'&&abs($media[$webm]['duration_ms']-1000)<=100&&$media[$webm]['width']===160&&$media[$webm]['height']===90,'Video descriptor carries type, duration and size');
verify($media[$text]['thumbnail']==='none'&&$media[$hidden]['name']==='hidden-b.png','Non-thumbnailable file and permitted second mount');
verify($media['']===null&&$media['abc']===null&&$media['999999']===null,'Empty, invalid and unknown ids give null');
$mw->tasks->run(100,120);
$media=$byFile($mread(['limit'=>45]));verify($media[$png]['thumbnail']==='ready'&&$media[$webm]['thumbnail']==='ready','Thumbnail state after the background task');
$limited=$mread(['limit'=>45],'2');$media=$byFile($limited);
verify($media[$hidden]===null&&$media[$png]['name']==='pic.png'&&!str_contains(json_encode($limited),'hidden-b'),'Per-mount thumbnail ACL: no descriptor and no name for the other mount');
$none=$mread(['limit'=>45],'4');verify(array_unique(array_values($byFile($none)))===[null]&&!str_contains(json_encode($none),'pic.png')&&!str_contains(json_encode($none),'image/png'),'No thumbnail_get right: every descriptor null, nothing leaked');
verify(array_unique(array_values($byFile($mread(['limit'=>45],'3'))))===['absent'],'Denied media field has no _media entry');
verify(array_unique(array_values($byFile($mread(['limit'=>45],'1',$as('1','api',['assets.list'])))))===[null],'API token without the thumbnail scope gets null');
verify($byFile($mread(['limit'=>45],'1',$as('1','api',['assets.list','library.thumbnail_get'])))[$png]['name']==='pic.png','API token with the thumbnail scope');
$one=$mw->executor->execute($as('1'),'assets','get','1',[]);verify($one['_media']['file_id']['id']===$webm,'Get projection carries the media descriptor');
$legacy=array_column($mw->executor->execute($as('1'),'assets','list',null,[]),null,'id');verify($legacy['1']['_media']['file_id']['id']===$webm&&$legacy['5']['_media']['file_id']===null,'Legacy listing carries media descriptors');
// MIME-class filter on the media column.
$definitions=array_column($mreg->get('assets','list')->listSource->filterDefinitions($as('1')),null,'name');
verify($definitions['file_id']['type']==='select'&&$definitions['file_id']['options']===['image'=>'Kép','video'=>'Videó'],'Media column advertised as a class select');
verify(!isset(array_column($mreg->get('assets','list')->listSource->filterDefinitions($as('3')),null,'name')['file_id']),'Denied media field not advertised');
$images=$mread(['limit'=>100,'filters'=>['file_id'=>'image']]);$classes=array_values(array_unique(array_column($images['items'],'file_id')));sort($classes);$both=[$png,$hidden];sort($both);verify($classes===$both,'Image class filter');
// The class filter follows the same per-mount rule as the descriptors: no type of a hidden file is revealed.
$limitedImages=$mread(['limit'=>100,'filters'=>['file_id'=>'image']],'2');verify(array_values(array_unique(array_column($limitedImages['items'],'file_id')))===[$png],'Class filter limited to readable mounts');
$expected=count(array_filter(range(1,45),fn($i)=>in_array($values[$i%count($values)],[$png,$hidden],true)));verify($images['matched']===$expected&&count($images['items'])===$expected&&$images['total']===45,'Class filter counts');
$videos=$mread(['limit'=>100,'filters'=>['file_id'=>'video','title'=>'Asset']]);verify($videos['items']&&array_values(array_unique(array_column($videos['items'],'file_id')))===[$webm]&&!array_filter($videos['items'],fn($r)=>!str_starts_with($r['title'],'Asset')),'Video class filter combined with a text filter');
try{$mread(['filters'=>['file_id'=>'audio']]);throw new RuntimeException('Unknown media class accepted');}catch(Failure $e){verify($e->status===400,'Unknown media class rejected with 400');}
try{$mread(['filters'=>['file_id'=>$png]]);throw new RuntimeException('Raw id filter accepted');}catch(Failure $e){verify($e->status===400,'Media filter takes classes, not ids');}
try{$mread(['filters'=>['file_id'=>'image']],'3');throw new RuntimeException('Denied media filter accepted');}catch(Failure $e){verify($e->status===403,'Denied media field filter 403');}
// Declared search: combined with filter, sort and cursor paging; field ACL decides which fields are searched.
$meta=fn(string $actor)=>$mreg->get('assets','list')->listSource->searchMetadata($as($actor));
verify($meta('1')===['fields'=>['title','note']]&&$meta('3')===['fields'=>['title']],'Search metadata lists only queryable fields');
$sorted=['field'=>'title','direction'=>'asc'];$query=['limit'=>1,'search'=>'  Asset 1 ','sort'=>$sorted,'filters'=>['file_id'=>'image']];
$want=array_values(array_filter(range(1,45),fn($i)=>$i%5!==0&&str_contains('Asset '.$i,'Asset 1')&&in_array($values[$i%count($values)],[$png,$hidden],true)));
$titles=[];$page=$mread($query);$pages=0;
do{verify($page['matched']===count($want),'Search matched count includes the search');foreach($page['items'] as $row){verify(!isset($titles[$row['id']]),'No duplicate search rows');$titles[$row['id']]=$row['title'];}if(!$page['next'])break;$page=$mread([...$query,'cursor'=>$page['next']]);$pages++;}while(true);
$check=array_values($titles);$copy=$check;sort($copy,SORT_STRING);
verify(count($titles)===count($want)&&count($want)>=3&&$pages===count($want)-1&&$check===$copy,'Search pages cover every match once, in sort order');
$back=$mread([...$query,'cursor'=>$page['previous']]);verify(count($back['items'])===1&&$back['items'][0]['title']===$check[count($check)-2]&&!array_diff(array_column($back['items'],'id'),array_keys($titles)),'Search with a reverse cursor');
$percent=$mread(['limit'=>100,'search'=>'50%']);verify(count($percent['items'])===9&&$percent['matched']===9,'Search escapes LIKE wildcards');
verify(count($mread(['limit'=>100,'search'=>'needle'])['items'])===1&&$mread(['limit'=>100,'search'=>'needle'],'3')['items']===[],'Non-queryable fields are excluded from search');
$rule->execute(['4','assets','list','ui','deny','all','','title']);$rule->execute(['4','assets','list','ui','deny','all','','note']);
verify($meta('4')===null&&$mread(['limit'=>100,'search'=>'Asset'],'4')['items']===[]&&$mread(['limit'=>100,'search'=>'Asset'],'4')['matched']===0,'No searchable field: no search metadata, no match');
verify($mread(['limit'=>100,'search'=>'   '])['matched']===45,'Blank search is no search');
foreach([str_repeat('x',101),"a\0b",["Asset"],"\xff",5] as $bad){try{$mread(['search'=>$bad]);throw new RuntimeException('Invalid search accepted');}catch(Failure $e){verify($e->status===400,'Invalid search rejected');}}
verify(count($mread(['limit'=>100,'search'=>str_repeat('é',100)])['items'])===0,'100 multibyte characters accepted');
$live=$mw->observe($as('1'),'assets',['limit'=>50,'front'=>true,'search'=>'Asset 1']);verify(count($live['items'])===$mread(['limit'=>100,'search'=>'Asset 1'])['matched']&&isset($live['items'][0]['_media']),'Live window honours search and media');
}finally{$remove($tmp);}
verify(!file_exists($tmp),'Media scratch removed');
echo "61de dynamic list, scope, filters, external changes, layout, media, class filter and search tests passed.\n";

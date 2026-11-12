<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Feature\{Action,Context,DownloadStream,Failure,Field,Registry,SqlResource,Transfers,Upload,UploadPolicy,View,Workspace};
use Blade\Shell\Identity;
// A file field backed by the project's own storage (FB-0167, docs/workspaces.md#stored-file-field): the declaration,
// metadata and list surfaces, the upload action's type check and token claim, one save with the record's other fields,
// and the refusals of a foreign, reused, expired, other-session or other-tenant token.
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message):Failure{try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.': '.$e->getMessage().')');return $e;}throw new RuntimeException($message.' (accepted)');}
function refused(callable $call,string $message):void{try{$call();}catch(InvalidArgumentException){return;}throw new RuntimeException($message.' (accepted)');}
$tmp=(getenv('BLADE_TMP_DIR')?:dirname(__DIR__,2).'/tmp').'/stored-file-check-'.bin2hex(random_bytes(4));mkdir($tmp,0700,true);
$tempRoot=$tmp.'/transfers';$store=$tmp.'/store';mkdir($store,0700);
register_shutdown_function(static function() use ($tmp){$walk=static function(string $dir) use (&$walk){foreach(scandir($dir)?:[] as $e){if($e==='.'||$e==='..')continue;is_dir("$dir/$e")?$walk("$dir/$e"):@unlink("$dir/$e");}@rmdir($dir);};$walk($tmp);});
$png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

// Declaration: a stored file names an upload action and optionally a GET action, accepts MIME classes, is a form field.
$file=fn(array $options=[],array $column=[],bool $bulk=false,bool $secret=false)=>new Field('file','Kép','file',file:[...['upload'=>'items.file_upload','get'=>'items.file','accept'=>['image']],...$options],column:$column,bulk:$bulk,secret:$secret);
check($file()->stored()&&$file()->fileAction('upload')===['items','file_upload']&&$file()->fileAction('get')===['items','file']&&$file()->media()===null,'Stored file field');
check((new Field('file','Kép','file',file:['upload'=>'demo.items.file_upload','accept'=>['image']]))->fileAction('upload')===['demo.items','file_upload'],'A dotted resource splits at the last dot; get is optional');
check($file([],['details'=>false,'width'=>120])->column===['details'=>false,'width'=>120],'Presentation column keys allowed');
foreach([
 'mount keys'=>fn()=>$file(['mount'=>'a']),'resource key'=>fn()=>$file(['resource'=>'files']),'bad upload'=>fn()=>$file(['upload'=>'items']),'internal action'=>fn()=>$file(['upload'=>'items.__upload']),
 'bad get'=>fn()=>$file(['get'=>'file']),'no accept'=>fn()=>$file(['accept'=>[]]),'bad accept'=>fn()=>$file(['accept'=>['image/*']]),'media column'=>fn()=>$file([],['media'=>'files']),
 'editable'=>fn()=>$file([],['editable'=>true]),'presentation'=>fn()=>$file([],['presentation'=>'image']),'bulk'=>fn()=>$file([],[],true),'secret'=>fn()=>$file([],[],false,true),
] as $case=>$invalid)refused($invalid,'Invalid stored file field: '.$case);
// Several files (FB-0181): `multiple` 2–20 on a stored field only; the value is a comma-joined list of distinct ids.
check($file(['multiple'=>5])->multiple()===5&&$file()->multiple()===1&&(new Field('m','M','file',file:['resource'=>'files','mount'=>'a','accept'=>['image']]))->multiple()===1,'Stored file multiple');
check($file(['multiple'=>3])->metadata()['file']['multiple']===3&&!array_key_exists('multiple',$file()->metadata()['file']),'Multiple in the metadata');
foreach([1,21,'3',true,0] as $bad)refused(fn()=>$file(['multiple'=>$bad]),'Invalid multiple accepted: '.json_encode($bad));
refused(fn()=>new Field('m','M','file',file:['resource'=>'files','mount'=>'a','accept'=>['image'],'multiple'=>3]),'Multiple on a file manager reference');
$several=$file(['multiple'=>3]);
check($several->validate(['a1','b2'])==='a1,b2'&&$several->validate(' a1 , b2 ')==='a1,b2'&&$several->validate('')==='','A list or a comma-joined value');
foreach(['a1,a1','a1,,b2','a1,b2,c3,d4','a1,../x'] as $bad){try{$several->validate($bad);throw new RuntimeException('Invalid list accepted: '.$bad);}catch(Failure){}}
try{$file()->validate('a1,b2');throw new RuntimeException('A single field accepted a list');}catch(Failure){}

$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
Blade\Access\Schema::install($db);Blade\Tenancy\Tenancy::install($db);
$db->exec("CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,role TEXT NOT NULL DEFAULT '',reason TEXT NOT NULL DEFAULT '',file TEXT NOT NULL DEFAULT '');
 CREATE TABLE albums(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL DEFAULT '',images TEXT NOT NULL DEFAULT '');
 CREATE TABLE item_files(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',actor_id TEXT NOT NULL)");
$uploaded=[];
$build=function(?UploadPolicy $policy=null,bool $getAction=true,bool $returnsToken=true) use ($db,$store,$tempRoot,&$uploaded):Workspace{
    $registry=new Registry();
    (new SqlResource('items','items','id',[new Field('title','Megnevezés',required:true),new Field('role','Szerep','select',required:true,options:['reference'=>'Referencia','evidence'=>'Bizonyíték']),
        new Field('reason','Indoklás','textarea'),new Field('file','Kép','file',file:['upload'=>'items.file_upload','get'=>'items.file','accept'=>['image']])],
        afterSave:static function(Context $ctx,string $id,?array $target,array $values):void{if(($values['file']??'')!=='')$ctx->db->prepare("UPDATE item_files SET state='committed' WHERE id=? AND state='pending'")->execute([$values['file']]);}))->register($registry,'Items');
    // Several files of the same upload action (FB-0181).
    (new SqlResource('albums','albums','id',[new Field('title','Cím'),new Field('images','Képek','file',max:1000,file:['upload'=>'items.file_upload','get'=>'items.file','accept'=>['image'],'multiple'=>3])],
        afterSave:static function(Context $ctx,string $id,?array $target,array $values):void{foreach(array_filter(explode(',',$values['images']??''))as$t)$ctx->db->prepare("UPDATE item_files SET state='committed' WHERE id=? AND state='pending'")->execute([$t]);}))->register($registry,'Albums');
    $registry->add(new Action('items','file_upload','Kép feltöltése',[],static function(Context $ctx) use ($store,$returnsToken,&$uploaded):array{
        $part=$ctx->uploads[0];$sha=hash_file('sha256',$part->path);copy($part->path,"$store/$sha");
        $token=bin2hex(random_bytes(16));$uploaded[]=$token;
        $ctx->db->prepare('INSERT INTO item_files(id,sha256,name,mime_type,size,actor_id) VALUES (?,?,?,?,?,?)')->execute([$token,$sha,$part->name,'image/png',$part->size,$ctx->actor->id]);
        return $returnsToken?['id'=>$token]:['ok'=>true];
    },resolve:static fn()=>['id'=>null,'owner'=>null],write:true,upload:$policy??new UploadPolicy(['png','txt'],1024,1,tempRoot:$tempRoot,ttlSeconds:600)));
    if($getAction)$registry->add(new Action('items','file','Kép',[],static fn(Context $ctx,array $t)=>new DownloadStream('image/png',"$store/".$t['row']['sha256'],(int)$t['row']['size'],'"'.$t['row']['sha256'].'"',disposition:'inline',filename:$t['row']['name']),
        resolve:static function(Context $ctx,?string $id):array{$q=$ctx->db->prepare('SELECT * FROM item_files WHERE id=?');$q->execute([(string)$id]);return ['id'=>$id,'owner'=>null,'row'=>$q->fetch(PDO::FETCH_ASSOC)?:throw new Failure('Nem található objektum.',404)];},get:true));
    else $registry->add(new Action('items','file','Kép',[],static fn()=>[]));
    return new Workspace($registry,$db);
};
// A missing transfer root or a non-GET get action is a developer error once the views are checked.
refused(fn()=>$build(new UploadPolicy(['png'],1024,1))->registry->checkFileFields(),'Upload action without a transfer root');
refused(fn()=>$build(null,false)->registry->checkFileFields(),'A get action that is no GET action');
$workspace=$build();$workspace->registry->checkFileFields();
$rules=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'items',?,'ui','allow','all','','')");
foreach(['1','2'] as $actor)foreach(['list','get','create','update','file_upload','file'] as $a)$rules->execute([$actor,$a]);
$albumRules=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'albums',?,'ui','allow','all','','')");
foreach(['1','2'] as $actor)foreach(['list','get','create','update'] as $a)$albumRules->execute([$actor,$a]);
$rules->execute(['3','create']);$rules->execute(['3','list']);
$session=Transfers::owner('session-1');
$ctx=fn(string $actor='1',array $uploads=[],?string $owner=null,?string $tenant=null)=>new Context(new Identity($actor,'Actor '.$actor),'ui',$workspace->acl,$db,[],$uploads,$owner??$session,$tenant);
$exec=fn(string $action,?string $id,array $values,?Context $c=null)=>$workspace->executor->execute($c??$ctx(),'items',$action,$id,$values);

// Metadata: the form field names both actions with the policy and the actor's offering; no list surface offers it.
$actor=new Identity('1','Actor 1');$view=$workspace->views($actor)[0];
$create=array_column(array_column($view['actions'],null,'name')['create']['fields'],null,'name')['file']['file'];
check($create['upload']===['resource'=>'items','action'=>'file_upload']&&$create['get']===['resource'=>'items','action'=>'file']&&$create['accept']===['image']
    &&$create['policy']['extensions']===['png','txt']&&$create['canUpload']===true&&$create['canPreview']===true&&$create['canChoose']===false&&!str_contains(json_encode($view),$tempRoot),'Stored file field metadata');
$reader=array_column(array_column($workspace->views(new Identity('3','Actor 3'))[0]['actions'],null,'name')['create']['fields'],null,'name')['file']['file'];
check($reader['canUpload']===false&&$reader['canPreview']===false,'Without the upload and GET actions nothing is offered');
check(!in_array('file',array_column($view['options']['columns'],'id'),true)&&!in_array('file',array_column($view['options']['detailFields'],'id'),true),'No default column and no details');
$list=$exec('list',null,['limit'=>10]);
check(!in_array('file',$list['sortable']??[],true)&&!in_array('file',array_column($list['filters']??[],'field'),true),'Not sortable, not filterable');
fails(fn()=>$exec('list',null,['limit'=>10,'filters'=>['file'=>'x']]),403,'A filter naming it');
fails(fn()=>$exec('list',null,['limit'=>10,'sort'=>['field'=>'file','direction'=>'asc']]),403,'A sort naming it');
fails(fn()=>$exec('list',null,['limit'=>10,'scope'=>['field'=>'file','value'=>'x']]),403,'A scope naming it');
refused(fn()=>$workspace->registry->updateView(View::list('items','Items',[['id'=>'file','header'=>'Kép']],['get'])),'A view column naming it');

// Upload: the action's handler stores the bytes and returns the token; the executor checks the type and records the claim.
$part=function(string $name,string $content) use ($tmp):Upload{$path=$tmp.'/'.bin2hex(random_bytes(6));file_put_contents($path,$content);return new Upload('files',$name,$path,strlen($content),UPLOAD_ERR_OK);};
$upload=fn(string $name='kep.png',?string $content=null,?Context $c=null)=>$exec('file_upload',null,[],$c??$ctx('1',[$part($name,$content??$png)]));
$claims=fn()=>array_values(array_filter(scandir($tempRoot.'/claims')?:[],fn($e)=>str_ends_with($e,'.json')));
$token=$upload()['id'];
check(preg_match('/^[0-9a-f]{32}$/',$token)===1&&count($claims())===1,'Upload returns the token and records a claim');
$claim=json_decode(file_get_contents($tempRoot.'/claims/'.$claims()[0]),true);
check($claim['actor']==='1'&&$claim['mime_type']==='image/png'&&$claim['name']==='kep.png'&&$claim['owner']===$session&&!isset($claim['token'])&&!str_contains(json_encode($claim),$token),'The claim binds the upload and holds no token');
$e=fails(fn()=>$upload('kep.png',"not an image\n"),400,'Bytes of another class are refused');
check(($e->details['code']??null)==='type'&&$e->getMessage()==='A fájl típusa ehhez a mezőhöz nem engedélyezett.','Type refusal code');
$e=fails(fn()=>$upload('nagy.png',str_repeat('x',2048)),400,'Oversize is refused by the policy');
check(($e->details['code']??null)==='too_large','Oversize code');
fails(fn()=>$exec('file_upload',null,[],$ctx('1',[$part('a.png',$png),$part('b.png',$png)])),400,'One file per upload');
fails(fn()=>$exec('file_upload',null,[]),400,'An upload without a file');
// Through the chunked transfer protocol (the form's background upload): the same check and claim.
$transfers=$workspace->transfers;
$op=fn(string $operation,array $values,?Context $c=null)=>$transfers->handle($c??$ctx(),$session,'items',null,['operation'=>$operation,'action'=>'file_upload',...$values]);
$begun=$op('upload_begin',['file'=>['name'=>'atvitel.png','size'=>strlen($png),'type'=>'image/png'],'fingerprint'=>'fp-1']);
$op('upload_chunk',['transfer'=>$begun['transfer'],'offset'=>0],$ctx('1',[new Upload('chunk','blob',(function() use ($tmp,$png){$p=$tmp.'/chunk';file_put_contents($p,$png);return $p;})(),strlen($png),UPLOAD_ERR_OK)]));
$transferred=$op('upload_finish',['transfer'=>$begun['transfer']])['id'];
check(is_string($transferred)&&count($claims())===2,'A transferred upload is claimed too');
fails(fn()=>$op('upload_begin',['file'=>['name'=>'nagy.png','size'=>4096,'type'=>'image/png'],'fingerprint'=>'fp-2']),400,'Oversize refused when the transfer begins');
// A handler that returns no token is a developer error (500), and nothing is claimed.
$plain=$build(null,true,false);
fails(fn()=>$plain->executor->execute(new Context(new Identity('1','Actor 1'),'ui',$plain->acl,$db,[],[$part('a.png',$png)],$session),'items','file_upload',null,[]),500,'Upload action without a token');

// One save: the token with the record's other fields; the claim is used once.
$saved=$exec('create',null,['title'=>'Első','role'=>'reference','reason'=>'Mintakép','file'=>$token]);
$row=$db->query('SELECT * FROM items WHERE id='.(int)$saved['id'])->fetch(PDO::FETCH_ASSOC);
check($row['title']==='Első'&&$row['role']==='reference'&&$row['reason']==='Mintakép'&&$row['file']===$token,'Record and file saved together');
check($db->query("SELECT state FROM item_files WHERE id='$token'")->fetchColumn()==='committed'&&count($claims())===1,'The project committed the file; the claim is gone');
$e=fails(fn()=>$exec('create',null,['title'=>'Második','role'=>'reference','file'=>$token]),400,'A claimed token is not accepted again');
check(($e->fieldErrors['file']??null)==='A kiválasztott fájl nem érhető el.','Reused token is a field error');
// A failing save keeps nothing and keeps the claim for the corrected save.
$second=$upload('masodik.png')['id'];
$e=fails(fn()=>$exec('create',null,['title'=>'','role'=>'reference','file'=>$second]),400,'Another field error');
check(isset($e->fieldErrors['title'])&&!isset($e->fieldErrors['file'])&&(int)$db->query('SELECT COUNT(*) FROM items')->fetchColumn()===1&&count($claims())===2,'Nothing saved, the claim stays');
// Foreign tokens: another actor, another session, another tenant, an unknown or expired token; one message.
foreach(['another actor'=>$ctx('2'),'another session'=>$ctx('1',[],Transfers::owner('session-2')),'another tenant'=>$ctx('1',[],null,'t2'),'no session'=>$ctx('1',[],'')] as $case=>$c){
    $e=fails(fn()=>$exec('create',null,['title'=>'Idegen','role'=>'evidence','file'=>$second],$c),400,'Foreign token: '.$case);
    check(($e->fieldErrors['file']??null)==='A kiválasztott fájl nem érhető el.','Foreign token is a field error: '.$case);
}
fails(fn()=>$exec('create',null,['title'=>'Kitalált','role'=>'evidence','file'=>str_repeat('a',32)]),400,'An unknown token');
fails(fn()=>$exec('create',null,['title'=>'Hibás','role'=>'evidence','file'=>'../etc/passwd']),400,'A malformed value');
$tenantToken=$upload('tenant.png',null,$ctx('1',[$part('tenant.png',$png)],null,'t1'))['id'];
fails(fn()=>$exec('create',null,['title'=>'Más tenant','role'=>'evidence','file'=>$tenantToken],$ctx('1',[],null,'t2')),400,'A token of another tenant');
check(isset($exec('create',null,['title'=>'Saját tenant','role'=>'evidence','file'=>$tenantToken],$ctx('1',[],null,'t1'))['id']),'The same tenant accepts it');
$expired=$upload('lejart.png')['id'];
foreach($claims() as $name){$path=$tempRoot.'/claims/'.$name;$c=json_decode(file_get_contents($path),true);if($c['name']==='lejart.png'){$c['expires_at']=time()-1;file_put_contents($path,json_encode($c));}}
fails(fn()=>$exec('create',null,['title'=>'Lejárt','role'=>'evidence','file'=>$expired]),400,'An expired token');
// A claim checks the field's own classes: an `image` field refuses a claim of another class (a second field of the action).
foreach($claims() as $name){$path=$tempRoot.'/claims/'.$name;$c=json_decode(file_get_contents($path),true);if($c['name']==='masodik.png'){$c['mime_type']='text/plain';file_put_contents($path,json_encode($c));}}
$e=fails(fn()=>$exec('create',null,['title'=>'Szöveg','role'=>'evidence','file'=>$second]),400,'A claim of another class');
check(($e->fieldErrors['file']??null)==='A fájl típusa ehhez a mezőhöz nem engedélyezett.','Wrong class is a field error');

// Update: the unchanged file needs no claim; a new token replaces it; clearing an optional file stores it empty.
$id=(string)$saved['id'];
$current=$exec('get',$id,[]);
$exec('update',$id,['title'=>'Első, átnevezve','role'=>'evidence','reason'=>'Új indok','file'=>$token,'revision'=>$current['revision']]);
check($db->query("SELECT title FROM items WHERE id=$id")->fetchColumn()==='Első, átnevezve','Unchanged file saved with the other fields');
$replacement=$upload('csere.png')['id'];$current=$exec('get',$id,[]);
$exec('update',$id,['title'=>'Első, átnevezve','role'=>'evidence','file'=>$replacement,'revision'=>$current['revision']]);
check($db->query("SELECT file FROM items WHERE id=$id")->fetchColumn()===$replacement&&$exec('get',$id,[])['revision']!==$current['revision'],'File replaced with a new revision');
$stale=$current['revision'];$fresh=$upload('ujabb.png')['id'];
fails(fn()=>$exec('update',$id,['title'=>'Elavult','role'=>'evidence','file'=>$fresh,'revision'=>$stale]),409,'A stale revision');
check(count(array_filter($claims(),fn($n)=>json_decode(file_get_contents($tempRoot.'/claims/'.$n),true)['name']==='ujabb.png'))===1,'A refused save keeps the claim');
$current=$exec('get',$id,[]);
$exec('update',$id,['title'=>'Első, átnevezve','role'=>'evidence','file'=>'','revision'=>$current['revision']]);
check($db->query("SELECT file FROM items WHERE id=$id")->fetchColumn()==='','Optional file cleared');
// The preview is the project's GET action over the stored value.
$stream=$exec('file',$replacement,[]);
check($stream instanceof DownloadStream&&$stream->disposition==='inline'&&$stream->contentDisposition()==='inline; filename="csere.png"; filename*=UTF-8\'\'csere.png','GET action streams the file inline with its name');
// Several files (FB-0181): each new token is claimed once with the record; kept ids need no claim; one save.
$album=fn(string $action,?string $id,array $values,?Context $c=null)=>$workspace->executor->execute($c??$ctx(),'albums',$action,$id,$values);
[$first,$second2,$third]=[$upload('a1.png')['id'],$upload('a2.png')['id'],$upload('a3.png')['id']];
$before=count($claims());
$made=$album('create',null,['title'=>'Album','images'=>[$first,$second2]]);
$images=fn()=>$db->query('SELECT images FROM albums WHERE id='.(int)$made['id'])->fetchColumn();
check($images()===$first.','.$second2&&count($claims())===$before-2&&$db->query("SELECT COUNT(*) FROM item_files WHERE state='committed' AND id IN ('$first','$second2')")->fetchColumn()==2,'Several files saved and claimed once');
$e=fails(fn()=>$album('create',null,['title'=>'Újra','images'=>$first]),400,'A used token in a list');
check(($e->fieldErrors['images']??null)==='A kiválasztott fájl nem érhető el.','A used token is a field error');
fails(fn()=>$album('create',null,['title'=>'Sok','images'=>[$third,'b1','b2','b3']]),400,'More files than multiple');
$e=fails(fn()=>$album('create',null,['title'=>'Idegen','images'=>[$third]],$ctx('2')),400,'A foreign token in a list');
$current=$album('get',(string)$made['id'],[]);
// Keep the first (its claim is gone), drop the second, add the third: only the third is checked and claimed.
$album('update',(string)$made['id'],['title'=>'Album','images'=>$first.','.$third,'revision'=>$current['revision']]);
check($images()===$first.','.$third&&$db->query("SELECT state FROM item_files WHERE id='$third'")->fetchColumn()==='committed','Kept ids pass, a new one is claimed');
$current=$album('get',(string)$made['id'],[]);
$album('update',(string)$made['id'],['title'=>'Átnevezve','images'=>$first.','.$third,'revision'=>$current['revision']]);
check($db->query('SELECT title FROM albums WHERE id='.(int)$made['id'])->fetchColumn()==='Átnevezve','An unchanged list saves the other fields');

// JSON: the same shape; the module may name actions that PHP registers after the build (checked by checkFileFields()).
$db->exec("CREATE TABLE jitems(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL DEFAULT '',file TEXT NOT NULL DEFAULT '')");
file_put_contents($tmp.'/jitems.json',json_encode(['resources'=>['jitems'=>['storage'=>['table'=>'jitems','key'=>'id'],'fields'=>[['name'=>'title','label'=>'Cím'],
    ['name'=>'file','label'=>'Kép','type'=>'file','file'=>['upload'=>'jitems.file_upload','get'=>'jitems.file','accept'=>['image']]]],'view'=>['title'=>'Tételek']]]],JSON_THROW_ON_ERROR));
$json=Blade\Configuration\WorkspaceConfiguration::build($db,[$tmp.'/jitems.json'],static fn()=>[]);
$jsonField=$json->registry->fields('jitems')['file'];
check($jsonField->stored()&&$jsonField->fileAction('get')===['jitems','file'],'JSON stored file field');
refused(fn()=>$json->registry->checkFileFields(),'JSON field naming an unregistered upload action');
$json->registry->add(new Action('jitems','file_upload','Kép feltöltése',[],static fn()=>['id'=>'x'],resolve:static fn()=>['id'=>null,'owner'=>null],write:true,upload:new UploadPolicy(['png'],1024,1,tempRoot:$tempRoot)));
$json->registry->add(new Action('jitems','file','Kép',[],static fn()=>[],resolve:static fn($c,$id)=>['id'=>$id,'owner'=>null],get:true));
$json->registry->checkFileFields();
foreach([['upload'=>'jitems.file_upload','accept'=>['image'],'mount'=>'a'],['upload'=>'jitems.file_upload']] as $invalid){
    file_put_contents($tmp.'/bad.json',json_encode(['resources'=>['jbad'=>['storage'=>['table'=>'jitems','key'=>'id'],'fields'=>[['name'=>'file','label'=>'Kép','type'=>'file','file'=>$invalid]],'view'=>['title'=>'Rossz']]]],JSON_THROW_ON_ERROR));
    try{Blade\Configuration\WorkspaceConfiguration::build($db,[$tmp.'/bad.json'],static fn()=>[]);throw new RuntimeException('Invalid JSON stored file accepted');}catch(InvalidArgumentException){}
}
echo "stored-file checks passed\n";

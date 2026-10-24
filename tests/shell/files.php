<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Feature\{Registry,Workspace,Context,Download,Failure,Upload};
use Blade\Files\{FileManagerDefinition,FileStorage};
use Blade\Shell\Identity;
// Virtual file manager contract: names, depth, copy/move, conflicts, text editor, upload, ACL and audit.
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message):Failure{try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.': '.$e->getMessage().')');return $e;}throw new RuntimeException($message.' (accepted)');}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$definition=new FileManagerDefinition('files','Files','test',['a'=>'Drive A','b'=>'Drive B'],allowedExtensions:['txt','png'],maxSizeBytes:100,textMaxBytes:32);
$definition->install($db);$definition->install($db);
$registry=new Registry();$workspace=new Workspace($registry,$db);$definition->register($workspace);
$storage=$definition->storage($db);
$rootA=(string)$storage->root('a')['id'];$rootB=(string)$storage->root('b')['id'];
$rule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'files',?,?,'allow',?,?,'')");
foreach(['tree','list','create_directory','upload','copy','move','text_get','text_save','content_get'] as $a)$rule->execute(['1',$a,'ui','all','']);
// Actor 2 reads drive A only; actor 3 has no rule at all.
foreach(['tree','list','text_get'] as $a)$rule->execute(['2',$a,'ui','id','a']);
$ctx=fn(string $actor='1',array $uploads=[],string $channel='ui',array $scopes=[])=>new Context(new Identity($actor,'Actor '.$actor),$channel,$workspace->acl,$db,$scopes,$uploads);
$call=fn(string $action,?string $id,array $values=[],?Context $c=null)=>$workspace->executor->execute($c??$ctx(),'files',$action,$id,$values);

// Metadata: the file view lists mounts the actor may read; unauthorized actors get no view.
$view=fn($actor)=>array_values(array_filter($workspace->views(new Identity($actor,'x')),fn($v)=>$v['resource']==='files'));
check(array_column($view('1')[0]['files']['mounts'],'id')===['a','b'],'Both mounts offered');
check(array_column($view('2')[0]['files']['mounts'],'id')===['a'],'Per-mount ACL filters mounts');
check($view('3')===[],'No file view without rules');
check($view('1')[0]['desktopOnly']===false,'desktopOnly is opt-in');
$narrow=new Registry();(new FileManagerDefinition('files','Files','test',['a'=>'Drive A'],desktopOnly:true))->register(new Workspace($narrow,$db));
check($narrow->views()[0]['desktopOnly']===true,'desktopOnly view option');
check($view('1')[0]['files']['upload']["max_size_bytes"]===100&&!isset($view('1')[0]['files']['space']),'Browser metadata only');
$tree=$call('tree','a');check($tree['root']===$rootA&&$tree['items'][0]['name']==='Drive A','Tree root');
fails(fn()=>$call('tree','x'),404,'Unknown mount');

// Names and depth: root is 0, directories reach depth 5, depth 6 fails.
$parent=$rootA;$chain=[];
for($depth=1;$depth<=5;$depth++){$parent=$call('create_directory',$parent,['name'=>'L'.$depth])['id'];$chain[]=$parent;}
check($call('list',$parent)['directory']['depth']===5,'Depth five created');
$error=fails(fn()=>$call('create_directory',$parent,['name'=>'L6']),400,'Depth six rejected');check(isset($error->fieldErrors['name']),'Depth field error');
foreach(['','a/b','a\\b','..','.',"a\0b","a\x01b","bidi\u{202E}txt",str_repeat('x',256)] as $bad)fails(fn()=>$call('create_directory',$rootA,['name'=>$bad]),400,'Unsafe name rejected: '.json_encode($bad));
fails(fn()=>$call('create_directory',$rootA,['name'=>'l1']),409,'Case-insensitive duplicate rejected');
fails(fn()=>$call('create_directory','999999',['name'=>'x']),404,'Unknown parent');
fails(fn()=>$call('list','abc'),404,'Non-numeric id');

// Files for the remaining checks are created through the storage adapter (setup-style data).
$dirA=$storage->entry((int)$call('create_directory',$rootA,['name'=>'Docs'])['id']);
$note=(string)$storage->createFile($dirA,'note.txt','text/plain',"hello\n");
$upper=(string)$storage->createFile($dirA,'UPPER.TXT','text/plain',"upper\n");
$image=(string)$storage->createFile($dirA,'image.png','image/png','png');
$big=(string)$storage->createFile($dirA,'big.txt','text/plain',str_repeat('x',40));
$items=$call('tree','a')['items'];$byId=array_column($items,null,'id');
check(!$call('tree','a')['truncated']&&$byId[$image]===['id'=>$image,'parent'=>(string)$dirA['id'],'name'=>'image.png','kind'=>'file','mime_type'=>'image/png']&&$byId[(string)$dirA['id']]['kind']==='directory','Tree lists files with MIME type');
check(!array_filter($items,static fn($item)=>array_diff(array_keys($item),['id','parent','name','kind','mime_type'])),'Tree items carry no content or sizes');

// Text editor: only .txt (case-insensitive), size limit, optimistic revision.
$text=$call('text_get',$note);check($text['content']==="hello\n"&&$text['revision']==='1','Text loaded with revision');
check($call('text_get',$upper)['content']==="upper\n",'Uppercase .TXT editable');
fails(fn()=>$call('text_get',$image),415,'Non-txt editing rejected');
fails(fn()=>$call('text_get',$big),413,'Editor size limit on open');
fails(fn()=>$call('text_get',(string)$dirA['id']),400,'Directory is not a text file');
$tmp=(getenv('BLADE_TMP_DIR')?:dirname(__DIR__,2).'/tmp').'/files-check-'.bin2hex(random_bytes(4));mkdir($tmp,0700,true);
$part=function(string $field,string $name,string $content) use ($tmp):Upload{$path=$tmp.'/'.bin2hex(random_bytes(6));file_put_contents($path,$content);return new Upload($field,$name,$path,strlen($content),UPLOAD_ERR_OK);};
$saved=$call('text_save',$note,['revision'=>'1'],$ctx('1',[$part('content','x',"edited\n")]));
check($saved['revision']==='2'&&$storage->content((int)$note)==="edited\n",'Text saved');
$conflict=fails(fn()=>$call('text_save',$note,['revision'=>'1'],$ctx('1',[$part('content','x',"stale\n")])),409,'Stale revision conflict');
check(($conflict->details['conflict']['revision']??null)==='2'&&$storage->content((int)$note)==="edited\n",'Structured conflict, content kept');
fails(fn()=>$call('text_save',$image,['revision'=>'1'],$ctx('1',[$part('content','x','x')])),415,'Non-txt save rejected');
fails(fn()=>$call('text_save',$note,['revision'=>'2'],$ctx('1',[$part('content','x',str_repeat('y',33))])),413,'Editor size limit on save');
fails(fn()=>$call('text_save',$note,['revision'=>'2'],$ctx('1',[$part('content','x',"\xff\xfe")])),415,'Invalid UTF-8 rejected');
fails(fn()=>$call('text_save',$note,['revision'=>'2']),400,'Content part required');

// Viewer content: raw bytes of stored image/video types only, audited without content.
$photo=(string)$storage->createFile($dirA,'photo.jpg','image/jpeg',"\xff\xd8\xffjpeg");
$clip=(string)$storage->createFile($dirA,'clip.webm','video/webm',"\x1a\x45\xdf\xa3webm");
$bytes=$call('content_get',$photo);check($bytes instanceof Download&&$bytes->mimeType==='image/jpeg'&&$bytes->content==="\xff\xd8\xffjpeg",'Image bytes with stored type');
check($call('content_get',$clip)->mimeType==='video/webm','Video bytes with stored type');
check(in_array('video/webm',$view('1')[0]['files']['preview'],true)&&!in_array('text/plain',$view('1')[0]['files']['preview'],true),'Preview types in metadata');
fails(fn()=>$call('content_get',$note),415,'Text is not a viewer type');
fails(fn()=>$call('content_get',(string)$dirA['id']),400,'Directory has no content');
fails(fn()=>$call('content_get',$photo,[],$ctx('3')),403,'Viewer content needs its own rule');
$audit=$db->query("SELECT outcome,detail FROM blade_audit WHERE action='content_get' AND object_id='$photo' ORDER BY id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check($audit['outcome']==='success'&&!str_contains((string)$audit['detail'],'jpeg'),'Viewer access audited without content');

// Upload: allowlist, detected MIME, size, safe name, duplicate policy "ask".
$png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$up=fn(array $parts,string $decision='')=>$call('upload',(string)$dirA['id'],$decision===''?[]:['decision'=>$decision],$ctx('1',$parts));
$result=$up([$part('files','new.txt',"new\n"),$part('files','pixel.png',$png),$part('files','evil.exe','MZ'),$part('files','fake.png','not an image'),$part('files','huge.txt',str_repeat("z",101)),$part('files','a/b.txt','x'),$part('files',' lead.txt','x')]);
check(array_column($result['succeeded'],'name')===['new.txt','pixel.png'],'Valid uploads stored');
check(count($result['failed'])===5,'Invalid extension, MIME, size and names failed');
check($storage->child((int)$dirA['id'],'pixel.png')['mime_type']==='image/png','Detected MIME stored');
fails(fn()=>$up([$part('files','evil.exe','MZ')]),400,'All-invalid upload rejected');
$ask=fails(fn()=>$up([$part('files','new.txt',"again\n")]),409,'Duplicate asks');
check(($ask->details['conflicts'][0]['name']??'')==='new.txt'&&$storage->content((int)$storage->child((int)$dirA['id'],'new.txt')['id'])==="new\n",'Conflict before writes');
check($up([$part('files','new.txt',"renamed\n")],'rename')['succeeded'][0]['name']==='new (2).txt','Rename decision');
check($up([$part('files','new.txt',"over\n")],'overwrite')['succeeded'][0]['name']==='new.txt'&&$storage->content((int)$storage->child((int)$dirA['id'],'new.txt')['id'])==="over\n",'Overwrite decision');
check(count($up([$part('files','new.txt','x')],'skip')['skipped'])===1,'Skip decision');
fails(fn()=>$call('upload',(string)$dirA['id']),400,'Upload without parts');

// Copy/move: recursive, cross-mount, cycles, depth preflight, conflicts, permissions.
$tree=$storage->entry((int)$call('create_directory',(string)$dirA['id'],['name'=>'Tree'])['id']);
$sub=$storage->entry((int)$call('create_directory',(string)$tree['id'],['name'=>'Sub'])['id']);
$storage->createFile($sub,'leaf.txt','text/plain','leaf');
$copied=$call('copy',$rootB,['sources'=>(string)$tree['id']]);
$copy=$storage->entry((int)$copied['succeeded'][0]['id']);
check($copy['mount_id']==='b'&&$storage->child((int)$storage->child((int)$copy['id'],'Sub')['id'],'leaf.txt')!==null,'Recursive cross-mount copy');
check($storage->child((int)$sub['id'],'leaf.txt')!==null,'Copy keeps source');
fails(fn()=>$call('move',(string)$sub['id'],['sources'=>(string)$tree['id']]),400,'Move into descendant rejected');
fails(fn()=>$call('move',(string)$tree['id'],['sources'=>(string)$tree['id']]),400,'Move into itself rejected');
fails(fn()=>$call('copy',(string)$sub['id'],['sources'=>(string)$tree['id']]),400,'Copy into descendant rejected');
fails(fn()=>$call('copy',$rootB,['sources'=>(string)$tree['id'].','.(string)$sub['id']]),400,'Nested selection rejected');
fails(fn()=>$call('copy',$rootB,['sources'=>$rootA]),400,'Mount root not copyable');
fails(fn()=>$call('copy',$rootB,['sources'=>'1,1']),400,'Duplicate source ids');
$deep=$chain[3];// depth 4: Tree (height 1) would place Sub at depth 6
$before=$db->query('SELECT COUNT(*) FROM blade_files')->fetchColumn();
fails(fn()=>$call('copy',$deep,['sources'=>(string)$tree['id']]),400,'Depth preflight rejects copy');
fails(fn()=>$call('move',$deep,['sources'=>(string)$tree['id'].','.$note]),400,'Depth preflight rejects whole move');
check($db->query('SELECT COUNT(*) FROM blade_files')->fetchColumn()===$before&&$storage->entry((int)$note)['parent_id']==$dirA['id'],'No change after preflight failure');
$conflicts=fails(fn()=>$call('copy',$rootB,['sources'=>(string)$tree['id']]),409,'Copy conflict asks');
check($conflicts->details['conflicts'][0]['name']==='Tree','Conflict details');
check($call('copy',$rootB,['sources'=>(string)$tree['id'],'decision'=>'rename'])['succeeded'][0]['name']==='Tree (2)','Copy rename');
$overwrite=$call('copy',$rootB,['sources'=>(string)$tree['id'],'decision'=>'overwrite']);
check(count($overwrite['failed'])===1&&!$overwrite['succeeded'],'Directories are never overwritten');
$noteB=(string)$storage->createFile($storage->entry((int)$rootB),'note.txt','text/plain','old');
check($call('copy',$rootB,['sources'=>$note,'decision'=>'overwrite'])['succeeded'][0]['id']===$noteB&&$storage->content((int)$noteB)==="edited\n",'File overwrite');
check($call('copy',(string)$dirA['id'],['sources'=>$note,'decision'=>'rename'])['succeeded'][0]['name']==='note (2).txt','Copy into same directory renames');
$moved=$call('move',$rootB,['sources'=>(string)$tree['id'],'decision'=>'rename']);
check($moved['succeeded'][0]['id']===(string)$tree['id']&&$storage->entry((int)$sub['id'])['mount_id']==='b'&&$storage->entry((int)$tree['id'])['name']==='Tree (3)','Recursive cross-mount move');
check(count($call('move',$rootB,['sources'=>(string)$tree['id']])['failed'])===1,'Move to current parent reported');
$reader=$ctx('2');
check($call('list',$rootA,[],$reader)['directory']['id']===$rootA,'Reader lists drive A');
fails(fn()=>$call('list',$rootB,[],$reader),403,'Reader denied drive B');
fails(fn()=>$call('create_directory',$rootA,['name'=>'x'],$reader),403,'Reader cannot write');
fails(fn()=>$call('text_save',$upper,['revision'=>'1'],$ctx('2',[$part('content','x','x')])),403,'Reader cannot save');
fails(fn()=>$call('tree','a',[],$ctx('3')),403,'No rule, no tree');
// Write on the destination is not enough: every source must be readable.
foreach(['copy','move'] as $a)$rule->execute(['4',$a,'ui','id','b']);
fails(fn()=>$call('copy',$rootB,['sources'=>$upper],$ctx('4')),403,'Source read permission required');
$rule->execute(['4','list','ui','id','a']);
check(count($call('copy',$rootB,['sources'=>$upper],$ctx('4'))['succeeded'])===1,'Readable source copies');
fails(fn()=>$call('move',$rootB,['sources'=>$upper],$ctx('4')),403,'Move needs move right on the source mount');
// UI rules do not reach the API channel; token scopes only narrow.
fails(fn()=>$call('list',$rootA,[],$ctx('1',[],'api',['files.list'])),404,'UI grant does not open API');
$rule->execute(['1','list','api','all','']);
check($call('list',$rootA,[],$ctx('1',[],'api',['files.list']))['directory']['id']===$rootA,'API rule with scope');
fails(fn()=>$call('list',$rootA,[],$ctx('1',[],'api',['files.tree'])),403,'Token scope narrows');

// Audit: operation, actor, outcome and related IDs; never contents or names.
$audit=$db->query("SELECT actor_id,action,object_id,outcome,field_names,detail FROM blade_audit WHERE resource='files' ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$copyAudit=array_values(array_filter($audit,fn($r)=>$r['action']==='copy'&&$r['outcome']==='success'))[0];
$detail=json_decode($copyAudit['detail'],true);
check($copyAudit['actor_id']==='1'&&$copyAudit['object_id']===$rootB&&$detail['sources']===[(string)$tree['id']]&&count($detail['succeeded'])===1,'Copy audit with source/target IDs');
check((bool)array_filter($audit,fn($r)=>$r['action']==='text_save'&&$r['outcome']==='rejected'),'Rejected save audited');
check((bool)array_filter($audit,fn($r)=>$r['action']==='upload'&&$r['outcome']==='success'&&json_decode($r['detail'],true)['created']),'Upload audited');
$all=json_encode($audit);
foreach(['edited','hello','over','renamed','leaf','note.txt'] as $secret)check(!str_contains($all,$secret),'Audit excludes content/names: '.$secret);
// Metadata exposes no storage space, SQL or server paths.
check(!str_contains(json_encode($view('1')),$tmp)&&!str_contains(json_encode($view('1')),'blade_files'),'No backend details in metadata');
array_map('unlink',glob($tmp.'/*'));rmdir($tmp);
echo "Files PASS\n";

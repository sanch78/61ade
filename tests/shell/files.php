<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Feature\{Action,Registry,Workspace,Context,DownloadStream,Failure,Field,StreamedDownload,Transfers,Upload,UploadPolicy};
use Blade\Files\{ContentStore,FileManagerDefinition,FileStorage,MediaProbe,Thumbnails};
use Blade\Infrastructure\Transaction;
use Blade\Shell\Identity;
// Virtual file manager contract: names, depth, copy/move, conflicts, text editor, upload, ACL, audit,
// content store, media metadata, thumbnails, streaming, audio types, paged listing, delete policies, rename, download, ZIP and the BLOB migration.
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message):Failure{try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.': '.$e->getMessage().')');return $e;}throw new RuntimeException($message.' (accepted)');}
$tmp=(getenv('BLADE_TMP_DIR')?:dirname(__DIR__,2).'/tmp').'/files-check-'.bin2hex(random_bytes(4));mkdir($tmp,0700,true);
$root=$tmp.'/store';
$src=function(string $content) use ($tmp):string{$path=$tmp.'/src-'.bin2hex(random_bytes(6));file_put_contents($path,$content);return $path;};
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$definition=new FileManagerDefinition('files','Files','test',['a'=>'Drive A','b'=>'Drive B'],allowedExtensions:['txt','png'],maxSizeBytes:100,textMaxBytes:32,contentRoot:$root);
$definition->install($db);$definition->install($db);
$registry=new Registry();$workspace=new Workspace($registry,$db);$definition->register($workspace);
$storage=$definition->storage($db,$workspace->tasks);
$rootA=(string)$storage->root('a')['id'];$rootB=(string)$storage->root('b')['id'];
$rule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'files',?,?,'allow',?,?,'')");
foreach(['tree','list','create_directory','upload','copy','move','text_get','text_save','content_get','content_stream','thumbnail_get','download'] as $a)$rule->execute(['1',$a,'ui','all','']);
// Actor 2 reads drive A only; actor 3 has no rule at all.
foreach(['tree','list','text_get'] as $a)$rule->execute(['2',$a,'ui','id','a']);
$ctx=fn(string $actor='1',array $uploads=[],string $channel='ui',array $scopes=[])=>new Context(new Identity($actor,'Actor '.$actor),$channel,$workspace->acl,$db,$scopes,$uploads);
$call=fn(string $action,?string $id,array $values=[],?Context $c=null)=>$workspace->executor->execute($c??$ctx(),'files',$action,$id,$values);

// Metadata: the file view lists mounts the actor may read; unauthorized actors get no view.
$view=fn($actor)=>array_values(array_filter($workspace->views(new Identity($actor,'x')),fn($v)=>$v['resource']==='files'));
check(array_column($view('1')[0]['options']['mounts'],'id')===['a','b'],'Both mounts offered');
check(array_column($view('2')[0]['options']['mounts'],'id')===['a'],'Per-mount ACL filters mounts');
check($view('3')===[],'No file view without rules');
check($view('1')[0]['desktopOnly']===false,'desktopOnly is opt-in');
$narrow=new Registry();(new FileManagerDefinition('files','Files','test',['a'=>'Drive A'],desktopOnly:true,contentRoot:$root))->register(new Workspace($narrow,$db));
check($narrow->views()[0]->desktopOnly===true,'desktopOnly view option');
check(array_keys($view('1')[0]['options']['upload'])===['policy']&&$view('1')[0]['options']['upload']['policy']['maxSizeBytes']===100&&!isset($view('1')[0]['options']['space']),'Browser metadata only; upload rules once, as the policy');
check($view('1')[0]['options']['upload']['policy']['maxFiles']===20,'Upload file count in metadata');
foreach([fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A']),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:'relative/files'),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root.'/../x'),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxFiles:21),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxFiles:0),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxSizeBytes:1073741825),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,ffmpegPath:'ffmpeg'),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,ffprobePath:'/usr/../bin/ffprobe')] as $invalid){try{$invalid();throw new RuntimeException('Invalid file manager definition accepted');}catch(InvalidArgumentException){}}
$single=new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxFiles:1);
check($single->metadata()['upload']['policy']['maxFiles']===1&&$single->temporaryRoot()===$root.'/.transfers','Single-file limit and default transfer root');
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
$note=(string)$storage->createFile($dirA,'note.txt','text/plain',$src("hello\n"));
$upper=(string)$storage->createFile($dirA,'UPPER.TXT','text/plain',$src("upper\n"));
$image=(string)$storage->createFile($dirA,'image.png','image/png',$src('png'));
$big=(string)$storage->createFile($dirA,'big.txt','text/plain',$src(str_repeat('x',40)));
$batched=$storage->entries([$note,$upper,'999999',$note,...range(500000,501100)]);ksort($batched);
check(array_keys($batched)===[(int)$note,(int)$upper]&&$batched[(int)$note]===$storage->entry((int)$note)&&$storage->entries([])===[],'Batched entries over chunked IN queries');
$items=$call('tree','a')['items'];$byId=array_column($items,null,'id');
check(!$call('tree','a')['truncated']&&$byId[$image]===['id'=>$image,'parent'=>(string)$dirA['id'],'name'=>'image.png','kind'=>'file','mime_type'=>'image/png']&&$byId[(string)$dirA['id']]['kind']==='directory','Tree lists files with MIME type');
check(!array_filter($items,static fn($item)=>array_diff(array_keys($item),['id','parent','name','kind','mime_type'])),'Tree items carry no content or sizes');

// Text editor: only .txt (case-insensitive), size limit, optimistic revision.
$text=$call('text_get',$note);check($text['content']==="hello\n"&&$text['revision']==='1','Text loaded with revision');
check($call('text_get',$upper)['content']==="upper\n",'Uppercase .TXT editable');
fails(fn()=>$call('text_get',$image),415,'Non-txt editing rejected');
fails(fn()=>$call('text_get',$big),413,'Editor size limit on open');
fails(fn()=>$call('text_get',(string)$dirA['id']),400,'Directory is not a text file');
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
$photo=(string)$storage->createFile($dirA,'photo.jpg','image/jpeg',$src("\xff\xd8\xffjpeg"));
$clip=(string)$storage->createFile($dirA,'clip.webm','video/webm',$src("\x1a\x45\xdf\xa3webm"));
$bytes=$call('content_get',$photo);check($bytes instanceof DownloadStream&&$bytes->mimeType==='image/jpeg'&&file_get_contents($bytes->path)==="\xff\xd8\xffjpeg"&&$bytes->size===7,'Image bytes with stored type');
check($bytes->disposition==='attachment'&&$bytes->cacheControl()==='no-store'&&$bytes->etag==='"'.hash('sha256',"\xff\xd8\xffjpeg").'"','content_get keeps attachment and no-store');
check($call('content_get',$clip)->mimeType==='video/webm','Video bytes with stored type');
check(in_array('video/webm',$view('1')[0]['options']['preview'],true)&&!in_array('text/plain',$view('1')[0]['options']['preview'],true),'Preview types in metadata');
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
// The executor applies the policy first (type, size, names) and prepends those parts to the handler's own content verdicts.
check(array_column($result['failed'],'code')===['type','too_large','name','name','content_mismatch']&&array_column($result['failed'],'name')===['evil.exe','huge.txt','a/b.txt',' lead.txt','fake.png'],'Invalid extension, MIME, size and names failed with codes');
check($storage->child((int)$dirA['id'],'pixel.png')['mime_type']==='image/png','Detected MIME stored');
check(fails(fn()=>$up([$part('files','evil.exe','MZ')]),400,'All-invalid upload rejected')->details['code']==='type','All-invalid upload code');
$mixed=fails(fn()=>$up([$part('files','evil.exe','MZ'),$part('files','fake.png','not an image')]),400,'Policy and content rejections together');
check($mixed->details['code']==='type'&&array_column($mixed->details['failed'],'code')===['type','content_mismatch'],'Handler rejection lists the policy-rejected parts first');
$askMixed=fails(fn()=>$up([$part('files','new.txt',"again\n"),$part('files','evil.exe','MZ')]),409,'Duplicate with a rejected part asks');
check(array_column($askMixed->details['failed'],'code')===['type']&&$askMixed->details['conflicts'][0]['name']==='new.txt','Conflict also reports the policy-rejected part');
check(fails(fn()=>$up(array_map(fn($i)=>$part('files',"q$i.txt",'q'),range(1,21))),400,'More parts than maxFiles')->details===['code'=>'quota'],'Direct quota code');
$ask=fails(fn()=>$up([$part('files','new.txt',"again\n")]),409,'Duplicate asks');
check(($ask->details['conflicts'][0]['name']??'')==='new.txt'&&$storage->content((int)$storage->child((int)$dirA['id'],'new.txt')['id'])==="new\n",'Conflict before writes');
check($up([$part('files','new.txt',"renamed\n")],'rename')['succeeded'][0]['name']==='new (2).txt','Rename decision');
check($up([$part('files','new.txt',"over\n")],'overwrite')['succeeded'][0]['name']==='new.txt'&&$storage->content((int)$storage->child((int)$dirA['id'],'new.txt')['id'])==="over\n",'Overwrite decision');
check(count($up([$part('files','new.txt','x')],'skip')['skipped'])===1,'Skip decision');
fails(fn()=>$call('upload',(string)$dirA['id']),400,'Upload without parts');

// Copy/move: recursive, cross-mount, cycles, depth preflight, conflicts, permissions.
$tree=$storage->entry((int)$call('create_directory',(string)$dirA['id'],['name'=>'Tree'])['id']);
$sub=$storage->entry((int)$call('create_directory',(string)$tree['id'],['name'=>'Sub'])['id']);
$storage->createFile($sub,'leaf.txt','text/plain',$src('leaf'));
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
$noteB=(string)$storage->createFile($storage->entry((int)$rootB),'note.txt','text/plain',$src('old'));
// Overwrite under `archive` (this definition): the replaced file is archived (content kept) and the copy is a new entry in its place.
$archivedRow=fn(string $id)=>$db->query('SELECT id,name_key,archived_at,archived_by,storage_key FROM blade_files WHERE id='.(int)$id)->fetch(PDO::FETCH_ASSOC);
$oldNoteB=$noteB;$oldNoteBKey=$storage->entry((int)$noteB)['storage_key'];
$copyOver=$call('copy',$rootB,['sources'=>$note,'decision'=>'overwrite']);$noteB=$copyOver['succeeded'][0]['id'];
check($noteB!==$oldNoteB&&$storage->child((int)$rootB,'note.txt')['id']==$noteB&&$storage->content((int)$noteB)==="edited\n"&&$storage->entry((int)$oldNoteB)===null,'Copy overwrite: a new entry takes the name');
check($archivedRow($oldNoteB)['archived_at']!==null&&$archivedRow($oldNoteB)['archived_by']==='1'&&$archivedRow($oldNoteB)['name_key']==='\0archived:'.$oldNoteB&&$archivedRow($oldNoteB)['storage_key']===$oldNoteBKey,'Copy overwrite archives the replaced file with its content');
$copyAudit=json_decode($db->query("SELECT detail FROM blade_audit WHERE action='copy' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true);
check($copyAudit['succeeded']===[$note.'>'.$noteB]&&$copyAudit['archived']===[$oldNoteB],'Copy overwrite audit: resulting and archived ids');
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
fails(fn()=>$call('copy',$rootB,['sources'=>$upper],$ctx('4')),403,'Copy reads the bytes: list alone is not enough');
$rule->execute(['4','download','ui','id','a']);
check(count($call('copy',$rootB,['sources'=>$upper],$ctx('4'))['succeeded'])===1,'Listable and downloadable source copies');
fails(fn()=>$call('move',$rootB,['sources'=>$upper],$ctx('4')),403,'Move needs move right on the source mount');
// UI rules do not reach the API channel; token scopes only narrow.
fails(fn()=>$call('list',$rootA,[],$ctx('1',[],'api',['files.list'])),404,'UI grant does not open API');
$rule->execute(['1','list','api','all','']);
check($call('list',$rootA,[],$ctx('1',[],'api',['files.list']))['directory']['id']===$rootA,'API rule with scope');
fails(fn()=>$call('list',$rootA,[],$ctx('1',[],'api',['files.tree'])),403,'Token scope narrows');

// Content store: content-addressed layout, identical content stored once, copies share the key, no BLOB column.
$columns=array_column($db->query('PRAGMA table_info(blade_files)')->fetchAll(PDO::FETCH_ASSOC),'name');
check(!in_array('content',$columns,true)&&!array_diff(['storage_key','sha256','width','height','duration_ms','orientation'],$columns),'Fresh install: content columns, no BLOB column');
$noteRow=$storage->entry((int)$note);
check(ContentStore::valid($noteRow['storage_key'])&&$noteRow['storage_key']===substr($noteRow['sha256'],0,2).'/'.substr($noteRow['sha256'],2,2).'/'.$noteRow['sha256'],'Content-addressed storage key');
check(is_file($root.'/test/'.$noteRow['storage_key'])&&hash_file('sha256',$root.'/test/'.$noteRow['storage_key'])===$noteRow['sha256']&&$noteRow['sha256']===hash('sha256',"edited\n"),'Content file at <root>/<space>/ab/cd/<sha256>');
check((fileperms($root.'/test/'.$noteRow['storage_key'])&0777)===0660&&(fileperms($root.'/test')&07777)===02770,'Group-shared store permissions');
foreach(['../x','ab/cd/'.str_repeat('0',64),'AB/CD/'.str_repeat('A',64),'/etc/passwd'] as $key){try{$storage->store->path($key);throw new RuntimeException('Invalid storage key accepted: '.$key);}catch(InvalidArgumentException){}}
$same=$up([$part('files','same-1.txt',"identical\n"),$part('files','same-2.txt',"identical\n")]);
[$same1,$same2]=array_map(fn($item)=>$storage->entry((int)$item['id']),$same['succeeded']);
check($same1['storage_key']===$same2['storage_key']&&count(glob($root.'/test/*/*/'.$same1['sha256']))===1,'Identical uploads stored once');
$copiedSame=$storage->entry((int)$call('copy',$rootB,['sources'=>(string)$same1['id']])['succeeded'][0]['id']);
check($copiedSame['storage_key']===$same1['storage_key']&&$copiedSame['sha256']===$same1['sha256'],'Copy shares the storage key');
check((int)$db->query('SELECT COUNT(*) FROM blade_files WHERE storage_key=\'\' AND kind=\'file\'')->fetchColumn()===0,'Every file row references stored content');

// Collection: removal and overwrite drop references; only unreferenced content goes, after the task runs.
$tasks=$workspace->tasks;
$keyOf=fn(string $id)=>$storage->entry((int)$id)['storage_key'];
$stored=fn(string $key)=>is_file($root.'/test/'.$key);
$target=$storage->entry((int)$call('create_directory',$rootB,['name'=>'Target'])['id']);
$doomed=$storage->createFile($target,'same-1.txt','text/plain',$src("only on B\n"));
$doomedKey=$keyOf((string)$doomed);
// Under `archive` an overwriting move archives the target file; the moved entry keeps its id. Removal semantics: the `delete` definition below.
$moved=$call('move',(string)$target['id'],['sources'=>(string)$same1['id'],'decision'=>'overwrite']);
check($moved['succeeded'][0]['id']===(string)$same1['id']&&$storage->entry($doomed)===null&&$storage->child((int)$target['id'],'same-1.txt')['id']==$same1['id'],'Overwriting move replaces the target file');
check($archivedRow((string)$doomed)['archived_at']!==null&&$archivedRow((string)$doomed)['name_key']==='\0archived:'.$doomed,'Overwriting move archives the target file');
$tasks->run(100,60);
check($stored($doomedKey)&&$stored($same1['storage_key']),'Archived target content stays stored');
$over=$up([$part('files','same-2.txt',"replaced\n")],'overwrite');
$newSame2=$over['succeeded'][0]['id'];
check($newSame2!==(string)$same2['id']&&$over['succeeded'][0]['replaced']===(string)$same2['id']&&(int)$storage->entry((int)$newSame2)['revision']===1&&$keyOf($newSame2)!==$same1['storage_key']&&$storage->entry((int)$same2['id'])===null,'Upload overwrite: a new entry with the new content');
check($archivedRow((string)$same2['id'])['archived_at']!==null&&$archivedRow((string)$same2['id'])['storage_key']===$same1['storage_key'],'Upload overwrite archives the replaced file with its content');
$upAudit=json_decode($db->query("SELECT detail FROM blade_audit WHERE action='upload' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true);
check($upAudit['replaced']===[$newSame2]&&$upAudit['archived']===[(string)$same2['id']],'Upload overwrite audit: resulting and archived ids');
$tasks->run(100,60);
check($stored($same1['storage_key']),'Old content kept while the copy and the archived entry reference it');
$storage->removeFile((int)$copiedSame['id']);$storage->removeFile((int)$same1['id']);
$tasks->run(100,60);
check($stored($same1['storage_key']),'An archived entry still references its content');
$storage->deleteTree([$db->query('SELECT * FROM blade_files WHERE id='.(int)$same2['id'])->fetch(PDO::FETCH_ASSOC)]);
$tasks->run(100,60);
check(!$stored($same1['storage_key']),'Content collected after its last reference is removed');
Transaction::begin($db);$ghost=$storage->createFile($dirA,'ghost.txt','text/plain',$src("rolled back\n"));$db->rollBack();
check($stored(ContentStore::key(hash('sha256',"rolled back\n"))),'Content written by a rolled-back transaction exists before the task');
$tasks->run(100,60);
check(!$stored(ContentStore::key(hash('sha256',"rolled back\n"))),'Content of a rolled-back transaction collected after the response');

// Media: real PNG, EXIF-rotated JPEG, 2-second MP4 and WebM made at test time; metadata and thumbnails.
$media=$storage->entry((int)$call('create_directory',$rootA,['name'=>'Media'])['id']);
$gd=imagecreatetruecolor(800,400);imagefilledrectangle($gd,0,0,399,399,imagecolorallocate($gd,200,40,40));imagepng($gd,$tmp.'/wide.png');
$gd=imagecreatetruecolor(600,300);imagefilledrectangle($gd,0,0,299,299,imagecolorallocate($gd,40,40,200));imagejpeg($gd,$tmp.'/plain.jpg',85);
// Minimal EXIF APP1 (IFD0 Orientation = 6): stored landscape, displayed portrait.
$tiff='II'.pack('v',42).pack('V',8).pack('v',1).pack('vvV',0x0112,3,1).pack('v',6)."\0\0".pack('V',0);
$jpeg=file_get_contents($tmp.'/plain.jpg');file_put_contents($tmp.'/rotated.jpg',substr($jpeg,0,2)."\xFF\xE1".pack('n',strlen("Exif\0\0".$tiff)+2)."Exif\0\0".$tiff.substr($jpeg,2));
foreach(['clip.mp4'=>['testsrc=size=640x360:rate=25:duration=2','libx264','-pix_fmt','yuv420p'],'clip.webm'=>['testsrc=size=270x480:rate=25:duration=2','libvpx','-b:v','300k']] as $name=>[$source,$codec,$flag,$value]){
    MediaProbe::process(['/usr/bin/ffmpeg','-nostdin','-v','error','-y','-f','lavfi','-i',$source,'-c:v',$codec,$flag,$value,$tmp.'/'.$name],60);
    check(is_file($tmp.'/'.$name)&&filesize($tmp.'/'.$name)>0,'ffmpeg test media generated: '.$name);
}
$mediaIds=[];
foreach(['wide.png'=>'image/png','rotated.jpg'=>'image/jpeg','clip.mp4'=>'video/mp4','clip.webm'=>'video/webm'] as $name=>$mime)$mediaIds[$name]=(string)$storage->createFile($media,$name,$mime,$tmp.'/'.$name);
$meta=fn(string $name)=>array_intersect_key($storage->entry((int)$mediaIds[$name]),['width'=>1,'height'=>1,'duration_ms'=>1,'orientation'=>1]);
check($meta('wide.png')===['width'=>800,'height'=>400,'duration_ms'=>null,'orientation'=>'landscape'],'PNG dimensions');
check($meta('rotated.jpg')===['width'=>300,'height'=>600,'duration_ms'=>null,'orientation'=>'portrait'],'JPEG EXIF orientation swaps dimensions');
$mp4=$meta('clip.mp4');$webm=$meta('clip.webm');
check($mp4['width']===640&&$mp4['height']===360&&$mp4['orientation']==='landscape'&&abs($mp4['duration_ms']-2000)<=100,'MP4 dimensions and duration');
check($webm['width']===270&&$webm['height']===480&&$webm['orientation']==='portrait'&&abs($webm['duration_ms']-2000)<=100,'WebM dimensions and duration');
check((new MediaProbe('/nonexistent/ffprobe'))->probe($tmp.'/clip.mp4','video/mp4')===['width'=>null,'height'=>null,'duration_ms'=>null,'orientation'=>'','codec'=>null],'Missing probe tool gives empty metadata');
check((new MediaProbe())->probe($tmp.'/clip.mp4','video/mp4')['codec']==='h264'&&(new MediaProbe())->probe($tmp.'/clip.webm','video/webm')['codec']==='vp8'&&(new MediaProbe())->probe($tmp.'/wide.png','image/png')['codec']===null,'Probe reports the video codec');
$listed=fn()=>array_column($call('list',(string)$media['id'])['items'],null,'name');
check($listed()['wide.png']['thumbnail']==='pending'&&$listed()['wide.png']['width']===800&&$listed()['clip.mp4']['duration_ms']===$mp4['duration_ms'],'List carries metadata and pending thumbnails');
$pending=fails(fn()=>$call('thumbnail_get',$mediaIds['wide.png']),404,'Thumbnail pending before the task');
check($pending->details===['state'=>'pending'],'Pending thumbnail state');
$tasks->run(100,120);
foreach($mediaIds as $name=>$id){
    check($listed()[$name]['thumbnail']==='ready','Thumbnail ready: '.$name);
    $thumb=$call('thumbnail_get',$id);$info=getimagesize($thumb->path);
    check($thumb instanceof DownloadStream&&$thumb->mimeType==='image/webp'&&$thumb->disposition==='inline'&&$thumb->cacheControl()==='private, max-age=60'&&$info['mime']==='image/webp'&&max($info[0],$info[1])===320,'WebP thumbnail, longest side 320: '.$name);
    check($thumb->etag==='"'.hash_file('sha256',$thumb->path).'"','Thumbnail ETag is its content hash: '.$name);
}
$info=getimagesize($call('thumbnail_get',$mediaIds['rotated.jpg'])->path);check($info[0]===160&&$info[1]===320,'JPEG thumbnail follows EXIF orientation');
$info=getimagesize($call('thumbnail_get',$mediaIds['clip.webm'])->path);check($info[0]<$info[1],'Portrait video thumbnail');
check($listed()['wide.png']['thumbnail']==='ready'&&array_column($call('list',(string)$dirA['id'])['items'],null,'name')['note.txt']['thumbnail']==='none','Non-media files have no thumbnail');
check(array_column($call('list',(string)$dirA['id'])['items'],null,'name')['photo.jpg']['thumbnail']==='failed','Unrenderable image reports failed');
check(fails(fn()=>$call('thumbnail_get',$photo),404,'Failed thumbnail')->details===['state'=>'failed'],'Failed thumbnail state');
$tasks->run(100,60);check(array_column($call('list',(string)$dirA['id'])['items'],null,'name')['photo.jpg']['thumbnail']==='failed','Failed thumbnail is not retried on read');
fails(fn()=>$call('thumbnail_get',$note),415,'Text has no thumbnail');
fails(fn()=>$call('thumbnail_get',(string)$media['id']),415,'Directory has no thumbnail');
$copiedMedia=$call('copy',$rootB,['sources'=>(string)$media['id']])['succeeded'][0]['id'];
check(array_column(array_column($call('list',$copiedMedia)['items'],null,'name'),'thumbnail')===['ready','ready','ready','ready'],'Copy shares ready thumbnails without a task');
$thumbKey=$storage->derivative((int)$mediaIds['wide.png'],Thumbnails::KIND)['storage_key'];
$call('move',(string)$dirA['id'],['sources'=>$mediaIds['wide.png']]);
check($listed()['wide.png']??null===null&&array_column($call('list',(string)$dirA['id'])['items'],null,'name')['wide.png']['thumbnail']==='ready','Move keeps the thumbnail current');
$storage->replaceContent((int)$mediaIds['wide.png'],'image/png',$tmp.'/plain.jpg');
check($storage->derivative((int)$mediaIds['wide.png'],Thumbnails::KIND)===null&&array_column($call('list',(string)$dirA['id'])['items'],null,'name')['wide.png']['thumbnail']==='pending','Replace drops the derivative');
$tasks->run(100,60);
check($stored($thumbKey),'Derivative content kept while the copy references it');
$thumbStale=$call('thumbnail_get',$mediaIds['wide.png']);check($thumbStale->etag!=='"'.basename($thumbKey).'"','New revision gets a new thumbnail');

// Streaming: inline, revalidated by content hash, single ranges; ACL, other mounts and API scopes.
$stream=$call('content_stream',$mediaIds['clip.mp4']);
check($stream instanceof DownloadStream&&$stream->disposition==='inline'&&$stream->cacheControl()==='private, no-cache'&&$stream->etag==='"'.hash_file('sha256',$tmp.'/clip.mp4').'"'&&$stream->size===filesize($tmp.'/clip.mp4'),'content_stream is an inline, revalidated stream');
fails(fn()=>$call('content_stream',$note),415,'Text is not streamed');
fails(fn()=>$call('content_stream',(string)$media['id']),400,'Directory is not streamed');
$streamAudit=$db->query("SELECT detail FROM blade_audit WHERE action='content_stream' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn();
check(json_decode($streamAudit,true)===['size'=>$stream->size],'Stream audit holds the size only');
foreach(['content_stream','thumbnail_get'] as $a){
    fails(fn()=>$call($a,$mediaIds['clip.mp4'],[],$ctx('3')),403,$a.' needs its own rule');
    $rule->execute(['2',$a,'ui','id','a']);
    check($call($a,$mediaIds['clip.mp4'],[],$ctx('2')) instanceof DownloadStream,$a.' granted on drive A');
    $onB=array_column($call('list',$copiedMedia)['items'],null,'name')['clip.mp4']['id'];
    fails(fn()=>$call($a,$onB,[],$ctx('2')),403,$a.' denied on another mount');
    fails(fn()=>$call($a,$mediaIds['clip.mp4'],[],$ctx('1',[],'api',['files.'.$a])),404,$a.' UI grant does not open the API');
    $rule->execute(['1',$a,'api','all','']);
    check($call($a,$mediaIds['clip.mp4'],[],$ctx('1',[],'api',['files.'.$a])) instanceof DownloadStream,$a.' API rule with scope');
    fails(fn()=>$call($a,$mediaIds['clip.mp4'],[],$ctx('1',[],'api',['files.list'])),403,$a.' token scope narrows');
}
foreach([['bytes=0-99',1000,[0,99]],['bytes=100-',1000,[100,999]],['bytes=-100',1000,[900,999]],['bytes=-5000',1000,[0,999]],['bytes=990-5000',1000,[990,999]],['bytes=1000-',1000,false],['bytes=5000-6000',1000,false],['bytes=-0',1000,false],['bytes=0-',0,false],
    ['bytes=0-1,5-9',1000,null],[null,1000,null],['',1000,null],['bytes=abc',1000,null],['bytes=9-3',1000,null],['items=0-9',1000,null],['bytes=-',1000,null]] as [$header,$size,$expected])check(DownloadStream::range($header,$size)===$expected,'Range '.json_encode($header).' of '.$size);
$probe=new DownloadStream('video/mp4',$tmp.'/clip.mp4',1000,'"abc"',[],'inline','Kép "1".mp4',0);
check($probe->plan([])['status']===200&&in_array('Content-Length: 1000',$probe->plan([])['headers'],true)&&in_array('Accept-Ranges: bytes',$probe->plan([])['headers'],true),'Whole response');
check($probe->plan(['HTTP_IF_NONE_MATCH'=>'"x", "abc"'])['status']===304&&$probe->plan(['HTTP_IF_NONE_MATCH'=>'W/"abc"'])['status']===304,'If-None-Match gives 304');
$partial=$probe->plan(['HTTP_RANGE'=>'bytes=10-19']);
check($partial['status']===206&&$partial['range']===[10,19]&&in_array('Content-Range: bytes 10-19/1000',$partial['headers'],true)&&in_array('Content-Length: 10',$partial['headers'],true),'Single range gives 206');
check($probe->plan(['HTTP_RANGE'=>'bytes=10-19','HTTP_IF_RANGE'=>'"old"'])['status']===200&&$probe->plan(['HTTP_RANGE'=>'bytes=10-19','HTTP_IF_RANGE'=>'"abc"'])['status']===206,'If-Range guards the range');
$unsatisfiable=$probe->plan(['HTTP_RANGE'=>'bytes=2000-']);check($unsatisfiable['status']===416&&in_array('Content-Range: bytes */1000',$unsatisfiable['headers'],true),'Unsatisfiable range gives 416');
check(in_array("Content-Security-Policy: default-src 'none'; sandbox",$probe->plan([])['headers'],true)&&in_array('X-Content-Type-Options: nosniff',$probe->plan([])['headers'],true)&&in_array('Cross-Origin-Resource-Policy: same-origin',$probe->plan([])['headers'],true),'Stream security headers');
check($probe->contentDisposition()==='inline; filename="K_p _1_.mp4"; filename*=UTF-8\'\'K%C3%A9p%20%221%22.mp4','Filename with ASCII fallback and UTF-8 name');
check((new DownloadStream('image/png','/x',1,'"a"',[],'attachment',"a\r\nb.png"))->contentDisposition()==='attachment; filename="ab.png"; filename*=UTF-8\'\'ab.png','Control characters dropped from the filename');
foreach([fn()=>new DownloadStream('text/html; x','/x',1,'"a"'),fn()=>new DownloadStream('image/png','/x',1,'abc'),fn()=>new DownloadStream('image/png','/x',1,'"a"',[],'download')] as $invalid){try{$invalid();throw new RuntimeException('Invalid stream accepted');}catch(InvalidArgumentException){}}
// GET-capable actions are field-free reads.
foreach([['write'=>true],['upload'=>10],['bulk'=>true,'resolve'=>fn()=>[]],['collection'=>true],['fields'=>[new Field('x','X')]]] as $options){try{new Action('files','bad','Bad',$options['fields']??[],fn()=>null,resolve:$options['resolve']??null,write:$options['write']??false,collection:$options['collection']??false,bulk:$options['bulk']??false,upload:$options['upload']??null,get:true);throw new RuntimeException('Invalid GET action accepted: '.json_encode(array_keys($options)));}catch(InvalidArgumentException){}}
check($registry->get('files','content_stream')->get&&$registry->get('files','thumbnail_get')->get&&!$registry->get('files','content_get')->get,'Only the stream and thumbnail actions are GET-capable');

// Audio (toolkit C-3): allowlist and detection rules, preview types, ffprobe duration and codec, streaming with ranges.
// A 0.5 s PCM WAV is written here; MP3 and M4A are encoded from it with ffmpeg at test time.
$rate=8000;$pcm='';for($i=0;$i<$rate/2;$i++)$pcm.=pack('v',(int)round(6000*sin(2*M_PI*440*$i/$rate))&0xFFFF);
file_put_contents($tmp.'/tone.wav','RIFF'.pack('V',36+strlen($pcm)).'WAVEfmt '.pack('VvvVVvv',16,1,1,$rate,$rate*2,2,16).'data'.pack('V',strlen($pcm)).$pcm);
foreach(['tone.mp3'=>['libmp3lame','32k'],'tone.m4a'=>['aac','32k']] as $name=>[$codec,$bitrate]){
    MediaProbe::process(['/usr/bin/ffmpeg','-nostdin','-v','error','-y','-i',$tmp.'/tone.wav','-c:a',$codec,'-b:a',$bitrate,$tmp.'/'.$name],60);
    check(is_file($tmp.'/'.$name)&&filesize($tmp.'/'.$name)>0,'ffmpeg test audio generated: '.$name);
}
$audioTypes=['tone.wav'=>['wav','audio/wav','pcm_s16le'],'tone.mp3'=>['mp3','audio/mpeg','mp3'],'tone.m4a'=>['m4a','audio/mp4','aac']];
foreach($audioTypes as $name=>[$extension,$mime,$codec]){
    check(FileManagerDefinition::TYPES[$extension][0]===$mime&&FileManagerDefinition::contentMatches($extension,$tmp.'/'.$name),'Audio content detected: '.$name);
    check(in_array($mime,FileManagerDefinition::PREVIEW_TYPES,true)&&in_array($mime,$view('1')[0]['options']['preview'],true)&&!Thumbnails::supports($mime),'Audio preview type without thumbnail: '.$mime);
    $probed=(new MediaProbe())->probe($tmp.'/'.$name,$mime);
    check($probed['width']===null&&$probed['height']===null&&$probed['orientation']===''&&$probed['codec']===$codec&&abs($probed['duration_ms']-500)<=150,'Audio duration and codec: '.$name.' '.json_encode($probed));
}
check((new MediaProbe())->probe($tmp.'/tone.wav','audio/wav')===['width'=>null,'height'=>null,'duration_ms'=>500,'orientation'=>'','codec'=>'pcm_s16le'],'Exact WAV metadata');
foreach([['mp3',$tmp.'/tone.wav'],['wav',$tmp.'/tone.mp3'],['m4a',$tmp.'/tone.wav'],['wav',$tmp.'/clip.mp4'],['mp3',$tmp.'/wide.png'],['m4a',$tmp.'/clip.mp4']] as [$extension,$path])check(!FileManagerDefinition::contentMatches($extension,$path),'Audio extension refuses other bytes: '.$extension.' '.basename($path));
check((new MediaProbe('/nonexistent/ffprobe'))->probe($tmp.'/tone.wav','audio/wav')['duration_ms']===null,'Missing probe tool gives no audio length');
$audioDefinition=new FileManagerDefinition('files','Files','test',['a'=>'A'],allowedExtensions:['txt','wav','mp3','m4a'],contentRoot:$root);
check($audioDefinition->metadata()['upload']['policy']['extensions']===['txt','wav','mp3','m4a']&&$audioDefinition->uploadPolicy()->metadata()['extensions']===['txt','wav','mp3','m4a'],'Audio extensions in the upload allowlist');
$audioDir=$storage->entry((int)$call('create_directory',$rootA,['name'=>'Audio'])['id']);$audioIds=[];
foreach($audioTypes as $name=>[,$mime])$audioIds[$name]=(string)$storage->createFile($audioDir,$name,$mime,$tmp.'/'.$name);
$audioListed=array_column($call('list',(string)$audioDir['id'])['items'],null,'name');
check($audioListed['tone.wav']['duration_ms']===500&&$audioListed['tone.wav']['width']===null&&$audioListed['tone.mp3']['thumbnail']==='none'&&abs($audioListed['tone.m4a']['duration_ms']-500)<=150,'Audio files list their length without thumbnails');
fails(fn()=>$call('thumbnail_get',$audioIds['tone.mp3']),415,'Audio has no thumbnail');
$audioStream=$call('content_stream',$audioIds['tone.wav']);
check($audioStream instanceof DownloadStream&&$audioStream->mimeType==='audio/wav'&&$audioStream->disposition==='inline'&&$audioStream->size===filesize($tmp.'/tone.wav'),'Audio content_stream is inline with the stored type');
$audioRange=$audioStream->plan(['HTTP_RANGE'=>'bytes=44-']);
check($audioRange['status']===206&&in_array('Content-Range: bytes 44-'.($audioStream->size-1).'/'.$audioStream->size,$audioRange['headers'],true)&&in_array('Content-Type: audio/wav',$audioRange['headers'],true),'Audio seeks with a single range');
check($call('content_get',$audioIds['tone.m4a'])->mimeType==='audio/mp4','Audio bytes with stored type');
fails(fn()=>$call('content_stream',$audioIds['tone.mp3'],[],$ctx('3')),403,'Audio stream needs its own rule');

// Task queue: bounded retry with backoff, orphaned-run recovery, one runner per database, dedupe only against pending tasks.
$queue=new Blade\Tasks\TaskQueue($db);$calls=0;$ran=[];
$queue->handle('test.flaky',function(array $payload) use (&$calls):void{$calls++;throw new RuntimeException('sensitive detail');});
$queue->handle('test.ok',function(array $payload) use (&$ran):void{$ran[]=$payload['n'];});
$task=fn(string $dedupe)=>$db->query("SELECT state,attempts,error,available_at FROM blade_tasks WHERE dedupe='$dedupe' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$due=fn(string $dedupe)=>$db->exec("UPDATE blade_tasks SET available_at='2000-01-01T00:00:00Z' WHERE dedupe='$dedupe'");
$queue->enqueue('test.flaky',[],'flaky');
check($queue->run(10,30)===1&&$task('flaky')['state']==='pending'&&(int)$task('flaky')['attempts']===1&&$task('flaky')['available_at']>=gmdate('Y-m-d\TH:i:s\Z',time()+25),'Failed attempt backs off');
check($queue->run(10,30)===0,'Nothing due during the backoff');
$due('flaky');$queue->run(10,30);check($task('flaky')['state']==='pending'&&(int)$task('flaky')['attempts']===2&&$task('flaky')['available_at']>=gmdate('Y-m-d\TH:i:s\Z',time()+55),'Backoff grows with attempts');
$due('flaky');$queue->run(10,30);check($task('flaky')['state']==='failed'&&(int)$task('flaky')['attempts']===3&&$task('flaky')['error']==='RuntimeException','Failed after three attempts with a non-sensitive error');
$due('flaky');check($queue->run(10,30)===0&&$calls===3,'Failed tasks are not claimed again');
$queue->enqueue('test.ok',['n'=>1],'stale');$queue->enqueue('test.ok',['n'=>2],'dead');
// Claimed a moment ago by a runner that died: the next lease holder recovers them at once, without a stale time.
$db->exec("UPDATE blade_tasks SET state='running',attempts=1,locked_at='".gmdate('Y-m-d\TH:i:s\Z')."' WHERE dedupe='stale'");
$db->exec("UPDATE blade_tasks SET state='running',attempts=3,locked_at='".gmdate('Y-m-d\TH:i:s\Z')."' WHERE dedupe='dead'");
$queue->run(10,30);
check($ran===[1]&&$task('stale')['state']==='done'&&$task('dead')['state']==='failed'&&$task('dead')['error']==='Interrupted.','Orphaned running tasks recovered at once; exhausted ones fail');
$db->exec("UPDATE blade_task_lease SET holder='other-runner',expires_at='2999-01-01T00:00:00Z' WHERE name='runner'");
$queue->enqueue('test.ok',['n'=>3],'leased');$queue->enqueue('test.ok',['n'=>6],'busy');
$db->exec("UPDATE blade_tasks SET state='running',attempts=1,locked_at='".gmdate('Y-m-d\TH:i:s\Z')."' WHERE dedupe='busy'");
check($queue->run(10,30)===0&&$task('leased')['state']==='pending'&&$task('busy')['state']==='running'&&$workspace->tasks->run(10,30)===0,'A second runner does nothing while the lease is held; the holder\'s running task stays');
$db->exec("UPDATE blade_task_lease SET expires_at='2000-01-01T00:00:00Z' WHERE name='runner'");
check($queue->run(10,30)===2&&$ran===[1,3,6]&&$db->query("SELECT holder FROM blade_task_lease WHERE name='runner'")->fetchColumn()==='','Expired lease taken over (its running task recovered) and released after the run');
$queue->enqueue('test.ok',['n'=>4],'dup');$queue->enqueue('test.ok',['n'=>4],'dup');
check((int)$db->query("SELECT COUNT(*) FROM blade_tasks WHERE dedupe='dup'")->fetchColumn()===1,'Pending duplicate skipped');
$db->exec("UPDATE blade_tasks SET state='running',locked_at='".gmdate('Y-m-d\TH:i:s\Z')."' WHERE dedupe='dup'");
$queue->enqueue('test.ok',['n'=>5],'dup');
check((int)$db->query("SELECT COUNT(*) FROM blade_tasks WHERE dedupe='dup' AND state='pending'")->fetchColumn()===1,'A running task does not suppress a new one');
$db->exec("DELETE FROM blade_tasks WHERE kind LIKE 'test.%'");
ob_start();(new Blade\Tasks\TaskQueue($db))->afterResponse();check(ob_get_clean()==='','afterResponse without handlers is silent');
// Transient thumbnail causes (here a missing ffmpeg) are retried by the queue, not recorded as failed.
$slow=new FileManagerDefinition('slow','Slow','transient',['a'=>'A'],contentRoot:$root,ffmpegPath:'/nonexistent/ffmpeg');$slow->install($db);
$slowQueue=new Blade\Tasks\TaskQueue($db);$slowStorage=$slow->storage($db,$slowQueue);
$slowClip=$slowStorage->createFile($slowStorage->root('a'),'clip.mp4','video/mp4',$tmp.'/clip.mp4');
$slowQueue->run(10,30);
$slowTask=$db->query("SELECT state,attempts,error FROM blade_tasks WHERE dedupe='".Thumbnails::dedupe('transient',$slowClip,1)."'")->fetch(PDO::FETCH_ASSOC);
check($slowStorage->derivative($slowClip,Thumbnails::KIND)===null&&$slowTask['state']==='pending'&&(int)$slowTask['attempts']===1&&$slowTask['error']==='RuntimeException','Transient render failure retried, not stored as failed');
check($slowStorage->entry($slowClip)['duration_ms']!==null,'Probe still works with the default ffprobe');
// Copies re-check every shared key after their inserts: content removed meanwhile fails with 409 and rolls back.
$victim=(string)$storage->createFile($dirA,'victim.txt','text/plain',$src("victim\n"));
$victimB=(string)$storage->createFile($storage->entry((int)$rootB),'victim.txt','text/plain',$src("victim on B\n"));
unlink($root.'/test/'.$keyOf($victim));
$count=$db->query('SELECT COUNT(*) FROM blade_files')->fetchColumn();
fails(fn()=>$call('copy',(string)$media['id'],['sources'=>$victim]),409,'Copy of removed content is a retryable conflict');
fails(fn()=>$call('copy',$rootB,['sources'=>$victim,'decision'=>'overwrite']),409,'Overwrite by copy re-checks the shared key');
check($db->query('SELECT COUNT(*) FROM blade_files')->fetchColumn()===$count&&$keyOf($victimB)===ContentStore::key(hash('sha256',"victim on B\n")),'Conflict rolled back');
fails(fn()=>$call('text_get',$victim),404,'Missing content is a 404 for text');
$storage->removeFile((int)$victim);$storage->removeFile((int)$victimB);
ob_start();(new DownloadStream('image/png',$tmp.'/missing.png',10,'"a"'))->send(false,[]);check(ob_get_clean()==='','Unreadable stream file sends no body');

// Chunked transfers (U2): driven through Transfers::handle as the `__upload` transport calls it.
$transfers=$workspace->transfers;$session=Transfers::owner('session-1');$tempRoot=$root.'/.transfers';
$upDir=$call('create_directory',$rootA,['name'=>'Uploads'])['id'];$upRow=$storage->entry((int)$upDir);
// The default chunk is 4 MiB clamped below upload_max_filesize and post_max_size (minus the envelope); an explicit size beyond them fails.
$limits=array_filter(['upload_max_filesize'=>ini_parse_quantity((string)ini_get('upload_max_filesize')),'post_max_size'=>ini_parse_quantity((string)ini_get('post_max_size'))],fn($limit)=>$limit>0);
$defaultChunk=min([4194304,...array_map(fn($limit)=>$limit-65536,array_values($limits))]);
check((new UploadPolicy(['txt'],10))->chunkBytes===$defaultChunk&&$registry->get('files','upload')->upload->chunkBytes===$defaultChunk,'Default chunk size clamped to the runtime limits: '.$defaultChunk);
if(isset($limits['upload_max_filesize'])&&$limits['upload_max_filesize']+65536<=8388608&&(!isset($limits['post_max_size'])||$limits['upload_max_filesize']+65536+65536<=$limits['post_max_size'])){
    try{new UploadPolicy(['txt'],10,chunkBytes:$limits['upload_max_filesize']+65536);throw new RuntimeException('Chunk above upload_max_filesize accepted');}catch(InvalidArgumentException $e){check(str_contains($e->getMessage(),'upload_max_filesize'),'Explicit chunk above upload_max_filesize names the setting');}
    if($limits['upload_max_filesize']>=262144)check((new UploadPolicy(['txt'],10,chunkBytes:$limits['upload_max_filesize']))->chunkBytes===$limits['upload_max_filesize'],'Explicit chunk equal to upload_max_filesize accepted');
}
if(isset($limits['post_max_size'])&&$limits['post_max_size']<=8388608){try{new UploadPolicy(['txt'],10,chunkBytes:$limits['post_max_size']);throw new RuntimeException('Chunk above post_max_size accepted');}catch(InvalidArgumentException $e){check(str_contains($e->getMessage(),'_max_'),'Explicit chunk above post_max_size rejected');}}
check($view('1')[0]['options']['upload']['policy']===['extensions'=>['txt','png'],'maxSizeBytes'=>100,'maxFiles'=>20,'chunkBytes'=>$defaultChunk,'folders'=>true,'maxDepth'=>5,'duplicatePolicy'=>'ask']&&!str_contains(json_encode($view('1')),'.transfers'),'Upload policy metadata without the transfer root');
check($registry->get('files','upload')->upload instanceof UploadPolicy&&$registry->get('files','upload')->upload->requestBytes()===2000&&is_int($registry->get('files','text_save')->upload),'Upload action declares a policy; text_save keeps its byte limit');
foreach([fn()=>new UploadPolicy([],10),fn()=>new UploadPolicy(['TXT'],10),fn()=>new UploadPolicy(['txt','txt'],10),fn()=>new UploadPolicy(['txt'],0),fn()=>new UploadPolicy(['txt'],1073741825),fn()=>new UploadPolicy(['txt'],10,21),fn()=>new UploadPolicy(['txt'],10,chunkBytes:1000),fn()=>new UploadPolicy(['txt'],10,chunkBytes:8388609),fn()=>new UploadPolicy(['txt'],10,duplicatePolicy:'merge'),fn()=>new UploadPolicy(['txt'],10,tempRoot:'relative'),fn()=>new UploadPolicy(['txt'],10,tempRoot:'/a/../b'),fn()=>new UploadPolicy(['txt'],10,ttlSeconds:60),fn()=>new UploadPolicy(['txt'],10,maxDepth:0)] as $invalid){try{$invalid();throw new RuntimeException('Invalid upload policy accepted');}catch(InvalidArgumentException){}}
// A synthetic second consumer (not the file manager) with its own policy and the same transfer root.
$attached=[];
$registry->add(new Action('files','attach','Attach',[],function(Context $c,array $t,array $v) use (&$attached){foreach($c->uploads as $u){if($u->name==='unique.txt')throw new PDOException('Duplicate entry',23000);$attached[]=[$u->name,file_get_contents($u->path)];}return ['ok'=>true];},resolve:fn(Context $c,?string $id)=>['id'=>$id,'acl_id'=>'a','owner'=>null],write:true,upload:new UploadPolicy(['txt'],50,maxFiles:2,tempRoot:$tempRoot,ttlSeconds:600)));
foreach(['1','8'] as $actor)foreach(['upload','attach','list','create_directory'] as $a)$rule->execute([$actor,$a,'ui','all','']);
$op=fn(string $operation,array $values=[],?string $id=null,?Context $c=null,?string $owner=null,string $action='upload')=>$transfers->handle($c??$ctx(),$owner??$session,'files',$id??$upDir,['operation'=>$operation,'action'=>$action,...$values]);
$sent=0;
$chunk=function(string $transfer,int $offset,string $bytes,?string $id=null,string $actor='1',string $action='upload') use ($op,$part,$ctx,&$sent){$sent+=strlen($bytes);return $op('upload_chunk',['transfer'=>$transfer,'offset'=>$offset],$id,$ctx($actor,[$part('chunk','blob',$bytes)]),null,$action);};
$begin=fn(string $name,int $size,string $fingerprint,string $path='',?string $id=null,?Context $c=null,?string $owner=null,string $action='upload')=>$op('upload_begin',['file'=>['name'=>$name,'size'=>$size,'type'=>'text/plain','relative_path'=>$path],'fingerprint'=>$fingerprint],$id,$c,$owner,$action);
$send=function(string $name,string $bytes,string $path='',?string $id=null,array $finish=[]) use ($begin,$chunk,$op){$t=$begin($name,strlen($bytes),'fp:'.$path.$name.':'.strlen($bytes),$path,$id);foreach(str_split($bytes,7) as $i=>$piece)if($bytes!=='')$chunk($t['transfer'],$i*7,$piece,$id);return [$t['transfer'],$op('upload_finish',['transfer'=>$t['transfer'],...$finish],$id)];};
$transferDirs=fn()=>array_values(array_filter(scandir($tempRoot)?:[],fn($e)=>preg_match('/^[0-9a-f]{32}$/',$e)));
$countFiles=fn()=>(int)$db->query('SELECT COUNT(*) FROM blade_files')->fetchColumn();
$storage->createFile($upRow,'taken.txt','text/plain',$src("taken\n"));
// Preflight: per-file codes, no side effects.
$before=$countFiles();
$pre=$op('upload_preflight',['files'=>[['name'=>'ok.txt','size'=>10,'type'=>'text/plain'],['name'=>'huge.txt','size'=>101,'type'=>''],['name'=>'evil.exe','size'=>2,'type'=>''],['name'=>"bad\x01.txt",'size'=>1,'type'=>''],['name'=>'taken.txt','size'=>1,'type'=>''],
    ['name'=>'deep.txt','size'=>1,'type'=>'','relative_path'=>'1/2/3/4/5/deep.txt'],['name'=>'dots.txt','size'=>1,'type'=>'','relative_path'=>'x/../dots.txt'],['name'=>'nested.txt','size'=>1,'type'=>'','relative_path'=>'Új/nested.txt'],...array_fill(0,13,['name'=>'many.txt','size'=>1,'type'=>''])]]);
$codes=array_map(fn($f)=>$f['ok']?'ok':$f['code'],$pre['files']);
check(array_slice($codes,0,8)===['ok','too_large','type','name','conflict','depth','name','ok']&&$codes[19]==='ok'&&$codes[20]==='quota'&&count($codes)===21,'Preflight codes: '.json_encode($codes));
check($pre['files'][4]['conflict']===['existing_kind'=>'file']&&$pre['files'][1]['message']!==''&&array_column($pre['files'],'index')===range(0,20),'Preflight conflict kind, messages and indexes');
check($countFiles()===$before&&(!is_dir($tempRoot)||$transferDirs()===[]),'Preflight creates nothing');
fails(fn()=>$op('upload_preflight',['files'=>[['name'=>'x.txt']]]),400,'Malformed preflight file');
fails(fn()=>$op('upload_preflight',['files'=>[],'extra'=>1]),400,'Unknown preflight value');
fails(fn()=>$op('upload_preflight',['files'=>[['name'=>'x.txt','size'=>1]]],$rootA,null,null,'text_save'),415,'Action without a policy has no transfer protocol');
fails(fn()=>$op('upload_status',['transfer'=>str_repeat('a',32)],null,$ctx('1',[$part('chunk','x','x')])),415,'Only chunks carry a part');
// Begin, chunks (exact offsets), status, finish.
$t=$begin('Átvitel.txt',15,'fp-1');
check(preg_match('/^[0-9a-f]{32}$/',$t['transfer'])&&$t['received']===0&&$t['size']===15&&$t['chunk_bytes']===$defaultChunk&&$t['expires_at']>gmdate('Y-m-d\TH:i:s\Z'),'Begin returns transfer, chunk size and expiry');
$dir=$tempRoot.'/'.$t['transfer'];
check((fileperms($dir)&07777)===02770&&(fileperms($dir.'/data')&0777)===0660&&(fileperms($dir.'/meta.json')&0777)===0660,'Transfer directory and files are group-shared');
check(!str_contains(file_get_contents($dir.'/meta.json'),'session-1')&&str_contains(file_get_contents($dir.'/meta.json'),$session),'Only the session hash is stored');
check($chunk($t['transfer'],0,'hello ')===['received'=>6],'First chunk');
check(fails(fn()=>$chunk($t['transfer'],0,'hello '),409,'Wrong offset')->details===['received'=>6]&&is_dir($dir),'Wrong offset reports the received bytes and keeps the transfer');
// Every other client error of a chunk is final for the uploader: the transfer is removed at once, not left to the TTL.
$huge=$tmp.'/huge-chunk';$h=fopen($huge,'wb');ftruncate($h,$defaultChunk+1);fclose($h);
foreach(['Chunk beyond the declared size'=>[fn($x)=>$chunk($x,6,"transfer!\nmore"),400,['code'=>'too_large']],'Chunk without a part'=>[fn($x)=>$op('upload_chunk',['transfer'=>$x,'offset'=>6]),400,null],
    'Negative offset'=>[fn($x)=>$op('upload_chunk',['transfer'=>$x,'offset'=>'-1'],null,$ctx('1',[$part('chunk','b','x')])),400,null],'Chunk above chunkBytes'=>[fn($x)=>$op('upload_chunk',['transfer'=>$x,'offset'=>6],null,$ctx('1',[new Upload('chunk','b',$huge,$defaultChunk+1,UPLOAD_ERR_OK)])),413,null]] as $label=>[$fire,$status,$details]){
    $x=$begin('Átvitel.txt',15,'fp-final-'.$label)['transfer'];$chunk($x,0,'hello ');
    $e=fails(fn()=>$fire($x),$status,$label);
    check(($details===null||$e->details===$details)&&!is_dir($tempRoot.'/'.$x)&&$begin('Átvitel.txt',15,'fp-final-'.$label)['received']===0,'Final chunk error removes the transfer: '.$label);
}
check($op('upload_status',['transfer'=>$t['transfer']])===['received'=>6,'size'=>15,'state'=>'receiving'],'Status while receiving');
check(fails(fn()=>$op('upload_finish',['transfer'=>$t['transfer']]),400,'Finish before all bytes')->details===['code'=>'incomplete']&&is_dir($dir),'Incomplete finish keeps the transfer');
// Resume: the same fingerprint returns the same transfer and its received bytes; another file does not.
$again=$begin('Átvitel.txt',15,'fp-1');check($again['transfer']===$t['transfer']&&$again['received']===6,'Resume returns the same transfer');
check($begin('Átvitel.txt',16,'fp-1')['transfer']!==$t['transfer']&&$begin('Átvitel.txt',15,'fp-1')['transfer']!==$t['transfer'],'A different file under the same fingerprint starts anew');
$t=$begin('Átvitel.txt',15,'fp-1b');$dir=$tempRoot.'/'.$t['transfer'];
$chunk($t['transfer'],0,'hello ');$chunk($t['transfer'],6,"transfer\n");
check($op('upload_status',['transfer'=>$t['transfer']])['state']==='complete','Status complete');
// Ownership: another actor, session, target or action sees no transfer; unknown and malformed ids neither.
$other=$call('create_directory',$rootA,['name'=>'Other'])['id'];
foreach([[null,$ctx('8'),null,'upload'],[null,null,Transfers::owner('session-2'),'upload'],[$other,null,null,'upload'],[null,null,null,'attach']] as [$id,$c,$owner,$action])foreach(['upload_status','upload_finish','upload_abort'] as $operation)fails(fn()=>$op($operation,['transfer'=>$t['transfer']],$id,$c,$owner,$action),404,'Foreign transfer hidden: '.$operation);
fails(fn()=>$chunk($t['transfer'],15,'x',null,'8'),404,'Foreign chunk hidden');
foreach([str_repeat('0',32),'../x','ABC'] as $bad)fails(fn()=>$op('upload_status',['transfer'=>$bad]),404,'Unknown transfer id');
check(is_dir($dir),'Foreign requests leave the transfer');
$result=$op('upload_finish',['transfer'=>$t['transfer']]);
$made=$storage->child((int)$upDir,'Átvitel.txt');
check(array_map(fn($i)=>array_diff_key($i,['item'=>1]),$result['succeeded'])===[['id'=>(string)$made['id'],'name'=>'Átvitel.txt','parent'=>$upDir]]&&$result['succeeded'][0]['item']['id']===(string)$made['id']&&$result['succeeded'][0]['item']['name']==='Átvitel.txt'&&$result['succeeded'][0]['item']['size']===15&&$result['succeeded'][0]['item']['thumbnail']==='none'&&$storage->content((int)$made['id'])==="hello transfer\n"&&$made['sha256']===hash('sha256',"hello transfer\n"),'Finish stores the assembled file');
check(!is_dir($dir)&&!array_filter(glob($tempRoot.'/*.resume')?:[],fn($f)=>trim(file_get_contents($f))===$t['transfer']),'Finish removes the transfer and its resume index');
fails(fn()=>$op('upload_status',['transfer'=>$t['transfer']]),404,'Finished transfer is gone');
[,$pixel]=$send('pixel-t.png',$png);$pixelRow=$storage->entry((int)$pixel['succeeded'][0]['id']);
check($pixelRow['mime_type']==='image/png'&&(int)$pixelRow['width']===1&&$pixelRow['orientation']==='square','Transferred image has media metadata');
check($db->query("SELECT state FROM blade_tasks WHERE dedupe='".Thumbnails::dedupe('test',(int)$pixelRow['id'],1)."'")->fetchColumn()==='pending','Transferred image queues its thumbnail');
[,$empty]=$send('empty-t.txt','');check($storage->entry((int)$empty['succeeded'][0]['id'])['size']==0,'Empty file needs no chunk');
// Begin applies the policy and the domain rules, except conflicts (decided at finish).
foreach([['x.exe',1,'','type'],['big.txt',101,'','too_large'],["a\u{202E}.txt",1,'','name'],['d.txt',1,'1/2/3/4/5/d.txt','depth'],['d.txt',1,'../d.txt','name']] as [$name,$size,$path,$code])check(fails(fn()=>$begin($name,$size,'fp-bad-'.$code,$path),400,'Begin refuses '.$code)->details===['code'=>$code],'Begin code '.$code);
check(preg_match('/^[0-9a-f]{32}$/',$begin('taken.txt',3,'fp-taken')['transfer'])===1,'Begin accepts a conflicting name');
fails(fn()=>$begin('x.txt',1,str_repeat('f',129)),400,'Fingerprint length');
// Conflicts at finish: 409 keeps the transfer; overwrite, rename and skip finish it without new bytes.
foreach(['overwrite'=>"over\n",'rename'=>"renamed\n",'skip'=>"skipped\n"] as $decision=>$bytes){
    $t=$begin('taken.txt',strlen($bytes),'fp-'.$decision);$chunk($t['transfer'],0,$bytes);
    $conflict=fails(fn()=>$op('upload_finish',['transfer'=>$t['transfer']]),409,'Finish conflict asks');
    check($conflict->details['conflicts'][0]['existing_kind']==='file'&&$op('upload_status',['transfer'=>$t['transfer']])['state']==='complete','Conflict keeps the transfer: '.$decision);
    $done=$op('upload_finish',['transfer'=>$t['transfer'],'decision'=>$decision]);
    check(!is_dir($tempRoot.'/'.$t['transfer']),'Decision finishes the transfer: '.$decision);
    if($decision==='overwrite')check($done['succeeded'][0]['name']==='taken.txt'&&$storage->content((int)$done['succeeded'][0]['id'])===$bytes,'Overwrite decision');
    if($decision==='rename')check($done['succeeded'][0]['name']==='taken (2).txt'&&$done['succeeded'][0]['parent']===$upDir,'Rename decision');
    if($decision==='skip')check($done['skipped']===[['name'=>'taken.txt']]&&!$done['succeeded'],'Skip decision');
}
fails(fn()=>$op('upload_finish',['transfer'=>$begin('x.txt',1,'fp-decision')['transfer'],'decision'=>'merge']),400,'Unknown decision rejected');
// Content detected at finish: a mismatch is permanent and removes the transfer.
$t=$begin('fake-t.png',12,'fp-fake');$chunk($t['transfer'],0,'not an image');
$mismatch=fails(fn()=>$op('upload_finish',['transfer'=>$t['transfer']]),400,'Content mismatch at finish');
check($mismatch->details['code']==='content_mismatch'&&count($mismatch->details['failed'])===1&&!is_dir($tempRoot.'/'.$t['transfer']),'Content mismatch removes the transfer and is reported once');
// Folder upload: missing directories are created below the target and reused; depth counts from the mount root.
[,$a]=$send('a.txt',"a\n",'Fotók/2026/a.txt');[,$b]=$send('b.txt',"b\n",'Fotók/2026/b.txt');
$fotok=$storage->child((int)$upDir,'Fotók');$year=$storage->child((int)$fotok['id'],'2026');
check($fotok['kind']==='directory'&&$year['kind']==='directory'&&$a['succeeded'][0]['parent']===(string)$year['id']&&$b['succeeded'][0]['parent']===(string)$year['id'],'Folder upload creates and reuses directories');
check(json_decode($db->query("SELECT detail FROM blade_audit WHERE action='upload' AND outcome='success' AND detail LIKE '%directories%' ORDER BY id DESC LIMIT 1")->fetchColumn(),true)['directories']===[],'Second folder file creates no directory');
check(count($db->query("SELECT id FROM blade_files WHERE name='Fotók'")->fetchAll())===1,'One directory for both files');
[,$deepest]=$send('c.txt',"c\n",'2/3/4/5/c.txt');check($storage->entry((int)$deepest['succeeded'][0]['parent'])['name']==='5','Depth 5 below the mount root is allowed');
check(fails(fn()=>$begin('c.txt',2,'fp-depth6','2/3/4/5/6/c.txt'),400,'Depth 6 below the mount root')->details===['code'=>'depth'],'Depth from the mount root');
$blocked=$storage->entry((int)$storage->createFile($upRow,'Blocker','text/plain',$src('x')));
check(fails(fn()=>$send('x.txt',"x\n",'Blocker/x.txt'),400,'A file blocks the folder path')->details['code']==='conflict','Folder path blocked by a file');
// Direct multipart keeps working: one relative path per request, per-file codes.
$direct=$up([$part('files','direct.txt',"d\n")],'');
check($direct['succeeded'][0]['parent']===(string)$dirA['id'],'Direct upload result carries the parent');
fails(fn()=>$call('upload',(string)$dirA['id'],['relative_path'=>'X/a.txt'],$ctx('1',[$part('files','a.txt','a'),$part('files','b.txt','b')])),400,'Relative path needs a single file');
check($call('upload',(string)$dirA['id'],['relative_path'=>'Direkt/a.txt'],$ctx('1',[$part('files','a.txt','a')]))['succeeded'][0]['parent']===(string)$storage->child((int)$dirA['id'],'Direkt')['id'],'Direct folder upload');
// Abort removes the data; expired transfers are swept by a later begin and are not found.
$t=$begin('abort.txt',5,'fp-abort');$chunk($t['transfer'],0,'ab');
check($op('upload_abort',['transfer'=>$t['transfer']])===['aborted'=>true]&&!is_dir($tempRoot.'/'.$t['transfer']),'Abort removes the transfer');
fails(fn()=>$op('upload_status',['transfer'=>$t['transfer']]),404,'Aborted transfer is gone');
$expire=function(string $transfer) use ($tempRoot){$path=$tempRoot.'/'.$transfer.'/meta.json';$meta=json_decode(file_get_contents($path),true);$meta['expires_at']=time()-1;file_put_contents($path,json_encode($meta));touch($path,time()-3600);};
$old1=$begin('old.txt',5,'fp-old1')['transfer'];$old2=$begin('old.txt',5,'fp-old2')['transfer'];$fresh=$begin('fresh.txt',5,'fp-fresh')['transfer'];
$expire($old1);$expire($old2);
fails(fn()=>$op('upload_status',['transfer'=>$old2]),404,'Expired transfer not found');
check(!is_dir($tempRoot.'/'.$old2),'Expired transfer removed on access');
$begin('new.txt',5,'fp-new');
check(!is_dir($tempRoot.'/'.$old1)&&is_dir($tempRoot.'/'.$fresh),'Begin sweeps expired transfers only');
check($begin('old.txt',5,'fp-old1')['transfer']!==$old1,'An expired transfer is not resumed');
mkdir($tempRoot.'/'.str_repeat('e',32));touch($tempRoot.'/'.str_repeat('e',32),time()-90000);file_put_contents($tempRoot.'/'.str_repeat('d',64).'.resume',str_repeat('c',32));touch($tempRoot.'/'.str_repeat('d',64).'.resume',time()-3600);
$begin('new.txt',5,'fp-new2');check(!is_dir($tempRoot.'/'.str_repeat('e',32))&&!is_file($tempRoot.'/'.str_repeat('d',64).'.resume'),'Orphans swept');
// ACL: every operation checks the target action's rule on the mount and the API token scope.
$t8=$begin('acl.txt',3,'fp-acl',c:$ctx('8'));
$db->exec("DELETE FROM blade_rules WHERE subject_id='8' AND action='upload'");
foreach([['upload_preflight',['files'=>[['name'=>'x.txt','size'=>1]]]],['upload_begin',['file'=>['name'=>'x.txt','size'=>1],'fingerprint'=>'f']],['upload_status',['transfer'=>$t8['transfer']]],['upload_abort',['transfer'=>$t8['transfer']]],['upload_finish',['transfer'=>$t8['transfer']]]] as [$operation,$values])fails(fn()=>$op($operation,$values,null,$ctx('8')),403,'Denied without upload right: '.$operation);
fails(fn()=>$chunk($t8['transfer'],0,'abc',null,'8'),403,'Denied chunk without upload right');
$rule->execute(['9','upload','ui','id','b']);
fails(fn()=>$op('upload_preflight',['files'=>[['name'=>'x.txt','size'=>1]]],null,$ctx('9')),403,'Upload right on another mount does not apply');
fails(fn()=>$begin('x.txt',1,'f',c:$ctx('1',[],'api',['files.upload']),owner:Transfers::owner('token')),404,'UI rule does not open the API');
$rule->execute(['1','upload','api','all','']);
$api=$begin('api.txt',3,'fp-api',c:$ctx('1',[],'api',['files.upload']),owner:Transfers::owner('token'));
foreach([['upload_preflight',['files'=>[['name'=>'x.txt','size'=>1]]]],['upload_begin',['file'=>['name'=>'x.txt','size'=>1],'fingerprint'=>'f']],['upload_status',['transfer'=>$api['transfer']]],['upload_abort',['transfer'=>$api['transfer']]],['upload_finish',['transfer'=>$api['transfer']]]] as [$operation,$values])fails(fn()=>$op($operation,$values,null,$ctx('1',[],'api',['files.list']),Transfers::owner('token')),403,'Token scope required: '.$operation);
fails(fn()=>$op('upload_status',['transfer'=>$api['transfer']],null,$ctx('1'),Transfers::owner('token')),404,'An API transfer is not visible on the UI channel');
check($op('upload_status',['transfer'=>$api['transfer']],null,$ctx('1',[],'api',['files.upload']),Transfers::owner('token'))['size']===3,'API transfer with scope');
// The generic consumer: its own policy (no folders) and handler receive the assembled file.
check(fails(fn()=>$begin('a.txt',1,'fp-attach','Dir/a.txt',null,null,null,'attach'),400,'Folders off')->details===['code'=>'name'],'Policy without folders refuses paths');
$t=$begin('attach.txt',4,'fp-attach',action:'attach');$chunk($t['transfer'],0,'data',null,'1','attach');
check($op('upload_finish',['transfer'=>$t['transfer']],null,null,null,'attach')===['ok'=>true]&&$attached===[['attach.txt','data']]&&!is_dir($tempRoot.'/'.$t['transfer']),'Independent consumer receives the assembled file');
// A 409 without `details.conflicts` (here the executor's unique violation) is final: the transfer is removed.
$t=$begin('unique.txt',4,'fp-unique',action:'attach');$chunk($t['transfer'],0,'data',null,'1','attach');
check(fails(fn()=>$op('upload_finish',['transfer'=>$t['transfer']],null,null,null,'attach'),409,'Unique violation at finish')->details===[]&&!is_dir($tempRoot.'/'.$t['transfer']),'A 409 without conflicts removes the transfer');
// The policy guards the consumer's direct multipart path too: quota, type, size and PHP upload errors; the handler sees accepted parts only.
$attach=fn(array $parts)=>$call('attach',$upDir,[],$ctx('1',$parts));$attached=[];
check(fails(fn()=>$attach([$part('files','x.exe','MZ')]),400,'Direct wrong extension')->details===['code'=>'type','failed'=>[['name'=>'x.exe','code'=>'type','error'=>Blade\I18n\Translator::text('Nem engedélyezett fájltípus. Engedélyezett: {types}.',['types'=>'txt'])]]],'Direct wrong extension details');
check(fails(fn()=>$attach([$part('files','big.txt',str_repeat('x',51))]),400,'Direct oversize')->details['code']==='too_large','Direct oversize code');
check(fails(fn()=>$attach([new Upload('files','ini.txt','',0,UPLOAD_ERR_INI_SIZE)]),400,'PHP size limit')->details['code']==='too_large','PHP upload size error is too_large');
check(fails(fn()=>$attach([new Upload('files','cut.txt','',0,UPLOAD_ERR_PARTIAL)]),400,'Partial PHP upload')->details['code']==='incomplete','Other PHP upload errors are incomplete');
check(fails(fn()=>$attach([$part('files','a.txt','a'),$part('files','b.txt','b'),$part('files','c.txt','c')]),400,'Too many parts')->details===['code'=>'quota'],'Direct quota code');
check($attached===[],'Rejected requests never reach the handler');
$partial=$attach([$part('files','ok.txt','fine'),$part('files',"bad\u{202E}.exe",'MZ')]);
check($partial['ok']===true&&array_column($partial['failed'],'code')===['name']&&$partial['failed'][0]['name']==='bad?.exe'&&$attached===[['ok.txt','fine']],'Partial acceptance: accepted part only, rejected part merged into failed');
check(json_decode($db->query("SELECT detail FROM blade_audit WHERE action='attach' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true)===['rejected_files'=>1],'Rejected part count audited without names');
$none=fails(fn()=>$attach([$part('files','x.exe','MZ'),$part('files','big.txt',str_repeat('x',51))]),400,'All parts rejected');
check($none->details['code']==='type'&&array_column($none->details['failed'],'code')===['type','too_large']&&$attached===[['ok.txt','fine']],'All rejected: first code and every failed part');
// Twenty mixed files: preflight once, bytes sent once, conflicts decided without re-sending.
$batchDir=$call('create_directory',$rootA,['name'=>'Batch'])['id'];$batchRow=$storage->entry((int)$batchDir);
foreach(['dup-1.txt','dup-2.txt','dup-3.txt'] as $name)$storage->createFile($batchRow,$name,'text/plain',$src('old'));
$batch=[];for($i=1;$i<=20;$i++)$batch[]=match(true){$i<=3=>['dup-'.$i.'.txt',"new $i\n"],$i<=5=>['pic-'.$i.'.png',$png],$i===6=>['bad-6.exe','MZ'],$i===7=>['big-7.txt',str_repeat('x',101)],$i===8=>['fake-8.png','text'],default=>['file-'.$i.'.txt',"file $i\n"]};
$verdicts=$op('upload_preflight',['files'=>array_map(fn($f)=>['name'=>$f[0],'size'=>strlen($f[1]),'type'=>''],$batch)],$batchDir)['files'];
check(array_map(fn($f)=>$f['ok']?'ok':$f['code'],$verdicts)===['conflict','conflict','conflict','ok','ok','type','too_large',...array_fill(0,13,'ok')],'Batch preflight verdicts');
$sent=0;$outcomes=$batchTransfers=[];
foreach($batch as $i=>[$name,$bytes]){
    if(!$verdicts[$i]['ok']&&$verdicts[$i]['code']!=='conflict'){$outcomes[]='refused';continue;}
    $t=$begin($name,strlen($bytes),'batch:'.$name,'',$batchDir);$batchTransfers[]=$t['transfer'];foreach(str_split($bytes,4) as $n=>$piece)$chunk($t['transfer'],$n*4,$piece,$batchDir);
    try{$done=$op('upload_finish',['transfer'=>$t['transfer']],$batchDir);}
    catch(Failure $e){if($e->status!==409){$outcomes[]=$e->details['code'];continue;}$done=$op('upload_finish',['transfer'=>$t['transfer'],'decision'=>'rename'],$batchDir);}
    $outcomes[]=$done['succeeded'][0]['name'];
}
check($outcomes===['dup-1 (2).txt','dup-2 (2).txt','dup-3 (2).txt','pic-4.png','pic-5.png','refused','refused','content_mismatch',...array_map(fn($i)=>'file-'.$i.'.txt',range(9,20))],'Twenty mixed files give per-file results: '.json_encode($outcomes));
check($sent===array_sum(array_map(fn($f)=>strlen($f[1]),array_filter($batch,fn($f,$i)=>$verdicts[$i]['ok']||$verdicts[$i]['code']==='conflict',ARRAY_FILTER_USE_BOTH))),'Every byte sent once');
check(!array_intersect($batchTransfers,$transferDirs())&&in_array($fresh,$transferDirs(),true),'Finished batch transfers are removed, unfinished ones kept');
// Transfer audit: begin rows carry the size only; names never reach the audit.
$beginAudit=$db->query("SELECT detail FROM blade_audit WHERE action='upload' AND outcome='success' AND detail NOT LIKE '%directory%' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
check($beginAudit&&!array_filter($beginAudit,fn($d)=>array_keys(json_decode($d,true))!==['size']),'Begin audit holds the size only');
check((bool)$db->query("SELECT 1 FROM blade_audit WHERE action='upload' AND outcome='rejected' AND actor_id='8'")->fetchColumn(),'Denied begin audited');
$transferAudit=json_encode($db->query("SELECT * FROM blade_audit WHERE action IN ('upload','attach')")->fetchAll(PDO::FETCH_ASSOC),JSON_UNESCAPED_UNICODE);
foreach(['Átvitel','pixel-t','Fotók','dup-1','file-9','attach.txt','fp-',$session,'session-1'] as $secret)check(!str_contains($transferAudit,$secret),'Transfer audit excludes names and owners: '.$secret);

// Audit: operation, actor, outcome and related IDs; never contents or names.
$audit=$db->query("SELECT actor_id,action,object_id,outcome,field_names,detail FROM blade_audit WHERE resource='files' ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$copyAudit=array_values(array_filter($audit,fn($r)=>$r['action']==='copy'&&$r['outcome']==='success'))[0];
$detail=json_decode($copyAudit['detail'],true);
check($copyAudit['actor_id']==='1'&&$copyAudit['object_id']===$rootB&&$detail['sources']===[(string)$tree['id']]&&count($detail['succeeded'])===1,'Copy audit with source/target IDs');
check((bool)array_filter($audit,fn($r)=>$r['action']==='text_save'&&$r['outcome']==='rejected'),'Rejected save audited');
check((bool)array_filter($audit,fn($r)=>$r['action']==='upload'&&$r['outcome']==='success'&&(json_decode($r['detail'],true)['created']??null)),'Upload audited');
$all=json_encode($audit);
foreach(['edited','hello','over','renamed','leaf','note.txt','clip.mp4','wide.png','identical'] as $secret)check(!str_contains($all,$secret),'Audit excludes content/names: '.$secret);
// Metadata exposes no storage space, SQL or server paths.
check(!str_contains(json_encode($view('1')),$tmp)&&!str_contains(json_encode($view('1')),'blade_files'),'No backend details in metadata');
// U4: server-sorted paged listing, delete policies (archive here, delete below), rename, download, streamed ZIP.
foreach(['delete','rename','download','zip_prepare','zip_get'] as $a)$rule->execute(['1',$a,'ui','all','']);
$session1=Transfers::owner('session-1');
$octx=fn(string $actor='1',?string $owner=null,string $channel='ui',array $scopes=[])=>new Context(new Identity($actor,'Actor '.$actor),$channel,$workspace->acl,$db,$scopes,[],$owner??$session1);
check($registry->get('files','download')->get&&$registry->get('files','zip_get')->get&&!$registry->get('files','zip_prepare')->get&&!$registry->get('files','delete')->get,'download and zip_get are GET-capable');
$workspace->acl->invalidate();$filesView=$view('1')[0];$byName=array_column($filesView['actions'],null,'name');
check($byName['delete']['confirm']['severity']==='danger'&&$byName['delete']['confirm']['title']==='Törlés'&&str_contains($byName['delete']['confirm']['message'],'{count}')&&str_contains($byName['delete']['confirm']['message'],'archiválódik')&&$filesView['options']['deletePolicy']==='archive','Delete confirmation and policy in the file view metadata');
check($byName['download']['get']===true&&$byName['zip_get']['get']===true&&$byName['rename']['fields'][0]['name']==='name','GET flags and rename field in metadata');
try{new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,deletePolicy:'purge');throw new RuntimeException('Invalid delete policy accepted');}catch(InvalidArgumentException){}
// Paged listing: 300 entries with ties in every key; every sort and direction against an independent ordering.
$paging=$storage->entry((int)$call('create_directory',$rootA,['name'=>'Paging'])['id']);
$mimes=['txt'=>'text/plain','png'=>'image/png','webm'=>'video/webm','json'=>'application/json','md'=>'text/markdown','pdf'=>'application/pdf'];
$exts=array_keys($mimes);
for($i=0;$i<20;$i++)$storage->createDirectory($paging,($i%2?'Mappa ':'mappa ').sprintf('%02d',($i*7)%20));
for($i=0;$i<278;$i++){$ext=$i%40===0?'webm':$exts[$i%6===2?0:$i%6];$storage->createFile($paging,($i%3?'Fájl-':'fájl_').sprintf('%03d',($i*37)%278).'.'.$ext,$mimes[$ext],$src(str_repeat('x',$i%23)),gmdate('Y-m-d\TH:i:s\Z',1700000000+($i%17)*60));}
$storage->createFile($paging,'száz%_jel.txt','text/plain',$src('p'));$storage->createFile($paging,'szazXjel.txt','text/plain',$src('q'));
$all=$storage->children((int)$paging['id'],1000);check(count($all)===300,'300 paging entries');
$rank=fn($r)=>$r['kind']==='directory'?0:1;
$expected=function(string $sort,string $direction,array $rows) use ($rank):array{
    usort($rows,function($a,$b) use ($sort,$direction,$rank){
        if($rank($a)!==$rank($b))return $rank($a)<=>$rank($b);
        $key=fn($r)=>match($sort){'name'=>[mb_strtolower($r['name'])],'modified'=>[$r['modified_at']],'size'=>$r['kind']==='directory'?[mb_strtolower($r['name'])]:[(int)$r['size']],'type'=>[$r['extension'],mb_strtolower($r['name'])]};
        $c=[...$key($a),(int)$a['id']]<=>[...$key($b),(int)$b['id']];
        return $direction==='asc'?$c:-$c;});
    return array_map(fn($r)=>(string)$r['id'],$rows);
};
$walk=function(array $values,int $limit=37) use ($call,$paging):array{$ids=[];$cursor=null;$pages=0;do{$page=$call('list',(string)$paging['id'],[...$values,'limit'=>(string)$limit,...($cursor?['cursor'=>$cursor]:[])]);check(count($page['items'])<=$limit&&strlen((string)$page['next'])<=512,'Window within the limit');foreach($page['items'] as $item)$ids[]=$item['id'];$cursor=$page['next'];$pages++;}while($cursor!==null&&$pages<100);return [$ids,$page];};
foreach(['name','modified','size','type'] as $sort)foreach(['asc','desc'] as $direction){
    [$ids,$last]=$walk(['sort'=>$sort,'direction'=>$direction]);
    check($ids===$expected($sort,$direction,$all),"Keyset order $sort $direction: directories first, id tie-breaker, no duplicates or gaps");
    check(count(array_unique($ids))===300&&$last['total']===300&&$last['matched']===300&&!array_key_exists('truncated',$last),"Counts $sort $direction");
}
$first=$call('list',(string)$paging['id']);
check(count($first['items'])===100&&$first['next']!==null&&$first['items'][0]['kind']==='directory'&&array_keys($first)===['directory','items','next','total','matched'],'Default window of 100, response keys');
check(array_keys($first['items'][0])===['id','name','kind','extension','mime_type','size','modified_at','revision','width','height','duration_ms','orientation','thumbnail'],'Listing item shape unchanged');
// Search (case-folded, LIKE wildcards literal) and type filters with total/matched.
$filtered=fn(callable $keep)=>array_values(array_filter($all,$keep));
foreach([[['search'=>'FÁJL-01'],fn($r)=>str_contains(mb_strtolower($r['name']),'fájl-01')],[['search'=>'%_'],fn($r)=>$r['name']==='száz%_jel.txt'],[['search'=>'mappa 1'],fn($r)=>str_starts_with(mb_strtolower($r['name']),'mappa 1')],
    [['type'=>'directory'],fn($r)=>$r['kind']==='directory'],[['type'=>'image'],fn($r)=>$r['mime_type']==='image/png'],[['type'=>'video'],fn($r)=>$r['mime_type']==='video/webm'],
    [['type'=>'text'],fn($r)=>$r['kind']==='file'&&(str_starts_with($r['mime_type'],'text/')||$r['mime_type']==='application/json')],[['type'=>'other'],fn($r)=>$r['mime_type']==='application/pdf'],
    [['type'=>'text','search'=>'fájl_','sort'=>'size','direction'=>'desc'],fn($r)=>$r['kind']==='file'&&(str_starts_with($r['mime_type'],'text/')||$r['mime_type']==='application/json')&&str_contains(mb_strtolower($r['name']),'fájl_')]] as [$values,$keep]){
    $rows=$filtered($keep);[$ids,$last]=$walk($values,11);
    check($rows&&$ids===$expected($values['sort']??'name',$values['direction']??'asc',$rows)&&$last['matched']===count($rows)&&$last['total']===300,'Filter '.json_encode($values,JSON_UNESCAPED_UNICODE).' gives '.count($rows));
}
// Stale, foreign and malformed cursors; limit range.
$cursor=$call('list',(string)$paging['id'],['limit'=>'5'])['next'];
foreach([['sort'=>'size'],['direction'=>'desc'],['search'=>'x'],['type'=>'directory']] as $changed)check(fails(fn()=>$call('list',(string)$paging['id'],['limit'=>'5','cursor'=>$cursor,...$changed]),400,'Stale cursor '.json_encode($changed))->details===['code'=>'stale_cursor'],'Stale cursor code');
fails(fn()=>$call('list',(string)$dirA['id'],['cursor'=>$cursor]),400,'Cursor of another folder');
foreach(['abc','!!!!',base64_encode('[1,"name","asc","","x",0,1,["a"]]'),str_repeat('A',513)] as $bad)fails(fn()=>$call('list',(string)$paging['id'],['cursor'=>$bad]),400,'Malformed cursor');
foreach(['0','201','x'] as $limit)fails(fn()=>$call('list',(string)$paging['id'],['limit'=>$limit]),400,'Limit out of range: '.$limit);
fails(fn()=>$call('list',(string)$paging['id'],['sort'=>'owner']),400,'Unknown sort');
fails(fn()=>$call('list',(string)$paging['id'],['search'=>str_repeat('x',101)]),400,'Search length');
// Long multibyte names: the cursor stays within 512 characters (re-read by id) and paging stays exact.
$long=$storage->entry((int)$call('create_directory',$rootA,['name'=>'Long'])['id']);
foreach(['a','b','c'] as $c)$storage->createFile($long,str_repeat('ő',248).$c.'.txt','text/plain',$src($c));
$p1=$call('list',(string)$long['id'],['limit'=>'1']);$p2=$call('list',(string)$long['id'],['limit'=>'1','cursor'=>$p1['next']]);
check(strlen($p1['next'])<=512&&$p2['items'][0]['name']===str_repeat('ő',248).'b.txt','Long-name cursor continues by id');
// Delete with the archive policy (this definition's default): hidden from every read, name reusable, content kept.
$arch=$storage->entry((int)$call('create_directory',$rootA,['name'=>'Archív'])['id']);
$archDir=$storage->entry($storage->createDirectory($arch,'Régi'));$archLeaf=$storage->createFile($archDir,'leaf.txt','text/plain',$src("archived leaf\n"));
$archPng=$storage->createFile($arch,'kép.png','image/png',$tmp.'/wide.png');$tasks->run(100,60);
$archKeys=[$storage->entry($archLeaf)['storage_key'],$storage->entry($archPng)['storage_key'],$storage->derivative($archPng,Thumbnails::KIND)['storage_key']];
$media=$registry->mediaSource('files');
check(isset($media->describe($ctx(),[(string)$archPng])[(string)$archPng]),'Media described before archiving');
$classIds=function() use ($media,$ctx,$db):array{[$sql,$params]=$media->classPredicate($ctx(),'fid','image');$q=$db->prepare("SELECT fid FROM (SELECT id AS fid FROM blade_files) t WHERE $sql");$q->execute($params);return array_map('intval',$q->fetchAll(PDO::FETCH_COLUMN));};
check(in_array($archPng,$classIds(),true),'Class filter matches before archiving');
$archived=$call('delete',(string)$arch['id'],['sources'=>$archDir['id'].','.$archPng.',999999']);
check($archived['policy']==='archive'&&$archived['succeeded']===[['source'=>(string)$archDir['id']],['source'=>(string)$archPng]]&&$archived['failed'][0]['source']==='999999'&&$archived['failed'][0]['name']==='','Archive result; unknown source reported as failed');
$raw=$db->query('SELECT id,name_key,archived_at,archived_by FROM blade_files WHERE id IN ('.$archDir['id'].','.$archLeaf.','.$archPng.') ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
check(count($raw)===3&&!array_filter($raw,fn($r)=>$r['archived_at']===null||$r['archived_by']!=='1')&&$raw[0]['name_key']==='\0archived:'.$archDir['id'],'Subtree archived with actor and tombstoned name');
check($storage->entry((int)$archDir['id'])===null&&$storage->entry($archLeaf)===null&&$storage->entries([$archPng])===[]&&$storage->child((int)$arch['id'],'Régi')===null&&$storage->subtree($arch,100)===[[...$arch,'relative'=>0]],'Archived rows hidden from entry, entries, child and subtree');
check($call('list',(string)$arch['id'])['items']===[]&&$call('list',(string)$arch['id'])['total']===0&&!array_intersect([(string)$archDir['id'],(string)$archLeaf,(string)$archPng],array_column($call('tree','a')['items'],'id')),'Archived rows hidden from list, counts and tree');
fails(fn()=>$call('list',(string)$archDir['id']),404,'Archived folder not found');fails(fn()=>$call('download',(string)$archLeaf),404,'Archived file not found');
check($media->describe($ctx(),[(string)$archPng])===[]&&!in_array($archPng,$classIds(),true),'FileMedia neither describes nor class-matches archived files');
check($call('create_directory',(string)$arch['id'],['name'=>'régi'])['id']!==''&&$call('upload',(string)$arch['id'],[],$ctx('1',[$part('files','kép.png',$png)]))['succeeded'][0]['name']==='kép.png','Archived names are free again');
$tasks->run(100,60);
check(!array_filter($archKeys,fn($k)=>!$stored($k)),'Archived content and derivatives stay stored');
$archAudit=json_decode($db->query("SELECT detail FROM blade_audit WHERE action='delete' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true);
check($archAudit===['target'=>(string)$arch['id'],'sources'=>[(string)$archDir['id'],(string)$archPng,'999999'],'succeeded'=>[(string)$archDir['id'],(string)$archPng],'failed'=>['999999'],'entries'=>3,'policy'=>'archive'],'Delete audit: ids, count and policy only');
fails(fn()=>$call('delete',$rootA,['sources'=>$rootA]),400,'Mount root cannot be deleted');
fails(fn()=>$call('delete',$rootA,['sources'=>$paging['id'].','.$all[0]['id']]),400,'Nested delete selection');
fails(fn()=>$call('delete',$rootA,['sources'=>(string)$paging['id']],$ctx('2')),403,'Reader cannot delete');
$rule->execute(['5','delete','ui','id','b']);
fails(fn()=>$call('delete',$rootB,['sources'=>$all[0]['id']],$ctx('5')),403,'Delete right needed on every source mount');
$bulk=$storage->entry((int)$call('create_directory',$rootB,['name'=>'Bulk'])['id']);
$db->beginTransaction();$ins=$db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,modified_at) VALUES ('test','b',?,'directory',?,?,'2026-01-01T00:00:00Z')");for($i=0;$i<5000;$i++)$ins->execute([$bulk['id'],'d'.$i,'d'.$i]);$db->commit();
fails(fn()=>$call('delete',$rootB,['sources'=>(string)$bulk['id']],$ctx('5')),413,'At most 5000 entries per delete');
check(count($storage->children((int)$bulk['id'],6000))===5000,'Refused delete changes nothing');
check($call('delete',$rootB,['sources'=>(string)$storage->child((int)$bulk['id'],'d1')['id']],$ctx('5'))['succeeded']!==[],'Delete right on the source mount suffices');
$db->exec('DELETE FROM blade_files WHERE parent_id='.(int)$bulk['id']);
// Delete policy `delete`: an independent definition removes rows and derivatives, content goes after the collection task, shared content stays.
$delDef=new FileManagerDefinition('del','Del','del',['a'=>'Drive A','b'=>'Drive B'],allowedExtensions:['txt','png','jpg','jpeg','md'],contentRoot:$root,deletePolicy:'delete');$delDef->install($db);
$delRegistry=new Registry();$delWs=new Workspace($delRegistry,$db);$delDef->register($delWs);$delStorage=$delDef->storage($db,$delWs->tasks);
$delRule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,'del',?,'ui','allow',?,?,'')");
foreach(['list','tree','copy','move','download','delete','rename','upload','create_directory'] as $a)$delRule->execute(['1',$a,'all','']);
$dcall=fn(string $action,?string $id,array $values=[],string $actor='1')=>$delWs->executor->execute(new Context(new Identity($actor,'A'),'ui',$delWs->acl,$db,[],[],$session1),'del',$action,$id,$values);
check(array_values(array_filter($delWs->views(new Identity('1','x')),fn($v)=>$v['resource']==='del'))[0]['options']['deletePolicy']==='delete','Delete policy in metadata');
$dRootA=$delStorage->root('a');$dRootB=$delStorage->root('b');
$dDir=$delStorage->entry($delStorage->createDirectory($dRootA,'Törlendő'));$dSub=$delStorage->entry($delStorage->createDirectory($dDir,'Al'));
$dLeaf=$delStorage->createFile($dSub,'leaf.txt','text/plain',$src("delete me\n"));$dPng=$delStorage->createFile($dDir,'kép.png','image/png',$tmp.'/wide.png');
$dShared=$delStorage->createFile($dRootA,'közös.txt','text/plain',$src("shared by a copy\n"));
$dCopy=$dcall('copy',(string)$dRootB['id'],['sources'=>(string)$dShared])['succeeded'][0]['id'];
$delWs->tasks->run(100,60);
$dKeys=['leaf'=>$delStorage->entry($dLeaf)['storage_key'],'png'=>$delStorage->entry($dPng)['storage_key'],'thumb'=>$delStorage->derivative($dPng,Thumbnails::KIND)['storage_key'],'shared'=>$delStorage->entry($dShared)['storage_key']];
$dstored=fn($k)=>is_file($root.'/del/'.$k);
check(!array_filter($dKeys,fn($k)=>!$dstored($k)),'Delete fixtures stored');
$deleted=$dcall('delete',(string)$dRootA['id'],['sources'=>$dDir['id'].','.$dShared]);
check($deleted['policy']==='delete'&&count($deleted['succeeded'])===2&&$deleted['failed']===[],'Delete result');
check((int)$db->query('SELECT COUNT(*) FROM blade_files WHERE id IN ('.$dDir['id'].','.$dSub['id'].','.$dLeaf.','.$dPng.','.$dShared.')')->fetchColumn()===0&&(int)$db->query('SELECT COUNT(*) FROM blade_file_derivatives WHERE file_id='.$dPng)->fetchColumn()===0,'Rows and derivatives removed');
check($dstored($dKeys['leaf'])&&$dstored($dKeys['thumb']),'Content stays until the collection task runs');
$delWs->tasks->run(100,60);
check(!$dstored($dKeys['leaf'])&&!$dstored($dKeys['png'])&&!$dstored($dKeys['thumb'])&&$dstored($dKeys['shared'])&&$delStorage->entry((int)$dCopy)!==null,'Unreferenced content collected; content shared with a copy kept');
check($dcall('create_directory',(string)$dRootA['id'],['name'=>'Törlendő'])['id']!=='','Deleted name reusable');
// Overwrite under `delete`: upload and copy rewrite the target in place (same id, next revision), a move removes it; replaced content is collected.
$oDir=$delStorage->entry($delStorage->createDirectory($dRootB,'Felülírás'));
$oUp=$delStorage->createFile($oDir,'feltöltött.txt','text/plain',$src("upload old\n"));$oCopy=$delStorage->createFile($oDir,'másolt.txt','text/plain',$src("copy old\n"));$oMove=$delStorage->createFile($oDir,'mozgatott.txt','text/plain',$src("move old\n"));
$oSrcCopy=$delStorage->createFile($dRootA,'másolt.txt','text/plain',$src("copy new\n"));$oSrcMove=$delStorage->createFile($dRootA,'mozgatott.txt','text/plain',$src("move new\n"));
$oKeys=array_map(fn($id)=>$delStorage->entry($id)['storage_key'],[$oUp,$oCopy,$oMove]);
$dup=fn(array $parts,string $decision)=>$delWs->executor->execute(new Context(new Identity('1','A'),'ui',$delWs->acl,$db,[],$parts,$session1),'del','upload',(string)$oDir['id'],['decision'=>$decision]);
$oUpResult=$dup([$part('files','feltöltött.txt',"upload new\n")],'overwrite')['succeeded'][0];
check($oUpResult['id']===(string)$oUp&&$oUpResult['replaced']===(string)$oUp&&(int)$delStorage->entry($oUp)['revision']===2&&$delStorage->content($oUp)==="upload new\n",'Delete policy: upload overwrite rewrites in place');
check($dcall('copy',(string)$oDir['id'],['sources'=>(string)$oSrcCopy,'decision'=>'overwrite'])['succeeded'][0]['id']===(string)$oCopy&&$delStorage->content($oCopy)==="copy new\n"&&(int)$delStorage->entry($oCopy)['revision']===2,'Delete policy: copy overwrite rewrites in place');
check($dcall('move',(string)$oDir['id'],['sources'=>(string)$oSrcMove,'decision'=>'overwrite'])['succeeded'][0]['id']===(string)$oSrcMove&&$delStorage->child((int)$oDir['id'],'mozgatott.txt')['id']==$oSrcMove,'Delete policy: move overwrite places the moved entry');
check((int)$db->query('SELECT COUNT(*) FROM blade_files WHERE id='.$oMove)->fetchColumn()===0&&(int)$db->query('SELECT COUNT(*) FROM blade_files WHERE archived_at IS NOT NULL AND id IN ('.$oUp.','.$oCopy.','.$oMove.')')->fetchColumn()===0,'Delete policy: nothing archived, the move target removed');
$dAudit=json_decode($db->query("SELECT detail FROM blade_audit WHERE resource='del' AND action='upload' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true);
check($dAudit['replaced']===[(string)$oUp]&&$dAudit['archived']===[],'Delete policy: upload audit reports the replaced id, nothing archived');
$delWs->tasks->run(100,60);
check(!array_filter($oKeys,$dstored),'Delete policy: replaced content collected');
// U5: usage providers on file deletes (preview over subtrees without changes; apply clears under both policies), `file` fields, the storage API.
$db->exec("CREATE TABLE posters(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL DEFAULT '',file_id TEXT NOT NULL DEFAULT '')");
$usage=new class('Plakátok') implements Blade\Feature\UsageProvider{
    public array $calls=[];
    public function __construct(private string $label){}
    public function usages(Context $ctx,array $ids):array{$out=[];$q=$ctx->db->prepare('SELECT file_id,COUNT(*) FROM posters WHERE file_id IN ('.implode(',',array_fill(0,count($ids),'?')).') GROUP BY file_id');$q->execute($ids);foreach($q->fetchAll(PDO::FETCH_NUM) as [$id,$n])$out[$id]=[['label'=>$this->label,'count'=>(int)$n]];return $out;}
    public function clear(Context $ctx,array $ids,string $policy):void{$this->calls[]=[$policy,$ids];$ctx->db->prepare("UPDATE posters SET file_id='' WHERE file_id IN (".implode(',',array_fill(0,count($ids),'?')).')')->execute($ids);}
};
foreach(['archive','delete'] as $policy){
    $res='lib_'.$policy;
    $uDef=new FileManagerDefinition($res,'Lib','lib-'.$policy,['m'=>'Media','n'=>'Other'],allowedExtensions:['txt','png'],maxSizeBytes:100000,contentRoot:$root,deletePolicy:$policy);$uDef->install($db);
    $uRegistry=new Registry();$uWs=new Workspace($uRegistry,$db);$uDef->register($uWs);$uStorage=$uDef->storage($db,$uWs->tasks);
    $other=new class implements Blade\Feature\UsageProvider{public array $ids=[];public function usages(Context $ctx,array $ids):array{return array_fill_keys(array_intersect($ids,$this->ids),[['label'=>'Egyéb','count'=>1]]);}public function clear(Context $ctx,array $ids,string $policy):void{}};
    $uRegistry->usage($res,$usage);$uRegistry->usage($res,$other);
    if($policy==='archive'){
        foreach([fn()=>$uRegistry->usage($res,$usage),fn()=>$uRegistry->usage('Bad name',$other)] as $invalid){try{$invalid();throw new RuntimeException('Invalid usage provider accepted');}catch(InvalidArgumentException){}}
        check($uRegistry->usageProviders($res)===[$usage,$other]&&$uRegistry->usageProviders('none')===[],'Usage providers registered per resource, in order');
        check($registry->usageProviders('files')===[]&&!isset(array_column(array_values(array_filter($workspace->views(new Identity('1','x')),fn($v)=>$v['resource']==='files'))[0]['actions'],null,'name')['delete']['usages']),'No usages flag without providers');
    }
    $uRule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,'ui','allow',?,?,'')");
    foreach(['tree','list','delete','upload','thumbnail_get'] as $a)$uRule->execute(['1',$res,$a,'all','']);
    $uRule->execute(['2',$res,'thumbnail_get','id','n']);
    $posters=new Blade\Feature\SqlResource('posters_'.$policy,'posters','id',[new Field('title','Cím'),new Field('file_id','Fájl','file',file:['resource'=>$res,'mount'=>'m','folder'=>'Képek/Plakát','accept'=>['image']])]);
    $posters->register($uRegistry,'Posters');
    foreach(['1','2'] as $actor)foreach(['list','get','create'] as $a)$uRule->execute([$actor,'posters_'.$policy,$a,'all','']);
    $ucall=fn(string $resource,string $action,?string $id,array $values=[],string $actor='1',array $uploads=[])=>$uWs->executor->execute(new Context(new Identity($actor,'A'),'ui',$uWs->acl,$db,[],$uploads),$resource,$action,$id,$values);
    $m=$uStorage->root('m');$box=$uStorage->entry($uStorage->createDirectory($m,'Box'));$deep=$uStorage->entry($uStorage->createDirectory($box,'Deep'));
    $img1=(string)$uStorage->createFile($deep,'a.png','image/png',$tmp.'/wide.png');$img2=(string)$uStorage->createFile($m,'b.png','image/png',$tmp.'/wide.png');$keep=(string)$uStorage->createFile($m,'c.png','image/png',$tmp.'/wide.png');
    $txt=(string)$uStorage->createFile($m,'d.txt','text/plain',$src("text\n"));$onN=(string)$uStorage->createFile($uStorage->root('n'),'e.png','image/png',$tmp.'/wide.png');
    $other->ids=[$img2];
    $db->exec('DELETE FROM posters');
    $ins=$db->prepare('INSERT INTO posters(title,file_id) VALUES (?,?)');foreach([['p1',$img1],['p2',$img1],['p3',$img2],['p4',$keep]] as $r)$ins->execute($r);
    $usage->calls=[];
    $preview=$ucall($res,'delete',(string)$m['id'],['sources'=>$box['id'].','.$img2,'preview'=>'1']);
    check($preview['count']===2&&$preview['entries']===4&&$preview['usages']===[['label'=>'Plakátok','count'=>3],['label'=>'Egyéb','count'=>1]],'Delete preview aggregates usages over every file of the subtrees ('.$policy.')');
    check($uStorage->entry((int)$img1)&&$uStorage->entry((int)$box['id'])&&$usage->calls===[]&&(int)$db->query("SELECT COUNT(*) FROM posters WHERE file_id<>''")->fetchColumn()===4,'Preview changes nothing ('.$policy.')');
    $applied=$ucall($res,'delete',(string)$m['id'],['sources'=>$box['id'].','.$img2]);
    check($applied['policy']===$policy&&count($applied['succeeded'])===2&&$applied['cleared']===['Plakátok'=>3,'Egyéb'=>1],'Applied delete reports cleared references ('.$policy.')');
    check($db->query("SELECT action FROM blade_audit WHERE resource='$res' AND outcome='success' AND action LIKE 'delete%' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN)===['delete_preview','delete'],'The preview is journaled as delete_preview ('.$policy.')');
    check(count($usage->calls)===1&&$usage->calls[0][0]===$policy&&array_values(array_diff($usage->calls[0][1],[$img1,$img2]))===[]&&count($usage->calls[0][1])===2,'Providers cleared the deleted files under '.$policy);
    check($db->query('SELECT GROUP_CONCAT(file_id) FROM (SELECT file_id FROM posters ORDER BY id)')->fetchColumn()===',,,'.$keep&&$uStorage->entry((int)$img1)===null,'References cleared, others kept ('.$policy.')');
    check($policy==='delete'?(int)$db->query('SELECT COUNT(*) FROM blade_files WHERE id='.(int)$img1)->fetchColumn()===0:$db->query('SELECT archived_at FROM blade_files WHERE id='.(int)$img1)->fetchColumn()!==null,'Delete policy applied ('.$policy.')');
    $auditDetail=json_decode($db->query("SELECT detail FROM blade_audit WHERE resource='$res' AND action='delete' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true);
    check($auditDetail['cleared']===['Plakátok'=>3,'Egyéb'=>1],'Cleared counts audited ('.$policy.')');
    // `file` field: metadata resolves the folder once it exists; no paths; validation against mount, class, liveness and the thumbnail right.
    $field=$uRegistry->fields('posters_'.$policy)['file_id'];
    $meta=$uWs->fieldMetadata(new Context(new Identity('1','A'),'ui',$uWs->acl,$db),$field);
    check($meta['type']==='file'&&$meta['file']['folderId']===null&&$meta['file']['canUpload']===false&&!isset($meta['file']['folder']),'Missing field folder: no target, no upload ('.$policy.')');
    $files=$uDef->files($db,$uWs->tasks);
    $folder=$files->folder('m','Képek/Plakát',true);
    check($files->folder('m','Képek/Plakát')['id']===$folder['id']&&$files->folder('m','Nincs')===null&&$files->folder('m')['id']===$m['id'],'Storage API finds and creates folders');
    $meta=$uWs->fieldMetadata(new Context(new Identity('1','A'),'ui',$uWs->acl,$db),$field);
    check($meta['file']===['resource'=>$res,'mount'=>'m','accept'=>['image'],'folderId'=>(string)$folder['id'],'policy'=>[...$uDef->uploadPolicy()->metadata(),'extensions'=>['png'],'folders'=>false],'canUpload'=>true,'canChoose'=>true],'File field metadata ('.$policy.')');
    check($uWs->fieldMetadata(new Context(new Identity('2','B'),'ui',$uWs->acl,$db),$field)['file']['canUpload']===false&&$uWs->fieldMetadata(new Context(new Identity('2','B'),'ui',$uWs->acl,$db),$field)['file']['canChoose']===false&&!str_contains(json_encode($meta),$root),'Upload right per actor; no paths');
    $created=$ucall('posters_'.$policy,'create',null,['title'=>'ok','file_id'=>$keep]);
    check($db->query('SELECT file_id FROM posters WHERE id='.(int)$created['id'])->fetchColumn()===$keep,'A live readable image of the mount is accepted');
    foreach([[$onN,'1','other mount'],[$txt,'1','wrong class'],[$img1,'1',$policy==='archive'?'archived file':'deleted file'],[(string)$box['id'],'1','folder'],[$keep,'2','no thumbnail right'],['12x','1','malformed']] as [$value,$actor,$case]){
        $error=fails(fn()=>$ucall('posters_'.$policy,'create',null,['title'=>'x','file_id'=>$value],$actor),400,'File field rejects '.$case);
        check(isset($error->fieldErrors['file_id']),'File field error: '.$case);
    }
    // Storage API: stores into a mount folder under the file manager's rules and the actor's upload right.
    $part=function(string $field,string $name,string $content) use ($tmp):Upload{$path=$tmp.'/'.bin2hex(random_bytes(6));file_put_contents($path,$content);return new Upload($field,$name,$path,strlen($content),UPLOAD_ERR_OK);};
    $ctx1=new Context(new Identity('1','A'),'ui',$uWs->acl,$db);
    $stored=$files->store($ctx1,(string)$folder['id'],new Upload('files','plakát.png',$tmp.'/wide.png',(int)filesize($tmp.'/wide.png'),UPLOAD_ERR_OK),['image']);
    $again=$files->store($ctx1,(string)$folder['id'],new Upload('files','plakát.png',$tmp.'/wide.png',(int)filesize($tmp.'/wide.png'),UPLOAD_ERR_OK));
    check($stored['name']==='plakát.png'&&$stored['mount']==='m'&&$stored['mime_type']==='image/png'&&$again['name']==='plakát (2).png'&&$uStorage->entry((int)$stored['id'])['parent_id']==$folder['id'],'Storage API stores with a free name');
    fails(fn()=>$files->store(new Context(new Identity('2','B'),'ui',$uWs->acl,$db),(string)$folder['id'],$part('files','x.png','x')),403,'Storage API needs the upload right');
    check(fails(fn()=>$files->store($ctx1,(string)$folder['id'],$part('files','x.png','not png')),400,'Storage API detects content')->details['code']==='content_mismatch','Content mismatch code');
    check(fails(fn()=>$files->store($ctx1,(string)$folder['id'],$part('files','x.txt',"t\n"),['image']),400,'Storage API narrows classes')->details['code']==='type','Type code');
    fails(fn()=>$files->store($ctx1,$img2,$part('files','x.png','x')),404,'Storage API needs a live folder');
    // Overwrites follow the delete policy for references too: a replaced file that disappears (archived, or removed by a
    // move) has its references cleared in the same transaction; an in-place rewrite (`delete`, upload and copy) keeps the id and them.
    foreach(['copy','move','download'] as $a)$uRule->execute(['1',$res,$a,'all','']);
    $n=$uStorage->root('n');
    $over=static function(string $name) use ($uStorage,$m,$n,$src,$ins,$db):array{
        $target=(string)$uStorage->createFile($m,$name,'text/plain',$src("old $name\n"));$source=(string)$uStorage->createFile($n,$name,'text/plain',$src("new $name\n"));
        $ins->execute(['ref '.$name,$target]);return [$target,$source,(int)$db->lastInsertId()];
    };
    $refOf=fn(int $poster)=>$db->query('SELECT file_id FROM posters WHERE id='.$poster)->fetchColumn();
    foreach(['upload','copy','move'] as $operation){
        [$target,$source,$poster]=$over($operation.'-over.txt');
        $usage->calls=[];
        $run=fn(string $decision)=>$operation==='upload'
            ?$ucall($res,'upload',(string)$m['id'],$decision?['decision'=>$decision]:[],'1',[$part('files',$operation.'-over.txt',"uploaded\n")])
            :$ucall($res,$operation,(string)$m['id'],['sources'=>$source,...($decision?['decision'=>$decision]:[])]);
        $conflict=fails(fn()=>$run(''),409,ucfirst($operation).' conflict asks for a decision ('.$policy.')');
        check($conflict->details['usages']===[['label'=>'Plakátok','count'=>1]]&&!isset($conflict->details['conflicts'][0]['existing'])&&$refOf($poster)===$target,ucfirst($operation).' conflict lists the references of the existing file ('.$policy.')');
        $result=$run('overwrite');
        $gone=$policy==='archive'||$operation==='move';
        check($result['cleared']===($gone?['Plakátok'=>1]:[])&&$refOf($poster)===($gone?'':$target)&&$usage->calls===($gone?[[$policy,[$target]]]:[]),ucfirst($operation).' overwrite '.($gone?'clears':'keeps').' the references ('.$policy.')');
        check(($uStorage->entry((int)$target)!==null)===!$gone,ucfirst($operation).' overwrite '.($gone?'replaces':'rewrites in place').' the target ('.$policy.')');
        $audit=json_decode($db->query("SELECT detail FROM blade_audit WHERE resource='$res' AND action='$operation' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true);
        check(($audit['cleared']??[])===($gone?['Plakátok'=>1]:[]),ucfirst($operation).' overwrite audits the cleared references ('.$policy.')');
    }
    // The transfer protocol's preflight also names the references of a conflicting file.
    [$target]=$over('preflight.txt');
    $preflight=$uWs->transfers->handle(new Context(new Identity('1','A'),'ui',$uWs->acl,$db,[],[],$session1),$session1,$res,(string)$m['id'],['operation'=>'upload_preflight','action'=>'upload','files'=>[['name'=>'preflight.txt','size'=>4,'type'=>'text/plain']]]);
    check(($preflight['files'][0]['conflict']['usages']??null)===[['label'=>'Plakátok','count'=>1]],'Preflight conflict carries usages ('.$policy.')');
}
foreach([
    fn()=>new Field('f','F','file'),
    fn()=>new Field('f','F','text',file:['resource'=>'files','mount'=>'a','accept'=>['image']]),
    fn()=>new Field('f','F','file',file:['resource'=>'files','mount'=>'a','accept'=>[]]),
    fn()=>new Field('f','F','file',file:['resource'=>'files','mount'=>'a']),
    fn()=>new Field('f','F','file',file:['resource'=>'files','mount'=>'a','accept'=>['image'],'path'=>'/x']),
    fn()=>new Field('f','F','file',file:['resource'=>'files','mount'=>'a','accept'=>['image'],'folder'=>'../x']),
    fn()=>new Field('f','F','file',file:['resource'=>'files','mount'=>'a','accept'=>['image']],column:['editable'=>true]),
    fn()=>new Field('f','F','file',file:['resource'=>'files','mount'=>'a','accept'=>['image']],column:['media'=>'files']),
    fn()=>new Field('f','F','file',bulk:true,file:['resource'=>'files','mount'=>'a','accept'=>['image']]),
] as $invalid){try{$invalid();throw new RuntimeException('Invalid file field accepted');}catch(InvalidArgumentException){}}
check((new Field('f','F','file',file:['resource'=>'files','mount'=>'a','accept'=>['image']]))->media()==='files','A file field is a media column of its file manager');
// Copy reads bytes: a source mount with `list` only refuses the copy (403); a move needs `list` and `move` only.
$delRule->execute(['8','list','id','a']);$delRule->execute(['8','copy','id','b']);$delRule->execute(['8','list','id','b']);
$oListOnly=$delStorage->createFile($dRootA,'csak lista.txt','text/plain',$src("list only\n"));
fails(fn()=>$dcall('copy',(string)$dRootB['id'],['sources'=>(string)$oListOnly],'8'),403,'Copy from a list-only source mount');
$delRule->execute(['8','move','id','a']);$delRule->execute(['8','move','id','b']);
check($dcall('move',(string)$dRootB['id'],['sources'=>(string)$oListOnly],'8')['succeeded'][0]['id']===(string)$oListOnly,'Move needs no download right');
// Rename: extension rule (same stored type, allowed), safe names, conflicts, mount root, ACL; revision and thumbnail stay consistent.
$rPhoto=$delStorage->createFile($dRootA,'fotó.jpg','image/jpeg',$tmp.'/rotated.jpg');$rText=$delStorage->createFile($dRootA,'jegyzet.txt','text/plain',$src("t\n"));$delWs->tasks->run(100,60);
$renamed=$dcall('rename',(string)$rPhoto,['name'=>'fotó.jpeg']);
check($renamed['name']==='fotó.jpeg'&&$renamed['revision']==='2'&&$renamed['item']['extension']==='jpeg'&&$renamed['item']['thumbnail']==='ready'&&$renamed['item']['mime_type']==='image/jpeg','jpg to jpeg keeps the stored type; thumbnail stays current');
check($dcall('rename',(string)$rText,['name'=>'Jegyzet.TXT'])['name']==='Jegyzet.TXT','Same extension in another case; case-only rename of the entry itself');
foreach(['fotó.png','fotó','fotó.md'] as $bad)check(isset(fails(fn()=>$dcall('rename',(string)$rPhoto,['name'=>$bad]),400,'Extension changes the type: '.$bad)->fieldErrors['name']),'Extension field error');
fails(fn()=>$dcall('rename',(string)$rText,['name'=>'jegyzet.md']),400,'Text to Markdown changes the stored type');
$delStorage->createFile($dRootA,'másik.txt','text/plain',$src("m\n"));
check(isset(fails(fn()=>$dcall('rename',(string)$rText,['name'=>'MÁSIK.txt']),409,'Rename conflict')->fieldErrors['name']),'Conflict field error');
foreach(['a/b.txt','..',"x\u{202E}.txt",''] as $bad)fails(fn()=>$dcall('rename',(string)$rText,['name'=>$bad]),400,'Unsafe rename: '.json_encode($bad));
fails(fn()=>$dcall('rename',(string)$dRootA['id'],['name'=>'X']),400,'Mount root cannot be renamed');
fails(fn()=>$dcall('rename',(string)$rText,['name'=>'y.txt'],'7'),403,'Rename needs its right');
$dFolder=$dcall('create_directory',(string)$dRootA['id'],['name'=>'Mappa.txt'])['id'];
check($dcall('rename',$dFolder,['name'=>'Mappa név'])['item']['kind']==='directory','Directories rename freely');
// Download: any stored file as an attachment with its name and ranges; directories refused; ACL.
$dl=$call('download',$note);
check($dl instanceof DownloadStream&&file_get_contents($dl->path)==="edited\n"&&$dl->disposition==='attachment'&&$dl->cacheControl()==='no-store'&&$dl->contentDisposition()==='attachment; filename="note.txt"; filename*=UTF-8\'\'note.txt'&&$dl->mimeType==='text/plain','Download bytes, name and no-store');
$dlRange=$dl->plan(['HTTP_RANGE'=>'bytes=1-3']);check($dlRange['status']===206&&$dlRange['range']===[1,3],'Download honours a range');
fails(fn()=>$call('download',(string)$dirA['id']),400,'Directory cannot be downloaded');
fails(fn()=>$call('download',$note,[],$ctx('2')),403,'Download needs its right');
fails(fn()=>$call('download',$note,[],$ctx('1',[],'api',['files.download'])),404,'UI grant does not open the API');
// ZIP: a manifest bound to actor, channel and session; the stream is validated with ZipArchive (and unzip -t).
$zipRoot=$storage->entry((int)$call('create_directory',$rootA,['name'=>'Zip'])['id']);
$zDir=$storage->entry($storage->createDirectory($zipRoot,'Ünnepi képek'));$zDeep=$storage->entry($storage->createDirectory($storage->entry($storage->createDirectory($zDir,'al')),'mély'));
$storage->createDirectory($zDir,'üres');
$zFiles=['Ünnepi képek/árvíztűrő.txt'=>"tükörfúrógép\n",'Ünnepi képek/al/mély/x.txt'=>random_bytes(70000),'Ünnepi képek/kép.png'=>$png];
$storage->createFile($zDir,'árvíztűrő.txt','text/plain',$src($zFiles['Ünnepi képek/árvíztűrő.txt']));$storage->createFile($zDeep,'x.txt','text/plain',$src($zFiles['Ünnepi képek/al/mély/x.txt']));$storage->createFile($zDir,'kép.png','image/png',$src($png));
$zSingle=$storage->createFile($zipRoot,'egyedül.txt','text/plain',$src("alone\n"));
$zOther=$storage->entry($storage->createDirectory($zipRoot,'Másik'));$zTwin=$storage->createFile($zOther,'egyedül.txt','text/plain',$src("twin\n"));
$prepared=$call('zip_prepare',(string)$zipRoot['id'],['sources'=>$zDir['id'].','.$zSingle],$octx());
check(preg_match('/^[0-9a-f]{32}$/',$prepared['token'])&&$prepared['name']==='Zip'&&$prepared['count']===4&&$prepared['bytes']===array_sum(array_map('strlen',$zFiles))+6,'Prepare returns token, name, file count and bytes');
$manifestPath=$tempRoot.'/zip-'.$prepared['token'].'.json';
check(is_file($manifestPath)&&(fileperms($manifestPath)&0777)===0660&&!str_contains(file_get_contents($manifestPath),'session-1')&&!glob($tempRoot.'/*.zip'),'Manifest under the temporary root, owner hash only, no archive bytes');
$zipBytes=function(Context $c,string $token) use ($call):array{$result=$call('zip_get',$token,[],$c);check($result instanceof StreamedDownload,'zip_get streams');ob_start();($result->write)();return [$result,ob_get_clean()];};
[$zipped,$bytes]=$zipBytes($octx(),$prepared['token']);
check($zipped->mimeType==='application/zip'&&in_array('Content-Disposition: attachment; filename="Zip.zip"; filename*=UTF-8\'\'Zip.zip',$zipped->headers(),true)&&in_array('Cache-Control: no-store',$zipped->headers(),true)&&in_array('X-Content-Type-Options: nosniff',$zipped->headers(),true)&&!preg_grep('/^Content-Length|^Accept-Ranges/',$zipped->headers()),'ZIP headers: type, attachment name, no-store, no length or ranges');
check(!is_file($manifestPath),'Manifest consumed when streaming starts');
file_put_contents($tmp.'/out.zip',$bytes);$zip=new ZipArchive();check($zip->open($tmp.'/out.zip',ZipArchive::CHECKCONS)===true,'ZipArchive opens the stream');
$names=[];for($i=0;$i<$zip->numFiles;$i++){$stat=$zip->statIndex($i);$names[]=$stat['name'];if(!str_ends_with($stat['name'],'/')){$content=$zip->getFromIndex($i);check($stat['crc']===crc32($content)&&$stat['size']===strlen($content)&&$stat['comp_method']===ZipArchive::CM_STORE,'CRC, size and STORE: '.$stat['name']);}}
sort($names);$expectedNames=['egyedül.txt','Ünnepi képek/','Ünnepi képek/al/','Ünnepi képek/al/mély/','Ünnepi képek/al/mély/x.txt','Ünnepi képek/kép.png','Ünnepi képek/árvíztűrő.txt','Ünnepi képek/üres/'];sort($expectedNames);
check($names===$expectedNames,'Archive names: nested folders, UTF-8, empty folder: '.json_encode($names,JSON_UNESCAPED_UNICODE));
foreach($zFiles as $name=>$content)check($zip->getFromName($name)===$content,'Archived content: '.$name);
check($zip->getFromName('egyedül.txt')==="alone\n",'Selected file at the archive root');$zip->close();
if(is_executable('/usr/bin/unzip')){exec('/usr/bin/unzip -t '.escapeshellarg($tmp.'/out.zip').' 2>&1',$lines,$code);check($code===0&&str_contains(implode("\n",$lines),'No errors detected'),'unzip -t accepts the stream');}
fails(fn()=>$call('zip_get',$prepared['token'],[],$octx()),404,'Token is single-use');
$twin=$call('zip_prepare',(string)$zipRoot['id'],['sources'=>$zSingle.','.$zTwin],$octx());[,$twinBytes]=$zipBytes($octx(),$twin['token']);
file_put_contents($tmp.'/twin.zip',$twinBytes);$zip=new ZipArchive();$zip->open($tmp.'/twin.zip');
check($zip->numFiles===2&&$zip->getFromName('egyedül.txt')==="alone\n"&&$zip->getFromName('egyedül (2).txt')==="twin\n",'Root names unique per archive');$zip->close();
check($call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$zDir['id']],$octx())['name']==='Ünnepi képek','A single source names the archive');
// Foreign session, actor and channel see no manifest; expired manifests are removed; revoked rights are re-checked at get time.
$token=$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$zSingle],$octx())['token'];
$rule->execute(['1','zip_get','api','all','']);
foreach([[$octx('1',Transfers::owner('session-2')),'owner'],[$octx('4'),'actor'],[$octx('1',null,'api',['files.zip_get']),'channel'],[$octx('1',''),'no session']] as [$c,$label])fails(fn()=>$call('zip_get',$token,[],$c),404,'Foreign '.$label.' sees no ZIP');
foreach(['../x','ABC',str_repeat('0',32)] as $bad)fails(fn()=>$call('zip_get',$bad,[],$octx()),404,'Unknown ZIP token');
check(is_file($tempRoot.'/zip-'.$token.'.json'),'Foreign requests leave the manifest');
$meta=json_decode(file_get_contents($tempRoot.'/zip-'.$token.'.json'),true);$meta['expires_at']=time()-1;file_put_contents($tempRoot.'/zip-'.$token.'.json',json_encode($meta));
fails(fn()=>$call('zip_get',$token,[],$octx()),404,'Expired ZIP');check(!is_file($tempRoot.'/zip-'.$token.'.json'),'Expired manifest removed');
foreach(['list','zip_prepare','zip_get','download'] as $a)$rule->execute(['6',$a,'ui','id','a']);
$revoke=$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$zDir['id']],$octx('6'))['token'];
$db->exec("DELETE FROM blade_rules WHERE subject_id='6' AND action='download'");
fails(fn()=>$call('zip_get',$revoke,[],$octx('6')),403,'Revoked download right re-checked at get time');
check(is_file($tempRoot.'/zip-'.$revoke.'.json'),'Denied get keeps the manifest');
fails(fn()=>$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$zDir['id']],$octx('6')),403,'Prepare needs download on every source mount');
$rule->execute(['6','download','ui','id','a']);
fails(fn()=>$call('zip_prepare',(string)$zipRoot['id'],['sources'=>$zSingle.','.$noteB],$octx('6')),403,'Source on another mount without download');
fails(fn()=>$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$zSingle],$octx('1',''))
,403,'Prepare needs a session');
fails(fn()=>$call('zip_prepare',(string)$zipRoot['id'],['sources'=>implode(',',range(1,101))],$octx()),400,'At most 100 sources');
fails(fn()=>$call('zip_prepare',(string)$zipRoot['id'],['sources'=>$zDir['id'].','.$zDeep['id']],$octx()),400,'Nested ZIP selection');
$db->exec('UPDATE blade_files SET size=4294967296 WHERE id='.$zSingle);
check(fails(fn()=>$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$zSingle],$octx()),413,'ZIP byte limit')->details['max_bytes']===4294967296-67108864,'Byte limit details');
$db->exec('UPDATE blade_files SET size=6 WHERE id='.$zSingle);
$many=$storage->entry($storage->createDirectory($zipRoot,'Sok'));$manyRow=$storage->entry($zSingle);
$db->beginTransaction();$ins=$db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,extension,mime_type,size,storage_key,sha256,modified_at) VALUES ('test','a',?,'file',?,?,'txt','text/plain',6,?,?,'2026-01-01T00:00:00Z')");for($i=0;$i<5001;$i++)$ins->execute([$many['id'],"f$i.txt","f$i.txt",$manyRow['storage_key'],$manyRow['sha256']]);$db->commit();
check(fails(fn()=>$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$many['id']],$octx()),413,'ZIP file limit')->details['files']===5001,'File limit details');
$db->exec('DELETE FROM blade_files WHERE parent_id='.(int)$many['id']);
$zipAudit=json_decode($db->query("SELECT detail FROM blade_audit WHERE action='zip_get' AND outcome='success' ORDER BY id LIMIT 1")->fetchColumn(),true);
check($zipAudit===['sources'=>[(string)$zDir['id'],(string)$zSingle],'files'=>4,'bytes'=>$prepared['bytes'],'missing'=>0],'ZIP audit: ids, totals and missing count only');
// Missing content: left out and named in a closing MISSING-<n>.txt; content already missing before the first byte is counted in the audit.
$zMiss=$storage->entry($storage->createDirectory($zipRoot,'Hiányos'));
$zGone=$storage->createFile($zMiss,'eltűnt.txt','text/plain',$src("gone before\n"));$zLate=$storage->createFile($zMiss,'később.txt','text/plain',$src("gone later\n"));$storage->createFile($zMiss,'megvan.txt','text/plain',$src("kept\n"));
unlink($root.'/test/'.$keyOf((string)$zGone));
$missToken=$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$zMiss['id']],$octx())['token'];
$missResult=$call('zip_get',$missToken,[],$octx());unlink($root.'/test/'.$keyOf((string)$zLate));
ob_start();($missResult->write)();file_put_contents($tmp.'/missing.zip',ob_get_clean());
$zip=new ZipArchive();check($zip->open($tmp.'/missing.zip',ZipArchive::CHECKCONS)===true,'ZIP with missing content is valid');
$missNote=$zip->getFromName('MISSING-2.txt');
check($zip->getFromName('Hiányos/megvan.txt')==="kept\n"&&$zip->getFromName('Hiányos/eltűnt.txt')===false&&$zip->getFromName('Hiányos/később.txt')===false&&$zip->getNameIndex($zip->numFiles-1)==='MISSING-2.txt','Missing files left out; the note closes the archive');
check(is_string($missNote)&&preg_match('//u',$missNote)===1&&str_contains($missNote,"\nHiányos/eltűnt.txt\n")&&str_contains($missNote,"\nHiányos/később.txt\n"),'The note names the missing entry paths in UTF-8');$zip->close();
check(json_decode($db->query("SELECT detail FROM blade_audit WHERE action='zip_get' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn(),true)['missing']===1,'ZIP audit counts content missing before streaming');
// Archive segments follow the safe-name rule even for names that bypassed it (direct SQL); mount labels must pass it.
$db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,modified_at) VALUES ('test','a',?,'directory',?,?,'2026-01-01T00:00:00Z')")->execute([$zipRoot['id'],'rossz/név','rossz/név']);
$badDir=$db->lastInsertId();
$db->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,modified_at) VALUES ('test','a',?,'directory',?,?,'2026-01-01T00:00:00Z')")->execute([$zipRoot['id'],'..','..']);
$dotDir=$db->lastInsertId();
check($call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$badDir],$octx())['name']==='rossz_név'&&$call('zip_prepare',(string)$zipRoot['id'],['sources'=>(string)$dotDir],$octx())['name']==='_','Unsafe top-level ZIP segments are sanitized');
$db->exec('DELETE FROM blade_files WHERE id IN ('.(int)$badDir.','.(int)$dotDir.')');
foreach(['A/B','..','.',' A',"A\u{202E}",''] as $label){try{new FileManagerDefinition('files','Files','test',['a'=>$label],contentRoot:$root);throw new RuntimeException('Unsafe mount label accepted: '.json_encode($label));}catch(InvalidArgumentException){}}
$u4Audit=json_encode($db->query("SELECT * FROM blade_audit WHERE action IN ('delete','rename','download','zip_prepare','zip_get')")->fetchAll(PDO::FETCH_ASSOC),JSON_UNESCAPED_UNICODE);
foreach(['Ünnepi','egyedül','fotó','Jegyzet','note.txt',$session1] as $secret)check(!str_contains($u4Audit,$secret),'U4 audit excludes names and owners: '.$secret);
// ZipStream: exact length in advance, unreadable files skipped before any byte.
$chunks='';$writer=new Blade\Files\ZipStream(function(string $b) use (&$chunks){$chunks.=$b;});
$writer->directory('a','2026-10-24T12:34:56Z');check($writer->file('a/b.bin',$tmp.'/wide.png',0)&&!$writer->file('a/missing',$tmp.'/missing'),'Unreadable file skipped');
check($writer->finish()===strlen($chunks)&&strlen($chunks)===Blade\Files\ZipStream::length([['a',0,true],['a/b.bin',filesize($tmp.'/wide.png'),false]]),'Exact archive length');
check((new Blade\Feature\StreamedDownload('application/zip','x.zip',fn()=>null))->headers()[0]==='Content-Type: application/zip','StreamedDownload headers');
try{new Blade\Feature\StreamedDownload('text/html; x','x',fn()=>null);throw new RuntimeException('Invalid streamed type accepted');}catch(InvalidArgumentException){}
// Migration 0002: BLOBs of the earlier schema move to the store, resumable, verified, dropped only after verification.
$old=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$old->exec("CREATE TABLE blade_files (id INTEGER PRIMARY KEY AUTOINCREMENT, space VARCHAR(64) NOT NULL, mount_id VARCHAR(64) NOT NULL, parent_id BIGINT NOT NULL DEFAULT 0, kind VARCHAR(10) NOT NULL, name VARCHAR(255) NOT NULL, name_key VARCHAR(255) NOT NULL, extension VARCHAR(32) NOT NULL DEFAULT '', mime_type VARCHAR(100) NOT NULL DEFAULT '', size BIGINT NOT NULL DEFAULT 0, content BLOB, modified_at VARCHAR(30) NOT NULL, revision BIGINT NOT NULL DEFAULT 1, UNIQUE(space, mount_id, parent_id, name_key))");
$old->exec("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,modified_at) VALUES ('legacy','a',0,'directory','a','a','2026-01-01T00:00:00Z')");
$blobs=['note.txt'=>['text/plain',"legacy text\n"],'wide.png'=>['image/png',file_get_contents($tmp.'/wide.png')],'large.txt'=>['text/plain',random_bytes(1048576+12345)],'empty.txt'=>['text/plain','']];
$insert=$old->prepare("INSERT INTO blade_files (space,mount_id,parent_id,kind,name,name_key,extension,mime_type,size,content,modified_at) VALUES ('legacy','a',1,'file',?,?,?,?,?,?,'2026-01-01T00:00:00Z')");
foreach($blobs as $name=>[$mime,$bytes]){foreach([$name,$name,FileStorage::extension($name),$mime,strlen($bytes)] as $i=>$value)$insert->bindValue($i+1,$value);$insert->bindValue(6,$bytes,PDO::PARAM_LOB);$insert->execute();}
FileStorage::install($old);FileStorage::install($old);
$migration=require dirname(__DIR__,2).'/packages/php/migrations/0002-file-content-store.php';
$legacy=new ContentStore($root,'legacy');
try{$migration($old,[],'migrate');throw new RuntimeException('Migration without a store accepted');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'legacy'),'Missing store reported');}
$first=$migration($old,['legacy'=>$legacy],'migrate');
check($first['migrated']===4&&$first['failed']===[],'Migration moves every BLOB');
check($migration($old,['legacy'=>$legacy],'migrate')['migrated']===0,'Second migration run changes nothing');
$rows=array_column($old->query("SELECT name,storage_key,sha256,size,width,height,orientation FROM blade_files WHERE kind='file'")->fetchAll(PDO::FETCH_ASSOC),null,'name');
foreach($blobs as $name=>[$mime,$bytes])check($rows[$name]['sha256']===hash('sha256',$bytes)&&hash_file('sha256',$legacy->path($rows[$name]['storage_key']))===hash('sha256',$bytes),'Migrated content identical: '.$name);
check((int)$rows['wide.png']['width']===800&&(int)$rows['wide.png']['height']===400&&$rows['wide.png']['orientation']==='landscape','Migration probes media metadata');
check((int)$old->query("SELECT COUNT(*) FROM blade_tasks WHERE kind='files.thumbnail' AND state='pending'")->fetchColumn()===1,'Migration queues the thumbnail of the image');
$verified=$migration($old,['legacy'=>$legacy],'verify');check($verified['verified']===4&&$verified['failed']===[],'Verification passes');
check($old->query("SELECT COUNT(*) FROM blade_file_content_migration")->fetchColumn()==4,'Ledger records every migrated BLOB');
$legacyStorage=new FileStorage($old,'legacy',$legacy,new Blade\Tasks\TaskQueue($old));
$legacyNote=(int)$old->query("SELECT id FROM blade_files WHERE name='note.txt'")->fetchColumn();
check($legacyStorage->replaceContent($legacyNote,'text/plain',$src("replaced after migration\n")),'Replace after migration');
check($migration($old,['legacy'=>$legacy],'verify')['failed']===[],'Verification passes after a replace (BLOB checked against the ledger)');
$largePath=$legacy->path($rows['large.txt']['storage_key']);$original=file_get_contents($largePath);file_put_contents($largePath,'tampered');
$largeId=(int)$old->query("SELECT id FROM blade_files WHERE name='large.txt'")->fetchColumn();
check($migration($old,['legacy'=>$legacy],'verify')['failed']===[$largeId],'Tampered store file fails verification');
try{$migration($old,['legacy'=>$legacy],'drop');throw new RuntimeException('Drop after failed verification accepted');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'verification'),'Drop refused after failed verification');}
check(in_array('content',array_column($old->query('PRAGMA table_info(blade_files)')->fetchAll(PDO::FETCH_ASSOC),'name'),true),'Content column kept after refusal');
file_put_contents($largePath,$original);
$dropped=$migration($old,['legacy'=>$legacy],'drop');
check((int)$old->query("SELECT COUNT(*) FROM sqlite_master WHERE name='blade_file_content_migration'")->fetchColumn()===0,'Drop removes the ledger');
check($dropped['dropped']===true&&$dropped['verified']===4&&!in_array('content',array_column($old->query('PRAGMA table_info(blade_files)')->fetchAll(PDO::FETCH_ASSOC),'name'),true),'Drop removes the BLOB column after verification');
check($migration($old,['legacy'=>$legacy],'drop')['dropped']===false&&$migration($old,['legacy'=>$legacy],'migrate')['migrated']===0&&$migration($old,['legacy'=>$legacy],'verify')['failed']===[],'Steps after the drop are no-ops');
$remove=function(string $path) use (&$remove):void{if(is_dir($path)&&!is_link($path)){foreach(scandir($path) as $name)if($name!=='.'&&$name!=='..')$remove($path.'/'.$name);rmdir($path);}elseif(file_exists($path)||is_link($path))unlink($path);};
$remove($tmp);
echo "Files PASS\n";

<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Feature\{Action,Registry,Workspace,Context,DownloadStream,Failure,Field,Upload};
use Blade\Files\{ContentStore,FileManagerDefinition,FileStorage,MediaProbe,Thumbnails};
use Blade\Infrastructure\Transaction;
use Blade\Shell\Identity;
// Virtual file manager contract: names, depth, copy/move, conflicts, text editor, upload, ACL, audit,
// content store, media metadata, thumbnails, streaming and the BLOB migration.
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
foreach(['tree','list','create_directory','upload','copy','move','text_get','text_save','content_get','content_stream','thumbnail_get'] as $a)$rule->execute(['1',$a,'ui','all','']);
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
$narrow=new Registry();(new FileManagerDefinition('files','Files','test',['a'=>'Drive A'],desktopOnly:true,contentRoot:$root))->register(new Workspace($narrow,$db));
check($narrow->views()[0]['desktopOnly']===true,'desktopOnly view option');
check($view('1')[0]['files']['upload']["max_size_bytes"]===100&&!isset($view('1')[0]['files']['space']),'Browser metadata only');
check($view('1')[0]['files']['upload']['max_files']===20&&$view('1')[0]['files']['upload']['multiple']===true,'Upload file count in metadata');
foreach([fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A']),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:'relative/files'),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root.'/../x'),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxFiles:21),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxFiles:0),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxSizeBytes:104857601),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,ffmpegPath:'ffmpeg'),fn()=>new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,ffprobePath:'/usr/../bin/ffprobe')] as $invalid){try{$invalid();throw new RuntimeException('Invalid file manager definition accepted');}catch(InvalidArgumentException){}}
$single=new FileManagerDefinition('files','Files','test',['a'=>'A'],contentRoot:$root,maxFiles:1);
check($single->metadata()['upload']['multiple']===false&&$single->metadata()['upload']['max_files']===1&&$single->temporaryRoot()===$root.'/.transfers','Single-file limit and default transfer root');
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
$moved=$call('move',(string)$target['id'],['sources'=>(string)$same1['id'],'decision'=>'overwrite']);
check(count($moved['succeeded'])===1&&$storage->entry($doomed)===null,'Overwriting move removes the target file');
check($stored($doomedKey),'Content stays until the collection task runs');
$tasks->run(100,60);
check(!$stored($doomedKey)&&$stored($same1['storage_key']),'Unreferenced content collected, shared content kept');
$over=$up([$part('files','same-2.txt',"replaced\n")],'overwrite');
check($over['succeeded'][0]['id']===(string)$same2['id']&&(int)$storage->entry((int)$same2['id'])['revision']===2&&$keyOf((string)$same2['id'])!==$same1['storage_key'],'Overwrite replaces the key and bumps the revision');
$tasks->run(100,60);
check($stored($same1['storage_key']),'Old content kept while the copy still references it');
$storage->removeFile((int)$copiedSame['id']);$storage->removeFile((int)$same1['id']);
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
check((new MediaProbe('/nonexistent/ffprobe'))->probe($tmp.'/clip.mp4','video/mp4')===['width'=>null,'height'=>null,'duration_ms'=>null,'orientation'=>''],'Missing probe tool gives empty metadata');
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

// Task queue: bounded retry with backoff, stale-run recovery, one runner per database, dedupe only against pending tasks.
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
$db->exec("UPDATE blade_tasks SET state='running',attempts=1,locked_at='2000-01-01T00:00:00Z' WHERE dedupe='stale'");
$db->exec("UPDATE blade_tasks SET state='running',attempts=3,locked_at='2000-01-01T00:00:00Z' WHERE dedupe='dead'");
$queue->run(10,30);
check($ran===[1]&&$task('stale')['state']==='done'&&$task('dead')['state']==='failed'&&$task('dead')['error']==='Interrupted.','Stale running tasks recovered; exhausted ones fail');
$db->exec("UPDATE blade_task_lease SET holder='other-runner',expires_at='2999-01-01T00:00:00Z' WHERE name='runner'");
$queue->enqueue('test.ok',['n'=>3],'leased');
check($queue->run(10,30)===0&&$task('leased')['state']==='pending'&&$workspace->tasks->run(10,30)===0,'A second runner does nothing while the lease is held');
$db->exec("UPDATE blade_task_lease SET expires_at='2000-01-01T00:00:00Z' WHERE name='runner'");
check($queue->run(10,30)===1&&$ran===[1,3]&&$db->query("SELECT holder FROM blade_task_lease WHERE name='runner'")->fetchColumn()==='','Expired lease taken over and released after the run');
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

// Audit: operation, actor, outcome and related IDs; never contents or names.
$audit=$db->query("SELECT actor_id,action,object_id,outcome,field_names,detail FROM blade_audit WHERE resource='files' ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$copyAudit=array_values(array_filter($audit,fn($r)=>$r['action']==='copy'&&$r['outcome']==='success'))[0];
$detail=json_decode($copyAudit['detail'],true);
check($copyAudit['actor_id']==='1'&&$copyAudit['object_id']===$rootB&&$detail['sources']===[(string)$tree['id']]&&count($detail['succeeded'])===1,'Copy audit with source/target IDs');
check((bool)array_filter($audit,fn($r)=>$r['action']==='text_save'&&$r['outcome']==='rejected'),'Rejected save audited');
check((bool)array_filter($audit,fn($r)=>$r['action']==='upload'&&$r['outcome']==='success'&&json_decode($r['detail'],true)['created']),'Upload audited');
$all=json_encode($audit);
foreach(['edited','hello','over','renamed','leaf','note.txt','clip.mp4','wide.png','identical'] as $secret)check(!str_contains($all,$secret),'Audit excludes content/names: '.$secret);
// Metadata exposes no storage space, SQL or server paths.
check(!str_contains(json_encode($view('1')),$tmp)&&!str_contains(json_encode($view('1')),'blade_files'),'No backend details in metadata');
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

<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Feature\{Action,Context,Failure,Field,Registry,SqlResource,Workspace};
use Blade\Shell\Identity;
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
Blade\Access\Schema::install($db);
$db->exec("CREATE TABLE items(id INTEGER PRIMARY KEY,title TEXT,description TEXT,secret TEXT,archived INTEGER); INSERT INTO items VALUES(1,'One','Full description','hidden',0),(2,'Two','Other description','hidden',0)");
$registry=new Registry();
(new SqlResource('items','items','id',[new Field('title','Title'),new Field('description','Description',type:'textarea'),new Field('secret','Secret',secret:true)]))->register($registry,'Items');
$registry->add(new Action('items','archive','Archive',[],function($ctx,$target){$ctx->db->prepare('UPDATE items SET archived=1 WHERE id=?')->execute([$target['id']]);return [];},resolve:static fn($ctx,$id)=>['id'=>$id],write:true,bulk:true,icon:'dxi dxi-check'));
$registry->view('items','Items',[['id'=>'title','header'=>'Title']],['get','archive'],rowNumbers:false,selection:true);
$workspace=new Workspace($registry,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items','get','ui','allow','all','',''),('user','1','items','get','ui','deny','all','','description'),('user','1','items','archive','ui','allow','id','1','')");
$actor=new Identity('1','Synthetic user',[]);$ctx=new Context($actor,'ui',$workspace->acl,$db);
function check(bool $value,string $message):void{if(!$value)throw new RuntimeException($message);}
$view=$workspace->views($actor)[0];
check(!$view['rowNumbers']&&$view['selection']&&$view['desktopOnly']===false,'View options; desktopOnly defaults to false');
check(array_column($view['detailFields'],'id')===['title','description'],'Details exclude secrets and include non-grid fields');
check($view['actions'][1]['bulk']&&$view['actions'][1]['icon']==='dxi dxi-check','Action metadata');
$row=$workspace->executor->execute($ctx,'items','get','1',[]);
check(!isset($row['description'])&&!isset($row['secret'])&&$row['title']==='One','Get preserves field ACL');
$result=$workspace->executor->bulk($ctx,'items','archive',[['id'=>'1','values'=>[]],['id'=>'2','values'=>[]]]);
check($result[0]['ok']&&!$result[1]['ok'],'Partial success reported');
check($db->query('SELECT archived FROM items WHERE id=1')->fetchColumn()===1&&$db->query('SELECT archived FROM items WHERE id=2')->fetchColumn()===0,'Per-object ACL enforced');
check((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE action='archive'")->fetchColumn()===2,'Success and denial audited');
foreach([
 fn()=>$workspace->executor->bulk($ctx,'items','get',[['id'=>'1','values'=>[]]]),
 fn()=>$workspace->executor->bulk($ctx,'items','archive',[['id'=>'1','values'=>[]],['id'=>'1','values'=>[]]]),
 fn()=>$workspace->executor->bulk(new Context($actor,'api',$workspace->acl,$db,['items.archive']),'items','archive',[['id'=>'1','values'=>[]]]),
 fn()=>$workspace->executor->bulk($ctx,'items','archive',array_fill(0,101,['id'=>'1','values'=>[]])),
] as $reject){try{$reject();throw new RuntimeException('Expected denial');}catch(Failure){}}
try{new Action('items','unsafe','Unsafe',[new Field('password','Password',type:'password')],static fn()=>[],bulk:true);throw new RuntimeException('Secret batch accepted');}catch(InvalidArgumentException){}
// A stale row in a batch cannot overwrite a newer record; other rows still report success.
$revisionRegistry=new Registry();
(new SqlResource('items','items','id',[new Field('title','Title',required:true)]))->register($revisionRegistry,'Items');
$update=$revisionRegistry->get('items','update');
$revisionRegistry->add(new Action('items','rename','Rename',$update->fields,$update->handler,$update->resolve,write:true,bulk:true));
$revisionWorkspace=new Workspace($revisionRegistry,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items','rename','ui','allow','all','','')");
$revisionContext=new Context($actor,'ui',$revisionWorkspace->acl,$db);
$first=$revisionWorkspace->executor->execute($revisionContext,'items','get','1',[]);
$second=$revisionWorkspace->executor->execute($revisionContext,'items','get','2',[]);
$db->exec("UPDATE items SET title='External' WHERE id=1");
$result=$revisionWorkspace->executor->bulk($revisionContext,'items','rename',[
 ['id'=>'1','values'=>['title'=>'Stale','revision'=>$first['revision']]],
 ['id'=>'2','values'=>['title'=>'Renamed','revision'=>$second['revision']]],
]);
check(!$result[0]['ok']&&$result[1]['ok'],'Bulk revision conflict reported independently');
check($db->query('SELECT title FROM items WHERE id=1')->fetchColumn()==='External','Conflict preserves external write');
check($db->query('SELECT title FROM items WHERE id=2')->fetchColumn()==='Renamed','Other row commits');
// Media and icon column presentation: typed options only, never on secret or editable cells.
check(new Field('file','File','select',options:['1'=>'x'],column:['media'=>'files','minWidth'=>200])->column['media']==='files','Media on a select field');
foreach([
 fn()=>new Field('file','File',column:['media'=>'files','presentation'=>'icon']),
 fn()=>new Field('file','File',secret:true,column:['media'=>'files']),
 fn()=>new Field('file','File',column:['media'=>'files','editable'=>true]),
 fn()=>new Field('file','File','textarea',column:['media'=>'files']),
 fn()=>new Field('file','File','multiselect',options:['1'=>'x'],column:['media'=>'files']),
 fn()=>new Field('file','File','password',column:['media'=>'files']),
 fn()=>new Field('file','File',column:['media'=>'Files!']),
 fn()=>new Field('file','File',column:['media'=>7]),
 fn()=>new Field('kind','Kind',column:['presentation'=>'image']),
 fn()=>new Field('kind','Kind',column:['presentation'=>'icon','editable'=>true]),
 fn()=>new Field('kind','Kind','number',column:['presentation'=>'icon']),
 fn()=>new Field('kind','Kind',secret:true,column:['presentation'=>'icon']),
 fn()=>new Field('kind','Kind',column:['presentation'=>'icon']),
 fn()=>new Field('kind','Kind','select',options:fn()=>['dxi dxi-file'=>'Fájl'],column:['presentation'=>'icon']),
 fn()=>new Field('kind','Kind','select',options:['dxi dxi-file'=>''],column:['presentation'=>'icon']),
 fn()=>new Field('kind','Kind','select',options:['Fájl'],column:['presentation'=>'icon']),
] as $invalid){try{$invalid();throw new RuntimeException('Invalid media/icon column accepted');}catch(InvalidArgumentException $e){check($e->getMessage()!=='Invalid media/icon column accepted','Invalid media/icon column rejected');}}
$icon=new Field('kind','Kind','select',options:['dxi dxi-folder'=>'Mappa','dxi dxi-file'=>'Fájl'],column:['presentation'=>'icon','width'=>48]);
check(new Field('file','File','number',column:['media'=>'files'])->column['media']==='files','Media on a number field');
// View presentation: row height, tile width and tiles reach the wire; absent keys keep client defaults; ranges are enforced.
$mediaRegistry=new Registry();
$assets=new SqlResource('assets','items','id',[new Field('title','Title'),$icon,new Field('file','File','number',column:['media'=>'files'])]);
$assets->register($mediaRegistry,'Assets',rowHeight:56,tileMinWidth:200,tiles:true);$assets->registerDelete($mediaRegistry);
$mediaWorkspace=new Workspace($mediaRegistry,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','assets','list','ui','allow','all','',''),('user','1','assets','get','ui','allow','all','','')");
$mediaView=$mediaWorkspace->views($actor)[0];
check($mediaView['rowHeight']===56&&$mediaView['tileMinWidth']===200&&$mediaView['tiles']===true,'View presentation survives registerDelete and reaches the wire');
$columns=array_column($mediaView['columns'],null,'id');
$details=array_column($mediaView['detailFields'],null,'id');
check($details['file']['media']==='files'&&$details['kind']['presentation']==='icon'&&$details['kind']['options']['dxi dxi-file']==='Fájl'&&!isset($details['title']['media'])&&!isset($details['title']['presentation'])&&!isset($details['kind']['width']),'Detail fields carry media and icon presentation only');
check($columns['file']['media']==='files'&&$columns['file']['type']==='number'&&$columns['kind']['presentation']==='icon'&&$columns['kind']['options']['dxi dxi-file']==='Fájl','Media and icon column options reach the wire');
check(!isset($view['rowHeight'])&&!isset($view['tileMinWidth'])&&!isset($view['tiles']),'Presentation keys absent by default');
foreach([['rowHeight'=>31],['rowHeight'=>161],['tileMinWidth'=>119],['tileMinWidth'=>481]] as $options){try{$mediaRegistry->view('assets','Assets',[],['get'],...$options);throw new RuntimeException('Out-of-range view presentation accepted');}catch(InvalidArgumentException){}}
$mediaRegistry->view('assets','Assets',[],['get'],rowHeight:32,tileMinWidth:480);$mediaRegistry->view('assets','Assets',[],['get'],rowHeight:160,tileMinWidth:120);
check($mediaRegistry->views()[0]['rowHeight']===160&&!isset($mediaRegistry->views()[0]['tiles']),'Range bounds accepted; tiles off is absent');
echo "List presentation and bulk ACL contracts passed.\n";

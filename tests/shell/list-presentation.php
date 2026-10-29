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
check(!$view['options']['rowNumbers']&&$view['options']['selection']&&$view['desktopOnly']===false,'View options; desktopOnly defaults to false');
check(array_column($view['options']['detailFields'],'id')===['title','description'],'Details exclude secrets and include non-grid fields');
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
check($mediaView['options']['rowHeight']===56&&$mediaView['options']['tileMinWidth']===200&&$mediaView['options']['tiles']===true,'View presentation survives registerDelete and reaches the wire');
$columns=array_column($mediaView['options']['columns'],null,'id');
$details=array_column($mediaView['options']['detailFields'],null,'id');
check($details['file']['media']==='files'&&$details['kind']['presentation']==='icon'&&$details['kind']['options']['dxi dxi-file']==='Fájl'&&!isset($details['title']['media'])&&!isset($details['title']['presentation'])&&!isset($details['kind']['width']),'Detail fields carry media and icon presentation only');
check($columns['file']['media']==='files'&&$columns['file']['type']==='number'&&$columns['kind']['presentation']==='icon'&&$columns['kind']['options']['dxi dxi-file']==='Fájl','Media and icon column options reach the wire');
check(!isset($view['options']['rowHeight'])&&!isset($view['options']['tileMinWidth'])&&!isset($view['options']['tiles']),'Presentation keys absent by default');
foreach([['rowHeight'=>31],['rowHeight'=>161],['tileMinWidth'=>119],['tileMinWidth'=>481]] as $options){try{$mediaRegistry->view('assets','Assets',[],['get'],...$options);throw new RuntimeException('Out-of-range view presentation accepted');}catch(InvalidArgumentException){}}
$mediaRegistry->view('assets','Assets',[],['get'],rowHeight:32,tileMinWidth:480);$mediaRegistry->view('assets','Assets',[],['get'],rowHeight:160,tileMinWidth:120);
check($mediaRegistry->views()[0]->options['rowHeight']===160&&!isset($mediaRegistry->views()[0]->options['tiles']),'Range bounds accepted; tiles off is absent');
// Static image column: option validation, the single-file-name rule and the server-side projection.
check(Field::imageFile('a-b_c.1.PNG')&&Field::imageFile('x.svg')&&Field::imageFile('x.JpEg')&&Field::imageFile('x.webp')&&Field::imageFile('x.gif')&&Field::imageFile('x.jpg'),'Image file names accepted');
foreach(['','a','a.exe','a.png.exe','../a.png','a/../a.png','dir/a.png','dir\\a.png','/a.png','https://x.test/a.png','data:image/png;base64,AAAA','.png','.hidden.png','a..png','a b.png',"a.png\n",'a.png?x=1','a%2fb.png',str_repeat('a',256).'.png',null,7] as $bad)check(!Field::imageFile($bad),'Image file name rejected: '.var_export($bad,true));
$image=new Field('image','Kép',column:['presentation'=>'image','image_base'=>'../demo-images/','alt_of'=>'title']);
check($image->image()&&!(new Field('title','Title'))->image(),'Image presentation flag');
check((new Field('image','Kép',column:['presentation'=>'image','imageBase'=>'/img/','altOf'=>'title','width'=>96]))->image(),'camelCase image options, abs path');
foreach([
 fn()=>new Field('image','Kép',column:['presentation'=>'image']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'img']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'//evil.test/']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'https://evil.test/']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'a/../b/']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'a b/']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>7]),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','imageBase'=>'img/','image_base'=>'img/']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'img/','alt_of'=>'Title']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'img/','media'=>'files']),
 fn()=>new Field('image','Kép',column:['presentation'=>'image','image_base'=>'img/','editable'=>true]),
 fn()=>new Field('image','Kép',secret:true,column:['presentation'=>'image','image_base'=>'img/']),
 fn()=>new Field('image','Kép','select',options:['a.png'=>'A'],column:['presentation'=>'image','image_base'=>'img/']),
 fn()=>new Field('image','Kép','number',column:['presentation'=>'image','image_base'=>'img/']),
 fn()=>new Field('image','Kép','textarea',column:['presentation'=>'image','image_base'=>'img/']),
 fn()=>new Field('image','Kép',options:['dxi dxi-file'=>'Fájl'],column:['presentation'=>'image','image_base'=>'img/']),
 fn()=>new Field('image','Kép',column:['image_base'=>'img/']),
 fn()=>new Field('image','Kép',column:['alt_of'=>'title']),
 fn()=>new Field('kind','Kind','select',options:['dxi dxi-file'=>'Fájl'],column:['presentation'=>'icon','image_base'=>'img/']),
 fn()=>new Field('image','Kép',column:['presentation'=>'bitmap','image_base'=>'img/']),
] as $invalid){try{$invalid();throw new RuntimeException('Invalid image column accepted');}catch(InvalidArgumentException $e){check($e->getMessage()!=='Invalid image column accepted','Invalid image column rejected');}}
check($image->validate('a.png')==='a.png','Image field accepts a file name');
foreach(['../a.png','https://x.test/a.png','a.exe'] as $bad){try{$image->validate($bad);throw new RuntimeException('Bad image value accepted');}catch(Failure $e){check($e->getMessage()!=='Bad image value accepted','Image field write rejects '.$bad);}}
check($image->validate('')==='','Empty image value allowed');
$db->exec("CREATE TABLE gallery(id INTEGER PRIMARY KEY,image TEXT NOT NULL,title TEXT NOT NULL); INSERT INTO gallery VALUES (1,'ok.svg','Ok'),(2,'../x.png','Parent'),(3,'https://example.test/a.png','Scheme'),(4,'a.exe','Ext'),(5,'dir/a.png','Dir'),(6,'MISSING.PNG','Missing')");
$galleryRegistry=new Registry();$gallery=new SqlResource('gallery','gallery','id',[$image,new Field('title','Title')]);
$gallery->register($galleryRegistry,'Gallery');
$galleryWorkspace=new Workspace($galleryRegistry,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','gallery','list','ui','allow','all','',''),('user','1','gallery','get','ui','allow','all','','')");
$galleryView=$galleryWorkspace->views($actor)[0];
$galleryColumns=array_column($galleryView['options']['columns'],null,'id');$galleryDetails=array_column($galleryView['options']['detailFields'],null,'id');
check($galleryColumns['image']['presentation']==='image'&&$galleryColumns['image']['image_base']==='../demo-images/'&&$galleryColumns['image']['alt_of']==='title','Image column options reach the wire');
check($galleryDetails['image']['presentation']==='image'&&$galleryDetails['image']['image_base']==='../demo-images/'&&$galleryDetails['image']['alt_of']==='title'&&!isset($galleryDetails['title']['presentation']),'Detail fields carry the image options');
$galleryCtx=new Context($actor,'ui',$galleryWorkspace->acl,$db);
$listed=$galleryWorkspace->executor->execute($galleryCtx,'gallery','list',null,[]);
check(array_column($listed,'image','id')==['1'=>'ok.svg','2'=>'','3'=>'','4'=>'','5'=>'','6'=>'MISSING.PNG'],'Server list blanks values that are not plain image file names');
// Usage warnings on a SqlResource delete (U5): preview through the bulk channel, clear on apply, after_delete only.
$db->exec("CREATE TABLE shelves(id INTEGER PRIMARY KEY,title TEXT NOT NULL); INSERT INTO shelves VALUES(1,'Used'),(2,'Free'),(3,'Guarded'); CREATE TABLE books(id INTEGER PRIMARY KEY,shelf_id TEXT NOT NULL); INSERT INTO books(shelf_id) VALUES('1'),('1'),('3')");
$hooks=['save'=>[],'delete'=>[]];
$shelves=new SqlResource('shelves','shelves','id',[new Field('title','Title',required:true)],afterSave:function(Context $c,string $id) use (&$hooks){$hooks['save'][]=$id;return null;},
    deleteGuard:static function(Context $c,array $target):void{if($target['id']==='3')throw new Failure('Guarded.',409);},afterDelete:function(Context $c,string $id,array $target) use (&$hooks){$hooks['delete'][]=$id.':'.$target['row']['title'];});
$usageRegistry=new Registry();$shelves->register($usageRegistry,'Shelves');$shelves->registerDelete($usageRegistry);
$books=new class implements Blade\Feature\UsageProvider{
    public array $cleared=[];
    public function usages(Context $ctx,array $ids):array{$out=[];foreach($ids as $id){$n=(int)$ctx->db->query('SELECT COUNT(*) FROM books WHERE shelf_id='.$ctx->db->quote($id))->fetchColumn();if($n)$out[$id]=[['label'=>'Könyvek','count'=>$n]];}return $out;}
    public function clear(Context $ctx,array $ids,string $policy):void{$this->cleared[]=[$policy,$ids];foreach($ids as $id)$ctx->db->prepare('DELETE FROM books WHERE shelf_id=?')->execute([$id]);}
};
$usageWorkspace=new Workspace($usageRegistry,$db);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','shelves','list','ui','allow','all','',''),('user','1','shelves','get','ui','allow','all','',''),('user','1','shelves','update','ui','allow','all','',''),('user','1','shelves','delete','ui','allow','all','','')");
$usageCtx=new Context($actor,'ui',$usageWorkspace->acl,$db);
$deleteMeta=fn()=>array_column($usageWorkspace->views($actor)[0]['actions'],null,'name')['delete'];
check(!isset($deleteMeta()['usages'])&&array_column($deleteMeta()['fields'],'name')===['revision'],'No usages flag without providers; preview is no form field');
$usageRegistry->usage('shelves',$books);
check($deleteMeta()['usages']===true&&array_column($deleteMeta()['fields'],'name')===['revision'],'Delete announces usages');
$rev=fn(string $id)=>$usageWorkspace->executor->execute($usageCtx,'shelves','get',$id,[])['revision'];
$preview=$usageWorkspace->executor->bulk($usageCtx,'shelves','delete',[['id'=>'1','values'=>['revision'=>$rev('1'),'preview'=>'1']],['id'=>'2','values'=>['revision'=>$rev('2'),'preview'=>'1']],['id'=>'3','values'=>['revision'=>$rev('3'),'preview'=>'1']]]);
check($preview[0]['data']===['count'=>1,'usages'=>[['label'=>'Könyvek','count'=>2]]]&&$preview[1]['data']===['count'=>1,'usages'=>[]]&&!$preview[2]['ok']&&$preview[2]['error']==='Guarded.','Bulk preview data per object; the delete guard already answers the preview');
check((int)$db->query('SELECT COUNT(*) FROM shelves')->fetchColumn()===3&&$books->cleared===[]&&$hooks['delete']===[],'Preview changes nothing and calls no hook');
$applied=$usageWorkspace->executor->bulk($usageCtx,'shelves','delete',[['id'=>'1','values'=>['revision'=>$rev('1')]],['id'=>'2','values'=>['revision'=>$rev('2')]]]);
check($applied[0]['data']['cleared']===['Könyvek'=>2]&&$applied[1]['data']['cleared']===[]&&$applied[0]['data']['policy']==='delete','Applied delete reports what it cleared');
check($books->cleared===[['delete',['1']],['delete',['2']]]&&(int)$db->query("SELECT COUNT(*) FROM books WHERE shelf_id='1'")->fetchColumn()===0&&(int)$db->query('SELECT COUNT(*) FROM shelves')->fetchColumn()===1,'Providers clear inside the delete');
check($hooks['delete']===['1:Used','2:Free']&&$hooks['save']===[],'after_delete runs after a delete; after_save never does');
$usageWorkspace->executor->execute($usageCtx,'shelves','update','3',['title'=>'Renamed','revision'=>$rev('3')]);check($hooks['save']===['3'],'after_save still runs on update');
check($db->query("SELECT COUNT(*) FROM blade_audit WHERE resource='shelves' AND action='delete_preview' AND outcome='success'")->fetchColumn()>0&&json_decode($db->query("SELECT detail FROM blade_audit WHERE resource='shelves' AND action='delete' AND outcome='success' ORDER BY id LIMIT 1")->fetchColumn(),true)['policy']==='delete','Preview journaled as delete_preview; the first delete success is an applied delete');
// Derived media columns name a media field of the resource and a part; they are no fields themselves.
$mediaRegistry->view('assets','Assets',[['id'=>'file','header'=>'File'],['id'=>'m_type','header'=>'Type','media_of'=>'file','part'=>'type'],['id'=>'m_size','header'=>'Resolution','media_of'=>'file','part'=>'resolution']],['get']);
check(array_column($mediaRegistry->views()[0]->options['columns'],'part')===['type','resolution'],'Derived media columns kept');
foreach([[['id'=>'x','media_of'=>'title','part'=>'type']],[['id'=>'x','media_of'=>'file','part'=>'size']],[['id'=>'x','media_of'=>'missing','part'=>'type']],[['id'=>'title','media_of'=>'file','part'=>'type']],[['id'=>'x','part'=>'duration']]] as $columns){try{$mediaRegistry->view('assets','Assets',$columns,['get']);throw new RuntimeException('Invalid derived media column accepted');}catch(InvalidArgumentException $e){check($e->getMessage()==='Invalid derived media column.','Invalid derived media column rejected');}}
echo "List presentation, bulk ACL and delete usage contracts passed.\n";

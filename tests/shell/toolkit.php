<?php
declare(strict_types=1);
// Toolkit kernel, server side (docs/toolkit.md): View builders and kind providers, the view-id rule, record views,
// the activation map and project modules/stylesheets.
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Feature\{Context,Failure,Field,GenericViewKind,Registry,SqlResource,View,ViewKindProvider,ViewLayout,Workspace};
use Blade\Navigation\Menu;
use Blade\Shell\{Application,ApplicationDefinition,Identity,IdentityProvider,Skin};

function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function rejects(callable $fn,string $message):void{try{$fn();}catch(InvalidArgumentException){return;}throw new RuntimeException($message);}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Blade\Access\Schema::install($db);
$db->exec('CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, title TEXT, kind TEXT, note TEXT, secret TEXT)');
$db->exec("INSERT INTO assets (owner_id,title,kind,note,secret) VALUES ('1','Hang','audio','a','s'),('2','Kép','image','b','s')");
$db->exec('CREATE TABLE tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_id TEXT)');
$grant=function(string $actor,string $resource,string $action,string $scope='all',string $effect='allow',string $field='')use($db):void{
    $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,'ui',?,?,'',?)")->execute([$actor,$resource,$action,$effect,$scope,$field]);
};
$resource=fn()=>new SqlResource('assets','assets','id',[new Field('title','Cím'),new Field('kind','Fajta','select',options:['audio'=>'Hang','image'=>'Kép']),new Field('note','Megjegyzés'),new Field('secret','Titok',secret:true)],'owner_id');
$columns=[['id'=>'title','header'=>'Cím'],['id'=>'kind','header'=>'Fajta']];
$identities=new class implements IdentityProvider{
    public function authenticate(string $username,#[\SensitiveParameter] string $password):?Identity{return null;}
    public function find(string $id):?Identity{return $id==='1'?new Identity('1','Egy'):null;}
};

// Builders return Views of the built-in kinds; the kind's payload is in `options`.
$registry=new Registry();
$list=$resource()->register($registry,'Médiatár',tiles:true);
check($list instanceof View&&$list->id==='assets'&&$list->kind==='list'&&$list->resource==='assets'&&$list->actions===['get','create','update']&&$list->options['tiles']===true&&$list->options['layout'] instanceof ViewLayout&&$list->record===null&&$list->open==='page','SqlResource::register() returns the list View');
check($registry->viewById('assets')===$list&&$registry->views()===[$list],'The View is registered under its id');
$second=$registry->view('assets','Hangok',$columns,['get'],id:'assets.audio');
check($second->id==='assets.audio'&&count($registry->views())===2&&array_keys($second->options)===['columns','singleton','layout','rowNumbers','selection','rowSelection'],'A resource can have several views; builder option payload');
rejects(fn()=>$registry->view('assets','X',[],['get'],id:'Assets'),'Invalid view id accepted');
rejects(fn()=>$registry->view('assets','',[],['get']),'Empty title accepted');
try{$registry->view('assets','X',[],['missing']);throw new RuntimeException('Unknown action accepted');}catch(Failure){}

// View-id rule: a later declaration with the same id replaces the earlier one and keeps its menu position.
$registry->view('assets','Átnevezve',$columns,['get','update'],icon:'dxi dxi-key');
check(array_column($registry->views(),'id')===['assets','assets.audio']&&$registry->viewById('assets')->title==='Átnevezve'&&$registry->viewById('assets')->icon==='dxi dxi-key','Same id replaces and keeps the position');
(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset')]))->register($registry,'Sávok');
$registry->subview('assets','tracks','asset_id');
check($registry->embedded('tracks')&&$registry->subviewOf('assets')==['child'=>'tracks','field'=>'asset_id'],'Sub-view by view ids embeds the child');
$registry->view('assets','Médiatár',$columns,['get','update']);
check($registry->subviewOf('assets')===null&&!$registry->embedded('tracks'),'A replaced view loses the sub-view attached before it');
$registry->subview('assets','assets.audio','kind');
check($registry->viewById('assets')->options['subview']['child']==='assets'&&!$registry->embedded('assets.audio'),'A child view of the same resource is a hierarchy');
$registry->view('assets','Médiatár',$columns,['get','update']);
rejects(fn()=>$registry->addView($registry->viewById('assets')->with(options:[...$registry->viewById('assets')->options,'subview'=>['child'=>'assets.audio','field'=>'kind']])),'Sub-view smuggled through options');

// Activation map: validated at definition time; `view:` targets once every view is declared.
$map=['field'=>'kind','map'=>['audio'=>'view:demo.player','*'=>'details']];
foreach([
    ['field'=>'missing','map'=>['a'=>'details']],['field'=>'secret','map'=>['a'=>'details']],['field'=>'kind','map'=>[]],
    ['field'=>'kind'],['field'=>'kind','map'=>['a'=>'details'],'extra'=>1],['field'=>'kind','map'=>['a'=>true]],
    ['field'=>'kind','map'=>['a'=>'create']],['field'=>'kind','map'=>['a'=>'missing']],['field'=>'kind','map'=>['a'=>'view:Bad id']],
    ['field'=>'kind','map'=>[''=>'details']],
] as $invalid)rejects(fn()=>$registry->view('assets','X',$columns,['get','update'],activate:$invalid),'Invalid activation map accepted: '.json_encode($invalid));
rejects(fn()=>$registry->view('assets','X',$columns,['get'],singleton:true,activate:$map),'Activation map on a singleton accepted');
$registry->view('assets','Médiatár',$columns,['get','update'],activate:$map);
rejects(fn()=>$registry->checkViews(),'A view: target without a record view accepted');
rejects(fn()=>new ApplicationDefinition('X',$identities,new Menu([]),sys_get_temp_dir(),workspace:new Workspace($registry,$db)),'ApplicationDefinition accepted a missing record view');
$registry->view('assets','Médiatár',$columns,['get','update'],activate:['field'=>'kind','map'=>['image'=>'page']]);
rejects(fn()=>$registry->subview('assets','tracks','asset_id'),'Page activation in a map over an embedded child accepted');
$registry->subview('assets','tracks','asset_id',embed:false);

// Record views: project kinds only, with the record resource's `get`.
rejects(fn()=>$registry->addView(new View('assets.files','files','X','assets',record:'assets',actions:['get'],options:['mounts'=>[]])),'Built-in kind with record accepted');
rejects(fn()=>$registry->addView(new View('demo.player','demo.player','Lejátszó',record:'missing')),'Record view without a get action accepted');
rejects(fn()=>$registry->addView(new View('demo.bad','unknown','X')),'Undotted project kind accepted');
$registry->addView(new View('demo.player','demo.player','Lejátszó','assets',record:'assets',actions:['get'],options:['loop'=>true,'label'=>'Lejátszás'],open:'window'));
$registry->view('assets','Médiatár',$columns,['get','update'],activate:$map);
$registry->view('assets','Hangok',$columns,['get','update'],id:'assets.audio',activate:['field'=>'kind','map'=>['0'=>'details','1'=>'update']]);
$registry->checkViews();
$other=new Registry();
$other->add(new Blade\Feature\Action('other','get','Megnyitás',[],static fn()=>[],resolve:static fn($c,$id)=>['id'=>$id]));
$other->add(new Blade\Feature\Action('other','list','Lista',[],static fn()=>[],collection:true));
$other->addView(new View('demo.player','demo.player','Lejátszó',record:'other'));
$resource()->register($other,'Médiatár',activate:['field'=>'kind','map'=>['audio'=>'view:demo.player']]);
rejects(fn()=>$other->checkViews(),'A view: target for another resource accepted');

// Bootstrap metadata (docs/toolkit.md mapping table).
$workspace=new Workspace($registry,$db);
foreach(['list','get','update'] as $action)$grant('1','assets',$action,$action==='list'?'all':'own');
$grant('1','assets','get','all','deny','note');
foreach(['list','update'] as $action)$grant('2','assets',$action);
$views=array_column($workspace->views(new Identity('1','Egy')),null,'id');
check(array_keys($views)===['assets','assets.audio','demo.player'],'Offered views in declaration order');
check(array_keys($views['assets'])===['id','kind','title','resource','actions','group','icon','desktopOnly','open','options']&&$views['assets']['kind']==='list'&&$views['assets']['open']==='page','List view top-level keys');
check(array_keys($views['demo.player'])===['id','kind','title','resource','record','actions','group','icon','desktopOnly','open','options']&&$views['demo.player']['open']==='window','Record view top-level keys');
check(array_keys($views['assets']['options'])===['columns','detailFields','singleton','layout','rowNumbers','selection','rowSelection','activate','filters','sortable'],'List options keys');
$json=json_encode($views,JSON_THROW_ON_ERROR);
check(str_contains($json,'"activate":{"field":"kind","map":{"audio":"view:demo.player","*":"details"}}')&&str_contains($json,'"map":{"0":"details","1":"update"}'),'Activation maps are JSON objects');
check($views['demo.player']['options']===['loop'=>true,'label'=>'Lejátszás']&&array_column($views['demo.player']['actions'],'name')===['get'],'Generic provider passes options and offered actions');
$reader=array_column($workspace->views(new Identity('2','Kettő')),'id');
check($reader===['assets','assets.audio'],'Record view needs the record resource get offered');
check($workspace->views(new Identity('3','Három'))===[],'No offered action, no view');
// The record row is the record resource's `get`: object ACL and field ACL apply.
$ctx=new Context(new Identity('1','Egy'),'ui',$workspace->acl,$db);
$row=$workspace->executor->execute($ctx,'assets','get','1',[]);
check($row['title']==='Hang'&&!array_key_exists('note',$row)&&!array_key_exists('secret',$row),'Record row through get with field ACL');
try{$workspace->executor->execute($ctx,'assets','get','2',[]);throw new RuntimeException('Foreign record read');}catch(Failure $e){check($e->status===403,'Record outside the object ACL refused');}
// A tenant-scoped record resource offers no record view without an active tenant.
$scoped=new Registry();
$scopedResource=new SqlResource('scoped','assets','id',[new Field('title','Cím')],tenantColumn:'tenant_id');$scopedResource->register($scoped,'Scoped');
$scoped->addView(new View('demo.scoped','demo.player','Scoped',record:'scoped'));
$grant('1','scoped','get');
check((new Workspace($scoped,$db))->views(new Identity('1','Egy'))===[],'Tenant-scoped record view hidden without a tenant');

// Generic provider: JSON-safe map of at most 64 KiB; visibility by declared actions.
$generic=fn(array $options)=>$registry->addView(new View('demo.generic','demo.generic','Generic',options:$options));
foreach([['o'=>new stdClass()],['f'=>static fn()=>1],['n'=>NAN],['i'=>INF],['s'=>"\xff"],[1,2],['d'=>array_reduce(range(1,40),fn($c)=>[$c],1)]] as $unsafe)rejects(fn()=>$generic($unsafe),'Unsafe options accepted');
$generic(['blob'=>str_repeat('a',GenericViewKind::MAX_BYTES-11)]);
rejects(fn()=>$generic(['blob'=>str_repeat('a',GenericViewKind::MAX_BYTES-10)]),'Options over 64 KiB accepted');
$generic([]);
$registry->addView(new View('demo.writer','demo.generic','Writer','assets',actions:['update']));
$third=array_column($workspace->views(new Identity('3','Három')),null,'id');
check(array_keys($third)===['demo.generic']&&json_encode($third['demo.generic']['options'])==='{}','A project view without actions is always offered; empty options stay an object');
check(isset(array_column($workspace->views(new Identity('2','Kettő')),null,'id')['demo.writer']),'A project view with an offered action is offered');

// Project kind providers: dotted names, no duplicates, registered before their views.
rejects(fn()=>$registry->kind('list',new class implements ViewKindProvider{public function validate(Registry $r,View $v):void{}public function metadata(Context $c,View $v):?array{return null;}}),'Built-in kind overridden');
rejects(fn()=>$registry->kind('nodot',new class implements ViewKindProvider{public function validate(Registry $r,View $v):void{}public function metadata(Context $c,View $v):?array{return null;}}),'Undotted kind accepted');
rejects(fn()=>$registry->kind('demo.generic',new class implements ViewKindProvider{public function validate(Registry $r,View $v):void{}public function metadata(Context $c,View $v):?array{return null;}}),'Kind registered after its views');
$provider=new class implements ViewKindProvider{
    public array $validated=[];
    public function validate(Registry $r,View $v):void{if(($v->options['ok']??false)!==true)throw new InvalidArgumentException('not ok');$this->validated[]=$v->id;}
    public function metadata(Context $c,View $v):?array{return $c->actor->id==='1'?['actions'=>[],'options'=>['server'=>'computed']]:null;}
};
$registry->kind('demo.custom',$provider);
rejects(fn()=>$registry->kind('demo.custom',$provider),'Duplicate kind accepted');
rejects(fn()=>$registry->addView(new View('demo.custom','demo.custom','Custom')),'Custom validation skipped');
$registry->addView(new View('demo.custom','demo.custom','Custom',options:['ok'=>true]));
check($provider->validated===['demo.custom']&&(array_column($workspace->views(new Identity('1','Egy')),null,'id')['demo.custom']['options']??null)===['server'=>'computed']&&!in_array('demo.custom',array_column($workspace->views(new Identity('3','Három')),'id'),true),'A registered provider validates and decides the metadata');

// Modules and stylesheets: same-origin paths, versioned, signed-in pages only.
$definition=fn(array $modules=[],array $stylesheets=[],string $version='1.4.0',string $runtime='')=>new ApplicationDefinition('Toolkit',$identities,new Menu([]),$runtime?:sys_get_temp_dir(),sessionName:'blade_toolkit',version:$version,modules:$modules,stylesheets:$stylesheets,skins:static fn()=>[new Skin('brand','Brand','skins/brand.css')]);
$app=$definition(['app/main.js','/app/root.mjs','../app/up.js?v=2'],['app/main.css']);
check($app->versioned('app/main.js')==='app/main.js?v=1.4.0'&&$app->versioned('../app/up.js?v=2')==='../app/up.js?v=2'&&$definition([],[],'')->versioned('app/main.js')==='app/main.js','Version suffix unless a cache key or no version');
foreach([['https://cdn.example.test/x.js'],['//cdn.example.test/x.js'],['app/../x.js'],['app/main.ts'],['app/x.css'],['app/main.js?v=<x>'],['app/ma in.js'],['data:text/javascript,1'],['a'=>'app/x.js'],['app/x.js','app/x.js'],[1],['app/x.min.js']] as $bad)
    rejects(fn()=>$definition($bad),'Invalid module path accepted: '.json_encode($bad));
foreach([['app/x.js'],['https://cdn.example.test/x.css'],['app/x.css','app/x.css']] as $bad)rejects(fn()=>$definition([],$bad),'Invalid stylesheet path accepted: '.json_encode($bad));
$runtime=dirname(__DIR__,2).'/tmp/toolkit-shell';
$render=function(ApplicationDefinition $definition):string{
    $_SERVER['REQUEST_METHOD']='GET';ob_start();(new Application($definition))->run();return (string)ob_get_clean();
};
$shell=$definition(['app/main.js','../app/up.js?v=2'],['app/main.css'],runtime:$runtime);
$page=$render($shell);
$bootstrap=fn(string $page)=>json_decode(html_entity_decode((string)preg_replace('~^.*<script type="application/json" id="blade-config">(.*?)</script>.*$~s','$1',$page)),true,flags:JSON_THROW_ON_ERROR);
check(!str_contains($page,'app/main.css')&&!isset($bootstrap($page)['modules'])&&$bootstrap($page)['authenticated']===false,'Sign-in page loads no project modules or stylesheets');
session_start();$_SESSION['identity']='1';$_COOKIE['blade_toolkit']=session_id();session_write_close();
$page=$render($shell);
$css=strpos($page,'href="app/main.css?v=1.4.0"');
check($bootstrap($page)['authenticated']===true&&$css!==false&&$css>strpos($page,'admin.css')&&$css>strpos($page,'skins/brand.css'),'Signed-in page links the project stylesheet after framework CSS and skins');
check($bootstrap($page)['modules']===['app/main.js?v=1.4.0','../app/up.js?v=2'],'Signed-in bootstrap lists the versioned modules');
check(!isset($bootstrap($render($definition(runtime:$runtime)))['modules']),'No modules key without declared modules');
array_map('unlink',glob($runtime.'/sessions/*')?:[]);

echo "61ade toolkit server contracts passed.\n";

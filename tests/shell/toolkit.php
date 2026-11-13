<?php
declare(strict_types=1);
// Toolkit kernel, server side (docs/toolkit.md): View builders and kind providers, the view-id rule, record views,
// the activation map, project modules/stylesheets and the sign-in branding.
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

// View-id rule: a second declaration of an id throws; updateView() changes the declared view and keeps its menu position.
rejects(fn()=>$registry->view('assets','Átnevezve',$columns,['get','update']),'A duplicate view id accepted');
rejects(fn()=>$registry->addView(new View('assets.audio','demo.player','X')),'A duplicate view id of another kind accepted');
rejects(fn()=>$resource()->register($registry,'Újra'),'A second SqlResource::register() of the same view id accepted');
$registry->updateView(View::list('assets','Átnevezve',$columns,['get','update'],icon:'dxi dxi-key'));
check(array_column($registry->views(),'id')===['assets','assets.audio']&&$registry->viewById('assets')->title==='Átnevezve'&&$registry->viewById('assets')->icon==='dxi dxi-key','updateView() changes the view in place');
rejects(fn()=>$registry->updateView(View::list('assets','X',$columns,['get'],id:'assets.missing')),'An update of an undeclared view accepted');
rejects(fn()=>$registry->updateView(new View('assets','demo.player','X','assets')),'An update that changes the kind accepted');
try{$registry->updateView(View::list('assets','X',$columns,['missing']));throw new RuntimeException('An update with an unknown action accepted');}catch(Failure){}
// Sub-views (a registry of their own): an update keeps the attached sub-view, which options cannot smuggle in.
$tree=new Registry();$resource()->register($tree,'Médiatár');$tree->view('assets','Hangok',$columns,['get'],id:'assets.audio');
(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset')]))->register($tree,'Sávok');
$tree->subview('assets','tracks','asset_id');
check($tree->embedded('tracks')&&$tree->subviewOf('assets')==['child'=>'tracks','field'=>'asset_id'],'Sub-view by view ids embeds the child');
$tree->updateView(View::list('assets','Médiatár',$columns,['get','update']));
check($tree->subviewOf('assets')==['child'=>'tracks','field'=>'asset_id']&&$tree->embedded('tracks'),'An updated view keeps its sub-view');
rejects(fn()=>$tree->updateView(View::list('assets','X',$columns,['get'],activate:'page')),'Page activation over an embedded child accepted through an update');
rejects(fn()=>$tree->updateView(View::list('assets','X',$columns,['get'],singleton:true)),'A singleton update of a sub-view parent accepted');
rejects(fn()=>$tree->addView($tree->viewById('assets')->with(id:'assets.copy')),'Sub-view smuggled through options');
$hierarchy=new Registry();$resource()->register($hierarchy,'Médiatár');$hierarchy->view('assets','Hangok',$columns,['get'],id:'assets.audio');
$hierarchy->subview('assets','assets.audio','kind');
check($hierarchy->viewById('assets')->options['subview']['child']==='assets'&&!$hierarchy->embedded('assets.audio'),'A child view of the same resource is a hierarchy');

// Activation map: validated at definition time; `view:` targets once every view is declared.
$map=['field'=>'kind','map'=>['audio'=>'view:demo.player','*'=>'details']];
foreach([
    ['field'=>'missing','map'=>['a'=>'details']],['field'=>'secret','map'=>['a'=>'details']],['field'=>'kind','map'=>[]],
    ['field'=>'kind'],['field'=>'kind','map'=>['a'=>'details'],'extra'=>1],['field'=>'kind','map'=>['a'=>true]],
    ['field'=>'kind','map'=>['a'=>'create']],['field'=>'kind','map'=>['a'=>'missing']],['field'=>'kind','map'=>['a'=>'view:Bad id']],
    ['field'=>'kind','map'=>[''=>'details']],
] as $invalid)rejects(fn()=>$registry->updateView(View::list('assets','X',$columns,['get','update'],activate:$invalid)),'Invalid activation map accepted: '.json_encode($invalid));
rejects(fn()=>$registry->updateView(View::list('assets','X',$columns,['get'],singleton:true,activate:$map)),'Activation map on a singleton accepted');
$registry->updateView(View::list('assets','Médiatár',$columns,['get','update'],activate:$map));
rejects(fn()=>$registry->checkViews(),'A view: target without a record view accepted');
rejects(fn()=>new ApplicationDefinition('X',$identities,new Menu([]),sys_get_temp_dir(),workspace:new Workspace($registry,$db)),'ApplicationDefinition accepted a missing record view');
$pages=new Registry();$resource()->register($pages,'Médiatár',activate:['field'=>'kind','map'=>['image'=>'page']]);
(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset')]))->register($pages,'Sávok');
rejects(fn()=>$pages->subview('assets','tracks','asset_id'),'Page activation in a map over an embedded child accepted');
$pages->subview('assets','tracks','asset_id',embed:false);
check(!$pages->embedded('tracks'),'Page activation with embed: false keeps the child page');

// `menu: false` (docs/toolkit.md#views): a list view that is not a singleton, has no guide and is no record view.
$menuless=new Registry();$resource()->register($menuless,'Médiatár');
$hidden=$menuless->view('assets','Rejtett',$columns,['get'],id:'assets.hidden',menu:false);
check(!$hidden->menu&&$menuless->viewById('assets')->menu,'menu: false is opt-in per view');
check(!(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset')]))->register($menuless,'Sávok',menu:false)->menu,'SqlResource::register(menu: false)');
rejects(fn()=>$menuless->view('assets','X',$columns,['get'],singleton:true,id:'assets.single',menu:false),'menu: false on a singleton accepted');
rejects(fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.guided',guide:'Útmutató',menu:false),'menu: false with a guide accepted');
rejects(fn()=>$menuless->addView(new View('demo.hidden','demo.player','X','assets',record:'assets',actions:['get'],menu:false)),'menu: false on a record view accepted');
rejects(fn()=>$menuless->addView(new View('demo.panel','demo.player','X',menu:false)),'menu: false on a project kind accepted');
rejects(fn()=>$menuless->updateView($hidden->with(guide:'Útmutató')),'A guide added to a menu-less view accepted');
// Menu attention (docs/shell.md#menu-attention): filters of filterable fields and a tone, on a list view with a menu entry.
$watched=$menuless->view('assets','Figyelt',$columns,['get'],id:'assets.watched',attention:['filters'=>['kind'=>'audio','title'=>'x']]);
check($watched->attention===['filters'=>['kind'=>'audio','title'=>'x']],'attention is kept as declared');
check((new SqlResource('clips','clips','id',[new Field('state','Állapot','select',options:['new'=>'Új'])]))->register($menuless,'Klipek',attention:['filters'=>['state'=>'new'],'tone'=>'danger'])->attention['tone']==='danger','SqlResource::register(attention: …)');
foreach([
 'a menu-less view'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a1',menu:false,attention:['filters'=>['kind'=>'audio']]),
 'a singleton'=>fn()=>$menuless->view('assets','X',$columns,['get'],singleton:true,id:'assets.a2',attention:['filters'=>['kind'=>'audio']]),
 'a project kind'=>fn()=>$menuless->addView(new View('demo.watch','demo.player','X',attention:['filters'=>['kind'=>'audio']])),
 'no filters'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a3',attention:['filters'=>[]]),
 'a list of filters'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a4',attention:['filters'=>['audio']]),
 'an unknown tone'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a5',attention:['filters'=>['kind'=>'audio'],'tone'=>'pink']),
 'an unknown key'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a6',attention:['filters'=>['kind'=>'audio'],'label'=>'x']),
 'an unknown field'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a7',attention:['filters'=>['nope'=>'1']]),
 'a secret field'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a8',attention:['filters'=>['secret'=>'1']]),
 'an empty value'=>fn()=>$menuless->view('assets','X',$columns,['get'],id:'assets.a9',attention:['filters'=>['kind'=>'']]),
] as $case=>$declare)rejects($declare,'attention on '.$case.' accepted');
// A page activation needs the child's own page: not a menu-less child, also when it leaves the menu later.
$menuPages=new Registry();$resource()->register($menuPages,'Médiatár',activate:'page');
(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset')]))->register($menuPages,'Sávok',menu:false);
rejects(fn()=>$menuPages->subview('assets','tracks','asset_id',embed:false),'Page activation over a menu-less child accepted');
$menuLater=new Registry();$resource()->register($menuLater,'Médiatár',activate:'page');
(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset')]))->register($menuLater,'Sávok');
$menuLater->subview('assets','tracks','asset_id',embed:false);
$menuLater->updateView($menuLater->viewById('tracks')->with(menu:false));
rejects(fn()=>$menuLater->checkViews(),'Page activation over a child that left the menu accepted');

// Record views: project kinds only, with the record resource's `get`.
rejects(fn()=>$registry->addView(new View('assets.files','files','X','assets',record:'assets',actions:['get'],options:['mounts'=>[]])),'Built-in kind with record accepted');
rejects(fn()=>$registry->addView(new View('demo.player','demo.player','Lejátszó',record:'missing')),'Record view without a get action accepted');
rejects(fn()=>$registry->addView(new View('demo.bad','unknown','X')),'Undotted project kind accepted');
$registry->addView(new View('demo.player','demo.player','Lejátszó','assets',record:'assets',actions:['get'],options:['loop'=>true,'label'=>'Lejátszás'],open:'window'));
$registry->updateView(View::list('assets','Hangok',$columns,['get','update'],id:'assets.audio',activate:['field'=>'kind','map'=>['0'=>'details','1'=>'update']]));
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
// A menu-less view is offered (bootstrap) with `menu: false`; a non-page sub-view child of it carries no `page`.
$menuWorkspace=new Workspace($menuless,$db);
$offered=array_column($menuWorkspace->views(new Identity('1','Egy')),null,'id');
check(isset($offered['assets.hidden'])&&$offered['assets.hidden']['menu']===false&&!array_key_exists('menu',$offered['assets']),'Bootstrap: menu: false only on the menu-less view');
check(($offered['assets.watched']['attention']??null)===['filters'=>['kind'=>'audio','title'=>'x'],'tone'=>'warning']&&!array_key_exists('attention',$offered['assets'])&&array_search('attention',array_keys($offered['assets.watched']),true)<array_search('options',array_keys($offered['assets.watched']),true),'Bootstrap: attention with the default tone, only on its view');
$menuSub=new Registry();$resource()->register($menuSub,'Médiatár');
(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset')]))->register($menuSub,'Sávok',menu:false);
$menuSub->subview('assets','tracks','asset_id',embed:false);
$grant('1','tracks','list');$grant('1','tracks','get');
$subOffered=array_column((new Workspace($menuSub,$db))->views(new Identity('1','Egy')),null,'id');
check(isset($subOffered['tracks'])&&!isset($subOffered['assets']['options']['subview']['page'])&&$subOffered['assets']['options']['subview']['view']['menu']===false,'A menu-less sub-view child has no page of its own');
// `sort` (docs/workspaces.md#list-sort): the first sort of a list, `id` or a sortable field; refused on a singleton, a
// manual order, an unsortable or unknown field and a malformed value; bootstrapped while the actor may sort by it.
$sorted=new Registry();$resource()->register($sorted,'Médiatár',sort:['field'=>'id','direction'=>'asc']);
check($sorted->viewById('assets')->options['sort']===['field'=>'id','direction'=>'asc'],'SqlResource::register(sort:)');
$sorted->view('assets','Cím szerint',$columns,['get'],id:'assets.title',sort:['field'=>'title','direction'=>'desc']);
$sorted->view('assets','Megjegyzés szerint',$columns,['get'],id:'assets.note',sort:['field'=>'note','direction'=>'asc']);
foreach([['field'=>'secret','direction'=>'asc'],['field'=>'missing','direction'=>'asc'],['field'=>'title'],['field'=>'title','direction'=>'up'],
    ['field'=>'title','direction'=>'asc','extra'=>1],['direction'=>'asc'],[]] as $invalid)
    rejects(fn()=>$sorted->view('assets','X',$columns,['get'],id:'assets.bad',sort:$invalid),'Invalid list sort accepted: '.json_encode($invalid));
rejects(fn()=>$sorted->view('assets','X',$columns,['get'],singleton:true,id:'assets.one',sort:['field'=>'id','direction'=>'asc']),'sort on a singleton accepted');
$long=new Registry();(new SqlResource('notes','assets','id',[new Field('note','Megjegyzés','textarea')]))->register($long,'Jegyzetek');
rejects(fn()=>$long->view('notes','X',[['id'=>'note','header'=>'M']],['get'],id:'notes.long',sort:['field'=>'note','direction'=>'asc']),'sort on a textarea accepted');
$ordered=new Registry();(new SqlResource('tracks','tracks','id',[new Field('asset_id','Asset'),new Field('position','Sorrend','number')],order:['field'=>'position']))->register($ordered,'Sávok');
rejects(fn()=>$ordered->view('tracks','X',[['id'=>'asset_id','header'=>'A']],['get'],id:'tracks.sorted',sort:['field'=>'id','direction'=>'asc']),'sort with a manual order accepted');
$grant('1','assets','list','all','deny','note');
$sortOffered=array_column((new Workspace($sorted,$db))->views(new Identity('1','Egy')),null,'id');
check($sortOffered['assets']['options']['sort']===['field'=>'id','direction'=>'asc']&&$sortOffered['assets.title']['options']['sort']===['field'=>'title','direction'=>'desc'],'Bootstrap: the declared sort');
check(!isset($sortOffered['assets.note']['options']['sort'])&&!in_array('note',$sortOffered['assets.note']['options']['sortable'],true),'Bootstrap: no sort by a field the actor may not sort by');
check(!isset($offered['assets']['options']['sort']),'Bootstrap: no sort without a declaration');
$db->exec("DELETE FROM blade_rules WHERE subject_id='1' AND resource='assets' AND action='list' AND field_name='note'");
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
rejects(fn()=>$registry->updateView(new View('demo.generic','demo.generic','Generic',options:['blob'=>str_repeat('a',GenericViewKind::MAX_BYTES-10)])),'Options over 64 KiB accepted');
$registry->updateView(new View('demo.generic','demo.generic','Generic'));
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
// Cache keys from the files (docs/toolkit.md#cache-keys): `?v=<base36 mtime>-<base36 size>` of the served file below
// the document root, page-relative paths from the front controller's directory; own keys stay; a missing file, a path
// outside the root (also through a symlink) or no resolvable root falls back to the version; 61ade's assets then use
// the package build's key. The old hand-bumped `?v=32` is gone.
$fileKey=static function(string $file):string{clearstatcache();return base_convert((string)filemtime($file),10,36).'-'.base_convert((string)filesize($file),10,36);};
$dist=dirname(__DIR__,2).'/packages/frontend/dist';
check(!str_contains($page,'v=32')&&str_contains($page,'src="assets/admin.js?v='.$fileKey($dist.'/admin.js').'"')&&str_contains($page,'href="assets/admin.css?v='.$fileKey($dist.'/admin.css').'"'),'Without a resolvable document root 61ade assets carry the package build key, not ?v=32');
check(str_contains($page,'href="skins/brand.css?v=1.4.0"'),'An unresolvable skin stylesheet falls back to the version');
$public=$runtime.'/public';
foreach(['admin','assets','app','skins'] as $directory)if(!is_dir($public.'/'.$directory))mkdir($public.'/'.$directory,0777,true);
foreach(['assets/admin.js'=>'export{};','assets/admin.css'=>'a{}','app/main.js'=>'export default()=>{};','app/main.css'=>'b{}','skins/brand.css'=>'c{}'] as $file=>$content)file_put_contents($public.'/'.$file,$content);
file_put_contents($runtime.'/outside.js','export default()=>{};');
if(!is_link($public.'/app/linked.js'))symlink($runtime.'/outside.js',$public.'/app/linked.js');
$keyed=fn(?string $root,string $version='1.4.0')=>new ApplicationDefinition('Toolkit',$identities,new Menu([]),$runtime,sessionName:'blade_toolkit',version:$version,assets:'../assets',
    modules:['../app/main.js','/app/main.js','../app/missing.js','../../outside.js','../app/linked.js','../app/up.js?v=2'],stylesheets:['../app/main.css'],
    skins:static fn()=>[new Skin('brand','Brand','../skins/brand.css')],documentRoot:$root);
$script=$_SERVER['SCRIPT_FILENAME'];$_SERVER['SCRIPT_FILENAME']=$public.'/admin/index.php';
$page=$render($keyed($public));$main=$fileKey($public.'/app/main.js');
check($bootstrap($page)['modules']===['../app/main.js?v='.$main,'/app/main.js?v='.$main,'../app/missing.js?v=1.4.0','../../outside.js?v=1.4.0','../app/linked.js?v=1.4.0','../app/up.js?v=2'],'Module keys from the file; own key kept; missing, outside and escaping symlink fall back to the version');
check(str_contains($page,'src="../assets/admin.js?v='.$fileKey($public.'/assets/admin.js').'"')&&str_contains($page,'href="../assets/admin.css?v='.$fileKey($public.'/assets/admin.css').'"')
    &&str_contains($page,'href="../app/main.css?v='.$fileKey($public.'/app/main.css').'"')&&str_contains($page,'href="../skins/brand.css?v='.$fileKey($public.'/skins/brand.css').'"'),'admin.js, admin.css, project and skin stylesheets carry their served file keys');
check(!str_contains($page,$runtime)&&!str_contains($page,dirname(__DIR__,2)),'No filesystem path in the page');
$before=$fileKey($public.'/app/main.js');
file_put_contents($public.'/app/main.js','export default()=>{console.log(1);};');touch($public.'/app/main.js',time()+60);
$changed=$bootstrap($render($keyed($public)))['modules'][0];
check($changed==='../app/main.js?v='.$fileKey($public.'/app/main.js')&&$changed!=='../app/main.js?v='.$before,'A rebuilt file gets a new key at once');
$_SERVER['DOCUMENT_ROOT']=$public;
check($bootstrap($render($keyed(null)))['modules'][0]===$changed,'The document root defaults to the request DOCUMENT_ROOT');
$_SERVER['DOCUMENT_ROOT']='';
check($bootstrap($render($keyed(null,'')))['modules']===['../app/main.js','/app/main.js','../app/missing.js','../../outside.js','../app/linked.js','../app/up.js?v=2'],'No root and no version: no key');
check($bootstrap($render($keyed($public.'/app')))['modules'][0]==='../app/main.js?v=1.4.0','A page outside the document root resolves nothing');
$name=$_SERVER['SCRIPT_NAME'];$_SERVER['SCRIPT_FILENAME']='proxy:fcgi://127.0.0.1/index.php';$_SERVER['SCRIPT_NAME']='/admin/index.php';
check($bootstrap($render($keyed($public)))['modules'][0]===$changed,'Without a usable SCRIPT_FILENAME the page directory is the root plus the SCRIPT_NAME directory');
$_SERVER['SCRIPT_FILENAME']=$script;$_SERVER['SCRIPT_NAME']=$name;
foreach(['',"tmp\0x"] as $bad)rejects(fn()=>$keyed($bad),'Invalid document root accepted: '.json_encode($bad));
array_map('unlink',glob($runtime.'/sessions/*')?:[]);

// Sign-in branding (docs/shell.md#sign-in-branding): the logo and the sign-in stylesheets, keyed like the other assets;
// `data-blade-page` names the page kind; signed-out pages link only the sign-in stylesheets, the shell only `stylesheets`.
foreach(['branding/logo.svg'=>'<svg xmlns="http://www.w3.org/2000/svg"/>','branding/logo-dark.svg'=>'<svg xmlns="http://www.w3.org/2000/svg"></svg>','branding/sign-in.css'=>'d{}','branding/sign-in.js'=>'export default()=>{};'] as $file=>$content){
    if(!is_dir(dirname($public.'/'.$file)))mkdir(dirname($public.'/'.$file),0777,true);
    file_put_contents($public.'/'.$file,$content);
}
$content=new \Blade\Shell\SignIn('Szintetikus fiókok.',[new \Blade\Shell\SignInLink('Impresszum','../impressum/'),new \Blade\Shell\SignInLink('Súgó','https://help.example.test/sign-in?x=1#top')]);
$branded=fn(?\Blade\Shell\Logo $logo=new \Blade\Shell\Logo('../branding/logo.svg','../branding/logo-dark.svg'),array $signIn=['../branding/sign-in.css'],\Blade\Shell\SignIn|false|null $text=false,array $signInModules=['../branding/sign-in.js'])=>new ApplicationDefinition('Toolkit',$identities,new Menu([]),$runtime,
    sessionName:'blade_toolkit',version:'1.4.0',assets:'../assets',modules:['../app/main.js'],stylesheets:['../app/main.css'],documentRoot:$public,logo:$logo,signInStylesheets:$signIn,signIn:$text===false?$content:$text,signInModules:$signInModules);
$session=function(array $values):void{session_start();$_SESSION=$values;$_COOKIE['blade_toolkit']=session_id();session_write_close();};
$_SERVER['SCRIPT_FILENAME']=$public.'/admin/index.php';
$signInCss='href="../branding/sign-in.css?v='.$fileKey($public.'/branding/sign-in.css').'"';
$logo=['image'=>'../branding/logo.svg?v='.$fileKey($public.'/branding/logo.svg'),'label'=>'Toolkit','placement'=>'window','dark'=>'../branding/logo-dark.svg?v='.$fileKey($public.'/branding/logo-dark.svg')];
$session([]);
$page=$render($branded());$link=strpos($page,$signInCss);
check(preg_match('~<html lang="[a-z]+" data-blade-page="sign-in">~',$page)===1,'Sign-in page kind on <html>');
check($link!==false&&$link>strpos($page,'admin.css')&&!str_contains($page,'app/main.css')&&!isset($bootstrap($page)['modules']),'Sign-in page links the keyed sign-in stylesheet after admin.css, no project stylesheet or module');
check($bootstrap($page)['logo']===$logo,'Logo in the sign-in bootstrap: keyed light and dark images, the title as its text, window placement by default');
$signedOut=['signIn'=>['notice'=>'Szintetikus fiókok.','links'=>[['label'=>'Impresszum','href'=>'../impressum/'],['label'=>'Súgó','href'=>'https://help.example.test/sign-in?x=1#top']]],'signInModules'=>['../branding/sign-in.js?v='.$fileKey($public.'/branding/sign-in.js')]];
$keysOf=fn(string $page)=>array_intersect_key($bootstrap($page),$signedOut);
check($keysOf($page)===$signedOut&&!str_contains($page,'<script type="module" src="../branding/'),'Sign-in bootstrap: translated notice and links, keyed sign-in modules (imported by the shell, never as page scripts)');
$session(['pendingLogin'=>['email'=>'a@example.test','expires'=>time()+600]]);
$page=$render($branded());
check(str_contains($page,'data-blade-page="confirmation"')&&str_contains($page,$signInCss)&&!str_contains($page,'app/main.css')&&$bootstrap($page)['logo']===$logo&&$keysOf($page)===$signedOut,'E-mail confirmation page: kind, sign-in stylesheet, logo, content, modules');
$session(['pendingLogin'=>['email'=>'a@example.test','expires'=>time()+600],'pendingPasswordChange'=>['expires'=>time()+600]]);
$page=$render($branded());
check(str_contains($page,'data-blade-page="password-change"')&&str_contains($page,$signInCss)&&!str_contains($page,'app/main.css')&&$bootstrap($page)['logo']===$logo&&$keysOf($page)===$signedOut,'Password-change page (it wins over a pending confirmation, as in the shell): kind, sign-in stylesheet, logo, content, modules');
$session(['identity'=>'1']);
$page=$render($branded());
check(str_contains($page,'data-blade-page="shell"')&&str_contains($page,'href="../app/main.css?v=')&&!str_contains($page,'sign-in.css')&&$bootstrap($page)['authenticated']===true&&$bootstrap($page)['logo']===$logo&&$keysOf($page)===[]&&!str_contains($page,'sign-in.js'),'Signed-in shell: kind, project stylesheet only, logo; no sign-in content or modules');
$page=$render($branded(new \Blade\Shell\Logo('/branding/logo.svg?v=3',label:'Márka',placement:'both'),[]));
check($bootstrap($page)['logo']===['image'=>'/branding/logo.svg?v=3','label'=>'Márka','placement'=>'both'],'Own logo key, text and placement; no dark key without a dark image');
// Without a declared logo the shell shows the 61ade product logo (docs/brand.md): no image URL, the shell inlines it.
$product=['label'=>'blade','placement'=>'window'];
$page=$render($branded(null,[],null,[]));
check($bootstrap($page)['logo']===$product&&!str_contains($page,'branding/')&&!str_contains($page,'<img'),'Signed in without a declaration: the product logo, nothing linked');
check(!isset($bootstrap($render($branded(\Blade\Shell\Logo::none(),[],null,[])))['logo']),'Logo::none(): no logo key on the shell');
$session([]);
$page=$render($branded(null,[],null,[]));
check($bootstrap($page)['logo']===$product&&!str_contains($page,'branding/')&&$keysOf($page)===[]&&str_contains($page,'data-blade-page="sign-in"'),'Signed out without branding: the product logo, nothing linked or listed, the page kind stays');
check(!isset($bootstrap($render($branded(\Blade\Shell\Logo::none(),[],null,[])))['logo']),'Logo::none(): no logo key on the sign-in page');
check($bootstrap($render($branded(new \Blade\Shell\Logo(placement:'both'),[],null,[])))['logo']===['label'=>'blade','placement'=>'both'],'The product logo with a placement');
check($bootstrap($render($branded(new \Blade\Shell\Logo(label:'Márka'),[],null,[])))['logo']===['label'=>'Márka','placement'=>'window'],'The product logo with an own accessible text');
rejects(fn()=>new \Blade\Shell\Logo(darkImage:'logo-dark.svg'),'A dark image without an image accepted');
check((\Blade\Shell\Logo::none())->shown===false,'Logo::none() is not shown');
check($keysOf($render($branded(null,[],new \Blade\Shell\SignIn(),[])))===[],'An empty SignIn adds no bootstrap key');
check($keysOf($render($branded(null,[],new \Blade\Shell\SignIn(links:[new \Blade\Shell\SignInLink('Súgó','/help')]),[])))===['signIn'=>['links'=>[['label'=>'Súgó','href'=>'/help']]]],'Links without a notice');
foreach(['https://cdn.example.test/logo.svg','//cdn.example.test/logo.svg','logo.gif','logo.jpg','x/../logo.svg','data:image/svg+xml,<svg/>','logo.svg?v=<x>','','lo go.png','logo.svg.js'] as $bad)
    rejects(fn()=>new \Blade\Shell\Logo($bad),'Invalid logo image accepted: '.$bad);
rejects(fn()=>new \Blade\Shell\Logo('logo.svg','https://cdn.example.test/dark.svg'),'Off-origin dark logo accepted');
rejects(fn()=>new \Blade\Shell\Logo('logo.svg',label:' '),'Blank logo text accepted');
check((new \Blade\Shell\Logo('/b/logo.png?v=3','../b/logo-dark.webp'))->darkImage==='../b/logo-dark.webp','png/webp, root-absolute and parent paths accepted');
foreach([['x.js'],['https://cdn.example.test/x.css'],['x.css','x.css'],['a'=>'x.css'],[7]] as $bad)rejects(fn()=>$branded(null,$bad),'Invalid sign-in stylesheet accepted: '.json_encode($bad));
foreach([['x.css'],['https://cdn.example.test/x.js'],['x.js','x.js'],['a'=>'x.js'],['x.ts']] as $bad)rejects(fn()=>$branded(null,[],null,$bad),'Invalid sign-in module accepted: '.json_encode($bad));
rejects(fn()=>new \Blade\Shell\Logo('logo.svg',placement:'menu'),'Unknown logo placement accepted');
foreach(['/','./','../','../../help/','/impressum','privacy.html','/docs/help?x=1#top','https://example.test','https://example.test:8443/a/b?c=d&e=f#g'] as $href)check((new \Blade\Shell\SignInLink('L',$href))->href===$href,'Sign-in link accepted: '.$href);
foreach(['','//evil.test/x','http://example.test','javascript:alert(1)','data:text/html,x','mailto:a@example.test','a/../b','a/./b','/a/..','..//x','..','a b','a"b',"a\nb",'https://ex ample.test','https://example.test/"x'] as $href)rejects(fn()=>new \Blade\Shell\SignInLink('L',$href),'Sign-in link accepted: '.json_encode($href));
rejects(fn()=>new \Blade\Shell\SignInLink(' ','/help'),'Blank link label accepted');
rejects(fn()=>new \Blade\Shell\SignIn(' '),'Blank notice accepted');
rejects(fn()=>new \Blade\Shell\SignIn(str_repeat('a',501)),'Notice over 500 characters accepted');
rejects(fn()=>new \Blade\Shell\SignIn(links:array_fill(0,7,new \Blade\Shell\SignInLink('L','/x'))),'More than six links accepted');
rejects(fn()=>new \Blade\Shell\SignIn(links:['/x']),'A link that is not a SignInLink accepted');
$_SERVER['SCRIPT_FILENAME']=$script;
array_map('unlink',glob($runtime.'/sessions/*')?:[]);

// Registries (P3 C-5): project presentations and field types are dotted names the server accepts by shape only; the
// list view declares its client commands; all of them reach the bootstrap.
foreach(['demo.bar','demo.rating-bar','a.b_c'] as $name)check(Field::projectName($name)&&(new Field('n','N',column:['presentation'=>$name]))->column['presentation']===$name,'Project presentation '.$name);
foreach(['bar','Demo.bar','demo bar','.bar','demo:bar',7,null] as $name)check(!Field::projectName($name),'Not a project name: '.var_export($name,true));
rejects(fn()=>new Field('n','N',column:['presentation'=>'bar']),'A dot-free unknown presentation accepted');
rejects(fn()=>new Field('n','N',secret:true,column:['presentation'=>'demo.bar']),'A project presentation on a secret field accepted');
rejects(fn()=>new Field('n','N','password',column:['presentation'=>'demo.bar']),'A project presentation on a password field accepted');
rejects(fn()=>new Field('n','N',column:['presentation'=>'demo.bar','image_base'=>'img/']),'Image options without presentation image accepted');
rejects(fn()=>new Field('n','N',column:['presentation'=>'demo.bar','media'=>'files']),'A project presentation on a media column accepted');
check((new Field('n','N','number',column:['presentation'=>'demo.bar','editable'=>true]))->column['editable'],'A project presentation keeps the field editable');
$rating=new Field('priority','Prioritás','number',editor:'demo.rating',column:['editable'=>true]);
check($rating->metadata()['editor']==='demo.rating'&&!array_key_exists('editor',(new Field('n','N'))->metadata()),'Field editor metadata only when declared');
foreach([['editor'=>'rating'],['editor'=>'Demo.rating'],['editor'=>'demo.rating','secret'=>true],['editor'=>'demo.rating','type'=>'password']] as $invalid)rejects(fn()=>new Field('n','N',...$invalid),'Invalid editor accepted: '.json_encode($invalid));
rejects(fn()=>new Field('n','N',editor:'demo.picker',column:['media'=>'files']),'An editor on a media column accepted');
rejects(fn()=>new Field('n','N','file',file:['resource'=>'files','mount'=>'drive','accept'=>['image']],editor:'demo.picker'),'An editor on a file field accepted');
$commandRegistry=new Registry();
$commandSource=new SqlResource('assets','assets','id',[new Field('title','Cím'),new Field('kind','Fajta',column:['presentation'=>'demo.bar']),$rating],'owner_id');
$commandView=$commandSource->register($commandRegistry,'Feladatok',commands:['demo.copy-text','demo.share']);
check($commandView->options['commands']===['demo.copy-text','demo.share']&&!isset($resource()->register(new Registry(),'X')->options['commands']),'SqlResource and Registry::view keep declared commands only');
foreach([['copy'],['demo.copy','demo.copy'],['Demo.copy'],[7],array_map(fn($i)=>'demo.c'.$i,range(1,21)),['a'=>'demo.copy']] as $invalid)rejects(fn()=>$commandRegistry->view('assets','X',$columns,['get'],commands:$invalid),'Invalid commands accepted: '.json_encode($invalid));
rejects(fn()=>$commandRegistry->addView($commandView->with(options:[...$commandView->options,'commands'=>'demo.copy'])),'A commands string accepted');
$commandWorkspace=new Workspace($commandRegistry,$db);
$commandOptions=$commandWorkspace->views(new Identity('1','Egy'))[0]['options'];
$commandColumns=array_column($commandOptions['columns'],null,'id');$commandDetails=array_column($commandOptions['detailFields'],null,'id');
check($commandOptions['commands']===['demo.copy-text','demo.share'],'Declared commands reach the list options');
check($commandColumns['kind']['presentation']==='demo.bar'&&$commandDetails['kind']['presentation']==='demo.bar','A project presentation reaches columns and detail fields');
check($commandColumns['priority']['editor']==='demo.rating'&&$commandDetails['priority']['editor']==='demo.rating'&&!isset($commandColumns['title']['editor']),'A field editor reaches columns and detail fields');
$updateFields=array_column(array_column($commandWorkspace->views(new Identity('1','Egy'))[0]['actions'],null,'name')['update']['fields'],null,'name');
check($updateFields['priority']['editor']==='demo.rating','A field editor reaches the action fields');

// Menu-row commands (docs/shell.md#menu-commands): a project-prefixed client command, server-side visibility, the
// attention of a declared view; at most three unique ones per application.
$command=new Blade\Navigation\MenuCommand('demo.workbench','Munkaasztal',icon:'dxi dxi-pencil',tooltip:'Nyitva marad',visible:static fn(Identity $actor)=>$actor->id==='1',attention:'assets.watched');
check($command->project(new Identity('1','Egy'),['assets.watched'])===['id'=>'demo.workbench','label'=>'Munkaasztal','icon'=>'dxi dxi-pencil','tooltip'=>'Nyitva marad','emphasized'=>true,'attention'=>'assets.watched'],'Menu command projection');
check($command->project(new Identity('2','Kettő'),['assets.watched'])===null,'A hidden menu command is not offered');
check(!array_key_exists('attention',$command->project(new Identity('1','Egy'),[])),'Attention only names an offered view');
check((new Blade\Navigation\MenuCommand('demo.plain','Sima',emphasized:false))->project(new Identity('1','Egy'),[])===['id'=>'demo.plain','label'=>'Sima','emphasized'=>false],'A plain menu command');
foreach([
 'an undotted id'=>fn()=>new Blade\Navigation\MenuCommand('workbench','X'),
 'an upper-case id'=>fn()=>new Blade\Navigation\MenuCommand('Demo.x','X'),
 'an empty label'=>fn()=>new Blade\Navigation\MenuCommand('demo.x',' '),
 'an empty tooltip'=>fn()=>new Blade\Navigation\MenuCommand('demo.x','X',tooltip:''),
 'an icon with markup'=>fn()=>new Blade\Navigation\MenuCommand('demo.x','X',icon:'dxi"><b'),
 'an invalid attention id'=>fn()=>new Blade\Navigation\MenuCommand('demo.x','X',attention:'Bad view'),
] as $case=>$declare)rejects($declare,'A menu command with '.$case.' accepted');
$commandApp=fn(array $commands)=>new ApplicationDefinition('Demo',$identities,new Menu([]),sys_get_temp_dir(),workspace:new Workspace($menuless,$db),menuCommands:$commands);
check($commandApp([$command])->menuCommands===[$command],'ApplicationDefinition keeps its menu commands');
foreach([
 'four commands'=>fn()=>$commandApp(array_map(fn($i)=>new Blade\Navigation\MenuCommand('demo.c'.$i,'C'),range(1,4))),
 'a duplicate id'=>fn()=>$commandApp([new Blade\Navigation\MenuCommand('demo.c','C'),new Blade\Navigation\MenuCommand('demo.c','D')]),
 'a non-command'=>fn()=>$commandApp(['demo.c']),
 'attention of a view without attention'=>fn()=>$commandApp([new Blade\Navigation\MenuCommand('demo.c','C',attention:'assets')]),
 'attention of an unknown view'=>fn()=>$commandApp([new Blade\Navigation\MenuCommand('demo.c','C',attention:'nope')]),
] as $case=>$declare)rejects($declare,'Menu commands with '.$case.' accepted');

echo "61ade toolkit server contracts passed.\n";

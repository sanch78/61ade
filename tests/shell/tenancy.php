<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\{Schema,Tokens};
use Blade\Admin\{Accounts,Administration,ApiKeys};
use Blade\Feature\{Registry,Workspace,Context,Failure,SqlResource,Field,Lookup,View};
use Blade\Shell\{Identity,SqlIdentityProvider};
use Blade\Tenancy\Tenancy;
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message,?string $field=null):void{
    try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.': '.$e->getMessage().')');if($field!==null)check(isset($e->fieldErrors[$field]),$message.' (field error)');return;}
    throw new RuntimeException($message.' (accepted)');
}
$schema=static function(PDO $db):void{
    $db->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL)');
    $insert=$db->prepare('INSERT INTO accounts(id,email,password_hash,display_name) VALUES (?,?,?,?)');
    foreach([[1,'two@example.test','Two'],[2,'one@example.test','One'],[3,'none@example.test','None']] as [$id,$email,$name])$insert->execute([$id,$email,'x',$name]);
    $db->exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, title TEXT NOT NULL)');
    $db->exec('CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, title TEXT NOT NULL, project_id TEXT NOT NULL)');
    $db->exec('CREATE TABLE notices (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');
};
$define=static function(Workspace $workspace):array{
    $projects=new SqlResource('projects','projects','id',[new Field('title','Cím',required:true,max:100,validation:['unique'=>true])],tenantColumn:'tenant_id');
    $projects->register($workspace->registry,'Projektek');$projects->registerDelete($workspace->registry);
    (new SqlResource('tasks','tasks','id',[new Field('title','Cím',required:true),new Field('project_id','Projekt','select',required:true,options:(new Lookup('projects','projects','id','title',tenantColumn:'tenant_id'))->options(...))],tenantColumn:'tenant_id'))->register($workspace->registry,'Feladatok');
    (new SqlResource('notices','notices','id',[new Field('title','Cím',required:true)]))->register($workspace->registry,'Hirdetmények');
    $accounts=new Accounts($workspace,'accounts','id','email','display_name','password_hash');
    Administration::register($workspace,$accounts,new SqlIdentityProvider($workspace->db,'accounts','id','email','password_hash','display_name'));
    return [$accounts];
};

// Opt-in: without tenancy no tenant tables, fields or views appear, and a scoped resource fails closed.
$plain=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($plain);$schema($plain);
$off=new Workspace(new Registry(),$plain);$define($off);
check($off->tenancy===null,'Tenancy is off by default');
check(!in_array(Tenancy::RESOURCE,array_column($off->registry->views(),'resource'),true),'No tenant view without tenancy');
check(!array_key_exists('blade_tenant_ids',$off->registry->fields(Accounts::RESOURCE)),'No membership field without tenancy');
check(!in_array('tenant_id',array_column($plain->query('PRAGMA table_info(blade_audit)')->fetchAll(PDO::FETCH_ASSOC),'name'),true),'Audit schema unchanged without tenancy');
$off->db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope) VALUES ('user','1','projects','list','ui','allow','all')");
fails(fn()=>$off->executor->execute(new Context(new Identity('1','Two'),'ui',$off->acl,$plain),'projects','list','',['limit'=>10]),403,'A tenant-scoped resource without tenancy fails closed');
foreach([fn()=>new SqlResource('x','x','id',[new Field('tenant_id','T')],tenantColumn:'tenant_id'),fn()=>new SqlResource('x','x','id',[new Field('a','A')],tenantColumn:'id')] as $invalid){
    try{$invalid();throw new RuntimeException('tenant column accepted as an input or key');}catch(InvalidArgumentException){}
}

// Migration 0003: a database from before 2026-10-30 keeps the removed membership switch `active`. Tenancy::install()
// refuses it; the migration deletes the suspended rows (they granted nothing) and drops the column, once.
$old=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($old);
$old->exec('CREATE TABLE blade_tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(200) NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1)');
$old->exec('CREATE TABLE blade_tenant_members (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id VARCHAR(100) NOT NULL, actor_id VARCHAR(100) NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(tenant_id, actor_id))');
$old->exec("INSERT INTO blade_tenants(name) VALUES ('Régi')");$old->exec("INSERT INTO blade_tenant_members(tenant_id,actor_id,active) VALUES ('1','1',1),('1','2',0)");
try{Tenancy::install($old);throw new RuntimeException('An unmigrated membership table was installed');}catch(LogicException $e){check(str_contains($e->getMessage(),'0003'),'Install names the migration');}
// Fails closed at runtime too: no membership (not even the active row), a clear error naming the migration.
$logged=ini_set('error_log','/dev/null');$unmigrated=new Tenancy($old);
foreach([fn()=>$unmigrated->member('2','1'),fn()=>$unmigrated->member('1','1'),fn()=>$unmigrated->memberships('2'),fn()=>$unmigrated->select('2','1')] as $read){
    try{$read();throw new RuntimeException('An unmigrated membership table granted or listed a membership');}catch(LogicException $e){check(str_contains($e->getMessage(),'0003'),'Unmigrated reads name the migration');}
}
$oldWorkspace=new Workspace(new Registry(),$old,tenancy:true);
try{$oldWorkspace->context(new Identity('2','Two'),'ui','1');throw new RuntimeException('A suspended membership opened a tenant context');}catch(LogicException){}
ini_set('error_log',(string)$logged);
$migrate=require dirname(__DIR__,2).'/packages/php/migrations/0003-tenant-member-active.php';
check($migrate($old)===['deleted'=>1,'dropped'=>true] && $migrate($old)===['deleted'=>0,'dropped'=>false],'Migration 0003 deletes suspended rows and drops the column once');
Tenancy::install($old);
check($unmigrated->member('1','1')&&!$unmigrated->member('2','1'),'After the migration the same instance grants the active membership only');
unset($oldWorkspace);
check(!in_array('active',array_column($old->query('PRAGMA table_info(blade_tenant_members)')->fetchAll(PDO::FETCH_ASSOC),'name'),true) && (new Tenancy($old))->memberships('1')===['1'=>'Régi'] && (new Tenancy($old))->memberships('2')===[],'Migrated: the active membership stays, the suspended one is gone');
check($migrate(new PDO('sqlite::memory:'))===['deleted'=>0,'dropped'=>false],'Migration 0003 is a no-op without tenancy');
unset($old,$migrate);

$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);Tenancy::install($db);Tenancy::install($db);$schema($db);
$workspace=new Workspace(new Registry(),$db,tenancy:true);[$accounts]=$define($workspace);
$a=Tenancy::ensure($db,'Alfa');$b=Tenancy::ensure($db,'Béta');
check(Tenancy::ensure($db,'Alfa')===$a,'ensure() is idempotent');
foreach([[$a,'1'],[$b,'1'],[$a,'2']] as [$tenant,$actor])Tenancy::join($db,$tenant,$actor);
$db->exec("INSERT INTO projects(tenant_id,title) VALUES ('$a','Alfa 1'),('$a','Alfa 2'),('$b','Béta 1')");
$db->exec("INSERT INTO tasks(tenant_id,title,project_id) VALUES ('$b','Béta feladat','3')");
$db->exec("INSERT INTO notices(title) VALUES ('Közös')");
\Blade\Admin\Permissions::grantAdministration($db,$workspace->registry,'1');
$grant=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope) VALUES ('user',?,?,?,?,'allow','all')");
foreach(['1','2','3'] as $actor)foreach([['projects',['list','get','create','update']],['tasks',['list','get','create','update']],['notices',['list','get']]] as [$resource,$actions])foreach($actions as $action)$grant->execute([$actor,$resource,$action,'ui']);
foreach([['projects','list'],['projects','get'],['notices','list']] as [$resource,$action])$grant->execute(['1',$resource,$action,'api']);
$grant->execute(['1','projects','delete','ui']);

$two=new Identity('1','Two');$one=new Identity('2','One');$none=new Identity('3','None');
check($workspace->tenancy->memberships('1')===[$a=>'Alfa',$b=>'Béta'] && $workspace->tenancy->memberships('3')===[],'Memberships by name');
check($workspace->tenancy->select('2',null)===$a && $workspace->tenancy->select('1',$b)===$b && $workspace->tenancy->select('1','999')===$a && $workspace->tenancy->select('3',$a)===null,'Selection keeps a membership, falls back to the first, none without membership');
fails(fn()=>$workspace->context($one,'ui',$b),403,'A tenant outside the memberships is refused');
fails(fn()=>$workspace->context($none,'ui',$a),403,'No membership, no tenant context');
$ctxA=$workspace->context($one,'ui',$a);$ctxB=$workspace->context($two,'ui',$b);$ctxNone=$workspace->context($none);
$run=fn(Context $ctx,string $resource,string $action,?string $id=null,array $values=[])=>$workspace->executor->execute($ctx,$resource,$action,$id,$values);

// Reads: list, count, filter and watch see only the active tenant; another tenant's object is not found.
$list=$run($ctxA,'projects','list','',['limit'=>50]);
check(array_column($list['items'],'title')===['Alfa 2','Alfa 1'] && $list['total']===2,'List and count are tenant-scoped');
check($run($ctxA,'projects','list','',['filters'=>['title'=>'Béta']])['matched']===0,'A filter cannot reach another tenant');
check(array_column($run($ctxB,'projects','list','',['limit'=>50])['items'],'title')===['Béta 1'],'Isolation across successive requests and tenants');
check(array_column($workspace->observe($ctxA,'projects',['limit'=>50])['items'],'title')===['Alfa 2','Alfa 1'],'Live watch is tenant-scoped');
$batch=$workspace->watch($ctxNone,[['id'=>'p','resource'=>'projects','query'=>['limit'=>50]],['id'=>'n','resource'=>'notices','query'=>['limit'=>50]]]);
check(!$batch[0]['ok']&&$batch[0]['status']===403&&$batch[1]['ok']&&array_column($batch[1]['data']['items'],'title')===['Közös'],'Batched watch: a scoped list without a tenant is refused alone, the global one beside it answers');
check(array_column($run($ctxA,'projects','list',null,[])['items'],'title')===['Alfa 2','Alfa 1'],'A list without parameters is the first, tenant-scoped cursor window');
fails(fn()=>$run($ctxA,'projects','list','200',[]),400,'The removed offset paging (a list id) is refused');
check($run($ctxA,'projects','get','1')['title']==='Alfa 1','Permitted read inside the tenant');
fails(fn()=>$run($ctxA,'projects','get','3'),404,'Another tenant\'s object by ID is not found');
fails(fn()=>$run($ctxA,'projects','update','3',['title'=>'X','revision'=>'r']),404,'Another tenant\'s object cannot be updated');
fails(fn()=>$run($ctxA,'tasks','get','1'),404,'Another tenant\'s related record is not found');

// Lookups and relations: choices come from the active tenant only; a foreign related ID is rejected.
$taskCreate=array_values(array_filter(array_values(array_filter($workspace->views($one,$a),fn($v)=>$v['resource']==='tasks'))[0]['actions'],fn($x)=>$x['name']==='create'))[0]['fields'][1];
check(array_keys($taskCreate['options'])===[1,2],'Lookup choices are tenant-scoped');
fails(fn()=>$run($ctxA,'tasks','create',null,['title'=>'Leak','project_id'=>'3']),400,'A related ID of another tenant is rejected','project_id');
$task=$run($ctxA,'tasks','create',null,['title'=>'Alfa feladat','project_id'=>'1']);
check($db->query('SELECT tenant_id FROM tasks WHERE id='.(int)$task['id'])->fetchColumn()===$a,'Create stamps the active tenant');

// Writes: the tenant column is server-owned, uniqueness is per tenant, bulk targets are checked one by one.
fails(fn()=>$run($ctxA,'projects','create',null,['title'=>'Smuggled','tenant_id'=>$b]),400,'A client tenant value is rejected');
check((bool)$run($ctxA,'projects','create',null,['title'=>'Béta 1']),'Uniqueness is per tenant');
fails(fn()=>$run($ctxA,'projects','create',null,['title'=>'Alfa 1']),400,'Duplicates inside a tenant are rejected','title');
fails(fn()=>$run($ctxA,'projects','delete','1',['revision'=>$run($ctxA,'projects','get','1')['revision']]),403,'Denied write inside the tenant');
$bulk=$workspace->executor->bulk($ctxB,'projects','delete',[['id'=>'3','values'=>['revision'=>$run($ctxB,'projects','get','3')['revision']]],['id'=>'1','values'=>['revision'=>'x']]]);
check($bulk[0]['ok'] && !$bulk[1]['ok'] && (int)$db->query('SELECT COUNT(*) FROM projects WHERE id=1')->fetchColumn()===1,'Bulk: another tenant\'s target fails, the own one succeeds');
check($db->query("SELECT tenant_id FROM blade_audit WHERE resource='projects' AND action='delete' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetchColumn()===$b,'Audit records the tenant of the action');

// No membership: scoped resources fail closed and are not offered; global resources keep working.
fails(fn()=>$run($ctxNone,'projects','list','',['limit'=>10]),403,'No active tenant: scoped list refused');
fails(fn()=>$run($ctxNone,'projects','get','1'),403,'No active tenant: scoped read refused');
$offered=array_column($workspace->views($none),'resource');
check(!in_array('projects',$offered,true) && !in_array('tasks',$offered,true) && in_array('notices',$offered,true),'Only global views without a tenant');
check(array_column($run($ctxNone,'notices','list','',['limit'=>10])['items'],'title')===['Közös'],'Global resources need no tenant');

// Membership administration on the Users form (audited) takes effect on the next context.
$admin=$workspace->context($two,'ui',$a);
$user=$run($admin,Accounts::RESOURCE,'get','3');
check($user['blade_tenant_ids']==='','Users form shows no membership');
$listed=array_values(array_filter($run($admin,Accounts::RESOURCE,'list','',['limit'=>10])['items'],fn($row)=>$row['id']==='1'))[0];
check($listed['blade_tenant_ids']===$a.','.$b && $listed['revision']===$run($admin,Accounts::RESOURCE,'get','1')['revision'],'Listed memberships match the form and its revision');
$run($admin,Accounts::RESOURCE,'update','3',['display_name'=>'None','email'=>'none@example.test','blade_tenant_ids'=>[$b],'revision'=>$user['revision']]);
check($workspace->tenancy->member('3',$b) && in_array('blade_tenant_ids',json_decode((string)$db->query("SELECT field_names FROM blade_audit WHERE resource='blade_users' AND action='update' ORDER BY id DESC LIMIT 1")->fetchColumn(),true),true),'Membership assigned and audited');
check(array_column($run($workspace->context($none,'ui',$b),'projects','list','',['limit'=>50])['items'],'title')===[],'New member reads the tenant (its project was deleted above)');
// Tenant access list: every visible account, one flag per tenant (an active membership); the toggle is the only write.
$access=fn(string $tenant)=>array_column($run($admin,Tenancy::MEMBERS,'list','',['limit'=>50,'filters'=>['tenant_id'=>$tenant]])['items'],null,'id');
$rows=$access($a);
check(array_keys($rows)==["$a:3","$a:2","$a:1"] && array_column($rows,'blade_email','id')==["$a:3"=>'none@example.test',"$a:2"=>'one@example.test',"$a:1"=>'two@example.test'],'The access list lists every account once, with a stable tenant:account id');
check(array_column($rows,'access','id')==["$a:3"=>'0',"$a:2"=>'1',"$a:1"=>'1'] && $rows["$a:1"]['blade_name']==='Two','The flag reflects the membership');
check($rows["$a:2"]['_editable']===['access'] && $rows["$a:2"]['_actions']===['update'],'Only the access switch is editable');
foreach(['create','delete','get'] as $missing)fails(fn()=>$workspace->registry->get(Tenancy::MEMBERS,$missing),404,"No $missing action on the access list");
$audits=fn()=>(int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE resource='blade_tenant_members' AND action='update' AND outcome='success'")->fetchColumn();
$before=$audits();
$result=$workspace->executor->edit($admin,Tenancy::MEMBERS,"$a:2",'access','0',$rows["$a:2"]['revision']);
check(!$workspace->tenancy->member('2',$a) && $db->query("SELECT COUNT(*) FROM blade_tenant_members WHERE tenant_id='$a' AND actor_id='2'")->fetchColumn()==0 && $result['values']===['access'=>'0'] && $audits()===$before+1,'Switching access off deletes the membership (audited)');
fails(fn()=>$workspace->context($one,'ui',$a),403,'Revocation takes effect on the next request');
fails(fn()=>$workspace->executor->edit($admin,Tenancy::MEMBERS,"$a:2",'access','1',$rows["$a:2"]['revision']),409,'A stale revision is refused');
$workspace->executor->edit($admin,Tenancy::MEMBERS,"$a:2",'access','1',$result['revision']);
check($workspace->tenancy->member('2',$a) && $access($a)["$a:2"]['access']==='1' && $audits()===$before+2,'Switching access on inserts the membership (audited)');
$workspace->executor->edit($admin,Tenancy::MEMBERS,"$a:2",'access','1',$access($a)["$a:2"]['revision']);
check($db->query("SELECT COUNT(*) FROM blade_tenant_members WHERE tenant_id='$a' AND actor_id='2'")->fetchColumn()==1,'Switching on an existing membership keeps one row');
$account=$run($admin,Accounts::RESOURCE,'get','2');
check(in_array($a,explode(',',$account['blade_tenant_ids']),true),'The Users form multiselect follows the access list');
fails(fn()=>$workspace->executor->edit($admin,Tenancy::MEMBERS,"$a:2",'blade_email','x@example.test',$access($a)["$a:2"]['revision']),403,'Only the access switch is written');
fails(fn()=>$workspace->executor->edit($admin,Tenancy::MEMBERS,"$a:999",'access','1','x'),404,'An unknown account is not found');
fails(fn()=>$workspace->executor->edit($admin,Tenancy::MEMBERS,"999:2",'access','1','x'),404,'An unknown tenant is not found');
fails(fn()=>$workspace->executor->edit($workspace->context($none,'ui',$b),Tenancy::MEMBERS,"$a:3",'access','1','x'),403,'Access changes need the right');
check($audits()===$before+3 && (int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE resource='blade_tenant_members' AND action='update' AND outcome='rejected'")->fetchColumn()>=4,'Rejected access changes are journaled too');
$tenantRow=$run($admin,Tenancy::RESOURCE,'get',$b);
$run($admin,Tenancy::RESOURCE,'update',$b,['name'=>'Béta','active'=>'0','revision'=>$tenantRow['revision']]);
check(!$workspace->tenancy->member('3',$b) && $workspace->tenancy->memberships('1')===[$a=>'Alfa'],'A deactivated tenant drops out of every membership');
$tenantRow=$run($admin,Tenancy::RESOURCE,'get',$b);$run($admin,Tenancy::RESOURCE,'update',$b,['name'=>'Béta','active'=>'1','revision'=>$tenantRow['revision']]);
$tenantView=array_values(array_filter($workspace->views($admin->actor),fn($v)=>$v['resource']===Tenancy::RESOURCE))[0];
check(($tenantView['options']['subview']['resource']??null)===Tenancy::MEMBERS && $tenantView['options']['subview']['field']==='tenant_id' && $tenantView['options']['subview']['view']['resource']===Tenancy::MEMBERS && !in_array('members',array_column($tenantView['options']['columns'],'id'),true),'Tenants expand to their member list (a sub-view)');
check(($tenantView['options']['subview']['select']??null)===false && $workspace->registry->subviewOf(Tenancy::RESOURCE)['select']===false && $tenantView['options']['subview']['view']['title']==='Hozzáférések','The access list sub-view is not selectable');
check(!in_array(Tenancy::MEMBERS,array_column($workspace->views($admin->actor),'resource'),true),'The embedded member list has no menu entry of its own');
foreach([['projects','missing','x'],['projects','projects','title'],['projects','notices','missing']] as $invalid){
    try{$workspace->registry->subview(...$invalid);throw new LogicException('accepted');}catch(InvalidArgumentException){}
}
check(!isset(array_values(array_filter($workspace->views($none),fn($v)=>$v['resource']===Tenancy::RESOURCE))[0]),'No tenant administration without its rights');
$renamed=$run($admin,Tenancy::RESOURCE,'create',null,['name'=>'Gamma']);
check($db->query('SELECT active FROM blade_tenants WHERE id='.(int)$renamed['id'])->fetchColumn()==1,'Administrators create tenants (active by default)');

// API keys: bound to one of the owner's tenants or global; tenant, scope and owner rights must all allow.
$keys=fn(array $values)=>$run($admin,ApiKeys::RESOURCE,'create',null,[...$values,'expires_at'=>gmdate('Y-m-d',time()+86400)]);
fails(fn()=>$keys(['label'=>'Foreign','actor_id'=>'2','tenant_id'=>$b,'scopes'=>['projects.list']]),400,'A key cannot be bound to a tenant its owner is not in','tenant_id');
$secret=$keys(['label'=>'Alfa','actor_id'=>'1','tenant_id'=>$a,'scopes'=>['projects.list','projects.get']])['reveal']['value'];
$global=$keys(['label'=>'Global','actor_id'=>'1','tenant_id'=>'','scopes'=>['projects.list','notices.list']])['reveal']['value'];
$tokens=new Tokens($db,true);
check($tokens->authenticate($secret)['tenant']===$a && $tokens->authenticate($global)['tenant']==='','The key carries its tenant binding');
$api=$workspace->context($two,'api',$tokens->authenticate($secret)['tenant'],$tokens->authenticate($secret)['scopes']);
check(array_column($run($api,'projects','list','',['limit'=>50])['items'],'title')===['Béta 1','Alfa 2','Alfa 1'],'Tenant key reads its tenant (Alfa, with its own "Béta 1")');
fails(fn()=>$run($api,'projects','get','3'),404,'Tenant key: another tenant\'s object is not found');
$globalApi=$workspace->context($two,'api',null,$tokens->authenticate($global)['scopes']);
fails(fn()=>$run($globalApi,'projects','list','',['limit'=>10]),403,'A global key reaches no tenant-scoped resource');
check(array_column($run($globalApi,'notices','list','',['limit'=>10])['items'],'title')===['Közös'],'A global key reaches global resources');
fails(fn()=>$run($api,'notices','list','',[]),403,'The key scope still limits the action');
// `_subview`: each listed parent carries the count of child records the same actor could list (one grouped COUNT).
$expected=[];foreach($db->query('SELECT tenant_id, COUNT(*) FROM blade_tenant_members GROUP BY tenant_id')->fetchAll(PDO::FETCH_NUM) as [$t,$n])$expected[(string)$t]=(int)$n;
$counts=fn(array $items)=>array_column($items,'_subview','id');
$tenants=$run($admin,Tenancy::RESOURCE,'list','',['limit'=>50])['items'];
check(array_filter($counts($tenants),'is_int')===$counts($tenants) && count($counts($tenants))===count($tenants),'Every tenant carries an integer _subview');
foreach($tenants as $t)check($t['_subview']===($expected[$t['id']]??0),'Tenant '.$t['id'].' access count');
check($counts($tenants)[(string)$renamed['id']]===0 && ($tenants[0]['_subview_open']??null)===true && count($access((string)$renamed['id']))===3,'A tenant without members counts 0 but lists every account');
check($counts($run($admin,Tenancy::RESOURCE,'list',null)['items']) === $counts($tenants),'A list without parameters carries the same counts');
$db->exec("DELETE FROM blade_tenant_members WHERE tenant_id='$a' AND actor_id='1'");
check($counts($run($admin,Tenancy::RESOURCE,'list','',['limit'=>50,'mode'=>'watch'])['items'])[$a]===$expected[$a]-1,'A removed membership is not counted as access (watch snapshot)');
Tenancy::join($db,$a,'1');
// A different tenant-scoped child: counts stay in the tenant and in the child's ACL predicate.
$workspace->registry->subview('projects','tasks','project_id',embed:false);
$db->exec("INSERT INTO tasks(tenant_id,title,project_id) VALUES ('$a','A1','1'),('$a','A2','1'),('$b','foreign','1')");
$projects=$counts($run($ctxA,'projects','list','',['limit'=>50])['items']);
$inA=(int)$db->query("SELECT COUNT(*) FROM tasks WHERE tenant_id='$a' AND project_id='1'")->fetchColumn();
check($inA>=2 && $projects['1']===$inA && $projects['2']===0,'Project task counts within the tenant');
check(!array_filter($run($ctxA,'projects','list','',['limit'=>50])['items'],fn($row)=>isset($row['_subview_open'])),'A fully counted child marks no record as always expandable');
check(!isset($run($ctxA,'notices','list','',['limit'=>10])['items'][0]['_subview']),'No _subview without a sub-view');
// A child kept in the menu is a page (`activate: 'page'` target); an embedded child is not.
$projectsView=array_values(array_filter($workspace->views($one,$a),fn($v)=>$v['resource']==='projects'))[0];
check(($projectsView['options']['subview']['page']??null)===true && !isset($tenantView['options']['subview']['page']),'Only a child with its own menu entry is a page');
// SqlResource::register() forwards the activation to its view, with Registry::view() validation.
$activated=new Blade\Feature\Registry();
(new SqlResource('shelves','shelves','id',[new Field('title','Cím')]))->register($activated,'Polcok',activate:'page');
(new SqlResource('items','items','id',[new Field('shelf_id','Polc')]))->register($activated,'Tételek',activate:'update');
check(array_combine(array_column($activated->views(),'resource'),array_map(fn($v)=>$v->options['activate'],$activated->views()))===['shelves'=>'page','items'=>'update'],'SqlResource::register() forwards activate');
try{$activated->subview('shelves','items','shelf_id');throw new LogicException('accepted');}catch(InvalidArgumentException){}
$activated->subview('shelves','items','shelf_id',embed:false);
try{(new SqlResource('broken','broken','id',[new Field('title','Cím')]))->register($activated,'Hibás',activate:'delete');throw new LogicException('accepted');}catch(InvalidArgumentException){}
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope) VALUES ('user','2','tasks','list','ui','deny','all')");
$ctxA->acl->invalidate();
check($counts($run($ctxA,'projects','list','',['limit'=>50])['items'])['1']===0,'A child the actor may not list counts nothing');
// Hierarchy: the same resource, the top list filtered to an empty parent.
$db->exec('CREATE TABLE nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT \'\', bin_id TEXT NOT NULL DEFAULT \'1\')');
$db->exec("INSERT INTO nodes(title,parent_id) VALUES ('root',''),('c1','1'),('c2','1'),('c3','2')");
$db->exec('CREATE TABLE bins (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');$db->exec("INSERT INTO bins(title) VALUES ('Bin')");
(new SqlResource('nodes','nodes','id',[new Field('title','Cím',required:true),new Field('parent_id','Szülő','select',options:static fn()=>[''=>'-','1'=>'root','2'=>'c1','3'=>'c2']),new Field('bin_id','Tároló',max:20)]))->register($workspace->registry,'Csomópontok');
(new SqlResource('bins','bins','id',[new Field('title','Cím',required:true)]))->register($workspace->registry,'Tárolók');
$workspace->registry->subview('nodes','nodes','parent_id');
$workspace->registry->subview('bins','nodes','bin_id',embed:false);
foreach(['list','get'] as $action)foreach(['nodes','bins'] as $resource)$grant->execute(['2',$resource,$action,'ui']);$ctxA->acl->invalidate();
$top=$run($ctxA,'nodes','list','',['limit'=>50,'filters'=>['parent_id'=>'']])['items'];
check(array_column($top,'_subview','id')===['1'=>2],'Hierarchy: the root counts its direct children');
check($counts($run($ctxA,'nodes','list','',['limit'=>50,'filters'=>['parent_id'=>'1']])['items'])===['3'=>0,'2'=>1],'Hierarchy: children count theirs');
check($counts($run($ctxA,'bins','list','',['limit'=>50])['items'])===['1'=>1],'A hierarchy child counts its top-level records only (as it lists them)');
// Shared rows (FB-0175): a tenant reads its own and the shared rows, never writes the shared ones; an actor without a
// tenant holding a declared shared role reads and writes the shared rows only. Without the declaration nothing changes.
foreach([['tenantColumn'=>null,'sharedTenant'=>''],['tenantColumn'=>'tenant_id','sharedTenant'=>'bad value'],['tenantColumn'=>'tenant_id','sharedRoles'=>['librarian']],['tenantColumn'=>'tenant_id','sharedTenant'=>'','sharedRoles'=>['Bad']]] as $invalid)
    try{new SqlResource('docs','docs','id',[new Field('title','Cím')],...$invalid);throw new RuntimeException('An invalid shared declaration was accepted');}catch(InvalidArgumentException){}
$sdb=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($sdb);Tenancy::install($sdb);$schema($sdb);
$sdb->exec('CREATE TABLE docs (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, title TEXT NOT NULL, node_id TEXT NOT NULL DEFAULT \'\')');
$sdb->exec("CREATE TABLE nodes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");
$shared=new Workspace(new Registry(),$sdb,tenancy:true);$define($shared);
$docs=new SqlResource('docs','docs','id',[new Field('title','Cím',required:true,validation:['unique'=>true]),new Field('node_id','Csomópont',max:20)],tenantColumn:'tenant_id',sharedTenant:'',sharedRoles:['librarian']);
$docs->register($shared->registry,'Leírások');$docs->registerDelete($shared->registry);
(new SqlResource('nodes','nodes','id',[new Field('name','Név'),new Field('doc_count','Leírások','number')],counts:['doc_count'=>['resource'=>'docs','match'=>['node_id']]]))->register($shared->registry,'Csomópontok');
$shared->registry->subview('nodes','docs','node_id');
$sa=Tenancy::ensure($sdb,'Alfa');$sb=Tenancy::ensure($sdb,'Béta');
foreach([[$sa,'1'],[$sb,'1'],[$sa,'2']] as [$tenant,$actor])Tenancy::join($sdb,$tenant,$actor);
$sdb->exec("INSERT INTO nodes(name) VALUES ('Gyökér')");
$sdb->exec("INSERT INTO docs(tenant_id,title,node_id) VALUES ('','Közös alap','1'),('$sa','Alfa saját','1'),('$sb','Béta saját','1')");
$sdb->exec("INSERT INTO blade_roles(name,role_key) VALUES ('Könyvtáros','librarian')");
$sdb->exec("INSERT INTO blade_memberships(actor_id,role_id) VALUES ('3',(SELECT id FROM blade_roles WHERE role_key='librarian'))");
$sgrant=$sdb->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope) VALUES ('user',?,?,?,'ui','allow','all')");
foreach(['1','2','3'] as $actor){foreach(['list','get','create','update','delete'] as $action)$sgrant->execute([$actor,'docs',$action]);foreach(['list','get'] as $action)$sgrant->execute([$actor,'nodes',$action]);}
$srun=fn(Context $ctx,string $resource,string $action,?string $id=null,array $values=[])=>$shared->executor->execute($ctx,$resource,$action,$id,$values);
$sA=$shared->context($one,'ui',$sa);$sB=$shared->context($two,'ui',$sb);$lib=$shared->context($none);
$listed=$srun($sA,'docs','list','',['limit'=>50]);
check(array_column($listed['items'],'title')===['Alfa saját','Közös alap']&&$listed['total']===2,'Shared: the tenant lists its own and the shared rows, never another tenant\'s');
check(array_column($listed['items'],'_shared','title')===['Közös alap'=>true],'Shared: only the shared row carries _shared');
$actions=array_column($listed['items'],'_actions','title');
check(!array_intersect(['update','delete'],$actions['Közös alap'])&&in_array('get',$actions['Közös alap'],true)&&!array_diff(['update','delete'],$actions['Alfa saját']),'Shared: a shared row offers no update or delete to a tenant, its own row does');
check(array_column($srun($sB,'docs','list','',['limit'=>50])['items'],'title')===['Béta saját','Közös alap'],'Shared: switching the tenant keeps the shared rows and swaps the tenant rows');
check(array_column($shared->observe($sA,'docs',['limit'=>50])['items'],'title')===['Alfa saját','Közös alap'],'Shared: live watch includes the shared rows');
check($srun($sA,'docs','list','',['filters'=>['title'=>'Közös']])['matched']===1&&array_column($srun($sA,'docs','list','',['scope'=>['field'=>'node_id','value'=>'1']])['items'],'title')===['Alfa saját','Közös alap'],'Shared: filters and scopes include the shared rows');
check($srun($sA,'docs','get','1')['_shared']===true,'Shared: the tenant reads a shared row');
fails(fn()=>$srun($sA,'docs','get','3'),404,'Shared: another tenant\'s row is still not found');
check($srun($sA,'nodes','list','',['limit'=>50])['items'][0]['doc_count']===2&&$srun($sA,'nodes','list','',['limit'=>50])['items'][0]['_subview']===2,'Shared: count fields and sub-view counts include the shared rows');
$rev=$srun($sA,'docs','get','1')['revision'];
fails(fn()=>$srun($sA,'docs','update','1',['title'=>'Átírva','revision'=>$rev]),403,'Shared: a tenant cannot update a shared row');
fails(fn()=>$shared->executor->edit($sA,'docs','1','title','Átírva',$rev),403,'Shared: nor edit one of its fields');
fails(fn()=>$srun($sA,'docs','delete','1',['revision'=>$rev]),403,'Shared: nor delete it');
check(!$shared->executor->bulk($sA,'docs','delete',[['id'=>'1','values'=>['revision'=>$rev]]])[0]['ok'],'Shared: nor delete it in bulk');
fails(fn()=>$shared->describe($sA,$shared->registry->get('docs','update'),'1'),403,'Shared: nor open its update form');
fails(fn()=>$srun($sA,'docs','create',null,['title'=>'Csempészett','tenant_id'=>'']),400,'Shared: a tenant cannot create a row with the shared value');
$own=$srun($sA,'docs','create',null,['title'=>'Közös alap']);
check($sdb->query('SELECT tenant_id FROM docs WHERE id='.(int)$own['id'])->fetchColumn()===$sa,'Shared: a tenant\'s create stays in its tenant, unique within the tenant only');
check($sdb->query("SELECT tenant_id FROM docs WHERE id=1")->fetchColumn()===''&&$sdb->query("SELECT title FROM docs WHERE id=1")->fetchColumn()==='Közös alap','Shared: the refused writes left the shared row unchanged');
check(str_contains((string)$sdb->query("SELECT detail FROM blade_audit WHERE resource='docs' AND action='update' AND outcome='rejected' ORDER BY id DESC LIMIT 1")->fetchColumn(),'"shared":true'),'Shared: the journal records a refused write as shared');
// The shared role without a tenant: shared rows only, writes them; anyone else without a tenant fails closed.
$subviewOf=fn(Identity $actor)=>array_column($shared->views($actor),null,'resource')['nodes']['options']['subview']['resource']??null;
check($subviewOf($none)==='docs'&&$subviewOf($one)===null,'Shared: the shared role gets the view without a tenant, another actor without a tenant does not');
check(array_column($srun($lib,'docs','list','',['limit'=>50])['items'],'title')===['Közös alap'],'Shared: the shared role lists the shared rows only');
fails(fn()=>$srun($lib,'docs','get','2'),404,'Shared: a tenant row is not found for the shared role');
$created=$srun($lib,'docs','create',null,['title'=>'Új közös','node_id'=>'1']);
check($sdb->query('SELECT tenant_id FROM docs WHERE id='.(int)$created['id'])->fetchColumn()==='','Shared: the shared role\'s create stamps the shared value');
fails(fn()=>$srun($lib,'docs','create',null,['title'=>'Új közös']),400,'Shared: uniqueness holds among the shared rows','title');
$srun($lib,'docs','update','1',['title'=>'Közös alap v2','revision'=>$rev]);
check($sdb->query("SELECT title FROM docs WHERE id=1")->fetchColumn()==='Közös alap v2'&&in_array('update',$srun($lib,'docs','get','1')['_actions'],true),'Shared: the shared role edits a shared row');
$detail=$sdb->query("SELECT actor_id, tenant_id, detail FROM blade_audit WHERE resource='docs' AND action='update' AND outcome='success' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
check($detail['actor_id']==='3'&&$detail['tenant_id']===''&&json_decode((string)$detail['detail'],true)['shared']===true,'Shared: the journal records the actor and that the row is shared');
check(json_decode((string)$sdb->query("SELECT detail FROM blade_audit WHERE resource='docs' AND action='create' AND outcome='success' AND actor_id='3'")->fetchColumn(),true)['shared']===true,'Shared: a shared create is journaled as shared');
check(array_column($srun($sA,'docs','list','',['limit'=>50])['items'],'title')===['Új közös','Közös alap','Alfa saját','Közös alap v2'],'Shared: the tenant sees the new shared row');
check($srun($lib,'nodes','list','',['limit'=>50])['items'][0]['doc_count']===2,'Shared: the shared role\'s counts cover the shared rows');
$sdb->exec("DELETE FROM blade_memberships WHERE actor_id='3'");
fails(fn()=>$srun($shared->context($none),'docs','list','',[]),403,'Shared: without the role and without a tenant the resource fails closed');
check($subviewOf($none)===null,'Shared: and its view is not offered');
check($run($ctxA,'projects','list','',['limit'=>50])['items']&&!array_filter($run($ctxA,'projects','list','',['limit'=>50])['items'],fn($item)=>isset($item['_shared'])),'Shared: a resource without the declaration is unchanged');
unset($sdb,$shared);

// View availability (docs/workspaces.md#view-availability): `available` over the tenant's own state offers a view in
// one tenant and not in the other, for the built-in list and a project kind alike. A hidden view leaves no entry, no
// emptied group, no attention, no sub-view or `page` of a parent and takes its embedded sub-view along; the next
// bootstrap after a state change follows it, and the data and actions stay (ACL, not availability, governs them).
$vdb=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($vdb);Tenancy::install($vdb);
$vdb->exec('CREATE TABLE services (tenant_id TEXT NOT NULL, enabled INTEGER NOT NULL)');
$vdb->exec('CREATE TABLE topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');
$vdb->exec("CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', topic_id TEXT NOT NULL DEFAULT '')");
$vdb->exec('CREATE TABLE replies (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, text TEXT NOT NULL, feedback_id TEXT NOT NULL)');
$va=Tenancy::ensure($vdb,'Alfa');$vb=Tenancy::ensure($vdb,'Béta');Tenancy::join($vdb,$va,'1');Tenancy::join($vdb,$vb,'1');
$vdb->exec("INSERT INTO services VALUES ('$va',1),('$vb',0)");
$vdb->exec("INSERT INTO feedback(tenant_id,message) VALUES ('$va','Alfa üzenet'),('$vb','Béta üzenet')");
$seen=[];
$on=function(Context $ctx)use(&$seen):bool{$seen[]=[$ctx->actor->id,$ctx->tenant];$q=$ctx->db->prepare('SELECT enabled FROM services WHERE tenant_id=?');$q->execute([(string)$ctx->tenant]);return (bool)$q->fetchColumn();};
$avail=new Workspace(new Registry(),$vdb,tenancy:true);
(new SqlResource('topics','topics','id',[new Field('title','Cím')]))->register($avail->registry,'Témák',group:'Közös');
(new SqlResource('feedback','feedback','id',[new Field('message','Üzenet'),new Field('status','Állapot','select',options:['new'=>'Új','done'=>'Kész']),new Field('topic_id','Téma','select',options:['1'=>'Egy'])],tenantColumn:'tenant_id'))
    ->register($avail->registry,'Visszajelzések',group:'Ügyfélszolgálat',attention:['filters'=>['status'=>'new']],available:$on);
(new SqlResource('replies','replies','id',[new Field('text','Válasz'),new Field('feedback_id','Visszajelzés','select',options:['1'=>'Egy'])],tenantColumn:'tenant_id'))->register($avail->registry,'Válaszok');
$avail->registry->subview('feedback','replies','feedback_id');
$avail->registry->subview('topics','feedback','topic_id',embed:false);
$avail->registry->addView(new View('demo.board','demo.board','Tábla',group:'Közös',available:$on));
$vgrant=$vdb->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope) VALUES ('user','1',?,?,'ui','allow','all')");
foreach(['topics','feedback','replies'] as $resource)foreach(['list','get','update'] as $action)$vgrant->execute([$resource,$action]);
$offer=fn(string $tenant)=>array_column($avail->views($two,$tenant),null,'id');
$inA=$offer($va);$inB=$offer($vb);
check(isset($inA['feedback'],$inA['demo.board'])&&$inA['feedback']['group']==='Ügyfélszolgálat'&&isset($inA['feedback']['attention']),'Availability: offered with its group and attention where the closure allows it');
check(($inA['topics']['options']['subview']['view']['id']??null)==='feedback'&&($inA['topics']['options']['subview']['page']??null)===true&&$inA['feedback']['options']['subview']['view']['id']==='replies','Availability: an offered view is a parent\'s page sub-view and keeps its embedded sub-view');
check(!isset($inB['feedback'])&&!isset($inB['demo.board'])&&isset($inB['topics']),'Availability: the same application leaves the views out for the other tenant, for a list and a project kind');
check(!in_array('Ügyfélszolgálat',array_column($inB,'group'),true)&&!array_filter($inB,fn($v)=>isset($v['attention'])),'Availability: no view of the emptied group and no attention count remain');
check(!isset($inB['topics']['options']['subview'])&&!isset($inB['replies'])&&!str_contains(json_encode($inB,JSON_THROW_ON_ERROR),'"replies"'),'Availability: no sub-view or page of a parent, and the embedded sub-view of the hidden view is unreachable');
check(in_array(['1',$va],$seen,true)&&in_array(['1',$vb],$seen,true),'Availability: the closure receives the actor and the active tenant');
// The data and the actions are untouched: ACL, not availability, decides them; the next bootstrap follows the state.
check(array_column($avail->executor->execute($avail->context($two,'ui',$vb),'feedback','list','',['limit'=>10])['items'],'message')===['Béta üzenet'],'Availability: a hidden view\'s data stays and its ACL-allowed list still answers');
$vdb->exec("UPDATE services SET enabled=1 WHERE tenant_id='$vb'");$vdb->exec("UPDATE services SET enabled=0 WHERE tenant_id='$va'");
check(isset($offer($vb)['feedback'])&&!isset($offer($va)['feedback']),'Availability: the next bootstrap follows a state change');
check($avail->registry->updateView($avail->registry->viewById('feedback')->with(icon:'bi bi-chat'))->available===$on,'Availability: an updated view keeps its closure');
$avail->registry->updateView($avail->registry->viewById('topics')->with(available:static fn(Context $ctx):bool=>false));
check(!isset($offer($vb)['topics'])&&isset($offer($vb)['feedback']),'Availability: updateView() adds it to a registered view; a page child of a hidden parent keeps its own entry');
unset($vdb,$avail,$vgrant,$offer,$inA,$inB);
echo "tenancy: ok\n";

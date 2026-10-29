<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\{Schema,Tokens};
use Blade\Admin\{Accounts,Administration,ApiKeys};
use Blade\Feature\{Registry,Workspace,Context,Failure,SqlResource,Field,Lookup};
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
check(array_column($run($ctxA,'projects','list',null,[]),'title')===['Alfa 2','Alfa 1'],'Offset listing is tenant-scoped');
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
$db->exec("UPDATE blade_tenant_members SET active=0 WHERE tenant_id='$a' AND actor_id='2'");
$row=$access($a)["$a:2"];check($row['access']==='0' && !$workspace->tenancy->member('2',$a),'A suspended membership shows and acts as no access');
$workspace->executor->edit($admin,Tenancy::MEMBERS,"$a:2",'access','1',$row['revision']);
check($db->query("SELECT active FROM blade_tenant_members WHERE tenant_id='$a' AND actor_id='2'")->fetchColumn()==1 && $db->query("SELECT COUNT(*) FROM blade_tenant_members WHERE tenant_id='$a' AND actor_id='2'")->fetchColumn()==1,'Switching on re-enables a suspended membership row');
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
check(($tenantView['subview']['resource']??null)===Tenancy::MEMBERS && $tenantView['subview']['field']==='tenant_id' && $tenantView['subview']['view']['resource']===Tenancy::MEMBERS && !in_array('members',array_column($tenantView['columns'],'id'),true),'Tenants expand to their member list (a sub-view)');
check(($tenantView['subview']['select']??null)===false && $workspace->registry->subviewOf(Tenancy::RESOURCE)['select']===false && $tenantView['subview']['view']['title']==='Hozzáférések','The access list sub-view is not selectable');
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
$expected=[];foreach($db->query('SELECT tenant_id, COUNT(*) FROM blade_tenant_members WHERE active=1 GROUP BY tenant_id')->fetchAll(PDO::FETCH_NUM) as [$t,$n])$expected[(string)$t]=(int)$n;
$counts=fn(array $items)=>array_column($items,'_subview','id');
$tenants=$run($admin,Tenancy::RESOURCE,'list','',['limit'=>50])['items'];
check(array_filter($counts($tenants),'is_int')===$counts($tenants) && count($counts($tenants))===count($tenants),'Every tenant carries an integer _subview');
foreach($tenants as $t)check($t['_subview']===($expected[$t['id']]??0),'Tenant '.$t['id'].' access count');
check($counts($tenants)[(string)$renamed['id']]===0 && ($tenants[0]['_subview_open']??null)===true && count($access((string)$renamed['id']))===3,'A tenant without members counts 0 but lists every account');
check($counts($run($admin,Tenancy::RESOURCE,'list',null)) === $counts($tenants),'The plain listing carries the same counts');
$db->exec("UPDATE blade_tenant_members SET active=0 WHERE tenant_id='$a' AND actor_id='1'");
check($counts($run($admin,Tenancy::RESOURCE,'list','',['limit'=>50,'mode'=>'watch'])['items'])[$a]===$expected[$a]-1,'A suspended membership is not counted as access (watch snapshot)');
$db->exec("UPDATE blade_tenant_members SET active=1 WHERE tenant_id='$a' AND actor_id='1'");
// A different tenant-scoped child: counts stay in the tenant and in the child's ACL predicate.
$workspace->registry->subview('projects','tasks','project_id',embed:false);
$db->exec("INSERT INTO tasks(tenant_id,title,project_id) VALUES ('$a','A1','1'),('$a','A2','1'),('$b','foreign','1')");
$projects=$counts($run($ctxA,'projects','list','',['limit'=>50])['items']);
$inA=(int)$db->query("SELECT COUNT(*) FROM tasks WHERE tenant_id='$a' AND project_id='1'")->fetchColumn();
check($inA>=2 && $projects['1']===$inA && $projects['2']===0,'Project task counts within the tenant');
check(!array_filter($run($ctxA,'projects','list','',['limit'=>50])['items'],fn($row)=>isset($row['_subview_open'])),'A fully counted child marks no record as always expandable');
check(!isset($run($ctxA,'notices','list','',['limit'=>10])['items'][0]['_subview']),'No _subview without a sub-view');
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
echo "tenancy: ok\n";

<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\{Schema,Tokens};
use Blade\Admin\{Accounts,Administration,ApiKeys,Permissions};
use Blade\Feature\{Registry,Workspace,Context,Failure,SqlResource,Field};
use Blade\Shell\{Identity,SqlIdentityProvider};
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message,?string $field=null):void{
    try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.': '.$e->getMessage().')');if($field!==null)check(isset($e->fieldErrors[$field]),$message.' (field error)');return;}
    throw new RuntimeException($message.' (accepted)');
}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$db->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL)');
$insert=$db->prepare('INSERT INTO accounts(id,email,password_hash,display_name) VALUES (?,?,?,?)');
foreach([[1,'admin@example.test','Admin'],[2,'robot@example.test','Robot']] as [$id,$email,$name])$insert->execute([$id,$email,password_hash('initial-password-1',PASSWORD_DEFAULT),$name]);
$db->exec('CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT)');$db->exec("INSERT INTO notes(title) VALUES ('Synthetic')");
$registry=new Registry();$workspace=new Workspace($registry,$db);
(new SqlResource('notes','notes','id',[new Field('title','Cím',required:true)]))->register($registry,'Jegyzetek');
$accounts=new Accounts($workspace,'accounts','id','email','display_name','password_hash');
$identities=Administration::register($workspace,$accounts,new SqlIdentityProvider($db,'accounts','id','email','password_hash','display_name'));
check(array_column($registry->views(),'resource')===['notes',Accounts::RESOURCE,Permissions::ROLES,Permissions::MEMBERSHIPS,Permissions::ROLE_RULES,Permissions::USER_RULES,ApiKeys::RESOURCE],'Administration registers the mandatory admin views');
$admin=new Context(new Identity('1','Admin'),'ui',$workspace->acl,$db);
$run=fn(string $action,?string $id=null,array $values=[])=>$workspace->executor->execute($admin,ApiKeys::RESOURCE,$action,$id,$values);
fails(fn()=>$run('create',null,['label'=>'X','actor_id'=>'2','scopes'=>'notes.list','expires_at'=>gmdate('Y-m-d',time()+86400)]),403,'Default deny');
Permissions::grantAdministration($db,$registry,'1');
check((int)$db->query("SELECT COUNT(*) FROM blade_rules WHERE resource='blade_api_keys' AND action='create'")->fetchColumn()===1,'First administrator receives API key administration');

// Choices are catalogue operations on the API channel; the secret is shown once, only its hash is stored.
$form=$workspace->views(new Identity('1','Admin'));$view=array_values(array_filter($form,fn($v)=>$v['resource']===ApiKeys::RESOURCE))[0];
check($view['group']===null && $view['icon']==='dxi dxi-key','API keys are a top-level menu feature');
$scopes=array_values(array_filter($view['actions'],fn($a)=>$a['name']==='create'))[0]['fields'][2];
check($scopes['type']==='multiselect' && isset($scopes['options']['notes.list']) && !isset($scopes['options']['blade_roles.delete']),'Scope choices from API catalogue');
$future=gmdate('Y-m-d',time()+30*86400);
$created=$run('create',null,['label'=>'Integration','actor_id'=>'2','scopes'=>['notes.list','notes.get'],'expires_at'=>$future]);
$secret=$created['reveal']['value'];
$adminOwned=$run('create',null,['label'=>'Admin-owned','actor_id'=>'1','scopes'=>'notes.get','expires_at'=>$future]);
check(preg_match('/^[a-f0-9]{64}$/D',$secret)===1,'Secret revealed once');
$stored=$db->query('SELECT * FROM blade_tokens WHERE id='.(int)$created['id'])->fetch(PDO::FETCH_ASSOC);
check($stored['token_hash']===hash('sha256',$secret) && $stored['scopes']==='notes.list,notes.get' && $stored['expires_at']===$future.'T23:59:59Z','Hash, scope list and end-of-day expiry stored');
check(!str_contains(json_encode($run('list')),$secret) && !str_contains(json_encode($run('get',$created['id'])),'token_hash'),'Secret and hash never listed');
check(!str_contains(json_encode($db->query('SELECT * FROM blade_audit')->fetchAll()),$secret),'Secret never audited');
$tokens=new Tokens($db);
check($tokens->authenticate($secret)===['actor_id'=>'2','scopes'=>['notes.list','notes.get']],'Issued key authenticates with its scopes');
check(!array_filter($workspace->views(new Identity('2','Robot')),fn($candidate)=>$candidate['resource']===ApiKeys::RESOURCE),'No API-key menu without a UI permission');

// The key only narrows: without the owner's API rule the call is still denied.
$api=new Context(new Identity('2','Robot'),'api',$workspace->acl,$db,$tokens->authenticate($secret)['scopes']);
fails(fn()=>$workspace->executor->execute($api,'notes','get','1',[]),404,'Key without API ACL');
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','2','notes','get','api','allow','all','','')");
check($workspace->executor->execute($api,'notes','get','1',[])['title']==='Synthetic','Key and API ACL together allow');
fails(fn()=>$workspace->executor->execute(new Context(new Identity('2','Robot'),'api',$workspace->acl,$db,['notes.list']),'notes','get','1',[]),403,'Operation outside the key');

// A user with own-scope API-key rules gets the root menu and only their keys.
foreach (['list','get','create','update'] as $action) {
    $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','2',?,'$action','ui','allow','own','','')")->execute([ApiKeys::RESOURCE]);
}
$user=new Context(new Identity('2','Robot'),'ui',$workspace->acl,$db);
$userViews=$workspace->views($user->actor);
$userView=array_values(array_filter($userViews,fn($candidate)=>$candidate['resource']===ApiKeys::RESOURCE))[0]??null;
check($userView!==null && $userView['group']===null,'Own API-key permission exposes the root menu');
$runUser=fn(string $action,?string $id=null,array $values=[])=>$workspace->executor->execute($user,ApiKeys::RESOURCE,$action,$id,$values);
$ownCreated=$runUser('create',null,['label'=>'Own','actor_id'=>'','scopes'=>'notes.get','expires_at'=>$future]);
check((string)$db->query('SELECT actor_id FROM blade_tokens WHERE id='.(int)$ownCreated['id'])->fetchColumn()==='2','Self-scoped issue stores the current actor');
check(count($runUser('list'))===2 && !array_filter($runUser('list'),fn($item)=>(string)$item['actor_id']!=='2'),'Self-scoped list is owner-filtered');
fails(fn()=>$runUser('get',$adminOwned['id']),403,'Own scope hides another owner key');
$ownRow=$runUser('get',$ownCreated['id']);
fails(fn()=>$runUser('update',$ownCreated['id'],['label'=>'Own','actor_id'=>'1','scopes'=>'notes.get','expires_at'=>$ownRow['expires_at'],'revoked'=>'0','revision'=>$ownRow['revision']]),400,'Own scope cannot transfer a key','actor_id');

// Validation: catalogue scopes, future bounded expiry, fixed owner, one-way revocation.
fails(fn()=>$run('create',null,['label'=>'Bad','actor_id'=>'2','scopes'=>'notes.delete','expires_at'=>$future]),400,'Unknown operation','scopes');
fails(fn()=>$run('create',null,['label'=>'Bad','actor_id'=>'2','scopes'=>'notes.list,notes.list','expires_at'=>$future]),400,'Duplicate operation','scopes');
fails(fn()=>$run('create',null,['label'=>'Bad','actor_id'=>'2','scopes'=>'notes.list','expires_at'=>'2001-01-01']),400,'Past expiry','expires_at');
fails(fn()=>$run('create',null,['label'=>'Bad','actor_id'=>'2','scopes'=>'notes.list','expires_at'=>gmdate('Y-m-d',time()+400*86400)]),400,'Too long expiry','expires_at');
fails(fn()=>$run('create',null,['label'=>'Bad','actor_id'=>'2','scopes'=>'notes.list','expires_at'=>'2030-02-30']),400,'Invalid date','expires_at');
$row=$run('get',$created['id']);
fails(fn()=>$run('update',$created['id'],['label'=>'Integration','actor_id'=>'1','scopes'=>'notes.list','expires_at'=>$row['expires_at'],'revoked'=>'0','revision'=>$row['revision']]),400,'Owner fixed','actor_id');
$run('update',$created['id'],['label'=>'Renamed','actor_id'=>'2','scopes'=>'notes.get','expires_at'=>$row['expires_at'],'revoked'=>'0','revision'=>$row['revision']]);
check($tokens->authenticate($secret)['scopes']===['notes.get'],'Scope narrowed on the form');
$workspace->executor->edit($admin,ApiKeys::RESOURCE,$created['id'],'revoked',true,$run('get',$created['id'])['revision']);
check($tokens->authenticate($secret)===null,'Grid checkbox revokes at once');
fails(fn()=>$workspace->executor->edit($admin,ApiKeys::RESOURCE,$created['id'],'revoked','0',$run('get',$created['id'])['revision']),409,'Revocation is one-way','revoked');

// Old JSON scope storage keeps working.
$legacy=$tokens->issue('2','legacy',['notes.get']);check($tokens->authenticate($legacy['secret'])['scopes']===['notes.get'],'JSON scope storage');
echo "61ade API key administration (A3) tests passed.\n";

<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Admin\{Accounts,Permissions};
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
foreach([[1,'one@example.test','One'],[2,'two@example.test','Two'],[3,'three@example.test','Three']] as [$id,$email,$name])$insert->execute([$id,$email,password_hash('initial-password-1',PASSWORD_DEFAULT),$name]);
$db->exec('CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT)');$db->exec("INSERT INTO notes(title) VALUES ('Synthetic')");
$registry=new Registry();$workspace=new Workspace($registry,$db);
(new SqlResource('notes','notes','id',[new Field('title','Cím',required:true)]))->register($registry,'Jegyzetek');
$accounts=new Accounts($workspace,'accounts','id','email','display_name','password_hash');$accounts->register($registry);
$identities=$accounts->identities(new SqlIdentityProvider($db,'accounts','id','email','password_hash','display_name'));
$permissions=new Permissions($workspace,$accounts,$identities);$permissions->register($registry);
$as=fn(string $id)=>new Context(new Identity($id,'Actor '.$id),'ui',$workspace->acl,$db);
$run=fn(string $actor,string $resource,string $action,?string $id=null,array $values=[])=>$workspace->executor->execute($as($actor),$resource,$action,$id,$values);
$rules=fn()=>(int)$db->query('SELECT COUNT(*) FROM blade_rules')->fetchColumn();

// The catalogue is derived from definitions and grants nothing by itself.
$catalogue=$permissions->catalogue();
check($catalogue->allows('notes','list','ui') && $catalogue->allows(Accounts::RESOURCE,'temporary_password','api'),'Catalogue lists registered actions');
check(!$catalogue->allows('notes','delete','ui') && !$catalogue->allows(Permissions::ROLES,'delete','api'),'Catalogue rejects unregistered action and channel');
check(isset($catalogue->resources()['notes']) && in_array('title',$catalogue->fields('notes'),true),'Catalogue resources and fields');
check($rules()===0 && $run('1',Permissions::ROLES,'list')===[],'No automatic grant');
fails(fn()=>$run('1','notes','get','1'),403,'Business resource denied by default');

// Explicit first-administrator step: idempotent, audited, admin resources only.
Permissions::grantAdministration($db,$registry,'1');$granted=$rules();
Permissions::grantAdministration($db,$registry,'1');
check($granted>0 && $rules()===$granted,'Idempotent administration grant');
check((int)$db->query("SELECT COUNT(*) FROM blade_rules WHERE resource='notes'")->fetchColumn()===0,'Grant does not reach business resources');
check((int)$db->query("SELECT COUNT(*) FROM blade_rules WHERE channel<>'ui'")->fetchColumn()===0,'Grant is UI only');
check((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE action='grant_administration'")->fetchColumn()===2,'Grant audited');
$adminRole=(string)$db->query("SELECT id FROM blade_roles WHERE role_key='admin'")->fetchColumn();
check(count($run('1',Permissions::ROLES,'list'))===1,'Administrator manages roles');

// Roles: stable key, unique values, protected role cannot be deleted.
$editor=$run('1',Permissions::ROLES,'create',null,['name'=>'Szerkesztő','role_key'=>'editor'])['id'];
fails(fn()=>$run('1',Permissions::ROLES,'create',null,['name'=>'Other','role_key'=>'Editor X']),400,'Role key pattern','role_key');
fails(fn()=>$run('1',Permissions::ROLES,'create',null,['name'=>'Other','role_key'=>'editor']),400,'Unique role key','role_key');
$row=$run('1',Permissions::ROLES,'get',$editor);
fails(fn()=>$run('1',Permissions::ROLES,'update',$editor,['name'=>'Szerkesztő','role_key'=>'changed','revision'=>$row['revision']]),400,'Immutable role key','role_key');
$run('1',Permissions::ROLES,'update',$editor,['name'=>'Szerkesztők','role_key'=>'editor','revision'=>$row['revision']]);
$row=$run('1',Permissions::ROLES,'get',$adminRole);
fails(fn()=>$run('1',Permissions::ROLES,'delete',$adminRole,['revision'=>$row['revision']]),403,'Protected role not deletable');

// Role rules are validated against the catalogue before they can grant anything.
$base=['subject_id'=>$editor,'resource'=>'notes','action'=>'list','channel'=>'ui','effect'=>'allow','scope'=>'all'];
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'action'=>'delete']),400,'Unknown catalogue pair','action');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'channel'=>'api','resource'=>Permissions::ROLES,'action'=>'delete']),400,'Channel outside catalogue','action');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'field_name'=>'missing']),400,'Unknown field','field_name');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'scope'=>'id']),400,'Object scope needs id','object_id');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'object_id'=>'1']),400,'Object id only for object scope','object_id');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'resource'=>Accounts::RESOURCE,'effect'=>'deny']),403,'No deny on admin resources');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'subject_id'=>'999']),400,'Unknown role','subject_id');
$rule=$run('1',Permissions::ROLE_RULES,'create',null,$base)['id'];
$second=$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'action'=>'get'])['id'];
// Composite uniqueness: same subject and target conflicts regardless of effect; empty optional values compare equal.
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,$base),409,'Duplicate role rule','action');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'create',null,[...$base,'effect'=>'deny','object_id'=>'','field_name'=>'']),409,'Contradicting role rule','resource');
$row=$run('1',Permissions::ROLE_RULES,'get',$second);
fails(fn()=>$run('1',Permissions::ROLE_RULES,'update',$second,[...$base,'revision'=>$row['revision']]),409,'Update into duplicate rule','action');
check($db->query("SELECT subject_type FROM blade_rules WHERE id=".(int)$rule)->fetchColumn()==='role','Role rule subject type is fixed');
check($run('3','notes','list')===[],'No access before membership');

// Memberships give role rules to users; duplicates conflict.
$membership=$run('1',Permissions::MEMBERSHIPS,'create',null,['actor_id'=>'3','role_id'=>$editor])['id'];
check(count($run('3','notes','list'))===1,'Role rule applies through membership');
fails(fn()=>$run('1',Permissions::MEMBERSHIPS,'create',null,['actor_id'=>'3','role_id'=>$editor]),409,'Duplicate membership','role_id');
fails(fn()=>$run('1',Permissions::MEMBERSHIPS,'create',null,['actor_id'=>'999','role_id'=>$editor]),400,'Unknown account','actor_id');
$row=$run('1',Permissions::ROLES,'get',$editor);
fails(fn()=>$run('1',Permissions::ROLES,'delete',$editor,['revision'=>$row['revision']]),409,'Role with members or rules not deletable');

// User rules: a field-level deny for one user; the subject type stays separate from role rules.
$run('1',Permissions::USER_RULES,'create',null,['subject_id'=>'3','resource'=>'notes','action'=>'get','channel'=>'ui','effect'=>'deny','scope'=>'all','field_name'=>'title']);
check(!isset($run('3','notes','get','1')['title']),'User field deny applies');
check(count($run('1',Permissions::USER_RULES,'list'))===1 && count($run('1',Permissions::ROLE_RULES,'list'))>2,'Role and user rule views are separate');
fails(fn()=>$run('1',Permissions::USER_RULES,'get',$rule),404,'Role rule not reachable as user rule');

// Orphaned rules (definition removed) stay visible and grant nothing.
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('role','$editor','gone','list','ui','allow','all','','')");
$field=array_values(array_filter($registry->get(Permissions::ROLE_RULES,'create')->fields,fn($f)=>$f->name==='resource'))[0];
check(str_contains($field->metadata($as('1'))['options']['gone']??'','nincs a katalógusban'),'Orphan resource is labelled');
fails(fn()=>$run('3','gone','list'),404,'Orphan rule grants nothing');

// Protected role: its admin rules are immutable in the UI.
$protected=(string)$db->query("SELECT id FROM blade_rules WHERE subject_type='role' AND subject_id='$adminRole' AND resource='blade_roles' AND action='list'")->fetchColumn();
$row=$run('1',Permissions::ROLE_RULES,'get',$protected);
fails(fn()=>$run('1',Permissions::ROLE_RULES,'update',$protected,[...$base,'subject_id'=>$adminRole,'resource'=>'blade_roles','revision'=>$row['revision']]),403,'Protected rule update');
fails(fn()=>$run('1',Permissions::ROLE_RULES,'delete',$protected,['revision'=>$row['revision']]),403,'Protected rule delete');

// Last active member and self protection.
$own=(string)$db->query("SELECT id FROM blade_memberships WHERE actor_id='1' AND role_id='$adminRole'")->fetchColumn();
fails(fn()=>$run('1',Permissions::MEMBERSHIPS,'delete',$own,['revision'=>$run('1',Permissions::MEMBERSHIPS,'get',$own)['revision']]),403,'Own protected membership');
$second=$run('1',Permissions::MEMBERSHIPS,'create',null,['actor_id'=>'2','role_id'=>$adminRole])['id'];
$disable=fn(string $actor,string $id,string $value)=>$workspace->executor->edit($as($actor),Accounts::RESOURCE,$id,'blade_disabled',$value,$run($actor,Accounts::RESOURCE,'get',$id)['revision']);
$disable('2','1','1');
check($identities->find('1')===null,'Second administrator disabled the first');
$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','3',?,?,'ui','allow','all','','')")->execute([Permissions::MEMBERSHIPS,'get']);
$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','3',?,?,'ui','allow','all','','')")->execute([Permissions::MEMBERSHIPS,'delete']);
$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','3',?,?,'ui','allow','all','','')")->execute([Accounts::RESOURCE,'get']);
$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','3',?,?,'ui','allow','all','','')")->execute([Accounts::RESOURCE,'update']);
fails(fn()=>$run('3',Permissions::MEMBERSHIPS,'delete',$second,['revision'=>$run('3',Permissions::MEMBERSHIPS,'get',$second)['revision']]),409,'Last active member cannot be removed');
fails(fn()=>$disable('3','2','1'),409,'Last active member cannot be disabled');
$disable('2','1','0');
$disable('3','2','1');
check($identities->find('2')===null,'Disable allowed while another active member remains');

// Every change went through the executor and its audit, without values.
$audit=$db->query("SELECT resource||'.'||action FROM blade_audit WHERE outcome='success'")->fetchAll(PDO::FETCH_COLUMN);
foreach([Permissions::ROLES.'.create',Permissions::ROLE_RULES.'.create',Permissions::USER_RULES.'.create',Permissions::MEMBERSHIPS.'.create'] as $event)check(in_array($event,$audit,true),'Audited '.$event);
check(!str_contains(json_encode($db->query('SELECT * FROM blade_audit')->fetchAll()),'Szerkesztő'),'No values in audit');
echo "61de built-in role, membership, rule and catalogue administration (A2) tests passed.\n";

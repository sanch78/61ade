<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Vapa\Access\{Schema,Tokens};
use Vapa\Admin\Accounts;
use Vapa\Configuration\AdminConfiguration;
use Vapa\Feature\{Registry,Workspace,Context,Failure};
use Vapa\Shell\{Identity,SqlIdentityProvider};
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message,?string $field=null):Failure{
    try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.')');if($field!==null)check(isset($e->fieldErrors[$field]),$message.' (field error)');return $e;}
    throw new RuntimeException($message.' (accepted)');
}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$db->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)');
$insert=$db->prepare('INSERT INTO accounts(id,email,password_hash,display_name) VALUES (?,?,?,?)');
foreach([[1,'admin@example.test','Admin'],[2,'user@example.test','User']] as [$id,$email,$name])$insert->execute([$id,$email,password_hash('initial-password-1',PASSWORD_DEFAULT),$name]);
$registry=new Registry();$workspace=new Workspace($registry,$db);
$accounts=new Accounts($workspace,'accounts','id','email','display_name','password_hash',createDefaults:['active'=>1]);
$accounts->register($registry);
$identities=$accounts->identities(new SqlIdentityProvider($db,'accounts','id','email','password_hash','display_name',['active'],allowed:static fn(array $row)=>(bool)$row['active']));
$admin=new Context(new Identity('1','Admin'),'ui',$workspace->acl,$db);
$user=new Context(new Identity('2','User'),'ui',$workspace->acl,$db);
$run=fn(Context $ctx,string $action,?string $id=null,array $values=[])=>$workspace->executor->execute($ctx,Accounts::RESOURCE,$action,$id,$values);

// Default deny: the module is an ordinary ACL resource without an admin bypass.
check($run($user,'list')===[],'Default deny list');
fails(fn()=>$run($user,'get','1'),403,'Default deny get');
fails(fn()=>$run($user,'create',null,['display_name'=>'X','email'=>'x@example.test']),403,'Default deny create');
$rule=$db->prepare("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1',?,?,?,'allow','all','','')");
foreach(['list','get','create','update','deactivate','reactivate','temporary_password'] as $action)$rule->execute([Accounts::RESOURCE,$action,'ui']);
check(count($run($admin,'list'))===2,'Granted list');
check(array_column($registry->views(),'resource')===[Accounts::RESOURCE],'Users view registered');
check(in_array('deactivate',$registry->views()[0]['actions'],true),'Lifecycle actions in view');

// Creation issues a generated temporary password exactly once; the e-mail is normalized.
$created=$run($admin,'create',null,['display_name'=>'New Person','email'=>'  New.Person@Example.TEST ']);
$temporary=$created['reveal']['value'];
check(strlen($temporary)===20 && preg_match('/^[A-Za-z0-9]{20}$/D',$temporary)===1,'Generated temporary password');
check($db->query('SELECT email FROM accounts WHERE id='.(int)$created['id'])->fetchColumn()==='new.person@example.test','E-mail normalized');
$state=$accounts->state($created['id']);
check($state['must_change'] && abs($state['expires']-(time()+72*3600))<5,'Forced change for 72 hours');
check(!str_contains(json_encode($db->query('SELECT * FROM vapa_audit')->fetchAll()),$temporary),'Temporary password never audited');
check(!str_contains((string)$db->query('SELECT password_hash FROM accounts WHERE id='.(int)$created['id'])->fetchColumn(),$temporary),'Password stored only as hash');
fails(fn()=>$run($admin,'create',null,['display_name'=>'Dup','email'=>'NEW.PERSON@example.test']),400,'Unique e-mail','email');
fails(fn()=>$run($admin,'create',null,['display_name'=>'Bad','email'=>'not-an-email']),400,'E-mail format','email');
fails(fn()=>$run($admin,'create',null,['display_name'=>'Bad','email'=>'b@example.test','vapa_disabled'=>'1']),400,'Read-only state is not writable');

// Sign-in with the temporary password leads to the forced change; nothing else is accepted.
$identity=$identities->authenticate('NEW.person@example.test',$temporary);
check($identity!==null && $accounts->mustChangePassword($identity->id),'Temporary sign-in requires change');
$id=$identity->id;
fails(fn()=>$accounts->completeForcedChange($id,'short','short'),400,'Minimum length','new_password');
fails(fn()=>$accounts->completeForcedChange($id,'a-long-password-1','a-long-password-2'),400,'Confirmation mismatch','confirm_password');
fails(fn()=>$accounts->completeForcedChange($id,$temporary,$temporary),400,'Temporary password reuse','new_password');
$version=$workspace->version($id);
$accounts->completeForcedChange($id,'chosen-password-1','chosen-password-1');
check(!$accounts->mustChangePassword($id) && $workspace->version($id)>$version,'Change clears flag and revokes sessions');
check($identities->authenticate('new.person@example.test',$temporary)===null,'Temporary password retired');
check($identities->authenticate('new.person@example.test','chosen-password-1')!==null,'Chosen password works');
fails(fn()=>$accounts->completeForcedChange($id,'other-password-1','other-password-1'),401,'No change without pending flag');
check((int)$db->query("SELECT COUNT(*) FROM vapa_audit WHERE action='password_change_forced' AND outcome='success'")->fetchColumn()===1,'Forced change audited');

// A new temporary password expires; an expired one cannot sign in or complete the change.
$reissued=$run($admin,'temporary_password',$id)['reveal']['value'];
check($accounts->mustChangePassword($id),'Reissue forces change');
$db->exec("UPDATE vapa_account_state SET temporary_expires_at=".(time()-1)." WHERE actor_id='$id'");
check($identities->authenticate('new.person@example.test',$reissued)===null,'Expired temporary password rejected');
fails(fn()=>$accounts->completeForcedChange($id,'later-password-1','later-password-1'),401,'Expired change rejected');
fails(fn()=>$run($admin,'temporary_password','1'),403,'No temporary password for self');

// Disabling ends sessions and tokens at once; self-disable and repeated transitions are rejected.
$tokens=new Tokens($db);$token=$tokens->issue('2','test',[Accounts::RESOURCE.'.get']);
$row=$run($admin,'get','2');
$run($admin,'deactivate','2');
check($identities->find('2')===null && $identities->authenticate('user@example.test','initial-password-1')===null,'Disabled account unavailable');
check($tokens->authenticate($token['secret'])===null,'Disabled account token revoked');
fails(fn()=>$run($admin,'deactivate','2'),409,'Repeated disable');
fails(fn()=>$run($admin,'deactivate','1'),403,'Self disable');
fails(fn()=>$run($admin,'update','2',['display_name'=>'Stale','email'=>'user@example.test','revision'=>$row['revision']]),409,'State change invalidates revision');
$run($admin,'reactivate','2');
check($identities->find('2')!==null,'Reactivated account available');
fails(fn()=>$run($admin,'reactivate','2'),409,'Repeated reactivate');

// Changing the sign-in e-mail revokes the account's sessions and tokens.
$token=$tokens->issue('2','test',[Accounts::RESOURCE.'.get']);$version=$workspace->version('2');
$row=$run($admin,'get','2');
$run($admin,'update','2',['display_name'=>'User','email'=>'renamed@example.test','revision'=>$row['revision']]);
check($workspace->version('2')>$version && $tokens->authenticate($token['secret'])===null,'E-mail change revokes access');
$row=$run($admin,'get','1');
check(($run($admin,'update','1',['display_name'=>'Admin','email'=>'admin2@example.test','revision'=>$row['revision']])['reauthenticate']??false)===true,'Own e-mail change requires sign-in');

// API: token scope only narrows; a UI grant does not reach the API channel.
$api=new Context(new Identity('1','Admin'),'api',$workspace->acl,$db,[Accounts::RESOURCE.'.get']);
fails(fn()=>$workspace->executor->execute($api,Accounts::RESOURCE,'get','2',[]),404,'UI grant does not open API');
fails(fn()=>$workspace->executor->execute(new Context(new Identity('1','Admin'),'api',$workspace->acl,$db,[]),Accounts::RESOURCE,'list',null,[]),403,'Scope required on API');
$listing=json_encode($run($admin,'list'));check(!str_contains($listing,'password_hash') && !str_contains($listing,'$2y$') && !str_contains($listing,'$argon'),'No password data in listing');

// Configuration and construction guards.
try{new Accounts($workspace,'accounts','id','email','display_name','password_hash',verify:static fn()=>true);throw new RuntimeException('Verifier without encoder accepted');}catch(InvalidArgumentException){}
try{new Accounts($workspace,'accounts','id','email','display_name','password_hash',createDefaults:['email'=>'x']);throw new RuntimeException('Identity default accepted');}catch(InvalidArgumentException){}
$readonly=new Registry();(new Accounts(new Workspace($readonly,$db),'accounts','id','email','display_name','password_hash',creatable:false))->register($readonly);
try{$readonly->get(Accounts::RESOURCE,'create');throw new RuntimeException('Create registered for non-insertable store');}catch(Failure){}
$identity=['table'=>'accounts','id_column'=>'id','username_column'=>'email','password_column'=>'password_hash','name_column'=>'display_name'];
try{AdminConfiguration::build(['unknown'=>true],$identity,[],new Workspace(new Registry(),$db),$identities);throw new RuntimeException('Unknown admin key accepted');}catch(InvalidArgumentException){}
$configured=new Registry();AdminConfiguration::build(['group'=>'Admin','temporary_password_hours'=>24],$identity,[],new Workspace($configured,$db),$identities);
check($configured->views()[0]['group']==='Admin','Configured admin group');
echo "VAPA built-in user administration (A1) tests passed.\n";

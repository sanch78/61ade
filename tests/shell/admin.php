<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\{Schema,Tokens};
use Blade\Admin\Accounts;
use Blade\Configuration\AdminConfiguration;
use Blade\Feature\{Registry,Workspace,Context,Failure};
use Blade\Shell\{Identity,SqlIdentityProvider};
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
// Grid checkbox edit: the same update kernel with one editable field and the current revision.
$edit=fn(Context $ctx,string $id,string $field,mixed $value)=>$workspace->executor->edit($ctx,Accounts::RESOURCE,$id,$field,$value,$run($ctx,'get',$id)['revision']);

// Default deny: the module is an ordinary ACL resource without an admin bypass.
check($run($user,'list')===[],'Default deny list');
fails(fn()=>$run($user,'get','1'),403,'Default deny get');
fails(fn()=>$run($user,'create',null,['display_name'=>'X','email'=>'x@example.test']),403,'Default deny create');
$rule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1',?,?,?,'allow','all','','')");
foreach(['list','get','create','update','temporary_password'] as $action)$rule->execute([Accounts::RESOURCE,$action,'ui']);
check(count($run($admin,'list'))===2,'Granted list');
check(array_column($registry->views(),'resource')===[Accounts::RESOURCE],'Users view registered');
check(in_array('temporary_password',$registry->views()[0]['actions'],true) && !in_array('deactivate',$registry->views()[0]['actions'],true),'No single-purpose toggle actions');
$columns=array_column($registry->views()[0]['columns'],'id');
check(in_array('blade_disabled',$columns,true) && !in_array('blade_oauth',$columns,true) && !in_array('blade_locale',$columns,true) && !in_array('blade_email_confirmation',$columns,true),'Optional switches only when configured');

// Creation issues a generated temporary password exactly once; the e-mail is normalized.
$created=$run($admin,'create',null,['display_name'=>'New Person','email'=>'  New.Person@Example.TEST ']);
$temporary=$created['reveal']['value'];
check(strlen($temporary)===20 && preg_match('/^[A-Za-z0-9]{20}$/D',$temporary)===1,'Generated temporary password');
check($db->query('SELECT email FROM accounts WHERE id='.(int)$created['id'])->fetchColumn()==='new.person@example.test','E-mail normalized');
$state=$accounts->state($created['id']);
check($state['must_change'] && abs($state['expires']-(time()+72*3600))<5,'Forced change for 72 hours');
check(!str_contains(json_encode($db->query('SELECT * FROM blade_audit')->fetchAll()),$temporary),'Temporary password never audited');
check(!str_contains((string)$db->query('SELECT password_hash FROM accounts WHERE id='.(int)$created['id'])->fetchColumn(),$temporary),'Password stored only as hash');
fails(fn()=>$run($admin,'create',null,['display_name'=>'Dup','email'=>'NEW.PERSON@example.test']),400,'Unique e-mail','email');
fails(fn()=>$run($admin,'create',null,['display_name'=>'Bad','email'=>'not-an-email']),400,'E-mail format','email');
fails(fn()=>$run($admin,'create',null,['display_name'=>'Bad','email'=>'b@example.test','blade_must_change'=>'1']),400,'Read-only state is not writable');

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
check((int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE action='password_change_forced' AND outcome='success'")->fetchColumn()===1,'Forced change audited');

// A new temporary password expires; an expired one cannot sign in or complete the change.
$reissued=$run($admin,'temporary_password',$id)['reveal']['value'];
check($accounts->mustChangePassword($id),'Reissue forces change');
$db->exec("UPDATE blade_account_state SET temporary_expires_at=".(time()-1)." WHERE actor_id='$id'");
check($identities->authenticate('new.person@example.test',$reissued)===null,'Expired temporary password rejected');
fails(fn()=>$accounts->completeForcedChange($id,'later-password-1','later-password-1'),401,'Expired change rejected');
fails(fn()=>$run($admin,'temporary_password','1'),403,'No temporary password for self');

// Disabling is a checkbox on the form and the grid; it ends sessions and tokens at once.
$tokens=new Tokens($db);$token=$tokens->issue('2','test',[Accounts::RESOURCE.'.get']);
$row=$run($admin,'get','2');
check((string)$row['blade_disabled']==='0','Disabled state listed as checkbox value');
$edit($admin,'2','blade_disabled',true);
check($identities->find('2')===null && $identities->authenticate('user@example.test','initial-password-1')===null,'Disabled account unavailable');
check($tokens->authenticate($token['secret'])===null,'Disabled account token revoked');
fails(fn()=>$edit($admin,'1','blade_disabled','1'),403,'Self disable','blade_disabled');
fails(fn()=>$run($admin,'update','2',['display_name'=>'Stale','email'=>'user@example.test','blade_disabled'=>'1','revision'=>$row['revision']]),409,'State change invalidates revision');
$row=$run($admin,'get','2');
$run($admin,'update','2',['display_name'=>'User','email'=>'user@example.test','blade_disabled'=>'0','revision'=>$row['revision']]);
check($identities->find('2')!==null,'Re-enabled on the form');
$version=$workspace->version('2');$edit($admin,'2','blade_disabled','0');
check($workspace->version('2')===$version,'Re-enabling keeps sessions');

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
check(in_array('blade_api_keys',array_column($configured->views(),'resource'),true) && in_array('blade_roles',array_column($configured->views(),'resource'),true),'Configured administration includes ACL and API keys');

// Optional switches: OAuth permission, e-mail confirmation and default language (several site languages).
$optional=new Registry();$optionalWorkspace=new Workspace($optional,$db);
$languages=new Blade\I18n\Settings('hu',['hu'=>'Magyar','en'=>'English'],true);
$full=new Accounts($optionalWorkspace,'accounts','id','email','display_name','password_hash',languages:$languages,oauth:true,emailConfirmation:false);$full->register($optional);
$columns=array_column($optional->views()[0]['columns'],'id');
check(!array_diff(['blade_disabled','blade_oauth','blade_locale','blade_email_confirmation'],$columns),'Optional switches registered');
$single=new Registry();(new Accounts(new Workspace($single,$db),'accounts','id','email','display_name','password_hash',languages:new Blade\I18n\Settings('en',['en'=>'English'])))->register($single);
check(!in_array('blade_locale',array_column($single->views()[0]['columns'],'id'),true),'One site language: no per-user language');
$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1',?,?,'ui','allow','all','','')")->execute([Accounts::RESOURCE,'list']);
$runFull=fn(string $action,?string $id=null,array $values=[])=>$optionalWorkspace->executor->execute($admin,Accounts::RESOURCE,$action,$id,$values);
$editFull=fn(string $id,string $field,mixed $value)=>$optionalWorkspace->executor->edit($admin,Accounts::RESOURCE,$id,$field,$value,$runFull('get',$id)['revision']);
$row=$runFull('get','2');
check((string)$row['blade_oauth']==='0' && (string)$row['blade_locale']==='' && (string)$row['blade_email_confirmation']==='0','Switch defaults');
check(!$full->oauthAllowed('2') && $full->locale('2')===null,'No OAuth or language by default');
$editFull('2','blade_oauth','1');$editFull('2','blade_locale','en');
check($full->oauthAllowed('2') && $full->locale('2')==='en','OAuth permission and default language stored');
fails(fn()=>$editFull('2','blade_locale','de'),400,'Unsupported language rejected','blade_locale');
$version=$optionalWorkspace->version('2');$editFull('2','blade_email_confirmation','1');
check((new Blade\Authentication\Settings($db,false))->get('2')['email_confirmation']===1 && $optionalWorkspace->version('2')>$version,'E-mail confirmation switch stored in auth settings and revokes sessions');
$version=$optionalWorkspace->version('2');$editFull('2','blade_oauth','0');
check(!$full->oauthAllowed('2') && $optionalWorkspace->version('2')>$version,'Removing OAuth permission revokes sessions');
$editFull('2','blade_oauth','1');$editFull('2','blade_disabled','1');
check(!$full->oauthAllowed('2'),'Disabled account has no OAuth sign-in');
check($full->actorByEmail(' RENAMED@example.test ')==='2' && $full->actorByEmail('unknown@example.test')===null,'Exact e-mail account lookup');
echo "61de built-in user administration (A1) tests passed.\n";

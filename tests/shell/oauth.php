<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\Schema;
use Blade\Admin\{Accounts,Administration};
use Blade\Authentication\AuthHandlerLogin;
use Blade\Configuration\OAuthConfiguration;
use Blade\Feature\{Registry,Workspace,Failure};
use Blade\Shell\SqlIdentityProvider;
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function fails(callable $call,int $status,string $message):void{
    try{$call();}catch(Failure $e){check($e->status===$status,$message.' (status '.$e->status.')');return;}
    throw new RuntimeException($message.' (accepted)');
}
/** Stand-in with the AuthHandler methods 61ade uses; records the configuration it received. */
final class FakeAuthHandler { public static ?array $config=null; public static bool $signedIn=true; public static string $email='Person@Example.test'; public array $userData=[]; public function __construct(array $config){self::$config=$config;$this->userData=['email'=>self::$email];} public function IsLoggedIn():bool{return self::$signedIn;} public function Injector():string{return '';} public function HandleRequest():void{} }
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);
$db->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL)');
$insert=$db->prepare('INSERT INTO accounts(id,email,password_hash,display_name) VALUES (?,?,?,?)');
foreach([[1,'person@example.test','Person'],[2,'other@example.test','Other']] as [$id,$email,$name])$insert->execute([$id,$email,'',$name]);
$registry=new Registry();$workspace=new Workspace($registry,$db);
$accounts=new Accounts($workspace,'accounts','id','email','display_name','password_hash',oauth:true);
$identities=Administration::register($workspace,$accounts,new SqlIdentityProvider($db,'accounts','id','email','password_hash','display_name'));
$login=fn(array $providers,?string $site='https://app.example.test/')=>new AuthHandlerLogin('/nonexistent','lib/_AuthHandler',$providers,$accounts,$identities,$workspace,'/tmp/unused.sqlite',$site,
    ['registration_with_provider_google'=>['hu'=>'Google-fiók']],static fn(array $config)=>new FakeAuthHandler($config));

// Every listed provider shows in the overlay, keys or not; only a switched-off one is hidden.
check($login(['Google'=>['enabled'=>false,'keys'=>['id'=>'g','secret'=>'s']]])->enabled()===false,'Switched-off provider hidden');
$bridge=$login(['Google'=>['keys'=>['id'=>'g','secret'=>'s']],'Facebook'=>['keys'=>['id'=>'f','secret'=>'']],'Custom'=>['adapter'=>'X\\Y'],'Twitter'=>['enabled'=>false]]);
check($bridge->providers()===['Google','Facebook','Custom'],'Listed providers shown');
check($bridge->configured('Google') && $bridge->configured('Custom') && !$bridge->configured('Facebook') && !$bridge->configured('Twitter'),'Keys (or an adapter) make a provider usable');

// A provider without keys never reaches AuthHandler/Hybridauth: the user gets a notice instead.
FakeAuthHandler::$config=null;$_GET=['ah_action'=>'provider','provider'=>'facebook'];
check(str_contains($bridge->intercept('app','/','App')['notice']??'','Facebook') && FakeAuthHandler::$config===null,'Unconfigured provider answers with a notice');
$_GET=[];

// Hand-over: AuthHandler's signed-in address is read once; no AuthHandler cookie means nothing to do.
$_COOKIE=[];check($bridge->intercept('app','/','App')===null,'No AuthHandler session, no hand-over');
$_COOKIE=['app_oauth'=>'x'];$_GET=['blade_remember'=>'1'];
check($bridge->intercept('app','/','App')===['email'=>'person@example.test','remember'=>true],'Hand-over returns the normalized address');
$config=FakeAuthHandler::$config;
check($config['provider_only_auth']===true && $config['allow_registration']===false && $config['auto_request_handler']===false,'AuthHandler runs provider-only, without registration, under 61ade routing');
check($config['session_name']==='app_oauth' && $config['site_url']==='https://app.example.test/' && $config['hybridauth_config']['providers']['Google']['callback']==='https://app.example.test/?ah_action=provider&provider=Google&callback=1','Separate session and callback URL');
check($config['hybridauth_config']['providers']['Facebook']['enabled']===true && $config['hybridauth_config']['providers']['Twitter']['enabled']===false && $config['lang_data']['registration_with_provider_google']['hu']==='Google-fiók','Listed providers rendered by AuthHandler; captions passed in AuthHandler format');
FakeAuthHandler::$signedIn=false;check($bridge->intercept('app','/','App')===null,'Signed-out AuthHandler session hands over nothing');
$_COOKIE=[];$_GET=[];

// 61ade decides: AuthHandler may know any address (it creates rows), 61ade admits only enabled accounts.
fails(fn()=>$bridge->admit('person@example.test'),403,'OAuth switch off');
$db->exec("INSERT INTO blade_account_state(actor_id,oauth_allowed) VALUES ('1',1)");
check($bridge->admit('person@example.test')->id==='1','Enabled account admitted');
fails(fn()=>$bridge->admit('stranger@example.test'),403,'Unknown address');
fails(fn()=>$bridge->admit('not-an-address'),403,'Invalid address');
$db->exec("UPDATE blade_account_state SET disabled=1 WHERE actor_id='1'");
fails(fn()=>$bridge->admit('person@example.test'),403,'Disabled account');
$audit=$db->query("SELECT action||':'||outcome FROM blade_audit WHERE resource='authentication'")->fetchAll(PDO::FETCH_COLUMN);
check(in_array('oauth_login:success',$audit,true) && in_array('oauth_login:rejected',$audit,true),'External sign-in audited');

// Guards and JSON configuration.
foreach([fn()=>$login(['google'=>['keys'=>['id'=>'g','secret'=>'s']]]),fn()=>$login([],'not a url'),fn()=>new AuthHandlerLogin('/nonexistent','lib/_AuthHandler',[],$accounts,$identities,$workspace,'/tmp/x')] as $invalid){
    try{$invalid();throw new RuntimeException('Invalid AuthHandler setup accepted');}catch(InvalidArgumentException){}
}
try{new AuthHandlerLogin(dirname(__DIR__,2).'/lib/_AuthHandler','lib/_AuthHandler',[],new Accounts($workspace,'accounts','id','email','display_name','password_hash'),$identities,$workspace,'/tmp/x');throw new RuntimeException('Without OAuth switch accepted');}catch(InvalidArgumentException){}
$root=dirname(__DIR__,2);
$configured=OAuthConfiguration::build(['module'=>'lib/_AuthHandler','assets'=>'lib/_AuthHandler','providers'=>['Google'=>['keys'=>['id'=>'g','secret'=>''],'scope'=>'email']]],static fn(string $p)=>$root.'/'.$p,'/tmp',$accounts,$identities,$workspace);
check($configured->providers()===['Google'] && !$configured->configured('Google'),'JSON provider with empty secret shown, not usable');
echo "61ade AuthHandler external sign-in tests passed.\n";

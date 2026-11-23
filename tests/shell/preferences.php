<?php
declare(strict_types=1);
// Server-side user preferences (docs/user-preferences-plan.md): the `__preferences` boundary, merge, limits and fill.
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Access\{Schema,Tokens};
use Blade\Feature\{Failure,Registry,Workspace};
use Blade\Preferences\UserPreferences;
use Blade\Shell\{Identity,IdentityProvider};
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function database():PDO{$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($db);return $db;}
// A patch of the row's first generation unless it names its own.
function patch(string $json):stdClass{$value=json_decode($json,false,64,JSON_THROW_ON_ERROR);if($value instanceof stdClass&&!isset($value->reset)&&!isset($value->generation))$value->generation=0;return $value;}
function refused(UserPreferences $store,string $json,int $status,string $message):void{
 try{$store->patch('1','/admin/',patch($json));}catch(Failure $e){check($e->status===$status,"$message (status {$e->status})");return;}
 throw new RuntimeException("$message (accepted)");
}
function entries(UserPreferences $store,string $actor='1',string $path='/admin/',?string $tenant=null):array{return json_decode(json_encode($store->bootstrap($actor,$path,$tenant)['entries']),true);}
final class People implements IdentityProvider{
 public function authenticate(string $username,#[\SensitiveParameter] string $password):?Identity{return null;}
 public function find(string $id):?Identity{return new Identity($id,'Person');}
}

// One real `Workspace::http` request per child process, because it ends with `exit`. A multipart body reaches the action
// through `$_POST`; the boundary checks run before the multipart refusal, so each answer names the check that fired.
if(($argv[1]??'')==='http'){
 $case=json_decode($argv[2],true,flags:JSON_THROW_ON_ERROR);$db=database();
 $key=(new Tokens($db))->issue('1','Key',['*:*'])['secret']??'';
 $_SERVER=[...$_SERVER,'REQUEST_METHOD'=>'POST','REQUEST_URI'=>'/admin/?blade=1','CONTENT_TYPE'=>'multipart/form-data; boundary=x','HTTP_X_BLADE_CSRF'=>$case['csrf']];
 if($case['api']??false)$_SERVER['HTTP_AUTHORIZATION']='Bearer '.$key;
 $_POST=['request'=>json_encode(['resource'=>'','action'=>'__preferences','id'=>null,'values'=>['set'=>['a'=>1]]])];
 register_shutdown_function(static function()use($db){echo "\nrows=".$db->query('SELECT COUNT(*) FROM blade_user_preferences')->fetchColumn();});
 (new Workspace(new Registry(),$db))->http(new Identity('1','Person',authenticated:$case['member']),new People(),'token','/nonexistent');
}
$http=static function(array $case):string{
 $out=[];exec(escapeshellarg(PHP_BINARY).' '.escapeshellarg(__FILE__).' http '.escapeshellarg(json_encode($case)).' 2>&1',$out);return implode("\n",$out);
};
foreach([
 'guest'=>[['csrf'=>'token','member'=>false],'Nem érhető el'],
 'missing CSRF'=>[['csrf'=>'wrong','member'=>true],'Érvénytelen munkamenet'],
 'API key'=>[['csrf'=>'','member'=>true,'api'=>true],'Nem érhető el'],
 'multipart'=>[['csrf'=>'token','member'=>true],'Hibás műveletkérés'],
] as $name=>[$case,$error]){
 $answer=$http($case);$reply=json_decode(strtok($answer,"\n"),true);check(($reply['ok']??true)===false&&str_contains($reply['error'],$error)&&str_contains($answer,'rows=0'),"$name is refused and stores nothing: $answer");
}

$db=database();$store=new UserPreferences($db);
check(entries($store)===[],'no document reads empty');
check(json_encode($store->bootstrap('1','/admin/')['entries'])==='{}','empty entries stay a JSON object');
// Merge: different entries survive, one entry is last write wins, an empty object stays an object.
$store->patch('1','/admin/',patch('{"set":{"a":{"x":1},"b":{},"@theme":"dark"}}'));$store->patch('1','/admin/',patch('{"set":{"c":[1]}}'));
$names=array_keys(entries($store));sort($names);check($names===['@theme','a','b','c'],'patches merge');
check(json_encode($store->bootstrap('1','/admin/')['entries']->b)==='{}','an empty object survives');
$store->patch('1','/admin/',patch('{"set":{"a":{"x":2}},"remove":["c"]}'));check(entries($store)['a']===['x'=>2]&&!isset(entries($store)['c']),'set and remove');
// Separation: application path, actor, device class and tenant are separate entries; the account's theme is shared.
$store->patch('1','/other/',patch('{"set":{"a":{"other":true}}}'));
check(entries($store,'1','/other/')['a']===['other'=>true]&&entries($store)['a']===['x'=>2],'application paths are separate');
check(entries($store,'1','/other/')['@theme']==='dark','the theme follows the account across paths');
check(entries($store,'2')===[],'another actor has no entries');
$store->patch('1','/admin/',patch('{"set":{"v|wide":{"columns":[1]},"v|narrow":{"columns":[2]},"v|t:1":{"filters":{"q":"a"}},"v|t:2":{"filters":{"q":"b"}}}}'));
$read=entries($store,'1','/admin/','1');check($read['v|wide']!==$read['v|narrow']&&$read['v|t:1']['filters']['q']==='a'&&!isset($read['v|t:2']),'the bootstrap carries the active tenant only');
check(entries($store,'1','/admin/','2')['v|t:2']['filters']['q']==='b'&&!isset(entries($store)['v|t:1']),'another tenant, and no tenant, see none of it');
// Fill-only keeps what the server has.
$store->patch('1','/admin/',patch('{"set":{"a":{"x":9},"filled":{"y":1}},"fill":true}'));
check(entries($store)['a']===['x'=>2]&&entries($store)['filled']===['y'=>1],'fill stores only missing entries');
// Malformed patches.
foreach(['{}','{"set":{}}','{"set":[]}','{"set":{"a":null}}','{"remove":"a"}','{"remove":[1]}','{"other":1}','{"fill":true,"set":{"a":1},"remove":["b"]}','{"fill":1,"set":{"a":1}}','{"reset":false}','{"reset":true,"set":{"a":1}}',
 '{"set":{"window:x":{}}}','{"set":{"@other":"x"}}','{"set":{"@theme":"Bad Theme"}}','{"set":{"@theme":1}}','{"set":{"a|b":1}}','{"set":{"a|t:":1}}','{"set":{"a\u0001":1}}','{"set":{"":1}}','{"remove":["window:x"]}'] as $bad)refused($store,$bad,400,"malformed $bad");
refused($store,json_encode(['set'=>['big'=>str_repeat('x',32768)]]),413,'an entry above 32 KiB');
refused($store,'{"set":{"a":1e999}}',400,'a number without a JSON form');
foreach(['{"set":{"a":1},"generation":-1}','{"set":{"a":1},"generation":"0"}','{"set":{"a":1},"generation":1.5}','{"set":{"a":1},"base":{"a":1}}'] as $bad)refused($store,$bad,400,"malformed $bad");
try{$store->patch('1','/admin/',json_decode('{"set":{"a":1}}'));throw new RuntimeException('a patch without a generation was accepted');}catch(Failure $e){check($e->status===400,'a patch needs a generation');}
// Limits are measured on the stored ASCII JSON: U+2028 and an emoji count their escapes.
refused($store,json_encode(['set'=>['wide'=>str_repeat("\u{2028}",6000)]]),413,'an entry measured on its escaped form');
$store->patch('1','/admin/',(object)['generation'=>0,'set'=>(object)['lines'=>str_repeat("\u{2028}",5000),'emoji'=>'árvíz 😀']]);
check(entries($store)['lines']===str_repeat("\u{2028}",5000)&&entries($store)['emoji']==='árvíz 😀','escaped text reads back');
check(!preg_match('/[^\x00-\x7f]/',(string)$db->query("SELECT document FROM blade_user_preferences WHERE actor_id='1'")->fetchColumn()),'the stored document is ASCII');
check(UserPreferences::path('/admin/?blade=1')==='/admin/'&&UserPreferences::path('//admin/?blade=1')==='//admin/'&&UserPreferences::path('')===null&&UserPreferences::path('/'.str_repeat('a',255))===null&&UserPreferences::path("/\xff/")===null,'application path');
// One entry: the last write wins, also over another device's newer change; a removal deletes the entry.
$db=database();$store=new UserPreferences($db);$store->patch('1','/admin/',patch('{"set":{"x":"laptop","gone":1}}'));$store->patch('1','/admin/',patch('{"set":{"x":"phone"},"remove":["gone"]}'));
$store->patch('1','/admin/',patch('{"set":{"x":"laptop again"}}'));check(entries($store)==['x'=>'laptop again'],'the latest edit wins');
check(!str_contains((string)$db->query("SELECT document FROM blade_user_preferences WHERE actor_id='1'")->fetchColumn(),'gone'),'a removal leaves no marker');
$store->patch('1','/admin/',patch('{"set":{"gone":2},"fill":true}'));check(entries($store)['gone']===2,'fill stores an entry the document lacks');
// Reset generation: an old tab, a queued keepalive and a fill of the old generation apply nothing.
$generation=static fn(string $actor='1'):int=>$store->bootstrap($actor,'/admin/')['generation'];
check($generation()===0&&$store->patch('1','/admin/',patch('{"reset":true}'))['generation']===1&&$generation()===1&&entries($store)===[],'reset empties the document and raises the generation');
foreach(['{"generation":0,"set":{"late":1}}','{"generation":0,"remove":["late"]}','{"generation":0,"set":{"late":1},"fill":true}','{"generation":2,"set":{"late":1}}'] as $old)refused($store,$old,409,"another generation $old");
check(entries($store)===[],'another generation applies nothing');
$store->patch('1','/admin/',patch('{"generation":1,"set":{"new":1}}'));check(entries($store)===['new'=>1],'the current generation saves');
check($store->patch('fresh','/admin/',patch('{"reset":true}'))['generation']===1&&$generation('fresh')===1&&entries($store,'fresh')===[],'a reset with no prior row inserts it');
refused(new UserPreferences($db),'{"generation":0,"set":{"a":1}}',409,'the row keeps its generation');
// A document this release cannot read is neither served nor overwritten; the user's reset may erase it.
foreach(['{"v":2,"future":true}','{"v":1,"entries":7}','not json'] as $foreign){
 $bad=database();$bad->prepare("INSERT INTO blade_user_preferences(actor_id,document,revision,updated_at) VALUES ('1',?,1,'x')")->execute([$foreign]);$other=new UserPreferences($bad);$unreadable=$other->bootstrap('1','/admin/');check(($unreadable['unreadable']??false)===true&&get_object_vars($unreadable['entries'])===[],"unreadable document: browser-local, still resettable ($foreign)");
 try{$other->patch('1','/admin/',patch('{"set":{"a":1}}'));throw new RuntimeException('unreadable document overwritten');}catch(Failure $e){check($e->status===503,'unreadable document: 503');}
 check($bad->query('SELECT document FROM blade_user_preferences')->fetchColumn()===$foreign,'unreadable document kept');$other->patch('1','/admin/',patch('{"reset":true}'));check(entries($other)===[]&&!isset($other->bootstrap('1','/admin/')['unreadable']),'reset erases it');
}
$damaged=database();$damaged->prepare("INSERT INTO blade_user_preferences(actor_id,document,revision,updated_at) VALUES ('1',?,1,'x')")->execute(['{"v":1,"entries":{"/admin/\\t\\u0000x":1,"/admin/\\tgood":{"mode":"cards"}}}']);
check(array_keys(entries(new UserPreferences($damaged)))===['good'],'a damaged stored key is skipped and the page still loads');

// Limits: the least recently changed entries go first, a filled value before a changed one.
$db=database();$store=new UserPreferences($db);
$store->patch('1','/admin/',patch('{"set":{"oldest":1}}'));$store->patch('1','/admin/',patch('{"set":{"newer":1}}'));
$many=[];for($i=0;$i<999;$i++)$many["k$i"]=1;$store->patch('1','/admin/',(object)['generation'=>0,'set'=>(object)$many]);
$read=entries($store);check(count($read)===1000&&!isset($read['oldest'])&&isset($read['newer'],$read['k998']),'1000 entries, oldest dropped');
$store->patch('1','/admin/',patch('{"set":{"filled":1},"fill":true}'));check(!isset(entries($store)['filled'])&&count(entries($store))===1000,'a filled value is the first to go');
$db=database();$store=new UserPreferences($db);$text=str_repeat('x',30000);
for($i=0;$i<10;$i++)$store->patch('1','/admin/',(object)['generation'=>0,'set'=>(object)["e$i"=>$text]]);
$size=strlen((string)$db->query('SELECT document FROM blade_user_preferences')->fetchColumn());$read=entries($store);
check($size<=UserPreferences::DOCUMENT_BYTES&&!isset($read['e0'])&&isset($read['e9']),'the document stays within 256 KiB');
// Reset deletes only the actor's document.
$store->patch('2','/admin/',patch('{"set":{"mine":1}}'));$store->patch('1','/admin/',patch('{"reset":true}'));check(entries($store)===[]&&entries($store,'2')===['mine'=>1]&&!str_contains((string)$db->query("SELECT document FROM blade_user_preferences WHERE actor_id='1'")->fetchColumn(),'e9'),'reset');
// A database without the table: browser-local page, no failure, and a save answers 503.
$old=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$missing=new UserPreferences($old);check($missing->bootstrap('1','/admin/')===null,'no table: no bootstrap');
try{$missing->patch('1','/admin/',patch('{"set":{"a":1}}'));throw new RuntimeException('no table: accepted');}catch(Failure $e){check($e->status===503,'no table: 503');}
check($old->query("SELECT COUNT(*) FROM sqlite_master WHERE name='blade_user_preferences'")->fetchColumn()==0,'a request never creates the table');
Schema::install($db);
// A private MySQL when named by BLADE_TEST_MYSQL_SOCKET: an emoji through a 3-byte `charset=utf8` connection, exact keys.
if(($socket=getenv('BLADE_TEST_MYSQL_SOCKET'))!==false&&$socket!==''){
 $root=new PDO("mysql:unix_socket=$socket;charset=utf8mb4",'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$name='blade_preferences_check_'.getmypid();$root->exec("CREATE DATABASE $name CHARACTER SET utf8mb4 COLLATE utf8mb4_hungarian_ci");
 try{
  $utf8=new PDO("mysql:unix_socket=$socket;dbname=$name;charset=utf8",'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Schema::install($utf8);$store=new UserPreferences($utf8);
  $store->patch('1','/admin/',(object)['generation'=>0,'set'=>(object)['emoji'=>'árvíz 😀 中']]);check(entries($store)['emoji']==='árvíz 😀 中','an emoji survives a charset=utf8 connection');
  $store->patch('alice','/admin/',patch('{"set":{"who":1}}'));$store->patch('alice ','/admin/',patch('{"set":{"who":2}}'));check(entries($store,'alice')['who']===1&&entries($store,'alice ')['who']===2,'MySQL keeps actors byte-exact');
  $store->patch('1','/admin/',patch('{"reset":true}'));refused($store,'{"generation":0,"set":{"a":1}}',409,'MySQL generation');
 }finally{$root->exec("DROP DATABASE $name");}
 echo "PASS preferences on MySQL\n";
}
echo "PASS preferences: session boundary, CSRF, guest, API key, merge, separation, fill, limits, malformed input, last write wins, reset generation, unreadable document, missing table\n";

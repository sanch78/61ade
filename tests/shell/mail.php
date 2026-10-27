<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Configuration\AuthenticationConfiguration;
use Blade\Mail\{CommandDelivery,Layout,LoginMessage};
use Blade\Shell\Identity;
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function rejects(callable $call,string $message):void{try{$call();}catch(InvalidArgumentException){return;}throw new RuntimeException($message);}
$scratch=(getenv('BLADE_TMP_DIR')?:dirname(__DIR__,2).'/tmp').'/mail-test-'.getmypid();
$runtime=$scratch.'/runtime';
mkdir($runtime,0700,true);
// Fake mail command: records its arguments, the body file's path, mode and content, and stdin; never sends.
$recorder=$scratch.'/recorder.php';
file_put_contents($recorder,'<?php $a=array_slice($argv,2);$f=substr((string)current(preg_grep("/^--body-file=/",$a)),12);file_put_contents($argv[1],json_encode(["args"=>$a,"file"=>$f,"mode"=>is_file($f)?fileperms($f)&0777:null,"body"=>is_file($f)?file_get_contents($f):null,"stdin"=>stream_get_contents(STDIN)]));exit((int)getenv("FAKE_EXIT"));');
$infra=fn(string $out)=>[PHP_BINARY,$recorder,$out,'--from={from_address}','--from-name={from_name}','--to={recipient}','--subject={subject}','--html','--body-file={body_file}','{recipient}'];

// Placeholders are substituted as whole arguments or suffixes; the HTML body goes to a private runtime file.
$delivery=new CommandDelivery($infra($scratch.'/out.json'),'noreply@example.test','Synthetic sender',$runtime);
$delivery->send('person@example.test','Szintetikus tárgy','<p>HTML törzs</p>','Szöveges törzs');
$seen=json_decode(file_get_contents($scratch.'/out.json'),true);
check($seen['args']===['--from=noreply@example.test','--from-name=Synthetic sender','--to=person@example.test','--subject=Szintetikus tárgy','--html','--body-file='.$seen['file'],'person@example.test'],'Arguments substituted');
check(dirname($seen['file'])===$runtime && $seen['mode']===0600 && $seen['body']==='<p>HTML törzs</p>' && $seen['stdin']==='','Private HTML body file in runtime, no stdin');
check(!is_file($seen['file']) && glob($runtime.'/*')===[],'Body file removed after success');

// A nonzero exit is a failure, and the body file is still removed.
putenv('FAKE_EXIT=3');
try{$delivery->send('person@example.test','S','<p>x</p>','x');throw new LogicException('Failing command accepted');}catch(RuntimeException $e){check($e->getMessage()==='Mail command failed.','Exit code checked');}
putenv('FAKE_EXIT');
check(glob($runtime.'/*')===[],'Body file removed after failure');

// Values are validated before substitution.
foreach(['-oQ/tmp@example.test','a@example.test,b@example.test',"x@example.test\n",'not-an-address'] as $bad)rejects(fn()=>$delivery->send($bad,'S','h','t'),'Invalid recipient accepted: '.$bad);
foreach(["S\nBcc: x@example.test","S\0",'S'."\r"] as $bad)rejects(fn()=>$delivery->send('person@example.test',$bad,'h','t'),'Invalid subject accepted');
rejects(fn()=>new CommandDelivery($infra('x'),'a@example.test,b@example.test','S',$runtime),'Multiple senders accepted');
rejects(fn()=>new CommandDelivery($infra('x'),'noreply@example.test',"S\nX",$runtime),'Sender name with newline accepted');
rejects(fn()=>new CommandDelivery($infra('x'),'noreply@example.test','S',$scratch.'/missing'),'Missing runtime accepted');
foreach([[],['sendmail',''],['a'=>'sendmail'],['/usr/sbin/sendmail','-t','-i'],['cmd','{body_file}x'],['cmd','{recipient}{body_file}'],['cmd',"--x=\n",'{body_file}']] as $bad)rejects(fn()=>new CommandDelivery($bad,'noreply@example.test','S',$runtime),'Invalid command accepted: '.json_encode($bad));

// Configuration: command only; removed SMTP keys fail with a clear message.
$base=['from_address'=>'noreply@example.test','from_name'=>'S'];
check(AuthenticationConfiguration::delivery([...$base,'command'=>$infra('x')],$runtime)instanceof CommandDelivery,'Command delivery from configuration');
foreach([['transport'=>'smtp','dsn'=>'smtp://x'],['dsn'=>'smtp://x'],['transport'=>'command']] as $removed){
    try{AuthenticationConfiguration::delivery([...$base,...(isset($removed['dsn'])?[]:['command'=>$infra('x')]),...$removed],$runtime);throw new LogicException('Removed SMTP key accepted');}
    catch(InvalidArgumentException $e){check(str_contains($e->getMessage(),'SMTP mail delivery was removed'),'Clear removal message');}
}
rejects(fn()=>AuthenticationConfiguration::delivery($base,$runtime),'Missing command accepted');

// Formatted layout: escaped business text, overridable texts and accent colour, plain-text part.
$message=new LoginMessage('Demo <app>',['heading'=>'Egyedi <b>fejléc</b>','footer'=>'Projekt lábléc'],static fn(Identity $actor)=>['greeting'=>'Szia {name}!'],new Layout('#aa3366'));
$mail=$message->render(new Identity('1','Teszt "Elek"'),'123456',600);
check(str_contains($mail['html'],'Egyedi &lt;b&gt;fejléc&lt;/b&gt;') && str_contains($mail['html'],'Demo &lt;app&gt;') && !str_contains($mail['html'],'<b>fejléc'),'Business text escaped');
check(str_contains($mail['html'],'#aa3366') && str_contains($mail['html'],'Szia Teszt &quot;Elek&quot;!') && str_contains($mail['html'],'Projekt lábléc'),'Accent and overrides applied');
check(str_contains($mail['text'],'123456') && str_contains($mail['text'],'Projekt lábléc') && !str_contains($mail['text'],'<table'),'Plain-text alternative');
try{new Layout('red');throw new RuntimeException('Invalid accent accepted');}catch(InvalidArgumentException){}
array_map('unlink',glob($scratch.'/*.*'));rmdir($runtime);rmdir($scratch);
echo "61de mail delivery and layout tests passed.\n";

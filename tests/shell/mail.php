<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Configuration\AuthenticationConfiguration;
use Blade\Mail\{CommandDelivery,Layout,LoginMessage,SmtpDelivery};
use Blade\Shell\Identity;
function check(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
$scratch=(getenv('BLADE_TMP_DIR')?:dirname(__DIR__,2).'/tmp').'/mail-test-'.getmypid();
mkdir($scratch,0700,true);
$writer=$scratch.'/writer.php';
file_put_contents($writer,'<?php file_put_contents($argv[1],stream_get_contents(STDIN)); file_put_contents($argv[1].".to",$argv[2]??""); exit((int)($argv[3]??0));');

// The whole MIME message reaches the command on stdin; "{recipient}" is the only substitution.
$delivery=new CommandDelivery([PHP_BINARY,$writer,$scratch.'/out.eml','{recipient}'],'noreply@example.test','Synthetic sender');
$delivery->send('person@example.test','Szintetikus tárgy','<p>HTML törzs</p>','Szöveges törzs');
$raw=file_get_contents($scratch.'/out.eml');
check(str_contains($raw,'To: person@example.test') && str_contains($raw,'From: Synthetic sender <noreply@example.test>') && str_contains($raw,'multipart/alternative'),'MIME message piped to command');
check(file_get_contents($scratch.'/out.eml.to')==='person@example.test','Recipient argument substituted');
try{(new CommandDelivery([PHP_BINARY,$writer,$scratch.'/fail.eml','{recipient}','3'],'noreply@example.test','S'))->send('person@example.test','S','<p>x</p>','x');throw new RuntimeException('Failing command accepted');}catch(RuntimeException $e){check($e->getMessage()==='Mail command failed.','Exit code checked');}
try{$delivery->send('-oQ/tmp@example.test','S','h','t');throw new RuntimeException('Option-like recipient accepted');}catch(InvalidArgumentException){}
foreach([[],['sendmail',''],['a'=>'sendmail']] as $bad){try{new CommandDelivery($bad,'noreply@example.test','S');throw new RuntimeException('Invalid command accepted');}catch(InvalidArgumentException){}}

// Configuration chooses exactly one transport.
$base=['from_address'=>'noreply@example.test','from_name'=>'S'];
check(AuthenticationConfiguration::delivery([...$base,'dsn'=>'smtp://127.0.0.1:2525'])instanceof SmtpDelivery,'SMTP is the default transport');
check(AuthenticationConfiguration::delivery([...$base,'transport'=>'command','command'=>['/usr/sbin/sendmail','-t','-i']])instanceof CommandDelivery,'Command transport');
foreach([[...$base],[...$base,'transport'=>'command','dsn'=>'smtp://x'],[...$base,'transport'=>'pigeon','dsn'=>'smtp://x'],[...$base,'dsn'=>'smtp://x','command'=>['x']]] as $bad){
    try{AuthenticationConfiguration::delivery($bad);throw new RuntimeException('Ambiguous transport accepted');}catch(InvalidArgumentException){}
}

// Formatted layout: escaped business text, overridable texts and accent colour, plain-text part.
$message=new LoginMessage('Demo <app>',['heading'=>'Egyedi <b>fejléc</b>','footer'=>'Projekt lábléc'],static fn(Identity $actor)=>['greeting'=>'Szia {name}!'],new Layout('#aa3366'));
$mail=$message->render(new Identity('1','Teszt "Elek"'),'123456',600);
check(str_contains($mail['html'],'Egyedi &lt;b&gt;fejléc&lt;/b&gt;') && str_contains($mail['html'],'Demo &lt;app&gt;') && !str_contains($mail['html'],'<b>fejléc'),'Business text escaped');
check(str_contains($mail['html'],'#aa3366') && str_contains($mail['html'],'Szia Teszt &quot;Elek&quot;!') && str_contains($mail['html'],'Projekt lábléc'),'Accent and overrides applied');
check(str_contains($mail['text'],'123456') && str_contains($mail['text'],'Projekt lábléc') && !str_contains($mail['text'],'<table'),'Plain-text alternative');
try{new Layout('red');throw new RuntimeException('Invalid accent accepted');}catch(InvalidArgumentException){}
array_map('unlink',glob($scratch.'/*'));rmdir($scratch);
echo "61de mail delivery and layout tests passed.\n";

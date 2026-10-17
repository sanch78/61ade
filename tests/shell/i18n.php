<?php
declare(strict_types=1);
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Vapa\I18n\{Settings,Translator};
use Vapa\Feature\{Field,Failure};
use Vapa\Mail\LoginMessage;
use Vapa\Shell\Identity;
function check(bool $ok,string $message):void { if(!$ok)throw new RuntimeException($message); }
$settings=new Settings('hu',['hu'=>'Magyar','en'=>'English','de'=>'Deutsch'],true,['en'=>['Synthetic title'=>'Fixture title'],'de'=>['Synthetic title'=>'Testtitel']]);
foreach(['hu'=>'Mentés','en'=>'Save','de'=>'Speichern'] as $locale=>$save){
 Translator::configure($settings,$locale);
 check(Translator::text('Mentés')===$save,'framework translation '.$locale);
 check(Translator::locale()===$locale,'locale '.$locale);
 $error=new Failure('Kötelező mező.',400,['title'=>'Kötelező mező.']);
 check($error->fieldErrors['title']===Translator::text('Kötelező mező.'),'field error '.$locale);
 $field=new Field('active','Synthetic title','checkbox');
 check($field->metadata()['options'][1]===Translator::text('Igen'),'static options '.$locale);
 $lookup=new Field('lookup','Synthetic title','select',options:static fn($ctx)=>['1'=>'Mentés']);
 // Presentation traversal must not rewrite a record or lookup value.
 $data=['id'=>'Mentés','defaultValue'=>'Mentés','options'=>['1'=>'Mentés'],'label'=>'Mentés'];
 $translated=Translator::presentation($data);
 check($translated['id']==='Mentés'&&$translated['options'][1]==='Mentés'&&$translated['defaultValue']==='Mentés','values untouched');
 check($translated['label']===$save,'labels translated');
 $mail=(new LoginMessage('Synthetic'))->render(new Identity('1','Demo',[]),'123456',600);
 check(str_contains($mail['html'],'lang="'.$locale.'"'),'mail language '.$locale);
 check(str_contains($mail['text'],'123456')&&!str_contains($mail['text'],'{minutes}'),'mail placeholders '.$locale);
 if($locale!=='hu')check(!str_contains($mail['text'],'Megerősítő kód'),'translated mail '.$locale);
}
Translator::configure(new Settings('en',['en'=>'English'],false));
check(Translator::text('Mentés')==='Save','single-language site is localized');
Translator::configure($settings,'xx');check(Translator::locale()==='hu','unknown locale uses default');
Translator::configure($settings,'en');check(Translator::text('Synthetic title')==='Fixture title','consumer catalogue');
check(Translator::text('untranslated-key')==='untranslated-key','missing message source fallback');
check(Translator::text('Legfeljebb {count} karakter adható meg.',['count'=>5])==='Enter at most 5 characters.','parameter translation');
try{(new Field('name','Synthetic title',max:5))->validate('abcdef');throw new RuntimeException('validation accepted');}
catch(Failure $error){check($error->fieldErrors['name']==='Enter at most 5 characters.','server parameter validation');}
foreach([fn()=>new Settings('../en'),fn()=>new Settings(flags:['hu'=>'not-a-flag']),fn()=>new Settings(flags:['en'=>'🇬🇧']),fn()=>new Settings('hu',['hu'=>'']),fn()=>new Settings('hu',catalogues:['en'=>[]])] as $invalid){try{$invalid();throw new RuntimeException('invalid settings accepted');}catch(InvalidArgumentException){}}
$hu=json_decode(file_get_contents(dirname(__DIR__,2).'/packages/php/resources/locales/hu.json'),true);
foreach(['en','de']as $locale){$other=json_decode(file_get_contents(dirname(__DIR__,2).'/packages/php/resources/locales/'.$locale.'.json'),true);check(array_keys($other)===array_keys($hu),'catalogue parity '.$locale);foreach($hu as $key=>$source){preg_match_all('/\{\w+\}/',$source,$a);preg_match_all('/\{\w+\}/',$other[$key],$b);sort($a[0]);sort($b[0]);check($a[0]===$b[0],'placeholder parity '.$locale.' '.$key);}}
Translator::configure(new Settings());
echo "PASS i18n: locales, fallback, metadata, validation, email, catalogue and placeholder parity\n";

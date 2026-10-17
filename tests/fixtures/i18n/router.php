<?php
declare(strict_types=1);
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(preg_match('~/assets/(admin\.(?:css|js))$~D',$path,$match)){
 header('Content-Type: '.($match[1]==='admin.css'?'text/css':'text/javascript'));
 readfile(dirname(__DIR__,3).'/examples/demo-app/public/assets/'.$match[1]);return;
}
require dirname(__DIR__,3).'/examples/demo-app/vendor/autoload.php';
Vapa\Infrastructure\HttpEntrypoint::run(static function()use($path){
 $base=require dirname(__DIR__).'/list-presentation/application.php';
 $single=str_starts_with($path,'/single/');
 $languages=new Vapa\I18n\Settings($single?'en':'hu',['hu'=>'Magyar','en'=>'English','de'=>'Deutsch'],!$single,[
 'en'=>['Elemek'=>'Items','Megnevezés'=>'Name','Részletes leírás'=>'Description','Aktív'=>'Active','Inaktív'=>'Inactive','Archiválás'=>'Archive'],
 'de'=>['Elemek'=>'Elemente','Megnevezés'=>'Bezeichnung','Részletes leírás'=>'Beschreibung','Aktív'=>'Aktiv','Inaktív'=>'Inaktiv','Archiválás'=>'Archivieren'],
 ],flags:['hu'=>'hu','en'=>'gb','de'=>'de']);
 return new Vapa\Shell\ApplicationDefinition(title:'Synthetic multilingual app',identities:$base->identities,menu:$base->menu,runtime:$base->runtime,sessionName:'vapa_i18n_fixture',workspace:$base->workspace,languages:$languages);
});

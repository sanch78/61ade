<?php
declare(strict_types=1);
use Vapa\Feature\{Registry,SqlResource,Field,Workspace};
$file=(getenv('VAPA_TMP_DIR') ?: dirname(__DIR__,2).'/codex/tmp').'/demo-workspace.sqlite';
if(!is_file($file))return null;
$db=new PDO('sqlite:'.$file,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$registry=new Registry();
(new SqlResource('notes','notes','id',[new Field('title','Cím',required:true)],'owner_id',['owner_id'=>'1']))->register($registry,'Jegyzetek');
return new Workspace($registry,$db);

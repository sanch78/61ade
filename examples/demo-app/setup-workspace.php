<?php
declare(strict_types=1);
require __DIR__.'/vendor/autoload.php';
$file=dirname(__DIR__,2).'/codex/tmp/demo-workspace.sqlite';
$db=new PDO('sqlite:'.$file,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
Vapa\Access\Schema::install($db);
$db->exec('CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT,title TEXT)');
if(!$db->query('SELECT COUNT(*) FROM notes')->fetchColumn())$db->exec("INSERT INTO notes(owner_id,title) VALUES ('1','Demo note')");
if(!$db->query('SELECT COUNT(*) FROM vapa_rules')->fetchColumn()){
 $q=$db->prepare("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','notes',?,'ui','allow','all','','')");foreach(['list','get','create','update'] as $a)$q->execute([$a]);
}
echo "Standalone workspace initialized.\n";

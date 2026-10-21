<?php
declare(strict_types=1);
require __DIR__.'/vendor/autoload.php';
$file=(getenv('VAPA_TMP_DIR') ?: dirname(__DIR__,2).'/tmp').'/demo-workspace.sqlite';
if(!is_dir(dirname($file)))mkdir(dirname($file),0700,true);
$db=new PDO('sqlite:'.$file,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
Vapa\Access\Schema::install($db);
$db->exec('CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT,title TEXT)');
if(!$db->query('SELECT COUNT(*) FROM notes')->fetchColumn())$db->exec("INSERT INTO notes(owner_id,title) VALUES ('1','Demo note')");
// Synthetic accounts; the e-mail address is the sign-in identifier of the built-in administration.
$db->exec('CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,can_manage INTEGER NOT NULL DEFAULT 0)');
if(!$db->query('SELECT COUNT(*) FROM accounts')->fetchColumn()){
 $q=$db->prepare('INSERT INTO accounts(id,email,password_hash,display_name,active,can_manage) VALUES (?,?,?,?,?,?)');
 foreach([[1,'demo@example.test','Demo User',1,1],[2,'viewer@example.test','Demo Viewer',1,0],[3,'blocked@example.test','Blocked User',0,1]] as [$id,$email,$name,$active,$manage])$q->execute([$id,$email,password_hash('vapa-demo',PASSWORD_DEFAULT),$name,$active,$manage]);
}
$exists=$db->prepare("SELECT COUNT(*) FROM vapa_rules WHERE subject_type='user' AND subject_id='1' AND resource='notes' AND action=? AND channel='ui'");
$grant=$db->prepare("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','notes',?,'ui','allow','all','','')");
foreach(['list','get','create','update'] as $action){$exists->execute([$action]);if(!$exists->fetchColumn())$grant->execute([$action]);}
// Explicit first-administrator step: protected role, membership and admin UI rules from the catalogue.
unset($q,$exists,$grant,$db); // release SQLite read cursors before the application connection writes
$app=require __DIR__.'/application.php';
Vapa\Admin\Permissions::grantAdministration($app->workspace->db,$app->workspace->registry,'1');
echo "Standalone workspace initialized.\n";

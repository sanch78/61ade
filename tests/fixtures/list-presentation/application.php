<?php
declare(strict_types=1);
use Vapa\Access\Schema;
use Vapa\Configuration\WorkspaceConfiguration;
use Vapa\Navigation\Menu;
use Vapa\Shell\{ApplicationDefinition, SqlIdentityProvider};
$base=getenv('VAPA_TMP_DIR');
if(!$base)throw new RuntimeException('Set VAPA_TMP_DIR to the designated test scratch.');
$runtime=$base.'/presentation-fixture';
if(!is_dir($runtime))mkdir($runtime,0700,true);
$db=new PDO('sqlite:'.$runtime.'/data.sqlite',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
if(!$db->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='items'")->fetchColumn()){
 Schema::install($db);
 $db->exec('CREATE TABLE identities(id INTEGER PRIMARY KEY,login TEXT,password_hash TEXT,name TEXT)');
 $q=$db->prepare('INSERT INTO identities VALUES(?,?,?,?)');
 foreach([[1,'synthetic','Synthetic administrator'],[2,'reader','Synthetic reader']]as[$id,$login,$name])$q->execute([$id,$login,password_hash('synthetic-password',PASSWORD_DEFAULT),$name]);
 $db->exec('CREATE TABLE items(id INTEGER PRIMARY KEY,title TEXT,description TEXT,active INTEGER,secret TEXT)');
 $q=$db->prepare('INSERT INTO items VALUES(?,?,?,?,?)');
 for($i=1;$i<=24;$i++)$q->execute([$i,'Elem '.$i,'A gridből kihagyott, olvasható részletes adat '.$i,1,'NEVER_EXPOSE_THIS_VALUE']);
 $q=$db->prepare("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES('user',?,'items',?,'ui',?,'all','',?)");
 foreach(['1','2']as$id)foreach(['list','get']as$action)$q->execute([$id,$action,'allow','']);
 foreach(['update','archive']as$action)$q->execute(['1',$action,'allow','']);
 foreach(['list','get']as$action)$q->execute(['2',$action,'deny','description']);
}
$workspace=WorkspaceConfiguration::build($db,[__DIR__.'/items.json'],static fn()=>['items.archive'=>static function($ctx,$target):array{
 $ctx->db->prepare('UPDATE items SET active=0 WHERE id=?')->execute([$target['id']]);return [];
}]);
return new ApplicationDefinition(title:'Lista próba',version:'1.0',runtime:$runtime,sessionName:'vapa_presentation_test',menu:new Menu([]),workspace:$workspace,identities:new SqlIdentityProvider($db,'identities','id','login','password_hash','name'));

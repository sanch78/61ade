<?php

declare(strict_types=1);

use Vapa\Access\Schema;
use Vapa\Configuration\WorkspaceConfiguration;
use Vapa\Navigation\Menu;
use Vapa\Shell\{ApplicationDefinition, SqlIdentityProvider};

$root = dirname(__DIR__, 3);
$runtime = $root.'/codex/tmp/related-fields-fixture';
if (!is_dir($runtime)) mkdir($runtime, 0700, true);
$file = $runtime.'/fixture.sqlite';
$new = !is_file($file);
$db = new PDO('sqlite:'.$file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
if ($new) {
    Schema::install($db);
    $db->exec('CREATE TABLE identities(id INTEGER PRIMARY KEY, login TEXT, password_hash TEXT, name TEXT)');
    $db->prepare('INSERT INTO identities VALUES (1, ?, ?, ?)')->execute(['synthetic', password_hash('synthetic-password', PASSWORD_DEFAULT), 'Synthetic tester']);
    $db->exec('CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, archived INTEGER NOT NULL DEFAULT 0)');
    $db->exec('CREATE TABLE item_preferences(item_id INTEGER PRIMARY KEY, notifications INTEGER NOT NULL)');
    $grant = $db->prepare("INSERT INTO vapa_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items',?,'ui','allow','all','','')");
    foreach (['list','get','create','update','delete'] as $action) $grant->execute([$action]);
}
$workspace = WorkspaceConfiguration::build($db, [__DIR__.'/items.json'], static fn() => ['items.after_save' => static fn() => []]);
return new ApplicationDefinition(
    title: 'Related fields fixture', runtime: $runtime, sessionName: 'related_fields_fixture',
    menu: new Menu([]), workspace: $workspace,
    identities: new SqlIdentityProvider($db, 'identities', 'id', 'login', 'password_hash', 'name'),
);

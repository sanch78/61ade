<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') exit;
require dirname(__DIR__, 3).'/examples/demo-app/vendor/autoload.php';
$directory = getenv('VAPA_TEST_AUTH_RUNTIME') ?: dirname(__DIR__, 3).'/codex/tmp/auth-fixture';
if (!is_dir($directory)) mkdir($directory, 0700, true);
if (is_file($directory.'/data.sqlite')) unlink($directory.'/data.sqlite');
$db = new PDO('sqlite:'.$directory.'/data.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
Vapa\Access\Schema::install($db);
$db->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, login TEXT, password_hash TEXT, display_name TEXT, active INTEGER, email TEXT)');
$query = $db->prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, 1, ?)');
foreach ([[1, 'demo', 'Synthetic Admin'], [2, 'other', 'Synthetic Other'], [3, 'blocked', 'Synthetic Blocked']] as [$id, $login, $name]) {
    $query->execute([$id, $login, password_hash('demo-password-123', PASSWORD_DEFAULT), $name, $login.'@example.test']);
}
$db->exec("UPDATE accounts SET active = 0 WHERE id = 3");
$db->exec('CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, title TEXT)');
$db->exec("INSERT INTO notes(owner_id, title) VALUES ('1', 'Synthetic note')");
$query = $db->prepare("INSERT INTO vapa_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', ?, ?, ?, 'ui', 'allow', 'all', '', '')");
foreach (['1', '2'] as $actor) foreach (['list', 'get', 'create', 'update', 'mark'] as $action) $query->execute([$actor, 'notes', $action]);
foreach (['list', 'get', 'security'] as $action) $query->execute(['1', 'members', $action]);
foreach (glob($directory.'/login/*.json') as $file) unlink($file);
echo "Synthetic authentication fixture ready.\n";

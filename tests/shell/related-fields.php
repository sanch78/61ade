<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Context, Failure, Field};
use Blade\Shell\Identity;

function verify(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function denied(Closure $work, int $status): void {
    try { $work(); } catch (Failure $error) { verify($error->status === $status, $error->getMessage()); return; }
    throw new RuntimeException('Expected rejection.');
}

$checkbox = new Field('enabled', 'Enabled', 'checkbox', required: true);
foreach ([false, 0, '0'] as $value) verify($checkbox->validate($value) === '0', 'Unchecked is a valid required value');
foreach ([true, 1, '1'] as $value) verify($checkbox->validate($value) === '1', 'Checked canonical value');
foreach (['', 2, 'true', [], null] as $value) denied(static fn() => $checkbox->validate($value), 400);
try { new Field('bad', 'Bad', column: ['width' => -1]); throw new RuntimeException('Invalid width accepted.'); } catch (InvalidArgumentException) {}

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
Schema::install($db);
$db->exec('CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, archived INTEGER NOT NULL DEFAULT 0)');
$db->exec('CREATE TABLE item_preferences(item_id INTEGER PRIMARY KEY, notifications INTEGER NOT NULL CHECK(notifications IN (0,1)))');
$workspace = WorkspaceConfiguration::build($db, [dirname(__DIR__).'/fixtures/related-fields/items.json'], static fn() => [
    'items.after_save' => static function ($context, $id, $target, $values): array {
        if (($values['title'] ?? '') === 'Rollback') throw new Failure('Synthetic rollback.', 409);
        return ($values['title'] ?? '') === 'Reload' ? ['reauthenticate' => true] : [];
    },
]);
$grant = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items',?,?,'allow','all','','')");
foreach (['ui', 'api'] as $channel) foreach (['list', 'get', 'create', 'update', 'delete'] as $action) $grant->execute([$action, $channel]);
$actor = new Identity('1', 'Synthetic');
$context = new Context($actor, 'ui', $workspace->acl, $db);
$call = static fn($action, $id = null, $values = []) => $workspace->executor->execute($context, 'items', $action, $id, $values);

$id = $call('create', values: ['title' => 'First', 'archived' => false])['id'];
$row = $call('get', $id);
verify((int)$row['notify'] === 1 && (int)$row['archived'] === 0, 'Default relation and canonical unchecked value');
$list = $call('list', values: ['mode' => 'dynamic', 'filters' => ['notify' => '1']]);
verify(count($list['items']) === 1 && $list['items'][0]['revision'] === $row['revision'], 'Derived source filtering and identical object revision');
$columns = $workspace->views($actor)[0]['columns'];
verify($columns[2]['type'] === 'checkbox' && $columns[2]['width'] === 120 && $columns[2]['options'][1] === 'On', 'Reusable checkbox/width/choice metadata');
verify(!str_contains(json_encode($workspace->views($actor)), 'item_preferences'), 'Related storage remains backend-only');

$call('update', $id, ['title' => 'Reload', 'notify' => false, 'revision' => $row['revision']]);
$row = $call('get', $id);
verify($row['title'] === 'Reload' && (int)$row['notify'] === 0, 'Main and related fields saved together');
$before = $workspace->observe($context, 'items', ['limit' => 100]);
$db->exec("UPDATE item_preferences SET notifications=1 WHERE item_id=$id");
$after = $workspace->observe($context, 'items', ['limit' => 100], $before['version']);
verify(!isset($after['unchanged']) && (int)$after['items'][0]['notify'] === 1, 'Related changes participate in live observation');
denied(static fn() => $call('update', $id, ['title' => 'Stale', 'revision' => $row['revision']]), 409);
$row = $call('get', $id);
denied(static fn() => $call('update', $id, ['title' => 'Rollback', 'notify' => false, 'revision' => $row['revision']]), 409);
verify($call('get', $id)['title'] === 'Reload' && (int)$call('get', $id)['notify'] === 1, 'Failure rolls back both tables');

$api = new Context($actor, 'api', $workspace->acl, $db, ['items.update']);
$result = $workspace->executor->execute($api, 'items', 'update', $id, ['title' => 'Reload', 'notify' => false, 'revision' => $row['revision']]);
verify($result['reauthenticate'] === true && (int)$call('get', $id)['notify'] === 0, 'API uses same relation and hook result');
$row = $call('get', $id);
denied(static fn() => $workspace->executor->execute($api, 'items', 'update', $id, ['title' => 'Invalid', 'notify' => 'true', 'revision' => $row['revision']]), 400);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items','update','ui','deny','all','','notify')");
denied(static fn() => $call('update', $id, ['title' => 'Denied', 'notify' => true, 'revision' => $row['revision']]), 403);
$call('update', $id, ['title' => 'Allowed', 'revision' => $row['revision']]);
verify((int)$call('get', $id)['notify'] === 0, 'Omitted denied relation field is preserved');
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','items','list','ui','deny','all','','notify')");
denied(static fn() => $call('list', values: ['mode' => 'dynamic', 'filters' => ['notify' => '1']]), 403);
$list = $call('list', values: ['mode' => 'dynamic']);
verify(!array_key_exists('notify', $list['items'][0]), 'Denied related value is omitted');
$row = $call('get', $id);
$call('delete', $id, ['revision' => $row['revision']]);
verify((int)$db->query('SELECT COUNT(*) FROM item_preferences')->fetchColumn() === 0, 'Related rows are removed with the object');
echo "61de checkbox and related-field contracts passed.\n";

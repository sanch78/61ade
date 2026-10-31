<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Context, Failure, Field, View};
use Blade\Shell\Identity;

// Tree navigation (Registry::tree), conditional fields (visible_when) and view guides on the feature demo's registry
// module (examples/demo-app/modules/registry.json) over an in-memory database.
function verify(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function rejected(Closure $work, string $message): void
{
    try { $work(); } catch (InvalidArgumentException) { return; }
    throw new RuntimeException($message);
}
function failed(Closure $work, int $status, ?string $field = null): void
{
    try { $work(); } catch (Failure $error) { verify($error->status === $status && ($field === null || isset($error->fieldErrors[$field])), $error->getMessage()); return; }
    throw new RuntimeException('Expected rejection.');
}

// Declaration rules.
$when = ['field' => 'type', 'in' => ['a']];
verify((new Field('x', 'X', visibleWhen: $when))->metadata()['visibleWhen'] === $when, 'Condition in field metadata');
foreach ([['field' => 'x', 'in' => ['a']], ['field' => 'type', 'in' => []], ['field' => 'type', 'in' => ['a', 'a']], ['field' => 'type', 'in' => [1]], ['field' => 'type'], ['field' => 'type', 'in' => ['a'], 'not' => true]] as $bad)
    rejected(static fn() => new Field('x', 'X', visibleWhen: $bad), 'Invalid condition accepted: '.json_encode($bad));
rejected(static fn() => new Field('x', 'X', column: ['editable' => true], visibleWhen: $when), 'Editable conditional column accepted');
rejected(static fn() => new Field('x', 'X', bulk: true, visibleWhen: $when), 'Bulk conditional field accepted');
rejected(static fn() => new Blade\Feature\Action('r', 'a', 'A', [new Field('type', 'T', visibleWhen: ['field' => 'x', 'in' => ['1']]), new Field('x', 'X', visibleWhen: $when)], static fn() => []), 'Chained condition accepted');
verify((new View('v', 'list', 'V', guide: "Első.\n\nMásodik."))->guide === "Első.\n\nMásodik.", 'View guide kept');
foreach (['', '  ', str_repeat('x', 4001), "a\0b"] as $bad) rejected(static fn() => new View('v', 'list', 'V', guide: $bad), 'Invalid guide accepted');

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
Schema::install($db);
$db->exec("CREATE TABLE demo_registry_keys(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,parent_id TEXT NOT NULL DEFAULT '')");
$db->exec("CREATE TABLE demo_registry_values(id INTEGER PRIMARY KEY AUTOINCREMENT,key_id INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'REG_SZ',string_value TEXT NOT NULL DEFAULT '',multi_value TEXT NOT NULL DEFAULT '',dword_value TEXT NOT NULL DEFAULT '',qword_value TEXT NOT NULL DEFAULT '',binary_value TEXT NOT NULL DEFAULT '')");
$workspace = WorkspaceConfiguration::build($db, [dirname(__DIR__, 2).'/examples/demo-app/modules/registry.json'], static fn() => [
    'registry.key_guard' => static function (Context $ctx, ?array $target, array $values): void {
        if ($target !== null && (string) ($values['parent_id'] ?? '') === (string) $target['id']) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['parent_id' => 'Saját maga alá nem kerülhet.']);
    },
    'registry.key_after_delete' => static fn() => null,
]);
$grant = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,'ui','allow','all','','')");
foreach (['demo_registry_keys', 'demo_registry_values'] as $resource) foreach (['list', 'get', 'create', 'update', 'delete'] as $action) $grant->execute(['1', $resource, $action]);
$admin = new Identity('1', 'Synthetic');
$context = new Context($admin, 'ui', $workspace->acl, $db);
$call = static fn($resource, $action, $id = null, $values = []) => $workspace->executor->execute($context, $resource, $action, $id, $values);

// Bootstrap: the value list carries the resolved tree and its guide; the node view has no menu entry of its own.
$views = array_column($workspace->views($admin), null, 'id');
$values = $views['demo_registry_values'] ?? throw new RuntimeException('Value view offered');
verify(!isset($views['demo_registry_keys']), 'Node view embedded');
$tree = $values['options']['tree'] ?? [];
verify(array_keys($tree) === ['view', 'field', 'parent', 'label'] && $tree['view']['id'] === 'demo_registry_keys' && $tree['field'] === 'key_id' && $tree['parent'] === 'parent_id' && $tree['label'] === 'name', 'Resolved tree navigation');
verify(($tree['view']['options']['subview']['shared'] ?? false) === true, 'Node view keeps its hierarchy');
verify(is_string($values['guide'] ?? null) && str_contains($values['guide'], 'visible_when'), 'Guide in bootstrap');
$fields = array_column(array_column($values['actions'], null, 'name')['create']['fields'], null, 'name');
verify($fields['dword_value']['visibleWhen'] === ['field' => 'type', 'in' => ['REG_DWORD']] && !isset($fields['type']['visibleWhen']), 'Condition in action metadata');
// Without the node view's list the value view is a plain list.
$reader = new Identity('2', 'Reader');
$grant->execute(['2', 'demo_registry_values', 'list']);$grant->execute(['2', 'demo_registry_values', 'get']);
verify(!isset(array_column($workspace->views($reader), null, 'id')['demo_registry_values']['options']['tree']), 'Tree dropped without the node list');

// Declaration errors of Registry::tree.
$registry = $workspace->registry;
rejected(static fn() => $registry->tree('demo_registry_values', 'demo_registry_keys', 'key_id', 'name'), 'Second tree accepted');
rejected(static fn() => $registry->tree('demo_registry_keys', 'demo_registry_keys', 'parent_id', 'name'), 'Tree of its own resource accepted');

// Nodes: roots and children through the ordinary list with the parent filter; a key cannot move below itself.
$root = (string) $call('demo_registry_keys', 'create', null, ['name' => 'HKEY_TEST', 'parent_id' => ''])['id'];
$child = (string) $call('demo_registry_keys', 'create', null, ['name' => 'Software', 'parent_id' => $root])['id'];
$list = static fn($resource, $filters) => $workspace->executor->execute($context, $resource, 'list', null, ['mode' => 'dynamic', 'limit' => 50, 'filters' => $filters])['items'];
$roots = $list('demo_registry_keys', ['parent_id' => '']);
verify(array_column($roots, 'id') === [$root] && $roots[0]['_subview'] === 1, 'Roots with their child count');
verify(array_column($list('demo_registry_keys', ['parent_id' => $root]), 'name') === ['Software'], 'Children of a node');
failed(static fn() => $call('demo_registry_keys', 'create', null, ['name' => 'Software', 'parent_id' => $root]), 409);
$row = $workspace->executor->execute($context, 'demo_registry_keys', 'get', $child, []);
failed(static fn() => $call('demo_registry_keys', 'update', $child, ['name' => 'Software', 'parent_id' => $child, 'revision' => $row['revision']]), 400, 'parent_id');

// Values: only the active editor is validated and stored; a type change empties the others.
failed(static fn() => $call('demo_registry_values', 'create', null, ['key_id' => $child, 'name' => 'Width', 'type' => 'REG_DWORD', 'dword_value' => '']), 400, 'dword_value');
failed(static fn() => $call('demo_registry_values', 'create', null, ['key_id' => $child, 'name' => 'Width', 'type' => 'REG_DWORD', 'dword_value' => 'xyz']), 400, 'dword_value');
$id = (string) $call('demo_registry_values', 'create', null, ['key_id' => $child, 'name' => 'Width', 'type' => 'REG_DWORD', 'dword_value' => '2A', 'string_value' => 'ignored', 'qword_value' => 'not hex'])['id'];
$value = $workspace->executor->execute($context, 'demo_registry_values', 'get', $id, []);
verify($value['dword_value'] === '2A' && $value['string_value'] === '' && $value['qword_value'] === '' && $value['data'] === '0x0000002a', 'Inactive fields stored empty, display computed');
$call('demo_registry_values', 'update', $id, ['name' => 'Width', 'type' => 'REG_MULTI_SZ', 'multi_value' => "a\nb", 'revision' => $value['revision']]);
$value = $workspace->executor->execute($context, 'demo_registry_values', 'get', $id, []);
verify($value['dword_value'] === '' && $value['multi_value'] === "a\nb" && $value['data'] === 'a | b', 'Type change empties the previous editor');
// A save that sends neither the field nor its condition leaves the stored value alone (the stored type decides).
failed(static fn() => $call('demo_registry_values', 'update', $id, ['name' => 'Width', 'multi_value' => str_repeat('x', 2001), 'revision' => $value['revision']]), 400, 'multi_value');
verify(array_column($list('demo_registry_values', ['key_id' => $child]), 'name') === ['Width'] && $list('demo_registry_values', ['key_id' => $root]) === [], 'Value list scoped to the key');

echo "61ade tree navigation, conditional field and view guide contracts passed.\n";

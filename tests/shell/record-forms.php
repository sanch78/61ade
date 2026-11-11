<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Action, Context, Failure, Field, Registry, SqlResource, Workspace};
use Blade\Shell\Identity;

// Record action forms: read-only fields (FB-0171: Action::$display, SqlResource createOnly / JSON storage.create_only,
// readable fields the actor may not write) and collapsible field sections (FB-0172: Field::$section / JSON section)
// over an in-memory database.
function verify(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function rejected(Closure $work, string $message): void
{
    try { $work(); } catch (InvalidArgumentException) { return; }
    throw new RuntimeException($message);
}
function failed(Closure $work, int $status, string $message): void
{
    try { $work(); } catch (Failure $error) { verify($error->status === $status, $message.': '.$error->getMessage()); return; }
    throw new RuntimeException($message.': accepted');
}

// Sections: a plain-text label of at most 100 characters, translated in the metadata.
verify((new Field('x', 'X', section: 'Képek'))->metadata()['section'] === 'Képek', 'Section in field metadata');
verify(!array_key_exists('section', (new Field('x', 'X'))->metadata()), 'No section key without a section');
foreach (['', '   ', str_repeat('a', 101), "a\nb", "a\tb"] as $bad) rejected(static fn() => new Field('x', 'X', section: $bad), 'Invalid section accepted: '.json_encode($bad));
// Display fields: readable, not an input of the action, unique.
$noop = static fn() => [];
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: [new Field('s', 'S', secret: true)]), 'Secret display field accepted');
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: [new Field('p', 'P', 'password')]), 'Password display field accepted');
rejected(static fn() => new Action('r', 'a', 'A', [new Field('x', 'X')], $noop, display: [new Field('x', 'X')]), 'Display field that is an input accepted');
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: [new Field('x', 'X'), new Field('x', 'X')]), 'Repeated display field accepted');
rejected(static fn() => new Action('r', 'a', 'A', [], $noop, display: ['x']), 'Display entry that is no Field accepted');
// createOnly: a written, readable field no update path changes.
$fields = static fn() => [new Field('title', 'Title', required: true), new Field('kind', 'Kind', 'select', options: ['a' => 'Alpha', 'b' => 'Beta']), new Field('secret', 'Secret', secret: true),
    new Field('cell', 'Cell', column: ['editable' => true]), new Field('mass', 'Mass', bulk: true), new Field('total', 'Total', 'number')];
foreach ([['missing'], ['secret'], ['cell'], ['mass'], ['total'], ['kind', 'kind'], ['k' => 'kind']] as $bad)
    rejected(static fn() => new SqlResource('r', 'r', 'id', $fields(), computed: ['total' => '1'], createOnly: $bad), 'Invalid createOnly accepted: '.json_encode($bad));

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
Schema::install($db);
$db->exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT \'\', image TEXT NOT NULL DEFAULT \'\')');
$registry = new Registry();
(new SqlResource('items', 'items', 'id', [
    new Field('parent_id', 'Parent', 'select', required: true, options: ['1' => 'Root', '2' => 'Branch']),
    new Field('kind', 'Kind', 'select', required: true, options: ['a' => 'Alpha', 'b' => 'Beta']),
    new Field('title', 'Title', required: true),
    new Field('note', 'Note', 'textarea', section: 'More'),
    new Field('image', 'Image', section: 'More'),
], createOnly: ['parent_id', 'kind']))->register($registry, 'Items');
$workspace = new Workspace($registry, $db);
$context = new Context(new Identity('1', 'Synthetic'), 'ui', $workspace->acl, $db);
$rule = $db->prepare("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'items', ?, 'ui', ?, 'all', '', ?)");
foreach (['list', 'get', 'create', 'update'] as $action) $rule->execute([$action, 'allow', '']);
$names = static fn(array $list) => array_map(static fn($field) => $field instanceof Field ? $field->name : $field['name'], $list);
verify($names($registry->get('items', 'create')->fields) === ['parent_id', 'kind', 'title', 'note', 'image'], 'Create takes the create-only fields');
verify($names($registry->get('items', 'update')->fields) === ['title', 'note', 'image', 'revision'] && $names($registry->get('items', 'update')->display) === ['parent_id', 'kind'], 'Update displays them');
$id = (string) $workspace->executor->execute($context, 'items', 'create', null, ['parent_id' => '2', 'kind' => 'b', 'title' => 'One'])['id'];
// The update form: the display fields first (read-only, with the stored values), then the inputs; sections in metadata.
$form = $workspace->describe($context, $registry->get('items', 'update'), $id);
verify($names($form['fields']) === ['parent_id', 'kind', 'title', 'note', 'image', 'revision'], 'Update form order: '.json_encode($names($form['fields'])));
verify(($form['fields'][0]['readOnly'] ?? false) && ($form['fields'][1]['readOnly'] ?? false) && !isset($form['fields'][2]['readOnly']), 'Display fields marked read-only');
verify($form['values']['parent_id'] === '2' && $form['values']['kind'] === 'b' && $form['fields'][1]['options'] === ['a' => 'Alpha', 'b' => 'Beta'], 'Display values and options');
verify(($form['fields'][3]['section'] ?? null) === 'More' && ($form['fields'][4]['section'] ?? null) === 'More' && !isset($form['fields'][2]['section']), 'Sections in the form metadata');
$create = $workspace->describe($context, $registry->get('items', 'create'), null);
verify($names($create['fields']) === ['parent_id', 'kind', 'title', 'note', 'image'] && !array_filter($create['fields'], static fn($field) => $field['readOnly'] ?? false), 'Create form: everything editable');
// A save that sends a display field is refused, nothing changes; without it the update saves.
$revision = $form['values']['revision'];
failed(static fn() => $workspace->executor->execute($context, 'items', 'update', $id, ['title' => 'Two', 'kind' => 'a', 'revision' => $revision]), 400, 'A display field sent');
verify($db->query('SELECT kind, title FROM items WHERE id = '.(int) $id)->fetch(PDO::FETCH_ASSOC) === ['kind' => 'b', 'title' => 'One'], 'Refused save changed nothing');
$workspace->executor->execute($context, 'items', 'update', $id, ['title' => 'Two', 'revision' => $revision]);
// Field ACL: a field the actor may read but not write in this action is shown read-only in place; one it may not read
// (get) is left out, a display field too.
$rule->execute(['update', 'deny', 'note']);
$rule->execute(['get', 'deny', 'kind']);
$workspace->acl->invalidate();
$form = $workspace->describe($context, $registry->get('items', 'update'), $id);
verify($names($form['fields']) === ['parent_id', 'title', 'note', 'image', 'revision'], 'Read-only by ACL: '.json_encode($names($form['fields'])));
verify(($form['fields'][2]['readOnly'] ?? false) && !isset($form['fields'][1]['readOnly']) && !array_key_exists('kind', $form['values']), 'Denied write shown read-only; denied read absent');
failed(static fn() => $workspace->executor->execute($context, 'items', 'update', $id, ['title' => 'Three', 'note' => 'x', 'revision' => $form['values']['revision']]), 403, 'A write-denied field sent');
// The create form keeps a write-denied field out (no record to read it from).
$rule->execute(['create', 'deny', 'note']);
$workspace->acl->invalidate();
verify(!in_array('note', $names($workspace->describe($context, $registry->get('items', 'create'), null)['fields']), true), 'Create leaves a write-denied field out');
// The list column metadata carries the section (the singleton's details form groups by it).
$columns = array_column($registry->provider('list')->metadata($context, $registry->views()[0])['options']['columns'], null, 'id');
verify(($columns['note']['section'] ?? null) === 'More' && !isset($columns['title']['section']), 'Column section');

// JSON: storage.create_only and a field's section.
$directory = sys_get_temp_dir().'/blade-record-forms-'.bin2hex(random_bytes(4));
mkdir($directory);
try {
    $module = ['resources' => ['items' => ['storage' => ['table' => 'items', 'key' => 'id', 'create_only' => ['kind']],
        'fields' => [['name' => 'kind', 'label' => 'Kind', 'type' => 'select', 'options' => ['a' => 'Alpha']], ['name' => 'title', 'label' => 'Title', 'section' => 'More']], 'view' => ['title' => 'Items']]]];
    file_put_contents($directory.'/module.json', json_encode($module, JSON_THROW_ON_ERROR));
    $json = WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => []);
    verify($names($json->registry->get('items', 'update')->display) === ['kind'] && $json->registry->fields('items')['title']->section === 'More', 'JSON create_only and section');
    foreach ([['storage', 'create_only', 'kind'], ['storage', 'create_only', ['missing']], ['field', 'section', ['More']], ['field', 'section', '']] as [$where, $key, $value]) {
        $broken = $module;
        if ($where === 'storage') $broken['resources']['items']['storage'][$key] = $value; else $broken['resources']['items']['fields'][1][$key] = $value;
        file_put_contents($directory.'/module.json', json_encode($broken, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => []), 'Invalid JSON '.$key.' accepted: '.json_encode($value));
    }
} finally {
    array_map('unlink', glob($directory.'/*') ?: []);
    rmdir($directory);
}

echo "61ade record form contracts passed.\n";

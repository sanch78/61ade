<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Context, Failure, Field, Registry, SqlResource, Workspace};
use Blade\Shell\Identity;

// Count fields (FB-0173, SqlResource `counts`, JSON `storage.counts`): a global category resource counts the
// tenant-scoped items each actor could list (list ACL, where, tenant, archive policy), over an in-memory database.
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

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
Schema::install($db);
Blade\Tenancy\Tenancy::install($db);
$db->exec('CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT \'\')');
$db->exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, title TEXT NOT NULL, category_id TEXT NOT NULL, kind TEXT NOT NULL, archived_at TEXT, archived_by TEXT)');
// Root 1 > child 2; root 3. Tenant 1: two notes and a file in 2, a note in 1; tenant 2: one note in 2.
$db->exec("INSERT INTO categories (name, parent_id) VALUES ('Root', ''), ('Child', '1'), ('Other', '')");
$db->exec("INSERT INTO items (tenant_id, title, category_id, kind) VALUES ('1', 'a', '2', 'note'), ('1', 'b', '2', 'note'), ('1', 'c', '2', 'file'), ('1', 'd', '1', 'note'), ('2', 'e', '2', 'note')");
foreach (['1', '2'] as $tenant) { $db->exec("INSERT INTO blade_tenants (name) VALUES ('T$tenant')"); }
foreach ([['1', '1'], ['2', '1'], ['1', '2']] as [$tenant, $actor]) $db->exec("INSERT INTO blade_tenant_members (tenant_id, actor_id) VALUES ('$tenant', '$actor')");

$counts = ['total' => ['resource' => 'items', 'match' => ['category_id', 'cat1']], 'notes' => ['resource' => 'items', 'match' => ['category_id'], 'filters' => ['kind' => 'note']]];
$categoryFields = static fn() => [new Field('name', 'Name', required: true), new Field('parent_id', 'Parent'), new Field('total', 'Total', 'number'), new Field('notes', 'Notes', 'number', column: ['secondary' => true])];
// Declaration rules at definition.
foreach ([
    ['missing' => $counts['total']], ['name' => $counts['total']], ['total' => ['resource' => 'items']], ['total' => ['resource' => 'items', 'match' => []]],
    ['total' => ['resource' => 'items', 'match' => ['a', 'a']]], ['total' => ['resource' => 'items', 'match' => ['a'], 'filters' => ['kind']]], ['total' => ['resource' => 'items', 'match' => ['a'], 'filters' => ['kind' => 1]]],
    ['total' => ['resource' => 'items', 'match' => ['a'], 'on' => 'missing']], ['total' => ['resource' => 'items', 'match' => ['a'], 'extra' => 1]], ['total' => ['resource' => 'Bad name', 'match' => ['a']]],
    ['total' => ['resource' => 'items', 'match' => ['a'], 'on' => 'notes'], 'notes' => ['resource' => 'items', 'match' => ['a']]],
] as $bad) rejected(static fn() => new SqlResource('categories', 'categories', 'id', $categoryFields(), counts: $bad), 'Invalid count accepted: '.json_encode($bad));
rejected(static fn() => new SqlResource('categories', 'categories', 'id', $categoryFields(), computed: ['total' => '1'], counts: ['total' => $counts['total']]), 'Computed count field accepted');

$registry = new Registry();
$categories = new SqlResource('categories', 'categories', 'id', $categoryFields(), counts: $counts);
$categories->register($registry, 'Categories');
$items = new SqlResource('items', 'items', 'id', [new Field('title', 'Title', required: true), new Field('category_id', 'Category'), new Field('kind', 'Kind', 'select', options: ['note' => 'Note', 'file' => 'File']),
    new Field('cat1', 'Parent category', scopeOnly: true)], computed: ['cat1' => "(SELECT parent_id FROM categories c WHERE CAST(c.id AS CHAR) = blade_base.category_id)"], tenantColumn: 'tenant_id');
$items->register($registry, 'Items');
$items->registerDelete($registry, 'archive');
$registry->checkViews();
// Reference rules at checkViews(): an unknown resource, a match field that is no queryable field, a bad filter value.
foreach ([['resource' => 'nothing', 'match' => ['category_id']], ['resource' => 'items', 'match' => ['missing']], ['resource' => 'items', 'match' => ['category_id'], 'filters' => ['missing' => 'x']],
    ['resource' => 'items', 'match' => ['category_id'], 'filters' => ['cat1' => '1']]] as $bad) {
    $broken = new Registry();
    (new SqlResource('categories', 'categories', 'id', $categoryFields(), counts: ['total' => $bad]))->register($broken, 'Categories');
    $items->register($broken, 'Items');
    rejected(static fn() => $broken->checkViews(), 'Invalid count reference accepted: '.json_encode($bad));
}
verify(!in_array('total', array_map(static fn($f) => $f->name, $registry->get('categories', 'update')->fields), true) && !in_array('notes', array_map(static fn($f) => $f->name, $registry->get('categories', 'create')->fields), true), 'Count fields are never input');

$workspace = new Workspace($registry, $db, true);
$rule = $db->prepare("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', ?, ?, ?, 'ui', ?, ?, ?, ?)");
foreach (['1', '2'] as $actor) { foreach (['list', 'get', 'update'] as $action) $rule->execute([$actor, 'categories', $action, 'allow', 'all', '', '']); }
foreach (['list', 'get', 'delete'] as $action) $rule->execute(['1', 'items', $action, 'allow', 'all', '', '']);
$context = static fn(string $actor, ?string $tenant) => new Context(new Identity($actor, 'Synthetic'), 'ui', $workspace->acl, $db, tenant: $tenant);
$list = static fn(Context $ctx, array $values = []) => array_column($workspace->executor->execute($ctx, 'categories', 'list', null, $values)['items'], null, 'name');
$pick = static function (array $rows, string $field): array { $out = array_map(static fn($row) => $row[$field] ?? 'absent', $rows); return ['Root' => $out['Root'], 'Child' => $out['Child'], 'Other' => $out['Other']]; };

// Tenant 1: Root counts itself and its child (recursive), Child its own; notes are direct and filtered.
$one = $list($context('1', '1'));
verify($pick($one, 'total') === ['Root' => 4, 'Child' => 3, 'Other' => 0] && $pick($one, 'notes') === ['Root' => 1, 'Child' => 2, 'Other' => 0], 'Tenant 1 counts: '.json_encode([$pick($one, 'total'), $pick($one, 'notes')]));
$two = $list($context('1', '2'));
verify($pick($two, 'total') === ['Root' => 1, 'Child' => 1, 'Other' => 0] && $pick($two, 'notes') === ['Root' => 0, 'Child' => 1, 'Other' => 0], 'Tenant 2 counts');
// get gives the same values; the revision does not depend on them.
$child = (string) $one['Child']['id'];
$got = $workspace->executor->execute($context('1', '1'), 'categories', 'get', $child, []);
verify($got['total'] === 3 && $got['notes'] === 2 && $got['revision'] === $one['Child']['revision'], 'get equals the list');
// Live observation (watch mode) carries them too.
$watched = array_column($registry->get('categories', 'list')->listSource->read($context('1', '2'), ['mode' => 'watch', 'limit' => 50])['items'], null, 'name');
verify($watched['Child']['total'] === 1, 'Watch carries the counts');
// Without an active tenant the tenant-scoped items cannot be counted: no value, not 0.
verify($pick($list($context('1', null)), 'total') === ['Root' => 'absent', 'Child' => 'absent', 'Other' => 'absent'], 'No tenant, no count');
// An actor without list on the items gets no value.
verify($pick($list($context('2', '1')), 'notes') === ['Root' => 'absent', 'Child' => 'absent', 'Other' => 'absent'], 'No list right, no count');
// An archived item and an item with an object list deny are not counted; a re-read shows the new count.
$a = (string) $db->query("SELECT id FROM items WHERE title = 'a'")->fetchColumn();
$revision = $workspace->executor->execute($context('1', '1'), 'items', 'get', $a, [])['revision'];
$workspace->executor->execute($context('1', '1'), 'items', 'delete', $a, ['revision' => $revision]);
$rule->execute(['1', 'items', 'list', 'deny', 'id', (string) $db->query("SELECT id FROM items WHERE title = 'b'")->fetchColumn(), '']);
$workspace->acl->invalidate();
$after = $list($context('1', '1'));
verify($pick($after, 'total') === ['Root' => 2, 'Child' => 1, 'Other' => 0] && $pick($after, 'notes') === ['Root' => 1, 'Child' => 0, 'Other' => 0], 'Archive and object deny: '.json_encode($pick($after, 'total')));
verify($after['Child']['revision'] === $one['Child']['revision'], 'A count change keeps the revision');
// A field deny on a match field: no value for that count; the other count stays.
$rule->execute(['1', 'items', 'list', 'deny', 'all', '', 'cat1']);
$workspace->acl->invalidate();
$denied = $list($context('1', '1'));
verify($pick($denied, 'total') === ['Root' => 'absent', 'Child' => 'absent', 'Other' => 'absent'] && $pick($denied, 'notes')['Root'] === 1, 'Match field deny hides that count');
// A deny on the count field itself hides it as any field.
$rule->execute(['1', 'categories', 'list', 'deny', 'all', '', 'notes']);
$workspace->acl->invalidate();
verify(!array_key_exists('notes', $list($context('1', '1'))['Root']), 'Count field deny');
// Not a filter, a scope or a sort; the view's filters and sortable fields leave the counts out.
failed(static fn() => $list($context('1', '1'), ['filters' => ['total' => '1']]), 403, 'Filter by a count');
failed(static fn() => $list($context('1', '1'), ['scope' => ['field' => 'total', 'value' => '1']]), 403, 'Scope by a count');
failed(static fn() => $list($context('1', '1'), ['sort' => ['field' => 'total', 'direction' => 'asc']]), 403, 'Sort by a count');
$source = $registry->get('categories', 'list')->listSource;
verify(!array_intersect(['total', 'notes'], [...array_column($source->filterDefinitions($context('1', '1')), 'name'), ...$source->sortableFields($context('1', '1'))]), 'Counts are no filter or sort field');
// An API token needs the counted list in its scopes, as the executor requires; with it the API gets the counts.
$db->exec("DELETE FROM blade_rules WHERE field_name IN ('cat1', 'notes')");
$apiRule = $db->prepare("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', ?, 'list', 'api', 'allow', 'all', '', '')");
foreach (['categories', 'items'] as $resource) $apiRule->execute([$resource]);
$workspace->acl->invalidate();
$api = static fn(array $scopes) => array_column($workspace->executor->execute(new Context(new Identity('1', 'Synthetic'), 'api', $workspace->acl, $db, $scopes, tenant: '2'), 'categories', 'list', null, [])['items'], null, 'name');
verify(!array_key_exists('total', $api(['categories.list'])['Child']), 'A token without items.list gets no count');
verify(($api(['categories.list', 'items.list'])['Child']['total'] ?? null) === 1, 'A token with items.list gets the count');
// More than 500 values (SQLite's compound SELECT limit) are counted in chunks.
$many = array_map(static fn($n) => ['id' => (string) $n, 'total' => null], range(1, 650));
$filled = $registry->get('categories', 'list')->listSource->counted($context('1', '2'), $many);
verify(count($filled) === 650 && $filled[1]['total'] === 1 && $filled[649]['total'] === 0, 'Counts over 650 rows');
// `on`: another field of the row (here a category counts the items of its parent).
$registry2 = new Registry();
(new SqlResource('categories', 'categories', 'id', $categoryFields(), counts: ['total' => ['resource' => 'items', 'match' => ['category_id'], 'on' => 'parent_id'], 'notes' => $counts['notes']]))->register($registry2, 'Categories');
$items->register($registry2, 'Items');
$registry2->checkViews();
$on = array_column((new Workspace($registry2, $db, true))->executor->execute(new Context(new Identity('1', 'Synthetic'), 'ui', $workspace->acl, $db, tenant: '1'), 'categories', 'list', null, [])['items'], null, 'name');
verify($on['Child']['total'] === 1 && $on['Root']['total'] === 0, '`on` counts by the parent: '.json_encode(array_column($on, 'total', 'name')));

// JSON: storage.counts reaches the resource.
$directory = sys_get_temp_dir().'/blade-counts-'.bin2hex(random_bytes(4));
mkdir($directory);
try {
    file_put_contents($directory.'/module.json', json_encode(['resources' => [
        'categories' => ['storage' => ['table' => 'categories', 'key' => 'id', 'counts' => ['total' => ['resource' => 'items', 'match' => ['category_id'], 'filters' => ['kind' => 'note']]]],
            'fields' => [['name' => 'name', 'label' => 'Name'], ['name' => 'total', 'label' => 'Total', 'type' => 'number']], 'view' => ['title' => 'Categories']],
        'items' => ['storage' => ['table' => 'items', 'key' => 'id', 'tenant_column' => 'tenant_id'], 'fields' => [['name' => 'category_id', 'label' => 'Category'], ['name' => 'kind', 'label' => 'Kind']], 'view' => ['title' => 'Items']],
    ]], JSON_THROW_ON_ERROR));
    $json = WorkspaceConfiguration::build($db, [$directory.'/module.json'], static fn() => [], true);
    verify(array_keys($json->registry->countFields('categories')) === ['total'], 'JSON storage.counts');
    $rows = array_column($json->executor->execute(new Context(new Identity('1', 'Synthetic'), 'ui', $json->acl, $db, tenant: '2'), 'categories', 'list', null, [])['items'], null, 'name');
    verify($rows['Child']['total'] === 1, 'JSON count value');
} finally {
    array_map('unlink', glob($directory.'/*') ?: []);
    rmdir($directory);
}

echo "61ade count field contracts passed.\n";

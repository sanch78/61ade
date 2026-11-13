<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Action, Context, Delegation, DelegationLink, DelegationVia, Failure, Field, Lookup, Registry, SqlResource, Workspace};
use Blade\Shell\Identity;

// Delegated access (FB-0180, SqlResource `delegation`, JSON `storage.delegation`, ACL scope `delegated`) over synthetic
// collections and items. SQLite in memory by default; with BLADE_TEST_MYSQL_DSN/USER/PASSWORD (optional
// BLADE_TEST_MYSQL_COLLATION) the same contract runs on a disposable MySQL schema with native prepared statements.
function verify(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
function rejected(Closure $work, string $message): void
{
    try { $work(); } catch (InvalidArgumentException) { return; }
    throw new RuntimeException($message.': accepted');
}
function failed(Closure $work, int $status, string $message): void
{
    try { $work(); } catch (Failure $error) { verify($error->status === $status, $message.': '.$error->status.' '.$error->getMessage()); return; }
    throw new RuntimeException($message.': accepted');
}
function broken(Closure $work, string $message): void
{
    try { $work(); } catch (LogicException) { return; } catch (Failure $error) { verify($error->status === 500, $message.': '.$error->status); return; }
    throw new RuntimeException($message.': accepted');
}

$dsn = getenv('BLADE_TEST_MYSQL_DSN') ?: null;
if ($dsn !== null) {
    $db = new PDO($dsn, (string) getenv('BLADE_TEST_MYSQL_USER'), (string) getenv('BLADE_TEST_MYSQL_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    if (($collation = getenv('BLADE_TEST_MYSQL_COLLATION')) !== false && $collation !== '') $db->exec('SET NAMES utf8mb4 COLLATE '.preg_replace('/[^a-z0-9_]/', '', $collation));
    foreach ($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) $db->exec("DROP TABLE `$table`");
    $auto = 'BIGINT AUTO_INCREMENT PRIMARY KEY';
} else {
    $db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $auto = 'INTEGER PRIMARY KEY AUTOINCREMENT';
}
$mysql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
Schema::install($db);
Blade\Tenancy\Tenancy::install($db);
$db->exec("CREATE TABLE collections (id $auto, title VARCHAR(100) NOT NULL)");
$db->exec("CREATE TABLE items (id $auto, collection_id BIGINT NOT NULL, title VARCHAR(100) NOT NULL, label VARCHAR(100) NOT NULL DEFAULT '', sort_order BIGINT NOT NULL DEFAULT 0, archived_at VARCHAR(30), archived_by VARCHAR(64))");
$db->exec("CREATE TABLE notes (id $auto, tenant_id VARCHAR(100) NOT NULL, collection_id BIGINT NOT NULL, title VARCHAR(100) NOT NULL)");
// Consumer-owned relationship tables: their columns share names with the resource tables on purpose (shadowing).
foreach (['collection_readers', 'collection_writers'] as $table) $db->exec("CREATE TABLE $table (id $auto, collection_id BIGINT NOT NULL, actor_id BIGINT NOT NULL)");
$db->exec("CREATE TABLE item_owners (id $auto, item_id BIGINT NOT NULL, actor_id BIGINT NOT NULL, title VARCHAR(100) NOT NULL DEFAULT '')");
$db->exec("INSERT INTO collections (title) VALUES ('A'), ('B'), ('C')");
$db->exec("INSERT INTO items (collection_id, title, sort_order) VALUES (1, 'a1', 1), (2, 'b1', 2), (3, 'c1', 3), (1, 'a2', 4)");
foreach (['1', '2'] as $tenant) $db->exec("INSERT INTO blade_tenants (name) VALUES ('T$tenant')");
$db->exec("INSERT INTO blade_tenant_members (tenant_id, actor_id) VALUES ('1', '10'), ('2', '10'), ('1', '20')");
$db->exec("INSERT INTO notes (tenant_id, collection_id, title) VALUES ('1', 1, 'n1'), ('2', 1, 'n2'), ('1', 3, 'n3')");
// Actor 10 reads A and B and writes A; 40 writes A without reading it; 60 owns item c1 only; 20 is an ordinary administrator.
$db->exec('INSERT INTO collection_readers (collection_id, actor_id) VALUES (1, 10), (2, 10), (1, 50), (2, 50), (3, 50)');
$db->exec('INSERT INTO collection_writers (collection_id, actor_id) VALUES (1, 10), (1, 40), (1, 50), (3, 50)');
$db->exec('INSERT INTO item_owners (item_id, actor_id) VALUES (3, 60)');

$readers = new DelegationLink('collection_readers', 'collection_id', 'actor_id', 'collection_id');
$writers = new DelegationLink('collection_writers', 'collection_id', 'actor_id', 'collection_id');
// Declaration rules.
rejected(static fn() => new DelegationLink('blade_rules', 'a', 'b', 'c'), 'A blade_ link table accepted');
rejected(static fn() => new DelegationLink('BLADE_x', 'a', 'b', 'c'), 'A BLADE_ link table accepted');
rejected(static fn() => new DelegationLink('t', 'a b', 'b', 'c'), 'An invalid link column accepted');
rejected(static fn() => new DelegationVia('items', 'id;', 'collection_id'), 'An invalid via column accepted');
rejected(static fn() => new Delegation(array_fill(0, 11, $readers)), 'More than ten links accepted');
rejected(static fn() => new Delegation(['x' => $readers]), 'A keyed link list accepted');
foreach ([
    'computed column' => [new DelegationLink('collection_readers', 'collection_id', 'actor_id', 'total')],
    'unknown column' => [new DelegationLink('collection_readers', 'collection_id', 'actor_id', 'nope')],
    'resource table as link (case variant)' => [new DelegationLink('COLLECTIONS', 'id', 'actor_id', 'id')],
    'resource table as via' => [new DelegationLink('item_owners', 'item_id', 'actor_id', 'id', new DelegationVia('Collections', 'id', 'id'))],
] as $case => $links) {
    rejected(static function () use ($links) {
        (new SqlResource('bad', 'collections', 'id', [new Field('title', 'Title'), new Field('total', 'Total', 'number')], computed: ['total' => '1'], delegation: new Delegation($links)))->register(new Registry(), 'Bad');
    }, 'Invalid delegation accepted: '.$case);
}

$registry = new Registry();
$normalizeTo = null;
$collections = new SqlResource('collections', 'collections', 'id', [new Field('title', 'Title', required: true), new Field('items_total', 'Items', 'number')],
    counts: ['items_total' => ['resource' => 'items', 'match' => ['collection_id']]],
    // A parent's visibility through ownership of a child: item_owners.item_id = items.id, items.collection_id = collections.id.
    delegation: new Delegation(read: [new DelegationLink('collection_readers', 'collection_id', 'actor_id', 'id'), new DelegationLink('item_owners', 'item_id', 'actor_id', 'id', new DelegationVia('items', 'id', 'collection_id'))],
        write: [new DelegationLink('collection_writers', 'collection_id', 'actor_id', 'id')]));
$collections->register($registry, 'Collections');
$items = new SqlResource('items', 'items', 'id', [new Field('collection_id', 'Collection', 'number', required: true), new Field('title', 'Title', required: true), new Field('label', 'Label'), new Field('sort_order', 'Order', 'number')],
    normalize: static function (Context $ctx, ?array $target, array $values) use (&$normalizeTo): array { if ($normalizeTo !== null) $values['collection_id'] = $normalizeTo; return $values; },
    order: ['field' => 'sort_order', 'scope' => null], delegation: new Delegation(read: [$readers], write: [$writers]));
$items->register($registry, 'Items');
$items->registerDelete($registry, 'archive');
$notes = new SqlResource('notes', 'notes', 'id', [new Field('collection_id', 'Collection', 'number', required: true), new Field('title', 'Title', required: true)],
    tenantColumn: 'tenant_id', delegation: new Delegation(read: [$readers], write: [$writers]));
$notes->register($registry, 'Notes');
// Without a declaration.
(new SqlResource('plain', 'collections', 'id', [new Field('title', 'Title', required: true)]))->register($registry, 'Plain', create: false);
// A custom action whose resolver supplies the row context (here: a forged row for any id).
$registry->add(new Action('items', 'flag', 'Flag', [], static fn(Context $ctx, array $target) => ['id' => $target['id']], resolve: static fn(Context $ctx, ?string $id) => ['id' => $id, 'row' => ['collection_id' => '1']], write: true));
$registry->add(new Action('items', 'stamp', 'Stamp', [], static fn() => [], resolve: static fn() => ['id' => null], write: true));
// A custom action with an id-only resolver, one that returns the authoritative row, and one resolved by another resource.
$registry->add(new Action('items', 'touch', 'Touch', [], static fn(Context $ctx, array $target) => ['id' => $target['id']], resolve: static fn(Context $ctx, ?string $id) => ['id' => $id], write: true));
$registry->add(new Action('items', 'pin', 'Pin', [], static fn(Context $ctx, array $target) => ['id' => $target['id']], resolve: static fn(Context $ctx, ?string $id) => $items->target($ctx, (string) $id), write: true));
$registry->add(new Action('items', 'archive_collection', 'Archive collection', [], static fn() => [], resolve: static fn(Context $ctx, ?string $id) => $collections->target($ctx, (string) $id), write: true));
// A resource without SqlResource's create whose consumer create action writes the row itself.
$boxes = new SqlResource('boxes', 'items', 'id', [new Field('collection_id', 'Collection', 'number', required: true), new Field('title', 'Title', required: true)], where: 'items.collection_id > 0', delegation: new Delegation(read: [$readers], write: [$writers]));
$boxes->register($registry, 'Boxes', create: false);
$registry->add(new Action('boxes', 'create', 'New', [new Field('collection_id', 'Collection', 'number', required: true), new Field('title', 'Title', required: true)], static function (Context $ctx, array $target, array $values): array {
    $ctx->db->prepare('INSERT INTO items (collection_id, title) VALUES (?, ?)')->execute([$values['collection_id'], $values['title']]);
    return ['id' => (string) $ctx->db->lastInsertId()];
}, resolve: static fn() => ['id' => null], write: true));
$registry->checkViews();
$workspace = new Workspace($registry, $db, true);
$rule = $db->prepare("INSERT INTO blade_rules (subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', ?, ?, ?, ?, ?, ?, '', ?)");
$grant = static fn(string $actor, string $resource, array $actions, string $effect = 'allow', string $scope = 'delegated', string $field = '', string $channel = 'ui') => array_map(static fn($action) => $rule->execute([$actor, $resource, $action, $channel, $effect, $scope, $field]), $actions);
foreach (['10', '40', '50', '60', '70'] as $actor) {
    $grant($actor, 'collections', ['list', 'get', 'update']);
    $grant($actor, 'items', ['list', 'get', 'create', 'update', 'move', 'delete', 'flag', 'stamp', 'touch', 'pin', 'archive_collection']);
    $grant($actor, 'boxes', ['list', 'get', 'create']);
    $grant($actor, 'notes', ['list', 'get', 'update']);
}
foreach (['collections' => ['list', 'get', 'update', 'create'], 'items' => ['list', 'get', 'create', 'update', 'move', 'delete'], 'notes' => ['list', 'get', 'update']] as $resource => $actions) $grant('20', $resource, $actions, scope: 'all');
$ctx = static fn(string $actor, ?string $tenant = null, string $channel = 'ui', array $scopes = []) => new Context(new Identity($actor, 'Synthetic'), $channel, $workspace->acl, $db, $scopes, tenant: $tenant);
$run = static fn(Context $c, string $resource, string $action, ?string $id = null, array $values = []) => $workspace->executor->execute($c, $resource, $action, $id, $values);
$titles = static fn(Context $c, string $resource, array $query = []) => array_column($run($c, $resource, 'list', null, $query)['items'], 'title');
$id = static fn(string $table, string $title) => (string) $db->query("SELECT id FROM $table WHERE title = '$title'")->fetchColumn();
$revision = static fn(string $resource, string $itemId) => $run($ctx('20', '1'), $resource, 'get', $itemId)['revision'];
$sorted = static function (array $values): array { sort($values); return $values; };

// Lists, gets, forged ids, filters, cursors and totals.
verify($sorted($titles($ctx('10'), 'collections')) === ['A', 'B'], 'Delegated reader lists A and B');
verify($sorted($titles($ctx('20'), 'collections')) === ['A', 'B', 'C'], 'An ordinary all grant lists everything');
verify($titles($ctx('30'), 'collections') === [], 'Without links and rules nothing is listed');
verify($run($ctx('10'), 'collections', 'list')['total'] === 2, 'Totals follow the delegated scope');
verify($titles($ctx('10'), 'collections', ['filters' => ['title' => 'C']]) === [], 'A filter cannot reach C');
verify($run($ctx('10'), 'collections', 'get', $id('collections', 'A'))['title'] === 'A', 'Delegated get of A');
failed(static fn() => $run($ctx('10'), 'collections', 'get', $id('collections', 'C')), 403, 'Forged id of C refused');
failed(static fn() => $run($ctx('10', null, 'api', ['collections.get']), 'collections', 'get', $id('collections', 'C')), 404, 'API callers learn nothing about C');
$page = $run($ctx('10'), 'collections', 'list', null, ['limit' => 1]);
verify(count($page['items']) === 1 && $page['next'] !== null, 'Paged delegated list');
$next = $run($ctx('10'), 'collections', 'list', null, ['limit' => 5, 'cursor' => $page['next']]);
verify(count($next['items']) === 1 && !in_array('C', array_column($next['items'], 'title'), true), 'A cursor stays within the delegated scope');
// Forged cursor positioned at C: still only scoped rows.
$forged = rtrim(strtr(base64_encode(json_encode(['edge' => $id('collections', 'C'), 'sort' => ['field' => 'id', 'direction' => 'desc'], 'value' => null, 'direction' => 'next'])), '+/', '-_'), '=');
verify(!in_array('C', $titles($ctx('10'), 'collections', ['cursor' => $forged]), true), 'A forged cursor cannot reach C');
// Via link: actor 60 owns the item c1 of C and sees C only.
verify($titles($ctx('60'), 'collections') === ['C'], 'Visibility of a parent through ownership of a child (via)');
failed(static fn() => $run($ctx('60'), 'collections', 'get', $id('collections', 'A')), 403, 'Via owner cannot get A');

// Writes on existing rows: write link and effective get.
$a = $id('collections', 'A'); $b = $id('collections', 'B'); $c = $id('collections', 'C');
verify($run($ctx('10'), 'collections', 'update', $a, ['title' => 'A', 'revision' => $revision('collections', $a)])['id'] === $a, 'Writer updates A');
failed(static fn() => $run($ctx('10'), 'collections', 'update', $b, ['title' => 'B!', 'revision' => $revision('collections', $b)]), 403, 'Reader cannot update B');
failed(static fn() => $run($ctx('10'), 'collections', 'update', $c, ['title' => 'C!', 'revision' => $revision('collections', $c)]), 403, 'Nobody delegated may update C');
failed(static fn() => $run($ctx('40'), 'collections', 'update', $a, ['title' => 'A!', 'revision' => $revision('collections', $a)]), 403, 'A write link without get visibility grants nothing');
$grant('40', 'collections', ['get'], scope: 'all');
$workspace->acl->invalidate();
verify($run($ctx('40'), 'collections', 'update', $a, ['title' => 'A', 'revision' => $revision('collections', $a)])['id'] === $a, 'An ordinary get grant makes the write link effective');
verify(in_array('update', $run($ctx('10'), 'collections', 'get', $a)['_actions'], true) && !in_array('update', $run($ctx('10'), 'collections', 'get', $b)['_actions'], true), 'Row actions follow the write links');
// Forms.
failed(static fn() => $workspace->describe($ctx('10'), $registry->get('collections', 'update'), $b), 403, 'No update form for B');
verify(array_column($workspace->describe($ctx('10'), $registry->get('items', 'create'), null)['fields'], 'name') === ['collection_id', 'title', 'label'], 'Deferred create form for the delegated writer');

// Items: create and destinations against the final values (parent foreign key).
$created = $run($ctx('10'), 'items', 'create', null, ['collection_id' => $a, 'title' => 'a3']);
verify($db->query("SELECT collection_id FROM items WHERE id = ".(int) $created['id'])->fetchColumn() == $a, 'Delegated create in A');
failed(static fn() => $run($ctx('10'), 'items', 'create', null, ['collection_id' => $b, 'title' => 'bx']), 403, 'Create in a read-only collection refused');
$normalizeTo = $b;
failed(static fn() => $run($ctx('10'), 'items', 'create', null, ['collection_id' => $a, 'title' => 'nx']), 403, 'The normalized destination is checked');
$normalizeTo = null;
verify((int) $db->query("SELECT COUNT(*) FROM items WHERE title IN ('bx', 'nx')")->fetchColumn() === 0, 'Refused creates wrote nothing');
failed(static fn() => $run($ctx('30'), 'items', 'create', null, ['collection_id' => $a, 'title' => 'x']), 403, 'Delegated create without a link refused');
$a1 = $id('items', 'a1'); $b1 = $id('items', 'b1'); $c1 = $id('items', 'c1');
failed(static fn() => $run($ctx('10'), 'items', 'update', $a1, ['collection_id' => $b, 'title' => 'a1', 'revision' => $revision('items', $a1)]), 403, 'Moving a1 into read-only B refused');
verify($run($ctx('10'), 'items', 'update', $a1, ['collection_id' => $a, 'title' => 'a1', 'revision' => $revision('items', $a1)])['id'] === $a1, 'Unchanged destination allowed');
failed(static fn() => $run($ctx('10'), 'items', 'update', $b1, ['title' => 'b1!', 'revision' => $revision('items', $b1)]), 403, 'Update of a read-only item refused');
// Inline edit and bulk.
failed(static fn() => $workspace->executor->edit($ctx('10'), 'items', $b1, 'title', 'b1!', $revision('items', $b1)), 403, 'Inline edit of a read-only item refused');
$bulk = $workspace->executor->bulk($ctx('10'), 'items', 'delete', [['id' => $b1, 'values' => ['revision' => $revision('items', $b1)]], ['id' => $c1, 'values' => ['revision' => $revision('items', $c1)]]]);
verify(array_column($bulk, 'ok') === [false, false], 'Bulk delete: each read-only or hidden item refused');
// Upload/transfer authorization path.
failed(static fn() => $workspace->executor->authorize($ctx('10'), $registry->get('items', 'update'), $b1), 403, 'Upload authorization of a read-only item refused');
verify($workspace->executor->authorize($ctx('10'), $registry->get('items', 'update'), $a1)['id'] === $a1, 'Upload authorization of a writable item');
// Custom actions: the stored row decides, a forged row context grants nothing; no verified object fails closed.
failed(static fn() => $run($ctx('10'), 'items', 'flag', $c1), 403, 'A forged custom row context grants nothing');
failed(static fn() => $run($ctx('10'), 'items', 'flag', $a1), 403, 'A forged row context fails closed even on a writable row');
failed(static fn() => $run($ctx('10'), 'items', 'touch', '999'), 404, 'A custom action on a missing row is refused');
verify($run($ctx('10'), 'items', 'touch', $a1)['id'] === $a1, 'An id-only custom action on a verified writable row');
failed(static fn() => $run($ctx('10'), 'items', 'touch', $b1), 403, 'An id-only custom action on a read-only row');
verify($run($ctx('10'), 'items', 'pin', $a1)['id'] === $a1, 'A custom action resolved by the resource\'s own target');
failed(static fn() => $run($ctx('10'), 'items', 'archive_collection', $a), 403, 'A row of another resource is not a verified row of this one');
failed(static fn() => $run($ctx('10'), 'items', 'stamp'), 403, 'A custom action without a verified object grants nothing');
verify($run($ctx('10'), 'boxes', 'get', $a1)['title'] === 'a1' && array_column($run($ctx('10'), 'boxes', 'list')['items'], 'title') !== [], 'A where naming the table works with delegated rows');
// A consumer create action is never deferred: it has no final-value check, so a delegated allow grants nothing.
failed(static fn() => $run($ctx('10'), 'boxes', 'create', null, ['collection_id' => $b, 'title' => 'box']), 403, 'A consumer create is not deferred');
verify((int) $db->query("SELECT COUNT(*) FROM items WHERE title = 'box'")->fetchColumn() === 0, 'The refused consumer create wrote nothing');
// An upload staged for a deferred create needs a write link at all.
verify($workspace->executor->authorize($ctx('10'), $registry->get('items', 'create'), null)['id'] === null, 'Upload staging for a deferred create with write links');
failed(static fn() => $workspace->executor->authorize($ctx('70'), $registry->get('items', 'create'), null), 403, 'Upload staging for a deferred create without any write link');

// Field denies and object denies (raw link sets; another allow does not bypass them).
$grant('50', 'items', ['update'], scope: 'all');
$grant('50', 'items', ['update'], 'deny');
$grant('50', 'items', ['update'], scope: 'all', field: 'label');
$grant('50', 'items', ['update'], 'deny', field: 'label');
$workspace->acl->invalidate();
failed(static fn() => $run($ctx('50'), 'items', 'update', $a1, ['title' => 'a1', 'revision' => $revision('items', $a1)]), 403, 'Delegated object deny beats an all allow');
$db->exec("DELETE FROM collection_writers WHERE actor_id = 50 AND collection_id = 1");
$workspace->acl->invalidate();
verify($run($ctx('50'), 'items', 'update', $a1, ['collection_id' => $a, 'title' => 'a1', 'revision' => $revision('items', $a1)])['id'] === $a1, 'Without the write link the deny no longer applies');
failed(static fn() => $run($ctx('50'), 'items', 'update', $a1, ['collection_id' => $c, 'title' => 'a1', 'revision' => $revision('items', $a1)]), 403, 'The deny applies to the final destination C');
// A delegated deny on an action without a verified object denies.
$grant('50', 'items', ['stamp'], scope: 'all');
$grant('50', 'items', ['stamp'], 'deny');
$workspace->acl->invalidate();
failed(static fn() => $run($ctx('50'), 'items', 'stamp'), 403, 'A delegated deny without a verified object denies');
$db->exec("DELETE FROM blade_rules WHERE subject_id = '50' AND resource = 'items' AND action = 'update' AND effect = 'deny' AND field_name = ''");
$workspace->acl->invalidate();
failed(static fn() => $run($ctx('50'), 'items', 'update', $a1, ['collection_id' => $c, 'title' => 'a1', 'label' => 'x', 'revision' => $revision('items', $a1)]), 403, 'A field deny applies to the final destination');
verify($run($ctx('50'), 'items', 'update', $a1, ['collection_id' => $a, 'title' => 'a1', 'label' => 'x', 'revision' => $revision('items', $a1)])['id'] === $a1, 'The field is writable outside the linked destination');
verify($run($ctx('50'), 'items', 'update', $a1, ['collection_id' => $c, 'title' => 'a1', 'revision' => $revision('items', $a1)])['id'] === $a1, 'Without the denied field the destination change is allowed');
$run($ctx('20'), 'items', 'update', $a1, ['collection_id' => $a, 'title' => 'a1', 'revision' => $revision('items', $a1)]);

// Manual ordering renumbers peers across collections: every changed peer must be movable before any write.
$positions = static fn() => $db->query('SELECT id, sort_order FROM items ORDER BY id')->fetchAll(PDO::FETCH_KEY_PAIR);
$before = $positions();
failed(static fn() => $run($ctx('10'), 'items', 'move', $a1, ['before' => '', 'revision' => $revision('items', $a1)]), 403, 'Move refused when it would renumber other collections');
verify($positions() == $before, 'A refused move changed no position');
verify($run($ctx('20'), 'items', 'move', $a1, ['before' => '', 'revision' => $revision('items', $a1)])['position'] >= 1, 'An ordinary move grant renumbers freely');

// Lookups, counts and live observations.
verify(array_values((new Lookup('collections', 'collections', 'id', 'title'))->options($ctx('10'))) === ['A', 'B'], 'Related lookup choices follow the delegated scope');
verify(array_values((new Lookup('collections', 'collections', 'id', 'title'))->options($ctx('20'))) === ['A', 'B', 'C'], 'Lookup of an ordinary grant');
$totals = array_column($run($ctx('10'), 'collections', 'list')['items'], 'items_total', 'title');
verify($totals === ['B' => 1, 'A' => 3], 'Derived counts count only listable items: '.json_encode($totals));
$observed = $workspace->observe($ctx('10'), 'collections', []);
verify($sorted(array_column($observed['items'], 'title')) === ['A', 'B'], 'Live observation follows the delegated scope');
$watched = $workspace->watch($ctx('10'), [['id' => 'w', 'resource' => 'items', 'query' => []]]);
verify($watched[0]['ok'] && !in_array('c1', array_column($watched[0]['data']['items'], 'title'), true), 'Batched watch follows the delegated scope');

// Tenant composition: links are global, the tenant realm still applies to the row.
verify($titles($ctx('10', '1'), 'notes') === ['n1'], 'Tenant 1 lists only its delegated note');
verify($titles($ctx('10', '2'), 'notes') === ['n2'], 'Tenant 2 lists only its delegated note');
failed(static fn() => $run($ctx('10', '1'), 'notes', 'get', $id('notes', 'n2')), 404, 'Another tenant\'s linked note is not found');
failed(static fn() => $run($ctx('10'), 'notes', 'list'), 403, 'No tenant, no tenant-scoped delegated list');

// Revocation: a removed link is effective on the next action.
$db->exec('DELETE FROM collection_readers WHERE actor_id = 10 AND collection_id = 2');
verify($titles($ctx('10'), 'collections') === ['A'], 'A revoked reader link hides B');
$db->exec('INSERT INTO collection_readers (collection_id, actor_id) VALUES (2, 10)');

// Fail closed: delegated rules on a resource without a declaration (object and field), and a removed declaration.
$grant('70', 'plain', ['list', 'get']);
broken(static fn() => $run($ctx('70'), 'plain', 'list'), 'A delegated list rule without a declaration fails');
broken(static fn() => $run($ctx('70'), 'plain', 'get', $a), 'A delegated get rule without a declaration fails');
$grant('71', 'plain', ['list', 'get'], scope: 'all');
$grant('71', 'plain', ['list', 'get'], 'deny');
broken(static fn() => $run($ctx('71'), 'plain', 'list'), 'all ALLOW plus a stale delegated list DENY fails closed');
broken(static fn() => $run($ctx('71'), 'plain', 'get', $a), 'all ALLOW plus a stale delegated get DENY fails closed');
$grant('72', 'plain', ['get'], scope: 'all');
$grant('72', 'plain', ['get'], 'deny', field: 'title');
broken(static fn() => $run($ctx('72'), 'plain', 'get', $a), 'A stale delegated field DENY fails closed');
$db->exec("DELETE FROM blade_rules WHERE subject_id IN ('71', '72') AND scope = 'delegated'");
$workspace->acl->invalidate();
verify($titles($ctx('71'), 'plain') !== [] && $run($ctx('72'), 'plain', 'get', $a)['title'] === 'A', 'Removing the delegated rules restores the ordinary grants');
// A deny with an unknown scope (a stale or foreign value) also fails closed.
$grant('73', 'plain', ['list', 'get'], scope: 'all');
$grant('73', 'plain', ['list', 'get'], 'deny', 'mystery');
verify($titles($ctx('73'), 'plain') === [], 'An unknown-scope list deny denies everything');
failed(static fn() => $run($ctx('73'), 'plain', 'get', $a), 403, 'An unknown-scope get deny denies');
// The same resource definition without a declaration: delegated rules of collections now fail instead of granting.
$bare = new Registry();
(new SqlResource('collections', 'collections', 'id', [new Field('title', 'Title', required: true)]))->register($bare, 'Collections');
$bareSpace = new Workspace($bare, $db, true);
broken(static fn() => $bareSpace->executor->execute(new Context(new Identity('10', 'S'), 'ui', $bareSpace->acl, $db), 'collections', 'list', null, []), 'A removed declaration fails closed');
// Disabled state: no delegated rules, no change.
verify($sorted(array_column($bareSpace->executor->execute(new Context(new Identity('20', 'S'), 'ui', $bareSpace->acl, $db), 'collections', 'list', null, [])['items'], 'title')) === ['A', 'B', 'C'], 'Without delegated rules nothing changes');

// API channel: channel rules and token scopes still apply on top.
$grant('10', 'collections', ['list'], channel: 'api');
failed(static fn() => $run($ctx('10', null, 'api', []), 'collections', 'list'), 403, 'A token without the list scope is refused');
verify($sorted($titles($ctx('10', null, 'api', ['collections.list']), 'collections')) === ['A', 'B'], 'A scoped token lists the delegated rows');
// A delegated write allow relies on the row's get, which on the API includes the token's get scope.
$grant('10', 'collections', ['get', 'update'], channel: 'api');
$workspace->acl->invalidate();
$apiRevision = $revision('collections', $a);
failed(static fn() => $run($ctx('10', null, 'api', ['collections.update']), 'collections', 'update', $a, ['title' => 'A', 'revision' => $apiRevision]), 404, 'A token without the get scope cannot use a delegated write');
verify($run($ctx('10', null, 'api', ['collections.update', 'collections.get']), 'collections', 'update', $a, ['title' => 'A', 'revision' => $apiRevision])['id'] === $a, 'A token with the get scope uses the delegated write');
// A lookup over another table than the delegated resource's fails closed.
broken(static fn() => (new Lookup('collections', 'notes', 'id', 'title'))->options($ctx('10')), 'A lookup over another table fails closed');

// JSON declaration.
$dir = sys_get_temp_dir().'/blade-delegation-'.bin2hex(random_bytes(4));
mkdir($dir);
try {
    $module = ['resources' => ['jcollections' => ['storage' => ['table' => 'collections', 'key' => 'id', 'delegation' => [
        'read' => [['table' => 'collection_readers', 'object_column' => 'collection_id', 'actor_column' => 'actor_id', 'resource_column' => 'id'],
            ['table' => 'item_owners', 'object_column' => 'item_id', 'actor_column' => 'actor_id', 'resource_column' => 'id', 'via' => ['table' => 'items', 'key' => 'id', 'parent_column' => 'collection_id']]],
        'write' => [['table' => 'collection_writers', 'object_column' => 'collection_id', 'actor_column' => 'actor_id', 'resource_column' => 'id']]]],
        'fields' => [['name' => 'title', 'label' => 'Title', 'required' => true]], 'view' => ['title' => 'Collections']]]];
    file_put_contents("$dir/module.json", json_encode($module, JSON_THROW_ON_ERROR));
    $json = WorkspaceConfiguration::build($db, ["$dir/module.json"], static fn() => [], true);
    $scope = $json->registry->delegation('jcollections');
    verify($scope !== null && count($scope->delegation->read) === 2 && $scope->delegation->read[1]->via?->parentColumn === 'collection_id' && $scope->delegation->write[0]->resourceColumn === 'id', 'JSON storage.delegation');
    $rule->execute(['10', 'jcollections', 'list', 'ui', 'allow', 'delegated', '']);
    verify($sorted(array_column($json->executor->execute(new Context(new Identity('10', 'S'), 'ui', $json->acl, $db), 'jcollections', 'list', null, [])['items'], 'title')) === ['A', 'B'], 'JSON delegation scopes the list');
    foreach ([
        'unknown key' => ['read' => [], 'extra' => []],
        'keyed links' => ['read' => ['x' => ['table' => 'collection_readers', 'object_column' => 'collection_id', 'actor_column' => 'actor_id', 'resource_column' => 'id']]],
        'missing column' => ['read' => [['table' => 'collection_readers', 'object_column' => 'collection_id', 'actor_column' => 'actor_id']]],
        'unknown via key' => ['read' => [['table' => 'item_owners', 'object_column' => 'item_id', 'actor_column' => 'actor_id', 'resource_column' => 'id', 'via' => ['table' => 'items', 'key' => 'id', 'parent' => 'collection_id']]]],
        'computed key' => ['read' => [['table' => 'collection_readers', 'object_column' => 'collection_id', 'actor_column' => 'actor_id', 'resource_column' => 'title2']]],
    ] as $case => $delegation) {
        $broken = $module; $broken['resources']['jcollections']['storage']['delegation'] = $delegation;
        file_put_contents("$dir/broken.json", json_encode($broken, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($db, ["$dir/broken.json"], static fn() => [], true), 'Invalid JSON delegation accepted: '.$case);
    }
} finally {
    array_map('unlink', glob("$dir/*.json") ?: []);
    rmdir($dir);
}
if ($mysql) foreach ($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) $db->exec("DROP TABLE `$table`");
echo '61ade delegated access contracts passed'.($mysql ? ' on MySQL' : '').".\n";

<?php
declare(strict_types=1);
require __DIR__.'/vendor/autoload.php';
require_once __DIR__.'/common.php';
require_once __DIR__.'/former-names.php';

// Idempotent synthetic setup of both demo applications; HTTP requests never run DDL.
// Feature demo: business tables, sign-in variants and the explicit first-administrator step.
$db = blade_demo_db('features');
Blade\Access\Schema::install($db);
$db->exec('CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT,title TEXT)');
if (!$db->query('SELECT COUNT(*) FROM notes')->fetchColumn()) $db->exec("INSERT INTO notes(owner_id,title) VALUES ('1','Demo note')");
$db->exec("CREATE TABLE IF NOT EXISTS demo_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',contact TEXT NOT NULL DEFAULT '',labels TEXT NOT NULL DEFAULT '',archived INTEGER NOT NULL DEFAULT 0,description TEXT NOT NULL DEFAULT '')");
$db->exec('CREATE TABLE IF NOT EXISTS demo_task_settings(task_id INTEGER PRIMARY KEY,notifications INTEGER NOT NULL)');
// The priority rating (toolkit D4, field type demo.rating) joined the tasks later; the synthetic tasks get a fixed spread 0–5.
if (!in_array('priority', array_column($db->query('PRAGMA table_info(demo_tasks)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true)) {
    $db->exec('ALTER TABLE demo_tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0');
    $db->exec("UPDATE demo_tasks SET priority = CAST(substr(title, 21) AS INTEGER) % 6 WHERE title GLOB 'Szintetikus feladat [0-9][0-9]'");
}
if (!$db->query('SELECT COUNT(*) FROM demo_tasks')->fetchColumn()) {
    $task = $db->prepare('INSERT INTO demo_tasks(owner_id,title,status,priority,contact,labels,archived,description) VALUES (?,?,?,?,?,?,?,?)');
    $statuses = ['new', 'progress', 'done'];
    $labels = ['urgent', 'customer', 'internal,risk', '', 'customer,urgent'];
    for ($i = 1; $i <= 40; $i++) $task->execute(['1', sprintf('Synthetic task %02d', $i), $statuses[$i % 3], $i % 6, $i % 4 ? '+3612345'.sprintf('%03d', $i) : '', $labels[$i % 5], (int) ($i % 7 === 0), 'Synthetic description of task '.$i.'.']);
}
// Large read-only list; insertion order differs from title order, so sorting is visibly server-side.
$db->exec('CREATE TABLE IF NOT EXISTS demo_readings(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,reading TEXT NOT NULL)');
if (!$db->query('SELECT COUNT(*) FROM demo_readings')->fetchColumn()) {
    $db->beginTransaction();
    $reading = $db->prepare('INSERT INTO demo_readings(title,reading) VALUES (?,?)');
    for ($i = 1; $i <= 1801; $i++) $reading->execute([sprintf('Reading %04d', ($i * 127) % 1801 + 1), sprintf('%.1f', ($i * 37) % 1000 / 10)]);
    $db->commit();
}
// Fixed catalog with static images (column presentation image): three images, a missing file and four values that are not plain image file names.
$db->exec('CREATE TABLE IF NOT EXISTS demo_catalog(id INTEGER PRIMARY KEY AUTOINCREMENT,image TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL)');
if (!$db->query('SELECT COUNT(*) FROM demo_catalog')->fetchColumn()) {
    $item = $db->prepare('INSERT INTO demo_catalog(image,title,note) VALUES (?,?,?)');
    foreach ([['circle.svg', 'Circle', 'Square image'], ['square.svg', 'Square', 'Square image'], ['triangle.svg', 'Triangle', 'Square image'], ['wide.svg', 'Wide', 'Landscape image, not cropped'], ['missing.png', 'Missing file', 'Shows the placeholder'],
        ['../secret.png', 'Parent directory', 'Not shown'], ['dir/circle.svg', 'Directory', 'Not shown'], ['https://example.test/a.png', 'Scheme', 'Not shown'], ['circle.exe', 'Extension', 'Not shown']] as $row) $item->execute($row);
}
// Declared activation (view.activate): shelves open their item list, one shelf is empty.
$db->exec('CREATE TABLE IF NOT EXISTS demo_shelves(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,note TEXT NOT NULL DEFAULT \'\')');
$db->exec('CREATE TABLE IF NOT EXISTS demo_shelf_items(id INTEGER PRIMARY KEY AUTOINCREMENT,shelf_id TEXT NOT NULL,title TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 0)');
// Zones open the shelves page filtered to the zone (activate: page); the zone column joined the shelves later.
$db->exec('CREATE TABLE IF NOT EXISTS demo_shelf_zones(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL)');
if (!in_array('zone_id', array_column($db->query('PRAGMA table_info(demo_shelves)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true)) $db->exec("ALTER TABLE demo_shelves ADD COLUMN zone_id TEXT NOT NULL DEFAULT ''");
if (!$db->query('SELECT COUNT(*) FROM demo_shelves')->fetchColumn()) {
    $shelf = $db->prepare('INSERT INTO demo_shelves(title,note) VALUES (?,?)');
    $item = $db->prepare('INSERT INTO demo_shelf_items(shelf_id,title,quantity) VALUES (?,?,?)');
    foreach ([['Top shelf', 'Two items', [['Box', 4], ['Jar', 2]]], ['Middle shelf', 'One item', [['Basket', 1]]], ['Empty shelf', 'No items', []]] as [$title, $note, $items]) {
        $shelf->execute([$title, $note]);$id = (string) $db->lastInsertId();
        foreach ($items as [$name, $quantity]) $item->execute([$id, $name, $quantity]);
    }
}
if (!$db->query('SELECT COUNT(*) FROM demo_shelf_zones')->fetchColumn()) {
    $zone = $db->prepare('INSERT INTO demo_shelf_zones(title) VALUES (?)');
    $place = $db->prepare('UPDATE demo_shelves SET zone_id = ? WHERE title = ?');
    foreach (['Zone A' => ['Top shelf', 'Middle shelf'], 'Zone B' => ['Empty shelf'], 'Zone C' => []] as $title => $shelves) {
        $zone->execute([$title]);$id = (string) $db->lastInsertId();
        foreach ($shelves as $shelf) $place->execute([$id, $shelf]);
    }
}
// Registry editor imitation (modules/registry.json): synthetic keys in a hierarchy and values of every type.
$db->exec("CREATE TABLE IF NOT EXISTS demo_registry_keys(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,parent_id TEXT NOT NULL DEFAULT '')");
$db->exec("CREATE TABLE IF NOT EXISTS demo_registry_values(id INTEGER PRIMARY KEY AUTOINCREMENT,key_id INTEGER NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'REG_SZ',string_value TEXT NOT NULL DEFAULT '',multi_value TEXT NOT NULL DEFAULT '',dword_value TEXT NOT NULL DEFAULT '',qword_value TEXT NOT NULL DEFAULT '',binary_value TEXT NOT NULL DEFAULT '')");
if (!$db->query('SELECT COUNT(*) FROM demo_registry_keys')->fetchColumn()) {
    $key = $db->prepare('INSERT INTO demo_registry_keys(name,parent_id) VALUES (?,?)');
    $value = $db->prepare('INSERT INTO demo_registry_values(key_id,name,type,string_value,multi_value,dword_value,qword_value,binary_value) VALUES (?,?,?,?,?,?,?,?)');
    $add = static function (array $keys, string $parent) use (&$add, $db, $key, $value): void {
        foreach ($keys as $name => [$values, $children]) {
            $key->execute([$name, $parent]);$id = (string) $db->lastInsertId();
            foreach ($values as [$valueName, $type, $data]) $value->execute([$id, $valueName, $type,
                in_array($type, ['REG_SZ', 'REG_EXPAND_SZ'], true) ? $data : '', $type === 'REG_MULTI_SZ' ? $data : '', $type === 'REG_DWORD' ? $data : '', $type === 'REG_QWORD' ? $data : '', $type === 'REG_BINARY' ? $data : '']);
            $add($children, $id);
        }
    };
    $add([
        'HKEY_CURRENT_USER' => [[], [
            'Control Panel' => [[], ['Desktop' => [[['Wallpaper', 'REG_SZ', 'C:\\Users\\Demo\\Pictures\\aurora.jpg'], ['CursorBlinkRate', 'REG_SZ', '530'], ['ScreenSaveActive', 'REG_DWORD', '1']], []]]],
            'Environment' => [[['TEMP', 'REG_EXPAND_SZ', '%USERPROFILE%\\AppData\\Local\\Temp'], ['Path', 'REG_EXPAND_SZ', '%USERPROFILE%\\bin']], []],
            'Software' => [[], ['Synthetic Labs' => [[], ['Viewer' => [[
                ['Version', 'REG_SZ', '2.4.1'], ['WindowWidth', 'REG_DWORD', '00000500'], ['LastRun', 'REG_QWORD', '01db2f0a6c3e8000'],
                ['RecentFiles', 'REG_MULTI_SZ', "report.txt\nnotes.md\nplan.csv"], ['Layout', 'REG_BINARY', '01 00 00 00 2c 01 00 00 f4 01'],
            ], ['Settings' => [[['Theme', 'REG_SZ', 'dark'], ['AutoSave', 'REG_DWORD', '00000001']], []]]]]]]],
        ]],
        'HKEY_LOCAL_MACHINE' => [[], [
            'SOFTWARE' => [[], ['Synthetic Labs' => [[['InstallDir', 'REG_EXPAND_SZ', '%ProgramFiles%\\Synthetic Labs'], ['Licensed', 'REG_DWORD', '00000000']], []]]],
            'SYSTEM' => [[], ['CurrentControlSet' => [[], ['Services' => [[], ['DemoService' => [[['Start', 'REG_DWORD', '00000002'], ['DependOnService', 'REG_MULTI_SZ', "RpcSs\nTcpip"]], []]]]]]]],
        ]],
    ], '');
}
// Virtual file manager: framework tables, one root per mount and a synthetic tree, seeded once per mount.
// Earlier BLOB content moves to the content store first (migration 0002); verification must pass.
$files = blade_demo_files();
$files->install($db);
$tasks = new Blade\Tasks\TaskQueue($db);
$storage = $files->storage($db, $tasks);
$migration = require dirname(__DIR__, 2).'/packages/php/migrations/0002-file-content-store.php';
foreach (['migrate', 'verify'] as $step) {
    $report = $migration($db, [$files->space => $files->store()], $step);
    if ($report['failed']) throw new RuntimeException('File content '.$step.' failed for file ids '.implode(', ', $report['failed']).'.');
}
unset($migration, $report);
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$jpg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');
$tree = [
    // Documents/Projects/2026/Q4/Milestones is depth 5: a further subdirectory is rejected.
    'a' => ['Documents' => ['note.txt' => "Synthetic note for the feature demo.\nEditable text.\n", 'README.md' => "# Documents\n\nSynthetic Markdown.\n",
        'Projects' => ['2026' => ['Q4' => ['Milestones' => ['plan.txt' => "A file in a folder at the fifth depth level.\n"]], 'summary.txt' => "Quarterly summary.\n"]]],
        'Pictures' => ['logo.png' => $png, 'photo.jpg' => $jpg], 'data.csv' => "name,value\nalpha,1\nbeta,2\n", 'settings.json' => "{\"theme\": \"blade\"}\n", 'READ-ME.TXT' => "Upper-case extension: editable.\n"],
    'b' => ['Archive' => ['2025' => ['old-note.txt' => "Archived synthetic note.\n"]], 'log.txt' => "First entry.\n",
        // Kept to show the rules: these types are not in the upload allowlist, the large text exceeds the editor limit.
        'Upload samples' => ['allowed.txt' => "Allowed type.\n", 'allowed.md' => "# Allowed\n", 'blocked-program.exe' => "MZ\x90\x00synthetic", 'blocked-document.pdf' => "%PDF-1.4\nsynthetic\n", 'large-log.txt' => str_repeat("A long synthetic log line for the editor size limit.\n", 1500)],
        'Deep folder' => ['1' => ['2' => ['3' => ['4' => []]]]]],
    'c' => ['Shared' => ['team.txt' => "Shared synthetic file.\n"], 'note.txt' => "A file of the same name to try a name collision.\n"],
];
$types = ['txt' => 'text/plain', 'md' => 'text/markdown', 'csv' => 'text/csv', 'json' => 'application/json', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'webm' => 'video/webm', 'exe' => 'application/octet-stream', 'pdf' => 'application/pdf'];
// Seed strings are written to temporary source files (FileStorage stores files, not strings); SplFileInfo entries are used as they are.
$seed = static function (array $parent, array $entries) use (&$seed, $storage, $types): void {
    foreach ($entries as $name => $content) {
        $name = (string) $name;
        if (is_array($content)) { $seed($storage->entry($storage->createDirectory($parent, $name)), $content); continue; }
        $source = $content instanceof SplFileInfo ? $content->getPathname() : blade_demo_runtime('seed').'/'.bin2hex(random_bytes(8));
        if (!$content instanceof SplFileInfo) file_put_contents($source, $content);
        try {
            $storage->createFile($parent, $name, $types[Blade\Files\FileStorage::extension($name)], $source);
        } finally {
            if (!$content instanceof SplFileInfo) unlink($source);
        }
    }
};
foreach ($tree as $mount => $entries) {
    $root = $storage->root($mount);
    if (!$storage->children((int) $root['id'], 0)) $seed($root, $entries);
}
// Network topology builder: diagram tables and two synthetic topologies, seeded once.
$topology = blade_demo_topology();
$topology->install($db);
$diagrams = $topology->storage($db);
// Former Hungarian seed values become English before anything is seeded by name (FB-0114).
blade_demo_former_features($db, $storage, $diagrams, $tree);
// An empty media folder; the demo media live in the Signage mount (blade_demo_signage_setup()).
$media = $storage->root('a');
if (!$storage->child((int) $media['id'], 'Media')) $seed($media, ['Media' => []]);
@rmdir(blade_demo_runtime('seed'));
$node = static fn(string $id, string $type, string $label, string $detail, int $x, int $y) => compact('id', 'type', 'label', 'detail', 'x', 'y');
$link = static fn(string $id, string $source, string $target, string $type, string $label = '') => compact('id', 'source', 'target', 'type', 'label');
$seedDiagrams = [
    'Office network' => ['nodes' => [
        $node('n1', 'internet', 'Internet', 'Provider', 0, -320), $node('n2', 'firewall', 'Edge firewall', '192.0.2.1', 0, -180),
        $node('n3', 'router', 'Core router', '10.0.0.1', 0, -40), $node('n4', 'switch', 'Core switch', '10.0.0.2', 0, 100),
        $node('n5', 'switch', 'Floor switch', '10.0.1.2', -280, 240), $node('n6', 'server', 'Application server', '10.0.10.10', 260, 240),
        $node('n7', 'storage', 'Backup NAS', '10.0.10.20', 460, 240), $node('n8', 'access-point', 'Wi-Fi AP 1', '10.0.2.10', 40, 260),
        $node('n9', 'workstation', 'Workstation 1', '10.0.1.21', -420, 400), $node('n10', 'workstation', 'Workstation 2', '10.0.1.22', -280, 400),
        $node('n11', 'printer', 'Printer', '10.0.1.40', -140, 400), $node('n12', 'laptop', 'Laptop', 'DHCP', 40, 400),
    ], 'links' => [
        $link('l1', 'n1', 'n2', 'wan', '500 Mbit/s'), $link('l2', 'n2', 'n3', 'ethernet'), $link('l3', 'n3', 'n4', 'fiber'),
        $link('l4', 'n4', 'n5', 'fiber'), $link('l5', 'n4', 'n6', 'fiber'), $link('l6', 'n6', 'n7', 'ethernet'), $link('l7', 'n4', 'n8', 'ethernet'),
        $link('l8', 'n5', 'n9', 'ethernet'), $link('l9', 'n5', 'n10', 'ethernet'), $link('l10', 'n5', 'n11', 'ethernet'), $link('l11', 'n8', 'n12', 'wifi'),
    ]],
    'Site VPN' => ['nodes' => [
        $node('n1', 'internet', 'Internet', '', 0, 0), $node('n2', 'firewall', 'Headquarters', '198.51.100.1', -260, 0),
        $node('n3', 'firewall', 'Site A', '203.0.113.10', 260, -140), $node('n4', 'firewall', 'Site B', '203.0.113.20', 260, 140),
        $node('n5', 'camera', 'Camera A', '10.1.0.50', 480, -140), $node('n6', 'phone', 'Reception', '10.2.0.30', 480, 140),
    ], 'links' => [
        $link('l1', 'n2', 'n1', 'wan'), $link('l2', 'n3', 'n1', 'wan'), $link('l3', 'n4', 'n1', 'wan'),
        $link('l4', 'n2', 'n3', 'vpn', 'IPsec'), $link('l5', 'n2', 'n4', 'vpn', 'IPsec'), $link('l6', 'n3', 'n5', 'ethernet'), $link('l7', 'n4', 'n6', 'ethernet'),
    ]],
];
foreach ($seedDiagrams as $name => $content) if (!$diagrams->named($name)) $diagrams->create($name, json_encode($content, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
// Synthetic accounts: password, e-mail second factor (English default language) and OAuth-only.
blade_demo_accounts($db, [
    [1, 'demo@example.test', '61ade-demo', 'Demo User', 1, 1],
    [2, 'viewer@example.test', '61ade-demo', 'Demo Viewer', 1, 0],
    [3, 'blocked@example.test', '61ade-demo', 'Blocked User', 0, 1],
    [4, 'twofactor@example.test', '61ade-demo', 'Two-factor Demo', 1, 0],
    [5, 'oauth@example.test', bin2hex(random_bytes(24)), 'OAuth Demo', 1, 0],
    [null, 'reader@example.test', '61ade-demo', 'Demo Reader', 1, 0],
    // Application skins (application.php): one skin, and a choice between two.
    [null, 'skin@example.test', '61ade-demo', 'Skin Demo', 1, 0],
    [null, 'skins@example.test', '61ade-demo', 'Skins Demo', 1, 0],
]);
$reader = $db->query("SELECT id FROM accounts WHERE email = 'reader@example.test'")->fetchColumn();
$db->exec("INSERT OR IGNORE INTO blade_auth_settings(actor_id,email_confirmation) VALUES ('4',1)");
$db->exec("INSERT OR IGNORE INTO blade_account_state(actor_id,locale) VALUES ('4','en')");
$db->exec("INSERT OR IGNORE INTO blade_account_state(actor_id,oauth_allowed) VALUES ('5',1)");
$exists = $db->prepare("SELECT COUNT(*) FROM blade_rules WHERE subject_type='user' AND subject_id=? AND resource=? AND action=? AND channel='ui' AND effect=? AND field_name=?");
$grant = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,'ui',?,'all','',?)");
$rules = [['1', 'files', ['tree', 'list', 'create_directory', 'upload', 'copy', 'move', 'text_get', 'text_save', 'content_get', 'content_stream', 'thumbnail_get', 'delete', 'rename', 'download', 'zip_prepare', 'zip_get']], ['1', 'notes', ['list', 'get', 'create', 'update', 'delete']], ['1', 'demo_catalog', ['list', 'get']], ['1', 'demo_shelf_zones', ['list', 'get', 'create', 'update']], ['1', 'demo_shelves', ['list', 'get', 'create', 'update']], ['1', 'demo_shelf_items', ['list', 'get', 'create', 'update', 'delete', 'stock']], ['1', 'demo_tasks', ['list', 'get', 'create', 'update', 'delete', 'complete', 'dialog_neutral', 'dialog_warning', 'dialog_danger']], ['1', 'demo_readings', ['list', 'get']], ['1', 'topology', ['list', 'get', 'create', 'save', 'delete', 'type_create', 'type_delete']]];
foreach (['4', '5'] as $actor) $rules[] = [$actor, 'notes', ['list', 'get']];
// Read-only reader: tasks without the description field (field-level deny).
$rules[] = [(string) $reader, 'demo_tasks', ['list', 'get']];
$rules[] = [(string) $reader, 'demo_tasks', ['list', 'get'], 'deny', 'description'];
// Read-only file manager: browse, open text, view media and download (single files and ZIP), no write action.
$rules[] = [(string) $reader, 'files', ['tree', 'list', 'text_get', 'content_get', 'content_stream', 'thumbnail_get', 'download', 'zip_prepare', 'zip_get']];
// Shelves without their item list: the child is not offered, so double-click opens the shelf details.
$rules[] = [(string) $reader, 'demo_shelves', ['list', 'get']];
// Registry editor imitation: full rights for the demo account, browsing only for the reader.
$rules[] = ['1', 'demo_registry_keys', ['list', 'get', 'create', 'update', 'delete']];
$rules[] = ['1', 'demo_registry_values', ['list', 'get', 'create', 'update', 'delete']];
$rules[] = [(string) $reader, 'demo_registry_keys', ['list', 'get']];
$rules[] = [(string) $reader, 'demo_registry_values', ['list', 'get']];
// Read-only topology viewer: opens diagrams, no editing.
$rules[] = [(string) $reader, 'topology', ['list', 'get']];
// Digital signage: calendar table, synthetic assets, weekday defaults and programme; the seeded asset media move into
// the Signage mount (the file rights above cover every mount). The reader only views; both may preview the daily
// playlist with its scenes (`signage_playlist.scene`, toolkit D2).
require_once __DIR__.'/signage.php';
blade_demo_signage_setup($db, $storage);
array_push($rules, ['1', 'signage_assets', ['list', 'get', 'create', 'update', 'delete', 'upload_asset']], ['1', 'signage_defaults', ['list', 'get', 'create', 'update', 'delete']],
    ['1', 'signage_schedule', ['events', 'occurrences', 'create', 'update', 'delete']], ['1', 'signage_playlist', ['day', 'scene']],
    ['1', 'signage_playlists', ['list', 'get', 'create', 'update', 'delete']], [(string) $reader, 'signage_playlists', ['list', 'get']],
    ['1', 'signage_playlist_items', ['list', 'get', 'create', 'update', 'delete', 'move']], [(string) $reader, 'signage_playlist_items', ['list', 'get']],
    [(string) $reader, 'signage_assets', ['list', 'get']], [(string) $reader, 'signage_defaults', ['list', 'get']],
    [(string) $reader, 'signage_schedule', ['events', 'occurrences']], [(string) $reader, 'signage_playlist', ['day', 'scene']]);
foreach ($rules as $rule) foreach ($rule[2] as $action) {
    $row = [$rule[0], $rule[1], $action, $rule[3] ?? 'allow', $rule[4] ?? ''];
    $exists->execute($row);
    if (!$exists->fetchColumn()) $grant->execute($row);
}
// API channel: the demo account may query the playlist and occurrences with an API key of that scope.
$api = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) SELECT 'user','1',?,?,'api','allow','all','','' WHERE NOT EXISTS (SELECT 1 FROM blade_rules WHERE subject_type='user' AND subject_id='1' AND resource=? AND action=? AND channel='api' AND field_name='')");
foreach ([['signage_playlist', 'day'], ['signage_schedule', 'occurrences']] as [$resource, $action]) $api->execute([$resource, $action, $resource, $action]);
unset($api);
// Seeded and migrated media get their thumbnails now; later ones are rendered after the response that created them.
$tasks->run(100, 120.0);
unset($exists, $grant, $task, $seed, $storage, $tasks, $files, $topology, $diagrams, $db); // release SQLite cursors before the application connection writes
$app = require __DIR__.'/application.php';
Blade\Admin\Permissions::grantAdministration($app->workspace->db, $app->workspace->registry, '1', roleName: 'Administrator');

// Base admin demo: an empty project with its first administrator only.
$db = blade_demo_db('admin');
Blade\Access\Schema::install($db);
blade_demo_former_rows($db, BLADE_DEMO_FORMER_ADMIN_ROWS);
blade_demo_accounts($db, [[1, 'demo@example.test', '61ade-demo', 'Demo Admin', 1, 1]]);
unset($db);
$admin = require __DIR__.'/admin-application.php';
Blade\Admin\Permissions::grantAdministration($admin->workspace->db, $admin->workspace->registry, '1', roleName: 'Administrator');

// Tenant demo: two tenants; demo@ (admin) belongs to both, single@ to Alpha only, none@ to no tenant.
$db = blade_demo_db('tenants');
Blade\Access\Schema::install($db);
// A tenant demo created before 2026-10-30 drops the removed membership switch first (migration 0003; a no-op later).
(require dirname(__DIR__, 2).'/packages/php/migrations/0003-tenant-member-active.php')($db);
Blade\Tenancy\Tenancy::install($db);
blade_demo_former_rows($db, BLADE_DEMO_FORMER_TENANT_ROWS);
$db->exec('CREATE TABLE IF NOT EXISTS tenant_projects(id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\')');
$db->exec('CREATE TABLE IF NOT EXISTS tenant_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, title TEXT NOT NULL, project_id TEXT NOT NULL)');
$db->exec('CREATE TABLE IF NOT EXISTS tenant_notices(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)');
// Sub-view demo columns: a task's parent task ('' at the top) and its done switch.
$taskColumns = array_column($db->query('PRAGMA table_info(tenant_tasks)')->fetchAll(PDO::FETCH_ASSOC), 'name');
if (!in_array('parent_id', $taskColumns, true)) $db->exec("ALTER TABLE tenant_tasks ADD COLUMN parent_id TEXT NOT NULL DEFAULT ''");
if (!in_array('done', $taskColumns, true)) $db->exec('ALTER TABLE tenant_tasks ADD COLUMN done INTEGER NOT NULL DEFAULT 0');
blade_demo_accounts($db, [
    [1, 'demo@example.test', '61ade-demo', 'Demo Admin', 1, 1],
    [2, 'single@example.test', '61ade-demo', 'Single Tenant', 1, 0],
    [3, 'none@example.test', '61ade-demo', 'No Tenant', 1, 0],
]);
$alfa = Blade\Tenancy\Tenancy::ensure($db, 'Alpha');
$beta = Blade\Tenancy\Tenancy::ensure($db, 'Beta');
foreach ([[$alfa, '1'], [$beta, '1'], [$alfa, '2']] as [$tenant, $actor]) Blade\Tenancy\Tenancy::join($db, $tenant, $actor);
if (!$db->query('SELECT COUNT(*) FROM tenant_projects')->fetchColumn()) {
    $project = $db->prepare('INSERT INTO tenant_projects(tenant_id,title) VALUES (?,?)');
    $task = $db->prepare('INSERT INTO tenant_tasks(tenant_id,title,project_id) VALUES (?,?,?)');
    foreach ([[$alfa, 'Alpha research', ['Alpha measurement', 'Alpha report']], [$alfa, 'Alpha maintenance', []], [$beta, 'Beta rollout', ['Beta training']]] as [$tenant, $title, $items]) {
        $project->execute([$tenant, $title]);
        $id = $db->lastInsertId();
        foreach ($items as $item) $task->execute([$tenant, $item, $id]);
    }
    $db->exec("INSERT INTO tenant_notices(title) VALUES ('Shared maintenance window on Friday evening')");
}
if (!$db->query("SELECT COUNT(*) FROM tenant_tasks WHERE parent_id <> ''")->fetchColumn()) {
    $parent = $db->query("SELECT id, tenant_id, project_id FROM tenant_tasks WHERE title = 'Alpha measurement'")->fetch(PDO::FETCH_ASSOC);
    $sub = $db->prepare('INSERT INTO tenant_tasks(tenant_id,title,project_id,parent_id,done) VALUES (?,?,?,?,?)');
    if ($parent) foreach ([['Prepare the measuring site', 1], ['Data entry', 0]] as [$title, $done]) $sub->execute([$parent['tenant_id'], $title, $parent['project_id'], (string) $parent['id'], $done]);
}
// Editors: the global role works in each member tenant; tenant membership decides where.
$db->exec("INSERT OR IGNORE INTO blade_roles(name, role_key) VALUES ('Editor', 'editor')");
$editor = (string) $db->query("SELECT id FROM blade_roles WHERE role_key = 'editor'")->fetchColumn();
foreach (['1', '2', '3'] as $actor) $db->prepare('INSERT OR IGNORE INTO blade_memberships(actor_id, role_id) VALUES (?, ?)')->execute([$actor, $editor]);
$exists = $db->prepare("SELECT COUNT(*) FROM blade_rules WHERE subject_type=? AND subject_id=? AND resource=? AND action=? AND channel=? AND field_name=''");
$grant = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES (?,?,?,?,?,'allow','all','','')");
$rules = [['role', $editor, 'tenant_projects', ['list', 'get', 'create', 'update'], 'ui'], ['role', $editor, 'tenant_tasks', ['list', 'get', 'create', 'update', 'delete'], 'ui'], ['role', $editor, 'tenant_notices', ['list', 'get'], 'ui'],
    ['user', '1', 'tenant_projects', ['list', 'get', 'create'], 'api'], ['user', '1', 'tenant_notices', ['list', 'get'], 'api']];
foreach ($rules as [$type, $subject, $resource, $actions, $channel]) foreach ($actions as $action) {
    $exists->execute([$type, $subject, $resource, $action, $channel]);
    if (!$exists->fetchColumn()) $grant->execute([$type, $subject, $resource, $action, $channel]);
}
unset($exists, $grant, $project, $task, $db);
$tenantDemo = require __DIR__.'/tenant-application.php';
Blade\Admin\Permissions::grantAdministration($tenantDemo->workspace->db, $tenantDemo->workspace->registry, '1', roleName: 'Administrator');
// The web server's instance (public/.htaccess) also gets the developer key and a fresh seed of the visitor sandboxes.
if ((getenv('BLADE_DEMO_INSTANCE') ?: 'demo') === 'web') blade_demo_sandbox_seed(blade_demo_instance_root(), __FILE__);
echo "Feature, base admin and tenant demos initialized.\n";

<?php
declare(strict_types=1);
require __DIR__.'/vendor/autoload.php';
require_once __DIR__.'/common.php';

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
    for ($i = 1; $i <= 40; $i++) $task->execute(['1', sprintf('Szintetikus feladat %02d', $i), $statuses[$i % 3], $i % 6, $i % 4 ? '+3612345'.sprintf('%03d', $i) : '', $labels[$i % 5], (int) ($i % 7 === 0), 'Szintetikus leírás a(z) '.$i.'. feladathoz.']);
}
// Large read-only list; insertion order differs from title order, so sorting is visibly server-side.
$db->exec('CREATE TABLE IF NOT EXISTS demo_readings(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,reading TEXT NOT NULL)');
if (!$db->query('SELECT COUNT(*) FROM demo_readings')->fetchColumn()) {
    $db->beginTransaction();
    $reading = $db->prepare('INSERT INTO demo_readings(title,reading) VALUES (?,?)');
    for ($i = 1; $i <= 1801; $i++) $reading->execute([sprintf('Mérés %04d', ($i * 127) % 1801 + 1), sprintf('%.1f', ($i * 37) % 1000 / 10)]);
    $db->commit();
}
// Fixed catalog with static images (column presentation image): three images, a missing file and four values that are not plain image file names.
$db->exec('CREATE TABLE IF NOT EXISTS demo_catalog(id INTEGER PRIMARY KEY AUTOINCREMENT,image TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL)');
if (!$db->query('SELECT COUNT(*) FROM demo_catalog')->fetchColumn()) {
    $item = $db->prepare('INSERT INTO demo_catalog(image,title,note) VALUES (?,?,?)');
    foreach ([['circle.svg', 'Kör', 'Négyzetes kép'], ['square.svg', 'Négyzet', 'Négyzetes kép'], ['triangle.svg', 'Háromszög', 'Négyzetes kép'], ['wide.svg', 'Széles', 'Fekvő kép, nincs vágás'], ['missing.png', 'Hiányzó fájl', 'Helykitöltő jelenik meg'],
        ['../secret.png', 'Szülő könyvtár', 'Nem jelenik meg'], ['dir/circle.svg', 'Könyvtár', 'Nem jelenik meg'], ['https://example.test/a.png', 'Séma', 'Nem jelenik meg'], ['circle.exe', 'Kiterjesztés', 'Nem jelenik meg']] as $row) $item->execute($row);
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
    foreach ([['Felső polc', 'Két tétel', [['Doboz', 4], ['Tégely', 2]]], ['Középső polc', 'Egy tétel', [['Kosár', 1]]], ['Üres polc', 'Nincs tétele', []]] as [$title, $note, $items]) {
        $shelf->execute([$title, $note]);$id = (string) $db->lastInsertId();
        foreach ($items as [$name, $quantity]) $item->execute([$id, $name, $quantity]);
    }
}
if (!$db->query('SELECT COUNT(*) FROM demo_shelf_zones')->fetchColumn()) {
    $zone = $db->prepare('INSERT INTO demo_shelf_zones(title) VALUES (?)');
    $place = $db->prepare('UPDATE demo_shelves SET zone_id = ? WHERE title = ?');
    foreach (['A zóna' => ['Felső polc', 'Középső polc'], 'B zóna' => ['Üres polc'], 'C zóna' => []] as $title => $shelves) {
        $zone->execute([$title]);$id = (string) $db->lastInsertId();
        foreach ($shelves as $shelf) $place->execute([$id, $shelf]);
    }
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
    // Dokumentumok/Projektek/2026/Q4/Mérföldkövek is depth 5: a further subdirectory is rejected.
    'a' => ['Dokumentumok' => ['jegyzet.txt' => "Szintetikus jegyzet a feature demóhoz.\nSzerkeszthető szöveg.\n", 'README.md' => "# Dokumentumok\n\nSzintetikus Markdown.\n",
        'Projektek' => ['2026' => ['Q4' => ['Mérföldkövek' => ['terv.txt' => "Ötödik mélységi szinten lévő mappa fájlja.\n"]], 'osszefoglalo.txt' => "Negyedéves összefoglaló.\n"]]],
        'Képek' => ['logo.png' => $png, 'foto.jpg' => $jpg], 'adatok.csv' => "nev,ertek\nalfa,1\nbeta,2\n", 'beallitasok.json' => "{\"tema\": \"blade\"}\n", 'OLVASS-EL.TXT' => "Nagybetűs kiterjesztés: szerkeszthető.\n"],
    'b' => ['Archívum' => ['2025' => ['regi-jegyzet.txt' => "Archivált szintetikus jegyzet.\n"]], 'napló.txt' => "Első bejegyzés.\n",
        // Kept to show the rules: these types are not in the upload allowlist, the large text exceeds the editor limit.
        'Feltöltési minták' => ['engedelyezett.txt' => "Engedélyezett típus.\n", 'engedelyezett.md' => "# Engedélyezett\n", 'tiltott-program.exe' => "MZ\x90\x00szintetikus", 'tiltott-dokumentum.pdf' => "%PDF-1.4\nszintetikus\n", 'nagy-naplo.txt' => str_repeat("Hosszú szintetikus naplósor a szerkesztő méretkorlátjához.\n", 1500)],
        'Mély mappa' => ['1' => ['2' => ['3' => ['4' => []]]]]],
    'c' => ['Közös' => ['csapat.txt' => "Közös szintetikus fájl.\n"], 'jegyzet.txt' => "Azonos nevű fájl a névütközés kipróbálásához.\n"],
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
// Synthetic media for the image viewer and video player (ffmpeg test patterns), added once to existing demos too.
$media = $storage->root('a');
if (!$storage->child((int) $media['id'], 'Média')) $seed($media, ['Média' => [
    'minta-fraktal.jpg' => new SplFileInfo(__DIR__.'/resources/files/minta-fraktal.jpg'), 'minta-video.webm' => new SplFileInfo(__DIR__.'/resources/files/minta-video.webm')]]);
@rmdir(blade_demo_runtime('seed'));
// Network topology builder: diagram tables and two synthetic topologies, seeded once.
$topology = blade_demo_topology();
$topology->install($db);
$diagrams = $topology->storage($db);
$node = static fn(string $id, string $type, string $label, string $detail, int $x, int $y) => compact('id', 'type', 'label', 'detail', 'x', 'y');
$link = static fn(string $id, string $source, string $target, string $type, string $label = '') => compact('id', 'source', 'target', 'type', 'label');
$seedDiagrams = [
    'Irodai hálózat' => ['nodes' => [
        $node('n1', 'internet', 'Internet', 'Szolgáltató', 0, -320), $node('n2', 'firewall', 'Peremtűzfal', '192.0.2.1', 0, -180),
        $node('n3', 'router', 'Központi router', '10.0.0.1', 0, -40), $node('n4', 'switch', 'Mag switch', '10.0.0.2', 0, 100),
        $node('n5', 'switch', 'Emeleti switch', '10.0.1.2', -280, 240), $node('n6', 'server', 'Alkalmazásszerver', '10.0.10.10', 260, 240),
        $node('n7', 'storage', 'Mentési NAS', '10.0.10.20', 460, 240), $node('n8', 'access-point', 'Wi-Fi AP 1', '10.0.2.10', 40, 260),
        $node('n9', 'workstation', 'Munkaállomás 1', '10.0.1.21', -420, 400), $node('n10', 'workstation', 'Munkaállomás 2', '10.0.1.22', -280, 400),
        $node('n11', 'printer', 'Nyomtató', '10.0.1.40', -140, 400), $node('n12', 'laptop', 'Laptop', 'DHCP', 40, 400),
    ], 'links' => [
        $link('l1', 'n1', 'n2', 'wan', '500 Mbit/s'), $link('l2', 'n2', 'n3', 'ethernet'), $link('l3', 'n3', 'n4', 'fiber'),
        $link('l4', 'n4', 'n5', 'fiber'), $link('l5', 'n4', 'n6', 'fiber'), $link('l6', 'n6', 'n7', 'ethernet'), $link('l7', 'n4', 'n8', 'ethernet'),
        $link('l8', 'n5', 'n9', 'ethernet'), $link('l9', 'n5', 'n10', 'ethernet'), $link('l10', 'n5', 'n11', 'ethernet'), $link('l11', 'n8', 'n12', 'wifi'),
    ]],
    'Telephelyek VPN' => ['nodes' => [
        $node('n1', 'internet', 'Internet', '', 0, 0), $node('n2', 'firewall', 'Központ', '198.51.100.1', -260, 0),
        $node('n3', 'firewall', 'Telephely A', '203.0.113.10', 260, -140), $node('n4', 'firewall', 'Telephely B', '203.0.113.20', 260, 140),
        $node('n5', 'camera', 'Kamera A', '10.1.0.50', 480, -140), $node('n6', 'phone', 'Recepció', '10.2.0.30', 480, 140),
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
// Read-only topology viewer: opens diagrams, no editing.
$rules[] = [(string) $reader, 'topology', ['list', 'get']];
// Digital signage: calendar table, synthetic assets, weekday defaults and programme; the seeded asset media move into
// the Signage mount (the file rights above cover every mount). The reader only views; both may preview the daily
// playlist with its scenes (`signage_playlist.scene`, toolkit D2).
require_once __DIR__.'/signage.php';
blade_demo_signage_setup($db, $storage);
array_push($rules, ['1', 'signage_assets', ['list', 'get', 'create', 'update', 'delete', 'upload_asset']], ['1', 'signage_defaults', ['list', 'get', 'create', 'update', 'delete']],
    ['1', 'signage_schedule', ['events', 'occurrences', 'create', 'update', 'delete']], ['1', 'signage_playlist', ['day', 'scene']],
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
Blade\Admin\Permissions::grantAdministration($app->workspace->db, $app->workspace->registry, '1');

// Base admin demo: an empty project with its first administrator only.
$db = blade_demo_db('admin');
Blade\Access\Schema::install($db);
blade_demo_accounts($db, [[1, 'demo@example.test', '61ade-demo', 'Demo Admin', 1, 1]]);
unset($db);
$admin = require __DIR__.'/admin-application.php';
Blade\Admin\Permissions::grantAdministration($admin->workspace->db, $admin->workspace->registry, '1');

// Tenant demo: two tenants; demo@ (admin) belongs to both, single@ to Alfa only, none@ to no tenant.
$db = blade_demo_db('tenants');
Blade\Access\Schema::install($db);
// A tenant demo created before 2026-10-30 drops the removed membership switch first (migration 0003; a no-op later).
(require dirname(__DIR__, 2).'/packages/php/migrations/0003-tenant-member-active.php')($db);
Blade\Tenancy\Tenancy::install($db);
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
$alfa = Blade\Tenancy\Tenancy::ensure($db, 'Alfa');
$beta = Blade\Tenancy\Tenancy::ensure($db, 'Béta');
foreach ([[$alfa, '1'], [$beta, '1'], [$alfa, '2']] as [$tenant, $actor]) Blade\Tenancy\Tenancy::join($db, $tenant, $actor);
if (!$db->query('SELECT COUNT(*) FROM tenant_projects')->fetchColumn()) {
    $project = $db->prepare('INSERT INTO tenant_projects(tenant_id,title) VALUES (?,?)');
    $task = $db->prepare('INSERT INTO tenant_tasks(tenant_id,title,project_id) VALUES (?,?,?)');
    foreach ([[$alfa, 'Alfa kutatás', ['Alfa mérés', 'Alfa jelentés']], [$alfa, 'Alfa karbantartás', []], [$beta, 'Béta bevezetés', ['Béta oktatás']]] as [$tenant, $title, $items]) {
        $project->execute([$tenant, $title]);
        $id = $db->lastInsertId();
        foreach ($items as $item) $task->execute([$tenant, $item, $id]);
    }
    $db->exec("INSERT INTO tenant_notices(title) VALUES ('Közös karbantartási ablak péntek este')");
}
if (!$db->query("SELECT COUNT(*) FROM tenant_tasks WHERE parent_id <> ''")->fetchColumn()) {
    $parent = $db->query("SELECT id, tenant_id, project_id FROM tenant_tasks WHERE title = 'Alfa mérés'")->fetch(PDO::FETCH_ASSOC);
    $sub = $db->prepare('INSERT INTO tenant_tasks(tenant_id,title,project_id,parent_id,done) VALUES (?,?,?,?,?)');
    if ($parent) foreach ([['Mérőhely előkészítése', 1], ['Adatrögzítés', 0]] as [$title, $done]) $sub->execute([$parent['tenant_id'], $title, $parent['project_id'], (string) $parent['id'], $done]);
}
// Editors: the global role works in each member tenant; tenant membership decides where.
$db->exec("INSERT OR IGNORE INTO blade_roles(name, role_key) VALUES ('Szerkesztő', 'editor')");
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
Blade\Admin\Permissions::grantAdministration($tenantDemo->workspace->db, $tenantDemo->workspace->registry, '1');
echo "Feature, base admin and tenant demos initialized.\n";

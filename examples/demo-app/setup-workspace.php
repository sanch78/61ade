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
if (!$db->query('SELECT COUNT(*) FROM demo_tasks')->fetchColumn()) {
    $task = $db->prepare('INSERT INTO demo_tasks(owner_id,title,status,contact,labels,archived,description) VALUES (?,?,?,?,?,?,?)');
    $statuses = ['new', 'progress', 'done'];
    $labels = ['urgent', 'customer', 'internal,risk', '', 'customer,urgent'];
    for ($i = 1; $i <= 40; $i++) $task->execute(['1', sprintf('Szintetikus feladat %02d', $i), $statuses[$i % 3], $i % 4 ? '+3612345'.sprintf('%03d', $i) : '', $labels[$i % 5], (int) ($i % 7 === 0), 'Szintetikus leírás a(z) '.$i.'. feladathoz.']);
}
// Large read-only list; insertion order differs from title order, so sorting is visibly server-side.
$db->exec('CREATE TABLE IF NOT EXISTS demo_readings(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,reading TEXT NOT NULL)');
if (!$db->query('SELECT COUNT(*) FROM demo_readings')->fetchColumn()) {
    $db->beginTransaction();
    $reading = $db->prepare('INSERT INTO demo_readings(title,reading) VALUES (?,?)');
    for ($i = 1; $i <= 1801; $i++) $reading->execute([sprintf('Mérés %04d', ($i * 127) % 1801 + 1), sprintf('%.1f', ($i * 37) % 1000 / 10)]);
    $db->commit();
}
// Virtual file manager: framework table, one root per mount and a synthetic tree, seeded once per mount.
$files = blade_demo_files();
$files->install($db);
$storage = $files->storage($db);
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$jpg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');
$tree = [
    // Dokumentumok/Projektek/2026/Q4/Mérföldkövek is depth 5: a further subdirectory is rejected.
    'a' => ['Dokumentumok' => ['jegyzet.txt' => "Szintetikus jegyzet a feature demóhoz.\nSzerkeszthető szöveg.\n", 'README.md' => "# Dokumentumok\n\nSzintetikus Markdown.\n",
        'Projektek' => ['2026' => ['Q4' => ['Mérföldkövek' => ['terv.txt' => "Ötödik mélységi szinten lévő mappa fájlja.\n"]], 'osszefoglalo.txt' => "Negyedéves összefoglaló.\n"]]],
        'Képek' => ['logo.png' => $png, 'foto.jpg' => $jpg], 'adatok.csv' => "nev,ertek\nalfa,1\nbeta,2\n", 'beallitasok.json' => "{\"tema\": \"skyblue\"}\n", 'OLVASS-EL.TXT' => "Nagybetűs kiterjesztés: szerkeszthető.\n"],
    'b' => ['Archívum' => ['2025' => ['regi-jegyzet.txt' => "Archivált szintetikus jegyzet.\n"]], 'napló.txt' => "Első bejegyzés.\n",
        // Kept to show the rules: these types are not in the upload allowlist, the large text exceeds the editor limit.
        'Feltöltési minták' => ['engedelyezett.txt' => "Engedélyezett típus.\n", 'engedelyezett.md' => "# Engedélyezett\n", 'tiltott-program.exe' => "MZ\x90\x00szintetikus", 'tiltott-dokumentum.pdf' => "%PDF-1.4\nszintetikus\n", 'nagy-naplo.txt' => str_repeat("Hosszú szintetikus naplósor a szerkesztő méretkorlátjához.\n", 1500)],
        'Mély mappa' => ['1' => ['2' => ['3' => ['4' => []]]]]],
    'c' => ['Közös' => ['csapat.txt' => "Közös szintetikus fájl.\n"], 'jegyzet.txt' => "Azonos nevű fájl a névütközés kipróbálásához.\n"],
];
$types = ['txt' => 'text/plain', 'md' => 'text/markdown', 'csv' => 'text/csv', 'json' => 'application/json', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'webm' => 'video/webm', 'exe' => 'application/octet-stream', 'pdf' => 'application/pdf'];
$seed = static function (array $parent, array $entries) use (&$seed, $storage, $types): void {
    foreach ($entries as $name => $content) {
        $name = (string) $name;
        if (is_array($content)) $seed($storage->entry($storage->createDirectory($parent, $name)), $content);
        else $storage->createFile($parent, $name, $types[Blade\Files\FileStorage::extension($name)], $content);
    }
};
foreach ($tree as $mount => $entries) {
    $root = $storage->root($mount);
    if (!$storage->children((int) $root['id'], 0)) $seed($root, $entries);
}
// Synthetic media for the image viewer and video player (ffmpeg test patterns), added once to existing demos too.
$media = $storage->root('a');
if (!$storage->child((int) $media['id'], 'Média')) $seed($media, ['Média' => array_map('file_get_contents', [
    'minta-fraktal.jpg' => __DIR__.'/resources/files/minta-fraktal.jpg', 'minta-video.webm' => __DIR__.'/resources/files/minta-video.webm'])]);
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
    [1, 'demo@example.test', '61de-demo', 'Demo User', 1, 1],
    [2, 'viewer@example.test', '61de-demo', 'Demo Viewer', 1, 0],
    [3, 'blocked@example.test', '61de-demo', 'Blocked User', 0, 1],
    [4, 'twofactor@example.test', '61de-demo', 'Two-factor Demo', 1, 0],
    [5, 'oauth@example.test', bin2hex(random_bytes(24)), 'OAuth Demo', 1, 0],
    [null, 'reader@example.test', '61de-demo', 'Demo Reader', 1, 0],
]);
$reader = $db->query("SELECT id FROM accounts WHERE email = 'reader@example.test'")->fetchColumn();
$db->exec("INSERT OR IGNORE INTO blade_auth_settings(actor_id,email_confirmation) VALUES ('4',1)");
$db->exec("INSERT OR IGNORE INTO blade_account_state(actor_id,locale) VALUES ('4','en')");
$db->exec("INSERT OR IGNORE INTO blade_account_state(actor_id,oauth_allowed) VALUES ('5',1)");
$exists = $db->prepare("SELECT COUNT(*) FROM blade_rules WHERE subject_type='user' AND subject_id=? AND resource=? AND action=? AND channel='ui' AND effect=? AND field_name=?");
$grant = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,'ui',?,'all','',?)");
$rules = [['1', 'files', ['tree', 'list', 'create_directory', 'upload', 'copy', 'move', 'text_get', 'text_save', 'content_get']], ['1', 'notes', ['list', 'get', 'create', 'update', 'delete']], ['1', 'demo_tasks', ['list', 'get', 'create', 'update', 'delete', 'complete', 'dialog_neutral', 'dialog_warning', 'dialog_danger']], ['1', 'demo_readings', ['list', 'get']], ['1', 'topology', ['list', 'get', 'create', 'save', 'delete', 'type_create', 'type_delete']]];
foreach (['4', '5'] as $actor) $rules[] = [$actor, 'notes', ['list', 'get']];
// Read-only reader: tasks without the description field (field-level deny).
$rules[] = [(string) $reader, 'demo_tasks', ['list', 'get']];
$rules[] = [(string) $reader, 'demo_tasks', ['list', 'get'], 'deny', 'description'];
// Read-only file manager: browse, open text and view media, no write action.
$rules[] = [(string) $reader, 'files', ['tree', 'list', 'text_get', 'content_get']];
// Read-only topology viewer: opens diagrams, no editing.
$rules[] = [(string) $reader, 'topology', ['list', 'get']];
// Digital signage: calendar table, synthetic assets, weekday defaults and programme; the reader only views.
require_once __DIR__.'/signage.php';
blade_demo_signage_setup($db);
array_push($rules, ['1', 'signage_assets', ['list', 'get', 'create', 'update', 'delete']], ['1', 'signage_defaults', ['list', 'get', 'create', 'update', 'delete']],
    ['1', 'signage_schedule', ['events', 'occurrences', 'create', 'update', 'delete']], ['1', 'signage_playlist', ['day']],
    [(string) $reader, 'signage_schedule', ['events', 'occurrences']], [(string) $reader, 'signage_playlist', ['day']]);
foreach ($rules as $rule) foreach ($rule[2] as $action) {
    $row = [$rule[0], $rule[1], $action, $rule[3] ?? 'allow', $rule[4] ?? ''];
    $exists->execute($row);
    if (!$exists->fetchColumn()) $grant->execute($row);
}
// API channel: the demo account may query the playlist and occurrences with an API key of that scope.
$api = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) SELECT 'user','1',?,?,'api','allow','all','','' WHERE NOT EXISTS (SELECT 1 FROM blade_rules WHERE subject_type='user' AND subject_id='1' AND resource=? AND action=? AND channel='api' AND field_name='')");
foreach ([['signage_playlist', 'day'], ['signage_schedule', 'occurrences']] as [$resource, $action]) $api->execute([$resource, $action, $resource, $action]);
unset($api);
unset($exists, $grant, $task, $seed, $storage, $files, $topology, $diagrams, $db); // release SQLite cursors before the application connection writes
$app = require __DIR__.'/application.php';
Blade\Admin\Permissions::grantAdministration($app->workspace->db, $app->workspace->registry, '1');

// Base admin demo: an empty project with its first administrator only.
$db = blade_demo_db('admin');
Blade\Access\Schema::install($db);
blade_demo_accounts($db, [[1, 'demo@example.test', '61de-demo', 'Demo Admin', 1, 1]]);
unset($db);
$admin = require __DIR__.'/admin-application.php';
Blade\Admin\Permissions::grantAdministration($admin->workspace->db, $admin->workspace->registry, '1');
echo "Feature and base admin demos initialized.\n";

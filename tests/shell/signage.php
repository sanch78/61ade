<?php
declare(strict_types=1);
// Signage demo on shared files (U5): the demo media and sample programme, Signage mount, file field, derived media
// columns, usage counts, upload as asset, usage warnings and clearing on file and asset deletes, playlist, the brand
// scene and its code action (toolkit D2) and reader rights. Needs the git-ignored demo media (docs/demos.md#signage-media). An in-memory database
// is built like the demo setup; runtime files live in a private BLADE_TMP_DIR, never in tmp/web or tmp/demo.
$tmp = (getenv('BLADE_TMP_DIR') ?: dirname(__DIR__, 2).'/tmp').'/signage-check-'.bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
putenv('BLADE_TMP_DIR='.$tmp);
putenv('BLADE_DEMO_INSTANCE=check');
require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';
require_once dirname(__DIR__, 2).'/examples/demo-app/common.php';
require_once dirname(__DIR__, 2).'/examples/demo-app/signage.php';
use Blade\Access\Schema;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Context, Failure, Upload};
use Blade\Shell\Identity;

function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function fails(callable $call, int $status, string $message): Failure { try { $call(); } catch (Failure $e) { check($e->status === $status, $message.' (status '.$e->status.': '.$e->getMessage().')'); return $e; } throw new RuntimeException($message.' (accepted)'); }

try {
    $db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    Schema::install($db);
    $files = blade_demo_files();
    check(array_keys($files->mounts) === ['a', 'b', 'c', 'signage'] && $files->mounts['signage'] === 'Signage', 'Fourth demo mount Signage');
    $files->install($db);
    $storage = $files->storage($db);
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    $jpg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');
    $source = static function (string $content) use ($tmp): string { $path = $tmp.'/src-'.bin2hex(random_bytes(6)); file_put_contents($path, $content); return $path; };
    // An unrelated file of a seeded name in another mount, which must stay where it is.
    $other = $storage->createFile($storage->root('b'), 'logo.png', 'image/png', $source($png));
    blade_demo_signage_setup($db, $storage);
    blade_demo_signage_setup($db, $storage);
    $signage = $storage->root('signage');
    check($signage !== null, 'Setup creates the Signage mount root');
    // The demo media and the brand scene: one file each in the Signage root with its stored type, one asset each.
    $seeded = $db->query('SELECT a.title, a.duration, f.name, f.mime_type, f.mount_id, f.parent_id FROM signage_assets a JOIN blade_files f ON f.id = a.file_id ORDER BY a.id')->fetchAll(PDO::FETCH_ASSOC);
    $expected = [['Blade brand animation', '20', 'blade-brand.js', 'text/javascript']];
    foreach (BLADE_DEMO_SIGNAGE_MEDIA as $name => [$title, $mime, $seconds]) $expected[] = [$title, (string) $seconds, $name, $mime];
    check(array_map(static fn($row) => [$row['title'], $row['duration'], $row['name'], $row['mime_type']], $seeded) === $expected
        && !array_filter($seeded, static fn($row) => $row['mount_id'] !== 'signage' || (int) $row['parent_id'] !== (int) $signage['id']), 'Demo media: Signage root, stored type, one asset each (idempotent setup)');
    check($storage->entry($other)['mount_id'] === 'b', 'Other files untouched');
    $fileOf = static fn(string $name) => (int) $storage->child((int) $signage['id'], $name)['id'];
    [$image, $video, $music] = [$fileOf('Craft coffee, slow mornings.png'), $fileOf('3d-logo-intro.mp4'), $fileOf('calm-music.mp3')];
    // Brand scene: one script file in the Signage root, its asset the weekday default of every day.
    $brandId = (string) $db->query("SELECT a.id FROM signage_assets a JOIN blade_files f ON f.id = a.file_id WHERE f.name = 'blade-brand.js' AND f.mime_type = 'text/javascript' AND f.mount_id = 'signage'")->fetchColumn();
    check($brandId !== '' && $db->query("SELECT group_concat(weekday || ':' || asset_id || ':' || playlist_id, ',') FROM (SELECT weekday, asset_id, playlist_id FROM signage_defaults WHERE date = '' ORDER BY weekday)")->fetchColumn() === implode(',', array_map(static fn($day) => "$day:$brandId:", range(1, 7))), 'Brand scene is the weekday default of every day');
    // Sample programme: four playlists (items in order, transition overrides) and weekday and weekend blocks.
    $lists = $db->query("SELECT p.title || ' ' || p.transition, group_concat(f.name || CASE i.transition WHEN '' THEN '' ELSE ':' || i.transition END, '|') FROM signage_playlists p JOIN signage_playlist_items i ON i.playlist_id = CAST(p.id AS TEXT) JOIN signage_assets a ON a.id = i.asset_id JOIN blade_files f ON f.id = a.file_id GROUP BY p.id ORDER BY p.id")->fetchAll(PDO::FETCH_KEY_PAIR);
    check(array_keys($lists) === ['Reggeli lista fade', 'Napközbeni lista fade', 'Esti lista slide', 'Hétvégi lista slide']
        && $lists['Reggeli lista fade'] === 'Craft coffee, slow mornings.png|Dynamic running shoe in cobalt and lime.png|Orange fizz in cobalt blue.png|An elegant moment in time.png|blade-brand.js'
        && $lists['Hétvégi lista slide'] === 'Craft coffee, slow mornings.png|3d-logo-intro.mp4|Fox inventor in the floating garden.png|Electronic festival in a flood of light.png:zoom|Late-night bites by the river.png|Dynamic running shoe in cobalt and lime.png:zoom', 'Playlists over the demo media');
    $events = $db->query("SELECT text || ' ' || substr(start_at, 12, 5) || ' ' || (duration / 3600) || 'h ' || substr(rrule, 30) FROM blade_calendar_events WHERE space = 'signage' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
    check($events === ['Reggeli lista 06:00 4h MO,TU,WE,TH,FR', 'Arculati animáció 10:00 2h MO,TU,WE,TH,FR', 'Napközbeni lista 12:00 5h MO,TU,WE,TH,FR', 'Narancsos pezsgés 17:00 1h MO,TU,WE,TH,FR',
        'Esti lista 18:00 4h MO,TU,WE,TH,FR', 'Reggeli lista 06:00 4h SA,SU', 'Hétvégi lista 10:00 8h SA,SU', 'Esti lista 18:00 4h SA,SU'], 'Weekday and weekend programme');
    // A legacy reference outside the Signage mount is reported by setup (one line each) and left in place.
    $db->prepare("INSERT INTO signage_assets(title,file_id,duration) VALUES ('Régi elem',?,'5')")->execute([(string) $other]);
    $legacy = (string) $db->lastInsertId();
    $lines = [];
    blade_demo_signage_setup($db, $storage, static function (string $line) use (&$lines): void { $lines[] = $line; });
    check($lines === ['Signage: asset #'.$legacy.' (Régi elem) references file #'.$other.' in mount "b", outside the Signage mount; left in place.'] && $storage->entry($other)['mount_id'] === 'b', 'Setup reports legacy references outside the Signage mount without moving them');
    $db->exec('DELETE FROM signage_assets WHERE id = '.(int) $legacy);
    check(blade_demo_signage_outside($db) === [], 'No other reference outside the mount');
    // Music: the probed length reaches the file. The media step restores only a missing asset, adds no programme to an
    // existing database, and is idempotent.
    check(abs((int) $storage->entry($music)['duration_ms'] - 182040) <= 150, 'Music length probed');
    $db->exec("DELETE FROM signage_assets WHERE title = 'Cheerful music'");
    foreach ([1, 2] as $run) blade_demo_signage_setup($db, $storage);
    check((int) $db->query('SELECT COUNT(*) FROM signage_assets')->fetchColumn() === 19 && (int) $db->query("SELECT COUNT(*) FROM signage_assets WHERE title = 'Cheerful music'")->fetchColumn() === 1
        && (int) $db->query("SELECT COUNT(*) FROM blade_files WHERE name = 'cheerful-music.mp3' AND archived_at IS NULL")->fetchColumn() === 1
        && (int) $db->query('SELECT COUNT(*) FROM signage_playlists')->fetchColumn() === 4 && (int) $db->query('SELECT COUNT(*) FROM blade_calendar_events')->fetchColumn() === 8, 'The media step restores only a missing asset and is idempotent');
    $ids = array_map('strval', $db->query('SELECT title, id FROM signage_assets')->fetchAll(PDO::FETCH_KEY_PAIR));
    $sceneId = $brandId;

    $workspace = WorkspaceConfiguration::build($db, [dirname(__DIR__, 2).'/examples/demo-app/modules/signage.json'], static fn() => blade_demo_signage_bindings());
    $files->register($workspace);
    blade_demo_signage_register($workspace, $files);
    $reader = '9';
    $rule = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,'ui','allow','all','','')");
    foreach (['tree', 'list', 'create_directory', 'upload', 'copy', 'move', 'content_get', 'content_stream', 'thumbnail_get', 'delete', 'rename', 'download'] as $action) $rule->execute(['1', 'files', $action]);
    foreach (['tree', 'list', 'content_get', 'content_stream', 'thumbnail_get', 'download'] as $action) $rule->execute([$reader, 'files', $action]);
    foreach (['list', 'get', 'create', 'update', 'delete', 'upload_asset'] as $action) $rule->execute(['1', 'signage_assets', $action]);
    foreach (['list', 'get', 'create', 'update', 'delete'] as $action) $rule->execute(['1', 'signage_defaults', $action]);
    foreach (['events', 'occurrences', 'create', 'update', 'delete'] as $action) $rule->execute(['1', 'signage_schedule', $action]);
    $rule->execute(['1', 'signage_playlist', 'day']);
    $rule->execute(['1', 'signage_playlist', 'scene']);
    $rule->execute([$reader, 'signage_playlist', 'scene']);
    foreach (['list', 'get'] as $action) { $rule->execute([$reader, 'signage_assets', $action]); $rule->execute([$reader, 'signage_defaults', $action]); }
    foreach (['list', 'get', 'create', 'update', 'delete'] as $action) $rule->execute(['1', 'signage_playlists', $action]);
    foreach (['list', 'get'] as $action) $rule->execute([$reader, 'signage_playlists', $action]);
    foreach (['list', 'get', 'create', 'update', 'delete', 'move'] as $action) $rule->execute(['1', 'signage_playlist_items', $action]);
    foreach (['list', 'get'] as $action) $rule->execute([$reader, 'signage_playlist_items', $action]);
    $ctx = static fn(string $actor = '1', array $uploads = []) => new Context(new Identity($actor, 'Actor '.$actor), 'ui', $workspace->acl, $db, [], $uploads);
    $call = static fn(string $resource, string $action, ?string $id, array $values = [], ?Context $c = null) => $workspace->executor->execute($c ?? $ctx(), $resource, $action, $id, $values);

    // Metadata: the file field is a media column with the resolved folder and the upload policy, never a path.
    $views = array_column($workspace->views(new Identity('1', 'Demo')), null, 'id');
    $view = $views['signage_assets'];
    $columns = array_column($view['options']['columns'], null, 'id');
    check(array_keys($columns) === ['file_id', 'title', 'media_type', 'media_resolution', 'media_length', 'duration', 'usage'], 'Asset columns: thumbnail, title, derived type/resolution/length, play time, usage');
    check($columns['file_id']['type'] === 'file' && $columns['file_id']['media'] === 'files' && $columns['media_type']['mediaOf'] === 'file_id' && !isset($columns['media_type']['media_of']) && $columns['media_type']['part'] === 'type' && $columns['media_length']['part'] === 'duration', 'File column is a media column; derived columns reach the wire');
    check(!in_array('media_type', $view['options']['sortable'], true) && in_array('usage', $view['options']['sortable'], true) && !in_array('kind', array_column($view['options']['filters'], 'name'), true), 'Derived columns not sortable; usage sortable; no kind field');
    check(($filters = array_column($view['options']['filters'], null, 'name')) && $filters['file_id']['type'] === 'select' && array_keys($filters['file_id']['options']) === ['image', 'video'], 'Type filter from the file field');
    $actions = array_column($view['actions'], null, 'name');
    check(isset($actions['upload_asset']) && $actions['upload_asset']['upload']['extensions'] === ['png', 'jpg', 'mp4', 'webm', 'mp3', 'wav', 'm4a'] && $actions['upload_asset']['upload']['folders'] === false && $actions['upload_asset']['fields'] === [], 'Upload as asset offered with its upload policy');
    check(($actions['delete']['usages'] ?? false) === true && array_column($actions['delete']['fields'], 'name') === ['revision'], 'Asset delete announces usages; preview is no form field');
    $fileField = array_column($actions['create']['fields'], null, 'name')['file_id'];
    check(!in_array('usage', array_column($actions['create']['fields'], 'name'), true), 'Computed usage is never writable');
    check($fileField['type'] === 'file' && $fileField['file']['resource'] === 'files' && $fileField['file']['mount'] === 'signage' && $fileField['file']['accept'] === ['image', 'video', 'audio']
        && $fileField['file']['folderId'] === (string) $signage['id'] && $fileField['file']['canUpload'] === true && $fileField['file']['canChoose'] === true && $fileField['file']['policy']['extensions'] === ['png', 'jpg', 'mp4', 'webm', 'mp3', 'wav', 'm4a'] && !isset($fileField['file']['folder']), 'File field metadata');
    check(!str_contains(json_encode($view, JSON_THROW_ON_ERROR), $tmp), 'No storage path in metadata');
    // Activation by the file's MIME type or class: images, video, audio and scenes (text/javascript) open the record view
    // demo.asset-viewer, the rest the details; the toolbar command demo.play opens it too.
    check(json_encode($view['options']['activate'], JSON_THROW_ON_ERROR) === '{"field":"file_id","map":{"image":"view:demo.asset-viewer","audio":"view:demo.asset-viewer","video":"view:demo.asset-viewer","text\\/javascript":"view:demo.asset-viewer","*":"details"}}', 'Activation map on the file field');
    check(($view['options']['commands'] ?? null) === ['demo.play'], 'Play command on the list toolbar');
    $viewer = array_column($workspace->views(new Identity('1', 'Demo')), null, 'id')['demo.asset-viewer'] ?? null;
    check($viewer !== null && $viewer['kind'] === 'demo.asset-viewer' && $viewer['record'] === 'signage_assets' && $viewer['resource'] === 'signage_assets' && ($viewer['open'] ?? 'page') === 'page'
        && array_column($viewer['actions'], 'name') === ['get'] && $viewer['options'] === ['loop' => false, 'details' => 'signage_assets'], 'Record view demo.asset-viewer offered with its options');
    check(isset(array_column($workspace->views(new Identity('9', 'Reader')), null, 'id')['demo.asset-viewer']) && !isset(array_column($workspace->views(new Identity('77', 'Nobody')), null, 'id')['demo.asset-viewer']), 'The record view follows signage_assets.get');
    $fileActions = array_column($views['files']['actions'], null, 'name');
    check(($fileActions['delete']['usages'] ?? false) === true && array_column($fileActions['delete']['fields'], 'name') === ['sources'] && in_array('signage', array_column($views['files']['options']['mounts'], 'id'), true), 'File manager delete announces usages; Signage mount shown');
    $readerViews = array_column($workspace->views(new Identity($reader, 'Reader')), null, 'id');
    check(array_column($readerViews['signage_assets']['actions'], 'name') === ['get'] && in_array('signage', array_column($readerViews['files']['options']['mounts'], 'id'), true), 'Reader views assets and the Signage mount read-only');
    $readerField = $workspace->fieldMetadata($ctx($reader), $workspace->registry->fields('signage_assets')['file_id']);
    check($readerField['file']['canUpload'] === false && $readerField['file']['canChoose'] === true && $readerField['file']['folderId'] === (string) $signage['id'], 'Reader may not upload into the field folder, but may browse it');
    check($workspace->fieldMetadata($ctx('77'), $workspace->registry->fields('signage_assets')['file_id'])['file']['canChoose'] === false, 'Without `list` on the mount the picker is not offered');

    // Listing: `_media` descriptors and usage counts (events and day defaults referencing the asset).
    $list = $call('signage_assets', 'list', null, ['limit' => 30, 'sort' => ['field' => 'usage', 'direction' => 'desc']]);
    $items = array_column($list['items'], null, 'title');
    check((int) $items['Blade brand animation']['usage'] === 9, 'Brand scene: seven weekday defaults, its event and a playlist item');
    check($items['Blade brand animation']['_subview'] === 7 && $items['3D logo intro']['_subview'] === 0, 'An asset expands to the defaults playing it');
    check((int) $items['Orange fizz in cobalt blue']['usage'] === 2 && (int) $items['Craft coffee, slow mornings']['usage'] === 2 && (int) $items['3D logo intro']['usage'] === 2 && (int) $items['Calm music']['usage'] === 0, 'Usage counts events, defaults and playlist items');
    check($list['items'][0]['title'] === 'Blade brand animation' && (int) $list['items'][1]['usage'] === 2 && (int) end($list['items'])['usage'] === 0, 'Sorted by usage on the server');
    check($items['3D logo intro']['_media']['file_id']['mime_type'] === 'video/mp4' && $items['3D logo intro']['_media']['file_id']['width'] === 1920 && $items['3D logo intro']['_media']['file_id']['name'] === '3d-logo-intro.mp4'
        && $items['Calm music']['_media']['file_id']['mime_type'] === 'audio/mpeg', 'Media descriptors in rows');
    check($call('signage_assets', 'list', null, ['filters' => ['file_id' => 'video']])['matched'] === 4, 'Type filter over the file');
    $readerList = $call('signage_assets', 'list', null, ['limit' => 10], $ctx($reader));
    check($readerList['total'] === 19 && is_array($readerList['items'][0]['_media']['file_id'] ?? null), 'Reader lists assets with media');

    // Upload as asset: each file lands in Signage/ through the file manager's storage API and becomes an asset.
    $part = static function (string $name, string $content) use ($tmp): Upload { $path = $tmp.'/up-'.bin2hex(random_bytes(6)); file_put_contents($path, $content); return new Upload('files', $name, $path, strlen($content), UPLOAD_ERR_OK); };
    $result = $call('signage_assets', 'upload_asset', null, [], $ctx('1', [$part('Nyitó kép.png', $png), $part('Night ferry in the fog.png', $png)]));
    check(count($result['assets']) === 2 && !isset($result['succeeded']), 'Generic success result, one asset per file');
    $created = $db->query('SELECT title, file_id, duration FROM signage_assets WHERE id IN ('.implode(',', array_map('intval', $result['assets'])).') ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $stored = $storage->entry((int) $created[0]['file_id']);
    check($created[0]['title'] === 'Nyitó kép' && $created[0]['duration'] === '10' && $stored['mount_id'] === 'signage' && (int) $stored['parent_id'] === (int) $signage['id'] && $stored['mime_type'] === 'image/png', 'Asset title, duration and stored file');
    check($storage->entry((int) $created[1]['file_id'])['name'] === 'Night ferry in the fog (2).png' && $created[1]['title'] === 'Night ferry in the fog (2)', 'A taken name gets a free one');
    fails(fn() => $call('signage_assets', 'upload_asset', null, [], $ctx('1', [$part('notes.txt', 'text')])), 400, 'Non-media upload rejected by the policy');
    $mismatch = fails(fn() => $call('signage_assets', 'upload_asset', null, [], $ctx('1', [$part('fake.png', 'not an image')])), 400, 'Content mismatch rejected');
    check(($mismatch->details['code'] ?? null) === 'content_mismatch' && (int) $db->query('SELECT COUNT(*) FROM signage_assets')->fetchColumn() === 21, 'Failed upload creates no asset');
    // Audio uploads as an asset too; the stored file keeps the detected audio type and its length reaches the row.
    // A 3 s silent WAV (8 kHz, 8-bit mono).
    $wav = static fn(int $samples) => 'RIFF'.pack('V', 36 + $samples).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 8000, 8000, 1, 8).'data'.pack('V', $samples).str_repeat("\x80", $samples);
    $tone = $call('signage_assets', 'upload_asset', null, [], $ctx('1', [$part('Hangpróba.wav', $wav(24000))]));
    $toneRow = $call('signage_assets', 'get', $tone['assets'][0]);
    check($toneRow['title'] === 'Hangpróba' && $toneRow['_media']['file_id']['mime_type'] === 'audio/wav' && abs((int) $toneRow['_media']['file_id']['duration_ms'] - 3000) <= 150 && $toneRow['_media']['file_id']['thumbnail'] === 'none', 'Audio upload as asset: type and length');
    $call('signage_assets', 'delete', $tone['assets'][0], ['revision' => $toneRow['revision']]);
    fails(fn() => $call('signage_assets', 'upload_asset', null, [], $ctx($reader, [$part('r.png', $png)])), 403, 'Reader cannot upload');

    // File field rules: another mount, a non-media file and an unknown id are field errors.
    $textFile = $storage->createFile($signage, 'leiras.txt', 'text/plain', $source("text\n"));
    foreach ([(string) $other => 'other mount', (string) $textFile => 'wrong class', '999999' => 'unknown', 'abc' => 'malformed'] as $value => $case) {
        $error = fails(fn() => $call('signage_assets', 'create', null, ['title' => 'X', 'file_id' => $value, 'duration' => '5']), 400, 'File field rejects '.$case);
        check(isset($error->fieldErrors['file_id']), 'Field error for '.$case);
    }
    $new = $call('signage_assets', 'create', null, ['title' => 'Új elem', 'file_id' => (string) $image, 'duration' => '5']);
    check($db->query('SELECT file_id FROM signage_assets WHERE id = '.(int) $new['id'])->fetchColumn() === (string) $image, 'A Signage image is accepted');
    // An unchanged stored file id is not re-validated: a legacy reference outside the mount does not block saving other fields; a new one must pass.
    $db->prepare('UPDATE signage_assets SET file_id = ? WHERE id = ?')->execute([(string) $other, $new['id']]);
    $saved = $call('signage_assets', 'update', $new['id'], ['title' => 'Átnevezett', 'file_id' => (string) $other, 'duration' => '6', 'revision' => $call('signage_assets', 'get', $new['id'])['revision']]);
    check($saved['id'] === $new['id'] && $db->query('SELECT title FROM signage_assets WHERE id = '.(int) $new['id'])->fetchColumn() === 'Átnevezett', 'Unchanged out-of-mount file saves');
    $changed = fails(fn() => $call('signage_assets', 'update', $new['id'], ['title' => 'X', 'file_id' => (string) $textFile, 'duration' => '6', 'revision' => $call('signage_assets', 'get', $new['id'])['revision']]), 400, 'A changed file is validated');
    check(isset($changed->fieldErrors['file_id']), 'Changed file: field error');
    $db->prepare('UPDATE signage_assets SET file_id = ? WHERE id = ?')->execute([(string) $image, $new['id']]);
    $call('signage_assets', 'delete', $new['id'], ['revision' => $call('signage_assets', 'get', $new['id'])['revision']]);

    // Deleting a used file: the preview counts the assets, changes nothing; the delete clears `file_id` and keeps the asset.
    $preview = $call('files', 'delete', (string) $signage['id'], ['sources' => (string) $music, 'preview' => '1']);
    check($preview['count'] === 1 && $preview['entries'] === 1 && $preview['usages'] === [['label' => 'Médiatár-elemek', 'count' => 1]] && $storage->entry($music) !== null, 'File delete preview');
    $deleted = $call('files', 'delete', (string) $signage['id'], ['sources' => (string) $music]);
    check($deleted['cleared'] === ['Médiatár-elemek' => 1] && $storage->entry($music) === null, 'File deleted, references cleared');
    check($db->query('SELECT file_id FROM signage_assets WHERE id = '.(int) $ids['Calm music'])->fetchColumn() === '', 'The asset stays without a file');
    $silent = $call('signage_assets', 'get', $ids['Calm music']);
    check($silent['file_id'] === '' && $silent['_media']['file_id'] === null, 'Asset without file reads cleanly');

    // Deleting a used asset: one preview over the marks (bulk), then the defaults go and the events lose their asset.
    $poster = $ids['Orange fizz in cobalt blue'];
    $coffee = $ids['Craft coffee, slow mornings'];
    $revision = $call('signage_assets', 'get', $poster)['revision'];
    $bulk = $workspace->executor->bulk($ctx(), 'signage_assets', 'delete', [['id' => $poster, 'values' => ['revision' => $revision, 'preview' => '1']], ['id' => $coffee, 'values' => ['revision' => $call('signage_assets', 'get', $coffee)['revision'], 'preview' => '1']]]);
    check($bulk[0]['ok'] && $bulk[0]['data']['count'] === 1 && $bulk[0]['data']['usages'] === [['label' => 'Műsorterv-események', 'count' => 1], ['label' => 'Lejátszásilista-elemek', 'count' => 1]] && !isset($bulk[0]['data']['audit']), 'Bulk preview carries the usages');
    check($bulk[1]['data']['usages'] === [['label' => 'Lejátszásilista-elemek', 'count' => 2]] && (int) $db->query("SELECT COUNT(*) FROM signage_assets")->fetchColumn() === 21, 'Preview changes nothing');
    check(!isset($bulk[0]['data']['audit_action']) && $db->query("SELECT COUNT(*) FROM blade_audit WHERE resource = 'signage_assets' AND action = 'delete_preview' AND outcome = 'success' AND object_id IN (".$db->quote($poster).','.$db->quote($coffee).')')->fetchColumn() == 2
        && !$db->query("SELECT COUNT(*) FROM blade_audit WHERE resource = 'signage_assets' AND action = 'delete' AND object_id = ".$db->quote($poster))->fetchColumn(), 'Previews journaled as delete_preview');
    $applied = $workspace->executor->bulk($ctx(), 'signage_assets', 'delete', [['id' => $poster, 'values' => ['revision' => $revision]]]);
    check($applied[0]['ok'] && $applied[0]['data']['cleared'] === ['Műsorterv-események' => 1, 'Lejátszásilista-elemek' => 1], 'Applied delete reports the cleared references');
    check((int) $db->query('SELECT COUNT(*) FROM signage_playlist_items WHERE asset_id = '.$db->quote($poster))->fetchColumn() === 0, 'Its playlist items are removed');
    check((int) $db->query('SELECT COUNT(*) FROM signage_defaults WHERE asset_id = '.$db->quote($poster))->fetchColumn() === 0 && (int) $db->query('SELECT COUNT(*) FROM signage_defaults')->fetchColumn() === 7, 'No default referenced it');
    $event = $db->query("SELECT data, revision FROM blade_calendar_events WHERE text = 'Narancsos pezsgés'")->fetch(PDO::FETCH_ASSOC);
    check(json_decode($event['data'], true)['content'] === '' && (int) $event['revision'] === 2, 'Its event keeps the slot without content');
    // A default delete no longer runs the after_save rule (which re-read the deleted row and rejected every delete).
    $default = $db->query('SELECT id FROM signage_defaults ORDER BY id LIMIT 1')->fetchColumn();
    $call('signage_defaults', 'delete', (string) $default, ['revision' => $call('signage_defaults', 'get', (string) $default)['revision']]);
    check((int) $db->query('SELECT COUNT(*) FROM signage_defaults')->fetchColumn() === 6, 'A default can be deleted');

    // Playlist: assets without a file and events without an asset are skipped.
    $monday = new DateTimeImmutable('monday this week');
    foreach (range(0, 6) as $offset) {
        $day = blade_demo_signage_playlist($ctx(), blade_demo_signage_calendar(), $monday->modify("+$offset days")->format('Y-m-d'));
        check(!array_filter($day['scheduled'], static fn($entry) => $entry['asset'] === null ? !$entry['playlist']['items'] || array_filter($entry['playlist']['items'], static fn($asset) => $asset['file'] === null) : $entry['asset']['file'] === null), 'Scheduled entries all have playable content');
        check($day['default'] === null || $day['default']['asset']['file'] !== null, 'Default content has a file');
        check(!in_array('Narancsos pezsgés', array_column($day['scheduled'], 'title'), true), 'Blanked event skipped');
        check(($day['default']['asset']['id'] ?? null) === ($offset === 0 ? null : $brandId) && ($day['default']['source'] ?? 'weekday') === 'weekday', 'Brand scene is the default; the deleted Monday default leaves none');
    }
    $tuesday = blade_demo_signage_playlist($ctx(), blade_demo_signage_calendar(), $monday->modify('+1 day')->format('Y-m-d'));
    $daytime = array_values(array_filter($tuesday['scheduled'], static fn($entry) => $entry['title'] === 'Napközbeni lista'))[0]['playlist'];
    check(array_column($daytime['items'], 'kind') === ['image', 'video', 'video', 'video', 'video'] && $daytime['items'][1]['file']['mime_type'] === 'video/mp4', 'Type derived from the file');
    $brandSlot = array_values(array_filter($tuesday['timeline'], static fn($slot) => $slot['title'] === 'Arculati animáció'));
    check(count($brandSlot) === 1 && $brandSlot[0]['start'] === '10:00' && $brandSlot[0]['end'] === '12:00' && $brandSlot[0]['asset']['kind'] === 'scene' && $brandSlot[0]['asset']['id'] === $sceneId, 'A scene file plays as the type `scene`');

    // Playlist items: an ordered child resource of its playlist (manual order within the playlist, `move`); the
    // editor lists, edits and moves them through the framework list, the reader only reads.
    $playlist = (string) $db->query("SELECT id FROM signage_playlists WHERE title = 'Reggeli lista'")->fetchColumn();
    // An embedded child: no view (menu entry) of its own, the playlists view carries it as its sub-view.
    check(!isset($views['signage_playlist_items']), 'Items have no menu entry');
    $itemView = $views['signage_playlists']['options']['subview']['view'];
    $itemColumns = array_column($itemView['options']['columns'], null, 'id');
    check($itemView['options']['order'] === ['field' => 'position', 'scope' => 'playlist_id'] && $itemView['options']['sortable'] === ['position']
        && array_column($itemView['actions'], 'name') === ['get', 'create', 'update', 'delete', 'move'], 'Items: manual order within the playlist, move offered');
    check($itemColumns['file_id']['media'] === 'files' && $itemColumns['status']['presentation'] === 'icon' && $itemColumns['duration']['editable'] === true
        && !in_array('position', array_column(array_column($itemView['actions'], null, 'name')['create']['fields'], 'name'), true), 'Items: thumbnail through the asset, today icon, editable play time; the position is server-owned');
    check(($views['signage_playlists']['options']['subview']['resource'] ?? null) === 'signage_playlist_items' && $views['signage_playlists']['options']['subview']['field'] === 'playlist_id', 'Playlists expand to their items');
    $itemsOf = static fn(string $list, ?Context $c = null) => $call('signage_playlist_items', 'list', null, ['limit' => 200, 'filters' => ['playlist_id' => $list]], $c)['items'];
    $seeded = $itemsOf($playlist);
    check(array_column($seeded, 'asset_id') === [$coffee, $ids['Dynamic running shoe in cobalt and lime'], $ids['An elegant moment in time'], $brandId] && array_map('intval', array_column($seeded, 'position')) === [0, 1, 3, 4], 'Items listed in their seeded order (the deleted asset\'s item is gone)');
    foreach ($seeded as $item) $call('signage_playlist_items', 'delete', $item['id'], ['revision' => $item['revision']]);
    $clip = $ids['3D logo intro'];
    $saturdayDate = $monday->modify('+5 days')->format('Y-m-d');
    $create = static fn(array $values, ?Context $c = null) => $call('signage_playlist_items', 'create', null, ['playlist_id' => $playlist, ...$values], $c)['id'];
    // Video with a 10 s override and the zoom transition, the scene, the video again switched off, the scene valid only
    // after the Saturday (skipped there): repeats, overrides, the switch and validity; each new item goes last.
    $first = $create(['asset_id' => $clip, 'duration' => '10', 'transition' => 'zoom']);
    $second = $create(['asset_id' => $sceneId]);
    $third = $create(['asset_id' => $clip, 'enabled' => '0']);
    $fourth = $create(['asset_id' => $sceneId, 'valid_from' => $monday->modify('+6 days')->format('Y-m-d'), 'valid_to' => '2099-12-31']);
    $listed = array_column($itemsOf($playlist), null, 'id');
    check(array_map('strval', array_keys($listed)) === [$first, $second, $third, $fourth], 'New items go last, in order');
    check($listed[$first]['length'] === '10' && $listed[$second]['length'] === '20' && $listed[$first]['status'] === 'dxi dxi-check' && $listed[$third]['status'] === 'dxi dxi-eye-off' && $listed[$fourth]['status'] === 'dxi dxi-calendar-today'
        && $listed[$first]['_media']['file_id']['mime_type'] === 'video/mp4', 'Effective play time, today\'s status and the asset\'s media');
    fails(fn() => $create(['asset_id' => $clip, 'position' => '1']), 400, 'The position is not writable');
    $refused = static fn(array $values, string $field, string $message) => check(isset(fails(fn() => $create($values), 400, $message)->fieldErrors[$field]), $message.': field error');
    $refused(['asset_id' => '999999'], 'asset_id', 'Unknown asset refused');
    $refused(['asset_id' => $clip, 'duration' => '0'], 'duration', 'Zero play time refused');
    $refused(['asset_id' => $clip, 'duration' => '3601'], 'duration', 'Play time over an hour refused');
    $refused(['asset_id' => $clip, 'transition' => 'spin'], 'transition', 'Unknown transition refused');
    $refused(['asset_id' => $clip, 'valid_from' => '2026-02-30'], 'valid_from', 'Invalid date refused');
    $refused(['asset_id' => $clip, 'valid_from' => '2026-03-02', 'valid_to' => '2026-03-01'], 'valid_to', 'Validity end before its start refused');
    $revision = $listed[$fourth]['revision'];
    check(isset(fails(fn() => $workspace->executor->edit($ctx(), 'signage_playlist_items', $fourth, 'valid_from', '2100-01-01', $revision), 400, 'A start after the stored end refused in a cell edit')->fieldErrors['valid_from']), 'Range checked against the stored end');
    // Moving: in front of another item of the playlist or last; the scope is renumbered, other revisions stay valid.
    $move = static fn(string $id, string $before, ?Context $c = null) => $call('signage_playlist_items', 'move', $id, ['before' => $before, 'revision' => $call('signage_playlist_items', 'get', $id)['revision']], $c);
    $order = static fn() => array_map('strval', array_column($itemsOf($playlist), 'id'));
    $secondRevision = $listed[$second]['revision'];
    check($move($fourth, $second)['position'] === 2 && $order() === [$first, $fourth, $second, $third], 'Moved in front of another item');
    check($move($first, '')['position'] === 4 && $order() === [$fourth, $second, $third, $first], 'Moved last');
    $move($first, $fourth); $move($fourth, '');
    check($order() === [$first, $second, $third, $fourth] && array_map('intval', array_column($itemsOf($playlist), 'position')) === [1, 2, 3, 4], 'Positions renumbered 1…n');
    check($call('signage_playlist_items', 'get', $second)['revision'] === $secondRevision, 'A move does not make other items stale');
    $other = $call('signage_playlists', 'create', null, ['title' => 'Másik lista', 'transition' => 'fade', 'transition_ms' => '600', 'shuffle' => '0'])['id'];
    $foreign = $call('signage_playlist_items', 'create', null, ['playlist_id' => $other, 'asset_id' => $clip])['id'];
    check((int) $itemsOf($other)[0]['position'] === 1, 'Another playlist numbers its own items');
    check(isset(fails(fn() => $move($first, $foreign), 400, 'An item of another playlist is no move target')->fieldErrors['before']), 'Foreign move target: field error');
    fails(fn() => $call('signage_playlist_items', 'move', $first, ['before' => '', 'revision' => 'stale']), 409, 'A stale revision refused');
    $call('signage_playlists', 'delete', $other, ['revision' => $call('signage_playlists', 'get', $other)['revision']]);
    check(count($itemsOf($playlist, $ctx($reader))) === 4, 'Reader lists the items');
    fails(fn() => $create(['asset_id' => $sceneId], $ctx($reader)), 403, 'Reader cannot add an item');
    fails(fn() => $move($first, '', $ctx($reader)), 403, 'Reader cannot move an item');
    $db->prepare('INSERT INTO signage_playlist_items(playlist_id,asset_id,position) SELECT ?, ?, 100 + value FROM json_each(?)')->execute([$playlist, $sceneId, json_encode(range(1, BLADE_DEMO_SIGNAGE_PLAYLIST_ITEMS - 4))]);
    fails(fn() => $create(['asset_id' => $sceneId]), 409, 'At most 200 items');
    $db->exec('DELETE FROM signage_playlist_items WHERE CAST(position AS INTEGER) > 100');
    // List settings go through the resource's `update` (validated like any field).
    $revision = $call('signage_playlists', 'get', $playlist)['revision'];
    fails(fn() => $call('signage_playlists', 'update', $playlist, ['title' => 'Reggeli lista', 'transition' => 'fade', 'transition_ms' => '9000', 'shuffle' => '0', 'revision' => $revision]), 400, 'Transition over 5 s refused');
    $call('signage_playlists', 'update', $playlist, ['title' => 'Reggeli lista', 'transition' => 'slide', 'transition_ms' => '800', 'shuffle' => '0', 'revision' => $revision]);
    $listed = array_column($call('signage_playlists', 'list', null, ['limit' => 10])['items'], null, 'id')[$playlist];
    check((int) $listed['items'] === 4 && (int) $listed['length'] === 10 + 20 + 20, 'Length: overrides, switched-off items left out');
    // Day programme: only the items playing that day, each with its play time and transition, and their total.
    $saturday = blade_demo_signage_playlist($ctx(), blade_demo_signage_calendar(), $saturdayDate);
    $weekend = array_values(array_filter($saturday['timeline'], static fn($slot) => $slot['title'] === 'Reggeli lista'));
    check(count($weekend) === 1 && $weekend[0]['start'] === '06:00' && $weekend[0]['end'] === '10:00' && $weekend[0]['asset'] === null
        && array_column($weekend[0]['playlist']['items'], 'id') === [$clip, $sceneId] && array_column($weekend[0]['playlist']['items'], 'duration') === [10, 20]
        && $weekend[0]['playlist']['duration'] === 30, 'Playlist slot: switched-off and not yet valid items skipped, overrides applied');
    check(array_column($weekend[0]['playlist']['items'], 'transition') === [['type' => 'zoom', 'ms' => 800], ['type' => 'slide', 'ms' => 800]], 'Transition: item override, else the list\'s');
    $sunday = blade_demo_signage_playlist($ctx(), blade_demo_signage_calendar(), $monday->modify('+6 days')->format('Y-m-d'));
    $sundaySlot = array_values(array_filter($sunday['timeline'], static fn($slot) => $slot['title'] === 'Reggeli lista'))[0];
    check(array_column($sundaySlot['playlist']['items'], 'id') === [$clip, $sceneId, $sceneId], 'An item plays from its first valid day');
    // Shuffle: the same items in a stable order per date.
    $call('signage_playlists', 'update', $playlist, ['title' => 'Reggeli lista', 'transition' => 'slide', 'transition_ms' => '800', 'shuffle' => '1', 'revision' => $call('signage_playlists', 'get', $playlist)['revision']]);
    $shuffled = static fn() => array_values(array_filter(blade_demo_signage_playlist($ctx(), blade_demo_signage_calendar(), $monday->modify('+6 days')->format('Y-m-d'))['timeline'], static fn($slot) => $slot['title'] === 'Reggeli lista'))[0]['playlist'];
    $first = $shuffled();
    check($first['shuffle'] === true && $first === $shuffled() && count($first['items']) === 3 && $first['duration'] === 50, 'Shuffled list: same items, stable order per date');
    // The calendar offers playlists and assets in one field; playlist events take their own colour.
    $calendarView = array_column($workspace->views(new Identity('1', 'Demo')), null, 'id')['signage_schedule'];
    $content = $calendarView['options']['fields'][0];
    check($content['name'] === 'content' && $content['options']['playlist:'.$playlist] === 'Lejátszási lista: Reggeli lista' && $content['options']['asset:'.$sceneId] === 'Blade brand animation', 'Content choices: playlists and assets');
    check($calendarView['options']['tones'] === [['field' => 'content', 'prefix' => 'playlist:', 'tone' => 'success']], 'Playlist events have their own tone');
    // Day defaults: an asset or a playlist, an exclusive field pair (`clears`); a playlist date default fills free time.
    $pair = $workspace->registry->fields('signage_defaults');
    check($workspace->fieldMetadata($ctx(), $pair['asset_id'])['clears'] === ['playlist_id'] && $workspace->fieldMetadata($ctx(), $pair['playlist_id'])['clears'] === ['asset_id'], 'Asset and playlist clear each other');
    $refusedDefault = static function (array $values, string $field, string $message) use ($call): void {
        try { $call('signage_defaults', 'create', null, ['weekday' => '', 'date' => '2099-12-31', ...$values]); } catch (Failure $error) { check($error->status === 400 && isset($error->fieldErrors[$field]), $message); return; }
        check(false, $message);
    };
    $refusedDefault(['playlist_id' => '999999'], 'playlist_id', 'Unknown playlist refused');
    $refusedDefault(['asset_id' => $sceneId, 'playlist_id' => $playlist], 'playlist_id', 'Asset and playlist together refused');
    $refusedDefault([], 'asset_id', 'A default needs an asset or a playlist');
    $listDefault = (string) $call('signage_defaults', 'create', null, ['weekday' => '', 'date' => '2099-12-31', 'playlist_id' => $playlist])['id'];
    $edited = $workspace->executor->edit($ctx(), 'signage_defaults', $listDefault, 'asset_id', $sceneId, $call('signage_defaults', 'get', $listDefault)['revision']);
    check($edited['values'] === ['asset_id' => $sceneId, 'playlist_id' => ''], 'A cell edit of the asset empties the playlist and returns both');
    $edited = $workspace->executor->edit($ctx(), 'signage_defaults', $listDefault, 'playlist_id', $playlist, $edited['revision']);
    check($edited['values'] === ['asset_id' => '', 'playlist_id' => $playlist], 'A cell edit of the playlist empties the asset');
    $night = blade_demo_signage_playlist($ctx(), blade_demo_signage_calendar(), '2099-12-31');
    check($night['default']['source'] === 'date' && $night['default']['asset'] === null && $night['default']['playlist']['id'] === $playlist && $night['default']['title'] === 'Reggeli lista'
        && $night['timeline'][0]['source'] === 'default' && $night['timeline'][0]['start'] === '00:00' && $night['timeline'][0]['playlist']['id'] === $playlist, 'A playlist default plays in free time');
    check((int) array_column($call('signage_playlists', 'list', null, ['limit' => 10])['items'], null, 'id')[$playlist]['usage'] === 3, 'Playlist usage counts its default');
    // Deleting a used playlist: the preview counts events, defaults and items; the delete blanks the event and removes the items and defaults.
    $revision = $call('signage_playlists', 'get', $playlist)['revision'];
    check($call('signage_playlists', 'delete', $playlist, ['revision' => $revision, 'preview' => '1'])['usages'] === [['label' => 'Műsorterv-események', 'count' => 2], ['label' => 'Alapértelmezett tartalmak', 'count' => 1], ['label' => 'Lejátszásilista-elemek', 'count' => 4]], 'Playlist delete preview');
    $call('signage_playlists', 'delete', $playlist, ['revision' => $revision]);
    check(!(int) $db->query('SELECT COUNT(*) FROM signage_defaults WHERE id = '.$db->quote((string) $listDefault))->fetchColumn(), 'Playlist delete removes its defaults');
    check(array_map(static fn($data) => json_decode($data, true)['content'], $db->query("SELECT data FROM blade_calendar_events WHERE text = 'Reggeli lista'")->fetchAll(PDO::FETCH_COLUMN)) === ['', ''] && !(int) $db->query('SELECT COUNT(*) FROM signage_playlist_items WHERE playlist_id = '.$db->quote($playlist))->fetchColumn(), 'Playlist delete blanks its events and removes its items');

    // Scene code (D2): only a scene asset's live file, as text; the browser runs it in the SandboxFrame only.
    $code = $call('signage_playlist', 'scene', null, ['asset' => $sceneId]);
    check($code['asset'] === $sceneId && $code['title'] === 'Blade brand animation' && $code['name'] === 'blade-brand.js' && $code['code'] === file_get_contents(dirname(__DIR__, 2).'/examples/demo-app/resources/files/blade-brand.js')
        && $code['bytes'] === strlen($code['code']) && str_contains($code['code'], 'renderAt('), 'Scene code delivered');
    check($call('signage_playlist', 'scene', null, ['asset' => $sceneId], $ctx($reader))['asset'] === $sceneId, 'Reader may preview scenes');
    fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => $clip]), 415, 'A media asset is no scene');
    fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => '999999']), 404, 'Unknown scene');
    fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => $ids['Calm music']]), 404, 'Scene asset without a file');
    check(isset(fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => 'x']), 400, 'Malformed scene id')->fieldErrors['asset']), 'Malformed scene id is a field error');
    fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => $sceneId], $ctx('77')), 403, 'Scene code needs signage_playlist.scene');
    // The scene file must be readable through the file manager too (files.content_stream on its mount), else 404.
    $rule->execute(['12', 'signage_playlist', 'scene']);
    fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => $sceneId], $ctx('12')), 404, 'Scene code needs files.content_stream');
    $mountRule = $db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','12','files','content_stream','ui','allow','id',?,'')");
    $mountRule->execute(['a']);
    fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => $sceneId], $ctx('12')), 404, 'Scene code needs content_stream on the scene file\'s mount');
    $mountRule->execute(['signage']);
    check($call('signage_playlist', 'scene', null, ['asset' => $sceneId], $ctx('12'))['asset'] === $sceneId, 'content_stream on the Signage mount reads the scene');
    $large = $storage->createFile($signage, 'nagy-jelenet.js', 'text/javascript', $source(str_repeat('/', BLADE_DEMO_SIGNAGE_SCENE_BYTES + 1)));
    $db->prepare("INSERT INTO signage_assets(title,file_id,duration) VALUES ('Nagy jelenet',?,'5')")->execute([(string) $large]);
    fails(fn() => $call('signage_playlist', 'scene', null, ['asset' => (string) $db->lastInsertId()]), 413, 'Scene over the size limit');
    // The preview view: the generic project kind, offered with the playlist actions, never to an actor without them.
    $previews = array_column($workspace->views(new Identity('1', 'Demo')), null, 'id');
    $preview = $previews['demo.playlist-preview'] ?? null;
    check($preview !== null && $preview['kind'] === 'demo.playlist-preview' && $preview['resource'] === 'signage_playlist' && $preview['group'] === 'Digitális kijelző'
        && array_column($preview['actions'], 'name') === ['day', 'scene'] && $preview['options']['media'] === 'files' && !isset($preview['record'])
        && array_column($preview['options']['layout']['rows'], 'id') === ['commands', 'player'] && array_column($preview['actions'], 'icon') === ['dxi dxi-calendar-today', null], 'Playlist preview view: its panels and the day action\'s icon');
    check(isset(array_column($workspace->views(new Identity($reader, 'Reader')), null, 'id')['demo.playlist-preview']) && !isset(array_column($workspace->views(new Identity('77', 'Nobody')), null, 'id')['demo.playlist-preview']), 'The preview follows the playlist actions');

    // Reader: no write channel.
    fails(fn() => $call('signage_assets', 'delete', $clip, ['revision' => 'x'], $ctx($reader)), 403, 'Reader cannot delete assets');
    fails(fn() => $call('files', 'delete', (string) $signage['id'], ['sources' => (string) $video, 'preview' => '1'], $ctx($reader)), 403, 'Reader cannot preview file deletes');
    fails(fn() => $call('signage_assets', 'create', null, ['title' => 'R', 'file_id' => (string) $video, 'duration' => '5'], $ctx($reader)), 403, 'Reader cannot create assets');
    echo "Signage demo on shared files: mount, file field, media columns, usage, upload, delete warnings, playlist and scenes passed.\n";
} finally {
    exec('rm -rf '.escapeshellarg($tmp));
}

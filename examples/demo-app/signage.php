<?php
declare(strict_types=1);

/*
 * Feature-demo digital signage (DMS) scheduler: synthetic consumer configuration of the framework
 * event calendar. Assets and per-day defaults are a JSON module (modules/signage.json); the
 * programme is a Blade\Calendar\CalendarDefinition; `signage_playlist.day` answers what plays
 * on a given date, on the UI and API channels. The project view `demo.playlist-preview` (toolkit D2,
 * frontend/src/playlist.ts) previews that answer; `signage_playlist.scene` delivers a scene asset's code to it.
 */

use Blade\Calendar\CalendarDefinition;
use Blade\Feature\{Action, Context, Failure, Field, FileSource, Lookup, UploadPolicy, UsageProvider, View, Workspace};
use Blade\Files\{FileManagerDefinition, FileMedia, FileStorage, MountStorage};

const BLADE_DEMO_SIGNAGE_WEEKDAYS = [1 => 'Hétfő', 2 => 'Kedd', 3 => 'Szerda', 4 => 'Csütörtök', 5 => 'Péntek', 6 => 'Szombat', 7 => 'Vasárnap'];
/** Stored type of a scene asset's file: script source run only inside the 61ade SandboxFrame (toolkit D2). */
const BLADE_DEMO_SIGNAGE_SCENE_TYPE = 'text/javascript';
/** Largest scene `signage_playlist.scene` delivers; the frame's own code limit is 1 MiB (docs/toolkit.md#sandbox-protocol). */
const BLADE_DEMO_SIGNAGE_SCENE_BYTES = 262144;

/** Delete policy of `signage_assets` as declared in modules/signage.json (`delete` in the demo). */
function blade_demo_signage_policy(): string
{
    static $policy = null;
    return $policy ??= (string) (json_decode((string) file_get_contents(__DIR__.'/modules/signage.json'), true, flags: JSON_THROW_ON_ERROR)['resources']['signage_assets']['operations']['delete_policy'] ?? 'delete');
}

function blade_demo_signage_calendar(): CalendarDefinition
{
    // Under `archive` archived assets are no programme choices (the framework Lookup hides them).
    $assets = new Lookup('signage_assets', 'signage_assets', 'id', 'title', hideArchived: blade_demo_signage_policy() === 'archive');
    $playlists = new Lookup('signage_playlists', 'signage_playlists', 'id', 'title');
    // One choice per event: a playlist (`playlist:<id>`) or a single asset (`asset:<id>`), each list ACL-filtered.
    $content = static function (Context $ctx) use ($assets, $playlists): array {
        $out = [];
        foreach ($playlists->options($ctx) as $id => $title) $out['playlist:'.$id] = \Blade\I18n\Translator::text('Lejátszási lista: {title}', ['title' => $title]);
        foreach ($assets->options($ctx) as $id => $title) $out['asset:'.$id] = $title;
        return $out;
    };
    return new CalendarDefinition('signage_schedule', 'Műsorterv', 'signage',
        fields: [new Field('content', 'Tartalom', 'select', required: true, options: $content)],
        firstHour: 6, lastHour: 24,
        dayAction: ['resource' => 'signage_playlist', 'action' => 'day', 'label' => 'Napi műsor (API)'],
        group: 'Digitális kijelző',
        tones: [['field' => 'content', 'prefix' => 'playlist:', 'tone' => 'success']]);
}

/** Most items a playlist holds. */
const BLADE_DEMO_SIGNAGE_PLAYLIST_ITEMS = 200;

/** Named handlers of modules/signage.json. */
function blade_demo_signage_bindings(): array
{
    return [
        // Exactly one of weekday or date, each at most once.
        'signage.default_check' => static function (Context $ctx, string $id): array {
            $q = $ctx->db->prepare('SELECT weekday, date FROM signage_defaults WHERE id = ?');
            $q->execute([$id]);
            [$weekday, $date] = $q->fetch(PDO::FETCH_NUM) ?: ['', ''];
            if (($weekday === '') === ($date === '')) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['weekday' => 'Add meg a hét napját vagy egy dátumot (csak az egyiket).']);
            $column = $weekday !== '' ? 'weekday' : 'date';
            $q = $ctx->db->prepare("SELECT COUNT(*) FROM signage_defaults WHERE $column = ? AND id <> ?");
            $q->execute([$weekday !== '' ? $weekday : $date, $id]);
            if ($q->fetchColumn()) throw new Failure('Javítsd a megjelölt mezőket.', 400, [$column => 'Erre a napra már van alapértelmezett tartalom.']);
            return [];
        },
        // A new playlist item: at most BLADE_DEMO_SIGNAGE_PLAYLIST_ITEMS per playlist (guard; $target is null on create).
        'signage.playlist_item_limit' => static function (Context $ctx, ?array $target, array $values): void {
            if ($target !== null) return;
            $q = $ctx->db->prepare('SELECT COUNT(*) FROM signage_playlist_items WHERE playlist_id = ?');
            $q->execute([(string) ($values['playlist_id'] ?? '')]);
            if ((int) $q->fetchColumn() >= BLADE_DEMO_SIGNAGE_PLAYLIST_ITEMS) throw new Failure('Egy listában legfeljebb '.BLADE_DEMO_SIGNAGE_PLAYLIST_ITEMS.' elem lehet.', 409);
        },
    ];
}

/**
 * References of the signage tables (framework UsageProvider). The owner decision of FB-0063: a deleted file only
 * clears the asset's file reference (the asset stays); a deleted asset removes its day defaults and playlist items and
 * blanks the content of its programme events; a deleted playlist removes its items and blanks its events. The day
 * programme ignores assets without a file and events without content.
 */
final readonly class BladeDemoSignageUsage implements UsageProvider
{
    /**
     * @param 'files'|'events'|'defaults'|'items'|'playlist_items' $kind
     * @param 'asset'|'playlist' $target `events`: which content prefix the deleted ids are
     */
    public function __construct(private string $kind, private string $target = 'asset') {}

    public function usages(Context $ctx, array $ids): array
    {
        [$label, $sql] = match ($this->kind) {
            'files' => ['Médiatár-elemek', 'SELECT file_id, COUNT(*) FROM signage_assets WHERE file_id IN (%s) GROUP BY file_id'],
            'events' => ['Műsorterv-események', "SELECT substr(json_extract(data, '$.content'), ".(strlen($this->target) + 2).'), COUNT(*) FROM blade_calendar_events WHERE space = \'signage\' AND deleted = 0 AND json_extract(data, \'$.content\') IN (%s) GROUP BY 1'],
            'defaults' => ['Alapértelmezett tartalmak', 'SELECT asset_id, COUNT(*) FROM signage_defaults WHERE asset_id IN (%s) GROUP BY asset_id'],
            'items' => ['Lejátszásilista-elemek', 'SELECT asset_id, COUNT(*) FROM signage_playlist_items WHERE asset_id IN (%s) GROUP BY asset_id'],
            'playlist_items' => ['Lejátszásilista-elemek', 'SELECT playlist_id, COUNT(*) FROM signage_playlist_items WHERE playlist_id IN (%s) GROUP BY playlist_id'],
        };
        $out = [];
        foreach (array_chunk($ids, 500) as $chunk) {
            $q = $ctx->db->prepare(sprintf($sql, implode(',', array_fill(0, count($chunk), $this->kind === 'events' ? "'".$this->target.":' || ?" : '?'))));
            $q->execute($chunk);
            foreach ($q->fetchAll(PDO::FETCH_NUM) as [$id, $count]) $out[(string) $id] = [['label' => $label, 'count' => (int) $count]];
        }
        return $out;
    }

    public function clear(Context $ctx, array $ids, string $policy): void
    {
        foreach (array_chunk($ids, 500) as $chunk) {
            $in = implode(',', array_fill(0, count($chunk), '?'));
            match ($this->kind) {
                'files' => $ctx->db->prepare("UPDATE signage_assets SET file_id = '' WHERE file_id IN ($in)")->execute($chunk),
                // A blanked event keeps its slot; its revision changes so an open editor reloads it.
                'events' => $ctx->db->prepare("UPDATE blade_calendar_events SET data = json_set(data, '$.content', ''), revision = revision + 1 WHERE space = 'signage' AND json_extract(data, '$.content') IN (".implode(',', array_fill(0, count($chunk), "'".$this->target.":' || ?")).')')->execute($chunk),
                'defaults' => $ctx->db->prepare("DELETE FROM signage_defaults WHERE asset_id IN ($in)")->execute($chunk),
                'items' => $ctx->db->prepare("DELETE FROM signage_playlist_items WHERE asset_id IN ($in)")->execute($chunk),
                'playlist_items' => $ctx->db->prepare("DELETE FROM signage_playlist_items WHERE playlist_id IN ($in)")->execute($chunk),
            };
        }
    }
}

/** $files: the registered feature-demo file manager (blade_demo_files()), whose Signage mount holds the media. */
function blade_demo_signage_register(Workspace $workspace, FileManagerDefinition $files): void
{
    $calendar = blade_demo_signage_calendar();
    $calendar->register($workspace);
    $workspace->registry->add(new Action('signage_playlist', 'day', 'Napi műsor', [
        new Field('date', 'Dátum', 'date', required: true, max: 10),
    ], static fn(Context $ctx, array $target, array $values): array => blade_demo_signage_playlist($ctx, $calendar, $values['date']), resolve: static fn() => ['id' => null, 'owner' => null], icon: 'dxi dxi-calendar-today'));
    // Toolkit D2: the code of a scene asset for the playlist preview, which runs it in a SandboxFrame. Only a scene file the
    // actor could also read through the file manager (`content_stream` on its mount) is served; nothing else.
    $workspace->registry->add(new Action('signage_playlist', 'scene', 'Jelenet kódja', [
        new Field('asset', 'Tartalom', required: true, max: 18, validation: ['pattern' => ['expression' => '^[1-9][0-9]{0,17}$', 'message' => 'Érvénytelen azonosító.']]),
    ], static function (Context $ctx, array $target, array $values) use ($files, $workspace): array {
        $storage = $files->storage($ctx->db, $workspace->tasks);
        return blade_demo_signage_scene_code($ctx, $storage, new FileMedia($files, $storage), $values['asset']);
    }, resolve: static fn() => ['id' => null, 'owner' => null]));
    // Its panels (app.components.PageLayout): the day's commands above the shared player (frontend/src/player.ts).
    $workspace->registry->addView(new View('demo.playlist-preview', 'demo.playlist-preview', 'Napi műsor', resource: 'signage_playlist',
        actions: ['day', 'scene'], options: ['media' => 'files',
            'layout' => ['rows' => [['id' => 'commands', 'height' => 56], ['id' => 'player', 'header' => 'Előnézet']]]],
        group: 'Digitális kijelző', icon: 'dxi dxi-menu-right'));
    // Usage warnings: deleting a used file (file manager) or asset (Médiatár) shows the counts and clears the references.
    $workspace->registry->usage('files', new BladeDemoSignageUsage('files'));
    $workspace->registry->usage('signage_assets', new BladeDemoSignageUsage('events'));
    $workspace->registry->usage('signage_assets', new BladeDemoSignageUsage('defaults'));
    $workspace->registry->usage('signage_assets', new BladeDemoSignageUsage('items'));
    $workspace->registry->usage('signage_playlists', new BladeDemoSignageUsage('events', 'playlist'));
    $workspace->registry->usage('signage_playlists', new BladeDemoSignageUsage('playlist_items'));
    // Upload as asset in one step: the shared uploader stores each file in the Signage mount and creates an asset.
    $workspace->registry->add(new Action('signage_assets', 'upload_asset', 'Feltöltés', [],
        static fn(Context $ctx, array $target, array $values): array => blade_demo_signage_upload($ctx, $files->files($ctx->db, $workspace->tasks)),
        resolve: static fn() => ['id' => null, 'owner' => null], write: true, icon: 'dxi dxi-file-import',
        upload: new UploadPolicy(array_values(array_intersect($files->allowedExtensions, ['png', 'jpg', 'jpeg', 'mp4', 'webm', 'mp3', 'wav', 'm4a'])), $files->maxSizeBytes, $files->maxFiles,
            duplicatePolicy: 'rename', tempRoot: $files->temporaryRoot())));
    $workspace->registry->appendViewActions('signage_assets', ['upload_asset']);
}

/**
 * One playlist item as stored and sent: asset, optional play time override (seconds, '' = the asset's), optional
 * transition override ('' = the playlist's), on/off switch and an optional validity period (inclusive dates).
 * @return array{asset:string,duration:string,transition:string,enabled:bool,valid_from:string,valid_to:string}
 */
function blade_demo_signage_item(array $row): array
{
    return ['asset' => (string) $row['asset_id'], 'duration' => (string) ($row['duration'] ?? ''), 'transition' => (string) ($row['transition'] ?? ''),
        'enabled' => (string) ($row['enabled'] ?? '1') !== '0', 'valid_from' => (string) ($row['valid_from'] ?? ''), 'valid_to' => (string) ($row['valid_to'] ?? '')];
}

/** Stores every received file in the Signage mount root and creates an asset of it (title: the name without extension, 10 s). */
function blade_demo_signage_upload(Context $ctx, MountStorage $storage): array
{
    $folder = $storage->folder('signage') ?? throw new Failure('A meghajtó nincs előkészítve.', 404);
    $parts = array_values(array_filter($ctx->uploads, static fn($upload) => $upload->field === 'files'));
    if (!$parts) throw new Failure('Válassz feltöltendő fájlt.');
    $insert = $ctx->db->prepare("INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,'10')");
    $assets = $stored = [];
    foreach ($parts as $part) {
        $file = $storage->store($ctx, (string) $folder['id'], $part, ['image', 'video', 'audio']);
        $title = trim(pathinfo($file['name'], PATHINFO_FILENAME));
        $insert->execute([mb_substr($title !== '' ? $title : $file['name'], 0, 120), $file['id']]);
        $assets[] = (string) $ctx->db->lastInsertId();
        $stored[] = $file['id'];
    }
    return ['assets' => $assets, 'audit' => ['assets' => $assets, 'files' => $stored]];
}

/**
 * What plays on one day: the scheduled occurrences and a gap-free 00:00–24:00 timeline in which
 * the latest-starting active programme wins and free time falls back to the default content
 * (a date-specific default before the weekday default).
 */
function blade_demo_signage_playlist(Context $ctx, CalendarDefinition $calendar, string $date): array
{
    $from = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('UTC'));
    if (!$from || $from->format('Y-m-d') !== $date) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['date' => 'Érvénytelen dátum.']);
    $to = $from->modify('+1 day');
    $assets = [];
    // Only assets with a live file play; the type is the file's MIME class (consumer SQL filters archived files itself).
    // The mount is not checked, as the list's `_media`: a referenced file moved out of the Signage mount still exists and
    // still plays; only a new choice must be a file of the Signage mount (the file field rule).
    $q = $ctx->db->query("SELECT a.id, a.title, a.duration, f.id AS file_id, f.name AS file_name, f.mime_type FROM signage_assets a JOIN blade_files f ON f.id = a.file_id AND f.space = 'demo' AND f.kind = 'file' AND f.archived_at IS NULL");
    // A scene file (D2) is its own type `scene`; every other type is the MIME class.
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $row) $assets[(string) $row['id']] = ['id' => (string) $row['id'], 'title' => $row['title'],
        'kind' => $row['mime_type'] === BLADE_DEMO_SIGNAGE_SCENE_TYPE ? 'scene' : strtok((string) $row['mime_type'], '/'), 'duration' => (int) $row['duration'],
        'file' => ['id' => (string) $row['file_id'], 'name' => $row['file_name'], 'mime_type' => $row['mime_type']]];
    $weekday = (int) $from->format('N');
    $q = $ctx->db->prepare("SELECT asset_id, CASE WHEN date = ? THEN 'date' ELSE 'weekday' END FROM signage_defaults WHERE date = ? OR (date = '' AND weekday = ?) ORDER BY date DESC LIMIT 1");
    $q->execute([$date, $date, (string) $weekday]);
    [$defaultId, $defaultSource] = $q->fetch(PDO::FETCH_NUM) ?: [null, null];
    $default = $defaultId !== null ? ($assets[(string) $defaultId] ?? null) : null;
    // Playlists with the items that play on this date (switched on, within their validity), in order (shuffled lists in a
    // stable order per date), each with its own play time (the override or the asset's) and transition (the item's
    // override or the list's); the list loops in its slot.
    $playlists = [];
    foreach ($ctx->db->query('SELECT p.id, p.title, p.transition AS list_transition, p.transition_ms, p.shuffle, i.asset_id, i.duration, i.transition, i.enabled, i.valid_from, i.valid_to FROM signage_playlists p LEFT JOIN signage_playlist_items i ON i.playlist_id = CAST(p.id AS TEXT) ORDER BY p.id, i.position, i.id')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $id = (string) $row['id'];
        $playlists[$id] ??= ['id' => $id, 'title' => $row['title'], 'duration' => 0, 'shuffle' => $row['shuffle'] === '1', 'items' => []];
        if ($row['asset_id'] === null || ($asset = $assets[(string) $row['asset_id']] ?? null) === null) continue;
        $item = blade_demo_signage_item($row);
        if (!$item['enabled'] || ($item['valid_from'] !== '' && $date < $item['valid_from']) || ($item['valid_to'] !== '' && $date > $item['valid_to'])) continue;
        $playlists[$id]['items'][] = [...$asset, 'duration' => $item['duration'] !== '' ? (int) $item['duration'] : $asset['duration'],
            'transition' => ['type' => $item['transition'] !== '' ? $item['transition'] : $row['list_transition'], 'ms' => (int) $row['transition_ms']]];
    }
    foreach ($playlists as &$list) {
        if ($list['shuffle']) { $keys = array_map(static fn($i) => crc32($date.'|'.$list['id'].'|'.$i), array_keys($list['items'])); array_multisort($keys, $list['items']); }
        $list['duration'] = array_sum(array_column($list['items'], 'duration'));
    }
    unset($list);
    $content = static function (array $data) use ($assets, $playlists): array {
        [$type, $id] = explode(':', (string) ($data['content'] ?? ''), 2) + ['', ''];
        $playlist = $type === 'playlist' ? ($playlists[$id] ?? null) : null;
        return ['asset' => $type === 'asset' ? ($assets[$id] ?? null) : null, 'playlist' => $playlist && $playlist['items'] ? $playlist : null];
    };
    // Events without playable content (blanked by a deleted asset or playlist, a deleted file, an empty playlist) are left out.
    $scheduled = array_values(array_filter(array_map(static fn($item) => ['event_id' => $item['id'], 'series_id' => $item['series_id'], 'title' => $item['text'], 'start' => $item['start'], 'end' => $item['end'],
        'recurring' => $item['recurring'], ...$content($item['data'])], $calendar->occurrences($ctx->db, $from, $to)), static fn($entry) => $entry['asset'] !== null || $entry['playlist'] !== null));
    // Segment boundaries in minutes of the day; each segment takes the latest-starting active entry.
    $minute = static fn(string $time) => max(0, min(1440, intdiv((new DateTimeImmutable($time, new DateTimeZone('UTC')))->getTimestamp() - $from->getTimestamp(), 60)));
    $points = [0, 1440];
    foreach ($scheduled as $entry) array_push($points, $minute($entry['start']), $minute($entry['end']));
    $points = array_values(array_unique($points));
    sort($points);
    $clock = static fn(int $m) => sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
    $timeline = [];
    for ($i = 0; $i + 1 < count($points); $i++) {
        [$a, $b] = [$points[$i], $points[$i + 1]];
        $active = null;
        foreach ($scheduled as $index => $entry) if ($minute($entry['start']) <= $a && $minute($entry['end']) >= $b) $active = $index;
        $slot = $active !== null
            ? ['source' => 'schedule', 'event_id' => $scheduled[$active]['event_id'], 'title' => $scheduled[$active]['title'], 'asset' => $scheduled[$active]['asset'], 'playlist' => $scheduled[$active]['playlist']]
            : ['source' => $default ? 'default' : 'none', 'event_id' => null, 'title' => $default['title'] ?? null, 'asset' => $default, 'playlist' => null];
        $last = array_key_last($timeline);
        if ($last !== null && $timeline[$last]['end'] === $clock($a) && $timeline[$last]['source'] === $slot['source'] && $timeline[$last]['event_id'] === $slot['event_id']) $timeline[$last]['end'] = $clock($b);
        else $timeline[] = ['start' => $clock($a), 'end' => $clock($b), ...$slot];
    }
    return ['date' => $date, 'weekday' => $weekday, 'weekday_name' => \Blade\I18n\Translator::text(BLADE_DEMO_SIGNAGE_WEEKDAYS[$weekday]),
        'default' => $default ? [...$default, 'source' => $defaultSource] : null, 'scheduled' => $scheduled, 'timeline' => $timeline];
}

/**
 * The code of the scene asset $asset (toolkit D2): its live file must be one the actor may read through the file manager
 * (`content_stream` on the file's mount, as that action resolves and checks it; otherwise 404, revealing nothing), a scene
 * (BLADE_DEMO_SIGNAGE_SCENE_TYPE) of at most BLADE_DEMO_SIGNAGE_SCENE_BYTES UTF-8 bytes. The browser runs it only in the
 * SandboxFrame, never in the admin origin.
 */
function blade_demo_signage_scene_code(Context $ctx, FileStorage $storage, FileSource $files, string $asset): array
{
    $q = $ctx->db->prepare('SELECT id, title, file_id FROM signage_assets WHERE id = ?');
    $q->execute([$asset]);
    $row = $q->fetch(PDO::FETCH_ASSOC) ?: throw new Failure('A jelenet nem található.', 404);
    $file = preg_match('/^[1-9][0-9]{0,17}$/D', (string) $row['file_id']) ? $storage->entry((int) $row['file_id']) : null;
    if (!$file || $file['kind'] !== 'file' || !$files->allows($ctx, 'content_stream', (string) $file['mount_id'])) throw new Failure('A jelenet nem található.', 404);
    if ($file['mime_type'] !== BLADE_DEMO_SIGNAGE_SCENE_TYPE) throw new Failure('Ez a tartalom nem jelenet.', 415);
    if ((int) $file['size'] > BLADE_DEMO_SIGNAGE_SCENE_BYTES) throw new Failure('A jelenet túl nagy.', 413);
    $code = $storage->content((int) $file['id'], BLADE_DEMO_SIGNAGE_SCENE_BYTES);
    if (!mb_check_encoding($code, 'UTF-8')) throw new Failure('Ez a tartalom nem jelenet.', 415);
    return ['asset' => (string) $row['id'], 'title' => (string) $row['title'], 'name' => (string) $file['name'], 'bytes' => strlen($code), 'code' => $code];
}

/**
 * Idempotent setup: tables, the demo media of the Signage mount (blade_demo_signage_media()) and, on an empty asset
 * table, the sample programme (blade_demo_signage_seed()). Missing media files and asset references outside the
 * Signage mount are reported through $report (default: one stderr line each).
 */
function blade_demo_signage_setup(PDO $db, FileStorage $storage, ?Closure $report = null): void
{
    CalendarDefinition::install($db);
    // `kind` is no longer used (the type comes from the file); the column stays for existing demo data.
    $db->exec("CREATE TABLE IF NOT EXISTS signage_assets(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'image',file_id TEXT NOT NULL DEFAULT '',duration TEXT NOT NULL DEFAULT '10')");
    $db->exec("CREATE TABLE IF NOT EXISTS signage_defaults(id INTEGER PRIMARY KEY AUTOINCREMENT,weekday TEXT NOT NULL DEFAULT '',date TEXT NOT NULL DEFAULT '',asset_id TEXT NOT NULL)");
    $db->exec('CREATE TABLE IF NOT EXISTS signage_playlists(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL)');
    $db->exec("CREATE TABLE IF NOT EXISTS signage_playlist_items(id INTEGER PRIMARY KEY AUTOINCREMENT,playlist_id TEXT NOT NULL,asset_id TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0)");
    $db->exec('CREATE INDEX IF NOT EXISTS signage_playlist_items_list ON signage_playlist_items(playlist_id, position)');
    // Playlist settings and item overrides (added to existing demo databases).
    $columns = static fn(string $table) => array_column($db->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC), 'name');
    foreach (['transition' => "'fade'", 'transition_ms' => "'600'", 'shuffle' => "'0'"] as $column => $default)
        if (!in_array($column, $columns('signage_playlists'), true)) $db->exec("ALTER TABLE signage_playlists ADD COLUMN $column TEXT NOT NULL DEFAULT $default");
    foreach (['duration' => "''", 'transition' => "''", 'enabled' => "'1'", 'valid_from' => "''", 'valid_to' => "''"] as $column => $default)
        if (!in_array($column, $columns('signage_playlist_items'), true)) $db->exec("ALTER TABLE signage_playlist_items ADD COLUMN $column TEXT NOT NULL DEFAULT $default");
    // Events of the single-asset programme (`asset_id`) take the content field (`asset:<id>`, blank stays blank).
    $db->exec("UPDATE blade_calendar_events SET data = json_remove(json_set(data, '$.content', CASE WHEN json_extract(data, '$.asset_id') = '' THEN '' ELSE 'asset:' || json_extract(data, '$.asset_id') END), '$.asset_id'), revision = revision + 1
        WHERE space = 'signage' AND json_type(data, '$.asset_id') IS NOT NULL AND json_type(data, '$.content') IS NULL");
    $report ??= static function (string $line): void { fwrite(STDERR, $line."\n"); };
    $fresh = !$db->query('SELECT COUNT(*) FROM signage_assets')->fetchColumn();
    $assets = blade_demo_signage_media($db, $storage, $report);
    if ($fresh) blade_demo_signage_seed($db, $assets);
    foreach (blade_demo_signage_outside($db) as $row) $report(sprintf('Signage: asset #%s (%s) references file #%s in mount "%s", outside the Signage mount; left in place.', $row['asset'], $row['title'], $row['file'], $row['mount']));
}

/**
 * Assets whose live file lies outside the Signage mount (user data from before U5, or files moved away later). They
 * keep playing; a new choice in the form must be a Signage file.
 * @return list<array{asset:string,title:string,file:string,mount:string}>
 */
function blade_demo_signage_outside(PDO $db): array
{
    $q = $db->query("SELECT a.id AS asset, a.title, f.id AS file, f.mount_id AS mount FROM signage_assets a JOIN blade_files f ON f.id = a.file_id
        WHERE f.space = 'demo' AND f.kind = 'file' AND f.archived_at IS NULL AND f.mount_id <> 'signage' ORDER BY a.id");
    return array_map(static fn($row) => array_map('strval', $row), $q->fetchAll(PDO::FETCH_ASSOC));
}

/**
 * Media files of the demo, kept out of Git (docs/demos.md#signage-media): generated images, stock videos and music. The
 * brand scene is source code and lives in resources/files.
 */
const BLADE_DEMO_SIGNAGE_MEDIA_DIR = __DIR__.'/resources/media';

/** Demo media: file name (media directory and Signage mount root) => [asset title, stored MIME type, play time in seconds]. */
const BLADE_DEMO_SIGNAGE_MEDIA = [
    'Kézműves kávé, lassú reggelek.png' => ['Kézműves kávé, lassú reggelek', 'image/png', 10],
    'Dinamikus futócipő kobalt és lime színekben.png' => ['Dinamikus futócipő kobalt és lime színekben', 'image/png', 10],
    'Narancsos pezsgés kobaltkékben.png' => ['Narancsos pezsgés kobaltkékben', 'image/png', 10],
    'Az idő elegáns pillanata.png' => ['Az idő elegáns pillanata', 'image/png', 10],
    'Jövőformák krómba öntve.png' => ['Jövőformák krómba öntve', 'image/png', 10],
    'Asztronauta a törött orbitális gyűrűnél.png' => ['Asztronauta a törött orbitális gyűrűnél', 'image/png', 10],
    'Elektronikus fesztivál fényárban.png' => ['Elektronikus fesztivál fényárban', 'image/png', 10],
    'Rókafeltaláló a lebegő kertben.png' => ['Rókafeltaláló a lebegő kertben', 'image/png', 10],
    'Éjszakai falatok a folyóparton.png' => ['Éjszakai falatok a folyóparton', 'image/png', 10],
    'Éjszakai komp a ködben.png' => ['Éjszakai komp a ködben', 'image/png', 10],
    '3d-logointro.mp4' => ['3D logóintró', 'video/mp4', 13],
    'black-friday-neon.mp4' => ['Black Friday neon', 'video/mp4', 10],
    'irodahaz-alkonyatkor.mp4' => ['Irodaház alkonyatkor', 'video/mp4', 60],
    'setaloutca.mp4' => ['Napsütéses sétálóutca', 'video/mp4', 13],
    'nyugodt-zene.mp3' => ['Nyugodt zene', 'audio/mpeg', 182],
    'izgalmas-zene.mp3' => ['Izgalmas zene', 'audio/mpeg', 170],
    'vidam-zene.mp3' => ['Vidám zene', 'audio/mpeg', 180],
    'dramai-zene.mp3' => ['Drámai zene', 'audio/mpeg', 179],
];

/** Endless brand scene (resources/files/blade-brand.js): file name, asset title, loop length. */
const BLADE_DEMO_SIGNAGE_BRAND = ['blade-brand.js', 'Blade brand animáció', 20];

/**
 * The demo media and the brand scene in the Signage mount root, also for an existing demo database: keyed by file
 * name, a missing file is stored from the media directory (a missing source is reported and skipped) and a file no
 * asset references gets its asset. A rerun adds only what is missing; nothing else is changed or deleted.
 * @return array<string,string> file name => asset id, for every file present
 */
function blade_demo_signage_media(PDO $db, FileStorage $storage, Closure $report): array
{
    $root = $storage->root('signage') ?? $storage->entry($storage->ensureRoot('signage'));
    [$brand, $brandTitle, $brandSeconds] = BLADE_DEMO_SIGNAGE_BRAND;
    $media = [$brand => [$brandTitle, BLADE_DEMO_SIGNAGE_SCENE_TYPE, $brandSeconds, __DIR__.'/resources/files/'.$brand]];
    foreach (BLADE_DEMO_SIGNAGE_MEDIA as $name => [$title, $mime, $seconds]) $media[$name] = [$title, $mime, $seconds, BLADE_DEMO_SIGNAGE_MEDIA_DIR.'/'.$name];
    $used = $db->prepare('SELECT id FROM signage_assets WHERE file_id = ? ORDER BY id LIMIT 1');
    $insert = $db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)');
    $assets = [];
    foreach ($media as $name => [$title, $mime, $seconds, $source]) {
        $file = $storage->child((int) $root['id'], $name);
        if ($file && $file['kind'] !== 'file') continue;
        if (!$file && !is_file($source)) {
            $report(sprintf('Signage: media file "%s" is missing from %s; skipped.', $name, dirname($source)));
            continue;
        }
        $id = (string) ($file['id'] ?? $storage->createFile($root, $name, $mime, $source));
        $used->execute([$id]);
        $asset = $used->fetchColumn();
        if ($asset === false) {
            $insert->execute([$title, $id, (string) $seconds]);
            $asset = $db->lastInsertId();
        }
        $assets[$name] = (string) $asset;
    }
    return $assets;
}

/**
 * Sample programme over the demo media ($assets: file name => asset id; absent media are left out): four playlists,
 * the brand scene as the default of every weekday, weekday and weekend blocks from this week's Monday.
 */
function blade_demo_signage_seed(PDO $db, array $assets): void
{
    // Key => [title, transition, items: file name or [file name, transition override]]
    $lists = [
        'morning' => ['Reggeli lista', 'fade', ['Kézműves kávé, lassú reggelek.png', 'Dinamikus futócipő kobalt és lime színekben.png', 'Narancsos pezsgés kobaltkékben.png', 'Az idő elegáns pillanata.png', 'blade-brand.js']],
        'day' => ['Napközbeni lista', 'fade', ['Jövőformák krómba öntve.png', '3d-logointro.mp4', 'black-friday-neon.mp4', 'irodahaz-alkonyatkor.mp4', 'setaloutca.mp4']],
        'evening' => ['Esti lista', 'slide', ['Asztronauta a törött orbitális gyűrűnél.png', ['Elektronikus fesztivál fényárban.png', 'zoom'], 'Rókafeltaláló a lebegő kertben.png', 'Éjszakai falatok a folyóparton.png', 'Éjszakai komp a ködben.png']],
        'weekend' => ['Hétvégi lista', 'slide', ['Kézműves kávé, lassú reggelek.png', '3d-logointro.mp4', 'Rókafeltaláló a lebegő kertben.png', ['Elektronikus fesztivál fényárban.png', 'zoom'], 'Éjszakai falatok a folyóparton.png', ['Dinamikus futócipő kobalt és lime színekben.png', 'zoom']]],
    ];
    $playlist = $db->prepare("INSERT INTO signage_playlists(title,transition,transition_ms,shuffle) VALUES (?,?,'600','0')");
    $item = $db->prepare('INSERT INTO signage_playlist_items(playlist_id,asset_id,position,transition) VALUES (?,?,?,?)');
    $ids = [];
    foreach ($lists as $key => [$title, $transition, $names]) {
        $playlist->execute([$title, $transition]);
        $ids[$key] = (string) $db->lastInsertId();
        $position = 0;
        foreach ($names as $entry) {
            [$name, $override] = (array) $entry + [1 => ''];
            if (isset($assets[$name])) $item->execute([$ids[$key], $assets[$name], $position++, $override]);
        }
    }
    $brand = $assets[BLADE_DEMO_SIGNAGE_BRAND[0]] ?? null;
    $default = $db->prepare("INSERT INTO signage_defaults(weekday,date,asset_id) VALUES (?,'',?)");
    if ($brand !== null) foreach (array_keys(BLADE_DEMO_SIGNAGE_WEEKDAYS) as $day) $default->execute([(string) $day, $brand]);
    $event = $db->prepare("INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,data) VALUES ('signage',?,?,'9999-02-01 00:00:00',?,?,?)");
    $monday = (new DateTimeImmutable('monday this week'))->format('Y-m-d');
    $weekdays = 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR';
    $weekend = 'FREQ=WEEKLY;INTERVAL=1;BYDAY=SA,SU';
    // [title, start, hours, recurrence, content]
    foreach ([
        ['Reggeli lista', '06:00', 4, $weekdays, 'playlist:'.$ids['morning']],
        ['Arculati animáció', '10:00', 2, $weekdays, $brand !== null ? 'asset:'.$brand : null],
        ['Napközbeni lista', '12:00', 5, $weekdays, 'playlist:'.$ids['day']],
        ['Narancsos pezsgés', '17:00', 1, $weekdays, isset($assets['Narancsos pezsgés kobaltkékben.png']) ? 'asset:'.$assets['Narancsos pezsgés kobaltkékben.png'] : null],
        ['Esti lista', '18:00', 4, $weekdays, 'playlist:'.$ids['evening']],
        ['Reggeli lista', '06:00', 4, $weekend, 'playlist:'.$ids['morning']],
        ['Hétvégi lista', '10:00', 8, $weekend, 'playlist:'.$ids['weekend']],
        ['Esti lista', '18:00', 4, $weekend, 'playlist:'.$ids['evening']],
    ] as [$title, $start, $hours, $rule, $content]) {
        if ($content !== null) $event->execute([$title, "$monday $start:00", $rule, $hours * 3600, json_encode(['content' => $content], JSON_THROW_ON_ERROR)]);
    }
}

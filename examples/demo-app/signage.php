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
    return new CalendarDefinition('signage_schedule', 'Műsorterv', 'signage',
        fields: [new Field('asset_id', 'Tartalom', 'select', required: true, options: $assets->options(...))],
        firstHour: 6, lastHour: 24,
        dayAction: ['resource' => 'signage_playlist', 'action' => 'day', 'label' => 'Napi műsor (API)'],
        group: 'Digitális kijelző');
}

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
            if ($date !== '' && (!($parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date)) || $parsed->format('Y-m-d') !== $date)) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['date' => 'Érvénytelen dátum.']);
            $column = $weekday !== '' ? 'weekday' : 'date';
            $q = $ctx->db->prepare("SELECT COUNT(*) FROM signage_defaults WHERE $column = ? AND id <> ?");
            $q->execute([$weekday !== '' ? $weekday : $date, $id]);
            if ($q->fetchColumn()) throw new Failure('Javítsd a megjelölt mezőket.', 400, [$column => 'Erre a napra már van alapértelmezett tartalom.']);
            return [];
        },
    ];
}

/**
 * References of the signage tables (framework UsageProvider). The owner decision of FB-0063: a deleted file only
 * clears the asset's file reference (the asset stays); a deleted asset removes its day defaults and blanks the
 * asset of its programme events. The playlist ignores assets without a file and events without an asset.
 */
final readonly class BladeDemoSignageUsage implements UsageProvider
{
    /** @param 'files'|'events'|'defaults' $kind */
    public function __construct(private string $kind) {}

    public function usages(Context $ctx, array $ids): array
    {
        [$label, $sql] = match ($this->kind) {
            'files' => ['Médiatár-elemek', 'SELECT file_id, COUNT(*) FROM signage_assets WHERE file_id IN (%s) GROUP BY file_id'],
            'events' => ['Műsorterv-események', "SELECT json_extract(data, '$.asset_id'), COUNT(*) FROM blade_calendar_events WHERE space = 'signage' AND deleted = 0 AND json_extract(data, '$.asset_id') IN (%s) GROUP BY 1"],
            'defaults' => ['Alapértelmezett tartalmak', 'SELECT asset_id, COUNT(*) FROM signage_defaults WHERE asset_id IN (%s) GROUP BY asset_id'],
        };
        $out = [];
        foreach (array_chunk($ids, 500) as $chunk) {
            $q = $ctx->db->prepare(sprintf($sql, implode(',', array_fill(0, count($chunk), '?'))));
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
                'events' => $ctx->db->prepare("UPDATE blade_calendar_events SET data = json_set(data, '$.asset_id', ''), revision = revision + 1 WHERE space = 'signage' AND json_extract(data, '$.asset_id') IN ($in)")->execute($chunk),
                'defaults' => $ctx->db->prepare("DELETE FROM signage_defaults WHERE asset_id IN ($in)")->execute($chunk),
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
        new Field('date', 'Dátum', required: true, max: 10, validation: ['pattern' => ['expression' => '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', 'message' => 'Formátum: ÉÉÉÉ-HH-NN.']]),
    ], static fn(Context $ctx, array $target, array $values): array => blade_demo_signage_playlist($ctx, $calendar, $values['date']), resolve: static fn() => ['id' => null, 'owner' => null]));
    // Toolkit D2: the code of a scene asset for the playlist preview, which runs it in a SandboxFrame. Only a scene file the
    // actor could also read through the file manager (`content_stream` on its mount) is served; nothing else.
    $workspace->registry->add(new Action('signage_playlist', 'scene', 'Jelenet kódja', [
        new Field('asset', 'Tartalom', required: true, max: 18, validation: ['pattern' => ['expression' => '^[1-9][0-9]{0,17}$', 'message' => 'Érvénytelen azonosító.']]),
    ], static function (Context $ctx, array $target, array $values) use ($files, $workspace): array {
        $storage = $files->storage($ctx->db, $workspace->tasks);
        return blade_demo_signage_scene_code($ctx, $storage, new FileMedia($files, $storage), $values['asset']);
    }, resolve: static fn() => ['id' => null, 'owner' => null]));
    $workspace->registry->addView(new View('demo.playlist-preview', 'demo.playlist-preview', 'Napi műsor', resource: 'signage_playlist',
        actions: ['day', 'scene'], options: ['media' => 'files'], group: 'Digitális kijelző', icon: 'dxi dxi-menu-right'));
    // Usage warnings: deleting a used file (file manager) or asset (Médiatár) shows the counts and clears the references.
    $workspace->registry->usage('files', new BladeDemoSignageUsage('files'));
    $workspace->registry->usage('signage_assets', new BladeDemoSignageUsage('events'));
    $workspace->registry->usage('signage_assets', new BladeDemoSignageUsage('defaults'));
    // Upload as asset in one step: the shared uploader stores each file in the Signage mount and creates an asset.
    $workspace->registry->add(new Action('signage_assets', 'upload_asset', 'Feltöltés', [],
        static fn(Context $ctx, array $target, array $values): array => blade_demo_signage_upload($ctx, $files->files($ctx->db, $workspace->tasks)),
        resolve: static fn() => ['id' => null, 'owner' => null], write: true, icon: 'dxi dxi-file-import',
        upload: new UploadPolicy(array_values(array_intersect($files->allowedExtensions, ['png', 'jpg', 'jpeg', 'mp4', 'webm', 'mp3', 'wav', 'm4a'])), $files->maxSizeBytes, $files->maxFiles,
            duplicatePolicy: 'rename', tempRoot: $files->temporaryRoot())));
    $workspace->registry->appendViewActions('signage_assets', ['upload_asset']);
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
    // Events without a playable asset (blanked by a deleted asset, or its file deleted) are left out.
    $scheduled = array_values(array_filter(array_map(static fn($item) => ['event_id' => $item['id'], 'series_id' => $item['series_id'], 'title' => $item['text'], 'start' => $item['start'], 'end' => $item['end'],
        'recurring' => $item['recurring'], 'asset' => $assets[(string) ($item['data']['asset_id'] ?? '')] ?? null], $calendar->occurrences($ctx->db, $from, $to)), static fn($entry) => $entry['asset'] !== null));
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
            ? ['source' => 'schedule', 'event_id' => $scheduled[$active]['event_id'], 'title' => $scheduled[$active]['title'], 'asset' => $scheduled[$active]['asset']]
            : ['source' => $default ? 'default' : 'none', 'event_id' => null, 'title' => $default['title'] ?? null, 'asset' => $default];
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
 * Idempotent synthetic setup: tables, assets over the seeded media, weekday defaults and a sample programme; then the
 * seeded asset files move into the Signage mount root (blade_demo_signage_media()), the audio fixtures are added
 * (blade_demo_signage_audio()) and the scene fixture with its daily slot (blade_demo_signage_scene()). Asset references to other files
 * outside the Signage mount are reported through $report (default: one stderr line each), never moved.
 */
function blade_demo_signage_setup(PDO $db, FileStorage $storage, ?Closure $report = null): void
{
    CalendarDefinition::install($db);
    // `kind` is no longer used (the type comes from the file); the column stays for existing demo data.
    $db->exec("CREATE TABLE IF NOT EXISTS signage_assets(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'image',file_id TEXT NOT NULL DEFAULT '',duration TEXT NOT NULL DEFAULT '10')");
    $db->exec("CREATE TABLE IF NOT EXISTS signage_defaults(id INTEGER PRIMARY KEY AUTOINCREMENT,weekday TEXT NOT NULL DEFAULT '',date TEXT NOT NULL DEFAULT '',asset_id TEXT NOT NULL)");
    if (!$db->query('SELECT COUNT(*) FROM signage_assets')->fetchColumn()) blade_demo_signage_seed($db);
    blade_demo_signage_media($db, $storage);
    blade_demo_signage_audio($db, $storage);
    blade_demo_signage_scene($db, $storage);
    $report ??= static function (string $line): void { fwrite(STDERR, $line."\n"); };
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
 * Moves the four seeded media files (Drive A Képek/logo.png, foto.jpg and Média/minta-fraktal.jpg, minta-video.webm)
 * that assets reference into the Signage mount root. Ids stay, so every reference stays valid; other files, and
 * files already moved, are untouched; a taken name gets a free one.
 */
function blade_demo_signage_media(PDO $db, FileStorage $storage): void
{
    $root = $storage->root('signage') ?? $storage->entry($storage->ensureRoot('signage'));
    $q = $db->query("SELECT DISTINCT f.id FROM signage_assets a JOIN blade_files f ON f.id = a.file_id JOIN blade_files p ON p.id = f.parent_id
        WHERE f.space = 'demo' AND f.kind = 'file' AND f.archived_at IS NULL AND f.mount_id = 'a' AND p.mount_id = 'a' AND p.archived_at IS NULL
        AND ((p.name = 'Képek' AND f.name IN ('logo.png', 'foto.jpg')) OR (p.name = 'Média' AND f.name IN ('minta-fraktal.jpg', 'minta-video.webm')))");
    $ids = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
    if (!$ids) return;
    $db->beginTransaction();
    try {
        foreach ($ids as $id) {
            $row = $storage->entry($id);
            if (!$row) continue;
            $name = $storage->child((int) $root['id'], $row['name']) ? $storage->freeName((int) $root['id'], $row['name'], 'file') : $row['name'];
            $storage->moveTree([[...$row, 'relative' => 0]], $root, $name);
        }
        $db->commit();
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }
    // A move keeps ready thumbnails current; one still queued for the pre-move revision (fresh setup) is queued again.
    $storage->thumbnails(array_values(array_filter(array_map($storage->entry(...), $ids))));
    $storage->tasks->flush();
}

/** Synthetic audio fixtures (generated sine tones, resources/files/minta-hang.*): file name => [asset title, stored MIME type, play time]. */
const BLADE_DEMO_SIGNAGE_AUDIO = [
    'minta-hang.wav' => ['Szinuszhang 440 Hz (WAV)', 'audio/wav', 3],
    'minta-hang.mp3' => ['Szinuszhang 660 Hz (MP3)', 'audio/mpeg', 4],
    'minta-hang.m4a' => ['Szinuszhang 880 Hz (M4A)', 'audio/mp4', 5],
];

/**
 * Audio assets beside the seeded images and videos, also for an existing demo database (the seed runs only on an empty
 * table): keyed by the fixture's file name in the Signage mount root, a missing file is stored and a file no asset
 * references gets its asset. A rerun adds only what is missing; nothing else is changed or deleted.
 */
function blade_demo_signage_audio(PDO $db, FileStorage $storage): void
{
    $root = $storage->root('signage') ?? $storage->entry($storage->ensureRoot('signage'));
    $used = $db->prepare('SELECT COUNT(*) FROM signage_assets WHERE file_id = ?');
    $asset = $db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)');
    foreach (BLADE_DEMO_SIGNAGE_AUDIO as $name => [$title, $mime, $seconds]) {
        $file = $storage->child((int) $root['id'], $name);
        if ($file && $file['kind'] !== 'file') continue;
        $id = (string) ($file['id'] ?? $storage->createFile($root, $name, $mime, __DIR__.'/resources/files/'.$name));
        $used->execute([$id]);
        if (!$used->fetchColumn()) $asset->execute([$title, $id, (string) $seconds]);
    }
}

/** Synthetic scene fixture (toolkit D2, resources/files/minta-jelenet.js): file name, asset title, play time, daily slot title. */
const BLADE_DEMO_SIGNAGE_SCENE = ['minta-jelenet.js', 'Animált jelenet', 12, 'Esti jelenet'];

/**
 * The scene asset beside the media assets, also for an existing demo database: keyed by the fixture's file name in the
 * Signage mount root, a missing file is stored, a file no asset references gets its asset, and an asset no live
 * programme event references gets a daily 20:00–21:00 event from this week's Monday. A rerun adds only what is
 * missing; nothing else is changed or deleted.
 */
function blade_demo_signage_scene(PDO $db, FileStorage $storage): void
{
    [$name, $title, $seconds, $slot] = BLADE_DEMO_SIGNAGE_SCENE;
    $root = $storage->root('signage') ?? $storage->entry($storage->ensureRoot('signage'));
    $file = $storage->child((int) $root['id'], $name);
    if ($file && $file['kind'] !== 'file') return;
    $id = (string) ($file['id'] ?? $storage->createFile($root, $name, BLADE_DEMO_SIGNAGE_SCENE_TYPE, __DIR__.'/resources/files/'.$name));
    $q = $db->prepare('SELECT id FROM signage_assets WHERE file_id = ? ORDER BY id LIMIT 1');
    $q->execute([$id]);
    $asset = $q->fetchColumn();
    if ($asset === false) {
        $db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)')->execute([$title, $id, (string) $seconds]);
        $asset = $db->lastInsertId();
    }
    $q = $db->prepare("SELECT COUNT(*) FROM blade_calendar_events WHERE space = 'signage' AND deleted = 0 AND json_extract(data, '$.asset_id') = ?");
    $q->execute([(string) $asset]);
    if ($q->fetchColumn()) return;
    $monday = (new DateTimeImmutable('monday this week'))->format('Y-m-d');
    $db->prepare('INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,data) VALUES (?,?,?,?,?,?,?)')
        ->execute(['signage', $slot, "$monday 20:00:00", '9999-02-01 00:00:00', 'FREQ=DAILY;INTERVAL=1', 3600, json_encode(['asset_id' => (string) $asset], JSON_THROW_ON_ERROR)]);
}

function blade_demo_signage_seed(PDO $db): void
{
    $file = static function (string $name) use ($db): string {
        $q = $db->prepare("SELECT id FROM blade_files WHERE space = 'demo' AND name = ? AND kind = 'file' ORDER BY id LIMIT 1");
        $q->execute([$name]);
        return (string) $q->fetchColumn();
    };
    $asset = $db->prepare('INSERT INTO signage_assets(title,file_id,duration) VALUES (?,?,?)');
    $ids = [];
    foreach (['brand' => ['Arculati háttérkép', 'minta-fraktal.jpg', 15], 'promo' => ['Promóciós videó', 'minta-video.webm', 30], 'logo' => ['Logó állókép', 'logo.png', 10], 'poster' => ['Fotó plakát', 'foto.jpg', 20]] as $key => $row) {
        $asset->execute([$row[0], $file($row[1]), $row[2]]);
        $ids[$key] = (string) $db->lastInsertId();
    }
    $default = $db->prepare("INSERT INTO signage_defaults(weekday,date,asset_id) VALUES (?,?,?)");
    foreach (range(1, 7) as $day) $default->execute([(string) $day, '', $ids[$day >= 6 ? 'poster' : 'brand']]);
    $event = $db->prepare('INSERT INTO blade_calendar_events(space,text,start_at,end_at,rrule,duration,data) VALUES (?,?,?,?,?,?,?)');
    $monday = (new DateTimeImmutable('monday this week'))->format('Y-m-d');
    $data = static fn(string $id) => json_encode(['asset_id' => $id], JSON_THROW_ON_ERROR);
    // Weekday morning promo (recurring), a weekly Friday afternoon block and a one-off event this week.
    $event->execute(['signage', 'Reggeli promó', "$monday 08:00:00", '9999-02-01 00:00:00', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR', 7200, $data($ids['promo'])]);
    $event->execute(['signage', 'Pénteki logóblokk', "$monday 14:00:00", '9999-02-01 00:00:00', 'FREQ=WEEKLY;INTERVAL=1;BYDAY=FR', 10800, $data($ids['logo'])]);
    $day = (new DateTimeImmutable($monday))->modify('+2 days')->format('Y-m-d');
    $event->execute(['signage', 'Rendezvény plakát', "$day 09:00:00", "$day 12:00:00", '', 0, $data($ids['poster'])]);
}

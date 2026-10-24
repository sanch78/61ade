<?php
declare(strict_types=1);

/*
 * Feature-demo digital signage (DMS) scheduler: synthetic consumer configuration of the framework
 * event calendar. Assets and per-day defaults are a JSON module (modules/signage.json); the
 * programme is a Blade\Calendar\CalendarDefinition; `signage_playlist.day` answers what plays
 * on a given date, on the UI and API channels.
 */

use Blade\Calendar\CalendarDefinition;
use Blade\Feature\{Action, Context, Failure, Field, Lookup, Workspace};

const BLADE_DEMO_SIGNAGE_WEEKDAYS = [1 => 'Hétfő', 2 => 'Kedd', 3 => 'Szerda', 4 => 'Csütörtök', 5 => 'Péntek', 6 => 'Szombat', 7 => 'Vasárnap'];

function blade_demo_signage_calendar(): CalendarDefinition
{
    return new CalendarDefinition('signage_schedule', 'Műsorterv', 'signage',
        fields: [new Field('asset_id', 'Tartalom', 'select', required: true, options: (new Lookup('signage_assets', 'signage_assets', 'id', 'title'))->options(...))],
        firstHour: 6, lastHour: 24,
        dayAction: ['resource' => 'signage_playlist', 'action' => 'day', 'label' => 'Napi műsor (API)'],
        group: 'Digitális kijelző');
}

/** Named handlers of modules/signage.json. */
function blade_demo_signage_bindings(): array
{
    return [
        // Image and video files of the demo file manager the actor may view.
        'signage.media_files' => static function (Context $ctx): array {
            $q = $ctx->db->query("SELECT id, mount_id, name FROM blade_files WHERE space = 'demo' AND kind = 'file' AND (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%') ORDER BY name, id LIMIT 500");
            $out = [];
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $row) if ($ctx->acl->allows($ctx->actor->id, 'files', 'content_get', $ctx->channel, $row['mount_id'])) $out[(string) $row['id']] = $row['name'];
            return $out;
        },
        // The asset type must match the referenced file.
        'signage.asset_check' => static function (Context $ctx, string $id): array {
            $q = $ctx->db->prepare('SELECT a.kind, f.mime_type FROM signage_assets a LEFT JOIN blade_files f ON f.id = a.file_id WHERE a.id = ?');
            $q->execute([$id]);
            [$kind, $mime] = $q->fetch(PDO::FETCH_NUM) ?: ['', null];
            if (!str_starts_with((string) $mime, $kind.'/')) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['file_id' => 'A fájl típusa nem egyezik az asset típusával.']);
            return [];
        },
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

function blade_demo_signage_register(Workspace $workspace): void
{
    $calendar = blade_demo_signage_calendar();
    $calendar->register($workspace);
    $workspace->registry->add(new Action('signage_playlist', 'day', 'Napi műsor', [
        new Field('date', 'Dátum', required: true, max: 10, validation: ['pattern' => ['expression' => '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', 'message' => 'Formátum: ÉÉÉÉ-HH-NN.']]),
    ], static fn(Context $ctx, array $target, array $values): array => blade_demo_signage_playlist($ctx, $calendar, $values['date']), resolve: static fn() => ['id' => null, 'owner' => null]));
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
    $q = $ctx->db->query('SELECT a.id, a.title, a.kind, a.duration, f.id AS file_id, f.name AS file_name, f.mime_type FROM signage_assets a LEFT JOIN blade_files f ON f.id = a.file_id');
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $row) $assets[(string) $row['id']] = ['id' => (string) $row['id'], 'title' => $row['title'], 'kind' => $row['kind'], 'duration' => (int) $row['duration'],
        'file' => $row['file_id'] !== null ? ['id' => (string) $row['file_id'], 'name' => $row['file_name'], 'mime_type' => $row['mime_type']] : null];
    $weekday = (int) $from->format('N');
    $q = $ctx->db->prepare("SELECT asset_id, CASE WHEN date = ? THEN 'date' ELSE 'weekday' END FROM signage_defaults WHERE date = ? OR (date = '' AND weekday = ?) ORDER BY date DESC LIMIT 1");
    $q->execute([$date, $date, (string) $weekday]);
    [$defaultId, $defaultSource] = $q->fetch(PDO::FETCH_NUM) ?: [null, null];
    $default = $defaultId !== null ? ($assets[(string) $defaultId] ?? null) : null;
    $scheduled = array_map(static fn($item) => ['event_id' => $item['id'], 'series_id' => $item['series_id'], 'title' => $item['text'], 'start' => $item['start'], 'end' => $item['end'],
        'recurring' => $item['recurring'], 'asset' => $assets[(string) ($item['data']['asset_id'] ?? '')] ?? null], $calendar->occurrences($ctx->db, $from, $to));
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

/** Idempotent synthetic setup: tables, assets over the seeded media, weekday defaults and a sample programme. */
function blade_demo_signage_setup(PDO $db): void
{
    CalendarDefinition::install($db);
    $db->exec("CREATE TABLE IF NOT EXISTS signage_assets(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'image',file_id TEXT NOT NULL DEFAULT '',duration TEXT NOT NULL DEFAULT '10')");
    $db->exec("CREATE TABLE IF NOT EXISTS signage_defaults(id INTEGER PRIMARY KEY AUTOINCREMENT,weekday TEXT NOT NULL DEFAULT '',date TEXT NOT NULL DEFAULT '',asset_id TEXT NOT NULL)");
    if ($db->query('SELECT COUNT(*) FROM signage_assets')->fetchColumn()) return;
    $file = static function (string $name) use ($db): string {
        $q = $db->prepare("SELECT id FROM blade_files WHERE space = 'demo' AND name = ? AND kind = 'file' ORDER BY id LIMIT 1");
        $q->execute([$name]);
        return (string) $q->fetchColumn();
    };
    $asset = $db->prepare('INSERT INTO signage_assets(title,kind,file_id,duration) VALUES (?,?,?,?)');
    $ids = [];
    foreach (['brand' => ['Arculati háttérkép', 'image', 'minta-fraktal.jpg', 15], 'promo' => ['Promóciós videó', 'video', 'minta-video.webm', 30], 'logo' => ['Logó állókép', 'image', 'logo.png', 10], 'poster' => ['Fotó plakát', 'image', 'foto.jpg', 20]] as $key => $row) {
        $asset->execute([$row[0], $row[1], $file($row[2]), $row[3]]);
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

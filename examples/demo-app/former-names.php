<?php
declare(strict_types=1);
/**
 * Earlier demo databases (FB-0114): the synthetic seed was Hungarian and is English now. Setup renames former seed
 * values in place, so an existing instance (the shared `web` one) matches a fresh one without losing what it gathered.
 * Only exact former values change: a record, file or diagram edited by hand keeps its text. A rerun changes nothing.
 * The signage media keep their own map (BLADE_DEMO_SIGNAGE_FORMER in signage.php).
 */

use Blade\Diagram\DiagramStorage;
use Blade\Files\FileStorage;

/** Feature demo rows: table => [column => [former => English]]; missing tables (a fresh database) are skipped. */
const BLADE_DEMO_FORMER_ROWS = [
    'demo_catalog' => [
        'title' => ['Kör' => 'Circle', 'Négyzet' => 'Square', 'Háromszög' => 'Triangle', 'Széles' => 'Wide', 'Hiányzó fájl' => 'Missing file',
            'Szülő könyvtár' => 'Parent directory', 'Könyvtár' => 'Directory', 'Séma' => 'Scheme', 'Kiterjesztés' => 'Extension'],
        'note' => ['Négyzetes kép' => 'Square image', 'Fekvő kép, nincs vágás' => 'Landscape image, not cropped', 'Helykitöltő jelenik meg' => 'Shows the placeholder', 'Nem jelenik meg' => 'Not shown'],
    ],
    'demo_shelves' => [
        'title' => ['Felső polc' => 'Top shelf', 'Középső polc' => 'Middle shelf', 'Üres polc' => 'Empty shelf'],
        'note' => ['Két tétel' => 'Two items', 'Egy tétel' => 'One item', 'Nincs tétele' => 'No items'],
    ],
    'demo_shelf_items' => ['title' => ['Doboz' => 'Box', 'Tégely' => 'Jar', 'Kosár' => 'Basket']],
    'demo_shelf_zones' => ['title' => ['A zóna' => 'Zone A', 'B zóna' => 'Zone B', 'C zóna' => 'Zone C']],
    'signage_playlists' => ['title' => ['Reggeli lista' => 'Morning playlist', 'Napközbeni lista' => 'Daytime playlist', 'Esti lista' => 'Evening playlist', 'Hétvégi lista' => 'Weekend playlist']],
    'blade_calendar_events' => ['text' => ['Reggeli lista' => 'Morning playlist', 'Napközbeni lista' => 'Daytime playlist', 'Esti lista' => 'Evening playlist', 'Hétvégi lista' => 'Weekend playlist',
        'Arculati animáció' => 'Brand animation', 'Narancsos pezsgés' => 'Orange fizz']],
    'blade_roles' => ['name' => ['Adminisztrátor' => 'Administrator']],
];

/** Tenant demo rows, as BLADE_DEMO_FORMER_ROWS. */
const BLADE_DEMO_FORMER_TENANT_ROWS = [
    'blade_tenants' => ['name' => ['Alfa' => 'Alpha', 'Béta' => 'Beta']],
    'tenant_projects' => ['title' => ['Alfa kutatás' => 'Alpha research', 'Alfa karbantartás' => 'Alpha maintenance', 'Béta bevezetés' => 'Beta rollout']],
    'tenant_tasks' => ['title' => ['Alfa mérés' => 'Alpha measurement', 'Alfa jelentés' => 'Alpha report', 'Béta oktatás' => 'Beta training',
        'Mérőhely előkészítése' => 'Prepare the measuring site', 'Adatrögzítés' => 'Data entry']],
    'tenant_notices' => ['title' => ['Közös karbantartási ablak péntek este' => 'Shared maintenance window on Friday evening']],
    'blade_roles' => ['name' => ['Szerkesztő' => 'Editor', 'Adminisztrátor' => 'Administrator']],
];

/** The base admin demo: only the protected administrator role. */
const BLADE_DEMO_FORMER_ADMIN_ROWS = ['blade_roles' => ['name' => ['Adminisztrátor' => 'Administrator']]];

/**
 * Seeded file and folder names on Drives A–C: former name => [English name, English seed path, former content or
 * null]. An entry of a former name is renamed wherever it lies now (visitors and tests move seed files), unless its
 * folder already holds the English name; a file takes the English seed content only while its content is the former
 * seed's.
 */
const BLADE_DEMO_FORMER_FILES = [
    'Dokumentumok' => ['Documents', 'a/Documents', null],
    'jegyzet.txt' => ['note.txt', 'a/Documents/note.txt', "Szintetikus jegyzet a feature demóhoz.\nSzerkeszthető szöveg.\n"],
    'README.md' => ['README.md', 'a/Documents/README.md', "# Dokumentumok\n\nSzintetikus Markdown.\n"],
    'Projektek' => ['Projects', 'a/Documents/Projects', null],
    'Mérföldkövek' => ['Milestones', 'a/Documents/Projects/2026/Q4/Milestones', null],
    'terv.txt' => ['plan.txt', 'a/Documents/Projects/2026/Q4/Milestones/plan.txt', "Ötödik mélységi szinten lévő mappa fájlja.\n"],
    'osszefoglalo.txt' => ['summary.txt', 'a/Documents/Projects/2026/summary.txt', "Negyedéves összefoglaló.\n"],
    'Képek' => ['Pictures', 'a/Pictures', null],
    'foto.jpg' => ['photo.jpg', 'a/Pictures/photo.jpg', null],
    'adatok.csv' => ['data.csv', 'a/data.csv', "nev,ertek\nalfa,1\nbeta,2\n"],
    'beallitasok.json' => ['settings.json', 'a/settings.json', "{\"tema\": \"blade\"}\n"],
    'OLVASS-EL.TXT' => ['READ-ME.TXT', 'a/READ-ME.TXT', "Nagybetűs kiterjesztés: szerkeszthető.\n"],
    'Média' => ['Media', 'a/Media', null],
    'Archívum' => ['Archive', 'b/Archive', null],
    'regi-jegyzet.txt' => ['old-note.txt', 'b/Archive/2025/old-note.txt', "Archivált szintetikus jegyzet.\n"],
    'napló.txt' => ['log.txt', 'b/log.txt', "Első bejegyzés.\n"],
    'Feltöltési minták' => ['Upload samples', 'b/Upload samples', null],
    'engedelyezett.txt' => ['allowed.txt', 'b/Upload samples/allowed.txt', "Engedélyezett típus.\n"],
    'engedelyezett.md' => ['allowed.md', 'b/Upload samples/allowed.md', "# Engedélyezett\n"],
    'tiltott-program.exe' => ['blocked-program.exe', 'b/Upload samples/blocked-program.exe', "MZ\x90\x00szintetikus"],
    'tiltott-dokumentum.pdf' => ['blocked-document.pdf', 'b/Upload samples/blocked-document.pdf', "%PDF-1.4\nszintetikus\n"],
    'nagy-naplo.txt' => ['large-log.txt', 'b/Upload samples/large-log.txt', null],
    'Mély mappa' => ['Deep folder', 'b/Deep folder', null],
    'Közös' => ['Shared', 'c/Shared', null],
    'csapat.txt' => ['team.txt', 'c/Shared/team.txt', "Közös szintetikus fájl.\n"],
];

/** The Drive C `jegyzet.txt` (a name collision with Drive A) had its own content: former content => English seed path. */
const BLADE_DEMO_FORMER_FILE_CONTENTS = ["Azonos nevű fájl a névütközés kipróbálásához.\n" => 'c/note.txt'];

/** Former content of `nagy-naplo.txt`, built rather than listed. */
function blade_demo_former_large_log(): string
{
    return str_repeat("Hosszú szintetikus naplósor a szerkesztő méretkorlátjához.\n", 1500);
}

/** Diagrams: former name => [English name, [former node text => English]] (labels and details). */
const BLADE_DEMO_FORMER_DIAGRAMS = [
    'Irodai hálózat' => ['Office network', ['Szolgáltató' => 'Provider', 'Peremtűzfal' => 'Edge firewall', 'Központi router' => 'Core router', 'Mag switch' => 'Core switch',
        'Emeleti switch' => 'Floor switch', 'Alkalmazásszerver' => 'Application server', 'Mentési NAS' => 'Backup NAS', 'Munkaállomás 1' => 'Workstation 1',
        'Munkaállomás 2' => 'Workstation 2', 'Nyomtató' => 'Printer']],
    'Telephelyek VPN' => ['Site VPN', ['Központ' => 'Headquarters', 'Telephely A' => 'Site A', 'Telephely B' => 'Site B', 'Kamera A' => 'Camera A', 'Recepció' => 'Reception']],
];

/** Renames exact former values of $rows (BLADE_DEMO_FORMER_ROWS shape) in $db. */
function blade_demo_former_rows(PDO $db, array $rows): void
{
    $exists = $db->prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?");
    foreach ($rows as $table => $columns) {
        $exists->execute([$table]);
        if (!$exists->fetchColumn()) continue;
        foreach ($columns as $column => $names) {
            $update = $db->prepare("UPDATE $table SET $column = ? WHERE $column = ?".($table === 'blade_calendar_events' ? " AND space = 'signage'" : ''));
            foreach ($names as $former => $name) $update->execute([$name, $former]);
        }
    }
}

/** The feature demo: tasks, readings and the BLADE_DEMO_FORMER_ROWS tables, seeded files ($tree: the seed tree) and diagrams. */
function blade_demo_former_features(PDO $db, FileStorage $storage, DiagramStorage $diagrams, array $tree): void
{
    $db->exec("UPDATE demo_tasks SET title = 'Synthetic task ' || substr(title, 21) WHERE title GLOB 'Szintetikus feladat [0-9][0-9]'");
    $describe = $db->prepare('UPDATE demo_tasks SET description = ? WHERE id = ?');
    foreach ($db->query("SELECT id, description FROM demo_tasks WHERE description LIKE 'Szintetikus leírás a(z) %'")->fetchAll(PDO::FETCH_ASSOC) as $row)
        if (preg_match('/^Szintetikus leírás a\(z\) (\d+)\. feladathoz\.$/u', $row['description'], $match)) $describe->execute(['Synthetic description of task '.$match[1].'.', $row['id']]);
    $db->exec("UPDATE demo_readings SET title = 'Reading ' || substr(title, 7) WHERE title GLOB 'Mérés [0-9][0-9][0-9][0-9]'");
    blade_demo_former_rows($db, BLADE_DEMO_FORMER_ROWS);
    $seeded = static function (string $path) use ($tree): ?string {
        $content = $tree;
        foreach (explode('/', $path) as $segment) $content = $content[$segment] ?? null;
        return is_string($content) ? $content : null;
    };
    $contents = [hash('sha256', blade_demo_former_large_log()) => 'b/Upload samples/large-log.txt'];
    foreach (BLADE_DEMO_FORMER_FILES as [, $path, $formerContent]) if ($formerContent !== null) $contents[hash('sha256', $formerContent)] = $path;
    foreach (BLADE_DEMO_FORMER_FILE_CONTENTS as $formerContent => $path) $contents[hash('sha256', $formerContent)] = $path;
    $named = $db->prepare("SELECT id FROM blade_files WHERE space = ? AND mount_id IN ('a', 'b', 'c') AND name_key = ? AND archived_at IS NULL ORDER BY id");
    foreach (BLADE_DEMO_FORMER_FILES as $former => [$name]) {
        $named->execute([$storage->space, mb_strtolower($former, 'UTF-8')]);
        foreach ($named->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $entry = $storage->entry((int) $id);
            if ($former === $name || !$entry || $storage->child((int) $entry['parent_id'], $name)) continue;
            $storage->rename($entry, $name);
        }
    }
    // Seed content by its former hash, wherever the file lies and whatever it is called now.
    $hashed = $db->prepare("SELECT id FROM blade_files WHERE space = ? AND mount_id IN ('a', 'b', 'c') AND kind = 'file' AND sha256 = ? AND archived_at IS NULL ORDER BY id");
    foreach ($contents as $hash => $path) {
        $content = $seeded($path);
        if ($content === null) continue;
        $hashed->execute([$storage->space, $hash]);
        foreach ($hashed->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $entry = $storage->entry((int) $id);
            if (!$entry) continue;
            $source = blade_demo_runtime('seed').'/'.bin2hex(random_bytes(8));
            file_put_contents($source, $content);
            try {
                $storage->replaceContent((int) $entry['id'], (string) $entry['mime_type'], $source, null, (int) $entry['revision']);
            } finally {
                unlink($source);
            }
        }
    }
    $rename = $db->prepare('UPDATE blade_diagrams SET name = ?, name_key = ? WHERE space = ? AND id = ?');
    foreach (BLADE_DEMO_FORMER_DIAGRAMS as $former => [$name, $texts]) {
        $found = $diagrams->named($former);
        if (!$found || $diagrams->named($name)) continue;
        $diagram = $diagrams->diagram((int) $found['id']);
        $rename->execute([$name, DiagramStorage::key($name), $diagrams->space, $diagram['id']]);
        $content = json_decode((string) $diagram['content'], true);
        if (!is_array($content) || !is_array($content['nodes'] ?? null)) continue;
        foreach ($content['nodes'] as &$node) foreach (['label', 'detail'] as $key) if (is_string($node[$key] ?? null)) $node[$key] = $texts[$node[$key]] ?? $node[$key];
        unset($node);
        $diagrams->save((int) $diagram['id'], (int) $diagram['revision'], json_encode($content, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }
}

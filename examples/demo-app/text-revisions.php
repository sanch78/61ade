<?php
declare(strict_types=1);

/*
 * Feature-demo text revisions (modules/text-revisions.json): append-only revisions of two synthetic documents, the
 * handbook about 60 000 characters per revision with a few changed lines between them. The list's `Különbség` command
 * (frontend/src/text-revisions.ts) compares a revision with the one before it in the public TextDiff component.
 */

/** Deterministic synthetic prose: chapters of paragraphs, at most $limit characters in all. */
function blade_demo_text_revisions_prose(int $limit): array
{
    $words = ['a', 'rendszer', 'beállítás', 'felhasználó', 'lista', 'mező', 'mentés', 'ablak', 'szűrő', 'változat', 'jogosultság', 'művelet', 'adat', 'nézet', 'kártya', 'napló', 'fájl', 'feltöltés', 'értesítés', 'szöveg', 'oldal', 'menü', 'gomb', 'űrlap', 'rekord', 'és', 'minden', 'egy', 'után', 'előtt'];
    $titles = ['Bevezetés', 'Bejelentkezés', 'A menü', 'Listák és szűrők', 'Űrlapok', 'Fájlok', 'Jogosultságok', 'Értesítések', 'Naplózás', 'Beállítások', 'Hibaelhárítás', 'Függelék'];
    $seed = 61;
    $next = static function (int $range) use (&$seed): int { $seed = ($seed * 1103515245 + 12345) % 2147483648; return intdiv($seed, 65536) % $range; };
    $lines = [];
    $length = -1;
    for ($chapter = 1; ; $chapter++) {
        $block = ['## '.$chapter.'. fejezet: '.$titles[($chapter - 1) % count($titles)]];
        for ($paragraph = 0; $paragraph < 12; $paragraph++) {
            $sentences = [];
            for ($sentence = 0, $count = 1 + $next(3); $sentence < $count; $sentence++) {
                $picked = [];
                for ($word = 0, $size = 6 + $next(10); $word < $size; $word++) $picked[] = $words[$next(count($words))];
                $sentences[] = ucfirst(implode(' ', $picked)).'.';
            }
            $block[] = implode(' ', $sentences);
        }
        foreach ($block as $line) {
            $length += mb_strlen($line) + 1;
            if ($length > $limit) return $lines;
            $lines[] = $line;
        }
    }
}

/** The $n-th paragraph line from $from on (headings are skipped) with its third word replaced. */
function blade_demo_text_revisions_reword(array $lines, int $from, string $word): array
{
    for ($index = $from; str_starts_with($lines[$index], '#'); $index++);
    $parts = explode(' ', $lines[$index]);
    $parts[2] = $word;
    $lines[$index] = implode(' ', $parts);
    return $lines;
}

/** The synthetic revisions: [document, note, text], oldest first per document. */
function blade_demo_text_revisions(): array
{
    $first = blade_demo_text_revisions_prose(60000);
    // A few changes spread over the text: 10 %, 45 % and 80 % of the lines, an insertion at 55 %, a removal at 70 %.
    $at = static fn(float $share): int => (int) (count($first) * $share);
    $second = blade_demo_text_revisions_reword(blade_demo_text_revisions_reword(blade_demo_text_revisions_reword($first, $at(0.1), 'pontosított'), $at(0.45), 'egyértelmű'), $at(0.8), 'kötelező');
    $third = $second;
    array_splice($third, $at(0.55), 0, ['Új bekezdés: a változatok listájában a Különbség parancs a kijelölt változatot az előzővel veti össze.', 'A változatlan részek összecsukva maradnak, így egy kis változás azonnal látszik.']);
    array_splice($third, $at(0.7), 1);
    $fourth = $third;
    $heading = array_search('## 3. fejezet: A menü', $fourth, true);
    $fourth[$heading] = '## 3. fejezet: A főmenü és a parancsok';
    $fourth[] = 'Záró megjegyzés: ez a változat egy automatikus módosítás eredménye.';
    $letter = ['Kedves Felhasználó!', '', 'Örülünk, hogy csatlakoztál. A rendszerben a listák, az űrlapok és a fájlok egy helyen érhetők el.', 'Ha kérdésed van, írj nekünk bármikor.', '', 'Üdvözlettel:', 'a csapat'];
    $reworded = $letter;
    $reworded[2] = 'Örülünk, hogy csatlakoztál. A rendszerben a listák, az űrlapok, a fájlok és a beállítások egy helyen érhetők el.';
    $reworded[3] = 'Ha kérdésed van, írj nekünk, általában egy munkanapon belül válaszolunk.';
    $closing = $reworded;
    array_splice($closing, 4, 0, ['', 'Az első lépésekhez nyisd meg a Felhasználói kézikönyvet.']);
    $closing[count($closing) - 1] = 'a 61ade csapata';
    return [
        ['handbook', 'Első változat', $first], ['handbook', 'Automatikus javítás: három szó', $second],
        ['handbook', 'Új bekezdés, egy elavult bekezdés törlése', $third], ['handbook', 'Fejezetcím átnevezése, záró megjegyzés', $fourth],
        ['welcome', 'Első változat', $letter], ['welcome', 'Pontosított mondatok', $reworded], ['welcome', 'Kézikönyv-hivatkozás, aláírás', $closing],
    ];
}

/** Idempotent: the table, then the revisions while it is empty. */
function blade_demo_text_revisions_setup(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS demo_text_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,document TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',body TEXT NOT NULL)");
    if ($db->query('SELECT COUNT(*) FROM demo_text_revisions')->fetchColumn()) return;
    $insert = $db->prepare('INSERT INTO demo_text_revisions(document,note,body) VALUES (?,?,?)');
    foreach (blade_demo_text_revisions() as [$document, $note, $lines]) $insert->execute([$document, $note, implode("\n", $lines)]);
}

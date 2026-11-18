<?php
declare(strict_types=1);

/*
 * Feature-demo media sheets (modules/media-sheets.json, FB-0218): campaign visuals of the Signage mount with their data
 * and a long brief. The record page `demo.media-sheet` (frontend/src/media-sheet.ts) shows the data beside the image at
 * its declared details width and the brief as a card of its own below them; the list's `Adatok` window shows the same
 * sized image. One sheet has no image yet, so its placeholder keeps the image's box.
 */

/** The synthetic sheets: [title, client, channel, year, Signage image name or '', brief]. */
function blade_demo_media_sheets(): array
{
    $brief = static fn(array $paragraphs): string => implode("\n\n", $paragraphs);
    return [
        ['Éjszakai komp a ködben', 'Folyami Révhajózás', 'display', 2026, 'Night ferry in the fog.png', $brief([
            'A kampány az éjszakai járatokat mutatja be: a köd, a fények és a csend a hajóút saját hangulata. A képernyőkön a kép teljes szélességben jelenik meg, a szöveg legfeljebb két sor.',
            'Célcsoport: a késő esti órákban utazók, akik a hidak helyett a vizet választják. Az üzenet a nyugalom és a megbízhatóság; az ár és a menetrend a második képernyőre kerül.',
            'Képi irány: hideg kékek és egy meleg fénypont a hajó orrán. A logó a jobb alsó sarokban áll, a kép felső harmadában nem lehet szöveg, mert ott a köd rajzolata viszi a figyelmet.',
            'Szöveg: „Átkelés a csendben.” Alcím: „Éjszakai járatok minden órában, éjfél után is.” A felirat a kijelző kontrasztjához igazodik; sötét háttéren fehér, világoson grafitszürke.',
            'Ütemezés: hétköznap 20 és 24 óra között a megállók kijelzőin, hétvégén a belvárosi pontokon is. A kampány négy hétig fut, a második héttől a hétvégi változat is megjelenik.',
            'Mérés: a menetrendoldal látogatásai a kijelzők QR-kódjáról, és az éjszakai járatok utasszáma a kampány előtti négy héthez képest. A riport hetente készül, az első a második hét végén.',
            'Jóváhagyás: a megrendelő kommunikációs vezetője a végleges szöveget és a képkivágást külön hagyja jóvá. A kép a 16:9-es kijelzőkre készült; az álló kijelzőkre külön kivágás kell.',
            'Nyitott kérdések: a hétvégi változat zenéje, a QR-kód helye az álló kivágáson, és hogy a kikötők neve a képen vagy csak a feliratban szerepeljen.',
        ])],
        ['Kézműves kávé, lassú reggelek', 'Sarki Pörkölő', 'web', 2025, 'Craft coffee, slow mornings.png', $brief([
            'Reggeli kampány a pörkölő új keverékéhez. A kép a csésze fölötti gőzre épül; a szöveg a bal oldalon, a termék a jobb oldalon áll.',
            'Fő üzenet: „Lassíts le, mielőtt a nap felgyorsul.” A webes hirdetések három méretben készülnek, a kép kivágása mindhárom méretben a csészét tartja középen.',
        ])],
        ['Rókafeltaláló a lebegő kertben', 'Mesekert Könyvkiadó', 'print', 2026, 'Fox inventor in the floating garden.png', $brief([
            'Gyerekkönyv-sorozat borítója és plakátja. A róka a kép bal harmadában áll, a lebegő kert a jobb oldalon nyílik ki; a cím a kép felső sávjába kerül.',
        ])],
        ['Tavaszi programajánló', 'Városi Művelődési Ház', 'display', 2026, '', $brief([
            'A kép még készül: a programfüzet végleges fotói a jövő héten érkeznek. Addig a lap a helyét mutatja, a szöveg és az ütemezés már végleges.',
        ])],
    ];
}

/** Idempotent setup: the table and, while it is empty, the sheets with their images found in the Signage mount. */
function blade_demo_media_sheets_setup(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS demo_media_sheets(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,client TEXT NOT NULL DEFAULT '',channel TEXT NOT NULL DEFAULT 'display',year TEXT NOT NULL DEFAULT '',file_id TEXT NOT NULL DEFAULT '',brief TEXT NOT NULL DEFAULT '')");
    if ($db->query('SELECT COUNT(*) FROM demo_media_sheets')->fetchColumn()) return;
    $file = $db->prepare("SELECT id FROM blade_files WHERE space = 'demo' AND mount_id = 'signage' AND kind = 'file' AND archived_at IS NULL AND name = ? ORDER BY id LIMIT 1");
    $insert = $db->prepare('INSERT INTO demo_media_sheets(title,client,channel,year,file_id,brief) VALUES (?,?,?,?,?,?)');
    foreach (blade_demo_media_sheets() as [$title, $client, $channel, $year, $image, $brief]) {
        $id = '';
        if ($image !== '') { $file->execute([$image]); $id = (string) ($file->fetchColumn() ?: ''); }
        $insert->execute([$title, $client, $channel, (string) $year, $id, $brief]);
    }
}

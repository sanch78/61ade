<?php
declare(strict_types=1);

/*
 * Feature-demo contacts (FB-0178): a record of many short fields in accordion form sections. The create and update
 * forms declare `formSections: 'accordion'` (docs/workspaces.md#form-sections): the sections share a window of a
 * fixed height like the Accordion component of the media viewer, one open at a time, and opening another one never
 * changes the window's size. The name and the organization are plain rows above the sections, without a header of
 * their own; the sections run edge to edge of the window (`flushSections`). The note and the photo each fill a section
 * of their own (`sectionFill`, FB-0181): the open `Megjegyzés` section is the text input, `Fénykép` a drop area and
 * `Galéria` an upload queue.
 * The photo is a stored file in the attachments' store (attachments.php): its upload and GET actions, committed on save.
 * The gallery holds up to six images (`file.multiple`): its section is the uploader's drop zone and queue.
 */

use Blade\Feature\{Context, Field, SqlResource, Workspace};

function blade_demo_contacts_setup(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS demo_contacts(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,organization TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',website TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',street TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT 'HU',channel TEXT NOT NULL DEFAULT 'email',newsletter INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '')");
    // The photo and the gallery (FB-0181): stored files of the attachments' store; the gallery holds a comma-joined list.
    $columns = array_column($db->query('PRAGMA table_info(demo_contacts)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('photo', $columns, true)) $db->exec("ALTER TABLE demo_contacts ADD COLUMN photo TEXT NOT NULL DEFAULT ''");
    if (!in_array('gallery', $columns, true)) $db->exec("ALTER TABLE demo_contacts ADD COLUMN gallery TEXT NOT NULL DEFAULT ''");
    if (!$db->query('SELECT COUNT(*) FROM demo_contacts')->fetchColumn()) $db->exec("INSERT INTO demo_contacts(name,organization,role,email,phone,city,street,postal_code,note) VALUES ('Minta Mária','Minta Kft.','Beszerző','maria@example.test','+36 1 234 5678','Budapest','Fő utca 1.','1011','Kedden és csütörtökön érhető el.')");
}

function blade_demo_contacts_register(Workspace $workspace): void
{
    $contacts = new SqlResource('demo_contacts', 'demo_contacts', 'id', [
        // Outside the sections: plain rows above them, headed by the window's title (in cards an untitled group).
        new Field('name', 'Név', required: true, max: 120),
        new Field('organization', 'Szervezet', max: 120),
        new Field('role', 'Beosztás', max: 80, section: 'Elérhetőség'),
        new Field('email', 'E-mail', required: true, max: 160, section: 'Elérhetőség'),
        new Field('phone', 'Telefon', max: 40, section: 'Elérhetőség'),
        new Field('website', 'Weboldal', max: 200, section: 'Elérhetőség'),
        new Field('postal_code', 'Irányítószám', max: 10, section: 'Cím'),
        new Field('city', 'Település', max: 80, section: 'Cím'),
        new Field('street', 'Utca, házszám', max: 160, section: 'Cím'),
        new Field('country', 'Ország', 'select', defaultValue: 'HU', options: ['HU' => 'Magyarország', 'AT' => 'Ausztria', 'DE' => 'Németország', 'SK' => 'Szlovákia'], section: 'Cím'),
        new Field('channel', 'Kapcsolattartás módja', 'select', defaultValue: 'email', options: ['email' => 'E-mail', 'phone' => 'Telefon', 'post' => 'Levél'], section: 'Beállítások'),
        new Field('newsletter', 'Hírlevelet kér', 'checkbox', section: 'Beállítások'),
        // Each alone in its section, which it fills (FB-0181): the header names it.
        new Field('note', 'Megjegyzés', 'textarea', max: 1000, section: 'Megjegyzés', sectionFill: true),
        new Field('photo', 'Fénykép', 'file', file: ['upload' => 'demo_attachments.file_upload', 'get' => 'demo_attachments.file', 'accept' => ['image']], section: 'Fénykép', sectionFill: true),
        new Field('gallery', 'Galéria', 'file', file: ['upload' => 'demo_attachments.file_upload', 'get' => 'demo_attachments.file', 'accept' => ['image'], 'multiple' => 6], section: 'Galéria', sectionFill: true),
    ], afterSave: static function (Context $ctx, string $id, ?array $target, array $values): void {
        // The executor accepted the tokens (the actor's own unexpired uploads); the demo commits their pending rows.
        foreach (array_filter(explode(',', ($values['photo'] ?? '').','.($values['gallery'] ?? ''))) as $token) $ctx->db->prepare("UPDATE demo_attachment_files SET state = 'committed' WHERE id = ? AND state = 'pending'")->execute([$token]);
    });
    $contacts->register($workspace->registry, 'Kapcsolatok', group: 'Feature demó', formSections: 'accordion', flushSections: true,
        guide: 'Accordion űrlapszakaszok: a Hozzáadás és a Módosítás ablaka fix magasságú, a szakaszok egymás alatt, a Médiatár oldalsávjához hasonlóan nyílnak, egyszerre egy. Másik szakasz kinyitásakor az ablak mérete nem változik; a hosszabb szakasz a saját helyén görget. A név és a szervezet a szakaszok fölött, saját fejléc nélkül áll.');
    $contacts->registerDelete($workspace->registry);
}

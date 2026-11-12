<?php
declare(strict_types=1);

/*
 * Feature-demo contacts (FB-0178): a record of many short fields in accordion form sections. The create and update
 * forms declare `formSections: 'accordion'` (docs/workspaces.md#form-sections): the sections share a window of a
 * fixed height like the Accordion component of the media viewer, one open at a time, and opening another one never
 * changes the window's size. The name and the organization are plain rows above the sections, without a header of
 * their own; the sections run edge to edge of the window (`flushSections`).
 */

use Blade\Feature\{Field, SqlResource, Workspace};

function blade_demo_contacts_setup(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS demo_contacts(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,organization TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',website TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',street TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT 'HU',channel TEXT NOT NULL DEFAULT 'email',newsletter INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '')");
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
        new Field('note', 'Megjegyzés', 'textarea', max: 1000, section: 'Beállítások'),
    ]);
    $contacts->register($workspace->registry, 'Kapcsolatok', group: 'Feature demó', formSections: 'accordion', flushSections: true,
        guide: 'Accordion űrlapszakaszok: a Hozzáadás és a Módosítás ablaka fix magasságú, a szakaszok egymás alatt, a Médiatár oldalsávjához hasonlóan nyílnak, egyszerre egy. Másik szakasz kinyitásakor az ablak mérete nem változik; a hosszabb szakasz a saját helyén görget. A név és a szervezet a szakaszok fölött, saját fejléc nélkül áll.');
    $contacts->registerDelete($workspace->registry);
}

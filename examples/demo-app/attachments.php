<?php
declare(strict_types=1);

/*
 * Feature-demo attachments (FB-0167): a record with a file the project stores itself, not in a file manager mount.
 * The `file` field names the project's upload action and GET action (docs/workspaces.md#stored-file-field). The upload
 * action keeps the bytes in a content-addressed directory and a pending row, and returns the row's token. The save
 * stores the token with the record's other fields and the `afterSave` hook commits the pending row in the same
 * transaction. The GET action streams a committed file of a record, or the actor's own pending upload. Unclaimed uploads
 * expire after a day (the project's rule). A cancelled form leaves no record. The bytes of a replaced file stay in the
 * store, which collects nothing in the demo. The two images form one collapsible form section (FB-0172), and the role is
 * fixed after create (`createOnly`, FB-0171).
 */

use Blade\Feature\{Action, Context, DownloadStream, Failure, Field, SqlResource, UploadPolicy, Workspace};

/** The demo's content-addressed store: one file per SHA-256 below the instance's runtime. */
function blade_demo_attachments_store(): string
{
    return blade_demo_runtime('attachments');
}

function blade_demo_attachments_setup(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS demo_attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'reference',reason TEXT NOT NULL DEFAULT '',file TEXT NOT NULL DEFAULT '')");
    // A second stored image (FB-0172: the two images form one collapsible form section).
    if (!in_array('detail', array_column($db->query('PRAGMA table_info(demo_attachments)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true)) $db->exec("ALTER TABLE demo_attachments ADD COLUMN detail TEXT NOT NULL DEFAULT ''");
    // Pending (uploaded, not yet saved with a record) and committed files; `id` is the token the upload returned.
    $db->exec("CREATE TABLE IF NOT EXISTS demo_attachment_files(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',actor_id TEXT NOT NULL,created_at INTEGER NOT NULL)");
    // The store and the transfer root exist before the web server needs them (group-shared, as every runtime directory).
    blade_demo_attachments_store();
    blade_demo_runtime('attachment-transfers');
    if (!$db->query('SELECT COUNT(*) FROM demo_attachments')->fetchColumn()) $db->exec("INSERT INTO demo_attachments(title,role,reason) VALUES ('Mintakép helye','reference','Ide kerül a referenciakép.')");
}

function blade_demo_attachments_register(Workspace $workspace): void
{
    $attachments = new SqlResource('demo_attachments', 'demo_attachments', 'id', [
        // A fixed section (FB-0177): always open under a plain heading; in cards and details a group of its own.
        new Field('title', 'Megnevezés', required: true, max: 120, section: 'Alapadatok', sectionCollapsible: false),
        new Field('role', 'Szerep', 'select', required: true, options: ['reference' => 'Referencia', 'attachment' => 'Melléklet', 'evidence' => 'Bizonyíték'], section: 'Alapadatok', sectionCollapsible: false),
        // A long text outside the sections: below the groups across the card, six lines of it (FB-0177).
        new Field('reason', 'Indoklás', 'textarea', max: 500, column: ['cardLines' => 6]),
        // Both images form one collapsible section (FB-0172): closed while the record holds none.
        new Field('file', 'Kép', 'file', file: ['upload' => 'demo_attachments.file_upload', 'get' => 'demo_attachments.file', 'accept' => ['image']], section: 'Képek'),
        new Field('detail', 'Részletkép', 'file', file: ['upload' => 'demo_attachments.file_upload', 'get' => 'demo_attachments.file', 'accept' => ['image']], section: 'Képek'),
        // The list and the details show the file's name from the project's own rows (the stored field is a form field);
        // in cards and details it is the `Képek` group.
        new Field('file_name', 'Fájlnév', section: 'Képek'),
    ], computed: ['file_name' => "(SELECT name FROM demo_attachment_files f WHERE f.id = blade_base.file AND f.state = 'committed')"],
        // The role is chosen at create and fixed afterwards (FB-0171): the update form shows it read-only.
        createOnly: ['role'],
        afterSave: static function (Context $ctx, string $id, ?array $target, array $values): void {
            // The executor accepted the tokens (the actor's own unexpired uploads); the project commits their pending rows.
            foreach (['file', 'detail'] as $name) if (($values[$name] ?? '') !== '') $ctx->db->prepare("UPDATE demo_attachment_files SET state = 'committed' WHERE id = ? AND state = 'pending'")->execute([$values[$name]]);
        });
    // One card per row (FB-0169): the field sections show as groups side by side, the reason below them (FB-0177).
    $attachments->register($workspace->registry, 'Mellékletek', group: 'Feature demó', cardColumns: 1,
        guide: 'Saját tárolású fájlmező: a kép a projekt saját tárolójába kerül, nem a fájlkezelőbe. A feltöltés a háttérben fut, és a kép a rekord többi mezőjével egy mentésben rögzül; a Mégse nem hoz létre rekordot.'."\n\n".'Vegyél fel egy mellékletet: adj meg szerepet és indoklást, nyisd ki a Képek szakaszt, majd húzz egy képet a mezőre, vagy illeszd be Ctrl+V-vel. A szerep a létrehozás után nem változik: a Módosítás csak megmutatja.');
    $attachments->registerDelete($workspace->registry);
    // The upload action of the field: stores the bytes and a pending row, returns its token. No fields, one file.
    $workspace->registry->add(new Action('demo_attachments', 'file_upload', 'Kép feltöltése', [], static function (Context $ctx): array {
        $part = $ctx->uploads[0];
        $sha = (string) hash_file('sha256', $part->path);
        $path = blade_demo_attachments_store().'/'.$sha;
        if (!is_file($path)) {
            $temporary = $path.'.'.bin2hex(random_bytes(6)).'.tmp';
            if (!copy($part->path, $temporary) || !rename($temporary, $path)) { @unlink($temporary); throw new Failure('A fájl feltöltése nem sikerült.', 500); }
            @chmod($path, 0660);
        }
        // Unclaimed uploads expire after a day; a committed file stays while a record refers to it.
        $ctx->db->prepare("DELETE FROM demo_attachment_files WHERE state = 'pending' AND created_at < ?")->execute([time() - 86400]);
        $token = bin2hex(random_bytes(16));
        $mime = (string) (new finfo(FILEINFO_MIME_TYPE))->file($path);
        $ctx->db->prepare('INSERT INTO demo_attachment_files(id,sha256,name,mime_type,size,actor_id,created_at) VALUES (?,?,?,?,?,?,?)')
            ->execute([$token, $sha, mb_substr($part->name, 0, 255), $mime, $part->size, $ctx->actor->id, time()]);
        return ['id' => $token, 'audit' => ['size' => $part->size]];
    }, resolve: static fn() => ['id' => null, 'owner' => null], write: true,
        upload: new UploadPolicy(['png', 'jpg', 'jpeg', 'webp', 'gif'], 2097152, 1, duplicatePolicy: 'rename', tempRoot: blade_demo_runtime('attachment-transfers'))));
    // The preview: a committed file of a record, or the actor's own pending upload.
    $workspace->registry->add(new Action('demo_attachments', 'file', 'Kép', [], static function (Context $ctx, array $target): DownloadStream {
        $row = $target['row'];
        return new DownloadStream($row['mime_type'], blade_demo_attachments_store().'/'.$row['sha256'], (int) $row['size'], '"'.$row['sha256'].'"', disposition: 'inline', filename: $row['name'], maxAge: 0);
    }, resolve: static function (Context $ctx, ?string $id): array {
        $query = $ctx->db->prepare("SELECT * FROM demo_attachment_files f WHERE f.id = ? AND ((f.state = 'committed' AND EXISTS (SELECT 1 FROM demo_attachments a WHERE a.file = f.id OR a.detail = f.id)) OR (f.state = 'pending' AND f.actor_id = ?))");
        $query->execute([(string) $id, $ctx->actor->id]);
        $row = $query->fetch(PDO::FETCH_ASSOC) ?: throw new Failure('Nem található objektum.', 404);
        return ['id' => $id, 'owner' => null, 'row' => $row];
    }, get: true));
}

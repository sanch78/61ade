<?php
declare(strict_types=1);
namespace Blade\Files;

use Blade\Feature\{Action, Context, DownloadStream, Failure, Field, Registry, Upload};
use Blade\I18n\Translator;

/**
 * Registered file actions. The executor has already authenticated, checked channel/scope and the
 * ACL of the target mount and opened the transaction; handlers add item-level checks.
 */
final class FileActions
{
    private const LIST_LIMIT = 1000;
    private const TREE_LIMIT = 2000;
    private const TREE_FILE_LIMIT = 5000;
    private const SOURCE_LIMIT = 100;
    private const OPERATION_LIMIT = 5000;

    public function __construct(private FileManagerDefinition $definition, private FileStorage $storage)
    {
    }

    public function register(Registry $registry): void
    {
        $resource = $this->definition->resource;
        $decision = new Field('decision', 'Névütközés esetén', 'select', options: ['overwrite' => 'Felülírás', 'rename' => 'Átnevezés', 'skip' => 'Kihagyás']);
        $sources = new Field('sources', 'Kijelölt elemek', required: true, max: 2000);
        $entry = fn(Context $ctx, ?string $id): array => $this->target($id);
        $actions = [
            new Action($resource, 'tree', 'Mappafa', [], fn(Context $ctx, array $target) => $this->tree($target), resolve: fn(Context $ctx, ?string $id) => $this->mount($id)),
            new Action($resource, 'list', 'Mappa tartalma', [], fn(Context $ctx, array $target) => $this->listing($target), resolve: $entry),
            new Action($resource, 'create_directory', 'Új mappa', [new Field('name', 'Mappa neve', required: true, max: 255)], fn(Context $ctx, array $target, array $values) => $this->createDirectory($target, $values['name']), resolve: $entry, write: true, icon: 'dxi dxi-plus'),
            new Action($resource, 'upload', 'Feltöltés', [$decision], fn(Context $ctx, array $target, array $values) => $this->upload($ctx, $target, $values['decision'] ?? ''), resolve: $entry, write: true, icon: 'dxi dxi-file-import',
                upload: $this->definition->maxSizeBytes * $this->definition->maxFiles),
            new Action($resource, 'copy', 'Másolás', [$sources, $decision], fn(Context $ctx, array $target, array $values) => $this->transfer($ctx, $target, $values, false), resolve: $entry, write: true, icon: 'dxi dxi-copy'),
            new Action($resource, 'move', 'Áthelyezés', [$sources, $decision], fn(Context $ctx, array $target, array $values) => $this->transfer($ctx, $target, $values, true), resolve: $entry, write: true, icon: 'dxi dxi-file-export'),
            new Action($resource, 'text_get', 'Szöveg megnyitása', [], fn(Context $ctx, array $target) => $this->textGet($target), resolve: $entry),
            new Action($resource, 'content_get', 'Megtekintés', [], fn(Context $ctx, array $target) => $this->contentGet($target), resolve: $entry, icon: 'dxi dxi-eye'),
            new Action($resource, 'content_stream', 'Médiatartalom', [], fn(Context $ctx, array $target) => $this->contentStream($target), resolve: $entry, get: true),
            new Action($resource, 'thumbnail_get', 'Bélyegkép', [], fn(Context $ctx, array $target) => $this->thumbnailGet($target), resolve: $entry, get: true),
            new Action($resource, 'text_save', 'Szöveg mentése', [new Field('revision', 'Verzió', required: true, max: 20)], fn(Context $ctx, array $target, array $values) => $this->textSave($ctx, $target, $values['revision']), resolve: $entry, write: true, icon: 'dxi dxi-content-save',
                upload: $this->definition->textMaxBytes),
        ];
        foreach ($actions as $action) $registry->add($action);
        $registry->fileManager($resource, $this->definition->title, array_map(static fn($action) => $action->name, $actions), $this->definition->metadata(), $this->definition->group, $this->definition->icon, $this->definition->desktopOnly);
    }

    /** ACL object of every file action is the mount key, so rules may grant per mount (`id` scope). */
    private function mount(?string $id): array
    {
        if ($id === null || !isset($this->definition->mounts[$id])) throw new Failure('Ismeretlen meghajtó.', 404);
        return ['id' => $id, 'acl_id' => $id, 'owner' => null];
    }

    private function target(?string $id): array
    {
        $row = $id !== null && preg_match('/^[1-9][0-9]{0,17}$/D', $id) ? $this->storage->entry((int) $id) : null;
        if (!$row || !isset($this->definition->mounts[$row['mount_id']])) throw new Failure('Nem található elem.', 404);
        return ['id' => (string) $row['id'], 'acl_id' => $row['mount_id'], 'owner' => null, 'row' => $row];
    }

    /** Kind checks run after the ACL decision, so denied callers learn nothing about the entry. */
    private function directory(array $target): array
    {
        if ($target['row']['kind'] !== 'directory') throw new Failure('A cél nem mappa.');
        return $target['row'];
    }

    private function file(array $target): array
    {
        $row = $target['row'];
        if ($row['kind'] !== 'file') throw new Failure('A kijelölt elem nem fájl.');
        if (FileStorage::extension($row['name']) !== FileManagerDefinition::TEXT_EXTENSION) throw new Failure('Csak .txt kiterjesztésű fájl szerkeszthető.', 415);
        return $row;
    }

    private function label(string $mount): string { return Translator::text($this->definition->mounts[$mount]); }

    private function tree(array $target): array
    {
        $root = $this->storage->root($target['id']) ?? throw new Failure('A meghajtó nincs előkészítve.', 404);
        $rows = $this->storage->directories($target['id'], self::TREE_LIMIT);
        if (count($rows) > self::TREE_LIMIT) throw new Failure('A meghajtó túl sok mappát tartalmaz.', 413);
        // Every directory, then the first files by name; `truncated` marks files left out of the tree.
        $files = $this->storage->files($target['id'], self::TREE_FILE_LIMIT);
        return ['mount' => $target['id'], 'root' => (string) $root['id'], 'items' => [...array_map(fn($row) => [
            'id' => (string) $row['id'], 'parent' => (string) $row['parent_id'], 'name' => (int) $row['parent_id'] === 0 ? $this->label($target['id']) : $row['name'], 'kind' => 'directory', 'mime_type' => '',
        ], $rows), ...array_map(static fn($row) => [
            'id' => (string) $row['id'], 'parent' => (string) $row['parent_id'], 'name' => $row['name'], 'kind' => 'file', 'mime_type' => $row['mime_type'],
        ], array_slice($files, 0, self::TREE_FILE_LIMIT))], 'truncated' => count($files) > self::TREE_FILE_LIMIT];
    }

    private function listing(array $target): array
    {
        $directory = $this->directory($target);
        $chain = $this->storage->ancestry($directory);
        $rows = $this->storage->children((int) $directory['id'], self::LIST_LIMIT);
        $thumbnails = $this->storage->thumbnails(array_slice($rows, 0, self::LIST_LIMIT));
        return [
            'directory' => ['id' => (string) $directory['id'], 'mount' => $directory['mount_id'], 'depth' => count($chain) - 1,
                'path' => array_map(fn($row) => ['id' => (string) $row['id'], 'name' => (int) $row['parent_id'] === 0 ? $this->label($row['mount_id']) : $row['name']], $chain)],
            'items' => array_map(static fn($row) => [
                'id' => (string) $row['id'], 'name' => $row['name'], 'kind' => $row['kind'], 'extension' => $row['extension'], 'mime_type' => $row['mime_type'],
                'size' => (int) $row['size'], 'modified_at' => $row['modified_at'], 'revision' => (string) $row['revision'],
                'width' => $row['width'] !== null ? (int) $row['width'] : null, 'height' => $row['height'] !== null ? (int) $row['height'] : null,
                'duration_ms' => $row['duration_ms'] !== null ? (int) $row['duration_ms'] : null, 'orientation' => $row['orientation'], 'thumbnail' => $thumbnails[(int) $row['id']],
            ], array_slice($rows, 0, self::LIST_LIMIT)),
            'truncated' => count($rows) > self::LIST_LIMIT,
        ];
    }

    private function createDirectory(array $target, string $name): array
    {
        $parent = $this->directory($target);
        $error = FileStorage::invalidName($name);
        if ($error === null && count($this->storage->ancestry($parent)) > $this->definition->maxDepth) $error = Translator::text('A mappák legfeljebb {depth} szint mélyek lehetnek.', ['depth' => $this->definition->maxDepth]);
        if ($error !== null) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['name' => $error]);
        if ($this->storage->child((int) $parent['id'], $name)) throw new Failure('Javítsd a megjelölt mezőket.', 409, ['name' => 'Ilyen nevű elem már létezik ebben a mappában.']);
        $id = $this->storage->createDirectory($parent, $name);
        return ['id' => (string) $id, 'audit' => ['parent' => (string) $parent['id'], 'created' => [(string) $id]]];
    }

    /** First violated upload rule; detection uses the received bytes, never the browser's MIME value. */
    private function rejected(Upload $file): ?string
    {
        if (in_array($file->error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) return $this->tooLarge();
        if ($file->error !== UPLOAD_ERR_OK) return Translator::text('A fájl feltöltése nem sikerült.');
        $name = FileStorage::invalidName($file->name);
        if ($name !== null) return Translator::text($name);
        $extension = FileStorage::extension($file->name);
        if (!in_array($extension, $this->definition->allowedExtensions, true)) return Translator::text('Nem engedélyezett fájltípus. Engedélyezett: {types}.', ['types' => implode(', ', $this->definition->allowedExtensions)]);
        if ((int) filesize($file->path) > $this->definition->maxSizeBytes) return $this->tooLarge();
        $detected = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($file->path);
        // libmagic reports very short text as octet-stream; text types then need clean UTF-8 bytes.
        $text = in_array('text/plain', FileManagerDefinition::TYPES[$extension][1], true);
        if ($text && $detected === 'application/octet-stream' && preg_match('/^[^\x00-\x08\x0B\x0E-\x1F\x7F]*$/Du', (string) file_get_contents($file->path))) $detected = 'text/plain';
        if (!in_array($detected, FileManagerDefinition::TYPES[$extension][1], true)) return Translator::text('A fájl tartalma nem felel meg a kiterjesztésnek.');
        return null;
    }

    private function tooLarge(): string
    {
        return Translator::text('A fájl túl nagy (legfeljebb {size} bájt).', ['size' => $this->definition->maxSizeBytes]);
    }

    /** Display copy of a client-supplied name; it is never used as a path. */
    private static function shown(string $name): string
    {
        return mb_substr((string) preg_replace('/\p{Cc}|\p{Cf}/u', '?', mb_scrub($name, 'UTF-8')), 0, 255, 'UTF-8');
    }

    private function upload(Context $ctx, array $target, string $decision): array
    {
        $directory = $this->directory($target);
        if (count($this->storage->ancestry($directory)) - 1 > $this->definition->maxDepth) throw new Failure('A célmappa túl mélyen van.');
        $files = array_values(array_filter($ctx->uploads, static fn(Upload $upload) => $upload->field === 'files'));
        if (!$files) throw new Failure('Válassz feltöltendő fájlt.');
        if (count($files) > $this->definition->maxFiles) throw new Failure($this->definition->maxFiles > 1 ? Translator::text('Egyszerre legfeljebb {count} fájl tölthető fel.', ['count' => $this->definition->maxFiles]) : 'Egyszerre csak egy fájl tölthető fel.');
        $policy = $this->definition->duplicatePolicy === 'ask' ? $decision : $this->definition->duplicatePolicy;
        $accepted = $failed = $conflicts = $names = [];
        foreach ($files as $file) {
            $error = $this->rejected($file);
            $key = mb_strtolower($file->name, 'UTF-8');
            if ($error === null && isset($names[$key])) $error = Translator::text('Azonos nevű fájl többször szerepel a kijelölésben.');
            if ($error !== null) {
                $failed[] = ['name' => self::shown($file->name), 'error' => $error];
                continue;
            }
            $names[$key] = true;
            $existing = $this->storage->child((int) $directory['id'], $file->name);
            if ($existing) $conflicts[] = ['name' => $file->name, 'kind' => 'file', 'existing_kind' => $existing['kind']];
            $accepted[] = $file;
        }
        if (!$accepted) throw new Failure('Egyik fájl sem tölthető fel.', 400, [], ['failed' => $failed]);
        if ($conflicts && $policy === '') throw new Failure('Névütközés a célmappában.', 409, [], ['conflicts' => $conflicts, 'failed' => $failed]);
        $succeeded = $skipped = $created = $replaced = [];
        foreach ($accepted as $file) {
            $name = $file->name;
            $mime = FileManagerDefinition::TYPES[FileStorage::extension($name)][0];
            $existing = $this->storage->child((int) $directory['id'], $name);
            if ($existing && $policy === 'skip') { $skipped[] = ['name' => $name]; continue; }
            if ($existing && $policy === 'reject') { $failed[] = ['name' => $name, 'error' => Translator::text('Ilyen nevű elem már létezik ebben a mappában.')]; continue; }
            if ($existing && $policy === 'overwrite' && $existing['kind'] !== 'file') { $failed[] = ['name' => $name, 'error' => Translator::text('Mappa nem írható felül.')]; continue; }
            if ($existing && $policy === 'overwrite') {
                $this->storage->replaceContent((int) $existing['id'], $mime, $file->path);
                $succeeded[] = ['id' => (string) $existing['id'], 'name' => $name];
                $replaced[] = (string) $existing['id'];
                continue;
            }
            if ($existing) $name = $this->storage->freeName((int) $directory['id'], $name, 'file');
            $id = (string) $this->storage->createFile($directory, $name, $mime, $file->path);
            $succeeded[] = ['id' => $id, 'name' => $name];
            $created[] = $id;
        }
        return ['succeeded' => $succeeded, 'skipped' => $skipped, 'failed' => $failed,
            'audit' => ['directory' => (string) $directory['id'], 'created' => $created, 'replaced' => $replaced, 'skipped' => count($skipped), 'failed' => count($failed)]];
    }

    /** Copy or move into the target directory. Every check precedes the first write; one transaction. */
    private function transfer(Context $ctx, array $target, array $values, bool $move): array
    {
        $destination = $this->directory($target);
        $ids = array_map('intval', explode(',', $values['sources']));
        if (!preg_match('/^[1-9][0-9]{0,17}(,[1-9][0-9]{0,17})*$/D', $values['sources']) || count($ids) > self::SOURCE_LIMIT || count(array_unique($ids)) !== count($ids)) throw new Failure('Hibás vagy túl nagy kijelölés.');
        $chain = array_map(static fn($row) => (int) $row['id'], $this->storage->ancestry($destination));
        $items = [];
        foreach ($ids as $id) {
            $row = $this->storage->entry($id);
            if (!$row || !isset($this->definition->mounts[$row['mount_id']])) throw new Failure('Nem található elem.', 404);
            // Read permission on every source item; a move also changes the source location.
            foreach ($move ? ['list', 'move'] : ['list'] as $right) {
                if (!$ctx->acl->allows($ctx->actor->id, $this->definition->resource, $right, $ctx->channel, $row['mount_id'])) throw new Failure('Nincs hozzáférés.', 403);
            }
            if ((int) $row['parent_id'] === 0) throw new Failure('A meghajtó gyökere nem másolható és nem helyezhető át.');
            $items[$id] = $row;
        }
        foreach ($items as $id => $row) {
            foreach (array_slice($this->storage->ancestry($row), 0, -1) as $ancestor) {
                if (isset($items[(int) $ancestor['id']])) throw new Failure('A kijelölés egymásba ágyazott elemeket tartalmaz.');
            }
            if ($row['kind'] === 'directory' && in_array($id, $chain, true)) throw new Failure('Mappa nem másolható és nem helyezhető át önmagába vagy a saját almappájába.');
        }
        $decision = $values['decision'] ?? '';
        $plans = $conflicts = $planned = [];
        $total = 0;
        $tooDeep = [];
        foreach ($items as $id => $row) {
            if ($move && (int) $row['parent_id'] === (int) $destination['id']) { $plans[] = [$row, null, 'Az elem már a célmappában van.']; continue; }
            $key = mb_strtolower($row['name'], 'UTF-8');
            $existing = $this->storage->child((int) $destination['id'], $row['name']);
            if ($existing || isset($planned[$key])) $conflicts[] = ['id' => (string) $id, 'name' => $row['name'], 'kind' => $row['kind'], 'existing_kind' => $existing['kind'] ?? $planned[$key]];
            $planned[$key] = $row['kind'];
            $subtree = $this->storage->subtree($row, self::OPERATION_LIMIT - $total);
            if ($subtree === null) throw new Failure('Egy műveletben legfeljebb 5000 elem kezelhető.', 413);
            $total += count($subtree);
            $height = max(array_map(static fn($entry) => $entry['kind'] === 'directory' ? $entry['relative'] : -1, $subtree));
            if ($height >= 0 && count($chain) + $height > $this->definition->maxDepth) $tooDeep[] = $row['name'];
            $plans[] = [$row, $subtree, null];
        }
        if ($tooDeep) throw new Failure(Translator::text('A művelet túllépné a megengedett {depth} szintes mappamélységet: {names}.', ['depth' => $this->definition->maxDepth, 'names' => implode(', ', $tooDeep)]), 400, [], ['too_deep' => $tooDeep]);
        if ($conflicts && $decision === '') throw new Failure('Névütközés a célmappában.', 409, [], ['conflicts' => $conflicts]);

        $succeeded = $skipped = $failed = [];
        foreach ($plans as [$row, $subtree, $error]) {
            $source = (string) $row['id'];
            $existing = $error === null ? $this->storage->child((int) $destination['id'], $row['name']) : null;
            if ($existing && $decision === 'skip') { $skipped[] = ['source' => $source, 'name' => $row['name']]; continue; }
            if ($existing && $decision === 'overwrite' && ((int) $existing['id'] === (int) $row['id'] || $existing['kind'] !== 'file' || $row['kind'] !== 'file')) {
                $error = (int) $existing['id'] === (int) $row['id'] ? 'Egy elem önmagát nem írhatja felül.' : 'Mappa nem írható felül; válaszd az átnevezést vagy a kihagyást.';
            }
            if ($error !== null) { $failed[] = ['source' => $source, 'name' => $row['name'], 'error' => Translator::text($error)]; continue; }
            $name = $existing && $decision === 'rename' ? $this->storage->freeName((int) $destination['id'], $row['name'], $row['kind']) : $row['name'];
            if ($existing && $decision === 'overwrite' && !$move) {
                $this->storage->replaceFrom((int) $existing['id'], $row);
                $succeeded[] = ['source' => $source, 'id' => (string) $existing['id'], 'name' => $name];
                continue;
            }
            if ($existing && $decision === 'overwrite') $this->storage->removeFile((int) $existing['id']);
            if ($move) $this->storage->moveTree($subtree, $destination, $name);
            $id = $move ? $source : (string) $this->storage->copyTree($subtree, $destination, $name);
            $succeeded[] = ['source' => $source, 'id' => $id, 'name' => $name];
        }
        return ['succeeded' => $succeeded, 'skipped' => $skipped, 'failed' => $failed, 'audit' => [
            'target' => (string) $destination['id'], 'sources' => array_map('strval', $ids),
            'succeeded' => array_map(static fn($item) => $item['source'].'>'.$item['id'], $succeeded),
            'skipped' => array_column($skipped, 'source'), 'failed' => array_column($failed, 'source'),
        ]];
    }

    private function textTooLarge(): never
    {
        throw new Failure(Translator::text('A szöveg túl nagy a szerkesztőhöz (legfeljebb {size} bájt).', ['size' => $this->definition->textMaxBytes]), 413);
    }

    private function text(string $content): string
    {
        if (strlen($content) > $this->definition->textMaxBytes) $this->textTooLarge();
        if (preg_match('//u', $content) !== 1 || str_contains($content, "\0")) throw new Failure('A fájl nem UTF-8 kódolású szöveg.', 415);
        return $content;
    }

    private function textGet(array $target): array
    {
        $file = $this->file($target);
        if ((int) $file['size'] > $this->definition->textMaxBytes) $this->textTooLarge();
        $this->stored($file);
        return ['id' => (string) $file['id'], 'name' => $file['name'], 'content' => $this->text($this->storage->content((int) $file['id'], $this->definition->textMaxBytes)), 'revision' => (string) $file['revision'], 'max_bytes' => $this->definition->textMaxBytes];
    }

    private function preview(array $target): array
    {
        $row = $target['row'];
        if ($row['kind'] !== 'file') throw new Failure('A kijelölt elem nem fájl.');
        if (!in_array($row['mime_type'], FileManagerDefinition::PREVIEW_TYPES, true)) throw new Failure('Ez a fájltípus nem tekinthető meg.', 415);
        return $row;
    }

    /** Bytes of a previewable image or video for a blob URL (POST, attachment, no-store); the stored, detected type is the response type. */
    private function contentGet(array $target): DownloadStream
    {
        $row = $this->preview($target);
        return new DownloadStream($row['mime_type'], $this->stored($row), (int) $row['size'], '"'.$row['sha256'].'"', ['size' => (int) $row['size']]);
    }

    /** GET-capable inline stream with single-range support (video seeking); the content hash is the ETag. */
    private function contentStream(array $target): DownloadStream
    {
        $row = $this->preview($target);
        return new DownloadStream($row['mime_type'], $this->stored($row), (int) $row['size'], '"'.$row['sha256'].'"', ['size' => (int) $row['size']], 'inline', $row['name'], 0);
    }

    /** Ready thumbnail of the current revision; a missing one is queued again and reported as pending. */
    private function thumbnailGet(array $target): DownloadStream
    {
        $row = $target['row'];
        if ($row['kind'] !== 'file' || !$this->storage->thumbnails || !Thumbnails::supports($row['mime_type'])) throw new Failure('Ehhez a fájltípushoz nincs előnézeti kép.', 415);
        $thumbnail = $this->storage->thumbnail($row);
        if ($thumbnail['state'] === 'failed') throw new Failure('Az előnézet nem készíthető el.', 404, [], ['state' => 'failed']);
        if ($thumbnail['state'] !== 'ready') throw new Failure('Az előnézet még készül.', 404, [], ['state' => 'pending']);
        $path = $this->storage->store->path($thumbnail['key']);
        clearstatcache(true, $path);
        $size = is_file($path) ? filesize($path) : false;
        if ($size === false) throw new Failure('A fájl tartalma nem érhető el.', 404);
        return new DownloadStream($thumbnail['mime'], $path, $size, '"'.basename($thumbnail['key']).'"', ['size' => $size], 'inline', null, 60);
    }

    /** Store path of a file whose content must exist; a missing store file is a 404, never a warning. */
    private function stored(array $row): string
    {
        $path = $this->storage->path($row);
        if (!is_file($path)) throw new Failure('A fájl tartalma nem érhető el.', 404);
        return $path;
    }

    /** Optimistic save: the conditional update fails when another writer changed the revision. */
    private function textSave(Context $ctx, array $target, string $revision): array
    {
        $file = $this->file($target);
        $parts = array_values(array_filter($ctx->uploads, static fn(Upload $upload) => $upload->field === 'content'));
        if (count($parts) !== 1) throw new Failure('A szöveg tartalma hiányzik.');
        if (!preg_match('/^[0-9]{1,18}$/D', $revision)) throw new Failure('Hibás verzió.');
        if ($parts[0]->error !== UPLOAD_ERR_OK || (int) filesize($parts[0]->path) > $this->definition->textMaxBytes) $this->textTooLarge();
        $this->text((string) file_get_contents($parts[0]->path));
        if (!$this->storage->replaceContent((int) $file['id'], 'text/plain', $parts[0]->path, null, (int) $revision)) {
            $current = $this->storage->entry((int) $file['id']);
            throw new Failure('A fájl időközben módosult.', 409, [], ['conflict' => ['revision' => (string) $current['revision'], 'modified_at' => $current['modified_at'], 'size' => (int) $current['size']]]);
        }
        $saved = $this->storage->entry((int) $file['id']);
        return ['id' => (string) $saved['id'], 'revision' => (string) $saved['revision'], 'size' => (int) $saved['size'], 'modified_at' => $saved['modified_at']];
    }
}

<?php
declare(strict_types=1);
namespace Blade\Files;

use Blade\Feature\{Action, Context, DownloadStream, Failure, Field, Registry, StreamedDownload, Upload, UploadPolicy, Usages};
use Blade\I18n\Translator;

/**
 * Registered file actions. The executor has already authenticated, checked channel/scope and the
 * ACL of the target mount and opened the transaction; handlers add item-level checks.
 */
final class FileActions
{
    /** Listing window: default and largest `limit`; an opaque cursor never exceeds CURSOR_BYTES. */
    private const PAGE_SIZE = 100;
    private const PAGE_LIMIT = 200;
    private const CURSOR_BYTES = 512;
    private const TREE_LIMIT = 2000;
    private const TREE_FILE_LIMIT = 5000;
    private const SOURCE_LIMIT = 100;
    private const OPERATION_LIMIT = 5000;
    /** ZIP download: files, entries (files and folders) and stored bytes (no ZIP64: below 4 GiB with room for headers); manifest lifetime. */
    private const ZIP_FILES = 5000;
    private const ZIP_ENTRIES = 10000;
    private const ZIP_BYTES = 4294967296 - 67108864;
    private const ZIP_TTL = 300;

    /** Upload rules of the `upload` action, shared by the direct multipart request and the transfer protocol. */
    private readonly UploadPolicy $policy;
    /** Registry of the UsageProviders of this resource (delete preview and clearing). */
    private ?Registry $registry = null;

    public function __construct(private FileManagerDefinition $definition, private FileStorage $storage)
    {
        $this->policy = $definition->uploadPolicy(fn(Context $ctx, array $target, array $files): array => $this->preflight($ctx, $target, $files));
    }

    public function register(Registry $registry): void
    {
        $resource = $this->definition->resource;
        $this->registry = $registry;
        $decision = new Field('decision', 'Névütközés esetén', 'select', options: ['overwrite' => 'Felülírás', 'rename' => 'Átnevezés', 'skip' => 'Kihagyás']);
        $sources = new Field('sources', 'Kijelölt elemek', required: true, max: 2000);
        $entry = fn(Context $ctx, ?string $id): array => $this->target($id);
        $page = [new Field('limit', 'Elemszám', 'number', max: 3), new Field('cursor', 'Lapozási pozíció', max: self::CURSOR_BYTES),
            new Field('sort', 'Rendezés', 'select', options: ['name' => 'Név', 'modified' => 'Módosítva', 'size' => 'Méret', 'type' => 'Típus']),
            new Field('direction', 'Irány', 'select', options: ['asc' => 'Növekvő', 'desc' => 'Csökkenő']), new Field('search', 'Keresés', max: 100),
            new Field('type', 'Típus', 'select', options: ['directory' => 'Mappák', 'image' => 'Képek', 'video' => 'Videók', 'text' => 'Szöveg', 'other' => 'Egyéb'])];
        $archive = $this->definition->deletePolicy === 'archive';
        $actions = [
            new Action($resource, 'tree', 'Mappafa', [], fn(Context $ctx, array $target) => $this->tree($target), resolve: fn(Context $ctx, ?string $id) => $this->mount($id)),
            new Action($resource, 'list', 'Mappa tartalma', $page, fn(Context $ctx, array $target, array $values) => $this->listing($target, $values), resolve: $entry),
            new Action($resource, 'create_directory', 'Új mappa', [new Field('name', 'Mappa neve', required: true, max: 255)], fn(Context $ctx, array $target, array $values) => $this->createDirectory($target, $values['name']), resolve: $entry, write: true, icon: 'dxi dxi-plus'),
            new Action($resource, 'upload', 'Feltöltés', [$decision, new Field('relative_path', 'Relatív útvonal', max: 4096)], fn(Context $ctx, array $target, array $values) => $this->upload($ctx, $target, $values), resolve: $entry, write: true, icon: 'dxi dxi-file-import',
                upload: $this->policy),
            new Action($resource, 'copy', 'Másolás', [$sources, $decision], fn(Context $ctx, array $target, array $values) => $this->transfer($ctx, $target, $values, false), resolve: $entry, write: true, icon: 'dxi dxi-copy'),
            new Action($resource, 'move', 'Áthelyezés', [$sources, $decision], fn(Context $ctx, array $target, array $values) => $this->transfer($ctx, $target, $values, true), resolve: $entry, write: true, icon: 'dxi dxi-file-export'),
            new Action($resource, 'text_get', 'Szöveg megnyitása', [], fn(Context $ctx, array $target) => $this->textGet($target), resolve: $entry),
            new Action($resource, 'content_get', 'Megtekintés', [], fn(Context $ctx, array $target) => $this->contentGet($target), resolve: $entry, icon: 'dxi dxi-eye'),
            new Action($resource, 'content_stream', 'Médiatartalom', [], fn(Context $ctx, array $target) => $this->contentStream($target), resolve: $entry, get: true),
            new Action($resource, 'thumbnail_get', 'Bélyegkép', [], fn(Context $ctx, array $target) => $this->thumbnailGet($target), resolve: $entry, get: true),
            new Action($resource, 'delete', 'Törlés', [$sources, new Field('preview', 'Előnézet', 'checkbox')], fn(Context $ctx, array $target, array $values) => $this->delete($ctx, $target, $values), resolve: $entry, write: true, icon: 'dxi dxi-delete',
                confirm: ['title' => 'Törlés', 'severity' => 'danger', 'confirm_label' => 'Törlés', 'message' => $archive
                    ? '{count} kijelölt elem archiválódik. A mappák tartalma is archiválódik.' : '{count} kijelölt elem véglegesen törlődik. A mappák tartalma is törlődik.']),
            new Action($resource, 'rename', 'Átnevezés', [new Field('name', 'Új név', required: true, max: 255)], fn(Context $ctx, array $target, array $values) => $this->rename($target, $values['name']), resolve: $entry, write: true, icon: 'dxi dxi-pencil'),
            new Action($resource, 'download', 'Letöltés', [], fn(Context $ctx, array $target) => $this->download($target), resolve: $entry, icon: 'dxi dxi-download', get: true),
            new Action($resource, 'zip_prepare', 'ZIP-letöltés előkészítése', [$sources], fn(Context $ctx, array $target, array $values) => $this->zipPrepare($ctx, $target, $values), resolve: $entry),
            new Action($resource, 'zip_get', 'ZIP-letöltés', [], fn(Context $ctx, array $target) => $this->zipGet($ctx, $target), resolve: fn(Context $ctx, ?string $id) => $this->zipTarget($ctx, $id), get: true),
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

    /** Delete policy `archive`: deletes and overwrites archive the entry instead of removing or rewriting it. */
    private function archive(): bool { return $this->definition->deletePolicy === 'archive'; }

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

    /**
     * One server-sorted window of a directory: directories first, then the sort key and `id` (FileStorage::page);
     * `next` continues it, `total` counts the folder's entries, `matched` those passing search and type.
     */
    private function listing(array $target, array $values): array
    {
        $directory = $this->directory($target);
        $limit = ($values['limit'] ?? '') === '' ? self::PAGE_SIZE : (int) $values['limit'];
        if ($limit < 1 || $limit > self::PAGE_LIMIT) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['limit' => Translator::text('1 és {max} közötti egész szám adható meg.', ['max' => self::PAGE_LIMIT])]);
        $query = [($values['sort'] ?? '') ?: 'name', ($values['direction'] ?? '') ?: 'asc', $values['search'] ?? '', $values['type'] ?? ''];
        $after = $this->position($values['cursor'] ?? '', $directory, ...$query);
        [$rows, $more] = $this->storage->page((int) $directory['id'], $query[0], $query[1], $query[2], $query[3], $limit, $after);
        [$total, $matched] = $this->storage->counts((int) $directory['id'], $query[2], $query[3]);
        $chain = $this->storage->ancestry($directory);
        return [
            'directory' => ['id' => (string) $directory['id'], 'mount' => $directory['mount_id'], 'depth' => count($chain) - 1,
                'path' => array_map(fn($row) => ['id' => (string) $row['id'], 'name' => (int) $row['parent_id'] === 0 ? $this->label($row['mount_id']) : $row['name']], $chain)],
            'items' => $this->items($rows),
            'next' => $more ? $this->cursor(end($rows), $directory, ...$query) : null,
            'total' => $total, 'matched' => $matched,
        ];
    }

    /** Listing items with their thumbnail states (one derivative query per window). */
    private function items(array $rows): array
    {
        $thumbnails = $rows ? $this->storage->thumbnails($rows) : [];
        return array_map(static fn($row) => [
            'id' => (string) $row['id'], 'name' => $row['name'], 'kind' => $row['kind'], 'extension' => $row['extension'], 'mime_type' => $row['mime_type'],
            'size' => (int) $row['size'], 'modified_at' => $row['modified_at'], 'revision' => (string) $row['revision'],
            'width' => $row['width'] !== null ? (int) $row['width'] : null, 'height' => $row['height'] !== null ? (int) $row['height'] : null,
            'duration_ms' => $row['duration_ms'] !== null ? (int) $row['duration_ms'] : null, 'orientation' => $row['orientation'], 'thumbnail' => $thumbnails[(int) $row['id']],
        ], array_values($rows));
    }

    /** Binds a cursor to the space, directory and search text without carrying the text itself. */
    private function scope(array $directory, string $search): string
    {
        return substr(hash('sha256', $this->definition->space."\0".$directory['id']."\0".$search), 0, 16);
    }

    /** Opaque keyset cursor after $row: query, scope, kind rank, id and the sort keys (omitted when too long; then re-read by id). */
    private function cursor(array $row, array $directory, string $sort, string $direction, string $search, string $type): string
    {
        $position = FileStorage::position($row, $sort);
        $base = [1, $sort, $direction, $type, $this->scope($directory, $search), $position['rank'], $position['id']];
        $encode = static fn(array $data): string => rtrim(strtr(base64_encode(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
        $cursor = $encode([...$base, $position['keys']]);
        return strlen($cursor) <= self::CURSOR_BYTES ? $cursor : $encode([...$base, null]);
    }

    /** Keyset position of a cursor; one of another query, folder or search, or a malformed one, is stale (400). */
    private function position(string $cursor, array $directory, string $sort, string $direction, string $search, string $type): ?array
    {
        if ($cursor === '') return null;
        $stale = static fn() => new Failure('A lista időközben megváltozott. Töltsd be újra.', 400, [], ['code' => 'stale_cursor']);
        $json = preg_match('/^[A-Za-z0-9_-]{1,'.self::CURSOR_BYTES.'}$/D', $cursor) ? base64_decode(strtr($cursor, '-_', '+/'), true) : false;
        $data = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($data) || !array_is_list($data) || count($data) !== 8 || $data[0] !== 1 || $data[1] !== $sort || $data[2] !== $direction || $data[3] !== $type
            || !is_string($data[4]) || !hash_equals($this->scope($directory, $search), $data[4]) || !in_array($data[5], [0, 1], true) || !is_int($data[6]) || $data[6] < 1
            || ($type === 'directory' && $data[5] === 1) || ($type !== '' && $type !== 'directory' && $data[5] === 0)) throw $stale();
        $keys = $data[7];
        if ($keys === null) {
            $row = $this->storage->entry($data[6]);
            if (!$row || (int) $row['parent_id'] !== (int) $directory['id'] || ($row['kind'] === 'directory' ? 0 : 1) !== $data[5]) throw $stale();
            $keys = FileStorage::position($row, $sort)['keys'];
        }
        $columns = FileStorage::SORTS[$sort][$data[5]];
        if (!is_array($keys) || !array_is_list($keys) || count($keys) !== count($columns)) throw $stale();
        foreach ($columns as $index => $column) if ($column === 'size' ? !is_int($keys[$index]) : !is_string($keys[$index])) throw $stale();
        return ['rank' => $data[5], 'keys' => $keys, 'id' => $data[6]];
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

    /**
     * First violated domain rule as ['code' => ..., 'error' => ...]: the depth below the mount root, then the
     * MIME type detected from the content (never the browser's value). The executor has already applied the
     * policy's quota, upload-error, name, type, size and folder rules and removed the parts violating them.
     */
    private function rejected(Upload $file, string $path, int $depth): ?array
    {
        if ($depth + count(UploadPolicy::segments($file->name, $path)) > $this->definition->maxDepth) return ['code' => 'depth', 'error' => $this->tooDeep()];
        if (!FileManagerDefinition::contentMatches(FileStorage::extension($file->name), $file->path)) return ['code' => 'content_mismatch', 'error' => Translator::text('A fájl tartalma nem felel meg a kiterjesztésnek.')];
        return null;
    }

    private function tooDeep(): string
    {
        return Translator::text('A mappák legfeljebb {depth} szint mélyek lehetnek.', ['depth' => $this->definition->maxDepth]);
    }

    private function conflictMessage(): string { return Translator::text('Ilyen nevű elem már létezik ebben a mappában.'); }

    /** Existing directory reached by $segments below $directory; null when one is missing, false when a file blocks the path. */
    private function existingParent(array $directory, array $segments): array|false|null
    {
        foreach ($segments as $segment) {
            $child = $this->storage->child((int) $directory['id'], $segment);
            if (!$child) return null;
            if ($child['kind'] !== 'directory') return false;
            $directory = $child;
        }
        return $directory;
    }

    /**
     * Transfer preflight (no writes): depth of the folder path below the mount root and name conflicts
     * that need a decision (`ask`) or fail (`reject`); a conflicting file's references (`usages`) warn that an
     * overwrite under `archive` clears them. Names, types and sizes are the policy's own checks.
     */
    private function preflight(Context $ctx, array $target, array $files): array
    {
        $directory = $this->directory($target);
        $depth = count($this->storage->ancestry($directory)) - 1;
        $out = [];
        foreach ($files as $index => $file) {
            $segments = UploadPolicy::segments($file['name'], $file['relative_path']) ?? [];
            if ($depth + count($segments) > $this->definition->maxDepth) { $out[$index] = ['code' => 'depth', 'message' => $this->tooDeep()]; continue; }
            $parent = $this->existingParent($directory, $segments);
            if ($parent === false) { $out[$index] = ['code' => 'conflict', 'message' => $this->conflictMessage(), 'conflict' => ['existing_kind' => 'file']]; continue; }
            $existing = $parent && in_array($this->definition->duplicatePolicy, ['ask', 'reject'], true) ? $this->storage->child((int) $parent['id'], $file['name']) : null;
            if ($existing) $out[$index] = ['code' => 'conflict', 'message' => $this->conflictMessage(), 'conflict' => ['existing_kind' => $existing['kind'],
                ...(($usages = $existing['kind'] === 'file' ? $this->usages($ctx, [(string) $existing['id']]) : []) ? ['usages' => $usages] : [])]];
        }
        return $out;
    }

    /**
     * Multipart `files` parts (direct request, or one assembled transfer file) that passed the executor's
     * policy checks (batch quota, `relative_path` with one file only, name, type, size). `relative_path` places
     * the file below the target, creating missing directories; results carry per-file codes, and the executor
     * prepends the parts it rejected to `failed`.
     */
    private function upload(Context $ctx, array $target, array $values): array
    {
        $directory = $this->directory($target);
        $depth = count($this->storage->ancestry($directory)) - 1;
        if ($depth > $this->definition->maxDepth) throw new Failure('A célmappa túl mélyen van.');
        $files = array_values(array_filter($ctx->uploads, static fn(Upload $upload) => $upload->field === 'files'));
        if (!$files) throw new Failure('Válassz feltöltendő fájlt.');
        $path = $values['relative_path'] ?? '';
        $policy = $this->definition->duplicatePolicy === 'ask' ? ($values['decision'] ?? '') : $this->definition->duplicatePolicy;
        $accepted = $failed = $conflicts = $names = [];
        foreach ($files as $file) {
            $error = $this->rejected($file, $path, $depth);
            $key = mb_strtolower($file->name, 'UTF-8');
            if ($error === null && isset($names[$key])) $error = ['code' => 'conflict', 'error' => Translator::text('Azonos nevű fájl többször szerepel a kijelölésben.')];
            $segments = $error === null ? UploadPolicy::segments($file->name, $path) : [];
            $parent = $error === null ? $this->existingParent($directory, $segments) : null;
            if ($parent === false) $error = ['code' => 'conflict', 'error' => $this->conflictMessage()];
            if ($error !== null) {
                $failed[] = ['name' => UploadPolicy::shown($file->name), ...$error];
                continue;
            }
            $names[$key] = true;
            $existing = $parent ? $this->storage->child((int) $parent['id'], $file->name) : null;
            if ($existing) $conflicts[] = ['name' => $file->name, 'kind' => 'file', 'existing_kind' => $existing['kind'], 'existing' => $existing['kind'] === 'file' ? (string) $existing['id'] : null];
            $accepted[] = [$file, $segments];
        }
        if (!$accepted) throw new Failure('Egyik fájl sem tölthető fel.', 400, [], ['code' => $failed[0]['code'], 'failed' => $failed]);
        if ($conflicts && $policy === '') throw $this->conflict($ctx, $conflicts, ['failed' => $failed]);
        $succeeded = $skipped = $created = $replaced = $archived = $directories = [];
        foreach ($accepted as [$file, $segments]) {
            $name = $file->name;
            $mime = FileManagerDefinition::TYPES[FileStorage::extension($name)][0];
            $parent = $directory;
            foreach ($segments as $segment) {
                $found = $this->storage->directory($parent, $segment);
                if ($found === null) { $failed[] = ['name' => $name, 'code' => 'conflict', 'error' => $this->conflictMessage()]; continue 2; }
                [$parent, $new] = $found;
                if ($new) $directories[] = (string) $parent['id'];
            }
            // The parent row is locked before the name check (MySQL), so concurrent stores of one name serialize into a decision or a free name, never a duplicate key.
            $this->storage->locked((int) $parent['id']);
            $existing = $this->storage->child((int) $parent['id'], $name, true);
            if ($existing && $policy === 'skip') { $skipped[] = ['name' => $name]; continue; }
            if ($existing && $policy === 'reject') { $failed[] = ['name' => $name, 'code' => 'conflict', 'error' => $this->conflictMessage()]; continue; }
            if ($existing && $policy === 'overwrite' && $existing['kind'] !== 'file') { $failed[] = ['name' => $name, 'code' => 'conflict', 'error' => Translator::text('Mappa nem írható felül.')]; continue; }
            if ($existing && $policy === 'overwrite') {
                // `archive` keeps the replaced file as an archived entry and stores the upload as a new one; `delete` replaces the content in place.
                $id = (string) $existing['id'];
                if ($this->archive()) {
                    $this->storage->archiveTree([$existing], $ctx->actor->id);
                    $id = (string) $this->storage->createFile($parent, $name, $mime, $file->path);
                    $archived[] = (string) $existing['id'];
                } else $this->storage->replaceContent((int) $existing['id'], $mime, $file->path);
                $succeeded[] = ['id' => $id, 'name' => $name, 'parent' => (string) $parent['id'], 'replaced' => (string) $existing['id']];
                $replaced[] = $id;
                continue;
            }
            if ($existing) $name = $this->storage->freeName((int) $parent['id'], $name, 'file', true);
            $id = (string) $this->storage->createFile($parent, $name, $mime, $file->path);
            $succeeded[] = ['id' => $id, 'name' => $name, 'parent' => (string) $parent['id']];
            $created[] = $id;
        }
        // Each stored file also carries its listing item, so the client inserts it in place.
        $items = $succeeded ? array_column($this->items($this->storage->entries(array_column($succeeded, 'id'))), null, 'id') : [];
        foreach ($succeeded as &$item) $item['item'] = $items[$item['id']] ?? null;
        unset($item);
        // Archived (replaced) files are gone for every reader: their references are cleared like a delete's. An in-place rewrite keeps the id and its references.
        $cleared = $this->cleared($ctx, $archived);
        return ['succeeded' => $succeeded, 'skipped' => $skipped, 'failed' => $failed, 'cleared' => $cleared,
            'audit' => ['directory' => (string) $directory['id'], 'created' => $created, 'replaced' => $replaced, 'archived' => $archived, 'directories' => $directories, 'skipped' => count($skipped), 'failed' => count($failed), ...($cleared ? ['cleared' => $cleared] : [])]];
    }

    /** Copy or move into the target directory. Every check precedes the first write; one transaction. */
    private function transfer(Context $ctx, array $target, array $values, bool $move): array
    {
        $destination = $this->directory($target);
        $ids = $this->ids($values['sources']);
        $chain = array_map(static fn($row) => (int) $row['id'], $this->storage->ancestry($destination));
        $items = [];
        foreach ($ids as $id) {
            $row = $this->storage->entry($id);
            if (!$row || !isset($this->definition->mounts[$row['mount_id']])) throw new Failure('Nem található elem.', 404);
            // Read permission on every source item; a copy also reads the bytes (`download`), a move changes the source location.
            foreach ($move ? ['list', 'move'] : ['list', 'download'] as $right) $this->may($ctx, $right, $row['mount_id']);
            if ((int) $row['parent_id'] === 0) throw new Failure('A meghajtó gyökere nem másolható és nem helyezhető át.');
            $items[$id] = $row;
        }
        $this->nested($items);
        foreach ($items as $id => $row) {
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
            if ($existing || isset($planned[$key])) $conflicts[] = ['id' => (string) $id, 'name' => $row['name'], 'kind' => $row['kind'], 'existing_kind' => $existing['kind'] ?? $planned[$key], 'existing' => ($existing['kind'] ?? null) === 'file' ? (string) $existing['id'] : null];
            $planned[$key] = $row['kind'];
            // A moved folder's top row is locked before its subtree is read (MySQL), so a concurrent delete or move of it waits.
            if ($move && $row['kind'] === 'directory') $row = $this->storage->locked((int) $row['id']) ?? throw new Failure('Az elem időközben módosult.', 409);
            $subtree = $this->storage->subtree($row, self::OPERATION_LIMIT - $total);
            if ($subtree === null) throw new Failure('Egy műveletben legfeljebb 5000 elem kezelhető.', 413);
            $total += count($subtree);
            $height = max(array_map(static fn($entry) => $entry['kind'] === 'directory' ? $entry['relative'] : -1, $subtree));
            if ($height >= 0 && count($chain) + $height > $this->definition->maxDepth) $tooDeep[] = $row['name'];
            $plans[] = [$row, $subtree, null];
        }
        if ($tooDeep) throw new Failure(Translator::text('A művelet túllépné a megengedett {depth} szintes mappamélységet: {names}.', ['depth' => $this->definition->maxDepth, 'names' => implode(', ', $tooDeep)]), 400, [], ['too_deep' => $tooDeep]);
        if ($conflicts && $decision === '') throw $this->conflict($ctx, $conflicts);

        $succeeded = $skipped = $failed = $archived = $removed = [];
        foreach ($plans as [$row, $subtree, $error]) {
            $source = (string) $row['id'];
            $existing = $error === null ? $this->storage->child((int) $destination['id'], $row['name']) : null;
            if ($existing && $decision === 'skip') { $skipped[] = ['source' => $source, 'name' => $row['name']]; continue; }
            if ($existing && $decision === 'overwrite' && ((int) $existing['id'] === (int) $row['id'] || $existing['kind'] !== 'file' || $row['kind'] !== 'file')) {
                $error = (int) $existing['id'] === (int) $row['id'] ? 'Egy elem önmagát nem írhatja felül.' : 'Mappa nem írható felül; válaszd az átnevezést vagy a kihagyást.';
            }
            if ($error !== null) { $failed[] = ['source' => $source, 'name' => $row['name'], 'error' => Translator::text($error)]; continue; }
            $name = $existing && $decision === 'rename' ? $this->storage->freeName((int) $destination['id'], $row['name'], $row['kind']) : $row['name'];
            // Overwrite: `archive` archives the replaced file and the incoming one takes its place as a new entry (a copy) or
            // as the moved entry; `delete` rewrites the target in place (copy) or removes it (move).
            if ($existing && $decision === 'overwrite' && $this->archive()) { $this->storage->archiveTree([$existing], $ctx->actor->id); $archived[] = (string) $existing['id']; }
            elseif ($existing && $decision === 'overwrite' && !$move) {
                $this->storage->replaceFrom((int) $existing['id'], $row);
                $succeeded[] = ['source' => $source, 'id' => (string) $existing['id'], 'name' => $name];
                continue;
            } elseif ($existing && $decision === 'overwrite') { $this->storage->removeFile((int) $existing['id']); $removed[] = (string) $existing['id']; }
            if ($move) $this->storage->moveTree($subtree, $destination, $name);
            $id = $move ? $source : (string) $this->storage->copyTree($subtree, $destination, $name);
            $succeeded[] = ['source' => $source, 'id' => $id, 'name' => $name];
        }
        // Replaced files that are gone (archived, or removed by a move) lose their references; an in-place copy overwrite keeps the id and them.
        $cleared = $this->cleared($ctx, [...$archived, ...$removed]);
        return ['succeeded' => $succeeded, 'skipped' => $skipped, 'failed' => $failed, 'cleared' => $cleared, 'audit' => [
            'target' => (string) $destination['id'], 'sources' => array_map('strval', $ids),
            'succeeded' => array_map(static fn($item) => $item['source'].'>'.$item['id'], $succeeded),
            'skipped' => array_column($skipped, 'source'), 'failed' => array_column($failed, 'source'), 'archived' => $archived,
            ...($removed ? ['removed' => $removed] : []), ...($cleared ? ['cleared' => $cleared] : []),
        ]];
    }

    /** UsageProviders of this resource. */
    private function providers(): array { return $this->registry?->usageProviders($this->definition->resource) ?? []; }

    /** Reference counts over file ids (Usages::count). */
    private function usages(Context $ctx, array $files): array { return $files ? Usages::count($ctx, $this->providers(), $files) : []; }

    /** Clears the references to replaced files that no longer exist; label => count before clearing. */
    private function cleared(Context $ctx, array $files): array
    {
        if (!$files) return [];
        return Usages::clear($ctx, $this->providers(), $files, $this->definition->deletePolicy, $this->usages($ctx, $files));
    }

    /**
     * 409 of conflicts awaiting a decision: `conflicts` (without internal ids of the existing entries) and `usages`, the
     * references to the conflicting existing files, so the dialog can warn before an overwrite.
     */
    private function conflict(Context $ctx, array $conflicts, array $details = []): Failure
    {
        $usages = $this->usages($ctx, array_values(array_filter(array_column($conflicts, 'existing'))));
        return new Failure('Névütközés a célmappában.', 409, [], ['conflicts' => array_map(static fn($item) => array_diff_key($item, ['existing' => true]), $conflicts), ...$details, 'usages' => $usages]);
    }

    /** Comma-separated source ids (≤ SOURCE_LIMIT, distinct). @return list<int> */
    private function ids(string $sources): array
    {
        $ids = array_map('intval', explode(',', $sources));
        if (!preg_match('/^[1-9][0-9]{0,17}(,[1-9][0-9]{0,17})*$/D', $sources) || count($ids) > self::SOURCE_LIMIT || count(array_unique($ids)) !== count($ids)) throw new Failure('Hibás vagy túl nagy kijelölés.');
        return $ids;
    }

    /** Item-level right on a source's mount (the executor checked the target's). */
    private function may(Context $ctx, string $right, string $mount): void
    {
        if (!$ctx->acl->allows($ctx->actor->id, $this->definition->resource, $right, $ctx->channel, $mount)) throw new Failure('Nincs hozzáférés.', 403);
    }

    /** A selection must not contain an entry together with one of its ancestors. */
    private function nested(array $items): void
    {
        foreach ($items as $row) foreach (array_slice($this->storage->ancestry($row), 0, -1) as $ancestor) {
            if (isset($items[(int) $ancestor['id']])) throw new Failure('A kijelölés egymásba ágyazott elemeket tartalmaz.');
        }
    }

    /**
     * Deletes the selected entries with the definition's policy: `archive` marks each subtree (hidden from every read,
     * name free again, content kept), `delete` removes rows and derivatives and queues content collection. The
     * `delete` right is checked on every source's mount; a mount root is refused; ≤ 5000 entries; one transaction.
     * Sources gone meanwhile are reported as failed. `preview: '1'` changes nothing and returns `{count, entries, usages}`:
     * the selected entries, every entry of their subtrees and the UsageProviders' reference counts over all their files.
     * An applied delete calls the providers' clear() under both policies and reports `cleared` (label => count).
     */
    private function delete(Context $ctx, array $target, array $values): array
    {
        $directory = $this->directory($target);
        $policy = $this->definition->deletePolicy;
        $ids = $this->ids($values['sources']);
        $items = $failed = $plans = [];
        foreach ($ids as $id) {
            $row = $this->storage->entry($id);
            if (!$row || !isset($this->definition->mounts[$row['mount_id']])) { $failed[] = ['source' => (string) $id, 'name' => '', 'error' => Translator::text('Nem található elem.')]; continue; }
            $this->may($ctx, 'delete', $row['mount_id']);
            if ((int) $row['parent_id'] === 0) throw new Failure('A meghajtó gyökere nem törölhető.');
            $items[$id] = $row;
        }
        $this->nested($items);
        $total = 0;
        foreach ($items as $id => $row) {
            // The top row is locked first (MySQL), so concurrent deletes and moves of the same entry serialize on it.
            $row = $this->storage->locked((int) $id) ?? throw new Failure('Az elem időközben módosult.', 409);
            // Removal also takes archived descendants, so no orphaned rows keep content referenced.
            $subtree = $this->storage->subtree($row, self::OPERATION_LIMIT - $total, $policy === 'delete');
            if ($subtree === null || ($total += count($subtree)) > self::OPERATION_LIMIT) throw new Failure('Egy műveletben legfeljebb 5000 elem kezelhető.', 413);
            $plans[$id] = $subtree;
        }
        $files = [];
        foreach ($plans as $subtree) foreach ($subtree as $row) if ($row['kind'] === 'file') $files[] = (string) $row['id'];
        $providers = $this->providers();
        $usages = Usages::count($ctx, $providers, $files);
        // The preview changes nothing; it is journaled as `delete_preview` (ACL decision on `delete`).
        if (($values['preview'] ?? '0') === '1') return ['count' => count($plans), 'entries' => $total, 'usages' => $usages, 'failed' => $failed, 'audit_action' => 'delete_preview',
            'audit' => ['target' => (string) $directory['id'], 'sources' => array_map('strval', $ids), 'entries' => $total]];
        foreach ($plans as $subtree) $policy === 'delete' ? $this->storage->deleteTree($subtree) : $this->storage->archiveTree($subtree, $ctx->actor->id);
        $cleared = Usages::clear($ctx, $providers, $files, $policy, $usages);
        $succeeded = array_map(static fn($id) => ['source' => (string) $id], array_keys($plans));
        return ['succeeded' => $succeeded, 'failed' => $failed, 'policy' => $policy, 'cleared' => $cleared, 'audit' => [
            'target' => (string) $directory['id'], 'sources' => array_map('strval', $ids), 'succeeded' => array_column($succeeded, 'source'),
            'failed' => array_column($failed, 'source'), 'entries' => $total, 'policy' => $policy, ...($cleared ? ['cleared' => $cleared] : []),
        ]];
    }

    /** Renames in place under the safe-name rule; a file's new extension must keep its stored MIME type and be allowed. */
    private function rename(array $target, string $name): array
    {
        $row = $target['row'];
        if ((int) $row['parent_id'] === 0) throw new Failure('A meghajtó gyökere nem nevezhető át.');
        $error = FileStorage::invalidName($name);
        if ($error === null && $row['kind'] === 'file' && !$this->keepsType($row, $name)) $error = 'A kiterjesztés csak azonos fájltípusú, engedélyezett kiterjesztésre változhat.';
        if ($error !== null) throw new Failure('Javítsd a megjelölt mezőket.', 400, ['name' => $error]);
        // A folder's row is locked (MySQL) like a move's, so a rename and a concurrent delete or move of it serialize.
        if ($row['kind'] === 'directory' && !$this->storage->locked((int) $row['id'])) throw new Failure('Az elem időközben módosult.', 409);
        $existing = $this->storage->child((int) $row['parent_id'], $name);
        if ($existing && (int) $existing['id'] !== (int) $row['id']) throw new Failure('Javítsd a megjelölt mezőket.', 409, ['name' => 'Ilyen nevű elem már létezik ebben a mappában.']);
        if (!$this->storage->rename($row, $name)) throw new Failure('Az elem időközben módosult.', 409);
        $saved = $this->storage->entry((int) $row['id']);
        return ['id' => (string) $saved['id'], 'name' => $saved['name'], 'revision' => (string) $saved['revision'], 'item' => $this->items([$saved])[0], 'audit' => ['parent' => (string) $saved['parent_id']]];
    }

    private function keepsType(array $row, string $name): bool
    {
        $extension = FileStorage::extension($name);
        if ($extension === FileStorage::extension($row['name'])) return true;
        return in_array($extension, $this->definition->allowedExtensions, true) && FileManagerDefinition::TYPES[$extension][0] === $row['mime_type'];
    }

    /** GET-capable download of any stored file: `attachment` with its name, single range, `no-store`. */
    private function download(array $target): DownloadStream
    {
        $row = $target['row'];
        if ($row['kind'] !== 'file') throw new Failure('A kijelölt elem nem fájl.');
        $mime = preg_match('~^[a-z]+/[a-z0-9.+-]+$~D', $row['mime_type']) ? $row['mime_type'] : 'application/octet-stream';
        return new DownloadStream($mime, $this->stored($row), (int) $row['size'], '"'.($row['sha256'] ?: 'r'.$row['revision']).'"', ['size' => (int) $row['size']], 'attachment', $row['name'], null);
    }

    /**
     * Entries of a ZIP of the selected sources: the `download` right on every source's mount, no nesting, archive
     * paths from the selected roots' names (unique per archive, case-insensitively), folders before their content,
     * within the file, entry and byte limits (413).
     */
    private function zipPlan(Context $ctx, array $ids): array
    {
        $items = [];
        foreach ($ids as $id) {
            $row = $this->storage->entry($id);
            if (!$row || !isset($this->definition->mounts[$row['mount_id']])) throw new Failure('Nem található elem.', 404);
            $this->may($ctx, 'download', $row['mount_id']);
            $items[$id] = $row;
        }
        $this->nested($items);
        $entries = $taken = [];
        $files = $bytes = 0;
        $segment = self::segment(...);
        foreach ($items as $row) {
            $subtree = $this->storage->subtree($row, self::ZIP_ENTRIES - count($entries));
            if ($subtree === null || count($entries) + count($subtree) > self::ZIP_ENTRIES) throw $this->zipTooLarge(count($entries) + 1, $bytes);
            $top = $segment((int) $row['parent_id'] === 0 ? $this->label($row['mount_id']) : $row['name']);
            for ($i = 2, $base = $top; isset($taken[mb_strtolower($top, 'UTF-8')]); $i++) {
                $dot = $row['kind'] === 'file' ? strrpos($base, '.') : false;
                $top = $dot ? substr($base, 0, $dot).' ('.$i.')'.substr($base, $dot) : $base.' ('.$i.')';
            }
            $taken[mb_strtolower($top, 'UTF-8')] = true;
            $paths = [];
            foreach ($subtree as $entry) {
                $paths[(int) $entry['id']] = $path = $entry['relative'] === 0 ? $top : $paths[(int) $entry['parent_id']].'/'.$segment($entry['name']);
                if ($entry['kind'] === 'file') { $files++; $bytes += (int) $entry['size']; }
                $entries[] = ['path' => $path, 'row' => $entry];
            }
        }
        // Room for the closing MISSING note of zipGet() in the worst case (every file missing; 512 bytes for its heading).
        $note = 512 + array_sum(array_map(static fn($entry) => $entry['row']['kind'] === 'file' ? strlen($entry['path']) + 1 : 0, $entries));
        $length = ZipStream::length([...array_map(static fn($entry) => [$entry['path'], (int) $entry['row']['size'], $entry['row']['kind'] === 'directory'], $entries), ['MISSING-00000 (00000).txt', $note, false]]);
        if ($files > self::ZIP_FILES || $bytes > self::ZIP_BYTES || $length > ZipStream::MAX_BYTES) throw $this->zipTooLarge($files, $bytes);
        return ['items' => $items, 'entries' => $entries, 'files' => $files, 'bytes' => $bytes];
    }

    /**
     * One archive path segment under the safe-name rule (UploadPolicy::invalidName): separators, control and format
     * characters become `_`, surrounding spaces go, an empty or dot-only result is `_`. Stored names already pass;
     * this guards the top-level segment, which may be a (translated) mount label.
     */
    private static function segment(string $name): string
    {
        $name = trim((string) preg_replace('~[/\\\\]|\p{Cc}|\p{Cf}~u', '_', preg_match('//u', $name) === 1 ? $name : mb_convert_encoding($name, 'UTF-8', 'UTF-8')));
        if (mb_strlen($name, 'UTF-8') > 255) $name = rtrim(mb_substr($name, 0, 255, 'UTF-8'));
        return UploadPolicy::invalidName($name) === null ? $name : '_';
    }

    private function zipTooLarge(int $files, int $bytes): Failure
    {
        return new Failure('A kijelölés túl nagy a ZIP-letöltéshez.', 413, [], ['files' => $files, 'bytes' => $bytes, 'max_files' => self::ZIP_FILES, 'max_bytes' => self::ZIP_BYTES]);
    }

    private function zipPath(string $token): string { return rtrim($this->definition->temporaryRoot(), '/').'/zip-'.$token.'.json'; }

    /**
     * Short-lived ZIP manifest (no archive bytes): source ids under the definition's temporary root, bound to actor,
     * channel and session owner, single-use, expiring after ZIP_TTL seconds.
     */
    private function zipPrepare(Context $ctx, array $target, array $values): array
    {
        $directory = $this->directory($target);
        if (!preg_match('/^[0-9a-f]{64}$/D', $ctx->owner)) throw new Failure('Érvénytelen munkamenet.', 403);
        $ids = $this->ids($values['sources']);
        $plan = $this->zipPlan($ctx, $ids);
        $name = count($plan['items']) === 1 ? $plan['entries'][0]['path'] : ((int) $directory['parent_id'] === 0 ? $this->label($directory['mount_id']) : $directory['name']);
        $root = rtrim($this->definition->temporaryRoot(), '/');
        if (!is_dir($root) && !@mkdir($root, 02770, true) && !is_dir($root)) throw new \RuntimeException('Cannot create the temporary root.');
        $this->sweepZips($root);
        $token = bin2hex(random_bytes(16));
        $manifest = ['token' => $token, 'actor' => $ctx->actor->id, 'channel' => $ctx->channel, 'owner' => $ctx->owner, 'resource' => $this->definition->resource,
            'directory' => (string) $directory['id'], 'mount' => reset($plan['items'])['mount_id'], 'sources' => array_map('strval', $ids), 'name' => $name, 'expires_at' => time() + self::ZIP_TTL];
        $temporary = $root.'/zip-'.$token.'.'.bin2hex(random_bytes(6)).'.tmp';
        if (file_put_contents($temporary, json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) === false) throw new \RuntimeException('Cannot write the ZIP manifest.');
        @chmod($temporary, 0660);
        if (!rename($temporary, $this->zipPath($token))) { @unlink($temporary); throw new \RuntimeException('Cannot write the ZIP manifest.'); }
        return ['token' => $token, 'name' => $name, 'count' => $plan['files'], 'bytes' => $plan['bytes'],
            'audit' => ['target' => (string) $directory['id'], 'sources' => array_map('strval', $ids), 'files' => $plan['files'], 'bytes' => $plan['bytes']]];
    }

    /** Bounded removal of expired manifests (no cron). */
    private function sweepZips(string $root): void
    {
        $listing = @opendir($root);
        if ($listing === false) return;
        for ($seen = $removed = 0; $removed < 20 && $seen++ < 2000 && ($entry = readdir($listing)) !== false;) {
            if (!preg_match('/^zip-[0-9a-f]{32}\.json$/D', $entry) || (int) @filemtime($root.'/'.$entry) > time() - self::ZIP_TTL) continue;
            $manifest = json_decode((string) @file_get_contents($root.'/'.$entry), true);
            if (!is_int($manifest['expires_at'] ?? null) || $manifest['expires_at'] < time()) { @unlink($root.'/'.$entry); $removed++; }
        }
        closedir($listing);
    }

    /** Manifest of a token owned by this actor, channel and session; anything else is indistinguishable from unknown (404). ACL object: the first source mount. */
    private function zipTarget(Context $ctx, ?string $id): array
    {
        $path = $id !== null && preg_match('/^[0-9a-f]{32}$/D', $id) ? $this->zipPath($id) : null;
        $manifest = $path !== null && is_file($path) ? json_decode((string) @file_get_contents($path), true) : null;
        if (!is_array($manifest) || ($manifest['token'] ?? null) !== $id || $ctx->owner === '' || !is_string($manifest['owner'] ?? null) || !hash_equals($manifest['owner'], $ctx->owner)
            || ($manifest['actor'] ?? null) !== $ctx->actor->id || ($manifest['channel'] ?? null) !== $ctx->channel || ($manifest['resource'] ?? null) !== $this->definition->resource
            || !is_int($manifest['expires_at'] ?? null) || !is_array($manifest['sources'] ?? null) || !is_string($manifest['name'] ?? null) || !isset($this->definition->mounts[$manifest['mount'] ?? ''])) throw new Failure('Nem található letöltés.', 404);
        if ($manifest['expires_at'] < time()) { @unlink($path); throw new Failure('Nem található letöltés.', 404); }
        return ['id' => (string) $manifest['directory'], 'acl_id' => $manifest['mount'], 'owner' => null, 'manifest' => $manifest, 'path' => $path];
    }

    /**
     * Re-authorizes every source mount, consumes the manifest and streams the archive (ZipStream, no temporary copy).
     * A file whose content cannot be read is left out and named in a closing `MISSING-<n>.txt` entry (n: the number of
     * missing files); the files already unreadable before the first byte are counted in the audit (`missing`). zipPlan()
     * reserves the note's worst-case size in the archive length limit.
     */
    private function zipGet(Context $ctx, array $target): StreamedDownload
    {
        $manifest = $target['manifest'];
        $ids = array_map('intval', array_filter($manifest['sources'], static fn($id) => is_string($id) && preg_match('/^[1-9][0-9]{0,17}$/D', $id)));
        if (!$ids || count($ids) !== count($manifest['sources'])) throw new Failure('Nem található letöltés.', 404);
        $plan = $this->zipPlan($ctx, $ids);
        // Single use: only the request that removes the manifest streams.
        if (!@unlink($target['path'])) throw new Failure('Nem található letöltés.', 404);
        $entries = array_map(fn($entry) => [$entry['path'], $entry['row']['kind'], $entry['row']['kind'] === 'file' && $entry['row']['storage_key'] !== '' && ContentStore::valid($entry['row']['storage_key']) ? $this->storage->path($entry['row']) : '', $entry['row']['modified_at']], $plan['entries']);
        $missing = count(array_filter($entries, static fn($entry) => $entry[1] === 'file' && ($entry[2] === '' || !is_file($entry[2]) || !is_readable($entry[2]))));
        $taken = array_flip(array_map(static fn($entry) => mb_strtolower($entry[0], 'UTF-8'), $entries));
        $heading = Translator::text('Az alábbi fájlok tartalma nem érhető el, ezért kimaradtak az archívumból:');
        return new StreamedDownload('application/zip', $manifest['name'].'.zip', static function () use ($entries, $taken, $heading): void {
            $zip = new ZipStream();
            $lost = [];
            foreach ($entries as [$path, $kind, $source, $modified]) {
                if (connection_aborted()) return;
                if ($kind === 'directory') $zip->directory($path, $modified);
                elseif ($source === '' || !$zip->file($path, $source, $modified)) $lost[] = $path;
            }
            if ($lost) {
                $name = 'MISSING-'.count($lost).'.txt';
                for ($i = 2; isset($taken[mb_strtolower($name, 'UTF-8')]); $i++) $name = 'MISSING-'.count($lost).' ('.$i.').txt';
                $zip->content($name, $heading."\n".implode("\n", $lost)."\n");
            }
            $zip->finish();
        }, ['sources' => array_map('strval', $ids), 'files' => $plan['files'], 'bytes' => $plan['bytes'], 'missing' => $missing]);
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

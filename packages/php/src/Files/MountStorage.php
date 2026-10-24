<?php
declare(strict_types=1);
namespace Blade\Files;

use Blade\Feature\{Context, Failure, Upload, UploadPolicy};
use Blade\I18n\Translator;

/**
 * Public storage API of one file manager for consumer code: find or create a folder of a mount and store an
 * uploaded file in it under the file manager's own rules (upload right on the mount, extension allowlist, size,
 * content type detected from the bytes, safe and free name). Obtained from FileManagerDefinition::files(); runs in
 * the caller's transaction (an action handler), so a failure rolls the consumer's own writes back too.
 */
final readonly class MountStorage
{
    public function __construct(private FileManagerDefinition $definition, private FileStorage $storage)
    {
    }

    /**
     * Live folder at $path ('' = the mount root, `A/B` below it) as a FileStorage row, or null when it is missing or a
     * file blocks the path; $create creates the missing folders (setup-time or inside an authorized action).
     */
    public function folder(string $mount, string $path = '', bool $create = false): ?array
    {
        if (!isset($this->definition->mounts[$mount])) throw new \InvalidArgumentException('Unknown file mount.');
        $segments = $path === '' ? [] : explode('/', $path);
        foreach ($segments as $segment) if (UploadPolicy::invalidName($segment) !== null) throw new \InvalidArgumentException('Invalid folder path.');
        if (count($segments) > $this->definition->maxDepth) throw new \InvalidArgumentException('The folder path is deeper than the file manager allows.');
        $folder = $this->storage->root($mount) ?? ($create ? $this->storage->entry($this->storage->ensureRoot($mount)) : null);
        foreach ($segments as $segment) {
            if (!$folder) return null;
            if ($create) {
                $found = $this->storage->directory($folder, $segment);
                $folder = $found ? $found[0] : null;
                continue;
            }
            $child = $this->storage->child((int) $folder['id'], $segment);
            $folder = $child && $child['kind'] === 'directory' ? $child : null;
        }
        return $folder;
    }

    /**
     * Stores $file in the folder $folderId (any mount of this file manager). The actor needs the `upload` right on
     * the folder's mount (and the `<resource>.upload` scope on the API channel); $accept narrows the MIME classes.
     * An existing name gets a free one ("name (2).ext"). Failures carry `details.code` as the uploader's codes.
     * @return array{id:string,name:string,mime_type:string,mount:string,parent:string}
     */
    public function store(Context $ctx, string $folderId, Upload $file, array $accept = []): array
    {
        $folder = preg_match('/^[1-9][0-9]{0,17}$/D', $folderId) ? $this->storage->entry((int) $folderId) : null;
        if (!$folder || $folder['kind'] !== 'directory' || !isset($this->definition->mounts[$folder['mount_id']])) throw new Failure('Nem található elem.', 404);
        $resource = $this->definition->resource;
        if (($ctx->channel === 'api' && !in_array($resource.'.upload', $ctx->scopes, true)) || !$ctx->acl->allows($ctx->actor->id, $resource, 'upload', $ctx->channel, $folder['mount_id'])) throw new Failure('Nincs hozzáférés.', 403);
        $fail = static fn(string $code, string $message) => new Failure($message, 400, [], ['code' => $code]);
        if ($file->error !== UPLOAD_ERR_OK || $file->path === '' || !is_file($file->path)) throw $fail('incomplete', 'A fájl feltöltése nem sikerült.');
        if (($error = UploadPolicy::invalidName($file->name)) !== null) throw $fail('name', $error);
        $extension = FileStorage::extension($file->name);
        $mime = in_array($extension, $this->definition->allowedExtensions, true) ? FileManagerDefinition::TYPES[$extension][0] : null;
        $classes = $accept === [] || ($mime !== null && array_filter($accept, static fn($class) => is_string($class) && str_starts_with($mime, $class.'/')));
        if ($mime === null || !$classes) throw $fail('type', Translator::text('Nem engedélyezett fájltípus. Engedélyezett: {types}.', ['types' => implode(', ', array_filter($this->definition->allowedExtensions, static fn($allowed) => $accept === [] || array_filter($accept, static fn($class) => is_string($class) && str_starts_with(FileManagerDefinition::TYPES[$allowed][0], $class.'/'))))]));
        clearstatcache(true, $file->path);
        $size = (int) filesize($file->path);
        if ($size > $this->definition->maxSizeBytes) throw $fail('too_large', Translator::text('A fájl túl nagy (legfeljebb {size} bájt).', ['size' => $this->definition->maxSizeBytes]));
        if (!FileManagerDefinition::contentMatches($extension, $file->path)) throw $fail('content_mismatch', 'A fájl tartalma nem felel meg a kiterjesztésnek.');
        // The folder row is locked before the name check (MySQL; SQLite's write transaction already serializes), so
        // concurrent stores of one name get distinct free names instead of a duplicate-key failure.
        $folder = $this->storage->locked((int) $folder['id']) ?? throw new Failure('Nem található elem.', 404);
        $name = $this->storage->child((int) $folder['id'], $file->name, true) ? $this->storage->freeName((int) $folder['id'], $file->name, 'file', true) : $file->name;
        $id = (string) $this->storage->createFile($folder, $name, $mime, $file->path);
        return ['id' => $id, 'name' => $name, 'mime_type' => $mime, 'mount' => (string) $folder['mount_id'], 'parent' => (string) $folder['id']];
    }
}

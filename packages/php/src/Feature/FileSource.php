<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * File lookup behind a `file` field (Field type `file`, `file.resource`); the file manager's MediaSource
 * implements it. Server-side only: no path, storage key or rule reaches the browser.
 */
interface FileSource
{
    /** Live file $id (not a folder, not archived) as ['id','name','mount','mime_type'], or null. No ACL. */
    public function file(string $id): ?array;

    /** Whether the actor may run file action $action (e.g. `thumbnail_get`, `upload`) on $mount on its channel and API scope. */
    public function allows(Context $ctx, string $action, string $mount): bool;

    /** Id of the live folder at $path ('' = the mount root, `A/B` below it), or null when it is missing; never creates. */
    public function folder(string $mount, string $path = ''): ?string;

    /** Browser upload policy metadata (UploadPolicy::metadata()) for single files of the given MIME classes. */
    public function uploadPolicy(array $accept): array;
}

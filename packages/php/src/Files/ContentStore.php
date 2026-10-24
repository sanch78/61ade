<?php
declare(strict_types=1);
namespace Blade\Files;

/**
 * Content-addressed, immutable file content under a consumer-configured root:
 * `<root>/<space>/ab/cd/<sha256>`. Writes go to `.tmp` and are renamed atomically. A key is
 * referenced while a `blade_files` or `blade_file_derivatives` row of the space uses it; unreferenced
 * content is removed only by the `files.collect` task (FileStorage::collect). Client paths are never used.
 */
final readonly class ContentStore
{
    public string $root;
    public string $space;
    private string $base;

    public function __construct(string $root, string $space)
    {
        if (!str_starts_with($root, '/') || str_contains($root, "\0") || preg_match('~(^|/)\.\.?(/|$)~', $root)) throw new \InvalidArgumentException('The content root must be an absolute path.');
        if (!preg_match('/^[a-z][a-z0-9_-]{0,63}$/D', $space)) throw new \InvalidArgumentException('Invalid file space.');
        $this->root = rtrim($root, '/') ?: '/';
        $this->space = $space;
        $this->base = rtrim($this->root, '/').'/'.$space;
    }

    public static function valid(string $key): bool
    {
        return preg_match('~^([0-9a-f]{2})/([0-9a-f]{2})/([0-9a-f]{64})$~D', $key, $m) === 1 && str_starts_with($m[3], $m[1].$m[2]);
    }

    public static function key(string $sha256): string
    {
        if (!preg_match('/^[0-9a-f]{64}$/D', $sha256)) throw new \InvalidArgumentException('Invalid content hash.');
        return substr($sha256, 0, 2).'/'.substr($sha256, 2, 2).'/'.$sha256;
    }

    public function path(string $key): string
    {
        if (!self::valid($key)) throw new \InvalidArgumentException('Invalid storage key.');
        return $this->base.'/'.$key;
    }

    public function exists(string $key): bool { return is_file($this->path($key)); }

    public function remove(string $key): void
    {
        $path = $this->path($key);
        if (is_file($path) && !unlink($path) && is_file($path)) throw new \RuntimeException('Cannot remove stored content.');
    }

    /** Fresh scratch path inside the store (same filesystem, so put(..., move: true) renames it). */
    public function temporary(): string
    {
        $this->directory($this->base.'/.tmp');
        return $this->base.'/.tmp/'.bin2hex(random_bytes(12));
    }

    /**
     * Stores the source's bytes; existing content of the same hash is kept (nothing is written then).
     * New content is copied to `.tmp`, hashed again and renamed only when the copy matches the key. `created` tells whether
     * this call wrote a new file (the caller then schedules its collection check). With $move the
     * source (a temporary() path) is renamed into place or removed.
     * @return array{key:string,sha256:string,size:int,created:bool}
     */
    public function put(string $source, bool $move = false): array
    {
        $sha256 = is_file($source) ? hash_file('sha256', $source) : false;
        $size = $sha256 !== false ? filesize($source) : false;
        if ($sha256 === false || $size === false) throw new \RuntimeException('Cannot read the content source.');
        $key = self::key($sha256);
        $target = $this->base.'/'.$key;
        $created = false;
        if (!is_file($target)) {
            $this->directory($this->base.'/'.substr($key, 0, 2));
            $this->directory($this->base.'/'.substr($key, 0, 5));
            $temporary = $move ? $source : $this->temporary();
            if (!$move && !copy($source, $temporary)) throw new \RuntimeException('Cannot write stored content.');
            try {
                // The written copy itself must hash to the key; a source changed while copying is refused.
                if (filesize($temporary) !== $size || hash_file('sha256', $temporary) !== $sha256) throw new \RuntimeException('Stored content changed while writing.');
                chmod($temporary, 0660);
                if (!rename($temporary, $target)) throw new \RuntimeException('Cannot write stored content.');
            } finally {
                if (is_file($temporary)) unlink($temporary);
            }
            $created = true;
        } elseif ($move) unlink($source);
        return ['key' => $key, 'sha256' => $sha256, 'size' => (int) $size, 'created' => $created];
    }

    /** Group-shared (setgid, no "other") so the web server and the CLI share the store; only store directories are changed. */
    private function directory(string $path): void
    {
        if (is_dir($path)) return;
        if ($path !== $this->base) $this->directory(dirname($path));
        elseif (!is_dir($this->root) && !@mkdir($this->root, 02770, true) && !is_dir($this->root)) throw new \RuntimeException('Cannot create the content store.');
        if (!@mkdir($path, 02770) && !is_dir($path)) throw new \RuntimeException('Cannot create the content store.');
        @chmod($path, 02770);
    }
}

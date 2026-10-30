<?php
declare(strict_types=1);
namespace Blade\Shell;

/**
 * Browser cache keys of the shell's assets from the files themselves (docs/toolkit.md#cache-keys): `?v=<key>`, the key
 * being the base36 modification time and size of the file the browser path is served from, so a rebuilt file reaches
 * the browser at once. A page-relative path resolves against the front controller's directory, a root-absolute one
 * against the document root; only regular files whose real path lies inside the document root are read (one `stat`).
 * One instance per rendered page, no cache across requests. Output never contains a filesystem path.
 * @internal
 */
final class AssetKeys
{
    private ?string $root = null;
    private ?string $page = null;

    /** @param array<string, mixed> $server the request's `$_SERVER` (`DOCUMENT_ROOT`, `SCRIPT_FILENAME`, `SCRIPT_NAME`) */
    public function __construct(private readonly ApplicationDefinition $definition, array $server)
    {
        clearstatcache(); // a long-lived worker or an earlier stat in this process must not hide a rebuilt file
        $root = $definition->documentRoot ?? $server['DOCUMENT_ROOT'] ?? null;
        $root = is_string($root) && $root !== '' ? realpath($root) : false;
        if ($root === false || !is_dir($root)) return;
        $this->root = $root;
        // The page's directory: the front controller's, else the root plus the directory of its URL path.
        $name = $server['SCRIPT_NAME'] ?? null;
        foreach ([$server['SCRIPT_FILENAME'] ?? null, is_string($name) && str_starts_with($name, '/') ? $root.$name : null] as $script) {
            $page = is_string($script) && $script !== '' && !str_contains($script, "\0") ? realpath(dirname($script)) : false;
            if ($page !== false && self::inside($page, $root)) {
                $this->page = $page;
                return;
            }
        }
    }

    /**
     * $path with `?v=<file key>`. A path with its own `?…` stays as it is. When the served file cannot be found, the
     * key of the package's own build of $package (61ade's `admin.js`/`admin.css`, when the PHP package sits in its
     * checkout) or else ApplicationDefinition::versioned().
     */
    public function url(string $path, ?string $package = null): string
    {
        if (str_contains($path, '?')) return $path;
        $key = self::key($this->served($path));
        if ($key === null && $package !== null && preg_match('/^[a-z]+\.(?:js|css)$/D', $package)) {
            $key = self::key(dirname(__DIR__, 3).'/frontend/dist/'.$package);
        }
        return $key === null ? $this->definition->versioned($path) : $path.'?v='.$key;
    }

    /** Base36 modification time and size of a regular file joined by `-`; null when it is not one. */
    public static function key(?string $file): ?string
    {
        $stat = $file === null ? false : @stat($file);
        if ($stat === false || ($stat['mode'] & 0o170000) !== 0o100000) return null;
        return base_convert((string) $stat['mtime'], 10, 36).'-'.base_convert((string) $stat['size'], 10, 36);
    }

    /** Real path of the file a same-origin browser path is served from, only inside the document root. */
    private function served(string $path): ?string
    {
        if ($this->root === null || $path === '' || str_contains($path, "\0") || str_contains($path, '\\')
            || preg_match('~^(?:[A-Za-z][A-Za-z0-9+.-]*:|//)~', $path)) return null;
        $base = str_starts_with($path, '/') ? $this->root : $this->page;
        if ($base === null) return null;
        $file = realpath(rtrim($base, '/').'/'.ltrim($path, '/'));
        return $file !== false && self::inside($file, $this->root) ? $file : null;
    }

    private static function inside(string $path, string $root): bool
    {
        $root = rtrim($root, '/').'/';
        return $path.'/' === $root || str_starts_with($path, $root);
    }
}

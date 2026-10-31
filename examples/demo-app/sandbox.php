<?php
declare(strict_types=1);

/*
 * Visitor sandboxes of the public demo (docs/demos.md#visitor-sandboxes). Behind the web server (BLADE_DEMO_SANDBOX
 * in public/.htaccess) every browser works on its own copy of a pristine seed, so visitors cannot spoil the demo for
 * each other; a copy idle for an hour is purged. The developer key cookie selects the shared instance instead, which
 * development and the browser tests use. Both live inside the shared instance, whose ACL the web server already has.
 */

const BLADE_DEMO_SANDBOX_COOKIE = 'blade_demo_sandbox';
const BLADE_DEMO_DEVELOPER_COOKIE = 'blade_demo_developer';
const BLADE_DEMO_SANDBOX_TTL = 3600;        // seconds of inactivity before a copy is purged
const BLADE_DEMO_SANDBOX_LIMIT = 100;       // copies at once; the least recently used one gives way
const BLADE_DEMO_SANDBOX_QUOTA = 209715200; // bytes per copy; a larger one starts over from the seed
const BLADE_DEMO_SANDBOX_FREE = 2147483648; // free bytes the volume keeps; below it no new copy is made

/** Whether this request works on a visitor copy; blade_demo_sandbox_enter sets it. */
function blade_demo_sandboxed(?bool $set = null): bool
{
    static $sandboxed = false;
    if ($set !== null) $sandboxed = $set;
    return $sandboxed;
}

/** Developer key of the shared instance, written by setup-workspace.php; null before the first setup. */
function blade_demo_developer_key(string $shared): ?string
{
    $key = is_file($shared.'/developer.key') ? trim((string) file_get_contents($shared.'/developer.key')) : '';
    return strlen($key) >= 32 ? $key : null;
}

function blade_demo_sandbox_sign(string $id, string $key): string
{
    return substr(hash_hmac('sha256', 'sandbox:'.$id, $key), 0, 32);
}

/** The copy id of a cookie this server issued, or null. */
function blade_demo_sandbox_id(string $cookie, string $key): ?string
{
    if (!preg_match('/^([a-f0-9]{32})\.([a-f0-9]{32})$/D', $cookie, $match)) return null;
    return hash_equals(blade_demo_sandbox_sign($match[1], $key), $match[2]) ? $match[1] : null;
}

/** Selects the instance of a web request; the entrypoints call it before the application file. */
function blade_demo_sandbox_enter(): void
{
    if (PHP_SAPI === 'cli' || !getenv('BLADE_DEMO_SANDBOX')) return;
    $shared = blade_demo_instance_root();
    $key = blade_demo_developer_key($shared) ?? blade_demo_sandbox_stop(503, 'The demo is not set up yet.');
    $cookie = static fn(string $name, string $value): bool => setcookie($name, $value, ['path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
    // Developer entry: ?developer=<key> stores the key cookie and returns to the address without it.
    if (isset($_GET['developer'])) {
        if (!hash_equals($key, (string) $_GET['developer'])) blade_demo_sandbox_stop(403, 'Wrong developer key.');
        $cookie(BLADE_DEMO_DEVELOPER_COOKIE, $key);
        header('Location: '.strtok((string) ($_SERVER['REQUEST_URI'] ?? '/'), '?'), true, 303);
        exit;
    }
    if (hash_equals($key, (string) ($_COOKIE[BLADE_DEMO_DEVELOPER_COOKIE] ?? ''))) return;
    $id = blade_demo_sandbox_id((string) ($_COOKIE[BLADE_DEMO_SANDBOX_COOKIE] ?? ''), $key);
    if ($id === null) {
        // A new copy id. The copy is made only once the client returns the cookie, so a client without cookies (a
        // crawler) never makes one: a page request comes back at once to the same address (the browser keeps the
        // #view fragment), any other request answers 401 like an ended session, whose sign-in page then opens the copy.
        $id = bin2hex(random_bytes(16));
        $cookie(BLADE_DEMO_SANDBOX_COOKIE, $id.'.'.blade_demo_sandbox_sign($id, $key));
        header('Cache-Control: no-store');
        if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
            header('Location: '.($_SERVER['REQUEST_URI'] ?? '/'), true, 302);
            exit;
        }
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'A demó munkamenete lejárt. / The demo session has ended.'], JSON_UNESCAPED_UNICODE), "\n";
        exit;
    }
    blade_demo_instance_root(blade_demo_sandbox_open($shared, $id, time()));
    blade_demo_sandboxed(true);
}

/** The visitor's copy; made from the seed when missing, idle too long, over its quota or made from an older seed. */
function blade_demo_sandbox_open(string $shared, string $id, int $now): string
{
    $seed = $shared.'/sandbox-seed';
    $sandboxes = $shared.'/sandboxes';
    $stamp = is_file($seed.'/.seed') ? (string) file_get_contents($seed.'/.seed') : '';
    if ($stamp === '') blade_demo_sandbox_stop(503, 'The demo sandbox seed is not built yet.');
    $directory = $sandboxes.'/'.$id;
    $active = @filemtime($directory.'/.active');
    if ($active !== false && $active > $now - BLADE_DEMO_SANDBOX_TTL && @file_get_contents($directory.'/.seed') === $stamp) {
        // Activity and size are refreshed at most once a minute.
        if ($active > $now - 60) return $directory;
        if (blade_demo_sandbox_size($directory) <= BLADE_DEMO_SANDBOX_QUOTA) {
            touch($directory.'/.active', $now);
            return $directory;
        }
    }
    if (is_dir($directory)) blade_demo_sandbox_remove($directory);
    if (!is_dir($sandboxes) && !mkdir($sandboxes, 02770, true) && !is_dir($sandboxes)) throw new RuntimeException('Cannot create the sandbox directory.');
    blade_demo_sandbox_purge($sandboxes, $now);
    $free = @disk_free_space($sandboxes);
    if ($free !== false && $free < BLADE_DEMO_SANDBOX_FREE) blade_demo_sandbox_stop(503, 'The demo is out of space. Try again later.');
    $temporary = $sandboxes.'/.new-'.bin2hex(random_bytes(8));
    blade_demo_sandbox_copy($seed, $temporary);
    touch($temporary.'/.active', $now);
    // A parallel first request of the same browser may have won; its copy is used.
    if (!@rename($temporary, $directory)) {
        blade_demo_sandbox_remove($temporary);
        if (!is_dir($directory)) throw new RuntimeException('Cannot create the sandbox.');
    }
    return $directory;
}

/** Removes idle copies and abandoned temporary directories, then the least recently used copies above the limit. */
function blade_demo_sandbox_purge(string $sandboxes, int $now): void
{
    $copies = [];
    foreach (glob($sandboxes.'/*', GLOB_ONLYDIR) ?: [] as $copy) {
        $active = @filemtime($copy.'/.active');
        if ($active === false || $active <= $now - BLADE_DEMO_SANDBOX_TTL) blade_demo_sandbox_remove($copy);
        else $copies[$copy] = $active;
    }
    foreach (glob($sandboxes.'/.{new,old}-*', GLOB_ONLYDIR | GLOB_BRACE) ?: [] as $left) {
        if ((int) @filemtime($left) <= $now - 600) blade_demo_sandbox_remove($left);
    }
    asort($copies);
    foreach (array_slice(array_keys($copies), 0, max(0, count($copies) - BLADE_DEMO_SANDBOX_LIMIT + 1)) as $copy) blade_demo_sandbox_remove($copy);
}

/** Bytes the copy holds on its own; blobs still shared with the seed (hard links) do not count. */
function blade_demo_sandbox_size(string $directory): int
{
    $size = 0;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)) as $file) {
        if ((int) (@stat($file->getPathname())['nlink'] ?? 1) < 2) $size += $file->getSize();
    }
    return $size;
}

function blade_demo_sandbox_copy(string $from, string $to): void
{
    if (!mkdir($to, 02770)) throw new RuntimeException('Cannot create the sandbox.');
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
    foreach ($items as $item) {
        $path = $items->getSubPathname();
        $target = $to.'/'.$path;
        if ($item->isDir()) {
            if (!mkdir($target, 02770)) throw new RuntimeException('Cannot create the sandbox.');
            continue;
        }
        // File-store content is addressed by its SHA-256 and never written in place (ContentStore), so the copies share
        // the seed's blobs through hard links; a copy only unlinks its own name.
        if (str_starts_with($path, 'files/') && preg_match('/^[a-f0-9]{64}$/D', $item->getFilename()) && @link($item->getPathname(), $target)) continue;
        if (!copy($item->getPathname(), $target)) throw new RuntimeException('Cannot copy the sandbox seed.');
    }
}

/** Moves the directory aside first, so a request never sees half of it. */
function blade_demo_sandbox_remove(string $directory): void
{
    $trash = dirname($directory).'/.old-'.bin2hex(random_bytes(8));
    if (!@rename($directory, $trash)) return;
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($trash, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) $item->isDir() && !$item->isLink() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
    @rmdir($trash);
}

/**
 * Developer key and pristine seed of the shared web instance; setup-workspace.php calls it for that instance. The seed
 * is a fresh setup of its own (no data the shared instance gathered); a new seed makes every visitor copy start over.
 */
function blade_demo_sandbox_seed(string $shared, string $setup): void
{
    if (blade_demo_developer_key($shared) === null) {
        file_put_contents($shared.'/developer.key', bin2hex(random_bytes(24))."\n");
        chmod($shared.'/developer.key', 0660);
    }
    $next = $shared.'/sandbox-seed-new';
    if (is_dir($next)) blade_demo_sandbox_remove($next);
    $environment = ['BLADE_TMP_DIR' => $shared, 'BLADE_DEMO_INSTANCE' => basename($next)] + getenv();
    $process = proc_open([PHP_BINARY, $setup], [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => STDERR], $pipes, null, $environment);
    if (!is_resource($process) || proc_close($process) !== 0) throw new RuntimeException('Building the sandbox seed failed.');
    file_put_contents($next.'/.seed', bin2hex(random_bytes(8)));
    // Swapped by two renames, so a visitor request finds no seed for a moment at most.
    $seed = $shared.'/sandbox-seed';
    $old = $shared.'/sandbox-seed-old';
    if (is_dir($old)) blade_demo_sandbox_remove($old);
    if (is_dir($seed)) rename($seed, $old);
    if (!rename($next, $seed)) throw new RuntimeException('Cannot install the sandbox seed.');
    if (is_dir($old)) blade_demo_sandbox_remove($old);
}

function blade_demo_sandbox_stop(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $message, "\n";
    exit;
}

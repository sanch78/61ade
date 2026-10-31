<?php
declare(strict_types=1);
// Visitor sandboxes of the public demo (examples/demo-app/sandbox.php): web setup writes the developer key and a fresh
// seed, signed copy ids, copy per visitor, reuse, idle purge after an hour, a new seed and the quota restarting a copy,
// the least recently used copy giving way at the limit, and the settings a sandbox withholds. Everything runs in a
// private BLADE_TMP_DIR, never in tmp/web.
$tmp = (getenv('BLADE_TMP_DIR') ?: dirname(__DIR__, 2).'/tmp').'/sandbox-check-'.bin2hex(random_bytes(4));
mkdir($tmp, 0700, true);
putenv('BLADE_TMP_DIR='.$tmp);
putenv('BLADE_DEMO_INSTANCE=web');
$demo = dirname(__DIR__, 2).'/examples/demo-app';
require $demo.'/vendor/autoload.php';
require_once $demo.'/common.php';

function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

try {
    $shared = blade_demo_instance_root();
    mkdir($shared, 02770, true);
    blade_demo_sandbox_seed($shared, $demo.'/setup-workspace.php');
    $key = blade_demo_developer_key($shared);
    check($key !== null, 'Seed: developer key written');
    check(is_file($shared.'/sandbox-seed/features.sqlite') && is_file($shared.'/sandbox-seed/tenants.sqlite') && is_file($shared.'/sandbox-seed/admin.sqlite'), 'Seed: all three demo databases');
    check(!is_file($shared.'/features.sqlite'), 'Seed: built apart from the shared instance');
    $stamp = file_get_contents($shared.'/sandbox-seed/.seed');

    $id = str_repeat('a', 32);
    check(blade_demo_sandbox_id($id.'.'.blade_demo_sandbox_sign($id, $key), $key) === $id, 'Cookie: issued id accepted');
    check(blade_demo_sandbox_id($id.'.'.str_repeat('0', 32), $key) === null, 'Cookie: forged signature refused');
    check(blade_demo_sandbox_id('../web.'.blade_demo_sandbox_sign('../web', $key), $key) === null, 'Cookie: only hexadecimal ids');

    $now = time();
    $first = blade_demo_sandbox_open($shared, $id, $now);
    check($first === $shared.'/sandboxes/'.$id && is_file($first.'/features.sqlite'), 'Open: copy made from the seed');
    $blobs = glob($first.'/files/demo/*/*/*') ?: [];
    check($blobs !== [] && stat($blobs[0])['nlink'] >= 2, 'Open: file-store blobs shared with the seed by hard links');
    unlink($blobs[0]);
    check(is_file($shared.'/sandbox-seed/'.substr($blobs[0], strlen($first) + 1)), 'Open: a copy deleting a blob keeps the seed\'s');
    check(blade_demo_sandbox_size($first) < 1048576, 'Quota: shared blobs do not count');
    $db = new PDO('sqlite:'.$first.'/features.sqlite');
    $db->exec("UPDATE demo_tasks SET title = 'Visitor change' WHERE id = 1");
    $db = null;
    check(blade_demo_sandbox_open($shared, $id, $now + 120) === $first, 'Open: same copy within the hour');
    $title = static fn(string $file) => (new PDO('sqlite:'.$file))->query('SELECT title FROM demo_tasks WHERE id = 1')->fetchColumn();
    check($title($first.'/features.sqlite') === 'Visitor change', 'Open: the visitor keeps the change');
    check($title($shared.'/sandbox-seed/features.sqlite') !== 'Visitor change', 'Open: the seed stays pristine');
    $other = blade_demo_sandbox_open($shared, str_repeat('b', 32), $now + 120);
    check($title($other.'/features.sqlite') !== 'Visitor change', 'Open: another visitor does not see it');

    // Idle for an hour: the next request starts over, and purge removes other idle copies.
    clearstatcache();
    check($title(blade_demo_sandbox_open($shared, $id, $now + 120 + 3601).'/features.sqlite') !== 'Visitor change', 'TTL: an idle copy starts over');
    check(!is_dir($other), 'TTL: other idle copies purged');

    // A new seed (setup run) makes an existing copy start over.
    $db = new PDO('sqlite:'.$first.'/features.sqlite');
    $db->exec("UPDATE demo_tasks SET title = 'Visitor change' WHERE id = 1");
    $db = null;
    file_put_contents($shared.'/sandbox-seed/.seed', 'next');
    clearstatcache();
    check($title(blade_demo_sandbox_open($shared, $id, $now + 3800).'/features.sqlite') !== 'Visitor change', 'Seed: a copy of an older seed starts over');
    file_put_contents($shared.'/sandbox-seed/.seed', $stamp);

    // Over the quota (checked once a minute) the copy starts over.
    $copy = blade_demo_sandbox_open($shared, $id, $now + 3900);
    $handle = fopen($copy.'/files/big', 'w');
    ftruncate($handle, BLADE_DEMO_SANDBOX_QUOTA + 1);
    fclose($handle);
    clearstatcache();
    blade_demo_sandbox_open($shared, $id, $now + 3990);
    check(!is_file($copy.'/files/big'), 'Quota: a copy over its quota starts over');

    // At the limit the least recently active copy gives way.
    foreach (range(1, BLADE_DEMO_SANDBOX_LIMIT - 1) as $n) {
        mkdir($shared.'/sandboxes/'.sprintf('%032x', $n));
        touch($shared.'/sandboxes/'.sprintf('%032x', $n).'/.active', $now + 4000 + $n);
    }
    clearstatcache();
    blade_demo_sandbox_open($shared, str_repeat('c', 32), $now + 4200);
    check(count(glob($shared.'/sandboxes/*', GLOB_ONLYDIR)) === BLADE_DEMO_SANDBOX_LIMIT, 'Limit: never more copies than the limit');
    check(!is_dir($shared.'/sandboxes/'.$id), 'Limit: the least recently active copy gave way');

    // Settings a sandbox withholds: WebSocket endpoint, outgoing mail, OAuth provider keys.
    putenv('BLADE_DEMO_LIVE_ENDPOINT=wss://example.test/live');
    putenv('BLADE_DEMO_GOOGLE_CLIENT_ID=synthetic');
    putenv('BLADE_DEMO_URL=https://example.test/');
    check(blade_demo_setting('BLADE_DEMO_LIVE_ENDPOINT') !== null, 'Settings: shared instance keeps the endpoint');
    blade_demo_sandboxed(true);
    check(blade_demo_setting('BLADE_DEMO_LIVE_ENDPOINT') === null && blade_demo_setting('BLADE_DEMO_GOOGLE_CLIENT_ID') === null, 'Settings: sandbox polls and has no provider keys');
    check(blade_demo_setting('BLADE_DEMO_URL') === 'https://example.test/', 'Settings: sandbox keeps the site address');
    blade_demo_sandboxed(false);
    echo "Visitor sandbox checks passed.\n";
} finally {
    exec('rm -rf '.escapeshellarg($tmp));
}

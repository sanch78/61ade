<?php
declare(strict_types=1);
require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';
use Vapa\Navigation\Menu;
use Vapa\Navigation\MenuItem;
use Vapa\Shell\Identity;
use Vapa\Shell\SqlIdentityProvider;

function verify(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$scratch = dirname(__DIR__, 2).'/tmp/contracts-demo';
if (is_file($scratch.'/demo-workspace.sqlite')) unlink($scratch.'/demo-workspace.sqlite');
putenv('VAPA_TMP_DIR='.$scratch);
ob_start(); require dirname(__DIR__, 2).'/examples/demo-app/setup-workspace.php'; ob_end_clean();
$app = require dirname(__DIR__, 2).'/examples/demo-app/application.php';
$admin = $app->identities->authenticate('demo@example.test', 'vapa-demo');
$viewer = $app->identities->authenticate('Viewer@Example.test', 'vapa-demo');
verify($admin instanceof Identity && $viewer instanceof Identity, 'Configured SQL authentication');
verify($app->identities->authenticate('demo@example.test', 'wrong') === null, 'Invalid password');
verify($app->identities->authenticate("' OR 1=1 --", 'vapa-demo') === null, 'Bound username');
verify($app->identities->authenticate('blocked@example.test', 'vapa-demo') === null, 'Disabled account');
verify($app->identities->find('3') === null, 'Disabled session identity');
verify(!array_key_exists('password_hash', $admin->attributes), 'Hash excluded from identity');
verify(count($app->menu->project($admin)) === 2 && count($app->menu->project($viewer)) === 1, 'Policy projection');
$empty = new Menu([new MenuItem('parent', 'Parent', [new MenuItem('child', 'Child', visible: static fn() => false)])]);
verify($empty->project($admin) === [], 'Empty branch removed');
$projection = $app->menu->project($admin);
verify($projection[0]['items'][0]['disabled'] === true, 'Unimplemented module is disabled');
verify(!str_contains(json_encode($projection), 'can_manage'), 'Backend rule not serialized');
try { new Menu([new MenuItem('same', 'One'), new MenuItem('branch', 'Two', [new MenuItem('same', 'Three')])]); throw new RuntimeException('Duplicate IDs accepted'); }
catch (InvalidArgumentException) {}
try { new MenuItem('active', 'Active', enabled: true); throw new RuntimeException('Unsupported module action accepted'); }
catch (InvalidArgumentException) {}
$db = new PDO('sqlite::memory:');
try { new SqlIdentityProvider($db, 'accounts; DROP TABLE accounts', 'id', 'name', 'hash', 'label'); throw new RuntimeException('Unsafe schema identifier accepted'); }
catch (InvalidArgumentException) {}
try { new SqlIdentityProvider($db, 'accounts', 'id', 'name', 'hash', 'label', ['hash']); throw new RuntimeException('Hash metadata accepted'); }
catch (InvalidArgumentException) {}
echo "VAPA standalone shell contracts passed.\n";

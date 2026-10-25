<?php
declare(strict_types=1);
require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';
use Blade\Navigation\Menu;
use Blade\Navigation\MenuItem;
use Blade\Shell\Identity;
use Blade\Shell\SqlIdentityProvider;

function verify(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$scratch = dirname(__DIR__, 2).'/tmp/contracts-demo';
foreach (['features', 'admin'] as $name) if (is_file($scratch.'/demo/'.$name.'.sqlite')) unlink($scratch.'/demo/'.$name.'.sqlite');
putenv('BLADE_TMP_DIR='.$scratch);
ob_start(); require dirname(__DIR__, 2).'/examples/demo-app/setup-workspace.php'; ob_end_clean();
$app = require dirname(__DIR__, 2).'/examples/demo-app/application.php';
$admin = $app->identities->authenticate('demo@example.test', '61de-demo');
$viewer = $app->identities->authenticate('Viewer@Example.test', '61de-demo');
verify($admin instanceof Identity && $viewer instanceof Identity, 'Configured SQL authentication');
verify($app->identities->authenticate('demo@example.test', 'wrong') === null, 'Invalid password');
verify($app->identities->authenticate("' OR 1=1 --", '61de-demo') === null, 'Bound username');
verify($app->identities->authenticate('blocked@example.test', '61de-demo') === null, 'Disabled account');
verify($app->identities->find('3') === null, 'Disabled session identity');
verify(!array_key_exists('password_hash', $admin->attributes), 'Hash excluded from identity');
verify(count($app->menu->project($admin)[0]['items']) === 2 && count($app->menu->project($viewer)[0]['items']) === 1, 'Policy projection');
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
// Base admin demo: only the mandatory administration, under its own path, session and assets.
$base = require dirname(__DIR__, 2).'/examples/demo-app/admin-application.php';
verify(array_column($base->workspace->registry->views(), 'resource') === ['blade_users', 'blade_roles', 'blade_memberships', 'blade_role_rules', 'blade_user_rules', 'blade_api_keys'], 'Base admin has only the mandatory administration');
verify($base->cookiePath === '/admin/' && $base->assets === '../assets' && $base->sessionName !== $app->sessionName, 'Base admin is a separate application');
verify(count($base->workspace->views($base->identities->authenticate('demo@example.test', '61de-demo'))) === 6, 'First administrator reaches every admin view');
// Feature demo: business modules plus every sign-in method.
verify($app->authentication !== null && $app->oauth !== null && $app->oauth->providers() === ['Google', 'Facebook'] && count($app->languages->languages) === 2, 'Feature demo shows all sign-in methods and languages');
verify($app->identities->authenticate('twofactor@example.test', '61de-demo') !== null && $app->authentication->needsConfirmation($app->identities->find('4')), 'E-mail second factor account');
verify($app->accounts->oauthAllowed('5') && !$app->accounts->oauthAllowed('1') && $app->accounts->locale('4') === 'en', 'OAuth and default language accounts');
// Action confirmation metadata: validated at construction, passed to the browser, no unknown keys.
$demoViews = $app->workspace->views($app->identities->find('1'));
$dialogActions = array_values(array_filter(array_merge(...array_column($demoViews, 'actions')), static fn(array $a) => str_starts_with($a['name'], 'dialog_')));
verify(array_column(array_column($dialogActions, 'confirm'), 'severity') === ['neutral', 'warning', 'danger'], 'Dialog demo actions expose confirm severities');
foreach ([['message' => ''], ['message' => 'x', 'severity' => 'loud'], ['message' => 'x', 'onclick' => 'y']] as $bad) {
    try { new Blade\Feature\Action('r', 'a', 'A', [], static fn() => [], confirm: $bad); throw new RuntimeException('Invalid confirm accepted'); }
    catch (InvalidArgumentException) {}
}
echo "61de standalone shell contracts passed.\n";

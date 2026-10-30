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
$admin = $app->identities->authenticate('demo@example.test', '61ade-demo');
$viewer = $app->identities->authenticate('Viewer@Example.test', '61ade-demo');
verify($admin instanceof Identity && $viewer instanceof Identity, 'Configured SQL authentication');
verify($app->identities->authenticate('demo@example.test', 'wrong') === null, 'Invalid password');
verify($app->identities->authenticate("' OR 1=1 --", '61ade-demo') === null, 'Bound username');
verify($app->identities->authenticate('blocked@example.test', '61ade-demo') === null, 'Disabled account');
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
verify(count($base->workspace->views($base->identities->authenticate('demo@example.test', '61ade-demo'))) === 6, 'First administrator reaches every admin view');
// Declarative path (toolkit D6): the starter admin and the tenant demo declare no project browser modules or
// stylesheets; the feature demo, the toolkit consumer, declares exactly its built demo module and stylesheet
// (docs/demos.md#toolkit-consumer).
$tenantDemo = require dirname(__DIR__, 2).'/examples/demo-app/tenant-application.php';
verify($base->modules === [] && $base->stylesheets === [] && $tenantDemo->modules === [] && $tenantDemo->stylesheets === [], 'Starter admin and tenant demo declare no modules or stylesheets');
verify($app->modules === ['app/demo.js'] && $app->versioned('app/demo.js') === 'app/demo.js?v='.rawurlencode($app->version) && $app->version !== '', 'Feature demo declares exactly its versioned demo module');
verify($app->stylesheets === ['app/demo.css'], 'Feature demo declares exactly its built demo stylesheet');
// Cache keys from the served files (docs/toolkit.md#cache-keys): the demo module under the demo's document root; the
// starter admin's `../assets` from /admin/, or the package build's key while the demo assets are not prepared.
$public = dirname(__DIR__, 2).'/examples/demo-app/public';
$demoKeys = new Blade\Shell\AssetKeys($app, ['DOCUMENT_ROOT' => $public, 'SCRIPT_FILENAME' => $public.'/index.php']);
verify($demoKeys->url('app/demo.js') === 'app/demo.js?v='.Blade\Shell\AssetKeys::key($public.'/app/demo.js') && Blade\Shell\AssetKeys::key($public.'/app/demo.js') !== null, 'Feature demo module keyed by its built file');
verify($demoKeys->url('app/demo.css') === 'app/demo.css?v='.Blade\Shell\AssetKeys::key($public.'/app/demo.css') && Blade\Shell\AssetKeys::key($public.'/app/demo.css') !== null, 'Feature demo stylesheet keyed by its built file');
// Sign-in branding (docs/shell.md#sign-in-branding): the feature demo shows its synthetic logo and sign-in stylesheet;
// the starter admin and the tenant demo stay without either.
verify($base->logo === null && $base->signInStylesheets === [] && $tenantDemo->logo === null && $tenantDemo->signInStylesheets === [], 'Starter admin and tenant demo declare no logo or sign-in stylesheets');
verify($app->logo == new Blade\Shell\Logo('branding/logo.svg', 'branding/logo-dark.svg') && $app->signInStylesheets === ['branding/sign-in.css'], 'Feature demo declares its logo and sign-in stylesheet');
foreach (['branding/logo.svg', 'branding/logo-dark.svg', 'branding/sign-in.css'] as $asset) {
    verify(Blade\Shell\AssetKeys::key($public.'/'.$asset) !== null && $demoKeys->url($asset) === $asset.'?v='.Blade\Shell\AssetKeys::key($public.'/'.$asset), 'Feature demo branding keyed by its file: '.$asset);
}
$adminKeys = new Blade\Shell\AssetKeys($base, ['DOCUMENT_ROOT' => $public, 'SCRIPT_FILENAME' => $public.'/admin/index.php']);
$served = is_file($public.'/assets/admin.js') ? $public.'/assets/admin.js' : dirname(__DIR__, 2).'/packages/frontend/dist/admin.js';
verify($adminKeys->url('../assets/admin.js', 'admin.js') === '../assets/admin.js?v='.Blade\Shell\AssetKeys::key($served), 'Starter admin admin.js keyed by its file');
verify(preg_match('/^[0-9a-z]+-[0-9a-z]+$/D', (string) Blade\Shell\AssetKeys::key($served)) === 1 && !str_contains((string) file_get_contents(dirname(__DIR__, 2).'/packages/php/templates/shell.php'), '?v=32'), 'Key format and no hand-bumped shell asset version');
// Feature demo: business modules plus every sign-in method.
verify($app->authentication !== null && $app->oauth !== null && $app->oauth->providers() === ['Google', 'Facebook'] && count($app->languages->languages) === 2, 'Feature demo shows all sign-in methods and languages');
verify($app->identities->authenticate('twofactor@example.test', '61ade-demo') !== null && $app->authentication->needsConfirmation($app->identities->find('4')), 'E-mail second factor account');
verify($app->accounts->oauthAllowed('5') && !$app->accounts->oauthAllowed('1') && $app->accounts->locale('4') === 'en', 'OAuth and default language accounts');
// Action confirmation metadata: validated at construction, passed to the browser, no unknown keys.
$demoViews = $app->workspace->views($app->identities->find('1'));
// Bootstrap views (docs/toolkit.md#views): id and kind always set, kind payloads under `options`, no placeholders.
foreach ($demoViews as $view) {
    verify(array_slice(array_keys($view), 0, 2) === ['id', 'kind'] && array_key_last($view) === 'options' && !array_diff(array_keys($view), ['id', 'kind', 'title', 'resource', 'record', 'actions', 'group', 'icon', 'desktopOnly', 'open', 'options']), 'Bootstrap view shape: '.$view['id']);
}
$demoKinds = array_column($demoViews, 'kind', 'id');
verify($demoKinds['demo_tasks'] === 'list' && $demoKinds['files'] === 'files' && $demoKinds['topology'] === 'diagram' && $demoKinds['signage_schedule'] === 'calendar', 'Every built-in kind is named explicitly');
verify(!array_filter($demoViews, static fn(array $view) => $view['kind'] !== 'list' && array_intersect_key($view['options'], ['columns' => 1, 'filters' => 1, 'singleton' => 1])), 'Non-list kinds carry no list placeholders');
// Toolkit D3 (docs/demos.md#toolkit-consumer): the readings dashboard is a project kind with JSON options beside the
// Mérések list, whose value column (table, cards and details) names the module's presentation.
$demoById = array_column($demoViews, null, 'id');
verify($demoKinds['demo.readings-dashboard'] === 'demo.readings-dashboard' && $demoKinds['demo_readings'] === 'list'
    && $demoById['demo.readings-dashboard']['options'] === ['list' => 'demo_readings', 'value' => 'reading', 'name' => 'title', 'max' => 100, 'buckets' => 10]
    && array_column($demoById['demo.readings-dashboard']['actions'], 'name') === ['list'] && $demoById['demo.readings-dashboard']['group'] === 'Feature demó'
    && array_column($demoById['demo_readings']['options']['columns'], 'presentation', 'id') === ['reading' => 'demo.reading-bar']
    && array_column($demoById['demo_readings']['options']['detailFields'], 'presentation', 'id') === ['reading' => 'demo.reading-bar'], 'Readings dashboard view and reading-bar presentation');
// Toolkit D2: the playlist preview is a project kind over the playlist actions (granted by setup), beside the calendar.
verify($demoKinds['demo.playlist-preview'] === 'demo.playlist-preview' && array_column($demoById['demo.playlist-preview']['actions'], 'name') === ['day', 'scene']
    && $demoById['demo.playlist-preview']['options'] === ['media' => 'files'] && $demoById['demo.playlist-preview']['group'] === 'Digitális kijelző', 'Playlist preview view over the playlist actions');
$dialogActions = array_values(array_filter(array_merge(...array_column($demoViews, 'actions')), static fn(array $a) => str_starts_with($a['name'], 'dialog_')));
verify(array_column(array_column($dialogActions, 'confirm'), 'severity') === ['neutral', 'warning', 'danger'], 'Dialog demo actions expose confirm severities');
foreach ([['message' => ''], ['message' => 'x', 'severity' => 'loud'], ['message' => 'x', 'onclick' => 'y']] as $bad) {
    try { new Blade\Feature\Action('r', 'a', 'A', [], static fn() => [], confirm: $bad); throw new RuntimeException('Invalid confirm accepted'); }
    catch (InvalidArgumentException) {}
}
echo "61ade standalone shell contracts passed.\n";

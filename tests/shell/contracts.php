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
// Sign-in branding (docs/shell.md#sign-in-branding): every demo shows the 61ade product logo (docs/brand.md): the
// starter admin and the tenant demo by not declaring one, the feature demo with placement "both" and its sign-in
// stylesheet, content and module.
foreach ([$base, $tenantDemo] as $plain) verify($plain->logo === null && $plain->signInStylesheets === [] && $plain->signIn === null && $plain->signInModules === [], 'Starter admin and tenant demo declare no logo (the product default), sign-in stylesheets, content or modules');
verify($app->logo == new Blade\Shell\Logo(placement: 'both') && $app->logo->image === null && $app->signInStylesheets === ['branding/sign-in.css'], 'Feature demo keeps the product logo (window and top row) and declares its sign-in stylesheet');
verify(!file_exists($public.'/branding/logo.svg') && !file_exists($public.'/branding/logo-dark.svg'), 'Feature demo ships no own logo file');
verify($app->signIn == new Blade\Shell\SignIn('Szintetikus demó: a fiókok és az adatok kitaláltak.', [new Blade\Shell\SignInLink('Nyilvános demó', '/public/')], closeHref: '/public/') && $app->signInModules === ['branding/sign-in.js'], 'Feature demo declares its sign-in notice, public demo link and sign-in module without a mailbox link');
foreach (['branding/sign-in.css', 'branding/sign-in.js'] as $asset) {
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
    verify(array_slice(array_keys($view), 0, 2) === ['id', 'kind'] && array_key_last($view) === 'options' && !array_diff(array_keys($view), ['id', 'kind', 'title', 'resource', 'record', 'actions', 'group', 'icon', 'desktopOnly', 'open', 'menu', 'attention', 'guide', 'options']), 'Bootstrap view shape: '.$view['id']);
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
    && $demoById['demo.playlist-preview']['options']['media'] === 'files' && array_column($demoById['demo.playlist-preview']['options']['layout']['rows'], 'id') === ['commands', 'player']
    && $demoById['demo.playlist-preview']['group'] === 'Digitális kijelző', 'Playlist preview view over the playlist actions, with its panels');
$dialogActions = array_values(array_filter(array_merge(...array_column($demoViews, 'actions')), static fn(array $a) => str_starts_with($a['name'], 'dialog_')));
verify(array_column(array_column($dialogActions, 'confirm'), 'severity') === ['neutral', 'warning', 'danger'], 'Dialog demo actions expose confirm severities');
foreach ([['message' => ''], ['message' => 'x', 'severity' => 'loud'], ['message' => 'x', 'onclick' => 'y']] as $bad) {
    try { new Blade\Feature\Action('r', 'a', 'A', [], static fn() => [], confirm: $bad); throw new RuntimeException('Invalid confirm accepted'); }
    catch (InvalidArgumentException) {}
}
// Session cookie policy (docs/authentication.md#cookie-samesite): Lax and unbound unless declared; no `None`.
verify($app->sameSite === 'Lax' && !$app->bindSessionToClientAddress && $base->sameSite === 'Lax' && !$base->bindSessionToClientAddress, 'Demos keep Lax, unbound sessions');
$policy = static fn(string $sameSite) => new Blade\Shell\ApplicationDefinition('T', $app->identities, new Menu([]), sys_get_temp_dir(), sameSite: $sameSite, bindSessionToClientAddress: true);
verify($policy('Strict')->sameSite === 'Strict' && $policy('Strict')->bindSessionToClientAddress, 'Strict SameSite and binding accepted');
foreach (['None', 'none', 'strict', 'lax', ''] as $bad) {
    try { $policy($bad); throw new RuntimeException('Invalid SameSite accepted: '.$bad); }
    catch (InvalidArgumentException) {}
}
// Trusted proxies (docs/shell.md#trusted-proxies): X-BLADE-Client-IP/X-BLADE-HTTPS count only from a trusted
// connection. The probe definition records the request it sees; null means it never ran (the entrypoint failed closed).
$probe = static function (Closure $run, string $from, string $client = '203.0.113.7'): ?array {
    [$server, $seen, $log] = [$_SERVER, null, ini_set('error_log', '/dev/null')];
    $_SERVER = ['REMOTE_ADDR' => $from, 'HTTP_X_BLADE_CLIENT_IP' => $client, 'HTTP_X_BLADE_HTTPS' => 'on'];
    ob_start();
    try {
        $run(static function () use (&$seen): never { $seen = [$_SERVER['REMOTE_ADDR'], $_SERVER['HTTPS'] ?? null]; throw new LogicException('probe'); });
        verify(str_contains((string) ob_get_contents(), 'role="alert"'), 'Entrypoint failures answer with the safe error page');
    } finally {
        ob_end_clean();
        ini_set('error_log', (string) $log);
        $_SERVER = $server;
    }
    return $seen;
};
$entry = static fn(bool|array $trust): Closure => static fn(Closure $definition) => Blade\Infrastructure\HttpEntrypoint::run($definition, $trust);
$forwarded = ['203.0.113.7', 'on'];
verify($probe(static fn(Closure $definition) => Blade\Infrastructure\HttpEntrypoint::run($definition), '127.0.0.1') === ['127.0.0.1', null], 'No proxy trusted by default, not even loopback');
verify($probe($entry(true), '127.0.0.1') === $forwarded && $probe($entry(true), '::1') === $forwarded, 'trustProxy true: a loopback proxy sets client address and scheme');
verify($probe($entry(true), '127.0.0.2') === ['127.0.0.2', null] && $probe($entry(true), '192.0.2.10') === ['192.0.2.10', null], 'trustProxy true: exactly 127.0.0.1 and ::1, as before');
verify($probe($entry(true), '127.0.0.1', 'not-an-address') === ['127.0.0.1', null], 'An invalid forwarded address changes nothing');
verify($probe(static fn(Closure $definition) => Blade\Infrastructure\HttpEntrypoint::run($definition, trustLocalProxy: true), '127.0.0.1') === $forwarded
    && $probe(static fn(Closure $definition) => Blade\Infrastructure\HttpEntrypoint::run($definition, trustLocalProxy: true), '192.0.2.10') === ['192.0.2.10', null], 'trustLocalProxy stays an alias of true');
$networks = ['192.0.2.0/24', '2001:db8::/32', '198.51.100.7/32'];
verify($probe($entry($networks), '192.0.2.10') === $forwarded && $probe($entry($networks), '2001:db8:1::7') === $forwarded && $probe($entry($networks), '198.51.100.7') === $forwarded, 'Listed CIDR proxies accepted');
verify($probe($entry($networks), '192.0.3.1') === ['192.0.3.1', null] && $probe($entry($networks), '198.51.100.8') === ['198.51.100.8', null] && $probe($entry($networks), '127.0.0.1') === ['127.0.0.1', null] && $probe($entry($networks), '::ffff:192.0.2.10') === ['::ffff:192.0.2.10', null], 'Unlisted sources ignored, loopback and mapped IPv4 included');
// Prefixes inside a byte: /25 and /127 cover exactly their half and pair.
verify($probe($entry(['192.0.2.128/25']), '192.0.2.200') === $forwarded && $probe($entry(['192.0.2.128/25']), '192.0.2.127') === ['192.0.2.127', null]
    && $probe($entry(['2001:db8::/127']), '2001:db8::1') === $forwarded && $probe($entry(['2001:db8::/127']), '2001:db8::2') === ['2001:db8::2', null], 'Partial-byte prefixes match exactly their network');
verify($probe($entry(['::ffff:192.0.2.0/120']), '::ffff:192.0.2.10') === $forwarded && $probe($entry(['::ffff:192.0.2.0/120']), '192.0.2.10') === ['192.0.2.10', null], 'IPv4-mapped connections need a mapped IPv6 network');
verify($probe($entry([]), '127.0.0.1') === ['127.0.0.1', null], 'An empty list trusts nothing');
foreach ([['192.0.2.1/24'], ['192.0.2.129/25'], ['2001:db8::1/127'], ['192.0.2.0'], ['192.0.2.0/0'], ['::/0'], ['192.0.2.0/33'], ['2001:db8::/129'], ['192.0.2.0/024'], ['192.000.2.0/24'], ['fe80::%eth0/64'], [' 192.0.2.0/24'], ['192.0.2.0/24 '], ['192.0.2.0/24', 'proxy'], [24], ['proxy' => '192.0.2.0/24']] as $bad) {
    verify($probe($entry($bad), '192.0.2.10') === null, 'Invalid trusted proxy list fails closed: '.json_encode($bad));
}
verify($probe(static fn(Closure $definition) => Blade\Infrastructure\HttpEntrypoint::run($definition, ['192.0.2.0/24'], true), '192.0.2.10') === null, 'trustProxy list with trustLocalProxy fails closed');
echo "61ade standalone shell contracts passed.\n";

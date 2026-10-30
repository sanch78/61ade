<?php

declare(strict_types=1);

require dirname(__DIR__, 2).'/examples/demo-app/vendor/autoload.php';

use Blade\Access\Schema;
use Blade\Configuration\JsonApplication;
use Blade\Configuration\JsonConfiguration;
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\Context;
use Blade\Feature\Failure;

function verify(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function rejected(Closure $work, string $message): void
{
    try {
        $work();
    } catch (InvalidArgumentException) {
        return;
    }
    throw new RuntimeException($message);
}

$root = dirname(__DIR__, 2);
$directory = (getenv('BLADE_TMP_DIR') ?: $root.'/tmp').'/configuration-'.bin2hex(random_bytes(6));
mkdir($directory, 0700, true);
$file = $directory.'/application.json';
$write = static function (array $values) use ($file): void {
    file_put_contents($file, json_encode($values, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
};

try {
    file_put_contents($directory.'/.env', "BLADE_TEST_CONFIG_PORT=8080\nBLADE_TEST_CONFIG_ENABLED=false\n");
    $settings = [
        'environment' => ['files' => [['path' => '.env']]],
        'test' => [
            'port' => ['$env' => 'BLADE_TEST_CONFIG_PORT', 'type' => 'integer'],
            'enabled' => ['$env' => 'BLADE_TEST_CONFIG_ENABLED', 'type' => 'boolean'],
            'fallback' => ['$env' => 'BLADE_TEST_CONFIG_ABSENT', 'default' => 'safe'],
        ],
    ];
    $write($settings);
    $resolved = JsonConfiguration::load($file);
    verify($resolved->section('test') === ['port' => 8080, 'enabled' => false, 'fallback' => 'safe'], 'Typed env file and default');
    verify($resolved->path('relative') === $directory.'/relative', 'Config-relative paths');
    putenv('BLADE_TEST_CONFIG_PORT=9090');
    verify(JsonConfiguration::load($file)->section('test')['port'] === 9090, 'Process env overrides file');
    putenv('BLADE_TEST_CONFIG_PORT=not-an-integer');
    rejected(static fn() => JsonConfiguration::load($file), 'Invalid integer accepted');
    putenv('BLADE_TEST_CONFIG_PORT');
    $settings['test']['fallback'] = ['$env' => 'BLADE_TEST_CONFIG_ABSENT'];
    $write($settings);
    rejected(static fn() => JsonConfiguration::load($file), 'Missing env accepted');
    file_put_contents($file, '{invalid');
    rejected(static fn() => JsonConfiguration::load($file), 'Invalid JSON accepted');

    $db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    Schema::install($db);
    $db->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, login TEXT, password_hash TEXT, name TEXT, active INTEGER)');
    $query = $db->prepare('INSERT INTO accounts VALUES (1, ?, ?, ?, 1)');
    $query->execute(['synthetic', password_hash('synthetic-password', PASSWORD_DEFAULT), 'Synthetic User']);
    $db->exec('CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, title TEXT)');
    $grant = $db->prepare("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'notes', ?, 'ui', 'allow', 'all', '', '')");
    foreach (['list', 'get', 'create', 'update', 'mark'] as $action) {
        $grant->execute([$action]);
    }
    $module = $root.'/tests/fixtures/configuration/notes.json';
    $callbacks = static fn() => [
        'notes.normalize' => static fn($context, $target, $values) => ['title' => strtoupper($values['title'])],
        'notes.mark' => static function ($context, $target): array {
            $query = $context->db->prepare('UPDATE notes SET title = ? WHERE id = ?');
            $query->execute(['MARKED', $target['id']]);
            return [];
        },
    ];
    $settings = [
        'application' => ['title' => 'Synthetic JSON app', 'runtime' => 'runtime', 'version' => '2.3.4'],
        'database' => ['host' => 'unused', 'port' => 3306, 'name' => 'unused', 'charset' => 'utf8mb4', 'user' => 'unused', 'password' => ''],
        'session' => ['name' => 'json_test', 'cookie_path' => '/'],
        'identity' => ['table' => 'accounts', 'id_column' => 'id', 'username_column' => 'login', 'password_column' => 'password_hash', 'name_column' => 'name', 'attribute_columns' => ['active'], 'allowed' => 'accounts.active'],
        'live' => ['transport' => 'poll', 'endpoint' => 'live', 'interval_ms' => 500],
        'workspace' => ['modules' => [$module]],
    ];
    $write($settings);
    $app = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db);
    $actor = $app->identities->authenticate('synthetic', 'synthetic-password');
    verify($actor !== null, 'JSON identity adapter');
    verify($app->version === '2.3.4', 'Application release version from JSON');
    verify($app->skins === null, 'No application skins without application.skins');
    $skin = new Blade\Shell\Skin('brand', 'Brand', 'skins/brand.css');
    $write([...$settings, 'application' => [...$settings['application'], 'skins' => 'app.skins']]);
    $skinned = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active'], 'app.skins' => static fn() => [$skin]], $callbacks, $db);
    verify(($skinned->skins)($actor) === [$skin], 'Application skins from a named identity binding');
    // Browser modules and stylesheets (docs/toolkit.md#module-loading): page-relative paths, validated at load.
    verify($app->modules === [] && $app->stylesheets === [], 'No project modules or stylesheets by default');
    $write([...$settings, 'application' => [...$settings['application'], 'modules' => ['app/main.js'], 'stylesheets' => ['app/main.css']]]);
    $moduled = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db);
    verify($moduled->modules === ['app/main.js'] && $moduled->stylesheets === ['app/main.css'] && $moduled->versioned('app/main.js') === 'app/main.js?v=2.3.4', 'JSON application.modules and stylesheets');
    // Document root of the assets' cache keys (docs/toolkit.md#cache-keys): relative to the JSON directory, null by default.
    verify($app->documentRoot === null, 'No document root by default: the request DOCUMENT_ROOT');
    $write([...$settings, 'application' => [...$settings['application'], 'document_root' => '../public']]);
    verify(JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db)->documentRoot === dirname($file).'/../public', 'JSON application.document_root resolves from the JSON directory');
    foreach ([['modules' => ['https://cdn.example.test/main.js']], ['modules' => 'app/main.js'], ['stylesheets' => ['app/main.js']], ['document_root' => ''], ['document_root' => 7]] as $bad) {
        $write([...$settings, 'application' => [...$settings['application'], ...$bad]]);
        rejected(static fn() => JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db), 'Invalid application module path accepted: '.json_encode($bad));
    }
    // Sign-in branding (docs/shell.md#sign-in-branding): application.logo and application.sign_in_stylesheets.
    verify($app->logo === null && $app->signInStylesheets === [] && $app->signIn === null && $app->signInModules === [], 'No logo, sign-in stylesheets, content or modules by default');
    $write([...$settings, 'application' => [...$settings['application'], 'logo' => ['image' => 'branding/logo.svg', 'dark_image' => 'branding/logo-dark.svg', 'label' => 'Márka', 'placement' => 'both'], 'sign_in_stylesheets' => ['branding/sign-in.css'],
        'sign_in' => ['description' => 'Below the form.', 'notice' => 'Szintetikus fiókok.', 'links' => [['label' => 'Súgó', 'href' => '/help/'], ['label' => 'Impresszum', 'href' => 'https://example.test/imprint']]], 'sign_in_modules' => ['branding/sign-in.js']]]);
    $branded = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db);
    verify($branded->logo == new Blade\Shell\Logo('branding/logo.svg', 'branding/logo-dark.svg', 'Márka', 'both') && $branded->signInStylesheets === ['branding/sign-in.css'] && $branded->stylesheets === [], 'JSON application.logo and sign_in_stylesheets');
    verify($branded->signIn == new Blade\Shell\SignIn('Szintetikus fiókok.', [new Blade\Shell\SignInLink('Súgó', '/help/'), new Blade\Shell\SignInLink('Impresszum', 'https://example.test/imprint')]) && $branded->signInModules === ['branding/sign-in.js'] && $branded->modules === [], 'JSON application.sign_in and sign_in_modules');
    $write([...$settings, 'application' => [...$settings['application'], 'logo' => ['image' => 'branding/logo.png']]]);
    $plain = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db)->logo;
    verify($plain->image === 'branding/logo.png' && $plain->darkImage === null && $plain->label === null && $plain->placement === 'window', 'JSON logo without dark image and text, window placement by default');
    // The 61ade product logo (docs/brand.md): `false` opts out, an object without `image` keeps it with a placement.
    $write([...$settings, 'application' => [...$settings['application'], 'logo' => false]]);
    verify(JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db)->logo == Blade\Shell\Logo::none(), 'JSON logo false: Logo::none()');
    $write([...$settings, 'application' => [...$settings['application'], 'logo' => ['placement' => 'both']]]);
    verify(JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db)->logo == new Blade\Shell\Logo(placement: 'both'), 'JSON logo without image: the product logo with a placement');
    foreach ([['logo' => 'branding/logo.svg'], ['logo' => true], ['logo' => 7], ['logo' => ['b/logo.svg']], ['logo' => ['dark_image' => 'b/dark.svg']], ['logo' => ['image' => 'b/logo.svg', 'alt' => 'x']], ['logo' => ['image' => 'b/logo.gif']],
        ['logo' => ['image' => 'https://cdn.example.test/logo.svg']], ['logo' => ['image' => 'b/logo.svg', 'label' => '']], ['logo' => ['image' => 'b/logo.svg', 'dark_image' => 7]],
        ['sign_in_stylesheets' => 'b/sign-in.css'], ['sign_in_stylesheets' => ['b/sign-in.js']], ['sign_in_stylesheets' => ['//cdn.example.test/x.css']], ['sign_in_stylesheets' => ['b/x.css', 'b/x.css']],
        ['logo' => ['image' => 'b/logo.svg', 'placement' => 'menu']], ['sign_in' => 'x'], ['sign_in' => ['notice' => 7]], ['sign_in' => ['notice' => ' ']], ['sign_in' => ['footer' => 'x']], ['sign_in' => ['links' => 'x']],
        ['sign_in' => ['links' => ['a' => ['label' => 'L', 'href' => '/x']]]], ['sign_in' => ['links' => ['/x']]], ['sign_in' => ['links' => [['label' => 'L']]]], ['sign_in' => ['links' => [['label' => 'L', 'href' => '/x', 'target' => '_blank']]]],
        ['sign_in' => ['links' => [['label' => 'L', 'href' => 'javascript:alert(1)']]]], ['sign_in' => ['links' => [['label' => 'L', 'href' => '//evil.test/']]]],
        ['sign_in_modules' => 'b/sign-in.js'], ['sign_in_modules' => ['b/sign-in.css']], ['sign_in_modules' => ['https://cdn.example.test/x.js']]] as $bad) {
        $write([...$settings, 'application' => [...$settings['application'], ...$bad]]);
        rejected(static fn() => JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db), 'Invalid sign-in branding accepted: '.json_encode($bad));
    }
    rejected(static fn() => new Blade\Shell\Skin('skyblue', 'Shadow', 'skins/brand.css'), 'Skin shadowing a factory theme accepted');
    verify($app->live->applications === [] && $app->live->route('/live/admin') === null, 'No further live applications without live.applications');
    $write([...$settings, 'live' => [...$settings['live'], 'transport' => 'websocket', 'applications' => ['admin' => 'admin.php', 'tenants' => '/srv/tenants.php']]]);
    $routed = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db);
    verify($routed->live->route('/live/admin') === dirname($file).'/admin.php' && $routed->live->route('/live/tenants') === '/srv/tenants.php', 'Live applications resolve from the JSON directory and route by the last path segment');
    verify($routed->live->route('/live') === null && $routed->live->route('/live/other') === null, 'Other live paths serve the configured application');
    verify(!array_key_exists('applications', $routed->live->metadata()), 'Live application files stay out of the browser bootstrap');
    rejected(static fn() => new Blade\Live\LiveConfig('websocket', 'live', applications: ['Admin' => '/srv/admin.php']), 'Invalid live application name accepted');
    rejected(static fn() => new Blade\Live\LiveConfig('websocket', 'live', applications: ['admin' => 'admin.php']), 'Relative live application file accepted');
    rejected(static fn() => new Blade\Shell\Skin('brand', 'Brand', 'https://cdn.example.test/brand.css'), 'Off-page skin stylesheet accepted');
    rejected(static fn() => new Blade\Shell\Skin('brand', 'Brand', 'skins/brand.css', 'contrast-dark'), 'Skin over an unsupported base accepted');
    $write($settings);
    $workspace = $app->workspace;
    $context = new Context($actor, 'ui', $workspace->acl, $db);
    $created = $workspace->executor->execute($context, 'notes', 'create', null, ['title' => 'hello']);
    $row = $workspace->executor->execute($context, 'notes', 'get', $created['id'], []);
    verify($row['title'] === 'HELLO', 'Named business normalization inside generic CRUD');
    $workspace->executor->execute($context, 'notes', 'mark', $created['id'], []);
    verify($db->query('SELECT title FROM notes')->fetchColumn() === 'MARKED', 'Named custom action and target');
    $views = $workspace->views($actor);
    verify($views[0]['options']['layout']['formMode'] === 'panel', 'JSON layout');
    verify($views[0]['desktopOnly'] === true, 'JSON desktop_only view option');
    verify(!str_contains(json_encode($views), 'notes.normalize'), 'Backend bindings not exposed');
    verify((int) $db->query("SELECT COUNT(*) FROM blade_audit WHERE outcome='success'")->fetchColumn() === 3, 'JSON operations retain audit');
    try {
        $workspace->executor->execute(new Context(new Blade\Shell\Identity('2', 'Other'), 'ui', $workspace->acl, $db), 'notes', 'get', $created['id'], []);
        throw new RuntimeException('JSON action bypassed ACL');
    } catch (Failure $error) {
        verify($error->status === 403, 'Default deny retained');
    }

    // OAuth needs the per-account switch of the built-in administration; JSON wires both.
    $oauth = ['module' => $root.'/lib/_AuthHandler', 'assets' => 'lib/_AuthHandler', 'site_url' => 'https://app.example.test/', 'providers' => [
        'Google' => ['keys' => ['id' => ['$env' => 'BLADE_TEST_UNSET_GOOGLE_ID', 'default' => ''], 'secret' => ['$env' => 'BLADE_TEST_UNSET_GOOGLE_SECRET', 'default' => '']]],
        'Facebook' => ['keys' => ['id' => 'f', 'secret' => 's'], 'scope' => 'email'],
    ]];
    $write([...$settings, 'oauth' => $oauth]);
    rejected(static fn() => JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db), 'OAuth without admin accepted');
    $write([...$settings, 'oauth' => $oauth, 'admin' => [], 'i18n' => ['default' => 'hu', 'languages' => ['hu' => 'Magyar', 'en' => 'English'], 'selector' => true]]);
    $app = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db);
    verify($app->oauth->providers() === ['Google', 'Facebook'] && !$app->oauth->configured('Google') && $app->oauth->configured('Facebook') && $app->oauth->assets === 'lib/_AuthHandler', 'AuthHandler providers from JSON; empty credentials shown, not usable');
    $users = array_values(array_filter($app->workspace->registry->views(), static fn($view) => $view->resource === 'blade_users'))[0];
    verify(in_array('blade_oauth', array_column($users->options['columns'], 'id'), true) && in_array('blade_locale', array_column($users->options['columns'], 'id'), true), 'OAuth and language switches in the user admin');
    verify(in_array('blade_api_keys', array_column($app->workspace->registry->views(), 'resource'), true), 'JSON admin includes API keys');

    // Tenancy is opt-in: an empty `tenancy` object enables it; `tenant_column` scopes resources and lookups.
    verify($app->workspace->tenancy === null && !in_array('blade_tenants', array_column($app->workspace->registry->views(), 'resource'), true), 'No tenancy without the tenancy section');
    file_put_contents($directory.'/tenant-module.json', json_encode(['lookups' => ['projects' => ['resource' => 'projects', 'table' => 'projects', 'key' => 'id', 'label' => 'title', 'tenant_column' => 'tenant_id']],
        'resources' => ['projects' => ['storage' => ['table' => 'projects', 'key' => 'id', 'tenant_column' => 'tenant_id'], 'fields' => [['name' => 'title', 'label' => 'Title', 'required' => true]], 'view' => ['title' => 'Projects', 'subview' => ['resource' => 'tasks', 'field' => 'project_id', 'embed' => false]]],
            'tasks' => ['storage' => ['table' => 'tasks', 'key' => 'id', 'tenant_column' => 'tenant_id'], 'fields' => [['name' => 'project_id', 'label' => 'Project', 'type' => 'select', 'options_lookup' => 'projects']], 'view' => ['title' => 'Tasks']]]], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
    $tenantDb = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    Schema::install($tenantDb);
    Blade\Tenancy\Tenancy::install($tenantDb);
    $tenantDb->exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, login TEXT, password_hash TEXT, name TEXT, active INTEGER)');
    $tenantDb->exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, title TEXT NOT NULL)');
    $tenantDb->exec('CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, project_id TEXT)');
    $tenantDb->exec("INSERT INTO projects (tenant_id, title) VALUES ('1', 'One'), ('2', 'Two')");
    $tenantDb->exec("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'projects', 'list', 'ui', 'allow', 'all', '', '')");
    $write([...$settings, 'admin' => [], 'tenancy' => [], 'workspace' => ['modules' => [$directory.'/tenant-module.json']]]);
    $tenantApp = JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], static fn() => [], $tenantDb);
    $registry = $tenantApp->workspace->registry;
    verify($tenantApp->workspace->tenancy !== null && $registry->tenantScoped('projects') && $registry->tenantScoped('tasks') && in_array('blade_tenants', array_column($registry->views(), 'resource'), true), 'JSON tenancy section and tenant_column');
    $tenantDb->exec("INSERT INTO blade_tenants (name) VALUES ('One')");$tenantDb->exec("INSERT INTO blade_tenant_members (tenant_id, actor_id) VALUES ('1', '1')");
    $choices = $registry->fields('tasks')['project_id']->metadata($tenantApp->workspace->context(new Blade\Shell\Identity('1', 'Synthetic'), 'ui', '1'))['options'];
    verify(array_values($choices) === ['One'], 'JSON lookup tenant_column scopes choices');
    $views = array_column($registry->views(), null, 'resource');
    verify($views['projects']->options['subview'] === ['child' => 'tasks', 'field' => 'project_id'] && !$registry->embedded('tasks'), 'JSON view subview (child kept in the menu)');
    $broken = json_decode(file_get_contents($directory.'/tenant-module.json'), true);
    $broken['resources']['projects']['view']['subview']['columns'] = [];
    file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
    rejected(static fn() => WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true), 'Unknown subview key accepted');
    $broken['resources']['projects']['view']['subview'] = ['resource' => 'tasks', 'field' => 'missing'];
    file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
    rejected(static fn() => WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true), 'Sub-view over an unknown field accepted');
    $broken['resources']['projects']['view']['subview'] = ['resource' => 'tasks', 'field' => 'project_id', 'select' => 'no'];
    file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
    rejected(static fn() => WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true), 'Non-boolean subview select accepted');
    $broken['resources']['projects']['view']['subview']['select'] = false;
    file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
    $selectViews = array_column(WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true)->registry->views(), null, 'resource');
    verify($selectViews['projects']->options['subview'] === ['child' => 'tasks', 'field' => 'project_id', 'select' => false], 'JSON view subview select: false');
    // `view.activate`: what double-click and Enter run; built-ins or a record action of the view, absent by default.
    verify(!isset($selectViews['projects']->options['activate']), 'No view activation by default');
    $broken['resources']['projects']['view']['subview']['embed'] = false;
    foreach (['subview', 'details', 'update', 'page'] as $activate) {
        $broken['resources']['projects']['view']['activate'] = $activate;
        file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
        $activateViews = array_column(WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true)->registry->views(), null, 'resource');
        verify($activateViews['projects']->options['activate'] === $activate, 'JSON view activate '.$activate);
    }
    foreach (['create', 'get', 'list', 'missing', true] as $activate) {
        $broken['resources']['projects']['view']['activate'] = $activate;
        file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true), 'Invalid view activate accepted: '.json_encode($activate));
    }
    // A page activation needs a child kept in the menu.
    $broken['resources']['projects']['view']['activate'] = 'page';
    $broken['resources']['projects']['view']['subview']['embed'] = true;
    file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
    rejected(static fn() => WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true), 'Page activation over an embedded child accepted');
    // Registries (docs/toolkit.md#registries): `view.commands` and a field `editor` are dotted project names.
    unset($broken['resources']['projects']['view']['activate']);
    $broken['resources']['projects']['view']['commands'] = ['demo.copy-text'];
    $broken['resources']['projects']['fields'][0]['editor'] = 'demo.rating';
    file_put_contents($directory.'/broken-module.json', json_encode($broken, JSON_THROW_ON_ERROR));
    $registryWorkspace = WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true);
    $registryViews = array_column($registryWorkspace->registry->views(), null, 'resource');
    $editorField = $registryWorkspace->registry->fields('projects')[$broken['resources']['projects']['fields'][0]['name']];
    verify($registryViews['projects']->options['commands'] === ['demo.copy-text'] && $editorField->editor === 'demo.rating', 'JSON view commands and field editor');
    foreach ([['view', 'commands', ['copy']], ['view', 'commands', 'demo.copy'], ['field', 'editor', 'rating'], ['field', 'editor', 7]] as [$where, $key, $value]) {
        $invalid = $broken;
        if ($where === 'view') $invalid['resources']['projects']['view'][$key] = $value; else $invalid['resources']['projects']['fields'][0][$key] = $value;
        file_put_contents($directory.'/broken-module.json', json_encode($invalid, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($tenantDb, [$directory.'/broken-module.json'], static fn() => [], true), 'Invalid JSON '.$key.' accepted: '.json_encode($value));
    }
    unlink($directory.'/broken-module.json');
    // Toolkit views (docs/toolkit.md#views): `view.id`, the activation map and module-level `views` of project kinds.
    $toolkit = [
        'resources' => ['projects' => [
            'storage' => ['table' => 'projects', 'key' => 'id'],
            'fields' => [['name' => 'title', 'label' => 'Title'], ['name' => 'kind', 'label' => 'Kind', 'type' => 'select', 'options' => ['a' => 'A', 'b' => 'B']]],
            'view' => ['title' => 'Projects', 'id' => 'projects.main', 'activate' => ['description' => 'Per kind.', 'field' => 'kind', 'map' => ['a' => 'view:demo.viewer', '*' => 'details']]],
        ]],
        'views' => ['demo.viewer' => ['kind' => 'demo.viewer', 'title' => 'Viewer', 'resource' => 'projects', 'record' => 'projects', 'actions' => ['get'], 'options' => ['loop' => true], 'open' => 'window', 'group' => 'Demo', 'icon' => 'dxi dxi-play', 'desktop_only' => false]],
    ];
    $toolkitBuild = static function (array $module) use ($directory, $tenantDb): Blade\Feature\Registry {
        file_put_contents($directory.'/toolkit-module.json', json_encode($module, JSON_THROW_ON_ERROR));
        return WorkspaceConfiguration::build($tenantDb, [$directory.'/toolkit-module.json'], static fn() => [])->registry;
    };
    $toolkitRegistry = $toolkitBuild($toolkit);
    $viewer = $toolkitRegistry->viewById('demo.viewer');
    verify(array_column($toolkitRegistry->views(), 'id') === ['projects.main', 'demo.viewer'] && $toolkitRegistry->viewById('projects.main')->resource === 'projects', 'JSON view.id names the resource view');
    verify($toolkitRegistry->viewById('projects.main')->options['activate'] === ['field' => 'kind', 'map' => ['a' => 'view:demo.viewer', '*' => 'details']], 'JSON activation map');
    verify($viewer->kind === 'demo.viewer' && $viewer->record === 'projects' && $viewer->open === 'window' && $viewer->options === ['loop' => true] && $viewer->group === 'Demo' && $viewer->actions === ['get'], 'JSON module-level project view');
    foreach ([
        'built-in kind' => static function (array &$m): void { $m['views']['demo.viewer']['kind'] = 'list'; },
        'duplicate view id' => static function (array &$m): void { $m['views']['projects.main'] = $m['views']['demo.viewer']; },
        'unknown views key' => static function (array &$m): void { $m['views']['demo.viewer']['menu'] = true; },
        'non-map activation' => static function (array &$m): void { $m['resources']['projects']['view']['activate'] = 3; },
        'unknown activation key' => static function (array &$m): void { $m['resources']['projects']['view']['activate']['default'] = 'details'; },
        'missing record view' => static function (array &$m): void { unset($m['views']); },
        'record view of another resource' => static function (array &$m): void { $m['views']['demo.viewer']['record'] = 'missing'; },
        'oversized options' => static function (array &$m): void { $m['views']['demo.viewer']['options'] = ['blob' => str_repeat('a', 70000)]; },
    ] as $case => $mutate) {
        $mutated = $toolkit;
        $mutate($mutated);
        rejected(static fn() => $toolkitBuild($mutated), 'Invalid toolkit JSON accepted: '.$case);
    }
    // A view id is declared once: a second resource whose view takes the same id fails at load (no replacement).
    $taken = $toolkit;
    $taken['resources']['archive'] = $toolkit['resources']['projects'];
    try { $toolkitBuild($taken); verify(false, 'A second resource view with a taken id accepted'); }
    catch (InvalidArgumentException $e) { verify($e->getMessage() === 'Duplicate view id: projects.main', 'A taken view id fails at load: '.$e->getMessage()); }
    unlink($directory.'/toolkit-module.json');
    $write([...$settings, 'tenancy' => ['mode' => 'x']]);
    rejected(static fn() => JsonApplication::load($file, ['accounts.active' => static fn($row) => (bool) $row['active']], $callbacks, $db), 'Unknown tenancy key accepted');

    $settings['session']['cookie_patth'] = '/wrong';
    $write($settings);
    rejected(static fn() => JsonApplication::load($file, [], $callbacks, $db), 'Unknown setting accepted');
    rejected(static fn() => WorkspaceConfiguration::build($db, [$module], static fn() => []), 'Unknown handler accepted');
    rejected(static fn() => WorkspaceConfiguration::build($db, [$module, $module], $callbacks), 'Duplicate resource accepted');

    // Media-aware list presentation keys: typed JSON, unknown or out-of-range keys still fail.
    $db->exec('CREATE TABLE clips (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, kind TEXT, file_id TEXT)');
    $db->exec("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', 'clips', 'list', 'ui', 'allow', 'all', '', ''), ('user', '1', 'clips', 'get', 'ui', 'allow', 'all', '', '')");
    $mediaModule = $root.'/tests/fixtures/configuration/media.json';
    $media = WorkspaceConfiguration::build($db, [$mediaModule], static fn() => []);
    $clips = array_values(array_filter($media->views($actor), static fn($view) => $view['resource'] === 'clips'))[0];
    $columns = array_column($clips['options']['columns'], null, 'id');
    verify($clips['options']['rowHeight'] === 64 && $clips['options']['tileMinWidth'] === 240 && $clips['options']['tiles'] === true, 'JSON row_height, tile_min_width and tiles');
    verify($columns['file_id']['media'] === 'library' && $columns['kind']['presentation'] === 'icon', 'JSON column.media and column.presentation');
    verify($media->registry->get('clips', 'list')->listSource->searchMetadata(new Context($actor, 'ui', $media->acl, $db)) === ['fields' => ['title']], 'JSON declared search');
    $clipsDefinition = json_decode(file_get_contents($mediaModule), true, flags: JSON_THROW_ON_ERROR);
    foreach ([
        ['view', 'tile_width', 200], ['view', 'row_height', 20], ['view', 'row_height', '56'], ['view', 'tile_min_width', 500], ['view', 'tiles', 'yes'], ['view', 'search', ['kind']], ['view', 'search', ['missing']], ['view', 'search', 'title'],
    ] as [$section, $key, $value]) {
        $variant = $clipsDefinition;
        $variant['resources']['clips'][$section][$key] = $value;
        file_put_contents($directory.'/media-variant.json', json_encode($variant, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($db, [$directory.'/media-variant.json'], static fn() => []), 'Invalid media view key accepted: '.$key);
    }
    foreach ([['media' => 'library', 'editable' => true], ['media' => 'Library'], ['presentation' => 'thumbnail'], ['thumbnail' => true]] as $column) {
        $variant = $clipsDefinition;
        $variant['resources']['clips']['fields'][2]['column'] = $column;
        file_put_contents($directory.'/media-variant.json', json_encode($variant, JSON_THROW_ON_ERROR));
        rejected(static fn() => WorkspaceConfiguration::build($db, [$directory.'/media-variant.json'], static fn() => []), 'Invalid media column accepted: '.json_encode($column));
    }
    // U5 keys: `file` fields, storage.computed, hooks.after_delete, operations.delete_policy, derived media columns; lookups over an archiving table hide archived rows.
    $db->exec("CREATE TABLE shelves (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, picture TEXT NOT NULL DEFAULT '', archived_at TEXT NULL, archived_by TEXT NOT NULL DEFAULT '')");
    $db->exec("CREATE TABLE shelf_items (id INTEGER PRIMARY KEY AUTOINCREMENT, shelf_id TEXT NOT NULL)");
    $db->exec("INSERT INTO shelves (title) VALUES ('Kept'), ('Archived'); INSERT INTO shelf_items (shelf_id) VALUES ('1'), ('1'), ('2')");
    foreach (['shelves' => ['list', 'get', 'create', 'update', 'delete'], 'shelf_items' => ['list', 'get', 'create']] as $resource => $actions) foreach ($actions as $action) $db->exec("INSERT INTO blade_rules(subject_type, subject_id, resource, action, channel, effect, scope, object_id, field_name) VALUES ('user', '1', '$resource', '$action', 'ui', 'allow', 'all', '', '')");
    $shelvesModule = [
        'lookups' => ['shelf_titles' => ['resource' => 'shelves', 'table' => 'shelves', 'key' => 'id', 'label' => 'title']],
        'resources' => [
            'shelves' => [
                'storage' => ['table' => 'shelves', 'key' => 'id', 'computed' => ['items' => 'SELECT COUNT(*) FROM shelf_items i WHERE i.shelf_id = CAST(blade_base.id AS TEXT)']],
                'hooks' => ['after_delete' => 'shelves.deleted'],
                'fields' => [
                    ['name' => 'title', 'label' => 'Cím', 'required' => true],
                    ['name' => 'picture', 'label' => 'Kép', 'type' => 'file', 'file' => ['resource' => 'library', 'mount' => 'a', 'folder' => 'Képek', 'accept' => ['image']]],
                    ['name' => 'items', 'label' => 'Tételek', 'type' => 'number'],
                ],
                'operations' => ['delete' => true, 'delete_policy' => 'archive'],
                'view' => ['title' => 'Polcok', 'columns' => [['id' => 'title', 'header' => 'Cím'], ['id' => 'picture', 'header' => 'Kép'], ['id' => 'picture_type', 'header' => 'Típus', 'media_of' => 'picture', 'part' => 'type'], ['id' => 'items', 'header' => 'Tételek']]],
            ],
            'shelf_items' => [
                'storage' => ['table' => 'shelf_items', 'key' => 'id'],
                'fields' => [['name' => 'shelf_id', 'label' => 'Polc', 'type' => 'select', 'options_lookup' => 'shelf_titles']],
                'view' => ['title' => 'Tételek'],
            ],
        ],
    ];
    file_put_contents($directory.'/shelves.json', json_encode($shelvesModule, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    $deletedShelves = [];
    $onDelete = static function (Context $ctx, string $id, array $target) use (&$deletedShelves): void { $deletedShelves[] = $id; };
    $shelfBindings = static fn() => ['shelves.deleted' => $onDelete];
    $shelfWorkspace = WorkspaceConfiguration::build($db, [$directory.'/shelves.json'], $shelfBindings);
    $shelfContext = new Context($actor, 'ui', $shelfWorkspace->acl, $db);
    $picture = $shelfWorkspace->registry->fields('shelves')['picture'];
    verify($picture->type === 'file' && $picture->file === ['resource' => 'library', 'mount' => 'a', 'folder' => 'Képek', 'accept' => ['image']] && $picture->media() === 'library', 'JSON file field');
    verify(!in_array('items', array_column($shelfWorkspace->registry->get('shelves', 'create')->fields, 'name'), true), 'JSON computed column is read-only');
    $shelfView = array_column(array_column($shelfWorkspace->views($actor), null, 'resource')['shelves']['options']['columns'], null, 'id');
    verify($shelfView['picture_type']['mediaOf'] === 'picture' && $shelfView['picture']['media'] === 'library' && $shelfView['picture']['type'] === 'file', 'JSON derived media column and file column');
    $read = $shelfWorkspace->executor->execute($shelfContext, 'shelves', 'list', null, ['limit' => 10, 'sort' => ['field' => 'items', 'direction' => 'desc']]);
    verify($read['items'][0]['title'] === 'Kept' && (int) $read['items'][0]['items'] === 2, 'JSON computed column listed and sortable');
    $options = static fn() => $shelfWorkspace->registry->fields('shelf_items')['shelf_id']->metadata($shelfContext)['options'];
    verify($options() === ['1' => 'Kept', '2' => 'Archived'], 'Lookup before archiving');
    $shelfWorkspace->executor->execute($shelfContext, 'shelves', 'delete', '2', ['revision' => $shelfWorkspace->executor->execute($shelfContext, 'shelves', 'get', '2', [])['revision']]);
    verify($deletedShelves === ['2'] && $db->query('SELECT archived_at FROM shelves WHERE id = 2')->fetchColumn() !== null, 'JSON delete_policy archive and after_delete hook');
    verify($options() === ['1' => 'Kept'], 'JSON lookup over an archiving table hides archived rows');
    foreach ([
        static function (array &$m): void { $m['resources']['shelves']['fields'][1]['file']['path'] = '/x'; },
        static function (array &$m): void { unset($m['resources']['shelves']['fields'][1]['file']['accept']); },
        static function (array &$m): void { $m['resources']['shelves']['fields'][1]['file']['accept'] = 'image'; },
        static function (array &$m): void { $m['resources']['shelves']['fields'][1]['files'] = []; },
        static function (array &$m): void { unset($m['resources']['shelves']['fields'][1]['file']); },
        static function (array &$m): void { $m['resources']['shelves']['operations']['delete_policy'] = 'purge'; },
        static function (array &$m): void { $m['resources']['shelves']['operations'] = ['delete_policy' => 'archive']; },
        static function (array &$m): void { $m['resources']['shelves']['hooks']['after_remove'] = 'shelves.deleted'; },
        static function (array &$m): void { $m['resources']['shelves']['hooks']['after_delete'] = 'shelves.unknown'; },
        static function (array &$m): void { $m['resources']['shelves']['storage']['computed'] = ['missing' => 'SELECT 1']; },
        static function (array &$m): void { $m['resources']['shelves']['storage']['computed'] = 'SELECT 1'; },
        static function (array &$m): void { $m['resources']['shelves']['view']['columns'][2]['part'] = 'codec'; },
        static function (array &$m): void { $m['resources']['shelves']['view']['columns'][2]['media_of'] = 'title'; },
    ] as $index => $change) {
        $variant = $shelvesModule;
        $change($variant);
        file_put_contents($directory.'/shelves-variant.json', json_encode($variant, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        rejected(static fn() => WorkspaceConfiguration::build($db, [$directory.'/shelves-variant.json'], $shelfBindings), 'Invalid U5 configuration accepted: variant '.$index);
    }
    echo "61ade JSON/environment configuration contracts passed.\n";
} finally {
    putenv('BLADE_TEST_CONFIG_PORT');
    foreach (glob($directory.'/*') as $temporary) {
        if (is_file($temporary)) {
            unlink($temporary);
        }
    }
    unlink($directory.'/.env');
    rmdir($directory);
}

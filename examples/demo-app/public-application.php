<?php
declare(strict_types=1);

use Blade\Admin\{Accounts, Administration};
use Blade\Configuration\WorkspaceConfiguration;
use Blade\Feature\{Field, SqlResource};
use Blade\Live\LiveConfig;
use Blade\Navigation\Menu;
use Blade\Shell\{ApplicationDefinition, SqlIdentityProvider};

require_once __DIR__.'/common.php';
if (!is_file(blade_demo_runtime().'/features.sqlite')) throw new RuntimeException('Run examples/demo-app/setup-workspace.php first.');
$db = blade_demo_db('features');
// The same synthetic catalogue and accounts as the feature demo; an independent browser session.
$workspace = WorkspaceConfiguration::build($db, [__DIR__.'/modules/catalog.json'], static fn() => []);
$notes = new SqlResource('notes', 'notes', 'id', [new Field('title', 'Cím', required: true)], 'owner_id');
$notes->register($workspace->registry, 'Jegyzetek');
$languages = blade_demo_languages();
$accounts = new Accounts($workspace, 'accounts', 'id', 'email', 'display_name', 'password_hash', createDefaults: ['active' => 1], languages: $languages);
$identities = Administration::register($workspace, $accounts, new SqlIdentityProvider(
    $db, 'accounts', 'id', 'email', 'password_hash', 'display_name', ['active'],
    allowed: static fn(array $row) => (bool) $row['active'],
));
$guest = $db->query("SELECT id FROM accounts WHERE email = 'guest@example.test'")->fetchColumn();
if ($guest === false) throw new RuntimeException('Run examples/demo-app/setup-workspace.php first.');
$liveEndpoint = blade_demo_setting('BLADE_DEMO_LIVE_ENDPOINT');

return new ApplicationDefinition(
    title: '61ade nyilvános demó', version: '0.2.0', identities: $identities, menu: new Menu([]),
    runtime: blade_demo_runtime('public'), sessionName: 'blade_public_demo', cookiePath: '/public/', assets: '../assets',
    workspace: $workspace, languages: $languages, accounts: $accounts,
    publicIdentity: (string) $guest,
    live: $liveEndpoint ? new LiveConfig('websocket', $liveEndpoint.'/public') : new LiveConfig(),
);

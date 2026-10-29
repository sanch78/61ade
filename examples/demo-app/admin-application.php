<?php
declare(strict_types=1);

/*
 * Base admin demo (/admin/): exactly what a new 61ade project starts with — sign-in,
 * language and theme selectors, mandatory administration (users, roles,
 * memberships, role and user rules) and the root API-key view. No business module.
 */

use Blade\Admin\{Accounts, Administration};
use Blade\Feature\{Registry, Workspace};
use Blade\Navigation\Menu;
use Blade\Shell\{ApplicationDefinition, SqlIdentityProvider};

require_once __DIR__.'/common.php';
if (!is_file(blade_demo_runtime().'/admin.sqlite')) throw new RuntimeException('Run examples/demo-app/setup-workspace.php first.');
$workspace = new Workspace(new Registry(), blade_demo_db('admin'));
$languages = blade_demo_languages();
$accounts = new Accounts($workspace, 'accounts', 'id', 'email', 'display_name', 'password_hash', createDefaults: ['active' => 1], languages: $languages);
$identities = Administration::register($workspace, $accounts, new SqlIdentityProvider(
    $workspace->db, 'accounts', 'id', 'email', 'password_hash', 'display_name', ['active'],
    allowed: static fn(array $row) => (bool) $row['active'],
));

return new ApplicationDefinition(
    title: '61ade alapadmin', version: '0.2.0', identities: $identities, menu: new Menu([]),
    runtime: blade_demo_runtime('admin'),
    sessionName: 'blade_admin_demo', cookiePath: '/admin/', assets: '../assets',
    workspace: $workspace, languages: $languages, accounts: $accounts,
);

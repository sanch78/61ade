<?php
declare(strict_types=1);

/*
 * Tenant demo (/tenants/): the starter admin with multi-tenancy on. Two synthetic tenants, accounts with zero, one
 * and two memberships, tenant-scoped projects and tasks (the task's project choice is a tenant-scoped lookup) and a
 * global notice board next to them. Sub-views: a project expands to its tasks (the task list keeps its own menu
 * entry), a task to its subtasks (a hierarchy: the toolbar acts on a selected subtask), and in the administration
 * a tenant to its members.
 */

use Blade\Admin\{Accounts, Administration};
use Blade\Feature\{Field, Lookup, Registry, SqlResource, Workspace};
use Blade\Live\LiveConfig;
use Blade\Navigation\Menu;
use Blade\Shell\{ApplicationDefinition, SqlIdentityProvider};

require_once __DIR__.'/common.php';
if (!is_file(blade_demo_runtime().'/tenants.sqlite')) throw new RuntimeException('Run examples/demo-app/setup-workspace.php first.');
$workspace = new Workspace(new Registry(), blade_demo_db('tenants'), tenancy: true);
$languages = blade_demo_languages();
$accounts = new Accounts($workspace, 'accounts', 'id', 'email', 'display_name', 'password_hash', createDefaults: ['active' => 1], languages: $languages);
$identities = Administration::register($workspace, $accounts, new SqlIdentityProvider(
    $workspace->db, 'accounts', 'id', 'email', 'password_hash', 'display_name', ['active'],
    allowed: static fn(array $row) => (bool) $row['active'],
));
$projects = new SqlResource('tenant_projects', 'tenant_projects', 'id', [
    new Field('title', 'Megnevezés', required: true, max: 200, validation: ['unique' => true]),
    new Field('status', 'Állapot', 'select', options: ['open' => 'Nyitott', 'done' => 'Lezárt'], defaultValue: 'open', column: ['editable' => true]),
], tenantColumn: 'tenant_id');
$projects->register($workspace->registry, 'Projektek', group: 'Tenant demó');
$projects->registerDelete($workspace->registry);
$tasks = new SqlResource('tenant_tasks', 'tenant_tasks', 'id', [
    new Field('title', 'Feladat', required: true, max: 200),
    new Field('project_id', 'Projekt', 'select', required: true, max: 20, options: (new Lookup('tenant_projects', 'tenant_projects', 'id', 'title', tenantColumn: 'tenant_id'))->options(...)),
    new Field('parent_id', 'Szülőfeladat', 'select', max: 20, options: (new Lookup('tenant_tasks', 'tenant_tasks', 'id', 'title', extra: ['' => 'Nincs (fő feladat)'], tenantColumn: 'tenant_id'))->options(...), column: ['secondary' => true]),
    new Field('done', 'Kész', 'checkbox', defaultValue: '0', column: ['editable' => true, 'align' => 'center', 'width' => 90]),
], tenantColumn: 'tenant_id');
$tasks->register($workspace->registry, 'Feladatok', group: 'Tenant demó');
$tasks->registerDelete($workspace->registry);
$workspace->registry->subview('tenant_projects', 'tenant_tasks', 'project_id', embed: false);
$workspace->registry->subview('tenant_tasks', 'tenant_tasks', 'parent_id');
(new SqlResource('tenant_notices', 'tenant_notices', 'id', [
    new Field('title', 'Közlemény', required: true, max: 200),
]))->register($workspace->registry, 'Közös hirdetőtábla', group: 'Tenant demó');

// Live data: the feature demo's WebSocket unit serves this application at <endpoint>/tenants (docs/demos.md).
$liveEndpoint = blade_demo_setting('BLADE_DEMO_LIVE_ENDPOINT');

return new ApplicationDefinition(
    title: '61ade tenant demó', version: '0.1.0', identities: $identities, menu: new Menu([]),
    runtime: blade_demo_runtime('tenants'),
    sessionName: 'blade_tenant_demo', cookiePath: '/tenants/', assets: '../assets',
    workspace: $workspace, languages: $languages, accounts: $accounts,
    live: $liveEndpoint ? new LiveConfig('websocket', $liveEndpoint.'/tenants') : new LiveConfig(),
);

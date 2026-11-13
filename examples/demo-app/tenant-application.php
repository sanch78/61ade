<?php
declare(strict_types=1);

/*
 * Tenant demo (/tenants/): the starter admin with multi-tenancy on. Two synthetic tenants, accounts with zero, one
 * and two memberships, tenant-scoped projects and tasks (the task's project choice is a tenant-scoped lookup) and a
 * global notice board next to them. Sub-views: a project expands to its tasks (the task list keeps its own menu
 * entry), a task to its subtasks (a hierarchy: the toolbar acts on a selected subtask), and in the administration
 * a tenant to its members. Global categories count the tenant-scoped items each actor could list (count fields).
 * Shared items (tenant '') are read by every tenant beside its own and edited by shared@, who works without a tenant.
 * A per-tenant service switch shows or hides the service's data view (view availability).
 */

use Blade\Admin\{Accounts, Administration};
use Blade\Feature\{Action, Context, Field, Lookup, Registry, SqlResource, Workspace};
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
$projects->register($workspace->registry, 'Projektek', group: 'Tenant demó', guide: 'Tenanthoz kötött lista: csak az aktív tenant projektjei látszanak, és az új projekt is oda kerül. Egy projekt kinyitva a feladatait mutatja (alnézet), a Kész kapcsoló ott is szerkeszthető.'."\n\n".'Válts tenantot a navigációs sorban: a lista a másik tenant adataira cserélődik.');
$projects->registerDelete($workspace->registry);
$tasks = new SqlResource('tenant_tasks', 'tenant_tasks', 'id', [
    new Field('title', 'Feladat', required: true, max: 200),
    new Field('project_id', 'Projekt', 'select', required: true, max: 20, options: (new Lookup('tenant_projects', 'tenant_projects', 'id', 'title', tenantColumn: 'tenant_id'))->options(...)),
    new Field('parent_id', 'Szülőfeladat', 'select', max: 20, options: (new Lookup('tenant_tasks', 'tenant_tasks', 'id', 'title', extra: ['' => 'Nincs (fő feladat)'], tenantColumn: 'tenant_id'))->options(...), column: ['secondary' => true]),
    new Field('done', 'Kész', 'checkbox', defaultValue: '0', column: ['editable' => true, 'align' => 'center', 'width' => 90]),
], tenantColumn: 'tenant_id');
$tasks->register($workspace->registry, 'Feladatok', group: 'Tenant demó', guide: 'Tenanthoz kötött feladatok hierarchiája: egy feladat kinyitva az alfeladatait mutatja, a Projekt választólistája csak az aktív tenant projektjeit kínálja.'."\n\n".'Jelölj ki egy alfeladatot: az eszköztár rá vált. Az Alelemek parancs a feladat alatti teljes hierarchiát ablakban nyitja meg.');
$tasks->registerDelete($workspace->registry);
$workspace->registry->subview('tenant_projects', 'tenant_tasks', 'project_id', embed: false);
$workspace->registry->subview('tenant_tasks', 'tenant_tasks', 'parent_id');
(new SqlResource('tenant_notices', 'tenant_notices', 'id', [
    new Field('title', 'Közlemény', required: true, max: 200),
]))->register($workspace->registry, 'Közös hirdetőtábla', group: 'Tenant demó', guide: 'Tenanttól független, globális lista: minden tenantban ugyanaz látszik, tenant nélküli fióknak is.'."\n\n".'Válts tenantot: ez a lista nem változik, a Projektek és a Feladatok igen.');

// Count fields (FB-0173): global categories (no tenant column) count the tenant-scoped items each actor could list in the
// active tenant: all items of the category and its subcategories (an item's category or that category's parent; the
// tree has two levels), and the notes attached directly. The items list sits beside the category tree (tree navigation).
$categories = new SqlResource('tenant_categories', 'tenant_categories', 'id', [
    new Field('name', 'Megnevezés', required: true, max: 120),
    new Field('parent_id', 'Szülőkategória', 'select', max: 20, options: (new Lookup('tenant_categories', 'tenant_categories', 'id', 'name', extra: ['' => 'Nincs (fő kategória)']))->options(...), column: ['secondary' => true]),
    new Field('item_count', 'Tételek (alkategóriákkal)', 'number', column: ['align' => 'right', 'width' => 200]),
    new Field('note_count', 'Jegyzetek (közvetlenül)', 'number', column: ['align' => 'right', 'width' => 200]),
], counts: [
    'item_count' => ['resource' => 'tenant_items', 'match' => ['category_id', 'category_parent']],
    'note_count' => ['resource' => 'tenant_items', 'match' => ['category_id'], 'filters' => ['kind' => 'note']],
]);
$categories->register($workspace->registry, 'Kategóriák', create: false, update: false, group: 'Tenant demó', guide: 'Tenanttól független kategóriák, tenanthoz kötött számokkal: a Tételek oszlop a kategória és alkategóriái tételeit, a Jegyzetek oszlop a közvetlenül hozzá tartozó jegyzeteket számolja, mindig csak az aktív tenantban és csak azokat, amelyeket a fiók listázhat.'."\n\n".'Válts tenantot: a kategóriák ugyanazok, a számok a másik tenantéi. Az Adatok is mutatja őket.');
$workspace->registry->subview('tenant_categories', 'tenant_categories', 'parent_id');
$items = new SqlResource('tenant_items', 'tenant_items', 'id', [
    new Field('title', 'Tétel', required: true, max: 200),
    new Field('category_id', 'Kategória', 'select', required: true, max: 20, options: (new Lookup('tenant_categories', 'tenant_categories', 'id', 'name'))->options(...)),
    new Field('kind', 'Fajta', 'select', required: true, options: ['note' => 'Jegyzet', 'file' => 'Fájl'], defaultValue: 'note'),
    // The category's parent: a scope key of the recursive count only, offered on no list surface.
    new Field('category_parent', 'Szülőkategória', scopeOnly: true),
    // Shared items (FB-0175): the list marks them with a read-only text (rows carry `_shared` for a project presentation).
    new Field('origin', 'Forrás', column: ['width' => 110]),
], computed: ['category_parent' => "(SELECT c.parent_id FROM tenant_categories c WHERE CAST(c.id AS CHAR) = blade_base.category_id)", 'origin' => "CASE WHEN blade_base.tenant_id = '' THEN 'Shared' ELSE 'Own' END"],
    tenantColumn: 'tenant_id', sharedTenant: '', sharedRoles: ['shared_editor']);
$items->register($workspace->registry, 'Tételek', group: 'Tenant demó', guide: 'Tenanthoz kötött tételek a globális kategóriafa mellett: a fában kijelölt kategória tételei látszanak. Egy új vagy archivált tétel a Kategóriák számait is változtatja.'."\n\n".'A Shared jelű közös tételeket minden tenant látja a sajátjai mellett, de csak olvashatja: kijelölve a szerkesztés és a törlés nem érhető el. Tenant nélkül a shared@example.test fiók csak a közös tételeket látja, és ő hozza létre és szerkeszti őket.');
$items->registerDelete($workspace->registry, 'archive');
// The tree beside the items is a view of its own (a tree's node view has no menu entry); `Kategóriák` keeps its page.
$workspace->registry->view('tenant_categories', 'Kategóriák', [['id' => 'name', 'header' => 'Megnevezés']], ['get'], id: 'tenant_category_tree', menu: false);
$workspace->registry->subview('tenant_category_tree', 'tenant_category_tree', 'parent_id');
$workspace->registry->tree('tenant_items', 'tenant_category_tree', 'category_id', 'name');

// View availability (docs/workspaces.md#view-availability): a tenant switches its `feedback` service on and off in
// `Szolgáltatások`; `Visszajelzések` (and with it the `Ügyfélszolgálat` menu group) is offered only while it is on.
// The switch reloads the shell (`reauthenticate`), so the menu follows at once; the feedback rows stay while it is off.
$enabled = new Field('enabled', 'Bekapcsolva', 'checkbox', defaultValue: '0', column: ['editable' => true, 'align' => 'center', 'width' => 130]);
$services = new SqlResource('tenant_services', 'tenant_services', 'id', [
    new Field('service', 'Szolgáltatás', 'select', options: ['feedback' => 'Visszajelzések']),
    $enabled,
], readOnly: ['service'], tenantColumn: 'tenant_id', afterSave: static fn() => ['reauthenticate' => true]);
$services->register($workspace->registry, 'Szolgáltatások', create: false, update: false, group: 'Tenant demó', guide: 'Az aktív tenant szolgáltatásai. A Bekapcsolva kapcsoló a tenantban be- vagy kikapcsolja a szolgáltatást; a felület ezután újratölt.'."\n\n".'A Beállítások ablakban ugyanaz a kapcsoló űrlapon is elérhető.'."\n\n".'Kikapcsolt Visszajelzések szolgáltatásnál a Visszajelzések nézet és az Ügyfélszolgálat menücsoport eltűnik, az adatok megmaradnak, és visszakapcsoláskor ugyanazokkal jelenik meg újra.');
// One update action: its command opens settings, its editable cell still uses the same SQL save and revision checks.
$workspace->registry->add(new Action('tenant_services', 'update', 'Mentés', [$enabled, new Field('revision', 'Verzió', required: true, max: 64)],
    static fn($ctx, $target, $values) => $services->save($ctx, $target, $values), resolve: $services->target(...), write: true,
    editHandler: static fn($ctx, $target, $values) => $services->save($ctx, $target, $values, true),
    icon: 'bi bi-gear', commandLabel: 'Beállítások'));
$workspace->registry->appendViewActions('tenant_services', ['update']);
$serviceOn = static function (Context $ctx): bool {
    if ($ctx->tenant === null) return false;
    $q = $ctx->db->prepare("SELECT enabled FROM tenant_services WHERE tenant_id = ? AND service = 'feedback'");
    $q->execute([$ctx->tenant]);
    return (bool) $q->fetchColumn();
};
(new SqlResource('tenant_feedback', 'tenant_feedback', 'id', [
    new Field('message', 'Üzenet', required: true, max: 500),
    new Field('status', 'Állapot', 'select', options: ['new' => 'Új', 'done' => 'Kezelt'], defaultValue: 'new', column: ['editable' => true]),
], tenantColumn: 'tenant_id'))->register($workspace->registry, 'Visszajelzések', group: 'Ügyfélszolgálat', attention: ['filters' => ['status' => 'new']], available: $serviceOn,
    guide: 'A tenant Visszajelzések szolgáltatásának beérkezett üzenetei; a menüpont az új üzenetek számát mutatja.'."\n\n".'Csak akkor látszik, ha a szolgáltatás az aktív tenantban be van kapcsolva (Tenant demó → Szolgáltatások).');

// Live data: the feature demo's WebSocket unit serves this application at <endpoint>/tenants (docs/demos.md).
$liveEndpoint = blade_demo_setting('BLADE_DEMO_LIVE_ENDPOINT');

return new ApplicationDefinition(
    title: '61ade tenant demó', version: '0.1.0', identities: $identities, menu: new Menu([]),
    runtime: blade_demo_runtime('tenants'),
    sessionName: 'blade_tenant_demo', cookiePath: '/tenants/', assets: '../assets',
    workspace: $workspace, languages: $languages, accounts: $accounts,
    // View guides of the framework's own views (docs/workspaces.md#view-guide).
    guides: blade_demo_admin_guides(tenancy: true),
    live: $liveEndpoint ? new LiveConfig('websocket', $liveEndpoint.'/tenants') : new LiveConfig(),
);

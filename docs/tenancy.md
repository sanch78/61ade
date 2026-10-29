# Multi-tenancy

Status: stage 1 implemented and verified on 2026-10-29 ([FB-0069](feedback.md#fb-0069)).
Tenant-scoped file spaces, cross-tenant administration of tenant data and
per-tenant roles are later stages (see [limits](#limits-and-later-stages)).

## Terminology and scope

The public term is **tenant**. *Organization* in the
[security model](security-model.md) and the [plan](development-plan.md#m2--auth-tenant-és-acl-alap)
means the same thing and remains a synonym. A tenant is an isolated data
context inside one installation: users work only in the tenants assigned to
them, and every tenant-scoped resource is filtered on the server.

Tenancy is optional. An application turns it on explicitly. Without it the
framework creates no tenant tables and adds no menu entries, fields, selectors,
request handling or behavior, and existing demos and suites run unchanged.

The framework owns tenants, memberships, the active-tenant resolution, scoped
SQL reads and writes, tenant-bound API keys, audit and the admin views. The
consumer owns its business tables, adds a tenant column to them, and decides
which resources are scoped.

## Owner decisions (2026-10-29)

- **Roles stay global.** Roles and rules work unchanged and apply in every
  tenant the user belongs to. Membership is a separate gate on top of the ACL.
  Per-tenant role assignments are a later extension: a tenant column on role
  memberships.
- **No membership:** sign-in works and global views stay available as the ACL
  allows (Users, Roles and Tenants included, so the first administrator can
  set up tenants). Every tenant-scoped view, read, write and API call fails
  closed with 403 "Nincs aktív tenant." The lower bar shows "Nincs hozzárendelt
  tenant".
- **Tenant table:** framework-owned `blade_tenants` only. Applications link
  their records to it through their own tenant column.

## Enabling tenancy

PHP application definition: the workspace carries the switch.

```php
$workspace = new Blade\Feature\Workspace(new Blade\Feature\Registry(), $pdo, tenancy: true);
// Administration::register() then adds the Tenants view, memberships on the
// Users form and tenant-bound API keys.
```

JSON: an empty top-level `tenancy` object (no further keys yet):

```json
{ "tenancy": {}, "admin": {}, "workspace": {"modules": ["modules/projects.json"]} }
```

Schema: an explicit installer step after `Blade\Access\Schema::install()`;
requests never migrate.

```php
Blade\Access\Schema::install($pdo);
Blade\Tenancy\Tenancy::install($pdo); // blade_tenants, blade_tenant_members, tenant_id on blade_audit and blade_tokens
```

The installer is idempotent and additive. `Tenancy::ensure($pdo, 'Name')` and
`Tenancy::join($pdo, $tenantId, $actorId)` are setup helpers for seeding.
Tenant IDs are strings in every API (`'1'`).

## Tenant-scoped resources

`SqlResource` takes `tenantColumn`; JSON uses `storage.tenant_column`.

```php
$projects = new SqlResource('projects', 'projects', 'id', [
    new Field('title', 'Title', required: true, validation: ['unique' => true]),
], tenantColumn: 'tenant_id');
```

For such a resource the framework:

- limits lists, counts, filters, search, sorting, cursors, singleton reads,
  live watch (polling and WebSocket) and `__form` to the active tenant;
- treats another tenant's object as not found (404) for get, update, delete,
  bulk items and custom actions resolved through `target()`;
- stamps the active tenant on create. The tenant column cannot be a declared
  field, default, key, owner or unique column, so a client value is rejected as
  an unknown field;
- checks uniqueness (`validation.unique`, `unique` keys) within the tenant, so
  another tenant's values are neither revealed nor in the way;
- refuses the resource without an active tenant. The executor, `__form` and
  `views()` check `Registry::tenantScoped()`, and the adapter checks again.

Relations: `Lookup` takes `tenantColumn` (JSON `lookups.<name>.tenant_column`).
Its choices come from the active tenant, so a related ID of another tenant fails
field validation. A scoped resource's `select` options should always use a scoped
lookup. Field option closures, guards, hooks, usage providers and `computed` SQL
receive `Context::$tenant` and are trusted consumer code. They must stay
within the row's tenant themselves.

Global resources (no tenant column) sit next to scoped ones unchanged.

Fail-closed rule: only adapters that apply the tenant to every read and write
mark a resource as scoped (`Registry::scopeToTenant()`, called by `SqlResource`).
File managers, diagrams and calendars have no tenant adapter yet. With tenancy
on they stay global and must not hold tenant data (see
[limits](#limits-and-later-stages)).

## Memberships and administration

- **Tenants** (`blade_tenants` resource, admin group): create, rename and deactivate
  (the `Aktív` switch; there is no delete). Each tenant expands to its **access
  list**, a non-selectable [sub-view](workspaces.md#sub-views) (`select: false`)
  of resource `Tenancy::MEMBERS` (`blade_tenant_members`, embedded, no menu entry
  of its own). It lists **every account** the actor may list through the Accounts
  lookup (object and e-mail ACL, at most 2000), with `E-mail`, `Név` and one
  `Hozzáférés` switch. Row ids are `<tenant id>:<account id>`. The rows cannot be
  selected and open no form; the switch is the only write. The toolbar's
  `Hozzáférések` command (and the card button on a phone) opens the same list in
  a window, with the switch only (no add, edit or delete).
- **Access switch:** checked means an active membership. Switching on inserts the
  membership, or sets `active = 1` on a suspended row; switching off deletes the
  row. Each change is the executor's single-field edit (`__edit` / `update`) with
  the `blade_tenant_members.update` ACL, a revision check and an audit entry
  (`tenant_id`, `actor_id`, `access` in the detail). Without the update right the
  request is refused (403); an unknown tenant or invisible account is not found
  (404). The `_subview` count of a tenant is the number of accounts with access
  (a `ListSource` `countWhere`); every tenant still expands (`_subview_open`).
- **`active` column:** kept for compatibility (earlier installs and seeds). The UI
  no longer shows it; a row with `active = 0` lists as no access and grants none.
  `Tenancy::member()` and `memberships()` still require `active = 1`.
- **Users** form: the `Tenantok` multiselect assigns tenants per user. It is stored
  in `blade_tenant_members` through `Blade\Feature\RelatedSet`, a general
  many-to-many counterpart of `RelatedStorage` that shares the form's
  transaction, revision and audit (field names only). A save removes deselected
  links and adds new ones only. A deleted row (access off) is not a member, so the
  multiselect and the access list agree.
- `Permissions::grantAdministration()` gives the protected admin role the Tenants
  and access-list actions too (`ADMIN_RESOURCES` keeps `Tenancy::MEMBERS`; the
  access list has only `list` and `update`).
- Memberships and the tenant's active state are read fresh on every request.
  A change takes effect on the user's next request. A deactivated tenant drops
  out of every membership.

## Active tenant and switching

The server resolves the tenant on every request and never accepts one from a
client parameter:

- **Shell page load:** the session's tenant while it is still a membership,
  otherwise the first membership by name. With one membership it is chosen
  automatically and no selector is shown.
- **Browser API requests (`?blade=1`):** the session's tenant only while it is
  still a membership. After a revocation the request has no tenant, so scoped
  resources fail closed until the page reloads.
- **API keys:** the key's binding (below).

Several memberships show a tenant selector in the navigation row; below 768 px
it is a `Tenant: <name>` submenu of the main menu, so the row keeps room for the
menu. A switch posts
`action=tenant` with the CSRF token. The server checks membership, stores the
choice, audits `session.tenant_switch` (with `from`), issues a new CSRF token
and reloads the shell. The reload clears lists, forms, caches and
live subscriptions. Because of the new token, other tabs still
showing the previous tenant can no longer read or write. A live ticket is bound
to the tenant it was issued for, and the WebSocket bridge refuses it once the
session has switched or the membership has ended.

The lower bar shows the active tenant, or the no-tenant notice.

## Permissions, API keys and audit

Effective permission for a scoped action is: active tenant and membership, then
channel and key scope, then the unchanged ACL (role/user rules, object scope,
field rules), then the business guards.

There is no cross-tenant bypass. Managing tenants and memberships is an ordinary
global, ACL-checked and audited resource. Reading another tenant's data is not
possible in this stage.

API keys (`blade_tokens.tenant_id`): with tenancy on, the API-key form has a
`Tenant` field. A key is bound to one tenant its owner belongs to, or it is
global (`''`), which reaches global resources only. The binding cannot change
after issue. Every request rechecks that the owner is still a member; if not,
the key is refused (403). Scope, owner rights and tenant must all allow the
action.

Audit: `blade_audit.tenant_id` records the active tenant of every action
executed with one, including failures, `subscribe`, `describe`, transfers and
tenant switches. Without tenancy the column does not exist and is not written.

## Programmatic access (workers and CLI)

Workers use the same executor, and therefore the same ACL, transaction and audit:

```php
$app = require 'application.php';
$workspace = $app->workspace;
$actor = $app->identities->find('42') ?? throw new RuntimeException('Unknown actor');
$workspace->tenancy->memberships($actor->id);      // ['3' => 'Name', ...]
$ctx = $workspace->context($actor, 'ui', '3');     // 403 unless an active membership
$ctx->acl->allows($actor->id, 'projects', 'update', 'ui', '17');
$workspace->executor->execute($ctx, 'projects', 'update', '17', [...]);
```

`Workspace::context()` checks membership when it is called. A long-running
worker builds a fresh context before each step, so revocation and deactivation
stop it. Use channel `api` with explicit `$scopes` to restrict a worker to
declared operations. Running and supervising the processes is consumer business
logic.

## Consumer integration

1. Enable tenancy: set `tenancy: true` on the Workspace, or add `"tenancy": {}`
   in JSON.
2. Install: run `Schema::install()` and then `Tenancy::install()` in the setup
   step.
3. Declare scope: add a non-null tenant column (string or integer) to each
   business table that belongs to a tenant, then set `tenantColumn` /
   `tenant_column` on its resource and on every lookup over it.
4. Assign memberships in Users (or with a tenant's `Hozzáférések` switches), or seed them with
   `Tenancy::join()`.
5. Re-issue API keys that must reach tenant data as tenant-bound keys.

**Adding tenancy to an existing application:** a consumer migration adds the
tenant column to each scoped table and creates the first tenant
(`Tenancy::ensure`). It then fills the column for every existing row and joins
the existing users. After that, enable tenancy and set the tenant columns.
Enabling it earlier hides the scoped data (fail closed) rather than leaking it.
Existing keys stay global and lose access to scoped resources until they are
re-issued.

## Limits and later stages

- **Files:** a tenant-scoped file space or mount (one definition, separate content
  per tenant) is not implemented. File storage, thumbnail tasks and ZIP
  manifests are keyed per space, so this is a separate change. Until then a
  file manager is global under tenancy.
- **Diagrams, calendars, custom non-SQL actions:** no tenant adapter. Custom
  handlers can use `Context::$tenant`, but such a resource is not marked as
  scoped and gets no automatic fail-closed check.
- **Per-tenant roles** and an explicit, audited **cross-tenant read** capability
  are later extensions, as stated in the owner decisions.
- Exports exist only as file downloads; list exports do not exist yet.
- The tenant demo uses WebSocket at `/live/tenants` when the demo `.env`
  selects it ([FB-0074](feedback.md#fb-0074)). The browser test covers an
  update frame and the refusal of its ticket on another application's path; a
  tenant switch closing an open socket is covered by the bridge check only.

## Verification

- `php8.4 tests/shell/tenancy.php` covers the security-matrix rows: opt-in
  without side effects; reads, writes, filters, lookups, related IDs, watch,
  bulk and uniqueness inside and across tenants; the no-membership behavior;
  memberships from both sides; the access list (every account, the flag, on/off
  inserts and deletes and is audited, stale revision, ACL denial, unknown pair,
  access count, `select: false` metadata); revocation and deactivation; API keys
  (tenant-bound, global, foreign tenant, scope); and audit.
- `tests/shell/configuration.php` covers the JSON `tenancy` section, plus
  `tenant_column` on storage and on lookups, and the JSON sub-view `select`.
- `npm run test:browser -- tests/shell/tenancy.spec.cjs` uses the tenant demo:
  one membership shows no selector; no membership shows the notice and the API
  fails closed; with two memberships, switching removes the previous tenant's
  rows, a foreign ID returns 404, and the old page token is refused; a tenant
  expands to its access list (every user, rows not selectable, the toolbar stays
  on the tenant, the switch persists after a reload, full list in a window); on a
  phone the card's `Hozzáférések (n)` button opens the list full screen, and the tenant
  choice is in the main menu.
- Demo: https://61ade.sanch.hu/tenants/, see [demos](demos.md#tenant-demo-tenants).

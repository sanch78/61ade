# ACL, actions and audit

Status: the initial capability below was implemented and integration-verified on 2026-10-16.

<a id="tartós-szerződés"></a>

## Durable contract

Identity data is separate from authorization. Actors are humans or services with
role memberships and direct rules. There is no admin bypass. Registered resources
and actions form the permission catalog; unknown permissions cannot grant access.
A catalog, including one generated from definitions, never grants rights by itself.

Opt-in [public access](authentication.md#public-access) resolves a dedicated active
account without sign-in and uses its ordinary UI rights in the same executor.
There is no automatic public grant or Bearer fallback. All visitors share that
account's `own` scope; the guest has no active tenant. Its actions retain their
normal audit actor id, with no login success event for a guest page.

Rules contain subject (user/role), resource, action, channel (ui/api), effect
(allow/deny), object scope (all/own/id, and [delegated](#delegated-access) on a
resource that declares it), optional object ID and field (whole action
or named field). The backend data provider determines ownership. Explicit deny
wins; no matching allow means deny. A field allow alone cannot authorize an
action. API token scopes only restrict. UI and API share one executor.

Roles and rules are managed through framework forms/grids. FB-0036 requires
a framework-owned admin module for every application; [users](admin.md) (A1)
and [roles/rules](admin.md#szerepkörök-és-jogosultságok-a2) (A2) are implemented.
The consumer supplies identity/data adapters. See [product direction](product-direction.md).
Rule administration requires its own permission, changes are audited and decisions
are fresh on each request. An ACL allow cannot override a business constraint,
such as a disabled account or self-profile restriction.

Read scopes become SQL predicates; field projection happens server-side.
Clients cannot sort/filter/aggregate forbidden fields. Writes have explicit
field lists, object checks and transactions. Revision conflicts return 409.

Every registered action follows authentication → channel/token scope → ACL →
field validation → business guard → transaction → handler + audit → commit.
Successful-write audit shares the transaction. Failures roll back and produce
separate failure audit; audit failure cannot silently permit a successful write.
Never log passwords, tokens, sessions, raw input or personal field values.
Events contain action, target, changed field names and outcome.

New business flows must be registered actions. Cron/job/import adapters must
use the same executor. Unmigrated legacy flows do not thereby become audited.

<a id="bővítési-határ"></a>

## Extension boundary

Without tenancy an application uses one realm. Optional [multi-tenancy](tenancy.md)
adds explicit tenant membership and the `SqlResource`/`Lookup` scope adapters.
Isolation is claimed only for resources whose adapter applies the tenant
(`Registry::tenantScoped()`); other kinds stay global and are documented as
limits there. A scoped resource may declare [shared rows](tenancy.md#shared-rows):
tenants read them, and the executor refuses every write action on them with a
tenant (403, left out of `_actions`); a declared role without a tenant writes them. Roles and rules are global and apply in every member tenant. Complex ABAC requires typed registered condition adapters, never
UI-authored PHP/SQL/JavaScript expressions.

<a id="delegated-access"></a>

## Delegated access

A person can see records through an ownership relationship that the
application keeps in its own tables, and may be refused changes to them
([FB-0180](feedback.md#fb-0180)). The feature is opt-in per `SqlResource`.
Rules with scope `delegated` grant or deny the rows the actor reaches through
the declared links.

```php
use Blade\Feature\{Delegation, DelegationLink, DelegationVia};

new SqlResource('collections', 'collections', 'id', $fields, delegation: new Delegation(
    read: [
        new DelegationLink(table: 'collection_readers', objectColumn: 'collection_id', actorColumn: 'actor_id', resourceColumn: 'id'),
        // A collection is also visible to the owner of one of its items:
        // item_owners.item_id = items.id, items.collection_id = collections.id.
        new DelegationLink('item_owners', 'item_id', 'actor_id', 'id', via: new DelegationVia(table: 'items', key: 'id', parentColumn: 'collection_id')),
    ],
    write: [new DelegationLink('collection_writers', 'collection_id', 'actor_id', 'id')],
));
```

JSON: `storage.delegation` with `read` and `write` lists of
`{table, object_column, actor_column, resource_column, via?: {table, key, parent_column}}`.

**Declaration**

- A link row matches when `link.actorColumn` equals the authenticated actor
  and `link.objectColumn` equals the row's `resourceColumn`. With `via`, the
  conditions are `link.objectColumn = via.key` and
  `via.parentColumn = resource.resourceColumn`. Only one intermediate level
  is supported.
- `resourceColumn` is a stored column of the resource: its key, a stored
  field such as a parent foreign key, a default column or the owner column.
  Computed, related, count, secret and password fields are rejected when the
  resource is registered.
- Identifiers are plain SQL names. Link and intermediate tables may not be
  `blade_` tables (in any case) or the resource table itself.
- The links of one set are OR-combined, and an empty set grants nothing. A
  set holds at most ten links.
- The framework binds the actor and all values, and qualifies each
  correlation with the outer row's alias or table name. The link subqueries
  use their own aliases, so a link table with the same column names never
  shadows the resource row.

**Evaluation**

- **Read set:** non-write actions use it (`list`, `get`, custom read
  actions), as do the SQL scopes of lists, totals, cursors, filters,
  searches, related `Lookup` choices, count fields, sub-view counts and
  live/watch/singleton observations.
- **Write set:** write actions use it.
- **Write allow on a stored row:** a delegated write allow also requires
  the effective `get` of that row on the same channel. That `get` may come
  from any rule, including an ordinary `all`/`own`/`id` grant. On the API it
  also requires the token's `<resource>.get` scope.
- **Create:** a delegated `create` of the `SqlResource` itself is decided
  on the final normalized, defaulted and server-stamped values, without a
  readable stored row. A consumer's own `create` action (for example with
  `create: false`) has no final-value check, so a delegated allow grants it
  nothing. Upload staging for a deferred create (`Executor::authorize`)
  needs the actor to hold at least one write link.
- **Update:** checks the stored row first and then the final destination,
  together with the field rules of every written field. Moving a row into a
  collection that is not writable is refused, and a field deny applies to
  the final values too.
- **Generated keys:** a primary-key `resourceColumn` cannot authorize a
  create, because the key does not exist yet. That check fails closed. An
  independent `all`/`own` create grant still works; the framework never
  falls back to it automatically after a delegated check fails.
- **Deny:** a delegated deny (object or field) uses the raw link set of the
  action, so another allow never bypasses it. Deny precedence, field rules,
  channel and token scopes, the tenant realm, the archive policy and the
  resource's `where` all apply as before.
- **Custom actions:** the stored row is read again from the resource table,
  and the ACL object is first checked by the resource's own resolver
  (tenant realm, `where`, archive policy; 404 otherwise). A `row` returned
  by the action's resolver must be that stored row, with every stored column
  present and equal; otherwise the action fails closed (403). This covers a
  forged or partial row and a row of another resource. A resolver may
  return only the id, or the resource's own `target()`.
- **No verified object:** for an action without a verified object, a
  delegated allow grants nothing and a delegated deny denies.
- **Bulk, inline edit and upload:** bulk items, inline cell edits and the
  upload authorization (`Executor::authorize`) use the same decision.
- **Manual order:** with delegated `move` rules, every peer that a move
  renumbers must itself be movable before anything is written.
- **Missing declaration:** a `delegated` rule on a resource without a valid
  declaration is a configuration error. The operation fails (500, logged)
  instead of skipping the rule. This also covers an `all` allow combined
  with a delegated deny whose declaration was removed. The administration
  refuses to save such a rule. A deny with an unknown scope now denies
  everything.
- **Opting out:** a resource without the option, or one whose actors have
  no `delegated` rules, behaves as before.

**Limits and prerequisites**

- **Global links:** link tables are not tenant-filtered. Their relationship
  keys must be globally unique across the realms involved. Tenant-local
  values reused in another tenant need explicit realm-aware links, because
  filtering only the resource row does not tell such links apart. FB-0175
  shared rows stay read-only for a tenant even when a write link matches.
- **Custom exports:** use the resource's `ListSource`, which applies the
  scoped predicate, rather than their own SQL. A `Lookup` (or any scope
  query) must read the delegated resource's own table; another table fails
  closed. A resource `where` may name its table.
- **Key types and collations:** the link and resource columns compared with
  each other need compatible types. On MySQL, string keys also need the same
  charset and collation, and the connection collation must match the schema
  ([connection collation](shell.md#database-connection)). Under a
  case-insensitive collation, string actor or object keys that differ only
  in case match each other.
- **Per-row checks:** row actions (`_actions`) read the links once per row
  and set. Index the consumer's link tables on (actor, object).

Demo: `Gyűjtemények` in the [feature demo](demos.md), with
`delegate@example.test`.

<a id="használati-felület-első-implementáció"></a>

## Usage interface (initial implementation)

`Registry::add(Action)` registers an action. A server resolver supplies object
and owner; the handler implements business work. `SqlResource` declares
list/get/create/update SQL adapters with bound parameters, dynamic cursor loading
and optimistic revisions. `Registry::view` declares only browser-needed columns,
actions, grouping and singleton behavior. DHTMLX Workspace builds the grid,
toolbar and editor. The `__form` kernel endpoint returns fields allowed for the
specific target; saving checks them again.

`ApplicationDefinition.workspace` takes `Workspace(registry, PDO)`. Use the
same PDO connection for handlers and audit. All writes are transactional; a
handler must not commit independently. Reliable external side effects such as
mail/device control require a future framework outbox/job capability.

Install explicitly with `Blade\Access\Schema::install(PDO)`; HTTP requests never
migrate schemas. Consumers seed roles/initial permissions through a separate
audited migration. `role_key` is stable; the display name may change. Identifiers
and complete rule lists remain backend-only.

API: `POST ./?blade=1`, `Content-Type: application/json`,
`Authorization: Bearer <token>`. Body:
`{"resource":"notes","action":"get","id":"1","values":{}}`.
Tokens are stored hashed, expire and can be revoked; example scope: `notes.get`.
Every request rechecks owner account state. Browsers use the same endpoint with
session and `X-BLADE-CSRF`. Writes require POST; no CSRF-free cookie API channel.

`Passwords` takes the consumer account schema/hash codec. Self-service changes
require current password and confirmation, with 12–128 characters. Success
revokes sessions/API tokens. Secret-field actions allow 5 attempts/minute/actor/
action. Existing consumer password formats remain the consumer's compatibility decision.

Synthetic demo: `php8.4 examples/demo-app/setup-workspace.php`, then open the
managed demo URL. Notes uses the same registry/DHTMLX adapter with its own SQLite
data. `tests/shell/access.php` and `workspace.spec.cjs` historically verified ACL,
API scopes, rollback and actual form/grid saving. Consumer integration/public
installation was verified separately; real-account business acceptance belongs
to the owner.

<a id="kapcsolt-mezők-és-határok"></a>

## Related fields and limits

`Lookup` uses the related object's list permission, SQL scope and label-field
permission. `Field.options` may be a backend closure taking Context. Saving
validates against the same choices supplied to the form. The current limit is
2000 choices; larger catalogs need searchable/paged lookup support.
[Lists](workspaces.md) use cursor scrolling and automatic live updates, with
no manual pager/refresh buttons. Clients cannot supply SQL, arbitrary sorting
or filtering expressions.

Without field rules, object permissions are inherited. Once an actor has a
separate rule for a field, that field needs a matching allow and matching deny
wins. A deny-only rule therefore closes the field by default; add explicit allow
for partial exceptions. Secret fields never enter list projection or audit.

`registerDelete` is an explicit opt-in with target/revision/permission checks,
business deleteGuard and transactional audit. Enable it only where deletion is supported.

Rule caches live only within the current Workspace instance and are invalidated
at action start, after SQL changes and on rollback. There is no cross-request
permission cache; list projection avoids repeating ACL SQL per row.

For owned SQL resources, create assigns the authenticated actor as owner;
clients cannot set it. Own-object create rules check that prospective owner.
Revisions derive from declared data fields, key and owner, excluding unrelated
account/password/activity fields. MySQL requires transactional InnoDB tables
for audit and modified data; the installer creates its tables accordingly.

<a id="multipart-audit-detail-sqlite"></a>

## Multipart transport, audit detail and SQLite transactions

Added for the [file manager](files.md) ([FB-0058](feedback.md#fb-0058)); the
mechanisms are general.

- **Multipart.** An action opts in with `Action::$upload` (byte limit). Such a
  request is `multipart/form-data` to the same `POST ./?blade=1` endpoint with a
  JSON `request` field (`resource`, `action`, `id`, `values`, ≤ 64 KiB) and file
  parts. The browser still sends `X-BLADE-CSRF`; API calls use Bearer tokens.
  Verified PHP upload parts reach the handler as `Context::$uploads`
  (`Blade\Feature\Upload`: field, client name, temporary path, size, error).
  Other actions and kernel operations reject multipart with 415; a body above the
  limit plus 64 KiB is rejected with 413. Handlers validate names, sizes and
  contents themselves and never trust the browser's MIME value.
- **ACL object and audit detail.** A resolver may return `acl_id` to separate the
  ACL object from the audited object (file actions authorize the mount, audit
  the entry) and `audit` with related IDs. A handler result's `audit` array is
  merged. `Schema::install()` adds the `blade_audit.detail` JSON column to
  earlier databases; rows without detail keep the previous column list, so an
  un-upgraded database keeps auditing other actions. Detail carries IDs only.
- **Structured failures.** `Failure::$details` adds a non-sensitive `details`
  object to the error response, e.g. `409` conflicts with the current revision.
- **SQLite transactions.** The executor and list observer start transactions
  with `Blade\Infrastructure\Transaction::begin()`: `BEGIN IMMEDIATE` on
  SQLite, the PDO default elsewhere. Every action writes audit, and two
  concurrent deferred SQLite transactions that both read and then write fail at
  once with `SQLITE_BUSY` (observed as a 500 when both file panels loaded
  together). Immediate transactions serialize writers within the busy timeout
  instead. Other direct `beginTransaction()` callers are unchanged.

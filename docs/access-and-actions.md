# ACL, actions and audit

Status: the initial capability below was implemented and integration-verified on 2026-10-16.

<a id="tartós-szerződés"></a>

## Durable contract

Identity data is separate from authorization. Actors are humans or services with
role memberships and direct rules. There is no admin bypass. Registered resources
and actions form the permission catalog; unknown permissions cannot grant access.
A catalog, including one generated from definitions, never grants rights by itself.

Rules contain subject (user/role), resource, action, channel (ui/api), effect
(allow/deny), object scope (all/own/id), optional object ID and field (whole action
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

The first application uses one realm. Multiple organizations require explicit
realm membership and data-source scope adapters; tenant isolation is not claimed
without them. Complex ABAC requires typed registered condition adapters, never
UI-authored PHP/SQL/JavaScript expressions.

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

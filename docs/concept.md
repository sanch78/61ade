# Detailed 61ade concept

Status: design baseline 2026-10-16, product update 2026-10-21. This describes
the target, not completed functionality. [Product evidence](product-direction.md#2-megvalósított-képességek-bizonyítékkal-és-hiányok)
and [usage](usage.md) track verified implementation.

<a id="0-elfogadott-termékirány--2026-10-21"></a>

## 0. Accepted product direction — 2026-10-21

Canonical requirements: [R1–R12](product-direction.md#1-elfogadott-termékkövetelmények),
[ADR-0003](decisions/0003-product-direction.md).

- Reusable admin framework, PHP reference backend and versioned language-neutral JSON contract. JSON transport alone does not establish independence.
- Consumers use framework tools for the shared infrastructure and request missing general capabilities from 61ade without being blocked; their domain data, logic and UI are theirs ([ADR-0004](decisions/0004-project-domain-freedom.md)).
- Fullscreen HTML5/DHTMLX, framework adapters and supported extension points. Layout is foundational; forms/layouts/grids grow for real ergonomic workflow needs. No external benchmark or exhaustive coverage goal (FB-0037).
- Localization/themes apply to every new capability.
- Mandatory framework user/ACL/API-key/log admin; consumers supply configuration, identity/storage adapters and domain rules.
- Users have e-mail/password/full name, per-user provider permission and configurable e-mail verification. Detailed implementation status belongs to current usage.
- MySQL/PostgreSQL/SQLite/JSON-file targets with [guarantees](product-direction.md#3-tárolási-határ-és-szükséges-garanciák); demo SQLite.
- Modular JSON, named handlers, no eval/executable strings/unrestricted scripting.
- Generated catalogs never grant rights; server checks every channel; API exposure/scopes narrow access.
- [Event catalog](product-direction.md#4-eseménynapló-lefedési-katalógus) separates audit/security/operational events, excluding credentials/sensitive payloads.
- Navigable synthetic kitchen sink for all implemented public capabilities.
- Need → framework gap → smallest extension → demo/checks → documentation → consumer integration; consumer releases follow their own contracts.

The following 2026-10-16 design remains applicable where consistent; this
section/ADR-0003 prevail on conflicts. The later [environment contract](development.md#development-environment)
requires direct development/testing only, without deployment or project backups.

<a id="1-cél-és-sikerkritérium"></a>

## 1. Goal and success criteria

61ade connects object views/actions/validation/REST through developer-authored typed
feature definitions. Explicit application services implement business logic;
the framework never invents it.

First consumer: the complete CityScreen admin rewrite. Success means serving all
agreed consumer capabilities, not a few CRUD screens. Migration remains separate
project work with its own repository/acceptance inventory.

- Simple features need no separate frontend CRUD implementation.
- Complex screens/actions are supported extensions, not bypasses.
- UI/REST share use cases, transactions and policies.
- Organization/object/field authorization is uniform and server-side.
- A clean checkout can serve a second independent consumer.
- Legacy ADE API/runlevels/generated JavaScript responses are excluded.

<a id="2-hatókör"></a>

## 2. Scope

Framework scope: registry, renderer/shell, component adapters, query/API/auth/
policy infrastructure, organization context, files/jobs/audit/observability,
and mandatory user/ACL/key/log admin (R5, partly implemented).

Excluded: CityScreen concepts/tables/DMS control/quotes/worksheet rules/campaign
logic/production conversion. No visual no-code builder or rewrite of DHTMLX controls.

Further tree/chart/scheduler/Gantt components are demand-driven candidates, not
promised coverage. [Matrix](component-matrix.md) records availability/license/
implementation; a directory does not grant vendor rights.

<a id="3-technológiai-alap"></a>

## 3. Technology foundation

Accepted reference baseline: modern PHP-FPM + OPcache. Protocol need not depend
on PHP. Technical minimum PHP 8.4; PHP 8.5 compatibility remains to verify.
Legacy consumer runtime is not the reference and must not change automatically.

Symfony 7.4 LTS hosting is a proposal for HTTP/router/DI/validation/security/
messenger, to settle in M1 ADR. Business domain must not depend on HTTP hosting.
Do not implement password hashing, HTTP servers or generic SQL drivers from scratch.

Frontend: TypeScript/Suite Standard; Scheduler/Gantt only when required.
No mandatory React/Vue layer. TypeScript compiles at build time; ordinary served
frontend assets do not need a Node server. M1 pins tool/vendor versions after
package/license inspection. FrankenPHP worker mode is a later measured option,
not an initial dependency.

<a id="4-csomagolás-és-függési-irány"></a>

## 4. Packaging and dependency direction

One repository, co-versioned PHP/frontend packages; separate consumer repository.
Namespace Blade; frontend exports will define its public API.

Applications are accessed through registered contracts. Proposed names:
FeatureProvider, QueryProvider, ActionHandler, Policy, IdentityProvider,
TenantResolver, FileStorage, JobDispatcher, AuditSink. This list does not claim
all are existing classes. Tenant resolution exists as `Blade\Tenancy\Tenancy` with
`Workspace::context()` ([tenancy](tenancy.md)), not as a separate resolver contract.

Local Composer paths/workspace links are allowed. Distributed versions need
lockfiles/reproducible builds without absolute development paths. Publishing a
GitHub repository does not publish npm/Packagist packages.

<a id="5-feature-modell"></a>

## 5. Feature model

A feature represents a business capability, not necessarily a table. Multiple
features may share a domain with different views/access. Database schema never
becomes an API automatically.

Definitions contain:

1. Stable ID, labels/localization keys.
2. Object identity and organization-scope source.
3. Fields: type/read-write role/format/server validation/presentation.
4. Relations: target feature/choices/reference/lazy loading.
5. QueryProvider: allowed filtering/sorting/paging/aggregation.
6. Views: grid/form/tree/DataView/calendar with shared fields.
7. Actions: input/handler/policy/transaction/audit/sync or job.
8. Explicit API exposure per feature/resource/action.
9. Registered frontend component/event IDs.

One entry definition may delegate complex parts into classes/subdefinitions;
single-configuration use does not mean one giant file.
Registry compilation checks references, duplicate IDs, handlers, types and vendor
capabilities. Invalid definitions must not yield partially working delivery;
validation belongs in build/CI qualification.

<a id="6-backend-és-frontend-metaadat-határa"></a>

## 6. Backend and frontend metadata boundary

Full definitions stay server-side. Browsers receive checked UI projection:
labels/types/layout/available actions/endpoint IDs, never SQL, policy code,
secrets, internal class names or forbidden field definitions.

Metadata gets a protocol version and clear mismatch handling. A documented
language-neutral schema/conformance set should permit non-PHP implementations;
currently only bootstrap protocol 1 is checked. Cache keys include application/
definition version, locale and permission context; never share another user's/
organization's projection.

No executable JS/PHP strings. Frontend handlers are registered build-time IDs.
Custom HTML requires an explicit safely handled component.

<a id="7-adatfolyam-és-tranzakciók"></a>

## 7. Data flow and transactions

Read: authenticate → organization context → feature/action permission → query
scope → validated filters/sort/page → read → field projection → response.

Write: authentication/CSRF or token → organization → input allowlist →
authorized target query → policy → validation → business use case →
transaction → audit → response.

Inline/form saves share use cases. Bulk/import/scheduler drag/Gantt links cannot
bypass them; API is not an arbitrary table mutation endpoint.

Related changes share a transaction. Reliable external effects start after commit
through durable outbox/jobs where needed. Handlers must tolerate repeated delivery;
language/queue choice does not create exactly-once business behavior.

Optimistic versioning is the baseline: stale edits return 409 rather than silently
overwriting new changes.

<a id="8-lekérdezési-modell-és-teljesítmény"></a>

## 8. Query model and performance

Resolve fields/filters/sort through allowlists. Never accept SQL, table names,
joins or arbitrary columns from clients. Bind parameters; backend adapters
construct scope.

Bound page sizes and set final limits from measured loads. Large lists need
server paging; trees lazy children; calendars time windows; Gantt documented
edition-specific loading.

Counts/autocomplete/aggregates/export/relations use the same scope. Do not filter
for authorization after reading rows. Efficient scope plans/indexes are acceptance
criteria.

Identify cache scope/invalidation first; shared caches cannot disclose another
organization's results. Add Redis only for measured functional need.

<a id="9-admin-shell-és-komponensintegráció"></a>

## 9. Admin shell and component integration

Target shell: navigation, organization switching, workspaces/panels/tabs,
notifications, loading/empty/errors, routing/state. Menus hide unavailable features;
backend checks independently.

Adapters share mount/update/destroy lifecycle: detach handlers, abort obsolete
requests and ignore stale responses. Warn about unsaved changes during navigation.

Common contracts cover localization/themes/timezones/errors, keyboard/focus,
permission changes, cancellation/network loss. Revoked data must not remain
in active editors.

Saved views may be personal or explicitly shared. Saved filters never contain raw
SQL and must be revalidated after field-right changes.

<a id="10-naptár-gantt-és-hierarchia"></a>

## 10. Calendar, Gantt and hierarchy

Timestamps/timezones/all-day/recurrence are distinct types. Test DST; never
automatically convert date-only fields into instants.

Drag/resize invokes business commands. Server rejection restores UI with clear
errors. Conflicts/resource rules/work calendars are consumer policy exposed
through framework hooks.

Tree moves check source/target organizations, both permissions and cycles.
Gantt links reject cycles/inaccessible targets. Standard adapters cannot claim
PRO-only functionality.

<a id="11-rest-és-külső-kliensek"></a>

## 11. REST and external clients

Internal admin API and external REST exposure are separate switches; UI access
does not automatically expose a feature externally. External API is versioned,
and documentation describes enabled actions only.

Machine identities carry their own organization/action rights. Token scopes
restrict identity permissions. M2 settles concrete auth/lifecycle; no custom
cryptographic protocol.

Errors are structured: field validation, unauthenticated, denied/inaccessible,
conflict, limit, internal failure. Return request ID without exposed SQL/stack
traces in consumer operational responses. Public wire schema needs M1–M3 contracts.

<a id="12-fájlok-audit-és-háttérmunka"></a>

## 12. Files, audit and jobs

Files default outside public roots. Download/preview pass policy; IDs are not
filesystem paths. Require MIME/size checks, safe names, quota and interrupted
upload cleanup.

Separate audit/security/operational logging via the [catalog](product-direction.md#4-eseménynapló-lefedési-katalógus).
Audit records actor/tenant/action/target/time/outcome/correlation. No passwords,
tokens or codes. Explicitly mask sensitive fields; consumers configure retention/access.

Jobs carry explicit tenant/actor references, recheck permissions, retry/idempotency
and failure handling. Exports need valid rights at generation and download.

<a id="13-tesztelés-és-üzemeltetés"></a>

## 13. Testing and operations

Units: compilation/policy combinations/filter validation. Integration: isolated
real databases/transactions/scopes/permissions. Contracts: metadata/frontend.
E2E: actual shell/supported component behavior. Performance: p50/p95/p99/error
rate/throughput/SQL count/time/CPU/memory on fixed synthetic data.

Consumer/demo PHP-FPM pools and OPcache may have separate managed configuration;
initial integration never switches old admin PHP. Request/slow-query/job metrics
support diagnosis without personal-data labels. Host changes belong to Infra.

<a id="14-cityscreen-teljes-átállása"></a>

## 14. Complete CityScreen migration

The consumer owns screen/action/integration inventory and retain/redesign/remove
decisions. Rewrite all migrated business logic; no legacy compatibility layer.

Before each consumer transition, declare data writer, temporary shared database,
schema compatibility and recovery route. Two admins must not write the same
objects under differing rules without control.

Data retention/IDs/media paths/DMS/public readers are consumer migration contracts.
Public UI rewrite is outside scope, but preserving its behavior is required.
Retire old ADE admin only after the agreed business capability list is complete.
A completed framework demo does not complete CityScreen migration.

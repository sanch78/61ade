# 61ade development plan

Status: initial login/navigation shell/build after M0, 2026-10-16.
Parts of M1/M2/M4 exist; full milestones remain open. Order indicates dependency,
not estimates. Updated for [R1–R12](product-direction.md)/[ADR-0003](decisions/0003-product-direction.md)
on 2026-10-21. The [dev-only environment](development.md#development-environment)
has no deployment/post-deploy testing/backups; future package/consumer release
plans below do not introduce those workflows here.

<a id="igényvezérelt-fejlesztési-módszer"></a>

## Demand-driven development method

Need → framework gap → smallest reusable extension → synthetic demo/relevant
checks → usage docs → consumer integration. Consumer-controlled release, if
applicable, belongs to that consumer's environment contract.

Milestones group dependencies, not release gates. Useful delivery needs no
exhaustive component/function catalog. Scope grows from real needs; no external
benchmark ([FB-0037](feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör)).

<a id="termékirány-munkafolyamatok-javasolt-nem-ütemezett"></a>

## Product workstreams (proposed, unscheduled)

See [open questions](product-direction.md#5-nyitott-tervezési-kérdések-és-javasolt-munka).

| Workstream | Requirement | Next direction |
| --- | --- | --- |
| P1 Mandatory admin | R5/R6/R9 | [Plan](admin-module-plan.md), A1–A3 complete; A4 logs/A5 recovery remain. |
| P2 Language-neutral JSON | R1 | Version bootstrap/metadata/query/action/errors/capabilities; propose conformance fixtures. |
| P3 Storage boundary | R7 | Interfaces/guarantee tests; qualify SQLite/MySQL; PostgreSQL/JSON only with need and guarantees. |
| P4 Events | R10 | Categories, missing security events and retention. |
| P5 Kitchen sink | R11 | Navigable examples for every implemented capability; two demos already exist. |
| P6 OAuth | R6 | Implemented through AuthHandler; real provider acceptance and trust-policy limits remain. |
| P7 JSON maturity | R8/R9 | Schema/version, catalog query and orphan reconciliation. |

<a id="m0--külön-repó-szerkezet-és-koncepció"></a>

## M0 — Separate repository, structure and concept

Deliverable: checkout/package/test/demo structure, concept, ACL model, component
matrix and plan. Consumer may use an ignored editor symlink.
Acceptance: valid manifests/links, clear package boundaries, no secrets/vendor/
business code and distinct remote push. This scaffold is not a runnable release.

<a id="m1--runtime-és-csomagszerződés"></a>

## M1 — Runtime and package contract

- PHP 8.4+/Composer without altering old admin; managed FPM/OPcache reference.
- Decide Symfony proposal, components and DB adapter in ADR.
- Pin Node/build/TypeScript/vendor versions and verify licenses.
- Decide own license/GPL distribution before publication.
- Composer autoload/frontend build/synthetic demo with public-only webroot.
- Define HTTP/API errors, protocol v1, registry/adapter contracts.
- Automated lint/static/unit/contracts/CI, locks and verifiable build.

Acceptance: documented clean-checkout demo health/empty shell, clear version
mismatch rejection, no absolute consumer path. No business-module promise.

<a id="m2--auth-tenant-és-acl-alap"></a>

## M2 — Authentication, tenant and ACL foundations

Synthetic identities/two organizations, login/logout/session/CSRF/switching,
machine auth, roles/actions/query scopes/field projection/cache invalidation/audit.
Acceptance: relevant security matrix automated, direct API cannot bypass policy,
organization switch clears old data and framework knows no consumer legacy flags.

Status 2026-10-29: optional [multi-tenancy](tenancy.md) stage 1 is implemented and
verified on synthetic data ([FB-0069](feedback.md#fb-0069)). It covers two
tenants, zero, one and two memberships, server-side switching that clears the
old data, tenant-scoped SQL resources and lookups, tenant-bound API keys, audit
and a CLI context. Tenant-scoped file spaces, per-tenant roles and cross-tenant
reads remain open.

<a id="m3--első-teljes-feature-folyamat"></a>

## M3 — First complete feature flow

Synthetic projects/tasks: list/search/server paging/details/forms/create/update/
explicit delete/archive. One typed definition produces UI metadata/action
registration/optional external REST.

Input validation, allowed filters/sorts, query/handler, transactions/optimistic
conflicts, structured errors/read-only/denied fields.
Acceptance: form/inline/API share use case; API exposure can be off while admin
works; concurrent edits do not silently lose data; SQL stays out of UI definitions.

<a id="m4--teljes-admin-shell-és-adatnézetek"></a>

## M4 — Complete shell and data views

Navigation/panels/tabs/windows/toolbars/unsaved state/permission actions/preferences/
localization/focus/keyboard. Grid/form/DataView/related selectors; tree/list/chart
only on demand. TreeGrid requires a licensed explicit capability.
All views participate in localization/themes/lifecycle checks.

Acceptance: documented config/E2E for supported adapters, no handler growth
across mount/destroy, clear unsupported-capability errors rather than blank/partial
UI, no unintended loss of permissions across view changes.

<a id="m5--időtervezés-gantt-és-összetett-műveletek"></a>

## M5 — Scheduling, Gantt and complex actions

Start only for concrete needs. Scheduler windows/recurrence/timezones/DST;
Gantt hierarchy/dependencies; drag/resize/link changes are server commands.

Timeline/resources/autoscheduling/PRO need edition/license decisions. Basic Gantt
does not prove complete coverage. Acceptance: denied drag restores, inaccessible
targets/cycles reject, DST/recurrence behavior documented, versions pinned.

<a id="m6--fájlok-exportimport-jobok-és-megfigyelhetőség"></a>

## M6 — Files, import/export, jobs and observability

Private storage/upload/preview/download, quota/checks, async import/export,
retry/idempotency/outbox where needed, audit/request IDs/structured logs/job
state/slow queries.

Acceptance: no forbidden-field/cross-organization exports/downloads, revoked job
access enforced, retries do not duplicate effects, large exports do not hold web
requests, logs exclude credentials.

Planned slice: [uploader and file/media list](files-media-plan.md) (FB-0063).

<a id="m7--teljesítmény-csomagkiadás-és-második-fogyasztó"></a>

## M7 — Performance, package distribution and second consumer

Fix machine/runtime/database profiles and synthetic datasets. Measure lists,
lookups/complex ACL/bulk/calendar/export start: p50/p95/p99, throughput/error rate,
CPU/memory/SQL count/time. Set SLOs after baseline and consumer volume inventory
before major migration; empty JSON benchmarks are insufficient.
Worker mode needs measured benefit and isolation checks.

Acceptance: another empty consumer installs pinned versions without local symlinks;
public API/release notes/upgrades/license settled; demo/consumer can upgrade
independently. This future package process is not a deployment of this checkout.

<a id="párhuzamos-alkalmazási-munkafolyamat--teljes-cityscreen-admin"></a>

## Parallel consumer workstream — complete CityScreen admin

All work in this section belongs to the consumer repository; this concept does
not replace its concrete migration plan or authorize modifying it now.

<a id="a0--teljes-leltár-még-a-tömeges-átírás-előtt"></a>

### A0 — Inventory before bulk rewriting

For every screen/action: entrypoint/permissions/data/relations/effects/integrations,
retain/redesign/remove decision, target module, acceptance and dependencies.
Inventory identity/organizations/rights; content/master data/media/customer admin;
sales/partners/quotes/contracts/marketing; displays/AP/maps/status/control/DMS;
Workday/dispatch/worksheets; mail/export/import/cron/logs. Actual evidence determines
module boundaries.

Field Workday/public UI rewrites are not automatically admin scope. Record their
dependencies and backend work needed for ADE retirement separately.

<a id="a1--új-alkalmazásváz-a-cityscreen-v2-alatt"></a>

### A1 — New consumer skeleton under CityScreen /v2

Package dependencies/configuration/separate public root/environment/test database,
identity/organization migration design. Choose a small real first module from
A0 that proves permissions and relations.

<a id="a2--modulcsoportonkénti-átállás"></a>

### A2 — Transition by module groups

New use cases/policies/explicit schema/data migrations, dependencies before
dependent flows. Map old/new capabilities; do not copy known defects automatically.
Consumer acceptance includes tests/role walkthroughs/data retention/integrations,
one designated writer and its documented recovery process. Irreversible data
conversion needs data recovery, not merely switching application versions.
This describes consumer responsibilities, not a 61ade backup workflow.

<a id="a3--teljes-admin-kiváltása"></a>

### A3 — Complete admin replacement

Every agreed capability is implemented or explicitly removed; background jobs/
integrations have owners. Only then retire old routes/writers. List remaining ADE
dependencies; retiring admin does not prove the whole system ADE-free.

<a id="közös-definition-of-done"></a>

## Shared definition of done

- Implementation and relevant verification in the same batch; preserve existing suites and follow the task-test retention policy.
- Update documentation/capability matrix/API contracts.
- Localized framework catalogs hu/en/de and supported themes.
- Reproducible synthetic feature-demo example through public interfaces.
- New events in catalog; storage needs in guarantee matrix.
- [Usage](usage.md) explains integration/checks; [feedback](feedback.md) records lessons, incorporated canonically. Open expectations are not implemented features.
- No consumer knowledge/reverse dependencies in framework.
- Record actual checks/limits; scaffold is not capability.
- Follow [local commit/push](development.md#commit-and-push); FB-0043 supersedes the old mandatory gitpush command.
- Report outcomes/checks/concrete blockers. This project has no deployment or post-deployment gate.

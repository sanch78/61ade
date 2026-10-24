# Product direction and demand-driven development

Date: 2026-10-21. Decisions:
[FB-0036](feedback.md#fb-0036--kötelező-adminmodul-és-igényvezérelt-keretfejlesztés),
[FB-0037](feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör),
[ADR-0003](decisions/0003-product-direction.md).
This source/documentation inventory does not itself change runtime behavior.

Keep three categories separate:

1. Accepted product requirement: an owner-approved goal, not proof of completion.
2. Implemented capability supported by source/tests: the only category that may be called complete.
3. Open design question/proposed work: not yet a decision.

FB-0036's Ext JS reference was mistaken and withdrawn by FB-0037.
There is no external frontend benchmark, component mapping or exhaustive
coverage requirement. The foundation is DHTMLX; capabilities grow with actual needs.

## Project identity and environment

**61de** lives at `/space/share/libs/61ade`. Its only environment is
https://61ade.sanch.hu/, used directly for development and testing.
There is no production, deployment, post-deployment testing or project backup
workflow ([FB-0049](feedback.md#fb-0049), [FB-0051](feedback.md#fb-0051)).
R1–R12 remain applicable; consumer release references apply only to consumers'
own contracts. Naming ([FB-0050](feedback.md#fb-0050)): product/packages
`61de`, PHP `Blade\`, env `BLADE_*`, technical prefix `blade`.
[Migration](renaming.md) is explicit, never an HTTP-request side effect.

<a id="1-elfogadott-termékkövetelmények"></a>

## 1. Accepted product requirements

| # | Requirement |
| --- | --- |
| R1 | **Framework/contract.** Reusable admin framework with PHP reference backend and versioned language-independent frontend JSON contract. JSON transport alone does not prove independence: documented schema, versioning and language-independent conformance checks are required. |
| R2 | **Mandatory framework use.** Applications use 61de tools. Extend missing reusable capabilities first, then configure consumers. Only the documented logically-unextendable [framework-first exception](development.md#mandatory-framework-development-rules) is allowed; convenience is insufficient. |
| R3 | **Frontend.** Fullscreen HTML5 using bundled DHTMLX, 61de adapters and supported extension points. Layout is foundational. Forms/layouts/grids grow to serve complex ergonomic workflows as needs arise. |
| R4 | **Localization/themes.** Both are built in; every new capability participates. |
| R5 | **Mandatory administration.** Every application uses framework-owned user, ACL, API-key and system/audit-log admin built from 61de declarations/tools. Consumers supply configuration, identity/storage adapters and domain rules. Supersedes application-only user admin in FB-0004/ADR-0002. |
| R6 | **Users.** E-mail, password, full name, per-user Google/Facebook permission and configurable e-mail login verification. |
| R7 | **Storage.** Targets: MySQL, PostgreSQL, SQLite, JSON files; demo uses SQLite. Support means meeting section 3 guarantees, not merely opening a connection. |
| R8 | **Modular JSON.** Application structure and declarative business definitions use structured JSON; complex behavior uses explicitly registered handlers. No executable strings, eval or unrestricted scripting. |
| R9 | **ACL catalog.** Resource/action catalog generated from definitions; administrators manage user/API access. Generation never grants rights. Server checks every channel; API exposure/token scope only narrow existing access. |
| R10 | **Event logging.** Explicit coverage catalog (section 4), separating audit/security/operational events. Comprehensive logging never means storing credentials or unrestricted sensitive payloads. |
| R11 | **Kitchen sink.** Navigable synthetic demo with reproducible examples for every implemented public component/capability through the same supported consumer interfaces. |
| R12 | **Demand-driven work.** Need → framework gap → smallest reusable extension → synthetic demo/relevant tests → usage docs → consumer integration → consumer-controlled release. An exhaustive catalog is not a prerequisite for useful delivery. |

<a id="2-megvalósított-képességek-bizonyítékkal-és-hiányok"></a>

## 2. Implemented capabilities, evidence and gaps

This inventory includes historical results; consult [development coverage
limits](development.md#existing-full-smoke-and-coverage-limits) for current
browser coverage.

| # | Evidence-backed state | Evidence | Remaining gap |
| --- | --- | --- | --- |
| R1 | PHP 8.4+ runtime; bootstrap `protocol: 1`, mismatch rejection; structured JSON action API `POST ./?blade=1` | `Shell/Application.php`, `AdminShell.ts`, [ACL/actions](access-and-actions.md) | No published wire schema, per-endpoint version, compatibility rules or language-neutral conformance fixture; shell is PHP-rendered. |
| R2 | Mandatory project rules and ADR-0002; `guard`, `normalize`, `after_save`, registered actions run through common executor | [Project contract](../AGENTS.md), [ADR](decisions/0002-framework-first.md), [business boundary](usage.md#üzleti-konfiguráció-és-kód-határa) | Continuous review needed; no automated architecture enforcement. |
| R3 | Window/Form login, Menu/Layout/Toolbar, Workspace grid/form/DataView, configurable layout/resizers; two-panel file manager with the Standard Tree adapter, upload and text-editor windows; event calendar over Scheduler Standard with recurrence | [Shell](shell.md), [workspaces](workspaces.md), [files](files.md), [calendar](calendar.md), `tests/shell/*.spec.cjs` | Full keyboard/focus ergonomics and chart/Gantt adapters remain unproven; the Tree adapter has no lazy loading or drag moves. |
| R4 | hu/en/de catalogs, optional selector, matching client/server validation/mail language, Skyblue/light/dark via setTheme | [i18n](i18n.md), [themes](shell.md), `i18n.php`, `i18n.spec.cjs`, `browser.spec.cjs` | Participation is a completion rule, without automatic coverage enforcement. |
| R5 | ACL, scoped tokens, transactional audit; A1 users with temporary password/forced change and grid/form disabled checkbox; A2 roles/rules with protection; A3 API keys with once-only secret/revocation checkbox; `Administration::register` | `packages/php/src/Admin/*`, `admin.php`, `permissions.php`, `api-keys.php`, `admin.spec.cjs`, `demo.spec.cjs`, [admin](admin.md) | Log admin A4 absent. |
| R6 | SQL identity/displayName, password verification/change, per-user e-mail code, remembered login; e-mail identifier/full name/temporary password/forced change; AuthHandler OAuth overlay and per-user authorization without password; SMTP/command delivery; account language | [Authentication](authentication.md), `authentication.php`, `oauth.php`, `mail.php`, `authentication.spec.cjs`, managed `demo.spec.cjs` | Real Google/Facebook completion unverified; latest Google start reaches callback mismatch (FB-0050). AuthHandler does not expose email_verified. Password reset A5 absent. |
| R7 | SQLite demo/fixtures with immediate write transactions in the executor; MySQL connection/configuration, FOR UPDATE and InnoDB branches; file contents in a content-addressed disk store with verified BLOB migration | `Infrastructure/Database.php`, `Infrastructure/Transaction.php`, `Access/Schema.php`, `Files/FileStorage.php`, `examples/demo-app/common.php` | No PostgreSQL dialect (non-MySQL DDL is SQLite), JSON adapter or storage interface. Workspace/ACL/audit require PDO. |
| R8 | Modular `JsonApplication::load`, env references, named bindings, unknown-key rejection, no eval | [Configuration](configuration.md), `configuration.php` | No JSON Schema/config schema version/migration path; storage.where is trusted developer SQL. |
| R9 | Default deny, object/field/channel rules, narrowing token scopes, unknown-right denial; generated Catalogue, validated rule admin, orphan marking, explicit first admin | [ACL](access-and-actions.md), [permissions](admin.md#szerepkörök-és-jogosultságok-a2), `access.php`, `permissions.php` | A3 manages token scopes; catalog JSON API absent. |
| R10 | blade_audit actor/channel/resource/action/target/outcome/field names/request ID, optional ID-only detail, without sensitive values | `Audit/Journal.php`, `Feature/Executor.php`, `Shell/Application.php` | No category separation, retention or searchable log view; some coverage unproven (section 4). |
| R11 | Feature demo at / with login/languages/admin/API/tasks/large list/file manager; starter at /admin/; all browser specs on the managed demos | [Demos](demos.md), `examples/demo-app`, `demo.spec.cjs` | Singleton, WebSocket live connection and custom layout tree still lack full feature-demo coverage. |
| R12 | Framework-first, synthetic verification, then consumer integration since ADR-0002 | [ADR](decisions/0002-framework-first.md), [plan](development-plan.md) | Future package/consumer versioning, upgrades and schema compatibility need their own release process; no project deployment gate. |

<a id="3-tárolási-határ-és-szükséges-garanciák"></a>

## 3. Storage boundary and required guarantees

Proposed, not implemented: framework identity/ACL/token/audit/query/write
services depend on explicit storage interfaces; PDO/SQL is an implementation,
not a public contract. Support requires tests for every guarantee in the claimed
area. If a guarantee cannot be met, that capability is explicitly unsupported
for that store and fails at startup, without silent weakening.

| Area | Guarantee |
| --- | --- |
| Identity | Unique normalized login/e-mail; atomic immediately effective account state; hashed passwords only. |
| ACL | Atomic rule changes, consistent reads within a request, default deny when data is missing. |
| Token | Hash-only storage, unique identifier, expiry and immediate revocation. |
| Audit | Append-based; successful-write audit in the same transaction; audit failure prevents success. |
| Query | Object scope within query; server filtering/sorting/paging; stable cursor order. |
| Write | Atomic data/audit, optimistic revision 409, row locks or equivalent concurrency protection, crash consistency. |

| Store | Current state |
| --- | --- |
| SQLite | Demo/tests use it; guarantee-by-guarantee proof is not separately documented. |
| MySQL | Connection, InnoDB schema and FOR UPDATE branches; no full guarantee-matrix test. |
| PostgreSQL | Unsupported. |
| JSON file | Unsupported; transactions, locking and crash recovery remain open. |

<a id="4-eseménynapló-lefedési-katalógus"></a>

## 4. Event logging coverage catalog

Accepted categories: audit (meaningful business reads/changes), security
(authentication/authorization/tokens/sessions/abuse signals), operational
(errors/jobs/integrations/performance). Never log passwords, tokens, session IDs,
e-mail codes, SMTP/DB credentials, raw bodies or secret field values.

| Event | Category | State |
| --- | --- | --- |
| Registered action success/deny/error, UI/API | Audit | Implemented, Executor. |
| Record/form describe and live subscription | Audit | Implemented, Workspace. |
| Password login success/deny, logout | Security | Implemented, Shell/Application. |
| CSRF/transport rejection | Security | Implemented. |
| E-mail code send/check, remembered-login restore | Security | Implemented, Authentication. |
| API-key issue/revoke (admin all-scope or user own-scope) | Security | Registered `blade_api_keys.create/update`, `__edit`, without secret. |
| OAuth start/callback/login result | Security | `authentication.oauth_start`, `oauth_callback`, `oauth_login`. |
| Calendar events/occurrences reads and create/update/delete | Audit | Implemented through the executor (space as object, event ID on writes); no captions or field values in the journal ([calendar](calendar.md)). |
| File manager tree/list/create/upload/copy/move/text read and save | Audit | Implemented through the executor with ID-only detail (sources, target, results); no names or contents ([files](files.md)). |
| File content stream and thumbnail GET reads (each request, incl. range/304) | Audit | Implemented through the executor (`content_stream`, `thumbnail_get`), detail `size` only; cross-site GETs are rejected and audited as transport rejections. |
| File delete/rename/download/ZIP prepare and get | Audit | Implemented through the executor: delete `{target, sources, succeeded, failed, entries, policy}`, rename `{parent}`, download `{size}`, zip_prepare `{target, sources, files, bytes}`, zip_get `{sources, files, bytes}` (ids and sizes only). |
| Upload transfer begin and finish (`__upload`) | Audit | Implemented: `upload_begin` is audited as the target action with detail `size` only; `upload_finish` is the target action's normal executor audit; chunk, status, preflight and abort write no row on success, transport rejections are audited. No names or owners. |
| Background task claim/retry/failure (`blade_tasks`) | Operational | Minimal: state, attempts and a short non-sensitive error stored in `blade_tasks`; handler exceptions go to the PHP error log. No log view or alerting (M6). |
| ACL rules/roles changed | Security + audit | Audited through registered actions; A2 admin is implemented. |
| List reads/export | Audit | Planned; volume/detail undecided. |
| Configuration/schema changes, installation | Operational | Planned. |
| Jobs/retries/integration errors/slow queries | Operational | Planned, M6. |

<a id="5-nyitott-tervezési-kérdések-és-javasolt-munka"></a>

## 5. Open design questions and proposed work

<a id="eldöntve-az-első-adminszelethez--2026-10-21"></a>

### Decisions for the first admin slice — 2026-10-21

Accepted in [FB-0038](feedback.md#fb-0038--fiókéletciklus-döntések-az-első-adminszelethez).
Implementation status is tracked in [admin](admin.md); this decision list alone
does not prove completion.

- Admin creates accounts with temporary passwords and forced first-login change; no invitation link in the first slice.
- Removal means disabling with immediate session/remember/token revocation and intact audit references. Hard deletion/anonymization needs a later decision.
- Required full name uses existing displayName, without a separate name field.
- Password reset uses one-time expiring e-mail link from login, uniform response regardless of existence, rate limits and audit.
- Every application uses normalized unique e-mail as login identifier.
- API keys are a root-level capability. Administrators retain account-wide
  management; users may issue/list/update/revoke their own keys when ACL grants
  `blade_api_keys` UI operations with `own` scope.
- Non-insertable stores disable create but permit existing-account management.

<a id="még-nyitott"></a>

### Remaining questions

The original questions below are proposals, not blanket implementation claims.
Later [admin-plan decisions](admin-module-plan.md) settle first-slice defaults,
self/last-admin protection and initial catalog orphan handling; those no longer
remain unanswered.

- Further account lifecycle and identity-store adaptation without forced duplication; reset implementation remains open.
- Authentication policy beyond current OAuth path: provider linking/unlinking, e-mail matching conditions, lost access and passwordless accounts. E-mail codes are not phishing-resistant and do not establish MFA compliance.
- JSON-file guarantees/areas: single process, file locking, atomic replacement, or explicitly unsupported features.
- JSON schema format, versioning/deprecation, conformance fixtures and separation of PHP-rendered shell.
- Validated declarative conditions expressible without handlers; a workflow engine is not implied.
- Catalog API format and broader definition-removal lifecycle.
- List-read logging detail, retention, log-view permissions and external sinks.
- Completing the navigable kitchen sink; two demo applications now exist, while remaining coverage is listed above.

Initial proposed slice: [built-in admin in the SQLite demo](admin-module-plan.md),
using existing ACL/token/audit/forms/grids while documenting storage/contract
boundaries to avoid additional PHP/MySQL coupling in the frontend protocol.
This does not require a second backend or all four stores at once.

<a id="6-igényvezérelt-végrehajtási-módszer"></a>

## 6. Demand-driven execution method

1. Concrete need: task, actors, read/write channels, acceptance cases.
2. Framework gap: existing behavior, actual missing capability, kernel/module/consumer responsibilities.
3. Smallest reusable extension: JSON, protocol, i18n, theme, ACL/API, storage guarantees, event/error handling.
4. Synthetic demo/relevant tests through public interfaces; denial/validation/concurrency checks where applicable.
5. Update [usage](usage.md) and topic documentation in the same batch.
6. Consumer configuration and integration verification in that consumer.
7. Any consumer release follows its own version/compatibility/migration/recovery contract; 61de itself is developed/tested directly without deployment or backups.

<a id="angol-indítóprompt-claude-számára"></a>

## Implementation starter prompt

```text
Relevant shared rules: Establish the working context; Project and platform
boundaries; Project URLs; Project UX; Minimal implementation; Installed
tooling; Segmented tests and deployment gate; Implementation, validation
and completion.

Work on a bounded 61de increment. Read AGENTS.md, docs/usage.md,
docs/feedback.md, docs/product-direction.md, the affected topic guide and
actual source. First check the requested goal and proposed route against
current evidence; explain a simpler supported alternative if warranted.
Ask about material uncertainty before dependent work, while continuing
independent work.

This project has only https://61ade.sanch.hu/ for development/testing,
directly from /space/share/libs/61ade on catalyst. There is no production,
deployment, post-deployment testing or project backup process. Preserve
existing changes and the read-only shared library and _AuthHandler.

Follow R1–R12 and ADR-0003. Distinguish accepted requirements, verified
implementation and open proposals. Build general capabilities with 61de
definitions, DHTMLX adapters and the shared authorization, validation,
transaction and audit services. Consumers supply configuration and domain
adapters, never replacement admin infrastructure. No external framework
benchmark or exhaustive component target applies.

PHP is the reference backend. A language-independent protocol requires
documented versioned schemas and conformance fixtures, not JSON transport
alone. Keep SQL and callbacks server-side. Do not add another backend or
storage adapter speculatively. A supported store must meet its documented
guarantees or explicitly reject the capability.

Every new capability needs localization, theming, a reproducible synthetic
feature-demo example, usage guidance and event-catalog updates. JSON uses
explicit named handlers, never eval or executable strings. Catalogs never
grant rights; server authorization applies on every channel and token
scopes only narrow access. Keep credentials/sensitive values out of logs.

For grid, data-tree, and responsive card/DataView work, load the project's
[`grid-tree-card-ui` skill](../.agents/skills/grid-tree-card-ui/SKILL.md) rather
than copying presentation rules into a task prompt or markup.

A1 users, A2 permissions and A3 API keys already exist. Read docs/admin.md
before proposing the next slice; do not repeat the old first-slice plan.
A4 log views and A5 password recovery remain open. Identify the smallest
requested increment, unresolved decisions, affected test groups and
acceptance criteria before implementation.

Verify only affected groups using the guarded browser wrapper and managed
URL. Do not start local servers on this host or install tools. Full smoke is not an onboarding/deployment
gate here. Clean temporary task verification/output, preserve retained
evidence and configured Git identity, and follow the local commit/push
contract. Report actual changes, checks, visible URL and remaining limits.
```

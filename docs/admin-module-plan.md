# Built-in admin module: first-slice plan

Status: approved plan, 2026-10-21. A1/A2/A3 are implemented and verified
([usage](admin.md), [API keys](admin.md#api-kulcsok-a3), FB-0044); A4/A5 are not.
Login identifier, key administration and non-insertable account stores are
decided by FB-0038. Requirements: [R5/R6/R9/R10](product-direction.md#1-elfogadott-termékkövetelmények);
[decisions](feedback.md#fb-0038--fiókéletciklus-döntések-az-első-adminszelethez).
Section 4 defaults were approved on 2026-10-21; the earlier introductory
“proposal” wording was superseded by that approval.

<a id="1-cél-és-hatókör"></a>

## 1. Purpose and scope

User, role/ACL, API-key and log administration in the SQLite demo, built with
framework tools and available to any configured consumer.

Included in the plan: account list/create/edit/disable/re-enable/replacement
temporary password, forced first-login change, e-mail recovery, catalog-driven
roles/memberships/rules, key issue/revoke, read-only logs, self/last-admin
protection, hu/en/de and all themes.

Excluded: invitation links, hard deletion/anonymization, OAuth within this
first-slice plan (later implemented separately), PostgreSQL/JSON stores,
log retention/external sinks, multi-organization isolation and self-service keys.

<a id="2-kiindulási-állapot-forrás-alapján"></a>

## 2. Starting state (historical source inventory)

| Area | Observation at planning time | Source |
| --- | --- | --- |
| Identity | IdentityProvider read-only authenticate/find; no writable account contract. Consumer allowed decided enablement. | Shell/IdentityProvider.php, SqlIdentityProvider.php |
| Password | Passwords::change handled self/admin change, 12–128 characters, confirmation and revocation; no forced-change state. | Access/Passwords.php |
| Revocation | Workspace::revokeSessions increments auth version and revokes tokens. | Feature/Workspace.php |
| Token | Direct SQL issue/revoke, without audit/UI; Executor scopes only narrow. | Access/Tokens.php, Feature/Executor.php |
| ACL | blade_roles/memberships/rules, default deny, deny wins; Registry::all lists actions but no catalog query. | Access/Acl.php, Schema.php, Feature/Registry.php |
| Log | blade_audit without category; login/logout/CSRF/code/actions already recorded. | Audit/Journal.php, Shell/Application.php |
| Login | pendingLogin pre-auth state machine existed for codes, extensible for forced change. | Shell/Application.php |
| Mail | Delivery/LoginMessage localized templates; reusable for reset. | Mail/*, [authentication](authentication.md) |
| Demo | Originally in-memory accounts; since 2026-10-21 two file-backed SQLite demos. | application.php, admin-application.php, [demos](demos.md) |
| Precedent | Consumer-style user administration in members.json with ACL-protected security action. | tests/fixtures/authentication/members.json |

<a id="3-keretbővítések"></a>

## 3. Framework extensions

All writes use Executor: ACL → validation → transaction → audit.
Admin resources are ordinary catalog entries; no bypass.

<a id="e1--írható-fióktár-szerződés"></a>

### E1 — Writable account-store contract

Proposed AccountStore extends identity mapping with optional create_defaults for
other required consumer columns. Every application uses e-mail as login
(decided): username_column points to unique normalized lowercase e-mail without
spaces. E-mail change revokes sessions, remembered credentials and tokens.
Consumers with separate usernames own their migration.

SQL implementation derives from SqlIdentityProvider mapping. Framework state
lives separately in blade_account_state (actor_id, disabled, must_change_password,
temporary_expires_at), without altering consumer schema. Login requires both
consumer allowed and framework state. Non-insertable stores explicitly disable
create but retain existing-account management (decided), with visible UI behavior.

<a id="e2--adminmodul-61de-definíciókból"></a>

### E2 — Admin from 61de definitions

Framework-owned role/membership/rule/token/log resources use package module JSON,
WorkspaceConfiguration and named framework bindings. Accounts derive from
consumer identity mapping, with registered bindings rather than table/code in JSON.
Application admin section enables group Administration.

| View | Operations |
| --- | --- |
| Users | List/create full name via displayName and e-mail login; edit; disable/re-enable; temporary password; existing Settings confirmation switch. |
| Roles | List/create/rename display name with stable role_key; add/remove members. |
| Permissions | List/create/edit/delete; resource/action/field choices from catalog; mark orphans. |
| API keys | List label/owner/scope/expiry/state, never hash/secret; issue/revoke. |
| Log | Read-only filtering by time, actor, resource, action, result, category. |

<a id="e3--kötelező-jelszócsere"></a>

### E3 — Forced password change

After password and optional e-mail verification, must_change_password enters
pendingPasswordChange with no menu/workspace/API/WebSocket ticket.
DHTMLX uses Passwords rules. Success clears flag, revokes old sessions/tokens
and establishes full session. Expired temporary passwords and API tokens for
accounts awaiting change are rejected.

<a id="e4--e-mailes-jelszó-helyreállítás"></a>

### E4 — E-mail password recovery

Forgot-password from login returns uniform feedback for any address.
Existing enabled accounts receive one-use expiring links, stored as selector,
verifier hash, actor, auth version, expiry/use in blade_password_resets.
Success changes password, clears flag, revokes all sessions/remember/tokens and
audits. Without delivery configuration, recovery is hidden/disabled.
Mail is localized using LoginMessage override conventions.

<a id="e5--acl-katalógus"></a>

### E5 — ACL catalog

Read-only Registry projection: resource/action/label/channels/write/fields.
It drives rule choices/API scopes, never rights. Removed definitions leave
marked orphans for manual deletion. First admin comes from explicit audited
setup creating role/rules, never automatic grants.

<a id="e6--api-kulcsok-auditált-kezelése"></a>

### E6 — Audited API-key administration

Only ACL-authorized admins manage keys for active users and list all without
secrets (decided). Ordinary users have no key UI; self-service is a later separate
permission. Issue/revoke are audited registered actions. Scopes come only from
catalog api actions. Original plan used 1–90 days; implemented A3 permits an
expiry date within 365 days as documented in [current usage](admin.md#api-kulcsok-a3).
Secret appears once. Disable/password change revoke all tokens.

<a id="e7--naplónézet-és-kategória"></a>

### E7 — Log view and categories

Read-only server-filtered/sorted blade_audit, no edit/delete. First-slice category
is derived at read time: session/authentication/transport/admin resources are
security; others audit. Operational events are not yet in the table.
A separate category-column migration is a later decision.

<a id="e8--védelmek"></a>

### E8 — Protections

- Self-disable and removal of own protected membership are forbidden.
- Configured admin.protected_role always retains an active member; disable/member removal/rule deletion check transactionally with MySQL row locks.
- Protected-role rules require ACL administration rights; business guards cannot be bypassed by ACL.

<a id="e9--lokalizáció-és-téma"></a>

### E9 — Localization and themes

Framework catalogs contain all labels/errors/mail in hu/en/de.
Native DHTMLX controls support checking Skyblue/light/dark.

<a id="4-alapértékek-jóváhagyva-2026-10-21"></a>

## 4. Defaults (approved 2026-10-21)

| Topic | Approved value |
| --- | --- |
| Temporary password | Framework-generated 20 characters, once-only display, no manual entry. |
| Temporary validity | 72 hours; issue replacement after expiry. |
| Reset link | 30 minutes, single-use; a new request invalidates predecessor. |
| Reset rate | 3 per 15 minutes/account and 10 per 15 minutes/IP, still uniform response. |
| After reset | Normal login, including configured e-mail verification; no automatic sign-in. |
| Protected role | Configurable role_key admin. |
| Log category | Derived on read (E7), no schema migration. |

<a id="5-tárolás"></a>

## 5. Storage

Initial slice verified on SQLite. Existing MySQL FOR UPDATE/InnoDB branches
remain without MySQL qualification. New blade_account_state and planned
blade_password_resets belong to explicit Schema::install, never HTTP DDL.
No PostgreSQL/JSON support is promised; see [guarantees](product-direction.md#3-tárolási-határ-és-szükséges-garanciák).
Setup creates demo accounts in file-backed workspace databases.

<a id="6-új-naplóesemények"></a>

## 6. New log events

| Event | Category | Path |
| --- | --- | --- |
| Account create/edit/disable/re-enable/temporary password | Security | Executor |
| Role/membership/rule changes | Security | Executor |
| Key issue/revoke | Security | Executor |
| Forced password change success/rejection | Security | Pre-auth Journal |
| Reset request regardless of existence, completion/rejection | Security | Planned pre-auth Journal |
| Log-view opening | Audit | Existing subscribe |

Never log passwords, temporary secrets, reset links, tokens or e-mail values;
only field names/outcome.

<a id="7-elfogadási-feltételek-és-tesztek"></a>

## 7. Acceptance criteria and tests

- PHP admin contract: default deny; authorized account operations; immediate revocation; temporary expiry; no workspace/API before forced change; recovery uniformity/single-use/expiry/rate/disabled-account denial; self/last-admin protection; powerless orphans/catalog; narrowing scopes; audit without sensitive values; rollback.
- Protected browser checks: demo Administration, create → first login → forced change; planned synthetic reset delivery; languages/themes. Browser checks run only on the managed URL.
- UI/API parity for the same actions, including denials.
- Kitchen sink via the same public consumer configuration with synthetic demo/viewer/blocked accounts.
- Usage/config/first-admin/limits/checks in admin.md, linked from usage, feedback and authentication. Acceptance targets for unimplemented A4/A5 are not passed tests.

<a id="8-részszeletek"></a>

## 8. Subslices

Each slice is independently verifiable/documentable; order expresses dependencies.

1. A1 accounts/users: E1, disable, temporary/forced change and file-backed demo. Complete. Difference: Accounts service plus SqlResource read-only fields instead of a separate AccountStore interface; e-mail switch was outside A1.
2. A2 roles/permissions: E5/E8, views, first admin. Complete. Role/individual rules have separate views; admin deny rules cannot be authored in UI; first admin receives UI rights only.
3. A3 API keys: E6, complete; see current admin usage.
4. A4 log view: E7, planned.
5. A5 recovery: E4, planned.

<a id="9-felhasználói-döntést-igénylő-kérdések"></a>

## 9. Owner decisions still required

None for the approved first-slice design. FB-0038 settled defaults, e-mail
identifier, admin-only key management and non-insertable-store behavior.
This does not imply A4/A5 implementation is complete.

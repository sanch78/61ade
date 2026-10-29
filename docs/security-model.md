# Authorization and organization model

Status: target architecture. The [ACL/action guide](access-and-actions.md)
describes the implemented subset and its limits. Organizations are implemented as
optional [tenants](tenancy.md) (stage 1, 2026-10-29). It covers membership
verified on every request and never taken from a client parameter; switching
that clears the UI and data context; fail-closed tenant-scoped SQL resources and
lookups; tenant-bound API keys; and the tenant in audit. Global roles apply in
every member tenant. Per-tenant roles, cross-tenant reads, tenant-scoped files
and exports are still planned. Mandatory principles: default deny
and centralized server-side execution.

<a id="kontextus-és-döntés"></a>

## Context and decision

Requests carry actor (human or machine), organization, channel, action and
target-object context. Never accept an organization from a client parameter
without verifying membership and switching rights against the authenticated identity.

Effective permission is the intersection of these conditions:

- The feature and requested channel are enabled.
- The actor has valid organization access.
- The role permits the action.
- The object policy permits the target.
- The field policy permits the fields read or written.
- The API token scope permits the action, when a token is used.
- The business state permits the transition.

Roles grant capabilities; policies narrow them. Explicit deny wins. System-wide
or cross-organization access is a distinct audited capability, with no hidden
flag that bypasses every scope.

<a id="olvasás"></a>

## Reads

The QueryProvider receives organization and object-access constraints before
query execution. A missing scope adapter fails closed.

Lists, individual objects, counts, charts, autocomplete, related objects,
exports and tree child loading follow the same rules. A consistent external
API 404 hides inaccessible objects; internal audit records the reason.

Do not permit sorting, filtering or aggregation over forbidden fields if it
could disclose information. The client receives permitted fields only.

Binary reads used as element sources (`<img>`, `<video>`) are GET-capable
actions (`Action::$get`), not public paths: the same executor authenticates,
checks channel, token scope and the object ACL, and audits every request,
including range and conditional ones. They take no input fields and never
write. Because an element cannot send the CSRF header, the UI channel rejects
cross-site and same-site fetch metadata instead; responses are
`Cross-Origin-Resource-Policy: same-origin`, `nosniff`, sandboxed by CSP, and
carry an allowlisted type and a `private` cache policy. Downloads of any
stored type are always `attachment`. Multi-file ZIP downloads use a two-step
flow: an authorized POST writes a short-lived, single-use manifest bound to
actor, channel and the session/token owner, and the GET re-checks the rights
of every source before streaming. See
[files](files.md#actions-and-authorization).

<a id="írás"></a>

## Writes

Accept input fields through an allowlist. Read-only or unknown fields produce
an error rather than unrestricted model binding. Tenant ID, owner and status
change only through their declared actions.

Load targets through an authorized query scope. Check access to related objects
separately. Forms, inline edits, imports, API calls and bulk operations share
the same handler.

Check every bulk target. The default for one transactional action is to reject
the entire request. Partial execution requires an explicit feature contract and
per-object results.

<a id="hitelesítés-és-állapot"></a>

## Authentication and state

The browser baseline is a server-side session, secure cookie and CSRF protection.
Session cookies do not carry indefinitely trusted policy decisions. Login rate
limits, logout and session revocation are required.

Machine clients need revocable scoped credentials; the protocol is an M2 decision.
Invalidate policy caches after permission changes. Organization switching clears
the preceding data and UI context.

<a id="kötelező-tesztmátrix"></a>

## Required test matrix

- Permitted reads and denied writes in the actor's organization.
- Access to another organization's object through ID, relation or filter.
- Role allow with object deny; readable but unwritable field.
- API disabled while the admin action remains enabled.
- API enabled with insufficient actor/token scope.
- Export/count/chart/lookup information disclosure.
- Bulk requests containing both permitted and denied targets.
- Permission revocation after background-job submission.
- Cache and organization isolation across successive requests.
- CSRF, mass assignment, forbidden filters/sorts and stored XSS.
- Concurrent saves and optimistic-lock conflicts.

The frontend capability list is a UX aid; the backend decides afresh on every request.

Automated today ([tenancy](tenancy.md#verification)): permitted reads and denied
writes inside the tenant; another tenant's object through ID, relation, filter,
lookup, live watch and API token; bulk requests mixing own and foreign targets;
isolation across successive requests and after switching; membership revocation
and deactivation; counts limited to the tenant. File and export rows wait for
the tenant-scoped file stage.

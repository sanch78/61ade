# ADR-0005 — 61ade is a toolkit, not a closed program

Date: 2026-10-29. Accepted owner decision ([FB-0081](../feedback.md#fb-0081)).
Execution plan: [toolkit plan](../toolkit-plan.md).

## Context

61ade grew as a closed program configured by PHP/JSON declarations. The
frontend entry `packages/frontend/src/admin.ts` exports nothing; the shell
template loads only `admin.js`; `AdminShell.openView` hard-codes the four view
kinds; the PHP `Workspace::views` does the same; view identity is the resource
name. A consumer project therefore cannot instantiate, compose, extend or
override any 61ade component, and cannot place its own browser code anywhere
in the shell. [ADR-0004](0004-project-domain-freedom.md) gave projects the
right to own their domain UI, but there was nowhere to put it, so every
project need still became a framework request.

Comparable frameworks (Ext JS being the owner's reference for this property,
not for component parity) are toolkits: the application writes its own code
with the framework's classes, services and registries, and the framework's
own screens are built from the same building blocks.

## Decision

## Consequences

- Supersedes "consumers have no shell HTML/CSS/JS layer" ([shell](../shell.md)),
  "custom behavior is … not browser code" and the remaining narrow-exception
  wording of [ADR-0002](0002-framework-first.md). ADR-0004's planned "custom
  view in two modes" is absorbed into the toolkit plan.
- Inside 61ade, general capabilities are still built in the framework with
  DHTMLX; framework-first now means "build the reusable tool", not "forbid
  the project's code".
- The public API becomes a contract with its own reference documentation,
  type declarations and breaking-change notes: the
  [toolkit reference](../toolkit.md), `packages/frontend/src/api/types.ts`
  and `Blade\Feature\View`/`ViewKindProvider` (implemented in P2/P3).
- Resolved plan decisions ([details](../toolkit.md#resolved-decisions)):
  modules get the `Application` by injection, no import map (O1); plain ES
  modules or project-built TypeScript with `admin.d.ts` (O2); a view `id`
  independent of the resource, canonical `#view=`, with `#feature=` kept as a
  rewritten legacy alias because delivered consumer e-mails use it (O3);
  record views resolved through the record resource's `get` (O4); per-row
  activation maps with `view:<id>` targets (O5); a static sandbox document in
  an opaque-origin frame (O6), the only place untrusted code may run (O7);
  project `stylesheets` (O8); project texts through the existing merged
  catalog, no new transport (O9); `app.dhx` is the shell's Suite instance
  (O10); `apiVersion` 1 with a recorded change log after G1 (O11).
- A later view declaration with the same id replaces the earlier one, as
  today; the owner confirms this and the other
  [open points](../toolkit.md#open-points) at gate G1.

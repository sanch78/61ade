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

1. 61ade is a toolkit. It provides public, documented, typed building blocks:
   services (server calls, URLs, dialogs, toasts, windows, uploads, events,
   i18n, theme, preferences, live data), components (list/record views,
   forms, file manager, calendar, diagram editor, media player, sandbox frame,
   layout helpers) and the DHTMLX instance it uses.
2. A project ships its own frontend modules. The application definition lists
   them; the shell loads them and hands them the application API. Modules
   register view kinds, column presentations, field types and client commands,
   compose framework components with their own code, and may extend framework
   classes.
3. The framework dogfoods the API: its built-in view kinds (list, files,
   diagram, calendar) register through the same registries a project uses.
4. Views get their own identity (a view id independent of the resource), so
   several views, including record views opened for one record, can exist per
   resource.
5. What stays mandatory: the shared infrastructure of ADR-0004 (login,
   identities, ACL, admin, executor, audit, upload flow, live channel) is used,
   never rebuilt; every server read/write is authorized on the server; code a
   project does not trust (for example agent-written) runs only in a sandboxed
   frame without same-origin access.
6. A purely declarative application (no modules) remains fully supported; the
   starter admin and tenant demo stay declarative and prove it. The full
   feature demo becomes a toolkit consumer with its own frontend modules.
7. Breaking changes are accepted for this transition: consumer projects adapt
   themselves (owner decision; only StoryBloX and allflow consume 61ade).

## Consequences

- Supersedes "consumers have no shell HTML/CSS/JS layer" ([shell](../shell.md)),
  "custom behavior is … not browser code" and the remaining narrow-exception
  wording of [ADR-0002](0002-framework-first.md). ADR-0004's planned "custom
  view in two modes" is absorbed into the toolkit plan.
- Inside 61ade, general capabilities are still built in the framework with
  DHTMLX; framework-first now means "build the reusable tool", not "forbid
  the project's code".
- The public API becomes a contract with its own reference documentation,
  type declarations and breaking-change notes.

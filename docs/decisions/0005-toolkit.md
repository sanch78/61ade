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
  type declarations and breaking-change notes.

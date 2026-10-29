# ADR-0004 — Framework-first covers shared infrastructure; the project domain is free

Date: 2026-10-29. Accepted owner decision ([FB-0080](../feedback.md#fb-0080)).

> Extended the same day by [ADR-0005](0005-toolkit.md): 61ade becomes a toolkit;
> the planned custom view below is absorbed into the [toolkit plan](../toolkit-plan.md).
Supersedes the narrow "logically unextendable" exception of
[ADR-0002](0002-framework-first.md) and R2 in
[product direction](../product-direction.md) for consumer projects. Inside
61ade itself, framework-first and DHTMLX remain unchanged.

## Context

ADR-0002 allowed a consumer to leave the framework only if 61ade "logically
cannot be extended" for the need. Almost anything can be extended, so the
exception never applied, and the framework had no point where a project could
attach its own browser code. Projects therefore treated every need, including
purely domain-specific ones, as a 61ade request and waited for it. Example: a
project with its own sound assets and a WebGL scene player concluded that it
must first get a version/file model from the 61ade file manager, an audio
viewer from 61ade, and that its scene player was forbidden browser code.

The intent of ADR-0002 was narrower: projects must not rebuild admin
infrastructure in parallel. It was never meant to place the project's own
domain inside the framework.

## Decision

**Shared infrastructure (61ade owns it).** Application startup,
authentication and session, users, ACL, API keys and log admin, menu, shell,
layout and windows, generic forms, grids, trees and cards, dialogs, the upload
flow, the file manager, the action executor, audit, the live channel,
localization and themes. A project uses these and never builds a parallel
version of one that exists (own login, own user admin, own upload dialog, own
ACL, own unaudited write endpoints).

**Project domain (the project owns it, freely).** Domain data and its
storage, including the project's own files and assets; business logic;
domain-specific UI such as players, editors, canvas, SVG or WebGL
visualisations; its own browser code and libraries. No justification
against 61ade is needed for these.

**The test** is not "can 61ade be extended?" but "would another project need
this in the same form?"

- No → project domain; the project builds it.
- Yes, and 61ade has it → use it.
- Yes, and 61ade lacks it → the project sends a request to 61ade and does not
  wait: it may build an interim local version, marked in its own
  documentation with the request reference, and migrates when 61ade delivers.

**Boundaries that stay.** Every server read and write channel enforces
authorization (61ade actions do this; the project's own channels must do it
too). Code written by an agent or otherwise untrusted must not run in the
admin session's origin: it runs in a sandboxed `<iframe>` with
`sandbox="allow-scripts"` and no same-origin access. Secrets and backend-only
data never reach the browser.

## Consequences

- Planned 61ade work: a project UI extension point (custom view) in two modes,
  a trusted ES module from the project's own assets mounted into a shell
  cell or window, and a sandboxed iframe for untrusted code; then a synthetic
  example in the feature demo. Until it exists, a project may serve its own
  pages from its own webroot.
- A general gap a project reports (for example audio in the file manager's
  viewer) follows the normal demand-driven path in 61ade, without blocking the
  project.
- Active guidance in [development](../development.md#mandatory-framework-development-rules),
  [usage](../usage.md#kötelező-fejlesztési-irány),
  [product direction](../product-direction.md), [concept](../concept.md),
  [repository layout](../repository-layout.md#fogyasztó-alkalmazás) and the
  `61ade-consumer` skill follows this decision.

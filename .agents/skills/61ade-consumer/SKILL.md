---
name: 61ade-consumer
description: Adopt or update the shared 61ade admin framework in a consumer project (links, deploy shared_assets and sandbox files, autoloader, project modules and stylesheets, TypeScript types, browser tests, test accounts, toolkit migration and update smoke check). Use from a consumer session that integrates 61ade, adds project browser code on its toolkit API, or checks a new 61ade commit; do not use for changes to 61ade itself.
---

# 61ade consumer checklist

Each step below links to the authoritative contract in the 61ade checkout,
`/space/share/libs/61ade/docs/development.md`, section
[Consumer layout](../../../docs/development.md#consumer-layout) and the
sections that follow it, and to the [toolkit reference](../../../docs/toolkit.md)
for project browser code. This checklist only gives the order and the
pitfalls; when it and the contract disagree, follow the contract. The 61ade
checkout is read-only for a consumer session. Report a framework gap to the
61ade owner instead of patching it.
To design and build features on the toolkit itself, use [61ade-application](../61ade-application/SKILL.md).

## What the project owns

Ownership, the "would another project need this in the same form?" test and
the order declarative → project modules → sandbox are in the
[61ade-application](../61ade-application/SKILL.md) skill. This checklist only
sets the project up and keeps it updated.

## Adopt

1. Read the [shared-library consumption](../../../docs/development.md#shared-library-consumption)
   rules. You use `packages/php` and `packages/frontend/dist` only, with no
   Composer, versions or tags.
2. Create the development links and commit them:
   `lib/61ade` → `packages/php`, and a **dedicated** assets subdirectory such as
   `public/assets/61ade` → `dist` ([layout](../../../docs/development.md#consumer-layout)).
3. Add the two `shared_assets` entries to `.deploy.json` with the same targets
   as the links. The assets entry uses `files: ["admin.js", "admin.css"]`; add
   `"sandbox.html"` only if you use `SandboxFrame`
   ([packaging](../../../docs/toolkit.md#packaging)). Never list `admin.d.ts`.
4. Register the `Blade\` autoloader in the earliest common bootstrap, before
   any entrypoint uses a `Blade\` class. If you run the live WebSocket bridge,
   point `BLADE_AUTOLOAD_FILE` at that bootstrap file.
   For WebSocket live data, declare `lib/61ade/bin/live-server.mjs` as a
   `run_as: web` service per hostname and request `/live` and the port from
   Infra ([live-data service](../../../docs/development.md#live-data-service-websocket)).
5. Set up browser tests with your own `tools/playwright.sh` (calling
   `/space/share/bin/guarded-playwright`) and `tools/playwright-test.cjs`
   ([consumer browser tests](../../../docs/development.md#consumer-browser-tests)).
6. Configure authentication and the Users admin from your own definitions
   ([test accounts](../../../docs/development.md#consumer-test-accounts),
   [admin](../../../docs/admin.md), [authentication](../../../docs/authentication.md)).
7. Record the integration in your project's own documentation, not in 61ade.

## Add project browser code (optional)

Follow the [61ade-application](../61ade-application/SKILL.md) skill. The
setup parts are here: deploy `sandbox.html` only for `SandboxFrame` (step 3
above); `admin.d.ts` comes through the development assets link and is never
deployed.

## Update or smoke-check a 61ade commit

Follow the [update smoke check](../../../docs/development.md#consumer-update-smoke-check):
read the commits and feedback entries since your last released library commit
(the last `shared_assets` record of `.deploy-history.jsonl` in your release
target), smoke-test your development URL, run your browser specs, then deploy.

For the toolkit transition (releases before it carry 61ade `131263a`), work
through the [migration guide](../../../docs/toolkit.md#migration) and its
[steps](../../../docs/toolkit.md#steps-for-a-consumer-session), starting from
your project's handoff note: [StoryBloX](../../../docs/handoff/storyblox.md),
[allflow](../../../docs/handoff/allflow.md).

## Pitfalls

- Linking your whole `public/assets` to `dist` writes your assets into the
  shared checkout and drops them from the release.
- Do not expect deploy to keep your links: it replaces them with copies. The
  "Refusing to replace" errors come from the `links` option, not
  `shared_assets`.
- `deploy-site` refuses while the 61ade checkout has uncommitted or unpushed
  changes in the copied paths. Wait for the 61ade owner; never copy files by
  hand ([release reproducibility](../../../docs/development.md#release-reproducibility)).
- A module must not import `admin.js` or `@dhtmlx/suite` at run time: that
  loads a second bundle. Everything comes from `app`.
- Project registration names, preference scopes and event names need a dot
  (`project.player`); a new name without one throws (only a deliberate
  `{replace: true}` of a built-in keeps its name). A module that fails or takes
  longer than 5 s is reported and skipped.
- `stylesheets` and `modules` are not loaded on the sign-in, e-mail
  confirmation and password-change pages.
- Specs must not pin asset keys: `admin.js`, `admin.css`, skins, modules,
  stylesheets and AuthHandler files carry `?v=<base36 mtime>-<base36 size>`,
  not `?v=30`, `?v=32` or `?v=<version>` (M9).
- There is no record context menu: record commands and `Adatok` sit in the
  list toolbar (or `Műveletek`); a right click, the context-menu key or
  Shift+F10 keeps the browser's own behaviour (M10). Address menu items as
  `view:<id>`, not `feature:<resource>` (M2).
- Do not rename a view id that delivered links use: `#feature=<resource>`
  resolves only to the view whose id equals that resource (M1).
- Specs cannot `require('@playwright/test')` directly. Do not pass
  `--workers`; do not call 61ade's `tools/run-dev-check.sh`.
- E-mail confirmation applies only with `authentication` configured. A
  temporary test account leaves `blade_*` rows and session files; remove them
  as listed in the contract.
- A breaking 61ade change arrives without warning on your development URL.
  The 61ade side coordinates it ([breaking changes](../../../docs/development.md#breaking-changes)).

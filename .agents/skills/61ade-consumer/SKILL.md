---
name: 61ade-consumer
description: Adopt or update the shared 61ade admin framework in a consumer project (links, deploy shared_assets, autoloader, browser tests, test accounts, update smoke check). Use from a consumer session that integrates 61ade or checks a new 61ade commit; do not use for changes to 61ade itself.
---

# 61ade consumer checklist

Each step below links to the authoritative contract in the 61ade checkout,
`/space/share/libs/61ade/docs/development.md`, section
[Consumer layout](../../../docs/development.md#consumer-layout) and the
sections that follow it. This checklist only gives the order and the pitfalls;
when it and the contract disagree, follow the contract. The 61ade checkout is
read-only for a consumer session. Report a framework gap to the 61ade owner
instead of patching it.

## Adopt

1. Read the [shared-library consumption](../../../docs/development.md#shared-library-consumption)
   rules. You use `packages/php` and `packages/frontend/dist/admin.{js,css}`
   only, with no Composer, versions or tags.
2. Create the development links and commit them:
   `lib/61ade` → `packages/php`, and a **dedicated** assets subdirectory such as
   `public/assets/61ade` → `dist` ([layout](../../../docs/development.md#consumer-layout)).
3. Add the two `shared_assets` entries to `.deploy.json` with the same targets
   as the links. The assets entry uses `files: ["admin.js", "admin.css"]`.
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

## Update or smoke-check a 61ade commit

Follow the [update smoke check](../../../docs/development.md#consumer-update-smoke-check):
read the commits and feedback entries since your last released library commit,
smoke-test your development URL, run your browser specs, then deploy.

## Pitfalls

- Linking your whole `public/assets` to `dist` writes your assets into the
  shared checkout and drops them from the release.
- Do not expect deploy to keep your links: it replaces them with copies. The
  "Refusing to replace" errors come from the `links` option, not
  `shared_assets`.
- `deploy-site` refuses while the 61ade checkout has uncommitted or unpushed
  changes in the copied paths. Wait for the 61ade owner; never copy files by
  hand ([release reproducibility](../../../docs/development.md#release-reproducibility)).
- Specs cannot `require('@playwright/test')` directly. Do not pass
  `--workers`; do not call 61ade's `tools/run-dev-check.sh`.
- E-mail confirmation applies only with `authentication` configured. A
  temporary test account leaves `blade_*` rows and session files; remove them
  as listed in the contract.
- A breaking 61ade change arrives without warning on your development URL.
  The 61ade side coordinates it ([breaking changes](../../../docs/development.md#breaking-changes)).

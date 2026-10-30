---
name: 61ade-application
description: Build a project's admin application on the 61ade toolkit. Covers what the project owns versus 61ade; declarations first (resources, views, record views, activation maps, i18n, sign-in content); then project modules on the public `app` API (registries, components, sandbox, TypeScript, stylesheets), their browser tests, updates and boundaries. Use from a consumer session that designs or extends features on 61ade. For links, deploy, autoloader, browser-test setup, test accounts and the update smoke check use 61ade-consumer; do not use for changes to 61ade itself.
---

# Building an application on 61ade

This skill gives the order, the decisions and the pitfalls. The contracts are
in the 61ade checkout's `docs/`: mainly the [toolkit reference](../../../docs/toolkit.md),
[usage](../../../docs/usage.md), [configuration](../../../docs/configuration.md)
and [shell](../../../docs/shell.md). When this skill and a contract disagree,
follow the contract. Open this file at its path inside the 61ade checkout,
because the relative links resolve there. The checkout is read-only for a
consumer session.

Set up the project first with [61ade-consumer](../61ade-consumer/SKILL.md):
links, `.deploy.json`, autoloader, guarded browser tests and test accounts.

## 1. Decide who owns the need

Ownership follows [ADR-0004](../../../docs/decisions/0004-project-domain-freedom.md),
[ADR-0005](../../../docs/decisions/0005-toolkit.md) and the
[toolkit ownership table](../../../docs/toolkit.md#purpose-scope-and-ownership).

- **61ade owns:** sign-in and session; users, ACL, API keys and log admin;
  menu, shell, layout and windows; generic forms, grids, trees and cards;
  dialogs; the upload flow; the file manager; the action executor; audit; the
  live channel; localization; themes. Use these. Never build a parallel login,
  user admin, upload dialog, ACL or unaudited write endpoint.
- **The project owns:** its domain data and storage (its own files and
  assets too), business rules and handlers, and its domain UI (players,
  editors, canvas/SVG/WebGL views) with its own browser code. It needs no
  justification against 61ade for any of these. Its own files can be served
  by a GET action whose handler returns `DownloadStream`
  ([usage](../../../docs/usage.md#virtuális-fájlkezelő)).
- **The test:** ask "would another project need this in the same form?"
  - No: build it in the project.
  - Yes, and 61ade has it: use it.
  - Yes, and 61ade lacks it: send the request to the 61ade owner and do not
    wait. Build an interim local version, note the request in your own
    documentation, and migrate when 61ade delivers.
- **Fixed in every case:** every server read and write is a registered action
  checked on the server. A module runs with the user's session and gains no
  right from it. Backend-only data never enters view `options`. Untrusted
  code runs only in `SandboxFrame` (step 5).

## 2. Declare first

A purely declarative application is fully supported. Stop at the first step
that covers the need.

1. **Resources, fields and actions** in PHP or JSON, with business rules as
   handlers (`guard`, `normalize`, `afterSave`)
   ([business boundary](../../../docs/usage.md#üzleti-konfiguráció-és-kód-határa),
   [configuration](../../../docs/configuration.md)).
2. **Views** ([views](../../../docs/toolkit.md#views)). A view id defaults to
   its resource; a resource can have several views. Treat a view id as a
   public address: delivered links (`#feature=<resource>` resolves only to
   the view whose id equals that resource), saved UI preferences and menu ids
   `view:<id>` depend on it ([routing](../../../docs/toolkit.md#routing)).
   A later declaration with the same id replaces the whole earlier view and
   keeps its menu position, so attach sub-views after the final declaration
   ([rule](../../../docs/toolkit.md#view-id-rule)).
3. **Record views** (`record: <resource>`, `open: page|window`) for a page
   about one record. The server resolves the row through that resource's
   `get`, so the view is offered only with `get`
   ([record views](../../../docs/toolkit.md#record-views)). Declare a view
   after the actions it names, because `addView` checks that they exist.
4. **Activation map** per row, with `view:<id>` targets
   ([activation map](../../../docs/toolkit.md#activation-map)). A media field
   is keyed by its MIME class. Leave out `*` where the other rows should keep
   the default behaviour.
5. **Client commands** are declared on the server by dotted name (per view,
   [registries](../../../docs/toolkit.md#registries)) and registered in a
   module (step 3).
6. **Texts** go into your i18n catalogues. Use the Hungarian source text as the
   key, or a project prefix (`project.player.play`) for texts without a
   natural source. Overriding a framework key is allowed, so do it on purpose.
   Modules translate through `app.i18n.t` with the same catalogues. Update
   every catalogue ([i18n](../../../docs/i18n.md#fordítási-szerződés),
   [G1 decision 2](../../../docs/toolkit.md#open-points)).
7. **Look and sign-in:** use [skins](../../../docs/shell.md#application-skins)
   for the signed-in pages. For the sign-in pages use `logo` (placement
   `window`, `top` or `both`), `signInStylesheets` and the `signIn` notice
   and links ([sign-in customization](../../../docs/shell.md#sign-in-branding)).
   Style only through the [supported CSS hooks](../../../docs/shell.md#sign-in-css-hooks).
   Framework classes such as `.blade-navigation-row`, Suite `.dhx_*` classes
   and the DOM structure may change in any release. Replace output-buffer CSS
   or markup injection with these options.

## 3. Add a project module

Follow [module loading](../../../docs/toolkit.md#module-loading). The
setup steps (paths, deploy entries, keys) are in
[61ade-consumer](../61ade-consumer/SKILL.md#add-project-browser-code-optional).

- The default export `(app) => …` registers everything during initialization.
  Modules run before the first view opens, and a list, form or details panel
  reads the registries when it is created. A later registration affects only
  surfaces created after it.
- Keep initialization short. A failed import, a throw, a rejection, or an
  import or initialization over 5 s is reported (toast, `module:error`,
  console) and skipped. Registrations made before the failure stay. Do
  server work when a view is created, not at the top level of initialization.
- One module with one part per area, which rethrows the failures as an
  `AggregateError` ([example](../../../docs/toolkit.md#example-module)), or
  several isolated modules. Both work.
- Every project name contains a dot: kinds, presentations, field types,
  commands, event names and preference scopes (`project.player`). A name
  without one throws. `{replace: true}` overrides a built-in on purpose.
- Use only `app`. Never import `admin.js` or `@dhtmlx/suite` at run time,
  because that loads a second instance. Suite widgets come from `app.dhx`.
  Internal frontend classes (for example `Workspace`) are not a contract.
- Server calls go through `app.server` ([services](../../../docs/toolkit.md#services)).
  `ServerFailure` is an interface, so tell it apart by shape and test for
  `AbortError` first. A 401 signs the page out. Pass the owner's signal as
  `{signal: host.signal}`, last, on every subscription. A positional signal
  throws.
- `modules` and `stylesheets` load only on signed-in pages. The sign-in pages
  take `signInModules`, which get a restricted `SignInApplication` with no
  server, identity or registries. They are still trusted code on the page
  that holds the password field ([sign-in modules](../../../docs/shell.md#sign-in-modules)).

## 4. Pick the extension point

| Need | Use |
| --- | --- |
| A domain page, viewer or editor | a view kind (`app.kinds`) plus a view or record view. Without a server provider, `GenericViewKind` passes JSON-safe `options` (size limits in [views](../../../docs/toolkit.md#views)). It offers the view to an actor who is offered one of its declared actions, and to everyone when it declares none, so declare the actions the page uses. A provider registered with `Registry::kind()` must come **before** the first view of that kind. |
| Custom cell, card or tile rendering | a presentation: synchronous, escape every value, give a picture or colour a text alternative, no per-column options |
| Custom editor for a field | a field type (`editor`): the item's `name` is the field name; the server still validates the storage type; refused on secret, password, `file` and media fields |
| A browser action on the list or its cursor record | a client command: declared on the server (at most 20 per view), `placement` `toolbar` or `record`, own `enabled` rule for marks; reads and writes through actions |
| A list, form, details, media, files or calendar inside your page | [components](../../../docs/toolkit.md#components) |
| Code the project does not trust (agent-written scenes) | `SandboxFrame` (step 5) |

Unknown or failing presentations, field types and commands fall back to plain
values or are left out, with a console warning
([registries](../../../docs/toolkit.md#registries)). Check the console when
something silently looks plain.

## 5. Compose pages and use the sandbox

- Build one Suite Layout from `app.dhx`, `host.attach()` it and mount the
  components into its cells. Each build owns an `AbortController`. Register
  `layout.destructor()` on it **after** the components
  ([Layout recipe](../../../docs/toolkit.md#layout-recipe)).
- Read the [pitfalls](../../../docs/toolkit.md#pitfalls) before the first page:
  - A cell that showed `attachHTML` markup and then gets `attach()` renders
    empty. Give alternating content a fresh one-cell box Layout.
  - Only `ViewHost.attach` puts an element into a cell.
  - Suite Standard has no Form `container`, and `togglegroup` and Slider are
    not announced, so give them text and a keyboard route.
  - `ListView` preferences are keyed by the id of the definition it holds. A
    page that needs its own state passes the definition under its own view id.
- Accepted [limits](../../../docs/toolkit.md#limits): no `ListView` marks
  event, no `MediaPlayer` playback-state event, one `Calendar` per page, and
  marks are never persisted. Build what you need from these in your own module.
- `SandboxFrame` ([protocol](../../../docs/toolkit.md#sandbox-protocol)) is the
  only place for untrusted code, never `modules` or `signInModules`.
  - Deploy `sandbox.html` beside `admin.js` (61ade-consumer, adopt step 3).
  - Mount the frame before `load()`; the ready timeout starts at `load()`.
  - Pass only data the actor may see, since the frame can leak what it gets.
  - Treat every frame message as untrusted input.
  - `sandbox:error` names no frame, so listen to each frame's own `error`.
  - A busy loop in the frame can still block the page.

## 6. Build with TypeScript (optional)

Follow the [recipe](../../../docs/toolkit.md#typescript-recipe) and the
[naming conventions](../../../docs/toolkit.md#conventions).

- Map `@61ade/admin` to `admin.d.ts` through your development assets link.
  It is never deployed.
- Install the same `@dhtmlx/suite` version as 61ade, as a devDependency, for
  its types.
- Use `import type` only. Declare project events by module augmentation of
  `AppEvents`.
- Build one ESM bundle into your public directory, and make sure your release
  copies it.
- New 61ade types arrive with the linked checkout's commit. A changed
  `admin.d.ts` is a reason to re-run your typecheck.
- Browser metadata is camelCase. Record data keeps the server's field names
  (`mime_type`).

Cache keys come from the served file
([cache keys](../../../docs/toolkit.md#cache-keys)), so leave `?v=` off.
A file outside the real document root falls back to `?v=<version>`, so check
the page source after a release when your admin is served through a link.
A rewrite with the same size within one second keeps the old key.

## 7. Test

Setup is in [61ade-consumer](../61ade-consumer/SKILL.md#adopt) (guarded
wrapper, loader file, accounts). For specs of your modules:

- Respect the guard's task budget: Chromium and Playwright use most of the
  128 tasks. Never build bundles or start processes at the top level of a spec
  file, because Playwright loads every spec file to list the tests. Build
  lazily on first use, with esbuild as a short-lived child
  ([browser tests](../../../docs/development.md#browser-tests-on-the-shared-development-host),
  [FB-0083](../../../docs/feedback.md#fb-0083)). Never pass `--workers`.
- Do not pin asset keys, address menu items by name or `view:<id>`, and find
  record commands in the list toolbar or `Műveletek` (there is no record
  context menu).
- Make a spec fail on a module failure. The shell still starts in that case,
  so check for the danger toast or the `console.error` it leaves.

## 8. Stay current

- Every 61ade `main` commit is live on your development URL at once, and your
  next deploy copies it ([consumption](../../../docs/development.md#shared-library-consumption)).
- 61ade coordinates breaking changes
  ([breaking changes](../../../docs/development.md#breaking-changes)), and
  contract changes are listed in the [toolkit changes](../../../docs/toolkit.md#changes)
  and the [migration guide](../../../docs/toolkit.md#migration).
- Run the update smoke check before each release (61ade-consumer).

## 9. Boundaries

- Never edit the 61ade checkout from a consumer session, and never edit a
  consumer from a 61ade session. A framework gap goes to the 61ade owner with
  its reason and the "same form" answer.
- Each project's own contract decides its environments. Record integration
  decisions, interim versions and evidence in your own documentation.

## Worked example

The feature demo is the reference consumer
([toolkit consumer](../../../docs/demos.md#toolkit-consumer)). It has a record
view with `CommandBar`, `RecordDetails` and `MediaPlayer`
([D1](../../../docs/demos.md#d1-asset-viewer)), a sandboxed scene
([D2](../../../docs/demos.md#toolkit-d2-playlist)), a dashboard with a column
presentation ([D3](../../../docs/demos.md#readings-dashboard)), and a field
type with a record command ([D4](../../../docs/demos.md#toolkit-d4-tasks)).
Excerpts are in the [worked examples](../../../docs/toolkit.md#worked-examples).

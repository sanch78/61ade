# Demos: full feature demo and starter admin

Status: implemented and verified on 2026-10-21
([FB-0044](feedback.md#fb-0044--demók-szétválasztása-checkboxos-fiókállapot-oauth-kétfaktor-parancsos-levél-nyelv-api-kulcs));
user acceptance is not claimed.

Three independent applications share the Composer consumer `examples/demo-app`
and managed server, with separate SQLite databases, sessions and cookie paths:

| Demo | URL | Definition | Data | Purpose |
| --- | --- | --- | --- | --- |
| Full feature demo (kitchen sink, R11) | https://61ade.sanch.hu/ | [application.php](../examples/demo-app/application.php) | `tmp/web/features.sqlite` | Every demonstrable capability on synthetic data. |
| Starter admin | https://61ade.sanch.hu/admin/ | [admin-application.php](../examples/demo-app/admin-application.php) | `tmp/web/admin.sqlite` | Exactly the mandatory starter: login, language/theme selectors and admin module. |
| Tenant demo | https://61ade.sanch.hu/tenants/ | [tenant-application.php](../examples/demo-app/tenant-application.php) | `tmp/web/tenants.sqlite` | The starter admin with optional [multi-tenancy](tenancy.md) on. |

Use this single development environment directly. Development and testing happen
there; there is no deployment, post-deployment testing or project backup workflow
([FB-0049](feedback.md#fb-0049), [FB-0051](feedback.md#fb-0051)).
CLI fixture tools do not establish a second environment.
See [development](development.md#development-environment) for build/asset preparation.

<a id="tenant-demo-tenants"></a>

## Tenant demo (`/tenants/`)

[Multi-tenancy](tenancy.md) is opt-in and changes what every view returns, so it
has its own application instead of entering the full feature demo. The full
demo and the starter admin keep tenancy off, which is what keeps their
behavior, rendering and suites unchanged (the exception to the
[continuous extension](#continuous-extension-mandatory) rule).
Tenants `Alfa` and `Béta`; password `61ade-demo`:

| Account | Memberships | Shows |
| --- | --- | --- |
| `demo@example.test` (admin, editor) | Alfa, Béta | Tenant selector in the navigation row; Administration → Tenantok, `Tenantok` on Users, tenant on API keys |
| `single@example.test` (editor) | Alfa | No selector; Alfa projects and tasks only |
| `none@example.test` (editor) | none | "Nincs hozzárendelt tenant" in the lower bar; only `Közös hirdetőtábla` |

`Tenant demó` → `Projektek` and `Feladatok` are tenant-scoped (the task's project
choice is a scoped lookup); `Közös hirdetőtábla` is global. The editor role is
global, and membership decides where it applies.

[Sub-views](workspaces.md#sub-views), one per kind:

| Where | Sub-view | Shows |
| --- | --- | --- |
| Administration → `Tenantok` | access list (`blade_tenant_members`, embedded, `select: false`) | Every user with the editable `Hozzáférés` switch; rows are not selectable and the toolbar stays on the tenant; the toolbar's `Hozzáférések` opens the same list (switch only) in a window; on a phone the card's `Hozzáférések (n)` button (users with access) opens the window |
| `Projektek` | the project's tasks (not embedded: `Feladatok` keeps its menu entry) | A tenant-scoped child list with the editable `Kész` switch; top-level tasks only |
| `Feladatok` | subtasks (the same resource: a hierarchy) | Top-level tasks; a task expands to its subtasks; a selected subtask takes the toolbar over; `Alelemek` opens the hierarchy below the task in a window |
| Feature demo → `Médiatár` | the default contents using the item (JSON `view.subview`) | A usage preview declared in [signage.json](../examples/demo-app/modules/signage.json) | Setup adds the tenant demo to
the same `setup-workspace.php` run.

<a id="alapadmin-admin"></a>

## Starter admin (`/admin/`)

Menu: `Adminisztráció` → Users, Roles, Role memberships, Role permissions and
Individual permissions, plus the root `API-kulcsok` item. No business modules. Hungarian/English
selector and per-account default language. Login:
`demo@example.test` / `61ade-demo`; the first admin comes from explicit
`Permissions::grantAdministration` in setup.

Assembly is account mapping plus [Administration::register](admin.md#kötelező-adminmodul-egy-lépésben).
The subpath uses `cookiePath: '/admin/'`, `assets: '../assets'`; see [shell](shell.md).

<a id="teljes-feature-demó-"></a>

## Full feature demo (`/`)

| Area | Demonstration | Try |
| --- | --- | --- |
| Password login | E-mail/password, 90-day remember option | `demo@example.test` / `61ade-demo` |
| E-mail second factor | Code after password; formatted message with project text/color overrides | `twofactor@example.test` / `61ade-demo`; code in [mailbox](#demó-postafiók-mailbox) |
| OAuth (AuthHandler) | External-account button → native provider overlay; existing OAuth-enabled accounts only, no password | Native Google/Facebook buttons; missing keys show setup feedback, configured keys start the real provider flow; [setup](authentication.md#szolgáltatói-beállítás-google-facebook), HTTPS required |
| Language | Hungarian/English selector before theme, language row in login form, account default used for login and mail | `twofactor@example.test` defaults to English |
| User admin | Disabled, OAuth, e-mail confirmation, default language as form/grid checkbox/select | Administration → Users |
| ACL | Roles, memberships and catalog-based rules | Administration |
| API keys | Once-only secret, multiselect action scope, revocation checkbox | Root menu → API keys |
| Workspace | Filters, sorting, panel forms, cards, inline text/select/checkbox edits, related storage, pattern validation, multiselect, delete, marks and bulk business action | Feature demo → Tasks; Notes |
| Business rule hook | `after_save` rule across main and related storage: an in-progress task cannot turn notifications off; the field error rolls the save back (form and inline edit) | Tasks → set `Folyamatban` with `Értesítés` off |
| Large list | 1801 read-only rows: server-side sorting/filtering, virtual scrolling with a bounded client window | Feature demo → Mérések |
| Field-level ACL | Read-only account; the description field is denied on list/get, so details, cards and responses never contain it | `reader@example.test` → Tasks |
| File manager | Two panels with independent Drive A/B/C mounts and a draggable divider, each switchable between file listing (row marking, MIME icons) and a folder tree with files, new folder (depth ≤ 5), copy/move to the opposite panel with the conflict dialog, the framework [uploader](uploader.md) (txt, md, csv, json, png, jpg, mp4, webm; 5 MB, 20 files; chunked and resumable, folders, paste, background with a shell indicator), TXT editor with revision conflicts; listing/tiles/tree per panel with server search, type filter, sort and paging; rename (F2), delete (Del, real delete policy), single-file and streamed ZIP download; drop/paste onto a panel; image viewer and video player streamed with HTTP Range, 320 px WebP thumbnails from background tasks, content in a disk store; desktop only (`desktopOnly`), narrower windows show a notice; [details](files.md) | Feature demo → Fájlkezelő; `reader@example.test` browses and reads only; below 768 px |
| Network topology builder | Visual diagram editor: drag network elements from the palette, move them, connect them by the element handle with Ethernet/fibre/Wi-Fi/VPN/WAN connections, edit captions and details in the property form, save with revision check; define new element types (name, glyph, shape, colour) at runtime; two synthetic topologies; desktop only; [details](diagrams.md) | Feature demo → Hálózati topológia; `reader@example.test` views only |
| Static image column | Fixed catalog: image file names as a table cell, `Csempék` tile, card and details image; a missing file shows the placeholder, values with `..`, `/`, a scheme or a bad extension show none; the files are `examples/demo-app/public/demo-images/` ([static image column](workspaces.md#media-tiles)) | `Feature demó` → Katalógus |
| Record activation | `Polcok` declares `activate: subview`: double-click or Enter on a shelf in the table, `Kártyák` or `Csempék` opens its `Polc tételei` window, also for the empty `Üres polc`; in the window an item's double-click runs its registered `Készlet` action (toast, `activate: stock`); `reader@example.test` is not offered the item list, so a shelf opens its details; `Raktárzónák` declares `activate: page`: a zone opens the `Polcok` page filtered to it (`Zóna` filter, `Alaphelyzet` removes it, Back returns), the empty `C zóna` too | Feature demo → Polcok, Raktárzónák ([shelves.json](../examples/demo-app/modules/shelves.json)) |
| Signage scheduler (event calendar) | Native DHTMLX Scheduler day/week/month views: drag, the shared event form with the content (asset) select and the recurrence fields, single-occurrence edits; `Médiatár` image/video assets whose files live in the file manager's `Signage` mount: thumbnail, derived type/resolution/length, play time and usage count columns, `Csempék` tiles, title search, type filter, the `file` field with picker and upload, `Feltöltés` (upload as assets in one step), delete with usage warnings that clear defaults and events ([media tiles](workspaces.md#media-tiles), [file field](workspaces.md#file-field)), `Alapértelmezett tartalom` per weekday or per date; `Napi műsor (API)` shows the `signage_playlist.day` answer (gap-free timeline with default fill) and the matching API request; [details](calendar.md) | `Digitális kijelző` → Műsorterv; API key with scope `signage_playlist.day`; `reader@example.test` views only |
| Dialogs | Six severity/mode combinations, long messages and mobile | Select a task and use `Párbeszéd: …` actions, confirmation then acknowledgment; [details](dialogs.md); also at ≤480 px |
| Menu | Unimplemented disabled item and policy-filtered item | `Nyilvántartás` |
| Appearance | Skyblue/light/dark, lower information bar and mobile menu | Any view |
| Application skins | Synthetic neutral skins over a factory base instead of the factory themes: one skin without selector, a light- and a dark-based skin in the selector ([details](shell.md#application-skins)) | `skin@example.test`, `skins@example.test` |

<a id="toolkit-consumer"></a>

### Toolkit consumer (project module)

The feature demo is the reference consumer of the [toolkit](toolkit.md)
([plan section 6](toolkit-plan.md#6-feature-demo-transformation)): it keeps its
declarations and adds its own browser code where the toolkit is the point. The
starter admin and the tenant demo stay declarative and load no project module.

- **Sources:** `examples/demo-app/frontend/src/*.ts`, TypeScript with 61ade
  types only (`import type` from `@61ade/admin`, mapped to
  `packages/frontend/dist/admin.d.ts` by
  [frontend/tsconfig.json](../examples/demo-app/frontend/tsconfig.json));
  everything else comes from `app`
  ([recipe](toolkit.md#typescript-recipe)).
- **Build:** `tools/build.mjs` bundles `src/index.ts` (ESM, es2022) into the
  tracked `examples/demo-app/public/app/demo.js`; `node tools/build.mjs
  --check` refuses a stale or missing bundle exactly like `dist`, and the build
  rejects any import outside `frontend/src`. `npm run typecheck` includes
  `tsc -p examples/demo-app/frontend`; after a change to
  `packages/frontend/src/api`, run `npm run build` first so `admin.d.ts` is
  current.
- **Declaration:** `application.php` `modules: ['app/demo.js']`; the shell
  imports it as `app/demo.js?v=<version>` after sign-in. The application
  `version` is the cache key, so a changed bundle is only refetched after a
  revalidation or a version bump.
- **Structure:** `index.ts` is the module's default export. It calls one part
  per D-row in order; a failing part does not stop the later parts, and the
  failures are rethrown together so the loader reports the module once. A
  D-row adds `src/<file>.ts` with a default-exported `ApplicationModule` and
  replaces only its own slot line in `index.ts` with the import.

| Row | Area | File | Status |
| --- | --- | --- | --- |
| D0 | Build, declaration, empty module | `index.ts` | Implemented; registers nothing visible |
| D1 | Signage `Médiatár` asset viewer | `assets.ts` | Planned |
| D2 | Signage `Napi műsor` playlist preview | `playlist.ts` | Planned |
| D3 | `Mérések` dashboard | `readings.ts` | Planned |
| D4 | `Tasks` field type and command | `tasks.ts` | Planned |
| D6 | Starter admin and tenant demo stay declarative | — | Implemented: `contracts.php` asserts no `modules`/`stylesheets` there and exactly `app/demo.js` on the feature demo |

Synthetic accounts: `demo@example.test` (admin), `viewer@example.test`
(menu only), `blocked@example.test` (consumer `active=0`),
`twofactor@example.test` (code, English default), `oauth@example.test`
(OAuth only; random unknown password), `reader@example.test` (read-only Tasks
without the description field; file manager browse/read only), `skin@example.test`
and `skins@example.test` (application skins only). Shared synthetic password: `61ade-demo`.
Setup adds missing synthetic accounts to an existing database without changing
existing ones; an account added later takes the next free id.

<a id="oauth-kulcsok"></a>

### OAuth keys

Keys stay in ignored `examples/demo-app/.env`:
`BLADE_DEMO_GOOGLE_CLIENT_ID`/`_SECRET`,
`BLADE_DEMO_FACEBOOK_CLIENT_ID`/`_SECRET`;
`BLADE_DEMO_URL` supplies callback base. See [provider setup](authentication.md#szolgáltatói-beállítás-google-facebook).
No simulated provider or mockup page remains (FB-0047).

<a id="demó-postafiók-mailbox"></a>

### Demo mailbox (`/mailbox/`)

The demo does not send mail. It uses [command delivery](authentication.md#levélküldés)
with [bin/outbox.php](../examples/demo-app/bin/outbox.php): it takes the
arguments of the Infra mail helper and stores recipient, subject and HTML body
as JSON in `tmp/demo/outbox` (last 50).

Real mail is opt-in per host, never from Git: when the Git-ignored
`examples/demo-app/.env` sets `BLADE_DEMO_MAIL_HELPER` (the helper path, e.g.
`/space/share/bin/send-infra-mail.php`) and `BLADE_DEMO_MAIL_FROM` (an allowed
sender, e.g. `noreply@cyberspace.hu`), mail to addresses outside
`@example.test` goes out through the helper with `--transport=auto`.
`@example.test` (reserved, undeliverable) always stays in the outbox, so the
synthetic accounts and browser tests are unchanged. The catalyst checkout sets
both ([FB-0065](feedback.md#fb-0065)). The mailbox renders HTML inside a
sandboxed frame.

<a id="kivétel-az-1-szabály-alól-dokumentáltan"></a>

### Documented framework-first exception

`/mailbox/` is a test double for an external recipient mail client, not an
admin interface. Extending the framework cannot replace the external party
being simulated. Boundary: demo/tests only, no 61ade admin functionality, never
a consumer operational interface.

<a id="webszerveres-futtatás-apache--php-fpm"></a>

## Web-server execution (Apache + PHP-FPM)

The managed URL serves `public/` behind the web server with an IP access policy.
Compared with the CLI demo instance:

- `public/.htaccess` sets `BLADE_DEMO_INSTANCE web`, selecting `tmp/web/`; CLI uses `tmp/demo/`. The developer and `www-data` therefore do not write the same instance.
- Initial/schema setup: `BLADE_DEMO_INSTANCE=web php8.4 examples/demo-app/setup-workspace.php`. Setup creates 02770 directories and 0660 databases. If group access is insufficient, a platform-approved ACL is needed, e.g. `setfacl -R -m u:www-data:rwX,d:u:www-data:rwX tmp/web`; do not change host policy as an onboarding workaround.
- Apache must forward Authorization to FPM. `CGIPassAuth On` in `.htaccess` supplies this; otherwise Bearer calls appear as UI calls and return 403. Every Apache-hosted consumer needs it or equivalent vhost configuration.
- Under FPM, `PHP_BINARY` is the daemon. The demo selects the CLI interpreter via `BLADE_PHP`, otherwise `PHP_BINDIR/phpX.Y`.
- OAuth callbacks use configured `BLADE_DEMO_URL`, never Host. Key files must be readable only by developer/web-server principals; the documented access arrangement is no other-user permissions plus a `www-data` read ACL. Both AuthHandler links must be readable by the server.

## WebSocket live data

The feature demo (`/`) polls by default. It selects the WebSocket transport
when the Git-ignored `examples/demo-app/.env` sets
`BLADE_DEMO_LIVE_ENDPOINT=wss://61ade.sanch.hu/live`, which the catalyst
checkout does ([FB-0068](feedback.md#fb-0068)). Set it only while the Infra
unit and the `/live` proxy run: WebSocket does not fall back to polling. The
FPM pool must not force `session.save_path`: the bridge reads the sessions
from the application runtime.
The same unit serves the starter admin and the tenant demo: the feature demo's
`LiveConfig` lists `admin-application.php` and `tenant-application.php`, which
connect to `<endpoint>/admin` and `<endpoint>/tenants`
([FB-0074](feedback.md#fb-0074)).

This checkout cannot be supervised by deploy-jobs, so Infra installs one unit
for the demo with these settings:

| Setting | Value |
| --- | --- |
| User | `www-data` (the PHP-FPM pool identity) |
| Working directory | `/space/share/libs/61ade` |
| Command | `/usr/bin/node /space/share/libs/61ade/packages/php/bin/live-server.mjs` |
| `BLADE_LIVE_PORT` | `8088` (listens on `127.0.0.1` only) |
| `BLADE_LIVE_ORIGIN` | `https://61ade.sanch.hu` |
| `BLADE_AUTOLOAD_FILE` | `/space/share/libs/61ade/examples/demo-app/vendor/autoload.php` |
| `BLADE_APPLICATION_FILE` | `/space/share/libs/61ade/examples/demo-app/application.php` |
| `BLADE_PHP` | `/usr/bin/php8.4` |
| `BLADE_DEMO_INSTANCE` | `web` (the same `tmp/web` instance as Apache) |
| Writable | `/space/share/libs/61ade/tmp/web` (sessions, live tickets, SQLite); the rest of the checkout read-only |

The proxy forwards `/live` on `61ade.sanch.hu` to `http://127.0.0.1:8088/live`.
The bridge is one long-running PHP process. It re-runs the application file
for every observation, but classes and `require_once` files (the framework,
`common.php`) stay as first loaded. It therefore reloads itself: when an
included PHP file changes or vanishes, it exits with code 75 between requests,
and the server starts a new bridge and re-sends the unanswered requests, so open
sockets stay open. When the content of `live-server.mjs` changes (a rebuild with
an identical bundle does not count), the server closes its sockets with 1012 and
exits with 1; the unit's `Restart=on-failure` starts the new bundle and the
browsers reconnect with backoff. Changes under `packages/php`, to demo PHP and
to the server bundle therefore need no restart. Only the change that introduced
this self-reload needs one last owner restart ([FB-0075](feedback.md#fb-0075)).

<a id="folyamatos-bővítés-kötelező"></a>

## Continuous extension (mandatory)

Every demonstrable new framework capability enters the full feature demo as
module, field, action or configuration and the table above in the same batch.
The starter admin changes only when the mandatory starter set changes.
See [project rules](development.md#mandatory-framework-development-rules).

<a id="ellenőrzés"></a>

## Verification

- `php8.4 tests/shell/contracts.php`: both setups, exact starter views, separate sessions/paths/assets and feature-demo accounts/login modes; the starter admin and the tenant demo declare no modules or stylesheets, the feature demo exactly its versioned `app/demo.js` ([toolkit consumer](#toolkit-consumer)).
- `npm run test:browser -- tests/shell/toolkit-demo.spec.cjs`: the feature demo requests `/app/demo.js?v=<version>` once (bootstrap `modules` and the network agree) and starts without the module error toast or console report; `/admin/` and `/tenants/` have no bootstrap `modules` and request no script outside `assets/`.
- Ignored `.env.test` supplies `BLADE_DEMO_URL` and `BLADE_DEMO_INSTANCE=web`; every browser spec runs against the managed server and none starts a local server ([development](development.md#unified-playwright-configuration)).
- `npm run test:browser -- --project=shell tests/shell/demo.spec.cjs`: login modes/language row, provider overlay/start, mailbox code/English default, account columns, API issue/use/revoke, starter menu and Tasks. Real provider completion remains unverified; FB-0050 records Google's callback mismatch.
- `npm run test:browser -- --project=shell tests/shell/dialogs.spec.cjs`: six combinations on desktop/320×480, keys/focus and invalid-login caller.
- Feature-demo specs migrated from the former localhost fixtures ([FB-0052](feedback.md#fb-0052)): `related-fields`, `grid-edit`, `list-integration`, `preferences` (Tasks), `grid-sort` (Mérések), `i18n` (Hungarian/English) and `authentication` (`twofactor@example.test`, demo mailbox, Users admin switch). They delete the tasks they create and restore changed account state.
- `php8.4 tests/shell/files.php` and `npm run test:browser -- tests/shell/files.spec.cjs`: the file manager ([files](files.md#demo-and-verification)); the spec removes the entries it creates.
- `php8.4 tests/shell/calendar.php` and `npm run test:browser -- tests/shell/calendar.spec.cjs`: the event calendar and signage playlist ([calendar](calendar.md#demo-and-verification)); the spec deletes the events it creates.
- `php8.4 tests/shell/diagram.php` and `npm run test:browser -- tests/shell/diagram.spec.cjs`: the topology builder ([diagrams](diagrams.md#demo-and-verification)); the spec removes the diagrams and element types it creates.
- `npm run test:browser -- tests/shell/workspace.spec.cjs`: Notes on the feature demo observe an external SQLite write through polling, or, when `.env` selects WebSocket, through an update frame on the tab's one `/live` socket (one socket also while switching tenant-demo views and expanding sub-views); the starter admin and the tenant demo receive updates on `/live/admin` and `/live/tenants`, and the feature demo path refuses their tickets. The WebSocket cases skip under polling and vice versa.
- `php8.4 tests/shell/tenancy.php` and `npm run test:browser -- tests/shell/tenancy.spec.cjs`: the tenant demo and the tenancy security matrix ([tenancy](tenancy.md#verification)). The spec switches demo@ back to Alfa.
- Manual verification: open the managed URLs directly from the checkout.

<a id="korlátok"></a>

## Limits

- The unauthenticated demo mailbox is a development tool, not a consumer security pattern.

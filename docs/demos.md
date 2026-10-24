# Demos: full feature demo and starter admin

Status: implemented and verified on 2026-10-21
([FB-0044](feedback.md#fb-0044--demók-szétválasztása-checkboxos-fiókállapot-oauth-kétfaktor-parancsos-levél-nyelv-api-kulcs));
user acceptance is not claimed.

Two independent applications share the Composer consumer `examples/demo-app`
and managed server, with separate SQLite databases, sessions and cookie paths:

| Demo | URL | Definition | Data | Purpose |
| --- | --- | --- | --- | --- |
| Full feature demo (kitchen sink, R11) | https://61ade.sanch.hu/ | [application.php](../examples/demo-app/application.php) | `tmp/web/features.sqlite` | Every demonstrable capability on synthetic data. |
| Starter admin | https://61ade.sanch.hu/admin/ | [admin-application.php](../examples/demo-app/admin-application.php) | `tmp/web/admin.sqlite` | Exactly the mandatory starter: login, language/theme selectors and admin module. |

Use this single development environment directly. Development and testing happen
there; there is no deployment, post-deployment testing or project backup workflow
([FB-0049](feedback.md#fb-0049), [FB-0051](feedback.md#fb-0051)).
CLI fixture tools do not establish a second environment.
See [development](development.md#development-environment) for build/asset preparation.

<a id="alapadmin-admin"></a>

## Starter admin (`/admin/`)

Menu: `Adminisztráció` → Users, Roles, Role memberships, Role permissions and
Individual permissions, plus the root `API-kulcsok` item. No business modules. Hungarian/English
selector and per-account default language. Login:
`demo@example.test` / `61de-demo`; the first admin comes from explicit
`Permissions::grantAdministration` in setup.

Assembly is account mapping plus [Administration::register](admin.md#kötelező-adminmodul-egy-lépésben).
The subpath uses `cookiePath: '/admin/'`, `assets: '../assets'`; see [shell](shell.md).

<a id="teljes-feature-demó-"></a>

## Full feature demo (`/`)

| Area | Demonstration | Try |
| --- | --- | --- |
| Password login | E-mail/password, 90-day remember option | `demo@example.test` / `61de-demo` |
| E-mail second factor | Code after password; formatted message with project text/color overrides | `twofactor@example.test` / `61de-demo`; code in [mailbox](#demó-postafiók-mailbox) |
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
| Signage scheduler (event calendar) | Native DHTMLX Scheduler day/week/month views: drag, the shared event form with the content (asset) select and the recurrence fields, single-occurrence edits; `Médiatár` image/video assets whose files live in the file manager's `Signage` mount: thumbnail, derived type/resolution/length, play time and usage count columns, `Csempék` tiles, title search, type filter, the `file` field with picker and upload, `Feltöltés` (upload as assets in one step), delete with usage warnings that clear defaults and events ([media tiles](workspaces.md#media-tiles), [file field](workspaces.md#file-field)), `Alapértelmezett tartalom` per weekday or per date; `Napi műsor (API)` shows the `signage_playlist.day` answer (gap-free timeline with default fill) and the matching API request; [details](calendar.md) | `Digitális kijelző` → Műsorterv; API key with scope `signage_playlist.day`; `reader@example.test` views only |
| Dialogs | Six severity/mode combinations, long messages and mobile | Select a task and use `Párbeszéd: …` actions, confirmation then acknowledgment; [details](dialogs.md); also at ≤480 px |
| Menu | Unimplemented disabled item and policy-filtered item | `Nyilvántartás` |
| Appearance | Skyblue/light/dark, lower information bar and mobile menu | Any view |

Synthetic accounts: `demo@example.test` (admin), `viewer@example.test`
(menu only), `blocked@example.test` (consumer `active=0`),
`twofactor@example.test` (code, English default), `oauth@example.test`
(OAuth only; random unknown password), `reader@example.test` (read-only Tasks
without the description field; file manager browse/read only). Shared synthetic password: `61de-demo`.
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
with [bin/outbox.php](../examples/demo-app/bin/outbox.php), saving complete MIME
messages in `tmp/demo/outbox` (last 50). The mailbox renders HTML inside a
sandboxed frame.

<a id="kivétel-az-1-szabály-alól-dokumentáltan"></a>

### Documented framework-first exception

`/mailbox/` is a test double for an external recipient mail client, not an
admin interface. Extending the framework cannot replace the external party
being simulated. Boundary: demo/tests only, no 61de admin functionality, never
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

<a id="folyamatos-bővítés-kötelező"></a>

## Continuous extension (mandatory)

Every demonstrable new framework capability enters the full feature demo as
module, field, action or configuration and the table above in the same batch.
The starter admin changes only when the mandatory starter set changes.
See [project rules](development.md#mandatory-framework-development-rules).

<a id="ellenőrzés"></a>

## Verification

- `php8.4 tests/shell/contracts.php`: both setups, exact starter views, separate sessions/paths/assets and feature-demo accounts/login modes.
- Ignored `.env.test` supplies `BLADE_DEMO_URL` and `BLADE_DEMO_INSTANCE=web`; every browser spec runs against the managed server and none starts a local server ([development](development.md#unified-playwright-configuration)).
- `npm run test:browser -- --project=shell tests/shell/demo.spec.cjs`: login modes/language row, provider overlay/start, mailbox code/English default, account columns, API issue/use/revoke, starter menu and Tasks. Real provider completion remains unverified; FB-0050 records Google's callback mismatch.
- `npm run test:browser -- --project=shell tests/shell/dialogs.spec.cjs`: six combinations on desktop/320×480, keys/focus and invalid-login caller.
- Feature-demo specs migrated from the former localhost fixtures ([FB-0052](feedback.md#fb-0052)): `related-fields`, `grid-edit`, `list-integration`, `preferences` (Tasks), `grid-sort` (Mérések), `i18n` (Hungarian/English) and `authentication` (`twofactor@example.test`, demo mailbox, Users admin switch). They delete the tasks they create and restore changed account state.
- `php8.4 tests/shell/files.php` and `npm run test:browser -- tests/shell/files.spec.cjs`: the file manager ([files](files.md#demo-and-verification)); the spec removes the entries it creates.
- `php8.4 tests/shell/calendar.php` and `npm run test:browser -- tests/shell/calendar.spec.cjs`: the event calendar and signage playlist ([calendar](calendar.md#demo-and-verification)); the spec deletes the events it creates.
- `php8.4 tests/shell/diagram.php` and `npm run test:browser -- tests/shell/diagram.spec.cjs`: the topology builder ([diagrams](diagrams.md#demo-and-verification)); the spec removes the diagrams and element types it creates.
- Manual verification: open the managed URLs directly from the checkout.

<a id="korlátok"></a>

## Limits

- The unauthenticated demo mailbox is a development tool, not a consumer security pattern.

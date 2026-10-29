# 61ade application foundation: login, menu and workspace

Mandatory direction: [61ade = ADE v2](decisions/0002-framework-first.md).
The framework owns general behavior and DHTMLX controls; consumers provide
application definitions and business adapters. The initial capability is
DHTMLX Window/Form login, Menu, Toolbar and Layout with an empty workspace.
There is no separate application frontend, dashboard or placeholder page.
For the later feature/workspace/ACL layer, see [ACL and actions](access-and-actions.md).

<a id="keretszerződés-és-használat"></a>

## Framework contract and usage

After Composer autoloading, the PHP consumer entrypoint calls only:

```php
Blade\Infrastructure\HttpEntrypoint::run(static fn() => require '../application.php');
```

`application.php` returns `Blade\Shell\ApplicationDefinition`. Required:
`title`, `identities` (IdentityProvider), `menu` (Menu), `runtime` (private
writable directory). Optional: `sessionName`, `cookiePath`, string `version`
(default empty), `assets` (browser path to built assets relative to the page,
default `assets`; e.g. `../assets` for the [starter admin](demos.md) at `/admin/`).
Other options include `authentication`, `languages`, `accounts`, `oauth`;
see [authentication](authentication.md). JSON uses `application.version`, e.g.
`"title":"Minta admin","version":"0.1.0"`. Startup, errors, sessions, CSRF,
login/logout, metadata and UI rendering belong to the framework.

`IdentityProvider` exposes `authenticate(username,password)` and `find(id)`,
returning `Identity(id,displayName,attributes)` on success. Backend attributes
are not serialized. Every authenticated HTTP request calls `find` to recheck
the account and permissions.

`SqlIdentityProvider` accepts explicit table/column mapping, validates identifiers
and reads only declared columns with bound parameters. Password hashes must
never enter attributes. Default verification is `password_verify`; server-side
`passwordVerifier`/`allowed` callbacks adapt existing password formats and
account state. This is business adaptation, not an application login flow.
The provider only reads.

`Database::fromEnvironment(file,prefix,readOnly)` opens PDO MySQL from
`PREFIX_HOST/PORT/NAME/CHARSET/USER/PASSWORD`. Process env overrides the file.
`readOnly: true` starts read-only transactions. Demo and unit tests use isolated PDO SQLite.

<a id="deklarált-menü"></a>

## Declared menu

```php
use Blade\Navigation\{Menu, MenuItem};
use Blade\Shell\Identity;

$menu = new Menu([
    new MenuItem('library', 'Nyilvántartás', [
        new MenuItem('documents', 'Dokumentumok'),
    ], visible: static fn(Identity $actor) => $actor->attributes['canViewLibrary']),
]);
```

61ade validates unique stable IDs across the tree, evaluates `visible`
server-side and omits empty branches. Browsers receive only `id`, `label`,
`items`, `disabled`; never callbacks, SQL or account attributes.
The consumer hierarchy renders recursively as native DHTMLX Menu.

Historical shell MenuItem leaves are disabled. Implemented modules enter
navigation from Feature Registry view definitions. Placeholder content and
business actions do not belong in this initial shell API; later feature
navigation is described below. Logout is a working framework menu action.
For a new module, first implement needed feature/action/policy capabilities,
then configure its business integration.

<a id="dhtmlx-megjelenítés-és-csomagolás"></a>

## DHTMLX rendering and packaging

`AdminShell` owns Layout/Toolbar/Menu/Window/Form lifecycle, login validation
and keyboard submission. Errors use the framework's DHTMLX dialogs. Framework
CSS handles full-window sizing and documented Suite theme variables.
Below 768 px workspace width, menu branches and logout move under native
`Menü`; widening restores the top menu. Consumers have no shell HTML/CSS/JS layer.

Historical initial verification: PHP 8.4.26, Node 18.19.1, npm 9.2.0,
TypeScript 5.9.3, esbuild 0.25.12, Suite Standard 9.3.12, Playwright 1.58.2.
Current system runner guidance is in [development](development.md).
Lockfiles pin application dependencies. Suite icon fonts are checked against
SHA-256 in `tools/vendor-assets.json` and cached in `tmp/dhx-icons`. The first
build needs internet; hash mismatch fails the build. Fonts are embedded, with
no browser CDN requests.

```bash
npm ci --cache tmp/npm-cache
npm run typecheck
npm run build
```

Consumers prepare assets using the package's
`61ade-assets <public-assets-directory>` command. The package owns this utility;
consumers need no asset assembler. `assets/admin.js` and `assets/admin.css`
are required beside the PHP entrypoint.

`0.1.0` is a local development identifier, not a published release. This
application definition replaces the rejected initial shell API:
`brand/headline/description/loginHint` and navigation closures were removed.
The earlier UI is not a supported alternative. License and final packaging remain open.

<a id="önálló-keretdemó-és-ellenőrzés"></a>

## Independent framework demo and verification

`examples/demo-app` is its own Composer consumer with synthetic SQLite data.
It supplies the [feature demo and starter admin](demos.md) at `/` and `/admin/`,
without importing application source/configuration/data.

```bash
# Use installed Composer/PHP 8.4+ when available:
(cd examples/demo-app && composer install)
npm run demo:assets
php8.4 tests/shell/contracts.php
npm run test:browser -- --project=shell tests/shell/browser.spec.cjs
```

Open https://61ade.sanch.hu/ or https://61ade.sanch.hu/admin/.
Synthetic login: `demo@example.test` / `61ade-demo`; more accounts are in
[demos](demos.md). `BLADE_PHP` may select a PHP 8.4+ wrapper loading PDO SQLite.
Use existing web-instance setup only when required, as documented in demos.

The former localhost launcher `tools/serve-demo.sh` was removed
([FB-0052](feedback.md#fb-0052)); the demos run only on the managed URL. With
user admin enabled, the login label is
`E-mail`. Synthetic login is demo-only.

`contracts.php` checks SQL identity mapping, identifier validation, disabled
accounts, password exclusion, menu permissions, empty branches, duplicate IDs
and disabled modules. Browser tests exercise actual DHTMLX controls, Enter,
invalid credentials, viewer access, logout and phone size. Artifacts use
`tmp/playwright-results`. Historical 2026-10-16 results: PHP contracts/lint,
typecheck/build and all four initial Chromium tests passed.

<a id="biztonsági-és-fejlesztési-határ"></a>

## Security and development boundary

Sessions use strict IDs, HttpOnly/SameSite=Lax and HTTPS Secure cookies, ID
rotation on login/logout, CSRF on both POSTs and a 30-minute idle timeout.
Five failed logins/IP/60 seconds return 429 through a private file-locked
shared limiter. Password/session data never enter menus/logs. The document
root must be only the consumer public directory.

With explicit `trustLocalProxy: true`, `HttpEntrypoint` trusts
`X-BLADE-HTTPS`/`X-BLADE-Client-IP` only from loopback. The proxy must overwrite
them from its own connection facts. Runtime and cookie path are application settings.

Feature Registry, SQL CRUD, object/field ACL and audit have since been added.
Complete M1/M2/M4, Symfony hosting, multiple organizations and PHP 8.5 remain
open. Future consumer FPM qualification is separate; this project has no
production environment. Menu visibility never replaces backend endpoint policy.

<a id="megjelenési-mód"></a>

## Appearance mode

The right-hand DHTMLX Toolbar selector offers Skyblue (`skyblue`), light
(`light`) and dark (`dark`). Without a saved valid choice, Skyblue is used;
existing valid choices persist. `blade-theme` in localStorage is a browser
preference, not authorization/profile data.

Suite 9.3.12 does not ship legacy Skyblue. The framework uses the documented
[custom-theme API](https://docs.dhtmlx.com/suite/themes/custom_theme/) and
DHTMLX CSS variables for a light-blue palette; Suite 9 controls remain native,
without recreating the entire legacy image/gradient skin. `setTheme` applies
to the document root and all controls. No legacy CSS or application skin layer.
`browser.spec.cjs` checks the default, actual toolbar color, switching and reload persistence.

<a id="application-skins"></a>

### Application skins (optional)

An application may give selected signed-in users its own appearance (skin)
instead of the factory themes ([FB-0072](feedback.md#fb-0072)). A skin refines
a factory base theme (`light`, `dark` or `skyblue`): the shell applies the base
with `setTheme` and marks the root with `data-blade-skin="<id>"`; the
application's stylesheet overrides documented Suite `--dhx-*` variables on that
selector ([custom-theme API](https://docs.dhtmlx.com/suite/themes/custom_theme/)).
Everything keyed to the base keeps working unchanged: the Suite dark variables,
the framework's dark and Skyblue rules, and the calendar's dark Scheduler skin.
A skin only states what differs. Controls stay native; 61ade ships no
application CSS.

```php
use Blade\Shell\{ApplicationDefinition, Identity, Skin};

$brand = new Skin('brand', 'Márka', 'skins/brand.css');              // light base
$night = new Skin('brand-night', 'Márka éjjel', 'skins/night.css', base: 'dark');
return new ApplicationDefinition(
    // ...
    skins: static fn(Identity $actor): array => $actor->attributes['editor'] ? [$brand, $night] : [],
);
```

```css
/* skins/brand.css — only what differs from the base; Skyblue lists more variables. */
[data-blade-skin="brand"] {
  --dhx-h-primary: 210; --dhx-s-primary: 16%; --dhx-l-primary: 36%;
  --dhx-background-secondary: #e4e7eb;
  --dhx-s-toolbar-background: #e4e7eb;
  --dhx-s-grid-header-background: #cbd2d9;
}
```

- `Skin(id, label, stylesheet, base = 'light')`: `id` is lowercase
  `[a-z][a-z0-9-]*` and must not be a factory theme (`skyblue`, `light`,
  `dark`, `contrast-light`, `contrast-dark`); `label` is localized like other
  texts; `stylesheet` is a `.css` path relative to the page, checked like
  `assets`, with an optional `?v=…` cache key. Same-origin paths only, so CSP
  `style-src 'self'` holds. `base` is `light`, `dark` or `skyblue`.
- Skin stylesheets load after the framework CSS, so a `[data-blade-skin]`
  variable wins over the same base variable at equal specificity. Keep to
  `--dhx-*` variables; selectors on framework or Suite classes are not a
  supported contract.
- The closure runs on the server for the authenticated identity only. The
  sign-in, confirmation and password-change pages never load skins. Its result
  goes into the bootstrap `skins` list (id and label) and the shell links the
  stylesheets. No closure or an empty list: unchanged factory behavior.
- With skins the factory themes are not offered. One skin is applied with
  `setTheme` and the theme selector is hidden; several skins fill the selector
  with only those skins.
- The choice among several skins is stored in `blade-skin` in localStorage; an
  unknown value falls back to the first skin. `blade-theme` is never written
  while skins apply, so a user who loses the skins (for example after a role
  change) gets the previous factory theme back, and the sign-in page keeps it.
- Presentation only: a skin grants or limits nothing. Endpoint policy, ACL and
  menu policy stay the access control.
- New framework rules for one theme keep targeting `data-dhx-theme`, never a
  skin id, so they reach every skin built on that base.

The feature demo grants the synthetic neutral `demo-slate` skin (light base) to
`skin@example.test`, and `demo-slate` plus `demo-ink` (dark base) to
`skins@example.test`; other accounts keep the factory themes. `skins.spec.cjs`
checks both cases including the dark base, the unskinned user, the sign-in page
and that `blade-theme` stays untouched.

Workspace switching detaches/disposes the previous DHTMLX layout, waits for
redraw and attaches the new view. Only the latest rapid switch mounts.
`workspace.spec.cjs` checks repeated switching.

<a id="egységes-alsó-információs-sáv"></a>

## Unified lower information bar

The top row contains the menu/theme selector, without a separate application
header. One 32 px DHTMLX Toolbar closes the page. Its intrinsic height fits the
cell to avoid clipped text. Left: authenticated `displayName`, or
`Nincs bejelentkezve` before login. Right: configured application title and
optional version. The framework does not infer application version from its
package. No per-workspace connection/status bar; live updates continue.
Action errors use DHTMLX dialogs, while external changes during editing produce
one DHTMLX Message.

`browser.spec.cjs` verifies placement; `workspace.spec.cjs` checks no extra
status bar and continuing polling. Decision: FB-0011.

<a id="url-és-helyi-felületbeállítások"></a>

## URLs and local UI preferences

A menu-opened feature uses a URL such as `/admin/#feature=items`. The fragment
contains URL-encoded registry resource ID. On reload, login and Back/Forward,
the shell resolves it through current permission-filtered `views`. Unknown/
empty IDs give an empty workspace. Navigation never writes data; record/editor
deep links do not yet exist.

No consumer JavaScript or extra configuration is required. Bootstrap `userId`
is the authenticated identity. Versioned `blade-ui:1:` localStorage keys
separate pathname, user ID and resource. Stored: column widths, successfully
loaded sorting, manually chosen grid/card mode, declared panel sizes and filter
collapse. Automatic editor open/close is not persistent. Forced mobile cards
do not overwrite manual choice. Form/record/filter values and secrets are excluded.

Restoration follows current definitions: removed columns/sort fields are ignored,
size limits apply. Broken/disabled storage falls back safely. Preferences remain
browser-local with no server/device synchronization. Delete the specific key
to reset; logout preserves it and different users have distinct keys.

<a id="desktop-only-views"></a>

### Desktop-only views

A view may declare that it is not offered on narrow screens: PHP
`$registry->view(..., desktopOnly: true)` or `FileManagerDefinition(...,
desktopOnly: true)`, JSON view `"desktop_only": true` (default `false`); the
view metadata carries `desktopOnly`. Below 768 px (the framework breakpoint of
toolbars, grids and workspaces) the shell shows a centred notice in the shared
[dialog](dialogs.md) style, with the view title and `Csak desktop környezetben
elérhető funkció.`, instead of the view. The view stays mounted but hidden, so
widening the window restores it with its state. The option is presentation
only: actions, API calls and ACL are unchanged, and no device detection is
used (a narrow desktop window gets the notice too).

The existing unit script is `node tests/shell/ui-preferences.mjs`.
Its last recorded limitation is
a stale layout double lacking `getRootNode()` (FB-0050). The managed
`preferences.spec.cjs` checks feature URLs through login/reload/history,
persisted column width, sort, view and panel width, and broken storage on the
feature demo's Tasks view.
Feedback: FB-0021.

<a id="kompakt-hitelesítési-ablakok-és-menüikonok"></a>

## Compact authentication windows and menu icons

Login and e-mail confirmation use native Window/Form. Rendered button bottoms
determine height with 24 px lower space, capped by viewport. Resize/validation
remeasures without activating the window over an error modal. Three equal-width
confirmation buttons have 8 px gaps; secondary actions are real buttons.

Menu icons exist at every level: static items default to folder, features have
configurable view icons, groups use open folder, compact menu/logout have their
own icons. Breakpoints include icon width. See [list headings/counts](workspaces.md#listafejléc-és-rekordszám).

<a id="elkülönülő-főmenügombok"></a>

## Distinct main-menu buttons

All three themes give native top-level DHTMLX items permanent borders,
theme backgrounds and 6 px gaps. Skyblue uses a blue gradient, light top edge
and shadow for the requested classic Windows appearance; hover is gold and
pressed/open state recessed blue. Keyboard focus has its own outline.
Submenus retain native list layout. Separators, e.g. before logout, are faint
1 px vertical lines following theme border color. No consumer configuration;
rebuild/prepare assets. Historical shell asset version: `v=11`.
Compact breakpoints include borders/gaps. Verified by `browser.spec.cjs`
across themes, open submenus and phone width.

<a id="kompakt-ablakfejléc-és-teljes-mobilmenü"></a>

## Compact window header and complete mobile menu

Native Window headers are 40 px high, with 16 px title and 32 px close button.
Framework padding is 4 px vertical/12 px horizontal instead of factory
28 px top/20 px bottom. Content sizing measures the actual header. Its 1 px
bottom line uses `--dhx-border-color` inside the 40 px height (FB-0031).
The secondary background is light gray in light theme and lighter dark in dark
theme; Skyblue retains its blue gradient.

Compact navigation puts all branches, logout and the native separator under
`Menü`. Desktop width restores the original top menu. ACL and logout POST
behavior stay consistent; no consumer configuration. FB-0028.

When the top menu does not fit a desktop-width (≥ 768 px) row and collapses into
`Menü`, the open feature's siblings follow it after a faint separator: the
items of the same menu branch (e.g. the other views of its `group`), with the
open one in the native pressed (`active`) state. They are the same entries as
inside `Menü`, so ACL filtering is unchanged. Top-level features have no
context, phone width shows only `Menü`, and the siblings are omitted when they
would not fit by the same width estimate. Navigation updates them.
`browser.spec.cjs` checks it on the signage group; shared test steps prefer a
visible sibling button (`openMenu` in `feature-demo.cjs`). FB-0062.

<a id="opcionális-nyelvválasztó"></a>

## Optional language selector

`i18n.selector` adds a native language selector before the theme selector,
including on mobile. A Toolbar attached to native in-window Layout provides
language switching inside login/confirmation modals. Localization remains active
without a selector; see [i18n](i18n.md) for configuration and persistence.

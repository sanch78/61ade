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
default `assets`; e.g. `../assets` for the [starter admin](demos.md) at `/admin/`),
`documentRoot` (the directory served at `/`, default the request's
`DOCUMENT_ROOT`; the shell keys `admin.js`, `admin.css` and every other linked
asset by its file below it, see [cache keys](toolkit.md#cache-keys)).
Other options include `authentication`, `languages`, `accounts`, `oauth`;
see [authentication](authentication.md); `logo` and `signInStylesheets` brand
the sign-in ([sign-in branding](#sign-in-branding)). JSON uses `application.version`, e.g.
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
`Menü`; widening restores the top menu. Consumers write no shell markup; their
own browser code, if any, is an [application module](#application-modules)
that receives the toolkit API ([ADR-0005](decisions/0005-toolkit.md)).

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

<a id="ended-session"></a>

### Ended session

When the session ends while the page is open (idle timeout, sign-out in
another tab, a removed session), the shell signs the page out on the first
signal ([FB-0086](feedback.md#fb-0086)): any 401 of the JSON channel
(`server.call`/`request`, the uploader, a menu click that loads a view) and the
[live channel's end](workspaces.md#live-channel) (4401 before `ready`,
`__ticket` or `__watch` 401/403). Without open input it reloads the page,
which shows the sign-in page with the address kept, and after sign-in the
same view opens. Over open input (the same `ViewInstance.editing()` ([views](toolkit.md#views))
check that blocks the live channel's reload: a record or bulk form, cell or
card editor, changed singleton form, unsaved diagram) it asks first with the
warning modal "A munkamenet lejárt": **Bejelentkezés** reloads, **Mégse**
(the initial focus) keeps the page so the input can be copied out, and the
next 401 asks again. The caller still receives its 401 `ServerFailure` and
shows its own error. A second automatic reload within 60 s (`sessionStorage`
`blade-signed-out`; without storage it always asks) also asks instead of
reloading, so a page that comes back signed in but still gets 401 never
loops. A visible polling tab keeps its session alive
([security model](security-model.md)), so there the signal usually comes
from the WebSocket channel, a hidden tab or another tab's sign-out.
`workspace.spec.cjs` covers the menu click, the open form (Cancel and sign-in)
and the refused live ticket.

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
  `assets`, with an optional `?v=…` cache key; without one the shell appends the
  stylesheet file's [cache key](toolkit.md#cache-keys). Same-origin paths only, so CSP
  `style-src 'self' 'unsafe-inline'` holds. `base` is `light`, `dark` or `skyblue`.
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

<a id="sign-in-branding"></a>

### Sign-in branding: application logo and sign-in stylesheets (optional)

Owner decision of 2026-10-30: the sign-in must be customizable
([FB-0087](feedback.md#fb-0087)). It is declarative: an application logo and
project stylesheets for the signed-out pages, styled through a small supported
hook contract. No project JavaScript runs before sign-in.

```php
use Blade\Shell\{ApplicationDefinition, Logo};

return new ApplicationDefinition(
    // ...
    logo: new Logo('branding/logo.svg', darkImage: 'branding/logo-dark.svg', label: 'Példa admin'),
    signInStylesheets: ['branding/sign-in.css'],
);
```

```json
{"application": {"title": "…", "runtime": "…",
  "logo": {"image": "branding/logo.svg", "dark_image": "branding/logo-dark.svg", "label": "Példa admin"},
  "sign_in_stylesheets": ["branding/sign-in.css"]}}
```

- **`Logo(image, darkImage = null, label = null)`:** `image` and `darkImage`
  are browser paths checked like `stylesheets` (relative to the page or
  root-absolute, same-origin, `[A-Za-z0-9_-]` segments, an optional own `?…`
  key) with the extension `.svg`, `.png` or `.webp`; without an own key each
  gets its file's [cache key](toolkit.md#cache-keys). Anything else fails at
  definition time (`Invalid 61ade logo image`). `label` is the accessible text,
  localized like other texts; it defaults to the application `title`, and a
  blank one is refused. Same-origin images keep the CSP `img-src 'self' data: blob:`.
- **Where:** on signed-in pages the logo is the last cell of the top menu row,
  after the tenant, language and theme selectors, behind a 1 px line in the
  theme border colour (24 px high, at most 160 px wide). It is not a menu item:
  when the menu collapses into `Menü` the logo stays, and its width counts in
  the menu's width estimate, so the menu collapses (and the
  [sibling items](#kompakt-ablakfejléc-és-teljes-mobilmenü) drop) before
  anything overlaps. When the row has no room for `Menü`, the selectors and the
  logo (for example the feature demo at 390 px, with a language and a theme
  selector), the row leaves the logo out; widening brings it back. On the
  sign-in, e-mail confirmation and password-change pages it is centred above
  the form in the window (48 px high, at most the window width), and the top
  row has none, so each page shows it once.
- **Themes:** with `darkImage`, the light image shows under Skyblue, light and
  light-based [skins](#application-skins), the dark image under dark and
  dark-based skins (the applied base, `data-dhx-theme="dark"`). A theme switch
  repaints at once through CSS. Give both images the same aspect ratio. Without
  `darkImage` the light image shows in every theme.
- **Accessibility:** one element with `role="img"` and the label as its
  accessible name; the images inside have an empty `alt`, so the hidden theme
  variant is never announced and nothing is announced twice.
- **Sign-in stylesheets:** `signInStylesheets` (`.css`, same path rules and
  keys) are linked only on the sign-in, e-mail confirmation and
  password-change pages, after `admin.css` (those pages load no skins). The
  signed-in shell links `stylesheets` instead and never the sign-in ones; the
  sign-in pages never link `stylesheets` and never import `modules`.
- **Bootstrap:** `logo` = `{image, dark?, label}` (keyed URLs) on every page
  when a logo is declared, absent otherwise. Nothing else is added.

<a id="sign-in-css-hooks"></a>

#### Supported CSS hooks

Both kinds of project stylesheet (`stylesheets` and `signInStylesheets`) may
rely on these hooks only:

| Hook | Meaning |
| --- | --- |
| `data-blade-page` on `<html>` | Page kind, set by the server before any script runs: `sign-in`, `confirmation` (e-mail code), `password-change` (forced temporary password replacement), `shell` (signed in). |
| `data-dhx-theme` on `<html>` | Applied base theme (`skyblue`, `light`, `dark`), set by the shell; read it, never set it. |
| `data-blade-skin` on `<html>` | Active [skin](#application-skins) id (signed in, with skins only). |
| `.blade-logo`, `.blade-logo__image` | The logo element (`role="img"`) and its images. |
| `--blade-logo-height` (24px), `--blade-logo-max-width` (160px) | Size of the top-row logo; the row measures the rendered logo. |
| `--blade-sign-in-logo-height` (48px) | Height of the logo in the sign-in windows. |
| Suite `--dhx-*` variables | The [custom-theme API](https://docs.dhtmlx.com/suite/themes/custom_theme/), as for skins. |

Everything else (framework classes such as `.blade-navigation-row` or
`.blade-auth-window`, Suite `.dhx_*` classes, the DOM structure) is not a
supported contract and may change in any release. A rule on
`[data-blade-page="…"]` sits on the same element as the theme variables, so
being linked later it wins over every theme's value; scope a value that must
differ per theme with `[data-dhx-theme="dark"]` as well.

```css
/* branding/sign-in.css (the feature demo's): only supported hooks. */
[data-blade-page="sign-in"], [data-blade-page="confirmation"], [data-blade-page="password-change"] {
  --blade-sign-in-logo-height: 40px;
  --dhx-h-primary: 160; /* hue only: lightness and saturation stay the theme's */
}
```

The feature demo declares the synthetic wordmark `branding/logo.svg` and
`branding/logo-dark.svg` and this stylesheet
([demos](demos.md#teljes-feature-demó-)); the starter admin and the tenant
demo declare neither. `toolkit.php` renders every page kind (kind, links,
keys, bootstrap, rejected paths), `configuration.php` the JSON keys and
`contracts.php` the demos' declarations; `sign-in-branding.spec.cjs` covers
the windows, themes, a dark-based skin, the top row, phone width and the
starter admin.

<a id="egységes-alsó-információs-sáv"></a>

## Unified lower information bar

The top row contains the menu/theme selector and the optional
[application logo](#sign-in-branding) at its end, without a separate application
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

A menu-opened view uses a URL such as `/admin/#view=items`
([toolkit routing](toolkit.md#routing), [FB-0081](feedback.md#fb-0081)). The
fragment is `view=<view id>[&record=<record id>][&filter.<field>=<value>]`,
URL-encoded; a view id defaults to its resource. On reload, login and
Back/Forward, the shell resolves it through the current permission-filtered
`views`. Unknown, empty or unoffered ids, a record view without `record` and a
view whose kind is not registered give an empty workspace. Filter presets apply
once and leave the address (`history.replaceState`). Navigation never writes
data.

- **Legacy alias:** `#feature=<resource>` (delivered e-mails such as
  `/admin/#feature=inquiries`) is read as `#view=<resource>`, the view whose id
  equals that resource, and rewritten in place with `history.replaceState`
  (other parameters kept), also after a sign-in.
- **Menu ids** are `view:<id>` (`sibling:view:<id>` for the collapsed-menu
  siblings). A [record view](toolkit.md#record-views) has no menu entry.
- **Record views:** `#view=<id>&record=<id>` opens a view that declares
  `record` for one record. Before the current view is replaced, the shell reads
  the row through the record resource's `get` action (ACL, field ACL and tenant
  scope on the server); a refusal shows the shared error dialog and keeps the
  current view. `open: "page"` (default) is a page with an address and a history
  entry; `open: "window"` opens a framework document window
  (`blade-feature-window`, full screen below 768 px) over the page without an
  address change. A page navigation closes such windows.

No consumer JavaScript or extra configuration is required. Bootstrap `userId`
is the authenticated identity. Versioned `blade-ui:1:` localStorage keys
separate pathname, user ID and view id (`[path, user, <view id>]`; a sub-view
preview adds `@<field>`). A view whose id equals its resource keeps the keys of
earlier releases, so there is no key migration; a renamed view starts with
defaults. A module's `app.preferences.scope("<project>.<name>")` store is one
entry `[path, user, "scope:<project>.<name>"]`, which cannot collide with a
view. Stored for lists: column widths, successfully
loaded sorting, manually chosen grid/card mode, declared panel sizes, filter
collapse and the filter values of a menu page (header and panel filters,
including one set by an [`activate: 'page'`](workspaces.md#activation)
navigation, which replaces the saved ones; [FB-0079](feedback.md#fb-0079)).
Automatic editor open/close is not persistent. Forced mobile cards do not
overwrite manual choice. Form/record values, the search text, the filters of
sub-view previews and windows, marks and the cursor record (transient by
design), and secrets are excluded. A [`ListView`](toolkit.md#listview) in a
project page keys these by the id of the definition it is given.

Restoration follows current definitions: removed columns/sort fields are ignored,
size limits apply, and a saved filter value is applied only if the actor's
current filter definitions accept it (the server's rules: a known select
option, `0`/`1`, digits for a number, at most 255 characters); otherwise it is
dropped, so the list still loads. A saved filter shows in the header and the
panel; `Alaphelyzet` removes it, also from storage. Broken/disabled storage falls back safely. Preferences remain
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
used (a narrow desktop window gets the notice too). The view host applies it
to every kind, a project kind included, by wrapping what the kind attaches.

The existing unit scripts are `node tests/shell/ui-preferences.mjs` and
`node tests/shell/toolkit-kernel.mjs` (address parsing and the `#feature=`
alias, registry names, the event bus). Its last recorded limitation is
a stale layout double lacking `getRootNode()` (FB-0050). The managed
`preferences.spec.cjs` checks view URLs through login/reload/history, the
`#feature=` alias through a sign-in, persisted column width, sort, view and
panel width, and broken storage on the feature demo's Tasks view.
Feedback: FB-0021.

<a id="application-modules"></a>

## Application modules, kinds and the view host

The shell side of the toolkit ([toolkit reference](toolkit.md),
[FB-0081](feedback.md#fb-0081)); a project's own browser code lives here as
modules, never as shell markup or a template override. After sign-in the shell creates one `Application` (`src/app/Application.ts`)
over the existing modules: `server` (the one JSON transport, `src/api/Server.ts`,
`X-BLADE-CSRF` from the bootstrap `csrf`; every framework component uses it),
`ui`, `uploads`, `i18n`, `theme`, `preferences`, `live` (the tab's one
`LiveChannel`), `events`, `identity` (`src/api/services.ts`) and the
registries `views`, `presentations`, `fieldTypes`, `commands`
(`src/app/registries.ts`). Built-in names have no dot, project names need one;
a duplicate throws unless `{replace: true}`.

- **Built-in kinds** `list`, `files`, `diagram`, `calendar` are registered in
  `src/app/builtins.ts` before any module; the shell opens every view only
  through `app.views.get(view.kind)`. The bootstrap `views` carry the shared
  keys at the top and the kind's payload in `options`; a built-in kind hands
  `options` to its component unchanged.
- **Modules:** the bootstrap `modules` list (page-relative paths of
  `application.modules`; one without its own `?` cache key gets the
  [file-derived key](toolkit.md#cache-keys), `?v=<version>` only as fallback)
  is imported in parallel; the default exports run one by one in declaration
  order with `app`, then the shell routes. A failed import, a missing default
  export, a throw, a rejection or more than 5 s (per import and per
  initialization) is reported by a danger toast (`Egy alkalmazásmodul nem
  indult el: {module}`), the `module:error` event and the console, and skipped;
  the shell always starts. Without modules the shell routes at once, as before.
  Signed-out pages create no `Application`.
- **Stylesheets:** `application.stylesheets` are `<link>`ed on signed-in
  pages after `admin.css` and the skins, keyed like the modules
  ([module loading](toolkit.md#module-loading)); with
  [skins](#application-skins) they are the supported way to add project CSS.
  The signed-out pages link `signInStylesheets` instead
  ([sign-in branding](#sign-in-branding)); both kinds rely only on the
  [supported hooks](#sign-in-css-hooks).
- **View host:** each opening gets a `ViewHost` (`signal`, `open`, `record`,
  `filters`, `attach`, `setTitle`, `close`). The signal aborts when the view
  closes (navigation, window close, sign-out, page unload) before the
  instance's `destroy()` runs exactly once; `view:opened` and `view:closed`
  follow. `attach` takes a Suite widget, a component or a plain element (kept
  in a `.blade-view-slot`). A kind that throws shows the shared error dialog
  and leaves an empty workspace (or closes its window). The live channel asks
  the open instances' `editing()` before a protocol reload.
- **Theme:** `app.theme` reports the applied base theme and skin and calls
  `onChange` listeners after each switch.

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

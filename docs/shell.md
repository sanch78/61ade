# 61ade application foundation: login, menu and workspace

Mandatory direction: [61ade = ADE v2](decisions/0002-framework-first.md).
The framework owns general behavior and DHTMLX controls; consumers provide
application definitions and business adapters. The initial capability is
DHTMLX Window/Form login, Menu, Toolbar and Layout with an empty workspace.
There is no separate application frontend, dashboard or placeholder page.
For the later feature/workspace/ACL layer, see [ACL and actions](access-and-actions.md).

An optional [public identity](authentication.md#public-access) offers the same shell
without login, with explicitly granted guest rights. Its Sign in button sits
immediately before the rightmost top-row logo on desktop and beside the controls
hamburger on phones, where the public shell hides the logo while offering Sign in.
A completed login switches to the member's rights, and logout returns to guest access.
The default remains mandatory login.
Public Sign in opens a modal over the existing view; X, Escape or Cancel before
a challenge preserves that view, unsaved input and live connection without a
reload. Public code/password-change windows are closable too, through the
existing server cancellation. A direct sign-in address or a failed/pending
authentication POST keeps the guest-only view
behind the window ([public sign-in behavior](authentication.md#public-access)).

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
see [authentication](authentication.md); `logo`, `signInStylesheets`, `signIn`
and `signInModules` customize the sign-in pages ([sign-in customization](#sign-in-branding)). JSON uses `application.version`, e.g.
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

<a id="database-connection"></a>

`Database::fromEnvironment(file,prefix,readOnly)` opens PDO MySQL from
`PREFIX_HOST/PORT/NAME/CHARSET/USER/PASSWORD` and an optional
`PREFIX_COLLATION`. Process env overrides the file.
`readOnly: true` starts read-only transactions. Demo and unit tests use isolated PDO SQLite.
`Database::connect` uses native prepared statements.

**Connection collation prerequisite.** The connection collation must match
the collation of the schema's string columns. 61ade compares stored string
columns with expressions such as `CAST(id AS CHAR)`, which take the
connection collation. If the two differ, for example a
`utf8mb4_general_ci` connection on a `utf8mb4_unicode_ci` schema, MySQL
rejects those queries with error 1267 (*Illegal mix of collations*). Set
`collation` (JSON `database.collation`, env `PREFIX_COLLATION`) to the
schema's collation, for example `utf8mb4_unicode_ci`. The value must belong
to `charset` and is applied with `SET NAMES charset COLLATE collation`.
Without it, the server's default collation for the charset applies. A host
that opens its own PDO connection sets the same collation itself.
Comparisons follow the column collation, so under a case-insensitive
collation, string keys that differ only in case compare equal. Stored
identifiers must not rely on case.

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

<a id="menu-group-separators"></a>

### Separators before view groups

`ApplicationDefinition(menuSeparators: ['Management'])` (JSON
`application.menu_separators`) inserts one native DHTMLX
`{type: "separator"}` immediately before the named group of views. Use the
group's original declaration label; the shell translates it and includes it
only when the actor is offered that group. The list must contain unique,
declared view groups; unknown groups and invalid values fail at startup.

View declaration order still determines menu order. There is no leading
separator when the group is first. The existing separator before logout
stays, and both separators remain inside the compact `Menü`. Current-view
marking is unchanged. With the default empty list, existing menus stay the
same. The feature demo uses the default empty list.

<a id="menu-attention"></a>

### Menu attention: a live count on a view's entry

A list view's menu entry can show how many of its records wait for someone,
for example items awaiting review that background work adds
([FB-0160](feedback.md#fb-0160)). Opt in per view with the filters that
select those records and a tone:

```php
$registry->view('proposals', 'Javaslatok', $columns, ['get', 'update'],
    attention: ['filters' => ['status' => 'pending'], 'tone' => 'warning']);
```

JSON: `"view": {"title": "…", "attention": {"filters": {"status": "pending"}, "tone": "warning"}}`
(also `SqlResource::register(…, attention: …)` and `View::list`).

- **Count:** the number of the view's records matching `filters`, for the
  actor: the view's ordinary, ACL-checked list read (row ACL, the tenant, the
  resource's `where`) with those filters and one row, whose `matched` count is
  shown. Only the number and the tone reach the browser; the filters are the
  declaration, never record data. A field the actor may not query fails that
  read, and the entry stays plain.
- **Declaration rules:** a list view with a menu entry that is not a
  singleton (not `menu: false`, not a record view); 1–8 filters on fields of
  the view's resource that a list may filter: not secret, of type text
  (`LIKE`, as in the list), select, checkbox (`0`/`1`) or number (digits),
  not a media field; a non-empty value of at most 255 characters. `tone` is
  `warning` (default), `danger` or `primary`. Anything else throws
  `InvalidArgumentException` when the view is declared.
- **Display:** with a count above zero, the entry shows the count as a badge
  in the tone (`99+` above 99); its branch and, below the menu's width, the
  collapsed `Menü` button show the sum of the counts they hold in the most
  urgent tone (`danger`, then `warning`, then `primary`), also the compact
  menu's sibling entries. At zero the entry is exactly like every other one.
  The tones are theme colours (`warning` uses the warning dialog's accent,
  which Suite does not define), and the number itself is always visible, so
  colour is never the only signal.
- **Accessible name:** the entry's name carries the count: `Javaslatok, 3
  függőben` (`{count} függőben`, translated by 61ade: `3 pending`). The badge
  itself is hidden from screen readers. A branch and `Menü` keep their names;
  the entries inside them carry the counts.
- **Live:** each such view holds one subscription of one row on the tab's
  [live channel](workspaces.md#live-channel), WebSocket or polling, like a
  list, so a change on the server (another user, background work, the view's
  own saves) reaches open pages within the live interval, and an open menu
  updates in place without closing. A hidden tab pauses it like every list.
  The subscription counts against the channel's limits (64 subscriptions and
  2000 rows per connection) with one row.
- **Security:** an actor who is not offered the view gets neither the entry
  nor the subscription; a refused read (`denied`) shows the plain entry.

Limits: the count is that of the declared filters only (no server callback
and no per-actor filter value such as "assigned to me", which a project
expresses as a `where`, the ACL or a dedicated view); one count per view; no
attention on custom `Menu` items, a record view or a `menu: false` view.

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

Open https://demo.61ade.com/ or https://demo.61ade.com/admin/.
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

Sessions use strict IDs, HttpOnly and HTTPS Secure cookies with SameSite=Lax
(optionally [`Strict`](authentication.md#cookie-samesite)), ID rotation on
login/logout, CSRF on both POSTs and a 30-minute idle timeout. An optional
[client-address binding](authentication.md#client-address-binding) ends a
signed-in session used from another address.
Five failed logins/IP/60 seconds return 429 through a private file-locked
shared limiter. Password/session data never enter menus/logs. The document
root must be only the consumer public directory.

<a id="ended-session"></a>

### Ended session

For an authenticated page in a login-only application, when the session ends
while it is open (idle timeout, sign-out in
another tab, a removed session), the shell signs the page out on the first
signal ([FB-0086](feedback.md#fb-0086)): any 401 of the JSON channel
(`server.call`/`request`, the uploader, a menu click that loads a view) and the
[live channel's end](workspaces.md#live-channel) (4401 before `ready`,
`__ticket` or `__watch` 401/403). Without open input it reloads the page,
which shows the sign-in page with the address kept, and after sign-in the
same view opens. Over open input (the same `ViewInstance.editing()` ([views](toolkit.md#views))
check that blocks the live channel's reload: a record or bulk form, cell or
card editor, changed singleton form, unsaved diagram, open calendar event
form, open file rename or new-folder form, unsaved text file) it asks first with the
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

For [public access](authentication.md#public-access), an ended guest session
normally reloads into the public UI. If input or the reload-loop guard requires
confirmation, the same modal offers **Újratöltés** with a guest-session message,
not the member's Sign in instruction. Cancel retains the input. No authentication
is requested unless the visitor already opened sign-in intentionally. Generic
public POST errors are reported without switching into sign-in. Guest CSRF and
authorization checks remain in force; no failed action is replayed automatically.

Runtime and cookie path are application settings.

Feature Registry, SQL CRUD, object/field ACL and audit have since been added.
Complete M1/M2/M4, Symfony hosting, multiple organizations and PHP 8.5 remain
open. Future consumer FPM qualification is separate; this project has no
production environment. Menu visibility never replaces backend endpoint policy.

<a id="trusted-proxies"></a>

### Trusted proxies

`HttpEntrypoint::run($definition, $trustProxy)` decides whose
`X-BLADE-Client-IP` and `X-BLADE-HTTPS` replace the connection's
`REMOTE_ADDR` and `HTTPS`. The rewrite happens before the application
definition exists, so this is an entrypoint argument, not an
`ApplicationDefinition` or JSON key.

| `$trustProxy` | Trusted connections |
| --- | --- |
| `false` (default) | none: the headers are ignored |
| `true` | exactly `127.0.0.1` and `::1`, the former loopback opt-in, unchanged |
| `['192.0.2.0/24', '2001:db8::/32']` | connections from an address in a listed network |

From a trusted connection, a valid `X-BLADE-Client-IP` becomes `REMOTE_ADDR`
and `HTTPS` becomes `on` exactly when `X-BLADE-HTTPS` is `on`, otherwise
`off`. A missing or invalid address changes nothing. Other connections'
headers are ignored. The earlier named argument `trustLocalProxy: true`
remains an alias of `true`; combining it with a `$trustProxy` value fails.

```php
Blade\Infrastructure\HttpEntrypoint::run(static fn() => require '../application.php', ['192.0.2.10/32']);
```

Networks are `address/prefix` strings: a valid IPv4 address without leading
zeros or any valid IPv6 notation without a zone, a prefix of 1–32 or 1–128
without leading zeros, and all host bits zero (`192.0.2.0/24`, not
`192.0.2.1/24`). A single proxy is `/32` or `/128`. `/0` is refused because
it would let every client choose its address; halves such as `0.0.0.0/1` and
`128.0.0.0/1` are just as unsafe, so list only the proxies' own addresses or
networks. IPv4 networks match IPv4 connections and IPv6 networks
IPv6 ones; an IPv4-mapped connection (`::ffff:192.0.2.10`) needs an entry such
as `::ffff:192.0.2.0/120`. An empty list trusts nothing. Anything else (not a
list, a non-string or invalid entry) fails closed: no header is used, the
application does not start, and the request gets the same 503 page as a
configuration error, with `61ade unavailable: InvalidArgumentException` in the
PHP error log.

The proxy must set both headers from its own connection facts on every request
and never pass on client-sent values. Listing a network that also contains
ordinary clients, or a proxy that forwards client headers, lets those clients
choose their address and scheme. They can then spread password attempts
across invented addresses, which defeats the per-address sign-in limit above
(`PasswordAttempts`). They can also present another client's address to pass
the [client-address binding](authentication.md#client-address-binding), and
turn off the cookies' Secure attribute with `X-BLADE-HTTPS: off`.

<a id="megjelenési-mód"></a>

## Appearance mode

<a id="61ade-character"></a>

The right-hand DHTMLX Toolbar selector offers 61ade's own pair, Blade
(`blade`) and Blade Night (`blade-night`), and the Suite themes `Világos`
(`light`) and `Éjjeli` (`dark`). Without a saved valid choice, Blade is used;
existing valid choices persist, a removed one (such as the former `skyblue`)
falls back to Blade. `blade-theme` in localStorage is a browser preference,
not authorization/profile data.

Blade is the DHTMLX theme `blade`, defined through the documented
[custom-theme API](https://docs.dhtmlx.com/suite/themes/custom_theme/) and
DHTMLX CSS variables (`themes/blade.css`, glossy chrome in
`themes/blade-chrome.css`); Blade Night runs on Suite's `dark`, so every dark
rule applies. `data-blade-theme` on `<html>` names the chosen factory theme
(`blade`, `blade-night`, `light`, `dark`); `data-dhx-theme` is the applied
Suite theme (`blade`, `dark`, `light`). Suite controls remain native; `setTheme`
applies to the document root and all controls. `browser.spec.cjs` checks the
default, actual toolbar color, switching and reload persistence.

In Blade and Blade Night, a collapsed Layout column keeps its original strip
width and carries the glossy header over its full height. The vertical title
stays inside that header below the expand icon; the entire strip remains the
native mouse/keyboard toggle. Expanded and horizontally collapsed headers keep
their Suite geometry ([FB-0134](feedback.md#fb-0134)).

Cards and tiles of the list views stay in place under the pointer in every
theme: no transform, size or border-width change. The edge lights up (border
colour, an outer ring and `--blade-lift-shadow`, drawn outside the layout)
and one light sweep crosses the card on an overlay above its content; the
cursor and the focused card keep their own rings. The edge colour is
`--blade-card-hover-edge` (the theme's `--blade-hover-ring` in Blade and
Blade Night); reduced motion turns the sweep off ([FB-0189](feedback.md#fb-0189)).

The grid's cursor row and the selected row of every tree look the same in a
skin: the selection tint (`--blade-select-tint`), a thin blue frame, a
straight 3 px gradient bar (`--blade-gradient-vertical`) on the left edge and
one light sweep (off under reduced motion); the slanted tile stays the mark of
marked rows ([FB-0193](feedback.md#fb-0193)).

<a id="theme-motion"></a>

**Theme motion** ([FB-0187](feedback.md#fb-0187)): in Blade and Blade Night,
opening and closing a layout region eases to its new size in 200 ms instead
of jumping: [Accordion](toolkit.md#accordion) sections (also a `PageLayout`
`accordion` branch), `collapsable` Layout cells of `PageLayout`, list
workspaces and tree navigation (header click, keys, `collapse`/`expand`, the
list's form panel), [accordion form sections](workspaces.md#form-accordion),
and the folders of every Suite Tree (`RecordTree`, tree navigation, the key
browser, the file manager; a click, the keys, children loaded on opening).
A closing accordion section keeps showing its content while it shrinks; a
collapsing Layout cell shrinks with its header only (Suite leaves a collapsed
cell's content out); a tree folder's children slide out from under its row
and back under it, with their lines and stripes, while the folder's connector
and the rows below follow ([FB-0193](feedback.md#fb-0193)). Several folders changing at once (`expandAll`, revealing
a node's ancestors) change without motion. Only the size moves: state, events, `aria-expanded`
and focus change at once, and a second toggle during the motion continues
from the current size.

- The theme switches it on with `--blade-motion-duration` (`200ms` on
  `[data-blade-theme|="blade"]`); `light`, `dark` and skins on those bases
  have none. A skin on a Blade base may set its own value (`0s` turns it
  off, at most `1000ms`); a skin on `light` or `dark` may set one to opt in.
- `prefers-reduced-motion: reduce` sets it to `0s` and also stops Blade's
  decorative header corners and sheen.
- Trees: `treeMotion` eases only the folder's children list (inline
  `!important` height, rows at the bottom, `data-blade-sliding`); Suite
  removes a closed folder's children at once, so an inert, `aria-hidden` copy
  of them (`.blade-tree-ghost`) slides back under the row and is removed. The
  slide starts in the microtask of Suite's redraw, before that frame is
  painted; children loaded on opening continue the slide to their height
  (`treeChildrenMotion`, used by `TreeAdapter`). A tree's stripes are
  recomputed once the slide has settled and crossfade.
- Implementation: `Motion.ts` (`resizeMotion`, `collapseMotion`) pins the
  moving regions with inline `!important` sizes, measures them after the
  change has painted, eases from the old to the new size and releases the
  pins (Suite's own inline sizes stay). Region content reflows during the
  motion like during a resizer drag; a pinned region clips (`overflow:
  clip`), so a field focused while it grows leaves no scroll offset.
  `finishMotion(element)` ends the motions inside an element at once; a
  fitted window (`fitWindow`, also after validation) calls it before it
  measures its form. A motion starting inside a running one (a folder
  opened in a growing folder) ends the enclosing one first.
- Not animated: tabs, windows, popups, panel-mode form sections (their
  window refits to the new height at once) and expanded grid rows.

<a id="application-skins"></a>

### Application skins (optional)

An application may give selected identities (members or its public account) its own appearance (skin)
instead of the factory themes ([FB-0072](feedback.md#fb-0072)). A skin refines
a factory base theme (`blade`, `blade-night`, `light` or `dark`): the shell applies the base
with `setTheme` and marks the root with `data-blade-skin="<id>"`; the
application's stylesheet overrides documented Suite `--dhx-*` variables on that
selector ([custom-theme API](https://docs.dhtmlx.com/suite/themes/custom_theme/)).
Everything keyed to the base keeps working unchanged: the Suite dark variables,
the framework's dark and Blade rules, and the calendar's dark Scheduler skin.
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
/* skins/brand.css — only what differs from the base; Blade lists more variables. */
[data-blade-skin="brand"] {
  --dhx-h-primary: 210; --dhx-s-primary: 16%; --dhx-l-primary: 36%;
  --dhx-background-secondary: #e4e7eb;
  --dhx-s-toolbar-background: #e4e7eb;
  --dhx-s-grid-header-background: #cbd2d9;
}
```

- `Skin(id, label, stylesheet, base = 'light')`: `id` is lowercase
  `[a-z][a-z0-9-]*` and must not be a factory theme (`blade`, `blade-night`,
  `light`, `dark`, `contrast-light`, `contrast-dark`); `label` is localized like other
  texts; `stylesheet` is a `.css` path relative to the page, checked like
  `assets`, with an optional `?v=…` cache key; without one the shell appends the
  stylesheet file's [cache key](toolkit.md#cache-keys). Same-origin paths only, so CSP
  `style-src 'self' 'unsafe-inline'` holds. `base` is `light`, `dark`, `blade` or `blade-night`.
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

### Sign-in customization: logo, stylesheets, content and modules (optional)

Owner decision of 2026-10-30: the sign-in pages (sign-in, e-mail
confirmation, password change) must be customizable and extensible
([FB-0087](feedback.md#fb-0087)). Three layers, each optional, none touching
the sign-in form or its flows:

1. **Look, declarative:** a [logo](#sign-in-logo) (by default the 61ade
   [product logo](brand.md)) and `signInStylesheets`, styled through the
   [supported CSS hooks](#sign-in-css-hooks).
2. **Content, declarative:** a [notice and links](#sign-in-content) below the form.
3. **Extension:** [sign-in modules](#sign-in-modules), project ES modules with a
   restricted API and two slots in the window.

```php
use Blade\Shell\{ApplicationDefinition, Logo, SignIn, SignInLink};

return new ApplicationDefinition(
    // ...
    logo: new Logo('branding/logo.svg', darkImage: 'branding/logo-dark.svg', label: 'Példa admin', placement: 'window'),
    signInStylesheets: ['branding/sign-in.css'],
    signIn: new SignIn('Csak munkatársaknak.', [new SignInLink('Impresszum', '/impressum/'), new SignInLink('Súgó', 'https://help.example.test/')]),
    signInModules: ['branding/sign-in.js'],
);
```

```json
{"application": {"title": "…", "runtime": "…",
  "logo": {"image": "branding/logo.svg", "dark_image": "branding/logo-dark.svg", "label": "Példa admin", "placement": "window"},
  "sign_in_stylesheets": ["branding/sign-in.css"],
  "sign_in": {"notice": "Csak munkatársaknak.", "links": [{"label": "Impresszum", "href": "/impressum/"}]},
  "sign_in_modules": ["branding/sign-in.js"]}}
```

<a id="sign-in-logo"></a>

#### Application logo and sign-in stylesheets

- **Default and opt-out ([FB-0088](feedback.md#fb-0088)):** an application
  without `logo` shows the 61ade product logo ([brand](brand.md)) with
  placement `window`: inline SVG bundled in `admin.js` (no file to deploy),
  both variants in the page with gradient ids unique per copy, accessible name
  `blade` (the visible wordmark; "61ade" would be read as a number), every
  part addressable by class (the [trademark screen](brand.md#splash) uses
  them, whatever the application's `logo`). `new Logo(placement:
  'both')` (JSON `"logo": {"placement": "both"}`) keeps the product logo with
  another placement, `new Logo(label: …)` with another accessible text;
  `Logo::none()` (JSON `"logo": false`) shows no logo anywhere. A declared
  `image` replaces it. Do not restyle the product logo per application; an own
  brand is an own `Logo`.
- **`Logo(image = null, darkImage = null, label = null, placement = 'window')`:**
  `image` and `darkImage` are browser paths checked like `stylesheets`
  (relative to the page or root-absolute, same-origin, `[A-Za-z0-9_-]`
  segments, an optional own `?…` key) with the extension `.svg`, `.png` or
  `.webp`; without an own key each gets its file's
  [cache key](toolkit.md#cache-keys). Anything else fails at definition time
  (`Invalid 61ade logo image`); `darkImage` needs `image`. `label` is the
  accessible text, localized like other texts; it defaults to the application
  `title` (`blade` for the product logo), and a blank one is refused. Same-origin images keep the CSP `img-src 'self' data: blob:`.
- **Application shell:** the last cell of the menu row, after the tenant,
  language and theme selectors on desktop and after the controls hamburger on a
  phone. With public access, Sign in precedes the logo on desktop; on phones the
  public shell hides the logo while offering Sign in ([public access](authentication.md#public-access)).
  It is 24 px high and at most 160 px wide. It is not a menu item and the menu never
  yields to it: the menu, `Menü` and its
  [sibling items](#kompakt-ablakfejléc-és-teljes-mobilmenü) fit exactly as
  without a logo, and the logo shows only when its rendered width fits in the
  room they, the selectors and the [guide](workspaces.md#view-guide) button
  leave by the same measurement. Collapsed controls can leave room for the
  logo on a phone too.
  In compact mode the measurement counts only `Menü`, any visible siblings and
  the selectors: logout is inside `Menü` and reserves no extra width. There is
  no phone breakpoint that hides the logo; with one skin and no language
  selector it fits at 320 px ([FB-0092](feedback.md#fb-0092)). Widening brings
  it back. The width is measured again when an image loads and after a theme
  switch.
- **Signed out, `placement`:** `window` (default) centres it above the form in
  the window (48 px high, at most the window width); `top` puts it at the end
  of the top row as in the shell (no menu there, so it only yields to the
  selectors); `both` shows both. `window` is the default because the window is
  the page's one focus (the modal dims the row behind it) and a window logo
  never competes with the selectors for room on a phone. Anything else fails
  (`Invalid 61ade logo placement`).
- **Themes:** the product logo always switches; with `darkImage`, the light image shows under Blade, light and
  light-based [skins](#application-skins), the dark image under Blade Night, dark and
  dark-based skins (the applied base, `data-dhx-theme="dark"`). A theme switch
  repaints at once through CSS. Without `darkImage` the light image shows in
  every theme.
- **Accessibility:** each copy is one element; the images inside have an empty
  `alt`, so the hidden theme variant is never announced. The named copy has
  `role="img"` and the label as its accessible name; with `both`, the window's
  copy is named and the top row's has `aria-hidden="true"`, so every page
  announces the logo once.
- **Sign-in stylesheets:** `signInStylesheets` (`.css`, same path rules and
  keys) are linked only on the sign-in, e-mail confirmation and
  password-change pages, after `admin.css` (login-only pages load no skins). The
  signed-in shell links `stylesheets` instead and never the sign-in ones; the
  login-only sign-in pages never link `stylesheets` or import `modules`.
  With public access, those assets remain active for the guest background while
  the sign-in window additionally loads its own assets.
- **Bootstrap:** `logo` = `{image?, dark?, label, placement}` (keyed URLs; no
  `image`: the product logo) on every page, absent only with `Logo::none()`;
  `signIn` and `signInModules` (below) while sign-in is requested, absent
  when not declared.

<a id="sign-in-content"></a>

#### Notice and links

`SignIn(notice = null, links = [])` (JSON `application.sign_in`
`{notice, links: [{label, href}]}`) adds a box below the form of all three
windows: the notice as plain text (line breaks kept), then the links as a
labelled list (`nav` named `Hivatkozások`) of ordinary `<a>` elements in the
Suite primary colour, reachable with Tab and opened with Enter, with a
visible focus ring in every theme. The box is its own row below the form's
actions (Suite Standard has no Form `container`); the window grows to hold it,
so the box ends at the window's bottom edge with its own 16 px padding.

- `notice` and each link `label` are catalogue keys translated on the server
  (`Translator::text`) and escaped in the browser; no HTML. A blank notice or
  label, a notice over 500 characters, a label over 80 characters or more
  than six links fails at definition time.
- `href` is a same-origin path (page-relative such as `help/` or
  `../privacy.html`, with `../` only as a prefix, or root-absolute such as
  `/impressum/`, with an optional query and fragment) or an `https://` URL.
  Other schemes (`http:`, `javascript:`, `mailto:`, `data:`), `//host`, `.` or
  `..` segments inside the path, spaces and quotes fail. Links open in the
  same tab.
- The box is not shown on signed-in pages; the shell's own pages stay as they
  are.

#### Header close destination

`SignIn(closeHref: '/public/')` (JSON
`application.sign_in.close_href`) gives the first-step password window and
OAuth-only provider chooser their native header X. Activating it navigates
in the same tab to that trusted application destination; it does not leave
an empty shell behind. Password windows also use this destination for their
native Escape/close action. The OAuth-only backdrop and Escape remain
blocked, so cancellation is explicit through the X. The close icon's
accessible name uses the existing localized **Bezárás** text.

The value follows `SignInLink`'s destination validation: a same-origin path
or an `https://` URL. Omitted/null preserves the existing behavior, including
required sign-in and public-access cancellation that retains the public
view. Confirmation and forced-password-change stages keep their existing
cancellation flows; the destination grants no identity, rights or server
session changes. Closing does not emit an authentication/audit event.

The feature demo declares `/public/` as its close destination. A document
outside the shell can use `/` instead. This is independent of the optional
notice, links and sign-in modules; a close destination alone adds no text
or additional row to the sign-in window.

<a id="sign-in-modules"></a>

#### Sign-in modules (extension point)

`signInModules` (JSON `application.sign_in_modules`) are project ES modules
(`.js`/`.mjs`, the path rules and [cache keys](toolkit.md#cache-keys) of
`modules`) loaded only while one of the three sign-in windows is mounted;
signed-in pages never load them. Login-only pages load no `modules`; a public
sign-in keeps its guest `Application` and modules behind the modal. After the window is
mounted the shell imports them in parallel and calls each default export in
declaration order with a frozen `SignInApplication` (types in
`src/api/sign-in.ts`, part of `admin.d.ts`):

| Member | Meaning |
| --- | --- |
| `apiVersion` | `1`, as `Application.apiVersion`. |
| `page` | `sign-in`, `confirmation` or `password-change` (the `data-blade-page` value). |
| `i18n.t(key, params)`, `i18n.locale()` | The page's catalog (framework and project texts); plain text. |
| `theme.current()`, `theme.onChange(listener, {signal})` | The applied factory theme; the listener runs after each switch until `signal` aborts or the sign-in window closes. |
| `dhx` | The DHTMLX Suite namespace the shell uses. |
| `slots.header`, `slots.footer` | Empty elements in the window above and below the form (`[data-blade-slot]`); the window refits when their content changes size. |

```js
// public/branding/sign-in.js: the feature demo's module.
/** @type {import("@61ade/admin").SignInModule} */
export default (app) => {
  const line = document.createElement("p");
  line.className = "demo-sign-in-footer";
  const paint = (theme) => { line.textContent = app.i18n.t("Demó bejelentkezési modul · téma: {theme}", { theme }); };
  paint(app.theme.current());
  app.theme.onChange(paint);
  app.slots.footer.append(line);
};
```

- **Not in the API:** no `server`, no identity, no registries, no
  preferences, never the CSRF token or form values. Each page kind is its own
  page load (the forms post and redirect), so slots start empty on every page
  and a module runs again on each one.
- **Failure isolation:** a failed import, a missing default export, a throw, a
  rejection or more than 5 s (per import and per call) is reported on the
  console (`61ade: sign-in module … failed`) and skipped. The window and form
  are mounted before any module runs, so the sign-in always works; there is no
  toast before sign-in. A module cannot be stopped once it runs (an endless
  loop still blocks the page), as with `modules`.
- **Trust model:** sign-in modules are trusted project code, like `modules`,
  and they run in the admin origin on a page that holds the password field.
  The restricted API is a contract, not isolation: same-origin code can reach
  the DOM. Never load untrusted or agent-written code here. Untrusted code runs
  only in [`SandboxFrame`](toolkit.md#sandbox-protocol), and not on the sign-in
  pages. CSP `script-src 'self'` keeps the modules same-origin.

<a id="sign-in-css-hooks"></a>

#### Supported CSS hooks

Both kinds of project stylesheet (`stylesheets` and `signInStylesheets`) may
rely on these hooks only:

| Hook | Meaning |
| --- | --- |
| `data-blade-page` on `<html>` | Page kind, set by the server before any script runs: `sign-in`, `confirmation` (e-mail code), `password-change` (forced temporary password replacement), `shell` (signed in). |
| `data-dhx-theme` on `<html>` | Applied Suite theme (`blade`, `light`, `dark`; Blade Night applies `dark`), set by the shell; read it, never set it. |
| `data-blade-skin` on `<html>` | Active [skin](#application-skins) id (signed in, with skins only). |
| `.blade-logo`, `.blade-logo__image` | A logo copy and its images. |
| `--blade-logo-height` (24px), `--blade-logo-max-width` (160px) | Size of the top-row logo; the row measures the rendered logo. |
| `--blade-sign-in-logo-height` (48px) | Height of the logo in the sign-in windows. |
| `.blade-sign-in-info` | The box of the notice and links. |
| `[data-blade-slot="header"]`, `[data-blade-slot="footer"]` | The sign-in modules' slots; style what a module puts in them by its own classes. |
| Suite `--dhx-*` variables | The [custom-theme API](https://docs.dhtmlx.com/suite/themes/custom_theme/), as for skins. |

Everything else (framework classes such as `.blade-navigation-row` or
`.blade-auth-window`, Suite `.dhx_*` classes, the DOM structure) is not a
supported contract and may change in any release. A rule on
`[data-blade-page="…"]` sits on the same element as the theme variables, so
being linked later it wins over every theme's value; scope a value that must
differ per theme with `[data-dhx-theme="dark"]` as well.

```css
/* branding/sign-in.css (the feature demo's): only supported hooks and the module's own class. */
[data-blade-page="sign-in"], [data-blade-page="confirmation"], [data-blade-page="password-change"] {
  --blade-sign-in-logo-height: 40px;
  --dhx-h-primary: 160; /* hue only: lightness and saturation stay the theme's */
}
.demo-sign-in-footer { margin: 0; text-align: center; font-size: 12px; color: var(--dhx-font-color-secondary); }
```

The feature demo uses every layer: the product logo with `placement: 'both'`,
this stylesheet, a notice and the module above
([demos](demos.md#teljes-feature-demó-)); the starter admin and the tenant
demo declare none of them and show the product logo by default. `toolkit.php` renders every page
kind (kind, links, keys, bootstrap keys per page, rejected paths, hrefs,
texts and placements), `configuration.php` the JSON keys and `contracts.php`
the demos' declarations; `sign-in-branding.spec.cjs` covers the windows,
placement, notice, the absence of a mailbox link, the module's slot and a failing
module, themes, a dark-based skin, the top row, phone width and the starter
admin.

<a id="egységes-alsó-információs-sáv"></a>

## Unified lower information bar

The top row contains the menu/theme selector and the optional
[application logo](#sign-in-logo) at its end, without a separate application
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

- **Only `#view=`:** any other fragment, such as the removed
  `#feature=<resource>`, names no view and gives the empty workspace; it is
  left in the address.
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
`node tests/shell/toolkit-kernel.mjs` (address parsing, registry names, the
event bus). Its last recorded limitation is
a stale layout double lacking `getRootNode()` (FB-0050). The managed
`preferences.spec.cjs` checks view URLs through login/reload/history, that a
`#feature=` address opens no view after a sign-in, persisted column width,
sort, view and panel width, and broken storage on the feature demo's Tasks
view.
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
registries `kinds`, `presentations`, `fieldTypes`, `commands`
(`src/app/registries.ts`). Built-in names have no dot, project names need one;
a duplicate throws unless `{replace: true}`.

- **Built-in kinds** `list`, `files`, `diagram`, `calendar` are registered in
  `src/app/builtins.ts` before any module; the shell opens every view only
  through `app.kinds.get(view.kind)`. The bootstrap `views` carry the shared
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
  Login-only sign-in pages create no `Application`; they run only the
  [sign-in modules](#sign-in-modules) with their restricted `SignInApplication`.
  A public sign-in keeps its guest `Application`, views and modules behind the
  modal; authentication does not grant them member rights before completion.
- **Stylesheets:** `application.stylesheets` are `<link>`ed on application
  pages (signed in or explicitly public) after `admin.css` and the skins, keyed like the modules
  ([module loading](toolkit.md#module-loading)); with
  [skins](#application-skins) they are the supported way to add project CSS.
  Login-only sign-in pages link `signInStylesheets` instead; a public sign-in
  loads these in addition to its background styles and removes them on Cancel
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

## Main-menu tabs

The entire 40 px navigation row has one presentation in every factory theme
and application skin: native DHTMLX Menu items and Toolbar controls (tenant,
guide, language and theme) are flat, full-height elements with 12 px horizontal
padding and an 8 px icon-to-label gap. The controls have a content-sized Layout
cell, with 8 px on either side of each separator; they no longer reserve
fixed 180/120/130/145 px slots. Menu fitting measures labels with the native
menu font and uses the rendered selector widths. Long selector labels truncate
at a 240 px button width; their native popup keeps the complete choices.
Below 768 px (or when the control group cannot fit), the complete right-hand
group moves into one icon-only `Beállítások` hamburger menu: tenant, guide,
language and theme remain native menu entries with the same actions. Widening
restores the controls and their current state. Toolbar submenus cascade to the
right when their measured width fits. Otherwise they replace the ancestor
popups at the toolbar toggle, with a native `Vissza` item and ArrowLeft to
return. The same rule applies to deeper levels and desktop right-edge controls.
Escape closes the popup and returns focus to its opener. This also applies
before sign-in.

Idle controls have no background, gradient, rounding or shadow. Hover tints
all enabled elements with 8 % of `--dhx-color-primary`; an open popup uses
14 %. Keyboard focus has an inset outline. Blade/Blade Night retain the row's
chrome surface, with the same flat controls and state treatment as light/dark
and application skins. Other toolbars keep their normal widget appearance.

Only the section of the open view has a persistent marker: its top-level item
(or, in the compact desktop menu, the sibling of the open view) gets the
`blade-menu-current` class, showing a 3 px accent underline and a
primary-coloured icon. A record page inherits the first offered non-record
view with a menu entry (not a [`menu: false`](toolkit.md#menu-less-views) list) whose `resource` equals its `record` resource. If the record view declares
`group`, only source views in that group qualify; without a matching source,
the declared group itself carries the marker. Several matching source views
use their declaration order. Without an offered source or group there is no
marker. For example, `demo.playlist-editor` (`record: signage_playlists`)
inherits `Lejátszási listák` and its `Digitális kijelző` group, including on a
direct link, reload and Back/Forward. The same source supplies the compact
desktop siblings; a group-only match supplies its children without selecting
one. A record opened in a window keeps the underlying page's menu context.
Selectors have only transient hover, focus and open
states. The marker is separate from the native popup's `active` state.
Submenus retain native compact list layout. Separators are faint 1 px rules
following the theme border colour. No consumer configuration; rebuild/prepare
assets. Main navigation stays in its separate `Menü`; no selector competes with it
for phone-row space.
Verified by the managed-demo shell/skin checks and focused desktop/phone
geometry and state comparisons. FB-0100 replaced the FB-0025 bordered buttons;
FB-0122 unifies the full row and removes the separate Blade folder-tab treatment.

<a id="kompakt-ablakfejléc-és-teljes-mobilmenü"></a>

## Compact window header and complete mobile menu

Native Window headers are 40 px high, with 16 px title and 32 px close button.
Framework padding is 4 px vertical/12 px horizontal instead of factory
28 px top/20 px bottom. Content sizing measures the actual header. Its 1 px
bottom line uses `--dhx-border-color` inside the 40 px height (FB-0031).
The secondary background is light gray in light theme and lighter dark in dark
theme; Blade and Blade Night keep their glossy chrome gradient.

Compact navigation puts all branches, logout and the native separator under
`Menü`. Desktop width restores the full top menu, with logout aligned to its right edge
before the selector controls using a native Menu spacer. ACL and logout POST
behavior stay consistent; no consumer configuration. FB-0028.

When the top menu does not fit a desktop-width (≥ 768 px) row and collapses into
`Menü`, the open feature's siblings follow it after a faint separator: the
items of the same menu branch (e.g. the other views of its `group`), with the
open one marked as the [current section](#elkülönülő-főmenügombok). They are the same entries as
inside `Menü`, so ACL filtering is unchanged. Top-level features have no
context, phone width shows only `Menü`, and the siblings are omitted when they
would not fit by the same width estimate. Navigation updates them.
`browser.spec.cjs` checks it on the signage group; shared test steps prefer a
visible sibling button (`openMenu` in `feature-demo.cjs`). FB-0062.

<a id="opcionális-nyelvválasztó"></a>

## Optional language selector

`i18n.selector` adds a native language selector before the theme selector,
inside `Beállítások` on mobile. When a view has a [guide](workspaces.md#view-guide), the
`Útmutató` button sits left of it (in the same controls menu below 768 px). A Toolbar attached to native in-window Layout provides
language switching inside login/confirmation modals. Localization remains active
without a selector; see [i18n](i18n.md) for configuration and persistence.

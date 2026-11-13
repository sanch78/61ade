# 61ade usage

## Project name and development environment

61ade is the framework project at /space/share/libs/61ade. Development and testing
use only https://demo.61ade.com/ (starter admin /admin/), directly from this
checkout. There is no production, deployment, post-deployment testing or project
backup workflow. Frontend edits require build/local asset preparation;
PHP/configuration edits are consumed directly. See [development](development.md#development-environment),
[FB-0049](feedback.md#fb-0049) and [FB-0051](feedback.md#fb-0051).

Namespace Blade, env BLADE_*, technical identifiers blade; packages
sanch78/61ade and @61ade/admin. [Renaming](renaming.md) explains breaking interfaces,
explicit SQLite migration, prerequisites/examples/limits/checks (FB-0050).
Consumers use this checkout as a shared library; see
[shared-library consumption](development.md#shared-library-consumption).
Consumer environments have separate contracts.

This maintained guide serves integrators and admin testers. It describes actual
usage; [concept](concept.md) describes targets and [plan](development-plan.md)
describes order.

<a id="jelenlegi-állapot"></a>

## Current status

The 2026-10-16 foundation includes registered execution, declarative forms/grids,
SQL object scopes, field rights, UI/API separation, scoped tokens and transactional
audit. Later built-in admin work supersedes the earlier consumer-only useradmin
model; see [admin](admin.md), [ACL](access-and-actions.md) and [shell](shell.md).
[Workspaces](workspaces.md) support configurable filter/form/grid, integrated
column header filters, dynamic lists, server sorting and polling/WebSocket live
data over [one channel per tab](workspaces.md#live-channel) that every list and
sub-view shares; singleton details are direct forms.
Cards place their child-list button over the cover's upper-right corner, keeping
the same height as cards without children. Cards without a cover keep the
full-width footer button. Tiles overlay the same button across the cover's bottom
edge ([sub-views](workspaces.md#sub-views)).
Sections inside cards and details have equal heights within each row, with
top-aligned content. A project's stylesheet can configure their column widths
and ratios ([section columns](workspaces.md#card-group-columns)); narrow
records stack them through CSS alone.
The full desktop menu aligns logout to the right, before the selectors; compact
navigation keeps it inside Menü ([shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü)).
No upper application-title header; one lower bar has user left, application/version
right. Session idle timeout and persistent cookie lifetime are [configurable](authentication.md#session-lifetime), with unchanged 30-minute/browser-session defaults.
Three security options are opt-in, with unchanged defaults: `sameSite: 'Strict'`
(JSON `session.same_site`) for the session and remember cookies
([cookie SameSite](authentication.md#cookie-samesite); a definition combining
`Strict` and OAuth is rejected at startup; other cross-site arrivals come
without the cookies), `bindSessionToClientAddress` (JSON `session.bind_to_client_address`)
to end a signed-in session used from another address
([binding](authentication.md#client-address-binding)), and `HttpEntrypoint::run`'s
`$trustProxy` list of proxy networks ([trusted proxies](shell.md#trusted-proxies)).
An ended session signs the page out on its next request
([shell](shell.md#ended-session)). Blade (default), Blade Night, light and dark use DHTMLX setTheme; Blade is a
custom Suite 9 theme ([appearance](shell.md#megjelenési-mód)). Synthetic and consumer integration evidence exists.
Applications whose sign-in is entered from a separate public document may
set `SignIn(closeHref: '/public/')` (JSON `application.sign_in.close_href`)
to return there from the first-step native header X; defaults are unchanged
([sign-in content](shell.md#sign-in-content)).
Collapsed column headers in Blade and Blade Night use a full-height glossy
strip with the vertical caption inside, preserving the original width
([theme details](shell.md#61ade-character)). In Blade and Blade Night,
accordion sections, accordion form sections, collapsable panels and tree folders ease to
their new size on open and close (`--blade-motion-duration`, off under
reduced motion; [theme motion](shell.md#theme-motion)).

Optional [multi-tenancy](tenancy.md) (organizations) has its stage 1:
tenant-scoped SQL resources and lookups, memberships, switching, tenant-bound
API keys and audit. Tenant-scoped files remain open. A reliable
external-side-effect outbox, complex ABAC, export and complete package
distribution remain open. This is not full M1–M7 completion.

<a id="kötelező-fejlesztési-irány"></a>

## Mandatory development direction

61ade = ADE v2. General capability first in framework, then consumer declarations/
business logic. No parallel application admin implementation for missing features.
61ade's own UI is framework DHTMLX. Framework-first covers the shared
infrastructure only: a project's domain (its data, files, business logic and
domain UI with its own browser code) belongs to the project, and a missing
general capability is requested from 61ade without blocking the project; see
[project rules](development.md#mandatory-framework-development-rules),
[ADR-0004](decisions/0004-project-domain-freedom.md) and
[ADR-0002](decisions/0002-framework-first.md).
61ade is a toolkit ([ADR-0005](decisions/0005-toolkit.md)): where
declarations are not enough, a project writes its own browser modules with the
public API ([toolkit and project modules](#toolkit-and-project-modules)).

<a id="elfogadott-termékirány--2026-10-21"></a>

## Accepted product direction — 2026-10-21

[Product direction](product-direction.md) is canonical for R1–R12, verified status
and open questions; [ADR-0003](decisions/0003-product-direction.md).

- Need → framework gap → smallest reusable extension → synthetic demo/relevant checks → guide → consumer integration. Consumer releases follow their own contracts; exhaustive catalogs are not prerequisites.
- DHTMLX with framework adapters/extensions. No external framework benchmark; [FB-0037](feedback.md#fb-0037--ext-js-referencia-visszavonása-dhtmlx-alap-igényvezérelt-képességkör) withdrew the Ext JS reference.
- Every new capability is localized/themed, enters the feature demo and [event catalog](product-direction.md#4-eseménynapló-lefedési-katalógus).
- Modular JSON/named handlers, never eval/executable strings in configuration or the admin origin; [configuration](configuration.md). Untrusted code runs only in the toolkit's sandboxed frame ([O7](toolkit.md#resolved-decisions)).
- Generated catalogs never grant rights; API exposure/token scope only restrict.

Implemented [users/permissions/API keys](admin.md) replace FB-0004's application-only
admin decision. [AuthHandler OAuth](authentication.md#oauth-belépés-authhandler)
exists without completed real Google/Facebook acceptance.
Still planned: log admin, password recovery, language-neutral schema,
PostgreSQL/JSON stores and categorized logging. The [feature demo](demos.md)
grows continuously but is not complete coverage. MySQL connection/SQLite demos
exist; [storage guarantees](product-direction.md#3-tárolási-határ-és-szükséges-garanciák)
need detailed qualification. Product direction contains an English implementation prompt.

<a id="már-alkalmazható-módszertan"></a>

## Applicable methodology

- Framework source and consumer business source stay in separate repositories; dependency is application → 61ade.
- Consumers configure features with their own services/policies; no consumer-specific tables/rules in framework.
- Check Git state in /space/share/libs/61ade; consumer editor links need independent target verification.
- See [package boundaries](repository-layout.md) and [development prerequisites](development.md).

<a id="üzleti-konfiguráció-és-kód-határa"></a>

### Business configuration and code boundary

Consumers assemble ApplicationDefinition and concrete schema mappings,
Field/SqlResource/Action/views, initial roles/rights and every business condition.
Declarative settings use modular JSON; host values use env; business code remains
separate PHP handlers. [Configuration](configuration.md) defines loading/sections/
named bindings; direct PHP definitions remain supported.

guard, normalize, afterSave and registered action handlers are extension points.
As complexity grows, consumers extract modules/policies/services; 61ade never
imports application classes.

For synthetic notes, fields and “closed notes cannot be edited” are consumer
rules. Forms, validation, ACL, transaction, audit, lists and live refresh are
framework responsibilities. Callbacks run within the common executor rather
than parallel endpoints/saving. Register UI/API actions; collection reads use
authorized list sources. Transactional outbox for external effects is not implemented.

Framework source/tools/fixtures must not hardcode consumer paths. A runner may
inject an application definition, autoloader or PHP binary: configuration, not
a reverse dependency. Independent demos prove reuse. FB-0007.

<a id="toolkit-and-project-modules"></a>

## Toolkit and project modules

The [toolkit reference](toolkit.md) is the canonical public contract; this is
the route through it. 61ade owns the `Application` object, its services,
components and registries; the project owns its modules, the names it
registers (with a dot, `project.name`) and its domain UI
([ownership](toolkit.md#purpose-scope-and-ownership)). Consumer agents
follow this route through the
[61ade-application skill](../.agents/skills/61ade-application/SKILL.md).

1. **Declare first.** Resources, views, record views (`record: <resource>`),
   activation maps with `view:<id>` targets and client `commands` are PHP or
   JSON declarations ([configuration](configuration.md),
   [views](toolkit.md#views), [activation map](toolkit.md#activation-map)).
2. **Add a module** where the declaration is not enough:
   `ApplicationDefinition` `modules`/`stylesheets` (JSON
   `application.modules/stylesheets`) list same-origin ES modules and CSS;
   the application shell (signed in or explicitly public) imports each one and calls its default export with
   `app` before routing ([module loading](toolkit.md#module-loading)).
3. **Register and compose:** view kinds, column presentations, field types
   and client commands ([registries](toolkit.md#registries)); `ListView`,
   `RecordForm`, `SettingsForm`, `RecordDetails`, `Tree`, `CommandBar`, `FileManager`, `FilePicker`,
   `Calendar`, `DiagramEditor`, `MediaPlayer`, `PageLayout`, `Tabs` and `Accordion` in a Suite Layout from
   `app.dhx` ([components](toolkit.md#components),
   [Layout recipe](toolkit.md#layout-recipe)); `MediaPlayer` optionally shows an
   audio frequency spectrum, colours the original native audio timeline for
   contrast where supported, and exposes synchronized repeat state
   ([media options](toolkit.md#mediaplayer)); untrusted code only in
   `SandboxFrame` ([sandbox](toolkit.md#sandbox-protocol)).
4. **Build** TypeScript against `admin.d.ts` with types-only imports
   ([recipe](toolkit.md#typescript-recipe)) and deploy the sandbox files when
   used ([packaging](toolkit.md#packaging)).

A page that changes what a panel shows destroys the component there and
mounts a new one into the same cell, tab, region or window right away, as
often as needed; a cell that showed markup takes a component too
([components](toolkit.md#components), [FB-0161](feedback.md#fb-0161)).

A panel following a list's active record uses `list.on("target", ({view, row,
rows}) => …)` and `list.target()`: these include selected expanded rows and
the foremost child window, including on a phone. The main cursor remains
available through `select` / `selected()` ([ListView](toolkit.md#listview)).

A page built around a hierarchy mounts `app.components.Tree` over a list view
with a sub-view on itself (`menu: false` when it has no page of its own) and
drives its other panels from the tree's `select`; `activate` is Enter or a
double-click, `select(id)` and `refresh(id?)` follow changes made elsewhere,
and `id` keeps the expanded nodes and the selection. Keys: arrows, Home and
End move, Space selects, Enter selects and activates
([Tree](toolkit.md#tree), [FB-0158](feedback.md#fb-0158); demo:
[key browser](demos.md#d8-key-browser)). `expand: n` opens `n` levels while
the user has not changed the expansion (a stored one wins), `expandAll()` and
`collapseAll()` open or close the whole tree within 10 levels and 2000 loaded
nodes, and `expandControl: true` offers them as one icon button on the right
of the tree's command row, above or (`{placement: "bottom"}`) below the tree
([FB-0191](feedback.md#fb-0191))
([expansion](toolkit.md#tree-expansion), [FB-0168](feedback.md#fb-0168)).
Tree rows are as high as grid rows, alternate their background and show
dotted lines with framed +/- boxes (the selected row is the grid's cursor row); `striped: false` and `lines: false` switch
the stripes or the lines off, for tree navigation too
([presentation](toolkit.md#tree-presentation), [FB-0193](feedback.md#fb-0193)). A list-wide mode switch in a list's
own toolbar is a client command with `type: "toggle"`: its state is kept per
user and view id in `app.preferences.scope(<command name>)`, which the host
reads before it mounts the list, and the list reports `toggle` so the host
mounts the list of the other scope ([toggle command](toolkit.md#registries),
[FB-0159](feedback.md#fb-0159)). Such a page gives every list of the view one
`preferencesKey` so they share their view choices, `pinned: true` keeps the
toggle in view in a narrow panel, `createDefaults` presets the field a
computed scope implies in the built-in create, a helper field used only for
scoping is declared `scopeOnly: true` (JSON `scope_only`) so no list surface
offers it, and a raw value the details need not show is `column.details:
false` ([ListView](toolkit.md#listview), [field presentation](field-presentation.md#scope-only),
[FB-0162](feedback.md#fb-0162)–[FB-0166](feedback.md#fb-0166)). A view whose records wait for someone
declares `attention` (`filters`, `tone`): its menu entry, its branch and
`Menü` show a live count ([menu attention](shell.md#menu-attention),
[FB-0160](feedback.md#fb-0160)).

Every server read and write is still a registered, ACL-checked action; a
module gains no right. A failing module is reported (toast, `module:error`,
console) and skipped, and the shell still starts. The
[feature demo](demos.md#toolkit-consumer) is the reference consumer
([worked examples](toolkit.md#worked-examples)); the starter admin and the
tenant demo stay declarative. Checks: the toolkit's
[verification list](toolkit.md#verification). Limits, including the owner
decisions of gate G4, are in [toolkit limits](toolkit.md#limits) and
[pitfalls](toolkit.md#pitfalls); feedback [FB-0081](feedback.md#fb-0081).

<a id="minden-elkészülő-képesség-dokumentációs-szerkezete"></a>

## Documentation structure for every completed capability

1. Purpose/scope, audience and framework/consumer ownership.
2. Prerequisites: framework/vendor version, edition, configuration and rights.
3. Integration steps: paths/registration/input/output and minimal synthetic example.
4. Expected UI/API behavior, failures, denials and edge cases.
5. Verification: how to try it and evidence of correctness.
6. Limits/changes: unsupported options, versions, known defects and upgrades.
7. Related feedback/decision links.

Split larger topics into linked guides, with one canonical active rule.
API reference alone does not replace step-by-step examples.

<a id="fokozatosan-kitöltendő-témák"></a>

## Topics to fill progressively

| Topic | When guidance becomes applicable |
| --- | --- |
| Install/configure/start | M1 runtime |
| Login/organizations/roles/policies | Login, roles and policies: [admin](admin.md), [ACL](access-and-actions.md); tenants/organizations: [tenancy](tenancy.md) (stage 1) |
| Features/query/action/validation/REST | Complete M3 flow |
| Shell/grid/form/tree/DataView/views | Per M4 adapter |
| Scheduler/Gantt/timezones/complex actions | Per supported M5 edition |
| Files/export/import/audit/jobs | Per M6 capability |
| Package upgrades/compatibility/operations | M7 package distribution |

<a id="felhasználói-tesztelésből-származó-tudás"></a>

## Knowledge from user testing

Record feedback in [feedback](feedback.md) within the same session. Incorporate
accepted general rules here or in topic guides; unimplemented behavior remains
clearly planned. This preserves testing instructions, limitations and established
solutions for future consumers.

Clear owner instructions need no repeated approval merely to record them.
If general framework versus consumer-specific scope is unclear, record an open
question and clarify interpretation.

<a id="beépített-felhasználóadmin"></a>

## Built-in user administration

[Admin](admin.md) A1 owns account-table views, creation with generated 72-hour
temporary password/forced first-login change and name/e-mail updates.
Disabled, OAuth, e-mail confirmation and default language are form/grid fields.
No separate disable/enable button where a field already manages the value
(FB-0044). E-mail is login identifier.

A2 adds roles/memberships/catalog-based rules; catalog alone gives no rights
and protected roles retain active membership. A3 adds [API keys](admin.md#api-kulcsok-a3)
with once-only secret, catalog choices and irreversible revocation checkbox.
JSON admin/PHP Administration::register enables the module.
Permissions::grantAdministration explicitly seeds the first admin.
Log administration remains open.

General UI rule: use form fields and, where sensible, grid checkbox/select editing
for managed values rather than single-purpose toggle actions.

<a id="belépési-módok-jelszó-e-mailes-kétfaktor-oauth"></a>

## Login modes: password, e-mail code, OAuth

Applications may also enable [public access](authentication.md#public-access)
with `publicIdentity` / JSON `application.public_identity`: the id of a dedicated
active account with explicit guest UI rights. The same shell works without login;
Sign in stays before the rightmost logo on desktop and beside the controls
hamburger on phones, where the public shell hides the logo.
The sign-in modal opens over the existing guest view; its X, Escape and Cancel
close it and keep that view and its input without reloading before a challenge.
Closing a pending public code/password-change window cancels through the server
and reloads public access.
An expired guest session renews public access; it does not require login. A
reload prompt protects unsaved input and never asks a guest to authenticate.
Login switches to the member's rights; logout returns to the public UI. The
[public demo](demos.md#public-access-demo) demonstrates this separately; the other
demos keep their login requirement.

The application supplies no demo credentials to the login fields. Browser
password managers can fill saved credentials; remove the site's saved entry
there to stop that filling. After a failed submission the identifier is retained
([login flow](authentication.md#belépési-folyamat)).

[Authentication](authentication.md) supports password, password plus per-user code,
and AuthHandler's external-account overlay. The 61ade window hides while that
overlay is open and returns with its entered values when the overlay closes.
Listed providers appear without keys
but give setup feedback until configured. Only existing OAuth-enabled accounts
can enter, without password. `oauth.exclusive` makes the overlay the only
sign-in, carrying the declared logo and content
([OAuth-only](authentication.md#oauth-only-sign-in)). Optional remember lasts 90 days.
Framework mail layout supports project text/color; delivery uses one argument-list
command without shell, such as the Infra mail helper. Explicit schema installation is required.

Missing runtime, `sessions/` and `login/` directories use `0770`, preserving
inherited default ACL grants for owner cleanup; session and password-attempt
files stay `0600`. See [runtime permissions](authentication.md#runtime-permissions)
for trusted group/ACL prerequisites and existing-directory limits.

<a id="demók"></a>

## Demos

[Feature demo](demos.md) at / presents demonstrable capabilities; [starter admin](demos.md#alapadmin-admin)
at /admin/ presents exactly the mandatory initial set. Add new demonstrable
capabilities to feature demo/table in the same batch.
Demo mail is saved to /mailbox/, never sent. Real Google/Facebook buttons need
provider settings; starting a provider is not completed login.

<a id="figyelmeztető-és-megerősítő-párbeszédablakok"></a>

## Warning and confirmation dialogs

All messages/confirmations use [shared dialogs](dialogs.md):
neutral/warning/danger × acknowledgment/confirmation.
Frontend acknowledge/requestConfirmation/showDialog come from
MessageDialog.ts; actions use confirm, while successful action results and reveal
secrets use a non-blocking toast. Destructive dialogs
focus Cancel; Enter activates only focused button; Escape always cancels confirmation.
Consumers cannot create their own modal. Demo: Tasks → Párbeszéd actions.
General rule: every framework `Window` is `modal: true`; while one is open the main layout behind the DHTMLX overlay is not operable. The one exception is the [view guide](workspaces.md#view-guide) (M34); a project's own `app.ui.window` may pass `modal: false`. Escape closes either kind while the focus is inside it ([FB-0155](feedback.md#fb-0155)), and the topmost modal window also while a non-modal one is open ([FB-0199](feedback.md#fb-0199)).
Actions without input fields run directly and acknowledge success with a
non-blocking gritter/toast; a dialog is reserved for a justified confirmation
or an error.

<a id="jelzők-és-kapcsolt-objektummezők"></a>

## Flags and related object fields

[Field presentation](field-presentation.md) covers native checkboxes, meaningful
states, bounded widths, one-to-one related storage saved with the main form,
and multiselect.

<a id="virtuális-fájlkezelő"></a>

## Virtual file manager

[Files](files.md) provides a two-panel, Norton Commander-style file manager over
the framework table `blade_files`: `FileStorage`, `FileManagerDefinition`
(mounts, upload allowlist, size and file count, duplicate policy, separate
text-editor limit, depth, required `contentRoot`, `thumbnails`), registered
`tree`, `list`, `create_directory`, `upload`, `copy`, `move`, `text_get`,
`text_save`, `content_get`, `content_stream` and `thumbnail_get` actions with
per-mount ACL, multipart upload transport, the DHTMLX Tree adapter and the
shared conflict dialog. Contents live in a content-addressed disk store
(`ContentStore`), with probed media metadata and 320 px WebP thumbnails made by
the post-response `TaskQueue`; `DownloadStream` and GET-capable actions
(`Action::$get`, frontend `actionUrl()`) stream viewer content with HTTP Range
under the same ACL and audit. A consumer's own action handler can return a
`DownloadStream` of any MIME type (for example its own audio assets) without
the file manager; the file manager's own viewer, the toolkit
[`MediaPlayer`](toolkit.md#mediaplayer), streams PNG, JPEG, MP4, WebM, MP3,
WAV and M4A. Install it explicitly in setup, register it in
the application definition and grant rules (`content_stream`/`thumbnail_get`
are separate rights). Earlier BLOB databases upgrade with the explicit,
verified migration 0002. U4 adds paged server-sorted listings with tiles, search, type filter and
sort, a configurable `deletePolicy` (`archive`, the recommendation, hides
records from every framework read; `delete` removes them), `delete`,
`rename`, GET `download` and streamed ZIP (`zip_prepare`/`zip_get`), and
drop/paste onto panels. Per-entry permissions are not implemented
([FB-0058](feedback.md#fb-0058), [FB-0063](feedback.md#fb-0063)).

<a id="feltöltő"></a>

The framework [uploader](uploader.md) is the only upload flow: an action
declares a typed `UploadPolicy` (`Action::$upload`), the `__upload` transfer
protocol (preflight, resumable chunks bound to their owner, finish through the
executor) enforces it on the server, and the browser opens the shared
`uploads` window (drop, folders, paste, three parallel transfers, per-file
conflict decision with "apply to all", background upload with a shell
indicator, resume after reload, `upload:*` events). Do not build another
upload dialog.

An upload-enabled [`file` form field](workspaces.md#file-field) also accepts
one local file through `Fájl megadása…`, paste (Ctrl+V / Cmd+V) or drop, with
a proportional preview and background transfer. It opens neither the full
uploader nor a stored-file picker. Saving waits for the upload to settle; the form
stores the resulting file id. Use `accept: ["image"]` for an image-only field.
When the project's domain owns its files (its own store and rows, tenant
rules), declare a [stored file field](workspaces.md#stored-file-field)
(`file: {upload, get?, accept}`) instead of a file manager mount. The project's
upload action stores the bytes and returns a token. The record action receives
the token with the other values and commits the file in the same save, so no
two-step "save, then upload" flow and no half-finished record remain.

Lists gain [media columns, tiles, row height and search](workspaces.md#media-tiles):
`column.media` renders file thumbnails with a type-stating accessible name,
filters by MIME class, `tiles`/`tileMinWidth` add a tile mode, `rowHeight`
drives all paging math, and a declared `search` adds a server-side text
search box. A text field of static image file names shows as an image with
`column.presentation: "image"` and `image_base`; the images are the
application's own static files, outside every ACL. Static image presentations
offer no filename filter in the header or filter form; programmatic list filters
remain available ([header filters](workspaces.md#integrated-grid-header-filters)).

A list of long text (notes, comments, messages) declares `modes: ['cards']`
and `cardColumns: 1` (JSON `view.modes`, `view.card_columns`; a
`ListView` takes the same options and they win): no `Nézet` menu, one card
per row across the panel, a 4-line text preview (`column.cardLines` for
another count) with the whole text in
`Adatok` ([cards only and full-width cards](workspaces.md#cards-only-and-full-width-cards),
[FB-0169](feedback.md#fb-0169)). A full-width card of many short fields
declares field sections: the [groups](workspaces.md#card-groups) then sit side
by side ([FB-0177](feedback.md#fb-0177)).

A form window fits its content up to 800 px (`app.ui.window` `maxHeight`
for more); a taller form scrolls between the window header and its action
row, which stays at the window's lower edge
([window sizing](workspaces.md#window-sizing)). A Tree's `expandControl` is
two icon buttons ([Tree expansion](toolkit.md#tree-expansion)).

A project page shows tabbed panels with [`app.components.Tabs`](toolkit.md#tabs) or a declared `tabs` branch of
its [`PageLayout`](toolkit.md#pagelayout) tree (folder tabs in the panel's header), with a `guard` for unsaved
input and the last open tab kept per user.

A tall region is divided into collapsible sections with [`app.components.Accordion`](toolkit.md#accordion) or a
declared `accordion` branch of the [`PageLayout`](toolkit.md#pagelayout) tree: one section open at a time, or several
with `multiple` (the open ones share the height), each section a mount target, the open sections kept per user. A
`RecordForm` is one form: put it in one section, or use one form per section.

A list that only makes sense inside a project page (several scoped lists of a record page) is declared with
[`menu: false`](toolkit.md#menu-less-views) (PHP `Registry::view`/`SqlResource::register`, JSON `view.menu`): it is
offered like any list and mounted with `ListView`, but has no menu entry, and its `#view=` address and `navigate` are
refused. A record view, a singleton or a view with a guide cannot set it.
Such a list may also declare its [first sort](workspaces.md#list-sort)
(`sort`, JSON `view.sort`, for example oldest first), which applies until
the user picks one; a `textarea` field shows a [4-line
preview](workspaces.md#long-text-in-cards) on its cards.

A page shows or hides a `collapsable` region itself with
[`PageLayout.collapse(id)` / `expand(id)`](toolkit.md#pagelayout-collapse),
for a command bar toggle or for a phone that collapses a region while one
tab is shown; `collapse {id, collapsed}` follows every change. Only the
user's own header click is kept.

The commands of a selected item that need not stay visible go into one
*more actions* button: a [`menu` item](toolkit.md#commandbar-menu) of the
`CommandBar` (1–12 buttons and separators, each reporting `click`; a
submenu of `Műveletek` when the bar is narrow).

A page's own [`app.ui.window`](toolkit.md#app-window) closes on Escape while
the focus is inside it, also with `modal: false`. Opened without a view's
`signal` it is a [long-lived window](toolkit.md#long-lived-windows): it stays
open with its content across navigation until it is closed, sign-out or a
tenant switch; `maximizable` adds a maximize/restore button and `id`
remembers its box per user. A [menu command](shell.md#menu-commands)
(`menuCommands`, a module's `placement: "menu"` command) opens such a window,
or runs other project code, from an emphasized entry in the menu row of every
view ([FB-0199](feedback.md#fb-0199)). Suite's English-only names
are in the page's language: a `collapsable` header is `‹header›
összecsukása` / `‹header› kinyitása`, a window's close button `Ablak bezárása`
([FB-0155](feedback.md#fb-0155)). A long window title stays on one line;
`titleOverflow: "start"` cuts it at its start so its end stays visible, and
`titlePrefix` keeps a leading text whole
([window title](toolkit.md#window-title), [FB-0194](feedback.md#fb-0194)).

A record page that shows one item large, like a media player, is a two-column `PageLayout`: a control panel of
[`SettingsForm`](toolkit.md#settingsform)s (local view settings with switches, segmented choices, ranges, colours
and chips, kept per user with `key`, never written to the server) and a viewer with
[`CommandBar`](toolkit.md#commandbar-view-controls)s above and below it (toggles, selects, segmented choices,
button groups and a range, all usable from the collapsed `Műveletek` menu). The page builds no panels, forms or
toolbars of its own.

A project's own rendering element (a canvas or other surface its code draws)
goes between such bars edge to edge with
[`app.ui.attach(cell, element, {signal})`](toolkit.md#cell-content): the
recipe's borderless `type: "none"` Layout of commands, stage and footer, the
element in the stage cell without a card, padding or border. It works in a
tab as well. The element keeps its listeners and focus across redraws, resizes
and tab switches and leaves with the build's signal
([FB-0157](feedback.md#fb-0157)).

A list view's [`activate`](workspaces.md#activation) (JSON `view.activate`)
declares what double-click and Enter run on a record in table, cards and
tiles: `details`, `subview` (the record's full child list, also when empty),
`page` (the child view's own page filtered to the record) or one of the
view's record actions, as its toolbar command runs it; an
activation the actor or record is not offered opens the details. Custom
server behavior is a registered action handler; a project's own browser UI is
allowed by [ADR-0004](decisions/0004-project-domain-freedom.md), and it is mounted
through a project module and view kind ([toolkit](toolkit.md),
[ADR-0005](decisions/0005-toolkit.md)); `activate` may also be a `view:<id>`
record view or a map keyed by a column value.

Any view (list, singleton or file manager) can request the generic
`desktopOnly` option (JSON `desktop_only`): below 768 px the shell shows a
centred desktop-only notice instead of the view ([shell](shell.md#desktop-only-views)).

<a id="vizuális-diagramszerkesztő"></a>

## Visual diagram editor

[Diagrams](diagrams.md) provides a node-and-link editor over the framework
tables `blade_diagrams` and `blade_diagram_types`: `DiagramStorage`,
`DiagramDefinition` (element palette, connection types, limits, runtime element
types), registered `list`, `get`, `create`, `save`, `delete`, `type_create` and
`type_delete` actions with the space as ACL object and server-side canonical
validation, and the `DiagramEditor` view (Suite shell, lists, form and windows
around an SVG canvas, because Suite Standard has no diagram widget). Install it
in setup, register it and grant rules. Project modules mount the same editor
as `app.components.DiagramEditor` ([toolkit](toolkit.md#calendar-and-diagrameditor)).
The feature demo configures it as a network topology builder
([FB-0060](feedback.md#fb-0060)).

<a id="eseménynaptár"></a>

## Event calendar

[Calendar](calendar.md) wraps the native DHTMLX Scheduler Standard (GPL) as the
`calendar` view kind over the framework table `blade_calendar_events`:
`CalendarDefinition` (space, extra event fields, views, hours, window limit,
optional day action, event colours `tones`), registered `events`, `occurrences`, `create`, `update`
and `delete` actions with the space as ACL object, optimistic revisions, the
Scheduler recurring model (series, moved and deleted occurrences) and the
server-side `Recurrence` expansion of the editor's RRULE subset. Install it in
setup, register it and grant rules; `CalendarDefinition::occurrences()` serves
consumer handlers. Project modules mount the same calendar (one per page) as
`app.components.Calendar` ([toolkit](toolkit.md#calendar-and-diagrameditor)).
The feature demo configures a digital signage scheduler with a per-day playlist
API ([FB-0061](feedback.md#fb-0061)).

<a id="formvalidáció-és-migráció"></a>

## Form validation and migration

[Validation](validation.md) defines shared PHP/JSON rules, native DHTMLX feedback
and server/UI/API checks. Feature migration requires the complete reference
validation inventory and documented deviations, not just required fields.

<a id="acl-és-műveletvégrehajtó-fejlesztés"></a>

## ACL and action execution

[ACL/audit](access-and-actions.md) is usable; it also documents the opt-in
multipart transport, ID-only audit detail and SQLite immediate transactions.
access.php verifies default deny,
object scope, field denial, API/token scope, optimistic conflicts, audit/rollback.
Registry/SqlResource/Workspace independent integration and consumer integration
were verified. Fresh checks must respect current coverage limits.

[Delegated access](access-and-actions.md#delegated-access) is opt-in per
resource (`SqlResource` `delegation: new Delegation(read: [...], write: [...])`
with `DelegationLink` and an optional `DelegationVia`; JSON
`storage.delegation`). Rules with scope `delegated` then grant or deny the
rows the actor reaches through the application's own relationship tables:
the read links for reads, the write links for writes. `delegation.php`
covers it on SQLite and, with the `BLADE_TEST_MYSQL_*` variables, on MySQL.

<a id="multi-tenancy"></a>

## Multi-tenancy (optional)

[Tenancy](tenancy.md) is opt-in: `new Workspace($registry, $pdo, tenancy: true)` or
a JSON `"tenancy": {}`, then `Tenancy::install()`. Scoped resources declare
`tenantColumn` (JSON `tenant_column`) on `SqlResource` and on their lookups.
Roles stay global. Membership is assigned in Users or in Tenants. The shell
shows a selector only for several memberships, and the server resolves and
rechecks the tenant on every request; without a membership, scoped resources
fail closed. A scoped resource may declare [shared rows](tenancy.md#shared-rows)
(`sharedTenant`, `sharedRoles`; JSON `shared_tenant`, `shared_roles`): every
tenant reads them read-only beside its own rows (`_shared: true`), and a
declared role without a tenant writes them. API keys are bound to a tenant or are global. Workers use
`Workspace::context($actor, $channel, $tenant)`. The guide includes the consumer
integration and migration steps. Demo: [/tenants/](demos.md#tenant-demo-tenants).

<a id="fejlesztői-memória-védelme"></a>

## Protecting development-host memory

Browser tests use the [guard](development.md#böngészőteszt-korlátozott-memóriájú-fejlesztői-hoston):
shared lock, one worker, initial memory threshold/cgroup cap. Consumers may use
the same guard. The root Playwright config has one project, `shell`, that runs
every spec against the managed URL (`BLADE_DEMO_URL`) and starts no server;
--list discovers all. [Coverage limits](development.md#existing-full-smoke-and-coverage-limits)
are explicit. Runtime/cache: ignored tmp, overridden by BLADE_TMP_DIR within checkout.
FB-0016/FB-0042.

For agent-facing design and implementation rules for grid, data-tree, and
responsive card/DataView surfaces, use the [61ade-ui skill](../.agents/skills/61ade-ui/SKILL.md).
The [workspace guide](workspaces.md) remains the public list contract, including
server sorting/filtering, bounded rendering, field-level editing, accessibility,
and current presentation limits.

<a id="listaadatok-és-tömeges-műveletek"></a>

## List data and bulk actions

[Cards/details/numbering/marks](workspaces.md#kártyák-rekordadatok-sorszám-és-jelölés),
[bulk](workspaces.md#tömeges-műveletek-és-ikonok), [view selection and header
indicators](workspaces.md#nézetválasztás-és-fejlécjelzések), and [counts](workspaces.md#listafejléc-és-rekordszám)
describe the public presentation contract, with evidence in
[historical qualification](list-presentation-validation.md).

A list can sit beside a data tree of another resource
([tree navigation](workspaces.md#tree-navigation): `Registry::tree()`, JSON
`view.tree`), a field can depend on another field's value
([conditional fields](workspaces.md#conditional-fields): `visibleWhen`, JSON
`visible_when`), fields can be an exclusive choice
([exclusive fields](workspaces.md#exclusive-fields): `clears`), an action
form can show values read-only ([read-only fields](workspaces.md#read-only-fields):
`createOnly`, JSON `storage.create_only`, `Action::$display`, `RecordForm`
`readOnly`; a flat, filled control distinguishes the read-only value) and
group fields into framed
[form sections](workspaces.md#form-sections) (`section`; collapsible, or
fixed with `sectionCollapsible: false`), which also group the
[cards and details](workspaces.md#card-groups) side by side with a long text
below them (`column.cardLines` sets its card lines), a field can count
the related records the actor may list ([count fields](workspaces.md#count-fields):
`counts`, JSON `storage.counts`), and every view can explain itself in a closable
[view guide](workspaces.md#view-guide) (`guide`, or by view id in the
application's `guides`), shown once per sign-in session and again from the
top row's `Útmutató` button. Prerequisites, examples,
limits and checks are in those sections; the feature demo's
`Regisztrációs adatbázis` uses all three.

In [accordion forms](workspaces.md#form-accordion), a fixed section keeps its
header visible while its fields scroll when the available height is too small.
This also applies to `flushSections`; no consumer stylesheet or new option is
needed ([FB-0188](feedback.md#fb-0188)).

Opening a [section-filling textarea](workspaces.md#form-section-fill) in an
accordion form focuses it with the caret at the end of its text, by click,
Enter or Space. It works in both accordion modes without a new option.

A form can be laid out in several columns with
[form rows](workspaces.md#form-rows) ([FB-0196](feedback.md#fb-0196)):
consecutive fields of one section that declare the same `row` (PHP `Field`,
JSON `row`) share a row, `rowWidth` (JSON `row_width`, 1–3) widens a field's
share, and a field without a row keeps the full width. A row stacks into one
column where the form itself is narrower than the row needs
(`--blade-form-column-min`, default 180 px per share), and the list's form
window opens wide enough for its widest row. Forms without rows are
unchanged. The feature demo's `Kapcsolatok` uses it;
`tests/shell/form-rows.spec.cjs` checks it at 1366, 880 and 390 px.

No list or page region is a bare blank area
([loading and empty states](toolkit.md#loading-and-empty-states)): every list
shows a loading indicator (`aria-busy`) while it loads and says when it has
no records (`ListView` `emptyText` gives a page's own text) or no record
matches its filters or search; a `PageLayout` region, tab or section without
content shows a default text, its own text or the loading indicator
(`placeholder(id, {text, busy})`). A page builds no hint or overlay element
of its own for these states.

<a id="url-és-helyi-felületbeállítások"></a>

## URLs and local UI preferences

The shell uses `#view=<view id>` (record views `&record=<id>`) to restore active
views on reload and Back/Forward; any other address gives the empty workspace
([shell](shell.md#url-és-helyi-felületbeállítások)).
[Local preferences](shell.md#url-és-helyi-felületbeállítások) automatically retain
grid/workspace display settings; marks and the cursor record are transient
and never stored. [Compact login windows](shell.md#kompakt-hitelesítési-ablakok-és-menüikonok)
fit rendered forms with consistent lower space. List shadows appear under grid
column headings or the card toolbar, with a separate theme divider between
toolbar and grid headings. Shared checkbox/pencil presentation is described in
[field presentation](field-presentation.md#egységes-checkbox-és-kártya-szerkesztésjelzés).

Card editing shares __edit/revision/validation/ACL/audit with Grid; sorting uses
full SQL. Layout-resizer double-click restores declared size. Content-fitted
windows/scroll restoration preserve visible records across views rather than
transferring mismatched row pixel offsets. [Details](workspaces.md#kártyaszerkesztés-rendezés-és-kompakt-ablakok).

Record pages automatically retain the menu context of the first offered menu
view for their `record` resource, including direct links and reloads. An explicit
`group` limits that inheritance to the named group; see the
[menu context rules](shell.md#elkülönülő-főmenügombok).

The main-menu row uses flat, full-height menu items and selectors with shared
hover/focus states, content-sized controls and symmetric separator spacing;
the open view's section is underlined in the theme accent ([main-menu tabs](shell.md#elkülönülő-főmenügombok)). [Responsive commands](workspaces.md#reszponzív-műveletsor-és-azonos-kártyaszélesség)
collapse into Actions and keep uniform card width. Blade rows alternate white/
#f7f7f7 (Blade Night: a faint light tint) by display index, including virtualization, with native selection above.
All normal Toolbars share the list toolbar's inset through the common
`--blade-toolbar-padding` token, including direct Layout attachments, and own
a themed 1 px bottom divider even above borderless content. If a Toolbar or
CommandBar fills a framed `space`/`wide` cell, only the cell draws the outer
edge, avoiding a doubled rule. The final closed Accordion section likewise
omits its header's lower rule against the panel frame
([FB-0156](feedback.md#fb-0156)). Mobile
shell selectors collapse together into the `Beállítások` hamburger menu.
Toolbar submenus open to the right when they fit; otherwise they replace the
ancestor popups at the toolbar button, with `Vissza`/ArrowLeft to return.
This applies at every depth and to desktop controls near the right edge too
([CommandBar](toolkit.md#commandbar)).
No consumer configuration; rebuild/prepare assets.

A collapsed desktop `Menü` is followed by the open feature's sibling menu items
([shell](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü)); no configuration.

Optional `ApplicationDefinition(menuSeparators: ['Management'])` / JSON
`application.menu_separators` adds a native separator before the named view
group, keeping declaration order and the existing separator before logout.
The compact menu retains the separators; the default empty list changes
nothing. See [group separators](shell.md#menu-group-separators) for validation
and limits. The feature demo uses the default without group separators.

[Popup headers](shell.md#kompakt-ablakfejléc-és-teljes-mobilmenü) are 40 px, with
theme background and 1 px divider. The light theme label is Világos; default
is Blade and valid saved choices persist.

Optional [application skins](shell.md#application-skins) (`ApplicationDefinition
skins:` or JSON `application.skins`) give selected signed-in identities
and public accounts an appearance derived from a factory base. Project
appearances must extend the Blade (`blade`/`blade-night`) or Generic
(`light`/`dark`) family through scoped differences, preserving native controls;
use [61ade-skinning](../.agents/skills/61ade-skinning/SKILL.md) and the
[family contract and consistency assessment](skinning.md). One skin
hides the selector; several fill it with only those skins. Presentation only;
without the option nothing changes.

Every application shows the 61ade [product logo](brand.md) unless it declares its own or `Logo::none()`.

Optional [sign-in customization](shell.md#sign-in-branding): an application
logo in the top row and/or the sign-in windows (`logo`, placement `window`/`top`/`both`),
`signInStylesheets` on the [supported CSS hooks](shell.md#sign-in-css-hooks),
a notice and links below the form (`signIn`), and `signInModules` that fill the
window's header/footer slots through a restricted API (JSON `application.logo`,
`sign_in_stylesheets`, `sign_in`, `sign_in_modules`).

<a id="többnyelvűség"></a>

## Localization

Every application uses common locale/translation, including single-language sites
without selectors. Framework hu/en/de catalogs accompany consumer business catalogs.
Optional native selector precedes theme. Labels, client/server validation and
mail share locale. [i18n](i18n.md) defines config/fallback/cookie/API/boundaries/
checks; FB-0034 supersedes FB-0033's earlier missing state.

[Account default language](i18n.md#felhasználói-alapnyelv) exists on multilingual
sites and controls login/mail. Flag assets are actual packaged PNGs selected
by country code hu/gb/de. Login uses the native form Combo and the main bar
Toolbar icon; see [source/packaging](flag-assets.md).

<a id="fejlesztési-batch-lezárása"></a>

## Closing a development batch

The project does not require gitpush after changes (2026-10-21, FB-0043).
Checks/documentation remain required. Follow [commit/push](development.md#commit-és-push)
and preserve unrelated staged/unstaged changes.

### Handling a list activation in a project

A composed `ListView` can handle double-click and Enter through its `activate`
event. Call `event.preventDefault()` synchronously, then open the project's
existing editor or dialog. The event still carries `row` and the resolved
`target`; cancellation changes no ACL or toolbar action. No cancellation
keeps the default. The readings dashboard demonstrates this by keeping its
selected reading in the existing summary instead of opening duplicate details.
See [ListView](toolkit.md#listview) and [record activation](workspaces.md#activation).

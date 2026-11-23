# Toolkit API: project modules, views and components

Status: **implemented** ([FB-0081](feedback.md#fb-0081)): project modules
and stylesheets, the `app` services and [events](#event-catalog), the
registries, built-in view kinds through the `kinds` registry, view ids,
`#view=` routing, record views, the activation map,
the components `ListView`, `RecordForm`, `RecordDetails`, `CommandBar`,
`PageLayout`, `Tabs`, `Accordion`, `FileManager`, `FilePicker`, `Calendar`,
`DiagramEditor`, `MediaPlayer`, `TextDiff` and `SandboxFrame`, `admin.d.ts` and the sandbox document. The feature demo is its
reference consumer ([worked examples](#worked-examples)); the owner tried it
at gate G4 on 2026-10-30. This guide is the canonical public contract; the
owner accepted it at gate G1 on 2026-10-29
([decisions](#decisions-at-gate-g1)) and every change needs a recorded reason
in [changes](#changes).

## Purpose, scope and ownership

61ade becomes a toolkit ([ADR-0005](decisions/0005-toolkit.md)): a project
declares what is declarative (PHP/JSON, unchanged) and writes its own browser
code with 61ade's public services, components and registries where it needs
more. 61ade's built-in views use the same API.

| Owner | Owns |
| --- | --- |
| 61ade | The `Application` object and every service, component and registry below; the built-in kinds `list`, `files`, `diagram`, `calendar` and presentations `icon`, `image`; the shell, routing, module loader, sandbox document; server authorization, executor, audit. |
| Project | Its module files and their build, the kinds, presentations, field types and commands it registers (dotted names), its PHP actions and handlers, its domain UI ([ADR-0004](decisions/0004-project-domain-freedom.md)). |

Unchanged boundaries: every server read and write is a registered action
checked on the server; trusted modules run with the user's session (the same
trust as the project's PHP handlers); untrusted code runs only in
[`SandboxFrame`](#sandbox-protocol); backend-only data never enters view
`options`. A purely declarative application (no modules) stays fully
supported; the starter admin and tenant demo stay declarative.

## Prerequisites

- The shared checkout as described in
  [consumer layout](development.md#consumer-layout); the same `admin.js` and
  `admin.css` as a declarative application.
- Modules and stylesheets are same-origin files below the application's public
  directory (CSP `script-src 'self'`, `style-src 'self' 'unsafe-inline'` unchanged).
- Optional for TypeScript: `dist/admin.d.ts` and the `@dhtmlx/suite` 9.3.12
  types it references ([recipe](#typescript-recipe)).
- `SandboxFrame` additionally needs `dist/sandbox.html` deployed beside
  `admin.js` ([packaging](#packaging)).

<a id="module-loading"></a>

## Module loading

```php
return new ApplicationDefinition(
    // …
    version: '1.4.0',
    modules: ['app/main.js'],          // ES modules, relative to the page like `assets`
    stylesheets: ['app/main.css'],
);
```

```json
{"application": {"title": "…", "runtime": "…", "version": "1.4.0",
  "modules": ["app/main.js"], "stylesheets": ["app/main.css"]}}
```

```js
// public/app/main.js — a plain ES module; TypeScript is optional.
/** @type {import("@61ade/admin").ApplicationModule} */
export default (app) => {
  app.commands.register("demo.copy-text", {
    label: "Másolás szövegként", placement: "record",
    run: ({ row }) => navigator.clipboard.writeText(String(row?.title ?? "")),
  });
};
```

- **Paths** (`ApplicationDefinition` validation, like `assets` and
  [skin stylesheets](shell.md#application-skins)): relative or root-absolute
  same-origin paths, `[A-Za-z0-9_-]` segments, `.js`/`.mjs` for modules and
  `.css` for stylesheets, an optional `?…` cache key; anything else fails at
  definition time. Without an explicit cache key the shell appends the
  [file-derived key](#cache-keys) `?v=<mtime>-<size>` of the served file, so a
  rebuilt module reaches the browser at once; `?v=<version>` only when that
  file cannot be found.
- **Naming:** `application.modules` are browser ES modules;
  `workspace.modules` remain the JSON definition files of
  [configuration](configuration.md#belépés-és-alkalmazásszekciók).
- **When:** in the application shell, including explicitly configured
  [public access](authentication.md#public-access). The sign-in, e-mail confirmation and
  password-change pages of login-only applications load neither modules nor stylesheets (as with skins);
  they link the separate `signInStylesheets` (JSON
  `application.sign_in_stylesheets`) instead and import only the separate
  `signInModules` (JSON `application.sign_in_modules`; same path rules, keys,
  parallel import, order and 5 s limits, console-only reports), whose default
  export gets the restricted `SignInApplication` (`apiVersion`, `page`,
  `i18n`, `theme`, `dhx`, `slots`; no `server`, identity, registries or CSRF
  token) instead of `app`; they are trusted project code on the page with the
  password field ([sign-in modules](shell.md#sign-in-modules)). Stylesheets are linked
  after the framework CSS and skins; both kinds rely only on the
  [supported CSS hooks](shell.md#sign-in-css-hooks).
  With public access, opening sign-in preserves the existing guest `Application`,
  view instances, input and live channel; its ordinary assets remain active behind
  the modal, which additionally loads the restricted sign-in modules and styles.
  X, Escape and Cancel dispose the sign-in listeners/styles without destroying
  the guest view before a challenge. Closing a pending public code/password-change
  window uses server cancellation and reloads the public context.
- **Order:** the shell `import()`s all modules in parallel and calls their
  default exports one by one in declaration order with the page's
  `Application`, then routes. A failed import, a throw, a rejection, an
  import or an initialization longer than 5 s each is reported (toast, `module:error` event,
  console) and skipped; the shell always starts. Registrations made before the
  failure stay.
- **One instance:** a module never imports `admin.js` (the shell loads it with
  `?v=`, so a second import would be a second bundle). It gets everything from
  `app` and imports only types.
- **One module or several:** both work. Several entries in `modules` are
  isolated from each other by the loader (one failing module does not stop the
  next). The feature demo ships one bundle whose default export runs one part
  per area and rethrows the failures together as an `AggregateError`, so the
  loader reports it once and keeps what the other parts registered
  ([example](#example-module)).

<a id="cache-keys"></a>

### Cache keys

Owner decision of 2026-10-30: browser cache keys come from the file itself,
with one rule for every asset the shell links: 61ade's `admin.js` and
`admin.css`, [skin](shell.md#application-skins) stylesheets, the project's
`modules`, `stylesheets`, `signInStylesheets` and `signInModules`, the
[logo](shell.md#sign-in-branding) images, and AuthHandler's
`AuthHandler.css`/`.js` on the sign-in page. Each gets `?v=<key>`: the base36 modification time (seconds) and
the base36 size of the file it is served from, joined by `-` (for example
`app/main.js?v=t3k9qz-1fk2`). A rebuilt or newly copied file gets a new key on
the next page load, without a commit, `.git`, a version bump or a hand-edited
template (the former `admin.js?v=32` is gone). A key derived from Git commits
was rejected: a project module is not the library's, nothing changes before a
commit, and deploys often have no `.git`.

- **Which file:** a page-relative path resolves against the front controller's
  directory (`SCRIPT_FILENAME`; if that is unusable, the document root plus the
  directory of `SCRIPT_NAME`), a root-absolute path against the document root.
  The document root is `ApplicationDefinition` `documentRoot` (JSON
  `application.document_root`, relative to the JSON directory), by default the
  request's `DOCUMENT_ROOT`. Set it only where `DOCUMENT_ROOT` is not the
  directory served at `/` (an `Alias`, a CLI renderer).
- **Containment:** a path is resolved with `realpath` and read only when it is a
  regular file inside the real document root; `..` or a symlink leading out of
  it, and a front controller outside it, resolve nothing. Definition-time path
  validation is unchanged.
- **Own key:** a path that already has `?…` keeps it unchanged.
- **Fallback:** when no file is found (missing, outside the document root, no
  usable root), project modules, stylesheets, skins and AuthHandler files get
  `?v=<version>`, or no key when `version` is empty, as before. 61ade's
  `admin.js`/`admin.css` first take the key of the package's own build
  (`packages/frontend/dist/<file>`) when the PHP package is loaded from its
  checkout. That covers the consumer development link
  `public/assets/61ade -> …/packages/frontend/dist`, which leaves the
  consumer's document root; then the version.
- **Cost:** one `stat` per asset and page (PHP's stat cache is cleared first),
  no cache across requests. The page never contains a filesystem path; the key
  has only digits, lowercase letters and `-`.
- **Limit:** the modification time has one-second resolution; a rewrite within
  the same second with the same size keeps the key. The `sandbox.html` address
  reuses the key of `admin.js` ([sandbox protocol](#sandbox-protocol)).

<a id="api-reference"></a>

## API reference

Source of truth: `packages/frontend/src/api/types.ts` (doc comments state
ownership, lifecycle and error behaviour of every member). This section lists
each member with one example.

### Application

| Member | Purpose | Replaces or wraps |
| --- | --- | --- |
| `apiVersion` | `1` ([O11](#resolved-decisions)); a value of `app` only, `admin.d.ts` declares just its type `ApiVersion` | — |
| `dhx` | The Suite namespace the shell uses (one instance, Standard edition) | `@dhtmlx/suite` import of the bundle |
| `server` | Action calls, raw responses, `__form`, GET URLs | six private `fetch` transports, `ActionUrl.ts` |
| `ui` | `dialog`, `choice`, `toast`, `window`, `attach` ([cell content](#cell-content)), `menu` ([popup menu](#popup-menu)) | `MessageDialog.ts`, Suite `message`, `WindowSizing.ts`, Suite `ContextMenu` |
| `uploads` | `open`, `reopen` of the shared uploader | `Uploader.ts` `uploads` |
| `i18n` | `t`, `locale`, `languages` | `I18n.ts` |
| `theme` | `current`, `skin`, `onChange(listener, {signal})` | AdminShell theme/skin handling |
| `preferences` | `scope(name)` → `get/set/remove` (`name` must contain a dot, else `TypeError`) | `UiPreferences.ts` storage |
| `live` | `subscribe(resource, query, handlers, {signal})` | `LiveChannel`/`Realtime` |
| `events` | Typed bus `on(name, handler, {signal})`, `off`, `emit` ([event catalog](#event-catalog)) | uploader `on/off` |
| `identity` | `id`, `displayName`, `tenant`, `authenticated` | bootstrap `userId`, `displayName`, `tenant.current`, `authenticated`; false for the configured public account, without granting any right |
| `kinds`, `presentations`, `fieldTypes`, `commands` | [Registries](#registries) | hard-coded `AdminShell.openView`, `RecordPresentation` |
| `components` | [Components](#components) | `Workspace`, `FileManager`, … |
| `viewDefinitions()`, `viewDefinition(id)` | Views offered to the actor | bootstrap `views` |
| `navigate(target)` | Opens a view like a menu click; `false` if not offered | `AdminShell.openView` |

### Services

```ts
const rows = await app.server.call<Snapshot>("tasks", "list", { values: { limit: 50 }, signal: host.signal });
const blob = await (await app.server.request("files", "content_get", { id })).blob();
const { fields, values } = await app.server.form("tasks", "update", id, { signal: host.signal }); // `__form`
audio.src = app.server.url("signage_assets", "content_stream", id, revision);  // GET action, session cookie
if (await app.ui.dialog({ message: app.i18n.t("Biztosan?"), mode: "confirm", severity: "warning" })) { /* … */ }
const choice = await app.ui.choice({ message: "…", choices: [{ value: "a", label: "A" }] });
app.ui.toast(app.i18n.t("Mentve."));                                 // plain text (escaped)
await app.ui.copy(secret.value, { label: t("Titok") });               // clipboard + "Titok másolva." toast (#copy)
app.ui.submitKeys(textarea, { submit: send, cancel: close, signal });   // Ctrl/Cmd+Enter, Escape (#submit-keys)
const progress = app.ui.progress({ title: t("Közzététel"), message: t("Másolás…") });  // dialogs.md#progress
const win = app.ui.window({ title: "Előnézet", width: 720, signal: host.signal }); win.attach(layout);
app.ui.attach(layout.getCell("stage"), canvas, { signal });  // an element into any Layout cell (#cell-content)
app.ui.menu(button, { label: "Rendezés", items: [{ id: "name", label: "Név" }], signal }).on("select", ({ id }) => sort(id));  // #popup-menu
app.uploads.open({ resource: "files", action: "upload", target: folderId, targetLabel: "Drive A:/", policy });
app.i18n.t("{count} elem", { count: 3 }); app.i18n.locale();
app.theme.onChange((theme, skin) => chart.paint(), { signal: host.signal });
app.preferences.scope("demo.player").set("volume", 0.8);
const sub = app.live.subscribe("measurements", { limit: 100, sort: { field: "id", direction: "desc" } },
  { update: snapshot => render(snapshot.items) }, { signal: host.signal });
app.events.on("upload:complete", result => refresh(), { signal: host.signal });
app.navigate({ view: "demo.asset-viewer", record: "42" });
```

Errors: `server.*` rejects with `ServerFailure` (`status`, localized
`message`, `fieldErrors`, optional `details`; status 0 for a network
failure or a 2xx answer without JSON; an error answer keeps its HTTP status) or the platform `AbortError`; it never retries. 401 means
the session ended: the shell then signs the page out ([ended session](shell.md#ended-session)),
and the caller still gets the failure. Event handlers
that throw are logged and do not stop other handlers; emitting a framework
event name (with `:`) throws.

<a id="viewport"></a>

`app.viewport.narrow` is the framework's one width breakpoint
(`(max-width: 767px)`), the one its own phone layout follows: full-screen
windows, list cards, collapsed command bars, the desktop-only notice
([FB-0250](feedback.md#fb-0250)). `viewport:change {narrow}` reports every
crossing on `app.events`. A project reads these instead of a
`matchMedia` of its own; a [`PageLayout` `narrow` tree](#pagelayout-narrow)
needs neither.

```ts
app.events.on("viewport:change", ({ narrow }) => rebuild(narrow), { signal: host.signal });
```

<a id="copy"></a>

`app.ui.copy(text, {label?})` writes plain text to the clipboard (the
Clipboard API, else a hidden text field and the browser's copy command) and
says so with a toast: `Másolva.`, `‹label› másolva.`, or the danger toast
`A másolás nem sikerült.`; it resolves whether it copied. A project's copy
button (a secret, an address, an id) uses it instead of its own
`navigator.clipboard` call and toast ([FB-0250](feedback.md#fb-0250)). A
non-string rejects with `TypeError`. `app.ui.toast` escapes its text.

<a id="submit-keys"></a>

`app.ui.submitKeys(element, {submit, cancel?, signal})` gives a project's own
text field (a composer, a quick note) the framework's submit keys
([FB-0250](feedback.md#fb-0250)): Ctrl+Enter or Cmd+Enter runs `submit`, and Escape
runs `cancel` when given. Keys typed during IME composition and keys another
handler already took are left alone, and so are a held key's repeats. The element gets `aria-keyshortcuts`,
removed when `signal` aborts. Framework forms do the same by themselves: Ctrl/Cmd+Enter in a textarea runs the form's primary
button ([workspaces](workspaces.md#form-submit-keys)). A missing signal, a
non-element or a non-function throws `TypeError`.

<a id="app-window"></a>

`app.ui.window` opens a framework document window (`AppWindow`). Escape
closes it while the focus is inside it: right after it opens (it takes the
focus) and after a click inside it. Suite gives only a modal window this key;
the framework adds it to a `modal: false` window, which leaves an Escape
pressed elsewhere on the page alone ([FB-0155](feedback.md#fb-0155)). An
Escape that a menu or popup inside the window already took closes only that.

<a id="modal-windows"></a>

**Modal windows** (the default, and every framework record, action, filter
and picker window) follow the [W3C APG dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
([FB-0201](feedback.md#fb-0201)). While one is shown, everything before it
in the document (the page, the menu row, earlier windows, modal or not) is
`inert`, so neither Tab, the pointer nor a screen reader reaches it; Tab and
Shift+Tab cycle inside the topmost window; closing it returns the focus to
the element that had it before, when that still exists and the focus has not
moved elsewhere. What opens above a window comes after it in the document and
stays usable: Suite popups and menus, a stacked window (which
contains the focus in turn and gives it back to the lower one) and framework
dialogs ([dialogs](dialogs.md#billentyűzet-és-fókusz)). Live regions
(`aria-live`, `role="status"`/`alert`/`log`) and toasts directly in `body` stay
announced. Windows and dialogs count their hold on each inert element, so
they may close in any order. A modal window shown while a framework dialog is
open is drawn above it: the dialog is inert and takes no keys until the window
closes. This holds for any Suite `Window` with `modal: true`, also one a
project creates itself. Escape closes the topmost modal window that holds the
focus, whether or not non-modal windows are open, unless a popup inside it
takes the key: a handler that calls `preventDefault()` or stops the key
before it reaches `<html>`, an open native `popover` (`:popover-open`) in or
after the window, a focused `role="menu"`, or an `aria-expanded="true"`
trigger with `aria-haspopup` (or `role="combobox"`) whose `aria-controls`
popup is visible (without `aria-controls`, only while the trigger has the key). While such a popup is open the key goes no further than `<html>`, so Suite cannot close the window under it: a popup handles Escape on itself, an ancestor or in the capture phase, not on `document` or `window`. The window then closes on the next Escape. Non-modal windows are
unchanged: nothing becomes inert and Tab leaves them.

The close button is named `Ablak bezárása` (Close window) in the page's
language, with the same tooltip; a window's own `Bezárás` button keeps its
name. A fitted window (`fit`, a `RecordForm`) grows to its content up to
`maxHeight` (default: the application's `windowMaxHeight`, PHP
`ApplicationDefinition` or JSON `application.window_max_height`, else 800 px;
at most the viewport minus 24 px; `Infinity` for the viewport; a number below
120 throws `TypeError`; [FB-0225](feedback.md#fb-0225)); a taller form
scrolls its fields between the fixed header and its action row, a fixed
footer at the window's lower edge ([window sizing](workspaces.md#window-sizing),
[FB-0177](feedback.md#fb-0177), [FB-0242](feedback.md#fb-0242)). A window opened with `fit: false`, and
every window below 768 px (full screen there), keeps its size: `fit()` does
nothing for it, so a `RecordForm` or `SettingsForm` in it fills it instead
of resizing it ([FB-0178](feedback.md#fb-0178)).

<a id="long-lived-windows"></a>

**Long-lived windows.** A project's own `app.ui.window` opened without a
view's `signal` belongs to the page, not to a view: it stays open, with its
content and state, across view navigation (menu, `navigate`, the address),
Back/Forward and record windows opening and closing. It closes on its close
button, Escape inside it, `close()`, its own `signal`, and with the page:
sign-out and a tenant switch reload it. Pass `modal: false` so the workspace
and the menu row stay usable outside its own area; the row's popups open
above it. Modal windows and dialogs opened later (a record editor, a
confirmation) stack above it, Escape closes the topmost modal one (Suite
alone left it open while a non-modal window existed), and a modal window or
dialog returns the focus to where it was ([modal windows](#modal-windows)).
A `modal: true` long-lived window makes the page behind it inert until it
closes. From 768 px a non-modal window that is not maximized stays inside
the workspace with a 12 px margin, below the menu row and above the lower bar
([FB-0250](feedback.md#fb-0250)). This holds when it opens (a remembered
position included), after a drag, when it is restored, and when the
workspace or the viewport changes size; a larger window is made smaller to
fit. A project no longer watches the menu row to move its window. Modal windows
keep the viewport with a 12 px margin. Below 768 px a non-modal window fills
the workspace, so the menu row and the lower bar stay usable also under a
`closable: false` window, and it follows the workspace when it changes; a modal
window stays full screen ([FB-0257](feedback.md#fb-0257)). An open window follows
the 768 px breakpoint and keeps its content: it takes the phone form below it and
returns to its desktop box, maximized state included, above it, so a project
does not reopen it on `viewport:change` ([FB-0260](feedback.md#fb-0260)). Content that grows a fitted window past the workspace is corrected at the next resize. A project that needs to know the page's view
listens to `view:opened` / `view:closed`; a [menu command](shell.md#menu-commands)
is the usual way to open such a window from every view
([FB-0199](feedback.md#fb-0199)). While a non-modal window is open, a view
opened behind it does not open its [guide](workspaces.md#view-guide) by itself
([FB-0200](feedback.md#fb-0200)).

- **`maximizable: true`** adds `Ablak maximalizálása` (Maximize window)
  before the close button; maximized, the window fills the workspace between
  the menu row and the lower bar (the menu stays reachable), follows the
  viewport, cannot be moved or resized, and the button becomes `Ablak
  visszaállítása`, which restores the previous box. A header double-click
  toggles too; `AppWindow.maximized` and `maximize(true|false)` do it from
  code. Below 768 px the window is full screen and has no button.
- **`id`** (`[a-z][a-z0-9_.-]*`, else `TypeError`) remembers the window's
  restored box (size and position) and its maximized state per user and page
  path, like a `Tabs` `id` (`blade-ui:1:[path, user, "window:<id>"]`). Only a
  user's drag or resize is stored, not a content fit; the next window with
  the id opens there, clamped into the viewport with a 12 px margin, and no
  longer fits its content. Phones neither read nor write it. Without `id` a
  window opens centred at `width`/`height`, as before.

```ts
const win = app.ui.window({ title: t("Munkaasztal"), width: 880, height: 560, fit: false, modal: false,
  maximizable: true, id: "demo.workbench" });   // no `signal`: it outlives the view
```

<a id="window-title"></a>

A title wider than the header stays on one line and never covers the close
button. By default (`titleOverflow: "end"`, Suite's own title) it is cut at
its end with a trailing `…`. `titleOverflow: "start"` cuts it at its start
instead, so the end of a path-like title stays visible:
`… / Karakter / Alapprompt`. `titlePrefix` is plain text before the title
that is never cut (`Elem szerkesztése:`); only the title after it is, in
either mode, and `setTitle` replaces only the title. The window's accessible
name is always the full `<titlePrefix> <title>`, also after `setTitle`; with
`"start"` or a prefix, a cut header shows that full title as its tooltip,
updated as the window is resized or retitled. The cut follows the window's
width at any viewport, the full-screen phone window included. Right-to-left
text is shown isolated in the same line; `"start"` then cuts its visual
left, which is not a supported right-to-left layout. Another
`titleOverflow` or a non-string `titlePrefix` throws `TypeError`
([FB-0194](feedback.md#fb-0194)).

```ts
const win = app.ui.window({ titlePrefix: t("Elem szerkesztése:"), title: path.join(" / "), titleOverflow: "start", signal: host.signal });
win.setTitle(nextPath.join(" / "));  // still "Elem szerkesztése: … / <end of the new path>"
```

<a id="window-closable"></a>

**A window that cannot be closed by the user** (`closable: false`,
[FB-0250](feedback.md#fb-0250)) has no close button, and neither Escape nor
the backdrop closes it, modal or not; only `close()` and its `signal` do.
Use it for content that must stay while an operation runs: the
[progress dialog](dialogs.md#progress) is one. Default `true`; a non-boolean
throws `TypeError`.

<a id="popup-menu"></a>

**Popup menu** ([FB-0202](feedback.md#fb-0202)). `app.ui.menu(anchor, options)`
binds a menu to a button the project placed anywhere: beside a title in a
header row, in a composer, in its own toolbar. It is the APG menu button over
Suite's `ContextMenu` (`menu` with `menuitem`/`menuitemradio` entries), for a
history list, an account or model picker or a sort menu outside a
`CommandBar`. The handle (`PopupMenu`) has `opened`, `open(focus?)`,
`close()`, `on("select", …)` and `destroy()`.

```ts
const t = app.i18n.t;
const menu = app.ui.menu(modelButton, { label: t("Modell"), signal: host.signal, items: () => [
  { type: "group", label: t("Modell"), items: [
    { id: "auto", label: t("Automatikus"), checked: !model },
    ...models.map(m => ({ id: "model:" + m.id, label: m.label, detail: m.standard ? t("alapértelmezett") : undefined, checked: m.id === model }))] },
  ...(model ? [{ type: "group" as const, label: t("Erősség"), items: efforts(model).map(e => ({ id: "effort:" + e, label: t(e), checked: e === effort })) }] : [])] });
menu.on("select", ({ id }) => choose(id));   // choose, efforts: the page's own
```

- **Items:** entries `{id, label, detail?, icon?, checked?, disabled?}`,
  groups `{type: "group", label?, items}` (entries only) and separators
  `{type: "separator"}`, at most 200 entries in all. Labels and details are
  plain text (escaped). A group's `label` is a heading row: not an entry, so
  the arrows skip it, and spoken with the group's first entry ("Ma: Vázlat
  1 10:42"), together with the first entry that is not disabled. A click on a
  heading neither picks nor closes. An empty group is left out; a menu without
  entries shows the `empty` note (default `Nincs választható elem.`,
  localized). `detail` is plain secondary text at the entry's right edge (cut
  with `…` when long, at most 45 % of the width) and part of its accessible
  name; it is no keyboard shortcut.
- **Checked entries:** an entry with `checked` (true or false) is a
  `menuitemradio` with `aria-checked` and a check mark in its icon slot.
  Unchecked entries keep an empty slot so the labels line up. The checkable
  entries of a group (or those outside any group) are one radio set. The
  project owns the state: it passes the current choice on every opening,
  usually with `items` as a function, which is read again at every `open`.
- **Keys and focus (APG menu button):** the anchor gets
  `aria-haspopup="menu"` and `aria-expanded`. A click, Enter, Space or
  ArrowDown opens the menu on its checked entry (else the first), ArrowUp on
  its last; an anchor that is not a native button (`role="button"`) gets
  Enter and Space from the menu. Up/Down move with wrap-around, Home/End jump,
  and Enter or a click picks: the menu closes, the focus goes back to the
  anchor and `select {id}` follows. Escape closes it and returns the focus to
  the anchor before a window or dialog behind it sees the key, so a modal
  window stays open and the next Escape closes the window. Tab closes it and
  moves on from the anchor (Shift+Tab back). A click outside or on the anchor
  closes it, and so does a change of the viewport's width; the pointer leaving
  it and a phone's keyboard changing the height do not. One popup menu is
  open at a time: opening another closes it.
- **Placement:** below the anchor, or above it when it does not fit below (a
  composer at the bottom of a window); above every window, within the
  viewport and at most `min(28rem, 100vw − 16px)` wide. Its left edge is on
  the anchor's, or its right edge when the left does not fit; a list that
  fits neither way (a wide one at a right-hand button on a phone) is
  right-aligned to the anchor as far as the viewport allows, 8 px from its
  edges, so the page never scrolls sideways. Its height is capped
  at about 12 entries (`27rem`) and at the larger room below or above the
  anchor; beyond that it scrolls. On a phone it stays anchored; there is no
  bottom sheet.
- **Lifecycle and errors:** `destroy()` (or `signal`, for example a window's)
  closes the menu, removes its listeners and restores the anchor's
  `aria-haspopup`/`aria-expanded`; it is idempotent. The anchor must stay in
  the document: a button that is redrawn as a new element needs a new menu.
  An anchor that is not an element, a missing `label`, a malformed item (an
  id outside `[A-Za-z0-9_.:-]+` or a duplicate one, an empty label, `checked`
  with `icon`, a separator in a group, more than 200 entries) throws
  `TypeError`, at the call for an array and at `open` for a function.
- **In a `CommandBar`:** a popup menu on a bar's button is the bar's
  [`popup` item](#commandbar-title), which binds and rebinds it; the feature
  demo's `Munkaasztal` header and composer use it. Do not build a Suite
  toolbar of your own to carry one. A [`CommandBar` `menu`](#commandbar-menu)
  item stays the bar's own more-actions button (it folds into `Műveletek` on
  a phone). `app.ui.menu` itself is for a button outside a bar.

Every subscription takes its owner's signal the same way, as the last
argument `{signal}` (`SignalOptions`): `events.on`, `live.subscribe`,
`theme.onChange`, `server.form` and every component's `on`. Aborting it
unsubscribes (or aborts the request); an already aborted signal subscribes
nothing. A bare `AbortSignal` in place of the object, any other non-object or a
`signal` that is not an `AbortSignal` throws `TypeError`.

<a id="request-version"></a>

**Cacheable reads** ([FB-0250](feedback.md#fb-0250)). `app.server.request(resource,
action, {id, version, signal})` with a `version` is a GET of the same URL as
[`app.server.url`](#services) for a field-free `get: true` action (asset
bundles, JSON files a page reads), so the browser cache keeps it per version,
with the failures, 401 sign-out and `AbortError` of every call. Use it
instead of `fetch(app.server.url(…))`. It needs an `id`; `values` or
`parts`, an empty or non-string `version`, and `version` on `call` or `form` throw
`TypeError`. An action without `get: true` answers 405.

`ServerFailure` is an interface, not a class: there is no `instanceof`. Tell
the two rejections apart by shape, aborts first:

```ts
try { await app.server.call("tasks", "get", { id, signal: host.signal }); }
catch (error) {
  if ((error as Error)?.name === "AbortError") return;                  // the view closed or the caller aborted
  const failure = error as ServerFailure;                               // a plain Error with a numeric `status`
  if (typeof failure.status === "number" && failure.fieldErrors) show(failure.message, failure.fieldErrors);
  else throw error;
}
```

<a id="record-watch"></a>

#### Record watch

`app.live.watch(resource, id, handlers, {signal})` keeps one record current
on the tab's live channel ([FB-0250](feedback.md#fb-0250)). It replaces a page
that calls a read action on a timer. Data the page shows as one object (a
tenant's publishing state, a job's status) becomes a record resource with a
`get` action, `"self"` for a singleton's resolver, and the page watches it:

```ts
// examples/demo-app/frontend/src/task-page.ts: the task page follows outside edits of its task
app.live.watch("demo_page_tasks", String(task.id), { update: record => show(record) }, { signal: host.signal });
```

- **Reads.** Every tick reads the record again through the resource's `get`
  action, with the same tenant, `ui` channel, resolver, delegation, object ACL
  and field ACL as an ordinary `get`; no list view is needed. The WebSocket
  transport reads every `BLADE_LIVE_INTERVAL` (default 2 s), polling every
  `interval` after the previous `__watch`. A value derived from the clock (a
  worker seen within the last minute) therefore changes at the next read.
  Hidden tabs are not read.
- **Updates.** `update(record)` receives the first answer and then every
  answer that differs (the server compares a hash and sends nothing while it is
  unchanged). After a reconnect the same answer is not repeated. `state(text)`
  reports the connection as for lists. `denied()` follows a 400, 403, 404 or
  429 refusal; the channel stays open.
- **Wire.** A subscription whose query is exactly `{record: "<id>"}`; protocol 2
  is unchanged. It counts toward the 64 subscriptions of a connection and as
  one row of its 2000-row budget. A resource without `get` and a missing record
  answer 404, a denied one 403. The first answer writes one `subscribe` audit
  row with the resolved record id. A refusal (4xx) writes one `subscribe`
  `rejected` row with the requested id; a refused watch is not asked again,
  and a server error (5xx) is retried and logged, not journaled. The answer is
  the ordinary `get` answer (`audit_action` removed).
- **Errors.** An empty resource or id, a missing `update` or a malformed
  `signal` throws `TypeError`.

<a id="uploads"></a>

#### Uploads

`app.uploads` is the page's one [uploader](uploader.md) (`Uploader.ts`): the
same window, queue, lower-bar indicator, conflict dialog and resume as the file
manager, list upload commands and `file` fields. A project never builds another
upload dialog.

```ts
const policy = (app.viewDefinition("files")!.options as FilesKindOptions).upload.policy;
// (a list view's upload action carries its own: view.actions.find(action => action.upload)?.upload)
const target = { resource: "files", action: "upload", target: folderId, targetLabel: "Drive A:/Képek", policy };
app.uploads.open({ ...target, onUploaded: ({ succeeded }) => refresh(succeeded) });   // once per batch
surface.addEventListener("drop", event => { event.preventDefault();
  app.uploads.open({ ...target, transfer: event.dataTransfer! }); });                 // synchronously in the drop handler
app.events.on("upload:file-done", ({ file, result }) => show(file.name, result), { signal: host.signal });
app.uploads.reopen();                                                           // the current queue again
```

- `open` shows the window for that target; files queued for other targets stay.
  `files` (`File[]`/`FileList`) or a drop's `transfer` (folders included) queue
  at once, without a second confirmation. `policy` is the target action's
  `ActionMetadata.upload` or a files view's `options.upload.policy`.
- A malformed option (missing resource/action, non-string target, no policy,
  non-`File` entries) throws `TypeError` before anything opens. The server
  still checks every file against the action's `UploadPolicy`, ACL and handler.
- `background: true` queues supplied files without opening or focusing the
  window; `reopen()` shows the shared queue. The flag must be a boolean.
  The built-in file field uses it for its native single-file input, paste
  and drop. Window/Layout/Grid construction is deferred until the first
  visible `open` or `reopen`; the interface is populated from the queue then.
- Progress goes to `app.events` as `upload:queued`, `upload:started`,
  `upload:progress`, `upload:conflict`, `upload:file-done`,
  `upload:file-failed`, `upload:complete` and `upload:cancelled` for every
  upload of the page (each `file` names `resource`, `action` and `target`, so
  filter by them). `reopen()` does nothing before the first `open`.

<a id="attachments"></a>

#### Attachments

`app.components.Attachments` holds the files attached to something being
written, such as a message or a request, until the send
([FB-0250](feedback.md#fb-0250)). It uploads through the page's one uploader
in the background (no upload window) and shows each file as a chip. A
project no longer builds chips over `upload:*` events or lists attachments
in a submenu.

```ts
// examples/demo-app/frontend/src/workbench.ts: the Munkaasztal composer
const files = new app.components.Attachments({ label: t("Csatolmányok"), signal,
  upload: { resource: "messages", action: "attachment_upload", target: null, targetLabel: t("Üzenet"), policy },
  remove: item => app.server.call("messages", "attachment_discard", { id: item.id }) });
files.mount(layout.getCell("attachments"));          // a `height: "content"` cell above the composer
composer.on("click", ({ id }) => { if (id === "attach") files.choose(); });
surface.addEventListener("drop", event => { event.preventDefault(); files.add(event.dataTransfer!); });
await send({ text, attachments: files.ids() }); files.clear();   // wait while files.pending
```

- **Upload.** `upload` is the target of [`app.uploads.open`](#uploads) without
  files; the policy is the target action's (`ActionMetadata.upload`, or a
  stored-file field's `file.policy`). Every file is its own upload call, so the
  policy's `maxFiles` limits one call, not the list. `add()` takes `File[]`, a
  `FileList` or a drop's `DataTransfer` (its files, no folders; call it in
  the drop handler). `choose()` opens the browser's file chooser with
  `accept` from the policy's extensions. The uploader checks the policy,
  asks about name conflicts and reports `upload:*` as for every upload.
- **Items.** `{id, name, size, status, percent?, error?}`. While a file
  uploads, `id` is a local key. Once done, it is the upload action's id
  (`UploadResult.succeeded[].id`), which `ids()` returns in order for the
  send. `items` passed at creation start as done. `pending` is true while a
  file uploads. `change {items}` reports every addition, progress step,
  outcome and removal.
- **Removing.** The chip's × button, Delete or Backspace on a chip, or
  `remove(id)`. A done file first goes through `options.remove(item)` (the
  server-side discard). If it rejects, the chip stays and the message shows
  as a danger toast; `remove(id)` then resolves `false`. A second removal
  while `options.remove` runs is ignored. An uploading file is cancelled (at
  its first report if the uploader has not reported it yet); a file in its
  final step can no longer be cancelled, so it leaves the list and, if it
  still finishes, is discarded through `remove`. A failed file leaves at once.
  `remove {item}` reports every departure. `clear()` empties the list without
  `remove`, after a send.
- **Chips.** A thumbnail from `thumbnail(item)` (done files) or a Bootstrap
  file icon by extension, the name cut with `…` (the full name as tooltip
  and accessible name), then the size, the percent or `Feltöltés…`. A failed
  chip (also a skipped, cancelled or interrupted file) has a danger frame, an
  `bi-exclamation-triangle-fill` icon and the uploader's status text
  (`Sikertelen: ‹reason›`, `Megszakítva`). Progress updates a chip in place,
  so the focus and the roving tab stop stay. The row wraps, its height follows the chips, and an empty list
  takes no space.
- **Keys and accessibility.** A list (`role="list"`, named by `label`) of
  items with roving focus: Tab enters the list once; Left/Up and
  Right/Down move; Home/End jump; Delete/Backspace removes, then the focus
  goes to the next chip, else the previous, else the list. The × button
  (`‹name› eltávolítása`) is for the pointer and stays out of the Tab order. A
  polite status says `Csatolva: ‹name›` and `Sikertelen feltöltés: ‹name›.
  ‹reason›`, not every percent.
- **Adding.** `add()` draws each file's chip at once, before the uploader's
  first report, and `pending` is true from that moment
  ([FB-0256](feedback.md#fb-0256)).
- **Limits.** The component has no drop surface of its own; the page passes
  its drop to `add()`. Each file is its own upload call and only that call's
  reports reach its chip, so another `Attachments` or a file picker on the same
  action never takes its file. Malformed options throw `TypeError`.

<a id="registries"></a>

### Registries

`Registry<T>`: `register(name, entry, {replace?})`, `get`, `has`, `names`.
Names are `[a-z][a-z0-9_.-]*`; built-in names have no dot, project names must
contain one (`demo.player`). A taken name (a built-in one too) throws `Error` unless `replace: true`
(a new name without a dot, or an entry that is not an object, throws
`TypeError`), which is also how a project deliberately overrides a built-in. Register during
module initialization (modules run before the first view opens). A list,
record details or form reads the registries when it is created, so a later
registration affects only surfaces created after it.

| Registry | Built-in entries (61ade dogfoods them) | Declared on the server by |
| --- | --- | --- |
| `kinds` (view kinds) | `list`, `files`, `diagram`, `calendar` | the view `kind` |
| `presentations` | `image` (static image column; `icon` stays framework-internal) | `Field` `column: ['presentation' => 'demo.bar']`, JSON `"column": {"presentation": "demo.bar"}` |
| `fieldTypes` | none | `new Field(…, editor: 'demo.rating')`, JSON field `"editor": "demo.rating"` |
| `commands` | `details` (the lists' `Adatok` command) | `Registry::view(…, commands: [...])`, `SqlResource::register(…, commands: [...])`, JSON `view.commands`; a `placement: "menu"` entry by `ApplicationDefinition(menuCommands: [new MenuCommand(…)])`, JSON `application.menu_commands` ([menu commands](shell.md#menu-commands)) |
| `mediaTypes` | `image`, `video`, `audio` (`image/*`, `video/*`, `audio/*`) | nothing: every file's `mime_type` (`_media`, file listings) |

The server checks only the shape of a project name (dotted, `Field::projectName`)
and sends it with the view; the browser module supplies the behaviour. A view
declares at most 20 unique commands. A project presentation needs a readable,
non-secret, non-password field and keeps the field `editable`; an `editor` is
refused on secret, password, `file` and media fields.

```php
$tasks->register($registry, 'Feladatok', commands: ['demo.copy-text']);   // SqlResource; Registry::view() alike
new Field('score', 'Pont', 'number', column: ['presentation' => 'demo.bar']);
new Field('priority', 'Prioritás', 'number', editor: 'demo.rating', column: ['editable' => true]);
```

```ts
app.kinds.register("demo.asset-viewer", { create: (host, view) => mountViewer(host, view) });
app.presentations.register("demo.bar", {
  render: (value, row, column, size, escape) =>
    `<span class="demo-bar demo-bar--${size}" style="--w:${Math.min(100, Number(value) || 0)}%">${escape(value)}</span>`,
  text: value => `${value} %`,
});
app.fieldTypes.register("demo.rating", {
  input: (field, value, readOnly) => ({ type: "slider", name: field.name, label: field.label, labelPosition: "top",
    min: 0, max: 5, step: 1, value: Number(value) || 0, disabled: readOnly }),
  display: (value, row, field, size, escape) => `<span aria-label="${escape(value)}/5">${"★".repeat(Number(value) || 0)}</span>`,
});
app.commands.register("demo.copy-text", {
  label: "Másolás szövegként", icon: "bi bi-copy", placement: "record",
  // Reads go through an action too: the server's ACL and field ACL decide what the text contains.
  run: async ({ app, row, signal }) => {
    const fresh = await app.server.call<Row>("demo_tasks", "get", { id: row!.id, signal });
    await navigator.clipboard.writeText(String(fresh.title ?? ""));
    app.ui.toast(app.i18n.t("Másolva."));
  },
});
app.commands.register("demo.count-marked", {
  label: "Kijelöltek száma", placement: "toolbar", enabled: ({ rows }) => rows.length > 0,
  run: ({ app, rows }) => app.ui.toast(app.i18n.t("{count} elem", { count: rows.length })),
});
```

```ts
app.mediaTypes.register("demo.scene", { mime: ["text/javascript"], label: "Animáció", icon: "bi bi-film" });
```

The feature demo's real registrations: the presentation `demo.reading-bar`
([example](#example-readings)), the field type `demo.rating` and the record
command `demo.copy-text` ([example](#example-tasks)).

- **View kind** `create(host, view)` returns a `ViewInstance` (`destroy`,
  optional `editing`, `refresh`). `ViewHost` gives `app`, `signal` (aborted when
  the view closes), `open` (`page`/`window`), `record` (`{resource, id, row}`
  for record views), `filters`, `attach`, `setTitle` (changes a window's
  header; does nothing for a page view), `setLocation(segments)` (a page
  view's levels in the [location bar](shell.md#location-bar) after the menu
  path and a record view's declared parent records: `{label, icon?, target?: {view, record?}}` or `{label, icon?,
  onSelect}`, at most 16; `target.filters` links to a filtered list;
  `setLocation(segments, {from: "root"})` makes them the whole bar,
  [a path of its own](shell.md#location-bar-own-path), and with an empty array
  [an empty bar](shell.md#location-bar-empty). The optional `back` callback
  overrides the page's [Back destination](shell.md#location-bar-back-target)
  for these levels. Call it again when the selection inside the page
  changes; nothing in a window or after close), `close`. A throw shows the
  error dialog and leaves an empty workspace. `attach` replaces the whole
  content; compose a page from one Layout ([recipe](#layout-recipe)).
- **Presentation** (`column.presentation`): a synchronous HTML renderer per
  value and size: `cell` (table), `card` (card fields and the record details,
  also `RecordDetails`) and `tile` (the tile's secondary line; the tile title
  uses `text`, else the plain value). It must escape every record value with
  the given `escape`, and give a value shown only as a picture or colour a text
  alternative (visible text, or `text` for accessible names). A presentation
  gets no per-column options of its own ([limits](#limits)). A presentation wins over a field type's `display`. The
  built-in `image` renders through the registry in the table cell, the card and
  tile media slot and the details, unchanged; replacing it (`{replace: true}`)
  replaces all of them.
- **Field type** (`field.editor`): `input` returns the Suite Form item (its
  `name`, or a nested item's, must be the field name); optional `bind(context)`
  runs once the Form exists, with a `signal` aborted when that form closes;
  optional `display` renders the value in table cells, card fields, tiles and
  details. It is used by the list's create, update and bulk forms, a
  singleton's form, `RecordForm` and the edit window of an `editable` table cell
  or card field: a field-type column never uses the native Grid cell editor; its
  cell is an edit button (`<label> — szerkesztés`) that opens the same window as
  a card, saved through `__edit` with the revision, validation, ACL and audit of
  every inline edit. Filters keep the storage type's input; calendar event
  forms take the `input` item only (no `bind`). The server keeps validating the
  value by the storage `type`.
- **Client command** (`ListKindOptions.commands`): `label` (source text,
  translated), `icon`, `placement`, `enabled`, `run`. Every command sits in the
  list's command bar: the declared ones after the view's actions, in
  declaration order whatever their placement, and they move into the
  `Műveletek` menu like the other toolbar items. There is no record context
  menu: a right click, the context menu key or Shift+F10 on a row, card or
  tile keeps the browser's own behaviour. `placement` says what the command
  acts on: `toolbar` the view (no record needed), `record` the toolbar's
  cursor record, like the built-in record actions (`Adatok`, `Szerkesztés`,
  `Törlés`); a command with any other `placement` is skipped with one console
  warning, like an unregistered name. The context has `app`, `view` (as
  the server sent it), `row` (the cursor record of that view; absent without
  one), `rows` (its marks) and `signal` (aborted when the list closes).
  **Sub-view delegation:** while a selected sub-view (preview) record holds
  the toolbar, a command follows the same rule as the built-in actions: a
  command the sub-view's list has too (the built-in `details`, or a name its
  own view declares in `commands`) runs in the sub-view's context (`view` the
  sub-view's view, `row` its cursor record, `rows` its marks, none in a compact
  preview); any other command stays on the list's own cursor record and marks
  (a `record` command without one is disabled by the default rule). `view` and
  `row` therefore always belong to one resource. A `shared` sub-view is the
  same view, so every command follows its cursor record. Collapsing the
  preview or its record leaving it gives the toolbar back to the list.
  `enabled` is evaluated whenever the toolbar record, marks or rows change
  (also the delegated preview's); default: a `toolbar` command is always
  enabled, a `record` command with a cursor record and at most one marked row
  (disabled without a cursor record and with several marks, like a
  single-record action); a command that acts on the marks declares its own
  rule (for example `({ row, rows }) => !!row || rows.length > 0`), which then
  decides alone; a throw disables the command. A disabled command does not
  run. A throw or rejection of `run` shows the error
  dialog (an `AbortError` stays silent). A client command never bypasses
  server authorization: anything it reads or changes goes through
  `app.server.call`. Compact sub-view previews show no project commands; a
  full sub-view window shows its own view's.
- **Toggle command** (`type: "toggle"`, [FB-0159](feedback.md#fb-0159)): a
  two-state command of the list's own toolbar, like the
  [CommandBar](#commandbar-view-controls) toggle: `aria-pressed` and the
  pressed look in the bar, a checked entry (`menuitemcheckbox`) in
  `Műveletek`. It takes `label`, `icon`, `enabled` as above, `pressed` (its
  state until the user changes it for that view, default `false`) and an
  optional `toggle(context)` instead of `run`; `placement` is `toolbar` only
  (a `record` toggle is skipped with one warning). The state is kept per user
  and **view id**, not per scope, in the public store
  `app.preferences.scope(<command name>)` under the view id: a host reads it
  before it mounts the list (`undefined` until the user changed it), and a list
  mounted with another `scope` shows the same state; a sub-view window keeps
  its own (its own view id). Every user change stores the state, then calls
  `toggle` with the list's own context (never a sub-view's) and `pressed`, and
  reports the list's `toggle {command, pressed}` event, both after the
  toolbar's click handling, so a handler may destroy and replace the list. A
  toggle changes nothing by itself: the host gives it its meaning with what
  the list offers (another `scope`, `setFilters`, `refresh`), and anything it
  reads goes through `app.server.call` like every command.
- **Pinned command** (`pinned: true`, [FB-0163](feedback.md#fb-0163)): a client
  command (a toggle or a push button) that stays in the list's toolbar when a
  narrow region or a phone collapses the other commands into `Műveletek`,
  after its menu button, as a `CommandBar` range does. A toggle keeps
  `aria-pressed` there. Pin only what must stay in view, such as a mode
  switch: pinned items still need their width. A `pinned` that is not a
  boolean skips the command with one warning.

  ```ts
  app.commands.register("demo.subkey-values", { type: "toggle", label: "Alkulcsok értékei", icon: "bi bi-folder", placement: "toolbar", pinned: true });
  // The page: the kept state decides the first list's scope, a change mounts the list of the other scope.
  let subkeys = app.preferences.scope("demo.subkey-values").get<boolean>("demo_registry_browser_values") === true;
  const mountList = () => {
    list?.destroy();
    list = new app.components.ListView({ view: "demo_registry_browser_values", scope: { field: subkeys ? "parent_key_id" : "key_id", id: node }, panel: false });
    list.on("toggle", ({ command, pressed }) => { if (command === "demo.subkey-values") { subkeys = pressed; mountList(); } });
    list.mount(cell);
  };
  ```
- **Unknown names never break a list.** A presentation or field type the
  module did not register renders the plain value (option label or text) and
  keeps the storage type's input; an undeclared or unregistered command is
  left out. Each logs one console warning per name. A renderer that throws
  shows the escaped plain value (logged once per column); a field type whose
  `input` throws or returns an item without the field's name falls back to the
  built-in input (logged).
- Dogfooding: `builtins.ts` registers the `image` presentation and the
  `details` command (a `record` command with the default rule); the list renders and enables them through the registries
  exactly like project entries (`src/app/registries.ts`). Checks:
  `node tests/shell/toolkit-registries.mjs`, `php8.4 tests/shell/toolkit.php`,
  `tests/shell/toolkit-registries.spec.cjs`.

<a id="components"></a>

### Components

Every component has `layout` (its root Suite Layout), `mount(target)` (an
element, a Layout cell, an `AppWindow` or a `ViewHost`), idempotent
`destroy()` (widgets, windows it opened, listeners, live subscriptions), typed
`on(event, handler, {signal})`, and accepts `signal` to destroy itself with its owner.

```ts
const C = app.components;
const list = new C.ListView({ view: "measurements", filters: { sensor: "3" }, signal: host.signal });
list.on("select", ({ row }) => chart.show(row)); list.mount(layout.getCell("list"));
const form = new C.RecordForm({ resource: "tasks", action: "update", id, signal: host.signal });
form.on("saved", () => win.close());
const details = new C.RecordDetails({ view: "signage_assets", record: host.record!.row });
const tree = new C.Tree({ view: "categories_tree", label: "name", id: "demo.page.tree", signal: host.signal });
tree.on("select", ({ row }) => details.show(row!)); tree.mount(layout.getCell("tree"));
new C.FileManager({ view: "files" }).mount(host);
const file = await C.FilePicker.pick({ field: fileField, title: "Kép" });
new C.Calendar({ view: "events" }).mount(host);
new C.DiagramEditor({ view: "diagrams" }).mount(host);
const player = new C.MediaPlayer({ source: { resource: "signage_assets", action: "content_stream", id }, mime: "audio/mpeg" });
player.on("position", ({ seconds }) => timeline.move(seconds)); player.mount(layout.getCell("stage"));
const frame = new C.SandboxFrame({ signal: host.signal }); await frame.load(code, { "tone.wav": blob });
const bar = new C.CommandBar({ items: [{ id: "play", label: "Lejátszás", icon: "bi bi-play-fill" }] });
bar.on("click", ({ id }) => id === "play" && player.play());
```

| Component | Wraps | Events / methods |
| --- | --- | --- |
| [`ListView`](#listview) | `Workspace` (split into `src/components/list/*`) | `select`, `target`, `activate`, `saved`, `changed`, `toggle`; `editing`, `refresh`, `selected`, `target`, `setFilters` |
| [`RecordForm`](#recordform) | workspace action forms, `FormValidation`, `FileFields` | `saved`, `cancelled`, `changed`; `submit`, `values`, `dirty` |
| [`SettingsForm`](#settingsform) | the `RecordForm` field factory (`fields.ts`), `FormValidation`, native Suite Form items, `UiPreferences` (with `key`) | `change`, `submit`; `values`, `setValues`, `set`, `reset`, `update`, `validate` |
| [`RecordDetails`](#recorddetails) | the `Adatok` details (`recordFields`) | `show(row \| id)` |
| [`Tree`](#tree) | `NodeTree` (`components/list/RecordTree.ts`, also the panel of tree navigation) over the Suite Tree, `UiPreferences` (with `id`) | `select`, `activate`; `selected`, `select`, `refresh` |
| [`FileManager`, `FilePicker`](#filemanager-and-filepicker) | `components/files/*` over `FileManager.ts`, `FilePicker.ts` | `opened`; `editing`; `pick()` resolves a `MediaDescriptor` or `null` |
| [`Calendar`, `DiagramEditor`](#calendar-and-diagrameditor) | `components/calendar/CalendarView.ts`, `components/diagram/DiagramView.ts` | Calendar: none; DiagramEditor: `saved`; both `editing` |
| [`MediaPlayer`](#mediaplayer) | `components/media/MediaPlayer.ts`, extracted from the file manager viewer, plus audio | `loaded`, `position`, `ended`, `play`, `pause`, `error`; `play`, `pause`, `seek`, `position`, `duration`, `focus` |
| [`TextDiff`](#textdiff) | new (`components/diff/*`) over `CommandBar` | none; `summary`, `show`, `next`, `previous`, `focus` |
| [`SandboxFrame`](#sandbox-protocol) | new | `ready`, `error`, `message`; `load`, `post` |
| [`CommandBar`](#commandbar) | `ResponsiveToolbar` (`Műveletek` collapse), Suite toggle items | `click`, `toggle`, `change`; `update(id, changes)`, `value(id)` |
| [`PageLayout`](#pagelayout) | the list layout's region tree and `UiPreferences` (sizes, collapsed panels, the active tab of a `tabs` branch, the open sections of an `accordion` branch) | `collapse`, `variant`; `cell(id)`, `attach(id, content)`, `tabsOf(id)`, `accordionOf(id)`, `collapse(id)`, `expand(id)`, `isCollapsed(id)`, `narrow` |
| [`Tabs`](#tabs) | Suite `Tabbar` (header only) over one Layout cell per tab, `UiPreferences` (the active tab) | `change`; `cell(id)`, `attach(id, content)`, `active`, `select`, `update` |
| [`Accordion`](#accordion) | one Suite Layout cell per section under its cell header, `UiPreferences` (the open sections) | `toggle`; `cell(id)`, `attach(id, content)`, `openSections`, `isOpen`, `open`, `close`, `toggle`, `update` |
| [`Attachments`](#attachments) | new (`components/upload/*`) over the page's one uploader | `change`, `remove`; `add`, `choose`, `items`, `ids`, `pending`, `remove`, `clear` |
| [`Steps`](#steps) | new (`components/progress/*`) | none; `current`, `state`, `states` |

Every event with its payload is in the [event catalog](#event-catalog); how
to compose components in one page is the [Layout recipe](#layout-recipe).
The list components live in `packages/frontend/src/components/list` and are
offered as
`app.components.ListView`, `RecordForm`, `RecordDetails`, `Tree` and `CommandBar`
(the other components have their own subsections). Common rules: `mount(target)`
takes an element (filled at 100 %), a Layout cell, an `AppWindow` or a
`ViewHost`; a window or view host destroys the component when it closes, and
the `signal` option does the same. Mounting twice or after `destroy()` throws
`Error`; an already closed window or host destroys the component at once;
`on` with a non-function and a `signal` that is not an `AbortSignal` throw
`TypeError`. A view id that is not offered throws `Error`, a view of the wrong
kind or shape `TypeError`. `destroy()` is idempotent, detaches the
component from the cell it was mounted in and releases its widgets, the
windows it opened, its requests and its live subscription. Another component
(or widget) can be mounted into the same cell, region, tab, window or view
host right away, in the same handler, any number of times; a cell that showed
markup (`attachHTML`, an element) takes a widget as well
([FB-0161](feedback.md#fb-0161)). A component destroyed after the Layout
that holds it (the Layout went first, for example a `PageLayout` given the
same `signal`, which binds before the components created after it) has
nothing to detach and is released silently ([FB-0228](feedback.md#fb-0228));
the [Layout recipe](#layout-recipe) order, components first, stays the
recommended one. Every component binds its `signal` in its constructor, so
listeners run in creation order whatever the component is loading. Handlers registered
with `on` run in registration order (a throwing one is logged); events are
delivered only while the component is mounted and never after `destroy()`.

<a id="listview"></a>

#### ListView

The framework list of one list view: table, cards and tiles, header filters
and the filter panel, search, the view's action forms and bulk commands,
details, sub-views, live updates and the user's saved mode, sort, columns and
filters. The built-in `list` kind is this component mounted in the view host.

The server action's optional `commandLabel` (JSON `command_label`) overrides
its list toolbar/menu caption and form window title, including accessible names;
the existing `icon` supplies its toolbar/menu glyph. For example, an `update`
action with `commandLabel: 'Beállítások', icon: 'bi bi-gear'` opens settings while
editable cells keep saving through `update`. Omitted values preserve the built-in
`Módosítás` caption and `Mentés` submit button. The normal catalogue translates
the existing action metadata `label`; no browser API or command registration
is needed. See [action command captions](workspaces.md#action-command-label).

Sections inside cards and details stretch to equal heights in each row, with
their content at the top. The project stylesheet can configure the section
columns with `--blade-record-group-min-width` (automatic columns) or
`--blade-record-group-columns` (an explicit CSS Grid track list, including
ratios). A record narrower than 492 px of content stacks its sections through
CSS; see [section-column sizing](workspaces.md#card-group-columns). These
properties are independent of the complete-record `cardColumns` option. The
details element carries `data-blade-view="<view id>"`, a general hook for a
project stylesheet to style one view's details (these properties, say), in
`RecordDetails` and in its `Adatok` window alike; a media field's
`column.detailsWidth` sizes its image there
([sized image in the details](workspaces.md#details-media-width)). A long
text outside the sections stands where its `column.placement`
(`ColumnMetadata.placement`: `"end"`, `"row"` or `"group"`) puts it, in cards
and details alike ([long-text placement](workspaces.md#long-text-placement),
[FB-0225](feedback.md#fb-0225)).

```ts
// examples/demo-app/frontend/src/readings.ts (the dashboard's list in a page Layout)
current = list = new app.components.ListView({ view: listView, filters: presets, signal });
presets = {};
current.on("changed", event => { rows = event.rows; matched = event.matched; if (selected && !rows.some(row => String(row.id) === String(selected!.id))) selected = undefined; render(); });
current.on("select", ({ row }) => { selected = row; render(); });
current.mount(layout.getCell("list"));
```

- `view`: an offered view id or a `ViewDefinition` of kind `list`; an id that
  is not offered throws `Error`, any other view or value `TypeError`. `filters` replaces the saved filter values once
  (declared filters only); `scope` and `compact` give the nested list of a
  record (`compact` needs `scope`). The scope travels as the list protocol's
  [`scope`](workspaces.md#list-scope), not as a filter, so it may name a
  [scope-only field](field-presentation.md#scope-only) (`scopeOnly`, JSON
  `scope_only`, [FB-0166](feedback.md#fb-0166)): a helper key the list is
  scoped on that no list surface offers (no column, details, filter or sort).
- Events: `select` (cursor record, `undefined` when it leaves the window),
  `activate` (the resolved target of a double-click or Enter, reported before
  it runs; `details` also for a card or tile without a declared target; call
  `preventDefault()` synchronously to handle the activation in the project
  instead of running the default),
  `saved` (the list's create, update, record-action and singleton forms and
  inline cell or card edits; `action` is `update` for an edit), `changed` (the
  loaded window after a load, scroll window, live update or revocation, with
  the server's `total` and `matched`). These events stay local to the main
  list. `target` also follows nested previews and sub-view windows (below).
- Methods: `editing()`, `refresh()`, `selected()`, `target()`, `setFilters(filters)`
  (replaces all values; undeclared fields are ignored; `""` is a condition only
  for a select filter that declares an empty option, otherwise no filter,
  [header filters](workspaces.md#integrated-grid-header-filters)).
- **Loading and empty result** ([states](#loading-and-empty-states)): the list
  shows the loading indicator with `aria-busy` while it loads or reloads and
  says when it has no records (`emptyText` replaces that text) or no record
  matches its filters or search.
- The [activation map](#activation-map) is chosen per row; a `view:<id>`
  target calls `app.navigate({view, record})`.
- **Preferences** are keyed by the `id` of the definition the component gets
  (`blade-ui:1:[path, user, <view id>]`, a scoped list `<view id>@<field>`):
  mode, sort, column widths and visibility, panel sizes and (not for a scoped
  list) the filter values, exactly as for the menu page of that id. Passing an offered id shares the
  menu page's state; a page that must keep its own passes the held definition
  under its own view id (`{ ...app.viewDefinition("demo_readings"), id:
  view.id }`, [example](#example-readings)). **`preferencesKey`**
  (`[a-z][a-z0-9_.-]*`, at most 80 characters; [FB-0164](feedback.md#fb-0164))
  replaces that key: a page that switches one view between several scope
  fields (`key_id`, `parent_key_id`) gives every list the same key, so they
  share one mode, sort, columns and panel sizes instead of one set per field;
  filter values of a scoped list stay unsaved. Any other value throws
  `TypeError`. Marks and the cursor record are
  transient: they are never stored, so a reload or a new instance starts
  without them.
- **Active context (`target`):** a panel following the active record subscribes
  to `list.on("target", ({view, row, rows}) => …)` and reads the same state with
  `list.target()`. `view` is the offered view the records belong to, `row` its
  cursor record (`undefined` without one), `rows` its marked records (empty in
  a compact preview). The selected preview owns the context while it holds the
  toolbar; selecting a main row, collapsing that preview or losing its selected
  record returns it to the main list. The foremost open sub-view window owns
  the context while open, including on a phone, and closing it restores the
  underlying context. An unselected window has its child `view` and no `row`.
  A non-selectable child never supplies a cursor record. Selection and marks
  remain local to each list: `selected()` and `select` still describe only the
  main list. Keyboard focus is separate; entering a child does not clear the
  main cursor. `target()` is `undefined` after destroy and before a tree node
  has created its scoped list.
- **Target delivery:** selection, marks, active-record data changes (including
  live updates), delegation and opening/closing a child window notify after
  the current synchronous updates. Unchanged contexts emit nothing; the
  payload and marked-row array are frozen snapshots (record data is not deep
  frozen). This reports the active context, not the result of resolving any
  particular command: commands absent from a child's view still use the main
  record under the existing [delegation rules](workspaces.md#sub-views).
- **Marks:** there is no separate `marked` event or method. The active
  context's marks are available in `target`, and commands keep their own marks
  in their context ([limits](#limits)).
- **In a host's panel (`panel: false`):** the list draws no panel of its own
  (no title, count or frame, no filter panel): its toolbar and data fill the
  host's region, a `PageLayout` region for example, which gives the title; the
  declared filters stay the table's header filters and the `Szűrés` dialog of
  cards and tiles. Default `true` (the list is its own titled panel, as on a
  menu page).
- **`showId: false`:** no ID column and no `ID · n` line on cards (a page whose
  users do not work with record ids).
- **`createDefaults`** ([FB-0162](feedback.md#fb-0162)): the values the
  built-in create form (`Hozzáadás`) starts with, `{field: value}` with string
  values (a checkbox `"1"`/`"0"`). A scoped list presets its scope field only
  when the create action has that field; a list scoped on a computed field
  (an ancestor per level, a derived group) presets the writable field the
  scope implies this way, and keeps the built-in create, its right and its
  submit label. Only fields of that form take part (not the scope field, a
  password or a file); another name is ignored with one console warning. The
  values are ordinary input: the user may change them, the action's ACL and
  field ACL apply and the server validates them on save. A value that is not
  a string, or a name that is not a field name, throws `TypeError`. Other
  creates (a drop into the list, a project's `RecordForm`) are not affected.
  ```ts
  new app.components.ListView({ view: "demo_registry_browser_values", scope: { field: "parent_key_id", id: node },
    createDefaults: { key_id: node }, preferencesKey: "demo.registry-browser.values", panel: false });
  ```
- **`dragSource: true`:** the rows can be dragged into another list of the page
  that declares `drop` from this view's resource
  ([manual order and drops](workspaces.md#manual-order)); the dragged record,
  or every marked one when it is marked. A list with a manual order or a drop
  is draggable by its declaration; draggable rows show the drag-handle column.
- **`mode`:** `table` (default), `cards` or `tiles`: the presentation the
  list opens in until its user picks one in the `Nézet` menu (that choice is
  kept per list and wins). `tiles` needs a view that offers tiles; a phone
  always shows cards. With `modes` the default is their first entry, and a
  `mode` outside them throws `TypeError`.
- **`modes`** ([FB-0169](feedback.md#fb-0169)): the presentations the user
  may choose, distinct `table`, `cards` and `tiles` (`tiles` only where the
  view offers tiles), instead of the view's declared
  [`modes`](workspaces.md#cards-only-and-full-width-cards) (the component
  option wins). The `Nézet` menu offers only these; with one it is not shown
  at all, and a kept choice of another presentation is ignored, not
  overwritten (the same key under other options keeps it). A phone still
  shows a table as cards, also for `modes: ["table"]`. An empty list, an
  unknown or repeated entry or `tiles` without tiles throws `TypeError`. A
  `compact` preview is always a table.
- **`cardColumns`** ([FB-0169](feedback.md#fb-0169)): at most this many
  card columns, an integer 1–6 (else `TypeError`), instead of the view's
  `cardColumns`; `1` shows one card per row across the list's width (notes,
  comments, messages). Without it the cards take as many 340 px columns as
  fit; a phone has one. Long text keeps its
  [4-line card preview](workspaces.md#long-text-in-cards); the details show
  all of it. Tiles are not affected.
  ```ts
  new app.components.ListView({ view: "demo_task_notes", scope: { field: "task_id", id: task },
    modes: ["cards"], cardColumns: 1, panel: false });
  ```

<a id="recordform"></a>

#### RecordForm

One action form outside a list: the fields and values of `__form` (field ACL
applied, `revision` kept hidden and sent back), file fields, client validation
mirroring the server rules, Cancel beside the submit button, the action's
declared confirmation and submit label when an offered view of the resource
has the action, the success toast and the server's field errors in place.

```ts
const form = new app.components.RecordForm({ resource: "demo_tasks", action: "update", id, signal: win.signal });
form.on("saved", () => win.close());
form.on("cancelled", () => win.close());
form.mount(win);
```

- `submit()` resolves the action's result; `saved` carries `{action, result}`
  with the same result. A client validation failure sends
  nothing and rejects with a `ServerFailure` of status 400 with the field
  errors (the server's own shape); a server failure shows its field errors (or
  the error dialog) and rejects with it; a declined confirmation rejects with
  an `AbortError`. Concurrent calls share one submission. A field still being
  typed in is committed first, as a click on the submit button does (Suite
  takes an input's value on its `change`).
- `values()` are the action's field values in the form; `dirty()` is true
  after a change until a successful save. `changed` reports every committed
  field change (on leaving the field).
- A failed `__form` shows the error dialog; `submit()` then rejects with it.
- `cancel: false` leaves out Cancel (a form that stays on its page, such as a
  query's parameters). `setValues(values)` fills the action's fields once the
  form is shown, without submitting or `changed`; the form is unchanged after it.
- `readOnly: ["parent_id"]` shows those input fields of the action read-only
  ([read-only fields](workspaces.md#read-only-fields), FB-0171): a value the
  host fixes from its context (a parent preset through `values`) is shown like
  the action's own read-only fields (a select by its option label), cannot be
  changed by keyboard or mouse, and is still submitted with its value (the
  described one, from `values`, or one `setValues` puts there; a file field
  ignores `setValues`). The server validates it as any input, so the host
  cannot widen a right. A name that is no input field of the form is ignored
  with a console warning; anything but a list of names throws `TypeError`.
  The action's own `display` fields and the fields read-only by ACL are shown
  and never sent; `values()` leaves them out.
- [Form sections](workspaces.md#form-sections) (a field's `section`,
  FB-0172, FB-0177) are framed panels inside the form: collapsible ones open
  by themselves when one of their fields has a value or an error, fixed ones
  (`sectionCollapsible: false`) are always open; the window refits when one
  opens or closes. The action row is the form's fixed footer; only the fields
  scroll ([window sizing](workspaces.md#window-sizing)).
  An action declaring `formSections: 'accordion'` or `'accordion-multiple'`
  (`FormDescription.formSections`, FB-0178) shows them as
  [accordion sections](workspaces.md#form-accordion) instead: the
  `Accordion` component's header and geometry, sharing the window's or the
  region's height; opening one never refits the window; `flushSections`
  runs them edge to edge of the form. A field declaring `sectionFill` (`FieldMetadata.sectionFill`,
  FB-0181) is its section's whole content, named by the header: an open
  accordion section is the textarea, or the file field's drop area fills
  it ([section-filling fields](workspaces.md#form-section-fill)). Fields
  declaring the same `row` (`FieldMetadata.row`, `rowWidth`, FB-0196) share
  one row, side by side by their shares, and stack into one column where the
  form is narrower than the row needs ([form rows](workspaces.md#form-rows)).
  A section whose fields declare `sectionVisibleWhen`
  (`FieldMetadata.sectionVisibleWhen`, FB-0240) shows only while its
  condition holds; hidden, its fields are neither validated nor stored
  ([conditional sections](workspaces.md#form-section-conditional)).
- The submit button is the action's `submitLabel` from an offered view, else
  its label (`Mentés` only without either), so a project view's query action
  submits under its own name. A read-only action (`write: false`) shows no
  success toast: its answer is the `saved` event's `result`.

<a id="settingsform"></a>

#### SettingsForm

A form of local settings that is no record action: how a page shows its item
(fit, zoom, a grid, a background), a filter of the page's own. It takes the
`RecordForm` field declarations and field types, adds the controls a viewer
needs and holds its values itself; it never calls the server. With `key` the
user's values are kept per page and user in the browser, like a list's view
choices.

```ts
const t = (key: string) => app.i18n.t(key);
const settings = new app.components.SettingsForm({ key: `${view.id}.view`, signal: host.signal, fields: [
  { group: t("Megjelenés"), fields: [
    { name: "fit", label: t("Igazítás"), type: "segmented", options: { contain: t("Teljes"), cover: t("Kitöltés") } },
    { name: "zoom", label: t("Nagyítás"), type: "range", min: 25, max: 400, step: 5, unit: "%", defaultValue: 100 },
    { name: "grid", label: t("Rács"), type: "switch" },
    { name: "gridColor", label: t("Rács színe"), type: "color", defaultValue: "#336699", visibleWhen: { field: "grid", in: ["1"] } },
  ] },
  { name: "tags", label: t("Címkék"), type: "chips", multiple: true, options: { warm: { label: t("Meleg"), image: dotUrl }, cold: t("Hideg") } },
] });
settings.on("change", ({ field, value }) => viewer.apply(field, value));
settings.mount(page.cell("settings"));
viewer.applyAll(settings.values());          // the kept values are there at once
```

- **Fields** (`SettingsField`, in groups `SettingsGroup {group, fields}` under
  a native fieldset heading; groups do not nest): `name`
  (`[A-Za-z][A-Za-z0-9_]*`, no `__`, unique), `label` (plain text), `type`,
  and per type `options`, `defaultValue`, `required`, `max`, `validation`,
  `editor`, `visibleWhen`, `clears`, `disabled`. The `RecordForm` types are
  `text`, `number`, `select`, `multiselect`, `textarea`, `checkbox` and
  `date` (no `file`, no `password`: neither has a value without the server),
  with the same items, client validation and `app.fieldTypes` editors. View
  controls:

  | Type | Control | Value |
  | --- | --- | --- |
  | `switch` | checkbox with `role="switch"`, drawn as a track | `boolean` |
  | `segmented` | 2–6 `options` as joined buttons over native radios (`radiogroup`) | option key |
  | `range` | Suite Slider and a coupled number input: `min`, `max`, `step` (default 1), `unit`; the number input is the announced control, named `label (unit)` | `number` (fitted to the step and bounds) |
  | `color` | Suite ColorPicker | `#rrggbb` |
  | `chips` | `options` as rounded chips that wrap; `multiple` (checkboxes in a `group`) or one (radios); an option `{label, image}` shows a small decorative image | option key, or keys with `multiple` |

  Other values: `checkbox` `boolean`, `number` a number or `null`,
  `multiselect` an array, the rest strings. A malformed declaration throws
  `TypeError` (an unknown type, 2–6 segments, a range without `min < max`, a
  `visibleWhen` or `clears` naming no field, an invalid `defaultValue`).
- **Values:** `values()` holds every field (hidden conditional ones too).
  `setValues(values)` and `reset()` report nothing; `set(name, value)` acts
  like the user and reports `change` when the value changed (an invalid value
  throws `TypeError`; `setValues` ignores invalid values and unknown names).
  Start order: the defaults, `options.values`, then the kept values.
- **`change {field, value, values}`:** at once for switches, checkboxes,
  choices, chips and colours; text and numbers when the field is left (a
  typed range number is fitted and the slider follows); a range at most every
  100 ms while it is dragged and once more on release. An exclusive field
  (`clears`) puts the other fields back to their defaults and reports them
  too.
- **Conditional and disabled fields:** `visibleWhen` as in `RecordForm` (a
  boolean is `"1"`/`"0"`); `disabled` or `update(name, {disabled})` keeps a
  field visible but unchangeable (a select is disabled as an element too).
- **No submit row** unless `submit: {label, icon?}` is given: its button runs
  `validate()` and reports `submit {values}` only when every shown field is
  valid. `validate()` alone shows the messages and answers whether the form is
  valid.
- **Persistence (`key`, 1–80 characters):** `UiPreferences` under the page
  path, the user and `settings:<key>`, written on every change, `set` and
  `setValues`; kept values a field no longer accepts are dropped when the
  form is created; `reset()` forgets them. There is no server write; a value
  the server must know is a `RecordForm`.
- **Placement:** any `MountTarget`: a `PageLayout` region, a `Tabs` tab, an
  Accordion section, a window (which it refits when a conditional field
  appears). It is one column with labels above the controls, so it fits a
  390 px phone; segments and chips wrap.

<a id="recorddetails"></a>

#### RecordDetails

The `Adatok` details of a list view as a component: every declared detail
field present in the ACL-projected row, with its media, icon and option
presentation.

```ts
const details = new app.components.RecordDetails({ view: "signage_assets", record: host.record!.row });
details.mount(layout.getCell("details"));
list.on("select", ({ row }) => { if (row) void details.show(row); });
```

`record` (and `show`) take a row, shown as given, or an id, loaded through
the view's `get` (a newer call wins). A field declared with
`column: {details: false}` ([FB-0165](feedback.md#fb-0165),
[field presentation](field-presentation.md)) is left out here, in `Adatok`
and on cards, while the list can still filter and scope by it; a
[scope-only field](field-presentation.md#scope-only) is never there either. A failed load shows the error dialog and
`show()` rejects. It has no events. `showId: false` leaves out the `ID · n`
line.

A section whose only shown field is a media field shows the section's
heading and the media without a label row, and a media field with
`column.detailsWidth` shows its image at that width
([media alone in a section](workspaces.md#details-media-alone),
[sized image in the details](workspaces.md#details-media-width),
[FB-0218](feedback.md#fb-0218), [FB-0223](feedback.md#fb-0223)). A long
text outside the sections is below the groups across the width, unless its
`column.placement` puts it at its place as a row or a group of its own
([long-text placement](workspaces.md#long-text-placement)), and the
details scroll as a whole, as in `Adatok`.

<a id="recorddetails-fields"></a>

`fields` shows only some of the view's detail fields, for a page that puts
a record's parts into regions of their own, such as its data beside its
image over its text ([inner layout](#pagelayout-inner),
[FB-0223](feedback.md#fb-0223)):

```ts
new app.components.RecordDetails({ view: list, fields: ["title", "client", "year"], record: row, showId: false, signal }).mount(page.cell("data"));
```

- **Order:** the view's detail-field order, whatever the order of the ids;
  a derived media column (`mediaOf`) follows its media field.
- **Access:** the row stays the ACL-projected record; a named field the
  row lacks is not shown, as without the option.
- **Errors:** an empty array, a non-string entry or an id that is not a
  detail field of the view throws `TypeError`. Without `fields` every
  detail field is shown.
- **Same view:** the details keep the view's `data-blade-view`, presentation
  and `get`, so `show(id)` loads through the view as before.

<a id="tree"></a>

#### Tree

The records of a list view with a hierarchy on itself as a tree, for a page
that composes its own panels around a hierarchy: folders beside a preview,
categories beside lists of their items, regions beside a dashboard. It is the
engine of [tree navigation](workspaces.md#tree-navigation) as a component
([FB-0158](feedback.md#fb-0158)); the feature demo's [key browser](demos.md#d8-key-browser)
uses it.

```ts
const tree = new app.components.Tree({ view: "categories_tree", label: "name", id: `${view.id}.tree`, signal });
tree.mount(layout.cell("tree"));
tree.on("select", ({ row }) => showItems(row));          // also the initial and the restored selection
tree.on("activate", () => layout.tabsOf("details")?.select("details"));
```

- `view`: an offered list view (or a held definition) whose resource has a
  sub-view on itself (`Registry::subview($id, $id, 'parent_id')`, JSON
  `view.subview` naming its own resource; the parent field is a select whose
  options include `''`). Declare it with `menu: false` when it has no page of
  its own. The node view of a tree navigation is embedded (not offered), so a
  page declares its own view of the same resource. Not offered: `Error`;
  another view or shape: `TypeError`. `label`: the column naming a node (a
  readable text or select field), not the parent field.
- **Loading**, as in tree navigation: roots are the records whose parent field
  is empty; a node's children load the first time it is expanded, through the
  resource's ordinary `list` with the parent filter, sorted by `label` when it
  is sortable; the `_subview` count decides the expand toggle. At most 1000
  children per node load (pages of 200); further ones are left out. A level
  reloaded while an older load of it is pending keeps only the newer answer.
  An empty tree says `Nincs megjeleníthető elem.`; a failed load shows the
  error dialog.
- **Selection:** `initial` is `"first"` (default, the first root), `"none"`
  or `{id}` (that node when it is loaded once the roots and the remembered or
  `expand` levels are, otherwise none). `select {row}` reports every change: a click,
  Space or Enter, `select(id)`, the initial or restored selection, and
  `undefined` when the selected node disappeared in a `refresh`. `activate
  {row}` is a double-click or Enter, after the node is selected. `selected()`
  returns the row or `undefined`. Mount the tree in the same task that creates
  it: events reach only a mounted component.
- **Navigation to a node.** Pass `initialPath` with the IDs from a root to
  the requested node, including both ends. Use the same `id`, source and
  initial defaults as the ordinary entry. For example, a category breadcrumb
  may open the usual catalogue with `initialPath: ["world", "characters", "actor"]`.
  A matching snapshot keeps its visible branches. A previously loaded
  closed folder can supply its child list from the same bounded cache.
  With a cached path, its ancestors open and its selected row is in view
  in the first frame. Only the Tree panel scrolls, and only as
  far as necessary. When a level is missing, the old tree stays usable
  during the authorized read. A newer selection or manual expansion wins.
  The background check reuses levels just read for the path.
  A cold entry opens the saved branches or the ordinary bounded `expand`
  depth, plus any ancestors needed for the target. Navigating within the
  default depth keeps the expansion automatic. An unavailable path uses
  the remembered selection and `initial` fallback. The path must contain
  1–11 distinct nonempty strings of at most 100 characters. Every step must match its
  parent in the authorized list. [FB-0246](feedback.md#fb-0246), [FB-0247](feedback.md#fb-0247).
- `select(id)` selects a loaded node, expands its ancestors and returns
  `true`; an id that is not loaded (below a parent never expanded) returns
  `false` and changes nothing.
- `refresh()` reloads the roots and every expanded level (four loads at a
  time; the first failed load stops it with one error dialog), `refresh(id)`
  only the children of a loaded node; it cancels a running bulk expansion,
  and an `expandAll` or `collapseAll` given meanwhile runs after it. The expansion, the selection and the keyboard
  focus stay where their nodes still exist. A refresh that changes the
  selected node's record reports `select` again with the new row. The tree is
  not live: refresh it after a change made elsewhere.
- **Preferences** with `id` (`[a-z][a-z0-9_.-]*`, per page and user,
  `UiPreferences`): the selection and, once the user has changed the
  expansion, the expanded nodes (at most 200), restored on the next mount. An
  id that does not load (deleted, no longer readable, or below a collapsed
  node) is not shown; it stays stored after the loaded ones until the 200-id
  cap pushes it out, and opens when its parent loads.
  Without `id` nothing is kept. See [expansion](#tree-expansion) for the
  rule between a stored expansion and `expand`.
- **Same-tab return and reload.** A Tree with an `id` and an offered source
  view can draw its last loaded visible branches, selection and scroll
  position in the first frame. A saved empty expansion keeps every branch
  closed. Hidden selections fall back to `initial`. The shell keeps up to
  four snapshots in memory, with at most 2000 rows and 262,144 serialized
  characters per snapshot. Visible branches take priority over retained closed branches.
  On leaving an authenticated page the shell
  hands them over through `sessionStorage`. The next document consumes the
  handoff once and reuses it on a browser reload with the same signed-in
  session, user, tenant, language and list permissions. The address, Tree ID,
  source, label, depth, initial selection and saved preferences must match.
  The authorized lists recheck the roots and reused branches, parent first.
  An unchanged result keeps the displayed tree in place. Changes appear
  together after the check. A newer choice or collapse stays where its node
  still exists, and a changed or removed selection is reported. Missing,
  incomplete or oversized snapshots use the ordinary load by parent.
  Explicit refresh requests current data.
  [FB-0234](feedback.md#fb-0234), [FB-0244](feedback.md#fb-0244).
- **Keyboard and screen readers:** one tab stop, `role="tree"` named by the
  view's title, `aria-activedescendant` on the focused node; nodes are
  `treeitem`s with `aria-level`, `aria-selected` and, with children,
  `aria-expanded`; a nested level is a `group`. ArrowUp and ArrowDown move the
  focus, ArrowRight expands (or moves to the first child), ArrowLeft collapses
  (or moves to the parent), Home and End; `*` expands the focused node and its
  siblings (one level, within the [caps](#tree-expansion)); Space selects,
  Enter selects and activates. The focus moves without selecting, so a host
  does not reload its panels while the user moves through the tree. The focus
  ring shows only while the tree has the keyboard focus. Suite's own key
  navigation is off. The states, `aria-expanded` included, are set again after
  every change, also after a bulk one; the tree is `aria-busy="true"` while
  a bulk expansion loads.
- **Motion:** in Blade and Blade Night an opening or closing folder eases to
  its new height, also when its children arrive after opening; several
  folders changing in one step (a level of `expandAll` or `*`,
  `collapseAll`) change at once ([theme motion](shell.md#theme-motion)).
- **Security:** every read is the resource's ordinary, ACL-checked `list`; a
  node the actor cannot read is never loaded, and a child count is the
  server's ACL-filtered `_subview`. Snapshots belong to the shell's current
  user and tenant and are cleared on session end, tenant switch, a reported
  read denial, or a built-in permission change through this shell. A reload
  checks list rules and tenant scope for the offered tree sources and
  their declared count fields in the new document.
  Previously read rows can remain visible until the background reads reflect
  changes in the data or in access outside this context. The host's region
  gives the tree its title.

<a id="tree-expansion"></a>

**Expansion** ([FB-0168](feedback.md#fb-0168)): the upper levels can open on
the first display, the whole tree can open or close from code, and a built-in
control can offer both to the user.

```ts
const tree = new app.components.Tree({ view: "categories_tree", label: "name", id: `${view.id}.tree`,
  expand: 2, expandControl: true, signal });
const result = await tree.expandAll();   // { complete, nodes, reason? }
if (!result.complete) console.info("partly expanded", result.reason);
await tree.collapseAll();
```

- `expand` (whole number `0`–`10`, default `0`): the levels opened while no
  expansion is stored. `1` opens the roots (their children show), `2` the roots
  and their children (three levels show). The children still load lazily,
  level by level, through the ordinary `list`: one request (one per 200
  children, at most five) for the roots, then one for each node with children
  on the opened levels, four at a time. `expand: 2` over 5 roots of which 4
  have children, with 12 children having children of their own, costs
  1 + 4 + 12 = 17 requests. A leaf (`_subview` 0) costs none.
- **Stored expansion versus `expand`:** with `id`, the tree stores the
  expansion only after the user changed it (a toggle click, ArrowRight or
  ArrowLeft, `*`, `select(id)` opening a collapsed ancestor, `expandAll`,
  `collapseAll`), also while the initial expansion or a restore still loads;
  until then it stores only the selection. A stored expansion
  always wins: `expand` applies on a first mount, without `id`, and after a
  preference reset (the stored `blade-ui:1:` entry removed), never over an
  expansion the user made, not even one where everything is collapsed. A node
  the user collapsed is not stored as expanded, so it stays collapsed on the
  next mount, and a running expansion or restore does not open it again; its
  expanded descendants stay stored and open again when it is expanded, also
  on a later mount (they load only then). A remembered selection below a
  collapsed node is not loaded on the next mount: `initial` applies (the
  ancestors of a loaded selection still open, as `select(id)` does).
- **A selection made during the start wins** ([FB-0170](feedback.md#fb-0170)):
  the remembered selection and `initial` apply only when the roots, the
  `expand` levels or the restored expansion have finished loading and nothing
  was selected or cleared meanwhile. A node the user clicks or reaches by
  keyboard, or that `select(id)` chooses, while the start still loads stays
  selected: no second `select` follows, and that node is stored. The
  ancestors the restore opens afterwards do not move or clear it.
- `expandAll()` opens every node down to 10 levels, loading what is not
  loaded (four loads at a time), and stores the result as the user's
  expansion. `collapseAll()` closes every node, cancels a running
  `expandAll` or initial `expand` at once (also before the roots have
  arrived) and stores that too. Both run after a pending start or `refresh`,
  so they act on its result. `expandAll()` on a tree whose roots failed to
  load resolves `{complete: false, nodes: 0, reason: "error"}`. Both settle when their work is done; the
  selection stays (no `select` event), the document focus stays where it was,
  and a tree focus hidden by `collapseAll` moves to its root node.
- **Caps** (the same for `expand`, `expandAll` and `*`): at most 1000
  children load per node (per node, not per level: a level may hold more), at
  most 10 levels open, and a bulk expansion starts no child load that would
  bring the tree past 2000 loaded nodes. The check uses the server's
  ACL-filtered child count (`_subview`), so with an SQL list source the tree
  never passes 2000; with a source that gives no count, the load that crosses
  the cap is the last. At a cap the expansion stops and leaves the rest
  collapsed (unloaded). `expandAll()` resolves `{complete: true, nodes}` or
  `{complete: false, nodes, reason}`, `reason` being `"nodes"`, `"depth"`
  (nodes below the tenth opened level have children), `"children"` (a node
  has more than 1000 children), `"cancelled"` (`refresh()`, `collapseAll()`,
  another expansion or `destroy()` stopped it; their pending loads are
  aborted) or `"error"` (a load failed: the first failure aborts the other
  pending loads and shows one error dialog, after which the promise settles).
- **Stored size:** at most 200 expanded ids are kept, upper levels first (the
  roots, then their children, …). After an `expandAll` of more than 200
  nodes with children, the next mount restores the upper part and leaves the
  deepest levels collapsed.
- `expandControl: true` puts a [CommandBar](#commandbar) above the tree,
  `expandControl: {placement: "bottom"}` below it (`"top"` is the default;
  another value throws `TypeError`). The bar is the list's command row (its
  shadow over the scrolling tree) with one pinned icon button on its right,
  where a list keeps its view controls ([FB-0191](feedback.md#fb-0191)):
  while a node with children is collapsed (a node whose children are not
  loaded counts) it is `Mindet kinyit` (lines over a down chevron) and runs
  `expandAll()`; once every node with children is open, or the last
  `expandAll()` stopped at a cap, it is `Mindet bezár` (an up chevron over
  lines) and runs `collapseAll()` (English `Expand all`, `Collapse all`).
  The label is its accessible name and tooltip and follows the state, also
  after the user's own expansions, an `expand` depth that opened everything,
  a collapse or a `refresh`; the bar is named by the view's title. It is a
  native toolbar button (keyboard reachable, Enter or Space) and stays in the
  bar at every width, with no `Műveletek` menu. While a bulk expansion
  (`expandAll`, the initial depth) loads, the icon spins, its name reads
  `Betöltés…` and it keeps the focus, and a click does nothing. Stopped at a
  cap, the control reports it with a
  non-blocking warning toast (`Nem nyílt ki minden elem: legfeljebb 2000
  elem, 10 szint és elemenként 1000 gyermek tölthető be.`). Without the
  option no control is drawn. Tree navigation has no control, no `*` and no
  depth option, and it never restores an expansion (no `id`, no `refresh`),
  so its requests are unchanged: one load per node the user expands.

<a id="tree-presentation"></a>

##### Tree presentation

Every Suite Tree of 61ade (`Tree`, [tree navigation](workspaces.md#tree-navigation),
the [file manager](#filemanager-and-filepicker)'s folder tree) draws its rows like grid rows
([FB-0193](feedback.md#fb-0193)): each row is 40 px high (the grid's default
`rowHeight`) and its text is one line cut with an ellipsis. Two parts of the
look are on by default and can be switched off:

- `striped` (default `true`): every second displayed row has the grid's
  alternate background (`--blade-row-alternate`, so it stripes in the themes
  where grids stripe, Blade and Blade Night), counted in displayed order:
  opening or closing a node restripes the rows below it. Hover, focus and
  selection draw over it.
- `lines` (default `true`): dotted lines connect each node to its parent (the
  vertical line runs to the last child's middle) and an expandable node shows
  a small framed box with `+` (closed) or `−` (open) instead of Suite's arrow. The
  box is the same toggle (click; the keys and ARIA states are unchanged), and
  its meaning is also in `aria-expanded`. Roots have no connector.
- The selected row is the grid's cursor row of the same skin (tint, thin
  frame, straight gradient bar, one sweep; [61ade character](shell.md#61ade-character)).
- With [theme motion](shell.md#theme-motion) a folder's children slide out
  from under its row and back under it, lines and stripes included; the
  stripes are recomputed when the slide has settled.

```ts
new app.components.Tree({ view: "categories_tree", label: "name", striped: false, lines: false, signal });
```

Tree navigation takes them as `Registry::tree(..., striped: false, lines:
false)` or JSON `"tree": {..., "striped": false, "lines": false}`. A value
other than a boolean is a `TypeError` (component) or a configuration error
(JSON). The file manager's tree keeps both on. CSS: the root is
`.blade-tree` with `.blade-tree--striped` / `.blade-tree--lines`; tokens
`--blade-tree-row-height` (40 px; geometry of stripes and lines follows it)
and `--blade-tree-line` (line and box colour).

<a id="tree-icons"></a>

##### Tree icons

Without an icon option every node shows Suite's folder glyph (open while it is
expanded), as before. Two options give the nodes icons from the
[catalog](icons.md) instead ([FB-0239](feedback.md#fb-0239)):

```ts
new app.components.Tree({ view: "categories_tree", label: "name", icon: "bi bi-tag", signal });      // every node
new app.components.Tree({ view: "demo_registry_nodes", label: "name", iconField: "kind", signal });  // per record
```

- `icon`: one class pair (`bi bi-<name>`, legacy `dxi dxi-<name>`) that every
  node shows in place of the folder glyph, whether it is open or closed. It
  is decorative: the node's name is still its label. Another value is a
  `TypeError`.
- `iconField`: an [icon column](icons.md) of the view (`column.presentation:
  "icon"`, so its values are class pairs and its static `options` name them),
  not the parent field. Each node shows its record's value. The option's text
  is the node's `aria-description` and the glyph's tooltip, so the icon never
  carries meaning on its own. A record whose value is empty or not a class
  pair shows `icon`, or the folder glyph without one. Any other id is a
  `TypeError`. The value comes with the ordinary `list` row, so a field the
  actor may not read shows the fallback. A computed select (JSON
  `storage.computed`) can derive the icon from other fields, as the feature
  demo's root keys do.
- Choose the icon for the node's own meaning, as for a menu entry
  ([icon choice](icons.md#icon-choice)). Folder glyphs mean files and folders.
- Tree navigation takes the same two options: PHP `Registry::tree(...,
  icon: 'bi bi-tag')` or `iconField: 'kind'`, JSON `"tree": {..., "icon":
  "bi bi-tag"}` or `"icon_field": "kind"`. There the field must be a column of
  the node view. A wrong class, a field that is not an icon column or not in
  the node view is a configuration error.
- The icon takes Suite's icon slot of the 40 px row and its theme colour; the
  lines, stripes, toggle and selection are unchanged. Snapshots for a
  same-tab return keep the rows, so the icons come back with them.

Limits: one label column per node (no counts or templates), no drag
moves, no search, no node actions (tree navigation keeps its own toolbar), not
live. A bulk expansion is not a search: it is bounded by the caps above, and
it reloads nothing already loaded (`refresh` does).

<a id="commandbar"></a>

#### CommandBar

For a page or tab's own commands, use the
[page and tab attachment recipe](#page-command-bars).

The list's own responsive command bar: native Toolbar buttons that move into
one `Műveletek` menu below 768 px or when they do not fit, keeping ids, state
and click events. Every normal native Toolbar, including one attached directly
to a Layout, shares the same inset as the list command bar through
`--blade-toolbar-padding` (default `4px 8px`). This is common widget CSS,
not a per-view setting. A normal Toolbar also owns its 1 px bottom rule,
coloured by `--dhx-border-color`, even above borderless content. Direct Layout
attachments and CommandBar delegate the adjoining rule to it so the divider
is not doubled by the host cell or a following native Grid. The shell
navigation, status bar and window header keep their role-specific geometry.
When a Toolbar or CommandBar fills a framed `space`/`wide` Layout cell,
the cell owns the outer edge: the toolbar draws no additional top or bottom
rule against it. A toolbar within a panel, above or below content, keeps its
separator ([FB-0156](feedback.md#fb-0156)).

```ts
const t = (key: string) => app.i18n.t(key);
let playing = false;
const bar = new app.components.CommandBar({ signal: host.signal, items: [
  { id: "back", label: t("Vissza a listához"), icon: "bi bi-arrow-left" },
  { type: "separator" },
  { id: "play", label: t("Lejátszás"), icon: "bi bi-play-fill", iconOnly: true, disabled: true }] });
bar.on("click", ({ id }) => { if (id === "play") { if (playing) player.pause(); else void player.play().catch(() => {}); } });
bar.mount(layout.getCell("commands"));
player.on("loaded", () => bar.update("play", { disabled: false }));
player.on("play", () => { playing = true; bar.update("play", { label: t("Szünet"), icon: "bi bi-pause-fill" }); });
player.on("pause", () => { playing = false; bar.update("play", { label: t("Lejátszás"), icon: "bi bi-play-fill" }); });
```

`CommandItem` is a button (`CommandButton`: `id`, `label`, `icon`,
`iconOnly`, `pinned`, `disabled`, `hidden`; `type` omitted or `"button"`), one of the
[view controls](#commandbar-view-controls), a header's
[`title` or `popup`](#commandbar-title), a separator
(`CommandSeparator`, `{ type: "separator" }`, no id), a divider line between
groups that stays in the collapsed menu, or a spacer (`CommandSpacer`,
`{ type: "spacer" }`, no id), which pushes the following buttons to the right
and is left out of the collapsed menu. An `iconOnly` button shows only its
icon in the bar, like a player's transport control: the label stays its
accessible name and tooltip (visually hidden text) and is the item's text in
the collapsed menu; `update` of its label changes the tooltip too. A
`pinned` button (or toggle) stays in the bar beside the collapsed `Műveletek`
menu, like a range ([FB-0177](feedback.md#fb-0177)), on its side: a spacer
before a pinned item stays, so it remains on the right
([FB-0191](feedback.md#fb-0191)); a bar whose items are all
pinned has no menu (a non-boolean `pinned` throws `TypeError`). Labels are
plain text (escaped). Button ids match `[A-Za-z0-9_.:-]+`, are unique and
`blade-command-menu` is reserved; otherwise the constructor throws
`TypeError`. `update(id, changes)` changes the label, icon, disabled or hidden
state, also while the item sits in the collapsed menu (a play/pause toggle is
one button whose label and icon change). `toolbar` is the
underlying Suite Toolbar. Escape closes an open menu, also one opened with the
mouse, and returns the focus to its toggle (`Műveletek`); the key does not
reach a window behind it. Toolbar submenus open to the right when their actual
themed width fits in the viewport, including inside `Műveletek`. Otherwise the submenu replaces its
ancestors at the original toolbar button; a native `Vissza` entry or ArrowLeft
returns to the parent. This also applies near the right edge on desktop, and
each deeper level makes the same fit decision. The feature demo's viewer drives
a `MediaPlayer` with it ([example](#example-record-view)).

<a id="commandbar-view-controls"></a>

**View controls.** A player's bars above and below its viewer hold more than
buttons. Every item stays usable in the collapsed `Műveletek` menu, and keys
and screen readers get the native Suite toolbar and menu semantics:

```ts
const top = new app.components.CommandBar({ label: t("Nézet"), signal, items: [
  { id: "back", label: t("Vissza"), icon: "bi bi-arrow-left" },
  { type: "toggle", id: "grid", label: t("Rács"), icon: "bi bi-grid", pressed: true },
  { type: "group", items: [{ id: "zoomIn", label: t("Nagyít"), icon: "bi bi-plus-lg", iconOnly: true },
                           { id: "zoomOut", label: t("Kicsinyít"), icon: "bi bi-dash-lg", iconOnly: true }] },
  { type: "spacer" },
  { type: "segmented", id: "layout", label: t("Nézet"), options: [{ value: "one", label: t("Egy") }, { value: "two", label: t("Kettő") }] }] });
const bottom = new app.components.CommandBar({ label: t("Lejátszás"), placement: "bottom", signal, items: [
  { id: "play", label: t("Lejátszás"), icon: "bi bi-play-fill", iconOnly: true },
  { type: "range", id: "position", label: t("Pozíció"), min: 0, max: 1, value: 0, valueLabel: clock },
  { type: "select", id: "speed", label: t("Sebesség"), options: [{ value: "1", label: "1×" }, { value: "2", label: "2×" }] }] });
top.on("toggle", ({ id, pressed }) => id === "grid" && viewer.grid(pressed));
bottom.on("change", ({ id, value }) => id === "position" ? player.seek(Number(value)) : setSpeed(Number(value)));   // setSpeed, clock: the page's own
player.on("loaded", () => bottom.update("position", { max: player.duration() }));
player.on("position", ({ seconds }) => bottom.update("position", { value: seconds }));
top.mount(page.cell("above")); bottom.mount(page.cell("below"));
```

| Item | In the bar | In `Műveletek` | Reports |
| --- | --- | --- | --- |
| `toggle` (`CommandToggle`: a button's keys and `pressed`) | button with `aria-pressed`, a primary tint and an inset bar while pressed | checked entry (`menuitemcheckbox`) | `toggle {id, pressed}` (no `click`) |
| `select` (`id`, `label`, `icon`, `iconOnly`, `options` 2–20 `{value, label}`, `value`) | menu button `label: option`, its options checked entries (`menuitemradio`) | submenu | `change {id, value}` |
| `segmented` (as `select`, an option may have an `icon`) | joined buttons, the chosen one pressed; tooltip `label: option` | submenu `label: option` | `change {id, value}` |
| `group` (`items`: 2–12 buttons or toggles) | joined buttons | a block between separators | their own events |
| `menu` (`CommandMenu`: `id`, `label`, `icon`, `iconOnly`, `disabled`, `hidden`, `items` 1–12 buttons and separators, at least one button) | one menu button, its entries a Suite menu | submenu | each entry `click {id}`, like a button ([below](#commandbar-menu)) |
| `title` (`CommandTitle`: `id`, `label`, `badge`, `hidden`; first item only) | heading text, shortened with `…` | stays first, before the menu | nothing ([title](#commandbar-title)) |
| `popup` (`CommandPopup`: a button's keys, `menuLabel`, `items` as `app.ui.menu`, `empty`) | button opening a popup menu | stays in the bar beside the menu | `select {id, item}` ([popup](#commandbar-title)) |
| `range` (`id`, `label`, `min`, `max`, `step`, `value`, `valueLabel`) | native range input (`slider`, value text from `valueLabel`), the remaining width, at least 120 px | stays in the bar beside the menu | `change {id, value}`: at most every 100 ms while dragged, then on release |

- A pick of the chosen option reports nothing; changes from code (`update`)
  report nothing. `update(id, changes)` takes `label`, `icon`, `disabled`,
  `hidden`, `pressed` (toggle), `value` (select, segmented, range), `options`
  (select, segmented; the value stays if still offered, else the first) and
  `min`/`max` (range); an invalid value throws `TypeError`. `value(id)` is a
  toggle's state, a choice's value or a range's number.
- `valueLabel: true` shows the number beside the range; a function gives the
  text, which is also its `aria-valuetext` (a clock for a position). The
  range's label is its accessible name and tooltip. Its arrow, Home/End and
  Page keys move the thumb and never reach the toolbar's own key navigation.
- Several bars on a page (above and below a viewer) may use the same item
  ids: each bar's ids, menus and popups are its own, and Escape closes the
  menu that is open. `label` names the toolbar for screen readers;
  `placement: "bottom"` draws the bar's rule above it instead of below.
- Ids are `[A-Za-z0-9_.:-]+` and unique within a bar, including inside a
  group or a menu; a malformed item (an unknown `type`, options, range
  bounds, a group, a menu) throws `TypeError`.

<a id="commandbar-menu"></a>

**More actions menu** ([FB-0154](feedback.md#fb-0154)): the commands of the
selected item behind one button instead of permanent buttons.

```ts
const bar = new app.components.CommandBar({ label: t("Munka"), signal, items: [
  { type: "toggle", id: "side", label: t("Oldalpanel"), icon: "bi bi-layout-sidebar-reverse", pressed: true },
  { type: "spacer" },
  { type: "menu", id: "more", label: t("További műveletek"), icon: "bi bi-three-dots-vertical", iconOnly: true, items: [
    { id: "show", label: t("Megjelenítés az oldalpanelen"), disabled: true },
    { id: "copy", label: t("Szöveg másolása"), icon: "bi bi-copy", disabled: true },
    { type: "separator" },
    { id: "delete", label: t("Törlés"), icon: "bi bi-trash", disabled: true }] }] });
list.on("target", ({ row }) => { for (const id of ["show", "copy", "delete"]) bar.update(id, { disabled: !row }); }, { signal });
bar.on("click", ({ id }) => run(id));   // run: the page's own
```

- `items`: 1–12 entries, `CommandButton`s (at least one) and
  `CommandSeparator`s; a toggle, a choice, a range, a group or a nested menu
  throws `TypeError`, as does a menu without `label`. Entry ids are ids of
  the bar (unique with every other item).
- In the bar it is one Suite menu button (with `iconOnly` only its icon, the
  label its tooltip and accessible name); in the collapsed `Műveletek` menu
  it is a submenu with the existing submenu fit rules (to the right when it
  fits, otherwise replacing its parent with `Vissza`).
- Each entry reports `click {id}` like a button, also from the collapsed
  menu. `update(entryId, {label, icon, disabled, hidden})` changes an entry
  and `update(menuId, {label, icon, disabled, hidden})` the button, also
  while the bar is collapsed.
- Native Suite toolbar and menu semantics: `menu` named by the label,
  `menuitem` entries (a disabled one is `aria-disabled`), Enter and the
  arrows; Escape closes the open menu and returns the focus to its button
  (to `Műveletek` when collapsed).

<a id="commandbar-title"></a>

**Panel header: title, popup menu, icons when narrow**
([FB-0248](feedback.md#fb-0248)). A panel, tab or window header (a
conversation's name with its history, a new item and more actions) is a
`CommandBar` too, never a project's own Suite Toolbar:

```ts
const head = new app.components.CommandBar({ label: t("Beszélgetés"), narrow: "icons", signal, items: [
  { type: "title", id: "title", label: thread.title, badge: thread.closed ? t("lezárva") : undefined },
  { type: "spacer" },
  { type: "popup", id: "history", label: t("Előzmények"), icon: "bi bi-clock-history", items: () => historyGroups() },
  { id: "new", label: t("Új beszélgetés"), icon: "bi bi-plus-lg" },
  { type: "menu", id: "more", label: t("További műveletek"), icon: "bi bi-three-dots-vertical", iconOnly: true, items: actions }] });
head.on("select", ({ id, item }) => id === "history" && openThread(item));   // historyGroups, actions, openThread: the page's own
head.on("click", ({ id }) => run(id));
head.mount(layout.getCell("head"));
head.update("title", { label: renamed, badge: "" });                         // "" removes the badge
```

- **`title`** (`CommandTitle`: `id`, `label`, `badge`, `hidden`): the bar's
  heading text, only as its first item and at most one. It stays first, also
  before the collapsed `Műveletek` menu, and shortens with `…` before any
  command moves; `badge` is a short state marker beside it. Both are plain
  text (escaped) in the theme's tokens. Without the bar's `label` the title
  is the toolbar's accessible name. `update(id, {label, badge, hidden})`.
- **`popup`** (`CommandPopup`: `id`, `label`, `menuLabel`, `icon`,
  `iconOnly`, `disabled`, `hidden`, `items`, `empty`): a button carrying an
  [`app.ui.menu`](#popup-menu) popup menu, with its group headings, checked
  entries, details, scrolling and APG menu-button keys. `items` is an array
  (validated at construction) or a function read at every opening. The menu
  is named `menuLabel` or else the label (`Modell: Automatikus` names its
  menu `Modell`). The bar binds the menu to its drawn button and again after
  every redraw (a resize, a collapse, `update`), so the project never looks
  up the button. It always stays in the bar, also beside the collapsed menu.
  A pick reports `select {id, item}`; a click reports nothing.
  `update(id, {label, icon, disabled, hidden})` changes the button.
- **`narrow: "icons"`**: below 768 px every item with an icon shows only its
  icon; its label stays the tooltip and the hidden accessible name. The bar
  collapses into `Műveletek` only when it still does not fit. The default
  `narrow: "menu"` keeps the list's behaviour (collapse below 768 px).
- Header rules: title first, then a `spacer`, then the commands on the right,
  with the *more actions* `menu` last; Bootstrap Icons only
  ([icons](icons.md)). The labels are the project's own words.
- **Accessible name** ([FB-0251](feedback.md#fb-0251)): the `role="toolbar"`
  element itself is named by `label`, else by the `title` item's label, else
  it keeps Suite's `Eszköztár`. The name survives every redraw (a resize, the
  collapse into `Műveletek`, `narrow: "icons"`, `update` of the title); the
  outer element carries no name of its own. Give each bar of a page a
  `label` or a title so they can be told apart.
- **Height** ([FB-0251](feedback.md#fb-0251)): a bar mounted into a plain
  element is at least `--blade-command-bar-height` (48 px, the framework's
  command rows) high, with the same rule and padding as a bar in a cell, so
  a project sets no height of its own. In a Layout cell, an `AppWindow` or a
  `ViewHost` the container decides; a shorter bar belongs in a cell of that
  height.

<a id="pagelayout"></a>

#### PageLayout

A page's panels as declared data, with the framework list layout's behaviour:
one Suite space Layout from a region tree (typically the view's
`options.layout`), plain-text panel headers (Suite renders them as text, so
they are not HTML-escaped again), the user's panel sizes and collapsed
panels kept per page and user (`UiPreferences`, keyed by `id`), and a resizer
double-click that restores the declared sizes.

```ts
const page = new app.components.PageLayout({ id: view.id, tree: view.options.layout });
host.attach(page);
new app.components.ListView({ view: "signage_assets", panel: false, signal }).mount(page.cell("library"));
page.attach("preview", element);                       // a plain element of the page's own
signal.addEventListener("abort", () => page.destroy(), { once: true });   // last: after the components in its cells
```

- `tree`: `PageRegion`, the options of a list view's region (`header`, `rows`,
  `cols`, `width`, `height`, `minWidth`, `minHeight`, `resizable`,
  `collapsable`, `collapsed`); a leaf has its own `id` (`[a-z][a-z0-9_-]*`,
  unique, not starting with `blade-`, which the framework reserves), a branch
  `rows`, `cols` or `tabs` and no id; at most 6 levels and 30
  regions, sizes 40–3000 px. Anything else throws `TypeError`; `id` is the
  preference key (usually the view id).
- A `tabs` branch is a [`Tabs`](#tabs) in its place: 1–12 leaves, each a tab
  with its `id` and a `header` (the tab's label, 1–80 characters) and no
  other option; the branch itself takes the sizes and `resizable` only (no
  header, no collapsing). `cell(id)` and `attach(id, …)` of a tab region work
  like any region's; `tabsOf(id)` returns the `Tabs` of the branch holding
  region `id` (to `select` a tab or follow `change`), otherwise `undefined`.
  The last active tab is kept per page and user. `guard` (the
  [`Tabs` guard](#tabs), with region ids) applies to every `tabs` branch of
  the page (not to an `accordion` branch, whose closed sections keep their
  content), so a dirty form in one tab asks before it is left:

  ```json
  { "width": 340, "tabs": [ { "id": "details", "header": "Összesítés" }, { "id": "settings", "header": "Lista beállításai" } ] }
  ```

  ```ts
  const page = new app.components.PageLayout({ id: view.id, tree: view.options.layout,
    guard: ({ from }) => from !== "settings" || !settings?.dirty() || app.ui.dialog({ mode: "confirm", severity: "warning",
      title: t("Nem mentett módosítások"), message: t("A lista beállításainak nem mentett módosításai elvesznek."), confirmLabel: t("Elvetés") }) });
  ```
- An `accordion` branch is an [`Accordion`](#accordion) in its place: 1–12
  leaves, each a section with its `id`, a `header` (the section's label, 1–80
  characters) and optionally `open: true` (open at first); the branch takes
  the sizes, `resizable` and `multiple` (several sections open at once) and no
  header or collapsing. Without `multiple` at most one leaf is `open`, and
  without any the first section opens. The open sections are kept per page and
  user; the declared `open` applies until the user has toggled a section.
  `cell(id)` and `attach(id, …)` of a section work like any region's;
  `accordionOf(id)` returns the `Accordion` of the branch holding region `id`
  (to `open` a section or follow `toggle`), otherwise `undefined`. `open`
  outside an `accordion` branch and `multiple` outside its branch throw
  `TypeError`:

  ```json
  { "width": 380, "multiple": true, "accordion": [ { "id": "details", "header": "Adatok", "open": true }, { "id": "edit", "header": "Szerkesztés" } ] }
  ```
- A region with a minimum but no explicit size fills the remaining space
  on its parent axis. The minimum is a floor; it does not make the region
  fit its content.
- `resizable` draws the draggable line after the region; on the last region
  of its branch, before it ([FB-0221](feedback.md#fb-0221)). Dragging a line
  resizes both neighbours. Each one with a declared size keeps the user's
  size, whichever side of the line it is on, and a double-click on the line
  restores both. When the branch has one flexible region, that region
  continues to fill the available space after a drag, including when a
  containing layout resizes it.

<a id="pagelayout-inner"></a>

- **Inner layout** (`inner`, [FB-0222](feedback.md#fb-0222)): a region
  holds a frameless layout of its own instead of content: `inner` is a
  `rows` or `cols` branch whose regions have no frame or header and are
  divided by 1 px draggable lines, each taking the drag 8 px across it. Each
  grip has three dots centred along its divider and visible above adjacent
  loading and empty states. The dots take the theme's accent colour when
  the pointer is over the drag area ([FB-0230](feedback.md#fb-0230),
  [FB-0231](feedback.md#fb-0231)).
  Its regions are ordinary regions of the page: `cell(id)`, `attach(id, …)`,
  `placeholder(id, …)`, kept sizes and the double-click work as for any
  region, so each holds any component or element. The region holding it
  keeps its header, size, `resizable` and collapsing, but is not a mount
  target (`cell`, `attach` and `placeholder` of it throw `Error`). It needs
  an `id` only to keep its size or to collapse. Inside an inner layout there
  is no collapsing, no `tabs` or `accordion` branch and no further `inner`
  (`TypeError`); only a region takes a header, its own
  [frameless one](#pagelayout-inner-header). It is part of the same Suite Layout (a line
  sub-layout), so one preference key keeps every size:

  ```ts
  const page = new app.components.PageLayout({ id: view.id, tree: { cols: [
    { id: "list", header: t("Médialapok"), width: 420, resizable: true, collapsable: true },
    { id: "selected", header: t("Kiválasztott médialap"), inner: { rows: [
      { cols: [{ id: "data", width: 320, resizable: true }, { id: "image" }] },
      { id: "brief", height: 200, minHeight: 80, resizable: true },
    ] } },
  ] } });
  new app.components.ListView({ view: list, panel: false, signal }).mount(page.cell("list"));
  player.mount(page.cell("image"));
  page.attach("brief", element);
  ```

  A tree that is only `{ inner: … }` is frameless as a whole (a Suite line
  Layout), for the content of a tab or a region below its command bar:
  mount that `PageLayout` into the tab's cell with its own `id`.

<a id="pagelayout-inner-header"></a>

- **Inner region header** (`header`, `count`,
  [FB-0227](feedback.md#fb-0227)): a region of an inner layout can take a
  `header` (plain text, 1–150 characters, escaped; a view's declared header
  arrives translated) and, with it, a `count` (a non-negative integer). The
  region then shows one frameless row at its top: the title, and the count as
  a small pill badge beside it, formatted in the selected locale. A line in the
  border colour separates the row from the content. The content fills the
  rest of the region and scrolls on its own; the header stays. There is no
  frame and no collapse button (collapsing remains a framed panel's feature).
  The look uses theme tokens only, so every skin follows it. A region
  without `header` is unchanged. A `count` without `header`, a `header` on a
  branch of an inner layout and an empty header throw `TypeError`.

  `cell(id)`, `attach(id, …)`, `placeholder(id, …)` and the kept sizes
  address the content below the header, so an empty region shows its
  placeholder text there. The header takes its height from the region:
  `height` and `minHeight` still mean the whole region.
  `header(id, {label?, count?})` changes the title or the count later,
  without rebuilding the layout; `count: null` hides the badge, and keys left
  out keep their value. An id without a header, a region holding an inner
  layout or an undeclared id throws `Error`; any other value throws
  `TypeError`.

  The region is a `region` landmark named by its title and the spoken count,
  `{count} elem` (English `{count} items`), for example
  `Kizárt 3 elem`. The visual digit is hidden from assistive technology.
  Without a count, the title alone is the name.

  ```ts
  const page = new app.components.PageLayout({ id: view.id, tree: { inner: { cols: [
    { id: "list", header: t("Elemek"), count: 0, width: 420, resizable: true },
    { rows: [
      { id: "included", header: t("Kiválasztott"), count: 0 },
      { id: "excluded", header: t("Kizárt"), count: 0, height: 220, minHeight: 120, resizable: true },
    ] },
  ] } } });
  page.header("excluded", { count: rows.length });
  ```
- `cell(id)` is a declared region's cell, the mount target of every
  component (an undeclared id throws `Error`); `attach(id, content)` puts a
  Suite widget, a public component or a plain element there (the view host's
  rule), released with the layout. A region holds either attached content or
  mounted components. An attached public component is mounted there (its
  events are delivered; it can be attached or mounted once), the same for
  `Tabs.attach` and `Accordion.attach`.
- A region without content shows a placeholder: `Nincs megjeleníthető
  tartalom.`, its own text or the loading indicator with
  `placeholder(id, {text, busy})` ([states](#loading-and-empty-states)), also
  `Tabs.placeholder` and `Accordion.placeholder`. `busy(id, on)` marks a
  region whose content is about to change
  ([held regions](#busy-filled-region)), also `Tabs.busy` and
  `Accordion.busy`.

<a id="pagelayout-collapse"></a>

- **Collapsing from code** ([FB-0153](feedback.md#fb-0153)): a leaf declared
  `collapsable` (in a `rows` or `cols` branch, also beside a `tabs` or
  `accordion` branch, and in a nested `PageLayout` attached into a tab) is
  collapsed to its header by `collapse(id)` and opened by `expand(id)`, as
  its header click does; both return the resulting state, like
  `isCollapsed(id)`. Any other id (a region that is not `collapsable`, a tab,
  a section, an unknown id) throws `Error`. `collapse {id, collapsed}`
  reports every change of such a leaf: the header click, its keys and the
  page's own call; a call that changes nothing reports nothing. In Blade and
  Blade Night the leaf eases to its new size, also from code
  ([theme motion](shell.md#theme-motion)); the state and the event are
  immediate.
- **Kept or not:** the user's collapse (header click) stays in
  `UiPreferences` as before and applies when the page is built again. A
  call from code is not kept: it is the page's state, such as a phone
  collapsing a region while one tab is shown, and never replaces the user's
  choice. One rule covers both a command bar toggle (the page keeps its own
  preference with `app.preferences` if it wants one) and a transient
  collapse. A page that collapses a region for a while and opens it again
  later remembers whether it was open:

  ```ts
  let restore = false;
  tabs.on("change", ({ id }) => {
    if (id === "work") { if (!page.isCollapsed("control")) { restore = true; page.collapse("control"); } }
    else if (restore) { restore = false; page.expand("control"); }
  }, { signal });
  bar.on("toggle", ({ id, pressed }) => id === "side" && (pressed ? work.expand("side") : work.collapse("side")));
  work.on("collapse", ({ id, collapsed }) => id === "side" && bar.update("side", { pressed: !collapsed }), { signal });
  ```
- **Header name:** the header of a `collapsable` leaf is a button named
  after its region and its state, `‹header› összecsukása` /
  `‹header› kinyitása` in the page's language (`Összecsukás` / `Kinyitás`
  without a header), in place of Suite's English "click to collapse"
  ([FB-0155](feedback.md#fb-0155)). The same holds for every Suite Layout of
  the page, the list layout's panels included.
- Destroy it after the components in its cells (the [Layout recipe](#layout-recipe)).
  A list placed in a region is created with `panel: false`, so the region is
  its panel.
- A page that needs another arrangement on a phone declares it as the
  [`narrow` tree](#pagelayout-narrow) instead of building a second
  `PageLayout`.

<a id="pagelayout-narrow"></a>

**Another arrangement below 768 px** ([FB-0250](feedback.md#fb-0250)).
`narrow` is a second tree with exactly the same leaf regions, typically
columns turned into `tabs` or `rows`:

```ts
const page = new app.components.PageLayout({ id: view.id, signal,
  tree: { cols: [{ id: "thread", width: 420, resizable: true }, { id: "preview" }] },
  narrow: { tabs: [{ id: "thread", header: t("Beszélgetés") }, { id: "preview", header: t("Előnézet") }] } });
page.on("variant", () => page.tabsOf("thread")?.on("change", follow));   // follow: the page's own
```

The feature demo's [media browser](../examples/demo-app/frontend/src/media-browser.ts)
stacks its columns and their inner regions as `rows`, and the
[registry browser](../examples/demo-app/frontend/src/registry-browser.ts)
does the same with its tree and list.

- **Switch.** The page starts in the arrangement of the current width and
  switches when the viewport crosses 768 px. The panels are rebuilt in place,
  and the page keeps its mount. Every region's content moves to the same region of the new
  arrangement as it is: mounted components, attached widgets and elements
  keep their DOM nodes, listeners, selection, typed values, focus and scroll.
  `cell(id)` returns the same object before and after, so placeholders, busy
  marks and the loading indicator stay. An inner region keeps one header and
  count, whichever tree names it. Where the browser has
  `Element.moveBefore` (Chrome), an iframe keeps its document and media keep
  playing. Elsewhere media keep playing and the switch restores focus and
  scroll, but an iframe reloads; a page with a `SandboxFrame` keeps its own
  rebuild (the demo's asset viewer does). A region that lands in a collapsed
  panel waits in a hidden holder until the panel is drawn, so it loses
  nothing there either.
- **Focus.** Focus inside a region stays on the same element: the new
  arrangement opens the tab or section that holds it (a tab opened this way
  skips the guard and is not remembered). When the focused element does not
  exist afterwards (a tab button of the old `Tabs`, a header, a line), the
  focus goes to the header of a collapsed panel holding the region, else to
  the region's new tab or section header, else to the region itself. It never
  falls to the page.
- **Afterwards** `variant {narrow}` is reported and `narrow` tells the
  arrangement. `tabsOf` and `accordionOf` return the new `Tabs` and
  `Accordion`; listeners on the old ones and their `update` changes are
  gone, so bind them again on `variant`. `viewport:change` fires before the
  switch: work that needs the new arrangement belongs on `variant`.
- **Kept per arrangement.** Sizes, collapsed panels, the active tab and the
  open sections are kept under `id` for `tree` and `id:narrow` for `narrow` (a
  `:` no view id contains), so each width keeps its own. A collapse made by code (`collapse`, `expand`) is not
  carried over and the switch reports no `collapse`; `isCollapsed`,
  `collapse` and `expand` apply to the arrangement shown, and throw `Error`
  for a leaf collapsable only in the other one. Inner branches,
  collapsable leaves and headers may differ between the trees.
- **Errors and limits.** `narrow` is validated like `tree`; another leaf set
  throws `TypeError`. Without `moveBefore`, the scroll position inside a hidden tab, a closed
  section or a collapsed panel is not restored. Without `narrow` nothing changes
  and the page adds no listener. With `narrow`, `layout` is the page's outer
  frame, not the panel tree.

<a id="tabs"></a>

#### Tabs

Tabbed panels: one tab open at a time, for content that belongs together but
need not be visible at once, such as a record's details beside its edit form.
The tab row is the native Suite `Tabbar` (header only, `noContent`) and every
tab is a cell of the component's own Layout. Every panel stays rendered and
the inactive ones are hidden with CSS, so content in a hidden tab keeps its
state (a form its input) and may update while hidden (a `RecordDetails`
reloading after a save). Suite's own Tabbar content renders only the active
cell and fails to show again a widget that repainted while hidden
([pitfalls](#pitfalls)).

```ts
const tabs = new app.components.Tabs({ id: `${view.id}.record`, signal, tabs: [
  { id: "details", label: t("Adatok") }, { id: "edit", label: t("Szerkesztés"), disabled: !editable }],
  guard: ({ from }) => from !== "edit" || !form?.dirty() || app.ui.dialog({ mode: "confirm", severity: "warning",
    title: t("Nem mentett módosítások"), message: t("A rekord nem mentett módosításai elvesznek."), confirmLabel: t("Elvetés") }) });
tabs.mount(layout.getCell("record"));
new app.components.RecordDetails({ view: list, record: row, signal }).mount(tabs.cell("details"));
let form: RecordForm | undefined;
tabs.on("change", ({ id }) => {
  if (id === "edit" && !form) { form = new app.components.RecordForm({ resource, action: "update", id: String(row.id) }); form.mount(tabs.cell("edit")); }
});
```

- `tabs`: 1–12 `TabDefinition`s in display order: `id` (`[a-z][a-z0-9_-]*`,
  unique), `label` (plain text, 1–80 characters, escaped), optional
  `disabled`; at least one tab is enabled. Anything else throws `TypeError`.
- `active`: the first active tab (an enabled one). Without it the remembered
  tab with `id`, otherwise the first enabled tab. `id`
  (`[a-z][a-z0-9_.-]*`): the preference key under which the last active tab
  is kept per page and user; without it nothing is stored.
- `guard({from, to})`: asked before every change, from a click, the keys and
  `select`. `true`, or a promise resolving `true`, lets it happen; anything
  else keeps the current tab, and a pending answer holds the change. A throw
  keeps the current tab and is logged. The guard does not run when the
  component (or its window) is destroyed.
- `cell(id)` is a tab's Layout cell, the mount target of every component;
  `attach(id, content)` puts a Suite widget, a public component or a plain
  element there (released with the tabs). An undeclared id throws `Error`.
  A tab without content shows its placeholder (`placeholder(id, {text,
  busy})`, [states](#loading-and-empty-states)); `busy(id, on)` marks a
  tab whose content is about to change ([held regions](#busy-filled-region)).
  A tab with its own commands attaches a Layout holding the command row
  above the content ([recipe](#page-command-bars)).
- `active()` is the open tab's id; `select(id)` opens a tab as a click does
  (guard included) and resolves whether it is open afterwards (a disabled tab
  resolves `false`); `update(id, {label, disabled})` changes a tab, and
  disabling the open tab throws `Error`. `change {id, previous}` follows
  every change. `tabbar` is the Suite Tabbar of the tab row.
- Keyboard and accessibility: Suite's ArrowLeft/ArrowRight (and Home/End) move
  between enabled tabs and open them; the tab row is a `tablist`, each button
  a `tab` with `aria-selected` and `aria-controls`, each panel a `tabpanel`
  labelled by its tab, and only the open tab is in the page's tab order. Tab
  buttons get the theme's inset focus ring.
- Presentation (every skin, from the Suite and skin variables): the tab row
  is the panel's header (37 px, the header surface, Blade chrome and title
  type, its divider); tabs start at the panel's edge with dividers between
  them and labels on the content's 20 px inset; the open tab has the panel's
  surface and an accent top edge and no divider below it, so it opens into its
  content like a folder. The divider continues across the unused width beside
  the tabs, matching the line below inactive tabs. The header fills at least
  the row width while retaining Suite's overflow scrolling. Suite's sliding
  underline is not used. The DOM ids Suite derives from tab
  ids are prefixed per instance, so two `Tabs` may use the same tab ids.
- Create the content of a tab when the tab first opens if it costs a request
  (the example's form). A discarded form may be recreated at once, in the same
  `change` handler that destroyed it ([components](#components)).
- The feature demo's playlist editor declares a `tabs` branch in its
  [`PageLayout`](#pagelayout) ([demos](demos.md#toolkit-consumer)).
  Verification: `tests/shell/tabs.spec.cjs`.
- Limits: tabs on top only; no closable, reorderable, scrolling-arrow or
  icon tabs; the tab row does not wrap. Tabs wider than the row rely on
  Suite's own header scrolling, which was not verified beyond two tabs at
  390 px.

<a id="accordion"></a>

#### Accordion

Stacked collapsible sections in one panel: for a tall region whose content
is read in parts, such as a record's details above its edit form, without
the space of a separate panel for each. Every section is a cell of the
component's own Suite Layout under its Suite cell header (the label, plain
text); the open sections share the height and a closed one keeps only its
header. Every section stays rendered and a closed one is hidden with CSS, so
its content keeps its state (a form its input) and may update while closed.
Suite's own collapsed cell (`collapsable`) leaves its content out of the
render, like the inactive tab of a plain Tabbar ([pitfalls](#pitfalls)), so
the accordion does not use it.

```ts
const sections = new app.components.Accordion({ id: `${view.id}.side`, multiple: true, signal, sections: [
  { id: "details", label: t("Adatok") }, { id: "edit", label: t("Szerkesztés"), disabled: !editable }], open: ["details"] });
sections.mount(layout.getCell("side"));
new app.components.RecordDetails({ view: list, record: row, signal }).mount(sections.cell("details"));
let form: RecordForm | undefined;
sections.on("toggle", ({ id, open }) => {
  if (id === "edit" && open && !form) { form = new app.components.RecordForm({ resource, action: "update", id: String(row.id), cancel: false }); form.mount(sections.cell("edit")); }
});
```

- `sections`: 1–12 `AccordionSection`s in display order: `id`
  (`[a-z][a-z0-9_-]*`, unique), `label` (plain text, 1–80 characters,
  escaped), optional `disabled` (stays closed); at least one section is
  enabled. Anything else throws `TypeError`.
- `multiple`: several sections may be open at once, and all may be closed.
  Without it exactly one section is open: opening another closes it, and the
  open section's own header does nothing.
- `open`: the sections open at first (enabled ones, each once; exactly one
  without `multiple`). Without it the remembered sections with `id`,
  otherwise the first enabled section. `id` (`[a-z][a-z0-9_.-]*`): the
  preference key under which the open sections are kept per page and user;
  without it nothing is stored.
- `cell(id)` is a section's Layout cell, the mount target of every component;
  `attach(id, content)` puts a Suite widget, a public component or a plain
  element there (released with the accordion). An undeclared id throws `Error`.
- `openSections()` lists the open sections in display order, `isOpen(id)`
  tells one. `open(id)`, `close(id)` and `toggle(id)` act as a header click
  and return the resulting state (`open` and `toggle` whether it is open,
  `close` whether it is closed): a disabled section stays closed, and without
  `multiple` the open section is not closed. `update(id, {label, disabled})`
  changes a section; disabling an open one throws `Error`. `toggle {id, open}`
  follows every change; when opening one section closes another, the closing
  is reported first.
- Keyboard and accessibility: each header is a `button` with
  `aria-expanded` and `aria-controls` over a `region` labelled by it; Enter
  and Space toggle, ArrowUp/ArrowDown (wrapping), Home and End move between
  the headers. A disabled header leaves the tab order; a header that cannot
  change (disabled, or the open one without `multiple`) has
  `aria-disabled="true"`. Suite's English `click to expand` label is removed so
  the label is the accessible name. Headers get the theme's inset focus ring
  and a chevron (down: open, right: closed).
- Presentation (every skin, from the Suite and skin variables): the Suite
  Layout cell header (37 px, the header surface, Blade chrome and title type),
  so sections read like the page's other panels. A header after an open
  section has a 1 px top border in the theme's border colour to separate it
  from that section's content; consecutive closed sections keep one divider.
  The last closed section has no bottom header rule against the enclosing
  panel's frame ([FB-0156](feedback.md#fb-0156)); opening it restores the rule
  between its header and content. In Blade and Blade Night the sections ease
  to their new heights, a closing one showing its content until it is shut
  ([theme motion](shell.md#theme-motion)); the state, `toggle` and the
  ARIA attributes change at once.
- **Subdividing a section:** a section is a mount target like any cell, so
  an `Accordion` mounted into `cell(id)` divides it further (a control
  panel's `Megjelenés` section with its own `Rács` and `Háttér` parts).
  Give the inner accordion its own `id`; each keeps its open sections
  separately per page and user. Destroy the content first, then the inner
  accordion, then the outer one (the [Layout recipe](#layout-recipe) order):
  the containers get no `signal` and are destroyed by a listener registered
  after their content. `SettingsForm` groups (fieldset headings) are the
  lighter choice when the parts need not collapse.

  ```ts
  const panel = new app.components.Accordion({ id: `${view.id}.panel`, multiple: true, sections: [
    { id: "view", label: t("Megjelenés") }, { id: "filter", label: t("Szűrés") }] });
  panel.mount(page.cell("panel"));
  const appearance = new app.components.Accordion({ id: `${view.id}.panel.view`, multiple: true, sections: [
    { id: "grid", label: t("Rács") }, { id: "background", label: t("Háttér") }] });
  appearance.mount(panel.cell("view"));
  new app.components.SettingsForm({ key: `${view.id}.grid`, fields: gridFields, signal }).mount(appearance.cell("grid"));
  signal.addEventListener("abort", () => { appearance.destroy(); panel.destroy(); }, { once: true });   // after the content
  ```
- Create the content of a section when it first opens if it costs a request
  (the example's form). A component created later than the page's own abort
  listener has no `signal` and is destroyed explicitly before the layout
  ([Layout recipe](#layout-recipe), the feature demo's asset viewer).
- The feature demo's asset viewer declares an `accordion` branch in its
  [`PageLayout`](#pagelayout) ([demos](demos.md#d1-asset-viewer)).
  Verification: `tests/shell/accordion.spec.cjs`.
- Limits: vertical stacking only; sections are not resizable against each
  other (open sections share the height equally) and cannot be reordered;
  no icons in the header; no guard (closing a section discards nothing). One
  `RecordForm` is one Suite Form and cannot span sections: a form divided
  into sections is one form per section, each with its own submit.

<a id="calendar-and-diagrameditor"></a>

<a id="loading-and-empty-states"></a>

#### Loading and empty states

No list, region, tab or section is a bare blank area ([FB-0185](feedback.md#fb-0185)).
It shows that content is loading, that nothing is there yet, or that a list
has no records. One framework status element (`role="status"`) lies over the
content. When nothing is there, the area is a blank surface
(`--dhx-background-secondary`) with a centred picture above the text in the
secondary text colour: an empty tray for no content or no records, the
search icon for no match, the alert icon when the data is not available.
Every theme and the phone layout use the skin variables. It stays rendered (visually hidden when it has nothing to say), so a
new text is announced politely. While loading it is Suite's spinner over the
area faded to the theme's surface. The spinner appears only after 300 ms, so
a short load does not flash it; `aria-busy="true"` is set on the loading
content at once, not on the status. Suite's own `progressShow()` is not
used: it covers the cell's header at the page's top overlay level, without
a delay or ARIA.

**Lists (default, no option):** every `ListView` and the built-in `list`
kind, in table, cards and tiles, in its own panel, a window or `panel: false`:

- **Loading:** the first load and every reload that replaces the rows (a
  filter, the search, the sort, `setFilters`, `refresh()`; a page that
  changes the scope mounts a new list, which loads) mark the row area
  `aria-busy` and show the indicator over it. Rows from before stay under it
  and, once it shows, take no clicks or wheel scrolling. The command bar and
  a table's header (its header filters) stay usable, so neither moves. A scroll window and a live
  update show nothing.
- **Empty result:** a loaded list without records says
  `Nincs megjeleníthető elem.` (the tree's text) below a table's header, or
  `emptyText` of the `ListView` (plain text, 1–200 characters, for example
  what adds one; anything else throws `TypeError`). With a filter or the
  search active it says `Nincs a szűrésnek vagy a keresésnek megfelelő elem.`
  instead, under the search icon. With rows there is no text.
- **Failure:** a failed load keeps the error dialog; a list without rows then
  says `Az elemek nem érhetők el.`, as does a list whose live channel was
  revoked. It never claims an empty result it did not load.

**Regions:** a [`PageLayout`](#pagelayout) region, a [`Tabs`](#tabs) tab or
an [`Accordion`](#accordion) section that holds nothing (no component
mounted, no widget or element attached) shows `Nincs megjeleníthető tartalom.`.
Mounting or attaching content replaces it; destroying the component there
(or `cell.detach()` of a widget) brings it back. `placeholder(id, {text,
busy})` of the component that owns the region changes it, and
`PageLayout.placeholder` passes a tab or section region to its `Tabs` or
`Accordion`:

- `text`: the region's own text (plain text, 1–200 characters), such as the
  selection it waits for; `null` restores the default. It stays for the
  next time the region is empty.
- `busy: true`: content is known to be coming but is not mounted yet. The
  region shows the indicator after the delay; its text waits meanwhile.
  Content mounted into the region ends it, as does `busy: false`; on a
  region that holds content it is ignored (`busy(id, true)` marks one, see
  below). Use it only where the page
  itself ends the wait (its own request before it mounts the component),
  not while waiting for another component's event that may never come.
- An undeclared id throws `Error`, any other key or value `TypeError`.

```ts
// examples/demo-app/frontend/src/registry-browser.ts (D8): each region says what it waits for.
layout.placeholder("values", { text: t("Válassz egy kulcsot a fában.") });
layout.placeholder("value", { text: t("Válassz egy értéket a listában.") });
nodeTree.on("select", ({ row }) => {
  list?.destroy(); list = undefined;                                   // the region's text shows again
  if (!row) return;
  list = new app.components.ListView({ view: values, scope: { field: "key_id", id: String(row.id) }, panel: false,
    emptyText: t("A kulcsnak nincs saját értéke.") });
  list.mount(layout.cell("values"));                                   // replaces the placeholder
});

// A page that fetches before it mounts marks the region busy meanwhile.
page.placeholder("chart", { busy: true });
const data = await app.server.call(resource, "summary", { signal });
chart.mount(page.cell("chart"));                                       // ends busy
```

<a id="busy-filled-region"></a>

**A region whose content is about to change** ([FB-0232](feedback.md#fb-0232)):
`busy(id, on)` of the component that owns the region (`PageLayout`, which
passes a tab or section region to its `Tabs` or `Accordion`, and `Tabs.busy`,
`Accordion.busy`) marks a region that holds content which is about to be
replaced, such as a view of a record that a running job will change, and
`busy(id, false)` ends the mark. It also applies to a region of an `inner`
layout.

- While marked, the region's content is `aria-busy="true"` at once and, after
  the same 300 ms, lies under the list's indicator: Suite's spinner over the
  content faded to the theme's surface. The content stays mounted, keeps its
  scroll position and stays readable under the fade, so the user sees what is
  being changed; it takes no clicks or wheel scrolling, and focus already
  inside stays there (keys still reach it). The region's header, an inner
  region's header and a tab row stay uncovered. The status says
  `A tartalom frissül…` once (politely), so a short mark says nothing.
- Mounting, attaching or replacing content keeps the mark, as does a
  component's own loading inside it (a `RecordDetails` loading a record, a
  `ListView` reloading); only `busy(id, false)` and destroying the owner end
  it. A mark on a region without content hides its text like
  `placeholder(id, {busy: true})`, but content does not end it.
- An undeclared id and a region holding an `inner` layout throw `Error`, an
  `on` other than a boolean `TypeError`. A region that is not marked is
  unchanged.

```ts
// A view of the record a job changes: marked while the job runs, rebuilt when it ends.
page.busy("record", true);
job.on("done", () => {
  details.destroy();
  details = new app.components.RecordDetails({ view, record: id });
  details.mount(page.cell("record"));                                  // the mark stays
  page.busy("record", false);
});
```

- A component brings its own states: a `ListView` mounted into a busy region
  ends the region's indicator and shows its own while it loads, and a
  `RecordDetails` loading a record id or a `RecordForm` loading its fields
  shows the indicator until the data arrives (after a failed load
  `Az adatok nem érhetők el.` under the error dialog). A page does not build
  its own overlay or hint element for any of these states.
- Limits: a Suite widget attached directly and destroyed without
  `cell.detach()` still holds its region, as does the slot of an element
  attached with a signal that was aborted (`app.ui.attach`); mount the next
  content or use a component. The view host itself, a singleton
  list's form and a `Tree` have no indicator of this kind (the tree keeps its
  own empty text and `aria-busy`). A `Tree` reports no event when its start ends without a
  selection (roots failed to load or none), so a page cannot mark regions
  busy until the tree's first selection; it shows their hint instead. A
  compact sub-view preview is one row high when empty, so a long text is
  cut.
- Verification: `tests/shell/empty-states.spec.cjs`.

#### Calendar and DiagramEditor

The built-in `calendar` and `diagram` kinds are these classes
(`src/app/builtins.ts`: `new host.app.components.Calendar({view, signal:
host.signal}).mount(host)`), so a project gets exactly the framework view,
with the same actions, ACL, forms, dialogs, toasts, themes and locale.

```ts
const layout = new app.dhx.Layout(null, { cols: [{ id: "plan" }, { id: "network" }] });
host.attach(layout);
const calendar = new app.components.Calendar({ view: "signage_schedule", signal: host.signal });
calendar.mount(layout.getCell("plan"));
const editor = new app.components.DiagramEditor({ view: "topology", signal: host.signal });
editor.on("saved", () => inventory.refresh());                     // after Mentés / Ctrl+S
editor.mount(layout.getCell("network"));
// In a window: closing it destroys the component (its signal); `fit: false` keeps the requested size.
const win = app.ui.window({ title: "Műsorterv", width: 1100, height: 720, fit: false });
new app.components.Calendar({ view: "signage_schedule", signal: win.signal }).mount(win);
```

- `view` is an offered view id (`Error` when not offered to the actor) or a
  held `ViewDefinition` of any kind with `resource`, `actions` and the
  `CalendarKindOptions`/`DiagramKindOptions` shape (`TypeError` otherwise). What the
  component offers follows `actions`: read-only without `create`/`update`
  (calendar) or `save` (diagram); the server checks every call again.
- Lifecycle as for every component: create and `mount(target)` once (an
  element target needs a height); a second `mount` or a `mount` after
  `destroy()` throws. `destroy()` is idempotent and releases the widgets, the
  windows the component opened (event form, day window, creation forms),
  document and canvas listeners, observers and, for the calendar, the shared
  Scheduler's handlers, data processor and data; a Layout cell is detached and
  an `AppWindow`/`ViewHost` still open is left empty. Aborting the options'
  `signal`, or the window's or host's signal, destroys it too.
- **One Calendar per page** (Scheduler Standard, [O10](#resolved-decisions)):
  `new Calendar(…)` throws while another one exists, including the built-in
  calendar view; destroy it first. `app.dhx` never exposes Scheduler.
- `DiagramEditor`: `saved` fires after the open diagram's content was saved
  (`Mentés`, Ctrl+S); `editing()` is `true` while it has unsaved changes.
  `Calendar` has no events; its `editing()` is `true` while the event form is
  open. The built-in kinds report these (and `FileManager.editing()`) as
  `ViewInstance.editing`, so the live channel never reloads the page over them
  and an ended session asks first, as for a list form.
- Theme and skin changes repaint live (the Scheduler switches between its
  `terrace` and `dark` skins); a language switch reloads the page, so
  components are created again in the new language.

<a id="filemanager-and-filepicker"></a>

#### FileManager and FilePicker

`app.components.FileManager` is the two-panel [file manager](files.md) of a
files view; the built-in `files` kind is this class mounted in the view host.
`app.components.FilePicker.pick` explicitly opens a modal tiles picker over
a file field's folder and returns a promise. The built-in form file control
uses a native local-file input; it does not open this existing-file picker.

```ts
const files = new app.components.FileManager({ view: "files", signal: host.signal });
files.on("opened", ({ id, mimeType }) => recent.push({ id, mimeType }));    // viewer or text editor showed a file
files.mount(layout.getCell("files"));

const { fields } = await app.server.form("signage_assets", "create");
const field = fields.find(field => field.type === "file")!;
const media = await app.components.FilePicker.pick({ field: field.file!, title: field.label, current, signal: host.signal });
if (media) preview.show(media);                                      // MediaDescriptor; null: Cancel, Escape, abort
```

- **FileManager.** `view` is an offered view id (`Error` when not offered) or
  a held `ViewDefinition` with `resource`, `actions` and the
  `FilesKindOptions` shape with at least one mount (`TypeError` otherwise).
  Panels, mounts, upload (window, drop, paste), the viewer on
  [`MediaPlayer`](#mediaplayer) with previous/next, the text editor, the
  conflict and delete dialogs behave as in the built-in view and follow the
  view's `actions`; the server checks every call. `opened` (`{id,
  mimeType}`) fires each time the viewer or the text editor shows a file,
  also on previous/next. `editing()` is `true` while a rename or new-folder
  form is open or the text editor holds unsaved text. The lifecycle is the common one
  ([Calendar and DiagramEditor](#calendar-and-diagrameditor)): `destroy()`
  also closes the windows it opened, removes its document and upload
  listeners and aborts its pending reads (writes already sent complete).
  Theme and skin changes apply through the Suite variables.
- **FilePicker.** `field` is a file manager `file` field's `FieldMetadata.file` (as
  `app.server.form` or a list action describes it), `title` the field label
  (`Fájl kiválasztása: {title}`), `current` a preselected file id. The picker
  lists the field's folder (`folderId`, otherwise the mount root) with
  search and a type filter limited to the field's accepted MIME classes;
  double-click, Enter or `Kiválasztás` resolves the file's `MediaDescriptor`
  (`id`, `name`, `mime_type`, `revision`, `duration_ms`, `width`, `height`,
  `thumbnail`). `Mégse`, Escape or aborting `signal` resolves `null` and
  ends its requests; an already aborted signal opens nothing. Malformed
  options throw `TypeError` before anything opens. The server checks `list`
  on the mount; setting the chosen id on a record is the caller's write.

<a id="mediaplayer"></a>

#### MediaPlayer

`app.components.MediaPlayer` shows an image, a video or an audio file. The file
manager's viewer is the same component ([files](files.md#media-player)).

```ts
// examples/demo-app/frontend/src/assets.ts: the file of the record's media column, driven by the view's CommandBar
if (found && playable) player = new app.components.MediaPlayer({
  source: { resource: found.source, action: "content_stream", id: found.media.id, version: found.media.revision },
  mime: found.media.mime_type, name: String(row.title ?? found.media.name),
  // Images keep the player's zoom toolbar; audio and video are driven by the command bar (its loop, not the player's).
  toolbar: !timed, signal,
});
const current = player;
if (current) {
  current.on("loaded", () => {
    for (const id of media) bar.update(id, { disabled: false });
    if (resume > 0) current.seek(resume);
    bar.update("position", { label: position(resume) });
  });
  current.on("position", ({ seconds }) => bar.update("position", { label: position(seconds) }));
  current.on("ended", () => { if (loop) { current.seek(0); void current.play().catch(() => {}); } });
  // …
  current.mount(layout.getCell("stage"));
  current.focus();
}
```

`source` names the file resource and the file id (here from the row's
`_media`), not the asset record; the whole viewer is the
[record view example](#example-record-view).

- **Source.** `{resource, action, id, version?}` becomes `app.server.url(…)`.
  The action must be a GET-capable read such as the file manager's
  `content_stream` ([files](files.md#actions-and-authorization)). The element
  loads it with the session cookie and seeks with HTTP Range requests, and the
  server checks the ACL on every request. `{url}` is a same-origin or `blob:` URL
  owned by the caller. `{blob}` is turned into an object URL that `destroy()`
  revokes. The shell CSP allows `img-src`/`media-src` `'self' blob:`.
- **Look.** A toolbar row (`toolbar: false` hides it) above the stage. Images
  get fit (never enlarged), zoom steps, fit/50/100/200 % and 90° rotation;
  video and audio get the browser's native controls (`controls: false` hides
  them), `Ismétlés` and `Sebesség: …` (0.5–2×). The info text shows
  dimensions, length (`m:ss`, `h:mm:ss` from one hour), the format (`JPEG`,
  `PNG`, `MP4`, `WebM`, `MP3`, `WAV`, `M4A`, otherwise the MIME subtype) and
  the caller's `info`. Below 600 px the info text is hidden. The audio stage
  shows `name` on the theme's background. Colours come from the Suite theme
  variables, so Blade, Blade Night, light, dark and skins apply without code.
- **Audio timeline colour.** In browsers supporting WebKit media-control CSS,
  the original native timeline shows elapsed time in orange, buffered time
  in a darker amber shade and unbuffered time in black. Its size, controls and keyboard behaviour are unchanged.
  There is no additional position slider or clock. Other browsers and forced
  colours retain their native appearance. No configuration is required.
- **Toolbar placement.** `toolbarPosition: "bottom"` places the player toolbar
  below its stage; default `"top"`. `toolbar: false` hides it in either position.
  Other placement values throw `TypeError`.
- **Audio spectrum.** `visualizer: "spectrum"` adds logarithmic FFT bars from
  40 Hz to 16 kHz (up to Nyquist), with localized frequency labels and theme
  colours. Default off; specifying it for non-audio or passing another value
  throws `TypeError`. The graph uses the same audio element as playback, with
  one audible destination. Pause/end reset the bars, hidden tabs stop animation,
  reduced motion shows a static spectrum, and destroy releases the graph and
  AudioContext. Without Web Audio/canvas support a localized status appears;
  native playback remains available. Analysis attaches only after the context
  runs, so a pending Web Audio gesture cannot silence native playback.
- **Autoplay.** `autoplay: true` requests native automatic playback; default
  false. Browser gesture policies still apply. A blocked request requires Play
  or the native controls; this option does not bypass browser policy.
- **Repeat.** `loop()` reads the current repeat state; `setLoop(boolean)` changes
  native playback and the player's repeat toggle together. The `loop` event
  carries `{loop}` only when the state changes, including toolbar clicks.
  External command bars can call `setLoop(!player.loop())` and subscribe to
  `loop` to keep their own label/icon in sync. Images and destroyed players
  ignore the setter; images report false. No extra server writes occur.
- **Keyboard.** `focus()` focuses the media element or the image stage. On the
  media element, Space/K plays or pauses, ←/→ seek 5 s and Home/End jump.
  A key the native controls already handled is not applied twice. On the image
  stage, `+`/`-` zoom and `0` fits.
- **Events and state.** Events are delivered only while the player is
  mounted. `loaded` fires once the metadata is known. `position` fires every
  250 ms while playing, on pause and after a completed seek. `error` carries
  the localized message that the toolbar also shows. `seek` clamps to
  `0 … duration()`. The media methods do nothing for images. `ended` is the
  media element's: with `loop` (or the toolbar's `Ismétlés`) the element
  repeats and fires none. There is no playback-state (playing/paused) event: a
  project derives the state from its own `play()`/`pause()` calls and
  `position`/`ended` ([limits](#limits)).
- **Lifecycle.** `mount(target)` takes an element, a Layout cell, an
  `AppWindow` or a `ViewHost`. The last two, and `signal`, destroy
  the player when they close. Mounting twice or after `destroy()` throws.
  `destroy()` is idempotent: it pauses, empties the element, revokes its
  object URL, removes its listeners and observers, and destructs its widgets after
  detaching from its Layout cell.
- **Limits.** Codec support is the browser's: WebM, MP3, WAV and AAC/M4A play
  in Chromium. While the tab is hidden the browser throttles the position
  timer. There is no playlist, waveform or subtitle support, and the image zoom
  is not kept across sources.

<a id="textdiff"></a>

#### TextDiff

`app.components.TextDiff` shows what changed between two plain texts,
read-only ([FB-0207](feedback.md#fb-0207)): a reviewer of an automated change
sees the changed lines and words, not two full texts. It mounts like any
component, into a window, a region, a tab or a view host.

```ts
// examples/demo-app/frontend/src/text-revisions.ts: the record command of an append-only revision list
const diff = new app.components.TextDiff({ before: before.body, after: after.body,
  beforeLabel: name(before), afterLabel: name(after) });
const win = app.ui.window({ titlePrefix: t("Különbség") + ":", title: `${name(before)} → ${name(after)} (${diff.summary().label})`,
  width: 1200, height: 800, fit: false, signal });
diff.mount(win);
diff.focus();
```

- **Comparison.** Lines end at `\r\n`, `\r` or `\n`; a final line break
  adds no line and an empty text has none, so the kind of line break and a
  final one are not compared. The line edit is the shortest one (Myers, after
  the common start and end are set aside). Within a change the n-th removed
  line pairs with the n-th added line; a pair gets word highlights (words, runs
  of white space and single other characters) when the characters they keep
  reach a third of the longer line, otherwise both lines are marked as a
  whole. Two 60 000-character texts with a few changed lines
  compare in a few milliseconds.
- **Views.** `mode: "unified"` (default) is one column: old and new line
  number, sign, text; removed lines above added ones. `mode: "split"` puts
  the two texts side by side under `beforeLabel` and `afterLabel` (default
  `Eredeti`, `Módosított`), removed beside added. Side by side needs 720 px of
  component width: a narrower component shows the unified view, and the
  toolbar's `Egymás mellett` toggle appears only when it fits. Long lines wrap,
  so neither the region nor the page scrolls sideways; below 480 px one line
  number remains (the old one on a removed line).
- **Folding.** Unchanged lines farther than `context` (0–50, default 3) from a
  change fold behind a `{count} változatlan sor` button that opens them in
  place and focuses them (a labelled group with a focus ring); fewer than
  three hidden lines are shown instead. Identical texts of three or more lines
  fold as a whole under `Nincs különbség.`. The toolbar's
  `Összes sor kibontása` opens every fold.
- **Summary.** The header line shows `+N −M` (U+2212) with a visually
  hidden `Hozzáadott sorok: N, törölt sorok: M`. `summary()` returns
  `{added, removed, changes, label}`; `label` is the `+N −M` text for a
  window title or a list column, also before the component is mounted.
- **Accessibility.** The kind of a line is never colour alone: a visible
  sign (`−`, `+`), a visually hidden `Törölve:` / `Hozzáadva:` prefix and a
  3 px edge bar; changed words are `del`/`ins` elements, underlined. The
  diff is a labelled region (`label`, default `Különbség`); each change is a
  group named `Változás i / n (Hozzáadott sorok: a, törölt sorok: r)`.
  Inside the region `n` or F7 moves to the next change, `p` or Shift+F7 to the
  previous one; the toolbar's `Előző változás` and `Következő változás` are
  pinned, so they stay beside `Műveletek` on a phone. Folds are buttons.
  Forced colours keep the bars and the highlights (`Mark`).
- **Look.** Colours come from the Suite theme variables
  (`--dhx-color-danger`/`--dhx-color-success` mixed into the background, and
  toward the text colour for the signs and counts, for contrast), so Blade,
  Blade Night, light, dark and skins apply. The text uses a monospace
  stack; a project stylesheet may set `--blade-diff-font-family`.
- **Methods.** `show(before, after)` compares two other texts (folds close,
  the navigation starts over); `next()`, `previous()` move the focus and
  scroll; `focus()` focuses the current change or the region (right after
  `mount` it waits until the region is in the document). A re-render (side by
  side, expand all, a resize across 720 px) keeps the focus on the current
  change. There are no events. `toolbar: false` leaves the toolbar out; the
  keys still work. Non-strings, an unknown `mode`, a non-boolean `toolbar` or
  a `context` outside 0–50 throw `TypeError`. The region and its width
  observer start at `mount`.
- **Revision lists.** 61ade does not decide which record is "the previous
  revision": that is the project's grouping and order. A project declares a
  record command on its revision view (`commands: ['<project>.text-diff']`),
  answers "which revision came before this one" with its own read action,
  reads both texts through `get` (so the ACL and field ACL apply), and opens
  `TextDiff` in `app.ui.window` as above. The feature demo's
  [Szövegváltozatok](demos.md#d10-text-revisions) is the complete example:
  an append-only resource (`get` and `create` only, the revision number
  computed from the insertion order), the action `previous` and the command
  `demo.text-diff`.
- **Limits.** Plain text only (no Markdown or HTML rendering), no editing,
  merging or reverting. A line edit costlier than 2000 steps (two texts of
  about 1000 entirely different lines) shows the differing middle as removed
  and added as a whole; a line pair whose word edit exceeds 400 steps gets no
  word highlights. An opened fold and a rewrite beyond the limit render all of
  their lines (no virtual scrolling); measured: two 60 000-character texts.
  A list of the revisions (`ListView`) carries every readable field of its
  rows, the texts included, even when they are neither a column nor in the
  details.

<a id="steps"></a>

#### Steps

`app.components.Steps` is an ordered phase list for an operation the user
follows: a job's stages in a window or region, or the phases of a
[progress dialog](dialogs.md#progress), which uses it
([FB-0250](feedback.md#fb-0250)). It replaces a project `dhx.List` that
draws its own step states.

```ts
const steps = new app.components.Steps({ label: t("Kérés állapota"), signal,
  steps: [{ id: "queued", label: t("Sorban") }, { id: "running", label: t("Feldolgozás") }, { id: "done", label: t("Kész") }] });
steps.mount(win);
steps.current("running");            // queued done, running current, done pending
steps.state("running", "failed");    // a refused request
```

- **States.** `pending`, `current` (at most one), `done` and `failed`, each
  with its own Bootstrap icon (`bi-circle`, `bi-arrow-right-circle`,
  `bi-check-circle-fill`, `bi-x-circle-fill`) and a visually hidden state text
  (`várakozik`, `folyamatban`, `kész`, `sikertelen`); colour is never the only
  signal. Colours are the Suite theme's primary, success and danger.
- **Methods.** `current(id)` makes a step current, the earlier ones done and the
  later ones pending; `current(null)` marks every step done. `state(id,
  state)` sets one step (another current step becomes pending). `states()`
  returns `{id, state}` in order. There are no events.
- **Accessibility.** An `<ol>` named by `label`; the current step has
  `aria-current="step"`. A polite live region announces a new current step
  (`‹label›: folyamatban`) and a failed one.
- **Size.** Its height follows its content, so it fits a row of a window or a
  region; mounted into a taller cell it stays at the top.
- **Errors.** 1–20 steps, ids `[a-z][a-z0-9_-]*` and unique, labels of 1–80
  characters, a non-blank `label` and a declared `current`, else `TypeError`;
  an undeclared id in `current` or `state` throws `Error`.

<a id="jobs"></a>

#### Jobs: `app.jobs` and JobView

`app.jobs` starts and follows the long-running job of a job action (PHP
`Action` `job`, [jobs](workspaces.md#jobs), [FB-0253](feedback.md#fb-0253)).
`components.JobView` shows one job in a page region. A list's job action needs
no code: its toolbar command, record command, tree command, `RecordForm` or list
form starts the job through `app.jobs` and opens the job window instead of a
toast.

```ts
const job = await app.jobs.start("demo_service_report", "audit", { id: row.id, title: t("Régióellenőrzés") });
app.events.on("job:done", ({ status }) => { if (status.id === job.id && status.state === "done") void list.reload(); }, { signal });

// The same job in a page region instead of the window:
const view = new app.components.JobView({ job, title: t("Régióellenőrzés"), signal: host.signal });
view.on("done", ({ status }) => console.log(status.result));
view.mount(layout.getCell("job"));
```

- **Start.** `start(resource, action, {id?, values?, signal?, title?, window?})`
  sends the action with a fresh client token (`CallOptions.token`).
  - A network failure (status 0) asks the server for the job of that token up
    to three times. A start whose answer was lost is found, never started
    twice.
  - Any other refusal (validation, ACL) rejects like `server.call`.
  - `job:started` reports `{job}` (`{id, resource, action}`).
  - `window: false` follows the job without the window.
- **Window.** `open(job, {title?})` opens the framework job window (one per
  job and page, modal like every framework window, closable: closing it does
  not stop the job, and `open` shows it again). It holds one `JobView`.
- **JobView.**
  - **Shows:**
    - the stage, or the state's text (`role="status"`);
    - a native `<progress>`: the percent, or indeterminate without one;
    - `Lépés: n / m` and `Eltelt idő: m:ss`;
    - the heartbeat warning (`A feladat {seconds} másodperce nem jelzett.`) once
      a running job's heartbeat has not changed for `heartbeatAfter` seconds,
      measured by the page's clock;
    - the log (`role="log"`, `Napló`, levels marked in text);
    - the result (a `reveal` as `label: value — note`), the error, or the
      cancelled text;
    - `Megszakítás` while the status says `cancel`.
  - **Methods and events:** `status` is the last status read, and `cancel()`
    asks the source to stop. Events `progress` and `done` carry `{status}`.
  - **Options:** `job`, `title` (the bar's name, default `Feladat`), `guard`
    (default true) and `signal`.
- **Polling and events.**
  - Each job is polled once per page however many views show it: after 1 s,
    backing off ×1.5 up to 5 s while nothing changes, and up to 15 s after
    network failures.
  - Polling pauses while the page is hidden and resumes at once when it is
    shown. A 401, 403 or 404 stops it (`A feladat nem érhető el.`).
  - Each job is its action and id, so jobs of different sources never mix.
  - `job:progress` reports each changed `{status}` and `job:done` the final one.
    The status's `log` is every line read so far.
- **Leave guard and reattach.** While a job this page started or reattached is
  queued or running, leaving or reloading the page asks first
  (`beforeunload`). After a reload the shell reads the user's running jobs
  (`running()`) and reopens their windows.
- **Reads.** `status(job, after?)`, `cancel(job)` and `running()` are `__job`
  calls; the server checks each like the job action itself.
- **Errors.** A malformed job reference or option throws `TypeError`.

<a id="views"></a>

## Views

A view has its own identity: `id` (`[a-z][a-z0-9_.-]*`, unique per
application), independent of `resource`, so a resource can have several views,
including [record views](#record-views).

```php
use Blade\Feature\View;

$registry->addView(new View('demo.asset-viewer', 'demo.asset-viewer', 'Médianéző',
    resource: 'signage_assets', record: 'signage_assets', actions: ['get', 'content_stream'],
    options: ['loop' => true], open: 'window'));
```

JSON module, a new top-level `views` section keyed by view id (snake-case keys
as elsewhere); `resources.<name>.view` gains `id`, the
[activation map](#activation-map) and `commands`. Exception to the snake-case rule: a field's
nested `column` object uses the PHP option names (`minWidth`, `maxWidth`;
`imageBase`/`altOf` are also accepted as `image_base`/`alt_of`, a view column's
`media_of` stays snake-case); the browser's `ColumnMetadata` always has the
camelCase `imageBase`, `altOf` and `mediaOf`, and a field's JSON `default` is
`FieldMetadata.defaultValue` in the browser ([naming conventions](#conventions)):

```json
{"views": {"demo.asset-viewer": {"kind": "demo.asset-viewer", "title": "Médianéző",
  "resource": "signage_assets", "record": "signage_assets", "actions": ["get", "content_stream"],
  "options": {"loop": true}, "open": "window", "group": "Signage", "icon": "bi bi-camera-video", "desktop_only": false}}}
```

`View` validates: id, `kind` (a built-in name or a dotted project kind),
non-empty `title`/`group`, resource and record names, unique action names
(only with a resource), icon classes, `open` = `page` or `window`, and the
optional `guide` (plain text up to 4000 characters, shown by the shell as the
[view guide](workspaces.md#view-guide); JSON `guide`, in the bootstrap only when set;
`ApplicationDefinition` `guides` / JSON `application.guides` set it by view id). Existence of
actions, the record resource's `get` and the kind provider is checked by
`addView`.

<a id="menu-less-views"></a>

**A list view without a menu entry** (`menu: false`; PHP `View`,
`View::list`, `Registry::view`, `SqlResource::register`; JSON
`resources.<name>.view.menu`): for lists that only make sense inside a
project page, such as several scoped lists of a record page, beside the one
sub-view a parent list may embed.

```php
$items = $registry->viewById('signage_playlist_items');
$registry->addView($items->with(id: 'signage_asset_items', title: 'Lejátszási listákban', actions: ['get'], group: null, guide: null, menu: false));
```

```ts
new app.components.ListView({ view: app.viewDefinition("signage_asset_items")!, scope: { field: "asset_id", id: asset },
  mode: "cards", panel: false, showId: false }).mount(sections.cell("items"));
```

- The view is offered exactly like any list view (the same ACL rule, the
  bootstrap with `menu: false`, `app.viewDefinition`), so `ListView`,
  `scope`, sub-views, live refresh, record commands and the `RecordForm`
  submit labels of its actions work unchanged.
- It has no menu entry (neither the main menu nor the compact siblings),
  and a record page never inherits its menu context from it
  ([menu context](shell.md#elkülönülő-főmenügombok)). The address
  `#view=<id>` and `app.navigate` refuse it like a view that is not offered:
  the address opens the empty workspace, `navigate` returns `false`. Not
  being in the menu is navigation, not authorization: the actions stay
  callable wherever the ACL offers them.
- A sub-view child with `menu: false` has no page of its own (no `page` in
  the sub-view metadata), so a `page` activation over it throws at
  definition time (`subview()`, also `checkViews()` when the child leaves the
  menu later); a sub-view preview and its full-list window work.
- Only a list view that is not a singleton and has no `guide` (it never opens
  as a page) may set it; a record view (no menu entry anyway), any other
  kind, a singleton or a guide throw `InvalidArgumentException`. JSON `menu`
  is a boolean.
- The feature demo's asset viewer shows `signage_asset_items`
  ([demos](demos.md#d1-asset-viewer)). Verification:
  `tests/shell/menuless-view.spec.cjs`, `tests/shell/toolkit.php`,
  `tests/shell/configuration.php`.

**A view offered only in some contexts** (`available`, a
`Closure(Context): bool`; PHP `View`, `View::list`, `Registry::view`,
`SqlResource::register`, `with()` for any declared view; JSON
`resources.<name>.view.available` and `views.<id>.available` naming a
workspace binding): evaluated on the server for each bootstrap, false leaves
the view out of the bootstrap of that actor and tenant as if it were not
declared, for every kind. Nothing changes on the client: a view missing from
the bootstrap has no menu entry, address, `navigate` target, definition,
activation, sub-view, tree or attention count. Presentation only; a state
change shows at the next bootstrap ([view availability](workspaces.md#view-availability)).


PHP signatures (`packages/php/src/Feature/Registry.php`, `SqlResource.php`,
`packages/php/src/Shell/ApplicationDefinition.php`):

```php
// Blade\Feature\Registry
public function addView(View $view): View;                              // a taken id throws
public function updateView(View $view): View;                           // changes the declared view of that id
public function kind(string $kind, ViewKindProvider $provider): void;   // dotted, before its views; duplicate throws
public function view(string $resource, string $title, array $columns, array $actions, /* … */
    string|array|null $activate = null, ?string $id = null, array $commands = [], ?string $guide = null, ?array $drop = null,
    bool $menu = true, ?array $sort = null): View;                      // menu: false, see menu-less views; sort: workspaces.md#list-sort
public function fileManager(/* … */, ?string $id = null, ?string $guide = null): View;
public function diagram(/* … */, ?string $id = null, ?string $guide = null): View;
public function calendar(/* … */, ?string $id = null, ?string $guide = null): View;
public function subview(string $view, string $child, string $field, bool $embed = true, bool $select = true): void; // view ids
public function tree(string $view, string $tree, string $field, string $label): void; // view ids; workspaces.md#tree-navigation
public function appendViewActions(string $view, array $actions): void;  // view id
/** @return list<View> */ public function views(): array;
public function viewById(string $id): ?View;
// Blade\Feature\View
public static function list(string $resource, string $title, array $columns, array $actions, /* as Registry::view() */): View;
// Blade\Feature\SqlResource
public function register(Registry $registry, string $title, /* … */ string|array|null $activate = null, ?string $id = null, array $commands = [], ?string $guide = null, bool $menu = true): View;
// Blade\Shell\ApplicationDefinition: constructor parameters
/** @param list<string> $modules */ public array $modules = [],
/** @param list<string> $stylesheets */ public array $stylesheets = [],
public ?string $documentRoot = null,
/** @param array<string, string> $guides view id => guide text */ public array $guides = [],
```

- The builders keep their earlier parameters; `id` defaults to the resource,
  so declarations, `subview()` and `appendViewActions()` calls written before
  view ids keep working. Their option payloads are `View::$options`.
- `ViewKindProvider` has `validate(Registry, View)` at definition time and
  `metadata(Context, View): ?array` per bootstrap (`null`: not offered;
  otherwise `['actions' => …, 'options' => …]`). The built-in kinds have their
  own providers (`ListViewKind`, `FileViewKind`, `DiagramViewKind`,
  `CalendarViewKind`). A project registers its own provider with
  `Registry::kind()` **before** the first view of that kind (a later call
  throws `Register the view kind before its views`). A project kind without
  one uses `GenericViewKind`: it offers the view when the actor is offered at
  least one of its actions (none declared: always) and passes `options`
  through verbatim after a definition-time check: the top level is a map (or
  empty), values are JSON-safe (null, booleans, integers, finite floats, UTF-8
  strings, lists and maps) nested at most 32 levels, and the encoded options
  are at most 64 KiB (`GenericViewKind::MAX_BYTES`).
- `record` is accepted for project kinds only; built-in kinds reject it.

<a id="view-id-rule"></a>

**Duplicate view ids:** a view id is declared once. A second declaration with
the same id (`Registry::view/addView`, the other builders,
`SqlResource::register`, JSON `resources.<name>.view.id` or `views.<id>`)
throws `InvalidArgumentException` (`Duplicate view id: <id>`) at definition
time; the kind's own validation runs first. Give the other view its own `id`,
or change the declared one explicitly with `Registry::updateView(View $view)`:
the id must exist, kind and resource stay, the result is validated like a
declaration, and the menu position, the sub-view attached with `subview()` and
the embedded state stay (a `subview` option of the new View is ignored).
`View::list(…)` builds a list View with `Registry::view()`'s parameters without
registering it, for example
`$registry->updateView(View::list('customers', 'Ügyfelek', $columns, ['get', 'update']))`
after `SqlResource::register()`, or
`$registry->updateView($view->with(icon: 'bi bi-key'))` with the View it
returned. JSON `resources.<name>.view` is compiled this way. Registering a
client view **kind** twice is an error unless `{replace: true}`;
`Registry::kind()` has no replace. Replaces the replacement rule of G1
decision 1 (2026-10-30, [FB-0081](feedback.md#fb-0081)).

**Bootstrap shape:** the per-resource keys from before view ids map as
follows ([M3](#migration)); nothing else changed and all texts stay
server-translated.

| Before view ids | `ViewDefinition` |
| --- | --- |
| `resource` | `resource`, and `id` (default) |
| `kind` (`files`/`diagram`/`calendar`; absent = list) | `kind`, always set (`list` explicit) |
| `title`, `group`, `icon`, `desktopOnly`, `actions` | unchanged, top level |
| list keys `columns`, `detailFields`, `filters`, `sortable`, `layout`, `singleton`, `rowNumbers`, `selection`, `rowSelection`, `rowHeight`, `tileMinWidth`, `tiles`, `activate`, `search`, `subview` | `options.*` (`ListKindOptions`) |
| `files`, `diagram`, `calendar` | `options` (`FilesKindOptions`, `DiagramKindOptions`, `CalendarKindOptions`) |
| placeholders `columns: []`, `filters: []`, `singleton: false` of non-list kinds | dropped |
| — | `record`, `open` (new) |

<a id="routing"></a>

### Routing

- Canonical address: `#view=<id>[&record=<id>][&filter.<field>=<value>]`.
  Filter presets apply once and leave the address, as today.
- `#view=` is the only form: any other address, such as the former
  `#feature=<resource>` (removed 2026-10-30, [FB-0081](feedback.md#fb-0081)),
  names no view and gives the empty workspace.
- Menu ids become `view:<id>` (`sibling:view:<id>` for the collapsed-menu
  siblings); `activate: 'page'` writes `#view=<child id>`.
- Unknown or unoffered ids give the empty workspace, as today.
- UI preference keys keep `blade-ui:1:[path, user, <view id>]`: a view whose id
  equals its resource keeps its saved preferences, so no key migration is
  needed; a renamed view starts with defaults.

<a id="record-views"></a>

## Record views

A view with `record: <resource>` opens for one record. The shell passes the
id to the server, which resolves the row through that resource's `get` action
(object ACL, field ACL, tenant scope, audit); the kind receives it as
`host.record`. Opened from the [activation map](#activation-map) (`view:<id>`),
`app.navigate({view, record})` (for example from a project client command) or
the address. A record view
has no menu entry. Its optional `recordTitle` (PHP `View(recordTitle:)`,
JSON `record_title`) names a readable, non-secret field of the record
resource whose value titles the record in the
[location bar](shell.md#location-bar) (default: the view's title); the view
may replace that level with `host.setLocation`. Its optional `parent`
(PHP `View(parent: ['field' => 'task_id', 'view' => 'demo.task-page'])`,
JSON `"parent": {"field": "task_id", "view": "demo.task-page"}`) names the
record's parent. `field` is a non-secret `select`, `number` or `text` field
of the record resource that holds the parent's id, and `view` is the parent
resource's record view; a `select` whose options are a `Lookup` (JSON
`options_lookup`, PHP `$lookup->options(...)`) must be one of that resource.
Both are checked at definition time (`InvalidArgumentException`). The
location bar then shows the parent records, resolved from the row through
their `get` (recursively, at most 4), as links before this record. The bar
starts at the topmost parent record resolved, whose menu source also carries
the marker ([parent records](shell.md#location-bar-parent)). As a page, it inherits the record resource's
[menu context](shell.md#elkülönülő-főmenügombok) from an offered menu view
(with resolved parent records, that of the topmost one);
its optional `group` restricts the source group. `open: "page"` (default) mounts it in the workspace with an
address and history entry; `open: "window"` opens a framework document window
(full screen below 768 px) without an address change. The view is offered only
when the actor is offered the record resource's `get`; a `get` failure (403,
404) shows the shared error dialog and keeps the current view; a navigation
without a record id opens nothing.

<a id="activation-map"></a>

## Activation map

```php
$source->register($registry, 'Médiatár', tiles: true,
    activate: ['field' => 'kind', 'map' => ['audio' => 'view:demo.asset-viewer', 'video' => 'view:demo.asset-viewer', '*' => 'details']]);
```

JSON: `"activate": {"field": "kind", "map": {"audio": "view:demo.asset-viewer", "*": "details"}}`.
The feature demo keys `Médiatár` on its `file` field instead
([D1](demos.md#d1-asset-viewer)):
`"activate": {"field": "file_id", "map": {"image": "view:demo.asset-viewer", "audio": "view:demo.asset-viewer", "video": "view:demo.asset-viewer", "text/javascript": "view:demo.asset-viewer", "*": "details"}}`.

- Values per entry: the existing `details`, `subview`, `page`, a record action
  of the view, or the new `view:<id>` (a record view whose `record` is the
  list's resource). A plain string keeps today's meaning.
- The client chooses per row by the string value of `field`; `*` is the
  default; no match and no `*` keeps the default behaviour. A media field (a
  `file` field or a `column.media` field, whose row carries `_media[field]`)
  is keyed by its file's exact MIME type when the map names it
  (`text/javascript`, compared in lower case), otherwise by its MIME class
  (`image`, `video`, `audio`, …), not by the file id; a row without a file, or with one the actor may not see
  (`_media[field]` is `null`), takes `*`.
- The server validates at definition time: `field` is a readable, non-secret
  field of the resource carried in list rows, every target as today, and
  `view:` targets exist once all views are declared (checked at the end of
  definition, like sub-views in JSON).
- A target the actor or row is not offered (ACL, `_actions`, record view not
  offered) opens the details, exactly like today's
  [fallback](workspaces.md#activation). Tables, cards, tiles, Enter and
  double-click behave the same; `aria-description` names the per-row target.
- Client (`components/list/activation.ts`): a `view:<id>` target is offered
  when `app.viewDefinition(id)` exists, its `record` is the list's resource
  and the row's `_actions` (when present) contain `get`; it then runs
  `app.navigate({view: id, record: row.id})`, and a refused navigation opens
  the details. A compact sub-view preview opens the details instead. A row
  whose map has no entry and no `*` gets no `aria-description` and keeps the
  default (update form in the table, details in cards and tiles).

<a id="sandbox-protocol"></a>

## Sandbox protocol

`SandboxFrameOptions.autoplay: true` delegates autoplay permission to this
opaque frame (`allow="autoplay *"`); default false. Browser/user autoplay
policy still applies. This does not add sandbox flags or grant same-origin,
storage, credentials or network access. A parent Play gesture can start a
scene's Web Audio without a second artificial in-frame gesture gate. A
browser may still require one gesture if it refuses automatic sound.

`SandboxFrame` (`src/components/sandbox/SandboxFrame.ts`) creates
`<iframe sandbox="allow-scripts" credentialless referrerpolicy="no-referrer"
src="<admin.js directory>/sandbox.html?<admin.js cache key>">`: an opaque origin
with no cookies, storage, session, CSRF token or same-origin access. The
document's address is derived from `admin.js` (`import.meta.url`) on the
first `load()`, so `sandbox.html` must sit beside it. Without a usable
`import.meta.url` (a bundle that is not an ES module) creating the application
or the component still works and `load()` rejects with a clear error. Messages use `postMessage` with the
envelope `{blade: 1, id, type, payload}` (`SandboxMessage`; `id` 1–64
characters, unique per sender: `p1…` from the parent, `f1…` from the frame).

| Direction | `type` | Payload |
| --- | --- | --- |
| parent → frame | `load` | `{code, files}`: untrusted script source and named data (Blobs or strings); sent once, on the frame's first `load` event |
| frame → parent | `ready` | `{}` after the code's top-level evaluation (and its returned promise, if any) completed |
| frame → parent | `error` | `{message}`: a throw, rejection, later uncaught error or protocol violation (at most 1000 characters plus an ellipsis) |
| both | project types | dotted registry names (`scene.seek`, at most 128 characters), any structured-clone payload |

```ts
const frame = new app.components.SandboxFrame({ signal: host.signal, title: "Jelenet" });
frame.mount(layout.getCell("stage"));                     // mount first: the ready timeout runs from load()
frame.on("message", ({ type, payload }) => type === "scene.position" && timeline.move(Number(payload)));
frame.on("error", ({ code, message }) => console.warn(code, message)); // also the page's `sandbox:error`
const code = await (await app.server.request("scenes", "code_get", { id })).text();
await frame.load(code, { "tone.wav": await (await app.server.request("scenes", "tone_get", { id })).blob() });
frame.post("scene.seek", 12.5);
```

```js
// The scene code: the body of an async function inside the frame (`blade` in scope, top-level await allowed).
const audio = new Audio(blade.files["tone.wav"]);            // a blob: URL of the frame
blade.on("scene.seek", seconds => { audio.currentTime = seconds; blade.post("scene.position", seconds); });
await new Promise(resolve => audio.addEventListener("loadedmetadata", resolve, { once: true }));
```

- **Parent checks:** a message counts only if `event.source` is the current
  frame's `contentWindow` and `event.origin` is `"null"`; anything else is
  ignored. A malformed envelope, a `load` from the frame or a non-dotted type is
  a `protocol` error. Everything the frame sends, `ready` and `error` included,
  is untrusted input. The parent never sends the CSRF token, the session or
  anything else except what the project passes to `load` and `post`. A frame
  document reports only the first failure its messages cause (`error`, or
  `protocol`); later ones raise no `error`, `sandbox:error` or console line.
  Project messages are delivered while the document lives, also before
  `ready` and after an error.
- **Frame checks** (the frame bootstrap, a classic script built from
  `src/sandbox/bootstrap.ts` and inlined into `sandbox.html`): only messages whose `source` is `window.parent`;
  one `load` per document; `ready`/`error` from the parent are protocol errors.
  The frame reports its own violations as an `error` message (`Protocol: …`),
  so they reach the parent with code `error`; code `protocol` always means a
  parent-side check.
  Opened directly, or framed with a real origin (no `sandbox`, or
  `allow-same-origin`: `self.origin !== "null"`), the document stays inert and
  runs no code. The code runs from a
  `blob:` classic script of the frame only ([O7](#resolved-decisions)) as the
  body of an async function; `blade.on(type, handler)`, `blade.post(type,
  payload)` and `blade.files` (name → `blob:` URL or string, frozen) are its API.
- **Limits** (G1 values confirmed): code 1 MiB UTF-8 (`maxCodeBytes`), files
  32 MiB in total (`maxFileBytes`, Blob sizes plus UTF-8 string sizes),
  `ready` within 10 s of `load()` (`readyTimeout`). A size violation rejects
  before anything is sent and keeps the current frame and a still pending
  earlier load; a timeout removes the
  frame. Both raise `sandbox:error`, and `error` (`size`, `timeout`) while
  mounted.
- **Errors on the page:** every `error` of every frame is also the page event
  `sandbox:error` (`{message, code}`, logged with `console.warn`; no toast).
  The payload names no frame: a page with several frames, or one that replaces
  its frame, uses the component's own `error` event or checks which frame is
  current ([pitfalls](#pitfalls)). Nothing is logged on the server.
- **Lifecycle:** `load()` resolves on `ready` and rejects with a `SandboxError`
  (`code` = the event code), or with an `AbortError` when a later `load()` or
  `destroy()` replaces it; each `load()` creates a fresh frame document.
  `post()` throws before `ready` and does nothing after `destroy()`. A second
  `load` event of the iframe (the code navigated or reloaded the frame, or the
  frame was moved in the DOM) is a `protocol` error and removes the frame.
  `destroy()` removes the frame at once (kill switch), rejects a pending load
  and releases the Layout and listeners; `signal` and a closing window or view
  host call it; mounting follows the [common rules](#components).
- **Meta CSP of `sandbox.html`** (exact text; `<hash>` is the SHA-256 of the
  inline bootstrap, base64):
  `default-src 'none'; script-src 'sha256-<hash>' blob:; style-src 'unsafe-inline' blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'`.
  The bootstrap is inlined into the document and admitted by its hash, which
  `tools/build.mjs` computes (`--check` fails on a stale one); `blob:` admits
  the delivered code. There is no `'self'`: the code cannot load any
  same-origin classic script, which keeps the plan's "only `blob:`/inline
  execution" ([plan 4.4](toolkit-plan.md#44-sandbox-frame)). `fetch`, XHR,
  WebSocket, EventSource, beacons, images, scripts and frames to any host are
  blocked; forms and pop-ups are blocked by the sandbox flags.
- **Shell CSP:** `Shell/Application.php::headers` sends `object-src 'none'` and no
  `frame-src`/`child-src`, so `default-src 'self'` already admits the
  same-origin `sandbox.html`; no PHP change. The managed host serves static
  files with `X-Frame-Options: SAMEORIGIN`, which permits this same-origin
  embedding; the browser spec confirms both on the managed URL.
- **Deployment requirement:** `sandbox.html` must not be frameable by another
  site. Serve it (like every static file of the admin) with
  `X-Frame-Options: SAMEORIGIN` or `Content-Security-Policy: frame-ancestors
  'self'`; a meta CSP cannot set `frame-ancestors`, so this is the web
  server's job, not 61ade's.
- **Limits of the isolation** (security review: P7): the frame can always
  navigate itself (a frame navigation may carry the Lax session cookie where
  `credentialless` is not supported) and use WebRTC, so it can leak what it
  was given: never pass it data the actor
  may not see. Where the browser keeps a sandboxed frame in the parent's process,
  a busy loop in the code also blocks the page; the timeout cannot interrupt it.
- **Verification:** `node tests/shell/toolkit-sandbox.mjs` (the built
  document's single inline script, its hash and the exact CSP; envelope,
  limits, both protocol sides with fake windows) and `npm run test:browser --
  tests/shell/toolkit-sandbox.spec.cjs` in Chromium on the managed URL (opaque
  origin, no cookie, storage or parent access, CSP-blocked network, round
  trip, forged messages, error, timeout, navigation, destroy) pass, the spec
  since gate G3 in every full run ([FB-0081](feedback.md#fb-0081)); the
  feature demo's scene stage is `toolkit-demo-playlist.spec.cjs`. Network egress is judged by what reaches Playwright's `route()` (the network
  layer), not by `request` events: Chromium also reports image, XHR,
  EventSource and script loads that Blink blocked by CSP before sending them
  (DevTools "blocked:csp").

<a id="packaging"></a>

## Packaging

| File | Deployed by consumers | Notes |
| --- | --- | --- |
| `dist/admin.js`, `dist/admin.css` | yes (unchanged) | one ESM bundle, no chunks; linked with their [file key](#cache-keys) |
| `dist/admin.d.ts` | no | development only; declarations of `src/api/index.ts` (`tsc --emitDeclarationOnly` through the TypeScript API), joined with `./types` into one file |
| `dist/sandbox.html` | only when `SandboxFrame` is used | add to `.deploy.json` `shared_assets.files` beside `admin.js`; one file, the frame bootstrap inline |

`npm run build` (`tools/build.mjs`) writes all four files and
`packages/php/bin/live-server.mjs`; `node tools/build.mjs --check` builds them in
memory and fails on any difference (and on a left-over `dist/sandbox.js`,
which the build removes). `packages/frontend/package.json` exports
`./admin.js`, `./admin.css`, `./admin.d.ts` and `./sandbox.html`;
`npm run demo:assets` copies the three runtime files. The same
build writes and checks the feature demo's own module
`examples/demo-app/public/app/demo.js` and its stylesheet `demo.css`
([worked example](#typescript-recipe));
it is demo output, not part of the package. A
consumer that uses `SandboxFrame`:

```json
{
    "source": "/space/share/libs/61ade/packages/frontend/dist",
    "files": ["admin.js", "admin.css", "sandbox.html"],
    "target": "target:public/assets/61ade"
}
```

A project's own module files live in its public directory and are built by
the project; the shell keys them by the built file ([cache keys](#cache-keys)),
so the project needs no version bump after a rebuild.

<a id="typescript-recipe"></a>

## TypeScript and esbuild recipe

Checked with TypeScript 5.9.3 and esbuild 0.25.12 against the generated
`admin.d.ts`.

- **`admin.d.ts`** comes from the consumer's development link
  `public/assets/61ade -> /space/share/libs/61ade/packages/frontend/dist`
  ([consumer layout](development.md#consumer-layout)), so the declarations of
  the linked 61ade commit are there without being deployed. `admin.d.ts` is a
  tracked build output like `admin.js`. Copying tools (`61ade-assets`,
  `npm run demo:assets`) and the deploy's `shared_assets` copy only the
  runtime files, never `admin.d.ts`; a project without the link maps
  `@61ade/admin` to the checkout's `packages/frontend/dist/admin.d.ts`.
- **`@dhtmlx/suite` types:** `admin.d.ts` imports them (`import type * as
  Suite from "@dhtmlx/suite"`). Install the same version 61ade builds with
  (9.3.12, `packages/frontend/package.json`; the GPL package on the public npm
  registry) as a devDependency of the project's frontend build; the Bundler
  resolution finds it without a `paths` entry. Only as a development-only
  fallback, a `paths` entry may point at the shared checkout's
  `node_modules/@dhtmlx/suite`, which exists only where 61ade's own `npm ci`
  ran. Never import Suite at run time; use `app.dhx`.
- **Order after an API change:** the typecheck reads the built `admin.d.ts`,
  not `src/api`. Inside 61ade, run `npm run build` before `npm run typecheck`
  after changing `packages/frontend/src/api` (`node tools/build.mjs --check`
  fails on a stale `admin.d.ts`); a consumer sees a new API once the linked
  checkout has the commit with the rebuilt file.

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "lib": ["ES2022", "DOM"],
    "paths": {
      "@61ade/admin": ["./public/assets/61ade/admin.d.ts"]
    }
  },
  "include": ["frontend/src"]
}
```

```ts
// frontend/src/main.ts
import type { ApplicationModule } from "@61ade/admin";

declare module "@61ade/admin" {
  interface AppEvents { "demo.scene": { seconds: number } }   // project events by module augmentation
}

const main: ApplicationModule = app => {
  app.kinds.register("demo.player", {
    create: host => {
      const frame = new app.components.SandboxFrame({ signal: host.signal });
      frame.mount(host);
      frame.on("message", ({ type, payload }) => {
        if (type === "scene.position") app.events.emit("demo.scene", { seconds: Number(payload) });
      });
      void frame.load("blade.on('scene.seek', t => blade.post('scene.position', t));").then(() => frame.post("scene.seek", 3));
      return { destroy: () => frame.destroy() };
    },
  });
};
export default main;
```

```sh
tsc -p tsconfig.json
esbuild frontend/src/main.ts --bundle --format=esm --target=es2022 --outfile=public/app/main.js
```

**Worked example:** the feature demo follows this recipe
([toolkit consumer](demos.md#toolkit-consumer)). Its sources are
`examples/demo-app/frontend/src` (`index.ts` and one file per demo area), its
[`tsconfig.json`](../examples/demo-app/frontend/tsconfig.json) maps
`@61ade/admin` straight to `packages/frontend/dist/admin.d.ts` because it lives
in this repository (a consumer uses its `public/assets/61ade` link), `npm run
typecheck` runs it as `tsc -p examples/demo-app/frontend`, and
`tools/build.mjs` bundles it with the esbuild options above into
`examples/demo-app/public/app/demo.js`, declared in `application.php` as
`modules: ['app/demo.js']`. Its build refuses any import outside its own
sources, which enforces the types-only rule below.

Import 61ade and Suite **types only** (`import type`): the bundle above
contains no import at all. A runtime import of `@dhtmlx/suite` or `admin.js`
would bundle a second instance; use `app.dhx` for Suite widgets. `admin.d.ts`
declares types only (no run-time value to import): the contract generation is
the type `ApiVersion`, its value `app.apiVersion`.

<a id="event-catalog"></a>

## Event catalog

**Page events** (`app.events`, `AppEvents` in `src/api/types.ts`). Handlers
run synchronously in registration order; a throwing handler is logged and the
others still run. `on(name, handler, {signal}?)` returns the unsubscribe
function and unsubscribes when `signal` aborts (pass `{signal: host.signal}`). Framework
names contain `:` and only 61ade emits them; `emit` of such a name throws.

| Event | Payload | Fires |
| --- | --- | --- |
| `upload:queued` | `{file}`: `UploadFileInfo` (`id`, `name`, `size`, `type`, `relativePath`, `resource`, `action`, `target`) | a file entered the page's upload queue (any target, any caller) |
| `upload:started` | `{file}` | its transfer started |
| `upload:progress` | `{file, received, size}` (bytes) | while it transfers |
| `upload:conflict` | `{file, conflicts}` | the target reported a name conflict; the conflict dialog asks |
| `upload:file-done` | `{file, result}` (`UploadResult`) | the file was stored, or skipped by the target's answer |
| `upload:file-failed` | `{file, code, message}` (localized `message`) | the file failed |
| `upload:cancelled` | `{file}` | the user skipped it at a conflict or cancelled it |
| `upload:complete` | `UploadResult` of the whole run | every file queued on the page settled (with the summary toast); `onUploaded` of [`open`](#uploads) reports one batch instead |
| `view:opened` | `{id, record?, open}` | a view kind's `create` resolved and its instance is mounted (page or window) |
| `view:closed` | `{id, record?}` | a mounted instance was destroyed (navigation, window close, sign-out) |
| `module:error` | `{module, reason, error}`; `reason` `load` (import failed, no default export function), `init` (threw or rejected), `timeout` (import or initialization over 5 s) | while the shell loads modules; also a danger toast and `console.error` ([module loading](#module-loading)) |
| `sandbox:error` | `{message, code}`; `code` `error`, `timeout`, `size`, `protocol` | every `error` of every `SandboxFrame` on the page; no frame id ([pitfalls](#pitfalls)); also `console.warn` |
| `viewport:change` | `{narrow}` | the viewport crossed 768 px ([viewport](#viewport)), before any `PageLayout` switches |

**Project events:** a dotted name (`demo.scene`, `[a-z][a-z0-9_.-]*` with a
dot; anything else throws `TypeError`) declared by module augmentation, as in
the [recipe](#typescript-recipe):

```ts
declare module "@61ade/admin" {
  interface AppEvents { "demo.scene": { seconds: number } }
}
app.events.emit("demo.scene", { seconds: 3 });
```

Module load failures and sandbox errors stay in the browser (toast, events,
console); the server logs nothing for them
([product event catalog](product-direction.md#4-eseménynapló-lefedési-katalógus)).

**Component events** (`component.on(name, handler, {signal}?)`, delivered only
while mounted, never after `destroy()`):

| Component | Event | Payload | Fires |
| --- | --- | --- | --- |
| `ListView` | `select` | `{row}` (`undefined`: none) | the cursor record changed, also when it left the loaded window |
| | `target` | `{view, row, rows}` (`ListTarget`) | active selection, marks or record data changed, including previews and foremost sub-view windows; opening/closing a window restores the corresponding context |
| | `activate` | `{row, target, preventDefault()}` | double-click or Enter resolved to `target` (after the activation map and its fallbacks), before it runs; synchronous `preventDefault()` skips it; `details` also for a card or tile without a target and for the `#` cell |
| | `saved` | `{action, row}` | a form of the list (create, update, record action with fields, singleton Save) or an inline cell or card edit (`action` `update`) saved; `row` is the server's answer |
| | `changed` | `{rows, total?, matched?}` | the loaded window changed (load, scroll window, filter, live update, delete, revocation) |
| | `toggle` | `{command, pressed}` | the user changed a [toggle command](#registries) of the list's toolbar, after its kept state and its `toggle` callback |
| `Tree` | `select` | `{row}` (`undefined`: none) | the selected node changed: a click, Space or Enter, `select(id)`, the initial or restored selection, a refresh that removed or changed it |
| | `activate` | `{row}` | double-click or Enter on a node, after it is selected |
| `RecordForm` | `saved` | `{action, result}` | `submit` (or the submit button) succeeded |
| | `cancelled` | `{}` | Cancel was pressed |
| | `changed` | `{field, value}` | a field value was committed (on leaving the field) |
| `CommandBar` | `click` | `{id}` | an item was clicked, also from the collapsed `Műveletek` menu |
| `CommandBar` | `toggle` | `{id, pressed}` | the user flipped a toggle (the bar or the menu) |
| `CommandBar` | `select` | `{id, item}` | the user picked entry `item` of popup `id` |
| `CommandBar` | `change` | `{id, value}` | the user chose an option of a select or segmented choice, or moved a range (throttled while dragged) |
| `SettingsForm` | `change` | `{field, value, values}` | a user change of one field (immediate, on leaving a text field, throttled while a range is dragged) |
| `SettingsForm` | `submit` | `{values}` | the submit button (with `submit`) and the values passed validation |
| `Tabs` | `change` | `{id, previous}` | another tab opened (a click, the keys, `select`), after the guard allowed it |
| `PageLayout` | `collapse` | `{id, collapsed}` | a `collapsable` leaf collapsed or expanded (its header, its keys, `collapse`, `expand`); a call that changes nothing reports nothing |
| | `variant` | `{narrow}` | a page with a [`narrow` tree](#pagelayout-narrow) switched arrangement; its `Tabs`/`Accordion` are new |
| `Attachments` | `change` | `{items}` | a file was added, progressed, finished, failed or left; also `clear()` |
| | `remove` | `{item}` | a file left the list (its × button, Delete/Backspace, `remove`) |
| `Accordion` | `toggle` | `{id, open}` | a section opened or closed (a header click, the keys, `open`, `close`, `toggle`); a closing is reported before the opening it caused |
| `FileManager` | `opened` | `{id, mimeType}` | the viewer or text editor showed a file, also on previous/next |
| `DiagramEditor` | `saved` | `{}` | the open diagram's content was saved (`Mentés`, Ctrl+S) |
| `MediaPlayer` | `loop` | `{loop}` | repeat changes through `setLoop` or the player toolbar; unchanged values emit nothing |
| `MediaPlayer` | `loaded` | `{duration, width?, height?}` | the metadata is known (`duration` 0 for images) |
| | `position` | `{seconds}` | every 250 ms while playing, on pause and after a completed seek |
| | `ended` | `{}` | the media element ended (never while looping) |
| | `play`, `pause` | `{}` | playback started or stopped, also through the native controls, the keyboard or the end (drives a play/pause toggle) |
| | `error` | `{message}` (localized) | the source cannot be shown or played |
| `SandboxFrame` | `ready` | `{}` | the code's top-level evaluation completed |
| | `error` | `{message, code}` | as `sandbox:error` (the frame's `message` is untrusted text) |
| | `message` | `{type, payload}` | a project message from the frame (untrusted) |

`RecordDetails` and `Calendar` have no events; `FilePicker.pick` resolves a
promise instead.

<a id="layout-recipe"></a>

## Layout and ViewHost recipe

A page of declared panels uses [`PageLayout`](#pagelayout) (the playlist
editor and the day programme do); the rules below apply to it as well.
A view kind builds one Suite Layout from `app.dhx`, gives it to
`host.attach()` and mounts components into its cells. A `PageLayout` with a
[`narrow` tree](#pagelayout-narrow) switches its own arrangement at 768 px
and keeps the content. A page that builds its own Layout listens to
[`viewport:change`](#viewport) and rebuilds the whole Layout, attaching the
new one before it releases the old (a `SandboxFrame` keeps its document only
this way, see below). Each build owns an `AbortController` that the
host's signal aborts; components get its `signal`, and the Layout's
`destructor()` is registered on it **after** them, so they detach from their
cells first ([record view example](#example-record-view)):

```ts
const layout = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { type: "line", cols: [{ id: "stage" }, { id: "details", width: 380 }] }] });
host.attach(layout);                                  // the new content replaces the old one first
previous?.abort();                                    // then the previous build is released
new app.components.RecordDetails({ view: list, record: row, signal }).mount(layout.getCell("details"));
// …
signal.addEventListener("abort", () => layout.destructor(), { once: true });
```

<a id="page-command-bars"></a>

### Page and tab command rows

A composed page or tab's own commands use `CommandBar` in the first, 48 px
row of a `type: "none"` Layout attached directly to the host cell. In a tab,
the bar spans the panel immediately below the tab header. The content fills
the remaining row; its padding, panel frames and scrolling stay in that row.
The toolbar supplies its own button inset, divider and shadow. Reusable
presentation rules are in the
[61ade-ui skill](../.agents/skills/61ade-ui/SKILL.md#command-bars-in-pages-and-tabs)
([FB-0213](feedback.md#fb-0213)).

Here `tabs` is a mounted `Tabs` with a `details` tab, `list` and `row` are
the record's view and data, and `signal` is the build's signal:

```ts
const body = new app.dhx.Layout(null, { type: "none", rows: [
  { id: "commands", height: 48 },
  { id: "content" }
] });
tabs.attach("details", body);
new app.components.CommandBar({ label: t("Adatok"), signal, items }).mount(body.getCell("commands"));
new app.components.RecordDetails({ view: list, record: row, signal }).mount(body.getCell("content"));
signal.addEventListener("abort", () => body.destructor(), { once: true });
// Register the enclosing Tabs/layout teardown after these children.
```

A `PageLayout` tab uses `page.attach("details", body)` in the same way;
a page without tabs attaches the Layout to its `ViewHost`. A `ListView`
keeps its own record commands; a page bar is for the page's additional
commands, without copying the list's actions.

<a id="cell-content"></a>

**A project element in a cell** ([FB-0157](feedback.md#fb-0157)):
`app.ui.attach(cell, content, { signal })` puts a plain element (or a Suite
widget or component) into any Suite Layout cell, the recipe's own
`type: "none"` Layout included, with the wrapping that `PageLayout.attach`,
`Tabs.attach`, `Accordion.attach` and `ViewHost.attach` use. The element sits in
a full-size slot of the cell (no card, padding, border or gap), so a project's
own drawing surface fills the stage between the bars edge to edge like
`MediaPlayer` or `SandboxFrame`; the element sets its own size
(`display: block; width: 100%; height: 100%`). It is the same node across
Suite redraws, panel resizes and tab switches, so its listeners, focus and frame
loop keep running; aborting `signal` removes it. Pass the build's signal, which
also destroys the Layout. A widget or component is attached or mounted as by
`PageLayout.attach` and stays its owner's to destroy. A missing signal, a target
without `attach`/`attachHTML` or non-object content throws `TypeError`; an
already aborted signal attaches nothing. Inside a tab, attach the box Layout to
the tab's region and the element to the box's cell (the
[task page's](demos.md#d7-task-page) `Vázlat` tab):

```ts
const box = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { id: "stage" }, { id: "footer", height: 48 }] });
page.attach("sketch", box);                                         // a tab region of a PageLayout
new app.components.CommandBar({ label: t("Vázlat"), signal, items }).mount(box.getCell("commands"));
app.ui.attach(box.getCell("stage"), canvas, { signal });            // edge to edge, kept across redraws
new app.components.CommandBar({ placement: "bottom", signal, items: penItems }).mount(box.getCell("footer"));
signal.addEventListener("abort", () => { box.destructor(); page.destroy(); }, { once: true });
```

<a id="pitfalls"></a>

### Pitfalls

- **Suite Tabbar content shows only the active cell.** A widget in an
  inactive tab of a plain Suite `Tabbar` that repaints while hidden (a
  `RecordDetails.show`, a form's `enable`) throws on the next opening and the
  tab stays empty. Use [`Tabs`](#tabs) (or a `tabs` branch of
  [`PageLayout`](#pagelayout)), which keeps every panel rendered.
- **Elements into cells.** Suite's own `cell.attach(element)` throws
  (`this._ui.getRootView is not a function`), and `attachHTML` takes static
  markup only. Put a live element (listeners, focus, a frame loop) into a cell
  with [`app.ui.attach`](#cell-content) or the `attach` of `ViewHost`,
  `PageLayout`, `Tabs` or `Accordion`. A one-region `PageLayout` only to hold an
  element draws a framed panel inside the panel. `attachHTML` stays right for
  static markup whose events are delegated and released with the build's
  signal.
- **Suite Form `container` is PRO-only.** 61ade ships Suite Standard 9.3.12;
  a custom Form control is composed from Standard items (the demo's star strip
  is a `togglegroup`).
- **Suite `togglegroup` has no `aria-pressed`.** A pressed toggle is marked
  only by class and text; keep a labelled standard input as the accessible
  control of the value ([field type example](#example-tasks)).
- **Suite Slider has no ARIA role or value.** Its thumb is not announced;
  show the value as text as well and offer another keyboard route. The
  framework's own ranges do: a `SettingsForm` range pairs the slider with a
  number input, and a `CommandBar` range is a native range input.
- **Suite Form `fieldset` destructor.** Destroying a Form with a `fieldset`
  hides the fieldset's cell, which repaints the Form's own Layout one frame
  after it is gone (`Cannot read properties of null (reading 'type')`, now
  and then). `SettingsForm` groups are fieldsets and are released without
  it; a project Form with a `fieldset` stubs the fieldset item's `cell`
  before `destructor()`.
- **`sandbox:error` names no frame.** A page with several frames, or one that
  replaces its frame, either listens to each component's own `error` event or
  checks that the frame it tracks is still the current one before acting.
- **The held definition's id decides preferences.** A `ListView` keys saved
  mode, sort, columns and filters by the id of the definition it gets; give a
  page its own state by passing the definition under the page's view id
  ([ListView](#listview)).

<a id="conventions"></a>

## Naming conventions

The rules of API version 1 (closed out on 2026-10-30, [changes](#changes)):

- **Type names:** a component's instance type is its class name in
  `app.components` (`ListView`, `RecordForm`, `RecordDetails`, `FileManager`,
  `FilePicker`, `Calendar`, `DiagramEditor`, `MediaPlayer`, `SandboxFrame`,
  `CommandBar`); its constructor options are `<Class>Options` and its events
  `<Class>Events` (`FilePickerOptions` are the options of `pick`). The
  options of a built-in view kind are `<Kind>KindOptions`: `ListKindOptions`,
  `FilesKindOptions`, `DiagramKindOptions`, `CalendarKindOptions`.
- **Registries are named after what they hold:** `app.kinds` (view kinds),
  `presentations`, `fieldTypes`, `commands`; the views offered to the actor
  are `app.viewDefinitions()` and `app.viewDefinition(id)`.
- **Browser metadata is camelCase:** view `options` of every built-in kind
  (`rowHeight`, `nodeTypes`, `maxDepth`, `defaultView`), `ColumnMetadata`
  (`imageBase`, `altOf`, `mediaOf`), `FieldMetadata` with its `validation`
  (`minLength`, `matchesField`) and `file` (`folderId`, `canUpload`,
  `canChoose`; a stored file's `upload`, `get`, `canPreview`), `UploadPolicy` (`maxSizeBytes`, `chunkBytes`; a files view's
  `options.upload` is `{policy}` only), action metadata
  and event payloads (`opened` `{id, mimeType}`). The server normalises it;
  PHP and JSON configuration keep their own spelling (JSON snake-case, a
  field's `column` object also as in PHP). **Record data keeps the server's
  field names, never camel-cased:** rows, `_media` and `MediaDescriptor` (for
  example `mime_type`, `duration_ms`: `FilePicker.pick` resolves
  `media.mime_type`, while the framework's own `opened` payload says
  `mimeType`), action results and protocol answers (`UploadResult`, the
  transfer protocol's `chunk_bytes`, failure `details`).
- **Event names:** an event reported after the fact is a past participle
  (`saved`, `changed`, `opened`, `loaded`, `ended`, `cancelled`, `view:opened`,
  `upload:cancelled`); a user gesture reported as it happens or before the
  framework acts on it is the plain verb, as in the DOM (`select`, `activate`,
  `click`); a stream or a state is a noun or adjective (`position`, `error`,
  `message`, `ready`, `upload:progress`, `upload:complete`). Framework page
  events are `<area>:<event>`, project events `<project>.<event>`.
- **One way to pass the owner's signal:** the options object `{signal}`, last,
  on every subscription and on `server.form` ([services](#services)); a
  component's constructor options carry `signal` the same way.
- **Discriminated unions instead of optional ids:** a `CommandItem` is a
  `CommandButton`, a `CommandSeparator` or a `CommandSpacer` (no id).

<a id="limits"></a>

## Limits

Owner decisions of 2026-10-30 (gate G4): not planned in 61ade; a project that
needs one builds it in its own module.

- `ListView` has no separate `marked` event or method; `target` includes the
  active context's marks (added in [FB-0125](feedback.md#fb-0125)), `select`
  follows the main cursor and `changed` its loaded window. Commands retain
  their own context and marks.
- `MediaPlayer` has no playback-state event; derive it from your own
  `play()`/`pause()` calls and `position`/`ended`.
- Audio has no media class in the file manager: the list's media type filter
  offers no `Hang` and `FilePicker` lists no audio files
  ([files limits](files.md#limits)); an audio file reaches a `file` field by
  its upload.
- Marks and row selection are transient by design and never persisted.
- `TextDiff` compares plain text read-only: no merge, revert or editing, and
  no built-in "previous revision" rule (the project's command supplies both
  texts, see [TextDiff](#textdiff)).

A [popup menu](#popup-menu) has one level (no submenus), no type-ahead and
no bottom sheet on a phone; it picks one entry and closes (no multi-select
staying open).

Further limits: a column presentation gets no per-column options (a scale or
colour is fixed in the renderer or read from the row); one `Calendar` per page;
the [sandbox isolation limits](#sandbox-protocol); the
[pitfalls](#pitfalls) above.

<a id="worked-examples"></a>

## Worked examples

Excerpts of the feature demo's module ([toolkit consumer](demos.md#toolkit-consumer)),
shortened only where marked `// …`.

<a id="example-module"></a>

### One module, one part per area

[`index.ts`](../examples/demo-app/frontend/src/index.ts):

```ts
import type { ApplicationModule } from "@61ade/admin";
// …
import assets from "./assets";
// …
import playlist from "./playlist";
// …
import readings from "./readings";
// …
import tasks from "./tasks";

const demo: ApplicationModule = async app => {
  const failures: unknown[] = [];
  for (const part of [assets, playlist, readings, tasks]) {
    try { await part(app); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "61ade feature demo: a module part failed");
};
export default demo;
```

<a id="example-record-view"></a>

### Record view: Layout, CommandBar, RecordDetails and MediaPlayer

[`assets.ts`](../examples/demo-app/frontend/src/assets.ts), the kind
`demo.asset-viewer` opened by the `Médiatár` [activation map](#activation-map):

```ts
function viewer(app: Application, host: ViewHost, view: ViewDefinition<ViewerOptions>): ViewInstance {
  const t = (key: string, params?: Record<string, unknown>) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A médianéző egy médiaelemhez nyílik meg."));
  const row = host.record.row, listId = view.options?.details ?? host.record.resource;
  const list = app.viewDefinition(listId) as ViewDefinition<ListKindOptions> | undefined;
  // …
  const render = (): void => {
    if (host.signal.aborted) return;
    resume = player?.position() ?? resume;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    // …
    // The new content replaces the old one before the old build is released, so no cell repaints a destroyed widget.
    host.attach(layout);
    previous?.abort();
    player = undefined;
    // …
    const bar: CommandBar = new app.components.CommandBar({ signal, items: [
      { id: "back", label: t("Vissza a listához"), icon: "bi bi-arrow-left" },
      ...(timed ? [{ type: "separator" as const }] : []),
      { id: "rewind", label: t("Elejére"), icon: "bi bi-skip-start-fill", iconOnly: true, disabled: true, hidden: !timed },
      // … back 5 s, the play/pause toggle, forward 5 s, loop: icon-only like a player's transport controls
    ] });
    bar.mount(layout.getCell("commands"));
    bar.on("click", ({ id }) => {
      if (id === "back") { if (!app.navigate({ view: listId })) host.close(); return; }
      if (!player) return;
      if (id === "play") { if (playing) player.pause(); else void player.play().catch(() => {}); }
      // …
    });

    if (list) new app.components.RecordDetails({ view: list, record: row, signal }).mount(layout.getCell("details"));
    // … the MediaPlayer, see MediaPlayer above
    // Registered after the components, so they are destroyed (and detached from their cells) before the layout.
    signal.addEventListener("abort", () => layout.destructor(), { once: true });
  };

  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => { build?.abort(); player = undefined; } };
}

const assets: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<ViewerOptions>) => viewer(app, host, view) });
};
```

<a id="example-sandbox"></a>

### Sandboxed scene: SandboxFrame protocol, a fresh box per stage

[`playlist.ts`](../examples/demo-app/frontend/src/playlist.ts), the kind
`demo.playlist-preview`. The scene code comes from an action and runs in the
frame wrapped in the module's runtime (`SCENE_HEAD + code + SCENE_TAIL`, which
answers `scene.play`, `scene.pause` and `scene.seek` with `scene.state`):

```ts
const scene = async (stage: Stage, screen: Cell) => {
  const item = stage.item!, signal = stage.controller.signal;
  const frame = stage.frame = new app.components.SandboxFrame({ signal, title: t("Jelenet: {title}", { title: item.title }), readyTimeout: SCENE_READY });
  frame.mount(screen);
  stage.status = "loading";
  frame.on("message", ({ type, payload }) => {
    const state = type === "scene.state" ? sceneState(payload) : undefined;
    if (state && stage.status !== "error") { stage.state = state; caption(stage); }
  });
  // The page-wide framework event: every error of a SandboxFrame (code, timeout, size, protocol) is reported there.
  app.events.on("sandbox:error", ({ message }) => {
    if (shell?.stage !== stage) return;
    // …
  }, { signal });
  try {
    const code = await sceneCode(item.slot.asset!.id);
    if (signal.aborted) return;
    await frame.load(SCENE_HEAD + code + SCENE_TAIL);
    if (signal.aborted) return;
    stage.ready = true;
    stage.status = "ready";
    frame.post(playing ? "scene.play" : "scene.seek", { at: Math.max(0, now() - item.offset) });
    caption(stage);
  } catch (error) {
    // …
  }
};

const enter = (item: Item | undefined) => {
  // …
  const previous = s.stage, controller = new AbortController(), signal = controller.signal;
  s.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
  const stage: Stage = s.stage = { controller, item, ready: false, status: "" };
  const box: Layout = new app.dhx.Layout(null, { type: "none", rows: [{ id: "content" }] } as LayoutConfig);
  s.layout.getCell("screen").attach(box);
  const screen = box.getCell("content");
  if (!item) screen.attachHTML(message(idle()));
  else if (item.kind === "image" || item.kind === "video" || item.kind === "audio") {
    // … a MediaPlayer mounted in `screen`
  } else if (item.kind === "scene" && scenes) void scene(stage, screen);
  else screen.attachHTML(message(/* … */));
  // Registered after the player or frame (created above with `signal`), so they are destroyed before their box.
  signal.addEventListener("abort", () => box.destructor(), { once: true });
  caption(stage);
  previous?.controller.abort();
};
```

<a id="example-readings"></a>

### Dashboard: ListView, Chart and a column presentation

[`readings.ts`](../examples/demo-app/frontend/src/readings.ts), the kind
`demo.readings-dashboard` and the presentation `demo.reading-bar`:

```ts
function readingBar(app: Application): ColumnPresentation {
  const number = formatter(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    render(value, _row, _column, size, escape) {
      const reading = numeric(value);
      if (reading === null) return escape(value);
      const width = Math.round(Math.min(SCALE, Math.max(0, reading)) / SCALE * 1000) / 10;
      const text = app.i18n.t("{value} a 100-ból", { value: number.format(reading) });
      return `<span class="demo-reading-bar demo-reading-bar--${size === "card" || size === "tile" ? size : "cell"}" title="${escape(text)}">`
        + `<span class="demo-reading-bar__track" aria-hidden="true"><span class="demo-reading-bar__fill" style="width:${width}%"></span></span>`
        + `<span class="demo-reading-bar__value">${escape(number.format(reading))}</span></span>`;
    },
    text: value => {
      const reading = numeric(value);
      return reading === null ? String(value ?? "") : app.i18n.t("{value} a 100-ból", { value: number.format(reading) });
    },
  };
}

function dashboard(app: Application, host: ViewHost, view: ViewDefinition<DashboardOptions>): ViewInstance {
  const options = dashboardOptions(view);
  // The dashboard's list keeps its own mode, sort, columns and filters: a ListView keys its preferences by the id of
  // the definition it is given, so it gets the offered list view under the dashboard's view id. Filtering here never
  // changes the plain `Mérések` page (its preferences stay under `demo_readings`); the server still checks every call.
  const source = app.viewDefinition(options.list) as ViewDefinition<ListKindOptions> | undefined;
  if (!source || source.kind !== "list") throw new TypeError(`61ade feature demo: "${options.list}" is not an offered list view.`);
  const listView: ViewDefinition<ListKindOptions> = { ...source, id: view.id };
  // …
  const build = () => {
    // …
    host.attach(layout);
    const chart: Chart = new app.dhx.Chart(null as unknown as HTMLElement, chartConfig(colors()));
    layout.getCell("chart").attach(chart);
    // … render() writes the summary cell with attachHTML and the chart data
    // Unsubscribed by the build's signal, before the cleanup below (registered earlier, so it runs first).
    app.theme.onChange(() => { chart.setConfig(chartConfig(colors())); render(); }, { signal });
    let current: ListView | undefined;
    // Registered before the ListView exists, so a failing constructor still releases the chart and the layout.
    signal.addEventListener("abort", () => {
      current?.destroy();
      layout.getCell("chart").detach();
      chart.destructor();
      layout.destructor();
      if (list === current) list = undefined;
    }, { once: true });
    current = list = new app.components.ListView({ view: listView, filters: presets, signal });
    // … `changed` and `select`, see ListView above
    current.mount(layout.getCell("list"));
    render();
  };
  // …
  return { destroy: close, editing: () => list?.editing() ?? false, refresh: () => list?.refresh() };
}

const readings: ApplicationModule = app => {
  app.presentations.register(BAR, readingBar(app));
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<DashboardOptions>) => dashboard(app, host, view) });
};
```

The bar is decorative (`aria-hidden`); the escaped number beside it is the
text alternative, and `text` gives tooltips and copy commands the same words.

<a id="example-tasks"></a>

### Field type and record command

[`tasks.ts`](../examples/demo-app/frontend/src/tasks.ts), declared by
`"editor": "demo.rating"` on `priority` and `"commands": ["demo.copy-text"]`
in `modules/tasks.json`:

```ts
app.fieldTypes.register("demo.rating", {
  input: (field: FieldMetadata, value: unknown, readOnly: boolean) => ({
    css: "demo-rating-field",
    rows: [
      {
        type: "input", name: field.name, label: field.label, labelPosition: "top", inputType: "number", min: 0, max: TOP, step: 1,
        required: !readOnly && field.required, readOnly, value: String(value ?? field.defaultValue ?? ""),
      },
      {
        type: "togglegroup", name: stripName(field), css: "demo-rating-stars", multiselection: true, gap: 4, hidden: readOnly,
        options: Array.from({ length: TOP }, (_, index) => ({ id: starId(index + 1), text: "★", offText: "☆" })),
        value: pressed(level(value ?? field.defaultValue) ?? 0),
      },
    ],
  }),
  bind: bindStars,
  display: (value, _row, _field, size, escape) => stars(app, value, size, escape),
});

app.commands.register("demo.copy-text", {
  label: "Másolás szövegként",
  icon: "bi bi-copy",
  placement: "record",
  // The cursor record, or every marked task when there are marks.
  enabled: ({ row, rows }) => !!row || rows.length > 0,
  run: async ({ app, view, row, rows, signal }) => {
    const targets = rows.length ? rows : row ? [row] : [];
    if (!targets.length || !view.resource) return;
    // …
    // Fresh reads through the action: the server's ACL and field ACL decide the content.
    for (const target of targets) texts.push(recordText(view, await app.server.call<Row>(view.resource, "get", { id: String(target.id), signal })));
    // …
    app.ui.toast(app.i18n.t("Vágólapra másolva: {count} feladat.", { count: targets.length }));
  },
});
```

The number input is the field's labelled control (the Form item named after
the field); the `togglegroup` is a second item whose events `bindStars` ties
to it and detaches on the form's `signal`. `display` gives one accessible name
(`3 / 5 csillag`) instead of the star glyphs.

<a id="verification"></a>

## Verification

The [focused task group](development.md#focused-task-groups) of the toolkit:

- PHP: `php8.4 tests/shell/toolkit.php` (views, kind providers, the view-id
  rule, record views, activation maps, modules, stylesheets, cache keys),
  `contracts.php`, `configuration.php`, `lists.php`; for the feature demo
  `signage.php`.
- Node: `node tests/shell/toolkit-kernel.mjs`, `toolkit-list.mjs`,
  `toolkit-components.mjs`, `toolkit-registries.mjs`, `toolkit-sandbox.mjs`,
  `ui-preferences.mjs`.
- Build and types: `npm run typecheck` (the API and the feature demo module
  against `admin.d.ts`), `npm run build`, `node tools/build.mjs --check`.
- Browser (`npm run test:browser -- tests/shell/<spec>` on the managed URL):
  `toolkit-list`, `toolkit-components`, `toolkit-media`, `toolkit-sandbox`,
  `toolkit-registries`, `toolkit-menu` (the popup menu, also in the feature
  demo's `Munkaasztal`), and the feature demo's `toolkit-demo`,
  `toolkit-demo-assets`, `toolkit-demo-playlist`, `toolkit-demo-readings`,
  `toolkit-demo-tasks`, `toolkit-demo-playlist-editor` and `tabs`
  (`.spec.cjs`); regressions `browser`, `preferences`, `activation`.

Results per phase are recorded in [FB-0081](feedback.md#fb-0081); the plan's
[verification matrix](toolkit-plan.md#9-verification-matrix) lists the areas.

<a id="migration"></a>

| # | Change | Source | Needs |
| M1 | Address `#view=<id>[&record=<id>]` ([routing](#routing)); `#feature=<resource>` is a legacy alias that resolves to the view whose id equals the resource and is rewritten to `#view=` with `replaceState`; `activate: 'page'` writes `#view=<child id>` | P2, FB-0081 | if used: code or specs that read or assert the hash |
| M2 | Menu item ids `feature:<resource>` → `view:<id>` (`sibling:view:<id>` in the collapsed menu) | P2 | if used: specs or CSS that address menu ids |
| M3 | Bootstrap `views` shape: list keys under `options`, `id` and `kind` always set ([bootstrap shape](#views)) | P2 | if used: code reading `#blade-config` `views` |
| M4 | `Registry::view/fileManager/diagram/calendar` and `SqlResource::register` return `View` and take an optional `id` (`view`/`register` also `activate`, `commands`); `Registry::views()` returns `list<View>` objects instead of arrays; a later declaration with the same id replaces the earlier one ([rule](#view-id-rule)) | P2 | if used: PHP that reads `$registry->views()` as arrays |
| M5 | `Registry::subview/appendViewActions` take view ids (default = resource) | P2 | info |
| M6 | Project `stylesheets` ([module loading](#module-loading)) replace stylesheet injection; linked on signed-in pages only, after `admin.css` and skins | P2, O8 | if used: a consumer that injects its own CSS |
| M7 | `.deploy.json` `shared_assets.files` adds `sandbox.html` beside `admin.js` ([packaging](#packaging)); `admin.d.ts` is never deployed | P3, O6 | if used: `SandboxFrame` users |
| M8 | Frontend internals (`Workspace` constructor, which now takes the shell's `LiveChannel`, private classes) are not a contract; use `app` and [components](#components) | P3 | info |
| M9 | [Cache keys](#cache-keys) from the served file `?v=<base36 mtime>-<base36 size>`: `admin.js`/`admin.css` (released build `?v=30`, dev URL `?v=32` from `02a64d6` to `edbc90f`), project `modules`/`stylesheets` (formerly `?v=<version>`, still the fallback), skin stylesheets and AuthHandler files (formerly unkeyed); an own `?…` key stays as written | P4, FB-0085 | if used: specs that assert `?v=30`, `?v=32` or `?v=<version>` on these URLs must accept the file key |
| M10 | Record commands only in the list toolbar; the record context menu is gone: a right click, the context-menu key or Shift+F10 on a row, card or tile keeps the browser's own behaviour ([registries](#registries)). `Adatok` is the `details` record command: toolbar id `blade-results` → `blade-command:details`, disabled without a cursor record or with several marks | P3 C-5b | if used: specs that open a row context menu (use the toolbar or `Műveletek`) or address `blade-results` |
| M11 | Live protocol 2 ([FB-0075](feedback.md#fb-0075)): one channel per tab; `dist` and `packages/php/bin/live-server.mjs` must come from the same commit; a page loaded before an update gets 4409 and reloads once | before P0 | if used: a WebSocket live service |
| M12 | Product name `61de` → `61ade` ([FB-0070](feedback.md#fb-0070), [renaming](renaming.md#61de--61ade-correction-2026-10-29)): package names, recommended link names, product texts in logs (`61ade unavailable:`) and errors; `Blade\`, `BLADE_*`, `blade_*` unchanged; old link names keep working | before P0 | info |
| M13 | A form checkbox's accessible name is its field label again (`Archivált`); the released build exposed `checkbox Archivált` ([FB-0082](feedback.md#fb-0082)) | before P2 | if used: specs that matched the doubled name |
| M14 | Menu pages keep their header and panel filter values in browser storage per path, user and view; `Alaphelyzet` clears them ([FB-0079](feedback.md#fb-0079)) | before P0 | info: a spec that reuses a storage state may start filtered |
| M15 | New optional capabilities, nothing changes until used: tenancy ([FB-0069](feedback.md#fb-0069); `blade_tokens.tenant_id`, `blade_audit.tenant_id` and the tenant tables only after `Tenancy::install`), sub-views (FB-0071), skins (FB-0072), one live server for several applications (FB-0074), static image column (FB-0076), declared activation incl. `page` (FB-0077, FB-0078), and the toolkit: modules, `app` services, registries, record views, [activation map](#activation-map), components, `SandboxFrame`, `documentRoot` | all | info |
| M16 | `app.views` → `app.kinds` (the view-kind registry; views stay `viewDefinitions()`) | close-out | if used: project modules |
| M17 | `admin.d.ts` type names: instance = class name, `<Class>Options`, `<Class>Events`, `<Kind>KindOptions` (`FileManagerComponent`→`FileManager`, `CalendarComponent`→`Calendar`, `DiagramEditorComponent`→`DiagramEditor`, `FilePickerApi`→`FilePicker`, `ListOptions`→`ListKindOptions`, `FileManagerOptions`→`FilesKindOptions`, `DiagramOptions`→`DiagramKindOptions`, `CalendarOptions`→`CalendarKindOptions`); new `CommandButton`/`CommandSpacer`/`SignalOptions`; `apiVersion` is type-only (`ApiVersion`, runtime `app.apiVersion`) | close-out | if used: TypeScript modules |
| M18 | `{signal}` options on `events.on`, `live.subscribe`, `theme.onChange`, `server.form` and every component `on`; a positional signal throws `TypeError` | close-out | if used |
| M19 | Browser metadata is camelCase: columns (`imageBase`, `altOf`, `mediaOf`), files and calendar view options, `UploadPolicy`, field `file`/`validation` in views and `__form`; a files view's `options.upload` is `{policy}` only. Record data (rows, `_media`, `MediaDescriptor`) keeps server names. PHP/JSON configuration unchanged | close-out | if used: code or specs reading view or `__form` metadata |
| M20 | `RecordForm` `cancel` → `cancelled`; `FileManager` `opened` `{id, mimeType}`; toolbar spacers `{type: "spacer"}` without id | close-out | if used |
| M21 | `dist/sandbox.js` removed: the bootstrap is inline in `sandbox.html`, allowed by a CSP hash (no `script-src 'self'`) | close-out | if used: `SandboxFrame` |
| M22 | Escape closes the `Műveletek` menu; an open file-manager or calendar form now counts as editing (blocks the live reload, gets the ended-session modal) | close-out | info |
| M23 | Sign-in customization ([shell](shell.md#sign-in-branding)): optional `logo` (placement `window`/`top`/`both`), `signInStylesheets`, `signIn` notice and links, `signInModules` (restricted `SignInApplication`, trusted code only); `data-blade-page` on `<html>`; only the [documented hooks](shell.md#sign-in-css-hooks) are supported | [FB-0087](feedback.md#fb-0087) | if used: a consumer that injects CSS or markup for its sign-in look or logo |
| M24 | `#feature=<resource>` removed: only `#view=` names a view; any other address gives the empty workspace | [FB-0081](feedback.md#fb-0081) | if used: mail links, specs |
| M25 | `ClientCommand.placement` `both` removed; a placement other than `toolbar` or `record` is skipped with a warning | [FB-0081](feedback.md#fb-0081) | if used |
| M26 | `__watch` accepts only `values.subscriptions` (otherwise 400) | [FB-0081](feedback.md#fb-0081) | if used: own polling |
| M27 | `list` without parameters returns the first cursor window `{items, …}`; the offset/plain-array answer and a list id (400) are removed | [FB-0081](feedback.md#fb-0081) | if used: API clients, specs reading a plain array |
| M28 | `blade_tenant_members.active` is dropped: run migration `0003-tenant-member-active` before `Tenancy::install()`, which refuses the old table. Until it has run the application fails closed: every membership read throws a `LogicException` naming the migration and grants nothing | [FB-0081](feedback.md#fb-0081) | if tenancy |
| M29 | `MessageDialog` `alert()`/`confirm()` wrappers removed; use `acknowledge`, `requestConfirmation` or `app.ui.dialog` | [FB-0081](feedback.md#fb-0081) | if used |
| M30 | A duplicate view id throws at definition time; `Registry::updateView()` and `View::list()` change a declared view explicitly | [FB-0081](feedback.md#fb-0081) | if used: redeclared views |
| M31 | The file manager's `list` answer drops `truncated` | [FB-0081](feedback.md#fb-0081) | if used |
| M32 | Applications without `logo` show the 61ade product logo ([brand](brand.md)) in the top row (only where the menu leaves room) and above the sign-in form, accessible name `blade`; `Logo::none()` / JSON `"logo": false` turns it off | [FB-0088](feedback.md#fb-0088) | info; if a consumer wants no logo |
| M33 | The first shell page of each browser window or tab opens with the 61ade [trademark screen](brand.md#splash) (about 3.3 s, not configurable); it covers the page and takes the pointer until it fades out; the shell's CSP `script-src` carries the hash of its inline gate | [FB-0089](feedback.md#fb-0089) | info: specs that screenshot or hit-test right after loading |
| M34 | View guides ([workspaces](workspaces.md#view-guide)): a view with `guide` opens a non-modal `Útmutató: <title>` window when it opens as a page, until the user closes it once; the lower bar gains an `Útmutató` button. New, additive: `Registry::tree()` / JSON `view.tree` ([tree navigation](workspaces.md#tree-navigation)), `Field` `visibleWhen` / JSON `visible_when` ([conditional fields](workspaces.md#conditional-fields)), `ListKindOptions.tree`, `FieldMetadata.visibleWhen`, `ViewDefinition.guide`; a `RecordForm` mounted in an `AppWindow` fits it once its fields show | [FB-0107](feedback.md#fb-0107) | info: specs whose views get a guide (close it, or seed the dismissal) |
| M35 | Lists and forms ([manual order and drops](workspaces.md#manual-order), [card filters](workspaces.md#card-filters)): a list with header filters and no filter panel shows `Szűrés` in cards and tiles (the header filters in a dialog); header filter inputs are named `Szűrés: <column>`; draggable rows (a manual order, a drop, `dragSource`) start with a drag-handle column; a checkbox in a framework form shows its text; `RecordForm` submits under the action's label when no view gives a `submitLabel` and shows no success toast for a read-only action. New, additive: `SqlResource` `order` / JSON `storage.order` with the `move` action, `View`/builder `drop` / JSON `view.drop`, `ListKindOptions.order`/`drop`, `ListViewOptions.dragSource`/`panel`/`showId`, `RecordFormOptions.cancel`, `RecordForm.setValues`, `RecordDetailsOptions.showId`, `PageLayout`, computed `column.media` fields, the `not_before_field`/`not_after_field` rules | [FB-0108](feedback.md#fb-0108) | info: specs that count toolbar items in cards, find header filters by position or expect `Mentés` or a toast from a query form |
| M36 | (Automatic opening frequency superseded by [FB-0243](feedback.md#fb-0243).) View guides ([workspaces](workspaces.md#view-guide)): a guide opens by itself once per sign-in session (the first time its view opens as a page in a tab), no longer until it is closed; the `Útmutató` button moves from the lower bar to the top row, left of the language selector (below 768 px an item of `Menü`). New, additive: `ApplicationDefinition` `guides` / JSON `application.guides` (guides by view id, the framework's own views too), `SqlResource::register()` `guide` | [FB-0109](feedback.md#fb-0109) | if used: specs that click the lower bar's `Útmutató` or seed the `localStorage` key `blade-guide:1:` |
| M37 | Common Toolbar inset (`--blade-toolbar-padding`, default `4px 8px`) and flat shell navigation in every skin; below 768 px the right-hand tenant/guide/language/theme controls collapse together into `Beállítások`. Toolbar submenus cascade right when they fit, otherwise replace ancestors at the toolbar toggle with `Vissza`/ArrowLeft | [FB-0122](feedback.md#fb-0122), [FB-0135](feedback.md#fb-0135) | if used: mobile UI specs must open the controls menu before choosing a selector or guide |
| M38 | Tabs ([Tabs](#tabs)): `app.components.Tabs`, a `tabs` branch of `PageLayout` (region ids starting with `blade-` are now refused), `PageLayout` `guard`/`tabsOf`; `RecordForm.destroy()` destroys its Suite Form one redraw later | [FB-0145](feedback.md#fb-0145) | info: a `PageLayout` region id starting with `blade-` throws `TypeError` |
| M39 | Accordion ([Accordion](#accordion)): `app.components.Accordion`, an `accordion` branch of `PageLayout` (`multiple`, a section's `open`), `PageLayout.accordionOf` | [FB-0148](feedback.md#fb-0148) | info: `open` and `multiple` were refused before as unsupported options and are now accepted only in an `accordion` branch |
| M40 | Menu-less list views ([views](#menu-less-views)): `menu: false` on `View`, `View::list`, `Registry::view`, `SqlResource::register` and JSON `view.menu`; bootstrap `menu: false`; such a view has no menu entry and its address and `navigate` are refused | [FB-0149](feedback.md#fb-0149) | info: a bootstrap view may carry `menu`; code that lists `viewDefinitions()` as navigation targets skips `menu: false` |
| M41 | First sort and long text in cards ([list sort](workspaces.md#list-sort), [long text](workspaces.md#long-text-in-cards)): `sort` on `View::list`, `Registry::view`, `SqlResource::register` and JSON `view.sort`; bootstrap `options.sort`; a `textarea` field shows at most 4 lines on a card | [FB-0152](feedback.md#fb-0152) | info: specs that read a long `textarea` value from a card's visible text see the first 4 lines (the DOM keeps the whole value) |
| M42 | [PageLayout](#pagelayout-collapse) `collapse(id)`, `expand(id)`, `isCollapsed(id)` and the `collapse` event; `attach(id, component)` of `PageLayout`, `Tabs` and `Accordion` mounts the component (its events are delivered) | [FB-0153](feedback.md#fb-0153) | info: a component attached into a region and then mounted again (or attached twice) throws `already mounted`; mount it once |
| M43 | [CommandBar menu](#commandbar-menu): `{type: "menu", id, label, icon, iconOnly, items}`, one *more actions* button whose entries report `click` (a submenu of `Műveletek` when collapsed) | [FB-0154](feedback.md#fb-0154) | none |
| M44 | Suite's English-only names in the page's language ([window](#app-window), [PageLayout](#pagelayout-collapse)): a `collapsable` Layout header is `‹header› összecsukása` / `‹header› kinyitása`, a window's close button `Ablak bezárása`; Escape closes a `modal: false` `app.ui.window` while the focus is inside it | [FB-0155](feedback.md#fb-0155) | info: specs that find a header by "click to collapse"/"click to expand" or a close button by "close" use the localized names |
| M45 | [Cell content](#cell-content): `app.ui.attach(cell, content, {signal})` puts a plain element, Suite widget or component into any Suite Layout cell (a `type: "none"` box included), edge to edge | [FB-0157](feedback.md#fb-0157) | info: a one-region `PageLayout` that only held an element can become a box Layout cell with `app.ui.attach` (no framed panel) |
| M46 | [Tree](#tree): `app.components.Tree` over a list view with a hierarchy on itself (`select`, `activate`; `selected`, `select(id)`, `refresh(id?)`; `initial`, `id`); tree navigation's panel is built on it and its keys follow the WAI-ARIA tree (Space selects, Enter selects and activates) | [FB-0158](feedback.md#fb-0158) | info: a tree navigation spec that relied on Suite's own key handling uses the documented keys |
| M47 | Toggle command ([registries](#registries)): `ClientCommand.type: "toggle"`, `pressed`, `toggle(context)`; `run` is optional for a toggle; the state in `app.preferences.scope(<command name>)` under the view id; `ListView` event `toggle` | [FB-0159](feedback.md#fb-0159) | info: TypeScript code that calls `command.run(…)` on a `ClientCommand` handles the optional `run` |
| M48 | [Menu attention](shell.md#menu-attention): `attention: ['filters' => […], 'tone' => …]` on `View`, `View::list`, `Registry::view`, `SqlResource::register`, JSON `view.attention`; bootstrap `attention`; a live count badge on the entry, its branch and `Menü` | [FB-0160](feedback.md#fb-0160) | info: an entry with a count has the accessible name `‹label›, n függőben`; its branch and `Menü` keep their names but their visible text gains the number; each such view adds one live subscription of one row per page |
| M49 | [ListView](#listview) `createDefaults` and `preferencesKey`; `ClientCommand.pinned` ([registries](#registries)); `column.details: false` on a field ([field presentation](field-presentation.md)), left out of `detailFields` | [FB-0162](feedback.md#fb-0162)–[FB-0165](feedback.md#fb-0165) | info: a consumer that strips helper fields from its own details, opens its own create form with a preset, keeps a toggle in `Műveletek` or keeps one preference set per scope can use these instead |
| M50 | [List scope](workspaces.md#list-scope): a scoped list and a `Tree` send `scope: {field, value}` instead of the scope as a filter (exact, also for text); a field `scopeOnly: true` (JSON `scope_only`) is a scope key only: no column, details, filter or sort, and `filters`/`sort` naming it are refused | [FB-0166](feedback.md#fb-0166) | a project `list` action handler of its own (not `SqlResource`) that read a scope from `values.filters` reads `values.scope`; browser specs or mocks that inspect a scoped list's `filters` look at `scope`; a list scoped on a text field now matches it exactly |
| M51 | [Stored file field](workspaces.md#stored-file-field): PHP/JSON `file: {upload, get?, accept}` (a file in the project's own storage, uploaded through the project's upload action and saved with the record); `FieldMetadata.file` is `FileFieldConfig \| StoredFileFieldConfig` | [FB-0167](feedback.md#fb-0167) | info: TypeScript code that reads `field.file.resource` or `.mount` of any field narrows first (`"upload" in field.file`); a two-step "save, then upload" flow can become one save |
| M52 | [Tree expansion](#tree-expansion): `Tree` options `expand` (levels opened while no expansion is stored) and `expandControl` (`Mindet kinyit` / `Mindet bezár`), methods `expandAll()` (→ `TreeExpansion`) and `collapseAll()`, key `*`; caps of 10 levels and 2000 loaded nodes; the stored expansion is written only once the user changed it, upper levels first | [FB-0168](feedback.md#fb-0168) | info: a spec that read a `Tree`'s stored `expanded` before any expansion change finds only `selected`; a state stored before this change still counts as the user's expansion |
| M53 | [Cards only and full-width cards](workspaces.md#cards-only-and-full-width-cards): `modes` and `cardColumns` on `View::list`, `Registry::view`, `SqlResource::register` (JSON `view.modes`, `view.card_columns`), `ListKindOptions` and `ListViewOptions` (the component option wins); one mode hides the `Nézet` menu and ignores a kept other choice | [FB-0169](feedback.md#fb-0169) | info: a page that forced cards with `mode: "cards"` and its own CSS or layout for long text can declare cards only and one column instead; a `ListView` `mode` outside its `modes` throws `TypeError`; a kept `tiles` on a view without tiles now opens in the `ListView`'s `mode` (for example `cards`) instead of the table |
| M54 | [Read-only fields](workspaces.md#read-only-fields): `Action::$display` and `SqlResource` `createOnly` (JSON `storage.create_only`); `__form` marks them `readOnly: true` and lists them first; an input field the actor may read but not write in a form of a record is now shown read-only instead of left out; `RecordFormOptions.readOnly`; a read-only select, multiselect or checkbox shows its option label (the singleton's details form showed a select's key), a read-only long text stays multi-line | [FB-0171](feedback.md#fb-0171) | info: a spec that expected a write-denied field to be absent from an update form finds it read-only; a spec that read a read-only select's value finds its label |
| M55 | [Form sections](workspaces.md#form-sections): a field's `section` (PHP `Field`, JSON `section`) groups fields into a collapsible fieldset of the action forms; `FieldMetadata.section`, `ColumnMetadata.section` | [FB-0172](feedback.md#fb-0172) | none (additive) |
| M56 | [Count fields](workspaces.md#count-fields): `SqlResource` `counts` (JSON `storage.counts`): a declared number field counting the records of another list resource the actor could list (its list ACL, `where`, tenant and archive policy), on list rows, `get` and live snapshots; not input, filter or sort. [Tenancy](tenancy.md): `computed` SQL receives no tenant (the guide said it did) | [FB-0173](feedback.md#fb-0173) | info: a computed count over another table's tenant-scoped rows on a global resource counts every tenant; use a count field |
| M57 | [Shared rows](tenancy.md#shared-rows): `SqlResource` `sharedTenant`, `sharedRoles` (JSON `storage.shared_tenant`, `storage.shared_roles`); rows carry `_shared: true`; a tenant's write actions on a shared row are refused (403 `A közös adat csak olvasható.`) and left out of `_actions`; `Acl::holds()`, `Registry::realm()`/`tenantReady()`, `Registry::scopeToTenant()` takes the shared value and roles | [FB-0175](feedback.md#fb-0175) | info: shared content mirrored into every tenant can move into one shared row set |
| M58 | [Form sections](workspaces.md#form-sections) as framed panels: `sectionCollapsible: false` (JSON `section_collapsible`) makes a fixed, always open section (`FieldMetadata.sectionCollapsible`, `ColumnMetadata.sectionCollapsible`); the sections also [group cards and details](workspaces.md#card-groups); `column.cardLines` (JSON `card_lines`) sets a long text's card lines; a fitted window stops at `WindowOptions.maxHeight` (default 800 px) with its action row sticking to its lower edge ([window sizing](workspaces.md#window-sizing)); `CommandButton.pinned`; the Tree's `expandControl` is two pinned icon buttons | [FB-0177](feedback.md#fb-0177) | info: a section that holds fields which must always show declares `sectionCollapsible: false`; cards and the `Adatok` window of a resource with sections show groups; a tall form window is at most 800 px high (pass `maxHeight` for more); a spec that looked for the tree control in `Műveletek` at 390 px finds the buttons in the bar; a spec that counted `.blade-form-section fieldset` finds fixed sections too |
| M59 | [Accordion form sections](workspaces.md#form-accordion): an action's `formSections` (PHP `Action`, `SqlResource::register`; JSON `operations.form_sections`, an action's `form_sections`): `'panels'` (default), `'accordion'` or `'accordion-multiple'`; `FormDescription.formSections`, type `FormSections` | [FB-0178](feedback.md#fb-0178) | none (additive) |
| M60 | [`app.ui.window`](#app-window) `fit()` does nothing for a window that does not fit (`fit: false`, a full-screen window below 768 px): a `RecordForm` or `SettingsForm` in it no longer resizes it | [FB-0178](feedback.md#fb-0178) | info: a `RecordForm` in a `fit: false` window kept the requested size only until its fields showed and then fitted; it now keeps it (drop `fit: false` to fit); on a phone the window stays full screen |
| M61 | [Accordion form sections](workspaces.md#form-accordion) edge to edge: an action's `flushSections` (PHP `Action`, `SqlResource::register`; JSON `flush_sections`), `FormDescription.flushSections`; the framed stack keeps an even 20 px margin | [FB-0178](feedback.md#fb-0178) | none (additive; the framed stack moved 4 px up and its lower margin grew to 20 px) |
| M62 | [Delegated access](access-and-actions.md#delegated-access): `SqlResource` `delegation` (`Delegation`, `DelegationLink`, `DelegationVia`; JSON `storage.delegation`), ACL scope `delegated` (admin `Delegált objektum`, refused for a resource without a declaration); `Acl::allows()`/`fieldAllowed()` take optional `destination` and `deferred`, `Acl::predicate()` an optional `qualifier`, `Acl::delegates()`, `Registry::delegate()`/`delegation()`, `Executor::permit()`. A `delegated` rule without a declaration fails the operation, and a deny with an unknown scope now denies everything | [FB-0180](feedback.md#fb-0180) | info: stored rules with a scope other than all/own/id now deny when they are denies |
| M63 | [Section-filling fields](workspaces.md#form-section-fill): a field's `sectionFill` (PHP `Field`, JSON `section_fill`), `FieldMetadata.sectionFill`: a textarea or file field alone in its section, named by the section's header; an open accordion section is the textarea, or the drop area fills it | [FB-0181](feedback.md#fb-0181) | none (additive) |
| M64 | [Several stored files](workspaces.md#stored-file-multiple): a stored file field's `multiple` (2–20; PHP and JSON `file.multiple`), `StoredFileFieldConfig.multiple`: a comma-joined list of ids, each new token claimed, the uploader's zone and queue in the form at a fixed height | [FB-0181](feedback.md#fb-0181) | none (additive) |
| M65 | [Loading and empty states](#loading-and-empty-states): every list shows a loading indicator (`aria-busy`) and an empty-result text (`Nincs megjeleníthető elem.`, with a filter or search `Nincs a szűrésnek vagy a keresésnek megfelelő elem.`, after a failure `Az elemek nem érhetők el.`), `ListViewOptions.emptyText`; `RecordDetails` and `RecordForm` show the indicator while their data loads; a `PageLayout` region, tab or section without content shows `Nincs megjeleníthető tartalom.` on a blank surface with a centred picture, `placeholder(id, {text, busy})` of `PageLayout`, `Tabs` and `Accordion`, type `RegionPlaceholder` | [FB-0185](feedback.md#fb-0185) | info: an empty region shows the default text instead of white space, and a page's own hint element in it can go |
| M66 | [Theme motion](shell.md#theme-motion): in Blade and Blade Night, `Accordion` sections, accordion form sections, `collapsable` Layout cells (`PageLayout`, list workspaces, tree navigation) and the folders of every Suite Tree (`RecordTree`, file manager) ease to their new size in 200 ms (`--blade-motion-duration`; `0s` under `prefers-reduced-motion`); state, events and ARIA change at once | [FB-0187](feedback.md#fb-0187) | info: a browser test that reads a region's size right after a toggle waits for the size to settle (`expect.poll`, or `page.emulateMedia({reducedMotion: "reduce"})`) |
| M67 | [Accordion forms](workspaces.md#form-accordion): fixed sections (`sectionCollapsible: false`) keep their legend above their own scrolling fields and shrink when constrained; natural height is kept when it fits | [FB-0188](feedback.md#fb-0188) | info: applies to framed and flush forms; no declaration change |
| M68 | [Card hover](shell.md#61ade-character): a hovered card or tile no longer rises; its edge lights up (border colour, outer ring, `--blade-lift-shadow`) and one light sweep crosses it on an overlay, the card and its content keep their boxes; token `--blade-card-hover-edge` | [FB-0189](feedback.md#fb-0189) | info: a browser test no longer has to move the pointer off a card before reading its geometry |
| M69 | [Tree](#tree) `expandControl` is one toggle icon button on the right of the bar (`Mindet kinyit` until everything is open, then `Mindet bezár`), `expandControl: {placement: "top"|"bottom"}`; a [CommandBar](#commandbar) mounted above content casts the command row's shadow; a pinned item after a `spacer` stays on the right in the collapsed bar; tree navigation's toolbar collapses into `Műveletek`; a region's idle status no longer makes its cell 1 px too high (no scrollbar over a toolbar) | [FB-0191](feedback.md#fb-0191) | info: a spec that looked for both `Mindet kinyit` and `Mindet bezár` finds one button whose name follows the state; a spec that clicked a tree navigation action in a narrow panel opens `Műveletek` first |
| M70 | [Tree presentation](#tree-presentation): every Suite Tree row is 40 px high (a grid row) with one ellipsized line; `TreeOptions.striped` and `TreeOptions.lines` (default `true`), `Registry::tree(..., striped:, lines:)`, JSON `tree.striped` / `tree.lines`, `TreeMetadata.striped` / `.lines` (sent only when `false`) | [FB-0193](feedback.md#fb-0193) | info: a spec or screenshot that measured tree rows finds 40 px instead of about 24 px, and the toggle of an expandable node is a framed +/- box (the arrow with `lines: false`); a node label no longer wraps; the selected tree row and the grid's cursor row have a straight 3 px bar and a thin frame (no slanted bar, no lower glow) |
| M71 | [Window title](#window-title): `WindowOptions.titleOverflow` (`"end"` default, `"start"`: a leading `…`, the end stays visible) and `titlePrefix` (never cut); a cut title shows the full title as its tooltip; `AppWindow.setTitle` also renames the window's accessible name | [FB-0194](feedback.md#fb-0194) | info: a spec that read the dialog's name after `setTitle` finds the new title instead of the opening one |
| M72 | [Empty-valued select filters](workspaces.md#integrated-grid-header-filters): a select option declared with the empty value is a real filter condition (`filters: {field: ""}`) in the header picker, the filter panel, `setFilters`, `#filter.<field>=` presets and saved filters; no filter shows an empty header control. A user filter on a hierarchy's parent field replaces its implicit root scope | [FB-0195](feedback.md#fb-0195) | info: a list with an empty-valued option no longer shows that option's label in the header without filtering; a spec that expected `setFilters({field: ""})` or a saved `""` to be ignored for such a select now sees the condition requested |
| M73 | [Form rows](workspaces.md#form-rows): a field's `row` and `rowWidth` (PHP `Field`, JSON `row`, `row_width`), `FieldMetadata.row`/`.rowWidth`, `ColumnMetadata.row`/`.rowWidth`: consecutive fields of one section share a row of the action forms and stack into one column where the form is narrower than `--blade-form-column-min` per share; the list's and the tree navigation's form window opens wide enough for the widest row. The singleton's details form without an update right now keeps a fixed section fixed | [FB-0196](feedback.md#fb-0196) | none (additive; a form without rows is unchanged) |
| M74 | [Menu commands](shell.md#menu-commands): `ApplicationDefinition` `menuCommands` (PHP `MenuCommand`, JSON `application.menu_commands`) put up to three emphasized commands in the menu row; their handler is an `app.commands` entry with `placement: "menu"` (`MenuCommand`, `MenuCommandContext`; the registry's type is `Registry<ClientCommand \| MenuCommand>`). [Long-lived windows](#long-lived-windows): `WindowOptions.maximizable`, `WindowOptions.id`, `AppWindow.maximized`/`maximize()`; the menu row's popups open above windows; Escape closes a modal window above a non-modal one | [FB-0199](feedback.md#fb-0199) | info: TypeScript code that reads `app.commands.get(…)` as a `ClientCommand` narrows by `placement`; a spec that measured the feature demo's menu row finds `Munkaasztal` after the navigation |
| M75 | [View guide](workspaces.md#view-guide): while a non-modal window is open (a [long-lived window](#long-lived-windows)), a view opened behind it does not open its guide by itself; the guide stays unseen and `Útmutató` shows it | [FB-0200](feedback.md#fb-0200) | info: no declaration or API change; a spec that opened a long-lived window and then expected a view's first guide finds none |
| M76 | [Modal windows](#modal-windows): a modal Suite window (`app.ui.window` by default, every framework record or action window, a project's own `new Window({modal: true})`) makes everything before it in the document `inert`, keeps Tab and Shift+Tab inside the topmost one and returns the focus to its opener on close; Escape closes the topmost focused modal window also without a non-modal one, but not while an open popup in it takes the key (`preventDefault`/stopped key, `:popover-open`, a focused `role="menu"`, an expanded `aria-haspopup` or combobox trigger). A Suite redraw asked for in the frame that destroys its view is dropped | [FB-0201](feedback.md#fb-0201) | info: a spec that tabbed from a modal window to the page behind it, or clicked through to an element before it, finds it inert; a popup inside a window that wants Escape to close the window as well must not mark itself open |
| M78 | [View availability](workspaces.md#view-availability): `available` (`Closure(Context): bool`) on `View`, `View::list`, `Registry::view`, `SqlResource::register`, JSON `view.available` / `views.<id>.available` (a binding name); false leaves the view out of that bootstrap | [FB-0204](feedback.md#fb-0204) | none: additive, no consumer change required |
| M79 | Bundled [Bootstrap Icons](icons.md) in every icon slot; framework/demo defaults migrated, record icon columns also accept `bi bi-…`, old `blade-icon` names alias the new catalog | [FB-0203](feedback.md#fb-0203) | info: no asset/configuration change; legacy icon values still display. A screenshot or glyph-class assertion follows the new defaults |
| M80 | [Action command captions](workspaces.md#action-command-label): optional PHP `Action::$commandLabel` / JSON `actions[].command_label` overrides a list command's caption, form window title and accessible name; uses the existing `icon` and i18n catalogue, leaving `update` cell/form saves unchanged | [FB-0206](feedback.md#fb-0206) | additive, no consumer change required |
| M82 | [Tenant-scoped calendars and overlay](calendar.md#tenant-scoped-calendars): `CalendarDefinition` `tenantScoped` (events per active tenant in the new nullable `blade_calendar_events.tenant_id`) and `overlay` (read-only consumer events in `events`, `readonly`/`tone` on the event); `occurrences()` takes an optional `$tenant` | [FB-0208](feedback.md#fb-0208) | additive, no consumer change required; a consumer that adopts `tenantScoped` runs `CalendarDefinition::install()` once to add the column |
| M83 | [Value tones and emphasized records](workspaces.md#value-tones): field `column.tones` (select option → `primary`, `secondary`, `success`, `warning`, `danger`), view `emphasis` (`{field, value, label?}` on `View::list`, `Registry::view`, `SqlResource::register`, JSON `view.emphasis`), attention `label` (`{count}` message), computed `select` fields; types `ValueTone`, `ColumnMetadata.tones`, `ListKindOptions.emphasis`, `attention.label` | [FB-0212](feedback.md#fb-0212) | additive, no consumer change required; if used: a project's denormalized state column or its interim tone presentation can be replaced |
| M84 | [Location bar](shell.md#location-bar): every page view shows a 32 px shell-owned bar below the menu row (menu path, a record page's source path and record title); a record view's `recordTitle` (JSON `views.<id>.record_title`) names the record; `ViewHost.setLocation(segments)` and `LocationSegment` set a page's own levels; the document title becomes `‹current› · ‹application title›` | [FB-0217](feedback.md#fb-0217) | no code change; the workspace is 32 px shorter, so specs that measure its height or count rendered grid rows at a fixed viewport may need 32 px more, and specs that assert `document.title` on a page see the new form; if used: declare `record_title`, call `host.setLocation` |
| M86 | [Card button to the page](workspaces.md#sub-views): with the parent view's `activate: 'page'` (or a map entry resolving to `page`) the card and tile sub-view button opens the child page filtered to the record like the activation, with `aria-description` "Megnyitás: ‹child title›" and the `bi-box-arrow-in-right` icon instead of `aria-haspopup="dialog"`; a list left through a `page` navigation shows the same record at the same offset with its cursor on Back ([activation](workspaces.md#activation)) | [FB-0219](feedback.md#fb-0219) | info: no declaration or API change; a spec that clicked the card button of a page-activated list and expected the window finds the child page; a spec that expected a list to open at the top after Back finds it where it was left |
| M88 | [Inner layout](#pagelayout-inner): a `PageRegion` with `inner` (a `rows` or `cols` branch) holds a frameless layout whose regions are ordinary page regions (lines with an 8 px handle); a tree of only `{inner}` is frameless as a whole; `resizable` on the last region of a branch draws the line before it; a dragged line keeps the declared size of the region after it too (also in list layouts); `--blade-record-text-min-height: 0px` now means 0 instead of 160 px. Replaces `PageLayoutOptions.frame` and `RecordDetailsOptions.longText: "reading"` of `3b7390c` (FB-0221), which are removed | [FB-0221](feedback.md#fb-0221), [FB-0222](feedback.md#fb-0222) | info: a layout whose last region declared `resizable` (which drew nothing) gains its line; `frame: "line"` becomes a tree of only `{inner}`, `longText: "reading"` is gone (the project styles its own text); a minimum set to `1px` to avoid the 160 px fallback can be `0px` |
| M89 | [Field subset and a media field alone in a section](#recorddetails-fields): `RecordDetailsOptions.fields` (a subset of the view's detail fields in the view's order; a derived media column follows its media field; a field the row lacks is not shown; an empty array, a non-string entry or an id that is not a detail field throws `TypeError`). In `RecordDetails` and `Adatok`, a section whose only shown field is a media field shows its heading and the media without a label row, also without `detailsWidth` ([media alone in a section](workspaces.md#details-media-alone)). Removes `RecordDetailsOptions.longText` (`"inline"`, `"card"`) of `1a3ee5f` (FB-0218), the CSS property `--blade-record-text-min-height` and the classes `.blade-record-texts`, `.blade-record-text`, `.blade-record-text__body` and `.blade-record-details--fill` | [FB-0218](feedback.md#fb-0218), [FB-0223](feedback.md#fb-0223) | if used: TypeScript rejects `longText: "card"` and the runtime ignores it, so remove it. The long text is inline below the groups and the details scroll as a whole. Project styles on the removed classes or property match nothing. A view copy with reduced `detailFields` can become `fields`. info: a section holding only a media field without `detailsWidth` loses its label row in `RecordDetails` and `Adatok`, so a spec that counted that `dt` finds none |
| M91 | [Application window height and long-text placement](workspaces.md#long-text-placement): `ApplicationDefinition` `windowMaxHeight` (JSON `application.window_max_height`, 320–4000 px, bootstrap `windowMaxHeight` only when declared) is the default cap of every fitted window instead of the fixed 800 px, which stays the fallback; `WindowOptions.maxHeight` still wins ([window sizing](workspaces.md#window-sizing)). Field `column.placement` (`"end"` default, `"row"`, `"group"`; `ColumnMetadata.placement`, `ColumnPlacement`) places a long text outside the sections at the end, as a row at its declaration place or as a group of its own in cards, `Adatok` and `RecordDetails` | [FB-0177](feedback.md#fb-0177), [FB-0225](feedback.md#fb-0225) | none (additive; without the declarations nothing changes); if used: an application with other screens declares its window height, a record with a long text between its sections declares its placement |
| M93 | [A region whose content is about to change](#busy-filled-region): `busy(id, on)` of `PageLayout`, `Tabs` and `Accordion` shows the loading indicator over a region's content (`aria-busy`, `A tartalom frissül…`) until the page ends it; mounting content keeps it | [FB-0232](feedback.md#fb-0232) | info: a page that drew its own overlay over a filled region can use the mark |
| M94 | [Empty own path](shell.md#location-bar-empty): `ViewHost.setLocation([], {from: "root"})` leaves the location bar empty (the 32 px line without levels, the `<nav>` `aria-hidden`, the document title the application title) instead of returning to the automatic path as under M90; `setLocation([])` without `from` still returns to it | [FB-0236](feedback.md#fb-0236) | **behaviour change**: a page that called `setLocation([], {from: "root"})` to get the menu path back calls `setLocation([])` instead; a spec that expected the menu path after that call sees an empty bar |
| M97 | [Tree icons](#tree-icons): `TreeOptions.icon` (one class pair for every node) and `iconField` (an icon column of the view, each node's own icon, named by its option as `aria-description`); tree navigation `Registry::tree(..., icon:, iconField:)`, JSON `view.tree.icon` / `icon_field`, `TreeMetadata.icon` / `iconField`. Without them nodes keep the folder glyph. Additive | [FB-0239](feedback.md#fb-0239) | info |
| M95 | [Location bar](shell.md#location-bar-top-level): a page whose automatic path is only its own top-level menu entry (no group, record, parent or `setLocation` levels) shows no bar while the full menu row marks that entry; collapsed into `Menü` it shows the entry as before. [Switched off](shell.md#location-bar-off): PHP `View::$locationBar` (`View(locationBar: false)`, `->with(locationBar: false)`), JSON `views.<id>.location_bar` / `resources.<name>.view.location_bar`, bootstrap `ViewDefinition.locationBar: false` | [FB-0237](feedback.md#fb-0237) | **behaviour change**: a spec that expected the bar, or measured the workspace 32 px lower, on a top-level ungrouped page at a width with the full menu row finds no bar there; if wanted: declare `location_bar: false` |
| M96 | [Back button](shell.md#location-bar-back) and [level icons](shell.md#location-bar-icons) of the location bar: PHP `ApplicationDefinition` `locationBack` / `locationIcons` (JSON `application.location_back` / `location_icons`, bootstrap `locationBack: true` / `locationIcons: true` only when on) and `View` `locationBack` / `locationIcons` (JSON `views.<id>.location_back` / `location_icons`, `resources.<name>.view.…`, `ViewDefinition.locationBack` / `locationIcons` only when declared). The Back button (`history.back()`, disabled on the tab's first 61ade entry, an in-app depth in `history.state.bladeDepth`) and a divider before the levels; off by default. The levels are text only by default | [FB-0238](feedback.md#fb-0238) | **behaviour change**: the levels lose their icons (the first level's section icon, `setLocation` segment icons, the `…` menu's entry icons); a spec that expected a level icon finds none; if wanted: `location_icons: true` for the application or the view. The Back button is additive (off unless declared) |
| M92 | [Inner region header](#pagelayout-inner-header): a region of an `inner` layout takes `header` and `count` (a frameless title row with a count badge over its content, a `region` landmark named by the title and `{count} elem`); `PageLayout.header(id, {label?, count?})` changes them | [FB-0227](feedback.md#fb-0227) | info: a tree with a `header` inside `inner`, which threw `TypeError`, now builds; a project-drawn heading row inside an inner region can become the declared header |
| M98 | [Conditional sections](workspaces.md#form-section-conditional): a field's `sectionVisibleWhen` (PHP `Field`, JSON `section_visible_when`, `FieldMetadata.sectionVisibleWhen`; the shape of `visibleWhen`, the same on every field of the section) shows a whole form section (header, frame, fields) only while the condition holds; meanwhile its fields are not validated and the server keeps their stored values (never stored empty). In accordion forms a hidden section is never the open one. The server now counts a boolean condition value (JSON `true`/`false`) as `"1"`/`"0"` for `visibleWhen` too, as the browser did | [FB-0240](feedback.md#fb-0240) | none (additive); info: an API call that sent `false` for a checkbox controlling a `visibleWhen` field with `in: ["0"]` now finds the field active (before, the server treated it as inactive and stored it empty while the form showed it); if used: a section whose fields all repeat one `visibleWhen` can declare `sectionVisibleWhen` instead, which also hides the header and keeps the stored values |
| M99 | [View guides](workspaces.md#view-guide) open automatically once per application path, user and view in the browser profile. The mark survives sign-out and is shared across tabs. | [FB-0243](feedback.md#fb-0243) | info: a spec that expects the guide to reopen after another sign-in needs a fresh browser context or a different account |
| M100 | [CommandBar header items](#commandbar-title): `title` (first, `badge`), `popup` (an `app.ui.menu` bound by the bar, `select {id, item}`, `menuLabel`) and `narrow: "icons"`; a popup menu on a bar's button no longer needs a project's own `app.dhx.Toolbar` | [FB-0248](feedback.md#fb-0248) | info: a header or composer built from `app.dhx.Toolbar` with `app.ui.menu` moves to `CommandBar` (`title`, `popup`, `menu`, Bootstrap icons) |
| M101 | [`app.viewport`](#viewport) and `viewport:change`; a [`PageLayout` `narrow` tree](#pagelayout-narrow) switches the arrangement at 768 px and moves the content, `variant {narrow}`, `PageLayout.narrow` | [FB-0250](feedback.md#fb-0250) | if used: a page that runs its own `matchMedia('(max-width: 767px)')` and rebuilds its `PageLayout` declares `narrow` instead (rebind `tabsOf` on `variant`); a page with a `SandboxFrame` or its own Layout listens to `viewport:change`. A page moving from `${id}.wide`/`.narrow` ids to one `id` starts with default sizes once |
| M102 | [`Attachments`](#attachments): chips over the page's uploader, `ids()`, `pending`, `remove` hook | [FB-0250](feedback.md#fb-0250) | if used: hand-built attachment chips or an attachment submenu move to it |
| M103 | [`app.ui.progress`](dialogs.md#progress), [`Steps`](#steps) and [`closable: false`](#window-closable) | [FB-0250](feedback.md#fb-0250) | if used: an un-closable window with `progressShow()`, a `dhx.List` stepper or an own `beforeunload` guard moves to them |
| M104 | [`app.live.watch`](#record-watch) (one record's `get`, query `{record}`); a singleton list's watch is authorized like `get` (tenant, channel, delegation, a resolver's `acl_id`) | [FB-0250](feedback.md#fb-0250) | if used: a timer that re-reads a read action becomes a record resource and a watch. info: a singleton watch whose resolver names another ACL object now needs that object's `get` right, as its `get` always did |
| M105 | [`app.server.request(…, {id, version})`](#request-version): a cacheable GET with the framework's failures and 401 handling | [FB-0250](feedback.md#fb-0250) | if used: `fetch(app.server.url(…))` moves to it |
| M106 | [`app.ui.copy`](#copy), [`app.ui.submitKeys`](#submit-keys); Ctrl/Cmd+Enter in a textarea of a framework form presses its primary button ([form keys](workspaces.md#form-submit-keys)); `app.ui.toast` escapes its text | [FB-0250](feedback.md#fb-0250) | if used: own clipboard calls and Ctrl/Cmd+Enter bindings move to them. info: a toast text with markup now shows the markup as text |
| M107 | From 768 px a non-modal, non-maximized window stays inside the workspace ([long-lived windows](#long-lived-windows)) | [FB-0250](feedback.md#fb-0250) | info: code that observes `.blade-navigation-row` to move its window can go; a spec that drags a window over the menu row finds it below |
| M108 | Public `--blade-panel-header` and `--blade-tab-row` in both families ([tokens](shell.md#panel-header-tokens)); the Blade chrome paints cell headers and the tab row through them | [FB-0250](feedback.md#fb-0250) | if used: skin CSS that paints `.dhx_layout-cell-header`, `.blade-tabs__row` or `.dhx_tabbar-tab-button` backgrounds sets the tokens instead |
| M109 | [`CommandBar`](#commandbar-title): the `role="toolbar"` element carries the bar's label (else its title), and a bar in a plain element is at least `--blade-command-bar-height` (48 px) | [FB-0251](feedback.md#fb-0251) | info: a spec that found a bar as `Eszköztár` or through its own wrapper finds it by its label; a project height around a bar can go |
| M110 | A session name may start with `__Host-` ([host cookie](authentication.md#host-cookie)): Secure, `Path=/` and no Domain, for the derived language, remember and OAuth cookies too; refused otherwise | [FB-0254](feedback.md#fb-0254) | if used: a consumer that changes its `sessionName` needs `cookiePath: '/'` and HTTPS, and signs every user out once |
| M111 | `admin.css` no longer carries the calendar vendor's third-party Inter faces, which the shell's CSP blocked | [FB-0255](feedback.md#fb-0255) | info: no visible change; a local workaround for those font requests can go |
| M112 | [`Attachments.add`](#attachments) draws the chip at once, before the uploader's first report | [FB-0256](feedback.md#fb-0256) | info: a project's own placeholder for a starting upload can go |
| M113 | Below 768 px a non-modal `app.ui.window` fills the workspace instead of the screen ([long-lived windows](#long-lived-windows)); a modal window stays full screen | [FB-0257](feedback.md#fb-0257) | info: a spec that expects a full-screen non-modal window on a phone finds it between the menu row and the lower bar; a project's own phone workaround can go |
| M114 | Tenant-scoped `SqlResource` statements stay on the row's tenant when a key repeats across tenants; [tenant singleton](tenancy.md#tenant-singleton) (`tenantSingleton`, JSON `tenant_singleton`) | [FB-0258](feedback.md#fb-0258) | if used: a tenant-scoped resource with related or delegation storage or shared rows needs a key unique across tenants (best a one-column primary key or unique index); if its table holds a repeated key, it answers 500 until that is fixed; a hand-written per-tenant `self` view can become a tenant singleton keyed by its tenant column. info: `HTTPS` empty or `OFF` now counts as plain HTTP for cookies |
| M115 | An open `app.ui.window` follows the 768 px breakpoint and keeps its content ([long-lived windows](#long-lived-windows)) | [FB-0260](feedback.md#fb-0260) | info: a project's own reopen on `viewport:change` can go |
| M116 | A MySQL deadlock (SQLSTATE 40001) in any action answers 409 instead of 500 ([tenant singleton](tenancy.md#tenant-singleton)) | [FB-0258](feedback.md#fb-0258) | info: a project's own 40001 handling can go |

Unchanged: the `?blade=1` action endpoint, the `__form` pseudo-action (its
field metadata is camelCase, M19), the
`#blade-config` `csrf` key, the `list` action's `data.items`,
`Registry::add(new Action(…))`, `Skin`, `[data-blade-skin]` and `--dhx-*`
variables, `packages/php/migrations` and the `Access\Schema` tables of an
application without tenancy (no schema step), no third-party PHP dependency.
Only the documented hooks ([sign-in CSS hooks](shell.md#sign-in-css-hooks),
`[data-blade-skin]`, `--dhx-*`) are supported; any other framework class or
markup may change without notice.

### Steps for a consumer session

<a id="changes"></a>

## Changes

| Date | Change | Feedback |
| --- | --- | --- | --- |
| 2026-11-20 | `Application.jobs` (`Jobs`, `JobReference`, `JobStatus`, `JobState`, `JobLogLine`, `JobStartOptions`), `components.JobView` (`JobViewOptions`, `JobViewEvents`, `JobView`), `AppEvents` `job:started`, `job:progress`, `job:done`, `CallOptions.token`, `ActionMetadata.job`; PHP `Action` `job` and `heartbeat`, `Blade\Jobs\JobSource`, `JobQueue`, `Job`, `Jobs` and the `__job` reads ([jobs](#jobs), [server side](workspaces.md#jobs)). Additive: actions without `job` and `TaskQueue` are unchanged; a consumer that declares a `job: true` action runs `JobQueue::install()` in its setup. | [FB-0253](feedback.md#fb-0253) |
| 2026-11-20 | `Snapshot.notice` (`{text, tone}`): a list answer's view-level notice, shown above the rows and kept by the live channel's `update` frame; PHP `ProviderResource`, `ListProvider`, `ListQuery` and the `ListReader` interface of `Action::$listSource` (formerly `?ListSource`), [provider lists](workspaces.md#provider-lists). Additive: `ListSource` implements `ListReader`, and SQL lists read, validate and answer as before. | [FB-0252](feedback.md#fb-0252) |
| 2026-11-20 | `Application.viewport` (`Viewport`), `AppEvents["viewport:change"]`; `PageLayoutOptions.narrow`, `PageLayoutEvents.variant`, `PageLayout.narrow` (M101). Additive. | [FB-0250](feedback.md#fb-0250) |
| 2026-11-20 | New components `Attachments` and `Steps` (types `AttachmentItem`, `AttachmentsOptions`, `AttachmentsEvents`, `Attachments`, `StepDefinition`, `StepState`, `StepsOptions`, `Steps`); `Ui.progress` (`ProgressOptions`, `ProgressDialog`), `WindowOptions.closable` (M102, M103). Additive. | [FB-0250](feedback.md#fb-0250) |
| 2026-11-20 | `Live.watch` (`RecordLiveHandlers`; wire query `{record}`, protocol 2); `CallOptions.version` for `Server.request`; `Ui.copy`, `Ui.submitKeys` (`SubmitKeysOptions`) (M104–M106). `LiveHandlers.denied` is documented without 429, as it always behaved. A singleton watch is authorized like `get`. `Ui.toast` escapes its text. | [FB-0250](feedback.md#fb-0250) |
| 2026-11-20 | Non-modal windows stay inside the workspace; `--blade-panel-header`, `--blade-tab-row` (M107, M108). | [FB-0250](feedback.md#fb-0250) |
| 2026-11-20 | `CommandBar` names its `role="toolbar"` element; `--blade-command-bar-height` (M109). No API change. | [FB-0251](feedback.md#fb-0251) |
| 2026-11-19 | `TreeOptions.icon`, `TreeOptions.iconField`, `TreeMetadata.icon`, `TreeMetadata.iconField`; PHP `Registry::tree` `icon` and `iconField`, JSON `view.tree.icon` and `icon_field`: tree nodes show a catalog icon, the same for every node or each record's value of an icon column (M97). Additive. | [FB-0239](feedback.md#fb-0239) |
| 2026-11-19 | A component destroyed after the Layout that holds it no longer detaches the dead cell (`TypeError` from Suite); it is released silently. No API change. | [FB-0228](feedback.md#fb-0228) |
| 2026-11-15 | New component `TextDiff` (types `TextDiffOptions`, `TextDiffMode`, `TextDiffSummary`, `TextDiff`; `Components.TextDiff`): unified or side-by-side line difference with word highlights, folds, `+N −M` summary and change navigation (M81). Additive. | [FB-0207](feedback.md#fb-0207) |
| 2026-11-13 | Bootstrap Icons 1.13.2 is embedded in `admin.css`; all framework/demo icon defaults migrate to `bi bi-…`, record icon fields accept both Bootstrap and legacy Suite class pairs, and `blade-icon` names remain aliases (M79). The viewer repeat button uses the native pressed state. | [FB-0203](feedback.md#fb-0203) |
| 2026-11-12 | Section groups in cards/details have equal heights per row and top-aligned content. Project CSS properties `--blade-record-group-min-width` and `--blade-record-group-columns` configure inner column widths and ratios; a record content width below 492 px stacks the groups using a container query. | [FB-0186](feedback.md#fb-0186) |
| 2026-10-29 | `ServerFailure.status` is 0 only for a network failure or a 2xx answer without JSON; an error answer without JSON keeps its HTTP status. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `preferences.scope(name)` keys are `blade-ui:1:[path, user, "scope:<name>"]`; the name must contain a dot. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `app.components` is an empty frozen object until P3. Superseded in P3 (2026-10-29): it holds the ten component classes. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `ViewKindProvider::metadata()` returns `{actions, options}` or null instead of the options alone; shared helpers in `ViewMetadata`; generic action shape `{name,label,icon,write,bulk,get,confirm,fields,…}`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Signed-in bootstrap key `modules` (page-relative, versioned paths; keyed by file since 2026-10-30), present only when modules are declared; stylesheets are only `<link>`s after `admin.css` and skins. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | JSON `views.<id>` accepts project (dotted) kinds only; a duplicate id inside JSON fails like other JSON duplicates (the PHP replace rule is unchanged). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | A `subview()` child view of the same resource is normalised to a hierarchy of the parent view. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Added `View::with()`, `Registry::provider()`, `Registry::embedded()`, `Registry::checkViews()`, `ApplicationDefinition::versioned()`; a broken `view:` target throws at definition and bootstrap; `View` requires a non-empty title and id-shaped resource and action names for every builder. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Component lifecycle: `mount(target)` once (element, Layout cell, `AppWindow` or `ViewHost`; a second mount or one after `destroy()` throws); `destroy()` idempotent; a closing window/host or the `signal` destroys; events only while mounted. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `Calendar`: one per page (Scheduler Standard), a second `new Calendar` throws; Calendar has no events; `DiagramEditor` `saved` fires after a content save only. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `uploads.open` throws `TypeError` on malformed options; `reopen` does nothing before the first `open`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `RecordForm.submit()` blurs the focused input first; a client validation failure rejects with a 400 `ServerFailure` with field errors, a declined confirmation with `AbortError`; `RecordDetails.show()` rejects after the error dialog; `CommandBar` ids `[A-Za-z0-9_.:-]+`, unique, `blade-command-menu` reserved; `ListView` rejects a non-list view or `compact` without `scope`, `saved` also fires for inline edits; `view:<id>` targets need `get` in the row's `_actions` when present. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `MediaSource` gains `{blob}`; `MediaPlayerOptions` gains `name`, `info`, `toolbar`; `MediaPlayer.focus()`; `position` also fires on pause; a non-media MIME throws `TypeError`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `SandboxFrameOptions.title`; code runs as the body of an async function; a second iframe `load` (navigation, reload, DOM move) and a timeout remove the frame; `post()` throws before `ready`; `load()` rejects with `Error{code}` or `AbortError`; envelope `id` 1–64, `type` ≤ 128, error text ≤ 1000 characters; `credentialless`; the sandbox document URL is resolved on the first `load()`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `FilePicker.pick` throws `TypeError` synchronously for malformed options; `FileManager` `opened` fires for every file the viewer or text editor shows (also previous/next); `FileManager.destroy()` aborts pending reads, sent writes complete. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Field types: new field option `editor` (dotted name; not for secret, password, file or media fields) in `ColumnMetadata.editor`; a field-type column is edited in the edit window, never the native Grid editor; filters keep the storage type's input; a presentation wins over a field type's `display`. Only `image` moved onto the presentations registry (`icon` stays internal). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Commands: every declared command is a list toolbar item after the view's actions, in declaration order (in the `Műveletek` menu when narrow); there is no record context menu. `placement: "toolbar"` acts on the view, `"record"` on the toolbar's cursor record like the built-in record actions (default enabled with a cursor record and at most one mark; an own `enabled` may accept the marks); `"both"` is accepted as `"record"`. `ListOptions.commands` is a server declaration (≤ 20 dotted names); the built-in Adatok is the `details` record command (toolbar id `blade-command:details`). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Commands while a sub-view record holds the toolbar: a command the sub-view's list has too (built-in `details`, a name its view declares; every command of a `shared` sub-view) gets the sub-view's context (`view`, `row` = its cursor record, `rows` = its marks); any other command stays on the list's own cursor record and marks. Previously every command saw the delegated record only for a `shared` sub-view and never saw marks while delegated. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | [Cache keys](#cache-keys) of every shell asset (`admin.js`, `admin.css`, skin stylesheets, `modules`, `stylesheets`, AuthHandler files) are `?v=<base36 mtime>-<base36 size>` of the served file inside the document root; own `?…` keys stay; fallback `?v=<version>` (61ade's files: the package build's key first); the hand-bumped `?v=32` is gone. New optional `ApplicationDefinition::$documentRoot` / JSON `application.document_root` (default `DOCUMENT_ROOT`); bootstrap `modules` carry these keys. `versioned()` remains as the fallback rule. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Activation map on a media field (`file` or `column.media`): the client keys the row by the MIME class of `_media[field]` (`image`, `video`, `audio`, …) instead of the file id; no or a hidden file takes `*`. Server validation unchanged. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A 401 of `server.*` (and the live channel's session end) signs the page out: a reload to the sign-in page, or over open input (`ViewInstance.editing()`) the "A munkamenet lejárt" modal first ([ended session](shell.md#ended-session)). The rejection itself is unchanged. | [FB-0086](feedback.md#fb-0086) |
| 2026-10-30 | The [recipe](#typescript-recipe) names the feature demo (`examples/demo-app/frontend`, built to `public/app/demo.js`) as its worked example; no API change. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: `Registry::kind()` must be called before the first view of that kind (a later call throws); in code since 949af2a. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: the final `GenericViewKind` option limits of G1 decision 7: a top-level map, JSON-safe values nested at most 32 levels, at most 64 KiB encoded (949af2a). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: `Calendar`, `DiagramEditor` and `FileManager` accept a held `ViewDefinition` of any kind with the expected `resource`, `actions` and options shape, not only their own kind (82adbd3, c68e390). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: `ListView` `activate` reports `details` also for the `#` cell (8aeeed3). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Guide completed (toolkit P5): [event catalog](#event-catalog), [Layout recipe and pitfalls](#layout-recipe), [naming conventions](#conventions), [limits](#limits) with the owner decisions of G4 (no `ListView` `marked` event, no `MediaPlayer` playback-state event, no audio class in the type filter and picker, marks never persisted), [worked examples](#worked-examples) from the feature demo, the real verification list; the recipe's `@dhtmlx/suite` advice is a devDependency. No API change. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | One lifecycle helper (`components/Lifecycle.ts`) for every component: `SandboxFrame` follows a closing window or view host, refuses a second mount, detaches its cell and emits only while mounted (`sandbox:error` always); `MediaPlayer` detaches its cell before destructing; an already closed host destroys; `on` with a non-function and a `signal` that is not an `AbortSignal` throw `TypeError`; the list components throw on a second mount or a mount after `destroy()`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A view id that is not offered throws `Error`, a view of the wrong kind or shape `TypeError`, also for `ListView` and `RecordDetails` (before: `TypeError`). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `RecordForm` `saved` is `{action, result}`; new `SandboxErrorCode` and `SandboxError` (the `load()` rejection). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `register` of a taken name (a built-in one too, without `replace`) throws the duplicate `Error` before the project-prefix `TypeError`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `sandbox.html` runs code only when `self.origin === "null"`; a frame document reports only the first failure its messages cause; project messages also arrive before `ready` and after an error. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | The shell CSP adds `object-src 'none'`; the demo's `signage_playlist.scene` also needs `files.content_stream` on the scene file's mount (else 404). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A `load()` refused for size no longer rejects a still pending earlier load (that frame can still become ready); `navigate` writes only `#view=<id>[&record=…]` (filters are applied, not written). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `app.views` → `app.kinds`; one type-name scheme (instance = class, `<Class>Options`, `<Class>Events`, `<Kind>KindOptions`). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `apiVersion` is type-only in `admin.d.ts` (`ApiVersion`); the value is `app.apiVersion`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | One `ColumnMetadata` spelling (camelCase `imageBase`, `altOf`, `mediaOf`); `ListViewKind` normalises declared columns. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `{signal}` options (`SignalOptions`) on `events.on`, `live.subscribe`, `theme.onChange`, `server.form` and component `on`; positional signals removed. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `CommandItem` = `CommandButton \| CommandSpacer` (spacers need no id); Escape closes the `Műveletek` menu and focuses its toggle. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `FileManager.editing()` and `Calendar.editing()`; the built-in kinds report them. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Sandbox bootstrap inline in `sandbox.html`, allowed by `script-src 'sha256-…' blob:`; `dist/sandbox.js` removed. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Event naming rule ([conventions](#conventions)): `RecordForm` `cancelled`, `FileManager` `opened` `{id, mimeType}`; browser metadata camelCase (files/calendar options, `UploadPolicy`, field `file`/`validation`); `FilesKindOptions.upload` is `{policy}` only (the upload rules were sent twice). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Sign-in customization: `ApplicationDefinition` `logo` (`Logo(image, darkImage, label, placement)`), `signInStylesheets`, `signIn` (`SignIn(notice, links)`), `signInModules` with the restricted `SignInApplication`/`SignInModule` (`src/api/sign-in.ts`, in `admin.d.ts`); JSON `application.logo`, `sign_in_stylesheets`, `sign_in`, `sign_in_modules`; bootstrap `logo`, `signIn`, `signInModules`; `data-blade-page` on `<html>`; supported CSS hooks ([sign-in customization](shell.md#sign-in-branding)). | [FB-0087](feedback.md#fb-0087) |
| 2026-10-30 | `#feature=` alias removed (M24). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Command `placement: "both"` removed (M25). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `__watch` only with `values.subscriptions` (M26). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | The `list` offset API removed; no parameters give the first cursor window (M27). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Tenancy `active` column dropped by migration 0003; tenancy fails closed until it has run (M28). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `MessageDialog` `alert`/`confirm` compatibility wrappers removed (M29). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A duplicate view id throws; `Registry::updateView()` and `View::list()` added; [G1 decision 1](#decisions-at-gate-g1) and O3's replacement rule are superseded (M30). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | File `list` answer without `truncated` (M31); the internal `src/Workspace.ts` re-export removed. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | The 61ade product logo ("blade", [brand](brand.md)) is the default logo: inline in `admin.js`, bootstrap `logo` without `image`; `Logo::$image` optional (`new Logo(placement: …)` keeps the product logo), `Logo::none()` / JSON `"logo": false` opts out; accessible name `blade`. | [FB-0088](feedback.md#fb-0088) |
| 2026-10-30 | Trademark screen once per browser window or tab (`sessionStorage` gate, inline head script allowed by CSP hash): page-turning tiles, letters bouncing in, blade glint and spark on black, then a fade into the application; no option to skip it (M33). | [FB-0089](feedback.md#fb-0089) |
| 2026-10-30 | Product logo redrawn to the owner's source drawing: the first letters read 6 and 1 (only they carry the teal), `ade` ink, heavier stems, tighter spacing, taller tile 1 with its arc; viewBox `-19 -46 1370 395`. | [FB-0090](feedback.md#fb-0090) |
| 2026-10-30 | Product logo redrawn as `b1ade` to the owner's new drawing: rounded-rectangle letters, the `b` and `1` in one blue gradient, `ade` ink, tiles recoloured; viewBox `-19 -46 1795 395`. The trademark screen adds the blue dot and `com`, silver ink, glow, floor light and reflection. | [FB-0091](feedback.md#fb-0091) |
| 2026-10-31 | `Application.mediaTypes` (`Registry<MediaType>`: `mime`, `label`, `icon`; built-ins `image`, `video`, `audio`) presents files by MIME type in media slots, the `type` part, the file picker and the file manager; the 61ade glyphs `blade-icon--audio` (the built-in audio icon, before the generic file icon) and `blade-icon--animation`. An activation map on a media field matches an exact MIME type entry before the class. Additive. | [FB-0102](feedback.md#fb-0102) |
| 2026-10-31 | `BuiltinFieldType` gains `date` (`YYYY-MM-DD`): native DatePicker form item and Grid `datePicker` cell editor. | [FB-0104](feedback.md#fb-0104) |
| 2026-10-31 | `Components.PageLayout` (`PageLayoutOptions`, `PageRegion`); `ListViewOptions.dragSource`, `panel`, `showId`; `ListKindOptions.order`, `drop`; `RecordFormOptions.cancel`, `RecordForm.setValues()`; `RecordDetailsOptions.showId`; `ValidationRules.notBeforeField`, `notAfterField`. `RecordForm` submits under the action's label without a `submitLabel` and shows no toast for a read-only action. Additive (M35). | [FB-0108](feedback.md#fb-0108) |
| 2026-10-31 | `ViewDefinition.guide`, `ListKindOptions.tree` (`TreeMetadata`), `FieldMetadata.visibleWhen`; `Registry::tree()`, `View`/builder `guide`, `Field` `visibleWhen`; `RecordForm` fits an `AppWindow` it is mounted in. Additive. | [FB-0107](feedback.md#fb-0107) |
| 2026-10-31 | View guides open once per sign-in session (`sessionStorage`, cleared on the signed-out page); the `Útmutató` control is in the top row (in `Menü` below 768 px); `ApplicationDefinition` `guides` / JSON `application.guides`; `SqlResource::register()` `guide`. Additive (M36). | [FB-0109](feedback.md#fb-0109) |
| 2026-10-31 | `CommandSeparator` (`{type: "separator"}`) and `CommandButton.iconOnly` (icon in the bar, the label as tooltip, accessible name and collapsed-menu text); `MediaPlayerEvents` `play` and `pause`; 61ade transport glyphs `blade-icon--play`, `--pause`, `--skip-start`, `--skip-previous`, `--skip-next`, `--rewind`, `--fast-forward`, `--repeat`, `--repeat-off`. Additive. | [FB-0111](feedback.md#fb-0111) |
| 2026-11-02 | `MediaPlayerOptions.visualizer: "spectrum"` (optional, audio only); `MediaPlayer.loop()`, `setLoop(boolean)` and `loop {loop}` event synchronize repeat controls; `toolbarPosition` (`top` / `bottom`) defaults to top. Existing `autoplay` remains a native request subject to browser policy. Additive. | [FB-0119](feedback.md#fb-0119) |
| 2026-11-02 | `SandboxFrameOptions.autoplay` delegates autoplay to the opaque frame, default false; no sandbox flags or isolation permissions added. Additive. | [FB-0120](feedback.md#fb-0120) |
| 2026-11-02 | `ListView.target()` and `target` (`ListTarget`: `{view, row, rows}`) expose the active context, including selected previews and foremost child windows, marks and selected-record live changes. Existing `select`, `selected()` and command-specific delegation keep their meaning. Additive. | [FB-0125](feedback.md#fb-0125) |
| 2026-11-02 | A table's or card's sub-view previews inside a window live in that window's popup wrapper (its stacking context, the containing block of the fixed layer) instead of the page body, so they show over their slots in the window and stay below its menus, dialogs and later windows. No API change. | — |
| 2026-11-09 | `Components.Tabs` (`TabsOptions`, `TabDefinition`, `TabsEvents`, event `change`); `PageRegion.tabs` (a `tabs` branch; region ids `blade-…` are reserved), `PageLayoutOptions.guard`, `PageLayout.tabsOf()`. `RecordForm.destroy()` destroys its Suite Form one redraw later. Additive (M38). | [FB-0145](feedback.md#fb-0145) |
| 2026-11-09 | `Components.Accordion` (`AccordionOptions`, `AccordionSection`, `AccordionEvents`, event `toggle`); `PageRegion.accordion`, `multiple`, `open` (an `accordion` branch), `PageLayout.accordionOf()`. Additive (M39). | [FB-0148](feedback.md#fb-0148) |
| 2026-11-09 | `ViewDefinition.menu` (`false` only); `Application.navigate` returns `false` for a `menu: false` view. PHP `View::$menu`, `menu` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.menu`. Additive (M40). | [FB-0149](feedback.md#fb-0149) |
| 2026-11-09 | `CommandItem` adds `CommandToggle`, `CommandSelect`, `CommandSegmented`, `CommandRange`, `CommandGroup` (`CommandOption`); `CommandBarOptions.label`, `.placement`; `CommandBar.update(id, CommandChanges)`, `CommandBar.value(id)`; `CommandBarEvents.toggle`, `.change`. Additive; a project `switch` over every `CommandItem` type gets the new members. | [FB-0150](feedback.md#fb-0150) |
| 2026-11-09 | `Components.SettingsForm` (`SettingsFormOptions`, `SettingsField`, `SettingsFieldType`, `SettingsGroup`, `SettingsChip`, `SettingsFormEvents`: `change`, `submit`). Additive. | [FB-0151](feedback.md#fb-0151) |
| 2026-11-09 | `ListKindOptions.sort` (`{field, direction}`, the first sort). PHP `sort` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.sort`. A `textarea` field shows at most 4 lines on a card. Additive (M41). | [FB-0152](feedback.md#fb-0152) |
| 2026-11-09 | `PageLayout.collapse(id)`, `expand(id)`, `isCollapsed(id)`, `PageLayoutEvents` (`collapse {id, collapsed}`; `PageLayout` extends `Component<PageLayoutEvents>`). A public component given to `attach` of `PageLayout`, `Tabs` or `Accordion` is mounted there, so its events arrive. Additive (M42). | [FB-0153](feedback.md#fb-0153) |
| 2026-11-09 | `CommandItem` adds `CommandMenu` (`type: "menu"`, `items`: 1–12 `CommandButton`s and `CommandSeparator`s); its entries report `click {id}` and take `update`. Additive (M43). | [FB-0154](feedback.md#fb-0154) |
| 2026-11-09 | `Ui.attach(target, content, {signal})`: a plain element, Suite widget or component into any Suite Layout cell, edge to edge, released by the signal. Additive (M45). | [FB-0157](feedback.md#fb-0157) |
| 2026-11-10 | `Components.Tree` (`TreeOptions`, `TreeEvents`: `select`, `activate`; `Tree.selected()`, `select(id)`, `refresh(id?)`). Additive (M46). | [FB-0158](feedback.md#fb-0158) |
| 2026-11-10 | `ClientCommand.type` (`"button"` \| `"toggle"`), `.pressed`, `.toggle(ToggleContext)`; `ClientCommand.run` is optional (required unless `type: "toggle"`); `ToggleContext`; `ListViewEvents.toggle`. Additive (M47). | [FB-0159](feedback.md#fb-0159) |
| 2026-11-10 | `ViewDefinition.attention` (`{filters, tone}`). PHP `View::$attention`, `attention` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.attention`. Additive (M48). | [FB-0160](feedback.md#fb-0160) |
| 2026-11-11 | Destroy + mount of a component into the same Layout cell, tab, region, window or view host in one task shows the new component (it was empty until the next frame's work-around); a cell that showed markup (`attachHTML`, an element) takes a widget or component. No API change. | [FB-0161](feedback.md#fb-0161) |
| 2026-11-11 | `ListViewOptions.createDefaults` (start values of the built-in create form), `ListViewOptions.preferencesKey` (the preference key instead of the view id, shared across scopes); `ClientCommand.pinned` (kept in the toolbar when the others collapse); PHP/JSON field `column.details: false` (left out of `detailFields`: `RecordDetails`, `Adatok`, cards). Additive (M49). | [FB-0162](feedback.md#fb-0162)–[FB-0165](feedback.md#fb-0165) |
| 2026-11-11 | List protocol `scope: {field, value}` (a scoped list, a sub-view, a tree navigation's list and `Tree` levels send it instead of a filter; exact match); PHP `Field::$scopeOnly`, JSON `scope_only`: a scope key only, in no columns, `detailFields`, `filters` or `sortable` metadata, refused in `filters`, `sort`, view columns, first sort, attention and search; `SqlResource::register` leaves it out of the default columns. M50. | [FB-0166](feedback.md#fb-0166) |
| 2026-11-11 | PHP/JSON `file` field option `{upload: 'resource.action', get?: 'resource.action', accept}`: a file the project stores itself. The form control (native dialog, paste, drop, background upload, preview) uploads to the project's upload action, which returns `['id' => token]`; the executor checks the detected type and records an upload claim (actor, session, tenant, upload action, TTL); the record save accepts a new token only for such a claim and removes it after the commit; the edit form shows the stored file through the GET action. A form field only (no column, details, filter, sort or scope). `StoredFileFieldConfig`, `Registry::storedFileFields()`, `Registry::checkFileFields()`. M51. | [FB-0167](feedback.md#fb-0167) |
| 2026-11-11 | `TreeOptions.expand` (levels opened while no expansion is stored, 0–10), `TreeOptions.expandControl`; `Tree.expandAll()` (→ `TreeExpansion`: `complete`, `nodes`, `reason`), `Tree.collapseAll()`; key `*`. The stored expansion is written only after the user changed it. Additive (M52). | [FB-0168](feedback.md#fb-0168) |
| 2026-11-11 | `ListKindOptions.modes`/`cardColumns`, `ListViewOptions.modes`/`cardColumns`; PHP `modes` and `cardColumns` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.modes`, `view.card_columns`. The offered presentations (one hides the `Nézet` menu; a kept choice outside them is ignored, not overwritten) and at most this many card columns (1: one card per row). Additive (M53). | [FB-0169](feedback.md#fb-0169) |
| 2026-11-11 | `Tree`: the remembered selection and `initial` apply at the end of the start only when nothing was selected meanwhile; a selection made while the roots, the `expand` levels or a restored expansion load stays and is stored, with no second `select`. | [FB-0170](feedback.md#fb-0170) |
| 2026-11-11 | `RecordFormOptions.readOnly` (host-fixed input fields, still submitted); `FieldMetadata.readOnly` (`__form`: an action's `display` field or a readable field the actor may not write, shown and never sent); PHP `Action::$display`, `SqlResource` `createOnly`, JSON `storage.create_only` (M54). | [FB-0171](feedback.md#fb-0171) |
| 2026-11-11 | `FieldMetadata.section`, `ColumnMetadata.section`; PHP `Field::$section`, JSON field `section`: collapsible form sections (M55). | [FB-0172](feedback.md#fb-0172) |
| 2026-11-11 | PHP `SqlResource` `counts`, JSON `storage.counts`: count fields (number fields filled from the counted resource's ACL-scoped list count; left out when they cannot be counted). No browser type change (M56). | [FB-0173](feedback.md#fb-0173) |
| 2026-11-11 | PHP `SqlResource` `sharedTenant`/`sharedRoles`, JSON `storage.shared_tenant`/`shared_roles`: shared rows of a tenant-scoped resource, read by every tenant beside its own (`_shared: true`), written only without a tenant by a declared role (M57). No browser change: `_actions` disables the commands. | [FB-0175](feedback.md#fb-0175) |
| 2026-11-11 | PHP `Field` `sectionCollapsible`, JSON field `section_collapsible`, `FieldMetadata.sectionCollapsible`, `ColumnMetadata.sectionCollapsible`, `ColumnMetadata.cardLines` (field `column.cardLines`/`card_lines`), `WindowOptions.maxHeight`, `CommandButton.pinned`; form sections are framed panels, cards and details group by section, a fitted window stops at 800 px with a sticky action row, the Tree control is two icon buttons (M58). Additive, except the 800 px default cap. | [FB-0177](feedback.md#fb-0177) |
| 2026-11-11 | PHP `Action::$formSections` (`Action::FORM_SECTIONS`), `SqlResource::register` `formSections`, JSON `operations.form_sections` and an action's `form_sections`; `FormDescription.formSections`, type `FormSections`: accordion form sections with the `Accordion` component's header and a window size that does not change when a section opens (M59). Additive. | [FB-0178](feedback.md#fb-0178) |
| 2026-11-12 | `AppWindow.fit()` keeps the size of a window that does not fit (`fit: false`, below 768 px); a `RecordForm` or `SettingsForm` in it no longer resizes it (M60). Behaviour fix. | [FB-0178](feedback.md#fb-0178) |
| 2026-11-12 | PHP `Action::$flushSections`, `SqlResource::register` `flushSections`, JSON `flush_sections`; `FormDescription.flushSections`: accordion form sections edge to edge of the form; the framed stack's margin is an even 20 px (M61). Additive. | [FB-0178](feedback.md#fb-0178) |
| 2026-11-12 | PHP `SqlResource` `delegation`, `Delegation`/`DelegationLink`/`DelegationVia`, JSON `storage.delegation`, ACL scope `delegated`: rows reached through consumer-owned relationship tables, read links for reads and write links for writes (M62). No browser change: `_actions` and the forms follow the decision. | [FB-0180](feedback.md#fb-0180) |
| 2026-11-12 | PHP `Field` `sectionFill`, JSON `section_fill`, `FieldMetadata.sectionFill`: a textarea or file field that is its section's whole content, named by the header; in an accordion form the open section is the text area or the drop area (M63). Additive. | [FB-0181](feedback.md#fb-0181) |
| 2026-11-12 | PHP and JSON `file.multiple` of a stored file field, `StoredFileFieldConfig.multiple`: up to 20 files as a comma-joined list, each new token claimed with the record; the form shows the uploader's zone and queue at a fixed height (M64). Additive. | [FB-0181](feedback.md#fb-0181) |
| 2026-11-12 | `ListView.activate.preventDefault()` synchronously skips default activation, including the `#` cell; existing listeners and uncancelled dispatch stay unchanged. | [FB-0184](feedback.md#fb-0184) |
| 2026-11-12 | Loading and empty states: lists, `RecordDetails` and `RecordForm` show a delayed loading indicator with `aria-busy`; lists and regions show an empty or unmatched result or a failed load as a blank surface with a centred picture and text; `ListViewOptions.emptyText`; `PageLayout`, `Tabs` and `Accordion` `placeholder(id, {text, busy})` (`RegionPlaceholder`) for a region without content, which shows a default text (M65). Additive. | [FB-0185](feedback.md#fb-0185) |
| 2026-11-12 | Fixed accordion form sections keep their legend stationary while their fields scroll in a constrained form (M67). No configuration change. | [FB-0188](feedback.md#fb-0188) |
| 2026-11-12 | The Tree's expand control is one toggle icon button on the right of a command row with the list's shadow, `TreeOptions.expandControl` also `{placement}`; a `CommandBar` mounted above content casts that shadow; a pinned item keeps its side in the collapsed bar; tree navigation's toolbar collapses into `Műveletek`; an idle region status no longer overflows its cell (M69). Additive. | [FB-0191](feedback.md#fb-0191) |
| 2026-11-12 | Tree rows as high as grid rows (40 px, one line); `TreeOptions.striped` / `lines` (default on), the same for tree navigation (`Registry::tree` named arguments, JSON `tree.striped` / `tree.lines`) (M70). Additive; the row height changes for every tree. | [FB-0193](feedback.md#fb-0193) |
| 2026-11-12 | `WindowOptions.titleOverflow` (`"end"` default, `"start"`) and `titlePrefix`: a long window title is cut at its start with the prefix kept, the full title as tooltip and accessible name; `setTitle` updates the accessible name (M71). Additive. | [FB-0194](feedback.md#fb-0194) |
| 2026-11-13 | Empty-valued select filters: an option declared with the empty value is a filter condition (`filters: {field: ""}`) in header filters, the filter panel, `setFilters`, presets and saved filters; no filter shows an empty header control; a user filter on a hierarchy's parent field replaces the implicit root scope (M72). Behaviour fix. | [FB-0195](feedback.md#fb-0195) |
| 2026-11-13 | PHP `Field` `row`, `rowWidth`, JSON `row`, `row_width`; `FieldMetadata.row`/`.rowWidth`, `ColumnMetadata.row`/`.rowWidth`; CSS `--blade-form-column-min`: form rows of several columns that stack where the form is narrow; the list's form window opens as wide as its widest row (M73). Additive. | [FB-0196](feedback.md#fb-0196) |
| 2026-11-13 | PHP `MenuCommand` and `ApplicationDefinition` `menuCommands`, JSON `application.menu_commands`, client `MenuCommand`/`MenuCommandContext` (`placement: "menu"`): application commands in the menu row on every view, emphasized, with a server-side `visible` and an optional view's attention count; `WindowOptions.maximizable` and `id`, `AppWindow.maximized`/`maximize()`: a maximize/restore button and a remembered box; long-lived non-modal windows documented; the row's popups above windows; Escape closes a modal window above a non-modal one (M74). Additive, except the registry type. | [FB-0199](feedback.md#fb-0199) |
| 2026-11-13 | Modal windows follow the APG dialog pattern: the page before the topmost modal window is `inert`, Tab and Shift+Tab cycle inside it, the focus returns to its opener; Escape closes it the same with or without non-modal windows and leaves an open popup inside it the first press; `WindowEscape.ts` became `ModalWindows.ts`. A Suite redraw of a destroyed view is dropped (`SuiteRedraw.ts`) (M76). | [FB-0201](feedback.md#fb-0201) |
| 2026-11-13 | `Ui.menu` and the `PopupMenu*` types: a popup menu with group headings, checked entries, details and scrolling, opened from any button with the APG menu-button keys; Escape closes only the menu, also in a modal window (M77). Additive. | [FB-0202](feedback.md#fb-0202) |
| 2026-11-13 | PHP `View::$available` (`Closure(Context): bool`) and `available` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.available`, `views.<id>.available` (binding names): a view offered only while the closure allows it for the bootstrap's actor and tenant. Additive (M78). | [FB-0204](feedback.md#fb-0204) |
| 2026-11-16 | `ValueTone`, `ColumnMetadata.tones`, `ListKindOptions.emphasis`, `ViewDefinition.attention.label`; PHP field `column.tones`, `emphasis` parameters of `View::list`, `Registry::view`, `SqlResource::register`, attention `label`, computed `select` fields, public `Registry::filterable`; JSON `column.tones`, `view.emphasis`, `view.attention.label`. Additive (M83). | [FB-0212](feedback.md#fb-0212) |
| 2026-11-18 | PHP/JSON field `column.detailsWidth` / `column.details_width` (media fields, 160–800), `ColumnMetadata.detailsWidth`, `RecordDetailsOptions.longText` (`"inline"` default, `"card"`), CSS property `--blade-record-text-min-height`, the details element's `data-blade-view`; the `Adatok` window widens for a sized image (M85). Additive. `longText` removed again by M89. | [FB-0218](feedback.md#fb-0218) |
| 2026-11-18 | PHP `View::$location`, JSON `views.<id>.location` (`"group"`, record views only), `ViewDefinition.location`: the location bar starts at the menu group without the source view's entry (M87). Additive. Removed again by M90. | [FB-0220](feedback.md#fb-0220) |
| 2026-11-18 | `PageRegion.inner` (a region's frameless inner layout of ordinary page regions; a tree of only `{inner}` is frameless as a whole); `resizable` on a branch's last region draws the line before it; both regions beside a dragged line keep their declared size; `--blade-record-text-min-height: 0px` is 0 (M88). `PageLayoutOptions.frame` and `RecordDetailsOptions.longText: "reading"` of the same day are removed. | [FB-0221](feedback.md#fb-0221), [FB-0222](feedback.md#fb-0222) |
| 2026-11-18 | `RecordDetailsOptions.fields` (a subset of the view's detail fields in the view's order, `TypeError` for an empty array, a non-string entry or an id that is not a detail field). A media field alone among a section's shown fields shows the heading and the media without a label row, also without `detailsWidth`. `RecordDetailsOptions.longText`, `--blade-record-text-min-height` and the long-text card classes are removed (M89). | [FB-0218](feedback.md#fb-0218), [FB-0223](feedback.md#fb-0223) |
| 2026-11-18 | PHP `ApplicationDefinition` `windowMaxHeight`, JSON `application.window_max_height` (320–4000), bootstrap `windowMaxHeight`: the application's default height of fitted windows, 800 px the fallback, `WindowOptions.maxHeight` still wins; PHP/JSON field `column.placement` (`end`, `row`, `group`; a textarea without a section, presentation or editor), `ColumnMetadata.placement`, `ColumnPlacement`: a long text outside the sections at the end, as a row or as a group of its own in cards and details (M91). Additive. | [FB-0177](feedback.md#fb-0177), [FB-0225](feedback.md#fb-0225) |
| 2026-11-18 | `ViewHost.setLocation(segments, {from: "root"})` (the segments are the whole location bar) and `LocationSegment` `target.filters` (a link to a filtered list). Additive (M90). | [FB-0226](feedback.md#fb-0226) |
| 2026-11-19 | `PageLayout.busy(id, on)`, `Tabs.busy` and `Accordion.busy`: a region whose content is about to change shows the loading indicator over it until the page clears it (M93). Additive. | [FB-0232](feedback.md#fb-0232) |
| 2026-11-19 | `ViewHost.setLocation([], {from: "root"})` leaves the location bar empty instead of returning to the automatic path; `setLocation([])` still returns to it (M94). | [FB-0236](feedback.md#fb-0236) |
| 2026-11-19 | No location bar for a top-level menu entry alone while the full menu row marks it; PHP `View::$locationBar`, JSON `location_bar`, `ViewDefinition.locationBar`: a view switches its bar off (M95). | [FB-0237](feedback.md#fb-0237) |
| 2026-11-19 | Location bar Back button and level icons, both off by default: `ApplicationDefinition` and `View` `locationBack` / `locationIcons`, JSON `location_back` / `location_icons`, `ViewDefinition.locationBack` / `locationIcons`; the levels are text only unless switched on (M96). | [FB-0238](feedback.md#fb-0238) |
| 2026-11-18 | `PageRegion.header` and `count` on a region of an `inner` layout and `PageLayout.header(id, {label?, count?})` (M92). | [FB-0227](feedback.md#fb-0227) |
| 2026-11-20 | View guides open automatically once per application path, user and view in the same browser profile (M99). | [FB-0243](feedback.md#fb-0243) |
| 2026-11-20 | `CommandBar` `title` and `popup` items, `narrow: "icons"`, the `select` event and `CommandChanges.badge` (M100). Additive. | [FB-0248](feedback.md#fb-0248) |

<a id="resolved-decisions"></a>

## Resolved decisions O1–O11

| --- | --- | --- |
| O1 | Dependency injection: the shell `import()`s declared modules and calls each default export with `Application`; no import map; types from `admin.d.ts`. |
| O2 | Plain ES modules accepted; TypeScript recommended, built by the project ([recipe](#typescript-recipe)); the feature demo uses TypeScript built by `tools/build.mjs`. |
| O3 | View `id` (`[a-z][a-z0-9_.-]*`, unique) independent of `resource`, default = resource. `#view=` is canonical; menu ids `view:<id>`. Superseded on 2026-10-30 ([FB-0081](feedback.md#fb-0081)): the `#feature=<resource>` alias is removed and a duplicate id throws ([rule](#view-id-rule)). |
| O4 | `record: <resource>` record views; row resolved by that resource's `get`; opened by activation, record action, `navigate` or URL; `open: page \| window`. |
| O5 | `activate` also accepts `{field, map}` with `*` default and the new `view:<id>` target; validated on the server, chosen per row on the client. |
| O6 | Static `dist/sandbox.html` (its bootstrap inline since 2026-10-30, [changes](#changes)) with a meta CSP in `<iframe sandbox="allow-scripts">`; data and code by `postMessage`; `.deploy.json` grows by these files for `SandboxFrame` users. |
| O7 | Untrusted code may run inside the opaque-origin frame only (`blob:` script). R8's "no eval/executable configuration strings" applies to configuration and the admin origin. |
| O8 | `stylesheets` list beside `modules`, same path rules, signed-in pages only, linked after framework CSS and skins. |
| O9 | No transport change: the bootstrap `i18n.messages` already carries the merged catalog (`Translator::configure`: framework < project per locale, default locale as fallback), fed by `Blade\I18n\Settings::$catalogues` / JSON `i18n.catalogues`; `app.i18n` wraps `t`/`locale`. Framework keys are Hungarian source text in one flat namespace and a project key equal to a framework key overrides it. |
| O10 | `app.dhx` is the Suite namespace the shell uses (Standard 9.3.12, GPL obligations per [component matrix](component-matrix.md#licencek-és-lejárat)); Scheduler only through `Calendar`. |
| O11 | `app.apiVersion = 1`; until the transition closes breaking changes need a [changes](#changes) entry with a feedback reference, afterwards [breaking changes](development.md#breaking-changes). |

<a id="open-points"></a>

## Decisions at gate G1

Accepted by the owner on 2026-10-29 as recommended:

## Related

[Toolkit plan](toolkit-plan.md), [ADR-0005](decisions/0005-toolkit.md),
[ADR-0004](decisions/0004-project-domain-freedom.md),
[FB-0081](feedback.md#fb-0081), [shell](shell.md), [workspaces](workspaces.md),
[configuration](configuration.md), [i18n](i18n.md), [files](files.md).

# Toolkit API: project modules, views and components

Status: **implemented** ([FB-0081](feedback.md#fb-0081)): project modules
and stylesheets, the `app` services and [events](#event-catalog), the
registries, built-in view kinds through the `kinds` registry, view ids,
`#view=` routing, record views, the activation map,
the components `ListView`, `RecordForm`, `RecordDetails`, `CommandBar`,
`PageLayout`, `Tabs`, `Accordion`, `FileManager`, `FilePicker`, `Calendar`,
`DiagramEditor`, `MediaPlayer` and `SandboxFrame`, `admin.d.ts` and the sandbox document. The feature demo is its
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
| `ui` | `dialog`, `choice`, `toast`, `window`, `attach` ([cell content](#cell-content)) | `MessageDialog.ts`, Suite `message`, `WindowSizing.ts` |
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
app.ui.toast(app.i18n.t("Másolva."));
const win = app.ui.window({ title: "Előnézet", width: 720, signal: host.signal }); win.attach(layout);
app.ui.attach(layout.getCell("stage"), canvas, { signal });  // an element into any Layout cell (#cell-content)
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

<a id="app-window"></a>

`app.ui.window` opens a framework document window (`AppWindow`). Escape
closes it while the focus is inside it: right after it opens (it takes the
focus) and after a click inside it. Suite gives only a modal window this key;
the framework adds it to a `modal: false` window, which leaves an Escape
pressed elsewhere on the page alone ([FB-0155](feedback.md#fb-0155)). An
Escape that a menu or popup inside the window already took closes only that.
The close button is named `Ablak bezárása` (Close window) in the page's
language, with the same tooltip; a window's own `Bezárás` button keeps its
name.

Every subscription takes its owner's signal the same way, as the last
argument `{signal}` (`SignalOptions`): `events.on`, `live.subscribe`,
`theme.onChange`, `server.form` and every component's `on`. Aborting it
unsubscribes (or aborts the request); an already aborted signal subscribes
nothing. A bare `AbortSignal` in place of the object, any other non-object or a
`signal` that is not an `AbortSignal` throws `TypeError`.

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
| `commands` | `details` (the lists' `Adatok` command) | `Registry::view(…, commands: [...])`, `SqlResource::register(…, commands: [...])`, JSON `view.commands` |
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
  label: "Másolás szövegként", icon: "dxi dxi-copy", placement: "record",
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

A media type gives files of some MIME types their label and fallback icon
wherever 61ade presents a file: media slots (table, cards, tiles, details,
the `file` field), the derived `type` part, the file manager's icon column and
tree. `mime` lists exact types or classes (`audio/*`); an exact entry wins over
a class, and a file no entry matches is `Fájl` with the generic file icon. The
`icon` is a Suite icon (`dxi dxi-…`) or a 61ade glyph: `blade-icon
blade-icon--audio` (the built-in `audio`) or `blade-icon blade-icon--animation`.
The 61ade glyphs also include the transport controls the Suite font lacks, for
any icon slot such as a [CommandBar](#commandbar) button: `--play`, `--pause`,
`--skip-start`, `--skip-previous`, `--skip-next`, `--rewind`,
`--fast-forward`, `--repeat` and `--repeat-off`.
Presentation only: what a file may be, and who reads it, stays the server's.

```ts
app.mediaTypes.register("demo.scene", { mime: ["text/javascript"], label: "Animáció", icon: "blade-icon blade-icon--animation" });
```

The feature demo's real registrations: the presentation `demo.reading-bar`
([example](#example-readings)), the field type `demo.rating` and the record
command `demo.copy-text` ([example](#example-tasks)).

- **View kind** `create(host, view)` returns a `ViewInstance` (`destroy`,
  optional `editing`, `refresh`). `ViewHost` gives `app`, `signal` (aborted when
  the view closes), `open` (`page`/`window`), `record` (`{resource, id, row}`
  for record views), `filters`, `attach`, `setTitle` (changes a window's
  header; does nothing for a page view), `close`. A throw shows the
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
  app.commands.register("demo.subkey-values", { type: "toggle", label: "Alkulcsok értékei", icon: "dxi dxi-folder", placement: "toolbar", pinned: true });
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
const bar = new C.CommandBar({ items: [{ id: "play", label: "Lejátszás", icon: "dxi dxi-menu-right" }] });
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
| [`SandboxFrame`](#sandbox-protocol) | new | `ready`, `error`, `message`; `load`, `post` |
| [`CommandBar`](#commandbar) | `ResponsiveToolbar` (`Műveletek` collapse), Suite toggle items | `click`, `toggle`, `change`; `update(id, changes)`, `value(id)` |
| [`PageLayout`](#pagelayout) | the list layout's region tree and `UiPreferences` (sizes, collapsed panels, the active tab of a `tabs` branch, the open sections of an `accordion` branch) | `collapse`; `cell(id)`, `attach(id, content)`, `tabsOf(id)`, `accordionOf(id)`, `collapse(id)`, `expand(id)`, `isCollapsed(id)` |
| [`Tabs`](#tabs) | Suite `Tabbar` (header only) over one Layout cell per tab, `UiPreferences` (the active tab) | `change`; `cell(id)`, `attach(id, content)`, `active`, `select`, `update` |
| [`Accordion`](#accordion) | one Suite Layout cell per section under its cell header, `UiPreferences` (the open sections) | `toggle`; `cell(id)`, `attach(id, content)`, `openSections`, `isOpen`, `open`, `close`, `toggle`, `update` |

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
([FB-0161](feedback.md#fb-0161)). Handlers registered
with `on` run in registration order (a throwing one is logged); events are
delivered only while the component is mounted and never after `destroy()`.

<a id="listview"></a>

#### ListView

The framework list of one list view: table, cards and tiles, header filters
and the filter panel, search, the view's action forms and bulk commands,
details, sub-views, live updates and the user's saved mode, sort, columns and
filters. The built-in `list` kind is this component mounted in the view host.

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
  it runs; `details` also for a card or tile without a declared target),
  `saved` (the list's create, update, record-action and singleton forms and
  inline cell or card edits; `action` is `update` for an edit), `changed` (the
  loaded window after a load, scroll window, live update or revocation, with
  the server's `total` and `matched`). These events stay local to the main
  list. `target` also follows nested previews and sub-view windows (below).
- Methods: `editing()`, `refresh()`, `selected()`, `target()`, `setFilters(filters)`
  (replaces all values; undeclared fields are ignored).
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
  FB-0172) are collapsible fieldsets inside the form; a section opens by
  itself when one of its fields has a value or an error, and the window
  refits when one opens or closes.
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
- **Security:** every read is the resource's ordinary, ACL-checked `list`; a
  node the actor cannot read is never loaded, and a child count is the
  server's ACL-filtered `_subview`. The tree draws no panel of its own: the
  host's region gives the title.

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
- `expandControl: true` puts a [CommandBar](#commandbar) above the tree with
  `Mindet kinyit` and `Mindet bezár` (English `Expand all`, `Collapse all`),
  named by the view's title: native toolbar buttons (keyboard reachable,
  Enter or Space), in the collapsed `Műveletek` menu below 768 px or when the
  panel is too narrow. While a bulk expansion loads, the expand button reads
  `Betöltés…` and keeps the focus, and a second click does nothing;
  `Mindet bezár` cancels it. Stopped at a cap, the control reports it with a
  non-blocking warning toast (`Nem nyílt ki minden elem: legfeljebb 2000
  elem, 10 szint és elemenként 1000 gyermek tölthető be.`). Without the
  option no control is drawn. Tree navigation has no control, no `*` and no
  depth option, and it never restores an expansion (no `id`, no `refresh`),
  so its requests are unchanged: one load per node the user expands.

Limits: one label column per node (no icons, counts or templates), no drag
moves, no search, no node actions (tree navigation keeps its own toolbar), not
live. A bulk expansion is not a search: it is bounded by the caps above, and
it reloads nothing already loaded (`refresh` does).

<a id="commandbar"></a>

#### CommandBar

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
  { id: "back", label: t("Vissza a listához"), icon: "dxi dxi-arrow-left" },
  { type: "separator" },
  { id: "play", label: t("Lejátszás"), icon: "blade-icon blade-icon--play", iconOnly: true, disabled: true }] });
bar.on("click", ({ id }) => { if (id === "play") { if (playing) player.pause(); else void player.play().catch(() => {}); } });
bar.mount(layout.getCell("commands"));
player.on("loaded", () => bar.update("play", { disabled: false }));
player.on("play", () => { playing = true; bar.update("play", { label: t("Szünet"), icon: "blade-icon blade-icon--pause" }); });
player.on("pause", () => { playing = false; bar.update("play", { label: t("Lejátszás"), icon: "blade-icon blade-icon--play" }); });
```

`CommandItem` is a button (`CommandButton`: `id`, `label`, `icon`,
`iconOnly`, `disabled`, `hidden`; `type` omitted or `"button"`), one of the
[view controls](#commandbar-view-controls), a separator
(`CommandSeparator`, `{ type: "separator" }`, no id), a divider line between
groups that stays in the collapsed menu, or a spacer (`CommandSpacer`,
`{ type: "spacer" }`, no id), which pushes the following buttons to the right
and is left out of the collapsed menu. An `iconOnly` button shows only its
icon in the bar, like a player's transport control: the label stays its
accessible name and tooltip (visually hidden text) and is the item's text in
the collapsed menu; `update` of its label changes the tooltip too. Labels are
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
  { id: "back", label: t("Vissza"), icon: "dxi dxi-arrow-left" },
  { type: "toggle", id: "grid", label: t("Rács"), icon: "dxi dxi-view-grid", pressed: true },
  { type: "group", items: [{ id: "zoomIn", label: t("Nagyít"), icon: "dxi dxi-plus", iconOnly: true },
                           { id: "zoomOut", label: t("Kicsinyít"), icon: "dxi dxi-minus", iconOnly: true }] },
  { type: "spacer" },
  { type: "segmented", id: "layout", label: t("Nézet"), options: [{ value: "one", label: t("Egy") }, { value: "two", label: t("Kettő") }] }] });
const bottom = new app.components.CommandBar({ label: t("Lejátszás"), placement: "bottom", signal, items: [
  { id: "play", label: t("Lejátszás"), icon: "blade-icon blade-icon--play", iconOnly: true },
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
  { type: "toggle", id: "side", label: t("Oldalpanel"), icon: "dxi dxi-border-right", pressed: true },
  { type: "spacer" },
  { type: "menu", id: "more", label: t("További műveletek"), icon: "dxi dxi-dots-vertical", iconOnly: true, items: [
    { id: "show", label: t("Megjelenítés az oldalpanelen"), disabled: true },
    { id: "copy", label: t("Szöveg másolása"), icon: "dxi dxi-copy", disabled: true },
    { type: "separator" },
    { id: "delete", label: t("Törlés"), icon: "dxi dxi-delete", disabled: true }] }] });
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
- `cell(id)` is a declared region's cell, the mount target of every
  component (an undeclared id throws `Error`); `attach(id, content)` puts a
  Suite widget, a public component or a plain element there (the view host's
  rule), released with the layout. A region holds either attached content or
  mounted components. An attached public component is mounted there (its
  events are delivered; it can be attached or mounted once), the same for
  `Tabs.attach` and `Accordion.attach`.

<a id="pagelayout-collapse"></a>

- **Collapsing from code** ([FB-0153](feedback.md#fb-0153)): a leaf declared
  `collapsable` (in a `rows` or `cols` branch, also beside a `tabs` or
  `accordion` branch, and in a nested `PageLayout` attached into a tab) is
  collapsed to its header by `collapse(id)` and opened by `expand(id)`, as
  its header click does; both return the resulting state, like
  `isCollapsed(id)`. Any other id (a region that is not `collapsable`, a tab,
  a section, an unknown id) throws `Error`. `collapse {id, collapsed}`
  reports every change of such a leaf: the header click, its keys and the
  page's own call; a call that changes nothing reports nothing.
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
- The page is one tree for every width; a page that needs another tree on a
  phone builds a new `PageLayout` and mounts it into one element the host
  holds for the view's life (a host cell that once showed markup renders a
  later widget empty, [pitfalls](#pitfalls)).

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
  content like a folder. Suite's sliding underline is not used. The DOM ids Suite derives from tab
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
  between its header and content.
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
  "options": {"loop": true}, "open": "window", "group": "Signage", "icon": "dxi dxi-menu-right", "desktop_only": false}}}
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
`$registry->updateView($view->with(icon: 'dxi dxi-key'))` with the View it
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
has no menu entry. As a page, it inherits the record resource's
[menu context](shell.md#elkülönülő-főmenügombok) from an offered menu view;
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
| | `activate` | `{row, target}` | double-click or Enter resolved to `target` (after the activation map and its fallbacks), before it runs; `details` also for a card or tile without a target and for the `#` cell |
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
| `CommandBar` | `change` | `{id, value}` | the user chose an option of a select or segmented choice, or moved a range (throttled while dragged) |
| `SettingsForm` | `change` | `{field, value, values}` | a user change of one field (immediate, on leaving a text field, throttled while a range is dragged) |
| `SettingsForm` | `submit` | `{values}` | the submit button (with `submit`) and the values passed validation |
| `Tabs` | `change` | `{id, previous}` | another tab opened (a click, the keys, `select`), after the guard allowed it |
| `PageLayout` | `collapse` | `{id, collapsed}` | a `collapsable` leaf collapsed or expanded (its header, its keys, `collapse`, `expand`); a call that changes nothing reports nothing |
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
`host.attach()` and mounts components into its cells. A responsive page
rebuilds the whole Layout when it crosses 768 px and attaches the new one
before it releases the old. Each build owns an `AbortController` that the
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
      { id: "back", label: t("Vissza a listához"), icon: "dxi dxi-arrow-left" },
      ...(timed ? [{ type: "separator" as const }] : []),
      { id: "rewind", label: t("Elejére"), icon: "blade-icon blade-icon--skip-previous", iconOnly: true, disabled: true, hidden: !timed },
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
  icon: "dxi dxi-copy",
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
  `toolkit-registries`, and the feature demo's `toolkit-demo`,
  `toolkit-demo-assets`, `toolkit-demo-playlist`, `toolkit-demo-readings`,
  `toolkit-demo-tasks`, `toolkit-demo-playlist-editor` and `tabs`
  (`.spec.cjs`); regressions `browser`, `preferences`, `activation`.

Results per phase are recorded in [FB-0081](feedback.md#fb-0081); the plan's
[verification matrix](toolkit-plan.md#9-verification-matrix) lists the areas.

<a id="migration"></a>

## Migration from the last consumer release

Consumers adapt themselves in their own sessions; 61ade sessions do not edit
them. The range is from `131263a` (2026-10-27), the 61ade commit that both
StoryBloX and allflow last released (the last `shared_assets` record of their
`.deploy-history.jsonl`, which `deploy-site` writes into the release target
`/space/apps/<project>/`), to the current `main`. It covers the toolkit work
([FB-0081](feedback.md#fb-0081)) and everything before it in that range
(FB-0067 to FB-0085). Per-consumer notes with the affected files and lines:
[StoryBloX](handoff/storyblox.md), [allflow](handoff/allflow.md).

**Needs:** **action** = every consumer changes something; **if used** = only a
consumer that has the named code, spec or service changes something; *info* =
no change, behaviour to know. Neither consumer uses JSON modules, the file
manager, diagram, calendar, `blade-ui:` keys, its own admin JavaScript or a
WebSocket live service; both copy only `admin.js`/`admin.css` from `dist`.

| # | Change | Source | Needs | StoryBloX | allflow |
| --- | --- | --- | --- | --- | --- |
| M1 | Address `#view=<id>[&record=<id>]` ([routing](#routing)); `#feature=<resource>` is a legacy alias that resolves to the view whose id equals the resource and is rewritten to `#view=` with `replaceState`; `activate: 'page'` writes `#view=<child id>` | P2, FB-0081 | if used: code or specs that read or assert the hash | `activate: 'page'` drill-down now shows `#view=assets` | mail links `/admin/#feature=inquiries`, `#feature=profile_requests` keep working (view id = resource) |
| M2 | Menu item ids `feature:<resource>` → `view:<id>` (`sibling:view:<id>` in the collapsed menu) | P2 | if used: specs or CSS that address menu ids | none: no menu id used | none: specs find menu items by name |
| M3 | Bootstrap `views` shape: list keys under `options`, `id` and `kind` always set ([bootstrap shape](#views)) | P2 | if used: code reading `#blade-config` `views` | none | none: specs read only `csrf` |
| M4 | `Registry::view/fileManager/diagram/calendar` and `SqlResource::register` return `View` and take an optional `id` (`view`/`register` also `activate`, `commands`); `Registry::views()` returns `list<View>` objects instead of arrays; a later declaration with the same id replaces the earlier one ([rule](#view-id-rule)) | P2 | if used: PHP that reads `$registry->views()` as arrays | `register(…)` calls unchanged | three `Registry::view()` after `register()` unchanged; replacement kept |
| M5 | `Registry::subview/appendViewActions` take view ids (default = resource) | P2 | info | `subview(…, embed: false)` unchanged | — |
| M6 | Project `stylesheets` ([module loading](#module-loading)) replace stylesheet injection; linked on signed-in pages only, after `admin.css` and skins | P2, O8 | if used: a consumer that injects its own CSS | output buffer in `public/admin/index.php`; its sign-in logo needs a decision (handoff) | — |
| M7 | `.deploy.json` `shared_assets.files` adds `sandbox.html` beside `admin.js` ([packaging](#packaging)); `admin.d.ts` is never deployed | P3, O6 | if used: `SandboxFrame` users | needed with the scene stage | not needed |
| M8 | Frontend internals (`Workspace` constructor, which now takes the shell's `LiveChannel`, private classes) are not a contract; use `app` and [components](#components) | P3 | info | — | — |
| M9 | [Cache keys](#cache-keys) from the served file `?v=<base36 mtime>-<base36 size>`: `admin.js`/`admin.css` (released build `?v=30`, dev URL `?v=32` from `02a64d6` to `edbc90f`), project `modules`/`stylesheets` (formerly `?v=<version>`, still the fallback), skin stylesheets and AuthHandler files (formerly unkeyed); an own `?…` key stays as written | P4, FB-0085 | if used: specs that assert `?v=30`, `?v=32` or `?v=<version>` on these URLs must accept the file key | specs request the files without a key; own `editor.css?v=1`, `app.css?v=3` stay hand-kept until dropped | specs assert no key; release keys see the handoff |
| M10 | Record commands only in the list toolbar; the record context menu is gone: a right click, the context-menu key or Shift+F10 on a row, card or tile keeps the browser's own behaviour ([registries](#registries)). `Adatok` is the `details` record command: toolbar id `blade-results` → `blade-command:details`, disabled without a cursor record or with several marks | P3 C-5b | if used: specs that open a row context menu (use the toolbar or `Műveletek`) or address `blade-results` | none | none: `command()` clicks toolbar items by name |
| M11 | Live protocol 2 ([FB-0075](feedback.md#fb-0075)): one channel per tab; `dist` and `packages/php/bin/live-server.mjs` must come from the same commit; a page loaded before an update gets 4409 and reloads once | before P0 | if used: a WebSocket live service | none: polling | none: polling |
| M12 | Product name `61de` → `61ade` ([FB-0070](feedback.md#fb-0070), [renaming](renaming.md#61de--61ade-correction-2026-10-29)): package names, recommended link names, product texts in logs (`61ade unavailable:`) and errors; `Blade\`, `BLADE_*`, `blade_*` unchanged; old link names keep working | before P0 | info | already `lib/61ade`, `public/assets/61ade` | its own unreleased rename ships with its next release (handoff) |
| M13 | A form checkbox's accessible name is its field label again (`Archivált`); the released build exposed `checkbox Archivált` ([FB-0082](feedback.md#fb-0082)) | before P2 | if used: specs that matched the doubled name | none | none: checkboxes set through the API |
| M14 | Menu pages keep their header and panel filter values in browser storage per path, user and view; `Alaphelyzet` clears them ([FB-0079](feedback.md#fb-0079)) | before P0 | info: a spec that reuses a storage state may start filtered | none | none: fresh browser contexts |
| M15 | New optional capabilities, nothing changes until used: tenancy ([FB-0069](feedback.md#fb-0069); `blade_tokens.tenant_id`, `blade_audit.tenant_id` and the tenant tables only after `Tenancy::install`), sub-views (FB-0071), skins (FB-0072), one live server for several applications (FB-0074), static image column (FB-0076), declared activation incl. `page` (FB-0077, FB-0078), and the toolkit: modules, `app` services, registries, record views, [activation map](#activation-map), components, `SandboxFrame`, `documentRoot` | all | info | `application.php` already uses tenancy, the skin, the image column and `activate: 'page'` | — |
| M16 | `app.views` → `app.kinds` (the view-kind registry; views stay `viewDefinitions()`) | close-out | if used: project modules | none | none |
| M17 | `admin.d.ts` type names: instance = class name, `<Class>Options`, `<Class>Events`, `<Kind>KindOptions` (`FileManagerComponent`→`FileManager`, `CalendarComponent`→`Calendar`, `DiagramEditorComponent`→`DiagramEditor`, `FilePickerApi`→`FilePicker`, `ListOptions`→`ListKindOptions`, `FileManagerOptions`→`FilesKindOptions`, `DiagramOptions`→`DiagramKindOptions`, `CalendarOptions`→`CalendarKindOptions`); new `CommandButton`/`CommandSpacer`/`SignalOptions`; `apiVersion` is type-only (`ApiVersion`, runtime `app.apiVersion`) | close-out | if used: TypeScript modules | none | none |
| M18 | `{signal}` options on `events.on`, `live.subscribe`, `theme.onChange`, `server.form` and every component `on`; a positional signal throws `TypeError` | close-out | if used | none | none |
| M19 | Browser metadata is camelCase: columns (`imageBase`, `altOf`, `mediaOf`), files and calendar view options, `UploadPolicy`, field `file`/`validation` in views and `__form`; a files view's `options.upload` is `{policy}` only. Record data (rows, `_media`, `MediaDescriptor`) keeps server names. PHP/JSON configuration unchanged | close-out | if used: code or specs reading view or `__form` metadata | none known | none: its `__form` helper reads `name`, `readonly`, `values` |
| M20 | `RecordForm` `cancel` → `cancelled`; `FileManager` `opened` `{id, mimeType}`; toolbar spacers `{type: "spacer"}` without id | close-out | if used | none | none |
| M21 | `dist/sandbox.js` removed: the bootstrap is inline in `sandbox.html`, allowed by a CSP hash (no `script-src 'self'`) | close-out | if used: `SandboxFrame` | list only `sandbox.html` | not needed |
| M22 | Escape closes the `Műveletek` menu; an open file-manager or calendar form now counts as editing (blocks the live reload, gets the ended-session modal) | close-out | info | — | — |
| M23 | Sign-in customization ([shell](shell.md#sign-in-branding)): optional `logo` (placement `window`/`top`/`both`), `signInStylesheets`, `signIn` notice and links, `signInModules` (restricted `SignInApplication`, trusted code only); `data-blade-page` on `<html>`; only the [documented hooks](shell.md#sign-in-css-hooks) are supported | [FB-0087](feedback.md#fb-0087) | if used: a consumer that injects CSS or markup for its sign-in look or logo | replace the output buffer in `public/admin/index.php` and the `.blade-navigation-row::after` rules with `logo: new Logo(…, placement: 'both')` (or `top`); sign-in CSS through `signInStylesheets` | — |
| M24 | `#feature=<resource>` removed: only `#view=` names a view; any other address gives the empty workspace | [FB-0081](feedback.md#fb-0081) | if used: mail links, specs | none | mail links → `#view=inquiries`, `#view=profile_requests` |
| M25 | `ClientCommand.placement` `both` removed; a placement other than `toolbar` or `record` is skipped with a warning | [FB-0081](feedback.md#fb-0081) | if used | none | none |
| M26 | `__watch` accepts only `values.subscriptions` (otherwise 400) | [FB-0081](feedback.md#fb-0081) | if used: own polling | none | none |
| M27 | `list` without parameters returns the first cursor window `{items, …}`; the offset/plain-array answer and a list id (400) are removed | [FB-0081](feedback.md#fb-0081) | if used: API clients, specs reading a plain array | none | none: its specs read `data.items` |
| M28 | `blade_tenant_members.active` is dropped: run migration `0003-tenant-member-active` before `Tenancy::install()`, which refuses the old table. Until it has run the application fails closed: every membership read throws a `LogicException` naming the migration and grants nothing | [FB-0081](feedback.md#fb-0081) | if tenancy | run 0003 in setup | none |
| M29 | `MessageDialog` `alert()`/`confirm()` wrappers removed; use `acknowledge`, `requestConfirmation` or `app.ui.dialog` | [FB-0081](feedback.md#fb-0081) | if used | none | none |
| M30 | A duplicate view id throws at definition time; `Registry::updateView()` and `View::list()` change a declared view explicitly | [FB-0081](feedback.md#fb-0081) | if used: redeclared views | none | each `register()` + `Registry::view()` pair → `updateView(View::list(…))` |
| M31 | The file manager's `list` answer drops `truncated` | [FB-0081](feedback.md#fb-0081) | if used | none | none |
| M32 | Applications without `logo` show the 61ade product logo ([brand](brand.md)) in the top row (only where the menu leaves room) and above the sign-in form, accessible name `blade`; `Logo::none()` / JSON `"logo": false` turns it off | [FB-0088](feedback.md#fb-0088) | info; if a consumer wants no logo | `Logo::none()` or nothing | `Logo::none()` or nothing |
| M33 | The first shell page of each browser window or tab opens with the 61ade [trademark screen](brand.md#splash) (about 3.3 s, not configurable); it covers the page and takes the pointer until it fades out; the shell's CSP `script-src` carries the hash of its inline gate | [FB-0089](feedback.md#fb-0089) | info: specs that screenshot or hit-test right after loading | none | none: clicks wait for it |
| M34 | View guides ([workspaces](workspaces.md#view-guide)): a view with `guide` opens a non-modal `Útmutató: <title>` window when it opens as a page, until the user closes it once; the lower bar gains an `Útmutató` button. New, additive: `Registry::tree()` / JSON `view.tree` ([tree navigation](workspaces.md#tree-navigation)), `Field` `visibleWhen` / JSON `visible_when` ([conditional fields](workspaces.md#conditional-fields)), `ListKindOptions.tree`, `FieldMetadata.visibleWhen`, `ViewDefinition.guide`; a `RecordForm` mounted in an `AppWindow` fits it once its fields show | [FB-0107](feedback.md#fb-0107) | info: specs whose views get a guide (close it, or seed the dismissal) | none | none |
| M35 | Lists and forms ([manual order and drops](workspaces.md#manual-order), [card filters](workspaces.md#card-filters)): a list with header filters and no filter panel shows `Szűrés` in cards and tiles (the header filters in a dialog); header filter inputs are named `Szűrés: <column>`; draggable rows (a manual order, a drop, `dragSource`) start with a drag-handle column; a checkbox in a framework form shows its text; `RecordForm` submits under the action's label when no view gives a `submitLabel` and shows no success toast for a read-only action. New, additive: `SqlResource` `order` / JSON `storage.order` with the `move` action, `View`/builder `drop` / JSON `view.drop`, `ListKindOptions.order`/`drop`, `ListViewOptions.dragSource`/`panel`/`showId`, `RecordFormOptions.cancel`, `RecordForm.setValues`, `RecordDetailsOptions.showId`, `PageLayout`, computed `column.media` fields, the `not_before_field`/`not_after_field` rules | [FB-0108](feedback.md#fb-0108) | info: specs that count toolbar items in cards, find header filters by position or expect `Mentés` or a toast from a query form | none | none |
| M36 | View guides ([workspaces](workspaces.md#view-guide)): a guide opens by itself once per sign-in session (the first time its view opens as a page in a tab), no longer until it is closed; the `Útmutató` button moves from the lower bar to the top row, left of the language selector (below 768 px an item of `Menü`). New, additive: `ApplicationDefinition` `guides` / JSON `application.guides` (guides by view id, the framework's own views too), `SqlResource::register()` `guide` | [FB-0109](feedback.md#fb-0109) | if used: specs that click the lower bar's `Útmutató` or seed the `localStorage` key `blade-guide:1:` | none | none |
| M37 | Common Toolbar inset (`--blade-toolbar-padding`, default `4px 8px`) and flat shell navigation in every skin; below 768 px the right-hand tenant/guide/language/theme controls collapse together into `Beállítások`. Toolbar submenus cascade right when they fit, otherwise replace ancestors at the toolbar toggle with `Vissza`/ArrowLeft | [FB-0122](feedback.md#fb-0122), [FB-0135](feedback.md#fb-0135) | if used: mobile UI specs must open the controls menu before choosing a selector or guide | no runtime change | no runtime change |
| M38 | Tabs ([Tabs](#tabs)): `app.components.Tabs`, a `tabs` branch of `PageLayout` (region ids starting with `blade-` are now refused), `PageLayout` `guard`/`tabsOf`; `RecordForm.destroy()` destroys its Suite Form one redraw later | [FB-0145](feedback.md#fb-0145) | info: a `PageLayout` region id starting with `blade-` throws `TypeError` | none | none |
| M39 | Accordion ([Accordion](#accordion)): `app.components.Accordion`, an `accordion` branch of `PageLayout` (`multiple`, a section's `open`), `PageLayout.accordionOf` | [FB-0148](feedback.md#fb-0148) | info: `open` and `multiple` were refused before as unsupported options and are now accepted only in an `accordion` branch | none | none |
| M40 | Menu-less list views ([views](#menu-less-views)): `menu: false` on `View`, `View::list`, `Registry::view`, `SqlResource::register` and JSON `view.menu`; bootstrap `menu: false`; such a view has no menu entry and its address and `navigate` are refused | [FB-0149](feedback.md#fb-0149) | info: a bootstrap view may carry `menu`; code that lists `viewDefinitions()` as navigation targets skips `menu: false` | none | none |
| M41 | First sort and long text in cards ([list sort](workspaces.md#list-sort), [long text](workspaces.md#long-text-in-cards)): `sort` on `View::list`, `Registry::view`, `SqlResource::register` and JSON `view.sort`; bootstrap `options.sort`; a `textarea` field shows at most 4 lines on a card | [FB-0152](feedback.md#fb-0152) | info: specs that read a long `textarea` value from a card's visible text see the first 4 lines (the DOM keeps the whole value) | none | none |
| M42 | [PageLayout](#pagelayout-collapse) `collapse(id)`, `expand(id)`, `isCollapsed(id)` and the `collapse` event; `attach(id, component)` of `PageLayout`, `Tabs` and `Accordion` mounts the component (its events are delivered) | [FB-0153](feedback.md#fb-0153) | info: a component attached into a region and then mounted again (or attached twice) throws `already mounted`; mount it once | none | none |
| M43 | [CommandBar menu](#commandbar-menu): `{type: "menu", id, label, icon, iconOnly, items}`, one *more actions* button whose entries report `click` (a submenu of `Műveletek` when collapsed) | [FB-0154](feedback.md#fb-0154) | none | none | none |
| M44 | Suite's English-only names in the page's language ([window](#app-window), [PageLayout](#pagelayout-collapse)): a `collapsable` Layout header is `‹header› összecsukása` / `‹header› kinyitása`, a window's close button `Ablak bezárása`; Escape closes a `modal: false` `app.ui.window` while the focus is inside it | [FB-0155](feedback.md#fb-0155) | info: specs that find a header by "click to collapse"/"click to expand" or a close button by "close" use the localized names | none | none |
| M45 | [Cell content](#cell-content): `app.ui.attach(cell, content, {signal})` puts a plain element, Suite widget or component into any Suite Layout cell (a `type: "none"` box included), edge to edge | [FB-0157](feedback.md#fb-0157) | info: a one-region `PageLayout` that only held an element can become a box Layout cell with `app.ui.attach` (no framed panel) | none | none |
| M46 | [Tree](#tree): `app.components.Tree` over a list view with a hierarchy on itself (`select`, `activate`; `selected`, `select(id)`, `refresh(id?)`; `initial`, `id`); tree navigation's panel is built on it and its keys follow the WAI-ARIA tree (Space selects, Enter selects and activates) | [FB-0158](feedback.md#fb-0158) | info: a tree navigation spec that relied on Suite's own key handling uses the documented keys | none | none |
| M47 | Toggle command ([registries](#registries)): `ClientCommand.type: "toggle"`, `pressed`, `toggle(context)`; `run` is optional for a toggle; the state in `app.preferences.scope(<command name>)` under the view id; `ListView` event `toggle` | [FB-0159](feedback.md#fb-0159) | info: TypeScript code that calls `command.run(…)` on a `ClientCommand` handles the optional `run` | none | none |
| M48 | [Menu attention](shell.md#menu-attention): `attention: ['filters' => […], 'tone' => …]` on `View`, `View::list`, `Registry::view`, `SqlResource::register`, JSON `view.attention`; bootstrap `attention`; a live count badge on the entry, its branch and `Menü` | [FB-0160](feedback.md#fb-0160) | info: an entry with a count has the accessible name `‹label›, n függőben`; its branch and `Menü` keep their names but their visible text gains the number; each such view adds one live subscription of one row per page | none | none |
| M49 | [ListView](#listview) `createDefaults` and `preferencesKey`; `ClientCommand.pinned` ([registries](#registries)); `column.details: false` on a field ([field presentation](field-presentation.md)), left out of `detailFields` | [FB-0162](feedback.md#fb-0162)–[FB-0165](feedback.md#fb-0165) | info: a consumer that strips helper fields from its own details, opens its own create form with a preset, keeps a toggle in `Műveletek` or keeps one preference set per scope can use these instead | none | none |
| M50 | [List scope](workspaces.md#list-scope): a scoped list and a `Tree` send `scope: {field, value}` instead of the scope as a filter (exact, also for text); a field `scopeOnly: true` (JSON `scope_only`) is a scope key only: no column, details, filter or sort, and `filters`/`sort` naming it are refused | [FB-0166](feedback.md#fb-0166) | a project `list` action handler of its own (not `SqlResource`) that read a scope from `values.filters` reads `values.scope`; browser specs or mocks that inspect a scoped list's `filters` look at `scope`; a list scoped on a text field now matches it exactly | none | none |
| M51 | [Stored file field](workspaces.md#stored-file-field): PHP/JSON `file: {upload, get?, accept}` (a file in the project's own storage, uploaded through the project's upload action and saved with the record); `FieldMetadata.file` is `FileFieldConfig \| StoredFileFieldConfig` | [FB-0167](feedback.md#fb-0167) | info: TypeScript code that reads `field.file.resource` or `.mount` of any field narrows first (`"upload" in field.file`); a two-step "save, then upload" flow can become one save | none | none |
| M52 | [Tree expansion](#tree-expansion): `Tree` options `expand` (levels opened while no expansion is stored) and `expandControl` (`Mindet kinyit` / `Mindet bezár`), methods `expandAll()` (→ `TreeExpansion`) and `collapseAll()`, key `*`; caps of 10 levels and 2000 loaded nodes; the stored expansion is written only once the user changed it, upper levels first | [FB-0168](feedback.md#fb-0168) | info: a spec that read a `Tree`'s stored `expanded` before any expansion change finds only `selected`; a state stored before this change still counts as the user's expansion | none | none |
| M53 | [Cards only and full-width cards](workspaces.md#cards-only-and-full-width-cards): `modes` and `cardColumns` on `View::list`, `Registry::view`, `SqlResource::register` (JSON `view.modes`, `view.card_columns`), `ListKindOptions` and `ListViewOptions` (the component option wins); one mode hides the `Nézet` menu and ignores a kept other choice | [FB-0169](feedback.md#fb-0169) | info: a page that forced cards with `mode: "cards"` and its own CSS or layout for long text can declare cards only and one column instead; a `ListView` `mode` outside its `modes` throws `TypeError`; a kept `tiles` on a view without tiles now opens in the `ListView`'s `mode` (for example `cards`) instead of the table | none | none |
| M54 | [Read-only fields](workspaces.md#read-only-fields): `Action::$display` and `SqlResource` `createOnly` (JSON `storage.create_only`); `__form` marks them `readOnly: true` and lists them first; an input field the actor may read but not write in a form of a record is now shown read-only instead of left out; `RecordFormOptions.readOnly`; a read-only select, multiselect or checkbox shows its option label (the singleton's details form showed a select's key), a read-only long text stays multi-line | [FB-0171](feedback.md#fb-0171) | info: a spec that expected a write-denied field to be absent from an update form finds it read-only; a spec that read a read-only select's value finds its label | none | none |
| M55 | [Form sections](workspaces.md#form-sections): a field's `section` (PHP `Field`, JSON `section`) groups fields into a collapsible fieldset of the action forms; `FieldMetadata.section`, `ColumnMetadata.section` | [FB-0172](feedback.md#fb-0172) | none (additive) | none | none |
| M56 | [Count fields](workspaces.md#count-fields): `SqlResource` `counts` (JSON `storage.counts`): a declared number field counting the records of another list resource the actor could list (its list ACL, `where`, tenant and archive policy), on list rows, `get` and live snapshots; not input, filter or sort. [Tenancy](tenancy.md): `computed` SQL receives no tenant (the guide said it did) | [FB-0173](feedback.md#fb-0173) | info: a computed count over another table's tenant-scoped rows on a global resource counts every tenant; use a count field | none | none |
| M57 | [Shared rows](tenancy.md#shared-rows): `SqlResource` `sharedTenant`, `sharedRoles` (JSON `storage.shared_tenant`, `storage.shared_roles`); rows carry `_shared: true`; a tenant's write actions on a shared row are refused (403 `A közös adat csak olvasható.`) and left out of `_actions`; `Acl::holds()`, `Registry::realm()`/`tenantReady()`, `Registry::scopeToTenant()` takes the shared value and roles | [FB-0175](feedback.md#fb-0175) | info: shared content mirrored into every tenant can move into one shared row set | none | none |

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

1. **Confirm the range.** Take the library commit from the last
   `shared_assets` record of `/space/apps/<project>/.deploy-history.jsonl`, run
   `git -C /space/share/libs/61ade log --oneline <commit>..origin/main`, read
   this table, your handoff note ([StoryBloX](handoff/storyblox.md),
   [allflow](handoff/allflow.md)) and the named feedback entries
   ([update smoke check](development.md#consumer-update-smoke-check), step 1).
2. **Smoke-check the development URL** (sign in, menu, one list, one form, one
   synthetic save reverted, console and PHP error log;
   [update smoke check](development.md#consumer-update-smoke-check), step 2).
   Also check that a menu page shows `#view=<id>` (M1) and that `Adatok` and the record actions sit in the list toolbar (M10).
3. **Fix the specs** that fall under M2, M9, M10 or M13. Search the specs for
   `?v=`, `feature:`, `#feature=`, `blade-results`, `contextmenu`,
   `button: 'right'`, `Shift+F10` and `checkbox `; then run them through your
   [guarded wrapper](development.md#consumer-browser-tests).
4. **Release.** Run `deploy-site` only after steps 2 and 3 pass; it copies the
   current `packages/php` and `dist` together, which also keeps M11's pair
   intact. Record the result in your own documentation.
5. **Adopt the toolkit (optional, one change at a time, each followed by step
   3):** project `stylesheets` instead of injected CSS (M6,
   [module loading](#module-loading)); drop own `?v=` suffixes so the
   [file key](#cache-keys) applies; project `modules` with the
   [TypeScript recipe](#typescript-recipe) (types-only imports, Suite through
   `app.dhx`, one bundle, never import `admin.js`, dotted registration names);
   [record views](#record-views) and the [activation map](#activation-map);
   [components](#components); `SandboxFrame` with the sandbox files in
   `.deploy.json` (M7, [packaging](#packaging)). The feature demo is the worked
   example ([toolkit consumer](demos.md#toolkit-consumer)).
6. **Report framework gaps** to the 61ade owner instead of working around them
   in 61ade; an interim local version is allowed
   ([ADR-0004](decisions/0004-project-domain-freedom.md)).

<a id="changes"></a>

## Changes

Log of contract changes after gate G1. Rule: every change to this guide or
`src/api/types.ts` after G1 needs an entry with date, change, reason and
feedback reference; once the transition closes, changes follow
[breaking changes](development.md#breaking-changes).

| Date | Change | Reason | Feedback |
| --- | --- | --- | --- |
| 2026-10-29 | `ServerFailure.status` is 0 only for a network failure or a 2xx answer without JSON; an error answer without JSON keeps its HTTP status. | Keeps the live channel's 401/403/5xx handling unchanged. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `preferences.scope(name)` keys are `blade-ui:1:[path, user, "scope:<name>"]`; the name must contain a dot. | Cannot collide with a dotted list view id. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `app.components` is an empty frozen object until P3. Superseded in P3 (2026-10-29): it holds the ten component classes. | Components are P3 work. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `ViewKindProvider::metadata()` returns `{actions, options}` or null instead of the options alone; shared helpers in `ViewMetadata`; generic action shape `{name,label,icon,write,bulk,get,confirm,fields,…}`. | Built-in kinds emit different action shapes today. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Signed-in bootstrap key `modules` (page-relative, versioned paths; keyed by file since 2026-10-30), present only when modules are declared; stylesheets are only `<link>`s after `admin.css` and skins. | The contract named no key. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | JSON `views.<id>` accepts project (dotted) kinds only; a duplicate id inside JSON fails like other JSON duplicates (the PHP replace rule is unchanged). | Built-in kinds keep their resource-based JSON. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | A `subview()` child view of the same resource is normalised to a hierarchy of the parent view. | Matches the per-resource counting of `ListSource`. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Added `View::with()`, `Registry::provider()`, `Registry::embedded()`, `Registry::checkViews()`, `ApplicationDefinition::versioned()`; a broken `view:` target throws at definition and bootstrap; `View` requires a non-empty title and id-shaped resource and action names for every builder. | Needed by the builders and validation. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Component lifecycle: `mount(target)` once (element, Layout cell, `AppWindow` or `ViewHost`; a second mount or one after `destroy()` throws); `destroy()` idempotent; a closing window/host or the `signal` destroys; events only while mounted. | One rule for every component. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `Calendar`: one per page (Scheduler Standard), a second `new Calendar` throws; Calendar has no events; `DiagramEditor` `saved` fires after a content save only. | Scheduler is a page singleton; types.ts had no Calendar events. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `uploads.open` throws `TypeError` on malformed options; `reopen` does nothing before the first `open`. | Fail before any UI opens. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `RecordForm.submit()` blurs the focused input first; a client validation failure rejects with a 400 `ServerFailure` with field errors, a declined confirmation with `AbortError`; `RecordDetails.show()` rejects after the error dialog; `CommandBar` ids `[A-Za-z0-9_.:-]+`, unique, `blade-command-menu` reserved; `ListView` rejects a non-list view or `compact` without `scope`, `saved` also fires for inline edits; `view:<id>` targets need `get` in the row's `_actions` when present. | Found while integrating C-1 (stale value on submit). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `MediaSource` gains `{blob}`; `MediaPlayerOptions` gains `name`, `info`, `toolbar`; `MediaPlayer.focus()`; `position` also fires on pause; a non-media MIME throws `TypeError`. | Object URL ownership, accessible name, keyboard. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `SandboxFrameOptions.title`; code runs as the body of an async function; a second iframe `load` (navigation, reload, DOM move) and a timeout remove the frame; `post()` throws before `ready`; `load()` rejects with `Error{code}` or `AbortError`; envelope `id` 1–64, `type` ≤ 128, error text ≤ 1000 characters; `credentialless`; the sandbox document URL is resolved on the first `load()`. | Kill switch and bounded protocol; non-ESM bundles must not fail at app creation. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `FilePicker.pick` throws `TypeError` synchronously for malformed options; `FileManager` `opened` fires for every file the viewer or text editor shows (also previous/next); `FileManager.destroy()` aborts pending reads, sent writes complete. | Same pattern as `uploads.open`; no stale reads after close. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Field types: new field option `editor` (dotted name; not for secret, password, file or media fields) in `ColumnMetadata.editor`; a field-type column is edited in the edit window, never the native Grid editor; filters keep the storage type's input; a presentation wins over a field type's `display`. Only `image` moved onto the presentations registry (`icon` stays internal). | Server validation keeps the storage type. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Commands: every declared command is a list toolbar item after the view's actions, in declaration order (in the `Műveletek` menu when narrow); there is no record context menu. `placement: "toolbar"` acts on the view, `"record"` on the toolbar's cursor record like the built-in record actions (default enabled with a cursor record and at most one mark; an own `enabled` may accept the marks); `"both"` is accepted as `"record"`. `ListOptions.commands` is a server declaration (≤ 20 dotted names); the built-in Adatok is the `details` record command (toolbar id `blade-command:details`). | Owner decision at G3: one place for record actions, works on touch. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Commands while a sub-view record holds the toolbar: a command the sub-view's list has too (built-in `details`, a name its view declares; every command of a `shared` sub-view) gets the sub-view's context (`view`, `row` = its cursor record, `rows` = its marks); any other command stays on the list's own cursor record and marks. Previously every command saw the delegated record only for a `shared` sub-view and never saw marks while delegated. | Owner decision after G3: `view` and `row` of a command belong to one resource, like the built-in actions. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | [Cache keys](#cache-keys) of every shell asset (`admin.js`, `admin.css`, skin stylesheets, `modules`, `stylesheets`, AuthHandler files) are `?v=<base36 mtime>-<base36 size>` of the served file inside the document root; own `?…` keys stay; fallback `?v=<version>` (61ade's files: the package build's key first); the hand-bumped `?v=32` is gone. New optional `ApplicationDefinition::$documentRoot` / JSON `application.document_root` (default `DOCUMENT_ROOT`); bootstrap `modules` carry these keys. `versioned()` remains as the fallback rule. | Owner decision: cache keys from the file, so a rebuilt file reaches the browser at once. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Activation map on a media field (`file` or `column.media`): the client keys the row by the MIME class of `_media[field]` (`image`, `video`, `audio`, …) instead of the file id; no or a hidden file takes `*`. Server validation unchanged. | Toolkit P4 D1: `Médiatár` opens audio and video in a record view by the file's type; keying on the file id was useless, and a stored or computed type column would bypass the media source's ACL. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A 401 of `server.*` (and the live channel's session end) signs the page out: a reload to the sign-in page, or over open input (`ViewInstance.editing()`) the "A munkamenet lejárt" modal first ([ended session](shell.md#ended-session)). The rejection itself is unchanged. | A lapsed session left the page on error dialogs instead of the sign-in page. | [FB-0086](feedback.md#fb-0086) |
| 2026-10-30 | The [recipe](#typescript-recipe) names the feature demo (`examples/demo-app/frontend`, built to `public/app/demo.js`) as its worked example; no API change. | Toolkit P4 D0: the first real consumer of the recipe. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: `Registry::kind()` must be called before the first view of that kind (a later call throws); in code since 949af2a. | The rule was not in this guide. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: the final `GenericViewKind` option limits of G1 decision 7: a top-level map, JSON-safe values nested at most 32 levels, at most 64 KiB encoded (949af2a). | G1 decision 7 promised a log entry once verified. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: `Calendar`, `DiagramEditor` and `FileManager` accept a held `ViewDefinition` of any kind with the expected `resource`, `actions` and options shape, not only their own kind (82adbd3, c68e390). | A project may reuse a definition under its own view. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Recorded: `ListView` `activate` reports `details` also for the `#` cell (8aeeed3). | The `#` cell always opens the details. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Guide completed (toolkit P5): [event catalog](#event-catalog), [Layout recipe and pitfalls](#layout-recipe), [naming conventions](#conventions), [limits](#limits) with the owner decisions of G4 (no `ListView` `marked` event, no `MediaPlayer` playback-state event, no audio class in the type filter and picker, marks never persisted), [worked examples](#worked-examples) from the feature demo, the real verification list; the recipe's `@dhtmlx/suite` advice is a devDependency. No API change. | Toolkit P5: documentation of the implemented state. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | One lifecycle helper (`components/Lifecycle.ts`) for every component: `SandboxFrame` follows a closing window or view host, refuses a second mount, detaches its cell and emits only while mounted (`sandbox:error` always); `MediaPlayer` detaches its cell before destructing; an already closed host destroys; `on` with a non-function and a `signal` that is not an `AbortSignal` throw `TypeError`; the list components throw on a second mount or a mount after `destroy()`. | P7 API review H1: the documented rule held only for the facade components. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A view id that is not offered throws `Error`, a view of the wrong kind or shape `TypeError`, also for `ListView` and `RecordDetails` (before: `TypeError`). | P7 API review M1: one error rule for every component. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `RecordForm` `saved` is `{action, result}`; new `SandboxErrorCode` and `SandboxError` (the `load()` rejection). | P7 API review M2, M6. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `register` of a taken name (a built-in one too, without `replace`) throws the duplicate `Error` before the project-prefix `TypeError`. | P7 API review: the documented duplicate error. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `sandbox.html` runs code only when `self.origin === "null"`; a frame document reports only the first failure its messages cause; project messages also arrive before `ready` and after an error. | P7 security review M1 (framed without `sandbox` it ran code at the host origin), L3 (error flood). | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | The shell CSP adds `object-src 'none'`; the demo's `signage_playlist.scene` also needs `files.content_stream` on the scene file's mount (else 404). | P7 security review: hardening; the scene action skipped the file's object ACL. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A `load()` refused for size no longer rejects a still pending earlier load (that frame can still become ready); `navigate` writes only `#view=<id>[&record=…]` (filters are applied, not written). | P7 documentation review: the earlier load was rejected while its frame stayed, so it could never become ready; the doc comment overstated the address. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `app.views` → `app.kinds`; one type-name scheme (instance = class, `<Class>Options`, `<Class>Events`, `<Kind>KindOptions`). | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `apiVersion` is type-only in `admin.d.ts` (`ApiVersion`); the value is `app.apiVersion`. | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | One `ColumnMetadata` spelling (camelCase `imageBase`, `altOf`, `mediaOf`); `ListViewKind` normalises declared columns. | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `{signal}` options (`SignalOptions`) on `events.on`, `live.subscribe`, `theme.onChange`, `server.form` and component `on`; positional signals removed. | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `CommandItem` = `CommandButton \| CommandSpacer` (spacers need no id); Escape closes the `Műveletek` menu and focuses its toggle. | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `FileManager.editing()` and `Calendar.editing()`; the built-in kinds report them. | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Sandbox bootstrap inline in `sandbox.html`, allowed by `script-src 'sha256-…' blob:`; `dist/sandbox.js` removed. | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Event naming rule ([conventions](#conventions)): `RecordForm` `cancelled`, `FileManager` `opened` `{id, mimeType}`; browser metadata camelCase (files/calendar options, `UploadPolicy`, field `file`/`validation`); `FilesKindOptions.upload` is `{policy}` only (the upload rules were sent twice). | Owner: finished framework before consumers migrate. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Sign-in customization: `ApplicationDefinition` `logo` (`Logo(image, darkImage, label, placement)`), `signInStylesheets`, `signIn` (`SignIn(notice, links)`), `signInModules` with the restricted `SignInApplication`/`SignInModule` (`src/api/sign-in.ts`, in `admin.d.ts`); JSON `application.logo`, `sign_in_stylesheets`, `sign_in`, `sign_in_modules`; bootstrap `logo`, `signIn`, `signInModules`; `data-blade-page` on `<html>`; supported CSS hooks ([sign-in customization](shell.md#sign-in-branding)). | Owner: the sign-in pages must be customizable and extensible; consumers injected CSS against unsupported classes. | [FB-0087](feedback.md#fb-0087) |
| 2026-10-30 | `#feature=` alias removed (M24). | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Command `placement: "both"` removed (M25). | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `__watch` only with `values.subscriptions` (M26). | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | The `list` offset API removed; no parameters give the first cursor window (M27). | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | Tenancy `active` column dropped by migration 0003; tenancy fails closed until it has run (M28). | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | `MessageDialog` `alert`/`confirm` compatibility wrappers removed (M29). | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | A duplicate view id throws; `Registry::updateView()` and `View::list()` added; [G1 decision 1](#decisions-at-gate-g1) and O3's replacement rule are superseded (M30). | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | File `list` answer without `truncated` (M31); the internal `src/Workspace.ts` re-export removed. | Owner: no legacy procedures for consumers or old clients. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-30 | The 61ade product logo ("blade", [brand](brand.md)) is the default logo: inline in `admin.js`, bootstrap `logo` without `image`; `Logo::$image` optional (`new Logo(placement: …)` keeps the product logo), `Logo::none()` / JSON `"logo": false` opts out; accessible name `blade`. | Owner: every application gets the product brand without a deployed file; parts addressable for a later animation. | [FB-0088](feedback.md#fb-0088) |
| 2026-10-30 | Trademark screen once per browser window or tab (`sessionStorage` gate, inline head script allowed by CSP hash): page-turning tiles, letters bouncing in, blade glint and spark on black, then a fade into the application; no option to skip it (M33). | Owner: it is the 61ade trademark screen; applications cannot override it. | [FB-0089](feedback.md#fb-0089) |
| 2026-10-30 | Product logo redrawn to the owner's source drawing: the first letters read 6 and 1 (only they carry the teal), `ade` ink, heavier stems, tighter spacing, taller tile 1 with its arc; viewBox `-19 -46 1370 395`. | Owner: the b of the SVG must be the 6 of the source drawing. | [FB-0090](feedback.md#fb-0090) |
| 2026-10-30 | Product logo redrawn as `b1ade` to the owner's new drawing: rounded-rectangle letters, the `b` and `1` in one blue gradient, `ade` ink, tiles recoloured; viewBox `-19 -46 1795 395`. The trademark screen adds the blue dot and `com`, silver ink, glow, floor light and reflection. | Owner: a better logo design; `.com` on the trademark screen only, tiles and their animation stay. | [FB-0091](feedback.md#fb-0091) |
| 2026-10-31 | `Application.mediaTypes` (`Registry<MediaType>`: `mime`, `label`, `icon`; built-ins `image`, `video`, `audio`) presents files by MIME type in media slots, the `type` part, the file picker and the file manager; the 61ade glyphs `blade-icon--audio` (the built-in audio icon, before the generic file icon) and `blade-icon--animation`. An activation map on a media field matches an exact MIME type entry before the class. Additive. | Owner: audio and HTML animations need their own icons in the `Médiatár`, and animations their own player. | [FB-0102](feedback.md#fb-0102) |
| 2026-10-31 | `BuiltinFieldType` gains `date` (`YYYY-MM-DD`): native DatePicker form item and Grid `datePicker` cell editor. | Dates were plain text inputs with a pattern. | [FB-0104](feedback.md#fb-0104) |
| 2026-10-31 | `Components.PageLayout` (`PageLayoutOptions`, `PageRegion`); `ListViewOptions.dragSource`, `panel`, `showId`; `ListKindOptions.order`, `drop`; `RecordFormOptions.cancel`, `RecordForm.setValues()`; `RecordDetailsOptions.showId`; `ValidationRules.notBeforeField`, `notAfterField`. `RecordForm` submits under the action's label without a `submitLabel` and shows no toast for a read-only action. Additive (M35). | Owner: the playlist editor and the day programme are rebuilt from 61ade components only; the missing pieces (declared page panels, a manual order, drops between lists, filters in cards, range rules) belong in the framework. | [FB-0108](feedback.md#fb-0108) |
| 2026-10-31 | `ViewDefinition.guide`, `ListKindOptions.tree` (`TreeMetadata`), `FieldMetadata.visibleWhen`; `Registry::tree()`, `View`/builder `guide`, `Field` `visibleWhen`; `RecordForm` fits an `AppWindow` it is mounted in. Additive. | Feature-demo guides and the registry editor demo need a view guide, a data tree beside a list and type-dependent value editors in the framework. | [FB-0107](feedback.md#fb-0107) |
| 2026-10-31 | View guides open once per sign-in session (`sessionStorage`, cleared on the signed-out page); the `Útmutató` control is in the top row (in `Menü` below 768 px); `ApplicationDefinition` `guides` / JSON `application.guides`; `SqlResource::register()` `guide`. Additive (M36). | Owner: every feature shows its guide once per session when first tried, with a help button beside the language selector, configured at system level. | [FB-0109](feedback.md#fb-0109) |
| 2026-10-31 | `CommandSeparator` (`{type: "separator"}`) and `CommandButton.iconOnly` (icon in the bar, the label as tooltip, accessible name and collapsed-menu text); `MediaPlayerEvents` `play` and `pause`; 61ade transport glyphs `blade-icon--play`, `--pause`, `--skip-start`, `--skip-previous`, `--skip-next`, `--rewind`, `--fast-forward`, `--repeat`, `--repeat-off`. Additive. | Owner: a divider after the back command, and player commands that look like a player's, wherever relevant. | [FB-0111](feedback.md#fb-0111) |
| 2026-11-02 | `MediaPlayerOptions.visualizer: "spectrum"` (optional, audio only); `MediaPlayer.loop()`, `setLoop(boolean)` and `loop {loop}` event synchronize repeat controls; `toolbarPosition` (`top` / `bottom`) defaults to top. Existing `autoplay` remains a native request subject to browser policy. Additive. | Audio preview spectrum and synchronized repeat. | [FB-0119](feedback.md#fb-0119) |
| 2026-11-02 | `SandboxFrameOptions.autoplay` delegates autoplay to the opaque frame, default false; no sandbox flags or isolation permissions added. Additive. | One parent playback gesture for scene audio. | [FB-0120](feedback.md#fb-0120) |
| 2026-11-02 | `ListView.target()` and `target` (`ListTarget`: `{view, row, rows}`) expose the active context, including selected previews and foremost child windows, marks and selected-record live changes. Existing `select`, `selected()` and command-specific delegation keep their meaning. Additive. | A selection-following panel needs the framework's nested active context. | [FB-0125](feedback.md#fb-0125) |
| 2026-11-02 | A table's or card's sub-view previews inside a window live in that window's popup wrapper (its stacking context, the containing block of the fixed layer) instead of the page body, so they show over their slots in the window and stay below its menus, dialogs and later windows. No API change. | Found in cyberspace.hu: a `ListView` with a sub-view in an `app.ui.window` expanded to an empty row (the body-level layer had `z-index: 1`, the window's `.dhx_window` reports `auto`). | — |
| 2026-11-09 | `Components.Tabs` (`TabsOptions`, `TabDefinition`, `TabsEvents`, event `change`); `PageRegion.tabs` (a `tabs` branch; region ids `blade-…` are reserved), `PageLayoutOptions.guard`, `PageLayout.tabsOf()`. `RecordForm.destroy()` destroys its Suite Form one redraw later. Additive (M38). | Owner: a tabbed switch between viewing and editing, offered where a page needs it. The list's `detail_tabs` window of the first version was withdrawn the same day. | [FB-0145](feedback.md#fb-0145) |
| 2026-11-09 | `Components.Accordion` (`AccordionOptions`, `AccordionSection`, `AccordionEvents`, event `toggle`); `PageRegion.accordion`, `multiple`, `open` (an `accordion` branch), `PageLayout.accordionOf()`. Additive (M39). | Owner: an accordion attachable to a layout region, to divide a tall panel such as a form's region. | [FB-0148](feedback.md#fb-0148) |
| 2026-11-09 | `ViewDefinition.menu` (`false` only); `Application.navigate` returns `false` for a `menu: false` view. PHP `View::$menu`, `menu` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.menu`. Additive (M40). | A consumer's record page embeds several scoped framework lists that must not appear in the menu (a consumer request, recorded without business terms). | [FB-0149](feedback.md#fb-0149) |
| 2026-11-09 | `CommandItem` adds `CommandToggle`, `CommandSelect`, `CommandSegmented`, `CommandRange`, `CommandGroup` (`CommandOption`); `CommandBarOptions.label`, `.placement`; `CommandBar.update(id, CommandChanges)`, `CommandBar.value(id)`; `CommandBarEvents.toggle`, `.change`. Additive; a project `switch` over every `CommandItem` type gets the new members. | A record page's player bars above and below its viewer need toggles, choices, button groups and a range. | [FB-0150](feedback.md#fb-0150) |
| 2026-11-09 | `Components.SettingsForm` (`SettingsFormOptions`, `SettingsField`, `SettingsFieldType`, `SettingsGroup`, `SettingsChip`, `SettingsFormEvents`: `change`, `submit`). Additive. | A record page's view settings have no record action, and `RecordForm` needs one. | [FB-0151](feedback.md#fb-0151) |
| 2026-11-09 | `ListKindOptions.sort` (`{field, direction}`, the first sort). PHP `sort` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.sort`. A `textarea` field shows at most 4 lines on a card. Additive (M41). | A consumer's scoped side-panel list starts oldest first and holds long text entries. | [FB-0152](feedback.md#fb-0152) |
| 2026-11-09 | `PageLayout.collapse(id)`, `expand(id)`, `isCollapsed(id)`, `PageLayoutEvents` (`collapse {id, collapsed}`; `PageLayout` extends `Component<PageLayoutEvents>`). A public component given to `attach` of `PageLayout`, `Tabs` or `Accordion` is mounted there, so its events arrive. Additive (M42). | A consumer's record page shows or hides a side panel from its command bar and collapses its control region on a phone while one tab is shown. | [FB-0153](feedback.md#fb-0153) |
| 2026-11-09 | `CommandItem` adds `CommandMenu` (`type: "menu"`, `items`: 1–12 `CommandButton`s and `CommandSeparator`s); its entries report `click {id}` and take `update`. Additive (M43). | A consumer's command bar acts on the selected item with a few commands behind one *more actions* button. | [FB-0154](feedback.md#fb-0154) |
| 2026-11-09 | `Ui.attach(target, content, {signal})`: a plain element, Suite widget or component into any Suite Layout cell, edge to edge, released by the signal. Additive (M45). | A consumer shows a project-drawn interactive preview between two command bars in a tab, without the framed panel of a one-region `PageLayout`. | [FB-0157](feedback.md#fb-0157) |
| 2026-11-10 | `Components.Tree` (`TreeOptions`, `TreeEvents`: `select`, `activate`; `Tree.selected()`, `select(id)`, `refresh(id?)`). Additive (M46). | A page composes its own panels around a hierarchy that tree navigation shows only in its fixed tree + list layout (a consumer request, recorded without business terms). | [FB-0158](feedback.md#fb-0158) |
| 2026-11-10 | `ClientCommand.type` (`"button"` \| `"toggle"`), `.pressed`, `.toggle(ToggleContext)`; `ClientCommand.run` is optional (required unless `type: "toggle"`); `ToggleContext`; `ListViewEvents.toggle`. Additive (M47). | A list-wide mode switch in the list's own toolbar, kept per view (a consumer request). | [FB-0159](feedback.md#fb-0159) |
| 2026-11-10 | `ViewDefinition.attention` (`{filters, tone}`). PHP `View::$attention`, `attention` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.attention`. Additive (M48). | Pending work on a view must be noticed from any page (a consumer request). | [FB-0160](feedback.md#fb-0160) |
| 2026-11-11 | Destroy + mount of a component into the same Layout cell, tab, region, window or view host in one task shows the new component (it was empty until the next frame's work-around); a cell that showed markup (`attachHTML`, an element) takes a widget or component. No API change. | A page re-scoping its list and details from a tree replaces components in the same cells many times (a consumer request). | [FB-0161](feedback.md#fb-0161) |
| 2026-11-11 | `ListViewOptions.createDefaults` (start values of the built-in create form), `ListViewOptions.preferencesKey` (the preference key instead of the view id, shared across scopes); `ClientCommand.pinned` (kept in the toolbar when the others collapse); PHP/JSON field `column.details: false` (left out of `detailFields`: `RecordDetails`, `Adatok`, cards). Additive (M49). | A page that scopes one list view on several fields, one of them computed, from a tree (a consumer request). | [FB-0162](feedback.md#fb-0162)–[FB-0165](feedback.md#fb-0165) |
| 2026-11-11 | List protocol `scope: {field, value}` (a scoped list, a sub-view, a tree navigation's list and `Tree` levels send it instead of a filter; exact match); PHP `Field::$scopeOnly`, JSON `scope_only`: a scope key only, in no columns, `detailFields`, `filters` or `sortable` metadata, refused in `filters`, `sort`, view columns, first sort, attention and search; `SqlResource::register` leaves it out of the default columns. M50. | Helper keys a page scopes on still reached users as sort entries and number filters (a consumer request). | [FB-0166](feedback.md#fb-0166) |
| 2026-11-11 | PHP/JSON `file` field option `{upload: 'resource.action', get?: 'resource.action', accept}`: a file the project stores itself. The form control (native dialog, paste, drop, background upload, preview) uploads to the project's upload action, which returns `['id' => token]`; the executor checks the detected type and records an upload claim (actor, session, tenant, upload action, TTL); the record save accepts a new token only for such a claim and removes it after the commit; the edit form shows the stored file through the GET action. A form field only (no column, details, filter, sort or scope). `StoredFileFieldConfig`, `Registry::storedFileFields()`, `Registry::checkFileFields()`. M51. | Domain records whose files the project owns could not take a file in the same save as their other fields (a consumer request). | [FB-0167](feedback.md#fb-0167) |
| 2026-11-11 | `TreeOptions.expand` (levels opened while no expansion is stored, 0–10), `TreeOptions.expandControl`; `Tree.expandAll()` (→ `TreeExpansion`: `complete`, `nodes`, `reason`), `Tree.collapseAll()`; key `*`. The stored expansion is written only after the user changed it. Additive (M52). | A hierarchy should open its upper levels on first display and open or close as a whole (a consumer request). | [FB-0168](feedback.md#fb-0168) |
| 2026-11-11 | `ListKindOptions.modes`/`cardColumns`, `ListViewOptions.modes`/`cardColumns`; PHP `modes` and `cardColumns` parameters of `View::list`, `Registry::view`, `SqlResource::register`; JSON `view.modes`, `view.card_columns`. The offered presentations (one hides the `Nézet` menu; a kept choice outside them is ignored, not overwritten) and at most this many card columns (1: one card per row). Additive (M53). | A list of notes could always be switched to a table and its cards were cut into narrow columns (a consumer request). | [FB-0169](feedback.md#fb-0169) |
| 2026-11-11 | `Tree`: the remembered selection and `initial` apply at the end of the start only when nothing was selected meanwhile; a selection made while the roots, the `expand` levels or a restored expansion load stays and is stored, with no second `select`. | The start selected `initial` over the user's choice about 2 s after it. | [FB-0170](feedback.md#fb-0170) |
| 2026-11-11 | `RecordFormOptions.readOnly` (host-fixed input fields, still submitted); `FieldMetadata.readOnly` (`__form`: an action's `display` field or a readable field the actor may not write, shown and never sent); PHP `Action::$display`, `SqlResource` `createOnly`, JSON `storage.create_only` (M54). | Values fixed after create stayed editable (then refused) or disappeared from the update form. | [FB-0171](feedback.md#fb-0171) |
| 2026-11-11 | `FieldMetadata.section`, `ColumnMetadata.section`; PHP `Field::$section`, JSON field `section`: collapsible form sections (M55). | Optional bulky fields lengthened every form. | [FB-0172](feedback.md#fb-0172) |
| 2026-11-11 | PHP `SqlResource` `counts`, JSON `storage.counts`: count fields (number fields filled from the counted resource's ACL-scoped list count; left out when they cannot be counted). No browser type change (M56). | A global resource could not show counts of tenant-scoped records without counting every tenant's rows. | [FB-0173](feedback.md#fb-0173) |
| 2026-11-11 | PHP `SqlResource` `sharedTenant`/`sharedRoles`, JSON `storage.shared_tenant`/`shared_roles`: shared rows of a tenant-scoped resource, read by every tenant beside its own (`_shared: true`), written only without a tenant by a declared role (M57). No browser change: `_actions` disables the commands. | Shared content had to be copied into every tenant or shown from a second resource (a consumer request). | [FB-0175](feedback.md#fb-0175) |

<a id="resolved-decisions"></a>

## Resolved decisions O1–O11

Open questions of the [toolkit plan](toolkit-plan.md#3-fixed-decisions-and-open-decisions),
resolved with the recommended defaults and the P0 consumer inventory.

| # | Resolution | Rationale |
| --- | --- | --- |
| O1 | Dependency injection: the shell `import()`s declared modules and calls each default export with `Application`; no import map; types from `admin.d.ts`. | An inline import map needs a CSP hash or nonce; `admin.js` is loaded with `?v=`, so importing it by URL would create a second instance. |
| O2 | Plain ES modules accepted; TypeScript recommended, built by the project ([recipe](#typescript-recipe)); the feature demo uses TypeScript built by `tools/build.mjs`. | No build requirement for small modules; types without a second runtime. |
| O3 | View `id` (`[a-z][a-z0-9_.-]*`, unique) independent of `resource`, default = resource. `#view=` is canonical; menu ids `view:<id>`. Superseded on 2026-10-30 ([FB-0081](feedback.md#fb-0081)): the `#feature=<resource>` alias is removed and a duplicate id throws ([rule](#view-id-rule)). | Default ids keep preference keys valid. The alias and the replacement served delivered consumer e-mails and consumer declarations; the owner removed every compatibility procedure for consumers and old clients. |
| O4 | `record: <resource>` record views; row resolved by that resource's `get`; opened by activation, record action, `navigate` or URL; `open: page \| window`. | Server-side ACL, field ACL and tenant scope stay the only authority. |
| O5 | `activate` also accepts `{field, map}` with `*` default and the new `view:<id>` target; validated on the server, chosen per row on the client. | StoryBloX audio/scene records open different viewers; existing values keep working. |
| O6 | Static `dist/sandbox.html` (its bootstrap inline since 2026-10-30, [changes](#changes)) with a meta CSP in `<iframe sandbox="allow-scripts">`; data and code by `postMessage`; `.deploy.json` grows by these files for `SandboxFrame` users. | Opaque origin: no cookies or CSRF; the shell CSP stays strict. |
| O7 | Untrusted code may run inside the opaque-origin frame only (`blob:` script). R8's "no eval/executable configuration strings" applies to configuration and the admin origin. | Agent-written scenes are project data, not configuration. |
| O8 | `stylesheets` list beside `modules`, same path rules, signed-in pages only, linked after framework CSS and skins. | Replaces StoryBloX's output-buffer injection in `public/admin/index.php`. |
| O9 | No transport change: the bootstrap `i18n.messages` already carries the merged catalog (`Translator::configure`: framework < project per locale, default locale as fallback), fed by `Blade\I18n\Settings::$catalogues` / JSON `i18n.catalogues`; `app.i18n` wraps `t`/`locale`. Framework keys are Hungarian source text in one flat namespace and a project key equal to a framework key overrides it. | Confirmed in P0.4; project modules use the same catalogues. Key convention: accepted at G1 (source text or project prefix). |
| O10 | `app.dhx` is the Suite namespace the shell uses (Standard 9.3.12, GPL obligations per [component matrix](component-matrix.md#licencek-és-lejárat)); Scheduler only through `Calendar`. | One instance shares theme and locale; one Scheduler per page in Standard. |
| O11 | `app.apiVersion = 1`; until the transition closes breaking changes need a [changes](#changes) entry with a feedback reference, afterwards [breaking changes](development.md#breaking-changes). | Freezes the contract at G1 without blocking P2/P3 corrections. |

<a id="open-points"></a>

## Decisions at gate G1

Accepted by the owner on 2026-10-29 as recommended:

1. **Duplicate view ids:** a later declaration with the same id replaces the
   earlier one and keeps its menu position; a client view kind registered
   twice is an error unless `{replace: true}`. *Superseded on 2026-10-30
   ([FB-0081](feedback.md#fb-0081)): a duplicate view id throws and
   `Registry::updateView()` changes a declared view explicitly
   ([rule](#view-id-rule)); the client kind rule is unchanged.*
2. **Translation keys of project modules (O9):** Hungarian source text like the
   framework, or a project prefix (`storyblox.player.play`) for texts without a
   natural source; overriding framework keys stays allowed and documented.
3. **Project name prefix:** project kinds, presentations, field types,
   commands, event names and preference scopes must contain a dot.
4. **JSON placement of extra views:** a module-level `views` section;
   `resources.<name>.view` gains only `id` and the activation map (later also
   `commands`, C-5b).
5. **Module timeout and failure policy:** 5 s per module, report and continue.
6. **`modules` naming:** `application.modules` (browser) beside
   `workspace.modules` (JSON files) stays, explained in this guide.
7. **Proposed limits** (sandbox code 1 MiB, files 32 MiB, `ready` within 10 s,
   project-kind options 64 KiB) stand until P3 C-4/K-S1 verify them; a change
   is logged in [changes](#changes). Confirmed unchanged; the generic
   provider's final shape rules are logged there (2026-10-30).

## Related

[Toolkit plan](toolkit-plan.md), [ADR-0005](decisions/0005-toolkit.md),
[ADR-0004](decisions/0004-project-domain-freedom.md),
[FB-0081](feedback.md#fb-0081), [shell](shell.md), [workspaces](workspaces.md),
[configuration](configuration.md), [i18n](i18n.md), [files](files.md).

# Toolkit API: project modules, views and components

Status: **implemented** ([FB-0081](feedback.md#fb-0081)): project modules
and stylesheets, the `app` services and [events](#event-catalog), the
registries, built-in view kinds through the `kinds` registry, view ids,
`#view=` routing with the `#feature=` alias, record views, the activation map,
the components `ListView`, `RecordForm`, `RecordDetails`, `CommandBar`,
`FileManager`, `FilePicker`, `Calendar`, `DiagramEditor`, `MediaPlayer` and
`SandboxFrame`, `admin.d.ts` and the sandbox document. The feature demo is its
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
- **When:** only in the signed-in shell. The sign-in, e-mail confirmation and
  password-change pages load neither modules nor stylesheets (as with skins).
  Stylesheets are linked after the framework CSS and skins.
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
`modules` and `stylesheets`, and AuthHandler's `AuthHandler.css`/`.js` on the
sign-in page. Each gets `?v=<key>`: the base36 modification time (seconds) and
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
| `ui` | `dialog`, `choice`, `toast`, `window` | `MessageDialog.ts`, Suite `message`, `WindowSizing.ts` |
| `uploads` | `open`, `reopen` of the shared uploader | `Uploader.ts` `uploads` |
| `i18n` | `t`, `locale`, `languages` | `I18n.ts` |
| `theme` | `current`, `skin`, `onChange(listener, {signal})` | AdminShell theme/skin handling |
| `preferences` | `scope(name)` → `get/set/remove` (`name` must contain a dot, else `TypeError`) | `UiPreferences.ts` storage |
| `live` | `subscribe(resource, query, handlers, {signal})` | `LiveChannel`/`Realtime` |
| `events` | Typed bus `on(name, handler, {signal})`, `off`, `emit` ([event catalog](#event-catalog)) | uploader `on/off` |
| `identity` | `id`, `displayName`, `tenant` | bootstrap `userId`, `displayName`, `tenant.current` |
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
  label: "Másolás szövegként", icon: "dxi dxi-content-copy", placement: "record",
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
  `Törlés`); `both` is accepted as `record`. The context has `app`, `view` (as
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
new C.FileManager({ view: "files" }).mount(host);
const file = await C.FilePicker.pick({ field: fileField, title: "Kép" });
new C.Calendar({ view: "events" }).mount(host);
new C.DiagramEditor({ view: "diagrams" }).mount(host);
const player = new C.MediaPlayer({ source: { resource: "signage_assets", action: "content_stream", id }, mime: "audio/mpeg" });
player.on("position", ({ seconds }) => timeline.move(seconds)); player.mount(layout.getCell("stage"));
const frame = new C.SandboxFrame({ signal: host.signal }); await frame.load(code, { "tone.wav": blob });
const bar = new C.CommandBar({ items: [{ id: "play", label: "Lejátszás", icon: "dxi dxi-play" }] });
bar.on("click", ({ id }) => id === "play" && player.play());
```

| Component | Wraps | Events / methods |
| --- | --- | --- |
| [`ListView`](#listview) | `Workspace` (split into `src/components/list/*`) | `select`, `activate`, `saved`, `changed`; `editing`, `refresh`, `selected`, `setFilters` |
| [`RecordForm`](#recordform) | workspace action forms, `FormValidation`, `FileFields` | `saved`, `cancel`, `changed`; `submit`, `values`, `dirty` |
| [`RecordDetails`](#recorddetails) | the `Adatok` details (`recordFields`) | `show(row \| id)` |
| [`FileManager`, `FilePicker`](#filemanager-and-filepicker) | `components/files/*` over `FileManager.ts`, `FilePicker.ts` | `opened`; `editing`; `pick()` resolves a `MediaDescriptor` or `null` |
| [`Calendar`, `DiagramEditor`](#calendar-and-diagrameditor) | `components/calendar/CalendarView.ts`, `components/diagram/DiagramView.ts` | Calendar: none; DiagramEditor: `saved`; both `editing` |
| [`MediaPlayer`](#mediaplayer) | `components/media/MediaPlayer.ts`, extracted from the file manager viewer, plus audio | `loaded`, `position`, `ended`, `error`; `play`, `pause`, `seek`, `position`, `duration`, `focus` |
| [`SandboxFrame`](#sandbox-protocol) | new | `ready`, `error`, `message`; `load`, `post` |
| [`CommandBar`](#commandbar) | `ResponsiveToolbar` (`Műveletek` collapse) | `click`; `update(id, changes)` |

Every event with its payload is in the [event catalog](#event-catalog); how
to compose components in one page is the [Layout recipe](#layout-recipe).
The list components live in `packages/frontend/src/components/list` and are
offered as
`app.components.ListView`, `RecordForm`, `RecordDetails` and `CommandBar`
(the other components have their own subsections). Common rules: `mount(target)`
takes an element (filled at 100 %), a Layout cell, an `AppWindow` or a
`ViewHost`; a window or view host destroys the component when it closes, and
the `signal` option does the same. Mounting twice or after `destroy()` throws
`Error`; an already closed window or host destroys the component at once;
`on` with a non-function and a `signal` that is not an `AbortSignal` throw
`TypeError`. A view id that is not offered throws `Error`, a view of the wrong
kind or shape `TypeError`. `destroy()` is idempotent, detaches the
component from the cell it was mounted in and releases its widgets, the
windows it opened, its requests and its live subscription. Handlers registered
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
  record (`compact` needs `scope`).
- Events: `select` (cursor record, `undefined` when it leaves the window),
  `activate` (the resolved target of a double-click or Enter, reported before
  it runs; `details` also for a card or tile without a declared target),
  `saved` (the list's create, update, record-action and singleton forms and
  inline cell or card edits; `action` is `update` for an edit), `changed` (the
  loaded window after a load, scroll window, live update or revocation, with
  the server's `total` and `matched`). Nested previews and sub-view windows
  report nothing.
- Methods: `editing()`, `refresh()`, `selected()`, `setFilters(filters)`
  (replaces all values; undeclared fields are ignored).
- The [activation map](#activation-map) is chosen per row; a `view:<id>`
  target calls `app.navigate({view, record})`.
- **Preferences** are keyed by the `id` of the definition the component gets
  (`blade-ui:1:[path, user, <view id>]`, a scoped list `<view id>@<field>`):
  mode, sort, column widths and visibility, panel sizes and (not for a scoped
  list) the filter values, exactly as for the menu page of that id. Passing an offered id shares the
  menu page's state; a page that must keep its own passes the held definition
  under its own view id (`{ ...app.viewDefinition("demo_readings"), id:
  view.id }`, [example](#example-readings)). Marks and the cursor record are
  transient: they are never stored, so a reload or a new instance starts
  without them.
- **No marks event:** `ListView` reports the cursor record (`select`) and the
  loaded window (`changed`), not the marked rows; there is no `marked` event
  or method ([limits](#limits)). Commands see the marks in their context.

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
form.on("cancel", () => win.close());
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
the view's `get` (a newer call wins). A failed load shows the error dialog and
`show()` rejects. It has no events.

<a id="commandbar"></a>

#### CommandBar

The list's own responsive command bar: native Toolbar buttons that move into
one `Műveletek` menu below 768 px or when they do not fit, keeping ids, state
and click events.

```ts
const bar = new app.components.CommandBar({ signal: host.signal, items: [
  { id: "play", label: app.i18n.t("Lejátszás"), icon: "dxi dxi-play" },
  { id: "pause", label: app.i18n.t("Szünet"), disabled: true }] });
bar.on("click", ({ id }) => (id === "play" ? void player.play() : player.pause()));
bar.mount(layout.getCell("commands"));
player.on("loaded", () => bar.update("pause", { disabled: false }));
```

`CommandItem` is a button (`CommandButton`: `id`, `label`, `icon`,
`disabled`, `hidden`; `type` omitted or `"button"`) or a spacer
(`CommandSpacer`, `{ type: "spacer" }`, no id), which pushes the following
buttons to the right and is left out of the collapsed menu. Labels are plain
text (escaped). Button ids match `[A-Za-z0-9_.:-]+`, are unique and
`blade-command-menu` is reserved; otherwise the constructor throws
`TypeError`. `update(id, changes)` changes the label, icon, disabled or hidden
state, also while the item sits in the collapsed menu. `toolbar` is the
underlying Suite Toolbar. Escape closes an open menu, also one opened with the
mouse, and returns the focus to its toggle (`Műveletek`); the key does not
reach a window behind it. The feature demo's viewer drives a `MediaPlayer`
with it ([example](#example-record-view)).

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
`app.components.FilePicker.pick` is the modal tiles picker of `file` fields
(`Kiválasztás…`) as a promise.

```ts
const files = new app.components.FileManager({ view: "files", signal: host.signal });
files.on("opened", ({ id, mime_type }) => recent.push({ id, mime_type }));  // viewer or text editor showed a file
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
  mime_type}`) fires each time the viewer or the text editor shows a file,
  also on previous/next. `editing()` is `true` while a rename or new-folder
  form is open or the text editor holds unsaved text. The lifecycle is the common one
  ([Calendar and DiagramEditor](#calendar-and-diagrameditor)): `destroy()`
  also closes the windows it opened, removes its document and upload
  listeners and aborts its pending reads (writes already sent complete).
  Theme and skin changes apply through the Suite variables.
- **FilePicker.** `field` is a `file` field's `FieldMetadata.file` (as
  `app.server.form` or a list action describes it), `title` the field label
  (`Fájl kiválasztása: {title}`), `current` a preselected file id. The picker
  lists the field's folder (`folder_id`, otherwise the mount root) with
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
  variables, so Skyblue, light, dark and skins apply without code.
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
  "options": {"loop": true}, "open": "window", "group": "Signage", "icon": "dxi dxi-play", "desktop_only": false}}}
```

`View` validates: id, `kind` (a built-in name or a dotted project kind),
non-empty `title`/`group`, resource and record names, unique action names
(only with a resource), icon classes, `open` = `page` or `window`. Existence of
actions, the record resource's `get` and the kind provider is checked by
`addView`.

PHP signatures (`packages/php/src/Feature/Registry.php`, `SqlResource.php`,
`packages/php/src/Shell/ApplicationDefinition.php`):

```php
// Blade\Feature\Registry
public function addView(View $view): View;
public function kind(string $kind, ViewKindProvider $provider): void;   // dotted, before its views; duplicate throws
public function view(string $resource, string $title, array $columns, array $actions, /* … */
    string|array|null $activate = null, ?string $id = null, array $commands = []): View;
public function fileManager(/* … */, ?string $id = null): View;
public function diagram(/* … */, ?string $id = null): View;
public function calendar(/* … */, ?string $id = null): View;
public function subview(string $view, string $child, string $field, bool $embed = true, bool $select = true): void; // view ids
public function appendViewActions(string $view, array $actions): void;  // view id
/** @return list<View> */ public function views(): array;
public function viewById(string $id): ?View;
// Blade\Feature\SqlResource
public function register(Registry $registry, string $title, /* … */ string|array|null $activate = null, ?string $id = null, array $commands = []): View;
// Blade\Shell\ApplicationDefinition: constructor parameters
/** @param list<string> $modules */ public array $modules = [],
/** @param list<string> $stylesheets */ public array $stylesheets = [],
public ?string $documentRoot = null,
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

**Duplicate view ids:** a later declaration with the same id replaces the
earlier one at definition time, as `Registry::view()` did before view ids (allflow
declares `Registry::view('customers', …)` after `SqlResource::register()` and
relies on it). The replacement keeps the first declaration's menu position (PHP
array order, unchanged behaviour) and replaces the whole earlier view,
including a sub-view attached before it, so attach sub-views after the final
declaration. Registering a client view **kind** twice is an error unless
`{replace: true}`; `Registry::kind()` has no replace. Accepted at G1.

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
- Legacy alias: `#feature=<resource>` resolves to the view whose id equals that
  resource and the shell rewrites the hash to `#view=<id>` with
  `history.replaceState` (other parameters kept). Delivered e-mails such as
  `/admin/#feature=inquiries` keep working ([O3](#resolved-decisions)).
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
has no menu entry. `open: "page"` (default) mounts it in the workspace with an
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
`"activate": {"field": "file_id", "map": {"audio": "view:demo.asset-viewer", "video": "view:demo.asset-viewer", "*": "details"}}`.

- Values per entry: the existing `details`, `subview`, `page`, a record action
  of the view, or the new `view:<id>` (a record view whose `record` is the
  list's resource). A plain string keeps today's meaning.
- The client chooses per row by the string value of `field`; `*` is the
  default; no match and no `*` keeps the default behaviour. A media field (a
  `file` field or a `column.media` field, whose row carries `_media[field]`)
  is keyed by its file's MIME class (`image`, `video`, `audio`, …), not by the
  file id; a row without a file, or with one the actor may not see
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
| | `activate` | `{row, target}` | double-click or Enter resolved to `target` (after the activation map and its fallbacks), before it runs; `details` also for a card or tile without a target and for the `#` cell |
| | `saved` | `{action, row}` | a form of the list (create, update, record action with fields, singleton Save) or an inline cell or card edit (`action` `update`) saved; `row` is the server's answer |
| | `changed` | `{rows, total?, matched?}` | the loaded window changed (load, scroll window, filter, live update, delete, revocation) |
| `RecordForm` | `saved` | `{action, result}` | `submit` (or the submit button) succeeded |
| | `cancel` | `{}` | Cancel was pressed |
| | `changed` | `{field, value}` | a field value was committed (on leaving the field) |
| `CommandBar` | `click` | `{id}` | an item was clicked, also from the collapsed `Műveletek` menu |
| `FileManager` | `opened` | `{id, mime_type}` | the viewer or text editor showed a file, also on previous/next |
| `DiagramEditor` | `saved` | `{}` | the open diagram's content was saved (`Mentés`, Ctrl+S) |
| `MediaPlayer` | `loaded` | `{duration, width?, height?}` | the metadata is known (`duration` 0 for images) |
| | `position` | `{seconds}` | every 250 ms while playing, on pause and after a completed seek |
| | `ended` | `{}` | the media element ended (never while looping) |
| | `error` | `{message}` (localized) | the source cannot be shown or played |
| `SandboxFrame` | `ready` | `{}` | the code's top-level evaluation completed |
| | `error` | `{message, code}` | as `sandbox:error` (the frame's `message` is untrusted text) |
| | `message` | `{type, payload}` | a project message from the frame (untrusted) |

`RecordDetails` and `Calendar` have no events; `FilePicker.pick` resolves a
promise instead.

<a id="layout-recipe"></a>

## Layout and ViewHost recipe

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

<a id="pitfalls"></a>

### Pitfalls

- **`attachHTML` then `attach` in one cell renders empty.** A painted Suite
  Layout cell that first showed `attachHTML` markup and is then given a widget
  with `attach()` shows nothing: the widget's markup is wiped. Let a cell hold
  either markup or widgets for its whole life. Content that alternates between
  a notice and a widget gets a fresh one-cell box Layout per content, attached
  to the outer cell, with the notice or widget in the box's cell
  ([scene stage example](#example-sandbox)).
- **Elements into cells.** No public API puts an `HTMLElement` into a Layout
  cell except `ViewHost.attach` (which wraps it). Use instead: the element
  target of a component's `mount(target)` (an element with a height), a
  nested Layout for widgets, or `attachHTML` for static markup whose events
  are delegated and released with the build's signal.
- **Suite Form `container` is PRO-only.** 61ade ships Suite Standard 9.3.12;
  a custom Form control is composed from Standard items (the demo's star strip
  is a `togglegroup`).
- **Suite `togglegroup` has no `aria-pressed`.** A pressed toggle is marked
  only by class and text; keep a labelled standard input as the accessible
  control of the value ([field type example](#example-tasks)).
- **Suite Slider has no ARIA role or value.** Its thumb is not announced;
  show the value as text as well (the playlist's `Pozíció` command bar item)
  and offer another keyboard route.
- **`sandbox:error` names no frame.** A page with several frames, or one that
  replaces its frame, either listens to each component's own `error` event or
  checks that the frame it tracks is still the current one before acting.
- **The held definition's id decides preferences.** A `ListView` keys saved
  mode, sort, columns and filters by the id of the definition it gets; give a
  page its own state by passing the definition under the page's view id
  ([ListView](#listview)).

<a id="conventions"></a>

## Naming conventions

Existing names stay as they are (no renames in API version 1):

- **Event tense is mixed:** `select`, `activate`, `cancel` and `click` are
  present tense, `saved`, `changed`, `opened`, `loaded` and `ended` past
  tense; the uploader's page event is `upload:cancelled`.
- **View option casing follows the kind:** `ListKindOptions` and `DiagramKindOptions`
  are camelCase (`rowHeight`, `nodeTypes`), `FilesKindOptions`,
  `CalendarKindOptions` and `UploadPolicy` snake_case (`max_depth`,
  `default_view`, `max_size_bytes`).
- **Column keys are passed through as declared:** `ColumnMetadata` may carry
  `imageBase` or `image_base`, `altOf` or `alt_of`, `mediaOf` or `media_of`;
  a presentation that reads them reads both spellings.
- **`app.views` registers view kinds**, not views; the views offered to the
  actor are `app.viewDefinitions()` and `app.viewDefinition(id)`.

<a id="limits"></a>

## Limits

Owner decisions of 2026-10-30 (gate G4): not planned in 61ade; a project that
needs one builds it in its own module.

- `ListView` has no `marked` event or method; a page follows the cursor record
  (`select`) and the loaded window (`changed`), and commands see the marks.
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
      { id: "play", label: t("Lejátszás"), icon: "dxi dxi-menu-right", disabled: true, hidden: !timed },
      // …
    ] });
    bar.mount(layout.getCell("commands"));
    bar.on("click", ({ id }) => {
      if (id === "back") { if (!app.navigate({ view: listId })) host.close(); return; }
      if (!player) return;
      if (id === "play") void player.play().catch(() => {});
      else if (id === "pause") player.pause();
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
  `toolkit-demo-tasks` (`.spec.cjs`); regressions `browser`, `preferences`,
  `activation`.

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

Unchanged: the `?blade=1` action endpoint, the `__form` pseudo-action, the
`#blade-config` `csrf` key, the `list` action's `data.items`,
`Registry::add(new Action(…))`, `Skin`, `[data-blade-skin]` and `--dhx-*`
variables, `packages/php/migrations` and the `Access\Schema` tables of an
application without tenancy (no schema step), no third-party PHP dependency.
CSS on framework classes such as `.blade-navigation-row` (used by StoryBloX)
remains outside the supported contract and is not renamed by the toolkit work.

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
   Also check that a menu page shows `#view=<id>`, that an old
   `#feature=<resource>` address opens the same page and is rewritten (M1), and
   that `Adatok` and the record actions sit in the list toolbar (M10).
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

<a id="resolved-decisions"></a>

## Resolved decisions O1–O11

Open questions of the [toolkit plan](toolkit-plan.md#3-fixed-decisions-and-open-decisions),
resolved with the recommended defaults and the P0 consumer inventory.

| # | Resolution | Rationale |
| --- | --- | --- |
| O1 | Dependency injection: the shell `import()`s declared modules and calls each default export with `Application`; no import map; types from `admin.d.ts`. | An inline import map needs a CSP hash or nonce; `admin.js` is loaded with `?v=`, so importing it by URL would create a second instance. |
| O2 | Plain ES modules accepted; TypeScript recommended, built by the project ([recipe](#typescript-recipe)); the feature demo uses TypeScript built by `tools/build.mjs`. | No build requirement for small modules; types without a second runtime. |
| O3 | View `id` (`[a-z][a-z0-9_.-]*`, unique) independent of `resource`, default = resource. `#view=` is canonical; `#feature=<resource>` stays a legacy alias rewritten with `replaceState`; menu ids `view:<id>`; later same-id declarations replace earlier ones. | allflow has delivered e-mails with `/admin/#feature=…` and relies on `Registry::view()` replacing the `SqlResource` view; default ids keep preference keys valid. |
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
   earlier one and keeps its menu position ([rule](#view-id-rule)); a client
   view kind registered twice is an error unless `{replace: true}`.
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

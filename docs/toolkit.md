# Toolkit API: project modules, views and components

Status: **kernel (P2) and components (P3) implemented, 2026-10-29**
([FB-0081](feedback.md#fb-0081)). Implemented: project modules and stylesheets,
the `app` services, the registries, built-in view kinds through the `views`
registry, view ids, `#view=` routing with the `#feature=` alias, record views,
the activation map (server and per-row client choice), and the components
`ListView`, `RecordForm`, `RecordDetails`, `CommandBar`, `FileManager`,
`FilePicker`, `Calendar`, `DiagramEditor`, `MediaPlayer` and `SandboxFrame`,
the presentation, field-type and command registries in lists, plus `admin.d.ts` and the
sandbox document. Sections still marked **planned** are not implemented.
The owner accepted this contract at gate G1 on 2026-10-29
([decisions](#decisions-at-gate-g1)); changes need a recorded reason in
[changes](#changes).

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
  `admin.css` as today.
- Modules and stylesheets are same-origin files below the application's public
  directory (CSP `script-src 'self'`, `style-src 'self'` unchanged).
- Optional for TypeScript: `dist/admin.d.ts` (implemented — P3 C-6) and the
  `@dhtmlx/suite` 9.3.12 types it references.
- `SandboxFrame` additionally needs `dist/sandbox.html` and `dist/sandbox.js`
  deployed beside `admin.js` (implemented — P3 C-4).

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
  definition time. Without an explicit cache key the shell appends
  `?v=<version>` when `version` is not empty.
- **Naming:** `application.modules` are browser ES modules;
  `workspace.modules` remain the JSON definition files of
  [configuration](configuration.md#belépés-és-alkalmazásszekciók).
- **When:** only in the signed-in shell. The sign-in, e-mail confirmation and
  password-change pages load neither modules nor stylesheets (as with skins).
  Stylesheets are linked after the framework CSS and skins.
- **Order:** the shell `import()`s all modules in parallel and calls their
  default exports one by one in declaration order with the page's
  `Application`, then routes. A failed import, a throw, a rejection or an
  initialization longer than 5 s is reported (toast, `module:error` event,
  console) and skipped; the shell always starts. Registrations made before the
  failure stay.
- **One instance:** a module never imports `admin.js` (the shell loads it with
  `?v=`, so a second import would be a second bundle). It gets everything from
  `app` and imports only types.

<a id="api-reference"></a>

## API reference

Source of truth: `packages/frontend/src/api/types.ts` (doc comments state
ownership, lifecycle and error behaviour of every member). This section lists
each member with one example.

### Application

| Member | Purpose | Wraps today | Phase |
| --- | --- | --- | --- |
| `apiVersion` | `1` ([O11](#resolved-decisions)) | — | P2 |
| `dhx` | The Suite namespace the shell uses (one instance, Standard edition) | `@dhtmlx/suite` import of the bundle | P2 |
| `server` | Action calls, raw responses, `__form`, GET URLs | six private `fetch` transports, `ActionUrl.ts` | P2 K-F1 |
| `ui` | `dialog`, `choice`, `toast`, `window` | `MessageDialog.ts`, Suite `message`, `WindowSizing.ts` | P2 K-F2 |
| `uploads` | `open`, `reopen` of the shared uploader | `Uploader.ts` `uploads` | P2 K-F2 |
| `i18n` | `t`, `locale`, `languages` | `I18n.ts` | P2 K-F2 |
| `theme` | `current`, `skin`, `onChange` | AdminShell theme/skin handling | P2 K-F2 |
| `preferences` | `scope(name)` → `get/set/remove` | `UiPreferences.ts` storage | P2 K-F2 |
| `live` | `subscribe(resource, query, handlers, signal)` | `LiveChannel`/`Realtime` | P2 K-F2 |
| `events` | Typed bus `on/off/emit` (`upload:*`, `view:*`, `module:error`, `sandbox:error`, project events) | uploader `on/off` | P2 K-F2 |
| `identity` | `id`, `displayName`, `tenant` | bootstrap `userId`, `displayName`, `tenant.current` | P2 K-F2 |
| `views`, `presentations`, `fieldTypes`, `commands` | [Registries](#registries) | hard-coded `AdminShell.openView`, `RecordPresentation` | P2 K-F3 / P3 C-5 |
| `components` | [Components](#components) | `Workspace`, `FileManager`, … | P3 |
| `viewDefinitions()`, `viewDefinition(id)` | Views offered to the actor | bootstrap `views` | P2 |
| `navigate(target)` | Opens a view like a menu click; `false` if not offered | `AdminShell.openView` | P2 K-F4 |

### Services

```ts
const rows = await app.server.call<Snapshot>("tasks", "list", { values: { limit: 50 }, signal: host.signal });
const blob = await (await app.server.request("files", "content_get", { id })).blob();
const { fields, values } = await app.server.form("tasks", "update", id);       // `__form` pseudo-action
audio.src = app.server.url("signage_assets", "content_stream", id, revision);  // GET action, session cookie
if (await app.ui.dialog({ message: app.i18n.t("Biztosan?"), mode: "confirm", severity: "warning" })) { /* … */ }
const choice = await app.ui.choice({ message: "…", choices: [{ value: "a", label: "A" }] });
app.ui.toast(app.i18n.t("Másolva."));
const win = app.ui.window({ title: "Előnézet", width: 720, signal: host.signal }); win.attach(layout);
app.uploads.open({ resource: "files", action: "upload", target: folderId, targetLabel: "Drive A:/", policy });
app.i18n.t("{count} elem", { count: 3 }); app.i18n.locale();
const stop = app.theme.onChange((theme, skin) => chart.paint());
app.preferences.scope("demo.player").set("volume", 0.8);
const sub = app.live.subscribe("measurements", { limit: 100, sort: { field: "id", direction: "desc" } },
  { update: snapshot => render(snapshot.items) }, host.signal);
app.events.on("upload:complete", result => refresh(), host.signal);
app.navigate({ view: "demo.asset-viewer", record: "42" });
```

Errors: `server.*` rejects with `ServerFailure` (`status`, localized
`message`, `fieldErrors`, optional `details`; status 0 for a network
failure or a 2xx answer without JSON; an error answer keeps its HTTP status) or the platform `AbortError`; it never retries. 401 means
the session ended; the shell's behaviour for it is unchanged. Event handlers
that throw are logged and do not stop other handlers; emitting a framework
event name (with `:`) throws.

<a id="uploads"></a>

#### Uploads (implemented — P3 C-2)

`app.uploads` is the page's one [uploader](uploader.md) (`Uploader.ts`): the
same window, queue, lower-bar indicator, conflict dialog and resume as the file
manager, list upload commands and `file` fields. A project never builds another
upload dialog.

```ts
const policy = (app.viewDefinition("files")!.options as FileManagerOptions).upload.policy;
// (a list view's upload action carries its own: view.actions.find(action => action.upload)?.upload)
const target = { resource: "files", action: "upload", target: folderId, targetLabel: "Drive A:/Képek", policy };
app.uploads.open({ ...target, onUploaded: ({ succeeded }) => refresh(succeeded) });   // once per batch
surface.addEventListener("drop", event => { event.preventDefault();
  app.uploads.open({ ...target, transfer: event.dataTransfer! }); });                 // synchronously in the drop handler
app.events.on("upload:file-done", ({ file, result }) => show(file.name, result), host.signal);
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

### Registries (implemented — P2 K-F3, P3 C-5)

`Registry<T>`: `register(name, entry, {replace?})`, `get`, `has`, `names`.
Names are `[a-z][a-z0-9_.-]*`; built-in names have no dot, project names must
contain one (`demo.player`). A duplicate name throws unless `replace: true`,
which is also how a project deliberately overrides a built-in. Register during
module initialization (modules run before the first view opens). A list,
record details or form reads the registries when it is created, so a later
registration affects only surfaces created after it.

| Registry | Built-in entries (61ade dogfoods them) | Declared on the server by |
| --- | --- | --- |
| `views` | `list`, `files`, `diagram`, `calendar` | the view `kind` |
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
app.views.register("demo.asset-viewer", { create: (host, view) => mountViewer(host, view) });
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
  label: "Másolás szövegként", icon: "dxi dxi-content-copy", placement: "both",
  enabled: ({ row }) => !!row,
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

- **View kind** `create(host, view)` returns a `ViewInstance` (`destroy`,
  optional `editing`, `refresh`). `ViewHost` gives `app`, `signal` (aborted when
  the view closes), `open` (`page`/`window`), `record` (`{resource, id, row}`
  for record views), `filters`, `attach`, `setTitle`, `close`. A throw shows the
  error dialog and leaves an empty workspace.
- **Presentation** (`column.presentation`): a synchronous HTML renderer per
  value and size: `cell` (table), `card` (card fields and the record details,
  also `RecordDetails`) and `tile` (the tile's secondary line; the tile title
  uses `text`, else the plain value). It must escape every record value with
  the given `escape`. A presentation wins over a field type's `display`. The
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
- **Client command** (`ListOptions.commands`): `label` (source text,
  translated), `icon`, `placement`, `enabled`, `run`. `toolbar` commands sit in
  the list's command bar after the view's actions (and move into the
  `Műveletek` menu like them); `record` commands form the **record menu**, the
  native Suite context menu of a row, card or tile (right click, the context
  menu key or Shift+F10; the record becomes the cursor first); `both` is in
  each, the choice for anything that must be reachable on touch devices.
  The context has `app`, `view` (as the server sent it), `row` (the record of
  the menu, or the toolbar's record), `rows` (the marks) and `signal` (aborted
  when the list closes). `enabled` is evaluated whenever the toolbar record,
  marks or rows change and when the record menu opens; default: always on the
  toolbar, with a record in the record menu; a throw disables the command. A
  disabled command does not run. A throw or rejection of `run` shows the error
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
  `details` command; the list renders and enables them through the registries
  exactly like project entries (`src/app/registries.ts`). Checks:
  `node tests/shell/toolkit-registries.mjs`, `php8.4 tests/shell/toolkit.php`,
  `tests/shell/toolkit-registries.spec.cjs`.

<a id="components"></a>

### Components

Every component has `layout` (its root Suite Layout), `mount(target)` (an
element, a Layout cell, an `AppWindow` or a `ViewHost`), idempotent
`destroy()` (widgets, windows it opened, listeners, live subscriptions), typed
`on(event, handler)`, and accepts `signal` to destroy itself with its owner.

```ts
const C = app.components;
const list = new C.ListView({ view: "measurements", filters: { sensor: "3" }, signal: host.signal });  // C-1
list.on("select", ({ row }) => chart.show(row)); list.mount(layout.getCell("list"));
const form = new C.RecordForm({ resource: "tasks", action: "update", id, signal: host.signal });      // C-1
form.on("saved", () => win.close());
const details = new C.RecordDetails({ view: "signage_assets", record: host.record!.row });            // C-1
new C.FileManager({ view: "files" }).mount(host);                                                      // C-2
const file = await C.FilePicker.pick({ field: fileField, title: "Kép" });                              // C-2
new C.Calendar({ view: "events" }).mount(host);                                                        // C-2
new C.DiagramEditor({ view: "diagrams" }).mount(host);                                                 // C-2
const player = new C.MediaPlayer({ source: { resource: "signage_assets", action: "content_stream", id }, mime: "audio/mpeg" });
player.on("position", ({ seconds }) => timeline.move(seconds)); player.mount(layout.getCell("stage"));  // C-3
const frame = new C.SandboxFrame({ signal: host.signal }); await frame.load(code, { "tone.wav": blob }); // C-4
const bar = new C.CommandBar({ items: [{ id: "play", label: "Lejátszás", icon: "dxi dxi-play" }] });   // C-1
bar.on("click", ({ id }) => id === "play" && player.play());
```

| Component | Wraps | Events / methods |
| --- | --- | --- |
| `ListView` | `Workspace` (split into `src/components/list/*`) | `select`, `activate`, `saved`, `changed`; `editing`, `refresh`, `selected`, `setFilters` |
| `RecordForm` | workspace action forms, `FormValidation`, `FileFields` | `saved`, `cancel`, `changed`; `submit`, `values`, `dirty` |
| `RecordDetails` | the `Adatok` details (`recordFields`) | `show(row \| id)` |
| `FileManager`, `FilePicker` (**implemented**, [below](#filemanager-and-filepicker)) | `components/files/*` over `FileManager.ts`, `FilePicker.ts` | `opened`; `pick()` resolves a `MediaDescriptor` or `null` |
| `Calendar`, `DiagramEditor` (implemented) | `components/calendar/CalendarView.ts`, `components/diagram/DiagramView.ts` | Calendar: none; DiagramEditor: `saved`; `editing` |
| `MediaPlayer` (**implemented**, [below](#mediaplayer)) | `components/media/MediaPlayer.ts`, extracted from the file manager viewer, plus audio | `loaded`, `position`, `ended`, `error`; `play`, `pause`, `seek`, `position`, `duration`, `focus` |
| `SandboxFrame` | new | `ready`, `error`, `message`; `load`, `post` |
| `CommandBar` | `ResponsiveToolbar` (`Műveletek` collapse) | `click`; `update(id, changes)` |

The list components below are **implemented (P3 C-1, 2026-10-29)** in
`packages/frontend/src/components/list` and offered as
`app.components.ListView`, `RecordForm`, `RecordDetails` and `CommandBar`
(the other components have their own subsections). Common rules: `mount(target)`
takes an element (filled at 100 %), a Layout cell, an `AppWindow` or a
`ViewHost`; a window or view host destroys the component when it closes, and
the `signal` option does the same. `destroy()` is idempotent, detaches the
component from the cell it was mounted in and releases its widgets, the
windows it opened, its requests and its live subscription. Handlers registered
with `on` run in registration order (a throwing one is logged); events are
delivered only while the component is mounted and never after `destroy()`.

<a id="listview"></a>

#### ListView (implemented)

The framework list of one list view: table, cards and tiles, header filters
and the filter panel, search, the view's action forms and bulk commands,
details, sub-views, live updates and the user's saved mode, sort, columns and
filters (keys by view id, as for a menu page). The built-in `list` kind is this
component mounted in the view host.

```ts
const list = new app.components.ListView({ view: "demo_measurements", signal: host.signal });
list.on("select", ({ row }) => chart.show(row));
list.on("changed", ({ rows, matched }) => summary.update(rows, matched));
list.mount(layout.getCell("list"));
```

- `view`: an offered view id or a `ViewDefinition` of kind `list`; anything
  else throws `TypeError`. `filters` replaces the saved filter values once
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

<a id="recordform"></a>

#### RecordForm (implemented)

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

- `submit()` resolves the action's result. A client validation failure sends
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

#### RecordDetails (implemented)

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

#### CommandBar (implemented)

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

Labels are plain text (escaped). Ids match `[A-Za-z0-9_.:-]+`, are unique and
`blade-command-menu` is reserved; otherwise the constructor throws
`TypeError`. `update(id, changes)` changes the label, icon, disabled or hidden
state, also while the item sits in the collapsed menu. `toolbar` is the
underlying Suite Toolbar.

<a id="calendar-and-diagrameditor"></a>

#### Calendar and DiagramEditor (implemented — P3 C-2)

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
  `CalendarOptions`/`DiagramOptions` shape (`TypeError` otherwise). What the
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
  `Calendar` has no events.
- Theme and skin changes repaint live (the Scheduler switches between its
  `terrace` and `dark` skins); a language switch reloads the page, so
  components are created again in the new language.

<a id="filemanager-and-filepicker"></a>

#### FileManager and FilePicker (implemented — P3 C-2)

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
  `FileManagerOptions` shape with at least one mount (`TypeError` otherwise).
  Panels, mounts, upload (window, drop, paste), the viewer on
  [`MediaPlayer`](#mediaplayer) with previous/next, the text editor, the
  conflict and delete dialogs behave as in the built-in view and follow the
  view's `actions`; the server checks every call. `opened` (`{id,
  mime_type}`) fires each time the viewer or the text editor shows a file,
  also on previous/next. The lifecycle is the common one
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

#### MediaPlayer (implemented — P3 C-3)

`app.components.MediaPlayer` shows an image, a video or an audio file. The file
manager's viewer is the same component ([files](files.md#media-player)).

```ts
const player = new app.components.MediaPlayer({
  source: { resource: "signage_assets", action: "content_stream", id: host.record!.id },
  mime: String(host.record!.row.mime_type),       // image/*, video/* or audio/*; anything else throws TypeError
  name: String(host.record!.row.title),           // accessible name, image alt, audio stage title
  loop: true, signal: host.signal,                // destroyed with the view
});
player.on("loaded", ({ duration }) => timeline.setLength(duration));
player.on("position", ({ seconds }) => timeline.move(seconds));
player.mount(layout.getCell("stage"));
bar.on("click", ({ id }) => id === "play" ? void player.play() : id === "pause" && player.pause());
```

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
  `0 … duration()`. The media methods do nothing for images.
- **Lifecycle.** `mount(target)` takes an element, a Layout cell, a Suite
  Window, an `AppWindow` or a `ViewHost`. The last two, and `signal`, destroy
  the player when they close. Mounting twice or after `destroy()` throws.
  `destroy()` is idempotent: it pauses, empties the element, revokes its
  object URL, removes its listeners and observers, and destructs its widgets.
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
as elsewhere); `resources.<name>.view` gains only `id` and the
[activation map](#activation-map):

```json
{"views": {"demo.asset-viewer": {"kind": "demo.asset-viewer", "title": "Médianéző",
  "resource": "signage_assets", "record": "signage_assets", "actions": ["get", "content_stream"],
  "options": {"loop": true}, "open": "window", "group": "Signage", "icon": "dxi dxi-play", "desktop_only": false}}}
```

`View` validates (implemented, unused): id, `kind` (a built-in name or a
dotted project kind), non-empty `title`/`group`, resource and record names,
unique action names (only with a resource), icon classes, `open` = `page` or
`window`. Existence of actions and the kind provider is checked by `addView`.

Planned PHP signatures (lane K-S; files not changed in P1):

```php
// Blade\Feature\Registry
public function addView(View $view): View;
public function kind(string $kind, ViewKindProvider $provider): void;   // duplicate kind throws
public function view(string $resource, string $title, array $columns, array $actions, /* unchanged … */
    string|array|null $activate = null, ?string $id = null): View;      // was void
public function fileManager(/* unchanged … */, ?string $id = null): View;
public function diagram(/* unchanged … */, ?string $id = null): View;
public function calendar(/* unchanged … */, ?string $id = null): View;
public function subview(string $view, string $child, string $field, bool $embed = true, bool $select = true): void; // view ids
public function appendViewActions(string $view, array $actions): void;  // view id
/** @return list<View> */ public function views(): array;
public function viewById(string $id): ?View;
// Blade\Feature\SqlResource
public function register(Registry $registry, string $title, /* unchanged … */ string|array|null $activate = null, ?string $id = null): View;
// Blade\Shell\ApplicationDefinition: new constructor parameters
/** @param list<string> $modules */ public array $modules = [],
/** @param list<string> $stylesheets */ public array $stylesheets = [],
```

- The builders keep their parameters; `id` defaults to the resource, so
  existing declarations, `subview()` and `appendViewActions()` calls keep
  working. Their option payloads move into `View::$options`.
- `ViewKindProvider` (implemented, unused) has `validate(Registry, View)` at
  definition time and `metadata(Context, View): ?array` per bootstrap (`null`:
  not offered). Built-in providers replace the `kind` branches of
  `Workspace::views()`; a project kind without its own provider uses the
  generic one: it offers the view when the actor is offered at least one of its
  actions (none declared: always) and passes `options` through after a
  JSON-safety (scalars, lists, maps) and size check (proposed 64 KiB encoded).
  `metadata` deliberately returns `?array` rather than `array`, matching
  today's `fileView`/`diagramView`/`calendarView`.
- `record` is accepted for project kinds in P2; built-in kinds reject it.

<a id="view-id-rule"></a>

**Duplicate view ids:** a later declaration with the same id replaces the
earlier one at definition time, as `Registry::view()` does today (allflow
declares `Registry::view('customers', …)` after `SqlResource::register()` and
relies on it). The replacement keeps the first declaration's menu position (PHP
array order, unchanged behaviour) and replaces the whole earlier view,
including a sub-view attached before it, so attach sub-views after the final
declaration. Registering a client view **kind** twice is an error unless
`{replace: true}`; `Registry::kind()` has no replace. Accepted at G1.

**Bootstrap shape:** today's top-level keys map as follows; nothing else
changes and all texts stay server-translated.

| Today | Toolkit `ViewDefinition` |
| --- | --- |
| `resource` | `resource`, and `id` (default) |
| `kind` (`files`/`diagram`/`calendar`; absent = list) | `kind`, always set (`list` explicit) |
| `title`, `group`, `icon`, `desktopOnly`, `actions` | unchanged, top level |
| list keys `columns`, `detailFields`, `filters`, `sortable`, `layout`, `singleton`, `rowNumbers`, `selection`, `rowSelection`, `rowHeight`, `tileMinWidth`, `tiles`, `activate`, `search`, `subview` | `options.*` (`ListOptions`) |
| `files`, `diagram`, `calendar` | `options` (`FileManagerOptions`, `DiagramOptions`, `CalendarOptions`) |
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
a record action, `app.navigate({view, record})` or the address. A record view
has no menu entry. `open: "page"` (default) mounts it in the workspace with an
address and history entry; `open: "window"` opens a framework document window
(full screen below 768 px) without an address change. The view is offered only
when the actor is offered the record resource's `get`; a `get` failure (403,
404) shows the shared error dialog and keeps the current view; a navigation
without a record id opens nothing.

<a id="activation-map"></a>

## Activation map (client per-row choice: implemented, P3 C-1)

```php
$source->register($registry, 'Médiatár', tiles: true,
    activate: ['field' => 'kind', 'map' => ['audio' => 'view:demo.asset-viewer', 'video' => 'view:demo.asset-viewer', '*' => 'details']]);
```

JSON: `"activate": {"field": "kind", "map": {"audio": "view:demo.asset-viewer", "*": "details"}}`.

- Values per entry: the existing `details`, `subview`, `page`, a record action
  of the view, or the new `view:<id>` (a record view whose `record` is the
  list's resource). A plain string keeps today's meaning.
- The client chooses per row by the string value of `field`; `*` is the
  default; no match and no `*` keeps the default behaviour.
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

## Sandbox protocol (implemented — P3 C-4; Chromium verification pending)

`SandboxFrame` (`src/components/sandbox/SandboxFrame.ts`) creates
`<iframe sandbox="allow-scripts" credentialless referrerpolicy="no-referrer"
src="<admin.js directory>/sandbox.html?<admin.js cache key>">`: an opaque origin
with no cookies, storage, session, CSRF token or same-origin access. The
document's address is derived from `admin.js` (`import.meta.url`) on the
first `load()`, so the two sandbox files must sit beside it. Without a usable
`import.meta.url` (a bundle that is not an ES module) creating the application
or the component still works and `load()` rejects with a clear error. Messages use `postMessage` with the
envelope `{blade: 1, id, type, payload}` (`SandboxMessage`; `id` 1–64
characters, unique per sender: `p1…` from the parent, `f1…` from the frame).

| Direction | `type` | Payload |
| --- | --- | --- |
| parent → frame | `load` | `{code, files}`: untrusted script source and named data (Blobs or strings); sent once, on the frame's first `load` event |
| frame → parent | `ready` | `{}` after the code's top-level evaluation (and its returned promise, if any) completed |
| frame → parent | `error` | `{message}`: a throw, rejection, later uncaught error or protocol violation (at most 1000 characters) |
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
  anything else except what the project passes to `load` and `post`.
- **Frame checks** (`dist/sandbox.js`, a classic script built from
  `src/sandbox/bootstrap.ts`): only messages whose `source` is `window.parent`;
  one `load` per document; `ready`/`error` from the parent are protocol errors.
  Opened directly (not framed) the document stays inert. The code runs from a
  `blob:` classic script of the frame only ([O7](#resolved-decisions)) as the
  body of an async function; `blade.on(type, handler)`, `blade.post(type,
  payload)` and `blade.files` (name → `blob:` URL or string, frozen) are its API.
- **Limits** (G1 values confirmed): code 1 MiB UTF-8 (`maxCodeBytes`), files
  32 MiB in total (`maxFileBytes`, Blob sizes plus UTF-8 string sizes),
  `ready` within 10 s of `load()` (`readyTimeout`). A size violation rejects
  before anything is sent and keeps the current frame; a timeout removes the
  frame. Both raise `error` (`size`, `timeout`) and `sandbox:error`.
- **Lifecycle:** `load()` resolves on `ready` and rejects with an `Error` whose
  `code` is the event code, or with an `AbortError` when a later `load()` or
  `destroy()` replaces it; each `load()` creates a fresh frame document.
  `post()` throws before `ready` and does nothing after `destroy()`. A second
  `load` event of the iframe (the code navigated or reloaded the frame, or the
  frame was moved in the DOM) is a `protocol` error and removes the frame.
  `destroy()` removes the frame at once (kill switch), rejects a pending load
  and releases the Layout and listeners; `signal` calls it.
- **Meta CSP of `sandbox.html`** (exact text):
  `default-src 'none'; script-src 'self' blob:; style-src 'unsafe-inline' blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'`.
  `'self'` is the URL origin of `sandbox.html` (needed for `sandbox.js`); the
  opaque origin sends no cookies with such script requests (SameSite=Lax
  session cookie, `credentialless` in Chromium). `fetch`, XHR, WebSocket,
  EventSource, beacons, images and frames to any host are blocked; forms and
  pop-ups are blocked by the sandbox flags.
- **Shell CSP unchanged:** `Shell/Application.php::headers` sends no
  `frame-src`/`child-src`, so `default-src 'self'` already admits the
  same-origin `sandbox.html`; no PHP change. The managed host serves static
  files with `X-Frame-Options: SAMEORIGIN`, which permits this same-origin
  embedding; the browser spec confirms both on the managed URL.
- **Limits of the isolation** (security review: P7): the frame can always
  navigate itself (a frame navigation may carry the Lax session cookie where
  `credentialless` is not supported) and use WebRTC, so it can leak what it
  was given: never pass it data the actor
  may not see. Where the browser keeps a sandboxed frame in the parent's process,
  a busy loop in the code also blocks the page; the timeout cannot interrupt it.
- **Verification:** `node tests/shell/toolkit-sandbox.mjs` (envelope, limits,
  both protocol sides with fake windows) passes; `npm run test:browser --
  tests/shell/toolkit-sandbox.spec.cjs` (opaque origin, no cookie, storage or
  parent access, CSP-blocked network, round trip, forged messages, error,
  timeout, navigation, destroy) is written and still has to run in Chromium.
  Network egress is judged by what reaches Playwright's `route()` (the network
  layer), not by `request` events: Chromium also reports image, XHR,
  EventSource and script loads that Blink blocked by CSP before sending them
  (DevTools "blocked:csp").

<a id="packaging"></a>

## Packaging (implemented — P3 C-4, C-6)

| File | Deployed by consumers | Notes |
| --- | --- | --- |
| `dist/admin.js`, `dist/admin.css` | yes (unchanged) | one ESM bundle, no chunks |
| `dist/admin.d.ts` | no | development only; declarations of `src/api/index.ts` (`tsc --emitDeclarationOnly` through the TypeScript API), joined with `./types` into one file |
| `dist/sandbox.html`, `dist/sandbox.js` | only when `SandboxFrame` is used | add to `.deploy.json` `shared_assets.files` beside `admin.js` |

`npm run build` (`tools/build.mjs`) writes all five files and
`packages/php/bin/live-server.mjs`; `node tools/build.mjs --check` builds them in
memory and fails on any difference. `packages/frontend/package.json` exports
`./admin.js`, `./admin.css`, `./admin.d.ts`, `./sandbox.html` and
`./sandbox.js`; `npm run demo:assets` copies the four runtime files. A
consumer that uses `SandboxFrame`:

```json
{
    "source": "/space/share/libs/61ade/packages/frontend/dist",
    "files": ["admin.js", "admin.css", "sandbox.html", "sandbox.js"],
    "target": "target:public/assets/61ade"
}
```

A project's own module files live in its public directory and are built by
the project.

<a id="typescript-recipe"></a>

## TypeScript and esbuild recipe (implemented — P3 C-6)

Checked with TypeScript 5.9.3 and esbuild 0.25.12 against the generated
`admin.d.ts`. The development link `public/assets/61ade` points at `dist`, so
the declarations are available there without being deployed.

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "lib": ["ES2022", "DOM"],
    "paths": {
      "@61ade/admin": ["./public/assets/61ade/admin.d.ts"],
      "@dhtmlx/suite": ["/space/share/libs/61ade/node_modules/@dhtmlx/suite"]
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
  app.views.register("demo.player", {
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

Import 61ade and Suite **types only** (`import type`): the bundle above
contains no import at all. A runtime import of `@dhtmlx/suite` or `admin.js`
would bundle a second instance; use `app.dhx` for Suite widgets. `admin.d.ts`
also declares `apiVersion` from `src/api/index.ts`; read it as
`app.apiVersion` at run time. The `@dhtmlx/suite` path may instead be a
devDependency of the same version.

## Verification

Contract only: `npm run typecheck` compiles `src/api/types.ts`, `node
tools/build.mjs --check` shows `admin.js`/`admin.css` unchanged, and `php8.4
-l` covers `View.php` and `ViewKindProvider.php`. Runtime verification follows
the [verification matrix](toolkit-plan.md#9-verification-matrix) per phase.

<a id="migration"></a>

## Migration (breaking changes known so far)

Consumers adapt themselves; 61ade sessions do not edit them. The per-consumer
handoff notes follow in P6. Neither StoryBloX nor allflow uses JSON modules,
the file manager, diagram, calendar or `blade-ui:` keys, and both copy only
`admin.js`/`admin.css` through `.deploy.json` `shared_assets`.

| # | Change | Phase | StoryBloX | allflow |
| --- | --- | --- | --- | --- |
| M1 | Address `#view=<id>`; `#feature=<resource>` is a rewritten legacy alias | P2 | `activate:'page'` navigations now show `#view=` | delivered mails with `/admin/#feature=inquiries`, `#feature=profile_requests` keep working |
| M2 | Menu item ids `feature:<resource>` → `view:<id>` | P2 | browser specs that address menu ids must update | same |
| M3 | Bootstrap `views` shape (kind keys under `options`, `id`/`kind` always set) | P2 | none known | none: tests read only `#blade-config` `csrf` |
| M4 | `Registry::view/fileManager/diagram/calendar` and `SqlResource::register` return `View`; new optional `id` | P2 | `register(… tiles, activate:'page')` unchanged | `Registry::view(resource, title, columns, actions, icon:)` ×3 unchanged; later declaration still replaces ([rule](#view-id-rule)) |
| M5 | `Registry::subview/appendViewActions` take view ids (default = resource) | P2 | `subview(…, embed:false)` unchanged | — |
| M6 | `stylesheets` replaces stylesheet injection | P2 | replace the output buffer in `public/admin/index.php` with `stylesheets` | — |
| M7 | `.deploy.json` `shared_assets.files` + `sandbox.html`, `sandbox.js` | P3 | needed for the scene player | not needed |
| M8 | Frontend internals (`Workspace` constructor etc.) are not a contract; use components | P3 | — | — |

Unchanged: `?blade=1` action endpoint, the `__form` pseudo-action, the
`#blade-config` `csrf` key, `Registry::add(new Action(…))`, `Skin`,
`[data-blade-skin]` and `--dhx-*` variables. CSS on framework classes such as
`.blade-navigation-row` (used by StoryBloX) remains outside the supported
contract and is not renamed by the toolkit work.

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
| 2026-10-29 | `app.components` is an empty frozen object until P3. | Components are P3 work. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | `ViewKindProvider::metadata()` returns `{actions, options}` or null instead of the options alone; shared helpers in `ViewMetadata`; generic action shape `{name,label,icon,write,bulk,get,confirm,fields,…}`. | Built-in kinds emit different action shapes today. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Signed-in bootstrap key `modules` (page-relative, versioned paths), present only when modules are declared; stylesheets are only `<link>`s after `admin.css` and skins. | The contract named no key. | [FB-0081](feedback.md#fb-0081) |
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
| 2026-10-29 | Commands: `record` placement is a native record menu (context menu on a row, card or tile; right click, menu key, Shift+F10), `toolbar` after the view's actions, `both` in each; `ListOptions.commands` is a server declaration (≤ 20 dotted names); the built-in Adatok is the `details` command (toolbar id `blade-command:details`). iOS Safari fires no `contextmenu`, so touch-relevant commands use `both`. | New list UI needed for record commands; to be confirmed by the owner. | [FB-0081](feedback.md#fb-0081) |
| 2026-10-29 | Field types: new field option `editor` (dotted name; not for secret, password, file or media fields) in `ColumnMetadata.editor`; a field-type column is edited in the edit window, never the native Grid editor; filters keep the storage type's input; a presentation wins over a field type's `display`. Only `image` moved onto the presentations registry (`icon` stays internal). | Server validation keeps the storage type. | [FB-0081](feedback.md#fb-0081) |

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
| O6 | Static `dist/sandbox.html` + `sandbox.js` with a meta CSP in `<iframe sandbox="allow-scripts">`; data and code by `postMessage`; `.deploy.json` grows by these files for `SandboxFrame` users. | Opaque origin: no cookies or CSRF; the shell CSP stays strict. |
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
   `resources.<name>.view` gains only `id` and the activation map.
5. **Module timeout and failure policy:** 5 s per module, report and continue.
6. **`modules` naming:** `application.modules` (browser) beside
   `workspace.modules` (JSON files) stays, explained in this guide.
7. **Proposed limits** (sandbox code 1 MiB, files 32 MiB, `ready` within 10 s,
   project-kind options 64 KiB) stand until P3 C-4/K-S1 verify them; a change
   is logged in [changes](#changes).

## Related

[Toolkit plan](toolkit-plan.md), [ADR-0005](decisions/0005-toolkit.md),
[ADR-0004](decisions/0004-project-domain-freedom.md),
[FB-0081](feedback.md#fb-0081), [shell](shell.md), [workspaces](workspaces.md),
[configuration](configuration.md), [i18n](i18n.md), [files](files.md).

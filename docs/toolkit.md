# Toolkit API: project modules, views and components

Status: **contract only** (toolkit plan P1, 2026-10-29, [FB-0081](feedback.md#fb-0081)).
Nothing in this guide is implemented yet. The types exist in
`packages/frontend/src/api/types.ts` (not imported by `admin.ts`, so `admin.js`
is unchanged) and the PHP value objects `Blade\Feature\View` and
`Blade\Feature\ViewKindProvider` exist without callers. Every member is marked
with the phase that implements it: **planned — P2** (kernel, lanes K-F/K-S) or
**planned — P3** (components, lanes C-1 … C-6) of the
[toolkit plan](toolkit-plan.md#8-work-breakdown). The owner reviews this
contract at gate G1; afterwards changes need a recorded reason in
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
- Optional for TypeScript: `dist/admin.d.ts` (planned — P3 C-6) and the
  `@dhtmlx/suite` 9.3.12 types it references.
- `SandboxFrame` additionally needs `dist/sandbox.html` and `dist/sandbox.js`
  deployed beside `admin.js` (planned — P3 C-4).

<a id="module-loading"></a>

## Module loading (planned — P2 K-S2, K-F3)

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
`message`, `fieldErrors`, optional `details`; status 0 for network or
non-JSON answers) or the platform `AbortError`; it never retries. 401 means
the session ended; the shell's behaviour for it is unchanged. Event handlers
that throw are logged and do not stop other handlers; emitting a framework
event name (with `:`) throws.

<a id="registries"></a>

### Registries (planned — P2 K-F3; presentations, field types, commands P3 C-5)

`Registry<T>`: `register(name, entry, {replace?})`, `get`, `has`, `names`.
Names are `[a-z][a-z0-9_.-]*`; built-in names have no dot, project names must
contain one (`demo.player`). A duplicate name throws unless `replace: true`,
which is also how a project deliberately overrides a built-in. Register during
module initialization; a later registration affects only views mounted after it.

```ts
app.views.register("demo.asset-viewer", { create: (host, view) => mountViewer(host, view) });
app.presentations.register("demo.bar", { render: (value, row, column, size, escape) =>
  `<span class="demo-bar" style="--w:${Math.min(100, Number(value) || 0)}%">${escape(value)}</span>` });
app.fieldTypes.register("demo.rating", { input: (field, value, readOnly) =>
  ({ type: "slider", name: field.name, label: field.label, min: 0, max: 5, value, disabled: readOnly }) });
app.commands.register("demo.copy-text", { label: "Másolás szövegként", placement: "both", run: ctx => copy(ctx.row) });
```

- **View kind** `create(host, view)` returns a `ViewInstance` (`destroy`,
  optional `editing`, `refresh`). `ViewHost` gives `app`, `signal` (aborted when
  the view closes), `open` (`page`/`window`), `record` (`{resource, id, row}`
  for record views), `filters`, `attach`, `setTitle`, `close`. A throw shows the
  error dialog and leaves an empty workspace.
- **Presentation** (`column.presentation`): synchronous HTML renderer per
  value and size (`cell`, `card`, `tile`); it must escape every record value
  with the given `escape`. A throw renders the escaped plain text.
- **Field type** (`field.editor`, planned server option): a Suite Form item
  factory, optional `bind` and `display`. The server keeps validating the
  field by its storage `type`; an unknown editor falls back to that type.
- **Client command** (`view.commands`, planned list option): label, icon,
  placement, `enabled`, `run`. Anything it changes on the server goes through
  `app.server.call`.

<a id="components"></a>

### Components (planned — P3)

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
| `FileManager`, `FilePicker` | `FileManager.ts`, `FilePicker.ts` | `opened`; `pick()` resolves a `MediaDescriptor` or `null` |
| `Calendar`, `DiagramEditor` | `Calendar.ts`, `DiagramEditor.ts` | `saved`, `editing` (diagram) |
| `MediaPlayer` | `FileManager.openImage/openVideo`, plus audio | `loaded`, `position`, `ended`, `error`; `play`, `pause`, `seek`, `position`, `duration` |
| `SandboxFrame` | new | `ready`, `error`, `message`; `load`, `post` |
| `CommandBar` | `ResponsiveToolbar` (`Műveletek` collapse) | `click`; `update(id, changes)` |

<a id="views"></a>

## Views (planned — P2 K-S1)

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
`{replace: true}`; `Registry::kind()` has no replace. Open point for G1.

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

### Routing (planned — P2 K-F4)

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

## Record views (planned — P2 K-S3, K-F4/K-F5)

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

## Activation map (planned — P2 K-S3, P3 C-1)

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

<a id="sandbox-protocol"></a>

## Sandbox protocol (planned — P3 C-4)

`SandboxFrame` creates `<iframe sandbox="allow-scripts" src="<assets>/sandbox.html">`:
an opaque origin with no cookies, session, CSRF token or same-origin access.
Messages use `postMessage` with the envelope `{blade: 1, id, type, payload}`
(`SandboxMessage`; `id` unique per sender).

| Direction | `type` | Payload |
| --- | --- | --- |
| parent → frame | `load` | `{code, files}`: untrusted script source and named data (Blobs or strings) |
| frame → parent | `ready` | `{}` after the code's top-level evaluation (and its returned promise, if any) completed |
| frame → parent | `error` | `{message}`: a throw, rejection or protocol violation |
| both | project types | dotted names (`scene.seek`), any structured-clone payload |

- The parent accepts a message only if `event.source` is its own frame's
  window and `event.origin` is `"null"`; other messages are ignored.
- Inside the frame `sandbox.js` exposes `blade.on(type, handler)`,
  `blade.post(type, payload)` and `blade.files` (name → `blob:` URL or
  string) to the code, which runs from a `blob:` script inside the frame only
  ([O7](#resolved-decisions)).
- Proposed limits, finalised in C-4: code 1 MiB, files 32 MiB, `ready` within
  10 s; violations raise `error` (`size`, `timeout`) and the `sandbox:error`
  event. `destroy()` removes the frame at once.
- Proposed meta CSP of `sandbox.html` (to verify in Playwright Chromium):
  `default-src 'none'; script-src 'self' blob:; style-src 'unsafe-inline' blob:;
  img-src data: blob:; media-src data: blob:; font-src data: blob:;
  connect-src 'none'; base-uri 'none'; form-action 'none'`. The shell CSP is
  not relaxed (`default-src 'self'` already permits the same-origin frame).
- The frame can still navigate itself and so leak what it was given: never
  pass it data the actor may not see. Security review: P7.

<a id="packaging"></a>

## Packaging (planned — P3 C-4, C-6)

| File | Deployed by consumers | Notes |
| --- | --- | --- |
| `dist/admin.js`, `dist/admin.css` | yes (unchanged) | one ESM bundle, no chunks |
| `dist/admin.d.ts` | no | development only; `tsc --emitDeclarationOnly` from `src/api/index.ts` |
| `dist/sandbox.html`, `dist/sandbox.js` | when `SandboxFrame` is used | add to `.deploy.json` `shared_assets.files` |

`packages/frontend/package.json` exports `./admin.d.ts`, `./sandbox.html` and
`./sandbox.js`; `node tools/build.mjs --check` covers every tracked dist file.
A project's own module files live in its public directory and are built by
the project.

<a id="typescript-recipe"></a>

## TypeScript and esbuild recipe (planned — P3 C-6)

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
const main: ApplicationModule = app => { app.views.register("demo.player", { create: host => mount(host) }); };
export default main;
```

```sh
tsc -p tsconfig.json
esbuild frontend/src/main.ts --bundle --format=esm --target=es2022 --outfile=public/app/main.js
```

Import 61ade and Suite **types only**; a runtime import of `@dhtmlx/suite` or
`admin.js` would bundle a second instance. Use `app.dhx` for Suite widgets.
The `@dhtmlx/suite` path may instead be a devDependency of the same version.
Project events extend `AppEvents` by module augmentation of `@61ade/admin`.

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
| — | — | — | — |

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
| O9 | No transport change: the bootstrap `i18n.messages` already carries the merged catalog (`Translator::configure`: framework < project per locale, default locale as fallback), fed by `Blade\I18n\Settings::$catalogues` / JSON `i18n.catalogues`; `app.i18n` wraps `t`/`locale`. Framework keys are Hungarian source text in one flat namespace and a project key equal to a framework key overrides it. | Confirmed in P0.4; project modules use the same catalogues. Key convention: open for G1. |
| O10 | `app.dhx` is the Suite namespace the shell uses (Standard 9.3.12, GPL obligations per [component matrix](component-matrix.md#licencek-és-lejárat)); Scheduler only through `Calendar`. | One instance shares theme and locale; one Scheduler per page in Standard. |
| O11 | `app.apiVersion = 1`; until the transition closes breaking changes need a [changes](#changes) entry with a feedback reference, afterwards [breaking changes](development.md#breaking-changes). | Freezes the contract at G1 without blocking P2/P3 corrections. |

<a id="open-points"></a>

## Open points for gate G1

1. **Duplicate view ids:** keep "later declaration replaces, first position
   kept" ([rule](#view-id-rule)). Recommended: keep (allflow depends on it).
2. **Translation keys of project modules (O9):** recommended: Hungarian source
   text like the framework, or a project prefix (`storyblox.player.play`) for
   texts without a natural source; overriding framework keys stays allowed and
   documented.
3. **Project name prefix:** recommended: project kinds, presentations, field
   types, commands, event names and preference scopes must contain a dot.
4. **JSON placement of extra views:** recommended: a module-level `views`
   section; `resources.<name>.view` gains only `id` and the activation map.
5. **Module timeout and failure policy:** recommended: 5 s per module, report
   and continue.
6. **`modules` naming:** `application.modules` (browser) beside
   `workspace.modules` (JSON files). Recommended: keep, as the plan names it.

## Related

[Toolkit plan](toolkit-plan.md), [ADR-0005](decisions/0005-toolkit.md),
[ADR-0004](decisions/0004-project-domain-freedom.md),
[FB-0081](feedback.md#fb-0081), [shell](shell.md), [workspaces](workspaces.md),
[configuration](configuration.md), [i18n](i18n.md), [files](files.md).

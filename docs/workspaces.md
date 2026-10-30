# Workspaces and live lists

Status: implemented and verified with synthetic integration on 2026-10-16.
Requirement: FB-0006.

Views declare validated layout trees with separate filter/grid and optional
embedded form. Headers, sizes, collapse and order are configurable. Default:
left filter, right results, overlay editor. Panel mode requires a form area.
Singleton views are direct readable/editable details without a grid.

The agent-facing design rules for introducing or extending grid, data-tree, and
card surfaces live in the [grid-tree-card-ui skill](../.agents/skills/grid-tree-card-ui/SKILL.md).
This guide remains the public runtime contract and records current limits and
verification evidence.

Lists use key cursors rather than deep SQL OFFSET. A bounded bidirectional
data window prefetches on scroll and releases distant rows, without downloading
all records/placeholders. Every query applies ACL and permitted field filters;
searching hidden fields is forbidden.

Suite Standard 9.3.12 lacks the PRO LazyDataProxy grid integration. The framework
uses Standard Grid public scroll/data/selection APIs for its own source adapter;
it does not claim PRO support. Layout/forms/rendering remain DHTMLX.
A licensed native PRO adapter could be registered later.

Project LiveConfig selects polling or WebSocket. Both watch the same authorized
bounded window, update changed rows only and never overwrite open forms.
External database writes are detected too. WebSocket runs as a dedicated loopback
service, with short-lived session-bound tickets and repeated authorization.
Clients reconnect on network loss; hidden tabs stop active watchers.

Views add no separate status/live-connection bar. User/application/version
appear in the [single shell bar](shell.md#egységes-alsó-információs-sáv);
background updates continue.

<a id="list-components"></a>

## List components in project code

The list behind every list view is a public toolkit component
([ListView](toolkit.md#listview), with [RecordForm](toolkit.md#recordform),
[RecordDetails](toolkit.md#recorddetails) and
[CommandBar](toolkit.md#commandbar)); the built-in `list` kind mounts the same
`ListView` in the workspace. A project module composes them in its own Layout
or `app.ui.window`; every read and write still goes through the view's
registered, ACL-checked actions, and preferences, live updates and forms behave
exactly as on a menu page:

```ts
const layout = new app.dhx.Layout(null, { type: "space", cols: [{ id: "list" }, { id: "side", width: 380 }] });
host.attach(layout);
const list = new app.components.ListView({ view: "demo_tasks", signal: host.signal });
const details = new app.components.RecordDetails({ view: "demo_tasks", record: "1", signal: host.signal });
list.on("select", ({ row }) => { if (row) void details.show(row); });
list.mount(layout.getCell("list"));
details.mount(layout.getCell("side"));
```

The implementation lives in `packages/frontend/src/components/list`
(`Workspace.ts` list core; `toolbar.ts`, `filters.ts`, `search.ts`,
`actions.ts` forms and commands, `details.ts`, `activation.ts`, `fields.ts`
form items, `ListView.ts`, `RecordForm.ts`, `RecordDetails.ts`,
`CommandBar.ts`). `src/Workspace.ts` only re-exports the internals for the
existing fixtures; its constructor is not a contract
([migration M8](toolkit.md#migration)).

<a id="list-extensions"></a>

### Project presentations, field types and client commands

A list renders, edits and commands through the toolkit
[registries](toolkit.md#registries); the declaration names the entry, a
project module registers its behaviour:

- **Column presentation:** `column: ['presentation' => 'demo.bar']` (JSON
  `"column": {"presentation": "demo.bar"}`) on a readable, non-secret field.
  The module's renderer draws the table cell, the card field, the tile's
  secondary line and the record details; the tile title stays text. The
  built-in `image` presentation renders through the same registry.
- **Field type:** `new Field(…, editor: 'demo.rating')` (JSON `"editor"`). Its
  Form item replaces the storage type's input in the create, update and bulk
  forms, the singleton form, `RecordForm` and the edit window; its `display`
  renders the value. An `editable` field-type column is not edited by the
  native cell editor: the cell is an edit button that opens the card editor
  window (same `__edit` save, revision, validation and ACL). Filters keep the
  storage type's input; the server validates by the storage type.
- **Client commands:** `commands: ['demo.copy-text']` on `Registry::view` or
  `SqlResource::register` (JSON `view.commands`, at most 20 dotted names). The
  commands follow the view's actions in the command bar in declaration order
  and move into `Műveletek` like them; there is no record context menu. A
  `record` command (also `both`) acts on the cursor record like the built-in
  record actions: disabled without one and, unless its own rule accepts them,
  with several marks; a `toolbar` command needs no record. The built-in
  `Adatok` command is the registry's `details` record command. Commands run in
  the browser; every server effect is an ordinary ACL-checked action call.
- An unknown name never breaks a list: the plain value, the built-in input or
  no command, with one console warning per name.

<a id="konfiguráció"></a>

## Configuration

```php
use Blade\Feature\ViewLayout;
$source->register($registry, 'Elemek', layout: new ViewLayout(
    formMode: 'panel',
    tree: ['cols' => [
        ['id'=>'filter', 'header'=>'Szűrés', 'width'=>300, 'resizable'=>true, 'collapsable'=>true],
        ['rows'=>[
            ['id'=>'grid', 'header'=>'Találatok'],
            ['id'=>'form', 'header'=>'Szerkesztés', 'height'=>300, 'collapsed'=>true, 'collapsable'=>true],
        ]],
    ]],
));
```

`SqlResource::register()` and `Registry::view()` return the registered
`Blade\Feature\View` (kind `list`); its id defaults to the resource, and an
explicit `id:` adds a further view of the same resource
([toolkit views](toolkit.md#views)). A later view with the same id replaces the
earlier one and keeps its menu position. In the bootstrap a list view's own
keys (`columns`, `layout`, `filters`, `activate`, `subview`, …) are under
`options`.

`new ViewLayout()` gives filter/grid plus overlay form. Panel mode requires
a `form` leaf. Validated nested rows/cols support header, width/height,
minWidth/minHeight, resizable, collapsable, collapsed. No executable HTML/JS
or arbitrary vendor options in definitions.

Singleton forms show permitted get data; fields from target-specific
`__form(update)` are editable and others read-only. Password/other actions
open their own action forms. List Add/Modify permissions derive from ACL;
every editable form provides an explicit Cancel action beside Save (or its
operation label), and Cancel discards the in-progress values. Filter dialogs
also provide Cancel; persistent desktop filters keep Apply and Reset in the
panel. Row `_actions` enables/disables row actions.

<a id="listaprotokoll"></a>

## List protocol

The registered list action accepts:

```json
{"mode":"dynamic","limit":100,"filters":{"title":"minta"},"sort":{"field":"title","direction":"asc"},"cursor":null}
```

Response: items, previous, next. Cursors describe boundary/direction, never
permission or SQL. Actor/channel ACL is reapplied. Request limit: 200; browser
chunks: 100; retained rows: 600. Standard Grid virtualizes rendering. No complete
placeholder array. Without numbering no mandatory count for rank; numbered middle
windows count authorized/filtered rows before the first row, then assign continuous
`_number`. The first window needs no extra rank COUNT. This is a rolling window,
not a scrollbar proportional to total table size.

Filters derive from registered nonsecret scalar fields: text contains,
number/select equality. Percent/underscore are literals, not client wildcards.
Partially readable fields are conservatively excluded from filtering.
Textarea is not a basic filter. Complex/domain filters require extending the
typed query contract first. Header clicks request server ascending/descending
sort, never sorting only a loaded subset.

### Integrated grid header filters

Every filterable field that is present in a view's grid receives a native DHTMLX
header filter above its title. Text and number fields use an input; select and
checkbox fields use an option picker whose values come from the declared field
options; the picker shows option labels, sends option keys and lists every
option again when reopened. An empty control omits that field from the request. Changes replace the
server-side list window and update the existing total/matched count; the Grid
does not apply a separate local filter to its bounded client window. ACL and
typed `ListSource` validation remain authoritative. Views whose filterable field
is not displayed in the grid continue to use the declared filter panel.

<a id="rendezés-és-smart-rendering"></a>

### Sorting and smart rendering

Optional sort: `{"field":"title","direction":"asc"}` or desc. Default: public
id descending. SQL sorts the complete authorized/filtered result. One field
at a time; unique key breaks ties in the same direction, NULL last both ways.
Numbers sort numerically, strings by database collation, select/checkbox by stored
value. Secret, textarea, unknown and partially denied fields cannot sort.
Sortable metadata lists permitted public field names. Consumers need no frontend
or sorting endpoint; they supply indexes for frequently sorted large tables.
The framework does not alter schemas.

Headers show ↑/↓ with aria-sort. Editable non-checkbox headers show ✎ plus
editing tooltip, preserving editor/checkbox accessible names, and carry the
`Szerkeszthető mező` accessible description. Header accessibility attributes are
reapplied after every data render, so a slow first response cannot leave them
unset ([FB-0052](feedback.md#fb-0052)). Column capability does not override
row/field ACL.

Cursors carry field, direction, boundary and unique key; other-sort cursors
are rejected. Row `_position` supports correct backward cursors/live bounds
after trimming 600-row windows, including Unicode values. Watch receives sort
and, for middle windows, first-row ID plus anchor cursor. The first window follows
new leading rows; middle windows stay bound to their sorted boundary.
Changing sort reloads from the beginning; editing a sort value triggers server reorder.

Both smart-rendering layers work: native Grid render virtualization and 100-row
chunks capped at 600. There is no arbitrary ordinal jump or full-table scrollbar.
Sort/filter still cover the full SQL result.

Historical verification: `sorting.php` with 1501 rows, text/number/id both
ways, duplicate/NULL values, complete traversal, backward scroll, live order,
ACL/injection. The managed `grid-sort.spec.cjs` uses the feature demo's
Mérések list (1801 rows): headers, full sorting, filters, bidirectional
scrolling, ≤600 loaded and <100 rendered rows.
The old empty-values/offset API remains transitional compatibility, unused by
the new frontend. Pager/refresh buttons were removed.

<a id="élő-adat-konfigurálása-és-futtatása"></a>

## Live-data configuration and execution

```php
new ApplicationDefinition(/* application definition */, live: new Blade\Live\LiveConfig(
    transport: 'websocket', // or poll
    endpoint: 'wss://admin.example.test/live',
    interval: 2000,
));
```

Polling needs HTTP only. `__watch` hashes the visible ≤600 rows; unchanged
responses contain version only and do not redraw.

<a id="live-channel"></a>

### One live channel per tab

The shell (`AdminShell`) opens one `LiveChannel` per page once the user is
signed in and the menu offers a list view. It closes the channel on sign-out,
tenant switch (both reload the shell) and page unload. Every list on the page,
including sub-view previews and full sub-view windows, holds a `Realtime`
subscription handle on that channel: `subscribe(query)` replaces the list's
subscription, `destroy()` ends it, and the callbacks `update`, `state` and
`denied` are unchanged. Reconnect, backoff and re-subscription live in the
channel once. A module's `app.live.subscribe(resource, query, handlers, signal)`
creates the same handle on the same channel and ends it with `destroy()` or the
signal ([toolkit](toolkit.md#api-reference)). The channel's `__ticket` and
`__watch` calls, like every list request, go through the shared transport
(`src/api/Server.ts`).

WebSocket protocol 2 (JSON text frames; [FB-0075](feedback.md#fb-0075),
[plan](live-channel-plan.md)):

| Direction | Frame | Meaning |
| --- | --- | --- |
| C→S | `hello {protocol: 2, ticket}` | First frame. The server checks the ticket and session through the bridge. |
| S→C | `ready {protocol: 2}` | Authenticated; subscriptions may follow. |
| C→S | `subscribe {id, resource, query}` | Opens subscription `id`, or replaces it (a new first window). |
| C→S | `unsubscribe {id}` | Ends it. |
| S→C | `update {id, version, order, upserts, removed, previous, next, total, matched}` | Changed rows, removed ids and the current order of that subscription. |
| S→C | `denied {id, status, error}` | That subscription only (403, 404, 400; 429 at the limit); the channel stays open. |
| close | 4401 | No or refused ticket, or the session ended. |
| close | 4409 | Another protocol (a page loaded before an update). |
| close | 1008 | Malformed frame, a subscription before `ready`, a second `hello`. |
| close | 1011 / 1012 / 1006 | Transient (bridge failure, server restart, network). |

The browser uses a new `id` for every `subscribe`, so a frame of a replaced
query is never applied. Limits per connection: 64 subscriptions and a row
budget of 2000, the sum of the subscriptions' `limit` (default 100, at most
600). The subscription that exceeds either gets `denied` 429 (`Too many
subscriptions`, `Row budget exceeded`) and that list keeps its loaded rows
without live updates. At most 100 connections per server (upgrade refused with
403). Every `BLADE_LIVE_INTERVAL` (2 s, each connection at its own random
offset) all subscriptions of a connection become due. Bridge reads are
scheduled fairly: `hello` checks first, then one read per connection in turn,
at most 2 in flight per connection and 16 overall, so a flooding connection
delays only itself. Repeated ticks or subscribes on one id coalesce into one
read, and a replaced subscription is read after the running one finishes. A
bridge 5xx or timeout retries that subscription with backoff (interval × 2ⁿ,
at most 30 s) and is never reported as a denial; a 401 closes the whole
connection with 4401.

Client reactions: 1011, 1012 and 1006 reconnect with backoff (0.5 s × 2ⁿ, at
most 15 s), each with a fresh `__ticket`, and subscribe every list again. A
4401 before `ready` means the fresh ticket was refused: every list shows
"A hozzáférés megszűnt" and is revoked, and nothing reconnects. A 4401 after
`ready` may be an expired ticket (tickets last 1 h), so the channel asks for one
new ticket; `__ticket` answering 401/403 ends it the same way. A 4409 reloads the
page once; `sessionStorage` (`blade-live-reload`) blocks a second reload within
60 s, and without `sessionStorage` the page never reloads. It never reloads
over open input either: an open record form or bulk form, a card or cell
editor, a changed singleton form (also in sub-views and sub-view windows), or
unsaved diagram changes. In these cases the page stays as it is: lists keep
loading and working without live updates (nothing is revoked) and the lower
bar shows "Az élő követéshez töltse újra az oldalt." until the user reloads.
The file manager's text editor and running uploads are not consulted (an
upload's own leave warning still applies). `__ticket` needs no list resource (the channel sends `resource: ""`);
the session and CSRF checks are unchanged.

A hidden tab unsubscribes every list but keeps the socket open (the server's
30 s ping keeps it alive); showing the tab subscribes them again and each gets
a full first window. A drop while hidden reconnects only when the tab is shown.
`pagehide` closes the socket; a page restored from the back-forward cache
reconnects. Closing the socket after a hidden grace period is a later tuning
item (plan L5).

Polling uses the same handles: one `__watch` request per interval carries
every subscription of the tab as `values.subscriptions: [{id, resource, query,
version}]` (at most 64 per request; the channel splits a batch only above about
48 KB). The answer `{results: [{id, ok: true, data} | {id, ok: false, status,
error}]}` answers each entry separately, so a refused or failing list never
fails the others; a 401 or CSRF 403 of the whole request ends the session state
for every list. A new subscription polls at once. A failing
batch (network, 5xx, 413) marks only its own lists as reconnecting; the other
batches of the interval still run. Batch size is measured in UTF-8 bytes. The single-list form
(`values: {query, version}`) is still accepted for pages loaded before the
change.

WebSocket runs `packages/php/bin/live-server.mjs` with the system Node 18+ and
PHP 8.4+. It is the committed bundle of `tools/live-server.mjs` with the
lockfile-pinned ws (currently 8.22.0) inlined, so it needs no `node_modules`.
Settings: BLADE_AUTOLOAD_FILE, BLADE_APPLICATION_FILE, BLADE_PHP,
BLADE_LIVE_ORIGIN; optional BLADE_LIVE_PORT (8088), BLADE_LIVE_INTERVAL (2000).
A managed HTTPS/WSS proxy forwards `/live` to loopback.

One server serves several application files of one hostname. The application
named by BLADE_APPLICATION_FILE lists the others in `LiveConfig::$applications`
(name → absolute file); a connection whose path ends in `/<name>` (for example
`/live/admin`) is served by that file, every other path by the named
application. Each listed application sets its own endpoint, e.g.
`new LiveConfig('websocket', 'wss://admin.example.test/live/admin')`. Sessions
and tickets come from the selected application's runtime, so a ticket is valid
only on its own path. Names match `[a-z][a-z0-9-]{0,31}`; the files never reach
the browser. Adding an application needs no service, proxy or restart (the
proxy forwards the `/live` prefix). The bridge respawns itself when a
loaded PHP file changes (exit 75, open sockets and pending requests survive);
a changed server bundle closes sockets with 1012 and exits with 1, so the
supervisor must restart on failure. Consumer supervision:
[live-data service](development.md#live-data-service-websocket); demo:
[demos](demos.md#websocket-live-data).
Exact Origin checking and session-bound tickets in private runtime are mandatory;
tickets do not expose session IDs. Service/proxy provisioning belongs to Infra.

Server watchers periodically inspect visible database windows, including external
writes. Only changes send packets: changed rows, deleted IDs and current order.
The framework owns heartbeat/reconnect/stale-frame rejection. Hidden tabs
unsubscribe and resubscribe on return. WebSocket selection does not silently
fall back to polling.

Every observation rechecks authentication, expiry, account state, revocation
and ACL. Subscriptions are audited technical reads; unchanged ticks do not
produce business audit. Actual writes use the transactional executor. Open forms
retain drafts and stale saves return 409.

<a id="ellenőrzés"></a>

## Verification

`lists.php`: 5000 rows, scopes, both cursor directions, duplicate-free traversal,
filter injection/field denial, external writes/deletes.
`workspace.spec.cjs`: actual overlay form, polling, repeated switching, the
WebSocket update frame of an external write, exactly one `/live` socket while
switching three views, expanding two sub-view rows and opening a sub-view
window, and per-application tickets. `node tests/shell/live-protocol.mjs`: the
protocol against the bundled server (see the
[focused checks](development.md#focused-task-groups)). `lists.php` and
`tenancy.php`: batched `__watch`, each entry answered on its own.
`node tests/shell/toolkit-list.mjs`: the activation map per row, `view:<id>`
targets and their details fallbacks. `toolkit-list.spec.cjs`: `ListView`,
`RecordForm`, `RecordDetails` and `CommandBar` of a real `Application` in a
project Layout and a framework window (events, per-row activation in table,
cards and tiles, validation, theme switch, `destroy` releasing DOM, cell and
live subscription).
Separate consumer synthetic integration historically checked WebSocket updates/
revocation, filtering, preserved panel forms, profile form and 600-row bounds.
The client releases cached rows outside current order and ignores late events
from stopped/replaced sockets. See the [coverage limits](development.md#existing-full-smoke-and-coverage-limits).

<a id="layoutszintek-és-keretek"></a>

## Layout levels and borders

The declared multipanel tree is the direct DHTMLX space root. No extra framed
one-cell wrapper; panels get their own borders and one 12 px outer gap. Shell
and internal toolbar/data layouts have distinct responsibilities without extra
panel frames. Singleton titled panels and explicitly declared branches remain.

`workspace.spec.cjs` checks one space root, 12 px offsets, CRUD and repeated
switching. FB-0015.

<a id="panelméretező-megjelenítése"></a>

## Panel resizer appearance

Suite 9.3.12 space and wide layouts have a 12 px gap but place the factory
three-dot grip on a cell border. Scoped admin.css rules beneath
`#blade-application` move the grip to gap center: dhx_layout-space right/bottom
-6 px, dhx_layout-wide right/bottom 6 px (factory 1 px and 13 px). Native
dragging remains intact.

Consumers only prepare updated framework assets. Factory CSS is unchanged;
framework rules load afterward. Line layouts, grid-column/window resizers
are unaffected. This relies on Suite 9.3.12's gap; rerun focused checks on upgrades.
`layout-resizer.spec.cjs` measures centers of both layout types on both axes
across themes and drags with the mouse. FB-0013; wide layouts FB-0058.

<a id="kártyák-rekordadatok-sorszám-és-jelölés"></a>

## Cards, record details, numbering and marks

Native DataView uses columns targeting 340 px according to panel width,
one column on mobile. Cards show all registered fields readable in list responses,
including fields omitted from the grid, excluding technical ACL/revision metadata
and secrets.

Lists default to a # ordinal column showing position in the complete authorized,
filtered, sorted result across scrolling. It is not database ID and may change
with ordering, filtering or insert/delete. Double-click opens a fresh ACL-checked
get in native Window. Details toolbar action works even without numbering;
card double-click also opens it. All get-readable fields appear; editing remains
a separate action.

JSON view `row_numbers: false` disables numbering. `selection: true` enables
checkbox marks (default false); PHP: `$registry->view(...,selection:true)`.
`row_selection: true` enables the separate row-marking mode; PHP resources pass
`rowSelection:true`.
`desktop_only: true` (PHP `desktopOnly: true`) replaces the view below 768 px
with the [desktop-only notice](shell.md#desktop-only-views).
In row-marking mode a normal row click starts one mark, Ctrl/Command-click adds
or removes a row, and Shift-click adds the range from the last mark. A row with
`_markable: false` (such as the file manager's `..` row) can hold the cursor
but is never marked: a click on it clears the marks, a Shift range skips it and
it gets no mark checkbox. Checkbox
views do not respond to row modifiers. Text selection is disabled in list
content while form controls remain selectable. Marks differ from the
active/editor row, survive grid/card switches and same-row live updates, and
disappear when rows leave the data window.

Toolbar/view-switch internal layouts are type none; the outer results panel
owns the only frame. Toolbar fills its own height and scrolling content cannot
overdraw it. Grid mode has a theme-colored 1 px divider above column headings.
Filter reset and authentication secondary actions are native secondary flat buttons.

<a id="activation"></a>

## Record activation (double-click and Enter)

A list view can declare what a double-click or Enter on a record runs, in the
table, cards and tiles alike. The activation is a command the view already has,
run exactly as its toolbar command runs it on that record; the consumer's own
behavior is a registered record action, never browser code.

```php
// Each shelf opens its item list (also an empty one); each item runs its registered `stock` action.
$registry->view('shelves', 'Shelves', $columns, ['get', 'create', 'update'], tiles: true, activate: 'subview');
$registry->view('shelf_items', 'Items', $columns, ['get', 'create', 'update', 'delete', 'stock'], activate: 'stock');
```

JSON: `"view": {"title": "…", "activate": "subview"}`. A `SqlResource`
passes it through `register(…, activate: 'subview')`; that view has `get`,
`create` and `update` only, so an action added later (`registerDelete()`,
`appendViewActions()`) cannot be named there.

Per-record targets use an activation map keyed by the string value of a field
([toolkit activation map](toolkit.md#activation-map)):

```php
$source->register($registry, 'Médiatár', tiles: true,
    activate: ['field' => 'kind', 'map' => ['audio' => 'view:demo.player', '*' => 'details']]);
```

JSON: `"activate": {"field": "kind", "map": {"audio": "view:demo.player", "*": "details"}}`.

- **Values:** `details` (the record details), `subview` (the full window of the
  view's [sub-view](#sub-views) for that record, also at a child count of 0, so
  an empty list is the place to create the first item), `page` (see below) or
  the name of a record action in the view's `actions`, or `view:<id>`: a
  [record view](toolkit.md#record-views) whose `record` is the list's resource,
  checked once every view is declared (end of the JSON build,
  `ApplicationDefinition`, every bootstrap). `create`, `get`, upload and
  collection actions are rejected at registration, as is a singleton view.
- **Map:** `field` is a registered, non-secret field of the resource; each map
  entry (`*` is the default) takes one of the values above. A row whose value
  has no entry and no `*` keeps the default behaviour. The bootstrap always
  sends the map as a JSON object. The client chooses per row by the string
  value of the field in the list row (a field the actor may not read is absent
  and takes `*`), the same in table, cards and tiles.
- **`view:<id>`:** the client opens the record view through the shell's
  navigation (`app.navigate({view, record})`: page or window as the view
  declares, its row resolved by the record resource's `get`) when the view is
  offered to the actor, is a record view of the list's resource and the row's
  `_actions` contain `get`; otherwise the details.
- **`page`:** the child view's own page (its menu entry, so the sub-view needs
  `embed: false`, checked at `subview()`) opens with the sub-view field filtered
  to the record. The filter is an ordinary one: it shows in the column header
  and the filter panel and `Alaphelyzet` removes it. The navigation is a
  browser history entry (Back returns to the parent page); the address keeps
  `#view=<child view id>` only, and the page keeps the filter across a reload like
  any filter set there ([saved filters](shell.md#url-és-helyi-felületbeállítások)). The page
  needs the child view offered to the actor with the field among its filters;
  otherwise, and in a view opened in a window, the sub-view window opens; with
  no resolved sub-view, the details.
- **Default (absent):** unchanged; the table opens the update form when the
  record offers `update`, otherwise the details; cards and tiles open the
  details.
- **Fallback:** a declared activation that is not offered opens the details:
  the action is not in the actor's view or not in the record's `_actions`, the
  sub-view is not resolved (its child view is not offered to the actor), or the
  record view is not offered (the actor is not offered its record resource's
  `get`, or a tenant-scoped record resource without an active tenant).
- **Unchanged paths:** the details stay on the toolbar `Adatok` command (and
  the `#` cell in the table); editable cells and card fields, marks, the
  sub-view toggle and card button keep their own handling. A `select: false`
  list activates nothing. A compact sub-view preview keeps the default
  (it opens no further child window).
- **Accessibility:** with a declared activation every card and tile carries
  `aria-description` "Megnyitás: <target>" (the child list or page title, the
  action label, the record view title, or `Adatok` on fallback), per record; a
  record whose map has no entry and no `*` carries none. A child window or
  the details opened this way take the focus, so Escape closes them.
- **Toolkit:** a `ListView` reports each activation as its `activate` event
  with the resolved target before it runs
  ([ListView](toolkit.md#listview)).
- **Security:** nothing new runs: the action goes through the ordinary
  executor (ACL, confirmation metadata, audit), the child window through the
  child resource's `list`.

<a id="tömeges-műveletek-és-ikonok"></a>

## Bulk actions and icons

Actions accept an optional DHTMLX icon CSS class, e.g. `dxi dxi-check`, also
as JSON icon. Built-ins, view switching, filters and save have framework defaults.
Every configured icon must be present in the bundled DHTMLX icon font; use the
bundled glyph names rather than an unavailable outline alias so disabled and
enabled actions render the same icon.

Bulk requires explicit Action/JSON `bulk: true` plus checkbox or row selection. A
`SqlResource` update becomes bulk-capable when one of its fields declares
`bulk: true`; only those fields are offered in the combined update form. JSON
uses `"bulk": true`, while PHP uses `new Field(..., bulk: true)`. The selected
value is validated and applied to every marked row with its own revision.
For a per-object Close action, add bulk true/icon and view selection true;
handler, resolver and permissions stay the individual action's ones.

The command bar shows each action once. When marked rows exist, selecting a
bulk-capable action runs that same action for the marked rows; no separate
“selected rows” command is added. Every action and its sort choices carry a
native DHTMLX icon.

While two or more rows are marked, only commands that are meaningful for the
marks stay enabled: bulk-capable actions (when every marked row permits them)
and create. Single-record commands are disabled instead of acting on the
active row, including `Adatok` and an update without any `bulk: true` field.
With one mark they follow the active row as before. Double-clicking a row still
opens that one record. FB-0059.

When the action has input fields, the marked-rows command opens one form for
permitted targets; a field-free command executes directly without an
intermediate window. Differing field permissions reject the combined form.
Limit: 1–100 rows. UI `__bulk` takes
operation and `items: [{id,values}]`. Every row has its own revision, validation,
object/field ACL, transaction and audit in Executor. Secret/password fields and
collection actions cannot bulk. API bulk is unsupported. Partial success is
possible; another row's failure does not roll back successful rows. Clients show
summary and per-ID errors, without automatic retries. This is neither an atomic
whole-batch transaction nor export.

`list-presentation.php` checks ACL/secrets/metadata/opt-in/limits/duplicates/
partial success; `list-presentation.spec.cjs` checks columns/mobile/details/icons/
marks/bulk and theme geometry. FB-0019.

<a id="nézetválasztás-és-fejlécjelzések"></a>

## View selection and header indicators

The final right-aligned Toolbar dropdown shows the current mode: `Táblázat`,
`Kártyák` and, when offered, `Csempék` (tiles). Switching preserves the
visible record. On mobile a table is forced to cards: the table item is
disabled and the desktop preference is restored when the window widens; when
tiles are offered they stay available on mobile. The chosen mode persists per
user, view id and page (`UiPreferences`, unknown stored values read as table).
Singleton views have none. This replaces FB-0019's two buttons per FB-0020.

<a id="media-tiles"></a>

### Media columns, tiles, row height and search

Phase U3 of the [file/media plan](files-media-plan.md) ([FB-0063](feedback.md#fb-0063)).

- **Media column.** A field holding a file id declares the column option
  `media: "<file-manager resource>"` (JSON `"column": {"media": "files"}`;
  only on non-secret text/number/select fields, never `editable`). The file
  manager registers itself as the `MediaSource` of its resource
  (`Registry::media()`, `Blade\Files\FileMedia`). List, live and `get` rows then
  carry `_media[<field>] = {id, name, mime_type, revision, duration_ms, width,
  height, thumbnail}` — only for files whose `thumbnail_get` the actor may use
  on that mount (channel and API token scope included); every other value is
  `null`, so no name or type leaks. One describe call is made per window. The
  browser renders `recordMedia()`: a lazy `<img>` from the GET
  `thumbnail_get` URL when the thumbnail is ready, otherwise (and when the
  image fails, which is not retried in the session) a type icon; videos get a
  duration badge; the accessible name states the type in text
  (`Videó: minta.webm, 0:06`). The table cell scales with the row height;
  cards show the media slot on top.
- **MIME-class filter.** A filter on a media column takes `image` or `video`
  (advertised as a select with `Kép`/`Videó`), limited to mounts the actor may
  read; other values are `400`, a field the actor may not query `403`.
- **Icon column.** `column.presentation: "icon"` (non-secret text/select, not
  editable, static `options` required): the value is a Suite class
  `dxi dxi-…`, `options` give the accessible name. Record details and cards
  render media and icon fields the same way (`detailFields` carry `media` and
  `presentation`). A dotted `presentation` names a project renderer
  ([extensions](#list-extensions)).
- **Static image column.** `column.presentation: "image"` with a required
  `imageBase` (JSON `"column": {"presentation": "image", "image_base":
  "../demo-images/"}`): the text field holds a file name and the browser shows
  `<img src="<imageBase><name>">`. The image is a static file of the
  application; there is no file id, upload, content store, endpoint or ACL.
  `imageBase` is a path relative to the page (the same shape as the application
  `assets` path, optionally absolute) and ends in `/`. Only non-secret,
  non-editable `text` fields qualify; `media`, `options` (the icon contract),
  `editable` or `imageBase`/`altOf` without `presentation: "image"` are
  developer errors (`InvalidArgumentException`). Optional `altOf` (JSON
  `alt_of`) names a text field of the row used as the accessible name; without it
  the image is decorative (`alt=""`) because the title is beside it.
  **Value rules**, enforced by the server: one file name of letters, digits,
  `-`, `_` and `.`, no leading dot, no `/`, `\`, `..` or scheme, a
  case-insensitive extension of `png`, `jpg`, `jpeg`, `webp`, `gif` or `svg`,
  255 characters at most (`Field::imageFile()`). Field writes with another
  value are `400`; list and live rows blank a stored value that breaks the
  rules, and the browser repeats the check, so a value never becomes an
  arbitrary URL (CSP `img-src 'self'` stays). Rendering reuses the media slot:
  table cell (scales with the row height), card top slot, tile slot and record
  details; lazy and async decoded. A missing file (load error) shows the neutral
  image placeholder and is not retried in the session, like thumbnails. Tiles
  and cards keep the aspect ratio: a square slot with `object-fit: contain`.
  Existing lists, `media` and `icon` columns are unchanged. Synthetic demo:
  `Feature demó` → `Katalógus`
  ([FB-0076](feedback.md#fb-0076)).
- **Tiles.** `tiles: true` (JSON `tiles`, default on when a media or static image column
  exists) offers a native DataView mode: media slot (or icon), the first text
  column as title and the next as a secondary line; `tileMinWidth` (120–480,
  default 180, JSON `tile_min_width`) decides tiles per row (6 at 1280 px,
  2 at 390 px). Marks, row selection, double-click/Enter, scroll paging,
  live updates and visible-record restore behave as in cards.
- **Row height.** `rowHeight` (32–160, JSON `row_height`, default 40) is used
  by every paging, capture and restore calculation of the table.
- **Keyboard.** Arrow keys (native), Home/End/PageUp/PageDown move the cursor
  row in table, cards and tiles; Enter opens like a double-click; Space toggles
  the mark in row-selection mode; focus rings use the theme focus colour.
- **Search.** A resource declares `search` (1–20 non-secret text/textarea
  fields; PHP `SqlResource` `search:`, JSON view `search: ["title"]`). The view
  then gets `search: {fields}` with only the fields the actor may query, and a
  native Toolbar input left of the commands: it reloads 300 ms after typing,
  Enter searches at once, Escape clears. The `search` list parameter (≤ 100
  characters) is a server-side `LIKE` over those fields combined with filters,
  scope, sort, cursors, counts and the live query; when the actor may query
  none of them the search matches nothing.
- **Reserved row keys.** Suite treats a row's `height` (and `css`) as its own
  property; `ResponsiveGrid` keeps such data keys under an internal alias, so a
  record field named `height` never changes the row height.
- **Re-created DOM.** `ResponsiveGrid` delegates its DOM listeners from the
  document filtered by its current root and re-observes a re-created root, so a
  host Layout that re-renders it (cell hide/show, a `views` switch) keeps
  marking, card scroll paging, editing and reflow ([FB-0058](feedback.md#fb-0058)).

- **Derived media columns.** A view column without a field may declare
  `media_of: <media field>` and `part: "type" | "resolution" | "duration"`;
  it is rendered from `_media` (`Kép`/`Videó`, `1920 × 1080`, `0:06`) in the
  table, cards, tiles and details, and is never sortable or editable.

<a id="file-field"></a>

### File field

`type: "file"` with `file: {resource, mount, accept, folder?}` (PHP
`new Field(…, 'file', file: [...])`) stores a file id of a file manager's
mount. The server validates that the id is a live file of that mount, of an
accepted MIME class, which the actor may read (`thumbnail_get`); errors are
field errors on every channel. Its metadata carries the resolved `folder_id`,
the accepted classes, the file manager's upload policy narrowed to them (no
folders) and `can_upload`; list rows carry its `_media` descriptor, so the
column is a media column automatically. The form control shows the thumbnail
and name with `Kiválasztás…` (a tiles picker over the folder with search and a
type filter; Enter or double-click chooses, Escape or `Mégse` cancels),
`Fájl feltöltése…` (the shared uploader; the first stored file is chosen) and
`Törlés` for optional fields. Grid editing of a file field is not supported.
Consumers that store uploads themselves use `FileManagerDefinition::files()`
(`MountStorage::folder()`/`store()`), which applies the file manager's
validation, metadata and thumbnails.

<a id="delete-usages"></a>

### Record delete policy and usages

`SqlResource::registerDelete(…, deletePolicy: 'delete'|'archive')` (JSON
`operations.delete_policy`; default `delete` for compatibility, `archive` is
the recommendation for new development). `archive` sets the consumer's
`archived_at`/`archived_by` columns and every framework read of the resource
(object loads, lists, counts, rank, live watch, unique checks and JSON
`lookups` on the same table) hides the row as if deleted. Consumer SQL
outside these reads must filter `archived_at IS NULL` itself.

A consumer reports references with `Registry::usage($resource, UsageProvider)`
(`usages(Context, ids)` → label/count pairs, `clear(Context, ids, policy)`
inside the deleting transaction). Delete actions of a resource with providers
are offered with `usages: true` and accept a hidden `preview` value
(`{count, usages}` without changes); the browser previews first (through
`__bulk` for marks, whose items now carry `data`) and shows one shared danger
confirmation listing the counts and that the references are cleared; the apply
result reports `cleared` and a toast summarises it. Under `archive` the
providers are called too, so archived records behave as deleted everywhere.
The file manager's `delete` works the same way over every file of the selected
subtrees. Usage counts are labels and counts only, but they may count
references in records the actor cannot read. `clear()` is consumer code that
runs inside the deleting transaction regardless of the actor's rights on the
referencing resource and writes no audit row there (the demo blanks event
assets, removes defaults and empties asset file references — owner decision).
Contract change for consumers: `after_save` no longer runs after a delete; use
`after_delete`. An archive-policy resource checks its `archived_at`/`archived_by`
columns on first use (a developer error otherwise); a PHP `Lookup` hides
archived rows with `hideArchived`. File deletes say that referencing items stay
and only their file reference is cleared. An unchanged stored file id is not
re-validated on save; the picker is offered only with `can_choose` (`list` on
the mount) and returns focus to the field.

List actions that declare an `UploadPolicy` carry `upload` metadata and open
the shared [uploader](uploader.md) from the toolbar (an action without fields,
whose handler result counts as one success per file).

Limits: tile title/secondary columns are chosen automatically; reserved-key
columns appear to the Grid as `__blade_height`/`__blade_css` (DOM selectors and
stored column widths see the alias; editing, sorting and filtering convert it);
the search input width is fixed when the view is built.

Columns marked `secondary: true` are listed in a neighboring `Oszlopok`
Toolbar dropdown as accessible toggle items. The grid uses the native
`showColumn`/`hideColumn` methods, and each user's choices persist with the
existing view preferences. The dropdown is rendered only when the view declares
at least one secondary column. Cards and record details continue to include all
permitted fields.

The pencil stays beside the title. Hover sort icon has its own 24 px right area.
Only one direction indicator reflects server SQL order. Titles ellipsize as
needed; tooltip/aria-sort remain. All themes use this rule.
`list-presentation.spec.cjs`, `mobile-grid.spec.cjs` and the
[historical qualification](list-presentation-validation.md) document evidence.

List `numbered` defaults true; false omits rank calculation and _number.
Frontend requests it from view.row_numbers, including watch. PHP tests check
full ordinal rank across both paging directions/middle windows.

Mobile filtering creates a separate native Form, copying applied values into the
panel form. Closing does not move widgets between layouts. Filter/reset buttons
share one row with 8 px gap.

<a id="listafejléc-és-rekordszám"></a>

## List heading and counts

Native grid-region Layout header always shows view.title. Toolbar contains
actions and the final selector. Right-hand counts are total without filter,
or total/matched with filter. Total means records allowed by list ACL and base
source condition; matched adds the applied filter. Neither means loaded-window
size. They persist for empty results and are independent of cursor/order.
Server total/matched appear in list and changed-watch responses over both transports.
Outside-window changes update snapshot version when counts change.

The native headerIcon slot contains the framework counter class aligned right,
without a consumer header/HTML interface. Grid mode shadow falls beneath column
headings; cards use toolbar shadow, switching automatically across themes.
Native filter buttons have at least 8 px gap.

View icon sets the menu icon, e.g. JSON `"icon":"dxi dxi-file-outline"` or the
last optional Registry::view icon argument. CSS class names only; the glyph
must exist. Default: dxi dxi-table-check. Groups use folders; static MenuItem
also accepts icon.

<a id="kártyaszerkesztés-rendezés-és-kompakt-ablakok"></a>

## Card editing, sorting and compact windows

Card editing intersects column.editable with row _editable. Clicking a penciled
text/select/textarea opens native Window/Form; save uses the same __edit,
revision, validation, ACL and audit as Grid. Cross-field client validation also
receives the full row. Checkbox toggles directly with click/Enter/Space.
Read-only values stay text. Closing discards drafts; saving blocks another edit.

Cards expose a sorting dropdown before the view selector with asc/desc options
for each sortable field. A synthetic title “Title ↑” sorts the full SQL result
with the same cursors/preferences as headers, including on mobile.
No consumer endpoint/configuration is required.

Double-clicking a layout resizer restores declared adjacent-panel sizes and
clears that axis's saved size preference; dragging/collapse remain independent.
Feature-triggering grid/card double-clicks do not select display text; inputs
retain text selection.

Filter/CRUD/bulk/detail windows size to rendered content, capped at viewport
height minus 24 px. Forms retain 24 px below the final button; details retain
24 px beyond article padding. Native scrolling handles long content;
validation remeasures; manual resize remains available. A Form textarea
directly in a content window takes any height the window has beyond its
fitted content: Suite sizes the textarea from its cell, which grows
(`admin.css`), so a capped or manually enlarged window has no empty band
below its actions. `fitWindow` pauses that growth while it measures. Every
form and details window is sized by `fitWindow`; no window keeps a fixed pixel
control height beside spare space. Document windows (the file manager's text
editor, image viewer and video player) are not fitted: one Layout fills the
Window, so the content cell follows every window size ([files](files.md#behavior)).

The managed `grid-edit.spec.cjs` (feature demo Tasks) checks switches
during/after save, card field saving/validation, SQL sort, size reset, reload,
double-click and bottom space (FB-0024).
View switching transfers the visible record rather than a source row's pixel
offset to different-height cards; at list start scroll stays zero. Same-view live
updates retain exact offsets. Regression checks: list-presentation/mobile-grid,
FB-0027.

<a id="reszponzív-műveletsor-és-azonos-kártyaszélesség"></a>

## Responsive command bar and uniform card width

Below 768 px viewport or when panel width cannot fit buttons, the entire native
Toolbar moves into Actions dropdown: Details, Filter, business actions, sorting
and views. Original IDs, hidden/disabled state and events remain; backend ACL
still checks. Wide panels restore horizontal layout/right selectors. Forced
mobile cards keep their selector disabled.

DataView uses native itemsInRow widths with border-box and no content-driven
flex shrinking. Long unbroken words wrap; every mobile card has equal width.
FB-0028.

<a id="megerősítés-művelet-előtt"></a>

## Confirmation before actions

Action/JSON confirm requests the shared [dialog](dialogs.md#szerver-által-deklarált-megerősítés)
before individual or bulk execution. Result reveals are reported through the
non-blocking toast described below.
Actions that declare no input fields execute directly from the command bar; they do
not open an intermediate form containing a second Execute button. Successful
toolbar actions, including one-time secret reveals, report through a non-blocking
toast; only actions that declare confirmation metadata open a confirmation dialog.

<a id="sub-views"></a>

## Sub-views (expandable rows and card buttons)

A list view can let each record expand to a compact preview of a related list
under its row in the table. In card view (and so on a phone) a card does not
expand: it carries a button that opens the full related list in a window.
The preview is for a quick look, not for work. The full related list, with all
its actions, opens in a window from the parent toolbar.

```php
// After both views are registered: each tenant expands to its access list (rows not selectable).
$registry->subview('blade_tenants', 'blade_tenant_members', 'tenant_id', select: false);
// The child keeps its own menu entry:
$registry->subview('projects', 'tasks', 'project_id', embed: false);
// The same resource: a hierarchy (parent_id is a select whose options include '').
$registry->subview('tasks', 'tasks', 'parent_id');
```

`subview()` takes view ids (default: the resource). A child view of the same
resource is a hierarchy of the parent view itself. Attach a sub-view after the
final declaration of both views: a redeclared parent loses its sub-view and a
redeclared child its embedding.

JSON: `"view": {"title": "…", "subview": {"resource": "tasks", "field": "project_id", "embed": false, "select": true}}`
(`resource` names the child view id).

- **Toggle:** the table gets a first toggle column (an accessible button with
  `aria-expanded`). Enter on the toggle cell or a click expands or collapses it.
  Records start collapsed, and a record whose child count is 0 has no toggle.
  Cards show a full-width button at the bottom ("Feladatok (2)"; `Alelemek (n)`
  for a hierarchy, at least 40 px tall) only when there are children. Tiles do
  not expand, and a preview never expands further.
- **Preview:** the child view's columns without the parent field. Headers sort
  only: no filters, search, toolbar, row numbers, marks or title bar. Editable
  columns (a switch, for example) stay editable through the normal grid-edit
  path. It is always a table. Its height fits its records up to
  40 % of the viewport in rows (never fewer than 5 or more than 10), and only then
  does it scroll. It updates live like any list.
- **Child count:** every `list` item (also `__watch` snapshots) of a view with a
  sub-view carries `_subview`: the integer number of child records the same
  actor could list with the filter `{field: id}` (child ACL, `where` and tenant
  scope; a hierarchy child counts its top-level records only, as it lists them),
  from one grouped `COUNT` per page. At `0` the toggle and the card button are hidden; it is
  left out (toggle shown) when the child has no SQL list source or the actor may
  not filter on the field.
- **Full view:** the toolbar command named after the child list (`Alelemek` for
  a hierarchy) opens the child list of the record the toolbar acts on, in a
  window, full screen below 768 px. A window holding one framework feature shows
  it edge to edge: the window header is its only header. The open preview
  refreshes when the window closes.
- **Open on activation:** with the parent view's `activate: 'subview'`
  ([record activation](#activation)) a double-click or Enter on a record opens
  this full window from the table, cards and tiles, also at a count of 0;
  `activate: 'page'` opens the child's own page filtered to the record instead.
- **Embedded child:** by default a different child view has no menu entry of
  its own; `embed: false` keeps it. The child view must be offered to the actor,
  otherwise the parent has no sub-view.
- **Toolbar on a selected child:** a record selected in a preview takes the
  parent toolbar over for the actions the child view has under the same name
  (`update`, `delete`, `Adatok`, …), which then run on that child record; the
  others are disabled. Selecting a parent row gives the toolbar back. Editing a
  child keeps its parent: the parent field is hidden and sent as that record.
- **Not selectable (`select: false`, JSON `"select": false`; default `true`):**
  for a child list where only a flag is set. Its rows, in the preview and in
  the full window, never become the cursor record: native Grid/DataView
  selection and key navigation are off (no highlight), there is no toolbar
  delegation, and double-click or Enter opens nothing. The window toolbar keeps
  only `create` and upload actions (no `Adatok`, edit or delete). Declared
  editable switch cells still save through `__edit`. `views()` carries
  `subview.select: false`; it is left out at the default.
- **Partial count (`_subview_open`):** a child `ListSource` with a
  `countWhere` (trusted SQL added only to the count) counts part of what it
  lists, for example the accounts with access. Its parents then also carry
  `_subview_open: true` and expand even at a count of 0.
- **Hierarchy:** the list shows the records with an empty parent field (also
  when it is itself the child of another record); the toolbar command then opens
  the selected record's own children (`Alelemek`).
- **Security:** the preview and the window call the child resource's ordinary
  `list`, `__edit` and actions, under its ACL, tenant scope and audit. The parent
  field filter is a scope of the view, not an authorization. A new record in the
  window gets the parent record as its parent field (hidden on the form, sent
  with the request); an update does not send the parent field.
- **Rendering:** the row only reserves a slot. The nested widget sits in a
  fixed layer clipped to the visible data area, so its mouse and keyboard
  handling never reaches the parent Grid or DataView. The native Grid sub-row
  is a PRO feature that the GPL Standard edition ignores; this is the
  framework's Standard-edition implementation (a spanned framework row).

Limits: a preview loads its first 100 records (more load while scrolling); the
toolbar command opens one record's list at a time.

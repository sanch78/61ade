# Workspaces and live lists

Status: implemented and verified with synthetic integration on 2026-10-16.
Requirement: FB-0006.

Views declare validated layout trees with separate filter/grid and optional
embedded form. Headers, sizes, collapse and order are configurable. Default:
left filter, right results, overlay editor. Panel mode requires a form area.
Singleton views are direct readable/editable details without a grid.

The agent-facing design rules for introducing or extending grid, data-tree, and
card surfaces live in the [61ade-ui skill](../.agents/skills/61ade-ui/SKILL.md).
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
exactly as on a menu page. Preferences follow the id of the definition the
`ListView` gets: an offered id shares that menu page's saved state, a held
definition passed under the page's own view id keeps its own
([ListView](toolkit.md#listview)):

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
`CommandBar.ts`). Fixtures import the internals from there; the internal
`Workspace` constructor is not a contract ([migration M8](toolkit.md#migration)).

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
  `record` command acts on the cursor record like the built-in
  record actions: disabled without one and, unless its own rule accepts them,
  with several marks; a `toolbar` command needs no record. The built-in
  `Adatok` command is the registry's `details` record command. While a
  selected [sub-view](#sub-views) record holds the toolbar, a command the
  child view has too (`details`, or a name the child view declares) runs on
  that child record with the child view; any other command stays on the
  parent's own cursor record, so `view` and `row` always belong to one
  resource (a hierarchy shares every command). Commands run in
  the browser; every server effect is an ordinary ACL-checked action call.
- **Toggle commands:** a command registered with `type: "toggle"` (toolbar
  placement only) is a two-state button with `aria-pressed`, a checked
  `menuitemcheckbox` in `Műveletek`, for a list-wide mode such as "include
  sub-categories", "show archived" or "only mine". Its state is a preference
  of the user and the **view id**, not of the list's scope, so a host that
  mounts the list with another `scope` (a scoped list's other preferences are
  keyed `<view id>@<field>`) keeps it, and a host reads it before the first
  load from `app.preferences.scope(<command name>)`. The toggle is never
  delegated to a sub-view record; the host gives it its meaning through the
  list's `toggle` event or the command's `toggle` callback
  ([toggle command](toolkit.md#registries), [FB-0159](feedback.md#fb-0159)).
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
([toolkit views](toolkit.md#views)). A second declaration with the same id
throws; `Registry::updateView(View::list(…))` changes the declared view (for
example its columns after `SqlResource::register()`) and keeps its menu
position and sub-view ([rule](toolkit.md#view-id-rule)). In the bootstrap a list view's own
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

<a id="list-scope"></a>

**Scope** ([FB-0166](feedback.md#fb-0166)): `"scope": {"field": "group_id",
"value": "7"}` limits the list to one value of one field: a scoped `ListView`
(a nested list, a sub-view preview or window, a tree navigation's list, a
page's `scope`) and a `Tree`'s levels send it, the top level of a hierarchy on
itself as the scope `""`. It takes the same fields and value checks as a
filter (select options, checkbox `0`/`1`, number digits, media classes) and
the same field ACL, but compares exactly, also a text field. The same field
may not also be in `filters`. A field declared **scope-only**
(`scopeOnly: true`, JSON `scope_only`, [field presentation](field-presentation.md))
is accepted only here: `filters` and `sort` naming it are refused (`A mező nem
szűrhető.`, `A mező nem rendezhető.`, 403), and it is in no `filters`,
`sortable`, `columns` or `detailFields` metadata. The scope counts like a
filter (`matched`; `total` stays the unfiltered count). A project's own
`list` handler that read a scope from `filters` reads `values.scope` instead.

### Integrated grid header filters

Every filterable field that is present in a view's grid receives a native DHTMLX
header filter above its title. Static image presentations offer no filter in the
header, filter panel or cards/tiles filter dialog, whether declared on the field
or the view column. Programmatic filename filters remain supported by the list
action; this changes only the offered controls. Text and number fields use an
input; select and
checkbox fields use an option picker whose values come from the declared field
options; the picker shows option labels, sends option keys and lists every
option again when reopened. A leading `Mind` item clears the option filter.
An empty control omits that field from the request.

**No filter versus the empty value** ([FB-0195](feedback.md#fb-0195)): a
field present in the list's filters is a condition, an absent one none. A
select option declared with the empty value (for example `'' => 'Nincs
(fő feladat)'`) is a real condition, `filters: {field: ""}`: the header picker,
the filter panel (`eq:`; `Bármely` is no filter) and the cards/tiles dialog
offer it, the list requests it, the menu page saves it and restores it after a
reload, and `setFilters({field: ""})` and a `#filter.<field>=` preset apply it.
An initial or reset list shows no selected condition (an empty header control,
`Bármely` in the panel). For a text, number or checkbox filter, or a select
without an empty option, an empty value stays no filter. Changes replace the
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
value. Secret, textarea, scope-only, unknown and partially denied fields cannot
sort.
Sortable metadata lists permitted public field names. Consumers need no frontend
or sorting endpoint; they supply indexes for frequently sorted large tables.
The framework does not alter schemas.

<a id="list-sort"></a>

**First sort** ([FB-0152](feedback.md#fb-0152)): a list view may declare
the sort it starts with, `sort: ['field' => f, 'direction' => 'asc'|'desc']`
(PHP `View::list`, `Registry::view`, `SqlResource::register`; JSON
`resources.<name>.view.sort`, `{"field": "id", "direction": "asc"}` for
oldest first). It applies until the user picks a sort, which the list keeps
as before (per page and user; a scoped list under `<view id>@<field>`, or the
`ListView` option `preferencesKey` that several scopes share,
[ListView](toolkit.md#listview)).
`field` is `id` or a field the list can sort by (not secret, a password,
textarea or multiselect); a singleton, a list with a [manual
order](#manual-order) (its position sorts it), an unknown field or a
malformed value throw `InvalidArgumentException` at definition time. The
bootstrap carries `options.sort` only while the actor may sort by that field
(a field ACL may hide it); then the list starts at `id` descending.

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
A `list` request without parameters is the first cursor window (default
limit 100); a list id is refused (400), there is no offset paging.
Pager/refresh buttons were removed.

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
channel once. A module's `app.live.subscribe(resource, query, handlers, {signal})`
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
new ticket; `__ticket` answering 401/403 ends it the same way. Every such end,
and a `__watch` 401/403, then signs the page out
([ended session](shell.md#ended-session)). A 4409 reloads the
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
batches of the interval still run. Batch size is measured in UTF-8 bytes.
`values` carries nothing but `subscriptions`; any other shape is refused (400).

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

A menu entry with [attention](shell.md#menu-attention) holds one more
subscription on the same channel: the view's list read with its declared
filters and one row, whose `matched` count the entry shows
([FB-0160](feedback.md#fb-0160)).

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
one column on mobile; a view or `ListView` may cap the columns
(`cardColumns`, one card per row with `1`,
[cards only and full-width cards](#cards-only-and-full-width-cards)). Cards show all registered fields readable in list responses,
including fields omitted from the grid, excluding technical ACL/revision metadata
and secrets.

<a id="long-text-in-cards"></a>

**Long text in cards** ([FB-0152](feedback.md#fb-0152),
[FB-0177](feedback.md#fb-0177)): a `textarea` field shows at most 4 lines on
a card (CSS line clamp, the field's line height, keeping its line breaks);
the rest is clipped. The field's `column.cardLines` (JSON `column.card_lines`,
a whole number 0–50, textarea fields only) sets another count, `0` the whole
text. The record details (`Adatok`) and the edit form show the whole text. A
field with a registered presentation or field-type display renders its own
markup and is not clipped. Screen readers still read the whole value of the
card. A label beside its value takes two fifths of a narrow card and at most
220 px of a wide one.

<a id="card-groups"></a>

**Field groups in cards and details** ([FB-0177](feedback.md#fb-0177)): the
fields' [form sections](#form-sections) also group the cards, the `Adatok`
window and `RecordDetails`. Each section is a framed group with its label as
the heading, at the place of its first field; the other short fields form one
untitled group at the place of the first of them. The groups sit side by side
in as many 240 px columns as the card or details are wide (CSS grid, so a
full-width card of four sections shows four columns and a phone one), a group
holding a long text spans the row, and a long text outside every section
(the prompt or description of the record) follows the groups across the whole
width with its label above it. Without any section the fields stay one list
in their order, as before. A section's open or fixed state does not matter
here; the same ACL-projected fields are shown as without groups.

Groups in the same row stretch to the tallest group's height, with their
headings and fields at the top. Each row is sized independently, using CSS
only; there is no height measurement or section reordering.

<a id="card-group-columns"></a>

**Project section-column sizing** ([FB-0186](feedback.md#fb-0186)): the
project's [stylesheet](toolkit.md#module-loading) can set inherited CSS
properties on `:root` for the application, or on a containing project element
for a composed list or details panel:

```css
/* Automatic equal-width columns, with a preferred minimum of 280 px instead of 240 px. */
:root {
  --blade-record-group-min-width: 280px;
}

/* Or explicit columns: the right column gets twice the width of the left. */
.project-record-panel {
  --blade-record-group-columns: minmax(0, 1fr) minmax(0, 2fr);
}
```

`--blade-record-group-columns` accepts a CSS Grid track list and overrides
automatic column sizing. For a fixed left width and a flexible right column,
use `260px minmax(0, 1fr)`. Remove the property (or set it to `initial`) to
return to automatic columns; `--blade-record-group-min-width` then controls
their minimum width (default `240px`, capped at the available width).

Below **492 px of the record's content width**, the section grid becomes one
column, including when an explicit track list is set. A CSS container query
uses the record's width, so a narrow panel on a desktop stacks too. This
threshold is fixed; it also applies when the automatic minimum is changed.
The 12 px gap, long-text groups spanning all columns, and the full-width text
below the groups are preserved. This configures sections inside a record,
independently of `cardColumns` (the number of complete records per row).
It applies to cards, the `Adatok` window and `RecordDetails`, without changing
forms or adding PHP/JSON options. Use track widths that fit the panel;
`minmax(0, …fr)` tracks allow long content to wrap within a declared ratio.

The feature demo's `record-groups.css` sets `1:2` columns through this same
project stylesheet interface; `Mellékletek` shows the two unequal-height field
groups with equal outer heights and the long text below them.

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
disappear when rows leave the data window. Marks and the cursor record are
transient by design (owner decision, 2026-10-30): they are never stored in the
UI preferences, so a reload or a new opening starts without them, and a
toolkit `ListView` has no marks event ([toolkit limits](toolkit.md#limits)).

Toolbar/view-switch internal layouts are type none; the outer results panel
owns the only frame. Toolbar fills its own height and scrolling content cannot
overdraw it. Grid mode has a theme-colored 1 px divider above column headings.
Filter reset and authentication secondary actions are native secondary flat buttons.

<a id="activation"></a>

## Record activation (double-click and Enter)

A list view can declare what a double-click or Enter on a record runs, in the
table, cards and tiles alike. The activation is a command the view already has,
run exactly as its toolbar command runs it on that record. The consumer's own
server behavior is a registered record action; its own browser UI is a
`view:<id>` [record view](toolkit.md#record-views) of a kind its module
registers. The declaration never carries a callback.

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
  and takes `*`), the same in table, cards and tiles. A media field (`file`
  field or `column.media`) is keyed by its file's exact MIME type when the map
  names it (`text/javascript`), otherwise by its MIME class (`image`, `video`,
  `audio`, …) from the row's `_media`; no file or a hidden one takes `*`.
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
  with the resolved target before it runs. A listener can call
  `preventDefault()` synchronously to skip that default and run project
  behavior instead; returning a value or cancelling after an `await` has no
  effect. With no cancellation the behavior is unchanged
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

<a id="manual-order"></a>

## Manual order, drops between lists and the drag handle

[FB-0108](feedback.md#fb-0108). A resource whose records have an order the
users set (playlist items, steps, menu entries) declares it on the
`SqlResource` (JSON `storage.order`):

```json
"storage": {"table": "signage_playlist_items", "key": "id", "order": {"field": "position", "scope": "playlist_id"}}
```

- `field` is a declared `number` field (not computed, editable, secret or
  media); `scope` an optional declared field: the records sharing its value
  are ordered among themselves. The server owns the position: it is read-only
  (never a create or update input), a new record goes last within its scope,
  and positions are not part of a record's revision, so moving one record never
  makes the others stale.
- The resource gets the `move` action (`update` enabled; its own ACL entry,
  `ui` channel): `before` is the id of a record of the same scope the record
  goes in front of, `''` puts it last; the scope is renumbered 1…n in one
  transaction and audited. A `before` outside the scope is a field error, a
  stale `revision` 409.
- The list is sorted by the position only (`sortable` is the position, no
  header or card sorting) and the view carries `options.order`. With `move`
  offered, the rows are dragged into place (table, cards and tiles), the
  toolbar has `Feljebb` and `Lejjebb` instead of the action's form, and
  Alt+↑/Alt+↓ moves the cursor record; a move saves and reloads the list. In a
  compact preview the order shows but nothing moves.

A list view declares that it takes records dragged from another list (JSON
`view.drop`, PHP `View::list(…, drop:)` / `Registry::view(…, drop:)`):

```json
"view": {"title": "Lejátszásilista-elemek", "drop": {"from": "signage_assets", "field": "asset_id"}, "actions": ["get", "create", "update", "delete", "move"]}
```

- `from` is a resource, `field` a registered non-secret select, text or number
  field; the view declares `create`, and the browser gets `options.drop` only
  while `create` is offered. A drop creates one record per dragged record
  through `create` (`field` = its id, a scoped list's parent field added), at
  most 100; in a manual order the new records land where they were dropped
  (a `move` each). Every create is validated, authorized and audited as usual.
- The source is a `ListView` of that resource created with `dragSource: true`
  ([toolkit](toolkit.md#listview)); the dragged record is copied, or every
  marked record when it is marked. The keyboard route is the target's own
  `Hozzáadás` form.
- Suite's drag only signals: its own data never changes, the server's answer
  is reloaded.

Draggable rows (a manual order with `move`, a drop target that can reorder, a
drag source) start with the usual drag-handle column (`dxi-drag-vertical`,
decorative; its tooltip says `Húzással áthelyezhető` or `Húzással hozzáadható`);
cards and tiles show the same handle. Dragging works from any cell.

<a id="card-filters"></a>

## Filters in cards and tiles

A list whose filters are the table's header filters (no declared filter panel)
shows `Szűrés` in the toolbar while it shows cards or tiles, where the headers
are not visible, the same way `Rendezés` appears there: it opens the filters in
a dialog (Apply, Reset, Cancel) with the header filters' values, and applying
updates the header filters too. Each header filter input is named
`Szűrés: <column>` for assistive technology.

<a id="hosted-list"></a>

## A list in a host's panel

A `ListView` placed in a region of a page ([`PageLayout`](toolkit.md#pagelayout))
is created with `panel: false`: it draws no titled panel of its own, so the
region is its only frame and title, and its toolbar and data fill the region.
The declared filter panel and form panel are not used there (header filters,
the cards' `Szűrés` dialog and form windows instead). `showId: false` leaves
out the ID column and the cards' `ID · n` line on a page whose users do not
work with ids.

<a id="nézetválasztás-és-fejlécjelzések"></a>

## View selection and header indicators

The final right-aligned Toolbar dropdown shows the current mode: `Táblázat`,
`Kártyák` and, when offered, `Csempék` (tiles). Switching preserves the
visible record. On mobile a table is forced to cards: the table item is
disabled and the desktop preference is restored when the window widens; when
tiles are offered they stay available on mobile. The chosen mode persists per
user, view id and page (`UiPreferences`, unknown stored values read as table).
Singleton views have none. This replaces FB-0019's two buttons per FB-0020.
A view or `ListView` that declares `modes` offers only those; with a single
one the dropdown is left out
([cards only and full-width cards](#cards-only-and-full-width-cards)).

<a id="cards-only-and-full-width-cards"></a>

### Cards only and full-width cards

[FB-0169](feedback.md#fb-0169). A list of long text (notes, comments,
descriptions, messages) can be held to cards and shown one card per row:

- **`modes`** (PHP `View::list`, `Registry::view`, `SqlResource::register`
  `modes: ['cards']`; JSON `view.modes`; `ListViewOptions.modes`): the
  presentations the user may choose, distinct `table`, `cards` and `tiles`,
  in the order given; the first is the start (a `ListView` `mode` may pick
  another of them). The `Nézet` dropdown offers only these; with one it is
  not shown, also inside `Műveletek` on a narrow bar. A kept choice of
  another presentation is ignored and left as it is, so the same preference
  key used without the restriction still finds it. `tiles` requires a view
  that offers tiles (`tiles` or a media or static image column).
- **`cardColumns`** (PHP `cardColumns: 1`, JSON `view.card_columns`,
  `ListViewOptions.cardColumns`): at most this many card columns, 1–6. With
  `1` each card fills the list's width; with more the 340 px rule still
  applies below that number. Tiles keep their own `tileMinWidth`.
- **Precedence:** a `ListView` option wins over the view's declaration; a
  menu page, a sub-view window and a tree navigation's list use the view's.
  A compact preview (an expanded row or card) is always a table.
- **Phone:** unchanged. A phone shows a table as cards, also when `table` is
  the only mode, in one column; the dropdown stays hidden with one mode and,
  as before, disabled without tiles. With `table` and `tiles` but no
  `cards`, the enabled `Táblázat` entry leads from tiles back to the cards
  that stand in for the table.
- **Long text:** a `textarea` keeps its
  [4-line card preview](#long-text-in-cards) (or its `cardLines`) at full width too; `Adatok` and
  the edit form show all of it. A card's media slot keeps its aspect ratio, so
  a full-width card with an image or video is tall: use it for text records.
- **Validation:** an empty or non-list `modes`, an unknown or repeated entry,
  `tiles` where the view offers none, `cardColumns` outside 1–6 or either
  key on a singleton is a developer error (`InvalidArgumentException`
  `Invalid view presentation.`; JSON keys of the wrong type fail the
  configuration check). The same `ListView` options and a `mode` outside its
  `modes` throw `TypeError`.

Demo: `Feladatlap` → `Jegyzetek` ([D7](demos.md#d7-task-page)): the notes view
`demo_task_notes` declares `"modes": ["cards"], "card_columns": 1`, while the
same notes in `Munka` pass `modes: ["table", "cards"]`.

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
  the image is decorative (`alt=""`) because the title is beside it. The
  browser always receives the camelCase `imageBase`/`altOf`
  ([`ColumnMetadata`](toolkit.md#conventions)), whichever spelling was declared.
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
  table, cards, tiles and details, and is never sortable or editable. The
  browser receives it as `mediaOf`.

<a id="file-field"></a>

### File field

`type: "file"` with `file: {resource, mount, accept, folder?}` (PHP
`new Field(…, 'file', file: [...])`) stores a file id of a file manager's
mount. The server validates that the id is a live file of that mount, of an
accepted MIME class, which the actor may read (`thumbnail_get`); errors are
field errors on every channel. Its metadata carries the resolved `folderId`,
the accepted classes, the file manager's upload policy narrowed to them (no
folders), `canUpload` and `canChoose` ([camelCase](toolkit.md#conventions)); list rows carry its `_media` descriptor, so the
column is a media column automatically. The form control is a single-file
input: `Fájl megadása…` opens the browser's native file dialog; once a file
is present the command is `Fájl cseréje…`. Clicking the preview area or
pressing Enter/Space on the file name opens the same native dialog. The
control shows the file name and a full-width, 180 px high preview that keeps
the entire image visible with `object-fit: contain`; it does not crop it to
an avatar. `Törlés` clears optional references. Grid editing is unsupported.

When upload is allowed, focus the file name or a command inside the field and
paste a clipboard file (Ctrl+V / Cmd+V), or drop one file onto the field. This
queues it through the shared uploader in the background, without opening or
focusing its window. The field shows upload status and an immediate local
image preview (PNG/JPEG/GIF/WebP up to 20 MiB); its value changes to the stored
file id only on success. Ordinary text paste and paste elsewhere in the form
are untouched. More than one file is refused with a field hint.
`accept: ["image"]` makes this an image-only field using the mount's existing
extension and size policy; no new field type or server route is needed.

For example, with an existing `files` resource and `assets` mount:

```json
{
    "name": "cover",
    "label": "Cover",
    "type": "file",
    "file": {
        "resource": "files",
        "mount": "assets",
        "accept": ["image"]
    }
}
```

Framework form save paths report a field validation error while the transfer
is pending; the user can save once it settles. Failure keeps the prior
reference and shows the reason beside the field. Providing another file or
clearing the field invalidates older upload callbacks. Closing the form
releases listeners and object URLs; an already queued transfer may finish
and leave an unreferenced file in the declared folder. Uploading stores the
file immediately; **Save** assigns it to the record. Clearing an optional
field clears its reference, not the stored file. This behavior is shared by
the public `RecordForm` and built-in action, singleton and bulk forms.

The form control no longer opens a stored-file picker or the full uploader
window ([FB-0126](feedback.md#fb-0126), superseding that part of FB-0123).
Existing-file selection remains an explicit toolkit
[`FilePicker`](toolkit.md#filemanager-and-filepicker) operation. The list's
`Feltöltés` command is the independent multi-file upload flow. File ids, field metadata, server
validation and ACL are unchanged; a field without upload permission offers
no local-file input or stored-file picker.

Consumers that store uploads themselves use `FileManagerDefinition::files()`
(`MountStorage::folder()`/`store()`), which applies the file manager's
validation, metadata and thumbnails.

<a id="stored-file-field"></a>

### Stored file field (the project's own storage)

A `file` field whose bytes the project stores itself (its own store, rows and
tenant rules) names two project actions instead of a file manager mount
([FB-0167](feedback.md#fb-0167)):

```php
new Field('file', 'Kép', 'file', file: [
    'upload' => 'items.file_upload', // an action with an UploadPolicy (tempRoot set), no fields
    'get' => 'items.file',           // optional: a GET action streaming the file whose id is the value
    'accept' => ['image'],           // MIME classes, checked on the bytes
]);
```

JSON uses the same keys (`"file": {"upload": "items.file_upload", "get":
"items.file", "accept": ["image"]}`); the actions are PHP-registered, because
an `UploadPolicy` is PHP-only. `upload` and `get` are `resource.action`, split
at the last dot. Once every action is registered (`ApplicationDefinition`,
every `Workspace::views()`; a JSON module may name actions that PHP registers
after the build), `Registry::checkFileFields()` refuses an upload action
without an `UploadPolicy`, without a `tempRoot` or with fields, and a `get`
action that is not a GET action.

The flow, with the form's other fields saved in the same action and revision:

1. **Upload.** The form control is the one of the [file field](#file-field):
   `Fájl megadása…`/`Fájl cseréje…` with the native single-file dialog,
   paste and drop, a background transfer through the shared
   [uploader](uploader.md) (no upload window), status and a local image
   preview, `Törlés` on an optional field. It uploads to the upload action
   (target `null`). Before the handler runs, the executor takes exactly one
   file. The MIME type detected from the bytes must belong to an `accept`
   class of a field that names the action; otherwise the upload fails with
   code `type` (`A fájl típusa ehhez a mezőhöz nem engedélyezett.`). The
   policy still applies its extension and size rules (`too_large`). The handler
   stores the bytes (for example in a content-addressed store and a pending
   row) and returns `['id' => token]`: an opaque string of 1–200 characters,
   `[A-Za-z0-9][A-Za-z0-9._:-]*`. Any other answer is a developer error (500).
   The executor records an **upload claim** for the token. The claim binds the
   actor, channel, session (the hash of the session id or bearer token), tenant,
   upload action, detected type, name and size, and lasts until the policy's
   TTL. It is stored under `<tempRoot>/claims/`; it never holds the token and
   never the bytes.
2. **Save.** The field's value is the token until the save; the record
   action's handler receives it with the other values and commits the file
   with the record (for example `afterSave` marks the pending row committed
   and the column keeps the token, or the handler stores another file id).
   A new value is accepted only for an unexpired claim of the same actor,
   session, tenant and upload action, of a class the field accepts. Every
   other value (a made-up id, another record's file id, another user's,
   session's or tenant's token, a used or expired one) is the field error
   `A kiválasztott fájl nem érhető el.`, and a claim of another class is the
   field error `A fájl típusa ehhez a mezőhöz nem engedélyezett.`. The claim is
   removed after the save commits, so a token is claimed once; a save refused
   for any reason keeps it. As for every `file` field, an unchanged stored
   value is not checked again, and `''` clears an optional field.
3. **Cancel.** A form closed without saving creates no record. The project's
   pending upload stays unclaimed: the project owns the bytes and expires
   them by its own rule; the claim expires with the TTL.
4. **Preview.** On update the control asks the `get` action for the stored
   value with a `HEAD` request: its `Content-Disposition` file name and
   `Content-Type` give the name and type. An image is shown from the same URL
   (a `DownloadStream`: inline, `Range`, `ETag` as usual). The URL is
   `?blade=1&resource=…&action=…&id=<value>`. Without the `get` action or its
   right (`canPreview`), or when the file cannot be read, the control names
   the value `Mentett fájl` and shows no preview.

Browser metadata of the field is `file: {upload: {resource, action}, get:
{resource, action} | null, accept, policy, canUpload, canPreview, canChoose:
false}` (`StoredFileFieldConfig`; `policy` is the upload action's
`UploadPolicy` metadata, `canUpload` and `canPreview` the actor's offering of
the two actions). It is a form field only:
- it is never a view column (a declared column naming it is refused), never in
  `detailFields`, the filters, the `sortable` fields, a first sort or a scope,
  and `SqlResource::register` leaves it out of the default columns;
- a `filters`, `sort` or `scope` request naming it is refused (`403`);
- show the file elsewhere with a column of the project's own data, as the demo's
  computed `Fájlnév` does.

Grid editing, bulk editing, a `secret` field and the `media`, `editable` and
`presentation` column keys are refused. Every call is an ordinary action
with its channel, API token scope, ACL and tenant checks. The GET action
decides which files it serves (the demo: a committed file of a record, or the
actor's own pending upload).

The feature demo's `Mellékletek` (`examples/demo-app/attachments.php`)
implements it; `tests/shell/stored-file.php` and `stored-file.spec.cjs`
cover it. The mount-backed `file` field above is unchanged.

<a id="stored-file-multiple"></a>

#### Several stored files

`'multiple' => n` (2–20, JSON `"multiple": n`) lets a stored file field hold
up to n files ([FB-0181](feedback.md#fb-0181)):

```php
new Field('gallery', 'Galéria', 'file', file: ['upload' => 'items.file_upload', 'get' => 'items.file', 'accept' => ['image'], 'multiple' => 6], section: 'Galéria', sectionFill: true),
```

- **Value:** the comma-joined list of tokens and file ids (a request may send
  a list); distinct, each of the single field's shape, at most n
  (`Legfeljebb {count} fájl adható meg.`). The whole value counts against the
  field's `max` (default 255): raise it for long ids. The handler receives the
  list string and commits the files (the demo's `afterSave` splits it).
- **Claims:** only the ids the stored value does not hold are new, and each new
  one needs its own unexpired claim, exactly as for one file; a kept id needs
  none, a removed one is simply left out. The claims are removed after the
  save commits. The upload action still takes one file per request.
- **Form:** the uploader's look inside the form instead of one preview: a
  count line (`3 / 6 fájl`, the field's label, required mark, errors and
  focus), under it the uploader's drop zone (hint, the allowed types and size,
  `Egyszerre legfeljebb n fájl tölthető fel.`, `Fájlok kiválasztása` with a
  multiple-file dialog; drop and paste) and its queue (Előnézet, Név, Állapot,
  Műveletek). The record's files are rows `Mentve` with their name and image
  preview from the GET action; each new file is a background upload of its
  own through the shared uploader (progress, cancel, retry) and, once done,
  a row `Feltöltve, mentésre vár` in the value. `Eltávolítás` takes a row out
  of the value; nothing is deleted before the save. More files than the limit
  and files of another type are refused on the count line. Saving waits for
  running uploads (`Várd meg a fájl feltöltését.`).
- **Geometry:** the zone and the queue have a fixed height (340 px; in a
  [section-filling](#form-section-fill) accordion section the section's share,
  at least 200 px); the queue scrolls inside, the form never grows with the
  files.
- **Read-only:** the queue without the zone and without commands.

<a id="delete-usages"></a>

### Record delete policy and usages

`SqlResource::registerDelete(…, deletePolicy: 'delete'|'archive')` (JSON
`operations.delete_policy`; default `delete`, which needs no extra columns;
`archive` is the recommendation for new development). `archive` sets the consumer's
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
re-validated on save; the picker is offered only with `canChoose` (`list` on
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
permitted fields except those declared `column.details: false`
([field presentation](field-presentation.md)).

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

<a id="window-sizing"></a>

Filter/CRUD/bulk/detail windows size to rendered content, capped at 800 px
and at the viewport height minus 24 px ([FB-0177](feedback.md#fb-0177)): a
centred dialog, not a full-height one. Forms retain 24 px below the final
button; details retain 24 px beyond article padding. A taller form scrolls
between the fixed window header and its action row: the row (`Mégse` beside
the submit button) sticks to the lower edge of the form's scroll area with
one rule above it, so the buttons stay visible and keep working the form
while the fields scroll behind them; a short form shows the same row right
below its last field. Validation remeasures; manual resize remains available.
`app.ui.window` takes `maxHeight` (px from 120; `Infinity` grows to the
viewport) for a project that wants a taller fitted window; its requested
`height` without fitting is not capped. A Form textarea directly in a content
window takes any height the window has beyond its fitted content: Suite sizes
the textarea from its cell, which grows (`admin.css`), so a capped or
manually enlarged window has no empty band below its actions. `fitWindow`
pauses that growth and the sticking while it measures (the measure flag is on
the window element itself; before FB-0177 the pause did not apply, so a
window kept the height it was opened with and its textarea filled it). Every
form and details window is sized by `fitWindow`; no window keeps a fixed
pixel control height beside spare space. Document windows (the file manager's text
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
mobile cards keep their selector disabled. A client command registered with
`pinned: true` stays in the bar after the Actions button (a mode switch such as
a toggle), as a `CommandBar` range does ([FB-0163](feedback.md#fb-0163)).

DataView uses native itemsInRow widths with border-box and no content-driven
flex shrinking. Long unbroken words wrap; every mobile card has equal width.
FB-0028. The same holds for a capped column count (`cardColumns`): with one
column every card has the list's full width
([FB-0169](feedback.md#fb-0169)).

<a id="megerősítés-művelet-előtt"></a>

## Confirmation before actions

Action/JSON confirm requests the shared [dialog](dialogs.md#szerver-által-deklarált-megerősítés)
before individual or bulk execution. Result reveals are reported through the
non-blocking toast described below.
Actions that declare no input fields execute directly from the command bar; they do
not open an intermediate form containing a second Execute button. Successful
toolbar actions, including one-time secret reveals, report through a non-blocking
toast; only actions that declare confirmation metadata open a confirmation dialog.

<a id="view-guide"></a>

## View guide

Every view can carry a `guide`: plain text that tells the user what the view
shows and which capability it demonstrates ([FB-0107](feedback.md#fb-0107),
[FB-0109](feedback.md#fb-0109)). The shell shows it in a non-modal, closable
window at the lower right of the workspace (full screen below 768 px), titled
`Útmutató: <view title>`.

```php
$registry->view('tasks', 'Feladatok', $columns, $actions, guide: "Mit látsz itt.\n\nMit próbálj ki.");
$notes->register($registry, 'Jegyzetek', guide: '…');  // SqlResource
new FileManagerDefinition(/* … */, guide: '…'); // DiagramDefinition, CalendarDefinition likewise
new View('demo.dashboard', 'demo.dashboard', 'Irányítópult', guide: '…');
// Any view by id, the framework's own views (administration, API keys) too:
new ApplicationDefinition(/* … */, guides: ['blade_users' => '…', 'blade_api_keys' => '…']);
```

JSON: `resources.<name>.view.guide`, `views.<id>.guide`, and the
application-level map `application.guides` (`{"<view id>": "<text>"}`).

- **Text:** plain text only, at most 4000 characters, localized like a title
  (the catalogue key is the whole text). A blank line separates paragraphs, a
  single line break stays a line break. No markup is interpreted.
- **Application map:** `guides` sets or replaces the guide of the named views
  once every view is declared (`Registry::updateView`, so sub-views, trees and
  the menu position stay). An unknown view id, a non-string or invalid text,
  a JSON list instead of an object, or guides without a workspace throw at
  definition time.
- **Once per session:** the first time a view with a guide opens as a page in
  a sign-in session, its guide opens by itself; then it no longer does,
  whether it was closed by hand or not. The mark is per page path, user and
  view in the tab's `sessionStorage` (key `blade-guide:2:[path, user, view id]`),
  so a reload or a language switch keeps it and a new tab starts afresh. The
  signed-out page (sign-out, session expiry) clears every mark, so the next
  sign-in shows each guide once again. Leaving the view closes its guide.
- **Not over a work window:** while a non-modal window is open — a project's
  [long-lived window](toolkit.md#long-lived-windows), which survives the
  navigation — a view opened behind it does not open its guide by itself
  ([FB-0200](feedback.md#fb-0200)): the window keeps the focus and stays on
  top. The guide is not marked shown, so it opens by itself at the view's next
  opening without such a window; `Útmutató` shows it on request at any time,
  above the window (below 768 px the full-screen window first has to close).
- **Again:** when any offered view has a guide, the top row gets the
  `Útmutató` control left of the language selector: a button labelled like the
  selectors beside it (tooltip `A megnyitott nézet útmutatója`), enabled while the page
  view has a guide. Below 768 px it moves with the tenant, language and theme
  selectors into the right-hand `Beállítások` hamburger menu; main navigation
  stays in `Menü`.
- Not shown for a view opened in a window (`open: "window"`). A guide is
  presentation only: it grants nothing and hides nothing.

<a id="view-availability"></a>

## View availability (per tenant or runtime state)

A view can depend on runtime state of the active tenant or actor, for example
a service a tenant switched on, a module or a feature flag
([FB-0204](feedback.md#fb-0204)). `available` is a server-side
`Closure(Context): bool` on the view:

```php
use Blade\Feature\Context;

$serviceOn = static fn(string $service): Closure => static function (Context $ctx) use ($service): bool {
    if ($ctx->tenant === null) return false;
    $q = $ctx->db->prepare('SELECT enabled FROM services WHERE tenant_id = ? AND service = ?');
    $q->execute([$ctx->tenant, $service]);
    return (bool) $q->fetchColumn();
};
$messages->register($registry, 'Üzenetek', group: 'Kapcsolat', available: $serviceOn('contact'));  // SqlResource
$registry->view('notes', 'Jegyzetek', $columns, $actions, available: $serviceOn('notes'));
$registry->addView(new View('app.board', 'app.board', 'Tábla', available: $anyServiceOn));         // any kind
// Any declared view, the built-in list of a JSON resource or a file manager too:
$registry->updateView($registry->viewById('notifications')->with(available: $anyServiceOn));
```

JSON: `resources.<name>.view.available` and `views.<id>.available` name a
workspace binding (the closures the consumer passes to
`JsonApplication::load`/`WorkspaceConfiguration::build`, like `hooks`); an
unknown name throws at definition time.

- **When:** `Workspace::views()` calls it for each declared view once per
  bootstrap, after the tenant check (a tenant-scoped view without an active
  tenant is not offered anyway) and before the record `get` and kind checks.
  The Context carries the actor, the active tenant (null without one) and the
  database. Keep it a cheap read; an exception fails the page like a
  definition error. It is never serialized.
- **False:** the view is left out of the bootstrap as if it were not
  declared, for every kind (the built-in `list`, `files`, `diagram`,
  `calendar`, project kinds and record views): no menu entry, and a menu group
  left without views disappears with its separator; `#view=<id>` opens the
  empty workspace and `app.navigate` returns `false`; `app.viewDefinition`
  returns `undefined` (a component that names the view throws `not
  offered`); a `view:<id>` activation opens the details; a parent list drops
  the sub-view and `page` that need it, and a tree navigation over it its
  tree; its embedded sub-view goes with it; no attention subscription is made
  and a menu command's `attention` naming it is dropped.
- **Presentation, not access control:** the view's actions, its live list and
  the API stay governed by ACL and the resource's own guards (`guard`,
  handlers). A consumer that must also refuse the data while a service is off
  checks the same state there.
- **Data stays:** hiding changes nothing stored; available again, the view
  shows the same records.
- **A change takes effect at the next bootstrap:** a page load, a tenant or
  language switch, a sign-in. There is no in-place re-bootstrap and no live
  invalidation; other open sessions follow at their next load. Let the state
  change through a form or an editable cell (a switch column, as in the demo)
  and return `reauthenticate: true` in its result (an action handler's
  return value, a `SqlResource` `afterSave`): a form save (`RecordForm`, the
  list's create and update forms) and an editable cell's save answer it with
  a page reload that keeps the address, so a view that disappeared leaves the
  empty workspace. Field-free and bulk record commands, tree-panel commands,
  moves, drops and `app.server.call` ignore the key; after such an action the
  change shows at the user's next page load.
- Demo: the tenant demo's `Szolgáltatások` switches `Visszajelzések` (group
  `Ügyfélszolgálat`) on and off per tenant ([demos](demos.md#tenant-demo-tenants)).
  Verification: PHP `tenancy.php`, `configuration.php`; shell
  `tenancy.spec.cjs` (`view availability`, desktop and 390 px).

<a id="tree-navigation"></a>

## Tree navigation (data tree beside a list)

A list view can get a tree of another resource's records beside it, for
example keys and their values, categories and their products
([FB-0107](feedback.md#fb-0107)). The list then shows only the records whose
field holds the selected node's id.

```php
// The nodes are a hierarchy of their own (parent_id: a select whose options include '').
$registry->subview('keys', 'keys', 'parent_id');
$registry->tree('values', 'keys', 'key_id', 'name');   // list view, node view, list field, node label field
```

JSON: `"view": {"title": "…", "tree": {"resource": "keys", "field": "key_id", "label": "name"}}`
on the list's resource (`resource` names the node view id); the node resource
declares `"subview": {"resource": "keys", "field": "parent_id"}`. The tree
has the [tree look](toolkit.md#tree-presentation) of every 61ade tree:
grid-high rows, alternating backgrounds and dotted lines with +/- boxes;
`"striped": false` / `"lines": false` in `tree` (PHP `striped: false`,
`lines: false`) switch them off.

- **Layout:** the tree panel (header: the node view's title, 300 px,
  resizable and collapsible; its width is a preference of the list view) sits
  left of the list. The list panel's header names the selected node. The first
  root is selected when the view opens.
- **Loading:** roots are the node records with an empty parent field; a node's
  children load the first time it is expanded, through the node resource's
  ordinary `list` with the parent filter, sorted by the label field when it is
  sortable. The hierarchy's `_subview` child count decides which nodes get an
  expand toggle. At most 1000 children per node load (pages of 200).
- **Node actions:** the panel's toolbar, the list's command row (its shadow over
  the tree; the actions collapse into `Műveletek` when the panel is too narrow
  for them, [FB-0191](feedback.md#fb-0191)), holds the node view's actions except
  `get` and uploads. `create` opens its form with the parent field preset to
  the selected node (a root without a selection); `update` and other record
  actions with fields open their form for the selected node; a field-free
  action (`delete`) runs at once after its declared confirmation. A record
  action the node's `_actions` does not offer is disabled. After a node
  action the affected level reloads; a new node is selected.
- **The list:** a scoped list of the selected node (as a sub-view window):
  the field is no column, filter or form input; a new record gets the node as
  its field; the layout is the grid with overlay forms.
- **Security:** every read and write is an ordinary, ACL-checked call of its
  resource. The field filter is a scope of the view, not an authorization.
  Without the node view offered to the actor the list is a plain list.
- **Declaration rules:** the list view is not a singleton, has no tree yet and
  is of another resource than the nodes; the node view has a hierarchy
  sub-view on itself; `field` is a non-secret select, number or text field of
  the list resource, `label` a non-secret text or select field of the node
  resource. The node view is embedded: it has no menu entry of its own.
- **Moves:** a changed parent field is a move; the server checks it like any
  update, so a project that allows moves guards against cycles (the feature
  demo's `registry.key_guard`). Deleting a node with children is the node
  resource's business (the demo's `after_delete` removes the subtree).

- **Keys:** the tree is a WAI-ARIA tree with one tab stop: the arrow keys,
  Home and End move the focus, ArrowRight and ArrowLeft expand and collapse,
  Space selects (the list follows), Enter selects too.
- **As a component:** the tree panel is built on
  [`app.components.Tree`](toolkit.md#tree) ([FB-0158](feedback.md#fb-0158)),
  which a project page mounts in any cell with panels of its own (for
  example tabs with a scoped `ListView` and a `RecordDetails`) and drives
  through its `select` and `activate` events. Its node view is an offered
  list view with the hierarchy on itself (`menu: false` when it has no page);
  the node view of a tree navigation is embedded and cannot be reused there.

Limits: the tree is not live (it reloads only after its own actions); no drag
moves; no search inside the tree; a node shows its label field only.

<a id="conditional-fields"></a>

## Conditional fields

A field can take part only while another field of the same record holds one
of some values: `visibleWhen` (JSON `visible_when`), for example a value
editor that depends on the value's type ([FB-0107](feedback.md#fb-0107)).

```json
{"name": "dword_value", "label": "Érték (hexadecimális)", "required": true, "max": 8,
 "validation": {"pattern": {"expression": "^[0-9a-fA-F]{1,8}$"}},
 "visible_when": {"field": "type", "in": ["REG_DWORD"]}}
```

- **Forms:** action forms, `RecordForm` and the details show the field only
  while the condition holds and follow changes of the condition field at once;
  a hidden field is not validated in the browser. A form window refits when
  a field appears or disappears.
- **Server:** the condition is evaluated on the submitted values over the
  stored row. An inactive field is not validated (also not `required`); a
  save that sends the field or its condition field stores it empty (`''`).
  A save that sends neither leaves it as stored.
- **Declaration rules:** `field` is another field name; `in` lists 1–50
  distinct strings (a checkbox condition uses `"0"`/`"1"`). A conditional field
  is not `editable` in the grid, not `bulk`, not secret and not a `file` field;
  the condition field of an action is not conditional itself.

<a id="exclusive-fields"></a>

## Exclusive fields

Fields of a record can be an exclusive choice: a value in one empties the
others. `clears` (server `Field` `clears`, JSON `clears`) lists the fields a
value of this field empties; each field of the choice names the others
([FB-0113](feedback.md#fb-0113--playlist-as-default-content)). The demo's `Alapértelmezett tartalom`
offers an asset or a playlist this way.

```json
{"name": "asset_id", "label": "Médiaelem", "type": "select", "options_lookup": "signage_assets",
 "clears": ["playlist_id"], "column": {"editable": true}},
{"name": "playlist_id", "label": "Lejátszási lista", "type": "select", "options_lookup": "signage_playlists",
 "clears": ["asset_id"], "column": {"editable": true}}
```

- **Forms:** action forms (bulk included), `RecordForm`, the details and the
  card editors empty the other fields as soon as this one gets a value.
- **Server:** every save that sends this field with a value (form, grid cell,
  bulk, API) stores the other fields empty (`''`) and returns them with the
  cell edit's `values`, so the grid row shows both at once. A save that sends
  two of them with a value is refused with a field error on the cleared one
  (`Nem adható meg együtt ezzel: <label>.`); the actor needs write access to
  the cleared fields (else 403). That at least one is given stays the
  resource's own rule (the demo's `after_save`).
- **Declaration rules:** up to 10 distinct other field names of the same
  action; the cleared fields are optional and not secret, and a secret field
  clears nothing.

<a id="read-only-fields"></a>

## Read-only fields in action forms

An action form (`RecordForm`, the built-in create and update forms, the
singleton's details form) can show a field with its value read-only
([FB-0171](feedback.md#fb-0171)): a value fixed after create stays visible
in the update form, and a value the host presets from its context cannot be
changed in that form.

```php
// Chosen at create, fixed afterwards: create writes them, update shows them read-only and refuses them.
new SqlResource('items', 'items', 'id', $fields, createOnly: ['parent_id', 'kind']);
// Any action: fields shown before its inputs, with the values of `formValues` or the record's `get`.
new Action('items', 'rename', 'Átnevezés', [new Field('title', 'Megnevezés', required: true)], $handler,
    resolve: $resolve, write: true, display: [new Field('kind', 'Fajta', 'select', options: $kinds)]);
```

```json
"storage": {"table": "items", "key": "id", "create_only": ["parent_id", "kind"]}
```

```ts
// The host fixes the parent it presets from the selected node; the value is still submitted.
new app.components.RecordForm({ resource: "items", action: "create", values: { parent_id: node.id }, readOnly: ["parent_id"] });
```

- **Sources:** an action's `display` fields (`Action::$display`; `SqlResource`
  `createOnly`, JSON `storage.create_only`, sets the update's), a
  `RecordForm`'s `readOnly` names (see [RecordForm](toolkit.md#recordform)),
  and the field ACL: in a form of a record (an update or another action with
  an id), an input field the actor may read but not write in this action is
  shown read-only in place instead of disappearing. Readable means its value
  is in the form's values (the record's `get`, with that read's own field ACL,
  or the action's `formValues`); a field the actor may not read stays absent,
  and a create form leaves a write-denied field out as before. This matches
  the singleton's details form, which already showed unwritable fields
  read-only.
- **Order:** the `display` fields come first (where the record belongs), then
  the inputs in their order, a read-only one by ACL in its place. `__form`
  marks every read-only field `readOnly: true` (`FieldMetadata.readOnly`).
- **Rendering** (the details form's): a readonly input named by the field's
  label, reachable by Tab and read by screen readers (`readonly`, not
  `disabled`), without a required mark; a select, multiselect or checkbox
  shows its option label (`Igen`/`Nem` for a checkbox without options) while a
  hidden item keeps the raw value for conditions (`visibleWhen`) and for a
  host preset's submission; a long text stays a multi-line textarea; a file
  field shows its preview without upload or clearing; a registered field
  type receives `readOnly`. Keyboard input, paste and a click change nothing.
- **Appearance:** a read-only control has a flat, muted theme background,
  a transparent border and no inset shadow. Its text keeps the normal
  contrast, selection and copying, and keyboard focus keeps a visible ring.
  This follows the field's read-only state (including a registered editor's
  native controls), so an editable file field's readonly file-name input
  keeps its editable appearance. A section-filling textarea uses the same
  background. Labels and section headings keep their usual appearance
  ([FB-0183](feedback.md#fb-0183)).
- **Never input:** a `display` field and a field read-only by ACL are not
  sent. A request that sends a `display` field is refused like any unknown
  field (`Ismeretlen vagy nem írható mező.`, 400), a write-denied one with 403;
  the server's validation and ACL are unchanged. A `RecordForm` `readOnly`
  field is the host's choice only: it is sent with its value and validated
  by the server as any input, so the host cannot widen a right with it.
- **Declaration rules:** a `display` field is a `Field`, not secret, not a
  password, not one of the action's inputs, unique by name. A `createOnly`
  field is a declared field that is written (not read-only, computed or a
  manual order position), not secret or a password, not grid-editable and
  not `bulk`. Otherwise `InvalidArgumentException`.
- **Limits:** grid cells, cards and the bulk form never show read-only
  fields (they edit the update's inputs only); a `RecordForm` `readOnly` file
  field ignores `setValues`; a `display` field without a value in the form's
  values is left out.

<a id="form-sections"></a>

## Form sections

A record action form can group its fields into framed sections, like the
sections of a multi-section form: each is a bordered panel with a header bar
([FB-0172](feedback.md#fb-0172), [FB-0177](feedback.md#fb-0177)). A
**collapsible** section (the default, the accordion look) keeps optional,
bulky fields (file fields with their previews) out of the way until they are
needed; a **fixed** section is always open, with its label as a plain heading,
for fields that must stay visible in every case. The sections are inside the
one Suite Form, each a fieldset under a disclosure button (collapsible) or
under its legend (fixed); one `RecordForm` stays one Form and no layout cells
are added ([FB-0148](feedback.md#fb-0148)). The same sections group the
[cards and details](#card-groups). A form can instead show its sections as
[accordion sections](#form-accordion): the look and the fixed geometry of the
`Accordion` component, so opening a section never resizes the window.

```php
new Field('title', 'Megnevezés', required: true, section: 'Alapadatok', sectionCollapsible: false),
new Field('role', 'Szerep', 'select', options: $roles, section: 'Alapadatok', sectionCollapsible: false),
new Field('file', 'Kép', 'file', file: $image, section: 'Képek'),
new Field('detail', 'Részletkép', 'file', file: $image, section: 'Képek'),
```

```json
{"name": "title", "label": "Megnevezés", "required": true, "section": "Alapadatok", "section_collapsible": false},
{"name": "file", "label": "Kép", "type": "file", "file": {"upload": "items.file_upload", "accept": ["image"]}, "section": "Képek"}
```

- **Declaration:** a field's `section` (PHP `Field` `section`, JSON
  `section`) is the section's plain-text, translatable label (translated by
  the catalogues like a field label; 1–100 characters, no control
  characters). The fields with the same label form one section at the place
  of the first of them; a field is in at most one section by construction;
  the fields outside sections keep their order. The declaration is the
  field's, so the create, update and details forms of a resource share it.
  `sectionCollapsible: false` (JSON `section_collapsible: false`) makes the
  section fixed; every field of one section declares the same value (a
  resource's fields or an action's fields that mix them, or the flag without
  a `section`, are refused with `InvalidArgumentException`). The wire
  metadata carries `sectionCollapsible: false` only for a fixed section.
- **Layout:** a form that uses sections reads best when every field is in
  one: a fixed first section for the main data, collapsible ones for optional
  groups. Fields outside sections stay plain rows between the panels.
- **State:** a collapsible section starts closed unless one of its fields
  holds a value in the form (a stored value, a host preset, a file; a field's
  `default` and an unchecked checkbox do not count). A client or server
  validation error in a closed section opens it and puts the focus on its
  first erroneous field. Closing only hides: the values stay, are submitted
  and validated. A fixed section never closes.
- **Where:** `RecordForm`, the built-in create and update forms (window and
  panel) and the singleton's details form (from the list's column metadata
  `section` when the actor has no update right). Conditional fields and file
  fields work inside a section, read-only fields too. A form window
  (`AppWindow` or the list's form window) refits when a section opens or
  closes.
- **Keyboard and accessibility:** a collapsible section's header is a native
  button in the tab order, operated with Enter, Space or a click, with
  `aria-expanded` and `aria-controls` (the fieldset); the fieldset is a group
  named by the button (`aria-labelledby`). A closed section's fields are not
  in the tab order. A fixed section is a fieldset named by its legend, with
  no button.
- **Limits:** sections do not nest; the bulk form and grid or card editors
  show no sections; `SettingsForm` keeps its own groups. The open state is not
  stored. The `Adatok` window shows the sections as [groups](#card-groups),
  not as panels.

<a id="form-accordion"></a>

### Accordion form sections

The panels above size the form to its content, so a form window grows and
shrinks as a section opens or closes. An action that declares
`formSections: 'accordion'` shows its sections like the
[`Accordion`](toolkit.md#accordion) component instead (the side panel of the
feature demo's media viewer): a stack of sections under the same cell header,
sharing a fixed height ([FB-0178](feedback.md#fb-0178)). Opening a section
closes the open one, and the window keeps its size; a section taller than its
share scrolls its own fields. `'accordion-multiple'` lets several sections be
open; they share the height. The default, `'panels'`, is the framed panels
above.

```php
// SqlResource: its create and update forms.
$contacts->register($registry, 'Kapcsolatok', formSections: 'accordion');
// Any action.
new Action('contacts', 'review', 'Átnézés', $fields, $handler, write: true, formSections: 'accordion-multiple');
```

`flushSections: true` (JSON `flush_sections: true`, beside `form_sections`)
runs the accordion sections edge to edge of the form, as an `Accordion` fills
its region: no frame and no form margin, a rule between the sections, the
fields and the action row inset by 20 px. Fields that need no header of their
own (a contact's name above its sections) stay outside the sections: plain
rows at the top, headed by the window's title.

```php
$contacts->register($registry, 'Kapcsolatok', formSections: 'accordion', flushSections: true);
```

```json
{"resources": {"contacts": {"operations": {"form_sections": "accordion"}}}}
{"actions": [{"resource": "contacts", "name": "review", "label": "Átnézés", "handler": "contacts.review", "form_sections": "accordion-multiple"}]}
```

- **Declaration:** the action's `formSections` (PHP `Action`, the
  `formSections` parameter of `SqlResource::register` for its create and
  update actions; JSON `operations.form_sections` of a resource and
  `form_sections` of an action): `'panels'`, `'accordion'` or
  `'accordion-multiple'`; another value is refused with
  `InvalidArgumentException`. The form description (`__form`,
  `FormDescription.formSections`) carries it when it is not `'panels'`, so
  every form of the action uses it: the list's window and panel, the
  singleton's details form (the update action's) and `RecordForm`.
  `flushSections` (PHP `Action`, `SqlResource::register`; JSON
  `flush_sections`, a boolean) needs an accordion value (with `'panels'` it
  is refused); the description carries `flushSections: true`.
- **Look:** a collapsible section's header is the `Accordion` component's
  Suite cell header (the theme's header, its title and the same chevron,
  turned down while open). A fixed section (`sectionCollapsible: false`) has
  the same header without a chevron. It keeps its natural height when it
  fits; in a constrained form only its fields scroll below the stationary
  legend. `sectionCollapsible: false` means always open. Consecutive
  sections form one framed stack, 20 px from the form's edges and from the
  action row's rule; with `flushSections` they run edge to edge without the
  frame. Fields outside sections stay plain rows (above the sections they
  need no section of their own: the window's title heads them).
- **Geometry:** the open sections share the height the fixed sections and the
  plain rows leave; fixed sections can shrink when that space is too small,
  keeping their header above their own scrolling fields. A closed section is
  its header alone; the action row stays at the form's lower edge. A fitted
  window (the list's form window, an `AppWindow`) measures every section shown,
  so its height (up to its `maxHeight`, 800 px by default, and the viewport)
  does not depend on which sections are open: without `multiple` it fits the tallest open section,
  with it all of them. Only a conditional field appearing or a validation
  message refits it. In a region (`RecordForm` in a page or an `Accordion`
  section, the list's form panel) the sections share the region's height.
  In Blade and Blade Night the sections ease to their new heights
  ([theme motion](shell.md#theme-motion)); framed panels (`'panels'`) change
  at once, since their window refits.
- **State:** without `multiple` the first collapsible section is open and one
  always stays open (its header says `aria-disabled`); with `multiple` the
  sections holding a value are open, else the first, and every one can close.
  A validation error in a closed section opens it (without `multiple` only
  when the open section holds none, closing it) and focuses its first
  erroneous field. Closed sections' values are submitted and validated.
- **Keyboard and accessibility:** the header is a native button (Enter,
  Space, click) with `aria-expanded` and `aria-controls`; Arrow Up and Down,
  Home and End move between the headers, as in the `Accordion`. The fieldset
  is a group named by its header.
- **Limits:** the open sections are not remembered (the `Accordion`
  component's `id` preference has no form counterpart); an accordion form
  needs the height of its host: in a host without a height it shows every
  section at its own height. Sections do not nest.

<a id="form-section-fill"></a>

### Section-filling fields

A section can consist of one field: a long text or a file, named by the
section's header instead of a label of its own
([FB-0181](feedback.md#fb-0181)). In an accordion form the open section
then *is* the input: the textarea is its body edge to edge, and a file
field is the file name, a drop area taking the section's height and the
buttons.

```php
new Field('note', 'Megjegyzés', 'textarea', max: 1000, section: 'Megjegyzés', sectionFill: true),
new Field('photo', 'Fénykép', 'file', file: $image, section: 'Fénykép', sectionFill: true),
```

```json
{"name": "note", "label": "Megjegyzés", "type": "textarea", "section": "Megjegyzés", "section_fill": true}
```

- **Declaration:** `sectionFill: true` (PHP `Field`, JSON `section_fill`)
  on a `textarea` or `file` field with a `section`, without an `editor`; the
  field is the only one of its section in the resource's fields and in an
  action's fields. Otherwise `InvalidArgumentException`. The form metadata
  carries `sectionFill: true` (`FieldMetadata.sectionFill`); a column's
  section does not.
- **Look:** the field's own label is for screen readers only (Suite
  `hiddenLabel`: still the input's accessible name), so the visible name is
  the section's header: give the section the label the field should show.
  The header carries the required mark of a required field. A textarea has
  no frame of its own and no inset: the section's body is the text area
  (Suite's focus and error rings stay). This holds in every section
  presentation (panels, fixed, accordion).
- **Focus on opening:** opening a section-filling textarea in an accordion
  form (`accordion` or `accordion-multiple`) by click, Enter or Space focuses
  the textarea with the caret at the end of its current text, including an
  empty value. This happens on the opening redraw, without waiting for the
  theme motion. Closing the section keeps focus on its header; initial form
  focus and validation's focus on the erroneous field keep their own rules.
- **Geometry:** in an open collapsible accordion section the textarea, or
  the file field's drop area, takes the section's share of the height (at
  least 96 px of text, 180 px of drop area); a fitted window measures the
  textarea at its own 120 px and the drop area at its 180 px, as for any
  field, so opening the section never resizes the window. A field of
  [several files](#stored-file-multiple) gives its queue the share (at least
  200 px). The file never changes the geometry: an uploaded or stored image is fitted into the drop
  area (scaled down, whole, centred). In panels and fixed sections the field
  keeps its own height.
- **Unchanged:** the value, validation, upload flow, paste and drop, the
  error reveal (an error opens the section and focuses the textarea or the
  file name) and the cards and details, which show the field under its
  label in the section's group.

<a id="form-rows"></a>

### Form rows (several columns)

By default every field of a form takes a full row. Short fields can share a
row instead, so a wide form is not a narrow stack of short inputs
([FB-0196](feedback.md#fb-0196)). A field's `row` names the row it shares
with its neighbours, and `rowWidth` gives it a larger share. The row is one
Suite Form `cols` item inside the one Form, with no DOM or CSS of the
project's own.

```php
new Field('name', 'Név', required: true, row: 'identity'),
new Field('organization', 'Szervezet', row: 'identity'),
new Field('role', 'Beosztás', section: 'Elérhetőség', row: 'reach'),
new Field('email', 'E-mail', required: true, section: 'Elérhetőség', row: 'reach', rowWidth: 2),
new Field('phone', 'Telefon', section: 'Elérhetőség', row: 'reach'),
new Field('website', 'Weboldal', section: 'Elérhetőség'),   // no row: the full width
```

```json
{"name": "email", "label": "E-mail", "required": true, "section": "Elérhetőség", "row": "reach", "row_width": 2}
```

- **Declaration:** `row` (PHP `Field`, JSON `row`) is a key
  (`[a-z][a-z0-9_]*`, at most 64 characters, never shown); `rowWidth`
  (JSON `row_width`) is the field's share of the row, 1–3, default 1, and
  needs a `row`. The fields of one row are consecutive fields of one
  section (or all outside sections), at most 4: 2–4 in the resource's
  fields, 1–4 in an action's fields (an update without its create-only
  fields may keep one). A [section-filling field](#form-section-fill) is never
  in a row: it always spans its section. Otherwise
  `InvalidArgumentException`. The form and column metadata carry `row`, and
  `rowWidth` when it is not 1 (`FieldMetadata.row`, `.rowWidth`).
- **Layout:** a field without a row keeps the full width. The fields of a row
  share it by their shares (an `E-mail` of share 2 beside two of share 1 takes
  half), with a 16 px gap. Rows are per section, so a fixed section of short
  fields can use them while another section stays one column. The
  declaration is the field's, so the create, update and details forms share
  it. A row whose fields an action or the actor's field ACL leaves out
  keeps the remaining ones; one left takes the whole row.
- **Narrow forms:** a row stacks into one column as a whole when it is
  narrower than its total share × `--blade-form-column-min` (default
  180 px) plus the gaps. Only CSS decides it, so the breakpoint follows the
  form's own width (and inside a section the section's), not the viewport:
  the same declaration is side by side in a wide window, stacked in a narrow
  window, a side panel or on a phone, with no horizontal scrolling. A project
  can change the share in its stylesheet (any CSS length), on `:root` or a
  narrower scope such as its skin or the form window:
  `:root { --blade-form-column-min: 12rem; }`.
- **Windows:** the list's form window (and the tree navigation's) opens wide
  enough for its widest row (the form's and a section's insets and 20 px for
  a scrollbar included), at least 560 px and at most the viewport − 24 px; a
  form without rows keeps 560 px. The share is read as the window's form sees
  it once the form is attached, so a value set below `:root` widens the
  window too (a phone's full-screen window stays as it is). A fitted window
  (`AppWindow`, the list's form window) measures the rendered rows, so a
  wider window fits a lower height. In an accordion form, opening or closing a
  section still never resizes the window.
- **Alignment:** the fields of a row align at their top. An error or help
  text appears below its own field and moves none of the others. A field's
  label stays on one line and is cut with an ellipsis when its cell is too
  narrow; a required mark stays visible at its end, the whole label is its
  tooltip and stays the input's accessible name. A checkbox, which has no
  label above it, is centred on the line of the row's inputs while the row is
  side by side, and has no gap above it once the row stacks.
- **Unchanged:** values, validation, translations, required marks, read-only
  and `display` fields, exclusive fields, file and stored file fields work
  inside a row. A hidden [conditional field](#conditional-fields) leaves no
  hole: the others share its space until it returns. An error in a closed
  section still opens it and focuses the field. Tab and screen readers
  follow the reading order: row by row, left to right. Labels stay
  associated with their controls.
- **Where:** `RecordForm`, the built-in create and update forms (window and
  panel), record action forms and the singleton's details form (from the
  update form's metadata, or the columns' `row` without an update right).
  A form shows a row's fields together at the place of its first field,
  also when they arrive apart (the details form follows the view's column
  order), and Tab follows that order.
- **Limits:** the bulk form, the grid and card editors, `SettingsForm` and
  the cards and details groups ignore rows (the cards and details have their
  own [section columns](#card-group-columns)). A row cannot span sections. A
  label with Suite help (only a registered field type adds one) is not cut
  and may wrap.

<a id="count-fields"></a>

## Count fields: related records the actor may list

A resource can declare a read-only number field whose value, per row, is the
number of records of another list resource that the same actor, channel and
tenant could list and that match the row ([FB-0173](feedback.md#fb-0173)).
The count obeys the counted resource's own list ACL, so a global resource can
show counts of tenant-scoped records without revealing another tenant's rows
or rows the actor may not read. It is the [sub-view count](#sub-views)
(`_subview`) generalised to any declared field, several match fields and fixed
filters.

```php
new SqlResource('categories', 'categories', 'id', [
    new Field('name', 'Megnevezés', required: true),
    new Field('item_count', 'Tételek (alkategóriákkal)', 'number'),
    new Field('note_count', 'Jegyzetek (közvetlenül)', 'number'),
], counts: [
    // Items whose category or whose category's parent is this row (scope-only helper fields of the items).
    'item_count' => ['resource' => 'items', 'match' => ['category_id', 'category_parent']],
    'note_count' => ['resource' => 'items', 'match' => ['category_id'], 'filters' => ['kind' => 'note']],
]);
```

```json
"storage": {"table": "categories", "key": "id", "counts": {
  "note_count": {"resource": "items", "match": ["category_id"], "filters": {"kind": "note"}}}}
```

- **Declaration** (PHP `SqlResource` `counts`, JSON `storage.counts`): the
  key names a declared `number` field of this resource; `resource` a
  registered resource with an SQL list source; `match` 1–10 of its fields
  (scope-only fields allowed; not secret, not a long text, multiple choice or
  file); `filters` at most 10 fixed exact values of its filterable fields, as
  in [menu attention](shell.md#menu-attention); `on` optionally another field
  of this row to match instead of its key. A record counts once per row when
  any `match` field equals the row's key (or `on` value). The shape is checked
  when the resource is defined, the references by `Registry::checkViews()`
  (`InvalidArgumentException`).
- **Visibility:** the count runs through the counted resource's list source
  exactly as a sub-view count: its `list` ACL predicate for the actor and
  channel (object and owner rules), its `where`, tenant scope and row source
  with the archive policy. The value is left out, not `0`, when the actor has
  no `list` on the counted resource or the channel may not call it (an API
  token also needs the counted `<resource>.list` in its scopes, as the
  executor requires), when it is tenant-scoped and no tenant is
  active, when a `match` or `filters` field is not queryable for the actor
  (a list field deny), or when the actor cannot read the row's `on` field. A
  deny on the count field itself hides it as any field.
- **Reads:** list rows (one grouped `COUNT` per page and count field), `get`
  and the resource's live updates (`__watch` snapshots) carry it; a change of
  a counted record does not push an update of the counting list by itself
  (the next read or snapshot shows it). It is never input (not in create,
  update, bulk or cell edits), not part of the revision, and not a filter,
  scope or sort field (refused with 403; the view's `filters` and `sortable`
  leave it out).
- **Presentation:** a number field like any other: list columns, cards,
  `Adatok`, `RecordDetails`, `column.details` and `secondary` apply.
- **Recursion:** a count over a hierarchy matches one helper field per level
  (the record's category, that category's parent, …), typically
  [scope-only](field-presentation.md#scope-only) computed fields of the
  counted resource; the demo's two-level tree uses two.
- **Limits:** no sorting or filtering by a count; one SQL `COUNT` per count
  field and page (an `OR` over the match fields, so an index on each match
  field helps); a project-built list adapter is no counted resource (it needs
  an SQL list source).

<a id="sub-views"></a>

## Sub-views (expandable rows and card buttons)

A list view can let each record expand to a compact preview of a related list
under its row in the table. Cards and tiles do not expand: they carry a button
that opens the full related list in a window, also on a phone.
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
resource is a hierarchy of the parent view itself. Declare both views first;
`updateView()` of either keeps the sub-view and the embedding.

JSON: `"view": {"title": "…", "subview": {"resource": "tasks", "field": "project_id", "embed": false, "select": true}}`
(`resource` names the child view id).

- **Toggle:** the table gets a first toggle column (an accessible button with
  `aria-expanded`). Enter on the toggle cell or a click expands or collapses it.
  Records start collapsed, and a record whose child count is 0 has no toggle.
  Cards show a button ("Feladatok (2)"; `Alelemek (n)` for a hierarchy, at least
  40 px tall) only when there are children. With a media cover, it overlays the
  upper-right corner without increasing card height; without a cover, it spans
  the card footer. Long captions fit the card with an ellipsis and retain their
  full accessible name and tooltip. Tiles show the same button across the full
  width of the cover's bottom edge without changing tile height, also on an icon
  or empty media placeholder. A preview never expands further.
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
  left out (toggle shown) when the child has no SQL list source, the actor may
  not filter on the field, or the channel (an API token's scopes) may not list
  the child ([FB-0173](feedback.md#fb-0173)). A declared field can carry the same kind of count of
  any list resource ([count fields](#count-fields)).
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
  otherwise the parent has no sub-view. A child declared with
  [`menu: false`](toolkit.md#menu-less-views) has no page of its own either,
  so a `page` activation over it is refused.
- **Toolbar on a selected child:** a record selected in a preview takes the
  parent toolbar over for the actions the child view has under the same name
  (`update`, `delete`, `Adatok`, …), which then run on that child record; the
  other actions are disabled. Client commands follow the same rule: one the
  child view declares too runs on the child record with the child view, any
  other stays on the parent's own cursor record and marks
  ([client commands](toolkit.md#registries)); in a hierarchy every command
  follows the child record. Selecting a parent row, collapsing the preview or
  the child record leaving it gives the toolbar back. Editing a child keeps its
  parent: the parent field is hidden and sent as that record.
- **Not selectable (`select: false`, JSON `"select": false`; default `true`):**
  for a child list where only a flag is set. Its rows, in the preview and in
  the full window, never become the cursor record: native Grid/DataView
  selection and key navigation are off (no highlight), there is no toolbar
  delegation, and double-click or Enter opens nothing. The window toolbar keeps
  only `create` and upload actions (no `Adatok`, edit or delete). Declared
  editable switch cells still save through `__edit`. `views()` carries
  `subview.select: false`; it is left out at the default.
- **Selection, focus and an external panel:** each list keeps its own cursor:
  selecting a preview record does not clear the main list's selection. The
  child's keyboard navigation belongs to the child, independently of the
  retained main cursor. A toolkit panel follows `ListView`'s `target` event
  (`{view, row, rows}`), or reads `target()`, to observe the active preview or
  foremost sub-view window as well as the main list. Closing a window restores
  the underlying target. `select` and `selected()` keep their main-list meaning;
  command-specific delegation stays unchanged
  ([ListView](toolkit.md#listview), [FB-0125](feedback.md#fb-0125)).
- **Partial count (`_subview_open`):** a child `ListSource` with a
  `countWhere` (trusted SQL added only to the count) counts part of what it
  lists, for example the accounts with access. Its parents then also carry
  `_subview_open: true` and expand even at a count of 0.
- **Hierarchy:** the list shows the records with an empty parent field (also
  when it is itself the child of another record); the toolbar command then opens
  the selected record's own children (`Alelemek`). A user filter on the parent
  field replaces that root condition: a parent lists its children, the empty
  option the records without a parent, as an ordinary filter
  ([FB-0195](feedback.md#fb-0195)).
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

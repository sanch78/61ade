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

`new ViewLayout()` gives filter/grid plus overlay form. Panel mode requires
a `form` leaf. Validated nested rows/cols support header, width/height,
minWidth/minHeight, resizable, collapsable, collapsed. No executable HTML/JS
or arbitrary vendor options in definitions.

Singleton forms show permitted get data; fields from target-specific
`__form(update)` are editable and others read-only. Password/other actions
open their own action forms. List Add/Modify permissions derive from ACL;
only the actual submit button says Save. Row `_actions` enables/disables row actions.

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
editing tooltip, preserving editor/checkbox accessible names. Column capability
does not override row/field ACL.

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
ACL/injection; sorting browser fixture with 1801 rows, headers, full sorting,
filters, bidirectional scrolling, ≤600 loaded and <100 rendered rows.
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

WebSocket uses `tools/live-server.mjs`, Node 18+, PHP 8.4+ and lockfile-pinned
ws (currently 8.22.0). Settings: BLADE_AUTOLOAD_FILE, BLADE_APPLICATION_FILE,
BLADE_PHP, BLADE_LIVE_ORIGIN; optional BLADE_LIVE_PORT (8088),
BLADE_LIVE_INTERVAL (2000). A managed HTTPS/WSS proxy forwards to loopback.
Exact Origin checking and session-bound tickets in private runtime are mandatory;
tickets do not expose session IDs. Service/proxy provisioning belongs to Infra.

Server watchers periodically inspect visible database windows, including external
writes. Only changes send packets: changed rows, deleted IDs and current order.
The framework owns heartbeat/reconnect/stale-filter packet rejection. Hidden
tabs unsubscribe and resubscribe on return. WebSocket selection does not silently
fall back to polling.

Every observation rechecks authentication, expiry, account state, revocation
and ACL. Subscriptions are audited technical reads; unchanged ticks do not
produce business audit. Actual writes use the transactional executor. Open forms
retain drafts and stale saves return 409.

<a id="ellenőrzés"></a>

## Verification

`lists.php`: 5000 rows, scopes, both cursor directions, duplicate-free traversal,
filter injection/field denial, external writes/deletes.
`workspace.spec.cjs`: actual overlay form, polling, repeated switching.
Separate consumer synthetic integration historically checked WebSocket updates/
revocation, filtering, preserved panel forms, profile form and 600-row bounds.
The client releases cached rows outside current order and ignores late events
from stopped/replaced sockets. Current host [coverage limits](development.md#existing-full-smoke-and-coverage-limits)
apply to fixture-dependent browser groups.

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

Suite 9.3.12 space layout has a 12 px gap but places the factory three-dot grip
on the preceding border. Scoped admin.css rules beneath `#blade-application`
move the dhx_layout-space grip to gap center: right -6 px for horizontal panel
division, bottom -6 px for vertical division. Native dragging remains intact.

Consumers only prepare updated framework assets. Factory CSS is unchanged;
framework rules load afterward. Line/wide layouts, grid-column/window resizers
are unaffected. This relies on Suite 9.3.12's gap; rerun focused checks on upgrades.
`layout-resizer.spec.cjs` measures centers on both axes across themes and drags
with the mouse. FB-0013.

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

JSON view `row_numbers: false` disables numbering; `selection: true` enables
marks (default false). PHP: `$registry->view(...,rowNumbers:false,selection:true)`.
Marks differ from active/editor row, survive grid/card switches and same-row
live updates, and disappear when rows leave the data window.

Toolbar/view-switch internal layouts are type none; the outer results panel
owns the only frame. Toolbar fills its own height and scrolling content cannot
overdraw it. Grid mode has a theme-colored 1 px divider above column headings.
Filter reset and authentication secondary actions are native secondary flat buttons.

<a id="tömeges-műveletek-és-ikonok"></a>

## Bulk actions and icons

Actions accept an optional DHTMLX icon CSS class, e.g. `dxi dxi-check`, also
as JSON icon. Built-ins, view switching, filters and save have framework defaults.

Bulk requires explicit Action/JSON `bulk: true` plus view selection. Existing
consumer business views had not enabled it at the time of this guide.
For a per-object Close action, add bulk true/icon and view selection true;
handler, resolver and permissions stay the individual action's ones.

The marked-rows button opens one form for permitted targets; differing field
permissions reject the combined form. Limit: 1–100 rows. UI `__bulk` takes
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

The final right-aligned Toolbar dropdown shows the current grid/card mode.
Switching preserves active row. On mobile it is disabled and indicates forced
cards; desktop restores manual preference. Singleton views have none.
This replaces FB-0019's two buttons per FB-0020; no consumer configuration.

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
validation remeasures; manual resize remains available.

Historical `grid-edit.spec.cjs` checks switches during/after save, card field
saving/validation, SQL sort, size reset, reload, double-click and bottom space
(FB-0024). Its grid-edit fixture project cannot launch here currently.
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
before individual or bulk execution. Result reveal.severity selects acknowledgment severity.

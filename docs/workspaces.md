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
user, view and page (`UiPreferences`, unknown stored values read as table).
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
  `presentation`).
- **Tiles.** `tiles: true` (JSON `tiles`, default on when a media column
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

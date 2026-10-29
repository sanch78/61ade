# Flags, meaningful values and related object fields

Checkbox fields use native DHTMLX controls in the main form. Lists show a
checkbox only with `column.editable: true`; otherwise they show meaningful
option labels. Select columns show labels rather than raw keys. The main form
continues to manage object fields together.

<a id="mezőnkénti-gridszerkesztés"></a>

## Per-field grid editing

Editable non-checkbox headers show ✎ with an explanatory tooltip; editor/form
labels stay unchanged. Field column.editable enables native text/textarea/select
editors and the shared Grid/DataView checkbox template. Default: read-only.
Secrets/passwords cannot use inline editing. Double-click opens text/select,
Enter or blur saves, Escape discards; checkbox toggles directly.

`__edit` takes object ID, field, value and revision. Executor applies update
permission, field ACL, API scope, transaction and audit. Only that permitted
field changes and all its declared validation runs. Unchanged legacy values in
other fields do not prevent an isolated correction; full-form validation stays
intact. Cross-field validation and consumer guard/normalize receive stored row
merged with the new value. After-save receives the changed field, preserving
effects such as session revocation.

Row _editable contains only currently readable/writable fields; the server
rechecks every call. Related-table fields follow the same route. Failed saves
restore the cell and show a field-named DHTMLX dialog. Live updates preserve
drafts. SqlResource supplies default saving; custom Action uses the supported
editHandler contract rather than another endpoint.

Synthetic references: `tests/fixtures/grid-edit`, `grid-edit.php`, `grid-edit.spec.cjs`.

<a id="mező-és-oszlop-deklarálása"></a>

## Declaring fields and columns

```json
{
    "name": "archived", "label": "Archivált", "type": "checkbox",
    "required": true, "default": "0",
    "options": {"0": "Aktív", "1": "Archivált"},
    "column": {"width": 100, "align": "center"}
}
```

Canonical values are strings 0/1; booleans/integer 0/1 normalize to them.
Other values produce field errors. Required checkbox allows unchecked state:
required does not mean must be checked. Omitted optional fields retain stored
values. Labels sit beside controls. Business errors use field-named dialogs
because Suite checkbox captions only appear for mandatory checked controls;
form values remain. Default initializes create forms, never overwrites saved
values or replaces server storage defaults.

Column supports positive integer width/minWidth/maxWidth up to 10000 px,
boolean editable, boolean secondary and align left/center/right. A secondary
column remains available in the grid toolbar's Columns menu and can be shown
or hidden per user; its initial state is visible. Fixed width prevents automatic
stretch. Checkbox filters are three-state selectors: Any and meaningful labels.
Consumer options define labels; absent options default to No/Yes.
Use business meanings such as Active/Archived where possible.

```json
{"name": "internal_note", "label": "Belső megjegyzés",
 "column": {"secondary": true}}
```

PHP Field takes type checkbox, column width/alignment and defaultValue.
The JSON compiler produces the same definition.

A third presentation, `presentation: "image"` with `imageBase` (and optional
`altOf`), shows a text field holding a static application image file name in
the same slots; see [static image column](workspaces.md#media-tiles).

Two column presentations take typed data only: `media` (the file-manager
resource whose file id the field holds; thumbnail, type icon, duration badge
and a type-stating accessible name) and `presentation: "icon"` (a Suite icon
class with `options` as accessible names). Neither may be `editable`; see
[media columns and tiles](workspaces.md#media-tiles).

<a id="többes-választás-multiselect"></a>

## Multiple choice (`multiselect`)

```json
{"name": "labels", "label": "Címkék", "type": "multiselect", "max": 200,
 "options": {"urgent": "Sürgős", "customer": "Ügyfél"}}
```

Forms use native multi-choice Combo; lists/cards join selected labels with commas.
Canonical storage is comma-separated keys, e.g. urgent,customer; inputs may be
a list or that string. Keys cannot contain commas. Client/server reject unknown
or duplicate keys. Max applies to the entire string. Choices may be static,
options_lookup/options_binding or PHP closures, e.g. [API-key catalog actions](admin.md#api-kulcsok-a3).
Gridcell editing is unsupported (editable errors), and these fields do not
filter/sort. Demo: Tasks → Labels.

<a id="egy-az-egyhez-kapcsolt-tárolás-a-főűrlapon"></a>

## One-to-one related storage in the main form

Fields stored in a related table can share the same list/form:

```json
{
    "storage": {
        "table": "items", "key": "id",
        "related": [{
            "table": "item_preferences", "key": "item_id",
            "fields": {"notify": "notifications"},
            "defaults": {"notify": 1}
        }]
    },
    "fields": [{
        "name": "notify", "label": "Értesítések", "type": "checkbox",
        "default": "1", "options": {"0": "Kikapcsolva", "1": "Bekapcsolva"},
        "column": {"width": 120, "align": "center"}
    }]
}
```

Fields map public names to related columns. Related key stores object ID and
must be unique/primary in the database. Consumers migrate tables/indexes;
the framework never changes schema during requests. Related fields cannot
also name main-table columns or belong to multiple related stores.
validation.unique is unsupported on related fields. Defaults are string/integer,
empty string if omitted. Runnable example:
`tests/fixtures/related-fields/items.json`.

List/filter/watch/get agree on defaults for missing related rows. Related values
participate in revisions; external changes protect stale saves with 409.
Main/related writes, after_save and audit share the Executor transaction and
roll back together. Deletion removes declared related rows; other FK/outbox/
cascade rules remain consumer responsibilities.

Related fields share object/field/channel ACL. Forbidden fields cannot be
written; omitted values are preserved rather than rewritten. Forbidden list
fields cannot filter. Tables/mappings/hook names never enter frontend metadata.
after_save may return a response array, e.g. reauthenticate true; the framework
sets object ID. Consumer hooks invoke business effects through framework services,
e.g. Workspace::revokeSessions.

Prerequisites: PDO SQLite/MySQL, transactional main/related tables (InnoDB on
MySQL), Suite Standard 9.3.12. MySQL locks main/existing related rows; revision
and unique key protect concurrent external writes. Many-to-many/composite keys
are unsupported. Inline editing is a separate supported capability above.

<a id="ellenőrzés"></a>

## Verification

- `php8.4 tests/shell/related-fields.php`: UI/API checkbox validation, defaults, shared saves, related changes, 409, rollback, field ACL, forbidden filters and deletion.
- `npm run test:browser -- tests/shell/related-fields.spec.cjs` (feature demo Tasks): panel form defaults, shared main/related save and reopen, meaningful related-field filter, and the demo `after_save` rule's field error keeping the entered values.

FB-0014: the separate security action remains a technical API option;
main-form fields are the default switch UI.

<a id="egységes-checkbox-és-kártya-szerkesztésjelzés"></a>

## Shared checkbox and card editing indicators

Grid/DataView use one template with Suite dhx_checkbox styling/theme variables,
without Unicode ticks, custom drawings or pencils beside switches/in headers.
Writable flags show only a control and meaningful tooltip, fitting narrow columns.
It appears only when column.editable and row _editable both permit it;
otherwise options labels show, including read-only detail windows.
Click/Enter/Space share saveCell/__edit, server ACL, revision, validation and audit.
Consumers add no checkbox component/endpoint.

Editable non-checkbox card fields place their pencil at the right edge in
reserved 24 px space. Both value/icon open the editor; Enter/Space remain.
Long values wrap beside it. No new configuration:
`column: {editable: true}` with options Off/On applies to both views.
Supported Suite and per-row _editable are required.

The managed `grid-edit.spec.cjs` (feature demo Tasks) covers keyboard/click,
save, switching, read-only/row permissions, equal checkbox sizes, right-aligned
pencils and inline validation/business-rule messages. FB-0029.

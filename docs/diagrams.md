# Visual diagram editor

Status: first vertical slice implemented on 2026-10-24
([FB-0060](feedback.md#fb-0060)); user acceptance is not claimed.

A node-and-link editor with movable elements, connections, a property panel and
element types that users can define at runtime. The framework owns storage,
validation, actions, authorization, audit and the UI; a consumer declares the
space, the element palette, the connection types and limits. The feature demo
configures it as a network topology builder.

## Building blocks

| Part | Location | Responsibility |
| --- | --- | --- |
| `Blade\Diagram\DiagramStorage` | `packages/php/src/Diagram/DiagramStorage.php` | All SQL of `blade_diagrams` (one canonical JSON document per diagram, optimistic revision) and `blade_diagram_types` (runtime element types). |
| `Blade\Diagram\DiagramDefinition` | `packages/php/src/Diagram/DiagramDefinition.php` | Consumer configuration, glyph/shape/colour sets, explicit installer, registration and browser metadata. |
| `Blade\Diagram\DiagramActions` | `packages/php/src/Diagram/DiagramActions.php` | Registered actions and server-side canonical validation of saved content. |
| `Registry::diagram`, `Workspace` | `packages/php/src/Feature` | The `diagram` view kind; metadata lists only offered actions. |
| `DiagramEditor` | `packages/frontend/src/DiagramEditor.ts` | Suite Layout, command Toolbar, diagram List, element palette List, property Form, creation Windows and the SVG canvas. |

**Framework-first boundary.** DHTMLX Suite Standard has no diagram widget;
DHTMLX Diagram is a separate product that is not installed or licensed
([component matrix](component-matrix.md)). Only the drawing surface is
therefore a framework-owned SVG element inside a Layout cell. Everything
around it — shell, toolbars, lists, forms, windows, dialogs and toasts — is the
existing Suite adapter set. If a licensed DHTMLX Diagram becomes available,
the canvas is the part to replace; the actions and stored format stay.

## Integration

Install explicitly (HTTP requests never run DDL), then register:

```php
use Blade\Diagram\DiagramDefinition;

$topology = new DiagramDefinition('topology', 'Hálózati topológia', 'demo', [
    'router' => ['label' => 'Router', 'glyph' => 'router', 'color' => '#ef6c00', 'shape' => 'circle'],
    'switch' => ['label' => 'Switch', 'glyph' => 'switch', 'color' => '#0288d1', 'shape' => 'rect'],
], [
    'ethernet' => ['label' => 'Ethernet (1 Gbit/s)', 'color' => '#607d8b', 'width' => 2],
    'wifi' => ['label' => 'Wi-Fi', 'color' => '#0288d1', 'style' => 'dashed'],
], group: 'Feature demó', desktopOnly: true);
$topology->install($pdo);          // setup step: both tables
$topology->register($workspace);   // application definition
```

| Setting | Meaning |
| --- | --- |
| `resource` | ACL resource and view id; actions are `<resource>.<action>`. |
| `space` | Storage namespace and ACL object of every action; never sent to the browser. |
| `nodeTypes` | Palette: key ⇒ `label`, `glyph`, `color` (`#rrggbb`), optional `shape` (`rect`, `round` default, `circle`, `diamond`). Keys must not start with `custom-`. At most 60. |
| `linkTypes` | Connection types: key ⇒ `label`, `color`, optional `style` (`solid`, `dashed`, `dotted`) and `width` (1–6). At most 20; the first is the default. |
| `customTypes` | Users may add element types at runtime (default `true`). |
| `maxNodes` / `maxLinks` | Per-diagram limits (300 / 600; at most 2000 / 4000). |
| `maxDiagrams` / `maxCustomTypes` | Per-space limits (200 / 40). |
| `desktopOnly` | Below 768 px show the desktop-only notice (default `false`). |

Glyphs are a framework set of 24×24 stroke drawings: `router`, `switch`,
`server`, `firewall`, `cloud`, `workstation`, `laptop`, `access-point`,
`printer`, `database`, `phone`, `globe`, `storage`, `camera`, `box`. Runtime
types choose a glyph, a shape and one of ten framework colours.

## Actions and authorization

| Action | Target id | Purpose |
| --- | --- | --- |
| `list` | none | Diagram names and the runtime element types of the space (≤ `maxDiagrams`). |
| `get` | diagram | Name, revision and canonical content. |
| `create` | none | Field `name` (≤ 120, unique case-insensitively). |
| `save` | diagram | Fields `content` (JSON, ≤ 60 000 characters) and expected `revision`; `409` on a stale revision. |
| `delete` | diagram | Declared danger confirmation. |
| `type_create` | none | Fields `label` (unique against palette and runtime types), `glyph`, `shape`, `color`. |
| `type_delete` | runtime type key | `409` while any saved diagram still uses it; palette types are not addressable (`404`). |

Every action runs through the common executor (authentication, CSRF, channel
and token scope, ACL, field validation, transaction, audit). The ACL object is
the space, so a rule grants the editor as a whole; per-diagram rules are not
supported. The view is offered only when `list` is; a read-only actor
(`list`, `get`) sees no create, save, connect, move or type controls, and every
request is checked again server-side.

## Stored content

```json
{"nodes": [{"id": "n1", "type": "router", "label": "Központi router", "detail": "10.0.0.1", "x": 0, "y": -40}],
 "links": [{"id": "l1", "source": "n1", "target": "n2", "type": "fiber", "label": "10 Gbit/s"}]}
```

`save` never stores what was sent. It rebuilds the document from known keys
only and rejects: other keys, ids outside `[A-Za-z0-9_-]{1,40}` or repeated,
unknown element or link types, links to missing elements, self links, more
than one link between the same two elements, labels over 80 or details over
200 characters or containing control/format characters, coordinates beyond
±20 000 (stored rounded), and documents over the limits.

## Behavior

- **Elements.** Drag a palette entry onto the canvas, or double-click it (or
  press Enter on it) to add it in the visible centre. Elements snap to a 20 px
  grid; drag to move, or use the arrow keys while the canvas has focus.
- **Connections.** Drag the dot on an element's right edge onto another
  element. The command row chooses the type of new connections; the property
  form changes the type and caption of a selected connection.
- **Properties.** Selecting an element shows caption, detail (for example an
  IP address) and element type; selecting a connection shows its endpoints,
  type and caption. Changes apply immediately to the canvas.
- **Removal.** `Kijelölt törlése`, the property form button or Delete removes
  the selection; removing an element removes its connections.
- **View.** Mouse wheel zooms around the pointer, dragging the background pans;
  the floating controls zoom and fit the whole diagram.
- **Saving.** Changes are local until `Mentés` (Ctrl+S). Switching diagrams
  with unsaved changes asks for confirmation, because they would be lost.
- **Element types.** `Új elemtípus` opens a Suite Form window (name, glyph,
  shape, colour palette). Runtime types appear in the palette with a delete
  button; deletion is refused while the open diagram or any saved diagram uses
  the type.

## Demo and verification

Feature demo → `Hálózati topológia`: twelve network element types, five
connection types (Ethernet, fibre, Wi-Fi, VPN, WAN) and two synthetic
topologies (`Irodai hálózat`, `Telephelyek VPN`, documentation and private
address ranges only), seeded once by `setup-workspace.php`.
`reader@example.test` opens diagrams read-only.

- `php8.4 tests/shell/diagram.php`: definition checks, metadata without the
  space key, ACL, canonical save and every rejection rule, revisions, runtime
  type lifecycle and limits, audit.
- `npm run test:browser -- tests/shell/diagram.spec.cjs`: seeded topology and
  property form; drop from the palette, double-click add, move, connect, edit,
  save and reload; runtime element type creation and the in-use refusal;
  read-only reader. Created diagrams and types are removed afterwards.

## Limits

- One user's unsaved edits are not merged with another's; the later save gets
  `409` and must reload. There is no live co-editing or undo history.
- Connections are straight lines between element centres; no ports, routing,
  bends, multi-selection, copy/paste, grouping or automatic layout.
- No image/SVG export and no per-diagram ACL. Leaving the view (menu
  navigation) discards unsaved changes without a prompt.
- Desktop pointer interaction; the demo view is `desktopOnly`.

# To-do: capabilities to introduce

Accepted ideas that are not implemented yet. An item here is a planned
direction, not a runtime contract: [usage](usage.md) and the topic guides stay
canonical for current behavior. When an item is taken up, it gets a
[feedback](feedback.md) entry, its contract moves to the affected topic guide,
and the item is removed from this file (or narrowed to what remains).

Each item states the goal, the reference concept, what 61ade has today, the
proposed contract, the open questions and the done criteria.

<a id="tree-table"></a>

## T1 — Tree table (hierarchy with columns)

- **Added:** 2026-11-12, owner request after the Tree control review
  ([FB-0191](feedback.md#fb-0191)).
- **Goal:** show a record hierarchy with several columns in one surface: a
  grid whose first column is the tree, for hierarchies where users compare
  values across nodes (cost centres, product structures, a key tree with its
  value counts), instead of a tree beside a separate list.
- **Reference concept (SAP Fiori Tree Table):**
  - A table with exactly one hierarchical column (indentation and the
    expand/collapse toggle per container node); the other columns are
    ordinary table columns. The lighter Tree control remains the choice when
    one label per node is enough.
  - A tree toolbar above the table for actions on the whole tree: icon-only
    `Collapse All` / `Expand All` beside the view settings (sort, filter,
    columns). `Collapse All` shows only the first visible level,
    `Expand All` every level.
  - Node actions also exist per node: expand everything below the selected
    node, collapse everything below it; inactive for a leaf, for several
    selected nodes, or when the node is already in that state.
  - Initial expansion one level by default, configurable; with many root
    items start collapsed. Breadth over depth: ideally at most four levels,
    the first two holding the most important items.
  - Selection and expand/collapse are handled by the table itself, not by
    application events.
  - Reordering within a level (`Move Up` / `Move Down`) and `Cut` / `Paste`
    to move a node under another one, instead of free drag and drop.
  - Desktop and tablet only: on a phone an adaptive alternative (a tree or
    a drill-down list) is offered.
- **What 61ade has today:**
  - The record [Tree](toolkit.md#tree) (`app.components.Tree`): one label
    column, lazy children through the ordinary ACL-checked `list`, WAI-ARIA
    tree keys, remembered expansion, bounded expand/collapse all (10 levels,
    2000 nodes, 1000 children per node) with one toggle in the list's command
    row ([tree expansion](toolkit.md#tree-expansion)).
  - [Tree navigation](workspaces.md#tree-navigation): a tree panel beside the
    list scoped to the selected node, with the node view's actions.
  - The Workspace grid: server-side sort and filter, cursor windows, column
    presentation, manual order (`move`), marks and record actions.
  - TreeGrid is a Suite PRO capability and is not in the installed package
    ([component matrix](component-matrix.md)).
- **Proposed contract (to refine when taken up):**
  - A list view presentation mode (beside `table`, `cards`, `tiles`) for a
    view with a hierarchy on itself (`subview.shared` on its own resource,
    as `Tree` requires): the declared columns, the label column carrying the
    hierarchy. Same field metadata, ACL, actions, details and live behavior
    as the table.
  - Children load per node through the same authorized `list` with the
    parent scope, reusing `NodeTree`'s caps, cancellation and remembered
    expansion; the tree toolbar is the list's command row with the Tree's
    expand toggle on the right.
  - Sorting sorts siblings within each parent; a filter keeps the matching
    nodes with their ancestor path (ancestors shown as context, not as
    matches); both evaluated on the server.
  - Moving a node is a business action with the existing cycle and target
    checks (`move` and the parent field), offered as toolbar commands
    (up/down within a level, move under another node), not a context menu.
  - Narrow screens fall back to the Tree or to cards of one level with
    drill-down.
- **Open questions:**
  - Edition: licence Suite PRO TreeGrid and write a typed adapter, or build
    the hierarchy column on the Standard Grid (indentation and toggles in a
    cell template, rows inserted on expansion)? The second keeps the
    edition but needs its own keyboard and ARIA treegrid work.
  - Counts and aggregates per node (child count, sums) — server computed,
    and how they interact with ACL-filtered children.
  - Combined with marks, inline edit and the cursor window: what a window of
    a hierarchy means (per level or flattened visible rows).
- **Done when:** a demo view shows a hierarchy as a tree table; sort,
  filter, expand toggle, node moves, ACL on every child load and the narrow
  fallback are documented in the topic guide and covered by browser specs.
- **Sources:**
  [SAP Fiori Tree](https://www.sap.com/design-system/fiori-design-web/v1-96/ui-elements/tree/usage?external),
  [SAP Fiori Tree Toolbar](https://www.sap.com/design-system/fiori-design-web/v1-145/ui-elements/tree-toolbar/usage),
  [SAP Fiori Table Overview](https://www.sap.com/design-system/fiori-design-web/v1-120/foundations/best-practices/ui-elements/tables/table-overview),
  [SAP Fiori elements table features](https://www.sap.com/design-system/fiori-design-web/v1-151/discover/frameworks/sap-fiori-elements/tables-and-lists/table-features-sap-fiori-elements).

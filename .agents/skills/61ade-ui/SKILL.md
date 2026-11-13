---
name: 61ade-ui
description: Design, extend, or review 61ade's shared grid, record-tree, and card/DataView interfaces, including layout, interaction, accessibility, authorization, and validation. Use for framework UI work in 61ade itself; use 61ade-application for consumer application features and 61ade-consumer for integration.
---

# 61ade UI

Use this skill when a feature adds or changes a flat record list, a hierarchical
browser, a responsive record surface, or the shared behavior between those
views. It captures reusable lessons from the 61ade workspace, list, file-tree,
and card work. It is guidance for designing and extending the framework; the
public runtime contract remains in the project's topic guides and takes
precedence when guidance differs. For consumer application features use
[61ade-application](../61ade-application/SKILL.md); for integration use
[61ade-consumer](../61ade-consumer/SKILL.md).
For skin customization and family consistency reviews use
[61ade-skinning](../61ade-skinning/SKILL.md).

## Establish the boundary first

1. Read `AGENTS.md`, `docs/usage.md`, `docs/feedback.md`, the affected topic
   guide, and the current source/tests before choosing a component. Check the
   [accepted-rule ledger](references/accepted-rules.md) when a rule or feedback
   item is relevant.
2. Separate the general capability from the consumer's business definition.
   Extend the shared framework and its adapter first; keep fields, policies,
   actions, data sources, and business rules in the consumer. Do not add a
   parallel admin page or hand-built HTML/CSS list to compensate for a
   framework gap. A consumer's own domain page composes the framework's public
   list components instead of rebuilding them.
3. Use the existing native DHTMLX controls and supported extension points.
   Inspect the installed edition before promising a capability. Suite Standard
   does not make TreeGrid PRO behavior available; an unverified vendor option
   stays an explicit gap until a typed adapter and test prove it.
4. Keep the distinction between a **data tree** and a **layout tree** clear.
   A layout tree arranges panels; a data tree represents parent/child records.
   Do not make a layout declaration carry business hierarchy semantics.

## Choose the surface by the user's task

| Surface | Use it for | Contract to preserve |
| --- | --- | --- |
| Grid | Comparing many flat records, sorting/filtering, row selection, or inline edits | Stable row IDs, server-authorized query, complete-result sort/filter, bounded loading, and shared field metadata |
| Tree | Navigating parent/child structure, mounts, folders, or categories | Authorized roots and child loads, stable parent keys, lazy expansion where needed, cycle-safe moves, and keyboard navigation |
| Card/DataView | Scanning records with variable content, narrow viewports, or a complementary mobile presentation | The same fields, ACL, revisions, validation, actions, and selection semantics as the grid |
| Form/window | Creating, editing, or viewing one record or action input | The same server executor, optimistic revision, validation, ACL, audit, and explicit cancel behavior as every other editor |

Use a singleton form when there is no meaningful collection. Combine grid and
cards when the task is the same and only the presentation changes. Add a tree
only when hierarchy changes what users need to navigate or act on; do not add a
tree as decoration for a flat list.

## Define one metadata and authorization contract

- Give every resource, field, view, panel, action, and data-tree node a stable
  identifier. Labels, headers, messages, icons, and accessible names come from
  localized metadata; they are never hard-coded into a consumer template.
- The shared field definition drives form, grid, card, tree labels, filtering,
  sorting, formatting, validation, and editability. A field omitted from a grid
  may still appear in permitted cards/details; a denied field must not enter the
  response or browser metadata merely because another view can display it.
- Keep presentation capabilities explicit (`editable`, `secondary`, selection,
  row numbers, actions). A capability never overrides row, field, object, or
  channel ACL. UI hiding is not authorization.
- Configuration is typed data. Do not accept executable HTML/JavaScript,
  arbitrary vendor options, SQL, policy code, or callbacks in JSON definitions.
  Register a named adapter/handler when a real extension is needed.
- Apply authorization independently on list, get/details, child expansion,
  search/filter, sort, edit, action, live-watch, and download paths. Recheck
  authorization when a window or expansion loads fresh data.

## Build the layout around work, not decorative frames

- Make the declared DHTMLX layout the direct root. Keep filter, results, and an
  optional panel editor as distinct regions; an overlay editor is the default
  when a panel is not needed. A singleton is a direct readable/editable view.
- Avoid extra one-cell frames and nested borders. The outer results panel owns
  the frame; internal toolbar/data layouts use no competing frame. Preserve the
  established gap and native resizer behavior instead of moving widgets in CSS.
- Define ordinary toolbar insets in the common widget style, shared by list
  command bars and direct layout attachments. Do not rely on a list-only
  wrapper for basic spacing. The toolbar also owns its bottom separator,
  independent of the content below; avoid duplicating it in the host or next
  widget. Navigation and window headers may have their own role-specific
  geometry. If a toolbar fills an entire framed layout cell, the cell owns
  the outer edge; add no toolbar separator against that frame. Keep the
  separator when the toolbar shares a panel with content. Similarly, the
  final closed accordion header needs no lower rule against its panel frame;
  keep separators between sections and between an open header and content.
- Give the toolbar its own height and scroll boundary. Scrolling rows/cards must
  not cover commands. Keep view selection, sorting, column visibility, actions,
  filtering, and details discoverable through the native toolbar/menu; do not
  add duplicate commands for the same operation.
- A choice list that opens from a button outside a list's command bar (a
  history grouped by date, an account or model picker, a sort menu beside a
  title) is `app.ui.menu`: headings for groups, the current choice checked
  (read again at every opening), secondary text as `detail`. Never hand-build
  a `role="menu"` popup; a list's own record commands stay in its toolbar or a
  `CommandBar` `menu` ([FB-0202](../../../docs/feedback.md#fb-0202)).
- Use native controls, theme tokens, and framework sizing. Test light, dark, and
  the default theme; do not recreate a vendor skin or introduce a consumer
  shell layer to obtain a visual tweak.
- Choose icons from the bundled [catalog](../../../docs/icons.md) through
  the existing icon properties. Keep translated labels and accessible names;
  do not draw replacement glyphs or add an icon package for a catalogued icon.
  Keep native icon-slot and control geometry when replacing a glyph. Align
  count badges, labels and icons on the same vertical centre.
  Measure that centre against the button and its painted surface as well:
  equally aligned children can still sit too high together when an inline
  baseline adds empty space below their group.
- When project code composes a list into its own page, build one layout and
  mount the framework list component into a cell; do not nest a second frame
  around it. Content that changes (a notice, then a list; another scope) is
  replaced in the same cell: destroy the old component and mount the new one
  there right away ([FB-0161](../../../docs/feedback.md#fb-0161)). A
  rebuilt page Layout is attached before the old one is released, and
  release components before the layout that holds them.
- A page that scopes one list view on several fields shares one
  `preferencesKey` across them, pins its mode toggle (`pinned: true`), presets
  the field a computed scope implies with `createDefaults`, and declares a
  helper field used only for scoping `scopeOnly: true` (no column, details,
  filter or sort offers it; `column.details: false` only hides a value from
  the details)
  ([FB-0162](../../../docs/feedback.md#fb-0162)–[FB-0166](../../../docs/feedback.md#fb-0166)).
- A composed list's saved presentation state (mode, sort, columns, filters)
  belongs to the view identity it is given. Reuse the menu page's identity
  only when sharing its state is intended; otherwise give the composed list
  its own identity.
- Below the supported narrow-width breakpoint, move the complete command bar
  into the native actions menu while preserving original IDs, disabled/hidden
  state, events, and ACL. Force cards when the grid cannot be read; keep the
  desktop preference intact and make the forced selector informational.

## Grid rules

- Use the native Grid and its public data, scroll, selection, and column APIs.
  Do not patch vendor internals or render a second table beside it.
- Query the complete authorized/filtered result on the server. Sort one field
  at a time with a unique-key tie-breaker; reject unknown, secret, denied, or
  partially readable sort/filter fields. Use cursor windows and virtualization
  with explicit limits; never fake a full table with placeholders, client-only
  sorting, or an unbounded download.
- When the adapter supports integrated header filters, expose typed controls for
  filterable fields that are visible in the grid. An empty control removes that
  field from the request; changing it reloads the server window and counts.
  Keep the declared filter panel for filterable fields that are not visible in
  the grid. The server's typed query and ACL remain authoritative.
  Do not offer a text filter for a static image presentation merely because its
  stored value is a file name; derive the offered controls from its presentation.
- Keep "no filter" distinct from "filter for the empty value" in every filter
  control, request and saved state: an option declared with the empty value
  (such as "no parent") is a condition, while an initial or reset control
  shows no selected condition. Never display an option's label unless that
  condition is actually requested.
- Keep row identity, active/editor row, and marked rows separate. Marks survive
  grid/card switching and same-row live updates, while rows leaving the bounded
  window may drop their marks. Marks and the cursor row are transient: never
  persist them in UI preferences. Optional ordinal numbers describe position in the
  complete authorized result, not database IDs.
- A panel following an active record uses the framework's context event and
  query across main lists, expanded previews and child windows. Preserve each
  list's cursor separately from keyboard focus; do not reproduce toolbar
  delegation in the consumer ([FB-0125](../../../docs/feedback.md#fb-0125)).
- Keep each action in the toolbar once, with a native icon and its original
  label. A bulk-capable action applies to marks; do not add a second “selected
  rows” command. A field-free action runs directly; a form is for input.
- Put record actions, built-in or project commands, in the same toolbar, acting
  on the cursor record and disabled without one; offer no record context menu.
  Right click, the menu key and Shift+F10 keep the browser's behaviour. One
  place works on touch and keyboard alike (owner decision, toolkit G3).
- A custom column presentation is a pure renderer of one value: it escapes
  every record value, gives a value shown only as a picture, bar or colour a
  text alternative (visible text or an accessible name), and renders the same
  meaning in the table cell, the card and the details.
- Treat `secondary` columns as optional grid presentation only. Toggle them with
  the native show/hide API and persist each user's choice; cards/details still
  show every permitted readable field.
- Reapply sort and editing accessibility attributes after every data render,
  including slow or replaced responses. Keep `aria-sort`, editor descriptions,
  checkbox names, and keyboard focus on the final DOM, not only the first paint.

## Tree rules

- Model hierarchy with stable `id` and `parent_id` (or the framework's typed
  equivalent) and define which roots the actor may see. Load children through an
  authorized, bounded request; do not send an entire private tree to make
  expansion look instant.
- Expansion, search, selection, details, and actions all recheck ACL. A hidden
  parent must not leak child names or counts. Preserve the expanded/selected
  node by stable ID across refreshes and reject stale child responses.
- A move is a business command: check source and target scope, write rights,
  target existence, and cycles transactionally on the server. Restore the old
  position with a clear error when the server rejects it. Do not infer move
  permission from a draggable cursor.
- Use the Standard Tree adapter where it is supported. Record trees and list
  tree navigation load children on expansion; the file manager's tree loads
  a bounded mount at once. Do not infer one surface's capabilities from another.
  Drag/move, large-tree virtualization, and TreeGrid behavior need their own
  capability contract, edition check, synthetic example, and tests before
  being promised ([Tree](../../../docs/toolkit.md#tree),
  [file manager](../../../docs/files.md)).
- Give tree nodes the same keyboard/focus, localization, theme, loading,
  empty, error, and selection treatment as grids and cards. Do not use a tree
  merely to avoid designing a proper filter or list query.
- A hierarchy that drives other panels is one reusable record tree with tree
  semantics (one tab stop, `treeitem` levels and states, arrows/Home/End move
  the focus, Space selects, Enter selects and activates). Keep the focus
  separate from the selection, so moving through the tree does not reload the
  panels it drives; report the selection (also the initial and restored one)
  and the activation as events, and let the host compose the panels instead of
  growing a fixed tree-plus-list layout ([FB-0158](../../../docs/feedback.md#fb-0158)).
- Bulk expansion (an initial depth, expand/collapse all) stays lazy and
  bounded: it loads level by level through the same authorized child request,
  a few at a time, under explicit depth, per-node and total-node caps, stops
  at a cap leaving the rest collapsed and reports it, and is cancelled by a
  refresh or teardown. An automatic expansion is not the user's: a stored
  expansion is written only after the user changed it, so "nothing stored"
  and "everything collapsed" stay distinguishable, and the stored list keeps
  upper levels first when it is capped ([FB-0168](../../../docs/feedback.md#fb-0168)).
- Whole-tree controls (expand/collapse all) are view controls: one icon-only
  toggle whose icon and name follow the state (open everything while anything
  is collapsed, close everything once all is open or a cap stopped the
  opening), on the right of the same command row a list uses (its height, separator and
  shadow over the scrolling content, its collapse rules), never a separate
  unstyled row. The tree content is the only scroller below the bar
  ([FB-0191](../../../docs/feedback.md#fb-0191)).
- Tree rows read like grid rows: the grid's row height and one ellipsized
  line, stripes in displayed order with the grid's alternate token (never
  `:nth-child` on nested markup; restripe after every expansion), and the
  connector lines and +/- boxes drawn by CSS on the native toggle, so clicks,
  keys and ARIA stay native. The selected row is the grid's cursor row of the
  skin. A folder's motion moves only its children (sliding under its row, a
  copy when the vendor removes them at once), never clips the row or its
  connector, and starts before the vendor's redraw is painted. Stripes and lines are on by default and each can
  be switched off per tree ([FB-0193](../../../docs/feedback.md#fb-0193)).
- A list-wide mode is a two-state command of the list's own toolbar whose state
  belongs to the view identity, not to the scope it is mounted with, so a host
  that swaps the scope keeps it ([FB-0159](../../../docs/feedback.md#fb-0159)).

## Card and detail rules

- Render cards with the native DataView. Choose a readable minimum width and
  let the framework determine columns from the available panel; the 61ade
  workspace default targets roughly 340 px columns and one column on mobile.
  Records of long text (notes, comments, messages) declare cards only and one
  column (`modes: ["cards"]`, `cardColumns: 1`; the `ListView` option wins
  over the view's) instead of a project layout; with one offered mode there
  is no view switch and a kept other choice is ignored, not overwritten
  ([FB-0169](../../../docs/feedback.md#fb-0169)).
  Every card in a row has equal border-box width, wraps long unbroken text, and
  remains readable in all themes.
- Hovering a card or tile never moves or resizes it or its content (no
  transform, size or border-width change): signal it with the edge colour, an
  outer shadow or an overlay ([FB-0189](../../../docs/feedback.md#fb-0189)).
- Child-list buttons overlay existing media without increasing item height:
  upper right on cards, full width along the bottom on tiles. Cards without
  media retain the footer button ([FB-0144](../../../docs/feedback.md#fb-0144)).
- Cards/details use the same authorized fields as the record contract. Details
  fetch a fresh ACL-checked record; secrets, technical revision/ACL metadata,
  and denied fields stay absent. Fields omitted from the grid may be included
  when they are readable in the record response.
- Details beside an edit form of the same record are tabs of one panel
  (`Tabs` or a `PageLayout` `tabs` branch), never a hand-built tab row; leaving
  unsaved input asks first, and a discarded form is recreated with the stored
  values on the next opening ([FB-0145](../../../docs/feedback.md#fb-0145)).
  When both should be visible at once in a tall column, use sections of one
  panel (`Accordion` or a `PageLayout` `accordion` branch with `multiple`),
  never hand-built collapsible markup ([FB-0148](../../../docs/feedback.md#fb-0148)).
- Card editing is not a second save system. Editable text/select/textarea opens
  the native editor and uses the same revision, validation, cross-field checks,
  ACL, transaction, and audit path as grid/form editing. Read-only values stay
  text; checkbox changes may be direct only when the field and row are writable.
  Closing discards drafts and another edit cannot overtake an active save.
- Preserve the visible record, not a grid pixel offset, when switching between
  grid and cards with different row heights. Same-view live updates retain the
  user's scroll position and open drafts. A double-click opens details/editing
  without stealing display-text selection from inputs or editable content.

## Interaction, accessibility, and feedback

- Use native keyboard/focus behavior and explicit accessible names for every
  row mark, editor, sort state, tree node, view switch, and action. Test after
  asynchronous redraw, live refresh, mode switches, and responsive toolbar
  replacement, not only on an initial fast response.
- Size every form or details window with the shared `fitWindow` (content-fitted,
  capped at 800 px and the viewport unless the project passes `maxHeight`,
  remeasured after validation). A taller form scrolls between the fixed window
  header and its action row, which sticks to the window's lower edge; never
  let the buttons scroll away or build a second button bar for them. Never
  give a control a fixed pixel height in a window that can be larger than its
  content: a Form textarea takes the extra height when the window is capped or
  enlarged, so no empty band remains below the actions (FB-0058,
  [FB-0177](../../../docs/feedback.md#fb-0177)).
- Group a long form with declared field sections, never with hand-made
  headings or fieldsets: framed panels, collapsible (the accordion look) for
  optional groups, fixed (`sectionCollapsible: false`) for fields that must
  always show; prefer putting every field of a sectioned form in a section.
  The same sections group the cards and details: framed groups side by side
  by the available width, a long text outside the sections below them across
  the width ([FB-0177](../../../docs/feedback.md#fb-0177)). Groups in one row
  have equal outer heights with content at the top, using CSS stretch rather
  than height observers. Expose column sizing and ratios through the shared
  presentation's CSS properties, with stacking based on the record's own
  width ([FB-0186](../../../docs/feedback.md#fb-0186)). When opening a
  section must not resize the window, the action declares accordion sections
  (`formSections: 'accordion'`): the `Accordion` component's header and fixed
  geometry inside the one form, never one form per `Accordion` section
  ([FB-0178](../../../docs/feedback.md#fb-0178)). A long text or a file that
  forms a section alone declares `sectionFill`: the header is its visible
  name and the open section is the input, never a repeated label inside the
  section ([FB-0181](../../../docs/feedback.md#fb-0181)).
- Keep small panel controls named and pinned in the native command bar
  (`iconOnly`, `pinned`). For whole-tree expansion use the single stateful
  toggle described under Tree rules; [FB-0191](../../../docs/feedback.md#fb-0191)
  supersedes the two-button choice in [FB-0177](../../../docs/feedback.md#fb-0177).
- Open a file or document (text editor, image viewer, video player) in a
  document window: one Layout fills the Window, a native Toolbar row holds its
  commands (at least Save for an editable document, with Ctrl+S) and state, and
  the content cell takes every size the window gets, including native full
  size. Closing the window is the cancel and asks about unsaved changes
  (FB-0058).
- Keep Cancel beside Save (or the operation label) for every editable form and
  discard unsubmitted values on Cancel/close. Do not make a user confirm merely
  to press a second button that starts the same field-free action. Confirm only
  declared meaningful risk; report successful actions and secret reveals with a
  non-blocking toast.
- Keep loading, empty, denied, validation, conflict, and server-error states
  explicit. No list, region, tab, or section is a bare blank area: a list
  shows a delayed loading indicator and tells "no records" from "no match for
  the filters or search", and a region without content shows a placeholder
  (its waiting hint, or busy while content is known to be coming). Nothing
  there is a blank surface with a centred picture above the text; data still
  on its way is loading, never an empty message. All of it comes from
  the framework's one status element; a page builds no overlay or hint
  element of its own ([FB-0185](../../../docs/feedback.md#fb-0185)). Do not
  replace an authorization or validation failure with an empty grid, tree or
  card; a failed load says that the items are not available.
- Localize all visible text and accessible descriptions; theme colors and focus
  indicators through the existing token system. Never use a glyph, color, or
  hover affordance as the only meaning.

## Implementation and verification loop

Follow the project chain: concrete need → framework gap → smallest reusable
adapter/extension → independent synthetic demo → focused PHP/type/browser
checks → usage/feedback update → consumer integration. Inspect the affected
test group before editing and preserve existing changes.

At minimum, verify the behavior that changed across:

- authorized/denied rows, fields, roots, child loads, actions, and live events;
- server sort/filter, cursor bounds, stale responses, duplicate-free scrolling,
  and grid/card/tree state restoration;
- keyboard/focus and accessible attributes after slow async data;
- desktop, narrow/mobile, all supported themes, long text, empty/error states,
  and the native toolbar/menu geometry;
- inline/card/form edits, revision conflicts, validation, cancel, confirmation,
  marks, details, and partial bulk outcomes where applicable.

Use the managed project URL and the declared browser wrapper. Do not start an
ad-hoc server or claim a visual check from a build alone. Keep task-only
fixtures, screenshots, traces, and scratch tests in the declared temporary
area and remove them after verification unless explicitly retained.

## Teach the skill from accepted evidence

When user testing or a review yields a reusable rule, add the smallest
generalized statement to this skill or its [accepted-rule ledger](references/accepted-rules.md),
with the feedback/decision link and the scope or limitation. Do not promote a
consumer preference, one-off pixel fix, or unverified proposal to a universal
rule. If a rule changes, update the old statement and remove its superseded
copy from agent prompts/markup; keep the public runtime behavior and evidence
in the relevant topic guide. Record unresolved interpretation as an open
question instead of teaching it as fact.

The skill is the agent-facing home for reusable design decisions. The
[workspace guide](../../../docs/workspaces.md), [usage guide](../../../docs/usage.md),
and [feedback log](../../../docs/feedback.md) remain the evidence and public
integration references; do not copy their entire API or test history here.

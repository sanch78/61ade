---
name: grid-tree-card-ui
description: Design and extend shared grid, tree, and card/DataView interfaces in 61ade or a similar framework-first admin UI. Use when introducing a record list, hierarchy, responsive record surface, or reviewing its layout, interaction, accessibility, authorization, and validation contract; do not use for unrelated shell or one-off consumer markup.
---

# Grid, tree, and card UI

Use this skill when a feature adds or changes a flat record list, a hierarchical
browser, a responsive record surface, or the shared behavior between those
views. It captures reusable lessons from the 61ade workspace, list, file-tree,
and card work. It is guidance for designing and extending the framework; the
public runtime contract remains in the project's topic guides.

## Establish the boundary first

1. Read `AGENTS.md`, `docs/usage.md`, `docs/feedback.md`, the affected topic
   guide, and the current source/tests before choosing a component. Check the
   [accepted-rule ledger](references/accepted-rules.md) when a rule or feedback
   item is relevant.
2. Separate the general capability from the consumer's business definition.
   Extend the shared framework and its adapter first; keep fields, policies,
   actions, data sources, and business rules in the consumer. Do not add a
   parallel admin page, hand-built HTML/CSS surface, or consumer-specific
   frontend to compensate for a framework gap.
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
- Give the toolbar its own height and scroll boundary. Scrolling rows/cards must
  not cover commands. Keep view selection, sorting, column visibility, actions,
  filtering, and details discoverable through the native toolbar/menu; do not
  add duplicate commands for the same operation.
- Use native controls, theme tokens, and framework sizing. Test light, dark, and
  the default theme; do not recreate a vendor skin or introduce a consumer
  shell layer to obtain a visual tweak.
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
- Keep row identity, active/editor row, and marked rows separate. Marks survive
  grid/card switching and same-row live updates, while rows leaving the bounded
  window may drop their marks. Optional ordinal numbers describe position in the
  complete authorized result, not database IDs.
- Keep each action in the toolbar once, with a native icon and its original
  label. A bulk-capable action applies to marks; do not add a second “selected
  rows” command. A field-free action runs directly; a form is for input.
- Put record actions, built-in or project commands, in the same toolbar, acting
  on the cursor record and disabled without one; offer no record context menu.
  Right click, the menu key and Shift+F10 keep the browser's behaviour. One
  place works on touch and keyboard alike (owner decision, toolkit G3).
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
- Use the Standard Tree adapter where it is supported. Lazy children, drag/move,
  large-tree virtualization, and TreeGrid behavior need their own capability
  contract, edition check, synthetic example, and tests before being promised.
- Give tree nodes the same keyboard/focus, localization, theme, loading,
  empty, error, and selection treatment as grids and cards. Do not use a tree
  merely to avoid designing a proper filter or list query.

## Card and detail rules

- Render cards with the native DataView. Choose a readable minimum width and
  let the framework determine columns from the available panel; the 61ade
  workspace default targets roughly 340 px columns and one column on mobile.
  Every card in a row has equal border-box width, wraps long unbroken text, and
  remains readable in all themes.
- Cards/details use the same authorized fields as the record contract. Details
  fetch a fresh ACL-checked record; secrets, technical revision/ACL metadata,
  and denied fields stay absent. Fields omitted from the grid may be included
  when they are readable in the record response.
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
  capped at the viewport, remeasured after validation). Never give a control a
  fixed pixel height in a window that can be larger than its content: a Form
  textarea takes the extra height when the window is capped or enlarged, so no
  empty band remains below the actions (FB-0058).
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
  explicit. Do not replace an authorization or validation failure with an empty
  grid/tree/card.
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

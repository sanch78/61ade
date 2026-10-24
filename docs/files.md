# Virtual file manager

Status: first vertical slice implemented on 2026-10-23
([FB-0058](feedback.md#fb-0058)); user acceptance is not claimed.

A two-panel, Norton Commander-style file manager over a framework-owned virtual
file store. The framework owns storage, actions, authorization, validation,
transactions, audit and the DHTMLX UI; a consumer declares the space, mounts,
limits and ACL rules. Nothing is read from or written to host directories or a
web root.

## Building blocks

| Part | Location | Responsibility |
| --- | --- | --- |
| `Blade\Files\FileStorage` | `packages/php/src/Files/FileStorage.php` | All SQL of the `blade_files` table: entries, BLOB content, hierarchy, copy/move primitives, safe-name rules. |
| `Blade\Files\FileManagerDefinition` | `packages/php/src/Files/FileManagerDefinition.php` | Consumer configuration, explicit installer, registration and browser metadata. |
| `Blade\Files\FileActions` | `packages/php/src/Files/FileActions.php` | Registered action handlers with item-level checks. |
| Multipart transport | `Feature/Upload.php`, `Workspace::http`, `Action::$upload` | Binary parts for actions that opt in; never base64 JSON. |
| Binary result | `Feature/Download.php`, `Workspace::http` | A handler returns `Download` (allowlisted MIME type, bytes, audit detail); the transport sends raw bytes instead of JSON. |
| `FileManager` | `packages/frontend/src/FileManager.ts` | Two panels, mount selectors, operations bar, upload window and document windows (text editor, image viewer, video player). |
| `TreeAdapter` | `packages/frontend/src/TreeAdapter.ts` | DHTMLX Suite Standard Tree over a flat parent-linked list; folders and leaves with their own icon. |
| `DesktopOnly` | `packages/frontend/src/DesktopOnly.ts` | Shell wrapper of the generic `desktopOnly` view option ([shell](shell.md#desktop-only-views)). |

The panels reuse the framework `ResponsiveGrid` (row marking as in the
workspaces' `rowSelection` mode: click, Ctrl/Cmd-click and Shift-click, no
checkbox column; cards below 768 px) and the shared [dialogs](dialogs.md),
including the multiple-choice mode used for name conflicts. The first listing
column is a framework `icon` column: a Suite icon class per row with its
localized accessible name (`Mappa`, `Kép`, `Táblázat`, `Szöveg`, `Fájl`),
chosen from the entry kind and detected MIME type. TreeGrid PRO is not used.

**Listing navigation and header.** There is no Up button. In a subfolder the
listing's first row is `..` (icon `Szülőmappa`), as in Midnight Commander:
double-click or Enter opens the parent folder with the cursor on the folder
just left. The row carries the framework's `_markable: false` row flag, so it
can hold the cursor but is never marked or an operand. The panel's Layout
header shows the current path (`Drive A:/Dokumentumok/Projektek`), not a
fixed panel name. When it does not fit, folders are collapsed from the root
side, keeping the mount and the current folder (`Drive A:/…/Projektek`), and
CSS cuts what still overflows; the fit is recomputed when the panel is
resized. Hovering a shortened header shows the full path in the native Suite
tooltip.
Create-folder and upload windows have Cancel beside the submit button, like
the workspace forms; document windows close with the window's close button.

## Entry model

Each `blade_files` row is one entry: `id`, `space`, `mount_id`, `parent_id`,
`kind` (`directory`/`file`), `name`, case-folded `name_key`, `extension`,
`mime_type`, `size`, `content` (BLOB), `modified_at`, `revision`.
A mount root has `parent_id = 0` and depth 0. `UNIQUE(space, mount_id,
parent_id, name_key)` keeps names unique per directory, case-insensitively.
Contents live in the database, so copy and move share the action transaction.
No separate `storage_key` blob store exists.

Names are rejected when empty, longer than 255 characters, invalid UTF-8,
containing `/`, `\`, NUL, control or invisible format characters (such as bidi
overrides), starting or ending with a space, or consisting only of dots. Client
paths are never used; operations address entries by ID.

## Integration

Install explicitly (HTTP requests never run DDL), then register:

```php
use Blade\Files\FileManagerDefinition;

$files = new FileManagerDefinition('files', 'Fájlkezelő', 'demo',
    ['a' => 'Drive A', 'b' => 'Drive B', 'c' => 'Drive C'],
    allowedExtensions: ['txt', 'md', 'csv', 'json', 'png', 'jpg', 'mp4', 'webm'],
    maxSizeBytes: 5242880, multiple: true, duplicatePolicy: 'ask',
    textMaxBytes: 65536, group: 'Feature demó', desktopOnly: true);
$files->install($pdo);            // setup step: table and one root per mount
$files->register($workspace);     // application definition
```

| Setting | Meaning |
| --- | --- |
| `resource` | ACL resource and view id; actions are `<resource>.<action>`. |
| `space` | Storage namespace; several file managers may share the table. |
| `mounts` | Mount key ⇒ label; each panel selects one independently. |
| `allowedExtensions` | Upload allowlist; only `txt`, `md`, `csv`, `json`, `png`, `jpg`, `jpeg`, `mp4`, `webm` have known MIME detection rules, other values fail at startup. |
| `maxSizeBytes` | Upload limit per file (actual received bytes). |
| `multiple` | Allows up to 20 files per request; otherwise one. |
| `duplicatePolicy` | `ask` (conflict dialog), or a fixed `overwrite`, `rename`, `skip`, `reject`. |
| `textMaxBytes` | Separate limit of the text editor, for opening and saving. |
| `maxDepth` | Deepest directory level below a mount root (default 5). |
| `desktopOnly` | Below 768 px show the desktop-only notice instead of the panels (default `false`). |

## Actions and authorization

| Action | Target id | Purpose |
| --- | --- | --- |
| `tree` | mount key | Every directory of the mount (≤ 2000, otherwise `413`) and its first 5000 files by name, each with `kind` and `mime_type`; `truncated` marks omitted files. |
| `list` | directory | Entries, path and depth (first 1000 entries; `truncated` flag). |
| `create_directory` | parent directory | Field `name`. |
| `upload` | target directory | Multipart `files[]` parts, optional `decision`. |
| `copy` / `move` | target directory | `sources` (comma-separated IDs, ≤ 100), optional `decision`. |
| `text_get` | file | Content and revision of a `.txt` file. |
| `text_save` | file | Multipart `content` part and expected `revision`. |
| `content_get` | file | Raw bytes of a PNG, JPEG, MP4 or WebM file for the viewers (`415` for other types). |

Every action runs through the common executor: authentication, CSRF for the
browser channel, channel/token scope, ACL, field validation, transaction and
audit. The ACL object of every file action is the **mount key**, so rules can
grant a whole space (`all`) or individual mounts (`id` scope, object `a`).
Item-level rules are not supported. The view lists only offered actions and
only the mounts whose `tree` the actor may read; hidden controls are not
protection — every request is checked again.

Copy checks `copy` on the destination mount and `list` (read) on every source
item's mount. Move additionally requires `move` on every source mount, because
it changes the source location. Copying or moving a mount root, a nested
selection, or a directory into itself or a descendant is rejected.

UI and API are separate channels: UI rules do not grant API access, and API
token scopes only narrow (`files.list`). Multipart requests are accepted only
for actions that declare `Action::$upload` (`upload`, `text_save`) and within
that byte limit; everything else stays JSON-only (415).

## Behavior

**Depth.** Directories may be created through depth `maxDepth` (5); depth 6 is
rejected server-side. Files may be placed in any directory. Copy and move
preflight the depth of every directory in every moved subtree before any write;
one violation rejects the whole request.

**Copy and move.** Recursive; across mounts too. Each request is one
transaction and handles at most 5000 entries. Name conflicts without a decision
return `409` with `details.conflicts` and change nothing. The UI then shows the
shared dialog with Overwrite, Rename, Skip and Cancel; one decision applies to
all conflicts. Overwrite replaces files only; a directory or mismatched kind is
reported as failed (no recursive merge or deletion). Rename picks the next free
`name (n).ext`. Moving an item into its current directory is reported as
failed. The response summarizes `succeeded`, `skipped` and `failed` items;
the UI shows a toast when everything succeeded, otherwise a summary dialog.

**Upload.** A DHTMLX Window with a native file input. The server validates the
safe name, extension allowlist, actual size, and MIME type detected from the
received bytes with `finfo` (very short text files fall back to a clean-UTF-8
check); the browser MIME value is ignored. Invalid files are reported per file;
valid ones are stored. If every file is invalid the request fails with `400`.
Duplicates follow `duplicatePolicy`; with `ask` the first request returns a
`409` conflict and the browser resends the files with the chosen decision.

**Document windows.** The text editor, image viewer and video player share
one window shape: a resizable DHTMLX Window holding one Layout that fills it,
with a native Toolbar row above the content cell. The content takes every size
the window gets, including the native full size (toolbar toggle), so no fitted
height or empty band exists. Double-click, Enter or the operations bar
(`Szerkesztés`, `Megtekintés`) opens the window that fits the file type.

**Text editor.** Only `.txt` files (case-insensitive extension) open, enforced
by `text_get`/`text_save` on the server (`415` otherwise). Files above
`textMaxBytes` or not valid UTF-8 are rejected. The content cell is a
monospace Form textarea; the toolbar has Save (also Ctrl+S, enabled only with
changes), a line-wrap toggle, the cursor line and column, and the save state
(`Mentve`, `Módosítva`, `Mentés…`). Saving sends the expected revision; a
stale revision returns `409` with `details.conflict` (current revision, time,
size) and the UI offers to load the current version. Closing with unsaved
text asks first. Actors without `text_save` see the text read-only, without
Save.

**Image viewer and video player.** `content_get` returns the stored bytes of a
`image/png`, `image/jpeg`, `video/mp4` or `video/webm` file (the type detected
at upload) as a `Download`: the response carries that type,
`X-Content-Type-Options: nosniff`, `Content-Disposition: attachment`, a
sandboxing CSP and `no-store`. The browser shows it through a blob URL that
is released when the window closes; the shell CSP allows `blob:` images and
media. The image viewer fits the image to the window without enlarging it,
zooms in steps (toolbar, `+`/`-`, `0` to fit, double-click toggles fit and
100 %), offers fit/50/100/200 %, rotates by 90°, scrolls when larger, and
shows dimensions and size. The video player uses the browser's native
controls, with loop and playback speed in the toolbar, and shows dimensions,
length and size. Whether a format plays depends on the browser (WebM is the
portable choice).

**Panel view modes.** As in Midnight Commander, each panel independently shows
either its file listing (`Nézet: Fájllista`, default) or its folder tree
(`Nézet: Mappafa`), chosen in the panel bar. The tree shows folders and files,
files with the same MIME icon as the listing. Selecting a folder opens it in
the tree and makes it the panel's current folder: the target of copy/move from
the other panel, upload and new folder. Selecting a file makes its folder
current. When a tree-mode panel is the source, the selected file or folder
itself is copied or moved (a mount root cannot be); a selected `.txt` file
opens in its document window with the command or a double-click. Both modes stay
mounted and the inactive one is hidden by cell CSS (a Layout `views` switch
would re-create the listing's DOM and drop its row-marking listeners), so
switching keeps the folder and marks.

**Panel widths.** The panels sit in a native `wide` Layout group and the left
cell is `resizable`: the native divider drags in both directions. Its dot grip
is centred in the gap by the framework rule of
[panel resizers](workspaces.md#panelméretező-megjelenítése). Neither cell declares `width` or `minWidth`, which would make the
Layout cells fixed. The only CSS is `contain: inline-size` on the panels, so
grid columns or a tree never widen a panel; dragged widths apply unchanged.
As in every native Layout, a window resize returns to equal halves and the
width is not stored.

**Narrow screens.** With `desktopOnly: true` (the demo) the shell shows the
centred desktop-only notice below 768 px instead of the panels; the file
manager stays mounted, so widening the window restores mount, folder, mode and
marks. Without the option, one panel is shown at a time below 768 px, the
operations bar's Actions menu contains the panel switch, and the inactive
panel is hidden by CSS only. Listings switch to cards.

**Audit.** Executor audit rows record actor, channel, operation, target object,
outcome and changed field names. File actions add an ID-only `detail` JSON
(e.g. `target`, `sources`, `succeeded` source>result pairs, `skipped`,
`failed`, `created`, `replaced`). Contents, names, passwords and tokens are
never stored. Rejected and failed requests are audited without detail rows.

## Prerequisites

PHP 8.4+ with PDO SQLite (or MySQL InnoDB) and `fileinfo`. Run
`Blade\Access\Schema::install()` (adds the audit `detail` column to earlier
databases) and `FileManagerDefinition::install()` from setup. The web server
must accept the configured upload size; the managed demo's PHP-FPM pool allows
200 MB per request. PHP's default `max_file_uploads` (20) is the per-request
file cap.

## Demo and verification

Feature demo → `Fájlkezelő` ([demos](demos.md#teljes-feature-demó-)). Setup
seeds Drive A–C with nested folders (depth-5 chains under
`Dokumentumok/Projektek/2026/Q4/Mérföldkövek` and `Mély mappa/1/2/3/4`), text,
Markdown, CSV, JSON, PNG and JPEG files, `Média` on Drive A with a synthetic
fractal JPEG (1600 × 1000) and a 6-second test-pattern WebM made with ffmpeg
(`examples/demo-app/resources/files`, added to existing demos on the next
setup run), `OLVASS-EL.TXT` (uppercase
extension), `Feltöltési minták` with non-uploadable `.exe`/`.pdf` samples and
`nagy-naplo.txt` above the 64 KiB editor limit, and `jegyzet.txt` on Drive A
and C for conflicts. `demo@example.test` has every file action;
`reader@example.test` may only browse, read text and view media.

- `php8.4 tests/shell/files.php`: tree items with files and MIME types only,
  names, depth 5/6, duplicates, editor rules
  and conflicts, `content_get` bytes and types, its refusals, rule and
  content-free audit, upload validation and decisions, recursive cross-mount copy
  and move, cycles, depth preflight without changes, per-mount and per-source
  ACL, UI/API separation and token scope, audit content.
- `npm run test:browser -- tests/shell/files.spec.cjs`: managed demo flows —
  independent mounts, listing/tree view modes and their synchronization,
  files and MIME icons in the tree and listing, row marking without
  checkboxes, the unmarkable `..` row returning with the cursor on the folder
  left, the header path collapsed with its full-path tooltip, a tree-mode folder copy and file move, depth limit, Cancel buttons, upload summary
  and conflict dialog, the editor window (toolbar state, Ctrl+S, line wrap, the
  textarea filling the window also after enlarging it, unsaved warning,
  conflict), the image viewer (fit, zoom, 100 %, rotation, blob URL released on
  close), the video player (metadata, loop, speed, playback, full size), the
  `content_get` response headers, copy/move/skip, direct
  unauthorized requests, audit rows, English/Hungarian, all three themes,
  the divider grip centred in the gap, a drag fully left and back right with
  the right panel still filling the row, and the desktop-only notice with state kept. Entries created by the spec are removed. The panel switch of a file
  manager without `desktopOnly` has no browser test, as the demo opts in.

## Limits

- No deletion, rename-in-place or file download; deletion is outside this
  slice. Previews cover PNG, JPEG, MP4 and WebM; other types (Markdown, CSV,
  PDF) have no viewer.
- Viewer content is loaded whole (≤ `maxSizeBytes`); there are no HTTP range
  requests or streaming for large videos.
- Permissions are per mount, not per entry.
- Trees load a mount's directories (≤ 2000) and first 5000 files at once;
  lists show the first 1000 entries without paging, sorting or live updates.
- Conflict decisions apply to all conflicting items of one request.
- Directory overwrite (merge) is not supported.
- Contents are stored as BLOBs in the application database; there is no
  external blob store or JSON-file storage support.
- File-manager configuration is PHP only; there is no JSON module section yet.

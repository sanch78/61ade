# Uploader and file/media list: implementation plan

Status: proposed plan, 2026-10-24. Not implemented. Owner decisions are
recorded in [FB-0063](feedback.md#fb-0063).
Milestone: [M6](development-plan.md#m6--fájlok-exportimport-jobok-és-megfigyelhetőség).
Current behavior: [files](files.md), [signage demo](feedback.md#fb-0061).

## 1. Purpose and scope

Two framework capabilities, shown through the existing demos:

- a reusable **uploader** that replaces the native file-input dialog in the
  file manager and becomes the only upload flow for future features;
- a **media-aware list presentation** (thumbnail column, tiles view, media
  card slot, search/type filter/sort) usable by any grid, card or file listing.

The `files` and `signage_assets` features are **synthetic demo consumers**.
They are good examples of the capabilities, not a DMS or file-manager product.
Real consumers configure the same capabilities (storage root, limits, mounts,
usage providers) for their own needs.

Excluded from this plan: pause/resume across
browsers or devices, image editing, upload from URL, tags and collections,
duplicate detection by hash, a general job runner (M6).

## 2. Starting state (source inventory, 2026-10-24)

- Content is a DB BLOB (`FileStorage.php` `content`), read and written as a PHP
  string; `Download` cannot stream and has no Range support; viewers fetch the
  whole file through `content_get`.
- Upload is one multipart request for all files through `Action::$upload`
  (`FileActions.php`), `MAX_FILES = 20`, ceiling 100 MB per file; a name
  conflict returns 409 and one decision re-sends every file.
- The client (`FileManager.ts`) is a Window around `<input type=file>`: no
  progress, cancel, retry, drag-and-drop, paste or folder upload; only the file
  count is checked before sending.
- `ResponsiveGrid` has two modes (table, cards), a fixed 40 px row height in its
  paging math and text-only cards; `Field` has no file/media/icon type.
- The file manager listing is capped at 1000 entries with no search, filter,
  sort or paging; delete, rename and download are missing.
- Signage assets reference `blade_files` through a 500-row select binding
  (`signage.media_files`); `kind` duplicates the MIME type.
- `@dhtmlx/suite` 9.3.12 (GPL) exports a headless `Uploader`; the Vault widget
  is a separate commercial product and is not used.
- ffmpeg/ffprobe 6.1.1 are installed on the development host.
- There is no background job capability yet (product direction: planned, M6).

## 3. Phases

Order is dependency, not schedule. Each phase ends with its tests, usage docs,
feature-demo entry, capability-table row, event-catalog entries and a feedback
update, per [development rules](development.md#mandatory-framework-development-rules).

### U1 — Disk content store, metadata, derivative tasks

- `Blade\Files\ContentStore`: content under a consumer-configured root,
  `<root>/<space>/ab/cd/<sha256>`, atomic temp-write + rename, reference
  counted so copies share content.
- `FileStorage`: `storage_key`, `sha256`, `width`, `height`, `duration_ms`,
  `orientation`; create/replace take a source path; copy shares the hash;
  removal decrements references and collects after commit.
- `Blade\Files\MediaProbe`: `getimagesize` and `ffprobe` (argument array,
  timeout). Metadata only; video length is not a validation rule.
- `Blade\Files\Thumbnails`: 320 px WebP (GD for images, an ffmpeg frame for
  video) in `blade_file_derivatives(file_id, revision, kind, storage_key, mime, state)`.
- **Background derivative tasks:** a minimal framework task queue table
  (`pending/running/done/failed`, attempts, bounded retry) processed after the
  response (`fastcgi_finish_request`) and lazily retried on read. It is a
  narrow precursor of the M6 job capability, not a host timer or cron.
- Transport: `DownloadStream` and GET-capable, ACL-checked `content_stream`
  (single-range 206/416, ETag from revision, `private` cache, `nosniff`) and
  `thumbnail_get`.
- Options on `FileManagerDefinition`: `contentRoot`, `tempRoot`,
  `maxSizeBytes` (≤ 100 MB), `maxFiles` (≤ 20), `thumbnails`.
- Migration `0002`: stream existing BLOBs to the store, verify hashes, queue
  derivatives; idempotent and resumable; the BLOB column is dropped only in a
  later step after verification. The demo uses `blade_demo_runtime('files')`.

Acceptance: no new BLOB content; video previews seek via Range; thumbnails
appear for PNG/JPEG/MP4/WebM after the background task; ACL denial on every
new GET action.

### U2 — Uploader capability

- Server: typed `UploadPolicy` (extensions/MIME, `maxSizeBytes`, `maxFiles`,
  `chunkBytes`, `folders`, duplicate policy) attached through `Action::$upload`.
  Executor actions `upload_preflight`, `upload_begin`, `upload_chunk`,
  `upload_status`, `upload_finish`, `upload_abort`. Transfers are bound to
  actor and session under `tempRoot`, with TTL cleanup. Folder upload creates
  directories by `relativePath` with depth/name checks. Per-file error codes:
  `too_large`, `type`, `content_mismatch`, `conflict`, `depth`, `quota`.
- Client: `Uploader.ts` on a framework Window/Layout/Grid — drop zone with the
  rules visible, button, folder, clipboard paste; queue rows with thumbnail,
  status, progress, cancel, remove, retry; per-file conflict decision with
  “apply to all”; 3 parallel transfers; resume after reload; in-window summary.
  The window can close while transfers continue; a compact shell indicator and
  a toast report the result. API `blade.upload.open({action, target, policy,
  files?})` with `upload:*` events.
- Keyboard and screen-reader path, `aria-live` status, hu/en/de, all themes.

Acceptance: 20 mixed files give per-file results without re-sends; a resumed
upload completes after reload; an independent synthetic consumer uses it.

### U3 — Media-aware list presentation

- `Field`: column types `media` (value is a file id) and `icon`, typed data only.
- `RecordPresentation.recordMedia()`: escaped lazy `<img>` from
  `thumbnail_get`, fallback type icon (including video), duration badge,
  accessible name.
- `ResponsiveGrid`: configurable `rowHeight` used by all paging/restore math;
  third mode `tiles` (`tileMinWidth`); media slot on cards and tiles;
  `keyNavigation`; mode stored in `UiPreferences`; fix the FB-0058 listener loss.
- `ListSource`: declared name search and MIME-class filter.

Acceptance: scroll/paging restore at a taller row height; tiles reflow at phone
width; type is conveyed in text, not only icon or colour.

### U4 — File manager demo

- Two panels stay; each offers listing, tiles and tree.
- Paged, server-sorted reads (name, modified, size, type) with an `id`
  tie-breaker replace the 1000-entry list; toolbar search, type filter, sort.
- New actions: delete (bulk; shared confirmation, lists usages; behaviour
  from the delete policy below), rename, streamed download, and multi-file or
  folder download as a streamed ZIP (no temp copy of the whole archive).
- **Framework delete policy:** a typed option `deletePolicy: 'archive' |
  'delete'` on deletable definitions (file manager first, then SqlResource/JSON
  module deletes in U5). `archive` marks the record (`archived_at`,
  `archived_by`) and every framework read, lookup, count and usage query hides
  it as if deleted; `delete` removes it (files: reference-counted content
  collection). Archive is the documented recommendation for new framework
  development; the choice stays a per-definition decision. The demos use
  `delete`. Showing archived records to a user (for example behind a
  permission) is consumer-specific and gets no system-level feature here.
- Drop onto a panel or Ctrl+V in a focused panel opens the uploader targeting
  that panel's folder; in-flight files appear as non-markable rows; results are
  inserted in place without reloading both panels.
- Preview gains previous/next across the current result.

### U5 — Signage demo on shared files, usage warnings

- Signage media live in a dedicated demo mount (“Signage”) that the file
  manager shows and manages like any other mount.
- Framework `Field` type `file` (`mount`, `folder`, `accept`, `policy`): form
  shows the thumbnail with “Choose…” (tiles picker) and “Upload…” (U2).
- Framework `FileUsageProvider`: consumers report references; delete returns
  `details.usages` for the confirmation, then calls the providers to clear
  their references. Owner decision: deleting a used file is allowed with a
  warning, and the asset's file reference is cleared. Under `archive` the
  providers are still told, so archived files behave as deleted everywhere.
- `signage_assets` delete uses the same delete policy (`delete` in the demo)
  and the same usage warning for schedule events and day defaults.
- `signage_assets`: thumbnail, title, derived type/resolution/length columns,
  play time, usage count; “upload as asset” in one step. The 500-row select
  binding and the kind check are removed.

## 4. Risks

- Migrating BLOBs touches retained demo data: dry run, verify, resumable.
- Web server and CLI need group access to the content root (setgid pattern).
- New GET transports widen the attack surface: ACL, MIME allowlist,
  revision-keyed ETag, no public paths.
- Post-response tasks die with a worker restart: the queue retries on read.
- `ResponsiveGrid` row-height changes can regress scroll restore in other grids.
- `webkitdirectory` and paste differ across browsers; the button remains the
  fallback.

- Archive hides records only where framework reads are used; consumer SQL
  bindings (such as signage usage counts) must filter archived rows themselves.

## 5. Open questions

None at the time of approval.

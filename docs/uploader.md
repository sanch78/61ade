# Uploader

Status: implemented on 2026-10-24 as phase U2 of the
[uploader and file/media plan](files-media-plan.md) ([FB-0063](feedback.md#fb-0063));
user acceptance is not claimed.

The uploader is the framework's only upload flow. It is built on DHTMLX Suite
Standard components (Window, Layout, Grid, Toolbar) and a framework transfer
protocol; the commercial Vault widget and third-party uploaders such as Uppy
are not used. The framework owns the protocol, authorization, temporary
storage, the window, the queue and the shell indicator. A consumer declares an
`UploadPolicy` on its own upload action and handles the finished file in that
action's handler, like any other registered action.

## Building blocks

| Part | Location | Responsibility |
| --- | --- | --- |
| `Blade\Feature\UploadPolicy` | `packages/php/src/Feature/UploadPolicy.php` | Typed rules: extensions, size, file count, chunk size, folders, depth, duplicate policy, temporary root, TTL, optional domain preflight. Canonical safe-name and folder-segment rules. |
| `Blade\Feature\Transfers` | `packages/php/src/Feature/Transfers.php` | The `__upload` transfer protocol: preflight, resumable chunked transfers bound to their owner, assembly, finish through the executor, TTL sweep. |
| `Action::$upload` | `packages/php/src/Feature/Action.php` | `int` (direct multipart limit), `UploadPolicy` (protocol plus direct multipart) or `null`. |
| `uploads` | `packages/frontend/src/Uploader.ts`, `uploader.css` | Page-lifetime service: non-modal window, drop zone, queue grid, parallel chunked transfers, conflict decisions, resume, shell indicator, toasts, events. |
| `requestChoiceAll` | `packages/frontend/src/MessageDialog.ts` | Shared choice dialog with an "apply to all" checkbox ([dialogs](dialogs.md)). |

## Integration

Server: attach a policy to the action that receives the file. The action must
declare the fields its clients send (`decision`, and `relative_path` when
folders are allowed); the executor rejects unknown fields.

```php
use Blade\Feature\{Action, Field, UploadPolicy};

$policy = new UploadPolicy(['png', 'jpg'], maxSizeBytes: 10485760, maxFiles: 5,
    tempRoot: '/srv/example/data/transfers', duplicatePolicy: 'ask');
$registry->add(new Action('attachments', 'upload', 'Feltöltés',
    [new Field('decision', 'Névütközés esetén', 'select', options: ['overwrite' => 'Felülírás', 'rename' => 'Átnevezés', 'skip' => 'Kihagyás'])],
    fn($ctx, $target, $values) => store_attachment($ctx, $target, $ctx->uploads[0], $values),
    resolve: $resolveRecord, write: true, upload: $policy));
```

| Option | Meaning |
| --- | --- |
| `extensions` | Lower-case allowlist (required). |
| `maxSizeBytes` | Per file, at most 100 MB. |
| `maxFiles` | Per batch, 1–20 (quota). |
| `chunkBytes` | 256 KiB–8 MiB. The default is min(4 MiB, `upload_max_filesize` − 64 KiB, `post_max_size` − 64 KiB) of the running PHP (the managed demo's FPM: 4 MiB); an explicit value above either limit fails at construction. |
| `folders`, `maxDepth` | Allow `relative_path` folder uploads and their depth. |
| `duplicatePolicy` | `ask`, `overwrite`, `rename`, `skip` or `reject`. |
| `tempRoot` | Absolute, persistent, group-writable directory outside web roots (transfers live in `<tempRoot>/<id>/`). |
| `ttlSeconds` | Unfinished transfer lifetime, 600 s–7 days (default 1 day; activity extends it). |
| `preflight` | Optional `fn(Context, array $target, array $files): array` adding per-index domain verdicts (name conflicts, depth). |

The file manager builds its policy from its own options
(`FileManagerDefinition::uploadPolicy()`, `tempRoot`) and exposes it as
`files.upload.policy` metadata ([files](files.md#behavior)).

List views open it automatically for actions that declare an `UploadPolicy`
(the signage `Feltöltés` command), and the `file` field opens it for its
folder ([workspaces](workspaces.md#file-field)).

Client: open the shared uploader from a command; never build another upload
dialog.

```ts
import { uploads } from "./Uploader";

uploads.open({resource: "attachments", action: "upload", target: recordId,
  targetLabel: title, policy: view.upload.policy,
  onUploaded: result => refresh(result)});   // once per batch; long-lived views subscribe to upload:file-done instead
// A handler result without succeeded/skipped/failed (e.g. {ok: true}) counts as one success.
uploads.on("upload:complete", ({succeeded, failed}) => …);
```

Events: `upload:queued`, `upload:started`, `upload:progress` (`received`,
`size`), `upload:conflict`, `upload:file-done` (`result`), `upload:file-failed`
(`code`, `message`), `upload:complete`, `upload:cancelled`; each carries a
read-only `file` (`id`, `name`, `size`, `type`, `relativePath`, `resource`,
`action`, `target`). The service also offers `reopen()` and `busy`; the shell
configures it with the CSRF token and the user id.

## Transfer protocol

`POST ./?blade=1` with the CSRF header (UI) or a Bearer token (API), envelope
`{resource, action: "__upload", id: <target>, values: {operation, action: <target action>, …}}`.

| Operation | Values | Result |
| --- | --- | --- |
| `upload_preflight` | `files: [{name, size, type, relative_path?}]` | Per-file `{index, ok, code?, message?, conflict?}`; nothing is created. |
| `upload_begin` | `file: {name, size, type, relative_path?, last_modified?}`, `fingerprint` | `{transfer, received, size, chunk_bytes, expires_at}`; an unexpired transfer of the same owner, target, fingerprint, name, size and path is returned (resume). Audited with the size only. |
| `upload_chunk` | multipart `request` + part `chunk`; `transfer`, `offset` | `{received}`; a wrong offset is `409` with `details.received` (the transfer stays resumable); bytes beyond the declared size `400 too_large`, a part above `chunkBytes` `413` and any other permanent `4xx` remove the transfer. |
| `upload_status` | `transfer` | `{received, size, state}`. |
| `upload_finish` | `transfer`, `decision?` | The target action runs through `Executor::execute` with the assembled file as the only upload: ACL, field validation, transaction and audit as usual. A name conflict is `409` with `details.conflicts` and keeps the transfer for a later finish with a decision; `≥ 500` keeps it too (the client retries); success, skip and every other `4xx` (including a `409` without conflicts) remove it. A handler result without `succeeded`/`skipped`/`failed` counts as one success. |
| `upload_abort` | `transfer` | `{aborted: true}`. |

Every operation first checks the target action's channel, API token scope
(`<resource>.<action>`), resolver and ACL, exactly as the executor does, and
only then looks at the transfer. A transfer belongs to its actor, channel,
the SHA-256 of the session id (UI) or bearer token (API), resource, action and
target; any mismatch, unknown or expired id answers `404 Nem található
feltöltés.`. Transfer ids are random; directories are `02770`, files `0660`.
Each `upload_begin` removes at most 20 expired transfers, orphans and stale
resume indexes; there is no cron. Chunks are appended at the exact offset
under an exclusive lock; the data file is the assembled file.

Per-file codes (`details.code`, preflight `code`, finish `failed[].code`):
`too_large`, `type`, `content_mismatch` (detected type differs from the
extension, at finish), `conflict`, `depth`, `name`, `quota`, `incomplete`.
`relative_path` is a `/`-separated folder path; every segment passes the safe
name rule, a final segment equal to the file name is dropped, and a policy
without `folders` refuses a path with `name`.

The direct multipart request (`files[]` parts) keeps working for API callers
up to `maxSizeBytes × maxFiles`; `relative_path` then needs a single file. The
executor enforces the policy on this path for every consumer, before the
handler: more than `maxFiles` parts is `400 quota`; each part is checked for
PHP upload errors (`too_large`, `incomplete`) and the policy's name, type,
size and folder rules; rejected parts are withheld from the handler and
prepended to its result's `failed` list (also to the `details.failed` of a
handler failure); when no part remains the request is `400` with
`details.code` and `details.failed`. The audit detail records only the count
(`rejected_files`).

## Behavior

- **Window.** One non-modal window owned by the service (it survives route
  changes and is not closed with a view). The upper cell shows the target and
  the rules (types, size, file count, folders) with `Fájlok kiválasztása` and,
  when allowed and supported by the browser (`webkitdirectory`),
  `Mappa kiválasztása`; files can be dropped onto it or pasted with Ctrl+V
  while the window is focused. The queue is a native Grid: preview (an object
  URL for images, revoked on removal; otherwise a type icon), name with the
  relative path, size, localized status, a progress bar
  (`role="progressbar"`) and per-row Cancel, Retry and Remove buttons with
  accessible names. Below it a summary and `Befejezettek törlése` / `Bezárás`.
- **Flow.** Choosing files starts the upload immediately (no second
  confirmation). A preflight runs first; rejected files become failed rows
  with their reason and send no bytes. Three transfers run in parallel, chunk
  by chunk, each chunk retried three times with backoff on network or server
  errors. Cancel aborts the transfer.
- **Conflicts.** A finish that reports a name conflict asks once with the
  shared choice dialog (Overwrite, Rename, Skip, Cancel and
  `Alkalmazás az összes ütközésre`); with the checkbox the decision applies to
  later conflicts of the same batch. No bytes are sent again.
- **Background and indicator.** The window can be closed while files upload.
  The shell's lower bar then shows `Feltöltés: 3/20 · 45 %`; clicking it
  reopens the window. When a batch ends a toast reports the result; failures
  stay listed in the window.
- **Robustness.** `upload_finish` is retried with the chunk backoff on network
  errors and `5xx`; a file waiting for the conflict dialog releases its
  parallel slot; Cancel during begin or a quick Retry never loses or aborts the
  newer run's transfer; a folder larger than the batch limit is cut with a
  toast and an announcement of how many files were left out; a file dropped
  outside the window is refused instead of opening it in the tab; leaving the
  page while uploading asks first (`beforeunload`).
- **Resume.** Unfinished queue entries (transfer id, fingerprint, target) are
  kept in `localStorage`; only a file re-added for the same target resumes
  (otherwise it starts fresh). The owner is the PHP session, so resuming works
  within one session (not after a new login) and the last tab to write wins. After a reload or a dropped connection they appear as
  interrupted rows; adding the same file again (choose, drop or paste)
  continues from the server's received offset. A browser cannot keep the file
  itself across a reload, so re-adding it is required.
- **Accessibility.** Every control is reachable by keyboard with a visible
  focus ring; a polite `aria-live` region announces starts, finishes and
  failures; strings are localized (hu/en/de) and styled for Skyblue, light and
  dark.

## Demo and verification

Feature demo → `Fájlkezelő` → `Feltöltés` (folder of the active panel).
`reader@example.test` has no upload command and every transfer operation is
denied.

- `php8.4 tests/shell/files.php`: preflight codes without side effects; begin,
  chunks (wrong offset, oversize, above chunk size), status, finish with
  metadata and thumbnail task; resume; ownership `404` for another actor,
  session, target or action; ACL and API scope denial for every operation;
  conflict `409` keeping the transfer and the overwrite/rename/skip decisions;
  `content_mismatch`; nested folder creation and the depth limit; abort; TTL
  and orphan sweep; an independent synthetic consumer action; 20 mixed files
  with per-file results and every byte sent once; audit without names.
- `npm run test:browser -- tests/shell/uploader.spec.cjs`: 20 mixed files
  (counted chunk requests, no duplicate offsets), one conflict dialog with
  "apply to all", cancel and retry, folder upload, clipboard paste, closing
  the window (indicator, toast), resume after reload sending only the missing
  chunk, keyboard path and announcements, themes and English, reader denial.
  The spec removes what it creates.

## Limits

- No pause/resume across browsers or devices, upload from URL or duplicate
  detection by hash (plan exclusions).
- Resume after a reload needs the same file to be added again.
- There is no per-owner disk quota for unfinished transfers beyond their TTL.
- Folder upload depends on the browser's `webkitdirectory`; the file button
  remains the fallback. Paste needs files on the clipboard.
- The plan's global `blade.upload.open` is the module export
  `uploads.open`; there is no `window` global.

# Warning and confirmation dialogs

Status: implemented and verified on 2026-10-21
([FB-0048](feedback.md#fb-0048--egységes-figyelmeztető-és-megerősítő-párbeszédablakok));
user acceptance remains open.

Every framework message/confirmation goes through
`packages/frontend/src/MessageDialog.ts`. Severity and interaction mode are
independent, giving six combinations:

| Severity | `acknowledge`: one OK button | `confirm`: Confirm + Cancel |
| --- | --- | --- |
| `neutral`: blue circle “i” | Information | Confirm continuation |
| `warning`: amber triangle | Warning | Risky continuation |
| `danger`: red octagon “×” | Error | Irreversible/destructive action |

The severity glyphs use [Bootstrap Icons](icons.md): `bi-info-circle`,
`bi-exclamation-triangle` and `bi-x-octagon`. Shape and title carry meaning
as well as color. The icon has `role="img"`
with severity as `aria-label`; default titles also follow severity.

<a id="api-frontend"></a>

## Frontend API

```ts
import { showDialog, acknowledge, requestConfirmation } from "./MessageDialog";

await acknowledge({ severity: "danger", message: "A mentés nem sikerült." }); // Promise<true>
const ok = await requestConfirmation({ severity: "danger", title: "Törlés",
  message: "A rekord véglegesen törlődik.", confirmLabel: "Törlés",
  cancelLabel: "Mégse" }); // Promise<boolean>
```

`DialogOptions`: required plain-text `message`; optional `title`, `severity`
(default neutral), `mode`, `okLabel`, `confirmLabel`, `cancelLabel`,
`initialFocus` (`confirm`/`cancel`; danger always focuses Cancel).
Labels/titles are localized hu/en/de: OK, Confirm, Cancel, Information, Warning,
Error, Dangerous action. Styling uses `admin.css` `.blade-dialog*` with
DHTMLX `--dhx-*` theme variables across Blade/Blade Night/light/dark; dark warning amber
is lighter.

`requestChoice({message, title?, severity?, cancelLabel?, choices})` is the
multiple-choice mode: one button per `{value,label}` choice plus Cancel. It
resolves the chosen value, or `null` for Cancel/Escape, and opens on Cancel.
The first choice uses the primary style, the others secondary. The
[file manager](files.md) uses it for name conflicts (Overwrite, Rename, Skip,
Cancel) ([FB-0058](feedback.md#fb-0058)).

`requestChoiceAll({…, applyToAll})` is the same dialog with a checkbox
labelled `applyToAll` between the message and the buttons. It resolves
`{value, all}` (or `null` for Cancel/Escape); the checkbox joins the focus
cycle, Space toggles it, focus still starts on Cancel. The
[uploader](uploader.md) uses it so one decision can apply to every later
name conflict of a batch ([FB-0063](feedback.md#fb-0063)).

There is no DHTMLX-shaped `alert({header,text,buttons})`/`confirm()` wrapper:
every caller uses `acknowledge`, `requestConfirmation`, `showDialog` or the
choice dialogs with `DialogOptions` (project code: `app.ui.dialog`). Content is
always plain text. DHTMLX `message()` remains a toast, outside this dialog API.

<a id="progress"></a>

## Progress dialog

`app.ui.progress(options)` blocks the page for one running operation that
the user must not leave or repeat, such as a publish or a restore
([FB-0250](feedback.md#fb-0250)). It replaces a project window that hides
its own close button, Suite `progressShow()` and a hand-made
`beforeunload` guard.

```ts
const progress = app.ui.progress({ title: t("Közzététel"), message: t("Az oldal másolása…"),
  steps: [{ id: "copy", label: t("Másolás") }, { id: "publish", label: t("Közzététel") }] });
try {
  await app.server.call("pages", "copy", { id, signal: progress.signal });
  progress.step("publish"); progress.message(t("Közzététel…"));
  await app.server.call("pages", "publish", { id, signal: progress.signal });
} finally { progress.close(); }
```

- **Window.** A modal framework window (420 px wide, fitted to its content,
  not resizable) with `closable: false`: no close button, Escape and the
  backdrop do nothing, and the page behind it is inert as behind every
  [modal window](toolkit.md#modal-windows). Only `close()` and the caller's
  `signal` close it; the handle's own `signal` aborts when it closes. Pass it
  to the calls it waits for. Closing returns the focus to the opener.
- **Content.** The message is a polite `role="status"`; `message(text)`
  replaces it. A native `<progress>` named after the title is indeterminate
  until `percent(0–100)`, and `percent(null)` makes it indeterminate again.
  With `steps` a [`Steps`](toolkit.md#steps) list labelled with the title
  follows, its first step current; `step(id)` makes a step current (the
  earlier ones done), `state(id, "failed")` marks one stopped.
- **Leaving.** While it is open a `beforeunload` handler makes the browser
  ask before the tab is closed or reloaded, as the uploader does while it
  sends files. Closing releases it.
- **Errors.** A blank `title` or `message`, invalid `steps` (as `Steps`),
  `percent` outside 0–100 or `null` as the start value, and a `signal` that
  is not an `AbortSignal` throw `TypeError` before anything opens.
  `percent()` outside 0–100 throws `TypeError`; `step`/`state` without steps
  or with an undeclared id throw `Error`.
- **Not for.** A short call needs no dialog: a region shows its own
  [busy mark](toolkit.md#busy-filled-region). A background job the user may
  leave belongs in a non-modal window or region with `Steps` and a
  [live watch](toolkit.md#record-watch). There is no cancel button; an
  operation that can be cancelled is a command the page offers itself.

<a id="szerver-által-deklarált-megerősítés"></a>

## Server-declared confirmation

PHP `Action` / JSON action `confirm` requests confirmation before individual
or bulk execution. If an action has input fields, the confirmation follows the
form's Execute button; a command with no inputs runs directly and shows its
confirmation at that point:

```json
{ "resource": "demo_tasks", "name": "purge", "label": "Ürítés", "handler": "tasks.purge",
  "confirm": { "message": "{count} sor végleg törlődik.", "severity": "danger",
               "title": "Törlés", "confirm_label": "Törlés", "cancel_label": "Mégse" } }
```

Keys: required plain-text `message` (`{count}` is affected row count), optional
`title`, `severity`, `confirm_label`, `cancel_label`. Unknown keys/severities
throw. Metadata contains translated text. Confirmation is client UX only;
server ACL/executor checks every call. API calls do not ask for confirmation.

Toolbar success, one-time reveals (`reveal`: `label`, `value`, `note`) and
bulk results are shown as non-blocking toasts. Partial bulk failures
include the failed row messages in that toast.

<a id="billentyűzet-és-fókusz"></a>

## Keyboard and focus

- Acknowledgment opens on OK. Confirmation opens on Confirm except danger or explicit `initialFocus: "cancel"`, which focus Cancel.
- Enter activates only the focused button; background/body cannot confirm.
- The key press that opens a dialog cannot also activate its button: a keyboard click counts only after a new key press inside the dialog. Without this, Enter that commits an inline grid edit and raises a validation message closed the message instantly ([FB-0052](feedback.md#fb-0052)). Pointer clicks are unaffected.
- Escape closes acknowledgment with true; confirmation always cancels with false, regardless of focused button. Native Suite confirm did not meet this rule. Choice mode resolves `null`.
- Tab/Shift+Tab cycle buttons and, for long content, the scrollable body. Background is inert.
- Backdrop clicks do not close. Closing restores opener focus if it still exists.
- Accessibility: `role="alertdialog"`, `aria-modal`, title `aria-labelledby`, message `aria-describedby`.
- The dialog and modal windows count their hold on each inert element (`holdInert`), so closing them in any order leaves the page inert while any of them is open; live regions and toasts in `body` stay announced. A modal window shown while a dialog is open comes above it: the dialog is inert and ignores keys until the window closes.
- Above a modal window ([modal windows](toolkit.md#modal-windows)) the dialog takes the containment over and gives the focus back into the window on close. Modal Suite windows follow the same pattern themselves: the page before the topmost one is inert, Tab cycles inside it, closing returns the focus to its opener, and Escape leaves an open popup inside it the first press ([FB-0201](feedback.md#fb-0201)).

<a id="elrendezés-és-mobil"></a>

## Layout and mobile

Separate toned header/icon, naturally wrapping `pre-wrap` body including long
words, and action bar with background/divider. Maximum width 480 px. Every side
retains at least 16 px or safe-area inset; viewport caps height, body scrolls
internally and buttons remain visible. Actions start at the left, with Cancel
at the right after them in reading and keyboard order. The footer keeps a
12 px gap between buttons and wrapped rows, including on mobile. Buttons wrap
onto another row when necessary, with Cancel still at the right; long button
labels wrap within the available width.

<a id="döntés-miért-nem-a-natív-dhtmlx-alertconfirm"></a>

## Why native DHTMLX alert/confirm cannot meet the contract

The framework-first extension was assessed: Suite 9 alert/confirm cannot
parameterize severity/icons, alert has `role="alert"` without focus trap,
Escape may confirm when Cancel is not focused, and safe-area/viewport-height
constraints are missing. A framework-level component therefore replaces them,
using DHTMLX button classes/theme variables and Suite-compatible localization.
Applications must use it rather than create their own modal.

<a id="korlátok--nyitott"></a>

## Limits and open work

- No queue: simultaneous dialogs stack; only the top handles keys.
- Browser tests cover six combinations, keyboard and 320×480. Real iOS safe-area devices and screen readers were not tested.
- Text only; no HTML content.
- The progress dialog has no cancel button and no queue of operations.
- `Action.confirm` is UI-only and never blocks API calls.
- The referenced screenshot attachment was unavailable during the original task; the “too window-like” appearance was assessed from DHTMLX defaults and source.

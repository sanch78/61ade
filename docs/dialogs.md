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

Shape and title carry meaning as well as color. The icon has `role="img"`
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
DHTMLX `--dhx-*` theme variables across Skyblue/light/dark; dark warning amber
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

<a id="elrendezés-és-mobil"></a>

## Layout and mobile

Separate toned header/icon, naturally wrapping `pre-wrap` body including long
words, and action bar with background/divider. Maximum width 480 px. Every side
retains at least 16 px or safe-area inset; viewport caps height, body scrolls
internally and buttons remain visible. Below 480 px, buttons stack full width,
primary above Cancel.

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
- `Action.confirm` is UI-only and never blocks API calls.
- The referenced screenshot attachment was unavailable during the original task; the “too window-like” appearance was assessed from DHTMLX defaults and source.

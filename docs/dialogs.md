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
import { showDialog, acknowledge, requestConfirmation, alert, confirm } from "./MessageDialog";

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

Compatible callers `alert({header,text,buttons,htmlEnable})` and
`confirm({…,buttons:[apply,reject]})` are exported with optional severity.
Migrate imports from `@dhtmlx/suite` to `./MessageDialog` and set appropriate
severity. `htmlEnable` is ignored: content is always text. DHTMLX `message()`
remains a toast, outside this dialog API.

<a id="szerver-által-deklarált-megerősítés"></a>

## Server-declared confirmation

PHP `Action` / JSON action `confirm` requests confirmation before individual
or bulk execution, after the form's Execute button:

```json
{ "resource": "demo_tasks", "name": "purge", "label": "Ürítés", "handler": "tasks.purge",
  "confirm": { "message": "{count} sor végleg törlődik.", "severity": "danger",
               "title": "Törlés", "confirm_label": "Törlés", "cancel_label": "Mégse" } }
```

Keys: required plain-text `message` (`{count}` is affected row count), optional
`title`, `severity`, `confirm_label`, `cancel_label`. Unknown keys/severities
throw. Metadata contains translated text. Confirmation is client UX only;
server ACL/executor checks every call. API calls do not ask for confirmation.

An action result's `reveal` may contain `severity`
(`neutral`/`warning`/`danger`); partial bulk failures use warning.

<a id="billentyűzet-és-fókusz"></a>

## Keyboard and focus

- Acknowledgment opens on OK. Confirmation opens on Confirm except danger or explicit `initialFocus: "cancel"`, which focus Cancel.
- Enter activates only the focused button; background/body cannot confirm.
- Escape closes acknowledgment with true; confirmation always cancels with false, regardless of focused button. Native Suite confirm did not meet this rule.
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

# Event calendar

Status: first vertical slice implemented on 2026-10-24
([FB-0061](feedback.md#fb-0061)); user acceptance is not claimed.

An event calendar view over the native **DHTMLX Scheduler Standard (GPL)**
component: day, week and month views, drag-and-drop create/move/resize and the
Scheduler's recurring model ("this event / this and following / all events").
Events are edited in the framework's own Suite Form window, like every other
61ade form; the vendor lightbox is not used. The framework owns storage, recurrence
expansion, actions, authorization, validation, transactions, audit and the
DHTMLX integration; a consumer declares the space, the extra event fields, the
offered views and an optional day action.

## Building blocks

| Part | Location | Responsibility |
| --- | --- | --- |
| `Blade\Calendar\CalendarDefinition` | `packages/php/src/Calendar/CalendarDefinition.php` | Consumer configuration, explicit installer of `blade_calendar_events`, registration, browser metadata and `occurrences()` for server-side consumers. |
| `Blade\Calendar\CalendarActions` | `packages/php/src/Calendar/CalendarActions.php` | Registered actions, window queries, exception rules, optimistic revisions and the expansion of series into concrete occurrences. |
| `Blade\Calendar\Recurrence` | `packages/php/src/Calendar/Recurrence.php` | Server-side expansion of the RRULE subset the Scheduler editor writes. |
| `Registry::calendar`, `Workspace` | `packages/php/src/Feature` | The `calendar` view kind; metadata lists only offered actions and readable extra fields. |
| `CalendarView` | `packages/frontend/src/components/calendar/CalendarView.ts`, `calendar.css` | Internal view: Suite Layout and Toolbar around the Scheduler, event form (Suite Form + Window), custom data-processor router onto the registered actions, theme and locale bridge, day-action window. |
| `Calendar` component | `packages/frontend/src/components/calendar/Calendar.ts` | Public `app.components.Calendar` ([toolkit](toolkit.md#calendar-and-diagrameditor)); the built-in `calendar` view kind mounts it too. |

The vendor package is `dhtmlx-scheduler` 7.2.15 (GPL-2.0, npm), pinned in
`packages/frontend/package.json` and bundled by the existing build. The
Standard edition exposes **one** Scheduler instance (several instances are a
paid feature), so the view borrows the shared instance: on destroy it detaches
its own event handlers and data processor and clears the data. The shell shows
one view at a time, and constructing a second `Calendar` component while one
exists throws, so one calendar is on screen at a time.

## Event model

`blade_calendar_events` follows the Scheduler recurring format:

| Column | Meaning |
| --- | --- |
| `space` | Storage namespace and ACL object; several calendars may share the table. |
| `text`, `start_at`, `end_at` | Caption and wall-clock `YYYY-MM-DD HH:MM:SS` bounds. For a series, `end_at` is the end of the series (`9999-02-01` when open-ended). |
| `rrule`, `duration` | Series rule and occurrence length in seconds; empty/0 for single events. |
| `recurring_event_id`, `original_start` | An exception row: it replaces the occurrence of that series that started at `original_start`. |
| `deleted` | `1` marks a deleted occurrence (an exception without a visible event). |
| `data` | JSON of the consumer's extra fields. |
| `revision` | Optimistic revision; stale updates and deletes return `409`. |

Times are wall-clock values without a zone, as the Scheduler shows them; the
server never converts them. An occurrence that crosses a DST change keeps its
nominal duration.

Recurrence (`Recurrence`) supports exactly what the editor writes: `FREQ`
`DAILY`/`WEEKLY`/`MONTHLY`/`YEARLY`, `INTERVAL` (1–999), `BYDAY` with plain
weekdays, `BYMONTHDAY`, `BYSETPOS` (1–5 or −1, with one `BYDAY`), `BYMONTH`
(yearly), `COUNT` (≤ 5000), `UNTIL` and `WKST=MO`. Any other rule is rejected
with `400` instead of being expanded differently. A month without the given day
(such as the 31st) has no occurrence, as in RFC 5545.

Changing a series' rule, start or duration deletes its exceptions (the
Scheduler does the same); deleting a series deletes its exceptions.

## Integration

```php
use Blade\Calendar\CalendarDefinition;
use Blade\Feature\{Field, Lookup};

$calendar = new CalendarDefinition('signage_schedule', 'Műsorterv', 'signage',
    fields: [new Field('asset_id', 'Tartalom', 'select', required: true,
        options: (new Lookup('signage_assets', 'signage_assets', 'id', 'title'))->options(...))],
    firstHour: 6, lastHour: 24,
    dayAction: ['resource' => 'signage_playlist', 'action' => 'day', 'label' => 'Napi műsor (API)'],
    group: 'Digitális kijelző');
CalendarDefinition::install($pdo);   // setup step; HTTP requests never run DDL
$calendar->register($workspace);     // application definition
```

| Setting | Meaning |
| --- | --- |
| `resource` | ACL resource and view id; actions are `<resource>.<action>`. |
| `space` | Storage namespace and ACL object of every action. |
| `fields` | Extra event fields: `text`, `textarea`, `select`, `number` or `checkbox`, not secret and not a reserved event name. They appear in the event form with the same inputs as workspace forms and are validated by the same field rules (client and server). |
| `views`, `defaultView` | Subset of `day`, `week`, `month` and the opening view. |
| `firstHour`, `lastHour` | Visible hours of the day/week views. |
| `maxRangeDays` | Longest window `events`/`occurrences` accept (default 62, month view needs 42). |
| `dayAction` | Optional registered action called with `date` (`YYYY-MM-DD`) for the selected day; the toolbar button shows its JSON answer read-only beside the equivalent API request. Shown only if the actor is offered that action. |
| `group`, `icon`, `desktopOnly` | Menu group, icon (default `dxi dxi-calendar-today`) and the generic desktop-only option. |

### In project code

A project module mounts the same calendar in its own Layout cell or window
through the [toolkit](toolkit.md#calendar-and-diagrameditor); the view must be
offered to the actor, and destroying the component (or closing its window)
releases the Scheduler for the next one:

```ts
const win = app.ui.window({ title: "Műsorterv", width: 1100, height: 720, fit: false });
new app.components.Calendar({ view: "signage_schedule", signal: win.signal }).mount(win);
```

## Actions and authorization

| Action | Purpose |
| --- | --- |
| `events` | Raw series, single events and exceptions overlapping `from`–`to`, plus exceptions whose original slot lies there (≤ 2000 rows, otherwise `413`). The Scheduler expands series itself. |
| `occurrences` | Server-side expansion: every concrete occurrence overlapping `from`–`to` in start order (`id`, `series_id`, `text`, `start`, `end`, `recurring`, `data`; ≤ 5000). Suitable for API consumers. |
| `create` | New event, series or exception. |
| `update` | Change with the expected `revision`. |
| `delete` | Delete with the expected `revision`; a series takes its exceptions along. |

`from`/`to` accept `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`. Every action runs
through the common executor (authentication, CSRF on the browser channel,
channel/token scope, ACL, field validation, transaction and audit). The ACL
object of every action is the space, so rules grant whole calendars; item-level
rules are not supported. Field-level rules on `events`/`occurrences` remove
denied extra fields from responses and metadata. Writes need `create`/`update`/
`delete`; the view stays read-only (no drag, no event form) without them. UI and
API are separate channels; an API key's scope only narrows (`resource.occurrences`).

`CalendarDefinition::occurrences($db, $from, $to)` returns the same expansion to
server-side consumer handlers without applying ACL; the consumer action that
calls it carries its own rules.

## Event form

Double click, drag-create and `Új esemény` open the event form: a modal Suite
Window with a Suite Form built from the shared field inputs (`Megnevezés`, the
consumer fields), `Kezdete`/`Vége` datepickers with time, and the Cancel + Save
row. `Törlés` appears for existing events when `delete` is offered and asks the
shared danger confirmation.

- Recurrence (series and new events only): `Ismétlődés` none/daily/weekly/
  monthly/yearly, interval, weekdays (weekly), day of month or "n-th weekday"
  of the start (monthly/yearly), and the end: never, after a number of times
  (`COUNT` ≤ 5000) or on a last day (inclusive, `UNTIL=YYYYMMDDT235959`). The
  form writes exactly the server's RRULE subset. A stored rule it cannot show is
  offered as `Egyedi szabály` and kept unchanged.
- An occurrence edited alone ("Csak ez az esemény") becomes an exception and
  shows no recurrence fields.
- Editing or dragging an occurrence asks the scope with the shared choice
  dialog (`scheduler.ext.recurring.confirm`).
- Validation is inline (`FormValidation`): required fields, field rules, end
  after start, interval 1–999, count 1–5000, at least one weekday, last day not
  before the start. Server errors after the save still use the error dialog.
- On save the form gives the Scheduler the same values as its lightbox would
  (including the series end), so the recurring plugin creates exceptions and
  splits "this and following" as before; the data processor then calls the
  registered actions.
- The Scheduler's own lightbox and its select bar (inline edit, vendor delete
  confirmation) are not used. Dates are chosen in the datepicker popup: the
  Suite 9.3 datepicker repaints a typed value away when its popup closes, so
  the fields are not editable by typing.

## Behavior

- The calendar loads the visible window (`events`) on every navigation and
  ignores repeated view-change reports for the same window. A reload that
  would arrive during a save is deferred until the save answers, so it never
  drops the event being saved.
- The router reads the live Scheduler event. Occurrence copies inherit series
  fields through their prototype, which the data processor's serialized copy
  drops; reading the live object keeps consumer fields such as a select value.
- Successful writes show a toast; failures show the shared error dialog and
  reload the window.
- Locale: the Scheduler's `hu`, `en` or `de` catalogue (others fall back to
  `en`), with framework captions overriding vendor labels that are missing or
  mistranslated. The Suite datepicker popup takes month and day names from the
  browser (`Intl`) for the shell language.
- Theme: Skyblue and light use the `terrace` skin with the Suite primary
  colour; the dark theme switches the Scheduler to its `dark` skin.

## Demo and verification

The feature demo configures it as a digital signage (DMS) scheduler in the
`Digitális kijelző` group ([demos](demos.md#teljes-feature-demó-)):
`Médiatár` (image, video and audio assets referencing file-manager media),
`Alapértelmezett tartalom` (default asset per weekday or per date) and
`Műsorterv` (this calendar, with the asset as the extra field). The consumer
action `signage_playlist.day` answers what plays on a date: the day's
occurrences and a gap-free 00:00–24:00 `timeline` in which the latest-starting
active programme wins and free time falls back to the date default, then the
weekday default (`source`: `schedule`, `default` or `none`). Its code is in
`examples/demo-app/signage.php` and `modules/signage.json`.

API example (an API key of the demo account with scope `signage_playlist.day`):

```sh
curl -s https://61ade.sanch.hu/?blade=1 \
  -H 'Authorization: Bearer <API key>' -H 'Content-Type: application/json' \
  -d '{"resource":"signage_playlist","action":"day","values":{"date":"2026-10-23"}}'
```

```json
{"ok":true,"data":{"date":"2026-10-23","weekday":5,"weekday_name":"Péntek",
 "default":{"id":"1","title":"Arculati háttérkép","kind":"image","duration":15,"file":{"id":"235","name":"minta-fraktal.jpg","mime_type":"image/jpeg"},"source":"weekday"},
 "scheduled":[{"event_id":"1#202610230800","series_id":"1","title":"Reggeli promó","start":"2026-10-23 08:00","end":"2026-10-23 10:00","recurring":true,"asset":{"…":"…"}}],
 "timeline":[{"start":"00:00","end":"08:00","source":"default","title":"Arculati háttérkép","asset":{"…":"…"}},
             {"start":"08:00","end":"10:00","source":"schedule","event_id":"1#202610230800","title":"Reggeli promó","asset":{"…":"…"}}]}}
```

- `php8.4 tests/shell/calendar.php`: RRULE subset and rejected rules,
  definition checks, metadata and hidden space, read-only and field-denied
  actors, validation, window limit, deleted/moved exceptions in the expansion,
  API scope, revisions/409, pattern change and series delete, audit.
- `npm run test:browser -- tests/shell/calendar.spec.cjs`: week view with the
  seeded series, create in the shared event form (no vendor lightbox),
  single-occurrence edit through the choice dialog (exception keeps the asset,
  no recurrence fields), period validation and a weekly series rule with a
  count, month view, day-action window, Friday playlist timeline, window limit,
  read-only reader and dark skin. Its `afterEach` deletes the events the run
  created, also after a failure.
- `npm run test:browser -- tests/shell/toolkit-components.spec.cjs` and `node
  tests/shell/toolkit-components.mjs`: the public component in a project
  Layout cell and in a window, the one-calendar rule, theme and language,
  release on destroy and the built-in view afterwards.

## Limits

- One calendar instance per page (Standard edition; a second `Calendar`
  component throws); no timeline/units/resource views (PRO). The component has
  no events of its own.
- No per-event permissions, owners or attendees; the space is the ACL object.
- No time zones: wall-clock values only.
- No live updates from other users; the window reloads on navigation.
- The `events` window is capped at 2000 rows and `occurrences` at 5000 items.
- The event form is the shared Window sized to the viewport; there is no
  separate card presentation of events.
- Recurrence editing covers the server's RRULE subset only; time-of-day
  patterns other than the start's time are not supported.

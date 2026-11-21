# Server-side user preferences: proposal

**Status: proposed, not implemented** ([FB-0259](feedback.md#fb-0259)). No code,
table or public contract in this document exists yet. Implementation starts
only after the owner approves it and answers the
[open decisions](#open-decisions).

## Goal

Settings that a signed-in user makes today stay in one browser. The owner
decided on 2026-11-03, and confirmed on 2026-11-21, that they follow the
account as one JSON document per user: theme, skin, list columns, sorting,
panel sizes, filters, `app.preferences` and `SettingsForm` values saved under
a key. This replaces the earlier limit "no per-user server-side preference"
and the "never a server write" clause of
[FB-0151](feedback.md#fb-0151--a-settings-form-without-a-record-action) once
it is implemented. The form values themselves still have no record action.

## What exists today

All entries are in `localStorage`. The `blade-ui:1:` key is
`JSON.stringify([pathname, user, resource])`.

| Item | Key or resource | Proposal |
| --- | --- | --- |
| Theme, skin | `blade-theme`, `blade-skin` | Account, with a local mirror for first paint |
| List mode, sort, visible columns, filters | `<view>` | Account |
| Column widths, list and page panels | `<view>`, `<view>@tree`, `<id>`, `<id>:narrow` | Account, per [device class](#device-classes) |
| Tabs, accordion sections | component key | Account |
| `app.preferences` | `scope:<name>` | Account |
| `SettingsForm` | `settings:<key>` | Account |
| Tree expansion and selection | `<id>` | Account, capped ([decision 2](#open-decisions)) |
| Window geometry | `window:<id>` | Local ([decision 2](#open-decisions)) |
| Guide seen | `blade-guide:2:` | Account ([decision 2](#open-decisions)) |
| Upload resume | `blade-uploads:<user>` | **Stays local**: bound to the PHP session and the file in this browser |
| Tree reload handoff, reload, sign-out and splash guards | `sessionStorage` | **Stays local**: per-tab guards |

Three facts constrain the design:

- Every read is synchronous, from component constructors up to the public
  `PreferenceStore.get`, and the theme is applied before the layout exists.
- The JSON action path accepts at most 64 KiB per request, while the tree
  entry can reach about 20 KB and the `SettingsForm` and `app.preferences`
  stores have no size limit.
- The public guest shares one actor id, so a guest must not get a server
  document.

## Storage

One new framework table, created by the explicit `Schema::install` like the
other `blade_*` tables and never as a side effect of a request:

```sql
CREATE TABLE IF NOT EXISTS blade_user_preferences (
    actor_id   VARCHAR(100) PRIMARY KEY,
    document   TEXT NOT NULL,
    revision   INTEGER NOT NULL DEFAULT 1,
    updated_at VARCHAR(32) NOT NULL
);
```

The document is versioned, and entries are separated by application path, so
that several applications on one database do not mix:

```json
{
    "v": 1,
    "theme": "blade",
    "apps": {
        "/admin/": {
            "demo_contacts": { "sort": { "field": "name", "direction": "asc" } },
            "scope:demo.player": { "volume": 40 }
        }
    }
}
```

Filter values and tree state of a tenant-scoped view are stored under the
tenant id inside the entry. They are record ids and search values that mean
nothing in another tenant, and today they silently carry across a switch.

## API compatibility

The public API does not change.

- The bootstrap of a signed-in, non-guest page carries the document. Every
  existing synchronous read is served from that in-memory copy, so no read
  waits for the network and the theme does not flash.
- `UiPreferences` and `app.preferences` keep their signatures. A write updates
  memory and a local mirror at once. A framework-owned `__preferences` action
  sends the changed entries after one second of quiet, and on `pagehide`.
- A write is a patch (`set` and `remove` by entry), merged by the server in a
  transaction. Two tabs or devices that change different entries both keep
  their change; for one entry the last write wins.
- A failed save stays in the mirror and is retried; it never shows an error,
  matching the current "storage failures are swallowed" contract.
- `__preferences` takes the actor from the session only, has no id parameter,
  requires CSRF, is `ui` channel only, and writes no audit row per change.
- Without a workspace, on the sign-in page and for a guest, the store remains
  browser-local as today.

The types and guides that promise browser-local behavior change with the
implementation (`api/types.ts` `PreferenceStore`, `docs/shell.md`,
`docs/usage.md`, `docs/workspaces.md`, `docs/toolkit.md`).

## Migration from browser values

1. On the first signed-in load in a browser, the client reads this user's
   `blade-ui:1:`, theme, skin and guide entries through the existing readers.
2. It sends them as a **fill-only** patch: the server stores an entry only if
   the document does not have it, so a second device never overwrites the
   first device's settings.
3. A local marker per user stops the step from repeating. The old entries stay
   for one release as a fallback, then a later release removes them.

Values that fail today's validators are dropped. No server migration script
is needed, because nothing exists on the server before the first load.

<a id="device-classes"></a>

## Device classes

A pixel size from a desktop is wrong on a phone. Column widths and panel sizes
are stored under `wide` or `narrow`, split at the existing 768 px boundary that
`PageLayout` already uses. Everything else is shared between devices.

## Limits

| Limit | Value | On excess |
| --- | --- | --- |
| Patch | 60 KiB | The client splits it |
| One entry | 32 KiB | Stays local only, with a developer warning |
| Whole document | 256 KiB | The least recently changed entries are dropped |
| Entries | 1000 | As above |
| Saves | one per second per tab | Coalesced |

Preferences stay presentation data: no secrets, permission data or business
state. Filter values may contain personal search terms, so the document falls
under the data's backup and erasure handling, and a user needs a "reset my
settings" action in the framework's profile menu.

## Rollout

1. Table, `__preferences` action, bootstrap field, PHP tests.
2. `UiPreferences` and `app.preferences` over the in-memory document, with
   `tests/shell/ui-preferences.mjs` and `preferences.spec.cjs` extended.
3. Browser migration, theme mirror and reset action.
4. Guides and a migration row. A consumer has nothing to change unless its
   specs read `blade-ui:` keys directly.

<a id="open-decisions"></a>

## Open decisions

1. **Device classes.** Recommended: column widths and panel sizes are stored
   separately for `wide` and `narrow`.
2. **Items not named in the owner's list.** Recommended: list mode, tabs,
   accordion sections and guide marks follow the account; tree state follows
   it up to the entry limit; window geometry stays local, because it is
   meaningful for one screen only.
3. **Opt-out.** Recommended: none. Every application with a workspace uses
   the account store, so there is one behavior to test.

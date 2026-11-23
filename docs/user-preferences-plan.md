# Server-side user preferences

**Status: implemented** ([FB-0259](feedback.md#fb-0259)). This is the record of
the design the owner approved on 2026-11-23. The file keeps its name so existing
links stay valid.

## Goal

The settings of a signed-in user follow the account as one JSON document per
user. This replaces the earlier limit "no per-user server-side preference" and
the "never a server write" clause of
[FB-0151](feedback.md#fb-0151--a-settings-form-without-a-record-action). The
form values themselves still have no record action.

## What is stored where

| Item | Entry | Where |
| --- | --- | --- |
| Theme, skin | `@theme`, `@skin` | Account, for every application path, with the `blade-theme` and `blade-skin` mirror for the first paint and the sign-in page |
| List mode, sort, visible columns | `<view>` | Account |
| Column widths, panel sizes, collapsed panels | `<view>\|wide`, `<view>\|narrow` | Account, per [device class](#device-classes) |
| Filter values, tree expansion and selection | `<key>\|t:<tenant>` with an active tenant, else `<key>` | Account, per [tenant](#tenants) |
| Tabs, accordion sections | component key | Account |
| `app.preferences` | `scope:<name>` | Account |
| `SettingsForm` | `settings:<key>` | Account |
| Guide seen | `guide:<view>` | Account |
| Window geometry | `blade-ui:1:[path, user, "window:<id>"]` | **Browser**: meaningful for one screen; the server refuses a `window:` key |
| Upload resume | `blade-uploads:<user>` | **Browser**: bound to the PHP session and the file in this browser |
| Tree reload handoff, reload, sign-out and splash guards | `sessionStorage` | **Browser**: per-tab guards |

There is no opt-out: every application with a workspace uses the account store.
Without a workspace, on the sign-in page, for a public guest (who shares one
actor id) and on a database that has not run `Schema::install`, the store is
browser-local as before.

## Contract and its tradeoffs

These are presentation preferences, so the design stays simple:

- **For one entry the last write wins**, across tabs and devices. An older tab
  that saves after a newer change on another device replaces it.
- **A change that never reached the server is lost when the page closes.** There
  is no replay on a later page. A new page takes the server document as the truth.

## Storage

One framework table, created by the explicit `Schema::install` and never by a
request:

```sql
CREATE TABLE IF NOT EXISTS blade_user_preferences (
    actor_id   VARCHAR(100) PRIMARY KEY,
    document   TEXT NOT NULL,
    revision   INTEGER NOT NULL DEFAULT 1,
    generation INTEGER NOT NULL DEFAULT 0,
    updated_at VARCHAR(32) NOT NULL
);
```

On MySQL `document` is `MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
because `TEXT` holds only 64 KiB. `actor_id` is `VARBINARY(400)`: a `_bin`
collation still ignores trailing spaces, so it would join `alice` and `alice `
in one row.

The document is one flat map, least recently changed first. A written entry moves
to the end, and a removal deletes it. Account-wide keys stand alone; the others
are `<application path><TAB><key>`:

```json
{
    "v": 1,
    "entries": {
        "@theme": "blade",
        "/admin/\tscope:demo.player": { "volume": 40 },
        "/admin/\tdemo_contacts": { "sort": { "field": "name", "direction": "asc" } }
    }
}
```

The stored text is **ASCII JSON**: non-ASCII characters stay `\uXXXX` escapes, so
the document survives a `charset=utf8` connection. The application path is the
part of the request URI before `?`, for both the bootstrap and a save, so a client
never names it. A document this release cannot read (another version, a malformed
map) is neither served nor overwritten: the page stays browser-local, a save
answers 503, and the reset control stays available, because only the user's own
reset may replace it. A damaged key inside a readable document is skipped.

## Runtime

- The bootstrap of a signed-in, non-guest page carries `preferences`: `entries`
  of the account, this path and the **active tenant only**, and the row's
  `generation`. Every existing synchronous read is served from that memory copy;
  the public API does not change.
- A write updates memory at once. `__preferences` sends the changed entries after
  one second of quiet, **one save at a time**. A change during a save goes in the
  next one, and an entry is clean only while it still holds the sent text.
- When the page is hidden, a `keepalive` request sends the in-flight and queued
  entries with their newest values.
- A patch is `{generation, set?, remove?, fill?}` or `{reset: true}`. The server
  merges it in a transaction, so two tabs or devices that change different entries
  both keep their change.
- A failed save is retried **only while the page is open**, with a backoff of up
  to 30 s, at most 8 times per page and not while the tab is hidden, so an abandoned
  tab does not keep its session alive. It shows no error.
- The browser's `blade-ui:1:` entries are a **read fallback only** (no table,
  guest, before migration, the sign-in page's theme), never a queue.
- A patch the server refuses is split until the entry refused alone is dropped
  with a console warning; the other entries are saved. After a 401 or 403 the
  page stops saving.
- `__preferences` takes the actor from the session only: no id parameter, CSRF
  required, `ui` channel only, no API key, no guest, no audit row per change.
- The theme is applied from the bootstrap before the layout exists, then
  mirrored for the sign-in page.

### Reset generation

Each row has one integer `generation`. Reset raises it, empties the document and
keeps the row (or inserts one). The bootstrap carries it, and every patch, `fill`
included, sends the page's value. On a mismatch the server applies nothing and
answers 409; that page drops its unsaved entries and saves nothing more for its
lifetime. Migration is skipped when the bootstrap generation is above 0, so a
device that never migrated cannot refill the account after a reset.

<a id="tenants"></a>

### Tenants

Filter values and tree state are record ids and search values that mean nothing
in another tenant. While a tenant is active they are kept per tenant id. A
browser does not know which resources a project scoped, so this holds for every
view of a page with an active tenant, including a global view. The bootstrap
carries only the active tenant's entries. Old browser filter values and tree ids
carry no tenant, so in an application with tenancy they are never read or
migrated, whether or not a tenant is active.

<a id="device-classes"></a>

### Device classes

A pixel size from a desktop is wrong on a phone. Column widths, panel sizes and
the collapsed state of panels are stored under `wide` or `narrow`, split at the
768 px breakpoint (`Viewport.ts`). Everything else is shared between devices.
Only a part that changed is written. A view open across the breakpoint reloads
the current class's sizes before it changes one, so one class's sizes never move
into the other.

## Migration from browser values

1. On the first signed-in load in a browser, the client reads this user's
   `blade-ui:1:` and guide entries of this path, and the theme and skin if this
   user owns them. `blade-theme-owner:<name>` records the owner when a theme is
   stored. A value from before that record has no known owner, so it is not
   uploaded; it keeps showing in this browser until the user chooses a theme.
2. It sends what the document lacks as a **fill-only** patch: the server keeps
   what it already has, so a second device never overwrites the first.
3. The `blade-prefs-migrated:1:[path, user]` marker stops the repeat. It is set
   only when every entry is saved or refused alone. Until then a missing entry
   reads from the browser. The old entries stay for now.
4. With a bootstrap generation above 0 the account has been reset, so nothing is
   uploaded or read from the old entries.

The existing readers still validate every value when it is used. No server
migration script is needed.

## Limits

The server enforces these on every patch. Entry and document sizes are measured on
the stored ASCII JSON, so a non-ASCII character counts as its `\uXXXX` escape. The
client sends the same ASCII text, so the patch size is measured on those bytes too.

| Limit | Value | On excess |
| --- | --- | --- |
| Patch | 60 KiB | The client splits it; the server answers 413 |
| One entry | 32 KiB | Kept for this page with a developer warning, not saved; the server answers 413 |
| Whole document | 256 KiB | The least recently changed entries are dropped |
| Entries | 1000 | As above |
| Saves | one at a time, after a second of quiet | Coalesced |
| Save attempts | 8 per page after a failure | Stops until the next change or page |

Preferences stay presentation data: no secrets, permission data or business
state. Filter values may contain personal search terms, so the document falls
under the data's backup and erasure handling.

## Reset

**Beállításaim visszaállítása** (Reset my settings) is in the theme selector.
An application without one, such as one with a single skin, shows it under a
`Beállítások` control. It waits for a save in flight, empties the user's whole
document for every application path and raises the
[generation](#reset-generation), so a tab or device still open cannot bring old
values back. It removes this browser's copies of the user's settings, including
window geometry, then reloads. It asks first, because it cannot be undone and
reaches every device. Upload resume stays.

## Testing

The demo accounts are shared, so `tools/playwright-test.cjs` keeps a spec's
settings in its browser context unless the spec sets `accountPreferences`
(`test.use` or `browser.newContext`). The checks are `php8.4
tests/shell/preferences.php` (with `BLADE_TEST_MYSQL_SOCKET` naming a private
MySQL server it also checks that server), `node tests/shell/ui-preferences.mjs` and the shell
`preferences.spec.cjs`.

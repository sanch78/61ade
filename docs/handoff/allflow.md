# allflow handoff: 61ade toolkit migration

## Összefoglaló

- Az allflow utoljára a 61ade `131263a` commitját adta ki (0.6-os kiadás);
  azóta a fejlesztői URL már a toolkit-verziót futtatja.
- Kötelező kódmódosítás (2026-10-30, M24 és M30): a kimenő levelek
  `#feature=` linkjei helyett `#view=` kell (az alias megszűnt), és a
  `register()` utáni `Registry::view()` hívások helyett `Registry::updateView()`
  (egy ismételt nézetazonosító definíciókor hibát dob); a specek nem ütköznek.
- Teendő a következő kiadás előtt: frissítési füstteszt, a saját specek
  futtatása, majd `deploy-site`.
- A következő kiadással megy ki az allflow saját, még ki nem adott 61de → 61ade
  átnevezése is (új futási könyvtár, ezért újra be kell jelentkezni).

## Scope and boundaries

This note is input for an allflow session; the allflow session owns every
change it makes. 61ade is read-only for it: report framework gaps to the 61ade
owner, do not patch `/space/share/libs/61ade`. The full list of changes and the
ordered steps are in the [migration guide](../toolkit.md#migration); this note
names only what applies to allflow. Facts below were read on 2026-10-30 from
`/space/share/dev/allflow.hu` (HEAD `2f8c1eb`, clean tree); recheck them before
acting.

## Last released 61ade commit

`131263a` (2026-10-27): the last record of
`/space/apps/allflow.hu/.deploy-history.jsonl` (allflow release 0.6 at its own
commit `14cf272`, 2026-10-27 22:38 UTC) lists it for both `packages/php` and
`packages/frontend/dist`. allflow has three own commits since that release
(`14e40c3`, `faec134`, `2f8c1eb`).

## What applies

| Item | allflow spot | Needed |
| --- | --- | --- |
| M1, M24 `#feature=` removed | Outgoing mail links `ALLFLOW_BASE_URL.'/admin/#feature=inquiries'` (`admin/includes/inquiries.php` line 14) and `…#feature=profile_requests` (`admin/includes/profile.php` line 34) | Required. The alias is removed: `#feature=` opens the empty workspace. New mails use `#view=inquiries` and `#view=profile_requests` (both views keep the default id); already delivered mails open the empty workspace ([routing](../toolkit.md#routing)). |
| M4, M30 view ids | `admin/includes/admin_features.php`: `register()` at lines 45, 80 and 103 followed by `Registry::view()` for the same resource at lines 61, 81 and 121 | Required. A second declaration of the same id throws `Duplicate view id` at definition time ([rule](../toolkit.md#view-id-rule)). Replace each such `Registry::view(…)` with `Registry::updateView(View::list(…))` (same arguments), or give it its own `id`. |
| M9 cache keys | `admin/includes/admin_application.php` line 20 sets `version` from `.deploy-version` in production, `ALLFLOW_ENV` otherwise; no spec asserts a `?v=` key | No spec change. Release note to verify: `/admin/` reaches `admin/www` through the deploy `links` entry `public/admin` → `admin/www` (`.deploy.json` lines 84–87). The shell resolves the front controller's directory with `realpath` and keys files only inside the real document root ([cache keys](../toolkit.md#cache-keys)); if the document root is `public`, `admin/www` lies outside it, so in a release `admin.js`/`admin.css` fall back to `?v=<release version>` (a new key per release, not per file). In development they take the key of the 61ade checkout's build through the link. Check the page source on the development URL and after the release; if per-file keys are wanted there, raise it with 61ade (`documentRoot` is not meant for this layout). |
| M10 toolbar commands | `dev/tests/admin/admin.js` lines 23–27 `command()` clicks toolbar buttons by name or opens `Műveletek`; `dev/tests/admin/profile.spec.js` lines 36–37 selects a row, then runs `Kérelem lezárása` | No change; record actions act on the toolbar's cursor record as before. `Adatok` is disabled until a row is selected. |
| M12 name | Own unreleased commits `faec134` and `2f8c1eb`: `.deploy.json` targets `admin/lib/61ade` and `admin/www/assets/61ade` (lines 36, 44), `web_writable` `tmp:prod/61ade` (line 75), `runtime: af_tmp_dir('61ade')` (`admin_application.php` line 24) | Informational. The release still holds `admin/lib/61de` and `admin/www/assets/61de`; the next release replaces them, and the new runtime directory starts without sessions, so administrators sign in again. |
| Specs and API channel | `dev/tests/admin/admin.js`: `#blade-config` `csrf` (line 31), `?blade=1` posts, `list` `data.items` (line 39), `__form` (line 42), menu items by role and name (lines 9–20) | No change ([unchanged contracts](../toolkit.md#migration)). |

Not applicable: M2 (no menu ids), M3 (only `csrf` is read from the bootstrap),
M5 (no sub-views), M6 (no injected stylesheet), M7 (no `SandboxFrame`), M8 (no
own admin JavaScript), M11 (no WebSocket service; lists poll), M13 (the
`flag_disabled` checkbox is set through the API, `customers.spec.js` line 56),
M14 (each spec uses a fresh browser context), M15 (no new capability in use).
No schema step: allflow's own MySQL copy of the `Access\Schema` tables needs
no migration, since those tables change only with tenancy.

Outside this migration and unchanged by it: the specs load
`@playwright/test` through `NODE_PATH` (`dev/tools/playwright.sh` line 6,
`dev/tests/admin/admin.js` line 1) instead of the loader file of the
[consumer browser test contract](../development.md#consumer-browser-tests).

## Verification in the allflow session

1. Steps 1–2 of the [migration steps](../toolkit.md#steps-for-a-consumer-session)
   on the development URL: sign in, open `Ügyfelek`, `Megkeresések` and
   `Adatváltozási kérelmek`, one form, one synthetic save reverted; console and
   PHP error log.
2. Open `/admin/#view=inquiries` and `/admin/#view=profile_requests` signed
   in (the links of new mails): each opens its page.
3. `dev/tools/playwright.sh` with the `dev/tests/admin` specs (the write cases
   only with the project's own `ALLFLOW_TEST_WRITES=1` opt-in).
4. `deploy-site` only after these pass; then check the release's page source
   for the asset keys (M9) and that the new `.deploy-history.jsonl` record
   names the 61ade commit.

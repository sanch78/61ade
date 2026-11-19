# StoryBloX handoff: 61ade toolkit migration

## Összefoglaló

- A StoryBloX utoljára a 61ade `131263a` commitját adta ki; azóta a fejlesztői
  URL már a toolkit-verziót futtatja. Kötelező (2026-10-30, M28): a setup
  futtassa a `0003-tenant-member-active.php` migrációt a `Tenancy::install()`
  előtt; a kód egyébként kötelező módosítást nem igényel.
- Teendő a következő kiadás előtt: frissítési füstteszt és a saját specek
  futtatása; egyik spec sem ütközik a változásokkal.
- Ajánlott: a `public/admin/index.php` CSS-befecskendezése helyett a
  `stylesheets`, a logóhoz a `logo`, a bejelentkező oldalhoz a
  `signInStylesheets` beállítás (FB-0087).
- Az assetnéző (D-019–D-021) most már a StoryBloX-ban megépíthető a nyilvános
  API-val; mintája a feature demo D1 (médianéző) és D2 (jelenet sandboxban).

## Scope and boundaries

This note is input for a StoryBloX session; the StoryBloX session owns every
change it makes. 61ade is read-only for it: report framework gaps to the 61ade
owner, do not patch `/space/share/libs/61ade`. The full list of changes and the
ordered steps are in the [migration guide](../toolkit.md#migration); this note
names only what applies to StoryBloX. Facts below were read on 2026-10-30 from
`/space/share/dev/storyblox.sanch.hu` (HEAD `cf2d0f3`); recheck them, since the
working tree has uncommitted changes (`application.php`, docs,
`tests/admin.spec.cjs`) and untracked files.

## Last released 61ade commit

`131263a` (2026-10-27): the last record of
`/space/apps/storyblox.sanch.hu/.deploy-history.jsonl` (StoryBloX release 0.3
at its own commit `7bdb679`, 2026-10-27 22:38 UTC) lists it for both
`packages/php` and `packages/frontend/dist`. StoryBloX has 18 own commits since
that release, and its current `application.php` already uses capabilities that
arrived after `131263a`: tenancy (line 14, `tenantColumn` line 35), the skin
(line 56), the static image column (lines 24, 31) and `activate: 'page'` (line
29). Its next release therefore needs the current 61ade, which `deploy-site`
copies anyway (M15).

## What applies

| Item | StoryBloX spot | Needed |
| --- | --- | --- |
| M6 `stylesheets` | `public/admin/index.php` lines 4–6: an output buffer inserts `<link rel="stylesheet" href="../assets/storyblox/app.css?v=3">` before `</head>` of every HTML page, including the sign-in page | Recommended. Declare `stylesheets: ['../assets/storyblox/app.css']` in the `ApplicationDefinition` (`application.php` lines 63–67) and drop the buffer, keeping only the `HttpEntrypoint::run` line. The path passes the [path rules](../toolkit.md#module-loading). The sign-in look and the logo now have their own options (M23, [FB-0087](../feedback.md#fb-0087)): `logo: new Logo('../assets/storyblox/logo.svg', '../assets/storyblox/logo-dark.svg', placement: 'both')` replaces the `.blade-navigation-row::after` rules, `signInStylesheets` carries any sign-in CSS ([sign-in customization](../shell.md#sign-in-branding)). |
| M9 cache keys | `tests/admin.spec.cjs` line 8 requests `../assets/61ade/admin.js` and `admin.css` without a key | No change. |
| M9 own keys | `application.php` line 56 `Skin(…, '../assets/storyblox/editor.css?v=1')`; `public/admin/index.php` line 6 `app.css?v=3` | Optional: drop the hand-kept `?v=1` so the skin gets the file key ([cache keys](../toolkit.md#cache-keys)); `app.css?v=3` goes away with M6. `logo.svg?v=1` inside `app.css` (lines 10, 12) is a CSS URL, not linked by the shell, and stays hand-kept. |
| M1 `#view=` | `activate: 'page'` on `asset_types` (`application.php` line 29) with `subview(…, embed: false)` (line 41) | No change. The drill-down now shows `#view=assets` in the address; D-017's behaviour (filter preset, Back, `Alaphelyzet`) is unchanged. No spec asserts the hash. |
| M4, M5 | `register()` calls (lines 29, 39) and `subview()` (line 41) | No change; the returned `View` may be ignored. |
| M7 sandbox files | `.deploy.json` `shared_assets` entry for `dist` with `files: ["admin.js", "admin.css"]` | Add `"sandbox.html"` when the scene stage (below) uses `SandboxFrame` ([packaging](../toolkit.md#packaging)); never `admin.d.ts`. |
| M10 toolbar commands | D-017 keeps the details on the toolbar `Adatok` command | No change; there is no record context menu, and no spec opens one. |
| M12 name | `lib/61ade`, `public/assets/61ade`, `common.php` line 7, `.deploy.json` targets | Already on `61ade`. |
| CSS hooks | `app.css` `.blade-navigation-row::after`; `editor.css` `[data-blade-skin="storyblox-studio"]` with `--dhx-*` | The skin selector and variables are contract. Only the [documented hooks](../shell.md#sign-in-css-hooks) are supported; replace the `.blade-navigation-row::after` logo with the application `logo` (M23). |
| M28 tenancy `active` | Tenancy (`application.php` line 14): an existing `blade_tenant_members` table still has the removed `active` column | Required with the update: run `packages/php/migrations/0003-tenant-member-active.php` once before `Tenancy::install()` in setup ([tenancy](../tenancy.md#enabling-tenancy)); `Tenancy::install()` refuses the old table, and the application fails closed until 0003 has run: every membership read throws a `LogicException` naming the migration and grants nothing. |

Not applicable: M2 (no menu ids in specs), M3 (no bootstrap reads), M8 (no own
admin JavaScript), M11 (no WebSocket service; lists poll), M13 (no checkbox
labels in specs), M14 (the specs use fresh contexts and do not sign in).

## Location bar (D-083)

Delivered in 61ade ([FB-0217](../feedback.md#fb-0217), [location bar](../shell.md#location-bar)).
Every page view now shows its menu path below the menu row, with no change
needed. To name the open record, declare `recordTitle` (JSON `record_title`)
on the record views. The episode page then calls `host.setLocation` with the
episode (an `onSelect` back to its overview) and the open scene whenever the
selection changes. A spec that measures the workspace height, or counts the
rendered grid rows at a fixed viewport, has 32 px less room.

## Card button to the child page (D-087)

Delivered in 61ade ([FB-0219](../feedback.md#fb-0219),
[sub-views](../workspaces.md#sub-views)), with no declaration change: the
seasons view already has `activate: 'page'`, so the cards' and tiles'
*Epizódok (n)* button now opens the *Epizódok* page filtered to the season,
like a double-click, never a window. Back returns to *Évadok* at the same
place with the season as the cursor. A spec that clicked that button and
waited for a window finds the page instead.

## Parent records in the location bar (D-087)

`location: 'group'` ([FB-0220](../feedback.md#fb-0220)) is removed. The
general route replaces it ([FB-0224](../feedback.md#fb-0224),
[parent records](../shell.md#location-bar-parent)): a record view declares
its parent record, `parent: ['field' => '<reference field>', 'view' =>
'<record view of the parent resource>']`. The reference field is a
non-secret `select`, `number` or `text` field holding the parent's id; a
`select` whose options are a `Lookup` must be a `Lookup` of that resource.

Read on 2026-11-18 from `stories.php`; recheck them. `story_episodes.season_id`
(line 39) is such a select, over `$seasonOptions`, a `Lookup` of
`story_seasons`. `storyblox.season` (lines 57–58) is a record view of
`story_seasons` with `recordTitle: 'name'`. Both `storyblox.season` (line
58) and `storyblox.episode-workbench` (line 178) still pass
`location: 'group'`.

- **Required with this update:** remove `location: 'group'` from both
  views. 61ade ignores the PHP argument meanwhile and accepts it only until
  then. The argument is going away, so a remaining one fails once it is
  gone.
- **The episode page:** declare
  `parent: ['field' => 'season_id', 'view' => 'storyblox.season']` on
  `storyblox.episode-workbench`. Its bar then reads
  *Történetek › Évadok › ‹season name› › ‹your setLocation segments›*: the
  season is resolved from the episode's row through `story_seasons.get` and
  links to its season page, also after a reload or a direct link. Once the
  season has arrived, the menu marker and the compact siblings follow the
  season page's source; until then, and when the season cannot be read, the
  episode page's own. Drop the
  season segment from the episode page's own `setLocation` call, which now
  replaces only the episode's level. A season the user may not read is left
  out, without a dialog.
- **The season page:** it has no parent record, so without `location` its bar
  is its resource's menu path and the season's name.

A spec that expects *Epizódok* to be missing from an episode's bar, or that
expects a season segment of the page's own, needs updating.

## Empty location bar (D-107)

Delivered in 61ade ([FB-0236](../feedback.md#fb-0236),
[empty own path](../shell.md#location-bar-empty), M94):
`setLocation([], {from: "root"})` now leaves the bar empty instead of
returning to the automatic path. The 32 px line stays, without levels, and
the document title is the application title. No code change: read on
2026-11-19, `catalogue.js` (lines 302–306) already makes that call while no
node is selected, so the Assetek page shows an empty bar there instead of
*Assetek*. A spec that expected the menu entry in that state needs
updating. `asset-location.js` always passes segments and is unaffected.

## Location bar of a top-level entry, and switching it off (D-107)

Decided in 61ade ([FB-0237](../feedback.md#fb-0237), M95), the part of D-107
left open: a page whose automatic path is only its own top-level menu entry
has no bar while the full menu row marks it (collapsed into `Menü`, the bar
still shows the entry). A view can switch its bar off entirely with
`locationBar: false` (JSON `location_bar: false`). No code change; a spec
that expected the one-entry bar on a wide desktop needs updating.

## Location bar Back button and level icons

Owner instruction in 61ade ([FB-0238](../feedback.md#fb-0238), M96): the
location bar's levels are text only unless switched on, so the section icon
of the first level and the `icon` of `setLocation` segments no longer show.
A history Back button with a divider before the levels is available, off
unless switched on. Both are declarations: `ApplicationDefinition(locationBack:
true, locationIcons: true)` for the application, `View(locationBack: …,
locationIcons: …)` for one view's page. No code change is needed; a spec that
expected a level icon needs updating.

## Asset viewer on the public API (D-019 to D-021)

The requests of `dev/docs/61ade/custom-view-request.md` (untracked in the
StoryBloX tree) map onto the toolkit as below. The feature demo implements the
same shapes: D1 `examples/demo-app/frontend/src/assets.ts` (record view,
`CommandBar`, `RecordDetails`, `MediaPlayer`) and D2
`examples/demo-app/frontend/src/playlist.ts` (timeline, `SandboxFrame` scene
delivered by an action), described in [demos](../demos.md#d1-asset-viewer) and
[demos D2](../demos.md#toolkit-d2-playlist). StoryBloX builds the viewer in its
own repository; 61ade adds nothing for it.

| Request | Public API |
| --- | --- |
| 1. Layout page opened for a record | A [record view](../toolkit.md#record-views): `$workspace->registry->addView(new View('storyblox.asset-viewer', 'storyblox.asset-viewer', '…', resource: 'assets', record: 'assets', actions: ['get', '<stream action>']))` after the actions exist, and in the module `app.kinds.register('storyblox.asset-viewer', {create(host, view)})`. The server resolves the row through `assets.get` (object ACL, field ACL, tenant scope, audit) and hands it over as `host.record`; the kind builds an `app.dhx.Layout` and calls `host.attach(layout)` (D1 `viewer()`). |
| 2. Trusted stage, `mount(cell, context)` | The view kind's `create(host, view)` is the mount and returns `{destroy}`; `ViewHost` gives `app`, `signal`, `record`, `attach`, `setTitle`, `close`. Toolbar: `app.components.CommandBar` (`click`, `update(id, changes)`) for play, pause, position and version choice; detail form: `RecordDetails` or `RecordForm`; data: `app.server.call`/`request`/`url`; theme: `app.theme`. See [components](../toolkit.md#components) and the [API reference](../toolkit.md#api-reference). |
| 3. Sandboxed stage | `app.components.SandboxFrame`: `load(code, files)`, `post(type, payload)`, `on('message')`, dotted message types such as `scene.seek` ([sandbox protocol](../toolkit.md#sandbox-protocol)). The time contract (`load`, `duration`, `renderAt(t)`, `play`, `pause`, `seek`) is wrapped around the scene code exactly as D2's `SCENE_HEAD`/`SCENE_TAIL`; D2 fetches the code through its own action (`signage_playlist.scene`). Limits: code 1 MiB, files 32 MiB, `ready` within 10 s. Pass the frame only data the actor may see. Needs M7. |
| 4. Per-record activation | The [activation map](../toolkit.md#activation-map) on `register()` (`application.php` line 39): `activate: ['field' => '<field>', 'map' => ['<value>' => 'view:storyblox.asset-viewer', …]]`. The row is keyed by the field's string value: `asset_type_id` carries the type id; a readable, non-secret computed field carried in list rows (for example the type code) keys by code. Leave out `*` so other assets keep the edit form. Once versions have a `file` or `column.media` field, the map can key by the file's media class as D1 does. |
| 5. Audio player | `app.components.MediaPlayer` with `source: {resource, action, id}` on a StoryBloX GET action (`new Action(…, get: true)` whose handler returns `DownloadStream`, see [usage](../usage.md)); MP3, WAV and M4A play in Chromium ([MediaPlayer](../toolkit.md#mediaplayer)). Remembered volume, rate and position: `app.preferences.scope('storyblox.viewer')`. |

Module setup: `modules: ['../assets/storyblox/<file>.js']` in the
`ApplicationDefinition` (same path rules as M6; the shell keys the file by its
mtime and size). With TypeScript, follow the
[recipe](../toolkit.md#typescript-recipe): `@61ade/admin` maps to
`public/assets/61ade/admin.d.ts` through the existing development link, imports
are types only, Suite comes from `app.dhx`, the module never imports
`admin.js`, and every registered name contains a dot (`storyblox.…`). The
module runs only in the signed-in shell, within 5 s; a failure is reported and
skipped ([module loading](../toolkit.md#module-loading)).

## Record details layout (D-084)

Delivered in 61ade ([FB-0218](../feedback.md#fb-0218), changed by
[FB-0223](../feedback.md#fb-0223);
[sized image in the details](../workspaces.md#details-media-width),
[RecordDetails](../toolkit.md#recorddetails)). Give the media field
`column.detailsWidth` (JSON `details_width`, 160–800) in a section of its own
(any media field alone in a section shows no label row), set
`--blade-record-group-columns: minmax(0, 1fr) auto` on
`.blade-record-details[data-blade-view="<view id>"]` in the project
stylesheet, and mount a plain `RecordDetails`: the synopsis, a long text
outside the sections, follows below the groups and the page scrolls as a
whole. `RecordDetailsOptions.longText` is removed: drop `longText: "card"`
(TypeScript rejects it, the runtime ignores it), and styles on
`.blade-record-texts`/`.blade-record-text*` or
`--blade-record-text-min-height` no longer match anything. For the synopsis
in a region of its own (D-090, D-093), divide the panel with a `PageLayout`
[inner layout](../toolkit.md#pagelayout-inner) and give each region's
`RecordDetails` its [`fields`](../toolkit.md#recorddetails-fields) (the data
and the image in one, the synopsis in another), or put the text into the
page's own element; its reading look stays in the project stylesheet.
The image's height comes from the `width`/`height` your media source
describes, and its sharpness from the size your `thumbnail_get` serves.

## Verification in the StoryBloX session

1. Steps 1–2 of the [migration steps](../toolkit.md#steps-for-a-consumer-session) on
   `https://dev-storyblox.sanch.hu/admin/`: sign in as an administrator and as
   an editor (skin), open `Assettípusok`, double-click a type and check the
   filtered `Assetek` page at `#view=assets`, Back and `Alaphelyzet`; the logo
   in the menu row; console and PHP error log.
2. `tools/playwright.sh` with `tests/admin.spec.cjs` (sign-in page, assets,
   covers, OAuth overlay).
3. After M6: the page source links `app.css?v=<key>` after `admin.css` on
   signed-in pages, and the sign-in page matches the D-014 decision.
4. `deploy-site` only after these pass; check the new
   `.deploy-history.jsonl` record names the 61ade commit.

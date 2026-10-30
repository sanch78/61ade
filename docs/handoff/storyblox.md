# StoryBloX handoff: 61ade toolkit migration

## Összefoglaló

- A StoryBloX utoljára a 61ade `131263a` commitját adta ki; azóta a fejlesztői
  URL már a toolkit-verziót futtatja; a kódja kötelező módosítást nem igényel.
- Teendő a következő kiadás előtt: frissítési füstteszt és a saját specek
  futtatása; egyik spec sem ütközik a változásokkal.
- Ajánlott: a `public/admin/index.php` CSS-befecskendezése helyett a
  `stylesheets` beállítás, de az csak bejelentkezés után tölt be, így a
  bejelentkező oldali logóról (D-014) dönteni kell.
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
| M6 `stylesheets` | `public/admin/index.php` lines 4–6: an output buffer inserts `<link rel="stylesheet" href="../assets/storyblox/app.css?v=3">` before `</head>` of every HTML page, including the sign-in page | Recommended. Declare `stylesheets: ['../assets/storyblox/app.css']` in the `ApplicationDefinition` (`application.php` lines 63–67) and drop the buffer, keeping only the `HttpEntrypoint::run` line. The path passes the [path rules](../toolkit.md#module-loading). **Decision needed first:** `stylesheets` are linked on signed-in pages only, while D-014 (`docs/decisions.md` line 24) shows the logo "also on the sign-in page", and the sign-in page does render `.blade-navigation-row`. Either the owner accepts the logo after sign-in only, or the buffer stays until 61ade offers a sign-in stylesheet (a framework request to 61ade). |
| M9 cache keys | `tests/admin.spec.cjs` line 8 requests `../assets/61ade/admin.js` and `admin.css` without a key | No change. |
| M9 own keys | `application.php` line 56 `Skin(…, '../assets/storyblox/editor.css?v=1')`; `public/admin/index.php` line 6 `app.css?v=3` | Optional: drop the hand-kept `?v=1` so the skin gets the file key ([cache keys](../toolkit.md#cache-keys)); `app.css?v=3` goes away with M6. `logo.svg?v=1` inside `app.css` (lines 10, 12) is a CSS URL, not linked by the shell, and stays hand-kept. |
| M1 `#view=` | `activate: 'page'` on `asset_types` (`application.php` line 29) with `subview(…, embed: false)` (line 41) | No change. The drill-down now shows `#view=assets` in the address; D-017's behaviour (filter preset, Back, `Alaphelyzet`) is unchanged. No spec asserts the hash. |
| M4, M5 | `register()` calls (lines 29, 39) and `subview()` (line 41) | No change; the returned `View` may be ignored. |
| M7 sandbox files | `.deploy.json` `shared_assets` entry for `dist` with `files: ["admin.js", "admin.css"]` | Add `"sandbox.html", "sandbox.js"` when the scene stage (below) uses `SandboxFrame` ([packaging](../toolkit.md#packaging)); never `admin.d.ts`. |
| M10 toolbar commands | D-017 keeps the details on the toolbar `Adatok` command | No change; there is no record context menu, and no spec opens one. |
| M12 name | `lib/61ade`, `public/assets/61ade`, `common.php` line 7, `.deploy.json` targets | Already on `61ade`. |
| CSS hooks | `app.css` `.blade-navigation-row::after`; `editor.css` `[data-blade-skin="storyblox-studio"]` with `--dhx-*` | No change. The skin selector and variables are contract; `.blade-navigation-row` is outside the contract but unchanged. |

Not applicable: M2 (no menu ids in specs), M3 (no bootstrap reads), M8 (no own
admin JavaScript), M11 (no WebSocket service; lists poll), M13 (no checkbox
labels in specs), M14 (the specs use fresh contexts and do not sign in).

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

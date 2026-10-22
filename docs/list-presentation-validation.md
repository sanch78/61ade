# List presentation: verification of FB-0019, FB-0020 and FB-0022

Date: 2026-10-17. Historical status: requested framework capabilities implemented
and verified; no user acceptance or consumer release is claimed.
[Usage](workspaces.md#kártyák-rekordadatok-sorszám-és-jelölés).
These are preserved historical results, not checks rerun by translation.

<a id="követelményenkénti-evidencia"></a>

## Evidence by requirement

| Requirement | Implementation and evidence |
| --- | --- |
| Actual cards | Native DataView uses multiple columns by width, one on mobile. list-presentation.spec.cjs and real list-integration.spec.cjs measure adjacent positions. |
| One grid border | Internal layouts type none, no extra grid/content frame. Browser computed inner border is 0; outer results panel remains. |
| Reset/login secondary buttons | Native flat icons/buttons. Filter pair shares a row with ≥8 px gap; confirmation buttons equal width with ≥8 px vertical gap. Real filter/mobile-desktop value preservation/reset in integration; three-theme window geometry in authentication. |
| Icons | Built-in/configured action icons, font classes verified; decorative aria-hidden, accessible names plain text. Real action routes/screenshots checked. |
| Content cannot overdraw toolbar | Actual mouse scrolling, positive Grid scroll and card scroll, then toolbar hit-tests across themes. |
| Full details window | Ordinal double-click opens native Window with fresh ACL get. Description omitted from real JSON-consumer grid appears; secret/object-field-denied values excluded. Integration/PHP presentation checks. |
| Default optional numbering | Continuous full authorized/filtered/sorted rank beyond 600 rows. sorting.php checks directions, NULL/ties, forward/backward, middle live windows, preceding insert, filters/off. UI disabling checked. |
| Marks/bulk | Opt-in survives modes. Real synthetic server changed two marked rows and reloaded checkboxes. PHP checks ACL/API denial/limits/duplicates/secrets/per-row audit/partial success/revision conflicts. |
| Buttons fit including hover | Shared menu/toolbar sizing checked in Skyblue/Default/dark; actual theme-button hover image inspected. |
| No white strip below buttons | Toolbar fills cell; measured navbar padding. Only native 1 px lower panel border permitted. |
| Final view dropdown | Native dropdown after actions/spacer, current mode in label; final-item position/switching/mobile checked. |
| Sort/edit indicators do not overlap | Title has own width, hover icon reserved 24 px; one active arrow. CSS geometry/aria-sort and targeted header-editable-hover.png/header-editable-sorted.png inspected; full SQL sorting preserved. |

<a id="lefutott-próbák"></a>

## Recorded runs

- list-presentation.spec.cjs: final actual-scroll version 3/3 PASS.
- presentation / list-integration.spec.cjs: final mobile-filter/reset version 2/2 PASS.
- auth: 4/4 PASS; later width/gap change reran affected three-theme case 1/1 PASS.
- browser.spec.cjs: five earlier cases PASS; new hover/menu case 1/1 PASS after respecting native 1 px border.
- mobile-grid.spec.cjs: synthetic scroll PASS; full filter/modal/mode regression 1/1 PASS after removing widget movement.
- workspace.spec.cjs: CRUD/polling 2/2 PASS.
- sorting: 1801 rows, headers/SQL/two-way smart rendering/≤600 loaded, 1/1 PASS.
- PHP list-presentation/sorting/lists/access/grid-edit/contracts, typecheck/build: PASS.
- Consumer synthetic users independently checked themes/details/cards/headers/inline/WebSocket sorting; its own documentation holds results.

<a id="reprodukció-és-környezeti-határ"></a>

## Reproduction and environment boundary

tools/playwright.sh uses installed system Playwright inside run-dev-check.sh,
one worker/shared lock/cgroup. BLADE_PLAYWRIGHT_MODULE must match runner;
BLADE_TMP_DIR is project scratch. No project browser install.
[System runner](development.md#meglévő-közös-playwright-bekötése).

Current supported focused reproduction here:

```sh
npm run test:browser -- --project=shell tests/shell/list-presentation.spec.cjs
```

The original presentation/auth/sorting project commands are retained suite
selectors but need localhost fixtures and must not launch on this host.
See [current limits](development.md#existing-full-smoke-and-coverage-limits).
Artifacts use scratch and synthetic data. Existing consumer business views kept
marks/bulk off; framework JSON/PHP enables it explicitly. Bulk uses per-row
transactions and may partially succeed, never whole-batch atomicity.

<a id="fb-0023-fejlécek-darabszám-és-hitelesítési-ablakok"></a>

## FB-0023: headings, counts and authentication windows

2026-10-17, implementation checkpoint 3796fea with final CSS/test refinements.

- sorting.php PASS: full/filtered ACL counts independent of limit/cursor, outside-middle-window inserts update counts.
- lists/list-presentation/contracts/typecheck/build PASS.
- presentation 2/2 PASS: native title/right total/mobile total+matched/reset/menu icon.
- auth final 4/4 PASS: three-theme geometry, 8 px button gaps, about 24 px bottom space (native border/rounding ±2 px), actual lower-button hit-test, error modal/login flow.
- browser 6/6 PASS, mobile-grid 2/2 PASS.
- Presentation toolbar/scroll and dropdown/header cases PASS. Card/bulk 1/1 PASS after waiting for redraw geometry and sampling mobile cards in one DOM snapshot. Immediate coordinates had read transitional positions; consecutive boundingBox calls targeted replaced nodes during viewport changes. No fixed wait or weakened column requirement.
- Consumer themes/inline/WebSocket 3/3 PASS; external rename changed matched 1→0→1 with unchanged total. Consumer PHP feature/validation contracts PASS.
- Consumer development HTTPS /v2/ login PASS, final-button bottom clickable; served v=8 JS/CSS matched prepared build.

Framework auth styling removes double Window/Form bottom spacing; height reduction
alone would clip buttons. Auto-sizing does not call show above the error modal.
Historically inspected synthetic images: presentation-real-cards.png,
cityscreen-cards-skyblue.png, confirmation-skyblue.png; actual consumer dev:
dev-login-compact.png. Historical artifact root:
`/space/share/tmp/dev.cityscreen.hu/runtime/blade-ui/`. This records earlier
consumer evidence, not a current 61de scratch location or permission to change it.
All recorded Playwright runs used the existing guarded system runner.

<a id="fb-0024--kártyaszerkesztés-és-ablakok-2026-10-17"></a>

## FB-0024 — Card editing and windows, 2026-10-17

| Expectation | Check | Result |
| --- | --- | --- |
| Editable cards | Native text/select, direct checkbox, invalid phone denial then correction/save/reload | PASS |
| Switch after grid save | Switch during 600 ms delayed __edit and repeatedly after save | PASS |
| Double-click without text selection | Ordinal opens details, getSelection().toString() empty | PASS |
| Card sorting | Dropdown SQL request, current order, switch/reload | PASS |
| Double-click layout reset | Real dragging/double-click on both axes, restored 260 px | PASS |
| Content-fit windows | Bottom gap <40 px; at 390×420 height ≤396 px and ≥12 px edges | PASS |

Guarded synthetic Chromium grid-edit 2/2 PASS; layout-resizer/list-presentation/
mobile-grid/workspace 9/9 PASS across themes/live refresh. Grid fixtures use
per-run scratch, unaffected by old data. Typecheck/build and PHP grid-edit/
validation PASS. [Usage](workspaces.md#kártyaszerkesztés-rendezés-és-kompakt-ablakok).

# List presentation: verification of FB-0019, FB-0020 and FB-0022

<a id="követelményenkénti-evidencia"></a>

## Evidence by requirement

<a id="lefutott-próbák"></a>

## Recorded runs

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

<a id="fb-0023-fejlécek-darabszám-és-hitelesítési-ablakok"></a>

## FB-0023: headings, counts and authentication windows

2026-10-17, implementation checkpoint 3796fea with final CSS/test refinements.

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

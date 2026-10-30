# Brand: the 61ade product logo

The product is **61ade**; its logo is the wordmark **blade** (the name the
leetspeak spells, and the `Blade\` namespace) beside a mark of three tiles
([FB-0088](feedback.md#fb-0088)). The wordmark reads both ways: its first
letter is a **6** that reads as a b, its second a **1** that reads as an l,
and only these two carry the teal; `ade` is ink
([FB-0090](feedback.md#fb-0090)). The shell shows it in every application that
declares no logo of its own ([sign-in customization](shell.md#sign-in-logo)).
The geometry is fitted to the owner's source drawing (2026-10-30); keep its
geometry and colours.
The first shell page of each browser window opens with the animated
[trademark screen](#splash) built
from its parts ([FB-0089](feedback.md#fb-0089)).

<a id="files"></a>

## Files and regeneration

The sources live in `packages/frontend/brand/`:

| File | Content |
| --- | --- |
| `blade-logo.svg` | Mark and wordmark for light themes (Skyblue, light, light-based skins). |
| `blade-logo-dark.svg` | The same for the dark theme and dark-based skins. |
| `blade-mark.svg` | The three tiles alone (light palette) in a square, for small sizes and favicons. |
| `logo.mjs` | The generator: `node packages/frontend/brand/logo.mjs` rewrites the three SVGs beside it and the [trademark screen's](#splash) copy `packages/php/resources/brand/splash-logo.svg` (an optional argument names another output directory for all four). |

Change the logo only in `logo.mjs`, run it, then `npm run build`, and commit
the generator, the SVGs (the PHP copy included) and the rebuilt `dist`
together. The build imports the
two full SVGs as text into `admin.js` (the esbuild `.svg` text loader in
`tools/build.mjs`); the shell inlines them. Consumers deploy nothing extra:
no image file, no new `shared_assets` entry, no CSP change (inline SVG with
gradient references needs no `img-src`).

<a id="grid"></a>

## Grid

All values are in viewBox units; the full logo's viewBox is `-19 -46 1370 395`
(aspect ratio 1370 / 395). The source drawing maps at 1 unit = 1.083 px.

| Element | Value |
| --- | --- |
| Bowls (`6`, `a`, `d`, `e`) | outer radius 108, oval counter 48 × 54 (horizontal × vertical), centre at 214 |
| Stems | `a` and `d`: 60, from the counter's right edge to the bowl's, flush (no step where they meet); the `1` 64, the `6` 70 |
| Baseline / x-height | 322 / 106 (top of the bowls) |
| `6` | Stem top cut at slope 0.6 (right corner at −18, rounded 10 / 14), ending in a diagonal inside the bowl; the bowl lies over it, its upper left (175° to −55°) a teal crescent whose inner edge is an arc through the counter's top left |
| `1` | Stem top cut at slope 0.6 (right corner at −2), a 7-unit darker bevel along the cut and the top of its left edge |
| `a` | Stem from the bowl centre (214) to the baseline |
| `d` | Flat-topped stem from 30 |
| `e` | 40-unit bar centred on the bowl, ending on it; terminal cut at 25° through (centre + 51, centre + 37) |
| Glyph positions | `6` at 365, `1` 594, `a` 669, `d` 896, `e` 1123 (13 after a bowl, 11 after a stem) |
| Tile 1 (tall) | corners (−7, 46), (126, −33.8), (126, 275.6), (−7, 336.8): top slope 0.6 like the cuts, bottom 0.46 |
| Tiles 2, 3 | x 144–288, slope 0.46, 129 high, 22 apart (tops at −13 and 138) |
| Tile corners | radius 12, drawn as arcs |
| Mark to wordmark | 77 |

<a id="colours"></a>

## Colours

Sampled from the source drawing (light) and kept from the approved dark
palette. Tiles are diagonal linear gradients (start → end); the stems of the
`6` (to 130) and the `1` (to 192) fade from the teal at the top into the ink;
the `6`'s crescent is a radial gradient from its peak on the bowl's edge at
−110° (radius 120) into the ink. Tile 1 carries a light rim (white, 9 %,
fading out) just outside a circle of radius 186 round (177, 265): the arc of
the drawing.

| Part | Light themes | Dark themes |
| --- | --- | --- |
| Ink (wordmark) | `#011F3C` | `#EEF4F9` |
| Teal (`6`, `1` stems) | `#00BEBA` → ink | `#22D3C5` → ink |
| `6` crescent peak | `#02A1A7` | `#22D3C5` |
| `1` bevel | `#057F86` | `#0E9C93` |
| Tile 1 (tall, left) | `#0880BC` → `#011F3C` | `#1F8FD1` → `#1A5C93` |
| Tile 2 (upper right) | `#2CCBBD` → `#049FA4` | `#3AD6C7` → `#0FAFAD` |
| Tile 3 (lower right) | `#B1C9DD` → `#A2BBCF` | `#C4D6E7` → `#A9C0D6` |

<a id="parts"></a>

## Parts for animation

Every part has a class; an animation (for example a loading screen) targets
these, never the path data. In the shell each copy is an inline `<svg
class="blade-logo__image blade-logo__image--light|dark">` inside the
[`.blade-logo`](shell.md#sign-in-css-hooks) element (with
`blade-logo--brand`), so CSS can reach the parts.

| Class | Intended use |
| --- | --- |
| `.blade-logo__mark` | The three tiles as a group (enter, pulse, spin as one). |
| `.blade-logo__tile`, `.blade-logo__tile--1` … `--3` | One tile each: staggered build-up (1 tall left, a group of its fill and rim; 2 upper right, 3 lower right). |
| `.blade-logo__word` | The wordmark as a group (fade or slide after the mark). |
| `.blade-logo__glyph`, `.blade-logo__glyph--b`, `--l`, `--a`, `--d`, `--e` | One letter each: per-letter reveal (`--b` is the `6`, `--l` the `1`). |

Paint ids (`blade-t1`, `-t2`, `-t3`, `-rim`, `-asc6`, `-asc1`, `-six`, `-bowl`, `-bevel` in the files)
are renamed per inlined copy and variant (`blade-<n>-light-t1`,
`blade-<n>-dark-t1`, …): both variants of a copy are in the page, so neither
copies nor variants ever share a gradient; animate the classes, not the ids. Respect
`prefers-reduced-motion` in any animation.

<a id="splash"></a>

## Trademark screen

Owner decisions of 2026-10-30 ([FB-0089](feedback.md#fb-0089)): the first
shell page (sign-in, e-mail code, password change or the signed-in shell) of
each browser window or tab opens with the 61ade trademark screen, played in
full; later pages of that tab (signing in, reloading, signing out) do not show
it, and a new window or tab plays it once again. An application can neither
turn it off, shorten it nor restyle it, and there is no option for it. It is
not a [project CSS hook](shell.md#sign-in-css-hooks).

- **Once per tab:** the inline head script `Blade\Shell\Splash::GATE`
  (allowed by its hash in the shell's `script-src`, no file to deploy) checks
  `sessionStorage` key `blade-splash` before the first paint: when set it
  marks `<html data-blade-splash="seen">`, which hides the screen
  (`Splash.ts` then only removes it); otherwise it sets the key and the screen
  plays. Without session storage (blocked, private modes that refuse it) it
  plays on every page.

- **Markup:** `packages/php/templates/shell.php` renders `#blade-splash`
  (`aria-hidden`, first in `<body>`) with the generated dark copy
  `splash-logo.svg` (gradient ids `blade-splash-*`, wordmark inside a clip
  right of the mark) and the fixed, untranslated credit
  `made with 61ade framework`. Being server-rendered, it plays while
  `admin.js` loads. Styles in `src/splash.css` (bundled into `admin.css`),
  release in `src/Splash.ts`.
- **Timeline** (seconds from the first paint), on black (`#000`) with the
  dark palette in every theme:

| Time | Part | Movement |
| --- | --- | --- |
| 0.10–0.55 | `.blade-logo__tile--1` | Unfolds from the spine (its right edge). |
| 0.35–1.05, 0.60–1.30 | `--2`, `--3` | Turn like pages from left to right over the spine; the mirrored half shows the darker back. |
| 1.00–1.98 | `.blade-logo__glyph--b` … `--e` | Bounce in from the left, 70 ms apart, out of the clip behind the mark. |
| 1.50–2.10 | credit | Fades in, its letter spacing closing. |
| 1.85–2.75 | glint | A white band in overlay blend sweeps the logo (visible on the tiles and ascenders; black stays black). |
| 2.20–2.75 | spark | Four-pointed spark on the tip of the `1` as the glint passes it. |

- **Release:** `admin.ts` calls `releaseSplash()` once the `AdminShell` is
  built (also when it throws). It waits for every finite animation of the
  screen, then fades the black screen out in 0.55 s (the logo grows to
  104 %) into the application and removes it: about 3.3 s from the first
  paint. A slower load holds the finished logo and repeats the glint every
  3 s from 4.6 s. The screen covers the page and takes the pointer until it
  leaves.
- **Limits:** without JavaScript it is hidden (`<noscript>` style); if
  `admin.js` never releases it, it hides itself after 12 s.
  `prefers-reduced-motion: reduce` keeps the screen and the credit's fade,
  without tiles, letters, glint or spark moving (about 1.5 s).
- **Phones:** the logo is `min(76vw, 560px)` wide with at least 16 px side
  gutter, the credit stays on one line (`clamp(11px, 3.1vw, 15px)`), portrait
  and landscape.
- **Tests:** `tests/shell/splash.spec.cjs` (parts and ids, release not
  before 2.9 s, none after signing in or reloading in the same tab, again in a
  new tab, reduced motion, 360 × 740 and 740 × 360, timeline frames in
  `BLADE_TMP_DIR`). A browser spec meets the screen on the first page of each
  new page (tab): clicks wait for it automatically; a screenshot taken right
  after that load shows it.

<a id="usage"></a>

## Usage rules

- **Who shows it:** the shell, as the default of an application without a
  `logo` (top row and, with the default placement `window`, the sign-in
  windows). `new Logo(placement: …)` without an image keeps it with another
  placement; `Logo::none()` (JSON `"logo": false`) shows no logo.
- **Accessible name:** `blade`, the visible wordmark (WCAG label in name);
  "61ade" would be read as a number and differs from what is seen. Not
  translated.
- **Light vs dark:** the light file on light surfaces, the dark file on dark
  ones; the shell switches by the applied base theme (`data-dhx-theme`).
- **Minimum size:** the full logo from 20 px high (about 76 px wide); below
  that use `blade-mark.svg` (from 16 px).
- **Clear space:** keep at least the stroke width (56 units, about 15 % of the
  height) free around it.
- **Do not** recolour, restretch, re-space or outline it, and do not recolour
  it per application. An application that wants its own brand declares its own
  `Logo` with its own images instead.

Guide links: [shell sign-in customization](shell.md#sign-in-branding),
[repository layout](repository-layout.md#frontend).

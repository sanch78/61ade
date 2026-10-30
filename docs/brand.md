# Brand: the 61ade product logo

The product is **61ade**; its logo is the wordmark **b1ade** (read "blade",
the name the leetspeak spells, and the `Blade\` namespace) beside a mark of
three tiles ([FB-0088](feedback.md#fb-0088)). The letters are heavy rounded
rectangles; the second letter is a **1** that reads as an l, and only the `b`
and the `1` carry the blue gradient; `ade` is ink
([FB-0091](feedback.md#fb-0091)). The shell shows it flat in every
application that declares no logo of its own
([sign-in customization](shell.md#sign-in-logo)). The geometry is fitted to
the owner's b1ade drawing (2026-10-30); keep its geometry and colours. Only
the [trademark screen](#splash), built from the same parts
([FB-0089](feedback.md#fb-0089)), adds the drawing's `.com`, glow and mirror
floor.

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

All values are in viewBox units; the full logo's viewBox is `-19 -46 1795 395`
(aspect ratio 1795 / 395), the trademark screen's `-19 -46 2270 395` (room for
`.com`). The drawing maps at 1 px = 3.35 units. Every glyph is one outline of
corners with their own radius (`outline()` in `logo.mjs`); counters and
openings are part of it.

| Element | Value |
| --- | --- |
| Baseline / x-height / ascenders | 322 / 86 (top of the bowls) / `b` and `1` −16, `d` 10 |
| Counters | rectangles from 166 to 237, corner radius 12 |
| Outer corners | radius 62–86 (bowls), 4–14 at cuts, slits and feet |
| `b` | Stem 365–464, its top rising from 17 to −16; bowl to 668; counter 459–576 |
| `1` | Stem 700–802, top-right radius 56; flag tip at (636, 56); the foot flares from 246 to the tip at (834, 322) |
| `a` | 837–1134, counter 928–1044; slit 1025–1044 from the counter to the baseline (the stem 1044–1134) |
| `d` | 1156–1456, flat-topped stem 1360–1456 flush with the counter 1249–1360 |
| `e` | 1477–1764, counter 1566–1671; bar 182–221 with its tip slanted from (1606, 182) to (1621, 221); the channel under it (221–237) opens to the right edge; terminal cut from (1718, 237) to (1764, 302) |
| Screen only: dot, `com` | dot centre (1819, 297), radius 27; `c` 1866–1965, `o` 1976–2089, `m` 2100–2241, x-height 231, stroke 23 |
| Tile 1 (tall) | corners (−7, 46), (126, −33.8), (126, 275.6), (−7, 336.8): top slope 0.6, bottom 0.46 |
| Tiles 2, 3 | x 144–288, slope 0.46, 129 high, 22 apart (tops at −13 and 138) |
| Tile corners | radius 12, drawn as arcs |
| Mark to wordmark | 77 |

<a id="colours"></a>

## Colours

Sampled from the owner's drawing. The `b` and the `1` share one vertical
gradient (`blade-b1`, from −16 to the baseline); tiles are diagonal linear
gradients (start → end). Tile 1 carries a light rim (white, 9 %, fading out)
just outside a circle of radius 186 round (177, 265). The shell's copies are
flat; the trademark screen uses the dark palette with the drawing's brushed
silver ink (`#FFFFFF` → `#A7ADB7`) and a blue glow on the `b`, the `1` and
the dot.

| Part | Light themes | Dark themes |
| --- | --- | --- |
| Ink (`ade`, screen `com`) | `#181B1E` | `#E6E9EE` |
| Blue (`b`, `1`; screen dot: its end) | `#08DCFC` → `#0176FD` | `#2BE2FF` → `#0F7BFF` |
| Tile 1 (tall, left) | `#0592F5` → `#0A3D91` | `#1EA0FF` → `#0D4BB0` |
| Tile 2 (upper right) | `#16D9FB` → `#0398F2` | `#40E4FF` → `#0AA4F7` |
| Tile 3 (lower right) | `#C9D3DF` → `#A8B5C5` | `#E6EAF0` → `#AEB5C0` |

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
| `.blade-logo__glyph`, `.blade-logo__glyph--b`, `--l`, `--a`, `--d`, `--e` | One letter each: per-letter reveal (`--l` is the `1`). |
| `.blade-logo__dot`, `.blade-logo__domain` | Trademark screen only: the blue dot and `com`. |

Paint ids (`blade-t1`, `-t2`, `-t3`, `-rim`, `-b1` in the files; the screen's
copy adds `-ink`, `-glow`, `-reveal`) are renamed per inlined copy and variant
(`blade-<n>-light-t1`, `blade-<n>-dark-t1`, …): both variants of a copy are in
the page, so neither copies nor variants ever share a gradient; animate the
classes, not the ids. Respect `prefers-reduced-motion` in any animation.

<a id="splash"></a>

## Trademark screen

The shell and [product website](website.md#shared-trademark-screen) render the
same `packages/php/templates/splash.php` partial. The product asset build uses
the same gate, stylesheet and release code; rebuild it with
`npm run website:assets` when these sources or brand SVGs change.

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
  `splash-logo.svg` (ids `blade-splash-*`, wordmark with `.com` inside a clip
  right of the mark, silver ink, glow filter) and the fixed, untranslated credit
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
| 1.20–2.10 | floor light | A blue ellipse under the baseline widens in; the mirror floor (`-webkit-box-reflect`, absent where unsupported) reflects the logo throughout. |
| 1.50–1.95, 1.60–2.10 | `.blade-logo__dot`, `.blade-logo__domain` | The dot pops up, `com` slides in after it. |
| 1.50–2.10 | credit | Fades in, its letter spacing closing. |
| 1.85–2.75 | glint | A white band in overlay blend sweeps the logo (visible on the tiles and ascenders; black stays black). |
| 2.20–2.75 | spark | Four-pointed spark on the tip of the `1`'s flag as the glint passes it. |

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
  without tiles, letters, dot, `com`, floor light, glint or spark moving
  (about 1.5 s).
- **Phones:** the logo is `min(84vw, 760px)` wide with at least 16 px side
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
- **Minimum size:** the full logo from 20 px high (about 91 px wide); below
  that use `blade-mark.svg` (from 16 px). At the 24 px of the top row it is
  about 109 px wide.
- **Clear space:** keep at least the stem width (about 95 units, a quarter of
  the height) free around it.
- **`.com`, glow and mirror floor** belong to the trademark screen only; the
  shell's logo is the flat `b1ade`.
- **Do not** recolour, restretch, re-space or outline it, and do not recolour
  it per application. An application that wants its own brand declares its own
  `Logo` with its own images instead.

Guide links: [shell sign-in customization](shell.md#sign-in-branding),
[repository layout](repository-layout.md#frontend).

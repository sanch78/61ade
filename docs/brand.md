# Brand: the 61ade product logo

The product is **61ade**; its logo is the wordmark **blade** (the name the
leetspeak spells, and the `Blade\` namespace) beside a mark of three tiles
([FB-0088](feedback.md#fb-0088)). The shell shows it in every application that
declares no logo of its own ([sign-in customization](shell.md#sign-in-logo)).
The owner approved the drawing on 2026-10-30; keep its geometry and colours.
A later loading-screen animation will address the parts listed below. No
animation exists yet.

<a id="files"></a>

## Files and regeneration

The sources live in `packages/frontend/brand/`:

| File | Content |
| --- | --- |
| `blade-logo.svg` | Mark and wordmark for light themes (Skyblue, light, light-based skins). |
| `blade-logo-dark.svg` | The same for the dark theme and dark-based skins. |
| `blade-mark.svg` | The three tiles alone (light palette) in a square, for small sizes and favicons. |
| `logo.mjs` | The generator: `node packages/frontend/brand/logo.mjs` rewrites the three SVGs beside it (an optional argument names another output directory). |

Change the logo only in `logo.mjs`, run it, then `npm run build`, and commit
the generator, the SVGs and the rebuilt `dist` together. The build imports the
two full SVGs as text into `admin.js` (the esbuild `.svg` text loader in
`tools/build.mjs`); the shell inlines them. Consumers deploy nothing extra:
no image file, no new `shared_assets` entry, no CSP change (inline SVG with
gradient references needs no `img-src`).

<a id="grid"></a>

## Grid

All values are in viewBox units; the full logo's viewBox is `-12 -12 1405 370`.

| Element | Value |
| --- | --- |
| Stroke (stems, bowls) | 56 |
| Bowl | outer radius 108, counter radius 52 |
| Baseline | 322 (bowl centre 214) |
| x-height | 106 (top of the bowls) |
| Ascender | from 0, the top cut by 26 on the left (a 26 px slant) |
| Glyph spacing | 24 (`b` at 365, `l` 605, `a` 685, `d` 925, `e` 1165) |
| `e` | 32-unit bar centred on the bowl centre; aperture ray at 38° from the bar's lower edge |
| Tiles | slope 0.45; 12-unit corner radius drawn by a same-paint stroke of 24 with round joins; 20-unit gaps between tiles |
| Mark to wordmark | 70 |

<a id="colours"></a>

## Colours

Tiles are vertical or diagonal linear gradients (start → end); the ascenders
of `b`, `l`, `d` fade from the teal accent at the top into the ink.

| Part | Light themes | Dark themes |
| --- | --- | --- |
| Ink (wordmark) | `#0B2340` | `#EEF4F9` |
| Ascender accent | `#10C2BA` → ink | `#22D3C5` → ink |
| Tile 1 (tall, left) | `#1384C6` → `#0B2747` | `#1F8FD1` → `#1A5C93` |
| Tile 2 (upper right) | `#33CFC0` → `#0AA3A3` | `#3AD6C7` → `#0FAFAD` |
| Tile 3 (lower right) | `#B4CBE0` → `#9DB6CF` | `#C4D6E7` → `#A9C0D6` |

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
| `.blade-logo__tile`, `.blade-logo__tile--1` … `--3` | One tile each: staggered build-up (1 tall left, 2 upper right, 3 lower right). |
| `.blade-logo__word` | The wordmark as a group (fade or slide after the mark). |
| `.blade-logo__glyph`, `.blade-logo__glyph--b`, `--l`, `--a`, `--d`, `--e` | One letter each: per-letter reveal. |

Gradient ids (`blade-t1`, `blade-t2`, `blade-t3`, `blade-asc` in the files)
are renamed per inlined copy (`blade-<n>-t1`, …), so several copies on one
page never share a gradient; animate the classes, not the ids. Respect
`prefers-reduced-motion` in any animation.

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

# Imported flag icons

The Hungarian, British and German 16×11 px PNGs come from the existing ADE assets:
`images/iconset/flags/{hu,gb,de}.png`, ADE source revision
`8f8158058a8f395b0fee5788abb4c80457837563`.
The owner's 2026-10-17 request was a byte-identical import, without redrawing.
61de copies live in `packages/frontend/src/flags/`.

| File | SHA-256 |
| --- | --- |
| hu.png | `61a2cecf8326a8da732499312a098f89d050d13546f6204e6204de38c550437e` |
| gb.png | `5d72c5a8bef80fca6f99f476e15ec95ce2d5e5f65c6dab9ee8e56348be0d39fc` |
| de.png | `3323814006fe6739493d27057954941830b59eff37ebaac994310e17c522dd57` |

Native DHTMLX Toolbar `icon` CSS classes use the images. The admin entrypoint
imports `flags.css`; esbuild's `.png: dataurl` loader embeds PNGs in CSS.
Existing asset preparation still supplies `admin.js` and `admin.css`.
Consumers do not depend on ADE paths, an external CDN or flag-emoji support.
The name stays text; the image is decorative. The login Window Layout uses the
same native Toolbar as the main selector, including image-bearing dropdown options.

Configuration `i18n.flags` maps language codes to country codes; current images
are `hu`, `gb`, `de`. Extend in the framework with the appropriate PNG, CSS
class, `languageIcon` and `Settings` support, then build/prepare assets.
Importing the GIF set or other ADE icons is outside this change.

Verification: original/destination SHA-256 equality; the existing protected
i18n browser test checks a computed `data:image/png` background, an actually
decoded 16×11 px image and language-switching paths. See [current host coverage
limits](development.md#existing-full-smoke-and-coverage-limits).

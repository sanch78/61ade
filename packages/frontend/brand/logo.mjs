// Generator of the 61ade product logo ("blade"), docs/brand.md: `node packages/frontend/brand/logo.mjs` rewrites
// blade-logo.svg (light themes), blade-logo-dark.svg (dark themes) and blade-mark.svg (the three tiles alone) beside
// this file. One grid: stroke 56, bowl radius 108 (counter 52), baseline 322, x-height 106, ascender 0 with a 26 px
// cut, glyph spacing 24, tile slope 0.45 and 12 px corner radius (a same-paint 24 px stroke), 20 px tile gaps, 70 px
// between mark and wordmark. Every part has a class for a later animation; keep the geometry and colours.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const R = 108, r = 52, base = 322, top = 0, cut = 26;
const cy = base - R;
const WX = 365;
const f = (v) => v.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
// Outer clockwise, counter anticlockwise (nonzero fill leaves the counter open).
const ring = (cx) => `M${f(cx - R)},${cy}A${R},${R} 0 1 1 ${f(cx + R)},${cy}A${R},${R} 0 1 1 ${f(cx - R)},${cy}Z`
    + `M${f(cx - r)},${cy}A${r},${r} 0 1 0 ${f(cx + r)},${cy}A${r},${r} 0 1 0 ${f(cx - r)},${cy}Z`;
const asc = (x) => `M${x},${top + cut}L${x + 56},${top}V${base}H${x}Z`;
function eGlyph(cx) {
    const ty = cy - 16, by = cy + 16; // bar 32
    const a = 38 * Math.PI / 180; // aperture ray from the bar's lower edge
    const px = cx + r * Math.cos(a), py = by + r * Math.sin(a); // on the counter
    const d = by - cy; // the ray meets the outer circle: |(cx,by) + t(cos,sin) - (cx,cy)| = R
    const t = -d * Math.sin(a) + Math.sqrt((d * Math.sin(a)) ** 2 - (d * d - R * R));
    const qx = cx + t * Math.cos(a), qy = by + t * Math.sin(a);
    const ex = cx + Math.sqrt(R * R - d * d); // outer circle at the bar's lower edge
    // Outline: outer arc from Q round the top to the bar's right end, the bar's lower edge into the counter side, the
    // inner lower arc back to P, then out along the ray to Q; the counter above the bar runs against it.
    return `M${f(qx)},${f(qy)}A${R},${R} 0 1 1 ${f(ex)},${by}H${f(cx - r)}`
        + `A${r},${r} 0 0 0 ${f(px)},${f(py)}Z`
        + `M${f(cx - r)},${ty}A${r},${r} 0 0 1 ${f(cx + r)},${ty}Z`;
}
const palette = (dark) => ({
    ink: dark ? "#EEF4F9" : "#0B2340",
    teal: dark ? "#22D3C5" : "#10C2BA",
    t1: dark ? ["#1F8FD1", "#1A5C93"] : ["#1384C6", "#0B2747"],
    t2: dark ? ["#3AD6C7", "#0FAFAD"] : ["#33CFC0", "#0AA3A3"],
    t3: dark ? ["#C4D6E7", "#A9C0D6"] : ["#B4CBE0", "#9DB6CF"],
});
const coords = { t1: [0, 0, 0, 346], t2: [150, 12, 295, 186], t3: [150, 152, 295, 326] };
const gradient = (id, [x1, y1, x2, y2], [from, to]) => `<linearGradient id="blade-${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`
    + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
const tileDefs = (g) => Object.entries(coords).map(([k, c]) => gradient(k, c, g[k]) + "\n    ").join("");
const tile = (n, pts) => `<polygon class="blade-logo__tile blade-logo__tile--${n}" points="${pts}" fill="url(#blade-t${n})" `
    + `stroke="url(#blade-t${n})" stroke-width="24" stroke-linejoin="round"/>`;
const mark = `<g class="blade-logo__mark">
    ${tile(1, "12,72 118,24 118,286 12,334")}
    ${tile(2, "162,24 283,78 283,174 162,120")}
    ${tile(3, "162,164 283,218 283,314 162,260")}
  </g>`;

function logo(dark) {
    const g = palette(dark), ink = g.ink;
    const defs = tileDefs(g) + gradient("asc", [0, 0, 0, 150], [g.teal, ink]);
    const glyph = (name, inner) => `<g class="blade-logo__glyph blade-logo__glyph--${name}">${inner}</g>`;
    const p = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
    const x = { b: WX, l: WX + 240, a: WX + 320, d: WX + 560, e: WX + 800 };
    const word = [
        glyph("b", p(ring(x.b + R), ink) + p(asc(x.b), "url(#blade-asc)")),
        glyph("l", p(asc(x.l), "url(#blade-asc)")),
        glyph("a", p(ring(x.a + R), ink) + p(`M${x.a + 2 * R - 56},${base - 2 * R}h56V${base}h-56Z`, ink)),
        glyph("d", p(ring(x.d + R), ink) + p(asc(x.d + 2 * R - 56), "url(#blade-asc)")),
        glyph("e", `<path d="${eGlyph(x.e + R)}" fill="${ink}" fill-rule="evenodd"/>`),
    ].join("\n    ");
    const variant = dark ? "dark" : "light";
    return `<svg xmlns="http://www.w3.org/2000/svg" class="blade-logo blade-logo--${variant}" viewBox="-12 -12 1405 370" role="img" aria-label="blade">
  <!-- Geometry and parts: docs/brand.md -->
  <defs>
    ${defs}
  </defs>
  ${mark}
  <g class="blade-logo__word">
    ${word}
  </g>
</svg>
`;
}

// The mark alone (light palette) for small sizes and favicons: the tiles' extent (0..295 × 12..346) centred in a square.
const markOnly = `<svg xmlns="http://www.w3.org/2000/svg" class="blade-logo blade-logo--mark" viewBox="-19.5 12 334 334" role="img" aria-label="blade">
  <!-- Geometry and parts: docs/brand.md -->
  <defs>
    ${tileDefs(palette(false)).trimEnd()}
  </defs>
  ${mark}
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ?? here;
writeFileSync(join(target, "blade-logo.svg"), logo(false));
writeFileSync(join(target, "blade-logo-dark.svg"), logo(true));
writeFileSync(join(target, "blade-mark.svg"), markOnly);

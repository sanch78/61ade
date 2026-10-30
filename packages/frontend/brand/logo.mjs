// Generator of the 61ade product logo (the wordmark "b1ade", read "blade"), docs/brand.md: `node packages/frontend/brand/logo.mjs`
// rewrites blade-logo.svg (light themes), blade-logo-dark.svg (dark themes) and blade-mark.svg (the three tiles alone)
// beside this file, and the loading screen's copy into packages/php/resources/brand/splash-logo.svg. One grid fitted to
// the owner's b1ade drawing: rounded-rectangle bowls (x-height 86 to baseline 322) round rectangular counters
// (166–237), the a open at its foot by a slit, the e by a channel under its bar; the "b" and the "1" carry the blue
// gradient, "ade" is ink. The three tiles keep their geometry (tile slope 0.46, 12 px corner radius). Every part has a
// class for the animation; the screen's copy adds the blue dot and "com".
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = 322, XH = 86, CT = 166, CB = 237, ASC = -16, DT = 10, RC = 12, CUT = 0.6, TILT = 0.46, CORNER = 12;
const f = (v) => String(Math.round(v * 10) / 10);
const pt = (x, y) => `${f(x)},${f(y)}`;
const VIEW = "-19 -46 1795 395", SPLASH_VIEW = "-19 -46 2270 395";

// Closed outline through [x, y, radius] corners, clockwise on screen; each corner is an arc tangent to its two edges,
// a concave corner (the counters, slits and notches) bending the other way.
function outline(points) {
    return points.map(([x, y, r], i) => {
        const [ax, ay] = points[(i + points.length - 1) % points.length], [bx, by] = points[(i + 1) % points.length];
        const la = Math.hypot(ax - x, ay - y), lb = Math.hypot(bx - x, by - y);
        const ux = (ax - x) / la, uy = (ay - y) / la, vx = (bx - x) / lb, vy = (by - y) / lb;
        const t = r ? r / Math.tan(Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2) : 0;
        const sweep = (x - ax) * (by - y) - (y - ay) * (bx - x) > 0 ? 1 : 0;
        return `${i ? "L" : "M"}${pt(x + ux * t, y + uy * t)}` + (r ? `A${r},${r} 0 0 ${sweep} ${pt(x + vx * t, y + vy * t)}` : "");
    }).join("") + "Z";
}
const box = (x0, y0, x1, y1, r) => outline([[x0, y0, r], [x1, y0, r], [x1, y1, r], [x0, y1, r]]);

// The b: a stem with a slightly rising top over a bowl; the 1: a flag on the left of its rounded top, a foot flaring
// right; the a: open at its foot by a slit under the counter's right edge; the d: a flat-topped stem flush with its
// counter; the e: a bar with a slanted tip over a channel to the right edge, the lower terminal cut on a slant.
const GLYPHS = {
    b: outline([[365, 17, 30], [464, ASC, 14], [464, XH, 8], [668, XH, 66], [668, BASE, 66], [365, BASE, 62]])
        + box(459, CT, 576, CB, RC),
    l: outline([[636, 56, 14], [680, ASC, 10], [802, ASC, 56], [802, 246, 150], [834, BASE, 10], [700, BASE, 32], [700, 76, 12]]),
    a: outline([[837, XH, 84], [1134, XH, 66], [1134, BASE, 6], [1044, BASE, 4], [1044, CT, RC], [928, CT, RC], [928, CB, RC],
        [1025, CB, 4], [1025, BASE, 4], [837, BASE, 74]]),
    d: outline([[1156, XH, 66], [1360, XH, 8], [1360, DT, 10], [1456, DT, 22], [1456, BASE, 74], [1156, BASE, 74]])
        + box(1249, CT, 1360, CB, RC),
    e: outline([[1477, XH, 74], [1764, XH, 86], [1764, 221, 6], [1621, 221, 4], [1606, 182, 6], [1671, 182, 6], [1671, CT, 6],
        [1566, CT, RC], [1566, CB, RC], [1718, CB, 4], [1764, 302, 6], [1764, BASE, 14], [1477, BASE, 74]]),
};
// The screen's ".com": a dot in the blue of the 1's foot, then c, o and m on a 23-unit stroke (x-height 231).
const DOT = { cx: 1819, cy: 297, r: 27 };
const DOMAIN = [
    outline([[1866, 231, 22], [1965, 231, 6], [1965, 254, 6], [1889, 254, 4], [1889, 299, 4], [1965, 299, 6], [1965, BASE, 6], [1866, BASE, 22]]),
    box(1976, 231, 2089, BASE, 22) + box(1999, 254, 2066, 299, 4),
    outline([[2100, 231, 2], [2241, 231, 22], [2241, BASE, 3], [2218, BASE, 3], [2218, 254, 4], [2180, 254, 4], [2180, BASE, 3],
        [2157, BASE, 3], [2157, 254, 4], [2123, 254, 4], [2123, BASE, 3], [2100, BASE, 3]]),
].join("");

// Tiles by their outer corners (clockwise from top left), drawn with corners of radius CORNER.
const T1 = [[-7, 46], [126, 46 - 133 * CUT], [126, 275.6], [-7, 275.6 + 133 * TILT]];
const column = (y) => [[144, y], [288, y + 144 * TILT], [288, y + 144 * TILT + 129], [144, y + 129]];
const TILES = [T1, column(-13), column(138)].map((points) => outline(points.map(([x, y]) => [x, y, CORNER])));

const palette = (dark) => ({
    ink: dark ? "#E6E9EE" : "#181B1E",
    blue: dark ? ["#2BE2FF", "#0F7BFF"] : ["#08DCFC", "#0176FD"],
    t1: dark ? ["#1EA0FF", "#0D4BB0"] : ["#0592F5", "#0A3D91"],
    t2: dark ? ["#40E4FF", "#0AA4F7"] : ["#16D9FB", "#0398F2"],
    t3: dark ? ["#E6EAF0", "#AEB5C0"] : ["#C9D3DF", "#A8B5C5"],
});
const stops = (list) => list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`).join("");
const linear = (id, [x1, y1, x2, y2], list) => `<linearGradient id="blade-${id}" gradientUnits="userSpaceOnUse" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}">${stops(list)}</linearGradient>`;
const tileDefs = (g) => [
    linear("t1", [126, -34, 0, 300], [[0, g.t1[0]], [1, g.t1[1]]]),
    // The tall tile's arc: a light rim just outside a circle round its lower right, fading upwards.
    `<radialGradient id="blade-rim" gradientUnits="userSpaceOnUse" cx="177" cy="265" r="300"><stop offset="0.62" stop-color="#fff" stop-opacity="0"/>`
        + `<stop offset="0.623" stop-color="#fff" stop-opacity="0.09"/><stop offset="0.74" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
    linear("t2", [144, -13, 288, 180], [[0, g.t2[0]], [1, g.t2[1]]]),
    linear("t3", [144, 140, 288, 330], [[0, g.t3[0]], [1, g.t3[1]]]),
].join("\n    ");
const tile = (n) => {
    const d = TILES[n - 1], cls = `blade-logo__tile blade-logo__tile--${n}`;
    return n === 1 ? `<g class="${cls}"><path d="${d}" fill="url(#blade-t1)"/><path d="${d}" fill="url(#blade-rim)"/></g>`
        : `<path class="${cls}" d="${d}" fill="url(#blade-t${n})"/>`;
};
const mark = `<g class="blade-logo__mark">
    ${tile(1)}
    ${tile(2)}
    ${tile(3)}
  </g>`;

function logo(dark, splash = false) {
    const g = palette(dark);
    // The screen's ink is the drawing's brushed silver and its blue parts glow; the shell's copies are flat.
    const ink = splash ? "url(#blade-ink)" : g.ink, glow = splash ? ` filter="url(#blade-glow)"` : "";
    const defs = [
        tileDefs(g),
        linear("b1", [0, ASC, 0, BASE], [[0, g.blue[0]], [1, g.blue[1]]]),
        ...(splash ? [
            linear("ink", [0, XH, 0, BASE], [[0, "#FFFFFF"], [1, "#A7ADB7"]]),
            `<filter id="blade-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceGraphic" stdDeviation="16"/>`
                + `<feComponentTransfer><feFuncA type="linear" slope="0.75"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
            `<clipPath id="blade-reveal"><rect x="330" y="-60" width="1960" height="490"/></clipPath>`,
        ] : []),
    ].join("\n    ");
    const glyph = (name, fill, extra = "") => `<g class="blade-logo__glyph blade-logo__glyph--${name}"${extra}><path d="${GLYPHS[name]}" fill="${fill}" fill-rule="evenodd"/></g>`;
    const word = [
        glyph("b", "url(#blade-b1)", glow),
        glyph("l", "url(#blade-b1)", glow),
        glyph("a", ink),
        glyph("d", ink),
        glyph("e", ink),
        ...(splash ? [
            `<circle class="blade-logo__dot" cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${g.blue[1]}"${glow}/>`,
            `<path class="blade-logo__domain" d="${DOMAIN}" fill="${ink}" fill-rule="evenodd"/>`,
        ] : []),
    ].join("\n    ");
    const variant = dark ? "dark" : "light";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="blade-logo blade-logo--${variant}" viewBox="${splash ? SPLASH_VIEW : VIEW}" role="img" aria-label="blade">
  <!-- Geometry and parts: docs/brand.md -->
  <defs>
    ${defs}
  </defs>
  ${mark}
  ${splash ? `<g clip-path="url(#blade-reveal)">` : ""}<g class="blade-logo__word">
    ${word}
  </g>${splash ? "</g>" : ""}
</svg>
`;
    // The loading screen's copy (docs/brand.md#splash): inlined by the PHP shell template, so ids of its own, hidden
    // from assistive technology, and the wordmark clipped right of the mark (the letters enter from behind it).
    return splash ? svg.replace(/<!--[\s\S]*?-->\s*/, "")
        .replace(`class="blade-logo blade-logo--${variant}"`, `class="blade-splash__image"`)
        .replace(' role="img" aria-label="blade"', ' aria-hidden="true" focusable="false"')
        .replace(/id="blade-/g, 'id="blade-splash-').replace(/url\(#blade-/g, "url(#blade-splash-") : svg;
}

// The mark alone (light palette) for small sizes and favicons: the tiles' extent (-7..288 × -33.8..336.8) centred in
// a square.
const markOnly = `<svg xmlns="http://www.w3.org/2000/svg" class="blade-logo blade-logo--mark" viewBox="-45 -34 371 371" role="img" aria-label="blade">
  <!-- Geometry and parts: docs/brand.md -->
  <defs>
    ${tileDefs(palette(false))}
  </defs>
  ${mark}
</svg>
`;

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ?? here;
writeFileSync(join(target, "blade-logo.svg"), logo(false));
writeFileSync(join(target, "blade-logo-dark.svg"), logo(true));
writeFileSync(join(target, "blade-mark.svg"), markOnly);
const php = process.argv[2] ?? join(here, "../../php/resources/brand");
mkdirSync(php, { recursive: true });
writeFileSync(join(php, "splash-logo.svg"), logo(true, true));

// Generator of the 61ade product logo ("blade", read as "61ade"), docs/brand.md: `node packages/frontend/brand/logo.mjs`
// rewrites blade-logo.svg (light themes), blade-logo-dark.svg (dark themes) and blade-mark.svg (the three tiles alone)
// beside this file, and the loading screen's copy into packages/php/resources/brand/splash-logo.svg. One grid fitted to
// the owner's source drawing: baseline 322, bowls of radius 108 round an oval counter (48 × 54), the a's and d's stems
// flush with their bowls (60), the 1's 64 and the 6's 70,
// ascender cuts of slope 0.6 like the tall tile's top, tile slope 0.46 and 12 px corner radius (a same-paint 24 px
// stroke). The "6" and the "1" carry the teal; "ade" is ink. Every part has a class for the animation.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = 322, R = 108, CY = BASE - R, RX = 48, RY = 54, ONE = 64, SIX = 70, CUT = 0.6, TILT = 0.46, CORNER = 12;
const f = (v) => String(Math.round(v * 10) / 10);
const pt = (x, y) => `${f(x)},${f(y)}`;
// Glyph positions (left edges; 13 after a bowl, 11 after a stem) and tops: the 6 is the tallest, the 1 below it, the
// d's flat top lower still.
const X = { b: 365, l: 594, a: 669, d: 896, e: 1123 };
const TOP = { six: -18, one: -2, d: 30 };
const VIEW = "-19 -46 1370 395";

// Bowl: outer circle clockwise, oval counter anticlockwise (nonzero fill leaves it open).
const ring = (cx) => `M${f(cx - R)},${CY}A${R},${R} 0 1 1 ${f(cx + R)},${CY}A${R},${R} 0 1 1 ${f(cx - R)},${CY}Z`
    + `M${f(cx - RX)},${CY}A${RX},${RY} 0 1 0 ${f(cx + RX)},${CY}A${RX},${RY} 0 1 0 ${f(cx - RX)},${CY}Z`;
// Stem with the slanted top of slope CUT, its top corners rounded; `bottom` closes it from the right edge.
function cutStem(x0, x1, top, bottom) {
    const left = top + (x1 - x0) * CUT, n = Math.hypot(1, CUT), ux = 1 / n, uy = -CUT / n, a = 10, b = 14;
    return `M${pt(x0, bottom.start)}V${f(left + a)}Q${pt(x0, left)} ${pt(x0 + a * ux, left + a * uy)}`
        + `L${pt(x1 - b * ux, top - b * uy)}Q${pt(x1, top)} ${pt(x1, top + b)}${bottom.end}Z`;
}
// The 6's stem ends in a diagonal inside the bowl that clears the counter; the bowl is drawn over it.
const sixStem = (cx) => cutStem(X.b, X.b + SIX, TOP.six, { start: CY, end: `V${CY - 44}` });
const oneStem = () => cutStem(X.l, X.l + ONE, TOP.one, { start: BASE, end: `V${BASE}` });
// The a's and d's stems: from the counter's right edge to the bowl's (flush, no step where they meet).
const stem = (cx, top) => `M${pt(cx + RX, top)}H${f(cx + R)}V${BASE}H${f(cx + RX)}Z`;
function eGlyph(cx) {
    const h = 20, ty = CY - h, by = CY + h; // bar 40, centred on the bowl
    const xb = RX * Math.sqrt(1 - (h / RY) ** 2); // counter at the bar's edges
    // Terminal cut at 25° through (cx+51, CY+37): to the counter (P) and the outer circle (Q).
    const ux = Math.cos(25 * Math.PI / 180), uy = Math.sin(25 * Math.PI / 180), ax = 51, ay = 37;
    const qa = (ux / RX) ** 2 + (uy / RY) ** 2, qb = 2 * (ax * ux / RX ** 2 + ay * uy / RY ** 2), qc = (ax / RX) ** 2 + (ay / RY) ** 2 - 1;
    const tp = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa), tq = -(ax * ux + ay * uy) + Math.sqrt((ax * ux + ay * uy) ** 2 - (ax * ax + ay * ay - R * R));
    const px = cx + ax + tp * ux, py = CY + ay + tp * uy, qx = cx + ax + tq * ux, qy = CY + ay + tq * uy;
    // The bar ends on the bowl: the outer arc runs round to the bar's lower edge.
    const ex = cx + Math.sqrt(R * R - h * h);
    return `M${pt(qx, qy)}A${R},${R} 0 1 1 ${pt(ex, by)}H${f(cx - xb)}`
        + `A${RX},${RY} 0 0 0 ${pt(px, py)}Z`
        + `M${pt(cx - xb, ty)}A${RX},${RY} 0 0 1 ${pt(cx + xb, ty)}Z`;
}

const polar = (cx, deg, radius) => [cx + radius * Math.cos(deg * Math.PI / 180), CY + radius * Math.sin(deg * Math.PI / 180)];
// What makes the b a "6": the bowl's upper left, from 175° over the top to -55°, is the stroke turning into the loop,
// its inner edge an arc from -55° through the counter's top left into the counter (a sharp fold against the ink of the
// rest of the bowl); towards 9 o'clock the gradient has reached ink, so the closing line there does not show.
function crescent(cx) {
    const start = polar(cx, 175, R), p1 = polar(cx, -55, R), m = [cx - 35, CY - 40], p3 = [cx - 20, CY + 10];
    const [ax, ay] = p1, [bx, by] = m, [qx, qy] = p3, d = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    const ox = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / d;
    const oy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / d;
    const rho = Math.hypot(ax - ox, ay - oy);
    // The inner arc runs from p1 back to p3 through m: its sweep follows the turn p1 → m → p3.
    const sweep = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax) > 0 ? 1 : 0;
    return `M${pt(...start)}A${R},${R} 0 0 1 ${pt(...p1)}A${f(rho)},${f(rho)} 0 0 ${sweep} ${pt(...p3)}Z`;
}
// The 1's flag: a darker bevel just inside its cut and the top of its left edge.
function bevel() {
    const x0 = X.l + 3.5, left = TOP.one + ONE * CUT + 3.5;
    return `M${pt(x0, left + 50)}V${f(left + 6)}L${pt(X.l + ONE - 16, TOP.one + 16 * CUT + 3.5)}`;
}

// Tiles by their outer corners (clockwise from top left), drawn with corners of radius CORNER.
const T1 = [[-7, 46], [126, 46 - 133 * CUT], [126, 275.6], [-7, 275.6 + 133 * TILT]];
const column = (y) => [[144, y], [288, y + 144 * TILT], [288, y + 144 * TILT + 129], [144, y + 129]];
const TILES = [T1, column(-13), column(138)];
function rounded(points) {
    // Edges moved in by CORNER meet at the arc centres; each edge is drawn back out by CORNER between two arcs.
    const edges = points.map((p, i) => {
        const q = points[(i + 1) % points.length], ex = q[0] - p[0], ey = q[1] - p[1], n = Math.hypot(ex, ey);
        return { x: p[0] - ey / n * CORNER, y: p[1] + ex / n * CORNER, ex, ey, ox: ey / n * CORNER, oy: -ex / n * CORNER };
    });
    const centre = edges.map((l, i) => {
        const m = edges[(i + edges.length - 1) % edges.length];
        const t = ((l.x - m.x) * l.ey - (l.y - m.y) * l.ex) / (m.ex * l.ey - m.ey * l.ex);
        return [m.x + t * m.ex, m.y + t * m.ey];
    });
    return edges.map((l, i) => {
        const a = centre[i], b = centre[(i + 1) % centre.length], next = edges[(i + 1) % edges.length];
        return `${i ? "L" : "M"}${pt(a[0] + l.ox, a[1] + l.oy)}L${pt(b[0] + l.ox, b[1] + l.oy)}`
            + `A${CORNER},${CORNER} 0 0 1 ${pt(b[0] + next.ox, b[1] + next.oy)}`;
    }).join("") + "Z";
}

const palette = (dark) => ({
    ink: dark ? "#EEF4F9" : "#011F3C",
    teal: dark ? "#22D3C5" : "#00BEBA",
    six: dark ? "#22D3C5" : "#02A1A7",
    bevel: dark ? "#0E9C93" : "#057F86",
    t1: dark ? ["#1F8FD1", "#1A5C93"] : ["#0880BC", "#011F3C"],
    t2: dark ? ["#3AD6C7", "#0FAFAD"] : ["#2CCBBD", "#049FA4"],
    t3: dark ? ["#C4D6E7", "#A9C0D6"] : ["#B1C9DD", "#A2BBCF"],
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
    const d = rounded(TILES[n - 1]), cls = `blade-logo__tile blade-logo__tile--${n}`;
    return n === 1 ? `<g class="${cls}"><path d="${d}" fill="url(#blade-t1)"/><path d="${d}" fill="url(#blade-rim)"/></g>`
        : `<path class="${cls}" d="${d}" fill="url(#blade-t${n})"/>`;
};
const mark = `<g class="blade-logo__mark">
    ${tile(1)}
    ${tile(2)}
    ${tile(3)}
  </g>`;

function logo(dark, splash = false) {
    const g = palette(dark), ink = g.ink, cb = X.b + R;
    const peak = polar(cb, -110, R);
    const defs = [
        tileDefs(g),
        linear("asc6", [0, TOP.six, 0, 130], [[0, g.teal], [1, ink]]),
        linear("asc1", [0, TOP.one, 0, 192], [[0, g.teal], [1, ink]]),
        `<radialGradient id="blade-six" gradientUnits="userSpaceOnUse" cx="${f(peak[0])}" cy="${f(peak[1])}" r="120">${stops([[0, g.six], [1, ink]])}</radialGradient>`,
        `<clipPath id="blade-bowl"><path d="${ring(cb)}"/></clipPath>`,
        linear("bevel", [0, 30, 0, 85], [[0, g.bevel, 0.6], [1, g.bevel, 0]]),
        ...(splash ? [`<clipPath id="blade-reveal"><rect x="330" y="-60" width="1150" height="490"/></clipPath>`] : []),
    ].join("\n    ");
    const glyph = (name, inner) => `<g class="blade-logo__glyph blade-logo__glyph--${name}">${inner}</g>`;
    const p = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
    const ca = X.a + R, cd = X.d + R;
    const word = [
        glyph("b", p(sixStem(cb), "url(#blade-asc6)") + p(ring(cb), ink) + `<path d="${crescent(cb)}" fill="url(#blade-six)" clip-path="url(#blade-bowl)"/>`),
        glyph("l", p(oneStem(), "url(#blade-asc1)") + `<path d="${bevel()}" fill="none" stroke="url(#blade-bevel)" stroke-width="7" stroke-linejoin="round"/>`),
        glyph("a", p(ring(ca), ink) + p(stem(ca, CY), ink)),
        glyph("d", p(ring(cd), ink) + p(stem(cd, TOP.d), ink)),
        glyph("e", `<path d="${eGlyph(X.e + R)}" fill="${ink}" fill-rule="evenodd"/>`),
    ].join("\n    ");
    const variant = dark ? "dark" : "light";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="blade-logo blade-logo--${variant}" viewBox="${VIEW}" role="img" aria-label="blade">
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

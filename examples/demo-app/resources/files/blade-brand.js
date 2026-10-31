// Endless 61ade brand scene for the digital-signage demo (docs/demos.md#toolkit-d2-playlist): the b1ade logo of
// docs/brand.md (dark palette, geometry copied from packages/frontend/brand/blade-logo-dark.svg) builds up, glows,
// takes a light sweep and dissolves again, and the loop starts over seamlessly. Untrusted like every scene: it runs
// only inside the SandboxFrame, as the body of a function that returns {load, duration, renderAt, play, pause, seek}.
const LENGTH = 20;
const TAU = Math.PI * 2;
// Full logo viewBox (docs/brand.md#grid).
const BOX = { x: -19, y: -46, width: 1795, height: 395 };
const TILES = [
  ["M-7,52.8A12,12 0 0 1 -1.2,42.5L107.8,-22.9A12,12 0 0 1 126,-12.6L126,267.9A12,12 0 0 1 119,278.8L10,329A12,12 0 0 1 -7,318.1Z", [126, -34, 0, 300], ["#1EA0FF", "#0D4BB0"]],
  ["M144,5.7A12,12 0 0 1 161,-5.2L281,50A12,12 0 0 1 288,60.9L288,163.5A12,12 0 0 1 271,174.4L151,119.2A12,12 0 0 1 144,108.3Z", [144, -13, 288, 180], ["#40E4FF", "#0AA4F7"]],
  ["M144,156.7A12,12 0 0 1 161,145.8L281,201A12,12 0 0 1 288,211.9L288,314.5A12,12 0 0 1 271,325.4L151,270.2A12,12 0 0 1 144,259.3Z", [144, 140, 288, 330], ["#E6EAF0", "#AEB5C0"]],
];
// Glyphs b, 1 (blue gradient) and a, d, e (ink).
const GLYPHS = [
  ["M365,38.6A30,30 0 0 1 385.5,10.2L445.6,-9.9A14,14 0 0 1 464,3.4L464,78A8,8 0 0 0 472,86L602,86A66,66 0 0 1 668,152L668,256A66,66 0 0 1 602,322L427,322A62,62 0 0 1 365,260ZM459,178A12,12 0 0 1 471,166L564,166A12,12 0 0 1 576,178L576,225A12,12 0 0 1 564,237L471,237A12,12 0 0 1 459,225Z", true],
  ["M653.1,61.4A14,14 0 0 1 645.4,40.7L677.1,-11.2A10,10 0 0 1 685.6,-16L746,-16A56,56 0 0 1 802,40L802,215.7A150,150 0 0 0 813.8,273.9L828.2,308.1A10,10 0 0 1 818.9,322L732,322A32,32 0 0 1 700,290L700,84.8A12,12 0 0 0 691.6,73.4Z", true],
  ["M837,170A84,84 0 0 1 921,86L1068,86A66,66 0 0 1 1134,152L1134,316A6,6 0 0 1 1128,322L1048,322A4,4 0 0 1 1044,318L1044,178A12,12 0 0 0 1032,166L940,166A12,12 0 0 0 928,178L928,225A12,12 0 0 0 940,237L1021,237A4,4 0 0 1 1025,241L1025,318A4,4 0 0 1 1021,322L911,322A74,74 0 0 1 837,248Z", false],
  ["M1156,152A66,66 0 0 1 1222,86L1352,86A8,8 0 0 0 1360,78L1360,20A10,10 0 0 1 1370,10L1434,10A22,22 0 0 1 1456,32L1456,248A74,74 0 0 1 1382,322L1230,322A74,74 0 0 1 1156,248ZM1249,178A12,12 0 0 1 1261,166L1348,166A12,12 0 0 1 1360,178L1360,225A12,12 0 0 1 1348,237L1261,237A12,12 0 0 1 1249,225Z", false],
  ["M1477,160A74,74 0 0 1 1551,86L1678,86A86,86 0 0 1 1764,172L1764,215A6,6 0 0 1 1758,221L1623.7,221A4,4 0 0 1 1620,218.4L1609.1,190.2A6,6 0 0 1 1614.7,182L1665,182A6,6 0 0 0 1671,176L1671,172A6,6 0 0 0 1665,166L1578,166A12,12 0 0 0 1566,178L1566,225A12,12 0 0 0 1578,237L1715.9,237A4,4 0 0 1 1719.2,238.7L1762.9,300.4A6,6 0 0 1 1764,303.9L1764,308A14,14 0 0 1 1750,322L1551,322A74,74 0 0 1 1477,248Z", false],
];
let canvas, context, tiles, glyphs;

const clamp = value => Math.min(1, Math.max(0, value));
const ease = value => 1 - Math.pow(1 - clamp(value), 3);
/** 0 → 1 between `from` and `to` seconds, eased. */
const span = (t, from, to) => ease((t - from) / (to - from));

return {
  load(target) {
    canvas = target;
    context = canvas.getContext("2d");
    if (!context) throw new Error("The scene needs a 2D canvas.");
    tiles = TILES.map(([d, line, stops]) => {
      const fill = context.createLinearGradient(...line);
      fill.addColorStop(0, stops[0]);
      fill.addColorStop(1, stops[1]);
      return { path: new Path2D(d), fill };
    });
    const blue = context.createLinearGradient(0, -16, 0, 322);
    blue.addColorStop(0, "#2BE2FF");
    blue.addColorStop(1, "#0F7BFF");
    glyphs = GLYPHS.map(([d, isBlue]) => ({ path: new Path2D(d), fill: isBlue ? blue : "#E6E9EE", blue: isBlue }));
  },
  duration() {
    return LENGTH;
  },
  // Deterministic in `t` (0 … LENGTH): build-up 0–4.5 s, glow and sweep until 16 s, dissolve 16–19 s, dark pause.
  renderAt(t) {
    const width = canvas.width, height = canvas.height, phase = t / LENGTH;
    // Navy backdrop with a slowly orbiting blue haze; one full turn per loop, so the seam is invisible.
    context.fillStyle = "#050B18";
    context.fillRect(0, 0, width, height);
    const haze = context.createRadialGradient(width * (0.5 + 0.25 * Math.cos(phase * TAU)), height * (0.5 + 0.2 * Math.sin(phase * TAU)), 0,
      width / 2, height / 2, Math.max(width, height) * 0.75);
    haze.addColorStop(0, "rgba(15, 123, 255, 0.28)");
    haze.addColorStop(1, "rgba(15, 123, 255, 0)");
    context.fillStyle = haze;
    context.fillRect(0, 0, width, height);
    // Drifting light motes, also periodic in the loop.
    for (let index = 0; index < 40; index++) {
      const seed = Math.sin(index * 12.9898) * 43758.5453, x = seed - Math.floor(seed);
      const y = (x * 7.31 + phase * (1 + (index % 3))) % 1;
      context.fillStyle = `rgba(64, 228, 255, ${0.08 + 0.12 * Math.abs(Math.sin(phase * TAU * 2 + index))})`;
      context.beginPath();
      context.arc(x * width, height - y * height, 1 + (index % 3), 0, TAU);
      context.fill();
    }
    const out = span(t, 16, 19);
    // The logo at 70 % of the width, centred.
    const scale = Math.min(width * 0.7 / BOX.width, height * 0.5 / BOX.height);
    context.save();
    context.translate(width / 2 - (BOX.x + BOX.width / 2) * scale, height / 2 - (BOX.y + BOX.height / 2) * scale);
    context.scale(scale, scale);
    // Tiles fly in from the left one after the other.
    tiles.forEach((tile, index) => {
      const p = span(t, 0.3 + index * 0.35, 1.5 + index * 0.35);
      context.save();
      context.globalAlpha = p * (1 - out);
      context.translate((1 - p) * -260, 0);
      context.fillStyle = tile.fill;
      context.fill(tile.path);
      context.restore();
    });
    // Glyphs rise into place; the blue ones glow and pulse while the logo stands.
    const pulse = 0.5 + 0.5 * Math.sin((t - 4.5) * TAU / 3);
    glyphs.forEach((glyph, index) => {
      const p = span(t, 1.6 + index * 0.4, 2.8 + index * 0.4);
      context.save();
      context.globalAlpha = p * (1 - out);
      context.translate(0, (1 - p) * 120 + out * -60);
      if (glyph.blue) {
        context.shadowColor = "rgba(43, 226, 255, 0.85)";
        context.shadowBlur = (12 + 28 * pulse * span(t, 4, 5)) * (1 - out);
      }
      context.fillStyle = glyph.fill;
      context.fill(glyph.path, "evenodd");
      context.restore();
    });
    // A light sweep crosses the whole logo between 7 and 9.5 s and again between 12 and 14.5 s.
    for (const start of [7, 12]) {
      const p = (t - start) / 2.5;
      if (p <= 0 || p >= 1) continue;
      const x = BOX.x - 300 + p * (BOX.width + 600);
      const sheen = context.createLinearGradient(x - 160, 0, x + 160, 0);
      sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
      sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.55)");
      sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.save();
      const clip = new Path2D();
      for (const part of [...tiles, ...glyphs]) clip.addPath(part.path);
      context.clip(clip, "evenodd");
      context.fillStyle = sheen;
      context.fillRect(BOX.x, BOX.y, BOX.width, BOX.height);
      context.restore();
    }
    context.restore();
  },
  play() {},
  pause() {},
  seek() {},
};

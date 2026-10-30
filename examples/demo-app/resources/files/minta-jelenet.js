// Synthetic 61ade feature-demo scene (toolkit D2, docs/demos.md#toolkit-d2-playlist). Untrusted by design: the
// playlist preview fetches it through `signage_playlist.scene` and runs it only inside the SandboxFrame (opaque
// origin, no network). The file is the body of a function that returns the scene; the preview's scene runtime
// draws it on a canvas and drives it: load(canvas), duration(), renderAt(seconds), play(), pause(), seek(seconds).
const LENGTH = 12;
const TAU = Math.PI * 2;
let canvas, context, playing = false, sought = 0;

return {
  load(target) {
    canvas = target;
    context = canvas.getContext("2d");
    if (!context) throw new Error("The scene needs a 2D canvas.");
  },
  duration() {
    return LENGTH;
  },
  // Deterministic in `t` (0 … LENGTH), so a seek shows exactly the frame of that moment.
  renderAt(t) {
    const width = canvas.width, height = canvas.height, unit = Math.min(width, height) / 100, phase = t / LENGTH;
    const sky = context.createLinearGradient(0, 0, width, height);
    sky.addColorStop(0, `hsl(${(220 + phase * 120) % 360} 60% 18%)`);
    sky.addColorStop(1, `hsl(${(280 + phase * 120) % 360} 55% 8%)`);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    // Six orbiting discs, one turn per scene length.
    for (let index = 0; index < 6; index++) {
      const angle = phase * TAU + index * TAU / 6, radius = 28 * unit;
      context.beginPath();
      context.arc(width / 2 + Math.cos(angle) * radius * 1.4, height / 2 + Math.sin(angle) * radius, (4 + index) * unit, 0, TAU);
      context.fillStyle = `hsl(${(index * 60 + phase * 360) % 360} 80% 62% / 0.85)`;
      context.fill();
    }
    // Progress ring and the scene clock.
    context.lineWidth = 2 * unit;
    context.strokeStyle = "rgba(255, 255, 255, 0.35)";
    context.beginPath();
    context.arc(width / 2, height / 2, 12 * unit, -Math.PI / 2, -Math.PI / 2 + phase * TAU);
    context.stroke();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `600 ${7 * unit}px system-ui, sans-serif`;
    context.fillText("61ade", width / 2, height / 2 - 2 * unit);
    context.font = `${4 * unit}px system-ui, sans-serif`;
    context.fillText(`${t.toFixed(1)} s`, width / 2, height / 2 + 6 * unit);
    if (!playing) {
      // Paused: two bars in the corner, and the last seek target.
      context.fillRect(4 * unit, 4 * unit, 2 * unit, 7 * unit);
      context.fillRect(8 * unit, 4 * unit, 2 * unit, 7 * unit);
      context.textAlign = "left";
      context.font = `${3 * unit}px system-ui, sans-serif`;
      context.fillText(`${sought.toFixed(1)} s`, 12 * unit, 7.5 * unit);
    }
  },
  play() {
    playing = true;
  },
  pause() {
    playing = false;
  },
  seek(t) {
    sought = t;
  },
};

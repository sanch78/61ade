// Scene runtime shared by the playlist preview (playlist.ts) and the asset viewer (assets.ts): the code a SandboxFrame
// runs around a scene asset's code (`signage_playlist.scene`) and the check of its untrusted `scene.state` messages.

/** Stored MIME type of a scene asset's file (signage.php BLADE_DEMO_SIGNAGE_SCENE_TYPE). */
export const SCENE_TYPE = "text/javascript";
/** What the scene runtime last reported (`scene.state`); untrusted, checked by sceneState(). */
export interface SceneState { time: number; duration: number; playing: boolean }
/** A scene must answer `ready` within this many ms (SandboxFrame `readyTimeout`; its code limit stays 1 MiB). */
export const SCENE_READY = 5000;

/**
 * Runs inside the SandboxFrame around the delivered scene code, which is the body of a function returning the scene
 * `{load(canvas), duration(), renderAt(seconds), play(), pause(), seek(seconds)}`. It owns the canvas and the scene clock
 * and speaks the scene messages of the playlist preview and the asset viewer: parent → frame `scene.play`,
 * `scene.pause`, `scene.seek` with `{at}` (seconds into the item; the scene loops by its own duration), frame → parent `scene.state`
 * `{time, local, duration, playing, frames}` after every command and twice a second while playing.
 */
export const SCENE_HEAD = "const scene = await (async () => {\n";
export const SCENE_TAIL = `
})();
if (!scene || typeof scene !== "object" || ["load", "duration", "renderAt", "play", "pause", "seek"].some(name => typeof scene[name] !== "function"))
  throw new Error("The scene must return load, duration, renderAt, play, pause and seek.");
document.documentElement.style.cssText = "height:100%;margin:0;background:#000";
document.body.style.cssText = "height:100%;margin:0;overflow:hidden";
const canvas = document.createElement("canvas");
canvas.style.cssText = "display:block;width:100%;height:100%";
document.body.append(canvas);
const fit = () => {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(innerWidth * ratio));
  canvas.height = Math.max(1, Math.round(innerHeight * ratio));
};
fit();
await scene.load(canvas);
const length = Number(scene.duration());
if (!(length > 0 && length <= 3600)) throw new Error("The scene duration must be more than 0 and at most 3600 seconds.");
let at = 0, since = 0, playing = false, request = 0, frames = 0;
const now = () => (playing ? at + (performance.now() - since) / 1000 : at);
const draw = () => { scene.renderAt(now() % length); frames++; };
const round = value => Math.round(value * 1000) / 1000;
const state = () => blade.post("scene.state", { time: round(now()), local: round(now() % length), duration: length, playing, frames });
const animate = () => { draw(); request = requestAnimationFrame(animate); };
const seconds = payload => { const value = Number(payload && payload.at); return Number.isFinite(value) && value >= 0 ? value : now(); };
blade.on("scene.seek", payload => { at = seconds(payload); since = performance.now(); scene.seek(at % length); draw(); state(); });
blade.on("scene.play", payload => {
  at = seconds(payload); since = performance.now();
  if (!playing) { playing = true; scene.play(); cancelAnimationFrame(request); animate(); }
  state();
});
blade.on("scene.pause", payload => { at = seconds(payload); playing = false; cancelAnimationFrame(request); scene.pause(); draw(); state(); });
setInterval(() => { if (playing) state(); }, 500);
addEventListener("resize", () => { fit(); draw(); });
draw();
state();
`;

/** `scene.state` of the frame, or undefined when it is not one (the frame is untrusted). */
export function sceneState(payload: unknown): SceneState | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const { time, duration, playing } = payload as Record<string, unknown>;
  return typeof time === "number" && Number.isFinite(time) && time >= 0 && typeof duration === "number" && Number.isFinite(duration) && duration > 0
    && typeof playing === "boolean" ? { time, duration, playing } : undefined;
}

// D2 Signage Napi műsor (docs/demos.md#toolkit-d2-playlist): the view kind `demo.playlist-preview`, a preview of one
// day's `signage_playlist.day` answer. A Layout from `app.dhx` with a Suite Form day picker, the 61ade CommandBar (day
// and playback commands, position), a timeline strip of the day's items with a playhead, a Suite Slider for scrubbing,
// a stage that shows the item at the playhead (the 61ade MediaPlayer for image, video and audio, a SandboxFrame for a
// scene asset) and the API request and answer. `signage.php` declares the view. Types only from 61ade; the rest is `app`.
import type { Application, ApplicationModule, CommandBar, MediaPlayer, SandboxFrame, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
// The strip, caption and API panel rules; tools/build.mjs emits them into public/app/demo.css (`stylesheets`).
import "./playlist.css";

/** `options` of the `demo.playlist-preview` view (signage.php): the file resource whose `content_stream` plays media. */
type PreviewOptions = { media?: string };

/** One timeline entry of the `signage_playlist.day` answer (signage.php blade_demo_signage_playlist). */
interface Asset { id: string; title: string; kind: string; duration: number; file: { id: string; name: string; mime_type: string } | null }
interface Slot { start: string; end: string; source: string; title: string | null; asset: Asset | null }
interface DayAnswer { date: string; weekday_name?: string; timeline: Slot[] }

type Kind = "image" | "video" | "audio" | "scene" | "none" | "other";
/** A timeline entry as the preview plays it: once, for the asset's play time, from `offset` seconds of the run. */
interface Item { index: number; slot: Slot; kind: Kind; seconds: number; offset: number; title: string }
interface Plan { date: string; answer: DayAnswer; items: Item[]; total: number }
/** What the scene runtime last reported (`scene.state`); untrusted, checked by sceneState(). */
interface SceneState { time: number; duration: number; playing: boolean }

type Layout = InstanceType<Application["dhx"]["Layout"]>;
type LayoutConfig = ConstructorParameters<Application["dhx"]["Layout"]>[1];
type Form = InstanceType<Application["dhx"]["Form"]>;
type FormConfig = ConstructorParameters<Application["dhx"]["Form"]>[1];
type Slider = InstanceType<Application["dhx"]["Slider"]>;
type SliderConfig = ConstructorParameters<Application["dhx"]["Slider"]>[1];
type Cell = ReturnType<Layout["getCell"]>;

const KIND = "demo.playlist-preview";
const PHONE = "(max-width: 767px)";
/** Seconds an entry without content (`source: none`) takes in the preview. */
const GAP = 3;
const LONGEST = 3600;
const TICK = 250;
/** A scene must answer `ready` within this many ms (SandboxFrame `readyTimeout`; its code limit stays 1 MiB). */
const SCENE_READY = 5000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Runs inside the SandboxFrame around the delivered scene code, which is the body of a function returning the scene
 * `{load(canvas), duration(), renderAt(seconds), play(), pause(), seek(seconds)}`. It owns the canvas and the scene clock
 * and speaks the preview's project messages: parent → frame `scene.play`, `scene.pause`, `scene.seek` with `{at}`
 * (seconds into the item; the scene loops by its own duration), frame → parent `scene.state`
 * `{time, local, duration, playing, frames}` after every command and twice a second while playing.
 */
const SCENE_HEAD = "const scene = await (async () => {\n";
const SCENE_TAIL = `
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

const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pad = (value: number) => String(value).padStart(2, "0");
/** `m:ss`, from one hour `h:mm:ss`, like the framework's length text. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = pad(s % 60);
  return h ? `${h}:${pad(m)}:${r}` : `${m}:${r}`;
}
/** The browser's local date, the default day. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
/** A real calendar date `YYYY-MM-DD`, else undefined. */
function calendarDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !DATE.test(value)) return undefined;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}
function shift(date: string, days: number): string {
  const next = new Date(date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
/** A datepicker value (`%Y-%m-%d` string or a Date) as a calendar date. */
function pickedDate(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return calendarDate(typeof value === "string" ? value.trim() : value);
}

/** The preview's run: every timeline entry once, an asset for its play time (1–3600 s), an empty entry for GAP seconds. */
function planOf(date: string, answer: DayAnswer): Plan {
  const slots = Array.isArray(answer?.timeline) ? answer.timeline : [];
  let offset = 0;
  const items = slots.map((slot, index): Item => {
    const asset = slot && typeof slot.asset === "object" && slot.asset !== null ? slot.asset : null;
    const mime = typeof asset?.file?.mime_type === "string" ? asset.file.mime_type : "";
    const kind: Kind = !asset ? "none"
      : asset.kind === "scene" ? "scene"
      : (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio") && mime.startsWith(asset.kind + "/") && typeof asset.file?.id === "string" ? asset.kind
      : "other";
    const seconds = asset ? Math.min(LONGEST, Math.max(1, Math.round(Number(asset.duration) || 0))) : GAP;
    const item = { index, slot, kind, seconds, offset, title: String(slot?.title ?? asset?.title ?? "") };
    offset += seconds;
    return item;
  });
  return { date, answer, items, total: offset };
}
/** The item playing at `seconds` of the run (the last one at the end). */
function itemAt(plan: Plan, seconds: number): Item | undefined {
  let found = plan.items[0];
  for (const item of plan.items) if (item.offset <= seconds) found = item;
  return found;
}
/** `scene.state` of the frame, or undefined when it is not one (the frame is untrusted). */
function sceneState(payload: unknown): SceneState | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const { time, duration, playing } = payload as Record<string, unknown>;
  return typeof time === "number" && Number.isFinite(time) && time >= 0 && typeof duration === "number" && Number.isFinite(duration) && duration > 0
    && typeof playing === "boolean" ? { time, duration, playing } : undefined;
}

/** One build of the page for the current width (breakpoint 768 px): layout, day picker and command bar. */
interface Shell { uid: string; signal: AbortSignal; layout: Layout; form: Form; bar: CommandBar; dispose(): void;
  paint?: AbortController; slider?: Slider; stage?: Stage; syncing: boolean; dragging: boolean }
/** What the stage shows: one item with its MediaPlayer or SandboxFrame; the controller destroys them. */
interface Stage { controller: AbortController; item?: Item; player?: MediaPlayer; frame?: SandboxFrame; ready: boolean;
  status: "" | "loading" | "ready" | "error"; message?: string; state?: SceneState }

/**
 * One opening of the preview. The day comes from `filter.date` of the address or is today; the run is the day's
 * timeline, every entry once for its play time. The clock belongs to the view (kept across a rebuild at the 768 px
 * breakpoint); a day change fetches the day again and starts at 0 paused. Each build and each stage owns an
 * AbortController that the host's signal aborts, which destroys the CommandBar, the Slider, the MediaPlayer or the
 * SandboxFrame, the listeners and the timers.
 */
function preview(app: Application, host: ViewHost, view: ViewDefinition<PreviewOptions>): ViewInstance {
  const t = (key: string, params?: Record<string, unknown>) => app.i18n.t(key, params);
  if (!view.actions.some(action => action.name === "day")) throw new Error(t("A napi műsor nem kérhető le."));
  const media = typeof view.options?.media === "string" && view.options.media ? view.options.media : "files";
  const scenes = view.actions.some(action => action.name === "scene");
  const phone = matchMedia(PHONE);
  let tenths: Intl.NumberFormat;
  try { tenths = new Intl.NumberFormat(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  catch { tenths = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  const kinds: Record<Kind, string> = { image: t("Kép"), video: t("Videó"), audio: t("Hang"), scene: t("Jelenet"), none: t("Nincs tartalom"), other: t("Egyéb tartalom") };

  let day = calendarDate(host.filters.date) ?? today();
  let plan: Plan | undefined, failure: string | undefined;
  // The clock: `position` while paused; while playing `base` seconds at `since` (performance.now()).
  let position = 0, playing = false, base = 0, since = 0, timer: ReturnType<typeof setInterval> | undefined;
  let shell: Shell | undefined, loading: AbortController | undefined, closed = false, sequence = 0, stripFrame = 0;
  const codes = new Map<string, Promise<string>>();
  const now = () => (playing && plan ? Math.min(plan.total, base + (performance.now() - since) / 1000) : position);
  const positionText = () => t("Pozíció: {position} / {length}", { position: clock(now()), length: clock(plan?.total ?? 0) });

  /** The scene code through `signage_playlist.scene`, once per day load (a day change fetches it again). */
  const sceneCode = (asset: string): Promise<string> => {
    let pending = codes.get(asset);
    if (!pending) {
      const fetched = app.server.call<{ code?: unknown }>("signage_playlist", "scene", { values: { asset }, signal: host.signal }).then(answer => {
        if (typeof answer?.code !== "string") throw new TypeError(t("A jelenet nem érkezett meg."));
        return answer.code;
      });
      codes.set(asset, pending = fetched);
      fetched.catch(() => { if (codes.get(asset) === fetched) codes.delete(asset); });
    }
    return pending;
  };

  const caption = (stage: Stage) => {
    const s = shell;
    if (!s || s.stage !== stage) return;
    const item = stage.item, slot = item?.slot;
    const title = item ? `${slot!.start}–${slot!.end} · ${item.title || kinds[item.kind]} · ${kinds[item.kind]}` : idle();
    let text = stage.message ?? "", attributes = "";
    if (item?.kind === "scene" && stage.status) {
      const state = stage.state;
      if (stage.status === "error") text = t("A jelenet hibát jelzett: {message}", { message: stage.message ?? "" });
      else if (stage.status === "loading" || !state) text = t("A jelenet betöltése…");
      else text = t("Jelenet: {time} / {length} mp", { time: tenths.format(state.time % state.duration), length: tenths.format(state.duration) });
      attributes = ` data-demo-scene-state="${stage.status}"`
        + (state ? ` data-demo-scene-time="${state.time.toFixed(1)}" data-demo-scene-playing="${state.playing}"` : "");
    }
    s.layout.getCell("caption").attachHTML(`<div class="demo-playlist-caption" data-demo-playlist="${s.uid}" data-demo-part="caption" data-demo-stage="${item?.kind ?? "empty"}"`
      + `${item ? ` data-demo-index="${item.index}"` : ""}><span class="demo-playlist-caption__title">${escape(title)}</span>`
      + `<span class="demo-playlist-caption__state${stage.status === "error" || (stage.message && item?.kind !== "scene") ? " demo-playlist-caption__state--error" : ""}"${attributes}>${escape(text)}</span></div>`);
  };

  const message = (text: string) => `<div class="demo-playlist-message">${escape(text)}</div>`;
  /** What an empty stage says: the load failure, the pending load, or a day without entries. */
  const idle = () => failure ?? (plan ? t("Nincs tartalom") : t("Betöltés…"));

  /** The scene stage: mounts the frame at once, then fetches the code and loads it; errors arrive through `sandbox:error`. */
  const scene = async (stage: Stage, screen: Cell) => {
    const item = stage.item!, signal = stage.controller.signal;
    const frame = stage.frame = new app.components.SandboxFrame({ signal, title: t("Jelenet: {title}", { title: item.title }), readyTimeout: SCENE_READY });
    frame.mount(screen);
    stage.status = "loading";
    frame.on("message", ({ type, payload }) => {
      const state = type === "scene.state" ? sceneState(payload) : undefined;
      if (state && stage.status !== "error") { stage.state = state; caption(stage); }
    });
    // The page-wide framework event: every error of a SandboxFrame (code, timeout, size, protocol) is reported there.
    app.events.on("sandbox:error", ({ message }) => {
      if (shell?.stage !== stage) return;
      stage.status = "error";
      stage.message = message;
      caption(stage);
    }, { signal });
    try {
      const code = await sceneCode(item.slot.asset!.id);
      if (signal.aborted) return;
      await frame.load(SCENE_HEAD + code + SCENE_TAIL);
      if (signal.aborted) return;
      stage.ready = true;
      stage.status = "ready";
      frame.post(playing ? "scene.play" : "scene.seek", { at: Math.max(0, now() - item.offset) });
      caption(stage);
    } catch (error) {
      // `sandbox:error` may have set the status meanwhile (TypeScript does not see that through the handler).
      if (signal.aborted || (error as Error)?.name === "AbortError" || (stage.status as Stage["status"]) === "error") return;
      // Not a frame failure (those came through `sandbox:error`): the code could not be delivered.
      stage.status = "error";
      stage.message = error instanceof Error ? error.message : String(error);
      caption(stage);
    }
  };

  /**
   * Shows `item` on the stage. Every stage gets its own box Layout in the `screen` cell, and its player, frame or notice
   * goes into the box's fresh cell in the same tick: a painted Suite cell that changes from `attachHTML` content to an
   * attached widget renders empty (the widget's DOM is wiped), so the screen cell only ever swaps widgets. The new box
   * replaces the old one before the old stage (its component, then its box) is destroyed.
   */
  const enter = (item: Item | undefined) => {
    const s = shell;
    if (!s) return;
    const previous = s.stage, controller = new AbortController(), signal = controller.signal;
    s.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    const stage: Stage = s.stage = { controller, item, ready: false, status: "" };
    const box: Layout = new app.dhx.Layout(null, { type: "none", rows: [{ id: "content" }] } as LayoutConfig);
    s.layout.getCell("screen").attach(box);
    const screen = box.getCell("content");
    if (!item) screen.attachHTML(message(idle()));
    else if (item.kind === "image" || item.kind === "video" || item.kind === "audio") {
      const file = item.slot.asset!.file!;
      const player = stage.player = new app.components.MediaPlayer({ source: { resource: media, action: "content_stream", id: file.id },
        mime: file.mime_type, name: item.title, toolbar: false, controls: false, loop: true, signal });
      player.on("loaded", () => { stage.ready = true; align(stage, true); if (playing) void player.play().catch(() => {}); });
      player.on("error", ({ message }) => { stage.message = message; caption(stage); });
      player.mount(screen);
    } else if (item.kind === "scene" && scenes) void scene(stage, screen);
    else screen.attachHTML(message(item.kind === "scene" ? t("A jelenet lejátszása nem engedélyezett.") : item.kind === "none" ? t("Nincs tartalom") : t("Ez a tartalomtípus nem játszható le.")));
    // Registered after the player or frame (created above with `signal`), so they are destroyed before their box.
    signal.addEventListener("abort", () => box.destructor(), { once: true });
    caption(stage);
    previous?.controller.abort();
  };

  /** Moves the stage to the clock: media within 1 s (`hard`: exactly), a scene only on `hard` (it runs its own clock). */
  const align = (stage: Stage | undefined, hard: boolean) => {
    const item = stage?.item;
    if (!stage?.ready || !item) return;
    const local = Math.max(0, now() - item.offset);
    if (stage.player) {
      const length = stage.player.duration();
      if (!(length > 0)) return;
      const target = local % length, drift = Math.abs(stage.player.position() - target);
      if (hard || Math.min(drift, length - drift) > 1) stage.player.seek(target);
    } else if (stage.frame && hard) stage.frame.post(playing ? "scene.play" : "scene.seek", { at: local });
  };

  /** Playhead, current item and scroll of the strip, once per animation frame (the strip HTML may not be painted yet). */
  const paintStrip = (attempt = 0) => {
    cancelAnimationFrame(stripFrame);
    stripFrame = requestAnimationFrame(() => {
      const s = shell, current = plan;
      if (!s || !current) return;
      const root = document.querySelector<HTMLElement>(`[data-demo-playlist="${s.uid}"][data-demo-part="strip"]`);
      if (!root) { if (attempt < 20) paintStrip(attempt + 1); return; }
      const at = now(), item = itemAt(current, at);
      root.dataset.demoPosition = at.toFixed(1);
      root.querySelectorAll<HTMLElement>("[data-demo-item]").forEach(button => {
        if (Number(button.dataset.demoItem) === item?.index) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      const slot = item && root.querySelector<HTMLElement>(`[data-demo-item="${item.index}"]`)?.parentElement;
      const head = root.querySelector<HTMLElement>(".demo-playlist-playhead");
      if (!item || !slot || !head) return;
      const left = slot.offsetLeft + slot.offsetWidth * Math.min(1, Math.max(0, (at - item.offset) / item.seconds));
      head.style.left = `${left}px`;
      if (left < root.scrollLeft || left > root.scrollLeft + root.clientWidth) root.scrollLeft = Math.max(0, left - root.clientWidth / 3);
    });
  };

  /** Brings the stage, slider, position and strip to the clock; `seeked` after a jump. */
  const sync = (seeked = false) => {
    const s = shell, current = plan;
    if (!s || !current) return;
    const at = now(), item = itemAt(current, at);
    if (item !== s.stage?.item) enter(item);
    else align(s.stage, seeked);
    s.bar.update("position", { label: positionText() });
    if (s.slider && !s.dragging) { s.syncing = true; try { s.slider.setValue(Math.min(current.total, at)); } finally { s.syncing = false; } }
    paintStrip();
  };

  const commands = () => {
    const s = shell, ready = !!plan && plan.items.length > 0;
    if (!s) return;
    s.bar.update("play", { disabled: !ready || playing });
    s.bar.update("pause", { disabled: !playing });
    for (const id of ["rewind", "previous", "next"]) s.bar.update(id, { disabled: !ready });
  };

  const play = () => {
    if (!plan || !plan.items.length || playing) return;
    if (position >= plan.total) position = 0;
    base = position; since = performance.now(); playing = true;
    clearInterval(timer);
    timer = setInterval(() => { if (plan && now() >= plan.total) pause(); else sync(); }, TICK);
    const stage = shell?.stage;
    if (stage?.ready && stage.player) void stage.player.play().catch(() => {});
    align(stage, true);
    commands();
    sync();
  };
  const pause = () => {
    if (!playing) return;
    position = now(); playing = false;
    clearInterval(timer); timer = undefined;
    const stage = shell?.stage;
    stage?.player?.pause();
    if (stage?.frame && stage.ready && stage.item) stage.frame.post("scene.pause", { at: Math.max(0, position - stage.item.offset) });
    commands();
    sync();
  };
  const seek = (seconds: number) => {
    if (!plan) return;
    position = Math.min(plan.total, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    if (playing) { base = position; since = performance.now(); }
    sync(true);
  };
  const step = (direction: -1 | 1) => {
    if (!plan) return;
    const at = now(), item = itemAt(plan, at);
    if (!item) return;
    // Back: to the start of the current item, or of the previous one within its first second.
    const target = direction > 0 ? plan.items[item.index + 1]?.offset ?? plan.total : at - item.offset > 1 ? item.offset : plan.items[Math.max(0, item.index - 1)].offset;
    seek(target);
  };

  const stripHtml = (s: Shell) => {
    const root = `class="demo-playlist-strip" data-demo-playlist="${s.uid}" data-demo-part="strip"`;
    if (!plan) return `<div ${root}><p class="demo-playlist-note">${escape(failure ?? t("Betöltés…"))}</p></div>`;
    const active = itemAt(plan, now());
    const items = plan.items.map(item => {
      const range = `${item.slot.start}–${item.slot.end}`, kind = kinds[item.kind], length = t("{seconds} mp", { seconds: item.seconds });
      const label = t("{start}–{end}: {title}, {kind}, {seconds} mp", { start: item.slot.start, end: item.slot.end, title: item.title || kind, kind, seconds: item.seconds });
      return `<li class="demo-playlist-slot" style="flex-grow:${item.seconds}"><button type="button" class="demo-playlist-item demo-playlist-item--${item.kind}"`
        + ` data-demo-item="${item.index}" data-demo-kind="${item.kind}" data-demo-seconds="${item.seconds}" aria-label="${escape(label)}"${item === active ? ' aria-current="true"' : ""}>`
        + `<span class="demo-playlist-item__time">${escape(range)}</span><span class="demo-playlist-item__title">${escape(item.title || kind)}</span>`
        + `<span class="demo-playlist-item__meta">${escape(`${kind} · ${length}`)}</span></button></li>`;
    }).join("");
    return `<div ${root} data-demo-position="${now().toFixed(1)}"><div class="demo-playlist-track"><ol class="demo-playlist-items" aria-label="${escape(t("Idővonal"))}">${items}</ol>`
      + `<span class="demo-playlist-playhead" aria-hidden="true"></span></div></div>`;
  };
  /** The day's request as an API client sends it, and the answer: what the view documents. */
  const apiHtml = (s: Shell) => {
    const request = JSON.stringify({ resource: "signage_playlist", action: "day", values: { date: day } }, null, 2);
    const answer = plan ? JSON.stringify({ ok: true, data: plan.answer }, null, 2) : failure ?? t("Betöltés…");
    return `<div class="demo-playlist-api" data-demo-playlist="${s.uid}" data-demo-part="api"><p class="demo-playlist-api__label">${escape(t("API-kérés"))}</p>`
      + `<pre class="demo-playlist-code">POST ./?blade=1\nAuthorization: Bearer &lt;${escape(t("API-kulcs"))}&gt;\nContent-Type: application/json\n\n${escape(request)}</pre>`
      + `<p class="demo-playlist-api__label">${escape(t("Válasz"))}</p><pre class="demo-playlist-code" tabindex="0">${escape(answer)}</pre></div>`;
  };

  /** Strip, API panel and Slider of the loaded day (or of the pending load) in the current build, then the stage. */
  const paint = () => {
    const s = shell;
    if (!s) return;
    const old = s.paint, controller = s.paint = new AbortController(), signal = controller.signal;
    s.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    s.layout.getCell("strip").attachHTML(stripHtml(s));
    s.layout.getCell("api").attachHTML(apiHtml(s));
    const slider: Slider = new app.dhx.Slider(null as unknown as HTMLElement, { min: 0, max: Math.max(1, plan?.total ?? 1), step: 0.1, value: Math.min(now(), plan?.total ?? 0),
      tooltip: false, label: t("Lejátszási pozíció"), labelPosition: "left", labelWidth: 150, hiddenLabel: phone.matches, css: "demo-playlist-scrub" } as SliderConfig);
    s.layout.getCell("scrub").attach(slider);
    if (!plan?.items.length) slider.disable();
    slider.events.on("change", (value: number) => { if (!s.syncing) seek(Number(value)); });
    slider.events.on("mousedown", () => { s.dragging = true; });
    // The thumb follows the clock again once the pointer is released anywhere.
    addEventListener("pointerup", () => { s.dragging = false; }, { signal });
    old?.abort();
    s.slider = slider;
    signal.addEventListener("abort", () => slider.destructor(), { once: true });
    commands();
    if (plan?.items.length) sync(true);
    else enter(undefined);
  };

  /** A build for the current width; the previous one is released after the new layout replaced it. */
  const render = () => {
    if (closed) return;
    const previous = shell, controller = new AbortController(), signal = controller.signal, compact = phone.matches;
    const api = { id: "api", header: escape(t("API-kérés és válasz")), collapsable: true, ...(compact ? { collapsed: true, height: 280 } : { width: 420 }) };
    const stage = { rows: [{ id: "caption", height: 44 }, { id: "screen" }] };
    const layout: Layout = new app.dhx.Layout(null, { type: "none", css: "demo-playlist", rows: compact
      ? [{ id: "day", height: 56 }, { id: "commands", height: 48 }, { id: "strip", height: 96 }, { id: "scrub", height: 44 }, stage, api]
      : [{ height: 56, cols: [{ id: "day", width: 280 }, { id: "commands" }] }, { id: "strip", height: 104 }, { id: "scrub", height: 44 }, { type: "line", cols: [stage, api] }] } as LayoutConfig);
    host.attach(layout);
    const form: Form = new app.dhx.Form(null as unknown as HTMLElement, { css: "demo-playlist-day", padding: "8px 12px", rows: [{ type: "datepicker", name: "date", label: t("Nap"), labelPosition: "left",
      labelWidth: 48, dateFormat: "%Y-%m-%d", weekStart: "monday", editable: true, value: day }] } as FormConfig);
    layout.getCell("day").attach(form);
    const bar: CommandBar = new app.components.CommandBar({ signal, items: [
      { id: "previous-day", label: t("Előző nap"), icon: "dxi dxi-arrow-left" },
      { id: "today", label: t("Ma"), icon: "dxi dxi-calendar-today" },
      { id: "next-day", label: t("Következő nap"), icon: "dxi dxi-arrow-right" },
      { id: "play", label: t("Lejátszás"), icon: "dxi dxi-menu-right", disabled: true },
      { id: "pause", label: t("Szünet"), disabled: true },
      { id: "rewind", label: t("Elejére"), icon: "dxi dxi-chevron-double-left", disabled: true },
      { id: "previous", label: t("Előző elem"), icon: "dxi dxi-chevron-left", disabled: true },
      { id: "next", label: t("Következő elem"), icon: "dxi dxi-chevron-right", disabled: true },
      { type: "spacer" },
      { id: "position", label: positionText(), disabled: true },
    ] });
    bar.mount(layout.getCell("commands"));
    let disposed = false;
    const s: Shell = { uid: `pp${++sequence}`, signal, layout, form, bar, syncing: false, dragging: false, dispose: () => {
      if (disposed) return;
      disposed = true;
      // Components first (they detach from their cells), the layout last.
      s.paint?.abort();
      controller.abort();
      form.destructor();
      layout.destructor();
      if (shell === s) shell = undefined;
    } };
    shell = s;
    previous?.dispose();
    host.signal.addEventListener("abort", s.dispose, { once: true, signal });
    bar.on("click", ({ id }) => {
      if (id === "previous-day" || id === "next-day") choose(shift(day, id === "next-day" ? 1 : -1));
      else if (id === "today") choose(today());
      else if (id === "play") play();
      else if (id === "pause") pause();
      else if (id === "rewind") seek(0);
      else if (id === "previous" || id === "next") step(id === "next" ? 1 : -1);
    });
    form.events.on("change", (name: string, value: unknown) => {
      if (name !== "date" || s.syncing) return;
      const next = pickedDate(value);
      if (next) choose(next);
    });
    // Strip items seek to their start (buttons: Enter and Space too); the strip is HTML in a Layout cell.
    document.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-demo-item]") : null;
      const item = button?.closest(`[data-demo-playlist="${s.uid}"]`) && plan?.items[Number(button.dataset.demoItem)];
      if (item) seek(item.offset);
    }, { signal });
    paint();
  };

  /** Shows `date`: the day picker follows, the day is fetched again and the run starts at 0, paused. */
  const choose = (date: string) => {
    const s = shell, picker = s?.form.getItem("date");
    if (s && picker && pickedDate(picker.getValue()) !== date) { s.syncing = true; try { picker.setValue(date); } finally { s.syncing = false; } }
    if (date === day && (plan?.date === date || loading)) return;
    day = date;
    void load();
  };
  const load = async () => {
    loading?.abort();
    const controller = loading = new AbortController();
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal: controller.signal });
    pause();
    position = 0; plan = undefined; failure = undefined;
    codes.clear();
    paint();
    try {
      const answer = await app.server.call<DayAnswer>("signage_playlist", "day", { values: { date: day }, signal: controller.signal });
      if (controller.signal.aborted) return;
      plan = planOf(day, answer);
      host.setTitle(`${view.title}: ${day}${typeof answer?.weekday_name === "string" ? ` (${answer.weekday_name})` : ""}`);
    } catch (error) {
      if (controller.signal.aborted || (error as Error)?.name === "AbortError") return;
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      if (loading === controller) loading = undefined;
    }
    paint();
  };

  const close = () => {
    if (closed) return;
    closed = true;
    loading?.abort();
    clearInterval(timer);
    cancelAnimationFrame(stripFrame);
    shell?.dispose();
  };
  host.signal.addEventListener("abort", close, { once: true });
  phone.addEventListener("change", render, { signal: host.signal });
  try { render(); } catch (error) { close(); throw error; }
  void load();
  return { destroy: close };
}

const playlist: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<PreviewOptions>) => preview(app, host, view) });
};
export default playlist;

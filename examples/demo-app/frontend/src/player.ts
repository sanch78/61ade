// The demo's shared player of the signage pages: the playlist editor's preview (playlist-editor.ts, D5) and the day
// programme (playlist.ts, D2). It plays items in order, each for its own play time, on one clock: a stage (the 61ade
// MediaPlayer for image, video and audio, a SandboxFrame for a scene asset) with the item's transition, the playback
// commands (61ade CommandBar) and a timeline strip with a playhead (a click seeks within an item). Everything it shows
// comes from the page's items; it calls only `signage_playlist.scene` for a scene's code.
import type { Application, CommandBar, MediaPlayer, SandboxFrame } from "@61ade/admin";
import "./player.css";
import { SCENE_HEAD, SCENE_READY, SCENE_TAIL, sceneState, type SceneState } from "./scene";

export type PlayerKind = "image" | "video" | "audio" | "scene" | "none" | "other";
/** One item to play. */
export interface PlayerItem {
  key: string;
  title: string;
  /** Play time in seconds (1–3600). */
  seconds: number;
  kind: PlayerKind;
  /** The file of an image, video or audio item. */
  file?: { id: string; mime_type: string; revision?: string } | null;
  /** The asset of a scene item (its code through `signage_playlist.scene`). */
  asset?: string;
  /** How the item enters: `none`, `fade`, `slide` or `zoom`, for `ms` milliseconds. */
  transition?: { type: string; ms: number };
  /** The strip's lines: a time range, a secondary line, and the playlist the item belongs to (marked). */
  time?: string;
  meta?: string;
  list?: string;
}
export interface PlayerOptions {
  app: Application;
  /** Destroys the player's components and timers. */
  signal: AbortSignal;
  /** File manager resource whose `content_stream` plays media. */
  files: string;
  /** Start over at the end (otherwise the player stops there). */
  loop?: boolean;
  muted?: boolean;
  /** Scene items may run (the actor is offered `signage_playlist.scene`). */
  scenes?: boolean;
  /** The caption of the item on the stage. */
  caption?: (item: PlayerItem, index: number, count: number) => string;
}
type Stage = { controller: AbortController; item?: PlayerItem; element: HTMLElement; player?: MediaPlayer; frame?: SandboxFrame; ready: boolean;
  status: "" | "loading" | "ready" | "error"; message?: string; state?: SceneState };

const TICK = 200;
const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pad = (value: number) => String(value).padStart(2, "0");
/** `m:ss`, from one hour `h:mm:ss`, like the framework's length text. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = pad(s % 60);
  return h ? `${h}:${pad(m)}:${r}` : `${m}:${r}`;
}

/**
 * The player: `element` holds the stage (caption and screen), the commands and the strip; the page puts it into a
 * region (`PageLayout.attach`). `show(items)` replaces what it plays: the position goes back to the start, paused,
 * unless `keep` is set and the current item is still there. The clock runs only while playing.
 */
export class Player {
  readonly element: HTMLElement;
  private readonly t: (key: string, params?: Record<string, unknown>) => string;
  private readonly caption: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly bar: CommandBar;
  private items: PlayerItem[] = [];
  private offsets: number[] = [];
  private total = 0;
  private loaded = false;
  private notice = "";
  private stage?: Stage;
  private position = 0;
  private playing = false;
  private base = 0;
  private since = 0;
  private timer?: ReturnType<typeof setInterval>;
  private frame = 0;
  private codes = new Map<string, Promise<string>>();
  private tenths: Intl.NumberFormat;

  constructor(private readonly options: PlayerOptions) {
    const { app, signal } = options;
    this.t = (key, params) => app.i18n.t(key, params);
    try { this.tenths = new Intl.NumberFormat(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
    catch { this.tenths = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
    const part = (name: string, className: string, tag = "div") => {
      const element = document.createElement(tag);
      element.className = className;
      element.dataset.demoPart = name;
      return element;
    };
    this.element = part("player", "demo-player");
    const stage = part("stage", "demo-player__stage");
    stage.setAttribute("role", "region");
    stage.setAttribute("aria-label", this.t("Előnézet"));
    this.caption = part("caption", "demo-playlist-caption");
    this.screen = part("screen", "demo-player__screen");
    const commands = part("commands", "demo-player__commands");
    this.strip = part("strip", "demo-playlist-strip");
    stage.append(this.caption, this.screen);
    this.element.append(stage, commands, this.strip);
    this.bar = new app.components.CommandBar({ signal, items: [
      { id: "play", label: this.t("Lejátszás"), icon: "dxi dxi-menu-right", disabled: true },
      { id: "pause", label: this.t("Szünet"), disabled: true },
      { id: "rewind", label: this.t("Elejére"), icon: "dxi dxi-chevron-double-left", disabled: true },
      { id: "previous", label: this.t("Előző elem"), icon: "dxi dxi-chevron-left", disabled: true },
      { id: "next", label: this.t("Következő elem"), icon: "dxi dxi-chevron-right", disabled: true },
      { type: "spacer" },
      { id: "position", label: this.positionText(), disabled: true },
    ] });
    this.bar.mount(commands);
    this.bar.on("click", ({ id }) => {
      if (id === "play") this.play();
      else if (id === "pause") this.pause();
      else if (id === "rewind") this.seek(0);
      else if (id === "previous" || id === "next") this.step(id === "next" ? 1 : -1);
    }, { signal });
    // Strip items seek to the point clicked within them (Enter and Space: to their start).
    this.strip.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-demo-item]") : null;
      const index = Number(button?.dataset.demoItem), item = this.items[index];
      if (!button || !item) return;
      const box = button.getBoundingClientRect(), x = (event as MouseEvent).detail > 0 ? (event as MouseEvent).clientX - box.left : 0;
      this.seek(this.offsets[index] + item.seconds * Math.min(0.999, Math.max(0, box.width ? x / box.width : 0)), true);
    }, { signal });
    signal.addEventListener("abort", () => { this.stop(); cancelAnimationFrame(this.frame); this.stage?.controller.abort(); }, { once: true });
    this.paint();
  }

  /** What the player plays; `keep`: stay on the current item (and its position) while it is still there. */
  show(items: PlayerItem[], keep = false): void {
    const current = keep ? this.current() : undefined, local = current ? this.now() - this.offsets[this.items.indexOf(current)] : 0;
    this.items = items;
    let offset = 0;
    this.offsets = items.map(item => { const start = offset; offset += item.seconds; return start; });
    this.total = offset;
    this.loaded = true;
    this.notice = "";
    if (!keep) this.codes.clear();
    const index = current ? items.findIndex(item => item.key === current.key) : -1;
    if (index < 0) { this.stop(); this.position = 0; }
    else this.setClock(Math.min(this.total, this.offsets[index] + Math.min(local, items[index].seconds - 0.001)));
    this.paint();
  }
  /** Before the first `show` or after a failure: the text the empty stage and strip show. */
  wait(text: string): void {
    this.stop();
    this.items = []; this.offsets = []; this.total = 0; this.position = 0; this.loaded = false; this.notice = text;
    this.paint();
  }

  private now(): number { return this.playing ? Math.min(this.total, this.base + (performance.now() - this.since) / 1000) : this.position; }
  private setClock(seconds: number): void {
    this.position = Math.min(this.total, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    if (this.playing) { this.base = this.position; this.since = performance.now(); }
  }
  private indexAt(seconds: number): number {
    let found = this.items.length ? 0 : -1;
    for (let index = 0; index < this.offsets.length; index++) if (this.offsets[index] <= seconds) found = index;
    return found;
  }
  private current(): PlayerItem | undefined { return this.stage?.item; }
  private positionText(): string { return this.t("Pozíció: {position} / {length}", { position: clock(this.now()), length: clock(this.total) }); }

  play(): void {
    if (this.playing || !this.items.length) return;
    if (this.position >= this.total) this.position = 0;
    this.base = this.position; this.since = performance.now(); this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK);
    const stage = this.stage;
    if (stage?.ready && stage.player) void stage.player.play().catch(() => {});
    this.align(stage, true);
    this.commands();
    this.sync();
  }
  pause(): void {
    if (!this.playing) return;
    this.position = this.now();
    this.stop();
    const stage = this.stage;
    stage?.player?.pause();
    if (stage?.frame && stage.ready && stage.item) stage.frame.post("scene.pause", { at: Math.max(0, this.position - this.offsets[this.items.indexOf(stage.item)]) });
    this.commands();
    this.sync();
  }
  private stop(): void { this.playing = false; clearInterval(this.timer); this.timer = undefined; }
  private tick(): void {
    if (this.now() < this.total) { this.sync(); return; }
    if (this.options.loop && this.total > 0) { this.base = 0; this.since = performance.now(); this.sync(); }
    else this.pause();
  }
  /** Jumps to `seconds` of the run; `animate`: the item entering there uses its transition. */
  seek(seconds: number, animate = false): void {
    if (!this.items.length) return;
    this.setClock(seconds);
    this.sync(true, animate);
  }
  /** Next item, or back to the start of the current one (the previous one within its first second); wraps when looping. */
  step(direction: -1 | 1): void {
    if (!this.items.length) return;
    const at = this.now(), index = this.indexAt(at), count = this.items.length;
    let target: number;
    if (direction > 0) target = index + 1 < count ? this.offsets[index + 1] : this.options.loop ? 0 : this.total;
    else target = at - this.offsets[index] > 1 ? this.offsets[index] : this.offsets[index > 0 ? index - 1 : this.options.loop ? count - 1 : 0];
    this.seek(target, true);
  }

  /** Brings the stage, the position and the strip to the clock; `seeked` after a jump. */
  private sync(seeked = false, animate = !seeked): void {
    const index = this.indexAt(this.now()), item = this.items[index], shown = this.stage?.item;
    // The same item in a new list (same key and content) keeps its stage; anything else enters anew.
    const same = !!this.stage && !!item && !!shown && item.key === shown.key && item.kind === shown.kind && item.file?.id === shown.file?.id && item.asset === shown.asset;
    if (!same) this.enter(item, animate && !!shown);
    else { this.stage!.item = item; this.align(this.stage, seeked); }
    this.bar.update("position", { label: this.positionText() });
    this.paintStrip();
  }
  private commands(): void {
    const ready = this.items.length > 0;
    this.bar.update("play", { disabled: !ready || this.playing });
    this.bar.update("pause", { disabled: !this.playing });
    for (const id of ["rewind", "previous", "next"]) this.bar.update(id, { disabled: !ready });
    this.bar.update("position", { label: this.positionText() });
  }

  /** Moves the stage to the clock: media within 1 s (`hard`: exactly), a scene only on `hard` (it runs its own clock). */
  private align(stage: Stage | undefined, hard: boolean): void {
    const item = stage?.item;
    if (!stage?.ready || !item) return;
    const local = Math.max(0, this.now() - this.offsets[this.items.indexOf(item)]);
    if (stage.player) {
      const length = stage.player.duration();
      if (!(length > 0)) return;
      const target = local % length, drift = Math.abs(stage.player.position() - target);
      if (hard || Math.min(drift, length - drift) > 1) stage.player.seek(target);
    } else if (stage.frame && hard) stage.frame.post(this.playing ? "scene.play" : "scene.seek", { at: local });
  }

  /** The caption of the stage: the item and, for a scene, its state. */
  private label(stage: Stage): void {
    if (this.stage !== stage) return;
    const t = this.t, item = stage.item, index = item ? this.items.indexOf(item) : -1;
    const title = item ? (this.options.caption?.(item, index, this.items.length) ?? `${index + 1} / ${this.items.length} · ${item.title}`) : "";
    let text = stage.message ?? "", attributes = "";
    if (item?.kind === "scene" && stage.status) {
      const state = stage.state;
      if (stage.status === "error") text = t("A jelenet hibát jelzett: {message}", { message: stage.message ?? "" });
      else if (stage.status === "loading" || !state) text = t("A jelenet betöltése…");
      else text = t("Jelenet: {time} / {length} mp", { time: this.tenths.format(state.time % state.duration), length: this.tenths.format(state.duration) });
      attributes = ` data-demo-scene-state="${stage.status}"` + (state ? ` data-demo-scene-time="${state.time.toFixed(1)}" data-demo-scene-playing="${state.playing}"` : "");
    }
    this.caption.dataset.demoStage = item?.kind ?? "empty";
    if (item) this.caption.dataset.demoIndex = String(index); else delete this.caption.dataset.demoIndex;
    this.caption.innerHTML = `<span class="demo-playlist-caption__title">${escape(title)}</span>`
      + `<span class="demo-playlist-caption__state${stage.status === "error" || (stage.message && item?.kind !== "scene") ? " demo-playlist-caption__state--error" : ""}"${attributes}>${escape(text)}</span>`;
  }

  /** The scene code through `signage_playlist.scene`, once per `show` (a new list fetches it again). */
  private sceneCode(asset: string, signal: AbortSignal): Promise<string> {
    let pending = this.codes.get(asset);
    if (!pending) {
      const fetched = this.options.app.server.call<{ code?: unknown }>("signage_playlist", "scene", { values: { asset }, signal: this.options.signal }).then(answer => {
        if (typeof answer?.code !== "string") throw new TypeError(this.t("A jelenet nem érkezett meg."));
        return answer.code;
      });
      this.codes.set(asset, pending = fetched);
      fetched.catch(() => { if (this.codes.get(asset) === fetched) this.codes.delete(asset); });
    }
    return signal.aborted ? Promise.reject(new DOMException("closed", "AbortError")) : pending;
  }
  /** A scene item: the frame at once, then its code; errors arrive through the frame's `error` event. */
  private async scene(stage: Stage): Promise<void> {
    const item = stage.item!, signal = stage.controller.signal, t = this.t;
    const frame = stage.frame = new this.options.app.components.SandboxFrame({ signal, title: t("Jelenet: {title}", { title: item.title }), readyTimeout: SCENE_READY });
    frame.mount(stage.element);
    stage.status = "loading";
    frame.on("message", ({ type, payload }) => {
      const state = type === "scene.state" ? sceneState(payload) : undefined;
      if (state && stage.status !== "error") { stage.state = state; this.label(stage); }
    });
    frame.on("error", ({ message }) => { stage.status = "error"; stage.message = message; this.label(stage); });
    try {
      const code = await this.sceneCode(item.asset ?? "", signal);
      if (signal.aborted) return;
      await frame.load(SCENE_HEAD + code + SCENE_TAIL);
      if (signal.aborted) return;
      stage.ready = true;
      stage.status = "ready";
      frame.post(this.playing ? "scene.play" : "scene.seek", { at: Math.max(0, this.now() - this.offsets[this.items.indexOf(item)]) });
      this.label(stage);
    } catch (error) {
      if (signal.aborted || (error as Error)?.name === "AbortError" || (stage.status as Stage["status"]) === "error") return;
      stage.status = "error";
      stage.message = error instanceof Error ? error.message : String(error);
      this.label(stage);
    }
  }

  /**
   * Shows `item`: a new layer in the screen with its MediaPlayer, SandboxFrame or notice, entering with the item's
   * transition (`animate`) over the previous layer, which leaves and is released after it.
   */
  private enter(item: PlayerItem | undefined, animate: boolean): void {
    const t = this.t, previous = this.stage, controller = new AbortController(), signal = controller.signal;
    this.options.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    const type = item?.transition?.type ?? "none", ms = animate && type !== "none" ? Math.max(0, item?.transition?.ms ?? 0) : 0;
    const element = document.createElement("div");
    element.className = `demo-player__layer demo-player__layer--${escape(type)}${ms ? " demo-player__layer--from" : ""}`;
    element.style.setProperty("--player-ms", `${ms}ms`);
    if (item) element.dataset.demoKey = item.key;
    const stage: Stage = this.stage = { controller, item, element, ready: false, status: "" };
    this.screen.append(element);
    const notice = (text: string) => element.insertAdjacentHTML("beforeend", `<div class="demo-playlist-message">${escape(text)}</div>`);
    if (!item) notice(this.notice || (this.loaded ? t("Nincs tartalom") : t("Betöltés…")));
    else if ((item.kind === "image" || item.kind === "video" || item.kind === "audio") && item.file) {
      const player = stage.player = new this.options.app.components.MediaPlayer({ source: { resource: this.options.files, action: "content_stream", id: item.file.id, ...(item.file.revision ? { version: item.file.revision } : {}) },
        mime: item.file.mime_type, name: item.title, toolbar: false, controls: false, loop: true, muted: !!this.options.muted, signal });
      player.on("loaded", () => { stage.ready = true; this.align(stage, true); if (this.playing && this.stage === stage) void player.play().catch(() => {}); });
      player.on("error", ({ message }) => { stage.message = message; this.label(stage); });
      player.mount(element);
    } else if (item.kind === "scene" && item.asset && this.options.scenes) void this.scene(stage);
    else notice(item.kind === "scene" ? t("A jelenet lejátszása nem engedélyezett.") : item.kind === "none" ? t("Nincs tartalom") : t("Ez a tartalomtípus nem játszható le."));
    if (ms) requestAnimationFrame(() => requestAnimationFrame(() => element.classList.remove("demo-player__layer--from")));
    // Registered after the player or frame (created above with `signal`), so they are destroyed before their element.
    signal.addEventListener("abort", () => element.remove(), { once: true });
    if (previous) {
      previous.element.style.setProperty("--player-ms", `${ms}ms`);
      previous.element.classList.add("demo-player__layer--leave", `demo-player__layer--${type}`);
      setTimeout(() => previous.controller.abort(), ms + 50);
    }
    this.label(stage);
  }

  /** Playhead, current item and scroll of the strip, once per animation frame. */
  private paintStrip(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const root = this.strip, at = this.now(), index = this.indexAt(at), item = this.items[index];
      root.dataset.demoPosition = at.toFixed(1);
      root.querySelectorAll<HTMLElement>("[data-demo-item]").forEach(button => {
        if (Number(button.dataset.demoItem) === index) button.setAttribute("aria-current", "true"); else button.removeAttribute("aria-current");
      });
      const slot = item && root.querySelector<HTMLElement>(`[data-demo-item="${index}"]`)?.parentElement;
      const head = root.querySelector<HTMLElement>(".demo-playlist-playhead");
      if (!item || !slot || !head) return;
      const left = slot.offsetLeft + slot.offsetWidth * Math.min(1, Math.max(0, (at - this.offsets[index]) / item.seconds));
      head.style.left = `${left}px`;
      if (left < root.scrollLeft || left > root.scrollLeft + root.clientWidth) root.scrollLeft = Math.max(0, left - root.clientWidth / 3);
    });
  }
  /** The strip of the current items, then the stage at the clock. */
  private paint(): void {
    const t = this.t;
    if (!this.items.length) this.strip.innerHTML = `<p class="demo-playlist-note">${escape(this.notice || (this.loaded ? t("Nincs tartalom") : t("Betöltés…")))}</p>`;
    else this.strip.innerHTML = `<div class="demo-playlist-track"><ol class="demo-playlist-items" aria-label="${escape(t("Idővonal"))}">${this.items.map((item, index) => {
      const length = t("{seconds} mp", { seconds: item.seconds });
      const label = `${item.time ? `${item.time}: ` : ""}${[item.title, item.meta, length].filter(Boolean).join(", ")}${item.list ? ` (${t("Lejátszási lista: {title}", { title: item.list })})` : ""}`;
      return `<li class="demo-playlist-slot" style="flex-grow:${item.seconds}"><button type="button" class="demo-playlist-item demo-playlist-item--${item.kind}${item.list ? " demo-playlist-item--list" : ""}"`
        + ` data-demo-item="${index}" data-demo-key="${escape(item.key)}" data-demo-kind="${item.kind}" data-demo-seconds="${item.seconds}"${item.list ? ` data-demo-list="${escape(item.list)}"` : ""} aria-label="${escape(label)}">`
        + `<span class="demo-playlist-item__time">${escape(item.time ?? clock(item.seconds))}</span><span class="demo-playlist-item__title">${escape(item.title)}</span>`
        + `<span class="demo-playlist-item__meta">${escape([item.meta, length, item.list ? t("Lejátszási lista: {title}", { title: item.list }) : ""].filter(Boolean).join(" · "))}</span></button></li>`;
    }).join("")}</ol><span class="demo-playlist-playhead" aria-hidden="true"></span></div>`;
    this.commands();
    this.sync(true, false);
  }
}

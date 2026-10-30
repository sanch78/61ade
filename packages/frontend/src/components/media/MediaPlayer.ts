import { Layout, Toolbar } from "@dhtmlx/suite";
import { locale, t } from "../../I18n";
import { server } from "../../api/Server";
import type { MediaPlayer as MediaPlayerContract, MediaPlayerEvents, MediaPlayerOptions, MountTarget } from "../../api/types";
import { Lifecycle, optionSignal } from "../Lifecycle";
import "./media.css";

type Kind = "image" | "video" | "audio";
/** Framework-internal toolbar items around the player's own (the file manager's previous/next and full size). */
export type MediaChrome = { before?: any[]; after?: any[] };

/** Display names of the common types; others show their MIME subtype. */
const FORMATS: Record<string, string> = {
  "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP", "image/gif": "GIF", "image/svg+xml": "SVG",
  "video/mp4": "MP4", "video/webm": "WebM", "video/ogg": "Ogg",
  "audio/mpeg": "MP3", "audio/wav": "WAV", "audio/mp4": "M4A", "audio/aac": "AAC", "audio/ogg": "Ogg", "audio/webm": "WebM", "audio/flac": "FLAC",
};
export const mediaFormat = (mime: string): string => FORMATS[mime] ?? (mime.split("/")[1] ?? "").replace(/^x-/, "").toUpperCase();
/** `m:ss`, or `h:mm:ss` from one hour. */
export const mediaClock = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds)), hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60);
  return (hours ? `${hours}:${String(minutes).padStart(2, "0")}` : String(minutes)) + ":" + String(total % 60).padStart(2, "0");
};
const SPEEDS = [0.5, 1, 1.5, 2];
const ZOOMS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
/** Position events while playing (MediaPlayerEvents.position). */
const TICK = 250;
let slots = 0;

/**
 * Image, video and audio player (toolkit P3 C-3), extracted from the file manager's viewer: the element loads the
 * source directly (a GET action URL is fetched with HTTP Range requests by the browser; the server checks the ACL on
 * every request). Images fit the stage and zoom/rotate; video and audio use the native controls with loop and speed in
 * the toolbar; the toolbar shows dimensions, length, format and the caller's `info`.
 */
export class MediaPlayer implements MediaPlayerContract {
  readonly layout: Layout;
  /** The player's toolbar (absent with `toolbar: false`). */
  readonly toolbar?: Toolbar;
  readonly kind: Kind;
  private readonly stage: HTMLElement;
  private readonly media?: HTMLMediaElement;
  private readonly image?: HTMLImageElement;
  private readonly life = new Lifecycle<MediaPlayerEvents>(() => this.destroy());
  private readonly listeners = new AbortController();
  private readonly name: string;
  private readonly info: string;
  private readonly slot = "blade-player-slot-" + ++slots;
  private objectUrl?: string;
  private observer?: MutationObserver;
  private resize?: ResizeObserver;
  private ticker?: ReturnType<typeof setInterval>;
  private release?: () => void;

  constructor(options: MediaPlayerOptions, chrome: MediaChrome = {}) {
    const bound = optionSignal(options);
    const mime = String(options.mime ?? "");
    const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : null;
    if (!kind) throw new TypeError(`61ade: MediaPlayer cannot show "${mime}" (image/*, video/* or audio/* expected).`);
    this.kind = kind;
    this.name = options.name || t("Médiatartalom");
    this.info = options.info ?? "";
    const source = options.source as MediaPlayerOptions["source"];
    let url: string;
    if ("blob" in source) url = this.objectUrl = URL.createObjectURL(source.blob);
    else if ("url" in source) url = String(source.url);
    else url = server.url(source.resource, source.action, source.id, source.version);
    const format = mediaFormat(mime);
    const signal = this.listeners.signal;

    const bar = options.toolbar !== false;
    this.layout = new Layout(document.createElement("div"), { type: "none", css: `blade-document blade-document--${kind} blade-player`,
      rows: [...(bar ? [{ id: "bar", height: 48, css: "blade-command-row" }] : []), { id: "stage", css: "blade-document__body" }] });
    if (bar) {
      this.toolbar = new Toolbar(undefined, { css: "blade-document__bar", data: [...(chrome.before ?? []), ...this.items(options), { id: "info", type: "text", value: this.info, css: "blade-player__info" }, ...(chrome.after ?? [])] });
      this.layout.getCell("bar").attach(this.toolbar);
    }
    this.stage = document.createElement("div");
    if (kind === "image") {
      this.stage.className = "blade-image-stage";
      this.stage.tabIndex = 0;
      this.stage.setAttribute("role", "group");
      this.stage.setAttribute("aria-label", this.name);
      const frame = document.createElement("div");
      frame.className = "blade-image-frame";
      const image = this.image = document.createElement("img");
      image.alt = this.name;
      frame.append(image);
      this.stage.append(frame);
      this.zoomable(image, signal);
      image.addEventListener("load", () => {
        this.label("info", [`${image.naturalWidth} × ${image.naturalHeight} px`, format, this.info].filter(Boolean).join(" · "));
        this.emit("loaded", { duration: 0, width: image.naturalWidth, height: image.naturalHeight });
      }, { signal });
      image.addEventListener("error", () => this.failed(t("A kép nem jeleníthető meg.")), { signal });
      image.src = url;
    } else {
      this.stage.className = kind === "video" ? "blade-video-stage" : "blade-audio-stage";
      const media = this.media = document.createElement(kind);
      if (kind === "audio") {
        const title = document.createElement("div");
        title.className = "blade-audio-stage__name";
        title.textContent = this.name;
        this.stage.append(title);
      } else (media as HTMLVideoElement).playsInline = true;
      media.controls = options.controls !== false;
      media.preload = "metadata";
      media.loop = !!options.loop;
      media.muted = !!options.muted;
      media.autoplay = !!options.autoplay;
      media.defaultPlaybackRate = media.playbackRate = options.playbackRate ?? 1;
      media.tabIndex = 0;
      media.setAttribute("aria-label", this.name);
      this.stage.append(media);
      this.playable(media, format, signal);
      media.src = url;
    }
    this.life.bind(bound);
  }

  /** The kind's own toolbar items: zoom and rotation for images, loop and speed for video and audio. */
  private items(options: MediaPlayerOptions): any[] {
    if (this.kind === "image") {
      const percent = (scale: number) => new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(scale);
      return [
        { id: "zoom-out", icon: "dxi dxi-minus", tooltip: t("Kicsinyítés") },
        { id: "zoom", value: t("Illesztés"), items: [{ id: "zoom:fit", value: t("Illesztés") }, ...[0.5, 1, 2].map(level => ({ id: "zoom:" + level, value: percent(level) }))] },
        { id: "zoom-in", icon: "dxi dxi-plus", tooltip: t("Nagyítás") },
        { type: "separator" },
        { id: "rotate", icon: "dxi dxi-rotate-right", tooltip: t("Forgatás jobbra") },
        { type: "spacer" },
      ];
    }
    return [
      { id: "loop", value: t("Ismétlés"), twoState: true, active: !!options.loop },
      { id: "speed", value: t("Sebesség: {speed}", { speed: this.rate(options.playbackRate ?? 1) }), items: SPEEDS.map(speed => ({ id: "speed:" + speed, value: this.rate(speed) })) },
      { type: "spacer" },
    ];
  }
  private rate(speed: number): string { return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(speed) + "×"; }
  /** Updates a toolbar text only when it changed. */
  private label(id: string, value: string): void { if (this.toolbar && this.toolbar.data.getItem(id)?.value !== value) this.toolbar.data.update(id, { value }); }
  private failed(message: string): void { this.label("info", message); this.emit("error", { message }); }

  /** Fitted to the stage (never enlarged) by default; zoom steps, 100 %, rotation, and scrolling when larger. */
  private zoomable(image: HTMLImageElement, signal: AbortSignal): void {
    const stage = this.stage, frame = image.parentElement!;
    const percent = (scale: number) => new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(scale);
    let zoom: number | null = null, turn = 0;
    const fit = () => {
      const sideways = turn % 180 !== 0, width = sideways ? image.naturalHeight : image.naturalWidth, height = sideways ? image.naturalWidth : image.naturalHeight;
      return Math.min(1, (stage.clientWidth - 32) / width, (stage.clientHeight - 32) / height);
    };
    const paint = () => {
      if (!image.naturalWidth || (zoom === null && stage.clientWidth <= 32)) return;
      const scale = zoom ?? fit(), width = image.naturalWidth * scale, height = image.naturalHeight * scale, sideways = turn % 180 !== 0;
      frame.style.width = (sideways ? height : width) + "px"; frame.style.height = (sideways ? width : height) + "px";
      image.style.width = width + "px"; image.style.height = height + "px"; image.style.setProperty("--blade-turn", turn + "deg");
      this.label("zoom", zoom === null ? t("Illesztés ({value})", { value: percent(scale) }) : percent(scale));
    };
    const step = (direction: 1 | -1) => {
      const current = zoom ?? fit();
      zoom = direction > 0 ? ZOOMS.find(level => level > current * 1.01) ?? ZOOMS[ZOOMS.length - 1] : [...ZOOMS].reverse().find(level => level < current * 0.99) ?? ZOOMS[0];
      paint();
    };
    this.toolbar?.events.on("click", (id: string | number) => {
      const value = String(id);
      if (value === "zoom-in" || value === "zoom-out") step(value === "zoom-in" ? 1 : -1);
      else if (value === "rotate") { turn = (turn + 90) % 360; paint(); }
      else if (value.startsWith("zoom:")) { zoom = value === "zoom:fit" ? null : Number(value.slice(5)); paint(); }
    });
    stage.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "+" || event.key === "=") step(1); else if (event.key === "-") step(-1); else if (event.key === "0") { zoom = null; paint(); } else return;
      event.preventDefault();
    }, { signal });
    image.addEventListener("dblclick", () => { zoom = zoom === null ? 1 : null; paint(); }, { signal });
    image.addEventListener("load", paint, { signal });
    // Fitting follows the stage, including full size and manual resizing.
    this.resize = new ResizeObserver(() => { if (zoom === null) paint(); });
    this.resize.observe(stage);
  }

  /**
   * Native element events become component events; loop and speed follow the toolbar. Keys on the focused element:
   * Space/K play or pause, arrows seek 5 s, Home/End jump. A key the native controls already handled is not repeated.
   */
  private playable(media: HTMLMediaElement, format: string, signal: AbortSignal): void {
    const on = (type: string, listener: () => void) => media.addEventListener(type, listener, { signal });
    on("loadedmetadata", () => {
      const video = this.kind === "video" ? media as HTMLVideoElement : null, duration = this.duration();
      this.label("info", [video ? `${video.videoWidth} × ${video.videoHeight} px` : "", Number.isFinite(media.duration) ? mediaClock(media.duration) : "", format, this.info].filter(Boolean).join(" · "));
      this.emit("loaded", video ? { duration, width: video.videoWidth, height: video.videoHeight } : { duration });
    });
    on("error", () => this.failed(t(this.kind === "video" ? "A videó nem játszható le ebben a böngészőben." : "A hangfájl nem játszható le ebben a böngészőben.")));
    on("play", () => { clearInterval(this.ticker); this.ticker = setInterval(() => this.emit("position", { seconds: media.currentTime }), TICK); });
    const stop = () => { clearInterval(this.ticker); this.ticker = undefined; this.emit("position", { seconds: media.currentTime }); };
    on("pause", stop);
    on("seeked", () => this.emit("position", { seconds: media.currentTime }));
    // The element pauses (and reports the position) before it ends.
    on("ended", () => { clearInterval(this.ticker); this.emit("ended", {}); });
    this.toolbar?.events.on("click", (id: string | number) => {
      const value = String(id);
      if (value === "loop") media.loop = !!this.toolbar!.getState("loop");
      else if (value.startsWith("speed:")) { media.defaultPlaybackRate = media.playbackRate = Number(value.slice(6)); this.label("speed", t("Sebesség: {speed}", { speed: this.rate(media.playbackRate) })); }
    });
    media.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const paused = media.paused, time = media.currentTime, volume = media.volume;
      const unhandled = () => media.paused === paused && Math.abs(media.currentTime - time) < 0.01 && media.volume === volume;
      let run: (() => void) | undefined;
      if (event.key === " " || event.key === "k") { event.preventDefault(); run = () => { if (paused) void this.play().catch(() => undefined); else this.pause(); }; }
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") run = () => this.seek(time + (event.key === "ArrowRight" ? 5 : -5));
      else if (event.key === "Home" || event.key === "End") { event.preventDefault(); run = () => this.seek(event.key === "Home" ? 0 : this.duration()); }
      if (run) setTimeout(() => { if (!this.life.destroyed && unhandled()) run!(); });
    }, { signal });
  }

  private emit<K extends keyof MediaPlayerEvents>(event: K, payload: MediaPlayerEvents[K]): void { this.life.emit(event, payload); }

  on<K extends keyof MediaPlayerEvents>(event: K, handler: (payload: MediaPlayerEvents[K]) => void): () => void { return this.life.on(event, handler); }

  /**
   * Attaches the player (once) to an element, a Layout cell, an `AppWindow` or a `ViewHost` (framework-internal also a
   * Suite Window: the file manager's viewer). A window or view host destroys the player when it closes.
   */
  mount(target: MountTarget): void {
    const placed = this.life.mount(target, this.layout, element => {
      // An own box filling the element, so destroy() removes exactly what mount() added.
      const box = document.createElement("div");
      box.className = "blade-player__host";
      element.append(box);
      const host = new Layout(box, { type: "none", rows: [{ id: "player" }] });
      host.getCell("player").attach(this.layout);
      this.release = () => { host.destructor(); box.remove(); };
    });
    if (!placed) return;
    // The stage element lives in a slot of the cell's HTML and is put back whenever a repaint replaces the slot.
    this.layout.getCell("stage").attachHTML(`<div class="blade-view-slot blade-player__slot" id="${this.slot}"></div>`);
    this.observer = new MutationObserver(() => this.place());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.place();
  }
  private place(): void {
    const slot = document.getElementById(this.slot);
    if (slot && this.stage.parentElement !== slot) slot.append(this.stage);
  }

  /** Moves the keyboard focus to the player (the media element or the image stage). */
  focus(): void { this.place(); (this.media ?? this.stage).focus(); }

  play(): Promise<void> { return this.media && !this.life.destroyed ? this.media.play() : Promise.resolve(); }
  pause(): void { this.media?.pause(); }
  seek(seconds: number): void {
    const media = this.media;
    if (!media || this.life.destroyed || !Number.isFinite(seconds)) return;
    const end = this.duration();
    media.currentTime = Math.max(0, end ? Math.min(seconds, end) : seconds);
  }
  position(): number { return this.media?.currentTime ?? 0; }
  duration(): number { const value = this.media?.duration ?? 0; return Number.isFinite(value) ? value : 0; }

  /** Idempotent: stops playback, releases listeners, observers, the object URL of a Blob source and the widgets. */
  destroy(): void {
    // Detaches the player's Layout from its cell before the Layout is destructed.
    if (!this.life.end(this.layout)) return;
    clearInterval(this.ticker);
    this.listeners.abort();
    this.observer?.disconnect();
    this.resize?.disconnect();
    if (this.media) { this.media.pause(); this.media.removeAttribute("src"); this.media.load(); }
    if (this.image) this.image.removeAttribute("src");
    this.stage.remove();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.toolbar?.destructor();
    this.layout.destructor();
    this.release?.();
  }
}

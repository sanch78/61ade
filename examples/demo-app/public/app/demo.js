// examples/demo-app/frontend/src/scene.ts
var SCENE_TYPE = "text/javascript";
var SCENE_READY = 5e3;
var SCENE_HEAD = "const scene = await (async () => {\n";
var SCENE_TAIL = `
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
function sceneState(payload) {
  if (typeof payload !== "object" || payload === null) return void 0;
  const { time, duration, playing } = payload;
  return typeof time === "number" && Number.isFinite(time) && time >= 0 && typeof duration === "number" && Number.isFinite(duration) && duration > 0 && typeof playing === "boolean" ? { time, duration, playing } : void 0;
}

// examples/demo-app/frontend/src/assets.ts
var KIND = "demo.asset-viewer";
var ITEMS = "signage_asset_items";
var PHONE = "(max-width: 767px)";
var STEP = 5;
function clock(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
function mediaOf(list, row) {
  const slots = row._media && typeof row._media === "object" ? row._media : {};
  for (const column of list?.options.columns ?? []) {
    const media = column.media ? slots[column.id] : void 0;
    if (column.media && media && typeof media.id === "string" && typeof media.mime_type === "string") return { source: column.media, media };
  }
  return void 0;
}
function stageKind(media) {
  const mime = media?.mime_type.toLowerCase() ?? "", kind = mime.split("/")[0];
  return mime === SCENE_TYPE ? "scene" : kind === "image" || kind === "video" || kind === "audio" ? kind : void 0;
}
function viewer(app, host, view) {
  const t = (key, params) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A m\xE9dian\xE9z\u0151 egy m\xE9diaelemhez ny\xEDlik meg."));
  const row = host.record.row, asset = String(host.record.id), listId = view.options?.details ?? host.record.resource;
  const list = app.viewDefinition(listId);
  const found = mediaOf(list, row), kind = stageKind(found?.media);
  const playable = kind !== void 0, timed = kind === "video" || kind === "audio" || kind === "scene";
  const editable = !!list?.actions.some((action) => action.name === "update") && (!Array.isArray(row._actions) || row._actions.includes("update"));
  const usages = app.viewDefinition(ITEMS);
  const preferences = app.preferences.scope(KIND), phone = matchMedia(PHONE);
  let loop = preferences.get("loop") ?? !!view.options?.loop;
  let build, player, resume = 0;
  let frame, scene;
  host.setTitle(`${view.title}: ${String(row.title ?? host.record.id)}`);
  const root = document.createElement("div");
  root.style.cssText = "width:100%;height:100%";
  host.attach(root);
  const render = () => {
    if (host.signal.aborted) return;
    resume = player?.position() ?? (scene ? scene.time % scene.duration : resume);
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    previous?.abort();
    const extra = [...editable ? [{ id: "edit", header: t("Szerkeszt\xE9s") }] : [], ...usages ? [{ id: "items", header: t("Lej\xE1tsz\xE1si list\xE1kban") }] : []];
    const details = extra.length ? { accordion: [{ id: "details", header: t("Adatok"), open: true }, ...extra] } : { id: "details", header: t("Adatok"), collapsable: true };
    const layout = new app.components.PageLayout({
      id: `${view.id}.${phone.matches ? "narrow" : "wide"}${extra.map((section) => "." + section.id).join("")}`,
      tree: phone.matches ? { rows: [{ id: "player", height: kind === "audio" ? 380 : Math.max(220, Math.round(innerHeight * 0.4)), resizable: true }, { ...details, minHeight: 120 }] } : { cols: [{ id: "player", minWidth: 240, resizable: true }, { ...details, width: 380, minWidth: 240 }] }
    });
    layout.mount(root);
    const left = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { id: "stage" }] });
    layout.attach("player", left);
    player = void 0;
    frame = void 0;
    scene = void 0;
    const position = (seconds) => t("Poz\xEDci\xF3: {position} / {length}", { position: clock(seconds), length: clock(player?.duration() ?? scene?.duration ?? 0) });
    const status = !found ? t("Ehhez az elemhez nincs megjelen\xEDthet\u0151 m\xE9diaf\xE1jl.") : !playable ? t("Ez a f\xE1jlt\xEDpus nem j\xE1tszhat\xF3 le.") : timed ? position(resume) : "";
    const media = ["rewind", "backward", "play", "forward", "loop"];
    const repeat = () => ({ label: loop ? t("Ism\xE9tl\xE9s: be") : t("Ism\xE9tl\xE9s: ki"), icon: loop ? "blade-icon blade-icon--repeat" : "blade-icon blade-icon--repeat-off" });
    const bar = new app.components.CommandBar({ signal, items: [
      { id: "back", label: t("Vissza a list\xE1hoz"), icon: "dxi dxi-arrow-left" },
      ...timed ? [{ type: "separator" }] : [],
      { id: "rewind", label: t("Elej\xE9re"), icon: "blade-icon blade-icon--skip-previous", iconOnly: true, disabled: true, hidden: !timed },
      { id: "backward", label: t("Vissza {seconds} mp", { seconds: STEP }), icon: "blade-icon blade-icon--rewind", iconOnly: true, disabled: true, hidden: !timed },
      { id: "play", label: t("Lej\xE1tsz\xE1s"), icon: "blade-icon blade-icon--play", iconOnly: true, disabled: true, hidden: !timed },
      { id: "forward", label: t("El\u0151re {seconds} mp", { seconds: STEP }), icon: "blade-icon blade-icon--fast-forward", iconOnly: true, disabled: true, hidden: !timed },
      // A scene loops by its own length.
      { id: "loop", ...repeat(), iconOnly: true, disabled: true, hidden: !timed || kind === "scene" },
      { type: "spacer" },
      { id: "position", label: status, disabled: true, hidden: status === "" }
    ] });
    bar.mount(left.getCell("commands"));
    let playing = false;
    const toggle = (on) => {
      if (on === playing) return;
      playing = on;
      bar.update("play", on ? { label: t("Sz\xFCnet"), icon: "blade-icon blade-icon--pause" } : { label: t("Lej\xE1tsz\xE1s"), icon: "blade-icon blade-icon--play" });
    };
    bar.on("click", ({ id }) => {
      if (id === "back") {
        if (!app.navigate({ view: listId })) host.close();
        return;
      }
      if (frame) {
        const at = scene ? scene.time % scene.duration : 0;
        if (id === "play") frame.post(playing ? "scene.pause" : "scene.play", {});
        else if (id === "rewind") frame.post("scene.seek", { at: 0 });
        else if (id === "backward" || id === "forward") frame.post("scene.seek", { at: Math.max(0, at + (id === "forward" ? STEP : -STEP)) });
        return;
      }
      if (!player) return;
      if (id === "play") {
        if (playing) player.pause();
        else void player.play().catch(() => {
        });
      } else if (id === "rewind") player.seek(0);
      else if (id === "backward" || id === "forward") player.seek(player.position() + (id === "forward" ? STEP : -STEP));
      else if (id === "loop") {
        loop = !loop;
        player.setLoop(loop);
        preferences.set("loop", loop);
        bar.update("loop", repeat());
      }
    });
    const recordDetails = list ? new app.components.RecordDetails({ view: list, record: row, signal }) : void 0;
    recordDetails?.mount(layout.cell("details"));
    let form;
    const edit = () => {
      if (form || signal.aborted) return;
      form = new app.components.RecordForm({ resource: host.record.resource, action: "update", id: asset, cancel: false });
      form.on("saved", () => {
        const title = form?.values().title;
        if (typeof title === "string" && title.trim()) host.setTitle(`${view.title}: ${title}`);
        void recordDetails?.show(asset).catch(() => {
        });
      });
      form.mount(layout.cell("edit"));
    };
    let items;
    const showItems = () => {
      if (items || !usages || signal.aborted) return;
      items = new app.components.ListView({ view: usages, scope: { field: "asset_id", id: asset }, mode: "cards", panel: false, showId: false });
      items.mount(layout.cell("items"));
    };
    const sections = extra.length ? layout.accordionOf("details") : void 0;
    sections?.on("toggle", ({ id, open }) => {
      if (open && id === "edit") edit();
      if (open && id === "items") showItems();
    }, { signal });
    if (editable && sections?.isOpen("edit")) edit();
    if (usages && sections?.isOpen("items")) showItems();
    if (found && kind === "scene") {
      const current2 = frame = new app.components.SandboxFrame({ signal, autoplay: true, title: t("Jelenet: {title}", { title: String(row.title ?? found.media.name) }), readyTimeout: SCENE_READY });
      const failed = (message) => {
        for (const id of media) bar.update(id, { disabled: true });
        bar.update("position", { label: message, hidden: false });
      };
      current2.on("message", ({ type, payload }) => {
        const state = type === "scene.state" ? sceneState(payload) : void 0;
        if (!state) return;
        scene = state;
        toggle(state.playing);
        bar.update("position", { label: position(state.time % state.duration) });
      });
      app.events.on("sandbox:error", ({ message }) => {
        if (frame === current2) failed(t("A jelenet hib\xE1t jelzett: {message}", { message }));
      }, { signal });
      current2.mount(left.getCell("stage"));
      void app.server.call("signage_playlist", "scene", { values: { asset }, signal }).then(async (answer) => {
        if (typeof answer?.code !== "string") throw new TypeError(t("A jelenet nem \xE9rkezett meg."));
        await current2.load(SCENE_HEAD + answer.code + SCENE_TAIL);
        if (signal.aborted) return;
        for (const id of media) bar.update(id, { disabled: false });
        current2.post("scene.seek", { at: resume });
      }).catch((error) => {
        if (signal.aborted || error?.name === "AbortError") return;
        failed(error instanceof Error ? error.message : String(error));
      });
    }
    if (found && playable && kind !== "scene") player = new app.components.MediaPlayer({
      source: { resource: found.source, action: "content_stream", id: found.media.id, version: found.media.revision },
      mime: found.media.mime_type,
      name: String(row.title ?? found.media.name),
      // The player toolbar stays below the stage; its repeat switch and the command bar share state.
      toolbarPosition: "bottom",
      visualizer: kind === "audio" ? "spectrum" : void 0,
      loop,
      signal
    });
    const current = player;
    if (current) {
      current.on("loaded", () => {
        for (const id of media) bar.update(id, { disabled: false });
        if (resume > 0) current.seek(resume);
        bar.update("position", { label: position(resume) });
      });
      current.on("position", ({ seconds }) => bar.update("position", { label: position(seconds) }));
      current.on("play", () => toggle(true));
      current.on("pause", () => toggle(false));
      current.on("loop", (state) => {
        loop = state.loop;
        preferences.set("loop", loop);
        bar.update("loop", repeat());
      });
      current.on("error", ({ message }) => {
        for (const id of media) bar.update(id, { disabled: true });
        bar.update("position", { label: message, hidden: false });
      });
      current.mount(left.getCell("stage"));
      current.focus();
    }
    signal.addEventListener("abort", () => {
      form?.destroy();
      form = void 0;
      items?.destroy();
      items = void 0;
      left.destructor();
      layout.destroy();
    }, { once: true });
  };
  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => {
    build?.abort();
    player = void 0;
    frame = void 0;
  } };
}
var assets = (app) => {
  app.kinds.register(KIND, { create: (host, view) => viewer(app, host, view) });
  app.mediaTypes.register("demo.scene", { mime: [SCENE_TYPE], label: "Anim\xE1ci\xF3", icon: "blade-icon blade-icon--animation" });
  const playable = (view, row) => !!row && !!app.viewDefinition(KIND) && stageKind(mediaOf(view, row)?.media) !== void 0;
  app.commands.register("demo.play", {
    label: "Lej\xE1tsz\xE1s",
    icon: "dxi dxi-menu-right",
    placement: "record",
    enabled: ({ view, row, rows }) => rows.length <= 1 && playable(view, row),
    run: ({ app: app2, row }) => {
      if (row) app2.navigate({ view: KIND, record: String(row.id) });
    }
  });
};
var assets_default = assets;

// examples/demo-app/frontend/src/player.ts
var TICK = 200;
var escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var pad = (value) => String(value).padStart(2, "0");
function clock2(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = pad(s % 60);
  return h ? `${h}:${pad(m)}:${r}` : `${m}:${r}`;
}
var Player = class {
  constructor(options) {
    this.options = options;
    const { app, signal } = options;
    this.t = (key, params) => app.i18n.t(key, params);
    try {
      this.tenths = new Intl.NumberFormat(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    } catch {
      this.tenths = new Intl.NumberFormat(void 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    const part = (name, className, tag = "div") => {
      const element = document.createElement(tag);
      element.className = className;
      element.dataset.demoPart = name;
      return element;
    };
    this.element = part("player", "demo-player");
    const stage = part("stage", "demo-player__stage");
    stage.setAttribute("role", "region");
    stage.setAttribute("aria-label", this.t("El\u0151n\xE9zet"));
    this.caption = part("caption", "demo-playlist-caption");
    this.screen = part("screen", "demo-player__screen");
    const commands = part("commands", "demo-player__commands");
    this.strip = part("strip", "demo-playlist-strip");
    stage.append(this.caption, this.screen);
    this.element.append(stage, commands, this.strip);
    this.bar = new app.components.CommandBar({ signal, items: [
      { id: "rewind", label: this.t("Elej\xE9re"), icon: "blade-icon blade-icon--skip-start", iconOnly: true, disabled: true },
      { id: "previous", label: this.t("El\u0151z\u0151 elem"), icon: "blade-icon blade-icon--skip-previous", iconOnly: true, disabled: true },
      { id: "play", label: this.t("Lej\xE1tsz\xE1s"), icon: "blade-icon blade-icon--play", iconOnly: true, disabled: true },
      { id: "next", label: this.t("K\xF6vetkez\u0151 elem"), icon: "blade-icon blade-icon--skip-next", iconOnly: true, disabled: true },
      { type: "spacer" },
      { id: "position", label: this.positionText(), disabled: true }
    ] });
    this.bar.mount(commands);
    this.bar.on("click", ({ id }) => {
      if (id === "play") {
        if (this.playing) this.pause();
        else this.play();
      } else if (id === "rewind") this.seek(0);
      else if (id === "previous" || id === "next") this.step(id === "next" ? 1 : -1);
    }, { signal });
    this.strip.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-demo-item]") : null;
      const index = Number(button?.dataset.demoItem), item = this.items[index];
      if (!button || !item) return;
      const box = button.getBoundingClientRect(), x = event.detail > 0 ? event.clientX - box.left : 0;
      this.seek(this.offsets[index] + item.seconds * Math.min(0.999, Math.max(0, box.width ? x / box.width : 0)), true);
    }, { signal });
    signal.addEventListener("abort", () => {
      this.stop();
      cancelAnimationFrame(this.frame);
      this.stage?.controller.abort();
    }, { once: true });
    this.paint();
  }
  element;
  t;
  caption;
  screen;
  strip;
  bar;
  items = [];
  offsets = [];
  total = 0;
  loaded = false;
  notice = "";
  stage;
  position = 0;
  playing = false;
  base = 0;
  since = 0;
  timer;
  frame = 0;
  codes = /* @__PURE__ */ new Map();
  tenths;
  /** What the player plays; `keep`: stay on the current item (and its position) while it is still there. */
  show(items, keep = false) {
    const current = keep ? this.current() : void 0, local = current ? this.now() - this.offsets[this.items.indexOf(current)] : 0;
    this.items = items;
    let offset = 0;
    this.offsets = items.map((item) => {
      const start = offset;
      offset += item.seconds;
      return start;
    });
    this.total = offset;
    this.loaded = true;
    this.notice = "";
    if (!keep) this.codes.clear();
    const index = current ? items.findIndex((item) => item.key === current.key) : -1;
    if (index < 0) {
      this.stop();
      this.position = 0;
    } else this.setClock(Math.min(this.total, this.offsets[index] + Math.min(local, items[index].seconds - 1e-3)));
    this.paint();
  }
  /** Before the first `show` or after a failure: the text the empty stage and strip show. */
  wait(text) {
    this.stop();
    this.items = [];
    this.offsets = [];
    this.total = 0;
    this.position = 0;
    this.loaded = false;
    this.notice = text;
    this.paint();
  }
  now() {
    return this.playing ? Math.min(this.total, this.base + (performance.now() - this.since) / 1e3) : this.position;
  }
  setClock(seconds) {
    this.position = Math.min(this.total, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    if (this.playing) {
      this.base = this.position;
      this.since = performance.now();
    }
  }
  indexAt(seconds) {
    let found = this.items.length ? 0 : -1;
    for (let index = 0; index < this.offsets.length; index++) if (this.offsets[index] <= seconds) found = index;
    return found;
  }
  current() {
    return this.stage?.item;
  }
  positionText() {
    return this.t("Poz\xEDci\xF3: {position} / {length}", { position: clock2(this.now()), length: clock2(this.total) });
  }
  play() {
    if (this.playing || !this.items.length) return;
    if (this.position >= this.total) this.position = 0;
    this.base = this.position;
    this.since = performance.now();
    this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK);
    const stage = this.stage;
    if (stage?.ready && stage.player) void stage.player.play().catch(() => {
    });
    this.align(stage, true);
    this.commands();
    this.sync();
  }
  pause() {
    if (!this.playing) return;
    this.position = this.now();
    this.stop();
    const stage = this.stage;
    stage?.player?.pause();
    if (stage?.frame && stage.ready && stage.item) stage.frame.post("scene.pause", { at: Math.max(0, this.position - this.offsets[this.items.indexOf(stage.item)]) });
    this.commands();
    this.sync();
  }
  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = void 0;
  }
  tick() {
    if (this.now() < this.total) {
      this.sync();
      return;
    }
    if (this.options.loop && this.total > 0) {
      this.base = 0;
      this.since = performance.now();
      this.sync();
    } else this.pause();
  }
  /** Jumps to `seconds` of the run; `animate`: the item entering there uses its transition. */
  seek(seconds, animate = false) {
    if (!this.items.length) return;
    this.setClock(seconds);
    this.sync(true, animate);
  }
  /** Next item, or back to the start of the current one (the previous one within its first second); wraps when looping. */
  step(direction) {
    if (!this.items.length) return;
    const at = this.now(), index = this.indexAt(at), count = this.items.length;
    let target;
    if (direction > 0) target = index + 1 < count ? this.offsets[index + 1] : this.options.loop ? 0 : this.total;
    else target = at - this.offsets[index] > 1 ? this.offsets[index] : this.offsets[index > 0 ? index - 1 : this.options.loop ? count - 1 : 0];
    this.seek(target, true);
  }
  /** Brings the stage, the position and the strip to the clock; `seeked` after a jump. */
  sync(seeked = false, animate = !seeked) {
    const index = this.indexAt(this.now()), item = this.items[index], shown = this.stage?.item;
    const same = !!this.stage && !!item && !!shown && item.key === shown.key && item.kind === shown.kind && item.file?.id === shown.file?.id && item.asset === shown.asset;
    if (!same) this.enter(item, animate && !!shown);
    else {
      this.stage.item = item;
      this.align(this.stage, seeked);
    }
    this.bar.update("position", { label: this.positionText() });
    this.paintStrip();
  }
  commands() {
    const ready = this.items.length > 0;
    this.bar.update("play", { disabled: !ready, ...this.playing ? { label: this.t("Sz\xFCnet"), icon: "blade-icon blade-icon--pause" } : { label: this.t("Lej\xE1tsz\xE1s"), icon: "blade-icon blade-icon--play" } });
    for (const id of ["rewind", "previous", "next"]) this.bar.update(id, { disabled: !ready });
    this.bar.update("position", { label: this.positionText() });
  }
  /** Moves the stage to the clock: media within 1 s (`hard`: exactly), a scene only on `hard` (it runs its own clock). */
  align(stage, hard) {
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
  label(stage) {
    if (this.stage !== stage) return;
    const t = this.t, item = stage.item, index = item ? this.items.indexOf(item) : -1;
    const title = item ? this.options.caption?.(item, index, this.items.length) ?? `${index + 1} / ${this.items.length} \xB7 ${item.title}` : "";
    let text = stage.message ?? "", attributes = "";
    if (item?.kind === "scene" && stage.status) {
      const state = stage.state;
      if (stage.status === "error") text = t("A jelenet hib\xE1t jelzett: {message}", { message: stage.message ?? "" });
      else if (stage.status === "loading" || !state) text = t("A jelenet bet\xF6lt\xE9se\u2026");
      else text = t("Jelenet: {time} / {length} mp", { time: this.tenths.format(state.time % state.duration), length: this.tenths.format(state.duration) });
      attributes = ` data-demo-scene-state="${stage.status}"` + (state ? ` data-demo-scene-time="${state.time.toFixed(1)}" data-demo-scene-playing="${state.playing}"` : "");
    }
    this.caption.dataset.demoStage = item?.kind ?? "empty";
    if (item) this.caption.dataset.demoIndex = String(index);
    else delete this.caption.dataset.demoIndex;
    this.caption.innerHTML = `<span class="demo-playlist-caption__title">${escape(title)}</span><span class="demo-playlist-caption__state${stage.status === "error" || stage.message && item?.kind !== "scene" ? " demo-playlist-caption__state--error" : ""}"${attributes}>${escape(text)}</span>`;
  }
  /** The scene code through `signage_playlist.scene`, once per `show` (a new list fetches it again). */
  sceneCode(asset, signal) {
    let pending = this.codes.get(asset);
    if (!pending) {
      const fetched = this.options.app.server.call("signage_playlist", "scene", { values: { asset }, signal: this.options.signal }).then((answer) => {
        if (typeof answer?.code !== "string") throw new TypeError(this.t("A jelenet nem \xE9rkezett meg."));
        return answer.code;
      });
      this.codes.set(asset, pending = fetched);
      fetched.catch(() => {
        if (this.codes.get(asset) === fetched) this.codes.delete(asset);
      });
    }
    return signal.aborted ? Promise.reject(new DOMException("closed", "AbortError")) : pending;
  }
  /** A scene item: the frame at once, then its code; errors arrive through the frame's `error` event. */
  async scene(stage) {
    const item = stage.item, signal = stage.controller.signal, t = this.t;
    const frame = stage.frame = new this.options.app.components.SandboxFrame({ signal, title: t("Jelenet: {title}", { title: item.title }), readyTimeout: SCENE_READY });
    frame.mount(stage.element);
    stage.status = "loading";
    frame.on("message", ({ type, payload }) => {
      const state = type === "scene.state" ? sceneState(payload) : void 0;
      if (state && stage.status !== "error") {
        stage.state = state;
        this.label(stage);
      }
    });
    frame.on("error", ({ message }) => {
      stage.status = "error";
      stage.message = message;
      this.label(stage);
    });
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
      if (signal.aborted || error?.name === "AbortError" || stage.status === "error") return;
      stage.status = "error";
      stage.message = error instanceof Error ? error.message : String(error);
      this.label(stage);
    }
  }
  /**
   * Shows `item`: a new layer in the screen with its MediaPlayer, SandboxFrame or notice, entering with the item's
   * transition (`animate`) over the previous layer, which leaves and is released after it.
   */
  enter(item, animate) {
    const t = this.t, previous = this.stage, controller = new AbortController(), signal = controller.signal;
    this.options.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    const type = item?.transition?.type ?? "none", ms = animate && type !== "none" ? Math.max(0, item?.transition?.ms ?? 0) : 0;
    const element = document.createElement("div");
    element.className = `demo-player__layer demo-player__layer--${escape(type)}${ms ? " demo-player__layer--from" : ""}`;
    element.style.setProperty("--player-ms", `${ms}ms`);
    if (item) element.dataset.demoKey = item.key;
    const stage = this.stage = { controller, item, element, ready: false, status: "" };
    this.screen.append(element);
    const notice = (text) => element.insertAdjacentHTML("beforeend", `<div class="demo-playlist-message">${escape(text)}</div>`);
    if (!item) notice(this.notice || (this.loaded ? t("Nincs tartalom") : t("Bet\xF6lt\xE9s\u2026")));
    else if ((item.kind === "image" || item.kind === "video" || item.kind === "audio") && item.file) {
      const player = stage.player = new this.options.app.components.MediaPlayer({
        source: { resource: this.options.files, action: "content_stream", id: item.file.id, ...item.file.revision ? { version: item.file.revision } : {} },
        mime: item.file.mime_type,
        name: item.title,
        toolbar: false,
        controls: false,
        loop: true,
        muted: !!this.options.muted,
        signal
      });
      player.on("loaded", () => {
        stage.ready = true;
        this.align(stage, true);
        if (this.playing && this.stage === stage) void player.play().catch(() => {
        });
      });
      player.on("error", ({ message }) => {
        stage.message = message;
        this.label(stage);
      });
      player.mount(element);
    } else if (item.kind === "scene" && item.asset && this.options.scenes) void this.scene(stage);
    else notice(item.kind === "scene" ? t("A jelenet lej\xE1tsz\xE1sa nem enged\xE9lyezett.") : item.kind === "none" ? t("Nincs tartalom") : t("Ez a tartalomt\xEDpus nem j\xE1tszhat\xF3 le."));
    if (ms) requestAnimationFrame(() => requestAnimationFrame(() => element.classList.remove("demo-player__layer--from")));
    signal.addEventListener("abort", () => element.remove(), { once: true });
    if (previous) {
      previous.element.style.setProperty("--player-ms", `${ms}ms`);
      previous.element.classList.add("demo-player__layer--leave", `demo-player__layer--${type}`);
      setTimeout(() => previous.controller.abort(), ms + 50);
    }
    this.label(stage);
  }
  /** Playhead, current item and scroll of the strip, once per animation frame. */
  paintStrip() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const root = this.strip, at = this.now(), index = this.indexAt(at), item = this.items[index];
      root.dataset.demoPosition = at.toFixed(1);
      root.querySelectorAll("[data-demo-item]").forEach((button) => {
        if (Number(button.dataset.demoItem) === index) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      const slot = item && root.querySelector(`[data-demo-item="${index}"]`)?.parentElement;
      const head = root.querySelector(".demo-playlist-playhead");
      if (!item || !slot || !head) return;
      const left = slot.offsetLeft + slot.offsetWidth * Math.min(1, Math.max(0, (at - this.offsets[index]) / item.seconds));
      head.style.left = `${left}px`;
      if (left < root.scrollLeft || left > root.scrollLeft + root.clientWidth) root.scrollLeft = Math.max(0, left - root.clientWidth / 3);
    });
  }
  /** The strip of the current items, then the stage at the clock. */
  paint() {
    const t = this.t;
    if (!this.items.length) this.strip.innerHTML = `<p class="demo-playlist-note">${escape(this.notice || (this.loaded ? t("Nincs tartalom") : t("Bet\xF6lt\xE9s\u2026")))}</p>`;
    else this.strip.innerHTML = `<div class="demo-playlist-track"><ol class="demo-playlist-items" aria-label="${escape(t("Id\u0151vonal"))}">${this.items.map((item, index) => {
      const length = t("{seconds} mp", { seconds: item.seconds });
      const label = `${item.time ? `${item.time}: ` : ""}${[item.title, item.meta, length].filter(Boolean).join(", ")}${item.list ? ` (${t("Lej\xE1tsz\xE1si lista: {title}", { title: item.list })})` : ""}`;
      return `<li class="demo-playlist-slot" style="flex-grow:${item.seconds}"><button type="button" class="demo-playlist-item demo-playlist-item--${item.kind}${item.list ? " demo-playlist-item--list" : ""}" data-demo-item="${index}" data-demo-key="${escape(item.key)}" data-demo-kind="${item.kind}" data-demo-seconds="${item.seconds}"${item.list ? ` data-demo-list="${escape(item.list)}"` : ""} aria-label="${escape(label)}"><span class="demo-playlist-item__time">${escape(item.time ?? clock2(item.seconds))}</span><span class="demo-playlist-item__title">${escape(item.title)}</span><span class="demo-playlist-item__meta">${escape([item.meta, length, item.list ? t("Lej\xE1tsz\xE1si lista: {title}", { title: item.list }) : ""].filter(Boolean).join(" \xB7 "))}</span></button></li>`;
    }).join("")}</ol><span class="demo-playlist-playhead" aria-hidden="true"></span></div>`;
    this.commands();
    this.sync(true, false);
  }
};

// examples/demo-app/frontend/src/playlist.ts
var KIND2 = "demo.playlist-preview";
var GAP = 3;
var LONGEST = 3600;
var DATE = /^\d{4}-\d{2}-\d{2}$/;
var pad2 = (value) => String(value).padStart(2, "0");
function today() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
function calendarDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) return void 0;
  const date = /* @__PURE__ */ new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : void 0;
}
function shift(date, days) {
  const next = /* @__PURE__ */ new Date(date + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function itemsOf(answer, kinds) {
  const slots = Array.isArray(answer?.timeline) ? answer.timeline : [];
  return slots.flatMap((slot, slotIndex) => {
    const playlist2 = slot && typeof slot.playlist === "object" && slot.playlist !== null && Array.isArray(slot.playlist.items) && slot.playlist.items.length ? slot.playlist : null;
    const entries = playlist2 ? playlist2.items.map((asset) => ({ asset: typeof asset === "object" && asset !== null ? asset : null, list: String(playlist2.title ?? "") })) : [{ asset: slot && typeof slot.asset === "object" && slot.asset !== null ? slot.asset : null, list: void 0 }];
    return entries.map(({ asset, list }, index) => {
      const mime = typeof asset?.file?.mime_type === "string" ? asset.file.mime_type : "";
      const kind = !asset ? "none" : asset.kind === "scene" ? "scene" : (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio") && mime.startsWith(asset.kind + "/") && typeof asset.file?.id === "string" ? asset.kind : "other";
      const transition = asset?.transition && typeof asset.transition.type === "string" ? { type: asset.transition.type, ms: Number(asset.transition.ms) || 0 } : void 0;
      return {
        key: `${slotIndex}.${index}`,
        kind,
        title: String((list !== void 0 ? asset?.title : slot?.title) ?? asset?.title ?? "") || kinds[kind],
        seconds: asset ? Math.min(LONGEST, Math.max(1, Math.round(Number(asset.duration) || 0))) : GAP,
        file: asset?.file && kind !== "scene" ? { id: asset.file.id, mime_type: asset.file.mime_type } : null,
        asset: asset?.id,
        ...transition ? { transition } : {},
        time: `${slot.start}\u2013${slot.end}`,
        meta: kinds[kind],
        ...list !== void 0 ? { list } : {}
      };
    });
  });
}
function preview(app, host, view) {
  const t = (key, params) => app.i18n.t(key, params);
  if (!view.actions.some((action) => action.name === "day")) throw new Error(t("A napi m\u0171sor nem k\xE9rhet\u0151 le."));
  if (!view.options?.layout) throw new Error(t("A n\xE9zet elrendez\xE9se hi\xE1nyzik."));
  const kinds = { image: t("K\xE9p"), video: t("Vide\xF3"), audio: t("Hang"), scene: t("Jelenet"), none: t("Nincs tartalom"), other: t("Egy\xE9b tartalom") };
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  let day = calendarDate(host.filters.date) ?? today(), asking;
  const page2 = new app.components.PageLayout({ id: view.id, tree: view.options.layout });
  host.attach(page2);
  const bar = new app.components.CommandBar({ signal, items: [
    { id: "previous-day", label: t("El\u0151z\u0151 nap"), icon: "dxi dxi-arrow-left" },
    { id: "day", label: day, disabled: true },
    { id: "next-day", label: t("K\xF6vetkez\u0151 nap"), icon: "dxi dxi-arrow-right" },
    { id: "today", label: t("Ma"), icon: "dxi dxi-calendar-today" },
    { id: "pick", label: t("Napt\xE1r\u2026"), icon: "dxi dxi-calendar-today" }
  ] });
  bar.mount(page2.cell("commands"));
  const player = new Player({
    app,
    signal,
    files: typeof view.options.media === "string" && view.options.media ? view.options.media : "files",
    scenes: view.actions.some((action) => action.name === "scene"),
    caption: (item) => [item.time, item.list !== void 0 ? t("Lej\xE1tsz\xE1si lista: {title}", { title: item.list }) : "", item.title, item.meta].filter(Boolean).join(" \xB7 ")
  });
  page2.attach("player", player.element);
  const shown = (answer) => {
    const label = `${day}${typeof answer?.weekday_name === "string" ? ` \xB7 ${answer.weekday_name}` : ""}`;
    bar.update("day", { label });
    host.setTitle(`${view.title}: ${label}`);
    player.show(itemsOf(answer, kinds));
  };
  const choose = async (date) => {
    day = date;
    asking?.abort();
    const request = asking = new AbortController();
    signal.addEventListener("abort", () => request.abort(), { once: true, signal: request.signal });
    bar.update("day", { label: day });
    player.wait(t("Bet\xF6lt\xE9s\u2026"));
    try {
      const answer = await app.server.call(view.resource, "day", { values: { date: day }, signal: request.signal });
      if (!request.signal.aborted) shown(answer);
    } catch (error) {
      if (request.signal.aborted || error?.name === "AbortError") return;
      player.wait(error instanceof Error ? error.message : String(error));
    }
  };
  const pick = () => {
    const win = app.ui.window({ title: t("Nap v\xE1laszt\xE1sa"), width: 360, signal });
    const form = new app.components.RecordForm({ resource: view.resource, action: "day", values: { date: day }, signal: win.signal });
    form.on("saved", ({ result }) => {
      const answer = result, date = calendarDate(answer?.date);
      win.close();
      if (!date) return;
      asking?.abort();
      day = date;
      shown(answer);
    });
    form.on("cancelled", () => win.close());
    form.mount(win);
  };
  bar.on("click", ({ id }) => {
    if (id === "previous-day" || id === "next-day") void choose(shift(day, id === "next-day" ? 1 : -1));
    else if (id === "today") void choose(today());
    else if (id === "pick") pick();
  }, { signal });
  signal.addEventListener("abort", () => page2.destroy(), { once: true });
  void choose(day);
  return { destroy: () => controller.abort() };
}
var playlist = (app) => {
  app.kinds.register(KIND2, { create: (host, view) => preview(app, host, view) });
};
var playlist_default = playlist;

// examples/demo-app/frontend/src/readings.ts
var KIND3 = "demo.readings-dashboard";
var BAR = "demo.reading-bar";
var SCALE = 100;
var NARROW = "(max-width: 767px)";
var escape2 = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var numeric = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
};
var formatter = (locale, options) => {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    return new Intl.NumberFormat(void 0, options);
  }
};
function readingBar(app) {
  const number = formatter(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    render(value, _row, _column, size, escape3) {
      const reading = numeric(value);
      if (reading === null) return escape3(value);
      const width = Math.round(Math.min(SCALE, Math.max(0, reading)) / SCALE * 1e3) / 10;
      const text = app.i18n.t("{value} a 100-b\xF3l", { value: number.format(reading) });
      return `<span class="demo-reading-bar demo-reading-bar--${size === "card" || size === "tile" ? size : "cell"}" title="${escape3(text)}"><span class="demo-reading-bar__track" aria-hidden="true"><span class="demo-reading-bar__fill" style="width:${width}%"></span></span><span class="demo-reading-bar__value">${escape3(number.format(reading))}</span></span>`;
    },
    text: (value) => {
      const reading = numeric(value);
      return reading === null ? String(value ?? "") : app.i18n.t("{value} a 100-b\xF3l", { value: number.format(reading) });
    }
  };
}
function dashboardOptions(view) {
  const o = view.options ?? {};
  const name = (value) => typeof value === "string" && /^[a-z][a-z0-9_.-]*$/.test(value);
  if (!name(o.list) || !name(o.value) || !name(o.name) || typeof o.max !== "number" || !(o.max > 0) || !Number.isInteger(o.buckets) || o.buckets < 2 || o.buckets > 20)
    throw new TypeError(`61ade feature demo: the options of view "${view.id}" need list, value, name, max > 0 and 2\u201320 buckets.`);
  return o;
}
function summarize(rows, options, matched) {
  const bins = new Array(options.buckets).fill(0);
  let count = 0, sum = 0, min = Infinity, max = -Infinity;
  for (const row of rows) {
    const value = numeric(row[options.value]);
    if (value === null) continue;
    count++;
    sum += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
    bins[bin(value, options)]++;
  }
  return { loaded: rows.length, ...matched !== void 0 ? { matched } : {}, ...count ? { min, max, average: sum / count } : {}, bins };
}
var bin = (value, options) => Math.min(options.buckets - 1, Math.max(0, Math.floor(value / options.max * options.buckets)));
function themeColor(variable, fallback) {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable}, ${fallback})`;
  probe.hidden = true;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color || fallback;
}
function dashboard(app, host, view) {
  const options = dashboardOptions(view);
  const source = app.viewDefinition(options.list);
  if (!source || source.kind !== "list") throw new TypeError(`61ade feature demo: "${options.list}" is not an offered list view.`);
  const listView = { ...source, id: view.id };
  const t = (key, params) => app.i18n.t(key, params), locale = app.i18n.locale();
  const decimal = formatter(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const whole = formatter(locale, { maximumFractionDigits: 0 });
  const signed = formatter(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const step = options.max / options.buckets;
  const ranges = Array.from({ length: options.buckets }, (_, index) => `${whole.format(index * step)}\u2013${whole.format((index + 1) * step)}`);
  const narrow = matchMedia(NARROW);
  let session, list, closed = false;
  let presets = { ...host.filters };
  const build = () => {
    session?.abort();
    const controller = session = new AbortController(), signal = controller.signal;
    const compact = narrow.matches;
    const summaryHeader = compact ? {} : { header: t("\xD6sszes\xEDt\xE9s") };
    const overview = compact ? { type: "space", height: 324, rows: [{ id: "summary", height: 104 }, { id: "chart", header: t("\xC9rt\xE9keloszl\xE1s") }] } : { type: "space", height: 260, cols: [{ id: "summary", width: 340, ...summaryHeader }, { id: "chart", header: t("\xC9rt\xE9keloszl\xE1s") }] };
    const layout = new app.dhx.Layout(null, { type: "none", css: "demo-readings", rows: [overview, { id: "list" }] });
    let rows = [], matched, selected;
    const colors = () => ({ rows: themeColor("--dhx-color-primary", "#0288d1"), selected: themeColor("--dhx-color-success", "#2e7d32") });
    const chartConfig = (palette) => ({
      type: "bar",
      css: "demo-readings-chart",
      scales: { bottom: { text: "range" }, left: { min: 0, maxTicks: 5 } },
      // `text` names the series in the legend (Suite Chart; not in its typings).
      series: [
        { id: "rows", type: "bar", value: "rows", text: t("Sorok"), fill: palette.rows, color: palette.rows, stacked: true },
        { id: "selected", type: "bar", value: "selected", text: t("Kiv\xE1lasztott sor"), fill: palette.selected, color: palette.selected, stacked: true }
      ],
      legend: { series: ["rows", "selected"], halign: "right", valign: "top" }
    });
    host.attach(layout);
    const chart = new app.dhx.Chart(null, chartConfig(colors()));
    layout.getCell("chart").attach(chart);
    const render = () => {
      const summary = summarize(rows, options, matched);
      const mark = selected ? numeric(selected[options.value]) : null;
      const markBin = mark === null ? -1 : bin(mark, options);
      chart.data.parse(ranges.map((range, index) => ({ id: String(index), range, rows: summary.bins[index] - (index === markBin ? 1 : 0), selected: index === markBin ? 1 : 0 })));
      const value = (number) => number === void 0 ? "\u2014" : decimal.format(number);
      const count = summary.matched === void 0 ? whole.format(summary.loaded) : `${whole.format(summary.loaded)} / ${whole.format(summary.matched)}`;
      const choice = selected ? `${String(selected[options.name] ?? selected.id)}: ${mark === null ? "\u2014" : decimal.format(mark)}${mark !== null && summary.average !== void 0 ? ` (${t("\xE1tlagt\xF3l {delta}", { delta: signed.format(mark - summary.average) })})` : ""}` : t("Nincs kiv\xE1lasztott sor");
      const stat = (id, label, text, wide = false) => `<div class="demo-readings-stat${wide ? " demo-readings-stat--wide" : ""}" data-demo-stat="${id}"><dt>${escape2(label)}</dt><dd title="${escape2(text)}">${escape2(text)}</dd></div>`;
      const distribution = t("\xC9rt\xE9keloszl\xE1s: {bins}", { bins: ranges.map((range, index) => t("{range}: {count} sor", { range, count: summary.bins[index] })).join("; ") }) + (markBin < 0 ? "" : ". " + t("Kiv\xE1lasztott sor: {range}", { range: ranges[markBin] }));
      layout.getCell("summary").attachHTML(`<div class="demo-readings-summary${compact ? " demo-readings-summary--narrow" : ""}" data-demo-readings="summary"><dl class="demo-readings-stats">${stat("count", t("Bet\xF6lt\xF6tt sorok"), count)}${stat("min", t("Minimum"), value(summary.min))}${stat("max", t("Maximum"), value(summary.max))}${stat("average", t("\xC1tlag"), value(summary.average))}${stat("selected", t("Kiv\xE1lasztott"), choice, true)}</dl><p class="demo-readings-hidden" data-demo-distribution data-demo-selected-bin="${markBin}">${escape2(distribution)}</p></div>`);
    };
    app.theme.onChange(() => {
      chart.setConfig(chartConfig(colors()));
      render();
    }, { signal });
    let current;
    signal.addEventListener("abort", () => {
      current?.destroy();
      layout.getCell("chart").detach();
      chart.destructor();
      layout.destructor();
      if (list === current) list = void 0;
    }, { once: true });
    current = list = new app.components.ListView({ view: listView, filters: presets, signal });
    presets = {};
    current.on("changed", (event) => {
      rows = event.rows;
      matched = event.matched;
      if (selected && !rows.some((row) => String(row.id) === String(selected.id))) selected = void 0;
      render();
    });
    current.on("select", ({ row }) => {
      selected = row;
      render();
    });
    current.mount(layout.getCell("list"));
    render();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    session?.abort();
  };
  narrow.addEventListener("change", () => {
    if (!closed) build();
  }, { signal: host.signal });
  host.signal.addEventListener("abort", close, { once: true });
  try {
    build();
  } catch (error) {
    close();
    throw error;
  }
  return { destroy: close, editing: () => list?.editing() ?? false, refresh: () => list?.refresh() };
}
var readings = (app) => {
  app.presentations.register(BAR, readingBar(app));
  app.kinds.register(KIND3, { create: (host, view) => dashboard(app, host, view) });
};
var readings_default = readings;

// examples/demo-app/frontend/src/tasks.ts
var TOP = 5;
var COPY_LIMIT = 50;
var starId = (n) => "star" + n;
var pressed = (n) => Object.fromEntries(Array.from({ length: TOP }, (_, index) => [starId(index + 1), index < n]));
var translate = (key) => key;
var stripName = (field) => translate("{field} \u2014 csillagok", { field: field.label });
function level(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  return /^[0-5]$/.test(text) ? Number(text) : null;
}
function stars(app, value, size, escape3) {
  const n = level(value);
  if (n === null) return escape3(value);
  const label = escape3(app.i18n.t("{value} / {max} csillag", { value: n, max: TOP }));
  return `<span class="demo-rating demo-rating--${escape3(size)}" role="img" aria-label="${label}" title="${label}" style="letter-spacing:1px;white-space:nowrap">${"\u2605".repeat(n)}<span style="opacity:.4">${"\u2606".repeat(TOP - n)}</span></span>`;
}
function bindStars({ form, field, signal }) {
  const input = form.getItem(field.name);
  const group = form.getItem(stripName(field));
  if (typeof input?.setValue !== "function" || typeof group?.isSelected !== "function") return;
  let rating = level(input.getValue()) ?? 0, painting = false;
  const paint = (value) => {
    rating = level(value) ?? 0;
    painting = true;
    try {
      group.setValue(pressed(rating));
    } finally {
      painting = false;
    }
  };
  const chosen = () => {
    if (painting) return;
    const state = group.isSelected();
    const star = Array.from({ length: TOP }, (_, index) => index + 1).find((n) => !!state[starId(n)] !== n <= rating);
    if (star === void 0) return;
    const next = String(star === rating ? 0 : star);
    input.setValue(next);
    input.setValue(next);
    rating = Number(next);
    queueMicrotask(() => {
      if (!signal.aborted) paint(next);
    });
  };
  const owner = {};
  input.events.on("input", paint, owner);
  input.events.on("change", paint, owner);
  group.events.on("change", chosen, owner);
  signal.addEventListener("abort", () => {
    input.events.detach("input", owner);
    input.events.detach("change", owner);
    group.events.detach("change", owner);
  }, { once: true });
  paint(input.getValue());
}
function valueText(column, value) {
  if (value === null || value === void 0 || value === "") return "\u2014";
  if (column.editor === "demo.rating") {
    const n = level(value);
    return n === null ? String(value) : `${n} / ${TOP}`;
  }
  const options = column.options ?? {};
  if (column.type === "multiselect") return String(value).split(",").filter(Boolean).map((item) => options[item] ?? item).join(", ");
  return options[String(value)] ?? String(value);
}
function recordText(view, row) {
  const options = view.options ?? {};
  const columns = options.detailFields?.length ? options.detailFields : options.columns ?? [];
  const known = columns.length ? columns : Object.keys(row).filter((key) => !key.startsWith("_") && key !== "revision").map((id) => ({ id, header: id }));
  return known.filter((column) => Object.hasOwn(row, column.id)).map((column) => `${column.header}: ${valueText(column, row[column.id])}`).join("\n");
}
var tasks = (app) => {
  translate = (key, params) => app.i18n.t(key, params);
  app.fieldTypes.register("demo.rating", {
    input: (field, value, readOnly) => ({
      css: "demo-rating-field",
      rows: [
        {
          type: "input",
          name: field.name,
          label: field.label,
          labelPosition: "top",
          inputType: "number",
          min: 0,
          max: TOP,
          step: 1,
          required: !readOnly && field.required,
          readOnly,
          value: String(value ?? field.defaultValue ?? "")
        },
        {
          type: "togglegroup",
          name: stripName(field),
          css: "demo-rating-stars",
          multiselection: true,
          gap: 4,
          hidden: readOnly,
          options: Array.from({ length: TOP }, (_, index) => ({ id: starId(index + 1), text: "\u2605", offText: "\u2606" })),
          value: pressed(level(value ?? field.defaultValue) ?? 0)
        }
      ]
    }),
    bind: bindStars,
    display: (value, _row, _field, size, escape3) => stars(app, value, size, escape3)
  });
  app.commands.register("demo.copy-text", {
    label: "M\xE1sol\xE1s sz\xF6vegk\xE9nt",
    icon: "dxi dxi-copy",
    placement: "record",
    // The cursor record, or every marked task when there are marks.
    enabled: ({ row, rows }) => !!row || rows.length > 0,
    run: async ({ app: app2, view, row, rows, signal }) => {
      const targets = rows.length ? rows : row ? [row] : [];
      if (!targets.length || !view.resource) return;
      if (targets.length > COPY_LIMIT) throw new Error(app2.i18n.t("Egyszerre legfeljebb {count} feladat m\xE1solhat\xF3.", { count: COPY_LIMIT }));
      const texts = [];
      for (const target of targets) texts.push(recordText(view, await app2.server.call(view.resource, "get", { id: String(target.id), signal })));
      const text = texts.join("\n\n");
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : void 0;
      if (typeof clipboard?.writeText !== "function") throw new Error(app2.i18n.t("A v\xE1g\xF3lap nem \xE9rhet\u0151 el. M\xE1sold ki k\xE9zzel:") + "\n\n" + text);
      try {
        await clipboard.writeText(text);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(app2.i18n.t("A v\xE1g\xF3lapra \xEDr\xE1s nem siker\xFClt. M\xE1sold ki k\xE9zzel:") + "\n\n" + text);
      }
      app2.ui.toast(app2.i18n.t("V\xE1g\xF3lapra m\xE1solva: {count} feladat.", { count: targets.length }));
    }
  });
};
var tasks_default = tasks;

// examples/demo-app/frontend/src/playlist-editor.ts
var KIND4 = "demo.playlist-editor";
var PLAYING = "dxi dxi-check";
var LIBRARY_COLUMNS = ["file_id", "title", "media_type", "media_length", "duration"];
function editor(app, host, view) {
  const t = (key, params) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A szerkeszt\u0151 egy lej\xE1tsz\xE1si list\xE1hoz ny\xEDlik meg."));
  const playlist2 = String(host.record.id), listView = view.options?.list ?? host.record.resource;
  const lists = app.viewDefinition(listView);
  const itemsView = lists?.options.subview?.view;
  const library = app.viewDefinition(view.options?.library ?? "signage_assets");
  if (!lists || !itemsView || !view.options?.layout) throw new Error(t("A lej\xE1tsz\xE1si lista elemei nem \xE9rhet\u0151k el."));
  const files = library?.options.columns.find((column) => column.media)?.media ?? "files";
  const titles = itemsView.options.columns.find((column) => column.id === "asset_id")?.options ?? {};
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  host.setTitle(`${view.title}: ${String(host.record.row.title ?? playlist2)}`);
  let settings = { transition: String(host.record.row.transition ?? "fade"), transition_ms: Number(host.record.row.transition_ms ?? 600) };
  let rows = [];
  const page2 = new app.components.PageLayout({
    id: view.id,
    tree: view.options.layout,
    guard: ({ from }) => from !== "settings" || !settingsForm?.dirty() || app.ui.dialog({
      mode: "confirm",
      severity: "warning",
      title: t("Nem mentett m\xF3dos\xEDt\xE1sok"),
      message: t("A lista be\xE1ll\xEDt\xE1sainak nem mentett m\xF3dos\xEDt\xE1sai elvesznek."),
      confirmLabel: t("Elvet\xE9s")
    })
  });
  host.attach(page2);
  const bar = new app.components.CommandBar({ signal, items: [{ id: "back", label: t("Vissza a list\xE1hoz"), icon: "dxi dxi-arrow-left" }] });
  bar.on("click", ({ id }) => {
    if (id === "back" && !app.navigate({ view: listView })) host.close();
  });
  bar.mount(page2.cell("commands"));
  const source = library ? new app.components.ListView({ signal, dragSource: true, panel: false, showId: false, mode: "tiles", view: {
    ...library,
    id: `${view.id}.library`,
    actions: library.actions.filter((action) => action.name === "get"),
    options: {
      ...library.options,
      rowNumbers: false,
      search: void 0,
      commands: void 0,
      activate: void 0,
      subview: void 0,
      columns: library.options.columns.filter((column) => LIBRARY_COLUMNS.includes(column.id)).map((column) => ({ ...column, editable: false }))
    }
  } }) : void 0;
  source?.mount(page2.cell("library"));
  const list = new app.components.ListView({ showId: false, view: itemsView, scope: { field: itemsView.options.subview?.field ?? "playlist_id", id: playlist2 }, signal });
  list.mount(page2.cell("items"));
  const details = new app.components.RecordDetails({ view: listView, record: host.record.row, showId: false, signal });
  details.mount(page2.cell("details"));
  const editable = view.actions.some((action) => action.name === "update");
  const createSettings = () => {
    if (!editable) return void 0;
    const form = new app.components.RecordForm({ resource: host.record.resource, action: "update", id: playlist2 });
    form.mount(page2.cell("settings"));
    form.on("saved", () => void reload().then(show), { signal });
    return form;
  };
  let settingsForm = createSettings();
  page2.tabsOf("settings")?.on("change", ({ id, previous }) => {
    if (previous === "settings" && settingsForm?.dirty()) {
      settingsForm.destroy();
      settingsForm = void 0;
    }
    if (id === "settings" && !settingsForm) settingsForm = createSettings();
  }, { signal });
  const reload = async () => {
    try {
      const row = await app.server.call(host.record.resource, "get", { id: playlist2, signal });
      settings = { transition: String(row.transition ?? "fade"), transition_ms: Number(row.transition_ms ?? 600) };
      host.setTitle(`${view.title}: ${String(row.title ?? playlist2)}`);
      await details.show(row);
    } catch {
    }
  };
  const preview2 = new Player({ app, signal, files, loop: true, muted: true, scenes: true });
  page2.attach("preview", preview2.element);
  const show = () => preview2.show(rows.filter((row) => row.status === PLAYING && Number(row.length) > 0).map((row) => {
    const asset = String(row.asset_id ?? ""), media = row._media?.file_id ?? null;
    const scene = media?.mime_type.toLowerCase() === SCENE_TYPE, kind = media?.mime_type.split("/")[0];
    return {
      key: String(row.id),
      title: titles[asset] ?? asset,
      seconds: Number(row.length),
      asset,
      kind: scene ? "scene" : kind === "image" || kind === "video" || kind === "audio" ? kind : media ? "other" : "none",
      file: media && !scene ? { id: media.id, mime_type: media.mime_type, revision: media.revision } : null,
      transition: { type: String(row.transition || settings.transition || "fade"), ms: settings.transition_ms }
    };
  }), true);
  list.on("changed", (event) => {
    rows = event.rows;
    show();
    void details.show(playlist2).catch(() => {
    });
  }, { signal });
  signal.addEventListener("abort", () => {
    settingsForm?.destroy();
    page2.destroy();
  }, { once: true });
  return {
    destroy: () => controller.abort(),
    // Unsaved input in the items list (a form or cell editor) or in the settings form.
    editing: () => list.editing() || !!settingsForm?.dirty()
  };
}
var playlistEditor = (app) => {
  app.kinds.register(KIND4, { create: (host, view) => editor(app, host, view) });
  app.commands.register("demo.edit-playlist", {
    label: "Lista szerkeszt\xE9se",
    icon: "dxi dxi-pencil",
    placement: "record",
    enabled: ({ row, rows }) => rows.length <= 1 && !!row && !!app.viewDefinition(KIND4),
    run: ({ app: app2, row }) => {
      if (row) app2.navigate({ view: KIND4, record: String(row.id) });
    }
  });
};
var playlist_editor_default = playlistEditor;

// examples/demo-app/frontend/src/task-page.ts
var KIND5 = "demo.task-page";
var PHONE2 = "(max-width: 767px)";
var COLORS = { ink: "", blue: "#1f6feb", red: "#d1242f" };
function sketchPad(label, signal) {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;background:var(--dhx-background-primary)";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  canvas.dataset.demoSketch = "";
  const strokes = [], pen = { color: "ink", width: 3 }, listeners = /* @__PURE__ */ new Set();
  let frame = 0, current;
  const paint = () => {
    frame = 0;
    const { width, height } = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1;
    if (!width || !height) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = context.lineJoin = "round";
    const ink = getComputedStyle(canvas).color;
    for (const stroke of strokes) {
      context.strokeStyle = COLORS[stroke.color] || ink;
      context.lineWidth = stroke.width;
      context.beginPath();
      stroke.points.forEach(([x, y], n) => n ? context.lineTo(x * width, y * height) : context.moveTo(x * width, y * height));
      if (stroke.points.length === 1) context.lineTo(stroke.points[0][0] * width, stroke.points[0][1] * height);
      context.stroke();
    }
  };
  const changed = () => {
    if (!frame) frame = requestAnimationFrame(paint);
    for (const listener of listeners) listener();
  };
  const point = (event) => {
    const box = canvas.getBoundingClientRect();
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height];
  };
  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
    strokes.push(current = { color: pen.color, width: pen.width, points: [point(event)] });
    changed();
  }, { signal });
  canvas.addEventListener("pointermove", (event) => {
    if (current) {
      current.points.push(point(event));
      changed();
    }
  }, { signal });
  for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, () => {
    current = void 0;
  }, { signal });
  canvas.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && strokes.length) {
      event.preventDefault();
      strokes.pop();
      changed();
    }
  }, { signal });
  const resize = new ResizeObserver(() => {
    if (!frame) frame = requestAnimationFrame(paint);
  });
  resize.observe(canvas);
  signal.addEventListener("abort", () => {
    resize.disconnect();
    cancelAnimationFrame(frame);
  }, { once: true });
  return {
    element: canvas,
    pen,
    count: () => strokes.length,
    undo: () => {
      if (strokes.pop()) changed();
    },
    clear: () => {
      strokes.length = 0;
      changed();
    },
    /** Called after every change of the strokes (the bars' enabled state). */
    onChange: (listener, options) => {
      listeners.add(listener);
      options.signal.addEventListener("abort", () => listeners.delete(listener), { once: true });
    }
  };
}
function page(app, host, view) {
  const t = (key, params) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A feladatlap egy feladathoz ny\xEDlik meg."));
  const row = host.record.row, task = String(host.record.id);
  const list = app.viewDefinition(view.options?.details ?? host.record.resource);
  const notes = view.options?.notes ? app.viewDefinition(view.options.notes) : void 0;
  const editable = !!list?.actions.some((action) => action.name === "update") && (!Array.isArray(row._actions) || row._actions.includes("update"));
  const phone = matchMedia(PHONE2);
  let build;
  const sketch = sketchPad(t("V\xE1zlat"), host.signal);
  host.setTitle(`${view.title}: ${String(row.title ?? task)}`);
  const root = document.createElement("div");
  root.style.cssText = "width:100%;height:100%";
  host.attach(root);
  const render = () => {
    if (host.signal.aborted) return;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    previous?.abort();
    const control = { id: "control", header: t("Feladat"), collapsable: true };
    const tabs = { tabs: [...notes ? [{ id: "work", header: t("Munka") }] : [], { id: "notes", header: t("Jegyzetek") }, { id: "sketch", header: t("V\xE1zlat") }] };
    const layout = new app.components.PageLayout({
      id: `${view.id}.${phone.matches ? "narrow" : "wide"}`,
      tree: phone.matches ? { rows: [{ ...tabs, minHeight: 240 }, { ...control, height: 320, minHeight: 120, resizable: true }] } : { cols: [{ ...control, width: 360, minWidth: 260, resizable: true }, { ...tabs, minWidth: 320 }] }
    });
    layout.mount(root);
    const sections = new app.components.Accordion({ id: `${view.id}.control`, sections: [
      { id: "details", label: t("Adatok") },
      { id: "edit", label: t("Szerkeszt\xE9s"), disabled: !editable }
    ], open: ["details"] });
    layout.attach("control", sections);
    const details = list ? new app.components.RecordDetails({ view: list, record: row, signal, showId: false }) : void 0;
    details?.mount(sections.cell("details"));
    let form;
    const edit = () => {
      if (form || signal.aborted) return;
      form = new app.components.RecordForm({ resource: host.record.resource, action: "update", id: task, cancel: false });
      form.on("saved", () => {
        const title = form?.values().title;
        if (typeof title === "string" && title.trim()) host.setTitle(`${view.title}: ${title}`);
        void details?.show(task).catch(() => {
        });
      });
      form.mount(sections.cell("edit"));
    };
    sections.on("toggle", ({ id, open }) => {
      if (open && id === "edit") edit();
    }, { signal });
    if (sections.isOpen("edit")) edit();
    let noteList, workList, selected, work, bar;
    if (notes) {
      noteList = new app.components.ListView({ view: notes, scope: { field: "task_id", id: task }, mode: "cards", panel: false, showId: false });
      noteList.mount(layout.cell("notes"));
      work = new app.components.PageLayout({
        id: `${view.id}.work.${phone.matches ? "narrow" : "wide"}`,
        tree: phone.matches ? { rows: [{ id: "commands", height: 56 }, { id: "main", minHeight: 160 }, { id: "side", header: t("Kijel\xF6lt jegyzet"), height: 240, minHeight: 120, collapsable: true, resizable: true }] } : { rows: [{ id: "commands", height: 56 }, { cols: [{ id: "main", minWidth: 240 }, { id: "side", header: t("Kijel\xF6lt jegyzet"), width: 340, minWidth: 220, collapsable: true, resizable: true }] }] }
      });
      layout.attach("work", work);
      const side = work;
      const deletable = notes.actions.some((action) => action.name === "delete");
      bar = new app.components.CommandBar({ label: t("Munka"), signal, items: [
        { type: "toggle", id: "side", label: t("Oldalpanel"), icon: "dxi dxi-border-right", pressed: !side.isCollapsed("side") },
        { type: "spacer" },
        // The commands of the selected note behind one button instead of permanent buttons.
        { type: "menu", id: "more", label: t("Tov\xE1bbi m\u0171veletek"), icon: "dxi dxi-dots-vertical", iconOnly: true, items: [
          { id: "show", label: t("Megjelen\xEDt\xE9s az oldalpanelen"), icon: "dxi dxi-border-right", disabled: true },
          { id: "copy", label: t("Sz\xF6veg m\xE1sol\xE1sa"), icon: "dxi dxi-copy", disabled: true },
          { type: "separator" },
          { id: "delete", label: t("T\xF6rl\xE9s"), icon: "dxi dxi-delete", disabled: true, hidden: !deletable }
        ] }
      ] });
      bar.mount(side.cell("commands"));
      side.on("collapse", ({ id, collapsed }) => {
        if (id === "side") bar?.update("side", { pressed: !collapsed });
      }, { signal });
      bar.on("toggle", ({ id, pressed: pressed2 }) => {
        if (id === "side") {
          if (pressed2) side.expand("side");
          else side.collapse("side");
        }
      });
      let current;
      bar.on("click", ({ id }) => {
        const note = current;
        if (!note) return;
        if (id === "show") side.expand("side");
        else if (id === "copy") {
          const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : void 0;
          void (clipboard?.writeText(String(note.body ?? "")) ?? Promise.reject(new Error("clipboard"))).then(() => app.ui.toast(t("A jegyzet sz\xF6vege a v\xE1g\xF3lapra ker\xFClt.")), () => void app.ui.dialog({ severity: "warning", message: t("A v\xE1g\xF3lap nem \xE9rhet\u0151 el.") }));
        } else if (id === "delete") void (async () => {
          if (!await app.ui.dialog({ mode: "confirm", severity: "danger", title: t("T\xF6rl\xE9s"), message: t("T\xF6rl\xF6d a kijel\xF6lt jegyzetet?"), confirmLabel: t("T\xF6rl\xE9s") })) return;
          try {
            await app.server.call(notes.resource, "delete", { id: String(note.id) });
          } catch {
            return;
          }
          workList?.refresh();
          noteList?.refresh();
        })();
      });
      workList = new app.components.ListView({ view: { ...notes, id: `${view.id}.work` }, scope: { field: "task_id", id: task }, mode: "table", panel: false, showId: false });
      workList.mount(side.cell("main"));
      const panel = document.createElement("div"), hint2 = document.createElement("p");
      panel.style.cssText = "width:100%;height:100%";
      hint2.style.cssText = "margin:16px";
      hint2.textContent = t("V\xE1lassz egy jegyzetet.");
      panel.append(hint2);
      side.attach("side", panel);
      workList.on("target", ({ row: note }) => {
        current = note;
        for (const id of ["show", "copy", "delete"]) bar?.update(id, { disabled: !note });
        if (!note) return;
        if (selected) {
          void selected.show(note).catch(() => {
          });
          return;
        }
        hint2.remove();
        selected = new app.components.RecordDetails({ view: notes, record: note, showId: false });
        selected.mount(panel);
      }, { signal });
      if (phone.matches) {
        const pages = layout.tabsOf("work");
        let restore = false;
        const follow = (active) => {
          if (active === "work") {
            if (!layout.isCollapsed("control")) {
              restore = true;
              layout.collapse("control");
            }
          } else if (restore) {
            restore = false;
            layout.expand("control");
          }
        };
        layout.on("collapse", ({ id }) => {
          if (id === "control" && pages.active() === "work" && !layout.isCollapsed("control")) restore = false;
        }, { signal });
        pages.on("change", ({ id }) => follow(id), { signal });
        follow(pages.active());
      }
    } else {
      const empty = document.createElement("p");
      empty.style.cssText = "margin:16px";
      empty.textContent = t("A jegyzetek nem \xE9rhet\u0151k el.");
      layout.attach("notes", empty);
    }
    const box = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { id: "stage" }, { id: "footer", height: 48 }] });
    layout.attach("sketch", box);
    const tools = new app.components.CommandBar({ label: t("V\xE1zlat"), signal, items: [
      {
        type: "segmented",
        id: "color",
        label: t("Sz\xEDn"),
        value: sketch.pen.color,
        options: [{ value: "ink", label: t("Tinta") }, { value: "blue", label: t("K\xE9k") }, { value: "red", label: t("Piros") }]
      },
      { type: "spacer" },
      { id: "clear", label: t("T\xF6rl\xE9s"), icon: "dxi dxi-delete", disabled: !sketch.count() }
    ] });
    tools.mount(box.getCell("commands"));
    app.ui.attach(box.getCell("stage"), sketch.element, { signal });
    const footer = new app.components.CommandBar({ label: t("Toll"), placement: "bottom", signal, items: [
      { type: "range", id: "width", label: t("Vonalvastags\xE1g"), min: 1, max: 12, value: sketch.pen.width, valueLabel: true },
      { id: "undo", label: t("Visszavon\xE1s"), icon: "dxi dxi-undo", disabled: !sketch.count() }
    ] });
    footer.mount(box.getCell("footer"));
    tools.on("change", ({ id, value }) => {
      if (id === "color") sketch.pen.color = String(value);
    });
    tools.on("click", ({ id }) => {
      if (id === "clear") sketch.clear();
    });
    footer.on("change", ({ id, value }) => {
      if (id === "width") sketch.pen.width = Number(value);
    });
    footer.on("click", ({ id }) => {
      if (id === "undo") sketch.undo();
    });
    sketch.onChange(() => {
      tools.update("clear", { disabled: !sketch.count() });
      footer.update("undo", { disabled: !sketch.count() });
    }, { signal });
    signal.addEventListener("abort", () => {
      form?.destroy();
      form = void 0;
      noteList?.destroy();
      noteList = void 0;
      selected?.destroy();
      workList?.destroy();
      bar?.destroy();
      work?.destroy();
      box.destructor();
      sections.destroy();
      layout.destroy();
    }, { once: true });
  };
  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => build?.abort() };
}
var taskPage = (app) => {
  app.kinds.register(KIND5, { create: (host, view) => page(app, host, view) });
  app.commands.register("demo.task-page", {
    label: "Feladatlap",
    icon: "dxi dxi-file-document-outline",
    placement: "record",
    enabled: ({ row, rows }) => !!row && rows.length <= 1 && !!app.viewDefinition(KIND5),
    run: ({ app: app2, row }) => {
      if (row) app2.navigate({ view: KIND5, record: String(row.id) });
    }
  });
};
var task_page_default = taskPage;

// examples/demo-app/frontend/src/registry-browser.ts
var KIND6 = "demo.registry-browser";
var TOGGLE = "demo.subkey-values";
var PHONE3 = "(max-width: 767px)";
function hint(text) {
  const element = document.createElement("p");
  element.style.cssText = "margin:16px";
  element.textContent = text;
  return element;
}
function browser(app, host, view) {
  const t = app.i18n.t, options = view.options ?? {};
  const nodes = options.tree ? app.viewDefinition(options.tree) : void 0;
  const values = options.values ? app.viewDefinition(options.values) : void 0;
  if (!nodes) {
    const empty = hint(t("A kulcsok nem \xE9rhet\u0151k el."));
    host.attach(empty);
    return { destroy: () => empty.remove() };
  }
  const media = matchMedia(PHONE3);
  let build, keys, list;
  const root = document.createElement("div");
  root.style.cssText = "width:100%;height:100%";
  host.attach(root);
  const render = () => {
    if (host.signal.aborted) return;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    previous?.abort();
    const phone = media.matches;
    const center = { tabs: [{ id: "values", header: t("\xC9rt\xE9kek") }, { id: "key", header: t("Kulcs adatai") }], minWidth: 240 };
    const tree = phone ? { rows: [{ id: "tree", header: nodes.title, height: 220, minHeight: 120, resizable: true, collapsable: true }, { ...center, minHeight: 200 }, { id: "value", header: t("\xC9rt\xE9k adatai"), height: 200, collapsable: true, collapsed: true }] } : { cols: [{ id: "tree", header: nodes.title, width: 280, minWidth: 180, resizable: true, collapsable: true }, center, { id: "value", header: t("\xC9rt\xE9k adatai"), width: 300, minWidth: 200, resizable: true, collapsable: true }] };
    const layout = new app.components.PageLayout({ id: `${view.id}.${phone ? "narrow" : "wide"}`, tree });
    layout.mount(root);
    const nodeTree = keys = new app.components.Tree({ view: nodes, label: "name", id: `${view.id}.tree` });
    nodeTree.mount(layout.cell("tree"));
    const hints = /* @__PURE__ */ new Map();
    const clear = (id) => {
      hints.get(id)?.abort();
      hints.delete(id);
    };
    const show = (id, text) => {
      clear(id);
      const shown = new AbortController();
      hints.set(id, shown);
      signal.addEventListener("abort", () => shown.abort(), { once: true, signal: shown.signal });
      app.ui.attach(layout.cell(id), hint(text), { signal: shown.signal });
    };
    show("key", t("V\xE1lassz egy kulcsot a f\xE1ban."));
    show("value", t("V\xE1lassz egy \xE9rt\xE9ket a list\xE1ban."));
    show("values", values ? t("V\xE1lassz egy kulcsot a f\xE1ban.") : t("Az \xE9rt\xE9kek nem \xE9rhet\u0151k el."));
    let keyDetails, valueDetails;
    let node;
    let subkeys = app.preferences.scope(TOGGLE).get(values?.id ?? "") === true;
    const showValue = (row) => {
      if (!values) return;
      if (!row) {
        valueDetails?.destroy();
        valueDetails = void 0;
        show("value", t("V\xE1lassz egy \xE9rt\xE9ket a list\xE1ban."));
        return;
      }
      if (valueDetails) {
        void valueDetails.show(row).catch(() => {
        });
        return;
      }
      clear("value");
      valueDetails = new app.components.RecordDetails({ view: values, record: row, showId: false });
      valueDetails.mount(layout.cell("value"));
    };
    const showList = () => {
      list?.destroy();
      list = void 0;
      showValue(void 0);
      if (!values || !node) {
        show("values", values ? t("V\xE1lassz egy kulcsot a f\xE1ban.") : t("Az \xE9rt\xE9kek nem \xE9rhet\u0151k el."));
        return;
      }
      clear("values");
      list = new app.components.ListView({ view: values, scope: { field: subkeys ? "parent_key_id" : "key_id", id: String(node.id) }, panel: false, showId: false });
      list.on("select", ({ row }) => showValue(row));
      list.on("toggle", ({ command, pressed: pressed2 }) => {
        if (command === TOGGLE && pressed2 !== subkeys) {
          subkeys = pressed2;
          showList();
        }
      });
      list.mount(layout.cell("values"));
    };
    nodeTree.on("select", ({ row }) => {
      const changed = String(row?.id ?? "") !== String(node?.id ?? "");
      node = row;
      if (!row) {
        keyDetails?.destroy();
        keyDetails = void 0;
        show("key", t("V\xE1lassz egy kulcsot a f\xE1ban."));
      } else if (keyDetails) void keyDetails.show(row).catch(() => {
      });
      else {
        clear("key");
        keyDetails = new app.components.RecordDetails({ view: nodes, record: row, showId: false });
        keyDetails.mount(layout.cell("key"));
      }
      if (changed) showList();
    });
    nodeTree.on("activate", () => layout.tabsOf("key")?.select("key"));
    signal.addEventListener("abort", () => {
      list?.destroy();
      list = void 0;
      keyDetails?.destroy();
      valueDetails?.destroy();
      nodeTree.destroy();
      layout.destroy();
    }, { once: true });
  };
  render();
  media.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => build?.abort(), refresh: () => {
    void keys?.refresh();
    list?.refresh();
  } };
}
var registryBrowser = (app) => {
  app.kinds.register(KIND6, { create: (host, view) => browser(app, host, view) });
  app.commands.register(TOGGLE, { type: "toggle", label: "Alkulcsok \xE9rt\xE9kei", icon: "dxi dxi-folder", placement: "toolbar", pressed: false });
};
var registry_browser_default = registryBrowser;

// examples/demo-app/frontend/src/index.ts
var demo = async (app) => {
  const failures = [];
  for (const part of [assets_default, playlist_default, readings_default, tasks_default, playlist_editor_default, task_page_default, registry_browser_default]) {
    try {
      await part(app);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "61ade feature demo: a module part failed");
};
var index_default = demo;
export {
  index_default as default
};

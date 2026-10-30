// examples/demo-app/frontend/src/assets.ts
var KIND = "demo.asset-viewer";
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
function viewer(app, host, view) {
  const t = (key, params) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A m\xE9dian\xE9z\u0151 egy m\xE9diaelemhez ny\xEDlik meg."));
  const row = host.record.row, listId = view.options?.details ?? host.record.resource;
  const list = app.viewDefinition(listId);
  const found = mediaOf(list, row), kind = found?.media.mime_type.split("/")[0];
  const playable = kind === "image" || kind === "video" || kind === "audio", timed = kind === "video" || kind === "audio";
  const preferences = app.preferences.scope(KIND), phone = matchMedia(PHONE);
  let loop = preferences.get("loop") ?? !!view.options?.loop;
  let build, player, resume = 0;
  host.setTitle(`${view.title}: ${String(row.title ?? host.record.id)}`);
  const render = () => {
    if (host.signal.aborted) return;
    resume = player?.position() ?? resume;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    const stage = playable ? [{ id: "stage" }] : [];
    const layout = new app.dhx.Layout(null, { type: "none", rows: phone.matches ? [{ id: "commands", height: 48 }, ...stage.map((cell) => ({ ...cell, height: kind === "audio" ? 200 : Math.max(220, Math.round(innerHeight * 0.4)) })), { id: "details" }] : [{ id: "commands", height: 48 }, { type: "line", cols: [...stage, { id: "details", ...playable ? { width: 380 } : {} }] }] });
    host.attach(layout);
    previous?.abort();
    player = void 0;
    const position = (seconds) => t("Poz\xEDci\xF3: {position} / {length}", { position: clock(seconds), length: clock(player?.duration() ?? 0) });
    const status = !found ? t("Ehhez az elemhez nincs megjelen\xEDthet\u0151 m\xE9diaf\xE1jl.") : !playable ? t("Ez a f\xE1jlt\xEDpus nem j\xE1tszhat\xF3 le.") : timed ? position(resume) : "";
    const media = ["play", "pause", "rewind", "backward", "forward", "loop"];
    const bar = new app.components.CommandBar({ signal, items: [
      { id: "back", label: t("Vissza a list\xE1hoz"), icon: "dxi dxi-arrow-left" },
      { id: "play", label: t("Lej\xE1tsz\xE1s"), icon: "dxi dxi-menu-right", disabled: true, hidden: !timed },
      { id: "pause", label: t("Sz\xFCnet"), disabled: true, hidden: !timed },
      { id: "rewind", label: t("Elej\xE9re"), icon: "dxi dxi-chevron-double-left", disabled: true, hidden: !timed },
      { id: "backward", label: t("Vissza {seconds} mp", { seconds: STEP }), icon: "dxi dxi-chevron-left", disabled: true, hidden: !timed },
      { id: "forward", label: t("El\u0151re {seconds} mp", { seconds: STEP }), icon: "dxi dxi-chevron-right", disabled: true, hidden: !timed },
      { id: "loop", label: loop ? t("Ism\xE9tl\xE9s: be") : t("Ism\xE9tl\xE9s: ki"), icon: "dxi dxi-redo", disabled: true, hidden: !timed },
      { id: "gap", label: "", type: "spacer" },
      { id: "position", label: status, disabled: true, hidden: status === "" }
    ] });
    bar.mount(layout.getCell("commands"));
    bar.on("click", ({ id }) => {
      if (id === "back") {
        if (!app.navigate({ view: listId })) host.close();
        return;
      }
      if (!player) return;
      if (id === "play") void player.play().catch(() => {
      });
      else if (id === "pause") player.pause();
      else if (id === "rewind") player.seek(0);
      else if (id === "backward" || id === "forward") player.seek(player.position() + (id === "forward" ? STEP : -STEP));
      else if (id === "loop") {
        loop = !loop;
        preferences.set("loop", loop);
        bar.update("loop", { label: loop ? t("Ism\xE9tl\xE9s: be") : t("Ism\xE9tl\xE9s: ki") });
      }
    });
    if (list) new app.components.RecordDetails({ view: list, record: row, signal }).mount(layout.getCell("details"));
    if (found && playable) player = new app.components.MediaPlayer({
      source: { resource: found.source, action: "content_stream", id: found.media.id, version: found.media.revision },
      mime: found.media.mime_type,
      name: String(row.title ?? found.media.name),
      // Images keep the player's zoom toolbar; audio and video are driven by the command bar (its loop, not the player's).
      toolbar: !timed,
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
      current.on("ended", () => {
        if (loop) {
          current.seek(0);
          void current.play().catch(() => {
          });
        }
      });
      current.on("error", ({ message }) => {
        for (const id of media) bar.update(id, { disabled: true });
        bar.update("position", { label: message, hidden: false });
      });
      current.mount(layout.getCell("stage"));
      current.focus();
    }
    signal.addEventListener("abort", () => layout.destructor(), { once: true });
  };
  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => {
    build?.abort();
    player = void 0;
  } };
}
var assets = (app) => {
  app.views.register(KIND, { create: (host, view) => viewer(app, host, view) });
};
var assets_default = assets;

// examples/demo-app/frontend/src/playlist.ts
var KIND2 = "demo.playlist-preview";
var PHONE2 = "(max-width: 767px)";
var GAP = 3;
var LONGEST = 3600;
var TICK = 250;
var SCENE_READY = 5e3;
var DATE = /^\d{4}-\d{2}-\d{2}$/;
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
var escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var pad = (value) => String(value).padStart(2, "0");
function clock2(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = pad(s % 60);
  return h ? `${h}:${pad(m)}:${r}` : `${m}:${r}`;
}
function today() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
function pickedDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? void 0 : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return calendarDate(typeof value === "string" ? value.trim() : value);
}
function planOf(date, answer) {
  const slots = Array.isArray(answer?.timeline) ? answer.timeline : [];
  let offset = 0;
  const items = slots.map((slot, index) => {
    const asset = slot && typeof slot.asset === "object" && slot.asset !== null ? slot.asset : null;
    const mime = typeof asset?.file?.mime_type === "string" ? asset.file.mime_type : "";
    const kind = !asset ? "none" : asset.kind === "scene" ? "scene" : (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio") && mime.startsWith(asset.kind + "/") && typeof asset.file?.id === "string" ? asset.kind : "other";
    const seconds = asset ? Math.min(LONGEST, Math.max(1, Math.round(Number(asset.duration) || 0))) : GAP;
    const item = { index, slot, kind, seconds, offset, title: String(slot?.title ?? asset?.title ?? "") };
    offset += seconds;
    return item;
  });
  return { date, answer, items, total: offset };
}
function itemAt(plan, seconds) {
  let found = plan.items[0];
  for (const item of plan.items) if (item.offset <= seconds) found = item;
  return found;
}
function sceneState(payload) {
  if (typeof payload !== "object" || payload === null) return void 0;
  const { time, duration, playing } = payload;
  return typeof time === "number" && Number.isFinite(time) && time >= 0 && typeof duration === "number" && Number.isFinite(duration) && duration > 0 && typeof playing === "boolean" ? { time, duration, playing } : void 0;
}
function preview(app, host, view) {
  const t = (key, params) => app.i18n.t(key, params);
  if (!view.actions.some((action) => action.name === "day")) throw new Error(t("A napi m\u0171sor nem k\xE9rhet\u0151 le."));
  const media = typeof view.options?.media === "string" && view.options.media ? view.options.media : "files";
  const scenes = view.actions.some((action) => action.name === "scene");
  const phone = matchMedia(PHONE2);
  let tenths;
  try {
    tenths = new Intl.NumberFormat(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  } catch {
    tenths = new Intl.NumberFormat(void 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  const kinds = { image: t("K\xE9p"), video: t("Vide\xF3"), audio: t("Hang"), scene: t("Jelenet"), none: t("Nincs tartalom"), other: t("Egy\xE9b tartalom") };
  let day = calendarDate(host.filters.date) ?? today();
  let plan, failure;
  let position = 0, playing = false, base = 0, since = 0, timer;
  let shell, loading, closed = false, sequence = 0, stripFrame = 0;
  const codes = /* @__PURE__ */ new Map();
  const now = () => playing && plan ? Math.min(plan.total, base + (performance.now() - since) / 1e3) : position;
  const positionText = () => t("Poz\xEDci\xF3: {position} / {length}", { position: clock2(now()), length: clock2(plan?.total ?? 0) });
  const sceneCode = (asset) => {
    let pending = codes.get(asset);
    if (!pending) {
      const fetched = app.server.call("signage_playlist", "scene", { values: { asset }, signal: host.signal }).then((answer) => {
        if (typeof answer?.code !== "string") throw new TypeError(t("A jelenet nem \xE9rkezett meg."));
        return answer.code;
      });
      codes.set(asset, pending = fetched);
      fetched.catch(() => {
        if (codes.get(asset) === fetched) codes.delete(asset);
      });
    }
    return pending;
  };
  const caption = (stage) => {
    const s = shell;
    if (!s || s.stage !== stage) return;
    const item = stage.item, slot = item?.slot;
    const title = item ? `${slot.start}\u2013${slot.end} \xB7 ${item.title || kinds[item.kind]} \xB7 ${kinds[item.kind]}` : idle();
    let text = stage.message ?? "", attributes = "";
    if (item?.kind === "scene" && stage.status) {
      const state = stage.state;
      if (stage.status === "error") text = t("A jelenet hib\xE1t jelzett: {message}", { message: stage.message ?? "" });
      else if (stage.status === "loading" || !state) text = t("A jelenet bet\xF6lt\xE9se\u2026");
      else text = t("Jelenet: {time} / {length} mp", { time: tenths.format(state.time % state.duration), length: tenths.format(state.duration) });
      attributes = ` data-demo-scene-state="${stage.status}"` + (state ? ` data-demo-scene-time="${state.time.toFixed(1)}" data-demo-scene-playing="${state.playing}"` : "");
    }
    s.layout.getCell("caption").attachHTML(`<div class="demo-playlist-caption" data-demo-playlist="${s.uid}" data-demo-part="caption" data-demo-stage="${item?.kind ?? "empty"}"${item ? ` data-demo-index="${item.index}"` : ""}><span class="demo-playlist-caption__title">${escape(title)}</span><span class="demo-playlist-caption__state${stage.status === "error" || stage.message && item?.kind !== "scene" ? " demo-playlist-caption__state--error" : ""}"${attributes}>${escape(text)}</span></div>`);
  };
  const message = (text) => `<div class="demo-playlist-message">${escape(text)}</div>`;
  const idle = () => failure ?? (plan ? t("Nincs tartalom") : t("Bet\xF6lt\xE9s\u2026"));
  const scene = async (stage, screen) => {
    const item = stage.item, signal = stage.controller.signal;
    const frame = stage.frame = new app.components.SandboxFrame({ signal, title: t("Jelenet: {title}", { title: item.title }), readyTimeout: SCENE_READY });
    frame.mount(screen);
    stage.status = "loading";
    frame.on("message", ({ type, payload }) => {
      const state = type === "scene.state" ? sceneState(payload) : void 0;
      if (state && stage.status !== "error") {
        stage.state = state;
        caption(stage);
      }
    });
    app.events.on("sandbox:error", ({ message: message2 }) => {
      if (shell?.stage !== stage) return;
      stage.status = "error";
      stage.message = message2;
      caption(stage);
    }, signal);
    try {
      const code = await sceneCode(item.slot.asset.id);
      if (signal.aborted) return;
      await frame.load(SCENE_HEAD + code + SCENE_TAIL);
      if (signal.aborted) return;
      stage.ready = true;
      stage.status = "ready";
      frame.post(playing ? "scene.play" : "scene.seek", { at: Math.max(0, now() - item.offset) });
      caption(stage);
    } catch (error) {
      if (signal.aborted || error?.name === "AbortError" || stage.status === "error") return;
      stage.status = "error";
      stage.message = error instanceof Error ? error.message : String(error);
      caption(stage);
    }
  };
  const enter = (item) => {
    const s = shell;
    if (!s) return;
    const previous = s.stage, controller = new AbortController(), signal = controller.signal;
    s.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    const stage = s.stage = { controller, item, ready: false, status: "" };
    const box = new app.dhx.Layout(null, { type: "none", rows: [{ id: "content" }] });
    s.layout.getCell("screen").attach(box);
    const screen = box.getCell("content");
    if (!item) screen.attachHTML(message(idle()));
    else if (item.kind === "image" || item.kind === "video" || item.kind === "audio") {
      const file = item.slot.asset.file;
      const player = stage.player = new app.components.MediaPlayer({
        source: { resource: media, action: "content_stream", id: file.id },
        mime: file.mime_type,
        name: item.title,
        toolbar: false,
        controls: false,
        loop: true,
        signal
      });
      player.on("loaded", () => {
        stage.ready = true;
        align(stage, true);
        if (playing) void player.play().catch(() => {
        });
      });
      player.on("error", ({ message: message2 }) => {
        stage.message = message2;
        caption(stage);
      });
      player.mount(screen);
    } else if (item.kind === "scene" && scenes) void scene(stage, screen);
    else screen.attachHTML(message(item.kind === "scene" ? t("A jelenet lej\xE1tsz\xE1sa nem enged\xE9lyezett.") : item.kind === "none" ? t("Nincs tartalom") : t("Ez a tartalomt\xEDpus nem j\xE1tszhat\xF3 le.")));
    signal.addEventListener("abort", () => box.destructor(), { once: true });
    caption(stage);
    previous?.controller.abort();
  };
  const align = (stage, hard) => {
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
  const paintStrip = (attempt = 0) => {
    cancelAnimationFrame(stripFrame);
    stripFrame = requestAnimationFrame(() => {
      const s = shell, current = plan;
      if (!s || !current) return;
      const root = document.querySelector(`[data-demo-playlist="${s.uid}"][data-demo-part="strip"]`);
      if (!root) {
        if (attempt < 20) paintStrip(attempt + 1);
        return;
      }
      const at = now(), item = itemAt(current, at);
      root.dataset.demoPosition = at.toFixed(1);
      root.querySelectorAll("[data-demo-item]").forEach((button) => {
        if (Number(button.dataset.demoItem) === item?.index) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      const slot = item && root.querySelector(`[data-demo-item="${item.index}"]`)?.parentElement;
      const head = root.querySelector(".demo-playlist-playhead");
      if (!item || !slot || !head) return;
      const left = slot.offsetLeft + slot.offsetWidth * Math.min(1, Math.max(0, (at - item.offset) / item.seconds));
      head.style.left = `${left}px`;
      if (left < root.scrollLeft || left > root.scrollLeft + root.clientWidth) root.scrollLeft = Math.max(0, left - root.clientWidth / 3);
    });
  };
  const sync = (seeked = false) => {
    const s = shell, current = plan;
    if (!s || !current) return;
    const at = now(), item = itemAt(current, at);
    if (item !== s.stage?.item) enter(item);
    else align(s.stage, seeked);
    s.bar.update("position", { label: positionText() });
    if (s.slider && !s.dragging) {
      s.syncing = true;
      try {
        s.slider.setValue(Math.min(current.total, at));
      } finally {
        s.syncing = false;
      }
    }
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
    base = position;
    since = performance.now();
    playing = true;
    clearInterval(timer);
    timer = setInterval(() => {
      if (plan && now() >= plan.total) pause();
      else sync();
    }, TICK);
    const stage = shell?.stage;
    if (stage?.ready && stage.player) void stage.player.play().catch(() => {
    });
    align(stage, true);
    commands();
    sync();
  };
  const pause = () => {
    if (!playing) return;
    position = now();
    playing = false;
    clearInterval(timer);
    timer = void 0;
    const stage = shell?.stage;
    stage?.player?.pause();
    if (stage?.frame && stage.ready && stage.item) stage.frame.post("scene.pause", { at: Math.max(0, position - stage.item.offset) });
    commands();
    sync();
  };
  const seek = (seconds) => {
    if (!plan) return;
    position = Math.min(plan.total, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    if (playing) {
      base = position;
      since = performance.now();
    }
    sync(true);
  };
  const step = (direction) => {
    if (!plan) return;
    const at = now(), item = itemAt(plan, at);
    if (!item) return;
    const target = direction > 0 ? plan.items[item.index + 1]?.offset ?? plan.total : at - item.offset > 1 ? item.offset : plan.items[Math.max(0, item.index - 1)].offset;
    seek(target);
  };
  const stripHtml = (s) => {
    const root = `class="demo-playlist-strip" data-demo-playlist="${s.uid}" data-demo-part="strip"`;
    if (!plan) return `<div ${root}><p class="demo-playlist-note">${escape(failure ?? t("Bet\xF6lt\xE9s\u2026"))}</p></div>`;
    const active = itemAt(plan, now());
    const items = plan.items.map((item) => {
      const range = `${item.slot.start}\u2013${item.slot.end}`, kind = kinds[item.kind], length = t("{seconds} mp", { seconds: item.seconds });
      const label = t("{start}\u2013{end}: {title}, {kind}, {seconds} mp", { start: item.slot.start, end: item.slot.end, title: item.title || kind, kind, seconds: item.seconds });
      return `<li class="demo-playlist-slot" style="flex-grow:${item.seconds}"><button type="button" class="demo-playlist-item demo-playlist-item--${item.kind}" data-demo-item="${item.index}" data-demo-kind="${item.kind}" data-demo-seconds="${item.seconds}" aria-label="${escape(label)}"${item === active ? ' aria-current="true"' : ""}><span class="demo-playlist-item__time">${escape(range)}</span><span class="demo-playlist-item__title">${escape(item.title || kind)}</span><span class="demo-playlist-item__meta">${escape(`${kind} \xB7 ${length}`)}</span></button></li>`;
    }).join("");
    return `<div ${root} data-demo-position="${now().toFixed(1)}"><div class="demo-playlist-track"><ol class="demo-playlist-items" aria-label="${escape(t("Id\u0151vonal"))}">${items}</ol><span class="demo-playlist-playhead" aria-hidden="true"></span></div></div>`;
  };
  const apiHtml = (s) => {
    const request = JSON.stringify({ resource: "signage_playlist", action: "day", values: { date: day } }, null, 2);
    const answer = plan ? JSON.stringify({ ok: true, data: plan.answer }, null, 2) : failure ?? t("Bet\xF6lt\xE9s\u2026");
    return `<div class="demo-playlist-api" data-demo-playlist="${s.uid}" data-demo-part="api"><p class="demo-playlist-api__label">${escape(t("API-k\xE9r\xE9s"))}</p><pre class="demo-playlist-code">POST ./?blade=1
Authorization: Bearer &lt;${escape(t("API-kulcs"))}&gt;
Content-Type: application/json

${escape(request)}</pre><p class="demo-playlist-api__label">${escape(t("V\xE1lasz"))}</p><pre class="demo-playlist-code" tabindex="0">${escape(answer)}</pre></div>`;
  };
  const paint = () => {
    const s = shell;
    if (!s) return;
    const old = s.paint, controller = s.paint = new AbortController(), signal = controller.signal;
    s.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    s.layout.getCell("strip").attachHTML(stripHtml(s));
    s.layout.getCell("api").attachHTML(apiHtml(s));
    const slider = new app.dhx.Slider(null, {
      min: 0,
      max: Math.max(1, plan?.total ?? 1),
      step: 0.1,
      value: Math.min(now(), plan?.total ?? 0),
      tooltip: false,
      label: t("Lej\xE1tsz\xE1si poz\xEDci\xF3"),
      labelPosition: "left",
      labelWidth: 150,
      hiddenLabel: phone.matches,
      css: "demo-playlist-scrub"
    });
    s.layout.getCell("scrub").attach(slider);
    if (!plan?.items.length) slider.disable();
    slider.events.on("change", (value) => {
      if (!s.syncing) seek(Number(value));
    });
    slider.events.on("mousedown", () => {
      s.dragging = true;
    });
    addEventListener("pointerup", () => {
      s.dragging = false;
    }, { signal });
    old?.abort();
    s.slider = slider;
    signal.addEventListener("abort", () => slider.destructor(), { once: true });
    commands();
    if (plan?.items.length) sync(true);
    else enter(void 0);
  };
  const render = () => {
    if (closed) return;
    const previous = shell, controller = new AbortController(), signal = controller.signal, compact = phone.matches;
    const api = { id: "api", header: escape(t("API-k\xE9r\xE9s \xE9s v\xE1lasz")), collapsable: true, ...compact ? { collapsed: true, height: 280 } : { width: 420 } };
    const stage = { rows: [{ id: "caption", height: 44 }, { id: "screen" }] };
    const layout = new app.dhx.Layout(null, { type: "none", css: "demo-playlist", rows: compact ? [{ id: "day", height: 56 }, { id: "commands", height: 48 }, { id: "strip", height: 96 }, { id: "scrub", height: 44 }, stage, api] : [{ height: 56, cols: [{ id: "day", width: 280 }, { id: "commands" }] }, { id: "strip", height: 104 }, { id: "scrub", height: 44 }, { type: "line", cols: [stage, api] }] });
    host.attach(layout);
    const form = new app.dhx.Form(null, { css: "demo-playlist-day", padding: "8px 12px", rows: [{
      type: "datepicker",
      name: "date",
      label: t("Nap"),
      labelPosition: "left",
      labelWidth: 48,
      dateFormat: "%Y-%m-%d",
      weekStart: "monday",
      editable: true,
      value: day
    }] });
    layout.getCell("day").attach(form);
    const bar = new app.components.CommandBar({ signal, items: [
      { id: "previous-day", label: t("El\u0151z\u0151 nap"), icon: "dxi dxi-arrow-left" },
      { id: "today", label: t("Ma"), icon: "dxi dxi-calendar-today" },
      { id: "next-day", label: t("K\xF6vetkez\u0151 nap"), icon: "dxi dxi-arrow-right" },
      { id: "play", label: t("Lej\xE1tsz\xE1s"), icon: "dxi dxi-menu-right", disabled: true },
      { id: "pause", label: t("Sz\xFCnet"), disabled: true },
      { id: "rewind", label: t("Elej\xE9re"), icon: "dxi dxi-chevron-double-left", disabled: true },
      { id: "previous", label: t("El\u0151z\u0151 elem"), icon: "dxi dxi-chevron-left", disabled: true },
      { id: "next", label: t("K\xF6vetkez\u0151 elem"), icon: "dxi dxi-chevron-right", disabled: true },
      { id: "gap", label: "", type: "spacer" },
      { id: "position", label: positionText(), disabled: true }
    ] });
    bar.mount(layout.getCell("commands"));
    let disposed = false;
    const s = { uid: `pp${++sequence}`, signal, layout, form, bar, syncing: false, dragging: false, dispose: () => {
      if (disposed) return;
      disposed = true;
      s.paint?.abort();
      controller.abort();
      form.destructor();
      layout.destructor();
      if (shell === s) shell = void 0;
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
    form.events.on("change", (name, value) => {
      if (name !== "date" || s.syncing) return;
      const next = pickedDate(value);
      if (next) choose(next);
    });
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-demo-item]") : null;
      const item = button?.closest(`[data-demo-playlist="${s.uid}"]`) && plan?.items[Number(button.dataset.demoItem)];
      if (item) seek(item.offset);
    }, { signal });
    paint();
  };
  const choose = (date) => {
    const s = shell, picker = s?.form.getItem("date");
    if (s && picker && pickedDate(picker.getValue()) !== date) {
      s.syncing = true;
      try {
        picker.setValue(date);
      } finally {
        s.syncing = false;
      }
    }
    if (date === day && (plan?.date === date || loading)) return;
    day = date;
    void load();
  };
  const load = async () => {
    loading?.abort();
    const controller = loading = new AbortController();
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal: controller.signal });
    pause();
    position = 0;
    plan = void 0;
    failure = void 0;
    codes.clear();
    paint();
    try {
      const answer = await app.server.call("signage_playlist", "day", { values: { date: day }, signal: controller.signal });
      if (controller.signal.aborted) return;
      plan = planOf(day, answer);
      host.setTitle(`${view.title}: ${day}${typeof answer?.weekday_name === "string" ? ` (${answer.weekday_name})` : ""}`);
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") return;
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      if (loading === controller) loading = void 0;
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
  try {
    render();
  } catch (error) {
    close();
    throw error;
  }
  void load();
  return { destroy: close };
}
var playlist = (app) => {
  app.views.register(KIND2, { create: (host, view) => preview(app, host, view) });
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
    const summaryHeader = compact ? {} : { header: escape2(t("\xD6sszes\xEDt\xE9s")) };
    const overview = compact ? { type: "space", height: 324, rows: [{ id: "summary", height: 104 }, { id: "chart", header: escape2(t("\xC9rt\xE9keloszl\xE1s")) }] } : { type: "space", height: 260, cols: [{ id: "summary", width: 340, ...summaryHeader }, { id: "chart", header: escape2(t("\xC9rt\xE9keloszl\xE1s")) }] };
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
    const stopTheme = app.theme.onChange(() => {
      if (!signal.aborted) {
        chart.setConfig(chartConfig(colors()));
        render();
      }
    });
    let current;
    signal.addEventListener("abort", () => {
      stopTheme();
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
  app.views.register(KIND3, { create: (host, view) => dashboard(app, host, view) });
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

// examples/demo-app/frontend/src/index.ts
var demo = async (app) => {
  const failures = [];
  for (const part of [assets_default, playlist_default, readings_default, tasks_default]) {
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

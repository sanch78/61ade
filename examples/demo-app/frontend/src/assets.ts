// D1 Signage Médiatár (docs/demos.md#toolkit-consumer): the record view kind `demo.asset-viewer`. A Layout from
// `app.dhx` with the 61ade CommandBar (back, then icon-only transport controls: start, back, play/pause, forward, loop), the asset's RecordDetails and a stage cell with the
// MediaPlayer (image, video, audio) or a SandboxFrame running the scene (an animation asset); `modules/signage.json`
// declares the view and opens it from Médiatár for every playable asset. Also the media type `demo.scene` (scene files
// are `Animáció` with the 61ade animation glyph) and the record command `demo.play` (`Lejátszás`) of the Médiatár toolbar.
import type { Application, ApplicationModule, CommandBar, ListKindOptions, MediaDescriptor, MediaPlayer, Row, SandboxFrame, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
import { SCENE_HEAD, SCENE_READY, SCENE_TAIL, SCENE_TYPE, sceneState, type SceneState } from "./scene";

/** `views.demo.asset-viewer.options` of signage.json. */
type ViewerOptions = { loop?: boolean; details?: string };

const KIND = "demo.asset-viewer";
const PHONE = "(max-width: 767px)";
const STEP = 5;

/** `m:ss`, from one hour `h:mm:ss`, like the framework's length text. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** The first media column of the list view that has a described file in the row (`_media`, ACL-filtered by the server). */
function mediaOf(list: ViewDefinition<ListKindOptions> | undefined, row: Row): { source: string; media: MediaDescriptor } | undefined {
  const slots = row._media && typeof row._media === "object" ? row._media as Record<string, MediaDescriptor | null> : {};
  for (const column of list?.options.columns ?? []) {
    const media = column.media ? slots[column.id] : undefined;
    if (column.media && media && typeof media.id === "string" && typeof media.mime_type === "string") return { source: column.media, media };
  }
  return undefined;
}

/** What the stage plays: a MediaPlayer kind, a scene, or nothing. */
function stageKind(media: MediaDescriptor | undefined): "image" | "video" | "audio" | "scene" | undefined {
  const mime = media?.mime_type.toLowerCase() ?? "", kind = mime.split("/")[0];
  return mime === SCENE_TYPE ? "scene" : kind === "image" || kind === "video" || kind === "audio" ? kind : undefined;
}

/**
 * One opening of the viewer. The content is built for the current width (side-by-side details on a desktop, stacked on
 * a phone) and rebuilt when the width crosses 768 px, keeping the position; each build owns an AbortController that
 * the next build and the host's signal abort, which destroys its CommandBar, RecordDetails and MediaPlayer.
 */
function viewer(app: Application, host: ViewHost, view: ViewDefinition<ViewerOptions>): ViewInstance {
  const t = (key: string, params?: Record<string, unknown>) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A médianéző egy médiaelemhez nyílik meg."));
  const row = host.record.row, asset = String(host.record.id), listId = view.options?.details ?? host.record.resource;
  const list = app.viewDefinition(listId) as ViewDefinition<ListKindOptions> | undefined;
  const found = mediaOf(list, row), kind = stageKind(found?.media);
  const playable = kind !== undefined, timed = kind === "video" || kind === "audio" || kind === "scene";
  const preferences = app.preferences.scope(KIND), phone = matchMedia(PHONE);
  let loop = preferences.get<boolean>("loop") ?? !!view.options?.loop;
  let build: AbortController | undefined, player: MediaPlayer | undefined, resume = 0;
  // The scene's frame and its last `scene.state` (its clock runs inside the frame; the viewer only follows it).
  let frame: SandboxFrame | undefined, scene: SceneState | undefined;
  host.setTitle(`${view.title}: ${String(row.title ?? host.record.id)}`);

  const root = document.createElement("div");
  root.style.cssText = "width:100%;height:100%";
  host.attach(root);

  const render = (): void => {
    if (host.signal.aborted) return;
    resume = player?.position() ?? (scene ? scene.time % scene.duration : resume);
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    previous?.abort();
    const details = { id: "details", header: t("Adatok"), collapsable: true };
    const layout = new app.components.PageLayout({ id: `${view.id}.${phone.matches ? "narrow" : "wide"}`,
      tree: phone.matches
        ? { rows: [{ id: "player", height: kind === "audio" ? 380 : Math.max(220, Math.round(innerHeight * 0.4)), resizable: true }, { ...details, minHeight: 120 }] }
        : { cols: [{ id: "player", minWidth: 240, resizable: true }, { ...details, width: 380, minWidth: 240 }] } });
    // The command row belongs to the left-hand player region, beside the collapsible metadata region.
    layout.mount(root);
    const left = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { id: "stage" }] });
    layout.attach("player", left);
    player = undefined;
    frame = undefined;
    scene = undefined;

    const position = (seconds: number) => t("Pozíció: {position} / {length}", { position: clock(seconds), length: clock(player?.duration() ?? scene?.duration ?? 0) });
    const status = !found ? t("Ehhez az elemhez nincs megjeleníthető médiafájl.") : !playable ? t("Ez a fájltípus nem játszható le.") : timed ? position(resume) : "";
    const media = ["rewind", "backward", "play", "forward", "loop"];
    const repeat = () => ({ label: loop ? t("Ismétlés: be") : t("Ismétlés: ki"), icon: loop ? "blade-icon blade-icon--repeat" : "blade-icon blade-icon--repeat-off" });
    // Like a player: back to the list, a divider, then icon-only transport controls with one play/pause toggle.
    const bar: CommandBar = new app.components.CommandBar({ signal, items: [
      { id: "back", label: t("Vissza a listához"), icon: "dxi dxi-arrow-left" },
      ...(timed ? [{ type: "separator" as const }] : []),
      { id: "rewind", label: t("Elejére"), icon: "blade-icon blade-icon--skip-previous", iconOnly: true, disabled: true, hidden: !timed },
      { id: "backward", label: t("Vissza {seconds} mp", { seconds: STEP }), icon: "blade-icon blade-icon--rewind", iconOnly: true, disabled: true, hidden: !timed },
      { id: "play", label: t("Lejátszás"), icon: "blade-icon blade-icon--play", iconOnly: true, disabled: true, hidden: !timed },
      { id: "forward", label: t("Előre {seconds} mp", { seconds: STEP }), icon: "blade-icon blade-icon--fast-forward", iconOnly: true, disabled: true, hidden: !timed },
      // A scene loops by its own length.
      { id: "loop", ...repeat(), iconOnly: true, disabled: true, hidden: !timed || kind === "scene" },
      { type: "spacer" },
      { id: "position", label: status, disabled: true, hidden: status === "" },
    ] });
    bar.mount(left.getCell("commands"));
    // The toggle follows the stage (also its native controls and keys): `Szünet` while playing, otherwise `Lejátszás`.
    let playing = false;
    const toggle = (on: boolean) => {
      if (on === playing) return;
      playing = on;
      bar.update("play", on ? { label: t("Szünet"), icon: "blade-icon blade-icon--pause" } : { label: t("Lejátszás"), icon: "blade-icon blade-icon--play" });
    };
    bar.on("click", ({ id }) => {
      if (id === "back") { if (!app.navigate({ view: listId })) host.close(); return; }
      if (frame) {
        const at = scene ? scene.time % scene.duration : 0;
        if (id === "play") frame.post(playing ? "scene.pause" : "scene.play", {});
        else if (id === "rewind") frame.post("scene.seek", { at: 0 });
        else if (id === "backward" || id === "forward") frame.post("scene.seek", { at: Math.max(0, at + (id === "forward" ? STEP : -STEP)) });
        return;
      }
      if (!player) return;
      if (id === "play") { if (playing) player.pause(); else void player.play().catch(() => {}); }
      else if (id === "rewind") player.seek(0);
      else if (id === "backward" || id === "forward") player.seek(player.position() + (id === "forward" ? STEP : -STEP));
      else if (id === "loop") { loop = !loop; player.setLoop(loop); preferences.set("loop", loop); bar.update("loop", repeat()); }
    });

    if (list) new app.components.RecordDetails({ view: list, record: row, signal }).mount(layout.cell("details"));

    if (found && kind === "scene") {
      const current = frame = new app.components.SandboxFrame({ signal, title: t("Jelenet: {title}", { title: String(row.title ?? found.media.name) }), readyTimeout: SCENE_READY });
      const failed = (message: string) => { for (const id of media) bar.update(id, { disabled: true }); bar.update("position", { label: message, hidden: false }); };
      current.on("message", ({ type, payload }) => {
        const state = type === "scene.state" ? sceneState(payload) : undefined;
        if (!state) return;
        scene = state;
        toggle(state.playing);
        bar.update("position", { label: position(state.time % state.duration) });
      });
      // Every error of a SandboxFrame (code, timeout, size, protocol) arrives as the page-wide framework event.
      app.events.on("sandbox:error", ({ message }) => { if (frame === current) failed(t("A jelenet hibát jelzett: {message}", { message })); }, { signal });
      current.mount(left.getCell("stage"));
      // The scene code through `signage_playlist.scene`: the server checks that the actor may read the file.
      void app.server.call<{ code?: unknown }>("signage_playlist", "scene", { values: { asset }, signal }).then(async answer => {
        if (typeof answer?.code !== "string") throw new TypeError(t("A jelenet nem érkezett meg."));
        await current.load(SCENE_HEAD + answer.code + SCENE_TAIL);
        if (signal.aborted) return;
        for (const id of media) bar.update(id, { disabled: false });
        current.post("scene.seek", { at: resume });
      }).catch(error => {
        if (signal.aborted || (error as Error)?.name === "AbortError") return;
        failed(error instanceof Error ? error.message : String(error));
      });
    }

    if (found && playable && kind !== "scene") player = new app.components.MediaPlayer({
      source: { resource: found.source, action: "content_stream", id: found.media.id, version: found.media.revision },
      mime: found.media.mime_type, name: String(row.title ?? found.media.name),
      // The player toolbar stays below the stage; its repeat switch and the command bar share state.
      toolbarPosition: "bottom", visualizer: kind === "audio" ? "spectrum" : undefined, loop, signal,
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
      current.on("loop", state => { loop = state.loop; preferences.set("loop", loop); bar.update("loop", repeat()); });

      current.on("error", ({ message }) => { for (const id of media) bar.update(id, { disabled: true }); bar.update("position", { label: message, hidden: false }); });
      current.mount(left.getCell("stage"));
      current.focus();
    }
    // Registered after the components, so they are destroyed (and detached from their cells) before the layout.
    signal.addEventListener("abort", () => { left.destructor(); layout.destroy(); }, { once: true });
  };

  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => { build?.abort(); player = undefined; frame = undefined; } };
}

const assets: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<ViewerOptions>) => viewer(app, host, view) });
  // Scene files are the library's animations: `Animáció` with the 61ade animation glyph in every media slot and picker.
  app.mediaTypes.register("demo.scene", { mime: [SCENE_TYPE], label: "Animáció", icon: "blade-icon blade-icon--animation" });
  // `Lejátszás` on the Médiatár toolbar: opens the viewer for the cursor asset when it has something to play.
  const playable = (view: ViewDefinition, row: Row | undefined) =>
    !!row && !!app.viewDefinition(KIND) && stageKind(mediaOf(view as ViewDefinition<ListKindOptions>, row)?.media) !== undefined;
  app.commands.register("demo.play", {
    label: "Lejátszás", icon: "dxi dxi-menu-right", placement: "record",
    enabled: ({ view, row, rows }) => rows.length <= 1 && playable(view, row),
    run: ({ app, row }) => { if (row) app.navigate({ view: KIND, record: String(row.id) }); },
  });
};
export default assets;

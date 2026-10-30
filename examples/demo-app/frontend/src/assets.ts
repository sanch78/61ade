// D1 Signage Médiatár (docs/demos.md#toolkit-consumer): the record view kind `demo.asset-viewer`. A Layout from
// `app.dhx` with the 61ade CommandBar (play, pause, position, loop), the asset's RecordDetails and a stage cell with the
// MediaPlayer; `modules/signage.json` declares the view and opens it from Médiatár for audio and video assets.
import type { Application, ApplicationModule, CommandBar, ListOptions, MediaDescriptor, MediaPlayer, Row, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";

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
function mediaOf(list: ViewDefinition<ListOptions> | undefined, row: Row): { source: string; media: MediaDescriptor } | undefined {
  const slots = row._media && typeof row._media === "object" ? row._media as Record<string, MediaDescriptor | null> : {};
  for (const column of list?.options.columns ?? []) {
    const media = column.media ? slots[column.id] : undefined;
    if (column.media && media && typeof media.id === "string" && typeof media.mime_type === "string") return { source: column.media, media };
  }
  return undefined;
}

/**
 * One opening of the viewer. The content is built for the current width (side-by-side details on a desktop, stacked on
 * a phone) and rebuilt when the width crosses 768 px, keeping the position; each build owns an AbortController that
 * the next build and the host's signal abort, which destroys its CommandBar, RecordDetails and MediaPlayer.
 */
function viewer(app: Application, host: ViewHost, view: ViewDefinition<ViewerOptions>): ViewInstance {
  const t = (key: string, params?: Record<string, unknown>) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A médianéző egy médiaelemhez nyílik meg."));
  const row = host.record.row, listId = view.options?.details ?? host.record.resource;
  const list = app.viewDefinition(listId) as ViewDefinition<ListOptions> | undefined;
  const found = mediaOf(list, row), kind = found?.media.mime_type.split("/")[0];
  const playable = kind === "image" || kind === "video" || kind === "audio", timed = kind === "video" || kind === "audio";
  const preferences = app.preferences.scope(KIND), phone = matchMedia(PHONE);
  let loop = preferences.get<boolean>("loop") ?? !!view.options?.loop;
  let build: AbortController | undefined, player: MediaPlayer | undefined, resume = 0;
  host.setTitle(`${view.title}: ${String(row.title ?? host.record.id)}`);

  const render = (): void => {
    if (host.signal.aborted) return;
    resume = player?.position() ?? resume;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    const stage = playable ? [{ id: "stage" }] : [];
    const layout = new app.dhx.Layout(null, { type: "none", rows: phone.matches
      ? [{ id: "commands", height: 48 }, ...stage.map(cell => ({ ...cell, height: kind === "audio" ? 200 : Math.max(220, Math.round(innerHeight * 0.4)) })), { id: "details" }]
      : [{ id: "commands", height: 48 }, { type: "line", cols: [...stage, { id: "details", ...(playable ? { width: 380 } : {}) }] }] });
    // The new content replaces the old one before the old build is released, so no cell repaints a destroyed widget.
    host.attach(layout);
    previous?.abort();
    player = undefined;

    const position = (seconds: number) => t("Pozíció: {position} / {length}", { position: clock(seconds), length: clock(player?.duration() ?? 0) });
    const status = !found ? t("Ehhez az elemhez nincs megjeleníthető médiafájl.") : !playable ? t("Ez a fájltípus nem játszható le.") : timed ? position(resume) : "";
    const media = ["play", "pause", "rewind", "backward", "forward", "loop"];
    const bar: CommandBar = new app.components.CommandBar({ signal, items: [
      { id: "back", label: t("Vissza a listához"), icon: "dxi dxi-arrow-left" },
      { id: "play", label: t("Lejátszás"), icon: "dxi dxi-menu-right", disabled: true, hidden: !timed },
      { id: "pause", label: t("Szünet"), disabled: true, hidden: !timed },
      { id: "rewind", label: t("Elejére"), icon: "dxi dxi-chevron-double-left", disabled: true, hidden: !timed },
      { id: "backward", label: t("Vissza {seconds} mp", { seconds: STEP }), icon: "dxi dxi-chevron-left", disabled: true, hidden: !timed },
      { id: "forward", label: t("Előre {seconds} mp", { seconds: STEP }), icon: "dxi dxi-chevron-right", disabled: true, hidden: !timed },
      { id: "loop", label: loop ? t("Ismétlés: be") : t("Ismétlés: ki"), icon: "dxi dxi-redo", disabled: true, hidden: !timed },
      { id: "gap", label: "", type: "spacer" },
      { id: "position", label: status, disabled: true, hidden: status === "" },
    ] });
    bar.mount(layout.getCell("commands"));
    bar.on("click", ({ id }) => {
      if (id === "back") { if (!app.navigate({ view: listId })) host.close(); return; }
      if (!player) return;
      if (id === "play") void player.play().catch(() => {});
      else if (id === "pause") player.pause();
      else if (id === "rewind") player.seek(0);
      else if (id === "backward" || id === "forward") player.seek(player.position() + (id === "forward" ? STEP : -STEP));
      else if (id === "loop") { loop = !loop; preferences.set("loop", loop); bar.update("loop", { label: loop ? t("Ismétlés: be") : t("Ismétlés: ki") }); }
    });

    if (list) new app.components.RecordDetails({ view: list, record: row, signal }).mount(layout.getCell("details"));

    if (found && playable) player = new app.components.MediaPlayer({
      source: { resource: found.source, action: "content_stream", id: found.media.id, version: found.media.revision },
      mime: found.media.mime_type, name: String(row.title ?? found.media.name),
      // Images keep the player's zoom toolbar; audio and video are driven by the command bar (its loop, not the player's).
      toolbar: !timed, signal,
    });
    const current = player;
    if (current) {
      current.on("loaded", () => {
        for (const id of media) bar.update(id, { disabled: false });
        if (resume > 0) current.seek(resume);
        bar.update("position", { label: position(resume) });
      });
      current.on("position", ({ seconds }) => bar.update("position", { label: position(seconds) }));
      current.on("ended", () => { if (loop) { current.seek(0); void current.play().catch(() => {}); } });
      current.on("error", ({ message }) => { for (const id of media) bar.update(id, { disabled: true }); bar.update("position", { label: message, hidden: false }); });
      current.mount(layout.getCell("stage"));
      current.focus();
    }
    // Registered after the components, so they are destroyed (and detached from their cells) before the layout.
    signal.addEventListener("abort", () => layout.destructor(), { once: true });
  };

  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => { build?.abort(); player = undefined; } };
}

const assets: ApplicationModule = app => {
  app.views.register(KIND, { create: (host, view: ViewDefinition<ViewerOptions>) => viewer(app, host, view) });
};
export default assets;

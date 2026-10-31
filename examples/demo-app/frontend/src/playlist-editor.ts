// D5 Signage Lejátszási listák (docs/demos.md#d5-playlist-editor): the record view kind `demo.playlist-editor` and the
// record command `demo.edit-playlist`. Every part is a 61ade component, placed in the panels the view declares
// (`options.layout`, app.components.PageLayout):
// - the asset library: a ListView of `signage_assets` in the page's panel (`panel: false`; header filters, the cards'
//   `Szűrés` dialog, table/cards/tiles) whose rows are dragged into the playlist (`dragSource`),
// - the playlist's items: a ListView of the embedded `signage_playlist_items`, scoped to this playlist, in its manual
//   order (dragging, Feljebb/Lejjebb, Alt+↑/↓), taking dropped assets (`view.drop`), with inline and bulk editing,
// - the playlist's details (RecordDetails) and settings (RecordForm over `signage_playlists.update`),
// none showing record ids (`showId: false`),
// - the preview: the demo's shared player (player.ts, also the day programme's), today's playing items in order with
//   their transitions.
// `modules/signage.json` declares the view, the resources and the layout.
import type { Application, ApplicationModule, ListKindOptions, MediaDescriptor, PageRegion, Row, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
import { Player, type PlayerItem } from "./player";
import { SCENE_TYPE } from "./scene";

/** `views.demo.playlist-editor.options` of signage.json. */
type EditorOptions = { list?: string; library?: string; layout?: PageRegion };
interface Settings { transition: string; transition_ms: number }

const KIND = "demo.playlist-editor";
/** The `status` icon of an item that plays today (signage.json `signage_playlist_items.status`). */
const PLAYING = "dxi dxi-check";
/** The library's columns in the editor: what helps to pick an asset. */
const LIBRARY_COLUMNS = ["file_id", "title", "media_type", "media_length", "duration"];

/**
 * One opening of the editor. The lists, forms and details save and refresh themselves; the editor only wires them:
 * a change of the items reloads the details and the preview, a saved setting the details and the preview's transition.
 */
function editor(app: Application, host: ViewHost, view: ViewDefinition<EditorOptions>): ViewInstance {
  const t = (key: string, params?: Record<string, unknown>) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A szerkesztő egy lejátszási listához nyílik meg."));
  const playlist = String(host.record.id), listView = view.options?.list ?? host.record.resource;
  const lists = app.viewDefinition(listView) as ViewDefinition<ListKindOptions> | undefined;
  const itemsView = lists?.options.subview?.view;
  const library = app.viewDefinition(view.options?.library ?? "signage_assets") as ViewDefinition<ListKindOptions> | undefined;
  if (!lists || !itemsView || !view.options?.layout) throw new Error(t("A lejátszási lista elemei nem érhetők el."));
  const files = library?.options.columns.find(column => column.media)?.media ?? "files";
  const titles = itemsView.options.columns.find(column => column.id === "asset_id")?.options ?? {};
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  host.setTitle(`${view.title}: ${String(host.record.row.title ?? playlist)}`);
  let settings: Settings = { transition: String(host.record.row.transition ?? "fade"), transition_ms: Number(host.record.row.transition_ms ?? 600) };
  let rows: readonly Row[] = [];

  // Released after the components in its cells (registered last, below), as the Layout recipe requires.
  const page = new app.components.PageLayout({ id: view.id, tree: view.options.layout });
  host.attach(page);

  const bar = new app.components.CommandBar({ signal, items: [{ id: "back", label: t("Vissza a listához"), icon: "dxi dxi-arrow-left" }] });
  bar.on("click", ({ id }) => { if (id === "back" && !app.navigate({ view: listView })) host.close(); });
  bar.mount(page.cell("commands"));

  // The library under the editor's own view id: its own mode, sort and filters (the header filters; no toolbar search);
  // picking only (no commands, no forms), in the page's panel (`panel: false`).
  const source = library ? new app.components.ListView({ signal, dragSource: true, panel: false, showId: false, mode: "tiles", view: { ...library, id: `${view.id}.library`,
    actions: library.actions.filter(action => action.name === "get"),
    options: { ...library.options, rowNumbers: false, search: undefined, commands: undefined, activate: undefined, subview: undefined,
      columns: library.options.columns.filter(column => LIBRARY_COLUMNS.includes(column.id)).map(column => ({ ...column, editable: false })) } } }) : undefined;
  source?.mount(page.cell("library"));

  const list = new app.components.ListView({ showId: false, view: itemsView, scope: { field: itemsView.options.subview?.field ?? "playlist_id", id: playlist }, signal });
  list.mount(page.cell("items"));

  const details = new app.components.RecordDetails({ view: listView, record: host.record.row, showId: false, signal });
  details.mount(page.cell("details"));
  const settingsForm = view.actions.some(action => action.name === "update") ? new app.components.RecordForm({ resource: host.record.resource, action: "update", id: playlist, signal }) : undefined;
  settingsForm?.mount(page.cell("settings"));
  const reload = async () => {
    try {
      const row = await app.server.call<Row>(host.record!.resource, "get", { id: playlist, signal });
      settings = { transition: String(row.transition ?? "fade"), transition_ms: Number(row.transition_ms ?? 600) };
      host.setTitle(`${view.title}: ${String(row.title ?? playlist)}`);
      await details.show(row);
    } catch { /* the details keep the last row; a failed request shows the framework dialog on the next action */ }
  };
  settingsForm?.on("saved", () => void reload().then(show), { signal });

  // The preview: the demo's shared player (player.ts), today's playing items in list order, looping.
  const preview = new Player({ app, signal, files, loop: true, muted: true, scenes: true });
  page.attach("preview", preview.element);
  /** Today's playing items as the player plays them: the effective play time and status are the server's. */
  const show = () => preview.show(rows.filter(row => row.status === PLAYING && Number(row.length) > 0).map((row): PlayerItem => {
    const asset = String(row.asset_id ?? ""), media = (row._media as Record<string, MediaDescriptor | null> | undefined)?.file_id ?? null;
    const scene = media?.mime_type.toLowerCase() === SCENE_TYPE, kind = media?.mime_type.split("/")[0];
    return { key: String(row.id), title: titles[asset] ?? asset, seconds: Number(row.length), asset,
      kind: scene ? "scene" : kind === "image" || kind === "video" || kind === "audio" ? kind : media ? "other" : "none",
      file: media && !scene ? { id: media.id, mime_type: media.mime_type, revision: media.revision } : null,
      transition: { type: String(row.transition || settings.transition || "fade"), ms: settings.transition_ms } };
  }), true);

  // The list's loaded rows (all of a playlist: at most 200 items, one window) drive the preview and the details.
  list.on("changed", event => {
    rows = event.rows;
    show();
    void details.show(playlist).catch(() => {});
  }, { signal });
  signal.addEventListener("abort", () => page.destroy(), { once: true });

  return {
    destroy: () => controller.abort(),
    // Unsaved input in the items list (a form or cell editor) or in the settings form.
    editing: () => list.editing() || !!settingsForm?.dirty(),
  };
}

const playlistEditor: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<EditorOptions>) => editor(app, host, view) });
  // `Lista szerkesztése` on the Lejátszási listák toolbar: opens the editor for the cursor playlist.
  app.commands.register("demo.edit-playlist", {
    label: "Lista szerkesztése", icon: "dxi dxi-pencil", placement: "record",
    enabled: ({ row, rows }) => rows.length <= 1 && !!row && !!app.viewDefinition(KIND),
    run: ({ app, row }) => { if (row) app.navigate({ view: KIND, record: String(row.id) }); },
  });
};
export default playlistEditor;

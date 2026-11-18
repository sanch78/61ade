// D11 `Médialapok` (modules/media-sheets.json, docs/demos.md#d11-media-sheets): the record view kind `demo.media-sheet`,
// a record page of 61ade components only: the page's CommandBar (back to the list) above the record's RecordDetails
// with its brief as a card of its own (`longText: "card"`, FB-0218). The fields declare the rest: `Adatok` and `Kép` are
// sections and the image a media field with `details_width`, and media-sheet.css lays the data out beside the image
// for this view (`data-blade-view`), here and in the list's `Adatok` window. `Előnézet` opens the record view kind
// `demo.media-proof` (FB-0221): under its command bar and tab bar a frameless PageLayout (`frame: "line"`) of the data
// beside the image over the brief, read as a page (`longText: "reading"`).
import type { Application, ApplicationModule, ListKindOptions, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
import "./media-sheet.css";

/** `views.demo.media-sheet.options` and `views.demo.media-proof.options` of media-sheets.json. */
type SheetOptions = { list?: string };

const KIND = "demo.media-sheet", PROOF = "demo.media-proof", PHONE = "(max-width: 767px)";

/** The list view of a sheet's record page; throws for a record view opened without a record or a list. */
function sheetList(app: Application, host: ViewHost, view: ViewDefinition<SheetOptions>): ViewDefinition<ListKindOptions> {
  const t = (key: string) => app.i18n.t(key);
  if (!host.record) throw new Error(t("A médialap egy rekordhoz nyílik meg."));
  const list = app.viewDefinition(view.options?.list ?? host.record.resource) as ViewDefinition<ListKindOptions> | undefined;
  if (!list) throw new Error(t("A médialapok listája nem érhető el."));
  return list;
}

function sheet(app: Application, host: ViewHost, view: ViewDefinition<SheetOptions>): ViewInstance {
  const t = (key: string) => app.i18n.t(key);
  const list = sheetList(app, host, view), record = host.record!, listId = list.id;
  host.setTitle(`${view.title}: ${String(record.row.title ?? record.id)}`);
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const layout = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { id: "details" }] });
  host.attach(layout);
  const bar = new app.components.CommandBar({ signal, items: [{ id: "back", label: t("Vissza a listához"), icon: "bi bi-arrow-left" },
    ...(app.viewDefinition(PROOF) ? [{ id: "proof", label: t("Előnézet"), icon: "bi bi-layout-split" }] : [])] });
  bar.on("click", ({ id }) => {
    if (id === "back" && !app.navigate({ view: listId })) host.close();
    if (id === "proof") app.navigate({ view: PROOF, record: record.id });
  });
  bar.mount(layout.getCell("commands"));
  new app.components.RecordDetails({ view: list, record: record.row, showId: false, longText: "card", signal }).mount(layout.getCell("details"));
  // Registered after the components, so they detach from their cells before the layout goes (the Layout recipe).
  signal.addEventListener("abort", () => layout.destructor(), { once: true });
  return { destroy: () => controller.abort() };
}

/** The list view with only $ids as its detail fields: what one region's `RecordDetails` shows. */
function only(list: ViewDefinition<ListKindOptions>, ids: string[]): ViewDefinition<ListKindOptions> {
  const options = list.options!;
  return { ...list, options: { ...options, detailFields: (options.detailFields ?? options.columns).filter(field => ids.includes(field.id)) } };
}

/**
 * `demo.media-proof`: the command bar, a tab bar, and in its `Előnézet` tab the frameless split: the data beside the
 * image over the brief, on a phone the three stacked (rebuilt when the width crosses 768 px, each with its own kept
 * sizes). The brief is the last region and declares the line before it (`resizable`); the image has only a minimum
 * and fills the rest. The declared sizes are kept per user, and a double-click on a line restores them.
 */
function proof(app: Application, host: ViewHost, view: ViewDefinition<SheetOptions>): ViewInstance {
  const t = (key: string) => app.i18n.t(key);
  const list = sheetList(app, host, view), record = host.record!, row = record.row, phone = matchMedia(PHONE);
  host.setTitle(`${view.title}: ${String(row.title ?? record.id)}`);
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const layout = new app.dhx.Layout(null, { type: "none", css: "demo-media-proof", rows: [{ id: "commands", height: 48 }, { id: "tabs" }] });
  host.attach(layout);
  const bar = new app.components.CommandBar({ signal, items: [{ id: "back", label: t("Vissza a médialaphoz"), icon: "bi bi-arrow-left" }] });
  bar.on("click", ({ id }) => { if (id === "back" && !app.navigate({ view: KIND, record: record.id })) host.close(); });
  bar.mount(layout.getCell("commands"));
  const tabs = new app.components.Tabs({ id: `${view.id}.tabs`, tabs: [{ id: "proof", label: t("Előnézet") }, { id: "sheet", label: t("Adatlap") }] });
  tabs.mount(layout.getCell("tabs"));
  const column = (list.options!.detailFields ?? list.options!.columns).find(field => field.id === "file_id");
  const media = (row._media as Record<string, { id: string; name: string; mime_type: string; revision: string } | null> | undefined)?.file_id;
  let build: AbortController | undefined;
  const render = (): void => {
    if (signal.aborted) return;
    build?.abort();
    const current = build = new AbortController(), scope = current.signal;
    signal.addEventListener("abort", () => current.abort(), { once: true, signal: scope });
    const split = new app.components.PageLayout({ id: `${view.id}.${phone.matches ? "narrow" : "wide"}`, frame: "line", tree: phone.matches
      ? { rows: [{ id: "data", height: 200, minHeight: 80, resizable: true }, { id: "image", minHeight: 120 }, { id: "text", height: 220, minHeight: 80, resizable: true }] }
      : { cols: [{ id: "data", width: 340, minWidth: 220, resizable: true },
        { rows: [{ id: "image", minHeight: 120 }, { id: "text", height: 240, minHeight: 80, resizable: true }] }] } });
    split.mount(tabs.cell("proof"));
    new app.components.RecordDetails({ view: only(list, ["title", "client", "channel", "year"]), record: row, showId: false, signal: scope }).mount(split.cell("data"));
    if (media && column?.media) new app.components.MediaPlayer({ source: { resource: column.media, action: "content_stream", id: media.id, version: media.revision },
      mime: media.mime_type, name: media.name, toolbar: false, signal: scope }).mount(split.cell("image"));
    else split.placeholder("image", { text: t("Ehhez a médialaphoz nincs kép.") });
    new app.components.RecordDetails({ view: only(list, ["brief"]), record: row, showId: false, longText: "reading", signal: scope }).mount(split.cell("text"));
    // Last: the components leave their cells before the split goes (the Layout recipe).
    scope.addEventListener("abort", () => split.destroy(), { once: true });
  };
  render();
  phone.addEventListener("change", render, { signal });
  new app.components.RecordDetails({ view: list, record: row, showId: false, longText: "card", signal }).mount(tabs.cell("sheet"));
  signal.addEventListener("abort", () => { tabs.destroy(); layout.destructor(); }, { once: true });
  return { destroy: () => controller.abort() };
}

const mediaSheet: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<SheetOptions>) => sheet(app, host, view) });
  app.kinds.register(PROOF, { create: (host, view: ViewDefinition<SheetOptions>) => proof(app, host, view) });
};
export default mediaSheet;

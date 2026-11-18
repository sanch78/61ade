// D11 `Médialapok` (modules/media-sheets.json, docs/demos.md#d11-media-sheets): the record view kind `demo.media-sheet`,
// a record page of 61ade components only: the page's CommandBar (back to the list) above the record's RecordDetails
// with its brief as a card of its own (`longText: "card"`, FB-0218). The fields declare the rest: `Adatok` and `Kép` are
// sections and the image a media field with `details_width`, and media-sheet.css lays the data out beside the image
// for this view (`data-blade-view`), here and in the list's `Adatok` window.
import type { Application, ApplicationModule, ListKindOptions, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
import "./media-sheet.css";

/** `views.demo.media-sheet.options` of media-sheets.json. */
type SheetOptions = { list?: string };

const KIND = "demo.media-sheet";

function sheet(app: Application, host: ViewHost, view: ViewDefinition<SheetOptions>): ViewInstance {
  const t = (key: string) => app.i18n.t(key);
  if (!host.record) throw new Error(t("A médialap egy rekordhoz nyílik meg."));
  const listId = view.options?.list ?? host.record.resource;
  const list = app.viewDefinition(listId) as ViewDefinition<ListKindOptions> | undefined;
  if (!list) throw new Error(t("A médialapok listája nem érhető el."));
  host.setTitle(`${view.title}: ${String(host.record.row.title ?? host.record.id)}`);
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const layout = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { id: "details" }] });
  host.attach(layout);
  const bar = new app.components.CommandBar({ signal, items: [{ id: "back", label: t("Vissza a listához"), icon: "bi bi-arrow-left" }] });
  bar.on("click", ({ id }) => { if (id === "back" && !app.navigate({ view: listId })) host.close(); });
  bar.mount(layout.getCell("commands"));
  new app.components.RecordDetails({ view: list, record: host.record.row, showId: false, longText: "card", signal }).mount(layout.getCell("details"));
  // Registered after the components, so they detach from their cells before the layout goes (the Layout recipe).
  signal.addEventListener("abort", () => layout.destructor(), { once: true });
  return { destroy: () => controller.abort() };
}

const mediaSheet: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<SheetOptions>) => sheet(app, host, view) });
};
export default mediaSheet;

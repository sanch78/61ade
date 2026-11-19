// D12 `Médiaböngésző` (modules/media-sheets.json, docs/demos.md#d12-media-browser, FB-0222): a page view of 61ade
// components in a PageLayout whose `Kiválasztott médialap` panel holds an inner layout (`inner`): frameless regions
// divided by draggable lines, each an ordinary region of the page. The list of the media sheets in a framed panel
// drives them: the selected sheet's `Adatok` fields (RecordDetails `fields`, FB-0223), its image (MediaPlayer) and its
// brief (a plain element of the page's own, `attach`). On a phone the panels and the inner regions stack, with their
// own kept sizes.
import type { Application, ApplicationModule, ListKindOptions, MediaPlayer, PageLayout, PageRegion, RecordDetails, Row, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
import "./media-browser.css";

/** `views.demo.media-browser.options` of media-sheets.json. */
type BrowserOptions = { list?: string };

const KIND = "demo.media-browser", PHONE = "(max-width: 767px)";
type Media = { id: string; name: string; mime_type: string; revision: string };

function browser(app: Application, host: ViewHost, view: ViewDefinition<BrowserOptions>): ViewInstance {
  const t = (key: string) => app.i18n.t(key);
  const list = app.viewDefinition(view.options?.list ?? "demo_media_sheets") as ViewDefinition<ListKindOptions> | undefined;
  if (!list) throw new Error(t("A médialapok listája nem érhető el."));
  const fields = list.options!.detailFields ?? list.options!.columns, image = fields.find(field => field.id === "file_id");
  // The `Adatok` section's fields: its label is translated, so the section is read from one of its fields.
  const section = fields.find(field => field.id === "title")?.section;
  const data = fields.filter(field => section !== undefined && field.section === section).map(field => field.id);
  const phone = matchMedia(PHONE), root = document.createElement("div");
  root.style.cssText = "width:100%;height:100%";
  host.attach(root);
  let build: AbortController | undefined, selected: string | undefined;
  // No sheet selected: the page has no place yet, so its own path is empty rather than the menu entry again (FB-0236).
  const unplaced = (): void => host.setLocation([], { from: "root" });
  unplaced();

  const render = (): void => {
    if (host.signal.aborted) return;
    build?.abort();
    const controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    // The inner layout: the data beside the image, the brief below; the brief is the last region and declares the
    // line before it. The image has only a minimum and fills the rest.
    const inner: PageRegion = phone.matches
      ? { rows: [{ id: "data", height: 180, minHeight: 80, resizable: true }, { id: "image", minHeight: 120 }, { id: "brief", height: 180, minHeight: 80, resizable: true }] }
      : { rows: [{ cols: [{ id: "data", width: 320, minWidth: 200, resizable: true }, { id: "image", minWidth: 160 }] }, { id: "brief", height: 200, minHeight: 80, resizable: true }] };
    const selection = { id: "selected", header: t("Kiválasztott médialap"), inner };
    const page: PageLayout = new app.components.PageLayout({ id: `${view.id}.${phone.matches ? "narrow" : "wide"}`, tree: phone.matches
      ? { rows: [{ id: "sheets", header: list.title, height: 260, minHeight: 140, resizable: true, collapsable: true }, { ...selection, minHeight: 240 }] }
      : { cols: [{ id: "sheets", header: list.title, width: 420, minWidth: 260, resizable: true, collapsable: true }, { ...selection, minWidth: 360 }] } });
    page.mount(root);
    let details: RecordDetails | undefined;
    const brief = document.createElement("div");
    brief.className = "demo-media-brief";
    brief.setAttribute("role", "region");
    brief.setAttribute("aria-label", t("Leírás"));
    let player: MediaPlayer | undefined, epoch = 0;
    const empty = (): void => {
      for (const id of ["data", "image", "brief"]) page.placeholder(id, { text: t("Válassz egy médialapot a listában.") });
    };
    // The selected sheet, read through the list view's `get` (a newer selection wins).
    const show = async (id: string | undefined): Promise<void> => {
      const current = ++epoch;
      selected = id;
      if (!id) { empty(); unplaced(); return; }
      for (const region of ["data", "image", "brief"]) page.placeholder(region, { busy: true });
      const row = await app.server.call<Row>(list.resource!, "get", { id, signal }).catch(() => undefined);
      if (signal.aborted || current !== epoch) return;
      if (!row) { empty(); host.setLocation([]); return; }
      // A path of the page's own (FB-0226), the whole bar: the list, the sheet's channel as a link to the list filtered
      // by it, then the sheet. Without a selection the bar is empty (FB-0236); a sheet that cannot be read returns it
      // to the automatic menu path (`setLocation([])`).
      const channel = String(row.channel ?? ""), options = fields.find(field => field.id === "channel")?.options ?? {};
      host.setLocation([
        { label: list.title, ...(list.icon ? { icon: list.icon } : {}), target: { view: list.id } },
        ...(channel ? [{ label: options[channel] ?? channel, target: { view: list.id, filters: { channel } } }] : []),
        { label: String(row.title ?? "#" + id) },
      ], { from: "root" });
      if (details) await details.show(row);
      else (details = new app.components.RecordDetails({ view: list, fields: data, record: row, showId: false, signal })).mount(page.cell("data"));
      player?.destroy(); player = undefined;
      const media = (row._media as Record<string, Media | null> | undefined)?.file_id;
      if (media && image?.media) {
        player = new app.components.MediaPlayer({ source: { resource: image.media, action: "content_stream", id: media.id, version: media.revision },
          mime: media.mime_type, name: media.name, toolbar: false, signal });
        player.mount(page.cell("image"));
      } else page.placeholder("image", { text: t("Ehhez a médialaphoz nincs kép."), busy: false });
      brief.textContent = String(row.brief ?? "") || "—";
      if (!brief.isConnected) page.attach("brief", brief);
      page.placeholder("brief", { busy: false });
    };
    empty();
    const sheets = new app.components.ListView({ view: list, panel: false, signal });
    sheets.on("select", ({ row }) => { void show(row ? String(row.id) : undefined); });
    sheets.mount(page.cell("sheets"));
    if (selected) void show(selected);
    // Last: the components leave their cells before the page goes (the Layout recipe).
    // The details and the player are created on a selection, after this listener, so they are destroyed here first.
    signal.addEventListener("abort", () => { details?.destroy(); player?.destroy(); page.destroy(); }, { once: true });
  };
  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => build?.abort() };
}

const mediaBrowser: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<BrowserOptions>) => browser(app, host, view) });
};
export default mediaBrowser;

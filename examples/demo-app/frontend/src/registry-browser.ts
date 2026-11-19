// D8 Kulcsböngésző (docs/demos.md#d8-key-browser): view kind `demo.registry-browser` over the registry keys
// (modules/registry.json). A three-column page from public components only: the keys as a `Tree` (a menu-less list
// view with a hierarchy on itself), tabs with the selected key's values (a scoped `ListView`) and its data
// (`RecordDetails`), and the details of the value selected in the list. The tree drives the page through its `select`
// event; Enter or a double-click on a key (`activate`) opens its data. The values list's toggle command
// `demo.subkey-values` (`Alkulcsok értékei`) switches the list between the key's own values (`key_id`) and the values
// of its direct subkeys (`parent_key_id`, a computed field): the page reads the kept state before the first list, so
// the first load already uses it, and mounts the list of the other scope on every change. Each panel is a region of
// the page: its placeholder with a hint while it has no record, then the component mounted into the same region,
// replaced there as often as the selection changes; an empty
// values list says which scope has no values (`emptyText`). The values list of both scopes shares its view choices (`preferencesKey`); on the computed
// scope its `Hozzáadás` presets the selected key (`createDefaults`); the key's computed parent is hidden from the
// value details (`column.details: false`).
import type { Application, ApplicationModule, ListKindOptions, ListView, PageLayout, PageRegion, RecordDetails, Row, Tree, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";

/** `views.demo.registry-browser.options` of registry.json: the tree's node view and the values view (both `menu: false`). */
type BrowserOptions = { tree?: string; values?: string };

const KIND = "demo.registry-browser";
const TOGGLE = "demo.subkey-values";
const PHONE = "(max-width: 767px)";

function browser(app: Application, host: ViewHost, view: ViewDefinition<BrowserOptions>): ViewInstance {
  const t = app.i18n.t, options = view.options ?? {};
  const nodes = options.tree ? app.viewDefinition(options.tree) as ViewDefinition<ListKindOptions> | undefined : undefined;
  const values = options.values ? app.viewDefinition(options.values) as ViewDefinition<ListKindOptions> | undefined : undefined;
  if (!nodes) {
    // Without the node view (ACL) there is no tree: the page says so instead.
    const empty = document.createElement("p");
    empty.style.cssText = "margin:16px";
    empty.textContent = t("A kulcsok nem érhetők el.");
    host.attach(empty);
    return { destroy: () => empty.remove() };
  }
  // Built again when the phone breakpoint changes (the tree keeps its expansion and selection, the toggle its state).
  const media = matchMedia(PHONE);
  let build: AbortController | undefined, keys: Tree | undefined, list: ListView | undefined;
  const root = document.createElement("div");
  root.style.cssText = "width:100%;height:100%";
  host.attach(root);
  const render = () => {
    if (host.signal.aborted) return;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    previous?.abort();
    const phone = media.matches;
    const center: PageRegion = { tabs: [{ id: "values", header: t("Értékek") }, { id: "key", header: t("Kulcs adatai") }], minWidth: 240 };
    const tree: PageRegion = phone
      ? { rows: [{ id: "tree", header: nodes.title, height: 220, minHeight: 120, resizable: true, collapsable: true }, { ...center, minHeight: 200 }, { id: "value", header: t("Érték adatai"), height: 200, collapsable: true, collapsed: true }] }
      : { cols: [{ id: "tree", header: nodes.title, width: 280, minWidth: 180, resizable: true, collapsable: true }, center, { id: "value", header: t("Érték adatai"), width: 300, minWidth: 200, resizable: true, collapsable: true }] };
    // The two arrangements keep their own panel sizes.
    const layout: PageLayout = new app.components.PageLayout({ id: `${view.id}.${phone ? "narrow" : "wide"}`, tree });
    layout.mount(root);

    const nodeTree: Tree = keys = new app.components.Tree({ view: nodes, label: "name", id: `${view.id}.tree`, expandControl: true });
    nodeTree.mount(layout.cell("tree"));

    // A region's placeholder shows while no component is mounted there. Not `busy` while the tree starts: a tree whose
    // roots fail to load or are empty selects nothing and reports no `select` that would end it.
    layout.placeholder("key", { text: t("Válassz egy kulcsot a fában.") });
    layout.placeholder("value", { text: t("Válassz egy értéket a listában.") });
    layout.placeholder("values", { text: values ? t("Válassz egy kulcsot a fában.") : t("Az értékek nem érhetők el.") });
    let keyDetails: RecordDetails | undefined, valueDetails: RecordDetails | undefined;
    let node: Row | undefined;
    // The kept state of the toggle, read before the first list: the first load already uses the right scope.
    let subkeys = app.preferences.scope(TOGGLE).get<boolean>(values?.id ?? "") === true;

    const showValue = (row: Row | undefined) => {
      if (!values) return;
      if (!row) { valueDetails?.destroy(); valueDetails = undefined; return; }
      if (valueDetails) { void valueDetails.show(row).catch(() => { /* the error dialog was shown */ }); return; }
      valueDetails = new app.components.RecordDetails({ view: values, record: row, showId: false });
      valueDetails.mount(layout.cell("value"));
    };
    /** The values list of the selected key in the current mode: a fresh scoped list (its scope is fixed at creation). */
    const showList = () => {
      list?.destroy(); list = undefined;
      showValue(undefined);
      if (!values || !node) return;
      // Both scopes share one set of view choices; on the computed scope the built-in create presets the key itself.
      list = new app.components.ListView({ view: values, scope: { field: subkeys ? "parent_key_id" : "key_id", id: String(node.id) }, panel: false, showId: false,
        preferencesKey: `${view.id}.values`, emptyText: subkeys ? t("Az alkulcsoknak nincs értéke.") : t("A kulcsnak nincs saját értéke."),
        ...(subkeys ? { createDefaults: { key_id: String(node.id) } } : {}) });
      list.on("select", ({ row }) => showValue(row));
      list.on("toggle", ({ command, pressed }) => { if (command === TOGGLE && pressed !== subkeys) { subkeys = pressed; showList(); } });
      list.mount(layout.cell("values"));
    };
    nodeTree.on("select", ({ row }) => {
      const changed = String(row?.id ?? "") !== String(node?.id ?? "");
      node = row;
      if (!row) { keyDetails?.destroy(); keyDetails = undefined; }
      else if (keyDetails) void keyDetails.show(row).catch(() => { /* the error dialog was shown */ });
      else { keyDetails = new app.components.RecordDetails({ view: nodes, record: row, showId: false }); keyDetails.mount(layout.cell("key")); }
      if (changed) showList();
    });
    // Enter or a double-click on a key opens its data.
    nodeTree.on("activate", () => layout.tabsOf("key")?.select("key"));

    // Registered after the components, so they are destroyed (and detached from their cells) before the layout.
    signal.addEventListener("abort", () => { list?.destroy(); list = undefined; keyDetails?.destroy(); valueDetails?.destroy(); nodeTree.destroy(); layout.destroy(); }, { once: true });
  };
  render();
  media.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => build?.abort(), refresh: () => { void keys?.refresh(); list?.refresh(); } };
}

const registryBrowser: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<BrowserOptions>) => browser(app, host, view) });
  // A two-state command of the values list's own toolbar; its state is kept per view, so the page above reads it
  // before it creates the list and keeps it when it mounts the list of the other scope.
  // Pinned: it stays in the bar of the narrow values panel when the other commands collapse into `Műveletek`.
  app.commands.register(TOGGLE, { type: "toggle", label: "Alkulcsok értékei", icon: "bi bi-folder", placement: "toolbar", pressed: false, pinned: true });
};
export default registryBrowser;

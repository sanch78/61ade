// D9 Munkaasztal (docs/demos.md#toolkit-consumer): the menu-row command `demo.workbench` (application.php
// `menuCommands`) and its long-lived work window: non-modal, without a view's signal, so it stays open with its draft
// across navigation; maximizable and remembered per user (`id`). The note is only browser state of the open window.
// Its header and composer rows are `CommandBar`s (docs/toolkit.md#commandbar-title): the header a title with a popup
// menu (`Előzmények`, synthetic drafts grouped by date with the current one checked), the composer the model picker
// (`Automatikus`, the models, then the chosen model's efforts). The drafts and models are synthetic; nothing is saved.
import type { AppWindow, ApplicationModule, PopupMenuItem } from "@61ade/admin";

type Model = { id: string; label: string; efforts: string[]; standard?: boolean };
/** Effort keys (entry ids are `[A-Za-z0-9_.:-]+`) and their labels. */
const EFFORTS: Record<string, string> = { low: "Alacsony", medium: "Közepes", high: "Magas" };
const MODELS: Model[] = [
  { id: "swift", label: "Gyors", efforts: ["low"] },
  { id: "balanced", label: "Kiegyensúlyozott", efforts: ["low", "medium", "high"], standard: true },
  { id: "thorough", label: "Alapos", efforts: ["medium", "high"] },
];
const HOUR = 36e5, DAY = 24 * HOUR;

const workbench: ApplicationModule = app => {
  const t = app.i18n.t;
  let open: AppWindow | undefined;
  // The page's open view, told by the view events (a window of a record view leaves the page's view as it is).
  let current = "";
  app.events.on("view:opened", ({ id, open: mode }) => { if (mode === "page") current = app.viewDefinition(id)?.title ?? id; });
  let form: InstanceType<typeof app.dhx.Form> | undefined;
  const showView = () => form?.getItem("view")?.setValue(current || t("Üres munkaterület"));
  app.events.on("view:opened", () => showView());
  app.events.on("view:closed", ({ id }) => { if (app.viewDefinition(id)?.title === current) { current = ""; showView(); } });

  // Synthetic drafts, relative to the window's opening: three today, six in the last week, the rest older (enough to scroll).
  const drafts = (now: number) => Array.from({ length: 18 }, (_, index) => ({
    id: `draft-${index + 1}`, name: t("Vázlat {n}", { n: index + 1 }),
    // The first three are today's at any hour of the day.
    at: index < 3 ? Math.max(new Date(now).setHours(0, 0, 0, 0), now - (index + 1) * 2 * HOUR) : now - (index < 9 ? (index - 1) * DAY : (index + 6) * DAY),
  }));

  app.commands.register("demo.workbench", {
    placement: "menu",
    run({ view }) {
      // One window: the command brings an open one to the front instead of opening a second.
      if (open) { open.window.setActive(); return; }
      if (view && !current) current = view.title;
      const win = open = app.ui.window({ title: t("Munkaasztal"), width: 880, height: 560, fit: false, modal: false, maximizable: true, id: "demo.workbench" });
      const signal = win.signal;
      signal.addEventListener("abort", () => { open = undefined; form = undefined; }, { once: true });
      const now = Date.now(), list = drafts(now);
      const locale = app.i18n.locale(), relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const clock = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }), date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
      const daysAgo = (at: number) => Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY);
      const ago = (at: number) => { const days = daysAgo(at); return days <= 0 ? clock.format(at) : days < 7 ? relative.format(-days, "day") : date.format(at); };
      let draft = list[0].id, model: Model | undefined, effort = "";

      const layout = new app.dhx.Layout(document.createElement("div"), { type: "none", rows: [{ id: "head", height: app.ui.headerRowHeight }, { id: "body" }, { id: "attachments", height: "content" }, { id: "composer", height: 48 }] } as any);
      // Attachments go to the stored-file upload action of the attachments demo (pending uploads, expired by the project).
      const stored = app.viewDefinition("demo_attachments")?.actions.flatMap(a => a.fields ?? []).find(f => f.file && "upload" in f.file)?.file;
      const policy = stored && "upload" in stored && stored.canUpload ? stored.policy : null;
      const files = policy ? new app.components.Attachments({ label: t("Csatolmányok"), signal,
        upload: { resource: "demo_attachments", action: "file_upload", target: null, targetLabel: t("Munkaasztal"), policy } }) : undefined;
      const modelText = () => model ? `${t(model.label)}${model.efforts.length > 1 ?  " · " + t(EFFORTS[effort]) : ""}` : t("Automatikus");
      const head = new app.components.CommandBar({ label: t("Munkaasztal"), narrow: "icons", signal, items: [
        { type: "title", id: "title", label: list[0].name },
        { type: "spacer" },
        { type: "popup", id: "history", label: t("Előzmények"), icon: "bi bi-clock-history", items: () =>
          ([["Ma", (d: number) => d <= 0], ["Az elmúlt 7 nap", (d: number) => d > 0 && d < 7], ["Régebbi", (d: number) => d >= 7]] as const)
            .map(([label, test]): PopupMenuItem => ({ type: "group", label: t(label),
              items: list.filter(x => test(daysAgo(x.at))).map(x => ({ id: x.id, label: x.name, detail: ago(x.at), checked: x.id === draft })) })) },
      ] });
      head.on("select", ({ item }) => { draft = item; head.update("title", { label: list.find(x => x.id === item)!.name }); });
      const composer = new app.components.CommandBar({ label: t("Modell"), placement: "bottom", signal, items: [
        ...(files ? [{ id: "attach", label: t("Csatolás"), icon: "bi bi-paperclip" }] : []),
        { type: "popup", id: "model", label: t("Modell: {choice}", { choice: modelText() }), menuLabel: t("Modell"), icon: "bi bi-sliders", items: () => {
          const groups: PopupMenuItem[] = [{ type: "group", label: t("Modell"), items: [
            { id: "model:auto", label: t("Automatikus"), detail: t("a feladat alapján"), checked: !model },
            ...MODELS.map(m => ({ id: "model:" + m.id, label: t(m.label), detail: m.standard ? t("alapértelmezett") : undefined, checked: m === model })),
          ] }];
          if (model && model.efforts.length > 1)
            groups.push({ type: "group", label: t("Erősség"), items: model.efforts.map(e => ({ id: "effort:" + e, label: t(EFFORTS[e]), checked: e === effort })) });
          return groups;
        } },
      ] });
      composer.on("click", ({ id }) => { if (id === "attach") files?.choose(); });
      composer.on("select", ({ item }) => {
        if (item.startsWith("model:")) {
          model = MODELS.find(m => "model:" + m.id === item);
          effort = model ? (model.efforts.includes(effort) ? effort : model.efforts[Math.floor((model.efforts.length - 1) / 2)]) : "";
        } else effort = item.slice("effort:".length);
        composer.update("model", { label: t("Modell: {choice}", { choice: modelText() }) });
      });
      form = new app.dhx.Form(document.createElement("div"), { padding: 16, rows: [
        { type: "input", name: "view", label: t("Aktuális nézet"), labelPosition: "left", labelWidth: 140, readOnly: true },
        { type: "textarea", name: "note", label: t("Jegyzet"), labelPosition: "top", height: 240,
          placeholder: t("Írj ide; a szöveg nézetváltás után is megmarad, amíg az ablak nyitva van.") },
        { align: "end", cols: [{ type: "button", name: "clear", text: t("Jegyzet törlése"), view: "link", color: "danger" }] },
      ] });
      // The confirmation stacks above the work window and gives the focus back to it.
      form.getItem("clear").events.on("click", async () => {
        if (await app.ui.dialog({ message: t("Törlöd a jegyzetet?"), mode: "confirm", severity: "warning" })) form?.getItem("note").setValue("");
      });
      head.mount(layout.getCell("head"));
      layout.getCell("body").attach(form);
      files?.mount(layout.getCell("attachments"));
      composer.mount(layout.getCell("composer"));
      win.attach(layout);
      signal.addEventListener("abort", () => layout.destructor(), { once: true });
      showView();
    },
  });
};
export default workbench;

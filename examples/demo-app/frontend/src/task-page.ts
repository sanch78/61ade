// D7 Task page (docs/demos.md#d7-task-page): record view kind `demo.task-page` of `demo_tasks` (modules/tasks.json),
// opened by the record command `demo.task-page` (`Feladatlap`) of the Feladatok toolbar. A 2U page from public
// components only: a collapsible control region (the task's `Adatok` and `Szerkesztés` in an Accordion) beside tabs;
// `Munka` is a nested PageLayout: a command bar above the notes table and a collapsible side panel with the selected
// note, which the bar's toggle shows or hides (`PageLayout.collapse`/`expand` and its `collapse` event); on a phone
// the control region collapses to its header while `Munka` is shown, without changing the user's own choice.
// `Jegyzetek` holds the task's notes, a list without a menu entry (`demo_task_notes`, `menu: false`) sorted oldest
// first (`view.sort`) as cards, whose long text shows a 4-line preview.
import type { Accordion, Application, ApplicationModule, CommandBar, ListKindOptions, ListView, PageLayout, PageRegion, RecordDetails, RecordForm, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";

/** `views.demo.task-page.options` of tasks.json: the task list (details, form) and the notes list (`menu: false`, scoped to `task_id`). */
type PageOptions = { details?: string; notes?: string };

const KIND = "demo.task-page";
const PHONE = "(max-width: 767px)";

/**
 * One opening of the page. Built for the current width (control region beside the tabs on a desktop, below them on a
 * phone) and rebuilt when the width crosses 768 px; each build's AbortController destroys its components, then its
 * containers.
 */
function page(app: Application, host: ViewHost, view: ViewDefinition<PageOptions>): ViewInstance {
  const t = (key: string, params?: Record<string, unknown>) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A feladatlap egy feladathoz nyílik meg."));
  const row = host.record.row, task = String(host.record.id);
  const list = app.viewDefinition(view.options?.details ?? host.record.resource) as ViewDefinition<ListKindOptions> | undefined;
  const notes = view.options?.notes ? app.viewDefinition(view.options.notes) as ViewDefinition<ListKindOptions> | undefined : undefined;
  const editable = !!list?.actions.some(action => action.name === "update") && (!Array.isArray(row._actions) || row._actions.includes("update"));
  const phone = matchMedia(PHONE);
  let build: AbortController | undefined;
  host.setTitle(`${view.title}: ${String(row.title ?? task)}`);

  const root = document.createElement("div");
  root.style.cssText = "width:100%;height:100%";
  host.attach(root);

  const render = (): void => {
    if (host.signal.aborted) return;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    previous?.abort();
    // The control region is a collapsible leaf; its sections are an Accordion of their own inside it.
    const control: PageRegion = { id: "control", header: t("Feladat"), collapsable: true };
    const tabs: PageRegion = { tabs: [...(notes ? [{ id: "work", header: t("Munka") }] : []), { id: "notes", header: t("Jegyzetek") }] };
    const layout = new app.components.PageLayout({ id: `${view.id}.${phone.matches ? "narrow" : "wide"}`,
      tree: phone.matches
        ? { rows: [{ ...tabs, minHeight: 240 }, { ...control, height: 320, minHeight: 120, resizable: true }] }
        : { cols: [{ ...control, width: 360, minWidth: 260, resizable: true }, { ...tabs, minWidth: 320 }] } });
    layout.mount(root);

    const sections: Accordion = new app.components.Accordion({ id: `${view.id}.control`, sections: [
      { id: "details", label: t("Adatok") }, { id: "edit", label: t("Szerkesztés"), disabled: !editable }], open: ["details"] });
    layout.attach("control", sections);
    const details = list ? new app.components.RecordDetails({ view: list, record: row, signal, showId: false }) : undefined;
    details?.mount(sections.cell("details"));
    // The form costs a request: created when `Szerkesztés` first opens (or opens remembered).
    let form: RecordForm | undefined;
    const edit = () => {
      if (form || signal.aborted) return;
      form = new app.components.RecordForm({ resource: host.record!.resource, action: "update", id: task, cancel: false });
      form.on("saved", () => {
        const title = form?.values().title;
        if (typeof title === "string" && title.trim()) host.setTitle(`${view.title}: ${title}`);
        void details?.show(task).catch(() => { /* the error dialog was shown; the details keep the last row */ });
      });
      form.mount(sections.cell("edit"));
    };
    sections.on("toggle", ({ id, open }) => { if (open && id === "edit") edit(); }, { signal });
    if (sections.isOpen("edit")) edit();

    // The task's notes: cards, oldest first (the view's declared sort), new notes get this task.
    let noteList: ListView | undefined, workList: ListView | undefined, selected: RecordDetails | undefined, work: PageLayout | undefined, bar: CommandBar | undefined;
    if (notes) {
      noteList = new app.components.ListView({ view: notes, scope: { field: "task_id", id: task }, mode: "cards", panel: false, showId: false });
      noteList.mount(layout.cell("notes"));

      // `Munka`: the bar above the notes table (its own preferences: the page keeps a table beside the cards) and the
      // collapsible side panel with the selected note, on a phone below the table.
      work = new app.components.PageLayout({ id: `${view.id}.work.${phone.matches ? "narrow" : "wide"}`,
        tree: phone.matches
          ? { rows: [{ id: "commands", height: 56 }, { id: "main", minHeight: 160 }, { id: "side", header: t("Kijelölt jegyzet"), height: 240, minHeight: 120, collapsable: true, resizable: true }] }
          : { rows: [{ id: "commands", height: 56 }, { cols: [{ id: "main", minWidth: 240 }, { id: "side", header: t("Kijelölt jegyzet"), width: 340, minWidth: 220, collapsable: true, resizable: true }] }] } });
      layout.attach("work", work);
      const side = work;
      bar = new app.components.CommandBar({ label: t("Munka"), signal, items: [
        { type: "toggle", id: "side", label: t("Oldalpanel"), icon: "dxi dxi-border-right", pressed: !side.isCollapsed("side") }] });
      bar.mount(side.cell("commands"));
      // The toggle follows the panel, also when the user collapses it by its header; the toggle itself collapses it.
      side.on("collapse", ({ id, collapsed }) => { if (id === "side") bar?.update("side", { pressed: !collapsed }); }, { signal });
      bar.on("toggle", ({ id, pressed }) => { if (id === "side") { if (pressed) side.expand("side"); else side.collapse("side"); } });
      workList = new app.components.ListView({ view: { ...notes, id: `${view.id}.work` }, scope: { field: "task_id", id: task }, mode: "table", panel: false, showId: false });
      workList.mount(side.cell("main"));
      // The panel holds one element of the page: a hint until a note is selected, then that note's details.
      const panel = document.createElement("div"), hint = document.createElement("p");
      panel.style.cssText = "width:100%;height:100%";
      hint.style.cssText = "margin:16px";
      hint.textContent = t("Válassz egy jegyzetet.");
      panel.append(hint);
      side.attach("side", panel);
      workList.on("target", ({ row: note }) => {
        if (!note) return;
        if (selected) { void selected.show(note).catch(() => { /* the error dialog was shown */ }); return; }
        hint.remove();
        selected = new app.components.RecordDetails({ view: notes, record: note, showId: false });
        selected.mount(panel);
      }, { signal });

      // On a phone the control region is below the tabs: while `Munka` is shown it collapses to its header and gives
      // the work area the height. The page's own collapse is not kept; leaving the tab restores what the user had.
      if (phone.matches) {
        const pages = layout.tabsOf("work")!;
        let restore = false;
        const follow = (active: string) => {
          if (active === "work") { if (!layout.isCollapsed("control")) { restore = true; layout.collapse("control"); } }
          else if (restore) { restore = false; layout.expand("control"); }
        };
        // A header click while `Munka` is shown is the user's own choice: nothing to restore any more.
        layout.on("collapse", ({ id }) => { if (id === "control" && pages.active() === "work" && !layout.isCollapsed("control")) restore = false; }, { signal });
        pages.on("change", ({ id }) => follow(id), { signal });
        follow(pages.active());
      }
    } else {
      // Without the notes list (ACL) the tab says so.
      const empty = document.createElement("p");
      empty.style.cssText = "margin:16px";
      empty.textContent = t("A jegyzetek nem érhetők el.");
      layout.attach("notes", empty);
    }
    // Registered after the components, so they are destroyed (and detached from their cells) before the containers.
    signal.addEventListener("abort", () => {
      form?.destroy(); form = undefined; noteList?.destroy(); noteList = undefined; selected?.destroy(); workList?.destroy(); bar?.destroy();
      work?.destroy(); sections.destroy(); layout.destroy();
    }, { once: true });
  };

  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => build?.abort() };
}

const taskPage: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<PageOptions>) => page(app, host, view) });
  // `Feladatlap` on the Feladatok toolbar: opens the page of the cursor task.
  app.commands.register("demo.task-page", {
    label: "Feladatlap", icon: "dxi dxi-file-document-outline", placement: "record",
    enabled: ({ row, rows }) => !!row && rows.length <= 1 && !!app.viewDefinition(KIND),
    run: ({ app, row }) => { if (row) app.navigate({ view: KIND, record: String(row.id) }); },
  });
};
export default taskPage;

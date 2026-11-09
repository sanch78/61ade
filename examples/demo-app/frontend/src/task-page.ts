// D7 Task page (docs/demos.md#d7-task-page): record view kind `demo.task-page` of `demo_tasks` (modules/tasks.json),
// opened by the record command `demo.task-page` (`Feladatlap`) of the Feladatok toolbar. A 2U page from public
// components only: a collapsible control region (the task's `Adatok` and `Szerkesztés` in an Accordion) beside tabs;
// `Jegyzetek` holds the task's notes, a list without a menu entry (`demo_task_notes`, `menu: false`) sorted oldest
// first (`view.sort`) as cards, whose long text shows a 4-line preview.
import type { Accordion, Application, ApplicationModule, ListKindOptions, ListView, PageRegion, RecordForm, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";

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
    const tabs: PageRegion = { tabs: [{ id: "notes", header: t("Jegyzetek") }] };
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
    let noteList: ListView | undefined;
    if (notes) {
      noteList = new app.components.ListView({ view: notes, scope: { field: "task_id", id: task }, mode: "cards", panel: false, showId: false });
      noteList.mount(layout.cell("notes"));
    } else {
      // Without the notes list (ACL) the tab says so.
      const empty = document.createElement("p");
      empty.style.cssText = "margin:16px";
      empty.textContent = t("A jegyzetek nem érhetők el.");
      layout.attach("notes", empty);
    }
    // Registered after the components, so they are destroyed (and detached from their cells) before the containers.
    signal.addEventListener("abort", () => { form?.destroy(); form = undefined; noteList?.destroy(); noteList = undefined; sections.destroy(); layout.destroy(); }, { once: true });
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

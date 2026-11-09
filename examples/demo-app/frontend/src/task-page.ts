// D7 Task page (docs/demos.md#d7-task-page): record view kind `demo.task-page` of `demo_tasks` (modules/tasks.json),
// opened by the record command `demo.task-page` (`Feladatlap`) of the Feladatok toolbar. A 2U page from public
// components only: a collapsible control region (the task's `Adatok` and `Szerkesztés` in an Accordion) beside tabs;
// `Munka` is a nested PageLayout: a command bar above the notes table and a collapsible side panel with the selected
// note, which the bar's toggle shows or hides (`PageLayout.collapse`/`expand` and its `collapse` event); on a phone
// the control region collapses to its header while `Munka` is shown, without changing the user's own choice. The bar's
// `További műveletek` menu (`type: "menu"`) holds the commands of the selected note, enabled while one is selected.
// `Jegyzetek` holds the task's notes, a list without a menu entry (`demo_task_notes`, `menu: false`) sorted oldest
// first (`view.sort`) as cards, whose long text shows a 4-line preview. `Vázlat` is the module's own drawing surface (a
// canvas) between two command bars in a borderless box Layout, edge to edge (`app.ui.attach`).
import type { Accordion, Application, ApplicationModule, CommandBar, ListKindOptions, ListView, PageLayout, PageRegion, RecordDetails, RecordForm, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";

/** `views.demo.task-page.options` of tasks.json: the task list (details, form) and the notes list (`menu: false`, scoped to `task_id`). */
type PageOptions = { details?: string; notes?: string };

const KIND = "demo.task-page";
const PHONE = "(max-width: 767px)";
/** The sketch's pen colours; `ink` is the theme's text colour. */
const COLORS: Record<string, string> = { ink: "", blue: "#1f6feb", red: "#d1242f" };

interface Stroke { color: string; width: number; points: [number, number][] }

/**
 * The `Vázlat` surface: the module's own canvas, created once per opening so its strokes, listeners and focus outlive
 * the rebuilds of the page. Pointer strokes (stored relative to the size, so a resize keeps the drawing), Ctrl+Z
 * undoes the last one; every change and resize repaints in the next animation frame. Nothing is saved.
 */
function sketchPad(label: string, signal: AbortSignal) {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d")!;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;background:var(--dhx-background-primary)";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  canvas.dataset.demoSketch = "";
  const strokes: Stroke[] = [], pen = { color: "ink", width: 3 }, listeners = new Set<() => void>();
  let frame = 0, current: Stroke | undefined;
  const paint = () => {
    frame = 0;
    const { width, height } = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1;
    if (!width || !height) return; // an inactive tab: painted again when it is shown (resize)
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = context.lineJoin = "round";
    const ink = getComputedStyle(canvas).color;
    for (const stroke of strokes) {
      context.strokeStyle = COLORS[stroke.color] || ink; context.lineWidth = stroke.width;
      context.beginPath();
      stroke.points.forEach(([x, y], n) => n ? context.lineTo(x * width, y * height) : context.moveTo(x * width, y * height));
      if (stroke.points.length === 1) context.lineTo(stroke.points[0][0] * width, stroke.points[0][1] * height);
      context.stroke();
    }
  };
  const changed = () => { if (!frame) frame = requestAnimationFrame(paint); for (const listener of listeners) listener(); };
  const point = (event: PointerEvent): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height];
  };
  canvas.addEventListener("pointerdown", event => {
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
    strokes.push(current = { color: pen.color, width: pen.width, points: [point(event)] });
    changed();
  }, { signal });
  canvas.addEventListener("pointermove", event => { if (current) { current.points.push(point(event)); changed(); } }, { signal });
  for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, () => { current = undefined; }, { signal });
  canvas.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && strokes.length) { event.preventDefault(); strokes.pop(); changed(); }
  }, { signal });
  const resize = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(paint); });
  resize.observe(canvas);
  signal.addEventListener("abort", () => { resize.disconnect(); cancelAnimationFrame(frame); }, { once: true });
  return {
    element: canvas, pen,
    count: () => strokes.length,
    undo: () => { if (strokes.pop()) changed(); },
    clear: () => { strokes.length = 0; changed(); },
    /** Called after every change of the strokes (the bars' enabled state). */
    onChange: (listener: () => void, options: { signal: AbortSignal }) => {
      listeners.add(listener);
      options.signal.addEventListener("abort", () => listeners.delete(listener), { once: true });
    },
  };
}

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
  const sketch = sketchPad(t("Vázlat"), host.signal);
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
    const tabs: PageRegion = { tabs: [...(notes ? [{ id: "work", header: t("Munka") }] : []), { id: "notes", header: t("Jegyzetek") }, { id: "sketch", header: t("Vázlat") }] };
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
      const deletable = notes.actions.some(action => action.name === "delete");
      bar = new app.components.CommandBar({ label: t("Munka"), signal, items: [
        { type: "toggle", id: "side", label: t("Oldalpanel"), icon: "dxi dxi-border-right", pressed: !side.isCollapsed("side") },
        { type: "spacer" },
        // The commands of the selected note behind one button instead of permanent buttons.
        { type: "menu", id: "more", label: t("További műveletek"), icon: "dxi dxi-dots-vertical", iconOnly: true, items: [
          { id: "show", label: t("Megjelenítés az oldalpanelen"), icon: "dxi dxi-border-right", disabled: true },
          { id: "copy", label: t("Szöveg másolása"), icon: "dxi dxi-copy", disabled: true },
          { type: "separator" },
          { id: "delete", label: t("Törlés"), icon: "dxi dxi-delete", disabled: true, hidden: !deletable }] }] });
      bar.mount(side.cell("commands"));
      // The toggle follows the panel, also when the user collapses it by its header; the toggle itself collapses it.
      side.on("collapse", ({ id, collapsed }) => { if (id === "side") bar?.update("side", { pressed: !collapsed }); }, { signal });
      bar.on("toggle", ({ id, pressed }) => { if (id === "side") { if (pressed) side.expand("side"); else side.collapse("side"); } });
      let current: Record<string, unknown> | undefined;
      bar.on("click", ({ id }) => {
        const note = current;
        if (!note) return;
        if (id === "show") side.expand("side");
        else if (id === "copy") {
          const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
          void (clipboard?.writeText(String(note.body ?? "")) ?? Promise.reject(new Error("clipboard")))
            .then(() => app.ui.toast(t("A jegyzet szövege a vágólapra került.")), () => void app.ui.dialog({ severity: "warning", message: t("A vágólap nem érhető el.") }));
        } else if (id === "delete") void (async () => {
          if (!await app.ui.dialog({ mode: "confirm", severity: "danger", title: t("Törlés"), message: t("Törlöd a kijelölt jegyzetet?"), confirmLabel: t("Törlés") })) return;
          try { await app.server.call(notes.resource!, "delete", { id: String(note.id) }); } catch { return; /* the error dialog was shown */ }
          workList?.refresh(); noteList?.refresh();
        })();
      });
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
        // The menu's entries act on the selected note: enabled while one is selected, also in the collapsed bar.
        current = note;
        for (const id of ["show", "copy", "delete"]) bar?.update(id, { disabled: !note });
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
    // `Vázlat`: the record-view recipe inside a tab: a borderless box Layout of a bar, the canvas and a bottom bar.
    // The canvas goes into the box's stage cell edge to edge (no card or inset) and leaves it when the build aborts.
    const box = new app.dhx.Layout(null, { type: "none", rows: [{ id: "commands", height: 48 }, { id: "stage" }, { id: "footer", height: 48 }] });
    layout.attach("sketch", box);
    const tools = new app.components.CommandBar({ label: t("Vázlat"), signal, items: [
      { type: "segmented", id: "color", label: t("Szín"), value: sketch.pen.color,
        options: [{ value: "ink", label: t("Tinta") }, { value: "blue", label: t("Kék") }, { value: "red", label: t("Piros") }] },
      { type: "spacer" },
      { id: "clear", label: t("Törlés"), icon: "dxi dxi-delete", disabled: !sketch.count() }] });
    tools.mount(box.getCell("commands"));
    app.ui.attach(box.getCell("stage"), sketch.element, { signal });
    const footer = new app.components.CommandBar({ label: t("Toll"), placement: "bottom", signal, items: [
      { type: "range", id: "width", label: t("Vonalvastagság"), min: 1, max: 12, value: sketch.pen.width, valueLabel: true },
      { id: "undo", label: t("Visszavonás"), icon: "dxi dxi-undo", disabled: !sketch.count() }] });
    footer.mount(box.getCell("footer"));
    tools.on("change", ({ id, value }) => { if (id === "color") sketch.pen.color = String(value); });
    tools.on("click", ({ id }) => { if (id === "clear") sketch.clear(); });
    footer.on("change", ({ id, value }) => { if (id === "width") sketch.pen.width = Number(value); });
    footer.on("click", ({ id }) => { if (id === "undo") sketch.undo(); });
    sketch.onChange(() => { tools.update("clear", { disabled: !sketch.count() }); footer.update("undo", { disabled: !sketch.count() }); }, { signal });

    // Registered after the components, so they are destroyed (and detached from their cells) before the containers.
    signal.addEventListener("abort", () => {
      form?.destroy(); form = undefined; noteList?.destroy(); noteList = undefined; selected?.destroy(); workList?.destroy(); bar?.destroy();
      work?.destroy(); box.destructor(); sections.destroy(); layout.destroy();
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

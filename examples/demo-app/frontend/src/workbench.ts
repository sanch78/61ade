// D9 Munkaasztal (docs/demos.md#toolkit-consumer): the menu-row command `demo.workbench` (application.php
// `menuCommands`) and its long-lived work window: non-modal, without a view's signal, so it stays open with its draft
// across navigation; maximizable and remembered per user (`id`). The note is only browser state of the open window.
import type { AppWindow, ApplicationModule } from "@61ade/admin";

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

  app.commands.register("demo.workbench", {
    placement: "menu",
    run({ view }) {
      // One window: the command brings an open one to the front instead of opening a second.
      if (open) { open.window.setActive(); return; }
      if (view && !current) current = view.title;
      const win = open = app.ui.window({ title: t("Munkaasztal"), width: 880, height: 560, fit: false, modal: false, maximizable: true, id: "demo.workbench" });
      win.signal.addEventListener("abort", () => { open = undefined; form = undefined; }, { once: true });
      form = new app.dhx.Form(document.createElement("div"), { padding: 16, rows: [
        { type: "input", name: "view", label: t("Aktuális nézet"), labelPosition: "left", labelWidth: 140, readOnly: true },
        { type: "textarea", name: "note", label: t("Jegyzet"), labelPosition: "top", height: 300,
          placeholder: t("Írj ide; a szöveg nézetváltás után is megmarad, amíg az ablak nyitva van.") },
        { align: "end", cols: [{ type: "button", name: "clear", text: t("Jegyzet törlése"), view: "link", color: "danger" }] },
      ] });
      // The confirmation stacks above the work window and gives the focus back to it.
      form.getItem("clear").events.on("click", async () => {
        if (await app.ui.dialog({ message: t("Törlöd a jegyzetet?"), mode: "confirm", severity: "warning" })) form?.getItem("note").setValue("");
      });
      win.attach(form);
      showView();
    },
  });
};
export default workbench;

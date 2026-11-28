// D13 Szolgáltatásjelentés: record view kind demo.service-page over a provider list's row (service-report.php). The
// record comes from the provider through the ordinary `get`; RecordDetails shows it with the list's own fields.
import type { Application, ApplicationModule, ListKindOptions, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";

const KIND = "demo.service-page";

function servicePage(app: Application, host: ViewHost, view: ViewDefinition): ViewInstance {
  const t = (key: string) => app.i18n.t(key);
  if (!host.record) throw new Error(t("A szolgáltatáslap egy szolgáltatáshoz nyílik meg."));
  const list = app.viewDefinition(host.record.resource) as ViewDefinition<ListKindOptions> | undefined;
  if (!list) throw new Error(t("A szolgáltatásjelentés nem érhető el."));
  const title = () => {
    const label = `${String(host.record!.row.name ?? "")} · ${String(host.record!.row.region ?? "")}`;
    host.setTitle(`${view.title}: ${label}`);
    host.setLocation([{ label }]);
  };
  title();
  const controller = new AbortController(), signal = controller.signal;
  host.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const layout = new app.dhx.Layout(null, { type: "none", rows: [{ id: "details" }] });
  host.attach(layout);
  const details = new app.components.RecordDetails({ view: list, record: host.record.row, signal });
  details.mount(layout.getCell("details"));
  signal.addEventListener("abort", () => layout.destructor(), { once: true });
  return {
    destroy: () => controller.abort(),
    setRecord(record) { title(); void details.show(record.row); },
  };
}

const serviceReport: ApplicationModule = app => {
  app.kinds.register(KIND, { create: (host, view) => servicePage(app, host, view) });
};
export default serviceReport;

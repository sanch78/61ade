// D3 Mérések (docs/demos.md#toolkit-consumer): the `demo.reading-bar` column presentation of the readings list and
// the `demo.readings-dashboard` view kind, a page composed of the framework ListView, a Suite Chart from `app.dhx`
// and an own summary, linked by the list's cursor record and filters. Types only from 61ade; everything else is `app`.
import type { Application, ApplicationModule, ColumnPresentation, ListKindOptions, ListView, Row, ViewDefinition, ViewHost, ViewInstance } from "@61ade/admin";
// The presentation's and the summary's rules; tools/build.mjs emits them into public/app/demo.css (`stylesheets`).
import "./readings.css";

/** `options` of a `demo.readings-dashboard` view (readings.json `views`), checked when the view opens. */
interface DashboardOptions {
  /** The list view shown in the dashboard (an offered view of kind `list`). */
  list: string;
  /** Numeric column summarized and binned. */
  value: string;
  /** Column naming the selected record in the summary. */
  name: string;
  /** Upper bound of the value range; the chart bins `0 … max`. */
  max: number;
  /** Number of equal chart bins (2–20). */
  buckets: number;
}

type Chart = InstanceType<Application["dhx"]["Chart"]>;
type ChartConfig = NonNullable<ConstructorParameters<Application["dhx"]["Chart"]>[1]>;
type Layout = InstanceType<Application["dhx"]["Layout"]>;

const KIND = "demo.readings-dashboard";
const BAR = "demo.reading-bar";
/** The bar presentation draws a value of the 0–100 reading scale. */
const SCALE = 100;
/** The framework's narrow breakpoint (forced cards, collapsed command bar). */
const NARROW = "(max-width: 767px)";

const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** A finite number from a stored reading (`"12.3"`, also a decimal comma); null for anything else. */
const numeric = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
};
const formatter = (locale: string, options: Intl.NumberFormatOptions) => {
  try { return new Intl.NumberFormat(locale, options); } catch { return new Intl.NumberFormat(undefined, options); }
};

/**
 * `demo.reading-bar`: an inline bar of a 0–100 reading with its number beside it (the visible text alternative; the
 * bar is decorative). Every record value goes through `escape`; the width is a clamped number. A value that is not
 * a number renders as escaped text without a bar.
 */
function readingBar(app: Application): ColumnPresentation {
  const number = formatter(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    render(value, _row, _column, size, escape) {
      const reading = numeric(value);
      if (reading === null) return escape(value);
      const width = Math.round(Math.min(SCALE, Math.max(0, reading)) / SCALE * 1000) / 10;
      const text = app.i18n.t("{value} a 100-ból", { value: number.format(reading) });
      return `<span class="demo-reading-bar demo-reading-bar--${size === "card" || size === "tile" ? size : "cell"}" title="${escape(text)}">`
        + `<span class="demo-reading-bar__track" aria-hidden="true"><span class="demo-reading-bar__fill" style="width:${width}%"></span></span>`
        + `<span class="demo-reading-bar__value">${escape(number.format(reading))}</span></span>`;
    },
    text: value => {
      const reading = numeric(value);
      return reading === null ? String(value ?? "") : app.i18n.t("{value} a 100-ból", { value: number.format(reading) });
    },
  };
}

/** The view's options, checked: a malformed declaration fails the view with the shared error dialog. */
function dashboardOptions(view: ViewDefinition<DashboardOptions>): DashboardOptions {
  const o = (view.options ?? {}) as Partial<DashboardOptions>;
  const name = (value: unknown) => typeof value === "string" && /^[a-z][a-z0-9_.-]*$/.test(value);
  if (!name(o.list) || !name(o.value) || !name(o.name) || typeof o.max !== "number" || !(o.max > 0)
    || !Number.isInteger(o.buckets) || o.buckets! < 2 || o.buckets! > 20)
    throw new TypeError(`61ade feature demo: the options of view "${view.id}" need list, value, name, max > 0 and 2–20 buckets.`);
  return o as DashboardOptions;
}

interface Summary {
  loaded: number;
  matched?: number;
  min?: number;
  max?: number;
  average?: number;
  /** Rows per bin of `0 … max`; a value outside the range counts in the nearest bin. */
  bins: number[];
}
function summarize(rows: readonly Row[], options: DashboardOptions, matched?: number): Summary {
  const bins = new Array<number>(options.buckets).fill(0);
  let count = 0, sum = 0, min = Infinity, max = -Infinity;
  for (const row of rows) {
    const value = numeric(row[options.value]);
    if (value === null) continue;
    count++; sum += value; min = Math.min(min, value); max = Math.max(max, value);
    bins[bin(value, options)]++;
  }
  return { loaded: rows.length, ...(matched !== undefined ? { matched } : {}), ...(count ? { min, max, average: sum / count } : {}), bins };
}
const bin = (value: number, options: DashboardOptions) => Math.min(options.buckets - 1, Math.max(0, Math.floor(value / options.max * options.buckets)));

/** A theme colour as the browser resolves it (`rgb(…)`), read through a probe so skins and dark mode apply. */
function themeColor(variable: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable}, ${fallback})`;
  probe.hidden = true;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color || fallback;
}

/**
 * The dashboard page: an overview row (summary, chart) above the readings `ListView`. The summary and the chart show
 * the list's loaded window (`changed`: load, scroll window, filter, live update) and its cursor record (`select`).
 * Desktop puts summary and chart side by side; below 768 px they stack above the list with a compact summary.
 * Crossing the breakpoint rebuilds the page (the list's mode, sort and filters come back from its preferences).
 */
function dashboard(app: Application, host: ViewHost, view: ViewDefinition<DashboardOptions>): ViewInstance {
  const options = dashboardOptions(view);
  // The dashboard's list keeps its own mode, sort, columns and filters: a ListView keys its preferences by the id of
  // the definition it is given, so it gets the offered list view under the dashboard's view id. Filtering here never
  // changes the plain `Mérések` page (its preferences stay under `demo_readings`); the server still checks every call.
  const source = app.viewDefinition(options.list) as ViewDefinition<ListKindOptions> | undefined;
  if (!source || source.kind !== "list") throw new TypeError(`61ade feature demo: "${options.list}" is not an offered list view.`);
  const listView: ViewDefinition<ListKindOptions> = { ...source, id: view.id };
  const t =(key: string, params?: Record<string, unknown>) => app.i18n.t(key, params), locale = app.i18n.locale();
  const decimal = formatter(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const whole = formatter(locale, { maximumFractionDigits: 0 });
  const signed = formatter(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const step = options.max / options.buckets;
  const ranges = Array.from({ length: options.buckets }, (_, index) => `${whole.format(index * step)}–${whole.format((index + 1) * step)}`);
  const narrow = matchMedia(NARROW);
  let session: AbortController | undefined, list: ListView | undefined, closed = false;
  let presets: Record<string, string> = { ...host.filters };

  const build = () => {
    session?.abort();
    const controller = session = new AbortController(), signal = controller.signal;
    const compact = narrow.matches;
    const summaryHeader = compact ? {} : { header: escape(t("Összesítés")) };
    const overview = compact
      ? { type: "space", height: 324, rows: [{ id: "summary", height: 104 }, { id: "chart", header: escape(t("Értékeloszlás")) }] }
      : { type: "space", height: 260, cols: [{ id: "summary", width: 340, ...summaryHeader }, { id: "chart", header: escape(t("Értékeloszlás")) }] };
    const layout: Layout = new app.dhx.Layout(null, { type: "none", css: "demo-readings", rows: [overview, { id: "list" }] } as ConstructorParameters<Application["dhx"]["Layout"]>[1]);

    let rows: readonly Row[] = [], matched: number | undefined, selected: Row | undefined;
    const colors = () => ({ rows: themeColor("--dhx-color-primary", "#0288d1"), selected: themeColor("--dhx-color-success", "#2e7d32") });
    const chartConfig = (palette: ReturnType<typeof colors>): ChartConfig => ({
      type: "bar",
      css: "demo-readings-chart",
      scales: { bottom: { text: "range" }, left: { min: 0, maxTicks: 5 } },
      // `text` names the series in the legend (Suite Chart; not in its typings).
      series: [
        { id: "rows", type: "bar", value: "rows", text: t("Sorok"), fill: palette.rows, color: palette.rows, stacked: true },
        { id: "selected", type: "bar", value: "selected", text: t("Kiválasztott sor"), fill: palette.selected, color: palette.selected, stacked: true },
      ],
      legend: { series: ["rows", "selected"], halign: "right", valign: "top" },
    } as ChartConfig);
    host.attach(layout);
    const chart: Chart = new app.dhx.Chart(null as unknown as HTMLElement, chartConfig(colors()));
    layout.getCell("chart").attach(chart);

    const render = () => {
      const summary = summarize(rows, options, matched);
      const mark = selected ? numeric(selected[options.value]) : null;
      const markBin = mark === null ? -1 : bin(mark, options);
      // The selected row's bin is drawn as its own stacked segment, so the chart shows where it falls.
      chart.data.parse(ranges.map((range, index) => ({ id: String(index), range, rows: summary.bins[index] - (index === markBin ? 1 : 0), selected: index === markBin ? 1 : 0 })));
      const value = (number?: number) => (number === undefined ? "—" : decimal.format(number));
      const count = summary.matched === undefined ? whole.format(summary.loaded) : `${whole.format(summary.loaded)} / ${whole.format(summary.matched)}`;
      const choice = selected
        ? `${String(selected[options.name] ?? selected.id)}: ${mark === null ? "—" : decimal.format(mark)}${mark !== null && summary.average !== undefined ? ` (${t("átlagtól {delta}", { delta: signed.format(mark - summary.average) })})` : ""}`
        : t("Nincs kiválasztott sor");
      const stat = (id: string, label: string, text: string, wide = false) =>
        `<div class="demo-readings-stat${wide ? " demo-readings-stat--wide" : ""}" data-demo-stat="${id}"><dt>${escape(label)}</dt><dd title="${escape(text)}">${escape(text)}</dd></div>`;
      // The chart's text alternative: every bin, and the bin the selected row is drawn in.
      const distribution = t("Értékeloszlás: {bins}", { bins: ranges.map((range, index) => t("{range}: {count} sor", { range, count: summary.bins[index] })).join("; ") })
        + (markBin < 0 ? "" : ". " + t("Kiválasztott sor: {range}", { range: ranges[markBin] }));
      layout.getCell("summary").attachHTML(`<div class="demo-readings-summary${compact ? " demo-readings-summary--narrow" : ""}" data-demo-readings="summary">`
        + `<dl class="demo-readings-stats">${stat("count", t("Betöltött sorok"), count)}${stat("min", t("Minimum"), value(summary.min))}`
        + `${stat("max", t("Maximum"), value(summary.max))}${stat("average", t("Átlag"), value(summary.average))}${stat("selected", t("Kiválasztott"), choice, true)}</dl>`
        + `<p class="demo-readings-hidden" data-demo-distribution data-demo-selected-bin="${markBin}">${escape(distribution)}</p></div>`);
    };

    // Unsubscribed by the build's signal, before the cleanup below (registered earlier, so it runs first).
    app.theme.onChange(() => { chart.setConfig(chartConfig(colors())); render(); }, { signal });
    let current: ListView | undefined;
    // Registered before the ListView exists, so a failing constructor still releases the chart and the layout.
    signal.addEventListener("abort", () => {
      current?.destroy();
      layout.getCell("chart").detach();
      chart.destructor();
      layout.destructor();
      if (list === current) list = undefined;
    }, { once: true });
    current = list = new app.components.ListView({ view: listView, filters: presets, signal });
    presets = {};
    current.on("changed", event => { rows = event.rows; matched = event.matched; if (selected && !rows.some(row => String(row.id) === String(selected!.id))) selected = undefined; render(); });
    current.on("select", ({ row }) => { selected = row; render(); });
    current.mount(layout.getCell("list"));
    render();
  };

  const close = () => { if (closed) return; closed = true; session?.abort(); };
  narrow.addEventListener("change", () => { if (!closed) build(); }, { signal: host.signal });
  host.signal.addEventListener("abort", close, { once: true });
  // A failing first build (for example the list view is not offered) releases what it created; the shell shows the error.
  try { build(); } catch (error) { close(); throw error; }
  return { destroy: close, editing: () => list?.editing() ?? false, refresh: () => list?.refresh() };
}

const readings: ApplicationModule = app => {
  app.presentations.register(BAR, readingBar(app));
  app.kinds.register(KIND, { create: (host, view: ViewDefinition<DashboardOptions>) => dashboard(app, host, view) });
};
export default readings;

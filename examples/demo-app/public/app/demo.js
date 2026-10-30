// examples/demo-app/frontend/src/assets.ts
var KIND = "demo.asset-viewer";
var PHONE = "(max-width: 767px)";
var STEP = 5;
function clock(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
function mediaOf(list, row) {
  const slots = row._media && typeof row._media === "object" ? row._media : {};
  for (const column of list?.options.columns ?? []) {
    const media = column.media ? slots[column.id] : void 0;
    if (column.media && media && typeof media.id === "string" && typeof media.mime_type === "string") return { source: column.media, media };
  }
  return void 0;
}
function viewer(app, host, view) {
  const t = (key, params) => app.i18n.t(key, params);
  if (!host.record) throw new Error(t("A m\xE9dian\xE9z\u0151 egy m\xE9diaelemhez ny\xEDlik meg."));
  const row = host.record.row, listId = view.options?.details ?? host.record.resource;
  const list = app.viewDefinition(listId);
  const found = mediaOf(list, row), kind = found?.media.mime_type.split("/")[0];
  const playable = kind === "image" || kind === "video" || kind === "audio", timed = kind === "video" || kind === "audio";
  const preferences = app.preferences.scope(KIND), phone = matchMedia(PHONE);
  let loop = preferences.get("loop") ?? !!view.options?.loop;
  let build, player, resume = 0;
  host.setTitle(`${view.title}: ${String(row.title ?? host.record.id)}`);
  const render = () => {
    if (host.signal.aborted) return;
    resume = player?.position() ?? resume;
    const previous = build, controller = build = new AbortController(), signal = controller.signal;
    host.signal.addEventListener("abort", () => controller.abort(), { once: true, signal });
    const stage = playable ? [{ id: "stage" }] : [];
    const layout = new app.dhx.Layout(null, { type: "none", rows: phone.matches ? [{ id: "commands", height: 48 }, ...stage.map((cell) => ({ ...cell, height: kind === "audio" ? 200 : Math.max(220, Math.round(innerHeight * 0.4)) })), { id: "details" }] : [{ id: "commands", height: 48 }, { type: "line", cols: [...stage, { id: "details", ...playable ? { width: 380 } : {} }] }] });
    host.attach(layout);
    previous?.abort();
    player = void 0;
    const position = (seconds) => t("Poz\xEDci\xF3: {position} / {length}", { position: clock(seconds), length: clock(player?.duration() ?? 0) });
    const status = !found ? t("Ehhez az elemhez nincs megjelen\xEDthet\u0151 m\xE9diaf\xE1jl.") : !playable ? t("Ez a f\xE1jlt\xEDpus nem j\xE1tszhat\xF3 le.") : timed ? position(resume) : "";
    const media = ["play", "pause", "rewind", "backward", "forward", "loop"];
    const bar = new app.components.CommandBar({ signal, items: [
      { id: "back", label: t("Vissza a list\xE1hoz"), icon: "dxi dxi-arrow-left" },
      { id: "play", label: t("Lej\xE1tsz\xE1s"), icon: "dxi dxi-menu-right", disabled: true, hidden: !timed },
      { id: "pause", label: t("Sz\xFCnet"), disabled: true, hidden: !timed },
      { id: "rewind", label: t("Elej\xE9re"), icon: "dxi dxi-chevron-double-left", disabled: true, hidden: !timed },
      { id: "backward", label: t("Vissza {seconds} mp", { seconds: STEP }), icon: "dxi dxi-chevron-left", disabled: true, hidden: !timed },
      { id: "forward", label: t("El\u0151re {seconds} mp", { seconds: STEP }), icon: "dxi dxi-chevron-right", disabled: true, hidden: !timed },
      { id: "loop", label: loop ? t("Ism\xE9tl\xE9s: be") : t("Ism\xE9tl\xE9s: ki"), icon: "dxi dxi-redo", disabled: true, hidden: !timed },
      { id: "gap", label: "", type: "spacer" },
      { id: "position", label: status, disabled: true, hidden: status === "" }
    ] });
    bar.mount(layout.getCell("commands"));
    bar.on("click", ({ id }) => {
      if (id === "back") {
        if (!app.navigate({ view: listId })) host.close();
        return;
      }
      if (!player) return;
      if (id === "play") void player.play().catch(() => {
      });
      else if (id === "pause") player.pause();
      else if (id === "rewind") player.seek(0);
      else if (id === "backward" || id === "forward") player.seek(player.position() + (id === "forward" ? STEP : -STEP));
      else if (id === "loop") {
        loop = !loop;
        preferences.set("loop", loop);
        bar.update("loop", { label: loop ? t("Ism\xE9tl\xE9s: be") : t("Ism\xE9tl\xE9s: ki") });
      }
    });
    if (list) new app.components.RecordDetails({ view: list, record: row, signal }).mount(layout.getCell("details"));
    if (found && playable) player = new app.components.MediaPlayer({
      source: { resource: found.source, action: "content_stream", id: found.media.id, version: found.media.revision },
      mime: found.media.mime_type,
      name: String(row.title ?? found.media.name),
      // Images keep the player's zoom toolbar; audio and video are driven by the command bar (its loop, not the player's).
      toolbar: !timed,
      signal
    });
    const current = player;
    if (current) {
      current.on("loaded", () => {
        for (const id of media) bar.update(id, { disabled: false });
        if (resume > 0) current.seek(resume);
        bar.update("position", { label: position(resume) });
      });
      current.on("position", ({ seconds }) => bar.update("position", { label: position(seconds) }));
      current.on("ended", () => {
        if (loop) {
          current.seek(0);
          void current.play().catch(() => {
          });
        }
      });
      current.on("error", ({ message }) => {
        for (const id of media) bar.update(id, { disabled: true });
        bar.update("position", { label: message, hidden: false });
      });
      current.mount(layout.getCell("stage"));
      current.focus();
    }
    signal.addEventListener("abort", () => layout.destructor(), { once: true });
  };
  render();
  phone.addEventListener("change", render, { signal: host.signal });
  return { destroy: () => {
    build?.abort();
    player = void 0;
  } };
}
var assets = (app) => {
  app.views.register(KIND, { create: (host, view) => viewer(app, host, view) });
};
var assets_default = assets;

// examples/demo-app/frontend/src/readings.ts
var KIND2 = "demo.readings-dashboard";
var BAR = "demo.reading-bar";
var SCALE = 100;
var NARROW = "(max-width: 767px)";
var escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var numeric = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
};
var formatter = (locale, options) => {
  try {
    return new Intl.NumberFormat(locale, options);
  } catch {
    return new Intl.NumberFormat(void 0, options);
  }
};
function readingBar(app) {
  const number = formatter(app.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    render(value, _row, _column, size, escape2) {
      const reading = numeric(value);
      if (reading === null) return escape2(value);
      const width = Math.round(Math.min(SCALE, Math.max(0, reading)) / SCALE * 1e3) / 10;
      const text = app.i18n.t("{value} a 100-b\xF3l", { value: number.format(reading) });
      return `<span class="demo-reading-bar demo-reading-bar--${size === "card" || size === "tile" ? size : "cell"}" title="${escape2(text)}"><span class="demo-reading-bar__track" aria-hidden="true"><span class="demo-reading-bar__fill" style="width:${width}%"></span></span><span class="demo-reading-bar__value">${escape2(number.format(reading))}</span></span>`;
    },
    text: (value) => {
      const reading = numeric(value);
      return reading === null ? String(value ?? "") : app.i18n.t("{value} a 100-b\xF3l", { value: number.format(reading) });
    }
  };
}
function dashboardOptions(view) {
  const o = view.options ?? {};
  const name = (value) => typeof value === "string" && /^[a-z][a-z0-9_.-]*$/.test(value);
  if (!name(o.list) || !name(o.value) || !name(o.name) || typeof o.max !== "number" || !(o.max > 0) || !Number.isInteger(o.buckets) || o.buckets < 2 || o.buckets > 20)
    throw new TypeError(`61ade feature demo: the options of view "${view.id}" need list, value, name, max > 0 and 2\u201320 buckets.`);
  return o;
}
function summarize(rows, options, matched) {
  const bins = new Array(options.buckets).fill(0);
  let count = 0, sum = 0, min = Infinity, max = -Infinity;
  for (const row of rows) {
    const value = numeric(row[options.value]);
    if (value === null) continue;
    count++;
    sum += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
    bins[bin(value, options)]++;
  }
  return { loaded: rows.length, ...matched !== void 0 ? { matched } : {}, ...count ? { min, max, average: sum / count } : {}, bins };
}
var bin = (value, options) => Math.min(options.buckets - 1, Math.max(0, Math.floor(value / options.max * options.buckets)));
function themeColor(variable, fallback) {
  const probe = document.createElement("span");
  probe.style.color = `var(${variable}, ${fallback})`;
  probe.hidden = true;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color || fallback;
}
function dashboard(app, host, view) {
  const options = dashboardOptions(view);
  const source = app.viewDefinition(options.list);
  if (!source || source.kind !== "list") throw new TypeError(`61ade feature demo: "${options.list}" is not an offered list view.`);
  const listView = { ...source, id: view.id };
  const t = (key, params) => app.i18n.t(key, params), locale = app.i18n.locale();
  const decimal = formatter(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const whole = formatter(locale, { maximumFractionDigits: 0 });
  const signed = formatter(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const step = options.max / options.buckets;
  const ranges = Array.from({ length: options.buckets }, (_, index) => `${whole.format(index * step)}\u2013${whole.format((index + 1) * step)}`);
  const narrow = matchMedia(NARROW);
  let session, list, closed = false;
  let presets = { ...host.filters };
  const build = () => {
    session?.abort();
    const controller = session = new AbortController(), signal = controller.signal;
    const compact = narrow.matches;
    const summaryHeader = compact ? {} : { header: escape(t("\xD6sszes\xEDt\xE9s")) };
    const overview = compact ? { type: "space", height: 324, rows: [{ id: "summary", height: 104 }, { id: "chart", header: escape(t("\xC9rt\xE9keloszl\xE1s")) }] } : { type: "space", height: 260, cols: [{ id: "summary", width: 340, ...summaryHeader }, { id: "chart", header: escape(t("\xC9rt\xE9keloszl\xE1s")) }] };
    const layout = new app.dhx.Layout(null, { type: "none", css: "demo-readings", rows: [overview, { id: "list" }] });
    let rows = [], matched, selected;
    const colors = () => ({ rows: themeColor("--dhx-color-primary", "#0288d1"), selected: themeColor("--dhx-color-success", "#2e7d32") });
    const chartConfig = (palette) => ({
      type: "bar",
      css: "demo-readings-chart",
      scales: { bottom: { text: "range" }, left: { min: 0, maxTicks: 5 } },
      // `text` names the series in the legend (Suite Chart; not in its typings).
      series: [
        { id: "rows", type: "bar", value: "rows", text: t("Sorok"), fill: palette.rows, color: palette.rows, stacked: true },
        { id: "selected", type: "bar", value: "selected", text: t("Kiv\xE1lasztott sor"), fill: palette.selected, color: palette.selected, stacked: true }
      ],
      legend: { series: ["rows", "selected"], halign: "right", valign: "top" }
    });
    host.attach(layout);
    const chart = new app.dhx.Chart(null, chartConfig(colors()));
    layout.getCell("chart").attach(chart);
    const render = () => {
      const summary = summarize(rows, options, matched);
      const mark = selected ? numeric(selected[options.value]) : null;
      const markBin = mark === null ? -1 : bin(mark, options);
      chart.data.parse(ranges.map((range, index) => ({ id: String(index), range, rows: summary.bins[index] - (index === markBin ? 1 : 0), selected: index === markBin ? 1 : 0 })));
      const value = (number) => number === void 0 ? "\u2014" : decimal.format(number);
      const count = summary.matched === void 0 ? whole.format(summary.loaded) : `${whole.format(summary.loaded)} / ${whole.format(summary.matched)}`;
      const choice = selected ? `${String(selected[options.name] ?? selected.id)}: ${mark === null ? "\u2014" : decimal.format(mark)}${mark !== null && summary.average !== void 0 ? ` (${t("\xE1tlagt\xF3l {delta}", { delta: signed.format(mark - summary.average) })})` : ""}` : t("Nincs kiv\xE1lasztott sor");
      const stat = (id, label, text, wide = false) => `<div class="demo-readings-stat${wide ? " demo-readings-stat--wide" : ""}" data-demo-stat="${id}"><dt>${escape(label)}</dt><dd title="${escape(text)}">${escape(text)}</dd></div>`;
      const distribution = t("\xC9rt\xE9keloszl\xE1s: {bins}", { bins: ranges.map((range, index) => t("{range}: {count} sor", { range, count: summary.bins[index] })).join("; ") }) + (markBin < 0 ? "" : ". " + t("Kiv\xE1lasztott sor: {range}", { range: ranges[markBin] }));
      layout.getCell("summary").attachHTML(`<div class="demo-readings-summary${compact ? " demo-readings-summary--narrow" : ""}" data-demo-readings="summary"><dl class="demo-readings-stats">${stat("count", t("Bet\xF6lt\xF6tt sorok"), count)}${stat("min", t("Minimum"), value(summary.min))}${stat("max", t("Maximum"), value(summary.max))}${stat("average", t("\xC1tlag"), value(summary.average))}${stat("selected", t("Kiv\xE1lasztott"), choice, true)}</dl><p class="demo-readings-hidden" data-demo-distribution data-demo-selected-bin="${markBin}">${escape(distribution)}</p></div>`);
    };
    const stopTheme = app.theme.onChange(() => {
      if (!signal.aborted) {
        chart.setConfig(chartConfig(colors()));
        render();
      }
    });
    let current;
    signal.addEventListener("abort", () => {
      stopTheme();
      current?.destroy();
      layout.getCell("chart").detach();
      chart.destructor();
      layout.destructor();
      if (list === current) list = void 0;
    }, { once: true });
    current = list = new app.components.ListView({ view: listView, filters: presets, signal });
    presets = {};
    current.on("changed", (event) => {
      rows = event.rows;
      matched = event.matched;
      if (selected && !rows.some((row) => String(row.id) === String(selected.id))) selected = void 0;
      render();
    });
    current.on("select", ({ row }) => {
      selected = row;
      render();
    });
    current.mount(layout.getCell("list"));
    render();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    session?.abort();
  };
  narrow.addEventListener("change", () => {
    if (!closed) build();
  }, { signal: host.signal });
  host.signal.addEventListener("abort", close, { once: true });
  try {
    build();
  } catch (error) {
    close();
    throw error;
  }
  return { destroy: close, editing: () => list?.editing() ?? false, refresh: () => list?.refresh() };
}
var readings = (app) => {
  app.presentations.register(BAR, readingBar(app));
  app.views.register(KIND2, { create: (host, view) => dashboard(app, host, view) });
};
var readings_default = readings;

// examples/demo-app/frontend/src/tasks.ts
var TOP = 5;
var COPY_LIMIT = 50;
var strip = (name) => name + "__stars";
function level(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  return /^[0-5]$/.test(text) ? Number(text) : null;
}
function stars(app, value, size, escape2) {
  const n = level(value);
  if (n === null) return escape2(value);
  const label = escape2(app.i18n.t("{value} / {max} csillag", { value: n, max: TOP }));
  return `<span class="demo-rating demo-rating--${escape2(size)}" role="img" aria-label="${label}" title="${label}" style="letter-spacing:1px;white-space:nowrap">${"\u2605".repeat(n)}<span style="opacity:.4">${"\u2606".repeat(TOP - n)}</span></span>`;
}
function bindStars({ app, form, field, readOnly, signal }) {
  const input = form.getItem(field.name);
  const box = form.getItem(strip(field.name));
  if (!input || !box) return;
  const root = document.createElement("div");
  root.className = "demo-rating-stars";
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "display:flex;gap:2px;align-items:center;height:100%";
  const buttons = Array.from({ length: TOP }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.disabled = readOnly;
    button.dataset.value = String(index + 1);
    button.title = app.i18n.t("{value} / {max} csillag", { value: index + 1, max: TOP });
    button.style.cssText = "border:0;background:none;color:inherit;font:inherit;font-size:22px;line-height:1;padding:0 2px;cursor:pointer";
    root.append(button);
    return button;
  });
  const paint = (value) => {
    const n = level(value) ?? 0;
    buttons.forEach((button, index) => {
      button.textContent = index < n ? "\u2605" : "\u2606";
      button.style.opacity = index < n ? "1" : ".55";
    });
  };
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || readOnly) return;
    const chosen = Number(button.dataset.value);
    const next = String(level(input.getValue()) === chosen ? 0 : chosen);
    input.setValue(next);
    input.setValue(next);
    paint(next);
  }, { signal });
  const owner = {};
  input.events.on("input", paint, owner);
  input.events.on("change", paint, owner);
  signal.addEventListener("abort", () => {
    input.events.detach("input", owner);
    input.events.detach("change", owner);
    root.remove();
  }, { once: true });
  paint(input.getValue());
  box.attach(root);
}
function valueText(column, value) {
  if (value === null || value === void 0 || value === "") return "\u2014";
  if (column.editor === "demo.rating") {
    const n = level(value);
    return n === null ? String(value) : `${n} / ${TOP}`;
  }
  const options = column.options ?? {};
  if (column.type === "multiselect") return String(value).split(",").filter(Boolean).map((item) => options[item] ?? item).join(", ");
  return options[String(value)] ?? String(value);
}
function recordText(view, row) {
  const options = view.options ?? {};
  const columns = options.detailFields?.length ? options.detailFields : options.columns ?? [];
  const known = columns.length ? columns : Object.keys(row).filter((key) => !key.startsWith("_") && key !== "revision").map((id) => ({ id, header: id }));
  return known.filter((column) => Object.hasOwn(row, column.id)).map((column) => `${column.header}: ${valueText(column, row[column.id])}`).join("\n");
}
var tasks = (app) => {
  app.fieldTypes.register("demo.rating", {
    input: (field, value, readOnly) => ({
      css: "demo-rating-field",
      rows: [
        {
          type: "input",
          name: field.name,
          label: field.label,
          labelPosition: "top",
          inputType: "number",
          min: 0,
          max: TOP,
          step: 1,
          required: !readOnly && field.required,
          readOnly,
          value: String(value ?? field.defaultValue ?? "")
        },
        { type: "container", name: strip(field.name), height: 32, hidden: readOnly }
      ]
    }),
    bind: bindStars,
    display: (value, _row, _field, size, escape2) => stars(app, value, size, escape2)
  });
  app.commands.register("demo.copy-text", {
    label: "M\xE1sol\xE1s sz\xF6vegk\xE9nt",
    icon: "dxi dxi-copy",
    placement: "record",
    // The cursor record, or every marked task when there are marks.
    enabled: ({ row, rows }) => !!row || rows.length > 0,
    run: async ({ app: app2, view, row, rows, signal }) => {
      const targets = rows.length ? rows : row ? [row] : [];
      if (!targets.length || !view.resource) return;
      if (targets.length > COPY_LIMIT) throw new Error(app2.i18n.t("Egyszerre legfeljebb {count} feladat m\xE1solhat\xF3.", { count: COPY_LIMIT }));
      const texts = [];
      for (const target of targets) texts.push(recordText(view, await app2.server.call(view.resource, "get", { id: String(target.id), signal })));
      const text = texts.join("\n\n");
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : void 0;
      if (typeof clipboard?.writeText !== "function") throw new Error(app2.i18n.t("A v\xE1g\xF3lap nem \xE9rhet\u0151 el. M\xE1sold ki k\xE9zzel:") + "\n\n" + text);
      try {
        await clipboard.writeText(text);
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(app2.i18n.t("A v\xE1g\xF3lapra \xEDr\xE1s nem siker\xFClt. M\xE1sold ki k\xE9zzel:") + "\n\n" + text);
      }
      app2.ui.toast(app2.i18n.t("V\xE1g\xF3lapra m\xE1solva: {count} feladat.", { count: targets.length }));
    }
  });
};
var tasks_default = tasks;

// examples/demo-app/frontend/src/index.ts
var none = () => {
};
var playlist = none;
var demo = async (app) => {
  const failures = [];
  for (const part of [assets_default, playlist, readings_default, tasks_default]) {
    try {
      await part(app);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "61ade feature demo: a module part failed");
};
var index_default = demo;
export {
  index_default as default
};

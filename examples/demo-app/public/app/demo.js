// examples/demo-app/frontend/src/tasks.ts
var TOP = 5;
var COPY_LIMIT = 50;
var strip = (name) => name + "__stars";
function level(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  return /^[0-5]$/.test(text) ? Number(text) : null;
}
function stars(app, value, size, escape) {
  const n = level(value);
  if (n === null) return escape(value);
  const label = escape(app.i18n.t("{value} / {max} csillag", { value: n, max: TOP }));
  return `<span class="demo-rating demo-rating--${escape(size)}" role="img" aria-label="${label}" title="${label}" style="letter-spacing:1px;white-space:nowrap">${"\u2605".repeat(n)}<span style="opacity:.4">${"\u2606".repeat(TOP - n)}</span></span>`;
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
    display: (value, _row, _field, size, escape) => stars(app, value, size, escape)
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
var assets = none;
var playlist = none;
var readings = none;
var demo = async (app) => {
  const failures = [];
  for (const part of [assets, playlist, readings, tasks_default]) {
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

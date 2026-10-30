// D4 Tasks (docs/demos.md#toolkit-consumer): the priority rating field type `demo.rating` and the record command
// `demo.copy-text` ("Másolás szövegként") of the Feladatok list (modules/tasks.json: field `priority` with
// `editor`, view `commands`). The server keeps validating the priority (number, pattern 0–5) and every read goes
// through the `get` action, so ACL and field ACL decide what is shown and copied.
import type { Application, ApplicationModule, ColumnMetadata, FieldMetadata, FieldTypeContext, ListOptions, Row } from "@61ade/admin";

/** Highest rating; modules/tasks.json allows 0–5 (`validation.pattern`). */
const TOP = 5;
/** At most this many marked tasks are copied in one run (one `get` each). */
const COPY_LIMIT = 50;
/** Form item name of the star strip beside the number input. */
const strip = (name: string) => name + "__stars";

/** The rating 0–5 of a stored value (empty: 0); `null` for anything else, which is then shown as plain text. */
function level(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  return /^[0-5]$/.test(text) ? Number(text) : null;
}

/** HTML of a rating: filled and empty stars, one accessible name ("3 / 5 csillag"); values pass through `escape`. */
function stars(app: Application, value: unknown, size: string, escape: (value: unknown) => string): string {
  const n = level(value);
  if (n === null) return escape(value);
  const label = escape(app.i18n.t("{value} / {max} csillag", { value: n, max: TOP }));
  return `<span class="demo-rating demo-rating--${escape(size)}" role="img" aria-label="${label}" title="${label}" style="letter-spacing:1px;white-space:nowrap">`
    + `${"★".repeat(n)}<span style="opacity:.4">${"☆".repeat(TOP - n)}</span></span>`;
}

/**
 * Pointer shortcut of the editor: five star buttons in the Form's container item. The number input stays the
 * labelled, keyboard-operable control (arrow keys, typing); the buttons are hidden from assistive technology and the
 * tab order. Clicking the current rating again clears it to 0. Everything is released with the form's `signal`.
 */
function bindStars({ app, form, field, readOnly, signal }: FieldTypeContext): void {
  const input = form.getItem(field.name) as unknown as { getValue(): unknown; setValue(value: string): void; events: { on(name: string, handler: (value: unknown) => void, owner: object): void; detach(name: string, owner: object): void } } | undefined;
  const box = form.getItem(strip(field.name)) as unknown as { attach(element: HTMLElement): void } | undefined;
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
  const paint = (value: unknown) => {
    const n = level(value) ?? 0;
    buttons.forEach((button, index) => { button.textContent = index < n ? "★" : "☆"; button.style.opacity = index < n ? "1" : ".55"; });
  };
  root.addEventListener("click", event => {
    const button = (event.target as Element).closest("button");
    if (!button || readOnly) return;
    const chosen = Number(button.dataset.value);
    const next = String(level(input.getValue()) === chosen ? 0 : chosen);
    // Suite keeps the last typed text apart from the value; the repeated call aligns it, so a later blur keeps `next`.
    input.setValue(next);
    input.setValue(next);
    paint(next);
  }, { signal });
  const owner = {};
  input.events.on("input", paint, owner);
  input.events.on("change", paint, owner);
  signal.addEventListener("abort", () => { input.events.detach("input", owner); input.events.detach("change", owner); root.remove(); }, { once: true });
  paint(input.getValue());
  box.attach(root);
}

/** Plain text of one value for the copy command: option labels, the rating as "3 / 5", lists joined. */
function valueText(column: ColumnMetadata, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (column.editor === "demo.rating") { const n = level(value); return n === null ? String(value) : `${n} / ${TOP}`; }
  const options = column.options ?? {};
  if (column.type === "multiselect") return String(value).split(",").filter(Boolean).map(item => options[item] ?? item).join(", ");
  return options[String(value)] ?? String(value);
}

/** "Label: value" lines of a record in the view's field order; only the fields the `get` answer contains. */
function recordText(view: { options: unknown }, row: Row): string {
  const options = (view.options ?? {}) as Partial<ListOptions>;
  const columns = options.detailFields?.length ? options.detailFields : options.columns ?? [];
  const known = columns.length ? columns : Object.keys(row).filter(key => !key.startsWith("_") && key !== "revision").map(id => ({ id, header: id }));
  return known.filter(column => Object.hasOwn(row, column.id)).map(column => `${column.header}: ${valueText(column, row[column.id])}`).join("\n");
}

const tasks: ApplicationModule = app => {
  app.fieldTypes.register("demo.rating", {
    input: (field: FieldMetadata, value: unknown, readOnly: boolean) => ({
      css: "demo-rating-field",
      rows: [
        {
          type: "input", name: field.name, label: field.label, labelPosition: "top", inputType: "number", min: 0, max: TOP, step: 1,
          required: !readOnly && field.required, readOnly, value: String(value ?? field.defaultValue ?? ""),
        },
        { type: "container", name: strip(field.name), height: 32, hidden: readOnly },
      ],
    }),
    bind: bindStars,
    display: (value, _row, _field, size, escape) => stars(app, value, size, escape),
  });

  app.commands.register("demo.copy-text", {
    label: "Másolás szövegként",
    icon: "dxi dxi-copy",
    placement: "record",
    // The cursor record, or every marked task when there are marks.
    enabled: ({ row, rows }) => !!row || rows.length > 0,
    run: async ({ app, view, row, rows, signal }) => {
      const targets = rows.length ? rows : row ? [row] : [];
      if (!targets.length || !view.resource) return;
      if (targets.length > COPY_LIMIT) throw new Error(app.i18n.t("Egyszerre legfeljebb {count} feladat másolható.", { count: COPY_LIMIT }));
      const texts: string[] = [];
      // Fresh reads through the action: the server's ACL and field ACL decide the content.
      for (const target of targets) texts.push(recordText(view, await app.server.call<Row>(view.resource, "get", { id: String(target.id), signal })));
      const text = texts.join("\n\n");
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (typeof clipboard?.writeText !== "function") throw new Error(app.i18n.t("A vágólap nem érhető el. Másold ki kézzel:") + "\n\n" + text);
      try { await clipboard.writeText(text); }
      catch (error) {
        if (signal.aborted) throw error;
        // The shared error dialog keeps the text, so it can still be copied by hand.
        throw new Error(app.i18n.t("A vágólapra írás nem sikerült. Másold ki kézzel:") + "\n\n" + text);
      }
      app.ui.toast(app.i18n.t("Vágólapra másolva: {count} feladat.", { count: targets.length }));
    },
  });
};
export default tasks;

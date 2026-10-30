// D4 Tasks (docs/demos.md#toolkit-consumer): the priority rating field type `demo.rating` and the record command
// `demo.copy-text` ("Másolás szövegként") of the Feladatok list (modules/tasks.json: field `priority` with
// `editor`, view `commands`). The server keeps validating the priority (number, pattern 0–5) and every read goes
// through the `get` action, so ACL and field ACL decide what is shown and copied.
import type { Application, ApplicationModule, ColumnMetadata, FieldMetadata, FieldTypeContext, ListKindOptions, Row } from "@61ade/admin";

/** Highest rating; modules/tasks.json allows 0–5 (`validation.pattern`). */
const TOP = 5;
/** At most this many marked tasks are copied in one run (one `get` each). */
const COPY_LIMIT = 50;
/** Toggle id of star n in the strip. */
const starId = (n: number) => "star" + n;
/** Toggle states of a rating: the stars 1…n pressed. */
const pressed = (n: number): Record<string, boolean> => Object.fromEntries(Array.from({ length: TOP }, (_, index) => [starId(index + 1), index < n]));
/** Translates the name of the star strip; set by the module (`app.i18n`) before any form opens. */
let translate: (key: string, params: Record<string, unknown>) => string = key => key;
/** Form item name of the star strip; Suite also uses it as the group's accessible name ("Prioritás — csillagok"). */
const stripName = (field: FieldMetadata) => translate("{field} — csillagok", { field: field.label });

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
 * Star strip of the editor: a Suite `togglegroup` item (Standard edition; the `container` item is PRO-only) of five
 * toggle buttons, ★ when pressed and ☆ otherwise, named "<label> — csillagok". The number input stays the labelled
 * control of the value (arrow keys, typing, validation messages); a toggle (click, or Space/Enter on it) sets the
 * rating to its position, the current one clears it to 0. Both stay in step through their Suite events, which are
 * detached when the form's `signal` aborts.
 */
function bindStars({ form, field, signal }: FieldTypeContext): void {
  type Events = { on(name: string, handler: (value: unknown) => void, owner: object): void; detach(name: string, owner: object): void };
  const input = form.getItem(field.name) as unknown as { getValue(): unknown; setValue(value: string): void; events: Events } | undefined;
  const group = form.getItem(stripName(field)) as unknown as { isSelected(): Record<string, boolean>; setValue(value: Record<string, boolean>): unknown; events: Events } | undefined;
  if (typeof input?.setValue !== "function" || typeof group?.isSelected !== "function") return;
  let rating = level(input.getValue()) ?? 0, painting = false;
  const paint = (value: unknown) => {
    rating = level(value) ?? 0;
    painting = true;
    try { group.setValue(pressed(rating)); } finally { painting = false; }
  };
  const chosen = () => {
    if (painting) return;
    // The toggle that differs from the shown rating is the one just pressed or released.
    const state = group.isSelected();
    const star = Array.from({ length: TOP }, (_, index) => index + 1).find(n => !!state[starId(n)] !== n <= rating);
    if (star === undefined) return;
    const next = String(star === rating ? 0 : star);
    // Suite keeps the last typed text apart from the value; the repeated call aligns it, so a later blur keeps `next`.
    input.setValue(next);
    input.setValue(next);
    rating = Number(next);
    // The pressed toggle sets its own state after the group's change; the strip is aligned once that has finished.
    queueMicrotask(() => { if (!signal.aborted) paint(next); });
  };
  const owner = {};
  input.events.on("input", paint, owner);
  input.events.on("change", paint, owner);
  group.events.on("change", chosen, owner);
  signal.addEventListener("abort", () => { input.events.detach("input", owner); input.events.detach("change", owner); group.events.detach("change", owner); }, { once: true });
  paint(input.getValue());
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
  const options = (view.options ?? {}) as Partial<ListKindOptions>;
  const columns = options.detailFields?.length ? options.detailFields : options.columns ?? [];
  const known = columns.length ? columns : Object.keys(row).filter(key => !key.startsWith("_") && key !== "revision").map(id => ({ id, header: id }));
  return known.filter(column => Object.hasOwn(row, column.id)).map(column => `${column.header}: ${valueText(column, row[column.id])}`).join("\n");
}

const tasks: ApplicationModule = app => {
  translate = (key, params) => app.i18n.t(key, params);
  app.fieldTypes.register("demo.rating", {
    input: (field: FieldMetadata, value: unknown, readOnly: boolean) => ({
      css: "demo-rating-field",
      rows: [
        {
          type: "input", name: field.name, label: field.label, labelPosition: "top", inputType: "number", min: 0, max: TOP, step: 1,
          required: !readOnly && field.required, readOnly, value: String(value ?? field.defaultValue ?? ""),
        },
        {
          type: "togglegroup", name: stripName(field), css: "demo-rating-stars", multiselection: true, gap: 4, hidden: readOnly,
          options: Array.from({ length: TOP }, (_, index) => ({ id: starId(index + 1), text: "★", offText: "☆" })),
          value: pressed(level(value ?? field.defaultValue) ?? 0),
        },
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

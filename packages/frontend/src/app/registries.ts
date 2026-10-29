import type { Application, ClientCommand, ColumnMetadata, CommandContext, CommandPlacement, ColumnPresentation, FieldMetadata, FieldType, PresentationSize, RegisterOptions, Registry, Row } from "../api/types";

/** Registry and view names: lower-case start, then `a-z 0-9 _ . -`. */
export const NAME = /^[a-z][a-z0-9_.-]*$/;

/**
 * A name → entry map of the toolkit (`views`, `presentations`, `fieldTypes`, `commands`). Built-in names have no dot
 * and are registered by 61ade with `builtin`; project names must contain one. A duplicate throws unless
 * `{replace: true}`, which is also how a project deliberately overrides a built-in entry.
 */
export class NamedRegistry<T> implements Registry<T> {
  private entries = new Map<string, T>();
  constructor(private readonly label: string) {}
  register(name: string, entry: T, options: RegisterOptions = {}): void { this.add(name, entry, options, false); }
  /** 61ade's own registrations (dot-free names). */
  builtin(name: string, entry: T): void { this.add(name, entry, {}, true); }
  get(name: string): T | undefined { return this.entries.get(name); }
  has(name: string): boolean { return this.entries.has(name); }
  names(): string[] { return [...this.entries.keys()]; }
  private add(name: string, entry: T, options: RegisterOptions, builtin: boolean): void {
    if (typeof name !== "string" || !NAME.test(name)) throw new TypeError(`61ade: invalid ${this.label} name "${String(name)}".`);
    // An override of a built-in entry keeps its dot-free name; any new project name needs the project prefix.
    if (!builtin && !name.includes(".") && !(options.replace && this.entries.has(name)))
      throw new TypeError(`61ade: ${this.label} "${name}" needs a project prefix with a dot (project.name).`);
    if (this.entries.has(name) && !options.replace) throw new Error(`61ade: ${this.label} "${name}" is already registered.`);
    if (entry === null || typeof entry !== "object") throw new TypeError(`61ade: ${this.label} "${name}" has no entry object.`);
    // Re-registering moves nothing: names() keeps the first registration order.
    this.entries.set(name, entry);
  }
}

/**
 * The page's presentation, field-type and command registries (docs/toolkit.md#registries), bound by
 * `createApplication`. The framework surfaces read them when they are created (a list or details resolves its
 * columns and commands once, a form its field types when it opens), so a later registration affects only surfaces
 * created after it. Fixtures without an Application leave them unset and get the built-in behaviour.
 */
export const extensions: {
  app?: Application;
  presentations?: Registry<ColumnPresentation>;
  fieldTypes?: Registry<FieldType>;
  commands?: Registry<ClientCommand>;
} = {};

const warned = new Set<string>();
/** Unknown names fall back to the built-in behaviour with one console warning per kind and name (never a broken list). */
export function warnOnce(kind: string, name: string): void {
  if (warned.has(kind + ":" + name)) return;
  warned.add(kind + ":" + name);
  console.warn(`61ade: unknown ${kind} "${name}"; the built-in ${kind === "command" ? "commands stay" : "rendering is used"}.`);
}

/** Field types that are not registered yet `field.editor` names: the field keeps its storage type's editor. */
export function fieldTypeOf(field: object, registry = extensions.fieldTypes): FieldType | undefined {
  const name = (field as { editor?: unknown }).editor;
  if (typeof name !== "string" || name === "") return undefined;
  const type = registry?.get(name);
  if (!type) warnOnce("field type", name);
  return type;
}

/** Internal list column parts resolved from the registries (`listDefinition`); the server never sends them. */
export type Resolved = {
  /** HTML of the value: the registered presentation, else the registered field type's `display`. */
  render?: (row: Row, size: PresentationSize) => string;
  /** Plain text of the value (`ColumnPresentation.text`): tile titles and tooltips. */
  text?: (row: Row) => string;
  /** The field has a registered field type: grid and card edits use the framework edit window with its Form item. */
  fieldType?: boolean;
};
type Column = Pick<ColumnMetadata, "id" | "header" | "type" | "presentation" | "options"> & { editor?: string };

/**
 * One column with its registered presentation or field-type display. `icon` stays framework-internal; `image` and
 * project names resolve through `presentations` (an unset registry keeps the built-in `image` rendering); a
 * presentation wins over a field type's `display`. A renderer that throws gives `plain` (escaped), logged once per
 * column; an unknown name keeps the plain rendering with one warning.
 */
export function resolveColumn<C extends Column>(column: C, field: FieldMetadata | undefined,
  helpers: { escape: (value: unknown) => string; plain: (column: C, row: Row) => string },
  registries: Pick<typeof extensions, "presentations" | "fieldTypes"> = extensions): C & Resolved {
  const name = column.presentation;
  const presentation = typeof name === "string" && name !== "icon" ? registries.presentations?.get(name) : undefined;
  if (typeof name === "string" && !presentation && name.includes(".")) warnOnce("presentation", name);
  const editor = column.editor ?? field?.editor;
  const type = fieldTypeOf({ editor }, registries.fieldTypes);
  const metadata: FieldMetadata = field ?? { name: column.id, label: column.header, type: (column.type ?? "text") as FieldMetadata["type"], required: false, max: 255, options: column.options ?? {}, ...(editor ? { editor } : {}) };
  let failed = false;
  const safe = (row: Row, run: () => unknown): string => {
    try { return String(run() ?? ""); }
    catch (error) {
      if (!failed) { failed = true; console.error(`61ade: the ${presentation ? `presentation "${name}"` : `field type "${editor}"`} of column "${column.id}" failed`, error); }
      return helpers.escape(helpers.plain(column, row));
    }
  };
  const render = presentation ? (row: Row, size: PresentationSize) => safe(row, () => presentation.render(row[column.id], row, column as ColumnMetadata, size, helpers.escape))
    : type?.display ? (row: Row, size: PresentationSize) => safe(row, () => type.display!(row[column.id], row, metadata, size, helpers.escape)) : undefined;
  const text = presentation?.text ? (row: Row) => { try { return String(presentation.text!(row[column.id], row, column as ColumnMetadata) ?? ""); } catch { return helpers.plain(column, row); } } : undefined;
  return { ...column, ...(render ? { render } : {}), ...(text ? { text } : {}), ...(type ? { fieldType: true } : {}) };
}

/** A command of one list: its registry name, entry and command bar id. */
export type ListCommand = { name: string; id: string; entry: ClientCommand };
/** Command bar id of a client command. */
export const commandId = (name: string) => "blade-command:" + name;

/**
 * The client commands a list shows: `builtin` names first (framework rules decide them), then the view's declared
 * `commands` in order. An unregistered name is skipped with one warning; a duplicate name appears once. A built-in
 * name falls back to `fallback` when no registry is bound (fixtures).
 */
export function resolveCommands(builtin: string[], declared: unknown, registry: Registry<ClientCommand> | undefined, fallback: Record<string, ClientCommand> = {}): ListCommand[] {
  const names = [...builtin, ...(Array.isArray(declared) ? declared.filter((name): name is string => typeof name === "string") : [])];
  const out: ListCommand[] = [];
  for (const name of new Set(names)) {
    const entry = registry?.get(name) ?? (builtin.includes(name) && !registry ? fallback[name] : undefined);
    if (!entry || typeof entry.run !== "function") { warnOnce("command", name); continue; }
    out.push({ name, id: commandId(name), entry });
  }
  return out;
}

/** Whether a command belongs to $placement (`both` belongs to each). */
export const placed = (command: ClientCommand, placement: CommandPlacement) => command.placement === placement || command.placement === "both";

/**
 * Enabled state of a command in $context: its own `enabled` (a throw disables it, logged), otherwise always on the
 * toolbar and with a record in the record menu.
 */
export function commandEnabled(command: ClientCommand, context: CommandContext, placement: CommandPlacement): boolean {
  if (typeof command.enabled !== "function") return placement === "toolbar" || !!context.row;
  try { return !!command.enabled(context); }
  catch (error) { console.error("61ade: a command's enabled() failed", error); return false; }
}

import type { RegisterOptions, Registry } from "../api/types";

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

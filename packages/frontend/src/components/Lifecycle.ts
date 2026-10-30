import type { Layout } from "@dhtmlx/suite";
import type { AppWindow, ComponentOptions, LayoutCell, MountTarget, ViewHost } from "../api/types";

/** An `AppWindow` or a `ViewHost`: content goes through its `attach`, and its signal ends the component. */
const hosted = (target: MountTarget): target is AppWindow | ViewHost =>
  !(target instanceof HTMLElement) && "signal" in target && target.signal instanceof AbortSignal && typeof target.attach === "function";

/** The `signal` option of a component: absent or an `AbortSignal`, otherwise `TypeError` (check it before creating anything). */
export function optionSignal(options: ComponentOptions | undefined): AbortSignal | undefined {
  const signal = options?.signal;
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("61ade: component option `signal` must be an AbortSignal.");
  return signal;
}

/**
 * The lifecycle every public component shares (docs/toolkit.md#components; `Component` in api/types.ts). `mount` places
 * the root Layout once: into an element (the component's own `element` placement), a Layout cell, an `AppWindow` or a
 * `ViewHost`; a second mount or one after `destroy()` throws, an already closed window or host destroys the component.
 * A closing window or host and the bound `signal` call the component's `destroy`. Events reach the handlers only while
 * mounted and never after `end()`. The component's `destroy()` calls `end()` first and releases its own parts only when
 * that returns true (idempotent).
 */
export class Lifecycle<Events extends object> {
  /** Aborted by `end()`: listeners registered with it are removed with the component. */
  readonly signal: AbortSignal;
  private readonly release = new AbortController();
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();
  private target?: MountTarget;
  private state: "created" | "mounted" | "destroyed" = "created";

  /** `destroy`: the component's own `destroy()`. */
  constructor(private readonly destroy: () => void) { this.signal = this.release.signal; }

  get destroyed(): boolean { return this.state === "destroyed"; }
  get mounted(): boolean { return this.state === "mounted"; }

  /** Destroys the component when `signal` aborts, at once when it already has (call it last in the constructor). */
  bind(signal: AbortSignal | undefined): void {
    if (signal?.aborted) this.destroy();
    else signal?.addEventListener("abort", () => this.destroy(), { once: true, signal: this.release.signal });
  }

  /**
   * Places `layout` into `target` (`element` puts it into a plain element). Returns false when the target was a closed
   * window or host, which destroyed the component instead. Anything else with `attach` takes the layout as a Layout cell
   * does (framework-internal: a Suite Window).
   */
  mount(target: MountTarget, layout: Layout, element: (target: HTMLElement) => void): boolean {
    if (this.state === "destroyed") throw new Error("61ade: a destroyed component cannot be mounted.");
    if (this.state === "mounted") throw new Error("61ade: the component is already mounted; create another one for a second place.");
    if (target instanceof HTMLElement) element(target);
    else if (target && hosted(target)) {
      if (target.signal.aborted) { this.destroy(); return false; }
      target.attach(layout);
      target.signal.addEventListener("abort", () => this.destroy(), { once: true, signal: this.release.signal });
    } else if (target && typeof (target as LayoutCell).attach === "function") (target as LayoutCell).attach(layout);
    else throw new TypeError("61ade: a component mounts into an element, a Layout cell, an AppWindow or a ViewHost.");
    this.target = target;
    this.state = "mounted";
    return true;
  }

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    if (typeof handler !== "function") throw new TypeError("61ade: component event handler must be a function.");
    if (this.state === "destroyed") return () => {};
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, set = new Set());
    set.add(handler as (payload: never) => void);
    return () => { this.handlers.get(event)?.delete(handler as (payload: never) => void); };
  }

  /** Calls the handlers in registration order while mounted; a throwing handler is logged and the others still run. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    if (this.state !== "mounted") return;
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      try { (handler as (payload: Events[K]) => void)(payload); } catch (error) { console.error(error); }
    }
  }

  /**
   * First step of the component's `destroy()`: false when it already ran. Otherwise marks the component destroyed,
   * removes the mount and signal listeners and the handlers, and leaves the owner without a reference to `layout`: a
   * Layout cell is detached (before the Layout is destructed), an open window or host is emptied.
   */
  end(layout: Layout): boolean {
    if (this.state === "destroyed") return false;
    this.state = "destroyed";
    this.release.abort();
    this.handlers.clear();
    const target = this.target;
    this.target = undefined;
    if (target && !(target instanceof HTMLElement)) {
      if (hosted(target)) { if (!target.signal.aborted) target.attach(document.createElement("div")); }
      else if ((target as LayoutCell).getWidget?.() === layout) (target as Partial<LayoutCell>).detach?.();
    }
    return true;
  }
}

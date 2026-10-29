import type { Layout } from "@dhtmlx/suite";
import type { AppWindow, Application, Component, ComponentOptions, LayoutCell, MountTarget, ViewDefinition, ViewHost, ViewReference } from "../api/types";

/** The internal widget a facade owns: its root Layout, created into the given container, and its release. */
export type Engine = { readonly layout: Layout; destroy(): void };
/** Emits a component event (delivered only while the component is mounted). */
export type Emit<Events extends object> = <K extends keyof Events>(event: K, payload: Events[K]) => void;

/** An `AppWindow` or a `ViewHost`: content goes through its `attach`, and its signal ends the component. */
const hosted = (target: MountTarget): target is AppWindow | ViewHost =>
  !(target instanceof HTMLElement) && "signal" in target && target.signal instanceof AbortSignal && typeof target.attach === "function";

/**
 * A view reference of a component: an id offered to the actor (`Application.viewDefinition`) or a definition the
 * caller holds. Any kind is accepted when the view has a resource, actions and options of the right shape.
 */
export function resolveView<Options>(app: Application, reference: ViewReference<Options>, component: string, valid: (options: unknown) => boolean): ViewDefinition<Options> {
  if (typeof reference === "string") {
    const view = app.viewDefinition(reference);
    if (!view) throw new Error(`61ade: ${component}: view "${reference}" is not offered to the actor.`);
    reference = view as ViewDefinition<Options>;
  }
  const view = reference as ViewDefinition<Options> | undefined;
  if (!view || typeof view !== "object" || typeof view.resource !== "string" || !view.resource || !Array.isArray(view.actions) || !valid(view.options))
    throw new TypeError(`61ade: ${component} needs a view with a resource, its actions and ${component} options.`);
  return view;
}

/**
 * Lifecycle shared by the public component facades (`Component`): the engine is created at once into a detached
 * container; `mount` places its root Layout into an element, a Layout cell, an `AppWindow` or a `ViewHost` (once);
 * `destroy` is idempotent and also runs when the options' signal or the window/host signal aborts.
 */
export abstract class Facade<Events extends object, E extends Engine> implements Component<Events> {
  readonly layout: Layout;
  protected readonly engine: E;
  private readonly container = document.createElement("div");
  private readonly handlers = new Map<keyof Events, Set<(payload: never) => void>>();
  private readonly release = new AbortController();
  private target?: MountTarget;
  private destroyed = false;

  protected constructor(options: ComponentOptions | undefined, create: (container: HTMLElement, emit: Emit<Events>) => E) {
    const signal = options?.signal;
    if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("61ade: component option `signal` must be an AbortSignal.");
    this.container.style.height = "100%";
    this.engine = create(this.container, (event, payload) => this.emit(event, payload));
    this.layout = this.engine.layout;
    if (signal?.aborted) this.destroy();
    else signal?.addEventListener("abort", () => this.destroy(), { once: true, signal: this.release.signal });
  }

  /** True after `destroy()` (including a destroy caused by a signal). */
  protected get isDestroyed(): boolean { return this.destroyed; }

  mount(target: MountTarget): void {
    if (this.destroyed) throw new Error("61ade: a destroyed component cannot be mounted.");
    if (this.target) throw new Error("61ade: the component is already mounted; create another one for a second place.");
    if (target instanceof HTMLElement) target.append(this.container);
    else if (target && hosted(target)) {
      if (target.signal.aborted) { this.destroy(); return; }
      target.attach(this.layout);
      target.signal.addEventListener("abort", () => this.destroy(), { once: true, signal: this.release.signal });
    } else if (target && typeof (target as LayoutCell).attach === "function") (target as LayoutCell).attach(this.layout);
    else throw new TypeError("61ade: a component mounts into an element, a Layout cell, an AppWindow or a ViewHost.");
    this.target = target;
  }

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    if (typeof handler !== "function") throw new TypeError("61ade: component event handler must be a function.");
    if (this.destroyed) return () => {};
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, set = new Set());
    set.add(handler as (payload: never) => void);
    return () => { this.handlers.get(event)?.delete(handler as (payload: never) => void); };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.release.abort();
    this.handlers.clear();
    const target = this.target;
    // The owner's cell or window keeps no reference to the destroyed Layout (a closing host clears itself).
    if (target && !(target instanceof HTMLElement)) {
      if (hosted(target)) { if (!target.signal.aborted) target.attach(document.createElement("div")); }
      else if ((target as LayoutCell).getWidget?.() === this.layout) (target as LayoutCell).detach();
    }
    try { this.engine.destroy(); } finally { this.container.remove(); }
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    if (this.destroyed || !this.target) return;
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      try { (handler as (payload: Events[K]) => void)(payload); } catch (error) { console.error(error); }
    }
  }
}

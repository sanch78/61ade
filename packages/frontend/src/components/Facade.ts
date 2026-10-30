import type { Layout } from "@dhtmlx/suite";
import type { Application, Component, ComponentOptions, MountTarget, SignalOptions, ViewDefinition, ViewReference } from "../api/types";
import { Lifecycle, optionSignal } from "./Lifecycle";

/** The internal widget a facade owns: its root Layout, created into the given container, and its release. */
export type Engine = { readonly layout: Layout; destroy(): void };
/** Emits a component event (delivered only while the component is mounted). */
export type Emit<Events extends object> = <K extends keyof Events>(event: K, payload: Events[K]) => void;

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
 * Lifecycle shared by the public component facades (`Component`, `Lifecycle`): the engine is created at once into a
 * detached container; `mount` places its root Layout into an element, a Layout cell, an `AppWindow` or a `ViewHost`
 * (once); `destroy` is idempotent and also runs when the options' signal or the window/host signal aborts.
 */
export abstract class Facade<Events extends object, E extends Engine> implements Component<Events> {
  readonly layout: Layout;
  protected readonly engine: E;
  private readonly container = document.createElement("div");
  private readonly life = new Lifecycle<Events>(() => this.destroy());

  protected constructor(options: ComponentOptions | undefined, create: (container: HTMLElement, emit: Emit<Events>) => E) {
    const signal = optionSignal(options);
    this.container.style.height = "100%";
    this.engine = create(this.container, (event, payload) => this.life.emit(event, payload));
    this.layout = this.engine.layout;
    this.life.bind(signal);
  }

  /** True after `destroy()` (including a destroy caused by a signal). */
  protected get isDestroyed(): boolean { return this.life.destroyed; }

  mount(target: MountTarget): void { this.life.mount(target, this.layout, element => element.append(this.container)); }

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void, options?: SignalOptions): () => void { return this.life.on(event, handler, options); }

  destroy(): void {
    if (!this.life.end(this.layout)) return;
    try { this.engine.destroy(); } finally { this.container.remove(); }
  }
}

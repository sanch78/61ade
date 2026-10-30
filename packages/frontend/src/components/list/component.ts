import type { Layout } from "@dhtmlx/suite";
import type { ComponentOptions, MountTarget, SignalOptions } from "../../api/types";
import { Lifecycle, optionSignal } from "../Lifecycle";

/**
 * Lifecycle shared by the list components (docs/toolkit.md#components, `Lifecycle`): the root Layout lives in a
 * detached host element until `mount` places it (once) in an element, a Layout cell, an `AppWindow` or a `ViewHost`; a
 * window or view host destroys the component when it closes. `destroy` is idempotent, detaches the Layout from its
 * cell and releases the subclass's widgets (`dispose`), every handler and the mount listeners. Events are delivered
 * only while mounted.
 */
export abstract class Component<Events extends object>{
  abstract readonly layout:Layout;
  /** The element the root Layout is rendered into. */
  protected readonly host:HTMLElement=document.createElement("div");
  private readonly life=new Lifecycle<Events>(()=>this.destroy());
  /** Checks the `signal` option (`TypeError`) before the subclass creates anything. */
  constructor(options?:ComponentOptions){optionSignal(options);}
  protected get destroyed():boolean{return this.life.destroyed;}
  /** Ties the component to $signal (call at the end of the subclass constructor). */
  protected bind(signal?:AbortSignal):void{this.life.bind(signal);}
  mount(target:MountTarget):void{
    this.life.mount(target,this.layout,element=>{
      this.host.style.height="100%";this.host.style.width="100%";
      element.append(this.host);this.layout.paint();
    });
  }
  on<K extends keyof Events>(event:K,handler:(payload:Events[K])=>void,options?:SignalOptions):()=>void{return this.life.on(event,handler,options);}
  /** Calls the handlers in registration order; a throwing handler is logged and the others still run. */
  protected emit<K extends keyof Events>(event:K,payload:Events[K]):void{this.life.emit(event,payload);}
  destroy():void{
    // Detached first, like the shell's workspace cell: the cell must not repaint a destroyed widget.
    if(!this.life.end(this.layout))return;
    this.dispose();
    this.host.remove();
  }
  /** Releases the subclass's widgets, windows, requests and subscriptions. */
  protected abstract dispose():void;
}

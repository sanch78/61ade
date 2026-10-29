import type { Layout } from "@dhtmlx/suite";
import type { AppWindow, LayoutCell, MountTarget, ViewHost } from "../../api/types";

const isViewHost=(target:MountTarget):target is ViewHost=>!(target instanceof HTMLElement)&&"app" in target&&"signal" in target&&"close" in target;
const isWindow=(target:MountTarget):target is AppWindow=>!(target instanceof HTMLElement)&&"window" in target&&"signal" in target&&"fit" in target;

/**
 * Lifecycle shared by the public components (docs/toolkit.md#components): the root Layout lives in a detached
 * host element until `mount` places it in an element, a Layout cell, an `AppWindow` or a `ViewHost`; a window or
 * view host destroys the component when it closes. `destroy` is idempotent and releases the subclass's widgets
 * (`dispose`), every handler and the mount listeners. Events are delivered only while mounted.
 */
export abstract class Component<Events extends object>{
  abstract readonly layout:Layout;
  /** The element the root Layout is rendered into. */
  protected readonly host:HTMLElement=document.createElement("div");
  protected destroyed=false;
  private mounted=false;
  private cell?:LayoutCell;
  private handlers=new Map<keyof Events,Set<(payload:any)=>void>>();
  private listeners=new AbortController();
  /** Ties the component to $signal (call at the end of the subclass constructor). */
  protected bind(signal?:AbortSignal):void{
    if(signal?.aborted){this.destroy();return;}
    signal?.addEventListener("abort",()=>this.destroy(),{once:true,signal:this.listeners.signal});
  }
  mount(target:MountTarget):void{
    if(this.destroyed)return;
    if(target instanceof HTMLElement){
      this.host.style.height="100%";this.host.style.width="100%";
      target.append(this.host);this.layout.paint();
    }else if(isViewHost(target)||isWindow(target)){
      target.attach(this.layout);
      target.signal.addEventListener("abort",()=>this.destroy(),{once:true,signal:this.listeners.signal});
    }else{target.attach(this.layout);this.cell=target;}
    this.mounted=true;
  }
  on<K extends keyof Events>(event:K,handler:(payload:Events[K])=>void):()=>void{
    if(this.destroyed||typeof handler!=="function")return ()=>{};
    if(!this.handlers.has(event))this.handlers.set(event,new Set());
    this.handlers.get(event)!.add(handler);
    return ()=>{this.handlers.get(event)?.delete(handler);};
  }
  /** Calls the handlers in registration order; a throwing handler is logged and the others still run. */
  protected emit<K extends keyof Events>(event:K,payload:Events[K]):void{
    if(this.destroyed||!this.mounted)return;
    for(const handler of [...(this.handlers.get(event)??[])]){try{handler(payload);}catch(error){console.error(error);}}
  }
  destroy():void{
    if(this.destroyed)return;
    this.destroyed=true;this.listeners.abort();this.handlers.clear();
    // Detached first, like the shell's workspace cell: the cell must not repaint a destroyed widget.
    if(this.cell&&this.cell.getWidget()===this.layout)this.cell.detach();
    this.cell=undefined;
    this.dispose();
    this.host.remove();
  }
  /** Releases the subclass's widgets, windows, requests and subscriptions. */
  protected abstract dispose():void;
}

import { t } from "./I18n";
import {Toolbar} from "@dhtmlx/suite";

/** Native Toolbar dropdowns share the same item IDs, state and click events. */
export class ResponsiveToolbar extends Toolbar {
  private order:any[];
  private compact=false;
  private observer:ResizeObserver;
  private listeners=new AbortController();
  constructor(element:HTMLElement|undefined,config:any){
    super(element??document.createElement("div"),config);
    this.order=this.data.serialize().map((item:any)=>this.restoreItem(item));
    this.observer=new ResizeObserver(()=>this.reflow());
    this.observer.observe(this.getRootNode());
    window.addEventListener("resize",()=>this.reflow(),{signal:this.listeners.signal});
    this.reflow();
  }
  private restoreItem(original:any,current=original):any{
    const item={...current};
    // Suite assigns menuItem types while drawing dropdown children. Those types
    // must not leak back into the horizontal Toolbar after a resize.
    if(original.type!==undefined)item.type=original.type;else delete item.type;
    if(original.items)item.items=original.items.map((child:any)=>this.restoreItem(child,current.items?.find((item:any)=>String(item.id)===String(child.id))??child));
    return item;
  }
  private reflow():void{
    const width=this.getRootNode()?.clientWidth;
    if(!width)return;
    const serialized:any[]=this.data.serialize();
    const current:any[]=this.compact?serialized[0]?.items??[]:serialized;
    const entries=this.order.map(original=>original.type==="spacer"?original:this.restoreItem(original,current.find(item=>String(item.id)===String(original.id))??original));
    const required=entries.filter(item=>!item.hidden&&item.type!=="spacer").reduce((sum,item)=>sum+60+String(item.value??"").length*8,16);
    const compact=innerWidth<768||width<required;
    if(compact===this.compact)return;
    this.compact=compact;
    this._close(new MouseEvent("click"));
    this.data.removeAll();
    this.data.parse(compact?[{id:"vapa-command-menu",value:t("Műveletek"),icon:"dxi dxi-view-grid",items:entries.filter(item=>item.type!=="spacer")}]:entries);
  }
  disposeResponsive():void{this.observer.disconnect();this.listeners.abort();}
}

import { t } from "./I18n";
import {Toolbar} from "@dhtmlx/suite";

/**
 * Native Toolbar dropdowns share the same item IDs, state and click events. Escape closes an open menu wherever the
 * focus is (Suite closes it only while the focus is inside the popup) and returns the focus to its toggle.
 */
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
    // Capture phase: the menu closes before a window or view behind it sees the Escape.
    document.addEventListener("keydown",event=>this.escape(event),{capture:true,signal:this.listeners.signal});
    this.reflow();
  }
  private escape(event:KeyboardEvent):void{
    if(event.key!=="Escape"||!this._popupActive)return;
    const root=this.data.getRoot();
    let opener=this._activeMenu;
    while(opener!==undefined&&opener!==null&&this.data.getParent(opener)!==root)opener=this.data.getParent(opener);
    event.preventDefault();event.stopPropagation();
    this._close(event as unknown as MouseEvent);
    if(opener!==undefined&&opener!==null)(this.getRootNode()?.querySelector(`[data-dhx-id="${CSS.escape(String(opener))}"]`) as HTMLElement|null)?.focus();
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
    // An icon-only button (`blade-command--icon`) and a separator take a fixed width; a labelled button grows with its text.
    const required=entries.filter(item=>!item.hidden&&item.type!=="spacer").reduce((sum,item)=>sum+(item.type==="separator"?12:String(item.css??"").includes("blade-command--icon")?44:60+String(item.value??"").length*8),16);
    const compact=innerWidth<768||width<required;
    if(compact===this.compact)return;
    this.compact=compact;
    this._close(new MouseEvent("click"));
    this.data.removeAll();
    this.data.parse(compact?[{id:"blade-command-menu",value:t("Műveletek"),icon:"dxi dxi-view-grid",items:entries.filter(item=>item.type!=="spacer")}]:entries);
  }
  disposeResponsive():void{this.observer.disconnect();this.listeners.abort();}
}

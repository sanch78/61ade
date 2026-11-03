import { t } from "./I18n";
import {Toolbar,awaitRedraw} from "@dhtmlx/suite";
import type {Id} from "@dhtmlx/suite/codebase/types/ts-common/types";

/**
 * Native Toolbar dropdowns share the same item IDs, state and click events. Escape closes an open menu wherever the
 * focus is (Suite closes it only while the focus is inside the popup) and returns the focus to its toggle.
 */
export class ResponsiveToolbar extends Toolbar {
  private order:any[];
  private compact=false;
  private prepared=false;
  private backItems=new Map<string,Id>();
  private fallbackMenus=new Set<Id>();
  private observer:ResizeObserver;
  private listeners=new AbortController();
  constructor(element:HTMLElement|undefined,config:any,private collapse?:{id:string;value:string;icon:string;css?:string;availableWidth:()=>number}){
    super(element??document.createElement("div"),config);
    this.order=this.data.serialize().map((item:any)=>this.restoreItem(item));
    this.observer=new ResizeObserver(()=>this.reflow());
    this.observer.observe(this.getRootNode());
    window.addEventListener("resize",()=>{this._close(new MouseEvent("click"));this.reflow();},{signal:this.listeners.signal});
    // Capture phase: the menu closes before a window or view behind it sees the Escape.
    document.addEventListener("keydown",event=>this.escape(event),{capture:true,signal:this.listeners.signal});
    this.events.on("click",(id:string|number)=>{
      const parent=this.backItems.get(String(id));
      if(parent!==undefined){const root=this._currentRoot;queueMicrotask(()=>this.back(parent,root));}
    });
    this.reflow();
  }
  /** Keep native cascades when they fit; replace covered ancestors at the root toggle otherwise. */
  protected _getParents(id:Id,root:Id):Id[]{
    const parents=super._getParents(id,root);
    const fallback=parents.find(parent=>this.fallbackMenus.has(parent));
    for(const back of this.backItems.keys()){
      if(this.data.exists(back))this.data.update(back,{hidden:!this.fallbackMenus.has(this.data.getParent(back))},false);
    }
    if(fallback===undefined)return parents;
    this.data.update(fallback,{$position:{...this.data.getItem(root).$position}},false);
    this.data.update(root,{$activeParent:true},false);
    return parents.slice(0,parents.indexOf(fallback)+1);
  }
  protected _getMode(item:any,root:Id):"bottom"|"right"{
    if(item.id===root)return "bottom";
    if(!this.fallbackMenus.has(item.id)){
      // Suite calls this after inserting the native popup, so measure its actual
      // themed width, including long labels, rather than a viewport breakpoint.
      const child=this.data.getItems(item.id).find((child:any)=>!child.hidden);
      const popup=child&&(this._vpopups?.node?.el as HTMLElement|undefined)?.querySelector<HTMLElement>(`[data-dhx-id="${CSS.escape(String(child.id))}"]`)?.closest<HTMLElement>('[role="menu"]');
      if(popup&&item.$position.right+popup.getBoundingClientRect().width+4>document.documentElement.clientWidth){
        this.fallbackMenus.add(item.id);
        queueMicrotask(()=>{if(!this.listeners.signal.aborted&&this._popupActive)this.paint();});
      }
    }
    if(!this.fallbackMenus.has(item.id))return "right";
    // The native position calculator already holds this rectangle by reference.
    Object.assign(item.$position,this.data.getItem(root).$position);
    return "bottom";
  }
  protected _close(event:MouseEvent):void{
    const root=this._currentRoot;
    super._close(event);
    this.fallbackMenus?.clear();
    if(root!==undefined&&root!==null&&this.data.exists(root))this.data.update(root,{$activeParent:false},false);
  }
  private back(parent:Id,root=this._currentRoot):void{
    if(this.listeners.signal.aborted)return;
    const opener=this.getRootNode()?.querySelector<HTMLElement>(`[data-dhx-id="${CSS.escape(String(root))}"]`);
    if(!opener)return;
    this.fallbackMenus.delete(this._activeMenu);
    if(parent!==root)this.fallbackMenus.add(parent);
    this._currentRoot=root;
    this._openMenu(parent,opener,new MouseEvent("click"));
    void awaitRedraw().then(()=>{
      if(this.listeners.signal.aborted)return;
      const item=this.data.getItem(parent),menu=Array.from(document.querySelectorAll<HTMLElement>('[role="menu"]')).find(menu=>menu.getAttribute("aria-label")===String(item.value??item.tooltip??""));
      const first=menu?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
      if(first){this._menuFocusId=first.dataset.dhxId!;first.focus();}
    });
  }
  private escape(event:KeyboardEvent):void{
    if(!this._popupActive)return;
    const active=this.data.haveItems(this._activeMenu)?this._activeMenu:this.data.getParent(this._activeMenu);
    if(event.key==="ArrowLeft"&&this.fallbackMenus.has(active)){
      event.preventDefault();event.stopPropagation();this.back(this.data.getParent(active));return;
    }
    if(event.key!=="Escape")return;
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
    const width=this.collapse?.availableWidth()??this.getRootNode()?.clientWidth;
    if(!width)return;
    const serialized:any[]=this.data.serialize();
    const current:any[]=this.compact?serialized[0]?.items??[]:serialized;
    const entries=this.order.map(original=>original.type==="spacer"?original:this.restoreItem(original,current.find(item=>String(item.id)===String(original.id))??original));
    // An icon-only button (`blade-command--icon`) and a separator take a fixed width; a labelled button grows with its text.
    const required=entries.filter(item=>!item.hidden&&item.type!=="spacer").reduce((sum,item)=>sum+(item.type==="separator"?12:String(item.css??"").includes("blade-command--icon")?44:60+String(item.value??"").length*8),16);
    const compact=innerWidth<768||width<required;
    if(compact===this.compact&&this.prepared)return;
    this.prepared=true;
    this.compact=compact;
    this._close(new MouseEvent("click"));
    this.backItems.clear();
    const withBack=(items:any[],parent:Id):any[]=>items.map(item=>{
      if(!item.items)return item;
      let id="blade-toolbar-back:"+item.id;
      while(this.data.exists(id)||this.backItems.has(id))id+=":";
      this.backItems.set(id,parent);
      return {...item,items:[{id,hidden:true,value:t("Vissza"),icon:"dxi dxi-arrow-left"},...withBack(item.items,item.id)]};
    });
    const menuEntries=withBack(compact?entries.filter(item=>item.type!=="spacer"):entries,this.collapse?.id??"blade-command-menu");
    this.data.removeAll();
    this.data.parse(compact?[{id:this.collapse?.id??"blade-command-menu",value:this.collapse?.value??t("Műveletek"),icon:this.collapse?.icon??"dxi dxi-view-grid",css:this.collapse?.css,tooltip:this.collapse?.value,items:menuEntries}]:menuEntries);
  }
  disposeResponsive():void{this.observer.disconnect();this.listeners.abort();}
}

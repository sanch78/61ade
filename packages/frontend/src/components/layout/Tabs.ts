import { Layout, Tabbar, awaitRedraw } from "@dhtmlx/suite";
import type { LayoutCell, Mountable, MountTarget, RegionPlaceholder, TabDefinition, Tabs as TabsApi, TabsEvents, TabsOptions } from "../../api/types";
import { hold, placeholder as applyPlaceholder, regionStatus, type CellStatus } from "../CellStatus";
import { attachContent } from "../../api/services";
import { UiPreferences } from "../../UiPreferences";
import { headerRowHeight } from "../../HeaderRow";
import { Component } from "../list/component";

const TAB=/^[a-z][a-z0-9_-]{0,63}$/;
const KEYS=new Set(["id","label","disabled"]);
let instances=0;

/**
 * A region a `PageLayout` with a `narrow` tree keeps across its arrangements: its content cell, placeholder and the
 * owner of attached elements are the page's, so the tab or section only frames it (framework-internal).
 */
export type HeldRegion={cell:LayoutCell;status:CellStatus;signal:AbortSignal};
/** A logical tab group's current selection and unanswered history guard across responsive recreation. */
export type TabHistoryState={active:string;pending?:{to:string;answer:Promise<boolean>}};
/** What a `PageLayout` hands the `Tabs` and `Accordion` of its branches (framework-internal). */
export type Framed={
  /** The preference key, the page's own (`id.tabs-1`, below 768 px `id:narrow.tabs-1`): not a public id. */
  key:string;
  /** With `narrow`: the regions the page keeps across its arrangements. */
  held?:(id:string)=>HeldRegion|undefined;
  history?:TabHistoryState;
};

/** Checks the declared tabs (1–12, unique ids `[a-z][a-z0-9_-]*`, plain-text labels of 1–80 characters); throws `TypeError`. */
export function checkTabs(tabs:unknown,owner="Tabs"):TabDefinition[]{
  const fail=(reason:string):never=>{throw new TypeError(`61ade: ${owner}: ${reason}.`);};
  if(!Array.isArray(tabs)||!tabs.length||tabs.length>12)fail("tabs is a list of 1 to 12 tabs");
  const ids=new Set<string>();
  for(const tab of tabs as unknown[]){
    if(!tab||typeof tab!=="object"||Array.isArray(tab))fail("a tab is an object");
    const value=tab as Record<string,unknown>;
    for(const key of Object.keys(value))if(!KEYS.has(key))fail(`unsupported tab option "${key}"`);
    if(typeof value.id!=="string"||!TAB.test(value.id)||ids.has(value.id))fail(`tab id "${String(value.id)}" is missing, invalid or repeated`);
    if(typeof value.label!=="string"||!value.label.trim()||value.label.length>80)fail("a tab label is text of 1 to 80 characters");
    if(value.disabled!==undefined&&typeof value.disabled!=="boolean")fail('"disabled" is a boolean');
    ids.add(value.id as string);
  }
  if((tabs as TabDefinition[]).every(tab=>tab.disabled))fail("at least one tab is enabled");
  return (tabs as TabDefinition[]).map(tab=>({...tab}));
}

/**
 * Tabbed panels as a public component (`app.components.Tabs`, docs/toolkit.md#tabs): the native Suite Tabbar as the
 * tab row (plain-text labels, Suite's arrow and Home/End keys between the enabled tabs) above one Layout cell per tab
 * (a mount target of every component, or `attach` for a widget or element). Every panel stays rendered; the inactive
 * ones are hidden with CSS, so a widget in a hidden tab may repaint (a form keeps its input, a `RecordDetails`
 * reloads) — Suite's own Tabbar content renders the active cell only and fails to re-inject a widget that repainted
 * while hidden. An optional guard runs before every change (a dirty form asks before it is left), the last active tab
 * is kept per page and user when an `id` is given, and the WAI-ARIA tab roles Suite 9.3.12 leaves out are added.
 */
export class Tabs extends Component<TabsEvents> implements TabsApi{
  readonly layout:Layout;
  readonly tabbar:Tabbar;
  private tabs:TabDefinition[];
  private prefix:string;
  private released=new AbortController();
  private preferences?:UiPreferences;
  /** A guarded change that the guard has allowed: the next `beforeChange` for it passes. */
  private allowed?:string;
  private pending?:Promise<boolean>;
  private historyGuard?:TabHistoryState["pending"];
  /** Restoration uses the normal change event and preferences, without making another history entry. */
  private restoring=false;
  private historyAbort=new AbortController();
  private writeHistory?: (value:string|null,options?:{replace?:boolean})=>void;
  private observer?:MutationObserver;
  /** Each tab's placeholder while it holds nothing. */
  private statuses=new Map<string,CellStatus>();
  private held?:(id:string)=>HeldRegion|undefined;
  constructor(context:{user:string},private options:TabsOptions,framed?:Framed){
    super(options);
    this.tabs=checkTabs(options?.tabs);
    if(options.id!==undefined&&(typeof options.id!=="string"||!/^[a-z][a-z0-9_.-]*$/.test(options.id)))throw new TypeError("61ade: Tabs: id is the preference key ([a-z][a-z0-9_.-]*).");
    if(options.guard!==undefined&&typeof options.guard!=="function")throw new TypeError("61ade: Tabs: guard is a function.");
    const enabled=this.tabs.filter(tab=>!tab.disabled).map(tab=>tab.id);
    if(options.active!==undefined&&!enabled.includes(options.active))throw new TypeError(`61ade: Tabs: active tab "${String(options.active)}" is not an enabled tab.`);
    // Suite writes the tab id into global DOM ids (`tab-content-<id>`): each instance gets its own prefix.
    this.prefix=`blade-tab${++instances}-`;
    this.held=framed?.held;
    const key=framed?.key??options.id;
    if(key)this.preferences=new UiPreferences(context.user,key);
    const remembered=this.preferences?.tab();
    const previous=framed?.history;
    const active=previous&&enabled.includes(previous.active)?previous.active:options.active??(remembered&&enabled.includes(remembered)?remembered:enabled[0]);
    const height=options.headerHeight===undefined?"var(--blade-header-row-size)":headerRowHeight(options.headerHeight);
    this.layout=new Layout(this.host,{type:"none",css:"blade-tabs",rows:[{id:this.prefix+"row",height,css:"blade-tabs__row"},
      {css:"blade-tabs__panels",rows:this.tabs.map(tab=>({id:this.cellId(tab.id),css:this.panelCss(tab.id===active)}))}]} as any);
    this.tabbar=new Tabbar(null,{mode:"top",noContent:true,tabHeight:height,activeView:this.cellId(active),
      disabled:this.tabs.filter(tab=>tab.disabled).map(tab=>this.cellId(tab.id)),
      views:this.tabs.map(tab=>({id:this.cellId(tab.id),tab:tab.label}))} as any);
    this.layout.getCell(this.prefix+"row").attach(this.tabbar);
    for(const tab of this.tabs)if(!this.held?.(tab.id))this.statuses.set(tab.id,regionStatus(this.layout.getCell(this.cellId(tab.id))));
    this.tabbar.events.on("beforeChange",(to:string,from:string)=>this.beforeChange(this.tabId(to),this.tabId(from)));
    this.tabbar.events.on("change",(to:string,from:string)=>{
      const id=this.tabId(to),previous=this.tabId(from);
      this.show(id);
      this.preferences?.setTab(id);
      if(!this.restoring)this.writeHistory?.(id);
      this.emit("change",{id,previous});
    });
    if(options.history){
      let initial=true;
      this.writeHistory=options.history.host.selection(options.history.key,async(value,signal)=>{
        const first=initial;initial=false;
        const fallback=this.tabs.some(tab=>tab.id===active&&!tab.disabled)?active:this.tabs.find(tab=>!tab.disabled)!.id;
        const target=value!==null&&this.tabs.some(tab=>tab.id===value&&!tab.disabled)?value:fallback;
        await this.choose(target,true,signal,first&&!previous,first?previous?.pending:undefined);
        return this.active();
      },{signal:this.historyAbort.signal});
    }
    this.bind(options.signal);
  }
  private panelCss(active:boolean):string{return active?"blade-tabs__panel":"blade-tabs__panel blade-tabs__panel--hidden";}
  /** Shows the panel of $id and hides the others (CSS only: every panel stays rendered). */
  private show(id:string):void{
    for(const tab of this.tabs)this.layout.getCell(this.cellId(tab.id)).config.css=this.panelCss(tab.id===id);
    this.layout.paint();
  }
  /**
   * Suite renders where the component is attached (a cell or window, not this component's host): the tab roles are
   * kept on its root on every redraw (Suite patches only the attributes it renders).
   */
  override mount(target:MountTarget):void{
    super.mount(target);
    void awaitRedraw().then(()=>{
      const root=this.layout.getRootNode() as HTMLElement|null|undefined;
      if(this.destroyed||!root)return;
      this.observer?.disconnect();
      this.observer=new MutationObserver(()=>this.roles());
      this.observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["aria-selected","class"]});
      this.roles();
    });
  }
  private cellId(id:string):string{return this.prefix+id;}
  private tabId(cell:string|undefined):string{return cell?.startsWith(this.prefix)?cell.slice(this.prefix.length):String(cell??"");}
  private known(id:string):TabDefinition{
    const tab=this.tabs.find(tab=>tab.id===id);
    if(!tab)throw new Error(`61ade: Tabs has no tab "${id}".`);
    return tab;
  }
  /** Suite's `beforeChange`: without a guard (or once it allowed this change) it passes; a pending guard re-selects. */
  private beforeChange(to:string,from:string):boolean{
    if(this.destroyed)return false;
    if(this.allowed===to){this.allowed=undefined;return true;}
    this.pending=undefined;this.historyGuard=undefined;
    const guard=this.options.guard;
    if(!guard||to===from)return true;
    let answer:boolean|Promise<boolean>;
    try{answer=guard({from,to});}catch(error){console.error(error);return false;}
    if(answer===true)return true;
    if(answer instanceof Promise)void this.wait(answer,to);
    return false;
  }
  private wait(answer:Promise<boolean>,to:string,restore=false,signal?:AbortSignal):Promise<boolean>{
    if(restore)this.historyGuard={to,answer};
    const pending=this.pending=answer.then(ok=>{
      if(!ok||this.destroyed||signal?.aborted||this.pending!==pending||this.known(to).disabled)return false;
      this.historyGuard=undefined;
      this.activate(to,restore);
      return this.active()===to;
    },error=>{console.error(error);return false;});
    return pending;
  }
  private activate(id:string,restore:boolean):void{
    this.allowed=id;this.restoring=restore;
    try{this.tabbar.setActive(this.cellId(id));}finally{this.allowed=undefined;this.restoring=false;}
  }
  private roles():void{
    const root=this.layout.getRootNode() as HTMLElement|null|undefined;
    if(!root?.querySelector)return;
    const set=(element:Element|null|undefined,name:string,value:string)=>{if(element&&element.getAttribute(name)!==value)element.setAttribute(name,value);};
    set(root.querySelector(".dhx_tabbar-header__wrapper ul"),"role","tablist");
    const active=this.tabbar.getActive();
    for(const button of Array.from(root.querySelectorAll<HTMLButtonElement>(".dhx_tabbar-tab-button"))){
      const cell=(button.closest(".dhx_tabbar-tab") as HTMLElement|null)?.getAttribute("dhx_tabid")??"";
      set(button,"role","tab");set(button,"aria-controls",cell+"-panel");
      // Roving focus: only the active tab is in the page's tab order; Suite's arrows move between the others.
      set(button,"tabindex",cell===active?"0":"-1");
    }
    for(const tab of this.tabs){
      const cell=this.cellId(tab.id),panel=root.querySelector(`[data-cell-id="${cell}"]`);
      set(panel,"role","tabpanel");set(panel,"id",cell+"-panel");set(panel,"aria-labelledby","tab-content-"+cell);
    }
  }
  /** The cell of a tab, a mount target of every component; an undeclared id throws `Error`. */
  cell(id:string):LayoutCell{this.known(id);return this.held?.(id)?.cell??this.panel(id);}
  /** The tab's own Layout cell (a held region's frame). */
  panel(id:string):LayoutCell{return this.layout.getCell(this.cellId(id));}
  /** The button of tab $id (where a `PageLayout` puts the focus after a switch). */
  control(id:string):HTMLElement|null{return document.getElementById("tab-content-"+this.cellId(id));}
  /** Puts a Suite widget, a public component or a plain element into a tab (released with the tabs). */
  attach(id:string,content:Mountable):void{if(!this.destroyed)attachContent(this.cell(id),content,this.held?.(id)?.signal??this.released.signal);}
  /** What a tab without content shows: the default text, its own text or the loading indicator. */
  placeholder(id:string,options:RegionPlaceholder):void{this.known(id);if(!this.destroyed)applyPlaceholder("Tabs",this.held?.(id)?.status??this.statuses.get(id)!,options);}
  /** Marks a tab whose content is about to change or ends the mark (as `PageLayout.busy`). */
  busy(id:string,on:boolean):void{this.known(id);if(!this.destroyed)hold("Tabs",this.held?.(id)?.status??this.statuses.get(id)!,on);}
  /** The active tab's id. */
  active():string{return this.tabId(this.tabbar.getActive());}
  /**
   * Opens a tab as a click does: a disabled tab stays closed, the guard is asked first. Resolves whether the tab is
   * active afterwards; an undeclared id throws `Error`.
   */
  select(id:string):Promise<boolean>{return this.choose(id);}
  private choose(id:string,restore=false,signal?:AbortSignal,initial=false,resume?:TabHistoryState["pending"]):Promise<boolean>{
    this.pending=undefined;this.historyGuard=undefined;
    const tab=this.known(id);
    if(this.destroyed||tab.disabled||signal?.aborted)return Promise.resolve(false);
    if(this.active()===id)return Promise.resolve(true);
    const guard=this.options.guard;
    if(guard&&!initial){
      let answer:boolean|Promise<boolean>;
      try{answer=resume?.to===id?resume.answer:guard({from:this.active(),to:id});}catch(error){console.error(error);return Promise.resolve(false);}
      if(answer instanceof Promise)return this.wait(answer,id,restore,signal);
      if(answer!==true)return Promise.resolve(false);
    }
    this.activate(id,restore);
    return Promise.resolve(this.active()===id);
  }
  /** Releases only the page binding before a PageLayout creates the other arrangement's group. */
  releaseHistory():void{this.historyAbort.abort();this.writeHistory=undefined;this.pending=undefined;}
  /** The state a responsive replacement needs to preserve an outstanding leave guard. */
  historyState():TabHistoryState{return {active:this.active(),pending:this.historyGuard};}
  /** Changes a tab's label or disabled state; the active tab cannot be disabled (`Error`). */
  update(id:string,changes:{label?:string;disabled?:boolean}):void{
    const tab=this.known(id);
    if(this.destroyed)return;
    const next={...tab,...changes};
    checkTabs(this.tabs.map(other=>other.id===id?next:other));
    if(next.disabled&&this.active()===id)throw new Error(`61ade: Tabs: the active tab "${id}" cannot be disabled.`);
    Object.assign(tab,next);
    if(changes.label!==undefined)this.tabbar.getCell(this.cellId(id)).config.tab=next.label;
    if(changes.disabled===true)this.tabbar.disableTab(this.cellId(id));
    else if(changes.disabled===false)this.tabbar.enableTab(this.cellId(id));
    this.tabbar.paint();
  }
  protected dispose():void{this.releaseHistory();this.observer?.disconnect();this.released.abort();for(const status of this.statuses.values())status.destroy();this.tabbar.destructor();this.layout.destructor();}
}

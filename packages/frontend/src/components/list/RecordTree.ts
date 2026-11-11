import { Layout, message } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { TreeAdapter, type TreeNode } from "../../TreeAdapter";
import { UiPreferences } from "../../UiPreferences";
import { acknowledge } from "../../MessageDialog";
import { attachContent } from "../../api/services";
import { server } from "../../api/Server";
import { optionText } from "../../RecordPresentation";
import type { ListKindOptions, Row, Tree as TreeApi, TreeEvents, TreeExpansion, TreeOptions, ViewDefinition as PublicDefinition } from "../../api/types";
import type { Snapshot } from "../../Realtime";
import { CommandBar } from "./CommandBar";
import { Component } from "./component";
import { resolveListView } from "./definition";
import { errorText } from "./fields";
import type { ListContext } from "./ListView";

/** Most children one node loads (in pages of 200); further ones are left out. */
const CHILDREN=1000;
/** Most levels a bulk expansion opens (`expandAll`, the largest `expand`). */
const DEPTH=10;
/** Most nodes a bulk expansion lets the tree hold: it starts no child load the server's child count says would exceed it. */
const NODES=2000;
/** Child loads a bulk expansion or a restore runs at a time. */
const PARALLEL=4;
/** Child of a node whose children are not loaded yet: it gives the node its expand toggle. */
const PENDING="\u0000pending";
const KEY=/^[a-z][a-z0-9_.-]*$/;
let trees=0;

/** The records a tree shows: a list view with a hierarchy on itself, its parent field and the field naming a node. */
export type NodeSource={view:PublicDefinition<ListKindOptions>;parent:string;label:string};
type Initial=NonNullable<TreeOptions["initial"]>;

/**
 * The record tree behind `app.components.Tree` and the tree panel of tree navigation (docs/toolkit.md#tree): roots are
 * the records with an empty parent field; a node's children load, through the resource's ordinary `list` with the
 * parent filter, when it is first expanded. The element is the WAI-ARIA tree (`role="tree"`, one tab stop,
 * `aria-activedescendant`): the arrow keys, Home and End move the focus, Space selects, Enter selects and activates.
 * Suite's own key navigation is off; the roles, levels and states are set on Suite's items after every redraw.
 */
export class NodeTree {
  readonly element=document.createElement("div");
  readonly adapter:TreeAdapter;
  private rows=new Map<string,Row>();
  private loaded=new Set<string>();
  /** Expanded nodes, also while a reload has removed them (they open again when they are back). */
  private opened=new Set<string>();
  private current?:string;
  private focused?:string;
  private restoring=false;
  private annotating=false;
  private abort=new AbortController();
  private observer=new MutationObserver(()=>this.annotate());
  private prefix="blade-tree-"+(++trees)+"-";
  private ids=new Map<string,string>();
  /** The latest load per level: an older answer (a reload overtook it) is dropped. */
  private loads=new Map<string,number>();
  /** Parents ("" the roots) with more children than one node loads. */
  private cut=new Set<string>();
  /**
   * The user (or `expandAll`/`collapseAll`, or a stored expansion found at start) changed the expansion: it is stored;
   * until then only the selection is, and the next mount opens the `expand` depth again.
   */
  private changed=false;
  /** Bulk changes running (no save per node). */
  private batch=0;
  private running=0;
  /** Expansions and collapses made by code (`toggle`, a restored selection), not by the user. */
  private quiet=0;
  /** Selection changes; the start applies its remembered or initial selection only when none happened meanwhile. */
  private picks=0;
  /** Nodes the user collapsed while a restore or bulk expansion runs: it does not open them again. */
  private closed=new Set<string>();
  /** The running bulk expansion; a newer one, `collapseAll`, `refresh` and `destroy` cancel it. */
  private bulk?:AbortController;
  /** The start and the latest refresh; a bulk command waits for them, so it acts on their result. Never rejects. */
  private settled:Promise<void>=Promise.resolve();
  /**
   * $bulk: the component's tree (`*` expands the focused node's siblings); tree navigation keeps its keys. `busy` tells
   * the host when a bulk expansion starts and ends.
   */
  constructor(private source:NodeSource,private hooks:{select(id:string|undefined):void;activate?(id:string):void;busy?(busy:boolean):void},name:string,private preferences?:UiPreferences,private bulkKeys=false){
    const signal=this.abort.signal;
    this.element.className="blade-record-tree";
    this.element.tabIndex=0;
    this.element.setAttribute("role","tree");
    this.element.setAttribute("aria-label",name);
    this.adapter=new TreeAdapter(id=>this.choose(id),id=>this.activate(id),id=>void this.expanded(id),{element:this.element,collapse:id=>this.collapsed(id)});
    this.element.addEventListener("keydown",event=>this.key(event),{signal});
    // Entering the tree puts the focus on the selection (or the first node).
    this.element.addEventListener("focus",()=>{if(this.focused===undefined||!this.exists(this.focused))this.focusOn(this.current??this.visible()[0]);},{signal});
    this.observer.observe(this.element,{childList:true,subtree:true});
  }
  /**
   * Loads the roots, opens the $remembered expanded nodes that load (or, with nothing remembered, $depth levels) and
   * selects the remembered node, else $initial, unless the selection changed meanwhile (docs/toolkit.md#tree-expansion).
   */
  start(initial:Initial,remembered:{expanded?:string[];selected?:string},depth=0):Promise<void>{
    // The initial expansion's controller exists at once, so `collapseAll` before the roots arrive cancels it.
    const bulk=!remembered.expanded&&depth>0?this.newBulk():undefined;
    return this.settled=this.begin(initial,remembered,depth,bulk).catch(error=>console.error("61ade: Tree start failed",error));
  }
  private async begin(initial:Initial,remembered:{expanded?:string[];selected?:string},depth:number,bulk?:AbortController):Promise<void>{
    // A stored expansion is the user's even when the roots fail now (a later `refresh` restores it).
    if(remembered.expanded){this.changed=true;for(const id of remembered.expanded)this.opened.add(id);}
    this.restoring=true;
    const picks=this.picks;
    let roots:Row[]|undefined;
    try{
      roots=await this.load("");
      if(roots&&remembered.expanded)await this.reopen([...this.opened]);
      else if(roots&&bulk)await this.expandTo(depth,bulk);
    }finally{this.restoring=false;}
    if(!roots)return;
    // The user (or `select`) chose while the start loaded: that selection stays, and is stored now.
    if(this.picks!==picks){this.save();return;}
    const wanted=remembered.selected!==undefined&&this.exists(remembered.selected)?remembered.selected
      :initial==="first"?(roots[0]?String(roots[0].id):undefined):typeof initial==="object"?initial.id:undefined;
    // The ancestors a restored selection opens are not the user's change.
    this.quiet++;
    try{if(wanted===undefined||!this.select(wanted))this.save();}finally{this.quiet--;}
  }
  row(id:string):Row|undefined{return this.exists(id)?this.rows.get(id):undefined;}
  get selected():string|undefined{return this.current;}
  exists(id:string):boolean{return !id.endsWith(PENDING)&&this.adapter.widget.data.exists(id);}
  parentOf(id:string):string|undefined{return this.adapter.parentOf(id);}
  label(row:Row):string{
    const column=this.source.view.options.columns.find(column=>column.id===this.source.label);
    return optionText(column??{},row[this.source.label])||String(row.id);
  }
  /** Selects a loaded node, expanding its ancestors (reported when it changed); false for an id that is not loaded. */
  select(id:string):boolean{
    if(!this.exists(id))return false;
    this.adapter.reveal(id);
    this.choose(id);
    return true;
  }
  /** Clears the selection (reported when there was one). */
  clear():void{this.choose(undefined);}
  /** Reloads the roots and every expanded level, or only the children of $id; the selection stays where it still exists. */
  refresh(id?:string):Promise<void>{
    if(id!==undefined&&(!this.exists(id)||!this.loaded.has(id)))return Promise.resolve();
    this.bulk?.abort();
    const run=this.reloadLevels(id),previous=this.settled;
    this.settled=Promise.all([previous,run]).then(()=>{},()=>{});
    return run;
  }
  private async reloadLevels(id?:string):Promise<void>{
    this.closed.clear();
    this.restoring=true;
    try{
      if(!await this.load(id??""))return;
      if(id!==undefined&&this.opened.has(id))this.toggle(id,true);
      await this.reopen([...this.opened]);
    }finally{this.restoring=false;}
    const current=this.current;
    if(current!==undefined&&!this.exists(current))this.choose(undefined);
    else this.adapter.choose(current);
    if(this.focused!==undefined&&!this.exists(this.focused))this.focused=this.current;
    if(this.focused!==undefined)this.focusOn(this.focused);
    this.annotate();this.save();
  }
  /** Reloads the children of $parent ("" for the roots) and expands it, for a node action's result. */
  async reload(parent:string):Promise<void>{
    if(parent!==""&&!this.exists(parent))return;
    if(!await this.load(parent))return;
    if(parent!=="")this.adapter.widget.expand(parent);
    if(this.current!==undefined&&this.exists(this.current))this.adapter.reveal(this.current);
  }
  private node(row:Row,parent:string):TreeNode[]{
    const id=String(row.id),count=row._subview;
    // Unknown (`_subview` left out) or positive: the node gets its toggle; its children load on expansion.
    return [{id,parent,value:this.label(row)},...(count===undefined||Number(count)>0?[{id:id+PENDING,parent:id,value:t("Betöltés…"),folder:false}]:[])];
  }
  /**
   * Loads the children of $parent ("" for the roots) into the tree; undefined after a failure (shown, or given to
   * $failed) or a cancel.
   */
  private async load(parent:string,signal=this.abort.signal,failed?:(error:unknown)=>void):Promise<Row[]|undefined>{
    const {view,label}=this.source,sortable=view.options.sortable?.includes(label);
    const generation=(this.loads.get(parent)??0)+1;this.loads.set(parent,generation);
    const rows:Row[]=[];let cursor:string|null=null;
    try{
      do{
        const data:Snapshot=await server.call(view.resource!,"list",{values:{mode:"dynamic",limit:200,scope:{field:this.source.parent,value:parent},...(sortable?{sort:{field:label,direction:"asc"}}:{}),...(cursor?{cursor}:{})},signal});
        rows.push(...data.items);cursor=data.next;
      }while(cursor&&rows.length<CHILDREN);
    }catch(error){
      if(!signal.aborted){if(failed)failed(error);else await this.failed(error);}
      return undefined;
    }
    if(signal.aborted||this.loads.get(parent)!==generation)return undefined;
    if(cursor||rows.length>CHILDREN)this.cut.add(parent);else this.cut.delete(parent);
    const data=this.adapter.widget.data;
    // The replaced levels below $parent are loaded again when they open.
    if(parent==="")this.loaded.clear();else if(data.exists(parent))data.eachChild(parent,item=>{this.loaded.delete(String(item.id));});
    const shown=rows.slice(0,CHILDREN);
    for(const row of shown)this.rows.set(String(row.id),row);
    const nodes=shown.flatMap(row=>this.node(row,parent));
    if(parent==="")this.adapter.setItems(nodes,"");else this.adapter.setChildren(parent,nodes);
    // An empty tree says so (no roots the actor may read).
    if(parent==="")this.element.dataset.bladeEmpty=shown.length?"":t("Nincs megjeleníthető elem.");
    this.loaded.add(parent);
    if(this.current!==undefined&&this.exists(this.current))this.adapter.choose(this.current);
    return shown;
  }
  private async failed(error:unknown):Promise<void>{
    if(!this.abort.signal.aborted)await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,[])});
  }
  /**
   * Opens the expanded $ids that exist (parents first, as their levels load, PARALLEL at a time); the others stay
   * expanded-to-be until their parent loads. A node the user collapsed meanwhile stays collapsed; the first failed
   * load stops it with one error dialog.
   */
  private async reopen(ids:string[]):Promise<void>{
    const pending=new Set(ids.filter(id=>!id.endsWith(PENDING)));
    const control=this.linked();let failure:{error:unknown}|undefined;
    try{
      while(pending.size&&!control.signal.aborted){
        const ready=[...pending].filter(id=>this.exists(id));
        if(!ready.length)break;
        for(const id of ready)pending.delete(id);
        await this.pool(ready,async id=>{
          if(!this.opened.has(id))return;
          if(!this.loaded.has(id)&&!await this.load(id,control.signal,error=>{failure??={error};control.abort();}))return !failure;
          if(this.opened.has(id)&&this.adapter.widget.data.haveItems(id))this.toggle(id,true);
        });
      }
    }finally{control.abort();}
    if(failure)await this.failed(failure.error);
  }
  /** Expands or collapses $id from code (not the user's change). */
  private toggle(id:string,open:boolean):void{
    this.quiet++;
    try{if(open)this.adapter.widget.expand(id);else this.adapter.widget.collapse(id);}finally{this.quiet--;}
  }
  /** A controller that `destroy` aborts too; abort it when done (that also releases its listener). */
  private linked():AbortController{
    const control=new AbortController();
    if(this.abort.signal.aborted)control.abort();
    else this.abort.signal.addEventListener("abort",()=>control.abort(),{once:true,signal:control.signal});
    return control;
  }
  /** Waits for the start and a running refresh. */
  private async idle():Promise<void>{for(let wait=this.settled;;wait=this.settled){await wait;if(wait===this.settled)return;}}
  /** Runs $task over $ids in order, PARALLEL at a time; a task returning false starts no further one. */
  private async pool(ids:string[],task:(id:string)=>Promise<boolean|void>):Promise<void>{
    const queue=[...ids];let stop=false;
    await Promise.all(Array.from({length:Math.min(PARALLEL,queue.length)},async()=>{
      for(let id=queue.shift();id!==undefined&&!stop;id=queue.shift())if(await task(id)===false)stop=true;
    }));
  }
  private children(id:string):string[]{
    const data=this.adapter.widget.data;
    return (data.getItems(id===""?data.getRoot():id) as any[]).map(item=>String(item.id)).filter(id=>!id.endsWith(PENDING));
  }
  private isOpen(id:string):boolean{return !!(this.adapter.widget.data.getItem(id) as any)?.opened;}
  /** The nodes loaded in the tree. */
  private count(id=""):number{return this.children(id).reduce((sum,child)=>sum+1+this.count(child),0);}
  /** A new bulk expansion's controller: it cancels the previous one; `destroy` cancels it too. */
  private newBulk():AbortController{this.bulk?.abort();this.closed.clear();return this.bulk=this.linked();}
  /**
   * Opens the nodes of levels 1…$depth below $level (the roots: level 1), level by level, loading children PARALLEL at a
   * time within NODES (docs/toolkit.md#tree-expansion). "depth" means nodes below the last opened level have children.
   */
  private async expandTo(depth:number,bulk:AbortController,level=this.children("")):Promise<TreeExpansion>{
    const data=this.adapter.widget.data,signal=bulk.signal;
    let total=this.count(),reason:TreeExpansion["reason"],failure:{error:unknown}|undefined;
    // The first failed load stops the others (one error dialog).
    const failed=(error:unknown)=>{failure??={error};bulk.abort();};
    this.batch++;this.running++;
    if(this.running===1){this.element.setAttribute("aria-busy","true");this.hooks.busy?.(true);}
    try{
      for(let current=1;current<=depth&&level.length&&!reason;current++){
        await this.pool(level,async id=>{
          if(signal.aborted)return false;
          if(!this.exists(id)||!data.haveItems(id)||this.closed.has(id))return;
          if(!this.loaded.has(id)){
            // The server's child count (`_subview`, ACL-filtered); unknown: the load that crosses the cap is the last.
            const count=Number(this.rows.get(id)?._subview),expected=Number.isFinite(count)&&count>0?Math.min(count,CHILDREN):1;
            if(total+expected>NODES){reason="nodes";return false;}
            total+=expected;
            const rows=await this.load(id,signal,failed);
            if(!rows)return false;
            total+=rows.length-expected;
            if(total>NODES)reason="nodes";
          }
          // Not a node the user collapsed while its children loaded.
          if(data.haveItems(id)&&!this.closed.has(id))this.toggle(id,true);
          return !reason&&!signal.aborted;
        });
        level=level.flatMap(id=>this.exists(id)&&this.isOpen(id)?this.children(id):[]);
      }
      if(failure)reason="error";
      else if(signal.aborted)reason="cancelled";
      else if(!reason&&level.some(id=>data.haveItems(id)))reason="depth";
      else if(!reason&&[...this.cut].some(id=>id===""||this.exists(id)))reason="children";
    }finally{
      this.batch--;this.running--;
      if(!this.running){this.element.removeAttribute("aria-busy");this.hooks.busy?.(false);}
    }
    this.annotate();
    if(failure)await this.failed(failure.error);
    return {complete:!reason,nodes:this.count(),...(reason?{reason}:{})};
  }
  /** Expands every node down to DEPTH levels; the result is kept as the user's expansion. */
  async expandAll():Promise<TreeExpansion>{
    await this.idle();
    if(this.abort.signal.aborted)return {complete:false,nodes:0,reason:"cancelled"};
    // The roots failed to load (their dialog was shown): nothing to expand.
    if(!this.loaded.has(""))return {complete:false,nodes:0,reason:"error"};
    const result=await this.expandTo(DEPTH,this.newBulk());
    if(!this.abort.signal.aborted){this.changed=true;this.save();}
    return result;
  }
  /** `*`: expands the siblings of $id (one level, like `expandAll` within its caps). */
  private async siblings(id:string):Promise<void>{
    const parent=this.parentOf(id);
    if(parent===undefined)return;
    await this.expandTo(1,this.newBulk(),this.children(parent));
    if(!this.abort.signal.aborted){this.changed=true;this.save();}
  }
  /** Collapses every node (cancels a running bulk expansion); the selection stays, a hidden focus moves to its root. */
  async collapseAll():Promise<void>{
    // Cancels a running expansion (the initial one too) at once, then acts on the finished start or refresh.
    this.bulk?.abort();
    await this.idle();
    if(this.abort.signal.aborted)return;
    this.batch++;
    try{for(const id of [...this.opened].reverse())if(this.exists(id)&&this.isOpen(id))this.toggle(id,false);}finally{this.batch--;}
    this.opened.clear();this.changed=true;
    this.annotate();this.save();
  }
  get busy():boolean{return this.running>0;}
  private async expanded(id:string):Promise<void>{
    if(id.endsWith(PENDING))return;
    // Suite reports an already open node again (an ancestor `reveal` opens): no change then.
    if(!this.opened.has(id)){this.opened.add(id);if(!this.quiet)this.changed=true;}
    if(!this.quiet)this.closed.delete(id);
    this.save();
    if(this.loaded.has(id)||!await this.load(id))return;
    // Its stored expanded descendants (kept while it was collapsed, also from an earlier mount) open again.
    if(this.children(id).some(child=>this.opened.has(child)))await this.reopen([...this.opened].filter(other=>!this.exists(other)||!this.isOpen(other)));
  }
  private collapsed(id:string):void{
    this.opened.delete(id);
    if(!this.quiet){this.changed=true;this.closed.add(id);}
    this.save();
    // The focus does not stay on a node the collapse hid.
    for(let node=this.focused;node!==undefined&&node!=="";node=this.parentOf(node))if(node===id&&this.focused!==id){this.focusOn(id);break;}
  }
  private choose(id:string|undefined):void{
    if(id!==undefined&&!this.exists(id))return;
    if(id!==undefined)this.focusOn(id);
    if(id===this.current){this.adapter.choose(id);this.annotate();return;}
    this.current=id;this.picks++;
    this.adapter.choose(id);
    this.annotate();this.save();
    this.hooks.select(id);
  }
  private activate(id:string):void{
    if(!this.exists(id))return;
    this.choose(id);
    this.hooks.activate?.(id);
  }
  private focusOn(id:string|undefined):void{
    this.focused=id;
    if(id!==undefined&&this.exists(id))this.adapter.widget.focusItem(id);
    this.annotate();
  }
  /**
   * The selection and, once changed, the expansion, upper levels first: of more than 200 expanded nodes the stored
   * (restored) ones are the upper levels.
   */
  private save():void{
    if(this.restoring||this.batch||!this.preferences)return;
    let expanded:string[]|undefined;
    if(this.changed){
      const levels=new Map<string,number>(),level=(id:string):number=>{let value=levels.get(id);if(value===undefined){const parent=this.parentOf(id);levels.set(id,value=parent?level(parent)+1:0);}return value;};
      // Stored ids below a node not loaded yet stay, after the loaded ones (the 200-id cap drops them first).
      expanded=[...[...this.opened].filter(id=>this.exists(id)).sort((a,b)=>level(a)-level(b)),...[...this.opened].filter(id=>!this.exists(id))];
    }
    this.preferences.setTree({...(expanded?{expanded}:{}),...(this.current!==undefined?{selected:this.current}:{})});
  }
  /** The nodes in display order (expanded levels only, without the loading placeholders). */
  private visible():string[]{
    const data=this.adapter.widget.data,out:string[]=[];
    const walk=(parent:string|number)=>{
      for(const item of data.getItems(parent) as any[]){
        const id=String(item.id);
        if(id.endsWith(PENDING))continue;
        out.push(id);
        if(item.opened)walk(item.id);
      }
    };
    walk(data.getRoot());
    return out;
  }
  private key(event:KeyboardEvent):void{
    if(event.altKey||event.ctrlKey||event.metaKey||event.target!==this.element)return;
    const data=this.adapter.widget.data,visible=this.visible();
    const focused=this.focused!==undefined&&visible.includes(this.focused)?this.focused:this.current!==undefined&&visible.includes(this.current)?this.current:visible[0];
    if(focused===undefined)return;
    const index=visible.indexOf(focused),folder=data.haveItems(focused),open=folder&&!!(data.getItem(focused) as any).opened;
    let next:string|undefined;
    switch(event.key){
      case "ArrowDown":next=visible[Math.min(index+1,visible.length-1)];break;
      case "ArrowUp":next=visible[Math.max(index-1,0)];break;
      case "Home":next=visible[0];break;
      case "End":next=visible[visible.length-1];break;
      case "ArrowRight":
        if(folder&&!open){this.adapter.widget.expand(focused);next=focused;}
        else{const child=open?String((data.getItems(focused)[0] as any)?.id):"";next=this.exists(child)?child:focused;}
        break;
      case "ArrowLeft":
        if(open){this.adapter.widget.collapse(focused);next=focused;}
        else next=this.parentOf(focused)||focused;
        break;
      case "*":if(!this.bulkKeys)return;event.preventDefault();void this.siblings(focused);return;
      case " ":event.preventDefault();this.choose(focused);return;
      case "Enter":event.preventDefault();this.activate(focused);return;
      default:return;
    }
    event.preventDefault();
    this.focusOn(next);
  }
  private elementId(id:string):string{
    let value=this.ids.get(id);
    if(value===undefined)this.ids.set(id,value=this.prefix+this.ids.size);
    return value;
  }
  /** Tree roles, levels and states on Suite's items (it redraws them without), and the active descendant. */
  private annotate():void{
    if(this.annotating)return;
    this.annotating=true;
    try{
      const data=this.adapter.widget.data,root=data.getRoot();
      const set=(element:Element,name:string,value:string)=>{if(element.getAttribute(name)!==value)element.setAttribute(name,value);};
      for(const list of Array.from(this.element.querySelectorAll("ul")))set(list,"role",list.parentElement?.closest("li[data-dhx-id]")?"group":"none");
      for(const item of Array.from(this.element.querySelectorAll<HTMLElement>("li[data-dhx-id]"))){
        const id=item.dataset.dhxId!;
        if(!data.exists(id))continue;
        let level=1;
        for(let parent=data.getParent(id);parent!==undefined&&parent!==null&&parent!==root&&data.exists(parent);parent=data.getParent(parent))level++;
        set(item,"role","treeitem");set(item,"id",this.elementId(id));set(item,"aria-level",String(level));
        set(item,"aria-label",String((data.getItem(id) as any).value??""));
        if(id.endsWith(PENDING)){set(item,"aria-disabled","true");item.removeAttribute("aria-selected");}
        else set(item,"aria-selected",String(id===this.current));
        if(data.haveItems(id))set(item,"aria-expanded",String(!!(data.getItem(id) as any).opened));else item.removeAttribute("aria-expanded");
      }
      const active=this.focused!==undefined&&this.exists(this.focused)?this.elementId(this.focused):undefined;
      if(active&&this.element.querySelector("#"+CSS.escape(active)))set(this.element,"aria-activedescendant",active);
      else this.element.removeAttribute("aria-activedescendant");
    }finally{this.annotating=false;}
  }
  destroy():void{this.abort.abort();this.observer.disconnect();this.adapter.destroy();}
}

/**
 * `app.components.Tree` (docs/toolkit.md#tree): the records of a list view with a hierarchy on itself as a tree, in its
 * own borderless Layout (the host's region gives the title). `select` and `activate` tell the host which node it is.
 */
const EXPAND_ICON="dxi dxi-plus-box";
export class RecordTree extends Component<TreeEvents> implements TreeApi{
  readonly layout:Layout;
  private nodes:NodeTree;
  private bar?:CommandBar;
  private abort=new AbortController();
  constructor(context:ListContext,options:TreeOptions){
    super(options);
    if(!options||typeof options!=="object")throw new TypeError("61ade: Tree needs options.");
    const view=resolveListView(context.app(),options.view),hierarchy=view.options.subview;
    if(!hierarchy?.shared||hierarchy.resource!==view.resource)throw new TypeError(`61ade: Tree needs a list view with a sub-view on its own resource ("${view.id}").`);
    if(typeof options.label!=="string"||options.label===hierarchy.field||!view.options.columns.some(column=>column.id===options.label))throw new TypeError("61ade: Tree `label` must be a column of the view.");
    const initial=options.initial??"first";
    if(initial!=="first"&&initial!=="none"&&!(initial&&typeof initial==="object"&&typeof initial.id==="string"&&initial.id!==""))throw new TypeError("61ade: Tree `initial` is \"first\", \"none\" or {id}.");
    if(options.id!==undefined&&(typeof options.id!=="string"||!KEY.test(options.id)))throw new TypeError("61ade: Tree `id` must match [a-z][a-z0-9_.-]*.");
    const depth=options.expand??0;
    if(!Number.isInteger(depth)||depth<0||depth>DEPTH)throw new TypeError(`61ade: Tree \`expand\` is a whole number of levels from 0 to ${DEPTH}.`);
    if(options.expandControl!==undefined&&typeof options.expandControl!=="boolean")throw new TypeError("61ade: Tree `expandControl` is true or false.");
    const preferences=options.id!==undefined?new UiPreferences(context.user,options.id):undefined;
    this.layout=new Layout(this.host,{type:"none",rows:[...(options.expandControl?[{id:"commands",height:48}]:[]),{id:"tree",css:"blade-tree-cell"}]});
    if(options.expandControl){
      // Two pinned icon buttons (the label is the tooltip and accessible name); they never collapse into a menu.
      const bar=this.bar=new CommandBar({label:view.title,items:[{id:"expand",label:t("Mindet kinyit"),icon:EXPAND_ICON,iconOnly:true,pinned:true},{id:"collapse",label:t("Mindet bezár"),icon:"dxi dxi-minus-box",iconOnly:true,pinned:true}]});
      bar.on("click",({id})=>void(id==="expand"?this.expandFromControl():this.collapseAll()));
      bar.mount(this.layout.getCell("commands"));
    }
    this.nodes=new NodeTree({view,parent:hierarchy.field,label:options.label},{
      select:id=>this.emit("select",{row:id===undefined?undefined:this.nodes.row(id)}),
      activate:id=>{const row=this.nodes.row(id);if(row)this.emit("activate",{row});},
      // The control's busy state: a spinning icon, and the name says it loads (the button keeps the focus; a click meanwhile does nothing).
      busy:busy=>this.bar?.update("expand",{label:t(busy?"Betöltés…":"Mindet kinyit"),icon:busy?"dxi dxi-loading dxi-spin":EXPAND_ICON}),
    },view.title,preferences,true);
    attachContent(this.layout.getCell("tree"),this.nodes.element,this.abort.signal);
    void this.nodes.start(initial,preferences?.tree()??{},depth);
    this.bind(options.signal);
  }
  selected():Row|undefined{return this.destroyed||this.nodes.selected===undefined?undefined:this.nodes.row(this.nodes.selected);}
  select(id:string):boolean{return !this.destroyed&&typeof id==="string"&&this.nodes.select(id);}
  async refresh(id?:string):Promise<void>{
    if(this.destroyed)return;
    const before=this.nodes.selected,row=JSON.stringify(this.selected()??null);
    await this.nodes.refresh(id);
    // A changed record of the same selected node is reported too (the host shows its data).
    if(!this.destroyed&&before!==undefined&&this.nodes.selected===before&&JSON.stringify(this.selected()??null)!==row)this.emit("select",{row:this.selected()});
  }
  expandAll():Promise<TreeExpansion>{return this.destroyed?Promise.resolve({complete:false,nodes:0,reason:"cancelled"}):this.nodes.expandAll();}
  collapseAll():Promise<void>{return this.destroyed?Promise.resolve():this.nodes.collapseAll();}
  /** The control's expand-all; a stop at a cap is a non-blocking notice (an error has had its dialog). */
  private async expandFromControl():Promise<void>{
    if(this.nodes.busy)return;
    const result=await this.nodes.expandAll();
    if(this.destroyed||result.complete||result.reason==="cancelled"||result.reason==="error")return;
    message({text:t("Nem nyílt ki minden elem: legfeljebb {nodes} elem, {depth} szint és elemenként {children} gyermek tölthető be.",{nodes:NODES,depth:DEPTH,children:CHILDREN}),css:"blade-toast blade-toast--warning",expire:8000});
  }
  protected dispose():void{this.abort.abort();this.nodes.destroy();this.bar?.destroy();this.layout.destructor();}
}

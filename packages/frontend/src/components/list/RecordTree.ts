import { Layout } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { TreeAdapter, type TreeNode } from "../../TreeAdapter";
import { UiPreferences } from "../../UiPreferences";
import { acknowledge } from "../../MessageDialog";
import { attachContent } from "../../api/services";
import { server } from "../../api/Server";
import { optionText } from "../../RecordPresentation";
import type { ListKindOptions, Row, Tree as TreeApi, TreeEvents, TreeOptions, ViewDefinition as PublicDefinition } from "../../api/types";
import type { Snapshot } from "../../Realtime";
import { Component } from "./component";
import { resolveListView } from "./definition";
import { errorText } from "./fields";
import type { ListContext } from "./ListView";

/** Most children one node loads (in pages of 200); further ones are left out. */
const CHILDREN=1000;
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
  constructor(private source:NodeSource,private hooks:{select(id:string|undefined):void;activate?(id:string):void},name:string,private preferences?:UiPreferences){
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
  /** Loads the roots, opens $remembered expanded nodes that load and selects the remembered node, else $initial. */
  async start(initial:Initial,remembered:{expanded:string[];selected?:string}):Promise<void>{
    this.restoring=true;
    let roots:Row[]|undefined;
    try{roots=await this.load("");if(roots)await this.reopen(remembered.expanded);}finally{this.restoring=false;}
    if(!roots)return;
    const wanted=remembered.selected!==undefined&&this.exists(remembered.selected)?remembered.selected
      :initial==="first"?(roots[0]?String(roots[0].id):undefined):typeof initial==="object"?initial.id:undefined;
    if(wanted===undefined||!this.select(wanted))this.save();
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
  async refresh(id?:string):Promise<void>{
    if(id!==undefined&&(!this.exists(id)||!this.loaded.has(id)))return;
    const opened=[...this.opened];
    this.restoring=true;
    try{
      if(!await this.load(id??""))return;
      if(id!==undefined&&this.opened.has(id))this.adapter.widget.expand(id);
      await this.reopen(opened);
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
  /** Loads the children of $parent ("" for the roots) into the tree; undefined after a failure (shown). */
  private async load(parent:string):Promise<Row[]|undefined>{
    const {view,label}=this.source,sortable=view.options.sortable?.includes(label);
    const generation=(this.loads.get(parent)??0)+1;this.loads.set(parent,generation);
    const rows:Row[]=[];let cursor:string|null=null;
    try{
      do{
        const data:Snapshot=await server.call(view.resource!,"list",{values:{mode:"dynamic",limit:200,scope:{field:this.source.parent,value:parent},...(sortable?{sort:{field:label,direction:"asc"}}:{}),...(cursor?{cursor}:{})},signal:this.abort.signal});
        rows.push(...data.items);cursor=data.next;
      }while(cursor&&rows.length<CHILDREN);
    }catch(error){
      if(!this.abort.signal.aborted)await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,[])});
      return undefined;
    }
    if(this.abort.signal.aborted||this.loads.get(parent)!==generation)return undefined;
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
  /** Opens the $ids that exist (parents first, as their levels load); ids that never appear are dropped. */
  private async reopen(ids:string[]):Promise<void>{
    let pending=ids.filter(id=>!id.endsWith(PENDING));
    for(let progress=true;progress&&pending.length&&!this.abort.signal.aborted;){
      progress=false;
      for(const id of [...pending]){
        if(!this.exists(id))continue;
        pending=pending.filter(other=>other!==id);progress=true;
        if(!this.loaded.has(id)&&!await this.load(id))continue;
        if(this.adapter.widget.data.haveItems(id))this.adapter.widget.expand(id);
      }
    }
  }
  private async expanded(id:string):Promise<void>{
    if(id.endsWith(PENDING))return;
    this.opened.add(id);this.save();
    if(!this.loaded.has(id))await this.load(id);
  }
  private collapsed(id:string):void{
    this.opened.delete(id);this.save();
    // The focus does not stay on a node the collapse hid.
    for(let node=this.focused;node!==undefined&&node!=="";node=this.parentOf(node))if(node===id&&this.focused!==id){this.focusOn(id);break;}
  }
  private choose(id:string|undefined):void{
    if(id!==undefined&&!this.exists(id))return;
    if(id!==undefined)this.focusOn(id);
    if(id===this.current){this.adapter.choose(id);this.annotate();return;}
    this.current=id;
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
  private save():void{
    if(this.restoring||!this.preferences)return;
    this.preferences.setTree({expanded:[...this.opened].filter(id=>this.exists(id)),...(this.current!==undefined?{selected:this.current}:{})});
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
export class RecordTree extends Component<TreeEvents> implements TreeApi{
  readonly layout:Layout;
  private nodes:NodeTree;
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
    const preferences=options.id!==undefined?new UiPreferences(context.user,options.id):undefined;
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"tree",css:"blade-tree-cell"}]});
    this.nodes=new NodeTree({view,parent:hierarchy.field,label:options.label},{
      select:id=>this.emit("select",{row:id===undefined?undefined:this.nodes.row(id)}),
      activate:id=>{const row=this.nodes.row(id);if(row)this.emit("activate",{row});},
    },view.title,preferences);
    attachContent(this.layout.getCell("tree"),this.nodes.element,this.abort.signal);
    void this.nodes.start(initial,preferences?.tree()??{expanded:[]});
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
  protected dispose():void{this.abort.abort();this.nodes.destroy();this.layout.destructor();}
}

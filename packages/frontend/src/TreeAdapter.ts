import { Tree, awaitRedraw } from "@dhtmlx/suite";
import { escape } from "./RecordPresentation";
import { motionTime, treeChildrenMotion, treeMotion } from "./Motion";
import "./tree.css";

/** `folder: false` makes a leaf; `icon` is its icon classes. */
export type TreeNode={id:string;parent:string;value:string;folder?:boolean;icon?:string};
/** Row presentation (docs/toolkit.md#tree-presentation): alternating row backgrounds and dotted lines with +/- boxes. */
export type TreeLook={striped?:boolean;lines?:boolean};

/**
 * Suite Standard Tree over a flat parent-linked list; user selection, double-click, expansion and collapse are its
 * events. With `element` the tree renders into that element and Suite's own key navigation is off (the owner handles
 * the keys, `RecordTree`); otherwise it is attached to a Layout cell and Suite navigates. Rows are as high as grid rows;
 * `striped` (default on) alternates their background in displayed order, `lines` (default on) draws the connectors.
 */
export class TreeAdapter {
  readonly widget:Tree;
  private quiet=false;
  /** Restripes and remarks after Suite rendered, added or removed rows (it keeps an attribute on a row it only patches). */
  private stripes?:MutationObserver;
  private observed?:HTMLElement;
  private striped:boolean;
  /** Folders easing open or closed (theme motion) and the timer that ends it: the stripes wait for them. */
  private moving=new Map<string,ReturnType<typeof setTimeout>>();
  constructor(select:(id:string)=>void,open?:(id:string)=>void,expand?:(id:string)=>void,options:{element?:HTMLElement;collapse?:(id:string)=>void}&TreeLook={}){
    const striped=this.striped=options.striped!==false,lines=options.lines!==false;
    const css=["blade-tree",striped?"blade-tree--striped":"",lines?"blade-tree--lines":""].filter(Boolean).join(" ");
    this.widget=new Tree((options.element??null) as unknown as HTMLElement,{selection:true,keyNavigation:!options.element,css,isFolder:(item:any)=>item.folder!==false,template:(item:any)=>escape(item.label)});
    this.widget.selection.events.on("afterSelect",(id:string|number)=>{if(!this.quiet)select(String(id));});
    if(open)this.widget.events.on("itemDblClick",(id:string|number)=>open(String(id)));
    if(expand)this.widget.events.on("afterExpand",(id:string|number)=>expand(String(id)));
    if(options.collapse)this.widget.events.on("afterCollapse",(id:string|number)=>options.collapse!(String(id)));
    // Theme motion (Motion.ts): an opening or closing folder eases to its new height.
    treeMotion(this.widget);
    if(striped||lines){
      const settle=(id:string|number)=>this.settle(String(id));
      this.widget.events.on("beforeExpand",settle);this.widget.events.on("beforeCollapse",settle);
      this.stripes=new MutationObserver(()=>this.stripe());
      // The root exists once Suite rendered (attached to a Layout cell, later); a data change finds it.
      const find=()=>void awaitRedraw().then(()=>{this.observe();this.stripe();});
      this.widget.data.events.on("change",find);
      find();
    }
  }
  private observe():void{
    const root=(this.widget as any).getRootNode?.() as HTMLElement|null|undefined;
    if(!root||root===this.observed||!this.stripes)return;
    this.stripes.disconnect();
    this.stripes.observe(this.observed=root,{childList:true,subtree:true});
  }
  /**
   * Folder $id starts to slide open or closed (theme motion): the rows keep their stripes while they move, and once
   * it has settled they restripe (a changed stripe crossfades with Suite's transition). Nothing without theme motion.
   */
  private settle(id:string):void{
    const time=motionTime();
    if(!time||!this.stripes)return;
    clearTimeout(this.moving.get(id));
    // The slide starts after Suite's redraw and ends `time` + 60 ms later.
    this.moving.set(id,setTimeout(()=>{this.moving.delete(id);this.stripe();},time+160));
  }
  /** Marks every second displayed row (`data-blade-alternate`), as the grid's `rowCss` does; not while a folder moves. */
  private stripe():void{
    const root=this.observed,data=this.widget.data;
    if(!this.striped||this.moving.size||!root?.isConnected)return;
    let index=0;
    for(const row of Array.from(root.querySelectorAll<HTMLElement>(".dhx_tree-folder, li.dhx_tree-list-item:not(.dhx_tree-list-item--parent)"))){
      // The copy of closed children sliding under their folder (Motion.ts) keeps its stripes.
      if(row.closest(".blade-tree-ghost"))continue;
      // A row under a closed folder (still in the DOM while it closes) is not displayed.
      let shown=true;
      for(let item=row.closest<HTMLElement>("li[data-dhx-id]")?.parentElement?.closest<HTMLElement>("li[data-dhx-id]");item&&root.contains(item);item=item.parentElement?.closest<HTMLElement>("li[data-dhx-id]"))
        if(!(data.getItem(item.dataset.dhxId!) as any)?.opened){shown=false;break;}
      const alternate=shown&&index++%2===1;
      if(row.hasAttribute("data-blade-alternate")!==alternate)row.toggleAttribute("data-blade-alternate",alternate);
    }
  }
  /** Selects $id (or clears the selection) without reporting a user choice. */
  choose(id:string|undefined):void{
    this.quiet=true;
    try{if(id===undefined)this.widget.selection.remove();else if(this.widget.data.exists(id))this.widget.selection.add(id);}finally{this.quiet=false;}
  }
  private static items(nodes:TreeNode[],root:string):object[]{
    const children=new Map<string,TreeNode[]>();
    for(const node of nodes)children.set(node.parent,[...(children.get(node.parent)??[]),node]);
    const build=(parent:string):object[]=>(children.get(parent)??[]).map(node=>({id:node.id,value:node.value,label:node.value,...(node.folder===false?{folder:false,icon:{file:node.icon}}:{items:build(node.id)})}));
    return build(root);
  }
  /** Replaces all nodes; `root` is the parent value of top-level nodes. Values are rendered as text. */
  setItems(nodes:TreeNode[],root:string):void{
    this.quiet=true;
    try{this.widget.data.removeAll();this.widget.data.parse(TreeAdapter.items(nodes,root) as any);}finally{this.quiet=false;}
  }
  /**
   * Replaces the children of the node $parent with $nodes (their `parent` is $parent or a node among them), for
   * children loaded on expansion; every other node, the expansion and the selection stay.
   */
  setChildren(parent:string,nodes:TreeNode[]):void{
    const data=this.widget.data;
    if(!data.exists(parent))return;
    // Children loaded into an open folder slide out to their new height (theme motion).
    const play=(data.getItem(parent) as any)?.opened?treeChildrenMotion(this.widget,parent):undefined;
    if(play)this.settle(parent);
    this.quiet=true;
    try{
      for(const child of [...data.getItems(parent)])data.remove((child as any).id);
      const items=TreeAdapter.items(nodes,parent);
      if(items.length)data.add(items as any,-1,parent);
    }finally{this.quiet=false;play?.();}
  }
  /** The parent id of $id ("" for a top-level node, undefined for an unknown one). */
  parentOf(id:string):string|undefined{
    const data=this.widget.data;
    if(!data.exists(id))return undefined;
    const parent=data.getParent(id);
    return parent===undefined||parent===null||!data.exists(parent)?"":String(parent);
  }
  /** Expands the ancestors (and with `open` the node) and selects it without reporting a user choice. */
  reveal(id:string,open=false):void{
    const data=this.widget.data;
    if(!data.exists(id))return;
    if(open&&data.haveItems(id))this.widget.expand(id);
    for(let parent=data.getParent(id);parent!==undefined&&parent!==null&&data.exists(parent);parent=data.getParent(parent))this.widget.expand(parent);
    this.quiet=true;
    try{this.widget.selection.add(id);}finally{this.quiet=false;}
  }
  /** After a redraw Suite still has scheduled: destroyed first, that redraw would read the cleared config. */
  destroy():void{this.quiet=true;this.stripes?.disconnect();this.stripes=undefined;for(const timer of this.moving.values())clearTimeout(timer);this.moving.clear();void awaitRedraw().then(()=>this.widget.destructor());}
}

import { Tree, awaitRedraw } from "@dhtmlx/suite";
import { escape } from "./RecordPresentation";

/** `folder: false` makes a leaf; `icon` is its Suite icon class. */
export type TreeNode={id:string;parent:string;value:string;folder?:boolean;icon?:string};

/** Suite Standard Tree over a flat parent-linked list; user selection, double-click and expansion are its events. */
export class TreeAdapter {
  readonly widget:Tree;
  private quiet=false;
  constructor(select:(id:string)=>void,open?:(id:string)=>void,expand?:(id:string)=>void){
    this.widget=new Tree(null as unknown as HTMLElement,{selection:true,keyNavigation:true,css:"blade-tree",isFolder:(item:any)=>item.folder!==false,template:(item:any)=>escape(item.label)});
    this.widget.selection.events.on("afterSelect",(id:string|number)=>{if(!this.quiet)select(String(id));});
    if(open)this.widget.events.on("itemDblClick",(id:string|number)=>open(String(id)));
    if(expand)this.widget.events.on("afterExpand",(id:string|number)=>expand(String(id)));
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
    this.quiet=true;
    try{
      for(const child of [...data.getItems(parent)])data.remove((child as any).id);
      const items=TreeAdapter.items(nodes,parent);
      if(items.length)data.add(items as any,-1,parent);
    }finally{this.quiet=false;}
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
  destroy():void{this.quiet=true;void awaitRedraw().then(()=>this.widget.destructor());}
}

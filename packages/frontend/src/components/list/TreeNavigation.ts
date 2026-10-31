import { Layout, Toolbar } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { TreeAdapter, type TreeNode } from "../../TreeAdapter";
import { UiPreferences } from "../../UiPreferences";
import { acknowledge, noticeMarkup } from "../../MessageDialog";
import { attachContent, openWindow } from "../../api/services";
import { server } from "../../api/Server";
import { optionText } from "../../RecordPresentation";
import type { ListKindOptions, TreeMetadata, ViewDefinition as PublicDefinition } from "../../api/types";
import type { ActionDefinition } from "./types";
import type { Row, Snapshot } from "../../Realtime";
import { confirmed, resultNotice } from "./actions";
import { actionIcon, errorText, escape, technical } from "./fields";
import { RecordForm } from "./RecordForm";
import type { ListContext } from "./ListView";

/** Most children one node loads (in pages of 200); further ones are left out. */
const CHILDREN=1000;
/** Child of a node whose children are not loaded yet: it gives the node its expand toggle. */
const PENDING="\u0000pending";

/**
 * Tree navigation of a list view (`Registry::tree`, docs/workspaces.md#tree-navigation): a resizable tree panel of the
 * node view's records beside the list, which is scoped to the selected node (`list` creates it for a node id). Roots
 * are the records with an empty parent field; a node's children load, through the node resource's ordinary `list`,
 * when it is first expanded. The panel's toolbar runs the node view's actions on the selected node; a new node goes
 * under it. The tree is not live: it reloads the affected level after its own actions.
 */
export class TreeNavigation {
  readonly layout:Layout;
  private nodes:Layout;
  private tree:TreeAdapter;
  private toolbar:Toolbar;
  private rows=new Map<string,Row>();
  private loaded=new Set<string>();
  private selected?:string;
  /** The element the list panel shows; the scoped list renders into its own element inside it. */
  private slot=document.createElement("div");
  private content?:{layout:Layout;destroy():void};
  private abort=new AbortController();
  private preferences:UiPreferences;
  private readonly view:PublicDefinition<ListKindOptions>;
  constructor(host:HTMLElement,private context:ListContext,private config:TreeMetadata,private title:string,listId:string,private list:(node:string)=>{element:HTMLElement;layout:Layout;destroy():void}){
    this.view=config.view;
    this.preferences=new UiPreferences(context.user,listId+"@tree");
    const tree={cols:[{id:"tree",header:escape(this.view.title),width:300,minWidth:180,resizable:true,collapsable:true},{id:"list",header:escape(title)}]};
    this.layout=new Layout(host,{type:"space",...this.preferences.layoutTree(tree)} as any);
    this.preferences.bindLayout(this.layout,tree);
    this.nodes=new Layout(document.createElement("div"),{type:"none",rows:[{id:"commands",height:48,css:"blade-command-row"},{id:"nodes",css:"blade-tree-cell"}]});
    this.toolbar=new Toolbar(undefined,{data:this.actions().map(action=>({id:action.name,value:escape(action.label),icon:actionIcon(action)}))});
    this.toolbar.events.on("click",(id:string|number)=>{const action=this.actions().find(action=>action.name===String(id));if(action)void this.run(action);});
    this.tree=new TreeAdapter(id=>this.select(id),undefined,id=>void this.expand(id));
    this.nodes.getCell("commands").attach(this.toolbar);
    this.nodes.getCell("nodes").attach(this.tree.widget);
    this.layout.getCell("tree").attach(this.nodes);
    this.slot.className="blade-tree-list";
    attachContent(this.layout.getCell("list"),this.slot,this.abort.signal);
    this.show();
    this.commands();
    void this.load("").then(roots=>{const first=roots?.[0];if(first&&this.selected===undefined){this.tree.reveal(String(first.id));this.select(String(first.id));}});
  }
  /** The node view's actions the panel offers (`get` and upload actions stay in the node list). */
  private actions():ActionDefinition[]{return (this.view.actions as unknown as ActionDefinition[]).filter(action=>action.name!=="get"&&!action.upload);}
  private label(row:Row):string{
    const column=this.view.options.columns.find(column=>column.id===this.config.label);
    return optionText(column??{},row[this.config.label])||String(row.id);
  }
  private node(row:Row,parent:string):TreeNode[]{
    const id=String(row.id),count=row._subview;
    // Unknown (`_subview` left out) or positive: the node gets its toggle; its children load on expansion.
    return [{id,parent,value:this.label(row)},...(count===undefined||Number(count)>0?[{id:id+PENDING,parent:id,value:t("Betöltés…"),folder:false}]:[])];
  }
  /** Loads the children of $parent ("" for the roots) into the tree; undefined after a failure (shown). */
  private async load(parent:string):Promise<Row[]|undefined>{
    const sortable=this.view.options.sortable?.includes(this.config.label);
    const rows:Row[]=[];let cursor:string|null=null;
    try{
      do{
        const data:Snapshot=await server.call(this.view.resource!,"list",{values:{mode:"dynamic",limit:200,filters:{[this.config.parent]:parent},...(sortable?{sort:{field:this.config.label,direction:"asc"}}:{}),...(cursor?{cursor}:{})},signal:this.abort.signal});
        rows.push(...data.items);cursor=data.next;
      }while(cursor&&rows.length<CHILDREN);
    }catch(error){
      if(!this.abort.signal.aborted)await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,[])});
      return undefined;
    }
    if(this.abort.signal.aborted)return undefined;
    for(const row of rows)this.rows.set(String(row.id),row);
    const nodes=rows.slice(0,CHILDREN).flatMap(row=>this.node(row,parent));
    if(parent==="")this.tree.setItems(nodes,"");else this.tree.setChildren(parent,nodes);
    this.loaded.add(parent);
    if(this.selected!==undefined&&this.tree.widget.data.exists(this.selected))this.tree.reveal(this.selected);
    return rows;
  }
  private async expand(id:string):Promise<void>{if(!this.loaded.has(id)&&!id.endsWith(PENDING))await this.load(id);}
  private select(id:string):void{
    if(id.endsWith(PENDING)||id===this.selected)return;
    this.selected=id;this.show();this.commands();
  }
  /** The list panel's content: a notice without a selection, otherwise the list scoped to the node (a fresh one). */
  private show():void{
    const node=this.selected;
    this.heading();
    this.content?.destroy();this.content=undefined;
    this.slot.replaceChildren();
    if(node===undefined){this.slot.innerHTML=noticeMarkup({title:this.title,message:t("Válassz egy elemet a fában.")});}
    else try{const created=this.content=this.list(node);this.slot.append(created.element);created.layout.paint();}
    catch(error){console.error(error);this.slot.innerHTML=noticeMarkup({title:this.title,message:errorText(error,[]),severity:"danger"});}
    this.layout.paint();
  }
  /** The list panel's header: the list title and the selected node's name. */
  private heading():void{
    const node=this.selected;
    this.layout.getCell("list").config.header=escape(node!==undefined&&this.rows.has(node)?`${this.title} — ${this.label(this.rows.get(node)!)}`:this.title);
  }
  private commands():void{
    const row=this.selected!==undefined?this.rows.get(this.selected):undefined;
    for(const action of this.actions()){
      const allowed=action.name==="create"||(row!==undefined&&(!Array.isArray(row._actions)||(row._actions as string[]).includes(action.name)));
      if(allowed)this.toolbar.enable(action.name);else this.toolbar.disable(action.name);
    }
  }
  /** Reloads the level of $parent and expands it (a node action's result shows); the roots reload into a fresh tree. */
  private async reload(parent:string):Promise<void>{
    if(parent!==""&&!this.tree.widget.data.exists(parent))return;
    this.loaded.delete(parent);
    await this.load(parent);
    if(parent!=="")this.tree.widget.expand(parent);
  }
  private async run(action:ActionDefinition):Promise<void>{
    const node=this.selected,row=node!==undefined?this.rows.get(node):undefined;
    if(action.name!=="create"&&!row)return;
    const parent=action.name==="create"?node??"":this.tree.parentOf(node!)??"";
    const fields=action.fields.filter(field=>!technical(field));
    if(action.name!=="create"&&action.name!=="update"&&!fields.length){
      try{
        if(!await confirmed(action))return;
        const result=await server.call(this.view.resource!,action.name,{id:node!,values:action.fields.some(field=>field.name==="revision")?{revision:row!.revision}:{}});
        resultNotice(result);
        if(action.name==="delete"){this.rows.delete(node!);this.selected=parent||undefined;this.show();}
        await this.reload(parent);this.commands();
      }catch(error){await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,action.fields)});}
      return;
    }
    const win=openWindow({title:`${this.view.title} — ${action.label}`,width:560,height:650,signal:this.abort.signal});
    const form=new RecordForm(this.context,{resource:this.view.resource!,action:action.name,id:action.name==="create"?null:node!,values:action.name==="create"?{[this.config.parent]:parent}:{},signal:win.signal});
    form.on("cancelled",()=>win.close());
    form.on("saved",({result})=>{
      win.close();
      const saved=result&&typeof result==="object"?result as Row:undefined;
      const created=action.name==="create"&&saved?.id!==undefined?String(saved.id):undefined;
      // A changed parent (a move) reloads the new level as well.
      const moved=action.name!=="create"&&saved&&Object.hasOwn(saved,this.config.parent)?String(saved[this.config.parent]??""):parent;
      void this.reload(parent).then(()=>moved!==parent?this.reload(moved):undefined).then(()=>{
        if(created&&this.tree.widget.data.exists(created)){this.tree.reveal(created);this.select(created);}
        else if(node!==undefined&&this.tree.widget.data.exists(node))this.tree.reveal(node);
        this.heading();this.layout.paint();this.commands();
      });
    });
    form.mount(win);
  }
  destroy():void{
    this.abort.abort();
    this.content?.destroy();
    this.tree.destroy();this.toolbar.destructor();this.nodes.destructor();this.layout.destructor();
  }
}

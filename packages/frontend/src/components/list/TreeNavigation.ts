import { Layout } from "@dhtmlx/suite";
import { ResponsiveToolbar } from "../../ResponsiveToolbar";
import { t } from "../../I18n";
import { UiPreferences } from "../../UiPreferences";
import { collapseMotion } from "../../Motion";
import { acknowledge, noticeMarkup } from "../../MessageDialog";
import { attachContent, openWindow } from "../../api/services";
import { server } from "../../api/Server";
import type { ListKindOptions, TreeMetadata, ViewDefinition as PublicDefinition } from "../../api/types";
import type { ActionDefinition } from "./types";
import type { Row } from "../../Realtime";
import { confirmed, resultNotice } from "./actions";
import { actionIcon, errorText, escape, formWindowWidth, technical } from "./fields";
import { RecordForm } from "./RecordForm";
import { NodeTree } from "./RecordTree";
import type { ListContext } from "./ListView";

/**
 * Tree navigation of a list view (`Registry::tree`, docs/workspaces.md#tree-navigation): a resizable tree panel of the
 * node view's records (`NodeTree`, the engine of `app.components.Tree`) beside the list, which is scoped to the
 * selected node (`list` creates it for a node id). The panel's toolbar runs the node view's actions on the selected
 * node; a new node goes under it. The tree is not live: it reloads the affected level after its own actions.
 */
export class TreeNavigation {
  readonly layout:Layout;
  private nodes:Layout;
  private tree:NodeTree;
  private toolbar:ResponsiveToolbar;
  /** The element the list panel shows; the scoped list renders into its own element inside it. */
  private slot=document.createElement("div");
  private content?:{layout:Layout;destroy():void};
  private abort=new AbortController();
  private preferences:UiPreferences;
  private readonly view:PublicDefinition<ListKindOptions>;
  constructor(host:HTMLElement,private context:ListContext,private config:TreeMetadata,private title:string,listId:string,private list:(node:string)=>{element:HTMLElement;layout:Layout;destroy():void}){
    this.view=config.view;
    this.preferences=new UiPreferences(context.user,listId+"@tree");
    const tree={cols:[{id:"tree",header:this.view.title,width:300,minWidth:180,resizable:true,collapsable:true},{id:"list",header:title}]};
    this.layout=new Layout(host,{type:"space",...this.preferences.layoutTree(tree)} as any);
    this.preferences.bindLayout(this.layout,tree);
    collapseMotion(this.layout);
    this.nodes=new Layout(document.createElement("div"),{type:"none",rows:[{id:"commands",height:48,css:"blade-command-row"},{id:"nodes",css:"blade-tree-cell"}]});
    // The list's command bar: the actions collapse into `Műveletek` when the panel is narrow.
    this.toolbar=new ResponsiveToolbar(undefined,{data:this.actions().map(action=>({id:action.name,value:escape(action.label),icon:actionIcon(action)}))});
    this.toolbar.events.on("click",(id:string|number)=>{const action=this.actions().find(action=>action.name===String(id));if(action)void this.run(action);});
    this.tree=new NodeTree({view:this.view,parent:config.parent,label:config.label},{select:()=>{this.show();this.commands();}},this.view.title,undefined,false,{striped:config.striped,lines:config.lines});
    this.nodes.getCell("commands").attach(this.toolbar);
    attachContent(this.nodes.getCell("nodes"),this.tree.element,this.abort.signal);
    this.layout.getCell("tree").attach(this.nodes);
    this.slot.className="blade-tree-list";
    attachContent(this.layout.getCell("list"),this.slot,this.abort.signal);
    this.show();
    this.commands();
    void this.tree.start("first",{expanded:[]});
  }
  /** The node view's actions the panel offers (`get` and upload actions stay in the node list). */
  private actions():ActionDefinition[]{return (this.view.actions as unknown as ActionDefinition[]).filter(action=>action.name!=="get"&&!action.upload);}
  private get selected():string|undefined{return this.tree.selected;}
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
    const node=this.selected,row=node!==undefined?this.tree.row(node):undefined;
    this.layout.getCell("list").config.header=row?`${this.title} — ${this.tree.label(row)}`:this.title;
  }
  private commands():void{
    const row=this.selected!==undefined?this.tree.row(this.selected):undefined;
    for(const action of this.actions()){
      const allowed=action.name==="create"||(row!==undefined&&(!Array.isArray(row._actions)||(row._actions as string[]).includes(action.name)));
      if(allowed)this.toolbar.enable(action.name);else this.toolbar.disable(action.name);
    }
  }
  private async run(action:ActionDefinition):Promise<void>{
    const node=this.selected,row=node!==undefined?this.tree.row(node):undefined;
    if(action.name!=="create"&&!row)return;
    const parent=action.name==="create"?node??"":this.tree.parentOf(node!)??"";
    const fields=action.fields.filter(field=>!technical(field));
    if(action.name!=="create"&&action.name!=="update"&&!fields.length){
      try{
        if(!await confirmed(action))return;
        const result=await server.call(this.view.resource!,action.name,{id:node!,values:action.fields.some(field=>field.name==="revision")?{revision:row!.revision}:{}});
        resultNotice(result);
        await this.tree.reload(parent);
        if(action.name==="delete"){if(parent)this.tree.select(parent);else this.tree.clear();}
        this.heading();this.layout.paint();this.commands();
      }catch(error){await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,action.fields)});}
      return;
    }
    const win=openWindow({title:`${this.view.title} — ${action.label}`,width:formWindowWidth(action.fields),height:650,signal:this.abort.signal});
    const form=new RecordForm(this.context,{resource:this.view.resource!,action:action.name,id:action.name==="create"?null:node!,values:action.name==="create"?{[this.config.parent]:parent}:{},signal:win.signal});
    form.on("cancelled",()=>win.close());
    form.on("saved",({result})=>{
      win.close();
      const saved=result&&typeof result==="object"?result as Row:undefined;
      const created=action.name==="create"&&saved?.id!==undefined?String(saved.id):undefined;
      // A changed parent (a move) reloads the new level as well.
      const moved=action.name!=="create"&&saved&&Object.hasOwn(saved,this.config.parent)?String(saved[this.config.parent]??""):parent;
      void this.tree.reload(parent).then(()=>moved!==parent?this.tree.reload(moved):undefined).then(()=>{
        if(created)this.tree.select(created);
        else if(node!==undefined&&this.tree.exists(node))this.tree.select(node);
        this.heading();this.layout.paint();this.commands();
      });
    });
    form.mount(win);
  }
  destroy():void{
    this.abort.abort();
    this.content?.destroy();
    this.tree.destroy();this.toolbar.disposeResponsive();this.toolbar.destructor();this.nodes.destructor();this.layout.destructor();
  }
}

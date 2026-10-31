import type { Layout } from "@dhtmlx/suite";
import type { Application, ListView as ListViewApi, ListViewEvents, ListViewOptions, Row } from "../../api/types";
import type { LiveChannel } from "../../Realtime";
import { Component } from "./component";
import { listDefinition, resolveListView } from "./definition";
import { Workspace } from "./Workspace";
import { TreeNavigation } from "./TreeNavigation";

/** What the list components need beyond their options: the tab's live channel, the preference user and the app. */
export type ListContext={channel:()=>LiveChannel;user:string;app:()=>Application};

/**
 * The framework list as a public component (`app.components.ListView`, docs/toolkit.md#listview): grid, cards and
 * tiles, filters, search, action forms, sub-views, live updates and per-user preferences of one list view. The
 * built-in `list` kind mounts it in the shell's view host. A view with tree navigation (`options.tree`, unscoped) shows
 * the node tree beside the list, which is then scoped to the selected node (`TreeNavigation`).
 */
export class ListView extends Component<ListViewEvents> implements ListViewApi{
  readonly layout:Layout;
  private workspace?:Workspace;
  private navigation?:TreeNavigation;
  constructor(context:ListContext,options:ListViewOptions){
    super(options);
    if(options.compact&&!options.scope)throw new TypeError("61ade: a compact ListView needs a scope.");
    const app=context.app(),view=listDefinition(resolveListView(app,options.view));
    const scope=options.scope?{field:String(options.scope.field),id:String(options.scope.id),...(options.scope.select===false?{select:false}:{}),...(options.compact?{compact:{height:(pixels:number)=>options.compact!.height(pixels)}}:{})}:undefined;
    const hooks={emit:<K extends keyof ListViewEvents>(event:K,payload:ListViewEvents[K])=>this.emit(event,payload),app,view:resolveListView(app,options.view),...(options.dragSource?{dragSource:true}:{}),...(options.panel===false?{panel:false}:{}),...(options.showId===false?{showId:false}:{}),...(options.mode?{mode:options.mode}:{})};
    const tree=scope?undefined:view.tree;
    if(tree){
      this.navigation=new TreeNavigation(this.host,context,tree as any,view.title,view.id,node=>{
        const element=document.createElement("div");element.style.height="100%";element.style.width="100%";
        const list=this.workspace=new Workspace(element,view,context.channel(),context.user,{field:tree.field,id:node},{...options.filters},hooks);
        return {element,layout:list.layout,destroy:()=>{list.destroy();if(this.workspace===list)this.workspace=undefined;}};
      });
      this.layout=this.navigation.layout;
    }else{
      this.workspace=new Workspace(this.host,view,context.channel(),context.user,scope,{...options.filters},hooks);
      this.layout=this.workspace.layout;
    }
    this.bind(options.signal);
  }
  /** Unsaved input in a form, card or cell editor of this list or its sub-views. */
  editing():boolean{return !this.destroyed&&!!this.workspace?.editing();}
  refresh():void{if(!this.destroyed)this.workspace?.refresh();}
  selected():Row|undefined{return this.destroyed?undefined:this.workspace?.selectedRow();}
  setFilters(filters:Record<string,string>):void{if(!this.destroyed)this.workspace?.setFilters(filters);}
  protected dispose():void{if(this.navigation)this.navigation.destroy();else this.workspace?.destroy();}
}

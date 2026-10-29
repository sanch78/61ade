import type { Layout } from "@dhtmlx/suite";
import type { Application, ListView as ListViewApi, ListViewEvents, ListViewOptions, Row } from "../../api/types";
import type { LiveChannel } from "../../Realtime";
import { Component } from "./component";
import { listDefinition, resolveListView } from "./definition";
import { Workspace } from "./Workspace";

/** What the list components need beyond their options: the tab's live channel, the preference user and the app. */
export type ListContext={channel:()=>LiveChannel;user:string;app:()=>Application};

/**
 * The framework list as a public component (`app.components.ListView`, docs/toolkit.md#listview): grid, cards and
 * tiles, filters, search, action forms, sub-views, live updates and per-user preferences of one list view. The
 * built-in `list` kind mounts it in the shell's view host.
 */
export class ListView extends Component<ListViewEvents> implements ListViewApi{
  readonly layout:Layout;
  private list:Workspace;
  constructor(context:ListContext,options:ListViewOptions){
    super();
    if(options.compact&&!options.scope)throw new TypeError("61ade: a compact ListView needs a scope.");
    const app=context.app(),view=listDefinition(resolveListView(app,options.view));
    const scope=options.scope?{field:String(options.scope.field),id:String(options.scope.id),...(options.scope.select===false?{select:false}:{}),...(options.compact?{compact:{height:(pixels:number)=>options.compact!.height(pixels)}}:{})}:undefined;
    this.list=new Workspace(this.host,view,context.channel(),context.user,scope,{...options.filters},
      {emit:(event,payload)=>this.emit(event,payload),app,view:resolveListView(app,options.view)});
    this.layout=this.list.layout;
    this.bind(options.signal);
  }
  /** Unsaved input in a form, card or cell editor of this list or its sub-views. */
  editing():boolean{return !this.destroyed&&this.list.editing();}
  refresh():void{if(!this.destroyed)this.list.refresh();}
  selected():Row|undefined{return this.destroyed?undefined:this.list.selectedRow();}
  setFilters(filters:Record<string,string>):void{if(!this.destroyed)this.list.setFilters(filters);}
  protected dispose():void{this.list.destroy();}
}

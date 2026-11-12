import type { Layout } from "@dhtmlx/suite";
import type { Application, ListView as ListViewApi, ListViewEvents, ListViewOptions, Row } from "../../api/types";
import type { LiveChannel } from "../../Realtime";
import { Component } from "./component";
import { listDefinition, resolveListView } from "./definition";
import { Workspace } from "./Workspace";
import { TreeNavigation } from "./TreeNavigation";
import { isImage, isMedia } from "../../RecordPresentation";

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
    const defaults=options.createDefaults,key=options.preferencesKey;
    if(defaults!==undefined&&(defaults===null||typeof defaults!=="object"||Array.isArray(defaults)||Object.entries(defaults).some(([name,value])=>!/^[a-z][a-z0-9_]*$/.test(name)||typeof value!=="string")))
      throw new TypeError("61ade: ListView option `createDefaults` maps field names to string values.");
    if(key!==undefined&&(typeof key!=="string"||!/^[a-z][a-z0-9_.-]{0,79}$/.test(key)))throw new TypeError("61ade: ListView option `preferencesKey` must match [a-z][a-z0-9_.-]* (at most 80 characters).");
    const empty=options.emptyText;
    if(empty!==undefined&&(typeof empty!=="string"||!empty.trim()||empty.length>200))throw new TypeError("61ade: ListView option `emptyText` is plain text of 1 to 200 characters.");
    const app=context.app(),view=listDefinition(resolveListView(app,options.view));
    const modes=options.modes,offered=view.tiles??view.columns.some(column=>isMedia(column)||isImage(column));
    if(modes!==undefined&&(!Array.isArray(modes)||!modes.length||new Set(modes).size!==modes.length||modes.some(mode=>mode!=="table"&&mode!=="cards"&&mode!=="tiles"||mode==="tiles"&&!offered)))
      throw new TypeError("61ade: ListView option `modes` lists distinct presentations of table, cards and tiles (tiles only where the view offers them).");
    if(options.mode!==undefined&&(modes??view.modes)&&!(modes??view.modes)!.includes(options.mode))throw new TypeError("61ade: ListView option `mode` must be one of the list's `modes`.");
    if(options.cardColumns!==undefined&&(!Number.isInteger(options.cardColumns)||options.cardColumns<1||options.cardColumns>6))throw new TypeError("61ade: ListView option `cardColumns` is an integer from 1 to 6.");
    const scope=options.scope?{field:String(options.scope.field),id:String(options.scope.id),...(options.scope.select===false?{select:false}:{}),...(options.compact?{compact:{height:(pixels:number)=>options.compact!.height(pixels)}}:{})}:undefined;
    const hooks={emit:<K extends keyof ListViewEvents>(event:K,payload:ListViewEvents[K])=>this.emit(event,payload),app,view:resolveListView(app,options.view),...(options.dragSource?{dragSource:true}:{}),...(options.panel===false?{panel:false}:{}),...(options.showId===false?{showId:false}:{}),...(options.mode?{mode:options.mode}:{}),...(modes?{modes:Object.freeze([...modes])}:{}),...(options.cardColumns?{cardColumns:options.cardColumns}:{}),...(defaults?{createDefaults:Object.freeze({...defaults})}:{}),...(key?{preferencesKey:key}:{}),...(empty!==undefined?{emptyText:empty}:{})};
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
  target(){return this.destroyed?undefined:this.workspace?.target();}
  setFilters(filters:Record<string,string>):void{if(!this.destroyed)this.workspace?.setFilters(filters);}
  protected dispose():void{if(this.navigation)this.navigation.destroy();else this.workspace?.destroy();}
}

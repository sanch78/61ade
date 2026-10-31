import { locale, t } from "../../I18n";
import { ResponsiveToolbar } from "../../ResponsiveToolbar";
import { fitWindow } from "../../WindowSizing";
import { widgetIcons } from "../../WidgetIcons";
import { UiPreferences } from "../../UiPreferences";
import { Form, Layout, Window, message, awaitRedraw } from "@dhtmlx/suite";
import { acknowledge } from "../../MessageDialog";
import { Realtime, type LiveChannel, type Row, type Snapshot } from "../../Realtime";
import { GridHeaders, type Sort } from "../../GridHeaders";
import { GridEditing, alias, unalias } from "../../GridEditing";
import { isMedia, isImage, derivedOf } from "../../RecordPresentation";
import { FileFields } from "../../FilePicker";
import { ResponsiveGrid, previewRows, hasSubview } from "../../ResponsiveGrid";
import { FormValidation } from "../../FormValidation";
import { server } from "../../api/Server";
import type { Application, ListViewEvents } from "../../api/types";
import { commandEnabled, commandId, extensions, fieldTypeOf, resolveCommands, type ListCommand } from "../../app/registries";
import { LIST, builtinCommands, type ListCommandContext } from "./commands";
import { bindFieldTypes, errorText, escape, formActions, input } from "./fields";
import { declaredTarget, resolveActivation, type ResolvedActivation } from "./activation";
import { listCommands } from "./toolbar";
import { ListFilters } from "./filters";
import { ListSearch } from "./search";
import { DetailsWindow } from "./details";
import { ListActions, type ActionHost } from "./actions";
import type { FieldDefinition, Region, ViewDefinition, WorkspaceHooks, WorkspaceScope } from "./types";

const cursor=(row:Row,direction:string)=>btoa(Array.from(new TextEncoder().encode(JSON.stringify({...row._position,edge:String(row.id),direction})),byte=>String.fromCharCode(byte)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");

/**
 * The framework list (the built-in `list` kind, the public `ListView` and every nested sub-view): configured
 * filter/form/grid regions, bounded dynamic data and live observation. Its parts live beside it in
 * src/components/list: command bar items (toolbar.ts), filters, search, action forms (actions.ts), details,
 * activation and form items (fields.ts). Internal: the public contract is `ListView` (docs/toolkit.md).
 */
export class Workspace implements ActionHost {
  private releaseIcons=widgetIcons();
  readonly layout:Layout;
  grid?:ResponsiveGrid;
  private gridEditing?:GridEditing;
  private gridHeaders?:GridHeaders;
  private sort:Sort={field:"id",direction:"desc"};
  private cellEditing=false;
  private cardEditor?:Window;
  private cardSave?:Promise<void>;
  private commands:ResponsiveToolbar;
  private content?:Layout;
  rows:Row[]=[];
  selected?:string;
  private previous:string|null=null;
  private next:string|null=null;
  private filters:Record<string,string>={};
  private search?:ListSearch;
  busy=false;
  private rendering=false;
  disposed=false;
  private epoch=0;
  private abort?:AbortController;
  detail?:Form;
  private details:DetailsWindow;
  private actions:ListActions;
  private detailDirty=false;
  private detailConflictShown=false;
  private live:Realtime;
  private filterPanel?:ListFilters;
  private preferences:UiPreferences;
  private visibleColumns=new Set<string>();
  /** `file` fields of the singleton detail form. */
  private detailFiles?:FileFields;
  /** Last counts of the server (the `changed` event). */
  private counted:{total?:number;matched?:number}={};
  readonly resourceCall=(resource:string,action:string,id:string|null,values:Record<string,unknown>={})=>this.request(resource,action,id,values);
  /** The selected sub-view preview whose cursor record holds the toolbar (its actions and commands of the same name). */
  private delegated?:Workspace;
  /** Open compact previews by record id (refreshed when that record's full child view closes). */
  private previews=new Map<string,Workspace>();
  /** Open full sub-view windows. */
  private windows=new Map<Workspace,Window>();
  /** Client commands (`app.commands`) of the command bar, whatever their placement. */
  private clientCommands:ListCommand[]=[];
  /** Aborted when the list closes (`CommandContext.signal`). */
  private closed=new AbortController();
  /** Releases the field types of the singleton detail form. */
  private detailTypes?:()=>void;

  /**
   * $preset: filters the view opens with (a navigation, `activate: 'page'`) instead of the saved ones; declared filters
   * only, removable like any other. A menu page keeps its filter values across reloads (UiPreferences).
   * $hooks: the public `ListView` events (top-level list only) and the application for `view:<id>` activation.
   */
  constructor(host:HTMLElement,readonly view:ViewDefinition,private channel:LiveChannel,private user="",readonly scope?:WorkspaceScope,preset:Record<string,string>={},private hooks:WorkspaceHooks={}){
    // A nested view: the scope field is implied (no column, filter or input), one grid region, overlay forms.
    if(scope)view=this.view={...view,columns:view.columns.filter(column=>column.id!==scope.field),filters:view.filters.filter(filter=>filter.name!==scope.field),sortable:(view.sortable??[]).filter(field=>field!==scope.field),layout:{formMode:"overlay",tree:{rows:[{id:"grid"}]}}};
    // In a host's panel (`panel: false`): no panel of its own; the toolbar and the data fill the host's region, the
    // declared filter panel becomes the `Szűrés` dialog and forms open as windows.
    const hosted=!scope&&hooks.panel===false&&!view.singleton;
    if(hosted)view=this.view={...view,layout:{formMode:"overlay",tree:{rows:[{id:"grid"}]}}};
    // A manual order sorts by its position only: no header or card sorting.
    if(view.order)view=this.view={...view,sortable:[]};
    if(scope?.compact)view=this.view={...view,filters:[],search:undefined,rowNumbers:false,selection:false,rowSelection:false,tiles:false,columns:view.columns.map(column=>({...column,secondary:false}))};
    this.preferences=new UiPreferences(user,scope?view.id+"@"+scope.field:view.id);
    this.sort=view.order?{field:view.order.field,direction:"asc"}:this.preferences.sort(view.sortable??[])??this.sort;
    this.details=new DetailsWindow(view,id=>this.call("get",id),()=>this.disposed,error=>this.error(error));
    this.actions=new ListActions(this);
    const secondaryColumns=view.columns.filter(column=>column.secondary);
    const tiles=view.tiles??view.columns.some(column=>isMedia(column)||isImage(column));
    const secondary=secondaryColumns.map(column=>column.id);
    this.visibleColumns=this.preferences.visibleColumns(secondary);
    const inner=!!scope||hosted;
    const region=(node:Region):any=>({...node,header:node.id==="grid"?inner?undefined:escape(view.title):node.header?escape(node.header):undefined,
      ...(node.id==="grid"&&!inner?{headerIcon:"blade-list-count",css:"blade-list-panel"}:{}),
      ...(node.rows?{rows:node.rows.map(region)}:{}),...(node.cols?{cols:node.cols.map(region)}:{})});
    this.layout=new Layout(host,{type:inner?"none":"space",css:scope?.compact?"blade-subview":inner?"blade-feature-fill":undefined,...(view.singleton
      ?{rows:[{id:"body",header:escape(view.title),rows:[{id:"commands",height:48,css:"blade-command-row"},{id:"detail"}]}]}
      :region(inner?view.layout.tree:this.preferences.layoutTree(view.layout.tree)))});
    if(!view.singleton&&!inner)this.preferences.bindLayout(this.layout,view.layout.tree);
    // Client commands: the built-in `details` of every selectable list (also a hidden preview toolbar: the parent
    // delegates it), then the view's declared commands where the list has its own toolbar.
    const builtin=!view.singleton&&scope?.select!==false?["details"]:[];
    const commands=this.clientCommands=resolveCommands(builtin,scope?.compact||scope?.shared?[]:view.commands,extensions.commands,builtinCommands);
    const ofToolbar=(fromBuiltin:boolean)=>commands.filter(command=>builtin.includes(command.name)===fromBuiltin);
    this.commands=new ResponsiveToolbar(undefined,{data:listCommands(view,{scope,filter:this.hasRegion("filter")?"panel":view.filters.length&&!scope?.compact?"cards":false,tiles,secondary:secondaryColumns,visible:this.visibleColumns,commands:{builtin:ofToolbar(true),project:ofToolbar(false)}})});
    this.commands.events.on("click",(id:string|number)=>{if(this.delegated&&(id===commandId("details")||view.actions.some(a=>a.name===id&&a.name!=="create"&&!a.upload)&&this.delegated.view.actions.some(a=>a.name===id))){this.delegated.command(String(id));return;}this.command(String(id));});
    if(view.singleton)this.layout.getCell("commands").attach(this.commands);
    else{
      // A declared search (`view.search`) gets its own native Toolbar input: the command bar may collapse into a menu.
      const search=!!view.search?.fields?.length;
      this.content=new Layout(document.createElement("div"),{type:"none",css:"blade-grid-content",rows:[scope?.compact?{id:"commands",height:0,hidden:true}:scope?.shared?{id:"commands",height:0,hidden:true}:search?{height:48,css:"blade-command-row",cols:[{id:"search",width:Math.min(280,Math.max(150,Math.round(innerWidth*.4))),css:"blade-search-cell"},{id:"commands"}]}:{id:"commands",height:48,css:"blade-command-row"},{id:"data"}]});
      this.content.getCell("commands").attach(this.commands);
      if(search)this.search=new ListSearch(this.content.getCell("search"),()=>void this.load());
      const dataHost=document.createElement("div");
      this.grid=new ResponsiveGrid(dataHost,view.columns,()=>this.rows,(id)=>{
        this.selected=id;this.delegated=undefined;this.capabilities();
        scope?.shared?.(this,this.selectedRow());
        this.hooks.emit?.("select",{row:this.selectedRow()});
      },()=>{
        const row=this.selectedRow();
        if(row)this.activate(row);else if(this.selected)void this.showResults(this.selected);
      },direction=>{if(!this.rendering&&!this.busy&&!this.disposed)void this.more(direction);},(cards,mobile,mode)=>{
        if(cards&&(view.sortable??[]).length)this.commands.show("blade-sort");else this.commands.hide("blade-sort");
        // Header filters only: cards and tiles have no table headers, so the filters move into the `Szűrés` dialog.
        if(!this.hasRegion("filter")&&view.filters.length){if(cards)this.commands.show("blade-filter");else this.commands.hide("blade-filter");}
        this.commands.data.update("blade-view",{value:mode==="tiles"?t("Nézet: Csempék"):cards?t("Nézet: Kártyák"):t("Nézet: Táblázat"),icon:mode==="tiles"?"dxi dxi-border-all":cards?"dxi dxi-view-grid":"dxi dxi-table-check"});
        // Mobile forces cards for the table without changing the stored preference; tiles remain selectable.
        if(mobile&&!tiles)this.commands.disable("blade-view");else this.commands.enable("blade-view");
        if(mode==="cards")this.commands.disable("blade-cards");else this.commands.enable("blade-cards");
        if(mode==="table"||mobile)this.commands.disable("blade-table");else this.commands.enable("blade-table");
        if(tiles){if(mode==="tiles")this.commands.disable("blade-tiles");else this.commands.enable("blade-tiles");}
      },{rowHeight:view.rowHeight,tileMinWidth:view.tileMinWidth,tiles,rowNumbers:view.rowNumbers,selection:view.selection,rowSelection:view.rowSelection,fields:view.detailFields??view.columns,filters:view.filters,subview:scope?.compact?undefined:this.subviewOptions(),select:scope?.select,...(scope?.compact?{table:true,idColumn:false}:{}),...(hooks.showId===false?{idColumn:false}:{}),
        // Per row: the declared target's description; a map without an entry for the row keeps the default (no description, cards open the details).
        activation:view.activate?row=>declaredTarget(view.activate,row)===undefined?undefined:t("Megnyitás: {target}",{target:this.activation(row).label}):undefined,
        details:id=>{const row=this.rows.find(r=>String(r.id)===id);if(row)this.hooks.emit?.("activate",{row,target:"details"});void this.showResults(id);},marked:()=>this.capabilities(),edit:(id,field)=>void this.editCard(id,field),
        drag:this.dragOptions()});
      this.sortLabel();
      // Grid column ids of reserved record keys are aliases (ResponsiveGrid): headers speak in column ids, requests in fields.
      this.gridHeaders=new GridHeaders(this.grid.table,view.columns.map(column=>({...column,id:alias(column.id)})),(view.sortable??[]).map(alias),sort=>void this.changeSort({...sort,field:unalias(sort.field)}),view.filters.map(filter=>({...filter,name:alias(filter.name)})),(field,value)=>void this.changeFilter(unalias(field),value));
      this.headerSort(this.sort);
      this.headerFilters();
      this.preferences.bindGrid(this.grid.table);
      for(const column of view.columns.filter(column=>column.secondary))if(!this.visibleColumns.has(column.id))this.grid.setColumnVisible(column.id,false);
      this.grid.setMode(this.preferences.mode);
      this.gridEditing=new GridEditing(this.grid.table,view.actions.find(a=>a.name==="update")?.fields??[],()=>this.rows,
        (row,field,value)=>this.saveCell(row,field,value),error=>this.error(error),active=>{this.cellEditing=active;if(!active&&!this.disposed)this.watch();});
      this.content.getCell("data").attach(this.grid.layout);
      this.layout.getCell("grid").attach(this.content);
      // The declared panel, or for header filters only the dialog that cards and tiles offer (`Szűrés`).
      if(this.hasRegion("filter")||view.filters.length)this.filterPanel=new ListFilters(view,this.hasRegion("filter")?this.layout:undefined,this.commands,filters=>{this.filters=filters;this.keepFilters();this.headerFilters();void this.load();});
    }
    this.filterPanel?.fit();
    const initial=Object.keys(preset).length||scope?preset:this.preferences.filters(view.filters);
    for(const [field,value] of Object.entries(initial))if(value!=="")this.setFilter(field,value);
    this.keepFilters();
    this.live=new Realtime(channel,view.resource,data=>void this.changed(data),()=>{},()=>this.revoke());
    this.capabilities();void this.load();
  }
  /** Runs a toolbar command; a parent's toolbar runs it here for this view's cursor record (shared sub-view). */
  command(id:string):void{
    const view=this.view;if(id.startsWith("blade-command:")){this.runCommand(id.slice("blade-command:".length));return;}if(id==="blade-subview"){this.openSubview();return;}if(String(id).startsWith("blade-column:")){const column=String(id).slice("blade-column:".length),visible=!this.visibleColumns.has(column);if(visible)this.visibleColumns.add(column);else this.visibleColumns.delete(column);this.grid?.setColumnVisible(column,visible);this.preferences.setVisibleColumns(this.visibleColumns);this.commands.data.update(String(id),{active:visible,icon:visible?"dxi dxi-checkbox-marked":"dxi dxi-checkbox-blank-outline"});return;}if(id==="blade-move-up"||id==="blade-move-down"){void this.step(id==="blade-move-up"?-1:1);return;}if(String(id).startsWith("blade-sort:")){const [,field,direction]=String(id).split(":");void this.changeSort({field,direction:direction as "asc"|"desc"});return;}if(id==="blade-table"||id==="blade-cards"||id==="blade-tiles"){const mode=String(id).slice("blade-".length) as "table"|"cards"|"tiles";this.grid?.setMode(mode);this.preferences.setMode(mode);return;}if(id==="blade-filter"){this.filterPanel?.open();return;}const action=view.actions.find(a=>a.name===id);if(action?.upload){this.actions.openUpload(action);return;}if(action){const marked=this.grid?.markedIds??[];if(action.bulk&&(view.selection||view.rowSelection)&&marked.length)void this.actions.openBulk(action);else if(action.name==="create"||marked.length<=1||!(view.selection||view.rowSelection))void this.actions.open(action);}
  }
  /**
   * What client command $name sees: the application, the view as the server sent it, the toolbar's record, the marked
   * rows and the list's lifetime signal. While a sub-view record holds the toolbar, a command its view has too (the
   * built-in `details`, a declared name; every command of a shared sub-view) gets the sub-view's context, like the
   * built-in actions; any other stays on this list's own record and marks, so `view` and `row` share one resource.
   */
  private commandContext(name:string):ListCommandContext{
    if(this.delegated?.hasCommand(name))return this.delegated.commandContext(name);
    const row=this.selectedRow();
    const marked=(this.grid?.markedIds??[]).map(id=>this.rows.find(item=>String(item.id)===id)).filter((item):item is Row=>!!item);
    const view=this.hooks.view??{id:this.view.id,kind:"list",title:this.view.title,resource:this.view.resource,actions:this.view.actions as any,options:{} as any};
    return Object.freeze({app:extensions.app as Application,view,row,rows:Object.freeze(marked),signal:this.closed.signal,[LIST]:{details:(record:Row)=>void this.showResults(String(record.id))}});
  }
  /** Whether client command $name belongs to this list: resolved here or declared by its view. */
  private hasCommand(name:string):boolean{return this.clientCommands.some(command=>command.name===name)||!!this.view.commands?.includes(name);}
  /** Runs an enabled client command; a throw or rejection shows the error dialog (an abort stays silent). */
  private runCommand(name:string):void{
    const command=this.clientCommands.find(item=>item.name===name);
    if(!command||this.disposed)return;
    const context=this.commandContext(name);
    if(!commandEnabled(command.entry,context))return;
    const failed=(error:unknown)=>{if(!(error instanceof DOMException&&error.name==="AbortError"))void this.error(error);};
    try{void Promise.resolve(command.entry.run(context)).catch(failed);}catch(error){failed(error);}
  }
  private async saveCell(row:Row,field:string,value:unknown):Promise<void>{
    const result=await this.call("__edit",String(row.id),{field,value,revision:row.revision});
    if(this.disposed)return;
    if(result.reauthenticate){location.reload();return;}
    const saved={...row,...result.values,revision:result.revision};
    if(this.sort.field===field){await this.load();this.saved("update",saved);return;}
    await this.render(this.rows.map(item=>String(item.id)===String(row.id)?{...item,...result.values,revision:result.revision}:item),true);
    this.saved("update",saved);
  }
  private async editCard(id:string,name:string):Promise<void>{
    if(this.cardSave)await this.cardSave;
    if(this.cellEditing||this.busy||this.disposed)return;
    const row=this.rows.find(row=>String(row.id)===id);
    const field=this.view.actions.find(action=>action.name==="update")?.fields.find(field=>field.name===name);
    if(!row||!field||!row._editable?.includes(name))return;
    this.cellEditing=true;
    // A switch saves directly; a registered field type always edits in the window with its Form item.
    if(field.type==="checkbox"&&!fieldTypeOf(field)){
      this.cardSave=this.saveCell(row,name,!(row[name]===true||String(row[name])==="1")).catch(error=>this.error(error)).finally(()=>{this.cellEditing=false;this.cardSave=undefined;if(!this.disposed)this.watch();});
      await this.cardSave;
      return;
    }
    const popup=new Window({css:"blade-content-window",title:escape(field.label),width:Math.min(360,innerWidth-24),height:Math.min(260,innerHeight-24),modal:true,closable:true});this.cardEditor=popup;
    const form=new Form(document.createElement("div"),{padding:16,rows:[input(field,row[name]),formActions({name:"submit",text:t("Mentés"),icon:"dxi dxi-content-save"})]} as any);
    popup.attach(form);popup.show();void fitWindow(popup);
    form.events.on("afterValidate",()=>{void fitWindow(popup);});
    const validation=new FormValidation(form,[field],()=>row);let saving=false;
    const releaseTypes=bindFieldTypes(form,[field]);
    popup.events.on("beforeHide",()=>!saving);
    popup.events.on("afterHide",()=>{releaseTypes();this.cellEditing=false;this.cardEditor=undefined;void awaitRedraw().then(()=>popup.destructor());if(!this.disposed)this.watch();});
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){popup.hide();return;}
      if(name!=="submit"||saving||!validation.validate())return;
      saving=true;form.disable();
      void this.saveCell(row,field.name,(form.getValue() as Record<string,unknown>)[field.name]).then(()=>{saving=false;if(!this.disposed)popup.hide();}).catch(error=>{if(!validation.showServerErrors(error.fieldErrors??{}))return this.error(error);}).finally(()=>{saving=false;if(!this.disposed&&this.cardEditor===popup)form.enable();});
    });
  }
  // A hierarchy (same-resource sub-view) lists its records without a parent at the top, also inside another record.
  private query():Record<string,unknown>{
    const root=this.view.subview?.shared&&this.scope?.field!==this.view.subview.field?{[this.view.subview.field]:""}:{};
    const search=this.search?.value??"";
    return {filters:{...this.filters,...root,...(this.scope?{[this.scope.field]:this.scope.id}:{})},...(search?{search}:{})};}
  private fitObserver?:ResizeObserver;
  /**
   * A compact preview reports the height its records need: its own frame (layout borders) plus the measured table,
   * 5–10 rows by the viewport, then it scrolls. Measured again whenever its size changes, until the table has
   * followed its new size (the reported value is then stable).
   */
  private fitPreview():void{
    const compact=this.scope?.compact,root=this.layout.getRootNode() as HTMLElement|undefined,grid=this.grid;
    if(!compact||!root||!grid||this.disposed)return;
    if(!this.fitObserver){this.fitObserver=new ResizeObserver(()=>void awaitRedraw().then(()=>this.fitPreview()));this.fitObserver.observe(root);}
    const table=grid.layout.getRootNode() as HTMLElement|undefined,fit=grid.fitHeight(previewRows(grid.rowPixels));
    if(table&&fit)compact.height(root.offsetHeight-table.offsetHeight+fit);
  }
  /** An open form, card editor or cell editor here or in a sub-view: input that a page reload would discard. */
  editing():boolean{
    return this.detailDirty||this.cellEditing||!!this.cardEditor?.isVisible()||(!!this.actions.editor&&(this.view.layout.formMode==="panel"||!!this.actions.dialog?.isVisible()))
      ||[...this.previews.values(),...this.windows.keys()].some(view=>view.editing());
  }
  /** Reloads the list (a compact preview after its full view closed). */
  refresh():void{if(!this.disposed)void this.load();}
  /** Replaces the filter values (declared filters only; others are ignored) and reloads. */
  setFilters(filters:Record<string,string>):void{
    if(this.disposed)return;
    this.filters={};this.filterPanel?.clear();
    for(const [field,value] of Object.entries(filters??{}))if(typeof value==="string"&&value!=="")this.setFilter(field,value);
    this.keepFilters();this.headerFilters();void this.load();
  }
  /** The nested view of an open record: the declared child list, or this view again (shared toolbar). */
  private subviewOptions(){
    const sub=this.view.subview,child=sub?.shared?this.view:sub?.view;
    if(!sub||!child)return undefined;
    // A selected preview record takes the toolbar over for the actions it has too (same name: update, delete, …).
    // A non-selectable child (`select: false`) never delegates: the toolbar stays on this record.
    // A re-render of the preview ($refresh) only re-evaluates the toolbar while that preview holds it.
    const shared=sub.select===false?{select:false}:{shared:(workspace:Workspace,selected:Row|undefined,refresh?:boolean)=>{if(this.disposed||refresh&&this.delegated!==workspace)return;this.delegated=selected?workspace:this.delegated===workspace?undefined:this.delegated;this.capabilities();}};
    return {label:sub.shared?t("Alelemek"):child.title,open:(id:string)=>this.openRecord(id),mount:(host:HTMLElement,row:Row,height:(pixels:number)=>void)=>{
      const id=String(row.id),preview=new Workspace(host,child,this.channel,this.user,{field:sub.field,id,...shared,compact:{height}},{},{app:this.hooks.app,view:this.childView()});
      this.previews.set(id,preview);
      // A collapsed preview gives the toolbar back to this list.
      return {destroy:()=>{if(this.previews.get(id)===preview)this.previews.delete(id);preview.destroy();if(this.delegated===preview){this.delegated=undefined;if(!this.disposed)this.capabilities();}}};
    }};
  }
  /**
   * Double-click and Enter on $row: the declared `activate` (one target or the row's entry of a `{field, map}`,
   * activation.ts) run as the toolbar runs it (`subview`: the full child list, also at a count of 0; `page`: the
   * child view's page filtered to the record, the window where that page or its field filter is not offered or in a
   * scoped view; an action the record offers; `view:<id>`: that record view through the application's navigation),
   * otherwise the update form or the details. A declared activation the record or actor is not offered opens the
   * details; a compact preview opens no child window.
   */
  private activation(row:Row):ResolvedActivation{
    const sub=this.view.subview,app=this.hooks.app;
    return resolveActivation(declaredTarget(this.view.activate,row),row,{resource:this.view.resource,actions:this.view.actions,
      subview:sub?{shared:sub.shared,field:sub.field,page:sub.page,view:sub.view}:undefined,scoped:!!this.scope,compact:!!this.scope?.compact,
      viewDefinition:app?id=>app.viewDefinition(id):undefined,labels:{details:t("Adatok"),children:t("Alelemek")}});
  }
  /** Runs the activation of $row and reports it (`activate`). */
  private activate(row:Row):void{
    const resolved=this.activation(row),id=String(row.id);
    this.hooks.emit?.("activate",{row,target:resolved.target});
    switch(resolved.kind){
      // Only a menu page navigates: a window (a scoped view) would stay open over the new page.
      case "page":location.hash=new URLSearchParams({view:resolved.view,["filter."+resolved.field]:id}).toString();return;
      case "subview":this.openRecord(id,row,true);return;
      case "action":{const action=this.view.actions.find(a=>a.name===resolved.action);if(action)void this.actions.open(action);return;}
      // The shell resolves the record through its resource's `get`; a navigation it refuses opens the details.
      case "view":if(!this.hooks.app?.navigate({view:resolved.view,record:id}))void this.showResults(id);return;
      default:void this.showResults(id);
    }
  }
  /** Toolbar command of a view with a sub-view: the full child list of the record the toolbar acts on. */
  private openSubview():void{const row=this.subviewTarget();if(row)this.openRecord(String(row.id),row);}
  /** The record whose child list the toolbar command opens: a selected child only in a hierarchy. */
  private subviewTarget():Row|undefined{return this.view.subview?.shared?this.target():this.selectedRow();}
  /** The full child list of one record (toolbar command, card button); nothing for a record without sub-items unless $empty (activation). */
  private openRecord(id:string,row=this.rows.find(r=>String(r.id)===id),empty=false):void{
    const sub=this.view.subview,child=sub?.shared?this.view:sub?.view;
    if(!sub||!child||!row||!(empty||hasSubview(row)))return;
    this.openFull(child,sub.field,id,String(row[this.view.columns[0]?.id]??id),()=>this.previews.get(id)?.refresh());
  }
  /** The full child view of one record (every action) in a modal window; full screen on a phone. */
  private openFull(child:ViewDefinition,field:string,id:string,caption:string,closed:()=>void):void{
    const mobile=innerWidth<768;
    const dialog=new Window({css:"blade-feature-window",title:escape(child.title+" — "+caption),ariaLabel:child.title+" — "+caption,
      width:mobile?innerWidth:Math.min(1100,innerWidth-24),height:mobile?innerHeight:Math.min(720,innerHeight-24),modal:true,closable:true,resizable:!mobile,movable:!mobile});
    const full=new Workspace(document.createElement("div"),child,this.channel,this.user,{field,id,...(this.view.subview?.select===false?{select:false}:{})},{},{app:this.hooks.app,view:this.childView()});
    dialog.attach(full.layout);dialog.show();this.windows.set(full,dialog);
    // Opened by a double-click or Enter, the parent Grid would keep the focus: the window takes it (Escape closes it).
    void awaitRedraw().then(()=>{const root=dialog.getContainer()?.closest<HTMLElement>(".dhx_popup");if(root&&!root.contains(document.activeElement))root.focus();});
    dialog.events.on("afterHide",()=>{this.windows.delete(full);full.destroy();void awaitRedraw().then(()=>dialog.destructor());if(!this.disposed)closed();});
  }
  /** The public definition of the sub-view's child (this view's own for a hierarchy). */
  private childView(){return this.view.subview?.shared?this.hooks.view:this.hooks.view?.options.subview?.view;}
  /** The record the toolbar's built-in actions act on: a delegated preview's cursor record, otherwise this view's. */
  private target():Row|undefined{return this.delegated?.selectedRow()??this.selectedRow();}
  private hasRegion(id:string):boolean{
    const find=(node:Region):boolean=>node.id===id||[...(node.rows??[]),...(node.cols??[])].some(find);return find(this.view.layout.tree);
  }
  /** Manual order with `move` offered: rows are dragged and moved (not in a compact preview or a non-selectable list). */
  private reorders():boolean{return !!this.view.order&&this.view.actions.some(a=>a.name==="move")&&!this.scope?.compact&&this.scope?.select!==false;}
  /**
   * The grid's drag options: reordering (manual order), receiving records of the declared `drop` resource, and the
   * rows as a drag source (`hooks.dragSource`, the public ListView option) for a list that receives them.
   */
  private dragOptions(){
    if(this.scope?.compact||this.view.singleton)return undefined;
    const reorder=this.reorders(),drop=this.view.drop&&this.view.actions.some(a=>a.name==="create")?this.view.drop:undefined;
    if(!reorder&&!drop&&!this.hooks.dragSource)return undefined;
    return {...(this.hooks.dragSource?{resource:this.view.resource}:{}),...(reorder?{reorder:(id:string,before:string|undefined)=>void this.moveRow(id,before),step:(direction:-1|1)=>void this.step(direction)}:{}),
      ...(drop?{receive:(records:{resource:string;ids:string[]},before:string|undefined)=>{if(records.resource===drop.from)void this.receive(drop.field,records.ids,before);}}:{})};
  }
  /**
   * What the cursor record moves in front of one place up ($direction -1) or down: a record id, undefined (last; only
   * when every record is loaded) or null (it cannot move: the first or last record, or no movable cursor record).
   */
  private neighbour(direction:-1|1):string|undefined|null{
    const row=this.selectedRow(),index=row?this.rows.indexOf(row):-1;
    if(!row||!row._actions?.includes("move"))return null;
    if(direction<0)return index>0?String(this.rows[index-1].id):null;
    if(index+2<this.rows.length)return String(this.rows[index+2].id);
    return index+1<this.rows.length&&this.next===null?undefined:null;
  }
  private async step(direction:-1|1):Promise<void>{const before=this.neighbour(direction);if(before!==null&&this.selected)await this.moveRow(this.selected,before);}
  /** Saves a manual position (`move`): $id in front of $before, undefined only when every record is loaded (last). */
  private async moveRow(id:string,before:string|undefined):Promise<void>{
    const row=this.rows.find(item=>String(item.id)===id);
    if(!row||!row._actions?.includes("move")||this.busy||this.cellEditing||this.disposed||(before===undefined&&this.next!==null))return;
    const index=this.rows.indexOf(row),next=this.rows[index+1];
    if(before===id||(before===undefined?index===this.rows.length-1:next!==undefined&&String(next.id)===before))return;
    try{await this.call("move",id,{before:before??"",revision:row.revision});}
    catch(error){await this.error(error);return;}
    if(this.disposed)return;
    this.selected=id;await this.load();this.saved("move",row);
  }
  /**
   * Records dragged in from a list of the declared `drop` resource: one `create` each (in order, $field = the dragged
   * id, a scoped list's parent), then in a manual order a `move` in front of $before. Stops at the first failure.
   */
  private async receive(field:string,ids:string[],before:string|undefined):Promise<void>{
    if(this.busy||this.cellEditing||this.disposed||!ids.length)return;
    const ordered=this.reorders()&&before!==undefined;
    let last:string|undefined;
    try{
      for(const value of ids.slice(0,100)){
        const result=await this.call("create",null,{[field]:value,...(this.scope?{[this.scope.field]:this.scope.id}:{})});
        if(this.disposed)return;
        last=String(result?.id??"");if(!last)break;
        const row:Row=await this.call("get",last);if(this.disposed)return;
        if(ordered)await this.call("move",last,{before,revision:row.revision});
        this.saved("create",row);
      }
    }catch(error){await this.error(error);}
    if(this.disposed)return;
    if(last)this.selected=last;
    await this.load();
  }
  /** The cursor record. */
  selectedRow():Row|undefined{return this.rows.find(r=>String(r.id)===this.selected);}
  private capabilities():void{
    const marked=this.grid?.markedIds??[];
    // Several marks make single-record commands ambiguous: only bulk-capable actions and create stay available.
    // A selected preview record takes the toolbar over; its marks stay its own.
    const multiple=!this.delegated&&!!((this.view.selection||this.view.rowSelection)&&marked.length>1),target=this.target();
    // Client commands (the built-in `details` included) follow their `enabled` rule in their own context (commandContext).
    for(const command of this.clientCommands){if(commandEnabled(command.entry,this.commandContext(command.name)))this.commands.enable(command.id);else this.commands.disable(command.id);}
    const parentRow=this.subviewTarget();
    if(this.view.subview){if(parentRow&&!multiple&&hasSubview(parentRow))this.commands.enable("blade-subview");else this.commands.disable("blade-subview");}
    if(this.reorders()){for(const direction of [-1,1] as const){const id=direction<0?"blade-move-up":"blade-move-down";if(!this.delegated&&!multiple&&this.neighbour(direction)!==null)this.commands.enable(id);else this.commands.disable(id);}}
    for(const a of this.view.actions){if(a.name==="get"||a.name==="move"||(this.view.singleton&&a.name==="update"))continue;
      const bulkSelected=!this.delegated&&!!(a.bulk&&(this.view.selection||this.view.rowSelection)&&marked.length);
      const bulkAllowed=bulkSelected&&marked.length<=100&&marked.every(id=>this.rows.find(row=>String(row.id)===id)?._actions?.includes(a.name));
      if(a.name==="create"||a.upload||(bulkSelected?bulkAllowed:!multiple&&target?._actions?.includes(a.name)))this.commands.enable(a.name);else this.commands.disable(a.name);
    }
  }
  private async changeFilter(field:string,value:string):Promise<void>{
    if(this.disposed||!this.setFilter(field,value))return;
    this.keepFilters();await this.load();
  }
  call(action:string,id:string|null=null,values:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{return this.request(this.view.resource,action,id,values,signal);}
  /** The JSON channel; another resource is the file manager of a `file` field (picker, upload target). */
  private request(resource:string,action:string,id:string|null=null,values:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{return server.call(resource,action,{id,values,signal});}
  async error(e:unknown):Promise<void>{if(!this.disposed)await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(e,this.view.actions.flatMap(a=>a.fields))});}
  /** A form or edit saved (`saved` event of the public `ListView`). */
  saved(action:string,row:Row):void{this.hooks.emit?.("saved",{action,row});}
  /** The loaded window changed (`changed` event of the public `ListView`). */
  private reportRows():void{this.hooks.emit?.("changed",{rows:this.rows,...this.counted} as ListViewEvents["changed"]);}
  private watch():void{this.live.subscribe({numbered:this.view.rowNumbers!==false,sort:this.sort,anchor:this.rows[0]?cursor(this.rows[0],"next"):null,limit:Math.max(100,this.rows.length),first:this.rows[0]?.id??null,front:this.previous===null,...this.query()});}
  private async changeSort(sort:Sort):Promise<void>{
    if(this.busy||this.cellEditing||this.disposed)return;
    const previous=this.sort;this.sort=sort;this.sortLabel();this.headerSort(sort);
    const operation=this.epoch+1;
    if(await this.load()){this.preferences.setSort(this.sort);}else if(operation===this.epoch&&!this.disposed){this.sort=previous;this.sortLabel();this.headerSort(previous);this.watch();}
  }
  private headerSort(sort:Sort):void{this.gridHeaders?.setSort({...sort,field:alias(sort.field)});}
  /** A menu page stores its filter values; scoped views (previews, sub-view windows) do not. */
  private keepFilters():void{if(!this.scope&&!this.view.singleton)this.preferences.setFilters(this.filters);}
  /** One declared filter's value in the request and the filter panel; false for a field the view cannot filter. */
  private setFilter(field:string,value:string):boolean{
    const definition=this.view.filters.find(filter=>filter.name===field);if(!definition)return false;
    if(value)this.filters[field]=value;else delete this.filters[field];
    this.filterPanel?.setValue(definition,value);
    return true;
  }
  private headerFilters():void{this.gridHeaders?.setFilterValues(Object.fromEntries(Object.entries(this.filters).map(([field,value])=>[alias(field),value])));}
  private sortLabel():void{
    this.commands.data.update("blade-sort",{value:t("Rendezés: ")+escape(this.view.columns.find(column=>column.id===this.sort.field)?.header??(this.sort.field==="id"?"ID":this.sort.field))+(this.sort.direction==="asc"?" ↑":" ↓")});
  }
  private counts(data:Snapshot):void{
    this.counted={...(typeof data.total==="number"?{total:data.total}:{}),...(typeof data.matched==="number"?{matched:data.matched}:{})};
    // The server's total ignores filters; a nested view's records are its parent record's, so it counts the scoped match.
    const text=this.scope?typeof data.matched==="number"?t("Találat: {count}",{count:data.matched.toLocaleString(locale())}):"":typeof data.total==="number"?t("Összes: {count}",{count:data.total.toLocaleString(locale())})+(Object.keys(this.filters).length||this.search?.value?" / "+t("Találat: {count}",{count:(data.matched??0).toLocaleString(locale())}):""):"";
    this.layout.getRootNode()?.style.setProperty("--blade-list-count",JSON.stringify(text));
  }
  async load():Promise<boolean>{
    const epoch=++this.epoch;this.abort?.abort();this.abort=new AbortController();this.busy=true;
    try{
      if(this.view.singleton){const row=await this.call("get","self",{},this.abort.signal);if(this.disposed||epoch!==this.epoch)return false;this.rows=[row];this.selected=String(row.id);await this.mountDetail(row);this.reportRows();}
      else{
        const data:Snapshot=await this.call("list",null,{mode:"dynamic",numbered:this.view.rowNumbers!==false,limit:100,sort:this.sort,...this.query()},this.abort.signal);
        if(this.disposed||epoch!==this.epoch)return false;this.counts(data);this.previous=data.previous;this.next=data.next;await this.render(data.items,false);
      }
      this.watch();return true;
    }catch(e){if(!this.disposed&&epoch===this.epoch&&!(e instanceof DOMException&&e.name==="AbortError"))await this.error(e);return false;}
    finally{if(epoch===this.epoch)this.busy=false;}
  }
  private async more(direction:"next"|"previous"):Promise<void>{
    const token=direction==="next"?this.next:this.previous;if(!token||this.busy)return;
    const epoch=this.epoch;this.busy=true;
    try{
      const data:Snapshot=await this.call("list",null,{mode:"dynamic",numbered:this.view.rowNumbers!==false,limit:100,cursor:token,sort:this.sort,...this.query()});
      if(this.disposed||epoch!==this.epoch)return;
      this.counts(data);
      if(!data.items.length){if(direction==="next")this.next=null;else this.previous=null;return;}
      const joined=direction==="next"?[...this.rows,...data.items]:[...data.items,...this.rows];
      let rows=[...new Map(joined.map(row=>[String(row.id),row])).values()];
      if(direction==="next"){
        this.next=data.next;if(rows.length>600){rows=rows.slice(-600);this.previous=cursor(rows[0],"previous");}
      }else{
        this.previous=data.previous;if(rows.length>600){rows=rows.slice(0,600);this.next=cursor(rows[rows.length-1],"next");}
      }
      await this.render(rows,true);this.watch();
    }catch(e){await this.error(e);}finally{if(epoch===this.epoch)this.busy=false;}
  }
  private async render(rows:Row[],preserve:boolean):Promise<void>{
    if(!this.grid)return;
    this.rendering=true;
    const position=this.grid.capture();
    this.grid.setRows(rows);
    this.gridHeaders?.decorate();
    this.headerFilters();
    this.rows=rows;
    const left=!!this.selected&&!this.selectedRow();
    if(left)this.selected=undefined;
    // A preview holding the parent's toolbar reports its refreshed (or vanished) cursor record.
    this.capabilities();this.scope?.shared?.(this,this.selectedRow(),true);await awaitRedraw();
    this.headerFilters();
    if(this.disposed)return;
    this.grid.restore(position,preserve,this.selected);
    this.rendering=false;
    this.fitPreview();
    if(left)this.hooks.emit?.("select",{row:undefined});
    this.reportRows();
  }
  private async changed(data:Snapshot):Promise<void>{
    if(this.disposed||this.busy||this.cellEditing)return;
    if(this.view.singleton){
      const row=data.items[0];if(!row){this.revoke();return;}
      if(this.rows[0]?.revision!==row.revision){
        if(this.detailDirty){
          if(!this.detailConflictShown){this.detailConflictShown=true;message({text:t("Az adat időközben módosult; a megkezdett szerkesztés megmaradt."),expire:5000});}
          return;
        }
        this.rows=[row];await this.mountDetail(row);
      }else{this.rows=[row];this.capabilities();}
      this.reportRows();
    }else{this.counts(data);this.previous=data.previous;this.next=data.next;await this.render(data.items,true);}
  }
  private async mountDetail(row:Row):Promise<void>{
    const action=this.view.actions.find(a=>a.name==="update"&&row._actions?.includes("update"));
    let allowed:FieldDefinition[]=[];
    if(action){const schema=await this.call("__form",String(row.id),{operation:"update"});allowed=schema.fields;}
    if(this.disposed)return;
    this.layout.getCell("detail").detach();this.detail?.destructor();await awaitRedraw();if(this.disposed)return;
    // Derived media columns have no field of their own: the detail form shows the fields only.
    const fields=this.view.columns.filter(c=>!derivedOf(c)).map(c=>allowed.find(f=>f.name===c.id)||{name:c.id,label:c.header,type:"text",required:false,max:255,options:{}});
    const form=new Form(document.createElement("div"),{padding:24,rows:[...fields.map(f=>input(f,row[f.name],!allowed.some(a=>a.name===f.name))),...(action?[formActions({name:"submit",text:t("Mentés"),icon:"dxi dxi-content-save",color:"primary"})]:[])]} as any);
    this.detailFiles?.destroy();this.detailFiles=new FileFields(form,fields,this.resourceCall,[row],f=>!allowed.some(a=>a.name===f.name));
    this.detailTypes?.();this.detailTypes=bindFieldTypes(form,fields,f=>!allowed.some(a=>a.name===f.name));
    this.detail=form;this.detailDirty=false;this.detailConflictShown=false;
    form.events.on("change",()=>{this.detailDirty=true;});
    if(action)this.actions.bindSave(form,action,String(row.id),row,allowed,()=>{this.detailDirty=false;},()=>{void this.mountDetail(this.rows[0]??row);});
    this.layout.getCell("detail").attach(form);this.capabilities();
  }
  private showResults(id:string):Promise<void>{return this.details.show(id);}
  private revoke():void{this.actions.revoke();this.detailFiles?.destroy();this.cardEditor?.destructor();this.cardEditor=undefined;this.cellEditing=false;this.details.close();this.rows=[];this.grid?.setRows([]);this.detail?.clear();this.detail?.disable();this.capabilities();this.reportRows();}
  /** Releases everything, including open sub-view windows and dialogs; idempotent. */
  destroy():void{
    if(this.disposed)return;
    this.commands.disposeResponsive();this.disposed=true;this.closed.abort();this.detailTypes?.();this.search?.destroy();this.actions.fileFields?.destroy();this.detailFiles?.destroy();
    this.cardEditor?.destructor();this.cardEditor=undefined;this.releaseIcons();this.details.close();this.filterPanel?.destroy();this.epoch++;this.actions.destroy();this.abort?.abort();this.live.destroy();
    // An open full sub-view window closes with its list (its afterHide destroys the nested view).
    for(const dialog of [...this.windows.values()])dialog.hide();
    this.gridEditing?.destroy();this.gridHeaders?.destroy();this.grid?.destroy();this.fitObserver?.disconnect();this.layout.destructor();}
}

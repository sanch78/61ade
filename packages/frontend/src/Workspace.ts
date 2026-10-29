import { locale, t } from "./I18n";
import { ResponsiveToolbar } from "./ResponsiveToolbar";
import { fitWindow } from "./WindowSizing";
import { widgetIcons } from "./WidgetIcons";
import { UiPreferences } from "./UiPreferences";
import { Form, Layout, Toolbar, Window, message, awaitRedraw } from "@dhtmlx/suite";
import { alert, requestConfirmation, type DialogSeverity } from "./MessageDialog";
import { Realtime, type LiveChannel, type Row, type Snapshot } from "./Realtime";
import { GridHeaders, type Sort } from "./GridHeaders";
import { GridEditing, alias, unalias } from "./GridEditing";
import { escape as escapeRecord, isMedia, isImage, optionText, presentedFields, recordFields, derivedOf, withDerived, mergeUsages, confirmUsages, clearedText, type MediaPart, type Usage } from "./RecordPresentation";
import { FileFields, fileInput } from "./FilePicker";
import { uploads, type UploadPolicy } from "./Uploader";
import { ResponsiveGrid, previewRows, hasSubview } from "./ResponsiveGrid";
import { FormValidation, type FieldDefinition } from "./FormValidation";
import { server } from "./api/Server";

export type { FieldDefinition } from "./FormValidation";
export type ActionConfirmation={message:string;title?:string;severity?:DialogSeverity;confirmLabel?:string;cancelLabel?:string};
/**
 * `usages`: the action (a delete) reports references through a `preview` call before it is confirmed.
 * `upload`: the action receives files through the shared uploader with this policy (no record needed).
 */
export type ActionDefinition={name:string;label:string;submitLabel:string;write:boolean;icon?:string;bulk?:boolean;confirm?:ActionConfirmation;usages?:boolean;upload?:UploadPolicy;fields:FieldDefinition[]};
const DECLINED=Symbol("declined");
const ACTION_ICONS:Record<string,string>={create:"dxi dxi-plus",update:"dxi dxi-pencil",delete:"dxi dxi-delete",password:"dxi dxi-key",get:"dxi dxi-information-outline"};
const actionIcon=(action:ActionDefinition)=>action.icon??ACTION_ICONS[action.name]??(action.upload?"dxi dxi-file-import":"dxi dxi-check");
/** Protocol values a command sends itself; an action with only these fields runs without a form. */
const technical=(field:FieldDefinition)=>field.name==="revision"||field.name==="preview"&&field.type==="checkbox";
type Region={id?:"filter"|"grid"|"form";header?:string;rows?:Region[];cols?:Region[];width?:number;height?:number;minWidth?:number;resizable?:boolean;collapsable?:boolean;collapsed?:boolean};
/** The list kind's internal shape: the view's shared keys beside its `options` (src/app/builtins.ts). */
export type ViewDefinition={id:string;resource:string;title:string;icon?:string;desktopOnly?:boolean;rowNumbers?:boolean;selection?:boolean;rowSelection?:boolean;detailFields?:ViewDefinition["columns"];rowHeight?:number;tileMinWidth?:number;tiles?:boolean;activate?:string;search?:{fields:string[]};columns:{id:string;header:string;type?:string;media?:string;presentation?:string;imageBase?:string;image_base?:string;altOf?:string;alt_of?:string;mediaOf?:string;media_of?:string;part?:MediaPart;options?:Record<string,string>;width?:number;minWidth?:number;maxWidth?:number;editable?:boolean;secondary?:boolean;align?:"left"|"center"|"right"}[];actions:ActionDefinition[];singleton:boolean;sortable?:string[];group?:string;filters:FieldDefinition[];layout:{formMode:"overlay"|"panel";tree:Region};
  /** Records expand to the `resource` list filtered to `field` = record id: its own `view`, or this view when `shared`. */
  subview?:{resource:string;field:string;shared?:boolean;view?:ViewDefinition;select?:boolean;page?:boolean}};
/**
 * A nested (sub-view) instance: its list is limited to `field` = `id` and new records get that value. With
 * `shared` it has no toolbar of its own; its cursor record is reported to the parent, whose toolbar acts on it.
 */
export type WorkspaceScope={field:string;id:string;
  /** false: the rows never become the cursor record (no delegation, no record toolbar actions, double-click opens nothing). */
  select?:boolean;shared?:(workspace:Workspace,row:Row|undefined)=>void;
  /**
   * A compact preview (expanded sub-row or card): a table that is always a table, sortable headers only (no filters,
   * search, toolbar, row numbers or marks), editable columns kept. `height` receives the height its content needs.
   * Without it the scoped view is the full child view filling a window (the window header is its only header).
   */
  compact?:{height:(pixels:number)=>void}};
const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Server limit of the `search` list parameter, in characters. */
const SEARCH_MAX=100;
const cursor=(row:Row,direction:string)=>btoa(Array.from(new TextEncoder().encode(JSON.stringify({...row._position,edge:String(row.id),direction})),byte=>String.fromCharCode(byte)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
export const input=(f:FieldDefinition,value:unknown,readOnly=false):any=>f.type==="file"?fileInput(f,value,readOnly):f.type==="multiselect"&&!readOnly?{
  // Native Suite Combo with multiple selection; the kernel accepts the list or its comma-joined form.
  type:"combo",name:f.name,label:f.label,labelPosition:"top",required:f.required,multiselection:true,selectAllButton:false,css:"blade-multiselect-field",
  data:Object.entries(f.options).map(([id,value])=>({id,value})),value:String(value??f.defaultValue??"").split(",").filter(Boolean),
}:f.type==="multiselect"?{type:"input",name:f.name,label:f.label,labelPosition:"top",readOnly:true,value:optionText(f,value)}:f.type==="checkbox"?{
  width:"100%",cols:[
    // The hidden label names the checkbox; Suite otherwise announces it as "checkbox <text>".
    {type:"checkbox",name:f.name,text:f.label,label:f.label,hiddenLabel:true,width:"content",checked:String(value??f.defaultValue??"0")==="1"||value===true,disabled:readOnly},
  ],
}:({
  type:readOnly?"input":f.type==="select"?"select":f.type==="textarea"?"textarea":"input",
  name:f.name,label:f.label,labelPosition:"top",required:!readOnly&&f.required,maxlength:f.max,
  inputType:f.type==="password"?"password":"text",readOnly,
  // Suite otherwise measures an empty textarea at zero height while the panel
  // is being attached, leaving only a one-line scrollbar-like control visible.
  ...(f.type==="textarea"?{height:120}:{}),
  // An explicit empty choice: nothing is preselected silently; required selects fail validation until chosen.
  ...(!readOnly&&f.type==="select"?{options:[...(Object.hasOwn(f.options,"")?[]:[{value:"",content:t(f.required?"— válassz —":"— nincs —")}]),...Object.entries(f.options).map(([value,content])=>({value,content}))]}:{}),
  value:f.type==="password"?"":String(value??f.defaultValue??""),
});
export const formActions=(submit:{name:string;text:string;icon?:string;color?:string},cancel=true):any=>({
  css:"blade-form-actions",
  cols:[
    ...(cancel?[{type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"}]:[]),
    {type:"button",...submit,width:"content"},
  ],
});

/** Configured filter/form/grid regions, bounded dynamic data and live observation. */
export class Workspace {
  private releaseIcons=widgetIcons();
  readonly layout:Layout;
  private grid?:ResponsiveGrid;
  private gridEditing?:GridEditing;
  private gridHeaders?:GridHeaders;
  private sort:Sort={field:"id",direction:"desc"};
  private cellEditing=false;
  private cardEditor?:Window;
  private cardSave?:Promise<void>;
  private commands:ResponsiveToolbar;
  private content?:Layout;
  private rows:Row[]=[];
  private selected?:string;
  private previous:string|null=null;
  private next:string|null=null;
  private filters:Record<string,string>={};
  private search="";
  private searchTimer?:ReturnType<typeof setTimeout>;
  private searchBar?:Toolbar;
  private busy=false;
  private rendering=false;
  private disposed=false;
  private epoch=0;
  private formEpoch=0;
  private abort?:AbortController;
  private dialog?:Window;
  private editor?:Form;
  private detail?:Form;
  private results?:Window;
  private resultsEpoch=0;
  private detailDirty=false;
  private detailConflictShown=false;
  private live:Realtime;
  private filterForm?:Form;
  private filterDialog?:Window;
  private mobile=false;
  private filterWasVisible=true;
  private resize=()=>this.resizeFilters();
  private preferences:UiPreferences;
  private visibleColumns=new Set<string>();
  /** `file` fields of the open editor and of the singleton detail form. */
  private fileFields?:FileFields;
  private detailFiles?:FileFields;
  private resourceCall=(resource:string,action:string,id:string|null,values:Record<string,unknown>={})=>this.request(resource,action,id,values);
  /** The nested same-resource view whose cursor record the toolbar currently acts on. */
  private delegated?:Workspace;
  /** Open compact previews by record id (refreshed when that record's full child view closes). */
  private previews=new Map<string,Workspace>();
  /** Open full sub-view windows. */
  private windows=new Set<Workspace>();

  /**
   * $preset: filters the view opens with (a navigation, `activate: 'page'`) instead of the saved ones; declared filters
   * only, removable like any other. A menu page keeps its filter values across reloads (UiPreferences).
   */
  constructor(host:HTMLElement,private view:ViewDefinition,private channel:LiveChannel,private user="",private scope?:WorkspaceScope,preset:Record<string,string>={}){
    // A nested view: the scope field is implied (no column, filter or input), one grid region, overlay forms.
    if(scope)view=this.view={...view,columns:view.columns.filter(column=>column.id!==scope.field),filters:view.filters.filter(filter=>filter.name!==scope.field),sortable:(view.sortable??[]).filter(field=>field!==scope.field),layout:{formMode:"overlay",tree:{rows:[{id:"grid"}]}}};
    if(scope?.compact)view=this.view={...view,filters:[],search:undefined,rowNumbers:false,selection:false,rowSelection:false,tiles:false,columns:view.columns.map(column=>({...column,secondary:false}))};
    this.preferences=new UiPreferences(user,scope?view.id+"@"+scope.field:view.id);
    this.sort=this.preferences.sort(view.sortable??[])??this.sort;
    const secondaryColumns=view.columns.filter(column=>column.secondary);
    const tiles=view.tiles??view.columns.some(column=>isMedia(column)||isImage(column));
    const secondary=secondaryColumns.map(column=>column.id);
    this.visibleColumns=this.preferences.visibleColumns(secondary);
    const region=(node:Region):any=>({...node,header:node.id==="grid"?scope?undefined:escape(view.title):node.header?escape(node.header):undefined,
      ...(node.id==="grid"&&!scope?{headerIcon:"blade-list-count",css:"blade-list-panel"}:{}),
      ...(node.rows?{rows:node.rows.map(region)}:{}),...(node.cols?{cols:node.cols.map(region)}:{})});
    this.layout=new Layout(host,{type:scope?"none":"space",css:scope?.compact?"blade-subview":scope?"blade-feature-fill":undefined,...(view.singleton
      ?{rows:[{id:"body",header:escape(view.title),rows:[{id:"commands",height:48,css:"blade-command-row"},{id:"detail"}]}]}
      :region(scope?view.layout.tree:this.preferences.layoutTree(view.layout.tree)))});
    if(!view.singleton&&!scope)this.preferences.bindLayout(this.layout,view.layout.tree);
    this.commands=new ResponsiveToolbar(undefined,{data:[...(!view.singleton&&scope?.select!==false?[{id:"blade-results",value:t("Adatok"),icon:"dxi dxi-information-outline"}]:[]),...(!view.singleton&&this.hasRegion("filter")?[{id:"blade-filter",value:t("Szűrés"),icon:"dxi dxi-filter-variant"}]:[]),...view.actions.filter(a=>a.name!=="get"&&!(view.singleton&&a.name==="update")&&(scope?.select!==false||a.name==="create"||!!a.upload)).map(a=>({id:a.name,value:escape(a.label),icon:actionIcon(a)})),...(view.subview&&!scope?.compact&&(view.subview.shared||view.subview.view)?[{id:"blade-subview",value:escape(view.subview.view?.title??t("Alelemek")),icon:"dxi dxi-arrow-expand",tooltip:t("A kijelölt rekord kapcsolódó listája ablakban")}]:[]),...(!view.singleton?[{type:"spacer"},{id:"blade-sort",value:t("Rendezés"),hidden:true,icon:"dxi dxi-sort",items:(view.sortable??[]).flatMap(field=>["asc","desc"].map(direction=>({id:"blade-sort:"+field+":"+direction,value:escape((view.columns.find(column=>column.id===field)?.header??(field==="id"?"ID":field))+ (direction==="asc"?" ↑":" ↓")),icon:direction==="asc"?"dxi dxi-arrow-up":"dxi dxi-arrow-down"})))},...(secondaryColumns.length?[{id:"blade-columns",value:t("Oszlopok"),icon:"dxi dxi-table-check",items:secondaryColumns.map(column=>{const active=this.visibleColumns.has(column.id);return {id:"blade-column:"+column.id,value:escape(column.header),icon:active?"dxi dxi-checkbox-marked":"dxi dxi-checkbox-blank-outline",twoState:true,active};})}]:[]),{id:"blade-view",value:t("Nézet: Táblázat"),icon:"dxi dxi-table-check",items:[{id:"blade-table",value:t("Táblázat"),icon:"dxi dxi-table-check"},{id:"blade-cards",value:t("Kártyák"),icon:"dxi dxi-view-grid"},...(tiles?[{id:"blade-tiles",value:t("Csempék"),icon:"dxi dxi-border-all"}]:[])]}]:[])]});
    this.commands.events.on("click",(id:string|number)=>{if(this.delegated&&(id==="blade-results"||view.actions.some(a=>a.name===id&&a.name!=="create"&&!a.upload)&&this.delegated.view.actions.some(a=>a.name===id))){this.delegated.command(String(id));return;}this.command(String(id));});
    if(view.singleton)this.layout.getCell("commands").attach(this.commands);
    else{
      // A declared search (`view.search`) gets its own native Toolbar input: the command bar may collapse into a menu.
      const search=!!view.search?.fields?.length;
      this.content=new Layout(document.createElement("div"),{type:"none",css:"blade-grid-content",rows:[scope?.compact?{id:"commands",height:0,hidden:true}:scope?.shared?{id:"commands",height:0,hidden:true}:search?{height:48,css:"blade-command-row",cols:[{id:"search",width:Math.min(280,Math.max(150,Math.round(innerWidth*.4))),css:"blade-search-cell"},{id:"commands"}]}:{id:"commands",height:48,css:"blade-command-row"},{id:"data"}]});
      this.content.getCell("commands").attach(this.commands);
      if(search)this.mountSearch();
      const dataHost=document.createElement("div");
      this.grid=new ResponsiveGrid(dataHost,view.columns,()=>this.rows,(id)=>{
        this.selected=id;this.delegated=undefined;this.capabilities();
        scope?.shared?.(this,this.selectedRow());
      },()=>{
        const row=this.selectedRow();
        if(row)this.activation(row).run();else if(this.selected)void this.showResults(this.selected);
      },direction=>{if(!this.rendering&&!this.busy&&!this.disposed)void this.more(direction);},(cards,mobile,mode)=>{
        if(cards&&(view.sortable??[]).length)this.commands.show("blade-sort");else this.commands.hide("blade-sort");
        this.commands.data.update("blade-view",{value:mode==="tiles"?t("Nézet: Csempék"):cards?t("Nézet: Kártyák"):t("Nézet: Táblázat"),icon:mode==="tiles"?"dxi dxi-border-all":cards?"dxi dxi-view-grid":"dxi dxi-table-check"});
        // Mobile forces cards for the table without changing the stored preference; tiles remain selectable.
        if(mobile&&!tiles)this.commands.disable("blade-view");else this.commands.enable("blade-view");
        if(mode==="cards")this.commands.disable("blade-cards");else this.commands.enable("blade-cards");
        if(mode==="table"||mobile)this.commands.disable("blade-table");else this.commands.enable("blade-table");
        if(tiles){if(mode==="tiles")this.commands.disable("blade-tiles");else this.commands.enable("blade-tiles");}
      },{rowHeight:view.rowHeight,tileMinWidth:view.tileMinWidth,tiles,rowNumbers:view.rowNumbers,selection:view.selection,rowSelection:view.rowSelection,fields:view.detailFields??view.columns,filters:view.filters,subview:scope?.compact?undefined:this.subviewOptions(),select:scope?.select,...(scope?.compact?{table:true,idColumn:false}:{}),activation:view.activate?row=>t("Megnyitás: {target}",{target:this.activation(row).label}):undefined,details:id=>void this.showResults(id),marked:()=>this.capabilities(),edit:(id,field)=>void this.editCard(id,field)});
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
      if(this.hasRegion("filter"))this.mountFilters();
    }
    window.addEventListener("resize",this.resize);this.resizeFilters();
    const initial=Object.keys(preset).length||scope?preset:this.preferences.filters(view.filters);
    for(const [field,value] of Object.entries(initial))if(value!=="")this.setFilter(field,value);
    this.keepFilters();
    this.live=new Realtime(channel,view.resource,data=>void this.changed(data),()=>{},()=>this.revoke());
    this.capabilities();void this.load();
  }
  /** Runs a toolbar command; a parent's toolbar runs it here for this view's cursor record (shared sub-view). */
  command(id:string):void{
    const view=this.view;if(id==="blade-subview"){this.openSubview();return;}if(String(id).startsWith("blade-column:")){const column=String(id).slice("blade-column:".length),visible=!this.visibleColumns.has(column);if(visible)this.visibleColumns.add(column);else this.visibleColumns.delete(column);this.grid?.setColumnVisible(column,visible);this.preferences.setVisibleColumns(this.visibleColumns);this.commands.data.update(String(id),{active:visible,icon:visible?"dxi dxi-checkbox-marked":"dxi dxi-checkbox-blank-outline"});return;}if(String(id).startsWith("blade-sort:")){const [,field,direction]=String(id).split(":");void this.changeSort({field,direction:direction as "asc"|"desc"});return;}if(id==="blade-table"||id==="blade-cards"||id==="blade-tiles"){const mode=String(id).slice("blade-".length) as "table"|"cards"|"tiles";this.grid?.setMode(mode);this.preferences.setMode(mode);return;}if(id==="blade-filter"){this.openFilters();return;}if(id==="blade-results"){if(this.selected&&!((view.selection||view.rowSelection)&&(this.grid?.markedIds.length??0)>1))void this.showResults(this.selected);return;}const action=view.actions.find(a=>a.name===id);if(action?.upload){this.openUpload(action);return;}if(action){const marked=this.grid?.markedIds??[];if(action.bulk&&(view.selection||view.rowSelection)&&marked.length)void this.openBulk(action);else if(action.name==="create"||marked.length<=1||!(view.selection||view.rowSelection))void this.open(action);}
  }
  private async saveCell(row:Row,field:string,value:unknown):Promise<void>{
    const result=await this.call("__edit",String(row.id),{field,value,revision:row.revision});
    if(this.disposed)return;
    if(result.reauthenticate){location.reload();return;}
    if(this.sort.field===field){await this.load();return;}
    await this.render(this.rows.map(item=>String(item.id)===String(row.id)?{...item,...result.values,revision:result.revision}:item),true);
  }
  private async editCard(id:string,name:string):Promise<void>{
    if(this.cardSave)await this.cardSave;
    if(this.cellEditing||this.busy||this.disposed)return;
    const row=this.rows.find(row=>String(row.id)===id);
    const field=this.view.actions.find(action=>action.name==="update")?.fields.find(field=>field.name===name);
    if(!row||!field||!row._editable?.includes(name))return;
    this.cellEditing=true;
    if(field.type==="checkbox"){
      this.cardSave=this.saveCell(row,name,!(row[name]===true||String(row[name])==="1")).catch(error=>this.error(error)).finally(()=>{this.cellEditing=false;this.cardSave=undefined;if(!this.disposed)this.watch();});
      await this.cardSave;
      return;
    }
    const popup=new Window({css:"blade-content-window",title:escape(field.label),width:Math.min(360,innerWidth-24),height:Math.min(260,innerHeight-24),modal:true,closable:true});this.cardEditor=popup;
    const form=new Form(document.createElement("div"),{padding:16,rows:[input(field,row[name]),formActions({name:"submit",text:t("Mentés"),icon:"dxi dxi-content-save"})]} as any);
    popup.attach(form);popup.show();void fitWindow(popup);
    form.events.on("afterValidate",()=>{void fitWindow(popup);});
    const validation=new FormValidation(form,[field],()=>row);let saving=false;
    popup.events.on("beforeHide",()=>!saving);
    popup.events.on("afterHide",()=>{this.cellEditing=false;this.cardEditor=undefined;void awaitRedraw().then(()=>popup.destructor());if(!this.disposed)this.watch();});
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){popup.hide();return;}
      if(name!=="submit"||saving||!validation.validate())return;
      saving=true;form.disable();
      void this.saveCell(row,field.name,(form.getValue() as Record<string,unknown>)[field.name]).then(()=>{saving=false;if(!this.disposed)popup.hide();}).catch(error=>{if(!validation.showServerErrors(error.fieldErrors??{}))return this.error(error);}).finally(()=>{saving=false;if(!this.disposed&&this.cardEditor===popup)form.enable();});
    });
  }
  private mountSearch():void{
    const bar=new Toolbar(document.createElement("div"),{css:"blade-search-bar",data:[{type:"input",id:"blade-search",label:t("Keresés"),hiddenLabel:true,placeholder:t("Keresés…"),icon:"dxi dxi-magnify",width:"100%",autocomplete:false}]} as any);
    // Suite's Toolbar input has no maxlength option: it is set on the input whenever Suite creates it.
    bar.events.on("inputCreated",(_id:string|number,input:HTMLInputElement)=>{input.maxLength=SEARCH_MAX;});
    bar.events.on("input",(_id:string|number,value:string)=>{clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.applySearch(String(value??"")),300);});
    bar.events.on("keydown",(event:KeyboardEvent)=>{
      const input=event.target as HTMLInputElement;
      if(event.key==="Enter"){event.preventDefault();this.applySearch(input.value??"");}
      else if(event.key==="Escape"){event.preventDefault();input.value="";bar.data.update("blade-search",{value:""});this.applySearch("");}
    });
    this.searchBar=bar;this.content!.getCell("search").attach(bar);
  }
  /** Debounced input, Enter and Escape converge here; an empty search removes the parameter. */
  private applySearch(value:string):void{
    clearTimeout(this.searchTimer);this.searchTimer=undefined;
    const next=Array.from(value.trim()).slice(0,SEARCH_MAX).join("").trim();if(next===this.search||this.disposed)return;
    this.search=next;void this.load();
  }
  // A hierarchy (same-resource sub-view) lists its records without a parent at the top, also inside another record.
  private query():Record<string,unknown>{
    const root=this.view.subview?.shared&&this.scope?.field!==this.view.subview.field?{[this.view.subview.field]:""}:{};
    return {filters:{...this.filters,...root,...(this.scope?{[this.scope.field]:this.scope.id}:{})},...(this.search?{search:this.search}:{})};}
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
    return this.detailDirty||this.cellEditing||!!this.cardEditor?.isVisible()||(!!this.editor&&(this.view.layout.formMode==="panel"||!!this.dialog?.isVisible()))
      ||[...this.previews.values(),...this.windows].some(view=>view.editing());
  }
  /** Reloads the list (a compact preview after its full view closed). */
  refresh():void{if(!this.disposed)void this.load();}
  /** The nested view of an open record: the declared child list, or this view again (shared toolbar). */
  private subviewOptions(){
    const sub=this.view.subview,child=sub?.shared?this.view:sub?.view;
    if(!sub||!child)return undefined;
    // A selected preview record takes the toolbar over for the actions it has too (same name: update, delete, …).
    // A non-selectable child (`select: false`) never delegates: the toolbar stays on this record.
    const shared=sub.select===false?{select:false}:{shared:(workspace:Workspace,selected:Row|undefined)=>{this.delegated=selected?workspace:this.delegated===workspace?undefined:this.delegated;this.capabilities();}};
    return {label:sub.shared?t("Alelemek"):child.title,open:(id:string)=>this.openRecord(id),mount:(host:HTMLElement,row:Row,height:(pixels:number)=>void)=>{
      const id=String(row.id),preview=new Workspace(host,child,this.channel,this.user,{field:sub.field,id,...shared,compact:{height}});
      this.previews.set(id,preview);
      return {destroy:()=>{if(this.previews.get(id)===preview)this.previews.delete(id);preview.destroy();}};
    }};
  }
  /**
   * Double-click and Enter on $row: the declared `activate` command as the toolbar runs it (`subview`: the full child
   * list, also at a count of 0; `page`: the child view's page filtered to the record, the window where that page or
   * its field filter is not offered or in a scoped view; an action the record offers), otherwise the update form or
   * the details. A declared activation the record or actor is not offered opens the details; a compact preview opens
   * no child window.
   */
  private activation(row:Row):{label:string;run:()=>void}{
    const name=this.view.activate,sub=this.view.subview,child=sub?.shared?this.view:sub?.view,id=String(row.id);
    // Only a menu page navigates: a window (a scoped view) would stay open over the new page.
    if(name==="page"&&sub?.page&&sub.view?.filters.some(filter=>filter.name===sub.field)&&!this.scope)
      return {label:sub.view.title,run:()=>{location.hash=new URLSearchParams({view:sub.view!.id,["filter."+sub.field]:id}).toString();}};
    if((name==="subview"||name==="page")&&sub&&child&&!this.scope?.compact)return {label:sub.shared?t("Alelemek"):child.title,run:()=>this.openRecord(id,row,true)};
    const action=name==="details"||name==="subview"||name==="page"?undefined:this.view.actions.find(a=>a.name===(name??"update"));
    if(action&&row._actions?.includes(action.name))return {label:action.label,run:()=>void this.open(action)};
    return {label:t("Adatok"),run:()=>void this.showResults(id)};
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
    const full=new Workspace(document.createElement("div"),child,this.channel,this.user,{field,id,...(this.view.subview?.select===false?{select:false}:{})});
    dialog.attach(full.layout);dialog.show();this.windows.add(full);
    // Opened by a double-click or Enter, the parent Grid would keep the focus: the window takes it (Escape closes it).
    void awaitRedraw().then(()=>{const root=dialog.getContainer()?.closest<HTMLElement>(".dhx_popup");if(root&&!root.contains(document.activeElement))root.focus();});
    dialog.events.on("afterHide",()=>{this.windows.delete(full);full.destroy();void awaitRedraw().then(()=>dialog.destructor());if(!this.disposed)closed();});
  }
  /** The record the toolbar acts on: the cursor record of a shared sub-view, otherwise this view's. */
  private target():Row|undefined{return this.delegated?.selectedRow()??this.selectedRow();}
  private hasRegion(id:string):boolean{
    const find=(node:Region):boolean=>node.id===id||[...(node.rows??[]),...(node.cols??[])].some(find);return find(this.view.layout.tree);
  }
  private selectedRow():Row|undefined{return this.rows.find(r=>String(r.id)===this.selected);}
  private capabilities():void{
    const marked=this.grid?.markedIds??[];
    // Several marks make single-record commands ambiguous: only bulk-capable actions and create stay available.
    // A shared sub-view's cursor record takes the toolbar over; its marks stay its own.
    const multiple=!this.delegated&&!!((this.view.selection||this.view.rowSelection)&&marked.length>1),target=this.target();
    if(!this.view.singleton){if(target&&!multiple)this.commands.enable("blade-results");else this.commands.disable("blade-results");}
    const parentRow=this.subviewTarget();
    if(this.view.subview){if(parentRow&&!multiple&&hasSubview(parentRow))this.commands.enable("blade-subview");else this.commands.disable("blade-subview");}
    for(const a of this.view.actions){if(a.name==="get"||(this.view.singleton&&a.name==="update"))continue;
      const bulkSelected=!this.delegated&&!!(a.bulk&&(this.view.selection||this.view.rowSelection)&&marked.length);
      const bulkAllowed=bulkSelected&&marked.length<=100&&marked.every(id=>this.rows.find(row=>String(row.id)===id)?._actions?.includes(a.name));
      if(a.name==="create"||a.upload||(bulkSelected?bulkAllowed:!multiple&&target?._actions?.includes(a.name)))this.commands.enable(a.name);else this.commands.disable(a.name);
    }
  }
  private createFilters(onCancel?:()=>void):Form{
    const form=new Form(document.createElement("div"),{padding:16,rows:[...this.view.filters.map(f=>({...input({...f,type:f.type==="checkbox"?"select":f.type,required:false},""),...(["select","checkbox"].includes(f.type)?{options:[{value:"",content:t("Bármely")},...Object.entries(f.options).map(([value,content])=>({value:"eq:"+value,content}))]}:{})})),{css:"blade-filter-actions",cols:[{type:"button",name:"apply",text:t("Szűrés"),icon:"dxi dxi-filter-variant",color:"primary",width:"content",padding:"0 8px 0 0"},{type:"button",name:"clear",text:t("Alaphelyzet"),icon:"dxi dxi-undo",view:"flat",color:"secondary",width:"content"},...(onCancel?[{type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"}]:[])]}]} as any);
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){onCancel?.();return;}
      if(name!=="apply"&&name!=="clear")return;
      if(name==="clear")form.clear();
      const values=form.getValue() as Record<string,string>;this.filterForm?.setValue(values);this.filters={};
      for(const f of this.view.filters){const v=String(values[f.name]??"");if(v!=="")this.filters[f.name]=["select","checkbox"].includes(f.type)?v.slice(3):v;}
      this.keepFilters();this.headerFilters();this.closeFilters();void this.load();
    });
    return form;
  }
  private mountFilters():void{
    this.filterForm=this.createFilters();this.layout.getCell("filter").attach(this.filterForm);
  }
  private resizeFilters():void{
    if(!this.filterForm)return;
    const mobile=innerWidth<768;
    if(mobile)this.commands.show("blade-filter");else this.commands.hide("blade-filter");
    if(mobile===this.mobile)return;
    this.mobile=mobile;
    const cell=this.layout.getCell("filter");
    if(mobile){this.filterWasVisible=cell.isVisible();cell.hide();}
    else{this.closeFilters();if(this.filterWasVisible)cell.show();}
  }
  private openFilters():void{
    if(!this.filterForm||!this.mobile)return;
    if(this.filterDialog){this.filterDialog.show();return;}
    const form=this.createFilters(()=>this.closeFilters());form.setValue(this.filterForm.getValue());
    const dialog=new Window({css:"blade-content-window",title:t("Szűrés"),width:Math.min(420,innerWidth-24),height:Math.min(600,innerHeight-24),modal:true,closable:true});
    this.filterDialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
    dialog.events.on("afterHide",()=>this.closeFilters());
  }
  private closeFilters():void{
    const dialog=this.filterDialog;if(!dialog)return;
    this.filterDialog=undefined;dialog.hide();
    void awaitRedraw().then(()=>dialog.destructor());
  }
  private async changeFilter(field:string,value:string):Promise<void>{
    if(this.disposed||!this.setFilter(field,value))return;
    this.keepFilters();await this.load();
  }
  private call(action:string,id:string|null=null,values:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{return this.request(this.view.resource,action,id,values,signal);}
  /** The JSON channel; another resource is the file manager of a `file` field (picker, upload target). */
  private request(resource:string,action:string,id:string|null=null,values:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{return server.call(resource,action,{id,values,signal});}
  private async error(e:unknown):Promise<void>{if(!this.disposed)await alert({header:t("Hiba"),severity:"danger",text:e && typeof e==="object" && "fieldErrors" in e && Object.values((e as any).fieldErrors??{}).length?Object.entries((e as any).fieldErrors).map(([name,error])=>`${this.view.actions.flatMap(a=>a.fields).find(f=>f.name===name)?.label??name}: ${error}`).join("\n"):e instanceof Error?e.message:t("Sikertelen művelet.")});}
  private resultNotice(result:any):void{
    if(result?.reveal){message({text:result.reveal.label+": "+result.reveal.value+(result.reveal.note?"\n\n"+result.reveal.note:""),css:"blade-toast",expire:10000});return;}
    if(result?.secret){message({text:t("Egyszer megjelenő API-token")+": "+result.secret,css:"blade-toast",expire:10000});return;}
    // A delete that cleared references (usage providers) says which and how many.
    const cleared=clearedText(result?.cleared);
    message({text:t("A művelet sikerült.")+(cleared?"\n"+cleared:""),css:"blade-toast",expire:cleared?8000:4000});
  }
  /**
   * Confirmation of an action that reports usages (`usages: true`): a `preview` of the same call (one
   * record, or `__bulk` for marks) sums the references; when there are any, one shared danger
   * confirmation lists them with the consequence, otherwise the declared confirmation applies. Marks
   * whose preview failed are counted in the confirmation, never silently dropped.
   */
  private async confirmedUsages(action:ActionDefinition,items:{id:string;values:Record<string,unknown>}[],bulk=false):Promise<boolean>{
    if(!action.usages)return this.confirmed(action,items.length);
    let usages:Usage[],failed=0;
    if(!bulk&&items.length===1)usages=mergeUsages([(await this.call(action.name,items[0].id,{...items[0].values,preview:"1"}))?.usages]);
    else{
      const preview:{id:string;ok:boolean;data?:{usages?:Usage[]}}[]=await this.call("__bulk",null,{operation:action.name,items:items.map(item=>({id:item.id,values:{...item.values,preview:"1"}}))});
      usages=mergeUsages(preview.filter(row=>row.ok).map(row=>row.data?.usages));
      failed=preview.filter(row=>!row.ok).length;
    }
    if(this.disposed)return false;
    const note=failed?t("{count} elem előnézete nem sikerült.",{count:failed}):"";
    const c=action.confirm;
    if(!usages.length){
      if(!note)return this.confirmed(action,items.length);
      const declared=c?c.message.replace("{count}",String(items.length)):t("{count} rekord törlődik.",{count:items.length});
      return requestConfirmation({message:declared+"\n\n"+note,title:c?.title,severity:c?.severity??"danger",confirmLabel:c?.confirmLabel??action.submitLabel,cancelLabel:c?.cancelLabel});
    }
    return confirmUsages({usages,title:c?.title,confirmLabel:c?.confirmLabel??action.submitLabel,cancelLabel:c?.cancelLabel,
      message:(c?c.message.replace("{count}",String(items.length)):t("{count} rekord törlődik.",{count:items.length}))+(note?"\n\n"+note:"")});
  }
  /** Server-declared confirmation (`Action::$confirm`); resolves false when the user cancels. */
  private confirmed(action:ActionDefinition,count=1):Promise<boolean>{
    const c=action.confirm;if(!c)return Promise.resolve(true);
    const fill=(text:string)=>text.replace("{count}",String(count));
    return requestConfirmation({message:fill(c.message),title:c.title,severity:c.severity??"neutral",confirmLabel:c.confirmLabel??action.submitLabel,cancelLabel:c.cancelLabel});
  }
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
    if(this.filterForm){
      const values=this.filterForm.getValue() as Record<string,string>;
      values[field]=value&&["select","checkbox"].includes(definition.type)?"eq:"+value:value;
      this.filterForm.setValue(values);
    }
    return true;
  }
  private headerFilters():void{this.gridHeaders?.setFilterValues(Object.fromEntries(Object.entries(this.filters).map(([field,value])=>[alias(field),value])));}
  private sortLabel():void{
    this.commands.data.update("blade-sort",{value:t("Rendezés: ")+escape(this.view.columns.find(column=>column.id===this.sort.field)?.header??(this.sort.field==="id"?"ID":this.sort.field))+(this.sort.direction==="asc"?" ↑":" ↓")});
  }
  private counts(data:Snapshot):void{
    // The server's total ignores filters; a nested view's records are its parent record's, so it counts the scoped match.
    const text=this.scope?typeof data.matched==="number"?t("Találat: {count}",{count:data.matched.toLocaleString(locale())}):"":typeof data.total==="number"?t("Összes: {count}",{count:data.total.toLocaleString(locale())})+(Object.keys(this.filters).length||this.search?" / "+t("Találat: {count}",{count:(data.matched??0).toLocaleString(locale())}):""):"";
    this.layout.getRootNode()?.style.setProperty("--blade-list-count",JSON.stringify(text));
  }
  private async load():Promise<boolean>{
    const epoch=++this.epoch;this.abort?.abort();this.abort=new AbortController();this.busy=true;
    try{
      if(this.view.singleton){const row=await this.call("get","self",{},this.abort.signal);if(this.disposed||epoch!==this.epoch)return false;this.rows=[row];this.selected=String(row.id);await this.mountDetail(row);}
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
    if(this.selected&&!this.selectedRow())this.selected=undefined;
    this.capabilities();await awaitRedraw();
    this.headerFilters();
    if(this.disposed)return;
    this.grid.restore(position,preserve,this.selected);
    this.rendering=false;
    this.fitPreview();
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
    this.detail=form;this.detailDirty=false;this.detailConflictShown=false;
    form.events.on("change",()=>{this.detailDirty=true;});
    if(action)this.bindSave(form,action,String(row.id),row,allowed,()=>{this.detailDirty=false;},()=>{void this.mountDetail(this.rows[0]??row);});
    this.layout.getCell("detail").attach(form);this.capabilities();
  }
  private async showResults(id:string):Promise<void>{
    const epoch=++this.resultsEpoch;
    this.results?.destructor();this.results=undefined;
    try{
      const row:Row=await this.call("get",id);
      if(this.disposed||epoch!==this.resultsEpoch)return;
      const dialog=new Window({css:"blade-content-window",title:escape(this.view.title+" — "+t("Adatok")+" · "+id),ariaLabel:t("Rekordadatok"),width:Math.min(680,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});
      this.results=dialog;
      dialog.attachHTML(`<article class="blade-record-details"><div class="blade-grid-card__id">ID · ${escapeRecord(row.id)}</div>${recordFields(row,presentedFields(withDerived(this.view.detailFields??this.view.columns,this.view.columns),this.view.columns))}</article>`);
      dialog.show();void fitWindow(dialog);
    }catch(error){await this.error(error);}
  }
  private async openBulk(action:ActionDefinition):Promise<void>{
    const ids=this.grid?.markedIds??[];if(!ids.length||ids.length>100)return;
    // A field-free bulk command must not open a window whose only control is
    // another Execute button. Forms remain for actions that need input.
    const commandOnly=action.name!=="create"&&action.name!=="update"&&action.fields.every(technical);
    if(commandOnly){await this.executeBulk(action,ids);return;}
    const epoch=++this.formEpoch;
    try{
      const schemas:{fields:FieldDefinition[];values:Row}[]=[];
      for(const id of ids)schemas.push(await this.call("__form",id,{operation:action.name}));
      if(this.disposed||epoch!==this.formEpoch)return;
      const eligible=(schema:{fields:FieldDefinition[]})=>schema.fields.filter(field=>field.name!=="revision"&&(action.name!=="update"||field.bulk));
      const fields=eligible(schemas[0]).filter(field=>schemas.every(schema=>eligible(schema).some((other:FieldDefinition)=>other.name===field.name)));
      if(schemas.some(schema=>eligible(schema).some((field:FieldDefinition)=>!fields.some(common=>common.name===field.name))))throw new Error(t("A sorok eltérő mezőjogosultságúak. Válassz azonos jogosultságú sorokat."));
      const form=new Form(document.createElement("div"),{padding:20,rows:[...fields.map(field=>input(field,undefined)),formActions({name:"submit",text:t("Végrehajtás ({count} sor)",{count:ids.length}),icon:actionIcon(action),color:"primary"})]} as any);
      this.dialog?.destructor();this.editor?.destructor();this.fileFields?.destroy();this.editor=form;
      this.fileFields=new FileFields(form,fields,this.resourceCall);
      const dialog=new Window({css:"blade-content-window",title:escape(action.label+" — "+ids.length+t(" sor")),width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true});this.dialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
      const validation=new FormValidation(form,fields);let saving=false;
      form.events.on("click",(name:string)=>{
        if(name==="cancel"){this.dialog=undefined;this.editor=undefined;dialog.hide();void awaitRedraw().then(()=>dialog.destructor());return;}
        if(name!=="submit"||saving||!validation.validate())return;saving=true;form.disable();
        const raw=form.getValue() as Record<string,unknown>;
        const values=Object.fromEntries(fields.map(field=>[field.name,raw[field.name]]));
        void this.confirmed(action,ids.length).then(ok=>ok?this.call("__bulk",null,{operation:action.name,items:ids.map((id,i)=>({id,values:{...values,...(schemas[i].fields.some((field:FieldDefinition)=>field.name==="revision")?{revision:schemas[i].values.revision}:{})}}))}):Promise.reject(DECLINED)).then(async(result:{id:string;ok:boolean;error?:string}[])=>{
          await awaitRedraw();if(this.disposed||this.editor!==form)return;dialog.destructor();this.dialog=undefined;this.editor=undefined;this.grid?.clearMarks();await this.load();
          message({text:t("Sikeres: {success}, sikertelen: {failed}.",{success:result.filter(row=>row.ok).length,failed:result.filter(row=>!row.ok).length})+result.filter(row=>!row.ok).map(row=>`\n${row.id}: ${row.error}`).join(""),css:"blade-toast",expire:10000});
        }).catch(error=>error===DECLINED?undefined:this.error(error)).finally(()=>{saving=false;if(!this.disposed&&this.editor===form)form.enable();});
      });
    }catch(error){await this.error(error);}
  }
  private async executeBulk(action:ActionDefinition,ids:string[]):Promise<void>{
    if(this.busy||this.disposed||!ids.length||ids.length>100)return;
    this.busy=true;
    try{
      const revisions:{fields:FieldDefinition[];values:Row}[]=[];
      if(action.fields.some(field=>field.name==="revision"))for(const id of ids)revisions.push(await this.call("__form",id,{operation:action.name}));
      const items=ids.map((id,index)=>({id,values:revisions[index]?.fields.some(field=>field.name==="revision")?{revision:revisions[index].values.revision}:{}}));
      if(!await this.confirmedUsages(action,items,true))return;
      const result:{id:string;ok:boolean;error?:string;data?:{cleared?:Record<string,number>}}[]=await this.call("__bulk",null,{operation:action.name,items});
      if(this.disposed)return;
      this.grid?.clearMarks();await this.load();
      const cleared=clearedText(...result.filter(row=>row.ok).map(row=>row.data?.cleared));
      message({text:t("Sikeres: {success}, sikertelen: {failed}.",{success:result.filter(row=>row.ok).length,failed:result.filter(row=>!row.ok).length})+(cleared?"\n"+cleared:"")+result.filter(row=>!row.ok).map(row=>`\n${row.id}: ${row.error}`).join(""),css:"blade-toast",expire:10000});
    }catch(error){if(error!==DECLINED)await this.error(error);}
    finally{this.busy=false;}
  }
  private async open(action:ActionDefinition):Promise<void>{
    const id=action.name==="create"?null:this.selected;if(action.name!=="create"&&!id)return;
    // Actions without inputs are commands, not forms. Execute them immediately
    // so a one-click operation does not open a dialog containing another button.
    const commandOnly=action.name!=="create"&&action.name!=="update"&&action.fields.every(technical);
    if(commandOnly){
      if(!id)return;
      await this.execute(action,id);
      return;
    }
    const epoch=++this.formEpoch;
    try{
      const schema=await this.call("__form",id??null,{operation:action.name});if(this.disposed||epoch!==this.formEpoch)return;
      const allowed=schema.fields as FieldDefinition[];
      const form=new Form(document.createElement("div"),{padding:20,rows:[...allowed.filter(f=>f.name!=="revision"&&f.name!==this.scope?.field).map(f=>input(f,f.type==="password"?"":schema.values[f.name])),formActions({name:"submit",text:action.submitLabel,icon:action.icon??"dxi dxi-content-save",color:"primary"})]} as any);
      this.dialog?.destructor();this.editor?.destructor();this.fileFields?.destroy();this.editor=form;
      const files=this.fileFields=new FileFields(form,allowed,this.resourceCall,[schema.values,id?this.rows.find(row=>String(row.id)===id):undefined]);
      const close=()=>{
        files.destroy();if(this.fileFields===files)this.fileFields=undefined;
        if(this.view.layout.formMode==="panel"&&!this.view.singleton){this.layout.getCell("form").detach();this.layout.getCell("form").collapse();}
        // Destroyed after the click that closes it: Suite 9.3.12 still fires the Form's events after the handler returns.
        else{const dialog=this.dialog;this.dialog=undefined;dialog?.hide();void awaitRedraw().then(()=>dialog?.destructor());}
        this.editor=undefined;
      };
      if(this.view.layout.formMode==="panel"&&!this.view.singleton){this.layout.getCell("form").expand();this.layout.getCell("form").attach(form);}
      else{
        const dialog=new Window({css:"blade-content-window",title:escape(this.view.title+" — "+action.label),ariaLabel:this.view.title+" — "+action.label,width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});this.dialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
        // Closing with the window's own close button also ends an open picker and a pending upload choice.
        dialog.events.on("afterHide",()=>{files.destroy();if(this.fileFields===files)this.fileFields=undefined;});
      }
      this.bindSave(form,action,id??null,schema.values,allowed,close,close);
    }catch(e){await this.error(e);}
  }
  /**
   * An upload action (`upload` policy, for example "upload as asset"): the shared uploader sends the files
   * to it; the list reloads once a batch has settled (live updates may show the rows earlier).
   */
  private openUpload(action:ActionDefinition):void{
    if(!action.upload||this.disposed)return;
    uploads.open({resource:this.view.resource,action:action.name,target:null,targetLabel:this.view.title,policy:action.upload,
      onUploaded:result=>{if(!this.disposed&&result.succeeded.length)void this.load();}});
  }
  private async execute(action:ActionDefinition,id:string):Promise<void>{
    if(this.busy||this.disposed)return;
    this.busy=true;
    try{
      const values=action.fields.some(field=>field.name==="revision")?{revision:this.selectedRow()?.revision}:{};
      if(!await this.confirmedUsages(action,[{id,values}]))return;
      const result=await this.call(action.name,id,values);
      if(this.disposed)return;
      this.resultNotice(result);
      await this.load();
    }catch(e){await this.error(e);}
    finally{this.busy=false;}
  }
  private bindSave(form:Form,action:ActionDefinition,id:string|null,current:Row,allowed:FieldDefinition[],complete:()=>void,cancel?:()=>void):void{
    let saving=false;
    const validation=new FormValidation(form,allowed.filter(f=>f.name!=="revision"&&f.name!==this.scope?.field));
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){cancel?.();return;}
      if(name!=="submit"||saving||!validation.validate())return;saving=true;form.disable();
      const raw=form.getValue() as Record<string,unknown>;const values:Record<string,unknown>={};
      for(const f of allowed)if(f.name!=="revision"&&raw[f.name]!==undefined)values[f.name]=raw[f.name];
      // A nested view's record belongs to its parent record: known, not editable, always sent as that record.
      if(this.scope&&allowed.some(f=>f.name===this.scope!.field)){values[this.scope.field]=this.scope.id;}
      if(allowed.some(f=>f.name==="revision"))values.revision=current.revision;
      void this.confirmed(action).then(ok=>ok?this.call(action.name,id,values):Promise.reject(DECLINED)).then(async result=>{
        await awaitRedraw();if(this.disposed)return;complete();
        this.resultNotice(result);
        if(result?.reauthenticate)location.reload();
      }).catch(e=>{if(e===DECLINED)return;if(!this.disposed&&!validation.showServerErrors(e.fieldErrors??{}))return this.error(e);}).finally(()=>{saving=false;if(!this.disposed&&(this.editor===form||this.detail===form))form.enable();});
    });
  }
  private revoke():void{this.fileFields?.destroy();this.fileFields=undefined;this.detailFiles?.destroy();this.cardEditor?.destructor();this.cardEditor=undefined;this.cellEditing=false;this.resultsEpoch++;this.results?.destructor();this.results=undefined;this.rows=[];this.grid?.setRows([]);this.detail?.clear();this.detail?.disable();this.editor?.clear();this.editor?.disable();this.dialog?.destructor();this.dialog=undefined;this.capabilities();}
  destroy():void{this.commands.disposeResponsive();this.disposed=true;clearTimeout(this.searchTimer);this.fileFields?.destroy();this.detailFiles?.destroy();
    // Suite 9.3.12 reads a destroyed vnode when a focused Toolbar input blurs during unmount.
    const focused=document.activeElement;if(focused instanceof HTMLElement&&this.searchBar?.getRootNode()?.contains(focused))focused.blur();
    this.cardEditor?.destructor();this.cardEditor=undefined;this.releaseIcons();this.resultsEpoch++;this.results?.destructor();window.removeEventListener("resize",this.resize);this.closeFilters();this.epoch++;this.formEpoch++;this.abort?.abort();this.live.destroy();this.dialog?.destructor();this.gridEditing?.destroy();this.gridHeaders?.destroy();this.grid?.destroy();this.fitObserver?.disconnect();this.layout.destructor();}
}

import { locale, t } from "./I18n";
import { ResponsiveToolbar } from "./ResponsiveToolbar";
import { fitWindow } from "./WindowSizing";
import { widgetIcons } from "./WidgetIcons";
import { UiPreferences } from "./UiPreferences";
import { Form, Layout, Window, message, awaitRedraw } from "@dhtmlx/suite";
import { alert, requestConfirmation, type DialogSeverity } from "./MessageDialog";
import { Realtime, type LiveConfig, type Row, type Snapshot } from "./Realtime";
import { GridHeaders, type Sort } from "./GridHeaders";
import { GridEditing } from "./GridEditing";
import { escape as escapeRecord, optionText, recordFields } from "./RecordPresentation";
import { ResponsiveGrid } from "./ResponsiveGrid";
import { FormValidation, type FieldDefinition } from "./FormValidation";

export type { FieldDefinition } from "./FormValidation";
export type ActionConfirmation={message:string;title?:string;severity?:DialogSeverity;confirmLabel?:string;cancelLabel?:string};
export type ActionDefinition={name:string;label:string;submitLabel:string;write:boolean;icon?:string;bulk?:boolean;confirm?:ActionConfirmation;fields:FieldDefinition[]};
const DECLINED=Symbol("declined");
const ACTION_ICONS:Record<string,string>={create:"dxi dxi-plus",update:"dxi dxi-pencil",delete:"dxi dxi-delete",password:"dxi dxi-key",get:"dxi dxi-information-outline"};
const actionIcon=(action:ActionDefinition)=>action.icon??ACTION_ICONS[action.name]??"dxi dxi-check";
type Region={id?:"filter"|"grid"|"form";header?:string;rows?:Region[];cols?:Region[];width?:number;height?:number;minWidth?:number;resizable?:boolean;collapsable?:boolean;collapsed?:boolean};
export type ViewDefinition={resource:string;title:string;icon?:string;desktopOnly?:boolean;rowNumbers?:boolean;selection?:boolean;rowSelection?:boolean;detailFields?:ViewDefinition["columns"];columns:{id:string;header:string;type?:string;options?:Record<string,string>;width?:number;minWidth?:number;maxWidth?:number;editable?:boolean;secondary?:boolean;align?:"left"|"center"|"right"}[];actions:ActionDefinition[];singleton:boolean;sortable?:string[];group?:string;filters:FieldDefinition[];layout:{formMode:"overlay"|"panel";tree:Region}};
const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const cursor=(row:Row,direction:string)=>btoa(Array.from(new TextEncoder().encode(JSON.stringify({...row._position,edge:String(row.id),direction})),byte=>String.fromCharCode(byte)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
export const input=(f:FieldDefinition,value:unknown,readOnly=false):any=>f.type==="multiselect"&&!readOnly?{
  // Native Suite Combo with multiple selection; the kernel accepts the list or its comma-joined form.
  type:"combo",name:f.name,label:f.label,labelPosition:"top",required:f.required,multiselection:true,selectAllButton:false,css:"blade-multiselect-field",
  data:Object.entries(f.options).map(([id,value])=>({id,value})),value:String(value??f.defaultValue??"").split(",").filter(Boolean),
}:f.type==="multiselect"?{type:"input",name:f.name,label:f.label,labelPosition:"top",readOnly:true,value:optionText(f,value)}:f.type==="checkbox"?{
  width:"100%",cols:[
    {type:"checkbox",name:f.name,text:f.label,width:"content",checked:String(value??f.defaultValue??"0")==="1"||value===true,disabled:readOnly},
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

  constructor(host:HTMLElement,private view:ViewDefinition,private csrf:string,live:LiveConfig,user=""){
    this.preferences=new UiPreferences(user,view.resource);
    this.sort=this.preferences.sort(view.sortable??[])??this.sort;
    const secondaryColumns=view.columns.filter(column=>column.secondary);
    const secondary=secondaryColumns.map(column=>column.id);
    this.visibleColumns=this.preferences.visibleColumns(secondary);
    const region=(node:Region):any=>({...node,header:node.id==="grid"?escape(view.title):node.header?escape(node.header):undefined,
      ...(node.id==="grid"?{headerIcon:"blade-list-count",css:"blade-list-panel"}:{}),
      ...(node.rows?{rows:node.rows.map(region)}:{}),...(node.cols?{cols:node.cols.map(region)}:{})});
    this.layout=new Layout(host,{type:"space",...(view.singleton
      ?{rows:[{id:"body",header:escape(view.title),rows:[{id:"commands",height:48,css:"blade-command-row"},{id:"detail"}]}]}
      :region(this.preferences.layoutTree(view.layout.tree)))});
    if(!view.singleton)this.preferences.bindLayout(this.layout,view.layout.tree);
    this.commands=new ResponsiveToolbar(undefined,{data:[...(!view.singleton?[{id:"blade-results",value:t("Adatok"),icon:"dxi dxi-information-outline"}]:[]),...(!view.singleton&&this.hasRegion("filter")?[{id:"blade-filter",value:t("Szűrés"),icon:"dxi dxi-filter-variant"}]:[]),...view.actions.filter(a=>a.name!=="get"&&!(view.singleton&&a.name==="update")).map(a=>({id:a.name,value:escape(a.label),icon:actionIcon(a)})),...(!view.singleton?[{type:"spacer"},{id:"blade-sort",value:t("Rendezés"),hidden:true,icon:"dxi dxi-sort",items:(view.sortable??[]).flatMap(field=>["asc","desc"].map(direction=>({id:"blade-sort:"+field+":"+direction,value:escape((view.columns.find(column=>column.id===field)?.header??(field==="id"?"ID":field))+ (direction==="asc"?" ↑":" ↓")),icon:direction==="asc"?"dxi dxi-arrow-up":"dxi dxi-arrow-down"})))},...(secondaryColumns.length?[{id:"blade-columns",value:t("Oszlopok"),icon:"dxi dxi-table-check",items:secondaryColumns.map(column=>{const active=this.visibleColumns.has(column.id);return {id:"blade-column:"+column.id,value:escape(column.header),icon:active?"dxi dxi-checkbox-marked":"dxi dxi-checkbox-blank-outline",twoState:true,active};})}]:[]),{id:"blade-view",value:t("Nézet: Táblázat"),icon:"dxi dxi-table-check",items:[{id:"blade-table",value:t("Táblázat"),icon:"dxi dxi-table-check"},{id:"blade-cards",value:t("Kártyák"),icon:"dxi dxi-view-grid"}]}]:[])]});
    this.commands.events.on("click",(id:string|number)=>{if(String(id).startsWith("blade-column:")){const column=String(id).slice("blade-column:".length),visible=!this.visibleColumns.has(column);if(visible)this.visibleColumns.add(column);else this.visibleColumns.delete(column);this.grid?.setColumnVisible(column,visible);this.preferences.setVisibleColumns(this.visibleColumns);this.commands.data.update(String(id),{active:visible,icon:visible?"dxi dxi-checkbox-marked":"dxi dxi-checkbox-blank-outline"});return;}if(String(id).startsWith("blade-sort:")){const [,field,direction]=String(id).split(":");void this.changeSort({field,direction:direction as "asc"|"desc"});return;}if(id==="blade-table"||id==="blade-cards"){const mode=id==="blade-table"?"table":"cards";this.grid?.setMode(mode);this.preferences.setMode(mode);return;}if(id==="blade-filter"){this.openFilters();return;}if(id==="blade-results"){if(this.selected&&!((view.selection||view.rowSelection)&&(this.grid?.markedIds.length??0)>1))void this.showResults(this.selected);return;}const action=view.actions.find(a=>a.name===id);if(action){const marked=this.grid?.markedIds??[];if(action.bulk&&(view.selection||view.rowSelection)&&marked.length)void this.openBulk(action);else if(action.name==="create"||marked.length<=1||!(view.selection||view.rowSelection))void this.open(action);}});
    if(view.singleton)this.layout.getCell("commands").attach(this.commands);
    else{
      this.content=new Layout(document.createElement("div"),{type:"none",css:"blade-grid-content",rows:[{id:"commands",height:48,css:"blade-command-row"},{id:"data"}]});
      this.content.getCell("commands").attach(this.commands);
      const dataHost=document.createElement("div");
      this.grid=new ResponsiveGrid(dataHost,view.columns,()=>this.rows,(id)=>{
        this.selected=id;this.capabilities();
      },()=>{
        const action=view.actions.find(a=>a.name==="update");
        if(action&&this.selectedRow()?._actions?.includes("update"))void this.open(action);
        else if(this.selected)void this.showResults(this.selected);
      },direction=>{if(!this.rendering&&!this.busy&&!this.disposed)void this.more(direction);},(cards,mobile)=>{
        if(cards&&(view.sortable??[]).length)this.commands.show("blade-sort");else this.commands.hide("blade-sort");
        this.commands.data.update("blade-view",{value:cards?t("Nézet: Kártyák"):t("Nézet: Táblázat"),icon:cards?"dxi dxi-view-grid":"dxi dxi-table-check"});
        if(mobile)this.commands.disable("blade-view");else this.commands.enable("blade-view");
        if(cards||mobile)this.commands.disable("blade-cards");else this.commands.enable("blade-cards");
        if(!cards||mobile)this.commands.disable("blade-table");else this.commands.enable("blade-table");
      },{rowNumbers:view.rowNumbers,selection:view.selection,rowSelection:view.rowSelection,fields:view.detailFields??view.columns,filters:view.filters,details:id=>void this.showResults(id),marked:()=>this.capabilities(),edit:(id,field)=>void this.editCard(id,field)});
      this.sortLabel();
      this.gridHeaders=new GridHeaders(this.grid.table,view.columns,view.sortable??[],sort=>void this.changeSort(sort),view.filters, (field,value)=>void this.changeFilter(field,value));
      this.gridHeaders.setSort(this.sort);
      this.gridHeaders.setFilterValues(this.filters);
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
    this.live=new Realtime(view.resource,live,this.call.bind(this),data=>void this.changed(data),()=>{},()=>this.revoke());
    this.capabilities();void this.load();
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
  private hasRegion(id:string):boolean{
    const find=(node:Region):boolean=>node.id===id||[...(node.rows??[]),...(node.cols??[])].some(find);return find(this.view.layout.tree);
  }
  private selectedRow():Row|undefined{return this.rows.find(r=>String(r.id)===this.selected);}
  private capabilities():void{
    const marked=this.grid?.markedIds??[];
    // Several marks make single-record commands ambiguous: only bulk-capable actions and create stay available.
    const multiple=!!((this.view.selection||this.view.rowSelection)&&marked.length>1);
    if(!this.view.singleton){if(this.selectedRow()&&!multiple)this.commands.enable("blade-results");else this.commands.disable("blade-results");}
    for(const a of this.view.actions){if(a.name==="get"||(this.view.singleton&&a.name==="update"))continue;
      const bulkSelected=!!(a.bulk&&(this.view.selection||this.view.rowSelection)&&marked.length);
      const bulkAllowed=bulkSelected&&marked.length<=100&&marked.every(id=>this.rows.find(row=>String(row.id)===id)?._actions?.includes(a.name));
      if(a.name==="create"||(bulkSelected?bulkAllowed:!multiple&&this.selectedRow()?._actions?.includes(a.name)))this.commands.enable(a.name);else this.commands.disable(a.name);
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
      this.gridHeaders?.setFilterValues(this.filters);this.closeFilters();void this.load();
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
    if(this.disposed)return;
    const definition=this.view.filters.find(filter=>filter.name===field);if(!definition)return;
    if(value)this.filters[field]=value;else delete this.filters[field];
    if(this.filterForm){
      const values=this.filterForm.getValue() as Record<string,string>;
      values[field]=value&&["select","checkbox"].includes(definition.type)?"eq:"+value:value;
      this.filterForm.setValue(values);
    }
    await this.load();
  }
  private async call(action:string,id:string|null=null,values:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{
    const endpoint=new URL(location.href);endpoint.hash="";endpoint.search="?blade=1";
    const r=await fetch(endpoint,{method:"POST",credentials:"same-origin",signal,headers:{"Content-Type":"application/json","X-BLADE-CSRF":this.csrf},body:JSON.stringify({resource:this.view.resource,action,id,values})});
    const result=await r.json();if(!r.ok||!result.ok)throw Object.assign(new Error(result.error||t("Sikertelen művelet.")),{status:r.status,fieldErrors:result.fieldErrors});return result.data;
  }
  private async error(e:unknown):Promise<void>{if(!this.disposed)await alert({header:t("Hiba"),severity:"danger",text:e && typeof e==="object" && "fieldErrors" in e && Object.values((e as any).fieldErrors??{}).length?Object.entries((e as any).fieldErrors).map(([name,error])=>`${this.view.actions.flatMap(a=>a.fields).find(f=>f.name===name)?.label??name}: ${error}`).join("\n"):e instanceof Error?e.message:t("Sikertelen művelet.")});}
  private resultNotice(result:any):void{
    if(result?.reveal){message({text:result.reveal.label+": "+result.reveal.value+(result.reveal.note?"\n\n"+result.reveal.note:""),css:"blade-toast",expire:10000});return;}
    if(result?.secret){message({text:t("Egyszer megjelenő API-token")+": "+result.secret,css:"blade-toast",expire:10000});return;}
    message({text:t("A művelet sikerült."),css:"blade-toast",expire:4000});
  }
  /** Server-declared confirmation (`Action::$confirm`); resolves false when the user cancels. */
  private confirmed(action:ActionDefinition,count=1):Promise<boolean>{
    const c=action.confirm;if(!c)return Promise.resolve(true);
    const fill=(text:string)=>text.replace("{count}",String(count));
    return requestConfirmation({message:fill(c.message),title:c.title,severity:c.severity??"neutral",confirmLabel:c.confirmLabel??action.submitLabel,cancelLabel:c.cancelLabel});
  }
  private watch():void{this.live.subscribe({numbered:this.view.rowNumbers!==false,sort:this.sort,anchor:this.rows[0]?cursor(this.rows[0],"next"):null,limit:Math.max(100,this.rows.length),first:this.rows[0]?.id??null,front:this.previous===null,filters:this.filters});}
  private async changeSort(sort:Sort):Promise<void>{
    if(this.busy||this.cellEditing||this.disposed)return;
    const previous=this.sort;this.sort=sort;this.sortLabel();this.gridHeaders?.setSort(sort);
    const operation=this.epoch+1;
    if(await this.load()){this.preferences.setSort(this.sort);}else if(operation===this.epoch&&!this.disposed){this.sort=previous;this.sortLabel();this.gridHeaders?.setSort(previous);this.watch();}
  }
  private sortLabel():void{
    this.commands.data.update("blade-sort",{value:t("Rendezés: ")+escape(this.view.columns.find(column=>column.id===this.sort.field)?.header??(this.sort.field==="id"?"ID":this.sort.field))+(this.sort.direction==="asc"?" ↑":" ↓")});
  }
  private counts(data:Snapshot):void{
    const text=typeof data.total==="number"?t("Összes: {count}",{count:data.total.toLocaleString(locale())})+(Object.keys(this.filters).length?" / "+t("Találat: {count}",{count:(data.matched??0).toLocaleString(locale())}):""):"";
    this.layout.getRootNode()?.style.setProperty("--blade-list-count",JSON.stringify(text));
  }
  private async load():Promise<boolean>{
    const epoch=++this.epoch;this.abort?.abort();this.abort=new AbortController();this.busy=true;
    try{
      if(this.view.singleton){const row=await this.call("get","self",{},this.abort.signal);if(this.disposed||epoch!==this.epoch)return false;this.rows=[row];this.selected=String(row.id);await this.mountDetail(row);}
      else{
        const data:Snapshot=await this.call("list",null,{mode:"dynamic",numbered:this.view.rowNumbers!==false,limit:100,sort:this.sort,filters:this.filters},this.abort.signal);
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
      const data:Snapshot=await this.call("list",null,{mode:"dynamic",numbered:this.view.rowNumbers!==false,limit:100,cursor:token,sort:this.sort,filters:this.filters});
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
    this.gridHeaders?.setFilterValues(this.filters);
    this.rows=rows;
    if(this.selected&&!this.selectedRow())this.selected=undefined;
    this.capabilities();await awaitRedraw();
    this.gridHeaders?.setFilterValues(this.filters);
    if(this.disposed)return;
    this.grid.restore(position,preserve,this.selected);
    this.rendering=false;
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
    const fields=this.view.columns.map(c=>allowed.find(f=>f.name===c.id)||{name:c.id,label:c.header,type:"text",required:false,max:255,options:{}});
    const form=new Form(document.createElement("div"),{padding:24,rows:[...fields.map(f=>input(f,row[f.name],!allowed.some(a=>a.name===f.name))),...(action?[formActions({name:"submit",text:t("Mentés"),icon:"dxi dxi-content-save",color:"primary"})]:[])]} as any);
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
      dialog.attachHTML(`<article class="blade-record-details"><div class="blade-grid-card__id">ID · ${escapeRecord(row.id)}</div>${recordFields(row,this.view.detailFields??this.view.columns)}</article>`);
      dialog.show();void fitWindow(dialog);
    }catch(error){await this.error(error);}
  }
  private async openBulk(action:ActionDefinition):Promise<void>{
    const ids=this.grid?.markedIds??[];if(!ids.length||ids.length>100)return;
    // A field-free bulk command must not open a window whose only control is
    // another Execute button. Forms remain for actions that need input.
    const commandOnly=action.name!=="create"&&action.name!=="update"&&action.fields.every(field=>field.name==="revision");
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
      this.dialog?.destructor();this.editor?.destructor();this.editor=form;
      const dialog=new Window({css:"blade-content-window",title:escape(action.label+" — "+ids.length+t(" sor")),width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true});this.dialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
      const validation=new FormValidation(form,fields);let saving=false;
      form.events.on("click",(name:string)=>{
        if(name==="cancel"){dialog.destructor();this.dialog=undefined;this.editor=undefined;return;}
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
      if(!await this.confirmed(action,ids.length))return;
      const result:{id:string;ok:boolean;error?:string}[]=await this.call("__bulk",null,{operation:action.name,items:ids.map((id,index)=>({id,values:revisions[index]?.fields.some(field=>field.name==="revision")?{revision:revisions[index].values.revision}:{}}))});
      if(this.disposed)return;
      this.grid?.clearMarks();await this.load();
      message({text:t("Sikeres: {success}, sikertelen: {failed}.",{success:result.filter(row=>row.ok).length,failed:result.filter(row=>!row.ok).length})+result.filter(row=>!row.ok).map(row=>`\n${row.id}: ${row.error}`).join(""),css:"blade-toast",expire:10000});
    }catch(error){if(error!==DECLINED)await this.error(error);}
    finally{this.busy=false;}
  }
  private async open(action:ActionDefinition):Promise<void>{
    const id=action.name==="create"?null:this.selected;if(action.name!=="create"&&!id)return;
    // Actions without inputs are commands, not forms. Execute them immediately
    // so a one-click operation does not open a dialog containing another button.
    const commandOnly=action.name!=="create"&&action.name!=="update"&&action.fields.every(field=>field.name==="revision");
    if(commandOnly){
      if(!id)return;
      await this.execute(action,id);
      return;
    }
    const epoch=++this.formEpoch;
    try{
      const schema=await this.call("__form",id??null,{operation:action.name});if(this.disposed||epoch!==this.formEpoch)return;
      const allowed=schema.fields as FieldDefinition[];
      const form=new Form(document.createElement("div"),{padding:20,rows:[...allowed.filter(f=>f.name!=="revision").map(f=>input(f,f.type==="password"?"":schema.values[f.name])),formActions({name:"submit",text:action.submitLabel,icon:action.icon??"dxi dxi-content-save",color:"primary"})]} as any);
      this.dialog?.destructor();this.editor?.destructor();this.editor=form;
      const close=()=>{
        if(this.view.layout.formMode==="panel"&&!this.view.singleton){this.layout.getCell("form").detach();this.layout.getCell("form").collapse();}
        else{this.dialog?.destructor();this.dialog=undefined;}
        this.editor=undefined;
      };
      if(this.view.layout.formMode==="panel"&&!this.view.singleton){this.layout.getCell("form").expand();this.layout.getCell("form").attach(form);}
      else{
        const dialog=new Window({css:"blade-content-window",title:escape(this.view.title+" — "+action.label),ariaLabel:this.view.title+" — "+action.label,width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});this.dialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
      }
      this.bindSave(form,action,id??null,schema.values,allowed,close,close);
    }catch(e){await this.error(e);}
  }
  private async execute(action:ActionDefinition,id:string):Promise<void>{
    if(this.busy||this.disposed)return;
    this.busy=true;
    try{
      if(!await this.confirmed(action))return;
      const values=action.fields.some(field=>field.name==="revision")?{revision:this.selectedRow()?.revision}:{};
      const result=await this.call(action.name,id,values);
      if(this.disposed)return;
      this.resultNotice(result);
      await this.load();
    }catch(e){await this.error(e);}
    finally{this.busy=false;}
  }
  private bindSave(form:Form,action:ActionDefinition,id:string|null,current:Row,allowed:FieldDefinition[],complete:()=>void,cancel?:()=>void):void{
    let saving=false;
    const validation=new FormValidation(form,allowed.filter(f=>f.name!=="revision"));
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){cancel?.();return;}
      if(name!=="submit"||saving||!validation.validate())return;saving=true;form.disable();
      const raw=form.getValue() as Record<string,unknown>;const values:Record<string,unknown>={};
      for(const f of allowed)if(f.name!=="revision"&&raw[f.name]!==undefined)values[f.name]=raw[f.name];
      if(allowed.some(f=>f.name==="revision"))values.revision=current.revision;
      void this.confirmed(action).then(ok=>ok?this.call(action.name,id,values):Promise.reject(DECLINED)).then(async result=>{
        await awaitRedraw();if(this.disposed)return;complete();
        this.resultNotice(result);
        if(result?.reauthenticate)location.reload();
      }).catch(e=>{if(e===DECLINED)return;if(!this.disposed&&!validation.showServerErrors(e.fieldErrors??{}))return this.error(e);}).finally(()=>{saving=false;if(!this.disposed&&(this.editor===form||this.detail===form))form.enable();});
    });
  }
  private revoke():void{this.cardEditor?.destructor();this.cardEditor=undefined;this.cellEditing=false;this.resultsEpoch++;this.results?.destructor();this.results=undefined;this.rows=[];this.grid?.setRows([]);this.detail?.clear();this.detail?.disable();this.editor?.clear();this.editor?.disable();this.dialog?.destructor();this.dialog=undefined;this.capabilities();}
  destroy():void{this.commands.disposeResponsive();this.disposed=true;this.cardEditor?.destructor();this.cardEditor=undefined;this.releaseIcons();this.resultsEpoch++;this.results?.destructor();window.removeEventListener("resize",this.resize);this.closeFilters();this.epoch++;this.formEpoch++;this.abort?.abort();this.live.destroy();this.dialog?.destructor();this.gridEditing?.destroy();this.gridHeaders?.destroy();this.grid?.destroy();this.layout.destructor();}
}

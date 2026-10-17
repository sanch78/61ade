import { widgetIcons } from "./WidgetIcons";
import { UiPreferences } from "./UiPreferences";
import { Form, Layout, Toolbar, Window, alert, message, awaitRedraw } from "@dhtmlx/suite";
import { Realtime, type LiveConfig, type Row, type Snapshot } from "./Realtime";
import { GridHeaders, type Sort } from "./GridHeaders";
import { GridEditing } from "./GridEditing";
import { escape as escapeRecord, recordFields } from "./RecordPresentation";
import { ResponsiveGrid } from "./ResponsiveGrid";
import { FormValidation, type FieldDefinition } from "./FormValidation";

export type { FieldDefinition } from "./FormValidation";
export type ActionDefinition={name:string;label:string;submitLabel:string;write:boolean;icon?:string;bulk?:boolean;fields:FieldDefinition[]};
type Region={id?:"filter"|"grid"|"form";header?:string;rows?:Region[];cols?:Region[];width?:number;height?:number;minWidth?:number;resizable?:boolean;collapsable?:boolean;collapsed?:boolean};
export type ViewDefinition={resource:string;title:string;rowNumbers?:boolean;selection?:boolean;detailFields?:ViewDefinition["columns"];columns:{id:string;header:string;type?:string;options?:Record<string,string>;width?:number;minWidth?:number;maxWidth?:number;editable?:boolean;align?:"left"|"center"|"right"}[];actions:ActionDefinition[];singleton:boolean;sortable?:string[];group?:string;filters:FieldDefinition[];layout:{formMode:"overlay"|"panel";tree:Region}};
const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const cursor=(row:Row,direction:string)=>btoa(Array.from(new TextEncoder().encode(JSON.stringify({...row._position,edge:String(row.id),direction})),byte=>String.fromCharCode(byte)).join("")).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const input=(f:FieldDefinition,value:unknown,readOnly=false):any=>f.type==="checkbox"?{
  type:"checkbox",name:f.name,label:f.label,labelPosition:"left",labelWidth:260,checked:String(value??f.defaultValue??"0")==="1"||value===true,disabled:readOnly,
}:({
  type:readOnly?"input":f.type==="select"?"select":f.type==="textarea"?"textarea":"input",
  name:f.name,label:f.label,labelPosition:"top",required:!readOnly&&f.required,maxlength:f.max,
  inputType:f.type==="password"?"password":"text",readOnly,
  ...(!readOnly&&f.type==="select"?{options:Object.entries(f.options).map(([value,content])=>({value,content}))}:{}),
  value:f.type==="password"?"":String(value??f.defaultValue??(f.type==="select"&&!readOnly?Object.keys(f.options)[0]??"":"")),
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
  private commands:Toolbar;
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

  constructor(host:HTMLElement,private view:ViewDefinition,private csrf:string,live:LiveConfig,user=""){
    this.preferences=new UiPreferences(user,view.resource);
    this.sort=this.preferences.sort(view.sortable??[])??this.sort;
    const region=(node:Region):any=>({...node,header:node.header?escape(node.header):undefined,
      ...(node.rows?{rows:node.rows.map(region)}:{}),...(node.cols?{cols:node.cols.map(region)}:{})});
    this.layout=new Layout(host,{type:"space",...(view.singleton
      ?{rows:[{id:"body",header:escape(view.title),rows:[{id:"commands",height:48,css:"vapa-command-row"},{id:"detail"}]}]}
      :region(this.preferences.layoutTree(view.layout.tree)))});
    if(!view.singleton)this.preferences.bindLayout(this.layout,view.layout.tree);
    this.commands=new Toolbar(undefined,{data:[...(!view.singleton?[{id:"vapa-results",value:"Adatok",icon:"dxi dxi-information-outline"}]:[]),...(!view.singleton&&this.hasRegion("filter")?[{id:"vapa-filter",value:"Szűrés",icon:"dxi dxi-filter-variant"}]:[]),...(!view.singleton?[{id:"title",type:"title",value:escape(view.title)}]:[]),...view.actions.filter(a=>a.name!=="get"&&!(view.singleton&&a.name==="update")).flatMap(a=>[{id:a.name,value:escape(a.label),icon:a.icon??({create:"dxi dxi-plus",update:"dxi dxi-pencil",delete:"dxi dxi-delete",password:"dxi dxi-key"}[a.name]??"dxi dxi-pencil")},...(view.selection&&a.bulk?[{id:"bulk:"+a.name,value:escape(a.label+" — jelöltek"),icon:a.icon??"dxi dxi-check"}]:[])]),...(!view.singleton?[{type:"spacer"},{id:"vapa-view",value:"Nézet: Táblázat",icon:"dxi dxi-table-check",items:[{id:"vapa-table",value:"Táblázat",icon:"dxi dxi-table-check"},{id:"vapa-cards",value:"Kártyák",icon:"dxi dxi-view-grid"}]}]:[])]});
    this.commands.events.on("click",(id:string|number)=>{if(id==="vapa-table"||id==="vapa-cards"){const mode=id==="vapa-table"?"table":"cards";this.grid?.setMode(mode);this.preferences.setMode(mode);return;}if(id==="vapa-filter"){this.openFilters();return;}if(id==="vapa-results"){if(this.selected)void this.showResults(this.selected);return;}if(String(id).startsWith("bulk:")){const action=view.actions.find(a=>"bulk:"+a.name===id);if(action)void this.openBulk(action);return;}const action=view.actions.find(a=>a.name===id);if(action)void this.open(action);});
    if(view.singleton)this.layout.getCell("commands").attach(this.commands);
    else{
      this.content=new Layout(document.createElement("div"),{type:"none",css:"vapa-grid-content",rows:[{id:"commands",height:48,css:"vapa-command-row"},{id:"data"}]});
      this.content.getCell("commands").attach(this.commands);
      const dataHost=document.createElement("div");
      this.grid=new ResponsiveGrid(dataHost,view.columns,()=>this.rows,(id)=>{
        this.selected=id;this.capabilities();
      },()=>{
        const action=view.actions.find(a=>a.name==="update");
        if(action&&this.selectedRow()?._actions?.includes("update"))void this.open(action);
      },direction=>{if(!this.rendering&&!this.busy&&!this.disposed)void this.more(direction);},(cards,mobile)=>{
        this.commands.data.update("vapa-view",{value:cards?"Nézet: Kártyák":"Nézet: Táblázat",icon:cards?"dxi dxi-view-grid":"dxi dxi-table-check"});
        if(mobile)this.commands.disable("vapa-view");else this.commands.enable("vapa-view");
        if(cards||mobile)this.commands.disable("vapa-cards");else this.commands.enable("vapa-cards");
        if(!cards||mobile)this.commands.disable("vapa-table");else this.commands.enable("vapa-table");
      },{rowNumbers:view.rowNumbers,selection:view.selection,fields:view.detailFields??view.columns,details:id=>void this.showResults(id),marked:()=>this.capabilities()});
      this.gridHeaders=new GridHeaders(this.grid.table,view.columns,view.sortable??[],sort=>void this.changeSort(sort));
      this.gridHeaders.setSort(this.sort);
      this.preferences.bindGrid(this.grid.table);
      this.grid.setMode(this.preferences.mode);
      this.gridEditing=new GridEditing(this.grid.table,view.actions.find(a=>a.name==="update")?.fields??[],()=>this.rows,
        async(row,field,value)=>{
          const result=await this.call("__edit",String(row.id),{field,value,revision:row.revision});
          if(this.disposed)return;
          if(result.reauthenticate){location.reload();return;}
          if(this.sort.field===field){await this.load();return;}
          await this.render(this.rows.map(item=>String(item.id)===String(row.id)?{...item,...result.values,revision:result.revision}:item),true);
        },error=>this.error(error),active=>{this.cellEditing=active;if(!active&&!this.disposed)this.watch();});
      this.content.getCell("data").attach(this.grid.layout);
      this.layout.getCell("grid").attach(this.content);
      if(this.hasRegion("filter"))this.mountFilters();
    }
    window.addEventListener("resize",this.resize);this.resizeFilters();
    this.live=new Realtime(view.resource,live,this.call.bind(this),data=>void this.changed(data),()=>{},()=>this.revoke());
    this.capabilities();void this.load();
  }
  private hasRegion(id:string):boolean{
    const find=(node:Region):boolean=>node.id===id||[...(node.rows??[]),...(node.cols??[])].some(find);return find(this.view.layout.tree);
  }
  private selectedRow():Row|undefined{return this.rows.find(r=>String(r.id)===this.selected);}
  private capabilities():void{
    if(!this.view.singleton){if(this.selectedRow())this.commands.enable("vapa-results");else this.commands.disable("vapa-results");}
    for(const action of this.view.actions.filter(a=>a.bulk&&this.view.selection)){
      const ids=this.grid?.markedIds??[];
      if(ids.length&&ids.length<=100&&ids.every(id=>this.rows.find(row=>String(row.id)===id)?._actions?.includes(action.name)))this.commands.enable("bulk:"+action.name);else this.commands.disable("bulk:"+action.name);
    }
    for(const a of this.view.actions){if(a.name==="get"||(this.view.singleton&&a.name==="update"))continue;
      if(a.name==="create"||this.selectedRow()?._actions?.includes(a.name))this.commands.enable(a.name);else this.commands.disable(a.name);
    }
  }
  private mountFilters():void{
    const form=new Form(document.createElement("div"),{padding:16,rows:[...this.view.filters.map(f=>({...input({...f,type:f.type==="checkbox"?"select":f.type,required:false},""),...(["select","checkbox"].includes(f.type)?{options:[{value:"",content:"Bármely"},...Object.entries(f.options).map(([value,content])=>({value:"eq:"+value,content}))]}:{})})),{type:"button",name:"apply",text:"Szűrés",icon:"dxi dxi-filter-variant",color:"primary"},{type:"button",name:"clear",text:"Alaphelyzet",icon:"dxi dxi-undo",view:"flat",color:"secondary"}]} as any);
    form.events.on("click",(name:string)=>{
      if(name!=="apply"&&name!=="clear")return;
      if(name==="clear")form.clear();
      const values=form.getValue() as Record<string,string>;this.filters={};
      for(const f of this.view.filters){const v=String(values[f.name]??"");if(v!=="")this.filters[f.name]=["select","checkbox"].includes(f.type)?v.slice(3):v;}
      this.closeFilters();void this.load();
    });
    this.filterForm=form;this.layout.getCell("filter").attach(form);
  }
  private resizeFilters():void{
    if(!this.filterForm)return;
    const mobile=innerWidth<768;
    if(mobile)this.commands.show("vapa-filter");else this.commands.hide("vapa-filter");
    if(mobile===this.mobile)return;
    this.mobile=mobile;
    const cell=this.layout.getCell("filter");
    if(mobile){this.filterWasVisible=cell.isVisible();cell.hide();}
    else{this.closeFilters();if(this.filterWasVisible)cell.show();}
  }
  private openFilters():void{
    if(!this.filterForm||!this.mobile)return;
    if(this.filterDialog){this.filterDialog.show();return;}
    this.layout.getCell("filter").detach();
    const dialog=new Window({title:"Szűrés",width:Math.min(420,innerWidth-24),height:Math.min(600,innerHeight-24),modal:true,closable:true});
    this.filterDialog=dialog;dialog.attach(this.filterForm);dialog.show();
    dialog.events.on("afterHide",()=>this.closeFilters());
  }
  private closeFilters():void{
    const dialog=this.filterDialog;if(!dialog)return;
    this.filterDialog=undefined;dialog.attachHTML("");dialog.destructor();
    if(this.filterForm)this.layout.getCell("filter").attach(this.filterForm);
  }
  private async call(action:string,id:string|null=null,values:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{
    const endpoint=new URL(location.href);endpoint.hash="";endpoint.search="?vapa=1";
    const r=await fetch(endpoint,{method:"POST",credentials:"same-origin",signal,headers:{"Content-Type":"application/json","X-VAPA-CSRF":this.csrf},body:JSON.stringify({resource:this.view.resource,action,id,values})});
    const result=await r.json();if(!r.ok||!result.ok)throw Object.assign(new Error(result.error||"Sikertelen művelet."),{status:r.status,fieldErrors:result.fieldErrors});return result.data;
  }
  private async error(e:unknown):Promise<void>{if(!this.disposed)await alert({header:"Hiba",text:e && typeof e==="object" && "fieldErrors" in e && Object.values((e as any).fieldErrors??{}).length?Object.entries((e as any).fieldErrors).map(([name,error])=>`${this.view.actions.flatMap(a=>a.fields).find(f=>f.name===name)?.label??name}: ${error}`).join("\n"):e instanceof Error?e.message:"Sikertelen művelet.",htmlEnable:false});}
  private watch():void{this.live.subscribe({numbered:this.view.rowNumbers!==false,sort:this.sort,anchor:this.rows[0]?cursor(this.rows[0],"next"):null,limit:Math.max(100,this.rows.length),first:this.rows[0]?.id??null,front:this.previous===null,filters:this.filters});}
  private async changeSort(sort:Sort):Promise<void>{
    if(this.busy||this.cellEditing||this.disposed)return;
    const previous=this.sort;this.sort=sort;this.gridHeaders?.setSort(sort);
    const operation=this.epoch+1;
    if(await this.load()){this.preferences.setSort(this.sort);}else if(operation===this.epoch&&!this.disposed){this.sort=previous;this.gridHeaders?.setSort(previous);this.watch();}
  }
  private async load():Promise<boolean>{
    const epoch=++this.epoch;this.abort?.abort();this.abort=new AbortController();this.busy=true;
    try{
      if(this.view.singleton){const row=await this.call("get","self",{},this.abort.signal);if(this.disposed||epoch!==this.epoch)return false;this.rows=[row];this.selected=String(row.id);await this.mountDetail(row);}
      else{
        const data:Snapshot=await this.call("list",null,{mode:"dynamic",numbered:this.view.rowNumbers!==false,limit:100,sort:this.sort,filters:this.filters},this.abort.signal);
        if(this.disposed||epoch!==this.epoch)return false;this.previous=data.previous;this.next=data.next;await this.render(data.items,false);
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
    this.rows=rows;
    if(this.selected&&!this.selectedRow())this.selected=undefined;
    this.capabilities();await awaitRedraw();
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
          if(!this.detailConflictShown){this.detailConflictShown=true;message({text:"Az adat időközben módosult; a megkezdett szerkesztés megmaradt.",expire:5000});}
          return;
        }
        this.rows=[row];await this.mountDetail(row);
      }else{this.rows=[row];this.capabilities();}
    }else{this.previous=data.previous;this.next=data.next;await this.render(data.items,true);}
  }
  private async mountDetail(row:Row):Promise<void>{
    const action=this.view.actions.find(a=>a.name==="update"&&row._actions?.includes("update"));
    let allowed:FieldDefinition[]=[];
    if(action){const schema=await this.call("__form",String(row.id),{operation:"update"});allowed=schema.fields;}
    if(this.disposed)return;
    this.layout.getCell("detail").detach();this.detail?.destructor();await awaitRedraw();if(this.disposed)return;
    const fields=this.view.columns.map(c=>allowed.find(f=>f.name===c.id)||{name:c.id,label:c.header,type:"text",required:false,max:255,options:{}});
    const form=new Form(document.createElement("div"),{padding:24,rows:[...fields.map(f=>input(f,row[f.name],!allowed.some(a=>a.name===f.name))),...(action?[{type:"button",name:"submit",text:"Mentés",icon:"dxi dxi-content-save",color:"primary"}]:[])]} as any);
    this.detail=form;this.detailDirty=false;this.detailConflictShown=false;
    form.events.on("change",()=>{this.detailDirty=true;});
    if(action)this.bindSave(form,action,String(row.id),row,allowed,()=>{this.detailDirty=false;});
    this.layout.getCell("detail").attach(form);this.capabilities();
  }
  private async showResults(id:string):Promise<void>{
    const epoch=++this.resultsEpoch;
    this.results?.destructor();this.results=undefined;
    try{
      const row:Row=await this.call("get",id);
      if(this.disposed||epoch!==this.resultsEpoch)return;
      const dialog=new Window({title:escape(this.view.title+" — Adatok · "+id),ariaLabel:"Rekordadatok",width:Math.min(680,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});
      this.results=dialog;
      dialog.attachHTML(`<article class="vapa-record-details"><div class="vapa-grid-card__id">ID · ${escapeRecord(row.id)}</div>${recordFields(row,this.view.detailFields??this.view.columns)}</article>`);
      dialog.show();
    }catch(error){await this.error(error);}
  }
  private async openBulk(action:ActionDefinition):Promise<void>{
    const ids=this.grid?.markedIds??[];if(!ids.length||ids.length>100)return;
    const epoch=++this.formEpoch;
    try{
      const schemas:{fields:FieldDefinition[];values:Row}[]=[];
      for(const id of ids)schemas.push(await this.call("__form",id,{operation:action.name}));
      if(this.disposed||epoch!==this.formEpoch)return;
      const fields=(schemas[0].fields as FieldDefinition[]).filter(field=>field.name!=="revision"&&schemas.every(schema=>schema.fields.some((other:FieldDefinition)=>other.name===field.name)));
      if(schemas.some(schema=>schema.fields.some((field:FieldDefinition)=>field.name!=="revision"&&!fields.some(common=>common.name===field.name))))throw new Error("A jelölt sorok eltérő mezőjogosultságúak. Válassz azonos jogosultságú sorokat.");
      const form=new Form(document.createElement("div"),{padding:20,rows:[...fields.map(field=>input(field,undefined)),{type:"button",name:"submit",text:`Végrehajtás (${ids.length} sor)`,icon:action.icon??"dxi dxi-check",color:"primary"}]} as any);
      this.dialog?.destructor();this.editor?.destructor();this.editor=form;
      const dialog=new Window({title:escape(action.label+" — "+ids.length+" jelölt sor"),width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true});this.dialog=dialog;dialog.attach(form);dialog.show();
      const validation=new FormValidation(form,fields);let saving=false;
      form.events.on("click",(name:string)=>{
        if(name!=="submit"||saving||!validation.validate())return;saving=true;form.disable();
        const raw=form.getValue() as Record<string,unknown>;
        const values=Object.fromEntries(fields.map(field=>[field.name,raw[field.name]]));
        void this.call("__bulk",null,{operation:action.name,items:ids.map((id,i)=>({id,values:{...values,...(schemas[i].fields.some((field:FieldDefinition)=>field.name==="revision")?{revision:schemas[i].values.revision}:{})}}))}).then(async(result:{id:string;ok:boolean;error?:string}[])=>{
          await awaitRedraw();if(this.disposed||this.editor!==form)return;dialog.destructor();this.dialog=undefined;this.editor=undefined;this.grid?.clearMarks();await this.load();
          await alert({header:"Tömeges művelet",text:`Sikeres: ${result.filter(row=>row.ok).length}, sikertelen: ${result.filter(row=>!row.ok).length}.`+result.filter(row=>!row.ok).map(row=>`\n${row.id}: ${row.error}`).join(""),htmlEnable:false});
        }).catch(error=>this.error(error)).finally(()=>{saving=false;if(!this.disposed&&this.editor===form)form.enable();});
      });
    }catch(error){await this.error(error);}
  }
  private async open(action:ActionDefinition):Promise<void>{
    const id=action.name==="create"?null:this.selected;if(action.name!=="create"&&!id)return;
    const epoch=++this.formEpoch;
    try{
      const schema=await this.call("__form",id??null,{operation:action.name});if(this.disposed||epoch!==this.formEpoch)return;
      const allowed=schema.fields as FieldDefinition[];
      const form=new Form(document.createElement("div"),{padding:20,rows:[...allowed.filter(f=>f.name!=="revision").map(f=>input(f,f.type==="password"?"":schema.values[f.name])),{type:"button",name:"submit",text:action.submitLabel,icon:action.icon??"dxi dxi-content-save",color:"primary"}]} as any);
      this.dialog?.destructor();this.editor?.destructor();this.editor=form;
      const close=()=>{
        if(this.view.layout.formMode==="panel"&&!this.view.singleton){this.layout.getCell("form").detach();this.layout.getCell("form").collapse();}
        else{this.dialog?.destructor();this.dialog=undefined;}
        this.editor=undefined;
      };
      if(this.view.layout.formMode==="panel"&&!this.view.singleton){this.layout.getCell("form").expand();this.layout.getCell("form").attach(form);}
      else{
        const dialog=new Window({title:escape(this.view.title+" — "+action.label),ariaLabel:this.view.title+" — "+action.label,width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});this.dialog=dialog;dialog.attach(form);dialog.show();
      }
      this.bindSave(form,action,id??null,schema.values,allowed,close);
    }catch(e){await this.error(e);}
  }
  private bindSave(form:Form,action:ActionDefinition,id:string|null,current:Row,allowed:FieldDefinition[],complete:()=>void):void{
    let saving=false;
    const validation=new FormValidation(form,allowed.filter(f=>f.name!=="revision"));
    form.events.on("click",(name:string)=>{
      if(name!=="submit"||saving||!validation.validate())return;saving=true;form.disable();
      const raw=form.getValue() as Record<string,unknown>;const values:Record<string,unknown>={};
      for(const f of allowed)if(f.name!=="revision"&&raw[f.name]!==undefined)values[f.name]=raw[f.name];
      if(allowed.some(f=>f.name==="revision"))values.revision=current.revision;
      void this.call(action.name,id,values).then(async result=>{
        await awaitRedraw();if(this.disposed)return;complete();
        if(result?.secret)await alert({header:"Egyszer megjelenő API-token",text:result.secret,htmlEnable:false});
        else await alert({header:"Mentés",text:"A művelet sikerült.",htmlEnable:false});
        if(result?.reauthenticate)location.reload();
      }).catch(e=>{if(!this.disposed&&!validation.showServerErrors(e.fieldErrors??{}))return this.error(e);}).finally(()=>{saving=false;if(!this.disposed&&(this.editor===form||this.detail===form))form.enable();});
    });
  }
  private revoke():void{this.resultsEpoch++;this.results?.destructor();this.results=undefined;this.rows=[];this.grid?.setRows([]);this.detail?.clear();this.detail?.disable();this.editor?.clear();this.editor?.disable();this.dialog?.destructor();this.dialog=undefined;this.capabilities();}
  destroy():void{this.releaseIcons();this.resultsEpoch++;this.results?.destructor();window.removeEventListener("resize",this.resize);this.closeFilters();this.disposed=true;this.epoch++;this.formEpoch++;this.abort?.abort();this.live.destroy();this.dialog?.destructor();this.gridEditing?.destroy();this.gridHeaders?.destroy();this.grid?.destroy();this.layout.destructor();}
}

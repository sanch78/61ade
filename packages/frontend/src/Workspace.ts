import { Form, Grid, Layout, Toolbar, Window, alert, message, awaitRedraw } from "@dhtmlx/suite";
import { Realtime, type LiveConfig, type Row, type Snapshot } from "./Realtime";
import { FormValidation, type FieldDefinition } from "./FormValidation";

export type { FieldDefinition } from "./FormValidation";
export type ActionDefinition={name:string;label:string;submitLabel:string;write:boolean;fields:FieldDefinition[]};
type Region={id?:"filter"|"grid"|"form";header?:string;rows?:Region[];cols?:Region[];width?:number;height?:number;minWidth?:number;resizable?:boolean;collapsable?:boolean;collapsed?:boolean};
export type ViewDefinition={resource:string;title:string;columns:{id:string;header:string;type?:string;options?:Record<string,string>;width?:number;minWidth?:number;maxWidth?:number;align?:"left"|"center"|"right"}[];actions:ActionDefinition[];singleton:boolean;group?:string;filters:FieldDefinition[];layout:{formMode:"overlay"|"panel";tree:Region}};
const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const cursor=(edge:string,direction:string)=>btoa(JSON.stringify({edge,direction})).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const input=(f:FieldDefinition,value:unknown,readOnly=false):any=>f.type==="checkbox"?{
  type:"checkbox",name:f.name,label:f.label,checked:String(value??f.defaultValue??"0")==="1"||value===true,disabled:readOnly,
}:({
  type:readOnly?"input":f.type==="select"?"select":f.type==="textarea"?"textarea":"input",
  name:f.name,label:f.label,labelPosition:"top",required:!readOnly&&f.required,maxlength:f.max,
  inputType:f.type==="password"?"password":"text",readOnly,
  ...(!readOnly&&f.type==="select"?{options:Object.entries(f.options).map(([value,content])=>({value,content}))}:{}),
  value:f.type==="password"?"":String(value??f.defaultValue??(f.type==="select"&&!readOnly?Object.keys(f.options)[0]??"":"")),
});

/** Configured filter/form/grid regions, bounded dynamic data and live observation. */
export class Workspace {
  readonly layout:Layout;
  private grid?:Grid;
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
  private detailDirty=false;
  private detailConflictShown=false;
  private live:Realtime;

  constructor(host:HTMLElement,private view:ViewDefinition,private csrf:string,live:LiveConfig){
    const region=(node:Region):any=>({...node,header:node.header?escape(node.header):undefined,
      ...(node.rows?{rows:node.rows.map(region)}:{}),...(node.cols?{cols:node.cols.map(region)}:{})});
    const body=view.singleton?{id:"body",header:escape(view.title),rows:[{id:"commands",height:48},{id:"detail"}]}:{...region(view.layout.tree),id:"body"};
    this.layout=new Layout(host,{type:"space",rows:[body]});
    this.commands=new Toolbar(undefined,{data:[...(!view.singleton?[{id:"title",type:"title",value:escape(view.title)}]:[]),...view.actions.filter(a=>a.name!=="get"&&!(view.singleton&&a.name==="update")).map(a=>({id:a.name,value:escape(a.label)}))]});
    this.commands.events.on("click",(id:string|number)=>{const action=view.actions.find(a=>a.name===id);if(action)void this.open(action);});
    if(view.singleton)this.layout.getCell("commands").attach(this.commands);
    else{
      this.content=new Layout(document.createElement("div"),{rows:[{id:"commands",height:48},{id:"data"}]});
      this.content.getCell("commands").attach(this.commands);
      this.grid=new Grid(null,{columns:[{id:"id",header:[{text:"ID"}],width:80,sortable:false},...view.columns.map(c=>({id:c.id,header:[{text:escape(c.header)}],
        width:c.width,minWidth:c.minWidth??(c.width?undefined:160),maxWidth:c.maxWidth,align:c.align??(c.type==="checkbox"?"center":"left"),autoWidth:!c.width,sortable:false,
        ...(c.type==="checkbox"?{type:"boolean" as const,editable:true}:c.options&&Object.keys(c.options).length?{template:(value:unknown)=>escape(c.options?.[String(value)]??String(value??""))}:{}),
      }))],rowHeight:40,autoWidth:true,selection:"row",htmlEnable:false});
      // Native boolean cells render checkboxes; editing stays in the object form.
      this.grid.events.on("beforeEditStart",()=>false);
      this.grid.events.on("cellClick",(row:any)=>{this.selected=String(row.id);this.capabilities();});
      this.grid.events.on("cellDblClick",()=>{const action=view.actions.find(a=>a.name==="update");if(action&&this.selectedRow()?._actions?.includes("update"))void this.open(action);});
      this.grid.events.on("scroll",(position:{x:number;y:number})=>{
        if(this.rendering||this.busy||this.disposed)return;
        const buffer=Math.max(400,innerHeight*1.4);
        if(this.next&&position.y>this.rows.length*40-buffer)void this.more("next");
        else if(this.previous&&position.y<120)void this.more("previous");
      });
      this.content.getCell("data").attach(this.grid);this.layout.getCell("grid").attach(this.content);
      if(this.hasRegion("filter"))this.mountFilters();
    }
    this.live=new Realtime(view.resource,live,this.call.bind(this),data=>void this.changed(data),()=>{},()=>this.revoke());
    this.capabilities();void this.load();
  }
  private hasRegion(id:string):boolean{
    const find=(node:Region):boolean=>node.id===id||[...(node.rows??[]),...(node.cols??[])].some(find);return find(this.view.layout.tree);
  }
  private selectedRow():Row|undefined{return this.rows.find(r=>String(r.id)===this.selected);}
  private capabilities():void{
    for(const a of this.view.actions){if(a.name==="get"||(this.view.singleton&&a.name==="update"))continue;
      if(a.name==="create"||this.selectedRow()?._actions?.includes(a.name))this.commands.enable(a.name);else this.commands.disable(a.name);
    }
  }
  private mountFilters():void{
    const form=new Form(document.createElement("div"),{padding:16,rows:[...this.view.filters.map(f=>({...input({...f,type:f.type==="checkbox"?"select":f.type,required:false},""),...(["select","checkbox"].includes(f.type)?{options:[{value:"",content:"Bármely"},...Object.entries(f.options).map(([value,content])=>({value:"eq:"+value,content}))]}:{})})),{type:"button",name:"apply",text:"Szűrés",color:"primary"},{type:"button",name:"clear",text:"Alaphelyzet",view:"link"}]} as any);
    form.events.on("click",(name:string)=>{
      if(name!=="apply"&&name!=="clear")return;
      if(name==="clear")form.clear();
      const values=form.getValue() as Record<string,string>;this.filters={};
      for(const f of this.view.filters){const v=String(values[f.name]??"");if(v!=="")this.filters[f.name]=["select","checkbox"].includes(f.type)?v.slice(3):v;}
      void this.load();
    });
    this.layout.getCell("filter").attach(form);
  }
  private async call(action:string,id:string|null=null,values:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{
    const endpoint=new URL(location.href);endpoint.hash="";endpoint.search="?vapa=1";
    const r=await fetch(endpoint,{method:"POST",credentials:"same-origin",signal,headers:{"Content-Type":"application/json","X-VAPA-CSRF":this.csrf},body:JSON.stringify({resource:this.view.resource,action,id,values})});
    const result=await r.json();if(!r.ok||!result.ok)throw Object.assign(new Error(result.error||"Sikertelen művelet."),{status:r.status,fieldErrors:result.fieldErrors});return result.data;
  }
  private async error(e:unknown):Promise<void>{if(!this.disposed)await alert({header:"Hiba",text:e instanceof Error?e.message:"Sikertelen művelet.",htmlEnable:false});}
  private watch():void{this.live.subscribe({limit:Math.max(100,this.rows.length),first:this.rows[0]?.id??null,front:this.previous===null,filters:this.filters});}
  private async load():Promise<void>{
    const epoch=++this.epoch;this.abort?.abort();this.abort=new AbortController();this.busy=true;
    try{
      if(this.view.singleton){const row=await this.call("get","self",{},this.abort.signal);if(this.disposed||epoch!==this.epoch)return;this.rows=[row];this.selected=String(row.id);await this.mountDetail(row);}
      else{
        const data:Snapshot=await this.call("list",null,{mode:"dynamic",limit:100,filters:this.filters},this.abort.signal);
        if(this.disposed||epoch!==this.epoch)return;this.previous=data.previous;this.next=data.next;await this.render(data.items,false);
      }
      this.watch();
    }catch(e){if(!this.disposed&&epoch===this.epoch&&!(e instanceof DOMException&&e.name==="AbortError"))await this.error(e);}
    finally{if(epoch===this.epoch)this.busy=false;}
  }
  private async more(direction:"next"|"previous"):Promise<void>{
    const token=direction==="next"?this.next:this.previous;if(!token||this.busy)return;
    const epoch=this.epoch;this.busy=true;
    try{
      const data:Snapshot=await this.call("list",null,{mode:"dynamic",limit:100,cursor:token,filters:this.filters});
      if(this.disposed||epoch!==this.epoch)return;
      if(!data.items.length){if(direction==="next")this.next=null;else this.previous=null;return;}
      const joined=direction==="next"?[...this.rows,...data.items]:[...data.items,...this.rows];
      let rows=[...new Map(joined.map(row=>[String(row.id),row])).values()];
      if(direction==="next"){
        this.next=data.next;if(rows.length>600){rows=rows.slice(-600);this.previous=cursor(String(rows[0].id),"previous");}
      }else{
        this.previous=data.previous;if(rows.length>600){rows=rows.slice(0,600);this.next=cursor(String(rows[rows.length-1].id),"next");}
      }
      await this.render(rows,true);this.watch();
    }catch(e){await this.error(e);}finally{if(epoch===this.epoch)this.busy=false;}
  }
  private gridRow(row:Row):Row {
    const result=structuredClone(row);
    for(const column of this.view.columns)if(column.type==="checkbox"&&Object.hasOwn(result,column.id))result[column.id]=String(result[column.id])==="1"||result[column.id]===true;
    return result;
  }
  private async render(rows:Row[],preserve:boolean):Promise<void>{
    if(!this.grid)return;
    this.rendering=true;
    const position=this.grid.getScrollState();const anchor=this.rows[Math.floor(position.y/40)]?.id;const offset=position.y%40;
    const same=this.rows.length===rows.length&&this.rows.every((r,i)=>String(r.id)===String(rows[i].id));
    if(same){for(let i=0;i<rows.length;i++)if(JSON.stringify(this.rows[i])!==JSON.stringify(rows[i]))this.grid.data.update(String(rows[i].id),this.gridRow(rows[i]));}
    else{this.grid.data.removeAll();this.grid.data.parse(rows.map(row=>this.gridRow(row)));}
    this.rows=rows;
    if(this.selected&&!this.selectedRow())this.selected=undefined;
    this.capabilities();await awaitRedraw();
    if(this.disposed)return;
    const index=anchor?rows.findIndex(r=>String(r.id)===String(anchor)):-1;
    this.grid.scroll(position.x,preserve?(index>=0?index*40+offset:position.y):0);
    if(this.selected)(this.grid.selection as any).setCell(this.selected);
    this.rendering=false;
  }
  private async changed(data:Snapshot):Promise<void>{
    if(this.disposed||this.busy)return;
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
    const form=new Form(document.createElement("div"),{padding:24,rows:[...fields.map(f=>input(f,row[f.name],!allowed.some(a=>a.name===f.name))),...(action?[{type:"button",name:"submit",text:"Mentés",color:"primary"}]:[])]} as any);
    this.detail=form;this.detailDirty=false;this.detailConflictShown=false;
    form.events.on("change",()=>{this.detailDirty=true;});
    if(action)this.bindSave(form,action,String(row.id),row,allowed,()=>{this.detailDirty=false;});
    this.layout.getCell("detail").attach(form);this.capabilities();
  }
  private async open(action:ActionDefinition):Promise<void>{
    const id=action.name==="create"?null:this.selected;if(action.name!=="create"&&!id)return;
    const epoch=++this.formEpoch;
    try{
      const schema=await this.call("__form",id??null,{operation:action.name});if(this.disposed||epoch!==this.formEpoch)return;
      const allowed=schema.fields as FieldDefinition[];
      const form=new Form(document.createElement("div"),{padding:20,rows:[...allowed.filter(f=>f.name!=="revision").map(f=>input(f,f.type==="password"?"":schema.values[f.name])),{type:"button",name:"submit",text:action.submitLabel,color:"primary"}]} as any);
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
        if(this.disposed)return;complete();
        if(result?.secret)await alert({header:"Egyszer megjelenő API-token",text:result.secret,htmlEnable:false});
        else await alert({header:"Mentés",text:"A művelet sikerült.",htmlEnable:false});
        if(result?.reauthenticate)location.reload();
      }).catch(e=>{if(!this.disposed&&!validation.showServerErrors(e.fieldErrors??{}))return this.error(e);}).finally(()=>{saving=false;if(!this.disposed&&(this.editor===form||this.detail===form))form.enable();});
    });
  }
  private revoke():void{this.rows=[];this.grid?.data.removeAll();this.detail?.clear();this.detail?.disable();this.editor?.clear();this.editor?.disable();this.dialog?.destructor();this.dialog=undefined;this.capabilities();}
  destroy():void{this.disposed=true;this.epoch++;this.formEpoch++;this.abort?.abort();this.live.destroy();this.dialog?.destructor();this.layout.destructor();}
}

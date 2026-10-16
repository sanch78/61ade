import { Form, Grid, Layout, Toolbar, Window, alert } from "@dhtmlx/suite";

export type FieldDefinition = {name:string; label:string; type:string; required:boolean; max:number; options:Record<string,string>};
export type ActionDefinition = {name:string; label:string; write:boolean; fields:FieldDefinition[]};
export type ViewDefinition = {resource:string; title:string; columns:{id:string;header:string}[]; actions:ActionDefinition[]; singleton:boolean};
const escape = (s:unknown) => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

/** A reusable registry-driven workspace. No application resources or account fields. */
export class Workspace {
  private layout:Layout;
  private grid:Grid;
  private selected?:string;
  private rows:Record<string,unknown>[]=[];
  private dialog?:Window;
  private disposed=false;
  constructor(host:HTMLElement,private view:ViewDefinition,private csrf:string) {
    this.layout=new Layout(host,{rows:[{id:"commands",height:48},{id:"data"}]});
    const toolbar=new Toolbar(undefined,{data:[{id:"title",type:"title",value:escape(view.title)},
      ...view.actions.filter(a=>a.name!=="get").map(a=>({id:a.name,value:escape(a.label)})),{id:"reload",value:"Frissítés"}]});
    toolbar.events.on("click",(id:string|number)=>{
      if(id==="reload"){void this.load();return;}
      const action=view.actions.find(a=>a.name===id);if(action)void this.open(action);
    });
    this.grid=new Grid(null,{columns:[{id:"id",header:[{text:"ID"}],width:80},...view.columns.map(c=>({id:c.id,header:[{text:escape(c.header)}],minWidth:160}))],autoWidth:true,selection:"row",htmlEnable:false});
    this.grid.events.on("cellClick",(row:any)=>{this.selected=String(row.id);});
    this.layout.getCell("commands").attach(toolbar);this.layout.getCell("data").attach(this.grid);
    void this.load();
  }
  private async call(action:string,id:string|null=null,values:Record<string,unknown>={}):Promise<any>{
    const endpoint=new URL(location.href);endpoint.hash="";endpoint.search="?vapa=1";
    const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-VAPA-CSRF":this.csrf},body:JSON.stringify({resource:this.view.resource,action,id,values})});
    const result=await response.json();if(!response.ok || !result.ok)throw new Error(result.error || "Sikertelen művelet.");return result.data;
  }
  private async error(e:unknown):Promise<void>{await alert({header:"Hiba",text:e instanceof Error?e.message:"Sikertelen művelet.",htmlEnable:false});}
  private async load():Promise<void>{
    try{
      const data=await this.call(this.view.singleton?"get":"list",this.view.singleton?"self":null);
      if(this.disposed)return;
      this.rows=Array.isArray(data)?data:[data];this.selected=this.view.singleton?String(this.rows[0]?.id):undefined;
      this.grid.data.removeAll();this.grid.data.parse(this.rows);
    }catch(e){if(!this.disposed)await this.error(e);}
  }
  private async open(action:ActionDefinition):Promise<void>{
    if(action.name!=="create" && !this.selected){await this.error(new Error("Válassz egy sort."));return;}
    try{
      let current:Record<string,unknown>={};
      if(action.name!=="create")current=await this.call("get",this.selected!);
      if(this.disposed)return;
      this.dialog?.destructor();
      const fields=action.fields.filter(f=>f.name!=="revision");
      const form=new Form(document.createElement("div"),{padding:20,rows:[...fields.map(f=>({
        type:f.type==="select"?"select":f.type==="textarea"?"textarea":"input",name:f.name,label:f.label,
        labelPosition:"top",required:f.required,maxlength:f.max,inputType:f.type==="password"?"password":"text",
        ...(f.type==="select"?{options:Object.entries(f.options).map(([value,content])=>({value,content}))}:{}),
        value:f.type==="password"?"":String(current[f.name]??""),
      })),{type:"button",name:"submit",text:action.label,color:"primary"}]} as any);
      const dialog=new Window({title:escape(this.view.title+" — "+action.label),ariaLabel:this.view.title+" — "+action.label,width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});
      this.dialog=dialog;dialog.attach(form);dialog.show();
      let saving=false;
      form.events.on("click",(name:string)=>{if(name!=="submit"||saving||!form.validate())return;
        saving=true;form.disable();
        const values=form.getValue() as Record<string,unknown>;
        if(action.fields.some(f=>f.name==="revision"))values.revision=current.revision;
        void this.call(action.name,action.name==="create"?null:this.selected!,values).then(async(result)=>{
          dialog.destructor();if(this.dialog===dialog)this.dialog=undefined;
          if(result?.secret)await alert({header:"Egyszer megjelenő API-token",text:result.secret,htmlEnable:false});
          else await alert({header:"Mentés",text:"A művelet sikerült.",htmlEnable:false});
          if(result?.reauthenticate){location.reload();return;}
          await this.load();
        }).catch(e=>this.error(e)).finally(()=>{saving=false;if(this.dialog===dialog)form.enable();});
      });
    }catch(e){await this.error(e);}
  }
  destroy():void{this.disposed=true;this.dialog?.destructor();this.layout.destructor();}
}

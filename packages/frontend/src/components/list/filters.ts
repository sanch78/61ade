import { t } from "../../I18n";
import { fitWindow } from "../../WindowSizing";
import { Form, Window, awaitRedraw, type Layout } from "@dhtmlx/suite";
import type { ResponsiveToolbar } from "../../ResponsiveToolbar";
import { input } from "./fields";
import type { FieldDefinition, ViewDefinition } from "./types";

/** Select and checkbox filters carry `eq:<value>` in the form (the empty choice is "any"). */
const choice=(filter:FieldDefinition)=>["select","checkbox"].includes(filter.type);

/**
 * The declared filter panel of a list (`filter` region): Apply and Reset in the panel; below 768 px the panel
 * hides and the toolbar's `Szűrés` command opens the same form in a dialog with Cancel. Applying reports the
 * typed values (select/checkbox without the `eq:` prefix); the list keeps, shows and requests them.
 */
export class ListFilters{
  readonly form:Form;
  private dialog?:Window;
  private mobile=false;
  private wasVisible=true;
  private resize=()=>this.fit();
  constructor(private view:ViewDefinition,private layout:Layout,private commands:ResponsiveToolbar,private applied:(filters:Record<string,string>)=>void){
    this.form=this.create();this.layout.getCell("filter").attach(this.form);
    window.addEventListener("resize",this.resize);
  }
  private create(onCancel?:()=>void):Form{
    const form=new Form(document.createElement("div"),{padding:16,rows:[...this.view.filters.map(f=>({...input({...f,editor:undefined,type:f.type==="checkbox"?"select":f.type,required:false} as FieldDefinition,""),...(choice(f)?{options:[{value:"",content:t("Bármely")},...Object.entries(f.options).map(([value,content])=>({value:"eq:"+value,content}))]}:{})})),{css:"blade-filter-actions",cols:[{type:"button",name:"apply",text:t("Szűrés"),icon:"dxi dxi-filter-variant",color:"primary",width:"content",padding:"0 8px 0 0"},{type:"button",name:"clear",text:t("Alaphelyzet"),icon:"dxi dxi-undo",view:"flat",color:"secondary",width:"content"},...(onCancel?[{type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"}]:[])]}]} as any);
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){onCancel?.();return;}
      if(name!=="apply"&&name!=="clear")return;
      if(name==="clear")form.clear();
      const values=form.getValue() as Record<string,string>;this.form?.setValue(values);const filters:Record<string,string>={};
      for(const f of this.view.filters){const v=String(values[f.name]??"");if(v!=="")filters[f.name]=choice(f)?v.slice(3):v;}
      this.close();this.applied(filters);
    });
    return form;
  }
  /** Narrow screens move the panel into the dialog (the panel's visibility is restored on a wide screen). */
  fit():void{
    const mobile=innerWidth<768;
    if(mobile)this.commands.show("blade-filter");else this.commands.hide("blade-filter");
    if(mobile===this.mobile)return;
    this.mobile=mobile;
    const cell=this.layout.getCell("filter");
    if(mobile){this.wasVisible=cell.isVisible();cell.hide();}
    else{this.close();if(this.wasVisible)cell.show();}
  }
  open():void{
    if(!this.mobile)return;
    if(this.dialog){this.dialog.show();return;}
    const form=this.create(()=>this.close());form.setValue(this.form.getValue());
    const dialog=new Window({css:"blade-content-window",title:t("Szűrés"),width:Math.min(420,innerWidth-24),height:Math.min(600,innerHeight-24),modal:true,closable:true});
    this.dialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
    dialog.events.on("afterHide",()=>this.close());
  }
  close():void{
    const dialog=this.dialog;if(!dialog)return;
    this.dialog=undefined;dialog.hide();
    void awaitRedraw().then(()=>dialog.destructor());
  }
  /** One filter's value in the panel (`eq:` for select/checkbox). */
  setValue(definition:FieldDefinition,value:string):void{
    const values=this.form.getValue() as Record<string,string>;
    values[definition.name]=value&&choice(definition)?"eq:"+value:value;
    this.form.setValue(values);
  }
  clear():void{this.form.clear();}
  destroy():void{window.removeEventListener("resize",this.resize);this.close();}
}

import { t } from "../../I18n";
import { Form, Layout, awaitRedraw } from "@dhtmlx/suite";
import { alert } from "../../MessageDialog";
import { FileFields } from "../../FilePicker";
import { FormValidation, fieldError } from "../../FormValidation";
import { failure, server } from "../../api/Server";
import type { ActionMetadata, FormDescription, RecordForm as RecordFormApi, RecordFormEvents, RecordFormOptions } from "../../api/types";
import { Component } from "./component";
import { DECLINED, errorText, formActions, input } from "./fields";
import { confirmed, resultNotice } from "./actions";
import type { ListContext } from "./ListView";
import type { FieldDefinition } from "./types";
import type { Row } from "../../Realtime";

/**
 * One framework action form as a public component (`app.components.RecordForm`, docs/toolkit.md#recordform): the
 * fields and values of `__form` (the actor's field ACL applied), file fields, client validation mirroring the
 * server rules, Cancel beside the submit button, the action's declared confirmation, the success toast and the
 * server's field errors shown in place. The same executor, revision check and audit as every list form.
 */
export class RecordForm extends Component<RecordFormEvents> implements RecordFormApi{
  readonly layout:Layout;
  private form?:Form;
  private fields:FieldDefinition[]=[];
  private schema?:FormDescription;
  private validation?:FormValidation;
  private files?:FileFields;
  private ready:Promise<void>;
  private changedFields=false;
  private saving?:Promise<unknown>;
  private abort=new AbortController();
  /** The action's offered metadata (label, icon, confirmation) from any view of the resource, if any. */
  private action?:ActionMetadata;
  constructor(private context:ListContext,private options:RecordFormOptions){
    super();
    if(typeof options?.resource!=="string"||typeof options.action!=="string")throw new TypeError("61ade: RecordForm needs a resource and an action.");
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"form"}]});
    this.action=context.app().viewDefinitions().filter(view=>view.resource===options.resource).flatMap(view=>view.actions).find(action=>action.name===options.action);
    // A failed load has shown the error dialog; `submit` rejects with it.
    this.ready=this.load();this.ready.catch(()=>{});
    this.bind(options.signal);
  }
  private async load():Promise<void>{
    const {resource,action}=this.options,id=this.options.id??null;
    try{
      const schema=this.schema=await server.form(resource,action,id,this.abort.signal);
      if(this.destroyed)return;
      const fields=this.fields=(schema.fields as FieldDefinition[]).filter(field=>field.name!=="revision");
      const values={...schema.values,...(this.options.values??{})};
      const form=this.form=new Form(document.createElement("div"),{padding:20,rows:[...fields.map(f=>input(f,f.type==="password"?"":values[f.name])),
        formActions({name:"submit",text:this.action?.submitLabel??t("Mentés"),icon:this.action?.icon??"dxi dxi-content-save",color:"primary"})]} as any);
      this.files=new FileFields(form,schema.fields as FieldDefinition[],(resource,action,id,values={})=>server.call(resource,action,{id,values}),[schema.values as Row]);
      this.validation=new FormValidation(form,fields);
      form.events.on("change",(name:string,value:unknown)=>{if(!fields.some(field=>field.name===name))return;this.changedFields=true;this.emit("changed",{field:name,value});});
      form.events.on("click",(name:string)=>{
        if(name==="cancel")this.emit("cancel",{});
        else if(name==="submit")void this.submit().catch(()=>{});
      });
      this.layout.getCell("form").attach(form);
    }catch(error){
      if(this.destroyed||(error instanceof DOMException&&error.name==="AbortError"))return;
      await alert({header:t("Hiba"),severity:"danger",text:errorText(error,[])});
      throw error;
    }
  }
  values():Record<string,unknown>{
    const raw=(this.form?.getValue()??{}) as Record<string,unknown>,values:Record<string,unknown>={};
    for(const field of this.fields)if(raw[field.name]!==undefined)values[field.name]=raw[field.name];
    return values;
  }
  dirty():boolean{return !this.destroyed&&this.changedFields;}
  /**
   * Validates and runs the action. A client-side validation failure sends nothing and rejects with a status 400
   * `ServerFailure` carrying the field errors, like the server's own answer; a server failure shows its field errors
   * in the form (or the error dialog) and rejects with it. A declined confirmation rejects with an `AbortError`.
   */
  submit():Promise<unknown>{
    if(this.saving)return this.saving;
    const run=async():Promise<unknown>=>{
      await this.ready;
      const form=this.form,validation=this.validation,schema=this.schema;
      if(this.destroyed||!form||!validation||!schema)throw new DOMException("The form is closed.","AbortError");
      if(!validation.validate()){
        const raw=form.getValue() as Record<string,unknown>,errors:Record<string,string>={};
        for(const field of this.fields){const error=fieldError(field,raw[field.name],raw);if(error)errors[field.name]=error;}
        throw failure(400,{error:t("Javítsd a megjelölt mezőket."),fieldErrors:errors});
      }
      const values=this.values();
      if(schema.fields.some(field=>field.name==="revision"))values.revision=schema.values.revision;
      form.disable();
      try{
        if(!await confirmed({confirm:this.action?.confirm??undefined,submitLabel:this.action?.submitLabel??t("Mentés")}))throw DECLINED;
        const result=await server.call<any>(this.options.resource,this.options.action,{id:this.options.id??null,values,signal:this.abort.signal});
        await awaitRedraw();
        if(this.destroyed)return result;
        this.changedFields=false;
        resultNotice(result);
        this.emit("saved",{result});
        if(result?.reauthenticate)location.reload();
        return result;
      }catch(error){
        if(error===DECLINED)throw new DOMException("The confirmation was declined.","AbortError");
        if(!this.destroyed&&!(error instanceof DOMException&&error.name==="AbortError")&&!validation.showServerErrors((error as {fieldErrors?:Record<string,string>})?.fieldErrors??{}))
          await alert({header:t("Hiba"),severity:"danger",text:errorText(error,this.fields)});
        throw error;
      }finally{if(!this.destroyed)form.enable();}
    };
    const saving=this.saving=run().finally(()=>{if(this.saving===saving)this.saving=undefined;});
    return saving;
  }
  protected dispose():void{this.abort.abort();this.files?.destroy();this.form?.destructor();this.layout.destructor();}
}

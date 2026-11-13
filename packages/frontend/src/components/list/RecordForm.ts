import { t } from "../../I18n";
import { Form, Layout, awaitRedraw } from "@dhtmlx/suite";
import { acknowledge } from "../../MessageDialog";
import { FileFields } from "../../FilePicker";
import { FormValidation, fieldError, fileUploadPending } from "../../FormValidation";
import { failure, server } from "../../api/Server";
import type { ActionMetadata, FormDescription, MountTarget, RecordForm as RecordFormApi, RecordFormEvents, RecordFormOptions } from "../../api/types";
import { Component } from "./component";
import { CellStatus } from "../CellStatus";
import { DECLINED, bindFieldTypes, errorText, formActions, formRows, input, setShown, shownOnly } from "./fields";
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
  /** The fields shown and not edited: the action's read-only ones and this form's `readOnly` (still submitted). */
  private fixed=new Set<string>();
  private schema?:FormDescription;
  private validation?:FormValidation;
  private files?:FileFields;
  private ready:Promise<void>;
  private changedFields=false;
  /** `setValues` is filling the form: its Suite change events are not the user's. */
  private setting=false;
  private saving?:Promise<unknown>;
  private abort=new AbortController();
  /** Loading until the form's fields have arrived; a failed load says so (docs/toolkit.md#loading-and-empty-states). */
  private status?:CellStatus;
  private releaseTypes?:()=>void;
  /** The action's offered metadata (label, icon, confirmation) from any view of the resource, if any. */
  private action?:ActionMetadata;
  /** Mounted in an `AppWindow`: its `fit`, run once the fields are shown and when a conditional field appears or hides. */
  private fit?:()=>unknown;
  constructor(private context:ListContext,private options:RecordFormOptions){
    super(options);
    if(typeof options?.resource!=="string"||typeof options.action!=="string")throw new TypeError("61ade: RecordForm needs a resource and an action.");
    if(options.readOnly!==undefined&&!(Array.isArray(options.readOnly)&&options.readOnly.every(name=>typeof name==="string"&&name!=="")))throw new TypeError("61ade: RecordForm `readOnly` is a list of field names.");
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"form"}]});
    this.status=new CellStatus(this.layout.getCell("form"));this.status.busy(true);
    this.action=context.app().viewDefinitions().filter(view=>view.resource===options.resource).flatMap(view=>view.actions).find(action=>action.name===options.action);
    // A failed load has shown the error dialog; `submit` rejects with it.
    this.ready=this.load();this.ready.catch(()=>{});
    this.bind(options.signal);
  }
  private async load():Promise<void>{
    const {resource,action}=this.options,id=this.options.id??null;
    try{
      const schema=this.schema=await server.form(resource,action,id,{signal:this.abort.signal});
      if(this.destroyed)return;
      const fields=this.fields=(schema.fields as FieldDefinition[]).filter(field=>field.name!=="revision");
      const values={...schema.values,...(this.options.values??{})};
      // The host's read-only fields (a preset from its context): shown like the action's, submitted with their value.
      const named=this.options.readOnly??[],inputs=new Set(fields.filter(field=>!shownOnly(field)&&field.type!=="password").map(field=>field.name));
      const unknown=named.filter(name=>!inputs.has(name));
      if(unknown.length)console.warn(`61ade: RecordForm readOnly names no input field of ${resource}.${action}: ${unknown.join(", ")}.`);
      this.fixed=new Set([...fields.filter(shownOnly).map(field=>field.name),...named.filter(name=>inputs.has(name))]);
      const fixed=(field:FieldDefinition)=>this.fixed.has(field.name),editable=fields.filter(field=>!fixed(field));
      const form=this.form=new Form(document.createElement("div"),{padding:20,rows:[...formRows(fields,f=>input(f,f.type==="password"?"":values[f.name],fixed(f)),values,schema.formSections,schema.flushSections),
        formActions({name:"submit",text:this.action?.submitLabel??this.action?.label??t("Mentés"),icon:this.action?.icon??"bi bi-floppy",color:"primary"},this.options.cancel!==false)]} as any);
      this.files=new FileFields(form,schema.fields as FieldDefinition[],(resource,action,id,values={})=>server.call(resource,action,{id,values}),[schema.values as Row],fixed);
      this.validation=new FormValidation(form,editable);
      this.releaseTypes=bindFieldTypes(form,fields,fixed,()=>this.fit?.());
      form.events.on("change",(name:string,value:unknown)=>{if(this.setting||!editable.some(field=>field.name===name))return;this.changedFields=true;this.emit("changed",{field:name,value});});
      form.events.on("click",(name:string)=>{
        if(name==="cancel")this.emit("cancelled",{});
        else if(name==="submit")void this.submit().catch(()=>{});
      });
      this.status?.busy(false);
      this.layout.getCell("form").attach(form);
      this.fit?.();
    }catch(error){
      if(this.destroyed||(error instanceof DOMException&&error.name==="AbortError"))return;
      this.status?.busy(false);this.status?.text(t("Az adatok nem érhetők el."),"error");
      await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,[])});
      throw error;
    }
  }
  mount(target:MountTarget):void{
    super.mount(target);
    const fit=(target as {fit?:unknown}).fit;
    if(typeof fit==="function"&&"signal" in target)this.fit=()=>void fit.call(target);
  }
  values():Record<string,unknown>{
    const raw=(this.form?.getValue()??{}) as Record<string,unknown>,values:Record<string,unknown>={};
    // The action's read-only fields are never sent; the host's `readOnly` ones keep their shown value.
    for(const field of this.fields)if(!shownOnly(field)&&raw[field.name]!==undefined)values[field.name]=raw[field.name];
    return values;
  }
  dirty():boolean{return !this.destroyed&&this.changedFields;}
  /**
   * Puts values into the action's fields once the form is shown (other keys are ignored) without submitting them or
   * reporting `changed`; the form counts as unchanged afterwards (a day picker set by Previous/Next, a preset).
   */
  async setValues(values:Record<string,unknown>):Promise<void>{
    await this.ready;
    const form=this.form;
    if(this.destroyed||!form)return;
    // The action's read-only fields keep their value; the host's `readOnly` ones show the new one.
    const fields=Object.keys(values??{}).map(name=>this.fields.find(field=>field.name===name)).filter((field):field is FieldDefinition=>!!field&&!shownOnly(field));
    this.setting=true;
    try{
      form.setValue(Object.fromEntries(fields.filter(field=>!this.fixed.has(field.name)).map(field=>[field.name,values[field.name]])));
      for(const field of fields)if(this.fixed.has(field.name)&&field.type!=="file")setShown(form,field,values[field.name]);
    }finally{this.setting=false;}
    this.changedFields=false;
  }
  /**
   * Suite takes a typed value into the form on the input's `change` (blur). A `submit()` from code (a toolbar
   * command, a shortcut) while the user is still in a field commits that field first, as a click on Save does.
   */
  private commit():void{
    const focused=document.activeElement,root=this.layout.getRootNode() as HTMLElement|undefined;
    if(focused instanceof HTMLElement&&root?.contains(focused)&&focused.matches("input,textarea"))focused.blur();
  }
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
      this.commit();
      if(!validation.validate()){
        const raw=form.getValue() as Record<string,unknown>,errors:Record<string,string>={};
        for(const field of this.fields.filter(field=>!this.fixed.has(field.name))){const error=fileUploadPending(form,field.name)?t("Várd meg a fájl feltöltését."):fieldError(field,raw[field.name],raw);if(error)errors[field.name]=error;}
        throw failure(400,{error:t("Javítsd a megjelölt mezőket."),fieldErrors:errors});
      }
      const values=this.values();
      if(schema.fields.some(field=>field.name==="revision"))values.revision=schema.values.revision;
      form.disable();
      try{
        if(!await confirmed({confirm:this.action?.confirm??undefined,submitLabel:this.action?.submitLabel??this.action?.label??t("Mentés")}))throw DECLINED;
        const result=await server.call<any>(this.options.resource,this.options.action,{id:this.options.id??null,values,signal:this.abort.signal});
        await awaitRedraw();
        if(this.destroyed)return result;
        this.changedFields=false;
        // A read-only action (a query) answers with its data, not with a success notice.
        if(this.action?.write!==false)resultNotice(result);
        this.emit("saved",{action:this.options.action,result});
        if(result?.reauthenticate)location.reload();
        return result;
      }catch(error){
        if(error===DECLINED)throw new DOMException("The confirmation was declined.","AbortError");
        if(!this.destroyed&&!(error instanceof DOMException&&error.name==="AbortError")&&!validation.showServerErrors((error as {fieldErrors?:Record<string,string>})?.fieldErrors??{}))
          await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,this.fields)});
        throw error;
      }finally{if(!this.destroyed)form.enable();}
    };
    const saving=this.saving=run().finally(()=>{if(this.saving===saving)this.saving=undefined;});
    return saving;
  }
  protected dispose():void{
    this.status?.destroy();this.status=undefined;
    this.abort.abort();this.releaseTypes?.();this.files?.destroy();
    // Suite 9.3.12 still repaints a form's buttons after a pending enable, disable or blur (a save, Cancel or a tab
    // change destroys the form at once): the Form is taken out of its cell and destroyed once that redraw has run. The
    // Layout goes at once, so a component mounted into the same cell right after this one is not unmounted with it.
    const form=this.form;
    if(form)this.layout.getCell("form").detach();
    this.layout.destructor();
    if(form)void awaitRedraw().then(()=>form.destructor());
  }
}

import { t } from "../../I18n";
import { fitWindow } from "../../WindowSizing";
import { Form, Window, message, awaitRedraw, type Layout } from "@dhtmlx/suite";
import { requestConfirmation } from "../../MessageDialog";
import type { Row } from "../../Realtime";
import { mergeUsages, confirmUsages, clearedText, type Usage } from "../../RecordPresentation";
import { FileFields, type ResourceCall } from "../../FilePicker";
import { uploads } from "../../Uploader";
import { FormValidation } from "../../FormValidation";
import type { ResponsiveGrid } from "../../ResponsiveGrid";
import { DECLINED, actionIcon, escape, formActions, input, technical } from "./fields";
import type { ActionDefinition, FieldDefinition, ViewDefinition, WorkspaceScope } from "./types";

/** What the action forms need from their list (`Workspace` implements it). */
export interface ActionHost{
  readonly view:ViewDefinition;
  readonly scope?:WorkspaceScope;
  readonly layout:Layout;
  readonly disposed:boolean;
  /** A load or command is running (shared with the list's data window). */
  busy:boolean;
  readonly rows:Row[];
  readonly selected?:string;
  /** The singleton's detail form (its Save shares `bindSave`). */
  readonly detail?:Form;
  readonly grid?:ResponsiveGrid;
  readonly resourceCall:ResourceCall;
  selectedRow():Row|undefined;
  call(action:string,id?:string|null,values?:Record<string,unknown>,signal?:AbortSignal):Promise<any>;
  load():Promise<boolean>;
  error(e:unknown):Promise<void>;
  /** A create/update/record form saved (the `saved` event). */
  saved(action:string,row:Row):void;
}

/** Server-declared confirmation (`Action::$confirm`); resolves false when the user cancels. */
export function confirmed(action:Pick<ActionDefinition,"confirm"|"submitLabel">,count=1):Promise<boolean>{
  const c=action.confirm;if(!c)return Promise.resolve(true);
  const fill=(text:string)=>text.replace("{count}",String(count));
  return requestConfirmation({message:fill(c.message),title:c.title,severity:c.severity??"neutral",confirmLabel:c.confirmLabel??action.submitLabel,cancelLabel:c.cancelLabel});
}
/** The non-blocking success toast of an action, or its one-time reveal/secret. */
export function resultNotice(result:any):void{
  if(result?.reveal){message({text:result.reveal.label+": "+result.reveal.value+(result.reveal.note?"\n\n"+result.reveal.note:""),css:"blade-toast",expire:10000});return;}
  if(result?.secret){message({text:t("Egyszer megjelenő API-token")+": "+result.secret,css:"blade-toast",expire:10000});return;}
  // A delete that cleared references (usage providers) says which and how many.
  const cleared=clearedText(result?.cleared);
  message({text:t("A művelet sikerült.")+(cleared?"\n"+cleared:""),css:"blade-toast",expire:cleared?8000:4000});
}

/**
 * The list's action execution: the overlay or panel form of one record (or create), the bulk form or direct bulk
 * command over the marks, field-free record commands, upload actions and the singleton's Save. One editor at a
 * time; a newer form request wins over a pending one.
 */
export class ListActions{
  dialog?:Window;
  editor?:Form;
  /** `file` fields of the open editor. */
  fileFields?:FileFields;
  private epoch=0;
  constructor(private list:ActionHost){}
  /** Drops pending form requests (revocation, destroy). */
  invalidate():void{this.epoch++;}
  /**
   * Confirmation of an action that reports usages (`usages: true`): a `preview` of the same call (one
   * record, or `__bulk` for marks) sums the references; when there are any, one shared danger
   * confirmation lists them with the consequence, otherwise the declared confirmation applies. Marks
   * whose preview failed are counted in the confirmation, never silently dropped.
   */
  private async confirmedUsages(action:ActionDefinition,items:{id:string;values:Record<string,unknown>}[],bulk=false):Promise<boolean>{
    if(!action.usages)return confirmed(action,items.length);
    let usages:Usage[],failed=0;
    if(!bulk&&items.length===1)usages=mergeUsages([(await this.list.call(action.name,items[0].id,{...items[0].values,preview:"1"}))?.usages]);
    else{
      const preview:{id:string;ok:boolean;data?:{usages?:Usage[]}}[]=await this.list.call("__bulk",null,{operation:action.name,items:items.map(item=>({id:item.id,values:{...item.values,preview:"1"}}))});
      usages=mergeUsages(preview.filter(row=>row.ok).map(row=>row.data?.usages));
      failed=preview.filter(row=>!row.ok).length;
    }
    if(this.list.disposed)return false;
    const note=failed?t("{count} elem előnézete nem sikerült.",{count:failed}):"";
    const c=action.confirm;
    if(!usages.length){
      if(!note)return confirmed(action,items.length);
      const declared=c?c.message.replace("{count}",String(items.length)):t("{count} rekord törlődik.",{count:items.length});
      return requestConfirmation({message:declared+"\n\n"+note,title:c?.title,severity:c?.severity??"danger",confirmLabel:c?.confirmLabel??action.submitLabel,cancelLabel:c?.cancelLabel});
    }
    return confirmUsages({usages,title:c?.title,confirmLabel:c?.confirmLabel??action.submitLabel,cancelLabel:c?.cancelLabel,
      message:(c?c.message.replace("{count}",String(items.length)):t("{count} rekord törlődik.",{count:items.length}))+(note?"\n\n"+note:"")});
  }
  async openBulk(action:ActionDefinition):Promise<void>{
    const list=this.list,ids=list.grid?.markedIds??[];if(!ids.length||ids.length>100)return;
    // A field-free bulk command must not open a window whose only control is
    // another Execute button. Forms remain for actions that need input.
    const commandOnly=action.name!=="create"&&action.name!=="update"&&action.fields.every(technical);
    if(commandOnly){await this.executeBulk(action,ids);return;}
    const epoch=++this.epoch;
    try{
      const schemas:{fields:FieldDefinition[];values:Row}[]=[];
      for(const id of ids)schemas.push(await list.call("__form",id,{operation:action.name}));
      if(list.disposed||epoch!==this.epoch)return;
      const eligible=(schema:{fields:FieldDefinition[]})=>schema.fields.filter(field=>field.name!=="revision"&&(action.name!=="update"||field.bulk));
      const fields=eligible(schemas[0]).filter(field=>schemas.every(schema=>eligible(schema).some((other:FieldDefinition)=>other.name===field.name)));
      if(schemas.some(schema=>eligible(schema).some((field:FieldDefinition)=>!fields.some(common=>common.name===field.name))))throw new Error(t("A sorok eltérő mezőjogosultságúak. Válassz azonos jogosultságú sorokat."));
      const form=new Form(document.createElement("div"),{padding:20,rows:[...fields.map(field=>input(field,undefined)),formActions({name:"submit",text:t("Végrehajtás ({count} sor)",{count:ids.length}),icon:actionIcon(action),color:"primary"})]} as any);
      this.dialog?.destructor();this.editor?.destructor();this.fileFields?.destroy();this.editor=form;
      this.fileFields=new FileFields(form,fields,list.resourceCall);
      const dialog=new Window({css:"blade-content-window",title:escape(action.label+" — "+ids.length+t(" sor")),width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true});this.dialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
      const validation=new FormValidation(form,fields);let saving=false;
      form.events.on("click",(name:string)=>{
        if(name==="cancel"){this.dialog=undefined;this.editor=undefined;dialog.hide();void awaitRedraw().then(()=>dialog.destructor());return;}
        if(name!=="submit"||saving||!validation.validate())return;saving=true;form.disable();
        const raw=form.getValue() as Record<string,unknown>;
        const values=Object.fromEntries(fields.map(field=>[field.name,raw[field.name]]));
        void confirmed(action,ids.length).then(ok=>ok?list.call("__bulk",null,{operation:action.name,items:ids.map((id,i)=>({id,values:{...values,...(schemas[i].fields.some((field:FieldDefinition)=>field.name==="revision")?{revision:schemas[i].values.revision}:{})}}))}):Promise.reject(DECLINED)).then(async(result:{id:string;ok:boolean;error?:string}[])=>{
          await awaitRedraw();if(list.disposed||this.editor!==form)return;dialog.destructor();this.dialog=undefined;this.editor=undefined;list.grid?.clearMarks();await list.load();
          message({text:t("Sikeres: {success}, sikertelen: {failed}.",{success:result.filter(row=>row.ok).length,failed:result.filter(row=>!row.ok).length})+result.filter(row=>!row.ok).map(row=>`\n${row.id}: ${row.error}`).join(""),css:"blade-toast",expire:10000});
        }).catch(error=>error===DECLINED?undefined:list.error(error)).finally(()=>{saving=false;if(!list.disposed&&this.editor===form)form.enable();});
      });
    }catch(error){await list.error(error);}
  }
  private async executeBulk(action:ActionDefinition,ids:string[]):Promise<void>{
    const list=this.list;
    if(list.busy||list.disposed||!ids.length||ids.length>100)return;
    list.busy=true;
    try{
      const revisions:{fields:FieldDefinition[];values:Row}[]=[];
      if(action.fields.some(field=>field.name==="revision"))for(const id of ids)revisions.push(await list.call("__form",id,{operation:action.name}));
      const items=ids.map((id,index)=>({id,values:revisions[index]?.fields.some(field=>field.name==="revision")?{revision:revisions[index].values.revision}:{}}));
      if(!await this.confirmedUsages(action,items,true))return;
      const result:{id:string;ok:boolean;error?:string;data?:{cleared?:Record<string,number>}}[]=await list.call("__bulk",null,{operation:action.name,items});
      if(list.disposed)return;
      list.grid?.clearMarks();await list.load();
      const cleared=clearedText(...result.filter(row=>row.ok).map(row=>row.data?.cleared));
      message({text:t("Sikeres: {success}, sikertelen: {failed}.",{success:result.filter(row=>row.ok).length,failed:result.filter(row=>!row.ok).length})+(cleared?"\n"+cleared:"")+result.filter(row=>!row.ok).map(row=>`\n${row.id}: ${row.error}`).join(""),css:"blade-toast",expire:10000});
    }catch(error){if(error!==DECLINED)await list.error(error);}
    finally{list.busy=false;}
  }
  async open(action:ActionDefinition):Promise<void>{
    const list=this.list,view=list.view;
    const id=action.name==="create"?null:list.selected;if(action.name!=="create"&&!id)return;
    // Actions without inputs are commands, not forms. Execute them immediately
    // so a one-click operation does not open a dialog containing another button.
    const commandOnly=action.name!=="create"&&action.name!=="update"&&action.fields.every(technical);
    if(commandOnly){
      if(!id)return;
      await this.execute(action,id);
      return;
    }
    const epoch=++this.epoch;
    try{
      const schema=await list.call("__form",id??null,{operation:action.name});if(list.disposed||epoch!==this.epoch)return;
      const allowed=schema.fields as FieldDefinition[];
      const form=new Form(document.createElement("div"),{padding:20,rows:[...allowed.filter(f=>f.name!=="revision"&&f.name!==list.scope?.field).map(f=>input(f,f.type==="password"?"":schema.values[f.name])),formActions({name:"submit",text:action.submitLabel,icon:action.icon??"dxi dxi-content-save",color:"primary"})]} as any);
      this.dialog?.destructor();this.editor?.destructor();this.fileFields?.destroy();this.editor=form;
      const files=this.fileFields=new FileFields(form,allowed,list.resourceCall,[schema.values,id?list.rows.find(row=>String(row.id)===id):undefined]);
      const close=()=>{
        files.destroy();if(this.fileFields===files)this.fileFields=undefined;
        if(view.layout.formMode==="panel"&&!view.singleton){list.layout.getCell("form").detach();list.layout.getCell("form").collapse();}
        // Destroyed after the click that closes it: Suite 9.3.12 still fires the Form's events after the handler returns.
        else{const dialog=this.dialog;this.dialog=undefined;dialog?.hide();void awaitRedraw().then(()=>dialog?.destructor());}
        this.editor=undefined;
      };
      if(view.layout.formMode==="panel"&&!view.singleton){list.layout.getCell("form").expand();list.layout.getCell("form").attach(form);}
      else{
        const dialog=new Window({css:"blade-content-window",title:escape(view.title+" — "+action.label),ariaLabel:view.title+" — "+action.label,width:Math.min(560,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});this.dialog=dialog;dialog.attach(form);dialog.show();void fitWindow(dialog);form.events.on("afterValidate",()=>{void fitWindow(dialog);});
        // Closing with the window's own close button also ends an open picker and a pending upload choice.
        dialog.events.on("afterHide",()=>{files.destroy();if(this.fileFields===files)this.fileFields=undefined;});
      }
      this.bindSave(form,action,id??null,schema.values,allowed,close,close);
    }catch(e){await list.error(e);}
  }
  /**
   * An upload action (`upload` policy, for example "upload as asset"): the shared uploader sends the files
   * to it; the list reloads once a batch has settled (live updates may show the rows earlier).
   */
  openUpload(action:ActionDefinition):void{
    const list=this.list;
    if(!action.upload||list.disposed)return;
    uploads.open({resource:list.view.resource,action:action.name,target:null,targetLabel:list.view.title,policy:action.upload,
      onUploaded:result=>{if(!list.disposed&&result.succeeded.length)void list.load();}});
  }
  private async execute(action:ActionDefinition,id:string):Promise<void>{
    const list=this.list;
    if(list.busy||list.disposed)return;
    list.busy=true;
    try{
      const values=action.fields.some(field=>field.name==="revision")?{revision:list.selectedRow()?.revision}:{};
      if(!await this.confirmedUsages(action,[{id,values}]))return;
      const result=await list.call(action.name,id,values);
      if(list.disposed)return;
      resultNotice(result);
      await list.load();
    }catch(e){await list.error(e);}
    finally{list.busy=false;}
  }
  bindSave(form:Form,action:ActionDefinition,id:string|null,current:Row,allowed:FieldDefinition[],complete:()=>void,cancel?:()=>void):void{
    const list=this.list;let saving=false;
    const validation=new FormValidation(form,allowed.filter(f=>f.name!=="revision"&&f.name!==list.scope?.field));
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){cancel?.();return;}
      if(name!=="submit"||saving||!validation.validate())return;saving=true;form.disable();
      const raw=form.getValue() as Record<string,unknown>;const values:Record<string,unknown>={};
      for(const f of allowed)if(f.name!=="revision"&&raw[f.name]!==undefined)values[f.name]=raw[f.name];
      // A nested view's record belongs to its parent record: known, not editable, always sent as that record.
      if(list.scope&&allowed.some(f=>f.name===list.scope!.field)){values[list.scope.field]=list.scope.id;}
      if(allowed.some(f=>f.name==="revision"))values.revision=current.revision;
      void confirmed(action).then(ok=>ok?list.call(action.name,id,values):Promise.reject(DECLINED)).then(async result=>{
        await awaitRedraw();if(list.disposed)return;complete();
        resultNotice(result);
        list.saved(action.name,result);
        if(result?.reauthenticate)location.reload();
      }).catch(e=>{if(e===DECLINED)return;if(!list.disposed&&!validation.showServerErrors(e.fieldErrors??{}))return list.error(e);}).finally(()=>{saving=false;if(!list.disposed&&(this.editor===form||list.detail===form))form.enable();});
    });
  }
  /** Revoked access: open forms are emptied and disabled, the dialog closes. */
  revoke():void{this.fileFields?.destroy();this.fileFields=undefined;this.editor?.clear();this.editor?.disable();this.dialog?.destructor();this.dialog=undefined;}
  destroy():void{this.epoch++;this.fileFields?.destroy();this.dialog?.destructor();}
}

import { t } from "../../I18n";
import { optionText } from "../../RecordPresentation";
import { fileInput } from "../../FilePicker";
import type { Form } from "@dhtmlx/suite";
import { extensions, fieldTypeOf } from "../../app/registries";
import type { FieldMetadata } from "../../api/types";
import { calendarDate, dateValue, fieldActive } from "../../FormValidation";
import type { ActionDefinition, FieldDefinition } from "./types";

/** Form item factories and action helpers shared by the list, its forms and the public `RecordForm`. */
export const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Rejection marker of a confirmation the user declined (no error dialog). */
export const DECLINED=Symbol("declined");
const ACTION_ICONS:Record<string,string>={create:"dxi dxi-plus",update:"dxi dxi-pencil",delete:"dxi dxi-delete",password:"dxi dxi-key",get:"dxi dxi-information-outline"};
export const actionIcon=(action:Pick<ActionDefinition,"name"|"icon"|"upload">)=>action.icon??ACTION_ICONS[action.name]??(action.upload?"dxi dxi-file-import":"dxi dxi-check");
/** Protocol values a command sends itself; an action with only these fields runs without a form. */
export const technical=(field:FieldDefinition)=>field.name==="revision"||field.name==="preview"&&field.type==="checkbox";
/** Whether a Suite Form item (or a nested `rows`/`cols` item of it) carries $name. */
const named=(item:any,name:string):boolean=>!!item&&typeof item==="object"&&(item.name===name||[...(Array.isArray(item.rows)?item.rows:[]),...(Array.isArray(item.cols)?item.cols:[])].some(child=>named(child,name)));
/**
 * The Form item of a field: its registered field type (`field.editor`, `app.fieldTypes`) when there is one and it
 * returns an item of the field's name, otherwise (unknown editor, a throw, a malformed item: logged) the storage
 * type's built-in item. The server validates the value by the storage type either way.
 */
export const input=(f:FieldDefinition,value:unknown,readOnly=false):any=>{
  const type=fieldTypeOf(f);
  if(type){
    try{const item=type.input(f as FieldMetadata,value,readOnly);if(named(item,f.name))return item;console.error(`61ade: field type "${(f as FieldMetadata).editor}" returned no Form item named "${f.name}".`);}
    catch(error){console.error(`61ade: field type "${(f as FieldMetadata).editor}" failed`,error);}
  }
  return builtinInput(f,value,readOnly);
};
/**
 * Runs `bind` of the registered field types among $fields once their Form exists, shows each conditional field
 * (`visibleWhen`) only while its condition holds and empties the fields an exclusive field `clears` once it gets a
 * value; `toggled` runs after a field appeared or disappeared (a window refits).
 * The returned release aborts their `signal`; the owner calls it when the form closes or is replaced.
 */
export function bindFieldTypes(form:Form,fields:FieldDefinition[],readOnly:(field:FieldDefinition)=>boolean=()=>false,toggled?:()=>void):()=>void{
  const controller=new AbortController(),app=extensions.app;
  const conditional=fields.filter(field=>field.visibleWhen&&form.getItem(field.name));
  if(conditional.length){
    const shown=new Map<string,boolean>();
    const apply=()=>{
      if(controller.signal.aborted)return;
      const values=form.getValue() as Record<string,unknown>;let changed=false;
      for(const field of conditional){
        const active=fieldActive(field,values);
        if(shown.get(field.name)===active)continue;
        if(shown.has(field.name))changed=true;
        shown.set(field.name,active);
        const item=form.getItem(field.name) as any;
        if(active)item.show();else item.hide();
      }
      if(changed)toggled?.();
    };
    apply();
    form.events.on("change",(name:string)=>{if(conditional.some(field=>field.visibleWhen!.field===name))apply();});
  }
  const exclusive=new Map(fields.filter(field=>field.clears?.length&&form.getItem(field.name)).map(field=>[field.name,field.clears!]));
  if(exclusive.size)form.events.on("change",(name:string,value:unknown)=>{
    const others=exclusive.get(name);
    if(controller.signal.aborted||!others||value===undefined||value===null||value===""||value===false)return;
    for(const other of others){const item=form.getItem(other) as any;if(item&&String(item.getValue()??"")!=="")item.setValue("");}
  });
  for(const field of fields){
    if(field.type==="date"&&!readOnly(field)&&!fieldTypeOf(field))keepTypedDate(form,field,controller.signal);
    const type=field.type==="file"?undefined:fieldTypeOf(field);
    if(!type?.bind||!app)continue;
    try{type.bind({app,form,field:field as FieldMetadata,readOnly:readOnly(field),signal:controller.signal});}
    catch(error){console.error(`61ade: field type "${(field as FieldMetadata).editor}" bind failed`,error);}
  }
  return ()=>controller.abort();
}
/**
 * Suite 9.3 DatePicker repaints a typed date away when its popup closes; a typed valid date, or a cleared
 * field, is set again once the input leaves or the popup closes. A pick in the popup wins over earlier typing.
 */
function keepTypedDate(form:Form,field:FieldDefinition,signal:AbortSignal):void{
  const item=form.getItem(field.name) as any;
  if(!item)return;
  let typed:string|undefined;
  const settle=()=>setTimeout(()=>{
    if(signal.aborted||typed===undefined)return;
    const value=typed;typed=undefined;
    if((value===""||calendarDate(value))&&String(dateValue(item.getValue())??"")!==value){if(value==="")item.clear();else item.setValue(value);}
  });
  item.events.on("input",(value:unknown)=>{typed=String(value??"").trim();});
  item.events.on("change",(value:unknown)=>{if(String(dateValue(value)??"")!==typed)typed=undefined;});
  item.events.on("blur",settle);
  item.events.on("afterHide",settle);
}
const builtinInput=(f:FieldDefinition,value:unknown,readOnly=false):any=>f.type==="file"?fileInput(f,value,readOnly):f.type==="multiselect"&&!readOnly?{
  // Native Suite Combo with multiple selection; the kernel accepts the list or its comma-joined form.
  type:"combo",name:f.name,label:f.label,labelPosition:"top",required:f.required,multiselection:true,selectAllButton:false,css:"blade-multiselect-field",
  data:Object.entries(f.options).map(([id,value])=>({id,value})),value:String(value??f.defaultValue??"").split(",").filter(Boolean),
}:f.type==="multiselect"?{type:"input",name:f.name,label:f.label,labelPosition:"top",readOnly:true,value:optionText(f,value)}:f.type==="checkbox"?{
  width:"100%",cols:[
    // The hidden label names the checkbox; Suite otherwise announces it as "checkbox <text>".
    {type:"checkbox",name:f.name,text:f.label,label:f.label,hiddenLabel:true,width:"content",checked:String(value??f.defaultValue??"0")==="1"||value===true,disabled:readOnly},
  ],
}:f.type==="date"&&!readOnly?{
  // Native Suite DatePicker; the value stays the `YYYY-MM-DD` string the kernel validates.
  type:"datepicker",name:f.name,label:f.label,labelPosition:"top",required:f.required,dateFormat:"%Y-%m-%d",valueFormat:"string",
  weekStart:"monday",editable:true,value:String(value??f.defaultValue??""),
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
/** Text of the shared error dialog: the field errors by label (from $fields), otherwise the message. */
export const errorText=(e:unknown,fields:FieldDefinition[]):string=>e && typeof e==="object" && "fieldErrors" in e && Object.values((e as any).fieldErrors??{}).length
  ?Object.entries((e as any).fieldErrors).map(([name,error])=>`${fields.find(f=>f.name===name)?.label??name}: ${error}`).join("\n")
  :e instanceof Error?e.message:t("Sikertelen művelet.");

import { t } from "../../I18n";
import { optionText } from "../../RecordPresentation";
import { fileInput } from "../../FilePicker";
import type { ActionDefinition, FieldDefinition } from "./types";

/** Form item factories and action helpers shared by the list, its forms and the public `RecordForm`. */
export const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Rejection marker of a confirmation the user declined (no error dialog). */
export const DECLINED=Symbol("declined");
const ACTION_ICONS:Record<string,string>={create:"dxi dxi-plus",update:"dxi dxi-pencil",delete:"dxi dxi-delete",password:"dxi dxi-key",get:"dxi dxi-information-outline"};
export const actionIcon=(action:Pick<ActionDefinition,"name"|"icon"|"upload">)=>action.icon??ACTION_ICONS[action.name]??(action.upload?"dxi dxi-file-import":"dxi dxi-check");
/** Protocol values a command sends itself; an action with only these fields runs without a form. */
export const technical=(field:FieldDefinition)=>field.name==="revision"||field.name==="preview"&&field.type==="checkbox";
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
/** Text of the shared error dialog: the field errors by label (from $fields), otherwise the message. */
export const errorText=(e:unknown,fields:FieldDefinition[]):string=>e && typeof e==="object" && "fieldErrors" in e && Object.values((e as any).fieldErrors??{}).length
  ?Object.entries((e as any).fieldErrors).map(([name,error])=>`${fields.find(f=>f.name===name)?.label??name}: ${error}`).join("\n")
  :e instanceof Error?e.message:t("Sikertelen művelet.");

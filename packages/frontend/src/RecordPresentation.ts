import { t } from "./I18n";
import type { Row } from "./Realtime";
import type { ViewDefinition } from "./Workspace";
export const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Display caption of a stored value: option label, or labels of a comma-separated multiple choice. */
export function optionText(field:{type?:string;options?:Record<string,string>},value:unknown):string{
  if(field.type==="multiselect")return String(value??"").split(",").filter(Boolean).map(key=>field.options?.[key]??key).join(", ");
  return field.options?.[String(value)]??String(value??"");
}
/** Suite checkbox surface shared by Grid and DataView templates; ACL controls its presence. */
export function recordCheckbox(row:Row,field:ViewDefinition["columns"][number]):string {
  const value=row[field.id],checked=value===true||String(value)==="1";
  const content=escape(field.options?.[String(value)]??(checked?t("Igen"):t("Nem")));
  if(!field.editable||!row._editable?.includes(field.id))return content;
  return `<label class="blade-card-edit blade-checkbox-edit dhx_checkbox" data-blade-row="${escape(row.id)}" data-blade-field="${escape(field.id)}" title="${content}"><input class="dhx_checkbox__input" type="checkbox" aria-label="${escape(field.header)}" aria-checked="${checked}" ${checked?"checked":""}><span class="dhx_checkbox__visual-input"></span></label>`;
}
/** Icon column: the value is a Suite icon class, `options` maps it to its accessible name. */
export function recordIcon(field:{options?:Record<string,string>},value:unknown):string{
  const icon=String(value??"");
  if(!/^dxi dxi-[a-z0-9-]+$/.test(icon))return "";
  const label=escape(field.options?.[icon]??"");
  return `<span class="blade-record-icon" ${label?`role="img" aria-label="${label}" title="${label}"`:`aria-hidden="true"`}><span class="${icon}"></span></span>`;
}
/** Only declared fields present in the ACL-projected record are rendered. */
export function recordFields(row:Row,fields:ViewDefinition["columns"],editable=false):string{
  return `<dl>${fields.filter(field=>Object.hasOwn(row,field.id)).map(field=>{
    const writable=editable&&field.editable&&row._editable?.includes(field.id);
    const value=row[field.id];
    const content=escape(value==null||value===""?(field.options?.[String(value??"")]??"—"):optionText(field,value));
    return `<div class="blade-grid-card__field"><dt>${escape(field.header)}</dt><dd ${writable&&field.type!=="checkbox"?`class="blade-card-edit" data-blade-field="${escape(field.id)}" tabindex="0" role="button" aria-label="${escape(t("{field} — szerkesztés",{field:field.header}))}"`:""}>${field.type==="checkbox"?recordCheckbox(row,{...field,editable:!!writable}):field.type==="icon"?recordIcon(field,value)+" "+content:content}</dd></div>`;
  }).join("")}</dl>`;
}

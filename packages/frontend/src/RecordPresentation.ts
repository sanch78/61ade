import type { Row } from "./Realtime";
import type { ViewDefinition } from "./Workspace";
export const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Suite checkbox surface shared by Grid and DataView templates; ACL controls its presence. */
export function recordCheckbox(row:Row,field:ViewDefinition["columns"][number]):string {
  const value=row[field.id],checked=value===true||String(value)==="1";
  const content=escape(field.options?.[String(value)]??(checked?"Igen":"Nem"));
  if(!field.editable||!row._editable?.includes(field.id))return content;
  return `<label class="vapa-card-edit vapa-checkbox-edit dhx_checkbox" data-vapa-row="${escape(row.id)}" data-vapa-field="${escape(field.id)}" title="${content}"><input class="dhx_checkbox__input" type="checkbox" aria-label="${escape(field.header)}" aria-checked="${checked}" ${checked?"checked":""}><span class="dhx_checkbox__visual-input"></span></label>`;
}
/** Only declared fields present in the ACL-projected record are rendered. */
export function recordFields(row:Row,fields:ViewDefinition["columns"],editable=false):string{
  return `<dl>${fields.filter(field=>Object.hasOwn(row,field.id)).map(field=>{
    const writable=editable&&field.editable&&row._editable?.includes(field.id);
    const value=row[field.id];
    const content=escape(field.options?.[String(value)]??(value==null||value===""?"—":value));
    return `<div class="vapa-grid-card__field"><dt>${escape(field.header)}</dt><dd ${writable&&field.type!=="checkbox"?`class="vapa-card-edit" data-vapa-field="${escape(field.id)}" tabindex="0" role="button" aria-label="${escape(field.header)} — szerkesztés"`:""}>${field.type==="checkbox"?recordCheckbox(row,{...field,editable:!!writable}):content}</dd></div>`;
  }).join("")}</dl>`;
}

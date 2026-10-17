import type { Row } from "./Realtime";
import type { ViewDefinition } from "./Workspace";
export const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Only declared fields present in the ACL-projected record are rendered. */
export function recordFields(row:Row,fields:ViewDefinition["columns"]):string{
  return `<dl>${fields.filter(field=>Object.hasOwn(row,field.id)).map(field=>{
    const value=row[field.id];
    const content=escape(field.options?.[String(value)]??(value==null||value===""?"—":value));
    const checked=value===true||String(value)==="1";
    return `<div class="vapa-grid-card__field"><dt>${escape(field.header)}</dt><dd>${field.type==="checkbox"?`<span role="checkbox" aria-label="${escape(field.header)}" aria-checked="${checked}">${checked?"☑":"☐"}</span> `:""}${content}</dd></div>`;
  }).join("")}</dl>`;
}

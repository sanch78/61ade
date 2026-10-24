import { t } from "./I18n";
import type { Row } from "./Realtime";
import type { ViewDefinition } from "./Workspace";
import { actionUrl } from "./ActionUrl";
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
const ICON=/^dxi dxi-[a-z0-9-]+$/;
/** Name of an icon value: its option label, otherwise the readable class ("dxi dxi-image-outline" → "image outline"). */
export const iconLabel=(field:{options?:Record<string,string>},value:unknown):string=>{const icon=String(value??"");return field.options?.[icon]||icon.replace(/^dxi dxi-/,"").replace(/-/g," ");};
/**
 * Icon column: the value is a Suite icon class, `options` maps it to its accessible name. Without a
 * label the glyph is never the only meaning: a visually hidden text names it. `decorative` is for a
 * caller that shows the name as visible text beside it.
 */
export function recordIcon(field:{options?:Record<string,string>},value:unknown,decorative=false):string{
  const icon=String(value??"");
  if(!ICON.test(icon))return "";
  if(decorative)return `<span class="blade-record-icon" aria-hidden="true"><span class="${icon}"></span></span>`;
  const label=escape(field.options?.[icon]??"");
  if(label)return `<span class="blade-record-icon" role="img" aria-label="${label}" title="${label}"><span class="${icon}"></span></span>`;
  return `<span class="blade-record-icon"><span class="${icon}" aria-hidden="true"></span><span class="blade-record-icon__label">${escape(iconLabel(field,icon))}</span></span>`;
}
/** Server media descriptor of a media column (`row._media[field]`); absent or null when the actor may not see it. */
export type MediaDescriptor={id:string;name:string;mime_type:string;revision:string;duration_ms:number|null;width:number|null;height:number|null;thumbnail:"ready"|"pending"|"failed"|"none"};
type Column={id:string;type?:string;media?:string;presentation?:string;options?:Record<string,string>};
/** A media column is a presentation of a file-id value (`media` names the file resource), whatever its field type. */
export const isMedia=(field:Column)=>typeof field.media==="string"&&field.media!==""||field.type==="media";
export const isIcon=(field:Column)=>field.type==="icon"||field.presentation==="icon";
export const mediaOf=(field:{id:string},row:Row):MediaDescriptor|undefined=>{const media=(row._media as Record<string,MediaDescriptor|null>|undefined)?.[field.id];return media&&typeof media==="object"&&typeof media.id==="string"?media:undefined;};
const failedThumbnails=new Set<string>();
/** An unavailable thumbnail (404/415 while missing, or a decode error) shows the type icon; later renders skip that URL. */
export function thumbnailFailed(image:HTMLImageElement):void{
  failedThumbnails.add(image.getAttribute("src")??"");image.closest(".blade-media")?.classList.add("blade-media--failed");image.remove();
}
export const duration=(ms:number)=>{const s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s/60)%60,r=String(s%60).padStart(2,"0");return h?`${h}:${String(m).padStart(2,"0")}:${r}`:`${m}:${r}`;};
/** Type in text for the accessible name; icon and colour only repeat it. */
export function mediaLabel(media:MediaDescriptor):string{
  const kind=media.mime_type.startsWith("video/")?"video":media.mime_type.startsWith("image/")?"image":"file";
  return (kind==="video"?t("Videó"):kind==="image"?t("Kép"):t("Fájl"))+": "+media.name+(kind==="video"&&typeof media.duration_ms==="number"?", "+duration(media.duration_ms):"");
}
/** Lazy thumbnail (`thumbnail_get`) with a type-icon fallback and a video length badge; all text escaped, no inline handlers. */
export function recordMedia(field:Column,row:Row,size:"cell"|"card"|"tile"="cell"):string{
  const media=mediaOf(field,row);
  if(!media)return size==="cell"?"":`<span class="blade-media blade-media--${size} blade-media--empty" aria-hidden="true"></span>`;
  const kind=media.mime_type.startsWith("video/")?"video":media.mime_type.startsWith("image/")?"image":"file";
  const url=media.thumbnail==="ready"&&field.media?actionUrl(field.media,"thumbnail_get",media.id,media.revision):"";
  const label=escape(mediaLabel(media)),failed=!!url&&failedThumbnails.has(url);
  return `<span class="blade-media blade-media--${size} blade-media--${kind}${failed?" blade-media--failed":""}" role="img" aria-label="${label}" title="${label}"><span class="blade-media__icon dxi ${kind==="video"?"dxi-menu-right":kind==="image"?"dxi-image-outline":"dxi-file-outline"}" aria-hidden="true"></span>${url&&!failed?`<img class="blade-media__image" src="${escape(url)}" alt="" loading="lazy" decoding="async" data-blade-thumbnail>`:""}${kind==="video"&&typeof media.duration_ms==="number"?`<span class="blade-media__duration" aria-hidden="true">${escape(duration(media.duration_ms))}</span>`:""}</span>`;
}
/**
 * Detail/card fields with the presentation of the matching grid column (`media`, `presentation`, icon
 * `options`) when a field definition does not carry it itself, so every media or icon field renders as such.
 */
export function presentedFields<T extends Column>(fields:T[],columns:Column[]):T[]{
  return fields.map(field=>{
    const column=columns.find(c=>c.id===field.id);
    if(!column)return field;
    return {...field,...(field.media===undefined&&column.media!==undefined?{media:column.media}:{}),...(field.presentation===undefined&&column.presentation!==undefined?{presentation:column.presentation}:{}),
      ...(!field.options&&column.options?{options:column.options}:{})};
  });
}
/** Only declared fields present in the ACL-projected record are rendered; every media and icon field shows its media or icon. */
export function recordFields(row:Row,fields:ViewDefinition["columns"],editable=false):string{
  return `<dl>${fields.filter(field=>Object.hasOwn(row,field.id)).map(field=>{
    const writable=editable&&field.editable&&row._editable?.includes(field.id);
    const value=row[field.id];
    const content=escape(value==null||value===""?(field.options?.[String(value??"")]??"—"):optionText(field,value));
    // An icon is shown with its name as visible text, so the glyph itself stays decorative.
    const glyph=isIcon(field)?recordIcon(field,value,true):"";
    return `<div class="blade-grid-card__field"><dt>${escape(field.header)}</dt><dd ${writable&&field.type!=="checkbox"?`class="blade-card-edit" data-blade-field="${escape(field.id)}" tabindex="0" role="button" aria-label="${escape(t("{field} — szerkesztés",{field:field.header}))}"`:""}>${field.type==="checkbox"?recordCheckbox(row,{...field,editable:!!writable}):isMedia(field)?recordMedia(field,row,"card")+(mediaOf(field,row)?"":"—"):glyph?glyph+" "+escape(iconLabel(field,value)):content}</dd></div>`;
  }).join("")}</dl>`;
}

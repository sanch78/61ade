import { locale, t } from "./I18n";
import type { Row } from "./Realtime";
import type { ViewDefinition } from "./components/list/types";
import { actionUrl } from "./ActionUrl";
import { requestConfirmation } from "./MessageDialog";
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
/** Derived media part of a field-less column: `media_of` names the media field whose `_media` it reads. */
export type MediaPart="type"|"resolution"|"duration";
type Column={id:string;type?:string;media?:string;presentation?:string;imageBase?:string;image_base?:string;altOf?:string;alt_of?:string;options?:Record<string,string>;mediaOf?:string;media_of?:string;part?:MediaPart};
/** A media column is a presentation of a file-id value (`media` names the file resource), whatever its field type. */
export const isMedia=(field:Column)=>typeof field.media==="string"&&field.media!==""||field.type==="media";
export const isIcon=(field:Column)=>field.type==="icon"||field.presentation==="icon";
/** Static image column: a plain file name of the application below the declared page-relative base. */
export const isImage=(field:Column)=>field.presentation==="image"&&typeof imageBaseOf(field)==="string";
const imageBaseOf=(field:Column)=>field.imageBase??field.image_base;
const IMAGE_BASE=/^(?:\/|(?:\.\.\/)*)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/$/,IMAGE_FILE=/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp|gif|svg)$/i;
/** URL of a static image value; empty unless the base and the single file name follow the server rules (never an arbitrary URL). */
export function imageUrl(field:Column,value:unknown):string{
  const base=imageBaseOf(field),name=typeof value==="string"?value:"";
  return typeof base==="string"&&IMAGE_BASE.test(base)&&name.length<=255&&!name.includes("..")&&IMAGE_FILE.test(name)?base+encodeURIComponent(name):"";
}
export const mediaOf=(field:{id:string},row:Row):MediaDescriptor|undefined=>{const media=(row._media as Record<string,MediaDescriptor|null>|undefined)?.[field.id];return media&&typeof media==="object"&&typeof media.id==="string"?media:undefined;};
/** The media field a derived column presents (`media_of`, camel-cased or not), or undefined for an ordinary column. */
export const derivedOf=(field:Column):string|undefined=>{const of=field.mediaOf??field.media_of;return typeof of==="string"&&of!==""&&!!field.part?of:undefined;};
/** Text of one media part: `Kép`/`Videó`, `1920 × 1080`, `0:06`; empty when the part does not apply. */
export function mediaPart(media:MediaDescriptor|undefined,part:MediaPart|undefined):string{
  if(!media)return "";
  const kind=media.mime_type.startsWith("video/")?"video":media.mime_type.startsWith("image/")?"image":"file";
  if(part==="type")return kind==="video"?t("Videó"):kind==="image"?t("Kép"):t("Fájl");
  if(part==="resolution")return typeof media.width==="number"&&typeof media.height==="number"&&media.width>0&&media.height>0?`${media.width} × ${media.height}`:"";
  if(part==="duration")return kind==="video"&&typeof media.duration_ms==="number"?duration(media.duration_ms):"";
  return "";
}
/** Derived column text of a row (`media_of`/`part`); null when the column is not derived. */
export function derivedText(field:Column,row:Row):string|null{
  const of=derivedOf(field);if(!of)return null;
  return mediaPart(mediaOf({id:of},row),field.part);
}
/** Whether the record carries the media slot a derived column reads (the media field is readable). */
const hasDerived=(field:Column,row:Row)=>{const of=derivedOf(field),media=row._media;return !!of&&!!media&&typeof media==="object"&&Object.hasOwn(media as object,of);};
/** Display text of a column value in tiles and lists: derived media part, option label or the value. */
export const columnText=(field:Column,row:Row):string=>derivedText(field,row)??optionText(field,row[field.id]);
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
 * Static image column (`presentation: image`): `<img>` of `imageBase` + file name in the media slot sizes; a load
 * error shows the placeholder icon (shared with thumbnails, never retried). `alt_of` names a text field of the row,
 * otherwise the image is decorative because the title is shown beside it.
 */
export function recordImage(field:Column,row:Row,size:"cell"|"card"|"tile"="cell"):string{
  const url=imageUrl(field,row[field.id]);
  if(!url)return size==="cell"?"":`<span class="blade-media blade-media--${size} blade-media--image blade-media--empty" aria-hidden="true"></span>`;
  const of=field.altOf??field.alt_of,alt=of&&row[of]!=null?escape(row[of]):"",failed=failedThumbnails.has(url);
  return `<span class="blade-media blade-media--${size} blade-media--image${failed?" blade-media--failed":""}" ${alt?`role="img" aria-label="${alt}" title="${alt}"`:`aria-hidden="true"`}><span class="blade-media__icon dxi dxi-image-outline" aria-hidden="true"></span>${failed?"":`<img class="blade-media__image" src="${escape(url)}" alt="" loading="lazy" decoding="async" data-blade-static-image>`}</span>`;
}
/** Media slot of a media or static image column. */
export const recordSlot=(field:Column,row:Row,size:"cell"|"card"|"tile"="cell"):string=>isImage(field)?recordImage(field,row,size):recordMedia(field,row,size);
/** Whether the row has something to show in the media slot of the column. */
export const hasSlot=(field:Column,row:Row):boolean=>isImage(field)?imageUrl(field,row[field.id])!=="":!!mediaOf(field,row);
/**
 * Detail/card fields with the presentation of the matching grid column (`media`, `presentation`, icon
 * `options`) when a field definition does not carry it itself, so every media or icon field renders as such.
 */
export function presentedFields<T extends Column>(fields:T[],columns:Column[]):T[]{
  return fields.map(field=>{
    const column=columns.find(c=>c.id===field.id);
    if(!column)return field;
    return {...field,...(field.media===undefined&&column.media!==undefined?{media:column.media}:{}),...(field.presentation===undefined&&column.presentation!==undefined?{presentation:column.presentation}:{}),
      ...(column.presentation==="image"?{imageBase:column.imageBase??column.image_base,altOf:column.altOf??column.alt_of}:{}),
      ...(!field.options&&column.options?{options:column.options}:{})};
  });
}
/** Fields with the derived media columns (`media_of`) of the view placed right after the media field they present. */
export function withDerived<T extends {id:string}>(fields:T[],columns:(Column&{header:string})[]):T[]{
  const derived=columns.filter(column=>derivedOf(column)&&!fields.some(field=>field.id===column.id));
  if(!derived.length)return fields;
  return fields.flatMap(field=>[field,...derived.filter(column=>derivedOf(column)===field.id) as unknown as T[]]);
}
/** Only declared fields present in the ACL-projected record are rendered; every media and icon field shows its media or icon. */
export function recordFields(row:Row,fields:ViewDefinition["columns"],editable=false):string{
  return `<dl>${fields.filter(field=>Object.hasOwn(row,field.id)||hasDerived(field,row)).map(field=>{
    const derived=derivedText(field,row);
    if(derived!==null)return `<div class="blade-grid-card__field"><dt>${escape(field.header)}</dt><dd>${escape(derived||"—")}</dd></div>`;
    const writable=editable&&field.editable&&row._editable?.includes(field.id);
    const value=row[field.id];
    const content=escape(value==null||value===""?(field.options?.[String(value??"")]??"—"):optionText(field,value));
    // An icon is shown with its name as visible text, so the glyph itself stays decorative.
    const glyph=isIcon(field)?recordIcon(field,value,true):"";
    return `<div class="blade-grid-card__field"><dt>${escape(field.header)}</dt><dd ${writable&&field.type!=="checkbox"?`class="blade-card-edit" data-blade-field="${escape(field.id)}" tabindex="0" role="button" aria-label="${escape(t("{field} — szerkesztés",{field:field.header}))}"`:""}>${field.type==="checkbox"?recordCheckbox(row,{...field,editable:!!writable}):isMedia(field)?recordMedia(field,row,"card")+(mediaOf(field,row)?"":"—"):isImage(field)?recordImage(field,row,"card")+(imageUrl(field,value)?"":"—"):glyph?glyph+" "+escape(iconLabel(field,value)):content}</dd></div>`;
  }).join("")}</dl>`;
}

/** One reference count of a usage provider (`label` is already translated by the server). */
export type Usage={label:string;count:number};
/** Usage counts summed per label, in first-seen order; zero counts are dropped. */
export function mergeUsages(lists:(Usage[]|undefined|null)[]):Usage[]{
  const merged=new Map<string,number>();
  for(const list of lists)for(const usage of Array.isArray(list)?list:[])if(usage&&typeof usage.label==="string"&&Number(usage.count)>0)merged.set(usage.label,(merged.get(usage.label)??0)+Number(usage.count));
  return [...merged].map(([label,count])=>({label,count}));
}
/**
 * The one danger confirmation of a delete whose records are referenced: the declared message, the
 * usage counts ("Műsorterv-események: 2") and the consequence. Resolves false on Cancel/Escape.
 */
export function confirmUsages(options:{message:string;title?:string;confirmLabel?:string;cancelLabel?:string;usages:Usage[]}):Promise<boolean>{
  const lines=options.usages.map(usage=>`${usage.label}: ${usage.count.toLocaleString(locale())}`);
  return requestConfirmation({severity:"danger",title:options.title??t("Törlés"),confirmLabel:options.confirmLabel??t("Törlés"),cancelLabel:options.cancelLabel,
    message:[options.message,"",t("Hivatkozások:"),...lines,"",t("Törléskor a hivatkozások törlődnek.")].join("\n")});
}
/** Toast line of the references a delete cleared (`cleared: {label: count}`); empty when none. */
export function clearedText(...cleared:unknown[]):string{
  const merged=new Map<string,number>();
  for(const item of cleared)if(item&&typeof item==="object"&&!Array.isArray(item))for(const [label,count] of Object.entries(item as Record<string,unknown>))if(Number(count)>0)merged.set(label,(merged.get(label)??0)+Number(count));
  return merged.size?t("Törölt hivatkozások: {list}",{list:[...merged].map(([label,count])=>`${label}: ${count.toLocaleString(locale())}`).join(", ")}):"";
}

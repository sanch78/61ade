import { locale, t } from "./I18n";
import type { Row } from "./Realtime";
import type { ViewDefinition } from "./components/list/types";
import { actionUrl } from "./ActionUrl";
import { requestConfirmation } from "./MessageDialog";
import type { ColumnPresentation, MediaType } from "./api/types";
import { extensions, type Resolved } from "./app/registries";
export const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Display caption of a stored value: option label, or labels of a comma-separated multiple choice. */
export function optionText(field:{type?:string;options?:Record<string,string>},value:unknown):string{
  if(field.type==="multiselect")return String(value??"").split(",").filter(Boolean).map(key=>field.options?.[key]??key).join(", ");
  return field.options?.[String(value)]??String(value??"");
}
const TONES=new Set(["primary","secondary","success","warning","danger"]);
/**
 * $html (the escaped text of a value) as a label in the theme tone the field declares for the value (`tones`, FB-0212);
 * unchanged without one or for an empty text. The text stays visible, so colour is never the only signal.
 */
export function toned(field:{tones?:Record<string,string>},value:unknown,html:string):string{
  const tone=field.tones?.[String(value??"")];
  return tone&&TONES.has(tone)&&html!==""?`<span class="blade-tone blade-tone--${tone}">${html}</span>`:html;
}
/** Suite checkbox surface shared by Grid and DataView templates; ACL controls its presence. */
export function recordCheckbox(row:Row,field:ViewDefinition["columns"][number]):string {
  const value=row[field.id],checked=value===true||String(value)==="1";
  const content=escape(field.options?.[String(value)]??(checked?t("Igen"):t("Nem")));
  if(!field.editable||!row._editable?.includes(field.id))return content;
  return `<label class="blade-card-edit blade-checkbox-edit dhx_checkbox" data-blade-row="${escape(row.id)}" data-blade-field="${escape(field.id)}" title="${content}"><input class="dhx_checkbox__input" type="checkbox" aria-label="${escape(field.header)}" aria-checked="${checked}" ${checked?"checked":""}><span class="dhx_checkbox__visual-input"></span></label>`;
}
const ICON=/^(?:dxi dxi-|bi bi-)[a-z0-9-]+$/;
/** Name of an icon value: its option label, otherwise the readable class ("bi bi-image" → "image"). */
export const iconLabel=(field:{options?:Record<string,string>},value:unknown):string=>{const icon=String(value??"");return field.options?.[icon]||icon.replace(/^(?:dxi dxi-|bi bi-)/,"").replace(/-/g," ");};
/**
 * Icon column: the value is an icon class, `options` maps it to its accessible name. Without a
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
/** Derived media part of a field-less column: `mediaOf` names the media field whose `_media` it reads. */
export type MediaPart="type"|"resolution"|"duration";
type Column={id:string;type?:string;media?:string;detailsWidth?:number;presentation?:string;imageBase?:string;altOf?:string;options?:Record<string,string>;tones?:Record<string,string>;mediaOf?:string;part?:MediaPart}&Resolved;
/** A media column is a presentation of a file-id value (`media` names the file resource), whatever its field type. */
export const isMedia=(field:Column)=>typeof field.media==="string"&&field.media!==""||field.type==="media";
export const isIcon=(field:Column)=>field.type==="icon"||field.presentation==="icon";
/** Static image column: a plain file name of the application below the declared page-relative base. */
export const isImage=(field:Column)=>field.presentation==="image"&&typeof field.imageBase==="string";
const IMAGE_BASE=/^(?:\/|(?:\.\.\/)*)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/$/,IMAGE_FILE=/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp|gif|svg)$/i;
/** URL of a static image value; empty unless the base and the single file name follow the server rules (never an arbitrary URL). */
export function imageUrl(field:Column,value:unknown):string{
  const base=field.imageBase,name=typeof value==="string"?value:"";
  return typeof base==="string"&&IMAGE_BASE.test(base)&&name.length<=255&&!name.includes("..")&&IMAGE_FILE.test(name)?base+encodeURIComponent(name):"";
}
export const mediaOf=(field:{id:string},row:Row):MediaDescriptor|undefined=>{const media=(row._media as Record<string,MediaDescriptor|null>|undefined)?.[field.id];return media&&typeof media==="object"&&typeof media.id==="string"?media:undefined;};
/** The media field a derived column presents (`mediaOf`), or undefined for an ordinary column. */
export const derivedOf=(field:Column):string|undefined=>{const of=field.mediaOf;return typeof of==="string"&&of!==""&&!!field.part?of:undefined;};
/** MIME class of a media descriptor: video, image, audio or (anything else) file. */
const mediaKind=(media:MediaDescriptor):"video"|"image"|"audio"|"file"=>{const kind=media.mime_type.split("/")[0];return kind==="video"||kind==="image"||kind==="audio"?kind:"file";};
/** Built-in media types, registered on `app.mediaTypes` by builtins.ts (fixtures without an Application use them directly). */
export const builtinMediaTypes:Readonly<Record<"image"|"video"|"audio",MediaType>>=Object.freeze({
  image:{mime:["image/*"],label:"Kép",icon:"bi bi-image"},
  video:{mime:["video/*"],label:"Videó",icon:"bi bi-camera-video"},
  audio:{mime:["audio/*"],label:"Hang",icon:"bi bi-music-note-beamed"},
});
const FILE_TYPE:MediaType={mime:[],label:"Fájl",icon:"bi bi-file-earmark"};
/** The page's media types (`app.mediaTypes`) in registration order; an entry without a usable shape is skipped. */
export function mediaTypeEntries():MediaType[]{
  const registry=extensions.mediaTypes;
  return (registry?registry.names().map(name=>registry.get(name)):Object.values(builtinMediaTypes))
    .filter((entry):entry is MediaType=>!!entry&&Array.isArray(entry.mime)&&typeof entry.label==="string"&&typeof entry.icon==="string");
}
/** The registered type of a MIME type: an entry naming it exactly before one naming its class (`audio/*`); undefined when none does. */
export function findMediaType(mime:string):MediaType|undefined{
  const value=String(mime).toLowerCase(),entries=mediaTypeEntries();
  return entries.find(entry=>entry.mime.includes(value))??entries.find(entry=>entry.mime.includes(value.split("/")[0]+"/*"));
}
/** The media type of a MIME type, the generic file when no entry matches. */
export const mediaType=(mime:string):MediaType=>findMediaType(mime)??FILE_TYPE;
/** Translated label and icon classes of a MIME type. */
export const mediaTypeLabel=(mime:string)=>t(mediaType(mime).label);
export const mediaTypeIcon=(mime:string)=>mediaType(mime).icon;
/** Length text of a video or audio file; empty for other media or an unknown length. */
const mediaLength=(media:MediaDescriptor)=>{const kind=mediaKind(media);return (kind==="video"||kind==="audio")&&typeof media.duration_ms==="number"?duration(media.duration_ms):"";};
/** Text of one media part: `Kép`/`Videó`/`Hang`, `1920 × 1080`, `0:06`; empty when the part does not apply. */
export function mediaPart(media:MediaDescriptor|undefined,part:MediaPart|undefined):string{
  if(!media)return "";
  if(part==="type")return mediaTypeLabel(media.mime_type);
  if(part==="resolution")return typeof media.width==="number"&&typeof media.height==="number"&&media.width>0&&media.height>0?`${media.width} × ${media.height}`:"";
  if(part==="duration")return mediaLength(media);
  return "";
}
/** Derived column text of a row (`mediaOf`/`part`); null when the column is not derived. */
export function derivedText(field:Column,row:Row):string|null{
  const of=derivedOf(field);if(!of)return null;
  return mediaPart(mediaOf({id:of},row),field.part);
}
/** Whether the record carries the media slot a derived column reads (the media field is readable). */
const hasDerived=(field:Column,row:Row)=>{const of=derivedOf(field),media=row._media;return !!of&&!!media&&typeof media==="object"&&Object.hasOwn(media as object,of);};
/** Display text of a column value in tiles and lists: derived media part, option label or the value. */
export const columnText=(field:Column,row:Row):string=>field.text?.(row)??derivedText(field,row)??optionText(field,row[field.id]);
const failedThumbnails=new Set<string>();
/** An unavailable thumbnail (404/415 while missing, or a decode error) shows the type icon; later renders skip that URL. */
export function thumbnailFailed(image:HTMLImageElement):void{
  failedThumbnails.add(image.getAttribute("src")??"");image.closest(".blade-media")?.classList.add("blade-media--failed");image.remove();
}
export const duration=(ms:number)=>{const s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s/60)%60,r=String(s%60).padStart(2,"0");return h?`${h}:${String(m).padStart(2,"0")}:${r}`:`${m}:${r}`;};
/** Type in text for the accessible name; icon and colour only repeat it. */
export function mediaLabel(media:MediaDescriptor):string{
  const length=mediaLength(media);
  return mediaTypeLabel(media.mime_type)+": "+media.name+(length?", "+length:"");
}
/**
 * Class and style of a media slot sized in the details (`detailsWidth`, FB-0218): its width, and the file's aspect ratio
 * when the descriptor knows it (kept between 1:4 and 4:1); without one the slot keeps its kind's ratio, so the
 * placeholder of a missing file or a pending thumbnail has the same box.
 */
function sizedSlot(width:number|undefined,media?:MediaDescriptor):{css:string;style:string}{
  if(!width)return {css:"",style:""};
  const ratio=media&&typeof media.width==="number"&&typeof media.height==="number"&&media.width>0&&media.height>0?Math.min(4,Math.max(.25,media.width/media.height)):0;
  return {css:" blade-media--sized",style:` style="--blade-media-width:${Math.trunc(width)}px${ratio?`;--blade-media-ratio:${ratio.toFixed(4)}`:""}"`};
}
/**
 * Lazy thumbnail (`thumbnail_get`) with a type-icon fallback and a video or audio length badge; all text escaped, no
 * inline handlers. `width`: the slot's width in the record details (`detailsWidth`).
 */
export function recordMedia(field:Column,row:Row,size:"cell"|"card"|"tile"="cell",width?:number):string{
  const media=mediaOf(field,row),sized=sizedSlot(width,media);
  if(!media)return size==="cell"?"":`<span class="blade-media blade-media--${size}${sized.css} blade-media--empty"${sized.style} aria-hidden="true"></span>`;
  const kind=mediaKind(media),length=mediaLength(media);
  const url=media.thumbnail==="ready"&&field.media?actionUrl(field.media,"thumbnail_get",media.id,media.revision):"";
  const label=escape(mediaLabel(media)),failed=!!url&&failedThumbnails.has(url);
  return `<span class="blade-media blade-media--${size}${sized.css} blade-media--${kind}${failed?" blade-media--failed":""}"${sized.style} role="img" aria-label="${label}" title="${label}"><span class="blade-media__icon ${escape(mediaTypeIcon(media.mime_type))}" aria-hidden="true"></span>${url&&!failed?`<img class="blade-media__image" src="${escape(url)}" alt="" loading="lazy" decoding="async" data-blade-thumbnail>`:""}${length?`<span class="blade-media__duration" aria-hidden="true">${escape(length)}</span>`:""}</span>`;
}
/**
 * Static image column (`presentation: image`): `<img>` of `imageBase` + file name in the media slot sizes; a load
 * error shows the placeholder icon (shared with thumbnails, never retried). `altOf` names a text field of the row,
 * otherwise the image is decorative because the title is shown beside it.
 */
export function recordImage(field:Column,row:Row,size:"cell"|"card"|"tile"="cell"):string{
  const url=imageUrl(field,row[field.id]);
  if(!url)return size==="cell"?"":`<span class="blade-media blade-media--${size} blade-media--image blade-media--empty" aria-hidden="true"></span>`;
  const of=field.altOf,alt=of&&row[of]!=null?escape(row[of]):"",failed=failedThumbnails.has(url);
  return `<span class="blade-media blade-media--${size} blade-media--image${failed?" blade-media--failed":""}" ${alt?`role="img" aria-label="${alt}" title="${alt}"`:`aria-hidden="true"`}><span class="blade-media__icon bi bi-image" aria-hidden="true"></span>${failed?"":`<img class="blade-media__image" src="${escape(url)}" alt="" loading="lazy" decoding="async" data-blade-static-image>`}</span>`;
}
/**
 * The built-in `image` presentation (registered on `app.presentations` by builtins.ts). A static image column renders
 * through the registry entry its list resolved (`column.render`, `listDefinition`); without one (a fixture without an
 * Application) through this renderer directly.
 */
export const imagePresentation:ColumnPresentation={render:(_value,row,column,size)=>recordImage(column as Column,row,size)};
export const imageSlot=(field:Column,row:Row,size:"cell"|"card"|"tile"="cell"):string=>field.render?field.render(row,size):recordImage(field,row,size);
/** Media slot of a media or static image column. */
export const recordSlot=(field:Column,row:Row,size:"cell"|"card"|"tile"="cell"):string=>isImage(field)?imageSlot(field,row,size):recordMedia(field,row,size);
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
    return {...field,...(field.media===undefined&&column.media!==undefined?{media:column.media}:{}),...(field.detailsWidth===undefined&&column.detailsWidth!==undefined?{detailsWidth:column.detailsWidth}:{}),...(field.presentation===undefined&&column.presentation!==undefined?{presentation:column.presentation}:{}),
      ...(column.presentation==="image"?{imageBase:column.imageBase,altOf:column.altOf}:{}),
      ...(!field.options&&column.options?{options:column.options}:{}),...(!field.tones&&column.tones?{tones:column.tones}:{})};
  });
}
/** Fields with the derived media columns (`mediaOf`) of the view placed right after the media field they present. */
export function withDerived<T extends {id:string}>(fields:T[],columns:(Column&{header:string})[]):T[]{
  const derived=columns.filter(column=>derivedOf(column)&&!fields.some(field=>field.id===column.id));
  if(!derived.length)return fields;
  return fields.flatMap(field=>[field,...derived.filter(column=>derivedOf(column)===field.id) as unknown as T[]]);
}
/** A long text field (`textarea` without a custom display): clamped in a card to its `cardLines` (0: all of it). */
const longText=(field:ViewDefinition["columns"][number])=>field.type==="textarea"&&!(!isMedia(field)&&!isImage(field)&&field.render);
/**
 * Only declared fields present in the ACL-projected record are rendered; every media and icon field shows its media or
 * icon. With field sections (`section`, FB-0177) the fields form groups: one framed group per section at the place of
 * its first field (the other short fields one untitled group at the place of the first of them), laid out in as many
 * columns as the card or details are wide enough for (240 px each). A long text outside every section stands where its
 * `placement` says (FB-0225): below all groups across the whole width (`end`, the default), at its place among the
 * groups across the whole width (`row`), or at its place as a group of its own, one column wide, titled by its label
 * and without a label row (`group`). Without sections the fields stay one list in their order (`placement` too).
 *
 * `details` (the record details: `RecordDetails` and `Adatok`; cards leave it out): a section whose only shown field is
 * a media field shows its heading and the media without a label row (FB-0223); a media field's `detailsWidth` sizes its
 * image (FB-0218), and the automatic columns are then at least that group's width.
 */
export function recordFields(row:Row,fields:ViewDefinition["columns"],editable=false,details=false):string{
  const shown=fields.filter(field=>Object.hasOwn(row,field.id)||hasDerived(field,row));
  const item=(field:ViewDefinition["columns"][number])=>recordField(row,field,editable,details);
  if(!shown.some(field=>field.section))return `<dl>${shown.map(item).join("")}</dl>`;
  // Keys in placement order: `s:<label>` a section, "" the other short fields, `r:`/`g:<id>` a long text as a row or a group.
  const groups=new Map<string,ViewDefinition["columns"]>(),wide:ViewDefinition["columns"]=[];
  for(const field of shown){
    if(!field.section&&longText(field)){
      if(field.placement==="row"||field.placement==="group")groups.set((field.placement==="row"?"r:":"g:")+field.id,[field]);
      else wide.push(field);
      continue;
    }
    const key=field.section?"s:"+field.section:"";
    groups.set(key,[...(groups.get(key)??[]),field]);
  }
  let widest=0;
  const group=([key,members]:[string,ViewDefinition["columns"]])=>{
    const only=members[0];
    if(key.startsWith("r:"))return `<dl class="blade-record-wide blade-record-wide--row">${item(only)}</dl>`;
    if(key.startsWith("g:"))return `<section class="blade-record-group blade-record-group--text"><div class="blade-record-group__title">${escape(only.header)}</div>${recordField(row,only,editable,details,false)}</section>`;
    if(!details||!key||members.length!==1||!isMedia(only))return `<section class="blade-record-group${members.some(longText)?" blade-record-group--wide":""}">${key?`<div class="blade-record-group__title">${escape(key.slice(2))}</div>`:""}<dl>${members.map(item).join("")}</dl></section>`;
    widest=Math.max(widest,only.detailsWidth??0);
    return `<section class="blade-record-group blade-record-group--media"><div class="blade-record-group__title">${escape(key.slice(2))}</div><div class="blade-record-group__media">${recordMedia(only,row,"card",only.detailsWidth)}${mediaOf(only,row)?"":"—"}</div></section>`;
  };
  const html=[...groups].map(group).join("");
  return `<div class="blade-record-groups"${widest?` style="--blade-record-media-width:${Math.trunc(widest)}px"`:""}>${html}</div>${wide.length?`<dl class="blade-record-wide">${wide.map(item).join("")}</dl>`:""}`;
}
/**
 * One field of `recordFields`: its label and its presented value (an editable one opens its editor); `details` sizes media.
 * `label` false: the value alone, for a long text whose group's heading is its label (`placement: "group"`, FB-0225).
 */
function recordField(row:Row,field:ViewDefinition["columns"][number],editable:boolean,details=false,label=true):string{
  const derived=derivedText(field,row);
  if(derived!==null)return `<div class="blade-grid-card__field"><dt>${escape(field.header)}</dt><dd>${escape(derived||"—")}</dd></div>`;
  const writable=editable&&field.editable&&row._editable?.includes(field.id);
  const value=row[field.id];
  // A registered presentation or field-type display (`column.render`) shows the value; a field type edits in the edit window, also a checkbox.
  const custom=!isMedia(field)&&!isImage(field)&&field.render?field.render(row,"card"):undefined;
  const content=escape(value==null||value===""?(field.options?.[String(value??"")]??"—"):optionText(field,value));
  // An icon is shown with its name as visible text, so the glyph itself stays decorative.
  const glyph=isIcon(field)?recordIcon(field,value,true):"";
  // Long text (`textarea`) is clamped to its `cardLines` (default 4, 0 all of it) in a card (admin.css); the details show all of it.
  const lines=field.type==="textarea"&&custom===undefined?field.cardLines??4:0;
  const edit=writable&&(field.type!=="checkbox"||field.fieldType)?`data-blade-field="${escape(field.id)}" tabindex="0" role="button" aria-label="${escape(t("{field} — szerkesztés",{field:field.header}))}"`:"";
  const shown=custom!==undefined?custom:field.type==="checkbox"?recordCheckbox(row,{...field,editable:!!writable&&!field.fieldType}):isMedia(field)?recordMedia(field,row,"card",details?field.detailsWidth:undefined)+(mediaOf(field,row)?"":"—"):isImage(field)?imageSlot(field,row,"card")+(imageUrl(field,value)?"":"—"):glyph?glyph+" "+escape(iconLabel(field,value)):toned(field,value,content);
  const shownValue=label?`<dt>${escape(field.header)}</dt><dd ${edit?`class="blade-card-edit" ${edit}`:""}>${shown}</dd>`:`<div class="blade-grid-card__value${edit?" blade-card-edit":""}"${edit?" "+edit:""}>${shown}</div>`;
  return `<div class="blade-grid-card__field${lines?" blade-grid-card__field--long":""}${label?"":" blade-grid-card__field--bare"}"${lines&&lines!==4?` style="--blade-card-lines:${Math.trunc(lines)}"`:""}>${shownValue}</div>`;
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

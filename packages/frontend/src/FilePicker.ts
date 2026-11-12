import { locale, t } from "./I18n";
import { Form, Layout, Toolbar, Window, awaitRedraw, message } from "@dhtmlx/suite";
import { ResponsiveGrid } from "./ResponsiveGrid";
import { escape, mediaLabel, mediaPart, mediaTypeIcon, type MediaDescriptor } from "./RecordPresentation";
import { actionUrl } from "./ActionUrl";
import { queueGrid, uploadActive, uploadRules, uploads, type UploadResult, type UploadRow } from "./Uploader";
import "./uploader.css";
import { fileDisplay, fileUploadPending, fieldActive, type FieldDefinition, type FileFieldConfig, type MountFileFieldConfig, type StoredFileFieldConfig } from "./FormValidation";
import "./file-field.css";
import type { Row } from "./Realtime";
import type { ViewDefinition } from "./components/list/types";

/** JSON call of another resource (the file manager) through the same UI channel, session and CSRF header. */
export type ResourceCall=(resource:string,action:string,id:string|null,values?:Record<string,unknown>)=>Promise<any>;
export type Directory={id:string;mount:string;depth:number;path:{id:string;name:string}[]};
type Entry={id:string;name:string;kind:"directory"|"file";mime_type:string;revision:string;width?:number|null;height?:number|null;duration_ms?:number|null;thumbnail?:MediaDescriptor["thumbnail"]};
type Listing={directory:Directory;items:Entry[];next?:string|null;total?:number;matched?:number};
type Kind="image"|"video"|"text"|"other";
/** `canChoose` describes the folder's list permission for the explicit toolkit FilePicker. */
type PickerConfig=FileFieldConfig;

/** Rows of one picker request (the file manager's `list` maximum) and the most rows the picker keeps. */
const PAGE=200,MAX_ROWS=3000,SEARCH_MAX=100;
const KINDS:[Kind,string][]=[["image","Képek"],["video","Videók"],["text","Szöveg"],["other","Egyéb"]];
const kindOf=(entry:{kind?:unknown;mime_type?:unknown}):Kind|"directory"=>{const mime=String(entry.mime_type??"");return entry.kind==="directory"?"directory":mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":mime.startsWith("text/")||mime==="application/json"?"text":"other";};
/**
 * Accepted MIME classes of a field, as the server rule: a class is a MIME top-level type (`text` is `text/*` only).
 * No `accept` means every file type; classes the picker does not know offer nothing.
 */
const accepted=(config:FileFieldConfig):Kind[]=>{
  if(!config.accept?.length)return KINDS.map(([key])=>key);
  return config.accept.filter((kind):kind is Kind=>kind!=="other"&&KINDS.some(([key])=>key===kind));
};
/** The server's file-field check (Executor::fileProblem): the MIME type starts with an accepted class and `/`. */
const offered=(config:FileFieldConfig,mime:string)=>!config.accept?.length||config.accept.some(kind=>kind!=="other"&&KINDS.some(([key])=>key===kind)&&mime.startsWith(kind+"/"));
const descriptor=(entry:Partial<Entry>&{id:string;name:string}):MediaDescriptor=>({id:String(entry.id),name:String(entry.name),mime_type:String(entry.mime_type??""),revision:String(entry.revision??""),
  duration_ms:typeof entry.duration_ms==="number"?entry.duration_ms:null,width:typeof entry.width==="number"?entry.width:null,height:typeof entry.height==="number"?entry.height:null,thumbnail:entry.thumbnail??"none"});
/** The field's declared folder (`folderId`) or its mount root, with its path (for the upload target label). */
export async function fieldFolder(config:MountFileFieldConfig,call:ResourceCall):Promise<Directory>{
  const id=config.folderId||String((await call(config.resource,"tree",config.mount)).root);
  return (await call(config.resource,"list",id,{limit:1}) as Listing).directory;
}
/** "Signage:/Képek", as the file manager's panel header. */
const directoryLabel=(directory:Directory)=>{const names=directory.path.map(part=>part.name);return (names[0]??directory.mount)+":/"+names.slice(1).join("/");};
/** Type glyph of the thumbnail item while no thumbnail image is ready. */
const mediaIcon=(media?:MediaDescriptor)=>media?mediaTypeIcon(media.mime_type):"dxi dxi-file-outline";
/** The stored file field's GET URL of the file $id (FB-0167), when the actor may read it. */
const storedUrl=(config:StoredFileFieldConfig,id:string)=>config.get&&config.canPreview?actionUrl(config.get.resource,config.get.action,id):undefined;
/** The name of a `Content-Disposition` header: the RFC 8187 UTF-8 name, else the quoted fallback. */
const dispositionName=(header:string|null):string|undefined=>{
  const extended=/filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header??"");
  if(extended)try{return decodeURIComponent(extended[1].trim());}catch{}
  return /filename\s*=\s*"([^"]*)"/i.exec(header??"")?.[1]||undefined;
};
/**
 * Name and type of a stored file through its GET action (a HEAD request: `Content-Disposition`, `Content-Type`); null
 * when it cannot be read. The preview of an image is the same URL.
 */
async function describeStored(config:StoredFileFieldConfig,id:string):Promise<MediaDescriptor|null>{
  const url=storedUrl(config,id);if(!url)return null;
  const response=await fetch(url,{method:"HEAD",credentials:"same-origin"}).catch(()=>null);
  if(!response?.ok)return null;
  const mime=(response.headers.get("Content-Type")??"").split(";")[0].trim().toLowerCase();
  return descriptor({id,name:dispositionName(response.headers.get("Content-Disposition"))??t("Mentett fájl"),mime_type:mime,thumbnail:mime.startsWith("image/")?"ready":"none"});
}
/** Same Cancel + submit row as the workspace forms. */
const actions=(submit:{name:string;text:string;icon:string}):any=>({css:"blade-form-actions",cols:[
  {type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"},
  {type:"button",...submit,color:"primary",width:"content"},
]});

/**
 * One-file form control: native file dialog, drop and paste, with a proportional preview. The native Suite
 * Avatar only displays the preview; the shared uploader owns all transfers. The file id is hidden, so form values,
 * validation and saving treat it like any other field. {@link FileFields} brings the items to life.
 */
export function fileInput(field:FieldDefinition,value:unknown,readOnly=false):any{
  const config=field.file as PickerConfig|undefined,upload=!readOnly&&!!config?.canUpload&&!!config.policy;
  // Several stored files (FB-0181): the count line (the field's label, its errors and focus) above the upload queue.
  if(filesOf(field)>1)return {css:"blade-file-field blade-file-field--multiple"+(upload?" blade-file-field--upload":""),rows:[
    {type:"input",name:field.name,hidden:true,value:String(value??"")},
    {type:"input",name:fileDisplay(field.name),label:field.label,labelPosition:"top",readOnly:true,required:!readOnly&&field.required,placeholder:t("Nincs megadott fájl"),value:""},
    {type:"spacer",name:field.name+"__queue",css:"blade-file-field__queue"},
  ]};
  return {css:"blade-file-field"+(upload?" blade-file-field--upload":""),rows:[
    {type:"input",name:field.name,hidden:true,value:String(value??"")},
    {css:"blade-file-field__row",rows:[
      {css:"blade-file-field__body",rows:[
        {type:"input",name:fileDisplay(field.name),label:field.label,labelPosition:"top",readOnly:true,required:!readOnly&&field.required,placeholder:t("Nincs megadott fájl"),value:""},
        {type:"avatar",name:field.name+"__media",readOnly:true,removeIcon:false,circle:false,size:160,icon:"dxi dxi-file-outline",alt:field.label,
          placeholder:upload?t("Húzd ide a fájlt, vagy illeszd be Ctrl+V-vel."):"",css:"blade-file-field__media"},
        ...(readOnly||!config?[]:[{css:"blade-file-field__actions",cols:[
          ...(upload?[{type:"button",name:field.name+"__browse",text:t("Fájl megadása…"),icon:"dxi dxi-file-import",view:"flat",color:"primary",width:"content"}]:[]),
          ...(!field.required?[{type:"button",name:field.name+"__clear",text:t("Törlés"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"}]:[]),
        ]}]),
      ]},
    ]},
  ]};
}

/** One `file` field of a Form: one native file input, drop/paste, preview and clearing. */
class FileField{
  private media?:MediaDescriptor;
  private folder?:Promise<Directory>;
  private input?:HTMLInputElement;
  private disposed=false;
  private abort=new AbortController();
  private preview?:string;
  private epoch=0;
  constructor(private form:Form,private field:FieldDefinition,private config:PickerConfig,media:MediaDescriptor|undefined,private call:ResourceCall,readOnly:boolean){
    const value=String(form.getValue()[field.name]??"");
    this.media=media&&media.id===value?media:undefined;
    this.paint();
    if(value&&!this.media&&this.stored)void this.describe(value);
    if(readOnly)return;
    form.events.on("click",(name:string)=>{
      if(name===field.name+"__browse")this.browse();
      else if(name===field.name+"__clear"&&!fileUploadPending(form,field.name))this.set(undefined);
    });
    // Keep clipboard focus on the file name; Enter/Space opens the native single-file dialog.
    form.getItem(fileDisplay(field.name))?.events.on("keydown",(event:KeyboardEvent)=>{
      if((event.key!=="Enter"&&event.key!==" ")||!config.canUpload)return;
      event.preventDefault();this.browse();
    });
    if(!config.canUpload||!config.policy)return;
    const signal=this.abort.signal;
    document.addEventListener("click",event=>{
      if(this.target(event)&&event.target instanceof Element&&event.target.closest(".blade-file-field__media"))this.browse();
    },{signal});
    document.addEventListener("paste",event=>{
      if(!this.target(event))return;
      const data=event.clipboardData;
      const files=Array.from(data?.files??[]);
      if(!files.length)for(const item of Array.from(data?.items??[])){const file=item.kind==="file"?item.getAsFile():null;if(file)files.push(file);}
      if(!files.length)return;
      event.preventDefault();void this.upload(files);
    },{signal});
    for(const type of ["dragenter","dragover"] as const)document.addEventListener(type,event=>{
      if(!this.target(event)||!event.dataTransfer?.types.includes("Files"))return;
      event.preventDefault();event.dataTransfer.dropEffect="copy";this.root()?.classList.add("blade-file-field--drop");
    },{signal,capture:true});
    document.addEventListener("dragleave",event=>{if(!this.root()?.contains(event.relatedTarget as Node|null))this.root()?.classList.remove("blade-file-field--drop");},{signal});
    document.addEventListener("drop",event=>{
      this.root()?.classList.remove("blade-file-field--drop");
      if(!this.target(event)||!event.dataTransfer?.types.includes("Files"))return;
      event.preventDefault();void this.upload(Array.from(event.dataTransfer.files));
    },{signal,capture:true});
  }
  private root():HTMLElement|null{return this.form.getItem(fileDisplay(this.field.name))?.getRootNode()?.closest(".blade-file-field")??null;}
  private target(event:Event):boolean{
    return !this.disposed&&!event.defaultPrevented&&event.target instanceof Node&&!!this.root()?.contains(event.target)&&
      !this.form.isDisabled(fileDisplay(this.field.name))&&fieldActive(this.field,this.form.getValue());
  }
  private get value():string{return String(this.form.getValue()[this.field.name]??"");}
  /** A file in the project's storage (`file.upload`, FB-0167) instead of a file manager reference. */
  private get stored():StoredFileFieldConfig|undefined{return this.config.upload?this.config as StoredFileFieldConfig:undefined;}
  /** The stored file's name and type through the GET action; the field keeps its value whatever the answer. */
  private async describe(value:string):Promise<void>{
    const stored=this.stored,epoch=this.epoch;if(!stored)return;
    const media=await describeStored(stored,value);
    if(!media||this.disposed||epoch!==this.epoch||this.value!==value)return;
    this.media=media;this.paint();
  }
  private paint():void{
    if(this.disposed)return;
    const value=this.value,media=this.media;
    // The thumbnail image when it is ready (`thumbnail_get`), otherwise the type glyph; `alt` states type and name.
    const avatar=this.form.getItem(this.field.name+"__media");
    if(avatar){
      avatar.setProperties({icon:mediaIcon(media),alt:media?mediaLabel(media):this.field.label});
      const stored=this.stored,source=this.preview??(media?.thumbnail!=="ready"?undefined:stored?storedUrl(stored,media.id):actionUrl((this.config as MountFileFieldConfig).resource,"thumbnail_get",media.id,media.revision));
      if(source)avatar.setValue({src:source});else avatar.clear();
    }
    // Without a readable descriptor (a file the actor may not see) the field still names the reference.
    this.form.getItem(fileDisplay(this.field.name))?.setValue(media?.name??(value?this.stored?t("Mentett fájl"):t("Fájl #{id}",{id:value}):""));
    const clear=this.form.getItem(this.field.name+"__clear");
    if(clear){if(value&&!fileUploadPending(this.form,this.field.name))clear.enable();else clear.disable();}
    const browse=this.form.getItem(this.field.name+"__browse");
    if(browse){browse.setProperties({text:value?t("Fájl cseréje…"):t("Fájl megadása…")});if(fileUploadPending(this.form,this.field.name))browse.disable();else browse.enable();}
  }
  private set(media:MediaDescriptor|undefined):void{
    if(this.disposed)return;
    this.epoch++;
    this.media=media;
    this.releasePreview();
    this.form.getItem(fileDisplay(this.field.name))?.setProperties({preMessage:""});
    // The hidden item's change clears a shown server error (FormValidation) and marks the form dirty.
    this.form.getItem(this.field.name).setValue(media?.id??"");
    this.form.getItem(fileDisplay(this.field.name))?.clearValidate();
    this.paint();
  }
  /** The declared folder (`folderId`) or the mount root, with its path for the upload target label. */
  private directory():Promise<Directory>{
    return this.folder??=fieldFolder(this.config as MountFileFieldConfig,this.call).catch(error=>{this.folder=undefined;throw error;});
  }
  private browse():void{
    if(this.disposed||!this.config.canUpload||!this.config.policy||this.form.isDisabled(fileDisplay(this.field.name))||fileUploadPending(this.form,this.field.name))return;
    if(!this.input){
      const input=this.input=Object.assign(document.createElement("input"),{type:"file",tabIndex:-1,className:"blade-file-field__input",accept:this.config.policy.extensions.map(ext=>"."+ext).join(",")});
      input.setAttribute("aria-hidden","true");input.dataset.bladeFileInput=this.field.name;document.body.append(input);
      input.addEventListener("change",()=>{const files=Array.from(input.files??[]);input.value="";if(files.length)void this.upload(files);},{signal:this.abort.signal});
    }
    this.input.click();
  }
  /** A single local file goes to the shared queue without opening its window. */
  private async upload(files:File[]):Promise<void>{
    if(!this.config.canUpload||!this.config.policy||this.disposed||fileUploadPending(this.form,this.field.name))return;
    const display=this.form.getItem(fileDisplay(this.field.name));
    if(files.length!==1){display.setProperties({preMessage:t("Ebbe a mezőbe egy fájlt illessz be vagy húzz.")});return;}
    if(!this.config.policy.extensions.includes(files[0].name.split(".").pop()?.toLowerCase()??"")){
      display.setProperties({preMessage:t("A fájl típusa ehhez a mezőhöz nem engedélyezett.")});return;
    }
    const epoch=++this.epoch;
    const previous=this.value;
    fileUploadPending(this.form,this.field.name,true);
    display.clearValidate();display.setProperties({preMessage:t("Feltöltés…")});
    this.releasePreview();
    const file=files[0];
    if(/^image\/(png|jpeg|gif|webp)$/.test(file.type)&&file.size<=20*1048576)this.preview=URL.createObjectURL(file);
    this.paint();
    void awaitRedraw().then(()=>{if(!this.disposed&&fileUploadPending(this.form,this.field.name))this.root()?.setAttribute("aria-busy","true");});
    const settled=(error?:string)=>{
      if(epoch!==this.epoch)return;
      fileUploadPending(this.form,this.field.name,false);
      if(this.disposed)return;
      this.root()?.removeAttribute("aria-busy");display.clearValidate();
      display.setProperties({preMessage:escape(error??"")});
      this.paint();
    };
    // A stored file goes to the project's upload action; its answer `{id}` is the token the save hands to the record action.
    const stored=this.stored;
    if(stored){
      uploads.open({resource:stored.upload.resource,action:stored.upload.action,target:null,targetLabel:this.field.label,policy:stored.policy!,files,background:true,onUploaded:(result:UploadResult)=>{
        if(epoch!==this.epoch)return;
        const first=result.succeeded[0];
        settled(result.failed[0]?.error??(!result.succeeded.length?t("Kihagyva"):!first?.id?t("Sikertelen művelet."):undefined));
        if(this.disposed)return;
        if(!first?.id||this.value!==previous){this.releasePreview();this.paint();return;}
        const preview=this.preview;this.preview=undefined;
        this.set(descriptor({id:String(first.id),name:file.name,mime_type:file.type,thumbnail:"none"}));
        this.preview=preview;this.paint();
      }});
      return;
    }
    let directory:Directory;
    try{directory=await this.directory();}catch(error){if(this.disposed||epoch!==this.epoch)return;settled(error instanceof Error?error.message:t("Sikertelen művelet."));this.releasePreview();this.paint();return;}
    if(this.disposed||epoch!==this.epoch)return;
    uploads.open({resource:(this.config as MountFileFieldConfig).resource,action:"upload",target:directory.id,targetLabel:directoryLabel(directory),policy:this.config.policy,
      files,background:true,onUploaded:(result:UploadResult)=>{
      if(epoch!==this.epoch)return;
      settled(result.failed[0]?.error??(!result.succeeded.length?t("Kihagyva"):undefined));
      const first=result.succeeded[0];if(this.disposed)return;
      if(!first||this.value!==previous){this.releasePreview();this.paint();return;}
      const item=(first.item??{}) as Partial<Entry>;
      const preview=this.preview;this.preview=undefined;
      this.set(descriptor({...item,id:String(item.id??first.id),name:String(item.name??first.name),thumbnail:item.thumbnail??"pending"}));
      this.preview=preview;this.paint();
    }});
  }
  private releasePreview():void{if(this.preview)URL.revokeObjectURL(this.preview);this.preview=undefined;}
  destroy():void{this.disposed=true;this.abort.abort();this.input?.remove();fileUploadPending(this.form,this.field.name,false);this.releasePreview();}
}

/** How many files a field holds at most: a stored field's `multiple`, otherwise 1. */
const filesOf=(field:FieldDefinition)=>Number((field.file as StoredFileFieldConfig|undefined)?.multiple??1);
/** A row of a field's queue: a saved file of the record (`stored`) or one of the field's uploads; `value` is its id or token. */
type QueueRow=UploadRow&{value?:string;readOnly?:boolean};

/**
 * Several stored files of one field (FB-0181, `file.multiple`): the uploader's drop zone and queue (Előnézet, Név,
 * Állapot, Műveletek) inside the form, in a Layout mounted into the field's spacer item (Suite's standard Form has no
 * container item; a repaint keeps the node, and a replaced one gets the panel back). The record's files are rows of
 * their own (`Mentve`), each upload goes to the shared uploader in the background as a batch of one file and becomes a
 * row; a finished one is in the value (`Feltöltve, mentésre vár`) until the save commits it. Removing a row takes it out
 * of the value. The hidden item holds the comma-joined ids, so validation, dirty state and saving treat it like any field.
 */
class MultiFileField{
  private rows=new Map<string,QueueRow>();
  private panel=document.createElement("div");
  private layout?:Layout;
  private grid=queueGrid(event=>this.action(event));
  private input?:HTMLInputElement;
  private disposed=false;
  private abort=new AbortController();
  private sequence=0;
  constructor(private form:Form,private field:FieldDefinition,private config:StoredFileFieldConfig,private readOnly:boolean){
    this.panel.className="blade-file-field__panel blade-uploader";
    const upload=!readOnly&&!!config.canUpload&&!!config.policy;
    this.layout=new Layout(this.panel,{type:"none",rows:[...(upload?[{id:"zone",height:"content",css:"blade-uploader__zone-cell"}]:[]),{id:"queue",css:"blade-uploader__queue"}]} as any);
    this.layout.getCell("queue").attach(this.grid);
    if(upload)this.layout.getCell("zone").attachHTML(this.zone());
    for(const value of this.value.split(",").filter(Boolean)){
      const row:QueueRow={id:"s"+ ++this.sequence,name:t("Mentett fájl"),path:"",type:"",state:"stored",status:t("Mentve"),percent:100,retry:false,preview:"",target:"",value,readOnly};
      this.rows.set(row.id,row);void this.describe(row);
    }
    this.paint();
    this.mount();void awaitRedraw().then(()=>this.mount());
    form.events.on("change",()=>void awaitRedraw().then(()=>this.mount()));
    if(!upload)return;
    const signal=this.abort.signal,inside=(event:Event)=>!this.disposed&&event.target instanceof Node&&this.panel.contains(event.target)&&!this.form.isDisabled(fileDisplay(field.name))&&fieldActive(field,form.getValue());
    document.addEventListener("click",event=>{if(inside(event)&&(event.target as Element).closest("[data-blade-field-pick]"))this.browse();},{signal});
    document.addEventListener("keydown",event=>{if(inside(event)&&(event.key==="Enter"||event.key===" ")&&(event.target as Element).matches(".blade-uploader__zone")){event.preventDefault();this.browse();}},{signal});
    document.addEventListener("paste",event=>{
      if(!inside(event))return;
      const data=event.clipboardData,files=Array.from(data?.files??[]);
      if(!files.length)for(const item of Array.from(data?.items??[])){const file=item.kind==="file"?item.getAsFile():null;if(file)files.push(file);}
      if(!files.length)return;
      event.preventDefault();this.add(files);
    },{signal});
    const zone=()=>this.panel.querySelector(".blade-uploader__zone");
    for(const type of ["dragenter","dragover"] as const)document.addEventListener(type,event=>{
      if(!inside(event)||!event.dataTransfer?.types.includes("Files"))return;
      event.preventDefault();event.dataTransfer.dropEffect="copy";zone()?.classList.add("blade-uploader__zone--over");
    },{signal,capture:true});
    document.addEventListener("dragleave",event=>{if(!this.panel.contains(event.relatedTarget as Node|null))zone()?.classList.remove("blade-uploader__zone--over");},{signal});
    document.addEventListener("drop",event=>{
      zone()?.classList.remove("blade-uploader__zone--over");
      if(!inside(event)||!event.dataTransfer?.types.includes("Files"))return;
      event.preventDefault();this.add(Array.from(event.dataTransfer.files));
    },{signal,capture:true});
  }
  private get value():string{return String(this.form.getValue()[this.field.name]??"");}
  private get limit():number{return filesOf(this.field);}
  /** The panel in the spacer item's node (again, when a repaint replaced it). */
  private mount():void{
    if(this.disposed)return;
    const root=this.form.getItem(this.field.name+"__queue")?.getRootNode?.() as HTMLElement|undefined;
    if(root&&this.panel.parentElement!==root)root.append(this.panel);
  }
  private zone():string{
    const policy=this.config.policy!;
    return `<div class="blade-uploader__zone" tabindex="0" role="group" aria-label="${escape(t("Feltöltési terület"))}">
      <p class="blade-uploader__hint">${escape(t("Húzd ide a fájlokat, vagy illeszd be őket Ctrl+V-vel."))}</p>
      <p class="blade-uploader__rules">${escape(uploadRules(policy,this.limit))}</p>
      <div class="blade-uploader__buttons"><button type="button" class="dhx_button dhx_button--size_medium dhx_button--view_flat dhx_button--color_primary blade-uploader__pick" data-blade-field-pick="${escape(this.field.name)}"><span class="dhx_button__icon dxi dxi-file-import" aria-hidden="true"></span><span class="dhx_button__text">${escape(t("Fájlok kiválasztása"))}</span></button></div>
    </div>`;
  }
  /** The saved file's name and type (its preview when it is an image) through the GET action. */
  private async describe(row:QueueRow):Promise<void>{
    const media=await describeStored(this.config,row.value!);
    if(!media||this.disposed||!this.rows.has(row.id))return;
    Object.assign(row,{name:media.name,type:media.mime_type,preview:media.mime_type.startsWith("image/")?storedUrl(this.config,row.value!)??"":""});
    this.paint();
  }
  private browse():void{
    if(this.disposed)return;
    if(!this.input){
      const input=this.input=Object.assign(document.createElement("input"),{type:"file",multiple:true,tabIndex:-1,className:"blade-file-field__input",accept:this.config.policy!.extensions.map(ext=>"."+ext).join(",")});
      input.setAttribute("aria-hidden","true");input.dataset.bladeFileInput=this.field.name;document.body.append(input);
      input.addEventListener("change",()=>{const files=Array.from(input.files??[]);input.value="";if(files.length)this.add(files);},{signal:this.abort.signal});
    }
    this.input.click();
  }
  /** Each allowed file as an upload of its own, up to the field's limit; the rest is refused on the count line. */
  private add(files:File[]):void{
    const display=this.form.getItem(fileDisplay(this.field.name)),policy=this.config.policy!;
    const taken=[...this.rows.values()].filter(row=>row.state==="stored"||row.state==="done"||uploadActive(row.state)).length;
    const allowed=files.filter(file=>policy.extensions.includes(file.name.split(".").pop()?.toLowerCase()??""));
    const message=allowed.length<files.length?t("A fájl típusa ehhez a mezőhöz nem engedélyezett."):taken+allowed.length>this.limit?t("Legfeljebb {count} fájl adható meg.",{count:this.limit}):"";
    display.setProperties({preMessage:escape(message)});
    for(const file of allowed.slice(0,Math.max(0,this.limit-taken)))uploads.open({resource:this.config.upload.resource,action:this.config.upload.action,target:null,targetLabel:this.field.label,
      policy,files:[file],background:true,onFile:row=>this.update(row)});
  }
  /** A change of one of the field's uploads. */
  private update(upload:UploadRow):void{
    if(this.disposed)return;
    const row:QueueRow={...this.rows.get(upload.id),...upload,target:""};
    if(upload.state==="done"){row.value=upload.result?.id||undefined;row.status=t("Feltöltve, mentésre vár");}
    this.rows.set(upload.id,row);
    this.paint();
  }
  private action(event:Event):void{
    const button=(event.target as HTMLElement|null)?.closest<HTMLElement>("[data-blade-upload-action]");
    const row=this.rows.get(button?.dataset.bladeUploadRow??""),action=button?.dataset.bladeUploadAction;
    if(!row||!action||this.readOnly)return;
    if(action==="remove"){
      if(uploadActive(row.state))return;
      if(row.state!=="stored")uploads.act(row.id,"remove");
      this.rows.delete(row.id);this.paint();
    }else uploads.act(row.id,action==="retry"?"retry":"cancel");
    // Keyboard users stay in the queue: the row's next command, otherwise the drop zone.
    void awaitRedraw().then(()=>(this.panel.querySelector<HTMLElement>(`button[data-blade-upload-row="${CSS.escape(row.id)}"]`)??this.panel.querySelector<HTMLElement>(".blade-uploader__zone"))?.focus({preventScroll:true}));
  }
  /** The queue, the value (the saved and the finished uploads' ids, in order), the pending state and the count line. */
  private paint():void{
    if(this.disposed)return;
    const rows=[...this.rows.values()];
    for(const row of rows)if(this.grid.data.exists(row.id))this.grid.data.update(row.id,row);else this.grid.data.add(row);
    for(const id of this.grid.data.map(item=>String(item.id)) as unknown as string[])if(!this.rows.has(id))this.grid.data.remove(id);
    const ids=rows.filter(row=>row.value&&(row.state==="stored"||row.state==="done")).map(row=>row.value!).join(",");
    fileUploadPending(this.form,this.field.name,rows.some(row=>uploadActive(row.state)));
    if(ids!==this.value){this.form.getItem(this.field.name).setValue(ids);this.form.getItem(fileDisplay(this.field.name))?.clearValidate();}
    const count=ids?ids.split(",").length:0;
    this.form.getItem(fileDisplay(this.field.name))?.setValue(count?t("{count} / {limit} fájl",{count,limit:this.limit}):"");
  }
  destroy():void{this.disposed=true;this.abort.abort();this.input?.remove();fileUploadPending(this.form,this.field.name,false);this.layout?.destructor();this.panel.remove();}
}

/** Every `file` field of a Form; `values._media` (or the list row's) describes the current files. */
export class FileFields{
  private fields:(FileField|MultiFileField)[]=[];
  constructor(form:Form,fields:FieldDefinition[],call:ResourceCall,sources:(Row|undefined)[]=[],readOnly:(field:FieldDefinition)=>boolean=()=>false){
    for(const field of fields){
      if(field.type!=="file"||!field.file||!form.getItem(field.name))continue;
      if(filesOf(field)>1){this.fields.push(new MultiFileField(form,field,field.file as StoredFileFieldConfig,readOnly(field)));continue;}
      const media=sources.map(row=>row?._media as Record<string,MediaDescriptor|null>|undefined).map(media=>media?.[field.name]).find(media=>media&&typeof media.id==="string")??undefined;
      this.fields.push(new FileField(form,field,field.file,media,call,readOnly(field)));
    }
  }
  get size():number{return this.fields.length;}
  destroy():void{for(const field of this.fields)field.destroy();this.fields=[];}
}

/**
 * Modal tiles picker over the file manager's paged `list` of the field's folder: search, a type filter
 * limited to the accepted MIME classes, double-click/Enter or `Kiválasztás` chooses, Cancel/Escape closes.
 * `result` resolves the chosen file's descriptor, or null.
 */
export class FilePicker{
  readonly result:Promise<MediaDescriptor|null>;
  private resolve!:(media:MediaDescriptor|null)=>void;
  private win:Window;
  private grid:ResponsiveGrid;
  private form:Form;
  private find:Toolbar;
  private search:Toolbar;
  private rows:Row[]=[];
  private entries=new Map<string,Entry>();
  private selected?:string;
  private next:string|null=null;
  private directory?:Directory;
  private query:{search:string;type:Kind|""};
  private kinds:Kind[];
  private epoch=0;
  private loading=false;
  private searchTimer?:ReturnType<typeof setTimeout>;
  private closed=false;

  constructor(private config:MountFileFieldConfig,title:string,private call:ResourceCall,private folder:()=>Promise<Directory>,private current=""){
    this.result=new Promise(resolve=>{this.resolve=resolve;});
    this.kinds=accepted(config);
    // One accepted class is a fixed filter; several offer "all accepted" and each class.
    this.query={search:"",type:this.kinds.length===1?this.kinds[0]:""};
    const label=t("Fájl kiválasztása: {field}",{field:title});
    this.win=new Window({css:"blade-content-window blade-file-picker-window",title:escape(label),ariaLabel:label,width:Math.min(880,innerWidth-24),height:Math.min(640,innerHeight-24),modal:true,closable:true,resizable:true});
    const layout=new Layout(document.createElement("div"),{type:"none",css:"blade-file-picker",rows:[
      {height:48,css:"blade-command-row blade-file-find",cols:[{id:"search",css:"blade-search-cell"},{id:"find",width:Math.min(260,Math.max(160,Math.round(innerWidth*.25)))}]},
      {id:"body",css:"blade-file-picker__body"},
      {id:"actions",height:"content",css:"blade-file-picker__actions"},
    ]});
    this.search=new Toolbar(document.createElement("div"),{css:"blade-search-bar",data:[{type:"input",id:"search",label:t("Keresés"),hiddenLabel:true,placeholder:t("Keresés…"),icon:"dxi dxi-magnify",width:"100%",autocomplete:false}]} as any);
    const types=this.kinds.length>1?[["","Minden típus"] as [Kind|"",string],...KINDS.filter(([key])=>this.kinds.includes(key))]:KINDS.filter(([key])=>this.kinds.includes(key));
    this.find=new Toolbar(undefined,{css:"blade-file-bar blade-file-find__bar",data:[
      {type:"spacer"},
      {id:"count",type:"text",value:""},
      {id:"type",value:t(types.find(([key])=>key===this.query.type)?.[1]??"Minden típus"),icon:"dxi dxi-filter-variant",tooltip:t("Típus"),disabled:types.length<2,items:types.map(([value,text])=>({id:"type:"+(value||"all"),value:t(text)}))},
    ]});
    const columns:ViewDefinition["columns"]=[
      {id:"thumb",header:t("Előnézet"),media:config.resource},
      {id:"name",header:t("Név")},
      {id:"info",header:t("Részletek")},
    ];
    this.grid=new ResponsiveGrid(document.createElement("div"),columns,()=>this.rows,id=>{this.selected=id;this.capabilities();},()=>this.choose(),direction=>{if(direction==="next")void this.more();},()=>{},
      {rowNumbers:false,idColumn:false,fields:columns,tiles:true,tileMinWidth:150});
    this.grid.setMode("tiles");
    this.form=new Form(document.createElement("div"),{padding:"8px 16px 16px",rows:[actions({name:"choose",text:t("Kiválasztás"),icon:"dxi dxi-check"})]} as any);
    this.form.getItem("choose").disable();
    this.form.events.on("click",(name:string)=>{if(name==="cancel")this.close();else if(name==="choose")this.choose();});
    this.find.events.on("click",(id:string|number)=>{
      const value=String(id);if(!value.startsWith("type:"))return;
      const type=(value==="type:all"?"":value.slice(5)) as Kind|"";
      this.find.data.update("type",{value:t(types.find(([key])=>key===type)?.[1]??"Minden típus")});
      this.requery({type});
    });
    // Search as in the file manager: 300 ms after typing, Enter at once, Escape clears (a second Escape closes).
    this.search.events.on("inputCreated",(_id:string|number,input:HTMLInputElement)=>{input.maxLength=SEARCH_MAX;});
    this.search.events.on("input",(_id:string|number,value:string)=>{clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.requery({search:this.text(value)}),300);});
    this.search.events.on("keydown",(event:KeyboardEvent)=>{
      const input=event.target as HTMLInputElement;
      if(event.key==="Enter"){event.preventDefault();this.requery({search:this.text(input.value)});}
      else if(event.key==="Escape"&&input.value){event.preventDefault();event.stopPropagation();input.value="";this.search.data.update("search",{value:""});this.requery({search:""});}
    });
    layout.getCell("search").attach(this.search);layout.getCell("find").attach(this.find);layout.getCell("body").attach(this.grid.layout);layout.getCell("actions").attach(this.form);
    this.win.attach(layout);
    this.win.events.on("afterHide",()=>this.dispose());
    this.win.getContainer().addEventListener("keydown",event=>{
      if(event.key==="Escape"&&!event.defaultPrevented&&!document.querySelector("[role='alertdialog']")){event.preventDefault();this.close();}
    });
    this.win.show();
    void this.load().then(()=>awaitRedraw()).then(()=>{if(!this.closed)this.win.getContainer().querySelector<HTMLInputElement>(".blade-search-bar input")?.focus();});
  }
  private text(value:string):string{return Array.from(String(value??"").trim()).slice(0,SEARCH_MAX).join("").trim();}
  private capabilities():void{
    if(this.closed)return;
    const button=this.form.getItem("choose");
    if(this.selected&&this.entries.has(this.selected))button.enable();else button.disable();
  }
  private values(cursor?:string|null):Record<string,unknown>{
    return {limit:PAGE,sort:"name",direction:"asc",...(this.query.search?{search:this.query.search}:{}),...(this.query.type?{type:this.query.type}:{}),...(cursor?{cursor}:{})};
  }
  /** Only files of an accepted class (the server rule) are offered; folders and other files of an unfiltered listing are left out. */
  private display(entry:Entry):Row|null{
    const kind=kindOf(entry);
    if(kind==="directory"||!this.kinds.includes(kind)||!offered(this.config,entry.mime_type))return null;
    const media=descriptor(entry);
    const info=[mediaPart(media,"type"),mediaPart(media,"resolution"),mediaPart(media,"duration")].filter(Boolean).join(" · ");
    this.entries.set(entry.id,entry);
    return {id:entry.id,name:entry.name,info,_media:{thumb:media}};
  }
  private count(total:number):void{this.find.data.update("count",{value:t("{count} elem",{count:total.toLocaleString(locale())})});}
  private requery(change:Partial<FilePicker["query"]>):void{
    clearTimeout(this.searchTimer);this.searchTimer=undefined;
    const query={...this.query,...change};
    if(this.closed||JSON.stringify(query)===JSON.stringify(this.query))return;
    this.query=query;void this.load();
  }
  private async load():Promise<void>{
    const epoch=++this.epoch;this.loading=true;
    try{
      // A field accepting only classes the picker does not know offers nothing (never every file).
      if(!this.kinds.length){this.rows=[];this.count(0);this.grid.setRows([]);this.capabilities();return;}
      this.directory??=await this.folder();
      const listing:Listing=await this.call(this.config.resource,"list",this.directory.id,this.values());
      if(this.closed||epoch!==this.epoch)return;
      this.entries.clear();this.next=listing.next??null;
      this.rows=listing.items.map(entry=>this.display(entry)).filter((row):row is Row=>!!row);
      // A mixed listing shown through the client filter may need a few more pages to fill the view.
      for(let pages=0;this.next&&this.rows.length<60&&pages<4;pages++){
        const more:Listing=await this.call(this.config.resource,"list",this.directory.id,this.values(this.next));
        if(this.closed||epoch!==this.epoch)return;
        this.next=more.next??null;this.rows=[...this.rows,...more.items.map(entry=>this.display(entry)).filter((row):row is Row=>!!row)];
      }
      // The server's count is exact when its type filter is the field's class rule (no `accept`, or image/video); `text` also counts JSON.
      const exact=!this.config.accept?.length||this.query.type==="image"||this.query.type==="video";
      this.count(exact?listing.matched??listing.total??this.rows.length:this.rows.length);
      this.grid.setRows(this.rows);
      if(!this.rows.some(row=>row.id===this.selected))this.selected=undefined;
      const initial=this.selected??(this.rows.some(row=>row.id===this.current)?this.current:undefined);
      this.selected=initial;
      await awaitRedraw();if(this.closed||epoch!==this.epoch)return;
      this.grid.restore({id:initial,offset:0,x:0,y:0},!!initial,initial,true);
      this.capabilities();
    }catch(error){
      if(this.closed||epoch!==this.epoch)return;
      message({text:error instanceof Error?error.message:t("Sikertelen művelet."),css:"blade-toast",expire:6000});
    }finally{if(epoch===this.epoch)this.loading=false;}
  }
  private async more():Promise<void>{
    if(!this.next||this.loading||this.closed||!this.directory||this.rows.length>=MAX_ROWS)return;
    const epoch=this.epoch;this.loading=true;
    try{
      const listing:Listing=await this.call(this.config.resource,"list",this.directory.id,this.values(this.next));
      if(this.closed||epoch!==this.epoch)return;
      this.next=listing.next??null;
      const known=new Set(this.rows.map(row=>String(row.id)));
      this.rows=[...this.rows,...listing.items.filter(entry=>!known.has(entry.id)).map(entry=>this.display(entry)).filter((row):row is Row=>!!row)];
      const position=this.grid.capture();this.grid.setRows(this.rows);
      await awaitRedraw();if(!this.closed)this.grid.restore(position,true,this.selected);
    }catch(error){if(!this.closed)message({text:error instanceof Error?error.message:t("Sikertelen művelet."),css:"blade-toast",expire:6000});}
    finally{if(epoch===this.epoch)this.loading=false;}
  }
  private choose():void{
    const entry=this.selected?this.entries.get(this.selected):undefined;
    if(!entry||this.closed)return;
    this.resolve(descriptor(entry));this.close();
  }
  close():void{if(this.closed)return;this.resolve(null);if(this.win.isVisible())this.win.hide();else this.dispose();}
  private dispose():void{
    if(this.closed)return;
    this.closed=true;this.resolve(null);clearTimeout(this.searchTimer);this.epoch++;
    // Suite 9.3.12 reads a destroyed vnode when a focused Toolbar input blurs during unmount.
    const focused=document.activeElement;if(focused instanceof HTMLElement&&this.win.getContainer().contains(focused))focused.blur();
    this.grid.destroy();
    void awaitRedraw().then(()=>this.win.destructor());
  }
}

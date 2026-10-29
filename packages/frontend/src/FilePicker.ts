import { locale, t } from "./I18n";
import { Form, Layout, Toolbar, Window, awaitRedraw, message } from "@dhtmlx/suite";
import { ResponsiveGrid } from "./ResponsiveGrid";
import { escape, mediaLabel, mediaPart, type MediaDescriptor } from "./RecordPresentation";
import { actionUrl } from "./ActionUrl";
import { uploads, type UploadResult } from "./Uploader";
import { fileDisplay, type FieldDefinition, type FileFieldConfig } from "./FormValidation";
import type { Row } from "./Realtime";
import type { ViewDefinition } from "./Workspace";

/** JSON call of another resource (the file manager) through the same UI channel, session and CSRF header. */
export type ResourceCall=(resource:string,action:string,id:string|null,values?:Record<string,unknown>)=>Promise<any>;
export type Directory={id:string;mount:string;depth:number;path:{id:string;name:string}[]};
type Entry={id:string;name:string;kind:"directory"|"file";mime_type:string;revision:string;width?:number|null;height?:number|null;duration_ms?:number|null;thumbnail?:MediaDescriptor["thumbnail"]};
type Listing={directory:Directory;items:Entry[];next?:string|null;total?:number;matched?:number};
type Kind="image"|"video"|"text"|"other";
/** `can_choose`: the actor may browse the field's folder (`list` on the mount); without it `Kiválasztás…` is not offered. */
type PickerConfig=FileFieldConfig&{can_choose?:boolean};

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
/** The field's declared folder (`folder_id`) or its mount root, with its path (for the upload target label). */
export async function fieldFolder(config:FileFieldConfig,call:ResourceCall):Promise<Directory>{
  const id=config.folder_id||String((await call(config.resource,"tree",config.mount)).root);
  return (await call(config.resource,"list",id,{limit:1}) as Listing).directory;
}
/** "Signage:/Képek", as the file manager's panel header. */
const directoryLabel=(directory:Directory)=>{const names=directory.path.map(part=>part.name);return (names[0]??directory.mount)+":/"+names.slice(1).join("/");};
/** Type glyph of the thumbnail item while no thumbnail image is ready. */
const mediaIcon=(media?:MediaDescriptor)=>!media?"dxi dxi-file-outline":media.mime_type.startsWith("video/")?"dxi dxi-menu-right":media.mime_type.startsWith("image/")?"dxi dxi-image-outline":"dxi dxi-file-outline";
/** Same Cancel + submit row as the workspace forms. */
const actions=(submit:{name:string;text:string;icon:string}):any=>({css:"blade-form-actions",cols:[
  {type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"},
  {type:"button",...submit,color:"primary",width:"content"},
]});

/**
 * Form items of a `file` field: the thumbnail (a read-only native Suite Avatar; Suite Standard Form has
 * no HTML container item), the read-only file name (the item that shows
 * validation errors) and the commands `Kiválasztás…`, `Fájl feltöltése…` (when the actor may upload)
 * and `Törlés` (optional fields). The file id is the hidden item named after the field, so form values,
 * validation and saving treat it like any other field. {@link FileFields} brings the items to life.
 */
export function fileInput(field:FieldDefinition,value:unknown,readOnly=false):any{
  const config=field.file as PickerConfig|undefined,upload=!readOnly&&!!config?.can_upload&&!!config.policy,choose=!readOnly&&!!config?.can_choose;
  return {css:"blade-file-field",rows:[
    {type:"input",name:field.name,hidden:true,value:String(value??"")},
    {css:"blade-file-field__row",cols:[
      {type:"avatar",name:field.name+"__media",readOnly:true,removeIcon:false,circle:false,size:96,icon:"dxi dxi-file-outline",alt:"",css:"blade-file-field__media"},
      {css:"blade-file-field__body",rows:[
        {type:"input",name:fileDisplay(field.name),label:field.label,labelPosition:"top",readOnly:true,required:!readOnly&&field.required,placeholder:t("Nincs kiválasztott fájl"),value:""},
        ...(readOnly||!config?[]:[{css:"blade-file-field__actions",cols:[
          ...(choose?[{type:"button",name:field.name+"__choose",text:t("Kiválasztás…"),icon:"dxi dxi-folder-open",view:"flat",color:"primary",width:"content"}]:[]),
          ...(upload?[{type:"button",name:field.name+"__upload",text:t("Fájl feltöltése…"),icon:"dxi dxi-file-import",view:"flat",color:"primary",width:"content"}]:[]),
          ...(!field.required?[{type:"button",name:field.name+"__clear",text:t("Törlés"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"}]:[]),
        ]}]),
      ]},
    ]},
  ]};
}

/** One `file` field of a Form: thumbnail and name of the chosen file, picker, upload and clearing. */
class FileField{
  private media?:MediaDescriptor;
  private folder?:Promise<Directory>;
  private picker?:FilePicker;
  private disposed=false;
  constructor(private form:Form,private field:FieldDefinition,private config:PickerConfig,media:MediaDescriptor|undefined,private call:ResourceCall,readOnly:boolean){
    const value=String(form.getValue()[field.name]??"");
    this.media=media&&media.id===value?media:undefined;
    this.paint();
    if(readOnly)return;
    form.events.on("click",(name:string)=>{
      if(name===field.name+"__choose")void this.choose();
      else if(name===field.name+"__upload")void this.upload();
      else if(name===field.name+"__clear")this.set(undefined);
    });
    // The file name is a read-only text box: Enter or Space on it opens the picker, as the button (when offered).
    form.getItem(fileDisplay(field.name))?.events.on("keydown",(event:KeyboardEvent)=>{
      if((event.key!=="Enter"&&event.key!==" ")||!config.can_choose)return;
      event.preventDefault();void this.choose();
    });
  }
  private get value():string{return String(this.form.getValue()[this.field.name]??"");}
  private paint():void{
    if(this.disposed)return;
    const value=this.value,media=this.media;
    // The thumbnail image when it is ready (`thumbnail_get`), otherwise the type glyph; `alt` states type and name.
    const avatar=this.form.getItem(this.field.name+"__media");
    if(avatar){
      avatar.setProperties({icon:mediaIcon(media),alt:media?mediaLabel(media):""});
      if(media?.thumbnail==="ready")avatar.setValue({src:actionUrl(this.config.resource,"thumbnail_get",media.id,media.revision)});else avatar.clear();
    }
    // Without a readable descriptor (a file the actor may not see) the field still names the reference.
    this.form.getItem(fileDisplay(this.field.name))?.setValue(media?.name??(value?t("Fájl #{id}",{id:value}):""));
    const clear=this.form.getItem(this.field.name+"__clear");
    if(clear){if(value)clear.enable();else clear.disable();}
  }
  private set(media:MediaDescriptor|undefined):void{
    if(this.disposed)return;
    this.media=media;
    // The hidden item's change clears a shown server error (FormValidation) and marks the form dirty.
    this.form.getItem(this.field.name).setValue(media?.id??"");
    this.form.getItem(fileDisplay(this.field.name))?.clearValidate();
    this.paint();
  }
  /** The declared folder (`folder_id`) or the mount root, with its path for the upload target label. */
  private directory():Promise<Directory>{
    return this.folder??=fieldFolder(this.config,this.call).catch(error=>{this.folder=undefined;throw error;});
  }
  private async choose():Promise<void>{
    if(this.picker||this.disposed||!this.config.can_choose)return;
    this.picker=new FilePicker(this.config,this.field.label,this.call,()=>this.directory(),this.value);
    try{const media=await this.picker.result;if(media)this.set(media);}
    finally{
      this.picker=undefined;
      // Focus returns to the field's command once the modal window has gone.
      if(!this.disposed)void awaitRedraw().then(()=>{if(!this.disposed)this.form.getItem(this.field.name+"__choose")?.focus();});
    }
  }
  /** The shared uploader targets the folder; the first file stored of the batch becomes the value. */
  private async upload():Promise<void>{
    if(!this.config.policy||this.disposed)return;
    let directory:Directory;
    try{directory=await this.directory();}catch(error){message({text:error instanceof Error?error.message:t("Sikertelen művelet."),css:"blade-toast",expire:6000});return;}
    if(this.disposed)return;
    uploads.open({resource:this.config.resource,action:"upload",target:directory.id,targetLabel:directoryLabel(directory),policy:this.config.policy,onUploaded:(result:UploadResult)=>{
      const first=result.succeeded[0];if(!first||this.disposed)return;
      const item=(first.item??{}) as Partial<Entry>;
      this.set(descriptor({...item,id:String(item.id??first.id),name:String(item.name??first.name),thumbnail:item.thumbnail??"pending"}));
    }});
  }
  destroy():void{this.disposed=true;this.picker?.close();}
}

/** Every `file` field of a Form; `values._media` (or the list row's) describes the current files. */
export class FileFields{
  private fields:FileField[]=[];
  constructor(form:Form,fields:FieldDefinition[],call:ResourceCall,sources:(Row|undefined)[]=[],readOnly:(field:FieldDefinition)=>boolean=()=>false){
    for(const field of fields){
      if(field.type!=="file"||!field.file||!form.getItem(field.name))continue;
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

  constructor(private config:FileFieldConfig,title:string,private call:ResourceCall,private folder:()=>Promise<Directory>,private current=""){
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

import { locale, t } from "./I18n";
import { Form, Layout, Toolbar, Window, message, awaitRedraw, tooltip } from "@dhtmlx/suite";
import { ResponsiveToolbar } from "./ResponsiveToolbar";
import { ResponsiveGrid } from "./ResponsiveGrid";
import { TreeAdapter } from "./TreeAdapter";
import { widgetIcons } from "./WidgetIcons";
import { fitWindow } from "./WindowSizing";
import { FormValidation, type FieldDefinition } from "./FormValidation";
import { acknowledge, requestChoice, requestConfirmation } from "./MessageDialog";
import { escape, clearedText, mergeUsages, type Usage } from "./RecordPresentation";
import { actionUrl } from "./ActionUrl";
import { server } from "./api/Server";
import { uploads, type UploadEvents, type UploadFileInfo, type UploadPolicy } from "./Uploader";
import { MediaPlayer } from "./components/media/MediaPlayer";
import type { Row } from "./Realtime";
import type { ActionConfirmation, ViewDefinition } from "./Workspace";

export type FileManagerConfig={mounts:{id:string;label:string}[];upload:{policy:UploadPolicy};text:{extension:string;maxBytes:number};preview:string[];thumbnails?:string[];maxDepth:number;deletePolicy?:string};
export type FileViewDefinition={kind:"files";resource:string;title:string;icon?:string;desktopOnly?:boolean;group?:string;actions:{name:string;label:string;icon?:string;write:boolean;get?:boolean;confirm?:ActionConfirmation;usages?:boolean;fields:FieldDefinition[]}[];files:FileManagerConfig};
type Entry={id:string;name:string;kind:"directory"|"file";extension:string;mime_type:string;size:number;modified_at:string;revision:string;width?:number|null;height?:number|null;duration_ms?:number|null;orientation?:string;thumbnail?:"ready"|"pending"|"failed"|"none"};
type Listing={directory:Directory;items:Entry[];next?:string|null;total?:number;matched?:number};
type Sort="name"|"modified"|"size"|"type";
type TypeFilter=""|"directory"|"image"|"video"|"text"|"other";
/** Server-side listing query of one panel (`list` values); paging continues it through `next`. */
type Query={sort:Sort;direction:"asc"|"desc";search:string;type:TypeFilter};
type Geometry={left:number;top:number;width:number;height:number;full:boolean};
/** Previous/next across the previewable files (images, videos, audio) of the panel's loaded rows. */
type Navigation={index:number;count:number;go:(win:Window,step:1|-1)=>void};
type TreeItem={id:string;parent:string;name:string;kind:"directory"|"file";mime_type:string};
type Tree={root:string;items:TreeItem[];truncated:boolean};
type Directory={id:string;mount:string;depth:number;path:{id:string;name:string}[]};
type Summary={succeeded:{name:string}[];skipped:{name:string}[];failed:{name:string;error:string}[];cleared?:Record<string,number>};
/** Notifications of the public component (`components/files/FileManager.ts`): a file shown in the viewer or editor. */
export type FileManagerHooks={opened?:(file:{id:string;mimeType:string})=>void};
/** "Plakátok: 2, Médiatár-elemek: 1" of usage counts. */
const usageList=(usages:Usage[])=>usages.map(usage=>`${usage.label}: ${usage.count.toLocaleString(locale())}`).join(", ");
type Failure=Error&{status?:number;fieldErrors?:Record<string,string>;details?:any};
type Part={field:string;blob:Blob;name:string};
/** `file` is the file chosen in tree mode; `files` maps the tree's file nodes to their folders. */
/** `heading` is the full path shown, possibly shortened, in the panel header. */
/** `next` continues the listing (null at its end); `total`/`matched` are the server counts of the folder. */
type Panel={index:number;mount:string;mode:"files"|"tiles"|"tree";directory?:Directory;heading?:string;rows:Row[];selected?:string;file?:string;files:Map<string,string>;layout:Layout;bar:Toolbar;find:Toolbar;search:Toolbar;searchTimer?:ReturnType<typeof setTimeout>;tree:TreeAdapter;grid:ResponsiveGrid;epoch:number;
  query:Query;next:string|null;loading:boolean;capped:boolean;total:number;matched:number};
/** Same Cancel + submit row as the workspace forms. */
const formActions=(submit:{name:string;text:string;icon:string}):any=>({css:"blade-form-actions",cols:[
  {type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"},
  {type:"button",...submit,color:"primary",width:"content"},
]});
/** Suite icon by kind and detected MIME type, the same in the listing and the tree. */
const fileIcon=(kind:string,mime:string):string=>kind==="directory"?"dxi dxi-folder":mime.startsWith("image/")?"dxi dxi-image-outline":mime.startsWith("video/")?"dxi dxi-menu-right":mime==="text/csv"?"dxi dxi-file-excel":mime.startsWith("text/")||mime==="application/json"?"dxi dxi-format-align-left":"dxi dxi-file-outline";
const iconLabels=():Record<string,string>=>({"dxi dxi-arrow-up":t("Szülőmappa"),"dxi dxi-file-import":t("Feltöltés alatt"),"dxi dxi-folder":t("Mappa"),"dxi dxi-image-outline":t("Kép"),"dxi dxi-menu-right":t("Videó"),"dxi dxi-file-excel":t("Táblázat"),"dxi dxi-format-align-left":t("Szöveg"),"dxi dxi-file-outline":t("Fájl")});
/** The listing's first row in a subfolder, as in mc: opens the parent and is never an operand. */
const PARENT="..";
/** Rows of one listing request (the server maximum) and the most rows a panel keeps loaded. */
const PAGE=200,MAX_ROWS=3000,SEARCH_MAX=100;
const SORTS:[Sort,string][]=[["name","Név"],["modified","Módosítva"],["size","Méret"],["type","Típus"]];
const TYPES:[TypeFilter,string][]=[["","Minden típus"],["directory","Mappák"],["image","Képek"],["video","Videók"],["text","Szöveg"],["other","Egyéb"]];
/** Type class of an entry, as the server's `type` filter defines it. */
const typeOf=(entry:{kind:unknown;mime_type?:unknown}):TypeFilter=>{const mime=String(entry.mime_type??"");return entry.kind==="directory"?"directory":mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":mime.startsWith("text/")||mime==="application/json"?"text":"other";};
const UPLOAD="upload:";

/** Two-panel virtual file manager: per-panel mount, Tree and Grid; every operation is a registered action. */
export class FileManager {
  readonly layout:Layout;
  private releaseIcons=widgetIcons();
  private panels:Panel[]=[];
  private active=0;
  private commands:ResponsiveToolbar;
  private windows=new Set<Window>();
  /** Input a page reload would discard, per open window: a name form while open, the text editor while its text is unsaved. */
  private inputs=new Map<Window,()=>boolean>();
  private listeners=new AbortController();
  private mobile?:boolean;
  private busy=false;
  private disposed=false;
  private engaged=false;
  private config:FileManagerConfig;
  private measure?:CanvasRenderingContext2D;
  private observer=new ResizeObserver(()=>{for(const panel of this.panels)this.heading(panel);});
  /** In-flight uploads of this resource by uploader file id: shown as unmarkable rows in panels showing their target folder. */
  private pending=new Map<string,{file:UploadFileInfo;state:string}>();
  /** Folders whose tree (and, for `relist`, listing) is refreshed once uploads settle: created subfolders cannot be inserted in place. */
  private uploaded=new Set<string>();
  private relist=new Set<string>();
  private uploadTimer?:ReturnType<typeof setTimeout>;
  private ours=(file:UploadFileInfo)=>!this.disposed&&file.resource===this.view.resource&&file.action==="upload";
  private uploadState=(state:string)=>({file}:{file:UploadFileInfo})=>{if(!this.ours(file))return;this.pending.set(file.id,{file,state});this.paintPending(file.target);};
  private uploadQueued=this.uploadState("queued");
  private uploadStarted=this.uploadState("started");
  private uploadConflict=this.uploadState("conflict");
  private uploadProgress=({file,received,size}:UploadEvents["upload:progress"])=>{
    if(!this.ours(file))return;
    const state="progress:"+Math.floor(size?received/size*100:0);
    if(this.pending.get(file.id)?.state===state)return;
    this.pending.set(file.id,{file,state});this.paintPending(file.target);
  };
  private uploadGone=({file}:{file:UploadFileInfo})=>{if(!this.ours(file)||!this.pending.delete(file.id))return;this.paintPending(file.target);};
  private fileDone=({file,result}:UploadEvents["upload:file-done"])=>{
    if(!this.ours(file))return;
    this.pending.delete(file.id);
    for(const entry of result.succeeded){
      const parent=String(entry.parent??file.target??""),item=entry.item as Entry|undefined,overwrote=(entry as {replaced?:unknown}).replaced,replaced=typeof overwrote==="string"?overwrote:undefined;
      if(file.target)this.uploaded.add(file.target);
      if(parent)this.uploaded.add(parent);
      // Finished files are inserted in place; a file in a created subfolder (folder upload) changes the target's listing.
      if(item&&typeof item.id==="string"){for(const panel of this.panels)if(panel.directory?.id===parent)void this.insert(panel,item,replaced);}
      else if(parent)this.relist.add(parent);
      if(file.target&&parent!==file.target)this.relist.add(file.target);
    }
    this.paintPending(file.target);
    clearTimeout(this.uploadTimer);this.uploadTimer=setTimeout(()=>void this.refreshUploaded(),1000);
  };
  private uploadComplete=()=>{if(!this.disposed&&(this.uploaded.size||this.relist.size)){clearTimeout(this.uploadTimer);void this.refreshUploaded();}};

  constructor(host:HTMLElement,private view:FileViewDefinition,private hooks:FileManagerHooks={}){
    this.config=view.files;
    // Native wide group and resizer; no width or minWidth, which would make the Layout cells fixed.
    this.layout=new Layout(host,{type:"space",rows:[
      {type:"wide",css:"blade-file-panels",cols:[
        {id:"panel-0",header:t("Bal panel"),css:"blade-file-panel",resizable:true},
        {id:"panel-1",header:t("Jobb panel"),css:"blade-file-panel"},
      ]},
      {id:"commands",height:48,css:"blade-command-row blade-file-commands"},
    ]});
    const action=(name:string,label:string,icon:string,tooltip?:string)=>this.can(name)?[{id:name,value:t(label),icon,...(tooltip?{tooltip:t(tooltip)}:{})}]:[];
    this.commands=new ResponsiveToolbar(undefined,{data:[
      ...action("create_directory","Új mappa","dxi dxi-plus"),
      ...action("copy","Másolás","dxi dxi-copy","Másolás a másik panelre"),
      ...action("move","Áthelyezés","dxi dxi-file-export","Áthelyezés a másik panelre"),
      ...action("rename","Átnevezés","dxi dxi-format-textbox","Átnevezés (F2)"),
      ...action("delete","Törlés","dxi dxi-delete","Törlés (Del)"),
      ...(this.can("download")||this.canZip()?[{id:"download",value:t("Letöltés"),icon:"dxi dxi-download"}]:[]),
      ...action("text_get","Szerkesztés","dxi dxi-pencil"),
      ...action("content_stream","Megtekintés","dxi dxi-eye"),
      ...action("upload","Feltöltés","dxi dxi-file-import"),
      {type:"spacer"},
      {id:"panel-switch",value:t("Panel: {panel}",{panel:t("Bal")}),icon:"dxi dxi-view-grid",hidden:true,items:[{id:"panel:0",value:t("Bal panel")},{id:"panel:1",value:t("Jobb panel")}]},
    ]});
    this.commands.events.on("click",(id:string|number)=>void this.command(String(id)));
    this.layout.getCell("commands").attach(this.commands);
    const mounts=this.config.mounts;
    for(const index of [0,1]){
      const panel=this.panel(index,(mounts[index]??mounts[0]).id);
      this.panels.push(panel);
      this.layout.getCell("panel-"+index).attach(panel.layout);
    }
    const signal=this.listeners.signal,root=this.layout.getRootNode();
    // Delegated on the outer root: panel cells are re-rendered when they are hidden and shown.
    const cellOf=(event:Event)=>(event.target as HTMLElement|null)?.closest?.<HTMLElement>("[data-cell-id^='panel-']")??null;
    const activate=(event:Event)=>{const cell=cellOf(event);if(cell)this.activate(Number(cell.dataset.cellId!.slice(6)));};
    root?.addEventListener("pointerdown",activate,{capture:true,signal});
    root?.addEventListener("focusin",activate,{signal});
    // A shortened header path shows the full path in the native Suite tooltip.
    root?.addEventListener("mouseover",event=>{
      const title=(event.target as HTMLElement|null)?.closest<HTMLElement>(".dhx_layout-cell-header__title");
      const panel=this.panels[Number(title?.closest<HTMLElement>("[data-cell-id^='panel-']")?.dataset.cellId?.slice(6))];
      if(title&&panel?.heading&&(title.textContent!==panel.heading||title.scrollWidth>title.clientWidth))tooltip(panel.heading,{node:title,position:"bottom" as Parameters<typeof tooltip>[1]["position"],htmlEnable:false});
    },{signal});
    // Files or folders dropped onto a panel open the uploader for that panel's folder.
    const dropTarget=(event:DragEvent):Panel|undefined=>{
      if(!this.can("upload")||!event.dataTransfer?.types.includes("Files"))return undefined;
      const panel=this.panels[Number(cellOf(event)?.dataset.cellId?.slice(6))];
      return panel?.directory?panel:undefined;
    };
    const highlight=(panel?:Panel)=>{for(const p of this.panels)p.layout.getRootNode()?.classList.toggle("blade-file-panel__body--drop",p===panel);};
    for(const type of ["dragenter","dragover"] as const)root?.addEventListener(type,event=>{
      const panel=dropTarget(event);if(!panel)return;
      event.preventDefault();event.dataTransfer!.dropEffect="copy";highlight(panel);
    },{signal});
    root?.addEventListener("dragleave",event=>{if(!(event.relatedTarget instanceof Node&&root.contains(event.relatedTarget)))highlight();},{signal});
    root?.addEventListener("drop",event=>{
      const panel=dropTarget(event);highlight();if(!panel)return;
      event.preventDefault();this.activate(panel.index);
      this.openUpload(panel,{transfer:event.dataTransfer!});
    },{signal});
    // Keyboard and clipboard of a focused panel: F2 renames, Del deletes, Ctrl+V uploads clipboard files.
    document.addEventListener("pointerdown",event=>{this.engaged=!!root&&event.target instanceof Node&&root.contains(event.target);},{capture:true,signal});
    document.addEventListener("keydown",event=>{
      if(this.disposed||event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      const id=event.key==="F2"?"rename":event.key==="Delete"?"delete":"";
      if(!id||!this.focused(event.target)||!this.enabled(id))return;
      event.preventDefault();void this.command(id);
    },{signal});
    document.addEventListener("paste",event=>{
      if(this.disposed||!this.can("upload")||!this.focused(event.target)||!this.current.directory)return;
      const data=event.clipboardData;
      let files=Array.from(data?.files??[]);
      if(!files.length)files=Array.from(data?.items??[]).filter(item=>item.kind==="file").map(item=>item.getAsFile()).filter((file):file is File=>!!file);
      if(!files.length)return;
      event.preventDefault();this.openUpload(this.current,{files});
    },{signal});
    window.addEventListener("resize",()=>this.responsive(),{signal});
    this.activate(0);this.responsive();
    for(const panel of this.panels)void this.mount(panel,panel.mount);
    uploads.on("upload:queued",this.uploadQueued);uploads.on("upload:started",this.uploadStarted);uploads.on("upload:progress",this.uploadProgress);
    uploads.on("upload:conflict",this.uploadConflict);uploads.on("upload:file-failed",this.uploadGone);uploads.on("upload:cancelled",this.uploadGone);
    uploads.on("upload:file-done",this.fileDone);uploads.on("upload:complete",this.uploadComplete);
  }

  private can(name:string):boolean{return this.view.actions.some(action=>action.name===name);}
  /** A ZIP needs both halves: the `zip_prepare` manifest and the GET `zip_get` stream. */
  private canZip():boolean{return this.can("zip_prepare")&&this.can("zip_get");}
  private action(name:string){return this.view.actions.find(action=>action.name===name);}
  private field(action:string,name:string):FieldDefinition|undefined{return this.action(action)?.fields.find(field=>field.name===name);}
  private get current():Panel{return this.panels[this.active];}
  private get other():Panel{return this.panels[1-this.active];}
  /** The event comes from the panels (not a text field), or from the page body right after a click into them. */
  private focused(target:EventTarget|null):boolean{
    if(this.windows.size||document.querySelector("[role='alertdialog']"))return false;
    const root=this.layout.getRootNode(),element=target as HTMLElement|null;
    if(element?.closest?.("input,textarea,select,[contenteditable]"))return false;
    return !!(root&&element instanceof Node&&root.contains(element))||(this.engaged&&(element===document.body||element===document.documentElement));
  }

  private panel(index:number,mount:string):Panel{
    // Each panel shows its file listing, its tiles or its folder tree, as the panel modes of mc.
    const layout=new Layout(document.createElement("div"),{type:"none",css:"blade-file-panel__body",rows:[
      {id:"bar",height:48,css:"blade-command-row"},
      {height:48,css:"blade-command-row blade-file-find",cols:[{id:"search",css:"blade-search-cell"},{id:"find",width:340}]},
      {id:"body"},
    ]});
    // Both cells stay mounted and the inactive one is hidden by cell CSS: Layout views would
    // re-create the listing's DOM, losing the grid's row-marking and scroll listeners.
    const body=new Layout(document.createElement("div"),{type:"none",rows:[{id:"files",css:"blade-file-list"},{id:"tree",css:"blade-file-view--hidden"}]});
    const bar=new Toolbar(undefined,{css:"blade-file-bar",data:[
      {id:"mount",value:"",icon:"dxi dxi-folder",items:this.config.mounts.map(m=>({id:"mount:"+m.id,value:escape(m.label)}))},
      {id:"mode",value:t("Nézet: Fájllista"),icon:"dxi dxi-table-check",items:[{id:"mode:files",value:t("Fájllista"),icon:"dxi dxi-table-check"},{id:"mode:tiles",value:t("Csempék"),icon:"dxi dxi-border-all"},{id:"mode:tree",value:t("Mappafa"),icon:"dxi dxi-folder-open"}]},
      {type:"spacer"},
      {id:"count",type:"text",value:""},
    ]});
    const find=new Toolbar(undefined,{css:"blade-file-bar blade-file-find__bar",data:[
      {type:"spacer"},
      {id:"type",value:t("Minden típus"),icon:"dxi dxi-filter-variant",tooltip:t("Típus"),items:TYPES.map(([value,label])=>({id:"type:"+(value||"all"),value:t(label)}))},
      {id:"sort",value:this.sortLabel({sort:"name",direction:"asc"}),icon:"dxi dxi-sort",items:SORTS.flatMap(([field,label])=>(["asc","desc"] as const).map(direction=>({id:`sort:${field}:${direction}`,value:t(label)+(direction==="asc"?" ↑":" ↓"),icon:direction==="asc"?"dxi dxi-arrow-up":"dxi dxi-arrow-down"})))},
    ]});
    const search=new Toolbar(document.createElement("div"),{css:"blade-search-bar",data:[{type:"input",id:"search",label:t("Keresés"),hiddenLabel:true,placeholder:t("Keresés…"),icon:"dxi dxi-magnify",width:"100%",autocomplete:false}]} as any);
    const columns:ViewDefinition["columns"]=[
      // Flexible minimum widths: all metadata columns fit a half-screen panel at 1366 px.
      {id:"icon",header:t("Ikon"),type:"icon",width:56,options:iconLabels()},
      // Thumbnails (`thumbnail_get`) of the tiles and cards; the listing keeps its icon column.
      {id:"thumb",header:t("Előnézet"),media:this.view.resource},
      {id:"name",header:t("Név"),minWidth:140},
      {id:"kind",header:t("Típus"),minWidth:70,options:{directory:t("Mappa"),file:t("Fájl"),parent:t("Szülőmappa")}},
      {id:"extension",header:t("Kiterjesztés"),minWidth:86},
      {id:"size_label",header:t("Méret"),minWidth:70,align:"right"},
      {id:"modified_label",header:t("Módosítva"),minWidth:120},
    ];
    const panel:Panel={index,mount,mode:"files",rows:[],files:new Map(),layout,bar,find,search,epoch:0,
      query:{sort:"name",direction:"asc",search:"",type:""},next:null,loading:false,capped:false,total:0,matched:0,
      tree:new TreeAdapter(id=>void this.choose(panel,id),id=>{if(panel.files.has(id)&&panel.file===id)void this.launch(panel);}),
      grid:undefined as unknown as ResponsiveGrid};
    // Row marking as in the workspaces: click, Ctrl/Cmd-click and Shift-click; no checkbox column.
    panel.grid=new ResponsiveGrid(document.createElement("div"),columns,()=>panel.rows,id=>{panel.selected=id;this.capabilities();},()=>void this.enter(panel),direction=>{if(direction==="next")void this.more(panel);},()=>{},
      {rowNumbers:false,rowSelection:true,idColumn:false,fields:columns,tiles:true,tileMinWidth:150,marked:()=>this.capabilities()});
    panel.grid.setColumnVisible("thumb",false);
    bar.events.on("click",(id:string|number)=>{
      const value=String(id);
      if(value.startsWith("mount:"))void this.mount(panel,value.slice(6));
      else if(value.startsWith("mode:"))void this.mode(panel,value.slice(5) as Panel["mode"],body);
    });
    find.events.on("click",(id:string|number)=>{
      const value=String(id);
      if(value.startsWith("type:")){const type=(value==="type:all"?"":value.slice(5)) as TypeFilter;FileManager.label(find,"type",t(TYPES.find(([key])=>key===type)![1]));this.requery(panel,{type});}
      else if(value.startsWith("sort:")){const [,sort,direction]=value.split(":") as [string,Sort,"asc"|"desc"];FileManager.label(find,"sort",this.sortLabel({sort,direction}));this.requery(panel,{sort,direction});}
    });
    // Search: reloads 300 ms after typing, Enter searches at once, Escape clears (as the workspace search).
    search.events.on("inputCreated",(_id:string|number,input:HTMLInputElement)=>{input.maxLength=SEARCH_MAX;});
    search.events.on("input",(_id:string|number,value:string)=>{clearTimeout(panel.searchTimer);panel.searchTimer=setTimeout(()=>this.requery(panel,{search:this.searchText(value)}),300);});
    search.events.on("keydown",(event:KeyboardEvent)=>{
      const input=event.target as HTMLInputElement;
      if(event.key==="Enter"){event.preventDefault();this.requery(panel,{search:this.searchText(input.value)});}
      else if(event.key==="Escape"){event.preventDefault();input.value="";search.data.update("search",{value:""});this.requery(panel,{search:""});}
    });
    layout.getCell("bar").attach(bar);layout.getCell("search").attach(search);layout.getCell("find").attach(find);layout.getCell("body").attach(body);
    body.getCell("tree").attach(panel.tree.widget);body.getCell("files").attach(panel.grid.layout);
    this.observer.observe(layout.getRootNode());
    return panel;
  }
  private sortLabel(query:Pick<Query,"sort"|"direction">):string{return t("Rendezés: ")+t(SORTS.find(([key])=>key===query.sort)![1])+(query.direction==="asc"?" ↑":" ↓");}
  private searchText(value:string):string{return Array.from(String(value??"").trim()).slice(0,SEARCH_MAX).join("").trim();}
  /** A changed search, type filter or sort reloads the panel's folder from its first window. */
  private requery(panel:Panel,change:Partial<Query>):void{
    clearTimeout(panel.searchTimer);panel.searchTimer=undefined;
    const query={...panel.query,...change};
    if(this.disposed||JSON.stringify(query)===JSON.stringify(panel.query))return;
    panel.query=query;this.activate(panel.index);
    if(panel.directory)void this.open(panel,panel.directory.id);
  }
  private clearSearch(panel:Panel):void{
    clearTimeout(panel.searchTimer);panel.searchTimer=undefined;
    if(!panel.query.search)return;
    panel.query={...panel.query,search:""};panel.search.data.update("search",{value:""});
    const input=panel.search.getRootNode()?.querySelector("input");if(input)input.value="";
  }

  /** Switches one panel between listing, tiles and tree; its folder and marks and the other panel are unchanged. */
  private async mode(panel:Panel,mode:Panel["mode"],body:Layout):Promise<void>{
    if(panel.mode===mode)return;
    panel.mode=mode;this.activate(panel.index);
    const label={files:["Nézet: Fájllista","dxi dxi-table-check"],tiles:["Nézet: Csempék","dxi dxi-border-all"],tree:["Nézet: Mappafa","dxi dxi-folder-open"]}[mode];
    panel.bar.data.update("mode",{value:t(label[0]),icon:label[1]});
    if(mode!=="tree")panel.grid.setMode(mode==="tiles"?"tiles":"table");
    body.getCell("files").config.css="blade-file-list"+(mode==="tree"?" blade-file-view--hidden":"");
    body.getCell("tree").config.css=mode==="tree"?"":"blade-file-view--hidden";
    body.paint();
    await awaitRedraw();if(this.disposed)return;
    if(mode==="tree"&&panel.directory)panel.tree.reveal(panel.file??panel.directory.id);
    this.capabilities();
  }

  private activate(index:number):void{
    if(this.disposed)return;
    const changed=index!==this.active;this.active=index;
    if(changed||this.mobile)this.paintPanels();
    this.commands.data.update("panel-switch",{value:t("Panel: {panel}",{panel:t(index?"Jobb":"Bal")})});
    this.capabilities();
  }

  /**
   * Cell configuration rather than DOM classes, so Layout keeps it on every repaint. Below 768 px
   * the inactive panel is only hidden by CSS: its widgets, mount, folder and marks stay intact.
   */
  private paintPanels():void{
    for(const panel of this.panels)this.layout.getCell("panel-"+panel.index).config.css="blade-file-panel"+(panel.index===this.active?" blade-file-panel--active":this.mobile?" blade-file-panel--hidden":"");
    // One panel at a time has no divider; drop dragged widths so the visible panel fills the row.
    const left=this.layout.getCell("panel-0").config;
    left.resizable=!this.mobile;
    if(this.mobile)left.width=this.layout.getCell("panel-1").config.width=undefined;
    this.layout.paint();
  }
  private responsive():void{
    const mobile=innerWidth<768;
    if(mobile===this.mobile)return;
    this.mobile=mobile;
    if(mobile)this.commands.show("panel-switch");else this.commands.hide("panel-switch");
    this.paintPanels();
  }

  /** A tree node: a folder opens; a file opens its folder and becomes the panel's operand. */
  private async choose(panel:Panel,id:string):Promise<void>{
    const folder=panel.files.get(id);
    panel.file=folder&&id;
    // A chosen folder opens in the tree too, so its files are visible.
    if(folder===undefined){await this.open(panel,id);if(panel.directory?.id===id)panel.tree.reveal(id,true);}
    else if(panel.directory?.id!==folder)await this.open(panel,folder);
    else this.capabilities();
  }
  /** Opens the file in the window its type has: text editor, or the media player for images, videos and audio. */
  private async launch(panel:Panel):Promise<void>{
    const row=this.target(panel);
    if(this.editable(row)&&this.can("text_get")){this.activate(panel.index);await this.openEditor();}
    else if(this.previewable(row)&&this.can("content_stream")){this.activate(panel.index);await this.openPreview();}
  }

  private selection(panel:Panel):string[]{
    // In tree mode the selected file or folder itself is the operand; a mount root cannot be.
    if(panel.mode==="tree")return panel.file?[panel.file]:panel.directory&&panel.directory.depth>0?[panel.directory.id]:[];
    const marked=panel.grid.markedIds;
    // The ".." row and in-flight uploads hold the cursor, never an operand.
    return marked.length?marked:panel.selected&&this.entry(panel,panel.selected)?._markable!==false?[panel.selected]:[];
  }
  private entry(panel:Panel,id?:string):Row|undefined{return panel.rows.find(row=>row.id===id);}
  private editable(row?:Row):boolean{return row?.kind==="file"&&String(row.extension).toLowerCase()===this.config.text.extension;}
  private previewable(row?:Row):boolean{return row?.kind==="file"&&this.config.preview.includes(String(row.mime_type));}
  /** A file operand: a listing row of kind file, or a file node of the tree. */
  private isFile(panel:Panel,id:string):boolean{const row=this.entry(panel,id);return row?row.kind==="file":panel.files.has(id);}
  private nameOf(panel:Panel,id:string):string{
    return String(this.entry(panel,id)?.name??panel.directory?.path.find(part=>part.id===id)?.name??panel.tree.widget.data.getItem(id)?.value??"");
  }

  /** Whether a command applies to the active panel's current operands. */
  private enabled(id:string):boolean{
    if(this.busy||!this.panels.length)return false;
    const panel=this.current,other=this.other,chosen=this.selection(panel);
    switch(id){
      case "create_directory":return this.can(id)&&!!panel.directory&&panel.directory.depth<this.config.maxDepth;
      case "upload":return this.can(id)&&!!panel.directory;
      case "copy":case "move":return this.can(id)&&!!chosen.length&&!!other.directory;
      case "rename":return this.can(id)&&chosen.length===1;
      case "delete":return this.can(id)&&!!chosen.length&&!!panel.directory;
      case "download":return !!chosen.length&&!!panel.directory&&(chosen.length===1&&this.isFile(panel,chosen[0])?this.can("download"):this.canZip());
      case "text_get":return this.can(id)&&this.editable(this.target(panel));
      case "content_stream":return this.can(id)&&this.previewable(this.target(panel));
      default:return false;
    }
  }
  private capabilities():void{
    if(this.disposed||!this.panels.length)return;
    for(const id of ["create_directory","upload","copy","move","rename","delete","download","text_get","content_stream"]){
      if(!this.commands.data.getItem(id)&&!this.can(id)&&id!=="download")continue;
      if(id==="download"&&!this.can("download")&&!this.canZip())continue;
      if(this.enabled(id))this.commands.enable(id);else this.commands.disable(id);
    }
  }
  /** The editor's file: the tree's file, or the single marked or selected row. */
  private target(panel:Panel):Row|undefined{
    if(panel.mode==="tree")return this.entry(panel,panel.file);
    const marked=panel.grid.markedIds;
    return marked.length>1?undefined:this.entry(panel,marked[0]??panel.selected);
  }

  private async command(id:string):Promise<void>{
    if(id.startsWith("panel:")){this.activate(Number(id.slice(6)));return;}
    if(this.busy)return;
    if(id==="create_directory")this.openCreate();
    else if(id==="upload")this.openUpload();
    else if(id==="copy"||id==="move")await this.transfer(id);
    else if(id==="rename")this.openRename();
    else if(id==="delete")await this.remove();
    else if(id==="download")await this.download();
    else if(id==="text_get")await this.openEditor();
    else if(id==="content_stream")await this.openPreview();
  }

  /** Binary content (`text_save`) travels as multipart parts beside the JSON request. Reads end with `destroy()`; writes complete. */
  private call(action:string,id:string|null,values:Record<string,unknown>={},parts?:Part[]):Promise<any>{
    return server.call(this.view.resource,action,{id,values,parts,...(this.action(action)?.write?{}:{signal:this.listeners.signal})});
  }
  private async error(error:unknown):Promise<void>{
    if(this.disposed)return;
    const e=error as Failure;
    const failed=(e.details?.failed??[]) as {name:string;error:string}[];
    await acknowledge({title:t("Hiba"),severity:"danger",message:[e instanceof Error?e.message:t("Sikertelen művelet."),...Object.values(e.fieldErrors??{}),...failed.map(item=>`${item.name}: ${item.error}`)].join("\n")});
  }

  private size(bytes:number):string{
    return bytes<1024?t("{size} B",{size:bytes}):new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(bytes/(bytes<1048576?1024:1048576))+(bytes<1048576?" KB":" MB");
  }
  private display(entry:Entry):Row{
    const size=entry.kind==="directory"?"":this.size(entry.size);
    const modified=Number.isNaN(Date.parse(entry.modified_at))?entry.modified_at:new Intl.DateTimeFormat(locale(),{dateStyle:"short",timeStyle:"short"}).format(new Date(entry.modified_at));
    // Suite Grid reads a row's `height` as its pixel height: media dimensions keep their own keys.
    const {width,height,...rest}=entry;
    // The media descriptor of the tiles' and cards' thumbnail, built from the listing's own metadata.
    const media=entry.kind==="file"?{id:entry.id,name:entry.name,mime_type:entry.mime_type,revision:entry.revision,duration_ms:entry.duration_ms??null,width:width??null,height:height??null,thumbnail:entry.thumbnail??"none"}:null;
    return {...rest,media_width:width??null,media_height:height??null,icon:fileIcon(entry.kind,entry.mime_type),size_label:size,modified_label:modified,_media:{thumb:media}};
  }
  /** In-flight upload rows: never marked or opened, their state in the type column. */
  private placeholders(directory:string):Row[]{
    return [...this.pending.values()].filter(({file})=>file.target===directory).map(({file,state})=>({
      id:UPLOAD+file.id,name:file.relativePath||file.name,kind:state.startsWith("progress:")?t("Feltöltés: {percent} %",{percent:state.slice(9)}):t(state==="conflict"?"Döntésre vár":state==="started"?"Feltöltés…":"Várakozik"),
      icon:"dxi dxi-file-import",extension:"",size_label:this.size(file.size),modified_label:"",_markable:false,_media:{thumb:null}}));
  }
  private paintPending(directory:string|null):void{
    if(this.disposed||!directory)return;
    for(const panel of this.panels){
      if(panel.directory?.id!==directory)continue;
      const parent=panel.rows.filter(row=>row.id===PARENT),rest=panel.rows.filter(row=>row.id!==PARENT&&!String(row.id).startsWith(UPLOAD));
      void this.render(panel,[...parent,...this.placeholders(directory),...rest]);
    }
  }
  private counter(panel:Panel):void{
    const filtered=!!(panel.query.search||panel.query.type);
    FileManager.label(panel.bar,"count",filtered?t("{matched} / {total} elem",{matched:panel.matched.toLocaleString(locale()),total:panel.total.toLocaleString(locale())}):t("{count} elem",{count:panel.total.toLocaleString(locale())}));
  }
  /** Replaces the panel's rows keeping the visible record and the cursor. */
  private async render(panel:Panel,rows:Row[]):Promise<void>{
    const same=rows.length===panel.rows.length&&rows.every((row,index)=>row.id===panel.rows[index].id);
    const position=same?undefined:panel.grid.capture();
    panel.rows=rows;panel.grid.setRows(rows);
    if(panel.selected&&!this.entry(panel,panel.selected))panel.selected=undefined;
    this.counter(panel);this.capabilities();
    if(!position)return;
    await awaitRedraw();if(this.disposed)return;
    panel.grid.restore(position,true,panel.selected);
  }
  /** Directories first, then the sort key and the id, in the query's direction: the server order. */
  private compare(panel:Panel,a:Row,b:Row):number{
    const rank=(row:Row)=>row.kind==="directory"?0:1;
    if(rank(a)!==rank(b))return rank(a)-rank(b);
    const order=(x:unknown,y:unknown)=>x!<y!?-1:x!>y!?1:0,name=(row:Row)=>String(row.name).toLowerCase();
    const sort=panel.query.sort;
    const key=sort==="modified"?order(a.modified_at,b.modified_at):sort==="size"?(a.kind==="directory"?order(name(a),name(b)):order(Number(a.size),Number(b.size))):sort==="type"?order(String(a.extension).toLowerCase(),String(b.extension).toLowerCase())||order(name(a),name(b)):order(name(a),name(b));
    return (key||order(Number(a.id),Number(b.id)))*(panel.query.direction==="desc"?-1:1);
  }
  /**
   * Inserts or replaces one entry at its sorted position when it passes the panel's search and type filter.
   * $replaced is the id of the entry it overwrote (upload results): that row goes, and the counters stay, also
   * when the replaced row is outside the loaded window or the overwrite gave the entry a new id (`archive`).
   */
  private async insert(panel:Panel,entry:Entry,replaced?:string):Promise<void>{
    const existed=replaced!==undefined||panel.rows.some(row=>row.id===entry.id),row=this.display(entry);
    const rows=panel.rows.filter(other=>other.id!==entry.id&&other.id!==replaced);
    const passes=(!panel.query.search||entry.name.toLowerCase().includes(panel.query.search.toLowerCase()))&&(!panel.query.type||typeOf(entry)===panel.query.type);
    if(!existed){panel.total++;if(passes)panel.matched++;}
    if(passes){
      const start=rows.findIndex(other=>other._markable!==false);
      let index=start<0?-1:rows.findIndex((other,i)=>i>=start&&other._markable!==false&&this.compare(panel,row,other)<0);
      // Beyond the loaded window it arrives with the next page.
      if(index<0&&!panel.next)index=rows.length;
      if(index>=0)rows.splice(index,0,row);
    // A shown row passed the filter; only its going away changes the matched count.
    }else if(panel.rows.some(other=>other.id===entry.id||other.id===replaced))panel.matched--;
    await this.render(panel,rows);
  }

  private async mount(panel:Panel,mount:string):Promise<void>{
    const epoch=++panel.epoch;
    try{
      const tree:Tree=await this.call("tree",mount);
      if(this.disposed||epoch!==panel.epoch)return;
      panel.mount=mount;panel.file=undefined;
      panel.bar.data.update("mount",{value:escape(this.config.mounts.find(m=>m.id===mount)?.label??mount)});
      this.tree(panel,tree);
      await this.open(panel,tree.root,epoch);
    }catch(error){await this.error(error);}
  }

  private tree(panel:Panel,tree:Tree):void{
    panel.files=new Map(tree.items.filter(item=>item.kind==="file").map(item=>[item.id,item.parent]));
    if(panel.file&&!panel.files.has(panel.file))panel.file=undefined;
    panel.tree.setItems(tree.items.map(item=>({id:item.id,parent:item.parent,value:item.name,...(item.kind==="file"?{folder:false,icon:fileIcon(item.kind,item.mime_type)}:{})})),"0");
    if(tree.truncated)message({text:t("A mappafa nem mutat minden fájlt."),css:"blade-toast",expire:6000});
  }
  /** Refreshes only the folder tree (after a rename, delete or upload); the listing stays in place. */
  private async reloadTree(panel:Panel):Promise<void>{
    const mount=panel.mount;
    try{
      const tree:Tree=await this.call("tree",mount);
      if(this.disposed||panel.mount!==mount)return;
      this.tree(panel,tree);
      if(panel.directory)panel.tree.reveal(panel.file??panel.directory.id);
    }catch(error){await this.error(error);}
  }

  private listQuery(panel:Panel):Record<string,unknown>{
    const query=panel.query;
    return {limit:PAGE,sort:query.sort,direction:query.direction,...(query.search?{search:query.search}:{}),...(query.type?{type:query.type}:{})};
  }
  /** `from` is the child folder left through "..": its row gets the cursor, as in mc. */
  private async open(panel:Panel,directory:string,epoch=++panel.epoch,from?:string):Promise<void>{
    // The search filters the folder it was typed in; another folder opens unfiltered.
    if(panel.directory&&panel.directory.id!==directory)this.clearSearch(panel);
    panel.loading=false;
    try{
      const listing:Listing=await this.call("list",directory,this.listQuery(panel));
      if(this.disposed||epoch!==panel.epoch)return;
      panel.directory=listing.directory;panel.selected=undefined;
      panel.next=listing.next??null;panel.capped=false;
      panel.total=listing.total??listing.items.length;panel.matched=listing.matched??panel.total;
      const parent=listing.directory.path.length>1;
      panel.rows=[...(parent?[{id:PARENT,name:"..",kind:"parent",icon:"dxi dxi-arrow-up",extension:"",size_label:"",modified_label:"",_markable:false,_media:{thumb:null}}]:[]),
        ...this.placeholders(listing.directory.id),...listing.items.map(entry=>this.display(entry))];
      panel.grid.clearMarks();panel.grid.setRows(panel.rows);
      if(from&&this.entry(panel,from)){panel.selected=from;panel.grid.restore({id:from,offset:0,x:0,y:0},true,from);}
      else panel.grid.restore({offset:0,x:0,y:0},false);
      if(panel.files.get(panel.file??"")!==listing.directory.id)panel.file=undefined;
      panel.tree.reveal(panel.file??listing.directory.id);
      const path=listing.directory.path.map(part=>part.name);
      panel.heading=path[0]+":/"+path.slice(1).join("/");this.heading(panel);
      this.counter(panel);this.capabilities();
    }catch(error){if(epoch===panel.epoch)await this.error(error);}
  }
  /** The next server window while scrolling, up to {@link MAX_ROWS} rows; a stale cursor reloads from the start. */
  private async more(panel:Panel):Promise<void>{
    if(!panel.next||panel.loading||!panel.directory||this.disposed)return;
    const loaded=panel.rows.filter(row=>row._markable!==false).length;
    if(loaded>=MAX_ROWS){
      if(!panel.capped){panel.capped=true;message({text:t("Legfeljebb {count} elem tölthető be; szűkíts kereséssel vagy típussal.",{count:MAX_ROWS.toLocaleString(locale())}),css:"blade-toast",expire:6000});}
      return;
    }
    const epoch=panel.epoch,directory=panel.directory.id;
    panel.loading=true;
    try{
      const listing:Listing=await this.call("list",directory,{...this.listQuery(panel),limit:Math.min(PAGE,MAX_ROWS-loaded),cursor:panel.next});
      if(this.disposed||epoch!==panel.epoch)return;
      panel.next=listing.next??null;
      if(typeof listing.total==="number")panel.total=listing.total;
      if(typeof listing.matched==="number")panel.matched=listing.matched;
      const known=new Set(panel.rows.map(row=>String(row.id)));
      await this.render(panel,[...panel.rows,...listing.items.filter(entry=>!known.has(entry.id)).map(entry=>this.display(entry))]);
    }catch(error){
      if(epoch!==panel.epoch)return;
      if((error as Failure).details?.code==="stale_cursor"){panel.loading=false;await this.open(panel,directory);return;}
      await this.error(error);
    }finally{if(epoch===panel.epoch)panel.loading=false;}
  }

  /** Reloads both panels after a write; a vanished folder falls back to its mount root. */
  private async refresh():Promise<void>{for(const panel of this.panels)await this.reload(panel);}
  private async reload(panel:Panel):Promise<void>{
    const epoch=++panel.epoch,directory=panel.directory?.id;
    try{
      const tree:Tree=await this.call("tree",panel.mount);
      if(this.disposed||epoch!==panel.epoch)return;
      this.tree(panel,tree);
      const exists=tree.items.some(item=>item.id===directory&&item.kind==="directory");
      await this.open(panel,exists?directory!:tree.root,epoch);
    }catch(error){await this.error(error);}
  }
  /**
   * After uploads: the trees of the panels whose mount received files are refreshed; a listing is
   * reloaded only when it gained a created subfolder (folder upload) or a result came without its item.
   */
  private async refreshUploaded():Promise<void>{
    const folders=this.uploaded,relist=this.relist;this.uploaded=new Set();this.relist=new Set();this.uploadTimer=undefined;
    if(this.disposed)return;
    for(const panel of this.panels){
      if(panel.directory&&relist.has(panel.directory.id))await this.open(panel,panel.directory.id);
      if([...folders].some(id=>panel.directory?.id===id||panel.tree.widget.data.exists(id)))await this.reloadTree(panel);
    }
  }

  /**
   * Panel header path: the mount and the current folder stay, folders are collapsed from the
   * root side ("Drive A:/…/b/c") until it fits; beyond that CSS cuts the end.
   */
  private heading(panel:Panel):void{
    const cell=this.layout.getCell("panel-"+panel.index),parts=panel.directory?.path.map(part=>part.name);
    if(!parts||!panel.heading)return;
    const title=this.layout.getRootNode()?.querySelector<HTMLElement>(`[data-cell-id="panel-${panel.index}"] > .dhx_layout-cell-header .dhx_layout-cell-header__title`);
    // A hidden panel (mobile) has no width; it is fitted again when the observer sees it shown.
    if(!title?.clientWidth&&cell.config.header)return;
    let text=panel.heading;
    if(title){
      const style=getComputedStyle(title),context=this.measure??=document.createElement("canvas").getContext("2d")!;
      // Measured at the active panel's weight, so activating a panel does not change the fit.
      context.font=`600 ${style.fontSize} ${style.fontFamily}`;
      const width=title.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      for(let skip=1;context.measureText(text).width>width&&skip<parts.length-1;skip++)text=parts[0]+":/…/"+parts.slice(skip+1).join("/");
    }
    if(cell.config.header!==text){cell.config.header=text;cell.paint();}
  }

  private async enter(panel:Panel):Promise<void>{
    if(panel.selected===PARENT&&panel.directory){await this.open(panel,panel.directory.path[panel.directory.path.length-2].id,undefined,panel.directory.id);return;}
    const row=this.entry(panel,panel.selected);
    if(!row||row._markable===false)return;
    if(row.kind==="directory")await this.open(panel,row.id);
    else await this.launch(panel);
  }

  private window(title:string,width:number,height:number,resizable=false,css=""):Window{
    const win=new Window({css:"blade-content-window "+css,title:escape(title),ariaLabel:title,width:Math.min(width,innerWidth-24),height:Math.min(height,innerHeight-24),modal:true,closable:true,resizable});
    this.windows.add(win);
    win.events.on("afterHide",()=>{this.windows.delete(win);this.inputs.delete(win);void awaitRedraw().then(()=>win.destructor());});
    return win;
  }
  /** An open rename or new-folder form, or a text editor with unsaved text (`ViewInstance.editing`). */
  editing():boolean{return !this.disposed&&[...this.inputs.values()].some(unsaved=>unsaved());}

  /** One decision applies to every conflicting name; Cancel leaves the data unchanged. */
  private async resolving(run:(decision:string)=>Promise<Summary>):Promise<Summary|null>{
    try{return await run("");}
    catch(error){
      const e=error as Failure;
      if(e.status!==409||!Array.isArray(e.details?.conflicts))throw error;
      const names=(e.details.conflicts as {name:string}[]).map(item=>item.name).join(", ");
      // References to the existing files warn that an overwrite may clear them (`details.usages`).
      const usages=mergeUsages([e.details.usages as Usage[]|undefined]);
      const warning=usages.length?"\n\n"+t("Hivatkozások:")+" "+usageList(usages):"";
      const decision=await requestChoice({title:t("Névütközés"),severity:"warning",message:t("A célmappában már létezik: {names}. Mit tegyünk az ütköző elemekkel?",{names})+warning,
        choices:[{value:"overwrite",label:t("Felülírás")},{value:"rename",label:t("Átnevezés")},{value:"skip",label:t("Kihagyás")}]});
      return decision?await run(decision):null;
    }
  }
  private async summary(result:Summary):Promise<void>{
    const cleared=clearedText(result.cleared);
    const text=t("Sikeres: {success}, kihagyva: {skipped}, sikertelen: {failed}.",{success:result.succeeded.length,skipped:result.skipped.length,failed:result.failed.length})+(cleared?"\n"+cleared:"");
    if(!result.failed.length&&!result.skipped.length){message({text,css:"blade-toast",expire:cleared?8000:5000});return;}
    await acknowledge({title:t("Összesítés"),severity:result.failed.length?"warning":"neutral",message:[text,...result.skipped.map(item=>t("Kihagyva: {name}",{name:item.name})),...result.failed.map(item=>`${item.name}: ${item.error}`)].join("\n")});
  }

  private async transfer(action:"copy"|"move"):Promise<void>{
    const source=this.current,target=this.other,ids=this.selection(source);
    if(!ids.length||!target.directory)return;
    this.busy=true;this.capabilities();
    try{
      const result=await this.resolving(decision=>this.call(action,target.directory!.id,{sources:ids.join(","),...(decision?{decision}:{})}));
      if(!result)return;
      source.grid.clearMarks();await this.refresh();await this.summary(result);
    }catch(error){await this.error(error);}
    finally{this.busy=false;this.capabilities();}
  }

  /**
   * Delete of the marked entries (folders with their content): the shared confirmation built from the
   * action's declared `confirm`, then one request and a toast; the listings drop the rows in place.
   * When the action reports usages, a `preview` first sums the references to every file of the selected
   * subtrees: if there are any, one danger confirmation lists them and says that they are cleared.
   */
  private async remove():Promise<void>{
    const panel=this.current,ids=this.selection(panel),directory=panel.directory,action=this.action("delete");
    if(!ids.length||!directory||!action)return;
    const c=action.confirm;
    let usages:Usage[]=[];
    if(action.usages){
      this.busy=true;this.capabilities();
      try{usages=mergeUsages([(await this.call("delete",directory.id,{sources:ids.join(","),preview:"1"}) as {usages?:Usage[]})?.usages]);}
      catch(error){await this.error(error);return;}
      finally{this.busy=false;this.capabilities();}
      if(this.disposed)return;
    }
    const declared=c?t(c.message,{count:ids.length}):"";
    // The shared usage confirmation, with the file consequence: referencing records stay, only their file reference is cleared.
    if(usages.length){if(!await requestConfirmation({severity:"danger",title:c?.title??t("Törlés"),confirmLabel:c?.confirmLabel??action.label,cancelLabel:c?.cancelLabel,
      message:[declared||t("Törlés: {count} elem.",{count:ids.length}),"",t("Hivatkozások:"),...usages.map(usage=>`${usage.label}: ${usage.count.toLocaleString(locale())}`),"",t("A hivatkozó elemek megmaradnak, a fájlhivatkozásuk törlődik.")].join("\n")}))return;}
    else if(c&&!await requestConfirmation({title:c.title,severity:c.severity??"danger",message:declared,confirmLabel:c.confirmLabel??action.label,cancelLabel:c.cancelLabel}))return;
    if(this.disposed)return;
    this.busy=true;this.capabilities();
    try{
      const result:{succeeded:{source:string}[];failed:{source:string;name:string;error:string}[];policy?:string;cleared?:Record<string,number>}=await this.call("delete",directory.id,{sources:ids.join(",")});
      const removed=new Set(result.succeeded.map(item=>String(item.source)));
      panel.grid.clearMarks();
      if(panel.file&&removed.has(panel.file))panel.file=undefined;
      await this.removed(removed,panel.mount);
      const cleared=clearedText(result.cleared);
      const text=t(result.policy==="archive"?"Archiválva: {count} elem.":"Törölve: {count} elem.",{count:removed.size})+(cleared?"\n"+cleared:"");
      if(result.failed.length)await acknowledge({title:t("Összesítés"),severity:"warning",message:[text,...result.failed.map(item=>`${item.name||item.source}: ${item.error}`)].join("\n")});
      else message({text,css:"blade-toast",expire:cleared?8000:4000});
    }catch(error){await this.error(error);}
    finally{this.busy=false;this.capabilities();}
  }
  /** Panels on the mount drop the removed rows; a panel inside a removed folder opens its surviving ancestor. */
  private async removed(ids:Set<string>,mount:string):Promise<void>{
    for(const panel of this.panels){
      if(panel.mount!==mount||!panel.directory)continue;
      await this.reloadTree(panel);
      const inside=panel.directory.path.findIndex(part=>ids.has(part.id));
      if(inside>0){await this.open(panel,panel.directory.path[inside-1].id);continue;}
      const rows=panel.rows.filter(row=>!ids.has(String(row.id))),gone=panel.rows.length-rows.length;
      if(gone){panel.total=Math.max(0,panel.total-gone);panel.matched=Math.max(0,panel.matched-gone);await this.render(panel,rows);}
    }
  }

  /** Rename (F2) of one entry in the shared form window: Cancel beside Save, server field errors in place. */
  private openRename():void{
    const panel=this.current,ids=this.selection(panel),field=this.field("rename","name");
    if(ids.length!==1||!field)return;
    const id=ids[0],name=this.nameOf(panel,id),mount=panel.mount;
    const win=this.window(t("Átnevezés"),420,260);
    this.inputs.set(win,()=>true);
    const form=new Form(document.createElement("div"),{padding:20,rows:[
      {type:"input",name:"name",label:field.label,labelPosition:"top",required:true,maxlength:field.max,value:name},
      formActions({name:"submit",text:t("Mentés"),icon:"dxi dxi-content-save"}),
    ]} as any);
    win.attach(form);win.show();void fitWindow(win);form.events.on("afterValidate",()=>{void fitWindow(win);});
    const validation=new FormValidation(form,[field]);let saving=false;
    const submit=()=>{
      // The DOM value is current while typing; Suite syncs its own value on change, after Enter.
      const typed=win.getContainer().querySelector<HTMLInputElement>("input")?.value;
      if(typed!==undefined&&typed!==form.getValue().name)form.getItem("name").setValue(typed);
      if(saving||!validation.validate())return;
      const value=String(form.getValue().name??"");
      if(value===name){win.hide();return;}
      saving=true;form.disable();
      void this.call("rename",id,{name:value}).then(async(result:{id:string;name:string;item?:Entry})=>{
        if(this.disposed)return;win.hide();
        await this.renamed(String(result.id),result.item,mount);
        message({text:t("Átnevezve: {name}",{name:result.name}),css:"blade-toast",expire:4000});
      }).catch(error=>{if(!validation.showServerErrors((error as Failure).fieldErrors??{}))return this.error(error);}).finally(()=>{saving=false;if(!this.disposed&&this.windows.has(win))form.enable();});
    };
    form.events.on("click",(button:string)=>{if(button==="cancel"&&!saving)win.hide();else if(button==="submit")submit();});
    // Enter in the name field saves, as the Save button (capture: Suite's form keys run later).
    win.getContainer().addEventListener("keydown",event=>{if(event.key==="Enter"&&(event.target as HTMLElement).matches("input")){event.preventDefault();submit();}},true);
    // The base name is selected, so typing replaces it and keeps the extension.
    requestAnimationFrame(()=>{
      form.setFocus("name");
      const input=win.getContainer().querySelector<HTMLInputElement>("input");
      const dot=this.isFile(panel,id)?name.lastIndexOf("."):-1;
      input?.setSelectionRange(0,dot>0?dot:name.length);
    });
  }
  private async renamed(id:string,item:Entry|undefined,mount:string):Promise<void>{
    for(const panel of this.panels){
      if(panel.mount!==mount||!panel.directory)continue;
      await this.reloadTree(panel);
      // A renamed folder on the panel's path changes its header.
      if(panel.directory.path.some(part=>part.id===id)){await this.open(panel,panel.directory.id);continue;}
      if(item&&panel.rows.some(row=>row.id===id))await this.insert(panel,item);
    }
  }

  /** One file: its GET `download` URL; several entries or a folder: a `zip_prepare` manifest, then the GET `zip_get` stream. */
  private async download():Promise<void>{
    const panel=this.current,ids=this.selection(panel),directory=panel.directory;
    if(!ids.length||!directory)return;
    if(ids.length===1&&this.isFile(panel,ids[0])){
      if(!this.can("download"))return;
      const row=this.entry(panel,ids[0]);
      FileManager.save(actionUrl(this.view.resource,"download",ids[0],row?String(row.revision):undefined));
      return;
    }
    if(!this.canZip())return;
    this.busy=true;this.capabilities();
    try{
      const zip:{token:string;name:string;count:number;bytes:number}=await this.call("zip_prepare",directory.id,{sources:ids.join(",")});
      if(this.disposed)return;
      FileManager.save(actionUrl(this.view.resource,"zip_get",zip.token));
      message({text:t("ZIP-letöltés: {name}.zip ({count} fájl, {size}).",{name:zip.name,count:zip.count,size:this.size(zip.bytes)}),css:"blade-toast",expire:5000});
    }catch(error){await this.error(error);}
    finally{this.busy=false;this.capabilities();}
  }
  /** A temporary anchor starts the browser download of an `attachment` response without leaving the page. */
  private static save(url:string):void{
    const anchor=document.createElement("a");anchor.href=url;anchor.download="";anchor.rel="noopener";anchor.hidden=true;
    document.body.append(anchor);anchor.click();anchor.remove();
  }

  private openCreate():void{
    const panel=this.current,directory=panel.directory,field=this.field("create_directory","name");
    if(!directory||!field)return;
    const win=this.window(t("Új mappa"),420,260);
    this.inputs.set(win,()=>true);
    const form=new Form(document.createElement("div"),{padding:20,rows:[
      {type:"input",name:"name",label:field.label,labelPosition:"top",required:true,maxlength:field.max},
      formActions({name:"submit",text:t("Létrehozás"),icon:"dxi dxi-plus"}),
    ]} as any);
    win.attach(form);win.show();void fitWindow(win);form.events.on("afterValidate",()=>{void fitWindow(win);});
    const validation=new FormValidation(form,[field]);let saving=false;
    form.events.on("click",(name:string)=>{
      if(name==="cancel"&&!saving){win.hide();return;}
      if(name!=="submit"||saving||!validation.validate())return;
      saving=true;form.disable();
      void this.call("create_directory",directory.id,{name:String(form.getValue().name??"")}).then(async()=>{
        if(this.disposed)return;win.hide();await this.refresh();message({text:t("A mappa elkészült."),css:"blade-toast",expire:4000});
      }).catch(error=>{if(!validation.showServerErrors((error as Failure).fieldErrors??{}))return this.error(error);}).finally(()=>{saving=false;if(!this.disposed&&this.windows.has(win))form.enable();});
    });
    requestAnimationFrame(()=>form.setFocus("name"));
  }

  /**
   * The framework uploader (Uploader.ts) for a panel's folder: chunked, resumable and non-blocking, so
   * the panels stay usable. A drop or paste onto a panel passes its files. The live instance follows the
   * uploader's events (in-flight rows, in-place results), also for a batch started by an earlier instance.
   */
  private openUpload(panel=this.current,files:{files?:File[];transfer?:DataTransfer}={}):void{
    const directory=panel.directory;if(!directory||!this.can("upload"))return;
    uploads.open({resource:this.view.resource,action:"upload",target:directory.id,targetLabel:panel.heading??directory.path.map(part=>part.name).join("/"),policy:this.config.upload.policy,...files});
  }

  /**
   * Document window: one Layout fills the Window with its toolbar above the content cell, so the
   * content follows every window size (no fitted form, no empty band). Full size is native.
   * `navigation` adds previous/next (also PageUp/PageDown); `geometry` keeps the previous window's place.
   */
  private documentWindow(title:string,css:string,items:any[],navigation?:Navigation,geometry?:Geometry):{win:Window;bar:Toolbar;body:ReturnType<Layout["getCell"]>}{
    const win=this.window(title,960,680,true,"blade-document-window");
    const layout=new Layout(document.createElement("div"),{type:"none",css:"blade-document "+css,rows:[{id:"bar",height:48,css:"blade-command-row"},{id:"body",css:"blade-document__body"}]});
    const bar=new Toolbar(undefined,{css:"blade-document__bar",data:[...FileManager.steps(navigation),...items,FileManager.fullSize()]});
    layout.getCell("bar").attach(bar);win.attach(layout);win.show();
    this.chrome(win,bar,navigation,geometry);
    return {win,bar,body:layout.getCell("body")};
  }
  /** Previous, `n / m` and next before a viewer's own toolbar items. */
  private static steps(navigation?:Navigation):any[]{
    return navigation&&navigation.count>1?[
      {id:"previous",icon:"dxi dxi-chevron-left",tooltip:t("Előző"),disabled:navigation.index<=0},
      {id:"index",type:"text",value:`${navigation.index+1} / ${navigation.count}`},
      {id:"next",icon:"dxi dxi-chevron-right",tooltip:t("Következő"),disabled:navigation.index>=navigation.count-1},
      {type:"separator"},
    ]:[];
  }
  private static fullSize():any{return {id:"fullscreen",icon:"dxi dxi-arrow-expand",tooltip:t("Teljes méret")};}
  /** Full size toggle, previous/next (toolbar, PageUp/PageDown) and the previous window's geometry of a shown document window. */
  private chrome(win:Window,bar:Toolbar,navigation?:Navigation,geometry?:Geometry):void{
    const steps=!!navigation&&navigation.count>1;
    const full=(on:boolean)=>{
      if(on)win.setFullScreen();else win.unsetFullScreen();
      bar.data.update("fullscreen",{icon:on?"dxi dxi-arrow-collapse":"dxi dxi-arrow-expand",tooltip:t(on?"Eredeti méret":"Teljes méret")});
    };
    bar.events.on("click",(id:string|number)=>{
      if(id==="fullscreen")full(!win.isFullScreen());
      else if(steps&&(id==="previous"||id==="next"))navigation!.go(win,id==="next"?1:-1);
    });
    if(geometry){if(geometry.full)full(true);else{win.setSize(geometry.width,geometry.height);win.setPosition(geometry.left,geometry.top);}}
    if(steps)win.getContainer().addEventListener("keydown",event=>{
      if(event.key!=="PageUp"&&event.key!=="PageDown"||event.altKey||event.ctrlKey||event.metaKey)return;
      event.preventDefault();event.stopPropagation();navigation!.go(win,event.key==="PageDown"?1:-1);
    });
  }
  /** Updates a toolbar text only when it changed, so typing does not repaint the bar. */
  private static label(bar:Toolbar,id:string,value:string):void{if(bar.data.getItem(id)?.value!==value)bar.data.update(id,{value});}

  /** Monospace text editor: Save (Ctrl+S) and line wrap in the toolbar, cursor position and save state beside them. */
  private async openEditor():Promise<void>{
    const row=this.target(this.current);
    if(!row||!this.editable(row)||this.busy)return;
    let file:{id:string;name:string;content:string;revision:string;max_bytes:number};
    try{file=await this.call("text_get",row.id);}catch(error){await this.error(error);return;}
    if(this.disposed)return;
    const writable=this.can("text_save");
    const {win,bar,body}=this.documentWindow(file.name,"blade-document--text",[
      ...(writable?[{id:"save",value:t("Mentés"),icon:"dxi dxi-content-save",tooltip:t("Mentés (Ctrl+S)"),disabled:true},{type:"separator"}]:[]),
      {id:"wrap",value:t("Sortörés"),icon:"dxi dxi-format-text-wrapping-wrap",twoState:true,active:true},
      {type:"spacer"},
      {id:"position",type:"text",value:""},
      {id:"state",type:"text",value:t(writable?"Mentve":"Csak olvasható")},
    ]);
    const form=new Form(document.createElement("div"),{padding:0,css:"blade-text-editor",rows:[
      {type:"textarea",name:"content",label:t("Tartalom"),hiddenLabel:true,value:file.content,readOnly:!writable,height:"100%"},
    ]} as any);
    body.attach(form);
    let saved=file.content,revision=file.revision,closing=false,saving=false;
    // The DOM value is current while typing; Ctrl+S must not save a value Suite has not synced yet.
    const area=()=>win.getContainer().querySelector<HTMLTextAreaElement>("textarea");
    const value=()=>area()?.value??saved;
    this.inputs.set(win,()=>writable&&value()!==saved);
    const sync=()=>{
      const text=area();if(!text)return;
      const before=text.value.slice(0,text.selectionStart);
      FileManager.label(bar,"position",t("Sor {line}, oszlop {column}",{line:before.split("\n").length,column:before.length-before.lastIndexOf("\n")}));
      if(!writable)return;
      const dirty=text.value!==saved;
      FileManager.label(bar,"state",t(saving?"Mentés…":dirty?"Módosítva":"Mentve"));
      if(dirty&&!saving)bar.enable("save");else bar.disable("save");
    };
    win.events.on("beforeHide",()=>{
      if(closing||!writable||value()===saved)return true;
      void requestConfirmation({title:t("Mentetlen módosítások"),severity:"warning",message:t("A szöveg mentetlen módosításokat tartalmaz. Bezárod mentés nélkül?"),confirmLabel:t("Bezárás mentés nélkül")})
        .then(ok=>{if(ok){closing=true;win.hide();}});
      return false;
    });
    const reload=async()=>{const fresh=await this.call("text_get",file.id);form.getItem("content").setValue(fresh.content);saved=fresh.content;revision=fresh.revision;await awaitRedraw();sync();};
    const save=()=>{
      const content=value();
      if(!writable||saving||content===saved)return;
      if(new TextEncoder().encode(content).length>file.max_bytes){void acknowledge({title:t("Hiba"),severity:"warning",message:t("A szöveg legfeljebb {size} bájt lehet.",{size:file.max_bytes})});return;}
      saving=true;sync();
      void this.call("text_save",file.id,{revision},[{field:"content",blob:new Blob([content],{type:"text/plain"}),name:file.name}]).then(async result=>{
        saved=content;revision=result.revision;
        message({text:t("A fájl mentve."),css:"blade-toast",expire:4000});
        await this.refresh();
      }).catch(async error=>{
        const e=error as Failure;
        if(e.status!==409||!e.details?.conflict)return this.error(error);
        const ok=await requestConfirmation({title:t("Ütközés"),severity:"warning",message:t("A fájlt időközben módosították (aktuális verzió: {revision}). Betöltöd az aktuális változatot? A szerkesztett szöveg elvész.",{revision:e.details.conflict.revision}),confirmLabel:t("Aktuális változat betöltése")});
        if(ok)await reload().catch(reason=>this.error(reason));
      }).finally(()=>{saving=false;if(!this.disposed&&this.windows.has(win))sync();});
    };
    bar.events.on("click",(id:string|number)=>{
      if(id==="save")save();
      else if(id==="wrap"){const text=area();if(text)text.wrap=bar.getState("wrap")?"soft":"off";}
    });
    const root=win.getContainer();
    for(const type of ["input","keyup","click","focusin"])root.addEventListener(type,sync);
    root.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();save();}});
    await awaitRedraw();
    // An editor opens at the start of the text; Suite's setFocus would put the caret at the end.
    const text=area();
    if(text&&this.windows.has(win)){text.setSelectionRange(0,0);text.focus();sync();}
    if(!this.disposed&&this.windows.has(win))this.hooks.opened?.({id:String(row.id),mimeType:String(row.mime_type)});
  }

  /**
   * Image viewer, video and audio player (MediaPlayer) over the GET `content_stream` URL: the browser loads only
   * what it shows and media seek with HTTP Range requests; the server checks the ACL on every request.
   * Previous/next walk the images, videos and audio files of the panel's loaded rows in their order.
   */
  private async openPreview(panel=this.current,row=this.target(panel),geometry?:Geometry):Promise<MediaPlayer|undefined>{
    if(!row||!this.previewable(row)||this.busy)return undefined;
    const sequence=()=>panel.rows.filter(other=>this.previewable(other));
    const list=sequence();
    const navigation:Navigation={index:list.findIndex(other=>other.id===row.id),count:list.length,go:(win,step)=>{
      const fresh=sequence(),next=fresh[fresh.findIndex(other=>other.id===row.id)+step];
      if(!next||!this.windows.has(win))return;
      // The panel cursor follows, so the command and Enter open the shown file.
      // A single mark on the shown file (the click of the opening double-click) does not pin the old file.
      const marked=panel.grid.markedIds;if(marked.length===1&&marked[0]===String(row.id))panel.grid.clearMarks();
      panel.selected=String(next.id);panel.grid.restore(panel.grid.capture(),true,panel.selected);
      const position=win.getPosition(),size=win.getSize();
      void this.openPreview(panel,next,{left:position.left,top:position.top,width:size.width,height:size.height,full:win.isFullScreen()}).then(opened=>{
        win.hide();opened?.focus();
      });
    }};
    const name=String(row.name),win=this.window(name,960,680,true,"blade-document-window");
    // Image: fit, zoom steps, 100 %, rotation; video/audio: native controls, loop and speed; dimensions, length, format and size beside them.
    const player=new MediaPlayer({source:{resource:this.view.resource,action:"content_stream",id:String(row.id),version:String(row.revision)},mime:String(row.mime_type),name,info:String(row.size_label)},
      {before:FileManager.steps(navigation),after:[FileManager.fullSize()]});
    player.mount(win);win.show();
    win.events.on("afterHide",()=>player.destroy());
    this.chrome(win,player.toolbar!,navigation,geometry);
    await awaitRedraw();
    if(this.windows.has(win)){player.focus();if(!this.disposed)this.hooks.opened?.({id:String(row.id),mimeType:String(row.mime_type)});}
    return player;
  }

  destroy():void{
    this.disposed=true;this.listeners.abort();this.releaseIcons();this.commands.disposeResponsive();
    uploads.off("upload:queued",this.uploadQueued);uploads.off("upload:started",this.uploadStarted);uploads.off("upload:progress",this.uploadProgress);
    uploads.off("upload:conflict",this.uploadConflict);uploads.off("upload:file-failed",this.uploadGone);uploads.off("upload:cancelled",this.uploadGone);
    uploads.off("upload:file-done",this.fileDone);uploads.off("upload:complete",this.uploadComplete);clearTimeout(this.uploadTimer);
    for(const panel of this.panels)clearTimeout(panel.searchTimer);
    for(const win of this.windows)win.destructor();this.windows.clear();
    this.observer.disconnect();
    for(const panel of this.panels){panel.grid.destroy();panel.tree.destroy();}
    this.layout.destructor();
  }
}

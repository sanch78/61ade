import { locale, t } from "./I18n";
import { Form, Layout, Toolbar, Window, message, awaitRedraw, tooltip } from "@dhtmlx/suite";
import { ResponsiveToolbar } from "./ResponsiveToolbar";
import { ResponsiveGrid } from "./ResponsiveGrid";
import { TreeAdapter } from "./TreeAdapter";
import { widgetIcons } from "./WidgetIcons";
import { fitWindow } from "./WindowSizing";
import { FormValidation, type FieldDefinition } from "./FormValidation";
import { acknowledge, alert, requestChoice, requestConfirmation } from "./MessageDialog";
import { escape } from "./RecordPresentation";
import { actionUrl } from "./ActionUrl";
import type { Row } from "./Realtime";
import type { ViewDefinition } from "./Workspace";

export type FileManagerConfig={mounts:{id:string;label:string}[];upload:{allowed_extensions:string[];max_size_bytes:number;multiple:boolean;duplicate_policy:string};text:{extension:string;max_bytes:number};preview:string[];max_depth:number};
export type FileViewDefinition={kind:"files";resource:string;title:string;icon?:string;desktopOnly?:boolean;group?:string;actions:{name:string;label:string;icon?:string;write:boolean;fields:FieldDefinition[]}[];files:FileManagerConfig};
export const isFileView=(view:ViewDefinition|FileViewDefinition):view is FileViewDefinition=>(view as FileViewDefinition).kind==="files";
type Entry={id:string;name:string;kind:"directory"|"file";extension:string;mime_type:string;size:number;modified_at:string;revision:string;width?:number|null;height?:number|null;duration_ms?:number|null;orientation?:string;thumbnail?:"ready"|"pending"|"failed"|"none"};
type TreeItem={id:string;parent:string;name:string;kind:"directory"|"file";mime_type:string};
type Tree={root:string;items:TreeItem[];truncated:boolean};
type Directory={id:string;mount:string;depth:number;path:{id:string;name:string}[]};
type Summary={succeeded:{name:string}[];skipped:{name:string}[];failed:{name:string;error:string}[]};
type Failure=Error&{status?:number;fieldErrors?:Record<string,string>;details?:any};
type Part={field:string;blob:Blob;name:string};
/** `file` is the file chosen in tree mode; `files` maps the tree's file nodes to their folders. */
/** `heading` is the full path shown, possibly shortened, in the panel header. */
type Panel={index:number;mount:string;mode:"files"|"tree";directory?:Directory;heading?:string;rows:Row[];selected?:string;file?:string;files:Map<string,string>;layout:Layout;bar:Toolbar;tree:TreeAdapter;grid:ResponsiveGrid;epoch:number};
/** Same Cancel + submit row as the workspace forms. */
const formActions=(submit:{name:string;text:string;icon:string}):any=>({css:"blade-form-actions",cols:[
  {type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"},
  {type:"button",...submit,color:"primary",width:"content"},
]});
/** Suite icon by kind and detected MIME type, the same in the listing and the tree. */
const fileIcon=(kind:string,mime:string):string=>kind==="directory"?"dxi dxi-folder":mime.startsWith("image/")?"dxi dxi-image-outline":mime==="text/csv"?"dxi dxi-file-excel":mime.startsWith("text/")||mime==="application/json"?"dxi dxi-format-align-left":"dxi dxi-file-outline";
const iconLabels=():Record<string,string>=>({"dxi dxi-arrow-up":t("Szülőmappa"),"dxi dxi-folder":t("Mappa"),"dxi dxi-image-outline":t("Kép"),"dxi dxi-file-excel":t("Táblázat"),"dxi dxi-format-align-left":t("Szöveg"),"dxi dxi-file-outline":t("Fájl")});
/** The listing's first row in a subfolder, as in mc: opens the parent and is never an operand. */
const PARENT="..";
/** PHP drops parts beyond its default max_file_uploads; the server applies the same cap. */
const MAX_FILES=20;

/** Two-panel virtual file manager: per-panel mount, Tree and Grid; every operation is a registered action. */
export class FileManager {
  readonly layout:Layout;
  private releaseIcons=widgetIcons();
  private panels:Panel[]=[];
  private active=0;
  private commands:ResponsiveToolbar;
  private windows=new Set<Window>();
  private listeners=new AbortController();
  private mobile?:boolean;
  private busy=false;
  private disposed=false;
  private config:FileManagerConfig;
  private measure?:CanvasRenderingContext2D;
  private observer=new ResizeObserver(()=>{for(const panel of this.panels)this.heading(panel);});

  constructor(host:HTMLElement,private view:FileViewDefinition,private csrf:string){
    this.config=view.files;
    // Native wide group and resizer; no width or minWidth, which would make the Layout cells fixed.
    this.layout=new Layout(host,{type:"space",rows:[
      {type:"wide",css:"blade-file-panels",cols:[
        {id:"panel-0",header:t("Bal panel"),css:"blade-file-panel",resizable:true},
        {id:"panel-1",header:t("Jobb panel"),css:"blade-file-panel"},
      ]},
      {id:"commands",height:48,css:"blade-command-row blade-file-commands"},
    ]});
    const action=(name:string,label:string,icon:string)=>this.can(name)?[{id:name,value:t(label),icon}]:[];
    this.commands=new ResponsiveToolbar(undefined,{data:[
      ...action("create_directory","Új mappa","dxi dxi-plus"),
      ...action("copy","Másolás a másik panelre","dxi dxi-copy"),
      ...action("move","Áthelyezés a másik panelre","dxi dxi-file-export"),
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
    // Delegated on the outer root: panel cells are re-rendered when they are hidden and shown.
    const activate=(event:Event)=>{const cell=(event.target as HTMLElement|null)?.closest<HTMLElement>("[data-cell-id^='panel-']");if(cell)this.activate(Number(cell.dataset.cellId!.slice(6)));};
    this.layout.getRootNode()?.addEventListener("pointerdown",activate,{capture:true,signal:this.listeners.signal});
    this.layout.getRootNode()?.addEventListener("focusin",activate,{signal:this.listeners.signal});
    // A shortened header path shows the full path in the native Suite tooltip.
    this.layout.getRootNode()?.addEventListener("mouseover",event=>{
      const title=(event.target as HTMLElement|null)?.closest<HTMLElement>(".dhx_layout-cell-header__title");
      const panel=this.panels[Number(title?.closest<HTMLElement>("[data-cell-id^='panel-']")?.dataset.cellId?.slice(6))];
      if(title&&panel?.heading&&(title.textContent!==panel.heading||title.scrollWidth>title.clientWidth))tooltip(panel.heading,{node:title,position:"bottom" as Parameters<typeof tooltip>[1]["position"],htmlEnable:false});
    },{signal:this.listeners.signal});
    window.addEventListener("resize",()=>this.responsive(),{signal:this.listeners.signal});
    this.activate(0);this.responsive();
    for(const panel of this.panels)void this.mount(panel,panel.mount);
  }

  private can(name:string):boolean{return this.view.actions.some(action=>action.name===name);}
  private field(action:string,name:string):FieldDefinition|undefined{return this.view.actions.find(a=>a.name===action)?.fields.find(field=>field.name===name);}
  private get current():Panel{return this.panels[this.active];}
  private get other():Panel{return this.panels[1-this.active];}

  private panel(index:number,mount:string):Panel{
    // Each panel shows either its file listing or its folder tree, as the panel modes of mc.
    const layout=new Layout(document.createElement("div"),{type:"none",css:"blade-file-panel__body",rows:[
      {id:"bar",height:48,css:"blade-command-row"},
      {id:"body"},
    ]});
    // Both modes stay mounted and the inactive one is hidden by cell CSS: Layout views would
    // re-create the listing's DOM, losing the grid's row-marking and scroll listeners.
    const body=new Layout(document.createElement("div"),{type:"none",rows:[{id:"files",css:"blade-file-list"},{id:"tree",css:"blade-file-view--hidden"}]});
    const bar=new Toolbar(undefined,{css:"blade-file-bar",data:[
      {id:"mount",value:"",icon:"dxi dxi-folder",items:this.config.mounts.map(m=>({id:"mount:"+m.id,value:escape(m.label)}))},
      {id:"mode",value:t("Nézet: Fájllista"),icon:"dxi dxi-table-check",items:[{id:"mode:files",value:t("Fájllista"),icon:"dxi dxi-table-check"},{id:"mode:tree",value:t("Mappafa"),icon:"dxi dxi-folder-open"}]},
    ]});
    const columns:ViewDefinition["columns"]=[
      // Flexible minimum widths: all metadata columns fit a half-screen panel at 1366 px.
      {id:"icon",header:t("Ikon"),type:"icon",width:56,options:iconLabels()},
      {id:"name",header:t("Név"),minWidth:140},
      {id:"kind",header:t("Típus"),minWidth:70,options:{directory:t("Mappa"),file:t("Fájl")}},
      {id:"extension",header:t("Kiterjesztés"),minWidth:86},
      {id:"size_label",header:t("Méret"),minWidth:70,align:"right"},
      {id:"modified_label",header:t("Módosítva"),minWidth:120},
    ];
    const panel:Panel={index,mount,mode:"files",rows:[],files:new Map(),layout,bar,epoch:0,
      tree:new TreeAdapter(id=>void this.choose(panel,id),id=>{if(panel.files.has(id)&&panel.file===id)void this.launch(panel);}),
      grid:undefined as unknown as ResponsiveGrid};
    // Row marking as in the workspaces: click, Ctrl/Cmd-click and Shift-click; no checkbox column.
    panel.grid=new ResponsiveGrid(document.createElement("div"),columns,()=>panel.rows,id=>{panel.selected=id;this.capabilities();},()=>void this.enter(panel),()=>{},()=>{},
      {rowNumbers:false,rowSelection:true,idColumn:false,fields:columns,marked:()=>this.capabilities()});
    bar.events.on("click",(id:string|number)=>{
      const value=String(id);
      if(value.startsWith("mount:"))void this.mount(panel,value.slice(6));
      else if(value==="mode:files"||value==="mode:tree")void this.mode(panel,value.slice(5) as Panel["mode"],body);
    });
    layout.getCell("bar").attach(bar);layout.getCell("body").attach(body);body.getCell("tree").attach(panel.tree.widget);body.getCell("files").attach(panel.grid.layout);
    this.observer.observe(layout.getRootNode());
    return panel;
  }

  /** Switches one panel between listing and tree; its folder and marks and the other panel are unchanged. */
  private async mode(panel:Panel,mode:Panel["mode"],body:Layout):Promise<void>{
    if(panel.mode===mode)return;
    panel.mode=mode;this.activate(panel.index);
    panel.bar.data.update("mode",{value:t(mode==="tree"?"Nézet: Mappafa":"Nézet: Fájllista"),icon:mode==="tree"?"dxi dxi-folder-open":"dxi dxi-table-check"});
    body.getCell("files").config.css="blade-file-list"+(mode==="files"?"":" blade-file-view--hidden");
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
  /** Opens the file in the window its type has: text editor, image viewer or video player. */
  private async launch(panel:Panel):Promise<void>{
    const row=this.target(panel);
    if(this.editable(row)&&this.can("text_get")){this.activate(panel.index);await this.openEditor();}
    else if(this.previewable(row)&&this.can("content_stream")){this.activate(panel.index);await this.openPreview();}
  }

  private selection(panel:Panel):string[]{
    // In tree mode the selected file or folder itself is the operand; a mount root cannot be.
    if(panel.mode==="tree")return panel.file?[panel.file]:panel.directory&&panel.directory.depth>0?[panel.directory.id]:[];
    const marked=panel.grid.markedIds;
    return marked.length?marked:panel.selected&&panel.selected!==PARENT?[panel.selected]:[];
  }
  private entry(panel:Panel,id?:string):Row|undefined{return panel.rows.find(row=>row.id===id);}
  private editable(row?:Row):boolean{return row?.kind==="file"&&String(row.extension).toLowerCase()===this.config.text.extension;}
  private previewable(row?:Row):boolean{return row?.kind==="file"&&this.config.preview.includes(String(row.mime_type));}

  private capabilities():void{
    if(this.disposed||!this.panels.length)return;
    const panel=this.current,other=this.other,chosen=this.selection(panel);
    const toggle=(id:string,enabled:boolean)=>{if(!this.can(id))return;if(enabled&&!this.busy)this.commands.enable(id);else this.commands.disable(id);};
    toggle("create_directory",!!panel.directory&&panel.directory.depth<this.config.max_depth);
    toggle("upload",!!panel.directory);
    toggle("copy",!!chosen.length&&!!other.directory);
    toggle("move",!!chosen.length&&!!other.directory);
    toggle("text_get",this.editable(this.target(panel)));
    toggle("content_stream",this.previewable(this.target(panel)));
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
    else if(id==="text_get")await this.openEditor();
    else if(id==="content_stream")await this.openPreview();
  }

  private async request(action:string,id:string|null,values:Record<string,unknown>,parts?:Part[]):Promise<Response>{
    const endpoint=new URL(location.href);endpoint.hash="";endpoint.search="?blade=1";
    const request=JSON.stringify({resource:this.view.resource,action,id,values});
    let body:BodyInit=request;const headers:Record<string,string>={"X-BLADE-CSRF":this.csrf};
    // Binary content is sent as multipart parts; the JSON request travels beside them.
    if(parts){const form=new FormData();form.append("request",request);for(const part of parts)form.append(part.field,part.blob,part.name);body=form;}
    else headers["Content-Type"]="application/json";
    return fetch(endpoint,{method:"POST",credentials:"same-origin",headers,body});
  }
  private failure(status:number,result:any):Failure{
    return Object.assign(new Error(result.error||t("Sikertelen művelet.")),{status,fieldErrors:result.fieldErrors,details:result.details});
  }
  private async call(action:string,id:string|null,values:Record<string,unknown>={},parts?:Part[]):Promise<any>{
    const response=await this.request(action,id,values,parts);
    const result=await response.json().catch(()=>({ok:false}));
    if(!response.ok||!result.ok)throw this.failure(response.status,result);
    return result.data;
  }
  private async error(error:unknown):Promise<void>{
    if(this.disposed)return;
    const e=error as Failure;
    const failed=(e.details?.failed??[]) as {name:string;error:string}[];
    await alert({header:t("Hiba"),severity:"danger",text:[e instanceof Error?e.message:t("Sikertelen művelet."),...Object.values(e.fieldErrors??{}),...failed.map(item=>`${item.name}: ${item.error}`)].join("\n")});
  }

  private display(entry:Entry):Row{
    const size=entry.kind==="directory"?"":entry.size<1024?t("{size} B",{size:entry.size}):new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(entry.size/(entry.size<1048576?1024:1048576))+(entry.size<1048576?" KB":" MB");
    const modified=Number.isNaN(Date.parse(entry.modified_at))?entry.modified_at:new Intl.DateTimeFormat(locale(),{dateStyle:"short",timeStyle:"short"}).format(new Date(entry.modified_at));
    // Suite Grid reads a row's `height` as its pixel height: media dimensions keep their own keys.
    const {width,height,...rest}=entry;
    return {...rest,media_width:width??null,media_height:height??null,icon:fileIcon(entry.kind,entry.mime_type),size_label:size,modified_label:modified};
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

  /** `from` is the child folder left through "..": its row gets the cursor, as in mc. */
  private async open(panel:Panel,directory:string,epoch=++panel.epoch,from?:string):Promise<void>{
    try{
      const listing:{directory:Directory;items:Entry[];truncated:boolean}=await this.call("list",directory);
      if(this.disposed||epoch!==panel.epoch)return;
      panel.directory=listing.directory;panel.selected=undefined;
      const parent=listing.directory.path.length>1;
      panel.rows=[...(parent?[{id:PARENT,name:"..",kind:"",icon:"dxi dxi-arrow-up",extension:"",size_label:"",modified_label:"",_markable:false}]:[]),...listing.items.map(entry=>this.display(entry))];
      panel.grid.clearMarks();panel.grid.setRows(panel.rows);
      if(from&&this.entry(panel,from)){panel.selected=from;panel.grid.restore({id:from,offset:0,x:0,y:0},true,from);}
      if(panel.files.get(panel.file??"")!==listing.directory.id)panel.file=undefined;
      panel.tree.reveal(panel.file??listing.directory.id);
      const path=listing.directory.path.map(part=>part.name);
      panel.heading=path[0]+":/"+path.slice(1).join("/");this.heading(panel);
      if(listing.truncated)message({text:t("A mappa első 1000 eleme látható."),css:"blade-toast",expire:6000});
      this.capabilities();
    }catch(error){if(epoch===panel.epoch)await this.error(error);}
  }

  /** Reloads both panels after a write; a vanished folder falls back to its mount root. */
  private async refresh():Promise<void>{
    for(const panel of this.panels){
      const epoch=++panel.epoch,directory=panel.directory?.id;
      try{
        const tree:Tree=await this.call("tree",panel.mount);
        if(this.disposed||epoch!==panel.epoch)continue;
        this.tree(panel,tree);
        const exists=tree.items.some(item=>item.id===directory&&item.kind==="directory");
        await this.open(panel,exists?directory!:tree.root,epoch);
      }catch(error){await this.error(error);}
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
    if(row?.kind==="directory")await this.open(panel,row.id);
    else if(row)await this.launch(panel);
  }

  private window(title:string,width:number,height:number,resizable=false,css=""):Window{
    const win=new Window({css:"blade-content-window "+css,title:escape(title),ariaLabel:title,width:Math.min(width,innerWidth-24),height:Math.min(height,innerHeight-24),modal:true,closable:true,resizable});
    this.windows.add(win);
    win.events.on("afterHide",()=>{this.windows.delete(win);void awaitRedraw().then(()=>win.destructor());});
    return win;
  }

  /** One decision applies to every conflicting name; Cancel leaves the data unchanged. */
  private async resolving(run:(decision:string)=>Promise<Summary>):Promise<Summary|null>{
    try{return await run("");}
    catch(error){
      const e=error as Failure;
      if(e.status!==409||!Array.isArray(e.details?.conflicts))throw error;
      const names=(e.details.conflicts as {name:string}[]).map(item=>item.name).join(", ");
      const decision=await requestChoice({title:t("Névütközés"),severity:"warning",message:t("A célmappában már létezik: {names}. Mit tegyünk az ütköző elemekkel?",{names}),
        choices:[{value:"overwrite",label:t("Felülírás")},{value:"rename",label:t("Átnevezés")},{value:"skip",label:t("Kihagyás")}]});
      return decision?await run(decision):null;
    }
  }
  private async summary(result:Summary):Promise<void>{
    const text=t("Sikeres: {success}, kihagyva: {skipped}, sikertelen: {failed}.",{success:result.succeeded.length,skipped:result.skipped.length,failed:result.failed.length});
    if(!result.failed.length&&!result.skipped.length){message({text,css:"blade-toast",expire:5000});return;}
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

  private openCreate():void{
    const panel=this.current,directory=panel.directory,field=this.field("create_directory","name");
    if(!directory||!field)return;
    const win=this.window(t("Új mappa"),420,260);
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

  /** Native file input inside a Suite Window; files travel as multipart parts. */
  private openUpload():void{
    const panel=this.current,directory=panel.directory;if(!directory)return;
    const upload=this.config.upload;
    const id="blade-upload-"+Math.random().toString(36).slice(2);
    const limit=new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(upload.max_size_bytes/1048576)+" MB";
    const win=this.window(t("Feltöltés"),500,320);
    win.attachHTML(`<div class="blade-file-upload">
      <p>${escape(t("Célmappa: {path}",{path:directory.path.map(part=>part.name).join("/")}))}</p>
      <label class="blade-file-upload__label" for="${id}">${escape(t(upload.multiple?"Fájlok kiválasztása":"Fájl kiválasztása"))}</label>
      <input class="blade-file-upload__input" id="${id}" type="file" ${upload.multiple?"multiple":""} accept="${escape(upload.allowed_extensions.map(ext=>"."+ext).join(","))}">
      <p class="blade-file-upload__rules">${escape(t("Engedélyezett típusok: {types}. Legfeljebb {size} fájlonként.",{types:upload.allowed_extensions.join(", "),size:limit}))}</p>
      <div class="blade-file-upload__actions"><button type="button" data-blade-cancel class="dhx_button dhx_button--size_medium dhx_button--view_link dhx_button--color_primary">${escape(t("Mégse"))}</button><button type="button" data-blade-submit class="dhx_button dhx_button--size_medium dhx_button--view_flat dhx_button--color_primary" disabled>${escape(t("Feltöltés"))}</button></div>
    </div>`);
    win.show();
    void awaitRedraw().then(async()=>{
      const root=win.getContainer(),input=root.querySelector<HTMLInputElement>("input[type=file]"),button=root.querySelector<HTMLButtonElement>("[data-blade-submit]");
      if(!input||!button)return;
      const sync=()=>{button.disabled=this.busy||!input.files?.length;};
      input.addEventListener("change",sync);sync();
      root.querySelector("[data-blade-cancel]")?.addEventListener("click",()=>{if(!this.busy)win.hide();});
      button.addEventListener("click",()=>{
        const files=Array.from(input.files??[]);
        if(!files.length||this.busy)return;
        if(files.length>(upload.multiple?MAX_FILES:1)){void alert({header:t("Hiba"),severity:"warning",text:t("Egyszerre legfeljebb {count} fájl tölthető fel.",{count:upload.multiple?MAX_FILES:1})});return;}
        this.busy=true;button.disabled=true;input.disabled=true;
        void this.resolving(decision=>this.call("upload",directory.id,decision?{decision}:{},files.map(file=>({field:"files[]",blob:file,name:file.name})))).then(async result=>{
          if(!result||this.disposed)return;
          win.hide();await this.refresh();await this.summary(result);
        }).catch(error=>this.error(error)).finally(()=>{this.busy=false;input.disabled=false;sync();this.capabilities();});
      });
      await fitWindow(win,".blade-file-upload__actions button");
    });
  }

  /**
   * Document window: one Layout fills the Window with its toolbar above the content cell, so the
   * content follows every window size (no fitted form, no empty band). Full size is native.
   */
  private documentWindow(title:string,css:string,items:any[]):{win:Window;bar:Toolbar;body:ReturnType<Layout["getCell"]>}{
    const win=this.window(title,960,680,true,"blade-document-window");
    const layout=new Layout(document.createElement("div"),{type:"none",css:"blade-document "+css,rows:[{id:"bar",height:48,css:"blade-command-row"},{id:"body",css:"blade-document__body"}]});
    const bar=new Toolbar(undefined,{css:"blade-document__bar",data:[...items,{id:"fullscreen",icon:"dxi dxi-arrow-expand",tooltip:t("Teljes méret")}]});
    bar.events.on("click",(id:string|number)=>{
      if(id!=="fullscreen")return;
      const full=!win.isFullScreen();
      if(full)win.setFullScreen();else win.unsetFullScreen();
      bar.data.update("fullscreen",{icon:full?"dxi dxi-arrow-collapse":"dxi dxi-arrow-expand",tooltip:t(full?"Eredeti méret":"Teljes méret")});
    });
    layout.getCell("bar").attach(bar);win.attach(layout);win.show();
    return {win,bar,body:layout.getCell("body")};
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
      if(new TextEncoder().encode(content).length>file.max_bytes){void alert({header:t("Hiba"),severity:"warning",text:t("A szöveg legfeljebb {size} bájt lehet.",{size:file.max_bytes})});return;}
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
  }

  /**
   * Image viewer or video player over the GET `content_stream` URL: the browser loads only what it
   * shows and a video seeks with HTTP Range requests; the server checks the ACL on every request.
   */
  private async openPreview():Promise<void>{
    const row=this.target(this.current);
    if(!row||!this.previewable(row)||this.busy)return;
    const url=actionUrl(this.view.resource,"content_stream",String(row.id),String(row.revision)),name=String(row.name),size=String(row.size_label);
    if(String(row.mime_type).startsWith("video/"))await this.openVideo(name,url,size);else await this.openImage(name,url,size);
  }

  /** Fitted to the window (never enlarged) by default; zoom steps, 100 %, rotation, and scrolling when larger. */
  private async openImage(name:string,url:string,size:string):Promise<Window>{
    const percent=(scale:number)=>new Intl.NumberFormat(locale(),{style:"percent",maximumFractionDigits:0}).format(scale);
    const {win,bar,body}=this.documentWindow(name,"blade-document--image",[
      {id:"zoom-out",icon:"dxi dxi-minus",tooltip:t("Kicsinyítés")},
      {id:"zoom",value:t("Illesztés"),items:[{id:"zoom:fit",value:t("Illesztés")},...[0.5,1,2].map(level=>({id:"zoom:"+level,value:percent(level)}))]},
      {id:"zoom-in",icon:"dxi dxi-plus",tooltip:t("Nagyítás")},
      {type:"separator"},
      {id:"rotate",icon:"dxi dxi-rotate-right",tooltip:t("Forgatás jobbra")},
      {type:"spacer"},
      {id:"info",type:"text",value:size},
    ]);
    body.attachHTML(`<div class="blade-image-stage" tabindex="0" role="group" aria-label="${escape(name)}"><div class="blade-image-frame"><img src="${escape(url)}" alt="${escape(name)}"></div></div>`);
    await awaitRedraw();
    const stage=win.getContainer().querySelector<HTMLElement>(".blade-image-stage"),image=stage?.querySelector("img");
    if(!stage||!image)return win;
    const levels=[0.1,0.25,0.5,0.75,1,1.5,2,3,4,6,8];
    let zoom:number|null=null,turn=0;
    const fit=()=>{
      const sideways=turn%180!==0,width=sideways?image.naturalHeight:image.naturalWidth,height=sideways?image.naturalWidth:image.naturalHeight;
      return Math.min(1,(stage.clientWidth-32)/width,(stage.clientHeight-32)/height);
    };
    const paint=()=>{
      if(!image.naturalWidth)return;
      const scale=zoom??fit(),width=image.naturalWidth*scale,height=image.naturalHeight*scale,sideways=turn%180!==0;
      const frame=image.parentElement!;
      frame.style.width=(sideways?height:width)+"px";frame.style.height=(sideways?width:height)+"px";
      image.style.width=width+"px";image.style.height=height+"px";image.style.setProperty("--blade-turn",turn+"deg");
      FileManager.label(bar,"zoom",zoom===null?t("Illesztés ({value})",{value:percent(scale)}):percent(scale));
    };
    const step=(direction:1|-1)=>{
      const current=zoom??fit();
      zoom=direction>0?levels.find(level=>level>current*1.01)??levels[levels.length-1]:[...levels].reverse().find(level=>level<current*0.99)??levels[0];
      paint();
    };
    bar.events.on("click",(id:string|number)=>{
      const value=String(id);
      if(value==="zoom-in"||value==="zoom-out")step(value==="zoom-in"?1:-1);
      else if(value==="rotate"){turn=(turn+90)%360;paint();}
      else if(value.startsWith("zoom:")){zoom=value==="zoom:fit"?null:Number(value.slice(5));paint();}
    });
    stage.addEventListener("keydown",event=>{
      if(event.key==="+"||event.key==="=")step(1);else if(event.key==="-")step(-1);else if(event.key==="0"){zoom=null;paint();}else return;
      event.preventDefault();
    });
    image.addEventListener("dblclick",()=>{zoom=zoom===null?1:null;paint();});
    const shown=()=>{FileManager.label(bar,"info",`${image.naturalWidth} × ${image.naturalHeight} px · ${size}`);paint();};
    if(image.complete&&image.naturalWidth)shown();else image.addEventListener("load",shown);
    image.addEventListener("error",()=>FileManager.label(bar,"info",t("A kép nem jeleníthető meg.")));
    // Fitting follows the window, including full size and manual resizing.
    const observer=new ResizeObserver(()=>{if(zoom===null)paint();});
    observer.observe(stage);win.events.on("afterHide",()=>observer.disconnect());
    stage.focus();
    return win;
  }

  /** The browser's native player controls; loop and playback speed in the toolbar, format and length beside them. */
  private async openVideo(name:string,url:string,size:string):Promise<Window>{
    const speeds=[0.5,1,1.5,2],rate=(speed:number)=>new Intl.NumberFormat(locale(),{maximumFractionDigits:1}).format(speed)+"×";
    const {win,bar,body}=this.documentWindow(name,"blade-document--video",[
      {id:"loop",value:t("Ismétlés"),twoState:true,active:false},
      {id:"speed",value:t("Sebesség: {speed}",{speed:rate(1)}),items:speeds.map(speed=>({id:"speed:"+speed,value:rate(speed)}))},
      {type:"spacer"},
      {id:"info",type:"text",value:size},
    ]);
    body.attachHTML(`<div class="blade-video-stage"><video src="${escape(url)}" controls preload="metadata" aria-label="${escape(name)}"></video></div>`);
    await awaitRedraw();
    const video=win.getContainer().querySelector("video");
    if(!video)return win;
    bar.events.on("click",(id:string|number)=>{
      const value=String(id);
      if(value==="loop")video.loop=!!bar.getState("loop");
      else if(value.startsWith("speed:")){video.playbackRate=Number(value.slice(6));FileManager.label(bar,"speed",t("Sebesség: {speed}",{speed:rate(video.playbackRate)}));}
    });
    video.addEventListener("loadedmetadata",()=>{
      const seconds=Math.round(video.duration),length=Number.isFinite(seconds)?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`:"";
      FileManager.label(bar,"info",[`${video.videoWidth} × ${video.videoHeight} px`,length,size].filter(Boolean).join(" · "));
    });
    video.addEventListener("error",()=>FileManager.label(bar,"info",t("A videó nem játszható le ebben a böngészőben.")));
    win.events.on("afterHide",()=>video.pause());
    video.focus();
    return win;
  }

  destroy():void{
    this.disposed=true;this.listeners.abort();this.releaseIcons();this.commands.disposeResponsive();
    for(const win of this.windows)win.destructor();this.windows.clear();
    this.observer.disconnect();
    for(const panel of this.panels){panel.grid.destroy();panel.tree.destroy();}
    this.layout.destructor();
  }
}

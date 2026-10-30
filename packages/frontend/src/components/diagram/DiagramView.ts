import { t } from "../../I18n";
import { Form, Layout, List, Toolbar, Window, message, awaitRedraw } from "@dhtmlx/suite";
import { ResponsiveToolbar } from "../../ResponsiveToolbar";
import { widgetIcons } from "../../WidgetIcons";
import { fitWindow } from "../../WindowSizing";
import { FormValidation, type FieldDefinition } from "../../FormValidation";
import { acknowledge, requestConfirmation } from "../../MessageDialog";
import { escape } from "../../RecordPresentation";
import { server } from "../../api/Server";

export type NodeType={id:string;label:string;glyph:string;color:string;shape:string;custom:boolean};
export type LinkType={id:string;label:string;color:string;style:"solid"|"dashed"|"dotted";width:number};
export type DiagramConfig={nodeTypes:NodeType[];linkTypes:LinkType[];glyphs:Record<string,string>;shapes:Record<string,string>;colors:string[];customTypes:boolean;maxNodes:number;maxLinks:number};
type ActionDefinition={name:string;label:string;icon?:string;write:boolean;confirm?:{message:string;title?:string;severity?:"neutral"|"warning"|"danger";confirmLabel?:string};fields:FieldDefinition[]};
export type DiagramViewDefinition={kind:"diagram";resource:string;title:string;icon?:string;desktopOnly?:boolean;group?:string;actions:ActionDefinition[];diagram:DiagramConfig};
type DiagramNode={id:string;type:string;label:string;detail:string;x:number;y:number};
type DiagramLink={id:string;source:string;target:string;type:string;label:string};
type Diagram={id:string;name:string;revision:string;nodes:DiagramNode[];links:DiagramLink[]};
type Selection={kind:"node"|"link";id:string}|null;
type Failure=Error&{status?:number;fieldErrors?:Record<string,string>};
/** Pointer gesture in progress on the canvas, in diagram coordinates where relevant. */
type Gesture={kind:"move";id:string;dx:number;dy:number;moved:boolean}|{kind:"pan";x:number;y:number;tx:number;ty:number}|{kind:"connect";source:string};

const SVG="http://www.w3.org/2000/svg";
/** Element tile: the glyph sits on a TILE×TILE shape centred on the node position. */
const TILE=56;
const GRID=20;
/** Framework glyph set, 24×24 stroke drawings; consumer and runtime types choose one by key. */
const GLYPHS:Record<string,string>={
  router:'<circle cx="12" cy="12" r="9"/><path d="M12 6v4m0 4v4M6 12h4m4 0h4M10 8l2-2 2 2M10 16l2 2 2-2M8 10l-2 2 2 2M16 10l2 2-2 2"/>',
  switch:'<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 10.5h9l-2-2M17 13.5H8l2 2"/>',
  server:'<rect x="5" y="3" width="14" height="8" rx="1"/><rect x="5" y="13" width="14" height="8" rx="1"/><path d="M8 7h.01M8 17h.01M12 7h4M12 17h4"/>',
  firewall:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>',
  cloud:'<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>',
  workstation:'<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M9 20h6M12 16v4"/>',
  laptop:'<rect x="5" y="5" width="14" height="10" rx="1"/><path d="M2 19h20l-2-4H4z"/>',
  "access-point":'<path d="M5 9a10 10 0 0 1 14 0M8 12a6 6 0 0 1 8 0"/><circle cx="12" cy="15" r="1"/><rect x="6" y="18" width="12" height="3" rx="1"/>',
  printer:'<path d="M7 8V3h10v5M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
  database:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  storage:'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 12h18M7 9h.01M7 15h.01"/>',
  camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  box:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
};
const DASH:Record<LinkType["style"],string>={solid:"",dashed:"8 5",dotted:"2 4"};
/** Shape outline around the origin; every shape fits the same tile so links meet it alike. */
function shapeMarkup(shape:string,color:string,size=TILE):string{
  const h=size/2;
  if(shape==="circle")return `<circle r="${h}" fill="${color}"/>`;
  if(shape==="diamond")return `<polygon points="0,${-h-6} ${h+6},0 0,${h+6} ${-h-6},0" fill="${color}"/>`;
  return `<rect x="${-h}" y="${-h}" width="${size}" height="${size}" rx="${shape==="rect"?3:12}" fill="${color}"/>`;
}
/** Small standalone preview of an element type, used in the palette. */
export function typeIcon(type:Pick<NodeType,"glyph"|"color"|"shape">,size=32):string{
  return `<svg class="blade-diagram-icon" viewBox="${-size/2-4} ${-size/2-4} ${size+8} ${size+8}" width="${size}" height="${size}" aria-hidden="true">${shapeMarkup(type.shape,type.color,size)}`
    +`<g transform="translate(${-size*.32} ${-size*.32}) scale(${size*.64/24})" class="blade-diagram-glyph">${GLYPHS[type.glyph]??GLYPHS.box}</g></svg>`;
}
const svg=<K extends keyof SVGElementTagNameMap>(name:K,attributes:Record<string,string|number>={}):SVGElementTagNameMap[K]=>{
  const node=document.createElementNS(SVG,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
};

/**
 * Visual node-and-link editor. DHTMLX Suite Standard has no diagram widget (DHTMLX Diagram is a
 * separate product), so only the canvas is an SVG surface; the shell, palette, property form,
 * dialogs and windows are Suite widgets. Every read and write is a registered action.
 * Internal: projects and the built-in `diagram` kind use the public `DiagramEditor` facade (./DiagramEditor.ts).
 */
export class DiagramView {
  readonly layout:Layout;
  private releaseIcons=widgetIcons();
  private commands:ResponsiveToolbar;
  private diagrams:List;
  private palette:List;
  private properties?:Form;
  private windows=new Set<Window>();
  private listeners=new AbortController();
  private config:DiagramConfig;
  private types=new Map<string,NodeType>();
  private document?:Diagram;
  private selection:Selection=null;
  private dirty=false;
  private busy=false;
  private disposed=false;
  private linkType:string;
  private view={x:0,y:0,k:1};
  private gesture?:Gesture;
  private canvas:SVGSVGElement;
  private viewport:SVGGElement;
  private linkLayer:SVGGElement;
  private nodeLayer:SVGGElement;
  private draft:SVGLineElement;
  private ghost?:HTMLElement;
  private sequence=0;
  private host:HTMLElement;
  private notice:HTMLElement;
  private mounter=new MutationObserver(()=>this.mountCanvas());
  private resizer=new ResizeObserver(()=>{if(this.pendingFit)this.fit();});
  private pendingFit=true;
  private drag?:{x:number;y:number;type:string;pointer:number};
  private zoomBar:Toolbar;
  private propertyTurn=0;
  private focused:{diagrams?:string;palette?:string}={};

  /** `saved`: called after the open diagram's content was saved (the facade's `saved` event). */
  constructor(host:HTMLElement,private view_:DiagramViewDefinition,private hooks:{saved?():void}={}){
    this.config=view_.diagram;
    this.linkType=this.config.linkTypes[0].id;
    for(const type of this.config.nodeTypes)this.types.set(type.id,type);
    this.layout=new Layout(host,{type:"space",rows:[
      {id:"commands",height:48,css:"blade-command-row"},
      {type:"wide",cols:[
        {type:"line",width:240,css:"blade-diagram-side",rows:[
          {id:"diagrams",header:t("Diagramok"),height:200,resizable:true},
          {id:"palette",header:t("Elemek")},
        ]},
        {id:"canvas",css:"blade-diagram-canvas"},
        {id:"properties",header:t("Tulajdonságok"),width:280,css:"blade-diagram-properties"},
      ]},
    ]});
    const action=(name:string,label:string,icon:string,extra:object={})=>this.can(name)?[{id:name,value:t(label),icon,...extra}]:[];
    this.commands=new ResponsiveToolbar(undefined,{data:[
      ...action("create","Új diagram","dxi dxi-plus"),
      ...action("save","Mentés","dxi dxi-content-save",{tooltip:t("Mentés (Ctrl+S)"),disabled:true}),
      ...(this.can("save")?[
        {id:"link-type",value:this.linkLabel(),icon:"dxi dxi-line-straight",tooltip:t("Új kapcsolatok típusa"),items:this.config.linkTypes.map(type=>({id:"link-type:"+type.id,value:escape(type.label)}))},
        {id:"remove",value:t("Kijelölt törlése"),icon:"dxi dxi-delete-outline",disabled:true},
      ]:[]),
      {type:"spacer"},
      ...action("type_create","Új elemtípus","dxi dxi-plus-box"),
      ...action("delete","Diagram törlése","dxi dxi-delete",{disabled:true}),
    ]});
    this.commands.events.on("click",(id:string|number)=>void this.command(String(id)));
    this.layout.getCell("commands").attach(this.commands);

    this.diagrams=new List(document.createElement("div"),{css:"blade-diagram-list",selection:true,keyNavigation:true,itemHeight:36,template:(item:any)=>`<span class="blade-diagram-list__name">${escape(item.name)}</span>`});
    this.diagrams.events.on("click",(id:string|number)=>void this.choose(String(id)));
    this.diagrams.events.on("focuschange",(index?:number,id?:string|number)=>{this.focused.diagrams=id===undefined?undefined:String(id);});
    this.layout.getCell("diagrams").attach(this.diagrams);

    this.palette=new List(document.createElement("div"),{css:"blade-diagram-palette",selection:true,keyNavigation:true,itemHeight:48,
      template:(item:any)=>`<span class="blade-diagram-palette__item" data-type="${escape(item.id)}">${typeIcon(item)}<span class="blade-diagram-palette__label">${escape(item.label)}</span>`
        +(item.custom&&this.can("type_delete")?`<button type="button" class="blade-diagram-type-delete dxi dxi-delete-outline" title="${escape(t("Elemtípus törlése"))}" aria-label="${escape(t("Elemtípus törlése: {type}",{type:item.label}))}"></button>`:"")+"</span>",
      eventHandlers:{onclick:{"blade-diagram-type-delete":(event:Event,id:string|number)=>{event.stopPropagation();void this.deleteType(String(id));}}}});
    this.palette.events.on("doubleclick",(id:string|number)=>this.place(String(id)));
    this.palette.events.on("focuschange",(index?:number,id?:string|number)=>{this.focused.palette=id===undefined?undefined:String(id);});
    this.layout.getCell("palette").attach(this.palette);

    this.canvas=svg("svg",{class:"blade-diagram-surface",role:"application",tabindex:0,"aria-label":t("Diagram vászon")});
    const pattern=svg("pattern",{id:"blade-diagram-grid",width:GRID,height:GRID,patternUnits:"userSpaceOnUse"});
    pattern.append(svg("path",{d:`M${GRID} 0H0V${GRID}`,class:"blade-diagram-grid"}));
    const defs=svg("defs");defs.append(pattern);
    this.viewport=svg("g");
    const background=svg("rect",{x:-50000,y:-50000,width:100000,height:100000,fill:"url(#blade-diagram-grid)",class:"blade-diagram-background"});
    this.linkLayer=svg("g");this.nodeLayer=svg("g");
    this.draft=svg("line",{class:"blade-diagram-draft",visibility:"hidden"});
    this.viewport.append(background,this.linkLayer,this.draft,this.nodeLayer);
    this.canvas.append(defs,this.viewport);
    this.host=document.createElement("div");this.host.className="blade-diagram-host";
    this.notice=document.createElement("div");this.notice.className="blade-diagram-empty";
    // View controls float over the canvas, so the command row keeps its labels at desktop widths.
    const zoom=document.createElement("div");zoom.className="blade-diagram-zoom";
    this.host.append(this.canvas,this.notice,zoom);
    const controls=[{id:"zoom-out",icon:"dxi dxi-minus",label:t("Kicsinyítés")},{id:"zoom-in",icon:"dxi dxi-plus",label:t("Nagyítás")},{id:"fit",icon:"dxi dxi-arrow-expand",label:t("Teljes nézet")}];
    this.zoomBar=new Toolbar(zoom,{data:controls.map(({id,icon,label})=>({id,icon,tooltip:label}))});
    this.zoomBar.events.on("click",(id:string|number)=>void this.command(String(id)));
    // Icon-only buttons take their accessible name from the tooltip text.
    void awaitRedraw().then(()=>{for(const {id,label} of controls)zoom.querySelector(`[data-dhx-id="${id}"]`)?.setAttribute("aria-label",label);});
    // A Layout cell holds HTML, not elements: the canvas is placed into the cell's placeholder
    // and placed again whenever the Layout re-creates that cell.
    this.layout.getCell("canvas").attachHTML("<div class=\"blade-diagram-mount\"></div>");
    void awaitRedraw().then(()=>{
      const root=this.layout.getRootNode();
      if(this.disposed||!root)return;
      this.mounter.observe(root,{childList:true,subtree:true});this.mountCanvas();
      root.addEventListener("pointerdown",event=>this.paletteDown(event),{signal:this.listeners.signal});
      // Keyboard alternative: Enter opens the focused diagram or adds the focused element type.
      root.addEventListener("keydown",event=>{
        if(event.key!=="Enter")return;
        const cell=(event.target as HTMLElement).closest<HTMLElement>("[data-cell-id='diagrams'],[data-cell-id='palette']")?.dataset.cellId as "diagrams"|"palette"|undefined;
        const id=cell?this.focused[cell]:undefined;
        if(!cell||!id)return;
        event.preventDefault();
        if(cell==="palette")this.place(id);else void this.choose(id);
      },{signal:this.listeners.signal});
    });
    this.bindCanvas();
    this.bindPaletteDrag();
    document.addEventListener("keydown",event=>this.key(event),{signal:this.listeners.signal});
    void this.showProperties();
    this.capabilities();
    void this.load();
  }

  private can(name:string):boolean{return this.view_.actions.some(action=>action.name===name);}
  private actionDefinition(name:string):ActionDefinition|undefined{return this.view_.actions.find(action=>action.name===name);}
  private get writable():boolean{return this.can("save")&&!!this.document;}
  private linkLabel():string{return escape(this.config.linkTypes.find(type=>type.id===this.linkType)?.label??"");}

  // ---- transport ---------------------------------------------------------------------------
  private call(action:string,id:string|null,values:Record<string,unknown>={}):Promise<any>{return server.call(this.view_.resource,action,{id,values});}
  private async error(error:unknown):Promise<void>{
    if(this.disposed)return;
    const e=error as Failure;
    await acknowledge({title:t("Hiba"),severity:"danger",message:[e instanceof Error?e.message:t("Sikertelen művelet."),...Object.values(e.fieldErrors??{})].join("\n")});
  }

  // ---- diagrams ----------------------------------------------------------------------------
  private async load(select?:string):Promise<void>{
    try{
      const data=await this.call("list",null);
      if(this.disposed)return;
      for(const [id,type] of this.types)if(type.custom)this.types.delete(id);
      for(const type of data.types as NodeType[])this.types.set(type.id,type);
      this.palette.data.parse([...this.types.values()]);
      this.diagrams.data.parse(data.diagrams);
      const target=select??this.document?.id??data.diagrams[0]?.id;
      if(target&&this.diagrams.data.exists(target))await this.open(target);
      else this.empty();
    }catch(error){await this.error(error);}
  }
  private mountCanvas():void{
    if(this.host.isConnected)return;
    const mount=this.layout.getRootNode()?.querySelector(".blade-diagram-mount");
    if(!mount)return;
    mount.append(this.host);this.resizer.observe(this.host);this.paint();
  }

  private async choose(id:string):Promise<void>{
    if(id===this.document?.id)return;
    if(!await this.discard()){if(this.document)this.diagrams.selection.add(this.document.id);return;}
    await this.open(id);
  }
  /** Unsaved changes are lost on switching; that is a real risk, so it is confirmed. */
  private async discard():Promise<boolean>{
    if(!this.dirty)return true;
    return requestConfirmation({title:t("Nem mentett módosítások"),message:t("A diagram nem mentett módosításai elvesznek."),severity:"warning",confirmLabel:t("Elvetés")});
  }
  private async open(id:string):Promise<void>{
    try{
      const data=await this.call("get",id);
      if(this.disposed)return;
      this.document={id:data.id,name:data.name,revision:data.revision,nodes:data.content.nodes??[],links:data.content.links??[]};
      this.sequence=Math.max(0,...[...this.document.nodes,...this.document.links].map(item=>Number(/^[nl](\d+)$/.exec(item.id)?.[1]??0)));
      this.selection=null;this.dirty=false;
      this.diagrams.selection.add(id);
      this.render();this.fit();void this.showProperties();this.capabilities();
    }catch(error){await this.error(error);}
  }
  private empty():void{
    this.document=undefined;this.selection=null;this.dirty=false;
    this.render();void this.showProperties();this.capabilities();
  }

  private async command(id:string):Promise<void>{
    if(id.startsWith("link-type:")){this.linkType=id.slice(10);this.commands.data.update("link-type",{value:this.linkLabel()});return;}
    if(id==="create")this.createDiagram();
    else if(id==="save")await this.save();
    else if(id==="remove")this.remove();
    else if(id==="zoom-in")this.zoom(1.25);
    else if(id==="zoom-out")this.zoom(.8);
    else if(id==="fit")this.fit();
    else if(id==="type_create")this.createType();
    else if(id==="delete")await this.deleteDiagram();
  }

  private capabilities():void{
    if(this.disposed)return;
    const toggle=(id:string,enabled:boolean)=>{if(!this.commands.data.exists(id))return;if(enabled&&!this.busy)this.commands.enable(id);else this.commands.disable(id);};
    toggle("save",!!this.document&&this.dirty);
    toggle("remove",this.writable&&!!this.selection);
    toggle("delete",!!this.document);
    const count=this.document?.nodes.length??0;
    this.notice.textContent=!this.document?t(this.can("create")?"Nincs diagram. Hozz létre egyet az Új diagram gombbal.":"Nincs megnyitható diagram."):count?"":t(this.writable?"Húzz ide elemet a bal oldali listából, vagy kattints rá duplán.":"A diagram üres.");
    this.notice.hidden=!this.notice.textContent;
  }
  private changed():void{this.dirty=true;this.capabilities();}
  /** Unsaved diagram changes (the live channel does not reload the page over them). */
  editing():boolean{return this.dirty;}

  private formWindow(title:string,action:string,items:any[],submit:(form:Form,values:Record<string,any>)=>Promise<void>):void{
    const win=new Window({css:"blade-content-window",title:escape(title),ariaLabel:title,width:Math.min(420,innerWidth-24),height:Math.min(460,innerHeight-24),modal:true,closable:true});
    this.windows.add(win);
    win.events.on("afterHide",()=>{this.windows.delete(win);void awaitRedraw().then(()=>win.destructor());});
    const form=new Form(document.createElement("div"),{padding:20,rows:[...items,{css:"blade-form-actions",cols:[
      {type:"button",name:"cancel",text:t("Mégse"),icon:"dxi dxi-close",view:"flat",color:"secondary",width:"content"},
      {type:"button",name:"submit",text:t(this.actionDefinition(action)?.label??"Mentés"),icon:"dxi dxi-check",submit:true,color:"primary",width:"content"},
    ]}]});
    win.attach(form);win.show();void fitWindow(win);
    const validation=new FormValidation(form,this.actionDefinition(action)?.fields??[]);let saving=false;
    form.events.on("click",(name:string)=>{
      if(name==="cancel"&&!saving){win.hide();return;}
      if(name!=="submit"||saving||!validation.validate())return;
      saving=true;form.disable();
      void submit(form,form.getValue()).then(()=>{if(!this.disposed)win.hide();})
        .catch(error=>{if(!validation.showServerErrors((error as Failure).fieldErrors??{}))return this.error(error);})
        .finally(()=>{saving=false;if(!this.disposed&&this.windows.has(win))form.enable();});
    });
    form.events.on("afterValidate",()=>{void fitWindow(win);});
  }

  private createDiagram():void{
    void this.discard().then(proceed=>{
      if(!proceed)return;
      const field=this.actionDefinition("create")?.fields.find(f=>f.name==="name");
      this.formWindow(t("Új diagram"),"create",[{type:"input",name:"name",label:t(field?.label??"Diagram neve"),labelPosition:"top",required:true,maxlength:field?.max}],async(form,values)=>{
        const created=await this.call("create",null,{name:String(values.name??"").trim()});
        this.dirty=false;
        await this.load(created.id);
        message({text:t("A diagram elkészült."),css:"blade-toast",expire:4000});
      });
    });
  }

  private async save():Promise<void>{
    const diagram=this.document;
    if(!diagram||!this.dirty||this.busy)return;
    this.busy=true;this.capabilities();
    try{
      const content=JSON.stringify({nodes:diagram.nodes,links:diagram.links});
      const saved=await this.call("save",diagram.id,{content,revision:diagram.revision});
      if(this.disposed)return;
      diagram.revision=saved.revision;this.dirty=false;
      message({text:t("A diagram elmentve."),css:"blade-toast",expire:3000});
      try{this.hooks.saved?.();}catch(error){console.error(error);}
    }catch(error){await this.error(error);}
    finally{this.busy=false;this.capabilities();}
  }

  private async deleteDiagram():Promise<void>{
    const diagram=this.document,confirm=this.actionDefinition("delete")?.confirm;
    if(!diagram)return;
    if(confirm&&!await requestConfirmation({title:confirm.title,message:confirm.message,severity:confirm.severity,confirmLabel:confirm.confirmLabel}))return;
    try{
      await this.call("delete",diagram.id);
      this.document=undefined;this.dirty=false;
      await this.load();
      message({text:t("A diagram törölve."),css:"blade-toast",expire:4000});
    }catch(error){await this.error(error);}
  }

  // ---- element types -----------------------------------------------------------------------
  private createType():void{
    const fields=this.actionDefinition("type_create")?.fields??[];
    const label=(name:string,fallback:string)=>t(fields.find(field=>field.name===name)?.label??fallback);
    const options=(map:Record<string,string>)=>Object.entries(map).map(([value,content])=>({value,content:t(content)}));
    this.formWindow(t("Új elemtípus"),"type_create",[
      {type:"input",name:"label",label:label("label","Megnevezés"),labelPosition:"top",required:true,maxlength:60},
      {type:"select",name:"glyph",label:label("glyph","Ikon"),labelPosition:"top",options:options(this.config.glyphs),value:"box"},
      {type:"select",name:"shape",label:label("shape","Forma"),labelPosition:"top",options:options(this.config.shapes),value:"round"},
      {type:"colorpicker",name:"color",label:label("color","Szín"),labelPosition:"top",required:true,paletteOnly:true,palette:[this.config.colors],value:this.config.colors[0]},
    ],async(form,values)=>{
      const created=await this.call("type_create",null,{label:String(values.label??"").trim(),glyph:values.glyph,shape:values.shape,color:String(values.color??"").toLowerCase()});
      this.types.set(created.type.id,created.type);
      this.palette.data.add(created.type);
      this.palette.selection.add(created.type.id);
      message({text:t("Az elemtípus elkészült: {type}",{type:created.type.label}),css:"blade-toast",expire:4000});
    });
  }

  private async deleteType(id:string):Promise<void>{
    const type=this.types.get(id);
    if(!type?.custom)return;
    // Unsaved nodes of this diagram are part of the check: the server sees only saved content.
    if(this.document?.nodes.some(node=>node.type===id)){
      await acknowledge({title:t("Elemtípus törlése"),severity:"warning",message:t("Az elemtípust ez a diagram használja. Előbb töröld vagy cseréld le az elemeit.")});
      return;
    }
    try{
      await this.call("type_delete",id);
      this.types.delete(id);this.palette.data.remove(id);
      message({text:t("Az elemtípus törölve: {type}",{type:type.label}),css:"blade-toast",expire:4000});
    }catch(error){await this.error(error);}
  }

  // ---- model edits -------------------------------------------------------------------------
  private node(id:string):DiagramNode|undefined{return this.document?.nodes.find(node=>node.id===id);}
  private link(id:string):DiagramLink|undefined{return this.document?.links.find(link=>link.id===id);}
  private nextId(prefix:"n"|"l"):string{return prefix+(++this.sequence);}

  private add(type:string,x:number,y:number):void{
    const diagram=this.document,definition=this.types.get(type);
    if(!diagram||!this.writable||!definition)return;
    if(diagram.nodes.length>=this.config.maxNodes){void acknowledge({title:t("Hiba"),severity:"warning",message:t("Legfeljebb {count} elem lehet egy diagramon.",{count:this.config.maxNodes})});return;}
    const count=diagram.nodes.filter(node=>node.type===type).length+1;
    const node={id:this.nextId("n"),type,label:`${definition.label} ${count}`,detail:"",x:Math.round(x/GRID)*GRID,y:Math.round(y/GRID)*GRID};
    diagram.nodes.push(node);
    this.select({kind:"node",id:node.id});this.changed();this.render();
  }
  /** Keyboard and double-click alternative of dragging: the element lands in the visible centre. */
  private place(type:string):void{
    const box=this.canvas.getBoundingClientRect();
    const point=this.toDiagram(box.left+box.width/2,box.top+box.height/2);
    const offset=(this.document?.nodes.length??0)%5*GRID;
    this.add(type,point.x+offset,point.y+offset);
  }

  private connect(source:string,target:string):void{
    const diagram=this.document;
    if(!diagram||source===target)return;
    if(diagram.links.some(link=>(link.source===source&&link.target===target)||(link.source===target&&link.target===source))){message({text:t("A két elem már össze van kötve."),css:"blade-toast",expire:3000});return;}
    if(diagram.links.length>=this.config.maxLinks){void acknowledge({title:t("Hiba"),severity:"warning",message:t("Legfeljebb {count} kapcsolat lehet egy diagramon.",{count:this.config.maxLinks})});return;}
    const link={id:this.nextId("l"),source,target,type:this.linkType,label:""};
    diagram.links.push(link);
    this.select({kind:"link",id:link.id});this.changed();this.render();
  }

  private remove():void{
    const diagram=this.document,selection=this.selection;
    if(!diagram||!selection||!this.writable)return;
    if(selection.kind==="node"){
      diagram.nodes=diagram.nodes.filter(node=>node.id!==selection.id);
      diagram.links=diagram.links.filter(link=>link.source!==selection.id&&link.target!==selection.id);
    }else diagram.links=diagram.links.filter(link=>link.id!==selection.id);
    this.select(null);this.changed();this.render();
  }

  private select(selection:Selection):void{
    this.selection=selection;
    void this.showProperties();this.capabilities();this.highlight();
  }

  // ---- properties --------------------------------------------------------------------------
  /** Same order as the workspace detail panel: detach, destroy, redraw, then attach the new content. */
  private async showProperties():Promise<void>{
    const turn=++this.propertyTurn;
    const cell=this.layout.getCell("properties");
    cell.detach();this.properties?.destructor();this.properties=undefined;
    await awaitRedraw();
    if(this.disposed||turn!==this.propertyTurn)return;
    const diagram=this.document,selection=this.selection;
    if(!diagram||!selection){
      const nodes=diagram?.nodes.length??0,links=diagram?.links.length??0;
      cell.attachHTML(`<div class="blade-diagram-summary">${diagram?`<p class="blade-diagram-summary__name">${escape(diagram.name)}</p><p>${escape(t("{nodes} elem, {links} kapcsolat",{nodes,links}))}</p>`:""}`
        +`<p class="blade-diagram-summary__hint">${escape(t(this.can("save")?"Elem kijelölése: kattintás. Összekötés: húzd az elem jobb oldali pontját egy másik elemre. Mozgatás: húzás vagy nyílbillentyűk. Nagyítás: egérgörgő.":"Elem kijelölése: kattintás. Nagyítás: egérgörgő, mozgatás: a háttér húzása."))}</p></div>`);
      return;
    }
    const readonly=!this.writable;
    if(selection.kind==="node"){
      const node=this.node(selection.id)!;
      this.properties=new Form(document.createElement("div"),{padding:16,rows:[
        {type:"input",name:"label",label:t("Felirat"),labelPosition:"top",value:node.label,maxlength:80,readOnly:readonly},
        {type:"input",name:"detail",label:t("Részletek"),labelPosition:"top",value:node.detail,maxlength:200,placeholder:t("pl. IP-cím vagy szerep"),readOnly:readonly},
        {type:"select",name:"type",label:t("Elemtípus"),labelPosition:"top",value:node.type,disabled:readonly,options:[...this.types.values()].map(type=>({value:type.id,content:type.label}))},
        ...(readonly?[]:[{type:"button",name:"remove",text:t("Elem törlése"),icon:"dxi dxi-delete-outline",view:"link",color:"danger"}]),
      ]});
      this.properties.events.on("change",(name:string,value:unknown)=>{
        if(readonly||!["label","detail","type"].includes(name))return;
        (node as any)[name]=String(value??"");this.changed();this.render();
      });
    }else{
      const link=this.link(selection.id)!;
      const ends=t("{source} – {target}",{source:this.node(link.source)?.label??"",target:this.node(link.target)?.label??""});
      this.properties=new Form(document.createElement("div"),{padding:16,rows:[
        {type:"text",name:"ends",label:t("Végpontok"),labelPosition:"top",value:ends},
        {type:"select",name:"type",label:t("Kapcsolattípus"),labelPosition:"top",value:link.type,disabled:readonly,options:this.config.linkTypes.map(type=>({value:type.id,content:type.label}))},
        {type:"input",name:"label",label:t("Felirat"),labelPosition:"top",value:link.label,maxlength:80,readOnly:readonly,placeholder:t("pl. 1 Gbit/s")},
        ...(readonly?[]:[{type:"button",name:"remove",text:t("Kapcsolat törlése"),icon:"dxi dxi-delete-outline",view:"link",color:"danger"}]),
      ]});
      this.properties.events.on("change",(name:string,value:unknown)=>{
        if(readonly||!["label","type"].includes(name))return;
        (link as any)[name]=String(value??"");this.changed();this.render();
      });
    }
    this.properties.events.on("click",(name:string)=>{if(name==="remove")this.remove();});
    cell.attach(this.properties);
  }

  // ---- rendering ---------------------------------------------------------------------------
  private paint():void{this.viewport.setAttribute("transform",`translate(${this.view.x} ${this.view.y}) scale(${this.view.k})`);}

  private render():void{
    this.linkLayer.replaceChildren();this.nodeLayer.replaceChildren();
    const diagram=this.document;
    if(diagram){
      const nodes=new Map(diagram.nodes.map(node=>[node.id,node]));
      for(const link of diagram.links){
        const a=nodes.get(link.source),b=nodes.get(link.target),type=this.config.linkTypes.find(item=>item.id===link.type)??this.config.linkTypes[0];
        if(!a||!b)continue;
        const group=svg("g",{class:"blade-diagram-link","data-link":link.id});
        group.append(svg("line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:"blade-diagram-link__hit"}),
          svg("line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:"blade-diagram-link__line",stroke:type.color,"stroke-width":type.width,"stroke-dasharray":DASH[type.style]}));
        const title=svg("title");title.textContent=[link.label,t("{source} – {target}",{source:a.label,target:b.label}),type.label].filter(Boolean).join("\n");group.append(title);
        if(link.label){
          const text=svg("text",{x:(a.x+b.x)/2,y:(a.y+b.y)/2-6,class:"blade-diagram-link__label","text-anchor":"middle"});
          text.textContent=link.label;group.append(text);
        }
        this.linkLayer.append(group);
      }
      for(const node of diagram.nodes){
        const type=this.types.get(node.type)??{glyph:"box",color:"#546e7a",shape:"round",label:node.type} as NodeType;
        const group=svg("g",{class:"blade-diagram-node","data-node":node.id,transform:`translate(${node.x} ${node.y})`});
        group.innerHTML=`<g class="blade-diagram-node__shape">${shapeMarkup(type.shape,type.color)}</g>`
          +`<g transform="translate(-16 -16) scale(${32/24})" class="blade-diagram-glyph">${GLYPHS[type.glyph]??GLYPHS.box}</g>`;
        const label=svg("text",{y:TILE/2+18,class:"blade-diagram-node__label","text-anchor":"middle"});label.textContent=node.label;
        group.append(label);
        if(node.detail){const detail=svg("text",{y:TILE/2+34,class:"blade-diagram-node__detail","text-anchor":"middle"});detail.textContent=node.detail;group.append(detail);}
        if(this.writable)group.append(svg("circle",{cx:TILE/2+10,cy:0,r:7,class:"blade-diagram-node__handle"}));
        const title=svg("title");title.textContent=[node.label,type.label,node.detail].filter(Boolean).join("\n");group.append(title);
        this.nodeLayer.append(group);
      }
    }
    this.highlight();this.capabilities();
  }

  private highlight():void{
    for(const node of Array.from(this.canvas.querySelectorAll(".blade-diagram--selected")))node.classList.remove("blade-diagram--selected");
    const selection=this.selection;
    if(!selection)return;
    this.canvas.querySelector(selection.kind==="node"?`[data-node="${selection.id}"]`:`[data-link="${selection.id}"]`)?.classList.add("blade-diagram--selected");
  }

  // ---- view --------------------------------------------------------------------------------
  private toDiagram(clientX:number,clientY:number):{x:number;y:number}{
    const box=this.canvas.getBoundingClientRect();
    return {x:(clientX-box.left-this.view.x)/this.view.k,y:(clientY-box.top-this.view.y)/this.view.k};
  }
  private zoom(factor:number,clientX?:number,clientY?:number):void{
    const box=this.canvas.getBoundingClientRect();
    const cx=(clientX??box.left+box.width/2)-box.left,cy=(clientY??box.top+box.height/2)-box.top;
    const k=Math.min(3,Math.max(.25,this.view.k*factor));
    this.view.x=cx-(cx-this.view.x)*k/this.view.k;this.view.y=cy-(cy-this.view.y)*k/this.view.k;this.view.k=k;
    this.paint();
  }
  private fit():void{
    const box=this.canvas.getBoundingClientRect(),nodes=this.document?.nodes??[];
    if(!box.width||!box.height){this.pendingFit=true;return;}
    this.pendingFit=false;
    if(!nodes.length){this.view={x:box.width/2,y:box.height/2,k:1};this.paint();return;}
    const margin=TILE+40;
    const left=Math.min(...nodes.map(n=>n.x))-margin,right=Math.max(...nodes.map(n=>n.x))+margin,top=Math.min(...nodes.map(n=>n.y))-margin,bottom=Math.max(...nodes.map(n=>n.y))+margin;
    const k=Math.min(1.5,Math.max(.25,Math.min(box.width/(right-left),box.height/(bottom-top))));
    this.view={k,x:box.width/2-(left+right)/2*k,y:box.height/2-(top+bottom)/2*k};
    this.paint();
  }

  // ---- pointer and keyboard ----------------------------------------------------------------
  private bindCanvas():void{
    const signal=this.listeners.signal;
    this.canvas.addEventListener("pointerdown",event=>{
      if(event.button!==0||!this.document)return;
      this.canvas.focus({preventScroll:true});
      const target=event.target as Element;
      const nodeElement=target.closest<SVGGElement>("[data-node]"),linkElement=target.closest<SVGGElement>("[data-link]");
      const point=this.toDiagram(event.clientX,event.clientY);
      if(nodeElement&&target.classList.contains("blade-diagram-node__handle")&&this.writable){
        const source=nodeElement.dataset.node!,node=this.node(source)!;
        this.gesture={kind:"connect",source};
        Object.entries({x1:node.x,y1:node.y,x2:point.x,y2:point.y,visibility:"visible"}).forEach(([key,value])=>this.draft.setAttribute(key,String(value)));
      }else if(nodeElement){
        const id=nodeElement.dataset.node!,node=this.node(id)!;
        this.select({kind:"node",id});
        if(this.writable)this.gesture={kind:"move",id,dx:point.x-node.x,dy:point.y-node.y,moved:false};
      }else if(linkElement){
        this.select({kind:"link",id:linkElement.dataset.link!});
      }else{
        if(this.selection)this.select(null);
        this.gesture={kind:"pan",x:event.clientX,y:event.clientY,tx:this.view.x,ty:this.view.y};
      }
      if(this.gesture){this.canvas.setPointerCapture(event.pointerId);event.preventDefault();}
    },{signal});
    this.canvas.addEventListener("pointermove",event=>{
      const gesture=this.gesture;
      if(!gesture)return;
      const point=this.toDiagram(event.clientX,event.clientY);
      if(gesture.kind==="pan"){this.view.x=gesture.tx+event.clientX-gesture.x;this.view.y=gesture.ty+event.clientY-gesture.y;this.paint();}
      else if(gesture.kind==="connect"){this.draft.setAttribute("x2",String(point.x));this.draft.setAttribute("y2",String(point.y));}
      else{
        const node=this.node(gesture.id);if(!node)return;
        const x=Math.round((point.x-gesture.dx)/GRID)*GRID,y=Math.round((point.y-gesture.dy)/GRID)*GRID;
        if(x===node.x&&y===node.y)return;
        node.x=x;node.y=y;gesture.moved=true;this.render();
      }
    },{signal});
    const finish=(event:PointerEvent)=>{
      const gesture=this.gesture;this.gesture=undefined;
      if(!gesture)return;
      if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
      if(gesture.kind==="move"&&gesture.moved)this.changed();
      if(gesture.kind==="connect"){
        this.draft.setAttribute("visibility","hidden");
        // Pointer capture retargets events to the canvas; the drop target comes from the point.
        const over=document.elementFromPoint(event.clientX,event.clientY)?.closest<SVGGElement>("[data-node]");
        if(event.type==="pointerup"&&over)this.connect(gesture.source,over.dataset.node!);
      }
    };
    this.canvas.addEventListener("pointerup",finish,{signal});
    this.canvas.addEventListener("pointercancel",finish,{signal});
    this.canvas.addEventListener("wheel",event=>{event.preventDefault();this.zoom(event.deltaY<0?1.1:1/1.1,event.clientX,event.clientY);},{signal,passive:false});
  }

  /** Palette items are dragged with a ghost; dropping on the canvas adds the element there. */
  private paletteDown(event:PointerEvent):void{
    const item=(event.target as HTMLElement).closest<HTMLElement>(".blade-diagram-palette__item");
    if(!item||event.button!==0||(event.target as HTMLElement).closest("button")||!this.writable)return;
    this.drag={x:event.clientX,y:event.clientY,type:item.dataset.type!,pointer:event.pointerId};
  }
  private bindPaletteDrag():void{
    const signal=this.listeners.signal;
    document.addEventListener("pointermove",event=>{
      const drag=this.drag;
      if(!drag||event.pointerId!==drag.pointer)return;
      if(!this.ghost){
        if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
        const type=this.types.get(drag.type);if(!type)return;
        this.ghost=document.createElement("div");this.ghost.className="blade-diagram-ghost";this.ghost.innerHTML=typeIcon(type,48);
        document.body.append(this.ghost);
      }
      event.preventDefault();
      this.ghost.style.transform=`translate(${event.clientX-28}px, ${event.clientY-28}px)`;
    },{signal});
    const drop=(event:PointerEvent)=>{
      const drag=this.drag;
      if(!drag||event.pointerId!==drag.pointer)return;
      this.drag=undefined;
      if(!this.ghost)return;
      this.ghost.remove();this.ghost=undefined;
      const box=this.canvas.getBoundingClientRect();
      if(event.type!=="pointerup"||event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)return;
      const point=this.toDiagram(event.clientX,event.clientY);
      this.add(drag.type,point.x,point.y);
    };
    document.addEventListener("pointerup",drop,{signal});
    document.addEventListener("pointercancel",drop,{signal});
  }

  private key(event:KeyboardEvent):void{
    if(this.disposed||this.windows.size)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"&&this.layout.getRootNode()?.isConnected){
      event.preventDefault();void this.save();return;
    }
    // Remaining shortcuts act only while the canvas has focus, never inside the property form.
    if(document.activeElement!==this.canvas)return;
    const selection=this.selection;
    if(event.key==="Escape"){this.select(null);return;}
    if((event.key==="Delete"||event.key==="Backspace")&&selection&&this.writable){event.preventDefault();this.remove();return;}
    const step:Record<string,[number,number]>={ArrowLeft:[-GRID,0],ArrowRight:[GRID,0],ArrowUp:[0,-GRID],ArrowDown:[0,GRID]};
    if(step[event.key]&&selection?.kind==="node"&&this.writable){
      event.preventDefault();
      const node=this.node(selection.id)!;node.x+=step[event.key][0];node.y+=step[event.key][1];this.changed();this.render();
    }
  }

  destroy():void{
    this.disposed=true;this.listeners.abort();this.releaseIcons();this.commands.disposeResponsive();
    this.mounter.disconnect();this.resizer.disconnect();
    this.ghost?.remove();
    for(const win of this.windows)win.destructor();this.windows.clear();
    this.properties?.destructor();this.zoomBar.destructor();this.diagrams.destructor();this.palette.destructor();
    this.layout.destructor();
  }
}

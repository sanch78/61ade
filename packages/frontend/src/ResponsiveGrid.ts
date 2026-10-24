import { t } from "./I18n";
import { DataView, Grid, Layout, awaitRedraw } from "@dhtmlx/suite";
import type { ViewDefinition } from "./Workspace";
import { gridHeader } from "./GridHeaders";
import { gridEditor } from "./GridEditing";
import type { Row } from "./Realtime";

import { escape, recordFields, recordCheckbox, recordIcon, recordMedia, optionText, isIcon, isMedia, mediaOf, thumbnailFailed } from "./RecordPresentation";
type Position={id?:string;offset:number;x:number;y:number};
export type GridMode="table"|"cards"|"tiles";
export type ResponsiveGridOptions={rowNumbers?:boolean;selection?:boolean;rowSelection?:boolean;fields?:ViewDefinition["columns"];filters?:{name:string;label:string;type?:string;options?:Record<string,string>}[];details?:(id:string)=>void;marked?:(ids:string[])=>void;edit?:(id:string,field:string,anchor:HTMLElement)=>void;idColumn?:boolean;
  /** Table row height in pixels (default 40); every paging, capture and restore calculation uses it. */
  rowHeight?:number;
  /** Minimum tile width in pixels (default 180); tiles per row follow the available width. */
  tileMinWidth?:number;
  /** Offer the tiles mode (default: when a column is a media column). */
  tiles?:boolean;
  /** Arrow/Home/End/PageUp/PageDown move the cursor row, Enter opens, Space toggles the mark (default true). */
  keyNavigation?:boolean};
/** Record keys that Suite reads as row/item configuration (`height`: Grid row pixel height, `css`: DataView item class). */
const RESERVED=["height","css"];
const guard=(row:Row):Row=>{let copy:Row|undefined;for(const key of RESERVED)if(Object.hasOwn(row,key)){copy??={...row};copy["__blade_"+key]=copy[key];delete copy[key];}return copy??row;};
const unguard=(row:Row):Row=>{let copy:Row|undefined;for(const key of RESERVED)if(Object.hasOwn(row,"__blade_"+key)){copy??={...row};copy[key]=copy["__blade_"+key];delete copy["__blade_"+key];}return copy??row;};
const cell=(row:any,id:string)=>RESERVED.includes(id)?row["__blade_"+id]:row[id];

/** Native Suite widgets share one bounded data window and action selection. */
export class ResponsiveGrid {
  readonly layout:Layout;
  private grid:Grid;
  private cards:DataView;
  private tiles:DataView;
  get table():Grid{return this.grid;}
  private current:GridMode="table";
  private preferred:GridMode="table";
  private observer:ResizeObserver;
  private observed?:HTMLElement;
  private reattach?:MutationObserver;
  private listeners=new AbortController();
  private disposed=false;
  private engaged=false;
  private selected?:string;
  private data:Row[]=[];
  private shown:Record<GridMode,Row[]>={table:[],cards:[],tiles:[]};
  private marked=new Set<string>();
  private markAnchor?:string;
  private perRow={cards:0,tiles:0};
  private resizeEpoch=0;
  private stale=false;
  private readonly rowHeight:number;
  private readonly tileMinWidth:number;
  readonly tilesOffered:boolean;
  private get compact():boolean{return this.current!=="table";}
  /** Effective mode: below 768 px the table becomes cards; tiles stay tiles. */
  get mode():GridMode{return this.current;}

  constructor(host:HTMLElement,columns:ViewDefinition["columns"],private rows:()=>Row[],select:(id:string)=>void,open:()=>void,private more:(direction:"next"|"previous")=>void,private modeChanged:(cards:boolean,mobile:boolean,mode:GridMode)=>void,private options:ResponsiveGridOptions={}){
    const filterDefinitions=new Map((options.filters??[]).map(filter=>[filter.name,filter]));
    const rh=this.rowHeight=Math.max(24,Math.min(400,Math.round(Number(options.rowHeight)||40)));
    this.tileMinWidth=Math.max(100,Math.min(600,Math.round(Number(options.tileMinWidth)||180)));
    const media=columns.find(isMedia),icon=columns.find(isIcon);
    this.tilesOffered=options.tiles??!!media;
    const keys=options.keyNavigation!==false;
    this.layout=new Layout(host,{type:"none",css:"blade-grid-views",views:[{id:"table"},{id:"cards"},{id:"tiles"}],activeView:"table"});
    this.grid=new Grid(null,{columns:[...(options.selection?[{id:"_mark",header:[{text:t("Jelölés")}],width:66,sortable:false,htmlEnable:true,template:(_:unknown,row:any)=>row._markable===false?"":`<input type="checkbox" aria-label="${escape(t("Sor jelölése: {id}",{id:row.id}))}" ${this.marked.has(String(row.id))?"checked":""}>`}]:[]),...(options.rowNumbers!==false?[{id:"_number",header:[{text:"#"}],width:56,sortable:false}]:[]),...(options.idColumn===false?[]:[{id:"id",header:[{text:"ID"}],width:80,sortable:false}]),...columns.map(c=>({id:c.id,header:(()=>{const header=gridHeader({...c,filter:filterDefinitions.get(c.id)});return Array.isArray(header)?header:[header];})(),width:c.width,minWidth:c.minWidth??(c.width?undefined:160),maxWidth:c.maxWidth,align:c.align??(c.type==="checkbox"?"center":"left"),autoWidth:!c.width,sortable:false,
      ...gridEditor(c),
      ...(c.type==="checkbox"?{type:"string" as const,editable:false,htmlEnable:true,template:(_:unknown,row:any)=>recordCheckbox(unguard(row),c)}:{}),
      ...(c.type!=="checkbox"||!c.editable?c.options&&Object.keys(c.options).length?{template:(_:unknown,row:any)=>escape(optionText(c,cell(row,c.id)))}:RESERVED.includes(c.id)&&c.type!=="checkbox"?{htmlEnable:true,template:(_:unknown,row:any)=>escape(cell(row,c.id))}:{}:{}),
      ...(isIcon(c)?{htmlEnable:true,template:(_:unknown,row:any)=>recordIcon(c,cell(row,c.id))}:{}),
      // Thumbnail cell: a square box of the row height minus 8 px (32 px at 40).
      ...(isMedia(c)?{htmlEnable:true,editable:false,width:c.width??Math.max(64,rh+24),minWidth:c.minWidth,autoWidth:false,template:(_:unknown,row:any)=>recordMedia(c,unguard(row),"cell")}:{}),
    }))],rowCss:row=>((this.grid?.data.getIndex(row.id!)??0)%2===1?"blade-grid-row-alternate":""),rowHeight:rh,autoWidth:true,resizable:true,selection:"row",keyNavigation:keys,htmlEnable:false});
    const mark=(row:Row)=>options.selection&&row._markable!==false?`<input class="blade-card-mark" type="checkbox" aria-label="${escape(t("Sor jelölése: {id}",{id:row.id}))}" ${this.marked.has(String(row.id))?"checked":""}>`:"";
    const editable=(options.fields??columns).filter(field=>!media||field.id!==media.id).map(field=>({...field,editable:columns.find(c=>c.id===field.id)?.editable}));
    this.cards=new DataView(document.createElement("div"),{itemsInRow:1,gap:12,selection:true,keyNavigation:keys,css:"blade-grid-cards",template:(item:Row)=>{const row=unguard(item);
      return `<article class="blade-grid-card${this.marked.has(String(row.id))?" blade-grid-card--marked":""}" data-blade-row="${escape(row.id)}">${media&&mediaOf(media,row)?`<div class="blade-grid-card__media">${recordMedia(media,row,"card")}</div>`:""}<div class="blade-grid-card__id">${mark(row)}${mark(row)?" ":""}${options.idColumn===false?"":`ID · ${escape(row.id)}`}</div>${recordFields(row,editable,true)}</article>`;},
      eventHandlers:{onclick:{"blade-card-mark":(_event:Event,id:string|number)=>this.toggleMark(String(id))}}});
    // Tiles: media slot (or the icon column), the first text column as title and one secondary line.
    const text=columns.filter(c=>!isMedia(c)&&!isIcon(c)&&c.type!=="checkbox"),title=text[0],detail=text[1];
    this.tiles=new DataView(document.createElement("div"),{itemsInRow:1,gap:8,selection:true,keyNavigation:keys,css:"blade-grid-tiles",template:(item:Row)=>{const row=unguard(item);
      const caption=title?optionText(title,row[title.id]):String(row.id),line=detail&&Object.hasOwn(row,detail.id)?optionText(detail,row[detail.id]):"";
      return `<article class="blade-grid-tile${this.marked.has(String(row.id))?" blade-grid-tile--marked":""}" data-blade-row="${escape(row.id)}"><div class="blade-grid-tile__media">${media?recordMedia(media,row,"tile"):icon&&row[icon.id]?`<span class="blade-media blade-media--tile">${recordIcon(icon,row[icon.id])}</span>`:`<span class="blade-media blade-media--tile blade-media--empty" aria-hidden="true"></span>`}${mark(row)}</div><div class="blade-grid-tile__title" title="${escape(caption)}">${escape(caption||"—")}</div>${line?`<div class="blade-grid-tile__meta" title="${escape(line)}">${escape(line)}</div>`:""}</article>`;},
      eventHandlers:{onclick:{"blade-card-mark":(_event:Event,id:string|number)=>this.toggleMark(String(id))}}});
    const selected=(id:string|number)=>{this.selected=String(id);select(this.selected);};
    const markRow=(id:string,event:MouseEvent)=>{
      // A `_markable: false` row (such as a ".." parent link) can hold the cursor, never a mark.
      if(!this.markable(id)){if(!event.shiftKey&&!event.ctrlKey&&!event.metaKey){this.marked.clear();this.refreshMarks();}return;}
      if(event.shiftKey&&this.markAnchor)this.markRange(this.markAnchor,id);
      else if(event.ctrlKey||event.metaKey)this.toggleMark(id);
      else {this.marked.clear();this.marked.add(id);this.refreshMarks();}
      this.markAnchor=id;
    };
    const activate=(id:string)=>{selected(id);if(this.compact&&options.details)options.details(id);else open();};
    this.grid.events.on("cellClick",(row:any,column:any)=>{
      const id=String(row.id);selected(id);
      if(column.id==="_mark"){this.toggleMark(id);this.markAnchor=id;return;}
    });
    // Native key navigation moves the Grid selection: it is the cursor row.
    this.grid.events.on("afterSelect",(row:any)=>{if(row?.id!==undefined&&String(row.id)!==this.selected)selected(row.id);});
    this.grid.events.on("cellDblClick",(row:any,column:any)=>{selected(row.id);if(column.id==="_number"){options.details?.(String(row.id));return;}if(column.id==="_mark"||columns.some(c=>c.id===column.id&&c.type==="checkbox"&&c.editable&&row._editable?.includes(c.id)))return;if(column.editable&&row._editable?.includes(String(column.id)))return;open();});
    for(const list of [this.cards,this.tiles]){
      list.selection.events.on("afterSelect",(id:string|number)=>selected(id));
      // DataView arrows move its focus; the selection (cursor) follows it.
      list.events.on("focuschange",(_index?:number,id?:string|number)=>{if(id!==undefined&&id!==null&&!list.selection.contains(id))list.selection.add(id);});
      list.events.on("doubleclick",(id:string|number,event:Event)=>{if((event?.target as HTMLElement)?.closest(".blade-card-edit"))return;activate(String(id));});
    }
    this.layout.getCell("table").attach(this.grid);this.layout.getCell("cards").attach(this.cards);this.layout.getCell("tiles").attach(this.tiles);
    this.grid.events.on("scroll",(position:{x:number;y:number})=>{
      if(this.compact)return;
      if(position.y>this.rows().length*this.rowHeight-Math.max(400,innerHeight*1.4))this.more("next");
      else if(position.y<120)this.more("previous");
    });
    // A host Layout may re-create this layout's DOM (cell hide/show, a `views` switch), so the
    // listeners are delegated from the document and filtered by the current root at event time.
    const within=(event:Event):HTMLElement|null=>{const root=this.bindRoot(),target=event.target;return root&&target instanceof Element&&root.contains(target)?target as HTMLElement:null;};
    const on=(type:string,handler:(event:Event,target:HTMLElement)=>void,capture=false)=>document.addEventListener(type,event=>{const target=within(event);if(target&&!this.disposed)handler(event,target);},{capture,signal:this.listeners.signal});
    // Standard DataView has no public scroll event: observe native scrolling,
    // without replacing widget rendering or depending on PRO ScrollView.
    on("scroll",(_event,element)=>{
      if(!this.compact||!element.matches(".dhx_dataview"))return;
      if(element.scrollTop+element.clientHeight>=element.scrollHeight-400)this.more("next");
      else if(element.scrollTop<120)this.more("previous");
    },true);
    // A missing thumbnail (404/415) falls back to the type icon; inline handlers are blocked by the CSP.
    document.addEventListener("error",event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.isConnected&&image.matches("img[data-blade-thumbnail]"))thumbnailFailed(image);},{capture:true,signal:this.listeners.signal});
    document.addEventListener("pointerdown",event=>{this.engaged=!!within(event);},{capture:true,signal:this.listeners.signal});
    on("mousedown",(event,target)=>{
      if((event as MouseEvent).detail>1&&!target.closest("input,textarea,select"))event.preventDefault();
    });
    const edit=(event:Event)=>{
      const anchor=(event.target as HTMLElement).closest<HTMLElement>(".blade-card-edit");
      const id=anchor?.closest<HTMLElement>("[data-blade-row]")?.dataset.bladeRow;
      if(!anchor||!id)return false;
      event.preventDefault();event.stopPropagation();selected(id);options.edit?.(id,anchor.dataset.bladeField!,anchor);return true;
    };
    on("click",(event,target)=>{
      if(edit(event)||!options.rowSelection)return;
      if(target.closest("input,textarea,select,.blade-card-edit"))return;
      const card=target.closest<HTMLElement>("[data-blade-row]");
      const row=target.closest<HTMLElement>(".dhx_grid-row");
      const id=card?.dataset.bladeRow??row?.getAttribute("data-dhx-id")??row?.dataset.dhxId;
      if(!id)return;
      event.preventDefault();event.stopPropagation();selected(id);markRow(id,event as MouseEvent);
    });
    // Capture phase: the framework keys run before the Suite key managers (document, bubble).
    document.addEventListener("keydown",event=>{
      if(this.disposed)return;
      const target=event.target as HTMLElement,inside=within(event);
      if(!inside&&!(this.engaged&&(target===document.body||target===document.documentElement)))return;
      if(inside&&(event.key==="Enter"||event.key===" ")&&edit(event))return;
      if(!keys||event.altKey||event.ctrlKey||event.metaKey||event.defaultPrevented||!["Home","End","PageUp","PageDown","Enter"," "].includes(event.key))return;
      if(inside?.closest("input,textarea,select,[contenteditable],.dhx_grid-header,.dhx_grid-footer,.blade-card-edit"))return;
      if(event.key==="Enter"){
        if(!this.selected)return;
        if(!this.compact){const active=this.grid.selection.getCell() as any,row=this.rows().find(r=>String(r.id)===this.selected);if(active?.column?.editable&&row?._editable?.includes(String(active.column.id)))return;}
        activate(this.selected);
      }else if(event.key===" "){
        if(!(options.selection||options.rowSelection)||!this.selected)return;
        this.toggleMark(this.selected);this.markAnchor=this.selected;
      }else this.moveCursor(event.key);
      event.preventDefault();event.stopPropagation();
    },{capture:true,signal:this.listeners.signal});
    this.observer=new ResizeObserver(()=>void this.resize());this.bindRoot();
    window.addEventListener("resize",()=>void this.resize(),{signal:this.listeners.signal});
  }
  /** Observes the current root; a root that a host re-created is observed again once it is connected. */
  private bindRoot():HTMLElement|undefined{
    const root=this.layout.getRootNode() as HTMLElement|undefined;
    if(this.disposed)return root;
    if(root?.isConnected&&root!==this.observed){if(this.observed)this.observer.unobserve(this.observed);this.observed=root;this.observer.observe(root);root.style.setProperty("--blade-row-height",this.rowHeight+"px");}
    if(!root?.isConnected&&!this.reattach){
      this.reattach=new MutationObserver(()=>{if(!this.layout.getRootNode()?.isConnected)return;this.reattach?.disconnect();this.reattach=undefined;void this.resize();});
      this.reattach.observe(document.body,{childList:true,subtree:true});
    }
    return root;
  }
  private list(mode=this.current):DataView{return mode==="tiles"?this.tiles:this.cards;}
  private cardScroller():HTMLElement|null{const root=this.list().getRootNode();return root?.querySelector<HTMLElement>(".dhx_dataview")??root??null;}
  setMode(mode:GridMode):void{this.preferred=mode==="cards"||mode==="tiles"?mode:"table";void this.resize();}
  setColumnVisible(id:string,visible:boolean):void{
    if(visible)this.grid.showColumn(id);else this.grid.hideColumn(id);
  }
  private moveCursor(key:string):void{
    const rows=this.rows();if(!rows.length)return;
    const index=Math.max(0,rows.findIndex(row=>String(row.id)===this.selected));
    let page:number;
    if(this.compact){
      const scroller=this.cardScroller(),item=scroller?.querySelector<HTMLElement>(".dhx_dataview-item"),perRow=this.list().config.itemsInRow??1;
      page=perRow*Math.max(1,Math.floor((scroller?.clientHeight??0)/Math.max(1,(item?.getBoundingClientRect().height??0)+(this.list().config.gap??0))));
    }else page=Math.max(1,Math.floor((this.grid.getRootNode()?.querySelector<HTMLElement>(".dhx_grid-body")?.clientHeight??this.rowHeight)/this.rowHeight)-1);
    const next=key==="Home"?0:key==="End"?rows.length-1:key==="PageUp"?Math.max(0,index-page):Math.min(rows.length-1,index+page);
    const id=String(rows[next].id);
    if(this.compact){const list=this.list();list.selection.add(id);list.setFocus(id);return;}
    const column=(this.grid.selection.getCell() as any)?.column?.id??(this.grid.config.columns??[]).find(column=>!column.hidden)?.id;
    (this.grid.selection as any).setCell(id,column);this.grid.scrollTo(id,String(column));
  }
  private async resize():Promise<void>{
    // A host in an inactive Layout view has no DOM until it is shown again.
    const root=this.bindRoot();
    if(this.disposed||!root)return;
    // A detached root (not yet attached by its host) still selects the view; widths follow once it is measured.
    const width=root.clientWidth;
    const counts=width?{cards:Math.max(1,Math.floor((width-24)/340)),tiles:Math.max(1,Math.floor((width-8)/(this.tileMinWidth+8)))}:{cards:this.perRow.cards||1,tiles:this.perRow.tiles||1};
    const changed={cards:counts.cards!==this.perRow.cards,tiles:counts.tiles!==this.perRow.tiles};
    for(const kind of ["cards","tiles"] as const)if(changed[kind]){this.perRow[kind]=counts[kind];this.list(kind).config.itemsInRow=counts[kind];}
    const mobile=innerWidth<768;
    const mode:GridMode=this.preferred==="tiles"&&this.tilesOffered?"tiles":mobile||this.preferred==="cards"?"cards":"table";
    this.modeChanged(mode!=="table",mobile,mode);
    if(mode===this.current){if(this.stale){this.syncRows();this.refreshMarks();}else if(mode!=="table"&&changed[mode]&&this.list().getRootNode())this.list().paint();return;}
    const epoch=++this.resizeEpoch;
    const position=this.capture();this.current=mode;
    this.layout.getCell(mode).show();
    await awaitRedraw();
    if(this.disposed||epoch!==this.resizeEpoch)return;
    this.syncRows();
    if(this.compact&&this.list().getRootNode())this.list().paint();
    await awaitRedraw();
    if(!this.disposed&&epoch===this.resizeEpoch)this.restore(position,true,this.selected,true);
  }
  capture():Position{
    const rh=this.rowHeight;
    if(!this.compact){const p=this.grid.getRootNode()?this.grid.getScrollState():{x:0,y:0};return {id:String(this.rows()[Math.floor(p.y/rh)]?.id??""),offset:p.y%rh,...p};}
    const root=this.cardScroller();if(!root)return {offset:0,x:0,y:0};const top=root.getBoundingClientRect().top;
    const card=Array.from(root.querySelectorAll<HTMLElement>("article[data-blade-row]")).find(e=>e.getBoundingClientRect().bottom>top);
    return {id:card?.dataset.bladeRow,offset:card?top-card.getBoundingClientRect().top:0,x:0,y:root.scrollTop};
  }
  setRows(rows:Row[]):void{
    const available=new Set(rows.map(row=>String(row.id)));
    for(const id of this.marked)if(!available.has(id))this.marked.delete(id);
    this.options.marked?.([...this.marked]);
    this.data=structuredClone(rows);
    this.syncRows();
    this.refreshMarks();
  }
  private syncRows():void{
    // A hidden Suite view has no DOM root. Keep its snapshot until it is mounted,
    // rather than asking its collection/selection events to redraw an absent widget.
    const widget=this.compact?this.list():this.grid;
    if(!widget.getRootNode()){this.stale=true;return;}
    this.stale=false;
    const previous=this.shown[this.current];
    const rows=this.data;
    const rendered=this.compact?rows.map(row=>guard(structuredClone(row))):rows.map((row,index)=>{
      const result:Row={...structuredClone(row),_number:row._number??index+1};
      for(const column of this.grid.config.columns??[])if(column.type==="boolean"&&Object.hasOwn(result,column.id))result[column.id]=result[column.id]===true||String(result[column.id])==="1";
      return guard(result);
    });
    const same=previous.length===rows.length&&previous.every((row,index)=>String(row.id)===String(rows[index].id));
    if(same){for(let i=0;i<rows.length;i++)if(JSON.stringify(previous[i])!==JSON.stringify(rows[i]))widget.data.update(String(rows[i].id),rendered[i]);}
    else{widget.data.removeAll();widget.data.parse(rendered);}
    this.shown[this.current]=structuredClone(rows);
  }

  restore(position:Position,preserve:boolean,selected?:string,switching=false):void{
    this.selected=selected;
    const list=this.list();
    if(this.compact){if(list.getRootNode()){if(selected)list.selection.add(selected);else list.selection.remove();}}
    else if(this.grid.getRootNode()){if(selected)(this.grid.selection as any).setCell(selected);else this.grid.selection.removeCell();}
    const index=this.rows().findIndex(r=>String(r.id)===position.id);
    if(!this.compact&&this.grid.getRootNode())this.grid.scroll(position.x,preserve?(index>=0?index*this.rowHeight+(switching?0:position.offset):position.y):0);
    else if(this.compact){
      const root=this.cardScroller();if(!root)return;const card=Array.from(root.querySelectorAll<HTMLElement>("article[data-blade-row]")).find(e=>e.dataset.bladeRow===position.id);
      // Grid pixels do not represent card pixels. Keep the same record at its
      // natural top inset on a mode switch; retain exact offsets for live updates.
      const offset=switching?-(Number.parseFloat(getComputedStyle(root).paddingTop)||0):position.offset;
      root.scrollTop=preserve?switching&&position.y===0?0:(card?root.scrollTop+card.getBoundingClientRect().top-root.getBoundingClientRect().top+offset:position.y):0;
    }
  }
  get markedIds():string[]{return [...this.marked];}
  clearMarks():void{this.marked.clear();this.markAnchor=undefined;this.refreshMarks();}
  private markable(id:string):boolean{return this.rows().find(row=>String(row.id)===id)?._markable!==false;}
  private toggleMark(id:string):void{if(!this.markable(id))return;if(this.marked.has(id))this.marked.delete(id);else this.marked.add(id);this.refreshMarks();}
  private markRange(from:string,to:string):void{
    const start=this.rows().findIndex(row=>String(row.id)===from),end=this.rows().findIndex(row=>String(row.id)===to);
    if(start<0||end<0)return;
    for(const row of this.rows().slice(Math.min(start,end),Math.max(start,end)+1))if(row._markable!==false)this.marked.add(String(row.id));
    this.refreshMarks();
  }
  private refreshMarks():void{
    if(this.grid.getRootNode()){
      for(const row of this.rows()){
        const id=String(row.id);
        if(this.marked.has(id))this.grid.addRowCss(id,"blade-grid-row-marked");
        else this.grid.removeRowCss(id,"blade-grid-row-marked");
      }
      this.grid.paint();
    }
    for(const list of [this.cards,this.tiles])if(list.getRootNode())list.paint();
    this.options.marked?.([...this.marked]);
  }
  destroy():void{this.disposed=true;this.observer.disconnect();this.reattach?.disconnect();this.reattach=undefined;this.listeners.abort();}
}

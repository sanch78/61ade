import { t } from "./I18n";
import { DataView, Grid, Layout, awaitRedraw } from "@dhtmlx/suite";
import type { ViewDefinition } from "./components/list/types";
import { gridHeader } from "./GridHeaders";
import { RESERVED, alias, gridEditor, unalias } from "./GridEditing";
import type { Row } from "./Realtime";

import { escape, recordFields, recordCheckbox, recordIcon, recordMedia, recordSlot, hasSlot, imageSlot, optionText, isIcon, isMedia, isImage, mediaOf, presentedFields, thumbnailFailed, derivedOf, derivedText, columnText, withDerived } from "./RecordPresentation";
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
  keyNavigation?:boolean;
  /** Records expand to this nested view (collapsed by default); tiles do not expand. */
  subview?:SubViewOptions;
  /** Always the table: no cards on narrow screens (a compact preview). */
  table?:boolean;
  /** A declared activation: double-click and Enter run `open` in cards and tiles too (not the details); the accessible description of what it runs on a card or tile, `undefined` for a record without one. */
  activation?:(row:Row)=>string|undefined;
  /** false: rows never become the cursor record (native selection and key navigation off, no highlight); double-click and Enter open nothing, editable switch cells still save. */
  select?:boolean};
/** Reserved record keys (`RESERVED`) live under their alias in widget data and as Grid column ids, so editors use the alias too. */
const guard=(row:Row):Row=>{let copy:Row|undefined;for(const key of RESERVED)if(Object.hasOwn(row,key)){copy??={...row};copy[alias(key)]=copy[key];delete copy[key];}return copy??row;};
const unguard=(row:Row):Row=>{let copy:Row|undefined;for(const key of RESERVED)if(Object.hasOwn(row,alias(key))){copy??={...row};copy[key]=copy[alias(key)];delete copy[alias(key)];}return copy??row;};
const cell=(row:any,id:string)=>row[alias(id)];
/**
 * Sub-views: an open record shows a nested framework view under it, in a table sub-row (a framework row spanned
 * from the toggle column over the whole table). The row only reserves a slot; the nested view lives in a fixed,
 * clipped layer above it, so its widgets never sit inside this Grid's DOM and their mouse and key handling stays
 * separate. A card does not embed it: its sub-view button opens the full child view (`open`). A record whose
 * `_subview` count is 0 has no sub-items and does not expand, unless `_subview_open` (the count covers only part of
 * the child rows, such as accounts with access); a missing count means unknown (expandable).
 */
const SUBROW="__blade_subrow",subRowId=(id:string)=>SUBROW+":"+id;
const slot=(id:string,height?:number)=>`<div class="blade-subview-slot" data-blade-subview="${escape(id)}"${height?` style="height:${height}px"`:""}></div>`;
export type SubView={destroy():void};
/** `mount` reports the height the nested view's content needs. */
export type SubViewOptions={mount:(host:HTMLElement,row:Row,height:(pixels:number)=>void)=>SubView;
  /** Card button caption (the child list title) and the full child view of one record. */
  label:string;open:(id:string)=>void};
/** A record has sub-items unless the server counted none (`_subview: 0` without `_subview_open`). */
export const hasSubview=(row:Row|undefined)=>!!row&&((row as any)._subview_open===true||Number((row as any)._subview??1)!==0);
/** Rows a compact preview shows before it scrolls: 40 % of the viewport, never fewer than 5 or more than 10. */
export const previewRows=(rowHeight:number)=>Math.max(5,Math.min(10,Math.floor(innerHeight*.4/rowHeight)));

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
  /** Records with an open sub-view, the open table sub-rows' heights as rendered, and the mounted nested views. */
  private expanded=new Set<string>();
  private opened=new Map<string,number>();
  private index=new Map<string,number>();
  private mounted=new Map<string,{host:HTMLElement;view:SubView;height:number}>();
  private layer?:HTMLElement;
  private frame=0;
  private readonly tileMinWidth:number;
  readonly tilesOffered:boolean;
  private get compact():boolean{return this.current!=="table";}
  /** Effective mode: below 768 px the table becomes cards; tiles stay tiles. */
  get mode():GridMode{return this.current;}

  constructor(host:HTMLElement,columns:ViewDefinition["columns"],private rows:()=>Row[],select:(id:string)=>void,open:()=>void,private more:(direction:"next"|"previous")=>void,private modeChanged:(cards:boolean,mobile:boolean,mode:GridMode)=>void,private options:ResponsiveGridOptions={}){
    const filterDefinitions=new Map((options.filters??[]).map(filter=>[filter.name,filter]));
    const rh=this.rowHeight=Math.max(24,Math.min(400,Math.round(Number(options.rowHeight)||40)));
    this.tileMinWidth=Math.max(100,Math.min(600,Math.round(Number(options.tileMinWidth)||180)));
    const media=columns.find(isMedia)??columns.find(isImage),icon=columns.find(isIcon);
    this.tilesOffered=options.tiles??!!media;
    const pick=options.select!==false,keys=pick&&options.keyNavigation!==false;
    this.layout=new Layout(host,{type:"none",css:"blade-grid-views",views:[{id:"table"},{id:"cards"},{id:"tiles"}],activeView:"table"});
    const toggle=(id:string,row?:Row)=>{if(!hasSubview(row??this.data.find(item=>String(item.id)===id)))return "";const open=this.expanded.has(id),label=t(open?"Részletek elrejtése: {id}":"Részletek megjelenítése: {id}",{id});
      return `<button type="button" class="blade-subrow-toggle dhx_button dhx_button--view_link dhx_button--size_small dhx_button--icon" aria-expanded="${open}" aria-label="${escape(label)}" title="${escape(label)}"><span class="dhx_button__icon dxi ${open?"dxi-chevron-down":"dxi-chevron-right"}" aria-hidden="true"></span></button>`;};
    this.grid=new Grid(null,{columns:[...(options.subview?[{id:SUBROW,header:[{text:""}],width:44,sortable:false,resizable:false,htmlEnable:true,template:(_:unknown,row:any)=>row[SUBROW]!==undefined?slot(String(row[SUBROW])):toggle(String(row.id),unguard(row))}]:[]),...(options.selection?[{id:"_mark",header:[{text:t("Jelölés")}],width:66,sortable:false,htmlEnable:true,template:(_:unknown,row:any)=>row._markable===false?"":`<input type="checkbox" aria-label="${escape(t("Sor jelölése: {id}",{id:row.id}))}" ${this.marked.has(String(row.id))?"checked":""}>`}]:[]),...(options.rowNumbers!==false?[{id:"_number",header:[{text:"#"}],width:56,sortable:false}]:[]),...(options.idColumn===false?[]:[{id:"id",header:[{text:"ID"}],width:80,sortable:false}]),...columns.map(c=>({id:alias(c.id),header:(()=>{const header=gridHeader({...c,filter:filterDefinitions.get(c.id)});return Array.isArray(header)?header:[header];})(),width:c.width,minWidth:c.minWidth??(c.width?undefined:160),maxWidth:c.maxWidth,align:c.align??(c.type==="checkbox"?"center":"left"),autoWidth:!c.width,sortable:false,
      ...gridEditor(c),
      ...(c.type==="checkbox"?{type:"string" as const,editable:false,htmlEnable:true,template:(_:unknown,row:any)=>recordCheckbox(unguard(row),c)}:{}),
      ...(c.type!=="checkbox"||!c.editable?c.options&&Object.keys(c.options).length?{template:(_:unknown,row:any)=>escape(optionText(c,cell(row,c.id)))}:{}:{}),
      ...(isIcon(c)?{htmlEnable:true,template:(_:unknown,row:any)=>recordIcon(c,cell(row,c.id))}:{}),
      // Thumbnail cell: a square box of the row height minus 8 px (32 px at 40).
      ...(isMedia(c)?{htmlEnable:true,editable:false,width:c.width??Math.max(64,rh+24),minWidth:c.minWidth,autoWidth:false,template:(_:unknown,row:any)=>recordMedia(c,unguard(row),"cell")}:{}),
      ...(isImage(c)?{htmlEnable:true,editable:false,width:c.width??Math.max(64,rh+24),minWidth:c.minWidth,autoWidth:false,template:(_:unknown,row:any)=>imageSlot(c,unguard(row),"cell")}:{}),
      // Derived media part (`mediaOf`/`part`): text from the row's `_media`, never sortable, filterable or editable.
      ...(derivedOf(c)?{editable:false,template:(_:unknown,row:any)=>escape(derivedText(c,unguard(row))??"")}:{}),
      // A registered presentation or field-type display renders the cell; a field type is edited in the framework edit window
      // (`edit`, the cards' editor), never by the native cell editor.
      ...(!isMedia(c)&&!isImage(c)&&(c.render||c.fieldType)?{htmlEnable:true,...(c.fieldType?{editable:false}:{}),template:(_:unknown,row:any)=>{
        const record=unguard(row),html=c.render?c.render(record,"cell"):escape(optionText(c,record[c.id]));
        return c.fieldType&&c.editable&&record._editable?.includes(c.id)?`<span class="blade-card-edit" data-blade-row="${escape(record.id)}" data-blade-field="${escape(c.id)}" tabindex="0" role="button" aria-label="${escape(t("{field} — szerkesztés",{field:c.header}))}">${html}</span>`:html;}}:{}),
    }))],rowCss:row=>{const sub=(row as any)[SUBROW],index=this.index.get(String(sub??row.id))??0;return (sub!==undefined?"blade-grid-subrow-row ":"")+(index%2===1?"blade-grid-row-alternate":"");},rowHeight:rh,autoWidth:true,resizable:true,selection:(pick?"row":false) as "row",keyNavigation:keys,htmlEnable:false});
    // Card sub-view button: a native DHTMLX flat button with the child list title and the count when known.
    const subviewButton=(row:Row)=>{const count=(row as any)._subview,caption=options.subview!.label+(count!==undefined&&count!==null?` (${Number(count)})`:"");
      return `<div class="blade-grid-card__subview"><button type="button" class="blade-card-subview dhx_button dhx_button--view_flat dhx_button--color_primary dhx_button--size_medium dhx_button--icon-left" aria-haspopup="dialog" title="${escape(caption)}"><span class="dhx_button__icon dxi dxi-arrow-expand" aria-hidden="true"></span><span class="dhx_button__text">${escape(caption)}</span></button></div>`;};
    const hint=(row:Row)=>{const text=pick?options.activation?.(row):undefined;return text?` aria-description="${escape(text)}"`:"";};
    const mark=(row:Row)=>options.selection&&row._markable!==false?`<input class="blade-card-mark" type="checkbox" aria-label="${escape(t("Sor jelölése: {id}",{id:row.id}))}" ${this.marked.has(String(row.id))?"checked":""}>`:"";
    // Card fields: every permitted field with its column's presentation; only the first media field moves to the top slot.
    const editable=presentedFields(withDerived(options.fields??columns,columns),columns).filter(field=>!media||field.id!==media.id).map(field=>({...field,editable:columns.find(c=>c.id===field.id)?.editable}));
    this.cards=new DataView(document.createElement("div"),{itemsInRow:1,gap:12,selection:pick,keyNavigation:keys,css:"blade-grid-cards",template:(item:Row)=>{const row=unguard(item);
      return `<article class="blade-grid-card${this.marked.has(String(row.id))?" blade-grid-card--marked":""}" data-blade-row="${escape(row.id)}"${hint(row)}>${media&&hasSlot(media,row)?`<div class="blade-grid-card__media">${recordSlot(media,row,"card")}</div>`:""}<div class="blade-grid-card__id">${mark(row)}${mark(row)?" ":""}${options.idColumn===false?"":`ID · ${escape(row.id)}`}</div>${recordFields(row,editable,true)}${options.subview&&hasSubview(row)?subviewButton(row):""}</article>`;},
      eventHandlers:{onclick:{"blade-card-mark":(_event:Event,id:string|number)=>this.toggleMark(String(id)),"blade-card-subview":(event:Event,id:string|number)=>{event.stopPropagation();selected(id);options.subview?.open(String(id));}}}});
    // Tiles: media slot (or the icon column), the first text column as title and one secondary line.
    const text=columns.filter(c=>!isMedia(c)&&!isImage(c)&&!isIcon(c)&&c.type!=="checkbox"),title=text[0],detail=text[1];
    this.tiles=new DataView(document.createElement("div"),{itemsInRow:1,gap:8,selection:pick,keyNavigation:keys,css:"blade-grid-tiles",template:(item:Row)=>{const row=unguard(item);
      const caption=title?columnText(title,row):String(row.id),line=detail&&(Object.hasOwn(row,detail.id)||derivedOf(detail))?columnText(detail,row):"";
      return `<article class="blade-grid-tile${this.marked.has(String(row.id))?" blade-grid-tile--marked":""}" data-blade-row="${escape(row.id)}"${hint(row)}><div class="blade-grid-tile__media">${media&&(hasSlot(media,row)||!icon||!row[icon.id])?recordSlot(media,row,"tile"):icon&&row[icon.id]?`<span class="blade-media blade-media--tile">${recordIcon(icon,row[icon.id])}</span>`:`<span class="blade-media blade-media--tile blade-media--empty" aria-hidden="true"></span>`}${mark(row)}</div><div class="blade-grid-tile__title" title="${escape(caption)}">${escape(caption||"—")}</div>${line?`<div class="blade-grid-tile__meta" title="${escape(line)}">${detail.render?detail.render(row,"tile"):escape(line)}</div>`:""}</article>`;},
      eventHandlers:{onclick:{"blade-card-mark":(_event:Event,id:string|number)=>this.toggleMark(String(id))}}});
    const selected=(id:string|number)=>{if(!pick)return;this.selected=this.recordId(String(id));select(this.selected);};
    const markRow=(id:string,event:MouseEvent)=>{
      // A `_markable: false` row (such as a ".." parent link) can hold the cursor, never a mark.
      if(!this.markable(id)){if(!event.shiftKey&&!event.ctrlKey&&!event.metaKey){this.marked.clear();this.refreshMarks();}return;}
      if(event.shiftKey&&this.markAnchor)this.markRange(this.markAnchor,id);
      else if(event.ctrlKey||event.metaKey)this.toggleMark(id);
      else {this.marked.clear();this.marked.add(id);this.refreshMarks();}
      this.markAnchor=id;
    };
    // Cards and tiles open the details unless the record has a declared activation (an activation map may declare none for it).
    const declared=(id:string)=>{const row=options.activation&&this.data.find(item=>String(item.id)===id);return !!row&&options.activation!(row)!==undefined;};
    const activate=(id:string)=>{selected(id);if(this.compact&&options.details&&!declared(id))options.details(id);else open();};
    this.grid.events.on("cellClick",(row:any,column:any)=>{
      const id=this.recordId(String(row.id));selected(id);
      if(column.id===SUBROW&&row[SUBROW]===undefined){this.toggleSubRow(id);return;}
      if(column.id==="_mark"){this.toggleMark(id);this.markAnchor=id;return;}
    });
    // Native key navigation moves the Grid selection: it is the cursor row.
    this.grid.events.on("afterSelect",(row:any)=>{if(row?.id!==undefined&&this.recordId(String(row.id))!==this.selected)selected(row.id);});
    this.grid.events.on("cellDblClick",(row:any,column:any)=>{if(!pick)return;selected(row.id);if(row[SUBROW]!==undefined){open();return;}if(column.id===SUBROW)return;if(column.id==="_number"){options.details?.(String(row.id));return;}if(column.id==="_mark"||columns.some(c=>alias(c.id)===column.id&&(c.type==="checkbox"||c.fieldType)&&c.editable&&row._editable?.includes(c.id)))return;if(column.editable&&row._editable?.includes(unalias(String(column.id))))return;open();});
    for(const list of [this.cards,this.tiles]){
      list.selection.events.on("afterSelect",(id:string|number)=>selected(id));
      // DataView arrows move its focus; the selection (cursor) follows it.
      list.events.on("focuschange",(_index?:number,id?:string|number)=>{if(pick&&id!==undefined&&id!==null&&!list.selection.contains(id))list.selection.add(id);});
      list.events.on("doubleclick",(id:string|number,event:Event)=>{if(!pick||(event?.target as HTMLElement)?.closest(".blade-card-edit,.blade-card-subview"))return;activate(String(id));});
    }
    this.layout.getCell("table").attach(this.grid);this.layout.getCell("cards").attach(this.cards);this.layout.getCell("tiles").attach(this.tiles);
    this.grid.events.on("scroll",(position:{x:number;y:number})=>{
      if(this.compact)return;
      if(position.y>this.top(this.rows().length)-Math.max(400,innerHeight*1.4))this.more("next");
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
    document.addEventListener("error",event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.isConnected&&image.matches("img[data-blade-thumbnail],img[data-blade-static-image]"))thumbnailFailed(image);},{capture:true,signal:this.listeners.signal});
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
      const raw=card?.dataset.bladeRow??row?.getAttribute("data-dhx-id")??row?.dataset.dhxId;
      if(!raw||target.closest(".blade-subrow-toggle,.blade-card-subview"))return;
      const id=this.recordId(raw);
      event.preventDefault();event.stopPropagation();selected(id);markRow(id,event as MouseEvent);
    });
    // Capture phase: the framework keys run before the Suite key managers (document, bubble).
    document.addEventListener("keydown",event=>{
      if(this.disposed)return;
      const target=event.target as HTMLElement,inside=within(event);
      if(!inside&&!(this.engaged&&(target===document.body||target===document.documentElement)))return;
      if(inside&&(event.key==="Enter"||event.key===" ")&&edit(event))return;
      if(!keys||event.altKey||event.ctrlKey||event.metaKey||event.defaultPrevented||!["Home","End","PageUp","PageDown","Enter"," "].includes(event.key))return;
      if(inside?.closest("input,textarea,select,[contenteditable],.dhx_grid-header,.dhx_grid-footer,.blade-card-edit,.blade-card-subview"))return;
      if(event.key==="Enter"){
        if(!this.selected)return;
        if(!this.compact){const active=this.grid.selection.getCell() as any,row=this.rows().find(r=>String(r.id)===this.selected);if(active?.column?.id===SUBROW&&active?.row?.[SUBROW]===undefined){this.toggleSubRow(this.selected);event.preventDefault();event.stopPropagation();return;}if(active?.column?.editable&&row?._editable?.includes(unalias(String(active.column.id))))return;}
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
  /** The record a Grid row stands for: a sub-row stands for its record. */
  private recordId(id:string):string{return id.startsWith(SUBROW+":")?id.slice(SUBROW.length+1):id;}
  /** Table offset of the record at `index`: fixed rows plus the open sub-rows above it. */
  private top(index:number):number{
    let y=index*this.rowHeight;
    for(const [id,height] of this.opened)if((this.index.get(id)??Infinity)<index)y+=height;
    return y;
  }
  /** The record at a table offset and the offset inside it (an open sub-row belongs to its record). */
  private at(y:number):{index:number;offset:number}{
    let index=0,start=0;
    for(;index<this.data.length;index++){const end=start+this.rowHeight+(this.opened.get(String(this.data[index].id))??0);if(y<end)break;start=end;}
    return {index,offset:y-start};
  }
  private toggleSubRow(id:string):void{
    const subview=this.options.subview,row=this.data.find(item=>String(item.id)===id);
    if(!subview||!row||this.compact)return;
    if(this.expanded.has(id)){this.expanded.delete(id);this.unmount(id);}
    else{
      if(!hasSubview(row))return;
      this.expanded.add(id);const host=document.createElement("div");host.className="blade-subview-host";this.subviewLayer().append(host);
      const entry={host,height:120,view:undefined as unknown as SubView};this.mounted.set(id,entry);
      entry.view=subview.mount(host,row,pixels=>this.resizeSubRow(id,pixels));
    }
    if(this.compact){if(this.list().getRootNode())this.list().paint();}
    else if(this.grid.getRootNode()){this.syncRows(true);this.grid.paint();}
    else this.stale=true;
    this.place();
  }
  /** A sub-view's content height changed: its row or card follows (between 80 px and the declared height). */
  private resizeSubRow(id:string,pixels:number):void{
    const entry=this.mounted.get(id);if(!entry||this.disposed)return;
    // The table sub-row frames the view with the host's padding (6 px above and below).
    const height=Math.max(60,Math.ceil(pixels)+(this.compact?0:12));if(height===entry.height)return;
    entry.height=height;
    if(this.compact){if(this.list().getRootNode())this.list().paint();}else if(this.grid.getRootNode())this.syncRows();
    this.place();
  }
  /**
   * Height this widget needs to show at most `rows` records without scrolling (measured: its frame, header and
   * any horizontal scrollbar, plus the rows); more records scroll. 0 while it is not rendered.
   */
  fitHeight(rows:number):number{
    const root=this.layout.getRootNode() as HTMLElement|undefined,body=root?.querySelector<HTMLElement>(".dhx_grid-body");
    if(!root||!body)return 0;
    const header=body.querySelector<HTMLElement>(".dhx_header-wrapper")?.offsetHeight??0;
    // Suite draws row borders inside a 1 px taller row after the first: a view that fits all its records keeps 2 px
    // spare so that no scrollbar appears for a pixel; a longer one shows exactly `rows` rows and scrolls.
    const count=Math.max(1,this.data.length),fits=count<=rows;
    return root.offsetHeight-body.clientHeight+header+Math.min(rows,count)*this.rowHeight+(fits?2:0);
  }
  get rowPixels():number{return this.rowHeight;}
  private unmount(id:string):void{const entry=this.mounted.get(id);if(!entry)return;this.mounted.delete(id);entry.view.destroy();entry.host.remove();}
  private subviewLayer():HTMLElement{
    if(!this.layer){this.layer=document.createElement("div");this.layer.className="blade-subview-layer";document.body.append(this.layer);}
    return this.layer;
  }
  /**
   * Keeps every mounted nested view over its slot while any is open (one measurement per frame): the layer is
   * clipped to the visible data area (below a sticky table header), a view without a visible slot is hidden.
   */
  private place=():void=>{
    cancelAnimationFrame(this.frame);
    const layer=this.layer;if(!layer||this.disposed)return;
    if(!this.mounted.size){layer.hidden=true;return;}
    const root=this.layout.getRootNode() as HTMLElement|undefined;
    const scroller=this.compact?this.cardScroller():root?.querySelector<HTMLElement>(".dhx_grid-body")??undefined;
    const area=scroller?.isConnected?scroller.getBoundingClientRect():undefined;
    if(!root||!scroller||!area||!area.width||!area.height){layer.hidden=true;}
    else{
      const header=this.compact?0:scroller.querySelector<HTMLElement>(".dhx_header-wrapper")?.offsetHeight??0;
      const box={left:area.left,top:area.top+header,width:scroller.clientWidth,height:Math.max(0,scroller.clientHeight-header)};
      layer.hidden=false;layer.classList.toggle("blade-subview-layer--table",!this.compact);
      // Inside a window the layer stacks just above it; otherwise above the page, below every dialog and popup.
      const frame=root.closest<HTMLElement>(".dhx_window");
      const style=`left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;z-index:${frame?(Number.parseInt(getComputedStyle(frame).zIndex)||0)+1:1}`;
      if(layer.getAttribute("style")!==style)layer.setAttribute("style",style);
      for(const [id,{host}] of this.mounted){
        const target=root.querySelector<HTMLElement>(`[data-blade-subview="${CSS.escape(id)}"]`)?.getBoundingClientRect();
        const next=target&&target.height?`left:${this.compact?target.left-box.left:0}px;top:${target.top-box.top}px;width:${this.compact?target.width:box.width}px;height:${target.height}px`:"display:none";
        if(host.getAttribute("style")!==next)host.setAttribute("style",next);
      }
    }
    this.frame=requestAnimationFrame(this.place);
  };
  setMode(mode:GridMode):void{this.preferred=mode==="cards"||mode==="tiles"?mode:"table";void this.resize();}
  setColumnVisible(id:string,visible:boolean):void{
    if(visible)this.grid.showColumn(alias(id));else this.grid.hideColumn(alias(id));
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
    const mode:GridMode=this.options.table?"table":this.preferred==="tiles"&&this.tilesOffered?"tiles":mobile||this.preferred==="cards"?"cards":"table";
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
    if(!this.compact){const p=this.grid.getRootNode()?this.grid.getScrollState():{x:0,y:0},hit=this.options.subview?this.at(p.y):{index:Math.floor(p.y/rh),offset:p.y%rh};return {id:String(this.rows()[hit.index]?.id??""),offset:hit.offset,...p};}
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
  private syncRows(structure=false):void{
    // A hidden Suite view has no DOM root. Keep its snapshot until it is mounted,
    // rather than asking its collection/selection events to redraw an absent widget.
    const widget=this.compact?this.list():this.grid;
    if(!widget.getRootNode()){this.stale=true;return;}
    this.stale=false;
    const previous=this.shown[this.current];
    const rows=this.data;
    this.index=new Map(rows.map((row,index)=>[String(row.id),index]));
    for(const id of this.expanded)if(!this.index.has(id)||!hasSubview(rows[this.index.get(id)!])){this.expanded.delete(id);this.unmount(id);}
    const rendered=this.compact?rows.map(row=>guard(structuredClone(row))):rows.map((row,index)=>{
      // Guarded first: boolean columns of reserved fields are found under their aliased column id.
      const result=guard({...structuredClone(row),_number:row._number??index+1});
      for(const column of this.grid.config.columns??[])if(column.type==="boolean"&&Object.hasOwn(result,column.id))result[column.id]=result[column.id]===true||String(result[column.id])==="1";
      return result;
    });
    const same=previous.length===rows.length&&previous.every((row,index)=>String(row.id)===String(rows[index].id));
    if(this.compact){
      if(same){for(let i=0;i<rows.length;i++)if(JSON.stringify(previous[i])!==JSON.stringify(rows[i]))widget.data.update(String(rows[i].id),rendered[i]);}
      else{widget.data.removeAll();widget.data.parse(rendered);}
    }else{
      // Open sub-rows follow their record; their spans cover every column from the toggle column on.
      const opened=new Map(rows.filter(row=>this.expanded.has(String(row.id))).map(row=>[String(row.id),this.mounted.get(String(row.id))?.height??120]));
      const table=rendered.flatMap((row,index)=>{const id=String(rows[index].id),height=opened.get(id);return height===undefined?[row]:[row,{id:subRowId(id),[SUBROW]:id,_markable:false,height,revision:rows[index].revision}];});
      for(const id of this.opened.keys())if(!opened.has(id)&&this.grid.getSpan(subRowId(id),SUBROW))this.grid.removeSpan(subRowId(id),SUBROW);
      const reshaped=this.opened.size!==opened.size||[...opened.keys()].some(id=>!this.opened.has(id)),changedHeights=[...opened].some(([id,height])=>this.opened.get(id)!==height);
      this.opened=opened;
      if(same&&!structure&&!reshaped){
        if(changedHeights)for(const [id,height] of opened)widget.data.update(subRowId(id),{height});for(let i=0;i<rows.length;i++)if(JSON.stringify(previous[i])!==JSON.stringify(rows[i])){widget.data.update(String(rows[i].id),rendered[i]);if(opened.has(String(rows[i].id)))widget.data.update(subRowId(String(rows[i].id)),{revision:rows[i].revision,[SUBROW+"_v"]:Date.now()});}}
      else{widget.data.removeAll();widget.data.parse(table);}
      const colspan=(this.grid.config.columns??[]).length;
      for(const id of opened.keys())if(!this.grid.getSpan(subRowId(id),SUBROW))this.grid.addSpan({row:subRowId(id),column:SUBROW,colspan,css:"blade-grid-subrow-span"});
    }
    this.shown[this.current]=structuredClone(rows);
  }

  restore(position:Position,preserve:boolean,selected?:string,switching=false):void{
    const pick=this.options.select!==false;
    this.selected=pick?selected:undefined;
    const list=this.list();
    // A non-selectable list never holds a native selection.
    if(pick&&this.compact){if(list.getRootNode()){if(selected)list.selection.add(selected);else list.selection.remove();}}
    else if(pick&&this.grid.getRootNode()){if(selected)(this.grid.selection as any).setCell(selected);else this.grid.selection.removeCell();}
    const index=this.rows().findIndex(r=>String(r.id)===position.id);
    if(!this.compact&&this.grid.getRootNode())this.grid.scroll(position.x,preserve?(index>=0?this.top(index)+(switching?0:position.offset):position.y):0);
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
        for(const rowId of this.opened.has(id)?[id,subRowId(id)]:[id]){
          if(this.marked.has(id))this.grid.addRowCss(rowId,"blade-grid-row-marked");
          else this.grid.removeRowCss(rowId,"blade-grid-row-marked");
        }
      }
      this.grid.paint();
    }
    for(const list of [this.cards,this.tiles])if(list.getRootNode())list.paint();
    this.options.marked?.([...this.marked]);
  }
  destroy():void{this.disposed=true;cancelAnimationFrame(this.frame);for(const id of [...this.mounted.keys()])this.unmount(id);this.layer?.remove();this.observer.disconnect();this.reattach?.disconnect();this.reattach=undefined;this.listeners.abort();}
}

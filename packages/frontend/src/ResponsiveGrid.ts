import { t } from "./I18n";
import { DataView, Grid, Layout, awaitRedraw } from "@dhtmlx/suite";
import type { ViewDefinition } from "./Workspace";
import { gridHeader } from "./GridHeaders";
import { gridEditor } from "./GridEditing";
import type { Row } from "./Realtime";

import { escape, recordFields, recordCheckbox, recordIcon, optionText} from "./RecordPresentation";
type Position={id?:string;offset:number;x:number;y:number};

/** Native Suite widgets share one bounded data window and action selection. */
export class ResponsiveGrid {
  readonly layout:Layout;
  private grid:Grid;
  private cards:DataView;
  get table():Grid{return this.grid;}
  private compact=false;
  private preferred:"table"|"cards"="table";
  private observer:ResizeObserver;
  private listeners=new AbortController();
  private disposed=false;
  private selected?:string;
  private data:Row[]=[];
  private tableData:Row[]=[];
  private cardData:Row[]=[];
  private marked=new Set<string>();
  private markAnchor?:string;
  private cardColumns=0;
  private resizeEpoch=0;

  constructor(host:HTMLElement,columns:ViewDefinition["columns"],private rows:()=>Row[],select:(id:string)=>void,open:()=>void,private more:(direction:"next"|"previous")=>void,private modeChanged:(cards:boolean,mobile:boolean)=>void,private options:{rowNumbers?:boolean;selection?:boolean;rowSelection?:boolean;fields?:ViewDefinition["columns"];filters?:{name:string;label:string;type?:string;options?:Record<string,string>}[];details?:(id:string)=>void;marked?:(ids:string[])=>void;edit?:(id:string,field:string,anchor:HTMLElement)=>void;idColumn?:boolean}={}){
    const filterDefinitions=new Map((options.filters??[]).map(filter=>[filter.name,filter]));
    this.layout=new Layout(host,{type:"none",css:"blade-grid-views",views:[{id:"table"},{id:"cards"}],activeView:"table"});
    this.grid=new Grid(null,{columns:[...(options.selection?[{id:"_mark",header:[{text:t("Jelölés")}],width:66,sortable:false,htmlEnable:true,template:(_:unknown,row:any)=>row._markable===false?"":`<input type="checkbox" aria-label="${escape(t("Sor jelölése: {id}",{id:row.id}))}" ${this.marked.has(String(row.id))?"checked":""}>`}]:[]),...(options.rowNumbers!==false?[{id:"_number",header:[{text:"#"}],width:56,sortable:false}]:[]),...(options.idColumn===false?[]:[{id:"id",header:[{text:"ID"}],width:80,sortable:false}]),...columns.map(c=>({id:c.id,header:(()=>{const header=gridHeader({...c,filter:filterDefinitions.get(c.id)});return Array.isArray(header)?header:[header];})(),width:c.width,minWidth:c.minWidth??(c.width?undefined:160),maxWidth:c.maxWidth,align:c.align??(c.type==="checkbox"?"center":"left"),autoWidth:!c.width,sortable:false,
      ...gridEditor(c),
      ...(c.type==="checkbox"?{type:"string" as const,editable:false,htmlEnable:true,template:(_:unknown,row:any)=>recordCheckbox(row,c)}:{}),
      ...(c.type!=="checkbox"||!c.editable?c.options&&Object.keys(c.options).length?{template:(value:unknown)=>escape(optionText(c,value))}:{}:{}),
      ...(c.type==="icon"?{htmlEnable:true,template:(value:unknown)=>recordIcon(c,value)}:{}),
    }))],rowCss:row=>((this.grid?.data.getIndex(row.id!)??0)%2===1?"blade-grid-row-alternate":""),rowHeight:40,autoWidth:true,resizable:true,selection:"row",htmlEnable:false});
    this.cards=new DataView(document.createElement("div"),{itemsInRow:1,gap:12,selection:true,keyNavigation:true,css:"blade-grid-cards",template:(row:Row)=>
      `<article class="blade-grid-card${this.marked.has(String(row.id))?" blade-grid-card--marked":""}" data-blade-row="${escape(row.id)}"><div class="blade-grid-card__id">${options.selection&&row._markable!==false?`<input class="blade-card-mark" type="checkbox" aria-label="${escape(t("Sor jelölése: {id}",{id:row.id}))}" ${this.marked.has(String(row.id))?"checked":""}> `:""}${options.idColumn===false?"":`ID · ${escape(row.id)}`}</div>${recordFields(row,(options.fields??columns).map(field=>({...field,editable:columns.find(c=>c.id===field.id)?.editable})),true)}</article>`,
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
    this.grid.events.on("cellClick",(row:any,column:any,event:MouseEvent)=>{
      const id=String(row.id);selected(id);
      if(column.id==="_mark"){this.toggleMark(id);this.markAnchor=id;return;}
    });
    this.grid.events.on("cellDblClick",(row:any,column:any)=>{selected(row.id);if(column.id==="_number"){options.details?.(String(row.id));return;}if(column.id==="_mark"||columns.some(c=>c.id===column.id&&c.type==="checkbox"&&c.editable&&row._editable?.includes(c.id)))return;if(column.editable&&row._editable?.includes(String(column.id)))return;open();});
    this.cards.selection.events.on("afterSelect",(id:string|number)=>selected(id));
    this.cards.events.on("doubleclick",(id:string|number,event:Event)=>{if((event?.target as HTMLElement)?.closest(".blade-card-edit"))return;selected(id);if(options.details)options.details(String(id));else open();});
    this.layout.getCell("table").attach(this.grid);this.layout.getCell("cards").attach(this.cards);
    this.grid.events.on("scroll",(position:{x:number;y:number})=>{
      if(this.compact)return;
      if(position.y>this.rows().length*40-Math.max(400,innerHeight*1.4))this.more("next");
      else if(position.y<120)this.more("previous");
    });
    // Standard DataView has no public scroll event: observe native scrolling,
    // without replacing widget rendering or depending on PRO ScrollView.
    this.layout.getRootNode().addEventListener("scroll",event=>{
      if(!this.compact)return;
      const element=event.target as HTMLElement;
      if(element.scrollTop+element.clientHeight>=element.scrollHeight-400)this.more("next");
      else if(element.scrollTop<120)this.more("previous");
    },{capture:true,signal:this.listeners.signal});
    const root=this.layout.getRootNode();
    root.addEventListener("mousedown",event=>{
      if(event.detail>1&&!(event.target as HTMLElement).closest("input,textarea,select"))event.preventDefault();
    },{signal:this.listeners.signal});
    const edit=(event:Event)=>{
      const anchor=(event.target as HTMLElement).closest<HTMLElement>(".blade-card-edit");
      const id=anchor?.closest<HTMLElement>("[data-blade-row]")?.dataset.bladeRow;
      if(!anchor||!id)return;
      event.preventDefault();event.stopPropagation();selected(id);options.edit?.(id,anchor.dataset.bladeField!,anchor);
    };
    root.addEventListener("click",event=>{
      if(!options.rowSelection)return;
      const mouse=event as MouseEvent;
      if((event.target as HTMLElement).closest("input,textarea,select,.blade-card-edit"))return;
      const target=event.target as HTMLElement;
      const card=target.closest<HTMLElement>("[data-blade-row]");
      const row=target.closest<HTMLElement>(".dhx_grid-row");
      const id=card?.dataset.bladeRow??row?.getAttribute("data-dhx-id")??row?.dataset.dhxId;
      if(!id)return;
      event.preventDefault();event.stopPropagation();selected(id);markRow(id,mouse);
    },{signal:this.listeners.signal});
    root.addEventListener("click",edit,{signal:this.listeners.signal});
    root.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")edit(event);},{signal:this.listeners.signal});
    this.observer=new ResizeObserver(()=>void this.resize());this.observer.observe(this.layout.getRootNode());
    window.addEventListener("resize",()=>void this.resize(),{signal:this.listeners.signal});
  }
  private cardScroller():HTMLElement|null{const root=this.cards.getRootNode();return root?.querySelector<HTMLElement>(".dhx_dataview")??root??null;}
  setMode(mode:"table"|"cards"):void{this.preferred=mode;void this.resize();}
  setColumnVisible(id:string,visible:boolean):void{
    if(visible)this.grid.showColumn(id);else this.grid.hideColumn(id);
  }
  private async resize():Promise<void>{
    // A host in an inactive Layout view has no DOM until it is shown again.
    const root=this.layout.getRootNode();
    if(this.disposed||!root)return;
    const count=Math.max(1,Math.floor((root.clientWidth-24)/340));
    const columnsChanged=count!==this.cardColumns;
    if(columnsChanged){this.cardColumns=count;this.cards.config.itemsInRow=count;}
    const mobile=innerWidth<768;
    const compact=mobile||this.preferred==="cards";
    this.modeChanged(compact,mobile);
    if(compact===this.compact){if(compact&&columnsChanged&&this.cards.getRootNode())this.cards.paint();return;}
    const epoch=++this.resizeEpoch;
    const position=this.capture();this.compact=compact;
    this.layout.getCell(compact?"cards":"table").show();
    await awaitRedraw();
    if(this.disposed||epoch!==this.resizeEpoch)return;
    this.syncRows();
    if(compact&&this.cards.getRootNode())this.cards.paint();
    await awaitRedraw();
    if(!this.disposed&&epoch===this.resizeEpoch)this.restore(position,true,this.selected,true);
  }
  capture():Position{
    if(!this.compact){const p=this.grid.getRootNode()?this.grid.getScrollState():{x:0,y:0};return {id:String(this.rows()[Math.floor(p.y/40)]?.id??""),offset:p.y%40,...p};}
    const root=this.cardScroller();if(!root)return {offset:0,x:0,y:0};const top=root.getBoundingClientRect().top;
    const card=Array.from(root.querySelectorAll<HTMLElement>("[data-blade-row]")).find(e=>e.getBoundingClientRect().bottom>top);
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
    const widget=this.compact?this.cards:this.grid;
    if(!widget.getRootNode())return;
    const previous=this.compact?this.cardData:this.tableData;
    const rows=this.data;
    const rendered=this.compact?structuredClone(rows):rows.map((row,index)=>{
      const result:Row={...structuredClone(row),_number:row._number??index+1};
      for(const column of this.grid.config.columns??[])if(column.type==="boolean"&&Object.hasOwn(result,column.id))result[column.id]=result[column.id]===true||String(result[column.id])==="1";
      return result;
    });
    const same=previous.length===rows.length&&previous.every((row,index)=>String(row.id)===String(rows[index].id));
    if(same){for(let i=0;i<rows.length;i++)if(JSON.stringify(previous[i])!==JSON.stringify(rows[i]))widget.data.update(String(rows[i].id),rendered[i]);}
    else{widget.data.removeAll();widget.data.parse(rendered);}
    if(this.compact)this.cardData=structuredClone(rows);else this.tableData=structuredClone(rows);
  }

  restore(position:Position,preserve:boolean,selected?:string,switching=false):void{
    this.selected=selected;
    if(this.compact){if(this.cards.getRootNode()){if(selected)this.cards.selection.add(selected);else this.cards.selection.remove();}}
    else if(this.grid.getRootNode()){if(selected)(this.grid.selection as any).setCell(selected);else this.grid.selection.removeCell();}
    const index=this.rows().findIndex(r=>String(r.id)===position.id);
    if(!this.compact&&this.grid.getRootNode())this.grid.scroll(position.x,preserve?(index>=0?index*40+(switching?0:position.offset):position.y):0);
    else if(this.compact){
      const root=this.cardScroller();if(!root)return;const card=Array.from(root.querySelectorAll<HTMLElement>("[data-blade-row]")).find(e=>e.dataset.bladeRow===position.id);
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
    if(this.cards.getRootNode())this.cards.paint();this.options.marked?.([...this.marked]);
  }
  destroy():void{this.disposed=true;this.observer.disconnect();this.listeners.abort();}
}

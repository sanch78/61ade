import { DataView, Grid, Layout, awaitRedraw } from "@dhtmlx/suite";
import type { ViewDefinition } from "./Workspace";
import { gridEditor } from "./GridEditing";
import type { Row } from "./Realtime";

import { escape, recordFields } from "./RecordPresentation";
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
  private marked=new Set<string>();
  private cardColumns=0;
  private resizeEpoch=0;

  constructor(host:HTMLElement,columns:ViewDefinition["columns"],private rows:()=>Row[],select:(id:string)=>void,open:()=>void,private more:(direction:"next"|"previous")=>void,private modeChanged:(cards:boolean,mobile:boolean)=>void,private options:{rowNumbers?:boolean;selection?:boolean;fields?:ViewDefinition["columns"];details?:(id:string)=>void;marked?:(ids:string[])=>void}={}){
    this.layout=new Layout(host,{type:"none",css:"vapa-grid-views",views:[{id:"table"},{id:"cards"}],activeView:"table"});
    this.grid=new Grid(null,{columns:[...(options.selection?[{id:"_mark",header:[{text:"Jelölés"}],width:66,sortable:false,htmlEnable:true,template:(_:unknown,row:any)=>`<input type="checkbox" aria-label="Sor jelölése: ${escape(row.id)}" ${this.marked.has(String(row.id))?"checked":""}>`}]:[]),...(options.rowNumbers!==false?[{id:"_number",header:[{text:"#"}],width:56,sortable:false}]:[]),{id:"id",header:[{text:"ID"}],width:80,sortable:false},...columns.map(c=>({id:c.id,header:[{text:escape(c.header)}],width:c.width,minWidth:c.minWidth??(c.width?undefined:160),maxWidth:c.maxWidth,align:c.align??(c.type==="checkbox"?"center":"left"),autoWidth:!c.width,sortable:false,
      ...gridEditor(c),
      ...(c.type!=="checkbox"||!c.editable?c.options&&Object.keys(c.options).length?{template:(value:unknown)=>escape(c.options?.[String(value)]??String(value??""))}:{}:{}),
    }))],rowHeight:40,autoWidth:true,selection:"row",htmlEnable:false});
    this.cards=new DataView(document.createElement("div"),{itemsInRow:1,gap:12,selection:true,keyNavigation:true,css:"vapa-grid-cards",template:(row:Row)=>
      `<article class="vapa-grid-card" data-vapa-row="${escape(row.id)}"><div class="vapa-grid-card__id">${options.selection?`<input class="vapa-card-mark" type="checkbox" aria-label="Sor jelölése: ${escape(row.id)}" ${this.marked.has(String(row.id))?"checked":""}> `:""}ID · ${escape(row.id)}</div>${recordFields(row,options.fields??columns)}</article>`,
      eventHandlers:{onclick:{"vapa-card-mark":(_event:Event,id:string|number)=>this.toggleMark(String(id))}}});
    const selected=(id:string|number)=>{this.selected=String(id);select(this.selected);};
    this.grid.events.on("cellClick",(row:any,column:any)=>{selected(row.id);if(column.id==="_mark")this.toggleMark(String(row.id));});
    this.grid.events.on("cellDblClick",(row:any,column:any)=>{selected(row.id);if(column.id==="_number"){options.details?.(String(row.id));return;}if(column.id==="_mark")return;if(column.editable&&row._editable?.includes(String(column.id)))return;open();});
    this.cards.selection.events.on("afterSelect",(id:string|number)=>selected(id));
    this.cards.events.on("doubleclick",(id:string|number)=>{selected(id);if(options.details)options.details(String(id));else open();});
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
    this.observer=new ResizeObserver(()=>void this.resize());this.observer.observe(this.layout.getRootNode());
    window.addEventListener("resize",()=>void this.resize(),{signal:this.listeners.signal});
  }
  private cardScroller():HTMLElement|null{const root=this.cards.getRootNode();return root?.querySelector<HTMLElement>(".dhx_dataview")??root??null;}
  setMode(mode:"table"|"cards"):void{this.preferred=mode;void this.resize();}
  private async resize():Promise<void>{
    if(this.disposed)return;
    const count=Math.max(1,Math.floor((this.layout.getRootNode().clientWidth-24)/340));
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
    if(compact&&this.cards.getRootNode()){this.cards.paint();await awaitRedraw();}
    if(!this.disposed&&epoch===this.resizeEpoch)this.restore(position,true,this.selected);
  }
  capture():Position{
    if(!this.compact){const p=this.grid.getScrollState();return {id:String(this.rows()[Math.floor(p.y/40)]?.id??""),offset:p.y%40,...p};}
    const root=this.cardScroller();if(!root)return {offset:0,x:0,y:0};const top=root.getBoundingClientRect().top;
    const card=Array.from(root.querySelectorAll<HTMLElement>("[data-vapa-row]")).find(e=>e.getBoundingClientRect().bottom>top);
    return {id:card?.dataset.vapaRow,offset:card?top-card.getBoundingClientRect().top:0,x:0,y:root.scrollTop};
  }
  setRows(rows:Row[]):void{
    const available=new Set(rows.map(row=>String(row.id)));
    for(const id of this.marked)if(!available.has(id))this.marked.delete(id);
    this.options.marked?.([...this.marked]);
    const gridRows=rows.map((row,index)=>{const result:Row={...structuredClone(row),_number:row._number??index+1};for(const column of this.grid.config.columns??[])if(column.type==="boolean"&&Object.hasOwn(result,column.id))result[column.id]=result[column.id]===true||String(result[column.id])==="1";return result;});
    const same=this.data.length===rows.length&&this.data.every((r,i)=>String(r.id)===String(rows[i].id));
    if(same){for(let i=0;i<rows.length;i++)if(JSON.stringify(this.data[i])!==JSON.stringify(rows[i])){this.grid.data.update(String(rows[i].id),gridRows[i]);this.cards.data.update(String(rows[i].id),rows[i]);}}
    else{this.grid.data.removeAll();this.cards.data.removeAll();this.grid.data.parse(gridRows);this.cards.data.parse(structuredClone(rows));}
    this.data=structuredClone(rows);
  }
  restore(position:Position,preserve:boolean,selected?:string):void{
    this.selected=selected;
    if(this.compact){if(this.cards.getRootNode()){if(selected)this.cards.selection.add(selected);else this.cards.selection.remove();}}
    else{if(selected)(this.grid.selection as any).setCell(selected);else this.grid.selection.removeCell();}
    const index=this.rows().findIndex(r=>String(r.id)===position.id);
    if(!this.compact)this.grid.scroll(position.x,preserve?(index>=0?index*40+position.offset:position.y):0);
    else{
      const root=this.cardScroller();if(!root)return;const card=Array.from(root.querySelectorAll<HTMLElement>("[data-vapa-row]")).find(e=>e.dataset.vapaRow===position.id);
      root.scrollTop=preserve?(card?root.scrollTop+card.getBoundingClientRect().top-root.getBoundingClientRect().top+position.offset:position.y):0;
    }
  }
  get markedIds():string[]{return [...this.marked];}
  clearMarks():void{this.marked.clear();this.refreshMarks();}
  private toggleMark(id:string):void{if(this.marked.has(id))this.marked.delete(id);else this.marked.add(id);this.refreshMarks();}
  private refreshMarks():void{
    if(this.grid.getRootNode())this.grid.paint();if(this.cards.getRootNode())this.cards.paint();this.options.marked?.([...this.marked]);
  }
  destroy():void{this.disposed=true;this.observer.disconnect();this.listeners.abort();}
}

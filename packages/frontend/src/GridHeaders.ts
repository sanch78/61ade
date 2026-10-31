import { t } from "./I18n";
import { type Grid, awaitRedraw } from "@dhtmlx/suite";
export type Sort={field:string;direction:"asc"|"desc"};
export type Filter={name:string;label:string;type?:string;options?:Record<string,string>};
type Column={id:string;header:string;type?:string;editable?:boolean;filter?:Filter};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** The leading "all" item clears an option filter; DHTMLX needs a non-empty id, so it maps back to the empty value. */
const ALL="blade-filter-all";
const filterOptions=(filter:Filter)=>[{id:ALL,value:t("Mind")},...Object.entries(filter.options??{}).map(([id,value])=>({id,value}))];
const filterHeader=(column:Column):any=>{
  const filter=column.filter;if(!filter)return undefined;
  if(filter.type==="select"||filter.type==="checkbox"){
    // Items carry the visible label as value, which DHTMLX shows in the input; an exact label keeps every option listed for reselection.
    const labels=[t("Mind"),...Object.values(filter.options??{})];
    return {content:"comboFilter",filterConfig:{data:filterOptions(filter),filter:(item:any,input:string)=>!input||labels.includes(input)||String(item.value).toLowerCase().includes(input.toLowerCase())}};
  }
  return {content:"inputFilter"};
};
export function gridHeader(column:Column,sort?:Sort):any {
  const css=[column.editable&&column.type!=="checkbox"?"blade-grid-editable":"",sort?.field===column.id?`blade-grid-sort-${sort.direction}`:""].filter(Boolean).join(" ");
  const hint=column.editable?(column.type==="checkbox"?t(" — Szerkeszthető kattintással"):t(" — Szerkeszthető dupla kattintással")):"";
  const header={text:escape(column.header),css,tooltip:true,tooltipTemplate:()=>escape(column.header+hint)};
  const filter=filterHeader(column);
  return filter?[filter,header]:header;
}
/** Native header events request SQL ordering; loaded windows are never sorted locally. */
export class GridHeaders {
  private sort:Sort={field:"id",direction:"desc"};
  private disposed=false;
  private columns:Column[];
  private filterColumns=new Set<string>();
  private filterValues:Record<string,string>={};
  private boundCombos=new WeakSet<object>();
  constructor(private grid:Grid,columns:Column[],private sortable:string[],change:(sort:Sort)=>void,filters:Filter[]=[],private filterChange?:(field:string,value:string)=>void){
    const definitions=new Map(filters.map(filter=>[filter.name,filter]));
    this.columns=[{id:"id",header:"ID"},...columns.map(column=>({...column,filter:definitions.get(column.id)}))];
    for(const filter of filters)this.filterColumns.add(filter.name);
    grid.events.on("beforeSort",(column:any)=>{
      if(!this.disposed&&sortable.includes(String(column.id)))change({field:String(column.id),direction:this.sort.field===column.id&&this.sort.direction==="asc"?"desc":"asc"});
      return false;
    });
    grid.events.on("beforeFilter",(_value:any,column:any)=>!this.disposed&&this.filterColumns.has(String(column))?false:undefined);
    grid.events.on("filterChange",(value:any,column:any,_content:any,silent?:boolean)=>{
      const field=String(column);if(this.disposed||!this.filterColumns.has(field))return;
      const normalized=Array.isArray(value)?String(value[0]??""):value==null?"":String(value);
      const definition=this.columns.find(item=>item.id===field)?.filter;
      const canonical=definition&&(definition.type==="select"||definition.type==="checkbox")
        ?normalized===ALL||normalized===t("Mind")?"":Object.hasOwn(definition.options??{},normalized)?normalized:Object.entries(definition.options??{}).find(([,label])=>label===normalized)?.[0]??normalized
        :normalized;
      this.filterValues[field]=canonical;
      if(!silent)this.filterChange?.(field,canonical);
      if(!silent&&definition&&(definition.type==="select"||definition.type==="checkbox")){
        this.restoreFilter(field,canonical);
        setTimeout(()=>{if(!this.disposed)this.restoreFilter(field,canonical);},50);
      }
    });
    this.setSort(this.sort);
  }
  setSort(sort:Sort):void{
    this.sort=sort;
    for(const column of this.columns){const config=this.grid.getColumn(column.id);if(config){config.sortable=this.sortable.includes(column.id);const header=gridHeader(column,sort);config.header=Array.isArray(header)?header:[header];}}
    this.grid.paint();
    this.decorate();
  }
  setFilterValues(filters:Record<string,string>):void{
    this.filterValues={...filters};
    for(const field of this.filterColumns){
      const value=this.filterValues[field]??"";
      const restore=()=>{if(this.disposed)return;try{this.restoreFilter(field,value);}catch{}};
      restore();setTimeout(restore,500);
    }
  }
  /** ComboFilter.setValue matches item values, so option filters are restored by their visible label. */
  private restoreFilter(field:string,value:string):void{
    const definition=this.columns.find(item=>item.id===field)?.filter;
    const label=definition?.options?.[value]??value;
    this.syncFilterOptions(field);this.grid.getHeaderFilter(field)?.setValue(label,true);this.setFilterDisplay(field,label);
  }
  private syncFilterOptions(field:string):void{
    const definition=this.columns.find(item=>item.id===field)?.filter;
    if(!definition||!((definition.type==="select")||(definition.type==="checkbox")))return;
    const filter:any=this.grid.getHeaderFilter(field);const combo=filter?.getFilter?.();
    if(!combo?.data)return;
    // Adding only the missing items keeps the current selection; removing it would clear the filter.
    filterOptions(definition).forEach((item,index)=>{if(!combo.data.find((existing:any)=>existing.value===item.value))combo.data.add(item,index);});
  }
  /** DHTMLX refills an idle picker from the loaded cells' labels; reopening restores the declared options and the "all" item. */
  private bindFilterOptions():void{
    for(const field of this.filterColumns){
      const definition=this.columns.find(item=>item.id===field)?.filter;
      if(!definition||!((definition.type==="select")||(definition.type==="checkbox")))continue;
      const combo:any=(this.grid.getHeaderFilter(field) as any)?.getFilter?.();
      if(!combo?.popup||this.boundCombos.has(combo))continue;
      this.boundCombos.add(combo);
      combo.popup.events.on("beforeShow",()=>{if(!this.disposed)this.syncFilterOptions(field);});
    }
  }
  private setFilterDisplay(field:string,value:string):void{
    if(!this.grid.getRootNode())return;
    const input=this.grid.getRootNode()?.querySelector< HTMLInputElement>(`[data-dhx-id="${field}"] .dhx_combobox-input`);
    if(input)input.value=value;
  }
  /** Accessible header state; the workspace reapplies it after data renders, which may rebuild header cells. */
  decorate():void{
    void awaitRedraw().then(()=>{
      if(this.disposed)return;
      this.bindFilterOptions();
      for(const node of Array.from(this.grid.getRootNode()?.querySelectorAll<HTMLElement>('[role="columnheader"][data-dhx-id]')??[])){
        const id=node.getAttribute("data-dhx-id");
        if(this.columns.find(c=>c.id===id)?.editable)node.setAttribute("aria-description",t("Szerkeszthető mező"));
        if(id&&this.sortable.includes(id))node.setAttribute("aria-sort",id===this.sort.field?(this.sort.direction==="asc"?"ascending":"descending"):"none");
      }
    });
  }
  destroy():void{this.disposed=true;}
}

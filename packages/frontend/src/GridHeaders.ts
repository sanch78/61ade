import { t } from "./I18n";
import { type Grid, awaitRedraw } from "@dhtmlx/suite";
export type Sort={field:string;direction:"asc"|"desc"};
export type Filter={name:string;label:string;type?:string;options?:Record<string,string>};
type Column={id:string;header:string;type?:string;editable?:boolean;filter?:Filter};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/**
 * The leading "all" item clears an option filter (no condition). DHTMLX needs non-empty ids, so a declared option
 * whose value is empty (for example "no parent") gets its own id and maps back to the empty value, a real condition.
 */
const ALL="blade-filter-all",EMPTY="blade-filter-empty";
const filterOptions=(filter:Filter)=>[{id:ALL,value:t("Mind")},...Object.entries(filter.options??{}).map(([id,value])=>({id:id===""?EMPTY:id,value}))];
const choice=(filter?:Filter):filter is Filter=>filter?.type==="select"||filter?.type==="checkbox";
const filterHeader=(column:Column):any=>{
  const filter=column.filter;if(!filter)return undefined;
  if(choice(filter)){
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
  /** Active conditions by field; an absent field has none, an empty string is the condition "empty value". */
  private filterValues:Record<string,string>={};
  private boundCombos=new WeakSet<object>();
  /** Set while the list writes a filter's value; DHTMLX's own change events from that write are no user choice. */
  private restoring=false;
  constructor(private grid:Grid,columns:Column[],private sortable:string[],change:(sort:Sort)=>void,filters:Filter[]=[],private filterChange?:(field:string,value:string|undefined)=>void){
    const definitions=new Map(filters.map(filter=>[filter.name,filter]));
    this.columns=[{id:"id",header:"ID"},...columns.map(column=>({...column,filter:definitions.get(column.id)}))];
    for(const filter of filters)this.filterColumns.add(filter.name);
    grid.events.on("beforeSort",(column:any)=>{
      if(!this.disposed&&sortable.includes(String(column.id)))change({field:String(column.id),direction:this.sort.field===column.id&&this.sort.direction==="asc"?"desc":"asc"});
      return false;
    });
    grid.events.on("beforeFilter",(_value:any,column:any)=>!this.disposed&&this.filterColumns.has(String(column))?false:undefined);
    grid.events.on("filterChange",(value:any,column:any,_content:any,silent?:boolean)=>{
      const field=String(column);if(this.disposed||this.restoring||!this.filterColumns.has(field))return;
      const normalized=Array.isArray(value)?String(value[0]??""):value==null?"":String(value);
      const definition=this.columns.find(item=>item.id===field)?.filter;
      // A cleared control, `Mind` or an empty text is no condition; only the empty option's item filters for "".
      const canonical=normalized===""?undefined:choice(definition)
        ?normalized===ALL||normalized===t("Mind")?undefined:normalized===EMPTY?"":Object.hasOwn(definition.options??{},normalized)?normalized:Object.entries(definition.options??{}).find(([,label])=>label===normalized)?.[0]??normalized
        :normalized;
      if(canonical===undefined)delete this.filterValues[field];else this.filterValues[field]=canonical;
      if(!silent)this.filterChange?.(field,canonical);
      if(!silent&&choice(definition)){
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
      const value=Object.hasOwn(this.filterValues,field)?this.filterValues[field]:undefined;
      const restore=()=>{if(this.disposed)return;try{this.restoreFilter(field,value);}catch{}};
      restore();setTimeout(restore,500);
    }
  }
  /**
   * ComboFilter.setValue matches item values, so option filters are restored by their visible label. No condition
   * clears the control: setValue("") would select DHTMLX's own item of empty cells, and the picker clears an empty
   * value when it next opens, which loses that first choice. `clear` acts only on a set value: a silent clear of an
   * empty control would leave the filter silent and swallow the next choice.
   */
  private restoreFilter(field:string,value:string|undefined):void{
    const definition=this.columns.find(item=>item.id===field)?.filter;
    const label=value===undefined?undefined:definition?.options?.[value]??value;
    this.syncFilterOptions(field);
    const filter=this.grid.getHeaderFilter(field);
    this.restoring=true;try{if(label===undefined)filter?.clear(true);else filter?.setValue(label,true);}finally{this.restoring=false;}
    this.setFilterDisplay(field,label??"");
  }
  private syncFilterOptions(field:string):void{
    const definition=this.columns.find(item=>item.id===field)?.filter;
    if(!choice(definition))return;
    const filter:any=this.grid.getHeaderFilter(field);const combo=filter?.getFilter?.();
    if(!combo?.data)return;
    // Adding only the missing items keeps the current selection; removing it would clear the filter.
    filterOptions(definition).forEach((item,index)=>{if(!combo.data.find((existing:any)=>existing.value===item.value))combo.data.add(item,index);});
  }
  /** DHTMLX refills an idle picker from the loaded cells' labels; reopening restores the declared options and the "all" item. */
  private bindFilterOptions():void{
    for(const field of this.filterColumns){
      const definition=this.columns.find(item=>item.id===field)?.filter;
      if(!choice(definition))continue;
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
        // A header filter's input is named after its column (Suite renders it unlabelled).
        const column=this.columns.find(c=>c.id===id),filter=node.querySelector<HTMLInputElement>("input");
        if(column&&filter)filter.setAttribute("aria-label",t("Szűrés: {column}",{column:column.header}));
      }
    });
  }
  destroy():void{this.disposed=true;}
}

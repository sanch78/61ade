import { type Grid, awaitRedraw } from "@dhtmlx/suite";
export type Sort={field:string;direction:"asc"|"desc"};
type Column={id:string;header:string;type?:string;editable?:boolean};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function gridHeader(column:Column,sort?:Sort):any {
  const css=[column.editable?"vapa-grid-editable":"",sort?.field===column.id?`vapa-grid-sort-${sort.direction}`:""].filter(Boolean).join(" ");
  const hint=column.editable?(column.type==="checkbox"?" — Szerkeszthető kattintással":" — Szerkeszthető dupla kattintással"):"";
  return {text:escape(column.header),css,tooltip:true,tooltipTemplate:()=>escape(column.header+hint)};
}
/** Native header events request SQL ordering; loaded windows are never sorted locally. */
export class GridHeaders {
  private sort:Sort={field:"id",direction:"desc"};
  private disposed=false;
  private columns:Column[];
  constructor(private grid:Grid,columns:Column[],private sortable:string[],change:(sort:Sort)=>void){
    this.columns=[{id:"id",header:"ID"},...columns];
    grid.events.on("beforeSort",(column:any)=>{
      if(!this.disposed&&sortable.includes(String(column.id)))change({field:String(column.id),direction:this.sort.field===column.id&&this.sort.direction==="asc"?"desc":"asc"});
      return false;
    });
    this.setSort(this.sort);
  }
  setSort(sort:Sort):void{
    this.sort=sort;
    for(const column of this.columns){const config=this.grid.getColumn(column.id);if(config)config.header=[gridHeader(column,sort)];}
    this.grid.paint();
    void awaitRedraw().then(()=>{
      if(this.disposed)return;
      for(const node of Array.from(this.grid.getRootNode().querySelectorAll<HTMLElement>('[role="columnheader"][data-dhx-id]'))){
        const id=node.getAttribute("data-dhx-id");
        if(this.columns.find(c=>c.id===id)?.editable)node.setAttribute("aria-description","Szerkeszthető mező");
        if(id&&this.sortable.includes(id))node.setAttribute("aria-sort",id===this.sort.field?(this.sort.direction==="asc"?"ascending":"descending"):"none");
      }
    });
  }
  destroy():void{this.disposed=true;}
}

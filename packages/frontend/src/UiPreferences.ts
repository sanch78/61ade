import type { Grid, Layout } from "@dhtmlx/suite";
import type { Sort } from "./GridHeaders";

type Region={id?:string;rows?:Region[];cols?:Region[];width?:number;height?:number;minWidth?:number;collapsable?:boolean;collapsed?:boolean};
type Preferences={mode?:"table"|"cards";sort?:Sort;columns?:{id:string;width:number}[];regions?:Record<string,{width?:number;height?:number;collapsed?:boolean}>};
const size=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=40&&value<=10000;
const pixels=(value:unknown):number|undefined=>{
  const numeric=typeof value==="string"&&/^\d+(\.\d+)?px$/.test(value)?Number.parseFloat(value):value;
  return size(numeric)?numeric:undefined;
};

/** Only presentation preferences are stored; definitions and ACL remain authoritative. */
export class UiPreferences {
  private state:Preferences={};
  private key:string;
  constructor(user:string,resource:string){
    this.key="vapa-ui:1:"+JSON.stringify([location.pathname,user,resource]);
    try{
      const value=JSON.parse(localStorage.getItem(this.key)??"{}");
      if(value&&typeof value==="object"&&!Array.isArray(value))this.state=value;
    }catch{}
  }
  private save():void{try{localStorage.setItem(this.key,JSON.stringify(this.state));}catch{}}
  get mode():"table"|"cards"{return this.state.mode==="cards"?"cards":"table";}
  setMode(mode:"table"|"cards"):void{this.state.mode=mode;this.save();}
  sort(allowed:string[]):Sort|undefined{
    const sort=this.state.sort;
    return sort&&allowed.includes(sort.field)&&(sort.direction==="asc"||sort.direction==="desc")?sort:undefined;
  }
  setSort(sort:Sort):void{this.state.sort=sort;this.save();}
  layoutTree<T extends Region>(tree:T):T{
    const visit=(node:Region):Region=>{
      const saved=node.id?this.state.regions?.[node.id]:undefined;
      return {...node,
        ...(saved&&node.width!==undefined&&size(saved.width)?{width:Math.max(node.minWidth??40,Math.min(saved.width,Math.max(160,innerWidth-160)))}:{}),
        ...(saved&&node.height!==undefined&&size(saved.height)?{height:Math.min(saved.height,Math.max(80,innerHeight-160))}:{}),
        ...(node.id!=="form"&&node.collapsable&&typeof saved?.collapsed==="boolean"?{collapsed:saved.collapsed}:{}),
        ...(node.rows?{rows:node.rows.map(visit)}:{}),...(node.cols?{cols:node.cols.map(visit)}:{})};
    };
    return visit(tree) as T;
  }
  bindLayout(layout:Layout,tree:Region):void{
    const nodes:Region[]=[];
    const visit=(node:Region)=>{if(node.id)nodes.push({...node});node.rows?.forEach(visit);node.cols?.forEach(visit);};visit(tree);
    const save=(id:string,collapse=false)=>{
      const node=nodes.find(node=>node.id===id);if(!node)return;
      const config=layout.getCell(id).config;
      const width=pixels(config.width),height=pixels(config.height);
      const previous=this.state.regions?.[id]??{};
      const region={...previous,
        ...(!collapse&&node.width!==undefined&&width!==undefined?{width}:{}),
        ...(!collapse&&node.height!==undefined&&height!==undefined?{height}:{}),
        ...(collapse&&id!=="form"?{collapsed:config.collapsed===true}:{})};
      this.state.regions={...this.state.regions,[id]:region};this.save();
    };
    layout.getRootNode().addEventListener("dblclick",event=>{
      const grip=(event.target as HTMLElement).closest<HTMLElement>(".dhx_layout-resizer");
      if(!grip)return;
      const before=grip.previousElementSibling as HTMLElement|null;
      const after=grip.nextElementSibling as HTMLElement|null;
      const dimension=grip.classList.contains("dhx_layout-resizer--x")?"width":"height";
      for(const element of [before,after]){
        const id=element?.dataset.cellId;
        const original=nodes.find(node=>node.id===id);
        if(!id||!original)continue;
        const config=layout.getCell(id).config;
        if(original[dimension]!==undefined)config[dimension]=original[dimension];else delete config[dimension];
        if(this.state.regions?.[id])delete this.state.regions[id][dimension];
      }
      event.preventDefault();this.save();layout.paint();
    });
    layout.events.on("resize",id=>save(id));
    layout.events.on("afterCollapse",id=>save(id,true));
    layout.events.on("afterExpand",id=>save(id,true));
  }
  bindGrid(grid:Grid):void{
    if(Array.isArray(this.state.columns))for(const saved of this.state.columns){
      if(!saved||typeof saved.id!=="string"||!size(saved.width))continue;
      const column=grid.getColumn(saved.id);if(!column)continue;
      column.width=Math.max(column.minWidth??40,Math.min(saved.width,column.maxWidth??10000));column.autoWidth=false;
    }
    grid.setColumns(grid.config.columns??[]);
    grid.events.on("afterResizeEnd",()=>{
      this.state.columns=(grid.config.columns??[]).filter(column=>size(column.width)).map(column=>({id:String(column.id),width:column.width as number}));this.save();
    });
  }
}

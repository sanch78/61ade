import { Layout } from "@dhtmlx/suite";
import type { Accordion as AccordionApi, LayoutCell, Mountable, PageLayout as PageLayoutApi, PageLayoutEvents, PageLayoutOptions, PageRegion, Tabs as TabsApi } from "../../api/types";
import { attachContent } from "../../api/services";
import { UiPreferences } from "../../UiPreferences";
import { Component } from "../list/component";
import { Accordion } from "./Accordion";
import { Tabs } from "./Tabs";

const REGION=/^[a-z][a-z0-9_-]{0,63}$/;
const KEYS=new Set(["id","header","rows","cols","tabs","accordion","multiple","open","width","height","minWidth","minHeight","resizable","collapsable","collapsed"]);
const TAB_BRANCH=new Set(["tabs","width","height","minWidth","minHeight","resizable"]);
const ACCORDION_BRANCH=new Set(["accordion","multiple","width","height","minWidth","minHeight","resizable"]);
const BRANCHES=["rows","cols","tabs","accordion"] as const;

/**
 * The declared panel tree of a page, checked like a list view's layout (`Blade\Feature\ViewLayout`): at most 6
 * levels and 30 nodes; a leaf has a unique region id (not `blade-…`, reserved for the framework), a branch `rows`,
 * `cols`, `tabs` or `accordion` and no id; sizes are integers from 40 to 3000, flags booleans, a header plain text of
 * at most 150 characters. A `tabs` branch takes the sizes and `resizable` only and holds 1–12 leaves with an id and a
 * `header` (the tab's label) and nothing else. An `accordion` branch takes the sizes, `resizable` and `multiple` and
 * holds 1–12 leaves with an id, a `header` (the section's label) and optionally `open` (at most one without
 * `multiple`). Returns the region ids and the collapsible ones; throws `TypeError`.
 */
function regions(tree:unknown):{ids:Set<string>;collapsable:Set<string>}{
  const ids=new Set<string>(),collapsable=new Set<string>();let nodes=0;
  const fail=(reason:string):never=>{throw new TypeError(`61ade: PageLayout: ${reason}.`);};
  const visit=(node:unknown,depth:number,parent?:"tabs"|"accordion"):void=>{
    if(!node||typeof node!=="object"||Array.isArray(node))fail("a region is an object");
    if(depth>6||++nodes>30)fail("the layout is too complex (6 levels, 30 regions)");
    const region=node as Record<string,unknown>;
    for(const [key,value] of Object.entries(region)){
      if(!KEYS.has(key))fail(`unsupported option "${key}"`);
      if(["resizable","collapsable","collapsed","multiple","open"].includes(key)&&typeof value!=="boolean")fail(`"${key}" is a boolean`);
      if(["width","height","minWidth","minHeight"].includes(key)&&!(Number.isInteger(value)&&(value as number)>=40&&(value as number)<=3000))fail(`"${key}" is an integer from 40 to 3000`);
      if(key==="header"&&(typeof value!=="string"||value.length>150))fail("a header is text of at most 150 characters");
    }
    const branches=BRANCHES.filter(key=>region[key]!==undefined);
    if(parent==="tabs"&&(branches.length||Object.keys(region).some(key=>key!=="id"&&key!=="header")||typeof region.header!=="string"||!region.header.trim()||region.header.length>80))
      fail("a tab is a leaf with an id and a header (its label, at most 80 characters) only");
    if(parent==="accordion"&&(branches.length||Object.keys(region).some(key=>key!=="id"&&key!=="header"&&key!=="open")||typeof region.header!=="string"||!region.header.trim()||region.header.length>80))
      fail("a section is a leaf with an id, a header (its label, at most 80 characters) and optionally open only");
    if(parent!=="accordion"&&region.open!==undefined)fail('"open" belongs to a section of an accordion branch');
    if(region.multiple!==undefined&&region.accordion===undefined)fail('"multiple" belongs to an accordion branch');
    if(branches.length){
      const children=region[branches[0]];
      if(region.id!==undefined||branches.length>1||!Array.isArray(children)||!children.length)fail("a branch has either rows, cols, tabs or accordion and no id");
      if(branches[0]==="tabs"){
        if(Object.keys(region).some(key=>!TAB_BRANCH.has(key)))fail("a tabs branch takes sizes and resizable only");
        if((children as unknown[]).length>12)fail("a tabs branch holds at most 12 tabs");
      }
      if(branches[0]==="accordion"){
        if(Object.keys(region).some(key=>!ACCORDION_BRANCH.has(key)))fail("an accordion branch takes sizes, resizable and multiple only");
        if((children as unknown[]).length>12)fail("an accordion branch holds at most 12 sections");
        if(region.multiple!==true&&(children as Record<string,unknown>[]).filter(child=>child?.open===true).length>1)fail("an accordion branch without multiple opens at most one section");
      }
      for(const child of children as unknown[])visit(child,depth+1,branches[0]==="tabs"||branches[0]==="accordion"?branches[0]:undefined);
    }else{
      const id=region.id;
      if(typeof id!=="string"||!REGION.test(id)||id.startsWith("blade-")||ids.has(id))fail(`region id "${String(id)}" is missing, invalid or repeated`);
      ids.add(id as string);
      if(region.collapsable===true)collapsable.add(id as string);
    }
  };
  visit(tree,0);
  return {ids,collapsable};
}

/**
 * A page's panels as a public component (`app.components.PageLayout`, docs/toolkit.md#pagelayout): the declared
 * tree (typically a view's `options.layout`) as one Suite space Layout, the framework's list layout behaviour
 * included: plain-text panel headers (Suite renders them as text), the user's panel sizes and collapsed panels kept per page and user
 * (`UiPreferences`, keyed by `id`), a resizer double-click restoring the declared sizes. Components mount into
 * `cell(id)`; `attach(id, content)` puts a widget or a plain element there (the view host's rule). A `collapsable`
 * leaf is collapsed and expanded by the user or by `collapse`/`expand` (not kept: a page's own state, such as a phone
 * collapsing a region for one tab, never replaces the user's choice); `collapse {id, collapsed}` follows both.
 */
export class PageLayout extends Component<PageLayoutEvents> implements PageLayoutApi{
  readonly layout:Layout;
  private ids:Set<string>;
  private collapsable:Set<string>;
  /** True while `collapse`/`expand` runs: Suite reports that change synchronously, and it is not kept. */
  private transient=false;
  private released=new AbortController();
  /** One `Tabs` per `tabs` branch, in a framework cell `blade-tabs-<n>` of the Layout; region id → its tabs. */
  private tabGroups:Tabs[]=[];
  private tabbed=new Map<string,Tabs>();
  /** One `Accordion` per `accordion` branch, in a framework cell `blade-accordion-<n>`; region id → its accordion. */
  private accordions:Accordion[]=[];
  private sectioned=new Map<string,Accordion>();
  constructor(context:{user:string},options:PageLayoutOptions){
    super(options);
    if(typeof options?.id!=="string"||!/^[a-z][a-z0-9_.-]*$/.test(options.id))throw new TypeError("61ade: PageLayout needs an id (the preference key, usually the view id).");
    if(options.guard!==undefined&&typeof options.guard!=="function")throw new TypeError("61ade: PageLayout: guard is a function.");
    ({ids:this.ids,collapsable:this.collapsable}=regions(options.tree));
    const preferences=new UiPreferences(context.user,options.id);
    // A `tabs` branch is one framework leaf of the Layout; its tabs are created into that cell below.
    const groups:{cell:string;tabs:PageRegion[]}[]=[];
    const stacks:{cell:string;sections:PageRegion[];multiple:boolean}[]=[];
    const leaves=(node:PageRegion):PageRegion=>{
      if(node.tabs){const {tabs,...sizes}=node,cell=`blade-tabs-${groups.length+1}`;groups.push({cell,tabs});return {...sizes,id:cell};}
      if(node.accordion){const {accordion,multiple,...sizes}=node,cell=`blade-accordion-${stacks.length+1}`;stacks.push({cell,sections:accordion,multiple:multiple===true});return {...sizes,id:cell};}
      return {...node,...(node.rows?{rows:node.rows.map(leaves)}:{}),...(node.cols?{cols:node.cols.map(leaves)}:{})};
    };
    const declared=leaves(options.tree);
    const tree:PageRegion=declared.rows||declared.cols?declared:{rows:[declared]};
    const config=(node:PageRegion,axis?:"width"|"height"):Record<string,unknown>=>({...node,
      // Suite treats a minimum without gravity as content-sized. A minimum is a floor, not a fixed size.
      ...(axis&&node[axis]===undefined?{gravity:1}:{}),
      ...(node.rows?{rows:node.rows.map(child=>config(child,"height"))}:{}),
      ...(node.cols?{cols:node.cols.map(child=>config(child,"width"))}:{})});
    this.layout=new Layout(this.host,{type:"space",css:"blade-page-layout",...config(preferences.layoutTree(tree))} as any);
    preferences.bindLayout(this.layout,tree,()=>this.transient);
    // Every change of a collapsible leaf: a header click, its keys or the page's own call.
    for(const [event,collapsed] of [["afterCollapse",true],["afterExpand",false]] as const)
      this.layout.events.on(event,(id:string|number)=>{if(this.collapsable.has(String(id)))this.emit("collapse",{id:String(id),collapsed});});
    for(const group of groups){
      const tabs=new Tabs(context,{id:`${options.id}.${group.cell.slice(6)}`,tabs:group.tabs.map(tab=>({id:tab.id!,label:tab.header!})),guard:options.guard});
      tabs.mount(this.layout.getCell(group.cell));
      this.tabGroups.push(tabs);
      for(const tab of group.tabs)this.tabbed.set(tab.id!,tabs);
    }
    for(const stack of stacks){
      // The declared `open` sections apply until the user has chosen; then the remembered ones (the Accordion's rule).
      const declared=stack.sections.filter(section=>section.open).map(section=>section.id!);
      const key=`${options.id}.${stack.cell.slice(6)}`;
      const accordion=new Accordion(context,{id:key,multiple:stack.multiple,sections:stack.sections.map(section=>({id:section.id!,label:section.header!})),
        ...(declared.length&&!new UiPreferences(context.user,key).sections()?{open:declared}:{})});
      accordion.mount(this.layout.getCell(stack.cell));
      this.accordions.push(accordion);
      for(const section of stack.sections)this.sectioned.set(section.id!,accordion);
    }
    this.bind(options.signal);
  }
  /** The cell of a declared region (a mount target of every component); an undeclared id throws `Error`. */
  cell(id:string):LayoutCell{
    if(!this.ids.has(id))throw new Error(`61ade: PageLayout has no region "${id}".`);
    return this.tabbed.get(id)?.cell(id)??this.sectioned.get(id)?.cell(id)??this.layout.getCell(id);
  }
  /**
   * Puts content into a declared region: a Suite widget, a public component or a plain element (kept in its region
   * when Suite redraws it, released with this layout). A region holds either attached content or mounted components.
   */
  attach(id:string,content:Mountable):void{if(!this.destroyed)attachContent(this.cell(id),content,this.released.signal);}
  /** Whether a `collapsable` leaf is collapsed; another id throws `Error`. */
  isCollapsed(id:string):boolean{return this.collapsible(id).config.collapsed===true;}
  /** Collapses a `collapsable` leaf to its header for now (not kept); unchanged when it is collapsed. Returns `true`. */
  collapse(id:string):boolean{return this.set(id,true);}
  /** Expands a `collapsable` leaf for now (not kept); unchanged when it is open. Returns `false` (not collapsed). */
  expand(id:string):boolean{return this.set(id,false);}
  private collapsible(id:string):LayoutCell{
    if(!this.ids.has(id))throw new Error(`61ade: PageLayout has no region "${id}".`);
    if(!this.collapsable.has(id))throw new Error(`61ade: PageLayout region "${id}" is not collapsable.`);
    return this.layout.getCell(id);
  }
  private set(id:string,collapsed:boolean):boolean{
    const cell=this.collapsible(id);
    if(!this.destroyed&&(cell.config.collapsed===true)!==collapsed){
      this.transient=true;
      try{if(collapsed)cell.collapse();else cell.expand();}finally{this.transient=false;}
    }
    return this.isCollapsed(id);
  }
  /** The tabs of the `tabs` branch holding region $id. */
  tabsOf(id:string):TabsApi|undefined{return this.tabbed.get(id);}
  /** The accordion of the `accordion` branch holding region $id. */
  accordionOf(id:string):AccordionApi|undefined{return this.sectioned.get(id);}
  protected dispose():void{this.released.abort();for(const tabs of this.tabGroups)tabs.destroy();for(const accordion of this.accordions)accordion.destroy();this.layout.destructor();}
}

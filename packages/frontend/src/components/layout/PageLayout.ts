import { Layout } from "@dhtmlx/suite";
import type { LayoutCell, Mountable, PageLayout as PageLayoutApi, PageLayoutOptions, PageRegion, Tabs as TabsApi } from "../../api/types";
import { attachContent } from "../../api/services";
import { UiPreferences } from "../../UiPreferences";
import { Component } from "../list/component";
import { Tabs } from "./Tabs";

const REGION=/^[a-z][a-z0-9_-]{0,63}$/;
const KEYS=new Set(["id","header","rows","cols","tabs","width","height","minWidth","minHeight","resizable","collapsable","collapsed"]);
const TAB_BRANCH=new Set(["tabs","width","height","minWidth","minHeight","resizable"]);

/**
 * The declared panel tree of a page, checked like a list view's layout (`Blade\Feature\ViewLayout`): at most 6
 * levels and 30 nodes; a leaf has a unique region id (not `blade-…`, reserved for the framework), a branch `rows`,
 * `cols` or `tabs` and no id; sizes are integers from 40 to 3000, flags booleans, a header plain text of at most 150
 * characters. A `tabs` branch takes the sizes and `resizable` only and holds 1–12 leaves with an id and a `header`
 * (the tab's label) and nothing else. Returns the region ids; throws `TypeError`.
 */
function regions(tree:unknown):Set<string>{
  const ids=new Set<string>();let nodes=0;
  const fail=(reason:string):never=>{throw new TypeError(`61ade: PageLayout: ${reason}.`);};
  const visit=(node:unknown,depth:number,tab=false):void=>{
    if(!node||typeof node!=="object"||Array.isArray(node))fail("a region is an object");
    if(depth>6||++nodes>30)fail("the layout is too complex (6 levels, 30 regions)");
    const region=node as Record<string,unknown>;
    for(const [key,value] of Object.entries(region)){
      if(!KEYS.has(key))fail(`unsupported option "${key}"`);
      if(["resizable","collapsable","collapsed"].includes(key)&&typeof value!=="boolean")fail(`"${key}" is a boolean`);
      if(["width","height","minWidth","minHeight"].includes(key)&&!(Number.isInteger(value)&&(value as number)>=40&&(value as number)<=3000))fail(`"${key}" is an integer from 40 to 3000`);
      if(key==="header"&&(typeof value!=="string"||value.length>150))fail("a header is text of at most 150 characters");
    }
    const branches=["rows","cols","tabs"].filter(key=>region[key]!==undefined);
    if(tab&&(branches.length||Object.keys(region).some(key=>key!=="id"&&key!=="header")||typeof region.header!=="string"||!region.header.trim()||region.header.length>80))
      fail("a tab is a leaf with an id and a header (its label, at most 80 characters) only");
    if(branches.length){
      const children=region[branches[0]];
      if(region.id!==undefined||branches.length>1||!Array.isArray(children)||!children.length)fail("a branch has either rows, cols or tabs and no id");
      if(branches[0]==="tabs"){
        if(Object.keys(region).some(key=>!TAB_BRANCH.has(key)))fail("a tabs branch takes sizes and resizable only");
        if((children as unknown[]).length>12)fail("a tabs branch holds at most 12 tabs");
      }
      for(const child of children as unknown[])visit(child,depth+1,branches[0]==="tabs");
    }else{
      const id=region.id;
      if(typeof id!=="string"||!REGION.test(id)||id.startsWith("blade-")||ids.has(id))fail(`region id "${String(id)}" is missing, invalid or repeated`);
      ids.add(id as string);
    }
  };
  visit(tree,0);
  return ids;
}

/**
 * A page's panels as a public component (`app.components.PageLayout`, docs/toolkit.md#pagelayout): the declared
 * tree (typically a view's `options.layout`) as one Suite space Layout, the framework's list layout behaviour
 * included: plain-text panel headers (Suite renders them as text), the user's panel sizes and collapsed panels kept per page and user
 * (`UiPreferences`, keyed by `id`), a resizer double-click restoring the declared sizes. Components mount into
 * `cell(id)`; `attach(id, content)` puts a widget or a plain element there (the view host's rule).
 */
export class PageLayout extends Component<Record<string,never>> implements PageLayoutApi{
  readonly layout:Layout;
  private ids:Set<string>;
  private released=new AbortController();
  /** One `Tabs` per `tabs` branch, in a framework cell `blade-tabs-<n>` of the Layout; region id → its tabs. */
  private tabGroups:Tabs[]=[];
  private tabbed=new Map<string,Tabs>();
  constructor(context:{user:string},options:PageLayoutOptions){
    super(options);
    if(typeof options?.id!=="string"||!/^[a-z][a-z0-9_.-]*$/.test(options.id))throw new TypeError("61ade: PageLayout needs an id (the preference key, usually the view id).");
    if(options.guard!==undefined&&typeof options.guard!=="function")throw new TypeError("61ade: PageLayout: guard is a function.");
    this.ids=regions(options.tree);
    const preferences=new UiPreferences(context.user,options.id);
    // A `tabs` branch is one framework leaf of the Layout; its tabs are created into that cell below.
    const groups:{cell:string;tabs:PageRegion[]}[]=[];
    const leaves=(node:PageRegion):PageRegion=>{
      if(node.tabs){const {tabs,...sizes}=node,cell=`blade-tabs-${groups.length+1}`;groups.push({cell,tabs});return {...sizes,id:cell};}
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
    preferences.bindLayout(this.layout,tree);
    for(const group of groups){
      const tabs=new Tabs(context,{id:`${options.id}.${group.cell.slice(6)}`,tabs:group.tabs.map(tab=>({id:tab.id!,label:tab.header!})),guard:options.guard});
      tabs.mount(this.layout.getCell(group.cell));
      this.tabGroups.push(tabs);
      for(const tab of group.tabs)this.tabbed.set(tab.id!,tabs);
    }
    this.bind(options.signal);
  }
  /** The cell of a declared region (a mount target of every component); an undeclared id throws `Error`. */
  cell(id:string):LayoutCell{
    if(!this.ids.has(id))throw new Error(`61ade: PageLayout has no region "${id}".`);
    return this.tabbed.get(id)?.cell(id)??this.layout.getCell(id);
  }
  /**
   * Puts content into a declared region: a Suite widget, a public component or a plain element (kept in its region
   * when Suite redraws it, released with this layout). A region holds either attached content or mounted components.
   */
  attach(id:string,content:Mountable):void{if(!this.destroyed)attachContent(this.cell(id),content,this.released.signal);}
  /** The tabs of the `tabs` branch holding region $id. */
  tabsOf(id:string):TabsApi|undefined{return this.tabbed.get(id);}
  protected dispose():void{this.released.abort();for(const tabs of this.tabGroups)tabs.destroy();this.layout.destructor();}
}

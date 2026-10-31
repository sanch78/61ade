import { Layout } from "@dhtmlx/suite";
import type { LayoutCell, Mountable, PageLayout as PageLayoutApi, PageLayoutOptions, PageRegion } from "../../api/types";
import { attachContent } from "../../api/services";
import { UiPreferences } from "../../UiPreferences";
import { Component } from "../list/component";
import { escape } from "../list/fields";

const REGION=/^[a-z][a-z0-9_-]{0,63}$/;
const KEYS=new Set(["id","header","rows","cols","width","height","minWidth","minHeight","resizable","collapsable","collapsed"]);

/**
 * The declared panel tree of a page, checked like a list view's layout (`Blade\Feature\ViewLayout`): at most 6
 * levels and 30 nodes; a leaf has a unique region id, a branch `rows` or `cols` and no id; sizes are integers from 40
 * to 3000, flags booleans, a header plain text of at most 150 characters. Returns the region ids; throws `TypeError`.
 */
function regions(tree:unknown):Set<string>{
  const ids=new Set<string>();let nodes=0;
  const fail=(reason:string):never=>{throw new TypeError(`61ade: PageLayout: ${reason}.`);};
  const visit=(node:unknown,depth:number):void=>{
    if(!node||typeof node!=="object"||Array.isArray(node))fail("a region is an object");
    if(depth>6||++nodes>30)fail("the layout is too complex (6 levels, 30 regions)");
    const region=node as Record<string,unknown>;
    for(const [key,value] of Object.entries(region)){
      if(!KEYS.has(key))fail(`unsupported option "${key}"`);
      if(["resizable","collapsable","collapsed"].includes(key)&&typeof value!=="boolean")fail(`"${key}" is a boolean`);
      if(["width","height","minWidth","minHeight"].includes(key)&&!(Number.isInteger(value)&&(value as number)>=40&&(value as number)<=3000))fail(`"${key}" is an integer from 40 to 3000`);
      if(key==="header"&&(typeof value!=="string"||value.length>150))fail("a header is text of at most 150 characters");
    }
    const children=region.rows??region.cols;
    if(children!==undefined){
      if(region.id!==undefined||(region.rows&&region.cols)||!Array.isArray(children)||!children.length)fail("a branch has either rows or cols and no id");
      for(const child of children as unknown[])visit(child,depth+1);
    }else{
      const id=region.id;
      if(typeof id!=="string"||!REGION.test(id)||ids.has(id))fail(`region id "${String(id)}" is missing, invalid or repeated`);
      ids.add(id as string);
    }
  };
  visit(tree,0);
  return ids;
}

/**
 * A page's panels as a public component (`app.components.PageLayout`, docs/toolkit.md#pagelayout): the declared
 * tree (typically a view's `options.layout`) as one Suite space Layout, the framework's list layout behaviour
 * included: escaped panel headers, the user's panel sizes and collapsed panels kept per page and user
 * (`UiPreferences`, keyed by `id`), a resizer double-click restoring the declared sizes. Components mount into
 * `cell(id)`; `attach(id, content)` puts a widget or a plain element there (the view host's rule).
 */
export class PageLayout extends Component<Record<string,never>> implements PageLayoutApi{
  readonly layout:Layout;
  private ids:Set<string>;
  private released=new AbortController();
  constructor(context:{user:string},options:PageLayoutOptions){
    super(options);
    if(typeof options?.id!=="string"||!/^[a-z][a-z0-9_.-]*$/.test(options.id))throw new TypeError("61ade: PageLayout needs an id (the preference key, usually the view id).");
    this.ids=regions(options.tree);
    const preferences=new UiPreferences(context.user,options.id);
    const tree:PageRegion=options.tree.rows||options.tree.cols?options.tree:{rows:[options.tree]};
    const config=(node:PageRegion):Record<string,unknown>=>({...node,...(node.header!==undefined?{header:escape(node.header)}:{}),
      ...(node.rows?{rows:node.rows.map(config)}:{}),...(node.cols?{cols:node.cols.map(config)}:{})});
    this.layout=new Layout(this.host,{type:"space",css:"blade-page-layout",...config(preferences.layoutTree(tree))} as any);
    preferences.bindLayout(this.layout,tree);
    this.bind(options.signal);
  }
  /** The cell of a declared region (a mount target of every component); an undeclared id throws `Error`. */
  cell(id:string):LayoutCell{
    if(!this.ids.has(id))throw new Error(`61ade: PageLayout has no region "${id}".`);
    return this.layout.getCell(id);
  }
  /**
   * Puts content into a declared region: a Suite widget, a public component or a plain element (kept in its region
   * when Suite redraws it, released with this layout). A region holds either attached content or mounted components.
   */
  attach(id:string,content:Mountable):void{if(!this.destroyed)attachContent(this.cell(id),content,this.released.signal);}
  protected dispose():void{this.released.abort();this.layout.destructor();}
}

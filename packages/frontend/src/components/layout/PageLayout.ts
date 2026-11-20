import { Layout, awaitRedraw } from "@dhtmlx/suite";
import type { Accordion as AccordionApi, LayoutCell, Mountable, PageLayout as PageLayoutApi, PageLayoutEvents, PageLayoutOptions, PageRegion, RegionPlaceholder, Tabs as TabsApi } from "../../api/types";
import { hold, placeholder as applyPlaceholder, regionStatus, type CellStatus } from "../CellStatus";
import { attachContent, moveInto } from "../../api/services";
import { UiPreferences } from "../../UiPreferences";
import { collapseMotion } from "../../Motion";
import { locale, t } from "../../I18n";
import { Component } from "../list/component";
import { Accordion } from "./Accordion";
import { Tabs, type HeldRegion } from "./Tabs";
import { narrow, onViewport } from "../../Viewport";

const REGION=/^[a-z][a-z0-9_-]{0,63}$/;
const KEYS=new Set(["id","header","count","rows","cols","tabs","accordion","multiple","open","inner","width","height","minWidth","minHeight","resizable","collapsable","collapsed"]);
const TAB_BRANCH=new Set(["tabs","width","height","minWidth","minHeight","resizable"]);
const ACCORDION_BRANCH=new Set(["accordion","multiple","width","height","minWidth","minHeight","resizable"]);
const BRANCHES=["rows","cols","tabs","accordion"] as const;
let instances=0;

/**
 * The declared panel tree of a page, checked like a list view's layout (`Blade\Feature\ViewLayout`): at most 6
 * levels and 30 nodes; a leaf has a unique region id (not `blade-…`, reserved for the framework), a branch `rows`,
 * `cols`, `tabs` or `accordion` and no id; sizes are integers from 40 to 3000, flags booleans, a header plain text of
 * at most 150 characters. A `tabs` branch takes the sizes and `resizable` only and holds 1–12 leaves with an id and a
 * `header` (the tab's label) and nothing else. An `accordion` branch takes the sizes, `resizable` and `multiple` and
 * holds 1–12 leaves with an id, a `header` (the section's label) and optionally `open` (at most one without
 * `multiple`). A region with `inner` (FB-0222) holds a frameless layout of `rows` or `cols` instead of content and no
 * branch of its own; its id is optional (then its size is not kept and it does not collapse). Inside an inner layout
 * the regions and branches take no collapsing, `tabs`, `accordion` or another `inner`; only its regions take a
 * `header` (1–150 characters) and with it a `count` (a non-negative integer, FB-0227). Returns the content region ids,
 * the ids of the regions holding an inner layout (with their regions), the collapsible ones and the headed inner regions;
 * throws `TypeError`.
 */
function regions(tree:unknown):{ids:Set<string>;containers:Map<string,string[]>;collapsable:Set<string>;headed:Map<string,{label:string;count:number|null}>}{
  const ids=new Set<string>(),containers=new Map<string,string[]>(),collapsable=new Set<string>(),headed=new Map<string,{label:string;count:number|null}>();let nodes=0;
  const fail=(reason:string):never=>{throw new TypeError(`61ade: PageLayout: ${reason}.`);};
  const named=(id:unknown):string=>{
    if(typeof id!=="string"||!REGION.test(id)||id.startsWith("blade-")||ids.has(id)||containers.has(id))fail(`region id "${String(id)}" is missing, invalid or repeated`);
    return id as string;
  };
  const visit=(node:unknown,depth:number,parent?:"tabs"|"accordion",inside=false):void=>{
    if(!node||typeof node!=="object"||Array.isArray(node))fail("a region is an object");
    if(depth>6||++nodes>30)fail("the layout is too complex (6 levels, 30 regions)");
    const region=node as Record<string,unknown>;
    for(const [key,value] of Object.entries(region)){
      if(!KEYS.has(key))fail(`unsupported option "${key}"`);
      if(["resizable","collapsable","collapsed","multiple","open"].includes(key)&&typeof value!=="boolean")fail(`"${key}" is a boolean`);
      if(["width","height","minWidth","minHeight"].includes(key)&&!(Number.isInteger(value)&&(value as number)>=40&&(value as number)<=3000))fail(`"${key}" is an integer from 40 to 3000`);
      if(key==="header"&&(typeof value!=="string"||value.length>150))fail("a header is text of at most 150 characters");
      if(key==="count"&&!(Number.isSafeInteger(value)&&(value as number)>=0))fail('"count" is a non-negative integer');
    }
    const branches=BRANCHES.filter(key=>region[key]!==undefined);
    if(parent==="tabs"&&(branches.length||Object.keys(region).some(key=>key!=="id"&&key!=="header")||typeof region.header!=="string"||!region.header.trim()||region.header.length>80))
      fail("a tab is a leaf with an id and a header (its label, at most 80 characters) only");
    if(parent==="accordion"&&(branches.length||Object.keys(region).some(key=>key!=="id"&&key!=="header"&&key!=="open")||typeof region.header!=="string"||!region.header.trim()||region.header.length>80))
      fail("a section is a leaf with an id, a header (its label, at most 80 characters) and optionally open only");
    if(parent!=="accordion"&&region.open!==undefined)fail('"open" belongs to a section of an accordion branch');
    if(region.multiple!==undefined&&region.accordion===undefined)fail('"multiple" belongs to an accordion branch');
    if(inside&&["collapsable","collapsed","tabs","accordion","inner"].some(key=>region[key]!==undefined))fail("an inner layout holds rows, cols and regions without collapsing, tabs, accordions or inner layouts");
    if(inside&&region.header!==undefined&&(branches.length||!(region.header as string).trim()))fail("in an inner layout only a region takes a header, of 1 to 150 characters");
    if(region.count!==undefined&&(!inside||region.header===undefined))fail('"count" belongs to a region of an inner layout with a header');
    if(region.inner!==undefined){
      const inner=region.inner as Record<string,unknown>;
      if(parent||branches.length)fail("a region with an inner layout has no rows, cols, tabs or accordion of its own and is not a tab or a section");
      if(!inner||typeof inner!=="object"||Array.isArray(inner)||Object.keys(inner).length!==1||!(Array.isArray(inner.rows)||Array.isArray(inner.cols)))fail("inner is a rows or cols branch with nothing else");
      const container=region.id===undefined?undefined:named(region.id),before=ids.size;
      if(container)containers.set(container,[]);
      if(region.collapsable===true){if(region.id===undefined)fail("a collapsable region with an inner layout has an id");collapsable.add(region.id as string);}
      visit(inner,depth+1,undefined,true);
      if(container)containers.set(container,[...ids].slice(before));
      return;
    }
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
      for(const child of children as unknown[])visit(child,depth+1,branches[0]==="tabs"||branches[0]==="accordion"?branches[0]:undefined,inside);
    }else{
      const id=named(region.id);
      ids.add(id);
      if(inside&&region.header!==undefined)headed.set(id,{label:region.header as string,count:(region.count as number|undefined)??null});
      if(region.collapsable===true)collapsable.add(id);
    }
  };
  visit(tree,0);
  return {ids,containers,collapsable,headed};
}

/** What `regions` found in one tree. */
type Checked=ReturnType<typeof regions>;

/**
 * One arrangement of a page's panels (`tree`, or `narrow` below 768 px): its Suite Layout with the `Tabs` and
 * `Accordion` of its branches, and the slots it holds (the inner headers and, with `narrow`, the regions' carriers).
 */
type Arrangement={
  narrow:boolean;
  layout:Layout;
  checked:Checked;
  /** One `Tabs` per `tabs` branch, in a framework cell `blade-tabs-<n>` of the Layout; region id → its tabs. */
  tabGroups:Tabs[];
  tabbed:Map<string,Tabs>;
  /** One `Accordion` per `accordion` branch, in a framework cell `blade-accordion-<n>`; region id → its accordion. */
  accordions:Accordion[];
  sectioned:Map<string,Accordion>;
  /** Releases the arrangement's slots. */
  released:AbortController;
  /** Puts each slot's element in place at once (`attachContent`). */
  places:(()=>void)[];
};

/**
 * A page's panels as a public component (`app.components.PageLayout`, docs/toolkit.md#pagelayout): the declared
 * tree (typically a view's `options.layout`) as one Suite space Layout, the framework's list layout behaviour
 * included: plain-text panel headers (Suite renders them as text), the user's panel sizes and collapsed panels kept per page and user
 * (`UiPreferences`, keyed by `id`), a resizer double-click restoring the declared sizes. Components mount into
 * `cell(id)`; `attach(id, content)` puts a widget or a plain element there (the view host's rule). A region with
 * `inner` holds a frameless layout (a Suite line sub-layout of the same Layout: no frames or headers, the regions divided
 * by lines with a few pixels' hit area, admin.css) whose regions are ordinary regions of the page; a tree that is only
 * `{inner}` is frameless as a whole, for the content of a tab or a region. An inner region with a `header` (FB-0227)
 * is a framework branch of two cells: its own one-line header (the title and an optional count badge, kept current
 * by `header`) over a body cell, the region's mount target; the branch keeps the region's id, sizes and line, and its
 * node is a `region` landmark named by the title and the spoken count. A `resizable` last region of a branch puts
 * the line before it, and the sizes of both regions beside a dragged line are kept. A `collapsable`
 * leaf is collapsed and expanded by the user or by `collapse`/`expand` (not kept: a page's own state, such as a phone
 * collapsing a region for one tab, never replaces the user's choice); `collapse {id, collapsed}` follows both.
 *
 * With a `narrow` tree (docs/toolkit.md#pagelayout-narrow) the root Layout is a frame of two cells, one shown, holding
 * the arrangement of the current width (`id`, below 768 px `id:narrow`, each with its own kept sizes, tabs and
 * sections). Every region's content lives in a carrier of its own (an element with a one-cell Layout, the region's
 * `cell`, placeholder and busy mark), which the arrangement's region, tab or section only frames. Crossing the width
 * builds the other arrangement in the other cell and moves the carriers over in one synchronous step.
 */
export class PageLayout extends Component<PageLayoutEvents> implements PageLayoutApi{
  /** The panels' Layout; with `narrow`, the frame holding the current arrangement. */
  readonly layout:Layout;
  private ids:Set<string>;
  private trees:[Checked,Checked|undefined];
  private current:Arrangement;
  /** With `narrow`: the frame cell (0 or 1) showing the current arrangement. */
  private shown=0;
  /** With `narrow`: each region's carrier, kept across the arrangements. */
  private carriers?:Map<string,{element:HTMLElement;layout:Layout}>;
  /** True while `collapse`/`expand` runs: Suite reports that change synchronously, and it is not kept. */
  private transient=false;
  private released=new AbortController();
  /** The placeholder of each region of the Layout itself (tabs and sections have their component's); with `narrow`, of every carrier. */
  private statuses=new Map<string,CellStatus>();
  /** Each headed inner region's header (of either tree): its element, its parts and its current title and count. */
  private heads=new Map<string,{element:HTMLElement;title:HTMLElement;badge:HTMLElement;spoken:HTMLElement;label:string;count:number|null}>();
  private prefix=`blade-page${++instances}-`;
  private observer?:MutationObserver;
  /** With `narrow`: the hidden holder of carriers waiting for their slot (`holder`). */
  private parking?:HTMLElement;
  constructor(private context:{user:string},private options:PageLayoutOptions){
    super(options);
    if(typeof options?.id!=="string"||!/^[a-z][a-z0-9_.-]*$/.test(options.id))throw new TypeError("61ade: PageLayout needs an id (the preference key, usually the view id).");
    if(options.guard!==undefined&&typeof options.guard!=="function")throw new TypeError("61ade: PageLayout: guard is a function.");
    const wide=regions(options.tree),small=options.narrow===undefined?undefined:regions(options.narrow);
    if(small&&(small.ids.size!==wide.ids.size||[...wide.ids].some(id=>!small.ids.has(id))))throw new TypeError("61ade: PageLayout: narrow holds the same regions (leaf ids) as tree.");
    this.ids=wide.ids;this.trees=[wide,small];
    // One header per headed inner region of either tree, declared by `tree` first; `header` changes it in both.
    for(const [id,{label,count}] of new Map([...small?.headed??[],...wide.headed])){
      const element=document.createElement("div"),title=document.createElement("span"),badge=document.createElement("span"),spoken=document.createElement("span");
      element.className="blade-inner-header";
      title.className="blade-inner-header__title";title.id=`${this.prefix}${id}-title`;
      badge.className="blade-inner-header__count";badge.setAttribute("aria-hidden","true");
      spoken.className="blade-visually-hidden";spoken.id=`${this.prefix}${id}-count`;
      element.append(title,badge,spoken);
      this.heads.set(id,{element,title,badge,spoken,label,count});
      this.paintHeader(id);
    }
    if(small){
      this.layout=new Layout(this.host,{type:"none",rows:[{id:"blade-variant-0"},{id:"blade-variant-1",hidden:true}]} as any);
      this.carriers=new Map();
      for(const id of this.ids){
        const element=document.createElement("div"),layout=new Layout(element,{type:"none",rows:[{id:"blade-region"}]} as any);
        element.className="blade-page-region";element.style.cssText="width:100%;height:100%";
        this.carriers.set(id,{element,layout});
        this.statuses.set(id,regionStatus(layout.getCell("blade-region")));
      }
      this.current=this.build(narrow());
      this.layout.getCell("blade-variant-0").attach(this.current.layout);
      onViewport(narrow=>this.switch(narrow),this.released.signal);
    }else{
      this.current=this.build(false,this.host);
      this.layout=this.current.layout;
      // After the headers: a headed region's placeholder is its body's, below the header.
      for(const id of this.ids)if(!this.current.tabbed.has(id)&&!this.current.sectioned.has(id))this.statuses.set(id,regionStatus(this.cell(id)));
    }
    if(this.heads.size){
      // Suite creates a cell's node again (a collapsed holder expanding): the landmark is put back on every change.
      this.observer=new MutationObserver(()=>this.landmarks());
      this.observer.observe(this.host,{childList:true,subtree:true});
      void awaitRedraw().then(()=>this.landmarks());
    }
    this.bind(options.signal);
  }
  /**
   * The arrangement of `narrow` ($small) or `tree`, its Layout drawn into $container: its tabs and accordions, its
   * inner headers and, with `narrow`, the slots of the regions' carriers. The tab or section of region $focus (the one
   * holding the focus at a switch) is shown.
   */
  private build(small:boolean,container:HTMLElement=document.createElement("div"),focus?:string):Arrangement{
    const options=this.options,checked=this.trees[small?1:0]!,headed=checked.headed,source=small?options.narrow!:options.tree;
    // Below 768 px `id:narrow`: a `:` is in no id, so the key never meets another page's or view's preferences.
    const key=small?`${options.id}:narrow`:options.id,preferences=new UiPreferences(this.context.user,key);
    // A `tabs` branch is one framework leaf of the Layout; its tabs are created into that cell below.
    const groups:{cell:string;tabs:PageRegion[]}[]=[];
    const stacks:{cell:string;sections:PageRegion[];multiple:boolean}[]=[];
    const leaves=(node:PageRegion):PageRegion=>{
      if(node.tabs){const {tabs,...sizes}=node,cell=`blade-tabs-${groups.length+1}`;groups.push({cell,tabs});return {...sizes,id:cell};}
      if(node.accordion){const {accordion,multiple,...sizes}=node,cell=`blade-accordion-${stacks.length+1}`;stacks.push({cell,sections:accordion,multiple:multiple===true});return {...sizes,id:cell};}
      // An inner layout becomes a line branch of the same Layout (its own `type`), so its regions are the Layout's cells.
      if(node.inner){const {inner,...panel}=node;return {...panel,type:"line",...frameless(inner)} as PageRegion;}
      return {...node,...(node.rows?{rows:node.rows.map(leaves)}:{}),...(node.cols?{cols:node.cols.map(leaves)}:{})};
    };
    // A headed inner region: a branch keeping its id, sizes and line, of its header cell (content height) over its body.
    const frameless=(node:PageRegion):PageRegion=>{
      if(node.id&&headed.has(node.id)){const {header,count,...panel}=node;
        return {...panel,type:"none",css:"blade-inner-region",rows:[{id:this.headCell(node.id),height:"content",css:"blade-inner-region__header"},{id:this.bodyCell(node.id),css:"blade-inner-region__body"}]} as unknown as PageRegion;}
      return {...node,...(node.rows?{rows:node.rows.map(frameless)}:{}),...(node.cols?{cols:node.cols.map(frameless)}:{})};
    };
    // Only `{inner}`: the whole layout is frameless (a line Layout); otherwise a space Layout of framed panels.
    const line=Object.keys(source).length===1&&!!source.inner;
    const declared=line?frameless(source.inner!):leaves(source);
    const tree:PageRegion=declared.rows||declared.cols?declared:{rows:[declared]};
    // Suite draws a cell's resizer after it, so a `resizable` last child carries none: its previous sibling draws it.
    const children=(list:PageRegion[],axis:"width"|"height")=>list.map((child,index)=>({...config(child,axis),...(list[index+1]?.resizable===true&&index===list.length-2?{resizable:true}:{})}));
    const config=(node:PageRegion,axis?:"width"|"height"):Record<string,unknown>=>({...node,
      // Suite treats a minimum without gravity as content-sized. A minimum is a floor, not a fixed size.
      ...(axis&&node[axis]===undefined?{gravity:1}:{}),
      ...(node.rows?{rows:children(node.rows,"height")}:{}),
      ...(node.cols?{cols:children(node.cols,"width")}:{})});
    const layout=new Layout(container,{type:line?"line":"space",css:"blade-page-layout",...config(preferences.layoutTree(tree))} as any);
    preferences.bindLayout(layout,tree,()=>this.transient);
    collapseMotion(layout);
    // Every change of a collapsible leaf: a header click, its keys or the page's own call.
    for(const [event,collapsed] of [["afterCollapse",true],["afterExpand",false]] as const)
      layout.events.on(event,(id:string|number)=>{if(checked.collapsable.has(String(id)))this.emit("collapse",{id:String(id),collapsed});});
    const arrangement:Arrangement={narrow:small,layout,checked,tabGroups:[],tabbed:new Map(),accordions:[],sectioned:new Map(),released:new AbortController(),places:[]};
    // With `narrow`, a tab or a section frames its region's carrier: its content, placeholder and busy mark are the page's.
    const held=this.carriers&&((id:string)=>this.held(id));
    for(const group of groups){
      const tabs=new Tabs(this.context,{tabs:group.tabs.map(tab=>({id:tab.id!,label:tab.header!})),guard:options.guard,
        ...(group.tabs.some(tab=>tab.id===focus)?{active:focus}:{})},{key:`${key}.${group.cell.slice(6)}`,held});
      tabs.mount(layout.getCell(group.cell));
      arrangement.tabGroups.push(tabs);
      for(const tab of group.tabs)arrangement.tabbed.set(tab.id!,tabs);
    }
    for(const stack of stacks){
      // The declared `open` sections apply until the user has chosen; then the remembered ones (the Accordion's rule).
      const declared=stack.sections.filter(section=>section.open).map(section=>section.id!);
      const id=`${key}.${stack.cell.slice(6)}`;
      const accordion=new Accordion(this.context,{multiple:stack.multiple,sections:stack.sections.map(section=>({id:section.id!,label:section.header!})),
        ...(declared.length&&!new UiPreferences(this.context.user,id).sections()?{open:declared}:{})},{key:id,held});
      if(focus&&stack.sections.some(section=>section.id===focus))accordion.open(focus);
      accordion.mount(layout.getCell(stack.cell));
      arrangement.accordions.push(accordion);
      for(const section of stack.sections)arrangement.sectioned.set(section.id!,accordion);
    }
    const signal=arrangement.released.signal;
    for(const id of headed.keys())arrangement.places.push(attachContent(layout.getCell(this.headCell(id)),this.heads.get(id)!.element,signal));
    if(this.carriers)for(const [id,carrier] of this.carriers)arrangement.places.push(attachContent(this.frame(arrangement,id),carrier.element,signal));
    return arrangement;
  }
  /** The cell of $arrangement showing region $id: its tab, its section, its body below an inner header, or its own. */
  private frame(arrangement:Arrangement,id:string):LayoutCell{
    return arrangement.tabbed.get(id)?.panel(id)??arrangement.sectioned.get(id)?.panel(id)??arrangement.layout.getCell(arrangement.checked.headed.has(id)?this.bodyCell(id):id);
  }
  /** With `narrow`: region $id's carrier cell, placeholder and attachment owner, which its tab or section uses. */
  private held(id:string):HeldRegion|undefined{
    const carrier=this.carriers?.get(id);
    return carrier&&{cell:carrier.layout.getCell("blade-region"),status:this.statuses.get(id)!,signal:this.released.signal};
  }
  /**
   * Crossing 768 px with a `narrow` tree: the other arrangement is built in the frame's other cell and drawn at once
   * beside the current one, every region's carrier moves straight into its new slot (one synchronous step, nothing
   * is painted between), then the old arrangement's Layout, tabs and accordions are released and `variant` reports
   * the change. A carrier whose new slot is not drawn (in a collapsed panel) waits in the page's hidden holder, still in
   * the document. The focus stays in its region: the tab or section holding it opens, and when its element is gone or
   * hidden it goes to that region's tab or section header, the header of the collapsed panel holding it, or the region.
   */
  private switch(small:boolean):void{
    if(this.destroyed||!this.carriers||small===this.current.narrow)return;
    const previous=this.current,from=this.layout.getCell(`blade-variant-${this.shown}`),to=this.layout.getCell(`blade-variant-${this.shown=1-this.shown}`);
    const active=document.activeElement,root=this.layout.getRootNode() as HTMLElement|undefined;
    const focused=active instanceof HTMLElement&&root?.contains(active)?active:undefined,region=focused&&this.regionOf(focused);
    const scrolled:[Element,number,number][]=[];
    for(const {element} of this.carriers.values())for(const node of Array.from(element.querySelectorAll("*")))if(node.scrollTop||node.scrollLeft)scrolled.push([node,node.scrollTop,node.scrollLeft]);
    const next=this.current=this.build(small,undefined,region);
    to.attach(next.layout);to.config.hidden=false;
    // Drawn now (the tabs' and accordions' panels, the arrangement, the frame), so the new slots are in the page.
    const drawn=!!root,draw=(views:{layout:Layout}[])=>{if(drawn)for(const view of views)(view.layout.getRootView() as any)?.redraw(true);};
    draw([...next.tabGroups,...next.accordions,next,this]);
    // Before the old slots are released (their release would take out what they still hold).
    for(const place of next.places)place();
    const drawnNext=next.layout.getRootNode() as HTMLElement|undefined;
    for(const {element} of this.carriers.values())if(element.isConnected&&!drawnNext?.contains(element))moveInto(this.holder(),element);
    previous.released.abort();
    from.config.hidden=true;from.detach();
    draw([this]);
    for(const tabs of previous.tabGroups)tabs.destroy();
    for(const accordion of previous.accordions)accordion.destroy();
    previous.layout.destructor();
    for(const [node,top,left] of scrolled)if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
    if(focused){
      const shown=(element:HTMLElement)=>element.isConnected&&element.getClientRects().length>0;
      if(shown(focused)){if(document.activeElement!==focused)focused.focus({preventScroll:true});}
      else this.anchor(region??[...this.ids][0])?.focus({preventScroll:true});
    }
    this.emit("variant",{narrow:small});
  }
  /** The region of the focused $element: its carrier's, or the region whose tab, section, panel header or resizer it is. */
  private regionOf(element:HTMLElement):string|undefined{
    for(const [id,carrier] of this.carriers!)if(carrier.element.contains(element))return id;
    const {containers}=this.current.checked;
    for(let node:Element|null=element;node;node=node.parentElement){
      const cell=node.classList.contains("dhx_layout-resizer")?node.previousElementSibling:node;
      // A tab's button (`dhx_tabid`) or a cell: a region, a section, an inner header or body, a region holding an inner layout.
      const id=(cell?.getAttribute("dhx_tabid")??cell?.getAttribute("data-cell-id")??"").replace(/^blade-(?:tab\d+|accordion\d+|head|body)-/,"");
      if(this.ids.has(id))return id;
      if(containers.get(id)?.length)return containers.get(id)![0];
    }
    return undefined;
  }
  /** Where the focus goes for region $id: the header of a collapsed panel holding it, its tab or section, or the region. */
  private anchor(id:string):HTMLElement|undefined{
    const {layout,checked,tabbed,sectioned}=this.current,root=layout.getRootNode() as HTMLElement|undefined;
    const collapsed=[id,...[...checked.containers].filter(([,inside])=>inside.includes(id)).map(([container])=>container)]
      .find(cell=>checked.collapsable.has(cell)&&layout.getCell(cell).config.collapsed===true);
    if(collapsed)return root?.querySelector<HTMLElement>(`[data-cell-id="${collapsed}"] > .dhx_layout-cell-header`)??undefined;
    const control=tabbed.get(id)?.control(id)??sectioned.get(id)?.control(id);
    if(control)return control;
    // The region itself, focusable for the moment (a container, not a stop of the tab order).
    const carrier=this.carriers!.get(id)!.element;
    carrier.tabIndex=-1;carrier.addEventListener("blur",()=>carrier.removeAttribute("tabindex"),{once:true});
    return carrier;
  }
  /** The hidden element of the page holding the carriers whose slot is not drawn (in the document: frames keep their state). */
  private holder():HTMLElement{
    if(!this.parking){this.parking=document.createElement("div");this.parking.hidden=true;this.parking.className="blade-page-holder";}
    if(!this.parking.isConnected)document.body.append(this.parking);
    return this.parking;
  }
  /** Whether the `narrow` tree is shown (false without one). */
  get narrow():boolean{return this.current.narrow;}
  private headCell(id:string):string{return `blade-head-${id}`;}
  private bodyCell(id:string):string{return `blade-body-${id}`;}
  /** A headed region's node is a `region` named by its title and the spoken count (the visual digit is hidden). */
  private landmarks():void{
    if(this.destroyed)return;
    for(const id of this.current.checked.headed.keys()){
      const node=this.host.querySelector(`[data-cell-id="${id}"]`);
      if(!node)continue;
      const name=`${this.prefix}${id}-title ${this.prefix}${id}-count`;
      if(node.getAttribute("role")!=="region")node.setAttribute("role","region");
      if(node.getAttribute("aria-labelledby")!==name)node.setAttribute("aria-labelledby",name);
    }
  }
  private paintHeader(id:string):void{
    const head=this.heads.get(id)!,shown=head.count===null?"":head.count.toLocaleString(locale());
    head.title.textContent=head.label;
    head.badge.textContent=shown;head.badge.hidden=head.count===null;
    head.spoken.textContent=head.count===null?"":t("{count} elem",{count:shown});
  }
  /** The cell of a declared region (a mount target of every component); an undeclared id throws `Error`. */
  cell(id:string):LayoutCell{
    this.region(id);
    const carrier=this.carriers?.get(id);
    return carrier?carrier.layout.getCell("blade-region"):this.frame(this.current,id);
  }
  /**
   * Changes the title (plain text, 1–150 characters) or the count (a non-negative integer, `null` hides the badge) of
   * an inner region declared with a `header` (in either tree); keys left out keep their value. Another id throws
   * `Error`, other changes `TypeError`.
   */
  header(id:string,changes:{label?:string;count?:number|null}):void{
    this.region(id);
    const head=this.heads.get(id);
    if(!head)throw new Error(`61ade: PageLayout region "${id}" has no header.`);
    const fail=(reason:string):never=>{throw new TypeError(`61ade: PageLayout.header: ${reason}.`);};
    if(!changes||typeof changes!=="object"||Array.isArray(changes))fail("changes is an object");
    for(const key of Object.keys(changes))if(key!=="label"&&key!=="count")fail(`unsupported change "${key}"`);
    const {label,count}=changes;
    if(label!==undefined&&(typeof label!=="string"||!label.trim()||label.length>150))fail("label is text of 1 to 150 characters");
    if(count!==undefined&&count!==null&&!(Number.isSafeInteger(count)&&count>=0))fail("count is a non-negative integer or null");
    if(this.destroyed)return;
    if(label!==undefined)head.label=label;
    if(count!==undefined)head.count=count;
    this.paintHeader(id);
  }
  /**
   * Puts content into a declared region: a Suite widget, a public component or a plain element (kept in its region
   * when Suite redraws it, released with this layout). A region holds either attached content or mounted components.
   */
  attach(id:string,content:Mountable):void{if(!this.destroyed)attachContent(this.cell(id),content,this.released.signal);}
  /**
   * What a region without content shows (nothing mounted or attached, also after its component was destroyed): the
   * default text, the region's own text, or while busy the loading indicator; content replaces it. A tab or section
   * region is its component's (with `narrow`, the page's for every region).
   */
  placeholder(id:string,options:RegionPlaceholder):void{
    this.region(id);
    if(this.destroyed)return;
    const owner=this.owner(id);
    if(owner)owner.placeholder(id,options);else applyPlaceholder("PageLayout",this.statuses.get(id)!,options);
  }
  /**
   * Marks a region whose content is about to change (`true`) or ends the mark (`false`): the loading indicator over its
   * content after the usual delay, `aria-busy` on the content. Mounting or replacing content keeps it; only this call
   * and destroying the layout end it. A tab or section region is its component's (with `narrow`, the page's).
   */
  busy(id:string,on:boolean):void{
    this.region(id);
    if(this.destroyed)return;
    const owner=this.owner(id);
    if(owner)owner.busy(id,on);else hold("PageLayout",this.statuses.get(id)!,on);
  }
  /** The tabs or accordion whose own placeholder a region has (none with `narrow`: the carrier's is the page's). */
  private owner(id:string):Tabs|Accordion|undefined{return this.carriers?undefined:this.current.tabbed.get(id)??this.current.sectioned.get(id);}
  /** Whether a `collapsable` leaf is collapsed; another id throws `Error`. */
  isCollapsed(id:string):boolean{return this.collapsible(id).config.collapsed===true;}
  /** Collapses a `collapsable` leaf to its header for now (not kept); unchanged when it is collapsed. Returns `true`. */
  collapse(id:string):boolean{return this.set(id,true);}
  /** Expands a `collapsable` leaf for now (not kept); unchanged when it is open. Returns `false` (not collapsed). */
  expand(id:string):boolean{return this.set(id,false);}
  /** Throws `Error` unless $id is a content region (a region holding an inner layout has its regions' content). */
  private region(id:string):void{
    if(this.current.checked.containers.has(id))throw new Error(`61ade: PageLayout region "${id}" holds an inner layout; use its regions.`);
    if(!this.ids.has(id))throw new Error(`61ade: PageLayout has no region "${id}".`);
  }
  /** A `collapsable` leaf of the current arrangement. */
  private collapsible(id:string):LayoutCell{
    const {containers,collapsable}=this.current.checked;
    if(!this.ids.has(id)&&!containers.has(id))throw new Error(`61ade: PageLayout has no region "${id}".`);
    if(!collapsable.has(id))throw new Error(`61ade: PageLayout region "${id}" is not collapsable.`);
    return this.current.layout.getCell(id);
  }
  private set(id:string,collapsed:boolean):boolean{
    const cell=this.collapsible(id);
    if(!this.destroyed&&(cell.config.collapsed===true)!==collapsed){
      this.transient=true;
      try{if(collapsed)cell.collapse();else cell.expand();}finally{this.transient=false;}
    }
    return this.isCollapsed(id);
  }
  /** The tabs of the `tabs` branch holding region $id (of the current arrangement). */
  tabsOf(id:string):TabsApi|undefined{return this.current.tabbed.get(id);}
  /** The accordion of the `accordion` branch holding region $id (of the current arrangement). */
  accordionOf(id:string):AccordionApi|undefined{return this.current.sectioned.get(id);}
  protected dispose():void{
    this.observer?.disconnect();this.released.abort();
    const current=this.current;
    current.released.abort();
    for(const tabs of current.tabGroups)tabs.destroy();
    for(const accordion of current.accordions)accordion.destroy();
    for(const status of this.statuses.values())status.destroy();
    current.layout.destructor();
    // With `narrow`: the carriers (what is still mounted there goes with them, as with the panels), then the frame.
    if(this.carriers){for(const carrier of this.carriers.values())carrier.layout.destructor();this.layout.destructor();this.parking?.remove();}
  }
}

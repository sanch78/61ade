import { Layout, awaitRedraw } from "@dhtmlx/suite";
import type { Accordion as AccordionApi, AccordionEvents, AccordionOptions, AccordionSection, LayoutCell, Mountable, MountTarget } from "../../api/types";
import { attachContent } from "../../api/services";
import { UiPreferences } from "../../UiPreferences";
import { Component } from "../list/component";

const SECTION=/^[a-z][a-z0-9_-]{0,63}$/;
const KEYS=new Set(["id","label","disabled"]);
let instances=0;

/** Checks the declared sections (1–12, unique ids `[a-z][a-z0-9_-]*`, plain-text labels of 1–80 characters); throws `TypeError`. */
export function checkSections(sections:unknown,owner="Accordion"):AccordionSection[]{
  const fail=(reason:string):never=>{throw new TypeError(`61ade: ${owner}: ${reason}.`);};
  if(!Array.isArray(sections)||!sections.length||sections.length>12)fail("sections is a list of 1 to 12 sections");
  const ids=new Set<string>();
  for(const section of sections as unknown[]){
    if(!section||typeof section!=="object"||Array.isArray(section))fail("a section is an object");
    const value=section as Record<string,unknown>;
    for(const key of Object.keys(value))if(!KEYS.has(key))fail(`unsupported section option "${key}"`);
    if(typeof value.id!=="string"||!SECTION.test(value.id)||ids.has(value.id))fail(`section id "${String(value.id)}" is missing, invalid or repeated`);
    if(typeof value.label!=="string"||!value.label.trim()||value.label.length>80)fail("a section label is text of 1 to 80 characters");
    if(value.disabled!==undefined&&typeof value.disabled!=="boolean")fail('"disabled" is a boolean');
    ids.add(value.id as string);
  }
  if((sections as AccordionSection[]).every(section=>section.disabled))fail("at least one section is enabled");
  return (sections as AccordionSection[]).map(section=>({...section}));
}

/**
 * Stacked collapsible sections as a public component (`app.components.Accordion`, docs/toolkit.md#accordion): one
 * Layout cell per section under its Suite cell header (plain-text label), a mount target of every component. Open
 * sections share the height; a closed one keeps only its header. Every section stays rendered and a closed one is
 * hidden with CSS, so its content keeps its state and may repaint while closed (Suite's own collapsed cell leaves
 * its content out of the render, the Tabbar pitfall). One section is open at a time unless `multiple`; the open
 * sections are kept per page and user when an `id` is given. The header is a button (`aria-expanded`,
 * `aria-controls`) over a labelled `region`; Enter and Space toggle, the arrows, Home and End move between headers.
 */
export class Accordion extends Component<AccordionEvents> implements AccordionApi{
  readonly layout:Layout;
  private sections:AccordionSection[];
  private multiple:boolean;
  private prefix:string;
  private opened:Set<string>;
  private released=new AbortController();
  private preferences?:UiPreferences;
  private observer?:MutationObserver;
  constructor(context:{user:string},options:AccordionOptions){
    super(options);
    this.sections=checkSections(options?.sections);
    if(options.id!==undefined&&(typeof options.id!=="string"||!/^[a-z][a-z0-9_.-]*$/.test(options.id)))throw new TypeError("61ade: Accordion: id is the preference key ([a-z][a-z0-9_.-]*).");
    if(options.multiple!==undefined&&typeof options.multiple!=="boolean")throw new TypeError('61ade: Accordion: "multiple" is a boolean.');
    this.multiple=options.multiple===true;
    const enabled=this.sections.filter(section=>!section.disabled).map(section=>section.id);
    if(options.open!==undefined){
      const open=options.open;
      if(!Array.isArray(open)||open.some(id=>!enabled.includes(id))||new Set(open).size!==open.length)throw new TypeError("61ade: Accordion: open lists enabled sections, each once.");
      if(!this.multiple&&open.length!==1)throw new TypeError("61ade: Accordion: without multiple, open names exactly one section.");
    }
    this.prefix=`blade-accordion${++instances}-`;
    if(options.id)this.preferences=new UiPreferences(context.user,options.id);
    const remembered=this.preferences?.sections()?.filter(id=>enabled.includes(id));
    let open=options.open??remembered??[enabled[0]];
    if(!this.multiple)open=[open[0]??enabled[0]];
    this.opened=new Set(open);
    this.layout=new Layout(this.host,{type:"none",css:"blade-accordion",
      rows:this.sections.map(section=>({id:this.cellId(section.id),header:section.label,css:this.sectionCss(section.id)}))} as any);
    this.bind(options.signal);
  }
  private sectionCss(id:string):string{return "blade-accordion__section"+(this.opened.has(id)?" blade-accordion__section--open":" blade-accordion__section--closed");}
  private cellId(id:string):string{return this.prefix+id;}
  private known(id:string):AccordionSection{
    const section=this.sections.find(section=>section.id===id);
    if(!section)throw new Error(`61ade: Accordion has no section "${id}".`);
    return section;
  }
  /** Suite renders where the component is attached: the roles and the header handlers live on its root. */
  override mount(target:MountTarget):void{
    super.mount(target);
    void awaitRedraw().then(()=>{
      const root=this.layout.getRootNode() as HTMLElement|null|undefined;
      if(this.destroyed||!root)return;
      const signal=this.released.signal;
      root.addEventListener("click",event=>{const id=this.headerOf(event.target);if(id!==undefined)this.toggle(id);},{signal});
      root.addEventListener("keydown",event=>this.key(event),{signal});
      this.observer?.disconnect();
      this.observer=new MutationObserver(()=>this.roles());
      this.observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["class","tabindex","aria-label"]});
      this.roles();
    });
  }
  /** The section whose own header holds $target (not a header of a Layout nested in a section). */
  private headerOf(target:EventTarget|null):string|undefined{
    const header=(target as HTMLElement|null)?.closest?.(".dhx_layout-cell-header");
    const cell=header?.parentElement?.getAttribute("data-cell-id");
    return cell?.startsWith(this.prefix)&&this.sections.some(section=>this.cellId(section.id)===cell)?cell.slice(this.prefix.length):undefined;
  }
  private headers():HTMLElement[]{
    const root=this.layout.getRootNode() as HTMLElement|null|undefined;
    return this.sections.map(section=>root?.querySelector<HTMLElement>(`[data-cell-id="${this.cellId(section.id)}"] > .dhx_layout-cell-header`)).filter((header):header is HTMLElement=>!!header);
  }
  private key(event:KeyboardEvent):void{
    const id=this.headerOf(event.target);
    if(id===undefined||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();this.toggle(id);return;}
    const headers=this.headers().filter(header=>header.getAttribute("aria-disabled")!=="true"||header.getAttribute("aria-expanded")==="true");
    const index=headers.indexOf(event.target as HTMLElement);
    if(index<0)return;
    const next=event.key==="ArrowDown"?headers[(index+1)%headers.length]:event.key==="ArrowUp"?headers[(index-1+headers.length)%headers.length]
      :event.key==="Home"?headers[0]:event.key==="End"?headers[headers.length-1]:undefined;
    if(next){event.preventDefault();next.focus();}
  }
  /** WAI-ARIA accordion: a header button controlling a labelled region; kept on every Suite redraw. */
  private roles():void{
    const root=this.layout.getRootNode() as HTMLElement|null|undefined;
    if(!root?.querySelector)return;
    const set=(element:Element|null|undefined,name:string,value:string|null)=>{
      if(!element)return;
      if(value===null){if(element.hasAttribute(name))element.removeAttribute(name);}
      else if(element.getAttribute(name)!==value)element.setAttribute(name,value);
    };
    for(const section of this.sections){
      const cell=this.cellId(section.id),node=root.querySelector(`[data-cell-id="${cell}"]`);
      const header=node?.querySelector(":scope > .dhx_layout-cell-header"),content=node?.querySelector(":scope > .dhx_layout-cell-content");
      const open=this.opened.has(section.id);
      // A section that cannot change from its header (disabled, or the only open one without `multiple`) says so.
      const fixed=!!section.disabled||(!this.multiple&&open);
      set(header,"role","button");set(header,"id",cell+"-header");set(header,"tabindex",section.disabled?"-1":"0");
      set(header,"aria-expanded",String(open));set(header,"aria-controls",cell+"-region");
      set(header,"aria-disabled",fixed?"true":null);
      // Suite's English `click to expand` would replace the label as the accessible name.
      set(header,"aria-label",null);
      set(header?.querySelector(".dhx_layout-cell-header__title"),"role","none");
      set(content,"role","region");set(content,"id",cell+"-region");set(content,"aria-labelledby",cell+"-header");
      set(content,"aria-hidden",open?null:"true");
    }
  }
  private apply(next:Set<string>):void{
    const before=this.opened;
    this.opened=next;
    for(const section of this.sections)this.layout.getCell(this.cellId(section.id)).config.css=this.sectionCss(section.id);
    this.layout.paint();
    this.preferences?.setSections([...next]);
    for(const section of this.sections)if(before.has(section.id)&&!next.has(section.id))this.emit("toggle",{id:section.id,open:false});
    for(const section of this.sections)if(!before.has(section.id)&&next.has(section.id))this.emit("toggle",{id:section.id,open:true});
    void awaitRedraw().then(()=>{if(!this.destroyed)this.roles();});
  }
  /** The cell of a section, a mount target of every component; an undeclared id throws `Error`. */
  cell(id:string):LayoutCell{this.known(id);return this.layout.getCell(this.cellId(id));}
  /** Puts a Suite widget, a public component or a plain element into a section (released with the accordion). */
  attach(id:string,content:Mountable):void{if(!this.destroyed)attachContent(this.cell(id),content,this.released.signal);}
  /** The open sections' ids in display order. */
  openSections():string[]{return this.sections.filter(section=>this.opened.has(section.id)).map(section=>section.id);}
  /** Whether section $id is open; an undeclared id throws `Error`. */
  isOpen(id:string):boolean{this.known(id);return this.opened.has(id);}
  /** Opens a section (without `multiple`, the open one closes). Returns whether it is open; a disabled one stays closed. */
  open(id:string):boolean{
    const section=this.known(id);
    if(this.destroyed||section.disabled)return this.opened.has(id);
    if(!this.opened.has(id))this.apply(this.multiple?new Set([...this.opened,id]):new Set([id]));
    return true;
  }
  /** Closes a section (only with `multiple`: otherwise one section stays open). Returns whether it is closed. */
  close(id:string):boolean{
    const section=this.known(id);
    if(this.destroyed||!this.opened.has(id))return !this.opened.has(id);
    if(!this.multiple||section.disabled)return false;
    const next=new Set(this.opened);next.delete(id);this.apply(next);
    return true;
  }
  /** A header click: opens a closed section, closes an open one when `multiple` allows it. Returns whether it is open. */
  toggle(id:string):boolean{return this.isOpen(id)?!this.close(id):this.open(id);}
  /** Changes a section's label or disabled state; an open section cannot be disabled (`Error`). */
  update(id:string,changes:{label?:string;disabled?:boolean}):void{
    const section=this.known(id);
    if(this.destroyed)return;
    const next={...section,...changes};
    checkSections(this.sections.map(other=>other.id===id?next:other));
    if(next.disabled&&this.opened.has(id))throw new Error(`61ade: Accordion: the open section "${id}" cannot be disabled.`);
    Object.assign(section,next);
    if(changes.label!==undefined)this.layout.getCell(this.cellId(id)).config.header=next.label;
    this.layout.paint();
    void awaitRedraw().then(()=>{if(!this.destroyed)this.roles();});
  }
  protected dispose():void{this.observer?.disconnect();this.released.abort();this.layout.destructor();}
}

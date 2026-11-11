import { Layout, type Toolbar } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { ResponsiveToolbar } from "../../ResponsiveToolbar";
import { widgetIcons } from "../../WidgetIcons";
import type { CommandBar as CommandBarApi, CommandBarEvents, CommandBarOptions, CommandButton, CommandChanges, CommandItem, CommandMenu, CommandOption, CommandRange, CommandSelect, CommandToggle } from "../../api/types";
import { Component } from "./component";
import { escape } from "./fields";

const ID=/^[A-Za-z0-9_.:-]+$/;
/** A range reports at most this often while it is dragged (and once more on release). */
const THROTTLE=100;
/** Per bar: internal Suite ids (menus, options, ranges) carry `#n`, which public ids cannot hold, so bars never collide. */
let serial=0;

/** `generation` is part of the option ids: options replaced by `update` get ids the toolbar has not drawn. */
type Choice={kind:"select"|"segmented";item:CommandSelect;options:CommandOption[];value:string;generation:number};
type Range={kind:"range";item:CommandRange;value:number;emitted:number;last:number;timer?:ReturnType<typeof setTimeout>};
type Entry={kind:"button";item:CommandButton}|{kind:"toggle";item:CommandToggle;pressed:boolean}|{kind:"menu";item:CommandMenu}|Choice|Range;

const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);
const invalid=(message:string)=>new TypeError("61ade: "+message);

/**
 * The framework's responsive command bar as a public component (`app.components.CommandBar`,
 * docs/toolkit.md#commandbar): the list's own `ResponsiveToolbar`, which moves every item into one `Műveletek`
 * menu below 768 px or when the items do not fit, keeping ids, state and events. Toggles, selects and segmented choices
 * are native Suite toggle items (`twoState`, `group`: `aria-pressed` in the bar, checked menu entries in a menu); a
 * range is a native range input that stays in the bar beside the collapsed menu; a `menu` is a Suite menu button whose
 * entries are the bar's buttons (a submenu of the collapsed menu).
 */
export class CommandBar extends Component<CommandBarEvents> implements CommandBarApi{
  readonly layout:Layout;
  readonly toolbar:Toolbar;
  private bar:ResponsiveToolbar;
  private entries=new Map<string,Entry>();
  /** Suite option ids → their choice and value. */
  private optionIds=new Map<string,{id:string;value:string}>();
  private iconOnly=new Set<string>();
  private prefix=`#${++serial}`;
  private observer?:MutationObserver;
  private releaseIcons=widgetIcons();
  constructor(options:CommandBarOptions){
    super(options);
    const items=Array.isArray(options?.items)?options.items:[];
    if(options?.label!==undefined&&typeof options.label!=="string")throw invalid("CommandBar label must be text.");
    if(options?.placement!==undefined&&options.placement!=="top"&&options.placement!=="bottom")throw invalid(`invalid CommandBar placement "${String(options.placement)}".`);
    const data=items.flatMap((item,index)=>this.item(item,index===0,index===items.length-1));
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"commands",css:"blade-command-row"+(options.placement==="bottom"?" blade-command-row--bottom":"")}]});
    this.bar=new ResponsiveToolbar(undefined,{data},{id:"blade-command-menu"+this.prefix,value:t("Műveletek"),icon:"dxi dxi-view-grid"});
    this.toolbar=this.bar;
    const root=this.bar.getRootNode() as HTMLElement;
    if(options.label)root.setAttribute("aria-label",options.label);
    this.bar.events.on("click",(id:string|number)=>this.clicked(String(id)));
    if([...this.entries.values()].some(entry=>entry.kind==="range"))this.ranges(root);
    this.layout.getCell("commands").attach(this.bar);
    this.bind(options?.signal);
  }
  private id(id:unknown):string{
    if(typeof id!=="string"||!ID.test(id)||id==="blade-command-menu"||this.entries.has(id))throw invalid(`invalid or duplicate command id "${String(id)}".`);
    return id;
  }
  private suiteId(kind:string,id:string):string{return `${kind}${this.prefix}:${id}`;}
  /** The Suite items of one declared item (a group gives its buttons between separators at the bar's inner edges). */
  private item(item:CommandItem,first:boolean,last:boolean):any[]{
    if(!item||typeof item!=="object")throw invalid("a command item must be an object.");
    switch(item.type){
      case "spacer":case "separator":return [{type:item.type}];
      case "group":{
        const children=Array.isArray(item.items)?item.items:[];
        if(children.length<2||children.length>12||children.some(child=>!child||(child.type!==undefined&&child.type!=="button"&&child.type!=="toggle")))throw invalid("a command group holds 2–12 buttons or toggles.");
        const buttons=children.map((child,index)=>{const [button]=this.item(child,false,false);return {...button,css:[button.css,"blade-command--grouped",index===0?"blade-command--first":"",index===children.length-1?"blade-command--last":""].filter(Boolean).join(" ")};});
        return [...(first?[]:[{type:"separator"}]),...buttons,...(last?[]:[{type:"separator"}])];
      }
      case "menu":{
        const id=this.id(item.id),children=Array.isArray(item.items)?item.items:[];
        if(typeof item.label!=="string")throw invalid(`command "${id}" needs a label.`);
        if(!children.length||children.length>12||children.some(child=>!child||(child.type!==undefined&&child.type!=="button"&&child.type!=="separator"))||!children.some(child=>child.type!=="separator"))
          throw invalid("a command menu holds 1–12 buttons and separators, at least one button.");
        this.entries.set(id,{kind:"menu",item});
        if(item.iconOnly)this.iconOnly.add(id);
        return [{id:this.suiteId("menu",id),value:escape(item.label),...(item.icon?{icon:item.icon}:{}),
          css:["blade-command--menu",item.iconOnly?"blade-command--icon":""].filter(Boolean).join(" "),
          ...(item.iconOnly?{tooltip:item.label}:{}),...(item.disabled?{disabled:true}:{}),...(item.hidden?{hidden:true}:{}),
          items:children.map(child=>child.type==="separator"?{type:"separator"}:this.item(child,false,false)[0])}];
      }
      case "toggle":{
        const id=this.id(item.id);
        this.entries.set(id,{kind:"toggle",item,pressed:item.pressed===true});
        return [{...this.button(id,item),twoState:true,active:item.pressed===true}];
      }
      case "select":case "segmented":{
        const id=this.id(item.id),options=this.options(item.options);
        const value=item.value===undefined?options[0].value:String(item.value);
        if(!options.some(option=>option.value===value))throw invalid(`the value of command "${id}" is not one of its options.`);
        const entry:Choice={kind:item.type,item:item as CommandSelect,options,value,generation:0};
        this.entries.set(id,entry);
        if(item.iconOnly)this.iconOnly.add(id);
        return [{id:this.suiteId(item.type,id),value:escape(this.caption(entry)),tooltip:this.caption(entry),
          ...(item.type==="select"&&(item as CommandSelect).icon?{icon:(item as CommandSelect).icon}:{}),
          css:["blade-command--"+item.type,item.type==="select"&&item.iconOnly?"blade-command--icon":""].filter(Boolean).join(" "),
          ...(item.type==="segmented"?{bladeInline:true}:{}),...(item.disabled?{disabled:true}:{}),...(item.hidden?{hidden:true}:{}),
          items:this.optionItems(id,entry)}];
      }
      case "range":{
        const id=this.id(item.id);
        if(!finite(item.min)||!finite(item.max)||item.min>=item.max||(item.step!==undefined&&(!finite(item.step)||item.step<=0))||(item.value!==undefined&&!finite(item.value)))
          throw invalid(`command range "${id}" needs numeric min < max, a positive step and a numeric value.`);
        if(item.valueLabel!==undefined&&typeof item.valueLabel!=="boolean"&&typeof item.valueLabel!=="function")throw invalid(`the valueLabel of command range "${id}" must be a boolean or a function.`);
        const value=this.clamp(item,item.value??item.min);
        this.entries.set(id,{kind:"range",item,value,emitted:value,last:0});
        return [{id:this.suiteId("range",id),type:"customHTML",css:"blade-command--range",bladePinned:true,html:this.rangeHtml(id),...(item.hidden?{hidden:true}:{})}];
      }
      case undefined:case "button":{
        const id=this.id(item.id);
        this.entries.set(id,{kind:"button",item});
        return [this.button(id,item)];
      }
      default:throw invalid(`unknown command item type "${String((item as {type?:unknown}).type)}".`);
    }
  }
  /**
   * An icon-only button keeps its label as the (visually hidden) text: the accessible name and the collapsed menu's text.
   * A pinned one stays in the bar beside the collapsed menu.
   */
  private button(id:string,item:CommandButton|CommandToggle):any{
    if(typeof item.label!=="string")throw invalid(`command "${id}" needs a label.`);
    if(item.pinned!==undefined&&typeof item.pinned!=="boolean")throw invalid(`the pinned flag of command "${id}" is true or false.`);
    if(item.iconOnly)this.iconOnly.add(id);
    return {id,value:escape(item.label),...(item.icon?{icon:item.icon}:{}),
      css:[item.type==="toggle"?"blade-command--toggle":"",item.iconOnly?"blade-command--icon":""].filter(Boolean).join(" ")||undefined,
      ...(item.iconOnly?{tooltip:item.label}:{}),...(item.disabled?{disabled:true}:{}),...(item.hidden?{hidden:true}:{}),...(item.pinned?{bladePinned:true}:{})};
  }
  private options(options:unknown):CommandOption[]{
    if(!Array.isArray(options)||options.length<2||options.length>20)throw invalid("a command choice needs 2–20 options.");
    const values=new Set<string>();
    for(const option of options){
      if(!option||typeof option.value!=="string"||typeof option.label!=="string"||values.has(option.value))throw invalid("command choice options need a unique text value and a label.");
      values.add(option.value);
    }
    return options.map(option=>({value:option.value,label:option.label,...(typeof option.icon==="string"?{icon:option.icon}:{})}));
  }
  /** `label: chosen option` (a select with only its icon shows the same text as its tooltip). */
  private caption(entry:Choice):string{return `${entry.item.label}: ${entry.options.find(option=>option.value===entry.value)!.label}`;}
  private optionItems(id:string,entry:Choice):any[]{
    const group=this.suiteId(entry.kind,id);
    for(const [key,option] of this.optionIds)if(option.id===id)this.optionIds.delete(key);
    return entry.options.map((option,index)=>{
      const suiteId=this.optionId(id,entry,index);
      this.optionIds.set(suiteId,{id,value:option.value});
      const segmented=entry.kind==="segmented",onlyIcon=segmented&&entry.item.iconOnly&&option.icon;
      return {id:suiteId,value:escape(option.label),group,twoState:true,active:option.value===entry.value,
        ...(option.icon&&segmented?{icon:option.icon}:{}),
        ...(segmented?{tooltip:`${entry.item.label}: ${option.label}`,
          css:["blade-command--segment",onlyIcon?"blade-command--icon":"",index===0?"blade-command--first":"",index===entry.options.length-1?"blade-command--last":""].filter(Boolean).join(" ")}:{})};
    });
  }
  private optionId(id:string,entry:Choice,index:number):string{return `${this.suiteId("option",id)}:${entry.generation}:${index}`;}
  private clicked(suiteId:string):void{
    const option=this.optionIds.get(suiteId);
    if(option){
      const entry=this.entries.get(option.id) as Choice,changed=entry.value!==option.value;
      this.choose(option.id,entry,option.value);
      if(changed)this.emit("change",{id:option.id,value:option.value});
      return;
    }
    const entry=this.entries.get(suiteId);
    if(entry?.kind==="button")this.emit("click",{id:suiteId});
    else if(entry?.kind==="toggle"){
      // Suite has flipped the item already; the bar's own state decides (also against a group handler).
      entry.pressed=!entry.pressed;
      this.bar.setItem(suiteId,{active:entry.pressed});
      this.emit("toggle",{id:suiteId,pressed:entry.pressed});
    }
  }
  /** Marks $value chosen (every option's `active`, the caption). */
  private choose(id:string,entry:Choice,value:string):void{
    entry.value=value;
    entry.options.forEach((option,index)=>this.bar.setItem(this.optionId(id,entry,index),{active:option.value===value}));
    const caption=this.caption(entry);
    this.bar.setItem(this.suiteId(entry.kind,id),{value:escape(caption),tooltip:caption});
  }
  private clamp(item:CommandRange,value:number):number{
    const step=item.step??1,stepped=item.min+Math.round((value-item.min)/step)*step;
    return Math.min(item.max,Math.max(item.min,Number(stepped.toFixed(10))));
  }
  private rangeText(entry:Range):string{
    const label=entry.item.valueLabel;
    if(typeof label!=="function")return String(entry.value);
    try{return String(label(entry.value));}catch(error){console.error("61ade: command range valueLabel failed",error);return String(entry.value);}
  }
  /** The range's markup; its value is set on the element (`sync`), so redrawing never moves a dragged thumb. */
  private rangeHtml(id:string):string{
    const entry=this.entries.get(id) as Range,item=entry.item,label=escape(item.label);
    return `<label class="blade-command-range" title="${label}"><span class="blade-command-range__label">${label}</span>`
      +`<input type="range" data-blade-range="${escape(id)}" min="${item.min}" max="${item.max}" step="${item.step??1}" value="${entry.value}"${item.disabled?" disabled":""}>`
      +(item.valueLabel?`<output class="blade-command-range__value" aria-hidden="true"></output>`:"")+`</label>`;
  }
  /** Ranges: delegated input events, keys kept from the toolbar's arrow navigation, values restored after a redraw. */
  private ranges(root:HTMLElement):void{
    const entryOf=(target:EventTarget|null)=>{
      const input=target instanceof HTMLInputElement&&target.dataset.bladeRange?target:undefined;
      const entry=input?this.entries.get(input.dataset.bladeRange!):undefined;
      return input&&entry?.kind==="range"?{input,entry}:undefined;
    };
    root.addEventListener("input",event=>{
      const found=entryOf(event.target);if(!found)return;
      found.entry.value=this.clamp(found.entry.item,found.input.valueAsNumber);
      this.sync(found.input,found.entry);this.report(found.entry,false);
    });
    root.addEventListener("change",event=>{const found=entryOf(event.target);if(found)this.report(found.entry,true);});
    root.addEventListener("keydown",event=>{if(entryOf(event.target)&&/^(Arrow|Home$|End$|Page)/.test(event.key))event.stopPropagation();},{capture:true});
    const restore=()=>root.querySelectorAll<HTMLInputElement>("input[data-blade-range]").forEach(input=>{const entry=this.entries.get(input.dataset.bladeRange!);if(entry?.kind==="range")this.sync(input,entry);});
    this.observer=new MutationObserver(restore);
    this.observer.observe(root,{childList:true,subtree:true});
    restore();
  }
  private sync(input:HTMLInputElement,entry:Range):void{
    if(input.valueAsNumber!==entry.value)input.value=String(entry.value);
    const text=this.rangeText(entry);
    input.setAttribute("aria-label",entry.item.label);
    input.setAttribute("aria-valuetext",text);
    const output=input.nextElementSibling;
    if(output instanceof HTMLOutputElement&&output.textContent!==text)output.textContent=text;
  }
  /** `change` at most every 100 ms while dragging; the last value always follows ($final: the release). */
  private report(entry:Range,final:boolean):void{
    clearTimeout(entry.timer);entry.timer=undefined;
    const send=()=>{entry.timer=undefined;entry.last=Date.now();if(entry.value!==entry.emitted){entry.emitted=entry.value;this.emit("change",{id:entry.item.id,value:entry.value});}};
    const wait=THROTTLE-(Date.now()-entry.last);
    if(final||wait<=0)send();else entry.timer=setTimeout(send,wait);
  }
  /** Changes one item's label (an icon-only button's tooltip too), icon, state, value or options (also while it sits in the collapsed menu). */
  update(id:string,changes:CommandChanges):void{
    const entry=this.destroyed?undefined:this.entries.get(id);
    if(!entry||!changes||typeof changes!=="object")return;
    if(changes.label!==undefined&&typeof changes.label!=="string")throw invalid("a command label must be text.");
    if(entry.kind==="menu"){
      if(changes.label!==undefined)entry.item={...entry.item,label:changes.label};
      this.state(this.suiteId("menu",id),{...(changes.label!==undefined?{value:escape(changes.label),...(this.iconOnly.has(id)?{tooltip:changes.label}:{})}:{}),...(changes.icon!==undefined?{icon:changes.icon}:{})},changes);
    }else if(entry.kind==="button"||entry.kind==="toggle"){
      const values={...(changes.label!==undefined?{value:escape(changes.label),...(this.iconOnly.has(id)?{tooltip:changes.label}:{})}:{}),...(changes.icon!==undefined?{icon:changes.icon}:{})};
      if(entry.kind==="toggle"&&changes.pressed!==undefined){entry.pressed=changes.pressed===true;Object.assign(values,{active:entry.pressed});}
      this.state(id,values,changes);
    }else if(entry.kind==="range")this.updateRange(id,entry,changes);
    else{
      const suiteId=this.suiteId(entry.kind,id);
      if(changes.label!==undefined)entry.item={...entry.item,label:changes.label};
      if(changes.options!==undefined){
        entry.options=this.options(changes.options);
        if(!entry.options.some(option=>option.value===entry.value))entry.value=entry.options[0].value;
        entry.generation++;
        this.bar.setChildren(suiteId,this.optionItems(id,entry));
      }
      if(changes.value!==undefined){
        const value=String(changes.value);
        if(!entry.options.some(option=>option.value===value))throw invalid(`the value of command "${id}" is not one of its options.`);
        entry.value=value;
      }
      this.choose(id,entry,entry.value);
      this.state(suiteId,{...(changes.icon!==undefined&&entry.kind==="select"?{icon:changes.icon}:{})},changes);
    }
  }
  private state(suiteId:string,values:Record<string,unknown>,changes:CommandChanges):void{
    if(changes.disabled!==undefined)values.disabled=changes.disabled===true;
    if(changes.hidden!==undefined)values.hidden=changes.hidden===true;
    if(Object.keys(values).length)this.bar.setItem(suiteId,values);
  }
  private updateRange(id:string,entry:Range,changes:CommandChanges):void{
    const min=changes.min??entry.item.min,max=changes.max??entry.item.max;
    if(!finite(min)||!finite(max)||min>=max||(changes.value!==undefined&&!finite(changes.value)))throw invalid(`command range "${id}" needs numeric min < max and a numeric value.`);
    const markup=changes.label!==undefined||changes.min!==undefined||changes.max!==undefined||changes.disabled!==undefined;
    entry.item={...entry.item,min,max,...(changes.label!==undefined?{label:changes.label}:{}),...(changes.disabled!==undefined?{disabled:changes.disabled===true}:{})};
    entry.value=entry.emitted=this.clamp(entry.item,changes.value!==undefined?changes.value as number:entry.value);
    const suiteId=this.suiteId("range",id);
    this.state(suiteId,markup?{html:this.rangeHtml(id)}:{},{hidden:changes.hidden});
    const input=(this.bar.getRootNode() as HTMLElement).querySelector<HTMLInputElement>(`input[data-blade-range="${CSS.escape(id)}"]`);
    if(input)this.sync(input,entry);
  }
  value(id:string):boolean|string|number|undefined{
    const entry=this.entries.get(id);
    return entry?.kind==="toggle"?entry.pressed:entry?.kind==="range"||entry?.kind==="select"||entry?.kind==="segmented"?entry.value:undefined;
  }
  protected dispose():void{
    for(const entry of this.entries.values())if(entry.kind==="range")clearTimeout(entry.timer);
    this.observer?.disconnect();this.bar.disposeResponsive();this.releaseIcons();this.layout.destructor();
  }
}

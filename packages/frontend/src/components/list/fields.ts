import { t } from "../../I18n";
import { optionText } from "../../RecordPresentation";
import "../../form-section.css";
import "../../form-row.css";
import { fileInput } from "../../FilePicker";
import { type Form, type Window, awaitRedraw } from "@dhtmlx/suite";
import { resizeMotion } from "../../Motion";
import { extensions, fieldTypeOf } from "../../app/registries";
import type { FieldMetadata, FormSections } from "../../api/types";
import { calendarDate, dateValue, fieldActive, fileDisplay, sectionReveal } from "../../FormValidation";
import type { ActionDefinition, FieldDefinition } from "./types";

/** Form item factories and action helpers shared by the list, its forms and the public `RecordForm`. */
export const escape=(s:unknown)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
/** Rejection marker of a confirmation the user declined (no error dialog). */
export const DECLINED=Symbol("declined");
const ACTION_ICONS:Record<string,string>={create:"bi bi-plus-lg",update:"bi bi-pencil",delete:"bi bi-trash",password:"bi bi-key",get:"bi bi-info-circle"};
export const actionIcon=(action:Pick<ActionDefinition,"name"|"icon"|"upload">)=>action.icon??ACTION_ICONS[action.name]??(action.upload?"bi bi-upload":"bi bi-check-lg");
/** Protocol values a command sends itself; an action with only these fields runs without a form. */
export const technical=(field:FieldDefinition)=>field.name==="revision"||field.name==="preview"&&field.type==="checkbox";
/** Whether a Suite Form item (or a nested `rows`/`cols` item of it) carries $name. */
const named=(item:any,name:string):boolean=>!!item&&typeof item==="object"&&(item.name===name||[...(Array.isArray(item.rows)?item.rows:[]),...(Array.isArray(item.cols)?item.cols:[])].some(child=>named(child,name)));
/**
 * The Form item of a field: its registered field type (`field.editor`, `app.fieldTypes`) when there is one and it
 * returns an item of the field's name, otherwise (unknown editor, a throw, a malformed item: logged) the storage
 * type's built-in item. The server validates the value by the storage type either way.
 */
export const input=(f:FieldDefinition,value:unknown,readOnly=false):any=>{
  const item=fieldInput(f,value,readOnly);
  return readOnly?{...item,css:[item.css,"blade-field--readonly"].filter(Boolean).join(" ")}:item;
};
const fieldInput=(f:FieldDefinition,value:unknown,readOnly:boolean):any=>{
  const type=fieldTypeOf(f);
  if(type){
    try{const item=type.input(f as FieldMetadata,value,readOnly);if(named(item,f.name))return item;console.error(`61ade: field type "${(f as FieldMetadata).editor}" returned no Form item named "${f.name}".`);}
    catch(error){console.error(`61ade: field type "${(f as FieldMetadata).editor}" failed`,error);}
  }
  return builtinInput(f,value,readOnly);
};
/** A field shown with its value and never sent (`readOnly` metadata: a display field or one the actor may not write). */
export const shownOnly=(field:FieldDefinition)=>field.readOnly===true;
/** The item showing a read-only choice's option label beside its hidden raw value. */
const shownName=(name:string)=>name+"__shown";
const choice=(field:FieldDefinition)=>field.type==="select"||field.type==="multiselect"||field.type==="checkbox";
const checked=(value:unknown)=>value===true||String(value)==="1";
const rawChoice=(field:FieldDefinition,value:unknown)=>Array.isArray(value)?value.join(","):field.type==="checkbox"?(checked(value)?"1":"0"):String(value??"");
const choiceText=(field:FieldDefinition,value:unknown)=>field.type==="checkbox"?field.options[checked(value)?"1":"0"]??t(checked(value)?"Igen":"Nem"):optionText(field,rawChoice(field,value));
/** Sets a field rendered read-only by `input` (a choice: its raw value and its shown label). */
export function setShown(form:Form,field:FieldDefinition,value:unknown):void{
  if(!choice(field)){(form.getItem(field.name) as any)?.setValue(value??"");return;}
  (form.getItem(field.name) as any)?.setValue(rawChoice(field,value));(form.getItem(shownName(field.name)) as any)?.setValue(choiceText(field,value));
}
/** Name prefix of a section's disclosure button (`<prefix><n>`) and fieldset (`<prefix><n>_body`); no field name starts with `_`. */
const SECTION="__section";
const BODY="blade-form-section__body",CLOSED=" blade-form-section__body--closed";
/** The section labels of $fields in form order. */
const sectionsOf=(fields:FieldDefinition[])=>[...new Set(fields.map(field=>field.section).filter((label):label is string=>!!label))];
/** Whether the section $label of $fields is fixed (always open, a plain heading; the server keeps one value per section). */
const fixedSection=(fields:FieldDefinition[],label:string)=>fields.some(field=>field.section===label&&field.sectionCollapsible===false);
/** Whether $value fills a field: a non-empty value; an unchecked checkbox and an empty choice count as empty. */
const filled=(field:FieldDefinition,value:unknown)=>Array.isArray(value)?value.length>0:value!==undefined&&value!==null&&value!==false&&String(value).trim()!==""&&!(field.type==="checkbox"&&String(value)==="0");
/**
 * Accordion sections (`formSections` other than "panels"): the section cell; its header, the disclosure button's cell
 * carrying the Suite cell header classes of the Accordion component (theme and chevron, admin.css); a still (fixed) one.
 */
const FLUSH=" blade-form-section--flush",ACCORDION="blade-form-section--accordion",HEADING="dhx_layout-cell-header dhx_layout-cell-header--row blade-form-section__heading",MULTIPLE=" blade-form-section__heading--multiple",STILL=" blade-form-section--still";
/** A section-filling field's section (`sectionFill`, form-section.css) and its required mark on the header. */
const FILL=" blade-form-section--fill",REQUIRED=" blade-form-section--required";
/** $item with the label of its item $name for screen readers only (Suite `hiddenLabel`): the section's header shows it. */
const labelHidden=(item:any,name:string):any=>!item||typeof item!=="object"?item:item.name===name?{...item,hiddenLabel:true}:{...item,
  ...(Array.isArray(item.rows)?{rows:item.rows.map((child:any)=>labelHidden(child,name))}:{}),...(Array.isArray(item.cols)?{cols:item.cols.map((child:any)=>labelHidden(child,name))}:{})};
/** Whether a Suite Form item (or a nested one) is required. */
const requiredIn=(item:any):boolean=>!!item&&typeof item==="object"&&(item.required===true||[...(Array.isArray(item.rows)?item.rows:[]),...(Array.isArray(item.cols)?item.cols:[])].some(requiredIn));
/** The sections of an accordion form that start open: without `multiple` the first collapsible one; with it those holding a value, else the first. */
function openedAt(fields:FieldDefinition[],values:Record<string,unknown>,multiple:boolean):Set<string>{
  const collapsible=sectionsOf(fields).filter(label=>!fixedSection(fields,label));
  const filledOnes=multiple?collapsible.filter(label=>fields.some(field=>field.section===label&&filled(field,values[field.name]))):[];
  return new Set(filledOnes.length?filledOnes:collapsible.slice(0,1));
}
/**
 * Form rows (`row`, FB-0196, form-row.css): the consecutive fields of one row key in one Suite `cols` item, each a cell
 * of its share (`rowWidth`); the row's class names its total share, which sets the width below which it stacks.
 */
const ROW="blade-form-row",CELL="blade-form-row__cell";
const rowKeys=new WeakMap<object,{key:string;shares:number}>();
/** A row-forming field (a section-filling one always spans the width). */
const rowKey=(field:FieldDefinition)=>field.sectionFill?undefined:field.row;
/** Puts $made, the item of $field, into $target: into the row its predecessor opened when it has the same row key. */
function place(target:any[],field:FieldDefinition,made:any):void{
  const key=rowKey(field);
  if(!key||!made||typeof made!=="object"){target.push(made);return;}
  const share=field.rowWidth??1,{width:_width,...item}=made;
  let row=target[target.length-1];
  if(!row||rowKeys.get(row)?.key!==key){row={cols:[]};rowKeys.set(row,{key,shares:0});target.push(row);}
  const state=rowKeys.get(row)!;state.shares+=share;
  row.css=ROW+" "+ROW+"--"+Math.min(state.shares,12);
  row.cols.push({...item,css:[item.css,CELL,share>1?CELL+"--"+share:""].filter(Boolean).join(" ")});
}
/**
 * The px share of a form row: `--blade-form-column-min` (any length; else 180 px) as a Form inside $host sees it, so a
 * value a project sets on `:root`, on its skin or on the form's classes counts. The gap between a row's cells.
 */
function columnMin(host:HTMLElement=document.body):number{
  const form=document.createElement("div"),probe=document.createElement("div");
  form.className="dhx_widget dhx_form";form.style.cssText="position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;padding:0";
  probe.style.cssText="width:var(--blade-form-column-min,180px)";form.append(probe);host.append(form);
  const width=probe.getBoundingClientRect().width;form.remove();
  return width>0?width:180;
}
const GAP=16;
/**
 * $fields with the fields of each row (`row` within one section) gathered at the place of its first field, the order
 * `formRows` shows them in: a list in another order (the singleton's details form follows the view's columns) keeps
 * its rows whole. Other fields keep their order.
 */
function gatherRows<T extends FieldDefinition>(fields:T[]):T[]{
  const out:T[]=[];
  for(const field of fields){
    const key=rowKey(field);let at=-1;
    if(key)for(let index=out.length-1;index>=0;index--)if(rowKey(out[index])===key&&out[index].section===field.section){at=index;break;}
    if(at<0)out.push(field);else out.splice(at+1,0,field);
  }
  return out;
}
/**
 * The width of a form window for $fields (FB-0196): wide enough for its widest row (the form's 2 × 20 px and a section's
 * 2 × 20 px insets, the window's border and 20 px for a scrollbar), at least $min and at most the viewport − 24 px;
 * without rows $min.
 */
export function formWindowWidth(fields:FieldDefinition[],min=560,host?:HTMLElement):number{
  let widest=0,shares=0,cells=0,previous:FieldDefinition|undefined;const unit=fields.some(rowKey)?columnMin(host):0;
  for(const field of gatherRows(fields)){
    const key=rowKey(field),joined=!!key&&!!previous&&rowKey(previous)===key&&previous.section===field.section;
    shares=joined?shares+(field.rowWidth??1):key?field.rowWidth??1:0;cells=joined?cells+1:key?1:0;
    // A lone cell takes the whole width (form-row.css `--1`) and needs none.
    if(cells>1)widest=Math.max(widest,shares*(unit+GAP)-GAP+40+(field.section?40:0)+24);
    previous=field;
  }
  return Math.min(Math.max(min,Math.ceil(widest)),innerWidth-24);
}
/**
 * Widens the form window $win, once its form is attached, when its rows need more than it was opened with: the share
 * as the window's Form sees it (`formWindowWidth` with the window as host), centred again. A full-screen phone window
 * (below 768 px) and a wide enough one stay as they are. Call it before `fitWindow`.
 */
export function widenFormWindow(win:Window,fields:FieldDefinition[]):void{
  const host=win.getContainer(),dialog=host?.closest<HTMLElement>('[role="dialog"]');
  if(!host||!dialog||innerWidth<768||!fields.some(rowKey))return;
  const box=dialog.getBoundingClientRect(),width=formWindowWidth(fields,560,host);
  if(width<=Math.round(box.width))return;
  win.setSize(width,box.height);win.setPosition(Math.max(12,(innerWidth-width)/2),box.top);
}
/**
 * The Form rows of $fields: each field's $item, the fields of one `section` gathered at the place of its first field in
 * one framed panel (docs/workspaces.md#form-sections): a fieldset under a disclosure button (collapsible), or under its
 * legend as the heading (fixed, `sectionCollapsible: false`, always open). A collapsible section starts open when one
 * of its fields holds a value in $values (the stored or preset values; a default does not count), else closed.
 * With $mode "accordion" or "accordion-multiple" the sections are accordion sections instead: the disclosure button
 * as the Accordion component's cell header (a fixed one: its legend) above the fieldset; the open sections share the
 * form's height, a fixed one keeps its own (`openedAt` names the open ones). $flush runs them edge to edge of the form
 * without the frame and the form's margin (form-section.css). Fields of one `row` share a row (`place`).
 */
export function formRows(fields:FieldDefinition[],item:(field:FieldDefinition)=>any,values:Record<string,unknown>={},mode:FormSections="panels",flush=false):any[]{
  fields=gatherRows(fields);
  const rows:any[]=[],bodies=new Map<string,any[]>(),labels=sectionsOf(fields);
  const accordion=mode==="accordion"||mode==="accordion-multiple",opened=accordion?openedAt(fields,values,mode==="accordion-multiple"):undefined;
  for(const field of fields){
    if(!field.section){place(rows,field,item(field));continue;}
    // A section-filling field (`sectionFill`, alone in its section): the header names it and carries its required mark.
    const made=field.sectionFill?labelHidden(item(field),field.type==="file"?fileDisplay(field.name):field.name):item(field);
    const fill=field.sectionFill?FILL+(requiredIn(made)?REQUIRED:""):"";
    let body=bodies.get(field.section);
    if(!body){
      const n=labels.indexOf(field.section)+1;
      bodies.set(field.section,body=[]);
      if(opened){
        const still=fixedSection(fields,field.section),open=still||opened.has(field.section);
        rows.push({css:"blade-form-section "+ACCORDION+(still?STILL:"")+(flush?FLUSH:"")+fill,rows:still?[
          {type:"fieldset",name:SECTION+n+"_body",label:field.section,css:BODY,rows:body},
        ]:[
          {type:"button",name:SECTION+n,text:field.section,view:"link",color:"secondary",css:HEADING+(mode==="accordion-multiple"?MULTIPLE:"")},
          {type:"fieldset",name:SECTION+n+"_body",css:BODY+(open?"":CLOSED),rows:body},
        ]});
      }
      else if(fixedSection(fields,field.section))rows.push({css:"blade-form-section blade-form-section--fixed"+fill,rows:[
        {type:"fieldset",name:SECTION+n+"_body",label:field.section,css:BODY,rows:body},
      ]});
      else{
        const open=fields.some(other=>other.section===field.section&&filled(other,values[other.name]));
        rows.push({css:"blade-form-section"+fill,rows:[
          {type:"button",name:SECTION+n,text:field.section,view:"link",color:"secondary",icon:open?"bi bi-chevron-down":"bi bi-chevron-right",css:"blade-form-section__toggle"},
          {type:"fieldset",name:SECTION+n+"_body",css:BODY+(open?"":CLOSED),rows:body},
        ]});
      }
    }
    place(body,field,made);
  }
  return rows;
}
/**
 * Makes the sections of a Form built by `formRows` disclosures: the button toggles its fieldset (Enter/Space, click),
 * carries `aria-expanded`/`aria-controls`, names the fieldset (a group); an error in a closed section opens it and
 * focuses its first erroneous field. Closing only hides: the values stay, are submitted and validated.
 */
function bindSections(form:Form,fields:FieldDefinition[],signal:AbortSignal,toggled?:()=>void):void{
  // Accordion sections (formRows in an accordion mode) are told by their header's classes.
  const headings=sectionsOf(fields).map((_,index)=>String((form.getItem(SECTION+(index+1)) as any)?.config?.css??"")).filter(css=>css.includes("blade-form-section__heading"));
  if(headings.length){bindAccordion(form,fields,headings[0].includes(MULTIPLE.trim()),signal);return;}
  // A fixed section has no disclosure: its legend names its group and it never closes.
  const labels=sectionsOf(fields).map(label=>fixedSection(fields,label)?"":label);
  if(!labels.some(Boolean))return;
  const button=(n:number)=>(form.getItem(SECTION+n) as any)?.getRootNode?.() as HTMLElement|undefined;
  const isOpen=(n:number)=>!String((form.getItem(SECTION+n+"_body") as any)?.getProperties?.().css??"").includes(CLOSED.trim());
  const decorate=()=>{
    if(signal.aborted)return;
    labels.forEach((label,index)=>{
      if(!label)return;
      const n=index+1,element=button(n),body=element?.closest(".blade-form-section")?.querySelector("fieldset");
      if(!element||!body)return;
      if(!body.id)body.id=(element.id||SECTION+n)+"-body";
      element.setAttribute("aria-expanded",String(isOpen(n)));element.setAttribute("aria-controls",body.id);
      body.setAttribute("aria-labelledby",element.id);
    });
  };
  const set=(n:number,open:boolean)=>{
    if(isOpen(n)===open)return false;
    (form.getItem(SECTION+n+"_body") as any).setProperties({css:BODY+(open?"":CLOSED)});
    (form.getItem(SECTION+n) as any).setProperties({icon:open?"bi bi-chevron-down":"bi bi-chevron-right"});
    return true;
  };
  const changed=()=>{decorate();void awaitRedraw().then(()=>{decorate();toggled?.();});};
  form.events.on("click",(name:string)=>{
    if(signal.aborted||!name?.startsWith(SECTION)||name.endsWith("_body"))return;
    const n=Number(name.slice(SECTION.length));
    if(set(n,!isOpen(n)))changed();
  });
  sectionReveal.set(form,names=>{
    if(signal.aborted)return;
    const opened=labels.filter((label,index)=>!!label&&fields.some(field=>field.section===label&&names.includes(field.name))&&set(index+1,true));
    if(!opened.length)return;
    changed();
    // The first erroneous field of a section that was closed takes the focus (a file field: its name input).
    const first=fields.find(field=>names.includes(field.name)&&opened.includes(field.section!));
    if(first)void awaitRedraw().then(()=>{if(!signal.aborted)(form.getItem(first.type==="file"?fileDisplay(first.name):first.name) as any)?.focus?.();});
  });
  signal.addEventListener("abort",()=>sectionReveal.delete(form),{once:true});
  decorate();void awaitRedraw().then(decorate);
  form.events.on("change",decorate);
}
/**
 * The accordion sections of a Form built by `formRows` in an accordion mode: the header button controls its labelled
 * fieldset (`aria-expanded`, `aria-controls`); a click, Enter or Space opens a closed section and, without $multiple,
 * closes the open one (one stays open: its header says `aria-disabled`); with $multiple it also closes an open one. The
 * arrows, Home and End move between the headers. A fixed section is headed by its legend and never closes. An error in
 * a closed section opens it (without $multiple: the first one, unless the open section holds an error) and focuses its
 * first erroneous field. Toggling never resizes a window: its fitted height does not depend on the open sections
 * (`fitWindow`).
 */
function bindAccordion(form:Form,fields:FieldDefinition[],multiple:boolean,signal:AbortSignal):void{
  const labels=sectionsOf(fields),numbers=labels.map((_,index)=>index+1),toggles=numbers.filter(n=>!fixedSection(fields,labels[n-1]));
  const body=(n:number)=>form.getItem(SECTION+n+"_body") as any;
  const isOpen=(n:number)=>!String(body(n)?.getProperties?.().css??"").includes(CLOSED.trim());
  const button=(n:number)=>(form.getItem(SECTION+n) as any)?.getRootNode?.() as HTMLElement|undefined;
  const set=(element:Element|null|undefined,name:string,value:string|null)=>{
    if(!element)return;
    if(value===null){if(element.hasAttribute(name))element.removeAttribute(name);}
    else if(element.getAttribute(name)!==value)element.setAttribute(name,value);
  };
  const decorate=()=>{
    if(signal.aborted)return;
    for(const n of toggles){
      const element=button(n),fieldset=element?.closest(".blade-form-section")?.querySelector("fieldset");
      if(!element||!fieldset)continue;
      if(!fieldset.id)fieldset.id=(element.id||SECTION+n)+"-body";
      set(fieldset,"aria-labelledby",element.id);
      set(element,"aria-expanded",String(isOpen(n)));set(element,"aria-controls",fieldset.id);
      set(element,"aria-disabled",!multiple&&isOpen(n)?"true":null);
    }
  };
  const show=(n:number,open:boolean)=>body(n).setProperties({css:BODY+(open?"":CLOSED)});
  /** Opens $n (without `multiple` closing the open one); whether anything changed. */
  const open=(n:number)=>{
    if(isOpen(n))return false;
    if(!multiple)for(const other of toggles)if(other!==n&&isOpen(other))show(other,false);
    show(n,true);return true;
  };
  const changed=()=>{decorate();void awaitRedraw().then(decorate);};
  /** A section that is a text input takes the caret at its end as soon as opening has redrawn, during the motion. */
  const focusText=(n:number)=>{
    const field=fields.find(field=>field.section===labels[n-1]&&field.sectionFill&&field.type==="textarea");
    if(!field)return;
    void awaitRedraw().then(()=>{
      if(signal.aborted||!isOpen(n)||document.activeElement!==button(n))return;
      // Suite's focus() waits for another redraw; the native control is already rendered here.
      const input=button(n)?.closest(".blade-form-section")?.querySelector("textarea");
      if(!input||input.disabled||!input.getClientRects().length)return;
      input.focus({preventScroll:true});
      input.setSelectionRange(input.value.length,input.value.length);input.scrollTop=input.scrollHeight;
    });
  };
  /** Runs $change with the theme motion (Motion.ts): the sections ease to their new heights, a closing one's fields shown until then. */
  const section=(n:number)=>button(n)?.closest<HTMLElement>(".blade-form-section");
  const moving=(change:()=>boolean)=>{
    const play=resizeMotion(toggles.map(section),"height",toggles.filter(isOpen).map(n=>section(n)?.querySelector<HTMLElement>(":scope > .blade-form-section__body")));
    const result=change();play?.();return result;
  };
  form.events.on("click",(name:string)=>{
    if(signal.aborted||!name?.startsWith(SECTION)||name.endsWith("_body"))return;
    const n=Number(name.slice(SECTION.length));
    if(!toggles.includes(n))return;
    if(moving(()=>isOpen(n)?multiple&&(show(n,false),true):open(n))){changed();if(isOpen(n))focusText(n);}
  });
  // The arrows, Home and End between the headers (Enter and Space are the native button's click).
  document.addEventListener("keydown",event=>{
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const index=toggles.findIndex(n=>button(n)===event.target);
    if(index<0)return;
    const next=event.key==="ArrowDown"?toggles[(index+1)%toggles.length]:event.key==="ArrowUp"?toggles[(index-1+toggles.length)%toggles.length]
      :event.key==="Home"?toggles[0]:event.key==="End"?toggles[toggles.length-1]:undefined;
    if(next!==undefined){event.preventDefault();button(next)?.focus();}
  },{signal});
  sectionReveal.set(form,names=>{
    if(signal.aborted)return;
    const erroneous=toggles.filter(n=>fields.some(field=>field.section===labels[n-1]&&names.includes(field.name)));
    let opened:number[]=[];
    moving(()=>(opened=(multiple?erroneous:erroneous.some(isOpen)?[]:erroneous.slice(0,1)).filter(open)).length>0);
    if(!opened.length)return;
    changed();
    const first=fields.find(field=>names.includes(field.name)&&opened.some(n=>labels[n-1]===field.section));
    if(first)void awaitRedraw().then(()=>{if(!signal.aborted)(form.getItem(first.type==="file"?fileDisplay(first.name):first.name) as any)?.focus?.();});
  });
  signal.addEventListener("abort",()=>sectionReveal.delete(form),{once:true});
  decorate();void awaitRedraw().then(decorate);
  form.events.on("change",decorate);
}
/** A label in a form row is cut on one line (form-row.css): it carries its whole text as a tooltip. */
function titleRowLabels(form:Form,fields:FieldDefinition[],signal:AbortSignal):void{
  const named=fields.filter(field=>rowKey(field));
  if(!named.length)return;
  const apply=()=>{
    if(signal.aborted)return;
    for(const field of named){
      const label=((form.getItem(shownName(field.name))??form.getItem(field.name)) as any)?.getRootNode?.()?.closest?.(".dhx_form-group")?.querySelector(":scope > .dhx_label") as HTMLElement|null;
      if(label&&label.title!==field.label)label.title=field.label;
    }
  };
  void awaitRedraw().then(apply);
  form.events.on("change",()=>{void awaitRedraw().then(apply);});
}
/**
 * Runs `bind` of the registered field types among $fields once their Form exists, shows each conditional field
 * (`visibleWhen`) only while its condition holds and empties the fields an exclusive field `clears` once it gets a
 * value, and makes the `formRows` sections disclosures; `toggled` runs after a field or section appeared or disappeared
 * (a window refits).
 * The returned release aborts their `signal`; the owner calls it when the form closes or is replaced.
 */
export function bindFieldTypes(form:Form,fields:FieldDefinition[],readOnly:(field:FieldDefinition)=>boolean=()=>false,toggled?:()=>void):()=>void{
  const controller=new AbortController(),app=extensions.app;
  bindSections(form,fields,controller.signal,toggled);
  titleRowLabels(form,fields,controller.signal);
  const conditional=fields.filter(field=>field.visibleWhen&&form.getItem(field.name));
  if(conditional.length){
    const shown=new Map<string,boolean>();
    const apply=()=>{
      if(controller.signal.aborted)return;
      const values=form.getValue() as Record<string,unknown>;let changed=false;
      for(const field of conditional){
        const active=fieldActive(field,values);
        if(shown.get(field.name)===active)continue;
        if(shown.has(field.name))changed=true;
        shown.set(field.name,active);
        // A read-only choice shows its label item; its raw value item stays hidden.
        const item=(form.getItem(shownName(field.name))??form.getItem(field.name)) as any;
        if(active)item.show();else item.hide();
      }
      if(changed)toggled?.();
    };
    apply();
    form.events.on("change",(name:string)=>{if(conditional.some(field=>field.visibleWhen!.field===name))apply();});
  }
  const exclusive=new Map(fields.filter(field=>field.clears?.length&&form.getItem(field.name)).map(field=>[field.name,field.clears!]));
  if(exclusive.size)form.events.on("change",(name:string,value:unknown)=>{
    const others=exclusive.get(name);
    if(controller.signal.aborted||!others||value===undefined||value===null||value===""||value===false)return;
    for(const other of others){
      const item=form.getItem(other) as any,field=fields.find(field=>field.name===other);
      if(!item||String(item.getValue()??"")==="")continue;
      // A read-only choice empties its raw value and its shown label together.
      if(field&&form.getItem(shownName(other)))setShown(form,field,"");else item.setValue("");
    }
  });
  for(const field of fields){
    if(field.type==="date"&&!readOnly(field)&&!fieldTypeOf(field))keepTypedDate(form,field,controller.signal);
    const type=field.type==="file"?undefined:fieldTypeOf(field);
    if(!type?.bind||!app)continue;
    try{type.bind({app,form,field:field as FieldMetadata,readOnly:readOnly(field),signal:controller.signal});}
    catch(error){console.error(`61ade: field type "${(field as FieldMetadata).editor}" bind failed`,error);}
  }
  return ()=>controller.abort();
}
/**
 * Suite 9.3 DatePicker repaints a typed date away when its popup closes; a typed valid date, or a cleared
 * field, is set again once the input leaves or the popup closes. A pick in the popup wins over earlier typing.
 */
function keepTypedDate(form:Form,field:FieldDefinition,signal:AbortSignal):void{
  const item=form.getItem(field.name) as any;
  if(!item)return;
  let typed:string|undefined;
  const settle=()=>setTimeout(()=>{
    if(signal.aborted||typed===undefined)return;
    const value=typed;typed=undefined;
    if((value===""||calendarDate(value))&&String(dateValue(item.getValue())??"")!==value){if(value==="")item.clear();else item.setValue(value);}
  });
  item.events.on("input",(value:unknown)=>{typed=String(value??"").trim();});
  item.events.on("change",(value:unknown)=>{if(String(dateValue(value)??"")!==typed)typed=undefined;});
  item.events.on("blur",settle);
  item.events.on("afterHide",settle);
}
const builtinInput=(f:FieldDefinition,value:unknown,readOnly=false):any=>f.type==="file"?fileInput(f,value,readOnly):f.type==="multiselect"&&!readOnly?{
  // Native Suite Combo with multiple selection; the kernel accepts the list or its comma-joined form.
  type:"combo",name:f.name,label:f.label,labelPosition:"top",required:f.required,multiselection:true,selectAllButton:false,css:"blade-multiselect-field",
  data:Object.entries(f.options).map(([id,value])=>({id,value})),value:String(value??f.defaultValue??"").split(",").filter(Boolean),
}:readOnly&&choice(f)?{rows:[
  // Read-only choice: the raw value in a hidden item (conditions and a preset's submission read it), its option label in
  // a readonly input (reachable, announced with the field's label; no required mark).
  {type:"input",name:f.name,hidden:true,value:rawChoice(f,value)},
  {type:"input",name:shownName(f.name),label:f.label,labelPosition:"top",readOnly:true,value:choiceText(f,value)},
]}:f.type==="checkbox"?{
  width:"100%",cols:[
    // The hidden label names the checkbox; Suite otherwise announces it as "checkbox <text>".
    {type:"checkbox",name:f.name,text:f.label,label:f.label,hiddenLabel:true,width:"content",checked:String(value??f.defaultValue??"0")==="1"||value===true,disabled:readOnly},
  ],
}:f.type==="date"&&!readOnly?{
  // Native Suite DatePicker; the value stays the `YYYY-MM-DD` string the kernel validates.
  type:"datepicker",name:f.name,label:f.label,labelPosition:"top",required:f.required,dateFormat:"%Y-%m-%d",valueFormat:"string",
  weekStart:"monday",editable:true,value:String(value??f.defaultValue??""),
}:({
  type:f.type==="select"&&!readOnly?"select":f.type==="textarea"?"textarea":"input",
  name:f.name,label:f.label,labelPosition:"top",required:!readOnly&&f.required,maxlength:f.max,
  inputType:f.type==="password"?"password":"text",readOnly,
  // Suite otherwise measures an empty textarea at zero height while the panel
  // is being attached, leaving only a one-line scrollbar-like control visible.
  ...(f.type==="textarea"?{height:120}:{}),
  // An explicit empty choice: nothing is preselected silently; required selects fail validation until chosen.
  ...(!readOnly&&f.type==="select"?{options:[...(Object.hasOwn(f.options,"")?[]:[{value:"",content:t(f.required?"— válassz —":"— nincs —")}]),...Object.entries(f.options).map(([value,content])=>({value,content}))]}:{}),
  value:f.type==="password"?"":String(value??f.defaultValue??""),
});
export const formActions=(submit:{name:string;text:string;icon?:string;color?:string},cancel=true):any=>({
  css:"blade-form-actions",
  cols:[
    ...(cancel?[{type:"button",name:"cancel",text:t("Mégse"),icon:"bi bi-x-lg",view:"flat",color:"secondary",width:"content"}]:[]),
    {type:"button",...submit,width:"content"},
  ],
});
/** Text of the shared error dialog: the field errors by label (from $fields), otherwise the message. */
export const errorText=(e:unknown,fields:FieldDefinition[]):string=>e && typeof e==="object" && "fieldErrors" in e && Object.values((e as any).fieldErrors??{}).length
  ?Object.entries((e as any).fieldErrors).map(([name,error])=>`${fields.find(f=>f.name===name)?.label??name}: ${error}`).join("\n")
  :e instanceof Error?e.message:t("Sikertelen művelet.");

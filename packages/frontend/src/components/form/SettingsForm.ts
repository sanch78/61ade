import { Form, Layout, awaitRedraw } from "@dhtmlx/suite";
import { t } from "../../I18n";
import { FormValidation, calendarDate, fieldActive, type FieldDefinition } from "../../FormValidation";
import { UiPreferences } from "../../UiPreferences";
import type { MountTarget, SettingsChip, SettingsField, SettingsForm as SettingsFormApi, SettingsFormEvents, SettingsFormOptions, SettingsGroup } from "../../api/types";
import { Component } from "../list/component";
import { bindFieldTypes, formActions, input } from "../list/fields";

const NAME=/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/;
const TYPES=new Set(["text","number","select","multiselect","textarea","checkbox","date","switch","segmented","range","color","chips"]);
/** Types that are `RecordForm` fields: their Form item, validation and editor come from the shared field factory. */
const BUILTIN=new Set(["text","number","select","multiselect","textarea","checkbox","date"]);
const CHOICES=new Set(["select","multiselect","segmented","chips"]);
const COLOR=/^#[0-9a-fA-F]{6}$/;
/** A range reports at most this often while it is dragged (and once more on release). */
const THROTTLE=100;
const invalid=(message:string)=>new TypeError("61ade: "+message);
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);
const multiple=(field:SettingsField)=>field.type==="multiselect"||field.type==="chips"&&field.multiple===true;
const optionLabel=(option:string|SettingsChip)=>typeof option==="string"?option:option.label;
/** Form items of one field beside its own name (a range's number input and unit). */
const NUMBER="__number";
/** Per form: Suite uses a checkbox group's option ids as element ids, so they carry the form's serial. */
let serial=0;

/**
 * A form of local view settings as a public component (`app.components.SettingsForm`, docs/toolkit.md#settingsform):
 * the `RecordForm` field declarations and factory (`fields.ts`), conditional fields, exclusive fields and client
 * validation, plus switch, segmented, range, colour and chip controls from native Suite Form items. Its values live in
 * the component; with `key` they are kept per page and user in `UiPreferences`. It never calls the server.
 */
export class SettingsForm extends Component<SettingsFormEvents> implements SettingsFormApi{
  readonly layout:Layout;
  private form:Form;
  private fields:SettingsField[]=[];
  private state:Record<string,unknown>={};
  private defaults:Record<string,unknown>={};
  private disabled=new Set<string>();
  private preferences?:UiPreferences;
  private validation:FormValidation;
  private releaseTypes:()=>void;
  /** Values are being put into the Form from code: its Suite change events are not the user's. */
  private setting=false;
  private shown=new Map<string,boolean>();
  private throttle=new Map<string,{last:number;timer?:ReturnType<typeof setTimeout>;emitted:unknown}>();
  private observer:MutationObserver;
  private fit?:()=>unknown;
  private serial=++serial;
  /** Names of the group fieldsets (see `dispose`). */
  private groups:string[]=[];
  constructor(context:{user:string},private options:SettingsFormOptions){
    super(options);
    if(!options||!Array.isArray(options.fields)||!options.fields.length)throw invalid("SettingsForm needs fields.");
    if(options.key!==undefined&&(typeof options.key!=="string"||!options.key.length||options.key.length>80))throw invalid("a SettingsForm key is 1–80 characters.");
    if(options.submit!==undefined&&(!options.submit||typeof options.submit.label!=="string"))throw invalid("SettingsForm submit needs a label.");
    const rows=options.fields.map(entry=>{
      if(entry&&typeof entry==="object"&&"group" in entry){
        const group=entry as SettingsGroup;
        if(typeof group.group!=="string"||!Array.isArray(group.fields)||!group.fields.length)throw invalid("a SettingsForm group needs a heading and fields.");
        const name=`blade-group-${this.groups.length}`;this.groups.push(name);
        return {type:"fieldset",name,label:group.group,css:"blade-settings__group",rows:group.fields.map(field=>this.declare(field))};
      }
      return this.declare(entry as SettingsField);
    });
    for(const field of this.fields){
      for(const other of [field.visibleWhen?.field,...(field.clears??[])])if(other!==undefined&&!this.fields.some(candidate=>candidate.name===other))throw invalid(`field "${field.name}" refers to the unknown field "${String(other)}".`);
      if(field.disabled)this.disabled.add(field.name);
    }
    for(const field of this.fields)this.defaults[field.name]=this.initial(field);
    if(options.key)this.preferences=new UiPreferences(context.user,"settings:"+options.key);
    this.state={...this.defaults,...this.accepted(options.values),...this.accepted(this.preferences?.settings())};
    // The Form items are built from the state, so every field starts with its value.
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"form",css:"blade-settings"}]});
    this.form=new Form(document.createElement("div"),{padding:16,rows:[...rows.map(row=>this.items(row)),
      ...(options.submit?[formActions({name:"blade-submit",text:options.submit.label,icon:options.submit.icon??"bi bi-check-lg",color:"primary"},false)]:[])]} as any);
    const definitions=this.fields.filter(field=>BUILTIN.has(field.type)).map(field=>this.definition(field));
    this.validation=new FormValidation(this.form,definitions,()=>this.state);
    this.releaseTypes=bindFieldTypes(this.form,definitions.map(({visibleWhen,clears,...field})=>field as FieldDefinition));
    this.form.events.on("change",(name:string,value:unknown)=>this.changed(name,value));
    this.form.events.on("click",(name:string)=>{if(name==="blade-submit"&&this.validate())this.emit("submit",{values:this.values()});});
    this.layout.getCell("form").attach(this.form);
    // Roles and chip images Suite has no option for, set again after every redraw.
    this.observer=new MutationObserver(()=>this.decorate());
    this.observer.observe(this.host,{childList:true,subtree:true});
    for(const name of this.disabled)this.enable(name,false);
    this.apply();
    this.decorate();
    this.bind(options.signal);
  }
  /** Checks one field declaration and records it; returns it for its row. */
  private declare(field:SettingsField):SettingsField{
    if(!field||typeof field!=="object"||typeof field.name!=="string"||!NAME.test(field.name)||this.fields.some(other=>other.name===field.name))throw invalid(`invalid or duplicate settings field name "${String(field?.name)}".`);
    if(typeof field.label!=="string")throw invalid(`settings field "${field.name}" needs a label.`);
    if(!TYPES.has(field.type))throw invalid(`settings field "${field.name}" has an unknown type "${String(field.type)}".`);
    if(CHOICES.has(field.type)){
      const options=field.options,count=options&&typeof options==="object"?Object.keys(options).length:0;
      if(!count||field.type==="segmented"&&(count<2||count>6)||Object.values(options!).some(option=>typeof option!=="string"&&(field.type!=="chips"||!option||typeof option.label!=="string"||option.image!==undefined&&typeof option.image!=="string")))
        throw invalid(`settings field "${field.name}" needs ${field.type==="segmented"?"2–6 options":"options"} (text${field.type==="chips"?" or { label, image }":""}).`);
    }
    if(field.type==="range"&&(!finite(field.min)||!finite(field.max)||field.min>=field.max||field.step!==undefined&&(!finite(field.step)||field.step<=0)))
      throw invalid(`settings range "${field.name}" needs numeric min < max and a positive step.`);
    if(field.visibleWhen!==undefined&&(typeof field.visibleWhen?.field!=="string"||!Array.isArray(field.visibleWhen.in)))throw invalid(`settings field "${field.name}" has a malformed visibleWhen.`);
    if(field.clears!==undefined&&!Array.isArray(field.clears))throw invalid(`settings field "${field.name}" has a malformed clears.`);
    this.fields.push(field);
    return field;
  }
  /** The field as a `RecordForm` field (the shared factory, validation and conditional rules). */
  private definition(field:SettingsField):FieldDefinition{
    return {name:field.name,label:field.label,type:field.type==="switch"?"checkbox":field.type,required:field.required===true,max:field.type==="range"?255:field.max??255,
      options:Object.fromEntries(Object.entries(field.options??{}).map(([value,option])=>[value,optionLabel(option)])),
      ...(field.validation?{validation:field.validation}:{}),...(field.editor?{editor:field.editor}:{}),
      ...(field.visibleWhen?{visibleWhen:field.visibleWhen}:{}),...(field.clears?{clears:field.clears}:{})} as FieldDefinition;
  }
  private initial(field:SettingsField):unknown{
    if(field.defaultValue!==undefined){
      if(this.valid(field,field.defaultValue))return this.copy(field.defaultValue);
      throw invalid(`the defaultValue of settings field "${field.name}" is not a valid value.`);
    }
    switch(field.type){
      case "switch":case "checkbox":return false;
      case "range":return field.min;
      case "number":return null;
      case "segmented":return Object.keys(field.options!)[0];
      case "color":return "#000000";
      default:return multiple(field)?[]:"";
    }
  }
  private copy(value:unknown):unknown{return Array.isArray(value)?[...value]:value;}
  /** Whether $value is a value of $field (`setValues`, `set`, the kept values, a default). */
  private valid(field:SettingsField,value:unknown):boolean{
    const options=field.options??{};
    if(field.editor&&BUILTIN.has(field.type))return value!==undefined;
    switch(field.type){
      case "switch":case "checkbox":return typeof value==="boolean";
      case "range":return finite(value)&&value>=field.min!&&value<=field.max!;
      case "number":return value===null||finite(value)&&Number.isInteger(value)&&value>=0;
      case "color":return typeof value==="string"&&COLOR.test(value);
      case "date":return value===""||typeof value==="string"&&calendarDate(value);
      case "select":return typeof value==="string"&&(Object.hasOwn(options,value)||value===""&&field.required!==true);
      case "segmented":return typeof value==="string"&&Object.hasOwn(options,value);
      case "chips":case "multiselect":
        if(!multiple(field))return typeof value==="string"&&(Object.hasOwn(options,value)||value==="");
        return Array.isArray(value)&&new Set(value).size===value.length&&value.every(item=>typeof item==="string"&&Object.hasOwn(options,item));
      default:return typeof value==="string"&&Array.from(value).length<=(field.max??255);
    }
  }
  /** The valid entries of $values for known fields. */
  private accepted(values:Record<string,unknown>|undefined):Record<string,unknown>{
    if(!values||typeof values!=="object")return {};
    return Object.fromEntries(this.fields.filter(field=>Object.hasOwn(values,field.name)&&this.valid(field,values[field.name])).map(field=>[field.name,this.copy(values[field.name])]));
  }
  /** Form items of a row: a fieldset's rows, or a field's item(s). */
  private items(row:any):any{
    if(row.type==="fieldset")return {...row,rows:row.rows.map((field:SettingsField)=>this.items(field))};
    const field=row as SettingsField,value=this.state[field.name],label=field.label;
    const options=Object.entries(field.options??{});
    switch(field.type){
      case "switch":return {width:"100%",css:"blade-settings__switch",cols:[{type:"checkbox",name:field.name,text:label,label,hiddenLabel:true,width:"content",checked:value===true}]};
      case "segmented":return {type:"radiogroup",name:field.name,label,labelPosition:"top",css:"blade-segmented",value,
        options:{cols:options.map(([option,text])=>({type:"radiobutton",text:optionLabel(text),value:option}))}};
      case "chips":return multiple(field)
        ?{type:"checkboxgroup",name:field.name,label,labelPosition:"top",css:"blade-chips",value:this.chipValue(field,value as string[]),
          options:{cols:options.map(([,text],index)=>({type:"checkbox",id:this.chipId(field,index),text:optionLabel(text)}))}}
        :{type:"radiogroup",name:field.name,label,labelPosition:"top",css:"blade-chips",value,
          options:{cols:options.map(([option,text])=>({type:"radiobutton",text:optionLabel(text),value:option}))}};
      case "color":return {type:"colorpicker",name:field.name,label,labelPosition:"top",value,css:"blade-settings__color"};
      case "range":{
        const unit=field.unit?String(field.unit):"";
        return {css:"blade-range",width:"100%",cols:[
          {type:"slider",name:field.name,label,labelPosition:"top",min:field.min,max:field.max,step:field.step??1,value,tooltip:false,css:"blade-range__slider"},
          {type:"input",name:field.name+NUMBER,label:unit?`${label} (${unit})`:label,hiddenLabel:true,inputType:"number",min:field.min,max:field.max,step:field.step??1,value:String(value),width:88,css:"blade-range__number"},
        ]};
      }
      default:{
        const definition=this.definition(field);
        const suiteValue=field.type==="checkbox"?(value===true?"1":"0"):field.type==="number"?(value===null?"":String(value)):Array.isArray(value)?value.join(","):value;
        return input({...definition,defaultValue:null},suiteValue);
      }
    }
  }
  private chipId(field:SettingsField,index:number):string{return `blade-settings-${this.serial}-${field.name}-${index}`;}
  /** A multiple chip field's value as its Suite checkbox group takes it. */
  private chipValue(field:SettingsField,value:string[]):Record<string,boolean>{return Object.fromEntries(Object.keys(field.options!).map((option,index)=>[this.chipId(field,index),value.includes(option)]));}
  /** The field's value from what Suite reports for its item. */
  private read(field:SettingsField,raw:unknown):unknown{
    if(field.editor&&BUILTIN.has(field.type))return raw;
    switch(field.type){
      case "switch":case "checkbox":return raw===true||raw==="1"||raw===1;
      case "range":return Number(raw);
      case "number":{const text=String(raw??"").trim();return /^[0-9]+$/.test(text)?Number(text):null;}
      case "multiselect":return (Array.isArray(raw)?raw.map(String):String(raw??"").split(",")).filter(Boolean);
      case "chips":
        if(!multiple(field))return String(raw??"");
        return Object.keys(field.options!).filter((_,index)=>raw&&typeof raw==="object"&&!!(raw as Record<string,unknown>)[this.chipId(field,index)]);
      default:return String(raw??"");
    }
  }
  /** The value as Suite takes it for the field's item. */
  private write(field:SettingsField,value:unknown):void{
    const form=this.form as any;
    this.setting=true;
    try{
      switch(field.type){
        case "chips":if(multiple(field)){form.getItem(field.name)?.setValue(this.chipValue(field,value as string[]));break;}
          form.getItem(field.name)?.setValue(value);break;
        case "range":form.getItem(field.name)?.setValue(value);form.getItem(field.name+NUMBER)?.setValue(String(value));break;
        case "number":form.getItem(field.name)?.setValue(value===null?"":String(value));break;
        case "multiselect":form.getItem(field.name)?.setValue(value);break;
        default:form.getItem(field.name)?.setValue(value);
      }
    }finally{this.setting=false;}
  }
  private changed(name:string,raw:unknown):void{
    if(this.setting||this.destroyed)return;
    const number=name.endsWith(NUMBER),field=this.fields.find(candidate=>candidate.name===(number?name.slice(0,-NUMBER.length):name));
    if(!field)return;
    if(field.type==="range"){
      const parsed=Number(String(raw??"").replace(",","."));
      const value=this.clamp(field,Number.isFinite(parsed)?parsed:this.state[field.name] as number);
      this.state[field.name]=value;
      // The other half of the pair follows; a typed value is corrected to the step and bounds.
      this.setting=true;
      try{if(number){this.form.getItem(field.name)?.setValue(value);}this.form.getItem(field.name+NUMBER)?.setValue(String(value));}finally{this.setting=false;}
      this.report(field,number);
      return;
    }
    this.commit(field,this.read(field,raw));
  }
  private clamp(field:SettingsField,value:number):number{
    const step=field.step??1,stepped=field.min!+Math.round((value-field.min!)/step)*step;
    return Math.min(field.max!,Math.max(field.min!,Number(stepped.toFixed(10))));
  }
  /** A range's `change`: at most every 100 ms while dragged; the last value always follows ($final: typed or released). */
  private report(field:SettingsField,final:boolean):void{
    const state=this.throttle.get(field.name)??{last:0,emitted:undefined};
    this.throttle.set(field.name,state);
    clearTimeout(state.timer);state.timer=undefined;
    const send=()=>{state.timer=undefined;state.last=Date.now();if(state.emitted!==this.state[field.name]){state.emitted=this.state[field.name];this.after(field);}};
    const wait=THROTTLE-(Date.now()-state.last);
    if(final||wait<=0)send();else state.timer=setTimeout(send,wait);
  }
  /** Takes a user value: the conditional fields and exclusive fields follow, the value is kept and reported. */
  private commit(field:SettingsField,value:unknown):void{
    const before=this.state[field.name];
    this.state[field.name]=value;
    if(JSON.stringify(before)===JSON.stringify(value))return;
    this.after(field);
  }
  private after(field:SettingsField):void{
    const cleared:SettingsField[]=[],value=this.state[field.name];
    if(field.clears?.length&&value!==false&&value!==""&&value!==null&&!(Array.isArray(value)&&!value.length))
      for(const name of field.clears){
        const other=this.fields.find(candidate=>candidate.name===name)!;
        if(JSON.stringify(this.state[name])===JSON.stringify(this.defaults[name]))continue;
        this.state[name]=this.copy(this.defaults[name]);this.write(other,this.state[name]);cleared.push(other);
      }
    this.apply();this.keep();
    for(const changed of [field,...cleared])this.emit("change",{field:changed.name,value:this.copy(this.state[changed.name]),values:this.values()});
  }
  private keep():void{this.preferences?.setSettings(this.values());}
  /** Shows each conditional field only while its condition holds. */
  private apply():void{
    let toggled=false;
    for(const field of this.fields){
      if(!field.visibleWhen)continue;
      const active=fieldActive(this.definition(field),this.state);
      if(this.shown.get(field.name)===active)continue;
      if(this.shown.has(field.name))toggled=true;
      this.shown.set(field.name,active);
      for(const name of this.names(field)){const item=this.form.getItem(name) as any;if(active)item?.show();else item?.hide();}
    }
    if(toggled)this.fit?.();
  }
  private names(field:SettingsField):string[]{return field.type==="range"?[field.name,field.name+NUMBER]:[field.name];}
  private enable(name:string,enabled:boolean):void{
    const field=this.fields.find(candidate=>candidate.name===name);if(!field)return;
    for(const item of this.names(field)){const control=this.form.getItem(item) as any;if(enabled)control?.enable();else control?.disable();}
  }
  /** `role="switch"` on switches, a range's visible unit and the chips' images (Suite has no option for them). */
  private decorate():void{
    const root=this.host;
    if(this.destroyed)return;
    for(const field of this.fields){
      // Suite disables a select's options, not the element: it is not announced as disabled otherwise.
      if(field.type==="select"){
        const select=this.containerOf(root,field.name)?.querySelector("select");
        if(select&&select.disabled!==this.disabled.has(field.name))select.disabled=this.disabled.has(field.name);
      }
      if(field.type==="switch"){
        const checkbox=root.querySelector<HTMLInputElement>(`.blade-settings__switch input[type="checkbox"][name="${CSS.escape(field.name)}"], .blade-settings__switch input[type="checkbox"][id$="${CSS.escape(field.name)}"]`)
          ??this.inputOf(root,field.name,"checkbox");
        if(checkbox&&checkbox.getAttribute("role")!=="switch")checkbox.setAttribute("role","switch");
      }
      if(field.type==="range"&&field.unit){
        // The number input's name already says the unit; the visible unit is decoration.
        const holder=this.containerOf(root,field.name+NUMBER)?.querySelector(".dhx_input__container");
        if(holder&&!holder.querySelector(".blade-range__unit"))holder.append(Object.assign(document.createElement("span"),{className:"blade-range__unit",textContent:String(field.unit),ariaHidden:"true"}));
      }
      if(field.type!=="chips"&&field.type!=="segmented")continue;
      const options=Object.entries(field.options!);
      const container=this.containerOf(root,field.name);
      // Suite's legend sits inside the group element, which then has no name; a checkbox group is marked a radiogroup
      // although several chips may be chosen.
      const group=container?.querySelector<HTMLElement>('[role="radiogroup"], [role="group"], .dhx_form-group--radio-group, .dhx_form-group--checkbox-group');
      if(group){
        const role=multiple(field)?"group":"radiogroup";
        if(group.getAttribute("role")!==role)group.setAttribute("role",role);
        if(group.getAttribute("aria-label")!==field.label)group.setAttribute("aria-label",field.label);
      }
      if(field.type!=="chips")continue;
      const inputs=container?Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"],input[type="radio"]')):[];
      inputs.forEach((control,index)=>{
        const option=options[index]?.[1];if(!option||typeof option==="string"||!option.image)return;
        const label=control.closest("label")??control.parentElement;
        if(!label||label.querySelector(".blade-chip__image"))return;
        const image=Object.assign(document.createElement("img"),{className:"blade-chip__image",alt:"",src:option.image,loading:"lazy"});
        image.setAttribute("aria-hidden","true");
        label.querySelector(".dhx_checkbox__visual-input, .dhx_radiobutton__visual-input")?.after(image)??label.prepend(image);
      });
    }
  }
  /** The element of a Form item ($name): Suite marks each item's cell with its name. */
  private containerOf(root:HTMLElement,name:string):HTMLElement|null{
    return root.querySelector<HTMLElement>(`[data-cell-id="${CSS.escape(name)}"]`)
      ??(this.form.getItem(name) as any)?.getRootView?.()?.node?.el??null;
  }
  private inputOf(root:HTMLElement,name:string,type:string):HTMLInputElement|null{
    return this.containerOf(root,name)?.querySelector<HTMLInputElement>(`input[type="${type}"]`)??null;
  }
  mount(target:MountTarget):void{
    super.mount(target);
    const fit=(target as {fit?:unknown}).fit;
    if(typeof fit==="function"&&"signal" in target){this.fit=()=>void fit.call(target);this.fit();}
    void awaitRedraw().then(()=>this.decorate());
  }
  values():Record<string,unknown>{return Object.fromEntries(this.fields.map(field=>[field.name,this.copy(this.state[field.name])]));}
  setValues(values:Record<string,unknown>):void{
    if(this.destroyed)return;
    const accepted=this.accepted(values);
    for(const [name,value] of Object.entries(accepted)){this.state[name]=value;this.write(this.fields.find(field=>field.name===name)!,value);}
    if(Object.keys(accepted).length){this.apply();this.keep();}
  }
  set(name:string,value:unknown):void{
    const field=this.fields.find(candidate=>candidate.name===name);
    if(!field)throw invalid(`unknown settings field "${String(name)}".`);
    if(!this.valid(field,value))throw invalid(`invalid value for settings field "${name}".`);
    if(this.destroyed)return;
    this.write(field,this.copy(value));
    this.commit(field,this.copy(value));
  }
  reset():void{
    if(this.destroyed)return;
    this.state={...this.defaults,...this.accepted(this.options.values)};
    for(const field of this.fields)this.write(field,this.state[field.name]);
    (this.form as any).clear("validation");
    this.apply();
    this.preferences?.setSettings(undefined);
  }
  update(name:string,changes:{disabled?:boolean}):void{
    if(this.destroyed||!this.fields.some(field=>field.name===name)||changes?.disabled===undefined)return;
    if(changes.disabled)this.disabled.add(name);else this.disabled.delete(name);
    this.enable(name,!changes.disabled);
    this.decorate();
  }
  validate():boolean{
    if(this.destroyed)return false;
    const focused=document.activeElement,root=this.form.getRootNode() as HTMLElement|undefined;
    if(focused instanceof HTMLElement&&root?.contains(focused)&&focused.matches("input,textarea"))focused.blur();
    return this.validation.validate();
  }
  protected dispose():void{
    for(const state of this.throttle.values())clearTimeout(state.timer);
    this.observer.disconnect();this.releaseTypes();
    const form=this.form;
    // Suite 9.3.12: a fieldset's destructor hides its cell, which repaints the Form's own Layout one frame later, after
    // that Layout is gone ("Cannot read properties of null (reading 'type')"). The group cells need no hiding when the
    // whole Form goes.
    for(const name of this.groups){const group=form.getItem(name) as {cell?:unknown}|undefined;if(group?.cell)group.cell={hide(){},show(){}};}
    this.layout.getCell("form").detach();
    this.layout.destructor();
    void awaitRedraw().then(()=>form.destructor());
  }
}

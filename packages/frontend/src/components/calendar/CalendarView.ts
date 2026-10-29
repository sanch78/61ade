import { locale, t } from "../../I18n";
import { Form, Layout, Window, message, awaitRedraw } from "@dhtmlx/suite";
import { scheduler as vendorScheduler } from "dhtmlx-scheduler";
import "dhtmlx-scheduler/codebase/dhtmlxscheduler.css";
import "../../calendar.css";
import { ResponsiveToolbar } from "../../ResponsiveToolbar";
import { widgetIcons } from "../../WidgetIcons";
import { alert, requestChoice, showDialog } from "../../MessageDialog";
import { escape } from "../../RecordPresentation";
import { FormValidation, type FieldDefinition } from "../../FormValidation";
import { formActions, input } from "../../Workspace";
import { fitWindow } from "../../WindowSizing";
import { server } from "../../api/Server";

export type CalendarConfig={views:("day"|"week"|"month")[];default_view:string;first_hour:number;last_hour:number;max_range_days:number;day_action:{resource:string;action:string;label:string}|null;fields:FieldDefinition[]};
export type CalendarViewDefinition={kind:"calendar";resource:string;title:string;icon?:string;desktopOnly?:boolean;group?:string;actions:{name:string;label:string;icon?:string;write:boolean}[];calendar:CalendarConfig};
type Failure=Error&{status?:number;fieldErrors?:Record<string,string>};
type SchedulerEvent={id:string|number;text:string;start_date:Date;end_date:Date;rrule?:string;duration?:number;recurring_event_id?:string|number;original_start?:Date|string;deleted?:boolean;_end_date?:Date;[field:string]:unknown};
type Repeat={freq:"DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY";interval:number;days:string[];position:boolean;count:number;until:string};

const pad=(value:number)=>String(value).padStart(2,"0");
/** Wall-clock `YYYY-MM-DD HH:MM`, the calendar wire format; no time zone is applied. */
const wire=(date:Date|string|undefined):string=>date instanceof Date?`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`:String(date??"");
const day=(date:Date)=>wire(date).slice(0,10);
/** Local date of a `YYYY-MM-DD[ HH:MM]` form value; null when it is not a real date. */
const local=(value:unknown):Date|null=>{
  const m=/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(String(value??"").trim());
  if(!m)return null;
  const date=new Date(+m[1],+m[2]-1,+m[3],+(m[4]??0),+(m[5]??0));
  return wire(date)===`${m[1]}-${m[2]}-${m[3]} ${m[4]??"00"}:${m[5]??"00"}`?date:null;
};
const WEEKDAYS=["MO","TU","WE","TH","FR","SA","SU"];
const weekday=(date:Date)=>WEEKDAYS[(date.getDay()+6)%7];
/** Week of the month of the date's weekday, as `BYSETPOS` counts it (1–5). */
const position=(date:Date)=>Math.ceil(date.getDate()/7);
/** Series end the Scheduler expands to when a rule has no end date. */
const OPEN_END=new Date(9999,1,1);

/** Form state of a rule from the subset the server expands (Recurrence.php); null for anything else. */
function readRule(rrule:string,start:Date,end?:Date):Repeat|null{
  const parts=new Map(rrule.split(";").filter(Boolean).map(part=>part.split("=") as [string,string]));
  const freq=parts.get("FREQ") as Repeat["freq"];
  if(!["DAILY","WEEKLY","MONTHLY","YEARLY"].includes(freq))return null;
  const count=Number(parts.get("COUNT")??0);
  const until=!count&&end&&end.getFullYear()!==9999?day(new Date(end.getTime()-1)):"";
  return {freq,interval:Number(parts.get("INTERVAL")??1),days:(parts.get("BYDAY")??weekday(start)).split(","),position:parts.has("BYSETPOS"),count,until};
}
/** RRULE and series end for the form state; days, month day and position come from the start. */
function writeRule(repeat:Repeat,start:Date):{rrule:string;end:Date}{
  const parts=[`FREQ=${repeat.freq}`];
  if(repeat.interval>1)parts.push(`INTERVAL=${repeat.interval}`);
  if(repeat.freq==="WEEKLY")parts.push(`BYDAY=${WEEKDAYS.filter(day=>repeat.days.includes(day)).join(",")}`);
  if(repeat.freq==="YEARLY")parts.push(`BYMONTH=${start.getMonth()+1}`);
  if(repeat.freq==="MONTHLY"||repeat.freq==="YEARLY")parts.push(repeat.position?`BYDAY=${weekday(start)};BYSETPOS=${position(start)}`:`BYMONTHDAY=${start.getDate()}`);
  let end=OPEN_END;
  if(repeat.count)parts.push(`COUNT=${repeat.count}`);
  else if(repeat.until){
    // The last day is inclusive: the rule ends at its last second, the series at the next midnight.
    const last=local(repeat.until)!;parts.push(`UNTIL=${repeat.until.replace(/-/g,"")}T235959`);
    end=new Date(last.getFullYear(),last.getMonth(),last.getDate()+1);
  }
  return {rrule:parts.join(";"),end};
}
/** Scheduler locales bundled with the vendor package; other languages fall back to English. */
const SCHEDULER_LOCALES=["hu","en","de"];
let pluginsEnabled=false;

/**
 * Event calendar view over DHTMLX Scheduler Standard (GPL): day/week/month views with drag and
 * drop. Events are edited in the framework's Suite Form window and the recurring scope is asked
 * with the shared choice dialog, as everywhere else. The Scheduler expands series itself from the raw events
 * of the visible window; every read and write is a registered action of the view's resource.
 * The Standard edition exposes one Scheduler instance (multiple instances are a paid feature),
 * so a view borrows it: on destroy it detaches its handlers and data processor and clears it.
 * Internal: projects and the built-in `calendar` kind use the public `Calendar` facade (./Calendar.ts).
 */
export class CalendarView {
  readonly layout:Layout;
  private releaseIcons=widgetIcons();
  private scheduler=vendorScheduler;
  private handlers:string[]=[];
  private processor?:{destructor():void};
  private host=document.createElement("div");
  private commands:ResponsiveToolbar;
  private windows=new Set<Window>();
  private revisions=new Map<string,string>();
  private selected?:Date;
  private loading=0;
  /** Loaded window; the Scheduler also reports view changes that keep it (e.g. opening the lightbox). */
  private range="";
  private writing=0;
  private stale=false;
  private disposed=false;
  private config:CalendarConfig;
  private mounter=new MutationObserver(()=>this.mount());
  private resizer=new ResizeObserver(()=>{if(this.host.isConnected)this.scheduler.setCurrentView();});
  private theme=new MutationObserver(()=>this.skin());
  private editing?:Window;
  private restoreVendor=()=>{};

  constructor(container:HTMLElement,private view:CalendarViewDefinition){
    this.config=view.calendar;
    this.layout=new Layout(container,{type:"space",rows:[{id:"panel",header:view.title,css:"blade-calendar-panel",rows:[
      {id:"commands",height:48,css:"blade-command-row"},
      {id:"calendar",css:"blade-calendar-cell"},
    ]}]});
    const day=this.config.day_action;
    this.commands=new ResponsiveToolbar(undefined,{data:[
      ...(this.can("create")?[{id:"create",value:t("Új esemény"),icon:"dxi dxi-plus"}]:[]),
      {type:"spacer"},
      ...(day?[{id:"day",value:day.label,icon:"dxi dxi-function-variant"}]:[]),
    ]});
    this.commands.events.on("click",(id:string|number)=>void this.command(String(id)));
    this.layout.getCell("commands").attach(this.commands);
    this.host.className="blade-calendar dhx_cal_container";
    this.configure();
    // A Layout cell holds HTML, not elements: the Scheduler host is placed into the cell's
    // placeholder and placed again whenever the Layout re-creates that cell.
    this.layout.getCell("calendar").attachHTML("<div class=\"blade-calendar-mount\"></div>");
    void awaitRedraw().then(()=>{
      const root=this.layout.getRootNode();
      if(this.disposed||!root)return;
      this.mounter.observe(root,{childList:true,subtree:true});this.mount();
      this.scheduler.init(this.host,new Date(),this.config.default_view);
      this.resizer.observe(this.host);
    });
    this.theme.observe(document.documentElement,{attributes:true,attributeFilter:["data-dhx-theme"]});
  }

  private can(name:string):boolean{return this.view.actions.some(action=>action.name===name);}

  private mount():void{
    const slot=this.layout.getRootNode()?.querySelector(".blade-calendar-mount");
    if(slot&&this.host.parentElement!==slot)slot.append(this.host);
  }

  private skin():void{
    const dark=document.documentElement.getAttribute("data-dhx-theme")==="dark";
    if(this.scheduler.skin!==(dark?"dark":"terrace"))this.scheduler.setSkin(dark?"dark":"terrace");
  }

  private configure():void{
    const s=this.scheduler;
    if(!pluginsEnabled){s.plugins({recurring:true});pluginsEnabled=true;}
    s.i18n.setLocale(SCHEDULER_LOCALES.includes(locale())?locale():"en");
    // Framework captions replace vendor labels that are missing or mistranslated in its catalogues.
    Object.assign(s.locale.labels,{
      confirm_recurring:t("Ismétlődő esemény szerkesztése"),button_edit_series:t("Az összes esemény"),
      button_edit_occurrence:t("Csak ez az esemény"),button_edit_occurrence_and_following:t("Ez és a következő események"),
      new_event:t("Új esemény"),
      next:t("Következő"),prev:t("Előző"),drag_to_create:t("Húzással létrehozás"),drag_to_move:t("Húzással áthelyezés"),
    });
    s.skin=document.documentElement.getAttribute("data-dhx-theme")==="dark"?"dark":"terrace";
    Object.assign(s.config,{
      header:[...this.config.views,"date","prev","today","next"],
      date_format:"%Y-%m-%d %H:%i",first_hour:this.config.first_hour,last_hour:this.config.last_hour,
      details_on_create:true,details_on_dblclick:true,quick_info_detached:false,
      readonly:!this.can("update")&&!this.can("create"),drag_create:this.can("create"),
      drag_move:this.can("update"),drag_resize:this.can("update"),
      // No vendor select bar: its inline edit and delete confirmation bypass the framework form.
      select:false,
    });
    // The vendor lightbox is never built: the recurring plugin's wrapper still decides which event
    // (occurrence or series) is edited, then opens the framework form instead of its own sections.
    const vendor={lightbox:s.showLightbox_rec,confirm:s.ext.recurring.confirm};
    const lightbox=(id:string|number)=>this.edit(id),confirm=(context:{labels:Record<string,string>;options:string[]})=>this.scope(context);
    s.showLightbox_rec=lightbox;s.ext.recurring.confirm=confirm;
    this.restoreVendor=()=>{if(s.showLightbox_rec===lightbox){s.showLightbox_rec=vendor.lightbox;s.ext.recurring.confirm=vendor.confirm;}};
    const fields=this.config.fields;
    s.templates.event_text=(start:Date,end:Date,event:SchedulerEvent)=>{
      const labels=fields.filter(field=>field.type==="select"&&event[field.name]).map(field=>field.options[String(event[field.name])]??"");
      return escape(event.text)+(labels.length?`<div class="blade-calendar-detail">${escape(labels.join(" · "))}</div>`:"");
    };
    s.templates.event_bar_text=(start:Date,end:Date,event:SchedulerEvent)=>escape(event.text);
    this.handlers.push(
      s.attachEvent("onViewChange",()=>void this.load(false)),
      s.attachEvent("onEmptyClick",(date:Date)=>{this.selected=date;}),
      s.attachEvent("onClick",(id:string)=>{const event=s.getEvent(id) as SchedulerEvent|undefined;if(event)this.selected=event.start_date;return true;}),
      s.attachEvent("onBeforeLightbox",()=>this.can(s.getState().new_event?"create":"update")),
    );
    // Writes go through the registered actions; the router waits for the server answer.
    this.processor=s.createDataProcessor({event:{
      create:(data:SchedulerEvent)=>this.write("create",null,data),
      update:(data:SchedulerEvent,id:string)=>this.write("update",String(id),data),
      delete:(id:string)=>this.remove(String(id)),
    }});
  }

  /** Which events of a series a change applies to, with the shared choice dialog. */
  private scope(context:{labels:Record<string,string>;options:string[]}):Promise<string|null>{
    return requestChoice({title:t("Ismétlődő esemény szerkesztése"),message:t("Melyik eseményekre vonatkozzon a módosítás?"),
      choices:context.options.map(value=>({value,label:context.labels[value]??value}))});
  }

  /**
   * Event form in a Suite Window: name, consumer fields, start/end and, for a series or a new event,
   * the recurrence. Saving hands the values to the Scheduler the way its lightbox does, so the
   * recurring plugin splits series and creates exceptions as before; the data processor then writes.
   */
  private edit(id:string|number):void{
    const s=this.scheduler as any;
    if(this.editing||!s.callEvent("onBeforeLightbox",[id])){
      if(s._new_event){s._new_event=null;delete s.getEvent(id)?.$new;}
      return;
    }
    s._lightbox_id=id;
    const event=s.getEvent(id) as SchedulerEvent;
    const isNew=!!s.getState().new_event;
    // An occurrence edited alone becomes an exception; it keeps the series' rule.
    const series=!event.recurring_event_id&&!s._is_virtual_event(String(id));
    const rule=series&&event.rrule?readRule(String(event.rrule),event.start_date,event._end_date):null;
    const custom=series&&!!event.rrule&&!rule;
    const repeat:Repeat=rule??{freq:"WEEKLY",interval:1,days:[weekday(event.start_date)],position:false,count:0,until:""};
    const fields:FieldDefinition[]=[{name:"text",label:t("Megnevezés"),type:"text",required:true,max:255,options:{}},...this.config.fields];
    const numeric=(name:string,label:string,max:number):FieldDefinition=>({name,label,type:"number",required:false,max,options:{}});
    const date=(name:string,label:string):FieldDefinition=>({name,label,type:"text",required:true,max:16,options:{}});
    const checked=[...fields,date("start_date",t("Kezdete")),date("end_date",t("Vége")),numeric("interval",t("Gyakoriság"),3),numeric("count",t("Alkalmak száma"),4)];
    const names=(date:Date,style:"long"|"short")=>new Intl.DateTimeFormat(locale(),{weekday:style}).format(date);
    const monday=new Date(2024,0,1);
    const monthDays=(start:Date)=>[{value:"day",content:t("A hónap {day}. napján",{day:start.getDate()})},
      {value:"position",content:t("A hónap {position}. ilyen napján ({weekday})",{position:position(start),weekday:names(start,"long")})}];
    const picker=(name:string,label:string,value:string,time=true)=>({type:"datepicker",name,label,labelPosition:"top",required:time,
      // Suite 9.3 repaints a typed value away when the open popup closes; dates are picked in the popup.
      editable:false,
      timePicker:time,timeFormat:24,dateFormat:time?"%Y-%m-%d %H:%i":"%Y-%m-%d",weekStart:"monday",value});
    const actions=formActions({name:"submit",text:t("Mentés"),icon:"dxi dxi-content-save",color:"primary"});
    if(!isNew&&this.can("delete"))actions.cols.unshift({type:"button",name:"remove",text:t("Törlés"),icon:"dxi dxi-delete-outline",view:"link",color:"danger",width:"content",css:"blade-calendar-remove"});
    const form=new Form(document.createElement("div"),{padding:20,rows:[
      ...fields.map(field=>input(field,event[field.name])),
      {css:"blade-calendar-dates",cols:[picker("start_date",t("Kezdete"),wire(event.start_date)),picker("end_date",t("Vége"),wire(event.end_date))]},
      ...(series?[
        {type:"select",name:"repeat",label:t("Ismétlődés"),labelPosition:"top",value:custom?"CUSTOM":rule?rule.freq:"",options:[
          {value:"",content:t("Nincs")},{value:"DAILY",content:t("Naponta")},{value:"WEEKLY",content:t("Hetente")},
          {value:"MONTHLY",content:t("Havonta")},{value:"YEARLY",content:t("Évente")},
          ...(custom?[{value:"CUSTOM",content:t("Egyedi szabály: {rule}",{rule:String(event.rrule)})}]:[])]},
        {type:"input",name:"interval",label:t("Gyakoriság"),labelPosition:"top",inputType:"number",value:String(repeat.interval)},
        {type:"checkboxgroup",name:"days",label:t("Napok"),labelPosition:"top",css:"blade-calendar-days",options:{cols:WEEKDAYS.map((value,index)=>{
          const date=new Date(monday.getTime()+index*86400000);
          return {type:"checkbox",id:value,text:names(date,"short"),value,checked:repeat.days.includes(value)};
        })}},
        {type:"select",name:"monthly",label:t("Melyik napon"),labelPosition:"top",value:repeat.position?"position":"day",options:monthDays(event.start_date)},
        {type:"select",name:"ends",label:t("Ismétlődés vége"),labelPosition:"top",value:repeat.count?"count":repeat.until?"until":"never",options:[
          {value:"never",content:t("Soha")},{value:"count",content:t("Adott számú alkalom után")},{value:"until",content:t("Adott napon")}]},
        {type:"input",name:"count",label:t("Alkalmak száma"),labelPosition:"top",inputType:"number",value:String(repeat.count||10)},
        picker("until",t("Utolsó nap"),repeat.until||day(new Date(event.start_date.getTime()+30*86400000)),false),
      ]:[]),
      actions,
    ]} as any);
    const win=new Window({css:"blade-content-window blade-calendar-editor",title:escape(isNew?t("Új esemény"):event.text),ariaLabel:isNew?t("Új esemény"):event.text,
      width:Math.min(560,innerWidth-24),height:Math.min(720,innerHeight-24),modal:true,closable:true,resizable:true});
    this.editing=win;this.windows.add(win);
    let done=false;
    win.events.on("afterHide",()=>{
      this.windows.delete(win);if(this.editing===win)this.editing=undefined;
      win.destructor();
      if(!done){done=true;s.cancel_lightbox();}
    });
    // Only the controls of the chosen pattern are shown; the month options name the start's day.
    const sync=()=>{
      if(!series)return;
      const values=form.getValue() as Record<string,any>,freq=String(values.repeat??"");
      const start=local(values.start_date)??event.start_date;
      const show=(name:string,visible:boolean)=>{const item=form.getItem(name);if(visible)item.show();else item.hide();};
      const plain=freq!==""&&freq!=="CUSTOM";
      show("interval",plain);show("days",freq==="WEEKLY");show("monthly",freq==="MONTHLY"||freq==="YEARLY");
      show("ends",plain);show("count",plain&&values.ends==="count");show("until",plain&&values.ends==="until");
      if(plain)form.getItem("interval").setProperties({label:t({DAILY:"Hány naponta",WEEKLY:"Hány hetente",MONTHLY:"Hány havonta",YEARLY:"Hány évente"}[freq as Repeat["freq"]])});
      const monthly=form.getItem("monthly"),selected=monthly.getValue()||(repeat.position?"position":"day");
      monthly.setOptions(monthDays(start));monthly.setValue(selected);
      void fitWindow(win);
    };
    const validation=new FormValidation(form,checked);
    form.events.on("change",(name:string)=>{
      // The period check concerns both bounds: changing either one clears it.
      if(name==="start_date"||name==="end_date"){validation.clearServerError("start_date");validation.clearServerError("end_date");}
      if(["repeat","ends","start_date"].includes(name))sync();
    });
    form.events.on("afterValidate",()=>{void fitWindow(win);});
    form.events.on("click",(name:string)=>{
      if(name==="cancel"){win.hide();return;}
      if(name==="remove"){void this.discard(id).then(removed=>{if(removed){done=true;win.hide();}});return;}
      if(name!=="submit"||!validation.validate())return;
      const values=form.getValue() as Record<string,any>;
      const data=this.formData(values,series,validation);
      if(!data)return;
      done=true;this.save(id,data);win.hide();
    });
    win.attach(form);win.show();sync();void fitWindow(win);
  }

  /** Scheduler event values of the form, like the vendor lightbox writes them; null after showing an error. */
  private formData(values:Record<string,any>,series:boolean,validation:FormValidation):Record<string,unknown>|null{
    const start=local(values.start_date),end=local(values.end_date);
    if(!start)return validation.showServerErrors({start_date:t("Érvénytelen dátum.")}),null;
    if(!end)return validation.showServerErrors({end_date:t("Érvénytelen dátum.")}),null;
    if(end<=start)return validation.showServerErrors({end_date:t("A vége a kezdés utáni legyen.")}),null;
    const data:Record<string,unknown>={text:String(values.text).trim(),start_date:start,end_date:end};
    for(const field of this.config.fields)data[field.name]=values[field.name];
    if(!series)return data;
    const freq=String(values.repeat??"");
    if(freq===""){Object.assign(data,{rrule:"",_end_date:end});return data;}
    if(freq==="CUSTOM"){Object.assign(data,{duration:Math.round((end.getTime()-start.getTime())/1000),_start_date:null});return data;}
    const interval=Number(values.interval),count=Number(values.count);
    if(!(interval>=1&&interval<=999))return validation.showServerErrors({interval:t("1 és {max} közötti szám szükséges.",{max:999})}),null;
    const days=Object.entries(values.days??{}).filter(([,on])=>on).map(([day])=>day);
    if(freq==="WEEKLY"&&!days.length){void alert({header:t("Ellenőrizd a mezőt"),text:t("Válassz legalább egy napot."),severity:"warning"});return null;}
    if(values.ends==="count"&&!(count>=1&&count<=5000))return validation.showServerErrors({count:t("1 és {max} közötti szám szükséges.",{max:5000})}),null;
    const until=values.ends==="until"?local(values.until):null;
    if(values.ends==="until"&&(!until||until<new Date(start.getFullYear(),start.getMonth(),start.getDate()))){
      void alert({header:t("Ellenőrizd a mezőt"),text:t("Az utolsó nap nem lehet a kezdés előtt."),severity:"warning"});return null;
    }
    const rule=writeRule({freq:freq as Repeat["freq"],interval,days,position:values.monthly==="position",count:values.ends==="count"?count:0,until:until?day(until):""},start);
    Object.assign(data,{rrule:rule.rrule,duration:Math.round((end.getTime()-start.getTime())/1000),_start_date:null,_end_date:rule.end});
    return data;
  }

  /** The vendor lightbox's save steps, so the recurring plugin applies "this and following" splits. */
  private save(id:string|number,data:Record<string,unknown>):void{
    const s=this.scheduler as any;
    if(s.checkEvent("onEventSave")&&!s.callEvent("onEventSave",[id,data,s._new_event]))return;
    if(s.checkEvent("onRecurringEventSave"))s.callEvent("onRecurringEventSave",[id,data,s._new_event]);
    s._empty_lightbox(data);s.hide_lightbox();
  }

  /** Delete from the form after the shared confirmation; "this and following" shortens the series. */
  private async discard(id:string|number):Promise<boolean>{
    const s=this.scheduler as any;
    if(!await showDialog({mode:"confirm",severity:"danger",message:t("Az esemény véglegesen törlődik. Folytatod?"),confirmLabel:t("Törlés")}))return false;
    const event=s.getEvent(id);
    if(!event)return false;
    if(event._thisAndFollowing){event._removeFollowing=true;s.callEvent("onRecurringEventSave",[event.id,event,s._new_event]);}
    else s.deleteEvent(id);
    s._new_event=null;delete event.$new;s.hide_lightbox();
    return true;
  }

  /** Raw events of the visible window; the Scheduler expands series itself. */
  private async load(force=true):Promise<void>{
    const state=this.scheduler.getState();
    if(!state.min_date||!state.max_date)return;
    const range=wire(state.min_date)+"|"+wire(state.max_date);
    if(!force&&range===this.range)return;
    this.range=range;
    // Replacing the data during a write would drop the event being saved; reload after it.
    if(this.writing){this.stale=true;return;}
    const request=++this.loading;
    try{
      const result=await this.call(this.view.resource,"events",null,{from:wire(state.min_date),to:wire(state.max_date)});
      if(request!==this.loading||this.disposed)return;
      if(this.writing){this.stale=true;return;}
      this.revisions.clear();
      for(const event of result.events as {id:string;revision:string}[])this.revisions.set(event.id,event.revision);
      this.scheduler.clearAll();
      this.scheduler.parse(result.events.map((event:Record<string,unknown>)=>({...event,recurring_event_id:event.recurring_event_id||undefined,original_start:event.original_start||undefined,rrule:event.rrule||undefined})));
    }catch(error){await this.error(error);}
  }

  private payload(data:SchedulerEvent):Record<string,string>{
    // Occurrence copies inherit series fields through their prototype, which the data processor's
    // serialized copy (own properties only) drops; the live event object is read directly.
    const event=(this.scheduler.getEvent(data.id) as SchedulerEvent|undefined)??data;
    const values:Record<string,string>={
      text:String(event.text??"").trim()||t("Új esemény"),start_date:wire(event.start_date),end_date:wire(event.end_date),
      rrule:event.rrule?String(event.rrule):"",duration:event.rrule?String(event.duration??0):"0",
      recurring_event_id:event.recurring_event_id?String(event.recurring_event_id):"",
      original_start:event.original_start?wire(event.original_start instanceof Date?event.original_start:new Date(event.original_start)):"",
      deleted:event.deleted?"1":"0",
    };
    for(const field of this.config.fields)values[field.name]=String(event[field.name]??field.defaultValue??"");
    return values;
  }

  private async write(action:"create"|"update",id:string|null,event:SchedulerEvent):Promise<{id:string}|{action:"error"}>{
    this.writing++;
    try{
      const values=this.payload(event);
      if(action==="update")values.revision=this.revisions.get(String(id))??"";
      const result=await this.call(this.view.resource,action,id,values);
      this.revisions.set(result.id,result.revision);
      message({text:t("Mentve."),css:"blade-toast",expire:2500});
      // A changed series drops its exceptions on the server; reload to show the new pattern.
      if(action==="update"&&event.rrule)this.stale=true;
      return {id:result.id};
    }catch(error){
      this.stale=true;await this.error(error);
      return {action:"error"};
    }finally{this.settle();}
  }

  /** After the last pending write, a load that was deferred meanwhile runs. */
  private settle():void{
    if(--this.writing||!this.stale||this.disposed)return;
    this.stale=false;setTimeout(()=>void this.load(),0);
  }

  private async remove(id:string):Promise<{action:"deleted"}|{action:"error"}>{
    // An unsaved (client-only) event has no server row.
    if(!this.revisions.has(id))return {action:"deleted"};
    this.writing++;
    try{
      await this.call(this.view.resource,"delete",id,{revision:this.revisions.get(id)??""});
      this.revisions.delete(id);
      message({text:t("Törölve."),css:"blade-toast",expire:2500});
      return {action:"deleted"};
    }catch(error){this.stale=true;await this.error(error);return {action:"error"};}
    finally{this.settle();}
  }

  private async command(id:string):Promise<void>{
    const s=this.scheduler;
    if(id==="create"){
      const start=new Date(this.selected??s.getState().date);
      // Without a chosen slot the new event starts at the next full hour.
      if(!this.selected)start.setHours(start.getHours()+1,0,0,0);
      if(start.getHours()<this.config.first_hour)start.setHours(Math.max(this.config.first_hour,8),0,0,0);
      s.addEventNow({start_date:start,end_date:new Date(start.getTime()+3600000),text:t("Új esemény")});
      return;
    }
    if(id==="day")await this.openDay(this.selected??s.getState().date);
  }

  /** Day action: the registered action's answer for one date, read-only, with the matching API request. */
  private async openDay(date:Date):Promise<void>{
    const action=this.config.day_action!;
    const values={date:day(date)};
    let result:unknown;
    try{result=await this.call(action.resource,action.action,null,values);}catch(error){await this.error(error);return;}
    if(this.disposed)return;
    const request=JSON.stringify({resource:action.resource,action:action.action,values},null,2);
    const win=new Window({title:`${action.label} – ${values.date}`,modal:true,closable:true,resizable:true,movable:true,
      width:Math.min(720,innerWidth-24),height:Math.min(640,innerHeight-24),css:"blade-calendar-day"});
    this.windows.add(win);
    win.attachHTML(`<div class="blade-calendar-day__body">
      <p class="blade-calendar-day__label">${escape(t("API-kérés"))}</p>
      <pre class="blade-calendar-day__code">POST ./?blade=1\nAuthorization: Bearer &lt;${escape(t("API-kulcs"))}&gt;\nContent-Type: application/json\n\n${escape(request)}</pre>
      <p class="blade-calendar-day__label">${escape(t("Válasz"))}</p>
      <pre class="blade-calendar-day__code" tabindex="0">${escape(JSON.stringify({ok:true,data:result},null,2))}</pre></div>`);
    win.events.on("afterHide",()=>{this.windows.delete(win);win.destructor();});
    win.show();
  }

  private call(resource:string,action:string,id:string|null,values:Record<string,unknown>):Promise<any>{return server.call(resource,action,{id,values});}

  private async error(error:unknown):Promise<void>{
    if(this.disposed)return;
    const e=error as Failure;
    await alert({header:t("Hiba"),severity:"danger",text:[e instanceof Error?e.message:t("Sikertelen művelet."),...Object.values(e.fieldErrors??{})].join("\n")});
  }

  destroy():void{
    this.disposed=true;this.releaseIcons();this.commands.disposeResponsive();
    this.mounter.disconnect();this.resizer.disconnect();this.theme.disconnect();
    for(const win of this.windows)win.destructor();this.windows.clear();
    const s=this.scheduler;
    s.hideLightbox?.();this.restoreVendor();
    for(const handler of this.handlers)s.detachEvent(handler);
    this.processor?.destructor();
    s.clearAll();this.host.remove();
    this.layout.destructor();
  }
}

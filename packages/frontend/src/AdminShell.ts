import { configureLanguage, languageIcon, type LanguageConfig, t } from "./I18n";
import { widgetIcons } from "./WidgetIcons";
import { externalSignInUnavailable, openExternalSignIn } from "./ExternalAuth";
import { LiveChannel } from "./Realtime";
import { DesktopOnly } from "./DesktopOnly";
import { Form, Layout, Menu, Toolbar, Window, setTheme, awaitRedraw } from "@dhtmlx/suite";
import { acknowledge, closeDialogs, showDialog } from "./MessageDialog";
import { uploads, type UploadIndicator } from "./Uploader";
import { configureServer, server } from "./api/Server";
import { attachContent, openWindow, themeApplied } from "./api/services";
import type { AppWindow, NavigationTarget, Row, ViewDefinition, ViewHost, ViewInstance, ViewOpenMode } from "./api/types";
import { createApplication, loadModules, type Kernel } from "./app/Application";
import { parseRoute, routeHash } from "./app/routes";
import { loadSignInModules, signInApplication, signInThemeApplied } from "./SignIn";
import type { SignInPage } from "./api/sign-in";

/** One open view: the workspace page or a document window, with the signal its host aborts on close. */
type Mounted = { view: ViewDefinition; record?: string; open: ViewOpenMode; controller: AbortController; instance?: ViewInstance; wrapper?: DesktopOnly; window?: AppWindow };

export type MenuDefinition = {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  items?: MenuDefinition[];
};
export type ShellDefinition = {
  protocol: 1;
  i18n?: LanguageConfig;
  title: string;
  version?: string;
  authenticated: boolean;
  username: string;
  userId?: string;
  error: string;
  rememberAvailable?: boolean;
  rememberDays?: number;
  confirmation?: { email: string; expires: number };
  passwordChange?: { expires: number };
  loginIdentifier?: "email" | "username";
  oauth?: boolean;
  displayName?: string;
  menu?: MenuDefinition[];
  /** Offered views in menu order (toolkit `ViewDefinition`: shared keys at the top, the kind's payload in `options`). */
  views?: ViewDefinition[];
  /** Only after sign-in: the application's ES modules (`ApplicationDefinition::$modules`), page-relative paths. */
  modules?: string[];
  csrf?: string;
  live?: import("./Realtime").LiveConfig;
  /** Only with tenancy: the server-resolved active tenant (null: no membership) and the actor's memberships. */
  tenant?: { current: string | null; choices: { id: string; name: string }[] };
  /** Only after sign-in: application skins (DHTMLX custom themes) of the identity; they replace the factory themes. */
  skins?: { id: string; label: string; base: "light" | "dark" | "skyblue" }[];
  /** Optional application logo (`ApplicationDefinition::$logo`): keyed image URLs, its accessible text and placement. */
  logo?: { image: string; dark?: string; label: string; placement?: "window" | "top" | "both" };
  /** Signed out only: the windows' notice and links (`ApplicationDefinition::$signIn`), server-translated plain text. */
  signIn?: { notice?: string; links?: { label: string; href: string }[] };
  /** Signed out only: the sign-in modules (`ApplicationDefinition::$signInModules`), page-relative keyed paths. */
  signInModules?: string[];
};
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

/** `sessionStorage` time of the last automatic sign-out reload, so a page that keeps answering 401 never loops. */
const SIGNED_OUT="blade-signed-out";

/** Finish native popup/focus state before replacing a responsive menu tree. */
class NavigationMenu extends Menu {
  replaceItems(items:object[]):void{
    this._close(new MouseEvent("click"));
    this.data.removeAll();this.data.parse(items);
  }
}

/** 61ade owns the DHTMLX lifecycle; consumers supply definitions, never shell markup. */
export class AdminShell {
  private releaseIcons=widgetIcons();
  private layout: Layout;
  /** Lower bar: user, the uploader's indicator (hidden when idle) and the application version. */
  private status: Toolbar;
  private releaseUploads?: () => void;
  private menu?: NavigationMenu;
  /** The view of the workspace page and the views open in document windows. */
  private page?: Mounted;
  private windows=new Set<Mounted>();
  private navigation=0;
  /** The page's toolkit `Application`, its event bus and kind registry (signed in only). */
  private kernel?: Kernel;
  /** The tab's one live channel (signed in with a list view), shared by every list and sub-view. */
  private channel?: LiveChannel;
  private get live():LiveChannel{return this.channel??=new LiveChannel(this.definition.live || {transport:"poll",endpoint:"live",interval:2000},
    {notice:text=>this.liveNotice(text),editing:()=>this.editing(),ended:()=>this.sessionEnded()});}
  /** An open view may hold unsaved input (record or bulk form, cell editor, changed singleton form, diagram). */
  private editing():boolean{return [this.page,...this.windows].some(mounted=>mounted?.instance?.editing?.()??false);}
  private signedOut=false;
  /**
   * `#view=<id>[&record=<id>]`; `filter.<field>=<value>` presets that view's filters once and leaves the address.
   */
  private route = () => {
    const route = parseRoute(location.hash);
    const view = route.view === undefined ? undefined : this.offered(route.view);
    const record = view?.record ? route.record : undefined;
    if (view && Object.keys(route.filters).length) { const url = new URL(location.href); url.hash = routeHash({ view: view.id, record }); history.replaceState(null, "", url); }
    if (view && this.openable(view, record)) void this.openView(view, { record, filters: route.filters });
    else this.clear();
  };
  private menuItems: object[] = [];
  private menuState?: string;
  private loginWindow?: Window;
  private loginForm?: Form;
  private submitting = false;
  private listeners = new AbortController();
  private resize = () => {
    this.renderMenu();
    if (!this.loginWindow) return;
    const width = this.definition.confirmation || this.definition.passwordChange ? 460 : 420;
    const height = (this.definition.confirmation || this.definition.passwordChange ? 420 : this.definition.rememberAvailable ? 340 : 290) + (this.definition.confirmation || this.definition.passwordChange || !this.definition.oauth ? 0 : 48) + (this.windowLogo ? 64 : 0) + (this.definition.signIn ? 64 : 0);
    this.loginWindow.setSize(
      Math.min(width, innerWidth - 24),
      Math.min(height, innerHeight - 24),
    );
    if(!this.loginWindow.isVisible())this.loginWindow.show();
    void this.fitLogin();
  };

  /** Top menu, or on narrow space one `Menü` button followed, on desktop, by the open feature's sibling items. */
  private renderMenu():void{
    if (!this.menu) { this.logoWidth(this.root.clientWidth); return; }
    const width=this.root.clientWidth;
    const logo=this.logoWidth(width);
    const required=(items:any[])=>items.reduce((sum:number,item:any)=>sum+76+String(item.value || "").length*9,305+(this.definition.i18n?.selector?130:0)+(this.tenantCell?180:0)-(this.definition.skins?.length===1?145:0)+logo);
    const compact = width < Math.max(768,required(this.menuItems));
    const current="view:"+(parseRoute(location.hash).view??"");
    const siblings=(items:any[],nested=false):any[]|undefined=>{
      for(const item of items){
        if(item.id===current)return nested?items:undefined;
        const found=item.items&&siblings(item.items,true);
        if(found)return found;
      }
    };
    let context=compact&&width>=768?siblings(this.menuItems)??[]:[];
    if(required([{value:t("Menü")},...context])>width)context=[];
    const state=JSON.stringify([compact,context.length?current:""]);
    if (state === this.menuState) return;
    this.menuState = state;
    const entries=[...structuredClone(this.menuItems),...this.tenantMenu(),
      { id: "blade-session-separator", type: "separator" },
      { id: "blade-logout", value: t("Kijelentkezés"), icon:"dxi dxi-arrow-left" },
    ];
    const prefixed=(items:any[]):object[]=>items.map(item=>({...item,id:"sibling:"+item.id,active:item.id===current,...(item.items?{items:prefixed(item.items)}:{})}));
    this.menu.replaceItems(compact?[{id:"blade-main-menu",value:t("Menü"),icon:"dxi dxi-view-grid",items:entries},
      ...(context.length?[{id:"blade-context-separator",type:"separator"},...prefixed(context)]:[])]:entries);
  }

  /**
   * The top-row logo shows while the row keeps room for `Menü` and the selectors; its rendered width (the image at its
   * CSS height) then counts in the menu estimate.
   */
  private logoWidth(width:number):number{
    const box=this.root.querySelector<HTMLElement>(".blade-navigation-row .blade-logo");
    if(!box)return 0;
    box.hidden=false;
    const reserved=Math.ceil(box.getBoundingClientRect().width);
    box.hidden=width-(this.tenantCell?180:0)-(this.definition.i18n?.selector?130:0)-(this.definition.skins?.length===1?0:145)-(this.menu?128:0)<reserved;
    return box.hidden?0:reserved;
  }

  /**
   * The logo's markup: one accessible image (or, for the top-row copy beside a window logo, one hidden from assistive
   * technology); with a dark image, CSS shows the one of the applied base theme.
   */
  private logoHtml(hidden=false):string{
    const logo=this.definition.logo;
    if(!logo)return "";
    const image=(src:string,kind:string)=>`<img class="blade-logo__image blade-logo__image--${kind}" src="${escape(src)}" alt="">`;
    return `<span class="blade-logo${logo.dark?" blade-logo--themed":""}" ${hidden?'aria-hidden="true"':`role="img" aria-label="${escape(logo.label)}"`}>${image(logo.image,"light")}${logo.dark?image(logo.dark,"dark"):""}</span>`;
  }
  /** Signed out, `placement` decides; the signed-in shell always shows the logo in the top row. */
  private get windowLogo():boolean{ return !this.definition.authenticated&&!!this.definition.logo&&(this.definition.logo.placement??"window")!=="top"; }
  private get topLogo():boolean{ return !!this.definition.logo&&(this.definition.authenticated||(this.definition.logo.placement??"window")!=="window"); }

  /** The windows' notice and links below the form: plain text, native links in a labelled list. */
  private signInInfo():string{
    const info=this.definition.signIn;
    if(!info?.notice&&!info?.links?.length)return "";
    const notice=info.notice?`<p class="blade-sign-in__notice">${escape(info.notice)}</p>`:"";
    const links=info.links?.length?`<nav class="blade-sign-in__links" aria-label="${escape(t("Hivatkozások"))}"><ul>${info.links.map(link=>`<li><a href="${escape(link.href)}">${escape(link.label)}</a></li>`).join("")}</ul></nav>`:"";
    return `<div class="blade-sign-in-info" data-blade-after-form>${notice}${links}</div>`;
  }

  private async fitLogin():Promise<void>{
    await awaitRedraw();
    const win=this.loginWindow;
    if(!win||this.listeners.signal.aborted)return;
    const container=win.getContainer();
    const buttons=Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(button=>button.getBoundingClientRect().height>0&&!button.closest("[data-blade-after-form]"));
    if(!buttons.length)return;
    const outer=(container.closest<HTMLElement>('[role="dialog"]')??container).getBoundingClientRect();
    const bottom=Math.max(...buttons.map(button=>button.getBoundingClientRect().bottom));
    // Content below the form (notice, links, footer slot) keeps its own height; the form cell takes the rest.
    const after=Array.from(container.querySelectorAll<HTMLElement>("[data-blade-after-form]")).reduce((sum,element)=>sum+element.getBoundingClientRect().height,0);
    const height=Math.min(innerHeight-24,Math.ceil(bottom-outer.top+(after?8:24)+after));
    win.setSize(outer.width,height);
    win.setPosition(Math.max(12,(innerWidth-outer.width)/2),Math.max(12,(innerHeight-height)/2));
  }

  constructor(
    private root: HTMLElement,
    private command: HTMLFormElement,
    private definition: ShellDefinition,
  ) {
    configureLanguage(definition.i18n);
    // Skins replace the factory themes and keep their own stored choice, so blade-theme survives a lost skin.
    // A skin applies its factory base theme and refines it through data-blade-skin.
    const skins=definition.skins??[];
    const choices:{id:string;label:string;base?:string}[]=skins.length?skins.map(skin=>({id:skin.id,label:escape(skin.label),base:skin.base})):[{id:"skyblue",label:"Skyblue"},{id:"light",label:t("Világos")},{id:"dark",label:t("Éjjeli")}];
    const storage=skins.length?"blade-skin":"blade-theme";
    const apply=(id:string)=>{
      const choice=choices.find(choice=>choice.id===id)!;
      if(skins.length)document.documentElement.dataset.bladeSkin=id;
      setTheme(choice.base??id,document.documentElement);
      themeApplied(choice.base??id,skins.length?id:null);
      if(!definition.authenticated)signInThemeApplied(choice.base??id);
    };
    configureServer(definition.csrf || "", definition.authenticated ? () => this.sessionEnded() : undefined);
    let theme=choices[0].id;
    try { const saved=localStorage.getItem(storage); if(choices.some(choice=>choice.id===saved))theme=saved!; } catch {}
    apply(theme);
    if (definition.protocol !== 1)
      throw new Error(t("Nem kompatibilis 61ade felületverzió."));
    this.layout = new Layout(root, {
      type: "line",
      rows: [
        { id: "menu-row", height: 40, css:"blade-navigation-row", cols: [{id:"main-menu"},...(this.tenantCell?[{id:"tenant",width:180}]:[]),...(definition.i18n?.selector?[{id:"language",width:130}]:[]),...(choices.length>1?[{id:"theme",width:145}]:[]),
          ...(this.topLogo?[{id:"logo",width:"content",css:"blade-logo-cell",html:this.logoHtml(this.windowLogo)}]:[])] },
        { id: "workspace", css: "blade-workspace" },
        { id: "status", height: 32, css: "blade-session-bar" },
      ],
    });
    this.status = new Toolbar(undefined, {
      data: [
        {
          id: "session-status",
          type: "title",
          value: escape(
            definition.authenticated
              ? definition.displayName || ""
              : t("Nincs bejelentkezve"),
          ),
        },
        ...(definition.authenticated && definition.tenant ? [{ id: "tenant-status", type: "title", css: definition.tenant.current ? "blade-tenant-status" : "blade-tenant-status blade-tenant-status--none",
          value: escape(definition.tenant.choices.find(choice => choice.id === definition.tenant!.current)?.name ?? t("Nincs hozzárendelt tenant")),
          tooltip: definition.tenant.current ? t("Aktív tenant") : t("Nincs hozzárendelt tenant; a tenanthoz kötött nézetek nem érhetők el.") }] : []),
        { type: "spacer" },
        { id: "live-status", type: "title", value: "", hidden: true },
        { id: "upload-status", value: "", icon: "dxi dxi-file-import", hidden: true, css: "blade-upload-indicator" },
        {
          id: "application-version",
          type: "title",
          value: escape([definition.title, definition.version].filter(Boolean).join(" ")),
        },
      ],
    });
    this.layout.getCell("status").attach(this.status);
    // The top-row logo's width is known once its image loads (load does not bubble: capture).
    if(this.topLogo)root.addEventListener("load",event=>{if((event.target as Element).closest?.(".blade-navigation-row .blade-logo"))this.renderMenu();},{capture:true,signal:this.listeners.signal});
    if (definition.authenticated) {
      uploads.configure({ userId: definition.userId });
      this.status.events.on("click", (id: string | number) => { if (id === "upload-status") uploads.reopen(); });
      this.releaseUploads = uploads.indicator(state => this.uploadIndicator(state));
    }
    if(choices.length>1){
      const label=(id:string)=>choices.find(choice=>choice.id===id)!.label;
      const themeControl=new Toolbar(undefined,{data:[{id:"theme-choice",value:label(theme),items:choices.map(choice=>({id:"theme:"+choice.id,value:choice.label}))}]});
      themeControl.events.on("click",(id:string|number)=>{
        const next=String(id).slice(6);
        if(!String(id).startsWith("theme:")||!choices.some(choice=>choice.id===next))return;
        apply(next);
        themeControl.data.update("theme-choice",{value:label(next)});
        try{localStorage.setItem(storage,next);}catch{}
        // The other logo image may have another width.
        this.renderMenu();
        void this.fitLogin();
      });
      this.layout.getCell("theme").attach(themeControl);
    }
    if(definition.i18n?.selector){
      this.layout.getCell("language").attach(this.languageControl());
    }
    if(this.tenantCell)this.layout.getCell("tenant").attach(this.tenantControl());
    if (definition.authenticated) {
      const map = (items: MenuDefinition[]): object[] =>
        items.map((item) => ({
          id: item.id,
          value: escape(item.label),
          icon:item.icon??"dxi dxi-folder",
          ...(item.items?.length
            ? { items: map(item.items) }
            : { disabled: true }),
        }));
      const features: any[]=[];
      // A record view opens for one record (activation, navigate, address) and has no menu entry.
      for(const view of (definition.views || []).filter(view=>!view.record)) {
        const item={id:"view:"+view.id,value:escape(view.title),icon:view.icon??"dxi dxi-table-check"};
        if(view.group){
          let group=features.find(v=>v.id==="group:"+view.group);
          if(!group){group={id:"group:"+view.group,value:escape(view.group),icon:"dxi dxi-folder-open",items:[]};features.push(group);}
          group.items.push(item);
        }else features.push(item);
      }
      this.menuItems = [...map(definition.menu || []), ...features];
      const menu = new NavigationMenu(undefined, { navigationType: "click" });
      this.menu = menu;
      this.resize();
      menu.events.on("click", (id: string | number) => {
        id=String(id).replace(/^sibling:/,"");
        if (id === "blade-logout") this.post("logout");
        if (id.startsWith("tenant:") && id.slice(7) !== this.definition.tenant?.current) this.post("tenant", { tenant: id.slice(7) });
        const view=id.startsWith("view:")?this.offered(id.slice(5)):undefined;
        if(view&&!view.record&&this.openable(view))void this.openView(view,{push:true});
      });
      this.layout.getCell("main-menu").attach(menu);
      // Opened once after sign-in, before the first list: every list of the page subscribes on it.
      if((definition.views||[]).some(view=>view.kind==="list"))void this.live;
      this.kernel=createApplication({channel:()=>this.live,userId:definition.userId??"",displayName:definition.displayName??"",tenant:definition.tenant?.current??null,
        views:definition.views??[],navigate:target=>this.navigate(target)});
      const start=()=>{if(this.listeners.signal.aborted)return;window.addEventListener("hashchange", this.route, {signal:this.listeners.signal});this.route();};
      // Project modules register their kinds before the first route; a declarative application routes at once.
      if(definition.modules?.length)void loadModules(this.kernel,definition.modules,definition.version).catch(error=>console.error(error)).then(start);
      else start();
    } else {
      if (definition.passwordChange) this.mountPasswordChange();
      else if (definition.confirmation) this.mountConfirmation();
      else this.mountLogin();
    }
    window.addEventListener("resize", this.resize);
    if (definition.error) requestAnimationFrame(() => {
      void acknowledge({ title: t("Hiba"), message: definition.error, severity: "danger" })
        .then(() => { if (!this.listeners.signal.aborted) this.loginForm?.setFocus(definition.passwordChange ? "new_password" : definition.confirmation ? "code" : "password"); });
    });
  }

  /** An offered view by id (the bootstrap `views` are already filtered by the server). */
  private offered(id:string):ViewDefinition|undefined{return this.definition.views?.find(view=>view.id===id);}
  /** Its kind is registered, and a record view has its record id. */
  private openable(view:ViewDefinition,record?:string):boolean{return !!this.kernel?.kinds.has(view.kind)&&(!view.record||!!record);}

  /** `Application.navigate`: like a menu click or an address, through the `kinds` registry. */
  private navigate(target:NavigationTarget):boolean{
    const view=typeof target?.view==="string"?this.offered(target.view):undefined,record=view?.record?target.record:undefined;
    if(!view||!this.openable(view,record))return false;
    void this.openView(view,{record,filters:{...target.filters},open:target.open,push:true});
    return true;
  }

  /** The empty workspace (unknown or unoffered address, `host.close()` of a page). */
  private clear():void{
    this.renderMenu();
    ++this.navigation;
    this.layout.getCell("workspace").detach();
    this.unmountAll();
  }

  /**
   * Opens a view through its registered kind. A page replaces the workspace (`push`: a history entry, as a menu click);
   * a window (`open: "window"`) keeps the page and the address. A record view's row is resolved first through the
   * record resource's `get`; its failure shows the error dialog and keeps the current view.
   */
  private async openView(view:ViewDefinition,options:{record?:string;filters?:Record<string,string>;open?:ViewOpenMode;push?:boolean}={}):Promise<void>{
    const open=options.open??view.open??"page",kind=this.kernel!.kinds.get(view.kind)!;
    const navigation=open==="page"?++this.navigation:this.navigation;
    let record:ViewHost["record"];
    if(view.record&&options.record!==undefined){
      try{record={resource:view.record,id:options.record,row:await server.call<Row>(view.record,"get",{id:options.record})};}
      catch(error){if(!this.listeners.signal.aborted&&navigation===this.navigation)await this.failed(error);return;}
      if(this.listeners.signal.aborted||navigation!==this.navigation)return;
    }
    if(open==="window"){void this.mount(view,kind,"window",record,options.filters??{});return;}
    if(options.push){
      const url=new URL(location.href);
      url.hash=routeHash({view:view.id,record:record?.id});
      if(url.href!==location.href)history.pushState(null,"",url);
    }
    this.renderMenu();
    this.layout.getCell("workspace").detach();
    this.unmountAll();
    await awaitRedraw();
    if(navigation!==this.navigation || this.listeners.signal.aborted)return;
    await this.mount(view,kind,"page",record,options.filters??{});
  }

  /** Creates the view's `ViewHost` and instance; a throwing kind shows the error dialog and leaves nothing mounted. */
  private async mount(view:ViewDefinition,kind:{create:(host:ViewHost,view:ViewDefinition)=>ViewInstance|Promise<ViewInstance>},open:ViewOpenMode,record:ViewHost["record"],filters:Record<string,string>):Promise<void>{
    const controller=new AbortController(),signal=controller.signal;
    const mounted:Mounted={view,record:record?.id,open,controller};
    if(open==="window"){
      // The record views' framework document window: like a sub-view window, full screen on a phone.
      mounted.window=openWindow({title:view.title,css:"blade-feature-window",width:1100,height:720,fit:false});
      mounted.window.signal.addEventListener("abort",()=>this.unmount(mounted),{once:true});
      this.windows.add(mounted);
    }else this.page=mounted;
    const host:ViewHost=Object.freeze({
      app:this.kernel!.app,signal,open,...(record?{record}:{}),filters:Object.freeze({...filters}),
      attach:(content:Parameters<ViewHost["attach"]>[0])=>{
        if(signal.aborted)return;
        if(mounted.window){mounted.window.attach(content);return;}
        const cell=this.layout.getCell("workspace");
        if(!view.desktopOnly){attachContent(cell,content,signal);return;}
        if(!mounted.wrapper){mounted.wrapper=new DesktopOnly(view.title);attachContent(mounted.wrapper.cell,content,signal);cell.attach(mounted.wrapper.layout);}
        else attachContent(mounted.wrapper.cell,content,signal);
      },
      setTitle:(text:string)=>{if(!signal.aborted)mounted.window?.setTitle(String(text));},
      close:()=>{
        if(signal.aborted)return;
        if(mounted.window){mounted.window.close();return;}
        const url=new URL(location.href);url.hash="";history.pushState(null,"",url);this.clear();
      },
    });
    try{
      const instance=await kind.create(host,view);
      if(signal.aborted){instance.destroy();return;}
      mounted.instance=instance;
    }catch(error){
      if(signal.aborted)return;
      if(mounted.window)mounted.window.close();else{this.layout.getCell("workspace").detach();this.unmount(mounted);}
      await this.failed(error);
      return;
    }
    this.kernel!.events.dispatch("view:opened",{id:view.id,...(record?{record:record.id}:{}),open});
  }

  /** Closes one view: its signal aborts, then the instance and wrapper are destroyed (exactly once). */
  private unmount(mounted:Mounted):void{
    if(mounted.controller.signal.aborted)return;
    mounted.controller.abort();
    if(this.page===mounted)this.page=undefined;
    this.windows.delete(mounted);
    try{mounted.instance?.destroy();}catch(error){console.error(error);}
    mounted.wrapper?.destroy();
    mounted.window?.close();
    if(mounted.instance)this.kernel?.events.dispatch("view:closed",{id:mounted.view.id,...(mounted.record!==undefined?{record:mounted.record}:{})});
  }
  /** A page navigation closes the page and every view window. */
  private unmountAll():void{for(const mounted of [...this.windows,...(this.page?[this.page]:[])])this.unmount(mounted);}

  /** The shared error dialog of a failed record resolution or view kind. */
  private async failed(error:unknown):Promise<void>{
    const fields=Object.values((error as {fieldErrors?:Record<string,string>})?.fieldErrors??{});
    await acknowledge({title:t("Hiba"),severity:"danger",message:[error instanceof Error?error.message:t("Sikertelen művelet."),...fields].join("\n")});
  }

  /**
   * The session ended (a 401 of the JSON channel, or the live channel's end): the reload shows the sign-in page,
   * which keeps the address for after sign-in. Over unsaved input the modal asks first, so the user can copy it out;
   * Cancel keeps the page and the next 401 asks again. A second automatic reload within 60 s (the page came back
   * signed in, yet the channel answers 401) also asks instead of looping.
   */
  private sessionEnded():void{
    if(this.signedOut||this.listeners.signal.aborted)return;
    this.signedOut=true;
    let recent=true;
    try{recent=Date.now()-Number(sessionStorage.getItem(SIGNED_OUT)||0)<60000;}catch{}
    if(!recent&&!this.editing()){this.signOut();return;}
    void showDialog({mode:"confirm",severity:"warning",title:t("A munkamenet lejárt"),initialFocus:"cancel",confirmLabel:t("Bejelentkezés"),
      message:t("A munkamenet lejárt, a nyitott adatok nem menthetők. Másold ki, amire még szükséged van, majd jelentkezz be újra.")})
      .then(confirmed=>{if(this.listeners.signal.aborted)return;if(confirmed)this.signOut();else this.signedOut=false;});
  }
  private signOut():void{
    try{sessionStorage.setItem(SIGNED_OUT,String(Date.now()));}catch{}
    this.channel?.close();
    location.reload();
  }

  /** The live channel's page-level hint (a stale page that did not reload) in the lower bar. */
  private liveNotice(text: string): void {
    this.status.data.update("live-status", { value: escape(text), tooltip: text });
    this.status.show("live-status");
  }

  /** Shows, hides or relabels the indicator only when its text changes, so progress does not repaint the bar. */
  private uploadIndicator(state: UploadIndicator): void {
    const item = this.status.data.getItem("upload-status");
    if (!item) return;
    const value = state ? escape(state.text) : "";
    if (!state) { if (!item.hidden) this.status.hide("upload-status"); return; }
    if (item.value !== value) this.status.data.update("upload-status", { value, tooltip: state.label });
    if (item.hidden) this.status.show("upload-status");
  }

  /** A selector only for several memberships; the switch is a server round trip that reloads the whole shell. */
  private get tenantSelector():boolean{ return this.definition.authenticated && (this.definition.tenant?.choices.length ?? 0) > 1; }
  /** Below 768 px the tenant choice is a submenu of the main menu, so the navigation row keeps room for it. */
  private readonly narrowTenant=innerWidth<768;
  private get tenantCell():boolean{ return this.tenantSelector&&!this.narrowTenant; }
  private tenantMenu():object[]{
    if(!this.tenantSelector||!this.narrowTenant)return [];
    const tenant=this.definition.tenant!,current=tenant.choices.find(choice=>choice.id===tenant.current);
    return [{id:"blade-tenant-separator",type:"separator"},{id:"blade-tenant-menu",value:escape(t("Tenant")+": "+(current?.name??"—")),icon:"dxi dxi-view-grid",
      items:tenant.choices.map(choice=>({id:"tenant:"+choice.id,value:escape(choice.name),...(choice.id===tenant.current?{icon:"dxi dxi-check"}:{})}))}];
  }
  private tenantControl():Toolbar{
    const tenant=this.definition.tenant!;
    const current=tenant.choices.find(choice=>choice.id===tenant.current);
    const control=new Toolbar(undefined,{data:[{id:"blade-tenant",value:escape(current?.name??t("Tenant")),icon:"dxi dxi-view-grid",tooltip:t("Tenant váltása"),
      items:tenant.choices.map(choice=>({id:"tenant:"+choice.id,value:escape(choice.name),...(choice.id===tenant.current?{icon:"dxi dxi-check"}:{})}))}]});
    control.events.on("click",(id:string|number)=>{
      const choice=String(id).startsWith("tenant:")?String(id).slice(7):"";
      if(choice&&choice!==tenant.current)this.post("tenant",{tenant:choice});
    });
    return control;
  }
  private languageControl():Toolbar{
    const config=this.definition.i18n!;
    const language=new Toolbar(undefined,{data:[{id:"blade-language",value:escape(config.languages[config.locale]),icon:languageIcon(config,config.locale),tooltip:t("Nyelv"),items:Object.keys(config.languages).map(id=>({id:"language:"+id,value:escape(config.languages[id]),icon:languageIcon(config,id)}))}]});
    language.events.on("click",(id:string|number)=>{if(String(id).startsWith("language:"))this.post("language",{locale:String(id).slice(9)});});
    return language;
  }
  /** Language row of the sign-in forms: an ordinary read-only Combo aligned with the other fields. */
  private languageItem(labelPosition:"left"|"top"="left"):object[]{
    const config=this.definition.i18n;
    if(!config?.selector)return [];
    const flag=(id:string)=>languageIcon(config,id)??"";
    return [{type:"combo",name:"blade_language",label:t("Nyelv"),labelPosition,labelWidth:120,readOnly:true,
      css:"blade-language-field"+(config.flags?.[config.locale]?" blade-language-field--"+config.flags[config.locale]:""),
      value:config.locale,data:Object.keys(config.languages).map(id=>({id,value:config.languages[id]})),
      template:(item:{id:string;value:string})=>`<span class="blade-language-option"><span class="${flag(item.id)}"></span>${escape(item.value)}</span>`}];
  }
  private attachLoginForm(form:Form):void{
    form.events.on("change",(name:string)=>{
      if(name!=="blade_language")return;
      // The Combo reports an intermediate empty value while switching; read the settled choice.
      const value=String(form.getItem("blade_language")?.getValue()??"");
      if(value&&Object.hasOwn(this.definition.i18n?.languages??{},value)&&value!==this.definition.i18n?.locale)this.post("language",{locale:value});
    });
    const logo=this.windowLogo?this.logoHtml():"",info=this.signInInfo(),modules=this.definition.signInModules??[];
    if(!logo&&!info&&!modules.length){this.loginWindow!.attach(form);return;}
    // A native in-window Layout: logo, header slot, the form, notice and links, footer slot.
    const layout=new Layout(undefined,{type:"none",rows:[
      ...(logo?[{id:"logo",height:"content",css:"blade-auth-logo",html:logo}]:[]),
      ...(modules.length?[{id:"header",height:"content"}]:[]),
      {id:"form"},
      ...(info?[{id:"info",height:"content",html:info}]:[]),
      ...(modules.length?[{id:"footer",height:"content"}]:[]),
    ]});
    layout.getCell("form").attach(form);
    this.loginWindow!.attach(layout);
    if(modules.length)this.startSignInModules(layout,modules);
  }

  /** Empty header and footer slots for the sign-in modules; the window refits whenever their content changes size. */
  private startSignInModules(layout:Layout,modules:string[]):void{
    const slot=(name:string)=>{
      const element=document.createElement("div");
      element.className="blade-sign-in-slot blade-sign-in-slot--"+name;
      element.dataset.bladeSlot=name;
      if(name==="footer")element.dataset.bladeAfterForm="";
      attachContent(layout.getCell(name),element,this.listeners.signal);
      return element;
    };
    const header=slot("header"),footer=slot("footer");
    const observer=new ResizeObserver(()=>{void this.fitLogin();});
    observer.observe(header);observer.observe(footer);
    this.listeners.signal.addEventListener("abort",()=>observer.disconnect(),{once:true});
    const kinds:SignInPage[]=["sign-in","confirmation","password-change"];
    const kind=document.documentElement.dataset.bladePage as SignInPage;
    const page=kinds.includes(kind)?kind:this.definition.passwordChange?"password-change":this.definition.confirmation?"confirmation":"sign-in";
    void loadSignInModules(signInApplication(page,this.definition.i18n?.locale??document.documentElement.lang,{header,footer}),modules);
  }
  private mountLogin(): void {
    const definition = this.definition;
    this.loginWindow = new Window({
      title: t("Bejelentkezés"),
      ariaLabel: t("Bejelentkezés"),
      css:"blade-auth-window",
      width: 420,
      height: definition.rememberAvailable ? 340 : 290,
      modal: true,
      closable: false,
      movable: true,
      resizable: false,
    });
    const form = new Form(document.createElement("div"), {
      padding: 16,
      rows: [
        ...this.languageItem(),
        {
          type: "input",
          name: "username",
          label: t(definition.loginIdentifier === "email" ? "E-mail" : "Felhasználónév"),
          labelPosition: "left",
          labelWidth: 120,
          required: true,
          maxlength: definition.loginIdentifier === "email" ? 254 : 64,
          value: definition.username,
          autocomplete: true,
        },
        {
          type: "input",
          name: "password",
          label: t("Jelszó"),
          labelPosition: "left",
          labelWidth: 120,
          required: true,
          inputType: "password",
          maxlength: 1024,
          autocomplete: true,
        },
        ...(definition.rememberAvailable ? [{
          type: "checkbox" as const,
          name: "remember",
          text: t("Bejelentkezve maradok ({days} nap)",{days:definition.rememberDays??90}),
          checked: false,
        }] : []),
        {
          align: "end",
          cols: [
            {
              type: "button",
              name: "login",
              text: t("Bejelentkezés"),
              icon: "dxi dxi-key",
              view: "flat",
              color: "primary",
            },
          ],
        },
        // External sign-in: AuthHandler's own overlay offers the configured providers.
        ...(definition.oauth ? [{
          type: "button" as const,
          name: "oauth",
          text: t("Belépés külső fiókkal"),
          icon: "dxi dxi-link-variant",
          view: "flat" as const,
          color: "secondary" as const,
          full: true,
          padding: "16px 0 0 0",
        }] : []),
      ],
    });
    this.loginForm = form;
    form.events.on("afterValidate",()=>{void this.fitLogin();});
    const submit = () => {
      if (this.submitting || !form.validate()) return;
      const value = form.getValue() as Record<string, string>;
      this.post("login", {
        username: value.username,
        password: value.password,
        remember: value.remember ? "1" : "0",
      });
    };
    form.events.on("click", (name: string) => {
      if (name === "login") submit();
      if (name === "oauth" && !this.submitting && !openExternalSignIn(!!(form.getValue() as Record<string, unknown>).remember))
        void acknowledge({ title: t("Hiba"), message: externalSignInUnavailable(), severity: "warning" });
    });

    this.attachLoginForm(form);
    this.resize();
    // DHTMLX can consume Enter before it bubbles; handle it at the adapter boundary.
    document.addEventListener(
      "keydown",
      (event: KeyboardEvent) => {
        if (
          event.key !== "Enter" ||
          event.repeat ||
          !(event.target instanceof HTMLInputElement) ||
          !["username", "password"].includes(event.target.name)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        form.setValue({
          username:
            document.querySelector<HTMLInputElement>('input[name="username"]')
              ?.value || "",
          password:
            document.querySelector<HTMLInputElement>('input[name="password"]')
              ?.value || "",
        });
        submit();
      },
      { capture: true, signal: this.listeners.signal },
    );
    requestAnimationFrame(() => {
      form.setFocus(definition.error ? "password" : "username");
      const inputs = this.loginWindow?.getContainer().querySelectorAll("input");
      inputs?.forEach((input) => {
        if (!["username", "password"].includes(input.name)) return;
        input.setAttribute(
          "autocomplete",
          input.type === "password" ? "current-password" : "username",
        );
      });
    });
  }

  private mountConfirmation(): void {
    const confirmation = this.definition.confirmation!;
    this.loginWindow = new Window({
      title: t("E-mailes megerősítés"),
      ariaLabel: t("E-mailes megerősítés"),
      css:"blade-auth-window",
      width: 460,
      height: 420,
      modal: true,
      closable: false,
      resizable: false,
    });
    const form = new Form(document.createElement("div"), {
      padding: 20,
      rows: [
        ...this.languageItem("top"),
        { type: "text", name: "recipient", label: t("Megerősítő levelet küldtünk"), value: escape(confirmation.email) },
        { type: "input", name: "code", label: t("Megerősítő kód"), labelPosition: "top", required: true, maxlength: 6,
          validation: (value: string | number) => /^[0-9]{6}$/.test(String(value)), errorMessage: t("A levélben kapott 6 számjegyű kód szükséges.") },
        { type: "button", name: "verify", text: t("Belépés megerősítése"), full:true, padding:"8px 0 0 0", icon:"dxi dxi-check", color: "primary" },
        { rows: [
          { type: "button", name: "resend", text: t("Új kód küldése"), full:true, padding:"8px 0 0 0", icon:"dxi dxi-email", view: "flat", color:"secondary" },
          { type: "button", name: "cancel", text: t("Vissza a belépéshez"), full:true, padding:"8px 0 0 0", icon:"dxi dxi-arrow-left", view: "flat", color:"secondary" },
        ] },
      ],
    });
    this.loginForm = form;
    form.events.on("afterValidate",()=>{void this.fitLogin();});
    const submit = () => {
      if (!this.submitting && form.validate()) this.post("confirm_login", { code: String(form.getValue().code ?? "") });
    };
    form.events.on("click", (name: string) => {
      if (name === "verify") submit();
      if (name === "resend") this.post("resend_login");
      if (name === "cancel") this.post("cancel_login");
    });
    document.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || !(event.target instanceof HTMLInputElement) || event.target.name !== "code") return;
      event.preventDefault();
      form.setValue({ code: event.target.value });
      submit();
    }, { capture: true, signal: this.listeners.signal });
    this.attachLoginForm(form);
    this.resize();
    requestAnimationFrame(() => {
      form.setFocus("code");
      const input = this.loginWindow?.getContainer().querySelector('input[name="code"]');
      input?.setAttribute("autocomplete", "one-time-code");
      input?.setAttribute("inputmode", "numeric");
    });
  }

  /** Forced replacement of an administrator-issued temporary password; no session exists yet. */
  private mountPasswordChange(): void {
    this.loginWindow = new Window({
      title: t("Jelszócsere"),
      ariaLabel: t("Jelszócsere"),
      css:"blade-auth-window",
      width: 460,
      height: 420,
      modal: true,
      closable: false,
      resizable: false,
    });
    const length = (value: string | number) => [...String(value)].length >= 12 && [...String(value)].length <= 128;
    const form: Form = new Form(document.createElement("div"), {
      padding: 20,
      rows: [
        ...this.languageItem("top"),
        { type: "text", name: "info", value: t("Az első belépéshez új jelszót kell megadnod (12–128 karakter).") },
        { type: "input", inputType: "password", name: "new_password", label: t("Új jelszó"), labelPosition: "top", required: true, maxlength: 128,
          validation: length, errorMessage: t("Az új jelszó 12–128 karakter legyen.") },
        { type: "input", inputType: "password", name: "confirm_password", label: t("Új jelszó ismét"), labelPosition: "top", required: true, maxlength: 128,
          validation: (value: string | number): boolean => String(value) === String(form.getValue().new_password ?? ""), errorMessage: t("A két új jelszó eltér.") },
        { type: "button", name: "save", text: t("Jelszó mentése és belépés"), full:true, padding:"8px 0 0 0", icon:"dxi dxi-key", color: "primary" },
        { type: "button", name: "cancel", text: t("Vissza a belépéshez"), full:true, padding:"8px 0 0 0", icon:"dxi dxi-arrow-left", view: "flat", color:"secondary" },
      ],
    });
    this.loginForm = form;
    form.events.on("afterValidate",()=>{void this.fitLogin();});
    const submit = () => {
      if (this.submitting || !form.validate()) return;
      const value = form.getValue();
      this.post("change_password", { new_password: String(value.new_password ?? ""), confirm_password: String(value.confirm_password ?? "") });
    };
    form.events.on("click", (name: string) => {
      if (name === "save") submit();
      if (name === "cancel") this.post("cancel_password_change");
    });
    document.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || !(event.target instanceof HTMLInputElement) || !["new_password", "confirm_password"].includes(event.target.name)) return;
      event.preventDefault();
      form.setValue({ [event.target.name]: event.target.value });
      submit();
    }, { capture: true, signal: this.listeners.signal });
    this.attachLoginForm(form);
    this.resize();
    requestAnimationFrame(() => {
      form.setFocus("new_password");
      this.loginWindow?.getContainer().querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => input.setAttribute("autocomplete", "new-password"));
    });
  }

  private post(
    action: "language" | "tenant" | "login" | "logout" | "confirm_login" | "resend_login" | "cancel_login" | "change_password" | "cancel_password_change",
    fields: Record<string, string> = {},
  ): void {
    if (this.submitting) return;
    this.submitting = true;
    if (action === "logout" || action === "tenant") this.channel?.close();
    for (const [name, value] of Object.entries({ action, ...fields })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      this.command.append(input);
    }
    this.loginForm?.disable();
    const target=new URL(this.command.getAttribute("action")||location.href,location.href);
    target.hash=location.hash;
    this.command.setAttribute("action",target.href);
    this.command.submit();
  }

  destroy(): void {
    this.releaseIcons();
    this.releaseUploads?.();
    this.listeners.abort();
    window.removeEventListener("resize", this.resize);
    closeDialogs();
    this.unmountAll();
    this.channel?.close();
    this.loginWindow?.destructor();
    this.layout.destructor();
    this.root.replaceChildren();
  }
}

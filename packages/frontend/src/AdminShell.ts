import { configureLanguage, languageIcon, type LanguageConfig, t } from "./I18n";
import { widgetIcons } from "./WidgetIcons";
import { externalSignInUnavailable, openExclusiveSignIn, openExternalSignIn } from "./ExternalAuth";
import { LiveChannel, Realtime } from "./Realtime";
import { DesktopOnly } from "./DesktopOnly";
import { splashLeft } from "./Splash";
import { Form, Layout, Menu, Toolbar, Window, setTheme, awaitRedraw } from "@dhtmlx/suite";
import { acknowledge, closeDialogs, showDialog } from "./MessageDialog";
import { ResponsiveToolbar } from "./ResponsiveToolbar";
import { uploads, type UploadIndicator } from "./Uploader";
import { configureServer, server } from "./api/Server";
import { attachContent, nonModalOpen, openWindow, themeApplied } from "./api/services";
import type { AppWindow, NavigationTarget, Row, ViewDefinition, ViewHost, ViewInstance, ViewOpenMode } from "./api/types";
import { createApplication, loadModules, type Kernel } from "./app/Application";
import { parseRoute, routeHash } from "./app/routes";
import { loadSignInModules, signInApplication, signInThemeApplied } from "./SignIn";
import { brandLogo } from "./BrandLogo";
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
  /** The public UI is available; `guest` denotes its actor, including under a sign-in window. */
  publicAccess?: boolean;
  guest?: boolean;
  /** A sign-in window over the public application; its actor remains the guest until authentication completes. */
  signingIn?: boolean;
  username: string;
  userId?: string;
  error: string;
  rememberAvailable?: boolean;
  rememberDays?: number;
  confirmation?: { email: string; expires: number };
  passwordChange?: { expires: number };
  loginIdentifier?: "email" | "username";
  oauth?: boolean;
  /** Signed out, OAuth-only sign-in: AuthHandler's overlay replaces the 61ade sign-in window. */
  oauthOnly?: boolean;
  displayName?: string;
  menu?: MenuDefinition[];
  /** Translated labels of offered view groups that get a preceding native separator. */
  menuSeparators?: string[];
  /** Menu-row commands offered to the actor (`MenuCommand`); `attention` names an offered view with attention. */
  menuCommands?: { id: string; label: string; icon?: string; tooltip?: string; emphasized: boolean; attention?: string }[];
  /** Offered views in menu order (toolkit `ViewDefinition`: shared keys at the top, the kind's payload in `options`). */
  views?: ViewDefinition[];
  /** Application pages, including public access: the project's ES modules, page-relative paths. */
  modules?: string[];
  csrf?: string;
  live?: import("./Realtime").LiveConfig;
  /** Only with tenancy: the server-resolved active tenant (null: no membership) and the actor's memberships. */
  tenant?: { current: string | null; choices: { id: string; name: string }[] };
  /** Application pages: skins of the effective identity; they replace the factory themes. */
  skins?: { id: string; label: string; base: "light" | "dark" | "blade" | "blade-night" }[];
  /**
   * The logo (`ApplicationDefinition::$logo`): keyed image URLs (none: the inlined 61ade product logo), its accessible
   * text and placement; absent only with `Logo::none()`.
   */
  logo?: { image?: string; dark?: string; label: string; placement?: "window" | "top" | "both" };
  /** Sign-in windows only: notice and links, server-translated plain text. */
  signIn?: { closeHref?: string; notice?: string; links?: { label: string; href: string }[] };
  /** Sign-in pages only: the sign-in modules, page-relative keyed paths. */
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
/** `sessionStorage` marks of the guides already shown in this sign-in session (AdminShell.guideKey). */
const GUIDE_PREFIX="blade-guide:2:";

/** Most urgent first: a branch and `Menü` show the tone of their most urgent entry. */
const TONES=["danger","warning","primary"];

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
  private controls?: ResponsiveToolbar;
  private signInControl?: Toolbar;
  private controlSize?:ResizeObserver;
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
    const view = route.view === undefined ? undefined : this.navigable(route.view);
    const record = view?.record ? route.record : undefined;
    if (view && Object.keys(route.filters).length) { const url = new URL(location.href); url.hash = routeHash({ view: view.id, record }); history.replaceState(null, "", url); }
    if (view && this.openable(view, record)) void this.openView(view, { record, filters: route.filters });
    else this.clear();
  };
  private menuItems: object[] = [];
  /** The navigation row's selectors have rendered (the first redraw after construction); the menu is fitted from then. */
  private measured = false;
  private menuState?: string;
  /** Live attention counts of menu entries (`ViewDefinition.attention`): view id → count, and its declared tone. */
  private attention=new Map<string,number>();
  private tones=new Map<string,string>();
  private loginWindow?: Window;
  private loginForm?: Form;
  private externalSignInOpen = false;
  private authListeners = new AbortController();
  private openingSignIn = false;
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
    if(!this.externalSignInOpen&&!this.loginWindow.isVisible())this.loginWindow.show();
    void this.fitLogin();
  };

  /** Top menu, or on narrow space one `Menü` button followed, on desktop, by the open feature's sibling items. */
  private renderMenu():void{
    const width=this.root.clientWidth,controls=Array.from(this.root.querySelectorAll<HTMLElement>(".blade-navigation-control")).reduce((sum,cell)=>sum+cell.getBoundingClientRect().width,0);
    // Signed out there is no menu: the top-row logo only yields to the selectors.
    if (!this.menu) { this.placeLogo(width-controls); return; }
    // The row is fitted once the selectors have their rendered widths: an earlier guess would show the full menu for a
    // frame and then collapse it under a pointer or test that already went for an entry.
    if (!this.measured) return;
    // Measure labels with the native menu font; fixed character estimates waste space on long sibling labels.
    const button=this.root.querySelector<HTMLElement>(".blade-navigation-row .dhx_nav-menu-button"),
      style=getComputedStyle(button??this.root),measure=document.createElement("canvas").getContext("2d")!,label=document.createElement("span");
    measure.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // An entry with attention (`html`) also holds its badge (the hidden count text takes no room).
    const itemWidth=(item:any)=>{label.innerHTML=String(item.value??"");return 32+(parseFloat(style.getPropertyValue("--dhx-icon-size-normal"))||20)+Math.ceil(measure.measureText(label.textContent??"").width)+(item.html?40:0);};
    // 16 px row inset; only the full menu reserves logout and its 17 px separator.
    const required=(items:any[],logout=this.definition.authenticated)=>items.reduce((sum:number,item:any,index:number)=>sum+(item.command?item.width:itemWidth(item))+(index&&item.separatorBefore?17:0),controls+16+(logout?17+itemWidth({value:t("Kijelentkezés")}):0));
    // Menu-row commands follow the navigation in every width: on a row too narrow for their labels they show icons only.
    const commandWidth=(command:any,iconOnly:boolean)=>iconOnly?44+(this.commandCount(command)?24:0):24+(parseFloat(style.getPropertyValue("--dhx-icon-size-normal"))||20)+8+Math.ceil(measure.measureText(command.label).width)+(this.commandCount(command)?40:0);
    // The declared commands reserve their room before their module registers them, so the registration never changes
    // the layout (which would close a menu opened during start-up).
    const commands=(iconOnly=false)=>(this.definition.menuCommands??[]).map(command=>({command,width:commandWidth(command,iconOnly),value:command.label}));
    // The full menu wins over the command's label: it keeps its entries with icon-only commands before it collapses.
    const full=(iconOnly:boolean)=>required([...this.menuItems,...commands(iconOnly)]);
    const compact = width < Math.max(768,full(true));
    const view=this.navigable(parseRoute(location.hash).view??"");
    // Record pages have no menu entry: inherit the first offered menu view of their record resource.
    const menuView=view?.record?(this.definition.views??[]).find(candidate=>!candidate.record&&candidate.menu!==false&&candidate.resource===view.record&&(!view.group||candidate.group===view.group)):view;
    const current=menuView?"view:"+menuView.id:view?.group?"group:"+view.group:"";
    const siblings=(items:any[],nested=false):any[]|undefined=>{
      for(const item of items){
        if(item.id===current)return item.items??(nested?items:undefined);
        const found=item.items&&siblings(item.items,true);
        if(found)return found;
      }
    };
    let context=compact&&width>=768?siblings(this.menuItems)??[]:[];
    const row=(iconOnly:boolean)=>[{value:t("Menü")},...commands(iconOnly),...context];
    const fits=(iconOnly:boolean)=>required(row(iconOnly),false)+(context.length?17:0)<=width;
    // Collapsed, the navigation keeps priority too: the commands' labels yield before the siblings.
    let iconOnly=!compact?full(false)>width:!fits(false);
    if(compact&&iconOnly&&!fits(true)){context=[];iconOnly=!fits(false);}
    // The menu never yields to the logo: it shows only in the room the menu, siblings and selectors leave.
    this.placeLogo(width-(compact?required(row(iconOnly),false)+(context.length?17:0):full(iconOnly)));
    // The commands and their icon-only form change only their own entries: `placeCommands` updates those in place.
    const layout=JSON.stringify([compact,current,context.length>0,!!this.guide]),state=JSON.stringify([layout,this.commands().map(command=>command.id),iconOnly]);
    if (state === this.menuState) return;
    const previous=this.menuState;
    this.menuState = state;
    // Only the registered commands changed (the modules have loaded): they are put in place, so an open menu stays open.
    if(previous&&JSON.parse(previous)[0]===layout){this.placeCommands(compact,iconOnly);return;}
    // A top-level item holding the open view carries the current-section underline (CSS, not the popup's active state).
    const holds=(item:any):boolean=>item.id===current||(item.items??[]).some(holds);
    const marked=(item:any)=>holds(item)?{...item,css:"blade-menu-current"}:item;
    const commandItems=this.commands().map(command=>this.commandItem(command,iconOnly));
    const entries=[...structuredClone(this.menuItems).flatMap((item:any,index:number)=>[
      ...(index&&item.separatorBefore?[{id:"blade-before:"+item.id,type:"separator"}]:[]),item,
    ]),
      ...(compact?[]:commandItems),
      ...(this.definition.authenticated ? [{ id: "blade-session-separator", type: "separator" },
      { id: "blade-logout", value: t("Kijelentkezés"), icon:"bi bi-arrow-left" }] : []),
    ];
    const prefixed=(items:any[]):any[]=>items.map(item=>({...item,id:"sibling:"+item.id,...(item.items?{items:prefixed(item.items)}:{})}));
    this.menu.replaceItems(compact?[{id:"blade-main-menu",value:t("Menü"),...this.menuHtml(this.mainMenu()),icon:"bi bi-grid",items:entries},...commandItems,
      ...(context.length?[{id:"blade-context-separator",type:"separator"},...context.map(marked).map(item=>prefixed([item])[0])]:[])]:entries.flatMap(item=>item.id==="blade-session-separator"?[{id:"blade-session-spacer",type:"spacer"},marked(item)]:[marked(item)]));
  }

  /** Declared menu-row commands whose handler a module registered (`placement: "menu"`), in declaration order. */
  private commands():NonNullable<ShellDefinition["menuCommands"]>{
    const registry=this.kernel?.app.commands;
    return (this.definition.menuCommands??[]).filter(command=>registry?.get(command.id)?.placement==="menu");
  }
  /** A command's live count: that of the view it names (offered, with attention), 0 otherwise. */
  private commandCount(command:{attention?:string}):number{return command.attention?this.attention.get(command.attention)??0:0;}
  /**
   * A command's menu entry. Its icon and label are its `html` (Suite's own icon would sit outside the tooltip): the
   * label, hidden on a row that shows icons only, and the attention badge like a view's, the accessible name "Label" or
   * "Label, 3 függőben". The emphasized tone is a filled primary button (shape, weight and colour; css).
   */
  private commandItem(command:NonNullable<ShellDefinition["menuCommands"]>[number],iconOnly:boolean):any{
    const count=this.commandCount(command),label=escape(command.label),icon=escape(command.icon??"bi bi-lightning");
    const title=command.tooltip?escape(command.tooltip):iconOnly?label:"";
    const badge=count?`<span class="blade-menu-count blade-menu-count--${this.tones.get(command.attention!)??"warning"}" aria-hidden="true">${count>99?"99+":count}</span>`:"";
    const name=count?`${label}, ${escape(t("{count} függőben",{count}))}`:label;
    return {id:"command:"+command.id,value:label,
      css:"blade-menu-command"+(command.emphasized?" blade-menu-command--primary":"")+(iconOnly?" blade-menu-command--icon":""),
      html:`<span class="blade-menu-command__body"${title?` title="${title}"`:""}><span class="dhx_menu-button__icon ${icon}" aria-hidden="true"></span>`
        +`<span class="blade-menu-command__label" aria-hidden="true">${label}</span>${badge}<span class="blade-visually-hidden">${name}</span></span>`};
  }
  /**
   * Puts the registered commands into the drawn row (after `Menü`, or before logout's spacer), updates the drawn ones
   * (icon-only or not) and drops others, without redrawing the menu.
   */
  private placeCommands(compact:boolean,iconOnly:boolean):void{
    const data=this.menu!.data,wanted=this.commands();
    data.eachChild(data.getRoot(),(item:any)=>{if(String(item.id).startsWith("command:")&&!wanted.some(command=>"command:"+command.id===item.id))data.remove(item.id);});
    let index=compact?data.getIndex("blade-main-menu")+1:data.exists("blade-session-spacer")?data.getIndex("blade-session-spacer"):data.getLength();
    for(const command of wanted){
      const id="command:"+command.id;
      if(data.exists(id)){const {css,html}=this.commandItem(command,iconOnly);data.update(id,{css,html});index=data.getIndex(id)+1;}
      else data.add(this.commandItem(command,iconOnly),index++);
    }
  }
  /** Runs a menu-row command with the page's open view; the address and the view stay, a rejection shows the error dialog. */
  private runCommand(id:string):void{
    const entry=this.kernel?.app.commands.get(id);
    if(entry?.placement!=="menu"||!this.commands().some(command=>command.id===id))return;
    void Promise.resolve().then(()=>entry.run({app:this.kernel!.app,view:this.page?.view})).catch(error=>{if(!this.listeners.signal.aborted)void this.failed(error);});
  }

  /** The collapsed `Menü` button: it holds every entry. */
  private mainMenu():any{return {id:"blade-main-menu",value:t("Menü"),items:this.menuItems};}
  /** The count and tone an entry holds: its view's live count, or the sum of its children's (the most urgent tone). */
  private held(item:any):{count:number;tone?:string}{
    const id=String(item.id??"");
    if(id.startsWith("view:")){const count=this.attention.get(id.slice(5))??0;return count?{count,tone:this.tones.get(id.slice(5))}:{count:0};}
    let count=0,tone:string|undefined;
    for(const child of item.items??[]){const held=this.held(child);count+=held.count;if(held.tone&&(tone===undefined||TONES.indexOf(held.tone)<TONES.indexOf(tone)))tone=held.tone;}
    return {count,tone};
  }
  /**
   * An entry's attention markup (Suite's `html`, shown instead of the plain `value`): the label with a badge in the tone
   * showing the count (hidden from screen readers). A view's own entry also carries the count as visually hidden text,
   * so its accessible name is "Label, 3 függőben"; a branch and `Menü` keep their names (the entries inside carry the
   * counts), and colour is never the only signal. `{html: undefined}` without attention (the plain entry).
   */
  private menuHtml(item:any):{html?:string}{
    const {count,tone}=this.held(item);
    if(!count)return {html:undefined};
    const label=escape(String(item.value??"")),badge=`<span class="blade-menu-count blade-menu-count--${tone??"warning"}" aria-hidden="true">${count>99?"99+":count}</span>`;
    if(!String(item.id).startsWith("view:"))return {html:`<span class="blade-menu-attention"><span class="blade-menu-label">${label}</span>${badge}</span>`};
    // One hidden text names the entry ("Label, 3 függőben"): the visible parts would add gaps to the name.
    return {html:`<span class="blade-menu-attention"><span class="blade-menu-label" aria-hidden="true">${label}</span>${badge}</span><span class="blade-visually-hidden">${label}, ${escape(t("{count} függőben",{count}))}</span>`};
  }
  /** A view's attention count changed: the labels are rebuilt and the drawn entries updated in place (an open menu stays open). */
  private attend(id:string,count:number):void{
    const value=Number.isFinite(count)&&count>0?Math.floor(count):0;
    if((this.attention.get(id)??0)===value)return;
    this.attention.set(id,value);
    const visit=(items:any[])=>{for(const item of items){if(item.type||item.value===undefined)continue;Object.assign(item,this.menuHtml(item));if(item.items)visit(item.items);}};
    visit(this.menuItems);
    const menu=this.menu;
    if(!menu)return;
    const find=(items:any[],wanted:string):any=>{for(const item of items){if(item.id===wanted)return item;const found=item.items&&find(item.items,wanted);if(found)return found;}};
    menu.data.eachChild(menu.data.getRoot(),(drawn:any)=>{
      const drawnId=String(drawn.id);
      const command=drawnId.startsWith("command:")?this.commands().find(command=>"command:"+command.id===drawnId):undefined;
      const source=command?this.commandItem(command,String(drawn.css??"").includes("blade-menu-command--icon")):drawnId==="blade-main-menu"?this.menuHtml(this.mainMenu()):find(this.menuItems,drawnId.replace(/^sibling:/,""));
      if(source&&source.html!==drawn.html)menu.data.update(drawn.id,{html:source.html});
    });
    this.renderMenu();
  }

  /**
   * The top-row logo shows only when its rendered width (the image at its CSS height) fits in `free`, the room the
   * row's other content leaves; it never changes how the menu fits.
   */
  private placeLogo(free:number):void{
    const box=this.root.querySelector<HTMLElement>(".blade-navigation-row .blade-logo");
    if(!box)return;
    box.hidden=false;
    box.hidden=free<Math.ceil(box.getBoundingClientRect().width);
  }

  /**
   * The logo's markup: one accessible image (or, for the top-row copy beside a window logo, one hidden from assistive
   * technology); with a dark image, CSS shows the one of the applied base theme.
   */
  private logoHtml(hidden=false):string{
    const logo=this.definition.logo;
    if(!logo)return "";
    const image=(src:string,kind:string)=>`<img class="blade-logo__image blade-logo__image--${kind}" src="${escape(src)}" alt="">`;
    // Without an image: the product logo, inline in both variants (docs/brand.md).
    const css=logo.image?(logo.dark?" blade-logo--themed":""):" blade-logo--themed blade-logo--brand";
    const images=logo.image?image(logo.image,"light")+(logo.dark?image(logo.dark,"dark"):""):brandLogo();
    return `<span class="blade-logo${css}" ${hidden?'aria-hidden="true"':`role="img" aria-label="${escape(logo.label)}"`}>${images}</span>`;
  }
  /** Signed out, `placement` decides; the signed-in shell always shows the logo in the top row. */
  private get applicationPage():boolean{ return this.definition.authenticated || !!this.definition.guest; }
  private get windowLogo():boolean{ return (!this.applicationPage||!!this.definition.signingIn)&&!!this.definition.logo&&(this.definition.logo.placement??"window")!=="top"; }
  private get topLogo():boolean{ return !!this.definition.logo&&(this.applicationPage||(this.definition.logo.placement??"window")!=="window"); }

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
    if(!win||this.externalSignInOpen||this.listeners.signal.aborted)return;
    const container=win.getContainer();
    const buttons=Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(button=>button.getBoundingClientRect().height>0&&!button.closest("[data-blade-after-form]"));
    if(!buttons.length)return;
    const outer=(container.closest<HTMLElement>('[role="dialog"]')??container).getBoundingClientRect();
    const bottom=Math.max(...buttons.map(button=>button.getBoundingClientRect().bottom));
    // Content below the form (notice, links, footer slot) keeps its own height and ends at the window edge (its own
    // 16 px bottom padding); the form cell keeps 24 px below the actions, more than the form's padding.
    const after=Array.from(container.querySelectorAll<HTMLElement>("[data-blade-after-form]")).reduce((sum,element)=>sum+element.getBoundingClientRect().height,0);
    const height=Math.min(innerHeight-24,Math.ceil(bottom-outer.top+24+after));
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
    const choices:{id:string;label:string;base?:string}[]=skins.length?skins.map(skin=>({id:skin.id,label:escape(skin.label),base:skin.base})):[{id:"blade",label:"Blade"},{id:"blade-night",label:"Blade Night"},{id:"light",label:t("Világos")},{id:"dark",label:t("Éjjeli")}];
    const storage=skins.length?"blade-skin":"blade-theme";
    const apply=(id:string)=>{
      const choice=choices.find(choice=>choice.id===id)!;
      // Blade Night runs on Suite's dark theme, so every dark rule applies; data-blade-theme names the factory theme for
      // the Blade layer (themes/blade.css).
      const factory=choice.base??id,base=factory==="blade-night"?"dark":factory;
      if(skins.length)document.documentElement.dataset.bladeSkin=id;
      document.documentElement.dataset.bladeTheme=factory;
      setTheme(base,document.documentElement);
      themeApplied(base,skins.length?id:null);
      if(!this.applicationPage||definition.signingIn)signInThemeApplied(base);
    };
    configureServer(definition.csrf || "", this.applicationPage ? () => this.sessionEnded() : undefined);
    let theme=choices[0].id;
    try { const saved=localStorage.getItem(storage); if(choices.some(choice=>choice.id===saved))theme=saved!; } catch {}
    apply(theme);
    if (definition.protocol !== 1)
      throw new Error(t("Nem kompatibilis 61ade felületverzió."));
    const tenant=definition.tenant,currentTenant=tenant?.choices.find(choice=>choice.id===tenant.current),language=definition.i18n;
    const signInControl=definition.guest || (definition.publicAccess && definition.oauthOnly);
    const controlItems:object[]=[
      ...(this.tenantSelector?[{id:"blade-tenant",value:escape(currentTenant?.name??t("Tenant")),icon:"bi bi-grid",tooltip:t("Tenant váltása"),
        items:tenant!.choices.map(choice=>({id:"tenant:"+choice.id,value:escape(choice.name),...(choice.id===tenant!.current?{icon:"bi bi-check-lg"}:{})}))}]:[]),
      ...(this.guides?[{id:"blade-guide",css:"blade-guide-control",value:t("Útmutató"),icon:"bi bi-question-circle",tooltip:t("A megnyitott nézet útmutatója"),disabled:true}]:[]),
      ...(language?.selector?[{id:"blade-language",value:escape(language.languages[language.locale]),icon:languageIcon(language,language.locale),tooltip:t("Nyelv"),
        items:Object.keys(language.languages).map(id=>({id:"language:"+id,value:escape(language.languages[id]),icon:languageIcon(language,id)}))}]:[]),
      ...(choices.length>1?[{id:"theme-choice",value:choices.find(choice=>choice.id===theme)!.label,
        items:choices.map(choice=>({id:"theme:"+choice.id,value:choice.label}))}]:[]),
    ];
    this.layout = new Layout(root, {
      type: "line",
      rows: [
        { id: "menu-row", height: 40, css:"blade-navigation-row"+(definition.guest?" blade-public-navigation":""), cols: [{id:"main-menu"},
          ...(controlItems.length?[{id:"controls",width:"content",css:"blade-navigation-control"}]:[]),
          ...(signInControl?[{id:"sign-in-control",width:"content",css:"blade-navigation-control blade-sign-in-control"}]:[]),
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
        { id: "upload-status", value: "", icon: "bi bi-upload", hidden: true, css: "blade-upload-indicator" },
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
    if (this.applicationPage) {
      uploads.configure({ userId: definition.userId });
      this.status.events.on("click", (id: string | number) => { if (id === "upload-status") uploads.reopen(); });
      this.releaseUploads = uploads.indicator(state => this.uploadIndicator(state));
    }
    if(signInControl){
      const cancel=definition.signingIn&&definition.oauthOnly,label=t(cancel?"Mégse":"Bejelentkezés");
      const control=this.signInControl=new Toolbar(undefined,{data:[{id:"blade-sign-in",value:label,tooltip:label,icon:cancel?"bi bi-arrow-left":"bi bi-key"}]});
      control.events.on("click",()=>{
        if(definition.signingIn&&definition.oauthOnly)this.cancelSignIn();
        else void this.beginSignIn();
      });
      this.layout.getCell("sign-in-control").attach(control);
    }
    if(controlItems.length){
      const controls=this.controls=new ResponsiveToolbar(undefined,{menuCss:"blade-shell-popup",data:controlItems.flatMap((item,index)=>index?[{type:"separator"},item]:[item])},
        {id:"blade-controls-menu",value:t("Beállítások"),icon:"bi bi-list",css:"blade-command--icon blade-controls-toggle",availableWidth:()=>this.root.clientWidth-120-(this.signInControl?.getRootNode()?.getBoundingClientRect().width??0)});
      controls.events.on("click",(id:string|number)=>{
        const key=String(id);
        if(key==="blade-guide"&&this.page)this.showGuide(this.page);
        if(key.startsWith("language:"))this.post("language",{locale:key.slice(9)});
        if(key.startsWith("tenant:")&&key.slice(7)!==tenant?.current)this.post("tenant",{tenant:key.slice(7)});
        if(!key.startsWith("theme:"))return;
        const choice=choices.find(choice=>choice.id===key.slice(6));
        if(!choice)return;
        apply(choice.id);
        controls.data.update("theme-choice",{value:choice.label});
        try{localStorage.setItem(storage,choice.id);}catch{}
        void awaitRedraw().then(()=>{if(!this.listeners.signal.aborted)this.renderMenu();});
        void this.fitLogin();
      });
      this.layout.getCell("controls").attach(controls);
      this.controlSize=new ResizeObserver(()=>this.renderMenu());
      this.controlSize.observe(controls.getRootNode());
    }
    if (this.applicationPage) {
      const map = (items: MenuDefinition[]): object[] =>
        items.map((item) => ({
          id: item.id,
          value: escape(item.label),
          icon:item.icon??"bi bi-folder",
          ...(item.items?.length
            ? { items: map(item.items) }
            : { disabled: true }),
        }));
      const features: any[]=[];
      // A record view opens for one record (activation, navigate, address) and has no menu entry; a `menu: false` list
      // is only mounted inside project pages.
      for(const view of (definition.views || []).filter(view=>!view.record&&view.menu!==false)) {
        const item={id:"view:"+view.id,value:escape(view.title),icon:view.icon??"bi bi-table"};
        if(view.group){
          let group=features.find(v=>v.id==="group:"+view.group);
          if(!group){group={id:"group:"+view.group,value:escape(view.group),icon:"bi bi-folder2-open",items:[],separatorBefore:definition.menuSeparators?.includes(view.group)};features.push(group);}
          group.items.push(item);
        }else features.push(item);
      }
      this.menuItems = [...map(definition.menu || []), ...features];
      // The row's popups open above a non-modal window (FB-0199), which the user may keep open over any view.
      const menu = new NavigationMenu(undefined, { navigationType: "click", menuCss: "blade-shell-popup" });
      this.menu = menu;
      this.resize();
      menu.events.on("click", (id: string | number) => {
        id=String(id).replace(/^sibling:/,"");
        if (id.startsWith("command:")) { this.runCommand(id.slice(8)); return; }
        if (id === "blade-logout") this.post("logout");
        if (id === "blade-guide" && this.page) this.showGuide(this.page);
        if (id.startsWith("tenant:") && id.slice(7) !== this.definition.tenant?.current) this.post("tenant", { tenant: id.slice(7) });
        const view=id.startsWith("view:")?this.navigable(id.slice(5)):undefined;
        if(view&&!view.record&&this.openable(view))void this.openView(view,{push:true});
      });
      this.layout.getCell("main-menu").attach(menu);
      // Opened once after sign-in, before the first list: every list of the page subscribes on it.
      if((definition.views||[]).some(view=>view.kind==="list"))void this.live;
      // Attention of menu entries: the ordinary list read of each such view with its filters (one row; the count is
      // its `matched`), kept current by the live channel like a list. A refused read shows the plain entry.
      for(const view of (definition.views||[]).filter(view=>view.attention&&view.kind==="list"&&view.menu!==false&&!view.record&&view.resource)){
        this.tones.set(view.id,view.attention!.tone);
        new Realtime(this.live,view.resource!,data=>this.attend(view.id,Number(data.matched??data.total??0)),()=>{},()=>this.attend(view.id,0))
          .subscribe({limit:1,numbered:false,filters:{...view.attention!.filters}});
      }
      this.kernel=createApplication({channel:()=>this.live,userId:definition.userId??"",displayName:definition.displayName??"",tenant:definition.tenant?.current??null,authenticated:definition.authenticated,
        views:definition.views??[],navigate:target=>this.navigate(target)});
      // Menu-row commands show once their module registered them.
      const start=()=>{if(this.listeners.signal.aborted)return;if(this.commands().length)this.renderMenu();window.addEventListener("hashchange", this.route, {signal:this.listeners.signal});this.route();};
      // Project modules register their kinds before the first route; a declarative application routes at once.
      if(definition.modules?.length)void loadModules(this.kernel,definition.modules,definition.version).catch(error=>console.error(error)).then(start);
      else start();
    } else {
      // A new sign-in session shows every guide once again.
      try{for(const key of Object.keys(sessionStorage))if(key.startsWith(GUIDE_PREFIX))sessionStorage.removeItem(key);}catch{}
    }
    if(!this.applicationPage||definition.signingIn)this.mountSignIn();
    // Content-sized selectors settle after native widgets render; recalculate menu/logo fit with their actual widths.
    void awaitRedraw().then(()=>{if(!this.listeners.signal.aborted){this.measured=true;this.resize();}});
    window.addEventListener("resize", this.resize);
    this.reportError();
  }

  private reportError():void{
    if (this.definition.error) requestAnimationFrame(() => {
      void acknowledge({ title: t("Hiba"), message: this.definition.error, severity: "danger" })
        .then(() => {
          if (this.listeners.signal.aborted) return;
          // OAuth-only: the overlay opens after the message (it would stack above it).
          if (this.definition.oauthOnly) void this.mountExternal();
          else this.loginForm?.setFocus(this.definition.passwordChange ? "new_password" : this.definition.confirmation ? "code" : "password");
        });
    });
  }

  /** Fetch only the existing sign-in page's auth metadata/assets; keep the current view, form and live channel. */
  private async beginSignIn():Promise<void>{
    if(this.openingSignIn||this.definition.signingIn||this.submitting)return;
    this.openingSignIn=true;
    const url=new URL(location.href);url.searchParams.set("signin","1");
    const styles:HTMLLinkElement[]=[];
    try{
      const response=await fetch(url,{credentials:"same-origin",signal:this.listeners.signal});
      if(new URL(response.url).origin!==location.origin)throw new Error(t("Sikertelen művelet."));
      const page=new DOMParser().parseFromString(await response.text(),"text/html"),json=page.querySelector("#blade-config")?.textContent;
      if(!json)throw new Error(t("Sikertelen művelet."));
      const config=JSON.parse(json) as ShellDefinition;
      // A changed login/account/session needs the server's complete fresh page, never a mixed identity context.
      if(config.authenticated||!config.guest||config.userId!==this.definition.userId||config.csrf!==this.definition.csrf){location.assign(url);return;}
      for(const source of Array.from(page.querySelectorAll<HTMLLinkElement|HTMLScriptElement>("[data-blade-sign-in-asset]"))){
        const script=source.tagName==="SCRIPT",path=new URL(source.getAttribute(script?"src":"href")!,response.url);
        if(path.origin!==location.origin)throw new Error(t("Sikertelen művelet."));
        const selector=script?"script[src]":"link[rel=stylesheet]";
        if(Array.from(document.querySelectorAll<HTMLLinkElement|HTMLScriptElement>(selector)).some(node=>(node instanceof HTMLScriptElement?node.src:node.href)===path.href))continue;
        const node=script?document.createElement("script"):document.createElement("link");
        node.dataset.bladeSignInAsset="";
        if(node instanceof HTMLScriptElement)node.src=path.href;else{node.rel="stylesheet";node.href=path.href;styles.push(node);}
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>{node.remove();reject(new Error(t("Sikertelen művelet.")));},5000);
          node.onload=()=>{clearTimeout(timer);resolve();};node.onerror=()=>{clearTimeout(timer);node.remove();reject(new Error(t("Sikertelen művelet.")));};
          document.head.append(node);
        });
      }
      if(this.listeners.signal.aborted)return;
      const {username,error,rememberAvailable,rememberDays,loginIdentifier,confirmation,passwordChange,oauth,oauthOnly,signIn,signInModules}=config;
      Object.assign(this.definition,{username,error,rememberAvailable,rememberDays,loginIdentifier,confirmation,passwordChange,oauth,oauthOnly,signIn,signInModules,signingIn:true});
      history.replaceState(null,"",url);
      this.command.setAttribute("action","./?signin=1");
      document.documentElement.dataset.bladePage=page.documentElement.dataset.bladePage;
      this.mountSignIn();this.reportError();
    }catch(error){
      styles.forEach(node=>node.remove());
      if(!this.listeners.signal.aborted)await this.failed(error);
    }finally{this.openingSignIn=false;}
  }

  private mountSignIn():void{
    this.authListeners.abort();this.authListeners=new AbortController();
    this.externalSignInOpen=false;
    signInThemeApplied(document.documentElement.dataset.dhxTheme??"blade");
    this.signInLogo();
    if(this.definition.passwordChange)this.mountPasswordChange();
    else if(this.definition.confirmation)this.mountConfirmation();
    else if(this.definition.oauthOnly){
      this.signInControl?.data.update("blade-sign-in",{value:t("Mégse"),tooltip:t("Mégse"),icon:"bi bi-arrow-left"});
      if(!this.definition.error)void this.mountExternal();
    }else this.mountLogin();
  }

  /** Cancel before a server-side challenge: close only the modal, preserving unsaved public input and list state. */
  private cancelSignIn():void{
    if(this.submitting)return;
    if(this.definition.confirmation||this.definition.passwordChange){this.post("logout");return;}
    this.authListeners.abort();
    const win=this.loginWindow;this.loginWindow=undefined;this.loginForm=undefined;
    // Suite finishes the button's native click dispatch before its Form/Window may be destroyed.
    queueMicrotask(()=>{
      win?.destructor();
      void awaitRedraw().then(()=>{
        if(!this.listeners.signal.aborted&&!this.definition.signingIn)this.signInControl?.getRootNode()?.querySelector<HTMLButtonElement>("button")?.focus();
      });
    });
    this.definition.signingIn=false;this.definition.error="";this.definition.username="";
    document.querySelectorAll('link[data-blade-sign-in-asset]').forEach(node=>node.remove());
    document.documentElement.dataset.bladePage="shell";
    const url=new URL(location.href);url.searchParams.delete("signin");history.replaceState(null,"",url);
    this.command.setAttribute("action","./");this.signInLogo();
    this.signInControl?.data.update("blade-sign-in",{value:t("Bejelentkezés"),tooltip:t("Bejelentkezés"),icon:"bi bi-key"});
  }

  /** The window's logo is the named copy while a sign-in modal is open. */
  private signInLogo():void{
    const logo=this.root.querySelector<HTMLElement>(".blade-navigation-row .blade-logo");
    if(!logo)return;
    if(this.windowLogo)logo.setAttribute("aria-hidden","true");
    else{logo.removeAttribute("aria-hidden");logo.setAttribute("role","img");logo.setAttribute("aria-label",this.definition.logo!.label);}
  }

  /** An offered view by id (the bootstrap `views` are already filtered by the server). */
  private offered(id:string):ViewDefinition|undefined{return this.definition.views?.find(view=>view.id===id);}
  /** An offered view that opens on its own (menu, address, `navigate`): not a `menu: false` list. */
  private navigable(id:string):ViewDefinition|undefined{const view=this.offered(id);return view?.menu===false?undefined:view;}
  /** Its kind is registered, and a record view has its record id. */
  private openable(view:ViewDefinition,record?:string):boolean{return !!this.kernel?.kinds.has(view.kind)&&(!view.record||!!record);}

  /** `Application.navigate`: like a menu click or an address, through the `kinds` registry. */
  private navigate(target:NavigationTarget):boolean{
    const view=typeof target?.view==="string"?this.navigable(target.view):undefined,record=view?.record?target.record:undefined;
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
    if(open==="page"){
      this.guideChanged();
      // Not over a long-lived window the user works in (FB-0200): the guide stays unseen and the control shows it.
      if(view.guide&&!this.definition.signingIn&&!this.guideShown(view)&&!nonModalOpen(this.guideWindow))this.showGuide(mounted);
    }
  }

  /** The guide stays in the navigation controls, including their compact menu. */
  private get guides():boolean{ return this.applicationPage&&(this.definition.views??[]).some(view=>!!view.guide); }
  /** The page view's guide, if any. */
  private get guide():string|undefined{ return this.page?.view.guide; }
  /** The page view changed: the control follows whether it has a guide. */
  private guideChanged():void{
    if(this.guides){if(this.guide)this.controls?.enable("blade-guide");else this.controls?.disable("blade-guide");}
    this.renderMenu();
  }
  /**
   * A guide opens by itself once per sign-in session: the first time its view opens as a page in this tab. The mark
   * is per page path, user and view in `sessionStorage`; the signed-out page clears every mark.
   */
  private guideKey(view:ViewDefinition):string{return GUIDE_PREFIX+JSON.stringify([location.pathname,this.definition.userId??"",view.id]);}
  private guideShown(view:ViewDefinition):boolean{try{return sessionStorage.getItem(this.guideKey(view))==="1";}catch{return false;}}
  private guideWindow?:AppWindow;
  /** The page view's guide (`guide`) in a non-modal window at the lower right of the workspace; it closes with the view. */
  private showGuide(mounted:Mounted):void{
    const view=mounted.view,signal=mounted.controller.signal;
    if(!view.guide||signal.aborted)return;
    this.guideWindow?.close();
    const width=Math.min(420,innerWidth-24),height=Math.min(340,innerHeight-24);
    const win=this.guideWindow=openWindow({title:t("Útmutató")+": "+view.title,css:"blade-content-window blade-guide-window",width,height,modal:false,fit:false,signal});
    if(innerWidth>=768)win.window.setPosition(Math.max(12,innerWidth-width-16),Math.max(12,innerHeight-height-48));
    const body=document.createElement("div");body.className="blade-view-guide";
    for(const paragraph of view.guide.split(/\n\s*\n/)){
      if(!paragraph.trim())continue;
      const p=document.createElement("p");
      paragraph.trim().split("\n").forEach((line,index)=>{if(index)p.append(document.createElement("br"));p.append(line);});
      body.append(p);
    }
    win.attach(body);
    try{sessionStorage.setItem(this.guideKey(view),"1");}catch{}
    win.signal.addEventListener("abort",()=>{if(this.guideWindow===win)this.guideWindow=undefined;},{once:true});
  }

  /** Closes one view: its signal aborts, then the instance and wrapper are destroyed (exactly once). */
  private unmount(mounted:Mounted):void{
    if(mounted.controller.signal.aborted)return;
    mounted.controller.abort();
    if(this.page===mounted){this.page=undefined;this.guideChanged();}
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
   * The session ended: a member returns to sign-in, a guest to public access, with the view address kept.
   * Over unsaved input the modal asks first, so the user can copy it out;
   * Cancel keeps the page and the next 401 asks again. A second automatic reload within 60 s (the page came back
   * signed in, yet the channel answers 401) also asks instead of looping.
   */
  private sessionEnded():void{
    if(this.signedOut||this.listeners.signal.aborted)return;
    this.signedOut=true;
    let recent=true;
    try{recent=Date.now()-Number(sessionStorage.getItem(SIGNED_OUT)||0)<60000;}catch{}
    if(!recent&&!this.editing()){this.signOut();return;}
    const guest=!!this.definition.guest;
    void showDialog({mode:"confirm",severity:"warning",title:t("A munkamenet lejárt"),initialFocus:"cancel",confirmLabel:t(guest?"Újratöltés":"Bejelentkezés"),
      message:t(guest?"A vendégmunkamenet lejárt. A folytatáshoz töltsd újra a felületet; a nem mentett adatokat előbb másold ki.":"A munkamenet lejárt, a nyitott adatok nem menthetők. Másold ki, amire még szükséged van, majd jelentkezz be újra.")})
      .then(confirmed=>{if(this.listeners.signal.aborted)return;if(confirmed)this.signOut();else this.signedOut=false;});
  }
  private signOut():void{
    try{sessionStorage.setItem(SIGNED_OUT,String(Date.now()));}catch{}
    this.channel?.close();
    if(this.definition.guest&&!this.definition.signingIn){
      const url=new URL(location.href);url.searchParams.delete("signin");
      if(url.href!==location.href){location.replace(url);return;}
    }
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
    const closeHref=this.definition.signIn?.closeHref;
    if(closeHref&&!this.definition.confirmation&&!this.definition.passwordChange){
      const win=this.loginWindow!;
      win.events.on("beforeHide",()=>{
        if(this.submitting)return false;
        if(this.externalSignInOpen||this.listeners.signal.aborted||this.loginWindow!==win)return true;
        location.assign(closeHref);return false;
      });
    }else if(this.definition.publicAccess){
      const win=this.loginWindow!;
      win.events.on("beforeHide",()=>{
        // Destruction closes the detached window through the same native event.
        if(this.externalSignInOpen||this.listeners.signal.aborted||this.loginWindow!==win)return true;
        this.cancelSignIn();
        return false;
      });
    }
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
    if(modules.length)this.startSignInModules(modules,(name,element)=>attachContent(layout.getCell(name),element,this.authListeners.signal));
  }

  /**
   * OAuth-only sign-in: AuthHandler's overlay is the window. The same content as in the sign-in window surrounds its
   * provider buttons: logo and header slot above, notice, links and footer slot below.
   */
  private async mountExternal():Promise<void>{
    const modules=this.definition.signInModules??[],signal=this.authListeners.signal;
    // The overlay stacks above every layer, the trademark screen included: it opens once that has fully played and left.
    await splashLeft();
    if(signal.aborted)return;
    const opened=await openExclusiveSignIn(content=>{
      const body=content.querySelector(".modal-body")!;
      if(this.windowLogo)body.insertAdjacentHTML("beforebegin",`<div class="blade-auth-logo">${this.logoHtml()}</div>`);
      body.insertAdjacentHTML("afterend",this.signInInfo());
      const logo=body.previousElementSibling?.classList.contains("blade-auth-logo")?body.previousElementSibling:null,
        info=body.nextElementSibling?.classList.contains("blade-sign-in-info")?body.nextElementSibling:null;
      signal.addEventListener("abort",()=>{logo?.remove();info?.remove();},{once:true});
      if(modules.length)this.startSignInModules(modules,(name,element)=>{
        if(name==="header")body.before(element);else content.append(element);
        signal.addEventListener("abort",()=>element.remove(),{once:true});
      });
    },signal,this.definition.signIn?.closeHref);
    if(!opened&&!signal.aborted)void acknowledge({ title: t("Hiba"), message: externalSignInUnavailable(), severity: "warning" });
  }

  /** Empty header and footer slots for the sign-in modules; the window refits whenever their content changes size. */
  private startSignInModules(modules:string[],place:(name:"header"|"footer",element:HTMLElement)=>void):void{
    const signal=this.authListeners.signal;
    const slot=(name:"header"|"footer")=>{
      const element=document.createElement("div");
      element.className="blade-sign-in-slot blade-sign-in-slot--"+name;
      element.dataset.bladeSlot=name;
      if(name==="footer")element.dataset.bladeAfterForm="";
      place(name,element);
      return element;
    };
    const header=slot("header"),footer=slot("footer");
    const observer=new ResizeObserver(()=>{void this.fitLogin();});
    observer.observe(header);observer.observe(footer);
    signal.addEventListener("abort",()=>observer.disconnect(),{once:true});
    const kinds:SignInPage[]=["sign-in","confirmation","password-change"];
    const kind=document.documentElement.dataset.bladePage as SignInPage;
    const page=kinds.includes(kind)?kind:this.definition.passwordChange?"password-change":this.definition.confirmation?"confirmation":"sign-in";
    void loadSignInModules(signInApplication(page,this.definition.i18n?.locale??document.documentElement.lang,{header,footer},signal),modules,signal);
  }
  private mountLogin(): void {
    const definition = this.definition;
    const signal=this.authListeners.signal;
    this.loginWindow = new Window({
      title: t("Bejelentkezés"),
      ariaLabel: t("Bejelentkezés"),
      css:"blade-auth-window",
      width: 420,
      height: definition.rememberAvailable ? 340 : 290,
      modal: true,
      closable: !!this.definition.publicAccess || !!this.definition.signIn?.closeHref,
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
            ...(definition.publicAccess ? [{type:"button" as const,name:"public",text:t("Mégse"),view:"link" as const}] : []),
            {
              type: "button",
              name: "login",
              text: t("Bejelentkezés"),
              icon: "bi bi-key",
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
          icon: "bi bi-link-45deg",
          view: "flat" as const,
          color: "secondary" as const,
          full: true,
          padding: "16px 0 0 0",
        }] : []),
      ],
    });
    this.loginForm = form;
    // Suspend the native window without cancelling public sign-in or discarding its Form.
    document.addEventListener("show.bs.modal",event=>{
      if((event.target as HTMLElement).id!=="authhandler-login-modal")return;
      this.externalSignInOpen=true;
      this.loginWindow?.hide();
    },{capture:true,signal});
    document.addEventListener("hidden.bs.modal",event=>{
      if((event.target as HTMLElement).id!=="authhandler-login-modal"||!this.externalSignInOpen)return;
      this.externalSignInOpen=false;
      this.resize();
      requestAnimationFrame(()=>{if(!signal.aborted&&!this.externalSignInOpen)form.setFocus("oauth");});
    },{capture:true,signal});
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
      if (name === "public") this.cancelSignIn();
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
      { capture: true, signal },
    );
    requestAnimationFrame(() => {
      if(signal.aborted)return;
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
    const signal=this.authListeners.signal;
    const confirmation = this.definition.confirmation!;
    this.loginWindow = new Window({
      title: t("E-mailes megerősítés"),
      ariaLabel: t("E-mailes megerősítés"),
      css:"blade-auth-window",
      width: 460,
      height: 420,
      modal: true,
      closable: !!this.definition.publicAccess,
      resizable: false,
    });
    const form = new Form(document.createElement("div"), {
      padding: 20,
      rows: [
        ...this.languageItem("top"),
        { type: "text", name: "recipient", label: t("Megerősítő levelet küldtünk"), value: escape(confirmation.email) },
        { type: "input", name: "code", label: t("Megerősítő kód"), labelPosition: "top", required: true, maxlength: 6,
          validation: (value: string | number) => /^[0-9]{6}$/.test(String(value)), errorMessage: t("A levélben kapott 6 számjegyű kód szükséges.") },
        { type: "button", name: "verify", text: t("Belépés megerősítése"), full:true, padding:"8px 0 0 0", icon:"bi bi-check-lg", color: "primary" },
        { rows: [
          { type: "button", name: "resend", text: t("Új kód küldése"), full:true, padding:"8px 0 0 0", icon:"bi bi-envelope", view: "flat", color:"secondary" },
          { type: "button", name: "cancel", text: t("Vissza a belépéshez"), full:true, padding:"8px 0 0 0", icon:"bi bi-arrow-left", view: "flat", color:"secondary" },
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
    }, { capture: true, signal });
    this.attachLoginForm(form);
    this.resize();
    requestAnimationFrame(() => {
      if(signal.aborted)return;
      form.setFocus("code");
      const input = this.loginWindow?.getContainer().querySelector('input[name="code"]');
      input?.setAttribute("autocomplete", "one-time-code");
      input?.setAttribute("inputmode", "numeric");
    });
  }

  /** Forced replacement of an administrator-issued temporary password; no session exists yet. */
  private mountPasswordChange(): void {
    const signal=this.authListeners.signal;
    this.loginWindow = new Window({
      title: t("Jelszócsere"),
      ariaLabel: t("Jelszócsere"),
      css:"blade-auth-window",
      width: 460,
      height: 420,
      modal: true,
      closable: !!this.definition.publicAccess,
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
        { type: "button", name: "save", text: t("Jelszó mentése és belépés"), full:true, padding:"8px 0 0 0", icon:"bi bi-key", color: "primary" },
        { type: "button", name: "cancel", text: t("Vissza a belépéshez"), full:true, padding:"8px 0 0 0", icon:"bi bi-arrow-left", view: "flat", color:"secondary" },
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
    }, { capture: true, signal });
    this.attachLoginForm(form);
    this.resize();
    requestAnimationFrame(() => {
      if(signal.aborted)return;
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
    this.authListeners.abort();
    window.removeEventListener("resize", this.resize);
    closeDialogs();
    this.unmountAll();
    this.channel?.close();
    this.loginWindow?.destructor();
    this.controlSize?.disconnect();
    this.controls?.disposeResponsive();
    this.layout.destructor();
    this.root.replaceChildren();
  }
}

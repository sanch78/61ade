import { configureLanguage, languageIcon, type LanguageConfig, t } from "./I18n";
import { widgetIcons } from "./WidgetIcons";
import { externalSignInUnavailable, openExternalSignIn } from "./ExternalAuth";
import { Workspace, type ViewDefinition } from "./Workspace";
import { FileManager, isFileView, type FileViewDefinition } from "./FileManager";
import { DiagramEditor, isDiagramView, type DiagramViewDefinition } from "./DiagramEditor";
import { Calendar, isCalendarView, type CalendarViewDefinition } from "./Calendar";
import { DesktopOnly } from "./DesktopOnly";
import { Form, Layout, Menu, Toolbar, Window, setTheme, awaitRedraw } from "@dhtmlx/suite";
import { alert, closeDialogs } from "./MessageDialog";

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
  views?: (ViewDefinition | FileViewDefinition | DiagramViewDefinition | CalendarViewDefinition)[];
  csrf?: string;
  live?: import("./Realtime").LiveConfig;
};
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

/** Finish native popup/focus state before replacing a responsive menu tree. */
class NavigationMenu extends Menu {
  replaceItems(items:object[]):void{
    this._close(new MouseEvent("click"));
    this.data.removeAll();this.data.parse(items);
  }
}

/** 61de owns the DHTMLX lifecycle; consumers supply definitions, never shell markup. */
export class AdminShell {
  private releaseIcons=widgetIcons();
  private layout: Layout;
  private menu?: NavigationMenu;
  private workspace?: Workspace | FileManager | DiagramEditor | Calendar | DesktopOnly;
  private navigation=0;
  private route = () => {
    const resource = new URLSearchParams(location.hash.slice(1)).get("feature");
    const view = this.definition.views?.find(view => view.resource === resource);
    if (view) void this.openView(view, false);
    else {
      this.renderMenu();
      ++this.navigation;
      this.layout.getCell("workspace").detach();
      this.workspace?.destroy(); this.workspace=undefined;
    }
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
    const height = (this.definition.confirmation || this.definition.passwordChange ? 420 : this.definition.rememberAvailable ? 340 : 290) + (this.definition.confirmation || this.definition.passwordChange || !this.definition.oauth ? 0 : 48);
    this.loginWindow.setSize(
      Math.min(width, innerWidth - 24),
      Math.min(height, innerHeight - 24),
    );
    if(!this.loginWindow.isVisible())this.loginWindow.show();
    void this.fitLogin();
  };

  /** Top menu, or on narrow space one `Menü` button followed, on desktop, by the open feature's sibling items. */
  private renderMenu():void{
    if (!this.menu) return;
    const width=this.root.clientWidth;
    const required=(items:any[])=>items.reduce((sum:number,item:any)=>sum+76+String(item.value || "").length*9,305+(this.definition.i18n?.selector?130:0));
    const compact = width < Math.max(768,required(this.menuItems));
    const current="feature:"+(new URLSearchParams(location.hash.slice(1)).get("feature")??"");
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
    const entries=[...structuredClone(this.menuItems),
      { id: "blade-session-separator", type: "separator" },
      { id: "blade-logout", value: t("Kijelentkezés"), icon:"dxi dxi-arrow-left" },
    ];
    const prefixed=(items:any[]):object[]=>items.map(item=>({...item,id:"sibling:"+item.id,active:item.id===current,...(item.items?{items:prefixed(item.items)}:{})}));
    this.menu.replaceItems(compact?[{id:"blade-main-menu",value:t("Menü"),icon:"dxi dxi-view-grid",items:entries},
      ...(context.length?[{id:"blade-context-separator",type:"separator"},...prefixed(context)]:[])]:entries);
  }

  private async fitLogin():Promise<void>{
    await awaitRedraw();
    const win=this.loginWindow;
    if(!win||this.listeners.signal.aborted)return;
    const container=win.getContainer();
    const buttons=Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(button=>button.getBoundingClientRect().height>0);
    if(!buttons.length)return;
    const outer=(container.closest<HTMLElement>('[role="dialog"]')??container).getBoundingClientRect();
    const bottom=Math.max(...buttons.map(button=>button.getBoundingClientRect().bottom));
    const height=Math.min(innerHeight-24,Math.ceil(bottom-outer.top+24));
    win.setSize(outer.width,height);
    win.setPosition(Math.max(12,(innerWidth-outer.width)/2),Math.max(12,(innerHeight-height)/2));
  }

  constructor(
    private root: HTMLElement,
    private command: HTMLFormElement,
    private definition: ShellDefinition,
  ) {
    configureLanguage(definition.i18n);
    let theme="skyblue";
    try { const saved=localStorage.getItem("blade-theme"); if(saved==="dark"||saved==="skyblue"||saved==="light")theme=saved; } catch {}
    setTheme(theme,document.documentElement);
    if (definition.protocol !== 1)
      throw new Error(t("Nem kompatibilis 61de felületverzió."));
    this.layout = new Layout(root, {
      type: "line",
      rows: [
        { id: "menu-row", height: 40, css:"blade-navigation-row", cols: [{id:"main-menu"},...(definition.i18n?.selector?[{id:"language",width:130}]:[]),{id:"theme",width:145}] },
        { id: "workspace", css: "blade-workspace" },
        { id: "status", height: 32, css: "blade-session-bar" },
      ],
    });
    const status = new Toolbar(undefined, {
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
        { type: "spacer" },
        {
          id: "application-version",
          type: "title",
          value: escape([definition.title, definition.version].filter(Boolean).join(" ")),
        },
      ],
    });
    this.layout.getCell("status").attach(status);
    const themeControl=new Toolbar(undefined,{data:[{id:"theme-choice",value:theme==="dark"?t("Éjjeli"):theme==="skyblue"?"Skyblue":t("Világos"),items:[{id:"theme-skyblue",value:"Skyblue"},{id:"theme-light",value:t("Világos")},{id:"theme-dark",value:t("Éjjeli")}]}]});
    themeControl.events.on("click",(id:string|number)=>{
      if(id!=="theme-light" && id!=="theme-dark" && id!=="theme-skyblue")return;
      const next=id==="theme-dark"?"dark":id==="theme-skyblue"?"skyblue":"light";
      setTheme(next,document.documentElement);
      themeControl.data.update("theme-choice",{value:next==="dark"?t("Éjjeli"):next==="skyblue"?"Skyblue":t("Világos")});
      try{localStorage.setItem("blade-theme",next);}catch{}
      void this.fitLogin();
    });
    this.layout.getCell("theme").attach(themeControl);
    if(definition.i18n?.selector){
      this.layout.getCell("language").attach(this.languageControl());
    }
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
      for(const view of definition.views || []) {
        const item={id:"feature:"+view.resource,value:escape(view.title),icon:view.icon??"dxi dxi-table-check"};
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
        const view=definition.views?.find(v=>"feature:"+v.resource===id);
        if(view)void this.openView(view);
      });
      this.layout.getCell("main-menu").attach(menu);
      window.addEventListener("hashchange", this.route, {signal:this.listeners.signal});
      this.route();
    } else {
      if (definition.passwordChange) this.mountPasswordChange();
      else if (definition.confirmation) this.mountConfirmation();
      else this.mountLogin();
    }
    window.addEventListener("resize", this.resize);
    if (definition.error) requestAnimationFrame(() => {
      void alert({ header: t("Hiba"), text: definition.error, severity: "danger" })
        .then(() => { if (!this.listeners.signal.aborted) this.loginForm?.setFocus(definition.passwordChange ? "new_password" : definition.confirmation ? "code" : "password"); });
    });
  }

  private async openView(view:ViewDefinition|FileViewDefinition|DiagramViewDefinition|CalendarViewDefinition,updateUrl=true):Promise<void>{
    if(updateUrl){
      const url=new URL(location.href);
      url.hash=new URLSearchParams({feature:view.resource}).toString();
      if(url.href!==location.href)history.pushState(null,"",url);
    }
    this.renderMenu();
    const navigation=++this.navigation;
    this.layout.getCell("workspace").detach();
    this.workspace?.destroy();this.workspace=undefined;
    await awaitRedraw();
    if(navigation!==this.navigation || this.listeners.signal.aborted)return;
    const content=isCalendarView(view)
      ?new Calendar(document.createElement("div"),view,this.definition.csrf || "")
      :isDiagramView(view)
      ?new DiagramEditor(document.createElement("div"),view,this.definition.csrf || "")
      :isFileView(view)
      ?new FileManager(document.createElement("div"),view,this.definition.csrf || "")
      :new Workspace(document.createElement("div"),view,this.definition.csrf || "",this.definition.live || {transport:"poll",endpoint:"live",interval:2000},this.definition.userId??"");
    this.workspace=view.desktopOnly?new DesktopOnly(content,view.title):content;
    this.layout.getCell("workspace").attach(this.workspace.layout);
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
    this.loginWindow!.attach(form);
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
        void alert({ header: t("Hiba"), text: externalSignInUnavailable(), severity: "warning" });
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
    action: "language" | "login" | "logout" | "confirm_login" | "resend_login" | "cancel_login" | "change_password" | "cancel_password_change",
    fields: Record<string, string> = {},
  ): void {
    if (this.submitting) return;
    this.submitting = true;
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
    this.listeners.abort();
    window.removeEventListener("resize", this.resize);
    closeDialogs();
    this.workspace?.destroy();
    this.loginWindow?.destructor();
    this.layout.destructor();
    this.root.replaceChildren();
  }
}

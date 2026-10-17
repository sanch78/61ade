import { configureLanguage, type LanguageConfig, t } from "./I18n";
import { widgetIcons } from "./WidgetIcons";
import { Workspace, type ViewDefinition } from "./Workspace";
import { Form, Layout, Menu, Toolbar, Window, alert, setTheme, awaitRedraw } from "@dhtmlx/suite";

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
  displayName?: string;
  menu?: MenuDefinition[];
  views?: ViewDefinition[];
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

/** VAPA owns the DHTMLX lifecycle; consumers supply definitions, never shell markup. */
export class AdminShell {
  private releaseIcons=widgetIcons();
  private layout: Layout;
  private menu?: NavigationMenu;
  private workspace?: Workspace;
  private navigation=0;
  private route = () => {
    const resource = new URLSearchParams(location.hash.slice(1)).get("feature");
    const view = this.definition.views?.find(view => view.resource === resource);
    if (view) void this.openView(view, false);
    else {
      ++this.navigation;
      this.layout.getCell("workspace").detach();
      this.workspace?.destroy(); this.workspace=undefined;
    }
  };
  private menuItems: object[] = [];
  private compactMenu?: boolean;
  private loginWindow?: Window;
  private loginForm?: Form;
  private submitting = false;
  private listeners = new AbortController();
  private resize = () => {
    if (this.menu) {
      const required=this.menuItems.reduce((sum:number,item:any)=>sum+76+String(item.value || "").length*9,305+(this.definition.i18n?.selector?130:0));
      const compact = this.root.clientWidth < Math.max(768,required);
      if (compact !== this.compactMenu) {
        this.compactMenu = compact;
        const items = structuredClone(this.menuItems);
        const entries=[...items,
          { id: "vapa-session-separator", type: "separator" },
          { id: "vapa-logout", value: t("Kijelentkezés"), icon:"dxi dxi-arrow-left" },
        ];
        this.menu.replaceItems(compact?[{id:"vapa-main-menu",value:t("Menü"),icon:"dxi dxi-view-grid",items:entries}]:entries);
      }
    }
    if (!this.loginWindow) return;
    const width = this.definition.confirmation ? 460 : 420;
    const height = this.definition.confirmation ? 420 : this.definition.rememberAvailable ? 340 : 290;
    this.loginWindow.setSize(
      Math.min(width, innerWidth - 24),
      Math.min(height, innerHeight - 24),
    );
    if(!this.loginWindow.isVisible())this.loginWindow.show();
    void this.fitLogin();
  };

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
    try { const saved=localStorage.getItem("vapa-theme"); if(saved==="dark"||saved==="skyblue"||saved==="light")theme=saved; } catch {}
    setTheme(theme,document.documentElement);
    if (definition.protocol !== 1)
      throw new Error(t("Nem kompatibilis VAPA felületverzió."));
    this.layout = new Layout(root, {
      type: "line",
      rows: [
        { id: "menu-row", height: 40, css:"vapa-navigation-row", cols: [{id:"main-menu"},...(definition.i18n?.selector?[{id:"language",width:130}]:[]),{id:"theme",width:145}] },
        { id: "workspace", css: "vapa-workspace" },
        { id: "status", height: 32, css: "vapa-session-bar" },
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
              : "Nincs bejelentkezve",
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
      try{localStorage.setItem("vapa-theme",next);}catch{}
      void this.fitLogin();
    });
    this.layout.getCell("theme").attach(themeControl);
    if(definition.i18n?.selector){
      const language=new Toolbar(undefined,{data:[{id:"vapa-language",value:definition.i18n.languages[definition.i18n.locale],tooltip:t("Nyelv"),items:Object.entries(definition.i18n.languages).map(([id,value])=>({id:"language:"+id,value}))}]});
      language.events.on("click",(id:string|number)=>{if(String(id).startsWith("language:"))this.post("language",{locale:String(id).slice(9)});});
      this.layout.getCell("language").attach(language);
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
        if (id === "vapa-logout") this.post("logout");
        const view=definition.views?.find(v=>"feature:"+v.resource===id);
        if(view)void this.openView(view);
      });
      this.layout.getCell("main-menu").attach(menu);
      window.addEventListener("hashchange", this.route, {signal:this.listeners.signal});
      this.route();
    } else {
      if (definition.confirmation) this.mountConfirmation();
      else this.mountLogin();
    }
    window.addEventListener("resize", this.resize);
    if (definition.error) requestAnimationFrame(() => {
      void alert({ header: t("Hiba"), text: definition.error, htmlEnable: false, buttons: [t("Rendben")] })
        .then(() => { if (!this.listeners.signal.aborted) this.loginForm?.setFocus(definition.confirmation ? "code" : "password"); });
    });
  }

  private async openView(view:ViewDefinition,updateUrl=true):Promise<void>{
    if(updateUrl){
      const url=new URL(location.href);
      url.hash=new URLSearchParams({feature:view.resource}).toString();
      if(url.href!==location.href)history.pushState(null,"",url);
    }
    const navigation=++this.navigation;
    this.layout.getCell("workspace").detach();
    this.workspace?.destroy();this.workspace=undefined;
    await awaitRedraw();
    if(navigation!==this.navigation || this.listeners.signal.aborted)return;
    this.workspace=new Workspace(document.createElement("div"),view,this.definition.csrf || "",this.definition.live || {transport:"poll",endpoint:"live",interval:2000},this.definition.userId??"");
    this.layout.getCell("workspace").attach(this.workspace.layout);
  }

  private languageField():any[]{
    const config=this.definition.i18n;
    return config?.selector?[{type:"select",name:"vapa-locale",label:t("Nyelv"),labelPosition:"top",value:config.locale,options:Object.entries(config.languages).map(([value,content])=>({value,content}))}]:[];
  }
  private bindLanguage(form:Form):void{
    form.events.on("change",(name:string)=>{if(name==="vapa-locale")this.post("language",{locale:String(form.getValue()[name])});});
  }
  private mountLogin(): void {
    const definition = this.definition;
    this.loginWindow = new Window({
      title: t("Bejelentkezés"),
      ariaLabel: t("Bejelentkezés"),
      css:"vapa-auth-window",
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
        ...this.languageField(),
        {
          type: "input",
          name: "username",
          label: t("Felhasználónév"),
          labelPosition: "left",
          labelWidth: 120,
          required: true,
          maxlength: 64,
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
      ],
    });
    this.loginForm = form;
    this.bindLanguage(form);
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
    });

    this.loginWindow.attach(form);
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
      css:"vapa-auth-window",
      width: 460,
      height: 420,
      modal: true,
      closable: false,
      resizable: false,
    });
    const form = new Form(document.createElement("div"), {
      padding: 20,
      rows: [
        ...this.languageField(),
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
    this.bindLanguage(form);
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
    this.loginWindow.attach(form);
    this.resize();
    requestAnimationFrame(() => {
      form.setFocus("code");
      const input = this.loginWindow?.getContainer().querySelector('input[name="code"]');
      input?.setAttribute("autocomplete", "one-time-code");
      input?.setAttribute("inputmode", "numeric");
    });
  }

  private post(
    action: "language" | "login" | "logout" | "confirm_login" | "resend_login" | "cancel_login",
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
    this.workspace?.destroy();
    this.loginWindow?.destructor();
    this.layout.destructor();
    this.root.replaceChildren();
  }
}

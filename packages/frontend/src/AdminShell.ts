import { Workspace, type ViewDefinition } from "./Workspace";
import { Form, Layout, Menu, Toolbar, Window, alert, setTheme, awaitRedraw } from "@dhtmlx/suite";

export type MenuDefinition = {
  id: string;
  label: string;
  disabled?: boolean;
  items?: MenuDefinition[];
};
export type ShellDefinition = {
  protocol: 1;
  title: string;
  version?: string;
  authenticated: boolean;
  username: string;
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

/** VAPA owns the DHTMLX lifecycle; consumers supply definitions, never shell markup. */
export class AdminShell {
  private layout: Layout;
  private menu?: Menu;
  private workspace?: Workspace;
  private navigation=0;
  private menuItems: object[] = [];
  private compactMenu?: boolean;
  private loginWindow?: Window;
  private loginForm?: Form;
  private submitting = false;
  private listeners = new AbortController();
  private resize = () => {
    if (this.menu) {
      const required=this.menuItems.reduce((sum:number,item:any)=>sum+40+String(item.value || "").length*9,305);
      const compact = this.root.clientWidth < Math.max(768,required);
      if (compact !== this.compactMenu) {
        this.compactMenu = compact;
        this.menu.data.removeAll();
        const items = structuredClone(this.menuItems);
        this.menu.data.parse([
          ...(compact && this.menuItems.length
            ? [{ id: "vapa-main-menu", value: "Menü", items }]
            : items),
          { id: "vapa-session-separator", type: "separator" },
          { id: "vapa-logout", value: "Kijelentkezés" },
        ]);
      }
    }
    if (!this.loginWindow) return;
    const width = this.definition.confirmation ? 460 : 420;
    const height = this.definition.confirmation ? 370 : this.definition.rememberAvailable ? 340 : 290;
    this.loginWindow.setSize(
      Math.min(width, innerWidth - 24),
      Math.min(height, innerHeight - 24),
    );
    this.loginWindow.show();
  };

  constructor(
    private root: HTMLElement,
    private command: HTMLFormElement,
    private definition: ShellDefinition,
  ) {
    let theme="light";
    try { theme=localStorage.getItem("vapa-theme")==="dark"?"dark":"light"; } catch {}
    setTheme(theme,document.documentElement);
    if (definition.protocol !== 1)
      throw new Error("Nem kompatibilis VAPA felületverzió.");
    this.layout = new Layout(root, {
      type: "line",
      rows: [
        { id: "menu-row", height: 40, cols: [{id:"main-menu"},{id:"theme",width:145}] },
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
    const themeControl=new Toolbar(undefined,{data:[{id:"theme-choice",value:theme==="dark"?"Éjjeli":"Default",items:[{id:"theme-light",value:"Default"},{id:"theme-dark",value:"Éjjeli"}]}]});
    themeControl.events.on("click",(id:string|number)=>{
      if(id!=="theme-light" && id!=="theme-dark")return;
      const next=id==="theme-dark"?"dark":"light";
      setTheme(next,document.documentElement);
      themeControl.data.update("theme-choice",{value:next==="dark"?"Éjjeli":"Default"});
      try{localStorage.setItem("vapa-theme",next);}catch{}
    });
    this.layout.getCell("theme").attach(themeControl);
    if (definition.authenticated) {
      const map = (items: MenuDefinition[]): object[] =>
        items.map((item) => ({
          id: item.id,
          value: escape(item.label),
          ...(item.items?.length
            ? { items: map(item.items) }
            : { disabled: true }),
        }));
      const features: any[]=[];
      for(const view of definition.views || []) {
        const item={id:"feature:"+view.resource,value:escape(view.title)};
        if(view.group){
          let group=features.find(v=>v.id==="group:"+view.group);
          if(!group){group={id:"group:"+view.group,value:escape(view.group),items:[]};features.push(group);}
          group.items.push(item);
        }else features.push(item);
      }
      this.menuItems = [...map(definition.menu || []), ...features];
      const menu = new Menu(undefined, { navigationType: "click" });
      this.menu = menu;
      this.resize();
      menu.events.on("click", (id: string | number) => {
        if (id === "vapa-logout") this.post("logout");
        const view=definition.views?.find(v=>"feature:"+v.resource===id);
        if(view)void this.openView(view);
      });
      this.layout.getCell("main-menu").attach(menu);

    } else {
      if (definition.confirmation) this.mountConfirmation();
      else this.mountLogin();
    }
    window.addEventListener("resize", this.resize);
    if (definition.error) requestAnimationFrame(() => {
      void alert({ header: "Hiba", text: definition.error, htmlEnable: false, buttons: ["Rendben"] })
        .then(() => { if (!this.listeners.signal.aborted) this.loginForm?.setFocus(definition.confirmation ? "code" : "password"); });
    });
  }

  private async openView(view:ViewDefinition):Promise<void>{
    const navigation=++this.navigation;
    this.layout.getCell("workspace").detach();
    this.workspace?.destroy();this.workspace=undefined;
    await awaitRedraw();
    if(navigation!==this.navigation || this.listeners.signal.aborted)return;
    this.workspace=new Workspace(document.createElement("div"),view,this.definition.csrf || "",this.definition.live || {transport:"poll",endpoint:"live",interval:2000});
    this.layout.getCell("workspace").attach(this.workspace.layout);
  }

  private mountLogin(): void {
    const definition = this.definition;
    this.loginWindow = new Window({
      title: "Bejelentkezés",
      ariaLabel: "Bejelentkezés",
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
        {
          type: "input",
          name: "username",
          label: "Felhasználónév",
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
          label: "Jelszó",
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
          text: `Bejelentkezve maradok (${definition.rememberDays ?? 90} nap)`,
          checked: false,
        }] : []),
        {
          align: "end",
          cols: [
            {
              type: "button",
              name: "login",
              text: "Bejelentkezés",
              view: "flat",
              color: "primary",
            },
          ],
        },
      ],
    });
    this.loginForm = form;
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
      title: "E-mailes megerősítés",
      ariaLabel: "E-mailes megerősítés",
      width: 460,
      height: 370,
      modal: true,
      closable: false,
      resizable: false,
    });
    const form = new Form(document.createElement("div"), {
      padding: 20,
      rows: [
        { type: "text", name: "recipient", label: "Megerősítő levelet küldtünk", value: escape(confirmation.email) },
        { type: "input", name: "code", label: "Megerősítő kód", labelPosition: "top", required: true, maxlength: 6,
          validation: (value: string | number) => /^[0-9]{6}$/.test(String(value)), errorMessage: "A levélben kapott 6 számjegyű kód szükséges." },
        { type: "button", name: "verify", text: "Belépés megerősítése", color: "primary" },
        { cols: [
          { type: "button", name: "resend", text: "Új kód küldése", view: "link" },
          { type: "button", name: "cancel", text: "Vissza a belépéshez", view: "link" },
        ] },
      ],
    });
    this.loginForm = form;
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
    action: "login" | "logout" | "confirm_login" | "resend_login" | "cancel_login",
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
    this.command.submit();
  }

  destroy(): void {
    this.listeners.abort();
    window.removeEventListener("resize", this.resize);
    this.workspace?.destroy();
    this.loginWindow?.destructor();
    this.layout.destructor();
    this.root.replaceChildren();
  }
}

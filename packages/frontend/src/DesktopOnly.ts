import { Layout } from "@dhtmlx/suite";
import { t } from "./I18n";
import { noticeMarkup } from "./MessageDialog";

/** Same narrow-screen breakpoint as the toolbars, grids and workspaces. */
const NARROW=768;

/**
 * View option `desktopOnly`: below the breakpoint the view is not shown and a centred notice
 * replaces it. The view stays mounted but hidden by CSS, so widening the window restores it
 * with its state; requests and ACL are unchanged, this is presentation only. The view host
 * attaches the view's content to `cell` and destroys the view before this wrapper.
 */
export class DesktopOnly {
  readonly layout:Layout;
  private listeners=new AbortController();
  private narrow?:boolean;
  constructor(title:string){
    this.layout=new Layout(document.createElement("div"),{type:"none",rows:[{id:"notice",css:"blade-desktop-only"},{id:"view"}]});
    this.layout.getCell("notice").attachHTML(noticeMarkup({title,message:t("Csak desktop környezetben elérhető funkció.")}));
    window.addEventListener("resize",()=>this.apply(),{signal:this.listeners.signal});
    this.apply();
  }
  get cell(){return this.layout.getCell("view");}
  private apply():void{
    const narrow=innerWidth<NARROW;
    if(narrow===this.narrow)return;
    this.narrow=narrow;
    // Cell configuration rather than DOM classes, so Layout keeps it on every repaint.
    this.layout.getCell("notice").config.css="blade-desktop-only"+(narrow?"":" blade-desktop-only--hidden");
    this.layout.getCell("view").config.css=narrow?"blade-desktop-only--hidden":"";
    this.layout.paint();
  }
  destroy():void{this.listeners.abort();this.layout.destructor();}
}

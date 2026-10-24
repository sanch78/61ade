import { Layout } from "@dhtmlx/suite";
import { t } from "./I18n";
import { noticeMarkup } from "./MessageDialog";

type View={layout:Layout;destroy():void};
/** Same narrow-screen breakpoint as the toolbars, grids and workspaces. */
const NARROW=768;

/**
 * View option `desktopOnly`: below the breakpoint the view is not shown and a centred notice
 * replaces it. The view stays mounted but hidden by CSS, so widening the window restores it
 * with its state; requests and ACL are unchanged, this is presentation only.
 */
export class DesktopOnly {
  readonly layout:Layout;
  private listeners=new AbortController();
  private narrow?:boolean;
  constructor(private view:View,title:string){
    this.layout=new Layout(document.createElement("div"),{type:"none",rows:[{id:"notice",css:"blade-desktop-only"},{id:"view"}]});
    this.layout.getCell("notice").attachHTML(noticeMarkup({title,message:t("Csak desktop környezetben elérhető funkció.")}));
    this.layout.getCell("view").attach(view.layout);
    window.addEventListener("resize",()=>this.apply(),{signal:this.listeners.signal});
    this.apply();
  }
  private apply():void{
    const narrow=innerWidth<NARROW;
    if(narrow===this.narrow)return;
    this.narrow=narrow;
    // Cell configuration rather than DOM classes, so Layout keeps it on every repaint.
    this.layout.getCell("notice").config.css="blade-desktop-only"+(narrow?"":" blade-desktop-only--hidden");
    this.layout.getCell("view").config.css=narrow?"blade-desktop-only--hidden":"";
    this.layout.paint();
  }
  destroy():void{this.listeners.abort();this.view.destroy();this.layout.destructor();}
}

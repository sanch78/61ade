import { t } from "../../I18n";
import { fitWindow } from "../../WindowSizing";
import { Window } from "@dhtmlx/suite";
import { escape as escapeRecord, presentedFields, recordFields, withDerived } from "../../RecordPresentation";
import type { Row } from "../../Realtime";
import { escape } from "./fields";
import type { ViewDefinition } from "./types";

/**
 * The record details (`Adatok`): every declared detail field present in the ACL-projected record, with its
 * column's presentation (media, icon, options). Shared by the list's details window and `RecordDetails`.
 */
export const detailsHtml=(row:Row,view:Pick<ViewDefinition,"columns"|"detailFields">,showId=true):string=>
  `<article class="blade-record-details">${showId?`<div class="blade-grid-card__id">ID · ${escapeRecord(row.id)}</div>`:""}${recordFields(row,presentedFields(withDerived(view.detailFields??view.columns,view.columns),view.columns))}</article>`;

/** The list's details window: one at a time, freshly loaded through the view's `get` (a newer request wins). */
export class DetailsWindow{
  private epoch=0;
  private window?:Window;
  constructor(private view:ViewDefinition,private get:(id:string)=>Promise<Row>,private disposed:()=>boolean,private error:(error:unknown)=>Promise<void>){}
  async show(id:string):Promise<void>{
    const epoch=++this.epoch;
    this.window?.destructor();this.window=undefined;
    try{
      const row:Row=await this.get(id);
      if(this.disposed()||epoch!==this.epoch)return;
      const dialog=new Window({css:"blade-content-window",title:escape(this.view.title+" — "+t("Adatok")+" · "+id),ariaLabel:t("Rekordadatok"),width:Math.min(680,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});
      this.window=dialog;
      dialog.attachHTML(detailsHtml(row,this.view));
      dialog.show();
      // The details take the focus once the window has settled: the Grid moves Suite's widget focus back to itself after
      // a double-click or Enter, and a fast answer opens the window before that, so Escape would not close it.
      void fitWindow(dialog).then(()=>{
        const body=dialog.getContainer()?.querySelector<HTMLElement>(".blade-record-details");
        if(this.window!==dialog||!dialog.isVisible()||!body||body.contains(document.activeElement))return;
        body.tabIndex=-1;body.style.outline="none";body.focus({preventScroll:true});
      });
    }catch(error){await this.error(error);}
  }
  /** Closes the window and drops a pending load. */
  close():void{this.epoch++;this.window?.destructor();this.window=undefined;}
}

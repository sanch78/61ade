import { t } from "../../I18n";
import { fitWindow } from "../../WindowSizing";
import { Window, awaitRedraw } from "@dhtmlx/suite";
import { requestConfirmation } from "../../MessageDialog";
import { Tabs } from "../layout/Tabs";
import type { RecordForm } from "./RecordForm";
import { escape as escapeRecord, presentedFields, recordFields, withDerived } from "../../RecordPresentation";
import type { Row } from "../../Realtime";
import { escape } from "./fields";
import type { ViewDefinition } from "./types";
import type { MountTarget } from "../../api/types";

/**
 * The record details (`Adatok`): every declared detail field present in the ACL-projected record, with its
 * column's presentation (media, icon, options). Shared by the list's details window and `RecordDetails`.
 */
export const detailsHtml=(row:Row,view:Pick<ViewDefinition,"columns"|"detailFields">,showId=true):string=>
  `<article class="blade-record-details">${showId?`<div class="blade-grid-card__id">ID · ${escapeRecord(row.id)}</div>`:""}${recordFields(row,presentedFields(withDerived(view.detailFields??view.columns,view.columns),view.columns))}</article>`;

/** What the tabbed details window needs from its list (`detailTabs`): the update form and the list's reload. */
export type DetailsEditing={user:string;form:(id:string)=>RecordForm;saved:()=>void};

/**
 * The list's details window: one at a time, freshly loaded through the view's `get` (a newer request wins). With the
 * view's `detailTabs` and a record that offers `update`, the window has an `Adatok` and a `Szerkesztés` tab (`Tabs`):
 * the edit tab holds the public `RecordForm` of `update`, created when the tab first opens; leaving it with unsaved
 * changes asks first; a save reloads the details, the list and returns to `Adatok`; Cancel returns without saving.
 */
export class DetailsWindow{
  private epoch=0;
  private window?:Window;
  private release?:AbortController;
  constructor(private view:ViewDefinition,private get:(id:string)=>Promise<Row>,private disposed:()=>boolean,private error:(error:unknown)=>Promise<void>,private editing?:DetailsEditing){}
  async show(id:string):Promise<void>{
    const epoch=++this.epoch;
    this.dispose();
    try{
      const row:Row=await this.get(id);
      if(this.disposed()||epoch!==this.epoch)return;
      const editable=!!this.editing&&this.view.detailTabs===true&&this.view.actions.some(action=>action.name==="update")&&Array.isArray(row._actions)&&row._actions.includes("update");
      const dialog=new Window({css:"blade-content-window",title:escape(this.view.title+" — "+t("Adatok")+" · "+id),ariaLabel:t("Rekordadatok"),width:Math.min(680,innerWidth-24),height:Math.min(650,innerHeight-24),modal:true,closable:true,resizable:true});
      this.window=dialog;
      if(editable)this.tabbed(dialog,row,epoch);
      else dialog.attachHTML(detailsHtml(row,this.view));
      dialog.show();
      // The details take the focus once the window has settled: the Grid moves Suite's widget focus back to itself after
      // a double-click or Enter, and a fast answer opens the window before that, so Escape would not close it.
      const settled=editable?awaitRedraw():fitWindow(dialog);
      void settled.then(()=>{
        const body=dialog.getContainer()?.querySelector<HTMLElement>(".blade-record-details");
        if(this.window!==dialog||!dialog.isVisible()||!body||body.contains(document.activeElement))return;
        body.tabIndex=-1;body.style.outline="none";body.focus({preventScroll:true});
      });
    }catch(error){await this.error(error);}
  }
  private tabbed(dialog:Window,row:Row,epoch:number):void{
    const editing=this.editing!,release=this.release=new AbortController(),signal=release.signal;
    dialog.events.on("afterHide",()=>{if(this.release===release)this.dispose();});
    const body=document.createElement("div");body.className="blade-detail-tab";body.innerHTML=detailsHtml(row,this.view);
    let form:RecordForm|undefined;
    const tabs=new Tabs({user:editing.user},{signal,tabs:[{id:"details",label:t("Adatok")},{id:"edit",label:t("Szerkesztés")}],
      guard:({from})=>from!=="edit"||!form?.dirty()?true:requestConfirmation({title:t("Nem mentett módosítások"),message:t("A rekord nem mentett módosításai elvesznek."),severity:"warning",confirmLabel:t("Elvetés")})});
    // A Suite Window takes the Tabbar like a Layout cell (`attach`); it is destroyed with the window.
    tabs.mount(dialog as unknown as MountTarget);
    tabs.attach("details",body);
    const reset=()=>{form?.destroy();form=undefined;};
    const open=()=>{
      if(form||signal.aborted)return;
      const current=form=editing.form(String(row.id));
      current.on("saved",()=>{
        editing.saved();
        void this.get(String(row.id)).then(fresh=>{
          if(signal.aborted||epoch!==this.epoch)return;
          row=fresh;body.innerHTML=detailsHtml(fresh,this.view);
        }).catch(error=>{if(!signal.aborted)void this.error(error);}).finally(()=>{
          if(signal.aborted||form!==current)return;
          reset();void tabs.select("details");
        });
      });
      // Cancel discards the changes without asking: the user chose it.
      current.on("cancelled",()=>{if(form!==current)return;reset();void tabs.select("details");});
      current.mount(tabs.cell("edit"));
    };
    // Leaving the edit tab drops its form (the guard has confirmed discarding unsaved changes): the next opening loads the
    // record's current values and revision.
    tabs.on("change",({id})=>{if(id==="edit")open();else reset();});
    signal.addEventListener("abort",()=>{reset();tabs.destroy();},{once:true});
  }
  private dispose():void{const release=this.release;this.release=undefined;release?.abort();this.window?.destructor();this.window=undefined;}
  /** Closes the window and drops a pending load. */
  close():void{this.epoch++;this.dispose();}
}

import { t } from "../../I18n";
import { Layout } from "@dhtmlx/suite";
import { acknowledge } from "../../MessageDialog";
import { server } from "../../api/Server";
import type { RecordDetails as RecordDetailsApi, RecordDetailsOptions, Row } from "../../api/types";
import { Component } from "./component";
import { detailsHtml } from "./details";
import { errorText } from "./fields";
import { listDefinition, resolveListView } from "./definition";
import type { ListContext } from "./ListView";
import type { ViewDefinition } from "./types";

/**
 * Read-only record details as the list's `Adatok` window shows them, as a public component
 * (`app.components.RecordDetails`, docs/toolkit.md#recorddetails): the view's detail fields present in the
 * ACL-projected row, with their media, icon and option presentation. An id is loaded through the view's `get`.
 */
export class RecordDetails extends Component<Record<string,never>> implements RecordDetailsApi{
  readonly layout:Layout;
  private view:ViewDefinition;
  private epoch=0;
  private abort?:AbortController;
  private showId:boolean;
  constructor(context:ListContext,options:RecordDetailsOptions){
    super(options);
    this.view=listDefinition(resolveListView(context.app(),options.view));
    this.showId=options.showId!==false;
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"details"}]});
    void this.show(options.record).catch(()=>{});
    this.bind(options.signal);
  }
  /** A row is shown as given; an id is loaded (a newer `show` wins). A failed load shows the error dialog and rejects. */
  async show(record:Row|string):Promise<void>{
    if(this.destroyed)return;
    const epoch=++this.epoch;this.abort?.abort();
    let row:Row;
    if(typeof record!=="object"||record===null){
      const abort=this.abort=new AbortController();
      try{row=await server.call<Row>(this.view.resource,"get",{id:String(record),signal:abort.signal});}
      catch(error){
        if(!this.destroyed&&epoch===this.epoch&&!(error instanceof DOMException&&error.name==="AbortError"))await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,[])});
        throw error;
      }
    }else row=record;
    if(this.destroyed||epoch!==this.epoch)return;
    this.layout.getCell("details").attachHTML(`<div class="blade-view-slot">${detailsHtml(row,this.view,this.showId)}</div>`);
  }
  protected dispose():void{this.epoch++;this.abort?.abort();this.layout.destructor();}
}

import { t } from "../../I18n";
import { Layout, awaitRedraw } from "@dhtmlx/suite";
import { acknowledge } from "../../MessageDialog";
import { server } from "../../api/Server";
import type { MountTarget, RecordDetails as RecordDetailsApi, RecordDetailsOptions, Row } from "../../api/types";
import { Component } from "./component";
import { CellStatus } from "../CellStatus";
import { detailsHtml } from "./details";
import { errorText } from "./fields";
import { listDefinition, resolveListView } from "./definition";
import type { ListContext } from "./ListView";
import type { ViewDefinition } from "./types";

/** Narrower record content than this stacks the groups (admin.css) and never lets a long-text card scroll on its own. */
const STACKED=492;

/**
 * `longText: "card"` (FB-0218): the cards fill the height below the rest and scroll on their own while the rest and
 * `--blade-record-text-min-height` (160 px) per card fit in the visible details and the content is at least 492 px
 * wide; otherwise the details scroll as a whole and each card shows all of its text. A card that scrolls is a tab stop.
 */
function fitTexts(article:HTMLElement,texts:HTMLElement,slot:HTMLElement):void{
  const style=getComputedStyle(article),gap=parseFloat(getComputedStyle(texts).rowGap)||0,cards=texts.children.length;
  const min=parseFloat(style.getPropertyValue("--blade-record-text-min-height"))||160;
  const width=article.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const above=texts.getBoundingClientRect().top-article.getBoundingClientRect().top;
  const fill=width>=STACKED&&above+cards*min+(cards-1)*gap+parseFloat(style.paddingBottom)<=slot.clientHeight;
  article.classList.toggle("blade-record-details--fill",fill);
  for(const body of Array.from(texts.querySelectorAll<HTMLElement>(".blade-record-text__body"))){
    if(fill&&body.scrollHeight>body.clientHeight+1)body.tabIndex=0;else body.removeAttribute("tabindex");
  }
}

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
  private longText:"inline"|"card";
  /**
   * `longText: "card"`: the details are fitted (`fitTexts`) after Suite paints them (on `show` and, since a cell paints
   * the component's Layout only then, on `mount`) and whenever their slot or their content changes its size.
   */
  private sizes?:ResizeObserver;
  private watched?:HTMLElement;
  /** Loading while a record id loads; a failed first load says so (docs/toolkit.md#loading-and-empty-states). */
  private status:CellStatus;
  constructor(context:ListContext,options:RecordDetailsOptions){
    super(options);
    this.view=listDefinition(resolveListView(context.app(),options.view));
    this.showId=options.showId!==false;
    if(options.longText!==undefined&&options.longText!=="inline"&&options.longText!=="card")throw new TypeError("RecordDetails longText must be \"inline\" or \"card\".");
    this.longText=options.longText??"inline";
    this.layout=new Layout(this.host,{type:"none",rows:[{id:"details"}]});
    this.status=new CellStatus(this.layout.getCell("details"));
    if(this.longText==="card")this.sizes=new ResizeObserver(()=>this.fit());
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
      this.status.busy(true);
      try{row=await server.call<Row>(this.view.resource,"get",{id:String(record),signal:abort.signal});}
      catch(error){
        if(!this.destroyed&&epoch===this.epoch&&!(error instanceof DOMException&&error.name==="AbortError")){
          this.status.busy(false);
          if(!this.layout.getCell("details").config.html)this.status.text(t("Az adatok nem érhetők el."),"error");
          await acknowledge({title:t("Hiba"),severity:"danger",message:errorText(error,[])});
        }
        throw error;
      }
    }else row=record;
    if(this.destroyed||epoch!==this.epoch)return;
    this.status.busy(false);this.status.text(undefined);
    this.layout.getCell("details").attachHTML(`<div class="blade-view-slot">${detailsHtml(row,this.view,this.showId,this.longText)}</div>`);
    this.painted();
  }
  mount(target:MountTarget):void{super.mount(target);this.painted();}
  private painted():void{if(this.sizes)void awaitRedraw().then(()=>this.fit());}
  /** Fits the painted details' long-text cards; newly painted details are watched (their slot and their content). */
  private fit():void{
    const article=this.layout.getRootNode()?.querySelector<HTMLElement>(".blade-record-details"),texts=article?.querySelector<HTMLElement>(":scope > .blade-record-texts"),slot=article?.parentElement;
    if(this.destroyed||!this.sizes||!article||!slot)return;
    if(this.watched!==article){this.sizes.disconnect();this.sizes.observe(slot);this.sizes.observe(article);this.watched=article;}
    if(texts)fitTexts(article,texts,slot);
  }
  protected dispose():void{this.epoch++;this.abort?.abort();this.sizes?.disconnect();this.watched=undefined;this.status.destroy();this.layout.destructor();}
}

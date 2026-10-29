import { t } from "../../I18n";
import { Toolbar, type Layout } from "@dhtmlx/suite";

/** Server limit of the `search` list parameter, in characters. */
export const SEARCH_MAX=100;

/**
 * A declared search (`view.search`) in its own native Toolbar input beside the command bar (which may collapse
 * into a menu). Debounced input, Enter and Escape converge on `apply`; an empty search removes the parameter.
 */
export class ListSearch{
  /** The applied search text (trimmed, at most `SEARCH_MAX` characters). */
  value="";
  private timer?:ReturnType<typeof setTimeout>;
  private bar:Toolbar;
  private disposed=false;
  constructor(cell:ReturnType<Layout["getCell"]>,private changed:()=>void){
    const bar=this.bar=new Toolbar(document.createElement("div"),{css:"blade-search-bar",data:[{type:"input",id:"blade-search",label:t("Keresés"),hiddenLabel:true,placeholder:t("Keresés…"),icon:"dxi dxi-magnify",width:"100%",autocomplete:false}]} as any);
    // Suite's Toolbar input has no maxlength option: it is set on the input whenever Suite creates it.
    bar.events.on("inputCreated",(_id:string|number,input:HTMLInputElement)=>{input.maxLength=SEARCH_MAX;});
    bar.events.on("input",(_id:string|number,value:string)=>{clearTimeout(this.timer);this.timer=setTimeout(()=>this.apply(String(value??"")),300);});
    bar.events.on("keydown",(event:KeyboardEvent)=>{
      const input=event.target as HTMLInputElement;
      if(event.key==="Enter"){event.preventDefault();this.apply(input.value??"");}
      else if(event.key==="Escape"){event.preventDefault();input.value="";bar.data.update("blade-search",{value:""});this.apply("");}
    });
    cell.attach(bar);
  }
  private apply(value:string):void{
    clearTimeout(this.timer);this.timer=undefined;
    const next=Array.from(value.trim()).slice(0,SEARCH_MAX).join("").trim();if(next===this.value||this.disposed)return;
    this.value=next;this.changed();
  }
  destroy():void{
    this.disposed=true;clearTimeout(this.timer);
    // Suite 9.3.12 reads a destroyed vnode when a focused Toolbar input blurs during unmount.
    const focused=document.activeElement;if(focused instanceof HTMLElement&&this.bar.getRootNode()?.contains(focused))focused.blur();
  }
}

import { t } from "./I18n";

/**
 * Accessible names that Suite writes in English with no locale key (FB-0155): the header of a `collapsable` Layout cell
 * ("click to collapse" / "click to expand") and a window's close button ("close", its item id). Every such element of
 * the page, also of a project's own Suite Layout or Window, is renamed when Suite draws it or changes the name: the
 * header names its region (`{header} összecsukása` / `{header} kinyitása`), the close button is `Ablak bezárása`
 * (also its tooltip; a window's own `Bezárás` button keeps its name). Suite keeps a name it does not change itself, so
 * a redraw that changes nothing leaves it in place.
 */
const HEADER='.dhx_layout-cell-header[role="button"]';
const CLOSE='.dhx_window [data-dhx-id="close"]';
let observer:MutationObserver|undefined;

function header(element:Element):void{
  const label=element.getAttribute("aria-label");
  if(!label||!/^click to (collapse|expand)$/.test(label))return;
  const title=element.querySelector(".dhx_layout-cell-header__title")?.textContent?.trim();
  const collapsed=element.classList.contains("dhx_layout-cell-header--collapsed");
  element.setAttribute("aria-label",title?t(collapsed?"{header} kinyitása":"{header} összecsukása",{header:title}):t(collapsed?"Kinyitás":"Összecsukás"));
}
function close(element:Element):void{
  if(element.getAttribute("aria-label")!=="close")return;
  const label=t("Ablak bezárása");
  element.setAttribute("aria-label",label);
  element.setAttribute("title",label);
}
function visit(node:Node):void{
  if(!(node instanceof Element))return;
  if(node.matches(HEADER))header(node);else if(node.matches(CLOSE))close(node);
  if(node.firstElementChild){node.querySelectorAll(HEADER).forEach(header);node.querySelectorAll(CLOSE).forEach(close);}
}

/** Starts renaming (once per page); the names follow the current locale. */
export function installSuiteLabels():void{
  if(observer||typeof MutationObserver==="undefined")return;
  // A bundle loaded in the head starts once the body exists.
  if(!document.body){document.addEventListener("DOMContentLoaded",installSuiteLabels,{once:true});return;}
  observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==="attributes")visit(record.target);
      else record.addedNodes.forEach(visit);
    }
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["aria-label"]});
  visit(document.body);
}

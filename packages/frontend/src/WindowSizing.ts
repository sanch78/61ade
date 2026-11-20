import {type Window,awaitRedraw} from "@dhtmlx/suite";
import {finishMotion} from "./Motion";

/**
 * A form's action row as its footer: 12 px above and below the buttons (the message dialog's footer), the form's side
 * inset beside them; admin.css draws the rule and the band. A form of this row alone (a command bar) uses it directly.
 */
export const formFooter=(actions:any,inset=20):any=>({...actions,padding:`12px ${inset}px`});
/**
 * A framework form's configuration: the fields in one body that scrolls on its own (`blade-form-body`, $inset on every
 * side) and the action row below it as a fixed footer, so a scrollbar runs beside the fields only and the buttons never
 * scroll. Without $actions the form is the body alone. Form sections (formRows) and their CSS expect this body.
 */
export const formLayout=(rows:any[],actions?:any,inset=20):any=>({padding:0,rows:[{css:"blade-form-body",padding:inset,rows},...(actions?[formFooter(actions,inset)]:[])]});
/**
 * Fallback cap of a fitted window's height in px (FB-0177): a centred dialog, not a full-height one; the viewport caps it
 * too. 800 px keeps a form window readable on 1366 × 768 and 1080p screens without a full-height wall of fields; an
 * application declares its own default (`ApplicationDefinition::$windowMaxHeight`, bootstrap `windowMaxHeight`, FB-0225).
 */
export const FIT_MAX_HEIGHT=800;
let defaultMaxHeight=FIT_MAX_HEIGHT;
/**
 * The application's default cap (the shell's bootstrap `windowMaxHeight`): an integer 320–4000; anything else (also
 * none) keeps FIT_MAX_HEIGHT. A window's own `maxHeight` still wins.
 */
export function configureWindowSizing(maxHeight?:unknown):void{
  defaultMaxHeight=typeof maxHeight==="number"&&Number.isInteger(maxHeight)&&maxHeight>=320&&maxHeight<=4000?maxHeight:FIT_MAX_HEIGHT;
}
/**
 * Measure a rendered form (to its footer, formLayout), its buttons or natural HTML content, including window chrome, and
 * fit the height to it up to $maxHeight (by default the application's, `configureWindowSizing`, and always the viewport
 * minus 24 px). A taller form scrolls its body between the fixed window header and its fixed footer (admin.css). A Form
 * textarea then takes any height the window has or gains beyond that, so a clamped or resized window leaves no gap above
 * its footer; that growth and the body's scrolling are paused while measuring. Accordion form sections are measured all
 * shown, so the height is the same whichever sections are open.
 */
export async function fitWindow(win:Window,maxHeight=defaultMaxHeight,selector=".dhx_form > .blade-form-actions, .dhx_form button, .blade-record-details"):Promise<void>{
  await awaitRedraw();
  if(!win.isVisible())return;
  const container=win.getContainer();
  // A section still easing to its size (theme motion) would be measured at its pinned size.
  finishMotion(container);
  container.dataset.bladeMeasure="";
  // A form's footer is its lower edge: nothing else of that form is measured (a button in a field's own scrolling list
  // may reach below its visible part). Other content keeps a 24 px inset below it.
  const footed=(node:HTMLElement)=>!node.matches(".dhx_form > .blade-form-actions")&&!!node.closest(".dhx_form:has(> .blade-form-actions)");
  const content=Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(node=>node.getBoundingClientRect().height>0&&!footed(node));
  const outer=(container.closest<HTMLElement>('[role="dialog"]')??container).getBoundingClientRect();
  // The window's frame below its content (its lower border).
  const frame=outer.bottom-(container.querySelector(".dhx_window-content")??container).getBoundingClientRect().bottom;
  const bottom=Math.max(...content.map(node=>node.getBoundingClientRect().bottom+(node.matches(".blade-form-actions")?frame:24)));
  // Accordion form sections (fields.ts) show at their own height here; one open at a time needs room for the tallest
  // only, so the height does not depend on which sections are open and toggling never resizes the window.
  const single=Array.from(container.querySelectorAll<HTMLElement>(".blade-form-section--accordion:not(.blade-form-section--still):not(:has(.blade-form-section__heading--multiple)) > .blade-form-section__body"),node=>node.getBoundingClientRect().height);
  const spare=single.length>1?single.reduce((sum,height)=>sum+height,0)-Math.max(...single):0;
  delete container.dataset.bladeMeasure;
  if(!content.length)return;
  const height=Math.min(innerHeight-24,maxHeight,Math.ceil(bottom-spare-outer.top));
  win.setSize(Math.min(outer.width,innerWidth-24),height);
  win.setPosition(Math.max(12,(innerWidth-outer.width)/2),Math.max(12,(innerHeight-height)/2));
  await awaitRedraw();
}

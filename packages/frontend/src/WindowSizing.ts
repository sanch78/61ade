import {type Window,awaitRedraw} from "@dhtmlx/suite";

/** Default cap of a fitted window's height in px (FB-0177): a centred dialog, not a full-height one; the viewport caps it too. */
export const FIT_MAX_HEIGHT=800;
/**
 * Measure rendered Form actions or natural HTML content, including window chrome, and fit the height to it up to
 * $maxHeight (and the viewport minus 24 px). A taller form scrolls between the fixed header and its action row, which
 * sticks to the window's lower edge (admin.css). A Form textarea then takes any height the window has or gains beyond
 * that, so a clamped or resized window leaves no gap below its actions; that growth and the sticking are paused while
 * measuring. Accordion form sections are measured all shown, so the height is the same whichever sections are open.
 */
export async function fitWindow(win:Window,maxHeight=FIT_MAX_HEIGHT,selector=".dhx_form button, .blade-record-details"):Promise<void>{
  await awaitRedraw();
  if(!win.isVisible())return;
  const container=win.getContainer();
  container.dataset.bladeMeasure="";
  const content=Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(node=>node.getBoundingClientRect().height>0);
  const outer=(container.closest<HTMLElement>('[role="dialog"]')??container).getBoundingClientRect();
  const bottom=Math.max(...content.map(node=>node.getBoundingClientRect().bottom));
  // Accordion form sections (fields.ts) show at their own height here; one open at a time needs room for the tallest
  // only, so the height does not depend on which sections are open and toggling never resizes the window.
  const single=Array.from(container.querySelectorAll<HTMLElement>(".blade-form-section--accordion:not(.blade-form-section--still):not(:has(.blade-form-section__heading--multiple)) > .blade-form-section__body"),node=>node.getBoundingClientRect().height);
  const spare=single.length>1?single.reduce((sum,height)=>sum+height,0)-Math.max(...single):0;
  delete container.dataset.bladeMeasure;
  if(!content.length)return;
  const height=Math.min(innerHeight-24,maxHeight,Math.ceil(bottom-spare-outer.top+24));
  win.setSize(Math.min(outer.width,innerWidth-24),height);
  win.setPosition(Math.max(12,(innerWidth-outer.width)/2),Math.max(12,(innerHeight-height)/2));
  await awaitRedraw();
}

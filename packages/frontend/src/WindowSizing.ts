import {type Window,awaitRedraw} from "@dhtmlx/suite";

/**
 * Measure rendered Form actions or natural HTML content, including window chrome. A Form textarea
 * then takes any height the window has or gains beyond that (admin.css), so a clamped or resized
 * window leaves no gap below its actions; that growth is paused while measuring.
 */
export async function fitWindow(win:Window,selector=".dhx_form button, .blade-record-details"):Promise<void>{
  await awaitRedraw();
  if(!win.isVisible())return;
  const container=win.getContainer();
  container.dataset.bladeMeasure="";
  const content=Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(node=>node.getBoundingClientRect().height>0);
  const outer=(container.closest<HTMLElement>('[role="dialog"]')??container).getBoundingClientRect();
  const bottom=Math.max(...content.map(node=>node.getBoundingClientRect().bottom));
  delete container.dataset.bladeMeasure;
  if(!content.length)return;
  const height=Math.min(innerHeight-24,Math.ceil(bottom-outer.top+24));
  win.setSize(Math.min(outer.width,innerWidth-24),height);
  win.setPosition(Math.max(12,(innerWidth-outer.width)/2),Math.max(12,(innerHeight-height)/2));
  await awaitRedraw();
}

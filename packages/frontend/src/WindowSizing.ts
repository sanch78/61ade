import {type Window,awaitRedraw} from "@dhtmlx/suite";

/** Measure rendered Form actions or natural HTML content, including window chrome. */
export async function fitWindow(win:Window,selector=".dhx_form button, .vapa-record-details"):Promise<void>{
  await awaitRedraw();
  if(!win.isVisible())return;
  const container=win.getContainer();
  const content=Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(node=>node.getBoundingClientRect().height>0);
  if(!content.length)return;
  const outer=(container.closest<HTMLElement>('[role="dialog"]')??container).getBoundingClientRect();
  const bottom=Math.max(...content.map(node=>node.getBoundingClientRect().bottom));
  const height=Math.min(innerHeight-24,Math.ceil(bottom-outer.top+24));
  win.setSize(Math.min(outer.width,innerWidth-24),height);
  win.setPosition(Math.max(12,(innerWidth-outer.width)/2),Math.max(12,(innerHeight-height)/2));
}

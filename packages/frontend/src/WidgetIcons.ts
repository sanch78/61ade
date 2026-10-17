/** Suite icon glyphs are decorative; accessible names come from button text. */
let users=0;
let observer:MutationObserver|undefined;
export function widgetIcons():()=>void{
  if(users++===0){
    const decorate=(node:Node)=>{
      if(!(node instanceof Element))return;
      if(node.matches(".dxi"))node.setAttribute("aria-hidden","true");
      node.querySelectorAll(".dxi").forEach(icon=>icon.setAttribute("aria-hidden","true"));
    };
    decorate(document.body);
    observer=new MutationObserver(records=>{for(const record of records)record.addedNodes.forEach(decorate);});
    observer.observe(document.body,{subtree:true,childList:true});
  }
  let released=false;
  return ()=>{if(released)return;released=true;if(--users===0){observer?.disconnect();observer=undefined;}};
}

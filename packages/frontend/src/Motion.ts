import type { Layout, Tree } from "@dhtmlx/suite";

/**
 * Theme motion (docs/shell.md#theme-motion): the open/close of layout regions eases to its new size instead of
 * jumping. The theme switches it on with `--blade-motion-duration` (Blade and Blade Night: Suite's transition time;
 * unset or `0s`, and under `prefers-reduced-motion: reduce`, nothing moves). Only the size is animated; the change
 * itself (Suite's collapse, a section's CSS class) happens at once, so state, events and focus are never delayed.
 *
 * A region is pinned with inline `!important` sizes (they win over Suite's inline sizes and every stylesheet rule),
 * measured again after the change has painted, then eased from the old to the new size and released.
 */
type Axis="width"|"height";
type Saved={value:string;priority:string;ours:string};
const PROPS:Record<Axis,string[]>={
  height:["flex-grow","flex-shrink","flex-basis","height","min-height","max-height","overflow","transition"],
  width:["flex-grow","flex-shrink","flex-basis","width","min-width","max-width","overflow","transition"],
};
/** The running motion of a node: finishing it releases the node at its final size. */
const running=new WeakMap<HTMLElement,()=>void>();
/** Every running motion with its nodes, for `finishMotion`. */
const active=new Map<()=>void,HTMLElement[]>();

/**
 * Ends at once every motion of a node inside $within, releasing it at its final size: a measurement of the natural
 * sizes (a window fitting its form, `fitWindow`) calls it first, since the pins win over its rules.
 */
export function finishMotion(within:Element):void{
  for(const [finish,nodes] of [...active])if(nodes.some(node=>within.contains(node)))finish();
}

/** The theme's motion time in ms (0: no motion). */
export function motionTime():number{
  if(typeof document==="undefined"||typeof getComputedStyle!=="function")return 0;
  if(typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches)return 0;
  const value=getComputedStyle(document.documentElement).getPropertyValue("--blade-motion-duration").trim();
  const match=/^(\d*\.?\d+)(ms|s)$/.exec(value);
  return match?Math.min(1000,Number(match[1])*(match[2]==="s"?1000:1)):0;
}

class Pins{
  private saved=new Map<HTMLElement,Map<string,Saved>>();
  set(node:HTMLElement,prop:string,value:string):void{
    let props=this.saved.get(node);
    if(!props)this.saved.set(node,props=new Map());
    const saved=props.get(prop),value0=node.style.getPropertyValue(prop),priority0=node.style.getPropertyPriority(prop);
    // A value Suite wrote over the pin (its redraw of the change) is the one to give back.
    if(!saved||value0!==saved.ours||priority0!=="important")props.set(prop,{value:value0,priority:priority0,ours:value});
    node.style.setProperty(prop,value,"important");
    // As the browser serializes it (rounded lengths, `0.2`), so release recognizes its own value.
    props.get(prop)!.ours=node.style.getPropertyValue(prop);
  }
  /** Gives each pinned property back; one that Suite wrote meanwhile keeps Suite's value. */
  release(node?:HTMLElement):void{
    for(const [element,props] of this.saved)if(!node||element===node){
      for(const [prop,saved] of props){
        if(element.style.getPropertyValue(prop)!==saved.ours||element.style.getPropertyPriority(prop)!=="important")continue;
        if(saved.value)element.style.setProperty(prop,saved.value,saved.priority);else element.style.removeProperty(prop);
      }
      this.saved.delete(element);
    }
  }
}

const size=(node:HTMLElement,axis:Axis)=>node.getBoundingClientRect()[axis];
const visible=(node:HTMLElement)=>node.isConnected&&node.getClientRects().length>0;

/**
 * Starts the resize motion of $nodes along $axis: call it before the change, and the returned `play` after it (or
 * nothing happens: `undefined` without motion or without a visible node). $keep are elements the change hides (a
 * closing section's content); they stay displayed until the motion ends, clipped by their region.
 */
export function resizeMotion(nodes:(HTMLElement|null|undefined)[],axis:Axis,keep:(HTMLElement|null|undefined)[]=[]):(()=>void)|undefined{
  const time=motionTime();
  const targets=nodes.filter((node):node is HTMLElement=>!!node&&visible(node));
  if(!time||!targets.length)return undefined;
  // A motion of an enclosing region ends first (a folder opened inside a growing one): it would clip this one and
  // jump at its end. Then from where a running motion of these nodes is now (a quick second toggle continues smoothly).
  for(const [finish,nodes] of [...active])if(nodes.some(node=>targets.some(target=>node!==target&&node.contains(target))))finish();
  const before=targets.map(node=>size(node,axis));
  for(const node of targets)running.get(node)?.();
  const pins=new Pins();
  // `clip` cannot be scrolled: a field focused or scrolled into view while its region is small leaves no offset.
  const scrolled=targets.map(node=>[node.scrollTop,node.scrollLeft] as const);
  const pin=(node:HTMLElement,px:number)=>{
    pins.set(node,"flex-grow","0");pins.set(node,"flex-shrink","0");pins.set(node,"flex-basis",px+"px");
    pins.set(node,axis,px+"px");pins.set(node,"min-"+axis,"0px");pins.set(node,"max-"+axis,"none");pins.set(node,"overflow","clip");
  };
  const kept=keep.filter((node):node is HTMLElement=>!!node&&node.isConnected).map(node=>[node,getComputedStyle(node).display] as const).filter(([,display])=>display!=="none");
  const hold=()=>{for(const [node,display] of kept)pins.set(node,"display",display);};
  targets.forEach((node,index)=>pin(node,before[index]));hold();
  let timer:ReturnType<typeof setTimeout>|undefined,frame:number|undefined,done=false;
  const finish=()=>{
    done=true;
    if(frame!==undefined)cancelAnimationFrame(frame);
    if(timer!==undefined)clearTimeout(timer);
    frame=timer=undefined;
    pins.release();
    targets.forEach((node,index)=>{node.scrollTop=scrolled[index][0];node.scrollLeft=scrolled[index][1];});
    for(const node of targets)if(running.get(node)===finish)running.delete(node);
    active.delete(finish);
  };
  for(const node of targets)running.set(node,finish);
  active.set(finish,targets);
  /** Holds the old sizes over Suite's redraw of the change, which writes its own inline sizes. */
  const reassert=()=>{if(done)return;targets.forEach((node,index)=>pin(node,before[index]));hold();};
  return ()=>{
    if(done)return;
    queueMicrotask(reassert);
    // Two frames on: after Suite's redraw of the change, whether it redrew at once or in the next frame.
    frame=requestAnimationFrame(()=>{reassert();frame=requestAnimationFrame(()=>{
      frame=undefined;
      // The new sizes as the change left them (a closing section's content hidden again).
      pins.release();
      const after=targets.map(node=>visible(node)?size(node,axis):0);
      if(after.every((px,index)=>Math.abs(px-before[index])<1)){finish();return;}
      targets.forEach((node,index)=>pin(node,before[index]));hold();
      void targets[0].offsetWidth; // the old sizes are the transition's start
      const easing=`${time}ms cubic-bezier(.2,0,0,1)`;
      targets.forEach((node,index)=>{pins.set(node,"transition",`flex-basis ${easing}, ${axis} ${easing}`);pin(node,after[index]);});
      timer=setTimeout(finish,time+60);
    });});
  };
}

/** The element of Layout cell $id (the outermost one when nested layouts reuse an id). */
function cellNode(layout:Layout,id:string):HTMLElement|null{
  const root=layout.getRootNode() as HTMLElement|null|undefined;
  return root?.querySelector?.<HTMLElement>(`[data-cell-id="${CSS.escape(id)}"]`)??null;
}

/**
 * Eases the `collapsable` cells of $layout (any depth) to their new size on collapse and expand: a header click, its
 * keys or a `collapse()`/`expand()` call. Suite leaves a collapsed cell's content out, so a collapsing one shrinks
 * with its header only.
 */
export function collapseMotion(layout:Layout):void{
  let play:(()=>void)|undefined;
  const start=(id:string|number)=>{
    const node=cellNode(layout,String(id)),parent=node?.parentElement;
    const own=play=node&&parent?resizeMotion([node],getComputedStyle(parent).flexDirection.startsWith("row")?"width":"height"):undefined;
    // A listener that cancels the change fires no after-event: the unchanged size then releases the pins.
    if(own)queueMicrotask(()=>{if(play===own)end();});
  };
  // Suite fires the after-event before it asks for its redraw frame: play once that request is made, so ours runs later.
  const end=()=>{const next=play;play=undefined;if(next)queueMicrotask(next);};
  layout.events.on("beforeCollapse",start);layout.events.on("beforeExpand",start);
  layout.events.on("afterCollapse",end);layout.events.on("afterExpand",end);
}

/** The item element (`li`, its row and its children) of node $id in Suite Tree $tree. */
export function treeItem(tree:Tree,id:string):HTMLElement|null{
  const root=(tree as any).getRootNode?.() as HTMLElement|null|undefined;
  return root?.querySelector?.<HTMLElement>(`li[data-dhx-id="${CSS.escape(id)}"]`)??null;
}

/** A running slide of a tree item's children: finishing it leaves the item as Suite drew it. */
type Slide={finish():void;height():number};
const slides=new WeakMap<HTMLElement,Slide>();
const childList=(item:HTMLElement)=>item.querySelector<HTMLElement>(":scope > ul");
const EASING="cubic-bezier(.2,0,0,1)";

/** Ends the slides of tree items inside $root at once. */
function finishSlides(root:HTMLElement):void{
  for(const [finish,nodes] of [...active])if(nodes.some(node=>node.hasAttribute("data-blade-sliding")||node.classList.contains("blade-tree-ghost"))&&nodes.some(node=>root.contains(node)))finish();
}
/** Eases $node's height from $from px to $to px (inline `!important`, removed at the end) and calls $done after. */
function slide(item:HTMLElement,node:HTMLElement,from:number,to:number,time:number,done:()=>void):void{
  node.style.setProperty("height",from+"px","important");
  void node.offsetHeight; // the start of the transition
  node.style.setProperty("transition",`height ${time}ms ${EASING}`,"important");
  node.style.setProperty("height",to+"px","important");
  let ended=false;
  const timer=setTimeout(()=>finish(),time+60);
  const finish=()=>{
    if(ended)return;
    ended=true;clearTimeout(timer);
    node.style.removeProperty("height");node.style.removeProperty("transition");
    done();
    if(slides.get(item)?.finish===finish)slides.delete(item);
    active.delete(finish);
  };
  slides.set(item,{finish,height:()=>node.isConnected?node.getBoundingClientRect().height:0});
  active.set(finish,[node]);
}
/**
 * Slides the children of tree item $item out from under its row: their list grows from $from px to its height with
 * its content at the bottom, so the rows appear from below the folder's row and the rows below follow.
 */
function slideOpen(item:HTMLElement,from:number,time:number):void{
  const list=childList(item);
  if(!list||!visible(list))return;
  const to=list.getBoundingClientRect().height;
  if(Math.abs(to-from)<1)return;
  list.setAttribute("data-blade-sliding",to>from?"open":"down");
  slide(item,list,from,to,time,()=>list.removeAttribute("data-blade-sliding"));
}
/**
 * Slides the children Suite has just removed from tree item $item under its row: $copy (their list as it was) stands
 * in for them, inert and hidden from assistive technology, and shrinks from $from px to nothing, content at the bottom.
 */
function slideClosed(item:HTMLElement,copy:HTMLElement,from:number,time:number):void{
  if(from<1||childList(item))return;
  copy.removeAttribute("style");copy.removeAttribute("data-blade-sliding");copy.removeAttribute("role");
  for(const node of [copy,...Array.from(copy.querySelectorAll("[id],[role],[style*='important']"))]){node.removeAttribute("id");node.removeAttribute("role");}
  const ghost=document.createElement("div");
  ghost.className="blade-tree-ghost";ghost.setAttribute("aria-hidden","true");ghost.inert=true;
  ghost.append(copy);
  item.append(ghost);
  slide(item,ghost,from,0,time,()=>ghost.remove());
}

/**
 * Eases the folders of Suite Tree $tree open and closed: the children slide out from under the folder's row and back
 * under it, with their lines and stripes, while the folder's own connector and the rows below follow (nothing is
 * clipped but the children). Suite removes a closed folder's children at once, so a copy of them slides back in.
 * Several folders changing at once (a bulk expansion, revealing a node's ancestors) change without motion; a second
 * toggle during a slide continues from the current height. Children loaded later slide with `treeChildrenMotion`.
 */
export function treeMotion(tree:Tree):void{
  let task:{bulk:boolean}|undefined;
  const start=(id:string|number)=>{
    const time=motionTime(),item=treeItem(tree,String(id));
    if(!time||!item||!visible(item))return;
    // A second change in the same task is a bulk change: every slide of the tree ends and the rest change at once.
    if(task){
      if(!task.bulk){task.bulk=true;const root=(tree as any).getRootNode?.() as HTMLElement|null|undefined;if(root)finishSlides(root);}
      return;
    }
    const own=task={bulk:false};
    queueMicrotask(()=>{if(task===own)task=undefined;});
    const list=childList(item),running=slides.get(item);
    const from=running?running.height():list&&visible(list)?list.getBoundingClientRect().height:0;
    const copy=list?.cloneNode(true) as HTMLElement|undefined;
    running?.finish();
    pending.set(String(id),{own,from,copy,time});
  };
  /** The slide waiting for its change: started once the DOM shows it, before the next paint. */
  const pending=new Map<string,{own:{bulk:boolean};from:number;copy?:HTMLElement;time:number}>();
  const play=(key:string)=>{
    const wait=pending.get(key);
    if(!wait||wait.own.bulk){pending.delete(key);return;}
    const now=treeItem(tree,key);
    if(!now||!visible(now)){pending.delete(key);return;}
    const opened=!!(tree.data.getItem(key) as any)?.opened,list=childList(now);
    // Suite redraws at once or in its next frame: the slide starts as soon as the children are in or out, in the
    // mutation's microtask, before that frame is painted.
    if(opened?!list:!!list){
      const root=(tree as any).getRootNode?.() as HTMLElement|null|undefined;
      if(!root){pending.delete(key);return;}
      const watch=new MutationObserver(()=>{
        const item=treeItem(tree,key);
        if(pending.get(key)!==wait){watch.disconnect();return;}
        if(item&&(opened?!!childList(item):!childList(item))){watch.disconnect();play(key);}
      });
      watch.observe(root,{childList:true,subtree:true});
      setTimeout(()=>{watch.disconnect();if(pending.get(key)===wait)pending.delete(key);},500);
      return;
    }
    pending.delete(key);
    if(opened)slideOpen(now,wait.from,wait.time);
    else if(wait.copy)slideClosed(now,wait.copy,wait.from,wait.time);
  };
  const end=(id:string|number)=>play(String(id));
  tree.events.on("beforeExpand",start);tree.events.on("beforeCollapse",start);
  tree.events.on("afterExpand",end);tree.events.on("afterCollapse",end);
}

/**
 * Before the children of the open tree folder $id are replaced (loaded on expansion): returns `play`, to call after
 * the change, which slides the children list from its height now to its new one (`undefined` without motion).
 */
export function treeChildrenMotion(tree:Tree,id:string):(()=>void)|undefined{
  const time=motionTime(),item=treeItem(tree,id);
  if(!time||!item||!visible(item))return undefined;
  const list=childList(item),running=slides.get(item);
  const from=running?running.height():list&&visible(list)?list.getBoundingClientRect().height:0;
  return ()=>{
    const root=(tree as any).getRootNode?.() as HTMLElement|null|undefined;
    if(!root)return;
    const selector=`li[data-dhx-id="${CSS.escape(id)}"]`;
    // Started in the microtask of Suite's redraw of the new children, before that frame is painted.
    const watch=new MutationObserver(records=>{
      if(!records.some(record=>(record.target as Element).closest?.(selector)))return;
      watch.disconnect();clearTimeout(timer);
      slides.get(item)?.finish();
      const now=treeItem(tree,id);
      if(now&&visible(now))slideOpen(now,from,time);
    });
    watch.observe(root,{childList:true,subtree:true});
    const timer=setTimeout(()=>watch.disconnect(),500);
  };
}

import type { Row } from "../../api/types";

export type Branch={rows:Row[];cut:boolean};
export type TreeSnapshot={branches:[string,Branch][];closedBranches?:[string,Branch][];opened:string[];preferences:string;scrollTop:number};
type AccessChange="denied"|"changed"|"ended";
type Entry={resource:string;json:string};

const ENTRIES=4;
const CHARACTERS=262144;
const storageKey=()=>`blade-tree:1:${location.pathname}`;

/** Last completed Tree mounts, owned by one application shell. Serialized rows cannot be mutated by a consumer. */
export class TreeCache{
  private entries=new Map<string,Entry>();
  private access=new EventTarget();

  constructor(private context?:string){
    try{
      const key=storageKey(),json=sessionStorage.getItem(key);
      if(json===null)return;
      sessionStorage.removeItem(key);
      const navigation=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
      if(!context||navigation?.type!=="reload")return;
      const handoff=JSON.parse(json);
      if(handoff?.context!==context||!Array.isArray(handoff.entries)||handoff.entries.length>ENTRIES)return;
      for(const pair of handoff.entries){
        if(!Array.isArray(pair))continue;
        const [id,entry]=pair;
        if(typeof id==="string"&&typeof entry?.resource==="string"&&typeof entry.json==="string"&&entry.json.length<=CHARACTERS)
          this.entries.set(id,entry);
      }
    }catch{}
  }

  /** A one-use handoff to the next reload. While the page is open its snapshots stay in memory. */
  saveForReload():void{
    if(!this.context||!this.entries.size)return;
    try{sessionStorage.setItem(storageKey(),JSON.stringify({context:this.context,entries:[...this.entries]}));}catch{}
  }

  watch(resource:string,invalidate:(reason:AccessChange)=>void,signal:AbortSignal):void{
    this.access.addEventListener("change",event=>{
      const changed=(event as CustomEvent<{resource?:string;reason:AccessChange}>).detail;
      if(changed.resource===undefined||changed.resource===resource)invalidate(changed.reason);
    },{signal});
  }

  take(key:string,preferences:string):TreeSnapshot|undefined{
    const entry=this.entries.get(key);
    this.entries.delete(key);
    if(!entry)return;
    try{
      const snapshot=JSON.parse(entry.json) as TreeSnapshot;
      if(snapshot?.preferences!==preferences||!Array.isArray(snapshot.opened)||!Number.isFinite(snapshot.scrollTop))return;
      const valid=(pairs:TreeSnapshot["branches"])=>Array.isArray(pairs)&&pairs.every(pair=>
        Array.isArray(pair)&&typeof pair[0]==="string"&&Array.isArray(pair[1]?.rows)&&
        pair[1].rows.every(row=>typeof row?.id==="string"||typeof row?.id==="number"));
      if(!valid(snapshot.branches)||snapshot.branches[0]?.[0]!==""||(snapshot.closedBranches!==undefined&&!valid(snapshot.closedBranches)))return;
      return snapshot;
    }catch{}
  }

  store(key:string,resource:string,snapshot:TreeSnapshot):void{
    let json=JSON.stringify(snapshot);
    // Keep the visible frame first when optional closed branches would exceed the size limit.
    if(json.length>CHARACTERS&&snapshot.closedBranches)json=JSON.stringify({...snapshot,closedBranches:undefined});
    this.entries.delete(key);
    if(json.length>CHARACTERS)return;
    if(this.entries.size>=ENTRIES)this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key,{resource,json});
  }

  invalidate(resource?:string,reason:AccessChange="denied"):void{
    for(const [key,entry] of this.entries)if(resource===undefined||entry.resource===resource)this.entries.delete(key);
    this.access.dispatchEvent(new CustomEvent("change",{detail:{resource,reason}}));
  }
}

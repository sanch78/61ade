import type { Row } from "../../api/types";

export type Branch={rows:Row[];cut:boolean};
export type TreeSnapshot={branches:[string,Branch][];opened:string[];preferences:string};
type AccessChange="denied"|"changed"|"ended";

const ENTRIES=4;
const CHARACTERS=262144;

/** Last completed Tree mounts, owned by one application shell. Serialized rows cannot be mutated by a consumer. */
export class TreeCache{
  private entries=new Map<string,{resource:string;json:string}>();
  private access=new EventTarget();

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
    const snapshot=JSON.parse(entry.json) as TreeSnapshot;
    if(snapshot.preferences===preferences)return snapshot;
  }

  store(key:string,resource:string,snapshot:TreeSnapshot):void{
    const json=JSON.stringify(snapshot);
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

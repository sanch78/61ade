import { t } from "./I18n";
import { server } from "./api/Server";
export type LiveConfig={transport:"poll"|"websocket";endpoint:string;interval:number};
export type Row={id:string;revision?:string;_actions?:string[];_editable?:string[];_position?:Record<string,unknown>;[key:string]:unknown};
export type Snapshot={items:Row[];previous:string|null;next:string|null;version?:string;total?:number;matched?:number};
/** Live protocol version; live-server.mjs closes a different one with 4409 (docs/workspaces.md, live channel). */
export const LIVE_PROTOCOL=2;
const RELOAD="blade-live-reload",BATCH=64,BATCH_BYTES=48000;

/**
 * One live channel per tab, owned by AdminShell: one WebSocket (or one batched `__watch` poll per interval)
 * carries every list subscription of the page. Lists hold `Realtime` handles; no application transport code.
 */
export class LiveChannel {
  private socket?:WebSocket;
  private ready=false;
  private connected=0;
  private timer?:ReturnType<typeof setTimeout>;
  private handles=new Set<Realtime>();
  /** Wire id → handle; a new id per subscribe, so frames of a replaced query are dropped. */
  private wires=new Map<string,Realtime>();
  private sequence=0;
  private failures=0;
  /** closed: destroyed or unloaded; ended: session gone (lists revoked); stale: older page, lists stay without live data. */
  private closed=false;
  private ended=false;
  private stale=false;
  private busy=false;
  private again=false;
  private listeners=new AbortController();
  /**
   * notice: a shell-level hint (stale page); editing: an open form may hold unsaved input, so never reload over it;
   * ended: the session is gone (4401, `__ticket`/`__watch` 401/403), after the lists show the revoked state.
   */
  constructor(private config:LiveConfig,private hooks:{notice?:(text:string)=>void;editing?:()=>boolean;ended?:()=>void}={}){
    const signal=this.listeners.signal;
    // A hidden tab ends its subscriptions but keeps the socket; showing it subscribes again with fresh windows.
    document.addEventListener("visibilitychange",()=>{if(document.hidden)this.pause();else this.resume();},{signal});
    addEventListener("pagehide",()=>{this.pause();this.disconnect();},{signal});
    addEventListener("pageshow",event=>{if(event.persisted)this.resume();},{signal});
    this.resume();
  }
  /** Registers a handle; Workspace creates it through `new Realtime(channel, …)`. */
  attach(handle:Realtime):void{this.handles.add(handle);}
  detach(handle:Realtime):void{this.handles.delete(handle);this.drop(handle);}
  /** (Re)subscribes a handle with its current query. */
  open(handle:Realtime):void{
    if(this.closed||this.stale)return;
    if(this.ended){handle.blocked=true;handle.denied();return;}
    this.drop(handle);handle.wire=String(++this.sequence);this.wires.set(handle.wire,handle);
    if(this.config.transport==="poll"){if(this.busy)this.again=true;else this.schedule(0);return;}
    if(this.ready&&!document.hidden)this.send({type:"subscribe",id:handle.wire,resource:handle.resource,query:handle.query});
    else this.connect();
  }
  private get halted():boolean{return this.closed||this.ended||this.stale;}
  close():void{this.closed=true;this.listeners.abort();this.disconnect();this.handles.clear();this.wires.clear();}
  private drop(handle:Realtime):void{
    if(handle.wire===undefined)return;
    if(this.wires.get(handle.wire)===handle){this.wires.delete(handle.wire);if(this.ready)this.send({type:"unsubscribe",id:handle.wire});}
    handle.wire=undefined;
  }
  private send(message:object):void{if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  private active():Realtime[]{return [...this.handles].filter(handle=>handle.query&&!handle.blocked);}
  private pause():void{
    // A pending reconnect keeps its backoff; it connects once the tab is shown again.
    if(this.config.transport==="poll"){clearTimeout(this.timer);this.timer=undefined;}
    for(const handle of this.handles)this.drop(handle);
  }
  private resume():void{
    if(this.halted||document.hidden)return;
    if(this.config.transport==="poll"){for(const handle of this.active())if(handle.wire===undefined)this.open(handle);this.schedule(0);return;}
    if(!this.ready){this.connect();return;}
    for(const handle of this.active())this.open(handle);
  }
  private disconnect():void{const socket=this.socket;this.socket=undefined;this.ready=false;clearTimeout(this.timer);this.timer=undefined;socket?.close(1000);}
  private connect():void{
    if(this.halted||document.hidden||this.timer||this.socket)return;
    // A placeholder until the ticket arrives, so concurrent opens start one connection.
    const pending={readyState:WebSocket.CONNECTING,close(){}} as unknown as WebSocket;this.socket=pending;
    void this.request("__ticket",{}).then(result=>{
      if(this.socket!==pending)return;
      const endpoint=new URL(this.config.endpoint,location.href);
      if(endpoint.protocol==="https:")endpoint.protocol="wss:";
      if(endpoint.protocol==="http:")endpoint.protocol="ws:";
      const socket=new WebSocket(endpoint);this.socket=socket;
      socket.onopen=()=>{if(this.socket===socket)socket.send(JSON.stringify({type:"hello",protocol:LIVE_PROTOCOL,ticket:result.ticket}));};
      socket.onmessage=event=>{
        if(this.socket!==socket)return;
        let message:any;try{message=JSON.parse(event.data);}catch{socket.close();return;}
        if(message.type==="ready"){
          this.ready=true;this.connected=Date.now();
          try{sessionStorage.removeItem(RELOAD);}catch{}
          for(const handle of this.handles){handle.wire=undefined;handle.state(t("Élő kapcsolat"));}this.wires.clear();
          for(const handle of this.active())this.open(handle);
          return;
        }
        const handle=this.wires.get(String(message.id));if(!handle)return;
        if(message.type==="update"){this.failures=0;handle.apply(message);return;}
        if(message.type==="denied"){this.wires.delete(handle.wire!);handle.wire=undefined;handle.refuse(message.status);}
      };
      socket.onclose=event=>{
        if(this.socket!==socket)return;
        const authenticated=this.ready;this.socket=undefined;this.ready=false;
        for(const handle of this.handles)handle.wire=undefined;this.wires.clear();
        if(this.halted)return;
        if(authenticated&&Date.now()-this.connected>30000)this.failures=0;
        if(event.code===4409){this.reload();return;}
        // 4401 before `ready`: a fresh ticket was refused, the session is gone. After `ready` the ticket may only have
        // expired: one new ticket decides (`__ticket` answers 401/403 once the session ended).
        if(event.code===4401&&!authenticated){this.block();return;}
        this.retry();
      };
      socket.onerror=()=>socket.close();
    }).catch((e:any)=>{
      if(this.socket!==pending)return;
      this.socket=undefined;
      if(e.status===401||e.status===403)this.block();else this.retry();
    });
  }
  private retry():void{
    if(this.halted)return;
    for(const handle of this.handles)handle.state(t("Kapcsolódás…"));
    clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;this.connect();},Math.min(15000,500*2**this.failures++));
  }
  /** Session ended: every list shows the revoked state once; nothing reconnects. */
  private block():void{
    this.ended=true;this.disconnect();
    for(const handle of this.handles){handle.blocked=true;handle.wire=undefined;handle.state(t("A hozzáférés megszűnt"));handle.denied();}
    this.wires.clear();
    this.hooks.ended?.();
  }
  /**
   * 4409: this page speaks an older protocol than the server. One reload a minute at most, never a loop, and never
   * over an open form: then the lists keep working without live data and the shell shows the hint.
   */
  private reload():void{
    try{
      if(this.hooks.editing?.())throw new Error("editing");
      if(Date.now()-Number(sessionStorage.getItem(RELOAD)||0)<60000)throw new Error("reloaded");
      sessionStorage.setItem(RELOAD,String(Date.now()));
    }catch{
      this.stale=true;const text=t("Az élő követéshez töltse újra az oldalt.");
      for(const handle of this.handles){handle.wire=undefined;handle.state(text);}this.wires.clear();this.hooks.notice?.(text);return;
    }
    location.reload();
  }
  private schedule(delay:number):void{clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=undefined;void this.poll();},delay);}
  /** Polling: one `__watch` per interval for every subscription (split only above the request size limit). */
  private async poll():Promise<void>{
    if(this.halted||document.hidden)return;
    if(this.busy){this.again=true;return;}
    const entries=this.active().filter(handle=>handle.wire!==undefined).map(handle=>({handle,body:{id:handle.wire!,resource:handle.resource,query:handle.query,version:handle.version}}));
    if(!entries.length)return;
    this.busy=true;
    try{
      const batches:typeof entries[]=[[]],encoder=new TextEncoder();let bytes=0;
      for(const entry of entries){const size=encoder.encode(JSON.stringify(entry.body)).length;if(batches[0].length&&(batches[0].length>=BATCH||bytes+size>BATCH_BYTES)){batches.unshift([]);bytes=0;}batches[0].push(entry);bytes+=size;}
      // Each batch on its own: a failing one (5xx, 413, network) leaves the others of this interval running.
      for(const batch of batches.reverse()){
        let result:any;
        try{result=await this.request("__watch",{subscriptions:batch.map(entry=>entry.body)});}
        catch(e:any){
          if(e.status===401||e.status===403){this.block();return;}
          for(const {handle} of batch)handle.state(t("Kapcsolódás…"));continue;
        }
        if(this.halted)return;
        for(const answer of result?.results??[]){
          const handle=this.wires.get(String(answer.id));if(!handle)continue;
          if(answer.ok){if(answer.data.version!==handle.version){handle.version=answer.data.version;handle.update(answer.data);}handle.state(t("Automatikus követés"));}
          else if(answer.status>=500)handle.state(t("Kapcsolódás…"));
          else{this.wires.delete(handle.wire!);handle.wire=undefined;handle.refuse(answer.status);}
        }
      }
    }finally{
      this.busy=false;
      if(!this.halted&&!document.hidden){this.schedule(this.again?0:this.config.interval);this.again=false;}
    }
  }
  /** The page's JSON channel; `__ticket` and `__watch` belong to no single list (resource ""). */
  private request(action:string,values:Record<string,unknown>):Promise<any>{return server.call("",action,{values});}
}

/** A list's subscription on the shell's channel: `subscribe(query)` replaces it, `destroy()` ends it. */
export class Realtime {
  /** Channel state, not API. */
  wire?:string;
  query?:Record<string,unknown>;
  version="";
  blocked=false;
  private rows=new Map<string,Row>();
  constructor(private channel:LiveChannel,readonly resource:string,readonly update:(data:Snapshot)=>void,readonly state:(text:string)=>void,readonly denied:()=>void){channel.attach(this);}
  subscribe(query:Record<string,unknown>):void{this.blocked=false;this.query=query;this.version="";this.rows.clear();this.channel.open(this);}
  /** An update frame: the channel's server diff (order, changed rows, removed ids) applied to this window. */
  apply(message:any):void{
    for(const id of message.removed)this.rows.delete(id);
    for(const row of message.upserts)this.rows.set(String(row.id),row);
    const visible=new Set(message.order);for(const id of this.rows.keys())if(!visible.has(id))this.rows.delete(id);
    this.version=message.version;
    this.update({items:message.order.map((id:string)=>this.rows.get(id)).filter(Boolean),previous:message.previous,next:message.next,version:message.version,total:message.total,matched:message.matched});
  }
  /** `denied` of this subscription: 403/404 revoke the list; 429 (too many lists) only stops its live updates. */
  refuse(status:number):void{
    this.blocked=true;
    if(status===429)return;
    this.state(t("A hozzáférés megszűnt"));this.denied();
  }
  destroy():void{this.channel.detach(this);this.query=undefined;}
}

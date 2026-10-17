export type LiveConfig={transport:"poll"|"websocket";endpoint:string;interval:number};
export type Row={id:string;revision?:string;_actions?:string[];_editable?:string[];_position?:Record<string,unknown>;[key:string]:unknown};
export type Snapshot={items:Row[];previous:string|null;next:string|null;version?:string;total?:number;matched?:number};
type Call=(action:string,id?:string|null,values?:Record<string,unknown>)=>Promise<any>;

/** Shared subscription lifecycle: no application transport code and no manual refresh. */
export class Realtime {
  private socket?:WebSocket;
  private timer?:ReturnType<typeof setTimeout>;
  private ticket?:string;
  private version="";
  private rows=new Map<string,Row>();
  private query:Record<string,unknown>={};
  private disposed=false;
  private generation=0;
  private failures=0;
  private busy=false;
  private blocked=false;
  private listeners=new AbortController();
  constructor(private resource:string,private config:LiveConfig,private call:Call,private update:(data:Snapshot)=>void,private state:(text:string)=>void,private denied:()=>void){
    document.addEventListener("visibilitychange",()=>{if(document.hidden)this.stop();else this.start();},{signal:this.listeners.signal});
  }
  subscribe(query:Record<string,unknown>):void{
    this.blocked=false;this.query=query;this.version="";this.rows.clear();this.generation++;
    if(this.socket?.readyState===WebSocket.OPEN)this.send();else this.start();
  }
  private send():void{this.socket?.send(JSON.stringify({type:"subscribe",ticket:this.ticket,resource:this.resource,query:this.query,subscriptionId:this.generation}));}
  private start():void{
    if(this.disposed||document.hidden||this.blocked)return;
    if(this.config.transport==="poll"){if(!this.timer)void this.poll();return;}
    if(this.socket && this.socket.readyState<=WebSocket.OPEN)return;
    const generation=this.generation;
    void this.call("__ticket").then(result=>{
      if(this.disposed||document.hidden||generation!==this.generation)return;
      this.ticket=result.ticket;
      const endpoint=new URL(this.config.endpoint,location.href);
      if(endpoint.protocol==="https:")endpoint.protocol="wss:";
      if(endpoint.protocol==="http:")endpoint.protocol="ws:";
      const socket=new WebSocket(endpoint);this.socket=socket;
      socket.onopen=()=>{if(this.socket!==socket){socket.close();return;}this.failures=0;this.state("Élő kapcsolat");this.send();};
      socket.onmessage=event=>{
        try{
          if(this.socket!==socket)return;
          const message=JSON.parse(event.data);
          if(message.type==="error"){this.state(message.error);return;}
          if(message.type!=="update"||message.subscriptionId!==this.generation)return;
          for(const id of message.removed)this.rows.delete(id);
          for(const row of message.upserts)this.rows.set(String(row.id),row);
          const visible=new Set(message.order);for(const id of this.rows.keys())if(!visible.has(id))this.rows.delete(id);
          this.version=message.version;
          this.update({items:message.order.map((id:string)=>this.rows.get(id)).filter(Boolean),previous:message.previous,next:message.next,version:message.version,total:message.total,matched:message.matched});
        }catch{socket.close();}
      };
      socket.onclose=event=>{
        if(this.socket!==socket)return;
        this.socket=undefined;
        if(this.disposed||document.hidden||this.blocked)return;
        if(event.code===4403){this.blocked=true;this.state("A hozzáférés megszűnt");this.denied();return;}
        this.state("Kapcsolódás…");this.timer=setTimeout(()=>{this.timer=undefined;this.start();},Math.min(15000,500*2**this.failures++));
      };
      socket.onerror=()=>socket.close();
    }).catch((e:any)=>{if(e.status===401||e.status===403){this.blocked=true;this.denied();this.state("A hozzáférés megszűnt");return;}if(!this.disposed){this.state("Kapcsolódás…");this.timer=setTimeout(()=>{this.timer=undefined;this.start();},3000);}});
  }
  private async poll():Promise<void>{
    if(this.busy||this.disposed||document.hidden)return;
    const generation=this.generation;this.busy=true;
    try{
      const result=await this.call("__watch",null,{query:this.query,version:this.version});
      if(!this.disposed&&generation===this.generation){if(result.version!==this.version){this.version=result.version;this.update(result);}this.state("Automatikus követés");}
    }catch(e:any){if(e.status===401||e.status===403){this.blocked=true;this.denied();this.state("A hozzáférés megszűnt");}else if(!this.disposed)this.state("Kapcsolódás…");}
    finally{this.busy=false;if(!this.disposed&&!document.hidden&&!this.blocked)this.timer=setTimeout(()=>{this.timer=undefined;void this.poll();},this.config.interval);}
  }
  private stop():void{this.generation++;if(this.timer)clearTimeout(this.timer);this.timer=undefined;this.socket?.close();this.socket=undefined;}
  destroy():void{this.disposed=true;this.listeners.abort();this.stop();}
}

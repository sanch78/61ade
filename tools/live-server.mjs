// Source of packages/php/bin/live-server.mjs (tools/build.mjs); only the bundle runs, beside live-bridge.php.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFileSync,watchFile,unwatchFile} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
const origin=process.env.BLADE_LIVE_ORIGIN;
if(!origin)throw new Error('BLADE_LIVE_ORIGIN is required');
const interval=Math.max(500,Number(process.env.BLADE_LIVE_INTERVAL || 2000));
const pending=new Map();let requestId=0,bridge=null,quick=0,stopping=false;
// Exit 75: the bridge saw changed PHP. Respawn it and replay every unanswered request, so sockets stay open.
// A bridge that dies before answering anything (a half-written file at startup) is retried the same way; a serving
// bridge that crashes, or eight retries without an answer in between, fail the service (clients get 1012).
function startBridge(){
 const child=spawn(process.env.BLADE_PHP || 'php8.4',[fileURLToPath(new URL('live-bridge.php',import.meta.url))],{stdio:['pipe','pipe','inherit']});
 let served=false;bridge=child;child.stdin.on('error',()=>{});
 createInterface({input:child.stdout}).on('line',line=>{served=true;quick=0;try{const r=JSON.parse(line),p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timeout);p.resolve(r);}}catch{console.error('Invalid live worker response');}});
 // close, not exit: every answer the old bridge wrote has been read before the replay.
 child.on('close',(code,signal)=>{
  bridge=null;if(stopping)return;
  if(code!==75&&served){console.error('Live worker exited',code,signal);shutdown(1);return;}
  if(++quick>8){console.error('Live worker keeps failing',code,signal);shutdown(1);return;}
  console.error(code===75?'Live worker reloading after a PHP change':'Live worker failed to start, retrying',code,pending.size,'pending');
  // Even the first respawn waits, so a multi-file write can settle.
  setTimeout(()=>{if(stopping)return;startBridge();for(const p of pending.values())bridge.stdin.write(p.line);},Math.min(5000,150*2**quick));
 });
}
startBridge();
function read(request){
 if(pending.size>100)return Promise.reject(new Error('Live worker busy'));
 return new Promise((resolve,reject)=>{const id=++requestId,line=JSON.stringify({...request,id})+'\n';const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Live worker timeout'));},10000);pending.set(id,{resolve,reject,timeout,line});bridge?.stdin.write(line);});
}
const server=http.createServer((req,res)=>{res.writeHead(404);res.end();});
const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
 if(req.headers.origin!==origin || wss.clients.size>=100){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
// Protocol 2: one channel per browser tab carries many subscriptions (docs/workspaces.md#live-channel).
const PROTOCOL=2,SUBSCRIPTIONS=64,ROWS=2000,PER_CONNECTION=2,INFLIGHT=16;
// Fair bridge access: hello checks first, then subscription reads round-robin across connections, at most
// PER_CONNECTION in flight per connection and INFLIGHT overall (the bridge serializes them anyway), so no
// connection can fill the worker queue and starve another one's hello or updates.
const checks=[],ring=[];let inflight=0;
function pump(){
 while(inflight<INFLIGHT){
  const c=checks.shift();
  if(c){inflight++;read(c.request).then(c.resolve,c.reject).finally(()=>{inflight--;pump();});continue;}
  let job=null;
  for(let n=ring.length;n>0&&!job;n--){const next=ring.shift();ring.push(next);job=next();}
  if(!job)return;
  inflight++;job.finally(()=>{inflight--;pump();});
 }
}
const check=request=>new Promise((resolve,reject)=>{checks.push({request,resolve,reject});pump();});
// A list window's row count as the bridge reads it (ListSource: default 100, at most 600 in watch mode).
const rows=query=>Number.isSafeInteger(query.limit)?Math.min(600,Math.max(1,query.limit)):100;
wss.on('connection',(ws,req)=>{
 // The bridge picks the application from the path (LiveConfig applications).
 const path=new URL(req.url,'http://localhost').pathname;
 // The hello ticket is this connection's only credential: every bridge request of its subscriptions carries it,
 // and the bridge rechecks session, tenant and ACL per observation.
 let ticket=null,ready=false,alive=true,active=0,timer=null;
 // due: ids waiting for a read (a Set, so repeated ticks and subscribes on one id coalesce); busy: ids being read.
 const subscriptions=new Map(),due=new Set(),busy=new Set();
 const send=message=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));};
 const observe=async s=>{
  try{
   const r=await read({path,ticket,resource:s.resource,query:s.query,version:s.previous?.version || ''});
   if(subscriptions.get(s.id)!==s || ws.readyState!==WebSocket.OPEN)return;
   if(!r.ok){
    if(r.status===401){ws.close(4401,'Session expired');return;}
    // 5xx is transient: retry this subscription later; 4xx refuses this subscription only.
    if(!(r.status<500))throw new Error(r.error);
    subscriptions.delete(s.id);send({type:'denied',id:s.id,status:r.status,error:r.error});return;
   }
   s.failures=0;const data=r.data;
   if(data.version!==s.previous?.version){
    const old=new Map((s.previous?.items || []).map(row=>[String(row.id),JSON.stringify(row)]));
    const order=data.items.map(row=>String(row.id)),visible=new Set(order);
    send({type:'update',id:s.id,version:data.version,order,upserts:data.items.filter(row=>old.get(String(row.id))!==JSON.stringify(row)),removed:[...old.keys()].filter(id=>!visible.has(id)),previous:data.previous,next:data.next,total:data.total,matched:data.matched});s.previous=data;
   }
  }catch{s.retry=Date.now()+Math.min(30000,interval*2**s.failures++);}
 };
 // This connection's next read for pump(), or null.
 const next=()=>{
  if(!ready||active>=PER_CONNECTION||ws.readyState!==WebSocket.OPEN)return null;
  for(const id of due){
   if(busy.has(id))continue;
   due.delete(id);const s=subscriptions.get(id);
   if(!s||s.retry>Date.now())continue;
   active++;busy.add(id);
   return observe(s).finally(()=>{active--;busy.delete(id);});
  }
  return null;
 };
 const tick=()=>{for(const id of subscriptions.keys())due.add(id);pump();};
 const hello=msg=>{
  // An old page sends `subscribe` first: 4409 makes the new client reload; old clients just back off.
  if(msg.type!=='hello'||msg.protocol!==PROTOCOL){ws.close(4409,'Protocol '+PROTOCOL+' required');return;}
  if(typeof msg.ticket!=='string'||msg.ticket.length>128){ws.close(4401,'Authentication required');return;}
  ticket=msg.ticket;clearTimeout(authTimeout);
  check({path,ticket,check:true}).then(r=>{
   if(ws.readyState!==WebSocket.OPEN)return;
   if(!r.ok){ws.close(r.status>=500?1011:4401,r.status>=500?'Live service unavailable':'Authentication failed');return;}
   ready=true;ring.push(next);send({type:'ready',protocol:PROTOCOL});
   // Staggered: connections opened together do not tick together.
   timer=setTimeout(()=>{tick();timer=setInterval(tick,interval);},Math.random()*interval);
  },()=>{if(ws.readyState===WebSocket.OPEN)ws.close(1011,'Live service unavailable');});
 };
 ws.on('message',raw=>{
  let msg;try{msg=JSON.parse(raw.toString());}catch{msg=null;}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)){ws.close(1008,'Invalid message');return;}
  if(ticket===null){hello(msg);return;}
  const id=typeof msg.id==='string'||Number.isSafeInteger(msg.id)?String(msg.id):'';
  if(!ready||!id||id.length>64){ws.close(1008,ready?'Invalid subscription id':'Not ready');return;}
  if(msg.type==='unsubscribe'){subscriptions.delete(id);due.delete(id);return;}
  if(msg.type!=='subscribe'||typeof msg.resource!=='string'||msg.resource.length>128||!msg.query||typeof msg.query!=='object'||Array.isArray(msg.query)){ws.close(1008,'Invalid subscription');return;}
  if(!subscriptions.has(id)&&subscriptions.size>=SUBSCRIPTIONS){send({type:'denied',id,status:429,error:'Too many subscriptions'});return;}
  // Every subscription keeps its last window for the diff: the sum of their row limits is bounded per connection.
  let total=rows(msg.query);for(const [other,s] of subscriptions)if(other!==id)total+=rows(s.query);
  if(total>ROWS){subscriptions.delete(id);due.delete(id);send({type:'denied',id,status:429,error:'Row budget exceeded'});return;}
  // A new object: an answer for the replaced one is dropped; a read already running on this id finishes first.
  subscriptions.set(id,{id,resource:msg.resource,query:msg.query,previous:null,failures:0,retry:0});due.add(id);pump();
 });
 const authTimeout=setTimeout(()=>{if(ticket===null)ws.close(4401,'Authentication required');},10000);
 ws.on('pong',()=>{alive=true;});
 const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;ws.ping();},30000);
 ws.on('close',()=>{clearTimeout(timer);clearInterval(timer);clearInterval(heartbeat);clearTimeout(authTimeout);subscriptions.clear();due.clear();const i=ring.indexOf(next);if(i>=0)ring.splice(i,1);});
});
server.listen(Number(process.env.BLADE_LIVE_PORT || 8088),'127.0.0.1',()=>console.log('61ade live transport ready'));
function shutdown(code=0){if(stopping)return;stopping=true;process.exitCode=code;unwatchFile(self);for(const ws of wss.clients)ws.close(code?1012:1001,'Restart');server.close();bridge?.kill();setTimeout(()=>process.exit(code),1000).unref();}
process.on('SIGTERM',()=>shutdown());process.on('SIGINT',()=>shutdown());
// A rebuilt bundle closes clients with 1012 and exits non-zero; the supervisor (restart on failure) starts it.
// Content, not mtime: a build that rewrites an identical bundle restarts nothing.
const self=fileURLToPath(import.meta.url),source=readFileSync(self,'utf8');
watchFile(self,{interval:2000},()=>{let now;try{now=readFileSync(self,'utf8');}catch{return;}if(now!==source){console.error('Live server bundle changed, exiting for restart');shutdown(1);}});

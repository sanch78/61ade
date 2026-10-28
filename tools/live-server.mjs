// Source of packages/php/bin/live-server.mjs (tools/build.mjs); only the bundle runs, beside live-bridge.php.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
const origin=process.env.BLADE_LIVE_ORIGIN;
if(!origin)throw new Error('BLADE_LIVE_ORIGIN is required');
const interval=Math.max(500,Number(process.env.BLADE_LIVE_INTERVAL || 2000));
const bridge=spawn(process.env.BLADE_PHP || 'php8.4',[fileURLToPath(new URL('live-bridge.php',import.meta.url))],{stdio:['pipe','pipe','inherit']});
const pending=new Map();let requestId=0;
createInterface({input:bridge.stdout}).on('line',line=>{try{const r=JSON.parse(line),p=pending.get(r.id);if(p){pending.delete(r.id);clearTimeout(p.timeout);p.resolve(r);}}catch{console.error('Invalid live worker response');}});
bridge.on('exit',(code,signal)=>{console.error('Live worker exited',code,signal);process.exit(1);});
function read(request){
 if(pending.size>100)return Promise.reject(new Error('Live worker busy'));
 return new Promise((resolve,reject)=>{const id=++requestId;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Live worker timeout'));},10000);pending.set(id,{resolve,reject,timeout});bridge.stdin.write(JSON.stringify({...request,id})+'\n');});
}
const server=http.createServer((req,res)=>{res.writeHead(404);res.end();});
const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
 if(req.headers.origin!==origin || wss.clients.size>=100){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
 let subscription=null,previous=null,busy=false,alive=true,epoch=0;
 const tick=async()=>{
  if(!subscription||busy||ws.readyState!==WebSocket.OPEN)return;
  busy=true;const generation=epoch;
  try{
   const r=await read({...subscription,version:previous?.version || ''});
   if(generation!==epoch || ws.readyState!==WebSocket.OPEN)return;
   if(!r.ok){ws.send(JSON.stringify({type:'error',error:r.error,status:r.status}));ws.close(r.status===401?4401:4403);return;}
   const data=r.data;
   if(data.version!==previous?.version){
    const old=new Map((previous?.items || []).map(row=>[String(row.id),JSON.stringify(row)]));
    const order=data.items.map(row=>String(row.id));
    ws.send(JSON.stringify({type:'update',subscriptionId:subscription.subscriptionId,version:data.version,order,upserts:data.items.filter(row=>old.get(String(row.id))!==JSON.stringify(row)),removed:[...old.keys()].filter(id=>!order.includes(id)),previous:data.previous,next:data.next,total:data.total,matched:data.matched}));previous=data;
   }
  }catch{if(ws.readyState===WebSocket.OPEN)ws.close(1011,'Live service unavailable');}
  finally{busy=false;}
 };
 ws.on('message',raw=>{
  try{const msg=JSON.parse(raw.toString());if(msg.type!=='subscribe'||typeof msg.ticket!=='string'||typeof msg.resource!=='string'||!msg.query||typeof msg.query!=='object')throw Error();subscription={ticket:msg.ticket,resource:msg.resource,query:msg.query,subscriptionId:msg.subscriptionId};previous=null;epoch++;void tick();}catch{ws.close(1008,'Invalid subscription');}
 });
 const timer=setInterval(()=>void tick(),interval);
 const authTimeout=setTimeout(()=>{if(!subscription)ws.close(4401,'Authentication required');},10000);
 ws.on('pong',()=>{alive=true;});
 const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;ws.ping();},30000);
 ws.on('close',()=>{clearInterval(timer);clearInterval(heartbeat);clearTimeout(authTimeout);epoch++;});
});
server.listen(Number(process.env.BLADE_LIVE_PORT || 8088),'127.0.0.1',()=>console.log('61de live transport ready'));
function shutdown(){for(const ws of wss.clients)ws.close(1001,'Restart');server.close();bridge.kill();setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

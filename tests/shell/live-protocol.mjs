// Live channel protocol 2 against the bundled server (run `node tools/build.mjs` first): node tests/shell/live-protocol.mjs
// Starts packages/php/bin/live-server.mjs on a free loopback port over a throw-away demo instance in tmp/.
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,readdirSync,unlinkSync} from 'node:fs';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const {WebSocket}=createRequire(root+'package.json')('ws');
const php=process.env.BLADE_PHP || 'php8.4',demo=root+'examples/demo-app/';
mkdirSync(root+'tmp',{recursive:true});
const tmp=mkdtempSync(root+'tmp/live-protocol-'),instance='proto';
const env={...process.env,BLADE_TMP_DIR:tmp,BLADE_DEMO_INSTANCE:instance,BLADE_DEMO_LIVE_ENDPOINT:'ws://127.0.0.1/live'};
let server,passed=0;
const check=(ok,label)=>{if(!ok)throw new Error('FAIL '+label);passed++;console.log('ok',label);};
const runPhp=(code,...args)=>execFileSync(php,['-r',code,...args],{env,cwd:root,encoding:'utf8'});
// A signed-in session of <application>-application.php and its live ticket, as `__ticket` issues them.
const ticket=(email,application='admin')=>runPhp(`require '${demo}vendor/autoload.php';$app=require '${demo}'.$argv[2].'-application.php';$id=$app->identities->authenticate($argv[1],'61ade-demo');
@mkdir($app->runtime.'/sessions',0700,true);session_name($app->sessionName);session_save_path($app->runtime.'/sessions');ini_set('session.use_cookies','0');
session_start();$_SESSION=['identity'=>$id->id,'lastSeen'=>time(),'credentialVersion'=>$app->workspace->version($id->id)];$sid=session_id();session_write_close();echo Blade\\Live\\Tickets::issue($app->runtime,$sid);`,email,application).trim();
const rename=title=>runPhp(`$db=new PDO('sqlite:${tmp}/${instance}/admin.sqlite');$db->prepare('UPDATE accounts SET display_name=? WHERE id=1')->execute([$argv[1]]);`,title);
const port=await new Promise(resolve=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
// One client: collects frames, resolves waits on predicates, records the close code.
function connect(path='/live/admin'){
 const ws=new WebSocket(`ws://127.0.0.1:${port}${path}`,{headers:{Origin:'http://localhost'}}),frames=[],waits=[];
 const c={ws,frames,code:null,
  send:m=>ws.send(JSON.stringify(m)),
  wait:(predicate,ms=8000,label='frame')=>new Promise((resolve,reject)=>{const hit=frames.find(predicate);if(hit)return resolve(hit);const w={predicate,resolve,timer:setTimeout(()=>reject(new Error('Timeout waiting for '+label)),ms)};waits.push(w);}),
  closed:new Promise(resolve=>ws.on('close',code=>{c.code=code;resolve(code);})),
  opened:new Promise((resolve,reject)=>{ws.on('open',resolve);ws.on('error',reject);})};
 ws.on('message',raw=>{const m=JSON.parse(raw.toString());frames.push(m);for(const w of [...waits])if(w.predicate(m)){clearTimeout(w.timer);waits.splice(waits.indexOf(w),1);w.resolve(m);}});
 return c;
}
const quiet=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function hello(c,t){await c.opened;c.send({type:'hello',protocol:2,ticket:t});return c.wait(m=>m.type==='ready',8000,'ready');}
try{
 execFileSync(php,[demo+'setup-workspace.php'],{env,cwd:root,stdio:'ignore'});
 runPhp(`require '${demo}vendor/autoload.php';require_once '${demo}common.php';blade_demo_accounts(blade_demo_db('admin'),[[2,'plain@example.test','61ade-demo','Plain',1,0]]);`);
 server=spawn('node',[process.env.BLADE_LIVE_SERVER || root+'packages/php/bin/live-server.mjs'],{env:{...env,BLADE_LIVE_PORT:String(port),BLADE_LIVE_ORIGIN:'http://localhost',BLADE_AUTOLOAD_FILE:demo+'vendor/autoload.php',BLADE_APPLICATION_FILE:demo+'application.php',BLADE_PHP:php,BLADE_LIVE_INTERVAL:'700'},stdio:['ignore','pipe','inherit']});
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('ready'))resolve();});server.on('exit',code=>reject(new Error('Server exited '+code)));});
 const admin=ticket('demo@example.test');

 const a=connect();const ready=await hello(a,admin);
 check(ready.protocol===2,'hello → ready {protocol: 2}');
 for(const [id,resource] of [['a','blade_users'],['b','blade_users'],['c','blade_roles'],['x','no_such_list']])a.send({type:'subscribe',id,resource,query:{}});
 const first=await Promise.all(['a','b','c'].map(id=>a.wait(m=>m.type==='update'&&m.id===id,8000,'update '+id)));
 check(first.every(m=>Array.isArray(m.order)&&m.order.length>0&&typeof m.version==='string'),'three subscriptions on one connection get their first update');
 const denied=await a.wait(m=>m.type==='denied'&&m.id==='x',8000,'denied x');
 check(denied.status===404&&a.ws.readyState===WebSocket.OPEN,'unknown list → denied {status: 404}, channel stays open');
 let name='Live A '+Date.now();rename(name);
 await Promise.all(['a','b'].map(id=>a.wait(m=>m.type==='update'&&m.id===id&&m.upserts.some(r=>JSON.stringify(r).includes(name)),8000,'write on '+id)));
 check(true,'an external write reaches both subscriptions as update frames');
 check(!a.frames.some(m=>m.id==='x'&&m.type==='update'),'the denied subscription gets no updates');
 a.send({type:'unsubscribe',id:'b'});await quiet(300);const mark=a.frames.length;
 name='Live B '+Date.now();rename(name);
 await a.wait(m=>m.type==='update'&&m.id==='a'&&m.upserts.some(r=>JSON.stringify(r).includes(name)),8000,'write after unsubscribe');
 await quiet(1600);
 check(!a.frames.slice(mark).some(m=>m.id==='b'),'unsubscribe stops subscription b while a keeps updating');
 // Replacing a subscription id restarts it: a full first window for the new query.
 a.send({type:'subscribe',id:'c',resource:'blade_users',query:{}});
 const replaced=await a.wait(m=>m.type==='update'&&m.id==='c'&&m.upserts.some(r=>JSON.stringify(r).includes(name)),8000,'replaced c');
 check(replaced.order.length===replaced.upserts.length,'subscribe on an existing id replaces it with a full window');

 // A tenant-scoped list without an active tenant fails closed (403); the global list beside it keeps working.
 const plain=connect('/live/tenants');await hello(plain,ticket('none@example.test','tenant'));
 plain.send({type:'subscribe',id:1,resource:'tenant_projects',query:{}});plain.send({type:'subscribe',id:2,resource:'tenant_notices',query:{}});
 const refused=await plain.wait(m=>m.type==='denied',8000,'tenant denied');
 check(refused.id==='1'&&refused.status===403&&plain.ws.readyState===WebSocket.OPEN,'tenant-scoped list without a tenant → denied {status: 403}, channel open');
 const notices=await plain.wait(m=>m.type==='update'&&m.id==='2',8000,'tenant_notices');
 check(notices.order.length>0,'the other subscription of that connection still gets its update');
 plain.ws.close();

 const bad=connect();await bad.opened;bad.send({type:'hello',protocol:2,ticket:'f'.repeat(64)});
 check(await bad.closed===4401,'unknown ticket → close 4401');
 const cross=connect('/live');await cross.opened;cross.send({type:'hello',protocol:2,ticket:admin});
 check(await cross.closed===4401,"another application's ticket → close 4401");
 const old=connect();await old.opened;old.send({type:'hello',protocol:1,ticket:admin});
 check(await old.closed===4409,'protocol 1 hello → close 4409');
 const legacy=connect();await legacy.opened;legacy.send({type:'subscribe',ticket:admin,resource:'blade_users',query:{},subscriptionId:1});
 check(await legacy.closed===4409,'a protocol 1 page (subscribe first) → close 4409');
 const early=connect();await early.opened;early.send({type:'hello',protocol:2,ticket:admin});early.send({type:'subscribe',id:'1',resource:'blade_users',query:{}});
 check(await early.closed===1008,'subscribe before ready → close 1008');

 const many=connect();await hello(many,admin);
 for(let i=1;i<=65;i++)many.send({type:'subscribe',id:'s'+i,resource:'blade_roles',query:{limit:1}});
 const limit=await many.wait(m=>m.type==='denied',8000,'limit denial');
 check(limit.id==='s65'&&limit.status===429,'the 65th subscription → denied {status: 429}');
 many.send({type:'subscribe',id:'s1',resource:'blade_roles',query:{limit:1}});many.send({type:'unsubscribe',id:'s2'});many.send({type:'subscribe',id:'s66',resource:'blade_roles',query:{limit:1}});
 await many.wait(m=>m.type==='update'&&m.id==='s66',8000,'s66 after a freed slot');
 check(many.frames.filter(m=>m.type==='denied').length===1,'replacing an id or a freed slot stays within the limit');
 many.ws.close();

 // A sustained flood on one connection (50 subscribes on one id every 10 ms, 300 new ids) must not starve
 // another connection's hello or updates.
 const flood=connect();await hello(flood,admin);
 const same=()=>flood.send({type:'subscribe',id:'same',resource:'blade_users',query:{}});same();
 for(let i=1;i<=300;i++)flood.send({type:'subscribe',id:'f'+i,resource:'blade_roles',query:{limit:1}});
 const storm=setInterval(()=>{for(let i=0;i<50;i++)same();},10);
 await quiet(300);
 try{
  const other=connect();await hello(other,admin);
  check(true,'hello of another connection during a flood → ready');
  other.send({type:'subscribe',id:'o',resource:'blade_users',query:{}});
  await other.wait(m=>m.type==='update'&&m.id==='o',8000,'update during flood');
  check(true,'another connection gets its update during the flood');
  other.ws.close();
 }finally{clearInterval(storm);}
 await flood.wait(m=>m.type==='update'&&m.id==='same',8000,'coalesced id');
 check(flood.frames.filter(m=>m.type==='denied'&&m.status===429).length===300-63,'the flood is capped at 64 subscriptions (429 for the rest)');
 flood.ws.close();
 // Row budget: the sum of the subscriptions' limits (default 100, at most 600) is at most 2000 per connection.
 const rich=connect();await hello(rich,admin);
 for(const id of ['r1','r2','r3','r4'])rich.send({type:'subscribe',id,resource:'blade_users',query:{limit:600}});
 const budget=await rich.wait(m=>m.type==='denied',8000,'budget');
 check(budget.id==='r4'&&budget.status===429&&budget.error==='Row budget exceeded','a subscription beyond 2000 rows per connection → denied 429');
 rich.send({type:'subscribe',id:'r5',resource:'blade_users',query:{limit:200}});
 await rich.wait(m=>m.type==='update'&&m.id==='r5',8000,'r5 within budget');
 check(true,'a subscription within the remaining budget is served');
 rich.ws.close();

 // The bridge rechecks the session on every observation: a removed session closes the whole channel.
 const sessions=`${tmp}/${instance}/admin/sessions`;for(const f of readdirSync(sessions))unlinkSync(`${sessions}/${f}`);
 check(await a.closed===4401,'session removed → the open channel closes with 4401');
 console.log(`PASS live-protocol: ${passed} checks`);
}catch(e){console.error(e);process.exitCode=1;}
finally{server?.kill();await quiet(300);rmSync(tmp,{recursive:true,force:true});process.exit();}

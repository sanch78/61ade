<?php
declare(strict_types=1);
// Long-running jobs (docs/workspaces.md#jobs): job actions, the JobQueue runner and the `__job` reads (status, find,
// running, cancel) with their ACL, idempotent starts, resumption from a checkpoint and a consumer's own JobSource.
require dirname(__DIR__,2).'/examples/demo-app/vendor/autoload.php';
use Blade\Feature\{Action,Context,Failure,Field,Registry,SqlResource,Workspace};
use Blade\Jobs\{Job,JobQueue,JobSource,Jobs};
use Blade\Shell\{Identity,IdentityProvider};
function verify(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
function status(callable $run):int{try{$run();return 200;}catch(Failure $e){return $e->status;}}

$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);Blade\Access\Schema::install($db);JobQueue::install($db);JobQueue::install($db);
$db->exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, owner_id TEXT)');$db->exec("INSERT INTO items(title,owner_id) VALUES ('One','1'),('Two','2')");
/** A consumer's own engine: jobs in memory, finished at once. */
final class Engine implements JobSource
{
    public array $jobs=[];public bool $broken=false;
    public function start(Context $ctx,Action $action,array $target,array $values,string $token):string{foreach($this->jobs as $id=>$job)if($job['token']===$token&&$job['actor']===$ctx->actor->id)return $id;$id='e'.(count($this->jobs)+1);$this->jobs[$id]=['token'=>$token,'actor'=>$ctx->actor->id,'values'=>$values];return $id;}
    public function status(Context $ctx,string $id,int $after=0):?array{$job=$this->jobs[$id]??null;if(!$job||$job['actor']!==$ctx->actor->id)return null;return $this->broken?['id'=>$id,'resource'=>'reports','action'=>'external','state'=>'busy']:['id'=>$id,'resource'=>'reports','action'=>'external','state'=>'done','log'=>[],'logNext'=>0,'result'=>['rows'=>count($job['values'])],'cancel'=>true];}
    public function find(Context $ctx,string $token):?string{foreach($this->jobs as $id=>$job)if($job['token']===$token&&$job['actor']===$ctx->actor->id)return $id;return null;}
    public function running(Context $ctx):array{return [];}
    public function cancel(Context $ctx,string $id):bool{return false;}
}
/** The accounts: 1 and 2 are active; `$disabled` ones are not found. */
final class Accounts implements IdentityProvider
{
    public array $disabled=[];
    public function authenticate(string $username,#[\SensitiveParameter] string $password):?Identity{return null;}
    public function find(string $id):?Identity{return in_array($id,['1','2'],true)&&!in_array($id,$this->disabled,true)?new Identity($id,'User '.$id):null;}
}
$accounts=new Accounts();
$registry=new Registry();
(new SqlResource('items','items','id',[new Field('title','Title')],'owner_id'))->register($registry,'Items');
$seen=[];$hook=null;
$registry->add(new Action('items','rebuild','Rebuild',[new Field('depth','Depth','number')],function(Context $ctx,array $target,array $values,Job $job)use(&$seen,&$hook):?array{
    $seen[]=['actor'=>$ctx->actor->id,'target'=>$target['id'],'values'=>$values,'checkpoint'=>$job->checkpoint()];
    $from=($job->checkpoint()['done']??0)+1;
    for($i=$from;$i<=3;$i++){
        if($hook)($hook)($i);
        if($job->cancelled()){$job->log('Stopped.','warning');return null;}
        $job->step($i,3);$job->stage("Step $i");$job->progress($i*100/3);$job->log("Step $i done.");$job->checkpoint(['done'=>$i]);
    }
    return ['reveal'=>['label'=>'Rebuild','value'=>$target['row']['title']]];
},resolve:fn($c,$id)=>$GLOBALS['items']->target($c,$id),write:true,job:true,heartbeat:20));
$GLOBALS['items']=new SqlResource('items','items','id',[new Field('title','Title')],'owner_id');
$registry->add(new Action('reports','export','Export',[new Field('format','Format','select',options:['csv'=>'CSV'])],fn(Context $c,array $t,array $v,Job $job)=>throw new Failure('Az export nem sikerült.'),job:true));
$registry->add(new Action('reports','crash','Crash',[],fn()=>throw new RuntimeException('internal detail'),job:true));
$engine=new Engine();
$registry->add(new Action('reports','external','External',[new Field('format','Format')],fn()=>throw new LogicException('not called'),job:$engine));
$registry->add(new Action('reports','apionly','API only',[],fn(Context $c,array $t,array $v,Job $job)=>['channel'=>$c->channel],channels:['api'],job:true));
$registry->add(new Action('reports','guarded','Guarded',[],fn(Context $c,array $t,array $v,Job $job)=>['object'=>$t['acl_id']],resolve:fn($c,$id)=>['id'=>$id,'owner'=>null,'acl_id'=>'obj-'.$id],job:true));
$registry->add(new Action('reports','open','Open transaction',[],function(Context $c,array $t,array $v,Job $job){$c->db->beginTransaction();return ['x'=>1];},job:true));
$registry->add(new Action('reports','late','Late',[],function(Context $c,array $t,array $v,Job $job){$GLOBALS['w']->jobReads->handle($c,'reports',['operation'=>'cancel','action'=>'late','id'=>$job->id]);return ['finished'=>true];},job:true));
$registry->appendViewActions('items',['rebuild']);
$w=$GLOBALS['w']=new Workspace($registry,$db);
$rule=$db->prepare("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user',?,?,?,'ui','allow',?,'','')");
foreach(['list','get','rebuild'] as $a)$rule->execute(['1','items',$a,'own']);
foreach(['export','crash','external','open','late'] as $a)$rule->execute(['1','reports',$a,'all']);
$db->exec("INSERT INTO blade_rules(subject_type,subject_id,resource,action,channel,effect,scope,object_id,field_name) VALUES ('user','1','reports','apionly','api','allow','all','',''),('user','1','reports','guarded','ui','allow','id','obj-7','')");
$rule->execute(['2','items','rebuild','all']);
$one=new Identity('1','One');$ctx=new Context($one,'ui',$w->acl,$db);
$two=new Context(new Identity('2','Two'),'ui',$w->acl,$db);
$jobs=fn(Context $c,string $resource,array $values)=>$w->jobReads->handle($c,$resource,$values);
$audits=fn(string $action)=>(int)$db->query("SELECT COUNT(*) FROM blade_audit WHERE action=".$db->quote($action))->fetchColumn();

// Start: an ordinary checked action that answers the job; the same token answers the same job.
$token=str_repeat('a',32);
$started=$w->executor->execute($ctx,'items','rebuild','1',['depth'=>'2'],token:$token);
$id=$started['job']['id'];
verify($started['job']===['id'=>$id,'resource'=>'items','action'=>'rebuild']&&$seen===[],'A job action answers its job without running the body');
verify($w->executor->execute($ctx,'items','rebuild','1',['depth'=>'2'],token:$token)['job']['id']===$id&&(int)$db->query('SELECT COUNT(*) FROM blade_jobs')->fetchColumn()===1,'The same token answers the same job');
verify(status(fn()=>$w->executor->execute($ctx,'reports','export',null,['format'=>'csv'],token:$token))===409,'A token of another action is refused');
verify(status(fn()=>$w->executor->execute($ctx,'items','rebuild','1',[],token:'short'))===400,'A malformed token is refused');
$db->exec("INSERT INTO items(title,owner_id) VALUES ('Three','1')");
verify(status(fn()=>$w->executor->execute($ctx,'items','rebuild','3',[],token:$token))===409,'A token of another target is refused');
verify(status(fn()=>$w->executor->execute($ctx,'items','rebuild','2',[],token:str_repeat('b',32)))===403,'The start is checked like any action (another owner\'s record)');
verify(status(fn()=>$w->executor->execute($ctx,'items','rebuild','1',['depth'=>'x'],token:str_repeat('c',32)))===400,'The start validates its fields');
verify($audits('rebuild')>=2,'Each start is journaled');

// Reads: status, find and running, for the actor only and with the action's ACL.
$queued=$jobs($ctx,'items',['operation'=>'status','action'=>'rebuild','id'=>$id]);
verify($queued['state']==='queued'&&$queued['cancel']===true&&$queued['heartbeatAfter']===20&&$queued['log']===[]&&!isset($queued['target']),'A queued job is read');
verify($jobs($ctx,'items',['operation'=>'find','action'=>'rebuild','token'=>$token])['job']['id']===$id&&$jobs($ctx,'items',['operation'=>'find','action'=>'rebuild','token'=>str_repeat('z',32)])['job']===null,'A lost start is found by its token');
verify($jobs($ctx,'',['operation'=>'running'])['jobs']===[['id'=>$id,'resource'=>'items','action'=>'rebuild']],'The actor\'s running jobs are listed');
verify(status(fn()=>$jobs($two,'items',['operation'=>'status','action'=>'rebuild','id'=>$id]))===404&&$jobs($two,'',['operation'=>'running'])['jobs']===[]&&$jobs($two,'items',['operation'=>'find','action'=>'rebuild','token'=>$token])['job']===null,'Another actor sees nothing of the job');
foreach([['operation'=>'status','action'=>'rebuild'],['operation'=>'status','action'=>'rebuild','id'=>$id,'after'=>-1],['operation'=>'nope'],['operation'=>'running','x'=>1],['operation'=>'find','action'=>'rebuild','token'=>'x']] as $bad)verify(status(fn()=>$jobs($ctx,'items',$bad))===400,'Malformed job read refused: '.json_encode($bad));
verify(status(fn()=>$jobs($ctx,'items',['operation'=>'status','action'=>'list','id'=>$id]))===404,'Only a job action has job reads');

// Run: the body gets the actor's context, the target and the values; reports reach the status.
verify($w->jobs->run($w,$accounts)===1,'The runner runs the queued job');
$done=$jobs($ctx,'items',['operation'=>'status','action'=>'rebuild','id'=>$id]);
verify($seen[0]===['actor'=>'1','target'=>'1','values'=>['depth'=>'2'],'checkpoint'=>null],'The body gets the actor, target and values');
verify($done['state']==='done'&&$done['step']===['index'=>3,'count'=>3]&&$done['percent']===100.0&&$done['stage']==='Step 3'&&count($done['log'])===3&&$done['logNext']===3&&$done['result']['reveal']['value']==='One'&&$done['cancel']===false&&isset($done['finished']),'A finished job reports its steps, log and result');
verify(array_column($jobs($ctx,'items',['operation'=>'status','action'=>'rebuild','id'=>$id,'after'=>2])['log'],'text')===['Step 3 done.'],'The log is read from a line');
verify($jobs($ctx,'',['operation'=>'running'])['jobs']===[]&&$audits('job_done')===1,'A finished job is no longer running and is journaled');
verify($w->jobs->run($w,$accounts)===0,'Nothing is run twice');

// Resumption: an abandoned job runs again from its checkpoint; after three attempts it fails.
$again=$w->executor->execute($ctx,'items','rebuild','1',[],token:str_repeat('d',32))['job']['id'];
$db->prepare("UPDATE blade_jobs SET state='running', attempts=1, heartbeat_at='2000-01-01T00:00:00Z', checkpoint='{\"done\":2}' WHERE id=?")->execute([$again]);
$seen=[];$w->jobs->run($w,$accounts);
verify($seen[0]['checkpoint']===['done'=>2]&&count(array_filter(array_column($jobs($ctx,'items',['operation'=>'status','action'=>'rebuild','id'=>$again])['log'],'text'),fn($t)=>str_starts_with($t,'Step')))===1,'An abandoned job resumes from its checkpoint');
$dead=$w->executor->execute($ctx,'items','rebuild','1',[],token:str_repeat('e',32))['job']['id'];
$db->prepare("UPDATE blade_jobs SET state='running', attempts=3, heartbeat_at='2000-01-01T00:00:00Z' WHERE id=?")->execute([$dead]);
$seen=[];$w->jobs->run($w,$accounts);
verify($seen===[]&&$jobs($ctx,'items',['operation'=>'status','action'=>'rebuild','id'=>$dead])['error']==='A feladat megszakadt.','A job abandoned three times fails');
$fresh=$w->executor->execute($ctx,'items','rebuild','1',[],token:str_repeat('f',32))['job']['id'];
$db->prepare("UPDATE blade_jobs SET state='running', attempts=1, heartbeat_at=? WHERE id=?")->execute([gmdate('Y-m-d\TH:i:s\Z',time()-60),$fresh]);
verify($w->jobs->run($w,$accounts,[$fresh])===0,'A running job with a recent heartbeat is not taken over');
$db->prepare("UPDATE blade_jobs SET state='done' WHERE id=?")->execute([$fresh]);

// Cancel: a queued job never starts; a running one stops at its next check.
$waiting=$w->executor->execute($ctx,'items','rebuild','1',[],token:str_repeat('g',32))['job']['id'];
verify($jobs($ctx,'items',['operation'=>'cancel','action'=>'rebuild','id'=>$waiting])===['cancelled'=>true]&&$jobs($ctx,'items',['operation'=>'status','action'=>'rebuild','id'=>$waiting])['state']==='cancelled','A queued job is cancelled');
$seen=[];verify($w->jobs->run($w,$accounts)===0&&$seen===[],'A cancelled job never runs');
verify($jobs($ctx,'items',['operation'=>'cancel','action'=>'rebuild','id'=>$waiting])===['cancelled'=>false],'A finished job cannot be cancelled');
verify(status(fn()=>$jobs($two,'items',['operation'=>'cancel','action'=>'rebuild','id'=>$waiting]))===404,'Another actor cannot cancel it');
$stopping=$w->executor->execute($ctx,'items','rebuild','1',[],token:str_repeat('h',32))['job']['id'];
$hook=function(int $step)use($w,$ctx,$stopping){if($step===2)$w->jobReads->handle($ctx,'items',['operation'=>'cancel','action'=>'rebuild','id'=>$stopping]);};
$w->jobs->run($w,$accounts);$hook=null;
$stopped=$jobs($ctx,'items',['operation'=>'status','action'=>'rebuild','id'=>$stopping]);
verify($stopped['state']==='cancelled'&&end($stopped['log'])['text']==='Stopped.'&&$stopped['step']['index']===1,'A running job stops at its next cancelled() check');

// Failures: a Failure's message reaches the status, any other error a generic one; a revoked right fails the run.
$export=$w->executor->execute($ctx,'reports','export',null,['format'=>'csv'],token:str_repeat('i',32))['job']['id'];
$crash=$w->executor->execute($ctx,'reports','crash',null,[],token:str_repeat('j',32))['job']['id'];
ini_set('error_log','/dev/null');$w->jobs->run($w,$accounts);
verify($jobs($ctx,'reports',['operation'=>'status','action'=>'export','id'=>$export])['error']==='Az export nem sikerült.'&&$jobs($ctx,'reports',['operation'=>'status','action'=>'crash','id'=>$crash])['error']==='A feladat nem sikerült.','Failures are reported without internals');
$revoked=$w->executor->execute($ctx,'reports','export',null,['format'=>'csv'],token:str_repeat('k',32))['job']['id'];
$db->exec("DELETE FROM blade_rules WHERE resource='reports' AND action='export'");$w->acl->invalidate();
$w->jobs->run($w,$accounts);
$row=$db->query("SELECT state, error FROM blade_jobs WHERE id=".$db->quote($revoked))->fetch(PDO::FETCH_ASSOC);
verify($row===['state'=>'failed','error'=>'Nincs hozzáférés.'],'A right revoked before the run fails the job');
verify(status(fn()=>$jobs($ctx,'reports',['operation'=>'status','action'=>'export','id'=>$revoked]))===404,'Without the action\'s right the job is not read');

// A consumer's own engine: start() instead of the handler, its status checked; an invalid one is a developer error.
$external=$w->executor->execute($ctx,'reports','external',null,['format'=>'x'],token:str_repeat('l',32));
verify($external['job']['id']==='e1'&&$jobs($ctx,'reports',['operation'=>'status','action'=>'external','id'=>'e1'])['result']===['rows'=>1],'A JobSource starts and reports its own job');
verify($jobs($ctx,'reports',['operation'=>'find','action'=>'external','token'=>str_repeat('l',32)])['job']['id']==='e1','A JobSource finds a lost start');
$engine->broken=true;
try{$jobs($ctx,'reports',['operation'=>'status','action'=>'external','id'=>'e1']);verify(false,'An invalid status accepted');}catch(LogicException){}

// The run rechecks the start's channel and API scopes, the ACL object and the account.
$api=new Context($one,'api',$w->acl,$db,['reports.apionly']);
$apiJob=$w->executor->execute($api,'reports','apionly',null,[],token:str_repeat('m',32))['job']['id'];
$w->jobs->run($w,$accounts);
verify($jobs($api,'reports',['operation'=>'status','action'=>'apionly','id'=>$apiJob])['result']===['channel'=>'api'],'An API job runs on the API channel with its scopes');
verify(status(fn()=>$jobs(new Context($one,'api',$w->acl,$db,[]),'reports',['operation'=>'status','action'=>'apionly','id'=>$apiJob]))===404,'Without the API scope the job is not read');
$guarded=$w->executor->execute($ctx,'reports','guarded','7',[],token:str_repeat('n',32))['job']['id'];
$w->jobs->run($w,$accounts);
verify($jobs($ctx,'reports',['operation'=>'status','action'=>'guarded','id'=>$guarded])['result']===['object'=>'obj-7'],'A job is read with the ACL object its start was checked on (acl_id)');
$accounts->disabled=['1'];
$disabled=$w->executor->execute($ctx,'reports','crash',null,[],token:str_repeat('o',32))['job']['id'];
$w->jobs->run($w,$accounts);$accounts->disabled=[];
verify($db->query("SELECT error FROM blade_jobs WHERE id=".$db->quote($disabled))->fetchColumn()==='A fiók nem érhető el.','A disabled account\'s job does not run');
$open=$w->executor->execute($ctx,'reports','open',null,[],token:str_repeat('p',32))['job']['id'];
$w->jobs->run($w,$accounts);
verify(!$db->inTransaction()&&$jobs($ctx,'reports',['operation'=>'status','action'=>'open','id'=>$open])['error']==='A feladat nem sikerült.','A body that leaves a transaction open fails');
// A late cancel after the body finished its work: done. A runner that lost the job (another claim) changes nothing.
$late=$w->executor->execute($ctx,'reports','late',null,[],token:str_repeat('q',32))['job']['id'];
$w->jobs->run($w,$accounts);
verify($jobs($ctx,'reports',['operation'=>'status','action'=>'late','id'=>$late])['state']==='done','A body that answered after a late cancel is done');
$lost=$w->executor->execute($ctx,'items','rebuild','1',[],token:str_repeat('r',32))['job']['id'];
$done=$audits('job_done');
$hook=function(int $step)use($db,$lost){if($step===2)$db->prepare('UPDATE blade_jobs SET attempts=attempts+1 WHERE id=?')->execute([$lost]);};
$w->jobs->run($w,$accounts,[$lost]);$hook=null;
$row=$db->query("SELECT state, attempts, step FROM blade_jobs WHERE id=".$db->quote($lost))->fetch(PDO::FETCH_ASSOC);
verify($row['state']==='running'&&(int)$row['attempts']===2&&(int)$row['step']===1&&$audits('job_done')===$done,'A runner that lost its claim stops and writes nothing');
$db->prepare("UPDATE blade_jobs SET state='done' WHERE id=?")->execute([$lost]);

// Declarations and metadata.
foreach([fn()=>new Action('x','a','A',[new Field('secret','Secret',secret:true)],fn()=>null,job:true),fn()=>new Action('x','a','A',[],fn()=>null,resolve:fn()=>[],bulk:true,job:true),
    fn()=>new Action('x','a','A',[],fn()=>null,get:true,job:true),fn()=>new Action('x','a','A',[],fn()=>null,job:true,heartbeat:2)] as $declare)
    try{$declare();verify(false,'An invalid job action accepted');}catch(InvalidArgumentException){}
$view=array_column($w->views($one),null,'id')['items'];
verify(array_column($view['actions'],'job','name')['rebuild']===['heartbeat'=>20],'The view tells the browser which action is a job');
echo "61ade job start, runner, reads, ACL, cancel, resume and JobSource contracts passed.\n";

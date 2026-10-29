<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\Shell\Identity;
use Blade\Shell\IdentityProvider;
use Blade\Access\{Acl,Tokens};
use Blade\Audit\Journal;
use Blade\Tasks\TaskQueue;

final class Workspace
{
    public readonly Acl $acl;
    public readonly Journal $journal;
    public readonly Executor $executor;
    /** Post-response tasks; runs only when a feature registered a handler (e.g. file derivatives). */
    public readonly TaskQueue $tasks;
    /** Chunked upload protocol (`__upload`) of actions declaring an UploadPolicy. */
    public readonly Transfers $transfers;
    /** Optional multi-tenancy ($tenancy: true); null keeps the application single-realm with no tenant checks at all. */
    public readonly ?\Blade\Tenancy\Tenancy $tenancy;
    public function __construct(public readonly Registry $registry,public readonly \PDO $db,bool $tenancy=false)
    {
        $this->tenancy=$tenancy?new \Blade\Tenancy\Tenancy($db):null;
        $this->acl=new Acl($db);$this->journal=new Journal($db);$this->executor=new Executor($registry,$db,$this->journal);$this->tasks=new TaskQueue($db);$this->transfers=new Transfers($registry,$this->executor,$this->journal);
    }
    public function version(string $actor): int
    {
        $q=$this->db->prepare('SELECT version FROM blade_versions WHERE actor_id=?');$q->execute([$actor]);return (int)($q->fetchColumn() ?: 0);
    }
    public function revokeSessions(string $actor): void
    {
        $q=$this->db->prepare('SELECT version FROM blade_versions WHERE actor_id=?');$q->execute([$actor]);
        if($q->fetchColumn()===false){$q=$this->db->prepare('INSERT INTO blade_versions (actor_id,version) VALUES (?,1)');$q->execute([$actor]);}
        else{$q=$this->db->prepare('UPDATE blade_versions SET version=version+1 WHERE actor_id=?');$q->execute([$actor]);}
        $q=$this->db->prepare('UPDATE blade_tokens SET revoked=1 WHERE actor_id=?');$q->execute([$actor]);
    }
    /**
     * Execution context of $actor; the public entry for workers and CLI tools too (pass it to $executor->execute()).
     * A $tenant is accepted only while the actor is a member of that active tenant, checked now, so a worker that
     * builds a fresh context before each step sees revoked memberships and deactivated tenants.
     */
    public function context(Identity $actor,string $channel='ui',?string $tenant=null,array $scopes=[],array $uploads=[],string $owner=''):Context
    {
        if($tenant!==null&&!$this->tenancy?->member($actor->id,$tenant))throw new Failure('Nincs hozzáférés a tenanthoz.',403);
        return new Context($actor,$channel,$this->acl,$this->db,$scopes,$uploads,$owner,$tenant);
    }
    /**
     * Views offered to $actor (bootstrap `views`, docs/toolkit.md#views); tenant-scoped ones only with an active $tenant
     * (membership checked), record views only with the record resource's `get` offered. Each entry is
     * `{id, kind, title, resource?, record?, actions, group, icon, desktopOnly, open, options}`; the kind provider
     * decides whether the view is offered and builds `actions` and `options`.
     */
    public function views(Identity $actor,?string $tenant=null): array
    {
        $this->registry->checkViews();
        $out=[];$ctx=$this->context($actor,'ui',$tenant);$meta=new ViewMetadata($this->registry);
        foreach($this->registry->views() as $view){
            if($ctx->tenant===null&&array_filter([$view->resource,$view->record],fn($name)=>$name!==null&&$this->registry->tenantScoped($name)))continue;
            if($view->record!==null&&!$meta->offered($ctx,$view->record,'get'))continue;
            $data=$this->registry->provider($view->kind)->metadata($ctx,$view);
            if($data===null)continue;
            $out[$view->id]=[...\Blade\I18n\Translator::presentation(['id'=>$view->id,'kind'=>$view->kind,'title'=>$view->title,
                ...($view->resource!==null?['resource'=>$view->resource]:[]),...($view->record!==null?['record'=>$view->record]:[]),
                'actions'=>$data['actions'],'group'=>$view->group,'icon'=>$view->icon,'desktopOnly'=>$view->desktopOnly,'open'=>$view->open]),
                // An empty options map stays a JSON object.
                'options'=>$data['options']===[]?new \stdClass():\Blade\I18n\Translator::presentation($data['options'])];
        }
        // A sub-view needs its child view offered to the actor; an embedded child has no menu entry of its own, any
        // other different child view carries `page` (its own page, the target of `activate: 'page'`).
        // Resolved depth first, so a child view carries its own (resolved) sub-view; a cycle ends at the repeat.
        $resolved=[];
        $resolve=function(string $key,array $path=[])use(&$resolve,&$out,&$resolved):void{
            if(isset($resolved[$key])||$out[$key]['kind']!=='list'||!isset($out[$key]['options']['subview']['child']))return;
            ['child'=>$child,'field'=>$field]=$out[$key]['options']['subview'];$select=($out[$key]['options']['subview']['select']??true)?[]:['select'=>false];
            if($child!==$key&&isset($out[$child])&&!in_array($child,$path,true))$resolve($child,[...$path,$key]);
            $subview=$child===$key?['resource'=>$out[$key]['resource'],'field'=>$field,'shared'=>true,...$select]
                :(isset($out[$child])?['resource'=>$out[$child]['resource'],'field'=>$field,'view'=>$out[$child],...$select,...($this->registry->embedded($child)?[]:['page'=>true])]:null);
            if($subview===null)unset($out[$key]['options']['subview']);else $out[$key]['options']['subview']=$subview;
            $resolved[$key]=true;
        };
        foreach(array_keys($out) as $key)$resolve((string)$key);
        return array_values(array_filter($out,fn($view)=>!$this->registry->embedded($view['id'])));
    }
    /** Field metadata of $field for the actor of $ctx (ViewMetadata::field). */
    public function fieldMetadata(Context $ctx,Field $field):array { return (new ViewMetadata($this->registry))->field($ctx,$field); }
    /** Technical observation; unchanged snapshots do not create business read events. */
    public function observe(Context $ctx,string $resource,array $query,string $version=''):array
    {
        if($ctx->channel!=='ui')throw new Failure('Nem érhető el.',403);
        $this->acl->invalidate();$view=null;
        foreach($this->registry->views() as $candidate)if($candidate->resource===$resource&&$candidate->kind==='list')$view=$candidate;
        if(!$view)throw new Failure('Ismeretlen lista.',404);
        \Blade\Infrastructure\Transaction::begin($this->db);
        try{
            if($view->options['singleton']??false){
                $action=$this->registry->get($resource,'get');$target=($action->resolve)($ctx,'self');
                if(!$this->acl->allows($ctx->actor->id,$resource,'get','ui',$target['id'],$target['owner']??null))throw new Failure('Nincs hozzáférés.',403);
                $result=['items'=>[($action->handler)($ctx,$target,[])],'previous'=>null,'next'=>null];
            }else{
                $action=$this->registry->get($resource,'list');
                if(!$action->listSource)throw new Failure('A lista nem megfigyelhető.');
                $result=$action->listSource->read($ctx,[...$query,'mode'=>'watch']);
            }
            $hash=hash('sha256',json_encode($result,JSON_THROW_ON_ERROR));
            if($version==='')$this->journal->record($ctx->actor->id,'ui',$resource,'subscribe','','success',tenant:$ctx->tenant);
            $this->db->commit();return hash_equals($hash,$version)?['version'=>$hash,'unchanged'=>true]:[...$result,'version'=>$hash];
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    /** At most this many subscriptions per batched `__watch` (and per WebSocket connection, live-server.mjs). */
    public const WATCH_LIMIT=64;
    /**
     * Batched polling observation (`__watch` with `subscriptions`): each `{id, resource, query, version}` is answered
     * on its own, `{id, ok: true, data}` or `{id, ok: false, status, error}`, so one refused or failing list never
     * fails the others. A 401 still fails the whole request: the session is gone.
     */
    public function watch(Context $ctx,array $subscriptions):array
    {
        if(!array_is_list($subscriptions)||count($subscriptions)>self::WATCH_LIMIT)throw new Failure('Túl sok feliratkozás.',413);
        $out=[];
        foreach($subscriptions as $s){
            $id=is_array($s)&&(is_string($s['id']??null)||is_int($s['id']??null))?(string)$s['id']:null;
            if($id===null||strlen($id)>64||!is_string($s['resource']??null)||!is_array($s['query']??[])||!is_string($s['version']??''))throw new Failure('Hibás feliratkozás.');
            try{$out[]=['id'=>$id,'ok'=>true,'data'=>$this->observe($ctx,$s['resource'],$s['query']??[],$s['version']??'')];}
            catch(Failure $e){if($e->status===401)throw $e;$out[]=['id'=>$id,'ok'=>false,'status'=>$e->status,'error'=>$e->getMessage()];}
            catch(\Throwable $e){error_log('61ade __watch: '.$e->getMessage());$out[]=['id'=>$id,'ok'=>false,'status'=>500,'error'=>'Az élő kapcsolat nem érhető el.'];}
        }
        return $out;
    }
    /** $sessionTenant: the tenant stored in the session; used only while the actor is still a member of it. */
    public function http(?Identity $sessionActor,IdentityProvider $identities,string $csrf,string $runtime,?string $sessionTenant=null): never
    {
        header('Content-Type: application/json; charset=utf-8');
        $handled=false;$actor=$sessionActor;$channel='ui';
        try {
            $channel=isset($_SERVER['HTTP_AUTHORIZATION'])?'api':'ui';$actor=$sessionActor;$scopes=[];
            if($channel==='api'){
                $header=$_SERVER['HTTP_AUTHORIZATION'];
                $token=str_starts_with($header,'Bearer ')?(new Tokens($this->db,$this->tenancy!==null))->authenticate(substr($header,7)):null;
                $actor=$token?$identities->find($token['actor_id']):null;$scopes=$token['scopes']??[];
            }
            if(!$actor)throw new Failure('Bejelentkezés szükséges.',401);
            // Active tenant: the session's choice (ui) or the key's binding (api), rechecked against membership now.
            // A global key ('') reaches global resources only; a key whose owner left its tenant is refused.
            $tenant=null;
            if($this->tenancy&&$channel==='ui'&&$this->tenancy->member($actor->id,$sessionTenant))$tenant=$sessionTenant;
            if($this->tenancy&&$channel==='api'&&($token['tenant']??'')!==''){
                if(!$this->tenancy->member($actor->id,$token['tenant']))throw new Failure('Nincs hozzáférés.',403);
                $tenant=$token['tenant'];
            }
            // Session binding of short-lived state (transfers, ZIP manifests): a hash of the session id (ui) or bearer token (api), never the raw value.
            $secret=$channel==='api'?substr($_SERVER['HTTP_AUTHORIZATION'],7):session_id();
            $owner=is_string($secret)&&$secret!==''?Transfers::owner($secret):'';
            // Post-response tasks only for authenticated requests; anonymous traffic never starts a runner.
            register_shutdown_function(fn()=>$this->tasks->afterResponse());
            $method=$_SERVER['REQUEST_METHOD']??'';
            if($method==='GET'||$method==='HEAD'){
                // Field-free reads of `get` actions (<img>/<video> sources): the query string is the whole envelope, `v` a cache key.
                $query=$_GET;
                if(array_diff(array_map('strval',array_keys($query)),['blade','resource','action','id','v'])||array_filter($query,static fn($value)=>!is_string($value))||!isset($query['resource'],$query['action']))throw new Failure('Hibás műveletkérés.');
                if(str_starts_with($query['action'],'__')||!$this->registry->get($query['resource'],$query['action'])->get)throw new Failure('POST szükséges.',405);
                // An element cannot send the CSRF header; the browser's fetch metadata rejects other sites instead.
                if($channel==='ui'&&in_array($_SERVER['HTTP_SEC_FETCH_SITE']??'',['cross-site','same-site'],true))throw new Failure('Érvénytelen munkamenet.',403);
                session_write_close();
                $handled=true;
                $result=$this->executor->execute(new Context($actor,$channel,$this->acl,$this->db,$scopes,owner:$owner,tenant:$tenant),$query['resource'],$query['action'],$query['id']??null,[]);
                $this->respond($result,$method==='HEAD');exit;
            }
            if($method!=='POST')throw new Failure('POST szükséges.',405);
            if($channel==='ui' && !hash_equals($csrf,$_SERVER['HTTP_X_BLADE_CSRF']??''))throw new Failure('Érvénytelen munkamenet.',403);
            // Binary parts travel as multipart/form-data: a JSON `request` field plus file parts, never base64 JSON.
            $multipart=str_starts_with(strtolower((string)($_SERVER['CONTENT_TYPE']??'')),'multipart/form-data');
            $raw=$multipart?($_POST['request']??null):file_get_contents('php://input',length:65537);
            if(!is_string($raw))throw new Failure('Hibás műveletkérés.');
            if(strlen($raw)>65536)throw new Failure('Túl nagy kérés.',413);
            try{$data=json_decode($raw,true,flags:JSON_THROW_ON_ERROR);}catch(\JsonException){throw new Failure('Érvénytelen JSON.');}
            if(!is_array($data) || !is_string($data['resource']??null)||!is_string($data['action']??null)||!is_array($data['values']??[]))throw new Failure('Hibás műveletkérés.');
            $id=$data['id']??null;if($id!==null&&!is_string($id))throw new Failure('Hibás azonosító.');
            $sessionId=session_id();session_write_close();
            $uploads=[];
            if($multipart){
                if($data['action']==='__upload'){
                    // Only a chunk of a policy action travels as multipart; one chunk per request.
                    $target=is_string($data['values']['action']??null)&&!str_starts_with($data['values']['action'],'__')?$this->registry->get($data['resource'],$data['values']['action'])->upload:null;
                    if(($data['values']['operation']??null)!=='upload_chunk'||!$target instanceof UploadPolicy)throw new Failure('A művelet nem fogad fájlt.',415);
                    $limit=$target->chunkBytes;
                }else{
                    $upload=str_starts_with($data['action'],'__')?null:$this->registry->get($data['resource'],$data['action'])->upload;
                    if($upload===null)throw new Failure('A művelet nem fogad fájlt.',415);
                    $limit=$upload instanceof UploadPolicy?$upload->requestBytes():$upload;
                }
                if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit+UploadPolicy::ENVELOPE_BYTES)throw new Failure('Túl nagy kérés.',413);
                $uploads=Upload::collect($_FILES);
            }
            if($data['action']==='__ticket'){
                if($channel!=='ui')throw new Failure('Nem érhető el.',403);
                echo json_encode(['ok'=>true,'data'=>['ticket'=>\Blade\Live\Tickets::issue($runtime,$sessionId,$tenant)]],JSON_THROW_ON_ERROR);exit;
            }
            if($data['action']==='__watch'){
                if($channel!=='ui')throw new Failure('Nem érhető el.',403);
                $ctx=new Context($actor,'ui',$this->acl,$this->db,owner:$owner,tenant:$tenant);
                $list=$data['values']['subscriptions']??null;
                $result=is_array($list)?['results'=>$this->watch($ctx,$list)]:$this->observe($ctx,$data['resource'],$data['values']['query']??[],$data['values']['version']??'');
                echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            if($data['action']==='__bulk'){
                $values=$data['values'];
                if(!is_string($values['operation']??null)||!is_array($values['items']??null)||array_diff(array_keys($values),['operation','items']))throw new Failure('Hibás tömeges művelet.');
                $result=$this->executor->bulk(new Context($actor,$channel,$this->acl,$this->db,$scopes,owner:$owner,tenant:$tenant),$data['resource'],$values['operation'],$values['items']);
                echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            if($data['action']==='__upload'){
                // Transfers are bound to a hash of the session id (ui) or bearer token (api), never the raw value.
                if($owner==='')throw new Failure('Érvénytelen munkamenet.',403);
                $handled=in_array($data['values']['operation']??null,Transfers::AUDITED,true);
                $ctx=new Context($actor,$channel,$this->acl,$this->db,$scopes,$uploads,$owner,$tenant);
                $result=$this->transfers->handle($ctx,$ctx->owner,$data['resource'],$id,$data['values']??[]);
                $this->respond($result);exit;
            }
            if($data['action']==='__edit'){
                $values=$data['values'];
                if(!is_string($id)||!is_string($values['field']??null)||!array_key_exists('value',$values)||!is_string($values['revision']??null)||array_diff(array_keys($values),['field','value','revision']))throw new Failure('Hibás mezőmentés.');
                $handled=true;
                $result=$this->executor->edit(new Context($actor,$channel,$this->acl,$this->db,$scopes,owner:$owner,tenant:$tenant),$data['resource'],$id,$values['field'],$values['value'],$values['revision']);
                echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            if($data['action']==='__form'){
                if($channel!=='ui' || !is_string($data['values']['operation']??null))throw new Failure('Érvénytelen űrlapkérés.',403);
                $a=$this->registry->get($data['resource'],$data['values']['operation']);
                if(!in_array('ui',$a->channels,true))throw new Failure('Nem érhető el.',403);
                if($tenant===null&&$this->registry->tenantScoped($a->resource))throw new Failure('Nincs aktív tenant.',403);
                $ctx=new Context($actor,$channel,$this->acl,$this->db,owner:$owner,tenant:$tenant);
                $t=$a->resolve?($a->resolve)($ctx,$id):['id'=>$id,'owner'=>null];
                if(!$this->acl->allows($actor->id,$a->resource,$a->name,'ui',$t['id']??null,$t['owner']??null))throw new Failure('Nincs hozzáférés.',403);
                $fields=array_values(array_filter(ViewMetadata::formFields($a),fn($f)=>$this->acl->fieldAllowed($actor->id,$a->resource,$a->name,'ui',$t['id']??'',$t['owner']??null,$f->name)));
                $values=$a->formValues?($a->formValues)($ctx,$t):($id!==null?$this->executor->execute($ctx,$a->resource,'get',$id,[]):[]);
                $this->journal->record($actor->id,'ui',$a->resource,'describe',$id??'','success',tenant:$tenant);
                echo json_encode(['ok'=>true,'data'=>['fields'=>array_map(fn($f)=>$this->fieldMetadata($ctx,$f),$fields),'values'=>$values]],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            $handled=true;
            $result=$this->executor->execute(new Context($actor,$channel,$this->acl,$this->db,$scopes,$uploads,$owner,$tenant),$data['resource'],$data['action'],$id,$data['values']??[]);
            $this->respond($result);
        }catch(Failure $e){if(!$handled)$this->journal->record($actor?->id??'',$channel,'transport','request','','rejected');http_response_code($e->status);echo json_encode(['ok'=>false,'error'=>$e->getMessage(),'fieldErrors'=>(object)$e->fieldErrors,...($e->details?['details'=>$e->details]:[])],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);}
        exit;
    }
    /** JSON envelope, raw bytes (Download) or a stream (DownloadStream, StreamedDownload); the audit is already committed. */
    private function respond(mixed $result,bool $head=false):void
    {
        if($result instanceof DownloadStream){$result->send($head,$_SERVER);return;}
        if($result instanceof StreamedDownload){$result->send($head);return;}
        if($result instanceof Download){
            // Raw bytes of an allowlisted type; never rendered as a document of this origin.
            header('Content-Type: '.$result->mimeType);header('Content-Length: '.strlen($result->content));
            header('Content-Disposition: attachment');header('X-Content-Type-Options: nosniff');
            header("Content-Security-Policy: default-src 'none'; sandbox");header('Cache-Control: no-store');
            echo $result->content;return;
        }
        echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);
    }
}

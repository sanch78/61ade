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
    public function __construct(public readonly Registry $registry,public readonly \PDO $db)
    {
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
    public function views(Identity $actor): array
    {
        $out=[];$ctx=new Context($actor,'ui',$this->acl,$this->db);
        foreach($this->registry->views() as $view){
            if(($view['kind']??'list')==='files'){
                $files=$this->fileView($actor,$ctx,$view);
                if($files)$out[]=\Blade\I18n\Translator::presentation($files);
                continue;
            }
            if(($view['kind']??'list')==='diagram'){
                $diagram=$this->diagramView($actor,$ctx,$view);
                if($diagram)$out[]=\Blade\I18n\Translator::presentation($diagram);
                continue;
            }
            if(($view['kind']??'list')==='calendar'){
                $calendar=$this->calendarView($actor,$ctx,$view);
                if($calendar)$out[]=\Blade\I18n\Translator::presentation($calendar);
                continue;
            }
            $actions=[];
            foreach($view['actions'] as $name){
                $a=$this->registry->get($view['resource'],$name);
                if($view['singleton'] && !$this->acl->allows($actor->id,$a->resource,$name,'ui',$actor->id,$actor->id))continue;
                if(!$this->offered($actor,$a->resource,$name))continue;
                $actions[]=['name'=>$name,'icon'=>$a->icon,'bulk'=>$a->bulk,'confirm'=>$a->confirm?array_filter(['message'=>\Blade\I18n\Translator::text($a->confirm['message']),'title'=>isset($a->confirm['title'])?\Blade\I18n\Translator::text($a->confirm['title']):null,'severity'=>$a->confirm['severity']??'neutral','confirmLabel'=>isset($a->confirm['confirm_label'])?\Blade\I18n\Translator::text($a->confirm['confirm_label']):null,'cancelLabel'=>isset($a->confirm['cancel_label'])?\Blade\I18n\Translator::text($a->confirm['cancel_label']):null],static fn($v)=>$v!==null):null,'label'=>match($name){'create'=>'Hozzáadás','update'=>'Módosítás',default=>$a->label},'submitLabel'=>in_array($name,['create','update'],true)?'Mentés':$a->label,'write'=>$a->write,'fields'=>array_map(static fn($f)=>$f->metadata($ctx),$a->fields)];
            }
            if(!$actions)continue;
            $fields=$this->registry->fields($view['resource']);
            $view['columns']=array_map(static function($column) use ($fields,$ctx){
                $field=$fields[$column['id']]??null;
                if(!$field)return $column;
                return [...$field->column,...$column,'type'=>$field->type,'options'=>$field->metadata($ctx)['options']];
            },$view['columns']);
            $view['detailFields']=array_values(array_map(static fn($field)=>['id'=>$field->name,'header'=>$field->label,'type'=>$field->type,'options'=>$field->metadata($ctx)['options']],array_filter($fields,static fn($field)=>!$field->secret&&$field->type!=='password')));
            $view['actions']=$actions;
            $view['layout']=$view['layout']->metadata();
            $list=$this->registry->get($view['resource'],$view['singleton']?'get':'list');
            $view['filters']=$list->listSource?->filterDefinitions($ctx)??[];
            $view['sortable']=$list->listSource?->sortableFields($ctx)??[];
            if($search=$list->listSource?->searchMetadata($ctx))$view['search']=$search;
            $out[]=\Blade\I18n\Translator::presentation($view);
        }
        return $out;
    }
    /** Some allow rule exists and no whole-action deny for all objects; object checks still run per request. */
    private function offered(Identity $actor,string $resource,string $name):bool
    {
        $rules=$this->acl->rules($actor->id,$resource,$name,'ui');
        return array_filter($rules,static fn($r)=>$r['effect']==='allow' && $r['field_name']==='') && !array_filter($rules,static fn($r)=>$r['effect']==='deny' && $r['scope']==='all' && $r['field_name']==='');
    }
    /** File manager metadata: offered actions and only the mounts whose tree the actor may read. */
    private function fileView(Identity $actor,Context $ctx,array $view):?array
    {
        $actions=[];
        foreach($view['actions'] as $name){
            $a=$this->registry->get($view['resource'],$name);
            if($this->offered($actor,$a->resource,$name))$actions[]=['name'=>$name,'label'=>$a->label,'icon'=>$a->icon,'write'=>$a->write,'fields'=>array_map(static fn($f)=>$f->metadata($ctx),$a->fields)];
        }
        $mounts=array_values(array_filter($view['files']['mounts'],fn($m)=>$this->acl->allows($actor->id,$view['resource'],'tree','ui',$m['id'])));
        if(!$actions||!$mounts)return null;
        return ['kind'=>'files','resource'=>$view['resource'],'title'=>$view['title'],'group'=>$view['group'],'icon'=>$view['icon'],'desktopOnly'=>$view['desktopOnly'],'singleton'=>false,'columns'=>[],'filters'=>[],'actions'=>$actions,'files'=>[...$view['files'],'mounts'=>$mounts]];
    }
    /** Diagram editor metadata: offered actions only; the space must be readable through `list`. */
    private function diagramView(Identity $actor,Context $ctx,array $view):?array
    {
        $actions=[];
        foreach($view['actions'] as $name){
            $a=$this->registry->get($view['resource'],$name);
            if($this->offered($actor,$a->resource,$name))$actions[]=['name'=>$name,'label'=>$a->label,'icon'=>$a->icon,'write'=>$a->write,'confirm'=>$a->confirm?array_filter(['message'=>$a->confirm['message'],'title'=>$a->confirm['title']??null,'severity'=>$a->confirm['severity']??'neutral','confirmLabel'=>$a->confirm['confirm_label']??null],static fn($v)=>$v!==null):null,'fields'=>array_map(static fn($f)=>$f->metadata($ctx),$a->fields)];
        }
        if(!array_filter($actions,static fn($a)=>$a['name']==='list'))return null;
        return ['kind'=>'diagram','resource'=>$view['resource'],'title'=>$view['title'],'group'=>$view['group'],'icon'=>$view['icon'],'desktopOnly'=>$view['desktopOnly'],'singleton'=>false,'columns'=>[],'filters'=>[],'actions'=>$actions,'diagram'=>$view['diagram']];
    }
    /** Calendar metadata: offered actions, readable extra fields and the day action only if offered; `events` is required. */
    private function calendarView(Identity $actor,Context $ctx,array $view):?array
    {
        $actions=[];
        foreach($view['actions'] as $name){
            $a=$this->registry->get($view['resource'],$name);
            if($this->offered($actor,$a->resource,$name))$actions[]=['name'=>$name,'label'=>$a->label,'icon'=>$a->icon,'write'=>$a->write];
        }
        if(!array_filter($actions,static fn($a)=>$a['name']==='events'))return null;
        $space=$view['calendar']['space'];
        $fields=array_values(array_filter($view['fields'],fn($f)=>$this->acl->fieldAllowed($actor->id,$view['resource'],'events','ui',$space,null,$f->name)));
        $day=$view['calendar']['day_action'];
        if($day&&!$this->offered($actor,$day['resource'],$day['action']))$day=null;
        return ['kind'=>'calendar','resource'=>$view['resource'],'title'=>$view['title'],'group'=>$view['group'],'icon'=>$view['icon'],'desktopOnly'=>$view['desktopOnly'],'singleton'=>false,'columns'=>[],'filters'=>[],'actions'=>$actions,
            'calendar'=>[...array_diff_key($view['calendar'],['space'=>1]),'day_action'=>$day,'fields'=>array_map(static fn($f)=>$f->metadata($ctx),$fields)]];
    }
    /** Technical observation; unchanged snapshots do not create business read events. */
    public function observe(Context $ctx,string $resource,array $query,string $version=''):array
    {
        if($ctx->channel!=='ui')throw new Failure('Nem érhető el.',403);
        $this->acl->invalidate();$view=null;
        foreach($this->registry->views() as $candidate)if($candidate['resource']===$resource)$view=$candidate;
        if(!$view||($view['kind']??'list')!=='list')throw new Failure('Ismeretlen lista.',404);
        \Blade\Infrastructure\Transaction::begin($this->db);
        try{
            if($view['singleton']){
                $action=$this->registry->get($resource,'get');$target=($action->resolve)($ctx,'self');
                if(!$this->acl->allows($ctx->actor->id,$resource,'get','ui',$target['id'],$target['owner']??null))throw new Failure('Nincs hozzáférés.',403);
                $result=['items'=>[($action->handler)($ctx,$target,[])],'previous'=>null,'next'=>null];
            }else{
                $action=$this->registry->get($resource,'list');
                if(!$action->listSource)throw new Failure('A lista nem megfigyelhető.');
                $result=$action->listSource->read($ctx,[...$query,'mode'=>'watch']);
            }
            $hash=hash('sha256',json_encode($result,JSON_THROW_ON_ERROR));
            if($version==='')$this->journal->record($ctx->actor->id,'ui',$resource,'subscribe','','success');
            $this->db->commit();return hash_equals($hash,$version)?['version'=>$hash,'unchanged'=>true]:[...$result,'version'=>$hash];
        }catch(\Throwable $e){if($this->db->inTransaction())$this->db->rollBack();throw $e;}
    }
    public function http(?Identity $sessionActor,IdentityProvider $identities,string $csrf,string $runtime): never
    {
        header('Content-Type: application/json; charset=utf-8');
        $handled=false;$actor=$sessionActor;$channel='ui';
        try {
            $channel=isset($_SERVER['HTTP_AUTHORIZATION'])?'api':'ui';$actor=$sessionActor;$scopes=[];
            if($channel==='api'){
                $header=$_SERVER['HTTP_AUTHORIZATION'];
                $token=str_starts_with($header,'Bearer ')?(new Tokens($this->db))->authenticate(substr($header,7)):null;
                $actor=$token?$identities->find($token['actor_id']):null;$scopes=$token['scopes']??[];
            }
            if(!$actor)throw new Failure('Bejelentkezés szükséges.',401);
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
                $result=$this->executor->execute(new Context($actor,$channel,$this->acl,$this->db,$scopes),$query['resource'],$query['action'],$query['id']??null,[]);
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
                echo json_encode(['ok'=>true,'data'=>['ticket'=>\Blade\Live\Tickets::issue($runtime,$sessionId)]],JSON_THROW_ON_ERROR);exit;
            }
            if($data['action']==='__watch'){
                if($channel!=='ui')throw new Failure('Nem érhető el.',403);
                $ctx=new Context($actor,'ui',$this->acl,$this->db);
                $result=$this->observe($ctx,$data['resource'],$data['values']['query']??[],$data['values']['version']??'');
                echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            if($data['action']==='__bulk'){
                $values=$data['values'];
                if(!is_string($values['operation']??null)||!is_array($values['items']??null)||array_diff(array_keys($values),['operation','items']))throw new Failure('Hibás tömeges művelet.');
                $result=$this->executor->bulk(new Context($actor,$channel,$this->acl,$this->db,$scopes),$data['resource'],$values['operation'],$values['items']);
                echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            if($data['action']==='__upload'){
                // Transfers are bound to a hash of the session id (ui) or bearer token (api), never the raw value.
                $secret=$channel==='api'?substr($_SERVER['HTTP_AUTHORIZATION'],7):$sessionId;
                if($secret===''||$secret===false)throw new Failure('Érvénytelen munkamenet.',403);
                $handled=in_array($data['values']['operation']??null,Transfers::AUDITED,true);
                $result=$this->transfers->handle(new Context($actor,$channel,$this->acl,$this->db,$scopes,$uploads),Transfers::owner($secret),$data['resource'],$id,$data['values']??[]);
                $this->respond($result);exit;
            }
            if($data['action']==='__edit'){
                $values=$data['values'];
                if(!is_string($id)||!is_string($values['field']??null)||!array_key_exists('value',$values)||!is_string($values['revision']??null)||array_diff(array_keys($values),['field','value','revision']))throw new Failure('Hibás mezőmentés.');
                $handled=true;
                $result=$this->executor->edit(new Context($actor,$channel,$this->acl,$this->db,$scopes),$data['resource'],$id,$values['field'],$values['value'],$values['revision']);
                echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            if($data['action']==='__form'){
                if($channel!=='ui' || !is_string($data['values']['operation']??null))throw new Failure('Érvénytelen űrlapkérés.',403);
                $a=$this->registry->get($data['resource'],$data['values']['operation']);
                if(!in_array('ui',$a->channels,true))throw new Failure('Nem érhető el.',403);
                $ctx=new Context($actor,$channel,$this->acl,$this->db);
                $t=$a->resolve?($a->resolve)($ctx,$id):['id'=>$id,'owner'=>null];
                if(!$this->acl->allows($actor->id,$a->resource,$a->name,'ui',$t['id']??null,$t['owner']??null))throw new Failure('Nincs hozzáférés.',403);
                $fields=array_values(array_filter($a->fields,fn($f)=>$this->acl->fieldAllowed($actor->id,$a->resource,$a->name,'ui',$t['id']??'',$t['owner']??null,$f->name)));
                $values=$a->formValues?($a->formValues)($ctx,$t):($id!==null?$this->executor->execute($ctx,$a->resource,'get',$id,[]):[]);
                $this->journal->record($actor->id,'ui',$a->resource,'describe',$id??'','success');
                echo json_encode(['ok'=>true,'data'=>['fields'=>array_map(fn($f)=>$f->metadata($ctx),$fields),'values'=>$values]],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            $handled=true;
            $result=$this->executor->execute(new Context($actor,$channel,$this->acl,$this->db,$scopes,$uploads),$data['resource'],$data['action'],$id,$data['values']??[]);
            $this->respond($result);
        }catch(Failure $e){if(!$handled)$this->journal->record($actor?->id??'',$channel,'transport','request','','rejected');http_response_code($e->status);echo json_encode(['ok'=>false,'error'=>$e->getMessage(),'fieldErrors'=>(object)$e->fieldErrors,...($e->details?['details'=>$e->details]:[])],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);}
        exit;
    }
    /** JSON envelope, raw bytes (Download) or a stream (DownloadStream); the audit is already committed. */
    private function respond(mixed $result,bool $head=false):void
    {
        if($result instanceof DownloadStream){$result->send($head,$_SERVER);return;}
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

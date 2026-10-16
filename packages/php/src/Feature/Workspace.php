<?php
declare(strict_types=1);
namespace Vapa\Feature;
use Vapa\Shell\Identity;
use Vapa\Shell\IdentityProvider;
use Vapa\Access\{Acl,Tokens};
use Vapa\Audit\Journal;

final class Workspace
{
    public readonly Acl $acl;
    public readonly Journal $journal;
    public readonly Executor $executor;
    public function __construct(public readonly Registry $registry,public readonly \PDO $db)
    {
        $this->acl=new Acl($db);$this->journal=new Journal($db);$this->executor=new Executor($registry,$db,$this->journal);
    }
    public function version(string $actor): int
    {
        $q=$this->db->prepare('SELECT version FROM vapa_versions WHERE actor_id=?');$q->execute([$actor]);return (int)($q->fetchColumn() ?: 0);
    }
    public function revokeSessions(string $actor): void
    {
        $q=$this->db->prepare('SELECT version FROM vapa_versions WHERE actor_id=?');$q->execute([$actor]);
        if($q->fetchColumn()===false){$q=$this->db->prepare('INSERT INTO vapa_versions (actor_id,version) VALUES (?,1)');$q->execute([$actor]);}
        else{$q=$this->db->prepare('UPDATE vapa_versions SET version=version+1 WHERE actor_id=?');$q->execute([$actor]);}
        $q=$this->db->prepare('UPDATE vapa_tokens SET revoked=1 WHERE actor_id=?');$q->execute([$actor]);
    }
    public function views(Identity $actor): array
    {
        $out=[];$ctx=new Context($actor,'ui',$this->acl,$this->db);
        foreach($this->registry->views() as $view){
            $actions=[];
            foreach($view['actions'] as $name){
                $a=$this->registry->get($view['resource'],$name);
                if($view['singleton'] && !$this->acl->allows($actor->id,$a->resource,$name,'ui',$actor->id,$actor->id))continue;
                $rules=$this->acl->rules($actor->id,$a->resource,$name,'ui');
                if(!array_filter($rules,static fn($r)=>$r['effect']==='allow' && $r['field_name']==='') || array_filter($rules,static fn($r)=>$r['effect']==='deny' && $r['scope']==='all' && $r['field_name']===''))continue;
                $actions[]=['name'=>$name,'label'=>match($name){'create'=>'Hozzáadás','update'=>'Módosítás',default=>$a->label},'submitLabel'=>in_array($name,['create','update'],true)?'Mentés':$a->label,'write'=>$a->write,'fields'=>array_map(static fn($f)=>$f->metadata($ctx),$a->fields)];
            }
            if(!$actions)continue;
            $view['actions']=$actions;
            $view['layout']=$view['layout']->metadata();
            $list=$this->registry->get($view['resource'],$view['singleton']?'get':'list');
            $view['filters']=$list->listSource?->filterDefinitions($ctx)??[];
            $out[]=$view;
        }
        return $out;
    }
    /** Technical observation; unchanged snapshots do not create business read events. */
    public function observe(Context $ctx,string $resource,array $query,string $version=''):array
    {
        if($ctx->channel!=='ui')throw new Failure('Nem érhető el.',403);
        $this->acl->invalidate();$view=null;
        foreach($this->registry->views() as $candidate)if($candidate['resource']===$resource)$view=$candidate;
        if(!$view)throw new Failure('Ismeretlen lista.',404);
        $this->db->beginTransaction();
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
            if($_SERVER['REQUEST_METHOD']!=='POST')throw new Failure('POST szükséges.',405);
            if($channel==='ui' && !hash_equals($csrf,$_SERVER['HTTP_X_VAPA_CSRF']??''))throw new Failure('Érvénytelen munkamenet.',403);
            $raw=file_get_contents('php://input',length:65537);
            if(strlen($raw)>65536)throw new Failure('Túl nagy kérés.',413);
            try{$data=json_decode($raw,true,flags:JSON_THROW_ON_ERROR);}catch(\JsonException){throw new Failure('Érvénytelen JSON.');}
            if(!is_array($data) || !is_string($data['resource']??null)||!is_string($data['action']??null)||!is_array($data['values']??[]))throw new Failure('Hibás műveletkérés.');
            $id=$data['id']??null;if($id!==null&&!is_string($id))throw new Failure('Hibás azonosító.');
            $sessionId=session_id();session_write_close();
            if($data['action']==='__ticket'){
                if($channel!=='ui')throw new Failure('Nem érhető el.',403);
                echo json_encode(['ok'=>true,'data'=>['ticket'=>\Vapa\Live\Tickets::issue($runtime,$sessionId)]],JSON_THROW_ON_ERROR);exit;
            }
            if($data['action']==='__watch'){
                if($channel!=='ui')throw new Failure('Nem érhető el.',403);
                $ctx=new Context($actor,'ui',$this->acl,$this->db);
                $result=$this->observe($ctx,$data['resource'],$data['values']['query']??[],$data['values']['version']??'');
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
                $values=$id!==null?$this->executor->execute($ctx,$a->resource,'get',$id,[]):[];
                $this->journal->record($actor->id,'ui',$a->resource,'describe',$id??'','success');
                echo json_encode(['ok'=>true,'data'=>['fields'=>array_map(fn($f)=>$f->metadata($ctx),$fields),'values'=>$values]],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);exit;
            }
            $handled=true;
            $result=$this->executor->execute(new Context($actor,$channel,$this->acl,$this->db,$scopes),$data['resource'],$data['action'],$id,$data['values']??[]);
            echo json_encode(['ok'=>true,'data'=>$result],JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE);
        }catch(Failure $e){if(!$handled)$this->journal->record($actor?->id??'',$channel,'transport','request','','rejected');http_response_code($e->status);echo json_encode(['ok'=>false,'error'=>$e->getMessage()],JSON_THROW_ON_ERROR);}
        exit;
    }
}

<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\Audit\Journal;

final class Executor
{
    public function __construct(public Registry $registry, private \PDO $db, public Journal $journal) {}
    /** Bounded, explicitly opted-in batch; each object has its own ACL, transaction and audit. */
    public function bulk(Context $ctx, string $resource, string $name, array $items): array
    {
        $action=$this->registry->get($resource,$name);
        if(!$action->bulk || $ctx->channel!=='ui')throw new Failure('A tömeges művelet nem érhető el.',403);
        if(!array_is_list($items)||!$items||count($items)>100)throw new Failure('1–100 jelölt sor szükséges.');
        $seen=[];
        foreach($items as $item){
            if(!is_array($item)||array_diff(array_keys($item),['id','values'])||!is_string($item['id']??null)||!is_array($item['values']??null)||isset($seen[$item['id']]))throw new Failure('Hibás vagy ismétlődő jelölt sor.');
            $seen[$item['id']]=true;
        }
        $results=[];
        foreach($items as $item){
            try{$this->execute($ctx,$resource,$name,$item['id'],$item['values'],false,true);$results[]=['id'=>$item['id'],'ok'=>true];}
            catch(Failure $error){$results[]=['id'=>$item['id'],'ok'=>false,'error'=>$error->getMessage()];}
        }
        return $results;
    }
    public function edit(Context $ctx, string $resource, string $id, string $field, mixed $value, string $revision): mixed
    {
        if ($field === 'revision') throw new Failure('Nem szerkeszthető mező.', 403);
        return $this->execute($ctx,$resource,'update',$id,[$field=>$value,'revision'=>$revision],true);
    }
    public function execute(Context $ctx, string $resource, string $name, ?string $id, array $input, bool $fieldEdit = false, bool $partial = false): mixed
    {
        $fields=[];$detail=[];
        $ctx->acl->invalidate();
        try {
            $action=$this->registry->get($resource,$name);
            if (!in_array($ctx->channel,$action->channels,true) || ($ctx->channel==='api' && !in_array($resource.'.'.$name,$ctx->scopes,true))) throw new Failure('Nincs hozzáférés.',403);
            \Blade\Infrastructure\Transaction::begin($this->db);
            $target=$action->resolve ? ($action->resolve)($ctx,$id) : ['id'=>$id,'owner'=>null];
            if(array_filter($action->fields,static fn($f)=>$f->secret)){
                $q=$this->db->prepare('SELECT COUNT(*) FROM blade_audit WHERE actor_id=? AND resource=? AND action=? AND occurred_at>?');
                $q->execute([$ctx->actor->id,$resource,$name,gmdate('Y-m-d\TH:i:s\Z',time()-60)]);
                if((int)$q->fetchColumn()>=5)throw new Failure('Túl sok próbálkozás. Egy perc múlva próbáld újra.',429);
            }
            $object=isset($target['id']) ? (string)$target['id'] : null;
            $owner=isset($target['owner']) ? (string)$target['owner'] : null;
            $aclObject=isset($target['acl_id']) ? (string)$target['acl_id'] : $object;
            $detail=$target['audit'] ?? [];
            // Collection handlers must use the kernel SQL scope; no raw collection result is allowed.
            if (!$action->collection && !$ctx->acl->allows($ctx->actor->id,$resource,$name,$ctx->channel,$aclObject,$owner)) throw new Failure($ctx->channel==='api' && $object!==null ? 'Nem található objektum.' : 'Nincs hozzáférés.',$ctx->channel==='api' && $object!==null ? 404 : 403);
            $known=array_column($action->fields,null,'name');
            if($fieldEdit){
                $edited=array_keys(array_diff_key($input,['revision'=>true]));
                if($name!=='update'||!$action->editHandler||count($edited)!==1||!(($known[$edited[0]]??null)?->column['editable']??false))throw new Failure('Nem szerkeszthető mező.',403);
            }
            foreach ($input as $key=>$value) if (!$action->listSource && !isset($known[$key])) throw new Failure('Ismeretlen vagy nem írható mező.');
            $values=$action->listSource ? $input : [];
            $fieldErrors = [];
            foreach ($action->fields as $field) {
                if(($fieldEdit||$partial)&&$field->name!=='revision'&&!array_key_exists($field->name,$input))continue;
                $allowed=$ctx->acl->fieldAllowed($ctx->actor->id,$resource,$name,$ctx->channel,$aclObject ?? '',$owner,$field->name);
                if(!$allowed){if(array_key_exists($field->name,$input) || ($name==='create' && $field->required))throw new Failure('A mező nem módosítható.',403);continue;}
                if (!array_key_exists($field->name,$input) && !$field->required) continue;
                try {
                    $values[$field->name]=$field->validate($input[$field->name] ?? '',$ctx,($fieldEdit||$partial)?array_replace($target['row']??[],$input):$input);
                } catch (Failure $error) {
                    if (!$error->fieldErrors) throw $error;
                    $fieldErrors = array_replace($fieldErrors, $error->fieldErrors);
                }
                if (!$field->secret) $fields[]=$field->name;
            }
            if ($fieldErrors) throw new Failure('Javítsd a megjelölt mezőket.', 400, $fieldErrors);
            $handler=$fieldEdit?$action->editHandler:$action->handler;
            $result=$handler($ctx,$target,$values);
            $auditObject=$object ?? (is_array($result) && isset($result['id']) ? (string)$result['id'] : '');
            if(is_array($result) && is_array($result['audit'] ?? null))$detail=[...$detail,...$result['audit']];
            if($result instanceof Download||$result instanceof DownloadStream)$detail=[...$detail,...$result->audit];
            $this->journal->record($ctx->actor->id,$ctx->channel,$resource,$name,$auditObject, 'success',$fields,$detail);
            $this->db->commit();
            return $result;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $ctx->acl->invalidate();
            $this->journal->record($ctx->actor->id,$ctx->channel,substr($resource,0,100),substr($name,0,100),substr($id ?? '',0,100),$error instanceof Failure ? 'rejected' : 'error',$fields,$detail);
            if ($error instanceof Failure) throw $error;
            if ($error instanceof \PDOException && str_starts_with((string)$error->getCode(),'23')) throw new Failure('Az adat már létezik, vagy hivatkozási feltételt sért.',409);
            throw new Failure('A művelet nem hajtható végre.',500);
        }
    }
}

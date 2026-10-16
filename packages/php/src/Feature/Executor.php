<?php
declare(strict_types=1);
namespace Vapa\Feature;
use Vapa\Audit\Journal;

final class Executor
{
    public function __construct(public Registry $registry, private \PDO $db, public Journal $journal) {}
    public function execute(Context $ctx, string $resource, string $name, ?string $id, array $input): mixed
    {
        $fields=[];
        $ctx->acl->invalidate();
        try {
            $action=$this->registry->get($resource,$name);
            if (!in_array($ctx->channel,$action->channels,true) || ($ctx->channel==='api' && !in_array($resource.'.'.$name,$ctx->scopes,true))) throw new Failure('Nincs hozzáférés.',403);
            $this->db->beginTransaction();
            $target=$action->resolve ? ($action->resolve)($ctx,$id) : ['id'=>$id,'owner'=>null];
            if(array_filter($action->fields,static fn($f)=>$f->secret)){
                $q=$this->db->prepare('SELECT COUNT(*) FROM vapa_audit WHERE actor_id=? AND resource=? AND action=? AND occurred_at>?');
                $q->execute([$ctx->actor->id,$resource,$name,gmdate('Y-m-d\TH:i:s\Z',time()-60)]);
                if((int)$q->fetchColumn()>=5)throw new Failure('Túl sok próbálkozás. Egy perc múlva próbáld újra.',429);
            }
            $object=isset($target['id']) ? (string)$target['id'] : null;
            $owner=isset($target['owner']) ? (string)$target['owner'] : null;
            // Collection handlers must use the kernel SQL scope; no raw collection result is allowed.
            if (!$action->collection && !$ctx->acl->allows($ctx->actor->id,$resource,$name,$ctx->channel,$object,$owner)) throw new Failure($ctx->channel==='api' && $object!==null ? 'Nem található objektum.' : 'Nincs hozzáférés.',$ctx->channel==='api' && $object!==null ? 404 : 403);
            $known=array_column($action->fields,null,'name');
            foreach ($input as $key=>$value) if (!$action->listSource && !isset($known[$key])) throw new Failure('Ismeretlen vagy nem írható mező.');
            $values=$action->listSource ? $input : [];
            foreach ($action->fields as $field) {
                $allowed=$ctx->acl->fieldAllowed($ctx->actor->id,$resource,$name,$ctx->channel,$object ?? '',$owner,$field->name);
                if(!$allowed){if(array_key_exists($field->name,$input) || ($name==='create' && $field->required))throw new Failure('A mező nem módosítható.',403);continue;}
                if (!array_key_exists($field->name,$input) && !$field->required) continue;
                $values[$field->name]=$field->validate($input[$field->name] ?? '',$ctx);
                if (!$field->secret) $fields[]=$field->name;
            }
            $result=($action->handler)($ctx,$target,$values);
            $auditObject=$object ?? (is_array($result) && isset($result['id']) ? (string)$result['id'] : '');
            $this->journal->record($ctx->actor->id,$ctx->channel,$resource,$name,$auditObject, 'success',$fields);
            $this->db->commit();
            return $result;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $ctx->acl->invalidate();
            $this->journal->record($ctx->actor->id,$ctx->channel,substr($resource,0,100),substr($name,0,100),substr($id ?? '',0,100),$error instanceof Failure ? 'rejected' : 'error',$fields);
            if ($error instanceof Failure) throw $error;
            if ($error instanceof \PDOException && str_starts_with((string)$error->getCode(),'23')) throw new Failure('Az adat már létezik, vagy hivatkozási feltételt sért.',409);
            throw new Failure('A művelet nem hajtható végre.',500);
        }
    }
}

<?php
declare(strict_types=1);
namespace Blade\Feature;
use Blade\Audit\Journal;

final class Executor
{
    public function __construct(public Registry $registry, private \PDO $db, public Journal $journal) {}
    /** Bounded, explicitly opted-in batch; each object has its own ACL, transaction and audit. A handler's array result is the item's `data` (without `audit`). */
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
            try{$result=$this->execute($ctx,$resource,$name,$item['id'],$item['values'],false,true);$results[]=['id'=>$item['id'],'ok'=>true,...(is_array($result)&&($data=array_diff_key($result,['audit'=>true]))?['data'=>$data]:[])];}
            catch(Failure $error){$results[]=['id'=>$item['id'],'ok'=>false,'error'=>$error->getMessage()];}
        }
        return $results;
    }
    public function edit(Context $ctx, string $resource, string $id, string $field, mixed $value, string $revision): mixed
    {
        if ($field === 'revision') throw new Failure('Nem szerkeszthető mező.', 403);
        return $this->execute($ctx,$resource,'update',$id,[$field=>$value,'revision'=>$revision],true);
    }
    /**
     * Channel/scope, resolver and object ACL of $action in execute()'s order and error mapping, without a
     * transaction, field validation or audit (steps of the upload transfer protocol). Returns the target.
     */
    public function authorize(Context $ctx, Action $action, ?string $id): array
    {
        $ctx->acl->invalidate();
        $this->channel($ctx,$action);
        $target=$action->resolve ? ($action->resolve)($ctx,$id) : ['id'=>$id,'owner'=>null];
        self::sharedWrite($ctx,$action,$target);
        $object=isset($target['id']) ? (string)$target['id'] : null;
        // An upload staged for a deferred create (FB-0180) needs at least one write link; the create itself decides later.
        if (!$action->collection && $this->permit($ctx,$action,$object,isset($target['acl_id']) ? (string)$target['acl_id'] : $object,isset($target['owner']) ? (string)$target['owner'] : null,$target)
            && !$this->registry->delegation($action->resource)?->anyLink($this->db,'write',$ctx->actor->id)) throw new Failure('Nincs hozzáférés.',403);
        return $target;
    }
    private function channel(Context $ctx, Action $action): void
    {
        // A tenant-scoped resource needs an active, membership-checked tenant; there is no unscoped fallback.
        if (!$this->registry->tenantReady($ctx,$action->resource)) throw new Failure('Nincs aktív tenant.',403);
        if (!in_array($ctx->channel,$action->channels,true) || ($ctx->channel==='api' && !in_array($action->resource.'.'.$action->name,$ctx->scopes,true))) throw new Failure('Nincs hozzáférés.',403);
    }
    /** A shared row (FB-0175, the resolver's `shared`) is read-only for an actor with a tenant: no write action on it. */
    public static function sharedWrite(Context $ctx, Action $action, array $target): void
    {
        if ($action->write && ($target['shared'] ?? false) === true && $ctx->tenant !== null) throw new Failure('A közös adat csak olvasható.',403);
    }
    /**
     * Object decision of $action. API callers learn nothing about objects they may not use (404); UI callers get 403.
     * With `delegated` rules on a resource declaring a Delegation (FB-0180) the ACL object is first resolved again
     * by that resource's authoritative resolver (tenant realm, `where`, archive), and a row the action's own resolver
     * supplies in $target must be that stored row, so a custom action's row context grants nothing it does not verify.
     * Returns whether the decision is deferred: SqlResource's own `create`, whose handler checks the final values; its
     * field decisions then use the same mode. On the API a delegated write allow also needs the token's `get` scope.
     */
    public function permit(Context $ctx, Action $action, ?string $object, ?string $aclObject, ?string $owner, ?array $target = null): bool
    {
        $scope=$this->registry->delegation($action->resource);
        $delegates=$scope!==null&&$ctx->acl->delegates($ctx->actor->id,$action->resource,$action->name,$ctx->channel);
        if($delegates&&$aclObject!==null)$scope->verify($ctx,$aclObject,$target);
        $deferred=$delegates&&$aclObject===null&&$scope->defers($action->name);
        if (!$ctx->acl->allows($ctx->actor->id,$action->resource,$action->name,$ctx->channel,$aclObject,$owner,'',null,$deferred,self::readable($ctx,$action->resource))) throw new Failure($ctx->channel==='api' && $object!==null ? 'Nem található objektum.' : 'Nincs hozzáférés.',$ctx->channel==='api' && $object!==null ? 404 : 403);
        return $deferred;
    }
    /** Whether a delegated write allow may rely on the row's `get`: always in the UI, with the token's `get` scope on the API. */
    public static function readable(Context $ctx, string $resource): bool { return $ctx->channel!=='api'||in_array($resource.'.get',$ctx->scopes,true); }
    /**
     * UploadPolicy of the action on the direct multipart path: batch quota, a relative path for one part only,
     * then per part the PHP upload error and the policy's name/type/size/folder rules on the received bytes.
     * Rejected parts never reach the handler; with none left the request fails. Returns [Context, failed items].
     */
    private static function uploads(Context $ctx, UploadPolicy $policy, string $relativePath): array
    {
        if(count($ctx->uploads)>$policy->maxFiles)throw new Failure($policy->quota(),400,[],['code'=>'quota']);
        if($relativePath!==''&&count($ctx->uploads)!==1)throw new Failure('A relatív útvonal csak egyetlen fájllal adható meg.');
        $accepted=$rejected=[];
        foreach($ctx->uploads as $upload){
            if(in_array($upload->error,[UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE],true))$problem=['code'=>'too_large','message'=>$policy->tooLarge()];
            elseif($upload->error!==UPLOAD_ERR_OK)$problem=['code'=>'incomplete','message'=>\Blade\I18n\Translator::text('A fájl feltöltése nem sikerült.')];
            else{clearstatcache(true,$upload->path);$problem=$policy->problem($upload->name,(int)@filesize($upload->path),$relativePath);}
            if($problem===null)$accepted[]=$upload;
            else $rejected[]=['name'=>UploadPolicy::shown($upload->name),'code'=>$problem['code'],'error'=>$problem['message']];
        }
        if(!$accepted)throw new Failure('Egyik fájl sem tölthető fel.',400,[],['code'=>$rejected[0]['code'],'failed'=>$rejected]);
        return [$rejected?new Context($ctx->actor,$ctx->channel,$ctx->acl,$ctx->db,$ctx->scopes,$accepted,$ctx->owner,$ctx->tenant):$ctx,$rejected];
    }
    /**
     * Server rule of a `file` field value: a live file of the declared file manager in the declared mount that the actor
     * may read (`thumbnail_get` on that mount), of an accepted MIME class. A missing, other-mount, archived or unreadable
     * file gets one message, so the reply reveals nothing about files the actor cannot see.
     */
    private function fileProblem(Context $ctx, Field $field, string $id): ?string
    {
        $source=$this->registry->mediaSource($field->file['resource']);
        $file=$source instanceof FileSource?$source->file($id):null;
        if(!$file||$file['mount']!==$field->file['mount']||!$source->allows($ctx,'thumbnail_get',$file['mount']))return 'A kiválasztott fájl nem érhető el.';
        foreach($field->file['accept'] as $class)if(str_starts_with((string)$file['mime_type'],$class.'/'))return null;
        return 'A fájl típusa ehhez a mezőhöz nem engedélyezett.';
    }
    public function execute(Context $ctx, string $resource, string $name, ?string $id, array $input, bool $fieldEdit = false, bool $partial = false): mixed
    {
        $fields=[];$detail=[];$claimed=[];
        $ctx->acl->invalidate();
        try {
            $action=$this->registry->get($resource,$name);
            $this->channel($ctx,$action);
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
            self::sharedWrite($ctx,$action,$target);
            // Collection handlers must use the kernel SQL scope; no raw collection result is allowed.
            $deferred=!$action->collection&&$this->permit($ctx,$action,$object,$aclObject,$owner,$target);
            $readable=self::readable($ctx,$resource);
            $known=array_column($action->fields,null,'name');
            if($fieldEdit){
                $edited=array_keys(array_diff_key($input,['revision'=>true]));
                if($name!=='update'||!$action->editHandler||count($edited)!==1||!(($known[$edited[0]]??null)?->column['editable']??false))throw new Failure('Nem szerkeszthető mező.',403);
            }
            foreach ($input as $key=>$value) if (!$action->listSource && !isset($known[$key])) throw new Failure('Ismeretlen vagy nem írható mező.');
            $values=$action->listSource ? $input : [];
            $fieldErrors = [];
            foreach ($action->fields as $field) {
                if(($fieldEdit||$partial)&&$field->name!=='revision'&&!array_key_exists($field->name,$input)&&!($field->visibleWhen!==null&&array_key_exists($field->visibleWhen['field'],$input)))continue;
                $allowed=$ctx->acl->fieldAllowed($ctx->actor->id,$resource,$name,$ctx->channel,$aclObject ?? '',$owner,$field->name,null,$deferred,$readable);
                if(!$allowed){if(array_key_exists($field->name,$input) || ($name==='create' && $field->required))throw new Failure('A mező nem módosítható.',403);continue;}
                // An inactive conditional field is not validated; a save that sends it or its condition field stores it empty.
                if(!$field->active(array_replace(is_array($target['row']??null)?$target['row']:[],$input))){
                    if(array_key_exists($field->name,$input)||array_key_exists($field->visibleWhen['field'],$input)){$values[$field->name]='';if(!$field->secret)$fields[]=$field->name;}
                    else unset($values[$field->name]);
                    continue;
                }
                if (!array_key_exists($field->name,$input) && !$field->required) continue;
                try {
                    $values[$field->name]=$field->validate($input[$field->name] ?? '',$ctx,($fieldEdit||$partial)?array_replace($target['row']??[],$input):$input);
                    // An unchanged stored file id is not re-validated (a file moved out of the mount, or no longer readable, does not block saving other fields).
                    $unchanged=is_array($target['row']??null)&&array_key_exists($field->name,$target['row'])&&(string)$target['row'][$field->name]===(string)$values[$field->name];
                    // A stored file (FB-0167): a new value is a token of the actor's own unexpired upload (FileClaims).
                    if($field->type==='file'&&$values[$field->name]!==''&&!$unchanged){
                        $claim=null;
                        $problem=$field->stored()?FileClaims::problem($ctx,$this->registry,$field,(string)$values[$field->name],$claim):$this->fileProblem($ctx,$field,$values[$field->name]);
                        if($problem!==null)$field->reject($problem);
                        if($claim!==null)$claimed[]=$claim;
                    }
                } catch (Failure $error) {
                    if (!$error->fieldErrors) throw $error;
                    $fieldErrors = array_replace($fieldErrors, $error->fieldErrors);
                }
                if (!$field->secret) $fields[]=$field->name;
            }
            // An exclusive choice (`clears`): a sent value stores the other fields empty; both sent with a value is an error.
            foreach($action->fields as $field){
                if(!$field->clears||!array_key_exists($field->name,$input)||($values[$field->name]??'')==='')continue;
                foreach($field->clears as $other){
                    if(is_scalar($input[$other]??null)&&trim((string)$input[$other])!==''){$fieldErrors[$other]=\Blade\I18n\Translator::text('Nem adható meg együtt ezzel: {field}.',['field'=>\Blade\I18n\Translator::text($field->label)]);continue;}
                    if(!$ctx->acl->fieldAllowed($ctx->actor->id,$resource,$name,$ctx->channel,$aclObject ?? '',$owner,$other,null,$deferred,$readable))throw new Failure('A mező nem módosítható.',403);
                    $values[$other]='';if(!in_array($other,$fields,true))$fields[]=$other;
                }
            }
            if ($fieldErrors) throw new Failure('Javítsd a megjelölt mezőket.', 400, $fieldErrors);
            $rejected=[];
            if($action->upload instanceof UploadPolicy && $ctx->uploads){
                [$ctx,$rejected]=self::uploads($ctx,$action->upload,is_string($values['relative_path']??null)?$values['relative_path']:'');
            }
            // The upload action of a stored file field takes one file of a class some such field accepts (detected from the bytes).
            $stored=$action->upload instanceof UploadPolicy?$this->registry->storedFileFields($resource,$name):[];
            if($stored){
                if(!$ctx->uploads)throw new Failure('Válassz feltöltendő fájlt.');
                if(count($ctx->uploads)!==1)throw new Failure('Ebbe a mezőbe egy fájlt illessz be vagy húzz.',400,[],['code'=>'quota']);
                $mime=FileClaims::detect($ctx->uploads[0]->path);
                if(!array_filter($stored,static fn(Field $field)=>FileClaims::accepts($field->file['accept'],$mime)))throw new Failure('A fájl típusa ehhez a mezőhöz nem engedélyezett.',400,[],['code'=>'type']);
            }
            $handler=$fieldEdit?$action->editHandler:$action->handler;
            try{$result=$handler($ctx,$target,$values);}
            catch(Failure $error){
                // A handler's own per-file report (`failed`, e.g. a 409 conflict) also lists the parts rejected by the policy.
                if(!$rejected||!is_array($error->details['failed']??null))throw $error;
                $failed=[...$rejected,...$error->details['failed']];
                throw new Failure($error->getMessage(),$error->status,$error->fieldErrors,[...$error->details,'failed'=>$failed,...(isset($error->details['code'])?['code'=>$failed[0]['code']]:[])]);
            }
            if($stored){
                $token=is_array($result)?($result['id']??null):null;
                if(!is_string($token)||!preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/D',$token))throw new \LogicException('The upload action of a stored file field returns [\'id\' => token].');
                FileClaims::issue($ctx,$action->upload,$action,$token,$ctx->uploads[0],$mime);
            }
            if($rejected&&is_array($result))$result['failed']=[...$rejected,...(is_array($result['failed']??null)?$result['failed']:[])];
            if($rejected)$detail=[...$detail,'rejected_files'=>count($rejected)];
            $auditObject=$object ?? (is_array($result) && isset($result['id']) ? (string)$result['id'] : '');
            if(is_array($result) && is_array($result['audit'] ?? null))$detail=[...$detail,...$result['audit']];
            if($result instanceof Download||$result instanceof DownloadStream||$result instanceof StreamedDownload)$detail=[...$detail,...$result->audit];
            // `audit_action`: a handler journals a side-effect-free variant under its own name (a delete's usage preview: `delete_preview`); the ACL decision stays on $name.
            $audited=$name;
            if(is_array($result)&&array_key_exists('audit_action',$result)){
                if(!is_string($result['audit_action'])||!preg_match('/^[a-z][a-z0-9_]{0,99}$/D',$result['audit_action']))throw new \LogicException('Invalid audit action.');
                $audited=$result['audit_action'];unset($result['audit_action']);
            }
            $this->journal->record($ctx->actor->id,$ctx->channel,$resource,$audited,$auditObject, 'success',$fields,$detail,$ctx->tenant);
            $this->db->commit();
            FileClaims::release($claimed);
            return $result;
        } catch (\Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            $ctx->acl->invalidate();
            $this->journal->record($ctx->actor->id,$ctx->channel,substr($resource,0,100),substr($name,0,100),substr($id ?? '',0,100),$error instanceof Failure ? 'rejected' : 'error',$fields,$detail,$ctx->tenant);
            if ($error instanceof Failure) throw $error;
            // Developer errors (a misconfigured definition) reach the server log; the caller sees the generic 500.
            if ($error instanceof \LogicException) error_log('61ade: '.$resource.'.'.$name.': '.$error->getMessage());
            if ($error instanceof \PDOException && str_starts_with((string)$error->getCode(),'23')) throw new Failure('Az adat már létezik, vagy hivatkozási feltételt sért.',409);
            throw new Failure('A művelet nem hajtható végre.',500);
        }
    }
}

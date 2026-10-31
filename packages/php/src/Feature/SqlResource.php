<?php
declare(strict_types=1);
namespace Blade\Feature;

/** Generic declared SQL data adapter. Business schemas and rules belong to consumers. */
final class SqlResource
{
    private ?Registry $registry=null;
    /** Delete policy of registerDelete(): `delete` removes the row, `archive` marks it (`archived_at`, `archived_by`) and every framework read hides it. */
    private string $deletePolicy='delete';
    public const DELETE_POLICIES=['delete','archive'];
    /**
     * $search: declared name-search fields of the list (non-secret text/textarea, field ACL applies per actor).
     * $afterSave(Context, string $id, ?array $target, array $values) runs after create/update only;
     * $afterDelete(Context, string $id, array $target) after a delete or archive (not after a preview).
     * $computed: field name => trusted developer SQL expression over the base row alias `blade_base` (e.g. a usage
     * count subquery); such a declared number/text field is read-only, listed, sortable and filterable, never written.
     * A computed text or number field may be a `column.media` column (for example the file id of a referenced record).
     * $tenantColumn: the resource is tenant-scoped. Every list, count, lookup, read, watch and write is limited to the
     * Context's active tenant; create stamps it, a client cannot send it, and another tenant's row is not found.
     * Without an active tenant (tenancy off or no membership) the resource fails closed. Computed SQL is trusted and
     * must itself stay within the row's tenant.
     * $order: manual order, `['field' => number field, 'scope' => field or null]`. The server owns the position: it
     * is read-only, a new record goes last within its scope (the rows with the same scope value), the list is sorted by
     * it, and the registered `move` action (`before`: the id the record moves in front of, '' = last) renumbers the
     * scope. Positions never take part in a record's revision, so moving one record does not make the others stale.
     */
    public function __construct(private string $resource, private string $table, private string $key, private array $fields, private ?string $ownerColumn = null, private array $defaults = [], private ?\Closure $guard = null, private ?\Closure $normalize = null, private string $where = '1=1', private bool $selfOnly = false, private ?\Closure $afterSave = null, private ?\Closure $deleteGuard = null, private array $related = [], private array $readOnly = [], private array $unique = [], private bool $acceptOwnerInput = false, private array $search = [], private ?\Closure $afterDelete = null, private array $computed = [], private ?string $tenantColumn = null, private ?array $order = null)
    {
        $known=array_column($fields,null,'name');
        foreach($computed as $name=>$sql){
            $field=is_string($name)?($known[$name]??null):null;
            if(!$field||!in_array($field->type,['number','text'],true)||$field->secret||($field->column['editable']??false)||$field->file!==null||($field->validation['unique']??false)||in_array($name,array_merge(...$unique ?: [[]]),true)||isset($defaults[$name])||$name===$ownerColumn
                ||!is_string($sql)||trim($sql)===''||str_contains($sql,';')||str_contains($sql,'?')||str_contains($sql,"\0"))throw new \InvalidArgumentException('Invalid computed column.');
        }
        if($order!==null){
            $field=is_string($order['field']??null)?($known[$order['field']]??null):null;
            $scope=$order['scope']??null;
            if(array_diff(array_keys($order),['field','scope'])||!$field||$field->type!=='number'||$field->secret||($field->column['editable']??false)||$field->media()!==null||isset($computed[$field->name])||isset($defaults[$field->name])
                ||($scope!==null&&(!is_string($scope)||!isset($known[$scope])||isset($computed[$scope])||$scope===$field->name)))throw new \InvalidArgumentException('Invalid manual order.');
            $this->order=['field'=>$field->name,'scope'=>$scope];
        }
        $this->readOnly=$readOnly=array_values(array_unique([...$readOnly,...array_keys($computed),...($this->order?[$this->order['field']]:[])]));
        // Read-only fields are listed and revisioned but never part of create/update input.
        if (array_diff($readOnly, array_map(static fn($f)=>$f->name,$fields))) throw new \InvalidArgumentException('Unknown read-only field');
        // Composite unique keys: each entry lists field, default or owner columns that together must be unique.
        $declared=[...array_map(static fn($f)=>$f->name,$fields),...array_keys($defaults),...($ownerColumn?[$ownerColumn]:[])];
        foreach ($unique as $columns) if (!is_array($columns) || !array_is_list($columns) || !$columns || array_diff($columns,$declared) || count(array_unique($columns))!==count($columns)) throw new \InvalidArgumentException('Invalid unique key');
        if ($tenantColumn !== null && (in_array($tenantColumn,[$key,$ownerColumn,...array_keys($defaults),...array_map(static fn($f)=>$f->name,$fields)],true) || in_array($tenantColumn,array_merge(...$unique ?: [[]]),true))) throw new \InvalidArgumentException('The tenant column is set by the server only.');
        foreach ([$table,$key,...array_keys($defaults),...array_map(static fn($f)=>$f->name,$fields),...($ownerColumn?[$ownerColumn]:[]),...($tenantColumn!==null?[$tenantColumn]:[])] as $column) if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$column)) throw new \InvalidArgumentException('Invalid SQL identifier');
    }
    /** `archived_at`/`archived_by` verified once (first archive-aware read or delete) on the connection in use. */
    private bool $archiveColumns=false;
    private function archive(): bool { return $this->deletePolicy==='archive'; }
    /** The active tenant of a tenant-scoped resource (null when unscoped); fails closed without one. */
    private function tenant(Context $ctx): ?string
    {
        if($this->tenantColumn===null)return null;
        return $ctx->tenant ?? throw new Failure('Nincs aktív tenant.',403);
    }
    /**
     * Policy `archive` needs the consumer columns; checked lazily on first use (registration has no database) with a
     * developer error instead of an SQL error deep inside a read.
     */
    private function archiveReady(\PDO $db): void
    {
        if(!$this->archive()||$this->archiveColumns)return;
        try{$ok=@$db->query("SELECT archived_at, archived_by FROM {$this->table} WHERE 1=0")!==false;}catch(\PDOException){$ok=false;}
        if(!$ok)throw new \LogicException("Delete policy 'archive' of {$this->resource} needs the columns archived_at (NULL) and archived_by on {$this->table}.");
        $this->archiveColumns=true;
    }
    /** Row source of every listing read: related and computed columns, archived rows left out (delete policy `archive`). */
    private function source(Context $ctx): string
    {
        $this->archiveReady($ctx->db);
        $expressions = [];
        foreach ($this->related as $storage) $expressions = [...$expressions, ...$storage->expressions($ctx->db, $this->key)];
        // Text like stored columns (RelatedStorage does the same): filters bind strings, number sorting casts.
        foreach ($this->computed as $name => $sql) $expressions[] = "CAST(($sql) AS CHAR) AS $name";
        if (!$expressions && !$this->archive()) return $this->table;
        return '(SELECT blade_base.*'.($expressions ? ', '.implode(', ', $expressions) : '')." FROM {$this->table} blade_base".($this->archive() ? ' WHERE blade_base.archived_at IS NULL' : '').') blade_source';
    }
    /**
     * Registers `list`, `get`, optional `create`/`update` and the list view (id $id, default the resource; see
     * Registry::view() for the presentation options, $activate, $commands and $guide) and returns that View.
     */
    public function register(Registry $registry, string $title, bool $create = true, bool $update = true, ?string $group = null, ?ViewLayout $layout = null, bool $selection = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false, string|array|null $activate = null, ?string $id = null, array $commands = [], ?string $guide = null): View
    {
        $this->registry=$registry;
        $registry->registerFields($this->resource,$this->fields);
        $mapped = [];
        $known = array_column($this->fields, null, 'name');
        foreach ($this->related as $storage) {
            if (!$storage instanceof RelatedStorage && !$storage instanceof RelatedSet) throw new \InvalidArgumentException('Invalid related storage.');
            foreach ($storage->fields as $field => $column) {
                if (!isset($known[$field]) || isset($mapped[$field]) || isset($this->computed[$field]) || $field === $this->key || $field === $this->ownerColumn || isset($this->defaults[$field]) || ($known[$field]->validation['unique'] ?? false) || in_array($field, array_merge(...$this->unique ?: [[]]), true)) throw new \InvalidArgumentException('Invalid related field mapping.');
                $mapped[$field] = true;
            }
        }
        if($this->tenantColumn!==null)$registry->scopeToTenant($this->resource);
        $source=new ListSource($this->resource,$this->table,$this->key,$this->fields,$this->ownerColumn,$this->where,fn($c,$row)=>$this->project($c,$row,'list'),fn($c)=>$this->source($c),$this->search,$registry,$this->tenantColumn,order:$this->order);
        // The cursor API only: a list takes no object id (the removed offset paging used one).
        $registry->add(new Action($this->resource,'list','Lista',[],fn(Context $c,$t,$values)=>($t['id']??'')==='' ? $source->read($c,$values) : throw new Failure('Hibás lapozás.'),collection:true,listSource:$source));
        $registry->add(new Action($this->resource,'get','Megnyitás',[],fn(Context $c,$t)=>$source->media($c,[$this->project($c,$t['row'],'get')])[0],resolve:fn($c,$id)=>$this->target($c,$id)));
        $actions=['get'];
        $writable=array_values(array_filter($this->fields,fn($f)=>!in_array($f->name,$this->readOnly,true)));
        if($create) {
            $registry->add(new Action($this->resource,'create','Új', $writable, fn($c,$t,$v)=>$this->save($c,null,$v),resolve:fn($c)=>['id'=>null,'owner'=>$this->ownerColumn?$c->actor->id:null],write:true));
            $actions[]='create';
        }
        if($update) {
            $registry->add(new Action($this->resource,'update','Mentés',[...$writable,new Field('revision','Verzió',required:true,max:64)],fn($c,$t,$v)=>$this->save($c,$t,$v),resolve:fn($c,$id)=>$this->target($c,$id),write:true,editHandler:fn($c,$t,$v)=>$this->save($c,$t,$v,true),bulk:(bool) array_filter($writable,static fn($field)=>$field->bulk)));
            $actions[]='update';
            if($this->order){
                $registry->add(new Action($this->resource,'move','Áthelyezés',[new Field('before','Elé',max:100),new Field('revision','Verzió',required:true,max:64)],fn($c,$t,$v)=>$this->move($c,$t,$v),resolve:fn($c,$id)=>$this->target($c,$id),write:true,channels:['ui']));
                $actions[]='move';
            }
        }
        return $registry->view($this->resource,$title,array_map(static fn($f)=>['id'=>$f->name,'header'=>$f->label],$this->fields),$actions,group:$group,layout:$layout,selection:$selection,rowSelection:$rowSelection,rowHeight:$rowHeight,tileMinWidth:$tileMinWidth,tiles:$tiles,activate:$activate,id:$id,commands:$commands,guide:$guide);
    }
    /**
     * Bulk-capable delete with the definition's policy: `delete` (default; needs no extra columns) removes the row and its
     * related storage; `archive` (recommended for new development) needs the consumer columns `archived_at` (NULL) and
     * `archived_by` and hides the row from every framework read. `preview: '1'` changes nothing and returns
     * `{count: 1, usages}` of the registered UsageProviders; an applied delete calls their clear() and reports `cleared`.
     */
    public function registerDelete(Registry $registry, string $deletePolicy = 'delete'):void
    {
        if(!in_array($deletePolicy,self::DELETE_POLICIES,true))throw new \InvalidArgumentException('Invalid delete policy.');
        $this->deletePolicy=$deletePolicy;
        $this->registry??=$registry;
        $registry->add(new Action($this->resource,'delete','Törlés',[new Field('revision','Verzió',required:true,max:64),new Field('preview','Előnézet','checkbox')],function(Context $ctx,array $target,array $values) use ($registry):array{
            if(!hash_equals($this->revision($target['row']),$values['revision']))throw new Failure('Az adat közben módosult.',409);
            if($this->deleteGuard)($this->deleteGuard)($ctx,$target);
            $providers=$registry->usageProviders($this->resource);
            $usages=Usages::count($ctx,$providers,[$target['id']]);
            // The preview changes nothing; it is journaled as `delete_preview` (ACL decision on `delete`).
            if(($values['preview']??'0')==='1')return ['count'=>1,'usages'=>$usages,'audit_action'=>'delete_preview'];
            if($this->archive()){
                $q=$ctx->db->prepare("UPDATE {$this->table} SET archived_at=?, archived_by=? WHERE {$this->key}=? AND archived_at IS NULL");$q->execute([gmdate('Y-m-d\\TH:i:s\\Z'),substr($ctx->actor->id,0,64),$target['id']]);
            }else{
                foreach ($this->related as $storage) $storage->delete($ctx->db,$target['id']);
                $q=$ctx->db->prepare("DELETE FROM {$this->table} WHERE {$this->key}=?");$q->execute([$target['id']]);
            }
            $cleared=Usages::clear($ctx,$providers,[$target['id']],$this->deletePolicy,$usages);
            $ctx->acl->invalidate();
            if($this->afterDelete)($this->afterDelete)($ctx,$target['id'],$target);
            return ['cleared'=>$cleared,'policy'=>$this->deletePolicy,'audit'=>['policy'=>$this->deletePolicy,...($cleared?['cleared'=>$cleared]:[])]];
        },resolve:fn($c,$id)=>$this->target($c,$id),write:true,channels:['ui'],bulk:true,confirm:[
            'message' => $this->archive() ? 'A kiválasztott adat archiválódik, és többé nem jelenik meg.' : 'A kiválasztott adat végleg törlődik.',
            'title' => 'Törlés',
            'severity' => 'danger',
            'confirm_label' => 'Törlés',
            'cancel_label' => 'Mégse',
        ]));
        foreach($registry->views() as $view)if($view->resource===$this->resource&&$view->kind==='list')$registry->appendViewActions($view->id,['delete']);
    }
    public function target(Context $ctx, ?string $id): array
    {
        if($this->selfOnly) { if($id!==$ctx->actor->id && $id!=='self')throw new Failure('Csak a saját profil érhető el.',403); $id=$ctx->actor->id; }
        if($id===null || !preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$id)) throw new Failure('Hiányzó objektum.',404);
        $this->archiveReady($ctx->db);
        $tenant=$this->tenant($ctx);
        $q=$ctx->db->prepare("SELECT * FROM {$this->table} WHERE {$this->key} = ? AND ({$this->where})".($tenant!==null?" AND {$this->tenantColumn} = ?":'').($this->archive()?' AND archived_at IS NULL':'').($ctx->db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''));
        $q->execute($tenant!==null?[$id,$tenant]:[$id]); $row=$q->fetch(\PDO::FETCH_ASSOC);
        if(!$row)throw new Failure('Nem található objektum.',404);
        if($this->computed){
            $q=$ctx->db->prepare('SELECT '.implode(', ',array_map(static fn($name,$sql)=>"CAST(($sql) AS CHAR) AS $name",array_keys($this->computed),$this->computed))." FROM {$this->table} blade_base WHERE blade_base.{$this->key} = ?");
            $q->execute([$row[$this->key]]);$row=array_replace($row,$q->fetch(\PDO::FETCH_ASSOC)?:[]);
        }
        foreach ($this->related as $storage) $row = array_replace($row, $storage->read($ctx->db, (string)$row[$this->key]));
        return ['id'=>(string)$row[$this->key],'owner'=>$this->ownerColumn?(string)$row[$this->ownerColumn]:null,'row'=>$row];
    }
    public function project(Context $ctx,array $row,string $action): array
    {
        $id=(string)$row[$this->key];$owner=$this->ownerColumn?(string)$row[$this->ownerColumn]:null;
        $out=['id'=>$id,'revision'=>$this->revision($row)];
        foreach($this->fields as $field) if(!$field->secret && $ctx->acl->fieldAllowed($ctx->actor->id,$this->resource,$action,$ctx->channel,$id,$owner,$field->name))$out[$field->name]=$row[$field->name];
        $out['_actions']=[];
        $out['_editable']=[];
        foreach($this->registry?->all()??[] as $action)if($action->resource===$this->resource && in_array($ctx->channel,$action->channels,true) && $ctx->acl->allows($ctx->actor->id,$this->resource,$action->name,$ctx->channel,$id,$owner))$out['_actions'][]=$action->name;
        if(in_array('update',$out['_actions'],true))foreach($this->fields as $field){
            if(($field->column['editable']??false)&&!$field->secret&&array_key_exists($field->name,$out)&&$ctx->acl->fieldAllowed($ctx->actor->id,$this->resource,'update',$ctx->channel,$id,$owner,$field->name))$out['_editable'][]=$field->name;
        }
        return $out;
    }
    private function revision(array $row): string
    {
        // Computed values and manual positions change with other records; they never make a stored revision stale.
        $columns=[$this->key,...array_diff(array_map(static fn($f)=>$f->name,$this->fields),array_keys($this->computed),$this->order?[$this->order['field']]:[]),...($this->ownerColumn?[$this->ownerColumn]:[])];
        return hash('sha256',json_encode(array_map(static fn($value)=>$value===null?null:(string)$value,array_intersect_key($row,array_flip($columns))),JSON_THROW_ON_ERROR));
    }
    /** SQL condition and parameters of the rows sharing $row's manual-order scope (same scope value, tenant, not archived). */
    private function orderScope(Context $ctx, array $row): array
    {
        $terms=["({$this->where})"];$params=[];
        if($this->order['scope']!==null){$terms[]="COALESCE(CAST({$this->order['scope']} AS CHAR),'') = ?";$params[]=(string)($row[$this->order['scope']]??'');}
        if(($tenant=$this->tenant($ctx))!==null){$terms[]="{$this->tenantColumn} = ?";$params[]=$tenant;}
        if($this->archive())$terms[]='archived_at IS NULL';
        return [implode(' AND ',$terms),$params];
    }
    /** `move`: places the record in front of `before` (another record of its scope; '' = last) and renumbers the scope 1…n. */
    private function move(Context $ctx, array $target, array $values): array
    {
        if(!hash_equals($this->revision($target['row']),$values['revision']))throw new Failure('Az adat közben módosult. Nyisd meg újra.',409);
        $this->archiveReady($ctx->db);
        [$where,$params]=$this->orderScope($ctx,$target['row']);
        $field=$this->order['field'];
        $q=$ctx->db->prepare("SELECT {$this->key} AS id, $field AS position FROM {$this->table} WHERE $where ORDER BY CAST($field AS INTEGER), {$this->key}");$q->execute($params);
        $rows=$q->fetchAll(\PDO::FETCH_ASSOC);
        $current=array_column($rows,'position','id');
        $ids=array_values(array_filter(array_map('strval',array_column($rows,'id')),static fn($id)=>$id!==$target['id']));
        $before=(string)($values['before']??'');
        $at=$before===''?count($ids):array_search($before,$ids,true);
        if($at===false)throw new Failure('Javítsd a megjelölt mezőket.',400,['before'=>'Ez az elem nincs ebben a listában.']);
        array_splice($ids,$at,0,[$target['id']]);
        $update=$ctx->db->prepare("UPDATE {$this->table} SET $field = ? WHERE {$this->key} = ?");
        foreach($ids as $index=>$id)if((string)($current[$id]??'')!==(string)($index+1))$update->execute([$index+1,$id]);
        return ['id'=>$target['id'],'position'=>$at+1,'audit'=>['before'=>$before,'position'=>$at+1]];
    }
    public function save(Context $ctx, ?array $target, array $values, bool $fieldEdit = false): array
    {
        if($target && !hash_equals($this->revision($target['row']),$values['revision'] ?? ''))throw new Failure('Az adat közben módosult. Nyisd meg újra.',409);
        unset($values['revision']);
        $this->archiveReady($ctx->db);
        // Uniqueness is per tenant: another tenant's values are neither visible nor in the way.
        $tenant=$this->tenant($ctx);
        $inTenant=$tenant!==null?" AND {$this->tenantColumn} = ?":'';
        $ruleValues=$target?array_replace(array_intersect_key($target['row'],array_column($this->fields,null,'name')),$values):$values;
        if($this->guard)($this->guard)($ctx,$target,$ruleValues);
        if($this->normalize){$normalized=($this->normalize)($ctx,$target,$ruleValues);$values=$target?array_intersect_key($normalized,$values):$normalized;}
        foreach ($this->fields as $field) {
            if (!($field->validation['unique'] ?? false) || !isset($values[$field->name]) || $values[$field->name] === '') continue;
            $sql = "SELECT {$this->key} FROM {$this->table} WHERE {$field->name} = ?".($this->archive() ? ' AND archived_at IS NULL' : '').$inTenant;
            $params = $tenant !== null ? [$values[$field->name], $tenant] : [$values[$field->name]];
            if ($target) { $sql .= " AND {$this->key} <> ?"; $params[] = $target['id']; }
            $query = $ctx->db->prepare($sql.' LIMIT 1');
            $query->execute($params);
            if ($query->fetchColumn() !== false) $field->reject('Ez az érték már használatban van.');
        }
        foreach ($this->unique as $columns) {
            $row = $target ? array_replace($target['row'], $values) : array_merge($this->defaults, $values);
            if (!$target && $this->ownerColumn && (!$this->acceptOwnerInput || !array_key_exists($this->ownerColumn, $row))) $row[$this->ownerColumn] = $ctx->actor->id;
            $conditions = []; $params = [];
            foreach ($columns as $column) {
                $value = (string) ($row[$column] ?? '');
                if ($value === '') $conditions[] = "($column = '' OR $column IS NULL)";
                else { $conditions[] = "$column = ?"; $params[] = $value; }
            }
            if ($tenant !== null) { $conditions[] = "{$this->tenantColumn} = ?"; $params[] = $tenant; }
            $sql = "SELECT {$this->key} FROM {$this->table} WHERE ".implode(' AND ', [...$conditions, ...($this->archive() ? ['archived_at IS NULL'] : [])]);
            if ($target) { $sql .= " AND {$this->key} <> ?"; $params[] = $target['id']; }
            $query = $ctx->db->prepare($sql.' LIMIT 1');
            $query->execute($params);
            if ($query->fetchColumn() !== false) {
                $message = 'Ilyen bejegyzés már létezik.';
                throw new Failure($message, 409, array_fill_keys(array_values(array_intersect($columns, array_map(static fn($f) => $f->name, $this->fields))), $message));
            }
        }
        $allValues=$values;
        foreach ($this->related as $storage) $values = array_diff_key($values, $storage->fields);
        if($target){
            if(!$allValues)throw new Failure('Nincs módosítás.');
            if($values){$q=$ctx->db->prepare("UPDATE {$this->table} SET ".implode(',',array_map(static fn($k)=>"$k = ?",array_keys($values)))." WHERE {$this->key} = ?");
            $q->execute([...array_values($values),$target['id']]);}$id=$target['id'];
        }else{
            $values=array_merge($this->defaults,$values);
            if($this->ownerColumn && (!$this->acceptOwnerInput || !array_key_exists($this->ownerColumn,$values)))$values[$this->ownerColumn]=$ctx->actor->id;
            if($tenant!==null)$values[$this->tenantColumn]=$tenant;
            if($this->order){
                [$where,$params]=$this->orderScope($ctx,$values);
                $q=$ctx->db->prepare("SELECT COALESCE(MAX(CAST({$this->order['field']} AS INTEGER)),0)+1 FROM {$this->table} WHERE $where");$q->execute($params);
                $values[$this->order['field']]=(int)$q->fetchColumn();
            }
            $q=$ctx->db->prepare("INSERT INTO {$this->table} (".implode(',',array_keys($values)).') VALUES ('.implode(',',array_fill(0,count($values),'?')).')');$q->execute(array_values($values));$id=$ctx->db->lastInsertId();
        }
        foreach ($this->related as $storage) $storage->save($ctx->db,(string)$id,$allValues);
        $ctx->acl->invalidate();
        $result=$this->afterSave?($this->afterSave)($ctx,(string)$id,$target,$allValues):null;
        $response=[...(is_array($result)?$result:[]),'id'=>(string)$id];
        if($fieldEdit){
            $fresh=$this->target($ctx,(string)$id)['row'];
            $response['revision']=$this->revision($fresh);
            $response['values']=array_intersect_key($fresh,$allValues);
        }
        return $response;
    }
}

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
     * A computed text, number or select field (FB-0212: its options label the values, filtered like a stored one) may be a `column.media` column (for example the file id of a referenced record).
     * $tenantColumn: the resource is tenant-scoped. Every list, count, lookup, read, watch and write is limited to the
     * Context's active tenant; create stamps it, a client cannot send it, and another tenant's row is not found.
     * Without an active tenant (tenancy off or no membership) the resource fails closed. Computed SQL is trusted and
     * must itself stay within the row's tenant.
     * $sharedTenant: the tenant column value of shared rows (FB-0175; needs $tenantColumn; never a tenant id, '' is
     * usual). Every tenant reads them beside its own rows (`_shared: true`), and no write action reaches them with an
     * active tenant (403; they are left out of `_actions`). An actor without a tenant who holds one of the $sharedRoles
     * (role keys) reads and writes the shared rows only: create stamps the shared value. A row never changes realm.
     * $order: manual order, `['field' => number field, 'scope' => field or null]`. The server owns the position: it
     * is read-only, a new record goes last within its scope (the rows with the same scope value), the list is sorted by
     * it, and the registered `move` action (`before`: the id the record moves in front of, '' = last) renumbers the
     * scope. Positions never take part in a record's revision, so moving one record does not make the others stale.
     * $createOnly: fields chosen at create and fixed afterwards (FB-0171): create writes them, update does not take
     * them (a save that sends one is refused) and its form shows them read-only (`Action::$display`).
     * $counts: count fields (FB-0173), name => ['resource' => a registered resource with an SQL list source, 'match' =>
     * its queryable fields, 'filters' => optional fixed exact values of its filterable fields, 'on' => optional field of
     * this row instead of its key]. The value is the number of the counted resource's records that the same actor,
     * channel and tenant could list (its list ACL, `where`, tenant scope and archive policy) with any `match` field equal
     * to the row's key (or `on`), one grouped count per page and field; left out when it cannot be counted for the actor.
     * A count field is a declared number field: read-only, not part of the revision, not filterable or sortable.
     * $delegation: opt-in delegated access (FB-0180): ACL rules with scope `delegated` match the rows the actor reaches
     * through the declared consumer link tables (Delegation). Each link's `resourceColumn` is a stored column of this
     * resource (the key, a stored field such as a parent foreign key, a default or the owner column); computed, related,
     * count and secret fields are not. Without a declaration a `delegated` rule fails the operation.
     * $tenantSingleton: one record per tenant (FB-0258), keyed by $tenantColumn ($key === $tenantColumn, unique in the
     * table). Its view is a singleton; `get` and `update` address it as `self` only, the first save creates it, and a
     * tenant without a row reads the field defaults. It has no create or delete, owner, shared rows, order, delegation,
     * related or count storage, `where` or unique rules. Computed values are empty until the row exists.
     */
    public function __construct(private string $resource, private string $table, private string $key, private array $fields, private ?string $ownerColumn = null, private array $defaults = [], private ?\Closure $guard = null, private ?\Closure $normalize = null, private string $where = '1=1', private bool $selfOnly = false, private ?\Closure $afterSave = null, private ?\Closure $deleteGuard = null, private array $related = [], private array $readOnly = [], private array $unique = [], private bool $acceptOwnerInput = false, private array $search = [], private ?\Closure $afterDelete = null, private array $computed = [], private ?string $tenantColumn = null, private ?array $order = null, private array $createOnly = [], private array $counts = [], private ?string $sharedTenant = null, private array $sharedRoles = [], private ?Delegation $delegation = null, private bool $tenantSingleton = false)
    {
        $known=array_column($fields,null,'name');
        foreach($computed as $name=>$sql){
            $field=is_string($name)?($known[$name]??null):null;
            if(!$field||!in_array($field->type,['number','text','select'],true)||$field->secret||($field->column['editable']??false)||$field->file!==null||($field->validation['unique']??false)||in_array($name,array_merge(...$unique ?: [[]]),true)||isset($defaults[$name])||$name===$ownerColumn
                ||!is_string($sql)||trim($sql)===''||str_contains($sql,';')||str_contains($sql,'?')||str_contains($sql,"\0"))throw new \InvalidArgumentException('Invalid computed column.');
        }
        if($order!==null){
            $field=is_string($order['field']??null)?($known[$order['field']]??null):null;
            $scope=$order['scope']??null;
            if(array_diff(array_keys($order),['field','scope'])||!$field||$field->type!=='number'||$field->secret||($field->column['editable']??false)||$field->media()!==null||isset($computed[$field->name])||isset($defaults[$field->name])
                ||($scope!==null&&(!is_string($scope)||!isset($known[$scope])||isset($computed[$scope])||$scope===$field->name)))throw new \InvalidArgumentException('Invalid manual order.');
            $this->order=['field'=>$field->name,'scope'=>$scope];
        }
        foreach($counts as $name=>$count){
            $field=is_string($name)?($known[$name]??null):null;$filters=is_array($count)?($count['filters']??[]):null;
            if(!$field||$field->type!=='number'||$field->secret||$field->scopeOnly||($field->column['editable']??false)||$field->media()!==null||$field->bulk||($field->validation['unique']??false)
                ||isset($computed[$name])||isset($defaults[$name])||$name===$ownerColumn||in_array($name,array_merge(...$unique ?: [[]]),true)||($order['field']??null)===$name
                ||!is_array($count)||array_diff(array_keys($count),['resource','match','filters','on'])||!is_string($count['resource']??null)||!preg_match('/^[a-z][a-z0-9_.-]*$/D',$count['resource'])
                ||!is_array($count['match']??null)||!$count['match']||!array_is_list($count['match'])||count($count['match'])>10||count(array_unique($count['match']))!==count($count['match'])
                ||array_filter($count['match'],static fn($match)=>!is_string($match)||!preg_match('/^[a-z][a-z0-9_]*$/D',$match))
                ||!is_array($filters)||($filters&&array_is_list($filters))||count($filters)>10||array_filter(array_keys($filters),static fn($key)=>!preg_match('/^[a-z][a-z0-9_]*$/D',(string)$key))||array_filter($filters,static fn($value)=>!is_string($value)||strlen($value)>255)
                ||(array_key_exists('on',$count)&&(!is_string($count['on'])||($count['on']!=='id'&&(!isset($known[$count['on']])||isset($counts[$count['on']])||$known[$count['on']]->secret)))))throw new \InvalidArgumentException('Invalid count field.');
        }
        $this->readOnly=$readOnly=array_values(array_unique([...$readOnly,...array_keys($computed),...($this->order?[$this->order['field']]:[]),...array_keys($counts)]));
        // Read-only fields are listed and revisioned but never part of create/update input.
        if (array_diff($readOnly, array_map(static fn($f)=>$f->name,$fields))) throw new \InvalidArgumentException('Unknown read-only field');
        // A create-only field is a written, readable field that no update path (form, cell, bulk) can change.
        foreach($createOnly as $name){
            $field=is_string($name)?($known[$name]??null):null;
            if(!$field||in_array($name,$readOnly,true)||$field->secret||$field->type==='password'||($field->column['editable']??false)||$field->bulk)throw new \InvalidArgumentException('Invalid create-only field.');
        }
        if(!array_is_list($createOnly)||count(array_unique($createOnly))!==count($createOnly))throw new \InvalidArgumentException('Invalid create-only field.');
        // Composite unique keys: each entry lists field, default or owner columns that together must be unique.
        $declared=[...array_map(static fn($f)=>$f->name,$fields),...array_keys($defaults),...($ownerColumn?[$ownerColumn]:[])];
        foreach ($unique as $columns) if (!is_array($columns) || !array_is_list($columns) || !$columns || array_diff($columns,$declared) || count(array_unique($columns))!==count($columns)) throw new \InvalidArgumentException('Invalid unique key');
        if (($sharedTenant !== null && ($tenantColumn === null || !preg_match('/^[a-zA-Z0-9_.:-]{0,100}$/D', $sharedTenant))) || ($sharedRoles && $sharedTenant === null)
            || !array_is_list($sharedRoles) || count($sharedRoles) > 20 || count(array_unique($sharedRoles)) !== count($sharedRoles)
            || array_filter($sharedRoles, static fn($role) => !is_string($role) || !preg_match('/^[a-z][a-z0-9_]*$/D', $role))) throw new \InvalidArgumentException('Invalid shared tenant declaration.');
        // SQL column names ignore case, so another spelling of the tenant column is the same column.
        if ($tenantColumn !== null && (in_array(strtolower($tenantColumn),array_map('strtolower',array_filter([...($tenantSingleton?[]:[$key]),$ownerColumn,...array_keys($defaults),...array_map(static fn($f)=>$f->name,$fields),...array_merge(...$unique ?: [[]])],'is_string')),true))) throw new \InvalidArgumentException('The tenant column is set by the server only.');
        if ($tenantSingleton && ($tenantColumn === null || $key !== $tenantColumn || $selfOnly || $ownerColumn !== null || $sharedTenant !== null || $order !== null || $delegation !== null || $related || $counts || $unique || $createOnly || $where !== '1=1'
            || array_filter($fields, static fn($f) => $f->validation['unique'] ?? false))) throw new \InvalidArgumentException('Invalid tenant singleton: '.$resource);
        foreach ([$table,$key,...array_keys($defaults),...array_map(static fn($f)=>$f->name,$fields),...($ownerColumn?[$ownerColumn]:[]),...($tenantColumn!==null?[$tenantColumn]:[])] as $column) if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$column)) throw new \InvalidArgumentException('Invalid SQL identifier');
    }
    /** `archived_at`/`archived_by` verified once (first archive-aware read or delete) on the connection in use. */
    private bool $archiveColumns=false;
    /** Whether the database keeps the key unique (keyIndexed()), read once on the connection in use. */
    private ?bool $keyUnique=null;
    /** Whether every related key compares at least as strictly as the key (relatedKeysExact()), read once. */
    private ?bool $relatedExact=null;
    private function archive(): bool { return $this->deletePolicy==='archive'; }
    /** The tenant realm of $ctx (Registry::realm(): `read` values, `write` value); null when unscoped; fails closed. */
    private function realm(Context $ctx): ?array
    {
        if($this->tenantColumn===null)return null;
        if(($realm=$this->registry?->realm($ctx,$this->resource))!==null)return $realm;
        $tenant=$ctx->tenant ?? throw new Failure('Nincs aktív tenant.',403);
        return ['read'=>[$tenant],'write'=>$tenant,'shared'=>null];
    }
    /** Whether $row is a shared row (FB-0175). */
    private function shared(array $row): bool
    {
        return $this->sharedTenant!==null&&array_key_exists($this->tenantColumn,$row)&&(string)$row[$this->tenantColumn]===$this->sharedTenant;
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
        foreach ($this->computed as $name => $sql) $expressions[] = "CAST(($sql) AS CHAR) AS `$name`";
        $this->keyReady($ctx);
        if (!$expressions && !$this->archive()) return $this->table;
        return '(SELECT blade_base.*'.($expressions ? ', '.implode(', ', $expressions) : '')." FROM {$this->table} blade_base".($this->archive() ? ' WHERE blade_base.archived_at IS NULL' : '').') blade_source';
    }
    /** Related and delegation storage and shared rows name a record by its key alone: it must be unique across tenants (FB-0258). */
    private function keyBound(): bool
    {
        return $this->tenantColumn!==null&&!$this->tenantSingleton&&($this->related||$this->delegation!==null||$this->sharedTenant!==null);
    }
    /** Whether the database itself keeps the key unique: a one-column primary key or unique index. */
    private function keyIndexed(\PDO $db): bool
    {
        $driver=$db->getAttribute(\PDO::ATTR_DRIVER_NAME);
        if($driver==='sqlite'){
            $primary=array_column(array_filter($db->query("PRAGMA table_info({$this->table})")->fetchAll(\PDO::FETCH_ASSOC),static fn($c)=>(int)$c['pk']>0),'name');
            if($primary===[$this->key])return true;
            foreach($db->query("PRAGMA index_list({$this->table})")->fetchAll(\PDO::FETCH_ASSOC) as $index)
                if((int)$index['unique']===1&&(int)($index['partial']??0)===0&&array_column($db->query('PRAGMA index_info("'.str_replace('"','""',$index['name']).'")')->fetchAll(\PDO::FETCH_ASSOC),'name')===[$this->key])return true;
            return false;
        }
        if($driver!=='mysql')return false;
        $indexes=[];
        foreach($db->query("SHOW INDEX FROM `{$this->table}` WHERE Non_unique = 0")->fetchAll(\PDO::FETCH_ASSOC) as $part)$indexes[$part['Key_name']][]=$part['Column_name'];
        return in_array([$this->key],$indexes,true);
    }
    /** A key column's comparison: numeric (canonical values) or text under a collation; null when it cannot be read. */
    private static function keyColumn(\PDO $db, string $table, string $column): ?array
    {
        if($db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'){
            $q=$db->prepare('SELECT DATA_TYPE, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');$q->execute([$table,$column]);
            $found=$q->fetch(\PDO::FETCH_NUM);
            return $found?['numeric'=>in_array(strtolower((string)$found[0]),['tinyint','smallint','mediumint','int','bigint','decimal','float','double'],true),'collation'=>strtolower((string)$found[1])]:null;
        }
        foreach($db->query("PRAGMA table_info($table)")->fetchAll(\PDO::FETCH_ASSOC) as $found){
            if(strcasecmp((string)$found['name'],$column)!==0)continue;
            $sql=(string)$db->query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ".$db->quote($table))->fetchColumn();
            preg_match('/(?:^|[(,\s"`\[])'.preg_quote($column,'/').'["`\]]?\s[^,]*?\bCOLLATE\s+"?(\w+)/i',$sql,$collation);
            return ['numeric'=>(bool)preg_match('/INT|REAL|FLOA|DOUB|NUM|DEC/i',(string)$found['type']),'collation'=>strtolower($collation[1]??'binary')];
        }
        return null;
    }
    /** A related key that compares more loosely than a text key ('ABC' = 'abc', '007' = 7) would join two tenants' records. */
    private function relatedKeysExact(\PDO $db): bool
    {
        if(!in_array($db->getAttribute(\PDO::ATTR_DRIVER_NAME),['sqlite','mysql'],true))return true;
        $base=self::keyColumn($db,$this->table,$this->key);
        if($base===null)return false;
        if($base['numeric'])return true;
        foreach($this->related as $storage){
            $column=self::keyColumn($db,$storage->table,$storage->key);
            if($column===null||$column['numeric']||($column['collation']!==$base['collation']&&$column['collation']!=='binary'&&!str_ends_with($column['collation'],'_bin')))return false;
        }
        return true;
    }
    /**
     * Fails closed: a key-bound resource whose table holds a repeated key, or whose related key compares more loosely,
     * serves no list or record. After a write ($written) a repeated key is a 409, so the executor's rollback undoes a key
     * the database generated.
     */
    private function keyReady(Context $ctx, bool $written = false): void
    {
        if(!$this->keyBound())return;
        if($this->related&&!($this->relatedExact??=$this->relatedKeysExact($ctx->db)))throw new \LogicException("The related key of {$this->resource} must compare as strictly as its key, which must be unique across tenants.");
        if($this->keyUnique??=$this->keyIndexed($ctx->db))return;
        if($ctx->db->query("SELECT 1 FROM {$this->table} GROUP BY {$this->key} HAVING COUNT(*) > 1 LIMIT 1")->fetchColumn()===false)return;
        if($written)throw new Failure('Ilyen bejegyzés már létezik.',409);
        throw new \LogicException("The key of {$this->resource} must be unique across tenants: it has related, delegation or shared storage.");
    }
    /** Without a unique index, a write may not take a key another record holds; with one, the database refuses it. */
    private function keyFree(Context $ctx, array $values, ?array $target): void
    {
        if(!$this->keyBound()||!isset($values[$this->key])||($target&&(string)$values[$this->key]===$target['id'])||($this->keyUnique??=$this->keyIndexed($ctx->db)))return;
        $q=$ctx->db->prepare("SELECT COUNT(*) FROM {$this->table} WHERE {$this->key} = ?");$q->execute([$values[$this->key]]);
        if((int)$q->fetchColumn()>0)throw new Failure('Ilyen bejegyzés már létezik.',409);
    }
    /**
     * Registers `list`, `get`, optional `create`/`update` and the list view (id $id, default the resource; see
     * Registry::view() for the presentation options ($modes, $cardColumns among them), $activate, $commands, $guide, $menu, $sort, $attention, $available and the menu $icon) and returns that View.
     * $formSections, $flushSections: the section presentation of the create and update forms (Action::$formSections,
     * Action::$flushSections).
     */
    public function register(Registry $registry, string $title, bool $create = true, bool $update = true, ?string $group = null, ?ViewLayout $layout = null, bool $selection = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false, string|array|null $activate = null, ?string $id = null, array $commands = [], ?string $guide = null, bool $menu = true, ?array $sort = null, ?array $attention = null, ?array $modes = null, ?int $cardColumns = null, string $formSections = 'panels', bool $flushSections = false, ?\Closure $available = null, ?array $emphasis = null, ?string $icon = null): View
    {
        $this->registry=$registry;
        if($this->tenantSingleton)$create=false;
        $registry->registerFields($this->resource,$this->fields);
        $mapped = [];
        $known = array_column($this->fields, null, 'name');
        foreach ($this->related as $storage) {
            if (!$storage instanceof RelatedStorage && !$storage instanceof RelatedSet) throw new \InvalidArgumentException('Invalid related storage.');
            foreach ($storage->fields as $field => $column) {
                if (!isset($known[$field]) || isset($mapped[$field]) || isset($this->computed[$field]) || isset($this->counts[$field]) || $field === $this->key || $field === $this->ownerColumn || isset($this->defaults[$field]) || ($known[$field]->validation['unique'] ?? false) || in_array($field, array_merge(...$this->unique ?: [[]]), true)) throw new \InvalidArgumentException('Invalid related field mapping.');
                $mapped[$field] = true;
            }
        }
        if($this->tenantColumn!==null)$registry->scopeToTenant($this->resource,$this->sharedTenant,$this->sharedRoles,$this->tenantSingleton);
        if($this->counts)$registry->counts($this->resource,$this->counts);
        if($this->delegation!==null){
            // Ownership keys are stored columns of this table only; the outer row is never one of the link tables.
            $stored=[$this->key,...array_keys($this->defaults),...($this->ownerColumn?[$this->ownerColumn]:[]),...array_map(static fn($f)=>$f->name,array_filter($this->fields,fn($f)=>!$f->secret&&$f->type!=='password'&&!isset($this->computed[$f->name])&&!isset($this->counts[$f->name])&&!isset($mapped[$f->name])))];
            foreach([...$this->delegation->read,...$this->delegation->write] as $link){
                if(!in_array($link->resourceColumn,$stored,true))throw new \InvalidArgumentException('Invalid delegation resource column: '.$this->resource.'.'.$link->resourceColumn);
                foreach([$link->table,$link->via?->table] as $table)if($table!==null&&strcasecmp($table,$this->table)===0)throw new \InvalidArgumentException('A delegation link table is not the resource table: '.$this->resource);
            }
            $registry->delegate($this->resource,new DelegationScope($this->delegation,$this->resource,$this->table,$this->key,
                fn()=>"({$this->where})".($this->archive()?' AND archived_at IS NULL':''),fn(Context $c,string $id)=>$this->target($c,$id),$registry,$create?['create']:[]));
        }
        $source=new ListSource($this->resource,$this->table,$this->key,$this->fields,$this->ownerColumn,$this->where,fn($c,$row)=>$this->project($c,$row,'list'),fn($c)=>$this->source($c),$this->search,$registry,$this->tenantColumn,order:$this->order,counts:$this->counts);
        // The cursor API only: a list takes no object id (the removed offset paging used one).
        $registry->add(new Action($this->resource,'list','Lista',[],fn(Context $c,$t,$values)=>($t['id']??'')==='' ? $source->read($c,$values) : throw new Failure('Hibás lapozás.'),collection:true,listSource:$source));
        $registry->add(new Action($this->resource,'get','Megnyitás',[],fn(Context $c,$t)=>$source->counted($c,$source->media($c,[$this->project($c,$t['row'],'get')]))[0],resolve:fn($c,$id)=>$this->target($c,$id)));
        $actions=['get'];
        $writable=array_values(array_filter($this->fields,fn($f)=>!in_array($f->name,$this->readOnly,true)));
        if($create) {
            $registry->add(new Action($this->resource,'create','Új', $writable, fn($c,$t,$v)=>$this->save($c,null,$v),resolve:fn($c)=>['id'=>null,'owner'=>$this->ownerColumn?$c->actor->id:null,...($this->sharedTenant!==null&&($this->realm($c)['write']??null)===$this->sharedTenant?['audit'=>['shared'=>true]]:[])],write:true,formSections:$formSections,flushSections:$flushSections));
            $actions[]='create';
        }
        if($update) {
            $fixed=fn($f)=>in_array($f->name,$this->createOnly,true);
            $changeable=array_values(array_filter($writable,fn($f)=>!$fixed($f)));
            $registry->add(new Action($this->resource,'update','Mentés',[...$changeable,new Field('revision','Verzió',required:true,max:64)],fn($c,$t,$v)=>$this->save($c,$t,$v),resolve:fn($c,$id)=>$this->target($c,$id),write:true,editHandler:fn($c,$t,$v)=>$this->save($c,$t,$v,true),bulk:(bool) array_filter($changeable,static fn($field)=>$field->bulk),display:array_values(array_filter($writable,$fixed)),formSections:$formSections,flushSections:$flushSections));
            $actions[]='update';
            if($this->order){
                $registry->add(new Action($this->resource,'move','Áthelyezés',[new Field('before','Elé',max:100),new Field('revision','Verzió',required:true,max:64)],fn($c,$t,$v)=>$this->move($c,$t,$v),resolve:fn($c,$id)=>$this->target($c,$id),write:true,channels:['ui']));
                $actions[]='move';
            }
        }
        return $registry->view($this->resource,$title,array_values(array_map(static fn($f)=>['id'=>$f->name,'header'=>$f->label],array_filter($this->fields,static fn($f)=>!$f->scopeOnly&&!$f->stored()))),$actions,singleton:$this->tenantSingleton,group:$group,layout:$layout,selection:$selection,rowSelection:$rowSelection,rowHeight:$rowHeight,tileMinWidth:$tileMinWidth,tiles:$tiles,activate:$activate,id:$id,commands:$commands,guide:$guide,menu:$menu,sort:$sort,attention:$attention,modes:$modes,cardColumns:$cardColumns,icon:$icon,available:$available,emphasis:$emphasis);
    }
    /**
     * Bulk-capable delete with the definition's policy: `delete` (default; needs no extra columns) removes the row and its
     * related storage; `archive` (recommended for new development) needs the consumer columns `archived_at` (NULL) and
     * `archived_by` and hides the row from every framework read. `preview: '1'` changes nothing and returns
     * `{count: 1, usages}` of the registered UsageProviders; an applied delete calls their clear() and reports `cleared`.
     */
    public function registerDelete(Registry $registry, string $deletePolicy = 'delete'):void
    {
        if(!in_array($deletePolicy,self::DELETE_POLICIES,true)||$this->tenantSingleton)throw new \InvalidArgumentException('Invalid delete policy.');
        $this->deletePolicy=$deletePolicy;
        $this->registry??=$registry;
        $registry->add(new Action($this->resource,'delete','Törlés',[new Field('revision','Verzió',required:true,max:64),new Field('preview','Előnézet','checkbox')],function(Context $ctx,array $target,array $values) use ($registry):array{
            if(!hash_equals($this->revision($target['row']),$values['revision']))throw new Failure('Az adat közben módosult.',409);
            if($this->deleteGuard)($this->deleteGuard)($ctx,$target);
            $providers=$registry->usageProviders($this->resource);
            $usages=Usages::count($ctx,$providers,[$target['id']]);
            // The preview changes nothing; it is journaled as `delete_preview` (ACL decision on `delete`).
            if(($values['preview']??'0')==='1')return ['count'=>1,'usages'=>$usages,'audit_action'=>'delete_preview'];
            [$inTenant,$tenantValue]=$this->rowTenant($ctx,$target['row']);
            if($this->archive()){
                $q=$ctx->db->prepare("UPDATE {$this->table} SET archived_at=?, archived_by=? WHERE {$this->key}=?$inTenant AND archived_at IS NULL");$q->execute([gmdate('Y-m-d\\TH:i:s\\Z'),substr($ctx->actor->id,0,64),$target['id'],...$tenantValue]);
            }else{
                foreach ($this->related as $storage) $storage->delete($ctx->db,$target['id']);
                $q=$ctx->db->prepare("DELETE FROM {$this->table} WHERE {$this->key}=?$inTenant");$q->execute([$target['id'],...$tenantValue]);
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
    /** A statement's condition on $row's own tenant: the framework never assumes a key is unique across tenants (FB-0258). */
    private function rowTenant(Context $ctx, array $row, string $alias = ''): array
    {
        if($this->tenantColumn===null)return ['',[]];
        return [" AND $alias{$this->tenantColumn} = ?",[$row[$this->tenantColumn] ?? $this->realm($ctx)['write']]];
    }
    /** The active tenant's record of a tenant singleton; without a row, its defaults under `new` until the first save. */
    private function singleton(Context $ctx, ?string $id): array
    {
        if($id!=='self')throw new Failure('Nem található objektum.',404);
        $tenant=$this->realm($ctx)['write'];
        // The ACL object is the tenant's key, as in the list; `self` is only the address. On MySQL the locking read comes
        // first: a plain read would fix the snapshot before a lock wait, and what the save reads next would be stale.
        $q=$ctx->db->prepare("SELECT * FROM {$this->table} WHERE {$this->key} = ?".($ctx->db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''));
        $q->execute([$tenant]);$row=$q->fetch(\PDO::FETCH_ASSOC);
        if(!$row)return ['id'=>'self','acl_id'=>(string)$tenant,'owner'=>null,'new'=>true,'row'=>[...array_column(array_map(static fn($f)=>['name'=>$f->name,'value'=>$f->defaultValue],$this->fields),'value','name'),...$this->defaults,$this->key=>$tenant]];
        if($this->computed){
            $q=$ctx->db->prepare('SELECT '.implode(', ',array_map(static fn($name,$sql)=>"CAST(($sql) AS CHAR) AS `$name`",array_keys($this->computed),$this->computed))." FROM {$this->table} blade_base WHERE blade_base.{$this->key} = ?");
            $q->execute([$tenant]);$row=array_replace($row,$q->fetch(\PDO::FETCH_ASSOC)?:[]);
        }
        return ['id'=>'self','acl_id'=>(string)$tenant,'owner'=>null,'row'=>$row];
    }
    public function target(Context $ctx, ?string $id): array
    {
        if($this->tenantSingleton)return $this->singleton($ctx,$id);
        if($this->selfOnly) { if($id!==$ctx->actor->id && $id!=='self')throw new Failure('Csak a saját profil érhető el.',403); $id=$ctx->actor->id; }
        if($id===null || !preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$id)) throw new Failure('Hiányzó objektum.',404);
        $this->archiveReady($ctx->db);
        $this->keyReady($ctx);
        $tenants=$this->realm($ctx)['read']??[];
        $q=$ctx->db->prepare("SELECT * FROM {$this->table} WHERE {$this->key} = ? AND ({$this->where})".($tenants?" AND {$this->tenantColumn} IN (".implode(',',array_fill(0,count($tenants),'?')).')':'').($this->archive()?' AND archived_at IS NULL':'').($ctx->db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''));
        $q->execute([$id,...$tenants]); $row=$q->fetch(\PDO::FETCH_ASSOC);
        if(!$row)throw new Failure('Nem található objektum.',404);
        if($this->computed){
            [$inTenant,$tenantValue]=$this->rowTenant($ctx,$row,'blade_base.');
            $q=$ctx->db->prepare('SELECT '.implode(', ',array_map(static fn($name,$sql)=>"CAST(($sql) AS CHAR) AS `$name`",array_keys($this->computed),$this->computed))." FROM {$this->table} blade_base WHERE blade_base.{$this->key} = ?$inTenant");
            $q->execute([$row[$this->key],...$tenantValue]);$row=array_replace($row,$q->fetch(\PDO::FETCH_ASSOC)?:[]);
        }
        foreach ($this->related as $storage) $row = array_replace($row, $storage->read($ctx->db, (string)$row[$this->key]));
        // A shared row: the executor refuses its write actions with a tenant, and the journal records it as shared.
        return ['id'=>(string)$row[$this->key],'owner'=>$this->ownerColumn?(string)$row[$this->ownerColumn]:null,'row'=>$row,...($this->shared($row)?['shared'=>true,'audit'=>['shared'=>true]]:[])];
    }
    public function project(Context $ctx,array $row,string $action): array
    {
        // $id is the ACL object; a tenant singleton answers with its address `self` instead of the key.
        $id=(string)$row[$this->key];$owner=$this->ownerColumn?(string)$row[$this->ownerColumn]:null;
        $out=['id'=>$this->tenantSingleton?'self':$id,'revision'=>$this->revision($row)];
        // A count field the actor may read gets its value from ListSource::counted() (left out when it cannot be counted).
        foreach($this->fields as $field) if(!$field->secret && $ctx->acl->fieldAllowed($ctx->actor->id,$this->resource,$action,$ctx->channel,$id,$owner,$field->name))$out[$field->name]=isset($this->counts[$field->name])?null:$row[$field->name];
        // A shared row is marked; with an active tenant it offers no write action but create (Executor::sharedWrite()).
        $shared=$this->shared($row);
        if($shared)$out['_shared']=true;
        $out['_actions']=[];
        $out['_editable']=[];
        $readable=$ctx->channel!=='api'||in_array($this->resource.'.get',$ctx->scopes,true);
        foreach($this->registry?->all()??[] as $action)if($action->resource===$this->resource && !($shared && $action->write && $action->name!=='create' && $ctx->tenant!==null) && in_array($ctx->channel,$action->channels,true) && $ctx->acl->allows($ctx->actor->id,$this->resource,$action->name,$ctx->channel,$id,$owner,'',null,false,$readable))$out['_actions'][]=$action->name;
        if(in_array('update',$out['_actions'],true))foreach($this->fields as $field){
            if(($field->column['editable']??false)&&!$field->secret&&array_key_exists($field->name,$out)&&$ctx->acl->fieldAllowed($ctx->actor->id,$this->resource,'update',$ctx->channel,$id,$owner,$field->name))$out['_editable'][]=$field->name;
        }
        return $out;
    }
    private function revision(array $row): string
    {
        // Computed values and manual positions change with other records; they never make a stored revision stale.
        $columns=[$this->key,...array_diff(array_map(static fn($f)=>$f->name,$this->fields),array_keys($this->computed),array_keys($this->counts),$this->order?[$this->order['field']]:[]),...($this->ownerColumn?[$this->ownerColumn]:[])];
        return hash('sha256',json_encode(array_map(static fn($value)=>$value===null?null:(string)$value,array_intersect_key($row,array_flip($columns))),JSON_THROW_ON_ERROR));
    }
    /** SQL condition and parameters of the rows sharing $row's manual-order scope (same scope value, tenant, not archived). */
    private function orderScope(Context $ctx, array $row): array
    {
        $terms=["({$this->where})"];$params=[];
        if($this->order['scope']!==null){$terms[]="COALESCE(CAST({$this->order['scope']} AS CHAR),'') = ?";$params[]=(string)($row[$this->order['scope']]??'');}
        if(($tenant=$this->realm($ctx)['write']??null)!==null){$terms[]="{$this->tenantColumn} = ?";$params[]=$tenant;}
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
        $owner=$this->ownerColumn?", {$this->ownerColumn} AS owner":'';
        $q=$ctx->db->prepare("SELECT {$this->key} AS id, $field AS position$owner FROM {$this->table} WHERE $where ORDER BY CAST($field AS DECIMAL(65,0)), {$this->key}");$q->execute($params);
        $rows=$q->fetchAll(\PDO::FETCH_ASSOC);
        $current=array_column($rows,'position','id');
        $ids=array_values(array_filter(array_map('strval',array_column($rows,'id')),static fn($id)=>$id!==$target['id']));
        $before=(string)($values['before']??'');
        $at=$before===''?count($ids):array_search($before,$ids,true);
        if($at===false)throw new Failure('Javítsd a megjelölt mezőket.',400,['before'=>'Ez az elem nincs ebben a listában.']);
        array_splice($ids,$at,0,[$target['id']]);
        // Delegated move rules (FB-0180): every peer whose position changes must itself be movable, before any write.
        if($this->delegation!==null&&$ctx->acl->delegates($ctx->actor->id,$this->resource,'move',$ctx->channel)){
            $owners=$this->ownerColumn?array_column($rows,'owner','id'):[];
            foreach($ids as $index=>$id)if($id!==$target['id']&&(string)($current[$id]??'')!==(string)($index+1)
                &&!$ctx->acl->allows($ctx->actor->id,$this->resource,'move',$ctx->channel,(string)$id,isset($owners[$id])?(string)$owners[$id]:null))throw new Failure('Nincs hozzáférés.',403);
        }
        [$inTenant,$tenantValue]=$this->rowTenant($ctx,$target['row']);
        $update=$ctx->db->prepare("UPDATE {$this->table} SET $field = ? WHERE {$this->key} = ?$inTenant");
        foreach($ids as $index=>$id)if((string)($current[$id]??'')!==(string)($index+1))$update->execute([$index+1,$id,...$tenantValue]);
        return ['id'=>$target['id'],'position'=>$at+1,'audit'=>['before'=>$before,'position'=>$at+1]];
    }
    /**
     * Delegated create/update rules (FB-0180) against the final row $final (normalized, defaulted and server-stamped
     * values, over the stored row for an update): the object decision and the field decision of each written field.
     * The stored row of an update was checked by the executor; an unchanged destination gives the same answer.
     */
    private function delegatedWrite(Context $ctx, ?array $target, array $final, array $written): void
    {
        $name=$target?'update':'create';
        if($this->delegation===null||!$ctx->acl->delegates($ctx->actor->id,$this->resource,$name,$ctx->channel))return;
        $id=$target['id']??null;
        $owner=$this->ownerColumn?(isset($final[$this->ownerColumn])?(string)$final[$this->ownerColumn]:null):null;
        if(!$ctx->acl->allows($ctx->actor->id,$this->resource,$name,$ctx->channel,$id,$owner,'',$final))throw new Failure('Nincs hozzáférés.',403);
        $known=array_column($this->fields,null,'name');
        foreach(array_keys($written) as $field)if(isset($known[$field])&&!$ctx->acl->fieldAllowed($ctx->actor->id,$this->resource,$name,$ctx->channel,$id??'',$owner,(string)$field,$final))throw new Failure('A mező nem módosítható.',403);
    }
    public function save(Context $ctx, ?array $target, array $values, bool $fieldEdit = false): array
    {
        if($target && !hash_equals($this->revision($target['row']),$values['revision'] ?? ''))throw new Failure('Az adat közben módosult. Nyisd meg újra.',409);
        unset($values['revision']);
        $this->archiveReady($ctx->db);
        // Uniqueness is per tenant (shared rows are a tenant of their own): another tenant's values are neither visible nor in the way.
        $tenant=$this->realm($ctx)['write']??null;
        $inTenant=$tenant!==null?" AND {$this->tenantColumn} = ?":'';
        $ruleValues=$target?array_replace(array_intersect_key($target['row'],array_column($this->fields,null,'name')),$values):$values;
        if($this->guard)($this->guard)($ctx,$target,$ruleValues);
        $normalized=[];
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
        if($target&&!$allValues)throw new Failure('Nincs módosítás.');
        if($target&&!isset($target['new'])){
            $this->delegatedWrite($ctx,$target,array_replace($target['row'],$allValues),$allValues);
            // Related rows stay under the old key, where another tenant's later record would find them.
            if($this->keyBound()&&$this->related&&isset($values[$this->key])&&(string)$values[$this->key]!==$target['id'])throw new Failure('A mező nem módosítható.',409);
            $this->keyFree($ctx,$values,$target);
            [$inTenant,$tenantValue]=$this->rowTenant($ctx,$target['row']);
            if($values){$q=$ctx->db->prepare("UPDATE {$this->table} SET ".implode(',',array_map(static fn($k)=>"$k = ?",array_keys($values)))." WHERE {$this->key} = ?$inTenant");
            $q->execute([...array_values($values),$this->tenantSingleton?$target['row'][$this->key]:$target['id'],...$tenantValue]);}$id=$target['id'];
        }else{
            // The first save of a tenant singleton stores the field defaults its form showed, as the normalize hook left them.
            $shown=[];
            if($target)foreach($this->fields as $field)if($field->defaultValue!==null&&!$field->scopeOnly&&!$field->secret&&$field->type!=='password'&&!isset($this->computed[$field->name])&&(!$this->normalize||array_key_exists($field->name,$normalized)))$shown[$field->name]=$this->normalize?$normalized[$field->name]:$field->defaultValue;
            $values=array_merge($shown,$this->defaults,$values);
            if($this->keyBound()&&($values[$this->key]??null)==='')unset($values[$this->key]);
            if($this->ownerColumn && (!$this->acceptOwnerInput || !array_key_exists($this->ownerColumn,$values)))$values[$this->ownerColumn]=$ctx->actor->id;
            if($tenant!==null)$values[$this->tenantColumn]=$tenant;
            if($this->order){
                [$where,$params]=$this->orderScope($ctx,$values);
                $q=$ctx->db->prepare("SELECT COALESCE(MAX(CAST({$this->order['field']} AS DECIMAL(65,0))),0)+1 FROM {$this->table} WHERE $where");$q->execute($params);
                $values[$this->order['field']]=(int)$q->fetchColumn();
            }
            $this->delegatedWrite($ctx,null,array_replace($values,array_diff_key($allValues,$values)),$allValues);
            $this->keyFree($ctx,$values,null);
            $q=$ctx->db->prepare("INSERT INTO {$this->table} (".implode(',',array_keys($values)).') VALUES ('.implode(',',array_fill(0,count($values),'?')).')');
            try{$q->execute(array_values($values));}
            catch(\PDOException $error){
                // Two first saves of a tenant singleton (a duplicate key, or a MySQL deadlock): the later one reloads.
                if(!$target||!((string)$error->getCode()==='40001'||($error->errorInfo[1]??null)===1062||str_contains($error->getMessage(),'UNIQUE constraint')))throw $error;
                throw new Failure('Az adat közben módosult. Nyisd meg újra.',409);
            }
            // A client-chosen key is the id; lastInsertId() is then an unrelated rowid.
            $id=$target?'self':(($values[$this->key]??'')!==''?$values[$this->key]:$ctx->db->lastInsertId());
            if(!$target&&$this->keyBound()){
                $this->keyReady($ctx,true);
                // A nullable key without a value stores NULL: no record could be opened by it.
                $given=($values[$this->key]??'')!=='';
                if(!$given&&$ctx->db->query("SELECT 1 FROM {$this->table} WHERE {$this->key} IS NULL LIMIT 1")->fetchColumn()!==false)throw new Failure('Hiányzó objektum.',400);
                // Related rows follow the key as stored ('007' in an integer key is 7), found within this tenant. A generated
                // key is found by its rowid on SQLite; on MySQL lastInsertId() is 0 unless the key is AUTO_INCREMENT.
                if($this->related){
                    $sqlite=$ctx->db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='sqlite';
                    if(!$given&&!$sqlite&&(string)$id==='0')throw new \LogicException("The new key of {$this->resource} cannot be read back within its tenant.");
                    $column=!$given&&$sqlite?'rowid':$this->key;
                    $q=$ctx->db->prepare("SELECT {$this->key} FROM {$this->table} WHERE $column = ? AND {$this->tenantColumn} = ?");$q->execute([$id,$tenant]);
                    $id=$q->fetchColumn();
                    if($id===false||$id===null)throw new \LogicException("The new key of {$this->resource} cannot be read back within its tenant.");
                }
            }
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

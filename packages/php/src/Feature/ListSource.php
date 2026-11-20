<?php
declare(strict_types=1);
namespace Blade\Feature;

/** ACL-scoped keyset data source, shared by scrolling, filtering and live observation. */
final readonly class ListSource implements ListReader
{
    use ListRules;
    /** The fields with a column (the declared ones without the count fields). */
    private array $fields;
    /**
     * $search: declared name-search fields (non-secret text/textarea); $registry resolves `column.media` sources.
     * $tenant: tenant column; every read, count and watch is limited to the Context's tenant realm (Registry::realm(): the
     * active tenant and the declared shared rows, FB-0175) and fails closed without one.
     * $countWhere: trusted developer SQL that a parent's sub-view count (countBy) adds to the listing scope, for a
     * list that shows more rows than it counts (an access list counts only the accounts with access).
     * $order: manual order `{field, scope}` (SqlResource): the list is sorted by that field only, ascending by default.
     * $counts: count fields (SqlResource `counts`, FB-0173): filled by counted(), never a column to filter or sort by.
     */
    public function __construct(private string $resource,private string $table,private string $key,array $fields,private ?string $owner,private string $where,private \Closure $project, private ?\Closure $source = null, private array $search = [], private ?Registry $registry = null, private ?string $tenant = null, private string $countWhere = '1=1', public ?array $order = null, private array $counts = [])
    {
        // A count field has no column: it is never filtered, sorted or counted by.
        $this->fields=$fields=array_values(array_filter($fields,static fn($field)=>!isset($counts[$field->name])));
        if($tenant!==null&&!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$tenant))throw new \InvalidArgumentException('Invalid tenant column.');
        $known=array_column($fields,null,'name');
        if(!array_is_list($search)||count($search)>20||count(array_unique($search))!==count($search))throw new \InvalidArgumentException('Invalid list search declaration.');
        foreach($search as $name){$field=is_string($name)?($known[$name]??null):null;if(!$field||$field->secret||$field->scopeOnly||!in_array($field->type,['text','textarea'],true)||$field->media()!==null)throw new \InvalidArgumentException('Invalid list search declaration.');}
    }

    /** Binds a MediaSource predicate with uniquely prefixed parameter names. */
    private static function predicate(array $predicate,string $prefix,array &$params):string
    {
        [$sql,$bound]=$predicate;
        foreach($bound as $name=>$value){if(!is_string($name)||!preg_match('/^[a-z][a-z0-9_]*$/D',$name)||!is_scalar($value))throw new \LogicException('Media predicates bind named scalar parameters.');$params[$prefix.$name]=$value;}
        return '('.preg_replace_callback('/:([a-z][a-z0-9_]*)\b/',static fn($m)=>array_key_exists($m[1],$bound)?':'.$prefix.$m[1]:$m[0],$sql).')';
    }
    /** Quote a declared column without changing the row-source qualifier. */
    private static function column(string $name):string
    {
        if(!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$name))throw new \InvalidArgumentException('Invalid list column.');
        return '`'.$name.'`';
    }
    /** Portable NULL-last tuple comparison; the unique key breaks equal-value ties. */
    private function after(array $position,string $column,array $sort,bool $reverse,bool $inclusive,array &$params):string
    {
        $ascending=($sort['direction']==='asc')!==$reverse;
        $op=$ascending?'>':'<';$keyOp=$op.($inclusive?'=':'');$params['edge']=$position['edge'];
        $key=self::column($this->key)." $keyOp :edge";
        if($sort['field']==='id')return $key;
        if($position['value']===null)return $reverse?"($column IS NOT NULL OR ($column IS NULL AND $key))":"($column IS NULL AND $key)";
        $params['edge_value']=$position['value'];$params['edge_equal']=$position['value'];
        $comparison="($column $op :edge_value OR ($column = :edge_equal AND $key))";
        return $reverse?"($column IS NOT NULL AND $comparison)":"($column IS NULL OR $comparison)";
    }
    public function read(Context $ctx,array $input):array
    {
        $q=$this->normalise($ctx,$input);
        $limit=$q['limit'];$numbered=$q['numbered'];$sort=$q['sort'];$direction=$q['direction'];
        [$scope,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->owner,$this->qualifier($ctx));
        $terms=["($scope)","({$this->where})"];
        if($this->tenant!==null)$terms[]=$this->realm($ctx,$params) ?? throw new Failure('Nincs aktív tenant.',403);
        $totalTerms=$terms;$totalParams=$params;$known=array_column($this->fields,null,'name');
        foreach($q['conditions'] as $condition){
            $key=$condition['field'];$value=$condition['value'];$param='f'.count($params);
            if($condition['match']==='media'){
                $media=$this->registry?->mediaSource($known[$key]->media())??throw new Failure('A mező nem szűrhető.',403);
                $terms[]=self::predicate($media->classPredicate($ctx,$key,$value),$param.'_',$params);
            }elseif($condition['match']==='exact'){
                $terms[]=self::column($key)." = :$param";$params[$param]=$value;
            }else{
                $terms[]=self::column($key)." LIKE :$param ESCAPE '!'";$params[$param]='%'.str_replace(['!','%','_'],['!!','!%','!_'],$value).'%';
            }
        }
        // Declared name search: OR over the searchable fields the actor may query (none: no match), bound and escaped.
        if($q['search']!==''){
            $parts=[];
            foreach($q['searchFields'] as $index=>$name){$parts[]=self::column($name)." LIKE :s$index ESCAPE '!'";$params['s'.$index]='%'.str_replace(['!','%','_'],['!!','!%','!_'],$q['search']).'%';}
            $terms[]='('.($parts?implode(' OR ',$parts):'1=0').')';
        }
        $storageColumn=$sort['field']==='id'?$this->key:$sort['field'];
        $quotedColumn=self::column($storageColumn);
        $column=($known[$sort['field']]->type??'')==='number'?"CAST($quotedColumn AS DECIMAL(65,0))":$quotedColumn;
        $baseTerms=$terms;$baseParams=$params;
        $from=$this->source?($this->source)($ctx):$this->table;
        $count=static function(array $terms,array $params)use($ctx,$from):int{
            $query=$ctx->db->prepare("SELECT COUNT(*) FROM $from WHERE ".implode(' AND ',$terms));$query->execute($params);return (int)$query->fetchColumn();
        };
        $total=$count($totalTerms,$totalParams);$matched=$q['narrowed']?$count($baseTerms,$baseParams):$total;
        $hasCursor=$q['position']!==null;
        if($hasCursor)$terms[]=$this->after($q['position'],$column,$sort,$direction==='previous',$q['inclusive'],$params);
        $ascending=($sort['direction']==='asc')!==($direction==='previous');$order=$ascending?'ASC':'DESC';
        $ordering=$sort['field']==='id'?self::column($this->key)." $order":"($column IS NULL) ".($direction==='previous'?'DESC':'ASC').", $column $order, ".self::column($this->key)." $order";
        $q=$ctx->db->prepare("SELECT * FROM $from WHERE ".implode(' AND ',$terms)." ORDER BY $ordering LIMIT ".($limit+1));$q->execute($params);
        $rows=$q->fetchAll(\PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);if($direction==='previous')$rows=array_reverse($rows);
        $position=fn($row)=>['edge'=>(string)$row[$this->key],'sort'=>$sort,'value'=>$row[$storageColumn]??null];
        $first=$rows?$position($rows[0]):null;$last=$rows?$position($rows[count($rows)-1]):null;
        $offset=0;
        if($numbered&&$first!==null&&($hasCursor||$direction==='previous')){
            $before=$this->after($first,$column,$sort,true,false,$baseParams);
            $rank=$ctx->db->prepare("SELECT COUNT(*) FROM $from WHERE ".implode(' AND ',[...$baseTerms,$before]));$rank->execute($baseParams);
            $offset=(int)$rank->fetchColumn();
        }
        $items=$this->counted($ctx,$this->subviews($ctx,$this->media($ctx,array_map(fn($row)=>($this->project)($ctx,$row),$rows))));
        return ['total'=>$total,'matched'=>$matched,'items'=>array_map(fn($item,$row,$index)=>[...$item,'_position'=>$position($row),...($numbered?['_number'=>$offset+$index+1]:[])],$items,$rows,array_keys($rows)),
            'previous'=>$first!==null&&($direction==='previous'?$more:$hasCursor)?$this->cursor($first,'previous'):null,
            'next'=>$last!==null&&($direction==='previous'?$hasCursor:$more)?$this->cursor($last,'next'):null];
    }
    /**
     * Listable records (list ACL predicate, `where`, $countWhere, tenant, row source with the archive policy) whose `$match`
     * fields equal a value of $values, once per value even when several fields match, with the fixed exact $filters;
     * keyed by value. Null when the actor has no `list` here, a needed tenant is missing, or a field is not queryable.
     */
    public function countMatching(Context $ctx,array $match,array $values,array $filters):?array
    {
        $known=array_column($this->fields,null,'name');
        if(!$this->listable($ctx))return null;
        foreach([...$match,...array_keys($filters)] as $name){$field=$known[$name]??null;if(!$field||$field->secret||!$this->queryable($ctx,(string)$name))return null;}
        // Without any list allow (or with a deny of the whole action) nothing is counted: no value rather than 0.
        $rules=$ctx->acl->rules($ctx->actor->id,$this->resource,'list',$ctx->channel);
        if(!array_filter($rules,static fn($r)=>$r['effect']==='allow'&&$r['field_name']==='')||array_filter($rules,static fn($r)=>$r['effect']==='deny'&&$r['scope']==='all'&&$r['field_name']===''))return null;
        [$scope,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->owner,$this->qualifier($ctx));
        $terms=["($scope)","({$this->where})","({$this->countWhere})"];
        if($this->tenant!==null&&($terms[]=$this->realm($ctx,$params))===null)return null;
        $i=0;foreach($filters as $name=>$value){$terms[]="COALESCE(CAST(".self::column($name)." AS CHAR),'') = :blade_cf$i";$params["blade_cf$i"]=(string)$value;$i++;}
        $on=implode(' OR ',array_map(static fn($name)=>"CAST(".self::column($name)." AS CHAR) = blade_values.blade_v",$match));
        $from=$this->source?($this->source)($ctx):$this->table;
        $out=[];
        // At most 200 values per query: SQLite allows 500 terms in one compound SELECT, a watch window has up to 600 rows.
        foreach(array_chunk(array_values(array_unique(array_map('strval',$values))),200) as $chunk){
            $rows=[];$bound=$params;
            foreach($chunk as $j=>$value){$rows[]="SELECT :blade_cv$j AS blade_v";$bound["blade_cv$j"]=$value;}
            $q=$ctx->db->prepare("SELECT blade_values.blade_v AS blade_parent, COUNT(*) AS blade_count FROM $from JOIN (".implode(' UNION ALL ',$rows).") blade_values ON ($on) WHERE ".implode(' AND ',$terms).' GROUP BY blade_values.blade_v');
            $q->execute($bound);
            foreach($q->fetchAll(\PDO::FETCH_ASSOC) as $row)$out[(string)$row['blade_parent']]=(int)$row['blade_count'];
        }
        return $out;
    }
    /**
     * The tenant condition of $ctx (bound into $params): the tenant column within the values of its realm (the active
     * tenant, and the shared rows when declared), or null when $ctx has no realm here. Without a registry: the active tenant.
     */
    private function realm(Context $ctx,array &$params):?string
    {
        try{$realm=$this->registry?->realm($ctx,$this->resource);}catch(Failure){return null;}
        $values=$realm['read']??($ctx->tenant!==null?[$ctx->tenant]:null);
        if($values===null)return null;
        $in=[];foreach($values as $i=>$value){$in[]=":blade_tenant$i";$params["blade_tenant$i"]=$value;}
        return self::column($this->tenant)." IN (".implode(',',$in).')';
    }
    /**
     * The name that qualifies the outer row in correlated scope SQL (delegated rules, FB-0180): the alias of the
     * resource's row source, or the bare table; null for another source.
     */
    private function qualifier(Context $ctx):?string
    {
        $from=$this->source?($this->source)($ctx):$this->table;
        if(str_ends_with($from,') blade_source'))return 'blade_source';
        return preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$from)?$from:null;
    }
    /** Whether this source counts only part of its listed rows (`$countWhere`): a parent's sub-view then always expands. */
    public function countsPart():bool { return $this->countWhere!=='1=1'; }
    /** Whether the channel of $ctx may call this resource's `list` (an API token also needs that scope), as the executor requires. */
    private function listable(Context $ctx):bool
    {
        try{$list=$this->registry?->get($this->resource,'list');}catch(Failure){return false;}
        return $list!==null&&in_array($ctx->channel,$list->channels,true)&&($ctx->channel!=='api'||in_array($this->resource.'.list',$ctx->scopes,true));
    }
    /** Listable records per $field value among $values (string keys); null when $field is not queryable here or on this channel. */
    public function countBy(Context $ctx,string $field,array $values):?array
    {
        $known=array_column($this->fields,null,'name')[$field]??null;
        if(!$known||$known->secret||!$this->queryable($ctx,$field)||($this->registry&&!$this->listable($ctx)))return null;
        [$scope,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->owner,$this->qualifier($ctx));
        $terms=["($scope)","({$this->where})","({$this->countWhere})"];
        if($this->tenant!==null&&($terms[]=$this->realm($ctx,$params))===null)return null;
        // A hierarchy child lists its top-level records only (as its view does), so only those are counted.
        $own=$this->registry?->subviewOf($this->resource);
        if($own&&$own['child']===$this->resource&&$own['field']!==$field)$terms[]="COALESCE(CAST(".self::column($own['field'])." AS CHAR),'') = ''";
        $in=[];foreach(array_values(array_unique($values)) as $i=>$value){$in[]=":blade_sv$i";$params["blade_sv$i"]=$value;}
        $from=$this->source?($this->source)($ctx):$this->table;
        $column=self::column($field);
        $q=$ctx->db->prepare("SELECT CAST($column AS CHAR) AS blade_parent, COUNT(*) AS blade_count FROM $from WHERE ".implode(' AND ',$terms)." AND CAST($column AS CHAR) IN (".implode(',',$in).") GROUP BY CAST($column AS CHAR)");
        $q->execute($params);
        $out=[];foreach($q->fetchAll(\PDO::FETCH_ASSOC) as $row)$out[(string)$row['blade_parent']]=(int)$row['blade_count'];
        return $out;
    }
}

<?php
declare(strict_types=1);
namespace Blade\Feature;

/** ACL-scoped keyset data source, shared by scrolling, filtering and live observation. */
final readonly class ListSource
{
    /**
     * $search: declared name-search fields (non-secret text/textarea); $registry resolves `column.media` sources.
     * $tenant: tenant column; every read, count and watch is limited to the Context's tenant and fails closed without one.
     * $countWhere: trusted developer SQL that a parent's sub-view count (countBy) adds to the listing scope, for a
     * list that shows more rows than it counts (an access list counts only the accounts with access).
     */
    public function __construct(private string $resource,private string $table,private string $key,private array $fields,private ?string $owner,private string $where,private \Closure $project, private ?\Closure $source = null, private array $search = [], private ?Registry $registry = null, private ?string $tenant = null, private string $countWhere = '1=1')
    {
        if($tenant!==null&&!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$tenant))throw new \InvalidArgumentException('Invalid tenant column.');
        $known=array_column($fields,null,'name');
        if(!array_is_list($search)||count($search)>20||count(array_unique($search))!==count($search))throw new \InvalidArgumentException('Invalid list search declaration.');
        foreach($search as $name){$field=is_string($name)?($known[$name]??null):null;if(!$field||$field->secret||!in_array($field->type,['text','textarea'],true)||$field->media()!==null)throw new \InvalidArgumentException('Invalid list search declaration.');}
    }

    public function filterDefinitions(Context $ctx):array
    {
        $out=[];
        foreach($this->fields as $field){
            if($field->secret||in_array($field->type,['textarea','multiselect'],true)||!$this->queryable($ctx,$field->name))continue;
            if($field->media()!==null){
                // A media column filters by MIME class; without a registered source it is not filterable.
                $media=$this->registry?->mediaSource($field->media());
                if($media)$out[]=[...$field->metadata($ctx),'type'=>'select','options'=>array_map(\Blade\I18n\Translator::text(...),$media->classes())];
                continue;
            }
            $out[]=$field->metadata($ctx);
        }
        return $out;
    }
    /** Declared search fields the actor may query; null when none (the view then offers no search). */
    public function searchMetadata(Context $ctx):?array
    {
        $fields=$this->searchable($ctx);
        return $fields?['fields'=>$fields]:null;
    }
    private function searchable(Context $ctx):array { return array_values(array_filter($this->search,fn($name)=>$this->queryable($ctx,$name))); }
    /**
     * Adds `_media[field]` to projected items: one describe() per media source and window, only for
     * fields present in the projection (field ACL); null for empty, invalid, unknown or hidden files.
     */
    public function media(Context $ctx,array $items):array
    {
        // Static image columns: a value that is not a plain image file name never reaches the browser.
        foreach($this->fields as $field)if($field->image())foreach($items as &$item)if(isset($item[$field->name])&&!Field::imageFile($item[$field->name]))$item[$field->name]='';
        unset($item);
        $groups=[];
        foreach($this->fields as $field)if($field->media()!==null)$groups[$field->media()][]=$field->name;
        foreach($groups as $resource=>$names){
            $source=$this->registry?->mediaSource($resource);$ids=[];
            if($source)foreach($items as $item)foreach($names as $name){$value=$item[$name]??null;if((is_string($value)||is_int($value))&&(string)$value!=='')$ids[(string)$value]=true;}
            $described=$ids?$source->describe($ctx,array_map('strval',array_keys($ids))):[];
            foreach($items as &$item)foreach($names as $name)if(array_key_exists($name,$item)){
                $value=$item[$name];$item['_media'][$name]=(is_string($value)||is_int($value))&&(string)$value!==''&&is_array($described[(string)$value]??null)?$described[(string)$value]:null;
            }
            unset($item);
        }
        return $items;
    }
    /** Binds a MediaSource predicate with uniquely prefixed parameter names. */
    private static function predicate(array $predicate,string $prefix,array &$params):string
    {
        [$sql,$bound]=$predicate;
        foreach($bound as $name=>$value){if(!is_string($name)||!preg_match('/^[a-z][a-z0-9_]*$/D',$name)||!is_scalar($value))throw new \LogicException('Media predicates bind named scalar parameters.');$params[$prefix.$name]=$value;}
        return '('.preg_replace_callback('/:([a-z][a-z0-9_]*)\b/',static fn($m)=>array_key_exists($m[1],$bound)?':'.$prefix.$m[1]:$m[0],$sql).')';
    }
    private function queryable(Context $ctx,string $field):bool
    {
        $rules=array_values(array_filter($ctx->acl->rules($ctx->actor->id,$this->resource,'list',$ctx->channel),static fn($r)=>$r['field_name']===$field));
        if(!$rules)return true;
        foreach($rules as $r)if($r['effect']==='deny')return false;
        return (bool)array_filter($rules,static fn($r)=>$r['effect']==='allow'&&$r['scope']==='all');
    }
    public function sortableFields(Context $ctx):array
    {
        return ['id',...array_values(array_map(static fn($field)=>$field->name,array_filter($this->fields,fn($field)=>!$field->secret&&!in_array($field->type,['textarea','multiselect'],true)&&$this->queryable($ctx,$field->name))))];
    }
    private function cursor(array $position,string $direction):string
    {
        return rtrim(strtr(base64_encode(json_encode([...$position,'direction'=>$direction],JSON_THROW_ON_ERROR)),'+/','-_'),'=');
    }
    private function boundary(mixed $token,array $sort):array
    {
        if(!is_string($token)||strlen($token)>131072)throw new Failure('Hibás kurzor.');
        try{$cursor=json_decode(base64_decode(strtr($token,'-_','+/'),true)?:'',true,flags:JSON_THROW_ON_ERROR);}catch(\Throwable){throw new Failure('Hibás kurzor.');}
        if(!is_array($cursor)||!is_string($cursor['edge']??null)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$cursor['edge'])||!in_array($cursor['direction']??null,['next','previous'],true)
            ||($cursor['sort']??['field'=>'id','direction'=>'desc'])!==$sort
            ||($sort['field']!=='id'&&(!array_key_exists('value',$cursor)||(!is_null($cursor['value'])&&!is_scalar($cursor['value'])))))throw new Failure('Hibás rendezési kurzor.');
        return $cursor;
    }
    /** Portable NULL-last tuple comparison; the unique key breaks equal-value ties. */
    private function after(array $position,string $column,array $sort,bool $reverse,bool $inclusive,array &$params):string
    {
        $ascending=($sort['direction']==='asc')!==$reverse;
        $op=$ascending?'>':'<';$keyOp=$op.($inclusive?'=':'');$params['edge']=$position['edge'];
        if($sort['field']==='id')return "{$this->key} $keyOp :edge";
        $key="{$this->key} $keyOp :edge";
        if($position['value']===null)return $reverse?"($column IS NOT NULL OR ($column IS NULL AND $key))":"($column IS NULL AND $key)";
        $params['edge_value']=$position['value'];$params['edge_equal']=$position['value'];
        $comparison="($column $op :edge_value OR ($column = :edge_equal AND $key))";
        return $reverse?"($column IS NOT NULL AND $comparison)":"($column IS NULL OR $comparison)";
    }
    public function read(Context $ctx,array $input):array
    {
        foreach($input as $key=>$v)if(!in_array($key,['mode','limit','cursor','filters','first','front','sort','anchor','numbered','search'],true))throw new Failure('Ismeretlen listaparaméter.');
        $mode=$input['mode']??'dynamic';
        if(!in_array($mode,['dynamic','watch'],true))throw new Failure('Hibás listamód.');
        $limit=$input['limit']??100;
        if(!is_int($limit)||$limit<1||$limit>($mode==='watch'?600:200))throw new Failure('Hibás listaméret.');
        $numbered=$input['numbered']??true;
        if(!is_bool($numbered))throw new Failure('Hibás sorszámozás.');
        $filters=$input['filters']??[];
        if(!is_array($filters)||count($filters)>count($this->fields))throw new Failure('Hibás szűrők.');
        [$scope,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->owner);
        $terms=["($scope)","({$this->where})"];
        if($this->tenant!==null){$terms[]="{$this->tenant} = :blade_tenant";$params['blade_tenant']=$ctx->tenant ?? throw new Failure('Nincs aktív tenant.',403);}
        $totalTerms=$terms;$totalParams=$params;$known=array_column($this->fields,null,'name');
        foreach($filters as $key=>$value){
            $field=$known[$key]??null;
            if(!$field||$field->secret||in_array($field->type,['textarea','multiselect'],true)||!$this->queryable($ctx,$key))throw new Failure('A mező nem szűrhető.',403);
            if(!is_string($value)||strlen($value)>255||str_contains($value,"\0"))throw new Failure('Hibás szűrőérték.');
            $param='f'.count($params);
            if($field->media()!==null){
                $media=$this->registry?->mediaSource($field->media())??throw new Failure('A mező nem szűrhető.',403);
                if(!array_key_exists($value,$media->classes()))throw new Failure('Hibás szűrőérték.');
                $terms[]=self::predicate($media->classPredicate($ctx,$key,$value),$param.'_',$params);
            }elseif(in_array($field->type,['select','checkbox'],true)){
                if($field->type==='checkbox'?!in_array($value,['0','1'],true):!array_key_exists($value,$field->metadata($ctx)['options']))throw new Failure('Hibás szűrőérték.');
                $terms[]="$key = :$param";$params[$param]=$value;
            }elseif($field->type==='number'){
                if(!ctype_digit($value))throw new Failure('Egész szám szükséges a szűréshez.');
                $terms[]="$key = :$param";$params[$param]=$value;
            }else{
                $terms[]="$key LIKE :$param ESCAPE '!'";$params[$param]='%'.str_replace(['!','%','_'],['!!','!%','!_'],$value).'%';
            }
        }
        // Declared name search: OR over the searchable fields the actor may query (none: no match), bound and escaped.
        $search=$input['search']??'';
        if(!is_string($search)||str_contains($search,"\0")||preg_match('//u',$search)!==1||mb_strlen($search)>100)throw new Failure('Hibás keresés.');
        $search=trim($search);
        if($search!==''){
            $parts=[];
            foreach($this->searchable($ctx) as $index=>$name){$parts[]="$name LIKE :s$index ESCAPE '!'";$params['s'.$index]='%'.str_replace(['!','%','_'],['!!','!%','!_'],$search).'%';}
            $terms[]='('.($parts?implode(' OR ',$parts):'1=0').')';
        }
        $sort=$input['sort']??['field'=>'id','direction'=>'desc'];
        if(!is_array($sort)||array_diff(array_keys($sort),['field','direction'])||!is_string($sort['field']??null)||!in_array($sort['direction']??null,['asc','desc'],true))throw new Failure('Hibás rendezés.');
        $sort=['field'=>$sort['field'],'direction'=>$sort['direction']];
        if(!in_array($sort['field'],$this->sortableFields($ctx),true))throw new Failure('A mező nem rendezhető.',403);
        $storageColumn=$sort['field']==='id'?$this->key:$sort['field'];
        $column=($known[$sort['field']]->type??'')==='number'?"CAST($storageColumn AS DECIMAL(65,0))":$storageColumn;
        $baseTerms=$terms;$baseParams=$params;
        $from=$this->source?($this->source)($ctx):$this->table;
        $count=static function(array $terms,array $params)use($ctx,$from):int{
            $query=$ctx->db->prepare("SELECT COUNT(*) FROM $from WHERE ".implode(' AND ',$terms));$query->execute($params);return (int)$query->fetchColumn();
        };
        $total=$count($totalTerms,$totalParams);$matched=$filters||$search!==''?$count($baseTerms,$baseParams):$total;
        $direction='next';$hasCursor=false;
        if($mode==='watch'){
            $front=$input['front']??true;$first=$input['first']??null;
            if(!is_bool($front)||($first!==null&&(!is_string($first)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$first))))throw new Failure('Hibás megfigyelési ablak.');
            if(!$front){
                if($first===null)throw new Failure('Hiányzó ablakhatár.');
                $position=isset($input['anchor'])?$this->boundary($input['anchor'],$sort):($sort['field']==='id'?['edge'=>$first]:throw new Failure('Hiányzó rendezési ablakhatár.'));
                if($position['edge']!==$first)throw new Failure('Eltérő ablakhatár.');
                $terms[]=$this->after($position,$column,$sort,false,true,$params);$hasCursor=true;
            }
        }elseif(($input['cursor']??null)!==null){
            $position=$this->boundary($input['cursor'],$sort);$direction=$position['direction'];
            $terms[]=$this->after($position,$column,$sort,$direction==='previous',false,$params);$hasCursor=true;
        }

        $ascending=($sort['direction']==='asc')!==($direction==='previous');$order=$ascending?'ASC':'DESC';
        $ordering=$sort['field']==='id'?"{$this->key} $order":"($column IS NULL) ".($direction==='previous'?'DESC':'ASC').", $column $order, {$this->key} $order";
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
        $items=$this->subviews($ctx,$this->media($ctx,array_map(fn($row)=>($this->project)($ctx,$row),$rows)));
        return ['total'=>$total,'matched'=>$matched,'items'=>array_map(fn($item,$row,$index)=>[...$item,'_position'=>$position($row),...($numbered?['_number'=>$offset+$index+1]:[])],$items,$rows,array_keys($rows)),
            'previous'=>$first!==null&&($direction==='previous'?$more:$hasCursor)?$this->cursor($first,'previous'):null,
            'next'=>$last!==null&&($direction==='previous'?$hasCursor:$more)?$this->cursor($last,'next'):null];
    }
    /**
     * Adds `_subview` (int) to projected items of a resource whose view has a sub-view: the number of child records
     * the same actor, channel and tenant could list with the filter {field: id} (child ACL, `where`, tenant scope),
     * one grouped COUNT per page (with the child's $countWhere). Left out when the child has no SQL list source or cannot be read with that filter.
     */
    public function subviews(Context $ctx,array $items):array
    {
        $subview=$this->registry?->subviewOf($this->resource);
        if(!$subview||!$items)return $items;
        try{$child=$this->registry->get($subview['child'],'list')->listSource;}catch(Failure){return $items;}
        $counts=$child?->countBy($ctx,$subview['field'],array_map(static fn($item)=>(string)$item['id'],$items));
        if($counts===null)return $items;
        // A child that counts only part of its rows ($countWhere) is listed even at 0: such a record always expands (`_subview_open`).
        $open=$child->countWhere!=='1=1';
        foreach($items as &$item){$item['_subview']=$counts[(string)$item['id']]??0;if($open)$item['_subview_open']=true;}
        unset($item);
        return $items;
    }
    /** Listable records per $field value among $values (string keys); null when $field is not queryable here. */
    public function countBy(Context $ctx,string $field,array $values):?array
    {
        $known=array_column($this->fields,null,'name')[$field]??null;
        if(!$known||$known->secret||!$this->queryable($ctx,$field)||($this->tenant!==null&&$ctx->tenant===null))return null;
        [$scope,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->owner);
        $terms=["($scope)","({$this->where})","({$this->countWhere})"];
        if($this->tenant!==null){$terms[]="{$this->tenant} = :blade_tenant";$params['blade_tenant']=$ctx->tenant;}
        // A hierarchy child lists its top-level records only (as its view does), so only those are counted.
        $own=$this->registry?->subviewOf($this->resource);
        if($own&&$own['child']===$this->resource&&$own['field']!==$field)$terms[]="COALESCE(CAST({$own['field']} AS CHAR),'') = ''";
        $in=[];foreach(array_values(array_unique($values)) as $i=>$value){$in[]=":blade_sv$i";$params["blade_sv$i"]=$value;}
        $from=$this->source?($this->source)($ctx):$this->table;
        $q=$ctx->db->prepare("SELECT CAST($field AS CHAR) AS blade_parent, COUNT(*) AS blade_count FROM $from WHERE ".implode(' AND ',$terms)." AND CAST($field AS CHAR) IN (".implode(',',$in).") GROUP BY CAST($field AS CHAR)");
        $q->execute($params);
        $out=[];foreach($q->fetchAll(\PDO::FETCH_ASSOC) as $row)$out[(string)$row['blade_parent']]=(int)$row['blade_count'];
        return $out;
    }
}

<?php
declare(strict_types=1);
namespace Vapa\Feature;

/** ACL-scoped keyset data source, shared by scrolling, filtering and live observation. */
final readonly class ListSource
{
    public function __construct(private string $resource,private string $table,private string $key,private array $fields,private ?string $owner,private string $where,private \Closure $project, private ?\Closure $source = null){}

    public function filterDefinitions(Context $ctx):array
    {
        $out=[];
        foreach($this->fields as $field){
            if($field->secret||$field->type==='textarea'||!$this->queryable($ctx,$field->name))continue;
            $out[]=$field->metadata($ctx);
        }
        return $out;
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
        return ['id',...array_values(array_map(static fn($field)=>$field->name,array_filter($this->fields,fn($field)=>!$field->secret&&$field->type!=='textarea'&&$this->queryable($ctx,$field->name))))];
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
        foreach($input as $key=>$v)if(!in_array($key,['mode','limit','cursor','filters','first','front','sort','anchor'],true))throw new Failure('Ismeretlen listaparaméter.');
        $mode=$input['mode']??'dynamic';
        if(!in_array($mode,['dynamic','watch'],true))throw new Failure('Hibás listamód.');
        $limit=$input['limit']??100;
        if(!is_int($limit)||$limit<1||$limit>($mode==='watch'?600:200))throw new Failure('Hibás listaméret.');
        $filters=$input['filters']??[];
        if(!is_array($filters)||count($filters)>count($this->fields))throw new Failure('Hibás szűrők.');
        [$scope,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->owner);
        $terms=["($scope)","({$this->where})"];$known=array_column($this->fields,null,'name');
        foreach($filters as $key=>$value){
            $field=$known[$key]??null;
            if(!$field||$field->secret||$field->type==='textarea'||!$this->queryable($ctx,$key))throw new Failure('A mező nem szűrhető.',403);
            if(!is_string($value)||strlen($value)>255||str_contains($value,"\0"))throw new Failure('Hibás szűrőérték.');
            $param='f'.count($params);
            if(in_array($field->type,['select','checkbox'],true)){
                if($field->type==='checkbox'?!in_array($value,['0','1'],true):!array_key_exists($value,$field->metadata($ctx)['options']))throw new Failure('Hibás szűrőérték.');
                $terms[]="$key = :$param";$params[$param]=$value;
            }elseif($field->type==='number'){
                if(!ctype_digit($value))throw new Failure('Egész szám szükséges a szűréshez.');
                $terms[]="$key = :$param";$params[$param]=$value;
            }else{
                $terms[]="$key LIKE :$param ESCAPE '!'";$params[$param]='%'.str_replace(['!','%','_'],['!!','!%','!_'],$value).'%';
            }
        }
        $sort=$input['sort']??['field'=>'id','direction'=>'desc'];
        if(!is_array($sort)||array_diff(array_keys($sort),['field','direction'])||!is_string($sort['field']??null)||!in_array($sort['direction']??null,['asc','desc'],true))throw new Failure('Hibás rendezés.');
        $sort=['field'=>$sort['field'],'direction'=>$sort['direction']];
        if(!in_array($sort['field'],$this->sortableFields($ctx),true))throw new Failure('A mező nem rendezhető.',403);
        $column=$sort['field']==='id'?$this->key:$sort['field'];
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
        $from=$this->source?($this->source)($ctx):$this->table;
        $ascending=($sort['direction']==='asc')!==($direction==='previous');$order=$ascending?'ASC':'DESC';
        $ordering=$sort['field']==='id'?"{$this->key} $order":"($column IS NULL) ".($direction==='previous'?'DESC':'ASC').", $column $order, {$this->key} $order";
        $q=$ctx->db->prepare("SELECT * FROM $from WHERE ".implode(' AND ',$terms)." ORDER BY $ordering LIMIT ".($limit+1));$q->execute($params);
        $rows=$q->fetchAll(\PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);if($direction==='previous')$rows=array_reverse($rows);
        $position=fn($row)=>['edge'=>(string)$row[$this->key],'sort'=>$sort,'value'=>$row[$column]??null];
        $first=$rows?$position($rows[0]):null;$last=$rows?$position($rows[count($rows)-1]):null;
        return ['items'=>array_map(fn($row)=>[...($this->project)($ctx,$row),'_position'=>$position($row)],$rows),
            'previous'=>$first!==null&&($direction==='previous'?$more:$hasCursor)?$this->cursor($first,'previous'):null,
            'next'=>$last!==null&&($direction==='previous'?$hasCursor:$more)?$this->cursor($last,'next'):null];
    }
}

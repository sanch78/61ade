<?php
declare(strict_types=1);
namespace Vapa\Feature;

/** ACL-scoped keyset data source, shared by scrolling, filtering and live observation. */
final readonly class ListSource
{
    public function __construct(private string $resource,private string $table,private string $key,private array $fields,private ?string $owner,private string $where,private \Closure $project){}

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
    private function cursor(string $edge,string $direction):string
    {
        return rtrim(strtr(base64_encode(json_encode(['edge'=>$edge,'direction'=>$direction],JSON_THROW_ON_ERROR)),'+/','-_'),'=');
    }
    public function read(Context $ctx,array $input):array
    {
        foreach($input as $key=>$v)if(!in_array($key,['mode','limit','cursor','filters','first','front'],true))throw new Failure('Ismeretlen listaparaméter.');
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
            if($field->type==='select'){
                if(!array_key_exists($value,$field->metadata($ctx)['options']))throw new Failure('Hibás szűrőérték.');
                $terms[]="$key = :$param";$params[$param]=$value;
            }elseif($field->type==='number'){
                if(!ctype_digit($value))throw new Failure('Egész szám szükséges a szűréshez.');
                $terms[]="$key = :$param";$params[$param]=$value;
            }else{
                $terms[]="$key LIKE :$param ESCAPE '!'";$params[$param]='%'.str_replace(['!','%','_'],['!!','!%','!_'],$value).'%';
            }
        }
        $direction='next';$hasCursor=false;$front=true;
        if($mode==='watch'){
            $front=$input['front']??true;$first=$input['first']??null;
            if(!is_bool($front)||($first!==null&&(!is_string($first)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$first))))throw new Failure('Hibás megfigyelési ablak.');
            if(!$front){if($first===null)throw new Failure('Hiányzó ablakhatár.');$terms[]="{$this->key} <= :edge";$params['edge']=$first;$hasCursor=true;}
        }elseif(($input['cursor']??null)!==null){
            $token=$input['cursor'];if(!is_string($token)||strlen($token)>500)throw new Failure('Hibás kurzor.');
            try{$cursor=json_decode(base64_decode(strtr($token,'-_','+/'),true)?:'',true,flags:JSON_THROW_ON_ERROR);}catch(\Throwable){throw new Failure('Hibás kurzor.');}
            if(!is_string($cursor['edge']??null)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$cursor['edge'])||!in_array($cursor['direction']??null,['next','previous'],true))throw new Failure('Hibás kurzor.');
            $direction=$cursor['direction'];$terms[]=$this->key.($direction==='next'?' < ':' > ').':edge';$params['edge']=$cursor['edge'];$hasCursor=true;
        }
        $q=$ctx->db->prepare("SELECT * FROM {$this->table} WHERE ".implode(' AND ',$terms)." ORDER BY {$this->key} ".($direction==='previous'?'ASC':'DESC').' LIMIT '.($limit+1));$q->execute($params);
        $rows=$q->fetchAll(\PDO::FETCH_ASSOC);$more=count($rows)>$limit;if($more)array_pop($rows);if($direction==='previous')$rows=array_reverse($rows);
        $first=$rows?(string)$rows[0][$this->key]:null;$last=$rows?(string)$rows[count($rows)-1][$this->key]:null;
        return ['items'=>array_map(fn($row)=>($this->project)($ctx,$row),$rows),
            'previous'=>$first!==null&&($direction==='previous'?$more:$hasCursor)?$this->cursor($first,'previous'):null,
            'next'=>$last!==null&&($direction==='previous'?$hasCursor:$more)?$this->cursor($last,'next'):null];
    }
}

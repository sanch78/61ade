<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * What every list source (ListReader) shares: the filter, sort and search metadata, the field ACL of a query, one
 * validation of a list read (normalise) and its cursor format, media descriptions, sub-view counts and count fields.
 * The host class has `$resource`, `$fields` (the fields with a column), `$search`, `?Registry $registry`, `?array $order`
 * and `$counts`.
 */
trait ListRules
{
    public function filterDefinitions(Context $ctx):array
    {
        $out=[];
        foreach($this->fields as $field){
            if($field->secret||$field->scopeOnly||$field->stored()||in_array($field->type,['textarea','multiselect'],true)||!$this->queryable($ctx,$field->name))continue;
            if($field->media()!==null){
                // A media column filters by MIME class (an SQL predicate of its source); without one it is not filterable.
                $media=$this instanceof ListSource?$this->registry?->mediaSource($field->media()):null;
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
    private function queryable(Context $ctx,string $field):bool
    {
        $rules=array_values(array_filter($ctx->acl->rules($ctx->actor->id,$this->resource,'list',$ctx->channel),static fn($r)=>$r['field_name']===$field));
        if(!$rules)return true;
        foreach($rules as $r)if($r['effect']==='deny')return false;
        return (bool)array_filter($rules,static fn($r)=>$r['effect']==='allow'&&$r['scope']==='all');
    }
    public function sortableFields(Context $ctx):array
    {
        if($this->order)return [$this->order['field']];
        return ['id',...array_values(array_map(static fn($field)=>$field->name,array_filter($this->fields,fn($field)=>!$field->secret&&!$field->scopeOnly&&!$field->stored()&&!in_array($field->type,['textarea','multiselect'],true)&&$this->queryable($ctx,$field->name))))];
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
    /**
     * One validation of a list read for every source. Returns `mode`, `limit`, `numbered`, `conditions` (filters, then
     * the scope: `{field, value, match}`, match `exact`, `contains` or `media`), `search` (trimmed) with `searchFields`
     * (the declared ones the actor may query), `narrowed` (a filter, scope or search applies), `sort`, and the window:
     * `position` (the cursor or watch boundary, null from the front), `direction` and `inclusive` (a watch window
     * starts at its boundary record).
     */
    private function normalise(Context $ctx,array $input):array
    {
        foreach($input as $key=>$v)if(!in_array($key,['mode','limit','cursor','filters','scope','first','front','sort','anchor','numbered','search'],true))throw new Failure('Ismeretlen listaparaméter.');
        $mode=$input['mode']??'dynamic';
        if(!in_array($mode,['dynamic','watch'],true))throw new Failure('Hibás listamód.');
        $limit=$input['limit']??100;
        if(!is_int($limit)||$limit<1||$limit>($mode==='watch'?600:200))throw new Failure('Hibás listaméret.');
        $numbered=$input['numbered']??true;
        if(!is_bool($numbered))throw new Failure('Hibás sorszámozás.');
        $filters=$input['filters']??[];
        if(!is_array($filters)||count($filters)>count($this->fields))throw new Failure('Hibás szűrők.');
        $known=array_column($this->fields,null,'name');$conditions=[];
        // One condition of a filter or of the scope. A scope-only field (Field::$scopeOnly) is a scope and never a filter;
        // a scope compares exactly, also a text field.
        $condition=function(string $key,mixed $value,bool $scope)use($ctx,$known,&$conditions):void{
            $field=$known[$key]??null;
            if(!$field||$field->secret||$field->stored()||in_array($field->type,['textarea','multiselect'],true)||!$this->queryable($ctx,$key)||($field->scopeOnly&&!$scope))throw new Failure('A mező nem szűrhető.',403);
            if(!is_string($value)||strlen($value)>255||str_contains($value,"\0"))throw new Failure('Hibás szűrőérték.');
            if($field->media()!==null){
                $media=($this instanceof ListSource?$this->registry?->mediaSource($field->media()):null)??throw new Failure('A mező nem szűrhető.',403);
                if(!array_key_exists($value,$media->classes()))throw new Failure('Hibás szűrőérték.');
                $match='media';
            }elseif(in_array($field->type,['select','checkbox'],true)){
                if($field->type==='checkbox'?!in_array($value,['0','1'],true):!array_key_exists($value,$field->metadata($ctx)['options']))throw new Failure('Hibás szűrőérték.');
                $match='exact';
            }elseif($field->type==='number'){
                if(!ctype_digit($value))throw new Failure('Egész szám szükséges a szűréshez.');
                $match='exact';
            }else $match=$scope?'exact':'contains';
            $conditions[]=['field'=>$key,'value'=>$value,'match'=>$match];
        };
        foreach($filters as $key=>$value)$condition((string)$key,$value,false);
        // `scope: {field, value}`: the records of one value of a field (a scoped list, a tree's children).
        $scope=$input['scope']??null;
        if($scope!==null){
            if(!is_array($scope)||array_diff(array_keys($scope),['field','value'])||!is_string($scope['field']??null)||!array_key_exists('value',$scope)||array_key_exists($scope['field'],$filters))throw new Failure('Hibás lista-hatókör.');
            $condition($scope['field'],$scope['value'],true);
        }
        // Declared name search: OR over the searchable fields the actor may query (none: no match).
        $search=$input['search']??'';
        if(!is_string($search)||str_contains($search,"\0")||preg_match('//u',$search)!==1||mb_strlen($search)>100)throw new Failure('Hibás keresés.');
        $search=trim($search);
        $sort=$input['sort']??($this->order?['field'=>$this->order['field'],'direction'=>'asc']:['field'=>'id','direction'=>'desc']);
        if(!is_array($sort)||array_diff(array_keys($sort),['field','direction'])||!is_string($sort['field']??null)||!in_array($sort['direction']??null,['asc','desc'],true))throw new Failure('Hibás rendezés.');
        $sort=['field'=>$sort['field'],'direction'=>$sort['direction']];
        if(!in_array($sort['field'],$this->sortableFields($ctx),true))throw new Failure('A mező nem rendezhető.',403);
        $position=null;$direction='next';
        if($mode==='watch'){
            $front=$input['front']??true;$first=$input['first']??null;
            if(!is_bool($front)||($first!==null&&(!is_string($first)||!preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$first))))throw new Failure('Hibás megfigyelési ablak.');
            if(!$front){
                if($first===null)throw new Failure('Hiányzó ablakhatár.');
                $position=isset($input['anchor'])?$this->boundary($input['anchor'],$sort):($sort['field']==='id'?['edge'=>$first]:throw new Failure('Hiányzó rendezési ablakhatár.'));
                if($position['edge']!==$first)throw new Failure('Eltérő ablakhatár.');
            }
        }elseif(($input['cursor']??null)!==null){
            $position=$this->boundary($input['cursor'],$sort);$direction=$position['direction'];
        }
        return ['mode'=>$mode,'limit'=>$limit,'numbered'=>$numbered,'conditions'=>$conditions,'search'=>$search,'searchFields'=>$search===''?[]:$this->searchable($ctx),
            'narrowed'=>$filters||$scope!==null||$search!=='','sort'=>$sort,'position'=>$position,'direction'=>$direction,'inclusive'=>$mode==='watch'];
    }
    /**
     * Adds `_subview` (int) to projected items of a resource whose view has a sub-view: the number of child records
     * the same actor, channel and tenant could list with the filter {field: id} (the child source's countBy), one
     * grouped count per page. Left out when the child cannot count them (a provider list) or be read with that filter.
     */
    public function subviews(Context $ctx,array $items):array
    {
        $subview=$this->registry?->subviewOf($this->resource);
        if(!$subview||!$items)return $items;
        try{$child=$this->registry->get($subview['child'],'list')->listSource;}catch(Failure){return $items;}
        $counts=$child?->countBy($ctx,$subview['field'],array_map(static fn($item)=>(string)$item['id'],$items));
        if($counts===null)return $items;
        // A child that counts only part of its rows ($countWhere) is listed even at 0: such a record always expands (`_subview_open`).
        $open=$child instanceof ListSource&&$child->countsPart();
        foreach($items as &$item){$item['_subview']=$counts[(string)$item['id']]??0;if($open)$item['_subview_open']=true;}
        unset($item);
        return $items;
    }
    /**
     * Fills the count fields (FB-0173) of projected $items that carry them (the field ACL let them through): one grouped
     * count per field over the counted resource's list source (countMatching). An item whose `on` value it cannot read
     * and every item of a field that cannot be counted for the actor leave the field out, never a misleading 0.
     */
    public function counted(Context $ctx,array $items):array
    {
        foreach($this->counts as $name=>$count){
            $on=$count['on']??'id';
            $values=[];foreach($items as $item)if(array_key_exists($name,$item)&&isset($item[$on])&&(string)$item[$on]!=='')$values[]=(string)$item[$on];
            $counted=null;
            if($values){
                try{$source=$this->registry?->get($count['resource'],'list')->listSource;}catch(Failure){$source=null;}
                $counted=$source?->countMatching($ctx,$count['match'],$values,$count['filters']??[]);
            }
            foreach($items as &$item){
                if(!array_key_exists($name,$item))continue;
                if(!array_key_exists($on,$item)||($counted===null&&(string)$item[$on]!==''))unset($item[$name]);
                else $item[$name]=(string)$item[$on]===''?0:($counted[(string)$item[$on]]??0);
            }
            unset($item);
        }
        return $items;
    }
}

<?php
declare(strict_types=1);
namespace Blade\Feature;

/** Generic declared SQL data adapter. Business schemas and rules belong to consumers. */
final class SqlResource
{
    private ?Registry $registry=null;
    private ?ListSource $list=null;
    /** $search: declared name-search fields of the list (non-secret text/textarea, field ACL applies per actor). */
    public function __construct(private string $resource, private string $table, private string $key, private array $fields, private ?string $ownerColumn = null, private array $defaults = [], private ?\Closure $guard = null, private ?\Closure $normalize = null, private string $where = '1=1', private bool $selfOnly = false, private ?\Closure $afterSave = null, private ?\Closure $deleteGuard = null, private array $related = [], private array $readOnly = [], private array $unique = [], private bool $acceptOwnerInput = false, private array $search = [])
    {
        // Read-only fields are listed and revisioned but never part of create/update input.
        if (array_diff($readOnly, array_map(static fn($f)=>$f->name,$fields))) throw new \InvalidArgumentException('Unknown read-only field');
        // Composite unique keys: each entry lists field, default or owner columns that together must be unique.
        $declared=[...array_map(static fn($f)=>$f->name,$fields),...array_keys($defaults),...($ownerColumn?[$ownerColumn]:[])];
        foreach ($unique as $columns) if (!is_array($columns) || !array_is_list($columns) || !$columns || array_diff($columns,$declared) || count(array_unique($columns))!==count($columns)) throw new \InvalidArgumentException('Invalid unique key');
        foreach ([$table,$key,...array_keys($defaults),...array_map(static fn($f)=>$f->name,$fields),...($ownerColumn?[$ownerColumn]:[])] as $column) if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$column)) throw new \InvalidArgumentException('Invalid SQL identifier');
    }
    private function source(Context $ctx): string
    {
        if (!$this->related) return $this->table;
        $expressions = [];
        foreach ($this->related as $storage) $expressions = [...$expressions, ...$storage->expressions($ctx->db, $this->key)];
        return '(SELECT blade_base.*, '.implode(', ', $expressions)." FROM {$this->table} blade_base) blade_source";
    }
    public function register(Registry $registry, string $title, bool $create = true, bool $update = true, ?string $group = null, ?ViewLayout $layout = null, bool $selection = false, bool $rowSelection = false, ?int $rowHeight = null, ?int $tileMinWidth = null, bool $tiles = false): void
    {
        $this->registry=$registry;
        $registry->registerFields($this->resource,$this->fields);
        $mapped = [];
        $known = array_column($this->fields, null, 'name');
        foreach ($this->related as $storage) {
            if (!$storage instanceof RelatedStorage) throw new \InvalidArgumentException('Invalid related storage.');
            foreach ($storage->fields as $field => $column) {
                if (!isset($known[$field]) || isset($mapped[$field]) || $field === $this->key || $field === $this->ownerColumn || isset($this->defaults[$field]) || ($known[$field]->validation['unique'] ?? false) || in_array($field, array_merge(...$this->unique ?: [[]]), true)) throw new \InvalidArgumentException('Invalid related field mapping.');
                $mapped[$field] = true;
            }
        }
        $source=$this->list=new ListSource($this->resource,$this->table,$this->key,$this->fields,$this->ownerColumn,$this->where,fn($c,$row)=>$this->project($c,$row,'list'),fn($c)=>$this->source($c),$this->search,$registry);
        $registry->add(new Action($this->resource,'list','Lista',[],fn(Context $c,$t,$values)=>$values ? $source->read($c,$values) : $this->listing($c,$t['id']),collection:true,listSource:$source));
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
        }
        $registry->view($this->resource,$title,array_map(static fn($f)=>['id'=>$f->name,'header'=>$f->label],$this->fields),$actions,group:$group,layout:$layout,selection:$selection,rowSelection:$rowSelection,rowHeight:$rowHeight,tileMinWidth:$tileMinWidth,tiles:$tiles);
    }
    public function registerDelete(Registry $registry):void
    {
        $registry->add(new Action($this->resource,'delete','Törlés',[new Field('revision','Verzió',required:true,max:64)],function(Context $ctx,array $target,array $values):array{
            if(!hash_equals($this->revision($target['row']),$values['revision']))throw new Failure('Az adat közben módosult.',409);
            if($this->deleteGuard)($this->deleteGuard)($ctx,$target);
            foreach ($this->related as $storage) $storage->delete($ctx->db,$target['id']);
            $q=$ctx->db->prepare("DELETE FROM {$this->table} WHERE {$this->key}=?");$q->execute([$target['id']]);
            $ctx->acl->invalidate();
            if($this->afterSave)($this->afterSave)($ctx,$target['id'],$target,[]);
            return [];
        },resolve:fn($c,$id)=>$this->target($c,$id),write:true,channels:['ui'],bulk:true,confirm:[
            'message' => 'A kiválasztott adat végleg törlődik.',
            'title' => 'Törlés',
            'severity' => 'danger',
            'confirm_label' => 'Törlés',
            'cancel_label' => 'Mégse',
        ]));
        foreach($registry->views() as $view)if($view['resource']===$this->resource)$registry->view($view['resource'],$view['title'],$view['columns'],[...$view['actions'],'delete'],$view['singleton'],$view['group'],$view['layout'],$view['rowNumbers'],$view['selection'],$view['icon'],$view['desktopOnly']??false,$view['rowSelection']??false,$view['rowHeight']??null,$view['tileMinWidth']??null,$view['tiles']??false);
    }
    public function target(Context $ctx, ?string $id): array
    {
        if($this->selfOnly) { if($id!==$ctx->actor->id && $id!=='self')throw new Failure('Csak a saját profil érhető el.',403); $id=$ctx->actor->id; }
        if($id===null || !preg_match('/^[a-zA-Z0-9_.:-]{1,100}$/D',$id)) throw new Failure('Hiányzó objektum.',404);
        $q=$ctx->db->prepare("SELECT * FROM {$this->table} WHERE {$this->key} = ? AND ({$this->where})".($ctx->db->getAttribute(\PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':''));
        $q->execute([$id]); $row=$q->fetch(\PDO::FETCH_ASSOC);
        if(!$row)throw new Failure('Nem található objektum.',404);
        foreach ($this->related as $storage) $row = array_replace($row, $storage->read($ctx->db, (string)$row[$this->key]));
        return ['id'=>(string)$row[$this->key],'owner'=>$this->ownerColumn?(string)$row[$this->ownerColumn]:null,'row'=>$row];
    }
    private function listing(Context $ctx,?string $offset): array
    {
        if($offset!==null && (!ctype_digit($offset) || (int)$offset>10000000))throw new Failure('Hibás lapozás.');
        $offset=(int)($offset ?? 0);
        [$where,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->ownerColumn);
        $from=$this->source($ctx);
        $q=$ctx->db->prepare("SELECT * FROM $from WHERE ($where) AND ({$this->where}) ORDER BY {$this->key} DESC LIMIT 200 OFFSET $offset");$q->execute($params);
        return $this->list->media($ctx,array_map(fn($row)=>$this->project($ctx,$row,'list'),$q->fetchAll(\PDO::FETCH_ASSOC)));
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
        $columns=[$this->key,...array_map(static fn($f)=>$f->name,$this->fields),...($this->ownerColumn?[$this->ownerColumn]:[])];
        return hash('sha256',json_encode(array_map(static fn($value)=>$value===null?null:(string)$value,array_intersect_key($row,array_flip($columns))),JSON_THROW_ON_ERROR));
    }
    public function save(Context $ctx, ?array $target, array $values, bool $fieldEdit = false): array
    {
        if($target && !hash_equals($this->revision($target['row']),$values['revision'] ?? ''))throw new Failure('Az adat közben módosult. Nyisd meg újra.',409);
        unset($values['revision']);
        $ruleValues=$target?array_replace(array_intersect_key($target['row'],array_column($this->fields,null,'name')),$values):$values;
        if($this->guard)($this->guard)($ctx,$target,$ruleValues);
        if($this->normalize){$normalized=($this->normalize)($ctx,$target,$ruleValues);$values=$target?array_intersect_key($normalized,$values):$normalized;}
        foreach ($this->fields as $field) {
            if (!($field->validation['unique'] ?? false) || !isset($values[$field->name]) || $values[$field->name] === '') continue;
            $sql = "SELECT {$this->key} FROM {$this->table} WHERE {$field->name} = ?";
            $params = [$values[$field->name]];
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
            $sql = "SELECT {$this->key} FROM {$this->table} WHERE ".implode(' AND ', $conditions);
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

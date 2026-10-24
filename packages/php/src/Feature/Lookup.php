<?php
declare(strict_types=1);
namespace Blade\Feature;

/**
 * Relation choices use the same object and field ACL as ordinary queries. $hideArchived: the table belongs to a
 * resource deleting with policy `archive` (SqlResource::registerDelete); its archived rows are no choices.
 */
final readonly class Lookup
{
    public function __construct(private string $resource,private string $table,private string $key,private string $label,private ?string $owner=null,private string $where='1=1',private array $extra=[],private bool $hideArchived=false)
    {
        foreach(array_filter([$table,$key,$label,$owner]) as $id)if(!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/D',$id))throw new \InvalidArgumentException('Invalid lookup schema');
    }
    public function options(Context $ctx):array
    {
        [$where,$params]=$ctx->acl->predicate($ctx->actor->id,$this->resource,'list',$ctx->channel,$this->key,$this->owner);
        $columns=implode(',',array_unique(array_filter([$this->key,$this->label,$this->owner])));
        $q=$ctx->db->prepare("SELECT $columns FROM {$this->table} WHERE ($where) AND ({$this->where})".($this->hideArchived?' AND archived_at IS NULL':'')." ORDER BY {$this->key} LIMIT 2000");$q->execute($params);$out=$this->extra;
        foreach($q->fetchAll(\PDO::FETCH_ASSOC) as $row){$id=(string)$row[$this->key];$owner=$this->owner?(string)$row[$this->owner]:null;
            if($ctx->acl->fieldAllowed($ctx->actor->id,$this->resource,'list',$ctx->channel,$id,$owner,$this->label))$out[$id]=(string)$row[$this->label];
        }
        return $out;
    }
}
